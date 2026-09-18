/* ===========================================================================
   访客统计源 诊断脚本
   ---------------------------------------------------------------------------
   用法：
   1. 打开你部署后的博客首页（线上地址，不要用本地 hexo server）
   2. 按 F12 → 切到「Console / 控制台」
   3. 把下面整段代码复制粘贴进去，回车
   4. 看输出：哪个源显示「可用」就用哪个

   它会真实地把候选脚本加载进当前页面，然后检查计数器有没有被填上数字。
   =========================================================================== */
(async () => {
  const candidates = [
    ['vercount（当前使用）', 'https://events.vercount.one/js'],
    ['busuanzi 官方', '//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js']
  ]
  const ids = ['busuanzi_value_site_uv', 'busuanzi_value_site_pv', 'busuanzi_value_page_pv']

  const load = url => new Promise(resolve => {
    const t0 = Date.now()
    const s = document.createElement('script')
    s.async = true
    s.onload = () => resolve({ ok: true, ms: Date.now() - t0 })
    s.onerror = () => resolve({ ok: false, ms: Date.now() - t0 })
    s.src = url
    document.head.appendChild(s)
    setTimeout(() => resolve({ ok: false, ms: '超时(10s)' }), 10000)
  })

  const readCounters = () => ids.map(id => {
    const el = document.getElementById(id)
    if (!el) return id + '=（本页没有）'
    const t = el.textContent.trim()
    return id + '=' + (t === '' ? '（空）' : t)
  }).join('   ')

  for (const [name, url] of candidates) {
    console.log('\n──────── ' + name + ' ────────')
    const r = await load(url)
    console.log('  脚本下载：' + (r.ok ? 'OK' : '失败') + '  (' + r.ms + ')')
    if (!r.ok) {
      console.log('  ❌ 脚本压根下载不下来 → 这个源在你的网络上不可用')
      continue
    }
    await new Promise(res => setTimeout(res, 3000))
    const counters = readCounters()
    console.log('  计数器值：' + counters)
    console.log(/=\d/.test(counters)
      ? '  ✅ 已填上数字 → 这个源可用'
      : '  ⚠️ 脚本能下载但数字没填上（可能是这个域名被统计接口拦截）')
  }

  console.log('\n说明：本站访客数/总浏览量在首页侧边栏；单篇浏览量在文章页标题下方。')
  console.log('若两个源都不可用，就要自建计数服务（可部署到你自己的 Vercel）。')
})()
