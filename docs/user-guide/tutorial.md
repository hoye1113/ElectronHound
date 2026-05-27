# 使用教程

本教程将引导您如何使用 ElectronHound 测试 Electron 应用。

## 快速开始

### 1. 启动服务

```bash
# 进入项目目录
cd ElectronHound

# 启动开发服务
pnpm dev
```

服务启动后：
- Dashboard: http://localhost:5173
- Server API: http://localhost:3000

### 2. 配置 LLM 供应商

首次使用需要配置 LLM 供应商：

1. 打开 Dashboard: http://localhost:5173/settings
2. 点击 **+ 添加供应商**
3. 选择供应商模板（如 OpenAI）
4. 输入 API Key
5. 点击 **添加**
6. 点击 ★ 设为默认供应商

### 3. 创建测试任务

#### 通过 Dashboard 创建

1. 访问 http://localhost:5173
2. 点击 **+ 创建任务**
3. 填写任务信息：
   - **测试目标**: 用自然语言描述测试目标
   - **应用路径**: Electron 应用的路径
   - **LLM 供应商**: 选择使用的供应商（可选）
4. 点击 **创建**

#### 通过 CLI 创建

```bash
pnpm agent:run \
  --goal "验证登录表单在密码为空时显示错误提示" \
  --app /path/to/electron/app \
  --model gpt-4o
```

#### 通过 API 创建

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "验证登录表单在密码为空时显示错误提示",
    "appPath": "/path/to/electron/app",
    "providerId": "optional-provider-id"
  }'
```

## 测试目标编写指南

### 基础示例

好的测试目标应该：

1. **明确具体**
   - 好: "验证点击登录按钮后，如果用户名为空，显示'请输入用户名'的错误提示"
   - 差: "测试登录功能"

2. **包含预期结果**
   - 好: "验证提交表单后，页面跳转到首页"
   - 差: "测试表单提交"

3. **描述用户场景**
   - 好: "模拟新用户注册流程，填写所有必填字段后点击注册"
   - 差: "测试注册"

### 测试目标示例

#### 功能测试

```
验证登录表单：
1. 输入正确的用户名和密码
2. 点击登录按钮
3. 验证成功跳转到首页
4. 验证显示欢迎消息
```

#### 边界测试

```
测试文件上传功能：
1. 尝试上传超过 10MB 的文件
2. 验证显示文件过大的错误提示
3. 尝试上传不支持的文件格式
4. 验证显示格式不支持的错误提示
```

#### 错误处理测试

```
测试网络错误处理：
1. 断开网络连接
2. 尝试提交表单
3. 验证显示网络错误提示
4. 验证提供重试按钮
```

## 监控测试执行

### 实时监控

1. 创建任务后，点击任务进入详情页
2. 查看实时步骤时间线
3. 观察每一步的截图和操作
4. 查看无障碍树视图

### SSE 实时流

通过 API 订阅实时事件：

```javascript
const eventSource = new EventSource('http://localhost:3000/api/stream/tasks/{taskId}');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Step:', data);
};

eventSource.addEventListener('step', (event) => {
  const step = JSON.parse(event.data);
  console.log('New step:', step);
});

eventSource.addEventListener('complete', (event) => {
  console.log('Task completed');
  eventSource.close();
});
```

### 任务状态

| 状态 | 说明 |
|------|------|
| `pending` | 等待执行 |
| `running` | 正在执行 |
| `completed` | 执行完成 |
| `failed` | 执行失败 |
| `cancelled` | 已取消 |

## 查看测试报告

### 通过 Dashboard 查看

1. 任务完成后，点击任务进入详情页
2. 查看测试报告摘要
3. 点击 **查看完整报告** 查看详细内容

### 报告内容

测试报告包含：

1. **执行摘要**
   - 测试目标
   - 执行状态
   - 执行时间
   - 步骤数量

2. **步骤详情**
   - 每一步的操作描述
   - 操作前后的截图
   - 无障碍树快照
   - 执行结果

3. **分析报告**
   - 安全分析
   - 性能分析
   - 无障碍分析
   - 模式检测

4. **子代理审计**
   - TestPlanner 分析
   - ExecutionAnalyst 分析
   - SecurityReviewer 分析
   - ReportSynthesizer 综合报告

### 通过 API 获取报告

```bash
# 获取报告清单
curl http://localhost:3000/api/reports/{taskId}/manifest

# 获取报告时间线
curl http://localhost:3000/api/reports/{taskId}/timeline
```

## 管理任务

### 查看任务列表

```bash
# 通过 API
curl http://localhost:3000/api/tasks

# 通过 Dashboard
# 访问 http://localhost:5173
```

### 取消任务

```bash
# 通过 API
curl -X POST http://localhost:3000/api/tasks/{taskId}/cancel

# 通过 Dashboard
# 点击任务详情页的"取消"按钮
```

### 删除任务

```bash
# 通过 API
curl -X DELETE http://localhost:3000/api/tasks/{taskId}

# 通过 Dashboard
# 点击任务详情页的"删除"按钮
```

## 高级功能

### 使用不同的 LLM 供应商

创建任务时可以指定不同的供应商：

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试登录功能",
    "appPath": "/path/to/electron/app",
    "providerId": "deepseek-provider-id"
  }'
```

### A/B 测试

使用不同模型测试同一目标：

```bash
# 使用 GPT-4o
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试登录功能",
    "appPath": "/path/to/electron/app",
    "providerId": "openai-provider-id"
  }'

# 使用 DeepSeek
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试登录功能",
    "appPath": "/path/to/electron/app",
    "providerId": "deepseek-provider-id"
  }'
```

### 反馈模式学习

ElectronHound 会自动学习失败模式：

1. 测试失败时，系统自动记录失败模式
2. 后续测试会参考这些失败模式
3. 可以在 Dashboard 查看反馈模式

```bash
# 获取反馈模式
curl http://localhost:3000/api/feedback/patterns
```

## 最佳实践

### 1. 测试目标设计

- **单一职责**: 每个测试任务只测试一个功能点
- **明确预期**: 清楚描述预期结果
- **可验证性**: 确保结果可以自动验证

### 2. 应用准备

- **调试模式**: 确保 Electron 应用支持调试模式
- **测试数据**: 准备好测试数据
- **环境隔离**: 使用独立的测试环境

### 3. 结果分析

- **查看截图**: 仔细查看每一步的截图
- **分析报告**: 阅读完整的分析报告
- **跟踪问题**: 记录发现的问题

### 4. 持续集成

将 ElectronHound 集成到 CI/CD 流程：

```yaml
# .github/workflows/test.yml
name: Electron App Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        run: npm install -g pnpm@9

      - name: Install dependencies
        run: pnpm install

      - name: Run ElectronHound tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          pnpm dev &
          sleep 10
          pnpm agent:run \
            --goal "验证应用启动正常" \
            --app ./path/to/electron/app \
            --model gpt-4o
```

## 示例场景

### 场景 1: 测试登录功能

```bash
pnpm agent:run \
  --goal "测试登录功能：
    1. 输入用户名 'testuser' 和密码 'password123'
    2. 点击登录按钮
    3. 验证成功跳转到首页
    4. 验证显示欢迎消息 '欢迎回来，testuser'" \
  --app /path/to/electron/app
```

### 场景 2: 测试表单验证

```bash
pnpm agent:run \
  --goal "测试注册表单验证：
    1. 不填写任何字段，点击注册
    2. 验证显示所有必填字段的错误提示
    3. 输入无效的邮箱格式
    4. 验证显示邮箱格式错误提示
    5. 输入两次不同的密码
    6. 验证显示密码不匹配提示" \
  --app /path/to/electron/app
```

### 场景 3: 测试文件操作

```bash
pnpm agent:run \
  --goal "测试文件保存功能：
    1. 创建新文件
    2. 输入文件内容
    3. 点击保存按钮
    4. 验证显示保存成功提示
    5. 验证文件已创建" \
  --app /path/to/electron/app
```

## 下一步

- [常见问题](./faq.md) - 查看常见问题解答
- [故障排除](../troubleshooting/README.md) - 遇到问题时的解决方案
- [API 文档](../api/README.md) - 查看完整 API 文档