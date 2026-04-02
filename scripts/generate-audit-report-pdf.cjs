'use strict';

const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');

const fonts = {
  Roboto: {
    normal: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'build', 'vfs_fonts.js')
  }
};

// Use default fonts bundled with pdfmake
const printer = new PdfPrinter({
  Roboto: {
    normal: Buffer.from(''),
    bold: Buffer.from(''),
    italics: Buffer.from(''),
    bolditalics: Buffer.from('')
  }
});

async function generateAuditReportPdf(data, outputPath) {
  const cl = data.checklist || {};
  const tr = data.training || {};
  const pd = data.pending || {};
  const year = cl.auditYear || String(new Date().getFullYear() - 1911);

  const docDefinition = {
    content: [
      { text: '國立臺灣大學 資通安全內部稽核報告', style: 'title' },
      { text: '稽核年度：' + year, style: 'subtitle' },
      { text: '報告產生日期：' + new Date().toLocaleDateString('zh-TW'), style: 'date' },
      '\n',
      { text: '一、檢核表填報進度', style: 'sectionHeader' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            ['項目', '數量', '比例', '說明'],
            ['已送出', String(cl.submittedUnits || 0), cl.totalUnits ? Math.round((cl.submittedUnits || 0) / cl.totalUnits * 100) + '%' : '—', '已完成填報並送出'],
            ['草稿中', String(cl.draftCount || 0), '—', '已開始但尚未送出'],
            ['未填報', String(cl.notFiledUnits || 0), '—', '尚未建立檢核表'],
            ['合計', String(cl.totalUnits || 163), '100%', '全校一級單位']
          ]
        }
      },
      '\n',
      { text: '二、教育訓練統計', style: 'sectionHeader' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: [
            ['狀態', '數量', '說明'],
            ['已完成填報', String(tr.completedForms || 0), '流程全部完成'],
            ['暫存/填報中', String((tr.draftForms || 0) + (tr.pendingForms || 0)), '進行中'],
            ['退回更正', String(tr.returnedForms || 0), '需修改後重新送出'],
            ['平均完成率', (tr.avgCompletionRate || 0) + '%', '全校教育訓練達成率']
          ]
        }
      },
      '\n',
      { text: '三、矯正單概況', style: 'sectionHeader' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto'],
          body: [
            ['狀態', '數量'],
            ['待矯正', String(pd.correctivePending || 0)],
            ['已提案', String(pd.correctiveProposed || 0)],
            ['追蹤中', String(pd.correctiveTracking || 0)],
            ['開放案件總數', String(pd.correctiveOpenTotal || 0)]
          ]
        }
      },
      '\n',
      { text: '四、待處理事項', style: 'sectionHeader' },
      {
        ul: [
          '待審核帳號申請：' + (pd.applicationsPendingReview || 0) + ' 筆',
          '待啟用帳號：' + (pd.activationPending || 0) + ' 筆',
          '待處理矯正單：' + (pd.correctivePending || 0) + ' 筆',
          '追蹤中矯正單：' + (pd.correctiveTracking || 0) + ' 筆',
          '總計待處理：' + (pd.totalPendingItems || 0) + ' 項'
        ]
      }
    ],
    styles: {
      title: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 0, 0, 10] },
      subtitle: { fontSize: 14, alignment: 'center', margin: [0, 0, 0, 5] },
      date: { fontSize: 10, alignment: 'center', color: '#666', margin: [0, 0, 0, 20] },
      sectionHeader: { fontSize: 14, bold: true, margin: [0, 10, 0, 8] }
    },
    defaultStyle: { fontSize: 11 }
  };

  return new Promise(function (resolve, reject) {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on('data', function (chunk) { chunks.push(chunk); });
      pdfDoc.on('end', function () {
        const result = Buffer.concat(chunks);
        if (outputPath) {
          fs.writeFileSync(outputPath, result);
          console.log('PDF report saved to:', outputPath);
        }
        resolve(result);
      });
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateAuditReportPdf };

// CLI usage: node scripts/generate-audit-report-pdf.cjs [output.pdf]
if (require.main === module) {
  const output = process.argv[2] || 'audit-report-' + new Date().toISOString().slice(0, 10) + '.pdf';
  // Fetch data from live API or use sample
  const sampleData = {
    checklist: { totalUnits: 163, submittedUnits: 0, notFiledUnits: 163, draftCount: 1, auditYear: '115' },
    training: { completedForms: 0, draftForms: 0, pendingForms: 0, returnedForms: 0, avgCompletionRate: 0 },
    pending: { applicationsPendingReview: 1, activationPending: 0, correctivePending: 0, correctiveProposed: 0, correctiveTracking: 0, correctiveOpenTotal: 0, totalPendingItems: 1 }
  };
  generateAuditReportPdf(sampleData, output).then(function () {
    console.log('Done.');
  }).catch(function (err) {
    console.error('Failed:', err);
    process.exit(1);
  });
}
