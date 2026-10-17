/*!
 * cover-zoom.js — 点首页博文卡片时，封面平滑放大铺满屏幕，再进入文章页
 *
 * 流程：
 *   1. 点封面或标题 → 把封面图复制进 fixed 层 #cz-stage，起始位置/大小/圆角
 *      精确等于卡片上那张封面，然后平滑放大到铺满整个视口；
 *   2. Pjax 在底层完成页面切换（本层在 #body-wrap 之外，不受替换影响）；
 *   3. 铺满停稳后，把过渡层收进文章页顶部的 banner（仅当 banner 用的是同一张
 *      图；两者都是居中 cover 裁切，所以能无缝衔接），最后淡出移除。
 *
 * 依赖：主题开启 Pjax（本站在 _config.butterfly.yml 中已开）。
 * 参数在下面 CFG / GROW_EASE / SETTLE_EASE。控制台调试：window.coverZoom。
 * 关闭整个效果：注释掉 _config.butterfly.yml 里加载本文件的 <script> 即可。
 */
(function () {
  'use strict';

  var CFG = {
    GROW: 380,         // 封面放大到铺满的时长（ms）
    HOLD: 90,          // 铺满后至少停留的时长，留给 Pjax 完成（ms）
    SETTLE: 260,       // 收进文章 banner 的时长（ms）
    FADE: 170,         // 收尾淡出时长（ms）
    DIM: 0.45,         // 放大过程中页面变暗程度（0 ~ 1）
    SAFE_NO_NAV: 3500, // 迟迟没有 Pjax 导航（如未命中）就放弃（ms）
    SAFE_NAV: 9000     // 已有导航但迟迟没完成的兜底（ms）
  };
  var GROW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'; // 快进慢出
  var SETTLE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'; // 平滑收拢
  var ZERO_CLIP = 'inset(0px 0px 0px 0px round 0px 0px 0px 0px)';

  var stage = null;
  var dim = null;
  var st = null; // 当前过渡的状态；null = 没有进行中的过渡

  function now() { return Date.now(); }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function absUrl(u) {
    if (!u) { return ''; }
    try { return new URL(u, window.location.href).href; } catch (e) { return ''; }
  }

  function px(v) { return (Math.round(v * 100) / 100) + 'px'; }

  function pxv(s) {
    var v = parseFloat(s);
    return isFinite(v) ? v : 0;
  }

  function same(a, b) { return Math.abs(a - b) <= 2; }

  // 悬停卡片时提前把封面「整张解好码」：否则放大瞬间浏览器可能还在用小尺寸位图
  // 重采样，画面会先糊一下再变清楚（对未加载的卡片用 data-lazy-src 提前进缓存）。
  // 每个地址只做一次。
  var decoded = Object.create(null);

  function preload(item) {
    var img = item.querySelector('.post_cover img.post-bg');
    if (!img) { return; }
    var url = img.getAttribute('data-lazy-src') || img.currentSrc || img.src;
    if (!url || /^data:/.test(url) || decoded[url]) { return; }
    decoded[url] = true;
    var pre = new Image();
    pre.decoding = 'async';
    pre.src = url;
    if (pre.decode) { pre.decode().catch(function () {}); }
  }

  // 点击目标 → 找出能触发过渡的卡片、封面与其图片地址
  function pick(ev) {
    var t = ev.target;
    if (!t || !t.closest) { return null; }

    var a = t.closest('a');
    if (!a) { return null; }

    var item = a.closest('.recent-post-item');
    if (!item || item.classList.contains('ads-wrap')) { return null; }

    // 只认「看点」：封面链接或标题链接。分类/标签/评论数等链接不触发
    if (!a.closest('.post_cover') && !a.classList.contains('article-title')) { return null; }

    var cover = item.querySelector('.post_cover');
    var img = cover && cover.querySelector('img.post-bg');
    if (!img || !img.complete || img.naturalWidth <= 1) { return null; }

    // 懒加载还没把真图换进来时（src 还是 1px 占位图）不做动画，正常跳转
    var url = img.currentSrc || img.src;
    if (!url || /^data:/.test(url)) { return null; }

    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('#') > -1) { return null; }
    if (/^\s*(mailto:|tel:|javascript:)/i.test(href)) { return null; }
    var abs = absUrl(a.href);
    if (!abs || abs.indexOf(window.location.origin) !== 0) { return null; }

    return { item: item, cover: cover, img: img, url: url };
  }

  // 只有和 .recent-post-item 重合的那几个角才跟着卡片圆角，其余角是直角
  function cornerRadii(rc, rit, cs) {
    var r = [
      pxv(cs.borderTopLeftRadius),
      pxv(cs.borderTopRightRadius),
      pxv(cs.borderBottomRightRadius),
      pxv(cs.borderBottomLeftRadius)
    ];
    return [
      same(rc.left, rit.left) && same(rc.top, rit.top) ? r[0] : 0,
      same(rc.right, rit.right) && same(rc.top, rit.top) ? r[1] : 0,
      same(rc.right, rit.right) && same(rc.bottom, rit.bottom) ? r[2] : 0,
      same(rc.left, rit.left) && same(rc.bottom, rit.bottom) ? r[3] : 0
    ];
  }

  function start(picked) {
    // 点下去先把悬停倾斜/抬起归零再测量：否则量到的是 3D 投影的包围盒，
    // 会比摆正的封面大几个百分点，过渡起点对不齐（读数前读一次布局即生效）
    picked.item.style.setProperty('--ct-lift', '0');
    picked.item.style.setProperty('--ct-rx', '0deg');
    picked.item.style.setProperty('--ct-ry', '0deg');

    var ri = picked.img.getBoundingClientRect();
    var rc = picked.cover.getBoundingClientRect();
    var rit = picked.item.getBoundingClientRect();
    if (ri.width < 40 || ri.height < 40) { return; }

    var vw = window.innerWidth;
    var vh = window.innerHeight;

    st = {
      url: absUrl(picked.url),
      growEnd: now() + CFG.GROW,
      navStarted: false,
      navDone: false,
      settled: false,
      finished: false,
      timers: []
    };

    dim = document.createElement('div');
    dim.id = 'cz-dim';
    dim.setAttribute('aria-hidden', 'true');

    stage = document.createElement('div');
    stage.id = 'cz-stage';
    stage.setAttribute('aria-hidden', 'true');

    var copy = document.createElement('img');
    copy.src = picked.url; // 与封面同地址，命中缓存，不会出现空白帧
    copy.alt = '';
    copy.draggable = false;
    stage.appendChild(copy);

    // 悬停时多半已预解码过，这里再踢一次，确保起跑时就是全分辨率位图
    if (copy.decode) { copy.decode().catch(function () {}); }

    // 起始几何：封面 img 的实测矩形（更贴近用户点下去那一刻看到的位置）
    stage.style.left = px(ri.left);
    stage.style.top = px(ri.top);
    stage.style.width = px(ri.width);
    stage.style.height = px(ri.height);

    // 起始裁剪：收在 .post_cover 的矩形里；圆角只留在卡片外侧（内侧是直角）
    var radii = cornerRadii(rc, rit, window.getComputedStyle(picked.item));
    stage.style.clipPath = 'inset(' +
      px(rc.top - ri.top) + ' ' + px(ri.right - rc.right) + ' ' +
      px(ri.bottom - rc.bottom) + ' ' + px(rc.left - ri.left) +
      ' round ' + radii.map(px).join(' ') + ')';

    document.body.appendChild(dim);
    document.body.appendChild(stage);

    // 先让起始状态生效一帧，再写目标值，过渡才会从卡片出发。
    // rAF 为主；个别环境（后台标签页 / 被遮挡的窗口）会暂停 rAF，用定时器兜底。
    void stage.offsetHeight;
    var applied = false;
    var apply = function () {
      if (applied || !st || !stage || !dim) { return; }
      applied = true;
      st.growEnd = now() + CFG.GROW; // 以实际开跑时刻为准，安全兜底据此顺延

      stage.style.transition =
        'left ' + CFG.GROW + 'ms ' + GROW_EASE +
        ', top ' + CFG.GROW + 'ms ' + GROW_EASE +
        ', width ' + CFG.GROW + 'ms ' + GROW_EASE +
        ', height ' + CFG.GROW + 'ms ' + GROW_EASE +
        ', clip-path ' + CFG.GROW + 'ms ' + GROW_EASE;
      stage.style.left = '0px';
      stage.style.top = '0px';
      stage.style.width = vw + 'px';
      stage.style.height = vh + 'px';
      stage.style.clipPath = ZERO_CLIP;

      dim.style.transition = 'opacity ' + Math.round(CFG.GROW * 1.15) + 'ms linear';
      dim.style.opacity = CFG.DIM;
    };
    window.requestAnimationFrame(apply);
    st.timers.push(window.setTimeout(apply, 32));

    // 安全网：没等到导航 / 导航迟迟不完成，都干净退场，绝不让用户困在过渡层里
    st.timers.push(window.setTimeout(function () {
      if (st && !st.navStarted && !st.navDone) { fade(); }
    }, CFG.SAFE_NO_NAV));
    st.timers.push(window.setTimeout(function () {
      if (st && !st.navDone) { fade(); }
    }, CFG.SAFE_NAV));
  }

  // 等到「已铺满 + 最少停留」后再执行
  function whenGrown(fn) {
    var wait = Math.max(0, st.growEnd + CFG.HOLD - now());
    st.timers.push(window.setTimeout(fn, wait));
  }

  // 页头 banner 的内联 background-image 地址，转成绝对地址便于比较
  function bannerUrl(header) {
    var raw = (header.style.backgroundImage || '').trim();
    var m = /^url\(["']?(.*?)["']?\)$/i.exec(raw);
    return m ? absUrl(m[1]) : '';
  }

  // Pjax 完成后：把过渡层收进文章页顶部的同一张 banner，然后淡出
  function settle() {
    if (!st || st.settled || st.finished) { return; }
    st.settled = true;

    var header = document.querySelector('#page-header.post-bg');
    var hr = header && header.getBoundingClientRect();

    // 页头不存在、太矮、或用的不是同一张图 → 跳过「落进 banner」，直接淡出
    if (!hr || hr.height < 40 || bannerUrl(header) !== st.url) { fade(); return; }

    stage.style.transition =
      'left ' + CFG.SETTLE + 'ms ' + SETTLE_EASE +
      ', top ' + CFG.SETTLE + 'ms ' + SETTLE_EASE +
      ', width ' + CFG.SETTLE + 'ms ' + SETTLE_EASE +
      ', height ' + CFG.SETTLE + 'ms ' + SETTLE_EASE;
    stage.style.left = px(hr.left);
    stage.style.top = px(hr.top);
    stage.style.width = px(hr.width);
    stage.style.height = px(hr.height);

    st.timers.push(window.setTimeout(fade, CFG.SETTLE + 40));
  }

  function fade() {
    if (!st || st.finished) { return; }
    st.finished = true;
    if (!stage || !dim) { cleanup(); return; }

    stage.style.transition = 'opacity ' + CFG.FADE + 'ms linear';
    dim.style.transition = 'opacity ' + CFG.FADE + 'ms linear';
    stage.style.opacity = '0';
    dim.style.opacity = '0';

    st.timers.push(window.setTimeout(cleanup, CFG.FADE + 60));
  }

  function cleanup() {
    if (st) { st.timers.forEach(window.clearTimeout); }
    if (stage && stage.parentNode) { stage.parentNode.removeChild(stage); }
    if (dim && dim.parentNode) { dim.parentNode.removeChild(dim); }
    stage = null;
    dim = null;
    st = null;
  }

  function onClick(ev) {
    if (st) { return; } // 过渡进行中：忽略（此时输入也被 #cz-dim 挡着）
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) { return; }
    if (reducedMotion()) { return; }
    var picked = pick(ev);
    if (!picked) { return; }
    try {
      start(picked);
    } catch (err) {
      if (window.console) { console.warn('[cover-zoom] 过渡启动失败，按普通方式打开：', err); }
      fade();
    }
  }

  // 捕获阶段挂监听：只观察，不阻止默认行为，Pjax 照常接管导航
  document.addEventListener('click', onClick, true);

  // 指针悬停到卡片上就预解码封面（触摸屏的 tap 不算，做也来不及）
  document.addEventListener('pointerover', function (ev) {
    if (ev.pointerType === 'touch') { return; }
    var t = ev.target;
    var item = t && t.closest && t.closest('.recent-post-item');
    if (item) { preload(item); }
  });

  document.addEventListener('pjax:send', function () {
    if (st) { st.navStarted = true; }
  });
  document.addEventListener('pjax:complete', function () {
    if (!st || st.navDone) { return; }
    st.navDone = true;
    whenGrown(settle);
  });
  document.addEventListener('pjax:error', function () {
    if (st && !st.navDone) { fade(); }
  });

  // 调试入口：window.coverZoom.active() 查看是否在过渡中，abort() 立即中止
  window.coverZoom = {
    active: function () { return !!st; },
    abort: fade
  };
})();
