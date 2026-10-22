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
(function () {
  'use strict'

  var CFG = {
    typeSpeed: 60, // 每个字的打字间隔（毫秒），带 ±30% 随机抖动
    backSpeed: 10, // 每个字的回删间隔（毫秒）
    holdDelay: 2200, // 打完一句停留多久再开始回删
    startDelay: 300, // 首次起笔前的延迟
    nextGap: 260, // 回删干净到下一轮起笔的间隔
    fetchTimeout: 8000, // 取新内容的最长等待，超时先用兜底文案顶上
    fallback: '我已随暖春一同离去，但你会熟悉这片天空'
  }

  var state = {
    token: 0, // 每次重启 +1；异步回调靠它判断自己是否已经过期
    timer: null,
    text: '',
    awaiting: false, // true = 正在等主题 fetch 回来的新内容
    resolve: null,
    pending: null
  }

  function subtitleNode () {
    return document.getElementById('subtitle')
  }

  function clearTimer () {
    if (state.timer !== null) {
      clearTimeout(state.timer)
      state.timer = null
    }
  }

  function later (fn, ms) {
    clearTimer()
    state.timer = setTimeout(fn, ms)
  }

  /* 逐字写出 text。每字间隔带一点随机抖动，读起来更像真的在敲键盘 */
  function typeOut (node, text, done) {
    var i = 0
    ;(function step () {
      if (i >= text.length) {
        done()
        return
      }
      node.textContent = text.slice(0, ++i)
      state.timer = setTimeout(step, CFG.typeSpeed * (0.7 + Math.random() * 0.6))
    })()
  }

  /* 逐字删掉 node 里现有的文字 */
  function eraseOut (node, done) {
    ;(function step () {
      var text = node.textContent
      if (!text) {
        done()
        return
      }
      node.textContent = text.slice(0, -1)
      state.timer = setTimeout(step, CFG.backSpeed)
    })()
  }

  /* 把主题给的 content / extra 拼成一句话：正文 —— 出自 xxx */
  function compose (content, extra) {
    var text = ''
    if (typeof content === 'string') text = content
    else if (Array.isArray(content) && content.length > 0) text = content[0]
    if (extra && extra.length > 0) text = text ? text + ' —— ' + extra[0] : extra[0]
    return text
  }

  /*
   * 要一条新内容。内部调用主题的 subtitleType()，它 fetch 完之后会回调
   * processSubtitle（已被我们接管），我们就在这里把结果 resolve 出去。
   * 停留和回删期间这条请求已经在路上，所以回删干净时基本就拿到了。
   */
  function requestNext () {
    if (state.pending) return state.pending

    state.pending = new Promise(function (resolve) {
      var settled = false

      function settle (text) {
        if (settled) return
        settled = true
        state.awaiting = false
        state.resolve = null
        state.pending = null
        resolve(text)
      }

      state.awaiting = true
      state.resolve = settle

      // 接口挂了别让副标题停在空屏上
      setTimeout(function () {
        settle(CFG.fallback)
      }, CFG.fetchTimeout)

      try {
        if (typeof window.subtitleType === 'function') window.subtitleType()
        else settle(CFG.fallback)
      } catch (err) {
        settle(CFG.fallback)
      }
    })

    return state.pending
  }

  /* 一轮：打字 → 停留（同时预取下一条）→ 回删 → 拿到新内容 → 下一轮 */
  function cycle (token, text) {
    var node = subtitleNode()
    if (!node || token !== state.token) return

    typeOut(node, text, function () {
      if (token !== state.token) return

      var next = requestNext()

      later(function () {
        if (token !== state.token) return

        eraseOut(node, function () {
          if (token !== state.token) return

          next.then(function (fresh) {
            if (token !== state.token) return

            state.text = fresh || CFG.fallback
            later(function () {
              if (token !== state.token) return
              cycle(token, state.text)
            }, CFG.nextGap)
          })
        })
      }, CFG.holdDelay)
    })
  }

  /* 起一轮新的循环（首屏、或 pjax 回到首页后） */
  function begin (text) {
    var node = subtitleNode()
    if (!node) return

    var token = ++state.token
    clearTimer()

    state.text = text || CFG.fallback
    state.awaiting = false
    state.resolve = null
    state.pending = null

    node.setAttribute('data-tw', '')
    node.textContent = ''

    later(function () {
      if (token !== state.token) return
      cycle(token, state.text)
    }, CFG.startDelay)
  }

  /* 停掉本页的循环，并让在途的请求回调失效（pjax 切页时用） */
  function stop () {
    state.token++
    clearTimer()
    state.text = ''
    state.awaiting = false
    state.pending = null

    if (state.resolve) {
      var settle = state.resolve
      state.resolve = null
      settle(null)
    }
  }

  /* 主题每拿到一条内容就走到这里 */
  function deliver (text) {
    if (state.awaiting && state.resolve) {
      state.resolve(text)
      return
    }
    // 首轮：还没开始循环过。循环中迟到的返回直接丢弃，不打断正在打的那句
    if (!state.text) begin(text)
  }

  /*
   * 接管主题的 processSubtitle。
   * 正常情况下本脚本排在主题 subtitle 脚本之后执行，此时 fetch 还没回来；
   * pjax 回到首页时主题会重建 typedJSFn，所以 pjax:complete 后再补一次。
   */
  function install () {
    var fn = window.typedJSFn
    if (!fn || fn.__subtitleLoop) return

    fn.__subtitleLoop = true
    fn.processSubtitle = function (content, extra) {
      deliver(compose(content, extra))
    }

    // 极端情况：主题已经抢先用 Typed 打起来了，销毁它、把首条内容接过来
    var typed = window.typed
    if (typed && typeof typed.destroy === 'function') {
      var first = typed.strings && typed.strings[0]
      try {
        typed.destroy()
      } catch (err) {
        /* 实例已经半销毁时 destroy 可能抛，忽略 */
      }
      window.typed = null
      if (typeof first === 'string' && first) begin(first)
    }
  }

  install()

  document.addEventListener('pjax:send', stop)
  document.addEventListener('pjax:complete', function () {
    install()
    // 主题脚本和 pjax 的回调谁先谁后不确定，幂等地再补两次
    setTimeout(install, 60)
    setTimeout(install, 260)
  })
})()
