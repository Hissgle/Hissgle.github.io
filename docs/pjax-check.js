// 验证「切换页面时音乐不中断」：
//   1. 真实点击播放唱片
//   2. 真实点击导航栏的「归档」（走 pjax，不整页刷新）
//   3. 检查：
//      - 页面内容确实换了（pjax 生效）
//      - window.__navigations 标记还在（说明没有整页刷新）
//      - **同一个 audio 元素还在、还在播、currentTime 继续增长**
//      - 唱片还在转
//
// 用法：node docs/pjax-check.js [url] [debugPort] [--launch]
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const argv = process.argv.slice(2)
const LAUNCH = argv.includes('--launch')
const rest = argv.filter(a => a !== '--launch')
const SITE = rest[0] || 'http://127.0.0.1:4000/'
const PORT = Number(rest[1] || 9335)
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let edgeChild = null, edgeProfile = null
function launchEdge() {
  edgeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-pjax-'))
  edgeChild = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
    '--user-data-dir=' + edgeProfile, '--window-size=1200,900', 'about:blank',
  ], { stdio: 'ignore' })
}
function cleanup() {
  try { if (edgeChild) edgeChild.kill() } catch {}
  try { if (edgeProfile) fs.rmSync(edgeProfile, { recursive: true, force: true }) } catch {}
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.net = [] }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws 失败')) })
    const c = new CDP(ws)
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data)
      if (m.id && c.pending.has(m.id)) {
        const { resolve, reject } = c.pending.get(m.id)
        c.pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
      } else if (m.method === 'Network.requestWillBeSent') {
        const t = m.params.type
        if (t === 'Document' || t === 'XHR' || t === 'Fetch') c.net.push(t + ' ' + m.params.request.url.slice(0, 90))
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

const STATE = `(function(){
  var root = document.getElementById("vinyl-player");
  var disc = root && root.querySelector(".vinyl-disc");
  var a = root && root.querySelector("audio");
  var cs = disc ? getComputedStyle(disc) : null;
  return {
    url: location.pathname,
    audioExists: !!a,
    paused: a ? a.paused : null,
    currentTime: a ? Math.round(a.currentTime * 1000) / 1000 : null,
    duration: a ? Math.round((a.duration || 0) * 100) / 100 : null,
    title: root && root.querySelector(".vinyl-hint b") ? root.querySelector(".vinyl-hint b").textContent : null,
    animState: cs ? cs.animationPlayState : null,
    discDeg: (function(){ var m = cs ? cs.transform : ""; if (!m || m.indexOf("matrix") !== 0) return 0;
      var p = m.replace(/^matrix\\(/,"").replace(/\\)$/,"").split(",");
      return Math.round(Math.atan2(parseFloat(p[1]), parseFloat(p[0])) * 180 / Math.PI); })(),
    playerCount: document.querySelectorAll("#vinyl-player").length,
    navMark: window.__navMark === undefined ? null : window.__navMark,
    pageTitle: (document.querySelector("#page-header h1") || document.querySelector("title") || {}).textContent,
    contentSignature: (document.querySelector("#content-inner") || document.body).innerHTML.length
  };
})()`

;(async () => {
  if (LAUNCH) launchEdge()
  let version = null
  for (let i = 0; i < 30; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2500) })).json(); break } catch { await sleep(700) }
  }
  if (!version) { console.log('✗ 连不上 CDP（' + PORT + '），加 --launch 或先手动起 Edge'); cleanup(); process.exit(2) }
  console.log('浏览器: ' + version.Browser)

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(SITE)}`, { method: 'PUT' })).json()
  const cdp = await CDP.connect(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')

  // 打一个「完整页面加载」才会重置的标记，用来判断到底有没有整页刷新
  await sleep(1500)
  await ev(cdp, 'window.__navMark = "MARK-" + Date.now(); "ok"')

  console.log('\n等播放器就绪...')
  for (let i = 0; i < 40; i++) {
    await sleep(700)
    const s = await ev(cdp, `(function(){var r=document.getElementById('vinyl-player');var a=r&&r.querySelector('audio');return !!(a&&a.src);})()`)
    if (s) { console.log('  就绪'); break }
  }

  async function realClickSelector(sel) {
    const box = await ev(cdp, `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`)
    if (!box) throw new Error('找不到元素: ' + sel)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 })
    }
    return box
  }

  console.log('\n>>> 点击唱片开始播放')
  await realClickSelector('#vinyl-player .vinyl-stage')
  await sleep(4000)
  const before = await ev(cdp, STATE)
  console.log('  ' + JSON.stringify(before))

  console.log('\n>>> 点击导航栏「归档」（pjax 切换页面）')
  // 必须精确定位到导航栏里的那个链接：隐藏的移动端菜单里也有同样的 href
  const navSel = '#menus a[href="/archives/"]'
  const hasNav = await ev(cdp, `!!document.querySelector(${JSON.stringify(navSel)})`)
  console.log('  找到归档链接: ' + hasNav)
  if (hasNav) await realClickSelector(navSel)
  await sleep(4500)
  const after = await ev(cdp, STATE)
  console.log('  ' + JSON.stringify(after))

  console.log('\n>>> 再点导航栏「首页」回来')
  const homeSel = '#menus a[href="/"]'
  if (await ev(cdp, `!!document.querySelector(${JSON.stringify(homeSel)})`)) await realClickSelector(homeSel)
  await sleep(4500)
  const back = await ev(cdp, STATE)
  console.log('  ' + JSON.stringify(back))

  console.log('\n=== 网络请求（Document 表示整页刷新，Fetch/XHR 表示 pjax）===')
  for (const n of cdp.net.slice(-14)) console.log('  ' + n)

  const checks = []
  const add = (n, ok, d) => checks.push({ n, ok: !!ok, d })
  add('初始能播放', before.paused === false && before.currentTime > 0, JSON.stringify(before))
  add('切换后页面内容确实换了', after.url !== before.url, before.url + ' -> ' + after.url)
  add('没有整页刷新（标记还在）', after.navMark === before.navMark, 'before=' + before.navMark + ' after=' + after.navMark)
  add('播放器元素没有被重建（只有 1 个）', after.playerCount === 1 && back.playerCount === 1, 'count=' + after.playerCount + '/' + back.playerCount)
  add('audio 元素还在（没被销毁）', after.audioExists === true, String(after.audioExists))
  add('切换后**仍在播放**', after.paused === false, String(after.paused))
  add('切换后播放进度继续增长（没从头开始）', after.currentTime > before.currentTime, before.currentTime + 's -> ' + after.currentTime + 's')
  add('切换后唱片仍在转', after.animState === 'running', String(after.animState))
  add('再切回来也没断', back.paused === false && back.currentTime > after.currentTime, back.currentTime + 's')
  add('切回来角度继续累积（说明始终同一个元素）', back.discDeg !== before.discDeg || back.currentTime > before.currentTime, before.discDeg + '° -> ' + after.discDeg + '° -> ' + back.discDeg + '°')

  console.log('\n=== 逐项判定 ===')
  for (const c of checks) console.log('  ' + (c.ok ? '✓' : '✗') + ' ' + c.n + (c.ok ? '' : '   ← ' + c.d))
  const all = checks.every(c => c.ok)
  console.log('\n' + (all ? '✓ 全部通过：切换页面时音乐不中断' : '✗ 有未通过项'))
  cleanup()
  process.exit(all ? 0 : 3)
})().catch(e => { console.log('ERR ' + e.stack); cleanup(); process.exit(1) })
