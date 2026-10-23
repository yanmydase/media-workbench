/*!
 * 小小花狮 · 智能体工作台（子模块占位区）
 * - 卡片栅格：每个卡片 = 一个智能体；点击进入对话
 * - 「+ 新建智能体」：自定义名称/图标/提示词/可用工具/快捷指令
 * - 支持导入/导出 JSON，内置智能体可停用/恢复
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr, $ = function (id) { return document.getElementById(id); };
    var A = function () { return XHSH.data.all.ai; };

    function render() {
        var agents = XHSH.agents.list();
        var disabled = A().disabledAgents || [];
        $('agentCount').textContent = agents.length + ' 个智能体';
        $('agentGrid').innerHTML = agents.map(function (a) {
            return '<div class="agent-card" role="button" tabindex="0" data-action="agent-open" data-id="' + escAttr(a.id) + '">' +
                '<div class="agent-icon" style="background:' + escAttr(a.color || 'var(--gradient-1)') + '">' + esc(a.icon || '🧩') + '</div>' +
                '<div class="agent-name">' + esc(a.name) + '</div>' +
                '<div class="agent-desc">' + esc(a.desc || '自定义智能体') + '</div>' +
                '<div class="agent-foot">' +
                '<span class="agent-tag">' + (a.builtin ? '内置' : '自定义') + '</span>' +
                (a.tools && a.tools.length ? '<span class="agent-tag tool">工具 ×' + a.tools.length + '</span>' : '') +
                (a.custom ? '<button class="agent-mini" data-action="agent-delete" data-prevent="1" data-id="' + escAttr(a.id) + '">删除</button>' : '') +
                '</div></div>';
        }).join('') +
            '<div class="agent-card add" role="button" tabindex="0" data-action="agent-create">' +
            '<div class="agent-icon" style="background:var(--bg);color:var(--text-secondary);">＋</div>' +
            '<div class="agent-name">新建智能体</div>' +
            '<div class="agent-desc">给 DeepSeek 一段专属人设与工具，让它只做一件事</div>' +
            '</div>';

        $('agentDisabled').innerHTML = disabled.length ? '已停用的内置智能体：' + disabled.map(function (id) {
            var b = XHSH.agents.BUILTIN.find(function (x) { return x.id === id; });
            return '<button class="chip" data-action="agent-restore" data-id="' + escAttr(id) + '">' + esc(b ? b.icon + ' ' + b.name : id) + ' · 恢复</button>';
        }).join('') : '';
    }

    function toolOptions(value) {
        return Object.keys(XHSH.agents.TOOLS).map(function (k) {
            return { value: k, label: ({ stats: '📊 综合统计', review: '🪞 最近复盘', fitness: '💪 近 7 天运动', plan: '✅ 今日打卡' })[k] || k };
        });
    }

    async function create(existing) {
        var r = await XHSH.sheet({
            title: existing ? '编辑智能体' : '新建智能体',
            fields: [
                { name: 'icon', label: '图标（emoji）', value: existing ? existing.icon : '🧩' },
                { name: 'name', label: '名称', value: existing ? existing.name : '', placeholder: '如：小红书文案专家' },
                { name: 'desc', label: '一句话介绍', value: existing ? existing.desc : '' },
                { name: 'systemPrompt', label: '系统提示词（人设 + 规则）', type: 'textarea', value: existing ? existing.systemPrompt : '' },
                { name: 'tool', label: '允许读取的数据（可留空）', type: 'select', value: existing && existing.tools ? existing.tools[0] : '',
                  options: [{ value: '', label: '不读取任何数据' }].concat(toolOptions()) },
                { name: 'starters', label: '快捷指令（每行一条，可留空）', type: 'textarea', value: existing ? (existing.starters || []).join('\n') : '' }
            ],
            okText: existing ? '保存' : '创建',
            validate: function (v) {
                if (!v.name) return '请填写名称';
                if (!v.systemPrompt) return '请填写系统提示词';
                return '';
            }
        });
        if (!r) return;
        XHSH.agents.upsert({
            id: existing ? existing.id : ('agent_' + Date.now()),
            icon: r.icon || '🧩', name: r.name, desc: r.desc,
            systemPrompt: r.systemPrompt,
            tools: r.tool ? [r.tool] : [],
            starters: r.starters.split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
            placeholder: '和 ' + r.name + ' 聊聊…',
            color: 'var(--gradient-6)', custom: true
        });
        render();
        XHSH.toast(existing ? '智能体已更新' : '智能体已创建 🧩');
    }

    async function removeAgent(id) {
        var a = XHSH.agents.get(id);
        if (!a) return;
        if (!(await XHSH.confirm('删除智能体「' + a.name + '」？', '删除'))) return;
        XHSH.agents.remove(id);
        render();
        XHSH.toast('已删除');
    }

    async function importAgents() {
        var r = await XHSH.sheet({
            title: '导入智能体（JSON）',
            fields: [{ name: 'json', label: '粘贴 JSON（数组或单个对象）', type: 'textarea', value: '' }],
            okText: '导入'
        });
        if (!r) return;
        try {
            var n = XHSH.agents.importJSON(r.json);
            render();
            XHSH.toast('已导入 ' + n + ' 个智能体 ✅');
        } catch (e) { XHSH.toast('JSON 解析失败：' + e.message); }
    }

    async function exportAgents() {
        var text = XHSH.agents.exportJSON();
        var r = await XHSH.sheet({
            title: '导出自定义智能体',
            message: '复制下面的 JSON 保存即可，换设备后可一键导入。',
            fields: [{ name: 'json', label: 'JSON', type: 'textarea', value: text }],
            okText: '复制', cancelText: '关闭'
        });
        if (r) {
            try { await navigator.clipboard.writeText(text); XHSH.toast('已复制到剪贴板 📋'); }
            catch (e) { XHSH.toast('复制失败，请手动选择文本'); }
        }
    }

    window.AgentsModule = {
        mount: render,
        open: function (id) {
            var a = XHSH.agents.get(id);
            if (!a) return XHSH.toast('智能体不存在');
            // 有专属页面的智能体（智慧花狮 / 动物百科）直接跳过去
            var page = a.page || '';
            if (page) {
                try { return XHSH.router.go(page); }
                catch (e) { console.error('[agent-open]', e); return XHSH.toast('打开失败：' + e.message); }
            }
            // 自定义智能体：在「智慧花狮」页里使用
            XHSH.router.go('ai');
            setTimeout(function () { XHSH.toast('自定义智能体在「智慧花狮」页的模型条里切换：' + a.name, 3500); }, 250);
        }
    };

    XHSH.on('agent-open', function (el, ev, ds) { AgentsModule.open(ds.id); });
    XHSH.on('agent-create', function () { create(null); });
    XHSH.on('agent-delete', function (el, ev, ds) { removeAgent(ds.id); });
    XHSH.on('agent-edit', function (el, ev, ds) { create(XHSH.agents.get(ds.id)); });
    XHSH.on('agent-restore', function (el, ev, ds) { XHSH.agents.restore(ds.id); render(); XHSH.toast('已恢复'); });
    XHSH.on('agent-import', importAgents);
    XHSH.on('agent-export', exportAgents);

})(window.XHSH);
