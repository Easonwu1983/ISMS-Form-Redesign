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

function buildAuthorizationTemplateHtml(buildInfo) {
  const versionKey = escapeHtml(String(buildInfo && buildInfo.versionKey || 'unknown'));
  const builtAt = escapeHtml(String(buildInfo && buildInfo.builtAt || new Date().toISOString()));
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>單位資安窗口授權同意書</title>
  <style>
    @page {
      size: A4;
      margin: 12mm;
    }
    :root {
      color-scheme: light;
      --ink: #19324f;
      --muted: #5d7189;
      --line: #c9d4e3;
      --line-strong: #7f93ac;
      --accent: #1d5fae;
      --accent-soft: #eef5ff;
      --paper: #ffffff;
      --shade: #f6f9fc;
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
    body {
      padding: 0;
    }
    .sheet {
      width: 186mm;
      min-height: 273mm;
      margin: 0 auto;
      background: var(--paper);
      border: 1.4px solid var(--line-strong);
      border-radius: 14px;
      padding: 14mm 14mm 12mm;
      position: relative;
      overflow: hidden;
    }
    .top-band {
      display: flex;
      justify-content: space-between;
      gap: 12mm;
      padding-bottom: 8mm;
      border-bottom: 2px solid var(--accent);
      margin-bottom: 8mm;
    }
    .brand {
      display: grid;
      gap: 3mm;
      max-width: 118mm;
    }
    .eyebrow {
      font-size: 10pt;
      letter-spacing: .14em;
      color: var(--accent);
      font-weight: 700;
    }
    h1 {
      margin: 0;
      font-size: 24pt;
      line-height: 1.2;
      letter-spacing: .06em;
      color: #143156;
    }
    .subtext {
      margin: 0;
      font-size: 10.5pt;
      line-height: 1.6;
      color: var(--muted);
    }
    .stamp {
      flex: 0 0 58mm;
      display: grid;
      align-content: start;
      gap: 3mm;
      padding: 5mm 6mm;
      border: 1px solid rgba(29, 95, 174, .18);
      border-radius: 12px;
      background: linear-gradient(180deg, #f9fbff 0%, #eef4fb 100%);
    }
    .stamp-label {
      font-size: 9.5pt;
      color: var(--muted);
      letter-spacing: .06em;
    }
    .stamp-value {
      font-size: 13pt;
      font-weight: 700;
      color: var(--ink);
      word-break: break-all;
    }
    .section {
      margin-top: 6mm;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 3mm;
      margin-bottom: 3mm;
      font-size: 12.5pt;
      font-weight: 700;
      color: #173b68;
    }
    .section-title::before {
      content: "";
      width: 8mm;
      height: 1.5mm;
      border-radius: 999px;
      background: var(--accent);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4mm 6mm;
    }
    .field {
      display: grid;
      gap: 1.8mm;
    }
    .field-label {
      font-size: 10pt;
      font-weight: 700;
      color: #2f4a67;
    }
    .field-line {
      min-height: 9mm;
      border-bottom: 1.2px solid var(--line);
      padding: 1mm 0 1.4mm;
      font-size: 11pt;
      color: var(--ink);
      letter-spacing: .02em;
    }
    .field-line.placeholder {
      color: #8fa0b5;
    }
    .note-box {
      margin-top: 4mm;
      padding: 4mm 5mm;
      background: var(--accent-soft);
      border: 1px solid rgba(29, 95, 174, .16);
      border-radius: 10px;
      color: #35506f;
      font-size: 10.5pt;
      line-height: 1.7;
    }
    .checkboxes {
      display: grid;
      gap: 4mm;
      margin-top: 2mm;
    }
    .checkbox-item {
      display: flex;
      align-items: flex-start;
      gap: 3mm;
      font-size: 11pt;
      line-height: 1.5;
      color: var(--ink);
    }
    .checkbox-box {
      width: 5.2mm;
      height: 5.2mm;
      margin-top: 1.2mm;
      border: 1.4px solid #376191;
      border-radius: 1.2mm;
      flex: 0 0 auto;
      background: #fff;
    }
    .two-col {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6mm;
      margin-top: 5mm;
    }
    .panel {
      min-height: 42mm;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 5mm;
      background: linear-gradient(180deg, #fff 0%, #fbfcfe 100%);
    }
    .panel-title {
      font-size: 11pt;
      font-weight: 700;
      color: #234567;
      margin-bottom: 4mm;
    }
    .signature-line {
      margin-top: 11mm;
      border-bottom: 1.2px solid var(--line-strong);
      min-height: 10mm;
    }
    .signature-hint {
      margin-top: 2mm;
      font-size: 9.5pt;
      color: var(--muted);
      line-height: 1.6;
    }
    .footer {
      position: absolute;
      left: 14mm;
      right: 14mm;
      bottom: 10mm;
      display: flex;
      justify-content: space-between;
      gap: 6mm;
      font-size: 8.5pt;
      color: var(--muted);
      border-top: 1px solid var(--line);
      padding-top: 3mm;
    }
    .footer strong {
      color: var(--ink);
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="top-band">
      <div class="brand">
        <div class="eyebrow">NATIONAL TAIWAN UNIVERSITY</div>
        <h1>單位資安窗口授權同意書</h1>
        <p class="subtext">請先由單位主管確認內容並簽章，再與申請單一併上傳。此文件僅供單位資安窗口授權使用。</p>
      </div>
      <aside class="stamp">
        <div class="stamp-label">表單編號</div>
        <div class="stamp-value">ISMS-UC-Auth-01</div>
        <div class="stamp-label">產製版本</div>
        <div class="stamp-value">${versionKey}</div>
      </aside>
    </div>

    <section class="section">
      <div class="section-title">一、申請資訊</div>
      <div class="grid">
        <div class="field">
          <div class="field-label">申請單位</div>
          <div class="field-line placeholder">________________________________</div>
        </div>
        <div class="field">
          <div class="field-label">申請人姓名</div>
          <div class="field-line placeholder">________________________________</div>
        </div>
        <div class="field">
          <div class="field-label">申請電子郵件</div>
          <div class="field-line placeholder">________________________________</div>
        </div>
        <div class="field">
          <div class="field-label">申請日期</div>
          <div class="field-line placeholder">________________________________</div>
        </div>
      </div>
      <div class="note-box">說明：本同意書僅作為單位資安窗口授權依據。請確認內容無誤後，由主管簽章並併同申請表單上傳。</div>
    </section>

    <section class="section">
      <div class="section-title">二、授權資安角色</div>
      <div class="checkboxes">
        <div class="checkbox-item"><span class="checkbox-box"></span><span>一級單位資安窗口</span></div>
        <div class="checkbox-item"><span class="checkbox-box"></span><span>二級單位資安窗口</span></div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">三、主管核可</div>
      <div class="two-col">
        <div class="panel">
          <div class="panel-title">主管簽章</div>
          <div class="signature-line"></div>
          <div class="signature-hint">請於此處簽名或蓋章。</div>
        </div>
        <div class="panel">
          <div class="panel-title">核可日期與備註</div>
          <div class="signature-line"></div>
          <div class="signature-hint">日期：____________________<br>備註：____________________</div>
        </div>
      </div>
    </section>

    <div class="footer">
      <div>產製日期：<strong>${builtAt}</strong></div>
      <div>文件用途：單位資安窗口授權附件</div>
    </div>
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
