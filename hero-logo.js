/* D Town 首頁：金屬背光 logo＋滾動「往前進」（中英兩頁共用）
 * #hero 高度＝2.2 個螢幕，.hero-pin 釘在畫面上；滑動進度 p 驅動：
 *   0–0.22  文字淡出上移
 *   0.05–0.6 logo 的 D 上半部中空處移到畫面中央
 *   0.08–1  以 D 的中空處為中心放大到約 9 倍（穿過 D 的洞）
 *   0.45–0.9 暖光變強，0.82–1 淡入黑色後接下一區
 * 高度策略（IG/LINE/iOS 捲動時網址列伸縮會讓 innerHeight 跳動）：
 *   --hero-vh（整段滑動長度）只在寬度改變時重設 → 捲動位置不會跳；
 *   --hero-pin-h（釘住畫面高度）取「看過的最大高度」只增不減 → 網址列收起時補滿一次，不會來回抖。
 * JS 成功執行才加 .hero-js 開啟釘住；JS 失敗就是一般的一屏首頁。
 * prefers-reduced-motion：不釘住、不放大（CSS 已處理），這裡直接不動作。
 */
(function () {
  'use strict';
  var hero = document.getElementById('hero');
  if (!hero) return;
  var pin = hero.querySelector('.hero-pin');
  var logo = hero.querySelector('.hero-logo');
  var copy = hero.querySelector('.hero-copy');
  var flare = hero.querySelector('.hero-flare');
  var fade = hero.querySelector('.hero-fade');
  var hint = hero.querySelector('.hero-scroll-hint');
  if (!pin || !logo) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ORIGIN_X = 0.5238, ORIGIN_Y = 0.3047;   // D 上半部中空處在 logo 圖內的位置（與 CSS transform-origin 相同）
  var MAX_SCALE = 9;
  var lastW = 0, pinH = 0, base = null, ticking = false;
  hero.classList.add('hero-js');

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(p, a, b) { return clamp((p - a) / (b - a)); }

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
    var p = total > 0 ? clamp(-hero.getBoundingClientRect().top / total) : 0;

    var mv = seg(p, 0.05, 0.6); mv = 1 - (1 - mv) * (1 - mv);          // 先快後慢把中空處帶到中央
    var z = seg(p, 0.08, 1); var s = Math.pow(MAX_SCALE, z * z);        // 越靠近越快，像往前走
    logo.style.transform = 'translate(' + (base.dx * mv).toFixed(1) + 'px,' + (base.dy * mv).toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';

    var c = seg(p, 0, 0.22);
    if (copy) {
      copy.style.opacity = (1 - c).toFixed(3);
      copy.style.transform = 'translateY(' + (-40 * c).toFixed(1) + 'px)';
      copy.style.visibility = c >= 1 ? 'hidden' : '';   // 淡完就不能再被點到
    }
    if (hint) hint.style.opacity = (1 - seg(p, 0, 0.06)).toFixed(3);
    if (flare) flare.style.opacity = (seg(p, 0.45, 0.8) * (1 - seg(p, 0.9, 1))).toFixed(3);
    if (fade) fade.style.opacity = seg(p, 0.82, 1).toFixed(3);
  }

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
