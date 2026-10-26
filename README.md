# GitHub Proxy

一个只依赖 **Cloudflare Workers** 的 GitHub 公共资源代理。无需额外服务器、无需数据库。

请求路径直接映射 GitHub 域名，Worker 在边缘完成转发、缓存、HTML 链接重写和重定向重写：

```
用户 → Cloudflare Worker（路由 + 缓存 + 重写）→ GitHub
```

## 功能

- GitHub 网页访问：仓库、搜索、Issue、Release 页面
- Raw 文件、Gist 原始内容
- GitHub 静态资源（JS/CSS/字体/图片）
- 头像、README 图片（avatars / camo / user-images）
- GitHub REST API（含 CORS 预检）
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
| `/avatars/...` | `avatars.githubusercontent.com` |
| `/camo/...` | `camo.githubusercontent.com` |
| `/user-images/...` | `user-images.githubusercontent.com` |
| `/private-user-images/...` | `private-user-images.githubusercontent.com` |
| `/media/...` | `media.githubusercontent.com` |
| `/api/github/...` | `api.github.com` |
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

部署完成后地址形如：

```
https://github-proxy.<你的子域>.workers.dev
```

`wrangler.toml` 中的 `name` 决定 Worker 名称；如需换名字，修改 `name` 后再部署。

### 4. 可选：GitHub Token

匿名访问 GitHub API 的限额较低。建议配置一个只读 PAT：

```bash
npx wrangler secret put GITHUB_TOKEN
```

Worker 只会在请求 GitHub API 时使用该 Token；静态 CDN 和签名下载地址不会收到它。用户自己传入的 `Authorization` 会转发给 GitHub API/网页/raw，并绕过缓存。

> **安全要求**：`GITHUB_TOKEN` 必须是只读、仅授予公共仓库权限的 token。不要使用拥有私有仓库权限的 token——否则任何能访问代理的人都可以读取该 token 能看到的私有内容。

### 5. 可选：自定义域名

在 Cloudflare Dashboard → Workers & Pages → `github-proxy` → Settings → Domains & Routes 中添加 Custom Domain。无需改代码，HTML 重写会自动使用访问域名。

## 使用

```text
https://<worker>/vercel/next.js                       # 仓库页面
https://<worker>/search?q=cloudflare                  # 搜索
https://<worker>/raw/vercel/next.js/main/package.json # 原始文件
https://<worker>/api/github/repos/vercel/next.js      # GitHub API
```

Git 公开仓库加速：

```bash
git config --global url."https://<worker>/".insteadOf "https://github.com/"
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

缓存 Key 包含目标 URL、访问域名、`Accept`、`Accept-Language` 和 API 版本，避免不同内容类型互相污染。

## 限制与注意事项

- 仅面向 GitHub 公共资源。登录、私有仓库网页、提交代码等需要 Cookie 的操作不支持。
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
