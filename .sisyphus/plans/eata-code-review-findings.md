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

## 发现汇总

### Required (8) — 安全阻断项

| # | 文件 | 问题 | 风险 | 状态 |
|---|------|------|------|------|
| 1 | `routes/reports.ts:48-49` | 路径遍历：报告目录未走 validatePath 校验 | 攻击者构造 `id=../../etc` 读任意文件 | ✅ 已修复 |
| 2 | `routes/reports.ts:115` | 截图路径直接 join，缺少 validatePath | 数据库篡改后读 `/etc/passwd` | ⏳ 待修复 |
| 3 | `routes/reports.ts:63`, `tasks.ts:23-25` | JSON.parse 未包裹 try/catch | 损坏 JSON 导致 500 崩溃 | ✅ 已修复 |
| 4 | `routes/providers.ts:32` | Zod .parse() 抛出未捕获异常 | 500 + 信息泄露 | ✅ 已修复 (POST + PUT) |
| 5 | `routes/providers.ts:16` | apiKey 允许空字符串 | LLM API 必然失败 | ⏳ 待修复 |
| 6 | `routes/tasks.ts:197-199` | DELETE 操作非原子性 | 孤儿 steps 记录 | ✅ 已修复 |
| 7 | `services/workerManager.ts:62-66` | 用户输入直接传给 spawn 命令行 | 命令注入风险 | ⏳ 待修复 |
| 8 | `shared-types/provider.ts:2-3` | provider schema 使用 zod v3 而其他用 v4 | 运行时可能类型不兼容 | ⏳ 待修复 |

### Optional (6) — 建议改进项

| # | 文件 | 问题 | 建议 |
|---|------|------|------|
| 9 | `routes/providers.ts:17` | baseURL 缺少 SSRF 防护 | 拒绝 `127.0.0.1`、`169.254.169.254`、`file://` |
| 10 | `routes/tasks.ts:54-58` | GET /tasks 查询参数缺少 Zod 校验 | 添加查询参数 schema |
| 11 | `routes/tasks.ts:141-175` | Cancel 操作未同步通知 TaskQueue | 注入队列引用并通知 |
| 12 | `streams/sseHub.ts:48-66` | SSE 连接无心跳机制 | 定期检查断连并清理 |
| 13 | `services/reportService.ts:68-70` | JSON.parse manifest 无错误处理 | 包裹 try/catch |
| 14 | `db/index.ts:15` | WAL 模式缺少 busy_timeout | 添加 `busy_timeout = 5000ms` |

### FYI — 良好实践确认

| # | 文件 | 确认内容 |
|---|------|----------|
| 15 | `services/fileSecurity.ts:10-42` | validatePath 实现健壮，检查 `..` 段、路径前缀、跨平台分隔符 |
| 16 | `services/htmlReport.ts:122-129` | HTML 转义完整，覆盖 5 种 XSS 关键字符 |
| 17 | `routes/tasks.ts:127-130` | 使用参数化查询，无 SQL 注入 |
| 18 | `routes/providers.ts:76-80` | 使用参数化查询，无 SQL 注入 |

---

## 修复建议优先级

| 优先级 | 问题数 | 建议 |
|--------|--------|------|
| **立即修复** (Required) | 8 | 先修复所有安全阻断项 |
| **本迭代修复** (Optional) | 6 | 在修复 Required 后处理 |
| **后续改进** (FYI) | 4 | 保持现有良好实践 |

---

## 下一步

1. **全部修复** — 自动修复所有 Required + Optional 问题
2. **仅修复 Required** — 先处理 8 个安全阻断项
3. **指定修复** — 告诉我要修复哪些
4. **仅审查** — 不需要修改，审查结束
