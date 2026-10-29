# GitHub Proxy

一个只依赖 **Cloudflare Workers** 的 GitHub 公共资源代理。无需额外服务器、无需数据库。

请求路径直接映射 GitHub 域名，Worker 在边缘完成转发、缓存、HTML 链接重写和重定向重写：

```
用户 → Cloudflare Worker（路由 + 缓存 + 重写）→ GitHub
```

## 功能

- GitHub 网页访问：仓库、搜索、Issue、Release 页面
- Raw 文件、Gist 原始内容
- GitHub 静态资源（JS/CSS/字体/图片，另有路径与官方一致的独立子域 `ghassets.gitcafe.ink`）
- 头像、README 图片（avatars / camo / user-images）
- GitHub REST API（`/api/github/...`，以及路径与官方一致的独立子域 `api.gh.gitcafe.ink`）
- Release 下载、源码 zip/tar 包（自动跟随 GitHub 的签名 CDN 重定向）
- 多级缓存：HTML 5 分钟、API 1 分钟、Raw 7 天、静态资源 30 天
- SSRF 防护：目标域名白名单 + 仅允许 HTTPS + 禁止非标准端口
- 不转发 Cookie，不把用户令牌发送给静态 CDN

## 路由

| Worker 路径 | 目标 |
|---|---|
| `/{owner}/{repo}/...` | `github.com` |
| `/raw/{owner}/{repo}/...` | `raw.githubusercontent.com` |
| `/gist/...` | `gist.githubusercontent.com` |
| `/assets/...` | `github.githubassets.com` |
| `ghassets.gitcafe.ink/...`（独立域名） | `github.githubassets.com`，路径完全一致 |
| `/avatars/...` | `avatars.githubusercontent.com` |
| `/camo/...` | `camo.githubusercontent.com` |
| `/user-images/...` | `user-images.githubusercontent.com` |
| `/private-user-images/...` | `private-user-images.githubusercontent.com` |
| `/media/...` | `media.githubusercontent.com` |
| `/api/github/...` | `api.github.com` |
| `api.gh.gitcafe.ink/...`（独立域名） | `api.github.com`，路径完全一致 |
| `/api/raw/...`、`/api/gist/...`、`/api/assets/...` | 兼容旧版路径 |
| `/?url=https%3A%2F%2Fgithub.com%2F...` | 兼容旧的 Worker 后端调用方式 |
| `/__health` | 健康检查（JSON） |

## 部署

### 1. 安装依赖

```bash
cd cloudflare-worker
npm install        # 或 bun install
```

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

CI 或无浏览器环境使用 API Token：

```bash
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."   # 账号多于一个时需要
```

Token 需要 **Workers Scripts:Edit** 权限（Cloudflare 的 “Edit Cloudflare Workers” 模板即可）。

### 3. 部署

```bash
npm run deploy
```

部署完成后默认地址形如：

```
https://github-proxy.<你的子域>.workers.dev
```

生产环境已绑定三个自定义域名：

```text
https://gh.gitcafe.ink          # 网页、Raw、静态资源
https://api.gh.gitcafe.ink      # GitHub API，路径与 api.github.com 一致
https://ghassets.gitcafe.ink    # 静态资源，路径与 github.githubassets.com 一致
```

三个域名都写在 `wrangler.toml` 的 `routes` 中，部署时自动创建。`wrangler.toml` 中的 `name` 决定 Worker 名称；如需换名字，修改 `name` 后再部署。

### 4. 可选但强烈建议：GitHub Token

匿名访问 GitHub API 的限额只有 **60 次/小时**，而且代理的所有访客共享 Worker 的出口 IP，很容易触发 `403 API rate limit exceeded`。配置一个只读 PAT 后限额提升到 5,000 次/小时：

```bash
npx wrangler secret put GITHUB_TOKEN
```

也可以在 Cloudflare Dashboard → Workers & Pages → `github-proxy` → Settings → Variables and Secrets 中添加名为 `GITHUB_TOKEN` 的 Secret。

Worker 只会在请求 GitHub API 时使用该 Token；静态 CDN 和签名下载地址不会收到它。用户自己传入的 `Authorization` 会转发给 GitHub API/网页/raw，并绕过缓存。

> **安全要求**：`GITHUB_TOKEN` 必须是只读、仅授予公共仓库权限的 token。不要使用拥有私有仓库权限的 token——否则任何能访问代理的人都可以读取该 token 能看到的私有内容。

### 5. 自定义域名

生产环境绑定三个 Custom Domain：

| 域名 | 用途 |
|---|---|
| `gh.gitcafe.ink` | 网页、Raw、静态资源 |
| `api.gh.gitcafe.ink` | GitHub API，路径与 `api.github.com` 完全一致 |
| `ghassets.gitcafe.ink` | 静态资源，路径与 `github.githubassets.com` 完全一致 |

所有域名都写在 `wrangler.toml` 的 `routes` 中，`wrangler deploy` 会自动创建或保持绑定。**必须全部一起列出**：Wrangler 会用配置文件里的路由覆盖 Dashboard 上配置的路由，漏写任何一个都会导致它被解绑。

`gitcafe.ink` 必须与 Worker 在同一个 Cloudflare 账号下。如果部署 token 没有 Zone → Workers Routes 写权限，添加域名会失败；此时改在 Cloudflare Dashboard → Workers & Pages → `github-proxy` → Settings → Domains & Routes 手动添加。

网页链接和重定向使用请求的 `Origin`，因此通过 `gh.gitcafe.ink` 访问时链接会自动指向 `https://gh.gitcafe.ink/...`；独立镜像子域（`api.gh.gitcafe.ink`、`ghassets.gitcafe.ink`）在代码中通过 `DEDICATED_HOSTS` 识别，更换子域时需同步修改。

## 使用

```text
https://gh.gitcafe.ink/vercel/next.js                       # 仓库页面
https://gh.gitcafe.ink/search?q=cloudflare                  # 搜索
https://gh.gitcafe.ink/raw/vercel/next.js/main/package.json # 原始文件
https://gh.gitcafe.ink/api/github/repos/vercel/next.js      # GitHub API（兼容路径）
https://api.gh.gitcafe.ink/repos/vercel/next.js             # GitHub API（与官方路径一致）
https://ghassets.gitcafe.ink/assets/...                     # 静态资源（与官方路径一致）
```

`ghassets.gitcafe.ink` 与 `github.githubassets.com` 的路径完全一致，把页面里的静态资源地址从 `https://github.githubassets.com/...` 换成 `https://ghassets.gitcafe.ink/...` 即可走代理；主域名上的 `/assets/...` 兼容路径保持不变。

`api.gh.gitcafe.ink` 上的响应会保留 GitHub 的 `Link` 分页头，但其中的 URL 会重写为代理地址，因此按 `Link` 翻页仍然走代理：

```bash
curl -i "https://api.gh.gitcafe.ink/repos/vercel/next.js/issues?per_page=2"
```

Git 公开仓库加速：

```bash
git config --global url."https://gh.gitcafe.ink/".insteadOf "https://github.com/"
```

## 本地开发

```bash
cd cloudflare-worker
npm run dev
```

Wrangler 需要 Node.js（Bun 运行 `wrangler dev` 存在已知的 fetch 兼容问题）。

```bash
curl http://127.0.0.1:8787/__health
curl http://127.0.0.1:8787/vercel/next.js
curl http://127.0.0.1:8787/raw/vercel/next.js/main/package.json
curl http://127.0.0.1:8787/api/github/repos/vercel/next.js
```

类型检查：

```bash
npm run typecheck
```

## 缓存策略

| 内容 | 浏览器 / Worker 缓存 |
|---|---|
| `github.githubassets.com`、`media` | 30 天，immutable |
| Raw、Gist、头像、图片 | 7 天 |
| GitHub 网页 HTML | 5 分钟 |
| GitHub 其他网页资源 | 1 小时 |
| GitHub API | 1 分钟 |
| 带 `Authorization` 的请求 | 不缓存，`private, no-store` |
| 带 `Range` 的请求 | 不缓存 |

缓存 Key 包含目标 URL、访问域名、`Accept`、`Accept-Language` 和 API 版本，避免不同内容类型互相污染。`api.gh.gitcafe.ink` 与 `gh.gitcafe.ink/api/github/...` 分别缓存。

## 限制与注意事项

- 仅面向 GitHub 公共资源。登录、私有仓库网页、提交代码等需要 Cookie 的操作不支持。
- `api.gh.gitcafe.ink` 是公开的 GitHub API 代理，所有访客共享 Worker 出口 IP 的限额；未配置 `GITHUB_TOKEN` 时每小时只有 60 次匿名请求，生产环境务必配置只读 PAT。
- 请求头中的 `Cookie` 不会转发；GitHub 返回的 `Set-Cookie` 会被移除。
- 为了代理页面可用，Worker 会移除 GitHub 的 CSP、`X-Frame-Options` 和跨域隔离头。这是代理镜像的取舍，请勿在代理页面上处理敏感操作。
- Cloudflare Workers 免费版：10 万请求/天、单次 CPU 10ms。HTML 重写是流式的，但超大页面可能接近 CPU 上限；流量大时建议升级 Paid 计划。
- Git LFS、部分 Release 资源可能跳到 GitHub 的第三方存储域名，这些域名未被白名单覆盖时会直连。
- 这是一个开放代理，建议在 Cloudflare 侧加 WAF/速率限制或访问控制，避免被滥用。

## 目录

```
cloudflare-worker/
├── src/index.ts       # 全部路由、缓存、HTML/重定向重写
├── wrangler.toml
├── package.json
└── tsconfig.json
```

旧版 Vercel 部署已取消；现在只维护 Cloudflare Worker 一种部署方式。
