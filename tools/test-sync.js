/*!
 * 同步逻辑集成测试：拉起真实的 server.py（随机端口 + 独立数据目录），用 Node 模拟多台浏览器。
 * 用法：node tools/test-sync.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const PORT = 18000 + Math.floor(Math.random() * 900);
const DATA_DIR = path.join(os.tmpdir(), 'xhsh-sync-test-' + Date.now());
let child = null;
let fails = 0;

const check = (name, cond, extra) => {
  if (cond) console.log('  ✅ ' + name);
  else { fails++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
};

function startServer() {
  return new Promise((resolve) => {
    child = spawn(process.env.PYTHON || 'python', ['server.py', '--port', String(PORT)], {
      cwd: root, env: Object.assign({}, process.env, { DATA_DIR, PYTHONIOENCODING: 'utf-8' })
    });
    child.stdout.on('data', () => resolve());
    setTimeout(resolve, 2500);
  });
}

function raw(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opts && opts.body;
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: (opts && opts.method) || 'GET',
      headers: Object.assign({}, (opts && opts.headers) || {}, body ? { 'Content-Length': Buffer.byteLength(body) } : {})
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ ok: res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(d || '{}')) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeClient(name) {
  const store = new Map();
  const el = () => ({ textContent: '', value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, querySelectorAll: () => [], querySelector: () => null, remove() {}, dataset: {} });
  const sb = {
    console: { log() { }, warn() { }, error() { } },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => Array.from(store.keys())[i], get length() { return store.size; } },
    document: { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], createElement: () => el(), addEventListener() {}, body: { appendChild() {} }, documentElement: { setAttribute() {} }, readyState: 'complete' },
    location: { protocol: 'http:', origin: 'http://127.0.0.1:' + PORT, pathname: '/', search: '', hash: '#/' },
    navigator: { sendBeacon: () => false },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: (fn) => fn(), Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
    fetch: (u, o) => raw('http://127.0.0.1:' + PORT + u, o)
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f });
  sb.XHSH = { router: { refresh() { }, current: 'plan', get: () => null }, adoptRemote: function () { } };
  run('js/modules/core.js');
  sb.XHSH.data.load();
  run('js/modules/sync.js');
  sb._name = name;
  sb.connect = function (space, token) {
    var s = sb.XHSH.data.all.settings;
    s.syncSpace = space; s.syncToken = token; s.syncAuto = false;
    sb.XHSH.data.save('settings');
  };
  return sb;
}

function day(C, d) { return C.XHSH.data.all.plan.checkins[d]; }
function srvData() { return raw('http://127.0.0.1:' + PORT + '/api/sync/itest', { headers: { 'X-Sync-Token': 'pass1234' } }).then((r) => r.json()); }

(async () => {
  try {
    await startServer();
    const A = makeClient('A');
    A.connect('itest', 'pass1234');

    // 1) 首次建立空间
    A.XHSH.data.all.plan.checkins['2026-10-21'] = ['fitness', 'english'];
    A.XHSH.data.save('plan');
    await A.XHSH.sync.syncNow({ force: true });
    check('A 首次上传', A.XHSH.sync.status().state === 'ok', A.XHSH.sync.status().message);

    // 2) 新浏览器（空白）首次同步
    const B = makeClient('B');
    B.connect('itest', 'pass1234');
    await B.XHSH.sync.syncNow({ force: true });
    check('B 新浏览器拿到 10.21', JSON.stringify(day(B, '2026-10-21')) === '["fitness","english"]', JSON.stringify(day(B, '2026-10-21')));

    // 3) 在新的一天打卡
    B.XHSH.data.all.plan.checkins['2026-10-22'] = ['fitness'];
    B.XHSH.data.save('plan');
    await B.XHSH.sync.syncNow({ force: true });
    check('B 的 10.22 推送后仍在', JSON.stringify(day(B, '2026-10-22')) === '["fitness"]', JSON.stringify(day(B, '2026-10-22')));

    // 4) 同一浏览器反复同步
    let stable = true;
    for (let i = 0; i < 5; i++) {
      await B.XHSH.sync.syncNow({ force: true });
      if (JSON.stringify(day(B, '2026-10-22')) !== '["fitness"]') { stable = false; break; }
    }
    check('同一浏览器 5 轮同步后 10.22 不丢', stable, JSON.stringify(day(B, '2026-10-22')));

    // 5) 重新打开
    B.XHSH.data.load();
    await B.XHSH.sync.syncNow({ force: true });
    check('重新打开后 10.22 仍在', JSON.stringify(day(B, '2026-10-22')) === '["fitness"]', JSON.stringify(day(B, '2026-10-22')));

    // 6) A 拉取
    await A.XHSH.sync.syncNow({ force: true });
    check('A 收到 10.22', JSON.stringify(day(A, '2026-10-22')) === '["fitness"]', JSON.stringify(day(A, '2026-10-22')));
    check('A 的 10.21 不被冲掉', JSON.stringify(day(A, '2026-10-21')) === '["fitness","english"]', JSON.stringify(day(A, '2026-10-21')));

    // 7) 修改已存在的一天：最终与服务器一致
    A.XHSH.data.all.plan.checkins['2026-10-21'] = ['english'];
    A.XHSH.data.save('plan');
    await A.XHSH.sync.syncNow({ force: true });
    const s = await srvData();
    const srv21 = JSON.stringify(s.data.data.plan.checkins['2026-10-21']);
    check('A 的修改与服务器最终一致', JSON.stringify(day(A, '2026-10-21')) === srv21, JSON.stringify(day(A, '2026-10-21')) + ' / ' + srv21);

    // 8) 收入（数组）跨设备合并
    A.XHSH.data.all.incomes.items.push({ id: 'i1', source: '写稿', amountCents: 1000, date: '2026-10-21', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    A.XHSH.data.save('incomes');
    await A.XHSH.sync.syncNow({ force: true });
    await B.XHSH.sync.syncNow({ force: true });
    check('B 收到收入记录', B.XHSH.data.all.incomes.items.some((x) => x.id === 'i1'));

    // 9) 离线改动 → 恢复
    B.XHSH.data.all.review.todayMood = '😄';
    B.XHSH.data.save('review');
    const realFetch = B.fetch;
    B.fetch = () => Promise.reject(new Error('offline'));
    await B.XHSH.sync.syncNow({ force: true });
    B.fetch = realFetch;
    check('离线时心情保留', B.XHSH.data.all.review.todayMood === '😄');
    await B.XHSH.sync.syncNow({ force: true });
    const s2 = await srvData();
    check('恢复后心情已上传', s2.data.data.review.todayMood === '😄', s2.data.data.review.todayMood);
  } catch (e) {
    fails++;
    console.log('  ❌ 异常：' + e.message);
  } finally {
    if (child) child.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('\n结果：' + (fails ? fails + ' 个失败' : '全部通过'));
    process.exit(fails ? 1 : 0);
  }
})();
