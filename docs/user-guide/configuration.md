# 配置说明

本文档详细说明 ElectronHound 的各种配置选项。

## 环境变量配置

### LLM 供应商配置

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `OPENAI_API_KEY` | LLM API Key | - | 是* |
| `OPENAI_BASE_URL` | LLM API 基础 URL | `https://api.openai.com/v1` | 否 |
| `LLM_MODEL` | 模型名称 | `gpt-4o` | 否 |
| `PROVIDER_ID` | 指定供应商 ID | - | 否 |

*注：如果通过 Dashboard 配置了供应商，则此项为可选。

### 服务器配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | `3000` |
| `HOST` | 服务器主机 | `0.0.0.0` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `DATABASE_PATH` | 数据库路径 | `./data/db.sqlite3` |
| `CHECKPOINT_PATH` | 检查点数据库路径 | `./data/agent-checkpoints.sqlite3` |
| `DATA_DIR` | 数据目录 | `./data` |

### API 认证配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EATA_API_KEY` | API 认证密钥 | - (禁用) |

设置此变量后，所有 API 请求需要在 Header 中包含：

```
x-api-key: your_api_key_here
```

## LLM 供应商配置

### 通过 Dashboard 配置

1. 访问 http://localhost:5173/settings
2. 点击 **+ 添加供应商**
3. 选择快速模板或手动填写：
   - **名称**: 供应商显示名称
   - **Base URL**: API 基础 URL
   - **API Key**: 您的 API 密钥
   - **默认模型**: 默认使用的模型名称
4. 点击 **添加** 保存
5. 可选：点击 ★ 设为默认供应商

### 内置供应商模板

| 供应商 | Base URL | 示例模型 |
|--------|----------|----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |

### 通过 API 配置

```bash
# 添加供应商
curl -X POST http://localhost:3000/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My OpenAI",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-xxx",
    "defaultModel": "gpt-4o"
  }'

# 获取供应商列表
curl http://localhost:3000/api/providers

# 设置默认供应商
curl -X POST http://localhost:3000/api/providers/{id}/activate

# 测试供应商连接
curl -X POST http://localhost:3000/api/providers/{id}/test
```

### 配置文件位置

供应商配置存储在：

```
~/.eata/providers.json
```

文件格式：

```json
{
  "providers": [
    {
      "id": "uuid",
      "name": "OpenAI",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-xxx",
      "defaultModel": "gpt-4o",
      "isDefault": true,
      "createdAt": "2026-05-27T00:00:00.000Z"
    }
  ]
}
```

## 服务器配置

### 配置文件

服务器配置可以通过环境变量或配置文件设置。

创建 `config.json` 文件：

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "logLevel": "info"
  },
  "database": {
    "path": "./data/db.sqlite3",
    "checkpointPath": "./data/agent-checkpoints.sqlite3"
  },
  "worker": {
    "maxWorkers": 3,
    "heartbeatInterval": 5000,
    "heartbeatTimeout": 30000
  },
  "agent": {
    "maxSteps": 50,
    "stuckThreshold": 3,
    "recursionLimit": 100
  }
}
```

### Worker 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `maxWorkers` | 最大 Worker 数量 | `3` |
| `heartbeatInterval` | 心跳间隔 (ms) | `5000` |
| `heartbeatTimeout` | 心跳超时 (ms) | `30000` |

### Agent 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `maxSteps` | 最大执行步数 | `50` |
| `stuckThreshold` | 卡死检测阈值 | `3` |
| `recursionLimit` | 递归限制 | `100` |

## Dashboard 配置

### 前端配置

Dashboard 配置位于 `apps/dashboard/vite.config.ts`：

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/stream': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
```

### 国际化配置

Dashboard 支持中英文切换，默认语言为中文。

语言文件位置：

```
apps/dashboard/src/i18n/locales/
├── zh.json
└── en.json
```

## 数据目录结构

```
data/
├── db.sqlite3                 # 主数据库
├── agent-checkpoints.sqlite3  # 会话持久化（SQLite）
├── feedback/
│   └── patterns.jsonl         # 反馈模式存储
├── few-shot-examples/         # Few-shot 示例
└── reports/                   # 生成的测试报告
    └── {task-id}/
        ├── manifest.json      # 报告清单
        ├── timeline.json      # 时间线数据
        ├── screenshots/       # 截图
        └── report.html        # HTML 报告
```

## Docker 配置

### docker-compose.yml

```yaml
version: '3.8'

services:
  server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_BASE_URL=${OPENAI_BASE_URL}
      - LLM_MODEL=${LLM_MODEL}
    volumes:
      - ./data:/app/data
      - ~/.eata:/root/.eata

  dashboard:
    build:
      context: .
      dockerfile: apps/dashboard/Dockerfile
    ports:
      - "5173:5173"
    depends_on:
      - server
```

### 环境变量传递

创建 `.env` 文件，Docker Compose 会自动读取：

```env
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
```

## 安全配置

### API 密钥保护

1. **生产环境必须设置 `EATA_API_KEY`**：

```env
EATA_API_KEY=your_secure_api_key_here
```

2. **不要在代码中硬编码 API 密钥**

3. **使用环境变量或密钥管理服务**

### CORS 配置

默认允许所有来源。生产环境建议限制：

```javascript
// apps/server/src/server.ts
fastify.register(cors, {
  origin: ['https://your-domain.com'],
  credentials: true,
});
```

### 文件上传限制

截图和报告文件大小限制：

```javascript
{
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
}
```

## 性能优化配置

### 数据库优化

```javascript
// 启用 WAL 模式
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -2000'); // 2MB cache
```

### Worker 池优化

根据系统资源调整：

```json
{
  "worker": {
    "maxWorkers": 3,  // CPU 核心数 - 1
    "queueSize": 100,
    "priorityLevels": 3
  }
}
```

### 内存限制

Node.js 内存限制：

```bash
# 增加内存限制到 4GB
NODE_OPTIONS="--max-old-space-size=4096" pnpm dev
```

## 日志配置

### 日志级别

| 级别 | 说明 |
|------|------|
| `fatal` | 致命错误 |
| `error` | 错误 |
| `warn` | 警告 |
| `info` | 信息 (默认) |
| `debug` | 调试 |
| `trace` | 跟踪 |

### 日志输出

```env
# 控制台输出
LOG_LEVEL=info

# 文件输出 (需要配置 Pino transport)
LOG_FILE=./data/logs/app.log
```

### 日志格式

JSON 格式日志示例：

```json
{
  "level": 30,
  "time": "2026-05-27T00:00:00.000Z",
  "pid": 12345,
  "hostname": "localhost",
  "msg": "Server started",
  "port": 3000
}
```

## 下一步

- [使用教程](./tutorial.md) - 学习如何使用 ElectronHound
- [常见问题](./faq.md) - 查看常见问题解答
- [故障排除](../troubleshooting/README.md) - 遇到问题时的解决方案