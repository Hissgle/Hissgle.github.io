(function () {
  'use strict'

  if (window.__clickRippleLoaded) return
  window.__clickRippleLoaded = true

  var WAVES = 1
  var LIFETIME = 1750

  if (window.matchMedia) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(max-width: 768px)').matches) return
  }

  var layer = null

  function ensureLayer () {
    if (layer && layer.isConnected) return layer

    layer = document.getElementById('click-ripple-layer')
    if (!layer) {
      layer = document.createElement('div')
      layer.id = 'click-ripple-layer'
      document.body.appendChild(layer)
    }
    return layer
  }

  function spawn (x, y) {
    var host = document.createElement('div')
    host.className = 'click-ripple'
    host.style.left = x + 'px'
    host.style.top = y + 'px'

    host.style.setProperty('--cr-tilt', (Math.random() * 8 - 4).toFixed(2) + 'deg')

    for (var i = 0; i < WAVES; i++) {
      var wave = document.createElement('span')
      wave.className = 'click-ripple__wave'
      host.appendChild(wave)
    }

    ensureLayer().appendChild(host)

    window.setTimeout(function () {
      if (host.parentNode) host.parentNode.removeChild(host)
    }, LIFETIME)
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    spawn(e.clientX, e.clientY)
  }, { passive: true })

  window.clickRipple = { spawn: spawn }
})()