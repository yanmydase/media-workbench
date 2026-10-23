/*!
 * 小小花狮 · 天气
 * - wttr.in 免费接口（无需 Key）；20 分钟本地缓存，避免每次切页都请求
 * - 定位按钮：浏览器 Geolocation → 坐标查询（失败自动回落城市名）
 * - 穿搭 / 饮食建议：按温度、降雨、湿度、紫外线规则生成
 */
(function (XHSH) {
    'use strict';
    var esc = XHSH.esc, $ = function (id) { return document.getElementById(id); };
    var CACHE_KEY = 'xhsh.weather.cache';

    var CODE = {
        '113': '☀️', '116': '⛅', '119': '☁️', '122': '☁️', '143': '🌫️', '248': '🌫️', '260': '🌫️',
        '176': '🌦️', '263': '🌦️', '266': '🌦️', '293': '🌦️', '296': '🌦️', '353': '🌦️',
        '179': '🌨️', '182': '🌨️', '185': '🌨️', '227': '🌨️', '230': '🌨️', '320': '🌨️', '323': '🌨️',
        '326': '🌨️', '329': '🌨️', '332': '🌨️', '335': '🌨️', '338': '🌨️', '368': '🌨️', '371': '🌨️',
        '200': '⛈️', '386': '⛈️', '389': '⛈️', '392': '⛈️', '395': '⛈️',
        '281': '🌧️', '284': '🌧️', '299': '🌧️', '302': '🌧️', '305': '🌧️', '308': '🌧️', '311': '🌧️',
        '314': '🌧️', '317': '🌧️', '350': '🌧️', '356': '🌧️', '359': '🌧️', '362': '🌧️', '365': '🌧️', '374': '🌧️', '377': '🌧️'
    };

    var data = null;
    var loading = false;

    function S() { return XHSH.data.all.settings; }
    function readCache() {
        try {
            var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            return c && c.data ? c : null;
        } catch (e) { return null; }
    }
    function writeCache(city, d) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ city: city, at: Date.now(), data: d })); } catch (e) { }
    }

    /* 通过 IP 粗略定位（不弹权限、速度快）；结果缓存 2 小时 */
    async function ipLocate(force) {
        var CACHE = 'xhsh.geo.cache';
        try {
            var c = JSON.parse(localStorage.getItem(CACHE) || 'null');
            if (!force && c && Date.now() - c.at < 2 * 3600 * 1000 && c.query) return c.query;
        } catch (e) { }
        var endpoints = [
            'https://ipapi.co/json/',
            'https://ipwho.is/',
            'http://ip-api.com/json/?fields=status,city,regionName,country,lat,lon'
        ];
        for (var i = 0; i < endpoints.length; i++) {
            try {
                var res = await fetch(endpoints[i], { cache: 'no-store' });
                if (!res.ok) continue;
                var j = await res.json();
                var lat = j.latitude != null ? j.latitude : j.lat;
                var lon = j.longitude != null ? j.longitude : j.lon;
                if (lat == null || lon == null) continue;
                var query = Number(lat).toFixed(3) + ',' + Number(lon).toFixed(3);
                try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), query: query, city: j.city || '', region: j.region || j.regionName || '', country: j.country_name || j.country || '' })); } catch (e) { }
                return query;
            } catch (e) { }
        }
        return '';
    }

    async function fetchWeather(opts) {
        opts = opts || {};
        // 只有用户主动点"搜索"时才用输入框；自动刷新/首次进入用已保存的城市，
        // 避免把"沈丘, Henan, China"这种地名当作新城市去查询
        var typed = opts.force ? $('weatherCity').value.trim() : '';
        var city = opts.city || typed || S().weatherCity || 'shenqiu';
        var cache = readCache();
        if (!opts.force && cache && cache.city === city && Date.now() - cache.at < XHSH.CONFIG.weatherCacheMs) {
            data = cache.data;
            paint();
            return;
        }
        if (loading) return;
        loading = true;
        $('weatherDesc').textContent = '加载中…';
        try {
            var res = await fetch('https://wttr.in/' + encodeURIComponent(city) + '?format=j1&lang=zh', { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            data = await res.json();
            writeCache(city, data);
            S().weatherCity = city;
            XHSH.data.save('settings');
            paint();
            if (!opts.silent) XHSH.toast('天气已更新 🌤️');
        } catch (err) {
            var stale = readCache();
            if (stale && stale.data) {
                data = stale.data;
                paint();
                XHSH.toast('网络异常，显示 ' + Math.round((Date.now() - stale.at) / 60000) + ' 分钟前的缓存', 3500);
            } else {
                $('weatherDesc').textContent = '获取失败';
                $('weatherLoc').textContent = '请检查网络或换个城市名，如 shenqiu / 上海';
                XHSH.toast('天气获取失败：' + err.message);
            }
        } finally {
            loading = false;
        }
    }

    function paint() {
        if (!data) return;
        var cur = data.current_condition[0];
        var loc = data.nearest_area[0];
        $('weatherIcon').textContent = CODE[cur.weatherCode] || '🌤️';
        $('weatherTemp').textContent = cur.temp_C + '°C';
        $('weatherDesc').textContent = cur.weatherDesc[0].value;
        $('weatherHumidity').textContent = cur.humidity + '%';
        $('weatherWind').textContent = cur.windspeedKmph + ' km/h';
        $('weatherVis').textContent = cur.visibility + ' km';
        $('weatherUV').textContent = cur.uvIndex;
        $('weatherLoc').textContent = '📍 ' + loc.areaName[0].value + '，' + loc.region[0].value + '，' + loc.country[0].value;
        renderForecast();
        renderAdvice(cur);
    }

    function renderForecast() {
        var w = data.weather || [];
        $('forecast7').innerHTML = w.slice(0, 7).map(function (d, i) {
            var date = XHSH.parseDate(d.date);
            var hour = d.hourly && d.hourly[4] ? d.hourly[4] : (d.hourly && d.hourly[0]);
            var icon = hour ? (CODE[hour.weatherCode] || '🌤️') : '🌤️';
            var desc = hour ? hour.weatherDesc[0].value : '';
            return '<div class="fc-day' + (i === 0 ? ' today' : '') + '">' +
                '<div class="fc-dow">' + (i === 0 ? '今天' : '周' + XHSH.WEEKDAYS[date.getDay()]) + '</div>' +
                '<div class="fc-date">' + (date.getMonth() + 1) + '/' + date.getDate() + '</div>' +
                '<div class="fc-icon">' + icon + '</div>' +
                '<div class="fc-hilo"><span class="fc-hi">' + esc(d.maxtempC) + '°</span> <span class="fc-lo">' + esc(d.mintempC) + '°</span></div>' +
                '<div class="fc-desc">' + esc(desc) + '</div></div>';
        }).join('');
    }

    function renderAdvice(cur) {
        var t = parseInt(cur.temp_C, 10), code = parseInt(cur.weatherCode, 10);
        var humidity = parseInt(cur.humidity, 10), wind = parseInt(cur.windspeedKmph, 10), uv = parseInt(cur.uvIndex, 10);
        var rain = ['176', '185', '200', '263', '266', '281', '284', '293', '296', '299', '302', '305', '308', '311',
            '314', '317', '350', '353', '356', '359', '386', '389'].indexOf(String(code)) >= 0;
        var snow = String(code).charAt(0) === '3' && !rain;

        var clothing;
        if (t >= 35) clothing = '🔥 高温预警！建议穿<b>轻薄透气</b>的短袖短裤，纯棉/亚麻最佳。出门务必防晒、戴遮阳帽和墨镜。';
        else if (t >= 28) clothing = '☀️ 天气较热，建议<b>短袖 + 短裤/裙子</b>，浅色系吸热少；备一件薄外套应对空调房。';
        else if (t >= 22) clothing = '🌤️ 温暖舒适，建议<b>薄长袖或短袖 + 薄外套</b>，早晚微凉可备开衫。';
        else if (t >= 15) clothing = '🍂 凉爽，建议<b>长袖 + 薄外套/卫衣</b>搭配长裤，内搭短袖方便穿脱。';
        else if (t >= 8) clothing = '🧥 偏冷，建议<b>毛衣/卫衣 + 夹克/风衣</b>，下装厚长裤，可加围巾。';
        else if (t >= 0) clothing = '❄️ 寒冷！建议<b>羽绒服/厚棉衣 + 毛衣 + 保暖内衣</b>，戴手套帽子，注意脚部保暖。';
        else clothing = '🥶 严寒！建议<b>最厚的羽绒服 + 多层叠穿</b>，帽子围巾手套全副武装，减少户外停留。';
        if (rain) clothing += '<br>☔ 有降雨，记得带<b>雨伞或雨衣</b>，穿防水鞋。';
        if (snow) clothing += '<br>🌨️ 有降雪，注意<b>防滑保暖</b>，穿防滑鞋。';
        if (wind > 30) clothing += '<br>💨 风力较大，穿<b>防风外套</b>，避免戴易被吹落的帽子。';
        if (uv >= 6) clothing += '<br>🕶️ 紫外线强（UV ' + uv + '），涂防晒霜。';

        var diet;
        if (t >= 35) diet = '🔥 高温饮食：多喝<b>绿豆汤、酸梅汤</b>；多吃西瓜、黄瓜、苦瓜；补充电解质（淡盐水）；少吃辛辣油腻。';
        else if (t >= 28) diet = '☀️ 偏热：多喝水；多吃时令水果补维生素；适量吃<b>鱼、鸡胸肉</b>等优质蛋白。';
        else if (t >= 15) diet = '🌤️ 舒适：饮食均衡、荤素搭配，多吃应季蔬菜和粗粮，适量坚果。';
        else if (t >= 8) diet = '🍂 偏凉：多喝<b>热汤、热粥</b>暖胃，适量牛羊肉温补，多吃根茎类蔬菜。';
        else diet = '❄️ 寒冷：多喝<b>热汤、姜茶</b>；适当增加高蛋白高热量食物；推荐火锅、炖菜等热食。';
        if (rain) diet += '<br>☔ 雨天可喝杯<b>热姜茶</b>驱寒，吃些薏米粥祛湿。';
        if (humidity > 80) diet += '<br>💧 湿度大，建议吃<b>薏米、红豆、冬瓜</b>等祛湿食物。';
        if (humidity < 30) diet += '<br>🏜️ 空气干燥，多喝<b>蜂蜜水、梨汤</b>润肺，多吃水果。';

        $('clothingAdvice').innerHTML = clothing;
        $('dietAdvice').innerHTML = diet;
    }

    /**
     * 定位：先请求浏览器精确定位（需要用户授权），
     * 失败/超时/被拒绝时自动回落到 IP 粗略定位，最后再回落到已保存的城市。
     */
    async function locate() {
        $('weatherDesc').textContent = '正在定位…';
        var ok = await new Promise(function (resolve) {
            if (!navigator.geolocation) return resolve('');
            navigator.geolocation.getCurrentPosition(function (pos) {
                resolve(pos.coords.latitude.toFixed(3) + ',' + pos.coords.longitude.toFixed(3));
            }, function () { resolve(''); }, { timeout: 8000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false });
        });
        var fromBrowser = !!ok;
        if (!ok) ok = await ipLocate(true);
        if (!ok) {
            XHSH.toast('无法获取位置：请允许定位权限，或直接输入城市名');
            $('weatherDesc').textContent = '定位失败';
            return;
        }
        var input = $('weatherCity');
        if (input) input.value = ok;
        XHSH.toast(fromBrowser ? '📍 已使用浏览器定位' : '📍 已按 IP 粗略定位（可在设置里改回城市名）', 3000);
        await fetchWeather({ city: ok, force: true, silent: true });
    }

    /** 首次进入但没有城市设置时：自动按 IP 定位一次 */
    async function autoLocateIfNeeded() {
        if (S().weatherCity && S().weatherCity !== 'shenqiu') return false;
        if (S().weatherAutoLocated) return false;
        var q = await ipLocate(false);
        if (!q) return false;
        S().weatherCity = q;
        S().weatherAutoLocated = true;
        XHSH.data.save('settings');
        return true;
    }

    window.WeatherModule = {
        mount: async function () {
            var input = $('weatherCity');
            if (input) input.value = S().weatherCity || '';
            var moved = await autoLocateIfNeeded();
            if (moved && input) input.value = S().weatherCity;
            fetchWeather({ silent: true });
        }
    };

    XHSH.on('weather-refresh', function () { fetchWeather({ force: true }); });
    XHSH.on('weather-locate', locate);

})(window.XHSH);
