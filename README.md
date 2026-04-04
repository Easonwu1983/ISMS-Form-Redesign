# ISMS 資訊安全管理系統

國立臺灣大學資訊安全管理系統（Information Security Management System），涵蓋全校 163 個一級單位、667 個二級單位的內部稽核管考作業。

## 功能模組

| 模組 | 說明 |
|------|------|
| 儀表板 | 年度稽核進度總覽、待辦事項、統計卡片 |
| 內稽檢核表 | 41 題 x 9 大類，填報/暫存/送出 |
| 資安教育訓練統計 | 填報/匯入/名單管理 |
| 矯正單 | 開立/回覆/審核/追蹤/結案 |
| 資訊資產盤點 | 資產清冊/附表十/風險評鑑/年度比對 |
| 帳號管理 | 使用者/角色/授權範圍 |
| 單位管理人申請 | 線上申請/審核/啟用 |

## 技術架構

```
瀏覽器 → Caddy (80/443) → Node.js (8787) → PostgreSQL
```

- **前端**：Pure JS SPA + esbuild 打包（core bundle + 6 feature bundles）
- **後端**：Node.js 22 LTS + PostgreSQL 16
- **部署**：Ubuntu 24.04 VM（140.112.97.150）、systemd 管理
- **郵件**：Microsoft Graph Mail API

## 快速開始

```bash
npm ci                    # 安裝依賴
npm run build             # 建置前端
npm run preview:start     # 本機預覽
```

## 測試

```bash
npm run test:ci                              # CI gate（含 E2E）
node tests/e2e-core-flows.cjs               # 6 個核心流程 E2E
node tests/comprehensive-test-suite.cjs     # 72+ 項綜合測試
```

## 部署

```bash
git push origin main
# SSH 進 VM
sudo -u ismsbackend bash -c 'cd /srv/isms-form-redesign && git pull origin main'
sudo systemctl restart isms-unit-contact-backend.service
```

## 文件

| 文件 | 說明 |
|------|------|
| `docs/ISMS-操作手冊.docx` | 使用者操作手冊（7 章） |
| `docs/ISMS-系統現況文件.docx` | 系統架構/部署/DB/安全/測試 |
| `docs/start-here.md` | 新接手指引 |
| `docs/boot-checklist.md` | 開機檢查清單 |
| `docs/release-and-rollback.md` | 上版與回滾流程 |
| `docs/production-topology.md` | 正式環境拓撲 |

## 專案結構

```
├── m365/campus-backend/    # 後端 API（18 個 .cjs 模組）
├── css/                    # 模組化 CSS（checklist, training, responsive）
├── feature-bundles/        # 延遲載入的前端模組
├── tests/                  # E2E + 綜合測試套件
├── scripts/                # 建置/部署/smoke 腳本
├── docs/                   # 操作手冊 + 系統文件
└── types/                  # TypeScript 型別定義
```
