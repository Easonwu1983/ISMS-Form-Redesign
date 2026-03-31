const CONFIG_SCRIPT_CACHE_KEY_ = 'isms-cats-backend:config:v1';
const CONFIG_SCRIPT_CACHE_TTL_SECONDS_ = 300;
const INTERNAL_ERROR_LOG_PROPERTY_ = 'INTERNAL_ERROR_LOG';
const INTERNAL_ERROR_LOG_LIMIT_ = 20;

let CURRENT_REQUEST_SCOPE_ = null;

function withRequestScope_(callback) {
  const previousScope = CURRENT_REQUEST_SCOPE_;
  CURRENT_REQUEST_SCOPE_ = Object.create(null);
  try {
    return callback();
  } finally {
    CURRENT_REQUEST_SCOPE_ = previousScope;
  }
}

function getRequestScopeValue_(namespace, key, factory) {
  if (!CURRENT_REQUEST_SCOPE_) {
    return factory();
  }

  const scope = CURRENT_REQUEST_SCOPE_;
  const namespaceKey = String(namespace || 'default');
  const entryKey = String(key || 'default');
  const bucket = scope[namespaceKey] || (scope[namespaceKey] = Object.create(null));

  if (Object.prototype.hasOwnProperty.call(bucket, entryKey)) {
    return bucket[entryKey];
  }

  const value = factory();
  bucket[entryKey] = value;
  return value;
}

function invalidateRequestScopeValue_(namespace, key) {
  if (!CURRENT_REQUEST_SCOPE_) return;
  const namespaceKey = String(namespace || 'default');
  const entryKey = String(key || 'default');
  const bucket = CURRENT_REQUEST_SCOPE_[namespaceKey];
  if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, entryKey)) return;
  delete bucket[entryKey];
}

function invalidatePersistentConfigCache_() {
  try {
    CacheService.getScriptCache().remove(CONFIG_SCRIPT_CACHE_KEY_);
  } catch (err) {
    recordInternalError_('RuntimeSupport.invalidatePersistentConfigCache_', err);
  }
}

function invalidateSheetRequestScopeCaches_(sheetName) {
  const target = String(sheetName || '');
  if (!target) return;

  invalidateRequestScopeValue_('sheetRows', target);

  if (target === SHEET_NAMES.config) {
    invalidateRequestScopeValue_('config', 'map');
    invalidatePersistentConfigCache_();
  }

  if (target === SHEET_NAMES.users) {
    invalidateRequestScopeValue_('auth', 'userLookup');
  }

  if (target === SHEET_NAMES.loginSessions) {
    invalidateRequestScopeValue_('auth', 'loginSessionLookup');
  }

  if (target === SHEET_NAMES.passwordResets) {
    invalidateRequestScopeValue_('auth', 'passwordResetRows');
  }
}

function getConfigMap_() {
  return getRequestScopeValue_('config', 'map', () => {
    const cached = getConfigMapFromScriptCache_();
    if (cached) return cached;

    const configMap = buildConfigMap_(readSheetRows_(SHEET_NAMES.config));
    putConfigMapInScriptCache_(configMap);
    return configMap;
  });
}

function buildConfigMap_(rows) {
  const configMap = Object.create(null);
  (rows || []).forEach((row) => {
    const key = String(row && row.key !== undefined ? row.key : '').trim();
    if (!key) return;
    configMap[key] = row.value;
  });
  return configMap;
}

function getConfigMapFromScriptCache_() {
  try {
    const raw = CacheService.getScriptCache().get(CONFIG_SCRIPT_CACHE_KEY_);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch (err) {
    recordInternalError_('RuntimeSupport.getConfigMapFromScriptCache_', err);
    invalidatePersistentConfigCache_();
    return null;
  }
}

function putConfigMapInScriptCache_(configMap) {
  try {
    CacheService.getScriptCache().put(
      CONFIG_SCRIPT_CACHE_KEY_,
      JSON.stringify(configMap || {}),
      CONFIG_SCRIPT_CACHE_TTL_SECONDS_
    );
  } catch (err) {
    recordInternalError_('RuntimeSupport.putConfigMapInScriptCache_', err);
  }
}

function recordInternalError_(source, error, context) {
  const normalized = normalizeInternalError_(error);
  const entry = {
    time: nowIso_(),
    source: String(source || 'unknown'),
    message: normalized.message,
    name: normalized.name,
    stack: normalized.stack,
    context: serializeInternalErrorContext_(context)
  };

  console.error(`[internal] ${entry.source}: ${entry.message}`, entry.stack || '', entry.context || '');

  try {
    const props = PropertiesService.getScriptProperties();
    const current = String(props.getProperty(INTERNAL_ERROR_LOG_PROPERTY_) || '[]');
    let entries = [];
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) entries = parsed;
    } catch (_parseErr) {
      entries = [];
    }

    entries.unshift(entry);
    props.setProperty(INTERNAL_ERROR_LOG_PROPERTY_, JSON.stringify(entries.slice(0, INTERNAL_ERROR_LOG_LIMIT_)));
  } catch (persistErr) {
    console.error(
      '[internal] RuntimeSupport.recordInternalError_ failed to persist',
      persistErr && persistErr.message ? persistErr.message : String(persistErr)
    );
  }
}

function normalizeInternalError_(error) {
  if (!error) {
    return {
      name: 'Error',
      message: 'Unknown error',
      stack: ''
    };
  }

  return {
    name: String(error.name || 'Error'),
    message: String(error.message || error),
    stack: String(error.stack || '').slice(0, 4000)
  };
}

function serializeInternalErrorContext_(context) {
  if (context === undefined) return '';
  try {
    return JSON.stringify(context);
  } catch (_err) {
    return String(context);
  }
}
