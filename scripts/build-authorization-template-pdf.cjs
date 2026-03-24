const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright.cjs');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoValue) {
  const value = String(isoValue || '').trim();
  if (!value) return '';
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return value.slice(0, 10);
}

function buildAuthorizationTemplateHtml(buildInfo) {
  const createdDate = escapeHtml(formatDate((buildInfo && buildInfo.builtAt) || new Date().toISOString()));

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>單位資安窗口授權同意書</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 14mm 12mm;
    }
    :root {
      color-scheme: light;
      --ink: #16324f;
      --muted: #5e7289;
      --line: #c8d4e2;
      --line-strong: #879ab0;
      --accent: #1d5fae;
      --accent-soft: #eef5ff;
      --paper: #ffffff;
      --shade: #f5f8fc;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--shade);
      color: var(--ink);
      font-family: "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", "Segoe UI", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      position: relative;
      width: 100%;
      min-height: 274mm;
      padding: 0;
      background: var(--paper);
    }
    .page {
      position: relative;
      min-height: 268mm;
      border: 1.2px solid var(--line-strong);
      border-radius: 14px;
      overflow: hidden;
      background: linear-gradient(180deg, #ffffff 0%, #fcfdff 100%);
      padding: 13mm 13mm 15mm;
    }
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 56mm;
      gap: 10mm;
      align-items: start;
      padding-bottom: 7mm;
      border-bottom: 2px solid var(--accent);
    }
    .brand-eyebrow {
      margin-bottom: 3mm;
      color: var(--accent);
      font-size: 9.8pt;
      font-weight: 700;
      letter-spacing: 0.16em;
    }
    .title {
      margin: 0;
      color: #143156;
      font-size: 23pt;
      line-height: 1.15;
      letter-spacing: 0.04em;
    }
    .subtitle {
      margin: 2.5mm 0 0;
      color: var(--muted);
      font-size: 10.6pt;
      line-height: 1.7;
    }
    .meta-card {
      padding: 5mm 6mm;
      border: 1px solid rgba(29, 95, 174, 0.18);
      border-radius: 12px;
      background: linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%);
    }
    .meta-label {
      color: var(--muted);
      font-size: 9.4pt;
      letter-spacing: 0.08em;
    }
    .meta-value {
      margin-top: 2mm;
      color: var(--ink);
      font-size: 13pt;
      font-weight: 700;
      word-break: break-all;
    }
    .section {
      margin-top: 6mm;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 3mm;
      margin: 0 0 3mm;
      color: #183d68;
      font-size: 12.2pt;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .section-title::before {
      content: "";
      width: 7mm;
      height: 1.5mm;
      border-radius: 999px;
      background: var(--accent);
      flex: 0 0 auto;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4mm 6mm;
    }
    .field {
      display: grid;
      gap: 1.5mm;
    }
    .field-label {
      color: #35506f;
      font-size: 10pt;
      font-weight: 700;
    }
    .field-value {
      min-height: 9.2mm;
      padding: 1.6mm 0 2mm;
      border-bottom: 1px solid var(--line);
      color: var(--ink);
      font-size: 11.1pt;
      line-height: 1.55;
      word-break: break-word;
    }
    .note-box {
      margin-top: 4mm;
      padding: 4mm 5mm;
      border: 1px solid rgba(29, 95, 174, 0.16);
      border-radius: 10px;
      background: var(--accent-soft);
      color: #35506f;
      font-size: 10pt;
      line-height: 1.7;
    }
    .roles {
      display: grid;
      gap: 3mm;
      margin-top: 2mm;
    }
    .role-item {
      display: flex;
      align-items: flex-start;
      gap: 2.5mm;
      color: var(--ink);
      font-size: 10.8pt;
      line-height: 1.5;
    }
    .role-box {
      width: 5mm;
      height: 5mm;
      margin-top: 1.1mm;
      border: 1.3px solid #2e5689;
      border-radius: 1mm;
      flex: 0 0 auto;
      background: #fff;
    }
    .approval-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 5mm;
      background: #fcfdff;
    }
    .approval-title {
      margin-bottom: 4mm;
      color: #1e3f63;
      font-size: 11pt;
      font-weight: 700;
    }
    .approval-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 6mm;
    }
    .approval-field {
      display: grid;
      gap: 1.8mm;
    }
    .approval-label {
      color: #35506f;
      font-size: 10pt;
      font-weight: 700;
    }
    .approval-line {
      min-height: 11mm;
      border-bottom: 1px solid var(--line-strong);
    }
    .footer {
      position: absolute;
      left: 13mm;
      right: 13mm;
      bottom: 9mm;
      padding-top: 2.5mm;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 8.6pt;
      text-align: center;
    }
    @media print {
      html, body {
        background: #fff;
      }
      .sheet {
        min-height: auto;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="page">
      <header class="header">
        <div>
          <div class="brand-eyebrow">NATIONAL TAIWAN UNIVERSITY</div>
          <h1 class="title">單位資安窗口授權同意書</h1>
          <p class="subtitle">供單位申請資安窗口時使用，請由主管完成簽章後，交由申請人上傳至系統。</p>
        </div>
        <aside class="meta-card">
          <div class="meta-label">表單編號</div>
          <div class="meta-value">ISMS-CC-Auth-01</div>
        </aside>
      </header>

      <section class="section">
        <div class="section-title">一、申請資訊</div>
        <div class="info-grid">
          <div class="field">
            <div class="field-label">申請單位</div>
            <div class="field-value"></div>
          </div>
          <div class="field">
            <div class="field-label">主要歸屬單位</div>
            <div class="field-value"></div>
          </div>
          <div class="field">
            <div class="field-label">申請人姓名</div>
            <div class="field-value"></div>
          </div>
          <div class="field">
            <div class="field-label">申請電子郵件</div>
            <div class="field-value"></div>
          </div>
          <div class="field">
            <div class="field-label">連絡分機</div>
            <div class="field-value"></div>
          </div>
          <div class="field">
            <div class="field-label">額外授權資源範圍</div>
            <div class="field-value"></div>
          </div>
        </div>
        <div class="note-box">如有跨單位兼辦，請於申請單中明確列出額外授權範圍，方便審核與後續權限設定。</div>
      </section>

      <section class="section">
        <div class="section-title">二、授權資安角色</div>
        <div class="roles">
          <div class="role-item"><span class="role-box"></span><span>一級單位資安窗口</span></div>
          <div class="role-item"><span class="role-box"></span><span>二級單位資安窗口</span></div>
        </div>
      </section>

      <section class="section">
        <div class="section-title">三、主管核可</div>
        <div class="approval-card">
          <div class="approval-title">請由主管確認後簽章</div>
          <div class="approval-grid">
            <div class="approval-field">
              <div class="approval-label">主管簽章</div>
              <div class="approval-line"></div>
            </div>
            <div class="approval-field">
              <div class="approval-label">日期</div>
              <div class="approval-line"></div>
            </div>
          </div>
        </div>
      </section>

      <div class="footer">產製日期：${createdDate}</div>
    </section>
  </main>
</body>
</html>`;
}

async function buildAuthorizationTemplatePdf(outputDir, buildInfo) {
  const filename = 'unit-contact-authorization-template.pdf';
  const pdfPath = path.join(outputDir, filename);
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.emulateMedia({ media: 'print' });
    await page.setContent(buildAuthorizationTemplateHtml(buildInfo), { waitUntil: 'load' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });
  } finally {
    await browser.close();
  }
  return pdfPath;
}

module.exports = {
  buildAuthorizationTemplatePdf
};
