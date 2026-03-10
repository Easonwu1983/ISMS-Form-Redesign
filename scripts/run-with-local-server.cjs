const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = 8080;
const url = `http://${host}:${port}/`;
const logDir = root;
const outLogPath = path.join(logDir, '.codex-local-server.out.log');
const errLogPath = path.join(logDir, '.codex-local-server.err.log');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestOk() {
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

async function main() {
  const rawCommand = process.argv.slice(2).join(' ').trim();
  if (!rawCommand) {
    console.error('Usage: node scripts/run-with-local-server.cjs <command>');
    process.exit(1);
  }

  const outLog = fs.createWriteStream(outLogPath, { flags: 'a' });
  const errLog = fs.createWriteStream(errLogPath, { flags: 'a' });
  const server = spawn(process.execPath, ['.codex-local-server.cjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.pipe(outLog);
  server.stderr.pipe(errLog);

  try {
    const started = await waitForServer();
    if (!started) {
      throw new Error(`Local server did not become ready at ${url}`);
    }

    const child = spawn(rawCommand, {
      cwd: root,
      stdio: 'inherit',
      shell: true
    });

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => resolve(code || 0));
    });

    process.exitCode = exitCode;
  } finally {
    await terminate(server);
    outLog.end();
    errLog.end();
  }
}

main().catch(async (error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
