const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { PurgeCSS } = require('purgecss');

const ROOT = path.resolve(__dirname, '..');
const ASSET_LOADER = path.join(ROOT, 'asset-loader.js');
const CORE_BUNDLE_OUTPUT = path.join(ROOT, 'app-core.bundle.min.js');
const FEATURE_BUNDLE_DIR = path.join(ROOT, 'feature-bundles');
const FEATURE_ENTRY_DIR = path.join(ROOT, '.tmp-build', 'feature-bundle-entries');
const CRITICAL_STYLES_SOURCE = path.join(ROOT, 'styles.critical.css');
const CRITICAL_STYLES_OUTPUT = path.join(ROOT, 'styles.critical.min.css');
const STYLES_SOURCE = path.join(ROOT, 'styles.css');
const STYLES_OUTPUT = path.join(ROOT, 'styles.min.css');
const STYLES_PURGED_OUTPUT = path.join(ROOT, 'styles.purged.min.css');

const FEATURE_BUNDLE_CONFIG = {
  'admin-feature': ['admin-collection-cache-module.js', 'admin-audit-trail-module.js', 'admin-login-log-module.js', 'admin-security-window-module.js', 'admin-module.js'],
  'case-feature': ['attachment-module.js', 'case-module.js'],
  'checklist-feature': ['attachment-module.js', 'checklist-module.js'],
  'training-feature': ['attachment-module.js', 'training-module.js'],
  'unit-contact-application-feature': ['unit-contact-application-module.js'],
  'asset-inventory-feature': ['asset-inventory-module.js']
};

const PURGE_IGNORE_DIRS = new Set([
  '.git',
  '.agents',
  '.runtime',
  'dist',
  'docs',
  'logs',
  'node_modules',
  'vendor',
  'visual-baseline',
  'feature-bundles'
]);

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function walkContentFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (PURGE_IGNORE_DIRS.has(entry.name)) return [];
      return walkContentFiles(absolute);
    }
    if (!/\.(html|js)$/i.test(entry.name)) return [];
    return [absolute];
  });
}

function extractFallbackAssets() {
  const source = fs.readFileSync(ASSET_LOADER, 'utf8');
  const match = source.match(/var fallbackAssets = \[(.*?)\];/s);
  if (!match) {
    throw new Error('fallbackAssets array not found in asset-loader.js');
  }
  const assets = [];
  for (const line of match[1].split(/\r?\n/)) {
    const itemMatch = line.match(/'([^']+\.js)'/);
    if (itemMatch) {
      assets.push(itemMatch[1]);
    }
  }
  if (!assets.length) {
    throw new Error('fallbackAssets array is empty');
  }
  return assets;
}

function buildPurgeSafelist() {
  return {
    standard: [
      'hidden',
      'open',
      'show',
      'active',
      'selected',
      'disabled',
      'checked',
      'loading',
      'error',
      'success',
      'warning',
      'pending',
      'passed',
      'failed',
      'sr-only'
    ],
    deep: [
      /^app-/,
      /^auth-/,
      /^audit-/,
      /^badge-/,
      /^btn-/,
      /^card-/,
      /^case-/,
      /^checklist-/,
      /^copy-/,
      /^dashboard/,
      /^detail-/,
      /^dialog/,
      /^empty-state/,
      /^file-/,
      /^form-/,
      /^header-/,
      /^icon/,
      /^is-/,
      /^lucide/,
      /^modal/,
      /^nav/,
      /^page-/,
      /^pager/,
      /^pill-/,
      /^policy-/,
      /^review-/,
      /^security-/,
      /^shell-/,
      /^sidebar/,
      /^stat-/,
      /^status-/,
      /^table-/,
      /^tag-/,
      /^toast/,
      /^training-/,
      /^unit-/,
      /^upload-/,
      /^workflow-/
    ],
    greedy: [
      /(^|\s)is-[a-z0-9-]+/i,
      /(^|\s)has-[a-z0-9-]+/i,
      /(^|\s)btn-[a-z0-9-]+/i,
      /(^|\s)badge-[a-z0-9-]+/i,
      /(^|\s)status-[a-z0-9-]+/i,
      /(^|\s)training-[a-z0-9-]+/i,
      /(^|\s)checklist-[a-z0-9-]+/i,
      /(^|\s)case-[a-z0-9-]+/i,
      /(^|\s)unit-[a-z0-9-]+/i,
      /(^|\s)audit-[a-z0-9-]+/i
    ]
  };
}

function collectPurgeContent() {
  return walkContentFiles(ROOT).map((absolutePath) => ({
    raw: fs.readFileSync(absolutePath, 'utf8'),
    extension: path.extname(absolutePath).replace(/^\./, '') || 'txt'
  }));
}

async function buildCoreBundle() {
  const assets = extractFallbackAssets();
  const entrySource = assets.map((assetPath) => `import './${assetPath}';`).join('\n');
  await esbuild.build({
    stdin: {
      contents: entrySource,
      resolveDir: ROOT,
      sourcefile: 'app-core.bundle.entry.js',
      loader: 'js'
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    outfile: CORE_BUNDLE_OUTPUT,
    minify: true,
    treeShaking: true,
    legalComments: 'none'
  });
  return {
    assets,
    bytes: fs.statSync(CORE_BUNDLE_OUTPUT).size
  };
}

async function buildFeatureBundles() {
  fs.rmSync(FEATURE_BUNDLE_DIR, { recursive: true, force: true });
  fs.rmSync(FEATURE_ENTRY_DIR, { recursive: true, force: true });
  ensureDir(FEATURE_BUNDLE_DIR);
  ensureDir(FEATURE_ENTRY_DIR);
  const entryPoints = [];
  Object.entries(FEATURE_BUNDLE_CONFIG).forEach(([bundleName, assets]) => {
    const entryPath = path.join(FEATURE_ENTRY_DIR, bundleName + '.js');
    const contents = assets.map((assetPath) => `import '../../${assetPath}';`).join('\n');
    fs.writeFileSync(entryPath, contents + '\n', 'utf8');
    entryPoints.push(entryPath);
  });
  const result = await esbuild.build({
    entryPoints,
    outdir: FEATURE_BUNDLE_DIR,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    minify: true,
    treeShaking: true,
    legalComments: 'none',
    metafile: true
  });
  fs.rmSync(FEATURE_ENTRY_DIR, { recursive: true, force: true });
  const outputs = Object.keys((result && result.metafile && result.metafile.outputs) || {}).map((entry) => path.relative(ROOT, entry).replace(/\\/g, '/'));
  return {
    bundleCount: Object.keys(FEATURE_BUNDLE_CONFIG).length,
    outputCount: outputs.length,
    outputs
  };
}

async function buildMinifiedStyles() {
  const source = fs.readFileSync(STYLES_SOURCE, 'utf8');
  const result = await esbuild.transform(source, {
    loader: 'css',
    minify: true,
    legalComments: 'none'
  });
  fs.writeFileSync(STYLES_OUTPUT, result.code, 'utf8');
  return {
    beforeBytes: Buffer.byteLength(source, 'utf8'),
    afterBytes: Buffer.byteLength(result.code, 'utf8')
  };
}

async function buildCriticalStyles() {
  const source = fs.readFileSync(CRITICAL_STYLES_SOURCE, 'utf8');
  const result = await esbuild.transform(source, {
    loader: 'css',
    minify: true,
    legalComments: 'none'
  });
  fs.writeFileSync(CRITICAL_STYLES_OUTPUT, result.code, 'utf8');
  return {
    beforeBytes: Buffer.byteLength(source, 'utf8'),
    afterBytes: Buffer.byteLength(result.code, 'utf8')
  };
}

async function buildPurgedStyles() {
  const source = fs.readFileSync(STYLES_SOURCE, 'utf8');
  const purgecss = new PurgeCSS();
  const [result] = await purgecss.purge({
    content: collectPurgeContent(),
    css: [{ raw: source }],
    safelist: buildPurgeSafelist(),
    rejected: true
  });
  const purgedCss = result && typeof result.css === 'string' && result.css.trim() ? result.css : source;
  const minified = await esbuild.transform(purgedCss, {
    loader: 'css',
    minify: true,
    legalComments: 'none'
  });
  fs.writeFileSync(STYLES_PURGED_OUTPUT, minified.code, 'utf8');
  return {
    beforeBytes: Buffer.byteLength(source, 'utf8'),
    purgedBytes: Buffer.byteLength(purgedCss, 'utf8'),
    afterBytes: Buffer.byteLength(minified.code, 'utf8'),
    rejectedCount: Array.isArray(result && result.rejected) ? result.rejected.length : 0
  };
}

async function buildAllCoreAssets() {
  const bundle = await buildCoreBundle();
  const featureBundles = await buildFeatureBundles();
  const criticalStyles = await buildCriticalStyles();
  const styles = await buildMinifiedStyles();
  const purgedStyles = await buildPurgedStyles();
  return {
    bundle,
    featureBundles,
    criticalStyles,
    styles,
    purgedStyles
  };
}

async function main() {
  const result = await buildAllCoreAssets();
  console.log(JSON.stringify({
    bundleAssets: result.bundle.assets.length,
    bundleBytes: result.bundle.bytes,
    featureBundleCount: result.featureBundles.bundleCount,
    featureOutputCount: result.featureBundles.outputCount,
    criticalStylesBeforeBytes: result.criticalStyles.beforeBytes,
    criticalStylesAfterBytes: result.criticalStyles.afterBytes,
    stylesBeforeBytes: result.styles.beforeBytes,
    stylesAfterBytes: result.styles.afterBytes,
    purgedBeforeBytes: result.purgedStyles.beforeBytes,
    purgedBytes: result.purgedStyles.purgedBytes,
    purgedAfterBytes: result.purgedStyles.afterBytes,
    purgedRejectedCount: result.purgedStyles.rejectedCount
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildCoreBundle,
  buildFeatureBundles,
  buildCriticalStyles,
  buildMinifiedStyles,
  buildPurgedStyles,
  buildAllCoreAssets
};
