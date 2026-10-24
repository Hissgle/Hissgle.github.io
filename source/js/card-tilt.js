(function () {
  'use strict';

  var CARD = '.recent-post-item';
  var SEL = '#recent-posts ' + CARD + ', .recent-post-items ' + CARD;
  var ACTIVE = 'ct-active';
  var READY = 'ct-ready';
  var BOUND = 'ct-bound';
  var EVADED = 'ct-evaded';

  var MAX_TILT = 14;
  var SETTLE = 46;
  var BOUNCE = 0.62;

  var ZETA = 1 - BOUNCE * 0.62;
  var OMEGA = 2100 / SETTLE;

  var EPS = 0.002;

  var root = document.documentElement;
  var cards = [];
  var activeCards = [];
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
      left: 0,
      top: 0,
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
      active: false,
      last: { x: NaN, y: NaN, lift: NaN }
    };
  }

  function measure(s) {
    /* offset* 不受卡片自身的倾斜/缩放影响，缓存文档坐标后无需在 mousemove 里读布局。 */
    var el = s.el;
    var node = el;
    var left = 0;
    var top = 0;
    while (node) {
      left += node.offsetLeft || 0;
      top += node.offsetTop || 0;
      node = node.offsetParent;
    }
    s.left = left;
    s.top = top;
    s.w = el.offsetWidth || 1;
    s.h = el.offsetHeight || 1;
  }

  function aim(s, clientX, clientY) {
    var nx = ((clientX + window.pageXOffset - s.left) / s.w) * 2 - 1;
    var ny = ((clientY + window.pageYOffset - s.top) / s.h) * 2 - 1;
    nx = Math.max(-1.15, Math.min(1.15, nx));
    ny = Math.max(-1.15, Math.min(1.15, ny));

    s.tx = -ny * MAX_TILT;
    s.ty = nx * MAX_TILT;
  }

  function write(s, force) {
    var l = s.last;
    var dirty =
      force ||
      !(Math.abs(l.x - s.x) <= EPS) ||
      !(Math.abs(l.y - s.y) <= EPS) ||
      !(Math.abs(l.lift - s.lift) <= 0.001);
    if (dirty) {
      l.x = s.x;
      l.y = s.y;
      l.lift = s.lift;
      /* 每帧只写一个合成属性，避免多个 CSS 变量触发放大样式计算。 */
      s.el.style.transform =
        'translate3d(0, calc(' + s.lift.toFixed(4) + ' * var(--ct-lift-y, -10px)), 0) ' +
        'scale(calc(1 + ' + s.lift.toFixed(4) + ' * var(--ct-zoom, 0.03))) ' +
        'rotateX(' + s.x.toFixed(3) + 'deg) rotateY(' + s.y.toFixed(3) + 'deg)';
    }
  }

  function springCoefficients(dt) {
    /* 欠阻尼弹簧的解析解：不依赖固定帧率，低帧率下也不会积分发散。 */
    var a = ZETA * OMEGA;
    var wd = OMEGA * Math.sqrt(1 - ZETA * ZETA);
    var e = Math.exp(-a * dt);
    var sin = Math.sin(wd * dt);
    var cos = Math.cos(wd * dt);
    var es = e * sin;
    return {
      xx: e * cos + (a / wd) * es,
      xv: es / wd,
      vx: -(OMEGA * OMEGA / wd) * es,
      vv: e * cos - (a / wd) * es
    };
  }

  function step(s, c) {
    if (!s.hover) {
      s.tx = 0;
      s.ty = 0;
    }

    var dx = s.x - s.tx;
    var dy = s.y - s.ty;
    var vx = s.vx;
    var vy = s.vy;
    var goal = s.hover ? 1 : 0;
    var dl = s.lift - goal;
    var vl = s.vLift;

    s.x = s.tx + c.xx * dx + c.xv * vx;
    s.vx = c.vx * dx + c.vv * vx;
    s.y = s.ty + c.xx * dy + c.xv * vy;
    s.vy = c.vx * dy + c.vv * vy;
    s.lift = goal + c.xx * dl + c.xv * vl;
    s.vLift = c.vx * dl + c.vv * vl;

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
    if (dt > 0.05) {
      return 0.05;
    }
    return dt;
  }

  function loop(now) {
    raf = 0;
    var dt = clampDt(now || 0);
    var c = springCoefficients(dt);
    for (var i = activeCards.length - 1; i >= 0; i--) {
      var s = activeCards[i];
      if (!step(s, c)) {
        s.active = false;
        activeCards.splice(i, 1);
      }
    }
    if (activeCards.length) {
      raf = requestAnimationFrame(loop);
    }
  }

  function wake(s) {
    if (!s.active) {
      s.active = true;
      activeCards.push(s);
    }
    kick();
  }

  function kick() {
    if (!raf) {
      lastTime = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function onEnter(s) {
    if (!s.hover) {
      s.hover = true;
      s.el.classList.add(ACTIVE);
      s.el.classList.add(EVADED);
    }
    wake(s);
  }

  function onMove(s, ev) {
    aim(s, ev.clientX, ev.clientY);
    onEnter(s);
  }

  function onLeave(s) {
    s.hover = false;
    s.el.classList.remove(ACTIVE);
    wake(s);
  }

  function bind(s) {
    var el = s.el;
    if (el.getAttribute(BOUND) === '1') {
      return;
    }
    el.setAttribute(BOUND, '1');

    el.addEventListener('mouseenter', function (ev) {
      measure(s);
      aim(s, ev.clientX, ev.clientY);
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
    el.style.removeProperty('transform');
    el.style.removeProperty('--ct-rx');
    el.style.removeProperty('--ct-ry');
    el.style.removeProperty('--ct-lift');
  }

  function reset() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    cards.forEach(function (s) {
      s.active = false;
      cleanup(s.el);
    });
    [].slice.call(document.querySelectorAll('.' + ACTIVE + ', .' + READY + ', .' + EVADED)).forEach(cleanup);
    cards = [];
    activeCards = [];
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
