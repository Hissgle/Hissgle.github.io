# 全站字体：Claude 风格混排

用最接近 Claude 的免费开源字体替换了全站字体：
**界面无衬线 + 正文/标题衬线 + 代码等宽**，中文沿用系统字体。

## 为什么不是 Claude 原版字体

Claude 用的是 Anthropic 委托定制的私有字体（Anthropic Serif / Sans / Mono，
前身是 Galaxie Copernicus + Styrene B），没有公开发售、不能合法自托管。
下面是观感最接近的免费替代，全部 SIL OFL-1.1 许可：

| 用途 | 替代字体 | 对应 Claude 的 | 字体文件 |
| --- | --- | --- | --- |
| 正文、文章标题、站名 | Source Serif 4 | Anthropic Serif（前身 Galaxie Copernicus） | `source-serif-4-latin-standard-{normal,italic}.woff2` |
| 导航、卡片信息、按钮、评论等界面 | Space Grotesk | Anthropic Sans（前身 Styrene B） | `space-grotesk-latin-wght-normal.woff2` |
| 代码、键盘键位（kbd） | JetBrains Mono | Anthropic Mono | `jetbrains-mono-latin-wght-{normal,italic}.woff2` |

许可原文在 `source/fonts/license-*.txt`（fontsource 随包分发）。

## 文件分工

| 文件 | 内容 |
| --- | --- |
| `source/fonts/` | woff2 字体文件 + 许可原文 |
| `source/css/fonts.css` | 字体栈变量（`--font-sans` / `--font-serif` / `--font-mono`）、`@font-face`、衬线的应用点。**换字体只改这一处** |
| `_config.butterfly.yml` | `font.font_family` / `code_font_family` / `blog_title_font.font_family` 只引用变量；`inject.head` 里加载 fonts.css 并 preload 两个首屏字体 |

衬线只应用在「内容」上：卡片标题（`.article-title`）、归档标题
（`.article-sort-item-title`）、文章页大标题（`#post-info .post-title`）、
正文（`#article-container`，文章页/关于页/友链页共用）。
导航、侧栏、按钮、标签云、评论等界面元素保持无衬线。

## 中文字体

这些拉丁字体没有汉字，中文回退到系统字体（macOS/iOS 苹方，Windows 微软雅黑，
Linux Noto Sans SC）—— **Claude 自己在中文环境下也是这个表现**，所以这是
「和 Claude 一致」而不是妥协。

如果以后想让中文也换成网页字体（比如思源宋体，衬线感更足），注意：

- 中文字体文件 5–15MB，整包自托管会明显拖慢首屏；
- 通常做法是**按用字子集化**（只打包站内实际出现的汉字，能压到几百 KB），
  或使用「中文网字计划」这类按 unicode-range 分片、按需加载的方案；
- 需要的话可以后续单独做。

## 加载策略

- 三个字体都是**变量字体**（Variable Font，一个字重范围一个文件）；
- `unicode-range` 限定为拉丁字符：中文不会触发这些字体，也不浪费渲染；
- `font-display: swap`：字体没到时先用系统字体显示，加载完再切换；
- 只 preload 首屏必用的两个文件（衬线 normal 约 122KB + 无衬线 22KB）；
  等宽、斜体文件只在页面真的出现对应文本时才被下载。

## 换字体 / 撤销

**换字体**：

1. 把新字体的 woff2 放进 `source/fonts/`；
2. 改 `source/css/fonts.css`：第 1 节的 `--font-*` 变量 + `@font-face` 的 `src`；
3. 完事，主题配置不需要动。

口味不合适时的备选：

- 衬线：PT Serif、Literata、Newsreader；
- 无衬线：Work Sans、DM Sans、Instrument Sans；
- 等宽：IBM Plex Mono、Fira Code。

**完全撤销**（回到主题默认系统字体）：

1. 删 `_config.butterfly.yml` 里的 `font:`、`blog_title_font:` 两块配置；
2. 删 `inject.head` 里 fonts.css 一行和两条 preload；
3. （可选）删 `source/css/fonts.css` 和 `source/fonts/`。

## 备忘

- 字体来源：fontsource（`@fontsource-variable` 系列包），woff2 已从 npmmirror
  下载进仓库 `source/fonts/`，运行时不再依赖外部 CDN；
- 升级版本时重新下载同名文件替换即可（当前：Source Serif 4 v5.3.1、
  Space Grotesk v5.3.0、JetBrains Mono v5.3.0）。
