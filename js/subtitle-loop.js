/*!
 * subtitle-loop.js — 首屏副标题：打字机打完一轮，自动换一条新的一言继续打
 *
 * 主题原本的行为（themes/butterfly/layout/includes/third-party/subtitle.pug）：
 * 只 fetch 一次一言，把 [正文, 出自 xxx, 兜底文案] 一起塞给 Typed.js 让它 loop ——
 * 一轮之后永远在复读同一批字符串，不会再请求接口。
 *
 * 这里不改 themes/ 下的文件（主题升级不会丢），只接管它的出口
 * window.typedJSFn.processSubtitle：主题每拿到一条内容就交给我们，
 * 我们按「打字 → 停留 → 回删 → 取一条新的 → 再打字」自己驱动循环。
 *
 * 取新内容复用的是主题输出的全局函数 subtitleType()，所以数据源仍然完全由
 * _config.butterfly.yml 的 subtitle.source 决定（1 = 一言 / 2 = 另一家一言 /
 * 3 = 今日诗词 / 0 = 只用静态 sub 文案），这里不硬编码任何接口。
 *
 * 可调参数在下面的 CFG，光标样式见 /css/subtitle-loop.css。
 */
!function(){"use strict";var t=60,n=10,e=2200,i=300,o=260,u=8e3,r="我已随暖春一同离去，但你会熟悉这片天空",l={token:0,timer:null,text:"",awaiting:!1,resolve:null,pending:null};function s(){return document.getElementById("subtitle")}function a(){null!==l.timer&&(clearTimeout(l.timer),l.timer=null)}function c(t,n){a(),l.timer=setTimeout(t,n)}function f(i,a){var d=s();d&&i===l.token&&function(n,e,i){var o=0;!function u(){o>=e.length?i():(n.textContent=e.slice(0,++o),l.timer=setTimeout(u,t*(.7+.6*Math.random())))}()}(d,a,function(){if(i===l.token){var t=(l.pending||(l.pending=new Promise(function(t){var n=!1;function e(e){n||(n=!0,l.awaiting=!1,l.resolve=null,l.pending=null,t(e))}l.awaiting=!0,l.resolve=e,setTimeout(function(){e(r)},u);try{"function"==typeof window.subtitleType?window.subtitleType():e(r)}catch(t){e(r)}})),l.pending);c(function(){i===l.token&&function(t,e){!function i(){var o=t.textContent;o?(t.textContent=o.slice(0,-1),l.timer=setTimeout(i,n)):e()}()}(d,function(){i===l.token&&t.then(function(t){i===l.token&&(l.text=t||r,c(function(){i===l.token&&f(i,l.text)},o))})})},e)}})}function d(t){var n=s();if(n){var e=++l.token;a(),l.text=t||r,l.awaiting=!1,l.resolve=null,l.pending=null,n.setAttribute("data-tw",""),n.textContent="",c(function(){e===l.token&&f(e,l.text)},i)}}function v(){var t=window.typedJSFn;if(t&&!t.__subtitleLoop){t.__subtitleLoop=!0,t.processSubtitle=function(t,n){var e;e=function(t,n){var e="";return"string"==typeof t?e=t:Array.isArray(t)&&t.length>0&&(e=t[0]),n&&n.length>0&&(e=e?e+" —— "+n[0]:n[0]),e}(t,n),l.awaiting&&l.resolve?l.resolve(e):l.text||d(e)};var n=window.typed;if(n&&"function"==typeof n.destroy){var e=n.strings&&n.strings[0];try{n.destroy()}catch(t){}window.typed=null,"string"==typeof e&&e&&d(e)}}}v(),document.addEventListener("pjax:send",function(){if(l.token++,a(),l.text="",l.awaiting=!1,l.pending=null,l.resolve){var t=l.resolve;l.resolve=null,t(null)}}),document.addEventListener("pjax:complete",function(){v(),setTimeout(v,60),setTimeout(v,260)})}();