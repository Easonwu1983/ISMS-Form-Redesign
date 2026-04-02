const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
        ShadingType, PageNumber, PageBreak, LevelFormat, ExternalHyperlink } = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: { fill: "1e40af", type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Microsoft JhengHei", size: 22 })] })]
  });
}

function cell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, font: "Microsoft JhengHei", size: 22 })] })]
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, font: "Microsoft JhengHei", size: 32, color: "1e40af" })] });
}

function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, font: "Microsoft JhengHei", size: 28, color: "1e3a5f" })] });
}

function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, font: "Microsoft JhengHei", size: 24 })] });
}

function p(text) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, font: "Microsoft JhengHei", size: 22 })] });
}

function bold(text) {
  return new TextRun({ text, bold: true, font: "Microsoft JhengHei", size: 22 });
}

function normal(text) {
  return new TextRun({ text, font: "Microsoft JhengHei", size: 22 });
}

function bulletList(items) {
  return items.map(function (text) {
    return new Paragraph({
      numbering: { reference: "bullets", level: 0 },
      spacing: { after: 60 },
      children: [new TextRun({ text, font: "Microsoft JhengHei", size: 22 })]
    });
  });
}

function numberList(items) {
  return items.map(function (text) {
    return new Paragraph({
      numbering: { reference: "numbers", level: 0 },
      spacing: { after: 60 },
      children: [new TextRun({ text, font: "Microsoft JhengHei", size: 22 })]
    });
  });
}

const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers3", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers4", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers5", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [
    // ══ Cover Page ══
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 2880, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "第 ", font: "Microsoft JhengHei", size: 18 }), new TextRun({ children: [PageNumber.CURRENT], font: "Microsoft JhengHei", size: 18 }), new TextRun({ text: " 頁", font: "Microsoft JhengHei", size: 18 })] })] }) },
      children: [
        new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "國立臺灣大學", font: "Microsoft JhengHei", size: 36, color: "1e40af" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 }, children: [new TextRun({ text: "資通安全內部稽核管考追蹤系統", font: "Microsoft JhengHei", size: 48, bold: true, color: "1e40af" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 600 }, children: [new TextRun({ text: "操作手冊", font: "Microsoft JhengHei", size: 40, bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 }, children: [new TextRun({ text: "版本：1.0", font: "Microsoft JhengHei", size: 24, color: "666666" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "日期：2026 年 4 月 3 日", font: "Microsoft JhengHei", size: 24, color: "666666" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1600 }, children: [new TextRun({ text: "計算機及資訊網路中心", font: "Microsoft JhengHei", size: 24, color: "999999" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "資通安全管理中心 製作", font: "Microsoft JhengHei", size: 24, color: "999999" })] }),
      ]
    },
    // ══ Main Content ══
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "1e40af", space: 4 } }, children: [new TextRun({ text: "ISMS 內部稽核管考追蹤系統 — 操作手冊 v1.0", font: "Microsoft JhengHei", size: 18, color: "999999" })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "第 ", font: "Microsoft JhengHei", size: 18 }), new TextRun({ children: [PageNumber.CURRENT], font: "Microsoft JhengHei", size: 18 }), new TextRun({ text: " 頁", font: "Microsoft JhengHei", size: 18 })] })] }) },
      children: [
        // ── 1. 系統簡介 ──
        h1("1. 系統簡介"),
        h2("1.1 系統用途"),
        p("本系統為臺大依《資通安全管理法》每年執行內部稽核的線上管考平台，涵蓋全校 163 個一級單位、667 個二級單位。系統提供檢核表填報、教育訓練統計、矯正單追蹤等功能，讓管理者集中管考、各單位資安窗口線上填報。"),
        h2("1.2 三種使用者角色"),
        new Table({
          width: { size: 9026, type: WidthType.DXA }, columnWidths: [2400, 6626],
          rows: [
            new TableRow({ children: [headerCell("角色", 2400), headerCell("職責", 6626)] }),
            new TableRow({ children: [cell("最高管理者", 2400), cell("管理帳號、審核申請、匯入名單、開立矯正單、追蹤進度", 6626)] }),
            new TableRow({ children: [cell("單位管理員（資安窗口）", 2400), cell("填報檢核表（40 題）、填報教育訓練統計、回覆矯正單", 6626)] }),
            new TableRow({ children: [cell("公開申請人", 2400), cell("申請單位管理人帳號、上傳授權同意書", 6626)] }),
          ]
        }),
        h2("1.3 系統網址"),
        ...bulletList(["校內網址：http://140.112.97.150", "備援網址：https://isms-campus-portal.pages.dev"]),

        // ── 2. 帳號申請與登入 ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("2. 帳號申請與登入"),
        h2("2.1 申請新帳號"),
        ...numberList([
          "開啟系統網址，點擊登入頁下方的「前往申請」",
          "填寫申請單位（搜尋或從下拉選擇）、申請人姓名、分機、電子郵件",
          "勾選資安角色（一級或二級單位資安窗口）",
          "下載「授權同意書 PDF」，請單位主管簽章",
          "上傳簽章後的同意書（支援 PDF、JPG、PNG，可用手機拍照上傳）",
          "點「送出申請」，等待管理者審核",
        ]),
        h2("2.2 登入系統"),
        ...numberList(["輸入帳號和密碼", "首次登入會要求變更密碼（至少 8 碼，含大小寫、數字）", "登入後看到儀表板"]),
        h2("2.3 忘記密碼"),
        p("點擊登入頁下方「忘記密碼？」，輸入電子郵件，系統會寄送重設連結。"),

        // ── 3. 填報檢核表 ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("3. 填報檢核表（單位管理員）"),
        h2("3.1 進入填報"),
        ...bulletList(["登入後，左側選單點「填報檢核表」", "或在儀表板待辦事項中直接點「繼續填報」"]),
        h2("3.2 填報 40 題"),
        p("共 9 大類、40 題，每題需填寫："),
        ...bulletList([
          "符合程度：符合 / 部分符合 / 不符合 / 不適用",
          "執行情形說明：描述實際執行狀況",
          "佐證資料說明：列出可佐證的文件或紀錄",
          "附件上傳（選填）：支援 JPG、PNG、PDF",
        ]),
        p("右側目錄可快速跳轉到指定大類。右側即時顯示填報進度（0/40 → 40/40）。"),
        h2("3.3 儲存與送出"),
        ...bulletList([
          "儲存草稿：隨時可按「儲存草稿」保存進度，系統也會每 60 秒自動儲存",
          "送出：40 題全部填完後才能送出。送出後無法修改（除非被管理者退回）",
          "如果關閉瀏覽器未儲存，系統會跳出警告",
        ]),

        // ── 4. 填報教育訓練 ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("4. 填報教育訓練（單位管理員）"),
        h2("4.1 進入填報"),
        ...bulletList(["左側選單點「資安教育訓練統計」→「新增填報」", "系統自動載入您單位的人員名單"]),
        h2("4.2 填寫每位人員的訓練紀錄"),
        p("每位人員需填寫："),
        ...bulletList([
          "在職狀態",
          "資安通識（1 年 3 小時）：是/否",
          "資訊人員（含承辦委外資通系統）：時數",
          "資安專業課程（1 年 3 小時）：時數",
        ]),
        new Paragraph({ spacing: { before: 120, after: 120 }, children: [bold("批次操作："), normal("可勾選多人 → 套用相同的在職狀態或通識結果")] }),
        h2("4.3 三步驟送出流程"),
        ...numberList(["流程一：完成填報 → 按「完成流程一並進入簽核」", "流程二：列印核表 → 請主管簽章", "流程三：上傳簽章核表 → 完成填報"]),

        // ── 5. 矯正單處理 ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("5. 矯正單處理（單位管理員）"),
        h2("5.1 收到矯正單"),
        ...bulletList(["管理者開立矯正單後，您會收到 Email 通知（含直接連結）", "登入系統後，儀表板待辦事項會顯示待回覆的矯正單"]),
        h2("5.2 填寫矯正措施"),
        ...numberList(["點進矯正單詳細頁", "填寫矯正措施、根因分析、根除措施", "上傳佐證附件（改善證據）", "按「送出提案」"]),
        h2("5.3 追蹤與結案"),
        ...bulletList(["管理者審核後可能：通過 → 追蹤 → 結案，或退回修改", "追蹤階段需定期提交追蹤報告", "結案後該矯正單流程結束"]),

        // ── 6. 管理者操作 ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("6. 管理者操作"),
        h2("6.1 儀表板"),
        ...bulletList(["年度稽核進度總覽（填報率、訓練完成率、待處理事項）", "紅黃綠燈號指示各項目進度", "可切換年度（115/114/113）"]),
        h2("6.2 帳號管理"),
        ...bulletList(["新增/編輯/刪除使用者", "設定資安角色（一級/二級窗口）", "重設密碼"]),
        h2("6.3 審核申請"),
        ...bulletList(["審核單位管理人帳號申請", "通過 → 系統自動建立帳號並寄送登入資訊", "退回/拒絕 → 附註原因"]),
        h2("6.4 開立矯正單"),
        ...bulletList(["指定缺失類型、來源、處理單位與人員", "系統自動寄通知信給處理人員"]),
        h2("6.5 匯出報表"),
        ...bulletList(["矯正單 CSV 匯出", "教育訓練 CSV 匯出", "年度稽核報告 PDF 下載"]),

        // ── 7. 常見問題 ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("7. 常見問題"),
        h3("Q1: 登入後看到「系統帳號後端尚未就緒」"),
        p("A: 請清除瀏覽器的 localStorage（F12 → Application → Local Storage → 清除），然後重新登入。"),
        h3("Q2: 填報檢核表時進度一直是 0%"),
        p("A: 每題都需要選擇「符合程度」（4 選 1），選完後進度才會更新。"),
        h3("Q3: 上傳附件失敗"),
        p("A: 確認檔案大小在 5MB 以內，格式為 PDF、JPG 或 PNG。"),
        h3("Q4: 收不到系統通知信"),
        p("A: 請確認 Email 地址正確，並檢查垃圾郵件匣。"),
        h3("Q5: 手機可以填報嗎？"),
        p("A: 可以。系統支援手機瀏覽器，檢核表會自動切換為直式排版。"),
        h3("Q6: 忘記密碼怎麼辦？"),
        p("A: 點登入頁下方「忘記密碼？」，或聯繫管理者重設。"),

        // Footer
        new Paragraph({ spacing: { before: 600 }, border: { top: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC", space: 8 } }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "© 2026 國立臺灣大學 計算機及資訊網路中心 — 資通安全管理中心 製作", font: "Microsoft JhengHei", size: 18, color: "999999" })] }),
      ]
    }
  ]
});

Packer.toBuffer(doc).then(function (buffer) {
  const outputPath = process.argv[2] || 'docs/ISMS-操作手冊.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log('✅ 操作手冊已產生：' + outputPath + ' (' + Math.round(buffer.length / 1024) + ' KB)');
}).catch(function (err) {
  console.error('❌ 產生失敗：', err);
  process.exit(1);
});
