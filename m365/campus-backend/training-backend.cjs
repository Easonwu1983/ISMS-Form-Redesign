const {
  CONTRACT_VERSION,
  FORM_ACTIONS,
  ROSTER_ACTIONS,
  FORM_STATUSES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  createTrainingFormRecord,
  createTrainingRosterRecord,
  mapGraphFieldsToTrainingForm,
  mapGraphFieldsToTrainingRoster,
  mapTrainingFormForClient,
  mapTrainingFormToGraphFields,
  mapTrainingRosterForClient,
  mapTrainingRosterToGraphFields,
  normalizeTrainingFormPayload,
  normalizeTrainingRosterPayload,
  validateActionEnvelope,
  validateTrainingFormPayload,
  validateTrainingRosterPayload
} = require('../azure-function/training-api/src/shared/contract');
const fs = require('fs');
const path = require('path');

const {
  buildFieldChanges,
  summarizeAttachments
} = require('./audit-diff.cjs');

function createTrainingRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    graphRequest,
    resolveSiteId,
    getDelegatedToken,
    requestAuthz
  } = deps;

  const state = {
    listMap: null,
    nextRosterSequence: null,
    rosterSequenceLock: Promise.resolve(),
    formsCache: null,
    formsCacheAt: 0,
    formsCachePromise: null,
    formsQueryCache: new Map(),
    rostersCache: null,
    rostersCacheAt: 0,
    rostersCachePromise: null,
    rostersPrewarmQueued: false,
    rostersQueryCache: new Map()
  };
  const TRAINING_ROSTERS_PREWARM_DELAY_MS = 15000;
  const TRAINING_ROSTERS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const TRAINING_FORMS_QUERY_CACHE_MS = 60000;
  const TRAINING_FORMS_QUERY_CACHE_MAX = 48;
  const TRAINING_ROSTERS_QUERY_CACHE_MS = 60000;
  const TRAINING_ROSTERS_QUERY_CACHE_MAX = 24;

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  function routeId(value) {
    return decodeURIComponent(String(value || '').trim());
  }

  function actorLabel(payload, fallback) {
    return cleanText(payload && (payload.actorName || payload.actorUsername || payload.fillerName || payload.createdBy || payload.createdByUsername)) || fallback || 'system';
  }

  function appendHistory(history, action, user, time) {
    return (Array.isArray(history) ? history : []).concat([{
      time: cleanText(time) || new Date().toISOString(),
      action: cleanText(action),
      user: cleanText(user) || 'system'
    }]);
  }

  function buildTrainingFormSnapshot(item) {
    if (!item) return null;
    return {
      id: cleanText(item.id),
      unit: cleanText(item.unit),
      trainingYear: cleanText(item.trainingYear),
      fillerUsername: cleanText(item.fillerUsername),
      status: cleanText(item.status),
      recordsCount: Array.isArray(item.records) ? item.records.length : 0,
      signedFiles: summarizeAttachments(item.signedFiles)
    };
  }

  function buildTrainingFormChanges(beforeItem, afterItem) {
    const beforeSigned = summarizeAttachments(beforeItem && beforeItem.signedFiles);
    const afterSigned = summarizeAttachments(afterItem && afterItem.signedFiles);
    return buildFieldChanges(beforeItem, afterItem, [
      'unit',
      'trainingYear',
      'fillerName',
      'fillerUsername',
      'submitterPhone',
      'submitterEmail',
      'fillDate',
      'status',
      'returnReason',
      'stepOneSubmittedAt',
      'printedAt',
      'signoffUploadedAt',
      'submittedAt',
      { label: 'recordsCount', kind: 'number', get: function (item) { return Array.isArray(item && item.records) ? item.records.length : 0; } },
      { label: 'activeCount', kind: 'number', get: function (item) { return item && item.summary && item.summary.activeCount; } },
      { label: 'completedCount', kind: 'number', get: function (item) { return item && item.summary && item.summary.completedCount; } },
      { label: 'incompleteCount', kind: 'number', get: function (item) { return item && item.summary && item.summary.incompleteCount; } },
      { label: 'signedFileCount', kind: 'number', get: function (item) { return item === beforeItem ? beforeSigned.count : afterSigned.count; } }
    ]);
  }

  function cloneJson(value) {
    return value && typeof value === 'object'
      ? JSON.parse(JSON.stringify(value))
      : value;
  }

  function trimQueryCache(cache, maxEntries) {
    const target = cache instanceof Map ? cache : null;
    const safeMaxEntries = Math.max(1, Number(maxEntries) || 12);
    if (!target) return;
    while (target.size > safeMaxEntries) {
      const oldestKey = target.keys().next().value;
      if (!oldestKey) break;
      target.delete(oldestKey);
    }
  }

  function buildTrainingRosterSnapshot(item) {
    if (!item) return null;
    return {
      id: cleanText(item.id),
      unit: cleanText(item.unit),
      name: cleanText(item.name),
      identity: cleanText(item.identity),
      jobTitle: cleanText(item.jobTitle),
      source: cleanText(item.source)
    };
  }

  function buildTrainingRosterChanges(beforeItem, afterItem) {
    return buildFieldChanges(beforeItem, afterItem, [
      'unit',
      'statsUnit',
      'l1Unit',
      'name',
      'unitName',
      'identity',
      'jobTitle',
      'source',
      'createdBy',
      'createdByUsername'
    ]);
  }

  function compareTrainingRosterRows(left, right) {
    const leftBroken = isTrainingRosterRowBroken(left);
    const rightBroken = isTrainingRosterRowBroken(right);
    if (leftBroken !== rightBroken) {
      return leftBroken ? 1 : -1;
    }
    const leftUnit = cleanText(left && left.item && left.item.unit);
    const rightUnit = cleanText(right && right.item && right.item.unit);
    if (leftUnit !== rightUnit) {
      return leftUnit.localeCompare(rightUnit);
    }
    const leftName = cleanText(left && left.item && left.item.name);
    const rightName = cleanText(right && right.item && right.item.name);
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }
    return cleanText(left && left.item && left.item.id).localeCompare(cleanText(right && right.item && right.item.id));
  }

  function sortTrainingRosterRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice().sort(compareTrainingRosterRows);
  }

  function hasTrainingDisplayCorruption(value) {
    const text = cleanText(value);
    if (!text) return false;
    if (/\?{3,}/.test(text)) return true;
    return /(\uFFFD|銵|摮貉|銝剖|蝟餌絞|撣唾|瑼Ｘ)/.test(text);
  }

  function isTrainingRosterRowBroken(entry) {
    const item = entry && entry.item ? entry.item : {};
    const name = cleanText(item.name);
    if (/^DBG-\d+/i.test(name)) return true;
    return [item.unit, item.statsUnit, item.unitName, item.identity, item.jobTitle].some(hasTrainingDisplayCorruption);
  }

  async function fetchListMap() {
    const siteId = await resolveSiteId();
    const body = await graphRequest('GET', `/sites/${siteId}/lists?$select=id,displayName,webUrl`);
    return new Map((Array.isArray(body && body.value) ? body.value : []).map((entry) => [cleanText(entry.displayName), entry]));
  }

  async function resolveNamedList(name) {
    const listName = cleanText(name);
    if (!state.listMap || !state.listMap.has(listName)) {
      state.listMap = await fetchListMap();
    }
    let list = state.listMap.get(listName);
    if (!list) {
      state.listMap = await fetchListMap();
      list = state.listMap.get(listName);
    }
    if (!list) {
      throw createError(`SharePoint list not found: ${listName}`, 500);
    }
    return list;
  }

  function getTrainingFormsListName() {
    return getEnv('TRAINING_FORMS_LIST', 'TrainingForms');
  }

  function getTrainingRostersListName() {
    return getEnv('TRAINING_ROSTERS_LIST', 'TrainingRosters');
  }

  function getTrainingRostersSnapshotPath() {
    return path.join(process.cwd(), 'logs', 'campus-backend', 'training-rosters-cache.json');
  }

  function readNonNegativeEnvNumber(name, fallback) {
    const raw = cleanText(process.env[name]);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function getTrainingListCacheTtlMs() {
    return readNonNegativeEnvNumber('TRAINING_LIST_CACHE_TTL_MS', 30 * 1000);
  }

  function getTrainingListCacheHit(cacheAt) {
    const ttlMs = getTrainingListCacheTtlMs();
    if (ttlMs <= 0) return false;
    return !!cacheAt && (Date.now() - cacheAt) < ttlMs;
  }

  function invalidateTrainingListCaches() {
    state.formsCache = null;
    state.formsCacheAt = 0;
    state.formsCachePromise = null;
    if (state.formsQueryCache instanceof Map) {
      state.formsQueryCache.clear();
    }
    state.rostersCache = null;
    state.rostersCacheAt = 0;
    state.rostersCachePromise = null;
    if (state.rostersQueryCache instanceof Map) {
      state.rostersQueryCache.clear();
    }
  }

  function restoreRostersCacheSnapshot() {
    try {
      const snapshotPath = getTrainingRostersSnapshotPath();
      if (!fs.existsSync(snapshotPath)) return false;
      const raw = fs.readFileSync(snapshotPath, 'utf8').replace(/^\uFEFF/, '');
      if (!raw.trim()) return false;
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed && parsed.rows) ? parsed.rows : [];
      const loadedAt = Number(parsed && parsed.loadedAt);
      if (!rows.length || !Number.isFinite(loadedAt)) return false;
      const ageMs = Date.now() - loadedAt;
      if (ageMs > TRAINING_ROSTERS_SNAPSHOT_MAX_AGE_MS) {
        logTrainingRoster('snapshot skipped', {
          reason: 'expired',
          ageMs
        });
        return false;
      }
      state.rostersCache = sortTrainingRosterRows(rows);
      state.rostersCacheAt = Date.now();
      if (state.rostersQueryCache instanceof Map) {
        state.rostersQueryCache.clear();
      }
      logTrainingRoster('snapshot restored', {
        rows: state.rostersCache.length,
        ageMs
      });
      return true;
    } catch (error) {
      logTrainingRoster('snapshot restore failed', {
        message: cleanText(error && error.message) || 'unknown error'
      });
      return false;
    }
  }

  async function persistRostersCacheSnapshot(rows, loadedAt) {
    const payload = {
      loadedAt: Number(loadedAt) || Date.now(),
      rows: Array.isArray(rows) ? rows : []
    };
    const snapshotPath = getTrainingRostersSnapshotPath();
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    const tempPath = `${snapshotPath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(payload), 'utf8');
    await fs.promises.rename(tempPath, snapshotPath);
    logTrainingRoster('snapshot saved', {
      rows: payload.rows.length,
      loadedAt: payload.loadedAt
    });
  }

  function primeRostersCacheInBackground(reason, delayMs, forceRefresh) {
    if ((!forceRefresh && state.rostersCache) || state.rostersCachePromise || state.rostersPrewarmQueued) {
      return false;
    }
    const safeDelay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 0;
    state.rostersPrewarmQueued = true;
    logTrainingRoster('prewarm queued', {
      reason: cleanText(reason) || 'unknown',
      delayMs: safeDelay
    });
    setTimeout(() => {
      state.rostersPrewarmQueued = false;
      listAllRosters({ forceRefresh: !!forceRefresh })
        .then((rows) => {
          logTrainingRoster('prewarm ready', {
            reason: cleanText(reason) || 'unknown',
            rows: Array.isArray(rows) ? rows.length : 0
          });
        })
        .catch((error) => {
          logTrainingRoster('prewarm failed', {
            reason: cleanText(reason) || 'unknown',
            message: cleanText(error && error.message) || 'unknown error'
          });
        });
    }, safeDelay);
    return true;
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  }

  function logTrainingRoster(message, details) {
    const suffix = details && typeof details === 'object'
      ? Object.entries(details)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
      : '';
    console.log(`[training-rosters] ${message}${suffix ? ` ${suffix}` : ''}`);
  }

  function logTrainingForms(message, details) {
    const suffix = details && typeof details === 'object'
      ? Object.entries(details)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
      : '';
    console.log(`[training-forms] ${message}${suffix ? ` ${suffix}` : ''}`);
  }

  async function resolveTrainingFormsList() {
    return resolveNamedList(getTrainingFormsListName());
  }

  async function resolveTrainingRostersList() {
    return resolveNamedList(getTrainingRostersListName());
  }

  async function resolveAuditList() {
    return resolveNamedList(getAuditListName());
  }

  function parsePositiveInteger(value) {
    const cleanValue = cleanText(value);
    if (!cleanValue) return null;
    const parsed = Number(cleanValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  }

  function buildRosterPageMeta(url, total) {
    const rawLimit = parsePositiveInteger(url && url.searchParams && url.searchParams.get('limit'));
    const rawOffset = parsePositiveInteger(url && url.searchParams && url.searchParams.get('offset')) || 0;
    const safeTotal = Math.max(Number(total) || 0, 0);
    const limit = rawLimit ? Math.min(rawLimit, 500) : safeTotal;
    const safeOffset = Math.min(Math.max(rawOffset, 0), safeTotal);
    const returned = limit > 0 ? Math.max(Math.min(limit, safeTotal - safeOffset), 0) : 0;
    const paged = !!rawLimit || safeOffset > 0;
    const pageCount = rawLimit && limit > 0 ? Math.ceil(safeTotal / limit) : (safeTotal > 0 ? 1 : 0);
    const currentPage = rawLimit && limit > 0 && safeTotal > 0 ? Math.floor(safeOffset / limit) + 1 : (safeTotal > 0 ? 1 : 0);
    return {
      offset: safeOffset,
      limit,
      total: safeTotal,
      returned,
      pageCount,
      currentPage,
      hasPrev: safeOffset > 0,
      hasNext: rawLimit ? (safeOffset + limit) < safeTotal : false,
      prevOffset: rawLimit ? Math.max(safeOffset - limit, 0) : 0,
      nextOffset: rawLimit && (safeOffset + limit) < safeTotal ? safeOffset + limit : safeOffset,
      paged
    };
  }

  function summarizeTrainingForms(items) {
    const summary = {
      total: 0,
      draft: 0,
      pending: 0,
      submitted: 0,
      returned: 0
    };
    (Array.isArray(items) ? items : []).forEach((item) => {
      const status = cleanText(item && item.status);
      summary.total += 1;
      if (status === FORM_STATUSES.DRAFT) summary.draft += 1;
      if (status === FORM_STATUSES.PENDING_SIGNOFF) summary.pending += 1;
      if (status === FORM_STATUSES.SUBMITTED) summary.submitted += 1;
      if (status === FORM_STATUSES.RETURNED) summary.returned += 1;
    });
    return summary;
  }

  function readTrainingFormFilters(url) {
    const params = url && url.searchParams ? url.searchParams : new URLSearchParams();
    return {
      status: cleanText(params.get('status')),
      unit: cleanText(params.get('unit')),
      statsUnit: cleanText(params.get('statsUnit')),
      trainingYear: cleanText(params.get('trainingYear')),
      fillerUsername: cleanText(params.get('fillerUsername')),
      q: cleanText(params.get('q')).toLowerCase()
    };
  }

  function matchesTrainingFormFilters(entry, filters) {
    const item = entry && typeof entry === 'object' ? entry : {};
    const activeFilters = filters && typeof filters === 'object' ? filters : {};
    if (activeFilters.status && item.status !== activeFilters.status) return false;
    if (activeFilters.unit && item.unit !== activeFilters.unit) return false;
    if (activeFilters.statsUnit && item.statsUnit !== activeFilters.statsUnit) return false;
    if (activeFilters.trainingYear && item.trainingYear !== activeFilters.trainingYear) return false;
    if (activeFilters.fillerUsername && item.fillerUsername !== activeFilters.fillerUsername) return false;
    if (activeFilters.q) {
      const haystack = [
        item.id,
        item.unit,
        item.statsUnit,
        item.fillerName,
        item.fillerUsername,
        item.trainingYear
      ].join(' ').toLowerCase();
      if (!haystack.includes(activeFilters.q)) return false;
    }
    return true;
  }

  function summarizeTrainingFormRows(rows, authz, filters) {
    const summary = {
      total: 0,
      draft: 0,
      pending: 0,
      submitted: 0,
      returned: 0
    };
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const item = row && row.item;
      if (!item) return;
      if (!matchesTrainingFormFilters(item, filters)) return;
      if (!requestAuthz.canAccessTrainingForm(authz, item)) return;
      summary.total += 1;
      if (item.status === FORM_STATUSES.DRAFT) summary.draft += 1;
      if (item.status === FORM_STATUSES.PENDING_SIGNOFF) summary.pending += 1;
      if (item.status === FORM_STATUSES.SUBMITTED) summary.submitted += 1;
      if (item.status === FORM_STATUSES.RETURNED) summary.returned += 1;
    });
    return summary;
  }

  function buildFormQuerySignature(authz, url) {
    const safeAuthz = authz && typeof authz === 'object' ? authz : {};
    const authorizedUnits = Array.isArray(safeAuthz.authorizedUnits)
      ? safeAuthz.authorizedUnits.map((value) => cleanText(value)).filter(Boolean).sort()
      : [];
    const params = url && url.searchParams ? url.searchParams : new URLSearchParams();
    return [
      String(state.formsCacheAt || 0).trim(),
      String(safeAuthz.username || '').trim(),
      String(safeAuthz.role || '').trim(),
      authorizedUnits.join('|'),
      String(params.get('status') || '').trim(),
      String(params.get('unit') || '').trim(),
      String(params.get('statsUnit') || '').trim(),
      String(params.get('trainingYear') || '').trim(),
      String(params.get('fillerUsername') || '').trim(),
      String(params.get('q') || '').trim().toLowerCase(),
      String(params.get('summaryOnly') || '').trim()
    ].join('::');
  }

  function readFormsQueryCache(cacheKey) {
    if (!(state.formsQueryCache instanceof Map)) return { body: null, reason: 'disabled' };
    if (!cacheKey) return { body: null, reason: 'empty-key' };
    if (!state.formsQueryCache.has(cacheKey)) return { body: null, reason: 'missing' };
    const cached = state.formsQueryCache.get(cacheKey);
    if (!cached || typeof cached !== 'object' || !cached.body) {
      state.formsQueryCache.delete(cacheKey);
      return { body: null, reason: 'invalid' };
    }
    if (Number(cached.cacheAt || 0) !== Number(state.formsCacheAt || 0)) {
      state.formsQueryCache.delete(cacheKey);
      return { body: null, reason: 'cache-version-mismatch' };
    }
    if ((Date.now() - Number(cached.loadedAt || 0)) >= TRAINING_FORMS_QUERY_CACHE_MS) {
      state.formsQueryCache.delete(cacheKey);
      return { body: null, reason: 'expired' };
    }
    state.formsQueryCache.delete(cacheKey);
    state.formsQueryCache.set(cacheKey, cached);
    return {
      body: cloneJson(cached.body),
      reason: 'hit'
    };
  }

  function writeFormsQueryCache(cacheKey, body) {
    if (!(state.formsQueryCache instanceof Map) || !cacheKey) return cloneJson(body);
    state.formsQueryCache.set(cacheKey, {
      loadedAt: Date.now(),
      cacheAt: Number(state.formsCacheAt || 0),
      body: cloneJson(body)
    });
    trimQueryCache(state.formsQueryCache, TRAINING_FORMS_QUERY_CACHE_MAX);
    return cloneJson(body);
  }

  async function listAllForms() {
    if (Array.isArray(state.formsCache) && getTrainingListCacheHit(state.formsCacheAt)) {
      return state.formsCache.slice();
    }
    if (state.formsCachePromise) {
      return state.formsCachePromise.then((rows) => Array.isArray(rows) ? rows.slice() : []);
    }
    state.formsCachePromise = (async function loadForms() {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingFormsList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapGraphFieldsToTrainingForm(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
      state.formsCache = rows.slice();
      state.formsCacheAt = Date.now();
      if (state.formsQueryCache instanceof Map) {
        state.formsQueryCache.clear();
      }
      return rows;
    })();
    try {
      const rows = await state.formsCachePromise;
      return Array.isArray(rows) ? rows.slice() : [];
    } finally {
      state.formsCachePromise = null;
    }
  }

  async function listAllRosters(options) {
    const forceRefresh = !!(options && options.forceRefresh);
    if (!forceRefresh && Array.isArray(state.rostersCache)) {
      if (!getTrainingListCacheHit(state.rostersCacheAt) && !state.rostersCachePromise) {
        primeRostersCacheInBackground('ttl-expired', 0, true);
      }
      return state.rostersCache.slice();
    }
    if (state.rostersCachePromise) {
      return state.rostersCachePromise.then((rows) => Array.isArray(rows) ? rows.slice() : []);
    }
    state.rostersCachePromise = (async function loadRosters() {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingRostersList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapGraphFieldsToTrainingRoster(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
      state.rostersCache = sortTrainingRosterRows(rows);
      state.rostersCacheAt = Date.now();
      if (state.rostersQueryCache instanceof Map) {
        state.rostersQueryCache.clear();
      }
      persistRostersCacheSnapshot(state.rostersCache, state.rostersCacheAt).catch((error) => {
        logTrainingRoster('snapshot write failed', {
          message: cleanText(error && error.message) || 'unknown error'
        });
      });
      return rows;
    })();
    try {
      const rows = await state.rostersCachePromise;
      return Array.isArray(rows) ? rows.slice() : [];
    } finally {
      state.rostersCachePromise = null;
    }
  }

  function parseRosterSequence(rosterId) {
    const match = cleanText(rosterId).match(/^RST-(\d+)$/i);
    return match ? Number(match[1]) : 0;
  }

  async function withRosterSequenceLock(work) {
    const task = typeof work === 'function' ? work : async function noop() {};
    const previous = state.rosterSequenceLock;
    let release;
    state.rosterSequenceLock = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  function reserveKnownRosterSequence(rosterId) {
    const sequence = parseRosterSequence(rosterId);
    if (!sequence) return;
    const nextCandidate = sequence + 1;
    if (!Number.isFinite(state.nextRosterSequence) || state.nextRosterSequence < nextCandidate) {
      state.nextRosterSequence = nextCandidate;
    }
  }

  async function generateNextRosterId() {
    return withRosterSequenceLock(async function reserveNextRosterId() {
      const rows = await listAllRosters();
      const existingIds = new Set(rows
        .map((entry) => cleanText(entry && entry.item && entry.item.id))
        .filter(Boolean));
      const maxExisting = rows.reduce((max, entry) => {
        return Math.max(max, parseRosterSequence(entry && entry.item && entry.item.id));
      }, 0);
      let nextValue = Number.isFinite(state.nextRosterSequence) && state.nextRosterSequence > 0
        ? state.nextRosterSequence
        : (maxExisting + 1);
      if (nextValue <= maxExisting) nextValue = maxExisting + 1;
      let candidate = `RST-${String(nextValue).padStart(4, '0')}`;
      while (existingIds.has(candidate)) {
        nextValue += 1;
        candidate = `RST-${String(nextValue).padStart(4, '0')}`;
      }
      state.nextRosterSequence = nextValue + 1;
      return candidate;
    });
  }

  async function getFormEntryById(formId) {
    const target = cleanText(formId);
    if (!target) throw createError('Missing training form id', 400);
    const rows = await listAllForms();
    return rows.find((entry) => entry.item.id === target) || null;
  }

  async function getRosterEntryById(rosterId) {
    const target = cleanText(rosterId);
    if (!target) throw createError('Missing training roster id', 400);
    const rows = await listAllRosters();
    return rows.find((entry) => entry.item.id === target) || null;
  }

  async function getRosterEntriesById(rosterId) {
    const target = cleanText(rosterId);
    if (!target) throw createError('Missing training roster id', 400);
    const rows = await listAllRosters();
    return rows.filter((entry) => entry.item.id === target);
  }

  async function findDuplicateForm(unit, trainingYear, excludeId) {
    const targetUnit = cleanText(unit);
    const targetYear = cleanText(trainingYear);
    const skipId = cleanText(excludeId);
    if (!targetUnit || !targetYear) return null;
    const rows = await listAllForms();
    return rows.find((entry) => (
      entry.item.unit === targetUnit
      && entry.item.trainingYear === targetYear
      && entry.item.id !== skipId
    )) || null;
  }

  async function findDuplicateRoster(unit, name, excludeId) {
    const targetUnit = cleanText(unit);
    const targetName = cleanText(name).toLowerCase();
    const skipId = cleanText(excludeId);
    if (!targetUnit || !targetName) return null;
    const rows = await listAllRosters();
    return rows.find((entry) => (
      entry.item.unit === targetUnit
      && cleanText(entry.item.name).toLowerCase() === targetName
      && entry.item.id !== skipId
    )) || null;
  }

  function buildRosterLookupKey(unit, name) {
    return `${cleanText(unit)}::${cleanText(name).toLowerCase()}`;
  }

  async function allocateNextRosterIds(count) {
    const total = Number(count || 0);
    if (total <= 0) return [];
    return withRosterSequenceLock(async function reserveNextRosterIds() {
      const rows = await listAllRosters();
      const existingIds = new Set(rows
        .map((entry) => cleanText(entry && entry.item && entry.item.id))
        .filter(Boolean));
      const maxExisting = rows.reduce((max, entry) => {
        return Math.max(max, parseRosterSequence(entry && entry.item && entry.item.id));
      }, 0);
      let nextValue = Number.isFinite(state.nextRosterSequence) && state.nextRosterSequence > 0
        ? state.nextRosterSequence
        : (maxExisting + 1);
      if (nextValue <= maxExisting) nextValue = maxExisting + 1;
      const reserved = [];
      while (reserved.length < total) {
        const candidate = `RST-${String(nextValue).padStart(4, '0')}`;
        if (!existingIds.has(candidate)) {
          existingIds.add(candidate);
          reserved.push(candidate);
        }
        nextValue += 1;
      }
      state.nextRosterSequence = nextValue;
      return reserved;
    });
  }

  async function upsertForm(existingEntry, nextItem) {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingFormsList();
    const normalized = createTrainingFormRecord(nextItem, nextItem.status, nextItem.updatedAt || new Date().toISOString());
    if (existingEntry) {
      await graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, mapTrainingFormToGraphFields(normalized));
      invalidateTrainingListCaches();
      return { created: false, item: normalized };
    }
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: mapTrainingFormToGraphFields(normalized)
    });
    invalidateTrainingListCaches();
    return { created: true, item: normalized };
  }

  async function upsertRoster(existingEntry, nextItem) {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingRostersList();
    const normalized = createTrainingRosterRecord(nextItem, nextItem.updatedAt || new Date().toISOString());
    if (existingEntry) {
      await withRetryableRosterWrite(() => graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, mapTrainingRosterToGraphFields(normalized)), `patch:${existingEntry.listItemId}`);
      invalidateTrainingListCaches();
      return { created: false, item: normalized };
    }
    await withRetryableRosterWrite(() => graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: mapTrainingRosterToGraphFields(normalized)
    }), `post:${normalized.id}`);
    invalidateTrainingListCaches();
    return { created: true, item: normalized };
  }

  function isRetryableRosterWriteError(error) {
    const statusCode = Number(error && error.statusCode || 0);
    const message = String(error && error.message || '').toLowerCase();
    return statusCode === 429
      || statusCode === 502
      || statusCode === 503
      || statusCode === 504
      || message.includes('too many requests')
      || message.includes('throttle')
      || message.includes('temporarily unavailable')
      || message.includes('service unavailable')
      || message.includes('gateway')
      || message.includes('timeout');
  }

  async function withRetryableRosterWrite(task, label) {
    const delays = [0, 300, 900];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        return await task(attempt);
      } catch (error) {
        lastError = error;
        if (!isRetryableRosterWriteError(error) || attempt === delays.length - 1) {
          throw error;
        }
        console.warn('[training-backend] retrying roster write' + (label ? ` for ${label}` : ''), {
          attempt: attempt + 1,
          message: cleanText(error && error.message) || String(error)
        });
      }
    }
    throw lastError;
  }

  async function runLimitedConcurrency(items, concurrency, worker) {
    const list = Array.isArray(items) ? items : [];
    const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
    const results = new Array(list.length);
    let index = 0;
    const runners = Array.from({ length: limit }, async () => {
      while (index < list.length) {
        const currentIndex = index++;
        try {
          results[currentIndex] = await worker(list[currentIndex], currentIndex);
        } catch (error) {
          results[currentIndex] = { error };
        }
      }
    });
    await Promise.all(runners);
    return results;
  }

  async function deleteFormEntry(existingEntry) {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingFormsList();
    await graphRequest('DELETE', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}`);
    invalidateTrainingListCaches();
  }

  async function deleteRosterEntry(existingEntry) {
    const siteId = await resolveSiteId();
    const list = await resolveTrainingRostersList();
    await withRetryableRosterWrite(() => graphRequest('DELETE', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}`), `delete:${existingEntry.listItemId}`);
    invalidateTrainingListCaches();
  }

  async function createAuditRow(input) {
    const siteId = await resolveSiteId();
    const list = await resolveAuditList();
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: {
        Title: cleanText(input.recordId || input.eventType || 'audit'),
        EventType: cleanText(input.eventType),
        ActorEmail: cleanText(input.actorEmail),
        TargetEmail: cleanText(input.targetEmail),
        UnitCode: cleanText(input.unitCode),
        RecordId: cleanText(input.recordId),
        OccurredAt: cleanText(input.occurredAt) || new Date().toISOString(),
        PayloadJson: cleanText(input.payloadJson)
      }
    });
  }

  function queueAuditRow(input, label) {
    void createAuditRow(input).catch((error) => {
      console.warn('[training-backend] audit row write failed' + (label ? ` for ${label}` : ''), error && error.message ? error.message : error);
    });
  }

  function filterForms(items, filtersOrUrl) {
    const filters = filtersOrUrl && typeof filtersOrUrl === 'object' && filtersOrUrl.searchParams
      ? readTrainingFormFilters(filtersOrUrl)
      : (filtersOrUrl && typeof filtersOrUrl === 'object' ? filtersOrUrl : {});
    return items.filter((entry) => matchesTrainingFormFilters(entry, filters))
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  }

  function filterRosters(items, url) {
    const unit = cleanText(url.searchParams.get('unit'));
    const statsUnit = cleanText(url.searchParams.get('statsUnit'));
    const source = cleanText(url.searchParams.get('source'));
    const query = cleanText(url.searchParams.get('q')).toLowerCase();
    return items.filter((entry) => {
      if (unit && entry.unit !== unit) return false;
      if (statsUnit && entry.statsUnit !== statsUnit) return false;
      if (source && entry.source !== source) return false;
      if (query) {
        const haystack = [
          entry.id,
          entry.unit,
          entry.statsUnit,
          entry.name,
          entry.unitName,
          entry.identity,
          entry.jobTitle
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function getRosterQuerySignature(url) {
    return [
      cleanText(url && url.searchParams && url.searchParams.get('q')).toLowerCase(),
      cleanText(url && url.searchParams && url.searchParams.get('source')),
      cleanText(url && url.searchParams && url.searchParams.get('unit')),
      cleanText(url && url.searchParams && url.searchParams.get('statsUnit'))
    ].join('::');
  }

  function getRosterQueryCache(signature) {
    if (!signature || !(state.rostersQueryCache instanceof Map)) return null;
    const cached = state.rostersQueryCache.get(signature);
    if (!cached || !Array.isArray(cached.items)) return null;
    if (Number(cached.cacheAt || 0) !== Number(state.rostersCacheAt || 0)) return null;
    if ((Date.now() - Number(cached.loadedAt || 0)) >= TRAINING_ROSTERS_QUERY_CACHE_MS) return null;
    return cached.items;
  }

  function setRosterQueryCache(signature, items) {
    if (!signature || !(state.rostersQueryCache instanceof Map)) return;
    state.rostersQueryCache.set(signature, {
      loadedAt: Date.now(),
      cacheAt: Number(state.rostersCacheAt || 0),
      items: Array.isArray(items) ? items : []
    });
    while (state.rostersQueryCache.size > TRAINING_ROSTERS_QUERY_CACHE_MAX) {
      const oldestKey = state.rostersQueryCache.keys().next().value;
      if (!oldestKey) break;
      state.rostersQueryCache.delete(oldestKey);
    }
  }

  async function buildHealth() {
    const siteId = await resolveSiteId();
    const { decoded, mode } = await getDelegatedToken();
    const health = {
      ok: true,
      ready: true,
      contractVersion: CONTRACT_VERSION,
      repository: mode === 'app-only' ? 'sharepoint-app-only' : 'sharepoint-delegated-cli',
      actor: {
        tokenMode: cleanText(mode) || 'delegated-cli',
        appId: cleanText(decoded.appid || decoded.azp),
        upn: cleanText(decoded.upn),
        scopes: cleanText(decoded.scp),
        roles: Array.isArray(decoded.roles) ? decoded.roles.join(',') : ''
      },
      site: {
        id: siteId
      }
    };
    try {
      health.formsList = await resolveTrainingFormsList();
      health.rostersList = await resolveTrainingRostersList();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'Training lists are not ready.';
    }
    return health;
  }

  function assertEditable(existing) {
    if (existing && existing.item.status === FORM_STATUSES.SUBMITTED) {
      throw createError('Submitted training forms cannot be edited directly.', 409);
    }
  }

  function assertCanFinalize(existing) {
    if (!existing) throw createError('Training form not found', 404);
    if (existing.item.status !== FORM_STATUSES.PENDING_SIGNOFF) {
      throw createError('Only pending-signoff forms can be finalized.', 409);
    }
  }

  function assertCanReturn(existing) {
    if (!existing) throw createError('Training form not found', 404);
    if (existing.item.status !== FORM_STATUSES.SUBMITTED) {
      throw createError('Only submitted forms can be returned.', 409);
    }
  }

  function assertCanUndo(existing) {
    if (!existing) throw createError('Training form not found', 404);
    if (existing.item.status !== FORM_STATUSES.PENDING_SIGNOFF) {
      throw createError('Only pending-signoff forms can be undone.', 409);
    }
  }

  function assertCanMarkPrinted(existing) {
    if (!existing) throw createError('Training form not found', 404);
    if (existing.item.status !== FORM_STATUSES.PENDING_SIGNOFF) {
      throw createError('Only pending-signoff forms can be marked as printed.', 409);
    }
  }

  async function handleHealth(_req, res, origin) {
    try {
      const health = await buildHealth();
      if (!state.rostersCache && !state.rostersCachePromise) {
        primeRostersCacheInBackground('health-check', 0, false);
      }
      await writeJson(res, buildJsonResponse(200, health), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read training backend health.', 500), origin);
    }
  }

  async function handleFormList(req, res, origin, url) {
    try {
      const startedAt = Date.now();
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const summaryOnly = String(url.searchParams.get('summaryOnly') || '').trim() === '1';
      const filters = readTrainingFormFilters(url);
      const cacheKey = buildFormQuerySignature(authz, url);
      const cacheLookup = readFormsQueryCache(cacheKey);
      const cached = cacheLookup && cacheLookup.body;
      if (cached) {
        logTrainingForms('query cache hit', {
          username: authz.username,
          total: cached.total,
          summaryOnly,
          durationMs: Date.now() - startedAt
        });
        await writeJson(res, buildJsonResponse(200, {
          ...cached,
          cache: {
            query: 'hit',
            summaryOnly,
            reason: 'hit'
          }
        }), origin);
        return;
      }
      const rows = await listAllForms();
      logTrainingForms('query cache miss', {
        username: authz.username,
        totalRows: rows.length,
        summaryOnly,
        cacheReason: cacheLookup && cacheLookup.reason || 'unknown',
        cacheSize: state.formsQueryCache instanceof Map ? state.formsQueryCache.size : 0,
        durationMs: Date.now() - startedAt
      });
      const generatedAt = new Date().toISOString();
      const items = summaryOnly
        ? []
        : filterForms(rows.map((entry) => entry.item), filters)
          .filter((entry) => requestAuthz.canAccessTrainingForm(authz, entry));
      const summary = summaryOnly
        ? summarizeTrainingFormRows(rows, authz, filters)
        : summarizeTrainingForms(items);
      const responseBody = {
        ok: true,
        items: items.map(mapTrainingFormForClient),
        summary: summary,
        total: Number(summary && summary.total || items.length || 0),
        filters: {
          ...filters,
          summaryOnly: summaryOnly ? '1' : ''
        },
        generatedAt: generatedAt,
        cache: {
          query: 'computed',
          summaryOnly,
          reason: cacheLookup && cacheLookup.reason || 'computed'
        },
        contractVersion: CONTRACT_VERSION
      };
      const cachedBody = writeFormsQueryCache(cacheKey, responseBody);
      logTrainingForms('list served', {
        username: authz.username,
        totalRows: rows.length,
        visibleRows: items.length,
        submitted: summary && summary.submitted,
        pending: summary && summary.pending,
        summaryOnly,
        durationMs: Date.now() - startedAt
      });
      await writeJson(res, buildJsonResponse(200, cachedBody), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list training forms.', 500), origin);
    }
  }

  async function handleFormDetail(req, res, origin, formId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getFormEntryById(formId);
      if (!existing) {
        throw createError('Training form not found', 404);
      }
      if (!requestAuthz.canAccessTrainingForm(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have access to this training form', 403);
      }
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapTrainingFormForClient(existing.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read training form detail.', 500), origin);
    }
  }

  async function writeTrainingForm(req, res, origin, formId, action, options) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getFormEntryById(formId);
      if (typeof options.assertBefore === 'function') {
        options.assertBefore(existing);
      } else {
        assertEditable(existing);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, action);
      const payload = normalizeTrainingFormPayload(envelope.payload);
      if (cleanText(formId) !== cleanText(payload.id)) {
        throw createError('Route form id and payload id do not match', 400);
      }
      if (existing && !requestAuthz.canManageTrainingForm(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to edit this training form', 403);
      }
      if (!existing) {
        const intendedUnit = cleanText(payload.unit);
        if (!(requestAuthz.isAdmin(authz) || requestAuthz.hasUnitAccess(authz, intendedUnit) || requestAuthz.matchesUsername(authz, payload.fillerUsername))) {
          throw requestAuthz.createHttpError('You do not have permission to create a training form for this unit', 403);
        }
      }
      validateTrainingFormPayload(payload, options.validation || {});
      const duplicate = await findDuplicateForm(payload.unit, payload.trainingYear, payload.id);
      if (duplicate) {
        throw createError('Another training form already exists for this unit and year', 409);
      }

      const actor = actorLabel(payload, (existing && existing.item && existing.item.fillerName) || payload.fillerName);
      const actorMeta = requestAuthz.buildActorDetails(authz);
      const now = new Date().toISOString();
      const nextStatus = typeof options.resolveStatus === 'function'
        ? options.resolveStatus(existing, payload)
        : options.status;
      const existingItem = existing ? existing.item : null;
      const nextHistory = typeof options.buildHistory === 'function'
        ? options.buildHistory(existingItem, payload, actor, now)
        : (payload.history || existingItem?.history || []);
      let nextItemInput = {
        ...(existingItem || {}),
        ...payload,
        status: nextStatus,
        createdAt: existingItem ? existingItem.createdAt : (payload.createdAt || now),
        updatedAt: now,
        history: nextHistory
      };
      if (typeof options.transformItem === 'function') {
        nextItemInput = options.transformItem(nextItemInput, existingItem, payload, now);
      }
      const nextItem = createTrainingFormRecord(nextItemInput, nextStatus, now);
      const saved = await upsertForm(existing, nextItem);
      queueAuditRow({
        eventType: options.eventType,
        actorEmail: actorMeta.actorEmail,
        targetEmail: nextItem.submitterEmail,
        unitCode: nextItem.unitCode,
        recordId: nextItem.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action,
          actorName: actorMeta.actorName,
          actorUsername: actorMeta.actorUsername,
          snapshot: existingItem ? null : buildTrainingFormSnapshot(nextItem),
          changes: buildTrainingFormChanges(existingItem, nextItem)
        })
      });
      await writeJson(res, buildJsonResponse(saved.created ? 201 : 200, {
        ok: true,
        item: mapTrainingFormForClient(saved.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to write training form.', 500), origin);
    }
  }

  async function handleFormDelete(req, res, origin, formId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getFormEntryById(formId);
      if (!existing) {
        throw createError('Training form not found', 404);
      }
      if (!requestAuthz.canManageTrainingForm(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to delete this training form', 403);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, FORM_ACTIONS.DELETE);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const now = new Date().toISOString();
      await deleteFormEntry(existing);
      const actor = requestAuthz.buildActorDetails(authz);
      queueAuditRow({
        eventType: 'training.form_deleted',
        actorEmail: actor.actorEmail,
        targetEmail: cleanText(existing.item.submitterEmail),
        unitCode: cleanText(existing.item.unitCode),
        recordId: existing.item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: FORM_ACTIONS.DELETE,
          actor: actor.actorName || actorLabel(payload, existing.item.fillerName),
          actorUsername: actor.actorUsername,
          deletedState: buildTrainingFormSnapshot(existing.item)
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        deletedId: existing.item.id,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete training form.', 500), origin);
    }
  }

  async function handleRosterList(req, res, origin, url) {
    const startedAt = Date.now();
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const cacheState = Array.isArray(state.rostersCache)
        ? (state.rostersCachePromise ? 'stale-while-refresh' : (getTrainingListCacheHit(state.rostersCacheAt) ? 'fresh' : 'stale'))
        : (state.rostersCachePromise ? 'promise-only' : 'miss');
      const rows = await listAllRosters();
      const filterStartedAt = Date.now();
      const querySignature = getRosterQuerySignature(url);
      let filteredItems = getRosterQueryCache(querySignature);
      let queryCacheState = 'hit';
      if (!filteredItems) {
        filteredItems = filterRosters(rows.map((entry) => entry.item), url);
        setRosterQueryCache(querySignature, filteredItems);
        queryCacheState = 'computed';
      }
      const items = filteredItems.filter((entry) => requestAuthz.canManageTrainingRoster(authz, entry));
      const filterDurationMs = Date.now() - filterStartedAt;
      const page = buildRosterPageMeta(url, items.length);
      const visibleItems = page.paged
        ? items.slice(page.offset, page.offset + page.limit)
        : items;
      logTrainingRoster('list served', {
        username: authz.username,
        cacheState,
        totalRows: rows.length,
        visibleRows: items.length,
        returnedRows: visibleItems.length,
        paged: page.paged,
        limit: page.limit,
        offset: page.offset,
        querySignature,
        queryCacheState,
        filterDurationMs,
        durationMs: Date.now() - startedAt
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: visibleItems.map(mapTrainingRosterForClient),
        total: items.length,
        page,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list training rosters.', 500), origin);
    }
  }

  async function handleRosterUpsert(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.UPSERT);
      const payload = normalizeTrainingRosterPayload(envelope.payload);
      validateTrainingRosterPayload(payload);
      const now = new Date().toISOString();
      const existingById = cleanText(payload.id) ? await getRosterEntryById(payload.id) : null;
      const duplicateEntry = await findDuplicateRoster(payload.unit, payload.name, payload.id);
      const authorizedExistingById = existingById && requestAuthz.canManageTrainingRoster(authz, existingById.item)
        ? existingById
        : null;
      const existing = duplicateEntry || authorizedExistingById || null;
      const targetRoster = existing ? existing.item : payload;
      if (!requestAuthz.canManageTrainingRoster(authz, targetRoster)) {
        throw requestAuthz.createHttpError('You do not have permission to manage this training roster', 403);
      }
      const actor = actorLabel(payload, payload.createdBy || payload.name);
      const actorMeta = requestAuthz.buildActorDetails(authz);
      const nextRosterId = existing
        ? existing.item.id
        : await generateNextRosterId();
      reserveKnownRosterSequence(nextRosterId);
      const nextItem = createTrainingRosterRecord({
        ...(existing ? existing.item : {}),
        ...payload,
        id: nextRosterId,
        createdAt: existing ? existing.item.createdAt : (payload.createdAt || now),
        updatedAt: now
      }, now);
      const saved = await upsertRoster(existing, nextItem);
      queueAuditRow({
        eventType: 'training.roster_upserted',
        actorEmail: actorMeta.actorEmail,
        targetEmail: '',
        unitCode: '',
        recordId: nextItem.id || nextItem.name,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: ROSTER_ACTIONS.UPSERT,
          actor,
          actorUsername: actorMeta.actorUsername,
          snapshot: existing ? null : buildTrainingRosterSnapshot(nextItem),
          changes: buildTrainingRosterChanges(existing && existing.item, nextItem)
        })
      });
      await writeJson(res, buildJsonResponse(saved.created ? 201 : 200, {
        ok: true,
        item: mapTrainingRosterForClient(saved.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to upsert training roster.', 500), origin);
    }
  }

  async function handleRosterUpsertBatch(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.UPSERT_BATCH);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const rawItems = Array.isArray(payload.items) ? payload.items : [];
      if (!rawItems.length) {
        throw createError('Training roster batch is empty', 400);
      }
      if (rawItems.length > 200) {
        throw createError('Training roster batch exceeds the 200 item limit', 400);
      }

      const actorMeta = requestAuthz.buildActorDetails(authz);
      const actorName = cleanText(payload.actorName) || actorMeta.actorName;
      const actorUsername = cleanText(payload.actorUsername) || actorMeta.actorUsername;
      const now = new Date().toISOString();
      const rosterRows = await listAllRosters();
      const rosterById = new Map();
      const rosterByKey = new Map();
      rosterRows.forEach((entry) => {
        const rosterId = cleanText(entry && entry.item && entry.item.id);
        const key = buildRosterLookupKey(entry && entry.item && entry.item.unit, entry && entry.item && entry.item.name);
        if (rosterId && !rosterById.has(rosterId)) rosterById.set(rosterId, entry);
        if (key && !rosterByKey.has(key)) rosterByKey.set(key, entry);
      });

      const plans = [];
      const summary = { added: 0, updated: 0, skipped: 0, failed: 0 };
      const errors = [];
      const requestKeys = new Set();

      rawItems.forEach((rawItem, index) => {
        try {
          const normalized = normalizeTrainingRosterPayload({
            ...(rawItem && typeof rawItem === 'object' ? rawItem : {}),
            actorName,
            actorUsername
          });
          validateTrainingRosterPayload(normalized);
          const key = buildRosterLookupKey(normalized.unit, normalized.name);
          if (requestKeys.has(key)) {
            summary.skipped += 1;
            return;
          }
          requestKeys.add(key);
          const explicitId = cleanText(normalized.id);
          const existing = (explicitId && rosterById.get(explicitId)) || rosterByKey.get(key) || null;
          const target = existing ? existing.item : normalized;
          if (!requestAuthz.canManageTrainingRoster(authz, target)) {
            summary.failed += 1;
            errors.push(`\u7b2c ${index + 1} \u7b46\u8cc7\u6599\u6c92\u6709\u6b0a\u9650\u7ba1\u7406\u5c0d\u61c9\u540d\u55ae`);
            return;
          }
          plans.push({ existing, item: normalized, key });
        } catch (error) {
          summary.failed += 1;
          errors.push(cleanText(error && error.message) || `\u7b2c ${index + 1} \u7b46\u8cc7\u6599\u8655\u7406\u5931\u6557`);
        }
      });

      const newIds = await allocateNextRosterIds(plans.filter((plan) => !plan.existing).length);
      let newIndex = 0;
      plans.forEach((plan) => {
        if (!plan.existing) {
          plan.nextRosterId = newIds[newIndex++];
        } else {
          plan.nextRosterId = plan.existing.item.id;
        }
      });
      const items = [];
      const concurrency = Math.max(1, Math.min(3, plans.length || 1));
      const results = await runLimitedConcurrency(plans, concurrency, async (plan) => {
        try {
          const existing = plan.existing;
          const nextRosterId = plan.nextRosterId || (existing ? existing.item.id : '');
          reserveKnownRosterSequence(nextRosterId);
          const nextItem = createTrainingRosterRecord({
            ...(existing ? existing.item : {}),
            ...plan.item,
            id: nextRosterId,
            createdBy: cleanText(plan.item.createdBy) || (existing && existing.item && existing.item.createdBy) || actorName,
            createdByUsername: cleanText(plan.item.createdByUsername) || (existing && existing.item && existing.item.createdByUsername) || actorUsername,
            createdAt: existing ? existing.item.createdAt : (plan.item.createdAt || now),
            updatedAt: now
          }, now);
          const saved = await upsertRoster(existing, nextItem);
          const mapped = mapTrainingRosterForClient(saved.item);
          if (saved.created) {
            summary.added += 1;
          } else {
            summary.updated += 1;
          }
          queueAuditRow({
            eventType: 'training.roster_upserted',
            actorEmail: actorMeta.actorEmail,
            targetEmail: '',
            unitCode: '',
            recordId: nextItem.id || nextItem.name,
            occurredAt: now,
            payloadJson: JSON.stringify({
              action: ROSTER_ACTIONS.UPSERT_BATCH,
              actor: actorName || actorLabel(plan.item, plan.item.createdBy || plan.item.name),
              actorUsername,
              snapshot: existing ? null : buildTrainingRosterSnapshot(nextItem),
              changes: buildTrainingRosterChanges(existing && existing.item, nextItem)
            })
          });
          return { ok: true, item: mapped };
        } catch (error) {
          summary.failed += 1;
          return { ok: false, error: cleanText(error && error.message) || `?臬 ${cleanText(plan && plan.item && plan.item.name) || '鈭箏'} 憭望?` };
        }
      });
      results.forEach((result) => {
        if (!result) return;
        if (result.ok && result.item) {
          items.push(result.item);
          return;
        }
        if (result.error) errors.push(result.error);
      });

      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items,
        summary,
        errors,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to batch upsert training rosters.', 500), origin);
    }
  }

  async function handleRosterDelete(req, res, origin, rosterId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existingEntries = await getRosterEntriesById(rosterId);
      const existing = existingEntries[0] || null;
      if (!existing) {
        throw createError('Training roster not found', 404);
      }
      if (existingEntries.some((entry) => !requestAuthz.canManageTrainingRoster(authz, entry.item))) {
        throw requestAuthz.createHttpError('You do not have permission to delete this training roster', 403);
      }
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.DELETE);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const now = new Date().toISOString();
      for (const entry of existingEntries) {
        await deleteRosterEntry(entry);
      }
      const actor = requestAuthz.buildActorDetails(authz);
      queueAuditRow({
        eventType: 'training.roster_deleted',
        actorEmail: actor.actorEmail,
        targetEmail: '',
        unitCode: '',
        recordId: existing.item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: ROSTER_ACTIONS.DELETE,
          actor: actor.actorName || actorLabel(payload, existing.item.name),
          actorUsername: actor.actorUsername,
          deletedState: existingEntries.map((entry) => buildTrainingRosterSnapshot(entry.item)),
          deletedCount: existingEntries.length
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        deletedId: existing.item.id,
        deletedCount: existingEntries.length,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete training roster.', 500), origin);
    }
  }

  async function handleRosterDeleteBatch(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ROSTER_ACTIONS.DELETE_BATCH);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const rawIds = Array.isArray(payload.ids)
        ? payload.ids
        : (Array.isArray(payload.rosterIds) ? payload.rosterIds : []);
      const ids = Array.from(new Set(rawIds.map((value) => cleanText(value)).filter(Boolean)));
      if (!ids.length) {
        throw createError('Training roster ids are required', 400);
      }
      if (ids.length > 200) {
        throw createError('Training roster batch exceeds the 200 item limit', 400);
      }

      const matchedEntries = [];
      const skippedIds = [];
      for (const rosterId of ids) {
        const entries = await getRosterEntriesById(rosterId);
        if (!entries.length) {
          skippedIds.push(rosterId);
          continue;
        }
        if (entries.some((entry) => !requestAuthz.canManageTrainingRoster(authz, entry.item))) {
          throw requestAuthz.createHttpError('You do not have permission to delete this training roster', 403);
        }
        matchedEntries.push(...entries);
      }

      const uniqueEntries = [];
      const seenListItemIds = new Set();
      matchedEntries.forEach((entry) => {
        const key = cleanText(entry && entry.listItemId);
        if (!key || seenListItemIds.has(key)) return;
        seenListItemIds.add(key);
        uniqueEntries.push(entry);
      });

      const now = new Date().toISOString();
      await Promise.all(uniqueEntries.map((entry) => deleteRosterEntry(entry)));

      const actor = requestAuthz.buildActorDetails(authz);
      queueAuditRow({
        eventType: 'training.roster_deleted',
        actorEmail: actor.actorEmail,
        targetEmail: '',
        unitCode: '',
        recordId: uniqueEntries.length ? cleanText(uniqueEntries[0].item.id) : ids.join(','),
        occurredAt: now,
        payloadJson: JSON.stringify({
          action: ROSTER_ACTIONS.DELETE_BATCH,
          actor: actor.actorName || actorLabel(payload, ids.join(', ')),
          actorUsername: actor.actorUsername,
          deletedState: uniqueEntries.map((entry) => buildTrainingRosterSnapshot(entry.item)),
          deletedCount: uniqueEntries.length,
          deletedIds: ids,
          skippedIds
        })
      });

      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        deletedIds: ids,
        deletedCount: uniqueEntries.length,
        skippedIds,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete training rosters.', 500), origin);
    }
  }

  function buildDraftHistory(existingItem, actor, now) {
    if (existingItem && existingItem.status === FORM_STATUSES.RETURNED) {
      return appendHistory(existingItem.history, 'Returned form saved as draft again', actor, now);
    }
    return appendHistory(existingItem && existingItem.history, existingItem ? 'Training form draft updated' : 'Training form draft created', actor, now);
  }

  function tryHandle(req, res, origin, url) {
    const formCollectionMatch = url.pathname.match(/^\/api\/training\/forms\/?$/);
    const formDetailMatch = url.pathname.match(/^\/api\/training\/forms\/([^/]+)\/?$/);
    const formActionMatch = url.pathname.match(/^\/api\/training\/forms\/([^/]+)\/(save-draft|submit-step-one|mark-printed|finalize|return|undo|delete)\/?$/);
    const rosterCollectionMatch = url.pathname.match(/^\/api\/training\/rosters\/?$/);
    const rosterBatchUpsertMatch = url.pathname.match(/^\/api\/training\/rosters\/upsert-batch\/?$/);
    const rosterUpsertMatch = url.pathname.match(/^\/api\/training\/rosters\/upsert\/?$/);
    const rosterDeleteBatchMatch = url.pathname.match(/^\/api\/training\/rosters\/delete-batch\/?$/);
    const rosterDeleteMatch = url.pathname.match(/^\/api\/training\/rosters\/([^/]+)\/delete\/?$/);

    if (url.pathname === '/api/training/health' && req.method === 'GET') {
      return handleHealth(req, res, origin).then(() => true);
    }
    if (formCollectionMatch && req.method === 'GET') {
      return handleFormList(req, res, origin, url).then(() => true);
    }
    if (formDetailMatch && req.method === 'GET') {
      return handleFormDetail(req, res, origin, routeId(formDetailMatch[1])).then(() => true);
    }
    if (formActionMatch && req.method === 'POST') {
      const formId = routeId(formActionMatch[1]);
      const actionName = formActionMatch[2];
      if (actionName === 'save-draft') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.SAVE_DRAFT, {
          validation: { requireRecords: true },
          resolveStatus: function (existing) {
            return existing && existing.item.status === FORM_STATUSES.RETURNED
              ? FORM_STATUSES.RETURNED
              : FORM_STATUSES.DRAFT;
          },
          transformItem: function (item, existingItem) {
            if (existingItem && existingItem.status === FORM_STATUSES.RETURNED) {
              return {
                ...item,
                returnReason: item.returnReason || existingItem.returnReason || ''
              };
            }
            return item;
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return buildDraftHistory(existingItem, actor, now);
          },
          eventType: 'training.form_saved'
        }).then(() => true);
      }
      if (actionName === 'submit-step-one') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.SUBMIT_STEP_ONE, {
          validation: { requireRecords: true },
          resolveStatus: function () {
            return FORM_STATUSES.PENDING_SIGNOFF;
          },
          transformItem: function (item, _existingItem, _payload, now) {
            return {
              ...item,
              returnReason: '',
              stepOneSubmittedAt: now
            };
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, 'Training step one submitted', actor, now);
          },
          eventType: 'training.form_step_one_submitted'
        }).then(() => true);
      }
      if (actionName === 'mark-printed') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.MARK_PRINTED, {
          assertBefore: assertCanMarkPrinted,
          validation: { requireRecords: true },
          resolveStatus: function (existing) {
            return existing && existing.item && existing.item.status
              ? existing.item.status
              : FORM_STATUSES.PENDING_SIGNOFF;
          },
          transformItem: function (item, existingItem, _payload, now) {
            return {
              ...item,
              printedAt: cleanText(item.printedAt) || (existingItem && existingItem.printedAt) || now
            };
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, 'Training print sheet generated', actor, now);
          },
          eventType: 'training.form_printed'
        }).then(() => true);
      }
      if (actionName === 'finalize') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.FINALIZE, {
          assertBefore: assertCanFinalize,
          validation: { requireRecords: true, requireSignedFiles: true },
          resolveStatus: function () {
            return FORM_STATUSES.SUBMITTED;
          },
          transformItem: function (item, _existingItem, _payload, now) {
            return {
              ...item,
              signoffUploadedAt: now,
              submittedAt: now
            };
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, 'Training form finalized', actor, now);
          },
          eventType: 'training.form_finalized'
        }).then(() => true);
      }
      if (actionName === 'return') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.RETURN, {
          assertBefore: assertCanReturn,
          validation: { requireRecords: true, requireReturnReason: true },
          resolveStatus: function () {
            return FORM_STATUSES.RETURNED;
          },
          buildHistory: function (existingItem, payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, 'Training form returned: ' + cleanText(payload.returnReason), actor, now);
          },
          eventType: 'training.form_returned'
        }).then(() => true);
      }
      if (actionName === 'undo') {
        return writeTrainingForm(req, res, origin, formId, FORM_ACTIONS.UNDO, {
          assertBefore: assertCanUndo,
          validation: { requireRecords: true },
          resolveStatus: function () {
            return FORM_STATUSES.DRAFT;
          },
          transformItem: function (item) {
            return {
              ...item,
              stepOneSubmittedAt: '',
              printedAt: '',
              signoffUploadedAt: '',
              submittedAt: '',
              returnReason: ''
            };
          },
          buildHistory: function (existingItem, _payload, actor, now) {
            return appendHistory(existingItem && existingItem.history, 'Training form undone back to draft', actor, now);
          },
          eventType: 'training.form_undone'
        }).then(() => true);
      }
      if (actionName === 'delete') {
        return handleFormDelete(req, res, origin, formId).then(() => true);
      }    }
    if (rosterCollectionMatch && req.method === 'GET') {
      return handleRosterList(req, res, origin, url).then(() => true);
    }
    if (rosterBatchUpsertMatch && req.method === 'POST') {
      return handleRosterUpsertBatch(req, res, origin).then(() => true);
    }
    if (rosterUpsertMatch && req.method === 'POST') {
      return handleRosterUpsert(req, res, origin).then(() => true);
    }
    if (rosterDeleteBatchMatch && req.method === 'POST') {
      return handleRosterDeleteBatch(req, res, origin).then(() => true);
    }
    if (rosterDeleteMatch && req.method === 'POST') {
      return handleRosterDelete(req, res, origin, routeId(rosterDeleteMatch[1])).then(() => true);
    }
    return Promise.resolve(false);
  }

  restoreRostersCacheSnapshot();
  primeRostersCacheInBackground('router-startup', TRAINING_ROSTERS_PREWARM_DELAY_MS, true);

  return {
    tryHandle
  };
}

module.exports = {
  createTrainingRouter
};


