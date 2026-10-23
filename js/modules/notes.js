/*!
 * 小小花狮 · 随笔笔记
 * - 合并原 Freeyan 页面与无入口的「✍️ 随笔笔记」弹层
 * - 标题 + 内容 + 标签，支持编辑、删除、全文检索
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr, $ = function (id) { return document.getElementById(id); };
    var keyword = '';

    function N() { return XHSH.data.all.notes; }
    function items() { return (N().items || []).filter(function (x) { return !x.deletedAt; }); }

    function render() {
        var kw = keyword.trim().toLowerCase();
        var list = items().filter(function (n) {
            if (!kw) return true;
            return (n.title + ' ' + n.content + ' ' + (n.tags || '')).toLowerCase().indexOf(kw) >= 0;
        }).sort(function (a, b) { return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')); });

        $('noteCount').textContent = items().length + ' 条';
        var host = $('noteList');
        if (!list.length) {
            host.innerHTML = '<div class="empty-state"><div class="empty-icon">🌸</div><div>' + (kw ? '没有匹配的笔记' : '还没有笔记，记录下此刻的想法吧') + '</div></div>';
            return;
        }
        host.innerHTML = list.map(function (n) {
            var date = (n.updatedAt || n.createdAt || '').slice(0, 10);
            var body = (n.content || '').replace(/\s+/g, ' ');
            if (body.length > 120) body = body.slice(0, 120) + '…';
            return '<div class="note-card" data-action="note-open" data-id="' + escAttr(n.id) + '">' +
                '<div class="note-head"><span class="note-title">' + esc(n.title || '无标题') + '</span>' +
                '<span class="note-date">' + esc(date) + '</span></div>' +
                '<div class="note-body">' + esc(body) + '</div>' +
                (n.tags ? '<div class="note-tags">' + String(n.tags).split(/[,，\s]+/).filter(Boolean).map(function (t) {
                    return '<span class="chip chip-mini">#' + esc(t) + '</span>';
                }).join('') + '</div>' : '') +
                '<div class="note-actions">' +
                '<button class="btn btn-xs btn-outline" data-action="note-delete" data-prevent="1" data-id="' + escAttr(n.id) + '">删除</button>' +
                '</div></div>';
        }).join('');
    }

    function form(existing) {
        return XHSH.sheet({
            title: existing ? '编辑笔记' : '新建笔记',
            fields: [
                { name: 'title', label: '标题', value: existing ? existing.title : '', placeholder: '一句话标题' },
                { name: 'content', label: '内容', type: 'textarea', value: existing ? existing.content : '', placeholder: '写下你的想法…' },
                { name: 'tags', label: '标签（逗号分隔，可留空）', value: existing ? existing.tags : '', placeholder: '灵感, 工作' }
            ],
            okText: '保存',
            validate: function (v) { return (v.title || v.content) ? '' : '标题和内容至少填一项'; }
        });
    }

    async function create() {
        var r = await form(null);
        if (!r) return;
        N().items.push({
            id: 'note_' + Date.now(), title: r.title, content: r.content, tags: r.tags,
            createdAt: XHSH.nowISO(), updatedAt: XHSH.nowISO()
        });
        XHSH.data.save('notes');
        render();
        XHSH.toast('笔记已保存 ✍️');
    }

    async function openNote(id) {
        var n = items().find(function (x) { return x.id === id; });
        if (!n) return;
        var r = await form(n);
        if (!r) return;
        n.title = r.title; n.content = r.content; n.tags = r.tags;
        n.updatedAt = XHSH.nowISO();
        XHSH.data.save('notes');
        render();
        XHSH.toast('已更新');
    }

    async function remove(id) {
        var n = items().find(function (x) { return x.id === id; });
        if (!n) return;
        if (!(await XHSH.confirm('删除笔记「' + (n.title || '无标题') + '」？', '删除'))) return;
        n.deletedAt = XHSH.nowISO();
        n.updatedAt = XHSH.nowISO();
        XHSH.data.save('notes');
        render();
        XHSH.toast('已删除');
    }

    window.NotesModule = { mount: render };

    XHSH.on('note-create', create);
    XHSH.on('note-open', function (el, ev, ds) { openNote(ds.id); });
    XHSH.on('note-delete', function (el, ev, ds) { remove(ds.id); });
    XHSH.on('note-search', function (el) { keyword = el.value || ''; render(); });

})(window.XHSH);
