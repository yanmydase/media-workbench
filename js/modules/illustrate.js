/*!
 * 小小花狮 · 插画引擎（v1）
 *
 * 目标：不依赖任何外部图片服务或 Key，用 SVG 画出"动画风"配图——
 *   1) 生物卡片：按物种特征自动组合（耳、角、尾、花纹、角状轮廓…）生成卡通动物头像；
 *   2) 生态位图谱：食物链 / 天敌 / 共生关系的可视化关系图；
 *   3) 场景插画：把动物放进它自己的栖息地（森林 / 草原 / 水域 / 极地 / 沙漠…）。
 *
 * 所有图形都是纯 SVG（矢量），可随卡片缩放、可离线、可导出。
 * 生成后以 data:image/svg+xml 存在 ai.images 里（只存一份，按需引用）。
 */
(function (XHSH) {
    'use strict';


    /* ---------------- 调色板 ---------------- */
    var PALETTE = [
        { face: '#f3c98b', shade: '#e0ab63', belly: '#fff3dd', eye: '#3a2a1a' },   // 金黄
        { face: '#c9a27e', shade: '#a87f5c', belly: '#f7e7d3', eye: '#2e2016' },   // 棕
        { face: '#9aa4ae', shade: '#77828d', belly: '#e9eef2', eye: '#1f262c' },   // 灰
        { face: '#fdfaf3', shade: '#e6e0d4', belly: '#ffffff', eye: '#2b2b2b' },   // 白
        { face: '#ff9d5c', shade: '#f07a35', belly: '#fff0e0', eye: '#40200f' },   // 橙
        { face: '#6fb3d2', shade: '#4a93b8', belly: '#e3f4fb', eye: '#12303d' },   // 蓝
        { face: '#8bd17c', shade: '#63b356', belly: '#eefae9', eye: '#1c3a17' },   // 绿
        { face: '#e86a6a', shade: '#c94b4b', belly: '#ffe7e7', eye: '#3a1414' },   // 红
        { face: '#d8c26a', shade: '#bda63f', belly: '#fbf6de', eye: '#3a3214' }    // 芥黄
    ];
    var HABITATS = {
        forest: { sky: ['#dff3e4', '#b7e0c6'], ground: '#7cb883', accent: '#4f8f6a', label: '森林' },
        grass: { sky: ['#fff4d6', '#ffe1a8'], ground: '#e9c877', accent: '#c9a24a', label: '草原' },
        water: { sky: ['#e2f6ff', '#a9dcf5'], ground: '#63b6d8', accent: '#2f87ad', label: '水域' },
        polar: { sky: ['#eaf6ff', '#c7e6fb'], ground: '#f4fbff', accent: '#9cc9e4', label: '极地' },
        desert: { sky: ['#fff1e0', '#ffd9b0'], ground: '#eec68f', accent: '#cf9f61', label: '荒漠' },
        sky: { sky: ['#e6f0ff', '#c9dcff'], ground: '#dcd6f2', accent: '#8ea9d8', label: '高空' },
        night: { sky: ['#2c3e66', '#1b2745'], ground: '#2f4159', accent: '#6f86b3', label: '夜行' }
    };
    /* 特征词 → 需补充的提示（让提示词里能体现"动画、卡通、儿童友好"） */
    var STYLE_HINT = '卡通风、扁平插画、圆角、明亮配色、无文字、正面构图、儿童绘本风格';

    function hash(str) {
        var h = 2166136261, s = String(str || '');
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return Math.abs(h);
    }

    /* ---------------- 物种特征识别 ---------------- */
    var TRAITS = [
        { k: 'ear', v: 'long', re: /(兔|tail|兔|hare|rabbit|驴|donkey|狐蝠)/i },
        { k: 'ear', v: 'round', re: /(熊猫|panda|熊|bear|考拉|koala|浣熊|raccoon|獾|badger)/i },
        { k: 'ear', v: 'tuft', re: /(猞猁|lynx|松鼠|squirrel|猫|cat|狐|fox|狼|wolf|狐猴|lemur)/i },
        { k: 'horn', v: 'curved', re: /(鹿|deer|羊|sheep|goat|牛|ox|cow|羚|antelope)/i },
        { k: 'horn', v: 'one', re: /(犀|rhino|独角|narwhal|一角)/i },
        { k: 'trunk', v: true, re: /(象|elephant)/i },
        { k: 'tail', v: 'bushy', re: /(狐|fox|松鼠|squirrel|狼|wolf|雪豹|豹|leopard)/i },
        { k: 'tail', v: 'ringed', re: /(小熊猫|red panda|浣熊|raccoon|狐猴|lemur)/i },
        { k: 'pattern', v: 'stripe', re: /(虎|tiger|斑马|zebra|猫|cat)/i },
        { k: 'color', v: 'orange', re: /(虎|tiger|狐|fox|小熊猫|red panda|松鼠|squirrel)/i },
        { k: 'color', v: 'snow', re: /(雪豹|snow leopard|北极熊|polar bear)/i },
        { k: 'color', v: 'brown', re: /(水獭|otter|熊|bear|鹿|deer|麋鹿|骆驼|camel)/i },
        { k: 'bmask', v: true, re: /(企鹅|penguin)/i },
        { k: 'pattern', v: 'spot', re: /(豹|leopard|鹿|deer|长颈鹿|giraffe|斑鸠)/i },
        { k: 'pattern', v: 'blackwhite', re: /(熊猫|panda|獾|badger|企鹅|penguin|斑马|zebra)/i },
        { k: 'nose', v: 'beak', re: /(鸟|bird|企鹅|penguin|鹰|eagle|鸽|dove|鹤|crane|鸡|chicken)/i },
        { k: 'nose', v: 'flipper', re: /(鲸|whale|海豚|dolphin|海豹|seal|海狮|sea lion)/i },
        { k: 'home', v: 'water', re: /(水|獭|otter|鲸|whale|海|sea|鱼|fish|企鹅|penguin|河马|hippo)/i },
        { k: 'home', v: 'polar', re: /(北极|antarctic|polar|企鹅|penguin|雪|snow)/i },
        { k: 'home', v: 'desert', re: /(骆驼|camel|沙漠|desert|狐獴|meerkat|蝎|scorpion)/i },
        { k: 'home', v: 'sky', re: /(鹰|eagle|鸟|bird|蝙蝠|bat|鹤|crane)/i },
        { k: 'home', v: 'night', re: /(猫头鹰|owl|夜|nocturnal|蝙蝠|bat|猞猁|lynx)/i },
        { k: 'home', v: 'grass', re: /(狮|lion|斑马|zebra|长颈鹿|giraffe|草原|savanna|羚|antelope)/i }
    ];

    function traitsOf(name) {
        var t = { ear: 'pointy', horn: '', trunk: false, tail: '', pattern: '', nose: 'dog', home: 'forest', fur: '' };
        TRAITS.forEach(function (x) { if (x.re.test(name)) t[x.k] = x.v; });
        if (/獭|otter|海豹|seal|鲸|whale|海豚/.test(name)) t.tail = 'flipper';
        if (/鸟|bird|鸡|chicken|鸭|duck|企鹅|penguin/.test(name)) { t.ear = 'none'; t.nose = 'beak'; t.legs = true; }
        if (/蛇|snake|蟒|python/.test(name)) { t.body = 'snake'; }
        if (/蛙|frog|蟾/.test(name)) { t.body = 'frog'; }
        return t;
    }

    /* ---------------- SVG 片段 ---------------- */
    function sky(id) {
        var h = HABITATS[id] || HABITATS.forest;
        return '<linearGradient id="sky' + id + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="' + h.sky[0] + '"/><stop offset="1" stop-color="' + h.sky[1] + '"/></linearGradient>';
    }

    function habitatBackdrop(home) {
        var h = HABITATS[home] || HABITATS.forest;
        var s = '<rect width="400" height="300" fill="url(#sky' + home + ')"/>';
        if (home === 'forest') {
            s += '<g opacity=".85">' + [40, 90, 300, 350].map(function (x, i) {
                return '<rect x="' + x + '" y="' + (150 - i * 8) + '" width="14" height="90" rx="6" fill="' + h.accent + '"/>' +
                    '<circle cx="' + (x + 7) + '" cy="' + (140 - i * 8) + '" r="34" fill="' + (i % 2 ? '#8fcf9b' : '#6dbb82') + '"/>';
            }).join('') + '</g>';
        } else if (home === 'water') {
            s += '<path d="M0 210 Q100 190 200 210 T400 210 V300 H0Z" fill="' + h.ground + '" opacity=".85"/>' +
                '<path d="M0 240 Q100 220 200 240 T400 240 V300 H0Z" fill="' + h.accent + '" opacity=".55"/>';
        } else if (home === 'polar') {
            s += '<path d="M0 220 L90 150 L160 220 L250 140 L330 220 L400 170 V300 H0Z" fill="#ffffff" stroke="' + h.accent + '" stroke-width="3"/>' +
                '<circle cx="330" cy="60" r="26" fill="#fff6c9" opacity=".9"/>';
        } else if (home === 'desert') {
            s += '<path d="M0 230 Q120 190 240 230 T400 225 V300 H0Z" fill="' + h.ground + '"/>' +
                '<circle cx="320" cy="70" r="28" fill="#ffd86b"/>' +
                '<path d="M0 245 Q140 215 280 245 T400 240" stroke="' + h.accent + '" stroke-width="6" fill="none" opacity=".5"/>';
        } else if (home === 'sky') {
            s += '<g fill="#ffffff" opacity=".85"><ellipse cx="90" cy="110" rx="46" ry="24"/><ellipse cx="130" cy="118" rx="34" ry="18"/></g>' +
                '<g fill="#ffffff" opacity=".6"><ellipse cx="300" cy="70" rx="40" ry="20"/><ellipse cx="340" cy="78" rx="28" ry="15"/></g>';
        } else if (home === 'night') {
            s += '<circle cx="320" cy="62" r="26" fill="#f7f3c1"/>' +
                '<g fill="#ffffff" opacity=".8"><circle cx="60" cy="50" r="3"/><circle cx="120" cy="90" r="2.5"/><circle cx="210" cy="44" r="2"/><circle cx="270" cy="100" r="2.5"/></g>' +
                '<path d="M0 240 Q120 210 240 245 T400 235 V300 H0Z" fill="' + h.ground + '"/>';
        } else {
            s += '<path d="M0 235 Q120 205 240 240 T400 232 V300 H0Z" fill="' + h.ground + '"/>' +
                '<g fill="' + h.accent + '" opacity=".5">' + [60, 150, 250, 330].map(function (x) {
                    return '<path d="M' + x + ' 245 l6 -18 l6 18z"/>';
                }).join('') + '</g>';
        }
        return s;
    }

    /** 卡通动物肖像（400x300 场景，动物居中，可辨识特征优先） */
    function animalSVG(name, opts) {
        opts = opts || {};
        var t = traitsOf(name);
        var pal = PALETTE[hash(name || 'x') % PALETTE.length];
        var panda = /大熊猫|giant panda|panda/i.test(name) && !/小熊猫|red panda/i.test(name);
        var COLOR = {
            orange: { face: '#ee8b3a', shade: '#c25f22', belly: '#fff4e8', eye: '#2b1610' },
            snow: { face: '#eef2f6', shade: '#c3d0dc', belly: '#ffffff', eye: '#2b3a46' },
            brown: { face: '#b58559', shade: '#8f6440', belly: '#f7e9d6', eye: '#241a12' }
        };
        if (t.color && COLOR[t.color]) pal = COLOR[t.color];
        if (t.pattern === 'blackwhite') pal = { face: '#ffffff', shade: '#dfe3e8', belly: '#ffffff', eye: '#20242a' };
        if (panda) pal = { face: '#ffffff', shade: '#2f2f35', belly: '#ffffff', eye: '#20242a' };
        var s = '';
        var shadow = '<ellipse cx="200" cy="256" rx="88" ry="15" fill="#000" opacity=".12"/>';

        /* 蛇：盘绕的身体 + 头 */
        if (t.body === 'snake') {
            s += '<path d="M112 252 Q88 210 150 198 Q214 186 198 146 Q182 108 236 102 Q286 98 288 142" fill="none" stroke="' + pal.face + '" stroke-width="28" stroke-linecap="round"/>' +
                '<path d="M112 252 Q88 210 150 198 Q214 186 198 146 Q182 108 236 102 Q286 98 288 142" fill="none" stroke="' + pal.shade + '" stroke-width="28" stroke-linecap="round" stroke-dasharray="4 30" opacity=".6"/>' +
                '<circle cx="288" cy="140" r="27" fill="' + pal.face + '"/>' +
                '<ellipse cx="280" cy="132" rx="5" ry="6" fill="' + pal.eye + '"/><ellipse cx="300" cy="132" rx="5" ry="6" fill="' + pal.eye + '"/>' +
                '<path d="M284 152 q10 12 20 0" stroke="#e05a5a" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
                '<path d="M306 156 l14 10 M306 156 l14 -2" stroke="#e05a5a" stroke-width="2.5" stroke-linecap="round"/>';
            return shadow + s;
        }
        /* 蛙：大眼睛 + 大嘴巴 */
        if (t.body === 'frog') {
            s += '<ellipse cx="200" cy="208" rx="80" ry="54" fill="' + pal.face + '"/>' +
                '<ellipse cx="200" cy="224" rx="50" ry="32" fill="' + pal.belly + '"/>' +
                '<circle cx="166" cy="142" r="28" fill="' + pal.face + '"/><circle cx="234" cy="142" r="28" fill="' + pal.face + '"/>' +
                '<circle cx="166" cy="140" r="15" fill="#fff"/><circle cx="234" cy="140" r="15" fill="#fff"/>' +
                '<circle cx="168" cy="142" r="9" fill="' + pal.eye + '"/><circle cx="232" cy="142" r="9" fill="' + pal.eye + '"/>' +
                '<circle cx="165" cy="138" r="3" fill="#fff"/><circle cx="229" cy="138" r="3" fill="#fff"/>' +
                '<path d="M168 198 q32 26 64 0" stroke="' + pal.eye + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
                '<ellipse cx="140" cy="248" rx="26" ry="12" fill="' + pal.face + '"/><ellipse cx="260" cy="248" rx="26" ry="12" fill="' + pal.face + '"/>';
            return shadow + s;
        }

        /* 身体（肩部），让画面更像一只动物而不是一个球 */
        s += '<path d="M118 300 Q112 232 200 226 Q288 232 282 300 Z" fill="' + pal.shade + '"/>' +
            '<path d="M150 300 Q146 252 200 248 Q254 252 250 300 Z" fill="' + pal.belly + '" opacity=".85"/>';

        /* 长耳朵（兔）：在头后面 */
        if (t.ear === 'long') {
            s += '<ellipse cx="160" cy="62" rx="21" ry="56" fill="' + pal.face + '" transform="rotate(-12 160 62)"/>' +
                '<ellipse cx="240" cy="62" rx="21" ry="56" fill="' + pal.face + '" transform="rotate(12 240 62)"/>' +
                '<ellipse cx="160" cy="64" rx="10" ry="40" fill="#ffc9d2" transform="rotate(-12 160 64)"/>' +
                '<ellipse cx="240" cy="64" rx="10" ry="40" fill="#ffc9d2" transform="rotate(12 240 64)"/>';
        }
        /* 圆耳朵（熊猫/熊）：从头后面露出；熊猫是整只黑耳朵 */
        if (t.ear === 'round' || panda) {
            s += '<circle cx="136" cy="80" r="30" fill="' + (panda ? '#2f2f35' : pal.shade) + '"/><circle cx="264" cy="80" r="30" fill="' + (panda ? '#2f2f35' : pal.shade) + '"/>' +
                '<circle cx="136" cy="80" r="16" fill="#ffc9d2" opacity="' + (panda ? '.28' : '.75') + '"/>' +
                '<circle cx="264" cy="80" r="16" fill="#ffc9d2" opacity="' + (panda ? '.28' : '.75') + '"/>';
        }

        /* 头 */
        var head = t.ear === 'long'
            ? '<path d="M200 84 C258 84 288 122 288 168 C288 222 250 252 200 252 C150 252 112 222 112 168 C112 122 142 84 200 84Z" fill="' + pal.face + '"/>'
            : '<ellipse cx="200" cy="162" rx="84" ry="78" fill="' + pal.face + '"/>';
        s += head;

        /* 尖耳朵 / 耳簇（在头上面） */
        if (t.ear === 'tuft' && !panda) {
            s += '<path d="M132 108 L110 46 L168 82 Z" fill="' + pal.face + '"/><path d="M268 108 L290 46 L232 82 Z" fill="' + pal.face + '"/>' +
                '<path d="M140 104 L124 62 L162 86 Z" fill="#ffc9d2" opacity=".8"/><path d="M260 104 L276 62 L238 86 Z" fill="#ffc9d2" opacity=".8"/>' +
                '<path d="M110 46 l-10 14 M290 46 l10 14" stroke="' + pal.shade + '" stroke-width="5" stroke-linecap="round"/>';
        } else if (t.ear === 'pointy' && !t.bmask && !panda) {
            s += '<path d="M134 106 L118 52 L176 84 Z" fill="' + pal.face + '"/><path d="M266 106 L282 52 L224 84 Z" fill="' + pal.face + '"/>' +
                '<path d="M142 104 L132 70 L168 90 Z" fill="#ffc9d2" opacity=".75"/><path d="M258 104 L268 70 L232 90 Z" fill="#ffc9d2" opacity=".75"/>';
        }

        /* 角 */
        if (t.horn === 'curved') {
            s += '<path d="M150 96 q-40 -26 -20 -50 q14 24 40 32z" fill="#e9d9ba" stroke="#c9b48c" stroke-width="2"/>' +
                '<path d="M250 96 q40 -26 20 -50 q-14 24 -40 32z" fill="#e9d9ba" stroke="#c9b48c" stroke-width="2"/>';
        } else if (t.horn === 'one') {
            s += '<path d="M200 86 q12 -38 0 -54 q-12 16 0 54z" fill="#efe3cc" stroke="#c9b48c" stroke-width="2"/>';
        }

        /* 花纹 */
        if (t.pattern === 'stripe') {
            s += '<g stroke="' + pal.shade + '" stroke-width="8" stroke-linecap="round" opacity=".9">' +
                '<path d="M200 88 v20"/><path d="M172 92 l-5 20"/><path d="M228 92 l5 20"/>' +
                '<path d="M120 166 l20 5"/><path d="M280 166 l-20 5"/></g>';
        } else if (t.pattern === 'spot') {
            s += '<g fill="' + pal.shade + '" opacity=".55">' +
                [[152, 116], [248, 116], [128, 160], [272, 160], [200, 100], [168, 200], [232, 200]].map(function (p) {
                    return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7.5"/>';
                }).join('') + '</g>';
        } else if (t.pattern === 'blackwhite') {
            // 熊猫式黑眼圈 + 黑耳朵（小熊猫是红褐色白脸，靠鼻子与耳簇区分）
            if (/大熊猫|giant panda|panda/i.test(name) && !/小熊猫|red panda/i.test(name)) {
                s += '<ellipse cx="168" cy="152" rx="26" ry="20" fill="#2f2f35" transform="rotate(-16 168 152)"/>' +
                    '<ellipse cx="232" cy="152" rx="26" ry="20" fill="#2f2f35" transform="rotate(16 232 152)"/>';
            } else if (t.bmask) {
                s += '<ellipse cx="200" cy="168" rx="70" ry="72" fill="#2f2f35"/>' +
                    '<ellipse cx="200" cy="200" rx="44" ry="32" fill="#ffffff"/>' +
                    '<ellipse cx="200" cy="146" rx="26" ry="22" fill="#ffffff" opacity=".95"/>' +
                    '<ellipse cx="136" cy="168" rx="16" ry="26" fill="#e8eef4" opacity=".8"/>' +
                    '<ellipse cx="264" cy="168" rx="16" ry="26" fill="#e8eef4" opacity=".8"/>';
            } else {
                s += '<path d="M116 128 q34 -26 60 -4 q-30 12 -60 4z" fill="#2f2f35" opacity=".85"/>' +
                    '<path d="M284 128 q-34 -26 -60 -4 q30 12 60 4z" fill="#2f2f35" opacity=".85"/>';
            }
        }
        // 小熊猫/浣熊等：脸部浅色"面具" + 白眉斑
        if (/小熊猫|red panda/i.test(name)) {
            s += '<path d="M134 178 q66 46 132 0 q-10 52 -66 52 q-56 0 -66 -52z" fill="#fdf3e3" opacity=".95"/>' +
                '<ellipse cx="168" cy="150" rx="16" ry="11" fill="#fff6ea"/><ellipse cx="232" cy="150" rx="16" ry="11" fill="#fff6ea"/>';
        } else if (/浣熊|raccoon/i.test(name)) {
            s += '<path d="M132 152 q30 -18 62 -6 q-26 26 -62 6z" fill="#2c3238" opacity=".9"/>' +
                '<path d="M268 152 q-30 -18 -62 -6 q26 26 62 6z" fill="#2c3238" opacity=".9"/>' +
                '<path d="M136 186 q64 38 128 0 q-8 48 -64 48 q-56 0 -64 -48z" fill="#f4f6f8"/>';
        }

        /* 眼睛 */
        var eyeY = t.ear === 'long' ? 150 : 154;
        s += '<ellipse cx="170" cy="' + eyeY + '" rx="11" ry="13" fill="' + pal.eye + '"/>' +
            '<ellipse cx="230" cy="' + eyeY + '" rx="11" ry="13" fill="' + pal.eye + '"/>' +
            '<circle cx="166" cy="' + (eyeY - 5) + '" r="3.6" fill="#fff"/><circle cx="226" cy="' + (eyeY - 5) + '" r="3.6" fill="#fff"/>';

        /* 鼻子 / 嘴 */
        if (t.nose === 'beak') {
            s += '<path d="M182 184 l18 20 l18 -20z" fill="#f5a623" stroke="#d98a12" stroke-width="2" stroke-linejoin="round"/>';
        } else if (t.nose === 'flipper') {
            s += '<ellipse cx="200" cy="192" rx="38" ry="24" fill="' + pal.belly + '"/>' +
                '<ellipse cx="186" cy="186" rx="3.5" ry="4" fill="' + pal.eye + '"/><ellipse cx="214" cy="186" rx="3.5" ry="4" fill="' + pal.eye + '"/>' +
                '<path d="M190 198 q10 8 20 0" stroke="' + pal.eye + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
        } else {
            s += '<ellipse cx="200" cy="188" rx="19" ry="14" fill="' + pal.belly + '" opacity=".9"/>' +
                '<path d="M200 192 v7" stroke="' + pal.eye + '" stroke-width="3" stroke-linecap="round"/>' +
                '<path d="M186 203 q14 13 28 0" stroke="' + pal.eye + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<path d="M187 178 q13 -9 26 0 q-13 9 -26 0z" fill="' + pal.eye + '"/>';
            if (t.trunk) {
                s += '<path d="M200 200 q-4 44 16 54 q20 8 20 -12" fill="none" stroke="' + pal.face + '" stroke-width="20" stroke-linecap="round"/>' +
                    '<path d="M200 200 q-4 44 16 54 q20 8 20 -12" fill="none" stroke="' + pal.shade + '" stroke-width="3" stroke-linecap="round" opacity=".35"/>';
            }
        }

        /* 尾巴 */
        if (t.tail === 'bushy') {
            s += '<path d="M266 250 q54 -2 46 -52 q-6 -30 -30 -24 q20 26 -4 40 q-16 10 -24 6z" fill="' + pal.shade + '"/>' +
                '<path d="M276 236 q30 -6 26 -36" fill="none" stroke="' + pal.belly + '" stroke-width="8" stroke-linecap="round" opacity=".8"/>';
        } else if (t.tail === 'ringed') {
            s += '<path d="M262 240 q56 10 52 -44" fill="none" stroke="' + pal.shade + '" stroke-width="20" stroke-linecap="round"/>' +
                '<path d="M262 240 q56 10 52 -44" fill="none" stroke="' + pal.belly + '" stroke-width="20" stroke-dasharray="11 15" stroke-linecap="round" opacity=".95"/>';
        } else if (t.tail === 'flipper') {
            s += '<path d="M112 258 q-52 8 -66 -22 q36 -6 66 8z" fill="' + pal.shade + '" opacity=".95"/>';
        }
        if (t.legs) {
            s += '<g stroke="#f5a623" stroke-width="7" stroke-linecap="round"><path d="M182 254 v12"/><path d="M218 254 v12"/></g>';
        }
        return shadow + s;
    }

    /** 生物卡片：场景 + 动物 + 名称带 */
    function portrait(name, opts) {
        opts = opts || {};
        var t = traitsOf(name);
        var home = opts.home || t.home;
        if (!HABITATS[home]) home = 'forest';
        var w = 400, h = 300;
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="max-width:420px;border-radius:18px;display:block">' +
            '<defs>' + sky(home) + '</defs>' + habitatBackdrop(home) +
            animalSVG(name, opts) +
            (opts.label !== false ? '<g><rect x="14" y="250" rx="14" width="' + Math.min(300, 34 + String(name).length * 20) + '" height="34" fill="#ffffff" opacity=".88"/>' +
                '<text x="32" y="273" font-family="system-ui,Segoe UI,Microsoft YaHei,sans-serif" font-size="18" font-weight="700" fill="#2c3e50">' + escText(name) + '</text></g>' : '') +
            '</svg>';
    }

    function escText(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ---------------- 生态位图谱 ---------------- */
    /**
     * @param {{name:string, role?:string, home?:string,
     *          prey?:string[], predators?:string[], partners?:string[], food?:string[]}} model
     */
    function webSVG(model) {
        model = model || {};
        var center = model.name || '主角';
        var partners = (model.partners || []).slice(0, 3);
        var predators = (model.predators || []).slice(0, 2);
        var prey = (model.prey || []).slice(0, 3);
        var w = 760, h = 460, cx = 380, cy = 230;
        var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="max-width:760px;border-radius:18px;background:#f6fbff;display:block">';
        s += '<defs><marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
            '<path d="M0 0 L10 5 L0 10z" fill="#7f8c9b"/></marker></defs>';

        function node(x, y, label, kind) {
            var color = { center: '#ffd166', prey: '#8bd17c', predator: '#e86a6a', partner: '#6fb3d2', food: '#b8a1e0' }[kind] || '#cbd5e1';
            var sw = 150, sh = 46;
            return '<g><rect x="' + (x - sw / 2) + '" y="' + (y - sh / 2) + '" rx="23" width="' + sw + '" height="' + sh +
                '" fill="' + color + '" stroke="#ffffff" stroke-width="3" filter="url(#sh)"/>' +
                '<text x="' + x + '" y="' + (y + 6) + '" text-anchor="middle" font-family="system-ui,Segoe UI,Microsoft YaHei,sans-serif" font-size="16" font-weight="700" fill="#233">' +
                escText(String(label).slice(0, 10)) + '</text></g>';
        }
        s += '<defs><filter id="sh" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".16"/></filter></defs>';

        // 连线（先画，压在节点下面）
        var lines = '';
        // 猎物 → 主角（箭头指向主角=能量流）
        (model.prey || []).slice(0, 3).forEach(function (p, i) {
            var x = 120 + i * 260, y = 400;
            lines += '<path d="M' + x + ' ' + (y - 24) + ' Q' + ((x + cx) / 2) + ' ' + ((y + cy) / 2 + 30) + ' ' + cx + ' ' + (cy + 26) +
                '" stroke="#7f8c9b" stroke-width="3" fill="none" marker-end="url(#arw)"/>';
        });
        // 主角 → 天敌
        (model.predators || []).slice(0, 2).forEach(function (p, i) {
            var x = i === 0 ? 170 : 590, y = 70;
            lines += '<path d="M' + cx + ' ' + (cy - 26) + ' Q' + ((cx + x) / 2) + ' ' + ((cy + y) / 2 - 20) + ' ' + x + ' ' + (y + 26) +
                '" stroke="#d9534f" stroke-width="3" fill="none" stroke-dasharray="8 6" marker-end="url(#arw)"/>';
        });
        // 主角 ↔ 共生伙伴
        partners.forEach(function (p, i) {
            var x = i === 0 ? 110 : 650, y = i === 0 ? 140 : 320;
            lines += '<path d="M' + (x < cx ? cx - 76 : cx + 76) + ' ' + cy + ' L' + (x < cx ? x + 76 : x - 76) + ' ' + y +
                '" stroke="#3f9bc4" stroke-width="3" fill="none" stroke-dasharray="2 8"/>';
        });
        s += lines;

        s += node(cx, cy, center, 'center');
        (model.prey || []).slice(0, 3).forEach(function (p, i) { s += node(120 + i * 260, 400, p, 'prey'); });
        (model.predators || []).slice(0, 2).forEach(function (p, i) { s += node(i === 0 ? 170 : 590, 70, p, 'predator'); });
        partners.forEach(function (p, i) { s += node(i === 0 ? 110 : 650, i === 0 ? 140 : 320, p, 'partner'); });

        // 图例
        var legend = [['#ffd166', '主角'], ['#8bd17c', '猎物 / 食物'], ['#e86a6a', '天敌'], ['#6fb3d2', '共生伙伴']];
        s += legend.map(function (l, i) {
            return '<circle cx="' + (26 + i * 180) + '" cy="20" r="8" fill="' + l[0] + '"/>' +
                '<text x="' + (40 + i * 180) + '" y="25" font-family="system-ui,Segoe UI,Microsoft YaHei,sans-serif" font-size="13" fill="#445">' + l[1] + '</text>';
        }).join('');
        s += '</svg>';
        return s;
    }

    /* ---------------- 生成 data: 地址 & 保存 ---------------- */
    function toDataURL(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }

    /**
     * 生成一张图并保存到 ai.images（避免大体积 base64 重复占用配额）
     * @param {{kind?:string, svg:string, desc:string, root:string}} opt
     * @returns {string} 图片 key
     */
    function save(opt) {
        var a = XHSH.data.all.ai;
        a.images = a.images || {};
        var key = 'im_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
        a.images[key] = { kind: opt.kind || 'portrait', svg: opt.svg, desc: opt.desc || '', root: opt.root || '', at: new Date().toISOString() };
        // 只保留最近 60 张
        var keys = Object.keys(a.images);
        if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (k) { delete a.images[k]; });
        XHSH.data.save('ai');
        return key;
    }

    function srcOf(key) {
        var im = (XHSH.data.all.ai.images || {})[key];
        return im ? toDataURL(im.svg) : '';
    }

    /** 供 AI 使用的"配图提示词"（说明要什么画面，便于模型给出 traits） */
    function promptHint(name) {
        return '为「' + name + '」画一张' + STYLE_HINT + '的正面肖像，突出它的耳朵/角/花纹/尾巴等辨识特征。';
    }

    XHSH.illustrate = {
        portrait: portrait, web: webSVG, traits: traitsOf, toDataURL: toDataURL,
        save: save, srcOf: srcOf, HABITATS: HABITATS, promptHint: promptHint, STYLE_HINT: STYLE_HINT
    };

})(window.XHSH);
