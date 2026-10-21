(function () {
  'use strict';

  var CARD = '.recent-post-item';
  var SEL = '#recent-posts ' + CARD + ', .recent-post-items ' + CARD;
  var ACTIVE = 'ct-active';
  var READY = 'ct-ready';
  var BOUND = 'ct-bound';
  var EVADED = 'ct-evaded';

  var MAX_TILT = 14;
  var SETTLE = 55;
  var BOUNCE = 0.75;
  var MAX_SPEED = 520;

  var ZETA = 1 - BOUNCE * 0.62;
  var OMEGA = 2100 / SETTLE;

  var EPS = 0.002;

  var root = document.documentElement;
  var cards = [];
  var raf = 0;
  var lastTime = 0;

  function findCard(node) {
    while (node && node !== document) {
      if (node.classList && node.classList.contains('recent-post-item')) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function postHref(card) {
    var a = card.querySelector('.article-title[href]') || card.querySelector('.post_cover a[href]');
    return a ? a.getAttribute('href') : null;
  }

  function onDocClick(ev) {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) {
      return;
    }

    var card = findCard(ev.target);
    if (!card) {
      return;
    }
    if (card.classList.contains('ads-wrap')) {
      return;
    }
    if (ev.target.closest && ev.target.closest('a, button, input, textarea, select, label, [role="button"]')) {
      return;
    }
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length > 0) {
      return;
    }
    var a = card.querySelector('.article-title[href]');
    if (!a) {
      return;
    }
    a.click();
  }

  function makeFocusable(el) {
    if (typeof el.hasAttribute === 'function') {
      if (!el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '-1');
      }
    } else {
      el.setAttribute('tabindex', '-1');
    }
  }

  function onDocKeydown(ev) {
    if (ev.key !== 'Enter' || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) {
      return;
    }
    var card = findCard(ev.target);
    if (!card || card.classList.contains('ads-wrap')) {
      return;
    }
    if (ev.target.closest && ev.target.closest('a, button')) {
      return;
    }
    var href = postHref(card);
    if (href) {
      window.location.href = href;
    }
  }

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeydown);

  if (window.matchMedia) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    if (window.matchMedia('(hover: none)').matches) {
      return;
    }
  }

  function makeState(el) {
    return {
      el: el,
      w: 0,
      h: 0,
      tx: 0,
      ty: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      lift: 0,
      vLift: 0,
      hover: false,
      // 指针在卡片内的归一化位置（-1..1），供光影层定位高光与投影方向
      nx: 0,
      ny: 0,
      last: { x: NaN, y: NaN, lift: NaN, nx: NaN, ny: NaN }
    };
  }

  function measure(s) {
    var r = s.el.getBoundingClientRect();
    s.w = r.width || 1;
    s.h = r.height || 1;
  }

  function aim(s, clientX, clientY) {
    var r = s.el.getBoundingClientRect();
    if (!r.width || !r.height) {
      return;
    }
    s.w = r.width;
    s.h = r.height;

    var nx = ((clientX - r.left) / r.width) * 2 - 1;
    var ny = ((clientY - r.top) / r.height) * 2 - 1;
    nx = Math.max(-1.15, Math.min(1.15, nx));
    ny = Math.max(-1.15, Math.min(1.15, ny));

    s.tx = -ny * MAX_TILT;
    s.ty = nx * MAX_TILT;
    s.nx = nx;
    s.ny = ny;
  }

  function write(s, force) {
    var l = s.last;
    var dirty =
      force ||
      !(Math.abs(l.x - s.x) <= EPS) ||
      !(Math.abs(l.y - s.y) <= EPS) ||
      !(Math.abs(l.lift - s.lift) <= 0.001) ||
      !(Math.abs(l.nx - s.nx) <= EPS) ||
      !(Math.abs(l.ny - s.ny) <= EPS);
    if (dirty) {
      l.x = s.x;
      l.y = s.y;
      l.lift = s.lift;
      l.nx = s.nx;
      l.ny = s.ny;
      var st = s.el.style;
      st.setProperty('--ct-rx', s.x.toFixed(3) + 'deg');
      st.setProperty('--ct-ry', s.y.toFixed(3) + 'deg');
      st.setProperty('--ct-lift', s.lift.toFixed(4));
      st.setProperty('--ct-nx', s.nx.toFixed(4));
      st.setProperty('--ct-ny', s.ny.toFixed(4));
    }
  }

  function step(s, dt) {
    if (!s.hover) {
      s.tx = 0;
      s.ty = 0;
    }

    var w2 = OMEGA * OMEGA;
    var dz = 2 * ZETA * OMEGA;

    function advance(x, v, target) {
      v += (w2 * (target - x) - dz * v) * dt;
      if (v > MAX_SPEED) { v = MAX_SPEED; }
      if (v < -MAX_SPEED) { v = -MAX_SPEED; }
      return [x + v * dt, v];
    }

    var rx = advance(s.x, s.vx, s.tx);
    s.x = rx[0]; s.vx = rx[1];
    var ry = advance(s.y, s.vy, s.ty);
    s.y = ry[0]; s.vy = ry[1];

    var goal = s.hover ? 1 : 0;
    var lf = advance(s.lift, s.vLift, goal);
    s.lift = lf[0]; s.vLift = lf[1];

    var rest =
      Math.abs(s.tx - s.x) < 0.01 &&
      Math.abs(s.ty - s.y) < 0.01 &&
      Math.abs(s.vx) < 0.05 &&
      Math.abs(s.vy) < 0.05 &&
      Math.abs(goal - s.lift) < 0.002 &&
      Math.abs(s.vLift) < 0.002;

    if (rest) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
      s.lift = goal;
      s.vLift = 0;
      write(s, true);
      return false;
    }

    write(s);
    return true;
  }

  function clampDt(now) {
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!(dt > 0)) {
      return 1 / 60;
    }
    if (dt > 1 / 30) {
      return 1 / 30;
    }
    if (dt < 1 / 240) {
      return 1 / 240;
    }
    return dt;
  }

  function loop(now) {
    raf = 0;
    var dt = clampDt(now || 0);
    var alive = false;
    for (var i = 0; i < cards.length; i++) {
      if (step(cards[i], dt)) {
        alive = true;
      }
    }
    if (alive) {
      raf = requestAnimationFrame(loop);
    }
  }

  function kick() {
    if (!raf) {
      lastTime = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function onEnter(s) {
    s.hover = true;
    s.el.classList.add(ACTIVE);
    s.el.classList.add(EVADED);
    kick();
  }

  function onMove(s, ev) {
    var x = ev.clientX;
    var y = ev.clientY;

    var r = s.el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
      return;
    }

    aim(s, x, y);
    if (!s.hover) {
      onEnter(s);
    }
    kick();
  }

  function onLeave(s) {
    s.hover = false;
    s.el.classList.remove(ACTIVE);
    kick();
  }

  function bind(s) {
    var el = s.el;
    if (el.getAttribute(BOUND) === '1') {
      return;
    }
    el.setAttribute(BOUND, '1');

    el.addEventListener('mouseenter', function () {
      measure(s);
      onEnter(s);
    });
    el.addEventListener('mousemove', function (ev) {
      onMove(s, ev);
    });
    el.addEventListener('mouseleave', function () {
      onLeave(s);
    });
    el.addEventListener('focusin', function () {
      onEnter(s);
    });
    el.addEventListener('focusout', function () {
      onLeave(s);
    });
    el.addEventListener('transitionend', function () {
      measure(s);
    });
  }

  function cleanup(el) {
    el.classList.remove(ACTIVE, READY, EVADED);
    el.removeAttribute(BOUND);
    el.style.removeProperty('--ct-rx');
    el.style.removeProperty('--ct-ry');
    el.style.removeProperty('--ct-lift');
    el.style.removeProperty('--ct-nx');
    el.style.removeProperty('--ct-ny');
  }

  function reset() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    cards.forEach(function (s) {
      cleanup(s.el);
    });
    [].slice.call(document.querySelectorAll('.' + ACTIVE + ', .' + READY + ', .' + EVADED)).forEach(cleanup);
    cards = [];
    root.classList.remove('card-tilt-on');
  }

  function onFail(err) {
    reset();
    if (window.console) {
      console.warn('[card-tilt] 卡片重力倾斜初始化失败，已回退到普通悬停效果：', err);
    }
  }

  function boot() {
    try {
      if (!window.requestAnimationFrame) {
        throw new Error('requestAnimationFrame unavailable');
      }

      var nodes = [].slice.call(document.querySelectorAll(SEL));
      if (!nodes.length) {
        reset();
        return;
      }

      var kept = [];
      nodes.forEach(function (el) {
        var found = null;
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].el === el) {
            found = cards[i];
            break;
          }
        }
        var s = found || makeState(el);
        bind(s);
        measure(s);
        makeFocusable(el);
        s.hover = false;
        s.el.classList.remove(ACTIVE);
        s.el.classList.add(READY);
        kept.push(s);
      });

      cards = kept;
      root.classList.add('card-tilt-on');
    } catch (err) {
      onFail(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
  document.addEventListener('pjax:success', boot);

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(function () {
      resizeTimer = 0;
      cards.forEach(measure);
    }, 160);
  });
})();
