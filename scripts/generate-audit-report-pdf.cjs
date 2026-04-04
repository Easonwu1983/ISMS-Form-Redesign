// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');

// ── pdfmake v0.3 setup ──
// The module exports a singleton; fonts are registered via virtualfs + addFonts.
const pdfmake = require('pdfmake');

const fontDir = path.join(__dirname, '..', 'node_modules', 'pdfmake', 'fonts', 'Roboto');
pdfmake.virtualfs.writeFileSync('fonts/Roboto-Regular.ttf', fs.readFileSync(path.join(fontDir, 'Roboto-Regular.ttf')));
pdfmake.virtualfs.writeFileSync('fonts/Roboto-Medium.ttf', fs.readFileSync(path.join(fontDir, 'Roboto-Medium.ttf')));
pdfmake.virtualfs.writeFileSync('fonts/Roboto-Italic.ttf', fs.readFileSync(path.join(fontDir, 'Roboto-Italic.ttf')));
pdfmake.virtualfs.writeFileSync('fonts/Roboto-MediumItalic.ttf', fs.readFileSync(path.join(fontDir, 'Roboto-MediumItalic.ttf')));

pdfmake.addFonts({
  Roboto: {
    normal: 'fonts/Roboto-Regular.ttf',
    bold: 'fonts/Roboto-Medium.ttf',
    italics: 'fonts/Roboto-Italic.ttf',
    bolditalics: 'fonts/Roboto-MediumItalic.ttf'
  }
});

// ── Color palette ──
const C = {
  primary: '#1e40af',
  primaryLight: '#dbeafe',
  text: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0',
  bgLight: '#f8fafc',
  success: '#16a34a',
  successBg: '#dcfce7',
  warning: '#d97706',
  warningBg: '#fef3c7',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  info: '#2563eb',
  infoBg: '#dbeafe'
};

// ── Helpers ──

/** Horizontal bar for stats visualization (canvas-based). */
function statBar(label, value, total, color) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  const barPx = Math.max(Math.round(300 * pct / 100), 2);
  return {
    columns: [
      { text: label, width: 100, fontSize: 10, color: C.text, margin: [0, 2, 0, 0] },
      {
        width: '*',
        stack: [{
          canvas: [
            { type: 'rect', x: 0, y: 0, w: 300, h: 14, r: 4, color: '#e2e8f0' },
            { type: 'rect', x: 0, y: 0, w: barPx, h: 14, r: 4, color: color || C.primary }
          ]
        }],
        margin: [0, 2, 0, 0]
      },
      { text: value + ' / ' + total + ' (' + pct + '%)', width: 110, fontSize: 10, alignment: 'right', color: C.muted, margin: [4, 2, 0, 0] }
    ],
    margin: [0, 3, 0, 3]
  };
}

/** Styled table with alternating rows and themed header. */
function styledTable(headerRow, bodyRows, widths) {
  return {
    table: {
      headerRows: 1,
      widths: widths || ['*', 'auto', 'auto', 'auto'],
      body: [headerRow].concat(bodyRows)
    },
    layout: {
      hLineWidth: function () { return 0.5; },
      vLineWidth: function () { return 0; },
      hLineColor: function (i) { return i === 1 ? C.primary : C.border; },
      fillColor: function (i) { return i === 0 ? C.primaryLight : (i % 2 === 0 ? '#ffffff' : C.bgLight); },
      paddingLeft: function () { return 8; },
      paddingRight: function () { return 8; },
      paddingTop: function () { return 6; },
      paddingBottom: function () { return 6; }
    },
    margin: [0, 4, 0, 12]
  };
}

function hdr(text) { return { text: text, bold: true, fontSize: 10, color: C.primary }; }
function cel(text, opts) { return Object.assign({ text: String(text), fontSize: 10, color: C.text }, opts || {}); }
function pctSafe(num, den) { return den > 0 ? Math.round(num / den * 100) + '%' : '—'; }

/**
 * Generate the audit report PDF buffer.
 *
 * @param {{ checklist: object, training: object, pending: object }} data
 * @param {string} [outputPath]
 * @returns {Promise<Buffer>}
 */
async function generateAuditReportPdf(data, outputPath) {
  const cl = data.checklist || {};
  const tr = data.training || {};
  const pd = data.pending || {};
  const year = cl.auditYear || String(new Date().getFullYear() - 1911);
  const today = new Date();
  const dateStr = (today.getFullYear() - 1911) + '/' + (today.getMonth() + 1) + '/' + today.getDate();

  const submitted = Number(cl.submittedUnits) || 0;
  const total = Math.max(Number(cl.totalUnits) || 0, 1);
  const completed = Number(tr.completedForms) || 0;
  const totalForms = completed + (Number(tr.draftForms) || 0) + (Number(tr.pendingForms) || 0) + (Number(tr.returnedForms) || 0);
  const openCases = Number(pd.correctiveOpenTotal) || 0;
  const pendingItems = Number(pd.totalPendingItems) || 0;

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    content: [
      // ── Title block ──
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 515, h: 60, r: 8, color: C.primary }
        ]
      },
      {
        text: [
          { text: '國立臺灣大學 ' + year + '年度\n', fontSize: 14 },
          { text: '資通安全內部稽核總結報告', fontSize: 18, bold: true }
        ],
        color: '#ffffff',
        alignment: 'center',
        margin: [0, -52, 0, 16],
        lineHeight: 1.4
      },
      {
        text: '報告產生日期：' + dateStr,
        fontSize: 9,
        color: C.muted,
        alignment: 'right',
        margin: [0, 8, 0, 16]
      },

      // ── Summary stat cards (4-column table) ──
      {
        table: {
          widths: ['*', '*', '*', '*'],
          body: [[
            { stack: [{ text: pctSafe(submitted, total), fontSize: 22, bold: true, color: C.success, alignment: 'center' }, { text: '檢核表完成率', fontSize: 9, color: C.muted, alignment: 'center', margin: [0, 2, 0, 0] }], fillColor: C.successBg, margin: [0, 8, 0, 8] },
            { stack: [{ text: totalForms > 0 ? pctSafe(completed, totalForms) : '0%', fontSize: 22, bold: true, color: C.info, alignment: 'center' }, { text: '教育訓練完成率', fontSize: 9, color: C.muted, alignment: 'center', margin: [0, 2, 0, 0] }], fillColor: C.infoBg, margin: [0, 8, 0, 8] },
            { stack: [{ text: String(openCases), fontSize: 22, bold: true, color: openCases > 0 ? C.warning : C.success, alignment: 'center' }, { text: '開放矯正單', fontSize: 9, color: C.muted, alignment: 'center', margin: [0, 2, 0, 0] }], fillColor: openCases > 0 ? C.warningBg : C.successBg, margin: [0, 8, 0, 8] },
            { stack: [{ text: String(pendingItems), fontSize: 22, bold: true, color: pendingItems > 0 ? C.danger : C.success, alignment: 'center' }, { text: '待處理事項', fontSize: 9, color: C.muted, alignment: 'center', margin: [0, 2, 0, 0] }], fillColor: pendingItems > 0 ? C.dangerBg : C.successBg, margin: [0, 8, 0, 8] }
          ]]
        },
        layout: {
          hLineWidth: function () { return 0; },
          vLineWidth: function () { return 0; },
          paddingLeft: function () { return 6; },
          paddingRight: function () { return 6; },
          paddingTop: function () { return 0; },
          paddingBottom: function () { return 0; }
        },
        margin: [0, 0, 0, 20]
      },

      // ── Bar chart ──
      { text: '完成進度總覽', fontSize: 13, bold: true, color: C.primary, margin: [0, 0, 0, 8] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: C.border }] },
      { text: '', margin: [0, 0, 0, 6] },
      statBar('檢核表送出', submitted, total, C.success),
      statBar('教育訓練完成', completed, totalForms || 1, C.info),
      { text: '', margin: [0, 0, 0, 12] },

      // ── Section 1 ──
      { text: '一、檢核表填報進度', fontSize: 13, bold: true, color: C.primary, margin: [0, 4, 0, 8] },
      styledTable(
        [hdr('項目'), hdr('數量'), hdr('比例'), hdr('說明')],
        [
          [cel('已送出'), cel(submitted), cel(pctSafe(submitted, total)), cel('已完成填報並送出')],
          [cel('草稿中'), cel(cl.draftCount || 0), cel('—'), cel('已開始但尚未送出')],
          [cel('未填報'), cel(cl.notFiledUnits || 0), cel('—'), cel('尚未建立檢核表')],
          [cel('合計', { bold: true }), cel(total, { bold: true }), cel('100%', { bold: true }), cel('全校一級單位')]
        ],
        ['*', 'auto', 'auto', '*']
      ),

      // ── Section 2 ──
      { text: '二、教育訓練統計', fontSize: 13, bold: true, color: C.primary, margin: [0, 4, 0, 8] },
      styledTable(
        [hdr('狀態'), hdr('數量'), hdr('說明')],
        [
          [cel('已完成填報'), cel(completed), cel('流程全部完成')],
          [cel('暫存 / 填報中'), cel((Number(tr.draftForms) || 0) + (Number(tr.pendingForms) || 0)), cel('進行中')],
          [cel('退回更正'), cel(tr.returnedForms || 0), cel('需修改後重新送出')],
          [cel('平均完成率', { bold: true }), cel((tr.avgCompletionRate || 0) + '%', { bold: true }), cel('全校教育訓練達成率')]
        ],
        ['*', 'auto', '*']
      ),

      // ── Section 3 ──
      { text: '三、矯正單狀態分佈', fontSize: 13, bold: true, color: C.primary, margin: [0, 4, 0, 8] },
      styledTable(
        [hdr('狀態'), hdr('數量'), hdr('佔比')],
        [
          [cel('待矯正'), cel(pd.correctivePending || 0), cel(pctSafe(Number(pd.correctivePending) || 0, openCases))],
          [cel('已提案'), cel(pd.correctiveProposed || 0), cel(pctSafe(Number(pd.correctiveProposed) || 0, openCases))],
          [cel('追蹤中'), cel(pd.correctiveTracking || 0), cel(pctSafe(Number(pd.correctiveTracking) || 0, openCases))],
          [cel('開放案件總數', { bold: true }), cel(openCases, { bold: true }), cel('100%', { bold: true })]
        ],
        ['*', 'auto', 'auto']
      ),

      // ── Section 4 ──
      { text: '四、待處理事項摘要', fontSize: 13, bold: true, color: C.primary, margin: [0, 4, 0, 8] },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [{ text: '待審核帳號申請', fontSize: 10, color: C.text }, { text: (pd.applicationsPendingReview || 0) + ' 筆', fontSize: 10, alignment: 'right' }],
            [{ text: '待啟用帳號', fontSize: 10, color: C.text }, { text: (pd.activationPending || 0) + ' 筆', fontSize: 10, alignment: 'right' }],
            [{ text: '待處理矯正單', fontSize: 10, color: C.text }, { text: (pd.correctivePending || 0) + ' 筆', fontSize: 10, alignment: 'right' }],
            [{ text: '追蹤中矯正單', fontSize: 10, color: C.text }, { text: (pd.correctiveTracking || 0) + ' 筆', fontSize: 10, alignment: 'right' }],
            [{ text: '總計待處理', fontSize: 10, bold: true, color: C.primary }, { text: pendingItems + ' 項', fontSize: 10, bold: true, alignment: 'right', color: C.primary }]
          ]
        },
        layout: {
          hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 0 : 0.5; },
          vLineWidth: function () { return 0; },
          hLineColor: function () { return C.border; },
          paddingLeft: function () { return 8; },
          paddingRight: function () { return 8; },
          paddingTop: function () { return 5; },
          paddingBottom: function () { return 5; },
          fillColor: function (i) { return i % 2 === 0 ? C.bgLight : '#ffffff'; }
        },
        margin: [0, 4, 0, 16]
      },

      // ── Footer ──
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: C.border }] },
      {
        text: '本報告由 ISMS 資訊安全管理系統自動產生，資料截至 ' + dateStr + '。如有疑問請洽資安管理中心。',
        fontSize: 8,
        color: C.muted,
        alignment: 'center',
        margin: [0, 8, 0, 0]
      }
    ],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: C.text
    }
  };

  const pdfDoc = pdfmake.createPdf(docDefinition);
  const buffer = await pdfDoc.getBuffer();

  if (outputPath) {
    const dir = path.dirname(path.resolve(outputPath));
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(outputPath, buffer);
    console.log('PDF report saved to:', outputPath);
  }

  return buffer;
}

module.exports = { generateAuditReportPdf };

// CLI usage: node scripts/generate-audit-report-pdf.cjs [output.pdf]
if (require.main === module) {
  const output = process.argv[2] || 'audit-report-' + new Date().toISOString().slice(0, 10) + '.pdf';
  const sampleData = {
    checklist: { totalUnits: 163, submittedUnits: 98, notFiledUnits: 55, draftCount: 10, auditYear: '114' },
    training: { completedForms: 120, draftForms: 15, pendingForms: 8, returnedForms: 3, avgCompletionRate: 82.5 },
    pending: { applicationsPendingReview: 2, activationPending: 1, correctivePending: 3, correctiveProposed: 5, correctiveTracking: 2, correctiveOpenTotal: 10, totalPendingItems: 13 }
  };
  generateAuditReportPdf(sampleData, output).then(function () {
    console.log('Done.');
  }).catch(function (err) {
    console.error('Failed:', err);
    process.exit(1);
  });
}
