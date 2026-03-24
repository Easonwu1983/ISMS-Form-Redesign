const fs = require('fs');
const path = require('path');

const {
  CONTRACT_VERSION,
  buildErrorResponse,
  buildJsonResponse,
  cleanText,
  createError,
  mapGraphFieldsToAuditEntry,
  summarizeAuditEntries
} = require('../azure-function/audit-trail-api/src/shared/contract');

function createAuditTrailRouter(deps) {
  const {
    writeJson,
    graphRequest,
    resolveSiteId,
    getDelegatedToken,
    requestAuthz
  } = deps;

  const state = {
    listMap: null,
    entriesCache: null,
    entriesPromise: null,
    queryCache: new Map(),
    prewarmQueued: false
  };
  const AUDIT_TRAIL_CACHE_MS = 300000;
  const AUDIT_TRAIL_QUERY_CACHE_MS = 60000;
  const AUDIT_TRAIL_QUERY_CACHE_MAX = 32;
  const AUDIT_TRAIL_PREWARM_DELAY_MS = 15000;
  const AUDIT_TRAIL_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const AUDIT_TRAIL_FIELDS = [
    'Title',
    'EventType',
    'ActorEmail',
    'TargetEmail',
    'UnitCode',
    'RecordId',
    'OccurredAt',
    'PayloadJson'
  ].join(',');

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  }

  function getAuditSnapshotPath() {
    const root = process.cwd();
    return path.join(root, 'logs', 'campus-backend', 'audit-trail-cache.json');
  }

  function logAuditTrail(message, details) {
    const suffix = details && typeof details === 'object'
      ? Object.entries(details)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
      : '';
    console.log(`[audit-trail] ${message}${suffix ? ` ${suffix}` : ''}`);
  }

  function getRequestId(req) {
    return cleanText(req && req.__ismsRequestId) || cleanText(req && req.headers && req.headers['x-request-id']);
  }

  function clearAuditQueryCache() {
    if (state.queryCache instanceof Map) {
      state.queryCache.clear();
    }
  }

  function getAuditFilterSignature(url) {
    const keyword = cleanText(url && url.searchParams && url.searchParams.get('keyword')).toLowerCase();
    const eventType = cleanText(url && url.searchParams && url.searchParams.get('eventType'));
    const actorEmail = cleanText(url && url.searchParams && url.searchParams.get('actorEmail')).toLowerCase().toLowerCase();
    const targetEmail = cleanText(url && url.searchParams && url.searchParams.get('targetEmail')).toLowerCase();
    const unitCode = cleanText(url && url.searchParams && url.searchParams.get('unitCode'));
    const recordId = cleanText(url && url.searchParams && url.searchParams.get('recordId'));
    const rawLimit = Number(url && url.searchParams && url.searchParams.get('limit') || 100);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100;
    const rawOffset = Number(url && url.searchParams && url.searchParams.get('offset') || 0);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    return [
      keyword,
      eventType,
      actorEmail,
      targetEmail,
      unitCode,
      recordId,
      String(limit),
      String(offset)
    ].join('::');
  }

  function getAuditQueryCache(signature, listLoadedAt) {
    if (!signature || !state.queryCache || typeof state.queryCache.get !== 'function') {
      return null;
    }
    const cached = state.queryCache.get(signature);
    if (!cached) return null;
    if (!Number.isFinite(cached.loadedAt)) return null;
    if (cached.listLoadedAt !== listLoadedAt) return null;
    if ((Date.now() - cached.loadedAt) >= AUDIT_TRAIL_QUERY_CACHE_MS) return null;
    return cached.value || null;
  }

  function hasDetailedAuditFilters(url) {
    return [
      cleanText(url && url.searchParams && url.searchParams.get('keyword')),
      cleanText(url && url.searchParams && url.searchParams.get('eventType')),
      cleanText(url && url.searchParams && url.searchParams.get('actorEmail')),
      cleanText(url && url.searchParams && url.searchParams.get('targetEmail')),
      cleanText(url && url.searchParams && url.searchParams.get('unitCode')),
      cleanText(url && url.searchParams && url.searchParams.get('recordId'))
    ].some(Boolean);
  }

  function getAuditQueryPageMeta(url) {
    const rawLimit = Number(url && url.searchParams && url.searchParams.get('limit') || 100);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100;
    const rawOffset = Number(url && url.searchParams && url.searchParams.get('offset') || 0);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    return { limit, offset };
  }

  function setAuditQueryCache(signature, listLoadedAt, value) {
    if (!signature || !state.queryCache || typeof state.queryCache.set !== 'function') return;
    state.queryCache.set(signature, {
      loadedAt: Date.now(),
      listLoadedAt,
      value
    });
    if (state.queryCache.size > AUDIT_TRAIL_QUERY_CACHE_MAX) {
      const firstKey = state.queryCache.keys().next().value;
      if (firstKey) state.queryCache.delete(firstKey);
    }
  }

  async function fetchListMap() {
    const siteId = await resolveSiteId();
    const body = await graphRequest('GET', `/sites/${siteId}/lists?$select=id,displayName,webUrl`);
    return new Map((Array.isArray(body && body.value) ? body.value : []).map((entry) => [cleanText(entry.displayName), entry]));
  }

  async function resolveAuditList() {
    const listName = getAuditListName();
    if (!state.listMap || !state.listMap.has(listName)) {
      state.listMap = await fetchListMap();
    }
    let list = state.listMap.get(listName);
    if (!list) {
      state.listMap = await fetchListMap();
      list = state.listMap.get(listName);
    }
    if (!list) throw createError(`SharePoint list not found: ${listName}`, 500);
    return list;
  }

  async function listAllEntries() {
    return listAllEntriesWithOptions({});
  }

  async function listAllEntriesWithOptions(options) {
    const now = Date.now();
    const forceRefresh = !!(options && options.forceRefresh);
    const cached = state.entriesCache;
    if (!forceRefresh && cached && Array.isArray(cached.rows) && Number.isFinite(cached.loadedAt) && (now - cached.loadedAt) < AUDIT_TRAIL_CACHE_MS) {
      logAuditTrail('list cache hit', {
        rows: cached.rows.length,
        ageMs: now - cached.loadedAt
      });
      return cached.rows;
    }
    if (state.entriesPromise) {
      return state.entriesPromise;
    }
    state.entriesPromise = (async () => {
      const startedAt = Date.now();
      const siteId = await resolveSiteId();
      const list = await resolveAuditList();
      const rows = [];
      let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields($select=${AUDIT_TRAIL_FIELDS})&$top=200`;
      while (nextUrl) {
        const body = await graphRequest('GET', nextUrl);
        const batch = Array.isArray(body && body.value) ? body.value : [];
        rows.push(...batch.map((entry) => ({
          listItemId: cleanText(entry && entry.id),
          item: {
            listItemId: cleanText(entry && entry.id),
            ...mapGraphFieldsToAuditEntry(entry && entry.fields ? entry.fields : {})
          }
        })));
        nextUrl = cleanText(body && body['@odata.nextLink']);
      }
      rows.sort((left, right) => cleanText(right.item && right.item.occurredAt).localeCompare(cleanText(left.item && left.item.occurredAt), 'zh-Hant'));
      state.entriesCache = {
        loadedAt: Date.now(),
        rows
      };
      clearAuditQueryCache();
      persistEntriesCacheSnapshot(state.entriesCache).catch((error) => {
        logAuditTrail('list snapshot write failed', {
          message: cleanText(error && error.message) || 'unknown error'
        });
      });
      logAuditTrail('list cache miss', {
        rows: rows.length,
        durationMs: Date.now() - startedAt
      });
      return rows;
    })();
    try {
      return await state.entriesPromise;
    } finally {
      state.entriesPromise = null;
    }
  }

  async function listRecentEntries(limit) {
    const siteId = await resolveSiteId();
    const list = await resolveAuditList();
    const top = Math.max(1, Math.min(Number(limit) || 50, 200));
    const body = await graphRequest('GET', `/sites/${siteId}/lists/${list.id}/items?$expand=fields($select=${AUDIT_TRAIL_FIELDS})&$orderby=id desc&$top=${top}`);
    const batch = Array.isArray(body && body.value) ? body.value : [];
    return batch.map((entry) => ({
      listItemId: cleanText(entry && entry.id),
      item: {
        listItemId: cleanText(entry && entry.id),
        ...mapGraphFieldsToAuditEntry(entry && entry.fields ? entry.fields : {})
      }
    })).sort((left, right) => {
      const leftAt = Date.parse(left && left.item && left.item.occurredAt || '') || 0;
      const rightAt = Date.parse(right && right.item && right.item.occurredAt || '') || 0;
      return rightAt - leftAt;
    });
  }

  function restoreEntriesCacheSnapshot() {
    try {
      const snapshotPath = getAuditSnapshotPath();
      if (!fs.existsSync(snapshotPath)) return false;
      const raw = fs.readFileSync(snapshotPath, 'utf8').replace(/^\uFEFF/, '');
      if (!raw.trim()) return false;
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed && parsed.rows) ? parsed.rows : [];
      const loadedAt = Number(parsed && parsed.loadedAt);
      if (!rows.length || !Number.isFinite(loadedAt)) return false;
      const ageMs = Date.now() - loadedAt;
      if (ageMs > AUDIT_TRAIL_SNAPSHOT_MAX_AGE_MS) {
        logAuditTrail('list snapshot skipped', {
          reason: 'expired',
          ageMs
        });
        return false;
      }
      state.entriesCache = {
        loadedAt,
        rows
      };
      clearAuditQueryCache();
      logAuditTrail('list snapshot restored', {
        rows: rows.length,
        ageMs
      });
      return true;
    } catch (error) {
      logAuditTrail('list snapshot restore failed', {
        message: cleanText(error && error.message) || 'unknown error'
      });
      return false;
    }
  }

  async function persistEntriesCacheSnapshot(cache) {
    const payload = {
      loadedAt: Number(cache && cache.loadedAt) || Date.now(),
      rows: Array.isArray(cache && cache.rows) ? cache.rows : []
    };
    const snapshotPath = getAuditSnapshotPath();
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    const tempPath = `${snapshotPath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(payload), 'utf8');
    await fs.promises.rename(tempPath, snapshotPath);
    logAuditTrail('list snapshot saved', {
      rows: payload.rows.length,
      loadedAt: payload.loadedAt
    });
  }

  function primeEntriesCacheInBackground(reason, delayMs, forceRefresh) {
    if ((!forceRefresh && state.entriesCache) || state.entriesPromise || state.prewarmQueued) {
      return false;
    }
    const safeDelay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 0;
    state.prewarmQueued = true;
    logAuditTrail('list prewarm queued', {
      reason: cleanText(reason) || 'unknown',
      delayMs: safeDelay
    });
    setTimeout(() => {
      state.prewarmQueued = false;
      listAllEntriesWithOptions({ forceRefresh })
        .then((rows) => {
          logAuditTrail('list prewarm ready', {
            reason: cleanText(reason) || 'unknown',
            rows: Array.isArray(rows) ? rows.length : 0
          });
        })
        .catch((error) => {
          logAuditTrail('list prewarm failed', {
            reason: cleanText(reason) || 'unknown',
            message: cleanText(error && error.message) || 'unknown error'
          });
        });
    }, safeDelay);
    return true;
  }

  function matchesKeyword(entry, keyword) {
    if (!keyword) return true;
    const haystack = cleanText(entry && entry.searchText).toLowerCase();
    return haystack.includes(keyword);
  }

  function filterEntries(items, url) {
    const keyword = cleanText(url.searchParams.get('keyword')).toLowerCase();
    const eventType = cleanText(url.searchParams.get('eventType'));
    const actorEmail = cleanText(url.searchParams.get('actorEmail')).toLowerCase();
    const targetEmail = cleanText(url.searchParams.get('targetEmail')).toLowerCase();
    const unitCode = cleanText(url.searchParams.get('unitCode'));
    const recordId = cleanText(url.searchParams.get('recordId'));
    const rawLimit = Number(url.searchParams.get('limit') || 100);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100;
    const rawOffset = Number(url.searchParams.get('offset') || 0);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    const matches = [];
    for (const entry of Array.isArray(items) ? items : []) {
      if (eventType && cleanText(entry.eventTypeKey || entry.eventType) !== eventType) continue;
      if (actorEmail && cleanText(entry.actorEmailKey || entry.actorEmail).toLowerCase() !== actorEmail) continue;
      if (targetEmail && cleanText(entry.targetEmailKey || entry.targetEmail).toLowerCase() !== targetEmail) continue;
      if (unitCode && cleanText(entry.unitCodeKey || entry.unitCode) !== unitCode) continue;
      if (recordId && cleanText(entry.recordIdKey || entry.recordId) !== recordId) continue;
      if (!matchesKeyword(entry, keyword)) continue;
      matches.push(entry);
    }
    const total = matches.length;
    const maxOffset = total > 0 ? Math.max(0, Math.floor((total - 1) / limit) * limit) : 0;
    const safeOffset = Math.min(Math.max(0, offset), maxOffset);
    const itemsOnPage = matches.slice(safeOffset, safeOffset + limit);
    const pageCount = total > 0 ? Math.max(1, Math.ceil(total / limit)) : 0;
    const currentPage = total > 0 ? Math.floor(safeOffset / limit) + 1 : 0;
    const hasPrev = safeOffset > 0;
    const hasNext = safeOffset + limit < total;
    return {
      items: itemsOnPage,
      total,
      summary: summarizeAuditEntries(matches),
      page: {
        offset: safeOffset,
        limit,
        total,
        pageCount,
        currentPage,
        hasPrev,
        hasNext,
        prevOffset: hasPrev ? Math.max(0, safeOffset - limit) : 0,
        nextOffset: hasNext ? safeOffset + limit : safeOffset,
        pageStart: itemsOnPage.length ? safeOffset + 1 : 0,
        pageEnd: itemsOnPage.length ? safeOffset + itemsOnPage.length : 0
      }
    };
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
      health.list = await resolveAuditList();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'Audit list is not ready.';
    }
    return health;
  }

  async function handleHealth(_req, res, origin) {
    try {
      const requestId = getRequestId(_req);
      if (requestId) {
        logAuditTrail('health requested', { requestId });
      }
      const health = await buildHealth();
      if (health && health.ready) {
        primeEntriesCacheInBackground('health-check', 0);
      }
      await writeJson(res, buildJsonResponse(200, health), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read audit trail backend health.', 500), origin);
    }
  }

  async function handleList(req, res, origin, url) {
    const startedAt = Date.now();
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can view audit trail');
      const requestId = getRequestId(req);
      const querySignature = getAuditFilterSignature(url);
      logAuditTrail('list requested', {
        requestId,
        username: authz.username,
        role: authz.role,
        querySignature
      });
      const pageMeta = getAuditQueryPageMeta(url);
      const canUseFastPath = !state.entriesCache && !state.entriesPromise && !hasDetailedAuditFilters(url) && pageMeta.offset === 0;
      if (canUseFastPath) {
        try {
          const recentRows = await listRecentEntries(pageMeta.limit);
          const recentItems = recentRows.map((entry) => entry.item);
          const fastResult = {
            items: recentItems,
            total: recentItems.length,
            summary: summarizeAuditEntries(recentItems),
            page: {
              offset: 0,
              limit: pageMeta.limit,
              total: recentItems.length,
              pageCount: recentItems.length ? 1 : 0,
              currentPage: recentItems.length ? 1 : 0,
              hasPrev: false,
              hasNext: recentItems.length >= pageMeta.limit,
              prevOffset: 0,
              nextOffset: pageMeta.limit,
              pageStart: recentItems.length ? 1 : 0,
              pageEnd: recentItems.length
            }
          };
          setAuditQueryCache(querySignature, 0, fastResult);
          logAuditTrail('list fast-path', {
            requestId,
            querySignature,
            total: fastResult.total,
            limit: pageMeta.limit,
            durationMs: Date.now() - startedAt
          });
          await writeJson(res, buildJsonResponse(200, {
            ok: true,
            items: fastResult.items,
            total: fastResult.total,
            page: fastResult.page,
            summary: fastResult.summary,
            contractVersion: CONTRACT_VERSION
          }), origin);
          return;
        } catch (fastPathError) {
          logAuditTrail('list fast-path fallback', {
            requestId,
            querySignature,
            message: String(fastPathError && fastPathError.message || fastPathError || ''),
            durationMs: Date.now() - startedAt
          });
        }
      }
      const rows = await listAllEntries();
      const listLoadedAt = Number(state.entriesCache && state.entriesCache.loadedAt) || 0;
      const cachedQuery = getAuditQueryCache(querySignature, listLoadedAt);
      if (cachedQuery) {
        logAuditTrail('list query cache hit', {
          requestId,
          querySignature,
          total: cachedQuery.total,
          offset: cachedQuery.page && cachedQuery.page.offset,
          limit: cachedQuery.page && cachedQuery.page.limit,
          durationMs: Date.now() - startedAt
        });
        await writeJson(res, buildJsonResponse(200, {
          ok: true,
          items: cachedQuery.items,
          total: cachedQuery.total,
          page: cachedQuery.page,
          summary: cachedQuery.summary,
          contractVersion: CONTRACT_VERSION
        }), origin);
        return;
      }
      const filtered = filterEntries(rows.map((entry) => entry.item), url);
      setAuditQueryCache(querySignature, listLoadedAt, filtered);
      logAuditTrail('list query computed', {
        requestId,
        querySignature,
        total: filtered.total,
        offset: filtered.page && filtered.page.offset,
        limit: filtered.page && filtered.page.limit,
        durationMs: Date.now() - startedAt
      });
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items: filtered.items,
        total: filtered.total,
        page: filtered.page,
        summary: filtered.summary,
        contractVersion: CONTRACT_VERSION
      }), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to list audit trail.', 500), origin);
    }
  }

  async function tryHandle(req, res, origin, url) {
    const pathname = cleanText(url && url.pathname);
    if (pathname === '/api/audit-trail/health' && req.method === 'GET') {
      await handleHealth(req, res, origin);
      return true;
    }
    if (pathname === '/api/audit-trail' && req.method === 'GET') {
      await handleList(req, res, origin, url);
      return true;
    }
    return false;
  }

  restoreEntriesCacheSnapshot();
  primeEntriesCacheInBackground('router-startup', AUDIT_TRAIL_PREWARM_DELAY_MS, true);

  return {
    tryHandle
  };
}

module.exports = {
  createAuditTrailRouter
};
