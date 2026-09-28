/* D Town 特調粒子舞台（中英兩頁共用）
 * 每杯的粒子直接取樣自酒單插圖（webp/cocktail-particles-atlas.webp，取自原始酒單 PDF 的去背圖逐杯拼成），
 * 所以杯型、酒色、裝飾物都跟酒單一致。酒名／價格／原料則讀自頁面上的 .cocktail-text-item。
 * three.js 與圖集只在舞台第一次進入畫面時才載入，不影響首屏。
 * 無 WebGL／載入失敗／context lost → .is-fallback（顯示該杯原插圖＋文字），選單照常可用。
 */
(function () {
  'use strict';
  var stage = document.getElementById('cocktail-stage');
  if (!stage) return;

  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';
  var scriptSrc = (document.currentScript && document.currentScript.src) || location.href;
  var ATLAS_URL = new URL('webp/cocktail-particles-atlas.webp?v=3', scriptSrc).href; // 換圖集記得改 v
  var ATLAS_W = 1080, ATLAS_H = 800;
  // 圖集內每杯的位置 [x, y, w, h]，順序＝酒單順序（每系列 6 杯）
  var RECTS = [
    [62, 4, 56, 194], [216, 32, 107, 166], [409, 30, 82, 168], [587, 31, 86, 167], [751, 44, 117, 154], [940, 34, 100, 164],
    [44, 237, 92, 161], [200, 248, 140, 150], [414, 217, 71, 181], [559, 237, 141, 161], [752, 234, 115, 164], [937, 258, 105, 140],
    [35, 428, 109, 170], [184, 434, 172, 164], [376, 446, 147, 152], [588, 441, 83, 157], [752, 435, 116, 163], [931, 471, 117, 127],
    [64, 617, 51, 181], [195, 630, 150, 168], [382, 639, 135, 159], [602, 617, 55, 181], [756, 637, 108, 161], [951, 626, 77, 172]
  ];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
        index: drinks.length,
        name: name,
        price: price ? price.textContent.trim() : '',
        desc: desc ? desc.textContent.trim() : '',
        series: si,
        el: item,
        rect: RECTS[drinks.length % RECTS.length],
        tint: null   // 圖集載入後填入該杯平均色，用於背景光暈
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
  var engine = null;      // three.js＋圖集就緒後才有

  // fallback 用：直接顯示該杯原插圖
  var sprite = document.createElement('div');
  sprite.className = 'cs-sprite';
  sprite.setAttribute('aria-hidden', 'true');
  stage.insertBefore(sprite, el.info);

  // ---- 選單（系列＋酒名） ----
  var seriesRow = document.createElement('div');
  seriesRow.className = 'cs-picker-series';
  var drinkRow = document.createElement('div');
  drinkRow.className = 'cs-picker-drinks';
  if (picker) { picker.appendChild(seriesRow); picker.appendChild(drinkRow); }

  seriesList.forEach(function (s) {
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

  function applyTint(d) {
    if (!d.tint) return;
    stage.style.setProperty('--cs-top', d.tint);
  }

  function placeSprite(d) {
    var r = d.rect, box = stage.clientHeight * 0.62, s = Math.min(box / r[3], (stage.clientWidth * 0.5) / r[2], 2.4);
    sprite.style.width = Math.round(r[2] * s) + 'px';
    sprite.style.height = Math.round(r[3] * s) + 'px';
    sprite.style.backgroundSize = Math.round(ATLAS_W * s) + 'px ' + Math.round(ATLAS_H * s) + 'px';
    sprite.style.backgroundPosition = Math.round(-r[0] * s) + 'px ' + Math.round(-r[1] * s) + 'px';
  }

  function select(i) {
    if (i === current) return;
    current = i;
    var d = drinks[i];
    var s = seriesList[d.series];
    applyTint(d);
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

    if (stage.classList.contains('is-fallback') && atlasOk) placeSprite(d);
    if (engine) engine.morph(d);
  }

  select(0);

  // ---- 進入畫面才載 three.js＋圖集 ----
  var atlasOk = false;
  function fallback() {
    stage.classList.add('is-fallback');
    stage.classList.remove('is-loading', 'is-live');
    // three.js 失敗時圖集可能還在路上 → 自己再載一次；圖集本身載不到就只留文字卡
    function showSprite() {
      sprite.style.display = '';
      sprite.style.backgroundImage = 'url("' + ATLAS_URL + '")';
      placeSprite(drinks[current]);
    }
    if (atlasOk) { showSprite(); return; }
    sprite.style.display = 'none';
    var probe = new Image();
    probe.onload = function () { atlasOk = true; if (stage.classList.contains('is-fallback')) showSprite(); };
    probe.src = ATLAS_URL;
  }
  if (!('IntersectionObserver' in window) || !el.canvas) { fallback(); return; }

  function loadAtlas() {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        atlasOk = true;
        resolve(ctx.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = reject;
      img.src = ATLAS_URL;
    });
  }

  var started = false;
  var visible = false;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      visible = e.isIntersecting;
      if (visible && !started) {
        started = true;
        stage.classList.add('is-loading');
        Promise.all([import(THREE_URL), loadAtlas()]).then(function (res) {
          engine = createEngine(res[0], res[1]);
          stage.classList.remove('is-loading');
          stage.classList.add('is-live');
          applyTint(drinks[current]);
          engine.morph(drinks[current], true);
        }).catch(function () { fallback(); });
      }
      if (engine) engine.setRunning(visible);
      if (!engine && atlasOk && stage.classList.contains('is-fallback')) placeSprite(drinks[current]);
    });
  }, { rootMargin: '200px 0px' });
  io.observe(stage);

  // =====================================================================
  function createEngine(THREE, atlas) {
    var canvas = el.canvas;
    // 沒有 WebGL 時這裡會 throw → 外層 .catch 走 fallback
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    var small = Math.min(window.innerWidth, window.innerHeight) < 700;
    var lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
    var dpr = Math.min(window.devicePixelRatio || 1, small || lowEnd ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    var N = lowEnd ? 8000 : small ? 10000 : 26000;
    var NDrink = Math.floor(N * 0.86);   // 其餘是背景星塵

    // ---- 從圖集整理每杯的像素（只算一次） ----
    var px = atlas.data, AW = atlas.width;
    var cache = {};
    function pixels(d) {
      if (cache[d.index]) return cache[d.index];
      var r = d.rect, W = r[2], H = r[3], list = [];
      var sr = 0, sg = 0, sb = 0, x, y;
      var mask = new Uint8Array(W * H);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        if (px[((r[1] + y) * AW + r[0] + x) * 4 + 3] >= 128) mask[y * W + x] = 1;
      }
      // 厚度≈所在橫向連續段與縱向連續段到端點距離的較小值（近似，非真正的距離轉換）：杯身中央厚、杯緣／橋桁／竹籤／葉片薄
      var th = new Float32Array(W * H);
      for (y = 0; y < H; y++) {
        x = 0;
        while (x < W) {
          if (!mask[y * W + x]) { x++; continue; }
          var x0 = x;
          while (x < W && mask[y * W + x]) x++;
          for (var xx = x0; xx < x; xx++) th[y * W + xx] = Math.min(xx - x0, x - 1 - xx) + 0.5;
        }
      }
      for (x = 0; x < W; x++) {
        y = 0;
        while (y < H) {
          if (!mask[y * W + x]) { y++; continue; }
          var y0 = y;
          while (y < H && mask[y * W + x]) y++;
          for (var yy = y0; yy < y; yy++) th[yy * W + x] = Math.min(th[yy * W + x], Math.min(yy - y0, y - 1 - yy) + 0.5);
        }
      }
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        if (!mask[y * W + x]) continue;
        var o = ((r[1] + y) * AW + r[0] + x) * 4;
        list.push(x, y, px[o], px[o + 1], px[o + 2], th[y * W + x]);
        sr += px[o]; sg += px[o + 1]; sb += px[o + 2];
      }
      var n = list.length / 6 || 1;
      var info = { list: list, w: r[2], h: r[3] };
      d.tint = 'rgb(' + Math.round(sr / n) + ',' + Math.round(sg / n) + ',' + Math.round(sb / n) + ')';
      cache[d.index] = info;
      return info;
    }
    // 其餘各杯的像素在瀏覽器閒置時逐杯預算（避免進場時一次掃 24 杯卡住主執行緒）
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
    var pre = 0;
    (function warm() {
      idle(function () {
        while (pre < drinks.length && cache[drinks[pre].index]) pre++;
        if (pre >= drinks.length) return;
        pixels(drinks[pre++]);
        warm();
      });
    })();

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.6, 9.8);
    var group = new THREE.Group();
    scene.add(group);

    var start = new Float32Array(N * 3), target = new Float32Array(N * 3);
    var c0 = new Float32Array(N * 3), c1 = new Float32Array(N * 3);
    var rand = new Float32Array(N * 4), kind = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      rand[i * 4] = Math.random(); rand[i * 4 + 1] = Math.random();
      rand[i * 4 + 2] = Math.random(); rand[i * 4 + 3] = Math.random();
      kind[i] = i < NDrink ? 0 : 3;
      // 初始：散在遠處的星塵
      var p = randSphere(4 + Math.random() * 3);
      start[i * 3] = target[i * 3] = p[0];
      start[i * 3 + 1] = target[i * 3 + 1] = p[1];
      start[i * 3 + 2] = target[i * 3 + 2] = p[2];
    }

    var perm = new Uint32Array(N);
    for (i = 0; i < N; i++) perm[i] = i;
    function shuffle(from, to) {
      for (var a1 = to - 1; a1 > from; a1--) { var b1 = from + Math.floor(Math.random() * (a1 - from + 1)), t1 = perm[a1]; perm[a1] = perm[b1]; perm[b1] = t1; }
    }
    shuffle(0, NDrink); shuffle(NDrink, N);

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
      uSize: { value: small || lowEnd ? 48 : 40 }, uPix: { value: dpr },
      uMouse: { value: new THREE.Vector3(99, 99, 0) }, uMouseOn: { value: 0 },
      uMotion: { value: reduceMotion ? 0 : 1 }
    };

    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending, // 一般混色才保得住插圖原色；疊加會把顏色洗白或洗暗
      vertexShader: [
        'attribute vec3 aStart; attribute vec3 aTarget; attribute vec3 aC0; attribute vec3 aC1;',
        'attribute vec4 aRand; attribute float aKind;',
        'uniform float uP, uTime, uScatter, uSize, uPix, uMouseOn, uMotion;',
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
        '  vec4 wp = modelMatrix * vec4(pos, 1.0);',
        '  vec2 dm = wp.xy - uMouse.xy;',
        '  float f = uMouseOn * smoothstep(1.15, 0.0, length(dm));',
        '  wp.xy += normalize(dm + 1e-4) * f * 0.6;',
        '  wp.z += f * 0.35;',
        '  vec4 mv = viewMatrix * wp;',
        '  gl_Position = projectionMatrix * mv;',
        '  float tw = 0.82 + 0.18 * sin(uTime * 2.2 * uMotion + aRand.y * 60.0);',
        '  gl_PointSize = uSize * uPix * (0.55 + aRand.z * 0.9) * (aKind > 2.5 ? 0.8 : 1.0) / -mv.z;',
        '  vC = mix(aC0, aC1, e) * tw * (1.0 + f * 0.9);',
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
    group.add(new THREE.Points(geo, mat));

    function randSphere(r) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      return [r * s * Math.cos(th), r * u * 0.7, r * s * Math.sin(th)];
    }
    function hex(h) { var c = new THREE.Color(h); return [c.r, c.g, c.b]; }

    // 插圖 → 粒子：x/y 取像素位置，z 依該列寬度做成圓柱般的厚度，顏色取像素色
    var HEIGHT = 3.7, MAXW = 3.4;
    function build(d) {
      var info = pixels(d), list = info.list, cnt = list.length / 6;
      var u = Math.min(HEIGHT / info.h, MAXW / info.w);
      var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      for (var k = 0; k < NDrink; k++) {
        // 粒子均勻鋪滿整張插圖（亂數取樣會留下空洞）。⚠️ 不能用 k % cnt：手機粒子數少於像素數時，
        // 只會分到上半部的像素，杯子下半截被切掉。改成依比例跨步取樣。perm 打散粒子編號，變形時才會四處飛
        var o = Math.min(cnt - 1, Math.floor(k * cnt / NDrink)) * 6;
        var x = list[o] + Math.random(), y = list[o + 1] + Math.random();
        var depth = Math.min(list[o + 5] * u, 0.55);
        var j = perm[k] * 3;
        pos[j] = (x - info.w / 2) * u;
        pos[j + 1] = (info.h - y) * u - HEIGHT / 2;
        pos[j + 2] = depth * (Math.random() * 2 - 1);
        // 深色部位（銅杯、橋、深色杯墊）在黑底疊加下會消失 → 墊一層底光，保留原色相
        col[j] = 0.06 + list[o + 2] / 255 * 0.94;
        col[j + 1] = 0.055 + list[o + 3] / 255 * 0.94;
        col[j + 2] = 0.05 + list[o + 4] / 255 * 0.94;
      }
      var gold = hex('#c8a96e');
      for (k = NDrink; k < N; k++) {
        var sp = randSphere(2.8 + Math.random() * 3.2), jj = perm[k] * 3;
        pos[jj] = sp[0]; pos[jj + 1] = sp[1]; pos[jj + 2] = sp[2];
        col[jj] = gold[0] * 0.5; col[jj + 1] = gold[1] * 0.5; col[jj + 2] = gold[2] * 0.5;
      }
      return { pos: pos, col: col };
    }

    // ---- 變形 ----
    var T0 = 0, morphing = false, P = 1;
    var DUR = reduceMotion ? 0.001 : 1.9;
    function easeJS(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function morph(d, fromDust) {
      var b = build(d);
      if (d === drinks[current]) applyTint(d);
      // 把「現在畫面上的位置」凍結成新起點（與 vertex shader 同公式，含漂浮），連點也不會跳
      var mo = uniforms.uMotion.value, tm = uniforms.uTime.value;
      for (var i2 = 0; i2 < N; i2++) {
        var rx = rand[i2 * 4], ry = rand[i2 * 4 + 1], rz = rand[i2 * 4 + 2], w = rand[i2 * 4 + 3];
        var p = Math.min(1, Math.max(0, (P - w * 0.35) / 0.65)), e = easeJS(p);
        var sc = Math.sin(Math.PI * p) * uniforms.uScatter.value * (0.6 + w);
        var dx = rx * 2 - 1 + 1e-4, dy = ry * 2 - 1 + 1e-4, dz = rz * 2 - 1 + 1e-4;
        var dl = Math.hypot(dx, dy, dz) || 1;
        var drift = kind[i2] > 2.5 ? 0.12 : 0.012;
        var j = i2 * 3;
        var cur0 = start[j] + (target[j] - start[j]) * e + dx / dl * sc + mo * drift * Math.sin(tm * 1.3 + rx * 40);
        var cur1 = start[j + 1] + (target[j + 1] - start[j + 1]) * e + dy / dl * sc + mo * drift * Math.cos(tm * 1.1 + ry * 40);
        var cur2 = start[j + 2] + (target[j + 2] - start[j + 2]) * e + dz / dl * sc + mo * drift * Math.sin(tm * 0.9 + rz * 40);
        start[j] = cur0; start[j + 1] = cur1; start[j + 2] = cur2;
        for (var a = 0; a < 3; a++) {
          c0[j + a] = fromDust ? b.col[j + a] * 0.3 : c0[j + a] + (c1[j + a] - c0[j + a]) * e;
          target[j + a] = b.pos[j + a];
          c1[j + a] = b.col[j + a];
        }
      }
      ['aStart', 'aTarget', 'aC0', 'aC1'].forEach(function (n) { geo.attributes[n].needsUpdate = true; });
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
    // 手機回收 GPU 記憶體時 context 會遺失 → 停迴圈、改顯示原插圖
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      setRunning(false);
      engine = null;
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
      var narrow = w / h < 0.9;
      camera.position.z = narrow ? 11 : 9.8;
      camera.lookAt(0, 0.2, 0);
      // 桌機杯子偏右讓出左下文字區；手機杯子上移讓出底部文字區
      group.position.set(narrow ? 0 : 1.15, narrow ? 0.75 : 0.1, 0);
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
      // 變形結束又沒在互動時降到約 30fps，省電
      if (!morphing && uniforms.uMouseOn.value < 0.01 && mouseTarget === 0 && now - clock < 32) {
        if (running) raf = requestAnimationFrame(frame);
        return;
      }
      var dt = Math.min(0.05, (now - clock) / 1000); clock = now;
      elapsed += dt;
      if (morphing) {
        P = Math.min(1, (now - T0) / 1000 / DUR);
        uniforms.uP.value = P;
        if (P >= 1) morphing = false;
      }
      uniforms.uTime.value = elapsed;
      uniforms.uMouseOn.value += (mouseTarget - uniforms.uMouseOn.value) * 0.08;
      // 插圖是正面視角，只做左右小幅擺動（整圈轉到側面會變成一條線）
      var sway = reduceMotion ? 0 : Math.sin(elapsed * 0.45) * 0.3;
      group.rotation.y += (sway + tilt.y * 0.25 * uniforms.uMouseOn.value - group.rotation.y) * 0.06;
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
