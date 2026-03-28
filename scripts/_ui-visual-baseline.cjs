const fs = require('fs');
const path = require('path');

const DEFAULT_BASELINE_DIR = path.resolve(process.env.ISMS_UI_BASELINE_DIR || path.join(process.cwd(), 'visual-baseline'));

const DESKTOP_VISUAL_SPECS = [
  {
    slug: 'dashboard',
    hash: '#dashboard',
    clip: { x: 260, y: 64, width: 1180, height: 1260 }
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
  { slug: 'dashboard', hash: '#dashboard' },
  { slug: 'training', hash: '#training' },
  { slug: 'unit-review', hash: '#unit-review', selector: '#visual-unit-review-shell' }
];

const PUBLIC_DESKTOP_VISUAL_SPECS = [
  { slug: 'unit-contact-apply', hash: '#apply-unit-contact' },
  { slug: 'unit-contact-status', hash: '#apply-unit-contact-status' },
  { slug: 'unit-contact-success', hash: '#apply-unit-contact-success/UCA-SMOKE-SUCCESS-001' },
  { slug: 'unit-contact-activate', hash: '#activate-unit-contact/UCA-SMOKE-SUCCESS-001' }
];

const PUBLIC_MOBILE_VISUAL_SPECS = [
  { slug: 'unit-contact-apply', hash: '#apply-unit-contact' },
  { slug: 'unit-contact-status', hash: '#apply-unit-contact-status' },
  { slug: 'unit-contact-success', hash: '#apply-unit-contact-success/UCA-SMOKE-SUCCESS-001' },
  { slug: 'unit-contact-activate', hash: '#activate-unit-contact/UCA-SMOKE-SUCCESS-001' }
];

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
  await page.waitForFunction(() => {
    const tableCard = document.querySelector('.governance-table-card, .review-table-card');
    return !!tableCard;
  }, { timeout: 10000 }).catch(() => null);

  await page.evaluate(() => {
    const hostCard = document.querySelector('.governance-table-card, .review-table-card');
    if (!hostCard) return;
    hostCard.id = 'visual-unit-review-shell';
    hostCard.classList.add('visual-unit-review-shell');
    hostCard.innerHTML = `
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
    const historyCard = document.querySelector('.review-history-card');
    if (historyCard) historyCard.classList.add('visual-smoke-hide');
  });

  await page.waitForTimeout(150);
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
      .dashboard-meta-value,
      .dashboard-panel-pill-value,
      .legend-count,
      .stat-value,
      .dashboard-focus-item strong,
      .dashboard-recent-id-text,
      .dashboard-recent-desc,
      .dashboard-recent-handler-name,
      .dashboard-recent-date-value {
        color: transparent !important;
        text-shadow: none !important;
      }
      .donut-chart text {
        fill: transparent !important;
      }
      .donut-chart circle {
        stroke: rgba(226, 232, 240, 0.92) !important;
        stroke-dasharray: none !important;
        stroke-dashoffset: 0 !important;
      }
      .dashboard-recent-status-cell .badge,
      .dashboard-recent-status-cell .badge-dot {
        background: rgba(226, 232, 240, 0.92) !important;
        border-color: rgba(226, 232, 240, 0.92) !important;
        color: transparent !important;
      }
      .dashboard-recent-table tbody {
        display: none !important;
      }
      .dashboard-recent-table-wrapper {
        max-height: none !important;
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
        max-width: ${mode === 'mobile' ? '360px' : '760px'} !important;
        margin: 0 auto !important;
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

  if (slug === 'unit-contact-apply' || slug === 'unit-contact-status' || slug === 'unit-contact-success' || slug === 'unit-contact-activate') {
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
  await page.waitForTimeout(slug === 'unit-review' ? 180 : 350);
}

async function waitForVisualRouteReady(page, spec) {
  const slug = spec && spec.slug;
  if (slug === 'unit-review') {
    await page.waitForSelector('.review-page-header, .review-table-card, .governance-category-stack, .empty-state', { timeout: 15000 });
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

async function captureVisualSpec(page, baseUrl, spec, outputPath, mode) {
  if (spec && (spec.slug === 'unit-contact-success' || spec.slug === 'unit-contact-activate')) {
    await page.goto(`${String(baseUrl).replace(/\/+$/, '')}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(600);
    await seedSyntheticUnitContactSuccess(page);
  }
  const waitUntil = spec && spec.slug === 'unit-review' ? 'domcontentloaded' : 'networkidle';
  await page.goto(`${String(baseUrl).replace(/\/+$/, '')}/${spec.hash}`, { waitUntil, timeout: 45000 });
  await waitForVisualRouteReady(page, spec);
  await page.waitForTimeout(spec && spec.slug === 'unit-review' ? 120 : 900);
  await stabilizeVisualRoute(page, spec.slug, mode);
  if (spec && spec.slug === 'unit-review') {
    await seedSyntheticUnitReview(page);
  }
  if (spec && spec.selector) {
    await page.waitForSelector(spec.selector, { timeout: 5000 });
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

    function drawToCanvas(image, scale) {
      const safeScale = Number.isFinite(scale) && scale > 0 && scale < 1 ? scale : 1;
      const width = Math.max(1, Math.round(image.width * safeScale));
      const height = Math.max(1, Math.round(image.height * safeScale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      return {
        width,
        height,
        data: context.getImageData(0, 0, width, height).data
      };
    }

    const baselineImg = await loadImage('data:image/png;base64,' + baseline);
    const actualImg = await loadImage('data:image/png;base64,' + actual);
    if (baselineImg.width !== actualImg.width || baselineImg.height !== actualImg.height) {
      return {
        ok: false,
        reason: 'dimension-mismatch',
        baselineWidth: baselineImg.width,
        baselineHeight: baselineImg.height,
        actualWidth: actualImg.width,
        actualHeight: actualImg.height
      };
    }

    const baselineFrame = drawToCanvas(baselineImg, sampleScale);
    const actualFrame = drawToCanvas(actualImg, sampleScale);
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
  captureVisualSpec,
  compareAgainstBaseline
};
