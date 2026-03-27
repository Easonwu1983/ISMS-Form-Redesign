(function () {
  window.createAdminCollectionCacheModule = function createAdminCollectionCacheModule() {
    function getBaseModule() {
      if (typeof window !== 'undefined') {
        if (window.__ISMS_COLLECTION_CACHE__ && typeof window.__ISMS_COLLECTION_CACHE__ === 'object') {
          return window.__ISMS_COLLECTION_CACHE__;
        }
        if (typeof window.createCollectionCacheModule === 'function') {
          window.__ISMS_COLLECTION_CACHE__ = window.createCollectionCacheModule();
          return window.__ISMS_COLLECTION_CACHE__;
        }
      }
      throw new Error('collection-cache-module.js not loaded');
    }

    function cloneObject(value) {
      return getBaseModule().cloneObject(value);
    }

    function createPage(limit) {
      return getBaseModule().createPage(limit);
    }

    function createRenderCache() {
      return getBaseModule().createRenderCache({ filterSignature: '' });
    }

    function createMarkupCache() {
      return getBaseModule().createMarkupCache();
    }

    function resetRemoteViewCache(cache, filters) {
      return getBaseModule().resetRemoteViewCache(cache, filters);
    }

    function resetSummaryState(state, summary, remoteViewCache) {
      return getBaseModule().resetSummaryState(state, summary, remoteViewCache);
    }

    function resetRenderCaches(renderCache, markupCache) {
      return getBaseModule().resetRenderCaches(renderCache, markupCache);
    }

    function resetPagedCollectionState(state, options) {
      return getBaseModule().resetPagedCollectionState(state, options);
    }

    function buildRenderSignature(options) {
      return getBaseModule().buildRenderSignature(options);
    }

    return {
      cloneObject,
      createPage,
      createRenderCache,
      createMarkupCache,
      resetRemoteViewCache,
      resetSummaryState,
      resetRenderCaches,
      resetPagedCollectionState,
      buildRenderSignature
    };
  };

  if (typeof window !== 'undefined' && typeof window.createAdminCollectionCacheModule === 'function' && !window.__ISMS_ADMIN_COLLECTION_CACHE__) {
    window.__ISMS_ADMIN_COLLECTION_CACHE__ = window.createAdminCollectionCacheModule();
  }
})();
