const fs = require('fs');
const path = require('path');
const { startServer } = require('./server.cjs');

const projectRoot = path.resolve(__dirname, '..', '..');
const defaultRuntimeConfigPath = path.join(__dirname, 'runtime.local.json');
const runtimeConfigArg = process.argv[2] ? path.resolve(process.argv[2]) : '';
const runtimeConfigPath = runtimeConfigArg
  || (process.env.UNIT_CONTACT_BACKEND_RUNTIME_CONFIG ? path.resolve(process.env.UNIT_CONTACT_BACKEND_RUNTIME_CONFIG) : defaultRuntimeConfigPath);

function loadRuntimeConfig() {
  if (!fs.existsSync(runtimeConfigPath)) return {};
  return JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function applyEnvFromConfig(config) {
  if (!config || typeof config !== 'object') return;
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
    if (config.lists.systemUsers && !process.env.SYSTEM_USERS_LIST) {
      process.env.SYSTEM_USERS_LIST = String(config.lists.systemUsers);
    }
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

const runtimeConfig = loadRuntimeConfig();
applyEnvFromConfig(runtimeConfig);

const logDir = path.resolve(runtimeConfig.logDir || path.join(projectRoot, 'logs', 'campus-backend'));
const disposeLogger = installFileLogger(logDir);

console.log('service-host starting', {
  runtimeConfigPath,
  projectRoot,
  port: process.env.PORT || '8787'
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


