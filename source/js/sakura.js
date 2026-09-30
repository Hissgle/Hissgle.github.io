/*!
 * sakura.js — 樱花飘落 + 鼠标划过扬起花瓣
 *
 * 配置通过 script 标签的 data-* 传入（见 _config.butterfly.yml 的 inject.bottom）：
 *   data-mobile      是否在窄屏启用（默认 false）
 *   data-density     飘落密度（默认 0.00007）
 *   data-trail       是否启用「划过推开花瓣」（默认 true）
 *   data-push        推开力度（默认 9）
 *   data-pushradius  影响半径 px（默认 110）
 *   data-color       基础花瓣色（默认 #ffc0d0）
 *   data-zindex      绘制层级（默认 1）
 * 用 data-* 而不是内联 window.SAKURA_CONFIG，是因为内联脚本里的 { } 在 YAML 里会有解析歧义。
 *
 * 控制台调试：window.sakura.petalCount() / pushedCount() / destroy()
 */
(function () {
  'use strict'

  if (window.__sakuraLoaded) return
  window.__sakuraLoaded = true

  // 优先读 window.SAKURA_CONFIG（测试用），否则读本标签的 data-*
  function attr (name, fallback) {
    var el = document.currentScript
    if (!el && document.getElementById) el = document.getElementById('sakura-js')
    if (!el || !el.getAttribute) return fallback
    var v = el.getAttribute('data-' + name)
    return v === null || v === '' ? fallback : v
  }

  var CFG = window.SAKURA_CONFIG || {}
  function pick (key, dataName, fallback) {
    if (CFG[key] !== undefined) return CFG[key]
    return attr(dataName || key, fallback)
  }

  var MOBILE = String(pick('mobile', 'mobile', 'false')) === 'true'
  var TRAIL = String(pick('trail', 'trail', 'true')) !== 'false'
  var ZINDEX = parseInt(pick('zIndex', 'zindex', '1'), 10) || 1
  var BASE_COLOR = pick('color', 'color', '#ffc0d0')
  var dRaw = parseFloat(pick('density', 'density', '0.00007'))
  var DENSITY = dRaw > 0 ? dRaw : 0.00007

  if (!MOBILE && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  // 先探测 canvas 2d：颜色解析也要用 canvas，而 GPU 不可用 / 隐私模式 / 老浏览器里
  // getContext('2d') 会返回 null。探测不过就干净退出，不留残留节点也不抛异常。
  var probe = document.createElement('canvas')
  var probeCtx = probe && probe.getContext ? probe.getContext('2d') : null
  if (!probeCtx) return

  var TWO_PI = Math.PI * 2
  function rand (min, max) { return min + Math.random() * (max - min) }
  function randInt (min, max) { return Math.floor(rand(min, max + 1)) }

  function clamp (v, min, max) { return v < min ? min : (v > max ? max : v) }

  // 允许传 CSS 颜色或 hex，统一转成 hex 才能做深浅变化
  function toHex (color) {
    var canvasEl = document.createElement('canvas')
    var c = canvasEl && canvasEl.getContext ? canvasEl.getContext('2d') : null
    if (!c) return '#ffc0d0'
    c.fillStyle = '#ffc0d0'
    try { c.fillStyle = color } catch (e) { /* 无效值退回默认 */ }
    var s = c.fillStyle
    if (s.charAt(0) === '#') return s
    var m = s.match(/\d+/g)
    if (!m) return '#ffc0d0'
    return '#' + m.slice(0, 3).map(function (n) {
      var h = parseInt(n, 10).toString(16)
      return h.length === 1 ? '0' + h : h
    }).join('')
  }

  function shade (hex, amount) {
    var num = parseInt(hex.slice(1), 16)
    var r = (num >> 16) & 255
    var g = (num >> 8) & 255
    var b = num & 255
    r = clamp(Math.round(r + amount), 0, 255)
    g = clamp(Math.round(g + amount), 0, 255)
    b = clamp(Math.round(b + amount), 0, 255)
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  }

  var HEX = toHex(BASE_COLOR)
  // 生成一组深浅不同的色调，避免全场一个颜色显得假
  var PALETTE = [
    shade(HEX, 0), shade(HEX, -18), shade(HEX, 14),
    shade(HEX, -34), shade(HEX, 30), shade(HEX, -8)
  ]

  var canvas = document.createElement('canvas')
  canvas.id = 'sakura-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  var st = canvas.style
  st.position = 'fixed'
  st.top = '0'
  st.left = '0'
  st.width = '100%'
  st.height = '100%'
  st.pointerEvents = 'none' // 不挡任何点击
  st.zIndex = String(ZINDEX)
  document.body.appendChild(canvas)

  var ctx = canvas.getContext('2d')
  if (!ctx) {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
    return
  }

  var w = 0
  var h = 0
  var dpr = Math.min(window.devicePixelRatio || 1, 2)

  function resize () {
    w = window.innerWidth || document.documentElement.clientWidth || 0
    h = window.innerHeight || document.documentElement.clientHeight || 0
    canvas.width = Math.max(1, Math.floor(w * dpr))
    canvas.height = Math.max(1, Math.floor(h * dpr))
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()

  // 花瓣轮廓：底部圆润、顶端带一个小缺口。缺口直接写进路径里（而不是用
  // destination-out 擦除），这样配合 ctx.scale 压扁时不会擦掉已绘制的内容。
  // notch 控制缺口深度，0 为完整花瓣。
  function drawPetal (c, size, color, alpha, notch) {
    var s = size
    var d = s * 0.5 * (notch == null ? 0.5 : notch)
    c.save()
    c.globalAlpha = alpha
    c.fillStyle = color
    c.beginPath()
    c.moveTo(0, -s)
    c.lineTo(-s * 0.30, -s + d)
    c.lineTo(0, -s * 0.58)
    c.lineTo(s * 0.30, -s + d)
    c.bezierCurveTo(s * 1.05, -s * 0.75, s * 0.62, s * 0.52, 0, s)
    c.bezierCurveTo(-s * 0.62, s * 0.52, -s * 1.05, -s * 0.75, 0, -s)
    c.closePath()
    c.fill()

    // 一点高光，避免花瓣像纯色纸片
    c.globalAlpha = alpha * 0.28
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.ellipse(-s * 0.22, s * 0.12, s * 0.24, s * 0.42, -0.4, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }

  var petals = []
  var FRAME_MS = 1000 / 60

  function newPetal (fromTop) {
    var size = rand(7, 15)
    return {
      x: rand(-60, w + 60),
      y: fromTop ? rand(-60, -10) : rand(-10, h),
      size: size,
      vy: rand(0.5, 1.15) * (size / 12), // 小花瓣更轻更慢
      px: 0, // 被划开时累积的额外速度，随时间阻尼衰减
      py: 0,
      push: 0, // 被推开的程度 0~1，用于放大摆动和旋转
      pushSpin: 0,
      swayAmp: rand(18, 46),
      swayPhase: rand(0, TWO_PI),
      swaySpeed: rand(0.012, 0.026),
      rot: rand(0, TWO_PI),
      vr: rand(-0.014, 0.014),
      color: PALETTE[randInt(0, PALETTE.length - 1)],
      alpha: rand(0.55, 0.95),
      flip: rand(0, TWO_PI), // 3D 翻转，看起来像在自转
      flipSpeed: rand(0.012, 0.03)
    }
  }

  function spawnFor (dt) {
    var target = Math.min(120, Math.round(w * h * DENSITY))
    var want = Math.min(3, Math.max(0, target - petals.length))
    for (var i = 0; i < want; i++) {
      if (Math.random() < 0.75 * (dt / FRAME_MS) + 0.25) petals.push(newPetal(true))
    }
  }

  function drawPetalItem (p) {
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    // 用 cos(flip) 压缩横向宽度模拟自转
    var sq = Math.cos(p.flip)
    var squash = 0.3 + Math.abs(sq) * 0.7
    ctx.scale(squash, 1)
    drawPetal(ctx, p.size, p.color, p.alpha, Math.abs(sq))
    ctx.restore()
  }

  // 鼠标划过不生成新花瓣，只把半径内已有的花瓣推开、散开，随后慢慢恢复
  var mouse = { x: 0, y: 0, active: false }

  var RADIUS = parseFloat(pick('pushRadius', 'pushradius', '110'))
  if (!(RADIUS > 0)) RADIUS = 110
  var PUSH = parseFloat(pick('push', 'push', '9'))
  if (!(PUSH > 0)) PUSH = 9

  var pushedCount = 0

  function onMove (e) {
    mouse.x = e.clientX
    mouse.y = e.clientY
    mouse.active = true
  }
  function onLeave () { mouse.active = false }
  function onEnter (e) {
    mouse.x = e.clientX
    mouse.y = e.clientY
    mouse.active = true
  }

  function repulse (p, k) {
    var dx = p.x - mouse.x
    var dy = p.y - mouse.y
    var rr = RADIUS + p.size * 0.6 // 用花瓣尺寸微调半径，让大小花瓣手感接近
    if (dx > rr || dx < -rr || dy > rr || dy < -rr) return false

    var d2 = dx * dx + dy * dy
    if (d2 > rr * rr) return false

    var d = Math.sqrt(d2) || 0.001
    var nx = dx / d
    var ny = dy / d

    // 距离越近推力越大；重叠时加个下限避免力趋向无穷
    var t = 1 - d / rr
    var force = PUSH * t * t * k

    if (d < p.size) {
      var overlap = p.size - d
      p.x += nx * overlap
      p.y += ny * overlap
    }

    p.px += nx * force
    p.py += ny * force - force * 0.18 // 略微上飘，像被风带起
    // 转得更快，看起来是被"拨动"而不是平移
    p.pushSpin = (p.pushSpin || 0) + (Math.random() < 0.5 ? -1 : 1) * force * 0.05
    p.push = Math.min(1, (p.push || 0) + t * 0.55)
    return true
  }

  var raf = 0
  var last = 0
  var running = true

  function tick (t) {
    if (!running) return
    var dt = last ? Math.min(48, t - last) : FRAME_MS // 卡顿/切后台回来时限幅
    last = t

    ctx.clearRect(0, 0, w, h)

    spawnFor(dt)
    var k = dt / FRAME_MS
    pushedCount = 0
    for (var i = petals.length - 1; i >= 0; i--) {
      var p = petals[i]

      if (TRAIL && mouse.active) {
        if (repulse(p, k)) pushedCount++
      }

      // 划开的速度随时间阻尼衰减
      if (p.px || p.py) {
        p.px *= Math.pow(0.90, k)
        p.py *= Math.pow(0.90, k)
        if (Math.abs(p.px) < 0.01) p.px = 0
        if (Math.abs(p.py) < 0.01) p.py = 0
      }

      if (p.push) {
        p.push *= Math.pow(0.94, k)
        if (p.push < 0.01) p.push = 0
      }
      if (p.pushSpin) {
        p.rot += p.pushSpin * k
        p.pushSpin *= Math.pow(0.90, k)
        if (Math.abs(p.pushSpin) < 0.0005) p.pushSpin = 0
      }

      p.swayPhase += p.swaySpeed * k
      p.flip += p.flipSpeed * k
      p.rot += p.vr * k
      // 正常下落 + 划开速度；被扫开时摆动幅度放大，看起来"散了"
      p.y += (p.vy + p.py) * k
      p.x += (Math.sin(p.swayPhase) * 0.5 * (1 + p.push * 7) + p.px) * k

      if (p.y - p.size > h || p.x < -160 || p.x > w + 160) {
        petals.splice(i, 1)
        continue
      }
      drawPetalItem(p)
    }

    raf = window.requestAnimationFrame(tick)
  }

  var onResize = null
  var onVisibility = null

  if (TRAIL) {
    window.addEventListener('mousemove', onMove, { passive: true })
    // 鼠标离开窗口后停止影响，避免停住不动时一直推同一批花瓣
    window.addEventListener('mouseleave', onLeave)
    window.addEventListener('mouseenter', onEnter)
  }

  onResize = function () { resize() }
  window.addEventListener('resize', onResize, { passive: true })

  // 切到后台就停掉，别白烧 CPU
  onVisibility = function () {
    if (document.hidden) {
      running = false
      window.cancelAnimationFrame(raf)
    } else if (!running) {
      running = true
      last = 0
      raf = window.requestAnimationFrame(tick)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  raf = window.requestAnimationFrame(tick)

  window.sakura = {
    petalCount: function () { return petals.length },
    pushedCount: function () { return pushedCount },
    palette: PALETTE.slice(),
    destroy: function () {
      running = false
      window.cancelAnimationFrame(raf)
      if (TRAIL) {
        // 三个鼠标监听都要解绑，漏掉会泄漏
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseleave', onLeave)
        window.removeEventListener('mouseenter', onEnter)
      }
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
      petals.length = 0
      pushedCount = 0
      window.__sakuraLoaded = false
      delete window.sakura
    }
  }
})()
