/*!
 * 小小花狮 · 核心层
 * - 全局命名空间 XHSH
 * - 数据模型 / schemaVersion 迁移 / 存储（分片键 + v1 单键自动迁移）
 * - 日期工具（全部使用本地时区，修复 toISOString().slice 在东八区差一天的问题）
 * - 安全 HTML 转义与 data-action 事件委托（移除内联 onclick，杜绝引号注入）
 * - Toast / 底部弹层 / 确认框
 */
(function (global) {
    'use strict';

    var XHSH = global.XHSH = global.XHSH || {};
    XHSH.version = '2.0.0';

    /* ============================ 常量配置 ============================ */
    XHSH.CONFIG = {
        schemaVersion: 2,
        newWordsPerDay: 20,
        reviewWindowDays: 7,
        longReviewDays: 15,
        defaultQuota: 500,
        autoSyncIntervalMs: 5 * 60 * 1000,
        backupIntervalMs: 5 * 60 * 1000,
        weatherCacheMs: 20 * 60 * 1000,
        aiHistoryLimit: 20,

        legacyKey: 'xhsh_data',
        legacyBackupKey: 'xhsh_backup',
        keyPrefix: 'xhsh.v2.',

        slices: {
            meta: function () { return { schemaVersion: 2, createdAt: nowISO(), updatedAt: nowISO() }; },
            plan: function () { return { tasks: null, checkins: {}, sleepTime: '22:30' }; },
            fitness: function () { return { exercises: [] }; },
            english: function () { return { learned: {}, dailyNew: {}, errorWords: [], studyDays: [], totalWords: 0 }; },
            review: function () { return { items: [], todayMood: '' }; },
            incomes: function () { return { items: [] }; },
            notes: function () { return { items: [] }; },
            ai: function () { return { config: null, agents: null, activeAgentId: '', history: [], quotaUsed: 0, quotaTotal: 500, keyExpiry: '' }; },
            settings: function () { return { theme: 'auto', weatherCity: 'shenqiu', aiMode: 'outline', syncSpace: '', syncToken: '', syncAuto: true, lastSyncAt: '' }; }
        }
    };

    XHSH.DEFAULT_TASKS = [
        { id: 'fitness', name: '健身', icon: '💪', time: '', builtin: true },
        { id: 'english', name: '英语学习', icon: '📖', time: '', builtin: true },
        { id: 'reading', name: '阅读', icon: '📚', time: '', builtin: true },
        { id: 'sleep', name: '睡觉提醒', icon: '😴', time: '22:30', builtin: true }
    ];

    /* ============================ 日期工具 ============================ */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function nowISO() { return new Date().toISOString(); }

    /** 本地日期字符串 YYYY-MM-DD */
    function dateStr(d) {
        d = d || new Date();
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    XHSH.dateStr = dateStr;
    XHSH.nowISO = nowISO;
    XHSH.today = function () { return dateStr(new Date()); };

    /** 解析 YYYY-MM-DD 为本地 0 点（避免 new Date('YYYY-MM-DD') 按 UTC 解析） */
    XHSH.parseDate = function (s) {
        if (!s) return new Date(NaN);
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
        return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
    };

    /** 相对基准日期偏移 n 天，返回日期字符串 */
    XHSH.dateOffset = function (n, base) {
        var d = base ? XHSH.parseDate(base) : new Date();
        d.setDate(d.getDate() + (n || 0));
        return dateStr(d);
    };

    /** a -> b 的整天差（b 缺省为今天） */
    XHSH.daysBetween = function (a, b) {
        var da = XHSH.parseDate(a), db = XHSH.parseDate(b || dateStr());
        if (isNaN(da) || isNaN(db)) return 0;
        return Math.floor((db - da) / 86400000);
    };

    XHSH.WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

    /* ============================ 安全工具 ============================ */
    var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;' };

    /** 文本转义（innerHTML 中的文本节点） */
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"'`=]/g, function (c) { return ESC_MAP[c]; }); }
    XHSH.esc = esc;

    /** 属性转义：可安全放入 onclick="fn('<值>')"、data-*、title 等 */
    function escAttr(s) {
        return String(s == null ? '' : s).replace(/[&<>"'`=\\]/g, function (c) {
            return c === '\\' ? '&#92;' : ESC_MAP[c];
        });
    }
    XHSH.escAttr = escAttr;

    XHSH.merge = function (base, patch) {
        var out = {};
        for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
        for (var j in patch) if (Object.prototype.hasOwnProperty.call(patch, j)) out[j] = patch[j];
        return out;
    };
    XHSH.clone = function (v) { return v == null ? v : JSON.parse(JSON.stringify(v)); };
    XHSH.clamp = function (n, min, max) { return Math.min(max, Math.max(min, n)); };

    /** 金额统一按"分"存取，避免 0.1+0.2 的浮点误差 */
    XHSH.money = {
        toCents: function (v) { var n = parseFloat(v); return isFinite(n) ? Math.round(n * 100) : 0; },
        format: function (cents) {
            var c = Math.round(Number(cents) || 0), sign = c < 0 ? '-' : '';
            c = Math.abs(c);
            var yuan = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ','), fen = c % 100;
            return sign + '¥' + yuan + (fen ? '.' + pad2(fen) : '');
        }
    };

    /* ============================ 事件委托 ============================ */
    var actions = {};
    /**
     * 注册 data-action 处理函数
     * HTML: <button data-action="delete-income" data-id="123">
     * JS:   XHSH.on('delete-income', function (el, ev, ds) {})
     */
    XHSH.on = function (name, fn) { (actions[name] = actions[name] || []).push(fn); };
    XHSH.dispatch = function (name, el, ev) {
        var list = actions[name];
        if (!list) return false;
        var ds = {};
        if (el && el.dataset) for (var k in el.dataset) if (k !== 'action' && k !== 'actionChange') ds[k] = el.dataset[k];
        list.forEach(function (fn) {
            try { fn(el, ev, ds); } catch (e) { console.error('[action:' + name + ']', e); XHSH.toast('操作失败：' + e.message); }
        });
        return true;
    };

    function findActionEl(target) {
        var el = target;
        while (el && el.nodeType === 1) {
            if ((el.dataset && el.dataset.action) || (el.dataset && el.dataset.actionChange)) return el;
            el = el.parentElement;
        }
        return null;
    }

    document.addEventListener('click', function (ev) {
        var el = findActionEl(ev.target);
        if (!el || !el.dataset.action) return;
        if (el.dataset.prevent !== undefined) ev.stopPropagation();
        XHSH.dispatch(el.dataset.action, el, ev);
    });
    document.addEventListener('change', function (ev) {
        var el = ev.target;
        if (el && el.dataset && el.dataset.actionChange) XHSH.dispatch(el.dataset.actionChange, el, ev);
    });

    /* ============================ 数据存储 ============================ */
    var D = null;
    var listeners = {};
    var _sliceBefore = {};   // 上一次保存时的快照，用来生成字段级时间戳

    function fullKey(slice) { return XHSH.CONFIG.keyPrefix + slice; }

    function readJSON(key, store) {
        try {
            var raw = (store || localStorage).getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { console.warn('[storage] 读取失败', key, e); return null; }
    }

    function writeJSON(key, value, store) {
        try {
            (store || localStorage).setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            var quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
            XHSH.toast(quota ? '⚠️ 浏览器存储已满，请先导出备份并清理数据' : '⚠️ 保存失败：' + e.message, 4000);
            console.error('[storage] 写入失败', key, e);
            return false;
        }
    }

    function defaults() {
        var out = {};
        for (var k in XHSH.CONFIG.slices) out[k] = XHSH.CONFIG.slices[k]();
        return out;
    }

    /* ---------- v1 -> v2 迁移 ---------- */
    /**
     * 旧版 AI 配置迁移：
     * - ChatECNU / 旧 /api 端点 → DeepSeek 官方端点与 deepseek-chat
     * - 旧版内置的公共 Key（已泄露）一律丢弃，v2 只认用户自己填的 sk- 开头 Key
     */
    function migrateAIConfig(old) {
        var cfg = XHSH.merge(XHSH.DEFAULT_AI_CONFIG, old || {});
        var base = String(cfg.baseUrl || '');
        if (!base || /chat\.ecnu\.edu\.cn|(^|\/)api\/?$/.test(base)) {
            cfg.baseUrl = XHSH.DEFAULT_AI_CONFIG.baseUrl;
            cfg.provider = 'deepseek';
            cfg.model = XHSH.DEFAULT_AI_CONFIG.model;
        }
        if (!/^sk-[A-Za-z0-9]{20,}$/.test(String(cfg.apiKey || ''))) cfg.apiKey = '';
        // deepseek-chat / deepseek-reasoner 已于 2026-07-24 停止服务，统一升级到最新模型
        if (/^deepseek-(chat|reasoner|v4-flash|v4-flash-vision-exp)$/.test(String(cfg.model || ''))) {
            cfg.model = 'deepseek-flash';
        }
        return cfg;
    }

    function migrateFromV1(v1) {
        var base = defaults();
        if (!v1 || typeof v1 !== 'object') return base;

        base.plan.tasks = Array.isArray(v1.planTasks) && v1.planTasks.length
            ? v1.planTasks.slice() : XHSH.DEFAULT_TASKS.map(function (t) { return XHSH.merge(t, {}); });
        base.plan.checkins = v1.planCheckins && typeof v1.planCheckins === 'object' ? v1.planCheckins : {};
        base.plan.sleepTime = v1.sleepTime || '22:30';

        base.fitness.exercises = Array.isArray(v1.exercises) ? v1.exercises : [];

        base.english.learned = v1.cetLearned && typeof v1.cetLearned === 'object' ? v1.cetLearned : {};
        base.english.dailyNew = v1.cetDailyNew && typeof v1.cetDailyNew === 'object' ? v1.cetDailyNew : {};
        base.english.errorWords = Array.isArray(v1.cetErrorWords) ? v1.cetErrorWords.slice() : [];
        base.english.studyDays = Array.isArray(v1.cetStudyDays) ? v1.cetStudyDays.slice() : [];
        base.english.totalWords = v1.cetTotalWords || 0;

        base.review.items = Array.isArray(v1.reviews) ? v1.reviews.map(function (r) {
            return XHSH.merge(r, { updatedAt: r.updatedAt || nowISO() });
        }) : [];
        base.review.todayMood = v1.todayMood || '';

        // v1 收入只存 amount（元）；v2 改为 amountCents（分）
        base.incomes.items = (Array.isArray(v1.incomes) ? v1.incomes : []).map(function (inc) {
            return {
                id: String(inc.id || Date.now() + Math.random()),
                source: inc.source || '',
                amountCents: inc.amountCents != null ? inc.amountCents : XHSH.money.toCents(inc.amount),
                date: inc.date || XHSH.today(),
                createdAt: inc.createdAt || nowISO()
            };
        });

        base.notes.items = Array.isArray(v1.freeyanNotes) ? v1.freeyanNotes : [];

        base.ai.history = Array.isArray(v1.aiHistory) ? v1.aiHistory : [];
        base.ai.quotaUsed = v1.apiQuotaUsed || 0;
        base.ai.quotaTotal = v1.apiQuotaTotal || XHSH.CONFIG.defaultQuota;
        base.ai.keyExpiry = v1.apiKeyExpiry || '';
        base.ai.activeAgentId = v1.aiMode || '';
        base.ai.config = migrateAIConfig(v1.apiConfig);

        base.settings.theme = v1.theme === 'dark' ? 'dark' : (v1.theme === 'light' ? 'light' : 'auto');
        base.settings.weatherCity = v1.weatherCity || 'shenqiu';
        base.settings.aiMode = v1.aiMode || 'outline';
        base.settings.syncUserId = v1.syncUserId || '';
        base.settings.syncSpace = v1.syncUserId || '';

        base.meta.migratedFrom = 'v1';
        base.meta.migratedAt = nowISO();
        return base;
    }

    /** 升级链：以后新增版本在这里追加分支 */
    function migrate(raw) {
        raw = raw || {};
        var v = raw.schemaVersion || 1;
        var data = raw;
        if (v < 2 && raw.rawV1) data = migrateFromV1(raw.rawV1);
        var base = defaults();
        for (var k in base) {
            if (!data[k] || typeof data[k] !== 'object') data[k] = base[k];
            else if (k !== 'ai') data[k] = XHSH.merge(base[k], data[k]);   // ai 分片字段多，交给 importJSON 归一
        }
        // 空对象分片（例如 v1 里没有 incomes）回到默认值，而不是被空对象覆盖
        for (var j in base) {
            if (data[j] && typeof data[j] === 'object' && Object.keys(data[j]).length === 0 && Object.keys(base[j]).length) {
                data[j] = base[j];
            }
        }
        data.meta.schemaVersion = XHSH.CONFIG.schemaVersion;
        // 每次启动都过一遍 AI 配置：清掉失效的 Key，并把已停用的旧模型名（deepseek-chat 等）升级到最新模型
        data.ai.config = migrateAIConfig(data.ai.config);
        return data;
    }

    function load() {
        var slices = {}, found = 0;
        for (var k in XHSH.CONFIG.slices) {
            var v = readJSON(fullKey(k));
            if (v) { slices[k] = v; found++; }
        }
        if (found === 0) {
            var legacy = readJSON(XHSH.CONFIG.legacyKey) || readJSON(XHSH.CONFIG.legacyBackupKey);
            if (legacy) {
                D = migrate({ rawV1: legacy, schemaVersion: 1 });
                D._needFirstSave = true;
                XHSH._pendingToast = '📦 已升级旧版数据（原数据仍保留在 localStorage 的 ' + XHSH.CONFIG.legacyKey + '）';
                resetBaseline();
                return D;
            }
        }
        slices.schemaVersion = XHSH.CONFIG.schemaVersion;
        D = migrate(slices);
        resetBaseline();
        return D;
    }

    function emit(slice) {
        (listeners[slice] || []).slice().forEach(function (fn) {
            try { fn(D[slice], D); } catch (e) { console.error('[subscribe:' + slice + ']', e); }
        });
    }

    /** 记录字段级修改时间：供同步判断"本地是否比远端新"（随数据保存，云同步时生效） */
    function touchMarks(slice, before, after) {
        if (!after || typeof after !== 'object' || Array.isArray(after)) return;
        var marks = after.syncMarks = after.syncMarks || {};
        Object.keys(after).forEach(function (k) {
            if (k === 'syncMarks' || k === 'checkins' || k.charAt(0) === '_') return;
            var a = JSON.stringify(after[k]), b = before && typeof before === 'object' ? JSON.stringify(before[k]) : undefined;
            if (a !== b) marks[k] = Date.now();
        });
        // 日期分组的记录（打卡、英语每日新词、每日心情）按"这一天"单独记时间，避免整天被远端覆盖
        ['checkins', 'dailyNew', 'moodByDate'].forEach(function (group) {
            if (!after[group] || typeof after[group] !== 'object') return;
            var prev = before && before[group] ? before[group] : {};
            Object.keys(after[group]).forEach(function (day) {
                if (JSON.stringify(after[group][day]) !== JSON.stringify(prev[day])) marks[group + '.' + day] = Date.now();
            });
        });
    }

    function saveSlice(slice) { return save(slice); }

    /** 统一保存入口：无参数=全部；传入分片名=仅该分片 */
    function save(slice) {
        if (!D) return false;
        var keys = slice ? [slice] : Object.keys(D).filter(function (k) { return k.charAt(0) !== '_'; });
        var sliced = keys.filter(function (k) { return _sliceBefore[k] !== undefined; });   // 只对"本会话载入过"的分片打标
        sliced.forEach(function (k) { touchMarks(k, _sliceBefore[k], D[k]); });
        var ok = true;
        sliced.forEach(function (k) { ok = writeJSON(fullKey(k), D[k]) && ok; });
        sliced.forEach(function (k) { if (D[k]) _sliceBefore[k] = XHSH.clone(D[k]); });
        var others = keys.filter(function (k) { return _sliceBefore[k] === undefined; });
        others.sort().forEach(function (k) { ok = writeSliceRaw(k) && ok; });
        if (ok && sliced.length) {
            var saved = sliced[0];
            // 通知订阅者"哪个分片真的变了"（同步用它判断是否需要推送）
            (listeners[saved.slice] || []).concat(listeners['*'] || []).forEach(function (fn) {
                try { fn(D[saved], D, saved); } catch (e) { console.error('[subscribe]', e); }
            });
        }
        return ok;
    }

    /** 不做标记的原始落盘（用于本会话尚未载入过的分片） */
    function writeSliceRaw(slice) {
        if (!D[slice]) return false;
        return writeJSON(fullKey(slice), D[slice]);
    }
    /** 载入/导入后重建基线 */
    function resetBaseline() {
        _sliceBefore = {};
        if (!D) return;
        Object.keys(D).forEach(function (k) { if (D[k] && typeof D[k] === 'object') _sliceBefore[k] = XHSH.clone(D[k]); });
    }

    XHSH.data = {
        load: load,
        save: save,
        get all() { return D; },
        subscribe: function (slice, fn) { (listeners[slice] = listeners[slice] || []).push(fn); },
        resetBaseline: resetBaseline,
        exportJSON: function () {
            return JSON.stringify({ schemaVersion: XHSH.CONFIG.schemaVersion, app: '小小花狮', exportedAt: nowISO(), data: D }, null, 2);
        },
        importJSON: function (text, mode) {
            var parsed = JSON.parse(text);
            var incoming = parsed && parsed.data ? parsed.data : parsed;
            var migrated = migrate(incoming);
            D = (mode === 'replace') ? migrated : XHSH.mergeData(D, migrated);
            D.meta.schemaVersion = XHSH.CONFIG.schemaVersion;
            D.meta.updatedAt = nowISO();
            save();
            emit('*');
            return D;
        },
        reset: function () {
            for (var k in XHSH.CONFIG.slices) { try { localStorage.removeItem(fullKey(k)); } catch (e) { } }
            D = defaults();
            save();
            emit('*');
        }
    };

    /* ---------- 合并策略：最后写入胜出 + 墓碑删除（替代 v1 的"云端覆盖本地、删除被复活"） ---------- */
    function ts(x) { return Date.parse((x && (x.updatedAt || x.createdAt || x.time)) || 0) || 0; }

    function mergeArrays(localArr, cloudArr) {
        var map = {};
        (localArr || []).forEach(function (x) { if (x && x.id != null) map[x.id] = x; });
        (cloudArr || []).forEach(function (x) {
            if (!x || x.id == null) return;
            var cur = map[x.id];
            if (!cur) { map[x.id] = x; return; }
            if (x.deletedAt) { map[x.id] = x; return; }   // 墓碑优先，防止已删除数据复活
            if (cur.deletedAt) return;                     // 本地墓碑保留
            map[x.id] = ts(x) > ts(cur) ? x : cur;         // 最后写入胜出
        });
        return Object.keys(map).map(function (k) { return map[k]; }).filter(function (x) { return !x.deletedAt; });
    }

    function mergeObjects(localObj, cloudObj) {
        var out = XHSH.clone(localObj) || {};
        for (var k in cloudObj) {
            if (!Object.prototype.hasOwnProperty.call(cloudObj, k)) continue;
            var c = cloudObj[k], l = out[k];
            if (Array.isArray(c)) out[k] = mergeArrays(Array.isArray(l) ? l : [], c);
            else if (c && typeof c === 'object') out[k] = mergeObjects(l && typeof l === 'object' ? l : {}, c);
            else if (l === undefined || l === null) out[k] = c;   // 标量冲突时保留本地（本地是用户当前操作结果）
        }
        return out;
    }

    /** 合并两份完整数据（本地优先冲突） */
    function mergeData(local, cloud) {
        var out = XHSH.clone(local);
        ['plan', 'fitness', 'english', 'review', 'incomes', 'notes', 'ai', 'settings'].forEach(function (s) {
            if (!cloud || !cloud[s]) return;
            out[s] = mergeObjects(out[s] || {}, cloud[s]);
        });
        return out;
    }
    XHSH.mergeData = mergeData;

    /* ============================ UI 辅助 ============================ */
    var toastTimer = null;
    XHSH.toast = function (msg, ms) {
        var host = document.getElementById('toastContainer');
        if (!host) { console.log('[toast]', msg); return; }
        host.querySelectorAll('.toast').forEach(function (t) { t.remove(); });
        var t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        host.appendChild(t);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.remove(); }, ms || 2200);
    };

    /**
     * 底部弹层表单（替代 prompt / confirm）
     * fields: [{name, label, type:'text|number|date|time|textarea|select', value, placeholder, options:[{value,label}], hint, min, max, step}]
     * 返回 Promise<对象|null>
     */
    XHSH.sheet = function (opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var old = document.getElementById('xhshSheet');
            if (old) old.remove();
            var wrap = document.createElement('div');
            wrap.id = 'xhshSheet';
            wrap.className = 'modal-overlay';
            var fieldsHtml = (opts.fields || []).map(function (f) {
                var label = '<label class="sheet-label">' + esc(f.label || '') + '</label>';
                var attrs = 'class="input" data-field="' + escAttr(f.name) + '"';
                var input;
                if (f.type === 'select') {
                    input = '<select ' + attrs + '>' + (f.options || []).map(function (o) {
                        return '<option value="' + escAttr(o.value) + '"' + (String(o.value) === String(f.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
                    }).join('') + '</select>';
                    if (typeof f.onChange === 'function') {
                        setTimeout(function () {
                            var sel = wrap.querySelector('[data-field="' + f.name + '"]');
                            if (sel) sel.addEventListener('change', function () { f.onChange(sel.value); });
                        }, 0);
                    }
                } else if (f.type === 'textarea') {
                    input = '<textarea ' + attrs + ' placeholder="' + escAttr(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea>';
                } else {
                    input = '<input ' + attrs + ' type="' + escAttr(f.type || 'text') + '"' +
                        ' placeholder="' + escAttr(f.placeholder || '') + '" value="' + escAttr(f.value == null ? '' : f.value) + '"' +
                        (f.min != null ? ' min="' + escAttr(f.min) + '"' : '') +
                        (f.max != null ? ' max="' + escAttr(f.max) + '"' : '') +
                        (f.step != null ? ' step="' + escAttr(f.step) + '"' : '') +
                        (f.inputmode ? ' inputmode="' + escAttr(f.inputmode) + '"' : '') + '>';
                }
                return '<div class="sheet-field"' + (f.group ? ' data-group="' + escAttr(f.group) + '" style="display:none"' : '') + '>' + label + input +
                    (f.hint ? '<div class="sheet-hint">' + esc(f.hint) + '</div>' : '') + '</div>';
            }).join('');

            wrap.innerHTML =
                '<div class="modal-sheet" role="dialog" aria-modal="true">' +
                '<div class="modal-handle"></div>' +
                '<div class="modal-title">' + esc(opts.title || '') + '</div>' +
                (opts.message ? '<div class="sheet-message">' + esc(opts.message) + '</div>' : '') +
                fieldsHtml +
                ((opts.extraActions || []).length ? '<div class="sheet-extra">' + opts.extraActions.map(function (a) {
                    return '<button class="btn btn-outline btn-block" data-extra="' + escAttr(a.name) + '">' + esc(a.text) + '</button>';
                }).join('') + '</div>' : '') +
                '<div class="sheet-actions">' +
                '<button class="btn btn-outline btn-block" data-act="cancel">' + esc(opts.cancelText || '取消') + '</button>' +
                '<button class="btn btn-primary btn-block" data-act="ok">' + esc(opts.okText || '确定') + '</button>' +
                '</div></div>';

            function close(result) { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(result); }
            function onKey(e) { if (e.key === 'Escape') close(null); }
            wrap.addEventListener('click', function (e) {
                if (e.target === wrap) return close(null);
                var extra = e.target.getAttribute && e.target.getAttribute('data-extra');
                if (extra) {
                    var ev = {};
                    (opts.fields || []).forEach(function (f) {
                        var el = wrap.querySelector('[data-field="' + f.name + '"]');
                        ev[f.name] = el ? el.value.trim() : '';
                    });
                    ev.__action = extra;
                    return close(ev);
                }
                var act = e.target.getAttribute && e.target.getAttribute('data-act');
                if (act === 'cancel') return close(null);
                if (act === 'ok') {
                    var vals = {};
                    (opts.fields || []).forEach(function (f) {
                        var el = wrap.querySelector('[data-field="' + f.name + '"]');
                        vals[f.name] = el ? el.value.trim() : '';
                    });
                    if (opts.validate) {
                        var msg = opts.validate(vals);
                        if (msg) { XHSH.toast(msg); return; }
                    }
                    close(vals);
                }
            });
            // 折叠分组：某个 select 的值为 open 时，显示 data-group 与它同名的字段
            wrap.addEventListener('change', function (e) {
                var el = e.target;
                if (!el || !el.dataset || !el.dataset.field) return;
                wrap.querySelectorAll('[data-group]').forEach(function (g) {
                    var show = el.value === 'open';
                    g.style.display = show ? '' : 'none';
                });
            });
            document.addEventListener('keydown', onKey);
            document.body.appendChild(wrap);
            var first = wrap.querySelector('input,textarea,select');
            if (first) setTimeout(function () {
                first.focus();
                if (first.select && first.type !== 'date' && first.type !== 'time') first.select();
            }, 60);
        });
    };

    /** 确认框（基于 sheet，返回 Promise<boolean>） */
    XHSH.confirm = function (message, okText) {
        return XHSH.sheet({ title: '请确认', message: String(message || ''), okText: okText || '确定' })
            .then(function (r) { return r !== null; });
    };

    /* ============================ 预置 AI 配置 ============================
     * 这里只放非机密默认值：API Key 永远由使用者在设置面板自行填写，仅存在本机浏览器。
     */
    XHSH.AI_PROVIDERS = [
        { id: 'deepseek', name: 'DeepSeek 官方（浏览器直连）', baseUrl: 'https://api.deepseek.com', models: ['deepseek-flash', 'deepseek-v4-pro'] },
        { id: 'proxy', name: '本项目 /api 代理（自建时可用）', baseUrl: '/api', models: ['deepseek-flash', 'deepseek-v4-pro'] },
        { id: 'custom', name: '自定义（OpenAI 兼容接口）', baseUrl: '', models: [] }
    ];

    XHSH.DEFAULT_AI_CONFIG = {
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-flash',
        apiKey: '',
        systemPrompt: '你是小小花狮，一个温暖、专业、有创造力的AI助手。你擅长写作、学习辅导、生活建议，总是用鼓励和建设性的方式回答问题。',
        streamMode: true,
        temperature: 0.8,
        maxTokens: 4096
    };

    XHSH._internal = { saveJSON: writeJSON, readJSON: readJSON, fullKey: fullKey, migrate: migrate, migrateFromV1: migrateFromV1, mergeArrays: mergeArrays };

})(window);
