/* D Town 首頁：立體金屬背光 logo＋滾動「往前進」（中英兩頁共用）
 * 結構（.hero-logo-3d 內，CSS 3D）：牆上背光＋木框在最後面 → 4 層側面往後退出厚度 → 金屬正面在最前面。
 * 待機時 logo 緩慢擺動（桌機再加上滑鼠傾斜），前後層錯位露出側面、背光在牆上跟著位移 → 立體感。
 * #hero 高度＝2.2 個螢幕，.hero-pin 釘在畫面上；滑動進度 p：
 *   0.02–0.08 擺動歸零、側面層淡出（放大時只留正面＋背光兩層，避免手機大倍率合成吃爆記憶體）
 *   0.05–0.6  D 上半部中空處移到畫面中央
 *   0.08–1    以中空處為中心放大到約 9 倍（穿過 D 的洞）
 *   0.45–0.9  暖光變強，0.82–1 淡入黑色後接下一區（#welcome 文字區）
 * 高度策略（IG/LINE/iOS 捲動時網址列伸縮會讓 innerHeight 跳動）：
 *   --hero-vh（整段滑動長度）只在寬度改變時重設 → 捲動位置不會跳；
 *   --hero-pin-h（釘住畫面高度）取「看過的最大高度」只增不減 → 網址列收起時補滿一次，不會來回抖。
 * JS 成功執行才加 .hero-js 開啟釘住；JS 失敗就是一般的一屏首頁。
 * prefers-reduced-motion：不釘住、不放大、不擺動。
 */
(function () {
  'use strict';
  var hero = document.getElementById('hero');
  if (!hero) return;
  var pin = hero.querySelector('.hero-pin');
  var logo = hero.querySelector('.hero-logo');
  var rig = hero.querySelector('.hero-logo-3d');
  var sides = hero.querySelectorAll('.hero-logo-side');
  var flare = hero.querySelector('.hero-flare');
  var fade = hero.querySelector('.hero-fade');
  var hint = hero.querySelector('.hero-scroll-hint');
  if (!pin || !logo) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var ORIGIN_X = 0.5373, ORIGIN_Y = 0.2119;   // D 上半部中空處在金屬圖內的位置（與 CSS transform-origin 相同）
  var MAX_SCALE = 9;
  var lastW = 0, pinH = 0, base = null, ticking = false;
  var p = 0, tiltAmt = 1, pointer = { x: 0, y: 0, tx: 0, ty: 0 }, swayRaf = 0, heroVisible = true;
  hero.classList.add('hero-js');

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(v, a, b) { return clamp((v - a) / (b - a)); }

  function measure() {
    var prev = logo.style.transform;
    logo.style.transform = 'none';
    var r = logo.getBoundingClientRect(), pr = pin.getBoundingClientRect();
    logo.style.transform = prev;
    base = {
      dx: pr.width / 2 - (r.left - pr.left + r.width * ORIGIN_X),
      dy: pr.height / 2 - (r.top - pr.top + r.height * ORIGIN_Y)
    };
  }

  function setViewport(force) {
    var w = window.innerWidth, h = window.innerHeight, root = document.documentElement.style;
    if (force || w !== lastW) {            // 換寬度（轉向、換裝置）才重設整段長度
      lastW = w; pinH = h;
      root.setProperty('--hero-vh', h + 'px');
    } else if (h > pinH) {
      pinH = h;                            // 網址列收起變高：只補高，不縮回
    } else {
      return;
    }
    root.setProperty('--hero-pin-h', pinH + 'px');
    measure();
    update();
  }

  function update() {
    ticking = false;
    if (reduceMotion || !base) return;
    var total = hero.offsetHeight - pin.offsetHeight;
    p = total > 0 ? clamp(-hero.getBoundingClientRect().top / total) : 0;

    var mv = seg(p, 0.05, 0.6); mv = 1 - (1 - mv) * (1 - mv);          // 先快後慢把中空處帶到中央
    var z = seg(p, 0.08, 1); var s = Math.pow(MAX_SCALE, z * z);        // 越靠近越快，像往前走
    logo.style.transform = 'translate(' + (base.dx * mv).toFixed(1) + 'px,' + (base.dy * mv).toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';

    if (p > 0.02) upgradeImage();
    tiltAmt = 1 - seg(p, 0.02, 0.08);
    var sideOp = tiltAmt.toFixed(3);
    for (var i = 0; i < sides.length; i++) {
      sides[i].style.opacity = sideOp;
      sides[i].style.display = tiltAmt <= 0 ? 'none' : '';
    }
    if (hint) hint.style.opacity = (1 - seg(p, 0, 0.06)).toFixed(3);
    if (flare) flare.style.opacity = (seg(p, 0.45, 0.8) * (1 - seg(p, 0.9, 1))).toFixed(3);
    if (fade) fade.style.opacity = seg(p, 0.82, 1).toFixed(3);
    kickSway();
  }

  // 手機首屏只載 1200px 金屬圖（省解碼記憶體、首屏快）；開始往前放大時才背景換成 2400px，放大到最後仍清晰
  var upgraded = false;
  function upgradeImage() {
    if (upgraded) return;
    upgraded = true;
    var el = logo.querySelector('.hero-logo-metal');
    var hi = el && el.getAttribute('data-zoom-src');
    if (!hi || (el.currentSrc && el.currentSrc.indexOf(hi.replace(/^\.\.\//, '')) !== -1)) return;   // 已經是大圖
    var pre = new Image();
    pre.src = hi;
    var swap = function () { el.srcset = ''; el.src = hi; };
    if (pre.decode) pre.decode().then(swap, function () {}); else pre.onload = swap;
  }

  // ---- 待機擺動＋滑鼠傾斜（只在首頁可見、還沒開始放大時跑） ----
  var t0 = performance.now();
  function sway(now) {
    swayRaf = 0;
    if (!rig) return;
    var t = (now - t0) / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    var ry = (Math.sin(t * 0.45) * 7 + pointer.x * 10) * tiltAmt;
    var rx = (2.5 + Math.sin(t * 0.33) * 2 - pointer.y * 7) * tiltAmt;
    rig.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
    if (tiltAmt > 0 && heroVisible && !document.hidden) swayRaf = requestAnimationFrame(sway);
  }
  function kickSway() {
    if (reduceMotion || swayRaf || tiltAmt <= 0 || !heroVisible) return;
    swayRaf = requestAnimationFrame(sway);
  }
  if (rig && finePointer) {
    pin.addEventListener('pointermove', function (e) {
      var r = pin.getBoundingClientRect();
      pointer.tx = (e.clientX - r.left) / r.width * 2 - 1;
      pointer.ty = (e.clientY - r.top) / r.height * 2 - 1;
    });
    pin.addEventListener('pointerleave', function () { pointer.tx = 0; pointer.ty = 0; });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      heroVisible = es[0].isIntersecting;
      kickSway();
    }).observe(pin);
  }
  document.addEventListener('visibilitychange', kickSway);

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', function () { setViewport(false); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { setViewport(true); }, 250); });
  // logo 圖載入後尺寸才確定，再量一次
  var img = logo.querySelector('.hero-logo-metal');
  if (img && !img.complete) img.addEventListener('load', function () { measure(); update(); });
  setViewport(true);
})();
