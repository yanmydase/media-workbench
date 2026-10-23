/*!
 * 小小花狮 · 路由 / 主题 / 侧边栏
 * - 哈希路由 #/plan 等，支持刷新保持、前进后退、分享链接
 * - 主题：auto（跟随系统）/ light / dark，首屏由 index.html 内联脚本提前设置，避免闪烁
 */
(function (XHSH) {
    'use strict';

    var PAGES = {
        plan: { title: '📅 每日计划', module: 'plan' },
        fitness: { title: '💪 运动健身', module: 'fitness' },
        english: { title: '📖 英语学习', module: 'english' },
        review: { title: '📝 每日复盘', module: 'review' },
        notes: { title: '🌸 随笔笔记', module: 'notes' },
        incomes: { title: '💰 收入记账', module: 'incomes' },
        weather: { title: '🌤️ 天气', module: 'weather' },
        ai: { title: '🦁 智慧花狮', module: 'ai' },
        zoo: { title: '🐾 动物百科', module: 'zoo' },
        agents: { title: '🧩 智能体工作台', module: 'agents' }
    };

    var current = null;
    var modules = {};

    function registerModule(name, mod) { modules[name] = mod; }
    function getModule(name) { return modules[name]; }

    function resolvePage() {
        var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
        return PAGES[h] ? h : 'plan';
    }

    function apply(page) {
        var def = PAGES[page] || PAGES.plan;
        document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
        var pg = document.getElementById('page-' + page);
        if (pg) pg.classList.add('active');

        document.querySelectorAll('.nav-item[data-page]').forEach(function (x) {
            var on = x.dataset.page === page;
            x.classList.toggle('active', on);
            if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current');
        });

        var titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = def.title;
        document.title = def.title.replace(/^\S+\s/, '') + ' · 小小花狮';

        current = page;
        var mod = modules[def.module];
        if (mod && typeof mod.mount === 'function') {
            try { mod.mount(pg, {}); } catch (e) { console.error('[mount:' + page + ']', e); }
        }
        document.body.classList.toggle('ai-page', page === 'ai');
        var content = document.querySelector('.content');
        if (content) content.scrollTop = 0;
        window.scrollTo(0, 0);
        closeMobileSidebar();
    }

    function go(page, opts) {
        if (!PAGES[page]) {
            console.warn('[router] 未知页面：' + page + '，已回到每日计划');
            page = 'plan';
        }
        var target = '#/' + (page === 'plan' ? '' : page);
        if (location.hash === target || (!location.hash && page === 'plan')) apply(page);
        else location.hash = target;
        if (opts && opts.state && history.replaceState) history.replaceState(Object.assign({}, history.state, opts.state), '', location.hash || '#/');
    }

    window.addEventListener('hashchange', function () { apply(resolvePage()); });

    /* ---------- 主题 ---------- */
    var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function effectiveTheme(pref) {
        if (pref === 'dark' || pref === 'light') return pref;
        return mql && mql.matches ? 'dark' : 'light';
    }

    function applyTheme(pref) {
        var D = XHSH.data.all;
        D.settings.theme = pref || D.settings.theme || 'auto';
        XHSH.data.save('settings');
        var eff = effectiveTheme(D.settings.theme);
        document.documentElement.setAttribute('data-theme', eff);
        document.documentElement.setAttribute('data-theme-pref', D.settings.theme);
        try { localStorage.setItem('xhsh.theme', D.settings.theme); } catch (e) { }
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', eff === 'dark' ? '#0f172a' : '#6C5CE7');
        var icon = document.querySelector('#themeToggle .nav-icon');
        if (icon) icon.textContent = D.settings.theme === 'auto' ? '🌗' : (D.settings.theme === 'dark' ? '🌙' : '🌞');
        var label = document.querySelector('#themeToggle .nav-label');
        if (label) label.textContent = '主题：' + ({ auto: '跟随系统', dark: '深色', light: '浅色' })[D.settings.theme];
    }

    function cycleTheme() {
        var order = ['auto', 'light', 'dark'];
        var cur = XHSH.data.all.settings.theme || 'auto';
        applyTheme(order[(order.indexOf(cur) + 1) % order.length]);
        XHSH.toast('主题：' + ({ auto: '跟随系统', dark: '深色', light: '浅色' })[XHSH.data.all.settings.theme]);
    }

    if (mql && mql.addEventListener) {
        mql.addEventListener('change', function () {
            if ((XHSH.data.all.settings.theme || 'auto') === 'auto') applyTheme('auto');
        });
    }

    /* ---------- 侧边栏 ---------- */
    function closeMobileSidebar() {
        var sb = document.getElementById('sidebar'), ov = document.getElementById('sidebarOverlay');
        if (sb) sb.classList.remove('open');
        if (ov) ov.classList.remove('show');
    }

    function toggleSidebar() {
        var sb = document.getElementById('sidebar'), ov = document.getElementById('sidebarOverlay');
        if (!sb) return;
        if (window.innerWidth <= 768) {
            sb.classList.toggle('open');
            if (ov) ov.classList.toggle('show');
        } else {
            sb.classList.toggle('collapsed');
            var icon = sb.querySelector('.sidebar-footer [data-action="toggle-sidebar"] .nav-icon');
            if (icon) icon.textContent = sb.classList.contains('collapsed') ? '▶' : '◀';
            try { localStorage.setItem('xhsh.ui.sidebar', sb.classList.contains('collapsed') ? '1' : '0'); } catch (e) { }
        }
    }

    function restoreSidebar() {
        try {
            if (localStorage.getItem('xhsh.ui.sidebar') === '1' && window.innerWidth > 768) {
                var sb = document.getElementById('sidebar');
                if (sb) sb.classList.add('collapsed');
                var icon = sb && sb.querySelector('.sidebar-footer [data-action="toggle-sidebar"] .nav-icon');
                if (icon) icon.textContent = '▶';
            }
        } catch (e) { }
    }

    XHSH.router = {
        PAGES: PAGES,
        register: registerModule,
        get: getModule,
        go: go,
        navigate: go,          // 兼容写法：XHSH.router.navigate('zoo')
        open: go,
        apply: apply,
        refresh: function () { if (current) apply(current); },
        get current() { return current; },
        start: function () { apply(resolvePage()); },
        theme: { apply: applyTheme, cycle: cycleTheme, effective: effectiveTheme },
        openPage: function (page) { go(page); }
    };

    /* 通过 data-action 统一注册 UI 动作 */
    XHSH.on('nav-page', function (el, ev, ds) { go(ds.page); });
    XHSH.on('toggle-sidebar', function () { toggleSidebar(); });
    XHSH.on('close-sidebar', function () { closeMobileSidebar(); });
    XHSH.on('toggle-theme', function () { cycleTheme(); });

    document.addEventListener('DOMContentLoaded', function () { restoreSidebar(); });

})(window.XHSH);
