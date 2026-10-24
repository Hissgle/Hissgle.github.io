/*
 * title-drift.js — 首屏站名的小幅度湍流漂移
 * 每个字符使用独立的平滑随机噪声，叠加三种频率，避免机械重复的周期感。
 */
(function () {
  'use strict'

  var CFG = {
    x: 2.8, // 横向最大漂移（px）
    y: 4.5, // 纵向最大漂移（px）
    rotate: 2.2 // 最大旋转角度（deg）
  }

  var motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  var frame = null
  var title = null
  var original = ''
  var chars = []

  // 整数哈希：同一字符在同一时间点得到稳定的随机值。
  function randomAt (n, seed) {
    var x = Math.imul(n ^ seed, 0x45d9f3b)
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
    x ^= x >>> 16
    return ((x >>> 0) / 4294967295) * 2 - 1
  }

  // 在随机格点之间平滑插值，让运动连续且没有突然转向。
  function noise (time, seed) {
    var n = Math.floor(time)
    var f = time - n
    var ease = f * f * (3 - 2 * f)
    return randomAt(n, seed) * (1 - ease) + randomAt(n + 1, seed) * ease
  }

  function turbulence (time, seed, speed) {
    var t = time * speed
    return noise(t * 0.34, seed) * 0.62 +
      noise(t * 0.83 + 31.7, seed + 101) * 0.28 +
      noise(t * 1.71 + 73.1, seed + 307) * 0.1
  }

  function draw (now) {
    if (!title || document.hidden) {
      frame = null
      return
    }

    var time = now / 1000
    chars.forEach(function (item) {
      var x = turbulence(time, item.seeds[0], item.speed) * CFG.x
      var y = turbulence(time, item.seeds[1], item.speed) * CFG.y
      var r = turbulence(time, item.seeds[2], item.speed) * CFG.rotate
      item.node.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' + r.toFixed(2) + 'deg)'
    })
    frame = window.requestAnimationFrame(draw)
  }

  function start () {
    if (frame === null && chars.length && !document.hidden && !motion.matches) {
      frame = window.requestAnimationFrame(draw)
    }
  }

  function stop (restore) {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
    if (restore && title) {
      title.textContent = original
      title.removeAttribute('data-drift')
      title.removeAttribute('aria-label')
      title = null
      chars = []
    }
  }

  function init () {
    stop(true)
    var node = document.getElementById('site-title')
    if (!node || motion.matches) return

    title = node
    original = node.textContent
    node.setAttribute('aria-label', original.trim())
    node.setAttribute('data-drift', '')
    node.textContent = ''

    Array.from(original).forEach(function (char) {
      var span = document.createElement('span')
      span.className = 'title-drift-char'
      span.setAttribute('aria-hidden', 'true')
      span.textContent = char
      node.appendChild(span)
      chars.push({
        node: span,
        speed: 0.85 + Math.random() * 0.3,
        seeds: [
          (Math.random() * 2147483647) | 0,
          (Math.random() * 2147483647) | 0,
          (Math.random() * 2147483647) | 0
        ]
      })
    })
    start()
  }

  function onMotionChange () {
    if (motion.matches) stop(true)
    else init()
  }

  init()
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(false)
    else start()
  })
  document.addEventListener('pjax:send', function () { stop(true) })
  document.addEventListener('pjax:complete', init)
  if (motion.addEventListener) motion.addEventListener('change', onMotionChange)
  else motion.addListener(onMotionChange)
})()
