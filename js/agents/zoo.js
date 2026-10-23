/*!
 * 小小花狮 · 🐾 动物百科（沉浸式博物学习包）
 *
 * 输入一个动物名字 → 生成四大部分：
 *   ① 基础卡片（分类 / 栖息地 / 食性 / 保护等级 / 易混淆辨析）
 *   ② 生存剧本（第一人称一天的觅食·避险·育幼，适合中小学生）
 *   ③ 生态位图谱（食物链 + 天敌 + 共生伙伴，图形化）
 *   ④ 趣味思考题（问题 + 引导式解答）
 *
 * 图片不依赖任何外部服务：由 js/modules/illustrate.js 用 SVG 现画（卡通风格、可缩放、可离线）。
 * AI 负责"知识 + 故事 + 图谱关系 + 思考题"，并返回结构化的图谱关系给绘图引擎。
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr, $ = function (id) { return document.getElementById(id); };
    var busy = false;
    var current = null;        // 当前浏览器里的那一条
    var lastResult = null;     // 最近一次生成的结构化结果（用于重画）

    function P() {
        var a = XHSH.data.all.ai;
        a.encyclopedia = a.encyclopedia || { packs: [], settings: {} };
        a.encyclopedia.packs = a.encyclopedia.packs || [];
        a.encyclopedia.settings = a.encyclopedia.settings || {};
        return a.encyclopedia;
    }

    /* ---------------------------------------------------------------
     * 独立模型配置：动物百科不跟随全局模型，默认使用最新的
     * DeepSeek V4.1 Flash 1017（API 模型名 deepseek-flash），
     * 也可切到 deepseek-v4-pro / 自定义模型名。Key 与智慧花狮共用。
     * --------------------------------------------------------------- */
    var MODELS = [
        { value: 'deepseek-flash', label: 'DeepSeek V4.1 Flash 1017（最新，快且便宜，推荐）' },
        { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro（更强，更贵更慢）' },
        { value: 'deepseek-chat', label: 'deepseek-chat（旧名，兼容用）' }
    ];

    function MS() { return P().settings; }
    function modelName() { return MS().model || 'deepseek-flash'; }
    function hasKey() {
        var cfg = XHSH.ai.config();
        return !!XHSH.ai.cleanKey(cfg.apiKey) || /^\/?x-proxy/.test(String(cfg.baseUrl || ''));
    }
    function ready() { return hasKey(); }

    var SYSTEM = [
        '你是"动物百科学习包"生成器，面向中国的中小学生。你的任务是把一个动物变成一套可以边看边学的沉浸式学习包。',
        '要求：',
        '1) 科学性优先：分类、分布、食性、保护等级必须准确；不确定的细节宁可不写。中国的物种请给出《国家重点保护野生动物名录》等级（一级/二级/三有），并注明 IUCN 等级（如 EN 濒危）。',
        '2) 语言适合 10-15 岁：句子短、有画面感，专业词第一次出现时用括号解释。',
        '3) 生存剧本用第一人称（"我"），写一天（清晨—正午—黄昏—夜里），要有觅食、避险、育幼（或领地/社交）三条线，中间插入可验证的科学细节（如"我的毛是双层中空结构"）。不要编造夸大的数字。',
        '4) 易混淆物种辨析：选 1-2 个真的容易混的物种，用"看这里"的方式对比（体型、颜色、尾巴、分布）。',
        '5) 生态位：给出它在食物链中的角色；列出 1-3 个主要猎物/食物、1-2 个天敌、1-2 个共生或互利伙伴；如果确实没有天敌，把 predators 置为空数组并在 role 中说明。',
        '6) 思考题：2-3 道，问题要能引起好奇（例如"为什么水獭要手拉手睡觉？"），答案要给三步引导，而不是直接给结论。',
        '7) 只输出一个 JSON 对象，不要 Markdown、不要解释。'
    ].join('\n');

    var SCHEMA = [
        '请严格按以下 JSON 结构输出（所有字段都要有，没有内容用空字符串或空数组）：',
        '{',
        '  "name": "中文名",',
        '  "scientificName": "学名（斜体拉丁）",',
        '  "englishName": "英文名",',
        '  "emoji": "一个最贴切的 emoji",',
        '  "basic": {',
        '    "classification": "界/门/纲/目/科 的精简写法",',
        '    "habitat": "栖息环境（含分布地区）",',
        '    "diet": "食性",',
        '    "protection": "保护等级（国内名录 + IUCN）",',
        '    "size": "体长/体重",',
        '    "lifespan": "寿命",',
        '    "superpower": "它最厉害的一项生存本领（一句话）"',
        '  },',
        '  "confusion": [',
        '    { "other": "易混物种", "diff": "怎么一眼分辨（关键词对比）" }',
        '  ],',
        '  "story": {',
        '    "title": "第一人称故事标题",',
        '    "scenes": [ { "time": "清晨", "text": "第一人称段落，2-4 句", "tag": "觅食|避险|育幼|社交|休息" } ]',
        '  },',
        '  "ecology": {',
        '    "role": "它在食物链中的角色（一句话）",',
        '    "prey": ["猎物/食物1", "…"],',
        '    "predators": ["天敌1", "…"],',
        '    "partners": ["共生/互利伙伴1", "…"],',
        '    "chain": "用 3-5 个词连成一条食物链，如 浮游植物→小鱼→水獭→狼"',
        '  },',
        '  "quiz": [',
        '    { "q": "为什么……？", "steps": ["先想想……", "再联系它的……", "所以答案是……"], "answer": "一句话结论" }',
        '  ],',
        '  "funFact": "一个让人记住它的小知识"',
        '}'
    ].join('\n');

    /* ---------------- 生成 ---------------- */
    function extractJSON(text) {
        var s = String(text || '').trim();
        var fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
        if (fence) s = fence[1].trim();
        var a = s.indexOf('{'), b = s.lastIndexOf('}');
        if (a >= 0 && b > a) s = s.slice(a, b + 1);
        try { return JSON.parse(s); } catch (e) {
            // 常见问题：尾逗号
            try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch (e2) { return null; }
        }
    }

    function normalize(raw, name) {
        raw = raw || {};
        var basic = raw.basic || {};
        var eco = raw.ecology || {};
        var story = raw.story || {};
        function arr(x) { return Array.isArray(x) ? x.filter(Boolean).map(String) : (x ? [String(x)] : []); }
        return {
            name: raw.name || name,
            scientificName: raw.scientificName || '',
            englishName: raw.englishName || '',
            emoji: raw.emoji || '🐾',
            basic: {
                classification: basic.classification || '', habitat: basic.habitat || '', diet: basic.diet || '',
                protection: basic.protection || '', size: basic.size || '', lifespan: basic.lifespan || '',
                superpower: basic.superpower || ''
            },
            confusion: (Array.isArray(raw.confusion) ? raw.confusion : []).map(function (c) {
                return { other: String(c.other || ''), diff: String(c.diff || '') };
            }).filter(function (c) { return c.other; }),
            story: {
                title: story.title || ('我的一天：' + (raw.name || name)),
                scenes: (Array.isArray(story.scenes) ? story.scenes : []).map(function (s) {
                    return { time: String(s.time || ''), text: String(s.text || ''), tag: String(s.tag || '') };
                }).filter(function (s) { return s.text; })
            },
            ecology: {
                role: eco.role || '',
                prey: arr(eco.prey), predators: arr(eco.predators), partners: arr(eco.partners),
                chain: eco.chain || ''
            },
            quiz: (Array.isArray(raw.quiz) ? raw.quiz : []).map(function (q) {
                return {
                    q: String(q.q || ''), answer: String(q.answer || ''),
                    steps: Array.isArray(q.steps) ? q.steps.map(String) : []
                };
            }).filter(function (q) { return q.q; }),
            funFact: raw.funFact || ''
        };
    }

    async function generate(name) {
        var msgs = [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: '动物：' + name + '\n\n' + SCHEMA }
        ];
        // 使用动物百科自己的模型（默认 deepseek-flash = V4.1 Flash 1017）
        var text = await XHSH.ai.chat(msgs, {
            stream: false, model: activeModel(), maxTokens: 4000, temperature: 0.5
        });
        var json = extractJSON(text);
        if (!json) throw new Error('模型返回的内容不是标准 JSON，请再试一次（或在"模型"里换个模型）');
        return normalize(json, name);
    }

    /** 连接测试：确认这个 Key 能用当前模型 */
    async function testModel() {
        var cfg = Object.assign({}, XHSH.ai.config(), { model: activeModel() });
        try {
            var reply = await XHSH.ai.test(cfg);
            return { ok: true, model: activeModel(), reply: String(reply).slice(0, 30) };
        } catch (e) {
            return { ok: false, model: activeModel(), message: e.message };
        }
    }

    /* ---------------- 图片（SVG 现画） ---------------- */
    var HOME_LABEL = { forest: '森林', grass: '草原', water: '水域', polar: '极地', desert: '荒漠', sky: '高空', night: '夜行' };

    function guessHome(pack) {
        var t = XHSH.illustrate.traits(pack.name);
        if (t.home) return t.home;
        var txt = (pack.basic.habitat || '') + (pack.basic.diet || '');
        if (/水|海|河|湖|溪/.test(txt)) return 'water';
        if (/雪|冰|极/.test(txt)) return 'polar';
        if (/沙漠|戈壁|干旱/.test(txt)) return 'desert';
        if (/草原|稀树/.test(txt)) return 'grass';
        if (/森林|林|竹|树/.test(txt)) return 'forest';
        return 'forest';
    }

    function buildArt(pack, size) {
        var home = guessHome(pack);
        var sizeClass = size === 'thumb' ? 'art-thumb' : 'art-main';
        return '<div class="art ' + sizeClass + '">' +
            XHSH.illustrate.portrait(pack.name, { home: home, label: false }) + '</div>';
    }

    /* ---------------- 渲染 ---------------- */
    function kv(label, value) {
        if (!value) return '';
        return '<div class="kv"><span class="kv-k">' + esc(label) + '</span><span class="kv-v">' + esc(value) + '</span></div>';
    }

    function renderPack(pack) {
        var home = guessHome(pack);
        var html = '';

        /* ② 顶部：封面 */
        html += '<div class="card pack-cover">' +
            buildArt(pack, 'main') +
            '<div class="pack-cover-info">' +
            '<div class="pack-name">' + esc(pack.name) + ' <span class="pack-emoji">' + esc(pack.emoji) + '</span></div>' +
            (pack.scientificName ? '<div class="pack-latin"><i>' + esc(pack.scientificName) + '</i>' + (pack.englishName ? ' · ' + esc(pack.englishName) : '') + '</div>' : '') +
            '<div class="pack-tags">' +
            '<span class="tag">' + esc(HOME_LABEL[home] || '栖息地') + '</span>' +
            (pack.basic.protection ? '<span class="tag tag-warn">' + esc(pack.basic.protection.split('；')[0].slice(0, 18)) + '</span>' : '') +
            '</div>' +
            (pack.basic.superpower ? '<div class="pack-power">✨ ' + esc(pack.basic.superpower) + '</div>' : '') +
            '</div></div>';

        /* ① 基础卡片 */
        html += '<div class="card"><div class="card-title mb-10">① 基础卡片</div><div class="kv-grid">' +
            kv('分类', pack.basic.classification) + kv('栖息地', pack.basic.habitat) +
            kv('食性', pack.basic.diet) + kv('保护等级', pack.basic.protection) +
            kv('体型', pack.basic.size) + kv('寿命', pack.basic.lifespan) +
            '</div>';
        if (pack.confusion.length) {
            html += '<div class="confuse-title">👀 易混淆物种辨析</div>' +
                '<div class="confuse-grid">' + pack.confusion.map(function (c) {
                    return '<div class="confuse-card"><div class="confuse-head">' +
                        XHSH.illustrate.portrait(c.other, { home: guessHome({ basic: { habitat: pack.basic.habitat } }), label: false }).replace('<svg', '<svg data-thumb="1"') +
                        '<div class="confuse-name">' + esc(c.other) + '</div></div>' +
                        '<div class="confuse-diff">' + esc(c.diff) + '</div></div>';
                }).join('') + '</div>';
        }
        html += '</div>';

        /* ② 生存剧本 */
        if (pack.story.scenes.length) {
            html += '<div class="card"><div class="card-title mb-10">② 生存剧本 · ' + esc(pack.story.title) + '</div>' +
                '<div class="story">' + pack.story.scenes.map(function (s, i) {
                    return '<div class="story-scene">' +
                        '<div class="story-side"><div class="story-time">' + esc(s.time) + '</div>' +
                        '<div class="story-line"></div></div>' +
                        '<div class="story-body"><span class="story-tag">' + esc(s.tag || '') + '</span>' +
                        '<p>' + esc(s.text) + '</p></div></div>';
                }).join('') + '</div></div>';
        }

        /* ③ 生态位图谱 */
        html += '<div class="card"><div class="card-title mb-10">③ 生态位图谱</div>' +
            (pack.ecology.role ? '<div class="eco-role">🧭 ' + esc(pack.ecology.role) + '</div>' : '') +
            '<div class="eco-wrap">' + XHSH.illustrate.web({
                name: pack.name, prey: pack.ecology.prey, predators: pack.ecology.predators, partners: pack.ecology.partners
            }) + '</div>' +
            (pack.ecology.chain ? '<div class="eco-chain">' + pack.ecology.chain.split('→').map(function (x) {
                return '<span class="chain-node">' + esc(x.trim()) + '</span>';
            }).join('<span class="chain-arrow">→</span>') + '</div>' : '') +
            '</div>';

        /* ④ 趣味思考题 */
        if (pack.quiz.length) {
            html += '<div class="card"><div class="card-title mb-10">④ 趣味思考题</div>' +
                pack.quiz.map(function (q, i) {
                    return '<details class="quiz-item"><summary>' +
                        '<span class="quiz-no">' + (i + 1) + '</span>' + esc(q.q) + '</summary>' +
                        '<div class="quiz-body">' + (q.steps.length ? '<ol class="quiz-steps">' + q.steps.map(function (s) {
                            return '<li>' + esc(s) + '</li>';
                        }).join('') + '</ol>' : '') +
                        (q.answer ? '<div class="quiz-answer">💡 ' + esc(q.answer) + '</div>' : '') +
                        '</div></details>';
                }).join('') + '</div>';
        }

        if (pack.funFact) {
            html += '<div class="card fun-fact">🎈 冷知识：' + esc(pack.funFact) + '</div>';
        }

        html += '<div class="row-gap mt-10">' +
            '<button class="btn btn-outline btn-sm" data-action="zoo-copy">📋 复制文字版</button>' +
            '<button class="btn btn-outline btn-sm" data-action="zoo-image">🖼️ 保存图片</button>' +
            '<button class="btn btn-outline btn-sm" data-action="zoo-again">🔄 重新生成</button>' +
            '</div>';
        return html;
    }

    /** 模型条 +（缺 Key 时）内联的 Key 配置卡片——动物百科自带，不需要跳去别的页面 */
    function renderModelBar() {
        var bar = $('zooModelBar');
        if (bar) {
            var label = (MODELS.find(function (m) { return m.value === modelName(); }) || {}).label || modelName();
            var ok = hasKey();
            bar.innerHTML =
                '<div class="mb-left"><span class="mb-dot ' + (ok ? 'good' : 'warn') + '"></span>' +
                '<span class="mb-model">' + esc(label.split('（')[0]) + '</span>' +
                '<span class="mb-muted">' + esc(hasKey() ? 'Key 已就绪' : '待填写 API Key') + '</span></div>' +
                '<div class="mb-right"><button class="btn btn-xs btn-outline" data-action="zoo-model">⚙️ 模型</button></div>';
        }
        showKeyPanel(!hasKey());
    }

    function showKeyPanel(show) {
        var panel = $('zooKeyPanel');
        if (!panel) return;
        if (!show) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
        panel.style.display = 'block';
        panel.innerHTML =
            '<div class="card-title">🔑 填一次 DeepSeek API Key 就能用</div>' +
            '<div class="muted small mt-6">动物百科默认使用 <b>DeepSeek V4.1 Flash 1017</b>。Key 只保存在这台设备，和「智慧花狮」共用同一份。</div>' +
            '<input class="input mt-10" id="zooKeyInput" type="password" placeholder="sk-…（粘贴后点保存并测试）" autocomplete="off">' +
            '<div class="row-gap mt-10"><button class="btn btn-primary btn-sm" data-action="zoo-save-key">保存并测试</button></div>';
    }

    async function saveKeyInline() {
        var key = XHSH.ai.cleanKey(($('zooKeyInput') || {}).value);
        if (!key) return XHSH.toast('请粘贴 API Key');
        if (!/^sk-/.test(key)) return XHSH.toast('Key 应该以 sk- 开头，请检查是否复制完整');
        var ai = XHSH.data.all.ai;
        ai.config = Object.assign({}, XHSH.ai.config(), {
            apiKey: key, provider: 'deepseek', baseUrl: XHSH.AI_PROVIDERS[0].baseUrl
        });
        XHSH.data.save('ai');
        renderModelBar();
        XHSH.toast('正在用 ' + modelName() + ' 测试连接…');
        var r = await testModel();
        XHSH.toast(r.ok ? '✅ 连接成功（' + modelName() + '）' : '❌ ' + r.message.slice(0, 70), r.ok ? 3000 : 5000);
        if (!r.ok) showKeyPanel(true);
    }

    async function openModelSettings() {
        var r = await XHSH.sheet({
            title: '动物百科 · 模型',
            message: '动物百科独立使用这个模型，不影响「智慧花狮」的模型设置。Key 与智慧花狮共用。',
            fields: [
                { name: 'model', label: '模型', type: 'select', value: modelName(), options: MODELS },
                { name: 'apiKey', label: 'API Key（可只在这一页填）', value: XHSH.ai.config().apiKey || '', placeholder: 'sk-…' },
                { name: 'custom', label: '自定义模型名（留空则用上面的）', value: MS().customModel || '', group: 'x' }
            ],
            okText: '保存',
            extraActions: [{ name: 'test', text: '🔌 测试连接' }]
        });
        if (!r) return;
        if (r.apiKey) {
            var ai = XHSH.data.all.ai;
            ai.config = Object.assign({}, XHSH.ai.config(), { apiKey: XHSH.ai.cleanKey(r.apiKey) });
        }
        MS().customModel = '';
        MS().model = r.model || 'deepseek-flash';
        XHSH.data.save('ai');
        renderModelBar();
        if (r.__action === 'test') {
            XHSH.toast('正在测试 ' + activeModel() + ' …');
            var t = await testModel();
            XHSH.sheet({
                title: t.ok ? '✅ 连接成功' : '❌ 连接失败',
                message: t.ok ? '模型：' + activeModel() + '\n回复：' + t.reply : t.message,
                okText: '知道了', cancelText: '知道了'
            });
            return;
        }
        XHSH.toast('已保存：' + activeModel());
    }

    /** 实际使用的模型名（允许自定义覆盖） */
    function activeModel() { return (MS().customModel || modelName()); }

    function renderHistory() {
        var packs = P().packs.slice(0, 12);
        var host = $('zooHistory');
        if (!packs.length) { host.innerHTML = '<div class="empty-inline">还没有学习包，输入一个动物名字试试 🐾</div>'; return; }
        host.innerHTML = packs.map(function (p) {
            return '<button class="zoo-chip" data-action="zoo-open" data-id="' + escAttr(p.id) + '">' +
                '<span class="zoo-chip-emoji">' + esc(p.pack.emoji || '🐾') + '</span>' + esc(p.pack.name) + '</button>';
        }).join('');
    }

    function renderResult() {
        var host = $('zooResult');
        if (!current) { host.innerHTML = ''; return; }
        host.innerHTML = renderPack(current.pack);
        host.querySelectorAll('details.quiz-item').forEach(function (d) { d.open = false; });
    }

    /* ---------------- 主流程 ---------------- */
    function setBusy(on) {
        busy = on;
        var btn = $('zooGenBtn');
        if (btn) { btn.disabled = on; btn.textContent = on ? '⏳ 正在搭建学习包…' : '🌿 生成学习包'; }
        $('zooLoading').style.display = on ? 'block' : 'none';
    }

    async function run(name) {
        if (busy) return;
        name = String(name || '').trim();
        if (!name) return XHSH.toast('先输入一个动物名字，如：小熊猫');
        // 动物百科使用独立模型（默认 DeepSeek V4.1 Flash 1017），Key 与智慧花狮共用同一份
        if (!ready()) {
            XHSH.toast('还没有可用的 API Key，请在下面的"模型"里填一次', 4000);
            showKeyPanel(true);
            return;
        }
        // 已有同一个动物 → 直接打开
        var hit = P().packs.find(function (p) { return (p.pack.name === name || p.query === name) && (p.model || '') === activeModel(); });
        if (hit) { current = hit; lastResult = hit.pack; renderResult(); XHSH.toast('已打开缓存的学习包'); return; }

        setBusy(true);
        try {
            var pack = await generate(name);
            var entry = { id: 'pk_' + Date.now().toString(36), query: name, at: new Date().toISOString(), model: activeModel(), pack: pack };
            P().packs.unshift(entry);
            if (P().packs.length > 60) P().packs.length = 60;
            XHSH.data.save('ai');
            current = entry; lastResult = pack;
            setText('zooResult'); renderResult(); renderHistory();
            XHSH.toast('学习包已生成 🌿', 2500);
        } catch (e) {
            XHSH.toast('生成失败：' + e.message.slice(0, 60), 4500);
            if (e.needKey) showKeyPanel(true);
        } finally { setBusy(false); }
    }
    function setText(id) { var el = $(id); if (el) el.innerHTML = ''; }

    /* 复制文字版（方便贴到笔记） */
    function textVersion(pack) {
        var L = [];
        L.push('🐾 ' + pack.name + (pack.scientificName ? '（' + pack.scientificName + '）' : ''));
        L.push('[基础卡片]');
        [['分类', pack.basic.classification], ['栖息地', pack.basic.habitat], ['食性', pack.basic.diet],
         ['保护等级', pack.basic.protection], ['体型', pack.basic.size], ['寿命', pack.basic.lifespan]].forEach(function (r) {
            if (r[1]) L.push('· ' + r[0] + '：' + r[1]);
        });
        pack.confusion.forEach(function (c) { L.push('· 易混：' + c.other + ' — ' + c.diff); });
        L.push('[生存剧本] ' + pack.story.title);
        pack.story.scenes.forEach(function (s) { L.push('· ' + s.time + '：' + s.text); });
        L.push('[生态位] ' + pack.ecology.role);
        if (pack.ecology.chain) L.push('· 食物链：' + pack.ecology.chain);
        if (pack.ecology.predators.length) L.push('· 天敌：' + pack.ecology.predators.join('、'));
        if (pack.ecology.partners.length) L.push('· 伙伴：' + pack.ecology.partners.join('、'));
        pack.quiz.forEach(function (q, i) {
            L.push('[思考 ' + (i + 1) + '] ' + q.q);
            q.steps.forEach(function (s, j) { L.push('   引导' + (j + 1) + '：' + s); });
            if (q.answer) L.push('   答案：' + q.answer);
        });
        if (pack.funFact) L.push('[冷知识] ' + pack.funFact);
        return L.join('\n');
    }

    function saveImage() {
        if (!lastResult) return;
        var svg = XHSH.illustrate.portrait(lastResult.name, { home: guessHome(lastResult) });
        var img = new Image();
        img.onload = function () {
            var c = document.createElement('canvas');
            c.width = 800; c.height = 600;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, 800, 600);
            var a = document.createElement('a');
            a.download = lastResult.name + '-画像.png';
            a.href = c.toDataURL('image/png');
            a.click();
            XHSH.toast('图片已保存 🖼️');
        };
        img.onerror = function () { XHSH.toast('图片导出失败，可右键图片另存'); };
        img.src = XHSH.illustrate.toDataURL(svg);
    }

    /* ---------------- 模块 ---------------- */
    window.ZooModule = {
        mount: function () {
            renderModelBar();
            renderHistory();
            renderResult();
            if (!P().packs.length) {
                $('zooResult').innerHTML = '<div class="zoo-hero"><div class="lion-face">🦁</div>' +
                    '<div class="zoo-hero-title">给我一个动物名字</div>' +
                    '<div class="muted small">我会为它搭一套"沉浸式博物学习包"：基础卡片 · 生存剧本 · 生态位图谱 · 趣味思考题</div>' +
                    '<div class="zoo-samples">' + ['小熊猫', '水獭', '雪豹', '大熊猫', '抹香鲸', '穿山甲'].map(function (n) {
                        return '<button class="zoo-chip" data-action="zoo-sample" data-name="' + escAttr(n) + '">' + esc(n) + '</button>';
                    }).join('') + '</div></div>';
            }
        }
    };

    XHSH.on('zoo-gen', function () { run(($('zooInput') || {}).value); });
    XHSH.on('zoo-sample', function (el, ev, ds) { var i = $('zooInput'); if (i) i.value = ds.name; run(ds.name); });
    XHSH.on('zoo-open', function (el, ev, ds) {
        var p = P().packs.find(function (x) { return x.id === ds.id; });
        if (!p) return;
        current = p; lastResult = p.pack; renderResult();
        $('zooResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    XHSH.on('zoo-again', function () {
        if (!current) return;
        var name = current.query;
        P().packs = P().packs.filter(function (p) { return p.id !== current.id; });
        current = null;
        XHSH.data.save('ai');
        run(name);
    });
    XHSH.on('zoo-copy', function () {
        if (!lastResult) return;
        navigator.clipboard.writeText(textVersion(lastResult))
            .then(function () { XHSH.toast('已复制文字版 📋'); })
            .catch(function () { XHSH.toast('复制失败'); });
    });
    XHSH.on('zoo-image', saveImage);
    XHSH.on('zoo-model', openModelSettings);
    XHSH.on('zoo-save-key', saveKeyInline);

})(window.XHSH);
