(function () {
  'use strict';

  if (typeof window.requestAnimationFrame !== 'function') { return; }

  var root = document.documentElement;
  var info = null;
  var fadeEnd = 0;
  var rafId = 0;
  var lastP = -1;

  function scrollTop() {
    return window.pageYOffset || root.scrollTop || document.body.scrollTop || 0;
  }

  function measure() {
    if (!info) { return; }
    var topInDoc = info.getBoundingClientRect().top + scrollTop();
    fadeEnd = Math.max(1, topInDoc + info.offsetHeight / 2);
  }

  function ease(p) {
    return p * p * (3 - 2 * p);
  }

  function paint() {
    if (!info) { return; }

    var raw = scrollTop() / fadeEnd;
    if (raw < 0) { raw = 0; }
    if (raw > 1) { raw = 1; }

    var p = ease(raw);
    if (Math.abs(p - lastP) > 0.001 || (raw === 0 && lastP !== 0) || (raw === 1 && lastP !== 1)) {
      lastP = p;
      info.style.setProperty('--hero-p', p.toFixed(4));
    }
  }

  function frame() {
    rafId = 0;
    paint();
  }

  function schedule() {
    if (rafId) { return; }
    rafId = window.requestAnimationFrame(frame);
  }

  function bind() {
    if (info) { info.style.removeProperty('--hero-p'); }
    lastP = -1;
    info = document.querySelector('#page-header.full_page #site-info');

    if (!info) {
      root.classList.remove('hero-fade-on');
      return;
    }

    measure();
    root.classList.add('hero-fade-on');
    paint();
  }

  function onResize() {
    measure();
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize);
  document.addEventListener('pjax:complete', bind);
  document.addEventListener('pjax:success', bind);
})();
