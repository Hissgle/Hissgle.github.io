# 访问统计 + 评论功能 配置说明

本站是 Hexo + Butterfly 主题的纯静态博客，部署在 GitHub Pages。
静态站点自身无法保存数据，所以两部分功能的实现方式不同：

| 功能 | 方案 | 是否需要后端 | 当前状态 |
| --- | --- | --- | --- |
| 本站访客数（UV） | Vercount（兼容不蒜子） | 否，用公共接口 | ✅ 已生效 |
| 本站总浏览量（PV） | Vercount（兼容不蒜子） | 否，用公共接口 | ✅ 已生效 |
| 每篇文章浏览量 | Vercount（兼容不蒜子） | 否，用公共接口 | ✅ 已生效 |
| 评论 | Waline | 需要（免费部署） | ✅ 已接好，等后端可用 |

所有配置都写在项目根目录的 `_config.butterfly.yml` 里，
它只覆盖 Butterfly 主题需要改动的项，其余沿用主题默认值。

---

## 一、访问统计（已完成，无需额外操作）

主题内置了不蒜子的支持，`_config.butterfly.yml` 中已开启：

```yaml
busuanzi:
  site_uv: true    # 本站访客数
  site_pv: true    # 本站总浏览量
  page_pv: true    # 每篇文章浏览量

aside:
  card_webinfo:
    enable: true   # 侧边栏「网站资讯」卡片，UV/PV 显示在这里
```

显示位置：

* **本站访客数 / 本站总浏览量** → 首页侧边栏的「网站资讯」卡片
  （如果侧边栏被折叠，点右上角的菜单按钮展开）
* **每篇文章浏览量** → 文章标题下方的信息栏，眼睛图标 `浏览量: N`

刷新页面就能看到数字，不需要任何注册或账号。

### 统计脚本用的是 Vercount（不蒜子的替代）

原本主题默认加载不蒜子官方脚本 `busuanzi.ibruce.info`，但该服务长期不稳定、
经常加载不出来，页面表现就是**「本站访客数 / 本站总浏览量一直在转圈」**
（转圈图标是模板输出的，脚本不到就永远转）。

现在改用 [Vercount](https://vercount.one)：它是专门为替代不蒜子而做的计数器
（[项目地址](https://github.com/EvanNotFound/vercount)），**完全兼容不蒜子的 span 标签**，
所以页面上的 `busuanzi_value_site_uv` / `busuanzi_value_site_pv` /
`busuanzi_value_page_pv` 三个 id 一个都不用改，只换了脚本地址：

```yaml
CDN:
  option:
    busuanzi: https://events.vercount.one/js
```

想换回官方不蒜子，把 `_config.butterfly.yml` 里这个 `CDN:` 段删掉即可
（删掉后会退回 `//busuanzi.ibruce.info/...`）。

配套还修了主题的一个小问题：`themes/butterfly/layout/includes/head/preconnect.pug`
原来把预连接地址写死成不蒜子的域名，换成 Vercount 后会指向一个无关域名。
现已改成按实际脚本地址推导。

#### 如果统计还是在转圈

说明 `events.vercount.one` 在你的网络下也不通。用诊断脚本测一下到底哪个源可用：

1. 打开部署后的博客首页 → F12 → Console
2. 粘贴 `docs/counter-diagnose.js` 的全文，回车
3. 输出会告诉你「vercount」和「busuanzi 官方」哪个能下载、数字能不能填上

两个都不可用的话，就只剩**自建计数服务**这条路（Vercount 本身支持自托管：
Go + Redis，或部署到自己的 Vercel），需要的话我再帮你搭。

### 关于不蒜子系计数器的两点说明

1. 数据存在服务方的服务器上，不收费、不需要登录，但属于第三方公益服务，
   随时可能不稳定。数字显示为空或转圈，多半是对方服务的问题，不是博客配错了。
2. 如果你希望数据完全自己掌控，可以改用自己的后端。目前 Waline 后端
   （Vercel）只提供"每篇文章浏览量"，没有站点级 UV，所以**不能直接替代**上面的站点统计。

---

## 二、评论功能（Waline）

评论用的是 [Waline](https://waline.js.org/)：免费、开源、自带评论管理后台，
评论数据存在自己的数据库里。

### 为什么不能直接生效

Waline 由两部分组成：

* **前端**（已经在你的网站里了，由主题自动加载）
* **后端**（需要你部署一次，用来存评论）

后端必须用你自己的账号部署，我无法代替你操作。部署一次之后就不用再管了。

### 第 1 步：部署 Waline 后端（约 10 分钟）

Waline 现在（v3）**默认使用 Neon PostgreSQL 作数据库**。
只点一键部署是**不够的**——没有连接数据库时，函数一执行就崩，
表现为 `/` 返回 `500 FUNCTION_INVOCATION_FAILED`、发评论报 `fail to fetch`。
官方文档也明确说明了这个 500 是"没有连接 Neon 数据库导致的"。

按顺序做：

1. 打开 <https://waline.js.org/guide/get-started/>
2. 点页面里的 **Deploy to Vercel** 按钮
3. 用 GitHub 账号登录并授权，仓库名随意（例如 `waline`）
4. **建数据库**：Vercel 项目 → 左侧 **Storage** → **Create Database**
   → 在 `Marketplace Database Providers` 里选 **Neon** → Continue
5. 会提示创建 Neon 账号 → 选 **Accept and Create**。套餐/地区保持默认
6. 数据库建好后，点 **Connect** → 再点 **Connect Project** 确认
   （这一步 Vercel 会自动注入 `POSTGRES_*` 环境变量，Waline 靠它认到数据库）
7. **建表**：数据库详情页点 **Open in Neon** → 左侧 **SQL Editor**
   → 粘贴本仓库 `docs/waline-neon-safe.sql` 的全部内容 → 点 **Run**
   （**先 Ctrl+A 清空编辑区，粘贴后确保没有任何文字被选中**，
   否则 Neon 只会执行选中的那一段——这是最容易踩的坑）
8. **Redeploy**：Vercel → **Deployments** → 点最上面那次部署 → **Redeploy**
   （环境变量不会注入到已经构建好的部署里，**必须重新部署**）
9. 等 STATUS 变成 `Ready`

> 第 7 步的 SQL 文件来自官方
> [assets/waline.pgsql](https://github.com/walinejs/waline/blob/main/assets/waline.pgsql)，
> 已校验：3 张表（`wl_comment` / `wl_counter` / `wl_users`）+
> 3 个序列，列数与主键均与上游一致。
> 脚本用 `DO` 块包裹每条语句并捕获 `duplicate_table`，
> 所以**已存在的表会自动跳过，可以反复执行、不会报错**。
> 若以后升级 Waline 需要新表，请以上游文件为准。

### 第 2 步：注册管理员

访问 `https://你的后端地址/ui/register`。

**第一个注册的账号自动成为管理员**，请记好密码。
之后登录 `/ui` 就是评论管理后台。

> 如果这一步报 `500: relation "wl_users" does not exist`，
> 说明上面第 7 步的建表 SQL 没执行成功——回到 Neon 的 SQL Editor 重跑一次
> `docs/waline-neon-safe.sql`，不需要重新 Redeploy。
> 若报 `relation "wl_comment_seq" already exists`，说明你跑的是**没有加防重复保护**
> 的旧脚本，换成上面这份 safe 版即可（或者按提示先 `Ctrl+A` 清空编辑区再粘）。

### 第 3 步：把地址填进配置

编辑 `_config.butterfly.yml`，找到 `waline:` 这一段：

```yaml
waline:
  serverURL:        # ← 改成你的后端地址，例如 https://waline-xxxxxxxx.vercel.app
```

注意**结尾不要带 `/`**。

### 第 4 步：开启评论

还是在 `_config.butterfly.yml` 里，把 `comments.use` 留空改为 `Waline`：

```yaml
comments:
  use: Waline       # ← 原来是空的，改成 Waline
```

然后重新生成并部署：

```bash
pnpm run clean
pnpm run build      # 等价于 hexo generate
pnpm run deploy     # 等价于 hexo deploy，推送到 GitHub Pages
```

### 第 5 步（可选）：在首页卡片显示每篇评论数

想让首页每篇文章卡片上显示评论数，把 `comments.card_post_count` 设为 `true`
（默认已经是 `true`，但只有填了 `serverURL` 之后才会有数字）。

---

## 三、环境问题修复记录（与统计/评论无关，但必须保留）

原先 `hexo generate` 会输出下面这类报错，虽然仍能生成页面，但页面类型判断
（`getPageType`）全部失效，侧边栏、归档页等会异常：

```
ERROR Script load failed: themes\butterfly\scripts\helpers\page.js
Error: Cannot find module 'moment-timezone'
TypeError: ...layout\includes\layout.pug:1
getPageType is not a function
```

**原因**：Butterfly 主题同时存在于两处 —— `themes/butterfly/`（实际使用的目录）
和 `node_modules/hexo-theme-butterfly`（pnpm 安装的包）。主题脚本
`scripts/helpers/page.js` 需要 `hexo-util` 和 `moment-timezone`，
pnpm 只为 `node_modules/` 里的那份主题准备好了依赖，
而 `themes/butterfly/` 下没有 `node_modules`，Node 找不到这两个包。

**修复**：在 `themes/butterfly/node_modules/` 下建立两个目录联接
（junction，指向 pnpm 已装好的真实包目录；该目录已被主题 `.gitignore` 忽略）：

```powershell
cmd /c mklink /J themes\butterfly\node_modules\hexo-util `
  node_modules\.pnpm\hexo-util@4.0.0\node_modules\hexo-util
cmd /c mklink /J themes\butterfly\node_modules\moment-timezone `
  node_modules\.pnpm\moment-timezone@0.6.4\node_modules\moment-timezone
```

**注意**：如果以后重装依赖（`pnpm install`）或换电脑，
这两个联接会丢失，届时重新执行上面的命令即可；
漏掉的话构建不会报致命错误，但会重新出现上面那段 `getPageType` 报错。

---

## 四、日常使用与维护

### 管理评论

部署 Waline 时注册的管理员账号，登录

```
https://你的后端地址/ui
```

就能看到评论管理后台，可以审核、回复、删除评论。

### 关于 `comments.count`

`comments.count` 已设为 `false`，这是有意为之：
Butterfly 主题只有 Disqus/Gitalk 这类自带统计脚本的系统会回填「文章顶部信息栏」
里的评论数，Waline 不会，开了只会留下一个永远空白的数字。
Waline 的评论数由**评论框表头**（`N 条评论`）和**首页卡片**显示。

### 换行文 / 清缓存

如果改完配置没生效，执行一次：

```bash
pnpm run clean && pnpm run build
```

`public/` 和 `db.json` 都是生成物，已在 `.gitignore` 中忽略。

---

## 五、常见问题

**Q: 侧边栏没有看到「网站资讯」卡片？**
A: 该卡片只在首页显示，并且侧边栏需要在桌面宽度下才展开（手机上是抽屉式菜单）。

**Q: 访客数一直是 0 / 显示转圈？**
A: 不蒜子的接口偶有不稳定，换网络或稍后再看。若长期为 0，
说明浏览器插件（如广告拦截）屏蔽了 `busuanzi.ibruce.info`。

**Q: 发评论报 `fail to fetch`？**
A: 不是跨域问题。`fail to fetch` 表示请求**没拿到响应**，通常是后端函数崩溃返回 500。
按顺序检查：数据库是否已连接（Storage → Neon → Connect Project）、
建表 SQL 是否执行过、环境变量加完后是否 **Redeploy** 过。
在文章页 F12 → Network 看那条 `comment` 请求的状态码，201/200 才算通。

**Q: 注册管理员报 `500: relation "wl_users" does not exist`？**
A: 数据库连上了，但**表没建**。去 Neon 的 SQL Editor 执行
`docs/waline-neon-safe.sql`（不需要重新 Redeploy），然后重新注册即可。

**Q: 评论框没有出现？**
A: 按顺序检查三点 ——
`comments.use` 是否为 `Waline`；`waline.serverURL` 是否已填且结尾无 `/`；
浏览器控制台是否有跨域或 404 报错。填错地址时浏览器控制台会明确提示。

**Q: 换了域名 / 部署地址，评论会丢吗？**
A: Waline 按页面路径（`path`）记录评论，与域名无关，
所以换域名不影响已有评论。

**Q: 想换评论系统怎么办？**
A: 主题支持 Twikoo、Artalk、Giscus、Valine 等十余种，
把 `comments.use` 改成对应名字并填好该系统的配置即可，
无需改任何模板代码。
