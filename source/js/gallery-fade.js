(function () {
  'use strict';

  var SEL = '#article-container .gallery-grid img, #article-container .gallery-group';
  var ON = 'gallery-fade-on';
  var IN = 'gf-in';
  var DONE = 'gf-done';
  var STAGGER = 110;
  var LEAD = 60;
  var MAX_WAIT = 1800;

  var root = document.documentElement;
  var items = [];
  var observer = null;
  var watchdog = 0;

  function probeImg(el) {
    return el.tagName === 'IMG' ? el : el.querySelector('img');
  }

  function ready(el) {
    var img = probeImg(el);
    if (!img) { return true; }
    return img.complete && img.naturalWidth > 1;
  }

  function reveal(item) {
    if (item.shown) { return; }
    item.shown = true;
    item.el.style.setProperty('--gf-delay', (LEAD + item.idx * STAGGER) + 'ms');
    item.el.classList.add(IN);
    item.el.addEventListener('transitionend', function (ev) {
      if (ev.target === item.el) { item.el.classList.add(DONE); }
    });
  }

  function attempt(item) {
    if (item.shown || !item.seen || !ready(item.el)) { return; }
    reveal(item);
  }

  function find(el) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].el === el) { return items[i]; }
    }
    return null;
  }

  function reset() {
    if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
    if (observer) { observer.disconnect(); observer = null; }
    items.forEach(function (item) {
      item.listenOn.removeEventListener('load', item.onLoad);
      item.listenOn.removeEventListener('error', item.onLoad);
    });
    items = [];
  }

  function onFail(err) {
    reset();
    root.classList.remove(ON);
    if (window.console) { console.warn('[gallery-fade] 图集入场动效初始化失败，已回退到普通显示：', err); }
  }

  function boot() {
    try {
      run();
    } catch (err) {
      onFail(err);
    }
  }

  function run() {
    reset();

    var nodes = [].slice.call(document.querySelectorAll(SEL));
    if (!nodes.length) {
      root.classList.remove(ON);
      return;
    }

    root.classList.add(ON);

    var useIO = typeof window.IntersectionObserver === 'function';

    items = nodes.map(function (el, idx) {
      var item = {
        el: el,
        idx: idx,
        seen: !useIO,
        shown: el.classList.contains(IN)
      };
      item.listenOn = probeImg(el) || el;
      item.onLoad = function () { attempt(item); };
      item.listenOn.addEventListener('load', item.onLoad);
      item.listenOn.addEventListener('error', item.onLoad);
      return item;
    });

    if (useIO) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) { return; }
          observer.unobserve(entry.target);
          var item = find(entry.target);
          if (!item) { return; }
          item.seen = true;
          attempt(item);
        });
      }, { threshold: 0.01, rootMargin: '0px 0px -40px 0px' });
      items.forEach(function (item) { observer.observe(item.el); });
    }

    items.forEach(attempt);

    watchdog = setTimeout(function () {
      items.forEach(function (item) {
        if (item.seen && !item.shown) { reveal(item); }
      });
    }, MAX_WAIT);
  }

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }

  boot();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  }

  document.addEventListener('pjax:complete', boot);
  document.addEventListener('pjax:success', boot);
})();
