const fs = require('fs');
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

process.chdir(projectRoot);

const runtimeConfigPath = resolveRuntimeConfigPath();
const runtimeConfig = loadRuntimeConfig(runtimeConfigPath);
applyEnvFromConfig(runtimeConfig);
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

function shutdown(signal) {
  console.log(`service-host received ${signal}, shutting down`);
  const db = require('./db.cjs');
  db.close().catch(() => {}).finally(() => {
    server.close(() => {
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



