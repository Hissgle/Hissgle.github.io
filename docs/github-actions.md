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

### 1. 改 Pages 的发布源（**必须**，否则站点会 404）

仓库 → **Settings** → 左侧 **Pages** → **Build and deployment** → **Source**

- 从 `Deploy from a branch` 保持这一项，但把 **Branch 改成 `gh-pages`**，目录选 **`/ (root)`**
- 改完点 **Save**

> 注意：`gh-pages` 分支要等 Action 跑过一次之后才会存在。
> 所以顺序是：先 push 触发一次 Action → 等它成功 → 再改这个设置。

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
| **lockfile 未同步** | `pnpm install` | `pnpm install --frozen-lockfile` |
| pnpm 版本不一致 | `version: 9`（本机是 11） | `version: 11` |
| 无权限声明 | 无 `permissions` | `contents: write` |
| 步骤顺序有误 | 先 setup-node 后装 pnpm | 先 pnpm 后 node |

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
| Action 里 `Cannot find module 'moment-timezone'` | 根 `package.json` 的该依赖被删了 |
| Action 报 `ERR_PNPM_OUTDATED_LOCKFILE` | 改了 `package.json` 但没同步 lockfile；本机跑 `pnpm install` 后提交 `pnpm-lock.yaml` |
| Action 成功但站点 404 | Pages 的 Source 还没改成 `gh-pages` |
| 站点内容没更新 | 看 Action 是否真的成功，以及 gh-pages 是否被推送 |
| `hexo deploy` 推送被拒 | 本机提交历史与远端冲突；用 Action 部署即可绕开 |
