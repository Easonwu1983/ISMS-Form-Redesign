# `docs/` 三類整理

目的：之後切帳號或裁切文件時，先看這份，不要重新掃整個 `docs/`。

## 1. 保留

這些是每次接手、啟動、部署、回滾、治理時最常用的文件。

- [`boot-checklist.md`](./boot-checklist.md)
- [`handoff-index.md`](./handoff-index.md)
- [`one-minute-handoff.md`](./one-minute-handoff.md)
- [`fast-redeploy-runbook.md`](./fast-redeploy-runbook.md)
- [`project-execution-flow.md`](./project-execution-flow.md)
- [`release-and-rollback.md`](./release-and-rollback.md)
- [`data-layer-governance.md`](./data-layer-governance.md)
- [`module-architecture.md`](./module-architecture.md)
- [`reusable-m365-cloudflare-project-bootstrap.md`](./reusable-m365-cloudflare-project-bootstrap.md)
- [`system-operation-manual.md`](./system-operation-manual.md)

## 2. 備援

這些文件不是每次都看，但在特定模組、部署或維運時仍有價值。

- [`azure-minimal-go-live.md`](./azure-minimal-go-live.md)
- [`browser-m365-live-migration.md`](./browser-m365-live-migration.md)
- [`campus-https-firewall-request.md`](./campus-https-firewall-request.md)
- [`campus-production-deployment-checklist.md`](./campus-production-deployment-checklist.md)
- [`cloudflare-minimal-go-live.md`](./cloudflare-minimal-go-live.md)
- [`cloudflare-pages-and-tunnel-runbook.md`](./cloudflare-pages-and-tunnel-runbook.md)
- [`google-minimal-go-live.md`](./google-minimal-go-live.md)
- [`homepage-https-backend-plan.md`](./homepage-https-backend-plan.md)
- [`homepage-https-cutover-runbook.md`](./homepage-https-cutover-runbook.md)
- [`homepage-ntu-deploy.md`](./homepage-ntu-deploy.md)
- [`m365-a3-campus-backend.md`](./m365-a3-campus-backend.md)
- [`m365-a3-implementation-worksheet.md`](./m365-a3-implementation-worksheet.md)
- [`m365-a3-site-owner-fallback.md`](./m365-a3-site-owner-fallback.md)
- [`m365-a3-site-owner-request-template.md`](./m365-a3-site-owner-request-template.md)
- [`m365-a3-unit-contact-blueprint.md`](./m365-a3-unit-contact-blueprint.md)
- [`m365-attachment-api-contract.md`](./m365-attachment-api-contract.md)
- [`m365-auth-api-contract.md`](./m365-auth-api-contract.md)
- [`m365-checklist-api-contract.md`](./m365-checklist-api-contract.md)
- [`m365-corrective-action-api-contract.md`](./m365-corrective-action-api-contract.md)
- [`m365-sharepoint-architecture-plan.md`](./m365-sharepoint-architecture-plan.md)
- [`m365-system-user-api-contract.md`](./m365-system-user-api-contract.md)
- [`m365-training-api-contract.md`](./m365-training-api-contract.md)
- [`m365-unit-contact-api-contract.md`](./m365-unit-contact-api-contract.md)
- [`m365-unit-contact-go-live-runbook.md`](./m365-unit-contact-go-live-runbook.md)
- [`m365-unit-contact-implementation-blueprint.md`](./m365-unit-contact-implementation-blueprint.md)
- [`m365-unit-contact-setup-checklist.md`](./m365-unit-contact-setup-checklist.md)
- [`m365-v1-direct-graph-rollout-plan.md`](./m365-v1-direct-graph-rollout-plan.md)
- [`notebooklm-dev-brief.md`](./notebooklm-dev-brief.md)
- [`notebooklm-dev-workflow.md`](./notebooklm-dev-workflow.md)
- [`pre-launch-checklist.md`](./pre-launch-checklist.md)
- [`qa-regression.md`](./qa-regression.md)
- [`sharepoint-browser-attachment-provision.md`](./sharepoint-browser-attachment-provision.md)
- [`sharepoint-browser-provision.md`](./sharepoint-browser-provision.md)
- [`uat-daily-checklist.md`](./uat-daily-checklist.md)
- [`virtualbox-ubuntu-vm-checklist.md`](./virtualbox-ubuntu-vm-checklist.md)
- [`virtualbox-ubuntu-vm-deployment.md`](./virtualbox-ubuntu-vm-deployment.md)
- [`virtualbox-ubuntu-vm-one-hour-plan.md`](./virtualbox-ubuntu-vm-one-hour-plan.md)
- [`windows-service-backend-runbook.md`](./windows-service-backend-runbook.md)

## 3. 可封存

這些多半是歷史紀錄、一次性驗證、過時 UAT 材料或暫時性的參考文件。

- [`appendix10-normal-baseline-checklist.md`](./appendix10-normal-baseline-checklist.md)
- [`audit-report-2026-03-18-remediation.md`](./audit-report-2026-03-18-remediation.md)
- [`engineering-roadmap.md`](./engineering-roadmap.md)
- [`gas-sheets-apps-script-spec.md`](./gas-sheets-apps-script-spec.md)
- [`isms-campus-portal-pages-dev-security-remediation.md`](./isms-campus-portal-pages-dev-security-remediation.md)
- [`role-flow-test-report-2026-03-07.md`](./role-flow-test-report-2026-03-07.md)
- [`role-flow-test-report-2026-03-08.md`](./role-flow-test-report-2026-03-08.md)
- [`campus-colleague-uat-guide.html`](./campus-colleague-uat-guide.html)
- [`campus-colleague-uat-guide.md`](./campus-colleague-uat-guide.md)
- [`campus-colleague-uat-guide.pdf`](./campus-colleague-uat-guide.pdf)
- [`campus-uat-test-script.html`](./campus-uat-test-script.html)
- [`campus-uat-test-script.md`](./campus-uat-test-script.md)
- [`campus-uat-test-script.pdf`](./campus-uat-test-script.pdf)
- [`user-sop-beginner.html`](./user-sop-beginner.html)
- [`user-sop-beginner.pdf`](./user-sop-beginner.pdf)

## 使用方式

- 每次切帳號先看 `保留`
- 只有碰到特定功能再看 `備援`
- 若要縮減文件量，先從 `可封存` 開始

