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
    clip: { x: 260, y: 64, width: 1180, height: 1080 }
  }
];

const MOBILE_VISUAL_SPECS = [
  { slug: 'dashboard', hash: '#dashboard' },
  { slug: 'training', hash: '#training' },
  { slug: 'unit-review', hash: '#unit-review', clip: { x: 0, y: 0, width: 390, height: 980 } }
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
      unitCategory: '行政單位',
      primaryUnit: '計算機及資訊網路中心',
      secondaryUnit: '資訊網路組',
      applicantName: '王小明',
      applicantEmail: 'unit-contact-smoke@example.com',
      extensionNumber: '61234',
      note: 'Synthetic public success page baseline',
      status: 'pending_review',
      statusLabel: '待審核',
      statusTone: 'pending',
      statusDetail: '申請已送出，等待管理者審核。',
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
    const tableCard = document.querySelector('.review-table-card');
    const historyCard = document.querySelector('.review-history-card');
    return !!tableCard && !!historyCard;
  }, { timeout: 10000 }).catch(() => null);

  await page.evaluate(() => {
    const tableBody = document.querySelector('.review-table-card table tbody');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state review-empty">
              <div class="empty-state-icon" aria-hidden="true">○</div>
              <div class="empty-state-title">目前沒有待治理的自訂單位</div>
              <div class="empty-state-desc">所有單位都已符合正式名錄，或已由最高管理員審核完成。</div>
            </div>
          </td>
        </tr>
      `;
    }

    const history = document.querySelector('.review-history-card .review-history-list');
    if (history) {
      history.innerHTML = '<div class="empty-state" style="padding:32px 20px"><div class="empty-state-title">尚無治理紀錄</div></div>';
    }

    const governanceStack = document.querySelector('.governance-category-stack');
    if (governanceStack) {
      governanceStack.innerHTML = `
        <details class="governance-category-card" open>
          <summary class="governance-category-summary">
            <div>
              <strong>?? / ????</strong>
              <div class="review-card-subtitle">Synthetic focused baseline</div>
            </div>
            <div class="review-chip-row">
              <span class="review-count-chip">??? 4</span>
              <span class="review-count-chip">?? 2</span>
              <span class="review-count-chip">?? 2</span>
            </div>
          </summary>
          <div class="review-card-body" style="padding-top:12px">
            <div class="review-history-item" style="min-height:84px"></div>
            <div class="review-history-item" style="min-height:84px"></div>
          </div>
        </details>
        <details class="governance-category-card">
          <summary class="governance-category-summary">
            <div>
              <strong>????</strong>
              <div class="review-card-subtitle">Synthetic focused baseline</div>
            </div>
            <div class="review-chip-row">
              <span class="review-count-chip">??? 3</span>
              <span class="review-count-chip">?? 1</span>
              <span class="review-count-chip">?? 2</span>
            </div>
          </summary>
          <div class="review-card-body" style="padding-top:12px">
            <div class="review-history-item" style="min-height:72px"></div>
          </div>
        </details>
      `;
    }
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

async function captureVisualSpec(page, baseUrl, spec, outputPath, mode) {
  if (spec && (spec.slug === 'unit-contact-success' || spec.slug === 'unit-contact-activate')) {
    await page.goto(`${String(baseUrl).replace(/\/+$/, '')}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(600);
    await seedSyntheticUnitContactSuccess(page);
  }
  await page.goto(`${String(baseUrl).replace(/\/+$/, '')}/${spec.hash}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(spec && spec.slug === 'unit-review' ? 450 : 900);
  await stabilizeVisualRoute(page, spec.slug, mode);
  if (spec && spec.slug === 'unit-review') {
    await seedSyntheticUnitReview(page);
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
  return page.evaluate(async ({ baseline, actual, diffThreshold, maxDiffRatio }) => {
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    function drawToCanvas(image) {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
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

    const baselineData = drawToCanvas(baselineImg);
    const actualData = drawToCanvas(actualImg);
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
    const totalPixels = baselineImg.width * baselineImg.height;
    const diffRatio = totalPixels ? diffPixels / totalPixels : 0;
    return {
      ok: diffRatio <= maxDiffRatio,
      baselineWidth: baselineImg.width,
      baselineHeight: baselineImg.height,
      totalPixels,
      diffPixels,
      diffRatio,
      maxChannelDelta
    };
  }, {
    baseline: baselineBuffer.toString('base64'),
    actual: actualBuffer.toString('base64'),
    diffThreshold: Number.isFinite(settings.diffThreshold) ? settings.diffThreshold : 48,
    maxDiffRatio: Number.isFinite(settings.maxDiffRatio) ? settings.maxDiffRatio : 0.02
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
