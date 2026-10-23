/*!
 * 小小花狮 · 英语学习（CET-6）
 * - 每日新词按配置数量分配；词库耗尽时优雅降级（不再出现 NaN%）
 * - 复习计划：7 天回顾 + 15 天巩固 + 易错词，统一由 buildReviewList() 计算
 * - TTS 朗读、麦克风录音对比（带特性检测）
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, escAttr = XHSH.escAttr, $ = function (id) { return document.getElementById(id); };
    var WORDS = (window.CET6_WORDS || []).slice().sort(function (a, b) { return a.id - b.id; });
    var WORD_BY_ID = {};
    WORDS.forEach(function (w) { WORD_BY_ID[w.id] = w; });

    function E() { return XHSH.data.all.english; }
    function findWord(id) { return WORD_BY_ID[id]; }

    /* ---------------- 今日新词（纯函数：第一次需要时才写入数据） ---------------- */
    function ensureTodayNewWords() {
        var ds = XHSH.today(), e = E();
        if (e.dailyNew[ds]) return e.dailyNew[ds];
        var learned = e.learned || {};
        var assigned = Object.keys(learned).filter(function (k) { return learned[k] && learned[k].firstDate; }).map(Number);
        var pool = WORDS.filter(function (w) { return assigned.indexOf(w.id) < 0 && !(learned[w.id] && learned[w.id].firstDate); });
        shuffle(pool);
        var n = Math.min(XHSH.CONFIG.newWordsPerDay, pool.length);
        e.dailyNew[ds] = pool.slice(0, n).map(function (w) { return w.id; });
        e.dailyNew[ds].forEach(function (id, i) {
            if (!e.learned[id]) e.learned[id] = {};
            if (!e.learned[id].firstDate) e.learned[id].firstDate = ds;
            if (!e.learned[id].order) e.learned[id].order = i;
            e.learned[id].updatedAt = XHSH.nowISO();
        });
        if (e.studyDays.indexOf(ds) < 0) e.studyDays.push(ds);
        XHSH.data.save('english');
        return e.dailyNew[ds];
    }

    /** 统一的复习清单：返回 [{id, tag}] */
    function buildReviewList() {
        var ds = XHSH.today(), e = E();
        var todayNew = e.dailyNew[ds] || [];
        var picked = {}, out = [];
        function push(id, tag) {
            if (todayNew.indexOf(id) >= 0 || picked[id] || !WORD_BY_ID[id]) return;
            picked[id] = true;
            out.push({ id: id, tag: tag });
        }
        var win = XHSH.CONFIG.reviewWindowDays, long = XHSH.CONFIG.longReviewDays;
        for (var i = 1; i <= win; i++) {
            (e.dailyNew[XHSH.dateOffset(-i)] || []).forEach(function (id) { push(id, 'review'); });
        }
        (e.dailyNew[XHSH.dateOffset(-long)] || []).forEach(function (id) { push(id, 'day15'); });
        var doy = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        if (doy % 7 === 0) (e.errorWords || []).forEach(function (id) { push(id, 'error'); });
        out.forEach(function (x) {
            if (e.errorWords.indexOf(x.id) >= 0 && x.tag !== 'review') x.tag = 'error';
        });
        return out;
    }

    /* ---------------- 渲染 ---------------- */
    function render() {
        var ids = ensureTodayNewWords();
        var words = ids.map(findWord).filter(Boolean);
        var learned = E().learned || {};
        var studied = words.filter(function (w) { return learned[w.id] && learned[w.id].reviewCount > 0; }).length;
        var pct = words.length ? Math.round(studied / words.length * 100) : 0;
        var review = buildReviewList();

        var totalWords = Object.keys(learned).filter(function (k) { return learned[k] && learned[k].reviewCount > 0; }).length;
        $('engStats').innerHTML =
            '<div class="stat-card"><div class="stat-value" style="color:var(--primary);">' + E().studyDays.length + '</div><div class="stat-label">累计学习天数</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:var(--success);">' + totalWords + '</div><div class="stat-label">累计单词量</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:var(--warning);">' + E().errorWords.length + '</div><div class="stat-label">易错单词</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:var(--info);">' + WORDS.length + '</div><div class="stat-label">词库总量</div></div>';

        $('engTodayProgress').textContent = '已学 ' + studied + '/' + words.length + ' · ' + pct + '%';
        $('engProgressBar').style.width = pct + '%';

        var remaining = Math.max(0, words.length - studied);
        $('engTodayPlan').innerHTML = words.length
            ? '📌 <b>今日新词 ' + words.length + ' 个</b> | 未学 ' + remaining + ' 个 | 今日复习 <b>' + review.length + '</b> 个'
            : '🎉 <b>词库已全部学完</b>，继续复习巩固吧！可在「设置」里导入新词库（规划中）';

        $('engWordList').innerHTML = words.length ? words.map(function (w) {
            var ld = learned[w.id] || {};
            var isReviewed = ld.lastReview === XHSH.today() && ld.reviewCount > 0;
            var isError = E().errorWords.indexOf(w.id) >= 0;
            return '<div class="eng-word-row">' +
                '<div class="eng-word-info">' +
                '<div class="en">' + esc(w.en) + ' <span class="eng-tag new">新词</span></div>' +
                '<div class="phonetic">' + esc(w.phonetic) + '</div>' +
                '<div class="zh">' + esc(w.zh) + '</div>' +
                '<div class="example">📖 ' + esc(w.example) + '</div>' +
                '</div>' +
                '<div class="eng-word-actions">' +
                '<button class="eng-btn speaker" id="spk_' + w.id + '" data-action="eng-speak" data-id="' + w.id + '" title="朗读">🔊</button>' +
                '<button class="eng-btn mic" id="mic_' + w.id + '" data-action="eng-record" data-id="' + w.id + '" title="录音对比">🎤</button>' +
                '<button class="eng-btn mark-error' + (isError ? ' marked' : '') + '" data-action="eng-error" data-id="' + w.id + '" title="标为易错">⚠️</button>' +
                '<button class="eng-btn check' + (isReviewed ? ' done' : '') + '" data-action="eng-learned" data-id="' + w.id + '" title="已学习">✓</button>' +
                '</div></div>';
        }).join('') : '<div class="empty-state"><div class="empty-icon">📚</div><div>今日没有新词，好好复习吧</div></div>';

        var card = $('engReviewCard');
        $('engReviewCount').textContent = review.length + ' 个';
        if (!review.length) {
            card.style.display = 'none';
        } else {
            card.style.display = 'block';
            var tagText = { review: '7天复习', day15: '15天巩固', error: '易错词' };
            $('engReviewList').innerHTML = review.map(function (x) {
                var w = findWord(x.id);
                return '<div class="eng-word-row"><div class="eng-word-info">' +
                    '<div class="en">' + esc(w.en) + ' <span class="eng-tag ' + x.tag + '">' + tagText[x.tag] + '</span></div>' +
                    '<div class="phonetic">' + esc(w.phonetic) + '</div><div class="zh">' + esc(w.zh) + '</div></div>' +
                    '<div class="eng-word-actions">' +
                    '<button class="eng-btn speaker" data-action="eng-speak" data-id="' + w.id + '" title="朗读">🔊</button>' +
                    '<button class="eng-btn mic" data-action="eng-record" data-id="' + w.id + '" title="录音对比">🎤</button>' +
                    '<button class="eng-btn check" data-action="eng-learned" data-id="' + w.id + '" title="标记复习完成">✓</button>' +
                    '</div></div>';
            }).join('');
        }
        renderErrors();
    }

    function renderErrors() {
        var ids = E().errorWords || [];
        $('engErrorCount').textContent = ids.length + ' 个';
        var host = $('engErrorList');
        if (!ids.length) {
            host.innerHTML = '<div class="empty-state"><div class="empty-icon">📕</div><div>暂无易错词，继续加油！</div></div>';
            return;
        }
        host.innerHTML = ids.map(findWord).filter(Boolean).map(function (w) {
            return '<div class="eng-word-row"><div class="eng-word-info">' +
                '<div class="en">' + esc(w.en) + '</div><div class="phonetic">' + esc(w.phonetic) + '</div><div class="zh">' + esc(w.zh) + '</div></div>' +
                '<div class="eng-word-actions">' +
                '<button class="eng-btn speaker" data-action="eng-speak" data-id="' + w.id + '" title="朗读">🔊</button>' +
                '<button class="eng-btn mic" data-action="eng-record" data-id="' + w.id + '" title="录音对比">🎤</button>' +
                '<button class="eng-btn mark-error marked" data-action="eng-error" data-id="' + w.id + '" title="取消标记">⚠️</button>' +
                '</div></div>';
        }).join('');
    }

    /* ---------------- 行为 ---------------- */
    function speak(id) {
        var w = findWord(Number(id));
        if (!w) return;
        if (!('speechSynthesis' in window)) return XHSH.toast('当前浏览器不支持语音朗读');
        window.speechSynthesis.cancel();
        document.querySelectorAll('.eng-btn.speaker').forEach(function (b) { b.classList.remove('playing'); });
        var btn = $('spk_' + id);
        if (btn) btn.classList.add('playing');
        var u = new SpeechSynthesisUtterance(w.en);
        u.lang = 'en-US'; u.rate = 0.85; u.pitch = 1;
        u.onend = u.onerror = function () { if (btn) btn.classList.remove('playing'); };
        window.speechSynthesis.speak(u);
    }

    var recorder = null, chunks = [], activeStream = null, lastAudioUrl = null;

    function record(id) {
        var w = findWord(Number(id));
        if (!w) return;
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            return XHSH.toast('当前浏览器不支持录音，可先听标准发音');
        }
        var btn = $('mic_' + id);
        if (recorder && recorder.state === 'recording') {
            recorder.stop();
            if (btn) btn.classList.remove('recording');
            return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            activeStream = stream;
            recorder = new MediaRecorder(stream);
            chunks = [];
            recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
            recorder.onstop = function () {
                var blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
                lastAudioUrl = URL.createObjectURL(blob);
                var audio = new Audio(lastAudioUrl);
                var speakFirst = function () {
                    if (!('speechSynthesis' in window)) return audio.play();
                    var u = new SpeechSynthesisUtterance(w.en);
                    u.lang = 'en-US'; u.rate = 0.85;
                    u.onend = function () { audio.play(); };
                    window.speechSynthesis.speak(u);
                };
                speakFirst();
                stream.getTracks().forEach(function (t) { t.stop(); });
                XHSH.toast('🎤 先听标准发音，再听你的录音');
            };
            recorder.start();
            if (btn) btn.classList.add('recording');
            XHSH.toast('🔴 录音中，再次点击停止');
            // 最长 15 秒自动停止
            setTimeout(function () { if (recorder && recorder.state === 'recording') recorder.stop(); }, 15000);
        }).catch(function (err) {
            if (activeStream) activeStream.getTracks().forEach(function (t) { t.stop(); });
            XHSH.toast('无法访问麦克风：' + (err && err.message ? err.message : '请检查权限'));
        });
    }

    function toggleLearned(id) {
        var e = E(), nid = Number(id);
        if (!e.learned[nid]) e.learned[nid] = {};
        var ld = e.learned[nid], ds = XHSH.today();
        if (ld.lastReview === ds && ld.reviewCount > 0) {
            ld.reviewCount = Math.max(0, (ld.reviewCount || 0) - 1);
            ld.lastReview = '';
        } else {
            ld.reviewCount = (ld.reviewCount || 0) + 1;
            ld.lastReview = ds;
        }
        ld.learned = ld.reviewCount > 0;
        ld.updatedAt = XHSH.nowISO();
        XHSH.data.save('english');
        render();
    }

    function toggleError(id) {
        var e = E(), nid = Number(id), idx = e.errorWords.indexOf(nid);
        if (idx >= 0) e.errorWords.splice(idx, 1); else e.errorWords.push(nid);
        XHSH.data.save('english');
        render();
        XHSH.toast(idx >= 0 ? '已取消易错标记' : '已标为易错词 ⚠️');
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
    }

    window.EnglishModule = {
        mount: render,
        reviewCount: function () { return buildReviewList().length; }
    };

    XHSH.on('eng-speak', function (el, ev, ds) { speak(ds.id); });
    XHSH.on('eng-record', function (el, ev, ds) { record(ds.id); });
    XHSH.on('eng-learned', function (el, ev, ds) { toggleLearned(ds.id); });
    XHSH.on('eng-error', function (el, ev, ds) { toggleError(ds.id); });

})(window.XHSH);
