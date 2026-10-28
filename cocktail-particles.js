/* D Town 特調舞台（中英兩頁共用）
 * 平常顯示該杯的深色酒杯照（webp/cocktail-photo-*.webp，AI 生成示意照）；換杯時照片化成粒子、散開後聚成下一杯，聚好換回清晰照片。
 * 粒子取樣自 webp/cocktail-photo-atlas.webp（24 張照片的去背杯子拼成）。PHOTOS 記下每杯在圖集與照片裡的位置，
 * 所以粒子聚成的杯子跟照片裡的杯子疊得上。酒名／價格／原料讀自頁面上的 .cocktail-text-item。
 * three.js 與圖集只在舞台第一次進入畫面、且裝置適合跑粒子時才載入。
 * 減少動態／低階裝置／無 WebGL／載入失敗／context lost → 直接淡出淡入換照片，選單照常可用。
 */
(function () {
  'use strict';
  var stage = document.getElementById('cocktail-stage');
  if (!stage) return;

  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';
  var scriptSrc = (document.currentScript && document.currentScript.src) || location.href;
  function asset(p) { return new URL(p, scriptSrc).href; }
  var ATLAS_URL = asset('webp/cocktail-photo-atlas.webp?v=1'); // 換圖集記得改 v
  var IMG_W = 900, IMG_H = 1125;        // 照片尺寸（4:5）
  var POS_X = 0.5, POS_Y = 0.55;        // 與 CSS .cs-photo 的 object-position 一致，粒子才疊得上照片
  // 每杯 [照片, 圖集位置 [x, y, w, h], 杯子在照片裡的位置 [x, y, w, h]（0–1）]；順序＝酒單順序
  var PHOTOS = [
    ['webp/cocktail-photo-gummy-bear.webp', [53, 0, 73, 250], [0.3967, 0.2604, 0.2056, 0.56]],
    ['webp/cocktail-photo-snow-white.webp', [188, 0, 163, 250], [0.2722, 0.2596, 0.4556, 0.56]],
    ['webp/cocktail-photo-zeal.webp', [389, 0, 121, 250], [0.33, 0.2604, 0.3389, 0.5591]],
    ['webp/cocktail-photo-green-day.webp', [572, 0, 116, 250], [0.3378, 0.2604, 0.3244, 0.5591]],
    ['webp/cocktail-photo-ibuki.webp', [720, 17, 180, 233], [0.2311, 0.2604, 0.5389, 0.5591]],
    ['webp/cocktail-photo-memory.webp', [915, 0, 150, 250], [0.29, 0.2596, 0.4189, 0.56]],
    ['webp/cocktail-photo-dusk.webp', [20, 250, 140, 250], [0.3033, 0.2596, 0.3933, 0.5609]],
    ['webp/cocktail-photo-trinity.webp', [180, 294, 180, 206], [0.1944, 0.2604, 0.6111, 0.56]],
    ['webp/cocktail-photo-orange-valley.webp', [396, 250, 108, 250], [0.3478, 0.2596, 0.3033, 0.5609]],
    ['webp/cocktail-photo-wings-on-field.webp', [540, 288, 180, 212], [0.2033, 0.2596, 0.5933, 0.56]],
    ['webp/cocktail-photo-wave.webp', [720, 258, 180, 242], [0.24, 0.2596, 0.52, 0.56]],
    ['webp/cocktail-photo-tokyo-banana.webp', [902, 250, 176, 250], [0.2533, 0.2596, 0.4933, 0.5609]],
    ['webp/cocktail-photo-sunday-morning.webp', [6, 500, 168, 250], [0.2644, 0.2604, 0.4711, 0.56]],
    ['webp/cocktail-photo-destination.webp', [180, 577, 180, 173], [0.1367, 0.2604, 0.7278, 0.5591]],
    ['webp/cocktail-photo-yoasobi.webp', [360, 563, 180, 187], [0.1778, 0.2596, 0.6733, 0.56]],
    ['webp/cocktail-photo-treasure.webp', [566, 500, 128, 250], [0.3211, 0.2604, 0.3578, 0.5591]],
    ['webp/cocktail-photo-arashiyama.webp', [727, 500, 166, 250], [0.2678, 0.2596, 0.4644, 0.5609]],
    ['webp/cocktail-photo-twilight.webp', [900, 549, 180, 201], [0.1856, 0.2604, 0.6278, 0.56]],
    ['webp/cocktail-photo-french-69.webp', [51, 750, 78, 250], [0.3911, 0.2604, 0.2178, 0.56]],
    ['webp/cocktail-photo-ciao.webp', [180, 806, 180, 194], [0.1744, 0.2604, 0.6511, 0.56]],
    ['webp/cocktail-photo-under-the-bridge.webp', [360, 799, 180, 201], [0.1856, 0.2596, 0.6289, 0.5609]],
    ['webp/cocktail-photo-geisha.webp', [591, 750, 78, 250], [0.39, 0.2604, 0.2189, 0.56]],
    ['webp/cocktail-photo-ember.webp', [725, 750, 170, 250], [0.2622, 0.2604, 0.4756, 0.5591]],
    ['webp/cocktail-photo-boogie-wonderland.webp', [929, 750, 122, 250], [0.3289, 0.2596, 0.3411, 0.56]]
  ];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
  var useFx = !reduceMotion && !lowEnd;

  // 小圖路徑：webp/x.webp → webp/responsive/x-480.webp（與 index.html 的 smallSrc 同規則）
  function smallSrc(src) {
    var parts = src.split('/');
    var file = parts.pop().replace(/(\.webp)$/, '-480$1');
    return parts.concat('responsive', file).join('/');
  }

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
      var photo = PHOTOS[drinks.length % PHOTOS.length];
      drinks.push({
        index: drinks.length,
        name: name,
        price: price ? price.textContent.trim() : '',
        desc: desc ? desc.textContent.trim() : '',
        series: si,
        el: item,
        photo: photo
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
    photo: stage.querySelector('.cs-photo'),
    canvas: stage.querySelector('canvas'),
    prev: stage.querySelector('.cs-prev'),
    next: stage.querySelector('.cs-next')
  };
  if (!stage.hasAttribute('tabindex')) stage.tabIndex = -1;
  // 照片 alt＝酒名＋頁面上寫好的後綴（中文「 示意圖」／英文「 (illustrative photo)」）
  var altSuffix = el.photo ? el.photo.alt.slice(drinks[0].name.length) : '';
  var current = -1;
  var shown = 0;          // 照片目前顯示的是哪一杯（HTML 預設第一杯）
  var engine = null;      // three.js＋圖集就緒後才有

  // ---- 「看原版酒單圖」：打開目前這杯所屬系列的酒單海報（海報清單寫在按鈕的 data-posters） ----
  var posterBtn = document.getElementById('cs-poster-link');
  if (posterBtn && typeof window.openLightbox === 'function') {
    var posters = [];
    try { posters = JSON.parse(posterBtn.getAttribute('data-posters') || '[]'); } catch (e) {}
    posterBtn.addEventListener('click', function () {
      var p = posters[drinks[current].series] || posters[0];
      if (p) window.openLightbox(p[0], p[1]);
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
      revealStage();
      if (fromKey) stage.focus({ preventScroll: true }); // 鍵盤使用者跟著焦點到舞台
    }
    d.el.addEventListener('click', function () { activate(false); });
    d.el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(true); }
    });
  });

  // 捲到舞台：扣掉固定導覽列；舞台比可視區高（小手機）就頂齊導覽列下緣，否則在剩餘空間置中
  function revealStage() {
    var nav = document.querySelector('nav');
    var navBottom = nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().bottom : 0;
    var r = stage.getBoundingClientRect(), avail = window.innerHeight - navBottom;
    var want = r.height >= avail ? navBottom + 4 : navBottom + (avail - r.height) / 2;
    window.scrollBy({ top: r.top - want, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  if (el.prev) el.prev.addEventListener('click', function () { select((current - 1 + drinks.length) % drinks.length); });
  if (el.next) el.next.addEventListener('click', function () { select((current + 1) % drinks.length); });

  function select(i) {
    if (i === current) return;
    var first = current < 0;
    current = i;
    var d = drinks[i];
    var s = seriesList[d.series];
    el.info.classList.remove('is-in');
    void el.info.offsetWidth; // 重啟淡入動畫
    el.series.textContent = s.title + (s.sub ? ' · ' + s.sub : '');
    el.name.textContent = d.name;
    el.desc.textContent = d.desc;
    el.price.textContent = d.price;
    el.info.classList.add('is-in');

    drinks.forEach(function (x, k) {
      x.el.classList.toggle('is-active', k === i);
      x.el.setAttribute('aria-pressed', k === i ? 'true' : 'false');
    });

    if (!first && el.photo) swapTo(d);
  }

  // ---- 照片 ----
  function srcsetOf(d) {
    return asset(smallSrc(d.photo[0])) + ' 480w, ' + asset(d.photo[0]) + ' ' + IMG_W + 'w';
  }
  var loading = {};
  function loadPhoto(d) {
    if (!loading[d.index]) loading[d.index] = new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = function () { resolve(); };
      img.sizes = el.photo.sizes;   // 跟頁面上的 <img> 選到同一張，換圖時直接吃快取
      img.srcset = srcsetOf(d);
      img.src = asset(d.photo[0]);
    });
    return loading[d.index];
  }
  function showPhoto(d) {
    shown = d.index;
    el.photo.srcset = srcsetOf(d);
    el.photo.src = asset(d.photo[0]);
    el.photo.alt = d.name + altSuffix;
    // 鄰近兩杯先載，按左右鍵時不用等
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 300); };
    idle(function () {
      loadPhoto(drinks[(d.index + 1) % drinks.length]);
      loadPhoto(drinks[(d.index - 1 + drinks.length) % drinks.length]);
    });
  }
  function settled() {
    // 新 src 解碼完再顯示，避免淡入時閃一下舊圖或空白
    return el.photo.decode ? el.photo.decode().catch(function () {}) : Promise.resolve();
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var seq = 0;
  function swapTo(d) {
    var token = ++seq;
    var ready = loadPhoto(d);
    if (engine && !engine.dead) {
      // 粒子過場：粒子先疊在目前照片的杯子上，照片淡出 → 粒子散開、聚成下一杯 → 換上新照片、粒子淡出
      engine.sync(drinks[shown]);
      stage.classList.add('is-morphing');
      Promise.all([ready, engine.morph(d)]).then(function () {
        if (token !== seq) return;
        showPhoto(d);
        return settled().then(function () {
          if (token === seq) stage.classList.remove('is-morphing');
        });
      });
      return;
    }
    el.photo.classList.add('is-out');
    Promise.all([ready, wait(reduceMotion ? 0 : 300)]).then(function () {
      if (token !== seq) return;
      showPhoto(d);
      return settled().then(function () {
        if (token === seq) el.photo.classList.remove('is-out');
      });
    });
  }

  select(0);
  if (!el.photo) return;

  // 第一張照片載好前，舞台掃一道金光
  if (!el.photo.complete) {
    stage.classList.add('is-loading');
    var doneLoading = function () { stage.classList.remove('is-loading'); };
    el.photo.addEventListener('load', doneLoading);
    el.photo.addEventListener('error', doneLoading);
  }

  if (!useFx || !el.canvas || !('IntersectionObserver' in window)) return;

  // ---- 進入畫面才載 three.js＋圖集（不影響首屏；照片先顯示，粒子之後才就緒） ----
  function loadAtlas() {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = reject;
      img.src = ATLAS_URL;
    });
  }

  var io = new IntersectionObserver(function (entries) {
    if (!entries.some(function (e) { return e.isIntersecting; })) return;
    io.disconnect();
    Promise.all([import(THREE_URL), loadAtlas()]).then(function (res) {
      engine = createEngine(res[0], res[1]);
    }).catch(function () { engine = null; });   // 沒有 WebGL／載入失敗：維持淡出淡入
  }, { rootMargin: '200px 0px' });
  io.observe(stage);

  // =====================================================================
  function createEngine(THREE, atlas) {
    var canvas = el.canvas;
    // 沒有 WebGL 時這裡會 throw → 外層 .catch，維持淡出淡入
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true });
    var small = Math.min(window.innerWidth, window.innerHeight) < 700;
    var dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    var N = small ? 9000 : 16000;
    var NDrink = Math.floor(N * 0.9);   // 其餘是金色星塵

    // ---- 從圖集整理每杯的像素（只算一次） ----
    var px = atlas.data, AW = atlas.width;
    var cache = {};
    function pixels(d) {
      if (cache[d.index]) return cache[d.index];
      var r = d.photo[1], W = r[2], H = r[3], list = [], cum = [], wsum = 0;
      var lum = function (xx, yy) { var o2 = ((r[1] + yy) * AW + r[0] + xx) * 4; return px[o2] * 0.3 + px[o2 + 1] * 0.59 + px[o2 + 2] * 0.11; };
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var o = ((r[1] + y) * AW + r[0] + x) * 4;
        if (px[o + 3] < 35) continue;   // 門檻放低：玻璃杯緣、杯腳在去背圖裡是半透明的
        // 細節權重：跟四鄰亮度差越大（葉脈、杯緣、裝飾）分到越多粒子
        var L = lum(x, y), dv = 0;
        if (x > 0) dv += Math.abs(L - lum(x - 1, y));
        if (x < W - 1) dv += Math.abs(L - lum(x + 1, y));
        if (y > 0) dv += Math.abs(L - lum(x, y - 1));
        if (y < H - 1) dv += Math.abs(L - lum(x, y + 1));
        list.push(x, y, px[o], px[o + 1], px[o + 2]);
        wsum += 1 + Math.min(1, dv / 90) * 2 + (px[o + 3] < 128 ? 1.5 : 0);
        cum.push(wsum);
      }
      return (cache[d.index] = { list: list, cum: cum, total: wsum, cnt: list.length / 5 });
    }
    // 各杯像素在瀏覽器閒置時逐杯預算（避免第一次換杯時一次掃完卡住）
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
    var pre = 0;
    (function warm() {
      idle(function () {
        if (pre >= drinks.length) return;
        pixels(drinks[pre++]);
        warm();
      });
    })();

    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);   // 以畫布的 CSS 像素為單位，y 往下為負
    var start = new Float32Array(N * 3), target = new Float32Array(N * 3);
    var c0 = new Float32Array(N * 3), c1 = new Float32Array(N * 3);
    var rand = new Float32Array(N * 4), kind = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      rand[i * 4] = Math.random(); rand[i * 4 + 1] = Math.random();
      rand[i * 4 + 2] = Math.random(); rand[i * 4 + 3] = Math.random();
      kind[i] = i < NDrink ? 0 : 3;
    }
    // 打散粒子編號：換杯時每顆粒子飛去新杯子的任意位置，而不是平移
    var perm = new Uint32Array(NDrink);
    for (i = 0; i < NDrink; i++) perm[i] = i;
    for (i = NDrink - 1; i > 0; i--) { var b1 = Math.floor(Math.random() * (i + 1)), t1 = perm[i]; perm[i] = perm[b1]; perm[b1] = t1; }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(target, 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
    geo.setAttribute('aC0', new THREE.BufferAttribute(c0, 3));
    geo.setAttribute('aC1', new THREE.BufferAttribute(c1, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));

    var uniforms = {
      uP: { value: 1 }, uTime: { value: 0 }, uScatter: { value: 100 },
      uS0: { value: 3 }, uS1: { value: 3 }, uDust: { value: 2.4 }, uPix: { value: dpr }
    };
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending, // 一般混色才保得住照片原色；疊加會把顏色洗白
      vertexShader: [
        'attribute vec3 aStart; attribute vec3 aTarget; attribute vec3 aC0; attribute vec3 aC1;',
        'attribute vec4 aRand; attribute float aKind;',
        'uniform float uP, uTime, uScatter, uS0, uS1, uDust, uPix;',
        'varying vec3 vC; varying float vA;',
        'float ease(float t){ return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0; }',
        'void main(){',
        '  float p = clamp((uP - aRand.w * 0.35) / 0.65, 0.0, 1.0);',
        '  float e = ease(p);',
        '  vec2 dir = normalize(aRand.xy * 2.0 - 1.0 + 1e-4);',
        '  vec3 pos = mix(aStart, aTarget, e);',
        '  pos.xy += dir * sin(3.14159 * p) * uScatter * (0.6 + aRand.w);',
        '  if (aKind > 2.5) pos.xy += 6.0 * vec2(sin(uTime*1.3 + aRand.x*40.0), cos(uTime*1.1 + aRand.y*40.0));',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);',
        '  float s = aKind > 2.5 ? uDust : mix(uS0, uS1, ease(clamp(uP, 0.0, 1.0)));',
        '  gl_PointSize = s * uPix * (0.6 + aRand.z * 0.8);',
        '  vC = mix(aC0, aC1, e);',
        '  vA = aKind > 2.5 ? 0.35 : 0.95;',
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
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    var W = 1, H = 1, dust = new Float32Array((N - NDrink) * 2);
    var GOLD = [0.39, 0.33, 0.22];
    // 照片 → 粒子：圖集像素 → 照片座標（PHOTOS 的杯子位置）→ 畫布座標（跟 object-fit: cover 同算法）
    function layout(d) {
      var info = pixels(d), list = info.list, r = d.photo[1], b = d.photo[2];
      var s = Math.max(W / IMG_W, H / IMG_H);
      var gx = (W - IMG_W * s) * POS_X + b[0] * IMG_W * s, gy = (H - IMG_H * s) * POS_Y + b[1] * IMG_H * s;
      var kx = b[2] * IMG_W * s / r[2], ky = b[3] * IMG_H * s / r[3];
      var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      for (var k = 0; k < NDrink; k++) {
        // 依細節權重的累積分布等距取樣，鋪滿整個杯子（粒子數少於像素數時也不會只分到上半部）
        var goal = (k + 0.5) / NDrink * info.total, lo = 0, hi = info.cnt - 1;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (info.cum[mid] < goal) lo = mid + 1; else hi = mid; }
        var o = lo * 5, j = perm[k] * 3;
        pos[j] = gx + (list[o] + Math.random()) * kx;
        pos[j + 1] = -(gy + (list[o + 1] + Math.random()) * ky);
        col[j] = 0.04 + list[o + 2] / 255 * 0.96;
        col[j + 1] = 0.04 + list[o + 3] / 255 * 0.96;
        col[j + 2] = 0.04 + list[o + 4] / 255 * 0.96;
      }
      for (k = NDrink; k < N; k++) {
        var jj = k * 3, q = (k - NDrink) * 2;
        pos[jj] = dust[q]; pos[jj + 1] = dust[q + 1];
        col[jj] = GOLD[0]; col[jj + 1] = GOLD[1]; col[jj + 2] = GOLD[2];
      }
      // 粒子大小跟著杯子在畫面上的面積走，聚好時剛好填滿、不留空隙
      var size = Math.min(6, Math.max(1.6, Math.sqrt(info.cnt * kx * ky / NDrink) * 1.7));
      return { pos: pos, col: col, size: size };
    }

    var at = -1, T0 = 0, morphing = false, P = 1, holdUntil = 0, raf = 0, finish = null, stale = false;
    var DUR = 1.5;
    function easeJS(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function upload() { ['aStart', 'aTarget', 'aC0', 'aC1'].forEach(function (n) { geo.attributes[n].needsUpdate = true; }); }

    // 直接把粒子擺成某杯（不動畫）
    function place(d) {
      var b = layout(d);
      start.set(b.pos); target.set(b.pos); c0.set(b.col); c1.set(b.col);
      uniforms.uS0.value = uniforms.uS1.value = b.size;
      P = 1; uniforms.uP.value = 1; at = d.index;
      upload();
    }
    function morph(d) {
      var b = layout(d);
      // 把「現在畫面上的位置」凍結成新起點（與 vertex shader 同公式），連點也不會跳
      var tm = uniforms.uTime.value, sc0 = uniforms.uScatter.value;
      for (var i2 = 0; i2 < N; i2++) {
        var rx = rand[i2 * 4], ry = rand[i2 * 4 + 1], w = rand[i2 * 4 + 3];
        var p = Math.min(1, Math.max(0, (P - w * 0.35) / 0.65)), e = easeJS(p);
        var sc = Math.sin(Math.PI * p) * sc0 * (0.6 + w);
        var dx = rx * 2 - 1 + 1e-4, dy = ry * 2 - 1 + 1e-4, dl = Math.hypot(dx, dy) || 1;
        var j = i2 * 3, dust2 = kind[i2] > 2.5;
        var cur0 = start[j] + (target[j] - start[j]) * e + dx / dl * sc + (dust2 ? 6 * Math.sin(tm * 1.3 + rx * 40) : 0);
        var cur1 = start[j + 1] + (target[j + 1] - start[j + 1]) * e + dy / dl * sc + (dust2 ? 6 * Math.cos(tm * 1.1 + ry * 40) : 0);
        start[j] = cur0; start[j + 1] = cur1; start[j + 2] = 0;
        for (var a = 0; a < 3; a++) {
          c0[j + a] = c0[j + a] + (c1[j + a] - c0[j + a]) * e;
          target[j + a] = b.pos[j + a];
          c1[j + a] = b.col[j + a];
        }
        if (dust2) { target[j] = start[j]; target[j + 1] = start[j + 1]; }   // 星塵原地漂浮
      }
      uniforms.uS0.value += (uniforms.uS1.value - uniforms.uS0.value) * easeJS(P);
      uniforms.uS1.value = b.size;
      upload();
      at = d.index;
      if (finish) finish();   // 上一段還沒聚好就被打斷：放行（外層用 token 判斷要不要換圖）
      P = 0; uniforms.uP.value = 0; T0 = performance.now(); morphing = true;
      kick();
      return new Promise(function (resolve) { finish = resolve; });
    }

    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h || (w === W && h === H)) return;
      W = w; H = h;
      renderer.setSize(W, H, false);
      camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = -H;
      camera.updateProjectionMatrix();
      uniforms.uScatter.value = Math.min(W, H) * 0.22;
      for (var q = 0; q < dust.length; q += 2) { dust[q] = Math.random() * W; dust[q + 1] = -Math.random() * H; }
      // 過場中途改尺寸（手機轉向、縮放視窗）：目標座標是舊尺寸算的，聚好後用新尺寸重擺一次，下次換杯才對得上照片
      if (at >= 0) { if (morphing) stale = true; else place(drinks[at]); }
    }
    resize();
    var rt = 0;
    window.addEventListener('resize', function () { cancelAnimationFrame(rt); rt = requestAnimationFrame(resize); });

    // 只在過場時畫：聚好後多畫一小段讓畫布淡出，之後停迴圈
    function frame(now) {
      raf = 0;
      if (morphing) {
        P = Math.min(1, (now - T0) / 1000 / DUR);
        uniforms.uP.value = P;
        if (P >= 1) {
          morphing = false;
          holdUntil = now + 900;
          if (stale) { stale = false; place(drinks[at]); }
          if (finish) { var f = finish; finish = null; f(); }
        }
      }
      uniforms.uTime.value = now / 1000;
      renderer.render(scene, camera);
      if (morphing || now < holdUntil) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    var api = {
      dead: false,
      morph: morph,
      // 換杯前確認粒子停在照片目前那杯上（過場中途被打斷時不重擺，從現在位置接著飛）
      sync: function (d) { resize(); if (!morphing && at !== d.index) place(d); }
    };
    // 手機回收 GPU 記憶體時 context 會遺失 → 停迴圈、改用淡出淡入
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      api.dead = true;
      morphing = false;
      cancelAnimationFrame(raf); raf = 0;
      if (finish) { var f = finish; finish = null; f(); }
    });
    return api;
  }
})();
