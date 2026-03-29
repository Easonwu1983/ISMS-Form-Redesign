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

    function createRemoteCollectionState(options) {
      return getBaseModule().createRemoteCollectionState(options);
    }

    function createRemoteViewCache(filters, extra) {
      return getBaseModule().createRemoteViewCache(filters, extra);
    }

    function createSummaryCache(extra) {
      return getBaseModule().createSummaryCache(extra);
    }

    function createBoundedCacheStore(options) {
      return getBaseModule().createBoundedCacheStore(options);
    }

    function replaceCacheState(cache, nextState, defaults) {
      return getBaseModule().replaceCacheState(cache, nextState, defaults);
    }

    function createRemoteCollectionBundle(options) {
      return getBaseModule().createRemoteCollectionBundle(options);
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

    function resetSummaryCache(cache) {
      return getBaseModule().resetSummaryCache(cache);
    }

    function resetRenderCaches(renderCache, markupCache) {
      return getBaseModule().resetRenderCaches(renderCache, markupCache);
    }

    function resetPagedCollectionState(state, options) {
      return getBaseModule().resetPagedCollectionState(state, options);
    }

    function resetRemoteCollectionBundle(bundle, options) {
      return getBaseModule().resetRemoteCollectionBundle(bundle, options);
    }

    function primeSummaryCache(cache, options) {
      return getBaseModule().primeSummaryCache(cache, options);
    }

    function buildRenderSignature(options) {
      return getBaseModule().buildRenderSignature(options);
    }

    return {
      cloneObject,
      createPage,
      createRemoteCollectionState,
      createRemoteViewCache,
      createSummaryCache,
      createBoundedCacheStore,
      replaceCacheState,
      createRemoteCollectionBundle,
      createRenderCache,
      createMarkupCache,
      resetRemoteViewCache,
      resetSummaryState,
      resetSummaryCache,
      resetRenderCaches,
      resetPagedCollectionState,
      resetRemoteCollectionBundle,
      primeSummaryCache,
      buildRenderSignature
    };
  };

  if (typeof window !== 'undefined' && typeof window.createAdminCollectionCacheModule === 'function' && !window.__ISMS_ADMIN_COLLECTION_CACHE__) {
    window.__ISMS_ADMIN_COLLECTION_CACHE__ = window.createAdminCollectionCacheModule();
  }
})();
