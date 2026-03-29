const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ASSET_LOADER = path.join(ROOT, 'asset-loader.js');
const CORE_BUNDLE_OUTPUT = path.join(ROOT, 'app-core.bundle.min.js');
const STYLES_SOURCE = path.join(ROOT, 'styles.css');
const STYLES_OUTPUT = path.join(ROOT, 'styles.min.css');

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
    legalComments: 'none'
  });
  return {
    assets,
    bytes: fs.statSync(CORE_BUNDLE_OUTPUT).size
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

async function main() {
  const bundle = await buildCoreBundle();
  const styles = await buildMinifiedStyles();
  console.log(JSON.stringify({
    bundleAssets: bundle.assets.length,
    bundleBytes: bundle.bytes,
    stylesBeforeBytes: styles.beforeBytes,
    stylesAfterBytes: styles.afterBytes
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
  buildMinifiedStyles
};
