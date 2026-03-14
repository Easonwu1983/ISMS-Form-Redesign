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
    listMap: null
  };

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
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
    const siteId = await resolveSiteId();
    const list = await resolveAuditList();
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
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
    return rows;
  }

  function matchesKeyword(entry, keyword) {
    if (!keyword) return true;
    const haystack = [
      entry.title,
      entry.eventType,
      entry.actorEmail,
      entry.targetEmail,
      entry.unitCode,
      entry.recordId,
      entry.payloadJson
    ].map((value) => cleanText(value).toLowerCase()).join('\n');
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
    return items
      .filter((entry) => {
        if (eventType && cleanText(entry.eventType) !== eventType) return false;
        if (actorEmail && cleanText(entry.actorEmail).toLowerCase() !== actorEmail) return false;
        if (targetEmail && cleanText(entry.targetEmail).toLowerCase() !== targetEmail) return false;
        if (unitCode && cleanText(entry.unitCode) !== unitCode) return false;
        if (recordId && cleanText(entry.recordId) !== recordId) return false;
        if (!matchesKeyword(entry, keyword)) return false;
        return true;
      })
      .sort((left, right) => cleanText(right.occurredAt).localeCompare(cleanText(left.occurredAt), 'zh-Hant'))
      .slice(0, limit);
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
      const items = filterEntries(rows.map((entry) => entry.item), url);
      await writeJson(res, buildJsonResponse(200, {
        ok: true,
        items,
        summary: summarizeAuditEntries(items),
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
