/* D Town 特調粒子舞台（中英兩頁共用）
 * 酒名／價格／原料一律從頁面上的 .cocktail-text-item 讀取，這裡只放視覺設定（顏色、裝飾物）。
 * three.js 只在舞台第一次進入畫面時才從 CDN 載入，不影響首屏。
 * 無 WebGL 或載入失敗 → .is-fallback（純文字卡＋色塊），選單照常可用。
 */
(function () {
  'use strict';
  var stage = document.getElementById('cocktail-stage');
  if (!stage) return;

  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 依酒單順序（每系列 6 杯）：[酒液上層, 酒液底層, 裝飾物, 裝飾色, 是否有氣泡]
  var LOOKS = [
    // FROM THE VINE → 紅酒杯
    ['#ff6f93', '#c2185b', 'berry', '#ff2d55'],        // Gummy Bear 草莓
    ['#f7f0ff', '#dcc7ec', 'berry', '#ffd6e0'],        // Snow White 荔枝
    ['#ffc233', '#7b1fa2', 'berry', '#8e24aa'],        // Zeal 百香果・莓果
    ['#b8e06a', '#4f8a2b', 'flower', '#ffa000'],       // Green Day 奇異果・萬壽菊
    ['#c8f7d6', '#5fb983', 'leaf', '#3fa34d'],         // Ibuki 哈密瓜・馬告
    ['#b0173b', '#3d0515', 'berry', '#6a2c91', true],  // Memory 葡萄・紅酒・Prosecco
    // FRUIT & FLORA → 淺碟杯
    ['#ff9e94', '#8d5a3b', 'leaf', '#7cb342'],         // Dusk 芭樂・伯爵茶
    ['#e2b07a', '#7b3f00', 'berry', '#6a1b9a'],        // Trinity 葡萄・白蘭地
    ['#ff8a2a', '#e63900', 'citrus', '#ff9800'],       // Orange Valley
    ['#ffb8a1', '#f06292', 'flower', '#fff4d6'],       // Wings On Field 接骨木花
    ['#ff6b7c', '#d81b3c', 'leaf', '#43a047'],         // Wave 西瓜・羅勒
    ['#ffe28a', '#c9a24a', 'sprinkle', '#fff3e0'],     // Tokyo Banana 白可可
    // TEA & ORCHARD → 高球杯
    ['#d8b27c', '#7a4e2d', 'flower', '#f8bbd0'],       // Sunday Morning 伯爵・荔枝
    ['#ebc47a', '#9c6b2f', 'berry', '#ef7a7a'],        // Destination 烏龍・蜜桃
    ['#fff59d', '#ffb74d', 'flower', '#ffffff'],       // Yoasobi 茉莉
    ['#ffd95a', '#f9a825', 'leaf', '#558b2f'],         // Treasure 金萱・鳳梨
    ['#d4e9b2', '#8d9f4a', 'citrus', '#fdd835'],       // Arashiyama 玄米茶・柚子
    ['#f06a1a', '#8b2500', 'citrus', '#fff176'],       // Twilight 紅玉・檸檬
    // SPIRIT FORWARD → 古典杯
    ['#ff8fb4', '#ad1457', 'flower', '#ff4081', true], // French 69 玫瑰・氣泡酒
    ['#f1fa8c', '#b8c230', 'leaf', '#7cb342', true],   // Ciao! 蒔蘿・Prosecco
    ['#ffbd5c', '#a0522d', 'citrus', '#ff9800'],       // Under the Bridge 柳橙
    ['#ffe6ec', '#f3a0bd', 'flower', '#ff80ab'],       // Geisha 白桃・玫瑰
    ['#e08e3a', '#5d2a0c', 'smoke', '#b8afa2'],        // Ember 梅斯卡爾
    ['#ffc94f', '#b5651d', 'sprinkle', '#7a5238']      // Boogie Wonderland 多香果
  ];
  var SERIES_GLASS = ['wine', 'coupe', 'highball', 'rocks'];

  // ---- 從文字酒單收集 24 杯 ----
  var drinks = [];
  var seriesList = [];
  document.querySelectorAll('.cocktail-text-series').forEach(function (sec, si) {
    var h4 = sec.querySelector('h4');
    var sub = h4 && h4.querySelector('span');
    var title = h4 ? (h4.firstChild && h4.firstChild.textContent || h4.textContent).trim() : '';
    seriesList.push({ title: title, sub: sub ? sub.textContent.trim() : '', first: drinks.length });
    sec.querySelectorAll('.cocktail-text-item').forEach(function (item) {
      var h5 = item.querySelector('h5');
      var price = item.querySelector('.cocktail-text-price');
      var desc = item.querySelector('.cocktail-text-description');
      var name = h5 ? (h5.firstChild && h5.firstChild.textContent || h5.textContent).trim() : '';
      drinks.push({
        name: name,
        price: price ? price.textContent.trim() : '',
        desc: desc ? desc.textContent.trim() : '',
        series: si,
        el: item,
        look: LOOKS[drinks.length % LOOKS.length]
      });
    });
  });
  if (!drinks.length) return;

  var el = {
    series: stage.querySelector('.cs-series'),
    name: stage.querySelector('.cs-name'),
    desc: stage.querySelector('.cs-desc'),
    price: stage.querySelector('.cs-price'),
    info: stage.querySelector('.cs-info'),
    canvas: stage.querySelector('canvas'),
    prev: stage.querySelector('.cs-prev'),
    next: stage.querySelector('.cs-next')
  };
  if (!stage.hasAttribute('tabindex')) stage.tabIndex = -1;
  var picker = document.getElementById('cocktail-stage-picker');
  var current = -1;
  var engine = null;      // three.js 就緒後才有

  // ---- 選單（系列＋酒名） ----
  var seriesRow = document.createElement('div');
  seriesRow.className = 'cs-picker-series';
  var drinkRow = document.createElement('div');
  drinkRow.className = 'cs-picker-drinks';
  if (picker) { picker.appendChild(seriesRow); picker.appendChild(drinkRow); }

  seriesList.forEach(function (s, si) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.title;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () { select(s.first); });
    seriesRow.appendChild(b);
  });

  function renderDrinkRow(si) {
    if (drinkRow.dataset.series === String(si)) return;
    drinkRow.dataset.series = String(si);
    drinkRow.innerHTML = '';
    drinks.forEach(function (d, i) {
      if (d.series !== si) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = d.name;
      b.dataset.index = String(i);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { select(i); });
      drinkRow.appendChild(b);
    });
  }

  // 文字酒單每一項都可點 → 捲回舞台並換酒
  drinks.forEach(function (d, i) {
    d.el.classList.add('is-selectable');
    d.el.tabIndex = 0;
    d.el.setAttribute('role', 'button');
    d.el.setAttribute('aria-pressed', 'false');
    d.el.setAttribute('aria-controls', 'cocktail-stage');
    function activate(fromKey) {
      select(i);
      stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      if (fromKey) stage.focus({ preventScroll: true }); // 鍵盤使用者跟著焦點到舞台
    }
    d.el.addEventListener('click', function () { activate(false); });
    d.el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(true); }
    });
  });

  if (el.prev) el.prev.addEventListener('click', function () { select((current - 1 + drinks.length) % drinks.length); });
  if (el.next) el.next.addEventListener('click', function () { select((current + 1) % drinks.length); });

  function select(i) {
    if (i === current) return;
    current = i;
    var d = drinks[i];
    var s = seriesList[d.series];
    stage.style.setProperty('--cs-top', d.look[0]);
    stage.style.setProperty('--cs-bottom', d.look[1]);
    el.info.classList.remove('is-in');
    void el.info.offsetWidth; // 重啟淡入動畫
    el.series.textContent = s.title + (s.sub ? ' · ' + s.sub : '');
    el.name.textContent = d.name;
    el.desc.textContent = d.desc;
    el.price.textContent = d.price;
    el.info.classList.add('is-in');

    seriesRow.querySelectorAll('button').forEach(function (b, si) {
      b.setAttribute('aria-pressed', si === d.series ? 'true' : 'false');
    });
    renderDrinkRow(d.series);
    drinkRow.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.index === String(i) ? 'true' : 'false');
    });
    drinks.forEach(function (x, k) {
      x.el.classList.toggle('is-active', k === i);
      x.el.setAttribute('aria-pressed', k === i ? 'true' : 'false');
    });

    if (engine) engine.morph(d);
  }

  select(0);

  // ---- 進入畫面才載 three.js ----
  function fallback() {
    stage.classList.add('is-fallback');
    stage.classList.remove('is-loading');
  }
  if (!('IntersectionObserver' in window) || !el.canvas) { fallback(); return; }

  var started = false;
  var visible = false;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      visible = e.isIntersecting;
      if (visible && !started) {
        started = true;
        stage.classList.add('is-loading');
        import(THREE_URL).then(function (THREE) {
          engine = createEngine(THREE);
          stage.classList.remove('is-loading');
          stage.classList.add('is-live');
          engine.morph(drinks[current], true);
        }).catch(function () { fallback(); });
      }
      if (engine) engine.setRunning(visible);
    });
  }, { rootMargin: '200px 0px' });
  io.observe(stage);

  // =====================================================================
  function createEngine(THREE) {
    var canvas = el.canvas;
    // 沒有 WebGL 時這裡會 throw → 外層 .catch 走 fallback
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    var small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
    var N = small ? 9000 : 18000;
    var NG = Math.floor(N * 0.30), NL = Math.floor(N * 0.42), NGa = Math.floor(N * 0.13);
    var NDust = N - NG - NL - NGa;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.5, 9.8); // 略俯視，看得到杯口與液面
    var group = new THREE.Group();
    group.position.y = -0.2;
    scene.add(group);

    var start = new Float32Array(N * 3), target = new Float32Array(N * 3);
    var c0 = new Float32Array(N * 3), c1 = new Float32Array(N * 3);
    var rand = new Float32Array(N * 4), kind = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      rand[i * 4] = Math.random(); rand[i * 4 + 1] = Math.random();
      rand[i * 4 + 2] = Math.random(); rand[i * 4 + 3] = Math.random();
      kind[i] = i < NG ? 0 : i < NG + NL ? 1 : i < NG + NL + NGa ? 2 : 3;
      // 初始：散在遠處的星塵
      var p = randSphere(4 + Math.random() * 3);
      start[i * 3] = target[i * 3] = p[0];
      start[i * 3 + 1] = target[i * 3 + 1] = p[1];
      start[i * 3 + 2] = target[i * 3 + 2] = p[2];
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(target, 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
    geo.setAttribute('aC0', new THREE.BufferAttribute(c0, 3));
    geo.setAttribute('aC1', new THREE.BufferAttribute(c1, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

    var uniforms = {
      uP: { value: 1 }, uTime: { value: 0 }, uScatter: { value: 1.7 },
      uSize: { value: small ? 34 : 32 }, uPix: { value: dpr },
      uFizz: { value: 0 }, uLiqLo: { value: 0 }, uLiqHi: { value: 1 }, uFizzR: { value: 0.5 },
      uMouse: { value: new THREE.Vector3(99, 99, 0) }, uMouseOn: { value: 0 },
      uMotion: { value: reduceMotion ? 0 : 1 }
    };

    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute vec3 aStart; attribute vec3 aTarget; attribute vec3 aC0; attribute vec3 aC1;',
        'attribute vec4 aRand; attribute float aKind;',
        'uniform float uP, uTime, uScatter, uSize, uPix, uFizz, uLiqLo, uLiqHi, uFizzR, uMouseOn, uMotion;',
        'uniform vec3 uMouse;',
        'varying vec3 vC; varying float vA;',
        'float ease(float t){ return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0; }',
        'void main(){',
        '  float p = clamp((uP - aRand.w * 0.35) / 0.65, 0.0, 1.0);',
        '  float e = ease(p);',
        '  vec3 dir = normalize(aRand.xyz * 2.0 - 1.0 + 1e-4);',
        '  vec3 pos = mix(aStart, aTarget, e) + dir * sin(3.14159 * p) * uScatter * (0.6 + aRand.w);',
        '  float drift = aKind > 2.5 ? 0.12 : 0.012;',
        '  pos += uMotion * drift * vec3(sin(uTime*1.3 + aRand.x*40.0), cos(uTime*1.1 + aRand.y*40.0), sin(uTime*0.9 + aRand.z*40.0));',
        '  if (aKind > 0.5 && aKind < 1.5 && uFizz > 0.5 && aRand.x < 0.16 && e > 0.99) {',
        '    float h = uLiqHi - uLiqLo;',
        '    pos.y = uLiqLo + mod(aTarget.y - uLiqLo + uMotion * uTime * (0.25 + aRand.y * 0.4), h);',
        '    pos.xz = aTarget.xz / max(length(aTarget.xz), 1e-3) * uFizzR * aRand.z;',
        '  }',
        '  vec4 wp = modelMatrix * vec4(pos, 1.0);',
        '  vec2 dm = wp.xy - uMouse.xy;',
        '  float f = uMouseOn * smoothstep(1.15, 0.0, length(dm));',
        '  wp.xy += normalize(dm + 1e-4) * f * 0.6;',
        '  wp.z += f * 0.35;',
        '  vec4 mv = viewMatrix * wp;',
        '  gl_Position = projectionMatrix * mv;',
        '  float tw = 0.78 + 0.22 * sin(uTime * 2.2 * uMotion + aRand.y * 60.0);',
        '  float big = aKind > 1.5 && aKind < 2.5 ? 1.25 : (aKind > 2.5 ? 0.8 : 1.0);',
        '  gl_PointSize = uSize * uPix * (0.55 + aRand.z * 0.9) * big / -mv.z;',
        '  vC = mix(aC0, aC1, e) * tw * (1.0 + f * 0.9);',
        '  vA = aKind < 0.5 ? 0.42 : (aKind < 1.5 ? 0.62 : (aKind < 2.5 ? 0.9 : 0.5));',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vC; varying float vA;',
        'void main(){',
        '  float d = length(gl_PointCoord - 0.5);',
        '  float a = smoothstep(0.5, 0.0, d);',
        '  if (a < 0.02) discard;',
        '  gl_FragColor = vec4(vC, a * a * vA);',
        '}'
      ].join('\n')
    });
    group.add(new THREE.Points(geo, mat));

    // ---- 取樣工具 ----
    function randSphere(r) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      return [r * s * Math.cos(th), r * u * 0.7, r * s * Math.sin(th)];
    }
    function hex(h) { var c = new THREE.Color(h); return [c.r, c.g, c.b]; }
    function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function hsl(h, s, l) { var c = new THREE.Color().setHSL(h, s, l); return [c.r, c.g, c.b]; }

    // 旋轉體輪廓：fn(t) → [y, r]；依周長×半徑取樣讓密度均勻
    function profile(fn) {
      var n = 160, cdf = [], acc = 0, prev = fn(0);
      for (var k = 1; k <= n; k++) {
        var c = fn(k / n);
        acc += ((c[1] + prev[1]) / 2 + 0.02) * Math.hypot(c[0] - prev[0], c[1] - prev[1]) + 1e-6;
        cdf.push(acc); prev = c;
      }
      return {
        total: acc,
        sample: function () {
          var x = Math.random() * acc, lo = 0, hi = n - 1;
          while (lo < hi) { var m = (lo + hi) >> 1; if (cdf[m] < x) lo = m + 1; else hi = m; }
          return fn((lo + Math.random()) / n);
        }
      };
    }

    var GLASSES = {
      wine: (function () {
        var bowlR = function (t) { return 0.95 * Math.sin(Math.PI * (0.08 + 0.62 * t)); };
        return {
          parts: [
            profile(function (t) { return [-1.55, 0.72 * t]; }),
            profile(function (t) { return [-1.55 + 1.2 * t, 0.06]; }),
            profile(function (t) { return [-0.35, bowlR(0) * t]; }),
            profile(function (t) { return [-0.35 + 1.95 * t, bowlR(t)]; })
          ],
          liqLo: -0.33, liqHi: 0.62,
          rAt: function (y) { return bowlR((y + 0.35) / 1.95); },
          rimY: 1.6, rimR: bowlR(1)
        };
      })(),
      coupe: (function () {
        var bowlR = function (t) { return 0.08 + 1.12 * Math.sin(t * Math.PI / 2); };
        return {
          parts: [
            profile(function (t) { return [-1.55, 0.7 * t]; }),
            profile(function (t) { return [-1.55 + 1.75 * t, 0.055]; }),
            profile(function (t) { return [0.2 + 0.85 * t, bowlR(t)]; })
          ],
          liqLo: 0.22, liqHi: 0.2 + 0.85 * 0.8,
          rAt: function (y) { return bowlR((y - 0.2) / 0.85); },
          rimY: 1.05, rimR: bowlR(1)
        };
      })(),
      highball: {
        parts: [
          profile(function (t) { return [-1.6, 0.66 * t]; }),
          profile(function (t) { return [-1.45, 0.66 * t]; }),
          profile(function (t) { return [-1.6 + 3.1 * t, 0.66]; })
        ],
        liqLo: -1.43, liqHi: 0.95,
        rAt: function () { return 0.63; },
        rimY: 1.5, rimR: 0.66,
        ice: [[0.05, 0.55, 0.05, 0.44, 0.4], [-0.1, -0.05, -0.05, 0.44, 1.1], [0.08, -0.65, 0.05, 0.44, 2.0]]
      },
      rocks: {
        parts: [
          profile(function (t) { return [-1.2, 0.98 * t]; }),
          profile(function (t) { return [-1.0, 0.98 * t]; }),
          profile(function (t) { return [-1.2 + 1.95 * t, 0.98]; })
        ],
        liqLo: -0.98, liqHi: 0.2,
        rAt: function () { return 0.95; },
        rimY: 0.75, rimR: 0.98,
        ice: [[0, -0.3, 0, 0.95, 0.6]]
      }
    };

    function cubePoint(cx, cy, cz, s, rot) {
      var face = Math.floor(Math.random() * 6), a = Math.random() - 0.5, b = Math.random() - 0.5, h = 0.5;
      var p = face === 0 ? [h, a, b] : face === 1 ? [-h, a, b] : face === 2 ? [a, h, b] : face === 3 ? [a, -h, b] : face === 4 ? [a, b, h] : [a, b, -h];
      var x = p[0] * s, y = p[1] * s, z = p[2] * s, cr = Math.cos(rot), sr = Math.sin(rot);
      var cr2 = Math.cos(rot * 0.7), sr2 = Math.sin(rot * 0.7);
      var x2 = x * cr - z * sr, z2 = x * sr + z * cr;
      var y2 = y * cr2 - z2 * sr2, z3 = y * sr2 + z2 * cr2;
      return [cx + x2, cy + y2, cz + z3];
    }

    function build(d) {
      var g = GLASSES[SERIES_GLASS[d.series] || 'wine'];
      var look = d.look;
      // 底色往上層拉 25%，避免深色酒液在疊加混色下看不見
      var cTop = hex(look[0]), cBot = mixc(hex(look[1]), hex(look[0]), 0.25), cGar = hex(look[3]);
      var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      var i = 0;
      function put(p, c) { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; i++; }

      // 1) 杯身：彩虹玻璃光澤＋冰塊
      var totals = g.parts.map(function (p) { return p.total; });
      var sum = totals.reduce(function (a, b) { return a + b; }, 0);
      var iceN = g.ice ? Math.floor(NG * 0.28) : 0;
      for (var k = 0; k < NG - iceN; k++) {
        var x = Math.random() * sum, pi = 0;
        while (x > totals[pi] && pi < totals.length - 1) { x -= totals[pi]; pi++; }
        var yr = g.parts[pi].sample();
        var th = Math.random() * Math.PI * 2, r = yr[1] + (Math.random() - 0.5) * 0.03;
        var hue = (th / (Math.PI * 2) + yr[0] * 0.12 + Math.random() * 0.08) % 1;
        var c = hsl(hue, 0.55, 0.62);
        put([r * Math.cos(th), yr[0], r * Math.sin(th)], mixc(c, [0.85, 0.9, 1], 0.45));
      }
      for (k = 0; k < iceN; k++) {
        var cube = g.ice[k % g.ice.length];
        put(cubePoint(cube[0], cube[1], cube[2], cube[3], cube[4]), mixc([0.75, 0.92, 1], cTop, 0.25));
      }

      // 2) 酒液：體積＋液面，底→上漸層
      var rMax = 0;
      for (var yy = g.liqLo; yy <= g.liqHi; yy += 0.05) rMax = Math.max(rMax, g.rAt(yy));
      var span = g.liqHi - g.liqLo;
      for (k = 0; k < NL; k++) {
        var y, rr;
        if (Math.random() < 0.28) {
          y = g.liqHi + (Math.random() - 0.5) * 0.02;
          rr = g.rAt(g.liqHi) * 0.97 * Math.sqrt(Math.random());
        } else {
          do { y = g.liqLo + Math.random() * span; } while (Math.pow(g.rAt(y) / rMax, 2) < Math.random());
          rr = g.rAt(y) * 0.95 * Math.sqrt(Math.random());
        }
        var t = (y - g.liqLo) / span, a2 = Math.random() * Math.PI * 2;
        var lc = mixc(cBot, cTop, Math.min(1, Math.max(0, t + (Math.random() - 0.5) * 0.15)));
        if (y >= g.liqHi - 0.02) lc = mixc(lc, [1, 1, 1], 0.12);
        put([rr * Math.cos(a2), y, rr * Math.sin(a2)], lc);
      }

      // 3) 裝飾物
      var topY = g.liqHi, topR = g.rAt(g.liqHi);
      var type = look[2];
      for (k = 0; k < NGa; k++) put(garnish(type, g, topY, topR, cGar, k), garnishColor(type, cGar, cTop, k));

      // 4) 星塵
      var gold = hex('#c8a96e');
      for (k = 0; k < NDust; k++) {
        var sp = randSphere(2.6 + Math.random() * 3.2);
        put(sp, mixc(gold, cTop, Math.random() * 0.5).map(function (v) { return v * 0.55; }));
      }
      return { pos: pos, col: col, g: g, fizz: !!look[4] };
    }

    var lastGarnish = null;
    function garnish(type, g, topY, topR, cGar, k) {
      var R = Math.random, p;
      if (type === 'citrus') {
        // 杯緣的柑橘片（直立，面向鏡頭）
        var rad = 0.46, cx = g.rimR * 0.95, cy = g.rimY + 0.12, rr = rad * Math.sqrt(R()), an = R() * Math.PI * 2;
        lastGarnish = { r: rr / rad, an: an };
        return [cx + rr * Math.cos(an), cy + rr * Math.sin(an), 0.02 * (R() - 0.5) + 0.3];
      }
      if (type === 'berry') {
        // 竹籤串 3 顆莓果斜靠杯口
        var a0 = [-0.35, g.rimY - 0.35, 0.25], a1 = [0.6, g.rimY + 0.75, 0.25];
        if (k % 9 === 0) { var tt = R(); lastGarnish = { pick: true }; return [a0[0] + (a1[0] - a0[0]) * tt, a0[1] + (a1[1] - a0[1]) * tt, a0[2]]; }
        var which = k % 3, tb = 0.45 + which * 0.17, br = 0.16;
        var cc = [a0[0] + (a1[0] - a0[0]) * tb, a0[1] + (a1[1] - a0[1]) * tb, a0[2]];
        p = randSphere(1); var len = Math.hypot(p[0], p[1] / 0.7, p[2]) || 1;
        lastGarnish = { pick: false, shade: p[1] };
        return [cc[0] + p[0] / len * br, cc[1] + p[1] / 0.7 / len * br, cc[2] + p[2] / len * br];
      }
      if (type === 'leaf') {
        // 兩片葉子斜靠杯緣
        var which2 = k % 2, u = R() * 2 - 1, L = 0.95, w = 0.15 * Math.pow(1 - u * u, 0.8) * (R() * 2 - 1);
        var ang = which2 ? 0.9 : 1.45, cx2 = g.rimR * (which2 ? 0.55 : 0.8), cy2 = g.rimY + (which2 ? 0.3 : 0.2);
        var dx = Math.cos(ang), dy = Math.sin(ang);
        lastGarnish = { rib: Math.abs(w) < 0.02 };
        return [cx2 + dx * u * L / 2 - dy * w, cy2 + dy * u * L / 2 + dx * w, 0.25 + which2 * 0.15 + u * 0.08];
      }
      if (type === 'flower') {
        // 浮在液面、朝鏡頭微傾的五瓣花
        var th = R() * Math.PI * 2, petal = Math.abs(Math.cos(2.5 * th)), fr = 0.5 * petal * Math.sqrt(R());
        var fx = fr * Math.cos(th), fz = fr * Math.sin(th), tilt = 0.55;
        lastGarnish = { center: fr < 0.07 };
        var fy = g.rimY > 1.2 ? topY + 0.05 : Math.max(topY + 0.05, g.rimY - 0.05);
        return [fx, fy + fz * Math.sin(tilt) + 0.02, fz * Math.cos(tilt) + 0.1];
      }
      if (type === 'smoke') {
        // 從杯口升起的煙
        var h = R() * 2.1, sw = 0.12 + h * 0.28, sa = R() * Math.PI * 2, sr = sw * Math.sqrt(R());
        lastGarnish = { h: h };
        return [Math.sin(h * 2.3) * 0.22 * h + sr * Math.cos(sa), g.rimY + 0.05 + h, sr * Math.sin(sa) * 0.6];
      }
      // sprinkle：液面上的粉末
      var sa2 = R() * Math.PI * 2, sr2 = topR * 0.9 * Math.sqrt(R());
      lastGarnish = null;
      return [sr2 * Math.cos(sa2), topY + 0.02 + Math.pow(R(), 3) * 0.25, sr2 * Math.sin(sa2)];
    }
    function garnishColor(type, cGar, cTop, k) {
      var lg = lastGarnish;
      if (type === 'citrus') {
        var seg = (lg.an / (Math.PI * 2) * 10) % 1;
        if (lg.r > 0.9) return mixc(cGar, [0.4, 0.2, 0], 0.25);
        if (lg.r > 0.84) return [1, 0.97, 0.88];                  // 白色內皮
        if (seg < 0.1 || lg.r < 0.1) return cGar.map(function (v) { return v * 0.3; }); // 瓣間隙
        return cGar;
      }
      if (type === 'berry') return lg.pick ? hex('#caa472') : mixc(cGar, [1, 1, 1], lg.shade > 0.25 ? 0.3 : 0);
      if (type === 'leaf') return lg.rib ? mixc(cGar, [1, 1, 0.8], 0.5) : cGar;
      if (type === 'flower') return lg.center ? hex('#ffd54f') : cGar;
      if (type === 'smoke') return cGar.map(function (v) { return v * (0.9 - lg.h * 0.3); });
      return cGar;
    }

    // ---- 變形 ----
    var T0 = 0, morphing = false, P = 1;
    var DUR = reduceMotion ? 0.001 : 1.9;
    function easeJS(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function morph(d, instantFromDust) {
      var b = build(d);
      // 把「現在畫面上的位置」凍結成新起點（與 vertex shader 同公式，含漂浮與氣泡），連點也不會跳
      var mo = uniforms.uMotion.value, tm = uniforms.uTime.value, U = uniforms;
      var fizzOn = U.uFizz.value > 0.5, lo = U.uLiqLo.value, hgt = U.uLiqHi.value - U.uLiqLo.value, fr = U.uFizzR.value;
      for (var i2 = 0; i2 < N; i2++) {
        var rx = rand[i2 * 4], ry = rand[i2 * 4 + 1], rz = rand[i2 * 4 + 2], w = rand[i2 * 4 + 3];
        var p = Math.min(1, Math.max(0, (P - w * 0.35) / 0.65)), e = easeJS(p);
        var sc = Math.sin(Math.PI * p) * U.uScatter.value * (0.6 + w);
        var dx = rx * 2 - 1 + 1e-4, dy = ry * 2 - 1 + 1e-4, dz = rz * 2 - 1 + 1e-4;
        var dl = Math.hypot(dx, dy, dz) || 1;
        var j = i2 * 3;
        var cur = [0, 1, 2].map(function (a) { return start[j + a] + (target[j + a] - start[j + a]) * e; });
        cur[0] += dx / dl * sc; cur[1] += dy / dl * sc; cur[2] += dz / dl * sc;
        var drift = kind[i2] > 2.5 ? 0.12 : 0.012;
        cur[0] += mo * drift * Math.sin(tm * 1.3 + rx * 40);
        cur[1] += mo * drift * Math.cos(tm * 1.1 + ry * 40);
        cur[2] += mo * drift * Math.sin(tm * 0.9 + rz * 40);
        if (kind[i2] === 1 && fizzOn && rx < 0.16 && e > 0.99) {
          var yy = target[j + 1] - lo + mo * tm * (0.25 + ry * 0.4);
          cur[1] = lo + (yy - hgt * Math.floor(yy / hgt));
          var txz = Math.max(Math.hypot(target[j], target[j + 2]), 1e-3);
          cur[0] = target[j] / txz * fr * rz; cur[2] = target[j + 2] / txz * fr * rz;
        }
        for (var a = 0; a < 3; a++) {
          start[j + a] = cur[a];
          c0[j + a] = c0[j + a] + (c1[j + a] - c0[j + a]) * e;
          target[j + a] = b.pos[j + a];
          c1[j + a] = b.col[j + a];
        }
      }
      if (instantFromDust) { c0.set(b.col.map(function (v) { return v * 0.3; })); }
      ['aStart', 'aTarget', 'aC0', 'aC1'].forEach(function (n) { geo.attributes[n].needsUpdate = true; });
      uniforms.uFizz.value = b.fizz ? 1 : 0;
      uniforms.uLiqLo.value = b.g.liqLo + 0.05;
      uniforms.uLiqHi.value = b.g.liqHi - 0.03;
      uniforms.uFizzR.value = b.g.rAt(b.g.liqLo + 0.1) * 0.8;
      P = 0; uniforms.uP.value = 0; T0 = performance.now(); morphing = true;
      kick();
    }

    // ---- 指標互動 ----
    var ndc = new THREE.Vector3(), mouseTarget = 0, tilt = { x: 0, y: 0 };
    function onMove(e) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width * 2 - 1, y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ndc.set(x, y, 0.5).unproject(camera);
      ndc.sub(camera.position).normalize();
      var t = -camera.position.z / ndc.z;
      uniforms.uMouse.value.copy(camera.position).addScaledVector(ndc, t);
      tilt.x = y; tilt.y = x;
      mouseTarget = 1;
      kick();
    }
    // 手機回收 GPU 記憶體時 context 會遺失 → 停迴圈、改顯示文字卡
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      setRunning(false);
      engine = null;
      stage.classList.remove('is-live');
      fallback();
    });
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onMove);
    canvas.addEventListener('pointerleave', function () { mouseTarget = 0; });
    canvas.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') mouseTarget = 0; });

    // ---- 尺寸 ----
    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // 窄螢幕把鏡頭拉遠，杯子才不會被切
      var narrow = w / h < 0.9;
      camera.position.z = narrow ? 11 : 9.8;
      camera.lookAt(0, 0.2, 0);
      // 桌機杯子偏右讓出左下文字區；手機杯子上移讓出底部文字區
      group.position.set(narrow ? 0 : 1.15, narrow ? 1.0 : -0.2, 0);
      camera.updateProjectionMatrix();
      kick();
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    else window.addEventListener('resize', resize);
    resize();

    // ---- 迴圈（不在畫面上就停） ----
    var running = false, raf = 0, clock = performance.now(), elapsed = 0;
    function frame(now) {
      raf = 0;
      var dt = Math.min(0.05, (now - clock) / 1000); clock = now;
      elapsed += dt;
      if (morphing) {
        P = Math.min(1, (now - T0) / 1000 / DUR);
        uniforms.uP.value = P;
        if (P >= 1) morphing = false;
      }
      uniforms.uTime.value = elapsed;
      uniforms.uMouseOn.value += (mouseTarget - uniforms.uMouseOn.value) * 0.08;
      if (!reduceMotion) group.rotation.y += dt * 0.22;
      group.rotation.x += (tilt.x * -0.12 * uniforms.uMouseOn.value - group.rotation.x) * 0.05;
      renderer.render(scene, camera);
      if (running && (!reduceMotion || morphing || Math.abs(uniforms.uMouseOn.value - mouseTarget) > 0.01)) raf = requestAnimationFrame(frame);
    }
    function kick() { if (running && !raf) { clock = performance.now(); raf = requestAnimationFrame(frame); } }
    function setRunning(on) {
      running = on && !document.hidden;
      if (running) kick();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    document.addEventListener('visibilitychange', function () { setRunning(visible); });
    setRunning(visible);

    return { morph: morph, setRunning: setRunning };
  }
})();
