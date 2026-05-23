# 修复 i18n 冒号缺失

## TL;DR

> **Quick Summary**: 修复 Code Review 中发现的 Settings.tsx 标签冒号丢失问题，在 4 个翻译键值中添加冒号
> **预计时间**: 5 分钟
> **修改文件**: 2 个 (en.json, zh.json)

---

## 问题描述

Code Review 发现 Settings.tsx 中 3 处标签使用 i18n 后丢失了冒号：

- `Model:` → `Model` (缺少冒号)
- `Base URL:` → `Base URL` (缺少冒号)
- `API Key:` → `API Key` (缺少冒号)

此外 `taskDetail.modelLabel` 也需要同步修复。

---

## 修复内容

### en.json 修改

| 位置 | 当前值 | 修复后 |
|------|--------|--------|
| settings.modelLabel (行 173) | `"Model"` | `"Model:"` |
| settings.baseUrlLabel (行 171) | `"Base URL"` | `"Base URL:"` |
| settings.apiKeyLabel (行 175) | `"API Key"` | `"API Key:"` |
| taskDetail.modelLabel (行 115) | `"LLM Model"` | `"LLM Model:"` |

### zh.json 修改

| 位置 | 当前值 | 修复后 |
|------|--------|--------|
| settings.modelLabel (行 173) | `"模型"` | `"模型："` |
| settings.baseUrlLabel (行 171) | `"基础 URL"` | `"基础 URL："` |
| settings.apiKeyLabel (行 175) | `"API 密钥"` | `"API 密钥："` |
| taskDetail.modelLabel (行 115) | `"LLM 模型"` | `"LLM 模型："` |

---

## Acceptance Criteria

- [x] en.json 4 处翻译值添加冒号
- [x] zh.json 4 处翻译值添加中文冒号
- [x] `pnpm test` → PASS (1205+ 通过，0 失败) ✅
- [x] Settings.tsx 页面显示恢复正常的 `Model:` / `Base URL:` / `API Key:` 格式

---

## Files Changed

- `apps/dashboard/src/i18n/en.json` — 4 处修改
- `apps/dashboard/src/i18n/zh.json` — 4 处修改

---

## Commit Message

`fix(i18n): add missing colons to Settings labels`
