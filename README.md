# GitHub Proxy

利用 Vercel 和 Cloudflare 边缘计算加速 GitHub 公共资源访问，适合国内受限网络环境下小团队使用。

## ✨ 功能特性

- ✅ GitHub 网页完整访问，支持搜索、查看仓库、Release下载等
- ✅ Raw 文件高速下载，支持 `raw.githubusercontent.com` 资源
- ✅ Gist 访问支持
- ✅ 多级缓存机制，静态资源缓存7天，动态内容缓存1小时
- ✅ 安全防护：SSRF攻击防护、敏感信息过滤、域名白名单校验
- ✅ Git 仓库克隆加速，无需额外配置客户端

## 🚀 使用方法

### 网页访问
直接访问 `https://你的代理域名/{owner}/{repo}` 即可访问 GitHub 仓库页面。

示例：`https://gh.yourdomain.com/vercel/next.js`

### 搜索功能
直接访问 `https://你的代理域名/search?q=关键词` 即可使用 GitHub 搜索。

### Raw 文件下载
通过 `/raw/` 前缀访问 raw 文件内容。

示例：`https://gh.yourdomain.com/raw/vercel/next.js/main/package.json`

### Git 加速配置
一行命令配置所有 git 请求自动走代理：
```bash
git config --global url."https://你的代理域名/".insteadOf "https://github.com/"
```
配置后所有 `git clone`、`git pull`、`git push`（仅公开仓库）操作都会自动通过代理访问。

## 🔧 部署配置

### 环境变量配置
#### Vercel 环境变量
- `CLOUDFLARE_WORKER_URL`：你部署的 Cloudflare Worker 地址（必填，格式如 `https://xxx.xxx.workers.dev`）
- `PROXY_DOMAIN`：你的代理服务域名（必填，用于重定向替换，如 `gh.yourdomain.com`，不需要 https 前缀）

#### Cloudflare Worker 环境变量
- `GITHUB_TOKEN`：GitHub 个人访问令牌（可选，用于提升 API 请求限额，避免频繁访问被限流）

### 部署步骤

#### 1. 部署 Cloudflare Worker
**方式一：Cloudflare 控制台自动构建（推荐）**
1. 在 Cloudflare 控制台创建 Worker，连接到你的 GitHub 仓库
2. 构建配置设置：
   - 根目录：`/cloudflare-worker`
   - 构建命令：`npm install`
   - 部署命令：`npx wrangler deploy`
3. 保存配置，触发自动部署
4. 部署完成后记录 Worker 访问地址

**方式二：本地命令行部署**
```bash
cd cloudflare-worker && npm install && npm run deploy
```

#### 2. 部署 Vercel 项目
1. 在 Vercel 导入你的 GitHub 仓库
2. 项目配置设置：
   - Framework Preset：选择 `Next.js`
   - Build Command：`npm run build`
   - Root Directory：`vercel`
3. 配置上述 Vercel 环境变量
4. 点击 Deploy 部署
5. 部署完成后绑定自定义域名
6. 配置域名 DNS CNAME 指向 Vercel 分配的地址

## 🏗️ 架构设计

```
用户 → Vercel Edge Functions (路由层) → Cloudflare Worker (缓存层) → GitHub
```

- **路由层**：负责路径解析、请求头处理、重定向替换
- **缓存层**：负责实际请求GitHub、多级缓存、安全校验

## 📊 免费额度说明
完全满足2-3人小团队日常使用：
- Vercel 免费层：100GB/月带宽
- Cloudflare Worker 免费层：10万请求/天

## ⚠️ 使用限制
- 仅支持 GitHub 公共仓库访问，不支持私有仓库
- 不支持需要登录的操作（如提交代码、创建Issue等）
- 免费层有额度限制，大规模使用需要付费升级
- 建议配置访问控制（如IP白名单）避免服务被滥用
