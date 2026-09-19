// 关键实验：把"自动播放"接进真实页面（真实歌曲、真实容器、pajax 之外的元素），
// 分别在「有用户交互」和「无用户交互」两种情况下看结果。
// 这样可以准确回答：pjax 之后（= 本次会话已交互过）还能不能有声自动播放。
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SITE = process.argv[2] || 'http://127.0.0.1:4000/'
const PORT = Number(process.argv[3] || 9343)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 这段会被插到 </body> 前，等播放器的 audio 有 src 后尝试自动播放（带降级）
const AUTOPLAY = [
  '<script>',
  'window.__ap = { steps: [] };',
  'function tryAutoplay() {',
  '  var root = document.getElementById("vinyl-player");',
  '  var a = root && root.querySelector("audio");',
  '  if (!a || !a.src) { return setTimeout(tryAutoplay, 400); }',
  '  window.__ap.steps.push("audio.src 就绪, 开始尝试 play()");',
  '  var started = Date.now();',
  '  var p = a.play();',
  '  if (!p || !p.then) { window.__ap.steps.push("无 promise 返回"); return; }',
  '  p.then(function () {',
  '    window.__ap.steps.push("play() 成功, 耗时 " + (Date.now() - started) + "ms, paused=" + a.paused);',
  '  }).catch(function (e) {',
  '    window.__ap.steps.push("play() 被拒: " + e.name + " 耗时 " + (Date.now() - started) + "ms");',
  '    a.muted = true;',
  '    return a.play().then(function () {',
  '      window.__ap.steps.push("降级 muted 后成功, paused=" + a.paused);',
  '    }).catch(function (e2) {',
  '      window.__ap.steps.push("降级 muted 也被拒: " + e2.name);',
  '    });',
  '  });',
  '}',
  'setTimeout(tryAutoplay, 800);',
  '</script>',
].join('\n')

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map() }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws 失败')) })
    const c = new CDP(ws)
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data)
      if (m.id && c.pending.has(m.id)) {
        const { resolve, reject } = c.pending.get(m.id); c.pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
      }
    }
    return c
  }
  send(method, params) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params: params || {} }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
}

async function ev(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval 失败')
  return r.result.value
}

;(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-ap2-'))
  // headless 默认把自动播放全部禁掉（连 muted 都禁），这跟用户平时的浏览器窗口不一样。
  // 加上这个 flag 才是"浏览器允许自动播放时会怎么表现"。
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--window-size=1100,800', 'about:blank',
  ], { stdio: 'ignore' })

  try {
    let version = null
    for (let i = 0; i < 30; i++) {
      try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2500) })).json(); break } catch { await sleep(700) }
    }
    if (!version) { console.log('✗ 连不上 CDP'); return }
    console.log('浏览器: ' + version.Browser + '（headless，未加任何 autoplay flag）')

    // 取真实页面，把自动播放逻辑插进去
    const html = await (await fetch(SITE, { signal: AbortSignal.timeout(10000) })).text()
    const page = path.join(profile, 'p.html')
    fs.writeFileSync(page, html.replace('</body>', AUTOPLAY + '</body>'), 'utf8')

    // ---- 场景 1：无用户交互 ----
    const t1 = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('file:///' + page.replace(/\\/g, '/'))}`, { method: 'PUT' })).json()
    const c1 = await CDP.connect(t1.webSocketDebuggerUrl)
    await c1.send('Runtime.enable')
    console.log('\n=== 场景 1：无任何用户交互 ===')
    await sleep(16000)
    const r1 = await ev(c1, `(function(){
      var root = document.getElementById("vinyl-player");
      var a = root && root.querySelector("audio");
      return { steps: window.__ap ? window.__ap.steps : null,
               paused: a ? a.paused : null, muted: a ? a.muted : null,
               currentTime: a ? a.currentTime : null,
               anim: root && root.querySelector(".vinyl-disc") ? getComputedStyle(root.querySelector(".vinyl-disc")).animationPlayState : null };
    })()`)
    console.log(JSON.stringify(r1, null, 1))

    // ---- 场景 2：先真实点击一次（等价于 pjax 会话中已交互），再重新加载并自动播放 ----
    console.log('\n=== 场景 2：先真实点击一次，再重新加载页面并自动播放 ===')
    const t2 = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('file:///' + page.replace(/\\/g, '/'))}`, { method: 'PUT' })).json()
    const c2 = await CDP.connect(t2.webSocketDebuggerUrl)
    await c2.send('Runtime.enable')
    await sleep(3000)
    await c2.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 300, button: 'left', clickCount: 1, buttons: 1 })
    await c2.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 300, button: 'left', clickCount: 1, buttons: 1 })
    await sleep(1000)
    await c2.send('Page.reload', { ignoreCache: false })
    await sleep(15000)
    const r2 = await ev(c2, `(function(){
      var root = document.getElementById("vinyl-player");
      var a = root && root.querySelector("audio");
      return { steps: window.__ap ? window.__ap.steps : null,
               paused: a ? a.paused : null, muted: a ? a.muted : null,
               currentTime: a ? a.currentTime : null };
    })()`)
    console.log(JSON.stringify(r2, null, 1))
  } finally {
    try { child.kill() } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch {}
  }
  process.exit(0)
})().catch(e => { console.log('ERR ' + e.stack); process.exit(1) })
