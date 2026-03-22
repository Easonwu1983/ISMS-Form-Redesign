---
name: codex-subagent-orchestrator
description: 使用 VoltAgent awesome-codex-subagents 子代理清單來挑選、組合、並行執行專門子代理；用於需要拆分工作、建立 project-local `.codex/agents`，或從既有 TOML 子代理快速選型的情境。
---

# Codex 子代理編排器

## 核心原則

- 先分類任務，再選子代理。
- 獨立工作才並行；有依賴就串行。
- 先用最少子代理，常見是 2 到 3 個。
- 需要長期重複使用時，把選定的 `.toml` 複製到 `.codex/agents/`。
- 專案內優先使用 `.codex/agents/`，全域才放 `~/.codex/agents/`。

## 標準流程

1. 判斷任務屬性：實作、稽核、效能、UI、資料、基礎設施、語言框架。
2. 選 1 個主代理負責實作或分析。
3. 再選 1 個檢查代理，通常是 reviewer 或 security-auditor 類型。
4. 若有 UI、效能、架構或資料層差異，再加第 3 個專門代理。
5. 各代理只做自己的範圍，最後由主代理合併結論與修改。

## 選型規則

- 實作類：backend-developer、frontend-developer、fullstack-developer、ui-fixer、ui-designer
- 稽核類：reviewer、security-auditor、code-mapper
- 架構類：api-designer、microservices-architect、cloud-architect
- 語言類：vue-expert、react-specialist、typescript-pro、python-pro、javascript-pro
- 效能類：優先選能直接定位熱路徑與瓶頸的專門代理，再搭 reviewer 驗證

## 何時要拆成多個子代理

- 單一任務同時包含「修改程式、驗證安全、檢查效能」時。
- 需要比對多個模組、又要維持速度時。
- UI/UX、流程、權限、資料一致性同時受影響時。

## 何時不要拆太多

- 只是修一個明確的單點 bug。
- 變更範圍很小，而且一個代理就能安全完成。
- 多代理會互相重複掃描同一段程式，反而拖慢決策。

## 讀取參考文件

- 看 [references/subagent-catalog.md](references/subagent-catalog.md) 取得這個子代理清單的簡化分類與常見組合。
- 需要長期落地某些子代理時，直接把對應 `.toml` 複製到 `.codex/agents/`。
