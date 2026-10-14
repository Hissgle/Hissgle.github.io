/*!
 * vinyl.js — 网易云黑胶唱片播放器
 *
 * 结构（黑胶盘 + 中心标签 + 轴孔 + 唱臂 + 文字）全部由本脚本生成，
 * 样式在 source/css/vinyl.css。
 *
 * 配置通过 #vinyl-player 的 data-vinyl 属性传入（JSON，写在 _config.butterfly.yml 的 inject.bottom）：
 *   type    song 时 id 填歌曲 ID，playlist 时填歌单 ID。填错类型接口返回 500。
 *   server  netease / tencent 等，传给 meting 接口
 *   id      歌曲或歌单 ID（从 https://music.163.com/#/song?id=XXXX 取那串数字）
 *   api     meting 接口地址模板，:server / :type / :id / :r 会被替换
 *   loop    one / all / none
 *   size    唱片直径 px（默认 132）
 *   spin    转一圈的秒数（默认 20）
 *   label   圆心标签颜色（默认 #f3c6d4）
 *
 * 注意：本文件从 YAML 内联拆出来之后不再受「不能写 // 行注释」的限制
 * （Hexo 会把 inject 的换行折叠成空格，导致 // 注释掉后面整段代码）。
 */
!function(){var e=document.getElementById("vinyl-player");if(e&&window.fetch){var t=e.querySelector("audio");if(!t||!t.src){var n;try{n=JSON.parse(e.getAttribute("data-vinyl"))}catch(e){return}var i=n.size||132;e.style.setProperty("--vinyl-size",i+"px"),e.style.setProperty("--vinyl-spin",(n.spin||20)+"s"),n.label&&e.style.setProperty("--vinyl-label",n.label);var a=o("div","vinyl-stage");a.setAttribute("role","button"),a.setAttribute("tabindex","0"),a.setAttribute("aria-label","播放或暂停音乐"),a.appendChild(o("div","vinyl-disc")),a.appendChild(o("div","vinyl-label","VINYL")),a.appendChild(o("div","vinyl-hole")),a.appendChild(o("div","vinyl-arm"));var r=o("b"),l=o("span","vinyl-state"),d=o("span","vinyl-hint");d.appendChild(r),d.appendChild(l),e.appendChild(a),e.appendChild(d);var p=document.createElement("audio");p.preload="metadata",p.loop="none"!==n.loop,p.setAttribute("playsinline",""),e.appendChild(p),a.addEventListener("click",v),a.addEventListener("keydown",function(e){"Enter"!==e.key&&" "!==e.key&&"Spacebar"!==e.key||(e.preventDefault(),v())}),p.addEventListener("play",function(){c(!0)}),p.addEventListener("pause",function(){c(!1)}),p.addEventListener("ended",function(){c(!1)}),p.addEventListener("error",function(){l.textContent="音频加载失败"}),c(!0);var s=(n.api||"https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r").replace(":server",n.server).replace(":type",n.type).replace(":id",n.id).replace(":r",String(Math.random()));fetch(s).then(function(e){return e.json()}).then(function(e){var t=(e||[])[0];t?(p.src=t.url,r.textContent=t.title+(t.author?" - "+t.author:""),r.title=r.textContent,c(!1)):l.textContent="没有拿到歌曲"}).catch(function(e){l.textContent="数据获取失败",console.error("[vinyl] 歌曲数据获取失败："+e+" | "+s)})}}function o(e,t,n){var i=document.createElement(e);return t&&(i.className=t),n&&(i.textContent=n),i}function c(t){t?e.classList.add("is-playing"):e.classList.remove("is-playing")}function v(){if(p.src)if(p.paused){var e=p.play();e&&e.catch&&e.catch(function(){})}else p.pause()}}();