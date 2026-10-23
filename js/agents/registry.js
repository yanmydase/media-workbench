/*!
 * 小小花狮 · 智能体注册表
 *
 * 这里是「智能体工作台」真正的扩展点：
 *  - 每一项 = 一个智能体 = 一段系统提示词 + 一组快捷指令 + 可选的工具函数
 *  - 不在代码里写死的智能体，可以存到数据里（ai.agents），由用户在界面上添加/编辑/导入导出
 *
 * 新增一个内置智能体只需要在 BUILTIN 里追加一项：
 * {
 *   id: 'weekly-review',          // 唯一 id
 *   name: '周复盘助手',
 *   icon: '🗓️',
 *   desc: '一句话介绍',
 *   builtin: true,
 *   color: 'var(--gradient-4)',
 *   systemPrompt: '你是……',
 *   starters: ['帮我复盘这一周', ...],       // 快捷输入
 *   tools: ['stats', 'review'],             // 允许使用的工具（见 TOOLS）
 *   model: '',                              // 留空 = 跟随全局设置
 *   placeholder: '想聊点什么…'
 * }
 */
(function (XHSH) {
    'use strict';

    /* ---------------- 工具：让智能体"看到"你的数据（只读、脱敏、可控） ---------------- */
    var TOOLS = {
        /** 打卡 / 运动 / 学习 / 收入 的简要统计 */
        stats: function () {
            var D = XHSH.data.all;
            var ex = D.fitness.exercises.filter(function (e) { return e.date === XHSH.today(); });
            var mins = ex.reduce(function (s, e) { return s + (Number(e.minutes) || 0); }, 0);
            var inc = D.incomes.items.filter(function (x) { return !x.deletedAt && String(x.date).slice(0, 7) === XHSH.today().slice(0, 7); });
            var incSum = inc.reduce(function (s, x) { return s + x.amountCents; }, 0);
            var learned = Object.keys(D.english.learned).filter(function (k) { return D.english.learned[k].reviewCount > 0; }).length;
            return [
                '今天：' + XHSH.today(),
                '今日运动：' + ex.length + ' 项，共 ' + mins + ' 分钟',
                '英语：累计掌握 ' + learned + ' 词，连续学习 ' + D.english.studyDays.length + ' 天',
                '本月收入合计：' + XHSH.money.format(incSum)
            ].join('\n');
        },
        /** 最近几条复盘（最多 5 条，每条截断 200 字） */
        review: function () {
            return (XHSH.data.all.review.items || []).slice(-5).map(function (r) {
                return r.date + ' ' + (r.mood || '') + '：' + String(r.content || '').slice(0, 200);
            }).join('\n') || '（暂无复盘记录）';
        },
        /** 近 7 天运动明细 */
        fitness: function () {
            var D = XHSH.data.all;
            var out = [];
            for (var i = 6; i >= 0; i--) {
                var ds = XHSH.dateOffset(-i);
                var list = D.fitness.exercises.filter(function (e) { return e.date === ds; });
                out.push(ds + '：' + (list.length ? list.map(function (e) { return e.type + ' ' + e.minutes + ' 分钟'; }).join('、') : '无记录'));
            }
            return out.join('\n');
        },
        /** 今日打卡任务完成情况 */
        plan: function () {
            var D = XHSH.data.all, ds = XHSH.today();
            var tasks = (D.plan.tasks || []).filter(function (t) { return t.enabled !== false; });
            var done = D.plan.checkins[ds] || [];
            return tasks.map(function (t) { return (done.indexOf(t.id) >= 0 ? '✅ ' : '⬜ ') + t.name; }).join('\n');
        }
    };

    function runTools(names) {
        if (!names || !names.length) return '';
        var parts = [];
        names.forEach(function (n) {
            if (!TOOLS[n]) return;
            try { parts.push('【' + n + '】\n' + TOOLS[n]()); } catch (e) { }
        });
        return parts.length ? '\n\n以下是用户当前的真实数据（供你参考，不要编造）：\n' + parts.join('\n\n') : '';
    }

    /* ---------------- 内置智能体（v2.6：精简为 2 个） ---------------- */
    var BUILTIN = [
        {
            id: 'wisdom',
            name: '智慧花狮',
            icon: '🦁',
            desc: '伴你成行的智慧小伙伴：陪你学、陪你写、陪你聊，也能画图讲清楚',
            builtin: true,
            color: 'var(--gradient-1)',
            tools: ['stats'],
            page: 'ai',
            placeholder: '问我任何事，或说"帮我写一段…"',
            systemPrompt: [
                '你是"智慧花狮"，一个陪伴式的中文智慧小伙伴，用户是一名在校大学生。',
                '风格：温暖、机敏、有耐心，像身边那个懂得多又不摆架子的朋友；先理解需求，再给可执行的答案。',
                '能力：解释概念（用比喻和例子）、写作与修改、学习与备考规划、情绪陪伴、拆解复杂问题。',
                '规则：不确定的事实要说明不确定；涉及健康/法律/金融只给一般性信息并建议求助专业人士；答案用短段落或要点，避免长篇大论。'
            ].join('\n'),
            starters: ['帮我解释一下这个概念', '陪我把今天的事理一理', '帮我改一段文字', '给我讲讲这个动物']
        },
        {
            id: 'zoo',
            name: '动物百科',
            icon: '🐾',
            desc: '输入动物名字，生成沉浸式博物学习包：基础卡片 · 生存剧本 · 生态位图谱 · 趣味思考题',
            builtin: true,
            color: 'var(--gradient-3)',
            tools: [],
            page: 'zoo',
            placeholder: '输入动物名字，如：小熊猫 / 水獭 / 雪豹',
            systemPrompt: '你是动物百科学习包生成器，面向中小学生，输出结构化、科学、生动的博物学习内容。',
            starters: ['小熊猫', '水獭', '雪豹', '穿山甲']
        }
    ];

    /** 页面名 → 智能体（用于"点智能体就跳到它的页面"） */
    function pageOf(id) {
        var a = get(id);
        return (a && a.page) || '';
    }
    function customAgents() {
        var A = XHSH.data.all.ai;
        if (!Array.isArray(A.agents)) A.agents = [];
        return A.agents;
    }

    function list() {
        var disabled = XHSH.data.all.ai.disabledAgents || [];
        var builtins = BUILTIN.filter(function (a) { return disabled.indexOf(a.id) < 0; });
        return builtins.concat(customAgents().filter(function (a) { return !a.deletedAt; }));
    }

    function get(id) {
        return list().find(function (a) { return a.id === id; }) || null;
    }

    /** 组装消息：系统提示词 + 工具数据 + 历史 + 用户输入 */
    function buildMessages(agent, userText, history) {
        var sys = (agent && agent.systemPrompt) || XHSH.data.all.ai.config.systemPrompt || XHSH.DEFAULT_AI_CONFIG.systemPrompt;
        var toolText = runTools(agent && agent.tools);
        var msgs = [{ role: 'system', content: sys + toolText }];
        (history || []).slice(-8).forEach(function (m) {
            if (m && (m.role === 'user' || m.role === 'assistant') && m.content) msgs.push({ role: m.role, content: m.content });
        });
        msgs.push({ role: 'user', content: userText });
        return msgs;
    }

    function upsert(agent) {
        var A = XHSH.data.all.ai;
        var customs = customAgents();
        var existing = customs.find(function (a) { return a.id === agent.id; });
        if (existing) Object.assign(existing, agent, { updatedAt: XHSH.nowISO() });
        else customs.push(Object.assign({ id: 'agent_' + Date.now(), custom: true, createdAt: XHSH.nowISO() }, agent));
        A.agents = customs;
        XHSH.data.save('ai');
    }

    function remove(id) {
        var customs = customAgents();
        var a = customs.find(function (x) { return x.id === id; });
        if (a) { a.deletedAt = XHSH.nowISO(); a.updatedAt = XHSH.nowISO(); XHSH.data.save('ai'); return true; }
        // 内置智能体只"停用"，不删除
        var A = XHSH.data.all.ai;
        A.disabledAgents = (A.disabledAgents || []).concat([id]);
        XHSH.data.save('ai');
        return true;
    }

    function restore(id) {
        var A = XHSH.data.all.ai;
        A.disabledAgents = (A.disabledAgents || []).filter(function (x) { return x !== id; });
        XHSH.data.save('ai');
    }

    /** 导入 JSON 格式的智能体定义（数组或单个对象） */
    function importJSON(text) {
        var parsed = JSON.parse(text);
        var arr = Array.isArray(parsed) ? parsed : (parsed.agents || [parsed]);
        arr.forEach(function (a) {
            if (!a || !a.systemPrompt) return;
            upsert({
                id: a.id || ('agent_' + Date.now() + Math.floor(Math.random() * 1000)),
                name: a.name || '未命名智能体', icon: a.icon || '🧩', desc: a.desc || '',
                systemPrompt: a.systemPrompt, starters: a.starters || [], tools: a.tools || [],
                model: a.model || '', placeholder: a.placeholder || '想聊点什么…',
                color: a.color || 'var(--gradient-6)', custom: true
            });
        });
        return arr.length;
    }

    function exportJSON() {
        return JSON.stringify(customAgents().filter(function (a) { return !a.deletedAt; }), null, 2);
    }

    XHSH.agents = {
        BUILTIN: BUILTIN,
        TOOLS: TOOLS,
        list: list,
        get: get,
        pageOf: pageOf,
        buildMessages: buildMessages,
        upsert: upsert,
        remove: remove,
        restore: restore,
        importJSON: importJSON,
        exportJSON: exportJSON,
        runTools: runTools
    };

})(window.XHSH);
