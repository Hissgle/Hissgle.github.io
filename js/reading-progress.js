/*!
 * reading-progress.js — 顶部阅读进度条
 *
 * Butterfly 主题没有 reading_progress 功能，这里用原生 JS + CSS 自己实现。
 * 样式在 source/css/reading-progress.css。
 *
 * 要点：只在文章详情页显示（靠 #post 是否存在判断），并且监听 pjax:complete，
 * 否则 pjax 换页后会停留在上一页的宽度（这是原先的兼容性 bug）。
 */
!function(){var e=document.getElementById("reading-progress")||document.createElement("div");function t(){if(!document.getElementById("post"))return e.style.width="0%",void(e.style.display="none");e.style.display="block";var t=document.documentElement.scrollHeight-document.documentElement.clientHeight,n=document.documentElement.scrollTop||document.body.scrollTop;e.style.width=t>0?Math.min(n/t*100,100)+"%":"0%"}e.id="reading-progress",document.body.appendChild(e),t(),window.addEventListener("scroll",t),document.addEventListener("pjax:complete",function(){e=document.getElementById("reading-progress")||e,t()})}();