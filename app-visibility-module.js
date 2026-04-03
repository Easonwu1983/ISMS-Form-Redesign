// @ts-check
(function () {
  window.createAppVisibilityModule = function createAppVisibilityModule() {
    let visibleItemsCacheKey = '';
    let visibleItemsCacheValue = [];

    function buildVisibleItemsCacheKey(deps, user) {
      const d = deps && typeof deps === 'object' ? deps : {};
      const dataModule = typeof d.getDataModule === 'function' ? d.getDataModule() : null;
      const rawDataFingerprint = dataModule && typeof dataModule.getStoreTouchToken === 'function'
        ? dataModule.getStoreTouchToken(d.DATA_KEY)
        : String(typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(d.DATA_KEY) || '' : '');
      const current = user || null;
      return [
        rawDataFingerprint,
        String((current && current.username) || ''),
        String((current && current.role) || ''),
        String((current && current.activeUnit) || ''),
        Array.isArray(current && current.units) ? current.units.join('|') : ''
      ].join('::');
    }

    function getVisibleItems(deps, user) {
      const d = deps && typeof deps === 'object' ? deps : {};
      const current = user || (typeof d.currentUser === 'function' ? d.currentUser() : null);
      const cacheKey = buildVisibleItemsCacheKey(d, current);
      if (visibleItemsCacheKey === cacheKey) return visibleItemsCacheValue;
      visibleItemsCacheValue = d.getPolicyModule().getVisibleItems(current);
      visibleItemsCacheKey = cacheKey;
      return visibleItemsCacheValue;
    }

    function clearVisibleItemsCache() {
      visibleItemsCacheKey = '';
      visibleItemsCacheValue = [];
    }

    function canAccessItem(deps, item, user) {
      const d = deps && typeof deps === 'object' ? deps : {};
      const current = user || (typeof d.currentUser === 'function' ? d.currentUser() : null);
      return d.getPolicyModule().canAccessItem(item, current);
    }

    function isItemHandler(deps, item, user) {
      const d = deps && typeof deps === 'object' ? deps : {};
      const current = user || (typeof d.currentUser === 'function' ? d.currentUser() : null);
      return d.getPolicyModule().isItemHandler(item, current);
    }

    function canRespondItem(deps, item, user) {
      const d = deps && typeof deps === 'object' ? deps : {};
      const current = user || (typeof d.currentUser === 'function' ? d.currentUser() : null);
      return d.getPolicyModule().canRespondItem(item, current);
    }

    function canSubmitTracking(deps, item, user) {
      const d = deps && typeof deps === 'object' ? deps : {};
      const current = user || (typeof d.currentUser === 'function' ? d.currentUser() : null);
      return d.getPolicyModule().canSubmitTracking(item, current);
    }

    return {
      buildVisibleItemsCacheKey,
      getVisibleItems,
      clearVisibleItemsCache,
      canAccessItem,
      isItemHandler,
      canRespondItem,
      canSubmitTracking
    };
  };
})();
