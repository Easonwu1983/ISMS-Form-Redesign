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
  if (config.sharePointSiteId && !process.env.UNIT_CONTACT_SHAREPOINT_SITE_ID) {
    process.env.UNIT_CONTACT_SHAREPOINT_SITE_ID = String(config.sharePointSiteId);
  }
  if (config.sharePointSiteUrl && !process.env.UNIT_CONTACT_SHAREPOINT_SITE_URL) {
    process.env.UNIT_CONTACT_SHAREPOINT_SITE_URL = String(config.sharePointSiteUrl);
  }
  if (config.lists && typeof config.lists === 'object') {
    if (config.lists.applications && !process.env.UNIT_CONTACT_APPLICATIONS_LIST) {
      process.env.UNIT_CONTACT_APPLICATIONS_LIST = String(config.lists.applications);
    }
    if (config.lists.unitAdmins && !process.env.UNIT_CONTACT_UNITADMINS_LIST) {
      process.env.UNIT_CONTACT_UNITADMINS_LIST = String(config.lists.unitAdmins);
    }
    if (config.lists.audit && !process.env.UNIT_CONTACT_AUDIT_LIST) {
      process.env.UNIT_CONTACT_AUDIT_LIST = String(config.lists.audit);
    }
    if (config.lists.correctiveActions && !process.env.CORRECTIVE_ACTIONS_LIST) {
      process.env.CORRECTIVE_ACTIONS_LIST = String(config.lists.correctiveActions);
    }
    if (config.lists.checklists && !process.env.CHECKLISTS_LIST) {
      process.env.CHECKLISTS_LIST = String(config.lists.checklists);
    }
    if (config.lists.trainingForms && !process.env.TRAINING_FORMS_LIST) {
      process.env.TRAINING_FORMS_LIST = String(config.lists.trainingForms);
    }
    if (config.lists.trainingRosters && !process.env.TRAINING_ROSTERS_LIST) {
      process.env.TRAINING_ROSTERS_LIST = String(config.lists.trainingRosters);
    }
    if (config.lists.systemUsers && !process.env.SYSTEM_USERS_LIST) {
      process.env.SYSTEM_USERS_LIST = String(config.lists.systemUsers);
    }
    if (config.lists.reviewScopes && !process.env.REVIEW_SCOPES_LIST) {
      process.env.REVIEW_SCOPES_LIST = String(config.lists.reviewScopes);
    }
  }
  if (config.attachmentsLibrary && !process.env.ATTACHMENTS_LIBRARY) {
    process.env.ATTACHMENTS_LIBRARY = String(config.attachmentsLibrary);
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
  server.close(() => {
    console.log('service-host stopped');
    disposeLogger();
    process.exit(0);
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



