const {
  USER_ROLES,
  mapGraphFieldsToSystemUser
} = require('../azure-function/system-user-api/src/shared/contract');
const {
  mapGraphFieldsToReviewScope
} = require('../azure-function/review-scope-api/src/shared/contract');
const {
  verifySessionToken
} = require('./auth-security.cjs');

function cleanText(value) {
  return String(value || '').trim();
}

function parseUnits(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => cleanText(entry)).filter(Boolean)));
  }
  if (typeof value === 'string') {
    return Array.from(new Set(value.split(/\r?\n|,|;|\|/).map((entry) => cleanText(entry)).filter(Boolean)));
  }
  return [];
}

function cleanLower(value) {
  return cleanText(value).toLowerCase();
}

function createHttpError(message, statusCode) {
  const error = new Error(cleanText(message) || 'Forbidden');
  error.statusCode = statusCode || 403;
  return error;
}

function readHeader(req, name) {
  if (!req || !req.headers) return '';
  const value = req.headers[String(name || '').toLowerCase()];
  return Array.isArray(value) ? cleanText(value[0]) : cleanText(value);
}

function decodeHeaderUnit(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    return cleanText(decodeURIComponent(raw));
  } catch (_) {
    return raw;
  }
}

function createRequestAuthz(deps) {
  const {
    graphRequest,
    resolveSiteId
  } = deps;

  const state = {
    listMap: null
  };

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  const sessionSecret = getEnv('AUTH_SESSION_SECRET', '');
  if (!sessionSecret) {
    throw new Error('AUTH_SESSION_SECRET is required for request authorization.');
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
    if (!list) throw createHttpError(`SharePoint list not found: ${listName}`, 500);
    return list;
  }

  async function listMappedEntries(listName, mapper) {
    const siteId = await resolveSiteId();
    const list = await resolveNamedList(listName);
    const rows = [];
    let nextUrl = `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const batch = Array.isArray(body && body.value) ? body.value : [];
      rows.push(...batch.map((entry) => ({
        listItemId: cleanText(entry && entry.id),
        item: mapper(entry && entry.fields ? entry.fields : {})
      })));
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
    return rows;
  }

  async function listSystemUsers() {
    return listMappedEntries(getEnv('SYSTEM_USERS_LIST', 'SystemUsers'), mapGraphFieldsToSystemUser);
  }

  async function listReviewScopes() {
    return listMappedEntries(getEnv('REVIEW_SCOPES_LIST', 'UnitReviewScopes'), mapGraphFieldsToReviewScope);
  }

  async function getSystemUserEntryByUsername(username) {
    const target = cleanLower(username);
    if (!target) return null;
    const rows = await listSystemUsers();
    return rows.find((entry) => cleanLower(entry.item && entry.item.username) === target) || null;
  }

  async function listReviewUnitsByUsername(username) {
    const target = cleanLower(username);
    if (!target) return [];
    const rows = await listReviewScopes();
    return rows
      .filter((entry) => cleanLower(entry.item && entry.item.username) === target)
      .map((entry) => cleanText(entry.item && entry.item.unit))
      .filter(Boolean);
  }

  function resolveActiveUnit(req, user) {
    const requested = decodeHeaderUnit(readHeader(req, 'x-isms-active-unit'));
    const authorizedUnits = parseUnits(user && (user.authorizedUnits || user.scopeUnits || user.units));
    if (requested && authorizedUnits.includes(requested)) return requested;
    return cleanText(user && user.activeUnit) || authorizedUnits[0] || '';
  }

  async function requireAuthenticatedUser(req) {
    if (req && req.__ismsAuthz) return req.__ismsAuthz;
    const authorization = readHeader(req, 'authorization');
    if (!authorization || !/^Bearer\s+/i.test(authorization)) {
      throw createHttpError('Authentication required', 401);
    }
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    const sessionPayload = verifySessionToken(token, sessionSecret);
    if (!sessionPayload || !cleanText(sessionPayload.sub)) {
      throw createHttpError('Invalid session token', 401);
    }
    const userEntry = await getSystemUserEntryByUsername(sessionPayload.sub);
    if (!userEntry || !userEntry.item) {
      throw createHttpError('Session user not found', 401);
    }
    const storedSessionVersion = Number(userEntry.item.sessionVersion || 1);
    const currentSessionVersion = Number(sessionPayload.sessionVersion || 1);
    if (!Number.isFinite(storedSessionVersion) || storedSessionVersion !== currentSessionVersion) {
      throw createHttpError('Session expired', 401);
    }
    const authorizedUnits = parseUnits(userEntry.item && (userEntry.item.authorizedUnits || userEntry.item.scopeUnits || userEntry.item.units));
    const scopeUnits = parseUnits(userEntry.item && (userEntry.item.scopeUnits || userEntry.item.authorizedUnits || userEntry.item.units));
    const primaryUnit = cleanText(userEntry.item && (userEntry.item.primaryUnit || userEntry.item.unit)) || authorizedUnits[0] || '';
    const securityRoles = parseUnits(userEntry.item && userEntry.item.securityRoles);
    const user = {
      ...userEntry.item,
      primaryUnit,
      authorizedUnits,
      scopeUnits,
      securityRoles,
      units: authorizedUnits.slice(),
      activeUnit: resolveActiveUnit(req, { ...userEntry.item, authorizedUnits, scopeUnits, units: authorizedUnits, primaryUnit })
    };
    const authz = {
      token,
      sessionPayload,
      username: cleanText(user.username),
      role: cleanText(user.role),
      user,
      primaryUnit: cleanText(user.primaryUnit),
      scopeUnits: parseUnits(user.scopeUnits),
      activeUnit: cleanText(user.activeUnit),
      authorizedUnits: parseUnits(user.units),
      securityRoles: parseUnits(user.securityRoles),
      reviewUnits: cleanText(user.role) === USER_ROLES.UNIT_ADMIN ? await listReviewUnitsByUsername(user.username) : []
    };
    if (req) req.__ismsAuthz = authz;
    return authz;
  }

  function isAdmin(authz) {
    return cleanText(authz && authz.role) === USER_ROLES.ADMIN;
  }

  function isUnitAdmin(authz) {
    return cleanText(authz && authz.role) === USER_ROLES.UNIT_ADMIN;
  }

  function isViewer() {
    return false;
  }

  function matchesUsername(authz, username) {
    return cleanLower(authz && authz.username) === cleanLower(username);
  }

  function hasUnitAccess(authz, unit) {
    if (!authz) return false;
    const target = cleanText(unit);
    if (!target) return isAdmin(authz);
    if (isAdmin(authz)) return true;
    return parseUnits(authz.authorizedUnits || authz.scopeUnits || authz.user && authz.user.authorizedUnits).includes(target);
  }

  function hasReviewScope(authz, unit) {
    if (!authz) return false;
    const target = cleanText(unit);
    if (isAdmin(authz)) return true;
    if (!isUnitAdmin(authz)) return false;
    const reviewUnits = parseUnits(authz.reviewUnits);
    if (!target) return reviewUnits.length > 0;
    return reviewUnits.includes(target);
  }

  function canAccessCorrectiveAction(authz, item) {
    if (!authz || !item) return false;
    if (isAdmin(authz)) return true;
    if (hasUnitAccess(authz, item.handlerUnit)) return true;
    if (matchesUsername(authz, item.handlerUsername)) return true;
    if (matchesUsername(authz, item.proposerUsername)) return true;
    return false;
  }

  function canReviewCorrectiveAction(authz, item) {
    return hasReviewScope(authz, item && (item.handlerUnit || item.proposerUnit));
  }

  function canRespondCorrectiveAction(authz, item) {
    if (!authz || !item) return false;
    return isAdmin(authz) || matchesUsername(authz, item.handlerUsername);
  }

  function canAccessChecklist(authz, item) {
    if (!authz || !item) return false;
    if (isAdmin(authz)) return true;
    return hasUnitAccess(authz, item.unit) || matchesUsername(authz, item.fillerUsername);
  }

  function canEditChecklist(authz, item) {
    if (!authz || !item) return false;
    if (isAdmin(authz)) return true;
    return hasUnitAccess(authz, item.unit) || matchesUsername(authz, item.fillerUsername);
  }

  function canAccessTrainingForm(authz, form) {
    if (!authz || !form) return false;
    if (isAdmin(authz)) return true;
    return hasUnitAccess(authz, form.unit) || matchesUsername(authz, form.fillerUsername);
  }

  function canManageTrainingForm(authz, form) {
    if (!authz || !form) return false;
    if (isAdmin(authz)) return true;
    return matchesUsername(authz, form.fillerUsername);
  }

  function canManageTrainingRoster(authz, roster) {
    if (!authz || !roster) return false;
    if (isAdmin(authz)) return true;
    return isUnitAdmin(authz) ? hasUnitAccess(authz, roster.unit) : matchesUsername(authz, roster.createdByUsername);
  }

  function requireAdmin(authz, message) {
    if (!isAdmin(authz)) throw createHttpError(message || 'Forbidden', 403);
    return authz;
  }

  function requireSelfOrAdmin(authz, username, message) {
    if (isAdmin(authz) || matchesUsername(authz, username)) return authz;
    throw createHttpError(message || 'Forbidden', 403);
  }

  function buildActorDetails(authz) {
    return {
      actorEmail: cleanText(authz && authz.user && authz.user.email),
      actorName: cleanText(authz && authz.user && authz.user.name),
      actorUsername: cleanText(authz && authz.username),
      actorRole: cleanText(authz && authz.role),
      actorUnit: cleanText(authz && authz.primaryUnit) || cleanText(authz && authz.user && authz.user.unit),
      actorActiveUnit: cleanText(authz && authz.activeUnit)
    };
  }

  return {
    USER_ROLES,
    cleanText,
    createHttpError,
    requireAuthenticatedUser,
    requireAdmin,
    requireSelfOrAdmin,
    isAdmin,
    isUnitAdmin,
    isViewer,
    matchesUsername,
    hasUnitAccess,
    hasReviewScope,
    canAccessCorrectiveAction,
    canReviewCorrectiveAction,
    canRespondCorrectiveAction,
    canAccessChecklist,
    canEditChecklist,
    canAccessTrainingForm,
    canManageTrainingForm,
    canManageTrainingRoster,
    buildActorDetails
  };
}

module.exports = {
  createRequestAuthz
};
