# 外观美化说明

本次改动都在 `_config.butterfly.yml` 里，**只改配置，没动主题模板**，
所以想撤销随时把对应几段删掉即可恢复原样。

## 改了什么

| 项目 | 改动 | 效果 |
| --- | --- | --- |
| 首页文章封面 | 新增 `cover.default_cover`（6 组渐变色） | 卡片顶上从"空白"变成有颜色的配图块 |
| 页面背景 | 新增 `background`（淡蓝白渐变） | 原本两侧大片纯白，有了层次 |
| 首屏副标题 | 新增 `subtitle`，接一言 API + 打字机 | 首屏有轮播的打字句子 |
| 加载进度条 | 新增 `preloader`（pace，顶部细条） | 进站有加载反馈 |
| 点击爱心 | 新增 `click_heart` | 点击页面冒爱心，仅桌面端 |
| 运行天数 | `aside.card_webinfo.runtime_date` | 侧边栏显示「已运行 xx 天」 |
| 侧边栏最新评论 | `aside.card_newest_comments` | 把最新评论显示在侧边栏 |
| 顶部菜单 | 新增 `menu` + `nav.fixed` | 首页/关于/友链/归档，导航吸顶 |
| 关于页 | 新增 `source/about/index.md` | `/about/` |
| 友链页 | 新增 `source/link/index.md` + `source/_data/link.yml` | `/link/` |

## 新增页面的维护方式

### 关于页 `/about/`
直接编辑 `source/about/index.md` 的正文即可（普通 Markdown）。

### 友链页 `/link/`
页面本身在 `source/link/index.md`（`type: link`），**友链数据在 `source/_data/link.yml`**，
两者分开。加友链就在 `link.yml` 的 `link_list` 里追加一项：

```yaml
    - name: 站名
      link: https://example.com
      avatar: https://example.com/avatar.jpg
      descr: 一句话简介
```

`link.yml` 里目前放的是 **Hexo / Butterfly / Waline 三个示例条目**，
记得换成你自己的真实友链，不需要就整节删掉。

### 菜单
`_config.butterfly.yml` 的 `menu:` 段，语法：

```yaml
  显示名称: /路径/ || 图标class
```

图标从 <https://fontawesome.com/v5/search> 挑 `fas`/`fa-solid` 开头的。
想加二级菜单，参考主题 `_config.yml` 里 `menu` 段的注释写法。

### 建站日期
`runtime_date: 2026/9/17 12:00`（就是建站当天）。
以后想改直接改这一行，格式 `年/月/日 时间`。
> 生效原理：模板用 `date_xml` 输出 **UTC 的 ISO 时间**（如 `2026-09-17T04:00:00.000Z`），
> 浏览器再按本地时区解析。所以它与本机时区无关，不会算错天数。
> 建站当天会显示「0 天」，属正常。

## 几个容易踩的坑

### 1. `subtitle.effect` 的取值是反的

主题源码 `layout/includes/third-party/subtitle.pug` 里：

```pug
if !{effect}          // effect: false → 走"启用打字效果"分支
  ...
else                  // effect: true  → 直接设文本，不打字
```

所以 **`effect: false` 才是启用打字机**。配置注释写的是"Typewriter Effect"，
很容易理解反，注意别改错。

### 2. 渐变色不要以 `#` 开头单独出现

主题的 `getBgPath` 会先判断颜色格式：

```js
if (colorPattern.test(path)) return `background-color: ${path};`   // # / rgb / hsl 开头
```

所以：

- `'#ff7e5f'` → 会被当成 `background-color`（纯色，可以）
- `'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'` → 走 `background:`（正确用法）

渐变里的 `#` 在括号内部，不影响判断，可以放心写。

### 3. 封面现在随机取自 6 组渐变

但**你目前只有 1 篇文章**，所以只能看到其中一张。
等你多写几篇，首页卡片才会呈现出彩色错落的效果。

### 4. 一言 API 挂了不会空白

`subtitle.source: 1` 调的是 `https://v1.hitokoto.cn`。
接口失败时主题会自动回退到 `subtitle.sub` 里的文案（当前是"记录一些碎碎念"），
所以首屏不会出现空白。

## 还没做的（可以继续加）

### 视觉
- **真实封面图**：把 `default_cover` 里的渐变换成 `/img/xxx.jpg`
- **页面背景换成图片**：`background: url(/img/xxx.jpg)`（注意图片体积）
- **头像特效**：`avatar.effect: true` 让头像转圈

### 交互趣味（建议最多开 1–2 个）
已经开了 `click_heart`。想再加就改主题配置里对应项的 `enable: true`：

| 配置项 | 效果 | 备注 |
| --- | --- | --- |
| `canvas_ribbon` | 背景彩带 | 记得 `mobile: false` |
| `canvas_nest` | 鼠标粒子连线 | `mobile: false` |
| `fireworks` | 点击放烟花 | 比较花哨，和 click_heart 二选一 |
| `activate_power_mode` | 打字爆炸特效 | 很花哨，慎用 |

### 内容（这才是"单调"的根源）
- **多写几篇**、给文章打 **tags / categories** → 侧边栏的分类、标签卡片才是空的
  （点进去会显示 0 篇，略尴尬）
- 把 `source/_data/link.yml` 里的示例友链换成真实友链
- 文章可用 `sticky: 1` 置顶
