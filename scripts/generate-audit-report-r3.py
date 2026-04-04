#!/usr/bin/env python3
"""Generate ISMS audit report PDF — Round 3 deep audit."""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = r"C:\Windows\Fonts"
for alias, fn in {"NotoSans": "msjh.ttc", "NotoSansBold": "msjhbd.ttc"}.items():
    pdfmetrics.registerFont(TTFont(alias, os.path.join(FONT_DIR, fn), subfontIndex=0))

CLR_TITLE = HexColor("#1a365d")
CLR_CRITICAL = HexColor("#dc2626")
CLR_HIGH = HexColor("#ea580c")
CLR_MEDIUM = HexColor("#ca8a04")
CLR_LOW = HexColor("#16a34a")
CLR_HEADER_BG = HexColor("#1e3a5f")
CLR_ROW_ALT = HexColor("#f0f4f8")
CLR_BORDER = HexColor("#cbd5e1")

sTitle = ParagraphStyle("title", fontName="NotoSansBold", fontSize=20, leading=26,
                         textColor=CLR_TITLE, alignment=TA_CENTER, spaceAfter=4*mm)
sSectionTitle = ParagraphStyle("section", fontName="NotoSansBold", fontSize=13, leading=17,
                                textColor=white, spaceBefore=6*mm, spaceAfter=2*mm)
sCellH = ParagraphStyle("cellH", fontName="NotoSansBold", fontSize=8, leading=10,
                         textColor=white, alignment=TA_CENTER)
sCell = ParagraphStyle("cell", fontName="NotoSans", fontSize=7.5, leading=10)
sCellC = ParagraphStyle("cellC", fontName="NotoSans", fontSize=7.5, leading=10, alignment=TA_CENTER)

ISSUES = [
    # ── CRITICAL ──
    ("N1", "Critical", "Security", "app.js:1112",
     "requestSystemUserJson uses original `url` instead of sanitized `safeUrl` in fetch(); normalizeRequestUrl safeguard completely bypassed",
     "Cross-origin requests with session tokens to attacker-controlled server; credential theft",
     "Change line 1112: fetch(url,...) -> fetch(safeUrl,...)"),
    ("N2", "Critical", "Runtime", "app.js:1219",
     "requestAttachmentBlob references undeclared `safeUrl` variable; local var is `url` (line 1210) — throws ReferenceError on every call",
     "ALL remote attachment downloads broken; users cannot view/download SharePoint files",
     "Change line 1219: fetch(safeUrl,...) -> fetch(url,...)"),

    # ── HIGH ──
    ("N3", "High", "Memory", "app.js:3600-3618",
     "Window event listeners (hashchange, resize, focus, visibilitychange) registered as anonymous functions; never removed on re-init",
     "Double-firing of route handlers; memory leak in long sessions",
     "Store listener references; removeEventListener before re-adding"),
    ("N4", "High", "Logic", "workflow-support.js:28-33",
     "ROC year calculation produces negative values for dates before 1911; no validation guard",
     "Malformed document IDs like CAR--13-A01-1 that break parsing",
     "Guard: if (roc < 1) throw Error or clamp to minimum"),
    ("N5", "High", "Data", "workflow-support.js:678-686",
     "CSV parser uses naive line.split(','); does not handle RFC 4180 quoted fields containing commas",
     "Names/units with commas cause column shift; corrupted import data",
     "Implement proper RFC 4180 parsing or require XLSX format"),

    # ── MEDIUM ──
    ("N6", "Medium", "Security", "workflow-support.js:186-188",
     "MIME type validation bypassed when browser sets type to '' or 'application/octet-stream' (renamed files)",
     "Executable files uploadable disguised as PDF/JPG",
     "Validate magic bytes when MIME is empty; require matching extension"),
    ("N7", "Medium", "Config", "app.js:1215",
     "requestAttachmentBlob uses unitContactRequestTimeoutMs (15s) instead of attachment-specific timeout",
     "Large file downloads timeout prematurely",
     "Use dedicated attachmentDownloadTimeoutMs config"),
    ("N8", "Medium", "Routing", "app.js:266-274",
     "Route param 'undefined' (literal string) passed to render functions; no validation",
     "Deep link #detail/undefined shows broken empty view",
     "Validate param is valid ID; redirect to list if invalid"),
    ("N9", "Medium", "Routing", "app.js:2994-2996",
     "Routes detail/respond/tracking allow() only checks currentUser, not param presence",
     "#detail without ID renders broken page; no param guard",
     "Add param validation to allow(): !!currentUser() && !!param"),
    ("N10", "Medium", "Data", "data-module.js:182-190",
     "writeCachedJson: STORAGE_CACHE update at line 189 unreachable when setItem throws at line 187",
     "After quota error, cache returns stale data; user thinks changes saved",
     "Update cache before setItem; revert in catch block"),
    ("N11", "Medium", "Data", "workflow-support.js:147-152",
     "buildUploadSignature lowercases name; stored descriptors may retain original case; inconsistent duplicate detection",
     "Edge-case duplicates slip through or legitimate re-uploads rejected",
     "Normalize consistently in both storage and validation"),
    ("N12", "Medium", "Encoding", "workflow-support.js:678-686",
     "CSV raw text not BOM-stripped before split; UTF-8 BOM prefix on first cell causes header misidentification",
     "Excel-exported CSV files have all columns misaligned",
     "Strip BOM from raw text: text.replace(/^\\uFEFF/, '') before split"),
    ("N13", "Medium", "DateTime", "ui-module.js:22-38",
     "fmt()/fmtTime() use local timezone methods but stored timestamps are UTC ISO strings",
     "Cross-timezone users see different dates; year assignment at midnight boundary wrong",
     "Use getUTCFullYear() or document single-timezone assumption"),
    ("N14", "Medium", "Data", "contract.js:42-47 (backend)",
     "Backend generateAttachmentId uses Math.random() while frontend uses crypto.getRandomValues()",
     "Higher collision probability under concurrent backend uploads",
     "Use crypto.randomBytes() in backend"),

    # ── LOW ──
    ("N15", "Low", "Logic", "workflow-support.js:35-40",
     "normalizeRocYear accepts '0' (ROC year 0 = AD 1911); produces document IDs with year 000",
     "Invalid document numbering convention",
     "Reject ROC year 0; use fallback date"),
    ("N16", "Low", "Timing", "app.js:3570-3589",
     "suppressHashGuard flag can stick permanently if replaceState doesn't fire hashchange (spec-correct)",
     "Next navigation skips dirty-form check; potential data loss",
     "Clear flag with setTimeout fallback"),
    ("N17", "Low", "Encoding", "workflow-support.js:644-657",
     "resolveTrainingImportTargetUnit replaces ASCII / with fullwidth; official units with ASCII / won't match",
     "Unit lookup failure during import for units with / in name",
     "Verify canonical separator; normalize both sides"),
    ("N18", "Low", "Cleanup", "workflow-support.js:246-261",
     "downloadCsvFile: anchor.click() failure leaves orphaned DOM element and unreleased blob URL",
     "Minor DOM and memory leak on download failure",
     "Wrap in try/finally for cleanup"),

    # ── API TESTING FINDINGS ──
    ("N19", "High", "Security", "server.cjs:1198-1204",
     "API TEST CONFIRMED: /api/unit-contact/health exposes SharePoint site ID, app ID, list IDs, token scopes without any authentication",
     "Full infrastructure reconnaissance for attackers (confirmed via curl)",
     "Require admin auth or return only {ok:true}"),
    ("N20", "High", "Security", "server.cjs:1166-1196",
     "API TEST CONFIRMED: GET /api/unit-contact/status?email=X returns full application details (name, unit, status, dates) without authentication",
     "Anyone can enumerate applications by email; PII disclosure (confirmed via curl)",
     "Require auth or CAPTCHA; return minimal status-only response"),
    ("N21", "Medium", "Security", "server.cjs:1211-1214",
     "API TEST CONFIRMED: CORS preflight for non-matching origin (evil.com) returns Access-Control-Allow-Origin: http://127.0.0.1:8080 instead of omitting header",
     "Misleading CORS response; should omit header for non-matching origins",
     "Return no ACAO header when origin doesn't match allowlist"),
    ("N22", "Medium", "Security", "server.cjs:1207-1260",
     "API TEST: PUT method to /api/unit-contact/health returns 200; only GET should be valid for health check",
     "Unexpected HTTP method accepted",
     "Restrict health endpoint to GET method only"),
]

SEVERITY_COLORS = {
    "Critical": CLR_CRITICAL, "High": CLR_HIGH,
    "Medium": CLR_MEDIUM, "Low": CLR_LOW,
}
SEVERITY_LABELS = {
    "Critical": "CRITICAL", "High": "HIGH",
    "Medium": "MEDIUM", "Low": "LOW",
}
SEVERITY_COUNTS = {}
for issue in ISSUES:
    SEVERITY_COUNTS[issue[1]] = SEVERITY_COUNTS.get(issue[1], 0) + 1


def build_section_header(label, color, count):
    data = [[Paragraph(f"{label}  ({count} items)", sSectionTitle)]]
    t = Table(data, colWidths=[175*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), color),
        ('TOPPADDING', (0, 0), (-1, -1), 3*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3*mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 4*mm),
        ('ROUNDEDCORNERS', [2*mm, 2*mm, 2*mm, 2*mm]),
    ]))
    return t


def build_issue_table(issues):
    col_widths = [10*mm, 16*mm, 22*mm, 55*mm, 35*mm, 37*mm]
    header = [
        Paragraph("#", sCellH), Paragraph("Category", sCellH),
        Paragraph("Module", sCellH), Paragraph("Issue Description", sCellH),
        Paragraph("Impact", sCellH), Paragraph("Recommended Fix", sCellH),
    ]
    rows = [header]
    for iss in issues:
        rows.append([
            Paragraph(iss[0], sCellC), Paragraph(iss[2], sCell),
            Paragraph(f"<font face='NotoSansBold' size='7'>{iss[3]}</font>", sCell),
            Paragraph(iss[4], sCell), Paragraph(iss[5], sCell),
            Paragraph(iss[6], sCell),
        ])
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), CLR_HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, -1), 'NotoSans'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('TOPPADDING', (0, 0), (-1, -1), 2*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2*mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 1.5*mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 1.5*mm),
        ('GRID', (0, 0), (-1, -1), 0.4, CLR_BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ]
    for i in range(1, len(rows)):
        if i % 2 == 0:
            cmds.append(('BACKGROUND', (0, i), (-1, i), CLR_ROW_ALT))
    t.setStyle(TableStyle(cmds))
    return t


def add_page_number(canvas_obj, doc):
    canvas_obj.saveState()
    canvas_obj.setFont("NotoSans", 7)
    canvas_obj.setFillColor(HexColor("#94a3b8"))
    canvas_obj.drawCentredString(A4[0] / 2, 10*mm,
                                  f"ISMS Audit Report \u2014 Round 3  |  Page {doc.page}")
    canvas_obj.restoreState()


def main():
    out_path = os.path.join(
        r"C:\Users\User\Playground\ISMS-Form-Redesign",
        "ISMS-Audit-Report-R3-2026-03-19.pdf"
    )
    doc = SimpleDocTemplate(out_path, pagesize=A4,
                            leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=18*mm, bottomMargin=18*mm)
    story = []

    # Title
    story.append(Spacer(1, 12*mm))
    story.append(Paragraph("ISMS System Audit Report \u2014 Round 3", sTitle))
    story.append(Paragraph(
        "Edge Cases | Integration Bugs | API Endpoint Testing | Runtime Errors<br/>2026-03-19",
        ParagraphStyle("sub", fontName="NotoSans", fontSize=10, leading=14,
                        textColor=HexColor("#64748b"), alignment=TA_CENTER, spaceAfter=6*mm)
    ))
    story.append(Spacer(1, 3*mm))

    # Scope note
    note_style = ParagraphStyle("note", fontName="NotoSans", fontSize=8.5, leading=12,
                                 textColor=HexColor("#475569"), spaceAfter=4*mm)
    story.append(Paragraph(
        "<font face='NotoSansBold' color='#1a365d'>Scope</font>: "
        "Round 3 focused on cross-module integration, variable reference errors, "
        "CSV parsing edge cases, routing edge cases, timezone issues, and "
        "<font face='NotoSansBold'>live API endpoint testing via curl</font> against the production server at 140.112.3.65:8088. "
        f"<font face='NotoSansBold'>{len(ISSUES)} NEW issues</font> found, including "
        "2 Critical runtime/security bugs (N1: safeUrl bypass, N2: ReferenceError breaking all attachments). "
        "Combined with R1 (44) and R2 (62): <font face='NotoSansBold'>128 total issues</font>.",
        note_style
    ))

    # Summary cards
    summary_data = []
    for sev in ["Critical", "High", "Medium", "Low"]:
        count = SEVERITY_COUNTS.get(sev, 0)
        clr = SEVERITY_COLORS[sev]
        summary_data.append(Paragraph(
            f"<font face='NotoSansBold' color='{clr.hexval()}'>"
            f"<font size='18'>{count}</font><br/>"
            f"<font size='9'>{SEVERITY_LABELS[sev]}</font></font>",
            ParagraphStyle("sc", alignment=TA_CENTER, leading=22)
        ))
    summary_data.append(Paragraph(
        f"<font face='NotoSansBold' color='#1a365d'>"
        f"<font size='18'>{len(ISSUES)}</font><br/>"
        f"<font size='9'>ROUND 3</font></font>",
        ParagraphStyle("sc", alignment=TA_CENTER, leading=22)
    ))
    st = Table([summary_data], colWidths=[35*mm]*5)
    st.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.6, CLR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, CLR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 4*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4*mm),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(st)
    story.append(Spacer(1, 4*mm))

    # Grand total
    r1, r2 = 44, 62
    r3 = len(ISSUES)
    grand = r1 + r2 + r3
    story.append(Paragraph(
        f"<font face='NotoSansBold' size='10' color='#1a365d'>"
        f"Grand Total: R1({r1}) + R2({r2}) + R3({r3}) = {grand} issues</font>",
        ParagraphStyle("gt", fontName="NotoSansBold", fontSize=10, leading=14,
                        textColor=CLR_TITLE, spaceAfter=4*mm)
    ))

    # Priority
    pri = ParagraphStyle("pri", fontName="NotoSans", fontSize=8.5, leading=12,
                          textColor=HexColor("#334155"), spaceAfter=1*mm)
    story.append(Paragraph(
        "<font face='NotoSansBold' size='10' color='#dc2626'>URGENT — Fix Immediately</font>", pri))
    story.append(Spacer(1, 2*mm))
    for p in [
        "1. N2: ReferenceError in requestAttachmentBlob — ALL remote attachments broken NOW",
        "2. N1: safeUrl bypass — session tokens sent to unsanitized URL",
        "3. N19-N20: Health + status endpoints leaking SharePoint infra + PII without auth",
        "4. N5: CSV comma-in-field parsing corruption",
        "5. N3-N4: Event listener leak + ROC year negative values",
    ]:
        story.append(Paragraph(p, pri))
    story.append(Spacer(1, 4*mm))

    # Tables
    for sev in ["Critical", "High", "Medium", "Low"]:
        count = SEVERITY_COUNTS.get(sev, 0)
        if count == 0:
            continue
        clr = SEVERITY_COLORS[sev]
        filtered = [i for i in ISSUES if i[1] == sev]
        story.append(build_section_header(SEVERITY_LABELS[sev], clr, count))
        story.append(Spacer(1, 2*mm))
        story.append(build_issue_table(filtered))
        story.append(Spacer(1, 4*mm))

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"PDF generated: {out_path}")
    print(f"Round 3 issues: {len(ISSUES)}")
    for sev in ["Critical", "High", "Medium", "Low"]:
        print(f"  {sev}: {SEVERITY_COUNTS.get(sev, 0)}")
    print(f"Grand total (R1+R2+R3): {r1+r2+r3}")


if __name__ == "__main__":
    main()
