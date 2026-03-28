const fs = require('fs');
const path = require('path');

const {
  ACTIONS,
  CONTRACT_VERSION,
  STATUSES,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createChecklistRecord,
  createError,
  mapChecklistForClient,
  mapChecklistToGraphFields,
  mapGraphFieldsToChecklist,
  normalizeChecklistPayload,
  parseChecklistId,
  validateActionEnvelope,
  validateChecklistPayload
} = require('../azure-function/checklist-api/src/shared/contract');
const {
  buildFieldChanges,
  summarizeChecklistResults
} = require('./audit-diff.cjs');

function createChecklistRouter(deps) {
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
    entriesCache: null,
    entriesCacheAt: 0,
    entriesPromise: null,
    entriesPrewarmQueued: false,
    queryCache: new Map()
  };
  const CHECKLIST_CACHE_TTL_MS = 120000;
  const CHECKLIST_PREWARM_DELAY_MS = 5000;
  const CHECKLIST_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const CHECKLIST_QUERY_CACHE_MAX = 80;

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  function routeChecklistId(value) {
    return decodeURIComponent(String(value || '').trim());
  }

  function actorLabel(payload, fallback) {
    return cleanText(payload && (payload.actorName || payload.actorUsername || payload.fillerName || payload.fillerUsername)) || fallback || 'system';
  }

  function buildChecklistSnapshot(item) {
    if (!item) return null;
    const resultSummary = summarizeChecklistResults(item.results);
    return {
      id: cleanText(item.id),
      unit: cleanText(item.unit),
      auditYear: cleanText(item.auditYear),
      fillerUsername: cleanText(item.fillerUsername),
      status: cleanText(item.status),
      signStatus: cleanText(item.signStatus),
      answeredCount: Number(item.answeredCount || 0),
      evidenceFileCount: resultSummary.evidenceFileCount
    };
  }

  function buildChecklistChanges(beforeItem, afterItem) {
    const beforeSummary = summarizeChecklistResults(beforeItem && beforeItem.results);
    const afterSummary = summarizeChecklistResults(afterItem && afterItem.results);
    return buildFieldChanges(beforeItem, afterItem, [
      'unit',
      'auditYear',
      'fillerName',
      'fillerUsername',
      'supervisorName',
      'supervisorTitle',
      'signStatus',
      'signDate',
      'status',
      { key: 'answeredCount', kind: 'number' },
      { label: 'summaryTotal', kind: 'number', get: function (item) { return item && item.summary && item.summary.total; } },
      { label: 'summaryConform', kind: 'number', get: function (item) { return item && item.summary && item.summary.conform; } },
      { label: 'summaryPartial', kind: 'number', get: function (item) { return item && item.summary && item.summary.partial; } },
      { label: 'summaryNonConform', kind: 'number', get: function (item) { return item && item.summary && item.summary.nonConform; } },
      { label: 'summaryNa', kind: 'number', get: function (item) { return item && item.summary && item.summary.na; } },
      { label: 'evidenceFileCount', kind: 'number', get: function (item) { return item === beforeItem ? beforeSummary.evidenceFileCount : afterSummary.evidenceFileCount; } }
    ]);
  }

  function compareChecklistRows(left, right) {
    return cleanText(right && right.item && right.item.updatedAt).localeCompare(cleanText(left && left.item && left.item.updatedAt));
  }

  function sortChecklistRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice().sort(compareChecklistRows);
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

  function getChecklistsListName() {
    return getEnv('CHECKLISTS_LIST', 'Checklists');
  }

  function getChecklistSnapshotPath() {
    return path.join(process.cwd(), 'logs', 'campus-backend', 'checklists-cache.json');
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  }

  function logChecklistCache(message, details) {
    const suffix = details && typeof details === 'object'
      ? Object.entries(details)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
      : '';
    console.log(`[checklists] ${message}${suffix ? ` ${suffix}` : ''}`);
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

  function readQueryCache(cache, cacheKey) {
    if (!(cache instanceof Map)) return { body: null, reason: 'disabled' };
    if (!cacheKey || !cache.has(cacheKey)) return { body: null, reason: 'missing' };
    const cached = cache.get(cacheKey);
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return {
      body: cloneJson(cached),
      reason: 'hit'
    };
  }

  function writeQueryCache(cache, cacheKey, value, maxEntries) {
    if (!(cache instanceof Map) || !cacheKey) return cloneJson(value);
    cache.set(cacheKey, cloneJson(value));
    trimQueryCache(cache, maxEntries);
    return cloneJson(value);
  }

  function buildChecklistQueryCacheKey(authz, url, cacheVersion) {
    const safeAuthz = authz && typeof authz === 'object' ? authz : {};
    const authorizedUnits = Array.isArray(safeAuthz.authorizedUnits)
      ? safeAuthz.authorizedUnits.map((value) => cleanText(value)).filter(Boolean).sort()
      : [];
    const reviewUnits = Array.isArray(safeAuthz.reviewUnits)
      ? safeAuthz.reviewUnits.map((value) => cleanText(value)).filter(Boolean).sort()
      : [];
    const params = url && url.searchParams ? url.searchParams : new URLSearchParams();
    return [
      String(cacheVersion || 0).trim(),
      String(safeAuthz.username || '').trim(),
      String(safeAuthz.role || '').trim(),
      String(safeAuthz.primaryUnit || '').trim(),
      String(safeAuthz.activeUnit || '').trim(),
      authorizedUnits.join('|'),
      reviewUnits.join('|'),
      String(params.get('status') || '').trim(),
      String(params.get('statusBucket') || '').trim(),
      String(params.get('unit') || '').trim(),
      String(params.get('auditYear') || '').trim(),
      String(params.get('fillerUsername') || '').trim(),
      String(params.get('q') || '').trim(),
      String(params.get('summaryOnly') || '').trim(),
      String(params.get('limit') || '').trim(),
      String(params.get('offset') || '').trim()
    ].join('::');
  }

  async function resolveChecklistsList() {
    return resolveNamedList(getChecklistsListName());
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

  function buildChecklistPageMeta(url, total) {
    const rawLimit = parsePositiveInteger(url && url.searchParams && url.searchParams.get('limit'));
    const rawOffset = parsePositiveInteger(url && url.searchParams && url.searchParams.get('offset')) || 0;
    const safeTotal = Math.max(Number(total) || 0, 0);
    const limit = rawLimit ? Math.min(rawLimit, 200) : safeTotal;
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

  function restoreChecklistCacheSnapshot() {
    try {
      const snapshotPath = getChecklistSnapshotPath();
      if (!fs.existsSync(snapshotPath)) return false;
      const raw = fs.readFileSync(snapshotPath, 'utf8').replace(/^\uFEFF/, '');
      if (!raw.trim()) return false;
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed && parsed.rows) ? parsed.rows : [];
      const loadedAt = Number(parsed && parsed.loadedAt);
      if (!rows.length || !Number.isFinite(loadedAt)) return false;
      const ageMs = Date.now() - loadedAt;
      if (ageMs > CHECKLIST_SNAPSHOT_MAX_AGE_MS) {
        logChecklistCache('snapshot skipped', { reason: 'expired', ageMs });
        return false;
      }
      state.entriesCache = sortChecklistRows(rows);
      state.entriesCacheAt = Date.now();
      logChecklistCache('snapshot restored', {
        rows: state.entriesCache.length,
        ageMs
      });
      return true;
    } catch (error) {
      logChecklistCache('snapshot restore failed', {
        message: cleanText(error && error.message) || 'unknown error'
      });
      return false;
    }
  }

  async function persistChecklistCacheSnapshot(rows, loadedAt) {
    const payload = {
      loadedAt: Number(loadedAt) || Date.now(),
      rows: Array.isArray(rows) ? rows : []
    };
    const snapshotPath = getChecklistSnapshotPath();
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    const tempPath = `${snapshotPath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(payload), 'utf8');
    await fs.promises.rename(tempPath, snapshotPath);
    logChecklistCache('snapshot saved', {
      rows: payload.rows.length,
      loadedAt: payload.loadedAt
    });
  }

  function primeChecklistCacheInBackground(reason, delayMs, forceRefresh) {
    if ((!forceRefresh && state.entriesCache) || state.entriesPromise || state.entriesPrewarmQueued) {
      return false;
    }
    const safeDelay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 0;
    state.entriesPrewarmQueued = true;
    logChecklistCache('prewarm queued', {
      reason: cleanText(reason) || 'unknown',
      delayMs: safeDelay
    });
    setTimeout(() => {
      state.entriesPrewarmQueued = false;
      listAllEntries({ forceRefresh: !!forceRefresh })
        .then((rows) => {
          logChecklistCache('prewarm ready', {
            reason: cleanText(reason) || 'unknown',
            rows: Array.isArray(rows) ? rows.length : 0
          });
        })
        .catch((error) => {
          logChecklistCache('prewarm failed', {
            reason: cleanText(reason) || 'unknown',
            message: cleanText(error && error.message) || 'unknown error'
          });
        });
    }, safeDelay);
    return true;
  }

  function invalidateChecklistCache() {
    state.entriesCache = null;
    state.entriesCacheAt = 0;
    state.entriesPromise = null;
    state.queryCache.clear();
  }

  async function listAllEntries(options) {
    const forceRefresh = !!(options && options.forceRefresh);
    if (!forceRefresh && Array.isArray(state.entriesCache)) {
      if ((Date.now() - state.entriesCacheAt) >= CHECKLIST_CACHE_TTL_MS && !state.entriesPromise) {
        primeChecklistCacheInBackground('ttl-expired', 0, true);
      }
      return state.entriesCache.slice();
    }
    if (state.entriesPromise) {
      return state.entriesPromise.then((rows) => Array.isArray(rows) ? rows.slice() : []);
    }
    const siteId = await resolveSiteId();
    const list = await resolveChecklistsList();
    state.entriesPromise = (async () => {
      const rows = [];
      let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
      while (nextUrl) {
        const body = await graphRequest('GET', nextUrl);
        const batch = Array.isArray(body && body.value) ? body.value : [];
        rows.push(...batch.map((entry) => ({
          listItemId: cleanText(entry && entry.id),
          item: mapGraphFieldsToChecklist(entry && entry.fields ? entry.fields : {})
        })));
        nextUrl = cleanText(body && body['@odata.nextLink']);
      }
      state.entriesCache = sortChecklistRows(rows);
      state.entriesCacheAt = Date.now();
      persistChecklistCacheSnapshot(state.entriesCache, state.entriesCacheAt).catch((error) => {
        logChecklistCache('snapshot write failed', {
          message: cleanText(error && error.message) || 'unknown error'
        });
      });
      return state.entriesCache;
    })();
    try {
      const rows = await state.entriesPromise;
      return Array.isArray(rows) ? rows.slice() : [];
    } finally {
      state.entriesPromise = null;
    }
  }

  async function getEntryByChecklistId(checklistId) {
    const target = cleanText(checklistId);
    if (!target) throw createError('\u7f3a\u5c11\u6aa2\u6838\u8868\u7de8\u865f\u3002', 400);
    const rows = await listAllEntries();
    return rows.find((entry) => entry.item.id === target) || null;
  }

  async function findDuplicateChecklist(unit, auditYear, excludeId) {
    const targetUnit = cleanText(unit);
    const targetYear = cleanText(auditYear);
    const skipId = cleanText(excludeId);
    if (!targetUnit || !targetYear) return null;
    const rows = await listAllEntries();
    return rows.find((entry) => (
      entry.item.unit === targetUnit
      && entry.item.auditYear === targetYear
      && entry.item.id !== skipId
    )) || null;
  }

  async function upsertChecklist(existingEntry, nextItem) {
    const siteId = await resolveSiteId();
    const list = await resolveChecklistsList();
    const normalized = createChecklistRecord(nextItem, nextItem.status, nextItem.updatedAt || new Date().toISOString());
    if (existingEntry) {
      await graphRequest('PATCH', `/sites/${siteId}/lists/${list.id}/items/${existingEntry.listItemId}/fields`, mapChecklistToGraphFields(normalized));
      invalidateChecklistCache();
      return { created: false, item: normalized };
    }
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: mapChecklistToGraphFields(normalized)
    });
    invalidateChecklistCache();
    return { created: true, item: normalized };
  }

  async function deleteChecklistEntriesByYear(auditYear) {
    const targetYear = cleanText(auditYear);
    if (!targetYear) {
      throw createError('缺少年度。', 400);
    }
    const siteId = await resolveSiteId();
    const list = await resolveChecklistsList();
    const rows = await listAllEntries();
    const matches = rows.filter((entry) => cleanText(entry && entry.item && entry.item.auditYear) === targetYear);
    for (const entry of matches) {
      await graphRequest('DELETE', `/sites/${siteId}/lists/${list.id}/items/${entry.listItemId}`);
    }
    invalidateChecklistCache();
    return matches;
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

  function filterItems(items, url) {
    const status = cleanText(url.searchParams.get('status'));
    const statusBucket = cleanText(url.searchParams.get('statusBucket'));
    const unit = cleanText(url.searchParams.get('unit'));
    const auditYear = cleanText(url.searchParams.get('auditYear'));
    const fillerUsername = cleanText(url.searchParams.get('fillerUsername'));
    const query = cleanText(url.searchParams.get('q')).toLowerCase();
    return items.filter((entry) => {
      if (status && entry.status !== status) return false;
      if (statusBucket) {
        const derivedBucket = getChecklistStatusBucketKey(entry);
        if (derivedBucket !== statusBucket) return false;
      }
      if (unit && entry.unit !== unit) return false;
      if (auditYear && entry.auditYear !== auditYear) return false;
      if (fillerUsername && entry.fillerUsername !== fillerUsername) return false;
      if (query) {
        const haystack = [
          entry.id,
          entry.unit,
          entry.fillerName,
          entry.fillerUsername,
          entry.auditYear
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function getChecklistStatusBucketKey(entry) {
    const normalizedStatus = cleanText(entry && entry.status).toLowerCase();
    const summary = entry && entry.summary && typeof entry.summary === 'object' ? entry.summary : {};
    const answered = Number(summary.conform || 0)
      + Number(summary.partial || 0)
      + Number(summary.nonConform || 0)
      + Number(summary.na || 0);
    if (normalizedStatus === STATUSES.SUBMITTED) return 'closed';
    return (answered > 0 || Number(summary.total || 0) > 0 || (entry && (entry.updatedAt || entry.fillDate)))
      ? 'pending_export'
      : 'editing';
  }

  function summarizeChecklistItems(items) {
    return (Array.isArray(items) ? items : []).reduce((result, entry) => {
      result.total += 1;
      const bucket = getChecklistStatusBucketKey(entry);
      if (bucket === 'closed') result.closed += 1;
      else if (bucket === 'pending_export') result.pendingExport += 1;
      else result.editing += 1;
      return result;
    }, {
      total: 0,
      editing: 0,
      pendingExport: 0,
      closed: 0
    });
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
      health.list = await resolveChecklistsList();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'Checklists list is not ready.';
    }
    return health;
  }

  function assertEditable(existing) {
    if (existing && existing.item.status === STATUSES.SUBMITTED) {
      throw createError('\u6aa2\u6838\u8868\u5df2\u6b63\u5f0f\u9001\u51fa\uff0c\u7121\u6cd5\u518d\u4fee\u6539\u3002', 409);
    }
  }

  async function handleHealth(_req, res, origin) {
    try {
      const health = await buildHealth();
      if (!state.entriesCache && !state.entriesPromise) {
        primeChecklistCacheInBackground('health-check', 0, false);
      }
      await writeJson(res, buildJsonResponse(200, health), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read checklist backend health.', 500), origin);
    }
  }

  async function handleList(req, res, origin, url) {
    const startedAt = Date.now();
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const summaryOnly = cleanText(url && url.searchParams && url.searchParams.get('summaryOnly')) === '1';
      const cacheKey = buildChecklistQueryCacheKey(authz, url, state.entriesCacheAt || 0);
      const cacheLookup = readQueryCache(state.queryCache, cacheKey);
      const cached = cacheLookup && cacheLookup.body;
      if (cached) {
        logChecklistCache('query cache hit', {
          username: authz.username,
          total: cached.total,
          returnedRows: cached.page && cached.page.returned,
          limit: cached.page && cached.page.limit,
          offset: cached.page && cached.page.offset,
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
      const rows = await listAllEntries();
      const versionKey = state.entriesCacheAt || rows.length;
      const resolvedCacheKey = buildChecklistQueryCacheKey(authz, url, versionKey);
      const items = filterItems(rows.map((entry) => entry.item), url)
        .filter((entry) => requestAuthz.canAccessChecklist(authz, entry));
      const page = buildChecklistPageMeta(url, items.length);
      const visibleItems = page.paged
        ? items.slice(page.offset, page.offset + page.limit)
        : items;
      const responsePage = summaryOnly
        ? {
            ...page,
            returned: 0,
            pageStart: 0,
            pageEnd: 0
          }
        : page;
      const responseBody = {
        ok: true,
        items: summaryOnly ? [] : visibleItems.map(mapChecklistForClient),
        total: items.length,
        summary: summarizeChecklistItems(items),
        page: responsePage,
        cache: {
          query: 'computed',
          summaryOnly,
          reason: cacheLookup && cacheLookup.reason || 'computed'
        },
        contractVersion: CONTRACT_VERSION
      };
      const cachedBody = writeQueryCache(state.queryCache, resolvedCacheKey, responseBody, CHECKLIST_QUERY_CACHE_MAX);
      logChecklistCache('list served', {
        username: authz.username,
        totalRows: rows.length,
        visibleRows: items.length,
        returnedRows: visibleItems.length,
        paged: page.paged,
        limit: page.limit,
        offset: page.offset,
        cacheHit: false,
        durationMs: Date.now() - startedAt
      });
      await writeJson(res, buildJsonResponse(200, cachedBody), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list checklists.', 500), origin);
    }
  }

  async function handleDetail(req, res, origin, checklistId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByChecklistId(checklistId);
      if (!existing) {
        throw createError('\u627e\u4e0d\u5230\u6307\u5b9a\u7684\u6aa2\u6838\u8868\u3002', 404);
      }
      if (!requestAuthz.canAccessChecklist(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have access to this checklist', 403);
      }
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        item: mapChecklistForClient(existing.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read checklist detail.', 500), origin);
    }
  }

  async function writeChecklist(req, res, origin, checklistId, action, status) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const existing = await getEntryByChecklistId(checklistId);
      assertEditable(existing);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, action);
      const payload = normalizeChecklistPayload(envelope.payload);
      if (cleanText(checklistId) !== cleanText(payload.id)) {
        throw createError('\u8def\u7531\u7de8\u865f\u8207 payload \u7de8\u865f\u4e0d\u4e00\u81f4\u3002', 400);
      }
      if (existing && !requestAuthz.canEditChecklist(authz, existing.item)) {
        throw requestAuthz.createHttpError('You do not have permission to edit this checklist', 403);
      }
      if (!existing) {
        const intendedUnit = cleanText(payload.unit);
        if (!(requestAuthz.isAdmin(authz) || requestAuthz.hasUnitAccess(authz, intendedUnit) || requestAuthz.matchesUsername(authz, payload.fillerUsername))) {
          throw requestAuthz.createHttpError('You do not have permission to create a checklist for this unit', 403);
        }
      }
      validateChecklistPayload(payload, {
        requireSubmittedState: status === STATUSES.SUBMITTED
      });
      const duplicate = await findDuplicateChecklist(payload.unit, payload.auditYear, payload.id);
      if (duplicate) {
        throw createError('\u672c\u5e74\u5ea6\u8a72\u55ae\u4f4d\u5df2\u5b58\u5728\u6aa2\u6838\u8868\uff0c\u8acb\u6539\u70ba\u7e8c\u586b\u6216\u67e5\u770b\u65e2\u6709\u7d00\u9304\u3002', 409);
      }
      const now = new Date().toISOString();
      const actorDisplay = actorLabel(payload, payload.fillerName);
      const nextItem = createChecklistRecord({
        ...payload,
        createdAt: existing ? existing.item.createdAt : payload.createdAt
      }, status, now);
      const stored = await upsertChecklist(existing, nextItem);
      const parsedId = parseChecklistId(stored.item.id);
      const actor = requestAuthz.buildActorDetails(authz);
      await createAuditRow({
        eventType: status === STATUSES.SUBMITTED ? 'checklist.submitted' : 'checklist.draft_saved',
        actorEmail: actor.actorEmail,
        unitCode: cleanText(stored.item.unitCode) || cleanText(parsedId && parsedId.unitCode),
        recordId: stored.item.id,
        occurredAt: now,
        payloadJson: JSON.stringify({
          actorName: actor.actorName,
          actorUsername: actor.actorUsername,
          actorLabel: actorDisplay,
          snapshot: existing ? null : buildChecklistSnapshot(stored.item),
          changes: buildChecklistChanges(existing && existing.item, stored.item)
        })
      });
      await writeJson(res, buildJsonResponse(stored.created ? 201 : 200, {
        ok: true,
        item: mapChecklistForClient(stored.item),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      const fallbackMessage = status === STATUSES.SUBMITTED
        ? 'Failed to submit checklist.'
        : 'Failed to save checklist draft.';
      await writeJson(res, buildErrorResponse(error, fallbackMessage), origin);
    }
  }

  async function deleteChecklistYear(req, res, origin, auditYear) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only highest admin can delete checklist years.');
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ACTIONS.DELETE_YEAR);
      const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      const targetYear = cleanText(auditYear || payload.auditYear);
      if (!targetYear) throw createError('缺少年度。', 400);
      const deletedEntries = await deleteChecklistEntriesByYear(targetYear);
      const now = new Date().toISOString();
      const actor = requestAuthz.buildActorDetails(authz);
      await createAuditRow({
        eventType: 'checklist.year_deleted',
        actorEmail: actor.actorEmail,
        unitCode: '',
        recordId: 'CHECKLIST-YEAR-' + targetYear,
        occurredAt: now,
        payloadJson: JSON.stringify({
          actorName: actor.actorName,
          actorUsername: actor.actorUsername,
          year: targetYear,
          deletedCount: deletedEntries.length,
          deletedItems: deletedEntries.map((entry) => buildChecklistSnapshot(entry.item))
        })
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        deletedCount: deletedEntries.length,
        deletedIds: deletedEntries.map((entry) => cleanText(entry.item && entry.item.id)).filter(Boolean),
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to delete checklist year.', 500), origin);
    }
  }

  async function tryHandle(req, res, origin, url) {
    const pathname = cleanText(url && url.pathname);
    if (pathname === '/api/checklists/health') {
      await handleHealth(req, res, origin);
      return true;
    }
    if (pathname === '/api/checklists' && req.method === 'GET') {
      await handleList(req, res, origin, url);
      return true;
    }

    const detailMatch = pathname.match(/^\/api\/checklists\/([^/]+)$/);
    if (detailMatch && req.method === 'GET') {
      await handleDetail(req, res, origin, routeChecklistId(detailMatch[1]));
      return true;
    }

    const saveDraftMatch = pathname.match(/^\/api\/checklists\/([^/]+)\/save-draft$/);
    if (saveDraftMatch && req.method === 'POST') {
      await writeChecklist(req, res, origin, routeChecklistId(saveDraftMatch[1]), ACTIONS.SAVE_DRAFT, STATUSES.DRAFT);
      return true;
    }

    const submitMatch = pathname.match(/^\/api\/checklists\/([^/]+)\/submit$/);
    if (submitMatch && req.method === 'POST') {
      await writeChecklist(req, res, origin, routeChecklistId(submitMatch[1]), ACTIONS.SUBMIT, STATUSES.SUBMITTED);
      return true;
    }

    const deleteYearMatch = pathname.match(/^\/api\/checklists\/year\/([^/]+)$/);
    if (deleteYearMatch && req.method === 'DELETE') {
      await deleteChecklistYear(req, res, origin, routeChecklistId(deleteYearMatch[1]));
      return true;
    }

    return false;
  }

  restoreChecklistCacheSnapshot();
  primeChecklistCacheInBackground('router-startup', CHECKLIST_PREWARM_DELAY_MS, true);

  return {
    tryHandle
  };
}

module.exports = {
  createChecklistRouter
};
