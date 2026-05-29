# [A-005] ReportView 组件测试补充

## 问题

`apps/dashboard/src/pages/ReportView.tsx` 当前覆盖率 0%，共 264 行代码。该组件是报告查看页面，包含：

- 报告详情展示
- 截图画廊
- 测试步骤时间线
- 导出功能

## 根因

同 A-001，Dashboard 组件测试历史遗留。

## 修复方案

### 测试文件位置
`apps/dashboard/src/__tests__/ReportView.test.tsx`

### Mock 策略
```typescript
vi.mock('../lib/api', () => ({
  api: {
    reports: {
      get: vi.fn(),
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'report-1' }),
}));
```

### 测试用例设计

1. **渲染测试**
   - 渲染报告详情
   - 显示加载中
   - 显示错误状态

2. **数据展示测试**
   - 测试步骤列表
   - 截图画廊
   - 时间戳显示

3. **交互测试**
   - 截图画廊导航
   - 步骤展开/折叠

4. **导出测试**
   - 导出按钮显示
   - 导出功能调用

### 验收标准

- [ ] 测试文件创建并通过
- [ ] 覆盖率 >70%
- [ ] 报告展示路径覆盖
- [ ] 交互功能验证

## 回归风险

**低** — 纯新增测试文件。
