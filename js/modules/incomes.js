/*!
 * 小小花狮 · 收入记账
 * - 金额以"分"存储（amountCents），彻底避免浮点误差
 * - 本月 / 今日 / 累计 + 收入日历 + 按日分组流水
 * - 支持编辑与删除（删除写入墓碑，云同步时不会被"复活"）
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr, $ = function (id) { return document.getElementById(id); };
    var calYear, calMonth;

    function I() { return XHSH.data.all.incomes; }
    function items() { return (I().items || []).filter(function (x) { return !x.deletedAt; }); }
    function fmt(cents) { return XHSH.money.format(cents); }

    function render() {
        if (calYear == null) { var n = new Date(); calYear = n.getFullYear(); calMonth = n.getMonth(); }
        var ds = XHSH.today();
        var monthKey = ds.slice(0, 7);
        var total = 0, todayTotal = 0, monthTotal = 0;
        items().forEach(function (inc) {
            total += inc.amountCents;
            if (inc.date === ds) todayTotal += inc.amountCents;
            if (String(inc.date).slice(0, 7) === monthKey) monthTotal += inc.amountCents;
        });
        $('incomeMonth').textContent = fmt(monthTotal);
        $('incomeToday').textContent = fmt(todayTotal);
        $('incomeTotal').textContent = fmt(total);
        if (!$('incomeDate').value) $('incomeDate').value = ds;
        renderCalendar();
        renderList();
    }

    function renderCalendar() {
        var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        var firstDay = new Date(calYear, calMonth, 1).getDay();
        var ds = XHSH.today();
        $('incomeCalLabel').textContent = calYear + '年' + (calMonth + 1) + '月';

        var daySum = {};
        items().forEach(function (inc) {
            var p = String(inc.date).split('-');
            if (parseInt(p[0], 10) === calYear && parseInt(p[1], 10) === calMonth + 1) {
                var d = parseInt(p[2], 10);
                daySum[d] = (daySum[d] || 0) + inc.amountCents;
            }
        });

        var html = XHSH.WEEKDAYS.map(function (w) { return '<div class="cal-day-h">' + w + '</div>'; }).join('');
        var prevDays = new Date(calYear, calMonth, 0).getDate();
        for (var i = firstDay - 1; i >= 0; i--) html += '<div class="cal-day other">' + (prevDays - i) + '</div>';
        for (var d = 1; d <= daysInMonth; d++) {
            var dateKey = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            var cls = 'cal-day';
            if (dateKey === ds) cls += ' today';
            if (daySum[d]) cls += ' full'; else cls += ' none';
            html += '<div class="' + cls + '" role="button" tabindex="0" title="' + escAttr(daySum[d] ? fmt(daySum[d]) : '无记录') +
                '" data-action="income-pick-date" data-date="' + escAttr(dateKey) + '">' + d + '</div>';
        }
        $('incomeCalendar').innerHTML = html;
    }

    function renderList() {
        var host = $('incomeList');
        var list = items().slice().sort(function (a, b) {
            return String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });
        if (!list.length) {
            host.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><div>还没有收入记录</div></div>';
            return;
        }
        var groups = {}, order = [];
        list.forEach(function (inc) {
            if (!groups[inc.date]) { groups[inc.date] = { items: [], total: 0 }; order.push(inc.date); }
            groups[inc.date].items.push(inc);
            groups[inc.date].total += inc.amountCents;
        });
        host.innerHTML = order.map(function (date) {
            var g = groups[date];
            var dow = XHSH.WEEKDAYS[XHSH.parseDate(date).getDay()];
            return '<div class="inc-group"><div class="inc-date">' + esc(date) + ' 周' + dow + ' · ' + esc(fmt(g.total)) + '</div>' +
                g.items.map(function (inc) {
                    return '<div class="inc-row">' +
                        '<span class="inc-ico">💵</span>' +
                        '<span class="inc-src">' + esc(inc.source) + '</span>' +
                        '<span class="inc-amt">+' + esc(fmt(inc.amountCents)) + '</span>' +
                        '<button class="btn btn-xs btn-outline" data-action="income-edit" data-prevent="1" data-id="' + escAttr(inc.id) + '">✏️</button>' +
                        '<button class="btn btn-xs btn-outline" data-action="income-delete" data-prevent="1" data-id="' + escAttr(inc.id) + '">✕</button>' +
                        '</div>';
                }).join('') + '</div>';
        }).join('');
    }

    function incomeForm(existing) {
        return XHSH.sheet({
            title: existing ? '编辑收入' : '记录收入',
            fields: [
                { name: 'source', label: '收入来源', placeholder: '如：写稿、设计、兼职…', value: existing ? existing.source : '' },
                { name: 'amount', label: '金额（元）', type: 'number', step: '0.01', min: '0.01', inputmode: 'decimal', value: existing ? (existing.amountCents / 100).toFixed(2) : '' },
                { name: 'date', label: '日期', type: 'date', value: existing ? existing.date : ($('incomeDate').value || XHSH.today()) }
            ],
            okText: existing ? '保存修改' : '记录',
            validate: function (v) {
                if (!v.source) return '请输入收入来源';
                if (!(parseFloat(v.amount) > 0)) return '请输入有效金额';
                if (!v.date) return '请选择日期';
                return '';
            }
        });
    }

    async function add() {
        // 页面上原有的快捷输入框仍然可用
        var source = $('incomeSource').value.trim();
        var cents = XHSH.money.toCents($('incomeAmount').value);
        var date = $('incomeDate').value || XHSH.today();
        if (source && cents > 0) {
            push(source, cents, date);
            $('incomeSource').value = '';
            $('incomeAmount').value = '';
            return;
        }
        var r = await incomeForm(null);
        if (!r) return;
        push(r.source, XHSH.money.toCents(r.amount), r.date);
    }

    function push(source, cents, date) {
        I().items.push({
            id: 'inc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            source: source, amountCents: cents, date: date,
            createdAt: XHSH.nowISO(), updatedAt: XHSH.nowISO()
        });
        XHSH.data.save('incomes');
        render();
        XHSH.toast('收入已记录 💰 +' + fmt(cents));
    }

    async function edit(id) {
        var inc = items().find(function (x) { return x.id === id; });
        if (!inc) return;
        var r = await incomeForm(inc);
        if (!r) return;
        inc.source = r.source;
        inc.amountCents = XHSH.money.toCents(r.amount);
        inc.date = r.date;
        inc.updatedAt = XHSH.nowISO();
        XHSH.data.save('incomes');
        render();
        XHSH.toast('已更新');
    }

    async function remove(id) {
        var inc = items().find(function (x) { return x.id === id; });
        if (!inc) return;
        if (!(await XHSH.confirm('删除「' + inc.source + ' ' + fmt(inc.amountCents) + '」这条记录？', '删除'))) return;
        inc.deletedAt = XHSH.nowISO();  // 墓碑：云同步时不会被复活
        inc.updatedAt = XHSH.nowISO();
        I().items = I().items.filter(function (x) { return !x.deletedAt || x.id === id; });
        XHSH.data.save('incomes');
        render();
        XHSH.toast('已删除');
    }

    window.IncomeModule = { mount: render };

    XHSH.on('income-add', add);
    XHSH.on('income-edit', function (el, ev, ds) { edit(ds.id); });
    XHSH.on('income-delete', function (el, ev, ds) { remove(ds.id); });
    XHSH.on('income-pick-date', function (el, ev, ds) {
        $('incomeDate').value = ds.date;
        XHSH.toast('已选择日期：' + ds.date);
    });
    XHSH.on('income-nav-month', function (el, ev, ds) {
        calMonth += Number(ds.delta);
        if (calMonth < 0) { calMonth = 11; calYear--; }
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCalendar();
    });

})(window.XHSH);
