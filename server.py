#!/usr/bin/env python3
"""
小小花狮 · 一体化服务器（v2）
- 托管前端（index.html + css/ + js/）
- 内置 API 代理：/api/v1/*  →  DeepSeek（或任意 OpenAI 兼容接口）
- 局域网内手机可直接访问

启动：
    python server.py                 # 默认 0.0.0.0:8080
    python server.py --port 9000

安全说明（修复 v1 的"开放代理"问题）：
- 代理只允许 POST /api/v1/chat/completions 与 GET /api/v1/models
- 只转发白名单请求头，限制请求体大小，CORS 只回声可信来源
- 若设置了环境变量 DEEPSEEK_API_KEY，则 Key 只在服务端使用，浏览器拿不到；
  否则由浏览器在请求头里自带 Authorization（你自己的 Key 存在自己设备上）
- 可选 PROXY_TOKEN：设置后，请求需要带 X-Proxy-Token 才能使用代理
- 不托管 .env / .git 等隐藏文件与 .wrangler、.vercel 等目录，关闭目录列表

环境变量（也可写在同目录 .env 里）：
    DEEPSEEK_API_KEY   服务端 Key（可选，推荐）
    UPSTREAM_BASE      默认 https://api.deepseek.com
    PROXY_TOKEN        代理访问口令（可选）
    ALLOWED_ORIGINS    逗号分隔的额外来源白名单（可选；默认同源 + localhost + 局域网）
"""

import argparse
import json
import os
import re
import socket
import sys
import threading
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8080
MAX_BODY = 1 * 1024 * 1024          # 1 MB
UPSTREAM_TIMEOUT = 120

SYNC_LOCK = threading.Lock()     # 同步写入串行化，避免两台设备同时写坏文件
ALLOWED_PATHS = re.compile(r'^/v1/(chat/completions|models)$')
FORWARD_HEADERS = ['Content-Type', 'Authorization']
HIDDEN_PREFIXES = ('.env', '.git', '.wrangler', '.vercel', '.dsh', '.DS_Store', '.vscode', 'data')


def load_dotenv():
    """极简 .env 读取（不覆盖已存在的环境变量）"""
    path = os.path.join(HERE, '.env')
    if not os.path.isfile(path):
        return
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except OSError as e:
        print(f'  ️⚠️ 读取 .env 失败：{e}')


def allowed_origin(origin):
    """返回应回填的 Access-Control-Allow-Origin；不合法返回空串"""
    if not origin:
        return ''
    extra = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', '').split(',') if o.strip()]
    if origin in extra:
        return origin
    parts = urlsplit(origin)
    host = (parts.hostname or '').lower()
    if host in ('localhost', '127.0.0.1', '::1') or re.match(r'^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)', host):
        return origin
    return ''


SYNC_MAX_BODY = 5 * 1024 * 1024        # 同步请求体上限 5MB
SYNC_DAY_GROUPS = ('plan.checkins', 'english.dailyNew')   # 按日期分组的字段
SYNC_RE = re.compile(r'^/api/sync/([A-Za-z0-9_\-]{1,64})$')
SYNC_TOKEN_RE = re.compile(r'^/api/sync-token/([A-Za-z0-9_\-]{1,64})$')

# ---------- 同步存储（数据落在项目目录的 data/ 下，默认跳过 git）----------
DATA_DIR = os.environ.get('DATA_DIR') or os.path.join(HERE, 'data')


def _cfg_get(data, path):
    """按 "plan.checkins.2026-10-21" 这样的路径取合并结果"""
    cur = data
    for part in path.split('.'):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _cfg_set(data, path, value):
    """按路径写入（只用于已知存在的日期分组）"""
    parts = path.split('.')
    cur = data
    for part in parts[:-1]:
        nxt = cur.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[part] = nxt
        cur = nxt
    cur[parts[-1]] = value


def _is_day_path(path):
    for g in SYNC_DAY_GROUPS:
        if path.startswith(g + '.'):
            return True
    return False


def _block_versions(record, body):
    """服务器上每个"可合并块"的最新版本：
    - "分片.字段"：普通字段
    - "分片.分组.日期"：打卡/每日新词里的某一天
    """
    out = {}
    rec = record or {}
    for k, v in (rec.get('marks') or {}).items():
        try:
            out[k] = int(v)
        except (TypeError, ValueError):
            continue
    for slice_name, slice_data in (body or {}).items():
        if slice_name in ('meta', 'syncMarks', 'marks') or not isinstance(slice_data, dict):
            continue
        for group in SYNC_DAY_GROUPS:
            gs, _, gk = group.partition('.')
            if gs != slice_name or not isinstance(slice_data.get(gk), dict):
                continue
            for day in slice_data[gk].keys():
                out.setdefault(group + '.' + day, 0)   # 0 = 服务器已存在但未知修改时间
    return out


def _merge_into(base, incoming, versions):
    """两端各自只推送"本设备真实改动"的块：
    - 本地块在服务器不存在 → 接受；
    - 本地块比服务器记录的时间更新 → 接受并更新时间；
    - 否则（服务器已有且不更旧）→ 拒绝，本地回去采用服务器版本。
    """
    conflicts = []
    in_body = (incoming.get('data') or {})
    in_marks = {k: int(v) for k, v in (incoming.get('marks') or {}).items() if str(v).lstrip('-').isdigit()}
    base_body = base.setdefault('data', {})
    base_marks = base.setdefault('marks', {})

    for path, ts in in_marks.items():
        if '.' not in path:
            continue
        slice_name, rest = path.split('.', 1)
        existing_ts = versions.get(path)
        if existing_ts is not None and ts <= existing_ts:
            conflicts.append(path)
            continue

        if _is_day_path(path):
            src_day = _cfg_get(in_body, path)
            if src_day is None:
                conflicts.append(path)
                continue
            _cfg_set(base_body, path, src_day)
            base_marks[path] = ts
            versions[path] = ts
            continue

        # 普通字段：服务器已有 → 拒绝（先到先得）；否则写入
        if existing_ts is not None:
            conflicts.append(path)
            continue
        src_val = _cfg_get(in_body, path)
        if src_val is None:
            continue
        _cfg_set(base_body, path, src_val)
        base_marks[path] = ts
        versions[path] = ts

    return conflicts


def _sync_space_dir(space):
    return os.path.join(DATA_DIR, space)


def _sync_token_path(space):
    return os.path.join(DATA_DIR, space, 'token.json')


def _sync_data_path(space):
    return os.path.join(DATA_DIR, space, 'data.json')


def sync_load_token(space):
    try:
        with open(_sync_token_path(space), 'r', encoding='utf-8') as f:
            return json.load(f).get('token') or ''
    except (OSError, ValueError):
        return ''


def sync_save_token(space, token):
    os.makedirs(_sync_space_dir(space), exist_ok=True)
    tmp = _sync_token_path(space) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump({'space': space, 'token': token, 'updatedAt': _now()}, f)
    os.replace(tmp, _sync_token_path(space))


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def sync_read(space):
    try:
        with open(_sync_data_path(space), 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def sync_write(space, payload):
    os.makedirs(_sync_space_dir(space), exist_ok=True)
    tmp = _sync_data_path(space) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, _sync_data_path(space))   # 原子替换，避免写一半损坏
class Handler(SimpleHTTPRequestHandler):
    """静态文件 + 受限 API 代理"""

    server_version = 'XiaoHuaShi/2.0'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    # ---------- 静态托管安全 ----------
    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None

    def send_head(self):
        rel = os.path.relpath(self.translate_path(self.path), HERE).replace('\\', '/')
        parts = rel.split('/')
        # 同步数据目录（data/）只允许通过 /api/sync 访问，禁止直接下载
        if any(p.startswith(HIDDEN_PREFIXES) for p in parts):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        if self.path in ('', '/') or self.path.endswith('.html') or self.path.startswith('/#/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    # ---------- 路由 ----------
    def do_GET(self):
        if self._sync_route('GET'):
            return
        if self.path.startswith('/api/'):
            return self._proxy('GET')
        if self.path in ('/', ''):
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        if self._sync_route('POST'):
            return
        if self.path.startswith('/api/'):
            return self._proxy('POST')
        self.send_error(404, 'Not found')

    def do_OPTIONS(self):
        origin = allowed_origin(self.headers.get('Origin', ''))
        self.send_response(204)
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Proxy-Token')
        self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()

    # ---------- 云同步（可选）----------
    def _read_request_body(self, limit):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length > limit:
            return None
        return self.rfile.read(length) if length > 0 else b''

    def _sync_route(self, method):
        path = urlsplit(self.path).path
        mt = SYNC_TOKEN_RE.match(path)
        if mt and method == 'GET':
            # 新设备自动连接用：只返回"口令本身"，不返回任何数据
            space_name = mt.group(1)
            token = sync_load_token(space_name)
            if not token:
                self._json(404, {'error': '空间不存在'})
            else:
                self._json(200, {'space': space_name, 'token': token})
            return True
        m = SYNC_RE.match(path)
        if not m:
            return False
        space = m.group(1)
        request_token = self.headers.get('X-Sync-Token', '') or self._token_from_query()
        stored_token = sync_load_token(space)

        if method == 'GET':
            record = sync_read(space)
            if stored_token and request_token != stored_token:
                self._json(401, {'error': '口令错误'})
                return True
            if not record:
                self._json(200, {'exists': False})
                return True
            if not record.get('serverTime'):
                record['serverTime'] = _now()
            self._json(200, {
                'exists': True,
                'space': space,
                'serverTime': record.get('serverTime') or _now(),
                'savedAt': record.get('savedAt'),
                'marks': record.get('marks') or {},
                'data': {'data': record.get('data'), 'marks': record.get('marks') or {}},
            })
            return True

        body = self._read_request_body(SYNC_MAX_BODY)
        if body is None:
            self._json(413, {'error': '数据过大（上限 5MB）'})
            return True
        try:
            payload = json.loads(body.decode('utf-8')) if body else {}
        except (ValueError, UnicodeDecodeError):
            self._json(400, {'error': 'JSON 解析失败'})
            return True

        # 首次写入：允许由客户端设定口令；之后必须口令一致才能覆盖
        if not stored_token:
            new_token = payload.get('token') or request_token
            if not new_token:
                self._json(400, {'error': '首次同步需要设置口令 token 字段'})
                return True
            sync_save_token(space, new_token)
        elif request_token != stored_token:
            self._json(401, {'error': '口令错误'})
            return True

        data = payload.get('data')
        if data is None:
            self._json(400, {'error': '缺少 data 字段'})
            return True

        with SYNC_LOCK:
            existing = sync_read(space)
            incoming = {
                'data': data,
                'marks': payload.get('marks') or (data.get('syncMarks') if isinstance(data, dict) else None) or {},
            }
            if not existing:
                record = {'space': space, 'savedAt': _now(), 'data': incoming['data'], 'marks': incoming['marks']}
                conflicts = []
            else:
                versions = _block_versions(existing, existing.get('data'))
                # 先合并没有时间戳的"普通字段"（AI 配置、系统提示词等），再按标记合并"记录类"数据
                for slice_name, slice_data in list((incoming.get('data') or {}).items()):
                    if slice_name in ('meta', 'marks') or not isinstance(slice_data, dict):
                        continue
                    cur = existing.setdefault('data', {}).setdefault(slice_name, {})
                    for field, value in slice_data.items():
                        if field == 'syncMarks' or isinstance(value, (dict, list)):
                            continue
                        key = slice_name + '.' + field
                        if key in versions:
                            continue
                        if field in cur:
                            continue
                        cur[field] = value
                conflicts = _merge_into(existing, incoming, versions)
                record = existing
                record['savedAt'] = _now()
                record['marks'] = record.get('marks') or {}
                record['marks'].update(incoming['marks'])
            record['serverTime'] = _now()
            try:
                sync_write(space, record)
            except OSError as e:
                self._json(500, {'error': f'写入失败：{e}'})
                return True

        # 返回合并后的完整数据 + 被拒绝的字段（本地据此改用服务器版本）
        self._json(200, {
            'ok': True,
            'savedAt': record['savedAt'],
            'serverTime': record['serverTime'],
            'conflicts': conflicts,
            'marks': record.get('marks') or {},
            'data': {'data': record.get('data'), 'marks': record.get('marks') or {}},
        })
        return True

    def _token_from_query(self):
        from urllib.parse import parse_qs
        q = parse_qs(urlsplit(self.path).query)
        return (q.get('token') or [''])[0]
    # ---------- 代理 ----------
    def _cors(self):
        origin = allowed_origin(self.headers.get('Origin', ''))
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _proxy(self, method):
        path = self.path[4:] or '/'      # 去掉 /api 前缀
        if not ALLOWED_PATHS.match(path):
            return self._json(404, {'error': {'message': f'代理只允许 /api/v1/chat/completions 与 /api/v1/models（收到 {path}）'}})

        proxy_token = os.environ.get('PROXY_TOKEN', '')
        if proxy_token and self.headers.get('X-Proxy-Token') != proxy_token:
            return self._json(401, {'error': {'message': '代理访问口令错误（X-Proxy-Token）'}})

        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return self._json(400, {'error': {'message': 'Content-Length 非法'}})
        if length > MAX_BODY:
            return self._json(413, {'error': {'message': '请求体过大（上限 1MB）'}})
        body = self.rfile.read(length) if length > 0 else None

        upstream = os.environ.get('UPSTREAM_BASE', 'https://api.deepseek.com').rstrip('/')
        req = urllib.request.Request(upstream + path, data=body, method=method)
        server_key = os.environ.get('DEEPSEEK_API_KEY', '')
        for key in FORWARD_HEADERS:
            val = self.headers.get(key)
            if key == 'Authorization' and server_key:
                continue                # 服务端持有 Key 时忽略浏览器传来的
            if val:
                req.add_header(key, val)
        if server_key:
            req.add_header('Authorization', 'Bearer ' + server_key)
        if body and not req.has_header('Content-Type'):
            req.add_header('Content-Type', 'application/json')
        req.add_header('Accept', 'text/event-stream, application/json')

        try:
            resp = urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT)
        except urllib.error.HTTPError as e:
            data = e.read()
            print(f'  📡 API {method} {path} → HTTP {e.code}')
            self.send_response(e.code)
            self._cors()
            self.send_header('Content-Type', e.headers.get('Content-Type', 'application/json'))
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        except (urllib.error.URLError, socket.timeout, OSError) as e:
            print(f'  ❌ API 代理失败：{e}')
            return self._json(502, {'error': {'message': f'上游连接失败：{e}'}})

        with resp:
            ctype = resp.headers.get('Content-Type', 'application/json')
            self.send_response(resp.status)
            self._cors()
            self.send_header('Content-Type', ctype)
            self.send_header('Cache-Control', 'no-store')
            if 'event-stream' in ctype.lower():
                # 流式：边读边写，保证"逐字显示"
                self.send_header('X-Accel-Buffering', 'no')
                self.end_headers()
                while True:
                    chunk = resp.read(1) if not hasattr(resp, 'read1') else resp.read1(2048)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            else:
                data = resp.read()
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

    def log_message(self, fmt, *args):
        msg = fmt % args
        if '/api/sync/' in msg or '/api/sync-token/' in msg:
            print(f'  🔄 {msg}')
        elif '/api/' in msg:
            print(f'  📡 {msg}')
        elif '.png' in msg or '.ico' in msg:
            return
        else:
            print(f'  📄 {msg}')


def get_local_ip():
    """获取本机局域网 IP（不依赖外网连通性）"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
        finally:
            s.close()
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return '127.0.0.1'


def main():
    # Windows 控制台/管道默认 GBK，统一改成 UTF-8 输出，避免 emoji 打印崩溃
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass

    parser = argparse.ArgumentParser(description='小小花狮 · 本地/局域网服务器')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', DEFAULT_PORT)))
    parser.add_argument('--host', default='0.0.0.0')
    args = parser.parse_args()

    load_dotenv()
    os.chdir(HERE)
    ip = get_local_ip()

    upstream = os.environ.get('UPSTREAM_BASE', 'https://api.deepseek.com').rstrip('/')
    key_state = '✅ 服务端已配置（浏览器无需填写 Key）' if os.environ.get('DEEPSEEK_API_KEY') else 'ℹ️ 未配置，可在各设备设置里自填 DeepSeek Key'

    print('=' * 58)
    print('  🦁  小小花狮 · 工作台服务器 v2')
    print('=' * 58)
    print(f'  本机访问 : http://localhost:{args.port}')
    if ip != '127.0.0.1':
        print(f'  手机访问 : http://{ip}:{args.port}')
    print(f'  代理上游 : {upstream}/v1/chat/completions')
    print(f'  DeepSeek : {key_state}')
    if os.environ.get('PROXY_TOKEN'):
        print('  代理口令 : 已启用（浏览器设置里填同一个 X-Proxy-Token 即可）')
    print()
    print('  手机使用 : 同一 WiFi 下打开手机地址 → 浏览器菜单「安装应用 / 添加到主屏幕」')
    print('  停止服务 : 按 Ctrl+C')
    print('=' * 58)

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n服务器已停止。')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    sys.exit(main())
