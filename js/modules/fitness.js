/*!
 * 小小花狮 · 运动健身
 * - 今日统计（项目数 / 时长 / 消耗 / 是否达标）
 * - 记录增删（底部弹层表单，替代旧的 prompt 串联）
 * - 近 7 天柱状图（修复 toISOString 导致东八区凌晨日期错位的问题）
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr, $ = function (id) { return document.getElementById(id); };

    var TYPES = [
        { name: '跑步', icon: '🏃', kcalPerMin: 10 },
        { name: '游泳', icon: '🏊', kcalPerMin: 11 },
        { name: '瑜伽', icon: '🧘', kcalPerMin: 4 },
        { name: '力量', icon: '🏋️', kcalPerMin: 7 },
        { name: '骑行', icon: '🚴', kcalPerMin: 8 },
        { name: '跳绳', icon: '🪢', kcalPerMin: 12 },
        { name: '散步', icon: '🚶', kcalPerMin: 4 },
        { name: '其他', icon: '💪', kcalPerMin: 5 }
    ];
    function typeOf(name) {
        return TYPES.find(function (t) { return t.name === name; }) || TYPES[TYPES.length - 1];
    }
    function F() { return XHSH.data.all.fitness; }

    function render() {
        var today = XHSH.today();
        var empty = fitnessEmpty;
        if (empty) empty.style.display = (F().exercises || []).length ? 'none' : 'block';
        var list = (F().exercises || []).filter(function (e) { return e.date === today; });
        var mins = list.reduce(function (s, e) { return s + (Number(e.minutes) || 0); }, 0);
        var kcal = list.reduce(function (s, e) { return s + (Number(e.calories) || 0); }, 0);

        $('fitnessStats').innerHTML =
            stat(list.length, '运动项目', 'var(--orange)') +
            stat(mins, '运动时长(分)', 'var(--primary)') +
            stat(kcal, '消耗卡路里', 'var(--success)') +
            stat(mins >= 30 ? '✓' : '…', '达标(≥30分)', 'var(--info)');

        var host = $('exerciseList');
        if (!list.length) {
            host.innerHTML = '<div class="empty-state"><div class="empty-icon">🏋️</div><div>今天还没运动，动起来吧！</div></div>';
        } else {
            host.innerHTML = list.slice().reverse().map(function (e) {
                return '<div class="exercise-card">' +
                    '<div class="exercise-icon">' + esc(typeOf(e.type).icon) + '</div>' +
                    '<div class="ex-info"><div class="ex-title">' + esc(e.type) + '</div>' +
                    '<div class="ex-sub">' + esc(e.minutes) + ' 分钟 · ' + esc(e.calories) + ' 千卡</div></div>' +
                    '<button class="btn btn-xs btn-outline" data-action="fitness-delete" data-prevent="1" data-id="' + escAttr(e.id) + '" aria-label="删除">🗑️</button>' +
                    '</div>';
            }).join('');
        }

        // 近 7 天
        var days = [], labels = [];
        for (var i = 6; i >= 0; i--) {
            var ds = XHSH.dateOffset(-i);
            days.push((F().exercises || []).filter(function (e) { return e.date === ds; })
                .reduce(function (s, e) { return s + (Number(e.minutes) || 0); }, 0));
            var d = XHSH.parseDate(ds);
            labels.push((d.getMonth() + 1) + '/' + d.getDate());
        }
        var max = Math.max.apply(null, days.concat([1]));
        $('fitnessChart').innerHTML = days.some(Boolean)
            ? days.map(function (v) {
                var h = Math.max(2, Math.round(v / max * 100));
                return '<div class="bar-wrap" title="' + v + ' 分钟"><span class="bar-val">' + (v || '') + '</span>' +
                    '<div class="bar" style="height:' + h + '%"></div></div>';
            }).join('')
            : '<div class="empty-inline">本周暂无运动记录</div>';
        $('fitnessChartLabels').innerHTML = labels.map(function (l) { return '<span>' + l + '</span>'; }).join('');
    }
    function stat(v, label, color) {
        return '<div class="stat-card"><div class="stat-value" style="color:' + color + '">' + esc(v) + '</div><div class="stat-label">' + label + '</div></div>';
    }

    async function add() {
        var r = await XHSH.sheet({
            title: '记录运动',
            fields: [
                { name: 'type', label: '运动类型', type: 'select', value: '跑步', options: TYPES.map(function (t) { return { value: t.name, label: t.icon + ' ' + t.name }; }) },
                { name: 'minutes', label: '时长（分钟）', type: 'number', min: 1, max: 600, step: 1, inputmode: 'numeric', value: '' },
                { name: 'calories', label: '消耗（千卡，留空自动估算）', type: 'number', min: 0, step: 1, inputmode: 'numeric', value: '' },
                { name: 'date', label: '日期', type: 'date', value: XHSH.today() }
            ],
            okText: '保存',
            validate: function (v) {
                var m = parseInt(v.minutes, 10);
                if (!m || m <= 0) return '请填写有效的运动时长';
                if (m > 600) return '时长请填 600 分钟以内';
                return '';
            }
        });
        if (!r) return;
        var m = parseInt(r.minutes, 10);
        var c = r.calories === '' ? m * typeOf(r.type).kcalPerMin : Math.max(0, parseInt(r.calories, 10) || 0);
        F().exercises.push({
            id: String(Date.now()) + Math.floor(Math.random() * 1000),
            type: r.type, minutes: m, calories: c, date: r.date || XHSH.today(),
            createdAt: XHSH.nowISO(), updatedAt: XHSH.nowISO()
        });
        XHSH.data.save('fitness');
        render();
        XHSH.toast('运动记录已添加 ✅');
    }

    window.FitnessModule = { mount: render };

    XHSH.on('fitness-add', add);
    XHSH.on('fitness-delete', async function (el, ev, ds) {
        var e = (F().exercises || []).find(function (x) { return x.id === ds.id; });
        if (!e) return;
        if (!(await XHSH.confirm('删除这条运动记录？（' + e.type + ' ' + e.minutes + ' 分钟）', '删除'))) return;
        F().exercises = F().exercises.filter(function (x) { return x.id !== ds.id; });
        XHSH.data.save('fitness');
        render();
        XHSH.toast('已删除');
    });

})(window.XHSH);
