const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
        ShadingType, PageNumber, PageBreak, LevelFormat } = require('docx');

// ── Shared helpers ──
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };
const FONT = "Microsoft JhengHei";
const BLUE = "1e40af";
const NAVY = "1e3a5f";

function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: { fill: BLUE, type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: "FFFFFF", font: FONT, size: 22 })] })]
  });
}

function cell(text, width, opts) {
  const runs = [];
  if (opts && opts.bold) {
    runs.push(new TextRun({ text, bold: true, font: FONT, size: 22 }));
  } else if (opts && opts.code) {
    runs.push(new TextRun({ text, font: "Consolas", size: 20 }));
  } else {
    runs.push(new TextRun({ text, font: FONT, size: 22 }));
  }
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts && opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: runs })]
  });
}

function multiLineCell(lines, width, opts) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts && opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    children: lines.map(function (line) {
      return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, font: FONT, size: 22 })] });
    })
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 32, color: BLUE })] });
}

function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 28, color: NAVY })] });
}

function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 24 })] });
}

function p(text) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, font: FONT, size: 22 })] });
}

function pMulti(runs) {
  return new Paragraph({ spacing: { after: 120 }, children: runs });
}

function bold(text) { return new TextRun({ text, bold: true, font: FONT, size: 22 }); }
function normal(text) { return new TextRun({ text, font: FONT, size: 22 }); }
function code(text) { return new TextRun({ text, font: "Consolas", size: 20 }); }

function bulletList(items) {
  return items.map(function (text) {
    return new Paragraph({
      numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 },
      children: [new TextRun({ text, font: FONT, size: 22 })]
    });
  });
}

function bulletListL2(items) {
  return items.map(function (text) {
    return new Paragraph({
      numbering: { reference: "bullets2", level: 0 }, spacing: { after: 60 },
      children: [new TextRun({ text, font: FONT, size: 22 })]
    });
  });
}

function codeBlock(lines) {
  return lines.map(function (line) {
    return new Paragraph({
      spacing: { after: 20 },
      shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
      indent: { left: 360 },
      children: [new TextRun({ text: line, font: "Consolas", size: 18 })]
    });
  });
}

// ── Page sizes (A4) ──
const PAGE_W = 11906;
const PAGE_H = 16838;
const CONTENT_W = 9026; // A4 with 1" margins

// ── Build Document ──
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "bullets2", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [
    // ══════ Cover Page ══════
    {
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 2880, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "\u7B2C ", font: FONT, size: 18 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 }), new TextRun({ text: " \u9801", font: FONT, size: 18 })] })] }) },
      children: [
        new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "\u570B\u7ACB\u81FA\u7063\u5927\u5B78", font: FONT, size: 36, color: BLUE })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 }, children: [new TextRun({ text: "ISMS \u5167\u90E8\u7A3D\u6838\u7BA1\u8003\u8FFD\u8E64\u7CFB\u7D71", font: FONT, size: 48, bold: true, color: BLUE })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 600 }, children: [new TextRun({ text: "\u7CFB\u7D71\u73FE\u6CC1\u6587\u4EF6", font: FONT, size: 40, bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "System Overview Document", font: FONT, size: 28, color: "999999", italics: true })] }),
        new Paragraph({ spacing: { before: 1200 } }),
        new Table({
          width: { size: 5400, type: WidthType.DXA }, columnWidths: [1800, 3600],
          rows: [
            new TableRow({ children: [cell("\u7248\u672C", 1800, { shade: "F0F4FF", bold: true }), cell("1.0", 3600)] }),
            new TableRow({ children: [cell("\u65E5\u671F", 1800, { shade: "F0F4FF", bold: true }), cell("2026 \u5E74 4 \u6708 3 \u65E5", 3600)] }),
            new TableRow({ children: [cell("\u4F5C\u8005", 1800, { shade: "F0F4FF", bold: true }), cell("\u8A08\u7B97\u6A5F\u53CA\u8CC7\u8A0A\u7DB2\u8DEF\u4E2D\u5FC3", 3600)] }),
            new TableRow({ children: [cell("\u6A5F\u5BC6\u7B49\u7D1A", 1800, { shade: "F0F4FF", bold: true }), cell("\u9650\u5167\u90E8\u4F7F\u7528", 3600)] }),
          ]
        }),
      ]
    },

    // ══════ Main Content ══════
    {
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BLUE, space: 4 } }, children: [new TextRun({ text: "ISMS \u5167\u90E8\u7A3D\u6838\u7BA1\u8003\u8FFD\u8E64\u7CFB\u7D71 \u2014 \u7CFB\u7D71\u73FE\u6CC1\u6587\u4EF6 v1.0", font: FONT, size: 18, color: "999999" })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "\u7B2C ", font: FONT, size: 18 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 }), new TextRun({ text: " \u9801", font: FONT, size: 18 })] })] }) },
      children: [

        // ═══════════════════════════════════════════
        // 1. 系統架構總覽
        // ═══════════════════════════════════════════
        h1("1. \u7CFB\u7D71\u67B6\u69CB\u7E3D\u89BD"),

        h2("1.1 \u67B6\u69CB\u5716"),
        p("\u7528\u6236\u700F\u89BD\u5668 \u2192 Caddy Reverse Proxy (80/443) \u2192 Node.js Backend (port 8787) \u2192 PostgreSQL (port 5432)"),
        p("\u6240\u6709\u5143\u4EF6\u90E8\u7F72\u65BC\u540C\u4E00\u53F0 Ubuntu 24.04 VM\uFF0C\u5167\u7DB2\u904B\u4F5C\uFF0C\u4E0D\u9700\u8981\u591A\u53F0\u6A5F\u5668\u3002"),

        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2200, 2200, 4626],
          rows: [
            new TableRow({ children: [headerCell("\u5143\u4EF6", 2200), headerCell("\u6280\u8853", 2200), headerCell("\u8AAA\u660E", 4626)] }),
            new TableRow({ children: [cell("\u524D\u7AEF", 2200), cell("Pure JS SPA", 2200), cell("53 \u500B\u524D\u7AEF\u6A21\u7D44\uFF0CesBuild \u6253\u5305\u6210 core bundle + 5 feature bundles", 4626)] }),
            new TableRow({ children: [cell("\u5F8C\u7AEF", 2200), cell("Node.js 22 LTS", 2200), cell("18 \u500B\u5F8C\u7AEF\u6A21\u7D44\uFF08CJS\u683C\u5F0F\uFF09\uFF0Cserver.cjs \u5165\u53E3\u9EDE", 4626)] }),
            new TableRow({ children: [cell("\u8CC7\u6599\u5EAB", 2200), cell("PostgreSQL 16", 2200), cell("isms_db\uFF0C\u9023\u63A5\u6C60 min=2 / max=10\uFF0C4 \u652F migration", 4626)] }),
            new TableRow({ children: [cell("\u53CD\u5411\u4EE3\u7406", 2200), cell("Caddy 2", 2200), cell("\u81EA\u52D5 TLS + \u8DEF\u7531\u5230 :8787\uFF0C\u975C\u614B\u6A94\u6848\u76F4\u63A5\u670D\u52D9", 4626)] }),
            new TableRow({ children: [cell("\u7A0B\u5E8F\u7BA1\u7406", 2200), cell("systemd", 2200), cell("isms-unit-contact-backend.service\uFF0CRestart=always", 4626)] }),
            new TableRow({ children: [cell("\u90F5\u4EF6\u767C\u9001", 2200), cell("Microsoft Graph", 2200), cell("M365 A3 \u8A02\u95B1\uFF0C\u4EE3\u7406\u6388\u6B0A Token \u767C\u9001\u901A\u77E5\u90F5\u4EF6", 4626)] }),
          ]
        }),

        h2("1.2 VM \u57FA\u672C\u8CC7\u8A0A"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2800, 6226],
          rows: [
            new TableRow({ children: [cell("VM IP", 2800, { shade: "F0F4FF", bold: true }), cell("140.112.97.150", 6226)] }),
            new TableRow({ children: [cell("OS", 2800, { shade: "F0F4FF", bold: true }), cell("Ubuntu 24.04 LTS", 6226)] }),
            new TableRow({ children: [cell("SSH Port", 2800, { shade: "F0F4FF", bold: true }), cell("22", 6226)] }),
            new TableRow({ children: [cell("\u5C08\u6848\u8DEF\u5F91", 2800, { shade: "F0F4FF", bold: true }), cell("/srv/isms-form-redesign", 6226)] }),
            new TableRow({ children: [cell("Node.js \u57F7\u884C\u5E33\u865F", 2800, { shade: "F0F4FF", bold: true }), cell("ismsbackend\uFF08\u7528 sudo -u ismsbackend \u57F7\u884C git/node\uFF09", 6226)] }),
            new TableRow({ children: [cell("Systemd Service", 2800, { shade: "F0F4FF", bold: true }), cell("isms-unit-contact-backend.service", 6226)] }),
            new TableRow({ children: [cell("Log \u8DEF\u5F91", 2800, { shade: "F0F4FF", bold: true }), cell("/srv/isms-form-redesign/logs/campus-backend/", 6226)] }),
          ]
        }),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 2. 目錄結構
        // ═══════════════════════════════════════════
        h1("2. \u5C08\u6848\u76EE\u9304\u7D50\u69CB"),

        ...codeBlock([
          "isms-form-redesign/",
          "\u251C\u2500 m365/campus-backend/        # \u5F8C\u7AEF\u6838\u5FC3\uFF0818 \u500B .cjs \u6A21\u7D44\uFF09",
          "\u2502   \u251C\u2500 server.cjs               # HTTP \u4F3A\u670D\u5668\u4E3B\u5165\u53E3\uFF08\u6240\u6709 API \u8DEF\u7531\uFF09",
          "\u2502   \u251C\u2500 service-host.cjs         # \u670D\u52D9\u555F\u52D5\u8173\u672C + watchdog + \u932F\u8AA4\u544A\u8B66",
          "\u2502   \u251C\u2500 db.cjs                   # PostgreSQL \u9023\u63A5\u6C60\u7BA1\u7406",
          "\u2502   \u251C\u2500 auth-backend.cjs         # JWT \u8A8D\u8B49\u6A21\u7D44",
          "\u2502   \u251C\u2500 checklist-backend.cjs    # \u6AA2\u6838\u8868\u586B\u5831 CRUD",
          "\u2502   \u251C\u2500 training-backend.cjs     # \u6559\u80B2\u8A13\u7DF4\u7D71\u8A08 CRUD",
          "\u2502   \u251C\u2500 corrective-action-backend.cjs  # \u77EF\u6B63\u55AE\u8FFD\u8E64 + \u90F5\u4EF6\u901A\u77E5",
          "\u2502   \u251C\u2500 graph-mailer.cjs         # Microsoft Graph Mail \u5C01\u88DD",
          "\u2502   \u251C\u2500 api-cache.cjs            # \u8A18\u61B6\u9AD4\u5FEB\u53D6\uFF0860s TTL\uFF09",
          "\u2502   \u251C\u2500 error-alerter.cjs        # 5xx \u932F\u8AA4\u6536\u96C6 + 15\u5206\u6279\u6B21\u544A\u8B66",
          "\u2502   \u2514\u2500 migrations/              # 4 \u652F SQL migration",
          "\u251C\u2500 m365-api-client.js           # \u524D\u7AEF API \u5BA2\u6236\u7AEF\uFF08\u6240\u6709 fetch \u547C\u53EB\uFF09",
          "\u251C\u2500 app.js                       # \u524D\u7AEF\u5165\u53E3 + \u7A3D\u6838\u984C\u76EE\u5B9A\u7FA9\uFF0841 \u984C\uFF09",
          "\u251C\u2500 case-module.js               # \u5100\u8868\u677F + \u77EF\u6B63\u55AE\u6A21\u7D44",
          "\u251C\u2500 training-module.js           # \u6559\u80B2\u8A13\u7DF4\u586B\u5831\u6A21\u7D44",
          "\u251C\u2500 checklist-module.js          # \u6AA2\u6838\u8868\u586B\u5831\u6A21\u7D44",
          "\u251C\u2500 units.js                     # \u55AE\u4F4D\u8CC7\u6599\u5169\u968E\u6BB5\u8F09\u5165",
          "\u251C\u2500 styles.css                   # \u4E3B\u6A23\u5F0F\u8868",
          "\u251C\u2500 scripts/                     # \u5EFA\u69CB + \u90E8\u7F72\u8173\u672C",
          "\u251C\u2500 tests/                       # \u6E2C\u8A66\u5957\u4EF6\uFF0872 \u9805\u6E2C\u8A66\uFF09",
          "\u251C\u2500 types/                       # TypeScript \u578B\u5225\u5B9A\u7FA9",
          "\u2514\u2500 docs/                        # \u64CD\u4F5C\u624B\u518A + \u6587\u4EF6",
        ]),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 3. 核心模組說明
        // ═══════════════════════════════════════════
        h1("3. \u6838\u5FC3\u6A21\u7D44\u8AAA\u660E"),

        h2("3.1 \u5F8C\u7AEF\u6A21\u7D44\u4E00\u89BD"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [3200, 5826],
          rows: [
            new TableRow({ children: [headerCell("\u6A21\u7D44", 3200), headerCell("\u529F\u80FD\u8AAA\u660E", 5826)] }),
            new TableRow({ children: [cell("server.cjs", 3200, { code: true }), cell("\u6240\u6709 API \u8DEF\u7531\u8A3B\u518A\u3001\u975C\u614B\u6A94\u6848\u670D\u52D9\u3001CORS\u3001\u901F\u7387\u9650\u5236\uFF08600 req/60s\uFF09", 5826)] }),
            new TableRow({ children: [cell("service-host.cjs", 3200, { code: true }), cell("\u670D\u52D9\u555F\u52D5\u3001runtime config \u8B80\u53D6\u3001\u74B0\u5883\u8B8A\u6578\u6CE8\u5165\u3001watchdog \u5065\u5EB7\u6AA2\u67E5", 5826)] }),
            new TableRow({ children: [cell("db.cjs", 3200, { code: true }), cell("PostgreSQL \u9023\u63A5\u6C60\u3001query/transaction/healthCheck\u3001\u6162\u67E5\u8A62\u8A18\u9304\uFF08>100ms\uFF09", 5826)] }),
            new TableRow({ children: [cell("auth-backend.cjs", 3200, { code: true }), cell("JWT session \u8A8D\u8B49\u3001\u767B\u5165/\u767B\u51FA\u3001session_version \u6A02\u89C0\u9396", 5826)] }),
            new TableRow({ children: [cell("checklist-backend.cjs", 3200, { code: true }), cell("\u6AA2\u6838\u8868 CRUD\u3001\u63D0\u4EA4\u9A57\u8B49\uFF0841 \u984C\u5168\u7B54\uFF09\u3001\u5FEB\u53D6\u5931\u6548", 5826)] }),
            new TableRow({ children: [cell("training-backend.cjs", 3200, { code: true }), cell("\u6559\u80B2\u8A13\u7DF4\u7D71\u8A08\u586B\u5831\u3001Excel/CSV \u532F\u5165\u3001\u5B57\u6BB5\u9A57\u8B49", 5826)] }),
            new TableRow({ children: [cell("corrective-action-backend.cjs", 3200, { code: true }), cell("\u77EF\u6B63\u55AE\u751F\u547D\u9031\u671F\u3001\u72C0\u614B\u8B8A\u66F4\u90F5\u4EF6\u901A\u77E5\u3001\u6279\u6B21\u50AC\u8FA6", 5826)] }),
            new TableRow({ children: [cell("graph-mailer.cjs", 3200, { code: true }), cell("Microsoft Graph Mail API \u5C01\u88DD\u3001HTML \u90F5\u4EF6\u7522\u751F\u5668", 5826)] }),
            new TableRow({ children: [cell("api-cache.cjs", 3200, { code: true }), cell("\u8A18\u61B6\u9AD4\u5FEB\u53D6\uFF0860s TTL\u3001100 \u7B46\u4E0A\u9650\u3001LRU \u6DD8\u6C70\uFF09", 5826)] }),
            new TableRow({ children: [cell("error-alerter.cjs", 3200, { code: true }), cell("5xx \u932F\u8AA4\u6536\u96C6\u3001\u6BCF 15 \u5206\u6279\u6B21\u8A18\u9304\u3001\u540C\u4E00\u932F\u8AA4 1hr \u53BB\u91CD", 5826)] }),
          ]
        }),

        h2("3.2 \u524D\u7AEF\u6A21\u7D44\u4E00\u89BD"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [3200, 5826],
          rows: [
            new TableRow({ children: [headerCell("\u6A21\u7D44", 3200), headerCell("\u529F\u80FD\u8AAA\u660E", 5826)] }),
            new TableRow({ children: [cell("app.js", 3200, { code: true }), cell("\u524D\u7AEF\u5165\u53E3\u3001\u8DEF\u7531\u3001\u7A3D\u6838\u984C\u76EE\u5B9A\u7FA9\uFF0841 \u984C\u00D79 \u5927\u985E\uFF09\u3001\u6A21\u7D44\u8F09\u5165", 5826)] }),
            new TableRow({ children: [cell("m365-api-client.js", 3200, { code: true }), cell("\u6240\u6709 API fetch \u547C\u53EB\u5C01\u88DD\u3001\u932F\u8AA4\u8655\u7406\u3001session \u904E\u671F\u6AA2\u67E5", 5826)] }),
            new TableRow({ children: [cell("case-module.js", 3200, { code: true }), cell("\u5100\u8868\u677F\uFF08\u7D71\u8A08\u5361\u7247 + \u9032\u5EA6\uFF09\u3001\u77EF\u6B63\u55AE\u6E05\u55AE\u3001\u6211\u7684\u5F85\u8FA6\u4E8B\u9805", 5826)] }),
            new TableRow({ children: [cell("checklist-module.js", 3200, { code: true }), cell("\u6AA2\u6838\u8868\u586B\u5831 UI\u3001\u81EA\u52D5\u5B58\u5132\u3001\u63D0\u4EA4\u9A57\u8B49", 5826)] }),
            new TableRow({ children: [cell("training-module.js", 3200, { code: true }), cell("\u6559\u80B2\u8A13\u7DF4\u7D71\u8A08\u586B\u5831\u3001\u532F\u5165\u3001\u9810\u586B\u55AE\u4F4D\u6388\u6B0A", 5826)] }),
            new TableRow({ children: [cell("units.js", 3200, { code: true }), cell("\u55AE\u4F4D\u8CC7\u6599\u5169\u968E\u6BB5\u8F09\u5165\uFF0889KB core + 766KB detail\uFF09", 5826)] }),
            new TableRow({ children: [cell("styles.css", 3200, { code: true }), cell("\u4E3B\u6A23\u5F0F\u8868\u3001\u6DF1\u8272\u6A21\u5F0F\u3001RWD\u3001\u7121\u969C\u7919", 5826)] }),
          ]
        }),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 4. 資料庫
        // ═══════════════════════════════════════════
        h1("4. \u8CC7\u6599\u5EAB"),

        h2("4.1 \u9023\u7DDA\u8CC7\u8A0A"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2800, 6226],
          rows: [
            new TableRow({ children: [cell("\u8CC7\u6599\u5EAB\u540D\u7A31", 2800, { shade: "F0F4FF", bold: true }), cell("isms_db", 6226)] }),
            new TableRow({ children: [cell("\u4F7F\u7528\u8005", 2800, { shade: "F0F4FF", bold: true }), cell("isms_user", 6226)] }),
            new TableRow({ children: [cell("\u9023\u63A5\u6C60", 2800, { shade: "F0F4FF", bold: true }), cell("min=2 / max=10\uFF0Cidle 30s\uFF0Cconnect timeout 5s", 6226)] }),
            new TableRow({ children: [cell("\u5BC6\u78BC\u4F86\u6E90", 2800, { shade: "F0F4FF", bold: true }), cell("runtime.local.json \u4E2D\u7684 postgres.password", 6226)] }),
          ]
        }),

        h2("4.2 \u4E3B\u8981\u8CC7\u6599\u8868"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2800, 6226],
          rows: [
            new TableRow({ children: [headerCell("\u8CC7\u6599\u8868", 2800), headerCell("\u7528\u9014", 6226)] }),
            new TableRow({ children: [cell("system_users", 2800), cell("\u7528\u6236\u5E33\u865F\u3001\u89D2\u8272\u3001session_version\uFF08\u6A02\u89C0\u9396\uFF09", 6226)] }),
            new TableRow({ children: [cell("unit_contact_applications", 2800), cell("\u55AE\u4F4D\u7BA1\u7406\u54E1\u7533\u8ACB\u55AE\uFF08\u5BE9\u6838\u6D41\u7A0B\uFF09", 6226)] }),
            new TableRow({ children: [cell("checklists", 2800), cell("\u5E74\u5EA6\u6AA2\u6838\u8868\u586B\u5831\uFF0841 \u984C\u00D79 \u985E\uFF09", 6226)] }),
            new TableRow({ children: [cell("training_forms", 2800), cell("\u6559\u80B2\u8A13\u7DF4\u7D71\u8A08\u8868\u55AE", 6226)] }),
            new TableRow({ children: [cell("corrective_actions", 2800), cell("\u77EF\u6B63\u55AE\uFF08\u72C0\u614B\u6A5F\u3001\u5230\u671F\u8FFD\u8E64\uFF09", 6226)] }),
            new TableRow({ children: [cell("ops_audit", 2800), cell("\u64CD\u4F5C\u7A3D\u6838\u8ECC\u8DE1\uFF08\u8AB0\u5728\u4F55\u6642\u505A\u4E86\u4EC0\u9EBC\uFF09", 6226)] }),
            new TableRow({ children: [cell("error_logs", 2800), cell("\u7CFB\u7D71\u932F\u8AA4\u65E5\u8A8C\uFF08\u4F9B\u544A\u8B66\u6A21\u7D44\u6AA2\u7D22\uFF09", 6226)] }),
          ]
        }),

        h2("4.3 Migration"),
        p("\u8CC7\u6599\u5EAB\u904E\u7248\u8173\u672C\u4F4D\u65BC m365/campus-backend/migrations/\uFF1A"),
        ...bulletList([
          "001-initial-schema.sql \u2014 \u57FA\u790E schema\uFF08users, applications, checklists, training, corrective_actions\uFF09",
          "002-schema-adjustments.sql \u2014 \u6B04\u4F4D\u8ABF\u6574\u3001\u7D22\u5F15\u512A\u5316",
          "003-add-constraints.sql \u2014 \u5916\u9375\u7D04\u675F\u3001\u552F\u4E00\u6027\u7D04\u675F",
          "004-add-row-version.sql \u2014 row_version \u6B04\u4F4D\uFF08\u6A02\u89C0\u9396\uFF09",
        ]),
        p("\u57F7\u884C\u65B9\u5F0F\uFF1Apsql -U isms_user -d isms_db -f migrations/00X-xxx.sql"),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 5. 認證與安全
        // ═══════════════════════════════════════════
        h1("5. \u8A8D\u8B49\u8207\u5B89\u5168"),

        h2("5.1 \u8A8D\u8B49\u6A5F\u5236"),
        ...bulletList([
          "\u767B\u5165\u65B9\u5F0F\uFF1A\u5E33\u865F\u5BC6\u78BC\uFF0C\u5F8C\u7AEF\u7522\u751F JWT token",
          "Session \u7BA1\u7406\uFF1Asession_version \u6B04\u4F4D\u5BE6\u73FE\u6A02\u89C0\u9396\uFF0C\u6BCF\u6B21\u767B\u5165\u905E\u589E",
          "Token \u904E\u671F\uFF1A\u524D\u7AEF\u81EA\u52D5\u5075\u6E2C 401 \u8DDF\u8F49\u767B\u5165\u9801",
          "Session Secret\uFF1A\u81F3\u5C11 16 \u5B57\u5143\uFF0C\u5F9E runtime.local.json \u8B80\u53D6",
        ]),

        h2("5.2 \u89D2\u8272\u6B0A\u9650"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2400, 2400, 4226],
          rows: [
            new TableRow({ children: [headerCell("\u89D2\u8272", 2400), headerCell("\u8B58\u5225\u78BC", 2400), headerCell("\u53EF\u5B58\u53D6\u7BC4\u570D", 4226)] }),
            new TableRow({ children: [cell("\u6700\u9AD8\u7BA1\u7406\u8005", 2400), cell("admin", 2400), cell("\u5168\u90E8\u6A21\u7D44\u3001\u5168\u90E8\u55AE\u4F4D\u8CC7\u6599\u3001\u5E33\u865F\u7BA1\u7406\u3001\u958B\u55AE\u3001\u5BE9\u6838", 4226)] }),
            new TableRow({ children: [cell("\u55AE\u4F4D\u7BA1\u7406\u54E1", 2400), cell("unit_admin", 2400), cell("\u50C5\u672C\u55AE\u4F4D\u8CC7\u6599\uFF1A\u6AA2\u6838\u8868\u586B\u5831\u3001\u8A13\u7DF4\u7D71\u8A08\u3001\u77EF\u6B63\u55AE\u56DE\u8986", 4226)] }),
            new TableRow({ children: [cell("\u516C\u958B\u7533\u8ACB\u4EBA", 2400), cell("(\u672A\u767B\u5165)", 2400), cell("\u50C5\u7533\u8ACB\u9801\u9762", 4226)] }),
          ]
        }),

        h2("5.3 \u5B89\u5168\u8A2D\u8A08"),
        ...bulletList([
          "CORS \u767D\u540D\u55AE\uFF1A\u53EA\u5141\u8A31\u6307\u5B9A\u4F86\u6E90\u5B58\u53D6 API",
          "\u901F\u7387\u9650\u5236\uFF1A600 \u6B21\u8ACB\u6C42/60 \u79D2\uFF0C\u8D85\u904E\u5373\u8FD4\u56DE 429",
          "\u8F38\u5165\u9A57\u8B49\uFF1A\u6240\u6709 API \u53C3\u6578\u5F8C\u7AEF\u9A57\u8B49\u3001SQL \u53C3\u6578\u5316\u67E5\u8A62",
          "\u6A94\u6848\u4E0A\u50B3\uFF1A\u526F\u6A94\u540D\u9A57\u8B49\u3001\u5927\u5C0F\u9650\u5236\u3001\u5B58\u5132\u65BC\u78C1\u789F\uFF08\u975E DB\uFF09",
          "\u5BC6\u78BC\u5B89\u5168\uFF1Abcrypt \u96DC\u6E4A\u5B58\u5132\uFF0C\u4E0D\u5132\u660E\u6587",
        ]),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 6. 部署與運維
        // ═══════════════════════════════════════════
        h1("6. \u90E8\u7F72\u8207\u904B\u7DAD"),

        h2("6.1 \u90E8\u7F72\u6D41\u7A0B"),
        p("\u6A19\u6E96\u90E8\u7F72\u6D41\u7A0B\uFF08\u672C\u6A5F\u63A8\u9001\u81F3 VM\uFF09\uFF1A"),
        ...codeBlock([
          "1. \u672C\u6A5F\u57F7\u884C npm run build         # esbuild \u6253\u5305\u524D\u7AEF",
          "2. git add + git commit + git push      # \u63A8\u9001\u81F3 GitHub",
          "3. SSH \u9032\u5165 VM\uFF0Csudo -u ismsbackend bash",
          "4. cd /srv/isms-form-redesign && git pull origin main",
          "5. sudo systemctl restart isms-unit-contact-backend.service",
          "6. \u9A57\u8B49\uFF1Acurl http://127.0.0.1:8787/api/auth/health",
        ]),

        h2("6.2 \u81EA\u52D5\u5316\u90E8\u7F72"),
        p("\u53EF\u7528 PowerShell SSH.NET \u8173\u672C\u4E00\u9375\u90E8\u7F72\uFF08\u4F7F\u7528 useradmin \u5E33\u865F SSH\u3001sudo -u ismsbackend \u57F7\u884C git pull\u3001\u518D restart service\uFF09\u3002"),

        h2("6.3 \u7CFB\u7D71\u81EA\u7592\u6A5F\u5236"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2800, 6226],
          rows: [
            new TableRow({ children: [headerCell("\u6A5F\u5236", 2800), headerCell("\u8AAA\u660E", 6226)] }),
            new TableRow({ children: [cell("systemd Restart=always", 2800), cell("\u7A0B\u5E8F\u5D29\u6F70\u5F8C\u81EA\u52D5\u91CD\u555F\uFF0CRestartSec=5", 6226)] }),
            new TableRow({ children: [cell("Health Watchdog", 2800), cell("\u6BCF 5 \u5206\u81EA\u6AA2 /api/auth/health\uFF0C\u9023\u7E8C 3 \u6B21\u5931\u6557\u5373 exit\uFF08\u7531 systemd \u91CD\u555F\uFF09", 6226)] }),
            new TableRow({ children: [cell("Crash Logger", 2800), cell("uncaughtException / unhandledRejection \u5168\u90E8\u5BEB\u5165\u65E5\u8A8C\u6A94", 6226)] }),
            new TableRow({ children: [cell("Error Alerter", 2800), cell("5xx \u932F\u8AA4\u6BCF 15 \u5206\u6279\u6B21\u5BEB\u5165 ops_audit \u8CC7\u6599\u8868", 6226)] }),
            new TableRow({ children: [cell("\u904E\u671F\u63D0\u9192", 2800), cell("\u6BCF 24 \u5C0F\u6642\u6AA2\u67E5\u903E\u671F\u77EF\u6B63\u55AE\uFF0C\u8A18\u9304\u81F3\u65E5\u8A8C", 6226)] }),
          ]
        }),

        h2("6.4 \u8A18\u9304\u6A94\u4F4D\u7F6E"),
        ...bulletList([
          "\u61C9\u7528\u65E5\u8A8C\uFF1A/srv/isms-form-redesign/logs/campus-backend/unit-contact-campus-backend.log",
          "Systemd \u65E5\u8A8C\uFF1Ajournalctl -u isms-unit-contact-backend.service -f",
          "Caddy \u65E5\u8A8C\uFF1Ajournalctl -u caddy -f",
          "PostgreSQL \u65E5\u8A8C\uFF1A/var/log/postgresql/",
        ]),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 7. 常見問題排除
        // ═══════════════════════════════════════════
        h1("7. \u5E38\u898B\u554F\u984C\u6392\u9664"),

        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2600, 3200, 3226],
          rows: [
            new TableRow({ children: [headerCell("\u75C7\u72C0", 2600), headerCell("\u53EF\u80FD\u539F\u56E0", 3200), headerCell("\u89E3\u6C7A\u65B9\u6CD5", 3226)] }),
            new TableRow({ children: [
              cell("\u767B\u5165\u5F8C\u6240\u6709 API \u56DE 401", 2600),
              cell("session_version \u4E0D\u5339\u914D\uFF08DB \u8207 token \u4E0D\u540C\u6B65\uFF09", 3200),
              cell("psql \u4E2D\u57F7\u884C UPDATE system_users SET session_version = (token \u4E2D\u7684\u7248\u672C) WHERE username = ...", 3226)
            ] }),
            new TableRow({ children: [
              cell("\u670D\u52D9\u555F\u52D5\u5373\u5D29\u6F70", 2600),
              cell("runtime.local.json \u7F3A\u5C11\u5FC5\u8981\u6B04\u4F4D", 3200),
              cell("\u6AA2\u67E5 PG_DATABASE\u3001PG_USER\u3001PG_PASSWORD\u3001AUTH_SESSION_SECRET", 3226)
            ] }),
            new TableRow({ children: [
              cell("\u524D\u7AEF\u986F\u793A\u820A\u7248\u672C", 2600),
              cell("esbuild bundle \u672A\u66F4\u65B0", 3200),
              cell("\u672C\u6A5F npm run build \u5F8C\u91CD\u65B0 git push", 3226)
            ] }),
            new TableRow({ children: [
              cell("\u90F5\u4EF6\u767C\u4E0D\u51FA\u53BB", 2600),
              cell("Graph Mail token \u904E\u671F\u6216\u672A\u8A2D\u5B9A", 3200),
              cell("\u6AA2\u67E5 M365_A3_TOKEN_MODE \u8207 GRAPH_MAIL_SENDER_UPN \u8A2D\u5B9A", 3226)
            ] }),
            new TableRow({ children: [
              cell("Watchdog \u5831 timeout", 2600),
              cell("Node.js \u7A0B\u5E8F\u5361\u6B7B\u6216 DB \u9023\u63A5\u6EFF", 3200),
              cell("\u6AA2\u67E5 journalctl \u65E5\u8A8C + pg_stat_activity", 3226)
            ] }),
            new TableRow({ children: [
              cell("\u6AA2\u6838\u8868\u63D0\u4EA4\u5931\u6557", 2600),
              cell("\u672A\u5168\u90E8\u4F5C\u7B54\uFF0841 \u984C\uFF09", 3200),
              cell("\u524D\u7AEF\u6703\u986F\u793A\u672A\u7B54\u984C\u6578\uFF0C\u8ACB\u55AE\u4F4D\u88DC\u7B54\u5F8C\u518D\u63D0\u4EA4", 3226)
            ] }),
          ]
        }),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 8. 測試架構
        // ═══════════════════════════════════════════
        h1("8. \u6E2C\u8A66\u67B6\u69CB"),

        h2("8.1 \u6E2C\u8A66\u5957\u4EF6\u7E3D\u89BD"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [3200, 1600, 4226],
          rows: [
            new TableRow({ children: [headerCell("\u6E2C\u8A66\u6A94\u6848", 3200), headerCell("\u6E2C\u8A66\u6578", 1600), headerCell("\u6DB5\u84CB\u7BC4\u570D", 4226)] }),
            new TableRow({ children: [cell("comprehensive-test-suite.cjs", 3200, { code: true }), cell("72", 1600), cell("6 \u5927\u985E\uFF1A\u7D93\u71DF\u3001\u6B0A\u9650\u3001\u908A\u754C\u3001\u8DE8\u700F\u89BD\u5668\u3001\u4E00\u81F4\u6027\u3001\u8FF4\u6B78", 4226)] }),
            new TableRow({ children: [cell("e2e-playwright.cjs", 3200, { code: true }), cell("30", 1600), cell("5 \u500B\u4E3B\u8981\u6D41\u7A0B\u7684\u700F\u89BD\u5668\u81EA\u52D5\u5316\u6E2C\u8A66", 4226)] }),
            new TableRow({ children: [cell("e2e-core-flows.cjs", 3200, { code: true }), cell("18", 1600), cell("API \u5C64\u7D1A\u7684\u7AEF\u5230\u7AEF\u6E2C\u8A66", 4226)] }),
          ]
        }),

        h2("8.2 \u57F7\u884C\u65B9\u5F0F"),
        ...codeBlock([
          "npm test                           # \u55AE\u5143\u6E2C\u8A66\uFF08Jest\uFF09",
          "npm run test:ci                    # CI gate \u6E2C\u8A66",
          "node tests/e2e-core-flows.cjs      # API E2E \u6E2C\u8A66",
          "node tests/e2e-playwright.cjs      # \u700F\u89BD\u5668 E2E \u6E2C\u8A66",
          "node tests/comprehensive-test-suite.cjs  # 72 \u9805\u5168\u9762\u6E2C\u8A66",
        ]),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 9. Runtime 設定
        // ═══════════════════════════════════════════
        h1("9. Runtime \u8A2D\u5B9A\u6A94\u8AAA\u660E"),

        p("\u670D\u52D9\u555F\u52D5\u6642\u6703\u4F9D\u5E8F\u5C0B\u627E\u4EE5\u4E0B\u8DEF\u5F91\u7684 runtime config\uFF1A"),
        ...codeBlock([
          "1. \u547D\u4EE4\u5217\u53C3\u6578 process.argv[2]",
          "2. \u74B0\u5883\u8B8A\u6578 UNIT_CONTACT_BACKEND_RUNTIME_CONFIG",
          "3. .runtime/runtime.local.host.json",
          "4. m365/campus-backend/runtime.local.json",
        ]),

        h2("9.1 \u8A2D\u5B9A\u6A94\u7D50\u69CB\u7BC4\u4F8B"),
        ...codeBlock([
          "{",
          "  \"authSessionSecret\": \"(\u81F3\u5C11 16 \u5B57\u5143)\",",
          "  \"port\": 8787,",
          "  \"tokenMode\": \"delegated\",",
          "  \"allowedOrigins\": [\"https://your-domain.ntu.edu.tw\"],",
          "  \"mailSenderUpn\": \"sender@ntu.edu.tw\",",
          "  \"postgres\": {",
          "    \"host\": \"127.0.0.1\",",
          "    \"port\": 5432,",
          "    \"database\": \"isms_db\",",
          "    \"user\": \"isms_user\",",
          "    \"password\": \"(your-password)\"",
          "  },",
          "  \"attachmentsDir\": \"/srv/isms-form-redesign/attachments\",",
          "  \"logDir\": \"/srv/isms-form-redesign/logs/campus-backend\"",
          "}",
        ]),

        h2("9.2 \u5FC5\u8981\u74B0\u5883\u8B8A\u6578"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [3600, 5426],
          rows: [
            new TableRow({ children: [headerCell("\u8B8A\u6578\u540D\u7A31", 3600), headerCell("\u8AAA\u660E", 5426)] }),
            new TableRow({ children: [cell("AUTH_SESSION_SECRET", 3600, { code: true }), cell("JWT \u7C3D\u540D\u5BC6\u9470\uFF0C\u81F3\u5C11 16 \u5B57\u5143", 5426)] }),
            new TableRow({ children: [cell("PG_DATABASE", 3600, { code: true }), cell("PostgreSQL \u8CC7\u6599\u5EAB\u540D\u7A31", 5426)] }),
            new TableRow({ children: [cell("PG_USER", 3600, { code: true }), cell("PostgreSQL \u4F7F\u7528\u8005", 5426)] }),
            new TableRow({ children: [cell("PG_PASSWORD", 3600, { code: true }), cell("PostgreSQL \u5BC6\u78BC", 5426)] }),
            new TableRow({ children: [cell("M365_A3_TOKEN_MODE", 3600, { code: true }), cell("Graph Mail \u6388\u6B0A\u6A21\u5F0F\uFF08delegated / application\uFF09", 5426)] }),
            new TableRow({ children: [cell("GRAPH_MAIL_SENDER_UPN", 3600, { code: true }), cell("\u90F5\u4EF6\u767C\u9001\u8005 UPN\uFF08\u5982 noreply@ntu.edu.tw\uFF09", 5426)] }),
          ]
        }),

        new PageBreak(),

        // ═══════════════════════════════════════════
        // 10. 聯絡資訊
        // ═══════════════════════════════════════════
        h1("10. \u806F\u7D61\u8CC7\u8A0A\u8207\u4EA4\u63A5\u4E8B\u9805"),

        h2("10.1 \u7CFB\u7D71\u7BA1\u7406\u54E1"),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [2200, 6826],
          rows: [
            new TableRow({ children: [cell("\u7BA1\u7406\u55AE\u4F4D", 2200, { shade: "F0F4FF", bold: true }), cell("\u8A08\u7B97\u6A5F\u53CA\u8CC7\u8A0A\u7DB2\u8DEF\u4E2D\u5FC3 \u2014 \u8CC7\u901A\u5B89\u5168\u7BA1\u7406\u4E2D\u5FC3", 6826)] }),
            new TableRow({ children: [cell("\u7CFB\u7D71\u7DB2\u5740", 2200, { shade: "F0F4FF", bold: true }), cell("https://140.112.97.150 \uFF08\u5167\u7DB2\uFF09", 6826)] }),
            new TableRow({ children: [cell("GitHub Repo", 2200, { shade: "F0F4FF", bold: true }), cell("(private repository)", 6826)] }),
          ]
        }),

        h2("10.2 \u4EA4\u63A5\u6E05\u55AE"),
        p("\u65B0\u63A5\u624B\u4EBA\u54E1\u9700\u78BA\u8A8D\u4EE5\u4E0B\u4E8B\u9805\uFF1A"),
        ...bulletList([
          "VM SSH \u5B58\u53D6\u6B0A\u9650\uFF08useradmin \u5E33\u865F\uFF09",
          "PostgreSQL \u8CC7\u6599\u5EAB\u5BC6\u78BC\uFF08runtime.local.json\uFF09",
          "GitHub \u5132\u5B58\u5EAB\u5B58\u53D6\u6B0A\u9650",
          "Microsoft 365 A3 \u8A02\u95B1 Graph Mail \u6388\u6B0A\u8A2D\u5B9A",
          "\u4E86\u89E3\u5E74\u5EA6\u7A3D\u6838\u6D41\u7A0B\uFF08\u53C3\u8003\u64CD\u4F5C\u624B\u518A\uFF09",
          "\u719F\u6089 163 \u500B\u4E00\u7D1A\u55AE\u4F4D / 667 \u500B\u4E8C\u7D1A\u55AE\u4F4D\u7684\u7D44\u7E54\u67B6\u69CB",
        ]),

        // ── Document end ──
        new Paragraph({ spacing: { before: 600 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: BLUE, space: 8 } }, children: [] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "\u2014 \u6587\u4EF6\u7D50\u675F \u2014", font: FONT, size: 20, color: "999999" })] }),
      ]
    }
  ]
});

// ── Generate ──
const outPath = require('path').join(__dirname, 'ISMS-\u7CFB\u7D71\u73FE\u6CC1\u6587\u4EF6.docx');
Packer.toBuffer(doc).then(function (buffer) {
  fs.writeFileSync(outPath, buffer);
  console.log('Generated: ' + outPath + ' (' + Math.round(buffer.length / 1024) + ' KB)');
}).catch(function (err) {
  console.error('Build failed:', err);
  process.exit(1);
});
