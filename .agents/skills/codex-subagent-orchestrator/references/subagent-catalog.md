# Codex Subagent Catalog Guide

這份技能不是重複收錄 130+ 個子代理，而是提供**挑選與組合規則**。

## 這個清單怎麼用

1. 先看任務類型。
2. 先選 1 個主子代理。
3. 再選 1 個 reviewer 或 security 類子代理。
4. 有 UI、效能、資料或基礎設施影響時，再加第 3 個。
5. 能並行就並行，不能並行就串行。

## 常見分類

- **Core Development**
  - backend-developer
  - frontend-developer
  - fullstack-developer
  - ui-designer
  - ui-fixer
  - api-designer

- **Language Specialists**
  - vue-expert
  - react-specialist
  - typescript-pro
  - javascript-pro
  - python-pro
  - sql-pro

- **Quality / Security**
  - reviewer
  - security-auditor

- **Infrastructure**
  - cloud-architect
  - microservices-architect

## 建議組合

- **一般功能修正**
  - backend-developer + reviewer

- **前端 UI/UX 修正**
  - frontend-developer + ui-designer + reviewer

- **安全性 / 權限問題**
  - backend-developer + security-auditor + reviewer

- **效能優化**
  - performance-oriented implementer + reviewer

- **跨模組流程重構**
  - fullstack-developer + reviewer + security-auditor

## 落地方式

- 只要某個子代理要長期重用，就把對應 `.toml` 放進 `.codex/agents/`。
- 專案內版本優先於全域版本。
- 需要快取或固定流程時，讓子代理輸出可重複使用的檢查清單，而不是一次性文字建議。

