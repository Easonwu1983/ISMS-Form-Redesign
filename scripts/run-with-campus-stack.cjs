const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;
const hostConfigPath = path.join(root, '.runtime', 'runtime.local.host.json');
const serviceHostScript = path.join(root, 'm365', 'campus-backend', 'service-host.cjs');
const gatewayScript = path.join(root, 'host-campus-gateway.cjs');
const backendUrl = 'http://127.0.0.1:18080/';
const campusUrl = 'http://127.0.0.1:8088/';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
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

async function waitFor(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await requestOk(url)) return true;
    await wait(250);
  }
  return false;
}

function spawnNode(scriptPath, extraEnv) {
  return spawn(node, [scriptPath], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv
    },
    shell: false
  });
}

function terminate(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once('exit', finish);
    try {
      if (process.platform === 'win32' && Number.isFinite(Number(child.pid))) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch (_) {
      finish();
      return;
    }
    setTimeout(() => {
      try {
        if (process.platform !== 'win32') child.kill('SIGKILL');
      } catch (_) {}
      finish();
    }, 1500);
  });
}

async function main() {
  const rawCommand = process.argv.slice(2).join(' ').trim();
  if (!rawCommand) {
    console.error('Usage: node scripts/run-with-campus-stack.cjs <command>');
    process.exit(1);
  }
  if (!fs.existsSync(hostConfigPath)) {
    throw new Error(`Runtime config not found: ${hostConfigPath}`);
  }

  const envSecret = String(process.env.AUTH_SESSION_SECRET || '').trim() || 'ci-test-secret-isms';
  const stackEnv = {
    AUTH_SESSION_SECRET: envSecret,
    TEST_BASE_URL: process.env.TEST_BASE_URL || campusUrl,
    ISMS_LIVE_BASE: process.env.ISMS_LIVE_BASE || campusUrl,
    ISMS_CAMPUS_BROWSER_BASE: process.env.ISMS_CAMPUS_BROWSER_BASE || campusUrl,
    ISMS_CAMPUS_PUBLIC_BASE: process.env.ISMS_CAMPUS_PUBLIC_BASE || campusUrl,
    ISMS_CLOUDFLARE_PAGES_BASE: process.env.ISMS_CLOUDFLARE_PAGES_BASE || campusUrl,
    ISMS_CAMPUS_LOCAL_BASE: process.env.ISMS_CAMPUS_LOCAL_BASE || campusUrl
  };

  const serviceHost = spawnNode(serviceHostScript, {
    ...stackEnv,
    UNIT_CONTACT_BACKEND_RUNTIME_CONFIG: hostConfigPath
  });

  const serviceReady = await waitFor(`${backendUrl}api/unit-contact/health`);
  if (!serviceReady) {
    await terminate(serviceHost);
    throw new Error(`Backend did not become ready at ${backendUrl}`);
  }

  const gateway = spawnNode(gatewayScript, stackEnv);
  const gatewayReady = await waitFor(`${campusUrl}api/unit-contact/health`);
  if (!gatewayReady) {
    await terminate(gateway);
    await terminate(serviceHost);
    throw new Error(`Campus gateway did not become ready at ${campusUrl}`);
  }

  try {
    const child = spawn(rawCommand, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        ...stackEnv
      }
    });

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => resolve(code || 0));
    });
    process.exitCode = exitCode;
  } finally {
    await terminate(gateway);
    await terminate(serviceHost);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
