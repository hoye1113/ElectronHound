# 故障排除指南

本文档提供 ElectronHound 常见问题的诊断和解决方案，包括错误处理、调试技巧和性能优化建议。

---

## 常见错误及解决方案

### 安装和启动问题

#### 1. pnpm install 失败

**错误信息**:
```
ERR_PNPM_PEER_DEP_CHECKS  Missing peer dependencies
```

**原因**: 依赖版本不兼容

**解决方案**:

```bash
# 方案 1: 忽略 peer 依赖检查
pnpm install --no-strict-peer-dependencies

# 方案 2: 清除缓存后重试
pnpm store prune
pnpm install

# 方案 3: 删除 node_modules 后重试
rm -rf node_modules
pnpm install
```

---

#### 2. Electron 下载失败

**错误信息**:
```
Error: Failed to download Electron
```

**原因**: 网络问题或镜像源不可用

**解决方案**:

```bash
# 设置 Electron 镜像源
# Windows
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# macOS/Linux
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# 重新安装
pnpm install
```

---

#### 3. 端口被占用

**错误信息**:
```
Error: listen EADDRINUSE: address already in use :::3000
```

**解决方案**:

```bash
# 方案 1: 修改端口
# 编辑 .env 文件
PORT=3001

# 方案 2: 终止占用端口的进程
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3000
kill -9 <PID>
```

---

#### 4. TypeScript 编译错误

**错误信息**:
```
error TS2307: Cannot find module '@eata/shared-types'
```

**原因**: 包未正确链接或编译

**解决方案**:

```bash
# 重新构建所有包
pnpm build

# 或者单独构建 shared-types
pnpm --filter @eata/shared-types build
```

---

### LLM 配置问题

#### 5. API Key 无效

**错误信息**:
```
Error: Invalid API key
```

**解决方案**:

1. 检查 API Key 是否正确复制（没有多余空格）
2. 确认 API Key 是否过期
3. 确认 API Key 是否有足够额度
4. 通过 Dashboard 测试供应商连接

```bash
# 测试供应商连接
curl -X POST http://localhost:3000/api/providers/{providerId}/test
```

---

#### 6. LLM 调用超时

**错误信息**:
```
Error: Request timed out
```

**解决方案**:

1. 检查网络连接
2. 尝试使用其他供应商
3. 减少 `maxSteps` 配置

```env
# 使用更快的模型
LLM_MODEL=gpt-4o-mini
```

---

#### 7. 供应商连接失败

**错误信息**:
```
Error: Connection refused
```

**解决方案**:

1. 检查 Base URL 是否正确
2. 确认网络是否可以访问供应商 API
3. 检查是否有代理设置

```bash
# 测试网络连接
curl https://api.openai.com/v1/models
```

---

### 任务执行问题

#### 8. 任务一直 pending

**原因**: Worker 未启动或 LLM 配置错误

**解决方案**:

1. 检查 LLM 配置
   ```bash
   # 查看供应商列表
   curl http://localhost:3000/api/providers
   ```

2. 检查服务器日志
   ```bash
   # 设置日志级别为 debug
   LOG_LEVEL=debug pnpm dev
   ```

3. 检查 Worker 状态
   ```bash
   # 健康检查
   curl http://localhost:3000/health
   ```

---

#### 9. 任务执行失败

**错误信息**:
```
Task failed: Max steps reached
```

**原因**: 测试目标过于复杂或 LLM 理解有误

**解决方案**:

1. 简化测试目标
2. 增加 `maxSteps`
3. 优化测试目标描述

```json
{
  "goal": "更具体、更简单的测试目标",
  "maxSteps": 100
}
```

---

#### 10. 卡死检测触发

**错误信息**:
```
Stuck detected (stuckCounter=3)
```

**原因**: Agent 连续 3 次观察到相同的页面状态

**解决方案**:

1. 检查应用是否正确响应操作
2. 检查测试目标是否可行
3. 查看截图了解卡死时的页面状态

---

#### 11. Electron 应用启动失败

**错误信息**:
```
Error: Electron process exited before CDP ready
```

**原因**: Electron 应用无法启动或 CDP 端口未就绪

**解决方案**:

1. 确认应用路径正确
2. 确认应用可以正常启动
3. 检查应用是否支持 `--remote-debugging-port` 参数

```bash
# 手动测试应用启动
electron /path/to/app --remote-debugging-port=9222
```

---

#### 12. MCP 工具调用失败

**错误信息**:
```
Tool call failed: MCP client not connected
```

**原因**: MCP 服务器未启动或连接断开

**解决方案**:

1. 检查 MCP 服务器配置
2. 确认 Playwright 已安装
3. 查看 MCP 服务器日志

```bash
# 测试 Playwright MCP
npx @playwright/mcp --help
```

---

### 前端问题

#### 13. Dashboard 无法加载

**原因**: 前端服务未启动或后端不可用

**解决方案**:

1. 确认服务已启动
   ```bash
   pnpm dev
   ```

2. 检查浏览器控制台错误
3. 确认后端服务可访问
   ```bash
   curl http://localhost:3000/health
   ```

---

#### 14. SSE 连接断开

**症状**: 实时监控停止更新

**解决方案**:

1. 刷新页面重新连接
2. 检查网络连接
3. 查看浏览器控制台是否有错误

---

### Docker 问题

#### 15. Docker 构建失败

**错误信息**:
```
Error: Docker build failed
```

**解决方案**:

1. 检查 Dockerfile 语法
2. 确认网络可以下载依赖
3. 清除 Docker 缓存

```bash
# 清除缓存重建
docker-compose build --no-cache
docker-compose up
```

---

#### 16. 容器内 Electron 无法启动

**错误信息**:
```
Error: No display specified
```

**原因**: Docker 容器没有图形界面

**解决方案**:

使用 xvfb (X Virtual Framebuffer):

```dockerfile
# Dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libnotify-dev \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# 使用 xvfb 运行
CMD ["xvfb-run", "pnpm", "dev"]
```

---

## 调试技巧

### 1. 启用详细日志

```env
# .env 文件
LOG_LEVEL=debug
```

或启动时设置:

```bash
LOG_LEVEL=debug pnpm dev
```

---

### 2. 查看数据库内容

```bash
# 安装 sqlite3 CLI
npm install -g sqlite3

# 查看任务表
sqlite3 data/db.sqlite3 "SELECT * FROM tasks;"

# 查看步骤表
sqlite3 data/db.sqlite3 "SELECT * FROM steps WHERE task_id = 'your-task-id';"
```

---

### 3. 查看检查点数据

```bash
# 查看会话持久化数据
sqlite3 data/agent-checkpoints.sqlite3 ".tables"
```

---

### 4. 测试 MCP 工具

```bash
# 测试 Playwright MCP
npx @playwright/mcp --headless

# 测试 Electron Bridge MCP
npx @eata/electron-bridge-mcp /path/to/app
```

---

### 5. 使用 Chrome DevTools 调试

1. 启动 Electron 应用时启用调试端口:
   ```bash
   electron /path/to/app --remote-debugging-port=9222
   ```

2. 打开 Chrome DevTools:
   ```
   chrome://inspect
   ```

3. 连接到远程目标

---

### 6. 查看 SSE 事件流

```bash
# 使用 curl 测试 SSE 连接
curl -N http://localhost:3000/api/stream/tasks/{taskId}

# 或使用 httpie
http --stream GET http://localhost:3000/api/stream/tasks/{taskId}
```

---

### 7. 分析截图

截图保存在:
```
data/reports/{taskId}/screenshots/
```

查看截图可以了解:
- 任务执行时的页面状态
- 卡死时的页面状态
- 操作是否正确执行

---

### 8. 使用 VSCode 调试

创建 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "console": "integratedTerminal",
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  ]
}
```

---

## 性能优化建议

### 1. 优化测试目标

**问题**: 测试执行时间过长

**建议**:
- 减少测试步骤数量
- 简化测试场景
- 分解复杂测试为多个小测试

```bash
# 不好的示例
pnpm agent:run --goal "测试整个用户注册流程，包括表单填写、验证、提交、邮件确认等所有步骤"

# 好的示例
pnpm agent:run --goal "测试注册表单的邮箱格式验证"
```

---

### 2. 选择合适的 LLM 模型

| 模型 | 速度 | 准确性 | 成本 | 推荐场景 |
|------|------|--------|------|----------|
| GPT-4o-mini | 快 | 中 | 低 | 简单测试、开发调试 |
| GPT-4o | 中 | 高 | 中 | 生产测试、复杂场景 |
| DeepSeek Chat | 快 | 中 | 低 | 成本敏感场景 |
| 通义千问 Plus | 中 | 中 | 低 | 中文场景 |

```env
# 开发调试
LLM_MODEL=gpt-4o-mini

# 生产测试
LLM_MODEL=gpt-4o
```

---

### 3. 调整 Worker 配置

```json
{
  "worker": {
    "maxWorkers": 3,  // 根据 CPU 核心数调整
    "heartbeatInterval": 5000,
    "heartbeatTimeout": 30000
  }
}
```

**建议**:
- `maxWorkers` 设置为 CPU 核心数 - 1
- 内存不足时减少 `maxWorkers`
- 需要更高并发时增加 `maxWorkers`

---

### 4. 优化数据库性能

```javascript
// 启用 WAL 模式
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -2000'); // 2MB cache
```

---

### 5. 清理旧数据

```bash
# 清理旧报告
rm -rf data/reports/*

# 清理检查点
rm -rf data/agent-checkpoints.sqlite3

# 清理数据库中的旧任务
sqlite3 data/db.sqlite3 "DELETE FROM steps WHERE task_id IN (SELECT id FROM tasks WHERE created_at < datetime('now', '-30 days'));"
sqlite3 data/db.sqlite3 "DELETE FROM tasks WHERE created_at < datetime('now', '-30 days');"
```

---

### 6. 使用 SSD 存储

数据库和截图存储在磁盘上，使用 SSD 可以显著提升性能:
- 更快的数据库读写
- 更快的截图保存
- 更快的报告生成

---

### 7. 网络优化

如果使用远程 LLM API:
- 使用稳定的网络连接
- 考虑使用本地 LLM (如 Ollama)
- 配置适当的超时时间

---

### 8. 内存优化

```bash
# 增加 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=4096" pnpm dev
```

---

## 日志分析

### 日志级别

| 级别 | 说明 | 使用场景 |
|------|------|----------|
| `fatal` | 致命错误 | 系统崩溃 |
| `error` | 错误 | 功能异常 |
| `warn` | 警告 | 潜在问题 |
| `info` | 信息 | 正常运行 |
| `debug` | 调试 | 开发调试 |
| `trace` | 跟踪 | 详细追踪 |

### 日志格式

JSON 格式日志示例:

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

### 常见日志模式

**任务创建**:
```json
{
  "level": 30,
  "msg": "Task created",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "goal": "测试登录功能"
}
```

**步骤执行**:
```json
{
  "level": 30,
  "msg": "Step executed",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "stepIndex": 0,
  "phase": "observe",
  "status": "success",
  "duration": 1234
}
```

**LLM 调用**:
```json
{
  "level": 30,
  "msg": "LLM call completed",
  "model": "gpt-4o",
  "duration": 2345,
  "tokens": 1234
}
```

**错误日志**:
```json
{
  "level": 50,
  "msg": "Task failed",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Max steps reached",
  "stepCount": 50
}
```

---

## 获取帮助

### 1. 查看文档

- [用户手册](../user-guide/README.md) - 了解如何使用
- [API 文档](../api/README.md) - 查看 API 接口
- [架构说明](../architecture/README.md) - 了解系统架构

### 2. 搜索 Issues

访问 [GitHub Issues](https://github.com/hoye-git/ElectronHound/issues) 搜索类似问题。

### 3. 创建 Issue

如果遇到新问题，请创建 Issue 并包含:
- 问题描述
- 复现步骤
- 错误日志
- 环境信息

### 4. 社区讨论

参与 [GitHub Discussions](https://github.com/hoye-git/ElectronHound/discussions) 讨论。

---

## 下一步

- [用户手册](../user-guide/README.md) - 了解如何使用 ElectronHound
- [API 文档](../api/README.md) - 查看完整 API 文档
- [架构说明](../architecture/README.md) - 了解系统架构
