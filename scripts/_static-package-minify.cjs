const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

function walkFiles(dir, baseDir = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute, baseDir);
    return [path.relative(baseDir, absolute)];
  });
}

function shouldMinify(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/');
  if (!normalized) return false;
  if (normalized.endsWith('.min.js')) return false;
  if (normalized === 'deploy-manifest.json') return false;
  return normalized.endsWith('.js') || normalized.endsWith('.css');
}

async function minifyStaticPackageAssets(outputDir) {
  const root = path.resolve(outputDir);
  if (!fs.existsSync(root)) {
    return { jsFiles: 0, cssFiles: 0, bytesSaved: 0 };
  }
  const summary = { jsFiles: 0, cssFiles: 0, bytesSaved: 0 };
  const files = walkFiles(root).filter(shouldMinify);
  for (const relPath of files) {
    const absolute = path.join(root, relPath);
    const source = fs.readFileSync(absolute, 'utf8');
    const isCss = relPath.toLowerCase().endsWith('.css');
    const result = await esbuild.transform(source, {
      loader: isCss ? 'css' : 'js',
      minify: true,
      legalComments: 'none',
      target: isCss ? undefined : 'es2020'
    });
    fs.writeFileSync(absolute, result.code, 'utf8');
    const before = Buffer.byteLength(source, 'utf8');
    const after = Buffer.byteLength(result.code, 'utf8');
    summary.bytesSaved += Math.max(0, before - after);
    if (isCss) summary.cssFiles += 1;
    else summary.jsFiles += 1;
  }
  return summary;
}

module.exports = {
  minifyStaticPackageAssets
};
