# 安装指南

本指南将帮助您在本地环境中安装和配置 ElectronHound (EATA)。

## 系统要求

### 最低要求

- **操作系统**: Windows 10/11, macOS 12+, Ubuntu 20.04+
- **Node.js**: >= 20.0.0
- **pnpm**: >= 9.0.0
- **内存**: 8GB RAM
- **磁盘空间**: 2GB 可用空间

### 推荐配置

- **操作系统**: Windows 11, macOS 14+, Ubuntu 22.04+
- **Node.js**: 20.x LTS
- **pnpm**: 9.x
- **内存**: 16GB RAM
- **磁盘空间**: 5GB 可用空间

## 安装步骤

### 1. 安装 Node.js

#### Windows

访问 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。

或者使用 [nvm-windows](https://github.com/coreybutler/nvm-windows):

```bash
nvm install 20
nvm use 20
```

#### macOS

使用 Homebrew:

```bash
brew install node@20
```

或者使用 [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 20
nvm use 20
```

#### Ubuntu/Debian

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 安装 pnpm

```bash
npm install -g pnpm@9
```

或者使用 corepack (Node.js 16.13+):

```bash
corepack enable
corepack prepare pnpm@9 --activate
```

### 3. 克隆仓库

```bash
git clone https://github.com/hoye-git/ElectronHound.git
cd ElectronHound
```

### 4. 安装依赖

```bash
pnpm install
```

**注意**: 首次安装可能需要几分钟，因为需要下载 Electron 二进制文件。

### 5. 配置环境变量

复制示例环境变量文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置 LLM API Key：

```env
# LLM Provider (必填)
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# Server (可选)
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# API Authentication (可选)
EATA_API_KEY=

# Provider ID (可选)
PROVIDER_ID=
```

### 6. 启动开发服务

```bash
pnpm dev
```

启动成功后，您将看到：

- **Dashboard**: http://localhost:5173
- **Server API**: http://localhost:3000

## Docker 安装（可选）

如果您希望使用 Docker 运行 ElectronHound：

### 前提条件

- Docker >= 20.10
- Docker Compose >= 2.0

### 启动服务

```bash
# 构建并启动
docker-compose up

# 后台运行
docker-compose up -d
```

### 查看日志

```bash
docker-compose logs -f
```

### 停止服务

```bash
docker-compose down
```

## 验证安装

### 1. 检查服务状态

访问 http://localhost:3000/health，应该返回：

```json
{
  "status": "ok",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

### 2. 运行测试

```bash
pnpm test
```

所有测试应该通过。

### 3. 访问 Dashboard

打开浏览器访问 http://localhost:5173，应该看到 ElectronHound Dashboard 界面。

## 常见安装问题

### 问题 1: pnpm install 失败

**错误信息**:
```
ERR_PNPM_PEER_DEP_CHECKS  Missing peer dependencies
```

**解决方案**:

```bash
pnpm install --no-strict-peer-dependencies
```

### 问题 2: Electron 下载失败

**错误信息**:
```
Error: Failed to download Electron
```

**解决方案**:

设置 Electron 镜像源：

```bash
# Windows
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# macOS/Linux
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

pnpm install
```

### 问题 3: 端口被占用

**错误信息**:
```
Error: listen EADDRINUSE: address already in use :::3000
```

**解决方案**:

修改 `.env` 文件中的端口配置：

```env
PORT=3001
```

或者终止占用端口的进程：

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3000
kill -9 <PID>
```

### 问题 4: 权限问题

**错误信息**:
```
Error: EACCES: permission denied
```

**解决方案**:

```bash
# macOS/Linux
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) ~/.pnpm-store

# Windows (以管理员身份运行 PowerShell)
icacls %APPDATA%\npm /grant %USERNAME%:F /T
```

## 下一步

安装完成后，建议阅读：

- [配置说明](./configuration.md) - 了解详细配置选项
- [使用教程](./tutorial.md) - 学习如何使用 ElectronHound
- [常见问题](./faq.md) - 查看常见问题解答