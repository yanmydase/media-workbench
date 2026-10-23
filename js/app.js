/*!
 * 小小花狮 · 启动入口
 * - 载入数据（自动迁移 v1）→ 注册 Service Worker → 启动路由 → 后台任务
 */
(function (XHSH) {
    'use strict';

    function boot() {
        XHSH.data.load();

        // 数据为空时尝试从本地快照恢复
        if (window.DataModule && DataModule.restoreIfEmpty()) { /* 已恢复 */ }

        XHSH.router.register('plan', window.PlanModule);
        XHSH.router.register('fitness', window.FitnessModule);
        XHSH.router.register('english', window.EnglishModule);
        XHSH.router.register('review', window.ReviewModule);
        XHSH.router.register('notes', window.NotesModule);
        XHSH.router.register('incomes', window.IncomeModule);
        XHSH.router.register('weather', window.WeatherModule);
        XHSH.router.register('ai', window.WisdomModule);
XHSH.router.register('zoo', window.ZooModule);
        XHSH.router.register('agents', window.AgentsModule);

        XHSH.router.theme.apply(XHSH.data.all.settings.theme || 'auto');
        XHSH.router.start();

        if (window.DataModule) { DataModule.startAutoBackup(); }

        // 同步合并了远端数据后，只刷新当前页面内容，不改变用户正在查看的日期/页面
        XHSH.adoptRemote = function () {
            var page = XHSH.router.current;
            var mod = XHSH.router.get(page);
            if (mod && typeof mod.refreshView === 'function') mod.refreshView();
            else if (mod && typeof mod.mount === 'function') mod.mount(document.getElementById('page-' + page));
            if (window.ReviewModule) ReviewModule.badge();
        };

        // 复盘未写提醒
        if (window.ReviewModule) ReviewModule.badge();

        // 启动成功标记（自检脚本据此判断是否为"旧缓存混合体"）
        window.__xhshBootOk = true;
        checkModules();

        registerServiceWorker();
        initInstallButton();
    }

    /** 关键模块缺失 = 拿到的是旧缓存混合体 → 清缓存重载一次（同一会话只做一次，避免死循环） */
    function checkModules() {
        var missing = [];
        if (!window.XHSH.illustrate) missing.push('illustrate.js');
        if (!window.XHSH.ai) missing.push('ai-client.js');
        if (!window.ZooModule) missing.push('zoo.js');
        if (!window.WisdomModule) missing.push('wisdom.js');
        if (!missing.length) return;
        console.error('[boot] 模块缺失：' + missing.join(', '));
        try {
            if (sessionStorage.getItem('xhsh.selfheal') === '1') {
                XHSH.toast('部分功能没加载上，请按 Ctrl+F5 强制刷新', 6000);
                return;
            }
            sessionStorage.setItem('xhsh.selfheal', '1');
        } catch (e) { }
        var reload = function () { location.reload(); };
        if (window.caches && caches.keys) {
            caches.keys().then(function (ks) {
                return Promise.all(ks.map(function (k) { return caches.delete(k); }));
            }).then(reload, reload);
        } else reload();
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').then(function (reg) {
                // 首次打开就让新 SW 接管，避免第一次拿到旧缓存
                if (reg.active === null && navigator.serviceWorker.controller === null && reg.installing) {
                    reg.installing.addEventListener('statechange', function () {
                        if (reg.installing && reg.installing.state === 'activated') location.reload();
                    });
                }
                reg.addEventListener('updatefound', function () {
                    var w = reg.installing;
                    if (!w) return;
                    w.addEventListener('statechange', function () {
                        if (w.state === 'installed' && navigator.serviceWorker.controller) {
                            XHSH.toast('🔄 新版本已就绪，正在刷新…', 2500);
                            setTimeout(function () { location.reload(); }, 1200);
                        }
                    });
                });
            }).catch(function (e) { console.warn('[sw] 注册失败', e); });
        });
    }

    var deferredPrompt = null;
    function initInstallButton() {
        var btn = document.getElementById('installBtn');
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferredPrompt = e;
            if (btn) btn.style.display = 'flex';
        });
        window.addEventListener('appinstalled', function () {
            deferredPrompt = null;
            if (btn) btn.style.display = 'none';
            XHSH.toast('安装成功 🎉');
        });
        XHSH.on('install-app', async function () {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                var r = await deferredPrompt.userChoice;
                if (r && r.outcome === 'accepted') XHSH.toast('安装成功 🎉');
                deferredPrompt = null;
                if (btn) btn.style.display = 'none';
                return;
            }
            if (/iPhone|iPad|iPod/.test(navigator.userAgent)) XHSH.toast('📱 Safari 底部 ⬆️ 分享 → 添加到主屏幕', 4000);
            else XHSH.toast('📱 浏览器菜单 → 安装应用 / 添加到主屏幕', 4000);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

})(window.XHSH);
