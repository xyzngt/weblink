# Weblink

## 简介

[**English Introduction**](README.md) | **中文介绍**

Weblink 是一款基于 WebRTC 的纯网页文件传输和聊天应用，无需下载或安装，直接在浏览器中即可使用。它采用了无服务器的 P2P 架构，支持多种后端，包括 Firebase 和 WebSocket，实现高效的点对点连接。此外，Weblink 通过端到端加密，保障信令消息的隐私和安全。

该项目已通过vercel部署，请访问 [https://web1ink.vercel.app](https://web1ink.vercel.app)。

或者使用部署在阿里云上的 [https://webl.ink](https://webl.ink) 。

## 功能

Weblink 目前支持以下功能：

| 功能          | 描述                                                            |
| ------------- | --------------------------------------------------------------- |
| ✅ 文件同步   | 获取对方缓存的文件，并获取文件                                  |
| ✅ 断点续传   | 文件传输过程中，如果连接中断，可以续传                          |
| ✅ 文件缓存   | 传输的文件会被缓存到 IndexedDB                                  |
| ✅ 文件搜索   | 可以搜索自己和对方在缓存中的文件                                |
| ✅ 视频通话   | 可进行视频通话                                                  |
| ✅ 剪贴板传输 | 对聊天窗口按 `Ctrl + V`，或在移动端输入框粘贴，可发送剪贴板内容 |
| ✅ 文件夹传输 | 可发送文件夹，并自动压缩                                        |
| ✅ 压缩传输   | 传输文件时，可选择压缩，文件将以区块为单位进行压缩并发送        |
| ✅ 多通道传输 | 通过多个 DataChannel 实现并行数据传输，提升传输性能             |
| ✅ 分享转发   | PWA 安装后，可通过系统分享发送文字或文件                        |
| ✅ 文字聊天   | 可发送文字进行聊天                                              |

更多信息请查看 [CHANGELOG](CHANGELOG.md) 了解最新更新。

## 使用方法

### 本地运行

```bash
git clone https://github.com/99percentpeople/weblink.git
cd weblink
pnpm install
```

确保你已经在项目中配置了 Firebase 的密钥（如下所示），然后运行以下命令：

```bash
# 进行开发
pnpm dev
# 构建
pnpm build
```

### 部署到 Docker

你可以使用 `docker-compose.yaml` 将项目部署到 Docker，并且会自动构建 [weblink-ws-server](https://github.com/99percentpeople/weblink-ws-server) 作为后端。

修改 `docker-compose.yaml` 文件以设置正确的环境变量，然后运行以下命令：

```bash
docker-compose up -d
```

启用 SSL 时，需要提供 SSL 证书 `cert.pem` 和密钥 `key.pem` 文件在 `docker/ssl` 目录下，然后运行以下命令：

```bash
ENABLE_SSL=true docker-compose up -d
```

你也可以使用 Dockerfile 部署到 Docker。

### 部署到 Vercel

你可以通过以下步骤将项目部署到 Vercel：

1. 前往 Vercel 网站 并登录（或创建一个账号）。
2. 连接你的 GitHub 仓库，选择你克隆的仓库。
3. 在 Vercel 项目设置中，找到 Environment Variables（环境变量），添加你的 Firebase API 密钥等环境变量（如下所示）。
4. 单击 "Deploy" 按钮，Vercel 将自动构建并部署你的项目。

### 环境变量配置 (Firebase)

在本地开发和部署到 Vercel 时，你需要配置 Firebase 的密钥。以下是需要添加的 Firebase 环境变量：

`VITE_FIREBASE_API_KEY`

`VITE_FIREBASE_AUTH_DOMAIN`

`VITE_FIREBASE_PROJECT_ID`

`VITE_FIREBASE_STORAGE_BUCKET`

`VITE_FIREBASE_MESSAGING_SENDER_ID`

`VITE_FIREBASE_APP_ID`

`VITE_FIREBASE_DATABASE_URL`

### WEBSOCKET 配置

本应用可以自行部署 WEBSOCKET 服务器，已经提供了一个 WEBSOCKET 服务器，可以自行选择是否使用。详情请参考 [weblink-ws-server](https://github.com/99percentpeople/weblink-ws-server)。

### Vercel 环境变量配置

部署到 Vercel 时，请按照以下步骤设置环境变量：

1. 打开你的 Vercel 项目，进入 "Settings"。

2. 找到 Environment Variables。

3. 分别添加上述 Firebase 配置项，将对应的值填入字段中。

### 本地环境变量 (.env.local)

在本地开发时，创建一个 .env.local 文件，将 后端选择 FIREBASE 或 WEBSOCKET：

```env
# 后端选择 FIREBASE 或 WEBSOCKET

# FIREBASE 配置
VITE_BACKEND=FIREBASE
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-firebase-auth-domain
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-firebase-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-firebase-messaging-sender-id
VITE_FIREBASE_APP_ID=your-firebase-app-id
VITE_FIREBASE_DATABASE_URL=your-database-url

# WEBSOCKET 配置
VITE_BACKEND=WEBSOCKET
VITE_WEBSOCKET_URL=your-websocket-url
```

## 注意事项

### 配置 TURN 服务器（非局域网连接）

如果你在非局域网（NAT 环境）下使用 P2P 连接，可能需要配置 TURN 服务器以确保能够建立连接。在设置页面中，你可以根据以下格式配置 TURN 服务器：

**TURN 配置格式**：

```plaintext
turn:turn1.example.com:3478|user1|pass1|longterm
turns:turn2.example.com:5349|user2|pass2|hmac
```

#### 公共 STUN 服务器

此应用默认使用 Google 的 STUN 服务器，如果无法连接，请自行配置 STUN 服务器。可以参考 [https://gist.github.com/mondain/b0ec1cf5f60ae726202e](https://gist.github.com/mondain/b0ec1cf5f60ae726202e) 获取公共 STUN 服务器列表。

#### Cloudflare Calls TURN 服务器

可以使用 Cloudflare Calls 提供的 TURN 服务器，请访问 [https://developers.cloudflare.com/calls/turn](https://developers.cloudflare.com/calls/turn)。

#### 自建 TURN 服务器

可以参考 [https://github.com/coturn/coturn](https://github.com/coturn/coturn) 自建 TURN 服务器。

### 局域网内使用

应用目前支持在非安全环境下局域网内使用，局域网内使用时，请确保你的设备在同一个局域网内，并且防火墙没有阻止 P2P 连接。

并同时运行 [weblink-ws-server](https://github.com/99percentpeople/weblink-ws-server) 以支持 WEBSOCKET 连接。

## 贡献

欢迎贡献代码！请随时提交问题或拉取请求。

## 许可证

该项目基于 [MIT License](LICENSE) 开源。
