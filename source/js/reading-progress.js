/*!
 * reading-progress.js — 顶部阅读进度条
 *
 * Butterfly 主题没有 reading_progress 功能，这里用原生 JS + CSS 自己实现。
 * 样式在 source/css/reading-progress.css。
 *
 * 要点：只在文章详情页显示（靠 #post 是否存在判断），并且监听 pjax:complete，
 * 否则 pjax 换页后会停留在上一页的宽度（这是原先的兼容性 bug）。
 */
(function () {
  var bar = document.getElementById('reading-progress') || document.createElement('div');
  bar.id = 'reading-progress';
  document.body.appendChild(bar);

  function update() {
    var post = document.getElementById('post');
    if (!post) {
      bar.style.width = '0%';
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'block';
    var h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var t = document.documentElement.scrollTop || document.body.scrollTop;
    if (h > 0) {
      bar.style.width = Math.min((t / h) * 100, 100) + '%';
    } else {
      bar.style.width = '0%';
    }
  }

  update();
  window.addEventListener('scroll', update);
  document.addEventListener('pjax:complete', function () {
    bar = document.getElementById('reading-progress') || bar;
    update();
  });
})();
