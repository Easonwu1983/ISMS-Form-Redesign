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
    summaryOnlyPageCache: new Map(),
    prewarmQueued: false,
    unfilteredSummary: null
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
    if (state.summaryOnlyPageCache instanceof Map) {
      state.summaryOnlyPageCache.clear();
    }
  }

  function rebuildAuditDerivedState(rows) {
    const items = Array.isArray(rows) ? rows.map((entry) => entry && entry.item).filter(Boolean) : [];
    state.unfilteredSummary = summarizeAuditEntries(items);
    return state.unfilteredSummary;
  }

  function getAuditFilterSignature(url) {
    const keyword = cleanText(url && url.searchParams && url.searchParams.get('keyword')).toLowerCase();
    const eventType = cleanText(url && url.searchParams && url.searchParams.get('eventType'));
    const occurredFrom = cleanText(url && url.searchParams && url.searchParams.get('occurredFrom'));
    const occurredTo = cleanText(url && url.searchParams && url.searchParams.get('occurredTo'));
    const actorEmail = cleanText(url && url.searchParams && url.searchParams.get('actorEmail')).toLowerCase().toLowerCase();
    const targetEmail = cleanText(url && url.searchParams && url.searchParams.get('targetEmail')).toLowerCase();
    const unitCode = cleanText(url && url.searchParams && url.searchParams.get('unitCode'));
    const recordId = cleanText(url && url.searchParams && url.searchParams.get('recordId'));
    const summaryOnly = cleanText(url && url.searchParams && url.searchParams.get('summaryOnly'));
    const rawLimit = Number(url && url.searchParams && url.searchParams.get('limit') || 100);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100;
    const rawOffset = Number(url && url.searchParams && url.searchParams.get('offset') || 0);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    return [
      keyword,
      eventType,
      occurredFrom,
      occurredTo,
      actorEmail,
      targetEmail,
      unitCode,
      recordId,
      summaryOnly,
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
      cleanText(url && url.searchParams && url.searchParams.get('occurredFrom')),
      cleanText(url && url.searchParams && url.searchParams.get('occurredTo')),
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

  function buildAuditPageMeta(total, limit, offset, returnedCount, hasNextOverride) {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 100;
    const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
    const safeCount = Number.isFinite(returnedCount) && returnedCount > 0 ? Math.floor(returnedCount) : 0;
    if (Number.isFinite(total) && total >= 0) {
      const safeTotal = Math.floor(total);
      const maxOffset = safeTotal > 0 ? Math.max(0, Math.floor((safeTotal - 1) / safeLimit) * safeLimit) : 0;
      const normalizedOffset = Math.min(Math.max(0, safeOffset), maxOffset);
      const pageCount = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / safeLimit)) : 0;
      const currentPage = safeTotal > 0 ? Math.floor(normalizedOffset / safeLimit) + 1 : 0;
      const hasPrev = normalizedOffset > 0;
      const hasNext = normalizedOffset + safeLimit < safeTotal;
      return {
        offset: normalizedOffset,
        limit: safeLimit,
        total: safeTotal,
        pageCount,
        currentPage,
        hasPrev,
        hasNext,
        prevOffset: hasPrev ? Math.max(0, normalizedOffset - safeLimit) : 0,
        nextOffset: hasNext ? normalizedOffset + safeLimit : normalizedOffset,
        pageStart: safeCount ? normalizedOffset + 1 : 0,
        pageEnd: safeCount ? normalizedOffset + safeCount : 0
      };
    }
    const hasPrev = safeOffset > 0;
    const hasNext = !!hasNextOverride;
    const currentPage = safeCount || hasPrev || hasNext ? Math.floor(safeOffset / safeLimit) + 1 : 0;
    const inferredTotal = safeOffset + safeCount + (hasNext ? 1 : 0);
    const pageCount = currentPage ? (hasNext ? currentPage + 1 : currentPage) : 0;
    return {
      offset: safeOffset,
      limit: safeLimit,
      total: inferredTotal,
      pageCount,
      currentPage,
      hasPrev,
      hasNext,
      prevOffset: hasPrev ? Math.max(0, safeOffset - safeLimit) : 0,
      nextOffset: hasNext ? safeOffset + safeLimit : safeOffset,
      pageStart: safeCount ? safeOffset + 1 : 0,
      pageEnd: safeCount ? safeOffset + safeCount : 0
    };
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

  function getAuditSummaryOnlyPageCache(limit, offset, listLoadedAt) {
    if (!(state.summaryOnlyPageCache instanceof Map)) return null;
    const key = [String(listLoadedAt || 0), String(limit || 0), String(offset || 0)].join('::');
    const cached = state.summaryOnlyPageCache.get(key);
    if (!cached || cached.listLoadedAt !== listLoadedAt) return null;
    return cached.value || null;
  }

  function setAuditSummaryOnlyPageCache(limit, offset, listLoadedAt, value) {
    if (!(state.summaryOnlyPageCache instanceof Map)) return;
    const key = [String(listLoadedAt || 0), String(limit || 0), String(offset || 0)].join('::');
    state.summaryOnlyPageCache.set(key, {
      listLoadedAt,
      value
    });
    if (state.summaryOnlyPageCache.size > 16) {
      const firstKey = state.summaryOnlyPageCache.keys().next().value;
      if (firstKey) state.summaryOnlyPageCache.delete(firstKey);
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
      const summary = rebuildAuditDerivedState(rows);
      state.entriesCache = {
        loadedAt: Date.now(),
        rows,
        summary
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

  async function listRecentEntriesPage(offset, limit) {
    const siteId = await resolveSiteId();
    const list = await resolveAuditList();
    const pageSize = Math.max(1, Math.min(Math.max(Number(limit) || 50, 100), 200));
    let remainingOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields($select=${AUDIT_TRAIL_FIELDS})&$orderby=id desc&$top=${pageSize}`;
    const rows = [];
    let hasNext = false;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      let startIndex = 0;
      if (remainingOffset > 0) {
        if (remainingOffset >= batch.length) {
          remainingOffset -= batch.length;
          nextUrl = cleanText(body && body['@odata.nextLink']);
          continue;
        }
        startIndex = remainingOffset;
        remainingOffset = 0;
      }
      for (let index = startIndex; index < batch.length; index += 1) {
        const entry = batch[index];
        rows.push({
          listItemId: cleanText(entry && entry.id),
          item: {
            listItemId: cleanText(entry && entry.id),
            ...mapGraphFieldsToAuditEntry(entry && entry.fields ? entry.fields : {})
          }
        });
        if (rows.length > limit) {
          hasNext = true;
          break;
        }
      }
      if (hasNext) break;
      nextUrl = cleanText(body && body['@odata.nextLink']);
      if (rows.length === limit && nextUrl) {
        hasNext = true;
        break;
      }
    }
    return {
      rows: rows.slice(0, Math.max(0, Number(limit) || 0)),
      hasNext
    };
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
      const derivedSummary = parsed && parsed.summary && typeof parsed.summary === 'object'
        ? parsed.summary
        : rebuildAuditDerivedState(rows);
      state.unfilteredSummary = derivedSummary;
      state.entriesCache = {
        loadedAt,
        rows,
        summary: derivedSummary
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
      rows: Array.isArray(cache && cache.rows) ? cache.rows : [],
      summary: cache && cache.summary && typeof cache.summary === 'object'
        ? cache.summary
        : summarizeAuditEntries(Array.isArray(cache && cache.rows) ? cache.rows.map((entry) => entry.item) : [])
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

  function getAuditOccurredDateKey(entry) {
    const occurredAt = cleanText(entry && entry.occurredAt);
    if (!occurredAt) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(occurredAt)) {
      return occurredAt.slice(0, 10);
    }
    const parsed = new Date(occurredAt);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }

  function filterEntries(items, url) {
    const keyword = cleanText(url.searchParams.get('keyword')).toLowerCase();
    const eventType = cleanText(url.searchParams.get('eventType'));
    const occurredFrom = cleanText(url.searchParams.get('occurredFrom'));
    const occurredTo = cleanText(url.searchParams.get('occurredTo'));
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
      const occurredDateKey = getAuditOccurredDateKey(entry);
      if (eventType && cleanText(entry.eventTypeKey || entry.eventType) !== eventType) continue;
      if (occurredFrom && (!occurredDateKey || occurredDateKey < occurredFrom)) continue;
      if (occurredTo && (!occurredDateKey || occurredDateKey > occurredTo)) continue;
      if (actorEmail && cleanText(entry.actorEmailKey || entry.actorEmail).toLowerCase() !== actorEmail) continue;
      if (targetEmail && cleanText(entry.targetEmailKey || entry.targetEmail).toLowerCase() !== targetEmail) continue;
      if (unitCode && cleanText(entry.unitCodeKey || entry.unitCode) !== unitCode) continue;
      if (recordId && cleanText(entry.recordIdKey || entry.recordId) !== recordId) continue;
      if (!matchesKeyword(entry, keyword)) continue;
      matches.push(entry);
    }
    const total = matches.length;
    const page = buildAuditPageMeta(total, limit, offset, 0);
    const itemsOnPage = matches.slice(page.offset, page.offset + page.limit);
    return {
      items: itemsOnPage,
      total,
      summary: summarizeAuditEntries(matches),
      page: buildAuditPageMeta(total, page.limit, page.offset, itemsOnPage.length)
    };
  }

  function buildUnfilteredCachedResult(pageMeta) {
    const rows = Array.isArray(state.entriesCache && state.entriesCache.rows) ? state.entriesCache.rows : [];
    const summary = state.entriesCache && state.entriesCache.summary && typeof state.entriesCache.summary === 'object'
      ? state.entriesCache.summary
      : summarizeAuditEntries(rows.map((entry) => entry.item));
    const basePage = buildAuditPageMeta(rows.length, pageMeta.limit, pageMeta.offset, 0);
    const items = rows.slice(basePage.offset, basePage.offset + basePage.limit).map((entry) => entry.item);
    return {
      items,
      total: rows.length,
      summary,
      page: buildAuditPageMeta(rows.length, basePage.limit, basePage.offset, items.length)
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
      const summaryOnly = cleanText(url && url.searchParams && url.searchParams.get('summaryOnly')) === '1';
      const requestId = getRequestId(req);
      const querySignature = getAuditFilterSignature(url);
      logAuditTrail('list requested', {
        requestId,
        username: authz.username,
        role: authz.role,
        querySignature
      });
      const pageMeta = getAuditQueryPageMeta(url);
      const hasDetailedFilters = hasDetailedAuditFilters(url);
      const listLoadedAt = Number(state.entriesCache && state.entriesCache.loadedAt) || 0;
      const canUseSummaryOnlyPath = summaryOnly
        && !hasDetailedFilters
        && state.entriesCache
        && Array.isArray(state.entriesCache.rows)
        && state.unfilteredSummary
        && typeof state.unfilteredSummary === 'object';
      if (canUseSummaryOnlyPath) {
        const cachedSummaryPage = getAuditSummaryOnlyPageCache(
          pageMeta.limit,
          pageMeta.offset,
          Number(state.entriesCache && state.entriesCache.loadedAt) || 0
        );
        if (cachedSummaryPage) {
          logAuditTrail('list summary-only cache hit', {
            requestId,
            querySignature,
            total: cachedSummaryPage.total,
            offset: cachedSummaryPage.page && cachedSummaryPage.page.offset,
            limit: cachedSummaryPage.page && cachedSummaryPage.page.limit,
            durationMs: Date.now() - startedAt
          });
          await writeJson(res, buildJsonResponse(200, {
            ok: true,
            items: [],
            total: cachedSummaryPage.total,
            page: cachedSummaryPage.page,
            summary: cachedSummaryPage.summary,
            cache: {
              query: 'hit',
              summaryOnly: true,
              reason: 'summary-only-hit'
            },
            contractVersion: CONTRACT_VERSION
          }), origin);
          return;
        }
        const total = Array.isArray(state.entriesCache && state.entriesCache.rows)
          ? state.entriesCache.rows.length
          : 0;
        const summaryPage = buildAuditPageMeta(total, pageMeta.limit, pageMeta.offset, 0);
        const summaryResult = {
          items: [],
          total,
          summary: state.unfilteredSummary,
          page: {
            ...summaryPage,
            returned: 0,
            pageStart: 0,
            pageEnd: 0
          }
        };
        setAuditSummaryOnlyPageCache(
          pageMeta.limit,
          pageMeta.offset,
          Number(state.entriesCache && state.entriesCache.loadedAt) || 0,
          summaryResult
        );
        logAuditTrail('list cached summary', {
          requestId,
          querySignature,
          total,
          offset: summaryResult.page && summaryResult.page.offset,
          limit: summaryResult.page && summaryResult.page.limit,
          durationMs: Date.now() - startedAt
        });
        await writeJson(res, buildJsonResponse(200, {
          ok: true,
          items: [],
          total,
          page: summaryResult.page,
          summary: summaryResult.summary,
          cache: {
            query: 'cached-summary',
            summaryOnly: true
          },
          contractVersion: CONTRACT_VERSION
        }), origin);
        return;
      }
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
          items: summaryOnly ? [] : cachedQuery.items,
          total: cachedQuery.total,
          page: summaryOnly
            ? {
                ...cachedQuery.page,
                returned: 0,
                pageStart: 0,
                pageEnd: 0
              }
            : cachedQuery.page,
          summary: cachedQuery.summary,
          cache: {
            query: 'hit',
            summaryOnly
          },
          contractVersion: CONTRACT_VERSION
        }), origin);
        return;
      }
      const canUseCachedUnfilteredPath = !hasDetailedFilters && state.entriesCache && Array.isArray(state.entriesCache.rows);
      if (canUseCachedUnfilteredPath) {
        const cachedUnfiltered = buildUnfilteredCachedResult(pageMeta);
        setAuditQueryCache(querySignature, Number(state.entriesCache && state.entriesCache.loadedAt) || 0, cachedUnfiltered);
        logAuditTrail('list cached unfiltered page', {
          requestId,
          querySignature,
          total: cachedUnfiltered.total,
          offset: cachedUnfiltered.page && cachedUnfiltered.page.offset,
          limit: cachedUnfiltered.page && cachedUnfiltered.page.limit,
          durationMs: Date.now() - startedAt
        });
        await writeJson(res, buildJsonResponse(200, {
          ok: true,
          items: summaryOnly ? [] : cachedUnfiltered.items,
          total: cachedUnfiltered.total,
          page: summaryOnly
            ? {
                ...cachedUnfiltered.page,
                returned: 0,
                pageStart: 0,
                pageEnd: 0
              }
            : cachedUnfiltered.page,
          summary: cachedUnfiltered.summary,
          cache: {
            query: 'cached-unfiltered',
            summaryOnly
          },
          contractVersion: CONTRACT_VERSION
        }), origin);
        return;
      }
      const canUseFastPath = !state.entriesCache && !state.entriesPromise && !hasDetailedFilters;
      if (canUseFastPath) {
        try {
          const recentPage = await listRecentEntriesPage(pageMeta.offset, pageMeta.limit);
          const recentItems = recentPage.rows.map((entry) => entry.item);
          const cachedTotal = Number(state.entriesCache && state.entriesCache.rows && state.entriesCache.rows.length);
          const total = Number.isFinite(cachedTotal) && cachedTotal >= 0 ? cachedTotal : null;
          const summary = state.entriesCache && state.entriesCache.summary && typeof state.entriesCache.summary === 'object'
            ? state.entriesCache.summary
            : summarizeAuditEntries(recentItems);
          const page = buildAuditPageMeta(total, pageMeta.limit, pageMeta.offset, recentItems.length, recentPage.hasNext);
          const fastResult = {
            items: recentItems,
            total: page.total,
            summary,
            page
          };
          setAuditQueryCache(querySignature, 0, fastResult);
          primeEntriesCacheInBackground('list-fast-path', 0, true);
          logAuditTrail('list fast-path', {
            requestId,
            querySignature,
            total: fastResult.total,
            offset: fastResult.page && fastResult.page.offset,
            limit: pageMeta.limit,
            durationMs: Date.now() - startedAt
          });
          await writeJson(res, buildJsonResponse(200, {
            ok: true,
            items: summaryOnly ? [] : fastResult.items,
            total: fastResult.total,
            page: summaryOnly
              ? {
                  ...fastResult.page,
                  returned: 0,
                  pageStart: 0,
                  pageEnd: 0
                }
              : fastResult.page,
            summary: fastResult.summary,
            cache: {
              query: 'fast-path',
              summaryOnly
            },
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
        items: summaryOnly ? [] : filtered.items,
        total: filtered.total,
        page: summaryOnly
          ? {
              ...filtered.page,
              returned: 0,
              pageStart: 0,
              pageEnd: 0
            }
          : filtered.page,
        summary: filtered.summary,
        cache: {
          query: 'computed',
          summaryOnly
        },
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
