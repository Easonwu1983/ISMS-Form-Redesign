const { execFileSync } = require('child_process');

function runGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return '';
  }
}

function getBuildInfo(platform, cwd) {
  const root = cwd || process.cwd();
  const builtAt = new Date().toISOString();
  const commit = runGit(['rev-parse', 'HEAD'], root);
  const shortCommit = runGit(['rev-parse', '--short=12', 'HEAD'], root);
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  const describe = runGit(['describe', '--tags', '--always', '--dirty'], root);
  const versionKey = shortCommit || commit || builtAt.replace(/[-:TZ.]/g, '');
  return {
    platform: String(platform || '').trim(),
    builtAt,
    commit,
    shortCommit,
    branch,
    describe,
    versionKey
  };
}

module.exports = {
  getBuildInfo
};

if (require.main === module) {
  const platform = String(process.argv[2] || 'generic').trim() || 'generic';
  const buildInfo = getBuildInfo(platform, process.cwd());
  process.stdout.write(`${JSON.stringify({
    builtAt: buildInfo.builtAt,
    versionKey: buildInfo.versionKey,
    buildInfo,
    platform
  }, null, 2)}\n`);
}
