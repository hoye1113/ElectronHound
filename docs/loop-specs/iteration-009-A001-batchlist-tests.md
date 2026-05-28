# [A-001] BatchList 组件测试补充

## 问题

`apps/dashboard/src/components/BatchList.tsx` 当前覆盖率 0%，共 574 行代码。该组件是 Dashboard 的核心批量操作界面，包含：

- 批量任务列表展示
- 批量状态筛选
- 批量取消/删除操作
- 分页加载
- 错误处理和加载状态

## 根因

Dashboard 组件测试历史遗留问题，Wave 1-8 专注于后端和工具链优化，未涉及前端组件测试。

## 修复方案

### 测试文件位置
`apps/dashboard/src/__tests__/BatchList.test.tsx`

### Mock 策略
```typescript
// Mock taskStore
vi.mock('../stores/taskStore', () => ({
  useTaskStore: vi.fn(),
}));

// Mock API
vi.mock('../lib/api', () => ({
  api: {
    batches: {
      list: vi.fn(),
      cancel: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
```

### 测试用例设计

1. **渲染测试**
   - 渲染批量列表
   - 显示空状态
   - 显示加载状态
   - 显示错误状态

2. **筛选测试**
   - 按状态筛选
   - 清除筛选
   - 多条件组合

3. **操作测试**
   - 取消批量
   - 删除批量
   - 确认对话框
   - 操作成功反馈
   - 操作失败处理

4. **分页测试**
   - 加载更多
   - 到底提示
   - 刷新列表

### 验收标准

- [ ] 测试文件创建并通过
- [ ] 覆盖率 >70%
- [ ] 所有用户交互路径覆盖
- [ ] 错误状态正确处理

## 回归风险

**低** — 纯新增测试文件，不修改源代码，不影响现有功能。

## 预计收益

- 覆盖率贡献：+0.5-1%（整体）
- 测试数量：+15-20 个
