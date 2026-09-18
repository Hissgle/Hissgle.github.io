# 网易云音乐播放器（黑胶唱片）排查与实现记录

配置文件：`_config.butterfly.yml` 的 `inject` 段 + `pjax` 段 + `CDN.option.pjax`。
验证脚本：`docs/player-cdp.js`（唱片交互）、`docs/pjax-check.js`（切换页面不中断）。

## 当前效果
左下角一枚黑胶唱片，界面全部用 CSS 画（**没有歌曲封面**）：

- 播放中 → 唱片匀速缓缓转动（默认 20s 一圈，可配）
- 点一下 → 暂停，**并停在当时转到的角度**，不跳回起点
- 再点一下 → 从原角度继续转
- 圆盘上有纹路、斜向高光、圆心标签和轴孔，右侧一根唱臂在播放时压下来
- **切换页面（点导航栏）时音乐不中断**，继续从原进度播放

配置在 `data-vinyl` 里：

```json
{ "type": "song", "id": "1303464858", "server": "netease",
  "api": "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
  "loop": "one", "size": 132, "spin": 20, "label": "#f3c6d4" }
```

| 字段 | 作用 |
|---|---|
| `type` / `id` | `song` + 歌曲 ID，或 `playlist` + 歌单 ID（**类型和 ID 必须匹配**） |
| `loop` | `one` 单曲循环 / `all` 列表循环 / `none` 播完停 |
| `size` | 唱片直径 px |
| `spin` | 转一圈的秒数，越大越慢 |
| `label` | 圆心标签底色（纯装饰） |

---

## 切换页面保持播放（Pjax）
不开 pjax 时点导航栏是**整页刷新**，播放器被销毁，音乐必然中断。开了之后只替换
`#body-wrap` / `.js-pjax` 里的内容，而播放器在它们**之外**，所以 `<audio>` 一直活着。

```yaml
pjax:
  enable: true
  exclude:

CDN:
  option:
    pjax: https://registry.npmmirror.com/pjax/0.2.8/files/pjax.min.js
```

两个关键点：

1. **`CDN.option.pjax` 这一行是必须的。** 主题默认拼出来的地址是
   `https://cdn.jsdelivr.net/npm/pjax@0.2.8/dist/pjax.min.js`，**实测 404** ——
   pjax 这个包根本没有 `dist/` 目录，浏览器版就放在包根目录（`pjax.min.js`）。
   不覆盖它的话 pjax 根本加载不到，控制台只报 `Pjax is not defined`，
   表现为"点了导航栏还是整页刷新、音乐照样断"。
2. **播放器的初始化脚本不能加 `data-pjax` 属性。** 主题的 `pjax:complete` 只会重跑带
   `data-pjax` 的 `<script>`；不带就只跑一次，不会叠出第二个播放器。
   （脚本里另有一行 `existing && existing.src` 的兜底，防止将来被重跑时出问题。）

### 这个方案的边界
- 站内链接（导航栏、文章卡片、归档等）→ pjax 接管，音乐不断 ✓
- **外站链接**、`target="_blank"`、强制整页刷新的操作 → 仍然会中断（浏览器行为，无法避免）
- 刷新页面、直接输网址进入 → 从头开始（这是新一次加载，不是"切换"）
- 访问不存在的页面（404）时，因为主题 `error_404.enable: false`，
  pjax 会走 `window.location.href` 整页跳转 → 音乐中断。在意的话可以开
  `error_404.enable: true` 让它走 pjax（注意主题默认的 `background: /img/error-page.png`
  在你仓库里并不存在，别开成破图）。

验证：`node docs/pjax-check.js --launch`（10 项，含"进度继续增长而非从头开始"）。

---

## 结论速览：这一路踩过的 6 个坑
| 现象 | 真正原因 | 处理 |
|---|---|---|
| 播放器完全不显示 | `type: "playlist"` 却填了**单曲 ID**，接口返回 HTTP 500 | 类型和 ID 要匹配 |
| 换对 ID 仍不显示 | **MetingJS 2.0.1 在 Chromium 里根本不会接管那个 div** | 弃用 MetingJS |
| 界面是空的 / `stage is not defined` | **脚本里的 `//` 行注释把后面整行代码注释掉了** | 只用 `/* */` |
| 改了配置没反应 | **`hexo server` 不热加载 `_config.butterfly.yml`** | 必须重启 server |
| 唱片在转但没声音 | 该曲直链 404（版权限制） | 换一首实测可播的 |
| 一切正常但切换页面音乐断 | 没开 pjax（整页刷新销毁播放器） | 开 pjax + 覆盖 pjax 的 CDN 地址 |
| 开了 pjax 还是断 | 主题拼的 pjax 地址（`.../dist/pjax.min.js`）是 404，库压根没加载 | 用 `CDN.option.pjax` 指向可用地址 |

---

## 坑 1：类型和 ID 必须匹配
`data-type="playlist"` + 单曲 ID 时接口返回 500：

```
https://api.i-meto.com/meting/api?server=netease&type=playlist&id=1829811265
-> HTTP 500  上游 API 调用失败
```

同一个 ID 用 `type=song` 就正常（返回 *Rainy proof - HACHI*）。
拿 ID：歌单看地址栏 `#/playlist?id=XXX`，单曲看 `#/song?id=XXX`。

## 坑 2：MetingJS 不会接管那个 div（最难查）
换对 ID 后播放器**依然不显示**，而且控制台**一个报错都没有**。用真实 Edge 抓 JS 执行完的 DOM：

```
window.APlayer   : function       # APlayer 加载正常
meting-js 已注册 : true           # 自定义元素也注册了
节点构造器       : HTMLDivElement  # ← 但那 div 还是普通 div，没被升级
容器子节点数     : 0
```

MetingJS 2.0.1 的注册方式是 customized built-in element：

```js
class MetingJSElement extends HTMLElement { ... }
window.customElements.define('meting-js', MetingJSElement)
```

这要求标签写 `is="meting-js"` 且由插件主动升级元素。实测 `<div class="aplayer" data-...>`
在 Edge/Chromium 里**永远停留在 HTMLDivElement**，`connectedCallback` 从不触发，
所以 `_parse()`/`_loadPlayer()` 从不执行。加 `is="meting-js"` 也一样不生效。

**处理：不用 MetingJS，也不用 APlayer 的 UI。** 自己 `fetch` 数据 +
原生 `<audio>` + 自绘界面。见坑 3。

## 坑 3：`inject` 里的 `//` 行注释会毁掉整段脚本 ⭐
**Hexo 处理 `inject` 时会把整段的换行折叠成空格**（整个脚本变成一行）。于是：

```js
// ---- 结构 ----
var stage = el("div", "vinyl-stage");   // ← 这一行连同声明一起被注释掉了
```

折叠后变成 `// ---- 结构 ---- var stage = el(...)`，
结果报 `ReferenceError: stage is not defined`，播放器完全不显示。

> 为什么这坑特别阴：报错信息看起来完全不像注释问题，
> 而且**同一位置用 `innerHTML = "大段字符串"` 时症状更诡异**
> —— 赋值那行被注释掉后 `innerHTML` 读回来是空的，
> 我一度以为是 `innerHTML` 的赋值被丢弃了，查了很久字节码。

**规则：`inject` 里的脚本一律只用 `/* */` 注释，不要用 `//`。**

## 坑 4：`hexo server` 不热加载配置文件
改完 `_config.butterfly.yml` 不重启 server 的话，它一直用启动时读到的旧配置
（这也是"改了没用""还是看不到"的常见原因）。`hexo generate` 每次都会重新读，所以 `public/` 是对的。

```bash
node node_modules/hexo/bin/hexo clean
node node_modules/hexo/bin/hexo server
```

## 坑 5：不是每首歌都能播
这个公共接口里大量歌曲直链返回 404（版权限制），表现是「唱片在转但没声音」。实测同一时刻：

| 来源 | 可播 |
|---|---|
| 歌单（热歌榜）前 6 首 | 4/6 |
| `type=song` 随机 14 首热门 | 0/14 |
| 从歌单捞出的可播曲目，再用 `type=song` 查 | 4/5 |

→ **404 是逐曲版权限制，不是 `type=song` 的问题。**
你原先想放的《Rainy proof》(HACHI) 直链实测 404，放不了。

实测可播的单曲 ID：

| ID | 歌曲 |
|---|---|
| 1303464858 | 于是 - 郑润泽 ← 当前 |
| 1973665667 | 海屿你 - 马也_Crabbit |
| 3342319503 | 明知故犯 - Max李玄 |
| 1827600686 | 还是会想你 - 林达浪 / h3R3 |
| 2600493765 | 恋人 - 李荣浩 |
| 316157 | 茶汤 - 郁可唯 |

---

## 另一类坑：`inject` 的书写规则
1. **不会自动加 `<script>` 标签**。内容原样拼进 HTML，脚本必须自带 `<script>...</script>`，
   否则整段变成页面上的纯文本。
2. **不要让值以 `{` 开头**（YAML 会当 flow mapping 解析）。整条用单引号包住，
   内部 JSON 用双引号，例如 `data-vinyl='{"type":"song",...}'`。
3. **脚本里不要写 `//` 注释**（见坑 3）。

---

## 验证方式
```bash
# 1. 先起站点
node node_modules/hexo/bin/hexo server

# 2. 真实浏览器 + 真实鼠标点击验证（自己拉起 Edge）
node docs/player-cdp.js --launch

# 或对已有调试端口的 Edge：
node docs/player-cdp.js http://127.0.0.1:4000/ 9333
```

实测输出（13 项全过）：

```
✓ 唱片结构可见且是圆的      ✓ 没有歌曲封面图
✓ 初始暂停且不转            ✓ 真实点击后开始播放
✓ 播放时动画 running        ✓ 播放时角度在变化
✓ 播放时间在前进            ✓ 再次点击后暂停
✓ 暂停后动画 paused         ✓ 暂停后停在原角度不回 0
    跳到 232.435813s -> 2.5 秒后 1.702145s, paused=false
✓ 播放到结尾会自动回到开头继续（= 一直循环这一首）
✓ 循环期间唱片仍在转
```

关键数字：播放时角度从 `0°` 转到 `62°`，暂停后 `63°` → 2.5 秒后仍是 `63°`
（证明是 `animation-play-state: paused` 停住，而不是重置回 0）；
`currentTime` 从 232.4s 绕回 1.7s（证明循环在跑）。截图见 `docs/vinyl-screenshot.png`。

### 为什么必须用真实点击
headless 下用 JS `element.click()` **不算用户交互**，`audio.play()` 会被拒：

```
NotAllowedError: play() failed because the user didn't interact with the document first.
```

这正是程序化点击测不出播放的原因。所以脚本走 CDP 的
`Input.dispatchMouseEvent` 发真实鼠标事件（`mousePressed` / `mouseReleased`）。

> 另外：**不要用 jsdom 给这套东西下结论**。它不做自定义元素升级、
> 不连网络、也不遵守真实的事件语义，我一开始用它得出过错误结论。

## 自动播放说明
`autoplay` 现在没有开，需要访客点一下——这也是浏览器策略要求的
（「有声音的自动播放」普遍被拦，开启后大多数访客看到的仍是暂停状态）。
如果你想让它一进页面就转起来但不出声，可以把 `audio.muted = true` + `audio.autoplay = true`，
代价是访客不知道它在放。
