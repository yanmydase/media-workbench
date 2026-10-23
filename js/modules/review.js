/*!
 * 小小花狮 · 每日复盘
 * - 正文 / 心情 / 感恩三件事
 * - 草稿自动保存（输入后 600ms 落到本地）
 * - 历史：按日期分组，最近 30 条，点击可回看全文
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr, $ = function (id) { return document.getElementById(id); };
    var MOODS = ['😄 超棒', '🙂 不错', '😐 一般', '😔 低落', '😤 烦躁'];
    var draftTimer = null;

    function R() { return XHSH.data.all.review; }
    function entryOf(ds) { return R().items.find(function (r) { return r.date === ds; }); }

    function collect() {
        return {
            content: $('reviewToday').value.trim(),
            gratitude: [$('gratitude1').value.trim(), $('gratitude2').value.trim(), $('gratitude3').value.trim()],
            mood: R().todayMood || '🙂'
        };
    }

    function renderMood() {
        var cur = R().todayMood || '';
        document.querySelectorAll('#moodSelector .chip').forEach(function (c) {
            c.classList.toggle('active', c.dataset.mood === cur);
        });
    }

    function render() {
        var today = XHSH.today();
        var tr = entryOf(today);
        var draft = R().draft && R().draft.date === today ? R().draft : null;
        var src = draft || tr || {};
        $('reviewToday').value = src.content || '';
        var g = src.gratitude || ['', '', ''];
        $('gratitude1').value = g[0] || '';
        $('gratitude2').value = g[1] || '';
        $('gratitude3').value = g[2] || '';
        if (draft && draft.mood) R().todayMood = draft.mood;
        renderMood();
        updateBadge();
        renderHistory();
    }

    function updateBadge() {
        var badge = document.getElementById('reviewBadge');
        if (!badge) return;
        badge.style.display = entryOf(XHSH.today()) ? 'none' : 'inline-block';
    }

    function renderHistory() {
        var items = R().items.filter(function (r) { return r.date !== XHSH.today(); })
            .sort(function (a, b) { return b.date.localeCompare(a.date); })
            .slice(0, 30);
        var host = $('reviewHistory');
        if (!items.length) {
            host.innerHTML = '<div class="empty-inline">暂无历史复盘</div>';
            return;
        }
        host.innerHTML = items.map(function (r) {
            var text = (r.content || '').replace(/\s+/g, ' ');
            var short = text.length > 60 ? text.slice(0, 60) + '…' : (text || '（仅填写了感恩）');
            return '<div class="hist-item" data-action="review-open" data-date="' + escAttr(r.date) + '">' +
                '<div class="hist-head"><span>' + esc(r.date) + ' 周' + XHSH.WEEKDAYS[XHSH.parseDate(r.date).getDay()] + '</span>' +
                '<span>' + esc(r.mood || '') + '</span></div>' +
                '<div class="hist-body">' + esc(short) + '</div></div>';
        }).join('');
    }

    function autoDraft() {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(function () {
            var c = collect();
            if (!c.content && !c.gratitude.some(Boolean)) return;
            R().draft = { date: XHSH.today(), content: c.content, gratitude: c.gratitude, mood: c.mood, savedAt: XHSH.nowISO() };
            XHSH.data.save('review');
        }, 600);
    }

    async function save() {
        var c = collect();
        if (!c.content && !c.gratitude.some(Boolean)) {
            XHSH.toast('请至少填写复盘内容或一条感恩事项');
            return;
        }
        var ds = XHSH.today();
        var rv = { id: 'r_' + ds, date: ds, content: c.content, mood: c.mood, gratitude: c.gratitude, updatedAt: XHSH.nowISO() };
        var idx = R().items.findIndex(function (r) { return r.date === ds; });
        if (idx >= 0) R().items[idx] = rv; else R().items.push(rv);
        R().draft = null;
        XHSH.data.save('review');
        render();
        XHSH.toast('复盘已保存 ✅');
    }

    function setMood(el, ds) {
        var mood = el.dataset.mood;
        document.querySelectorAll('#moodSelector .chip').forEach(function (c) { c.classList.toggle('active', c === el); });
        R().todayMood = mood;
        XHSH.data.save('review');
        autoDraft();
    }

    async function openHistory(date) {
        var r = entryOf(date);
        if (!r) return;
        await XHSH.sheet({
            title: '📝 ' + date + ' 复盘 ' + (r.mood || ''),
            fields: [
                { name: 'content', label: '内容', type: 'textarea', value: r.content || '' },
                { name: 'g1', label: '感恩 1', value: (r.gratitude || [])[0] || '' },
                { name: 'g2', label: '感恩 2', value: (r.gratitude || [])[1] || '' },
                { name: 'g3', label: '感恩 3', value: (r.gratitude || [])[2] || '' }
            ],
            okText: '关闭',
            cancelText: '关闭'
        });
    }

    window.ReviewModule = {
        mount: render,
        badge: updateBadge
    };

    XHSH.on('review-save', save);
    XHSH.on('review-mood', function (el) { setMood(el); });
    XHSH.on('review-open', function (el, ev, ds) { openHistory(ds.date); });

    ['reviewToday', 'gratitude1', 'gratitude2', 'gratitude3'].forEach(function (id) {
        document.addEventListener('DOMContentLoaded', function () {
            var el = $(id);
            if (el) el.addEventListener('input', autoDraft);
        });
    });

})(window.XHSH);
