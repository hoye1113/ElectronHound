# CI/CD 故障排除指南

> 记录 ElectronHound 项目 CI/CD 配置中遇到的问题和解决方案，避免重复踩坑。

---

## 问题清单

### 1. pnpm-lock.yaml 不同步

**错误信息：**
```
ERR_PNPM_OUTDATED_LOCKFILE Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date
```

**原因：** 修改了 `package.json`（添加/删除/升级依赖）但没有运行 `pnpm install` 更新 lockfile。

**解决方案：**
```bash
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: update pnpm-lock.yaml"
```

**预防措施：**
- 修改 `package.json` 后立即运行 `pnpm install`
- 在 commit 前检查 `git status` 确认 lockfile 已更新
- CI 使用 `--frozen-lockfile` 是正确的，确保本地 lockfile 与远程一致

---

### 2. GitHub Actions commit SHA 错误

**错误信息：**
```
Error: Unable to resolve action `pnpm/action-setup@fe02b34f...`, unable to find version
```

**原因：** 使用了错误的 commit SHA 来锁定 GitHub Actions 版本。

**解决方案：** 使用 GitHub API 获取正确的 SHA：
```bash
curl -s https://api.github.com/repos/pnpm/action-setup/git/refs/tags/v4.0.0 | grep sha
curl -s https://api.github.com/repos/codecov/codecov-action/git/refs/tags/v4.6.0 | grep sha
```

**预防措施：**
- 使用 `git ls-remote` 或 GitHub API 验证 SHA
- 记录 SHA 时附带版本注释：`# v4.0.0`
- 可以使用 Dependabot 自动更新 Action 版本

---

### 3. TypeScript 类型声明缺失

**错误信息：**
```
error TS7016: Could not find a declaration file for module 'pdfkit'
```

**原因：** 使用的 npm 包没有自带 TypeScript 类型声明。

**解决方案：**
```bash
pnpm add -D @types/<package-name>
```

**预防措施：**
- 安装新依赖时检查是否有 `@types/` 包
- 在 `tsconfig.json` 中设置 `"skipLibCheck": true` 可以跳过第三方库类型检查
- 优先选择自带类型的包（如 `zod`、`fastify`）

---

### 4. `.gitignore` 误忽略文件

**错误信息：**
```
Error: ENOENT: no such file or directory, open 'main.js'
```

**原因：** `.gitignore` 中的 `*.js` 规则忽略了需要提交的 JavaScript 文件。

**解决方案：** 在 `.gitignore` 中添加例外：
```gitignore
# TypeScript compilation output
*.js
*.js.map

# Exception: fixture JS files (not compiled)
!fixtures/self-test-electron-app/main.js
!fixtures/self-test-electron-app/preload.js
```

**预防措施：**
- 使用 `git status` 检查哪些文件被忽略
- 使用 `git check-ignore -v <file>` 诊断忽略规则
- 对于需要提交的文件，使用 `!` 前缀添加例外

---

### 5. 跨平台路径分隔符问题

**错误信息：**
```
PathTraversalError: Path traversal detected: task-789\screenshots\step.png
```

**原因：** Windows 使用 `\` 作为路径分隔符，Linux 使用 `/`。`path.resolve()` 在 Linux 上不会转换 `\`。

**解决方案：** 在处理路径前标准化分隔符：
```typescript
const normalizedTarget = targetPath.replace(/\\/g, '/');
const resolved = resolve(baseDir, normalizedTarget);
```

**预防措施：**
- 始终使用 `path.join()` 和 `path.resolve()` 而非手动拼接
- 处理用户输入的路径时，先标准化分隔符
- 测试时考虑跨平台场景

---

### 6. Ubuntu 包名变更

**错误信息：**
```
E: Package 'libasound2' has no installation candidate
E: Unable to locate package libgconf-2-4
```

**原因：** Ubuntu 24.04 重命名或弃用了某些包。

**解决方案：**
```yaml
# Ubuntu 24.04+
sudo apt-get install -y \
  libasound2t64 \  # 替代 libasound2
  # 移除 libgconf-2-4（已弃用）
```

**预防措施：**
- 使用 `ubuntu-22.04` 固定版本而非 `ubuntu-latest`
- 或在 CI 中检查 Ubuntu 版本并安装对应包
- 参考 Electron 官方文档的 Linux 依赖列表

---

### 7. 文件权限测试在 CI 中失败

**错误信息：**
```
AssertionError: expected 420 to be 384
```

**原因：** CI 环境的 umask 影响文件权限。`writeFileSync` 的 `mode` 参数会与 umask 进行 AND 运算。

**解决方案：** 检查权限位而非精确值：
```typescript
// 错误：精确检查
expect(mode & 0o777).toBe(0o600);

// 正确：检查关键权限位
expect(mode & 0o600).toBe(0o600);  // 所有者有读写
expect(mode & 0o022).toBe(0);       // 组/其他没有写权限
```

**预防措施：**
- 理解 umask 如何影响文件权限
- 测试时检查权限类别而非精确值
- 在 CI 中设置已知的 umask：`umask 0022`

---

### 8. Electron 沙箱问题

**错误信息：**
```
The SUID sandbox helper binary was found, but is not configured correctly
```

**原因：** CI 环境没有配置 Electron 的沙箱权限。

**解决方案：** 在 CI 中添加 `--no-sandbox` 标志：
```typescript
spawn(electron, ['app.js', '--no-sandbox']);
```

**预防措施：**
- 在 CI 环境中始终使用 `--no-sandbox`
- 或使用 `xvfb-run` 提供虚拟显示环境
- 在 GitHub Actions 中设置 `DISPLAY` 环境变量

---

### 9. 缺少显示服务器

**错误信息：**
```
Missing X server or $DISPLAY
The platform failed to initialize. Exiting.
```

**原因：** Electron 需要显示服务器（X11/Wayland）才能运行。

**解决方案：** 检查显示服务器可用性：
```typescript
if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.warn('No display server — skipping');
  return;
}
```

**预防措施：**
- 在 CI 中使用 `xvfb-run` 运行 Electron 测试
- 设置 `DISPLAY=:99` 环境变量
- 安装 xvfb：`sudo apt-get install -y xvfb`

---

### 10. `import.meta.dirname` 不可用

**错误信息：**
```
TypeError: Cannot read properties of undefined (reading 'dirname')
```

**原因：** `import.meta.dirname` 在某些 Node.js 版本或 ESM 环境中不可用。

**解决方案：** 使用 `fileURLToPath`：
```typescript
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

**预防措施：**
- 使用 `fileURLToPath` 作为 ESM 兼容的目录解析方式
- 避免直接使用 `import.meta.dirname`
- 在 TypeScript 中配置 `"module": "NodeNext"`

---

### 11. Node.js 20 弃用警告

**错误信息：**
```
Node.js 20 actions are deprecated. Actions will be forced to run with Node.js 24 by default starting June 16th, 2026.
```

**原因：** GitHub Actions 将在 2026 年 9 月移除 Node.js 20 支持。

**解决方案：** 更新到 Node.js 22 (LTS)：
```yaml
- name: Setup Node.js
  uses: actions/setup-node@<sha>  # v4.0.3
  with:
    node-version: '22'  # 使用 LTS 版本
```

**预防措施：**
- 使用 Node.js LTS 版本（当前是 22）
- 关注 GitHub changelog 了解弃用时间表
- 设置 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 提前测试

---

### 12. npm 发布认证失败

**错误信息：**
```
ENEEDAUTH This command requires you to be logged in to https://registry.npmjs.org
```

**原因：** `NPM_TOKEN` secret 未配置或已过期。

**解决方案：** 如果不需要发布到 npm，在 workflow 中移除发布步骤：
```yaml
# 移除整个 release job 或跳过 npm publish
# 只保留 Windows 打包
```

**预防措施：**
- 明确是否需要发布到 npm
- 如果不需要，移除 changesets 和 npm 发布配置
- 如果需要，在 GitHub Secrets 中配置 `NPM_TOKEN`

---

### 13. electron-builder 找不到图标

**错误信息：**
```
cannot find specified resource "favicon.ico", nor relative to "build", neither relative to project dir
```

**原因：** `electron-builder.yml` 中配置的图标文件不存在。

**解决方案：** 移除图标配置或提供正确的图标文件：
```yaml
# 方案 1: 移除图标配置（使用默认图标）
win:
  target:
    - target: nsis
# 不配置 icon 字段

# 方案 2: 提供图标文件
# 将 favicon.svg 转换为 favicon.ico (256x256)
# 放在 apps/dashboard/public/favicon.ico
```

**预防措施：**
- 确保图标文件存在于配置的路径
- 使用相对路径时，相对于项目根目录
- 测试 electron-builder 配置前先检查文件是否存在

---

### 14. GitHub Actions 名称拼写错误

**错误信息：**
```
Unable to resolve action `softprops/action-ghrelease@v2`
```

**原因：** GitHub Action 名称拼写错误（`action-ghrelease` vs `action-gh-release`）。

**解决方案：** 使用正确的 action 名称并锁定 SHA：
```yaml
# 错误
uses: softprops/action-ghrelease@v2

# 正确
uses: softprops/action-gh-release@3bb12739c298aeb8a4eeaf626c5b8d85266b0e65  # v2
```

**预防措施：**
- 使用 `git ls-remote` 验证 action 存在
- 从 GitHub Marketplace 复制正确的 action 名称
- 锁定到 commit SHA 而非 tag

---

### 15. secrets 不能在 job 级别 if 条件中使用

**错误信息：**
```
Unrecognized named-value: 'secrets'
```

**原因：** GitHub Actions 不允许在 job 级别的 `if` 条件中访问 secrets。

**解决方案：** 在 step 级别检查 secret：
```yaml
jobs:
  release:
    steps:
      - name: Check for token
        id: check-token
        run: |
          if [ -n "$TOKEN" ]; then
            echo "has_token=true" >> $GITHUB_OUTPUT
          fi
        env:
          TOKEN: ${{ secrets.MY_TOKEN }}

      - name: Do something
        if: steps.check-token.outputs.has_token == 'true'
        run: echo "Token is available"
```

**预防措施：**
- 不要在 job 级别的 `if` 中使用 `secrets.*`
- 使用 step 级别检查并输出结果
- 或使用 `vars.*` 替代（repository variables 可以在 job 级别使用）

---

## CI 配置检查清单

在提交 CI 配置变更前，检查以下项目：

- [ ] `pnpm-lock.yaml` 与 `package.json` 同步
- [ ] GitHub Actions SHA 正确且附带版本注释
- [ ] 所有 TypeScript 依赖有类型声明
- [ ] `.gitignore` 不会误忽略必要文件
- [ ] 路径处理考虑跨平台兼容性
- [ ] Ubuntu 包名适用于目标版本
- [ ] 文件权限测试检查关键位而非精确值
- [ ] Electron 测试使用 `--no-sandbox` 和 xvfb
- [ ] ESM 兼容的目录解析方式
- [ ] 依赖安装后更新 lockfile
- [ ] 使用 Node.js LTS 版本（当前 v22）
- [ ] 明确是否需要 npm 发布，不需要则移除
- [ ] electron-builder 图标文件存在
- [ ] GitHub Action 名称拼写正确
- [ ] 不在 job 级别 if 中使用 secrets

---

## 常用调试命令

```bash
# 检查哪些文件被 git 忽略
git status --ignored

# 诊断 gitignore 规则
git check-ignore -v <file>

# 获取 GitHub Action 的 commit SHA
git ls-remote https://github.com/<owner>/<repo>.git refs/tags/<tag>

# 检查 pnpm 依赖树
pnpm list --depth=0

# 本地模拟 CI 环境
act -j build-and-test

# 检查 TypeScript 类型错误
pnpm -r run typecheck

# 运行特定测试
pnpm test -- --reporter=verbose <test-file>
```

---

*最后更新：2026-06-01*
