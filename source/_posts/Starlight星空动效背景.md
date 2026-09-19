---
title: Starlight星空动效背景
date: 2026-09-19 22:26:16
tags: JavaScript
cover: img/cover2.jpg
---

# 该网站的背景采用此动效
**此背景的源码全部采用原生JavaScript**
特性：
 *   - 纯 Canvas 2D，零依赖，无外部资源
 *   - 自适应 devicePixelRatio（高分屏不模糊）与窗口尺寸变化
 *   - 静态底图（夜空 + 星云）离屏缓存并低频重绘，保证动画流畅
 *   - 页面切到后台自动暂停，省电省 CPU
 *   - 尊重系统「减弱动态效果」偏好（prefers-reduced-motion）
 *   - 若页面已有 #universe 画布则复用，否则自建并挂在 body 下

对于本网站来说，无需任何调用，直接在butterfly_config.yml中引用即可

```javascript
(() => {
  'use strict'

  /* ========================= 可调参数 ========================= */
  const CONFIG = {
    /**
     * 是否只在夜间模式（html 带 dark 类）显示。
     * 值为false时在任何模式下都会生效。
     * true  = 跟随夜间模式：夜间淡入、白天淡出。
     * 注意：主题未配置夜间模式时 html 上永远不会有 dark 类，设为 true 会导致整个效果不可见。
     */
    followDarkMode: false,
    /**
     * 画布层级。默认 -1：位于#web_bg(-999)之上、正文与卡片之下，因此它是「背景」而不是遮罩。
     * 注意：body 与 .recent-post-item / .card-widget / #page-header 都是不透明背景，
     * 只有把它们改成透明，星空才会在页面留白处透出来（见文件末尾说明）。
     */
    zIndex: '-1',

    // 星星
    starDensity: 0.00022, // 每平方 CSS 像素的星星数量（1920x1080 ≈ 456 颗）
    starMinRadius: 0.25, // 最小半径（CSS px）
    starMaxRadius: 1.4, // 最大半径
    minStarCount: 80, // 星量下限，小窗口不至于太空
    maxStarCount: 900, // 星量上限，大屏不至于卡顿
    glowRatio: 0.1, // 带光晕的大星占比

    // 流星
    meteorChancePerFramePerPx: 0.000004, // @60fps 每帧生成概率 = 该值 × 视口高度（720 高 ≈ 6 秒一颗，1080 高 ≈ 4 秒一颗）
    meteorMinSpeed: 7, // 最小速度（CSS px / 帧@60fps）
    meteorMaxSpeed: 15, // 最大速度
    meteorMinLength: 90, // 最小拖尾长度（CSS px）
    meteorMaxLength: 260, // 最大拖尾长度
    fireballChance: 0.18, // 火流星概率（更大、更亮、更慢，带爆闪）
    meteorMaxLife: 3.2, // 单颗流星最长存活秒数
    flashDuration: 0.35, // 火流星爆闪持续秒数
    trailStepRatio: 0.45, // 拖尾分段步长 = 该值 × 头部半径（保证相邻圆重叠，拖尾连续不呈珠串）
    trailMinRadiusRatio: 0.3, // 尾端半径下限 = 该值 × 头部半径（避免圆缩到亚像素导致极微小的断点）
    trailMinSteps: 12, // 拖尾分段数下限
    trailMaxSteps: 240, // 拖尾分段数上限（按拖尾长度自适应，长拖尾也不会拉长开销）

    // 配色
    background: ['#02030a', '#050a20', '#0a1030'], // 夜空渐变：深黑 → 墨蓝
    nebulaColors: [ // 星云光晕（rgb 分量 + 最大不透明度）
      { rgb: [64, 82, 180], alpha: 0.3 },
      { rgb: [120, 72, 170], alpha: 0.2 },
      { rgb: [40, 120, 160], alpha: 0.22 }
    ],
    starColor: [255, 255, 255], // 星星光晕基础色
    starTints: [ // 恒星色温随机偏移（中性 / 暖白 / 冷蓝 / 微粉）
      [255, 255, 255],
      [255, 244, 214],
      [206, 226, 255],
      [255, 220, 225]
    ],
    meteorHead: [255, 255, 255],
    meteorTail: [150, 200, 255],
    fireballTail: [255, 214, 170]
  }

  const NEBULA_REPAINT_INTERVAL = 70 // 星云重绘最小间隔 ms（≈14fps 的动态底图足够）
  const DARK_SYNC_INTERVAL = 1200 // 静止模式下夜间模式兜底检测间隔 ms
  /* =========================================================== */

  const rgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`

  const PREFERS_REDUCED_MOTION = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

  // 优先复用页面里 id 为 universe 的 canvas，其次找 #universe 容器，都没有则自建
  const findCanvas = () => {
    const existing = document.querySelector('canvas#universe')
    if (existing) return { canvas: existing, ownsCanvas: false }

    const container = document.getElementById('universe')
    if (container) {
      const canvas = document.createElement('canvas')
      container.appendChild(canvas)
      return { canvas, ownsCanvas: false }
    }

    const canvas = document.createElement('canvas')
    canvas.id = 'universe'
    document.body.appendChild(canvas)
    return { canvas, ownsCanvas: true }
  }

  const initUniverse = () => {
    if (window.__universeInitialized) return
    window.__universeInitialized = true

    const { canvas } = findCanvas()
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // 定位样式必须无条件设置，不能用 parentElement === document.body 来判断：
    // 主题会把 inject.bottom 的内容整体包进一个 <div> 再插入 body，
    // 此时画布不是 body 的直接子元素，一旦跳过定位样式，画布就会以默认尺寸
    // 顺着文档流排在页面最下方（表现为「页面底部一块独立区域」，而不是背景）。
    Object.assign(canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      display: 'block',
      zIndex: CONFIG.zIndex,
      pointerEvents: 'none'
    })

    // 在此处必须把画布提升到 body 直接子元素层级。
    // 否则它被包在主题那个 <div> 里，而 #body-wrap 等兄弟节点在 DOM 中更靠后，
    // 同层级绘制时会盖在画布之上
    if (canvas.parentElement && canvas.parentElement !== document.body) {
      document.body.insertBefore(canvas, document.body.firstChild)
    }

    canvas.style.transition = 'opacity 900ms ease' // 可见性变化时的淡入淡出

    /* ---------------- 状态 ---------------- */
    let width = 0
    let height = 0
    let stars = []
    let meteors = []
    let nebulas = []
    let bgBuffer = null // 离屏静态底图：夜空渐变 + 星云
    let bgCtx = null
    let lastNebulaPaint = -Infinity
    let spawnAcc = 0
    let time = 0
    let last = 0
    let lastDt = 16.667
    let rafId = null
    let running = false
    let opacity = 0
    let targetOpacity = 0

    const clamp = (v, min, max) => (v < min ? min : v > max ? max : v)
    const rand = (min, max) => min + Math.random() * (max - min)
    const isDark = () => document.documentElement.classList.contains('dark')
    // 目标不透明度：默认始终可见；开启 followDarkMode 后仅在夜间模式显示
    const targetOpacityFor = () => (!CONFIG.followDarkMode || isDark() ? 1 : 0)

    /* ---------------- 夜空底图与星云 ---------------- */
    const paintSkyGradient = target => {
      const bg = target.createLinearGradient(0, 0, width * 0.35, height)
      bg.addColorStop(0, CONFIG.background[0])
      bg.addColorStop(0.55, CONFIG.background[1])
      bg.addColorStop(1, CONFIG.background[2])
      target.fillStyle = bg
      target.fillRect(0, 0, width, height)
    }

    // 重绘离屏底图：暗色夜空 + 几团缓慢漂移呼吸的星云光晕
    const paintBackgroundBuffer = () => {
      paintSkyGradient(bgCtx)

      nebulas.forEach((n, i) => {
        const { rgb, alpha } = CONFIG.nebulaColors[i % CONFIG.nebulaColors.length]
        const cx = n.x * width
        const cy = n.y * height
        const breath = 0.82 + 0.18 * Math.sin(n.phase) // 透明度呼吸
        const radius = n.r * Math.max(width, height)
        const g = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, radius)
        g.addColorStop(0, rgba(rgb, alpha * breath))
        g.addColorStop(0.45, rgba(rgb, alpha * breath * 0.45))
        g.addColorStop(0.75, rgba(rgb, alpha * breath * 0.12))
        g.addColorStop(1, rgba(rgb, 0))
        bgCtx.fillStyle = g
        bgCtx.beginPath()
        bgCtx.arc(cx, cy, radius, 0, Math.PI * 2)
        bgCtx.fill()
      })
    }

    /* ---------------- 星星 ---------------- */
    const buildStars = () => {
      const count = clamp(
        Math.round(width * height * CONFIG.starDensity),
        CONFIG.minStarCount,
        CONFIG.maxStarCount
      )
      stars = []
      for (let i = 0; i < count; i++) {
        const tint = CONFIG.starTints[(Math.random() * CONFIG.starTints.length) | 0]
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: rand(CONFIG.starMinRadius, CONFIG.starMaxRadius),
          base: rand(0.25, 0.95), // 基础亮度，决定星的明暗层次
          speed: rand(0.25, 1.35), // 闪烁频率（每颗不同 → 互不同步）
          phase: rand(0, Math.PI * 2),
          color: `rgb(${tint[0]}, ${tint[1]}, ${tint[2]})`,
          glow: Math.random() < CONFIG.glowRatio
        })
      }
    }

    const drawStars = () => {
      // 整片星空的轻微集体呼吸
      const globalPulse = 0.88 + 0.12 * Math.sin(time * 0.6)

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        // 双正弦叠加：主闪烁 × 缓慢起伏，比单一正弦更自然
        const twinkle =
          Math.sin(time * s.speed + s.phase) * Math.sin(time * s.speed * 0.37 + s.phase * 1.7)
        const alpha = clamp(s.base * globalPulse * (0.5 + 0.5 * twinkle), 0.04, 1)

        if (s.glow && s.r > CONFIG.starMaxRadius * 0.75 && alpha > 0.45) {
          const gr = s.r * 5
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr)
          g.addColorStop(0, rgba(CONFIG.starColor, alpha * 0.5))
          g.addColorStop(0.4, rgba(CONFIG.starColor, alpha * 0.12))
          g.addColorStop(1, rgba(CONFIG.starColor, 0))
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(s.x, s.y, gr, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.globalAlpha = alpha
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    /* ---------------- 流星 ---------------- */
    const maxMeteors = () => (width > 1400 ? 3 : width > 900 ? 2 : 1)

    const spawnMeteor = forceFireball => {
      const angle = rand(0.24, 0.42) * Math.PI // 与水平线夹角约 43°~76°，向右下方划过
      const isFireball = forceFireball || Math.random() < CONFIG.fireballChance
      const speed =
        rand(CONFIG.meteorMinSpeed, CONFIG.meteorMaxSpeed) * (isFireball ? rand(0.55, 0.8) : 1)

      meteors.push({
        x: rand(-width * 0.4, width * 0.9), // 起点横向随机，部分落在画面外
        y: -60, // 从顶边之外进入
        angleCos: Math.cos(angle),
        angleSin: Math.sin(angle),
        speed, // px / 帧@60fps
        length: rand(CONFIG.meteorMinLength, CONFIG.meteorMaxLength) * (isFireball ? 1.4 : 1),
        width: isFireball ? rand(2.4, 3.4) : rand(1.1, 2),
        life: 0,
        maxLife: 2 + rand(0, 1.4),
        opacity: 0,
        fadeIn: rand(0.18, 0.35),
        fireball: isFireball,
        tint: Math.random() < 0.3 ? CONFIG.fireballTail : CONFIG.meteorTail
      })
    }

    const updateMeteors = dt => {
      // 概率生成：每帧生成概率 = meteorChancePerFramePerPx × 视口高度，流星密度随画面高度增长
      spawnAcc += CONFIG.meteorChancePerFramePerPx * height * (dt / 16.667)
      while (spawnAcc >= 1) {
        spawnAcc -= 1
        if (meteors.length < maxMeteors()) spawnMeteor(false)
      }

      const step = dt / 16.667 // 换算成与帧率无关的位移
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.life += dt / 1000
        m.x += m.angleCos * m.speed * step
        m.y += m.angleSin * m.speed * step

        // 生命周期：淡入 → 稳定 → 淡出
        const t = m.life / m.maxLife
        if (m.life < m.fadeIn) {
          m.opacity = m.life / m.fadeIn
        } else if (t > 0.55) {
          m.opacity = Math.max(0, 1 - (t - 0.55) / 0.45)
        } else {
          m.opacity = 1
        }

        // 完全离开画面或生命耗尽即回收
        const gone =
          m.x - m.length * m.angleCos > width + 80 ||
          m.y - m.length * m.angleSin > height + 80 ||
          m.life > m.maxLife
        if (gone) meteors.splice(i, 1)
      }
    }

    const drawMeteors = () => {
      ctx.globalCompositeOperation = 'lighter' // 叠加发光，拖尾更通透

      meteors.forEach(m => {
        const alpha = m.opacity
        if (alpha <= 0.02) return

        const tailX = m.x - m.angleCos * m.length
        const tailY = m.y - m.angleSin * m.length

        // 拖尾：分段同心圆，头亮尾淡，比直线更柔和
        // 步长按最粗处（头部半径）取，保证整条拖尾相邻圆都重叠，不会出现珠串状断点
        const steps = clamp(
          Math.ceil(m.length / (m.width * CONFIG.trailStepRatio)),
          CONFIG.trailMinSteps,
          CONFIG.trailMaxSteps
        )
        for (let i = 0; i < steps; i++) {
          const p = i / (steps - 1)
          // 尾端保留半径下限：半径若缩到亚像素，相邻圆之间会出现极微小的缝隙
          const r = Math.max(m.width * (1 - p * 0.92), m.width * CONFIG.trailMinRadiusRatio)
          const a = alpha * Math.pow(1 - p, 2.2) * 0.9
          if (r <= 0.15 || a <= 0.008) continue
          ctx.fillStyle = rgba(m.tint, a)
          ctx.beginPath()
          ctx.arc(m.x + (tailX - m.x) * p, m.y + (tailY - m.y) * p, r, 0, Math.PI * 2)
          ctx.fill()
        }

        // 头部光晕
        const headGlow = m.width * (m.fireball ? 7 : 4.5)
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, headGlow)
        g.addColorStop(0, rgba(CONFIG.meteorHead, alpha * 0.95))
        g.addColorStop(0.25, rgba(m.tint, alpha * 0.55))
        g.addColorStop(1, rgba(m.tint, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(m.x, m.y, headGlow, 0, Math.PI * 2)
        ctx.fill()

        // 头部实心亮点
        ctx.fillStyle = rgba(CONFIG.meteorHead, alpha)
        ctx.beginPath()
        ctx.arc(m.x, m.y, m.width * (m.fireball ? 1.5 : 1.1), 0, Math.PI * 2)
        ctx.fill()

        // 火流星：入场瞬间额外打一圈爆闪
        if (m.fireball && m.life <= CONFIG.flashDuration) {
          const k = 1 - m.life / CONFIG.flashDuration
          const fr = m.width * (10 + 26 * (1 - k))
          const fg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, fr)
          fg.addColorStop(0, `rgba(255, 246, 230, ${alpha * 0.6 * k})`)
          fg.addColorStop(0.35, rgba(m.tint, alpha * 0.28 * k))
          fg.addColorStop(1, rgba(m.tint, 0))
          ctx.fillStyle = fg
          ctx.beginPath()
          ctx.arc(m.x, m.y, fr, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      ctx.globalCompositeOperation = 'source-over'
    }

    /* ---------------- 尺寸 ---------------- */
    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2)

      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // 重建离屏底图（尺寸为设备像素，绘制用 CSS 像素坐标）
      if (!bgBuffer) bgBuffer = document.createElement('canvas')
      bgBuffer.width = Math.max(1, Math.round(width * dpr))
      bgBuffer.height = Math.max(1, Math.round(height * dpr))
      bgCtx = bgBuffer.getContext('2d')
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

      nebulas = []
      const nebulaCount = 3 + (Math.random() < 0.5 ? 0 : 1)
      for (let i = 0; i < nebulaCount; i++) {
        nebulas.push({
          x: Math.random(),
          y: Math.random(),
          r: rand(0.32, 0.72),
          dx: rand(-0.016, 0.016), // 归一化漂移速度（每秒）
          dy: rand(-0.012, 0.012),
          phase: rand(0, Math.PI * 2),
          breath: rand(0.06, 0.16)
        })
      }

      paintBackgroundBuffer()
      buildStars()

      // 越界的流星直接丢弃
      meteors = meteors.filter(m => m.x < width + 300 && m.y < height + 300)
    }

    /* ---------------- 主循环 ---------------- */
    const driftNebulas = dt => {
      const s = dt / 1000
      nebulas.forEach(n => {
        n.x += n.dx * s
        n.y += n.dy * s
        n.phase += n.breath * s
        if (n.x < -0.25) n.x = 1.25
        if (n.x > 1.25) n.x = -0.25
        if (n.y < -0.25) n.y = 1.25
        if (n.y > 1.25) n.y = -0.25
      })
    }

    const compose = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(bgBuffer, 0, 0, width, height)
      drawStars()
      updateMeteors(lastDt)
      drawMeteors()
    }

    const setOpacity = value => {
      const text = value.toFixed(3)
      if (canvas.style.opacity !== text) canvas.style.opacity = text
    }

    const frame = now => {
      if (!running) return
      rafId = requestAnimationFrame(frame)

      const dt = clamp(now - last, 1, 50) // 限幅：切回前台时不会跳帧
      last = now
      lastDt = dt
      time += dt / 1000

      // 可见性：followDarkMode 关闭时恒为 1，打开时随夜间模式淡入淡出
      targetOpacity = targetOpacityFor()
      if (Math.abs(opacity - targetOpacity) > 0.005) {
        opacity += (targetOpacity - opacity) * clamp(dt / 260, 0, 1)
      } else {
        opacity = targetOpacity
      }
      setOpacity(opacity)

      if (opacity <= 0.02) {
        ctx.clearRect(0, 0, width, height)
        return
      }

      // 星云低频重绘：省下每帧的全屏渐变开销
      driftNebulas(dt)
      if (time * 1000 - lastNebulaPaint >= NEBULA_REPAINT_INTERVAL) {
        lastNebulaPaint = time * 1000
        paintBackgroundBuffer()
      }

      compose()
    }

    const start = () => {
      if (running) return
      running = true
      last = performance.now()
      lastNebulaPaint = time * 1000
      rafId = requestAnimationFrame(frame)
    }

    const stop = () => {
      running = false
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
    }

    // 静止模式（prefers-reduced-motion）：只画一帧静态星空 + 一颗定格流星
    const renderStatic = () => {
      if (opacity <= 0.02) {
        setOpacity(0)
        ctx.clearRect(0, 0, width, height)
        return
      }
      setOpacity(opacity)
      if (meteors.length === 0) {
        spawnMeteor(false)
        const m = meteors[0]
        m.x = width * rand(0.3, 0.65)
        m.y = height * rand(0.08, 0.3)
        m.opacity = 0.85
        m.life = m.fadeIn
      }
      compose()
    }

    /* ---------------- 事件 ---------------- */
    let resizeTimer = null
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        resize()
        if (PREFERS_REDUCED_MOTION) renderStatic()
      }, 180)
    }

    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else if (!PREFERS_REDUCED_MOTION) {
        start()
      }
    }

    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('orientationchange', onResize, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    // 静止模式下主循环不跑，用低频轮询同步夜间模式（仅 followDarkMode 开启时才需要）
    if (PREFERS_REDUCED_MOTION && CONFIG.followDarkMode) {
      setInterval(() => {
        const target = targetOpacityFor()
        if (target !== opacity) {
          opacity = target
          targetOpacity = target
          renderStatic()
        }
      }, DARK_SYNC_INTERVAL)
    }

    /* ---------------- 启动 ---------------- */
    resize()
    opacity = targetOpacityFor()
    targetOpacity = opacity

    if (PREFERS_REDUCED_MOTION) {
      renderStatic()
    } else {
      setOpacity(opacity)
      start()
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUniverse, { once: true })
  } else {
    initUniverse()
  }
})()
```
