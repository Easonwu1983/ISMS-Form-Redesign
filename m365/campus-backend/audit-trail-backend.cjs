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
    entriesPromise: null
  };
  const AUDIT_TRAIL_CACHE_MS = 30000;
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

  function logAuditTrail(message, details) {
    const suffix = details && typeof details === 'object'
      ? Object.entries(details)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
      : '';
    console.log(`[audit-trail] ${message}${suffix ? ` ${suffix}` : ''}`);
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
    const now = Date.now();
    const cached = state.entriesCache;
    if (cached && Array.isArray(cached.rows) && Number.isFinite(cached.loadedAt) && (now - cached.loadedAt) < AUDIT_TRAIL_CACHE_MS) {
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
      await writeJson(res, buildJsonResponse(200, await buildHealth()), origin);
    } catch (error) {
      await writeJson(res, buildErrorResponse(error, 'Failed to read audit trail backend health.', 500), origin);
    }
  }

  async function handleList(req, res, origin, url) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, 'Only admin can view audit trail');
      const rows = await listAllEntries();
      const filtered = filterEntries(rows.map((entry) => entry.item), url);
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

  return {
    tryHandle
  };
}

module.exports = {
  createAuditTrailRouter
};
