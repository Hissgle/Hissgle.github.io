/*!
 * reveal.js — 滚动渐显
 *
 * 卡片进入视口时从下方 34px 淡入上移（IntersectionObserver 只触发一次）。
 * 样式在 source/css/reveal.css，节奏参数（--reveal-y / --reveal-dur / --reveal-delay）也在那里。
 *
 * 几个要点：
 *   1) 不给卡片套壳加 overflow:hidden —— 主题 .cardHover 自带它，而 .recent-post-item
 *      本身就是那个元素，CSS 变换必须直接加在卡片自己身上。
 *   2) html.reveal-on 由脚本自己加：脚本挂了就不会隐藏卡片，避免 JS 一挂全站白屏。
 *   3) 自己监听 pjax:complete 重新扫描，用属性做幂等。
 *   4) 尊重 prefers-reduced-motion。
 */
(function () {
  var SEL = '.recent-post-item, .card-widget, #aside-content, #post, #pagination, #post-comment, .post-copyright, .post';
  var STAGGER = 95;
  var LEAD = 80;
  var root = document.documentElement;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  /* 打开开关：从这一刻起卡片才隐藏。上面 return 掉了就永远不隐藏。 */
  root.classList.add('reveal-on');

  function mark(el, delay) {
    if (el.getAttribute('data-reveal-in') === '1') {
      return;
    }
    el.setAttribute('data-reveal-in', '1');
    if (delay) {
      el.style.setProperty('--reveal-delay', delay + 'ms');
    }
  }

  /* 动效跑完撤掉 will-change，否则卡片长期占一层合成层，滚动反而更费性能 */
  function dropHint(el) {
    if (el.getAttribute('data-reveal-done') === '1') {
      return;
    }
    el.setAttribute('data-reveal-done', '1');
    el.style.willChange = 'auto';
  }

  var observer = null;

  function init() {
    /* 整个函数体包在 try 里：new IntersectionObserver 在不支持的老浏览器里会直接
       抛错，只包后半段的话这一抛会跳过 onFail，卡片就永久隐藏了。 */
    try {
      var windW = window.innerWidth || 0;
      if (windW && windW < 768) {
        STAGGER = 70;
      }

      var items = [].slice.call(document.querySelectorAll(SEL));
      if (!items.length) {
        return;
      }

      /* 首屏视口内的卡片错开逐张浮出；屏幕外的跟着滚动走，不做延迟 */
      var vh = window.innerHeight || document.documentElement.clientHeight || 800;
      var stagger = 0;
      items.forEach(function (el) {
        el.classList.add('js-reveal');
        var box = el.getBoundingClientRect();
        if (box.top < vh && box.bottom > 0) {
          mark(el, LEAD + stagger);
          stagger += STAGGER;
        }
      });

      if (typeof window.IntersectionObserver !== 'function') {
        throw new Error('IntersectionObserver unavailable');
      }

      if (observer) {
        observer.disconnect();
      }
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }
          var el = entry.target;
          mark(el, 0);
          el.classList.add('js-reveal-in');
          observer.unobserve(el);
          el.addEventListener('transitionend', function (ev) {
            if (ev.target === el) {
              dropHint(el);
            }
          });
        });
      }, {
        /* 阈值取 0.01 是为了让「比屏幕还高的卡片」也能触发（那种卡片交集比例
           永远到不了 0.2）；下边留 60px 让卡片刚露头就开始。 */
        threshold: 0.01,
        rootMargin: '0px 0px -60px 0px'
      });

      items.forEach(function (el) {
        observer.observe(el);
      });
    } catch (err) {
      onFail(err);
    }
  }

  /* 出错就关掉开关，让卡片回到正常显示 —— 宁可没有动效，也不能让内容留在隐藏状态 */
  function onFail(err) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    [].slice.call(document.querySelectorAll(SEL)).forEach(function (el) {
      el.classList.remove('js-reveal');
      el.classList.add('js-reveal-in');
      el.style.willChange = 'auto';
    });
    root.classList.remove('reveal-on');
    if (window.console) {
      console.warn('[reveal] 滚动渐显动效初始化失败，已回退到普通显示：', err);
    }
  }

  function boot() {
    try {
      init();
      /* 看门狗：万一观察器一个回调都没等到，3 秒后无条件放行所有卡片 */
      setTimeout(function () {
        if (!root.classList.contains('reveal-on')) {
          return;
        }
        var stuck = [].slice.call(document.querySelectorAll('.js-reveal'))
          .filter(function (el) {
            return el.getAttribute('data-reveal-done') !== '1';
          });
        if (!stuck.length) {
          return;
        }
        stuck.forEach(function (el) {
          el.style.setProperty('--reveal-delay', '0ms');
          el.classList.add('js-reveal-in');
        });
      }, 3000);
    } catch (err) {
      onFail(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* pjax 换页后 DOM 被整块替换，重新扫描一遍；用属性做幂等 */
  document.addEventListener('pjax:complete', boot);
  document.addEventListener('pjax:success', boot);
})();
