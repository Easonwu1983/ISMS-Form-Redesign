// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, WidthType, HeadingLevel,
  BorderStyle, ShadingType, PageBreak
} = require('docx');

// ── Color palette (matching PDF report) ──
const C = {
  primary: '1e40af',
  primaryLight: 'dbeafe',
  text: '1e293b',
  muted: '64748b',
  success: '16a34a',
  successBg: 'dcfce7',
  warning: 'd97706',
  warningBg: 'fef3c7',
  danger: 'dc2626',
  dangerBg: 'fee2e2',
  white: 'ffffff',
  bgLight: 'f8fafc',
  border: 'e2e8f0'
};

/** Percentage helper */
function pctSafe(num, den) {
  return den > 0 ? Math.round(num / den * 100) + '%' : '\u2014';
}

/** Create a styled table header cell */
function headerCell(text, widthPct) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: C.primaryLight, fill: C.primaryLight },
    children: [new Paragraph({
      children: [new TextRun({ text: text, bold: true, size: 20, color: C.primary, font: 'Microsoft JhengHei' })],
      spacing: { before: 60, after: 60 }
    })]
  });
}

/** Create a styled table body cell */
function bodyCell(text, opts) {
  const bold = opts && opts.bold;
  const color = (opts && opts.color) || C.text;
  const fill = (opts && opts.fill) || undefined;
  const widthPct = (opts && opts.width) || undefined;
  const cellOpts = {
    children: [new Paragraph({
      children: [new TextRun({ text: String(text), bold: !!bold, size: 20, color: color, font: 'Microsoft JhengHei' })],
      spacing: { before: 40, after: 40 }
    })]
  };
  if (widthPct) cellOpts.width = { size: widthPct, type: WidthType.PERCENTAGE };
  if (fill) cellOpts.shading = { type: ShadingType.SOLID, color: fill, fill: fill };
  return new TableCell(cellOpts);
}

/** Section heading paragraph */
function sectionHeading(text) {
  return new Paragraph({
    children: [new TextRun({ text: text, bold: true, size: 26, color: C.primary, font: 'Microsoft JhengHei' })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 }
  });
}

/** Normal paragraph */
function para(text, opts) {
  const size = (opts && opts.size) || 22;
  const color = (opts && opts.color) || C.text;
  const alignment = (opts && opts.alignment) || AlignmentType.LEFT;
  return new Paragraph({
    children: [new TextRun({ text: text, size: size, color: color, font: 'Microsoft JhengHei', bold: !!(opts && opts.bold) })],
    alignment: alignment,
    spacing: { before: (opts && opts.spaceBefore) || 60, after: (opts && opts.spaceAfter) || 60 }
  });
}

/** Build a bordered table from header + body rows */
function styledTable(headerRow, bodyRows) {
  const borderDef = { style: BorderStyle.SINGLE, size: 1, color: C.border };
  const borders = { top: borderDef, bottom: borderDef, left: borderDef, right: borderDef };
  const rows = [
    new TableRow({ children: headerRow, tableHeader: true })
  ];
  bodyRows.forEach(function (cells, idx) {
    const fill = idx % 2 === 0 ? C.white : C.bgLight;
    rows.push(new TableRow({
      children: cells.map(function (cell) {
        // Apply alternating row shading if cell doesn't already have fill
        if (!cell.shading) {
          return new TableCell({
            ...cell,
            shading: { type: ShadingType.SOLID, color: fill, fill: fill },
            children: cell.children || [new Paragraph('')]
          });
        }
        return cell;
      })
    }));
  });
  return new Table({
    rows: rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: borderDef, bottom: borderDef, left: borderDef, right: borderDef, insideHorizontal: borderDef, insideVertical: borderDef }
  });
}

/**
 * Generate the annual audit report as a Word (.docx) buffer.
 *
 * @param {{ checklist: object, training: object, pending: object, correctiveDetails?: Array }} data
 * @param {string} [outputPath]
 * @returns {Promise<Buffer>}
 */
async function generateAuditReportDocx(data, outputPath) {
  const cl = data.checklist || {};
  const tr = data.training || {};
  const pd = data.pending || {};
  const correctiveDetails = data.correctiveDetails || [];
  const year = cl.auditYear || String(new Date().getFullYear() - 1911);
  const today = new Date();
  const dateStr = (today.getFullYear() - 1911) + '/' + (today.getMonth() + 1) + '/' + today.getDate();

  const submitted = Number(cl.submittedUnits) || 0;
  const total = Math.max(Number(cl.totalUnits) || 0, 1);
  const completed = Number(tr.completedForms) || 0;
  const totalForms = completed + (Number(tr.draftForms) || 0) + (Number(tr.pendingForms) || 0) + (Number(tr.returnedForms) || 0);
  const openCases = Number(pd.correctiveOpenTotal) || 0;
  const overdueCases = Number(pd.correctiveOverdue) || 0;
  const closedCases = Number(pd.correctiveClosed) || 0;

  // ── Build document sections ──
  const children = [];

  // ── Title page ──
  children.push(new Paragraph({ spacing: { before: 2400 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '\u570b\u7acb\u81fa\u7063\u5927\u5b78', size: 36, color: C.primary, bold: true, font: 'Microsoft JhengHei' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 }
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: year + '\u5e74\u5ea6', size: 32, color: C.primary, font: 'Microsoft JhengHei' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 }
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '\u8cc7\u901a\u5b89\u5168\u5167\u90e8\u7a3d\u6838\u7e3d\u7d50\u5831\u544a', size: 36, color: C.primary, bold: true, font: 'Microsoft JhengHei' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '\u5831\u544a\u7522\u751f\u65e5\u671f\uff1a' + dateStr, size: 22, color: C.muted, font: 'Microsoft JhengHei' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 }
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '\u8cc7\u5b89\u7ba1\u7406\u4e2d\u5fc3 \u81ea\u52d5\u7522\u751f', size: 20, color: C.muted, font: 'Microsoft JhengHei' })],
    alignment: AlignmentType.CENTER
  }));

  // Page break after title
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Section 1: Audit Overview ──
  children.push(sectionHeading('\u4e00\u3001\u7a3d\u6838\u6982\u6cc1'));
  children.push(para('\u672c\u5831\u544a\u5f59\u6574 ' + year + ' \u5e74\u5ea6\u5168\u6821\u8cc7\u901a\u5b89\u5168\u5167\u90e8\u7a3d\u6838\u57f7\u884c\u60c5\u5f62\uff0c\u6db5\u84cb\u6aa2\u6838\u8868\u586b\u5831\u3001\u6559\u80b2\u8a13\u7df4\u53ca\u77ef\u6b63\u55ae\u8ffd\u8e64\u7b49\u9805\u76ee\u3002'));
  children.push(styledTable(
    [headerCell('\u9805\u76ee', 40), headerCell('\u6578\u5024', 20), headerCell('\u8aaa\u660e', 40)],
    [
      [bodyCell('\u53d7\u7a3d\u55ae\u4f4d\u7e3d\u6578'), bodyCell(String(total)), bodyCell('\u5168\u6821\u4e00\u7d1a\u55ae\u4f4d')],
      [bodyCell('\u5df2\u5b8c\u6210\u586b\u5831'), bodyCell(String(submitted)), bodyCell('\u5df2\u9001\u51fa\u6aa2\u6838\u8868')],
      [bodyCell('\u6aa2\u6838\u8868\u5b8c\u6210\u7387'), bodyCell(pctSafe(submitted, total)), bodyCell('\u586b\u5831\u9032\u5ea6')],
      [bodyCell('\u7a3d\u6838\u5e74\u5ea6'), bodyCell(year), bodyCell('\u6c11\u570b ' + year + ' \u5e74')]
    ]
  ));

  // ── Section 2: Checklist Statistics ──
  children.push(sectionHeading('\u4e8c\u3001\u6aa2\u6838\u8868\u586b\u5831\u7d71\u8a08'));
  children.push(para('\u5168\u6821 ' + total + ' \u500b\u4e00\u7d1a\u55ae\u4f4d\u4e2d\uff0c\u5df2\u6709 ' + submitted + ' \u500b\u55ae\u4f4d\u5b8c\u6210\u6aa2\u6838\u8868\u9001\u51fa\uff0c\u5b8c\u6210\u7387 ' + pctSafe(submitted, total) + '\u3002'));
  children.push(styledTable(
    [headerCell('\u72c0\u614b', 30), headerCell('\u6578\u91cf', 20), headerCell('\u6bd4\u4f8b', 20), headerCell('\u8aaa\u660e', 30)],
    [
      [bodyCell('\u5df2\u9001\u51fa'), bodyCell(String(submitted)), bodyCell(pctSafe(submitted, total)), bodyCell('\u5df2\u5b8c\u6210\u586b\u5831\u4e26\u9001\u51fa')],
      [bodyCell('\u8349\u7a3f\u4e2d'), bodyCell(String(cl.draftCount || 0)), bodyCell('\u2014'), bodyCell('\u5df2\u958b\u59cb\u4f46\u5c1a\u672a\u9001\u51fa')],
      [bodyCell('\u672a\u586b\u5831'), bodyCell(String(cl.notFiledUnits || 0)), bodyCell('\u2014'), bodyCell('\u5c1a\u672a\u5efa\u7acb\u6aa2\u6838\u8868')],
      [bodyCell('\u5408\u8a08', { bold: true }), bodyCell(String(total), { bold: true }), bodyCell('100%', { bold: true }), bodyCell('\u5168\u6821\u4e00\u7d1a\u55ae\u4f4d', { bold: true })]
    ]
  ));

  // ── Section 3: Training Statistics ──
  children.push(sectionHeading('\u4e09\u3001\u6559\u80b2\u8a13\u7df4\u7d71\u8a08'));
  children.push(para('\u6559\u80b2\u8a13\u7df4\u8868\u55ae\u7e3d\u8a08 ' + totalForms + ' \u4efd\uff0c\u5df2\u5b8c\u6210 ' + completed + ' \u4efd\uff0c\u5e73\u5747\u5b8c\u6210\u7387 ' + (tr.avgCompletionRate || 0) + '%\u3002'));
  children.push(styledTable(
    [headerCell('\u72c0\u614b', 40), headerCell('\u6578\u91cf', 20), headerCell('\u8aaa\u660e', 40)],
    [
      [bodyCell('\u5df2\u5b8c\u6210\u586b\u5831'), bodyCell(String(completed)), bodyCell('\u6d41\u7a0b\u5168\u90e8\u5b8c\u6210')],
      [bodyCell('\u66ab\u5b58 / \u586b\u5831\u4e2d'), bodyCell(String((Number(tr.draftForms) || 0) + (Number(tr.pendingForms) || 0))), bodyCell('\u9032\u884c\u4e2d')],
      [bodyCell('\u9000\u56de\u66f4\u6b63'), bodyCell(String(tr.returnedForms || 0)), bodyCell('\u9700\u4fee\u6539\u5f8c\u91cd\u65b0\u9001\u51fa')],
      [bodyCell('\u5e73\u5747\u5b8c\u6210\u7387', { bold: true }), bodyCell((tr.avgCompletionRate || 0) + '%', { bold: true }), bodyCell('\u5168\u6821\u6559\u80b2\u8a13\u7df4\u9054\u6210\u7387', { bold: true })]
    ]
  ));

  // ── Section 4: Corrective Action Tracking ──
  children.push(sectionHeading('\u56db\u3001\u77ef\u6b63\u55ae\u8ffd\u8e64'));
  children.push(para('\u76ee\u524d\u958b\u653e\u77ef\u6b63\u55ae ' + openCases + ' \u7b46\uff0c\u5df2\u7d50\u6848 ' + closedCases + ' \u7b46\uff0c\u903e\u671f ' + overdueCases + ' \u7b46\u3002'));
  children.push(styledTable(
    [headerCell('\u72c0\u614b', 30), headerCell('\u6578\u91cf', 20), headerCell('\u4f54\u6bd4', 20), headerCell('\u8aaa\u660e', 30)],
    [
      [bodyCell('\u5f85\u77ef\u6b63'), bodyCell(String(pd.correctivePending || 0)), bodyCell(pctSafe(Number(pd.correctivePending) || 0, openCases)), bodyCell('\u7b49\u5f85\u55ae\u4f4d\u63d0\u51fa\u77ef\u6b63\u63aa\u65bd')],
      [bodyCell('\u5df2\u63d0\u6848'), bodyCell(String(pd.correctiveProposed || 0)), bodyCell(pctSafe(Number(pd.correctiveProposed) || 0, openCases)), bodyCell('\u5df2\u63d0\u51fa\u65b9\u6848\u5f85\u5be9\u6838')],
      [bodyCell('\u8ffd\u8e64\u4e2d'), bodyCell(String(pd.correctiveTracking || 0)), bodyCell(pctSafe(Number(pd.correctiveTracking) || 0, openCases)), bodyCell('\u57f7\u884c\u4e2d\u5f85\u9a57\u8b49')],
      [bodyCell('\u903e\u671f', { color: C.danger }), bodyCell(String(overdueCases), { color: C.danger }), bodyCell('\u2014'), bodyCell('\u5df2\u8d85\u904e\u9810\u5b9a\u5b8c\u6210\u65e5', { color: C.danger })],
      [bodyCell('\u5df2\u7d50\u6848'), bodyCell(String(closedCases)), bodyCell('\u2014'), bodyCell('\u5df2\u5b8c\u6210\u77ef\u6b63\u4e26\u7d50\u6848')],
      [bodyCell('\u958b\u653e\u6848\u4ef6\u7e3d\u6578', { bold: true }), bodyCell(String(openCases), { bold: true }), bodyCell('100%', { bold: true }), bodyCell('\u672a\u7d50\u6848\u77ef\u6b63\u55ae\u7e3d\u6578', { bold: true })]
    ]
  ));

  // Detail table if corrective action details are provided
  if (correctiveDetails.length > 0) {
    children.push(para('\u77ef\u6b63\u55ae\u660e\u7d30\uff08\u524d 20 \u7b46\uff09\uff1a', { bold: true, spaceBefore: 200 }));
    children.push(styledTable(
      [headerCell('\u6848\u4ef6\u7de8\u865f', 20), headerCell('\u55ae\u4f4d', 20), headerCell('\u8655\u7406\u4eba', 15), headerCell('\u72c0\u614b', 15), headerCell('\u5230\u671f\u65e5', 15), headerCell('\u9003\u671f', 15)],
      correctiveDetails.slice(0, 20).map(function (r) {
        var isOverdue = r.corrective_due_date && new Date(r.corrective_due_date) < new Date() && r.status !== '\u7d50\u6848';
        return [
          bodyCell(r.case_id || '\u2014'),
          bodyCell(r.handler_unit || '\u2014'),
          bodyCell(r.handler_name || '\u2014'),
          bodyCell(r.status || '\u2014'),
          bodyCell(r.corrective_due_date ? String(r.corrective_due_date).substring(0, 10) : '\u2014'),
          bodyCell(isOverdue ? '\u662f' : '\u5426', isOverdue ? { color: C.danger } : {})
        ];
      })
    ));
  }

  // ── Section 5: Conclusions and Recommendations ──
  children.push(sectionHeading('\u4e94\u3001\u7d50\u8ad6\u8207\u5efa\u8b70'));

  var conclusions = [];
  // Checklist conclusion
  if (submitted >= total) {
    conclusions.push('\u6aa2\u6838\u8868\u586b\u5831\u5df2\u5168\u6578\u5b8c\u6210\uff0c\u8868\u73fe\u826f\u597d\u3002');
  } else if (submitted / total >= 0.8) {
    conclusions.push('\u6aa2\u6838\u8868\u586b\u5831\u5b8c\u6210\u7387\u9054 ' + pctSafe(submitted, total) + '\uff0c\u5efa\u8b70\u50ac\u8fa6\u5c1a\u672a\u586b\u5831\u4e4b ' + (total - submitted) + ' \u500b\u55ae\u4f4d\u3002');
  } else {
    conclusions.push('\u6aa2\u6838\u8868\u586b\u5831\u5b8c\u6210\u7387\u50c5 ' + pctSafe(submitted, total) + '\uff0c\u5efa\u8b70\u7acb\u5373\u767c\u9001\u50ac\u8fa6\u901a\u77e5\u4e26\u8ffd\u8e64\u63d0\u5347\u3002');
  }
  // Training conclusion
  if (totalForms > 0 && completed / totalForms >= 0.9) {
    conclusions.push('\u6559\u80b2\u8a13\u7df4\u5b8c\u6210\u7387\u512a\u826f\uff0c\u5efa\u8b70\u7dad\u6301\u73fe\u6709\u8a13\u7df4\u6a5f\u5236\u3002');
  } else if (totalForms > 0) {
    conclusions.push('\u6559\u80b2\u8a13\u7df4\u5b8c\u6210\u7387 ' + pctSafe(completed, totalForms) + '\uff0c\u5efa\u8b70\u52a0\u5f37\u63d0\u9192\u4e26\u8ffd\u8e64\u672a\u5b8c\u6210\u55ae\u4f4d\u3002');
  }
  // Corrective action conclusion
  if (openCases === 0) {
    conclusions.push('\u76ee\u524d\u7121\u958b\u653e\u77ef\u6b63\u55ae\uff0c\u77ef\u6b63\u4f5c\u696d\u57f7\u884c\u5b8c\u7562\u3002');
  } else {
    conclusions.push('\u76ee\u524d\u5c1a\u6709 ' + openCases + ' \u7b46\u958b\u653e\u77ef\u6b63\u55ae' + (overdueCases > 0 ? '\uff0c\u5176\u4e2d ' + overdueCases + ' \u7b46\u5df2\u903e\u671f\uff0c\u61c9\u512a\u5148\u8655\u7406' : '') + '\u3002');
  }

  conclusions.forEach(function (text, idx) {
    children.push(para((idx + 1) + '. ' + text, { spaceBefore: idx === 0 ? 100 : 40 }));
  });

  // ── Footer note ──
  children.push(new Paragraph({ spacing: { before: 600 } }));
  children.push(para(
    '\u672c\u5831\u544a\u7531 ISMS \u8cc7\u8a0a\u5b89\u5168\u7ba1\u7406\u7cfb\u7d71\u81ea\u52d5\u7522\u751f\uff0c\u8cc7\u6599\u622a\u81f3 ' + dateStr + '\u3002\u5982\u6709\u7591\u554f\u8acb\u6d3d\u8cc7\u5b89\u7ba1\u7406\u4e2d\u5fc3\u3002',
    { size: 18, color: C.muted, alignment: AlignmentType.CENTER }
  ));

  // ── Create document ──
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children: children
    }]
  });

  const buffer = await Packer.toBuffer(doc);

  if (outputPath) {
    var dir = path.dirname(path.resolve(outputPath));
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(outputPath, buffer);
    console.log('DOCX report saved to:', outputPath);
  }

  return buffer;
}

module.exports = { generateAuditReportDocx };

// CLI usage: node scripts/generate-audit-report-docx.cjs [output.docx]
if (require.main === module) {
  var output = process.argv[2] || 'audit-report-' + new Date().toISOString().slice(0, 10) + '.docx';
  var sampleData = {
    checklist: { totalUnits: 163, submittedUnits: 98, notFiledUnits: 55, draftCount: 10, auditYear: '114' },
    training: { completedForms: 120, draftForms: 15, pendingForms: 8, returnedForms: 3, avgCompletionRate: 82.5 },
    pending: { applicationsPendingReview: 2, activationPending: 1, correctivePending: 3, correctiveProposed: 5, correctiveTracking: 2, correctiveOpenTotal: 10, correctiveOverdue: 2, correctiveClosed: 15, totalPendingItems: 13 },
    correctiveDetails: [
      { case_id: 'NTU-022-IS2-11-F03-114-1', handler_unit: '\u8cc7\u8a0a\u4e2d\u5fc3', handler_name: '\u5f35\u4e09', status: '\u5f85\u77ef\u6b63', corrective_due_date: '2025-03-15' },
      { case_id: 'NTU-022-IS2-11-F03-114-2', handler_unit: '\u7e3d\u52d9\u8655', handler_name: '\u674e\u56db', status: '\u8ffd\u8e64\u4e2d', corrective_due_date: '2025-06-30' }
    ]
  };
  generateAuditReportDocx(sampleData, output).then(function () {
    console.log('Done.');
  }).catch(function (err) {
    console.error('Failed:', err);
    process.exit(1);
  });
}
