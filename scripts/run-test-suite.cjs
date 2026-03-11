const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;
const suites = {
  role: [
    'scripts/route-permission-matrix.cjs',
    'scripts/role-flow-probe.cjs',
    'scripts/admin-reporter-regression.cjs',
    'scripts/unit-admin-reporter-security-regression.cjs',
    'scripts/role-flow-smoke.cjs'
  ],
  training: [
    'scripts/training-optimization-regression.cjs',
    'scripts/training-flow-acceptance.cjs'
  ],
  bonus: [
    'scripts/upload-security-regression.cjs',
    'scripts/security-regression.cjs',
    'scripts/unit-contact-public-smoke.cjs',
    'scripts/uat-daily-flow.cjs',
    'scripts/stress-regression.cjs'
  ]
};

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [scriptPath], {
      cwd: root,
      stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code || 0));
  });
}

async function main() {
  const suite = String(process.argv[2] || '').trim();
  if (!suite || !['role', 'training', 'bonus', 'all'].includes(suite)) {
    console.error('Usage: node scripts/run-test-suite.cjs <role|training|bonus|all>');
    process.exit(1);
  }
  const queue = suite === 'all'
    ? suites.role.concat(suites.training, suites.bonus)
    : suites[suite];

  for (const script of queue) {
    const code = await runScript(script);
    if (code !== 0) {
      process.exit(code);
      return;
    }
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
