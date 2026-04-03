// @ts-check
﻿const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const runtimeConfigArg = process.argv[2] ? path.resolve(process.argv[2]) : '';

function resolveRuntimeConfigPath() {
  const candidates = [];
  const explicitArg = String(runtimeConfigArg || '').trim();
  const envPath = String(process.env.UNIT_CONTACT_BACKEND_RUNTIME_CONFIG || '').trim();
  if (explicitArg) candidates.push(explicitArg);
  if (envPath) candidates.push(path.resolve(envPath));
  candidates.push(
    path.join(projectRoot, '.runtime', 'runtime.local.host.json'),
    path.join(__dirname, 'runtime.local.json'),
    path.join(projectRoot, 'm365', 'campus-backend', 'runtime.local.json')
  );
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return candidates[0] || '';
}

function loadRuntimeConfig(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid runtime config JSON at ${filePath}: ${error.message}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function applyEnvFromConfig(config) {
  if (!config || typeof config !== 'object') return;
  if (config.authSessionSecret && !process.env.AUTH_SESSION_SECRET) {
    process.env.AUTH_SESSION_SECRET = String(config.authSessionSecret);
  }
  const tokenMode = String(config.tokenMode || config.graphTokenMode || '').trim().toLowerCase();
  if (tokenMode && !process.env.M365_A3_TOKEN_MODE) {
    process.env.M365_A3_TOKEN_MODE = tokenMode;
  }
  if (config.port && !process.env.PORT) process.env.PORT = String(config.port);
  if (Array.isArray(config.allowedOrigins) && !process.env.UNIT_CONTACT_ALLOWED_ORIGINS) {
    process.env.UNIT_CONTACT_ALLOWED_ORIGINS = config.allowedOrigins.join(',');
  }
  // Note: SharePoint site/list config removed — all data now in PostgreSQL.
  // Graph Mail token config (M365_A3_TOKEN_MODE) kept for interim mail sending.
  if (config.postgres && typeof config.postgres === 'object') {
    const pg = config.postgres;
    if (pg.host && !process.env.PG_HOST) process.env.PG_HOST = String(pg.host);
    if (pg.port && !process.env.PG_PORT) process.env.PG_PORT = String(pg.port);
    if (pg.database && !process.env.PG_DATABASE) process.env.PG_DATABASE = String(pg.database);
    if (pg.user && !process.env.PG_USER) process.env.PG_USER = String(pg.user);
    if (pg.password && !process.env.PG_PASSWORD) process.env.PG_PASSWORD = String(pg.password);
    if (pg.poolMin && !process.env.PG_POOL_MIN) process.env.PG_POOL_MIN = String(pg.poolMin);
    if (pg.poolMax && !process.env.PG_POOL_MAX) process.env.PG_POOL_MAX = String(pg.poolMax);
  }
  if (config.attachmentsDir && !process.env.ATTACHMENTS_DIR) {
    process.env.ATTACHMENTS_DIR = String(config.attachmentsDir);
  }
  const mailSenderUpn = String(
    config.mailSenderUpn
      || config.graphMailSenderUpn
      || config.authMailSenderUpn
      || ''
  ).trim();
  if (mailSenderUpn) {
    if (!process.env.GRAPH_MAIL_SENDER_UPN) {
      process.env.GRAPH_MAIL_SENDER_UPN = mailSenderUpn;
    }
    if (!process.env.AUTH_MAIL_SENDER_UPN) {
      process.env.AUTH_MAIL_SENDER_UPN = mailSenderUpn;
    }
  }
}

function installFileLogger(logDir) {
  ensureDir(logDir);
  const logPath = path.join(logDir, 'unit-contact-campus-backend.log');
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);

  function write(level, args) {
    const line = `[${new Date().toISOString()}] [${level}] ${args.map((value) => {
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch (_) {
        return String(value);
      }
    }).join(' ')}\n`;
    stream.write(line);
  }

  console.log = (...args) => {
    write('INFO', args);
    originalLog(...args);
  };
  console.error = (...args) => {
    write('ERROR', args);
    originalError(...args);
  };

  return () => {
    stream.end();
  };
}

function validateRequiredEnv() {
  const required = [
    { key: 'AUTH_SESSION_SECRET', hint: 'Set authSessionSecret in runtime.local.json or AUTH_SESSION_SECRET env var' },
    { key: 'PG_DATABASE', hint: 'Set postgres.database in runtime.local.json or PG_DATABASE env var' },
    { key: 'PG_USER', hint: 'Set postgres.user in runtime.local.json or PG_USER env var' },
    { key: 'PG_PASSWORD', hint: 'Set postgres.password in runtime.local.json or PG_PASSWORD env var' }
  ];
  const missing = required.filter((r) => !String(process.env[r.key] || '').trim());
  if (missing.length) {
    const lines = missing.map((r) => `  - ${r.key}: ${r.hint}`);
    console.error('FATAL: Missing required environment variables:\n' + lines.join('\n'));
    process.exit(1);
  }
  // Validate session secret strength
  const secret = String(process.env.AUTH_SESSION_SECRET || '');
  if (secret.length < 16) {
    console.error('FATAL: AUTH_SESSION_SECRET must be at least 16 characters for adequate security.');
    process.exit(1);
  }
}

process.chdir(projectRoot);

const runtimeConfigPath = resolveRuntimeConfigPath();
const runtimeConfig = loadRuntimeConfig(runtimeConfigPath);
applyEnvFromConfig(runtimeConfig);
validateRequiredEnv();
const { startServer } = require('./server.cjs');

const logDir = path.resolve(runtimeConfig.logDir || path.join(projectRoot, 'logs', 'campus-backend'));
const disposeLogger = installFileLogger(logDir);

console.log('service-host starting', {
  runtimeConfigPath,
  runtimeConfigExists: !!runtimeConfigPath && fs.existsSync(runtimeConfigPath),
  projectRoot,
  port: process.env.PORT || '8787',
  tokenMode: String(process.env.M365_A3_TOKEN_MODE || '').trim() || 'unset',
  mailSenderUpn: String(process.env.GRAPH_MAIL_SENDER_UPN || process.env.AUTH_MAIL_SENDER_UPN || '').trim() || 'unset'
});

const server = startServer(Number(process.env.PORT || 8787));

// ── Health check watchdog (every 5 min, exit if 3 consecutive failures) ──
let healthFailCount = 0;
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const HEALTH_FAIL_THRESHOLD = 3;
const healthWatchdog = setInterval(function () {
  var port = Number(process.env.PORT || 8787);
  var req = require('http').get('http://127.0.0.1:' + port + '/api/auth/health', { timeout: 10000 }, function (res) {
    var data = '';
    res.on('data', function (c) { data += c; });
    res.on('end', function () {
      if (res.statusCode === 200) { healthFailCount = 0; }
      else { healthFailCount++; console.error('[watchdog] Health check returned ' + res.statusCode + ' (fail ' + healthFailCount + '/' + HEALTH_FAIL_THRESHOLD + ')'); }
      if (healthFailCount >= HEALTH_FAIL_THRESHOLD) { console.error('[watchdog] Health check failed ' + HEALTH_FAIL_THRESHOLD + ' times, exiting for systemd restart'); process.exit(1); }
    });
  });
  req.on('error', function (err) {
    healthFailCount++;
    console.error('[watchdog] Health check error: ' + String(err && err.message || err) + ' (fail ' + healthFailCount + '/' + HEALTH_FAIL_THRESHOLD + ')');
    if (healthFailCount >= HEALTH_FAIL_THRESHOLD) { console.error('[watchdog] Exiting for systemd restart'); process.exit(1); }
  });
  req.on('timeout', function () { req.destroy(); healthFailCount++; console.error('[watchdog] Health check timeout (fail ' + healthFailCount + '/' + HEALTH_FAIL_THRESHOLD + ')'); });
}, HEALTH_CHECK_INTERVAL_MS);
healthWatchdog.unref();
console.log('[watchdog] Health check started (every ' + (HEALTH_CHECK_INTERVAL_MS / 60000) + ' min, threshold ' + HEALTH_FAIL_THRESHOLD + ')');

// ── Crash logger ──
process.on('uncaughtException', function (err) {
  console.error('[CRASH] Uncaught exception:', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
process.on('unhandledRejection', function (reason) {
  console.error('[CRASH] Unhandled rejection:', reason && reason.stack ? reason.stack : String(reason));
});

// ── Error alerter ──
try {
  const { startAlertSchedule } = require('./error-alerter.cjs');
  // Note: Graph Mail requires graphRequest/getDelegatedToken from the server context,
  // which isn't available at service-host level. Error alerts are logged to console
  // and written to ops_audit table instead.
  startAlertSchedule(function (opts) {
    // Write error summary to audit trail instead of sending email
    var db = require('./db.cjs');
    return db.query(
      'INSERT INTO ops_audit (title, event_type, actor_email, record_id, occurred_at, payload_json) VALUES ($1,$2,$3,$4,$5,$6)',
      ['error-alert', 'system.error_alert', 'system', 'error-alert-' + Date.now(), new Date().toISOString(), JSON.stringify({ subject: opts.subject, errorCount: (opts.html || '').split('<tr>').length - 2 })]
    ).then(function () { console.log('[error-alerter] Alert recorded to audit trail'); return { sent: true, channel: 'audit-trail' }; })
    .catch(function (err) { console.warn('[error-alerter] Failed to record alert:', String(err && err.message || err)); return { sent: false, channel: 'audit-trail', error: String(err && err.message || err) }; });
  });
} catch (err) {
  console.warn('[service-host] Error alerter init failed:', String(err && err.message || err));
}

// ── Daily overdue check schedule (every 24 hours) ──
const OVERDUE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let overdueCheckTimer = null;
function scheduleOverdueCheck() {
  // Run first check 10 minutes after startup, then every 24 hours
  overdueCheckTimer = setTimeout(function runOverdueCheck() {
    var db = require('./db.cjs');
    db.queryAll("SELECT case_id, handler_email, handler_unit, handler_name, corrective_due_date, status FROM corrective_actions WHERE status NOT IN ('結案') AND corrective_due_date < NOW() AND corrective_due_date IS NOT NULL").then(function (rows) {
      console.log('[overdue-schedule] Daily check: found ' + (rows || []).length + ' overdue items.');
    }).catch(function (err) {
      console.warn('[overdue-schedule] Check failed:', String(err && err.message || err));
    });
    overdueCheckTimer = setTimeout(runOverdueCheck, OVERDUE_CHECK_INTERVAL_MS);
    overdueCheckTimer.unref();
  }, 10 * 60 * 1000);
  overdueCheckTimer.unref();
}
scheduleOverdueCheck();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`service-host received ${signal}, shutting down gracefully`);
  const shutdownTimeout = setTimeout(() => {
    console.error('service-host shutdown timed out after 10s, forcing exit');
    disposeLogger();
    process.exit(1);
  }, 10000);
  shutdownTimeout.unref();
  server.close(() => {
    console.log('service-host http server closed');
    const db = require('./db.cjs');
    db.close().then(() => {
      console.log('service-host database pool closed');
    }).catch((err) => {
      console.error('service-host db close error', err && err.message || err);
    }).finally(() => {
      clearTimeout(shutdownTimeout);
      console.log('service-host stopped');
      disposeLogger();
      process.exit(0);
    });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('uncaughtException', error && error.stack ? error.stack : error);
});
process.on('unhandledRejection', (error) => {
  console.error('unhandledRejection', error && error.stack ? error.stack : error);
});



