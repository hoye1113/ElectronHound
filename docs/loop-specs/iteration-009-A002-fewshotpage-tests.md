# [A-002] FewShotPage 组件测试补充

## 问题

`apps/dashboard/src/components/FewShotPage.tsx` 当前覆盖率 0%，共 635 行代码。该组件是 Few-Shot 学习管理页面，包含：

- Few-Shot 模式列表
- 模式创建/编辑/删除
- 示例管理
- 搜索和筛选
- 导入/导出

## 根因

同 A-001，Dashboard 组件测试历史遗留。

## 修复方案

### 测试文件位置
`apps/dashboard/src/__tests__/FewShotPage.test.tsx`

### Mock 策略
```typescript
// Mock API
vi.mock('../lib/api', () => ({
  api: {
    fewShot: {
      list: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
```

### 测试用例设计

1. **渲染测试**
   - 渲染模式列表
   - 显示空状态
   - 显示加载中

2. **CRUD 测试**
   - 创建新模式
   - 编辑模式
   - 删除模式（含确认）
   - 验证必填字段

3. **搜索筛选测试**
   - 按关键词搜索
   - 按类别筛选
   - 清除筛选

4. **示例管理测试**
   - 添加示例
   - 编辑示例
   - 删除示例
   - 示例排序

5. **导入导出测试**
   - 导出 JSON
   - 导入 JSON
   - 导入格式错误处理

### 验收标准

- [ ] 测试文件创建并通过
- [ ] 覆盖率 >70%
- [ ] CRUD 操作全覆盖
- [ ] 边界条件处理验证

## 回归风险

**低** — 纯新增测试文件。

## 预计收益

- 覆盖率贡献：+0.5-1%（整体）
- 测试数量：+20-25 个
