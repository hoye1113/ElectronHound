# Direction D: 开源准备 (Open Source Preparation) Specification

**Version:** 1.0
**Date:** 2026-05-28
**Status:** In Progress

---

## Overview

Direction D prepares ElectronHound for open source release. The goal is to have all necessary files, templates, and configurations for a professional open source project.

---

## Current State

### Existing Assets
- README.md (Chinese, 430 lines)
- CHANGELOG.md
- Dockerfile + docker-compose.yml
- .env.example
- docs/ (full documentation suite)
- CI workflow
- Release workflow
- Example test Electron app

### Missing Assets
- LICENSE (exists in worktree, not on master)
- CONTRIBUTING.md
- SECURITY.md (exists in worktree, not on master)
- CODE_OF_CONDUCT.md (exists in worktree, not on master)
- Issue templates
- PR template
- CODEOWNERS
- Package.json metadata

### Issues Found
- CI targets `main` branch, but default is `master`
- Changeset access is `restricted`, should be `public`
- Package.json missing repository/homepage/bugs/keywords fields

---

## Implementation Plan

### Phase 1: Critical Open Source Files

#### 1.1 Merge Existing Files
The following files already exist in a worktree and can be merged:
- LICENSE (MIT License)
- CODE_OF_CONDUCT.md (Contributor Covenant 2.1)
- SECURITY.md (Vulnerability reporting policy)

#### 1.2 Create CONTRIBUTING.md
**File:** CONTRIBUTING.md

Contents:
- Development environment setup
- Branch naming conventions
- Commit message format (conventional commits)
- PR process and review requirements
- Issue triage guidelines
- Testing requirements
- Code style (ESLint + Prettier)

#### 1.3 Fix CI Branch Target
**File:** .github/workflows/ci.yml

Change:
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```
To:
```yaml
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
```

#### 1.4 Fix Changeset Access
**File:** .changeset/config.json

Change `"access": "restricted"` to `"access": "public"`

### Phase 2: GitHub Templates

#### 2.1 Bug Report Template
**File:** .github/ISSUE_TEMPLATE/bug_report.md

```markdown
---
name: Bug Report
about: Report a bug to help us improve
title: '[Bug] '
labels: bug
assignees: ''
---

## Description
[Clear description of the bug]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- OS: [e.g., Windows 11, macOS 14]
- Node.js version: [e.g., 20.10.0]
- ElectronHound version: [e.g., 0.4.0]
- Electron version: [e.g., 35.0.0]

## Additional Context
[Screenshots, logs, etc.]
```

#### 2.2 Feature Request Template
**File:** .github/ISSUE_TEMPLATE/feature_request.md

```markdown
---
name: Feature Request
about: Suggest a new feature
title: '[Feature] '
labels: enhancement
assignees: ''
---

## Problem Statement
[What problem does this solve?]

## Proposed Solution
[How should it work?]

## Alternatives Considered
[Other approaches you've thought about]

## Additional Context
[Mocks, examples, etc.]
```

#### 2.3 PR Template
**File:** .github/PULL_REQUEST_TEMPLATE.md

```markdown
## Description
[What does this PR do?]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactoring
- [ ] Documentation
- [ ] Test

## Related Issues
Closes #[issue_number]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Tests pass locally
- [ ] New tests added (if applicable)
- [ ] Documentation updated (if applicable)
```

#### 2.4 CODEOWNERS
**File:** .github/CODEOWNERS

```
# Default owner
* @hoye-git

# Server
/apps/server/ @hoye-git

# Dashboard
/apps/dashboard/ @hoye-git

# Packages
/packages/ @hoye-git
```

### Phase 3: Package Configuration

#### 3.1 Enrich Root package.json
Add metadata fields:

```json
{
  "name": "electronhound",
  "version": "0.5.0",
  "private": true,
  "description": "AI-powered testing agent for Electron applications",
  "repository": {
    "type": "git",
    "url": "https://github.com/hoye-git/ElectronHound.git"
  },
  "homepage": "https://github.com/hoye-git/ElectronHound",
  "bugs": {
    "url": "https://github.com/hoye-git/ElectronHound/issues"
  },
  "keywords": [
    "electron",
    "testing",
    "ai",
    "automation",
    "langgraph",
    "mcp"
  ],
  "author": "hoye-git",
  "license": "MIT"
}
```

#### 3.2 Enrich Sub-package package.json
Add similar metadata to:
- apps/server/package.json
- apps/dashboard/package.json
- packages/agent-core/package.json
- packages/shared-types/package.json
- packages/electron-helper/package.json
- packages/electron-bridge-mcp/package.json
- packages/launcher/package.json

### Phase 4: Documentation Enhancements

#### 4.1 Add English README Section
Add English summary at top of README.md:

```markdown
# ElectronHound

> AI-powered testing agent for Electron applications

[English](#english) | [中文](#中文)

---

## English

### Overview
ElectronHound is an AI-powered testing agent that automates testing for Electron applications using LangGraph's Observe-Plan-Execute-Verify loop.

### Features
- Automated UI testing with AI vision
- Multi-provider LLM support (OpenAI, DeepSeek, Qwen, Groq)
- Real-time task monitoring via SSE
- Comprehensive test reports
- Batch testing and templates

### Quick Start
[Installation and usage instructions]

---
```

#### 4.2 Update README Badges
Ensure badges use correct repository URL.

---

## Acceptance Criteria

### Phase 1 Complete When:
- [ ] LICENSE on master branch
- [ ] CONTRIBUTING.md created
- [ ] SECURITY.md on master branch
- [ ] CODE_OF_CONDUCT.md on master branch
- [ ] CI targets master branch
- [ ] Changeset access is public

### Phase 2 Complete When:
- [ ] Bug report template exists
- [ ] Feature request template exists
- [ ] PR template exists
- [ ] CODEOWNERS exists

### Phase 3 Complete When:
- [ ] Root package.json has metadata
- [ ] Sub-packages have metadata

### Phase 4 Complete When:
- [ ] English README section exists
- [ ] Badges use correct URL

---

## Technical Notes

### Branch Naming
- Feature: `feature/description`
- Bug fix: `fix/description`
- Docs: `docs/description`

### Commit Format
```
type(scope): description

[optional body]

[optional footer]
```

Types: feat, fix, docs, style, refactor, test, chore

### PR Process
1. Create branch from master
2. Make changes
3. Run tests locally
4. Create PR with template
5. Wait for CI to pass
6. Request review
7. Merge after approval
