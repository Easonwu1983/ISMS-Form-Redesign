(function (global) {
  'use strict';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function installUnitApi(payload) {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const UNIT_GROUPS = Array.isArray(safePayload.unitGroups) ? safePayload.unitGroups : [];
    const UNIT_STRUCTURE = safePayload.unitStructure && typeof safePayload.unitStructure === 'object' ? safePayload.unitStructure : {};
    const UNIT_CATALOG = Array.isArray(safePayload.unitCatalog) ? safePayload.unitCatalog : [];
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
