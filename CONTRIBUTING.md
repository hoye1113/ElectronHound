# 贡献指南

感谢您对 ElectronHound 的关注！我们欢迎各种形式的贡献。

## 开发环境

### 前置要求

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Git

### 设置步骤

1. Fork 本仓库
2. 克隆您的 Fork：
   ```bash
   git clone https://github.com/YOUR_USERNAME/ElectronHound.git
   cd ElectronHound
   ```
3. 安装依赖：
   ```bash
   pnpm install
   ```
4. 创建环境配置：
   ```bash
   cp .env.example .env
   ```
5. 启动开发服务器：
   ```bash
   pnpm dev
   ```

## 分支命名

- 功能分支：`feature/描述`
- 修复分支：`fix/描述`
- 文档分支：`docs/描述`
- 测试分支：`test/描述`

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### 类型

- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式（不影响代码运行的变更）
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建过程或辅助工具的变更

### 示例

```
feat(server): add batch testing endpoint
fix(dashboard): resolve task list pagination issue
docs(api): update authentication documentation
```

## Pull Request 流程

1. 从 `master` 分支创建您的分支
2. 进行修改并添加测试
3. 确保所有测试通过：`pnpm test`
4. 确保代码符合规范：`pnpm lint`
5. 提交 PR 并使用 PR 模板
6. 等待 CI 通过
7. 请求代码审查
8. 合并后删除您的分支

## 测试要求

- 新功能必须包含单元测试
- 修复必须包含回归测试
- 确保测试覆盖率不降低
- 运行测试：`pnpm test`
- 运行覆盖率报告：`pnpm test:coverage`

## 代码风格

- 使用 ESLint + Prettier 格式化代码
- 遵循 TypeScript 严格模式
- 使用有意义的变量和函数名
- 添加必要的注释（解释为什么，而不是是什么）

## 问题报告

使用 Issue 模板报告问题或提出功能请求。

## 行为准则

请参阅 [行为准则](CODE_OF_CONDUCT.md)。

## 许可证

贡献即表示您同意您的贡献将在 MIT 许可证下发布。
