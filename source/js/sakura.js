/*!
 * sakura.js — 樱花飘落 + 鼠标划过扬起花瓣
 *
 * 两个独立效果：
 *   1) 花瓣持续从页面顶端缓缓飘落（全站所有页面）
 *   2) 鼠标划过处短暂扬起一小簇花瓣，随后散开淡出
 *
 * 配置：通过 script 标签的 data-* 属性传入
 * （见 _config.butterfly.yml 的 inject.bottom）
 *
 *   data-mobile="false"      是否在窄屏/手机上启用
 *   data-density="0.00007"   飘落密度（每平方像素生成概率）
 *   data-trail="true"        是否启用鼠标划过效果
 *   data-zindex="1"          绘制层级
 *   data-color="#ffc0d0"     基础花瓣色
 *
 * 之所以用 data-* 而不是内联 window.SAKURA_CONFIG：
 * 内联脚本里的 { ... } 在 YAML 中会被当作映射，产生解析歧义；
 * data-* 的值都是纯字符串，不会踩到这个坑。
 *
 * 调试用 API（浏览器控制台）：
 *   window.sakura.destroy()     移除效果（恢复原状）
 *   window.sakura.petalCount()  当前飘落花瓣数
 *   window.sakura.trailCount()  当前划过的花瓣数
 */
(function () {
  'use strict'

  if (window.__sakuraLoaded) return
  window.__sakuraLoaded = true

  // ---- 读取配置 ------------------------------------------------------------
  // 优先从 window.SAKURA_CONFIG 读（测试与手动覆盖用），否则读本标签的 data-*
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

  // 尊重系统的"减少动态效果"设置
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  // ---- 先探测 canvas 2d 是否可用 -------------------------------------------
  // 必须放在最前面：颜色解析（toHex）自己也要用一个 canvas，
  // 而有些环境（GPU 不可用、隐私模式、老浏览器）getContext('2d') 会返回 null。
  // 探测不过就干净退出，既不留残留节点也不抛异常。
  var probe = document.createElement('canvas')
  var probeCtx = probe && probe.getContext ? probe.getContext('2d') : null
  if (!probeCtx) return

  // ---- 工具 ----------------------------------------------------------------
  var TWO_PI = Math.PI * 2
  function rand (min, max) { return min + Math.random() * (max - min) }
  function randInt (min, max) { return Math.floor(rand(min, max + 1)) }

  function clamp (v, min, max) { return v < min ? min : (v > max ? max : v) }

  // 允许用 CSS 颜色或 hex，统一转成 hex 以便做深浅变化
  function toHex (color) {
    var canvasEl = document.createElement('canvas')
    var c = canvasEl && canvasEl.getContext ? canvasEl.getContext('2d') : null
    if (!c) return '#ffc0d0' // 理论上到不了这里（前面已探测）
    c.fillStyle = '#ffc0d0'
    try { c.fillStyle = color } catch (e) { /* 无效值则退回默认 */ }
    var s = c.fillStyle
    if (s.charAt(0) === '#') return s
    // 形如 rgb(r,g,b) 的返回值
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
  // 用基础色生成一组深浅不同的色调，避免全场一个颜色显得假
  var PALETTE = [
    shade(HEX, 0), shade(HEX, -18), shade(HEX, 14),
    shade(HEX, -34), shade(HEX, 30), shade(HEX, -8)
  ]

  // ---- canvas 准备 ---------------------------------------------------------
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
    // 理论上不会发生（探测已通过），但仍要保证不留残留节点
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

  // ---- 花瓣绘制 ------------------------------------------------------------
  // 樱花花瓣轮廓：底部圆润、顶端带一个小缺口。
  // 缺口直接写进路径里（而不是另用 destination-out 擦除），
  // 这样配合 ctx.scale 做翻转压扁时不会把先前绘制的内容擦掉。
  // notch(0~1) 控制缺口深度：0 为完整花瓣。
  function drawPetal (c, size, color, alpha, notch) {
    var s = size
    var d = s * 0.5 * (notch == null ? 0.5 : notch)
    c.save()
    c.globalAlpha = alpha
    c.fillStyle = color
    c.beginPath()
    c.moveTo(0, -s)
    c.lineTo(-s * 0.30, -s + d) // 缺口左壁
    c.lineTo(0, -s * 0.58) // 缺口底部（凹进去）
    c.lineTo(s * 0.30, -s + d) // 缺口右壁
    c.bezierCurveTo(s * 1.05, -s * 0.75, s * 0.62, s * 0.52, 0, s)
    c.bezierCurveTo(-s * 0.62, s * 0.52, -s * 1.05, -s * 0.75, 0, -s)
    c.closePath()
    c.fill()

    // 一点高光，让花瓣不像纯色纸片
    c.globalAlpha = alpha * 0.28
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.ellipse(-s * 0.22, s * 0.12, s * 0.24, s * 0.42, -0.4, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }

  // ---- 飘落的花瓣 ----------------------------------------------------------
  var petals = []
  var FRAME_MS = 1000 / 60

  function newPetal (fromTop) {
    var size = rand(7, 15)
    return {
      x: rand(-60, w + 60),
      y: fromTop ? rand(-60, -10) : rand(-10, h),
      size: size,
      // 下落速度与大小相关，小花瓣更轻更慢
      vy: rand(0.5, 1.15) * (size / 12),
      // 左右摆动的振幅与相位，形成缓缓飘的观感
      swayAmp: rand(18, 46),
      swayPhase: rand(0, TWO_PI),
      swaySpeed: rand(0.012, 0.026),
      rot: rand(0, TWO_PI),
      vr: rand(-0.014, 0.014),
      color: PALETTE[randInt(0, PALETTE.length - 1)],
      alpha: rand(0.55, 0.95),
      // 3D 翻转：让花瓣看起来在自转
      flip: rand(0, TWO_PI),
      flipSpeed: rand(0.012, 0.03)
    }
  }

  function spawnFor (dt) {
    var target = Math.min(90, Math.round(w * h * DENSITY))
    var want = Math.min(3, Math.max(0, target - petals.length))
    for (var i = 0; i < want; i++) {
      if (Math.random() < 0.75 * (dt / FRAME_MS) + 0.25) petals.push(newPetal(true))
    }
  }

  function drawPetalItem (p) {
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    // 用 cos(flip) 压缩横向宽度模拟花瓣自转（3D 观感），并让缺口随之变浅
    var sq = Math.cos(p.flip)
    var squash = 0.3 + Math.abs(sq) * 0.7
    ctx.scale(squash, 1)
    drawPetal(ctx, p.size, p.color, p.alpha, Math.abs(sq))
    ctx.restore()
  }

  // ---- 鼠标划过的花瓣 ------------------------------------------------------
  var trail = []
  var lastMove = { x: 0, y: 0, t: 0 }
  var TRAIL_LIFE = 900 // 毫秒

  function spawnTrail (x, y, dirX, dirY) {
    var n = randInt(1, 3)
    for (var i = 0; i < n; i++) {
      // 向鼠标前进方向的斜后方散开，像是被扫开的
      var spread = rand(-0.9, 0.9)
      var back = -rand(0.4, 1.1)
      var vx = (dirX * back + dirY * spread) * rand(0.6, 1.9)
      var vy = (dirY * back - dirX * spread) * rand(0.6, 1.9) - rand(0.1, 0.7)
      trail.push({
        x: x + rand(-7, 7),
        y: y + rand(-7, 7),
        vx: vx,
        vy: vy,
        size: rand(5, 11),
        rot: rand(0, TWO_PI),
        vr: rand(-0.05, 0.05),
        color: PALETTE[randInt(0, PALETTE.length - 1)],
        life: 0,
        lifeMax: rand(TRAIL_LIFE * 0.6, TRAIL_LIFE)
      })
    }
    // 上限保护，快速划动时不会堆积
    if (trail.length > 160) trail.splice(0, trail.length - 160)
  }

  function onMove (e) {
    var x = e.clientX
    var y = e.clientY
    var now = Date.now()
    var dx = x - lastMove.x
    var dy = y - lastMove.y
    var dist = Math.sqrt(dx * dx + dy * dy)
    var speed = dist / Math.max(1, now - lastMove.t)
    lastMove.x = x
    lastMove.y = y
    lastMove.t = now

    if (dist < 3) return // 微小抖动不生成，避免原地堆积
    var len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy))
    spawnTrail(x, y, dx / len, dy / len)

    // 划得越快，补几朵，让轨迹连续
    if (speed > 0.5 && dist > 18) {
      for (var i = 1; i < 3; i++) {
        spawnTrail(x - dx * i / 3, y - dy * i / 3, dx / len, dy / len)
      }
    }
  }

  // ---- 主循环 --------------------------------------------------------------
  var raf = 0
  var last = 0
  var running = true

  function tick (t) {
    if (!running) return
    var dt = last ? Math.min(48, t - last) : FRAME_MS // 卡顿/切后台回来时限幅
    last = t

    ctx.clearRect(0, 0, w, h)

    // 1) 飘落花瓣
    spawnFor(dt)
    var k = dt / FRAME_MS
    for (var i = petals.length - 1; i >= 0; i--) {
      var p = petals[i]
      p.swayPhase += p.swaySpeed * k
      p.flip += p.flipSpeed * k
      p.rot += p.vr * k
      p.y += p.vy * k
      p.x += Math.sin(p.swayPhase) * 0.5 * k

      if (p.y - p.size > h || p.x < -120 || p.x > w + 120) {
        petals.splice(i, 1)
        continue
      }
      drawPetalItem(p)
    }

    // 2) 划过的花瓣
    for (var j = trail.length - 1; j >= 0; j--) {
      var q = trail[j]
      q.life += dt
      if (q.life >= q.lifeMax) { trail.splice(j, 1); continue }
      var prog = q.life / q.lifeMax

      q.vy += 0.012 * k // 缓慢下坠
      q.vx *= Math.pow(0.985, k) // 空气阻力
      q.x += q.vx * k
      q.y += q.vy * k
      q.rot += q.vr * k

      ctx.save()
      ctx.translate(q.x, q.y)
      ctx.rotate(q.rot)
      drawPetal(ctx, q.size, q.color, (1 - prog) * 0.9)
      ctx.restore()
    }

    raf = window.requestAnimationFrame(tick)
  }

  // ---- 事件绑定 ------------------------------------------------------------
  var onResize = null
  var onVisibility = null

  if (TRAIL) {
    window.addEventListener('mousemove', onMove, { passive: true })
  }

  onResize = function () { resize() }
  window.addEventListener('resize', onResize, { passive: true })

  // 切到后台就停掉，别白烧 CPU / 电量
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

  // ---- 对外接口 ------------------------------------------------------------
  window.sakura = {
    petalCount: function () { return petals.length },
    trailCount: function () { return trail.length },
    palette: PALETTE.slice(),
    destroy: function () {
      running = false
      window.cancelAnimationFrame(raf)
      if (TRAIL) window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
      petals.length = 0
      trail.length = 0
      window.__sakuraLoaded = false
      delete window.sakura
    }
  }
})()
