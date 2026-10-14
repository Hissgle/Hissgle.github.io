/*!
 * nav-title.js — 顶栏左上角显示 HISSGLE
 *
 * config.title 是 WELCOME（浏览器标签页和首屏大标题都用它），
 * 但顶栏要显示 HISSGLE，所以在自定义层单独把顶栏这一处覆盖掉。
 *
 * 只选 .nav-site-title 里的 —— #blog-info 下还有 .nav-page-title
 * （文章页吸顶时显示的文章标题 + 返回首页），那里的 .site-name 不能碰。
 */
!function(){function t(){var t=document.querySelector("#blog-info .nav-site-title .site-name");t&&"HISSGLE"!==t.textContent.trim()&&(t.textContent="HISSGLE")}t(),document.addEventListener("pjax:complete",t),document.addEventListener("pjax:success",t)}();