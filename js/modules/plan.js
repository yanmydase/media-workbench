/*!
 * 小小花狮 · 每日计划
 * - 月度打卡日历（可切换月份、点击任意日期查看/补打卡）
 * - 任务：内置 + 自定义，支持时间、自定义图标
 * - 睡觉提醒：到点提醒（可选，需要浏览器通知权限）
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr;
    var $ = function (id) { return document.getElementById(id); };

    var MOTIVATIONS = [
        { cn: '每一天都是新的开始，做最好的自己。', en: 'Every day is a fresh start. Be the best version of yourself.' },
        { cn: '成功就是把复杂的事情简单做，简单的事情重复做。', en: 'Success is doing complex things simply, and simple things repeatedly.' },
        { cn: '你的未来取决于你今天做了什么。', en: 'Your future depends on what you do today.' },
        { cn: '不要等待完美时刻，抓住当下让它完美。', en: "Don't wait for the perfect moment. Take the moment and make it perfect." },
        { cn: '自律给我自由。', en: 'Self-discipline gives me freedom.' },
        { cn: '积跬步以至千里，积小流以成江海。', en: 'Small steps lead to a thousand miles; small streams form a great river.' },
        { cn: '与其临渊羡鱼，不如退而结网。', en: 'Better to weave a net than to covet the fish by the pond.' },
        { cn: '生活的意义在于奋斗，而非等待。', en: 'The meaning of life is to strive, not to wait.' },
        { cn: '你今天受的苦，会照亮你明天的路。', en: 'The pain you endure today will light your path tomorrow.' },
        { cn: '保持热爱，奔赴山海。', en: 'Keep your passion and run toward the mountains and seas.' }
    ];

    var viewDate = XHSH.today();
    var calYear, calMonth;

    function P() { return XHSH.data.all.plan; }

    function tasks() {
        var p = P();
        if (!p.tasks || !p.tasks.length) {
            p.tasks = XHSH.DEFAULT_TASKS.map(function (t) { return XHSH.merge(t, {}); });
        }
        return p.tasks;
    }
    function activeTasks() { return tasks().filter(function (t) { return t.enabled !== false; }); }
    function checkinsOf(ds) { return (P().checkins[ds] || []).slice(); }

    /* ---------------- 渲染 ---------------- */
    function renderGreeting() {
        var h = new Date().getHours();
        var g = h < 6 ? '夜深了 🌙' : h < 12 ? '早上好 ☀️' : h < 18 ? '下午好 🌤️' : '晚上好 🌆';
        $('planGreeting').textContent = g + '，今天也要加油！';
        $('planDate').textContent = new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        var m = MOTIVATIONS[new Date().getDate() % MOTIVATIONS.length];
        $('motivationCN').textContent = '💬 ' + m.cn;
        $('motivationEN').textContent = m.en;
    }

    function renderCalendar() {
        var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        var firstDay = new Date(calYear, calMonth, 1).getDay();
        var todayStr = XHSH.today();
        $('calMonthLabel').textContent = calYear + '年' + (calMonth + 1) + '月';

        var list = activeTasks();
        var total = list.length;
        var html = XHSH.WEEKDAYS.map(function (w) { return '<div class="cal-day-h">' + w + '</div>'; }).join('');

        var prevDays = new Date(calYear, calMonth, 0).getDate();
        for (var i = firstDay - 1; i >= 0; i--) html += '<div class="cal-day other">' + (prevDays - i) + '</div>';

        for (var d = 1; d <= daysInMonth; d++) {
            var ds = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            var done = checkinsOf(ds).filter(function (id) {
                return list.some(function (t) { return t.id === id; });
            }).length;
            var cls = 'cal-day';
            if (ds === todayStr) cls += ' today';
            if (ds === viewDate) cls += ' selected';
            if (total > 0 && done === total) cls += ' full';
            else if (done > 0) cls += ' partial';
            else cls += ' none';
            var ratio = total ? done + '/' + total : '0/0';
            html += '<div class="' + cls + '" role="button" tabindex="0" title="' + escAttr(ds + ' · ' + ratio) +
                '" data-action="plan-view-date" data-date="' + escAttr(ds) + '">' + d + '</div>';
        }
        $('planCalendar').innerHTML = html;
    }

    function renderTasks() {
        var ds = viewDate || XHSH.today();
        var list = activeTasks();
        var checkin = checkinsOf(ds);
        var doneCount = 0;
        var host = $('planTaskList');

        if (!list.length) {
            host.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div>还没有任务，点下方「新增任务」开始</div></div>';
        } else {
            host.innerHTML = list.map(function (t) {
                var done = checkin.indexOf(t.id) >= 0;
                if (done) doneCount++;
                var timeHtml = '';
                if (t.id === 'sleep' && P().sleepTime) {
                    timeHtml = '<span class="todo-time chip-time" data-action="plan-sleep" data-prevent="1">⏰ ' + esc(P().sleepTime) + '</span>';
                } else if (t.time) {
                    timeHtml = '<span class="todo-time">🕐 ' + esc(t.time) + '</span>';
                }
                var delBtn = t.builtin ? '' :
                    '<button class="btn btn-xs btn-outline" data-action="plan-delete-task" data-prevent="1" data-id="' + escAttr(t.id) + '" aria-label="删除任务">✕</button>';
                return '<div class="todo-item' + (done ? ' done' : '') + '" role="checkbox" aria-checked="' + done + '" tabindex="0"' +
                    ' data-action="plan-toggle-task" data-id="' + escAttr(t.id) + '">' +
                    '<div class="todo-check">✓</div>' +
                    '<span class="todo-icon">' + esc(t.icon || '📌') + '</span>' +
                    '<span class="todo-text">' + esc(t.name) + '</span>' +
                    timeHtml + delBtn +
                    '</div>';
            }).join('');
        }

        var pct = list.length ? Math.round(doneCount / list.length * 100) : 0;
        $('planProgress').textContent = doneCount + '/' + list.length + ' · ' + pct + '%';
        var bar = $('planProgressBar');
        requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = pct + '%'; }); });

        var isToday = ds === XHSH.today();
        $('planCardTitle').textContent = isToday ? '✅ 今日打卡'
            : '📋 ' + ds + ' 周' + XHSH.WEEKDAYS[XHSH.parseDate(ds).getDay()];
        $('planBackToday').style.display = isToday ? 'none' : '';
        renderCalendar();
    }

    /* ---------------- 行为 ---------------- */
    async function addTask() {
        var r = await XHSH.sheet({
            title: '新增打卡任务',
            fields: [
                { name: 'name', label: '任务名称', placeholder: '如：冥想 10 分钟', value: '' },
                { name: 'icon', label: '图标（emoji，可留空）', placeholder: '📌', value: '' },
                { name: 'time', label: '固定时间（可留空）', type: 'time', value: '' }
            ],
            validate: function (v) { return v.name ? '' : '请填写任务名称'; }
        });
        if (!r) return;
        tasks().push({
            id: 'custom_' + Date.now(), name: r.name, icon: (r.icon || '📌').slice(0, 4),
            time: r.time || '', builtin: false, enabled: true, createdAt: XHSH.nowISO()
        });
        XHSH.data.save('plan');
        renderTasks();
        XHSH.toast('任务已添加 ✅');
    }

    async function sleepSetting() {
        var r = await XHSH.sheet({
            title: '睡觉提醒时间',
            fields: [{ name: 'time', label: '每晚提醒时间', type: 'time', value: P().sleepTime || '22:30' }],
            okText: '保存',
            validate: function (v) { return /^\d{1,2}:\d{2}$/.test(v.time) ? '' : '请选择时间'; }
        });
        if (!r) return;
        P().sleepTime = r.time;
        var st = tasks().find(function (x) { return x.id === 'sleep'; });
        if (st) st.time = r.time;
        XHSH.data.save('plan');
        renderTasks();
        XHSH.toast('睡觉提醒已设为 ' + r.time + ' 😴');
        scheduleSleepReminder();
    }

    /* 到点提醒：页面打开期间每分钟检查一次；第一次设置时请求通知权限 */
    var sleepTimer = null, lastNotified = '';
    function scheduleSleepReminder() {
        if (sleepTimer) clearInterval(sleepTimer);
        sleepTimer = setInterval(checkSleep, 30 * 1000);
        checkSleep();
    }
    function checkSleep() {
        var t = P().sleepTime;
        if (!t) return;
        var now = new Date();
        var hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        if (hhmm !== t) return;
        if (lastNotified === XHSH.today()) return;
        lastNotified = XHSH.today();
        var msg = '😴 到点啦，该睡觉了（' + t + '）';
        XHSH.toast(msg, 5000);
        if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification('小小花狮 · 睡觉提醒', { body: msg, icon: '/icon.png' }); } catch (e) { }
        }
    }
    async function enableNotifications() {
        if (!('Notification' in window)) return XHSH.toast('当前浏览器不支持通知');
        if (Notification.permission === 'granted') return XHSH.toast('通知已开启 ✅');
        var p = await Notification.requestPermission();
        XHSH.toast(p === 'granted' ? '通知已开启 ✅ 到点会提醒你' : '已拒绝通知权限');
    }

    /* ---------------- 模块注册 ---------------- */
    window.PlanModule = {
        mount: function () {
            // 记住用户上次查看的日期：切页、后台同步回来都不再强制跳回今天
            if (!calYear) {
                var saved = XHSH.data.all.settings.planViewDate;
                var d = saved ? XHSH.parseDate(saved) : new Date();
                if (isNaN(d)) d = new Date();
                viewDate = XHSH.dateStr(d);
                calYear = d.getFullYear();
                calMonth = d.getMonth();
            }
            renderGreeting();
            renderTasks();
            scheduleSleepReminder();
            if (XHSH._pendingToast) { XHSH.toast(XHSH._pendingToast, 5000); XHSH._pendingToast = ''; }
        },
        /** 同步合并后由 app 调用：只刷新，不动当前查看的日期 */
        refreshView: function () { renderGreeting(); renderTasks(); },
        renderTasks: renderTasks,
        reminders: activateReminders
    };

    function activateReminders() { scheduleSleepReminder(); }

    /* ---------------- 动作 ---------------- */
    function rememberViewDate(ds) {
        XHSH.data.all.settings.planViewDate = ds;
        XHSH.data.save('settings');
    }
    XHSH.on('plan-view-date', function (el, ev, ds) {
        if (!ds.date) return;
        viewDate = ds.date;
        var d = XHSH.parseDate(viewDate);
        if (!isNaN(d)) { calYear = d.getFullYear(); calMonth = d.getMonth(); }
        rememberViewDate(viewDate);
        renderTasks();
    });
    XHSH.on('plan-nav-month', function (el, ev, ds) {
        calMonth += Number(ds.delta);
        if (calMonth < 0) { calMonth = 11; calYear--; }
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCalendar();
    });
    XHSH.on('plan-back-today', function () {
        viewDate = XHSH.today();
        var n = new Date();
        if (calYear !== n.getFullYear() || calMonth !== n.getMonth()) { calYear = n.getFullYear(); calMonth = n.getMonth(); }
        renderTasks();
    });
    XHSH.on('plan-toggle-task', function (el, ev, ds) {
        var id = ds.id;
        if (!id) return;
        var day = viewDate;                    // 锁定点击时的日期，避免中途被改变
        var p = P();
        if (!p.checkins[day]) p.checkins[day] = [];
        var idx = p.checkins[day].indexOf(id);
        if (idx >= 0) p.checkins[day].splice(idx, 1); else p.checkins[day].push(id);
        if (!p.checkins[day].length) delete p.checkins[day];
        p.updatedAt = XHSH.nowISO();
        XHSH.data.save('plan');
        viewDate = day;                        // 不要因为保存/重渲染跳回今天
        renderTasks();
        var label = day === XHSH.today() ? '今天' : day;
        XHSH.toast((idx >= 0 ? '已取消 ✓ ' : '已完成 ✅ ') + label);
    });
    XHSH.on('plan-add-task', addTask);
    XHSH.on('plan-delete-task', async function (el, ev, ds) {
        var t = tasks().find(function (x) { return x.id === ds.id; });
        if (!t) return;
        if (!(await XHSH.confirm('确定删除任务「' + t.name + '」吗？历史打卡记录会一并清理。', '删除'))) return;
        var p = P();
        p.tasks = p.tasks.filter(function (x) { return x.id !== ds.id; });
        Object.keys(p.checkins).forEach(function (k) {
            p.checkins[k] = p.checkins[k].filter(function (x) { return x !== ds.id; });
        });
        XHSH.data.save('plan');
        renderTasks();
        XHSH.toast('任务已删除');
    });
    XHSH.on('plan-sleep', sleepSetting);
    XHSH.on('plan-enable-notify', enableNotifications);

})(window.XHSH);
