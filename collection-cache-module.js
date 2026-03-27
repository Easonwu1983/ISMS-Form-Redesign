(function () {
  window.createCollectionCacheModule = function createCollectionCacheModule() {
    function cloneObject(value) {
      return value && typeof value === 'object' ? { ...value } : {};
    }

    function createPage(limit) {
      const safeLimit = Math.max(1, Number(limit) || 20);
      return {
        offset: 0,
        limit: safeLimit,
        total: 0,
        pageCount: 0,
        currentPage: 0,
        hasPrev: false,
        hasNext: false,
        prevOffset: 0,
        nextOffset: 0,
        pageStart: 0,
        pageEnd: 0
      };
    }

    function createRenderCache(extra) {
      return {
        signature: '',
        ...(extra && typeof extra === 'object' ? extra : {})
      };
    }

    function createMarkupCache(extra) {
      return {
        signature: '',
        html: '',
        ...(extra && typeof extra === 'object' ? extra : {})
      };
    }

    function resetRemoteViewCache(cache, filters) {
      if (!cache || typeof cache !== 'object') return;
      cache.items = [];
      cache.summary = null;
      cache.page = null;
      cache.filters = cloneObject(filters);
      cache.signature = '';
      cache.fetchedAt = 0;
      cache.promise = null;
    }

    function resetSummaryState(state, summary, remoteViewCache) {
      if (state && typeof state === 'object') state.summary = cloneObject(summary);
      if (remoteViewCache && typeof remoteViewCache === 'object') {
        remoteViewCache.summary = null;
      }
    }

    function resetRenderCaches() {
      Array.from(arguments).forEach(function (cache) {
        if (!cache || typeof cache !== 'object') return;
        cache.signature = '';
        if (Object.prototype.hasOwnProperty.call(cache, 'html')) cache.html = '';
        if (Object.prototype.hasOwnProperty.call(cache, 'filterSignature')) cache.filterSignature = '';
        if (Object.prototype.hasOwnProperty.call(cache, 'selectedSignature')) cache.selectedSignature = '';
        if (Object.prototype.hasOwnProperty.call(cache, 'defer')) cache.defer = false;
      });
    }

    function resetPagedCollectionState(state, options) {
      const settings = options && typeof options === 'object' ? options : {};
      if (!state || typeof state !== 'object') return;
      state.filters = cloneObject(settings.filters);
      state.items = [];
      state.summary = cloneObject(settings.summary);
      state.page = createPage(settings.limit);
      if (Object.prototype.hasOwnProperty.call(state, 'loading')) state.loading = false;
      if (Object.prototype.hasOwnProperty.call(state, 'lastLoadedAt')) state.lastLoadedAt = '';
      if (Object.prototype.hasOwnProperty.call(state, 'filterSignature')) state.filterSignature = '';
      if (Object.prototype.hasOwnProperty.call(state, 'total')) state.total = 0;
      if (Object.prototype.hasOwnProperty.call(state, 'signature')) state.signature = '';
      if (typeof settings.afterReset === 'function') settings.afterReset(state);
    }

    function buildRenderSignature(options) {
      const settings = options && typeof options === 'object' ? options : {};
      const items = Array.isArray(settings.items) ? settings.items : [];
      const identity = typeof settings.identity === 'function'
        ? settings.identity
        : function (item) { return String(item && item.id || item && item.username || ''); };
      return JSON.stringify({
        filters: cloneObject(settings.filters),
        page: cloneObject(settings.page),
        summary: cloneObject(settings.summary),
        lastLoadedAt: String(settings.lastLoadedAt || ''),
        filterSignature: String(settings.filterSignature || ''),
        ids: items.map(identity)
      });
    }

    return {
      cloneObject: cloneObject,
      createPage: createPage,
      createRenderCache: createRenderCache,
      createMarkupCache: createMarkupCache,
      resetRemoteViewCache: resetRemoteViewCache,
      resetSummaryState: resetSummaryState,
      resetRenderCaches: resetRenderCaches,
      resetPagedCollectionState: resetPagedCollectionState,
      buildRenderSignature: buildRenderSignature
    };
  };

  if (typeof window !== 'undefined' && typeof window.createCollectionCacheModule === 'function' && !window.__ISMS_COLLECTION_CACHE__) {
    window.__ISMS_COLLECTION_CACHE__ = window.createCollectionCacheModule();
  }
})();
