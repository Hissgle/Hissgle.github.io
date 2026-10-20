# 博客「写完即发布」入口与数据库方案

> 状态：**代码已实现，待按 `admin/README.md` 部署**（2026-10-20）。
>
> 目标：在现有博客前端增加一个「写作」入口；登录后写 Markdown，点「发布」就自动上线；目前只有站长本人拥有发布权限。
>
> 已确认：入口公开显示，右下角 Twitter 风格圆形「+」；第一版包含图片上传、编辑旧文、跨设备草稿；仓库设为私有；提交凭证用细粒度 PAT。
>
> ⚠️ **私有仓库 + GitHub Pages 需要 GitHub Pro/Team。** GitHub Free 的私有仓库不能使用 Pages；如果账号没有 Pro，改私有会让线上发布停止。请先确认套餐，或暂时保持 public / 改用 Vercel、Cloudflare Pages 托管博客。

---

## 0. 一句话结论

**文章不要放进数据库。** 继续用 Markdown 存在 Git 仓库（`source/_posts/`），Git 本身就是文章库；只为管理端配一个 **Neon Postgres**，存登录会话、草稿、发布记录。管理端放在 **Vercel**，用 **GitHub OAuth + 你的 GitHub 数字 ID 白名单**鉴权；发布时由服务端调用 GitHub API 提交到 `main`，触发现有的 GitHub Actions 构建并部署到 GitHub Pages。

| 数据 | 存在哪 | 说明 |
|---|---|---|
| 文章正文 | Git：`source/_posts/*.md` | 现有构建链直接可用，有版本历史、可回滚 |
| 文章图片 | Git：`source/img/posts/<slug>/` | 和文章同仓库，Pages 直接服务，不占数据库 |
| 登录会话 | Neon Postgres | 只存 token 的 SHA-256，不存明文 |
| 草稿 | Neon Postgres | 自动保存，换设备也能接着写 |
| 发布记录 | Neon Postgres | 审计：谁在什么时候发布了哪个文件、commit SHA |
| 身份 | GitHub OAuth | 只允许你的 GitHub 数字 ID 登录 |

---

## 1. 现状（已核对仓库）

- **站点**：Hexo 8.1.2 + Butterfly 5.7，纯静态，部署在 GitHub Pages，线上地址 `https://hissgle.github.io`。
- **文章**：`source/_posts/*.md`，front matter 使用 `title / date / tags / cover / top_img` 等字段，目前 4 篇。
- **构建**：push 到 `main` → `.github/workflows/deploy.yml` → `pnpm run site`（hexo clean + generate）→ `peaceiris/actions-gh-pages` 推 `gh-pages` → GitHub Pages 发布。
- **评论**：Waline，`_config.butterfly.yml` 里已填 `serverURL`；按 `WALINE-SETUP.md`，后端在 Vercel，数据库使用 Neon Postgres。
- **旧后端**：`api/` 的 FastAPI + SQLite 已隔离（`.gitignore` 排除）。原因写得很清楚：隧道需要电脑常开、地址每次重启都变，不适合做发布入口。
- **菜单**：`_config.butterfly.yml` 的 `menu:`，目前是 相册 / 关于 / 友链 / 归档。
- **仓库**：`Hissgle/Hissgle.github.io`。已确认按**私有仓库**实施：OAuth scope 用 `repo`，PAT 只选这一个仓库；但 Pages 仍需 GitHub Pro/Team（见文首警告）。

---

## 2. 为什么文章不进数据库

这是本方案最关键的判断，先说清楚：

1. **Hexo 是构建时生成静态 HTML。** 就算把文章写进 Postgres，页面也不会自动出现，仍然要跑一次 `hexo generate`。数据库并不能省掉「构建 + 部署」这一步。
2. **要让数据库里的文章“立刻”显示，只有两条路**：
   - 把站点改成 SSR / ISR / 客户端拉取（Next.js、Astro SSR 等），这是另一个量级的重写；
   - 或者由服务端把文章写回 Markdown 再构建——那 Git 仍然是最终来源，数据库是多余的中间层。
3. **两套数据源必然漂移。** 现有文章已经在 Markdown 里，再建一套文章表，就要处理迁移、同步、谁覆盖谁的问题，收益为零。
4. **Git 已经提供了数据库想要的东西**：版本历史、diff、回滚、审计、备份、PR 审查。GitHub Actions 也已经信任 `main` 分支。
5. **静态站的优势要保住**：SEO、首屏速度、零运行时依赖、GitHub Pages 免费。引入文章数据库会把这些优势部分丢掉。

所以本方案的分工是：

> **Git = 文章数据库（source of truth）**
>
> **Neon = 管理端的“便签本”**（会话、草稿、发布日志），不是文章库。

---

## 3. 数据库选型

| 方案 | 适合做什么 | 结论 |
|---|---|---|
| **Git + Markdown** | 文章、图片 | ✅ **推荐**。零迁移，沿用现有 Actions，天然可回滚 |
| **Neon Postgres** | 会话、草稿、发布日志 | ✅ **推荐**。你已经在 Waline 用了 Neon；免费额度足够；Serverless 友好 |
| SQLite | 本地单机、嵌入式 | ❌ 不适合。GitHub Pages 不能跑；要常开的服务器；之前的 FastAPI + 隧道已经因此停用 |
| MySQL | 传统关系库 | ❌ 多一个服务；免费托管选择少；对这个量级没有优势 |
| MongoDB | 文档库 | ❌ 不需要 schemaless；多一个账号和运维面 |
| Cloudflare D1 | SQLite 兼容的边缘库 | ⚠️ 可行，但只有当你把管理端也放到 Cloudflare 时才划算；你已有 Vercel/Neon |
| Redis / Upstash | 会话缓存 | ⚠️ 只能解决会话，草稿和审计还要另一套；不如一个 Postgres |
| Supabase | Postgres + Auth | ⚠️ 可行，但多一套账号体系；Neon 已经够用 |

**为什么是 Neon，而不是 SQLite：**

- SQLite 是文件数据库，必须有进程能持续读写它。GitHub Pages 只发静态文件，不能跑 Python/Node 进程。
- 如果放在你电脑上，就又回到「电脑必须开着 + 隧道地址会变」的老问题。
- Neon 是托管 Postgres，Vercel 函数通过 HTTPS 直接连，电脑关机也不影响；免费额度对「一个人写博客」绰绰有余。
- 你已经有 Neon（Waline 在用），不需要新注册一个数据库服务。

**为什么不用 Waline 的库直接存：**

- 评论和管理端是两件事，表结构、权限、备份策略都不同。
- 建议在同一个 Neon 项目里**新建一个 database**（例如 `blog_admin`），或至少独立 schema `blog_admin`，不要和 Waline 的 `public` 表混在一起。
- 连接串单独给管理端用，权限只覆盖这个库/ schema。

---

## 4. 推荐架构

```
┌─────────────────────────────┐
│ GitHub Pages（现有博客）      │
│ 右下角「+」→ 只是一个链接     │
└──────────────┬──────────────┘
               │ 打开
               ▼
┌─────────────────────────────┐
│ Vercel：管理端（React + API） │
│  - GitHub OAuth 登录          │
│  - Markdown 编辑器 / 预览     │
│  - 草稿 / 发布 / 状态轮询      │
└──────┬───────────────┬──────┘
       │               │
       │ 读写          │ GitHub API（服务端）
       ▼               ▼
┌──────────────┐  ┌──────────────────────────┐
│ Neon Postgres│  │ GitHub 仓库 main 分支      │
│ sessions     │  │ source/_posts/*.md        │
│ drafts       │  │ source/img/posts/...      │
│ publish_log  │  └────────────┬─────────────┘
└──────────────┘               │ push 触发
                               ▼
                    ┌──────────────────────┐
                    │ GitHub Actions        │
                    │ hexo generate         │
                    │ → gh-pages            │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ GitHub Pages 线上生效 │
                    │（约 1–3 分钟）        │
                    └──────────────────────┘
```

**为什么管理端要单独放在 Vercel，而不是塞进 GitHub Pages：**

1. GitHub Pages 不能运行服务端代码，OAuth 的 `client_secret` 和 GitHub PAT 不能放在浏览器里。
2. 管理端和 API 同源（都在 Vercel），登录 cookie 是第一方 cookie，不会被浏览器的第三方 cookie 策略拦截。
3. 管理端不把任何写权限相关 JS 加载到公开博客上；博客页面只多一个链接，攻击面几乎不变。
4. 管理端可以用严格的 CSP、不加载 Waline / 播放器 / 第三方 CDN，降低 token 被 XSS 偷走的风险。

**代价**：管理端是独立域名（例如 `myblog-admin.vercel.app`）。入口是博客右下角的 Twitter 风格悬浮「+」，点过去即可；如果以后有自定义域名，可以改成 `write.你的域名`。

---

## 5. 权限设计：只让你能发布

分三层：前两层（身份白名单、仓库权限）互为兜底；第三层的 PAT 是服务端秘密，不参与浏览器鉴权，只用于提交。

### 5.1 身份层：GitHub OAuth

- 新建一个 GitHub OAuth App，回调地址填 `https://<管理端域名>/api/auth/callback`。
- 登录流程：`/api/auth/login` → GitHub 授权 → `/api/auth/callback` 用 `code` 换 access token → 调 `GET /user` 拿到 `id` 和 `login`。
- 只允许 `ADMIN_GITHUB_ID`（你的**数字 ID**，不是用户名）通过。用户名可以改，数字 ID 不变。
- 其他人即使完成了 GitHub 授权，服务端也直接返回 403，不创建会话。

### 5.2 仓库权限层

- 用登录者的 token 调 `GET /repos/Hissgle/Hissgle.github.io`，检查 `permissions.push === true`。
- 这样即使白名单配错，也只有对该仓库有写权限的人才可能进入下一步。
- 校验完就丢弃这个 OAuth token，不落库；后续提交统一用服务端 PAT。
- 仓库已确认是私有的，因此 OAuth scope 用 `repo`（不是 `public_repo`）。

### 5.3 提交层

- 服务端用一把**细粒度 PAT**（Fine-grained personal access token）提交，PAT 只放在 Vercel 环境变量里，永远不下发到浏览器。
- PAT 权限：仅选中 `Hissgle/Hissgle.github.io` 一个仓库；`Contents: Read and write`、`Actions: Read`、`Metadata: Read`；有效期建议 90 天。
- 提交路径只允许 `source/_posts/` 和 `source/img/posts/`，服务端做白名单校验，防止路径穿越。

### 5.4 会话与请求安全

- 登录成功后生成随机 session token，浏览器只拿到 `HttpOnly + Secure + SameSite=Lax` 的 cookie；数据库只存 SHA-256 哈希。
- OAuth `state` 用短时效 cookie 校验，防 CSRF。
- 所有写接口校验 `Origin`，并要求 `X-CSRF-Token`（双提交 cookie）。
- 登录、发布、上传做基本限流（例如登录 20 次/小时/IP，发布 30 次/小时/用户）。
- 退出登录删除数据库会话；可以加「退出所有设备」。
- 管理端设置 `X-Robots-Tag: noindex`，不进入搜索引擎。

### 5.5 入口可见性

- 已确认入口**公开显示**：博客右下角一个 Twitter 风格的圆形「+」，点进去是登录页；只有你能登录成功。权限在后端，不靠隐藏。
- 悬浮按钮在 `source/js/write-fab.js` + `source/css/write-fab.css`，通过 `inject` 注入；位置避开了主题右侧的返回顶部/夜间模式按钮。
- 如果哪天想撤掉入口，把 `_config.butterfly.yml` 里 `write-fab.js` 那一行的 `data-admin-url` 留空或删掉整行即可；隐藏只是观感，不是权限。

---

## 6. 发布流程（点一下「发布」之后）

1. **前端校验**：标题、slug、正文非空；slug 只允许 `a-z0-9-`；标签/分类做长度限制。
2. **服务端二次校验**：`zod` 校验请求；检查目标文件是否存在；检查 slug 是否重复；检查图片路径。
3. **生成 front matter**：用 `js-yaml` dump（不要手拼 YAML），日期固定按 `Asia/Shanghai` 生成，格式与现有文章一致：
   ```yaml
   ---
   title: "文章标题"
   date: 2026-10-20 21:00:00
   tags:
     - 技术随笔
   categories:
     - 技术
   cover: /img/posts/hello-world/cover.webp
   top_img: /img/posts/hello-world/cover.webp
   description: "摘要"
   ---
   ```
4. **原子提交**：用 GitHub Git Data API 一次提交「文章 + 本次上传的图片」：
   - 读取 `refs/heads/main` 的当前 commit；
   - 为每个文件创建 blob；
   - 创建 tree（`base_tree` 指向当前 tree）；
   - 创建 commit（父提交为当前 commit）；
   - 更新 `refs/heads/main`（快进，不 force push）。
   这样不会出现「文章提交了、图片没提交」的半成品。
5. **触发构建**：push 到 `main` 后，现有 workflow 自动跑。管理端拿到 commit SHA，轮询 Actions：
   `GET /repos/.../actions/runs?head_sha=<sha>`。
   > Hexo 的永久链接 `:title` 取的是**文件名**（现有文章也是这样），所以 slug 就是文件名；文章 URL 可按 `/<year>/<month>/<day>/<slug>/` 计算。
6. **等待上线**：Action 成功后，再轮询文章 URL（带 cache-buster，检查页面标题），确认 Pages 真的更新了。
7. **返回结果**：显示「已上线」+ 文章链接 + commit 链接；失败则显示 Actions 日志链接，正文和草稿都不丢。

**时间预期**：commit → Actions → gh-pages → Pages CDN，通常 **1–3 分钟**。这已经是「写完点发布，不用碰终端」的体验；如果你要求 5 秒内线上可见，就必须改成动态渲染，那是另一个量级的改造，不建议。

**失败时**：构建失败不会影响线上旧版本（`gh-pages` 还是上一次成功的产物）。文章已经在 `main` 上，修好后重新发布或直接在 GitHub 上改都可以。

---

## 7. Neon 表结构

三张表就够，全部放在独立 schema `blog_admin` 里：

```sql
create schema if not exists blog_admin;

-- 登录会话：只存 token 的哈希
create table if not exists blog_admin.sessions (
  token_hash      text primary key,
  github_id       bigint not null,
  github_login    text not null,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null
);
create index if not exists sessions_expires_idx
  on blog_admin.sessions (expires_at);

-- 草稿：自动保存；发布后保留，便于回看
create table if not exists blog_admin.drafts (
  id              uuid primary key,
  slug            text unique,
  title           text not null default '',
  front_matter    jsonb not null default '{}'::jsonb,  -- 除 title 外的字段
  content         text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  published_at    timestamptz,
  last_commit_sha text
);

-- 发布审计：谁、什么时候、发布了哪个文件、commit 是什么
create table if not exists blog_admin.publish_log (
  id          bigserial primary key,
  draft_id    uuid references blog_admin.drafts(id) on delete set null,
  path        text not null,
  commit_sha  text not null,
  mode        text not null check (mode in ('create', 'update')),
  github_id   bigint not null,
  created_at  timestamptz not null default now()
);
create index if not exists publish_log_created_idx
  on blog_admin.publish_log (created_at desc);
```

说明：

- `sessions.token_hash` 是 cookie 值的 SHA-256；数据库泄露也拿不到可用会话。
- `drafts.front_matter` 用 `jsonb`，标签/分类/封面等字段灵活扩展，不用频繁改表。
- `drafts` 只存草稿，**不会**自动进 Git；只有点「发布」才会写 `source/_posts`，避免半成品被构建上线。
- `publish_log` 是审计和排错用；真正的版本历史仍在 Git。
- 图片不入库，避免数据库膨胀；图片进 Git，由 Pages 直接服务。
- 可选加 `rate_limits` 表做限流；MVP 也可以先用简单的内存/边缘限流，后续再补。
- 管理端用 `@neondatabase/serverless` 的 HTTP 驱动连接 Neon，避免 Vercel 函数里的连接池问题。

---

## 8. 管理端功能范围

### MVP（建议第一版就做）

- 登录 / 退出；非站长显示 403 提示。
- 文章列表：读取 `source/_posts/*.md`，显示标题、日期、标签；支持点开编辑；编辑时保留未知 front matter 字段，并写入 `updated` 时间。
- 新建文章：
  - 标题、slug（中文标题自动转拼音，可手改）、日期（默认当前时间，Asia/Shanghai）；
  - 标签、分类、封面、摘要；
  - Markdown 编辑器（工具栏：粗体/斜体/链接/代码/引用/列表/图片/`<!-- more -->`）；
  - 实时预览（Markdown 渲染 + DOMPurify 清洗）；
  - 「保存草稿」自动保存到 Neon；「发布」一键提交。
- 图片：
  - 上传封面 / 正文图，浏览器端压缩（最长边 1600px，WebP/JPEG），单张 ≤ 800 KB；
  - 单篇最多 5 张，随发布请求一起提交，总请求 ≤ 3.5 MB（Vercel 函数请求体约 4.5 MB，留余量）；
  - 超出时提示压缩/减少图片，不静默失败；
  - 提交到 `source/img/posts/<slug>/`，自动插入 Markdown 链接；
  - 也允许直接填已有的 `/img/...` 路径。
- 发布状态：
  - 提交后显示「提交 GitHub → 构建中 → 部署中 → 已上线」；
  - 失败显示 Actions 日志链接；
  - 成功后给出线上 URL 和 commit URL。
- 草稿列表、删除草稿。
- 移动端可用（手机上也能写/发）。

### 第二阶段（可选）

- 发布历史 / 一键回滚（提交反向内容，而不是 force push）。
- 更新旧文时显示 diff。
- 定时发布（先提交到草稿分支，定时合并；或 Action 定时构建）。
- 预览分支：发布前生成一个 Vercel/Pages 预览链接。
- 多作者/角色（目前不需要，但表结构可以扩展）。

### 不做的

- 不做富文本 WYSIWYG（Markdown 更适合现有 Hexo 链路）。
- 不做站内注册/密码体系（GitHub 身份已经足够，少一套密码就少一个风险）。
- 不把评论、浏览量搬进管理端数据库。

---

## 9. 安全清单

- [ ] OAuth `state` 校验；回调地址与 OAuth App 配置完全一致。
- [ ] 会话 cookie：`HttpOnly; Secure; SameSite=Lax; Path=/`；数据库存哈希。
- [ ] 写接口校验 `Origin` + CSRF token。
- [ ] GitHub 数字 ID 白名单；同时检查仓库 `permissions.push`。
- [ ] PAT 细粒度、单仓库、90 天过期、只给 Contents 写 + Actions 读；不写进前端、不写进日志。
- [ ] 管理端 CSP 严格，不加载第三方脚本；预览 HTML 用 DOMPurify。
- [ ] slug / 文件路径白名单校验，拒绝 `..`、`/`、`\`、控制字符。
- [ ] YAML 用库生成，不手拼；标题里的 `:`、引号、换行都安全。
- [ ] 图片限制 MIME、大小、数量；压缩后再提交。
- [ ] 登录/发布限流；失败日志不记录 token。
- [ ] 发布审计表；GitHub 提交历史双保险。
- [ ] 你的 GitHub 账号开 2FA；PAT 泄露时立即撤销并轮换。
- [ ] 应急兜底：Vercel/Neon 挂掉时，仍可用 GitHub 网页版或本地 `hexo new` + push 发文。

---

## 10. 成本与运维

| 项目 | 方案 | 费用 |
|---|---|---|
| 博客托管 | GitHub Pages（现有） | $0 |
| 管理端 | Vercel Hobby（个人非商业） | $0 |
| 数据库 | Neon Free | $0 |
| 身份 | GitHub OAuth App | $0 |
| 构建 | GitHub Actions（公开仓库） | $0 |

- 不需要常开的电脑，不需要 cloudflared 隧道，不需要 VPS。
- 运维面：PAT 90 天轮换；OAuth secret 泄露时重置；Neon 连接串轮换；关注 Actions 失败通知。
- 备份：文章/图片在 Git（天然多副本 + 历史）；草稿在 Neon（免费版有 PITR/分支能力，重要草稿可定期导出 JSON）。
- 限制：GitHub Pages 单站 1 GB / 每月 100 GB 流量软限制、约每小时 10 次构建；图片必须压缩，别把原图全塞进去，短时间频繁发布可能排队。
- 可选优化：给 `actions/setup-node` 加 pnpm 缓存，减少每次发布等依赖安装的时间。
- 依赖：Vercel / Neon / GitHub 任一不可用时，管理端受影响；但线上静态博客不受影响，可走应急兜底。

---

## 11. 实施计划

### 第 0 步：你确认本方案

确认下面第 12 节的几个选择；我再开始写代码。

### 第 1 步：基础设施（约 20–30 分钟，需要你操作）

1. 建 GitHub OAuth App，拿 `Client ID` / `Client Secret`，回调地址先填占位，部署后改。
2. 建细粒度 PAT（单仓库、Contents 读写、Actions 读、90 天）。
3. 在 Neon 建 `blog_admin` 数据库（或 schema），执行上面的 SQL，拿连接串。
4. 在 Vercel 新建项目，Root Directory 指向 `admin/`，填环境变量（见附录 B）。
5. 先访问 `https://api.github.com/users/Hissgle`，记下返回里的数字 `id`，填到 `ADMIN_GITHUB_ID`；部署后用自己的 GitHub 登录验证。

### 第 2 步：代码（我这边实现）

- `admin/`：Vite + React + TypeScript 管理端；Vercel `api/` 函数；Neon 访问；GitHub 客户端；OAuth/会话/CSRF；编辑器/预览/草稿/发布/状态轮询；图片压缩上传。
- `admin/` 作为独立子项目，自带 `package.json` / lockfile，Root Directory 设为 `admin`；不把它的依赖并进 Hexo 的 pnpm workspace，避免两套构建互相影响。
- `docs/`：部署与运维说明、PAT 轮换、应急流程。
- `.gitignore`：补 `admin/node_modules`、`admin/dist`、`admin/.env*`。
- `_config.butterfly.yml`：注入 `write-fab.js` / `write-fab.css`，右下角显示 Twitter 风格「+」（最后一步，等管理端验证通过再填 `data-admin-url`，避免线上出现死链）。

### 第 3 步：联调与验收

- 用第二个 GitHub 账号登录 → 必须 403。
- 未登录直接调发布接口 → 401。
- 发布一篇测试文章 → 检查 URL、标题、封面、标签、代码块、图片；确认 Actions 成功。
- 删除/回滚测试文章。
- 手机尺寸走一遍。
- 断网/构建失败/PAT 过期等错误提示。
- 确认线上博客没有被管理端代码拖慢（只多一个链接）。

### 工作量

- 核心 MVP：约 1–1.5 个工作日（含前后端、SQL、联调；不含你注册账号的时间）。
- 图片上传、编辑旧文、发布历史会多 0.5–1 天。
- 具体取决于你对 UI 的要求；如果只要「能用」，可以更快。

---

## 12. 已确认的选择 / 部署前检查

1. **文章在 Git、Neon 只存管理数据**：已确认。
2. **发布后 1–3 分钟上线**：已接受；不做动态站点重写。
3. **管理端放在 Vercel（独立域名）**：已确认；入口是博客里的跳转链接。
4. **入口公开显示**：已确认；右下角 Twitter 风格圆形「+」，登录后才能发布。
5. **第一版功能**：图片上传 + 编辑旧文 + 跨设备草稿，全部纳入；回滚/定时发布放第二阶段。
6. **仓库私有**：已确认；⚠️ 但 GitHub Free 的私有仓库不能使用 Pages，需要 Pro/Team（见文首）。
7. **提交凭证**：已确认用细粒度 PAT，90 天轮换；后续可升级 GitHub App。
8. **部署前还要确认**：`main` 是否有分支保护。如果保护规则不允许 PAT 直接 push，发布会失败；需要给发布账号放行，或改成 PR 流程。

> 以上选择已在 2026-10-20 确认；实际部署步骤见 `admin/README.md`。

---

## 附录 A：四种备选方案

### A1. 零后端：浏览器直连 GitHub（最省事，但安全性弱一档）

- 在博客里做一个 `/write/` 静态页，你粘贴一把细粒度 PAT（只存 `sessionStorage`，不落盘），页面直接调 GitHub API 提交。
- 不需要 Vercel、不需要 Neon、不需要 OAuth；没有数据库。
- 优点：零基础设施、实现最快。
- 缺点：PAT 在浏览器内存里，任何 XSS/恶意扩展都可能偷走；没有服务端二次校验；草稿只能放 localStorage；无法做会话吊销和审计。
- 适合：你只想最快用起来、且能接受这个风险。**不作为首选。**

### A2. 现成 Git-based CMS（Sveltia / Decap）

- 用现成 CMS 的 `/admin` 界面，GitHub 作为后端，文章仍然提交到 Git；不需要文章数据库。
- 优点：编辑器、媒体库、草稿流现成；代码少。
- 缺点：UI 和 Hexo front matter 的贴合度一般；OAuth 代理要单独部署；预览不等于 Butterfly 实际效果；发布状态/中文细节不好定制。
- 适合：不想维护自定义管理端代码。**可作为备选。**

### A3. 全动态 CMS（Strapi / Directus / Keystone + Postgres）

- 文章进数据库，站点改成 SSR/ISR 或在构建时拉取。
- 优点：多作者、权限、媒体管理成熟。
- 缺点：要重写 Hexo 的页面渲染/部署链；要一直维护服务端；SEO/性能/成本都变复杂。
- 结论：**不推荐**。你的站点只有一个人写，静态 Hexo 更合适。

### A4. 恢复 FastAPI + SQLite

- 把旧 `api/` 重新启用，加发布接口，继续用隧道。
- 缺点：电脑必须常开；地址会变；SQLite 单文件在多实例/备份/并发上不如托管 Postgres；隧道本身就不稳定。
- 结论：**不推荐**，这也是当初隔离它的原因。

---

## 附录 B：环境变量清单（Vercel 管理端）

```text
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GITHUB_CONTENT_TOKEN=...          # 细粒度 PAT，只给这个仓库
GITHUB_REPO=Hissgle/Hissgle.github.io
GITHUB_BRANCH=main
ADMIN_GITHUB_ID=...               # 你的 GitHub 数字 ID
DATABASE_URL=postgresql://...     # Neon，带 sslmode=require
SESSION_SECRET=...                # 32+ 字节随机串，用于 state/CSRF 签名
ADMIN_BASE_URL=https://<管理端域名>
SITE_BASE_URL=https://hissgle.github.io
PUBLISH_TIMEZONE=Asia/Shanghai
```

> `GITHUB_CONTENT_TOKEN` 只放服务端；前端代码、日志、错误信息里都不能出现。

---

## 附录 C：上线前检查清单

- [ ] OAuth App 的 callback URL 与管理端实际域名完全一致。
- [ ] PAT 只选中一个仓库，权限最小化，过期时间已记入日历。
- [ ] Neon schema / 表已建，管理端能连上。
- [ ] 站长登录成功；第二个账号 403；未登录发布 401。
- [ ] 测试文章发布成功，URL 正确，封面/图片/代码块/标签正常。
- [ ] Actions 失败时页面提示日志链接，线上旧版本不受影响。
- [ ] 手机端能完成「新建 → 发布」。
- [ ] 管理端 `noindex`、CSP、cookie 标志正确。
- [ ] 草稿自动保存、刷新恢复、跨设备可见。
- [ ] 右下角「+」有 `target="_blank"`，Pjax 不拦截；手机上不遮挡返回顶部/夜间模式按钮。
- [ ] 写好运维文档：PAT 轮换、应急用 GitHub 网页版发文、Neon 备份。