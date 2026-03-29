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

    function createRemoteCollectionState(options) {
      const settings = options && typeof options === 'object' ? options : {};
      const summary = settings.summary && typeof settings.summary === 'object' ? settings.summary : {};
      const filters = settings.filters && typeof settings.filters === 'object' ? settings.filters : {};
      const state = {
        filters: cloneObject(filters),
        items: Array.isArray(settings.items) ? settings.items.slice() : [],
        summary: cloneObject(summary),
        page: createPage(settings.limit),
        total: Math.max(0, Number(settings.total) || 0),
        signature: String(settings.signature || '')
      };
      if (Object.prototype.hasOwnProperty.call(settings, 'loading')) state.loading = !!settings.loading;
      if (Object.prototype.hasOwnProperty.call(settings, 'lastLoadedAt')) state.lastLoadedAt = String(settings.lastLoadedAt || '');
      if (Object.prototype.hasOwnProperty.call(settings, 'filterSignature')) state.filterSignature = String(settings.filterSignature || '');
      if (settings.extra && typeof settings.extra === 'object') Object.assign(state, settings.extra);
      return state;
    }

    function createRemoteViewCache(filters, extra) {
      return {
        items: [],
        summary: null,
        page: null,
        filters: cloneObject(filters),
        signature: '',
        fetchedAt: 0,
        promise: null,
        ...(extra && typeof extra === 'object' ? extra : {})
      };
    }

    function createSummaryCache(extra) {
      return {
        signature: '',
        summary: null,
        fetchedAt: 0,
        promise: null,
        ...(extra && typeof extra === 'object' ? extra : {})
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

    function createBoundedCacheStore(options) {
      const settings = options && typeof options === 'object' ? options : {};
      const maxEntries = Math.max(1, Number(settings.maxEntries) || 50);
      const defaultTtlMs = Math.max(0, Number(settings.defaultTtlMs) || 0);
      const entries = new Map();

      function isExpired(entry, now) {
        if (!entry || !entry.expiresAt) return false;
        return entry.expiresAt <= now;
      }

      function cloneValue(value) {
        if (value === null || value === undefined) return value;
        if (typeof structuredClone === 'function') {
          try {
            return structuredClone(value);
          } catch (_) {}
        }
        if (Array.isArray(value) || (value && typeof value === 'object')) {
          try {
            return JSON.parse(JSON.stringify(value));
          } catch (_) {}
        }
        return value;
      }

      function pruneExpired(now) {
        const current = Number.isFinite(now) ? now : Date.now();
        entries.forEach(function (entry, key) {
          if (isExpired(entry, current)) entries.delete(key);
        });
      }

      function evictOverflow() {
        if (entries.size <= maxEntries) return;
        const sorted = Array.from(entries.entries()).sort(function (left, right) {
          return Number(left[1] && left[1].lastAccessedAt || 0) - Number(right[1] && right[1].lastAccessedAt || 0);
        });
        while (entries.size > maxEntries && sorted.length) {
          const oldest = sorted.shift();
          if (!oldest) break;
          entries.delete(oldest[0]);
        }
      }

      function get(key) {
        const cacheKey = String(key || '').trim();
        if (!cacheKey) return null;
        const entry = entries.get(cacheKey);
        if (!entry) return null;
        const now = Date.now();
        if (isExpired(entry, now)) {
          entries.delete(cacheKey);
          return null;
        }
        entry.lastAccessedAt = now;
        return {
          value: cloneValue(entry.value),
          meta: cloneObject(entry.meta),
          storedAt: entry.storedAt,
          expiresAt: entry.expiresAt,
          ttlMs: entry.ttlMs
        };
      }

      function set(key, value, options) {
        const cacheKey = String(key || '').trim();
        if (!cacheKey) return null;
        const opts = options && typeof options === 'object' ? options : {};
        const ttlMs = Math.max(0, Number(opts.ttlMs || defaultTtlMs) || 0);
        const now = Date.now();
        pruneExpired(now);
        entries.set(cacheKey, {
          value: cloneValue(value),
          meta: cloneObject(opts.meta),
          storedAt: now,
          expiresAt: ttlMs > 0 ? now + ttlMs : 0,
          ttlMs: ttlMs,
          lastAccessedAt: now
        });
        evictOverflow();
        return get(cacheKey);
      }

      function remove(key) {
        const cacheKey = String(key || '').trim();
        if (!cacheKey) return false;
        return entries.delete(cacheKey);
      }

      function clear() {
        entries.clear();
      }

      function size() {
        pruneExpired(Date.now());
        return entries.size;
      }

      function snapshot() {
        pruneExpired(Date.now());
        return Array.from(entries.entries()).map(function ([key, entry]) {
          return {
            key: key,
            meta: cloneObject(entry.meta),
            storedAt: entry.storedAt,
            expiresAt: entry.expiresAt,
            ttlMs: entry.ttlMs,
            lastAccessedAt: entry.lastAccessedAt
          };
        });
      }

      return {
        get: get,
        set: set,
        remove: remove,
        clear: clear,
        size: size,
        snapshot: snapshot
      };
    }

    function replaceCacheState(cache, nextState, defaults) {
      const base = defaults && typeof defaults === 'object' ? { ...defaults } : {};
      const next = nextState && typeof nextState === 'object' ? { ...nextState } : {};
      if (!cache || typeof cache !== 'object') return { ...base, ...next };
      Object.keys(cache).forEach(function (key) {
        delete cache[key];
      });
      Object.assign(cache, base, next);
      return cache;
    }

    function createRemoteCollectionBundle(options) {
      const settings = options && typeof options === 'object' ? options : {};
      const includeViewCache = settings.includeViewCache !== false;
      const includeSummaryCache = settings.includeSummaryCache !== false;
      const includeRenderCache = settings.includeRenderCache !== false;
      const includeMarkupCache = settings.includeMarkupCache !== false;
      return {
        state: createRemoteCollectionState(settings),
        ...(includeViewCache ? { viewCache: createRemoteViewCache(settings.filters, settings.viewCacheExtra) } : {}),
        ...(includeSummaryCache ? { summaryCache: createSummaryCache(settings.summaryCacheExtra) } : {}),
        ...(includeRenderCache ? { renderCache: createRenderCache(settings.renderCacheExtra) } : {}),
        ...(includeMarkupCache ? { markupCache: createMarkupCache(settings.markupCacheExtra) } : {})
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

    function resetSummaryCache(cache) {
      if (!cache || typeof cache !== 'object') return;
      cache.signature = '';
      cache.summary = null;
      cache.fetchedAt = 0;
      cache.promise = null;
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

    function resetRemoteCollectionBundle(bundle, options) {
      const settings = options && typeof options === 'object' ? options : {};
      if (!bundle || typeof bundle !== 'object') return;
      if (bundle.state && typeof bundle.state === 'object') {
        resetPagedCollectionState(bundle.state, settings);
      }
      if (bundle.viewCache && typeof bundle.viewCache === 'object') {
        resetRemoteViewCache(bundle.viewCache, settings.filters);
      }
      if (bundle.summaryCache && typeof bundle.summaryCache === 'object') {
        resetSummaryCache(bundle.summaryCache);
      }
      resetRenderCaches(bundle.renderCache, bundle.markupCache);
    }

    function primeSummaryCache(cache, options) {
      const settings = options && typeof options === 'object' ? options : {};
      const signature = String(settings.signature || '').trim();
      const defaults = settings.defaults && typeof settings.defaults === 'object'
        ? settings.defaults
        : { signature: '', summary: null, fetchedAt: 0, promise: null };
      const replace = typeof settings.replaceState === 'function' ? settings.replaceState : replaceCacheState;
      const load = typeof settings.load === 'function' ? settings.load : null;
      const normalize = typeof settings.normalize === 'function' ? settings.normalize : function (value) { return value; };
      if (!cache || typeof cache !== 'object' || !signature || !load) return Promise.resolve(null);
      if (!settings.force && cache.signature === signature && cache.promise) return cache.promise;
      const promise = Promise.resolve()
        .then(load)
        .then(function (response) {
          const summary = normalize(response);
          if (typeof settings.onSuccess === 'function') settings.onSuccess(summary, response);
          replace(cache, {
            signature: signature,
            summary: summary,
            fetchedAt: Date.now(),
            promise: null
          }, defaults);
          return summary;
        })
        .catch(function (error) {
          if (cache.signature === signature) {
            replace(cache, {
              ...cache,
              promise: null
            }, defaults);
          }
          if (typeof settings.onError === 'function') settings.onError(error);
          throw error;
        });
      replace(cache, {
        signature: signature,
        summary: cache.signature === signature ? cache.summary : null,
        fetchedAt: cache.signature === signature ? cache.fetchedAt : 0,
        promise: promise
      }, defaults);
      return promise;
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
      createRemoteCollectionState: createRemoteCollectionState,
      createRemoteViewCache: createRemoteViewCache,
      createSummaryCache: createSummaryCache,
      createRenderCache: createRenderCache,
      createMarkupCache: createMarkupCache,
      createBoundedCacheStore: createBoundedCacheStore,
      replaceCacheState: replaceCacheState,
      createRemoteCollectionBundle: createRemoteCollectionBundle,
      resetRemoteViewCache: resetRemoteViewCache,
      resetSummaryState: resetSummaryState,
      resetSummaryCache: resetSummaryCache,
      resetRenderCaches: resetRenderCaches,
      resetPagedCollectionState: resetPagedCollectionState,
      resetRemoteCollectionBundle: resetRemoteCollectionBundle,
      primeSummaryCache: primeSummaryCache,
      buildRenderSignature: buildRenderSignature
    };
  };

  if (typeof window !== 'undefined' && typeof window.createCollectionCacheModule === 'function' && !window.__ISMS_COLLECTION_CACHE__) {
    window.__ISMS_COLLECTION_CACHE__ = window.createCollectionCacheModule();
  }
})();
