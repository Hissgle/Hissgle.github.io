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
!function(){var e=".recent-post-item, .card-widget, #aside-content, #post, #pagination, #post-comment, .post-copyright, .post",t=95,n=document.documentElement;if(!window.matchMedia||!window.matchMedia("(prefers-reduced-motion: reduce)").matches){n.classList.add("reveal-on");var a=null;"loading"===document.readyState?document.addEventListener("DOMContentLoaded",i):i(),document.addEventListener("pjax:complete",i),document.addEventListener("pjax:success",i)}function o(e,t){"1"!==e.getAttribute("data-reveal-in")&&(e.setAttribute("data-reveal-in","1"),t&&e.style.setProperty("--reveal-delay",t+"ms"))}function r(t){a&&(a.disconnect(),a=null),[].slice.call(document.querySelectorAll(e)).forEach(function(e){e.classList.remove("js-reveal"),e.classList.add("js-reveal-in"),e.style.willChange="auto"}),n.classList.remove("reveal-on"),window.console&&console.warn("[reveal] 滚动渐显动效初始化失败，已回退到普通显示：",t)}function i(){try{!function(){try{var n=window.innerWidth||0;n&&n<768&&(t=70);var i=[].slice.call(document.querySelectorAll(e));if(!i.length)return;var c=window.innerHeight||document.documentElement.clientHeight||800,s=0;if(i.forEach(function(e){e.classList.add("js-reveal");var n=e.getBoundingClientRect();n.top<c&&n.bottom>0&&(o(e,80+s),s+=t)}),"function"!=typeof window.IntersectionObserver)throw new Error("IntersectionObserver unavailable");a&&a.disconnect(),a=new IntersectionObserver(function(e){e.forEach(function(e){if(e.isIntersecting){var t=e.target;o(t,0),t.classList.add("js-reveal-in"),a.unobserve(t),t.addEventListener("transitionend",function(e){e.target===t&&function(e){"1"!==e.getAttribute("data-reveal-done")&&(e.setAttribute("data-reveal-done","1"),e.style.willChange="auto")}(t)})}})},{threshold:.01,rootMargin:"0px 0px -60px 0px"}),i.forEach(function(e){a.observe(e)})}catch(e){r(e)}}(),setTimeout(function(){if(n.classList.contains("reveal-on")){var e=[].slice.call(document.querySelectorAll(".js-reveal")).filter(function(e){return"1"!==e.getAttribute("data-reveal-done")});e.length&&e.forEach(function(e){e.style.setProperty("--reveal-delay","0ms"),e.classList.add("js-reveal-in")})}},3e3)}catch(e){r(e)}}}();