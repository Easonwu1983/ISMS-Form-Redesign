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
    clip: { x: 260, y: 64, width: 1180, height: 1420 }
  }
];

const MOBILE_VISUAL_SPECS = [
  { slug: 'dashboard', hash: '#dashboard' },
  { slug: 'training', hash: '#training' },
  { slug: 'unit-review', hash: '#unit-review' }
];

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
  }, { slug });
  await page.waitForTimeout(350);
}

async function captureVisualSpec(page, baseUrl, spec, outputPath, mode) {
  await page.goto(`${String(baseUrl).replace(/\/+$/, '')}/${spec.hash}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(900);
  await stabilizeVisualRoute(page, spec.slug, mode);
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
  captureVisualSpec,
  compareAgainstBaseline
};
