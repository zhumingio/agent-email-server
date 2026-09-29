# zmail · 自托管 Web 邮箱客户端（带 MCP）

支持常见国内邮箱（163 / QQ / 126 / 新浪）与 Gmail / Outlook，Web 界面 + MCP 双入口，
全部数据与流量都在你自己的服务器上。

- **后端**：Node.js + TypeScript，`imapflow`（IMAP，含 XOAUTH2 与实时推送）+ `nodemailer`（SMTP）
- **前端**：React + Ant Design（三栏：账户树 / 邮件列表 / 阅读区；手机单栏响应式）
- **App**：Windows（Tauri，界面与 Web 一致）+ Android（Capacitor，移动端优化）+ PWA（可直接安装）
- **MCP**：官方 `@modelcontextprotocol/sdk`，Streamable HTTP，Bearer Token 鉴权
- **鉴权**：单一 API Token，Web 登录与 MCP / App 调用共用；已开启 CORS 供 App 跨域直连
- **存储**：SQLite（`node:sqlite` 内置，无需原生编译），OAuth 令牌 AES 加密落盘
- **部署**：Docker Compose + Nginx（TLS）

## 客户端 / App

同一套 Web 界面 + 两个原生壳 + PWA，全部**直连你的后台**（在登录页填服务器地址 + API Token 即可）：

| 端 | 方案 | 获取方式 |
|---|---|---|
| Web | 直接访问 | `https://mail.example.com` |
| Windows | **Tauri**（内嵌同一 Web UI，界面与网页一致） | GitHub Actions 产物 `.exe/.msi`，或本地 `apps/desktop` 构建 |
| Android | **Capacitor**（WebView 壳，移动端优化） | GitHub Actions 产物 `.apk`，或本地 `apps/mobile` 构建 |
| 手机/电脑通用 | **PWA** | 浏览器打开站点 → 安装到主屏幕（离线可用） |

### App 连接方式

App 启动后在登录页填写：
- **服务器地址**：`https://mail.example.com`
- **API Token**：与 Web / MCP 同一个

凭据保存在本地（WebView localStorage），请求全部走 `Authorization: Bearer`，
不依赖浏览器 Cookie，因此跨域直连无障碍（后端已开 CORS）。

### 构建 Android APK（`apps/mobile`）

```bash
# 需要 JDK 17 + Android SDK
cd apps/mobile
npm install
npm run build:apk          # 产出 android/app/build/outputs/apk/debug/app-debug.apk
# 或直接推送代码到 GitHub，触发 .github/workflows/build-apk.yml 自动构建并下载产物
```

### 构建 Windows 安装包（`apps/desktop`）

```bash
# 需要在 Windows 机器上（含 Rust stable + Node 24）
cd apps/desktop
npm install
npm run build               # 产出 src-tauri/target/release/bundle/{msi,nsis}
# 或直接推送代码到 GitHub，触发 .github/workflows/build-windows.yml 自动构建并下载产物
```

> ⚠️ **Tauri v2 注意**：本项目是 Tauri **v2**。请用本项目内 `npx tauri build`（npm 包 `@tauri-apps/cli@2`），
> **不要**用系统全局 `cargo tauri`（很可能是 v1，无法编译 v2 项目，会报 frontendDist/config 不识别）。
> 一键脚本：Windows 上运行 `apps/desktop/build-local.ps1`（自动构建前端 → 装 v2 CLI → 出安装包）。
> 首次编译需下载并编译全部 Rust 依赖，约 15-30 分钟。

> 说明：`apps/desktop` 与 `apps/mobile` 复用 `packages/web` 的构建产物（`npm run build` 已自动先构建 Web）。
> Android / Windows 的正式安装包需要各自的 SDK/工具链，CI 已配好，本地只需有对应平台环境。

### PWA 安装

浏览器打开 `https://mail.example.com`，地址栏会出现「安装」按钮（Android Chrome / Windows Edge），
安装后以独立窗口运行，支持离线打开应用外壳。


## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env：
#   ZMAIL_PUBLIC_BASE_URL=https://mail.example.com
#   ZMAIL_API_TOKEN=<你的访问令牌>            # 不设则首次启动自动生成；生成方法见下文
#   ZMAIL_MASTER_KEY=<随机长字符串>           # 加密凭据用，务必设置并备份
#   GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET
#   OUTLOOK_OAUTH_CLIENT_ID / OUTLOOK_OAUTH_CLIENT_SECRET
```

#### API Token 的生成与获取

ZMAIL_API_TOKEN 是 Web 登录、App、MCP 三端共用的主访问令牌，生成方式如下（按优先级）：

1. **自行生成**（推荐，部署前在 .env 中设置）。用任意方式生成一串强随机值即可，例如：

   ```bash
   # 方法一：openssl（96 位十六进制，与自动生成格式一致）
   openssl rand -hex 48

   # 方法二：Linux /dev/urandom（48 字节 = 96 个十六进制字符）
   head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n'; echo

   # 方法三：Node（需要已安装 Node）
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   把输出填入 .env：

   ```bash
   ZMAIL_API_TOKEN=上一步生成的96位十六进制字符串
   ```

2. **不设置则首次启动自动生成**：启动时若 `ZMAIL_API_TOKEN` 为空，服务会自动生成 **96 位十六进制** token 并持久化到数据目录的 `api_token.secret` 文件（权限 600，`docker compose down` 不会丢失）。取回方式：

   ```bash
   # 宿主机直接读取（注意：容器以 root 写入，文件属主可能是 nobody）
   cat ./data/api_token.secret

   # 或从容器的数据目录读取（最可靠）
   docker exec zmail-app-1 cat /data/api_token.secret

   # 或查看启动日志（只显示首尾几位，用于核对）
   docker logs zmail-app-1 2>&1 | grep "API Token"
   ```

3. **登录后重新生成**：登录 Web 后进入「设置 → 安全 → 重新生成 API Token」，会立即用新 token 覆盖 `api_token.secret`，旧 token 即刻失效（App/MCP 需同步更新）。
   > 注意：若你是通过环境变量 `ZMAIL_API_TOKEN` 指定的 token，设置页会提示「由环境变量指定」，此操作不可用——需直接改 `.env` 并重启容器。

> ⚠️ Token 是主密钥：Web / App / MCP 共用同一个值，请妥善保管，不要泄露或提交到仓库（`.env` 已在 `.gitignore` 中）。

### 2. 证书（可选，默认自动降级 HTTP）

- **没放证书也能启动**：nginx 自动用 HTTP（仅 80 端口）代理到 app，`docker compose up` 立即可访问。
- 部署正式 HTTPS：把你的域名的 `fullchain.pem` / `privkey.pem` 放进 `./certs/`，
  然后 `docker compose up -d --force-recreate nginx` 自动切换为 HTTPS（详见 `certs/README.md`）。
- **HTTPS 对外端口为 `22345`**（compose 映射 `22345:443`），80 端口 HTTP 自动 301 跳转到 `https://<你的域名>:22345`。
  访问示例：`https://mail.example.com:22345`；如需改端口，编辑 `docker-compose.yml` 中 nginx 的 ports 映射与 `nginx/nginx.https.conf` 的跳转行。
- 如果你已有反代/网关，只用 `app` 服务即可（去掉 nginx 服务）。

### 3. 启动

```bash
docker compose up -d --build
# 访问 https://mail.example.com ，用 API Token 登录
```

数据持久化在 `./data/`（SQLite + 加密令牌）。

## MCP 接入（给 AI 客户端）

```
{
  "mcpServers": {
    "zmail": {
      "type": "http",
      "url": "https://mail.example.com/mcp",
      "headers": { "Authorization": "Bearer <API Token>" }
    }
  }
}
```

可用工具：

| 分类 | 工具 |
|---|---|
| 账户 | `list_accounts` |
| 文件夹 | `list_mailboxes` |
| 邮件 | `list_emails`、`search_emails`、`get_email`、`get_attachment`、`get_unread_counts` |
| 操作 | `send_email`、`reply_email`、`forward_email`、`save_draft`、`mark_read`、`mark_unread`、`mark_flagged`、`move_email`、`trash_email` |

## 邮箱配置指南

### 国内邮箱（163 / QQ / 126 / 新浪）

1. 登录邮箱网页端，在设置中开启 **IMAP/SMTP 服务**，生成**授权码**（不是登录密码）。
2. zmail「设置 → 添加账户」，选对应类型，填邮箱 + 授权码即可（服务器已预填）。

### Gmail

1. [Google Cloud Console](https://console.cloud.google.com/) 创建项目 → 启用 **Gmail API**。
2. 「凭据 → 创建 OAuth 客户端 ID」：应用类型=Web 应用。
   - 授权重定向 URI：`https://mail.example.com/api/oauth/google/callback`
   - 记录 Client ID / Client Secret 填入 zmail 设置（或 `.env`）。
3. 「OAuth 同意屏幕」把邮箱加入测试用户（或发布应用）。
4. zmail 中添加 Gmail 账户 → 点「连接授权」完成 OAuth。

### Outlook / Hotmail

1. [Microsoft Entra 管理中心](https://entra.microsoft.com/) → 应用注册 → 新注册。
   - 支持的账户类型：`个人 Microsoft 账户` 或 `任何组织目录... 和个人账户`。
   - 重定向 URI：`https://mail.example.com/api/oauth/microsoft/callback`
2. 「API 权限」添加委派权限：`IMAP.AccessAsUser.All`、`SMTP.Send`、`offline_access`。
3. 「证书和密码」创建客户端机密，记录 Client ID / Secret。
4. zmail 中添加 Outlook 账户 → 点「连接授权」。

## 本地开发

```bash
pnpm install --store-dir .pnpm-store
pnpm --filter @zmail/api dev      # 后端 :3000
pnpm --filter @zmail/web dev      # 前端 :5173（代理到后端）
```

## App / REST API（供客户端直连）

App 与 Web 共用同一套 REST API，统一 `Authorization: Bearer <API Token>`（CORS 已放开）：

| 接口 | 说明 |
|---|---|
| `GET /api/app/info` | 服务器信息/版本/能力（公开，供 App 探测连通性） |
| `POST /api/app/devices` | 注册设备（App 启动时调用，为推送预留） |
| `GET /api/app/devices` / `DELETE /api/app/devices/:id` | 设备列表 / 注销 |
| `GET /api/accounts` `POST/PUT/DELETE /api/accounts/...` | 邮箱账户 CRUD + `POST .../test` 连接测试 |
| `GET /api/accounts/:id/mailboxes` | 文件夹列表（含未读数） |
| `GET /api/accounts/:id/messages?mailbox=&page=&query=&unread=` | 邮件列表/搜索 |
| `GET /api/accounts/:id/messages/:uid` | 邮件详情（净化后 HTML） |
| `GET .../attachment/:index` | 附件下载 |
| `POST .../messages/mark|flag|move|trash` | 批量已读/星标/移动/删除 |
| `POST .../send` `/reply` `/forward` `/draft` | 发送/回复/转发/草稿 |
| `GET /api/stream` | SSE 实时推送（跨源可用 `?token=` 鉴权） |
| `POST /api/auth/login` | 登录（Token → Cookie 会话） |

## 目录结构

```
packages/api   后端（REST + App API + MCP + IMAP/SMTP 引擎）
packages/web   前端（React + Ant Design + PWA）
apps/desktop   Windows App（Tauri 壳，复用 web 构建）
apps/mobile    Android App（Capacitor 壳，复用 web 构建）
nginx/         TLS 反向代理
data/          SQLite + 加密令牌（volume）
.github/       CI：Android APK + Windows 安装包
```

## License

[MIT License](LICENSE) © 2026 Zhu Ming

