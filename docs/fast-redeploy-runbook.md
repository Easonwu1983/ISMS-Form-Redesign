# 切帳號快速接手手冊

先看：

- [`docs/boot-checklist.md`](./boot-checklist.md)
- [`docs/one-minute-handoff.md`](./one-minute-handoff.md)

## 只看三個例外

- `8088` 不通，但 `18080` 正常：重啟 `scripts/start-host-campus-gateway.ps1`
- 核准信失敗：先看 `tokenMode` 是否還是 `app-only`
- 頁面版本不對：先看 `deploy-manifest.json`

