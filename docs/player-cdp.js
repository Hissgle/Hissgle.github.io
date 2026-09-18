// 通过 CDP 用**真实可信的鼠标事件**点击黑胶唱片，验证播放/暂停与转动。
// 必须用真事件：headless 下 JS 的 .click() 不算用户交互，audio.play() 会被
// NotAllowedError 拒绝（这正是程序化点击测不出播放的原因）。
//
// 用法：
//   node docs/player-cdp.js                             # 默认 http://127.0.0.1:4000/ + 端口 9333
//   node docs/player-cdp.js http://127.0.0.1:4000/ 9333
//   node docs/player-cdp.js --launch                    # 自己拉起一个带调试端口的 Edge
//
// 不带 --launch 时，需要先手动起 Edge：
//   msedge.exe --headless=new --disable-gpu --remote-debugging-port=9333 \
//              --remote-allow-origins=* --user-data-dir=%TEMP%\edge-cdp about:blank
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const args = process.argv.slice(2).filter(a => a !== '--launch')
const LAUNCH = process.argv.includes('--launch')
const SITE = args[0] || 'http://127.0.0.1:4000/'
const PORT = Number(args[1] || 9333)
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let edgeChild = null
let edgeProfile = null

function launchEdge() {
  edgeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-cdp-'))
  edgeChild = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
    '--user-data-dir=' + edgeProfile, '--window-size=1200,800', 'about:blank',
  ], { stdio: 'ignore', detached: false })
  console.log('已拉起 Edge（pid ' + edgeChild.pid + '）')
}

function cleanup() {
  try { if (edgeChild) edgeChild.kill() } catch {}
  try { if (edgeProfile) fs.rmSync(edgeProfile, { recursive: true, force: true }) } catch {}
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map() }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws 连接失败')) })
    const c = new CDP(ws)
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data)
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id)
        c.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
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

const SNAP = [
  'function snap(tag) {',
  '  var root = document.getElementById("vinyl-player");',
  '  var disc = root && root.querySelector(".vinyl-disc");',
  '  var audio = root && root.querySelector("audio");',
  '  var cs = disc ? getComputedStyle(disc) : null;',
  '  var rect = disc ? disc.getBoundingClientRect() : null;',
  '  var anims = (disc && disc.getAnimations) ? disc.getAnimations() : [];',
  '  var m = cs ? cs.transform : "";',
  '  var deg = 0;',
  '  if (m && m.indexOf("matrix") === 0) {',
  '    var p = m.replace(/^matrix\\(/, "").replace(/\\)$/, "").split(",");',
  '    deg = Math.round(Math.atan2(parseFloat(p[1]), parseFloat(p[0])) * 180 / Math.PI);',
  '  }',
  '  return { tag: tag, deg: deg,',
  '    playState: cs ? cs.animationPlayState : null,',
  '    runtimePlayState: anims.length ? anims[0].playState : "(n/a)",',
  '    animName: cs ? cs.animationName : null,',
  '    animDuration: cs ? cs.animationDuration : null,',
  '    paused: audio ? audio.paused : null,',
  '    currentTime: audio ? Math.round(audio.currentTime * 1000) / 1000 : null,',
  '    readyState: audio ? audio.readyState : null,',
  '    error: audio && audio.error ? audio.error.code : null,',
  '    rootClass: root ? root.className : null,',
  '    rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,',
  '    visible: !!(cs && rect && cs.display !== "none" && cs.visibility === "visible" && parseFloat(cs.opacity) > 0 && rect.width > 40),',
  '    round: cs ? (cs.borderRadius.indexOf("50%") > -1) : null,',
  '    hasCoverImg: !!(root && (root.querySelector("img") || (cs && cs.backgroundImage.indexOf("url(") > -1))),',
  '    title: root && root.querySelector(".vinyl-hint b") ? root.querySelector(".vinyl-hint b").textContent : null,',
  '    stateText: root && root.querySelector(".vinyl-state") ? root.querySelector(".vinyl-state").textContent : null };',
  '}',
  'return snap("X");',
].join('\n')

async function evalIn(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval 失败')
  return r.result.value
}

;(async () => {
  if (LAUNCH) launchEdge()
  let version = null
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2500) })
      version = await r.json(); break
    } catch { await sleep(700) }
  }
  if (!version) {
    console.log('✗ 连不上 CDP（端口 ' + PORT + '）')
    console.log('  加 --launch 让它自己拉起 Edge，或先手动启动带 --remote-debugging-port 的 Edge')
    cleanup()
    process.exit(2)
  }
  console.log('浏览器: ' + version.Browser)

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(SITE)}`, { method: 'PUT' })).json()
  const cdp = await CDP.connect(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  console.log('等待播放器就绪（音频 src 到位）...')
  let ready = false
  for (let i = 0; i < 40; i++) {
    await sleep(700)
    const st = await evalIn(cdp, `(function(){var r=document.getElementById('vinyl-player');var a=r&&r.querySelector('audio');return {has:!!r,src:!!(a&&a.src),t:a?a.currentTime:-1};})()`)
    if (st.src) { ready = true; console.log('  就绪（第 ' + (i + 1) + ' 次探测）'); break }
  }
  if (!ready) console.log('  ⚠ 音频 src 一直没就绪，继续尝试点击')

  const states = []
  states.push(await evalIn(cdp, '(function(){' + SNAP + '})()'))

  async function realClick() {
    const box = await evalIn(cdp, `(function(){var s=document.querySelector('#vinyl-player .vinyl-stage');if(!s)return null;var r=s.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`)
    if (!box) throw new Error('找不到 .vinyl-stage 的位置')
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 })
    }
    return box
  }

  console.log('\n>>> 第 1 次真实点击（播放）')
  const box1 = await realClick()
  console.log('    点击坐标: ' + JSON.stringify(box1))
  await sleep(3500)
  states.push(await evalIn(cdp, '(function(){' + SNAP + '})()'))

  console.log('\n>>> 第 2 次真实点击（暂停）')
  await realClick()
  await sleep(1500)
  states.push(await evalIn(cdp, '(function(){' + SNAP + '})()'))

  console.log('\n>>> 再等 2.5 秒，确认角度真的不动了')
  await sleep(2500)
  states.push(await evalIn(cdp, '(function(){' + SNAP + '})()'))

  const by = {}
  states.forEach((s, i) => { by[['before', 'playing', 'paused', 'pausedLater'][i]] = s })

  for (const tag of ['before', 'playing', 'paused', 'pausedLater']) {
    const s = by[tag]; if (!s) continue
    console.log('\n=== ' + tag + ' ===')
    console.log('  角度 / 动画播放态 / 运行时态 : ' + s.deg + '° / ' + s.playState + ' / ' + s.runtimePlayState)
    console.log('  audio 暂停 / 进度 / readyState: ' + s.paused + ' / ' + s.currentTime + 's / ' + s.readyState)
    console.log('  容器 class                   : ' + s.rootClass)
    console.log('  界面文字                     : ' + JSON.stringify(s.title) + '  ' + JSON.stringify(s.stateText))
  }

  const b = by.before, p = by.playing, q = by.paused, r = by.pausedLater
  const checks = []
  const add = (n, ok, d) => checks.push({ n, ok: !!ok, d })
  add('唱片结构可见且是圆的', b && b.visible && b.round && b.animName)
  add('没有歌曲封面图', b && !b.hasCoverImg)
  add('初始暂停且不转', b && b.playState === 'paused' && b.paused === true, b && (b.playState + '/' + b.paused))
  add('真实点击后开始播放', p && p.paused === false, p && String(p.paused))
  add('播放时动画 running', p && p.playState === 'running', p && p.playState)
  add('播放时角度在变化', p && b && p.deg !== b.deg, b && (b.deg + ' -> ' + (p && p.deg)))
  add('播放时间在前进', p && p.currentTime > 0, p && String(p.currentTime))
  add('再次点击后暂停', q && q.paused === true, q && String(q.paused))
  add('暂停后动画 paused', q && q.playState === 'paused', q && q.playState)
  add('暂停后停在原角度不回 0', q && r && q.deg === r.deg && q.deg !== 0, q && (q.deg + '° -> ' + (r && r.deg) + '°'))

  console.log('\n=== 逐项判定 ===')
  for (const c of checks) console.log('  ' + (c.ok ? '✓' : '✗') + ' ' + c.n + (c.ok ? '' : '   ← ' + c.d))

  // 循环验证：先重新点一下开始播放，再把进度跳到接近结尾，看是否会自己绕回开头
  console.log('\n>>> 循环检查：先点一下开始播放')
  try {
    await realClick()
    await sleep(1200)
    const playing = await evalIn(cdp, `(function(){var a=document.querySelector('#vinyl-player audio');return {paused:a.paused,t:a.currentTime,d:a.duration,loop:a.loop};})()`)
    console.log('    当前状态: ' + JSON.stringify(playing))
    const beforeTime = await evalIn(cdp, `(function(){var a=document.querySelector('#vinyl-player audio');if(a.paused){return null}a.currentTime=Math.max(0,a.duration-0.4);return {t:a.currentTime,d:a.duration,loop:a.loop};})()`)
    console.log('    跳到结尾前 0.4s 后: ' + JSON.stringify(beforeTime))
    if (beforeTime) {
      await sleep(2500)
      const afterTime = await evalIn(cdp, `(function(){var a=document.querySelector('#vinyl-player audio');return {t:a.currentTime,paused:a.paused,ended:a.ended};})()`)
      console.log('    2.5 秒后: ' + JSON.stringify(afterTime))
      const looped = afterTime.paused === false && !afterTime.ended && afterTime.t < beforeTime.t
      add('播放到结尾会自动回到开头继续（= 一直循环这一首）', looped,
        '跳到 ' + beforeTime.t + 's -> ' + afterTime.t + 's, paused=' + afterTime.paused)
      const stillSpinning = await evalIn(cdp, `(function(){var d=document.querySelector('#vinyl-player .vinyl-disc');return getComputedStyle(d).animationPlayState;})()`)
      add('循环期间唱片仍在转', stillSpinning === 'running', String(stillSpinning))
    } else {
      add('循环验证', false, '音频没在播放，无法验证')
    }
  } catch (e) {
    add('循环验证', false, e.message)
  }

  console.log('\n=== 补充判定 ===')
  for (const c of checks.slice(-2)) console.log('  ' + (c.ok ? '✓' : '✗') + ' ' + c.n + (c.ok ? '' : '   ← ' + c.d))

  // 截图，方便直接看效果
  try {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const out = path.join(__dirname, 'vinyl-screenshot.png')
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log('\n截图已保存: ' + out)
  } catch (e) { console.log('截图失败: ' + e.message) }

  const all = checks.every(c => c.ok)
  console.log('\n' + (all ? '✓ 全部通过' : '✗ 有未通过项'))
  cleanup()
  process.exit(all ? 0 : 3)
})().catch(e => { console.log('ERR ' + e.stack); cleanup(); process.exit(1) })
