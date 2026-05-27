# 常见问题

本文档收集了 ElectronHound 使用过程中的常见问题及解决方案。

## 安装和配置

### Q1: pnpm install 失败怎么办？

**问题**: 执行 `pnpm install` 时出现依赖安装错误。

**解决方案**:

```bash
# 方案 1: 清除缓存后重试
pnpm store prune
pnpm install

# 方案 2: 忽略 peer 依赖检查
pnpm install --no-strict-peer-dependencies

# 方案 3: 删除 node_modules 后重试
rm -rf node_modules
pnpm install
```

### Q2: Electron 下载失败怎么办？

**问题**: 安装过程中 Electron 二进制文件下载失败。

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

### Q3: 如何配置 LLM 供应商？

**问题**: 不知道如何配置 OpenAI 或其他 LLM 供应商。

**解决方案**:

1. **通过 Dashboard 配置** (推荐):
   - 访问 http://localhost:5173/settings
   - 点击 "+ 添加供应商"
   - 选择供应商模板
   - 输入 API Key
   - 点击 "添加"

2. **通过环境变量配置**:
   ```env
   OPENAI_API_KEY=your_api_key_here
   OPENAI_BASE_URL=https://api.openai.com/v1
   LLM_MODEL=gpt-4o
   ```

### Q4: 端口被占用怎么办？

**问题**: 启动服务时提示端口已被占用。

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

## 使用问题

### Q5: 任务创建后一直显示 pending 状态？

**问题**: 创建任务后，状态一直是 pending，没有开始执行。

**解决方案**:

1. **检查 LLM 配置**:
   - 确保已配置有效的 LLM 供应商
   - 测试供应商连接是否正常

2. **检查 Worker 状态**:
   ```bash
   # 查看服务器日志
   docker-compose logs -f server
   ```

3. **检查应用路径**:
   - 确保 Electron 应用路径正确
   - 确保应用可以正常启动

### Q6: 任务执行失败怎么办？

**问题**: 任务执行过程中失败。

**解决方案**:

1. **查看错误日志**:
   - 在 Dashboard 查看任务详情
   - 查看失败步骤的截图和日志

2. **常见失败原因**:
   - LLM API 调用失败（检查 API Key 和配额）
   - Electron 应用崩溃（检查应用稳定性）
   - 超时（增加超时时间配置）

3. **重试任务**:
   - 点击任务详情页的"重试"按钮
   - 或者创建新任务

### Q7: 如何提高测试准确性？

**问题**: 测试结果不够准确，AI 没有正确理解测试目标。

**解决方案**:

1. **优化测试目标描述**:
   - 使用更具体的描述
   - 包含明确的预期结果
   - 分步骤描述测试流程

2. **示例对比**:
   ```
   # 不好的描述
   "测试登录功能"

   # 好的描述
   "测试登录功能：
   1. 在用户名输入框输入 'admin'
   2. 在密码输入框输入 'password123'
   3. 点击登录按钮
   4. 验证页面跳转到首页
   5. 验证显示欢迎消息"
   ```

3. **使用更好的模型**:
   - 尝试使用 GPT-4o 而不是 GPT-4o-mini
   - 或者使用 DeepSeek 等其他模型

### Q8: 截图不清晰或缺失怎么办？

**问题**: 测试报告中的截图质量差或缺失。

**解决方案**:

1. **检查应用窗口**:
   - 确保 Electron 应用窗口没有被最小化
   - 确保窗口在前台

2. **调整分辨率**:
   - 在配置中增加截图分辨率
   - 确保显示器分辨率足够高

3. **检查权限**:
   - 确保应用有屏幕录制权限（macOS）
   - 确保没有其他应用遮挡

### Q9: 如何取消正在执行的任务？

**问题**: 需要停止正在执行的任务。

**解决方案**:

1. **通过 Dashboard**:
   - 进入任务详情页
   - 点击"取消"按钮

2. **通过 API**:
   ```bash
   curl -X POST http://localhost:3000/api/tasks/{taskId}/cancel
   ```

3. **强制停止**:
   - 如果任务无法正常取消，可以重启服务
   ```bash
   docker-compose restart
   ```

### Q10: 如何查看详细的执行日志？

**问题**: 需要查看更详细的执行日志进行调试。

**解决方案**:

1. **修改日志级别**:
   ```env
   LOG_LEVEL=debug
   ```

2. **查看服务器日志**:
   ```bash
   # Docker 环境
   docker-compose logs -f server

   # 本地环境
   # 日志会输出到控制台
   ```

3. **查看任务详情**:
   - 在 Dashboard 查看每个步骤的详细信息
   - 查看无障碍树快照

## 性能问题

### Q11: 测试执行很慢怎么办？

**问题**: 测试任务执行时间过长。

**解决方案**:

1. **优化测试目标**:
   - 减少测试步骤数量
   - 简化测试场景

2. **调整配置**:
   ```json
   {
     "agent": {
       "maxSteps": 30,
       "stuckThreshold": 2
     }
   }
   ```

3. **使用更快的模型**:
   - GPT-4o-mini 比 GPT-4o 更快
   - DeepSeek 通常响应更快

4. **增加 Worker 数量**:
   ```json
   {
     "worker": {
       "maxWorkers": 5
     }
   }
   ```

### Q12: 内存占用过高怎么办？

**问题**: 服务运行时内存占用过高。

**解决方案**:

1. **限制 Worker 数量**:
   ```json
   {
     "worker": {
       "maxWorkers": 2
     }
   }
   ```

2. **增加 Node.js 内存限制**:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" pnpm dev
   ```

3. **定期清理数据**:
   ```bash
   # 清理旧报告
   rm -rf data/reports/*

   # 清理检查点
   rm -rf data/agent-checkpoints.sqlite3
   ```

## 集成问题

### Q13: 如何集成到 CI/CD 流程？

**问题**: 需要将 ElectronHound 集成到持续集成流程。

**解决方案**:

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

      - name: Run tests
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

### Q14: 如何在 Docker 中测试 Electron 应用？

**问题**: 需要在 Docker 容器中运行 Electron 应用测试。

**解决方案**:

```dockerfile
# Dockerfile
FROM node:20-slim

# 安装 Electron 依赖
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libnotify-dev \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# 安装 pnpm
RUN npm install -g pnpm@9

# 复制项目
WORKDIR /app
COPY . .

# 安装依赖
RUN pnpm install

# 使用 xvfb 运行
CMD ["xvfb-run", "pnpm", "dev"]
```

### Q15: 如何自定义 MCP 工具？

**问题**: 需要扩展 ElectronHound 的 MCP 工具。

**解决方案**:

1. **查看现有工具**:
   ```bash
   ls packages/electron-bridge-mcp/src/tools/
   ```

2. **创建新工具**:
   ```typescript
   // packages/electron-bridge-mcp/src/tools/my-tool.ts
   import { Tool } from '@modelcontextprotocol/sdk/types.js';

   export const myTool: Tool = {
     name: 'my_tool',
     description: 'My custom tool',
     inputSchema: {
       type: 'object',
       properties: {
         param1: { type: 'string' },
       },
       required: ['param1'],
     },
   };

   export async function executeMyTool(param1: string) {
     // 实现工具逻辑
   }
   ```

3. **注册工具**:
   ```typescript
   // packages/electron-bridge-mcp/src/index.ts
   import { myTool, executeMyTool } from './tools/my-tool';

   // 添加到工具列表
   tools.push(myTool);
   ```

## 其他问题

### Q16: 如何贡献代码？

**问题**: 想要为 ElectronHound 贡献代码。

**解决方案**:

1. **Fork 仓库**
2. **创建特性分支**:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **提交更改**:
   ```bash
   git commit -m 'feat: add amazing feature'
   ```
4. **推送分支**:
   ```bash
   git push origin feature/amazing-feature
   ```
5. **创建 Pull Request**

### Q17: 如何报告 Bug？

**问题**: 发现了 Bug，想要报告。

**解决方案**:

1. **访问 Issues 页面**: https://github.com/hoye-git/ElectronHound/issues
2. **点击 "New Issue"**
3. **选择 Bug Report 模板**
4. **填写详细信息**:
   - 问题描述
   - 复现步骤
   - 预期行为
   - 实际行为
   - 环境信息
   - 日志/截图

### Q18: 如何获取帮助？

**问题**: 遇到问题需要帮助。

**解决方案**:

1. **查看文档**: 阅读完整的文档
2. **搜索 Issues**: 查看是否有类似问题
3. **创建 Issue**: 描述你的问题
4. **社区讨论**: 参与 GitHub Discussions

## 下一步

- [故障排除](../troubleshooting/README.md) - 查看详细故障排除指南
- [API 文档](../api/README.md) - 查看完整 API 文档
- [架构说明](../architecture/README.md) - 了解系统架构