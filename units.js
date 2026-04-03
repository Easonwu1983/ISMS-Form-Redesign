// @ts-check
(function (global) {
  'use strict';

  function clone(value) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function installUnitApi(payload) {
    var safePayload = payload && typeof payload === 'object' ? payload : {};
    var UNIT_GROUPS = Array.isArray(safePayload.unitGroups) ? safePayload.unitGroups : [];
    var UNIT_CATALOG = Array.isArray(safePayload.unitCatalog) ? safePayload.unitCatalog : [];
    var UNIT_STRUCTURE = (function () {
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
    var UNIT_META_BY_VALUE = safePayload.unitMetaByValue && typeof safePayload.unitMetaByValue === 'object' ? safePayload.unitMetaByValue : {};

    global.__OFFICIAL_UNIT_DATA__ = safePayload;
    global.getUnitStructure_ = function getUnitStructure_() {
      return clone(UNIT_STRUCTURE);
    };
    global.getOfficialUnitList_ = function getOfficialUnitList_() {
      return UNIT_CATALOG.map(function (entry) { return entry.value; });
    };
    global.getOfficialUnitCatalog_ = function getOfficialUnitCatalog_() {
      return clone(UNIT_CATALOG);
    };
    global.getOfficialUnitGroups_ = function getOfficialUnitGroups_() {
      return clone(UNIT_GROUPS);
    };
    global.getOfficialUnitMeta_ = function getOfficialUnitMeta_(value) {
      var key = String(value || '').trim();
      if (!key || !Object.prototype.hasOwnProperty.call(UNIT_META_BY_VALUE, key)) return null;
      return clone(UNIT_META_BY_VALUE[key]);
    };

    // Merge detail data into already-installed core API
    global.__mergeUnitDetail__ = function mergeUnitDetail(detail) {
      if (!detail || typeof detail !== 'object') return;
      var detailCatalog = Array.isArray(detail.unitCatalog) ? detail.unitCatalog : [];
      var detailMeta = detail.unitMetaByValue && typeof detail.unitMetaByValue === 'object' ? detail.unitMetaByValue : {};
      // Merge catalog entries
      detailCatalog.forEach(function (entry) {
        if (!entry) return;
        UNIT_CATALOG.push(entry);
        if (!entry.isTop && entry.topName && entry.childName) {
          var parent = String(entry.topName || '').trim();
          var child = String(entry.childName || '').trim();
          if (parent && child) {
            if (!UNIT_STRUCTURE[parent]) UNIT_STRUCTURE[parent] = [];
            if (UNIT_STRUCTURE[parent].indexOf(child) === -1) UNIT_STRUCTURE[parent].push(child);
          }
        }
      });
      // Merge meta entries
      Object.keys(detailMeta).forEach(function (k) {
        UNIT_META_BY_VALUE[k] = detailMeta[k];
      });
      // Update the stored payload reference
      safePayload.unitCatalog = UNIT_CATALOG;
      safePayload.unitMetaByValue = UNIT_META_BY_VALUE;
      global.__OFFICIAL_UNIT_DATA__ = safePayload;
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

  function buildVersionedUrl(name) {
    var version = encodeURIComponent(String(global.__APP_ASSET_VERSION__ || ''));
    return name + (version ? ('?v=' + version) : '');
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('Failed to load ' + url + ': HTTP ' + response.status);
      return response.json();
    });
  }

  function fetchUnitPayload() {
    // Phase 1: Try loading the lightweight core (structure + groups) first
    return fetchJson(buildVersionedUrl('units-core.json'))
      .then(function (corePayload) {
        installUnitApi(corePayload);
        // Phase 2: Lazy-load detailed catalog + meta in background
        fetchJson(buildVersionedUrl('units-detail.json'))
          .then(function (detail) {
            if (typeof global.__mergeUnitDetail__ === 'function') {
              global.__mergeUnitDetail__(detail);
            }
          })
          .catch(function (err) {
            if (global.__ismsWarn) global.__ismsWarn('units-detail.json deferred load failed', err);
          });
        return corePayload;
      })
      .catch(function () {
        // Fallback: load the full single file (backward compatible)
        return fetchJson(buildVersionedUrl('units-data.json'))
          .then(function (payload) {
            installUnitApi(payload);
            return payload;
          });
      })
      .catch(function (error) {
        if (global.__ismsError) global.__ismsError(error && error.stack ? error.stack : String(error));
        installEmptyUnitApi();
        return null;
      });
  }

  global.__APP_PENDING_ASSET_PROMISE__ = fetchUnitPayload();
})(window);
