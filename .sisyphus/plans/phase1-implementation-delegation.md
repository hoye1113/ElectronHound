# Phase 1 执行委托计划

## 🎯 任务目标
实现 EATA 上下文优化的 Phase 1: Token 追踪基础设施

## 📦 核心交付物

### 1. 依赖安装
```bash
pnpm add js-tiktoken --filter @eata/server
```
**理由**: 纯 JS 实现，Windows 友好，避免原生绑定问题

### 2. 核心文件

#### `apps/server/src/context/tokenTracker.ts`
- 功能: 精确计算上下文 token 数
- 关键参数: 20% 安全边距（OpenClaw 实践）
- 阈值检测: 80% / 93% / 95% 压缩触发

#### `apps/server/src/services/modelConfig.ts`
- 功能: 从 OpenCode 或环境变量同步模型配置
- 支持: gpt-4o (128K), deepseek-chat (32K), qwen-plus (32K), groq (131K)
- 预留: 20% reserveTokens

#### `apps/server/src/context/toolResultManager.ts`
- 功能: 管理工具结果边界
- 上限: 50K 字符（Claude Code 实践）
- 策略: head(1500) + tail(1500) 截断

### 3. 测试文件
- `apps/server/src/__tests__/tokenTracker.test.ts`
- `apps/server/src/__tests__/modelConfig.test.ts`
- `apps/server/src/__tests__/toolResultManager.test.ts`

## ✅ 验收标准
- [ ] `pnpm install` 成功
- [ ] 所有单元测试通过
- [ ] `pnpm typecheck` 零错误
- [ ] 服务器正常启动

## 📅 时间估算
- 依赖安装: 1 分钟
- 核心实现: 2-3 小时
- 测试编写: 1-2 小时
- 集成验证: 30 分钟
- **合计: 4-6 小时**
