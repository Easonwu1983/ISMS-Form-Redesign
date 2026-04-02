(function (global) {
  'use strict';

  function clone(value) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function installUnitApi(payload) {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const UNIT_GROUPS = Array.isArray(safePayload.unitGroups) ? safePayload.unitGroups : [];
    const UNIT_CATALOG = Array.isArray(safePayload.unitCatalog) ? safePayload.unitCatalog : [];
    // Build unitStructure dynamically from catalog (parent → children mapping)
    const UNIT_STRUCTURE = (function () {
      var base = safePayload.unitStructure && typeof safePayload.unitStructure === 'object' ? safePayload.unitStructure : {};
      var built = {};
      Object.keys(base).forEach(function (k) { if (Array.isArray(base[k])) built[k] = base[k].slice(); });
      UNIT_CATALOG.forEach(function (entry) {
        if (!entry || entry.isTop || !entry.topName || !entry.childName) return;
        var parent = String(entry.topName || '').trim();
        var child = String(entry.childName || '').trim();
        if (!parent || !child) return;
        if (!built[parent]) built[parent] = [];
        if (built[parent].indexOf(child) === -1) built[parent].push(child);
      });
      return built;
    })();
    const UNIT_META_BY_VALUE = safePayload.unitMetaByValue && typeof safePayload.unitMetaByValue === 'object' ? safePayload.unitMetaByValue : {};

    global.__OFFICIAL_UNIT_DATA__ = safePayload;
    global.getUnitStructure_ = function getUnitStructure_() {
      return clone(UNIT_STRUCTURE);
    };
    global.getOfficialUnitList_ = function getOfficialUnitList_() {
      return UNIT_CATALOG.map((entry) => entry.value);
    };
    global.getOfficialUnitCatalog_ = function getOfficialUnitCatalog_() {
      return clone(UNIT_CATALOG);
    };
    global.getOfficialUnitGroups_ = function getOfficialUnitGroups_() {
      return clone(UNIT_GROUPS);
    };
    global.getOfficialUnitMeta_ = function getOfficialUnitMeta_(value) {
      const key = String(value || '').trim();
      if (!key || !Object.prototype.hasOwnProperty.call(UNIT_META_BY_VALUE, key)) return null;
      return clone(UNIT_META_BY_VALUE[key]);
    };
  }

  function installEmptyUnitApi() {
    installUnitApi({
      unitGroups: [],
      unitStructure: {},
      unitCatalog: [],
      unitMetaByValue: {}
    });
  }

  function fetchUnitPayload() {
    const version = encodeURIComponent(String(global.__APP_ASSET_VERSION__ || ''));
    const url = 'units-data.json' + (version ? ('?v=' + version) : '');
    return fetch(url, {
      cache: 'no-store'
    }).then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load units-data.json: HTTP ' + response.status);
      }
      return response.json();
    }).then((payload) => {
      installUnitApi(payload);
      return payload;
    }).catch((error) => {
      window.__ismsError(error && error.stack ? error.stack : String(error));
      installEmptyUnitApi();
      return null;
    });
  }

  global.__APP_PENDING_ASSET_PROMISE__ = fetchUnitPayload();
})(window);
