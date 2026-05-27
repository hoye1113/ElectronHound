# 示例和教程

本文档提供 ElectronHound 的基础和高级使用示例，以及最佳实践指南。

---

## 基础示例

### 示例 1: 测试登录功能

**目标**: 验证登录表单的基本功能

**测试目标描述**:
```
测试登录功能：
1. 在用户名输入框输入 'admin'
2. 在密码输入框输入 'password123'
3. 点击登录按钮
4. 验证成功跳转到首页
5. 验证显示欢迎消息
```

**CLI 命令**:
```bash
pnpm agent:run \
  --goal "测试登录功能：
    1. 在用户名输入框输入 'admin'
    2. 在密码输入框输入 'password123'
    3. 点击登录按钮
    4. 验证成功跳转到首页
    5. 验证显示欢迎消息" \
  --app /path/to/electron/app \
  --model gpt-4o
```

**API 调用**:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试登录功能：1. 在用户名输入框输入 admin 2. 在密码输入框输入 password123 3. 点击登录按钮 4. 验证成功跳转到首页 5. 验证显示欢迎消息",
    "targetAppPath": "/path/to/electron/app",
    "llmModel": "gpt-4o"
  }'
```

**预期结果**:
- 任务状态: `completed`
- 步骤数: 5-10 步
- 最终判定: `pass`

---

### 示例 2: 测试表单验证

**目标**: 验证表单的输入验证功能

**测试目标描述**:
```
测试注册表单验证：
1. 不填写任何字段，点击注册
2. 验证显示所有必填字段的错误提示
3. 输入无效的邮箱格式 'invalid-email'
4. 验证显示邮箱格式错误提示
5. 输入两次不同的密码
6. 验证显示密码不匹配提示
```

**CLI 命令**:
```bash
pnpm agent:run \
  --goal "测试注册表单验证：
    1. 不填写任何字段，点击注册
    2. 验证显示所有必填字段的错误提示
    3. 输入无效的邮箱格式 'invalid-email'
    4. 验证显示邮箱格式错误提示
    5. 输入两次不同的密码
    6. 验证显示密码不匹配提示" \
  --app /path/to/electron/app
```

**API 调用**:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试注册表单验证：1. 不填写任何字段，点击注册 2. 验证显示所有必填字段的错误提示 3. 输入无效的邮箱格式 4. 验证显示邮箱格式错误提示 5. 输入两次不同的密码 6. 验证显示密码不匹配提示",
    "targetAppPath": "/path/to/electron/app"
  }'
```

**预期结果**:
- 任务状态: `completed`
- 步骤数: 8-15 步
- 最终判定: `pass`

---

### 示例 3: 测试文件操作

**目标**: 验证文件保存功能

**测试目标描述**:
```
测试文件保存功能：
1. 点击新建文件按钮
2. 在编辑器中输入 'Hello World'
3. 点击保存按钮
4. 验证显示保存成功提示
5. 验证文件列表中显示新文件
```

**CLI 命令**:
```bash
pnpm agent:run \
  --goal "测试文件保存功能：
    1. 点击新建文件按钮
    2. 在编辑器中输入 'Hello World'
    3. 点击保存按钮
    4. 验证显示保存成功提示
    5. 验证文件列表中显示新文件" \
  --app /path/to/electron/app
```

**API 调用**:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试文件保存功能：1. 点击新建文件按钮 2. 在编辑器中输入 Hello World 3. 点击保存按钮 4. 验证显示保存成功提示 5. 验证文件列表中显示新文件",
    "targetAppPath": "/path/to/electron/app"
  }'
```

**预期结果**:
- 任务状态: `completed`
- 步骤数: 6-12 步
- 最终判定: `pass`

---

### 示例 4: 测试导航功能

**目标**: 验证页面导航功能

**测试目标描述**:
```
测试页面导航：
1. 点击侧边栏的"设置"菜单
2. 验证设置页面正确加载
3. 点击"关于"菜单
4. 验证关于页面显示版本信息
5. 点击返回按钮
6. 验证返回到首页
```

**CLI 命令**:
```bash
pnpm agent:run \
  --goal "测试页面导航：
    1. 点击侧边栏的设置菜单
    2. 验证设置页面正确加载
    3. 点击关于菜单
    4. 验证关于页面显示版本信息
    5. 点击返回按钮
    6. 验证返回到首页" \
  --app /path/to/electron/app
```

**API 调用**:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试页面导航：1. 点击侧边栏的设置菜单 2. 验证设置页面正确加载 3. 点击关于菜单 4. 验证关于页面显示版本信息 5. 点击返回按钮 6. 验证返回到首页",
    "targetAppPath": "/path/to/electron/app"
  }'
```

**预期结果**:
- 任务状态: `completed`
- 步骤数: 8-15 步
- 最终判定: `pass`

---

### 示例 5: 测试错误处理

**目标**: 验证错误场景的处理

**测试目标描述**:
```
测试网络错误处理：
1. 在搜索框输入关键词
2. 点击搜索按钮
3. 验证显示加载状态
4. 验证显示网络错误提示
5. 验证提供重试按钮
```

**CLI 命令**:
```bash
pnpm agent:run \
  --goal "测试网络错误处理：
    1. 在搜索框输入关键词
    2. 点击搜索按钮
    3. 验证显示加载状态
    4. 验证显示网络错误提示
    5. 验证提供重试按钮" \
  --app /path/to/electron/app
```

**API 调用**:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试网络错误处理：1. 在搜索框输入关键词 2. 点击搜索按钮 3. 验证显示加载状态 4. 验证显示网络错误提示 5. 验证提供重试按钮",
    "targetAppPath": "/path/to/electron/app"
  }'
```

**预期结果**:
- 任务状态: `completed`
- 步骤数: 5-10 步
- 最终判定: `pass`

---

## 高级示例

### 示例 6: 多模型 A/B 测试

**目标**: 使用不同模型测试同一功能，比较结果

**步骤**:

1. 使用 GPT-4o 测试:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试登录功能：输入正确的用户名和密码，验证登录成功",
    "targetAppPath": "/path/to/electron/app",
    "llmModel": "gpt-4o",
    "providerId": "openai-default"
  }'
```

2. 使用 DeepSeek 测试:
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试登录功能：输入正确的用户名和密码，验证登录成功",
    "targetAppPath": "/path/to/electron/app",
    "llmModel": "deepseek-chat",
    "providerId": "deepseek-default"
  }'
```

3. 比较结果:
```bash
# 获取任务详情
curl http://localhost:3000/api/tasks/{taskId1}
curl http://localhost:3000/api/tasks/{taskId2}

# 获取报告
curl http://localhost:3000/api/tasks/{taskId1}/report
curl http://localhost:3000/api/tasks/{taskId2}/report
```

**分析指标**:
- 执行时间
- 步骤数量
- 成功率
- 截图质量

---

### 示例 7: 集成到 CI/CD 流程

**目标**: 在 GitHub Actions 中自动运行 Electron 应用测试

**GitHub Actions 配置**:

```yaml
# .github/workflows/test.yml
name: Electron App Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

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

      - name: Build
        run: pnpm build

      - name: Start ElectronHound
        run: |
          pnpm dev &
          sleep 10

      - name: Run tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          pnpm agent:run \
            --goal "验证应用启动正常，主界面元素完整" \
            --app ./path/to/electron/app \
            --model gpt-4o-mini

      - name: Upload test reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: data/reports/
```

---

### 示例 8: 自定义 MCP 工具扩展

**目标**: 创建自定义 MCP 工具扩展 ElectronHound 功能

**步骤**:

1. 创建工具定义:
```typescript
// packages/electron-bridge-mcp/src/tools/my-custom-tool.ts
import type { BridgeClient } from '../bridge-client.js';

export interface MyCustomToolInput {
  param1: string;
  param2?: number;
}

export interface MyCustomToolOutput {
  success: boolean;
  result: unknown;
  error?: string;
}

export interface MyCustomToolContext {
  bridgeClient: BridgeClient | null;
}

export async function myCustomTool(
  input: MyCustomToolInput,
  context: MyCustomToolContext,
): Promise<MyCustomToolOutput> {
  if (!context.bridgeClient || !context.bridgeClient.isConnected()) {
    return {
      success: false,
      result: null,
      error: 'Bridge client not connected',
    };
  }

  try {
    const response = await context.bridgeClient.send({
      type: 'my_custom_operation',
      payload: { param1: input.param1, param2: input.param2 },
    });

    return {
      success: true,
      result: response.payload,
    };
  } catch (err) {
    return {
      success: false,
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

2. 注册工具:
```typescript
// packages/electron-bridge-mcp/src/server.ts
import { myCustomTool } from './tools/my-custom-tool.js';

// 在工具列表中添加
tools.push({
  name: 'my_custom_tool',
  description: 'My custom tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string' },
      param2: { type: 'number' },
    },
    required: ['param1'],
  },
});
```

3. 在 Agent 中使用:
```typescript
// 工具会自动被 Agent 识别和使用
// 只需在测试目标中描述需要使用该工具的操作
```

---

## 最佳实践指南

### 1. 测试目标设计原则

#### 原则 1: 单一职责

每个测试任务只测试一个功能点。

```
# 不好的示例
"测试整个用户管理系统"

# 好的示例
"测试用户登录功能"
"测试用户注册功能"
"测试用户信息修改功能"
```

#### 原则 2: 明确具体

清楚描述每个操作步骤和预期结果。

```
# 不好的示例
"测试表单"

# 好的示例
"测试注册表单：
1. 输入用户名 'testuser'
2. 输入邮箱 'test@example.com'
3. 输入密码 'password123'
4. 点击注册按钮
5. 验证显示注册成功提示"
```

#### 原则 3: 可验证性

确保结果可以自动验证。

```
# 不好的示例
"验证界面美观"

# 好的示例
"验证首页显示以下元素：
1. 导航栏包含'首页'、'关于'、'联系'菜单
2. 主体区域显示欢迎消息
3. 底部显示版权信息"
```

#### 原则 4: 原子性

测试应该相互独立，不依赖其他测试的结果。

```
# 不好的示例
"在上一个测试创建的用户基础上测试修改密码"

# 好的示例
"测试修改密码功能：
1. 使用预置账号登录
2. 进入修改密码页面
3. 输入当前密码和新密码
4. 提交修改
5. 验证修改成功"
```

---

### 2. 测试数据管理

#### 使用预置数据

```bash
# 在测试前准备数据
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试登录功能",
    "targetAppPath": "/path/to/electron/app",
    "contextInjection": "使用测试账号：username=testuser, password=test123"
  }'
```

#### 使用环境变量

```env
# .env 文件
TEST_USERNAME=testuser
TEST_PASSWORD=test123
TEST_EMAIL=test@example.com
```

---

### 3. 错误处理策略

#### 重试机制

```javascript
// 在应用中实现重试逻辑
async function retryOperation(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

#### 超时处理

```bash
# 设置合理的超时时间
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试登录功能",
    "targetAppPath": "/path/to/electron/app",
    "maxSteps": 30
  }'
```

---

### 4. 性能优化技巧

#### 使用快速模型进行开发

```bash
# 开发调试时使用快速模型
pnpm agent:run \
  --goal "测试登录功能" \
  --app /path/to/electron/app \
  --model gpt-4o-mini

# 生产测试时使用高精度模型
pnpm agent:run \
  --goal "测试登录功能" \
  --app /path/to/electron/app \
  --model gpt-4o
```

#### 并行执行测试

```bash
# 同时运行多个测试任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"goal": "测试登录功能", "targetAppPath": "/path/to/app"}' &

curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"goal": "测试注册功能", "targetAppPath": "/path/to/app"}' &
```

#### 限制步数

```bash
# 设置合理的最大步数
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "测试简单功能",
    "targetAppPath": "/path/to/app",
    "maxSteps": 20
  }'
```

---

### 5. 报告分析

#### 查看关键指标

```bash
# 获取报告清单
curl http://localhost:3000/api/tasks/{taskId}/report

# 关注以下指标:
# - totalSteps: 总步骤数
# - passedSteps: 通过步骤数
# - failedSteps: 失败步骤数
# - totalDuration: 总耗时
```

#### 分析失败原因

```bash
# 获取任务详情
curl http://localhost:3000/api/tasks/{taskId}

# 查看失败步骤的:
# - observation: 当时的页面状态
# - action: 执行的操作
# - result: 操作结果
```

#### 查看截图

```bash
# 获取截图
curl http://localhost:3000/api/tasks/{taskId}/steps/{stepIndex}/screenshot

# 查看截图可以了解:
# - 页面状态
# - 操作是否正确执行
# - 卡死时的页面状态
```

---

### 6. 持续集成最佳实践

#### GitHub Actions 配置

```yaml
# .github/workflows/test.yml
name: Electron App Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

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

      - name: Start ElectronHound
        run: |
          pnpm dev &
          sleep 10

      - name: Run smoke tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          pnpm agent:run \
            --goal "验证应用启动正常" \
            --app ./path/to/electron/app \
            --model gpt-4o-mini

      - name: Run full tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          pnpm agent:run \
            --goal "测试核心功能" \
            --app ./path/to/electron/app \
            --model gpt-4o

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: data/reports/
```

#### 测试策略

1. **Smoke Tests**: 快速验证基本功能
   - 模型: gpt-4o-mini
   - 步数: 10-20
   - 覆盖: 核心功能

2. **Full Tests**: 全面测试
   - 模型: gpt-4o
   - 步数: 50-100
   - 覆盖: 所有功能

3. **Regression Tests**: 回归测试
   - 模型: gpt-4o
   - 步数: 30-50
   - 覆盖: 修复的问题

---

### 7. 团队协作

#### 测试目标模板

```markdown
## 测试目标: [功能名称]

### 前置条件
- [条件 1]
- [条件 2]

### 测试步骤
1. [步骤 1]
2. [步骤 2]
3. [步骤 3]

### 预期结果
- [结果 1]
- [结果 2]
- [结果 3]

### 测试数据
- 用户名: [username]
- 密码: [password]
```

#### 代码审查清单

- [ ] 测试目标描述清晰
- [ ] 测试步骤完整
- [ ] 预期结果明确
- [ ] 测试数据准备充分
- [ ] 错误场景覆盖

---

## 常见场景

### 场景 1: 电商应用测试

```bash
# 测试商品搜索
pnpm agent:run \
  --goal "测试商品搜索功能：
    1. 在搜索框输入 '手机'
    2. 点击搜索按钮
    3. 验证显示搜索结果列表
    4. 验证结果包含 '手机' 关键词
    5. 点击第一个商品
    6. 验证商品详情页正确显示" \
  --app /path/to/electron/app

# 测试购物车
pnpm agent:run \
  --goal "测试购物车功能：
    1. 浏览商品列表
    2. 点击第一个商品的 '加入购物车' 按钮
    3. 验证显示添加成功提示
    4. 点击购物车图标
    5. 验证购物车中显示刚添加的商品
    6. 修改数量为 2
    7. 验证价格自动更新" \
  --app /path/to/electron/app
```

### 场景 2: 文档编辑器测试

```bash
# 测试文档编辑
pnpm agent:run \
  --goal "测试文档编辑功能：
    1. 创建新文档
    2. 输入标题 '测试文档'
    3. 输入正文内容
    4. 点击保存按钮
    5. 验证显示保存成功提示
    6. 关闭文档
    7. 重新打开文档
    8. 验证内容正确保存" \
  --app /path/to/electron/app

# 测试格式化功能
pnpm agent:run \
  --goal "测试文本格式化：
    1. 输入文本 'Hello World'
    2. 选中文本
    3. 点击加粗按钮
    4. 验证文本变为粗体
    5. 点击斜体按钮
    6. 验证文本变为斜体
    7. 点击下划线按钮
    8. 验证文本添加下划线" \
  --app /path/to/electron/app
```

### 场景 3: 设置页面测试

```bash
# 测试设置保存
pnpm agent:run \
  --goal "测试设置保存功能：
    1. 打开设置页面
    2. 修改主题为深色模式
    3. 修改语言为英文
    4. 点击保存按钮
    5. 验证显示保存成功提示
    6. 关闭应用
    7. 重新打开应用
    8. 验证设置已保存" \
  --app /path/to/electron/app
```

---

## 下一步

- [用户手册](../user-guide/README.md) - 了解如何使用 ElectronHound
- [API 文档](../api/README.md) - 查看完整 API 文档
- [故障排除](../troubleshooting/README.md) - 遇到问题时的解决方案
- [架构说明](../architecture/README.md) - 了解系统架构
