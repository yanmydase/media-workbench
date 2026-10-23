/*!
 * 小小花狮 · 智慧花狮（通用对话智能体）
 *
 * 这是新的"默认"对话：陪伴式、多轮、支持文字和动画风配图。
 * 具体业务形态（例如动物百科学习包）由 js/agents/registry.js 里的智能体 + 页面实现。
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr, $ = function (id) { return document.getElementById(id); };

    var threadKey = function () { return XHSH.today() + '|wisdom'; };
    var busy = false;

    function A() { return XHSH.data.all.ai; }
    function thread() {
        var h = A().threads || (A().threads = {});
        if (!h[threadKey()]) h[threadKey()] = [];
        return h[threadKey()];
    }

    /* 2026-10 官方最新模型：DeepSeek V4.1 Flash 1017（API 名 deepseek-flash）
     * 旧的 deepseek-chat / deepseek-reasoner 已停止服务。 */
    var MODELS = [
        { value: 'deepseek-flash', label: 'DeepSeek V4.1 Flash 1017（最新，快且便宜，推荐）' },
        { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro（更强，更贵更慢）' }
    ];
    var lastTest = { state: 'unknown', message: '' };

    function keyOk() {
        var c = XHSH.ai.config();
        return !!XHSH.ai.cleanKey(c.apiKey) || /^\/?x-proxy/.test(String(c.baseUrl || ''));
    }

    /* ---------------- 渲染 ---------------- */
    function renderBar() {
        var cfg = XHSH.ai.config();
        var ok = keyOk();
        var model = (MODELS.find(function (m) { return m.value === cfg.model; }) || {}).label || cfg.model;
        var status = !ok ? '待配置 Key' : (lastTest.state === 'fail' ? '连接失败' : lastTest.state === 'ok' ? '已连接' : '未测试');
        var dot = !ok ? 'warn' : (lastTest.state === 'fail' ? 'bad' : lastTest.state === 'ok' ? 'good' : 'unknown');
        $('aiModelBar').innerHTML =
            '<div class="mb-left"><span class="mb-dot ' + dot + '"></span>' +
            '<span class="mb-model">智慧花狮</span><span class="mb-muted">' + esc(model.split(' · ')[0]) + ' · ' + esc(cfg.apiKey ? 'sk-••••' + String(cfg.apiKey).slice(-4) : (ok ? '服务端 Key' : '未填写')) + '</span></div>' +
            '<div class="mb-right"><span class="mb-status ' + dot + '">' + esc(status) + '</span>' +
            '<button class="btn btn-xs btn-outline" data-action="ai-model">⚙️ 模型</button>' +
            '<button class="btn btn-xs btn-outline" data-action="ai-draw" title="按输入框里的动物名字画一张卡通图">🖼️ 画图</button></div>';

        var setup = $('aiSetup');
        if (!ok) {
            setup.style.display = 'block';
            setup.innerHTML =
                '<div class="card-title">🔑 还差一步：填写 DeepSeek API Key</div>' +
                '<div class="muted small mt-6">Key 只保存在这台设备的浏览器里，可在 platform.deepseek.com 申请。</div>' +
                '<input class="input mt-10" id="aiSetupKey" type="password" placeholder="sk-…（粘贴后点保存）" autocomplete="off">' +
                '<div class="row-gap mt-10">' +
                '<button class="btn btn-primary btn-sm" data-action="ai-save-key">保存并测试</button>' +
                '<button class="btn btn-outline btn-sm" data-action="ai-model">用服务端 Key / 其它模型</button>' +
                '</div>';
        } else { setup.style.display = 'none'; setup.innerHTML = ''; }

        var used = A().quotaUsed || 0, total = A().quotaTotal || 500;
        var warn = $('aiQuotaWarn');
        if (used >= total) { warn.style.display = 'block'; warn.textContent = '额度已用尽（可在 ⚙️ 模型 里调整）'; }
        else if (total > 0 && used / total >= 0.9) { warn.style.display = 'block'; warn.textContent = '额度即将用尽'; }
        else { warn.style.display = 'none'; }
    }

    function renderThread() {
        var msgs = thread(), host = $('aiThread');
        if (!msgs.length) {
            host.innerHTML = '<div class="ai-empty"><div class="lion-face">🦁</div>' +
                '<div>我是智慧花狮，伴你成行的小伙伴。</div>' +
                '<div class="small mt-6">可以问知识、聊心事、写东西、做计划，也能画一张图讲清楚。</div></div>';
        } else {
            host.innerHTML = msgs.map(function (m, i) {
                return '<div class="msg ' + (m.role === 'user' ? 'user' : 'bot') + '" data-action="ai-copy-msg" data-index="' + i + '" title="点击复制">' +
                    '<div class="msg-role">' + (m.role === 'user' ? '我' : '🦁') + '</div>' +
                    '<div class="msg-body">' + esc(m.content) + '</div>' + imgBlock(m.image) + '</div>';
            }).join('');
        }
        requestAnimationFrame(function () { host.scrollTop = host.scrollHeight; });
    }
    /** 配图直接内嵌 SVG（矢量、无外部请求、可离线） */
    function imgBlock(svg) {
        if (!svg) return '';
        return '<div class="msg-img">' + String(svg).replace(/width="100%"/, 'width="100%"') + '</div>';
    }

    /* ---------------- 画一张图（可选） ---------------- */
    function drawImage() {
        var input = $('aiPrompt');
        var name = (input.value || '').trim();
        if (!name) return XHSH.toast('先在输入框写一个动物或主题，比如：小熊猫');
        var svg = XHSH.illustrate.portrait(name, { home: XHSH.illustrate.traits(name).home });
        var t = thread();
        t.push({ role: 'user', content: '（画一张：' + name + '）', ts: Date.now() });
        t.push({ role: 'assistant', content: '画好啦：' + XHSH.illustrate.STYLE_HINT, image: svg });
        A().threads[threadKey()] = t;
        XHSH.data.save('ai');
        input.value = '';
        renderThread();
    }

    /* ---------------- 发送 ---------------- */
    function setBusy(on) {
        busy = on;
        $('aiGenBtn').disabled = on;
        $('aiGenBtn').textContent = on ? '⏳ 正在想…' : '🚀 发送';
        $('aiStopBtn').style.display = on ? 'inline-flex' : 'none';
    }

    async function send() {
        if (busy) return;
        var input = $('aiPrompt');
        var text = input.value.trim();
        if (!text) return XHSH.toast('请输入内容');
        if (!keyOk()) {
            renderBar();
            var k = $('aiSetupKey');
            if (k) { k.focus(); k.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            return XHSH.toast('先在上方填写 API Key');
        }
        var agent = XHSH.agents.get('wisdom') || null;
        var sys = (agent && agent.systemPrompt) || '';
        var history = thread().slice(-8).map(function (m) { return { role: m.role, content: m.content }; });
        var msgs = [{ role: 'system', content: sys }].concat(history).concat([{ role: 'user', content: text }]);

        input.value = '';
        var t = thread();
        t.push({ role: 'user', content: text, ts: Date.now() });
        var bot = { role: 'assistant', content: '', ts: Date.now() };
        t.push(bot);
        renderThread();

        var host = $('aiThread');
        var bubble = host.lastElementChild && host.lastElementChild.querySelector('.msg-body');
        setBusy(true);
        var acc = '';
        try {
            acc = await XHSH.ai.chat(msgs, {
                stream: XHSH.ai.config().streamMode !== false,
                onDelta: function (d, full) {
                    acc = full != null ? full : acc + d;
                    if (bubble) { bubble.textContent = acc; host.scrollTop = host.scrollHeight; }
                }
            });
            bot.content = acc;
            lastTest = { state: 'ok', message: '' };
            var a = A();
            a.quotaUsed = (a.quotaUsed || 0) + 1;
            a.history = (a.history || []).filter(function (h) { return h.agentId !== 'wisdom' || (Date.now() - Date.parse(h.updatedAt || 0)) < 7 * 86400000; });
            a.history.unshift({ agentId: 'wisdom', agentName: '智慧花狮', prompt: text, response: acc.slice(0, 2000), time: new Date().toLocaleString(), updatedAt: new Date().toISOString() });
            if (a.history.length > XHSH.CONFIG.aiHistoryLimit) a.history.length = XHSH.CONFIG.aiHistoryLimit;
            if (t.length > 40) t.splice(0, t.length - 40);
            XHSH.data.save('ai');
        } catch (err) {
            if (err.name === 'AbortError') bot.content = acc || '（已停止）';
            else { bot.content = '❌ ' + err.message; lastTest = { state: 'fail', message: err.message }; }
        } finally {
            setBusy(false);
            renderThread();
            renderBar();
            renderHistory();
        }
    }

    function renderHistory() {
        var h = (A().history || []).filter(function (x) { return x.agentId === 'wisdom'; }).slice(0, 10);
        var host = $('aiHistory');
        if (!host) return;
        host.innerHTML = h.length ? h.map(function (x, i) {
            return '<div class="hist-item" data-action="ai-history-use" data-index="' + escAttr(String(i)) + '">' +
                '<div class="hist-head"><span>' + esc(x.time || '') + '</span></div>' +
                '<div class="hist-body">' + esc(String(x.prompt || '').slice(0, 40)) + '</div></div>';
        }).join('') : '<div class="empty-inline">暂无对话历史</div>';
    }

    /* ---------------- 连接测试 ---------------- */
    async function runTest(silent) {
        if (!keyOk()) { renderBar(); return false; }
        if (!silent) XHSH.toast('正在测试连接…');
        try {
            var reply = await XHSH.ai.test();
            lastTest = { state: 'ok', message: '' };
            if (!silent) XHSH.toast('✅ 连接成功：' + String(reply).slice(0, 30), 3500);
            return true;
        } catch (e) {
            lastTest = { state: 'fail', message: e.message };
            if (!silent) XHSH.sheet({ title: '连接失败', message: e.message, okText: '去修改', cancelText: '关闭' }).then(function (r) { if (r) openSettings(); });
            return false;
        } finally { renderBar(); }
    }

    /* ---------------- 模型设置 UID ---------------- */
    async function openSettings() {
        var ai = A(), cfg = XHSH.ai.config();
        var viaProxy = /^\/?x-proxy/.test(String(cfg.baseUrl || ''));
        var r = await XHSH.sheet({
            title: '模型与连接',
            message: 'Key 只保存在这台设备；若直连被网络拦截，可改用"通过本机服务转发"。',
            fields: [
                { name: 'apiKey', label: 'DeepSeek API Key', value: cfg.apiKey || '', placeholder: 'sk-…' },
                { name: 'model', label: '模型', type: 'select', value: cfg.model || 'deepseek-flash', options: MODELS },
                { name: 'viaProxy', label: '连接方式', type: 'select', value: viaProxy ? 'proxy' : 'direct',
                  options: [{ value: 'direct', label: '浏览器直连 DeepSeek 官方' }, { value: 'proxy', label: '通过本机服务转发（/api）' }] },
                { name: 'advanced', label: '更多', type: 'select', value: 'fold',
                  options: [{ value: 'fold', label: '不展开' }, { value: 'open', label: '展开：提示词 / 输出方式 / 额度' }] },
                { name: 'systemPrompt', label: '默认系统提示词', type: 'textarea', value: cfg.systemPrompt || '', group: 'advanced' },
                { name: 'streamMode', label: '输出方式', type: 'select', value: cfg.streamMode === false ? '0' : '1',
                  options: [{ value: '1', label: '逐字输出' }, { value: '0', label: '一次性返回' }], group: 'advanced' },
                { name: 'quotaTotal', label: '本机额度总次数（仅提示用）', type: 'number', min: 1, step: 1, value: ai.quotaTotal || 500, group: 'advanced' }
            ],
            okText: '保存',
            extraActions: [{ name: 'test', text: '🔌 测试连接' }]
        });
        if (!r) return;
        var next = Object.assign({}, cfg, {
            apiKey: XHSH.ai.cleanKey(r.apiKey),
            model: r.model || 'deepseek-flash',
            provider: r.viaProxy === 'proxy' ? 'proxy' : 'deepseek',
            baseUrl: r.viaProxy === 'proxy' ? '/api' : (XHSH.AI_PROVIDERS[0].baseUrl || 'https://api.deepseek.com'),
            systemPrompt: r.systemPrompt || cfg.systemPrompt,
            streamMode: r.streamMode !== '0'
        });
        function save() {
            ai.config = next;
            ai.quotaTotal = Math.max(1, parseInt(r.quotaTotal, 10) || 500);
            XHSH.data.save('ai');
        }
        if (r.__action === 'test') {
            XHSH.toast('正在测试连接…');
            try {
                await XHSH.ai.test(next);
                lastTest = { state: 'ok', message: '' };
                save();
                XHSH.toast('✅ 连接成功，已保存', 3000);
                renderBar();
            } catch (e) {
                lastTest = { state: 'fail', message: e.message };
                var again = await XHSH.sheet({ title: '连接失败', message: e.message, okText: '返回修改', cancelText: '关闭' });
                if (again) return openSettings();
                renderBar();
            }
            return;
        }
        save();
        XHSH.toast('设置已保存 ✅');
        renderBar();
        if (keyOk()) runTest(true);
    }

    async function saveKeyInline() {
        var key = XHSH.ai.cleanKey(($('aiSetupKey') || {}).value);
        if (!key) return XHSH.toast('请粘贴 API Key');
        if (!/^sk-/.test(key)) return XHSH.toast('Key 应该以 sk- 开头，请检查是否复制完整');
        var ai = A();
        ai.config = Object.assign({}, XHSH.ai.config(), { apiKey: key, provider: 'deepseek', baseUrl: XHSH.AI_PROVIDERS[0].baseUrl });
        XHSH.data.save('ai');
        renderBar();
        await runTest(false);
    }

    window.WisdomModule = {
        mount: function () {
            renderBar();
            renderThread();
            renderHistory();
            if (keyOk() && lastTest.state === 'unknown') runTest(true);
        },
        send: send,
        runTest: runTest,
        draw: drawImage,
        renderBar: renderBar
    };

    XHSH.on('ai-send', send);
    XHSH.on('ai-stop', function () { XHSH.ai.stop(); });
    XHSH.on('ai-copy-msg', function (el, ev, ds) {
        var m = thread()[Number(ds.index)];
        if (!m) return;
        navigator.clipboard.writeText(m.content).then(function () { XHSH.toast('已复制 📋'); }).catch(function () { XHSH.toast('复制失败'); });
    });
    XHSH.on('ai-clear', async function () {
        if (!(await XHSH.confirm('清空今天的对话？', '清空'))) return;
        A().threads[threadKey()] = [];
        XHSH.data.save('ai');
        renderThread();
    });
    XHSH.on('ai-history-use', function (el, ev, ds) {
        var h = (A().history || []).filter(function (x) { return x.agentId === 'wisdom'; })[Number(ds.index)];
        if (!h) return;
        $('aiPrompt').value = h.prompt;
        $('aiPrompt').focus();
    });
    XHSH.on('ai-model', openSettings);
    XHSH.on('open-settings', openSettings);
    XHSH.on('ai-save-key', saveKeyInline);
    XHSH.on('ai-draw', drawImage);

})(window.XHSH);
