/* 右下角「写文章」入口。
   管理端地址从 <script data-admin-url="..."> 读取，改地址只需要改 _config.butterfly.yml，
   或临时在控制台设置 window.BLOG_ADMIN_URL 后刷新。 */
(function () {
  'use strict';

  var HOST_ID = 'write-fab';
  var script =
    document.currentScript ||
    document.getElementById('write-fab-script') ||
    document.querySelector('script[data-admin-url]');
  var configured =
    (script && script.getAttribute('data-admin-url')) || window.BLOG_ADMIN_URL || '';
  var adminUrl = String(configured).trim();

  if (!adminUrl) {
    console.warn('[write-fab] 未配置管理端地址，写作入口不显示');
    return;
  }

  // 只允许 http(s)，避免误填成 javascript: 之类的地址
  if (!/^https?:\/\//i.test(adminUrl)) {
    console.warn('[write-fab] 管理端地址必须以 http(s):// 开头');
    return;
  }

  function mount() {
    if (document.getElementById(HOST_ID)) return;
    if (!document.body) return;

    var link = document.createElement('a');
    link.id = HOST_ID;
    link.href = adminUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', '写文章');
    link.setAttribute('title', '写文章');
    link.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<path d="M12 5v14"></path><path d="M5 12h14"></path></svg>' +
      '<span class="write-fab-label">写文章</span>';

    document.body.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // Pjax 只替换 #body-wrap，正常不会动这个按钮；这里兜底防止某些主题版本把它清掉。
  document.addEventListener('pjax:complete', mount);
})();