# 写作台（myblog-admin）

博客右下角「+」背后的管理端：GitHub 登录、Markdown 编辑、图片上传、草稿、编辑旧文、一键发布。

> 当前状态：代码已实现，本地构建与 13 个纯函数测试通过；尚未创建 OAuth App / Neon / Vercel，也尚未把仓库改为私有。按本文第 0–3 节操作即可上线。

- **管理端**：Vercel（React + Vercel Functions）
- **草稿/会话/审计**：Neon Postgres（`blog_admin` schema）
- **文章/图片**：Git 仓库的 `source/_posts` 与 `source/img/posts`
- **发布**：服务端用细粒度 PAT 提交到 `main`，触发现有的 GitHub Actions，约 1–3 分钟上线
- **权限**：GitHub OAuth + 你的数字 ID 白名单 + 仓库 `push` 权限检查；只有你能发布

> 这个子项目用 **npm**（`package-lock.json`）而不是根目录的 pnpm，避免和 Hexo 的依赖/workspace 互相影响。Vercel 的 Root Directory 设为 `admin`。

---

## 0. 先确认：私有仓库 + GitHub Pages

你决定把仓库设为私有。请先确认：

- **GitHub Free 的私有仓库不能使用 GitHub Pages。** 私有仓库 + Pages 需要 GitHub Pro / GitHub Team / Enterprise。
- 如果账号没有 Pro，**把仓库改成私有会让现有的 GitHub Pages 发布停止**。可以：
  1. 升级 GitHub Pro；
  2. 暂时保持仓库 public（管理端代码仍然可以只让你登录）；
  3. 或把博客托管迁到 Vercel / Cloudflare Pages。
- 仓库私有**不等于**页面私有：Pages 站点通常仍然是公开的，否则访客看不到博客。请保持 Pages 站点公开。
- 私有仓库的 Actions 会消耗免费分钟数（个人账号每月约 2,000 分钟；每次构建约 1–2 分钟）。

**建议顺序**：先在 GitHub 上确认 Pages 对私有仓库可用，再改仓库可见性；否则线上会直接断。

---

## 1. 你需要准备

| 项目 | 用途 |
|---|---|
| GitHub 仓库 `Hissgle/Hissgle.github.io` | 文章源 + Actions |
| GitHub OAuth App | 登录身份（scope `repo`） |
| 细粒度 PAT | 服务端提交文章（只给这一个仓库） |
| Neon Postgres | 草稿 / 会话 / 发布记录 |
| Vercel 项目 | 管理端网页 + API |

### 1.1 创建 OAuth App

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App：

- **Application name**：`Hissgle Writing Desk`
- **Homepage URL**：`https://myblog-admin.vercel.app`（换成你的 Vercel 域名）
- **Authorization callback URL**：`https://myblog-admin.vercel.app/api/auth/callback`

创建后记下 `Client ID`，生成 `Client Secret`。Scope 在代码里固定为 `repo`（私有仓库需要）。

> 本地开发可以再建一个 OAuth App，callback 填 `http://localhost:3000/api/auth/callback`；或者临时把上面这个 App 的 callback 改成 localhost，开发完改回来。

### 1.2 创建细粒度 PAT

GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token：

- **Resource owner**：`Hissgle`
- **Repository access**：Only select repositories → `Hissgle/Hissgle.github.io`
- **Permissions**：
  - `Contents`：Read and write
  - `Actions`：Read
  - `Metadata`：Read（必选）
- **Expiration**：90 天（记入日历，到期前轮换）

### 1.3 Neon

在 Neon 项目里新建一个 database（例如 `blog_admin`），拿 **pooled connection string**（带 `sslmode=require`）。

在 Neon SQL Editor 里执行 `db/schema.sql`。管理端第一次访问时也会自动建表，但手动执行一次更直观。

> 可以复用 Waline 的 Neon 项目，但建议新建 database 或至少独立 schema，不要把 `blog_admin` 和 Waline 的 `public` 表混在一起。

### 1.4 你的 GitHub 数字 ID

打开 `https://api.github.com/users/Hissgle`，返回 JSON 里的 `id` 就是。**不要用用户名**（用户名可以改，数字 ID 不会）。

---

## 2. 部署到 Vercel

1. Vercel → Add New → Project → 导入 `Hissgle/Hissgle.github.io`。
2. **Root Directory** 选 `admin`。
3. Framework 选 Vite（通常自动识别）。
4. Build Command：`npm run build`；Output Directory：`dist`。
5. 添加环境变量（Production，必要时也加 Preview）：

```text
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GITHUB_CONTENT_TOKEN=...          # 细粒度 PAT
GITHUB_REPO=Hissgle/Hissgle.github.io
GITHUB_BRANCH=main
ADMIN_GITHUB_ID=...               # 数字 ID
DATABASE_URL=postgresql://...     # Neon pooled，sslmode=require
SESSION_SECRET=...                # 32+ 字节随机串
ADMIN_BASE_URL=https://myblog-admin.vercel.app
SITE_BASE_URL=https://hissgle.github.io
PUBLISH_TIMEZONE=Asia/Shanghai
VITE_SITE_BASE_URL=https://hissgle.github.io
```

6. Deploy。打开 `https://myblog-admin.vercel.app/api/health`，确认 `ok: true` 且 `configured` 全为 true。
7. 打开管理端，用你的 GitHub 登录。若提示 403：
   - 检查 `ADMIN_GITHUB_ID` 是否是数字 ID；
   - 检查 OAuth App 的 callback 是否与部署域名完全一致；
   - 看 Vercel Functions 日志里的 `[admin]` 信息（不会打印 token）。

### 环境变量说明

| 变量 | 说明 |
|---|---|
| `GITHUB_OAUTH_CLIENT_ID` / `SECRET` | OAuth App |
| `GITHUB_CONTENT_TOKEN` | 细粒度 PAT，服务端专用 |
| `GITHUB_REPO` | `owner/repo` |
| `GITHUB_BRANCH` | 默认 `main` |
| `ADMIN_GITHUB_ID` | 你的 GitHub 数字 ID；留空会拒绝所有登录 |
| `DATABASE_URL` | Neon Postgres 连接串 |
| `SESSION_SECRET` | OAuth state 签名；32+ 字节随机串 |
| `ADMIN_BASE_URL` | 管理端完整地址，结尾不要 `/` |
| `SITE_BASE_URL` | 博客地址，用于生成线上文章链接和检查部署 |
| `PUBLISH_TIMEZONE` | `Asia/Shanghai` |
| `VITE_SITE_BASE_URL` | 构建时写进前端，用于预览图片/打开文章；与 `SITE_BASE_URL` 相同 |

生成随机串：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## 3. 把博客入口指到管理端

`_config.butterfly.yml` 的 `inject.bottom` 里：

```yaml
- '<script id="write-fab-script" src="/js/write-fab.js" data-admin-url="https://myblog-admin.vercel.app" defer></script>'
```

把 `data-admin-url` 换成实际的 Vercel 域名（结尾不要 `/`）。然后：

```bash
pnpm run site
git add _config.butterfly.yml source/css/write-fab.css source/js/write-fab.js admin docs
git commit -m "feat: add writing desk entry and admin"
git push origin main
```

部署后，博客右下角会出现 Twitter 风格的蓝色「+」。入口是公开的，但只有你的 GitHub 账号能登录和发布。

> 如果不想要入口，删掉 `data-admin-url` 或整行 `<script>`，再构建即可。隐藏入口只是观感，真正的权限在后端。

---

## 4. 本地开发

```bash
cd admin
npm install
cp .env.example .env.local
# 填好 .env.local；ADMIN_BASE_URL 改成 http://localhost:3000
npm run dev:full   # vercel dev
```

`vercel dev` 会同时提供 Vite 页面和 `/api` 函数，默认 `http://localhost:3000`（需要先安装 Vercel CLI：`npm i -g vercel`）。
OAuth App 的 callback 需要加：`http://localhost:3000/api/auth/callback`。

也可以分开跑：

```bash
npm run dev        # Vite 5173，/api 代理到 3000
vercel dev --listen 3000
```

或者只跑构建/测试：

```bash
npm run check      # tsc --noEmit
npm test           # Vitest（纯函数测试）
npm run build      # tsc + vite build
```

> Windows 上如果 `npm install` 失败，优先确认 Node ≥ 22、npm 缓存目录可写；本项目在沙箱里验证时用了 `--ignore-scripts`，普通桌面环境不需要。

---

## 5. 使用说明

### 新建 / 发布

1. 点右下角「+」→ GitHub 登录。
2. 「写新文章」→ 写标题、slug、正文。
3. 图片可以直接拖进编辑器，或点工具栏「图片」。图片会先存到 Neon 草稿，发布时再提交到 Git。
4. 「保存」/ 自动保存：草稿在 Neon，换设备登录也能接着写。
5. 「发布」：
   - 服务端把 Markdown + 图片一次提交到 `main`；
   - 现有 GitHub Actions 构建并推 `gh-pages`；
   - 弹窗显示「提交 → 构建 → 部署 → 上线」，通常 1–3 分钟。

### 编辑旧文

侧边栏「已发布」→ 点文章。会创建/恢复一份对应草稿：

- slug 锁定，避免改变线上 URL；
- 保留未知 front matter 字段；
- 发布时写入 `updated` 时间。

### 图片限制

- 每篇最多 5 张；
- 单张压缩后 ≤ 800 KB；
- 总请求 ≤ 3.5 MB；
- 支持 JPG / PNG / WebP / GIF / AVIF；SVG 被拒绝（XSS 风险）；
- 浏览器会压缩到最长边 1600px；小 GIF 保留原样。

### 草稿与正文

草稿只存在 Neon，**不会**自动进 Git；只有点「发布」才写 `source/_posts`，避免半成品被构建上线。发布失败时，草稿和已上传图片都还在，可以改完重试。

---

## 6. 安全设计

- OAuth 只用于确认身份；登录后检查 `ADMIN_GITHUB_ID` 和仓库 `push` 权限，OAuth token 用完即丢弃，不落库。
- 浏览器只拿到 `HttpOnly + Secure + SameSite=Lax` 的会话 cookie；数据库存 SHA-256 哈希。
- 写接口要求同源 `Origin` + `X-CSRF-Token` 双提交校验。
- 提交文章的 PAT 只在 Vercel 环境变量里，前端拿不到；PAT 只选一个仓库，权限最小化，90 天轮换。
- 管理端有严格 CSP、`noindex`、不加载第三方脚本。
- 草稿图片存在 Neon（base64），发布时校验 MIME/大小/数量；文件名和 slug 做白名单校验，防路径穿越。
- GitHub 账号请开 2FA。

### PAT 轮换

1. 生成新 PAT（同样权限）。
2. Vercel → Settings → Environment Variables → 更新 `GITHUB_CONTENT_TOKEN`。
3. Redeploy（环境变量变更需要重新部署）。
4. 撤销旧 PAT。

### 应急发文

管理端/Vercel/Neon 挂掉时，线上静态博客不受影响。可以：

- GitHub 网页版直接新建/编辑 `source/_posts/*.md`；或
- 本地 `hexo new "标题"` → 写 → `git push origin main`。

---

## 7. 排错

| 现象 | 检查 |
|---|---|
| `/api/health` 503 | `DATABASE_URL` 是否正确、Neon 是否暂停、schema 是否建好 |
| 登录 403 `forbidden` | `ADMIN_GITHUB_ID` 是否数字 ID；是否用了另一个 GitHub 账号 |
| 登录 403 `repository` | OAuth scope 是否 `repo`；该账号是否有仓库写权限 |
| 登录后立刻回登录页 | `ADMIN_BASE_URL` 是否与访问域名完全一致；cookie 是否被拦截 |
| 发布 401 | PAT 过期/被撤销 |
| 发布 403 | PAT 没有 Contents write / Actions read；或 `main` 有分支保护 |
| 发布 409 | slug 已有同名文章；从「已发布」列表打开编辑，或换 slug |
| 发布后一直「构建中」 | Actions 是否被禁用、私有仓库分钟数是否用完、run 是否失败 |
| 一直「部署中」 | Actions 成功但 Pages 还没刷新；看 Actions 日志和 Pages 设置 |
| 图片 422 | 超过 5 张 / 单张 800 KB / 总量 3.5 MB / 不是允许的格式 |
| 中文旧文编辑报 slug 错 | 已修复：编辑旧文时允许中文文件名；新建文章仍要求 ASCII slug |
| 入口不显示 | `_config.butterfly.yml` 的 `data-admin-url` 是否为空/格式错误；浏览器控制台 `[write-fab]` |

---

## 8. 文件结构

```text
admin/
  api/                 Vercel Functions（auth / drafts / assets / posts / publish / health）
  server/              共享服务端逻辑（OAuth、会话、GitHub、发布、校验）
  src/                 React 管理端
    components/        Login / Sidebar / EditorPane / PublishDialog / Icons
    lib/               Markdown 预览、图片压缩、slug、时间格式
  db/schema.sql        Neon 表结构
  vercel.json          SPA rewrite + 安全头
  package.json         npm 子项目（不参与根目录 pnpm）
  README.md            本文件
```

## 9. 已知边界

- 发布依赖 GitHub Actions + Pages，通常 1–3 分钟；不是秒级。
- 管理端和博客不同域（`*.vercel.app` vs `hissgle.github.io`），入口是跳转链接；这是为了第一方 cookie 和隔离写权限。
- 草稿图片存 Neon；如果草稿很大，注意免费额度（图片单张 ≤ 800 KB、每篇 ≤ 5 张）。
- 不支持定时发布、多人协作、富文本 WYSIWYG；这些是后续可选项。
- 私有仓库的 Pages 需要 GitHub Pro/Team；这是账号套餐限制，不是代码能绕过的。