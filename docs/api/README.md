# API 文档

本文档详细说明 ElectronHound (EATA) 的 REST API 接口。

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **认证**: 可选（通过 `EATA_API_KEY` 环境变量配置）

## 认证

如果配置了 `EATA_API_KEY` 环境变量，所有 API 请求需要在 Header 中包含：

```
x-api-key: your_api_key_here
```

**注意**: `/health`、`/metrics`、`/docs` 和 `/api/stream` 端点不需要认证。

## 响应格式

### 成功响应

```json
{
  "data": { ... },
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### 错误响应

```json
{
  "error": "Error message",
  "details": [ ... ]
}
```

## API 端点

### 任务管理

#### 获取任务列表

```http
GET /api/tasks
```

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 否 | 任务状态过滤：`queued`, `running`, `completed`, `failed`, `cancelled`, `aborted` |
| `page` | number | 否 | 页码（默认: 1） |
| `limit` | number | 否 | 每页数量（默认: 20，最大: 100） |

**响应示例**:

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "goal": "验证登录表单在密码为空时显示错误提示",
      "targetAppPath": "/path/to/electron/app",
      "llmModel": "gpt-4o",
      "status": "completed",
      "maxSteps": 50,
      "stepCount": 12,
      "createdAt": "2026-05-27T10:00:00.000Z",
      "updatedAt": "2026-05-27T10:05:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

#### 获取任务详情

```http
GET /api/tasks/:id
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 任务 ID（UUID 格式） |

**响应示例**:

```json
{
  "task": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "goal": "验证登录表单在密码为空时显示错误提示",
    "targetAppPath": "/path/to/electron/app",
    "llmModel": "gpt-4o",
    "status": "completed",
    "maxSteps": 50,
    "stepCount": 12,
    "createdAt": "2026-05-27T10:00:00.000Z",
    "updatedAt": "2026-05-27T10:05:00.000Z"
  },
  "steps": [
    {
      "stepIndex": 0,
      "action": "observe",
      "description": "获取无障碍树快照",
      "screenshotPath": "screenshots/task-id/step-0.png",
      "result": "success",
      "timestamp": "2026-05-27T10:00:01.000Z"
    }
  ]
}
```

#### 创建任务

```http
POST /api/tasks
```

**请求体**:

```json
{
  "goal": "验证登录表单在密码为空时显示错误提示",
  "targetAppPath": "/path/to/electron/app",
  "llmModel": "gpt-4o",
  "maxSteps": 50,
  "contextInjection": "可选的上下文信息",
  "providerId": "optional-provider-id"
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `goal` | string | 是 | 测试目标（自然语言描述） |
| `targetAppPath` | string | 是 | Electron 应用路径 |
| `llmModel` | string | 否 | LLM 模型名称（默认: `gpt-4o`） |
| `maxSteps` | number | 否 | 最大执行步数（默认: 50） |
| `contextInjection` | string | 否 | 注入的上下文信息 |
| `providerId` | string | 否 | LLM 供应商 ID |

**响应示例** (201 Created):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "goal": "验证登录表单在密码为空时显示错误提示",
  "targetAppPath": "/path/to/electron/app",
  "llmModel": "gpt-4o",
  "status": "queued",
  "maxSteps": 50,
  "stepCount": 0,
  "createdAt": "2026-05-27T10:00:00.000Z",
  "updatedAt": "2026-05-27T10:00:00.000Z"
}
```

#### 取消任务

```http
POST /api/tasks/:id/cancel
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 任务 ID（UUID 格式） |

**响应示例**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "goal": "验证登录表单在密码为空时显示错误提示",
  "status": "cancelled",
  "updatedAt": "2026-05-27T10:02:00.000Z"
}
```

**错误响应**:

- `404`: 任务不存在
- `409`: 任务状态不可取消（非 `running` 或 `queued`）

#### 删除任务

```http
DELETE /api/tasks/:id
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 任务 ID（UUID 格式） |

**响应**: `204 No Content`

**错误响应**:

- `404`: 任务不存在

### 报告管理

#### 获取报告清单

```http
GET /api/tasks/:id/report
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 任务 ID（UUID 格式） |

**响应示例**:

```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "goal": "验证登录表单在密码为空时显示错误提示",
  "status": "completed",
  "steps": [
    {
      "stepIndex": 0,
      "action": "observe",
      "screenshot": "step-0.png"
    }
  ],
  "analysis": {
    "security": { ... },
    "performance": { ... },
    "accessibility": { ... },
    "patterns": { ... }
  }
}
```

#### 获取 HTML 报告

```http
GET /api/tasks/:id/report/html
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 任务 ID（UUID 格式） |

**响应**: `text/html` 格式的完整测试报告

#### 获取截图

```http
GET /api/tasks/:id/steps/:stepIndex/screenshot
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 任务 ID（UUID 格式） |
| `stepIndex` | number | 是 | 步骤索引（0-1000） |

**响应**: `image/png` 格式的截图文件

### 供应商管理

#### 获取供应商列表

```http
GET /api/providers
```

**响应示例**:

```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "type": "openai-compatible",
      "apiKey": "sk-xxx",
      "baseURL": "https://api.openai.com/v1",
      "model": "gpt-4o",
      "enabled": true,
      "isDefault": true
    }
  ]
}
```

#### 添加供应商

```http
POST /api/providers
```

**请求体**:

```json
{
  "id": "my-openai",
  "name": "My OpenAI",
  "type": "openai-compatible",
  "apiKey": "sk-xxx",
  "baseURL": "https://api.openai.com/v1",
  "model": "gpt-4o",
  "enabled": true
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 供应商唯一标识 |
| `name` | string | 是 | 供应商显示名称 |
| `type` | string | 是 | 供应商类型（固定: `openai-compatible`） |
| `apiKey` | string | 是 | API 密钥 |
| `baseURL` | string | 是 | API 基础 URL |
| `model` | string | 是 | 默认模型名称 |
| `enabled` | boolean | 否 | 是否启用（默认: `true`） |

**响应**: `201 Created` 返回供应商配置

#### 更新供应商

```http
PUT /api/providers/:id
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 供应商 ID |

**请求体**: 与添加供应商相同，所有字段可选

**响应**: 更新后的供应商配置

#### 删除供应商

```http
DELETE /api/providers/:id
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 供应商 ID |

**响应**: 删除后的供应商列表

#### 测试供应商连接

```http
POST /api/providers/:id/test
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 供应商 ID |

**响应示例**:

```json
{
  "success": true,
  "message": "Connection successful"
}
```

或失败时：

```json
{
  "success": false,
  "error": "Invalid API key"
}
```

#### 设置默认供应商

```http
POST /api/providers/:id/activate
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 供应商 ID |

**响应**: 更新后的供应商列表

### 反馈模式

#### 获取反馈模式

```http
GET /api/feedback/patterns
```

**响应示例**:

```json
{
  "patterns": [
    {
      "id": "pattern-1",
      "pattern": "登录失败",
      "description": "用户尝试登录时遇到的常见问题",
      "frequency": 5,
      "lastOccurred": "2026-05-27T10:00:00.000Z"
    }
  ]
}
```

### 实时流

#### SSE 任务流

```http
GET /api/stream/tasks/:id
```

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 任务 ID（UUID 格式） |

**响应**: `text/event-stream` 格式的 SSE 流

**事件类型**:

- `status`: 任务状态变更
- `step`: 新步骤执行
- `log`: 日志信息
- `complete`: 任务完成
- `error`: 错误信息

**示例**:

```javascript
const eventSource = new EventSource('http://localhost:3000/api/stream/tasks/{taskId}');

eventSource.addEventListener('step', (event) => {
  const step = JSON.parse(event.data);
  console.log('New step:', step);
});

eventSource.addEventListener('complete', (event) => {
  console.log('Task completed');
  eventSource.close();
});
```

### 健康检查

#### 健康检查端点

```http
GET /health
```

**响应示例**:

```json
{
  "status": "ok",
  "timestamp": "2026-05-27T10:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "ok"
    },
    "workerPool": {
      "status": "ok",
      "running": 1,
      "queued": 0,
      "maxWorkers": 3
    }
  }
}
```

## 错误码

| HTTP 状态码 | 说明 |
|-------------|------|
| `200` | 成功 |
| `201` | 创建成功 |
| `204` | 删除成功（无内容） |
| `400` | 请求参数错误 |
| `401` | 未授权（API Key 错误） |
| `404` | 资源不存在 |
| `409` | 冲突（如任务状态不可取消） |
| `500` | 服务器内部错误 |

## 示例代码

### cURL 示例

```bash
# 创建任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "验证登录表单在密码为空时显示错误提示",
    "targetAppPath": "/path/to/electron/app",
    "llmModel": "gpt-4o"
  }'

# 获取任务列表
curl http://localhost:3000/api/tasks

# 获取任务详情
curl http://localhost:3000/api/tasks/{taskId}

# 取消任务
curl -X POST http://localhost:3000/api/tasks/{taskId}/cancel

# 删除任务
curl -X DELETE http://localhost:3000/api/tasks/{taskId}

# 添加供应商
curl -X POST http://localhost:3000/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-openai",
    "name": "My OpenAI",
    "type": "openai-compatible",
    "apiKey": "sk-xxx",
    "baseURL": "https://api.openai.com/v1",
    "model": "gpt-4o"
  }'

# 测试供应商连接
curl -X POST http://localhost:3000/api/providers/{providerId}/test

# 获取反馈模式
curl http://localhost:3000/api/feedback/patterns

# 健康检查
curl http://localhost:3000/health
```

### JavaScript 示例

```javascript
// 创建任务
const response = await fetch('http://localhost:3000/api/tasks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_api_key_here'
  },
  body: JSON.stringify({
    goal: '验证登录表单在密码为空时显示错误提示',
    targetAppPath: '/path/to/electron/app',
    llmModel: 'gpt-4o'
  })
});

const task = await response.json();
console.log('Task created:', task);

// 获取任务列表
const tasksResponse = await fetch('http://localhost:3000/api/tasks');
const tasks = await tasksResponse.json();
console.log('Tasks:', tasks);

// 监听任务进度
const eventSource = new EventSource(
  `http://localhost:3000/api/stream/tasks/${task.id}`
);

eventSource.addEventListener('step', (event) => {
  const step = JSON.parse(event.data);
  console.log('Step:', step);
});

eventSource.addEventListener('complete', () => {
  console.log('Task completed');
  eventSource.close();
});
```

### Python 示例

```python
import requests

# 创建任务
response = requests.post(
    'http://localhost:3000/api/tasks',
    json={
        'goal': '验证登录表单在密码为空时显示错误提示',
        'targetAppPath': '/path/to/electron/app',
        'llmModel': 'gpt-4o'
    },
    headers={'Authorization': 'Bearer your_api_key_here'}
)

task = response.json()
print('Task created:', task)

# 获取任务列表
tasks_response = requests.get('http://localhost:3000/api/tasks')
tasks = tasks_response.json()
print('Tasks:', tasks)

# 获取任务详情
task_detail = requests.get(f'http://localhost:3000/api/tasks/{task["id"]}')
print('Task detail:', task_detail.json())
```

## 最佳实践

1. **错误处理**: 始终检查响应状态码和错误信息
2. **重试机制**: 对于网络错误，实现指数退避重试
3. **超时设置**: 设置合理的请求超时时间
4. **认证**: 在生产环境中始终配置 API Key
5. **日志**: 记录 API 调用日志以便调试

## 下一步

- [用户手册](../user-guide/README.md) - 了解如何使用 ElectronHound
- [架构说明](../architecture/README.md) - 了解系统架构
- [故障排除](../troubleshooting/README.md) - 遇到问题时的解决方案
