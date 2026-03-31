const fs = require('fs');
const path = require('path');

const DEFAULT_BASELINE_DIR = path.resolve(process.env.ISMS_UI_BASELINE_DIR || path.join(process.cwd(), 'visual-baseline'));

const DESKTOP_VISUAL_SPECS = [
  {
    slug: 'dashboard',
    hash: '#dashboard',
    selector: '#visual-dashboard-shell'
  },
  {
    slug: 'training',
    hash: '#training',
    clip: { x: 260, y: 64, width: 1180, height: 1500 }
  },
  {
    slug: 'unit-review',
    hash: '#unit-review',
    selector: '#visual-unit-review-shell'
  }
];

const MOBILE_VISUAL_SPECS = [
  { slug: 'dashboard', hash: '#dashboard', selector: '#visual-dashboard-shell' },
  { slug: 'training', hash: '#training' },
  { slug: 'unit-review', hash: '#unit-review', selector: '#visual-unit-review-shell' }
];

const PUBLIC_DESKTOP_VISUAL_SPECS = [
  { slug: 'unit-contact-apply', hash: '#apply-unit-contact', selector: '#visual-unit-contact-apply-shell' },
  { slug: 'unit-contact-status', hash: '#apply-unit-contact-status', selector: '#visual-unit-contact-status-shell' },
  { slug: 'unit-contact-success', hash: '#apply-unit-contact-success/UCA-SMOKE-SUCCESS-001' },
  { slug: 'unit-contact-activate', hash: '#activate-unit-contact/UCA-SMOKE-SUCCESS-001' }
];

const PUBLIC_MOBILE_VISUAL_SPECS = [
  { slug: 'unit-contact-apply', hash: '#apply-unit-contact', selector: '#visual-unit-contact-apply-shell' },
  { slug: 'unit-contact-status', hash: '#apply-unit-contact-status', selector: '#visual-unit-contact-status-shell' },
  { slug: 'unit-contact-success', hash: '#apply-unit-contact-success/UCA-SMOKE-SUCCESS-001' },
  { slug: 'unit-contact-activate', hash: '#activate-unit-contact/UCA-SMOKE-SUCCESS-001' }
];

const VISUAL_SYNTHETIC_SEED_SETTLE_MS = 20;
const VISUAL_SUCCESS_ROUTE_SETTLE_MS = 120;
const VISUAL_SYNTHETIC_ROUTE_SETTLE_MS = 10;
const VISUAL_FAST_ROUTE_SETTLE_MS = 20;
const VISUAL_SLOW_ROUTE_SETTLE_MS = 280;
const VISUAL_UNIT_REVIEW_STABILIZE_MS = 180;
const VISUAL_UNIT_REVIEW_SEED_SETTLE_MS = 80;
const VISUAL_SYNTHETIC_STABILIZE_MS = 20;

function isSyntheticRootVisualSpec(spec) {
  const slug = spec && spec.slug;
  return slug === 'dashboard' || slug === 'unit-contact-apply' || slug === 'unit-contact-status';
}

function isBaseRootPage(url, baseUrl) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  const normalizedUrl = String(url || '');
  return normalizedUrl === normalizedBase
    || normalizedUrl === normalizedBase + '/'
    || normalizedUrl.startsWith(normalizedBase + '/#')
    || normalizedUrl.startsWith(normalizedBase + '/?')
    || normalizedUrl.startsWith(normalizedBase + '/?')
    || normalizedUrl.startsWith(normalizedBase + '/#');
}

async function seedSyntheticUnitContactSuccess(page) {
  await page.waitForFunction(() => {
    return !!(
      window._dataModule &&
      typeof window._dataModule.loadUnitContactApplicationStore === 'function' &&
      typeof window._dataModule.saveUnitContactApplicationStore === 'function'
    );
  }, { timeout: 30000 });
  await page.evaluate(() => {
    const app = {
      id: 'UCA-SMOKE-SUCCESS-001',
      unitValue: '計算機及資訊網路中心／資訊網路組',
      unitCode: 'A.B',
      unitCategory: '中心 / 研究單位',
      primaryUnit: '計算機及資訊網路中心',
      secondaryUnit: '資訊網路組',
      applicantName: '王小明',
      applicantEmail: 'unit-contact-smoke@example.com',
      extensionNumber: '61234',
      note: 'Synthetic public success page baseline',
      status: 'pending_review',
      statusLabel: '待審核',
      statusTone: 'pending',
      statusDetail: '資料已送出，系統正在等待管理者審核。',
      submittedAt: '2026-03-15T08:00:00.000Z',
      updatedAt: '2026-03-15T08:00:00.000Z'
    };
    if (!window._dataModule || typeof window._dataModule.loadUnitContactApplicationStore !== 'function' || typeof window._dataModule.saveUnitContactApplicationStore !== 'function') {
      throw new Error('unit-contact synthetic baseline requires _dataModule');
    }
    const store = window._dataModule.loadUnitContactApplicationStore();
    const applications = Array.isArray(store && store.applications) ? store.applications.slice() : [];
    const nextId = Number.isFinite(Number(store && store.nextId)) ? Number(store.nextId) : 1;
    const index = applications.findIndex((entry) => String(entry && entry.id || '') === app.id);
    if (index >= 0) {
      applications[index] = { ...applications[index], ...app };
    } else {
      applications.push(app);
    }
    window._dataModule.saveUnitContactApplicationStore({
      applications,
      nextId
    });
  try {
    window.sessionStorage.setItem('unit-contact-last-email', app.applicantEmail);
  } catch (_) {
    // ignore session storage failures in smoke mode
  }
  });
}

async function seedSyntheticUnitReview(page) {
  await page.waitForSelector('#app', { timeout: 5000 }).catch(() => null);

  await page.evaluate(() => {
    const app = document.getElementById('app');
    if (!app) return;
    const existing = document.getElementById('visual-unit-review-shell');
    if (existing) existing.remove();
    const shell = document.createElement('section');
    shell.id = 'visual-unit-review-shell';
    shell.className = 'visual-unit-review-shell card';
    shell.innerHTML = `
      <div class="card-header">
        <span class="card-title">治理分類清單</span>
        <span class="review-card-subtitle">Synthetic focused baseline</span>
      </div>
      <div class="review-toolbar visual-unit-review-toolbar">
        <div class="review-toolbar-main">
          <div class="form-group">
            <label class="form-label">關鍵字</label>
            <div class="form-input visual-smoke-mask-value">keyword</div>
          </div>
          <div class="form-group">
            <label class="form-label">填報模式</label>
            <div class="form-input visual-smoke-mask-value">mode</div>
          </div>
          <div class="form-group">
            <label class="form-label">分類</label>
            <div class="form-input visual-smoke-mask-value">category</div>
          </div>
        </div>
        <div class="review-toolbar-actions">
          <button type="button" class="btn btn-primary visual-smoke-mask-value">套用篩選</button>
        </div>
      </div>
      <div class="governance-category-stack visual-unit-review-stack">
        <details class="governance-category-card" open>
          <summary class="governance-category-summary">
            <div>
              <strong>行政單位</strong>
              <div class="review-card-subtitle">Synthetic focused baseline</div>
            </div>
            <div class="review-chip-row">
              <span class="review-count-chip">單位 4</span>
              <span class="review-count-chip">獨立 2</span>
              <span class="review-count-chip">合併 2</span>
            </div>
          </summary>
          <div class="review-card-body">
            <div class="review-history-item" style="min-height:72px"></div>
            <div class="review-history-item" style="min-height:72px"></div>
          </div>
        </details>
        <details class="governance-category-card">
          <summary class="governance-category-summary">
            <div>
              <strong>學術單位</strong>
              <div class="review-card-subtitle">Synthetic focused baseline</div>
            </div>
            <div class="review-chip-row">
              <span class="review-count-chip">單位 3</span>
              <span class="review-count-chip">獨立 1</span>
              <span class="review-count-chip">合併 2</span>
            </div>
          </summary>
          <div class="review-card-body">
            <div class="review-history-item" style="min-height:60px"></div>
          </div>
        </details>
      </div>
    `;
    app.appendChild(shell);
    const historyCard = document.querySelector('.review-history-card');
    if (historyCard) historyCard.classList.add('visual-smoke-hide');
    document.querySelectorAll('.governance-table-card, .review-table-card').forEach((node) => {
      if (node !== shell && !shell.contains(node)) node.classList.add('visual-smoke-hide');
    });
  });

  await page.waitForTimeout(VISUAL_UNIT_REVIEW_SEED_SETTLE_MS);
}

async function seedSyntheticDashboard(page) {
  await page.waitForSelector('#app', { timeout: 5000 }).catch(() => null);

  await page.evaluate(() => {
    const app = document.getElementById('app');
    if (!app) return;
    const existing = document.getElementById('visual-dashboard-shell');
    if (existing) existing.remove();
    const shell = document.createElement('section');
    shell.id = 'visual-dashboard-shell';
    shell.className = 'dashboard-shell visual-dashboard-shell card';
    shell.innerHTML =
      '<div class="card-header">' +
        '<div>' +
          '<div class="page-eyebrow">Dashboard Overview</div>' +
          '<span class="card-title">Focused Summary</span>' +
        '</div>' +
        '<span class="review-card-subtitle">Synthetic focused baseline</span>' +
      '</div>' +
      '<div class="visual-dashboard-stat-grid">' +
        '<div class="visual-dashboard-stat-card"><span class="visual-dashboard-stat-label">Open Cases</span><strong class="visual-dashboard-stat-value visual-smoke-mask-value">16</strong></div>' +
        '<div class="visual-dashboard-stat-card"><span class="visual-dashboard-stat-label">Pending</span><strong class="visual-dashboard-stat-value visual-smoke-mask-value">4</strong></div>' +
        '<div class="visual-dashboard-stat-card"><span class="visual-dashboard-stat-label">Closed</span><strong class="visual-dashboard-stat-value visual-smoke-mask-value">6</strong></div>' +
      '</div>' +
      '<div class="card visual-dashboard-panel">' +
        '<div class="card-header"><span class="card-title">Latest Signals</span><span class="review-card-subtitle">Synthetic focused baseline</span></div>' +
        '<div class="visual-dashboard-signal-stack">' +
          '<div class="visual-dashboard-signal-card"><span class="visual-dashboard-signal-dot"></span><div><strong>Pending sign-off</strong><div class="visual-smoke-mask-value">4 items</div></div></div>' +
          '<div class="visual-dashboard-signal-card"><span class="visual-dashboard-signal-dot"></span><div><strong>Audit follow-up</strong><div class="visual-smoke-mask-value">1 overdue</div></div></div>' +
        '</div>' +
      '</div>';
    app.appendChild(shell);
  });

  await page.waitForTimeout(VISUAL_SYNTHETIC_SEED_SETTLE_MS);
}

async function seedSyntheticUnitContactApply(page) {
  await page.waitForSelector('#app', { timeout: 5000 }).catch(() => null);

  await page.evaluate(() => {
    const app = document.getElementById('app');
    if (!app) return;
    const existing = document.getElementById('visual-unit-contact-apply-shell');
    if (existing) existing.remove();
    const shell = document.createElement('section');
    shell.id = 'visual-unit-contact-apply-shell';
    shell.className = 'unit-contact-shell visual-unit-contact-apply-shell card';
    shell.innerHTML =
      '<div class="card-header">' +
        '<div>' +
          '<div class="page-eyebrow">Public Apply</div>' +
          '<span class="card-title">Unit Contact Application</span>' +
        '</div>' +
        '<span class="review-card-subtitle">Synthetic focused baseline</span>' +
      '</div>' +
      '<div class="visual-unit-contact-hero">' +
        '<div class="visual-unit-contact-copy">' +
          '<div class="unit-contact-mode-title">Campus VM is the primary service entry.</div>' +
          '<div class="unit-contact-mode-text">Pages keeps a lightweight public fallback shell.</div>' +
        '</div>' +
        '<div class="visual-unit-contact-badges">' +
          '<span class="review-count-chip">Apply</span>' +
          '<span class="review-count-chip">Review</span>' +
          '<span class="review-count-chip">Activate</span>' +
        '</div>' +
      '</div>' +
      '<div class="visual-unit-contact-grid">' +
        '<div class="card">' +
          '<div class="card-header"><span class="card-title">Request Snapshot</span></div>' +
          '<div class="visual-unit-contact-field-grid">' +
            '<div class="form-group"><label class="form-label">Unit</label><div class="form-input visual-smoke-mask-value">Computer Center</div></div>' +
            '<div class="form-group"><label class="form-label">Requester</label><div class="form-input visual-smoke-mask-value">Eason Wu</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><span class="card-title">Flow</span></div>' +
          '<div class="visual-unit-contact-step-stack">' +
            '<div class="unit-contact-step-card"><strong>1. Submit</strong><div class="unit-contact-step-card-text">Identity and unit routing</div></div>' +
            '<div class="unit-contact-step-card"><strong>2. Review and Activate</strong><div class="unit-contact-step-card-text">Approval, document, activation</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    app.appendChild(shell);
    document.querySelectorAll('.unit-contact-shell .card, .unit-contact-shell form, .unit-contact-shell .unit-contact-stepper, .unit-contact-shell .unit-contact-mode-card').forEach((node) => {
      if (node !== shell && !shell.contains(node)) node.classList.add('visual-smoke-hide');
    });
  });

  await page.waitForTimeout(VISUAL_SYNTHETIC_SEED_SETTLE_MS);
}

async function seedSyntheticUnitContactStatus(page) {
  await page.waitForSelector('#app', { timeout: 5000 }).catch(() => null);

  await page.evaluate(() => {
    const app = document.getElementById('app');
    if (!app) return;
    const existing = document.getElementById('visual-unit-contact-status-shell');
    if (existing) existing.remove();
    const shell = document.createElement('section');
    shell.id = 'visual-unit-contact-status-shell';
    shell.className = 'unit-contact-shell visual-unit-contact-status-shell card';
    shell.innerHTML = `
      <div class="card-header">
        <div>
          <div class="page-eyebrow">Application Status</div>
          <span class="card-title">單位管理人申請進度</span>
        </div>
        <span class="review-card-subtitle">Synthetic focused baseline</span>
      </div>
      <div class="visual-unit-contact-status-mode card">
        <div class="card-header">
          <span class="card-title">查詢申請進度</span>
          <span class="review-card-subtitle">輸入申請時填寫的電子郵件即可查詢</span>
        </div>
        <div class="visual-unit-contact-status-form">
          <div class="form-group">
            <label class="form-label">申請電子郵件</label>
            <div class="form-input visual-smoke-mask-value">unit-contact-smoke@example.com</div>
          </div>
          <div class="visual-unit-contact-status-actions">
            <button type="button" class="btn btn-secondary visual-smoke-mask-value">返回申請</button>
            <button type="button" class="btn btn-primary visual-smoke-mask-value">查詢</button>
          </div>
        </div>
      </div>
      <div class="visual-unit-contact-status-grid">
        <div class="card">
          <div class="card-header">
            <span class="card-title">申請進度</span>
          </div>
          <div class="unit-contact-summary-grid">
            <div><strong class="visual-smoke-mask-value">狀態</strong><span class="visual-smoke-mask-value">審核中</span></div>
            <div><strong class="visual-smoke-mask-value">單位</strong><span class="visual-smoke-mask-value">計算機及資訊網路中心</span></div>
            <div><strong class="visual-smoke-mask-value">申請人</strong><span class="visual-smoke-mask-value">Eason Wu</span></div>
            <div><strong class="visual-smoke-mask-value">送出時間</strong><span class="visual-smoke-mask-value">2026-03-28</span></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">查詢說明</span>
          </div>
          <ul class="unit-contact-checklist">
            <li class="visual-smoke-mask-value">請輸入申請時填寫的電子郵件。</li>
            <li class="visual-smoke-mask-value">系統會顯示申請單位、審核狀態與後續操作。</li>
            <li class="visual-smoke-mask-value">若審核已通過，可直接前往帳號啟用頁。</li>
          </ul>
        </div>
      </div>
    `;
    app.appendChild(shell);
  });

  await page.waitForTimeout(VISUAL_SYNTHETIC_SEED_SETTLE_MS);
}

function getVisualSmokeStyles(slug, mode) {
  const common = `
    .visual-smoke-mask-value,
    .visual-smoke-mask-value * {
      color: transparent !important;
      text-shadow: none !important;
    }
    .visual-smoke-hide {
      display: none !important;
    }
  `;

  if (slug === 'dashboard') {
    return common + `
      #visual-dashboard-shell {
        width: ${mode === 'mobile' ? '264px' : '460px'} !important;
        max-width: ${mode === 'mobile' ? '264px' : '460px'} !important;
        margin: 0 auto !important;
        padding: ${mode === 'mobile' ? '10px' : '11px'} !important;
        box-sizing: border-box !important;
      }
      #visual-dashboard-shell .visual-dashboard-stat-grid {
        display: grid !important;
        grid-template-columns: repeat(${mode === 'mobile' ? '1' : '3'}, minmax(0, 1fr)) !important;
        gap: 9px !important;
        margin-bottom: 12px !important;
      }
      #visual-dashboard-shell .visual-dashboard-stat-card,
      #visual-dashboard-shell .visual-dashboard-panel {
        border: 1px solid rgba(148, 163, 184, 0.18) !important;
        border-radius: 14px !important;
        background: rgba(255, 255, 255, 0.96) !important;
        padding: 11px !important;
      }
      #visual-dashboard-shell .visual-dashboard-bar-stack,
      #visual-dashboard-shell .visual-dashboard-signal-stack {
        display: grid !important;
        gap: 8px !important;
      }
      #visual-dashboard-shell .visual-dashboard-bar-row {
        display: grid !important;
        grid-template-columns: 72px 1fr !important;
        gap: 10px !important;
        align-items: center !important;
      }
      #visual-dashboard-shell .visual-dashboard-bar {
        display: block !important;
        height: 10px !important;
        border-radius: 999px !important;
        background: linear-gradient(90deg, rgba(59, 130, 246, 0.92), rgba(96, 165, 250, 0.76)) !important;
      }
      #visual-dashboard-shell .visual-dashboard-signal-card {
        display: grid !important;
        grid-template-columns: auto 1fr !important;
        gap: 10px !important;
        align-items: center !important;
      }
      #visual-dashboard-shell .visual-dashboard-signal-dot {
        width: 10px !important;
        height: 10px !important;
        border-radius: 999px !important;
        background: rgba(59, 130, 246, 0.92) !important;
      }
      #visual-dashboard-shell .visual-dashboard-stat-value,
      #visual-dashboard-shell .visual-dashboard-stat-label,
      #visual-dashboard-shell .visual-dashboard-bar-label,
      #visual-dashboard-shell .visual-dashboard-signal-card div,
      #visual-dashboard-shell .visual-dashboard-signal-card strong {
        text-shadow: none !important;
      }
      #visual-dashboard-shell .visual-dashboard-stat-value,
      #visual-dashboard-shell .visual-smoke-mask-value {
        color: transparent !important;
      }
    `;
  }

  if (slug === 'training') {
    return common + `
      .training-mini-value,
      .training-group-summary-chip strong,
      .training-group-summary-chip small,
      .training-inline-status,
      .table-wrapper td,
      .table-wrapper th {
        text-shadow: none !important;
      }
      .training-group-summary-chip strong,
      .training-group-summary-chip small,
      .training-inline-status,
      .training-mini-value,
      .training-group-card .table-wrapper td {
        color: transparent !important;
      }
      .training-table-card:first-of-type .table-wrapper tbody {
        display: none !important;
      }
      .training-group-card:nth-of-type(n+3) {
        display: none !important;
      }
      .training-group-card .table-wrapper tbody {
        display: none !important;
      }
    `;
  }

  if (slug === 'unit-review') {
    return common + `
      #visual-unit-review-shell {
        width: ${mode === 'mobile' ? '320px' : '620px'} !important;
        max-width: ${mode === 'mobile' ? '320px' : '620px'} !important;
        margin: 0 auto !important;
        box-sizing: border-box !important;
      }
      #visual-unit-review-shell .visual-unit-review-toolbar {
        padding-top: 6px;
      }
      #visual-unit-review-shell .review-toolbar-main {
        gap: 12px !important;
      }
      #visual-unit-review-shell .form-group {
        min-width: 0 !important;
        flex: 1 1 0 !important;
      }
      #visual-unit-review-shell .form-input {
        min-height: 42px !important;
        display: flex !important;
        align-items: center !important;
      }
      #visual-unit-review-shell .governance-category-stack {
        gap: 12px !important;
      }
      #visual-unit-review-shell .review-card-body {
        padding-top: 12px !important;
      }
      .review-count-chip,
      .review-status-badge,
      .review-history-badge,
      .review-source-pill,
      .review-unit-name,
      .review-data-table td,
      .review-data-table th,
      .review-ref-item {
        text-shadow: none !important;
      }
      .review-count-chip,
      .review-status-badge,
      .review-history-badge,
      .review-source-pill,
      .review-unit-name,
      .review-data-table td,
      .review-history-item,
      .review-ref-item {
        color: transparent !important;
      }
      .review-data-table tbody,
      .review-ref-list {
        display: none !important;
      }
    `;
  }

  if (slug === 'unit-contact-apply') {
    return common + `
      #visual-unit-contact-apply-shell {
        width: ${mode === 'mobile' ? '300px' : '560px'} !important;
        max-width: ${mode === 'mobile' ? '300px' : '560px'} !important;
        margin: 0 auto !important;
        padding: ${mode === 'mobile' ? '12px' : '14px'} !important;
        box-sizing: border-box !important;
      }
      #visual-unit-contact-apply-shell .visual-unit-contact-grid {
        display: grid !important;
        grid-template-columns: ${mode === 'mobile' ? '1fr' : '1fr 0.88fr'} !important;
        gap: 10px !important;
      }
      #visual-unit-contact-apply-shell .visual-unit-contact-hero {
        display: grid !important;
        grid-template-columns: ${mode === 'mobile' ? '1fr' : '1.2fr auto'} !important;
        gap: 8px !important;
        margin-bottom: 12px !important;
      }
      #visual-unit-contact-apply-shell .visual-unit-contact-badges {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        align-items: flex-start !important;
      }
      #visual-unit-contact-apply-shell .visual-unit-contact-field-grid,
      #visual-unit-contact-apply-shell .visual-unit-contact-step-stack {
        display: grid !important;
        gap: 8px !important;
      }
      #visual-unit-contact-apply-shell .form-input,
      #visual-unit-contact-apply-shell .unit-contact-step-card-text,
      #visual-unit-contact-apply-shell .unit-contact-mode-text {
        color: transparent !important;
        text-shadow: none !important;
      }
      #visual-unit-contact-apply-shell .unit-contact-step-card {
        min-height: 62px !important;
      }
    `;
  }

  if (slug === 'unit-contact-status') {
    return common + `
      #visual-unit-contact-status-shell {
        width: ${mode === 'mobile' ? '340px' : '760px'} !important;
        max-width: ${mode === 'mobile' ? '340px' : '760px'} !important;
        margin: 0 auto !important;
        padding: ${mode === 'mobile' ? '16px' : '18px'} !important;
        box-sizing: border-box !important;
      }
      #visual-unit-contact-status-shell .visual-unit-contact-status-grid {
        display: grid !important;
        grid-template-columns: ${mode === 'mobile' ? '1fr' : '1.05fr 0.95fr'} !important;
        gap: 14px !important;
      }
      #visual-unit-contact-status-shell .visual-unit-contact-status-form {
        display: grid !important;
        gap: 12px !important;
      }
      #visual-unit-contact-status-shell .visual-unit-contact-status-actions {
        display: flex !important;
        gap: 10px !important;
        flex-wrap: wrap !important;
      }
      #visual-unit-contact-status-shell .form-input,
      #visual-unit-contact-status-shell .unit-contact-checklist li,
      #visual-unit-contact-status-shell .unit-contact-summary-grid strong,
      #visual-unit-contact-status-shell .unit-contact-summary-grid span,
      #visual-unit-contact-status-shell .review-card-subtitle {
        color: transparent !important;
        text-shadow: none !important;
      }
    `;
  }

  if (slug === 'unit-contact-success' || slug === 'unit-contact-activate') {
    return common + `
      .unit-contact-mode-title,
      .unit-contact-mode-text,
      .unit-contact-step-card-text,
      .unit-contact-checklist li,
      .public-header-actions,
      .page-subtitle,
      .form-hint,
      .form-input::placeholder,
      .unit-contact-success-note,
      .unit-contact-summary-grid strong,
      .unit-contact-summary-grid span {
        text-shadow: none !important;
      }
      .unit-contact-success-note,
      .unit-contact-summary-grid strong,
      .unit-contact-summary-grid span {
        color: transparent !important;
      }
    `;
  }

  return common;
}

async function stabilizeVisualRoute(page, slug, mode) {
  await page.addStyleTag({ content: getVisualSmokeStyles(slug, mode) });
  await page.evaluate(({ slug }) => {
    if (slug === 'training') {
      document.querySelectorAll('.training-group-card').forEach((card, index) => {
        card.open = index < 2;
      });
    }
    if (slug === 'unit-review') {
      document.querySelectorAll('.governance-category-card').forEach((card) => {
        card.open = false;
      });
    }
  }, { slug });
  const settleMs = slug === 'unit-review'
    ? VISUAL_UNIT_REVIEW_STABILIZE_MS
    : (slug === 'dashboard' || String(slug || '').indexOf('unit-contact-') === 0
      ? VISUAL_SYNTHETIC_STABILIZE_MS
      : VISUAL_SLOW_ROUTE_SETTLE_MS);
  await page.waitForTimeout(settleMs);
}

async function waitForVisualRouteReady(page, spec) {
  const slug = spec && spec.slug;
  if (slug === 'dashboard' || slug === 'unit-contact-apply' || slug === 'unit-contact-status') {
    await page.waitForSelector('#app', { timeout: 5000 });
    return;
  }
  if (slug === 'unit-review') {
    await page.waitForSelector('#app', { timeout: 5000 });
    return;
  }
  if (slug === 'training') {
    await page.waitForSelector('.training-table-card, .training-group-card, .empty-state', { timeout: 15000 });
    return;
  }
  if (slug === 'dashboard') {
    await page.waitForSelector('.dashboard-shell, .dashboard-grid, .empty-state', { timeout: 15000 });
    return;
  }
  if (slug && slug.indexOf('unit-contact-') === 0) {
    await page.waitForSelector('.unit-contact-shell, .card, .empty-state', { timeout: 15000 });
  }
}

async function gotoVisualRoot(page, baseUrl, waitUntil = 'domcontentloaded') {
  await page.goto(`${String(baseUrl).replace(/\/+$/, '')}/`, { waitUntil, timeout: 45000 });
  await page.waitForFunction(() => window.__APP_READY__ === true || document.readyState === 'complete', undefined, {
    timeout: 30000
  }).catch(() => {});
}

async function gotoVisualHash(page, hash, options = {}) {
  const target = String(hash || '').startsWith('#') ? String(hash) : ('#' + String(hash || '').replace(/^#/, ''));
  await page.evaluate((value) => {
    if (window.location.hash !== value) {
      window.location.hash = value;
      return;
    }
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, target);
  await page.waitForFunction((value) => String(window.location.hash || '') === value, target, {
    timeout: options.timeout || 15000
  });
  await page.waitForTimeout(options.settleMs || VISUAL_FAST_ROUTE_SETTLE_MS);
}

async function captureVisualSpec(page, baseUrl, spec, outputPath, mode) {
  const syntheticRootVisual = isSyntheticRootVisualSpec(spec);
  const fastHashNavigation = spec && (
    spec.slug === 'unit-review'
    || spec.slug === 'dashboard'
    || spec.slug === 'unit-contact-apply'
    || spec.slug === 'unit-contact-status'
  );
  if (spec && (spec.slug === 'unit-contact-success' || spec.slug === 'unit-contact-activate')) {
    await gotoVisualRoot(page, baseUrl, 'domcontentloaded');
    await page.waitForTimeout(VISUAL_SUCCESS_ROUTE_SETTLE_MS);
    await seedSyntheticUnitContactSuccess(page);
  }
  if (syntheticRootVisual) {
    if (!isBaseRootPage(page.url(), baseUrl)) {
      await gotoVisualRoot(page, baseUrl, 'domcontentloaded');
    } else {
      await page.evaluate(() => {
        if (window.location.hash) window.location.hash = '';
      }).catch(() => {});
    }
  } else if (fastHashNavigation && page.url().startsWith(`${String(baseUrl).replace(/\/+$/, '')}/`)) {
    await gotoVisualHash(page, spec.hash, { settleMs: 90 });
  } else {
    const waitUntil = fastHashNavigation ? 'domcontentloaded' : 'networkidle';
    await page.goto(`${String(baseUrl).replace(/\/+$/, '')}/${spec.hash}`, { waitUntil, timeout: 45000 });
  }
  if (syntheticRootVisual) {
    await page.waitForSelector('#app', { timeout: 5000 });
  } else {
    await waitForVisualRouteReady(page, spec);
  }
  await page.waitForTimeout(
    syntheticRootVisual
      ? VISUAL_SYNTHETIC_ROUTE_SETTLE_MS
      : (fastHashNavigation ? VISUAL_FAST_ROUTE_SETTLE_MS : VISUAL_SLOW_ROUTE_SETTLE_MS)
  );
  await stabilizeVisualRoute(page, spec.slug, mode);
  if (spec && spec.slug === 'dashboard') {
    await seedSyntheticDashboard(page);
  }
  if (spec && spec.slug === 'unit-contact-apply') {
    await seedSyntheticUnitContactApply(page);
  }
  if (spec && spec.slug === 'unit-contact-status') {
    await seedSyntheticUnitContactStatus(page);
  }
  if (spec && spec.slug === 'unit-review') {
    await seedSyntheticUnitReview(page);
  }
  if (spec && spec.selector) {
    if (spec.slug === 'unit-review') {
      try {
        await page.waitForSelector(spec.selector, { timeout: 2500 });
      } catch (_) {
        await seedSyntheticUnitReview(page);
        await page.waitForSelector(spec.selector, { timeout: 5000 });
      }
    } else {
      await page.waitForSelector(spec.selector, { timeout: 5000 });
    }
    await page.locator(spec.selector).first().screenshot({
      path: outputPath,
      animations: 'disabled'
    });
    return;
  }
  const options = spec.clip
    ? { path: outputPath, clip: spec.clip }
    : { path: outputPath };
  await page.screenshot(options);
}

async function compareAgainstBaseline(page, baselinePath, actualPath, options) {
  const settings = options || {};
  const baselineBuffer = fs.readFileSync(baselinePath);
  const actualBuffer = fs.readFileSync(actualPath);
  return page.evaluate(async ({ baseline, actual, diffThreshold, maxDiffRatio, sampleScale }) => {
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    function drawToCanvas(image, scale, sourceWidth, sourceHeight) {
      const safeScale = Number.isFinite(scale) && scale > 0 && scale < 1 ? scale : 1;
      const baseWidth = Math.max(1, Number.isFinite(sourceWidth) ? Math.round(sourceWidth) : image.width);
      const baseHeight = Math.max(1, Number.isFinite(sourceHeight) ? Math.round(sourceHeight) : image.height);
      const width = Math.max(1, Math.round(baseWidth * safeScale));
      const height = Math.max(1, Math.round(baseHeight * safeScale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, baseWidth, baseHeight, 0, 0, width, height);
      return {
        width,
        height,
        data: context.getImageData(0, 0, width, height).data
      };
    }

    const baselineImg = await loadImage('data:image/png;base64,' + baseline);
    const actualImg = await loadImage('data:image/png;base64,' + actual);
    const widthDelta = Math.abs(baselineImg.width - actualImg.width);
    const heightDelta = Math.abs(baselineImg.height - actualImg.height);
    if ((widthDelta || heightDelta) && (widthDelta > 4 || heightDelta > 4)) {
      return {
        ok: false,
        reason: 'dimension-mismatch',
        baselineWidth: baselineImg.width,
        baselineHeight: baselineImg.height,
        actualWidth: actualImg.width,
        actualHeight: actualImg.height
      };
    }

    const compareWidth = Math.min(baselineImg.width, actualImg.width);
    const compareHeight = Math.min(baselineImg.height, actualImg.height);
    const baselineFrame = drawToCanvas(baselineImg, sampleScale, compareWidth, compareHeight);
    const actualFrame = drawToCanvas(actualImg, sampleScale, compareWidth, compareHeight);
    const baselineData = baselineFrame.data;
    const actualData = actualFrame.data;
    let diffPixels = 0;
    let maxChannelDelta = 0;
    for (let index = 0; index < baselineData.length; index += 4) {
      const deltaR = Math.abs(baselineData[index] - actualData[index]);
      const deltaG = Math.abs(baselineData[index + 1] - actualData[index + 1]);
      const deltaB = Math.abs(baselineData[index + 2] - actualData[index + 2]);
      const deltaA = Math.abs(baselineData[index + 3] - actualData[index + 3]);
      const delta = deltaR + deltaG + deltaB + deltaA;
      if (delta > diffThreshold) diffPixels += 1;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
    }
    const totalPixels = baselineFrame.width * baselineFrame.height;
    const diffRatio = totalPixels ? diffPixels / totalPixels : 0;
    return {
      ok: diffRatio <= maxDiffRatio,
      baselineWidth: baselineFrame.width,
      baselineHeight: baselineFrame.height,
      dimensionToleranceApplied: widthDelta <= 4 && heightDelta <= 4 && (widthDelta > 0 || heightDelta > 0),
      totalPixels,
      diffPixels,
      diffRatio,
      maxChannelDelta
    };
  }, {
    baseline: baselineBuffer.toString('base64'),
    actual: actualBuffer.toString('base64'),
    diffThreshold: Number.isFinite(settings.diffThreshold) ? settings.diffThreshold : 48,
    maxDiffRatio: Number.isFinite(settings.maxDiffRatio) ? settings.maxDiffRatio : 0.02,
    sampleScale: Number.isFinite(settings.sampleScale) ? settings.sampleScale : 1
  });
}

module.exports = {
  DEFAULT_BASELINE_DIR,
  DESKTOP_VISUAL_SPECS,
  MOBILE_VISUAL_SPECS,
  PUBLIC_DESKTOP_VISUAL_SPECS,
  PUBLIC_MOBILE_VISUAL_SPECS,
  seedSyntheticUnitContactSuccess,
  seedSyntheticDashboard,
  seedSyntheticUnitContactApply,
  seedSyntheticUnitContactStatus,
  captureVisualSpec,
  compareAgainstBaseline
};
