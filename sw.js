/*!
 * 小小花狮 · Service Worker
 * 策略：
 *  - 页面导航：network-first（每次拿到最新 HTML，离线才回落缓存）
 *  - 静态资源：stale-while-revalidate（先给缓存，再后台更新）
 *  - /api、/sync、第三方接口（如天气）：不拦截，直接走网络
 *  - 缓存名带版本号，发版时改 VERSION 即可清理旧缓存并提示刷新
 */
const VERSION = 'xhsh-v2.8.0';
const STATIC_CACHE = VERSION + '-static';

const PRECACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon.png',
    '/css/app.css',
    '/js/app.js',
    '/js/modules/core.js',
    '/js/modules/router.js',
    '/js/modules/data.js',
    '/js/modules/sync.js',
    '/js/modules/cet6-words.js',
    '/js/modules/plan.js',
    '/js/modules/fitness.js',
    '/js/modules/english.js',
    '/js/modules/review.js',
    '/js/modules/notes.js',
    '/js/modules/incomes.js',
    '/js/modules/weather.js',
    '/js/modules/illustrate.js',
    '/js/modules/ai-client.js',
    '/js/agents/wisdom.js',
    '/js/agents/zoo.js',
    '/js/agents/registry.js',
    '/js/agents/workbench.js'
];

self.addEventListener('install', (e) => {
    // 先清掉所有旧缓存，再预缓存新版本：避免"新 HTML + 旧 JS"混搭导致页面跳错
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .then(() => caches.open(STATIC_CACHE))
            .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => undefined))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

function isBypassed(url) {
    return /\/api\//.test(url.pathname) ||
        /\/sync\//.test(url.pathname) ||
        url.origin !== self.location.origin;
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (isBypassed(url)) return;

    if (req.mode === 'navigate') {
        e.respondWith(
            fetch(req)
                .then((resp) => {
                    const copy = resp.clone();
                    caches.open(STATIC_CACHE).then((c) => c.put('/index.html', copy));
                    return resp;
                })
                .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
        );
        return;
    }

    // 缓存优先（快），但必须"网络校验过再交付"：
    // 每次打开都会核对文件是否变过，避免"新的 index.html + 旧的 js" 这种半新半旧的组合导致页面空白/跳错页。
    // 只有网络彻底不通（离线）时才直接使用缓存。
    e.respondWith(
        fetch(req)
            .then((resp) => {
                if (resp && resp.ok) {
                    const copy = resp.clone();
                    caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
                }
                return resp;
            })
            .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
});
