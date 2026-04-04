// @ts-check
const fs = require('fs');
const path = require('path');

const CONTRACT_VERSION = '2026-03-25';
const GOVERNANCE_CACHE_TTL_MS = 30000;
const INVENTORY_CACHE_TTL_MS = 30000;
const GOVERNANCE_HISTORY_MAX = 80;
const GOVERNANCE_QUERY_CACHE_MAX = 24;
const INVENTORY_QUERY_CACHE_MAX = 24;
const GOVERNANCE_CATEGORY_ORDER = ['行政單位', '學術單位', '中心 / 研究單位'];
const GOVERNANCE_PENDING_STATUSES = new Set(['pending_review', 'returned', 'approved', 'activation_pending']);
const HIDDEN_OFFICIAL_UNIT_VALUES = new Set(['國立臺灣大學系統']);
const CENTER_OVERRIDE_UNITS = new Set([
  '學校分部總辦事處',
  '學校分部總辦事處竹北分部籌備小組',
  '學校分部總辦事處雲林分部籌備小組'
]);
// 引用共用白名單（Single Source of Truth）
const { ADMIN_UNITS, ACADEMIC_UNITS } = require('../../shared/unit-categories.js');
const ADMIN_PRIMARY_WHITELIST = new Set(ADMIN_UNITS);
const ACADEMIC_PRIMARY_WHITELIST = new Set(ACADEMIC_UNITS);

function createUnitGovernanceRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    requestAuthz,
    listUnitContactApplications,
    createAuditRow
  } = deps;

  const state = {
    officialUnits: null,
    governanceCache: null,
    governanceCacheAt: 0,
    governanceItemsCache: null,
    governanceItemsCacheAt: 0,
    governanceQueryCache: new Map(),
    inventoryCache: null,
    inventoryCacheAt: 0,
    inventoryQueryCache: new Map()
  };

  function cleanText(value) {
    return String(value || '').trim();
  }

  function cleanLowerText(value) {
    return cleanText(value).toLowerCase();
  }

  function parsePositiveInteger(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function buildTextHaystack(parts) {
    return (Array.isArray(parts) ? parts : [parts])
      .flatMap((part) => Array.isArray(part) ? part : [part])
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function buildPageMeta(url, total, defaultLimit, maxLimit) {
    const searchParams = url && url.searchParams ? url.searchParams : null;
    const safeTotal = Math.max(Number(total) || 0, 0);
    const safeDefaultLimit = Math.max(1, Number(defaultLimit) || 20);
    const safeMaxLimit = Math.max(safeDefaultLimit, Number(maxLimit) || safeDefaultLimit);
    const rawLimit = parsePositiveInteger(searchParams && searchParams.get('limit')) || safeDefaultLimit;
    const limit = Math.min(Math.max(rawLimit, 1), safeMaxLimit);
    const rawOffset = parsePositiveInteger(searchParams && searchParams.get('offset')) || 0;
    const maxOffset = safeTotal > 0 ? Math.max(0, Math.floor((safeTotal - 1) / limit) * limit) : 0;
    const offset = Math.min(Math.max(rawOffset, 0), maxOffset);
    const returned = limit > 0 ? Math.max(Math.min(limit, safeTotal - offset), 0) : 0;
    const pageCount = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / limit)) : 0;
    const currentPage = safeTotal > 0 ? Math.floor(offset / limit) + 1 : 0;
    return {
      offset,
      limit,
      total: safeTotal,
      returned,
      pageCount,
      currentPage,
      hasPrev: offset > 0,
      hasNext: safeTotal > 0 && (offset + limit) < safeTotal,
      prevOffset: Math.max(offset - limit, 0),
      nextOffset: safeTotal > 0 && (offset + limit) < safeTotal ? offset + limit : offset,
      pageStart: returned > 0 ? offset + 1 : 0,
      pageEnd: returned > 0 ? offset + returned : 0,
      paged: true
    };
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
    if (!(cache instanceof Map) || !cacheKey || !cache.has(cacheKey)) return null;
    const cached = cache.get(cacheKey);
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cloneJson(cached);
  }

  function writeQueryCache(cache, cacheKey, value, maxEntries) {
    if (!(cache instanceof Map) || !cacheKey) return cloneJson(value);
    cache.set(cacheKey, cloneJson(value));
    trimQueryCache(cache, maxEntries);
    return cloneJson(value);
  }

  function buildQueryCacheKey(parts) {
    return (Array.isArray(parts) ? parts : [parts])
      .map((part) => cleanText(part))
      .join('::');
  }

  function summarizeGovernanceItems(items) {
    return (Array.isArray(items) ? items : []).reduce((result, item) => {
      result.total += 1;
      if (cleanText(item && item.mode).toLowerCase() === 'consolidated') result.consolidated += 1;
      else result.independent += 1;
      result.children += Array.isArray(item && item.children) ? item.children.length : 0;
      return result;
    }, { total: 0, consolidated: 0, independent: 0, children: 0 });
  }

  function summarizeGovernanceCategory(items, fallbackCategory) {
    const summary = summarizeGovernanceItems(items);
    return {
      category: cleanText(fallbackCategory),
      unitCount: Number(summary.total || 0),
      consolidatedCount: Number(summary.consolidated || 0),
      independentCount: Number(summary.independent || 0),
      childCount: Number(summary.children || 0)
    };
  }

  function getGovernanceBucketKey(mode, category) {
    return buildQueryCacheKey([mode || 'all', category || 'all']);
  }

  function buildGovernanceQueryBuckets(items) {
    const source = Array.isArray(items) ? items : [];
    const categories = ['all'].concat(GOVERNANCE_CATEGORY_ORDER);
    const modes = ['all', 'independent', 'consolidated'];
    const buckets = {};
    modes.forEach((mode) => {
      categories.forEach((category) => {
        const filteredItems = source.filter((item) => {
          const itemMode = cleanText(item && item.mode).toLowerCase() || 'independent';
          const itemCategory = cleanText(item && item.category) || '';
          if (mode !== 'all' && itemMode !== mode) return false;
          if (category !== 'all' && itemCategory !== category) return false;
          return true;
        });
        buckets[getGovernanceBucketKey(mode, category)] = {
          items: filteredItems,
          summary: summarizeGovernanceItems(filteredItems)
        };
      });
    });
    return buckets;
  }

  function summarizeSecurityWindowInventory(units, people) {
    const safeUnits = Array.isArray(units) ? units : [];
    const safePeople = Array.isArray(people) ? people : [];
    return {
      totalUnits: safeUnits.length,
      unitsWithWindows: safeUnits.filter((unit) => unit && unit.hasWindow).length,
      unitsWithoutWindows: safeUnits.filter((unit) => !(unit && unit.hasWindow)).length,
      peopleWithWindows: safePeople.filter((person) => person && person.hasWindow).length,
      peopleWithoutWindow: safePeople.filter((person) => !(person && person.hasWindow)).length,
      pendingApplications: safeUnits.reduce((count, unit) => count + (Array.isArray(unit && unit.pending) ? unit.pending.length : 0), 0),
      exemptedUnits: safeUnits.reduce((count, unit) => count + (Number(unit && unit.exemptedRows) || 0), 0)
    };
  }

  function summarizeSecurityWindowCategory(units, fallbackCategory) {
    const safeUnits = Array.isArray(units) ? units : [];
    return {
      category: cleanText(fallbackCategory),
      unitCount: safeUnits.length,
      assignedCount: safeUnits.filter((unit) => unit && unit.hasWindow).length,
      pendingCount: safeUnits.reduce((sum, unit) => sum + (Array.isArray(unit && unit.pending) ? unit.pending.length : 0), 0),
      missingCount: safeUnits.filter((unit) => unit && !unit.hasWindow && !(Array.isArray(unit.pending) && unit.pending.length)).length,
      childCount: safeUnits.reduce((sum, unit) => sum + (Array.isArray(unit && unit.children) ? unit.children.length : 0), 0)
    };
  }

  function getSecurityWindowBucketKey(status, category) {
    return buildQueryCacheKey([status || 'all', category || 'all']);
  }

  function buildSecurityWindowQueryBuckets(units, people) {
    const safeUnits = Array.isArray(units) ? units : [];
    const safePeople = Array.isArray(people) ? people : [];
    const categories = ['all'].concat(GOVERNANCE_CATEGORY_ORDER);
    const statuses = ['all', 'assigned', 'missing', 'pending', 'exempted'];
    const unitBuckets = {};
    const summaryBuckets = {};
    statuses.forEach((status) => {
      categories.forEach((category) => {
        const filteredUnits = safeUnits.filter((unit) => {
          const unitStatus = cleanText(unit && unit.status) || 'missing';
          const unitMode = cleanText(unit && unit.mode) || 'independent';
          const unitCategory = cleanText(unit && unit.category) || '';
          if (status !== 'all') {
            if (status === 'assigned' && unitStatus !== 'assigned') return false;
            if (status === 'missing' && unitStatus !== 'missing') return false;
            if (status === 'pending' && unitStatus !== 'pending') return false;
            if (status === 'exempted' && unitMode !== 'consolidated') return false;
          }
          if (category !== 'all' && unitCategory !== category) return false;
          return true;
        });
        const peopleStatus = status === 'pending' || status === 'exempted' ? 'all' : status;
        const filteredPeople = safePeople.filter((person) => {
          if (peopleStatus !== 'all') {
            if (peopleStatus === 'assigned' && !person.hasWindow) return false;
            if (peopleStatus === 'missing' && person.hasWindow) return false;
          }
          return true;
        });
        const bucketKey = getSecurityWindowBucketKey(status, category);
        unitBuckets[bucketKey] = filteredUnits;
        summaryBuckets[bucketKey] = summarizeSecurityWindowInventory(filteredUnits, filteredPeople);
      });
    });
    const peopleBuckets = {
      all: safePeople,
      assigned: safePeople.filter((person) => person && person.hasWindow),
      missing: safePeople.filter((person) => !(person && person.hasWindow))
    };
    return { unitBuckets, peopleBuckets, summaryBuckets };
  }

  function buildGovernanceCategorySummariesFromBuckets(snapshot, mode, categoryFilter) {
    const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const buckets = safeSnapshot.buckets && typeof safeSnapshot.buckets === 'object' ? safeSnapshot.buckets : {};
    const categories = categoryFilter && categoryFilter !== 'all'
      ? [categoryFilter]
      : GOVERNANCE_CATEGORY_ORDER.slice();
    return categories.reduce((result, category) => {
      const bucket = buckets[getGovernanceBucketKey(mode || 'all', category)] || null;
      const items = Array.isArray(bucket && bucket.items) ? bucket.items : [];
      result[category] = summarizeGovernanceCategory(items, category);
      return result;
    }, {});
  }

  function buildGovernanceCategorySummariesFromItems(items, categoryFilter) {
    const source = Array.isArray(items) ? items : [];
    const categories = categoryFilter && categoryFilter !== 'all'
      ? [categoryFilter]
      : Array.from(new Set(source.map((item) => cleanText(item && item.category)).filter(Boolean)));
    return categories.reduce((result, category) => {
      const categoryItems = source.filter((item) => cleanText(item && item.category) === category);
      result[category] = summarizeGovernanceCategory(categoryItems, category);
      return result;
    }, {});
  }

  function buildSecurityWindowCategorySummariesFromInventory(inventory, status, categoryFilter) {
    const source = inventory && typeof inventory === 'object' ? inventory : {};
    const buckets = source.buckets && typeof source.buckets === 'object' ? source.buckets : {};
    const unitBuckets = buckets.unitBuckets && typeof buckets.unitBuckets === 'object' ? buckets.unitBuckets : {};
    const categories = categoryFilter && categoryFilter !== 'all'
      ? [categoryFilter]
      : GOVERNANCE_CATEGORY_ORDER.slice();
    return categories.reduce((result, category) => {
      const units = Array.isArray(unitBuckets[getSecurityWindowBucketKey(status || 'all', category)])
        ? unitBuckets[getSecurityWindowBucketKey(status || 'all', category)]
        : [];
      result[category] = summarizeSecurityWindowCategory(units, category);
      return result;
    }, {});
  }

  function buildSecurityWindowCategorySummariesFromUnits(units, categoryFilter) {
    const source = Array.isArray(units) ? units : [];
    const categories = categoryFilter && categoryFilter !== 'all'
      ? [categoryFilter]
      : Array.from(new Set(source.map((unit) => cleanText(unit && unit.category)).filter(Boolean)));
    return categories.reduce((result, category) => {
      const categoryUnits = source.filter((unit) => cleanText(unit && unit.category) === category);
      result[category] = summarizeSecurityWindowCategory(categoryUnits, category);
      return result;
    }, {});
  }

  function createError(message, statusCode) {
    const error = new Error(cleanText(message) || 'Request failed');
    error.statusCode = statusCode || 400;
    return error;
  }

  function splitUnitValue(unitValue) {
    const raw = cleanText(unitValue);
    if (!raw) return { parent: '', child: '' };
    const separator = raw.includes('／') ? '／' : (raw.includes('/') ? '/' : '');
    if (!separator) return { parent: raw, child: '' };
    const parts = raw.split(separator);
    const parent = cleanText(parts.shift());
    const child = cleanText(parts.join(separator));
    return { parent, child };
  }

  function composeUnitValue(parent, child) {
    const cleanParent = cleanText(parent);
    const cleanChild = cleanText(child);
    if (!cleanParent) return '';
    return cleanChild ? `${cleanParent}／${cleanChild}` : cleanParent;
  }

  function getLogsDir() {
    const explicit = cleanText(process.env.BACKEND_LOG_DIR);
    if (explicit) return explicit;
    return path.join(process.cwd(), 'logs', 'campus-backend');
  }

  function getGovernanceStorePath() {
    const explicit = cleanText(process.env.UNIT_GOVERNANCE_STORE_PATH);
    if (explicit) return explicit;
    return path.join(getLogsDir(), 'unit-governance-store.json');
  }

  function ensureParentDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  function normalizeGovernanceModeEntry(unit, entry) {
    const source = entry && typeof entry === 'object' ? entry : {};
    const cleanUnit = cleanText(unit || source.unit);
    return {
      unit: cleanUnit,
      mode: cleanText(source.mode).toLowerCase() === 'consolidated' ? 'consolidated' : 'independent',
      note: cleanText(source.note),
      updatedAt: cleanText(source.updatedAt),
      updatedBy: cleanText(source.updatedBy)
    };
  }

  function emptyGovernanceStore() {
    return {
      version: 1,
      governance: { unitModes: {} },
      history: []
    };
  }

  function normalizeGovernanceStore(raw) {
    const fallback = emptyGovernanceStore();
    const source = raw && typeof raw === 'object' ? raw : fallback;
    const unitModes = source.governance && typeof source.governance === 'object' && source.governance.unitModes && typeof source.governance.unitModes === 'object'
      ? source.governance.unitModes
      : {};
    const normalizedModes = {};
    Object.keys(unitModes).forEach((key) => {
      const entry = normalizeGovernanceModeEntry(key, unitModes[key]);
      if (!entry.unit) return;
      normalizedModes[entry.unit] = entry;
    });
    const history = Array.isArray(source.history) ? source.history : [];
    return {
      version: 1,
      governance: { unitModes: normalizedModes },
      history: history
        .map((entry) => ({
          type: cleanText(entry && entry.type) || 'governance',
          unit: cleanText(entry && entry.unit),
          mode: cleanText(entry && entry.mode).toLowerCase() === 'consolidated' ? 'consolidated' : 'independent',
          note: cleanText(entry && entry.note),
          actor: cleanText(entry && entry.actor),
          time: cleanText(entry && entry.time)
        }))
        .filter((entry) => entry.unit)
        .slice(0, GOVERNANCE_HISTORY_MAX)
    };
  }

  function loadGovernanceStore() {
    if (state.governanceCache && (Date.now() - state.governanceCacheAt) < GOVERNANCE_CACHE_TTL_MS) {
      return cloneJson(state.governanceCache);
    }
    const filePath = getGovernanceStorePath();
    let parsed = emptyGovernanceStore();
    if (fs.existsSync(filePath)) {
      try {
        parsed = normalizeGovernanceStore(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      } catch (error) {
        console.warn('[unit-governance] failed to read store, using empty store', error);
        parsed = emptyGovernanceStore();
      }
    }
    state.governanceCache = parsed;
    state.governanceCacheAt = Date.now();
    return cloneJson(parsed);
  }

  function saveGovernanceStore(store) {
    const normalized = normalizeGovernanceStore(store);
    const filePath = getGovernanceStorePath();
    const tempPath = `${filePath}.tmp`;
    ensureParentDir(filePath);
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
    state.governanceCache = normalized;
    state.governanceCacheAt = Date.now();
    state.governanceItemsCache = null;
    state.governanceItemsCacheAt = 0;
    state.governanceQueryCache.clear();
    state.inventoryCache = null;
    state.inventoryCacheAt = 0;
    state.inventoryQueryCache.clear();
    return cloneJson(normalized);
  }

  function getTopLevelUnitMeta(metaByValue, unitValue) {
    const parsed = splitUnitValue(unitValue);
    const parent = cleanText(parsed.parent || unitValue);
    return metaByValue.get(parent) || metaByValue.get(unitValue) || {};
  }

  function categorizeTopLevelUnit(unitValue) {
    // 使用 shared/unit-categories.js 的統一分類（Single Source of Truth）
    const { categorizeUnit } = require('../../shared/unit-categories.js');
    return categorizeUnit(unitValue);
  }

  function loadOfficialUnits() {
    if (Array.isArray(state.officialUnits)) return state.officialUnits;
    const unitData = require('../../units-data.json');
    const catalog = Array.isArray(unitData && unitData.unitCatalog) ? unitData.unitCatalog : [];
    const rawMeta = unitData && unitData.unitMetaByValue && typeof unitData.unitMetaByValue === 'object'
      ? unitData.unitMetaByValue
      : {};
    const metaByValue = new Map(Object.entries(rawMeta).map(([key, value]) => [cleanText(key), value || {}]));
    const groups = new Map();
    catalog.forEach((entry) => {
      const source = entry && typeof entry === 'object' ? entry : { value: entry };
      const value = cleanText(source.value);
      if (!value || HIDDEN_OFFICIAL_UNIT_VALUES.has(value)) return;
      const parsed = splitUnitValue(value);
      const parent = cleanText(source.topName || parsed.parent || value);
      const child = cleanText(source.childName || parsed.child);
      if (!parent || HIDDEN_OFFICIAL_UNIT_VALUES.has(parent)) return;
      if (!groups.has(parent)) {
        groups.set(parent, {
          unit: parent,
          category: categorizeTopLevelUnit(parent, metaByValue, source),
          children: new Set()
        });
      }
      if (child) groups.get(parent).children.add(child);
    });
    state.officialUnits = Array.from(groups.values())
      .map((entry) => ({
        unit: entry.unit,
        category: entry.category,
        children: Array.from(entry.children).sort((left, right) => left.localeCompare(right, 'zh-Hant'))
      }))
      .sort((left, right) => left.unit.localeCompare(right.unit, 'zh-Hant'));
    return state.officialUnits;
  }

  function getGovernanceItemsSnapshot() {
    const cached = state.governanceItemsCache && (Date.now() - state.governanceItemsCacheAt) < GOVERNANCE_CACHE_TTL_MS
      ? state.governanceItemsCache
      : null;
    if (cached) return cached;
    const officialUnits = loadOfficialUnits();
    const store = loadGovernanceStore();
    const modeMap = new Map(Object.values(store.governance.unitModes || {}).map((entry) => [cleanText(entry.unit), entry]));
    const items = officialUnits.map((entry) => {
      const modeEntry = modeMap.get(entry.unit) || null;
      return {
        unit: entry.unit,
        category: entry.category,
        children: Array.isArray(entry.children) ? entry.children.slice() : [],
        mode: modeEntry && modeEntry.mode === 'consolidated' ? 'consolidated' : 'independent',
        note: cleanText(modeEntry && modeEntry.note),
        updatedAt: cleanText(modeEntry && modeEntry.updatedAt),
        updatedBy: cleanText(modeEntry && modeEntry.updatedBy)
      };
    });
    const snapshot = {
      items,
      summary: summarizeGovernanceItems(items),
      buckets: buildGovernanceQueryBuckets(items),
      generatedAt: new Date().toISOString(),
      signature: buildQueryCacheKey([
        state.governanceCacheAt,
        officialUnits.length,
        Object.keys(store.governance.unitModes || {}).length
      ])
    };
    state.governanceItemsCache = snapshot;
    state.governanceItemsCacheAt = Date.now();
    state.governanceQueryCache.clear();
    return snapshot;
  }

  function queryGovernanceItems(snapshot, url) {
    const sourceSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : { items: [], generatedAt: '', signature: '' };
    const source = Array.isArray(sourceSnapshot.items) ? sourceSnapshot.items : [];
    const keyword = cleanLowerText(url && url.searchParams && url.searchParams.get('keyword'));
    const mode = cleanText(url && url.searchParams && url.searchParams.get('mode')).toLowerCase() || 'all';
    const category = cleanText(url && url.searchParams && url.searchParams.get('category')) || 'all';
    const cacheKey = buildQueryCacheKey([
      sourceSnapshot.signature || sourceSnapshot.generatedAt,
      keyword,
      mode,
      category,
      url && url.searchParams && url.searchParams.get('limit'),
      url && url.searchParams && url.searchParams.get('offset')
    ]);
    const cached = readQueryCache(state.governanceQueryCache, cacheKey);
    if (cached) return cached;
    let filteredItems = [];
    let summary = null;
    if (!keyword && sourceSnapshot.buckets && typeof sourceSnapshot.buckets === 'object') {
      const bucket = sourceSnapshot.buckets[getGovernanceBucketKey(mode, category)] || null;
      filteredItems = Array.isArray(bucket && bucket.items) ? bucket.items : source;
      summary = bucket && bucket.summary ? bucket.summary : sourceSnapshot.summary;
    } else {
      filteredItems = source.filter((item) => {
        const itemMode = cleanText(item && item.mode).toLowerCase() || 'independent';
        const itemCategory = cleanText(item && item.category) || '';
        if (mode !== 'all' && itemMode !== mode) return false;
        if (category !== 'all' && itemCategory !== category) return false;
        if (!keyword) return true;
        const haystack = buildTextHaystack([
          item && item.unit,
          itemCategory,
          itemMode,
          item && item.note,
          item && item.children
        ]);
        return haystack.includes(keyword);
      });
      summary = summarizeGovernanceItems(filteredItems);
    }
    const categorySummaries = !keyword && sourceSnapshot.buckets && typeof sourceSnapshot.buckets === 'object'
      ? buildGovernanceCategorySummariesFromBuckets(sourceSnapshot, mode, category)
      : buildGovernanceCategorySummariesFromItems(filteredItems, category);
    const page = buildPageMeta(url, filteredItems.length, 12, 60);
    const visibleItems = filteredItems.slice(page.offset, page.offset + page.limit);
    return writeQueryCache(state.governanceQueryCache, cacheKey, {
      items: visibleItems,
      summary: summary || summarizeGovernanceItems(filteredItems),
      categorySummaries,
      page,
      filters: {
        keyword: cleanText(keyword),
        mode,
        category
      },
      generatedAt: cleanText(sourceSnapshot.generatedAt) || new Date().toISOString()
    }, GOVERNANCE_QUERY_CACHE_MAX);
  }

  function normalizeSecurityRoles(value) {
    return parseUnits(value);
  }

  function normalizeSecurityWindowPerson(source) {
    const item = source && typeof source === 'object' ? source : {};
    const primaryUnit = cleanText(item.primaryUnit || item.unit);
    const units = Array.from(new Set([primaryUnit].concat(parseUnits(item.authorizedUnits || item.scopeUnits || item.units)).filter(Boolean)));
    const securityRoles = normalizeSecurityRoles(item.securityRoles);
    return {
      username: cleanText(item.username),
      name: cleanText(item.name),
      email: cleanText(item.email),
      activeUnit: cleanText(item.activeUnit || primaryUnit || units[0]),
      primaryUnit,
      units,
      securityRoles,
      hasWindow: securityRoles.length > 0
    };
  }

  function resolveSecurityWindowApplicationUnit(application) {
    const direct = cleanText(application && application.unitValue);
    if (direct) return direct;
    const primary = cleanText(application && application.primaryUnit);
    const secondary = cleanText(application && application.secondaryUnit);
    if (!primary) return '';
    return secondary ? composeUnitValue(primary, secondary) : primary;
  }

  function buildEmptyInventory() {
    return {
      generatedAt: new Date().toISOString(),
      units: [],
      people: [],
      summary: {
        totalUnits: 0,
        unitsWithWindows: 0,
        unitsWithoutWindows: 0,
        peopleWithWindows: 0,
        peopleWithoutWindow: 0,
        pendingApplications: 0,
        exemptedUnits: 0
      },
      categorySummaries: {}
    };
  }

  async function buildSecurityWindowInventory() {
    const cached = state.inventoryCache && (Date.now() - state.inventoryCacheAt) < INVENTORY_CACHE_TTL_MS
      ? state.inventoryCache
      : null;
    if (cached) return cached;

    const [userRows, applications] = await Promise.all([
      requestAuthz.listSystemUsers(),
      Promise.resolve(listUnitContactApplications())
    ]);
    const people = (Array.isArray(userRows) ? userRows : [])
      .map((entry) => entry && entry.item ? entry.item : null)
      .filter((item) => cleanText(item && item.role) === requestAuthz.USER_ROLES.UNIT_ADMIN)
      .map(normalizeSecurityWindowPerson);

    const holderMap = new Map();
    people.forEach((person) => {
      if (!person.hasWindow) return;
      person.units.forEach((unit) => {
        const key = cleanText(unit);
        if (!key) return;
        if (!holderMap.has(key)) holderMap.set(key, []);
        holderMap.get(key).push(person);
      });
    });

    const pendingMap = new Map();
    (Array.isArray(applications) ? applications : []).forEach((application) => {
      const status = cleanText(application && application.status);
      if (!GOVERNANCE_PENDING_STATUSES.has(status)) return;
      const unit = resolveSecurityWindowApplicationUnit(application);
      if (!unit) return;
      if (!pendingMap.has(unit)) pendingMap.set(unit, []);
      pendingMap.get(unit).push({
        id: cleanText(application && application.id),
        applicantName: cleanText(application && application.applicantName),
        applicantEmail: cleanText(application && application.applicantEmail),
        status,
        securityRoles: normalizeSecurityRoles(application && application.securityRoles)
      });
    });

    const governanceItems = getGovernanceItemsSnapshot().items;
    const uniquePeople = Array.from(new Map(people.map((person) => [person.username, person])).values())
      .sort((left, right) => cleanText(left.name || left.username).localeCompare(cleanText(right.name || right.username), 'zh-Hant'));

    const units = governanceItems.map((entry) => {
      const scopeRows = [];
      const pushScopeRow = (unitValue, label, exempted) => {
        const holders = Array.from(new Map((holderMap.get(unitValue) || []).map((person) => [person.username, person])).values())
          .sort((left, right) => cleanText(left.name || left.username).localeCompare(cleanText(right.name || right.username), 'zh-Hant'));
        const pending = Array.from(new Map((pendingMap.get(unitValue) || []).map((item) => [item.id || `${item.applicantEmail}:${item.status}`, item])).values())
          .sort((left, right) => cleanText(right.id).localeCompare(cleanText(left.id)));
        const hasWindow = holders.length > 0;
        const status = exempted ? 'exempted' : (hasWindow ? 'assigned' : (pending.length ? 'pending' : 'missing'));
        scopeRows.push({
          unit: unitValue,
          label,
          status,
          exempted: !!exempted,
          holders,
          pending,
          hasWindow,
          isTop: unitValue === entry.unit
        });
      };

      pushScopeRow(entry.unit, entry.unit, false);
      (Array.isArray(entry.children) ? entry.children : []).forEach((child) => {
        pushScopeRow(composeUnitValue(entry.unit, child), child, entry.mode === 'consolidated');
      });

      const holders = Array.from(new Map(scopeRows.flatMap((row) => row.holders || []).map((person) => [person.username, person])).values())
        .sort((left, right) => cleanText(left.name || left.username).localeCompare(cleanText(right.name || right.username), 'zh-Hant'));
      const pending = Array.from(new Map(scopeRows.flatMap((row) => row.pending || []).map((item) => [item.id || `${item.applicantEmail}:${item.status}`, item])).values())
        .sort((left, right) => cleanText(right.id).localeCompare(cleanText(left.id)));
      return {
        unit: entry.unit,
        category: entry.category,
        mode: entry.mode,
        note: cleanText(entry.note),
        updatedAt: cleanText(entry.updatedAt),
        updatedBy: cleanText(entry.updatedBy),
        children: Array.isArray(entry.children) ? entry.children.slice() : [],
        scopeRows,
        holders,
        pending,
        hasWindow: holders.length > 0,
        status: holders.length > 0 ? 'assigned' : (pending.length ? 'pending' : 'missing'),
        assignedRows: scopeRows.filter((row) => row.status === 'assigned').length,
        missingRows: scopeRows.filter((row) => row.status === 'missing').length,
        exemptedRows: scopeRows.filter((row) => row.status === 'exempted').length,
        pendingRows: scopeRows.filter((row) => row.status === 'pending').length
      };
    });

    const inventory = {
      units,
      people: uniquePeople,
      summary: summarizeSecurityWindowInventory(units, uniquePeople),
      buckets: buildSecurityWindowQueryBuckets(units, uniquePeople),
      generatedAt: new Date().toISOString()
    };
    state.inventoryCache = inventory;
    state.inventoryCacheAt = Date.now();
    state.inventoryQueryCache.clear();
    return inventory;
  }

  function querySecurityWindowInventory(inventory, url) {
    const source = inventory && typeof inventory === 'object' ? inventory : buildEmptyInventory();
    const keyword = cleanLowerText(url && url.searchParams && url.searchParams.get('keyword'));
    const status = cleanText(url && url.searchParams && url.searchParams.get('status')) || 'all';
    const category = cleanText(url && url.searchParams && url.searchParams.get('category')) || 'all';
    const cacheKey = buildQueryCacheKey([
      cleanText(source.generatedAt),
      keyword,
      status,
      category,
      url && url.searchParams && url.searchParams.get('limit'),
      url && url.searchParams && url.searchParams.get('offset')
    ]);
    const cached = readQueryCache(state.inventoryQueryCache, cacheKey);
    if (cached) return cached;
    const matchesKeyword = (parts) => {
      if (!keyword) return true;
      return buildTextHaystack(parts).includes(keyword);
    };
    let filteredUnits = [];
    let filteredPeople = [];
    let summary = null;
    if (!keyword && source.buckets && typeof source.buckets === 'object') {
      const bucketKey = getSecurityWindowBucketKey(status, category);
      filteredUnits = Array.isArray(source.buckets.unitBuckets && source.buckets.unitBuckets[bucketKey])
        ? source.buckets.unitBuckets[bucketKey]
        : (Array.isArray(source.units) ? source.units : []);
      const peopleStatus = status === 'pending' || status === 'exempted' ? 'all' : status;
      filteredPeople = Array.isArray(source.buckets.peopleBuckets && source.buckets.peopleBuckets[peopleStatus])
        ? source.buckets.peopleBuckets[peopleStatus]
        : (Array.isArray(source.people) ? source.people : []);
      summary = source.buckets.summaryBuckets && source.buckets.summaryBuckets[bucketKey]
        ? source.buckets.summaryBuckets[bucketKey]
        : source.summary;
    } else {
      filteredUnits = (Array.isArray(source.units) ? source.units : []).filter((unit) => {
        const unitStatus = cleanText(unit && unit.status) || 'missing';
        const unitMode = cleanText(unit && unit.mode) || 'independent';
        const unitCategory = cleanText(unit && unit.category) || '';
        if (status !== 'all') {
          if (status === 'assigned' && unitStatus !== 'assigned') return false;
          if (status === 'missing' && unitStatus !== 'missing') return false;
          if (status === 'pending' && unitStatus !== 'pending') return false;
          if (status === 'exempted' && unitMode !== 'consolidated') return false;
        }
        if (category !== 'all' && unitCategory !== category) return false;
        return matchesKeyword([
          unit && unit.unit,
          unitCategory,
          unitMode,
          unit && unit.note,
          unit && unit.children,
          (unit && unit.holders || []).map((person) => [person.name, person.username, person.email].filter(Boolean).join(' ')),
          (unit && unit.pending || []).map((item) => [item.applicantName, item.applicantEmail, item.status].filter(Boolean).join(' '))
        ]);
      });
      filteredPeople = (Array.isArray(source.people) ? source.people : []).filter((person) => {
        if (status !== 'all') {
          if (status === 'assigned' && !person.hasWindow) return false;
          if (status === 'missing' && person.hasWindow) return false;
        }
        return matchesKeyword([
          person && person.name,
          person && person.username,
          person && person.email,
          person && person.activeUnit,
          person && person.units,
          person && person.securityRoles
        ]);
      });
      summary = summarizeSecurityWindowInventory(filteredUnits, filteredPeople);
    }
    const categorySummaries = !keyword && source.buckets && typeof source.buckets === 'object'
      ? buildSecurityWindowCategorySummariesFromInventory(source, status, category)
      : buildSecurityWindowCategorySummariesFromUnits(filteredUnits, category);
    const page = buildPageMeta(url, filteredUnits.length, 12, 60);
    const visibleUnits = filteredUnits.slice(page.offset, page.offset + page.limit);
    return writeQueryCache(state.inventoryQueryCache, cacheKey, {
      inventory: {
        generatedAt: cleanText(source.generatedAt) || new Date().toISOString(),
        units: visibleUnits,
        people: filteredPeople,
        summary: summary || summarizeSecurityWindowInventory(filteredUnits, filteredPeople),
        categorySummaries
      },
      categorySummaries,
      page,
      filters: {
        keyword: cleanText(keyword),
        status,
        category
      }
    }, INVENTORY_QUERY_CACHE_MAX);
  }

  async function handleHealth(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, '僅最高管理者可檢視單位治理健康狀態');
      await writeJson(res, {
        status: 200,
        jsonBody: {
          ok: true,
          ready: true,
          contractVersion: CONTRACT_VERSION,
          storePath: getGovernanceStorePath(),
          generatedAt: new Date().toISOString()
        }
      }, origin);
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: {
          ok: false,
          message: cleanText(error && error.message) || 'Failed to read unit governance health.',
          contractVersion: CONTRACT_VERSION
        }
      }, origin);
    }
  }

  async function handleList(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, '僅最高管理者可管理單位治理');
      const result = queryGovernanceItems(getGovernanceItemsSnapshot(), new URL(req.url, 'http://localhost'));
      await writeJson(res, {
        status: 200,
        jsonBody: {
          ok: true,
            items: result.items,
            summary: result.summary,
            categorySummaries: result.categorySummaries,
            page: result.page,
            filters: result.filters,
            total: result.page.total,
            contractVersion: CONTRACT_VERSION,
            generatedAt: result.generatedAt
        }
      }, origin);
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: {
          ok: false,
          message: cleanText(error && error.message) || 'Failed to list unit governance entries.',
          contractVersion: CONTRACT_VERSION
        }
      }, origin);
    }
  }

  async function handleUpsert(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, '僅最高管理者可變更單位治理設定');
      const body = await parseJsonBody(req);
      const payload = body && typeof body === 'object' && body.payload && typeof body.payload === 'object'
        ? body.payload
        : body;
      const unit = cleanText(payload && payload.unit);
      const officialUnits = new Set(loadOfficialUnits().map((entry) => entry.unit));
      if (!unit || !officialUnits.has(unit)) {
        throw createError('單位治理只接受正式一級單位', 400);
      }
      const mode = cleanText(payload && payload.mode).toLowerCase() === 'consolidated' ? 'consolidated' : 'independent';
      const note = cleanText(payload && payload.note);
      const actor = cleanText(payload && (payload.actorName || payload.actorUsername)) || cleanText(authz && authz.username) || 'system';
      const store = loadGovernanceStore();
      const nextEntry = normalizeGovernanceModeEntry(unit, {
        unit,
        mode,
        note,
        updatedAt: new Date().toISOString(),
        updatedBy: actor
      });
      store.governance.unitModes[unit] = nextEntry;
      store.history.unshift({
        type: 'governance',
        unit,
        mode: nextEntry.mode,
        note: nextEntry.note,
        actor,
        time: nextEntry.updatedAt
      });
      store.history = store.history.slice(0, GOVERNANCE_HISTORY_MAX);
      saveGovernanceStore(store);
      if (typeof createAuditRow === 'function') {
        await createAuditRow({
          eventType: 'unit_governance.mode_saved',
          actorEmail: cleanText(authz && authz.user && authz.user.email),
          targetEmail: '',
          unitCode: unit,
          recordId: unit,
          occurredAt: nextEntry.updatedAt,
          payloadJson: JSON.stringify({
            mode: nextEntry.mode,
            note: nextEntry.note,
            actor,
            updatedBy: nextEntry.updatedBy
          })
        });
      }
      await writeJson(res, {
        status: 200,
        jsonBody: {
          ok: true,
          item: nextEntry,
          contractVersion: CONTRACT_VERSION
        }
      }, origin);
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: {
          ok: false,
          message: cleanText(error && error.message) || 'Failed to save unit governance entry.',
          contractVersion: CONTRACT_VERSION
        }
      }, origin);
    }
  }

  async function handleInventory(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      requestAuthz.requireAdmin(authz, '僅最高管理者可檢視資安窗口');
      const result = querySecurityWindowInventory(await buildSecurityWindowInventory(), new URL(req.url, 'http://localhost'));
      await writeJson(res, {
        status: 200,
        jsonBody: {
            ok: true,
            inventory: result.inventory,
            categorySummaries: result.categorySummaries,
            page: result.page,
            filters: result.filters,
            total: result.page.total,
            contractVersion: CONTRACT_VERSION
        }
      }, origin);
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: {
          ok: false,
          message: cleanText(error && error.message) || 'Failed to read security window inventory.',
          contractVersion: CONTRACT_VERSION
        }
      }, origin);
    }
  }

  function tryHandle(req, res, origin, url) {
    const pathname = cleanText(url && url.pathname);
    if (!pathname) return Promise.resolve(false);
    if (pathname === '/api/unit-governance/health' && req.method === 'GET') {
      return handleHealth(req, res, origin).then(() => true);
    }
    if (pathname === '/api/unit-governance' && req.method === 'GET') {
      return handleList(req, res, origin).then(() => true);
    }
    if (pathname === '/api/unit-governance/upsert' && req.method === 'POST') {
      return handleUpsert(req, res, origin).then(() => true);
    }
    if (pathname === '/api/security-window/inventory' && req.method === 'GET') {
      return handleInventory(req, res, origin).then(() => true);
    }
    return Promise.resolve(false);
  }

  return {
    tryHandle
  };
}

module.exports = {
  createUnitGovernanceRouter
};
