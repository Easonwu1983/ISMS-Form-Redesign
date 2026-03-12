from __future__ import annotations

from pathlib import Path
from html import escape

import markdown as md
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


def ensure_fonts() -> None:
    for font_name in ("MSung-Light", "HeiseiKakuGo-W5"):
        try:
            pdfmetrics.registerFont(UnicodeCIDFont(font_name))
        except Exception:
            pass


GUIDE_MD = """# 校內同事測試說明

- 更新日期：2026-03-12
- 適用對象：
  - 校內測試同事
  - 單位管理員
  - 最高管理員

## 測試網址

- 系統首頁：
  - `http://140.112.3.65:8088/`
- 健康檢查：
  - `http://140.112.3.65:8088/api/unit-contact/health`

## 連線限制

- 本系統目前僅允許：
  - `140.112.0.0/16`
  - `2001:288:` 開頭的校內 IPv6
- 若你不是從校內網路或校內 VPN 進入，會看到「此系統僅開放校內網路存取」。

## 測試帳號

- 最高管理員：
  - 帳號：`admin`
  - 密碼：`admin123`
- 單位管理員：
  - 帳號：`unit1`
  - 密碼：`unit123`
- 稽核室管理員：
  - 帳號：`unit2`
  - 密碼：`unit123`
- 填報人：
  - 帳號：`user1`
  - 密碼：`user123`
- 跨單位檢視者：
  - 帳號：`viewer1`
  - 密碼：`viewer123`

## 建議測試順序

1. 開啟首頁並確認可正常登入
2. 先用 `user1` 測試填報流程
3. 再用 `unit1` 測試審核與追蹤流程
4. 最後用 `admin` 檢查全域管理功能

## 測試項目

### 1. 填報人流程

- 使用 `user1 / user123` 登入
- 進入「矯正單列表」
- 找一筆 `待矯正` 或 `追蹤中` 的案件
- 驗證：
  - 可回覆初步矯正措施
  - 可上傳佐證附件
  - 若案件為 `追蹤中`，可提報追蹤結果
  - 選 `建議持續追蹤` 時會要求填下一次追蹤日期
  - 選 `擬請同意結案` 時會要求上傳佐證

### 2. 單位管理員流程

- 使用 `unit1 / unit123` 登入
- 驗證：
  - 可開立矯正單
  - 可指定處理人員
  - 可審核填報人回覆
  - 可將案件轉入 `追蹤中`
  - 可審核追蹤提報並決定結案或續追

### 3. 最高管理員流程

- 使用 `admin / admin123` 登入
- 驗證：
  - 可看到儀表板
  - 可看到全系統案件
  - 可管理帳號
  - 可進入單位治理
  - 可檢視登入紀錄與檢核表管理

### 4. 檢核表流程

- 使用 `user1` 或 `unit1` 進入「填報檢核表」
- 驗證：
  - 草稿可暫存
  - 正式送出後不可再由填報人直接修改
  - 主管簽核欄位需完整填寫才可送出

### 5. 教育訓練統計

- 使用 `unit1` 或 `admin` 進入「資安教育訓練統計」
- 驗證：
  - 草稿可暫存
  - 單位管理員可接手修改草稿
  - 匯出 CSV 功能正常

## 問題回報格式

請回報以下資訊：

- 測試帳號：
- 測試時間：
- 使用頁面：
- 操作步驟：
- 預期結果：
- 實際結果：
- 是否可重現：
- 附圖或錄影：

## 已知部署說明

- 本機部署目前採：
  - `Windows Host -> Host Gateway -> VirtualBox NAT -> Ubuntu Caddy -> Node Backend`
- VM 內 `systemd` 與 `Caddy` 已啟動
- 入口網址目前以 Windows 主機校內 IP 為準，不建議直接使用 VM 的 bridged IP
"""


UAT_SCRIPT_MD = """# 校內 UAT 測試腳本

- 更新日期：2026-03-12
- 測試目標：確認校內測試網址、角色權限、主要業務流程與附件上傳行為正常
- 測試網址：`http://140.112.3.65:8088/`

## 測試前確認

- [ ] 已連上校內網路或校內 VPN
- [ ] 可開啟首頁
- [ ] 可登入測試帳號
- [ ] 首頁不會出現「僅開放校內網路存取」

## 測試帳號

| 角色 | 帳號 | 密碼 | 主要用途 |
| --- | --- | --- | --- |
| 最高管理員 | `admin` | `admin123` | 全域檢查、帳號與單位治理 |
| 單位管理員 | `unit1` | `unit123` | 開單、審核、追蹤 |
| 稽核室管理員 | `unit2` | `unit123` | 跨單位管理視角 |
| 填報人 | `user1` | `user123` | 回覆、追蹤、檢核表 |
| 檢視者 | `viewer1` | `viewer123` | 權限封鎖確認 |

## Case 1：校內連線限制

### 步驟

1. 從校內網路開啟首頁
2. 重新整理一次
3. 確認頁面正常顯示

### 預期結果

- [ ] 首頁可正常載入
- [ ] 不會出現拒絕頁
- [ ] `/#dashboard` 可正常進入

## Case 2：填報人矯正單流程

### 步驟

1. 使用 `user1 / user123` 登入
2. 進入「矯正單列表」
3. 找到一筆 `待矯正` 案件
4. 填寫初步矯正措施
5. 上傳一份佐證附件
6. 送出回覆

### 預期結果

- [ ] 可成功送出
- [ ] 案件狀態更新
- [ ] 詳情頁可看到附件
- [ ] 歷程記錄顯示實際操作人

## Case 3：追蹤中案件提報

### 步驟

1. 使用 `user1` 開啟一筆 `追蹤中` 案件
2. 填寫追蹤內容
3. 選擇 `建議持續追蹤`
4. 確認系統要求 `下一次追蹤日期`
5. 再改為 `擬請同意結案`
6. 確認系統要求上傳佐證

### 預期結果

- [ ] `建議持續追蹤` 時必填下一次追蹤日期
- [ ] `擬請同意結案` 時必填佐證附件
- [ ] 提報後管理者看得到待審核追蹤提報

## Case 4：單位管理員審核流程

### 步驟

1. 使用 `unit1 / unit123` 登入
2. 開啟剛剛由 `user1` 提報的案件
3. 審核追蹤提報
4. 選擇 `同意繼續追蹤`
5. 再次開啟案件確認狀態
6. 最後選擇 `同意結案`

### 預期結果

- [ ] 管理者可看到提報內容與附件
- [ ] 可切換為持續追蹤
- [ ] 可切換為結案
- [ ] 歷程記錄完整

## Case 5：檢核表流程

### 步驟

1. 使用 `user1` 進入「填報檢核表」
2. 填寫數題內容後按 `暫存草稿`
3. 重新進入同一份草稿
4. 補齊權責主管姓名、職稱、簽核狀態、簽核日期
5. 正式送出

### 預期結果

- [ ] 草稿可正常儲存與重開
- [ ] 草稿按鈕位置正常
- [ ] 正式送出前主管簽核欄位必填
- [ ] 送出後填報人不可直接修改

## Case 6：教育訓練統計流程

### 步驟

1. 使用 `unit1` 進入「資安教育訓練統計」
2. 建立或開啟一份草稿
3. 修改一位填報人的資料
4. 暫存草稿
5. 匯出 CSV

### 預期結果

- [ ] 單位管理員可接手草稿
- [ ] 暫存正常
- [ ] 匯出 CSV 正常

## Case 7：最高管理員檢查

### 步驟

1. 使用 `admin / admin123` 登入
2. 確認儀表板、帳號管理、單位治理、登入紀錄可開啟
3. 開啟單位治理頁
4. 確認頁面載入穩定

### 預期結果

- [ ] 可看到全系統資料
- [ ] 管理頁不會權限錯誤
- [ ] 儀表板資訊正常

## 問題回報表

| 欄位 | 請填寫 |
| --- | --- |
| 測試人員 |  |
| 測試時間 |  |
| 測試案例 |  |
| 操作步驟 |  |
| 預期結果 |  |
| 實際結果 |  |
| 是否可重現 |  |
| 截圖檔名 |  |
"""


HTML_CSS = """
@page { size: A4; margin: 16mm; }
:root {
  --text: #1f2937;
  --muted: #667085;
  --line: #d0d7e2;
  --accent: #1d4ed8;
  --bg: #f7fafc;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f4f7fb;
  color: var(--text);
  font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif;
  line-height: 1.75;
}
.page {
  width: min(960px, calc(100vw - 32px));
  margin: 24px auto 40px;
  background: #fff;
  border: 1px solid #dde5ef;
  border-radius: 24px;
  box-shadow: 0 18px 48px rgba(25, 55, 99, 0.08);
  overflow: hidden;
}
.hero {
  padding: 36px 40px 30px;
  background:
    radial-gradient(circle at top left, rgba(29, 78, 216, 0.10), transparent 32%),
    linear-gradient(180deg, #eff5ff 0%, #ffffff 46%);
  border-bottom: 1px solid #e5edf6;
}
.hero h1 {
  margin: 0 0 8px;
  font-size: 34px;
  line-height: 1.2;
  color: #11233b;
}
.hero p {
  margin: 0;
  color: #52657d;
}
.content {
  padding: 28px 40px 40px;
}
h1, h2, h3 { color: #11233b; }
h2 {
  margin: 32px 0 10px;
  padding-left: 12px;
  border-left: 4px solid var(--accent);
  font-size: 24px;
}
h3 {
  margin: 22px 0 8px;
  font-size: 19px;
}
p { margin: 8px 0; }
ul, ol { margin: 8px 0 12px 24px; }
li { margin: 4px 0; }
code {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(29, 78, 216, 0.08);
  color: #17468b;
  font-family: Consolas, monospace;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 18px;
  font-size: 15px;
}
th, td {
  border: 1px solid var(--line);
  padding: 10px 12px;
  vertical-align: top;
  text-align: left;
}
th {
  background: #f5f8fc;
}
blockquote {
  margin: 12px 0;
  padding: 12px 14px;
  background: #f8fbff;
  border-left: 4px solid #8fb4ff;
  color: #37506b;
}
.meta-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}
.meta-list li {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #e1e8f0;
  border-radius: 14px;
  background: #ffffffcc;
}
"""


def write_html(md_text: str, title: str, subtitle: str, output_path: Path) -> None:
    body_html = md.markdown(md_text, extensions=["tables", "fenced_code", "sane_lists"])
    html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{escape(title)}</title>
  <style>{HTML_CSS}</style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <h1>{escape(title)}</h1>
      <p>{escape(subtitle)}</p>
    </section>
    <section class="content">
      {body_html}
    </section>
  </main>
</body>
</html>
"""
    output_path.write_text(html, encoding="utf-8")


def md_to_pdf(md_text: str, title: str, subtitle: str, output_path: Path) -> None:
    ensure_fonts()
    styles = getSampleStyleSheet()
    base = ParagraphStyle(
        "BaseZh",
        parent=styles["BodyText"],
        fontName="MSung-Light",
        fontSize=11.5,
        leading=18,
        textColor=colors.HexColor("#1f2937"),
        alignment=TA_LEFT,
        spaceAfter=6,
    )
    h1 = ParagraphStyle(
        "H1Zh",
        parent=base,
        fontName="HeiseiKakuGo-W5",
        fontSize=24,
        leading=30,
        textColor=colors.HexColor("#10243d"),
        spaceAfter=10,
    )
    h2 = ParagraphStyle(
        "H2Zh",
        parent=base,
        fontName="HeiseiKakuGo-W5",
        fontSize=17,
        leading=24,
        textColor=colors.HexColor("#18385e"),
        spaceBefore=12,
        spaceAfter=8,
    )
    h3 = ParagraphStyle(
        "H3Zh",
        parent=base,
        fontName="HeiseiKakuGo-W5",
        fontSize=13,
        leading=20,
        textColor=colors.HexColor("#18385e"),
        spaceBefore=10,
        spaceAfter=6,
    )
    bullet = ParagraphStyle(
        "BulletZh",
        parent=base,
        leftIndent=14,
        firstLineIndent=-10,
    )
    numbered = ParagraphStyle(
        "NumberedZh",
        parent=base,
        leftIndent=16,
        firstLineIndent=-12,
    )
    code_style = ParagraphStyle(
        "CodeZh",
        parent=base,
        fontName="HeiseiKakuGo-W5",
        backColor=colors.HexColor("#eef4ff"),
        textColor=colors.HexColor("#17468b"),
        borderPadding=(4, 6, 4, 6),
        borderRadius=8,
    )

    story = [
        Paragraph(title, h1),
        Paragraph(subtitle, base),
        Spacer(1, 6),
    ]

    lines = md_text.splitlines()
    in_table = False
    table_lines: list[str] = []

    def flush_table():
        nonlocal table_lines, story
        if not table_lines:
            return
        rows = []
        for line in table_lines:
            if not line.strip().startswith("|"):
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            rows.append(cells)
        if len(rows) >= 2:
            if all(set(cell.replace("-", "").strip()) == set() for cell in rows[1]):
                rows.pop(1)
            tbl = Table(rows, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f8fc")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1f2937")),
                ("FONTNAME", (0, 0), (-1, -1), "MSung-Light"),
                ("FONTNAME", (0, 0), (-1, 0), "HeiseiKakuGo-W5"),
                ("FONTSIZE", (0, 0), (-1, -1), 10.5),
                ("LEADING", (0, 0), (-1, -1), 14),
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#d0d7e2")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 8))
        table_lines = []

    for line in lines:
        stripped = line.rstrip()
        if stripped.startswith("|"):
            in_table = True
            table_lines.append(stripped)
            continue
        if in_table:
            flush_table()
            in_table = False
        if not stripped:
            story.append(Spacer(1, 4))
            continue
        if stripped.startswith("# "):
            continue
        if stripped.startswith("## "):
            story.append(Paragraph(stripped[3:].strip(), h2))
            continue
        if stripped.startswith("### "):
            story.append(Paragraph(stripped[4:].strip(), h3))
            continue
        if stripped.startswith("- `") and stripped.endswith("`"):
            story.append(Paragraph(stripped[2:].strip().replace("`", ""), code_style))
            continue
        if stripped.startswith("- "):
            story.append(Paragraph(f"• {escape(stripped[2:].strip())}", bullet))
            continue
        if stripped[:2].isdigit() and stripped[1:3] == ". ":
            story.append(Paragraph(escape(stripped), numbered))
            continue
        if stripped[:3].isdigit() and stripped[2:4] == ". ":
            story.append(Paragraph(escape(stripped), numbered))
            continue
        story.append(Paragraph(escape(stripped), base))

    if in_table:
        flush_table()

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
    )
    doc.build(story)


def main() -> None:
    guide_html = DOCS / "campus-colleague-uat-guide.html"
    guide_pdf = DOCS / "campus-colleague-uat-guide.pdf"
    script_md = DOCS / "campus-uat-test-script.md"
    script_html = DOCS / "campus-uat-test-script.html"
    script_pdf = DOCS / "campus-uat-test-script.pdf"

    write_html(GUIDE_MD, "校內同事測試說明", "供校內同事測試登入、流程與回報問題使用", guide_html)
    md_to_pdf(GUIDE_MD, "校內同事測試說明", "供校內同事測試登入、流程與回報問題使用", guide_pdf)

    script_md.write_text(UAT_SCRIPT_MD, encoding="utf-8")
    write_html(UAT_SCRIPT_MD, "校內 UAT 測試腳本", "逐項勾選的校內驗收測試腳本", script_html)
    md_to_pdf(UAT_SCRIPT_MD, "校內 UAT 測試腳本", "逐項勾選的校內驗收測試腳本", script_pdf)

    print("Generated:")
    for path in (guide_html, guide_pdf, script_md, script_html, script_pdf):
        print(path)


if __name__ == "__main__":
    main()
