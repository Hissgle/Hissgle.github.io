# GitHub Actions 自动部署说明

## 工作方式

```
你 push 源码 → main 分支
        ↓
GitHub Actions 自动运行（.github/workflows/deploy.yml）
        ↓
pnpm install → hexo generate → 产物推到 gh-pages 分支
        ↓
GitHub Pages 从 gh-pages 分支发布
```

- **main 分支**：只放源码（`source/`、`themes/`、配置、workflow）
- **gh-pages 分支**：只放构建产物（`index.html`、`css/`、`js/` …），由 Action 自动生成
- 以后写文章只需 push 到 main，站点自动更新

## ⚠️ 你必须手动做两件事

### 1. 把 Pages 的发布源设为「Deploy from a branch」+ `gh-pages`

仓库 → **Settings** → 左侧 **Pages** → **Build and deployment** → **Source**

选择 **「Deploy from a branch」**，Branch 设为 **`gh-pages`**，目录 **`/ (root)`**，然后 Save。

**这是必须的**：本 workflow 用 `peaceiris/actions-gh-pages` 把产物**推到 `gh-pages` 分支**，
只有当 Pages 的 Source 指向那个分支时，这些产物才会真正发布。

> ⚠️ 不要把 Source 设成「GitHub Actions」。
> 那样只有 `actions/deploy-pages` 能发布，推到 `gh-pages` 的产物**完全不会被使用**——
> workflow 会显示成功，但站点依然是旧的或 404。
> 「GitHub Actions」模式需要另一套 workflow（`upload-pages-artifact` + `deploy-pages`）。

> 顺序：**先让 workflow 成功跑一次**（这样 `gh-pages` 分支才会被创建），**再去改这个设置**。

#### 为什么之前会看到 Jekyll 的报错

如果 Source 停留在「Deploy from a branch」但分支指向 `main`，GitHub 会用内置的
**Jekyll 构建器**处理这个仓库（日志名 `pages build and deployment`），报：

```
Logging at level: debug Configuration file: /github/workspace/./_config.yml
Theme: butterfly
github-pages 232 | Error: The butterfly theme could not be found.
```

原因：Jekyll 读到了 Hexo 的 `_config.yml`（里面有 `theme: butterfly`），
但仓库里既没有 Jekyll 的 `_layouts/`，它也认不出 butterfly 这个主题。
**这个报错与你的 Hexo workflow 无关**，只是 GitHub 用错了构建器。

改成指向 `gh-pages` 之后，Jekyll 构建的就不再是 Hexo 源码仓库，
而是 Action 生成的纯静态产物——那时它不会有任何抱怨。

> 注意：这个报错**不会**让 Hexo workflow 停止运行。
> 两者是并行的：Hexo workflow 在 Actions 里正常跑，
> Jekyll 则在「pages build and deployment」里失败。
> 所以要先确认 Hexo workflow 本身是否成功（见下方排查表）。

### 2. 清掉 main 里已有的构建产物

现在 `main` 分支里混着 **22 个构建产物文件**（历史原因：早期用本机 `hexo deploy` 推上去的）：

```
2026/  about/  archives/  css/  img/  js/  link/  index.html
```

清理（在仓库根目录执行，`.gitignore` 已包含 `public/`，所以产物不会再被跟踪）：

```bash
git rm -r --cached 2026 about archives css img js link index.html
git commit -m "chore: 构建产物移出 main，改由 gh-pages 分支承载"
git push
```

`--cached` 只从 git 索引移除，**不会删你本地的文件**。

> 之后 `main` 就干净了；产物全部由 Action 生成到 `gh-pages`。
> 这一步在改 Pages 设置**之后**做更稳妥，避免站点短暂不可用。

## 相对原 workflow 修了什么

原来的 `deploy.yml` 有几个会出问题的地方：

| 问题 | 原来 | 现在 |
| --- | --- | --- |
| **产物推回 main** | `publish_branch: main` | `publish_branch: gh-pages` |
| **CI 构建必然失败** | 无处理 | 根 `package.json` 加 `moment-timezone` |
| **Node 版本过低** | `node-version: 20` 配 pnpm 11 | `node-version: 24` |
| **步骤顺序错误** | 先 setup-pnpm 再 setup-node | **先 setup-node 再 setup-pnpm** |
| **lockfile 未同步** | `pnpm install` | `pnpm install --frozen-lockfile` |
| pnpm 版本不一致 | `version: 9`（本机是 11） | `version: 11` |
| 无权限声明 | 无 `permissions` | `contents: write` |

### Node 与 pnpm：版本 + 步骤顺序（这里连踩两次坑）

**约束**：两个下限取较高的那个。

| 来源 | 要求 |
| --- | --- |
| Hexo 8 的 `engines.node` | `>= 20.19.0` |
| pnpm 11 运行时 | `>= 22.13`，并且需要 `node:sqlite` 内置模块（Node 22.5+ 才有） |

**但光把版本号改对是没用的**，还必须调整步骤顺序。两次报错分别是：

```
① 改了 node 之后仍报：
   warn: This version of pnpm requires at least Node.js v22.13
   warn: The current version of Node.js is v20.20.2      ← 注意这里还是 20

② 换成 Node 22 后暴露出的底层错误：
   Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
```

第 ① 条最关键：**明明写了 Node 22，日志里却还是 20.20.2**。原因是
`pnpm/action-setup` 排在了 `actions/setup-node` **之前** —— 那一步执行时
`setup-node` 还没跑，pnpm 于是运行在 runner 自带的旧 Node（20）上。

**正确顺序**：

```yaml
- name: Setup Node.js          # 必须在前
  uses: actions/setup-node@v4
  with:
    node-version: 24
- name: Setup pnpm             # 必须在后
  uses: pnpm/action-setup@v4
  with:
    version: 11
```

Node 用 **24**，与本地一致（本机 Node 24.11.1 + pnpm 11.7.0，已验证可构建）。

另外**去掉了 `cache: pnpm`**。setup-node 的 pnpm 缓存需要在那一步就能找到 pnpm；
既然我们刻意把 pnpm 排在后面，这个缓存就不适用了（pnpm 自身仍有内容寻址存储）。
少一个会失败的环节，比多一份缓存更重要。

workflow 里加了 `Verify tool versions` 步骤：Node 版本不足会**直接失败并说明原因**，
不会再让你对着 `ERR_UNKNOWN_BUILTIN_MODULE` 猜。

### 最关键的一条：`moment-timezone`

主题目录 `themes/butterfly/` 是本地签出的，它的
`scripts/helpers/page.js` 需要 `moment-timezone`：

```js
const moment = require('moment-timezone')
```

但**主题自己的 `node_modules` 被主题的 `.gitignore` 排除了**（里面有 `node_modules/`），
所以 CI 上不存在。后果是构建时报：

```
ERROR Script load failed: themes\butterfly\scripts\helpers\page.js
Error: Cannot find module 'moment-timezone'
getPageType is not a function
```

而且它**不会让构建失败**（Hexo 只是打日志继续跑），页面照样生成，
但页面类型判断失效、侧边栏异常——是静默的坑。

解决办法：把 `moment-timezone` 加进**根** `package.json`，
由 `pnpm install` 装到根 `node_modules`，Node 会从 `themes/butterfly/` 逐级向上找到它。
（`hexo-util` 同理，但它本来就能从根解析到，无需额外处理。）

> 因此：**不要删掉根 `package.json` 里的 `moment-timezone`**。

## 本地开发注意事项

- **本地不再需要**在 `themes/butterfly/node_modules` 里做目录联接了，
  根依赖已经覆盖。本地环境现在与 CI 完全一致。
- **不要再执行 `hexo deploy`**：`_config.yml` 的 `deploy.branch` 已改为 `gh-pages`，
  和 Action 目标一致；但两者同时用会互相覆盖，建议统一用 Action。
- 本地预览：`pnpm run server`
- 本地构建：`pnpm run site`（= `hexo clean && hexo generate`）

## 排查

| 症状 | 原因 |
| --- | --- |
| `pages build and deployment` 里报<br>`github-pages 232 \| Error: The butterfly theme could not be found.` | **GitHub 用内置 Jekyll 构建器跑本仓库**。这是最容易被误导的报错——它和你的 Hexo workflow 无关。把 Pages → Source 设为「Deploy from a branch」并指向 `gh-pages`（见上文第 1 步） |
| Action 全绿但站点是旧的/404 | Pages 的 Source 没指向 `gh-pages`；或指向了「GitHub Actions」（那样 peaceiris 推送的产物不会被使用） |
| Action 里 `Cannot find module 'moment-timezone'` | 根 `package.json` 的该依赖被删了 |
| Action 报 `ERR_PNPM_OUTDATED_LOCKFILE` | 改了 `package.json` 但没同步 lockfile；本机跑 `pnpm install` 后提交 `pnpm-lock.yaml` |
| Action 报 `This version of pnpm requires at least Node.js v22.13`<br>且日志里 `The current version of Node.js is v20.x` | **步骤顺序错了**：`pnpm/action-setup` 排在 `actions/setup-node` 之前，pnpm 跑在 runner 自带的旧 Node 上。把 setup-node 提到前面 |
| `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite` | 同一个根因（Node 太旧），pnpm 11 依赖 `node:sqlite`；按上一条处理 |
| Action 成功但站点 404 / 内容没更新 | Pages 的 Source 没指向 `gh-pages`（指向「GitHub Actions」时 peaceiris 的产物不会被使用） |
| `hexo deploy` 推送被拒 | 本机提交历史与远端冲突；用 Action 部署即可绕开 |

### 为什么会同时出现两种构建

只要 Pages 的 Source 是「Deploy from a branch」，GitHub 就会**另外**跑一遍它的
Jekyll 构建器（日志名为 `pages build and deployment`）。此时：

- 你的 Hexo workflow（`Deploy Hexo Blog`）在 Actions 里照常运行 —— 看它是否成功
- Jekyll 构建就是那个报「找不到 butterfly 主题」的 —— 那是它在试图构建 Hexo 源码仓库

**两者是并行的，别把 Jekyll 的失败当成 Hexo workflow 的失败。**
把 Source 指向 `gh-pages` 分支后，Jekyll 构建的对象变成 Action 生成的纯静态产物，
它就不会再报错了（一个静态产物目录不存在 Jekyll 主题问题）。

两步要分别确认。
