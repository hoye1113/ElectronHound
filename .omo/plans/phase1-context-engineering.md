# Phase 1+2: Token Tracking + Compression Engine（实施计划）

## Plan Summary
上下文优化层实施计划（对应原 8 阶段计划的第 1-2 阶段）。核心目标：精确追踪上下文 token 数，为后续压缩策略提供数据基础。

---

## 📋 任务分解（原子单元）

### Phase 1: Token 追踪基础设施（3 天）

#### Day 1: 依赖 + 基础设施搭建
1. **[Task 1.1]** 添加 `js-tiktoken` 依赖到 `apps/server/package.json`
   - 文件: `apps/server/package.json`
   - 操作: 在 dependencies 添加 `"js-tiktoken": "^1.0.15"`
   - 验证: `pnpm install` 成功

2. **[Task 1.2]** 创建 `apps/server/src/context/` 目录结构
   - 文件: `apps/server/src/context/types.ts`（压缩级别类型定义）
   - 验证: 目录存在

3. **[Task 1.3]** 实现 `apps/server/src/services/modelConfig.ts`
   - 从 OpenCode 配置或环境变量读取模型 contextWindow
   - 支持 gpt-4o (128K), deepseek-chat (32K), qwen-plus (32K), groq (131K)
   - 预留 20% reserve
   - 验证: 环境变量覆盖 + 默认值测试

4. **[Task 1.4]** 实现 `apps/server/src/context/tokenTracker.ts`
   - 使用 js-tiktoken 精确计算 token
   - 20% 安全边距（OpenClaw 实践）
   - checkThreshold() 返回四级压缩触发 ('collapse' | 'auto-compact' | 'compact' | 'none')
   - 验证: 单元测试覆盖

#### Day 2: 工具结果管理（Phase 2 部分）
5. **[Task 2.1]** 实现 `apps/server/src/context/toolResultManager.ts`
   - 单工具结果上限 50K 字符
   - head(1500) + tail(1500) 截断策略
   - 聚合预算：工具结果占上下文 30% 上限
   - 验证: 单元测试覆盖

#### Day 3: 集成测试
6. **[Task 3.1]** 创建测试文件 `apps/server/src/__tests__/context/tokenTracker.test.ts`
   - 测试 token 估算精度
   - 测试阈值检测（80% / 93% / 95%）
   - 测试安全边距
   - 验证: `pnpm test` 通过

7. **[Task 3.2]** 创建测试文件 `apps/server/src/__tests__/context/modelConfig.test.ts`
   - 测试默认值 fallback
   - 测试环境变量覆盖
   - 验证: `pnpm test` 通过

8. **[Task 3.3]** 集成到 agent-core（可选，Day 3 做）
   - 在 graph.ts 中暴露 tokenTracker 接口
   - 验证: `pnpm typecheck` 通过

---

## 🗂️ 关键文件清单

| 序号 | 文件路径 | 操作 | 类型 |
|------|----------|------|------|
| 1 | `apps/server/package.json` | 修改 | 配置 |
| 2 | `apps/server/src/context/types.ts` | 创建 | 类型定义 |
| 3 | `apps/server/src/context/tokenTracker.ts` | 创建 | 核心模块 |
| 4 | `apps/server/src/context/toolResultManager.ts` | 创建 | 核心模块 |
| 5 | `apps/server/src/services/modelConfig.ts` | 创建 | 服务模块 |
| 6 | `apps/server/src/__tests__/context/tokenTracker.test.ts` | 创建 | 单元测试 |
| 7 | `apps/server/src/__tests__/context/modelConfig.test.ts` | 创建 | 单元测试 |
| 8 | `apps/server/src/__tests__/context/toolResultManager.test.ts` | 创建 | 单元测试 |

**总计：8 个文件**（5 个新增 + 1 个修改 + 3 个测试）

---

## ⚠️ 边界条件与约束

1. **不修改 `@eata/agent-core`**：tokenTracker 仅在 server 层实现
2. **不修改 LangGraph 图**：仅在 server 层暴露接口
3. **js-tiktoken 选择原因**：纯 JS 实现，Windows 无原生绑定问题
4. **20% 安全边距**：OpenClaw 实证数据（已实测验证）

---

## ✅ 验收标准

- [x] `pnpm test` 通过（新增 3 个测试文件）
- [x] `pnpm typecheck` 通过
- [x] `app-server` 启动成功（无崩溃）
- [x] TokenTracer 测试覆盖：
  - [x] 80% threshold
  - [x] 93% threshold
  - [x] 95% threshold
  - [x] Safety margin (20%)

---

## 📅 时间估算

- Day 1: 基础设施（Tasks 1.1-1.4）
- Day 2: 工具结果管理（Tasks 2.1）
- Day 3: 测试 + 集成（Tasks 3.1-3.3）

**合计：3 天**
