const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;
const host = '127.0.0.1';
const port = 8080;
const serverUrl = `http://${host}:${port}/`;
const outLogPath = path.join(root, '.codex-local-server.out.log');
const errLogPath = path.join(root, '.codex-local-server.err.log');
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
    'scripts/uat-daily-flow.cjs',
    'scripts/stress-regression.cjs'
  ]
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestOk() {
  return new Promise((resolve) => {
    const req = http.get(serverUrl, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await requestOk()) return true;
    await wait(250);
  }
  return false;
}

function terminate(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(() => resolve(), 1500);
  });
}

async function ensureServer(state) {
  if (await requestOk()) return;
  if (!state.server && await waitForServer(2000)) return;
  if (state.server) {
    await terminate(state.server);
    if (state.outLog) state.outLog.end();
    if (state.errLog) state.errLog.end();
    state.server = null;
    state.outLog = null;
    state.errLog = null;
  }
  const outLog = fs.createWriteStream(outLogPath, { flags: 'a' });
  const errLog = fs.createWriteStream(errLogPath, { flags: 'a' });
  const server = spawn(node, ['.codex-local-server.cjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.pipe(outLog);
  server.stderr.pipe(errLog);
  const started = await waitForServer();
  if (!started) {
    outLog.end();
    errLog.end();
    await terminate(server);
    throw new Error(`Local server did not become ready at ${serverUrl}`);
  }
  state.server = server;
  state.outLog = outLog;
  state.errLog = errLog;
}

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
  const runtime = {
    server: null,
    outLog: null,
    errLog: null
  };

  const queue = suite === 'all'
    ? suites.role.concat(suites.training, suites.bonus)
    : suites[suite];

  try {
    for (const script of queue) {
      await ensureServer(runtime);
      const code = await runScript(script);
      if (code !== 0) {
        process.exit(code);
        return;
      }
    }
  } finally {
    if (runtime.server) await terminate(runtime.server);
    if (runtime.outLog) runtime.outLog.end();
    if (runtime.errLog) runtime.errLog.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
