(function () {
  var DIALOG_SEL = '#local-search .search-dialog';

  function boot() {
    var dialog = document.querySelector(DIALOG_SEL);
    if (!dialog || dialog.getAttribute('data-sb-ready') === '1') return;
    dialog.setAttribute('data-sb-ready', '1');

    var inputWrap = dialog.querySelector('.local-search-input');
    var input = inputWrap && inputWrap.querySelector('input');
    var results = document.getElementById('local-search-results');
    var stats = document.getElementById('local-search-stats');
    var mask = document.getElementById('search-mask');
    var closeBtn = dialog.querySelector('.search-close-button');
    if (!input) return;

    var title = dialog.querySelector('.search-dialog-title');
    if (title && !title.querySelector('.sb-title-icon')) {
      var titleIcon = document.createElement('i');
      titleIcon.className = 'fas fa-search sb-title-icon';
      titleIcon.setAttribute('aria-hidden', 'true');
      title.insertBefore(titleIcon, title.firstChild);
    }

    var fieldIcon = document.createElement('i');
    fieldIcon.className = 'fas fa-search sb-field-icon';
    fieldIcon.setAttribute('aria-hidden', 'true');
    inputWrap.appendChild(fieldIcon);

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'sb-clear';
    clearBtn.setAttribute('aria-label', '清空输入');
    clearBtn.hidden = true;
    clearBtn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    inputWrap.appendChild(clearBtn);

    function syncClear() {
      clearBtn.hidden = !input.value;
    }

    function fireInput() {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    clearBtn.addEventListener('click', function () {
      input.value = '';
      syncClear();
      fireInput();
      input.focus();
    });

    input.addEventListener('input', function () {
      syncClear();
      clearActive();
      syncEmpty();
    });

    var emptyBox = document.createElement('div');
    emptyBox.className = 'sb-empty-box';
    emptyBox.innerHTML =
      '<i class="fas fa-search" aria-hidden="true"></i>' +
      '<p>没有找到相关内容</p>' +
      '<span>换个关键词再试试？</span>';
    if (stats) {
      dialog.insertBefore(emptyBox, stats);
    } else {
      dialog.appendChild(emptyBox);
    }

    function syncEmpty() {
      var hasResult = !!(results && results.querySelector('.search-result-list'));
      var hasQuery = input.value.trim() !== '';
      var hasStats = !!(stats && stats.textContent.trim());
      dialog.classList.toggle('sb-empty', !hasResult && hasQuery && hasStats);
    }

    function itemList() {
      return [].slice.call(dialog.querySelectorAll('.local-search-hit-item'));
    }

    function clearActive() {
      itemList().forEach(function (el) {
        el.classList.remove('sb-active');
      });
    }

    function move(step) {
      var list = itemList();
      if (!list.length) return;
      var cur = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].classList.contains('sb-active')) {
          cur = i;
          break;
        }
      }
      var next = cur < 0 ? (step > 0 ? 0 : list.length - 1) : (cur + step + list.length) % list.length;
      clearActive();
      var el = list[next];
      el.classList.add('sb-active');
      if (el.scrollIntoView) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }

    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter') {
        var active = dialog.querySelector('.local-search-hit-item.sb-active a');
        if (active) {
          e.preventDefault();
          active.click();
        }
      }
    });

    var closingTimer = null;
    var closeWatchdog = null;
    var closing = false;
    var openIntent = false;
    var searchBtn = document.querySelector('#search-button');

    function syncAnim() {
      var name = dialog.style.animationName || '';
      if (name === 'search_close') {
        closing = true;
        dialog.classList.remove('sb-open');
        dialog.classList.add('sb-closing');
        clearTimeout(closingTimer);
        closingTimer = setTimeout(function () {
          dialog.classList.remove('sb-closing', 'sb-open');
        }, 600);
      } else if (dialog.style.display === 'block') {
        closing = false;
        clearTimeout(closingTimer);
        dialog.classList.remove('sb-closing');
        dialog.classList.add('sb-open');
      } else {
        closing = false;
        clearTimeout(closeWatchdog);
        resetInput();
      }
    }

    function resetInput() {
      if (!input.value) return;
      input.value = '';
      syncClear();
      fireInput();
      clearActive();
      syncEmpty();
    }

    function hideAll() {
      dialog.classList.remove('sb-open', 'sb-closing');
      dialog.style.animation = '';
      dialog.style.display = '';
      if (mask) {
        mask.style.animation = '';
        mask.style.display = '';
      }
    }

    function forceCloseIfStuck() {
      clearTimeout(closeWatchdog);
      closeWatchdog = setTimeout(function () {
        if (openIntent) return;
        if (dialog.style.display !== 'block' && (!mask || mask.style.display !== 'block')) return;
        hideAll();
      }, 900);
    }

    if (typeof MutationObserver === 'function') {
      new MutationObserver(syncAnim).observe(dialog, {
        attributes: true,
        attributeFilter: ['style']
      });
    }

    dialog.addEventListener('animationend', function (e) {
      if (e.pseudoElement) return;
      if (closing && e.animationName === 'sb-pop-out') {
        dialog.classList.remove('sb-closing', 'sb-open');
      }
      if (openIntent) e.stopImmediatePropagation();
    });

    if (mask) {
      mask.addEventListener('animationend', function (e) {
        if (e.pseudoElement) return;
        if (openIntent) e.stopImmediatePropagation();
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', function () {
        openIntent = true;
        clearTimeout(closeWatchdog);
      });
    }

    if (mask) {
      mask.addEventListener('click', function (e) {
        if (searchBtn) {
          var r = searchBtn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 &&
            e.clientX >= r.left && e.clientX <= r.right &&
            e.clientY >= r.top && e.clientY <= r.bottom) {
            e.stopImmediatePropagation();
            e.preventDefault();
            input.focus();
            return;
          }
        }
        openIntent = false;
        forceCloseIfStuck();
      }, true);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        openIntent = false;
        forceCloseIfStuck();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.code === 'Escape') {
        openIntent = false;
        forceCloseIfStuck();
      }
    });

    if (typeof MutationObserver === 'function') {
      var listObserver = new MutationObserver(syncEmpty);
      if (results) listObserver.observe(results, { childList: true });
      if (stats) listObserver.observe(stats, { childList: true });
    }

    syncEmpty();
  }

  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('load', boot);
  }
})();
