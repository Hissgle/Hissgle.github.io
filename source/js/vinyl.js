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
(function () {
  var root = document.getElementById('vinyl-player');
  if (!root || !window.fetch) {
    return;
  }

  /* 幂等保护：脚本被重跑时不叠出第二个播放器。
     本脚本不带 data-pjax，pjax 换页不会重跑，播放器又在被替换的容器之外，所以音乐不断。 */
  var existing = root.querySelector('audio');
  if (existing && existing.src) {
    return;
  }

  var cfg;
  try {
    cfg = JSON.parse(root.getAttribute('data-vinyl'));
  } catch (e) {
    return;
  }

  var size = cfg.size || 132;
  root.style.setProperty('--vinyl-size', size + 'px');
  root.style.setProperty('--vinyl-spin', (cfg.spin || 20) + 's');
  if (cfg.label) {
    root.style.setProperty('--vinyl-label', cfg.label);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) {
      n.className = cls;
    }
    if (text) {
      n.textContent = text;
    }
    return n;
  }

  /* 结构：黑胶盘 + 中心标签 + 轴孔 + 唱臂 + 文字 */
  var stage = el('div', 'vinyl-stage');
  stage.setAttribute('role', 'button');
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('aria-label', '播放或暂停音乐');
  stage.appendChild(el('div', 'vinyl-disc'));
  stage.appendChild(el('div', 'vinyl-label', 'VINYL'));
  stage.appendChild(el('div', 'vinyl-hole'));
  stage.appendChild(el('div', 'vinyl-arm'));

  var titleEl = el('b');
  var stateEl = el('span', 'vinyl-state');
  var hintEl = el('span', 'vinyl-hint');
  hintEl.appendChild(titleEl);
  hintEl.appendChild(stateEl);

  root.appendChild(stage);
  root.appendChild(hintEl);

  var audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.loop = cfg.loop !== 'none';
  audio.setAttribute('playsinline', '');
  root.appendChild(audio);

  function setPlaying(on) {
    if (on) {
      root.classList.add('is-playing');
    } else {
      root.classList.remove('is-playing');
    }
  }

  function toggle() {
    if (!audio.src) {
      return;
    }
    if (audio.paused) {
      var p = audio.play();
      if (p && p.catch) {
        p.catch(function () {});
      }
    } else {
      audio.pause();
    }
  }

  stage.addEventListener('click', toggle);
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      toggle();
    }
  });

  audio.addEventListener('play', function () {
    setPlaying(true);
  });
  audio.addEventListener('pause', function () {
    setPlaying(false);
  });
  audio.addEventListener('ended', function () {
    setPlaying(false);
  });
  audio.addEventListener('error', function () {
    stateEl.textContent = '音频加载失败';
  });

  setPlaying(true);

  var api = (cfg.api || 'https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r')
    .replace(':server', cfg.server)
    .replace(':type', cfg.type)
    .replace(':id', cfg.id)
    .replace(':r', String(Math.random()));

  fetch(api)
    .then(function (r) {
      return r.json();
    })
    .then(function (list) {
      var t = (list || [])[0];
      if (!t) {
        stateEl.textContent = '没有拿到歌曲';
        return;
      }
      audio.src = t.url;
      titleEl.textContent = t.title + (t.author ? ' - ' + t.author : '');
      titleEl.title = titleEl.textContent;
      setPlaying(false);
    })
    .catch(function (e) {
      stateEl.textContent = '数据获取失败';
      console.error('[vinyl] 歌曲数据获取失败：' + e + ' | ' + api);
    });
})();
