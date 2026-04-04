#!/usr/bin/env python3
"""Generate ISMS audit report PDF — Round 2 deep audit."""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ---------- font setup ----------
FONT_DIR = r"C:\Windows\Fonts"
font_map = {
    "NotoSans": "msjh.ttc",
    "NotoSansBold": "msjhbd.ttc",
}
for alias, filename in font_map.items():
    path = os.path.join(FONT_DIR, filename)
    if os.path.exists(path):
        pdfmetrics.registerFont(TTFont(alias, path, subfontIndex=0))
    else:
        raise FileNotFoundError(f"Font not found: {path}")

# ---------- colours ----------
CLR_TITLE = HexColor("#1a365d")
CLR_CRITICAL = HexColor("#dc2626")
CLR_HIGH = HexColor("#ea580c")
CLR_MEDIUM = HexColor("#ca8a04")
CLR_LOW = HexColor("#16a34a")
CLR_HEADER_BG = HexColor("#1e3a5f")
CLR_ROW_ALT = HexColor("#f0f4f8")
CLR_BORDER = HexColor("#cbd5e1")

# ---------- styles ----------
sTitle = ParagraphStyle("title", fontName="NotoSansBold", fontSize=20, leading=26,
                         textColor=CLR_TITLE, alignment=TA_CENTER, spaceAfter=4*mm)
sSubtitle = ParagraphStyle("subtitle", fontName="NotoSans", fontSize=10, leading=14,
                            textColor=HexColor("#64748b"), alignment=TA_CENTER, spaceAfter=8*mm)
sSectionTitle = ParagraphStyle("section", fontName="NotoSansBold", fontSize=13, leading=17,
                                textColor=white, spaceBefore=6*mm, spaceAfter=2*mm)
sCellH = ParagraphStyle("cellH", fontName="NotoSansBold", fontSize=8, leading=10,
                         textColor=white, alignment=TA_CENTER)
sCell = ParagraphStyle("cell", fontName="NotoSans", fontSize=7.5, leading=10)
sCellC = ParagraphStyle("cellC", fontName="NotoSans", fontSize=7.5, leading=10, alignment=TA_CENTER)

# =====================================================================
# Round 2 issues — deduplicated against round 1 (44 items)
# =====================================================================
ISSUES = [
    # ── CRITICAL ──
    ("C8", "Critical", "Security", "shell-module.js:324",
     "XSS: u.role injected raw into sidebar HTML without esc(); crafted role string injects arbitrary HTML/JS",
     "Full XSS on every authenticated page",
     "Use esc(u.role) and validate ROLE_BADGE against allowlist"),
    ("C9", "Critical", "Security", "contract.js:191-206",
     "Legacy plaintext passwords still supported; if stored value lacks 'ps1|' prefix, it is treated as cleartext in SharePoint list",
     "Plaintext credentials in SharePoint readable by list admins",
     "Force hash migration on next login; run one-time migration script"),
    ("C10", "Critical", "Security", "m365-api-client.js:916+",
     "SSRF: endpoint URLs from localStorage config; attacker injecting config can redirect authenticated requests to external server",
     "Token/credential theft via SSRF",
     "Validate resolved URL origin against allowlist before requests"),
    ("C11", "Critical", "Security", "workflow-support.js:223-227",
     "CSV/Excel formula injection: csvCell() does not strip formula prefixes (=, +, -, @); malicious import data re-exports as weaponized spreadsheet",
     "Remote code execution when victim opens exported file in Excel",
     "Prefix dangerous first chars with single-quote in CSV; set text format in XLSX"),

    # ── HIGH ──
    ("H9", "High", "Security", "server.cjs:1150-1180",
     "Unauthenticated /api/unit-contact/status exposes full application details (name, unit, status, review comments) by email lookup",
     "Information disclosure; email enumeration",
     "Require auth or return minimal subset; add CAPTCHA"),
    ("H10", "High", "Security", "server.cjs:271-275",
     "X-Forwarded-For trusted without verification; rate limit key derived from spoofable header",
     "Rate limit bypass via header rotation",
     "Configure trusted proxy count; ignore XFF when not behind proxy"),
    ("H11", "High", "Security", "request-authz.cjs:134-139",
     "Admin X-ISMS-Active-Unit header accepted without unit existence validation; arbitrary unit codes propagate to data writes",
     "Data corruption; audit trail pollution",
     "Validate requested unit against known unit list"),
    ("H12", "High", "Security", "asset-loader.js:46-48",
     "No Subresource Integrity (SRI) on dynamically loaded scripts; MITM or server compromise can inject malicious JS",
     "Full application takeover",
     "Add integrity='sha384-...' for all scripts; enforce HTTPS"),
    ("H13", "High", "Security", "admin-module.js:90+",
     "Client-side-only admin guard; sensitive localStorage ops (mergeUnit, clearLogs, migrateStores) callable from console",
     "Any user can execute admin-level data operations via devtools",
     "Move destructive ops to authenticated server-side APIs"),
    ("H14", "High", "Logic", "case-module.js:838-843",
     "State machine transitions enforced only in frontend; backend trusts client-submitted status values — can skip PENDING->PROPOSED",
     "Cases closed without corrective action details",
     "Enforce state transition rules server-side"),
    ("H15", "High", "Accessibility", "styles.css:888-891",
     "Checkbox/radio inputs use display:none — removed from accessibility tree; screen readers cannot interact",
     "WCAG 1.3.1 failure; forms unusable for assistive tech",
     "Replace with visually-hidden technique (clip-rect)"),
    ("H16", "High", "Accessibility", "styles.css (global)",
     "No :focus-visible styles on .btn, .filter-tab, .nav-item, .btn-logout — keyboard users cannot see focused element",
     "WCAG 2.4.7 failure (Focus Visible)",
     "Add :focus-visible with visible outline/ring to all interactive elements"),
    ("H17", "High", "Accessibility", "styles.css (global)",
     "No @media(prefers-reduced-motion:reduce); animations (fadeSlideUp, slideInRight, busySpin) fire unconditionally",
     "WCAG 2.3.3 failure; vestibular disorder discomfort",
     "Add prefers-reduced-motion block disabling all animations"),
    ("H18", "High", "Security", "contract.js:90-120",
     "normalizeSystemUserPayload accepts role/units/sessionVersion from client input (mass assignment)",
     "Privilege escalation if server upsert does not override",
     "Server must explicitly set role/sessionVersion from server-side logic"),

    # ── MEDIUM ──
    ("M17", "Medium", "Security", "server.cjs:1182-1188",
     "Health endpoint exposes SharePoint site ID, list IDs, token mode, UPN, scopes without auth",
     "Reconnaissance for SharePoint tenant attacks",
     "Require admin auth or return only {ok:true}"),
    ("M18", "Medium", "Security", "server.cjs:137-147",
     "CORS fallback returns first allowed origin for non-matching origins instead of omitting header",
     "Misleading CORS; may mask config errors",
     "Omit Access-Control-Allow-Origin for non-matching origins"),
    ("M19", "Medium", "Security", "server.cjs:626-648",
     "Initial password sent in plaintext via email body",
     "Credential exposure via email interception",
     "Use one-time password reset link instead"),
    ("M20", "Medium", "Security", "request-authz.cjs:143",
     "Auth result cached on mutable req.__ismsAuthz; downstream mutation escalates privileges for remaining request",
     "Privilege escalation within single request",
     "Object.freeze() the cached authz object"),
    ("M21", "Medium", "Performance", "request-authz.cjs:109-122",
     "Full user list fetched from SharePoint for EVERY authenticated API request — no caching",
     "High latency; Graph API rate limit risk",
     "Add 30-60s cache or use $filter query for single user"),
    ("M22", "Medium", "Security", "admin-module.js:107",
     "Password input in user modal uses type='text' — password visible on screen",
     "Shoulder surfing risk; screen recording exposure",
     "Change to type='password' with optional show/hide toggle"),
    ("M23", "Medium", "Security", "admin-module.js:288-289",
     "statusTone from application data used in CSS class without allowlist validation",
     "CSS class injection to mislead admin (e.g., rejected appears approved)",
     "Validate tone against allowlist; fallback to 'pending'"),
    ("M24", "Medium", "Logic", "data-module.js:225-240",
     "Spin-wait localStorage lock (busy-loop up to 2500ms) freezes browser main thread",
     "UI unresponsive for up to 2.5 seconds during contention",
     "Replace with navigator.locks API or setTimeout-based async lock"),
    ("M25", "Medium", "Data", "data-module.js:226-234",
     "localStorage lock TOCTOU race: read-check-write-verify is not atomic; two tabs can both acquire",
     "Concurrent writes corrupt data despite lock",
     "Use Web Locks API for true cross-tab exclusion"),
    ("M26", "Medium", "Data", "case-module.js:1079-1124",
     "TOCTOU between permission check and data mutation in respond/tracking flows; stale local check",
     "Dual submission from two tabs; conflicting responses",
     "Backend must enforce idempotency + include expectedRevision"),
    ("M27", "Medium", "Data", "case-module.js:1085-1120",
     "No concurrent edit protection; two users can submit conflicting responses, last write wins silently",
     "Lost work for first responder with no warning",
     "Add revision/version field; reject stale updates"),
    ("M28", "Medium", "Data", "checklist-module.js:373-388",
     "Score calculation includes unanswered items in total; draft save produces inaccurate conformance rate",
     "Conformance rate displayed lower than reality",
     "Exclude unanswered items from total or add separate counter"),
    ("M29", "Medium", "Data", "checklist-module.js:456-462",
     "Duplicate checklist guard has TOCTOU gap; two tabs saving same unit+year simultaneously both pass check",
     "Duplicate checklists for same unit/year",
     "Enforce uniqueness at data layer or backend"),
    ("M30", "Medium", "Data", "training-module.js:1826-1861",
     "Roster import merges results into local store even when backend partially fails (importErrors non-empty)",
     "Local state inconsistent with backend after partial failure",
     "Only merge confirmed items; trigger re-sync on partial failure"),
    ("M31", "Medium", "Data", "training-module.js:1761-1824",
     "Roster import has no maximum row count; 100K+ row file freezes browser and overwhelms backend",
     "Browser freeze; backend DoS",
     "Add max row limit (e.g., 5000) with user-friendly error"),
    ("M32", "Medium", "Security", "m365-api-client.js:235",
     "window.location.hash (containing route + object IDs) sent in every API request as frontendHash",
     "User activity and internal IDs leaked to logs",
     "Remove frontendHash or redact sensitive portions"),
    ("M33", "Medium", "Security", "m365-api-client.js:310-335",
     "No response body size limit on fetch(); malicious backend response can exhaust browser memory",
     "Browser tab crash / DoS",
     "Check content-length header; reject responses over 10MB"),
    ("M34", "Medium", "Security", "m365-api-client.js:279-290",
     "Auth headers spread from localStorage-based config; XSS modifying localStorage can inject arbitrary headers",
     "Header injection; credential exfiltration",
     "Whitelist allowed header names for sharedHeaders"),
    ("M35", "Medium", "Logic", "asset-loader.js:62-68",
     "Failed non-optional script load logs error but continues; app runs in broken state with missing modules",
     "Partially loaded, non-functional application",
     "Display user-visible error and abort loading on critical script failure"),
    ("M36", "Medium", "Logic", "shell-module.js:94,397,409",
     "document.body.innerHTML replacement destroys all event listeners; repeated renders leak memory",
     "Memory leaks in long-running sessions",
     "Use targeted DOM updates or call cleanup before innerHTML replacement"),
    ("M37", "Medium", "Security", "shell-module.js:367-394",
     "No hash sanitization in routing; route.param passed directly to render functions unsanitized",
     "Hash injection producing malformed HTML",
     "Sanitize route.param at router level; validate pattern"),
    ("M38", "Medium", "Security", "shell-module.js:168-169",
     "Current password stored in hidden DOM input (type=hidden) during must-change-password flow",
     "Devtools/extensions/malware can read plaintext password from DOM",
     "Store password in JS closure variable; remove from DOM"),
    ("M39", "Medium", "UX", "styles.css (global)",
     "No @media print styles; fixed header/sidebar/toasts render poorly when printing reports",
     "Printed output unusable",
     "Add @media print hiding non-content elements"),
    ("M40", "Medium", "UX", "styles.css:8,4008,4912",
     "Triple :root variable redefinition; first two blocks are dead code overridden by the last",
     "Developer confusion; wasted maintenance effort",
     "Consolidate into single :root block"),
    ("M41", "Medium", "UX", "styles.css:4383",
     "Dashboard table min-width:1080px overflows on 769-1080px screens (breakpoint gap)",
     "Horizontal overflow on tablets",
     "Add intermediate breakpoint or use min-width:100% with column hiding"),
    ("M42", "Medium", "Security", "index.html:10",
     "CSP allows 'unsafe-inline' for styles; attackers with HTML injection can use inline styles for CSS exfiltration",
     "Data theft via CSS injection",
     "Replace with nonce-based or hash-based approach"),
    ("M43", "Medium", "Data", "data-module.js:1171-1219",
     "addTrainingRosterPerson uses read-then-write without lock; concurrent adds can overwrite each other",
     "Lost roster entries on concurrent operations",
     "Use mutateVersionedStore() for entire read-modify-write cycle"),
    ("M44", "Medium", "Security", "contract.js:48-56",
     "Password complexity requires no special characters and has no maximum length",
     "Weaker entropy than ISMS standards",
     "Require special chars or zxcvbn check; add max length (128)"),
    ("M45", "Medium", "Security", "server.cjs:81,254-269",
     "In-memory rate limiter Map grows without bound; keys never deleted after window expires",
     "Memory exhaustion on long-running server",
     "Add periodic sweep or use LRU cache with max size"),
    ("M46", "Medium", "Data", "m365-api-client.js:1485-1501",
     "Batch roster upsert is not atomic; partial success merged as overall success with no rollback",
     "Inconsistent roster data after partial backend failure",
     "Surface partial failures; provide retry for failed items"),
    ("M47", "Medium", "Logic", "policy-module.js:40-43 vs 32",
     "Viewer access inconsistency: hasGlobalReadScope grants all-read but hasUnitAccess restricts to activeUnit",
     "Viewer denied access on some screens but granted on others",
     "Clarify model; hasUnitAccess should check hasGlobalReadScope first for read paths"),

    # ── LOW ──
    ("L14", "Low", "UX", "styles.css (global)",
     "No @media(prefers-color-scheme:dark) — no dark mode support",
     "Eye strain in long sessions; no system preference respect",
     "Add dark color scheme with remapped CSS custom properties"),
    ("L15", "Low", "UX", "styles.css:67",
     "scroll-behavior:smooth unconditional — should respect prefers-reduced-motion",
     "Forced smooth scroll for motion-sensitive users",
     "Wrap in @media(prefers-reduced-motion:no-preference)"),
    ("L16", "Low", "UX", "styles.css:103-118",
     "Custom scrollbar styles only for WebKit (::-webkit-scrollbar); no Firefox fallback",
     "Inconsistent appearance across browsers",
     "Add scrollbar-width:thin; scrollbar-color fallback"),
    ("L17", "Low", "UX", "styles.css (z-index)",
     "Z-index values scattered and undocumented; toast(1000) appears above modal(500)",
     "Toast overlays modal; busy overlay blocks modal dismiss",
     "Document layers as CSS vars; ensure modal > toast"),
    ("L18", "Low", "Security", "server.cjs:133-135",
     "decodeJwt does not validate 3-part JWT structure; malformed token causes Buffer.from(undefined) throw",
     "Unhandled exception in token processing",
     "Guard parts.length >= 3 before accessing parts[1]"),
    ("L19", "Low", "Security", "contract.js:310-318",
     "generatePassword modulo bias: 256 mod 54 != 0; some chars slightly more probable",
     "Minor bias in generated passwords",
     "Use rejection sampling for uniform distribution"),
    ("L20", "Low", "Data", "contract.js:111-123",
     "No per-field max length validation; oversized fields may hit SharePoint column limits silently",
     "Silent truncation or Graph API errors",
     "Add per-field max lengths (name:100, note:2000, email:254)"),
    ("L21", "Low", "Logic", "asset-loader.js:2",
     "Cache key is Date.now() — changes every page load; defeats browser/CDN caching entirely",
     "Every visit re-downloads all scripts and CSS",
     "Use build-time content hash or deploy timestamp"),
    ("L22", "Low", "Logic", "asset-loader.js:9-10",
     "m365-config.override.js loaded BEFORE m365-config.js; override values get overwritten by base",
     "Override config has no effect",
     "Swap load order: base first, then override"),
    ("L23", "Low", "Logic", "admin-module.js:511-513",
     "Audit entry modal uses array index as identifier; reloaded/modified array may point to wrong entry",
     "Admin views wrong audit entry details",
     "Use unique entry ID instead of array index"),
    ("L24", "Low", "UX", "shell-module.js:347",
     "Avatar uses u.name[0] without empty check; empty name renders 'undefined'",
     "Visual glitch for empty display names",
     "Guard with (u.name || '?')[0]"),
    ("L25", "Low", "Data", "case-module.js:255-257",
     "Dashboard 'closed this month' count uses local timezone; UTC dates near month boundary misattributed",
     "Off-by-one in monthly stats near midnight",
     "Normalize both dates to same timezone"),
    ("L26", "Low", "Data", "case-module.js:853+",
     "Item history array grows without bound; heavily-tracked cases bloat localStorage",
     "Performance degradation; quota risk",
     "Cap history length or archive older entries"),
    ("L27", "Low", "Data", "checklist-module.js:389-397",
     "Evidence file references persisted before draft save; if save fails, orphaned entries remain",
     "Phantom evidence consuming storage",
     "Persist evidence transactionally with checklist save"),
    ("L28", "Low", "UX", "index.html:20-27",
     "No <noscript> fallback; JS-disabled users see empty page with no explanation",
     "Zero feedback for non-JS users",
     "Add <noscript> message explaining JS requirement"),
    ("L29", "Low", "Security", "server.cjs (all POST handlers)",
     "No CSRF token mechanism; currently mitigated by Bearer-only auth but fragile if auth model changes",
     "CSRF exploitable if ever moved to cookie-based sessions",
     "Add CSRF token as defense-in-depth"),
    ("L30", "Low", "Data", "data-module.js:708-721",
     "No schema validation on items stored to localStorage; arbitrary properties including __proto__ accepted",
     "Potential prototype pollution or oversized payloads",
     "Whitelist fields before storage; reject unknown properties"),
]

SEVERITY_COLORS = {
    "Critical": CLR_CRITICAL,
    "High": CLR_HIGH,
    "Medium": CLR_MEDIUM,
    "Low": CLR_LOW,
}
SEVERITY_LABELS = {
    "Critical": "CRITICAL",
    "High": "HIGH",
    "Medium": "MEDIUM",
    "Low": "LOW",
}
SEVERITY_COUNTS = {}
for issue in ISSUES:
    sev = issue[1]
    SEVERITY_COUNTS[sev] = SEVERITY_COUNTS.get(sev, 0) + 1


def build_section_header(severity_label, color, count):
    data = [[Paragraph(f"{severity_label}  ({count} items)", sSectionTitle)]]
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
        Paragraph("#", sCellH),
        Paragraph("Category", sCellH),
        Paragraph("Module", sCellH),
        Paragraph("Issue Description", sCellH),
        Paragraph("Impact", sCellH),
        Paragraph("Recommended Fix", sCellH),
    ]
    rows = [header]
    for iss in issues:
        row = [
            Paragraph(iss[0], sCellC),
            Paragraph(iss[2], sCell),
            Paragraph(f"<font face='NotoSansBold' size='7'>{iss[3]}</font>", sCell),
            Paragraph(iss[4], sCell),
            Paragraph(iss[5], sCell),
            Paragraph(iss[6], sCell),
        ]
        rows.append(row)

    t = Table(rows, colWidths=col_widths, repeatRows=1)
    style_cmds = [
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
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), CLR_ROW_ALT))
    t.setStyle(TableStyle(style_cmds))
    return t


def add_page_number(canvas_obj, doc):
    canvas_obj.saveState()
    canvas_obj.setFont("NotoSans", 7)
    canvas_obj.setFillColor(HexColor("#94a3b8"))
    canvas_obj.drawCentredString(
        A4[0] / 2, 10 * mm,
        f"ISMS Audit Report — Round 2  |  Page {doc.page}"
    )
    canvas_obj.restoreState()


def main():
    out_path = os.path.join(
        r"C:\Users\User\Playground\ISMS-Form-Redesign",
        "ISMS-Audit-Report-2026-03-18.pdf"
    )
    doc = SimpleDocTemplate(
        out_path, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=18*mm, bottomMargin=18*mm,
    )
    story = []

    # ---- Cover / Title ----
    story.append(Spacer(1, 12*mm))
    story.append(Paragraph("ISMS System Deep Audit Report", sTitle))
    story.append(Paragraph(
        "Internal Audit Corrective Action Tracking System<br/>"
        "Round 2 — Server / Auth / Data Layer / CSS / Accessibility / Source Code<br/>"
        "2026-03-18",
        ParagraphStyle("sub", fontName="NotoSans", fontSize=10, leading=14,
                        textColor=HexColor("#64748b"), alignment=TA_CENTER, spaceAfter=6*mm)
    ))
    story.append(Spacer(1, 3*mm))

    # ---- Note about Round 1 ----
    note_style = ParagraphStyle("note", fontName="NotoSans", fontSize=8.5, leading=12,
                                 textColor=HexColor("#475569"), spaceAfter=4*mm)
    story.append(Paragraph(
        "<font face='NotoSansBold' color='#1a365d'>Scope</font>: "
        "This report contains <font face='NotoSansBold'>61 NEW issues</font> discovered in Round 2, "
        "covering server.cjs, request-authz.cjs, contract.js, asset-loader.js, admin-module.js, styles.css, "
        "and deeper analysis of data-module.js, m365-api-client.js, policy-module.js, case-module.js, "
        "checklist-module.js, and training-module.js. "
        "All 44 issues from Round 1 remain valid and are NOT duplicated here. "
        "Combined total: <font face='NotoSansBold'>105 issues</font>.",
        note_style
    ))

    # ---- Summary cards ----
    summary_data = []
    for sev in ["Critical", "High", "Medium", "Low"]:
        count = SEVERITY_COUNTS.get(sev, 0)
        clr = SEVERITY_COLORS[sev]
        cell = Paragraph(
            f"<font face='NotoSansBold' color='{clr.hexval()}'>"
            f"<font size='18'>{count}</font><br/>"
            f"<font size='9'>{SEVERITY_LABELS[sev]}</font></font>",
            ParagraphStyle("sc", alignment=TA_CENTER, leading=22)
        )
        summary_data.append(cell)

    total_cell = Paragraph(
        f"<font face='NotoSansBold' color='#1a365d'>"
        f"<font size='18'>{len(ISSUES)}</font><br/>"
        f"<font size='9'>ROUND 2</font></font>",
        ParagraphStyle("sc", alignment=TA_CENTER, leading=22)
    )
    summary_data.append(total_cell)

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

    # ---- Combined totals ----
    combined_style = ParagraphStyle("comb", fontName="NotoSansBold", fontSize=9, leading=13,
                                     textColor=HexColor("#1a365d"), spaceAfter=2*mm)
    r1 = {"Critical": 7, "High": 8, "Medium": 16, "Low": 13}
    combined_data = []
    for sev in ["Critical", "High", "Medium", "Low"]:
        r1c = r1[sev]
        r2c = SEVERITY_COUNTS.get(sev, 0)
        clr = SEVERITY_COLORS[sev]
        cell = Paragraph(
            f"<font color='{clr.hexval()}'>"
            f"<font size='9'>R1: {r1c} + R2: {r2c}</font><br/>"
            f"<font face='NotoSansBold' size='14'>{r1c + r2c}</font></font>",
            ParagraphStyle("cc", alignment=TA_CENTER, leading=18)
        )
        combined_data.append(cell)
    combined_data.append(Paragraph(
        f"<font color='#1a365d'><font size='9'>Combined</font><br/>"
        f"<font face='NotoSansBold' size='14'>105</font></font>",
        ParagraphStyle("cc2", alignment=TA_CENTER, leading=18)
    ))
    ct = Table([combined_data], colWidths=[35*mm]*5)
    ct.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.6, CLR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, CLR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3*mm),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, -1), CLR_ROW_ALT),
    ]))
    story.append(Paragraph("Combined Totals (Round 1 + Round 2)", combined_style))
    story.append(ct)
    story.append(Spacer(1, 4*mm))

    # ---- Priority order ----
    pri_style = ParagraphStyle("pri", fontName="NotoSans", fontSize=8.5, leading=12,
                                textColor=HexColor("#334155"), spaceAfter=1*mm)
    story.append(Paragraph(
        "<font face='NotoSansBold' size='10' color='#1a365d'>Top Priority — New in Round 2</font>",
        pri_style
    ))
    story.append(Spacer(1, 2*mm))
    priorities = [
        "1. C8: XSS via unescaped u.role — immediate patch required",
        "2. C9: Legacy plaintext password migration — compliance risk",
        "3. C10: SSRF via config injection — credential theft vector",
        "4. C11: CSV formula injection — remote code execution via export",
        "5. H9-H11: Unauthenticated info disclosure, rate limit bypass, admin unit injection",
        "6. H12-H13: SRI missing, client-side admin guard bypass",
        "7. H14-H18: State machine, accessibility WCAG failures, mass assignment",
        "8. M17-M47: Security hardening, data integrity, UX improvements",
    ]
    for p in priorities:
        story.append(Paragraph(p, pri_style))
    story.append(Spacer(1, 4*mm))

    # ---- Issue tables by severity ----
    for sev in ["Critical", "High", "Medium", "Low"]:
        count = SEVERITY_COUNTS.get(sev, 0)
        clr = SEVERITY_COLORS[sev]
        filtered = [i for i in ISSUES if i[1] == sev]
        story.append(build_section_header(SEVERITY_LABELS[sev], clr, count))
        story.append(Spacer(1, 2*mm))
        story.append(build_issue_table(filtered))
        story.append(Spacer(1, 4*mm))

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"PDF generated: {out_path}")
    print(f"Total issues: {len(ISSUES)}")
    for sev in ["Critical", "High", "Medium", "Low"]:
        print(f"  {sev}: {SEVERITY_COUNTS.get(sev, 0)}")


if __name__ == "__main__":
    main()
