# EATA v0.3 代码审查报告 — 边界问题发现

## 审查范围
- **agent-core nodes**: 6 节点 + graph + runner + state + llm + provider-factory + guards
- **server API layer**: routes/tasks + routes/providers + routes/reports + services/workerManager + services/reportService + streams/sseHub + db/init + db/migrations
- **dashboard**: pages/TaskList + pages/TaskDetail + pages/LiveMonitor + components/ScreenshotGallery + stores/taskStore + lib/api + lib/sse

## 审查结论
**审查深度**: deep  
**关注重点**: security + general  
**总体判断**: 建议修改后合并 — 发现 8 个 Required 安全阻断问题

---

## 修复汇总（已全部完成）

| # | 问题 | 文件 | 修复内容 | 状态 |
|---|------|------|---------|------|
| **R1** | history 数组无限增长 | `state.ts:25-27` | 保留最近 50 步，`slice(-50)` | ✅ |
| **R2** | MCP 结果未验证 | `observe.ts:12-14` | 检查 `success === true`，失败时返回空 | ✅ |
| **R3** | duration 硬编码 0 | `execute.ts:98-108, 118-129` | 使用 `performance.now()` 测量 | ✅ |
| **R4** | callTool 总是成功 | `client.ts:161-169` | 检查 `result.isError` | ✅ |
| **R5** | 路径遍历 | `routes/reports.ts:48-49, 115` | 使用 `validatePath()` + UUID 正则 | ✅ |
| **R6** | JSON.parse 无 catch | `routes/tasks.ts:23-25, 39-42` + `reports.ts:19` | `safeJsonParse()` | ✅ |
| **R7** | Zod .parse() 未捕获 | `routes/providers.ts:32, 40` | `.safeParse()` + 400 | ✅ |
| **R8** | 非原子删除 | `routes/tasks.ts:197-199` | `db.transaction()` | ✅ |
| **R9** | GraphRecursionError | 所有 `invoke()` 调用（8 个文件） | `recursionLimit: 100` | ✅ |
| **R10** | apiKey 允许空字符串 | `routes/providers.ts:16` + `shared-types/provider.ts` | `z.string().min(1)` | ✅ |
| **R11** | 命令注入风险 | `workerManager.ts:62-66` | `sanitizeArg()` 白名单 + 长度限制 | ✅ |
| **R12** | Zod 版本不一致 | `shared-types/provider.ts:2-3` | 统一为 zod v4 | ✅ |
