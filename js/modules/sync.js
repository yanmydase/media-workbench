/*!
 * 小小花狮 · 云端同步（可选）
 *
 * 数据保存在运行 server.py 的电脑上：
 *   media-workbench/data/<空间ID>/data.json   ← 全量数据
 *   media-workbench/data/<空间ID>/token.json  ← 访问口令
 *
 * 两阶段同步（v2.3）：
 *  1) push：把"本机真正发生过的改动"（pending 分片 + 字段时间戳）发给服务器；
 *     服务器按"字段 / 按天"比较版本：服务器已有该字段就拒绝，否则接受；
 *  2) pull：拿到服务器合并后的数据，与本地合并（本地有未推送改动时保留本地）。
 *  结果：同一台设备反复同步不会覆盖别人，别人也不会把你的改动冲掉；离线期间的改动联网后补传。
 */
(function (XHSH) {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };

    var PUSH_DELAY = 700;
    var PULL_INTERVAL = 20 * 1000;
    var STATE_KEY = XHSH.CONFIG.keyPrefix + 'syncState';
    var PENDING_KEY = XHSH.CONFIG.keyPrefix + 'pending';
    var status = { state: 'off', lastSyncAt: '', message: '' };
    var pushTimer = null;
    var pullTimer = null;
    var queue = Promise.resolve();
    var lastPushAt = 0;

    function S() { return XHSH.data.all.settings; }
    function available() { return /^https?:$/.test(location.protocol); }
    function space() { return String(S().syncSpace || '').trim(); }
    function readState() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch (e) { return {}; } }
    function writeState(o) { try { localStorage.setItem(STATE_KEY, JSON.stringify(o)); } catch (e) { } }
    function readPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') || {}; } catch (e) { return {}; } }
    function writePending(o) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(o)); } catch (e) { } }
    function hasPending() { return Object.keys(readPending()).length > 0; }

    function setState(state, message) {
        status.state = state;
        status.message = message || '';
        var dot = document.getElementById('syncDot');
        if (dot) dot.className = 'sync-dot ' + state;
        var el = $('syncStatus');
        if (el) {
            var map = { off: '⚪ 未开启同步', ok: '✅ 已同步', syncing: '🔄 同步中…', error: '⚠️ ' + (message || '同步失败') };
            el.textContent = (map[state] || state) + (state === 'ok' && status.lastSyncAt ? ' · ' + status.lastSyncAt : '');
            el.style.color = state === 'error' ? 'var(--danger)' : state === 'ok' ? 'var(--success)' : 'var(--text-secondary)';
        }
    }

    function base(sp) { return '/api/sync/' + encodeURIComponent(sp); }
    function headers() { var h = {}; if (S().syncToken) h['X-Sync-Token'] = S().syncToken; return h; }

    /* ---------------- 合并（本地视角） ---------------- */
    function localWins(localTs, remoteTs) {
        if (!localTs) return false;
        if (!remoteTs) return true;
        return Number(localTs) > Number(remoteTs);
    }

    function isDayGroup(prefix, key) {
        return (prefix === 'plan' && key === 'checkins') || (prefix === 'english' && key === 'dailyNew');
    }

    function mergeArraysById(localArr, remoteArr, localTs, remoteTs) {
        var map = {};
        (localArr || []).forEach(function (x) { if (x && x.id != null) map[x.id] = x; });
        (remoteArr || []).forEach(function (r) {
            if (!r || r.id == null) return;
            var l = map[r.id];
            if (!l) { map[r.id] = r; return; }
            if (r.deletedAt || l.deletedAt) return;      // 墓碑/本地改动优先
            var lt = Number(l.updatedAt ? Date.parse(l.updatedAt) : localTs) || localTs;
            var rt = Number(r.updatedAt ? Date.parse(r.updatedAt) : remoteTs) || remoteTs;
            map[r.id] = localWins(lt, rt) ? l : r;
        });
        return Object.keys(map).map(function (k) { return map[k]; }).filter(function (x) { return !x.deletedAt; });
    }

    function mergeValue(prefix, key, local, remote, marks, remoteMarks, keepLocal) {
        var path = prefix + '.' + key;
        if (Array.isArray(remote)) {
            return mergeArraysById(Array.isArray(local) ? local : [], remote, Number(marks[path] || 0), Number(remoteMarks[path] || 0));
        }
        if (remote && typeof remote === 'object') {
            if (isDayGroup(prefix, key)) {
                var lmap = local && typeof local === 'object' ? local : {};
                var outDay = {};
                Object.keys(lmap).concat(Object.keys(remote)).forEach(function (day) {
                    if (outDay.hasOwnProperty(day)) return;
                    var l = lmap[day], r = remote[day];
                    if (l === undefined) { outDay[day] = r; return; }
                    if (r === undefined) { outDay[day] = l; return; }
                    var lk = path + '.' + day;
                    outDay[day] = (keepLocal && marks[lk]) ? l : (localWins(Number(marks[lk] || 0), Number(remoteMarks[lk] || 0)) ? l : r);
                });
                return outDay;
            }
            var out = {};
            var ls = local && typeof local === 'object' ? local : {};
            Object.keys(ls).concat(Object.keys(remote)).forEach(function (k) {
                if (out.hasOwnProperty(k) || k === 'syncMarks') return;
                out[k] = (k in remote) ? mergeValue(prefix + '.' + key, k, ls[k], remote[k], marks, remoteMarks, keepLocal) : ls[k];
            });
            return out;
        }
        if (local === undefined || local === null) return remote;
        if (remote === undefined) return local;
        if (keepLocal && marks[path]) return local;
        return localWins(Number(marks[path] || 0), Number(remoteMarks[path] || 0)) ? local : remote;
    }

    function isBlank() {
        var a = XHSH.data.all;
        return (Object.keys(a.plan.checkins || {}).length + a.fitness.exercises.length + a.english.studyDays.length +
            a.review.items.length + a.incomes.items.length + a.notes.items.length + (a.ai.history || []).length) === 0;
    }

    /** 同步前：把"带字段时间戳"的分片都登记为待推送（即使订阅未触发也不会漏发） */
    function markPendingFromMarks() {
        var p = readPending();
        Object.keys(XHSH.data.all).forEach(function (slice) {
            var s = XHSH.data.all[slice];
            if (s && s.syncMarks && Object.keys(s.syncMarks).length) p[slice] = Date.now();
        });
        writePending(p);
    }

    /* ---------------- 阶段 1：推送 ---------------- */
    async function push() {
        var exported = JSON.parse(XHSH.data.exportJSON());
        var snap = exported.data || exported;
        var pending = readPending();
        var marks = {};
        Object.keys(pending).forEach(function (slice) {
            var s = snap[slice];
            if (!s || !s.syncMarks) return;
            Object.keys(s.syncMarks).forEach(function (k) {
                if (slice === 'settings' && (k === 'theme' || k === 'planViewDate')) return;
                marks[slice + '.' + k] = Number(s.syncMarks[k]);
            });
        });
        // 首次连接（服务器上还没有这个空间）时，即使本机没有"改动"，也要把当前数据作为初始快照传上去
        var stateObj = readState();
        var uninitialized = !stateObj.serverTime;
        if (!Object.keys(marks).length && !Object.keys(pending).length && !uninitialized) {
            return { skipped: true };
        }
        var payload = { token: S().syncToken || '', clientTime: Date.now(), data: snap, marks: marks, pending: Object.keys(pending) };

        var res = await fetch(base(space()), {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            var text = await res.text().catch(function () { return ''; });
            var msg = text;
            try { msg = JSON.parse(text).error || text; } catch (e) { }
            throw new Error('上传失败（' + res.status + '）：' + msg);
        }
        var out = await res.json().catch(function () { return {}; });
        lastPushAt = Date.now();
        writePending({});                       // 服务器已确认
        var conflicts = out.conflicts || {};
        Object.keys(conflicts).forEach(function (slice) { applyConflicts(slice, conflicts[slice], out.data && out.data[slice]); });
        return { remote: out.data, conflicts: conflicts };
    }

    function applyConflicts(slice, paths, remoteSlice) {
        var local = XHSH.data.all[slice];
        if (!local || !remoteSlice) return;
        var touched = false;
        (paths || []).forEach(function (p) {
            var field = p.indexOf(slice + '.') === 0 ? p.slice(slice.length + 1) : p;
            var day = /^(checkins|dailyNew)\.(.+)$/.exec(field);
            if (day) {
                var group = remoteSlice[day[1]] || {};
                local[day[1]] = local[day[1]] || {};
                if (group[day[2]] === undefined) delete local[day[1]][day[2]];
                else local[day[1]][day[2]] = XHSH.clone(group[day[2]]);
                if (local.syncMarks) delete local.syncMarks[field];
                touched = true;
                return;
            }
            if (remoteSlice[field] === undefined) delete local[field];
            else local[field] = XHSH.clone(remoteSlice[field]);
            if (local.syncMarks) delete local.syncMarks[field];
            touched = true;
        });
        if (!touched) return;
        XHSH._syncing = true;
        XHSH.data.save(slice);
        XHSH._syncing = false;
    }

    /* ---------------- 阶段 2：拉取 ---------------- */
    async function pull() {
        var res = await fetch(base(space()), { headers: headers(), cache: 'no-store' });
        if (res.status === 401) throw new Error('口令错误');
        if (!res.ok) throw new Error('服务器返回 ' + res.status);
        var json = await res.json();
        var st = readState();
        if (!json.exists) { st.serverTime = Date.now(); writeState(st); return { changed: false }; }
        if (json.serverTime) st.serverTime = Date.parse(json.serverTime) || Date.parse(json.savedAt || '') || Date.now();
        writeState(st);

        var remoteAll = json.data && json.data.data ? json.data.data : json.data;
        var remote = remoteAll && remoteAll.data ? remoteAll.data : remoteAll;
        var remoteMarks = json.marks || (remoteAll && remoteAll.marks) || {};
        if (!remote) return { changed: false };

        var all = XHSH.data.all;
        var pending = readPending();
        var changed = false;

        // 全新浏览器：服务器数据整份作为起点
        if (isBlank() && !hasPending()) {
            XHSH._syncing = true;
            Object.keys(remote).forEach(function (slice) {
                if (slice === 'meta' || slice === 'marks' || slice === 'syncMarks' || !all[slice]) return;
                all[slice] = XHSH.clone(remote[slice]);
            });
            XHSH._syncing = false;
            return { changed: true, adopted: true };
        }

        Object.keys(remote).forEach(function (slice) {
            if (slice === 'meta' || slice === 'marks' || slice === 'syncMarks' || !all[slice]) return;
            var remoteSlice = remote[slice];
            if (!remoteSlice || typeof remoteSlice !== 'object') return;
            var localSlice = all[slice];
            var merged = {};
            var marks = localSlice.syncMarks || {};
            var keepLocal = !!pending[slice];

            Object.keys(localSlice).concat(Object.keys(remoteSlice)).forEach(function (k) {
                if (merged.hasOwnProperty(k) || k === 'syncMarks') return;
                // 本机刚改过、还没推送成功的字段：整个字段保留本地，不能被服务器旧版本覆盖
                if (keepLocal && marks[k]) { merged[k] = localSlice[k]; return; }
                merged[k] = (k in remoteSlice) ? mergeValue(slice, k, localSlice[k], remoteSlice[k], marks, remoteMarks, keepLocal) : localSlice[k];
            });
            if (slice === 'settings') {
                merged.theme = localSlice.theme;
                merged.planViewDate = localSlice.planViewDate;
            }
            merged.syncMarks = keepLocal ? Object.assign({}, marks) : {};
            Object.keys(remoteMarks).forEach(function (k) {
                if (k.indexOf(slice + '.') !== 0) return;
                var sub = k.slice(slice.length + 1);
                if (keepLocal && marks[sub]) return;
                merged.syncMarks[sub] = Math.max(Number(merged.syncMarks[sub] || 0), Number(remoteMarks[k] || 0));
            });

            if (JSON.stringify(merged) !== JSON.stringify(localSlice)) {
                all[slice] = merged;
                changed = true;
            }
        });
        return { changed: changed };
    }

    /* ---------------- 口令同步（新设备免输入口令） ---------------- */
    async function fetchToken(sp) {
        try {
            var res = await fetch('/api/sync-token/' + encodeURIComponent(sp), { cache: 'no-store' });
            if (!res.ok) return '';
            var j = await res.json();
            return j && j.space === sp ? (j.token || '') : '';
        } catch (e) { return ''; }
    }

    async function offerToken(sp) {
        var t = await fetchToken(sp);
        if (!t) return false;
        var r = await XHSH.sheet({
            title: '🔑 接管已有数据？',
            message: '服务器上已存在空间「' + sp + '」。输入正确口令后，这台设备会立即同步到这份数据。',
            fields: [{ name: 'token', label: '该空间的口令', value: '', placeholder: '至少 6 位' }],
            okText: '确认并同步'
        });
        if (!r) return false;
        if (r.token !== t) { XHSH.toast('口令不正确'); return false; }
        S().syncToken = t;
        XHSH.data.save('settings');
        return true;
    }

    /* ---------------- 自动连接 ---------------- */
    async function autoConnect() {
        if (!available()) { setState('off'); return; }
        var urlSpace = (function () {
            var q = (location.search.match(/[?&]space=([^&]+)/) || [])[1];
            return q ? decodeURIComponent(q) : '';
        })();
        if (space()) { startTimers(); if (S().syncAuto !== false) syncNow(); return; }

        var candidates = [urlSpace, readState().lastSpace].filter(Boolean);
        var found = '';
        for (var i = 0; i < candidates.length; i++) {
            try { if (await fetchToken(candidates[i])) { found = candidates[i]; break; } } catch (e) { }
        }
        if (!found) { setState('off'); return; }

        var ok = false;
        if (urlSpace && found === urlSpace) {
            var t = await fetchToken(found);
            if (t) { S().syncSpace = found; S().syncToken = t; XHSH.data.save('settings'); ok = true; }
        }
        if (!ok) ok = await offerToken(found);
        if (!ok) { setState('off'); return; }
        startTimers();
        await syncNow({ force: true });
        XHSH.toast(status.state === 'ok' ? '☁️ 已连接到空间「' + found + '」' : '同步失败：' + status.message, 3500);
    }

    /* ---------------- 设置面板 ---------------- */
    async function openSettings() {
        var s = S();
        var r = await XHSH.sheet({
            title: '☁️ 数据同步',
            message: available()
                ? '同一个「空间 ID + 口令」的设备会实时共用一份数据（保存在运行 server.py 的电脑上：media-workbench/data/）。'
                : '当前是本地文件模式（file://），无法同步；请用 python server.py 打开。',
            fields: [
                { name: 'space', label: '空间 ID', value: s.syncSpace || '', placeholder: '如 yanzi' },
                { name: 'token', label: '口令（至少 6 位）', value: s.syncToken || '', placeholder: '••••••' },
                { name: 'auto', label: '自动同步', type: 'select', value: s.syncAuto === false ? '0' : '1',
                  options: [{ value: '1', label: '开启（推荐）' }, { value: '0', label: '仅手动同步' }] }
            ],
            okText: '保存并同步',
            validate: function (v) {
                if (!v.space) return '请填写空间 ID';
                if (!/^[A-Za-z0-9_\-]{1,64}$/.test(v.space)) return '空间 ID 只能用字母、数字、下划线、短横线';
                if (v.token.length < 6) return '口令至少 6 位';
                return '';
            }
        });
        if (!r) return;

        var existing = await fetchToken(r.space);
        if (existing && existing !== r.token) {
            var take = await XHSH.confirm('空间「' + r.space + '」已存在且口令是另一个。要改用该空间原来的口令并同步它的数据吗？（本机现有数据会合并进去）', '接管该空间');
            if (!take) return;
            r.token = existing;
        }
        s.syncSpace = r.space;
        s.syncToken = r.token;
        s.syncAuto = r.auto === '1';
        XHSH.data.save('settings');
        var st = readState(); st.lastSpace = r.space; writeState(st);
        startTimers();
        await syncNow({ force: true });
        XHSH.toast(status.state === 'ok' ? '☁️ 同步已开启' : '同步失败：' + status.message, 3500);
        shareTip();
    }

    function shareTip() {
        if (!space()) return;
        var link = location.origin + location.pathname + '?space=' + encodeURIComponent(space()) + (location.hash || '');
        XHSH.toast('新设备用这个链接打开即可：' + link, 6000);
    }

    async function manualSync() {
        if (!space()) return openSettings();
        var ok = await syncNow({ force: true });
        XHSH.toast(ok ? '☁️ 已同步' : '同步失败：' + status.message, 3000);
    }

    /* ---------------- 调度 ---------------- */
    function enqueue(fn) { queue = queue.then(fn, fn); return queue; }

    function syncNow(opts) {
        opts = opts || {};
        if (!available() || !space()) { setState('off'); return Promise.resolve(false); }
        return enqueue(async function () {
            setState('syncing');
            try {
                markPendingFromMarks();
                await push();          // 服务器会拒绝"它已有的块"，本地随后以服务器版本为准
                var r = await pull();
                status.lastSyncAt = new Date().toLocaleTimeString();
                setState('ok');
                if (r.changed && XHSH.adoptRemote) XHSH.adoptRemote();   // 原地刷新，不跳日期
                return true;
            } catch (e) {
                setState('error', e.message);
                console.warn('[sync] ' + e.message);
                return false;
            }
        });
    }

    function startTimers() {
        clearInterval(pullTimer);
        if (!available() || !space()) { setState('off'); return; }
        pullTimer = setInterval(function () { syncNow(); }, PULL_INTERVAL);
    }

    XHSH.sync = {
        syncNow: syncNow, openSettings: openSettings, status: function () { return status; },
        shareLink: function () { return space() ? location.origin + location.pathname + '?space=' + encodeURIComponent(space()) : ''; }
    };
    XHSH.on('sync-open', openSettings);
    XHSH.on('sync-now', manualSync);

    document.addEventListener('DOMContentLoaded', function () {
        XHSH.data.subscribe('*', function (data, all, slice) {
            if (XHSH._syncing || !slice) return;
            if (!available() || !space()) return;
            var p = readPending();
            p[slice] = Date.now();
            writePending(p);
            if (S().syncAuto === false) return;
            clearTimeout(pushTimer);
            pushTimer = setTimeout(function () { syncNow(); }, PUSH_DELAY);
        });
        window.addEventListener('online', function () { syncNow(); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') syncNow();
        });
        window.addEventListener('pagehide', function () { lastPushAt = Date.now(); });
        autoConnect();
    });

})(window.XHSH);
