# 切帳號一分鐘接手版

先看這份，再看 [`docs/boot-checklist.md`](./boot-checklist.md)。

## 你只要知道

- 正式站：`https://isms-campus-portal.pages.dev/`
- 校內站：`http://140.112.3.65:8088/`
- 本機後端：`http://127.0.0.1:18080`
- Pages 版本：`https://isms-campus-portal.pages.dev/deploy-manifest.json`

## 還原順序

1. 看 `docs/boot-checklist.md`
2. 如果 `8088` 不通，先看 `18080`
3. 如果版本不對，先看 `deploy-manifest.json`
4. 如果核准信失敗，先看 `tokenMode`
5. 如果 smoke 偶發 `401`，只重跑那支

