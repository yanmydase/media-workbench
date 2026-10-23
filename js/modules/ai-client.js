/*!
 * 小小花狮 · DeepSeek 接入层（v2.4）
 * - 默认：DeepSeek 官方 https://api.deepseek.com（浏览器直连，Key 只存在本机）
 * - 兼容任意 OpenAI 格式接口：baseUrl 可填 .../v1、.../chat/completions，或直接填 API Key 所在的完整地址
 * - 流式（SSE）输出 + 中途停止 + 可读的中文错误
 *
 * 重要：如果浏览器直连被企业代理/证书拦截、或所在网络访问不了 api.deepseek.com，
 * 可把「模型服务」改为“本项目 /api 代理”，由 server.py 在服务端转发（见 README 第 5 节）。
 */
(function (XHSH) {
    'use strict';

    var abortCtl = null;
    var fallbackUsed = false;

    function cfg() { return XHSH.data.all.ai.config || XHSH.DEFAULT_AI_CONFIG; }

    /** 规范化接口地址 */
    function endpoint(baseUrl) {
        var u = String(baseUrl || '').trim().replace(/\/+$/, '');
        if (!u) throw new Error('请先在设置里填写 API 地址');
        if (/\/chat\/completions$/.test(u)) return u;
        // 本项目内置代理：/api、/api/、/api/v1
        if (/^\/?x-proxy(\/v1)?\/?$/.test(u)) return '/api/v1/chat/completions';
        if (/\/v1$/.test(u)) return u + '/chat/completions';
        if (/^https?:\/\/api\.deepseek\.com$/i.test(u)) return u + '/chat/completions';   // 官方两种写法都支持
        return u + '/v1/chat/completions';
    }

    /** Key 清洗：去掉复制时带入的空白、引号、"Bearer " 前缀 */
    function cleanKey(k) {
        return String(k || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
    }

    function headers(key) {
        var h = { 'Content-Type': 'application/json' };
        var k = cleanKey(key);
        if (k) h.Authorization = 'Bearer ' + k;
        return h;
    }

    function friendlyError(status, text) {
        var msg = '';
        try {
            var j = JSON.parse(text);
            msg = (j.error && (j.error.message || j.error)) || j.message || '';
        } catch (e) { msg = String(text || '').slice(0, 200); }
        var hint = {
            400: '请求格式有误',
            401: 'API Key 无效、已失效或填错了（注意不要带引号/空格）',
            402: '账户余额不足，请前往 DeepSeek 控制台充值',
            403: '没有访问权限（可能是 Key 被禁用或所在地区不支持）',
            404: '接口地址不正确（DeepSeek 官方为 https://api.deepseek.com）',
            413: '请求内容过大',
            422: '参数错误（例如模型名不存在）',
            429: '请求过于频繁或额度用尽，请稍后再试',
            500: 'DeepSeek 服务端错误，请稍后重试',
            502: '代理或网络异常',
            503: '服务繁忙，请稍后重试'
        }[status] || '请求失败';
        return hint + (msg ? '：' + msg : '') + '（HTTP ' + status + '）';
    }

    function networkHint(url) {
        return '无法连接 ' + url + '。可能原因：① 网络/防火墙拦截了 api.deepseek.com；' +
            '② 公司或校园网的代理做了 HTTPS 解密；③ 直接用 file:// 打开页面导致浏览器限制。' +
            '可改为「本项目 /api 代理」模式（server.py 转发）。';
    }

    /**
     * 对话补全
     * @param {Array<{role:string, content:string}>} messages
     * @param {{signal?:AbortSignal, stream?:boolean, onDelta?:function(string), model?:string, temperature?:number, maxTokens?:number, config?:object}} opts
     * @returns {Promise<string>} 完整文本
     */
    async function chat(messages, opts) {
        opts = opts || {};
        var c = Object.assign({}, cfg(), opts.config || {});
        var url = endpoint(c.baseUrl);
        var useStream = opts.stream != null ? opts.stream : c.streamMode !== false;
        var body = {
            model: opts.model || c.model || 'deepseek-chat',
            messages: messages,
            stream: useStream,
            temperature: typeof opts.temperature === 'number' ? opts.temperature : (c.temperature != null ? c.temperature : 0.8),
            max_tokens: opts.maxTokens || c.maxTokens || 4096
        };
        var local = new AbortController();
        abortCtl = local;
        if (opts.signal) {
            if (opts.signal.aborted) local.abort();
            else opts.signal.addEventListener('abort', function () { local.abort(); });
        }

        var res;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: headers(c.apiKey),
                body: JSON.stringify(body),
                signal: local.signal
            });
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            // 浏览器直连失败时，自动改用本项目代理再试一次（服务器有外网就能救回来）
            var isProxy = /^\/?x-proxy/.test(String(url));
            if (!isProxy) {
                try {
                    res = await fetch('/api/v1/chat/completions', {
                        method: 'POST', headers: headers(c.apiKey), body: JSON.stringify(body), signal: local.signal
                    });
                    fallbackUsed = true;
                } catch (e2) {
                    throw new Error(networkHint(url) + '（' + e.message + '）');
                }
            } else {
                throw new Error(networkHint(url) + '（' + e.message + '）');
            }
        }

        if (fallbackUsed && !res.ok) {
            // 代理也不通时，提示去检查网络或改用其它网络
            var t0 = await res.text().catch(function () { return ''; });
            throw new Error('浏览器直连失败，已自动改用本机代理但仍失败：' + friendlyError(res.status, t0));
        }
        if (!res.ok) {
            var text = await res.text().catch(function () { return ''; });
            throw new Error(friendlyError(res.status, text));
        }
        if (fallbackUsed && XHSH.toast) XHSH.toast('🛰️ 直连被拦截，已自动改用本机代理', 3000);

        if (!useStream || !res.body) {
            var json = await res.json();
            var content = (json.choices && json.choices[0] && (json.choices[0].message || {}).content) || '';
            if (opts.onDelta && content) opts.onDelta(content);
            if (!content) throw new Error('模型返回了空内容，请重试或更换模型');
            return content;
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder('utf-8');
        var buf = '', acc = '';
        while (true) {
            var r = await reader.read();
            if (r.done) break;
            buf += decoder.decode(r.value, { stream: true });
            var lines = buf.split('\n');
            buf = lines.pop() || '';
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.charAt(0) === ':') continue;
                if (line.indexOf('data:') !== 0) continue;
                var payload = line.slice(5).trim();
                if (payload === '[DONE]') continue;
                try {
                    var chunk = JSON.parse(payload);
                    var delta = chunk.choices && chunk.choices[0] &&
                        ((chunk.choices[0].delta && chunk.choices[0].delta.content) || '');
                    if (delta) { acc += delta; if (opts.onDelta) opts.onDelta(delta, acc); }
                } catch (e) { /* 忽略心跳/非 JSON 行 */ }
            }
        }
        if (!acc) throw new Error('模型返回了空内容，请重试或更换模型');
        return acc;
    }

    function stop() { if (abortCtl) { abortCtl.abort(); abortCtl = null; } }

    /**
     * 连接测试：直接使用设置面板里"当前填写的值"（不必先保存），返回模型回复。
     * 依次尝试：聊天接口 → 若 404 再试官方 /models 接口，方便快速定位问题。
     */
    async function test(config) {
        var c = Object.assign({}, XHSH.DEFAULT_AI_CONFIG, config || {});
        var viaProxy = /^\/?x-proxy/.test(String(endpoint(c.baseUrl)));
        if (!cleanKey(c.apiKey) && !viaProxy) {
            var err = new Error('还没有可用的 API Key，请先填写（DeepSeek 的 Key 形如 sk-xxxxxxxx）');
            err.needKey = true;
            throw err;
        }
        try {
            return await chat([{ role: 'user', content: '你好，请只回复四个字：连接成功' }], {
                stream: false, maxTokens: 20, temperature: 0, config: c
            });
        } catch (e) {
            // 404 多半是地址填错：再用 /models 探一次，给出更明确的提示
            if (/HTTP 404/.test(e.message)) {
                var base = String(c.baseUrl || '').replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
                var probe = (/\/v1$/.test(base) ? base : base + '/v1') + '/models';
                try {
                    var r = await fetch(probe, { headers: headers(c.apiKey) });
                    if (r.ok) throw new Error('聊天接口地址不正确（/models 可用），请把 API 地址填成 https://api.deepseek.com');
                    throw new Error(friendlyError(r.status, await r.text().catch(function () { return ''; })));
                } catch (e2) {
                    throw (e2 && e2.message && !/Failed to fetch/i.test(e2.message)) ? e2 : e;
                }
            }
            throw e;
        }
    }

    XHSH.ai = { chat: chat, stop: stop, test: test, endpoint: endpoint, config: cfg, cleanKey: cleanKey };

})(window.XHSH);
