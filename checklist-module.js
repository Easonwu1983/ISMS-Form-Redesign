(function () {
  window.createChecklistModule = function createChecklistModule(deps) {
    const {
      TEMPLATE_KEY,
      ROLES,
      CHECKLIST_STATUS_SUBMITTED,
      COMPLIANCE_OPTS,
      COMPLIANCE_COLORS,
      COMPLIANCE_CLASSES,
      normalizeChecklistStatus,
      isChecklistDraftStatus,
      currentUser,
      isAdmin,
      canFillChecklist,
      getScopedUnit,
      getAuthorizedUnits,
      getVisibleChecklists,
      getStoreTouchToken,
      canEditChecklist,
      getUnitGovernanceMode,
      findExistingChecklistForUnitYear,
      getChecklist,
      getLatestEditableChecklistDraft,
      canAccessChecklist,
      splitUnitValue,
      buildUnitCascadeControl,
      initUnitCascade,
      applyTestIds,
      applySelectorTestIds,
      debugFlow,
      generateChecklistIdForYear,
      addChecklist,
      updateChecklist,
      syncChecklistsFromM365,
      submitChecklistDraft,
      submitChecklistForm,
      prepareUploadBatch,
      createTransientUploadEntry,
      revokeTransientUploadEntry,
      persistUploadedEntries,
      renderAttachmentList,
      cleanupRenderedAttachmentUrls,
      getChecklistSections,
      saveChecklistSections,
      resetChecklistSections,
      deleteChecklistsByYear,
      registerActionHandlers,
      closeModalRoot,
      navigate,
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      toast,
      fmt,
      fmtTime,
      esc,
      ic,
      refreshIcons,
      bindCopyButtons,
      addPageEventListener,
      registerPageCleanup,
      renderCopyIdCell,
      renderCopyIdButton,
      openConfirmDialog,
      runWithBusyState
    } = deps;

    function getChecklistSectionsState() {
      return getChecklistSections();
    }

    function getChecklistEvidenceFiles(saved) {
      return Array.isArray(saved && saved.evidenceFiles) ? saved.evidenceFiles.slice() : [];
    }

    function buildChecklistEvidencePreviewSlot(itemId, extraClass) {
      return `<div class="file-preview-list checklist-evidence-preview ${esc(extraClass || '')}" id="cl-files-${itemId}"></div>`;
    }

    function buildChecklistEvidenceReadonlySlot(itemId) {
      return `<div class="file-preview-list checklist-evidence-preview checklist-evidence-preview--readonly" id="cl-detail-files-${itemId}"></div>`;
    }

    function buildChecklistEvidenceUpload(item, saved, editable = true) {
      const existingCount = getChecklistEvidenceFiles(saved).length;
      if (!editable) {
        return `<div class="form-group cl-evidence-upload-group"><label class="form-label">佐證檔案</label>${buildChecklistEvidenceReadonlySlot(item.id)}</div>`;
      }
      return `<div class="form-group cl-evidence-upload-group"><label class="form-label">附加佐證檔案</label><label class="training-file-input checklist-file-input"><input type="file" id="cl-file-${item.id}" data-item-id="${item.id}" multiple accept="image/*,.pdf"><span class="training-file-input-copy"><strong>上傳佐證檔案</strong><small>${existingCount ? `已附 ${existingCount} 筆` : '支援 JPG / PNG / PDF，單檔上限 5MB'}</small></span></label>${buildChecklistEvidencePreviewSlot(item.id, 'checklist-evidence-files')}</div>`;
    }

    function applyChecklistTableHeaderScope(headersHtml) {
      return String(headersHtml || '').replace(/<th(?![^>]*\bscope=)/g, '<th scope="col"');
    }

    function buildChecklistTableCaption(caption) {
      const text = String(caption || '').trim();
      if (!text) return '';
      return '<caption class="sr-only">' + esc(text) + '</caption>';
    }

    function toDateInputValue(value) {
      if (!value) return '';
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return '';
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    }

    const checklistBrowseState = {
      year: '',
      status: 'all',
      keyword: ''
    };
    let checklistListRenderCache = createChecklistMarkupCache();
    let checklistListSnapshotCache = { token: '', length: 0, items: [], years: [] };
    let checklistListViewCache = { signature: '', filtered: [], grouped: [] };
    let checklistListDomCache = { signature: '', appliedSignature: '', rows: [], units: [], years: [], emptyState: null, contentEl: null, searchTexts: [], rowUnitKeys: [], rowYearKeys: [] };
    const CHECKLIST_REMOTE_PAGE_LIMIT_OPTIONS = ['25', '50', '100'];
    const CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT = '50';
    const CHECKLIST_REMOTE_PAGE_CACHE_MAX = 12;
    const checklistRemotePageCache = createChecklistBoundedCacheStore({
      maxEntries: CHECKLIST_REMOTE_PAGE_CACHE_MAX,
      defaultTtlMs: 2 * 60 * 1000
    });
    let checklistRemoteCollectionBundle = null;
    let checklistRemoteSummaryCache = null;
    let checklistRemoteSummaryBootstrapState = { signature: '', timer: 0, attempt: 0 };
    const CHECKLIST_REMOTE_SUMMARY_TTL_MS = 15000;
    const CHECKLIST_REMOTE_SUMMARY_BOOTSTRAP_DELAYS = getChecklistBootstrapRetryDelays();
    const CHECKLIST_DEFERRED_SYNC_TIMEOUT_MS = 250;
    let checklistRemotePageState = null;
    let checklistListRenderGeneration = 0;
    let checklistAccessProfileListenerInstalled = false;

    function serializeChecklistRemoteSummary(summary) {
      const safe = normalizeChecklistRemoteSummary(summary, summary && summary.total);
      return [safe.total, safe.editing, safe.pendingExport, safe.closed].join('|');
    }

    function getChecklistRemoteSummarySignature(filters) {
      const accessProfile = getChecklistAccessProfile();
      const normalizedFilters = normalizeChecklistRemoteFilters(filters);
      const authorizedUnits = normalizeChecklistUnitList(accessProfile && accessProfile.authorizedUnits);
      return [
        accessProfile && accessProfile.username || '',
        accessProfile && accessProfile.primaryUnit || '',
        accessProfile && accessProfile.activeUnit || '',
        authorizedUnits.join(','),
        normalizedFilters.auditYear || 'all',
        normalizedFilters.statusBucket || 'all',
        normalizedFilters.q || ''
      ].join('::');
    }

    function getChecklistRemoteSummaryFilters(filters) {
      const normalized = normalizeChecklistRemoteFilters(filters);
      return {
        auditYear: normalized.auditYear,
        statusBucket: normalized.statusBucket,
        q: normalized.q
      };
    }

    function getChecklistRemoteSummaryClient() {
      const client = getChecklistRemoteClient();
      if (!client || (typeof client.getChecklistListSummary !== 'function' && typeof client.listChecklists !== 'function')) return null;
      return client;
    }

    function resetChecklistRemoteSummaryBootstrapState() {
      const timer = Number(checklistRemoteSummaryBootstrapState.timer || 0);
      if (timer && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
        window.clearTimeout(timer);
      }
      checklistRemoteSummaryBootstrapState = { signature: '', timer: 0, attempt: 0 };
    }

    function readChecklistRemoteSummary(filters, force) {
      const signature = getChecklistRemoteSummarySignature(filters);
      if (checklistRemoteSummaryCache.signature !== signature) return null;
      if (!checklistRemoteSummaryCache.summary) return null;
      const age = Date.now() - Number(checklistRemoteSummaryCache.fetchedAt || 0);
      if (force || age > CHECKLIST_REMOTE_SUMMARY_TTL_MS) return null;
      return normalizeChecklistRemoteSummary(checklistRemoteSummaryCache.summary, checklistRemoteSummaryCache.summary && checklistRemoteSummaryCache.summary.total);
    }

    function primeChecklistRemoteSummary(filters, options) {
      const client = getChecklistRemoteSummaryClient();
      if (!client) return Promise.resolve(null);
      const summaryFilters = getChecklistRemoteSummaryFilters(filters);
      const signature = getChecklistRemoteSummarySignature(summaryFilters);
      const loadSummary = typeof client.getChecklistListSummary === 'function'
        ? client.getChecklistListSummary.bind(client)
        : client.listChecklists.bind(client);
      return primeChecklistSummaryCache(checklistRemoteSummaryCache, {
        signature,
        force: !!(options && options.force),
        replaceState: replaceChecklistCacheState,
        defaults: { signature: '', summary: null, fetchedAt: 0, promise: null },
        load: function () { return loadSummary(summaryFilters); },
        normalize: function (response) {
          return normalizeChecklistRemoteSummary(response && response.summary, response && response.total);
        },
        onSuccess: function () {
          if (checklistRemoteSummaryBootstrapState.signature === signature) resetChecklistRemoteSummaryBootstrapState();
        }
      });
    }

    function queueChecklistRemoteSummaryBootstrap(filters) {
      const signature = getChecklistRemoteSummarySignature(filters);
      if (readChecklistRemoteSummary(filters, false)) {
        if (checklistRemoteSummaryBootstrapState.signature === signature) resetChecklistRemoteSummaryBootstrapState();
        return;
      }
      if (checklistRemoteSummaryCache.signature === signature && checklistRemoteSummaryCache.promise) return;
      if (checklistRemoteSummaryBootstrapState.signature !== signature) {
        resetChecklistRemoteSummaryBootstrapState();
        checklistRemoteSummaryBootstrapState.signature = signature;
      }
      if (checklistRemoteSummaryBootstrapState.timer) return;
      if (checklistRemoteSummaryBootstrapState.attempt >= CHECKLIST_REMOTE_SUMMARY_BOOTSTRAP_DELAYS.length) return;
      const delay = CHECKLIST_REMOTE_SUMMARY_BOOTSTRAP_DELAYS[checklistRemoteSummaryBootstrapState.attempt];
      checklistRemoteSummaryBootstrapState.attempt += 1;
      checklistRemoteSummaryBootstrapState.timer = window.setTimeout(() => {
        checklistRemoteSummaryBootstrapState.timer = 0;
        if (readChecklistRemoteSummary(filters, false)) {
          resetChecklistRemoteSummaryBootstrapState();
          return;
        }
        primeChecklistRemoteSummary(filters).then((summary) => {
          if (!String(window.location.hash || '').startsWith('#checklist')) return;
          if (serializeChecklistRemoteSummary(summary) !== serializeChecklistRemoteSummary(checklistRemotePageState.summary)) {
            renderChecklistList({ skipSync: true });
          }
        }).catch((error) => {
          window.__ismsWarn('checklist list summary bootstrap failed', error);
        }).finally(() => {
          resetChecklistRemoteSummaryBootstrapState();
        });
      }, delay);
    }

    function scheduleDeferredPromise(taskFactory, timeoutMs) {
      const delay = Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : CHECKLIST_DEFERRED_SYNC_TIMEOUT_MS;
      return new Promise((resolve) => {
        const run = function () {
          try {
            resolve(Promise.resolve(typeof taskFactory === 'function' ? taskFactory() : null));
          } catch (error) {
            window.__ismsWarn('deferred task failed to start', error);
            resolve(Promise.resolve());
          }
        };
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(run, { timeout: delay });
          return;
        }
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
          window.setTimeout(run, delay);
          return;
        }
        run();
      });
    }

    function normalizeChecklistUnitList(units) {
      const source = Array.isArray(units) ? units : [];
      return Array.from(new Set(source.map((unit) => String(unit || '').trim()).filter(Boolean)));
    }

    function getChecklistAccessProfile(user) {
      const base = user || currentUser();
      if (!base) return null;
      const authorizedUnits = normalizeChecklistUnitList(
        Array.isArray(base.authorizedUnits) && base.authorizedUnits.length
          ? base.authorizedUnits
          : getAuthorizedUnits(base)
      );
      const activeUnit = String(base.activeUnit || getScopedUnit(base) || base.primaryUnit || base.unit || authorizedUnits[0] || '').trim();
      const primaryUnit = String(base.primaryUnit || activeUnit || base.unit || '').trim();
      return {
        ...base,
        primaryUnit,
        authorizedUnits,
        activeUnit
      };
    }

    function recordChecklistBootstrapStep(step, detail) {
      if (typeof window === 'undefined' || !window.__ISMS_BOOTSTRAP__ || typeof window.__ISMS_BOOTSTRAP__.record !== 'function') return;
      window.__ISMS_BOOTSTRAP__.record(step, detail);
    }

    function getChecklistCacheInvalidationModule() {
      if (typeof window === 'undefined') return null;
      if (window.__ISMS_CACHE_INVALIDATION__ && typeof window.__ISMS_CACHE_INVALIDATION__ === 'object') {
        return window.__ISMS_CACHE_INVALIDATION__;
      }
      if (typeof window.createCacheInvalidationModule === 'function') {
        window.__ISMS_CACHE_INVALIDATION__ = window.createCacheInvalidationModule();
        return window.__ISMS_CACHE_INVALIDATION__;
      }
      return null;
    }
    function getChecklistCollectionCacheModule() {
      if (typeof window === 'undefined') return null;
      if (window.__ISMS_COLLECTION_CACHE__ && typeof window.__ISMS_COLLECTION_CACHE__ === 'object') {
        return window.__ISMS_COLLECTION_CACHE__;
      }
      if (typeof window.createCollectionCacheModule === 'function') {
        window.__ISMS_COLLECTION_CACHE__ = window.createCollectionCacheModule();
        return window.__ISMS_COLLECTION_CACHE__;
      }
      return null;
    }
    function getChecklistBootstrapRetryDelays(delays) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.getBootstrapRetryDelays === 'function') {
        return moduleApi.getBootstrapRetryDelays(delays);
      }
      return (Array.isArray(delays) && delays.length ? delays : [80, 160, 320, 640]).slice();
    }
    function createChecklistCollectionPage(limit) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createPage === 'function') return moduleApi.createPage(limit);
      const safeLimit = Math.max(1, Number(limit) || 50);
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
    function createChecklistBoundedCacheStore(options) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createBoundedCacheStore === 'function') {
        return moduleApi.createBoundedCacheStore(options);
      }
      const entries = new Map();
      return {
        get: function (key) {
          if (!entries.has(key)) return null;
          return { value: entries.get(key) };
        },
        set: function (key, value) {
          entries.set(key, value);
          return { value: value };
        },
        remove: function (key) {
          return entries.delete(key);
        },
        clear: function () {
          entries.clear();
        },
        size: function () {
          return entries.size;
        }
      };
    }

    function bindChecklistPageEvent(target, type, listener, options) {
      if (typeof addPageEventListener === 'function') {
        return addPageEventListener(target, type, listener, options);
      }
      if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
        return function () {};
      }
      target.addEventListener(type, listener, options);
      return function () {
        try { target.removeEventListener(type, listener, options); } catch (_) {}
      };
    }

    function registerChecklistPageCleanup(callback) {
      if (typeof registerPageCleanup === 'function') {
        return registerPageCleanup(callback);
      }
      return function () {};
    }

    function scheduleChecklistPostPaint(task, delayMs) {
      if (typeof task !== 'function') return function () {};
      let cancelled = false;
      let frameId = 0;
      let timerId = 0;
      const run = function () {
        if (cancelled) return;
        try {
          task();
        } catch (error) {
          window.__ismsWarn('checklist post paint task failed', error);
        }
      };
      const scheduleTimeout = function () {
        const safeDelay = Math.max(0, Number(delayMs) || 0);
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
          timerId = window.setTimeout(run, safeDelay);
          return;
        }
        run();
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        frameId = window.requestAnimationFrame(scheduleTimeout);
      } else {
        scheduleTimeout();
      }
      return registerChecklistPageCleanup(function () {
        cancelled = true;
        if (frameId && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
          try { window.cancelAnimationFrame(frameId); } catch (_) {}
        }
        if (timerId && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          try { window.clearTimeout(timerId); } catch (_) {}
        }
      });
    }

    function createChecklistRemoteCollectionState(options) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createRemoteCollectionState === 'function') return moduleApi.createRemoteCollectionState(options);
      const settings = options && typeof options === 'object' ? options : {};
      return {
        filters: { ...(settings.filters || {}) },
        items: Array.isArray(settings.items) ? settings.items.slice() : [],
        summary: { ...(settings.summary || {}) },
        page: createChecklistCollectionPage(settings.limit),
        total: Math.max(0, Number(settings.total) || 0),
        signature: String(settings.signature || ''),
        ...(settings.extra && typeof settings.extra === 'object' ? settings.extra : {})
      };
    }
    function createChecklistSummaryCache(extra) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createSummaryCache === 'function') return moduleApi.createSummaryCache(extra);
      return { signature: '', summary: null, fetchedAt: 0, promise: null, ...(extra && typeof extra === 'object' ? extra : {}) };
    }
    function primeChecklistSummaryCache(cache, options) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.primeSummaryCache === 'function') return moduleApi.primeSummaryCache(cache, options);
      return Promise.resolve(null);
    }
    function replaceChecklistCacheState(cache, nextState, defaults) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.replaceCacheState === 'function') return moduleApi.replaceCacheState(cache, nextState, defaults);
      const base = defaults && typeof defaults === 'object' ? { ...defaults } : {};
      const next = nextState && typeof nextState === 'object' ? nextState : {};
      if (!cache || typeof cache !== 'object') return { ...base, ...next };
      Object.keys(cache).forEach((key) => { delete cache[key]; });
      Object.assign(cache, base, next);
      return cache;
    }
    function resetChecklistSummaryCache(cache) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.resetSummaryCache === 'function') return moduleApi.resetSummaryCache(cache);
      if (!cache || typeof cache !== 'object') return;
      cache.signature = '';
      cache.summary = null;
      cache.fetchedAt = 0;
      cache.promise = null;
    }
    function createChecklistRemoteCollectionBundle(options) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createRemoteCollectionBundle === 'function') {
        return moduleApi.createRemoteCollectionBundle({
          ...(options && typeof options === 'object' ? options : {}),
          includeViewCache: false,
          includeSummaryCache: true,
          includeRenderCache: false,
          includeMarkupCache: true
        });
      }
      const settings = options && typeof options === 'object' ? options : {};
      return {
        state: createChecklistRemoteCollectionState(settings),
        summaryCache: createChecklistSummaryCache(settings.summaryCacheExtra),
        markupCache: createChecklistMarkupCache(settings.markupCacheExtra)
      };
    }
    function createChecklistMarkupCache(extra) {
      const moduleApi = getChecklistCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createMarkupCache === 'function') return moduleApi.createMarkupCache(extra);
      return { signature: '', html: '', ...(extra && typeof extra === 'object' ? extra : {}) };
    }
    checklistRemoteCollectionBundle = createChecklistRemoteCollectionBundle({
      filters: { limit: CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT, offset: '0', auditYear: '', statusBucket: 'all', q: '' },
      summary: { total: 0, editing: 0, pendingExport: 0, closed: 0 },
      limit: CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT
    });
    checklistRemoteSummaryCache = checklistRemoteCollectionBundle.summaryCache;
    checklistRemotePageState = checklistRemoteCollectionBundle.state;
    function normalizeChecklistCacheScope(scope) {
      const moduleApi = getChecklistCacheInvalidationModule();
      return moduleApi && typeof moduleApi.normalizeScope === 'function'
        ? moduleApi.normalizeScope(scope, '')
        : String(scope || '').trim().toLowerCase();
    }
    function dispatchChecklistCacheInvalidation(scope, reason) {
      const normalizedScope = normalizeChecklistCacheScope(scope);
      const moduleApi = getChecklistCacheInvalidationModule();
      if (!normalizedScope || !moduleApi || typeof moduleApi.dispatch !== 'function') return;
      moduleApi.dispatch(normalizedScope, reason || 'checklist-cache-invalidated');
    }

    function dispatchChecklistCacheInvalidationScopes(scopes, reason) {
      const normalizedScopes = Array.from(new Set((Array.isArray(scopes) ? scopes : [scopes])
        .map(normalizeChecklistCacheScope)
        .filter(Boolean)));
      normalizedScopes.forEach((scope) => dispatchChecklistCacheInvalidation(scope, reason));
    }

    function resetChecklistRemoteCaches(reason, scope) {
      const normalizedScope = normalizeChecklistCacheScope(scope);
      const safeReason = String(reason || 'profile-changed').trim() || 'profile-changed';
      const resetAll = !normalizedScope || normalizedScope === 'all' || normalizedScope === 'access-profile' || normalizedScope === 'checklists';
      const resetListSummary = resetAll || normalizedScope === 'checklists-list' || normalizedScope === 'checklists-query';
      const resetSummaryOnly = resetAll || normalizedScope === 'checklists-summary';
      const resetRenderOnly = resetAll || normalizedScope === 'checklists-render';
      const resetTemplate = resetAll || normalizedScope === 'checklists-template';
      if (resetListSummary) {
        checklistRemotePageCache.clear();
        checklistRemoteCollectionBundle = createChecklistRemoteCollectionBundle({
          filters: { limit: CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT, offset: '0', auditYear: '', statusBucket: 'all', q: '' },
          summary: { total: 0, editing: 0, pendingExport: 0, closed: 0 },
          limit: CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT
        });
        checklistRemoteSummaryCache = checklistRemoteCollectionBundle.summaryCache;
        resetChecklistRemoteSummaryBootstrapState();
        checklistRemotePageState = checklistRemoteCollectionBundle.state;
        checklistBrowseState.keyword = '';
        checklistBrowseState.selectedYear = '';
        checklistBrowseState.status = 'all';
        checklistListRenderCache = createChecklistMarkupCache();
        checklistListSnapshotCache = { token: '', length: 0, items: [], years: [] };
        checklistListViewCache = { signature: '', filtered: [], grouped: [] };
        checklistListDomCache = { signature: '', appliedSignature: '', rows: [], units: [], years: [], emptyState: null, contentEl: null, searchTexts: [], rowUnitKeys: [], rowYearKeys: [] };
      } else {
        if (resetSummaryOnly) {
          resetChecklistSummaryCache(checklistRemoteSummaryCache);
          resetChecklistRemoteSummaryBootstrapState();
          checklistRemotePageState.summary = normalizeChecklistRemoteSummary(null, 0);
        }
        if (resetRenderOnly || resetSummaryOnly) {
          checklistListRenderCache = createChecklistMarkupCache();
          checklistListViewCache = { signature: '', filtered: [], grouped: [] };
          checklistListDomCache = { signature: '', appliedSignature: '', rows: [], units: [], years: [], emptyState: null, contentEl: null, searchTexts: [], rowUnitKeys: [], rowYearKeys: [] };
        }
      }
      if (resetTemplate) {
        checklistListSnapshotCache = { token: '', length: 0, items: [], years: [] };
      }
      recordChecklistBootstrapStep('checklist-cache-reset', safeReason + (normalizedScope ? ':' + normalizedScope : ''));
    }

    function installChecklistAccessProfileListener() {
      if (checklistAccessProfileListenerInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      window.addEventListener('isms:access-profile-changed', function (event) {
        const detail = event && event.detail ? event.detail : {};
        resetChecklistRemoteCaches(detail.reason || 'profile-changed');
      });
      window.addEventListener('isms:cache-invalidate', function (event) {
        const detail = event && event.detail ? event.detail : {};
        const scope = normalizeChecklistCacheScope(detail.scope);
        const moduleApi = getChecklistCacheInvalidationModule();
        const acceptedScopes = ['all', 'access-profile', 'checklists', 'checklists-list', 'checklists-query', 'checklists-summary', 'checklists-render', 'checklists-template'];
        const shouldReset = moduleApi && typeof moduleApi.matchesScope === 'function'
          ? moduleApi.matchesScope(scope, acceptedScopes)
          : (!scope || acceptedScopes.includes(scope));
        if (shouldReset) {
          resetChecklistRemoteCaches(detail.reason || 'cache-invalidated', scope);
        }
      });
      checklistAccessProfileListenerInstalled = true;
    }

    function getChecklistRemoteClient() {
      installChecklistAccessProfileListener();
      if (typeof window === 'undefined') return null;
      if (window._m365ApiClient && typeof window._m365ApiClient === 'object') return window._m365ApiClient;
      try {
        if (window.__ISMS_BOOTSTRAP__ && typeof window.__ISMS_BOOTSTRAP__.resolveM365ApiClient === 'function') {
          const client = window.__ISMS_BOOTSTRAP__.resolveM365ApiClient();
          if (client && typeof client === 'object') {
            recordChecklistBootstrapStep('checklist-client-hydrated', 'bootstrap-resolver');
            return client;
          }
        }
      } catch (error) {
        recordChecklistBootstrapStep('checklist-client-hydrate-failed', String(error && error.message || error || 'unknown'));
      }
      try {
        if (typeof window.getM365ApiClient === 'function') {
          const client = window.getM365ApiClient();
          if (client && typeof client === 'object') {
            recordChecklistBootstrapStep('checklist-client-hydrated', 'window-getter');
            return client;
          }
        }
      } catch (error) {
        recordChecklistBootstrapStep('checklist-client-hydrate-failed', String(error && error.message || error || 'unknown'));
      }
      return null;
    }

    function canUseRemoteChecklistPaging() {
      const client = getChecklistRemoteClient();
      return !!(client
        && typeof client.getChecklistMode === 'function'
        && client.getChecklistMode() === 'm365-api'
        && typeof client.listChecklists === 'function');
    }

    function normalizeChecklistRemoteFilters(filters) {
      const source = filters && typeof filters === 'object' ? filters : {};
      const limit = Math.max(1, Math.min(Number(source.limit || CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT) || Number(CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT), 200));
      const offset = Math.max(0, Number(source.offset || 0) || 0);
      return {
        limit: String(limit),
        offset: String(offset),
        auditYear: String(source.auditYear || '').trim(),
        statusBucket: String(source.statusBucket || 'all').trim() || 'all',
        q: String(source.q || '').trim()
      };
    }

    function getChecklistRemoteSignature(filters) {
      const normalized = normalizeChecklistRemoteFilters(filters);
      return [
        normalized.limit,
        normalized.offset,
        normalized.auditYear || 'all',
        normalized.statusBucket || 'all',
        normalized.q || ''
      ].join('::');
    }

    function normalizeChecklistRemotePage(page, filters, items, total) {
      const normalizedFilters = normalizeChecklistRemoteFilters(filters);
      const limit = Math.max(1, Number(normalizedFilters.limit || CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT) || Number(CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT));
      const resolvedItems = Array.isArray(items) ? items : [];
      const safeTotal = Math.max(0, Number(total) || resolvedItems.length);
      const maxOffset = safeTotal > 0 ? Math.max(0, Math.floor((safeTotal - 1) / limit) * limit) : 0;
      const offset = Math.min(Math.max(0, Number(page && page.offset) || Number(normalizedFilters.offset || 0) || 0), maxOffset);
      const pageCount = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / limit)) : 0;
      const currentPage = safeTotal > 0 ? Math.floor(offset / limit) + 1 : 0;
      const pageStart = resolvedItems.length ? offset + 1 : 0;
      const pageEnd = resolvedItems.length ? offset + resolvedItems.length : 0;
      return {
        offset,
        limit,
        total: safeTotal,
        pageCount,
        currentPage,
        hasPrev: offset > 0,
        hasNext: pageEnd > 0 && pageEnd < safeTotal,
        prevOffset: Math.max(0, offset - limit),
        nextOffset: Math.min(maxOffset, offset + limit),
        pageStart,
        pageEnd
      };
    }

    function normalizeChecklistRemoteSummary(summary, total) {
      const source = summary && typeof summary === 'object' ? summary : {};
      return {
        total: Math.max(0, Number(total) || Number(source.total) || 0),
        editing: Math.max(0, Number(source.editing) || 0),
        pendingExport: Math.max(0, Number(source.pendingExport) || 0),
        closed: Math.max(0, Number(source.closed) || 0)
      };
    }

    function summarizeChecklistListItems(items) {
      return (Array.isArray(items) ? items : []).reduce((result, item) => {
        result.total += 1;
        const bucket = getChecklistStatusBucket(item);
        if (bucket.key === 'closed') result.closed += 1;
        else if (bucket.key === 'pending_export') result.pendingExport += 1;
        else result.editing += 1;
        return result;
      }, {
        total: 0,
        editing: 0,
        pendingExport: 0,
        closed: 0
      });
    }

    function renderChecklistListSummary(summary) {
      const safeSummary = normalizeChecklistRemoteSummary(summary, summary && summary.total);
      return `<div class="dashboard-panel-summary checklist-list-summary">
        <div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">總數</span><strong class="dashboard-panel-pill-value">${safeSummary.total}</strong></div>
        <div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">編輯中</span><strong class="dashboard-panel-pill-value">${safeSummary.editing}</strong></div>
        <div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">待匯出</span><strong class="dashboard-panel-pill-value">${safeSummary.pendingExport}</strong></div>
        <div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">已送出</span><strong class="dashboard-panel-pill-value">${safeSummary.closed}</strong></div>
      </div>`;
    }

    function getChecklistRemotePageSummary(page) {
      const normalizedPage = normalizeChecklistRemotePage(page, checklistRemotePageState.filters, checklistRemotePageState.items, checklistRemotePageState.total);
      if (!normalizedPage.total) return '\u76ee\u524d\u6c92\u6709\u7b26\u5408\u689d\u4ef6\u7684\u6aa2\u6838\u8868';
      return '\u7b2c ' + normalizedPage.currentPage + ' / ' + normalizedPage.pageCount + ' \u9801\uff0c\u986f\u793a '
        + normalizedPage.pageStart + '-' + normalizedPage.pageEnd + ' / ' + normalizedPage.total + ' \u7b46';
    }

    function getChecklistPagerModule() {
      return typeof window !== 'undefined' && window.__ISMS_PAGER__ && typeof window.__ISMS_PAGER__ === 'object'
        ? window.__ISMS_PAGER__
        : null;
    }

    function getChecklistRemoteOffsetByPageNumber(page, targetPage) {
      const pager = getChecklistPagerModule();
      if (pager && typeof pager.getOffsetByPageNumber === 'function') {
        return pager.getOffsetByPageNumber(page, targetPage, CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT);
      }
      const normalizedPage = normalizeChecklistRemotePage(page, checklistRemotePageState.filters, checklistRemotePageState.items, checklistRemotePageState.total);
      if (!normalizedPage.total) return 0;
      const pageCount = normalizedPage.pageCount || 1;
      const parsed = Number.parseInt(targetPage, 10);
      const safePage = Math.min(pageCount, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
      return (safePage - 1) * normalizedPage.limit;
    }

    function renderChecklistListPager(page) {
      const normalizedPage = normalizeChecklistRemotePage(page, checklistRemotePageState.filters, checklistRemotePageState.items, checklistRemotePageState.total);
      const pager = getChecklistPagerModule();
      if (pager && typeof pager.renderPagerToolbar === 'function') {
        return pager.renderPagerToolbar({
          page: normalizedPage,
          idPrefix: 'cl-list',
          limitOptions: CHECKLIST_REMOTE_PAGE_LIMIT_OPTIONS,
          defaultLimit: CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT,
          summary: getChecklistRemotePageSummary(normalizedPage),
          toolbarClass: 'review-toolbar review-toolbar--compact checklist-list-pager',
          toolbarStyle: 'margin-top:16px',
          esc,
          ic
        });
      }
      return '';
    }

    async function loadChecklistRemotePage(filters, options) {
      const client = getChecklistRemoteClient();
      if (!client || typeof client.listChecklists !== 'function') {
        return {
          filters: normalizeChecklistRemoteFilters(filters),
          items: [],
          summary: normalizeChecklistRemoteSummary(null, 0),
          total: 0,
          page: normalizeChecklistRemotePage(null, filters, [], 0),
          raw: null
        };
      }
      const resolvedFilters = normalizeChecklistRemoteFilters(filters);
      const signature = getChecklistRemoteSignature(resolvedFilters);
      const cached = !(options && options.force) && checklistRemotePageCache && typeof checklistRemotePageCache.get === 'function'
        ? checklistRemotePageCache.get(signature)
        : null;
      if (cached && Object.prototype.hasOwnProperty.call(cached, 'value')) {
        return cached.value;
      }
      const requestQuery = {
        limit: resolvedFilters.limit,
        offset: resolvedFilters.offset
      };
      if (resolvedFilters.auditYear && resolvedFilters.auditYear !== 'all') requestQuery.auditYear = resolvedFilters.auditYear;
      if (resolvedFilters.statusBucket && resolvedFilters.statusBucket !== 'all') requestQuery.statusBucket = resolvedFilters.statusBucket;
      if (resolvedFilters.q) requestQuery.q = resolvedFilters.q;
      const response = await client.listChecklists(requestQuery);
      const items = Array.isArray(response && response.items) ? response.items : [];
      const total = Math.max(0, Number(response && response.total) || items.length);
      const value = {
        filters: resolvedFilters,
        items,
        summary: normalizeChecklistRemoteSummary(response && response.summary, total),
        total,
        page: normalizeChecklistRemotePage(response && response.page, resolvedFilters, items, total),
        raw: response
      };
      checklistRemotePageCache.set(signature, value);
      return value;
    }

    const CHECKLIST_LIST_STATUS_OPTIONS = [
      { value: 'all', label: '全部' },
      { value: 'editing', label: '編輯中' },
      { value: 'pending_export', label: '待匯出' },
      { value: 'closed', label: '已結案' }
    ];

    function getChecklistAuditYear(item) {
      const raw = String(item && item.auditYear || '').trim();
      if (raw) return raw;
      const fillDate = String(item && item.fillDate || '').trim();
      if (!fillDate) return '';
      const parsed = new Date(fillDate);
      if (Number.isNaN(parsed.getTime())) return '';
      return String(parsed.getFullYear() - 1911);
    }

    function getChecklistCurrentAuditYear() {
      return Number(new Date().getFullYear() - 1911);
    }

    function isValidChecklistAuditYearValue(value) {
      const raw = String(value || '').trim();
      if (!/^\d{3}$/.test(raw)) return false;
      const year = Number(raw);
      const minYear = 90;
      const maxYear = getChecklistCurrentAuditYear() + 1;
      return Number.isFinite(year) && year >= minYear && year <= maxYear;
    }

    function normalizeChecklistAuditYearValue(value) {
      const raw = String(value || '').trim();
      return isValidChecklistAuditYearValue(raw) ? raw : '';
    }

    function requireChecklistAuditYearValue(value) {
      const normalized = normalizeChecklistAuditYearValue(value);
      if (normalized) return normalized;
      const minYear = 90;
      const maxYear = getChecklistCurrentAuditYear() + 1;
      throw new Error(`檢核年份必須介於 ${minYear}-${maxYear} 年之間`);
    }

    function getChecklistTier1Unit(item) {
      const parsed = splitUnitValue(String(item && item.unit || '').trim());
      return String(parsed && parsed.parent || item && item.unit || '').trim();
    }

    function getChecklistStatusBucket(item) {
      const normalized = normalizeChecklistStatus(item && item.status);
      if (normalized === CHECKLIST_STATUS_SUBMITTED) {
        return { key: 'closed', label: '已結案', badgeClass: 'badge-closed' };
      }
      const summary = item && item.summary && typeof item.summary === 'object' ? item.summary : {};
      const total = Number(summary.total || 0);
      const answered = Number(summary.conform || 0) + Number(summary.partial || 0) + Number(summary.nonConform || 0) + Number(summary.na || 0);
      const key = answered > 0 || total > 0 || item && (item.updatedAt || item.fillDate)
        ? 'pending_export'
        : 'editing';
      return {
        key,
        label: key === 'editing' ? '編輯中' : '待匯出',
        badgeClass: key === 'editing' ? 'badge-pending' : 'badge-reviewing'
      };
    }

    function getChecklistGovernanceState(unit) {
      const cleanUnit = String(unit || '').trim();
      const split = typeof splitUnitValue === 'function' ? splitUnitValue(cleanUnit) : null;
      const parent = String(split && split.parent || '').trim();
      const child = String(split && split.child || '').trim();
      const mode = typeof getUnitGovernanceMode === 'function' ? getUnitGovernanceMode(cleanUnit) : 'independent';
      return {
        unit: cleanUnit,
        parent,
        child,
        mode,
        consolidatedChild: !!(parent && child && mode === 'consolidated')
      };
    }

    function buildChecklistGovernanceNote(item) {
      const state = getChecklistGovernanceState(item && item.unit);
      return state.consolidatedChild ? '由一級單位統一填報' : '';
    }

    function buildChecklistListQueryYearOptions(items) {
      const years = new Set();
      (Array.isArray(items) ? items : []).forEach((item) => {
        const year = getChecklistAuditYear(item);
        if (isValidChecklistAuditYearValue(year)) years.add(year);
      });
      const currentYear = String(getChecklistCurrentAuditYear());
      years.add(currentYear);
      return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }

    function filterChecklistListItems(items) {
      const keyword = String(checklistBrowseState.keyword || '').trim().toLowerCase();
      const year = String(checklistBrowseState.year || '').trim();
      const status = String(checklistBrowseState.status || 'all').trim();
      return (Array.isArray(items) ? items : []).filter((item) => {
        const itemYear = getChecklistAuditYear(item);
        if (year && year !== 'all' && itemYear !== year) return false;
        const bucket = getChecklistStatusBucket(item);
        if (status !== 'all' && bucket.key !== status) return false;
        if (!keyword) return true;
        const haystack = [
          item && item.id,
          item && item.unit,
          getChecklistTier1Unit(item),
          item && item.fillerName,
          item && item.fillerUsername,
          item && item.auditYear,
          item && item.status
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(keyword);
      });
    }

    function groupChecklistListItems(items) {
      const groups = new Map();
      (Array.isArray(items) ? items : []).forEach((item) => {
        const year = normalizeChecklistAuditYearValue(getChecklistAuditYear(item)) || '未知年度';
        const unit = getChecklistTier1Unit(item) || String(item && item.unit || '未命名單位').trim();
        const yearKey = year;
        if (!groups.has(yearKey)) groups.set(yearKey, new Map());
        const yearGroups = groups.get(yearKey);
        if (!yearGroups.has(unit)) {
          yearGroups.set(unit, { year, unit, items: [], totalCount: 0, closedCount: 0 });
        }
        const group = yearGroups.get(unit);
        group.items.push(item);
        group.totalCount += 1;
        if (normalizeChecklistStatus(item && item.status) === CHECKLIST_STATUS_SUBMITTED) {
          group.closedCount += 1;
        }
      });
      return Array.from(groups.entries())
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([year, unitGroups]) => ({
          year,
          units: Array.from(unitGroups.values())
            .map((group) => ({
              ...group,
              items: group.items.slice().sort((a, b) => {
                const aTime = new Date(a && (a.updatedAt || a.fillDate || a.createdAt || 0)).getTime();
                const bTime = new Date(b && (b.updatedAt || b.fillDate || b.createdAt || 0)).getTime();
                return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
              })
            }))
            .sort((a, b) => a.unit.localeCompare(b.unit, 'zh-Hant'))
        }));
    }

    function buildChecklistListStatusPill(item) {
      const bucket = getChecklistStatusBucket(item);
      return '<span class="badge ' + bucket.badgeClass + '"><span class="badge-dot"></span>' + esc(bucket.label) + '</span>';
    }

    function renderChecklistListRow(item) {
      const status = normalizeChecklistStatus(item && item.status);
      const statusCls = status === CHECKLIST_STATUS_SUBMITTED ? 'badge-closed' : 'badge-pending';
      const target = isChecklistDraftStatus(status) && canEditChecklist(item) ? `checklist-fill/${item.id}` : `checklist-detail/${item.id}`;
      const summary = item && item.summary && typeof item.summary === 'object' ? item.summary : { total: 0, conform: 0 };
      const total = Number(summary.total || 0);
      const conform = Number(summary.conform || 0);
      const rate = total > 0 ? Math.round((conform / total) * 100) : 0;
      const governanceNote = buildChecklistGovernanceNote(item);
      const auditYearText = normalizeChecklistAuditYearValue(getChecklistAuditYear(item)) || '未知年度';
      const yearKey = String(auditYearText || '').trim() || '未知年度';
      const unitKey = String(getChecklistTier1Unit(item) || String(item && item.unit || '未命名單位').trim()).trim();
      const searchText = [
        item && item.id,
        item && item.unit,
        getChecklistTier1Unit(item),
        item && item.fillerName,
        item && item.fillerUsername,
        item && item.auditYear,
        item && item.status
      ].filter(Boolean).join(' ');
      return '<tr data-route="' + esc(target) + '" data-cl-search-text="' + esc(searchText) + '" data-cl-year-key="' + esc(yearKey) + '" data-cl-unit-key="' + esc(unitKey) + '" class="cl-list-row">'
        + '<td class="record-id-col">' + renderCopyIdCell(item.id, '複製編號', true) + '</td>'
        + '<td><div class="cl-list-unit">' + esc(item.unit || '未命名單位') + '<small>' + esc(getChecklistTier1Unit(item) || '未命名單位') + '</small>' + (governanceNote ? '<div class="cl-list-unit-note">' + esc(governanceNote) + '</div>' : '') + '</div></td>'
        + '<td>' + esc(item.fillerName || '未填姓名') + '<div class="review-card-subtitle review-card-subtitle--top-4">' + esc(item.fillerUsername || '未填帳號') + '</div></td>'
        + '<td>' + esc(auditYearText) + '</td>'
        + '<td>' + buildChecklistListStatusPill(item) + '</td>'
        + '<td><div class="cl-rate-bar"><div class="cl-rate-fill" style="width:' + rate + '%"></div></div><span class="cl-rate-text">' + rate + '%</span></td>'
        + '<td>' + fmt(item && item.fillDate) + '</td>'
        + '</tr>';
    }

    function buildChecklistListYearTabs(years) {
      const activeYear = String(checklistBrowseState.year || '').trim() || 'all';
      const currentYear = String(getChecklistCurrentAuditYear());
      const tabButtons = ['all'].concat(Array.isArray(years) ? years : []).map((year) => {
        const isActive = activeYear === year;
        const label = year === 'all' ? '全部' : (year === currentYear ? `今年 ${year}` : `${year} 年`);
        return '<button type="button" class="cl-year-tab ' + (isActive ? 'is-active' : '') + '" data-checklist-year="' + esc(year) + '">' + esc(label) + '</button>';
      }).join('');
      return '<div class="cl-year-tabs" role="tablist">' + tabButtons + '</div>';
    }

    function buildChecklistListFilters() {
      const statusOptions = CHECKLIST_LIST_STATUS_OPTIONS.map((opt) => '<option value="' + esc(opt.value) + '" ' + (String(checklistBrowseState.status || 'all') === opt.value ? 'selected' : '') + '>' + esc(opt.label) + '</option>').join('');
      return '<div class="cl-list-toolbar">'
        + '<div class="cl-list-toolbar-main">'
        + '<div class="form-group"><label class="form-label">關鍵字搜尋</label><input type="search" class="form-input" id="cl-list-keyword" placeholder="單位名稱、填報者姓名、編號" value="' + esc(checklistBrowseState.keyword || '') + '"></div>'
        + '<div class="form-group"><label class="form-label">狀態篩選</label><select class="form-select" id="cl-list-status">' + statusOptions + '</select></div>'
        + '</div>'
        + '<div class="cl-list-toolbar-actions">'
        + '<button type="button" class="btn btn-secondary" data-action="checklist.resetListFilters">' + ic('rotate-ccw', 'icon-sm') + ' 重設篩選</button>'
        + '</div>'
        + '</div>';
    }

    function getChecklistListSnapshot(items) {
      const source = Array.isArray(items) ? items.slice() : [];
      const token = typeof getStoreTouchToken === 'function' ? String(getStoreTouchToken('checklists') || '') : '';
      const remoteSignature = canUseRemoteChecklistPaging() ? String(checklistRemotePageState.signature || '') : '';
      const cacheKey = token + '::' + String(source.length) + '::' + remoteSignature;
      if (checklistListSnapshotCache.token === cacheKey && Array.isArray(checklistListSnapshotCache.items)) {
        return checklistListSnapshotCache;
      }
      source.sort((a, b) => {
        const yearDiff = Number(getChecklistAuditYear(b) || 0) - Number(getChecklistAuditYear(a) || 0);
        if (yearDiff) return yearDiff;
        return new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0);
      });
      const years = buildChecklistListQueryYearOptions(source);
      checklistListSnapshotCache = { token: cacheKey, length: source.length, items: source, years };
      return checklistListSnapshotCache;
    }

    function getChecklistListViewSnapshot(items) {
      const snapshot = getChecklistListSnapshot(items);
      const signature = [
        snapshot.token || '',
        String(checklistBrowseState.year || 'all'),
        String(checklistBrowseState.status || 'all'),
        canUseRemoteChecklistPaging() ? String(checklistRemotePageState.signature || '') : ''
      ].join('::');
      if (checklistListViewCache.signature === signature && Array.isArray(checklistListViewCache.grouped)) {
        return checklistListViewCache;
      }
      const filtered = filterChecklistListItems(snapshot.items);
      const grouped = groupChecklistListItems(filtered);
      checklistListViewCache = { signature, filtered, grouped };
      return checklistListViewCache;
    }

    function refreshChecklistListDomCache(contentEl, signature) {
      if (!contentEl) return;
      const rows = Array.from(contentEl.querySelectorAll('.cl-list-row'));
      checklistListDomCache = {
        signature,
        appliedSignature: '',
        rows,
        units: Array.from(contentEl.querySelectorAll('.cl-unit-accordion')),
        years: Array.from(contentEl.querySelectorAll('.cl-year-accordion')),
        emptyState: contentEl.querySelector('.cl-list-empty-state'),
        contentEl,
        searchTexts: rows.map((row) => String(row.getAttribute('data-cl-search-text') || '').toLowerCase()),
        rowUnitKeys: rows.map((row) => String(row.dataset.clUnitKey || '').trim()),
        rowYearKeys: rows.map((row) => String(row.dataset.clYearKey || '').trim())
      };
    }

  function setChecklistRouteState(routeName, state) {
    const targetRoute = String(routeName || '').trim();
    if (!targetRoute) return;
    const nextState = String(state || '').trim() || 'ready';
    document.querySelectorAll('[data-checklist-route]').forEach((node) => {
      if (!node || !node.dataset || node.dataset.checklistRoute !== targetRoute) return;
      node.dataset.checklistRouteState = nextState;
    });
  }

  function setChecklistListRouteState(state) {
    setChecklistRouteState('list', state);
  }

    function renderChecklistListContent(items, snapshotOverride, viewSnapshotOverride) {
      const renderSignature = [
        typeof getStoreTouchToken === 'function' ? String(getStoreTouchToken('checklists') || '') : '',
        String(checklistBrowseState.year || 'all'),
        String(checklistBrowseState.status || 'all'),
        canUseRemoteChecklistPaging() ? String(checklistRemotePageState.signature || '') : ''
      ].join('::');
      const contentEl = document.querySelector('.cl-list-content');
      if (!contentEl) return;
      if (checklistListRenderCache.signature === renderSignature && contentEl.dataset.checklistRenderSignature === renderSignature) {
        applyChecklistKeywordFilter();
        setChecklistListRouteState('ready');
        return;
      }
      const snapshot = snapshotOverride || getChecklistListSnapshot(items);
      const viewSnapshot = viewSnapshotOverride || getChecklistListViewSnapshot(snapshot.items);
      const grouped = viewSnapshot.grouped;
      const html = grouped.length ? grouped.map((yearGroup) => buildChecklistYearAccordion(yearGroup)).join('') : '';
      checklistListRenderCache = { signature: renderSignature, html };
      contentEl.dataset.checklistRenderSignature = renderSignature;
      contentEl.innerHTML = `<div class="card checklist-empty-card cl-list-empty-state" hidden><div class="empty-state checklist-empty-state"><div class="empty-state-icon">${ic('clipboard-list')}</div><div class="empty-state-title">目前沒有符合條件的檢核資料</div><div class="empty-state-desc">請先調整關鍵字、狀態或年度篩選，再重新查詢。</div></div></div>`
        + html;
      refreshChecklistListDomCache(contentEl, renderSignature);
      refreshIcons();
      bindCopyButtons();
      setChecklistListRouteState('ready');
      applyChecklistKeywordFilter();
    }

    function syncChecklistListToolbarState() {
      const keywordEl = document.getElementById('cl-list-keyword');
      const statusEl = document.getElementById('cl-list-status');
      if (keywordEl && keywordEl.value !== String(checklistBrowseState.keyword || '')) {
        keywordEl.value = String(checklistBrowseState.keyword || '');
      }
      if (statusEl && statusEl.value !== String(checklistBrowseState.status || 'all')) {
        statusEl.value = String(checklistBrowseState.status || 'all');
      }
      document.querySelectorAll('[data-checklist-year]').forEach((tab) => {
        const isActive = String(tab.dataset.checklistYear || 'all') === String(checklistBrowseState.year || 'all');
        tab.classList.toggle('is-active', isActive);
      });
    }

    function applyChecklistKeywordFilter() {
      const contentEl = document.querySelector('.cl-list-content');
      if (!contentEl) return;
      const keyword = String(checklistBrowseState.keyword || '').trim().toLowerCase();
      const hasKeyword = !!keyword;
      const renderSignature = [
        typeof getStoreTouchToken === 'function' ? String(getStoreTouchToken('checklists') || '') : '',
        String(checklistBrowseState.year || 'all'),
        String(checklistBrowseState.status || 'all'),
        canUseRemoteChecklistPaging() ? String(checklistRemotePageState.signature || '') : ''
      ].join('::');
      const appliedSignature = [
        renderSignature,
        String(checklistBrowseState.keyword || '')
      ].join('::');
      if (checklistListDomCache.signature !== renderSignature || checklistListDomCache.contentEl !== contentEl) {
        refreshChecklistListDomCache(contentEl, renderSignature);
      }
      if (checklistListDomCache.appliedSignature === appliedSignature) {
        return;
      }
      const rowEls = Array.isArray(checklistListDomCache.rows) ? checklistListDomCache.rows : Array.from(contentEl.querySelectorAll('.cl-list-row'));
      const searchTexts = Array.isArray(checklistListDomCache.searchTexts) ? checklistListDomCache.searchTexts : [];
      const rowUnitKeys = Array.isArray(checklistListDomCache.rowUnitKeys) ? checklistListDomCache.rowUnitKeys : [];
      const rowYearKeys = Array.isArray(checklistListDomCache.rowYearKeys) ? checklistListDomCache.rowYearKeys : [];
      const visibleUnitKeys = new Set();
      const visibleYearKeys = new Set();
      rowEls.forEach((row, index) => {
        const haystack = String(searchTexts[index] || row.getAttribute('data-cl-search-text') || '').toLowerCase();
        const visible = !keyword || haystack.includes(keyword);
        row.hidden = !visible;
        if (visible) {
          const rowUnitKey = String(rowUnitKeys[index] || row.dataset.clUnitKey || '').trim();
          const rowYearKey = String(rowYearKeys[index] || row.dataset.clYearKey || '').trim();
          if (rowUnitKey) visibleUnitKeys.add(rowUnitKey);
          if (rowYearKey) visibleYearKeys.add(rowYearKey);
        }
      });
      const unitEls = Array.isArray(checklistListDomCache.units) ? checklistListDomCache.units : Array.from(contentEl.querySelectorAll('.cl-unit-accordion'));
      unitEls.forEach((unitEl) => {
        const unitKey = String(unitEl.dataset.clUnitKey || '').trim();
        const hasVisibleRow = visibleUnitKeys.has(unitKey);
        unitEl.hidden = !hasVisibleRow;
        unitEl.open = hasKeyword ? hasVisibleRow : false;
      });
      const yearEls = Array.isArray(checklistListDomCache.years) ? checklistListDomCache.years : Array.from(contentEl.querySelectorAll('.cl-year-accordion'));
      yearEls.forEach((yearEl) => {
        const yearKey = String(yearEl.dataset.clYearKey || '').trim();
        const hasVisibleUnit = visibleYearKeys.has(yearKey);
        yearEl.hidden = !hasVisibleUnit;
        yearEl.open = hasVisibleUnit ? true : false;
      });
      const emptyState = checklistListDomCache.emptyState || contentEl.querySelector('.cl-list-empty-state');
      const hasVisibleRows = rowEls.some((row) => !row.hidden);
      if (emptyState) emptyState.hidden = hasVisibleRows;
      const keywordEl = document.getElementById('cl-list-keyword');
      if (hasKeyword && keywordEl && document.activeElement === keywordEl && typeof keywordEl.focus === 'function') {
        keywordEl.focus({ preventScroll: true });
      }
      checklistListDomCache.appliedSignature = appliedSignature;
    }

    function buildChecklistYearAccordion(yearGroup) {
      const unitCards = Array.isArray(yearGroup && yearGroup.units) ? yearGroup.units : [];
      const totalCount = unitCards.reduce((sum, group) => sum + Number(group.totalCount || group.items.length || 0), 0);
      const closedCount = unitCards.reduce((sum, group) => sum + Number(group.closedCount || 0), 0);
      const yearValue = String(yearGroup && yearGroup.year || '').trim();
      const showDelete = isAdmin() && yearValue && yearValue !== '未知年度';
      const deleteButton = showDelete
        ? '<button type="button" class="btn btn-sm btn-danger cl-year-delete" data-action="checklist.deleteYear" data-year="' + esc(yearValue) + '" title="刪除該年度紀錄">' + ic('trash-2', 'btn-icon-svg') + ' 刪除該年度紀錄</button>'
        : '';
      const body = unitCards.length
        ? unitCards.map((group) => {
            const groupId = 'cl-year-' + yearGroup.year + '-unit-' + group.unit.replace(/[^\w\u4e00-\u9fff]+/g, '-');
            const rows = group.items.map((item) => renderChecklistListRow(item)).join('');
            const groupClosed = Number(group.closedCount || 0);
            const groupTotal = Number(group.totalCount || group.items.length || 0);
            return '<details class="cl-unit-accordion" id="' + esc(groupId) + '" data-cl-year-key="' + esc(String(yearGroup.year || '').trim() || '未知年度') + '" data-cl-unit-key="' + esc(String(group.unit || '').trim()) + '"><summary class="cl-unit-summary"><div><div class="cl-unit-title">' + esc(group.unit) + '</div><div class="cl-unit-meta">已結案 ' + groupClosed + ' / ' + groupTotal + '</div></div><div class="cl-unit-summary-right"><span class="badge ' + (groupClosed === groupTotal && groupTotal > 0 ? 'badge-closed' : 'badge-pending') + '"><span class="badge-dot"></span>' + groupClosed + ' / ' + groupTotal + '</span><span class="cl-unit-toggle">' + ic('chevron-down', 'icon-sm') + '</span></div></summary><div class="cl-unit-body"><div class="table-wrapper" tabindex="0"><table>' + buildChecklistTableCaption('內稽檢核表') + '<thead><tr><th scope="col" class="record-id-head">編號</th><th scope="col">單位</th><th scope="col">填報者</th><th scope="col">檢核年度</th><th scope="col">狀態</th><th scope="col">達成率</th><th scope="col">填報時間</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></details>';
          }).join('')
        : '<div class="empty-state checklist-empty-state"><div class="empty-state-icon">' + ic('clipboard-list') + '</div><div class="empty-state-title">目前沒有檢核資料</div><div class="empty-state-desc">請先建立資料或切換篩選條件。</div></div>';
      return '<details class="cl-year-accordion" open data-cl-year-key="' + esc(yearValue || '未知年度') + '"><summary class="cl-year-summary"><div><div class="cl-year-title">' + esc(yearGroup.year === '未知年度' ? '未知年度' : yearGroup.year + ' 年') + '</div><div class="cl-year-meta">已結案 ' + closedCount + ' / ' + totalCount + '</div></div><div class="cl-year-summary-right"><span class="badge ' + (closedCount === totalCount && totalCount > 0 ? 'badge-closed' : 'badge-pending') + '"><span class="badge-dot"></span>' + closedCount + ' / ' + totalCount + '</span>' + deleteButton + '<span class="cl-unit-toggle">' + ic('chevron-down', 'icon-sm') + '</span></div></summary><div class="cl-year-body">' + body + '</div></details>';
    }

  async function renderChecklistList(options) {
    const opts = options || {};
    const renderGeneration = ++checklistListRenderGeneration;
    const useRemoteList = canUseRemoteChecklistPaging();
    const syncPromise = (opts.skipSync || useRemoteList)
      ? Promise.resolve()
      : scheduleDeferredPromise(() => syncChecklistsFromM365({ silent: true }), CHECKLIST_DEFERRED_SYNC_TIMEOUT_MS).catch((error) => {
        window.__ismsWarn('checklist list sync failed', error);
      });
    const localSnapshot = getChecklistListSnapshot(getVisibleChecklists());
    const years = localSnapshot.years;
    if (!checklistBrowseState.year || !years.includes(checklistBrowseState.year) && checklistBrowseState.year !== 'all') {
      checklistBrowseState.year = years.includes(String(new Date().getFullYear() - 1911)) ? String(new Date().getFullYear() - 1911) : (years[0] || 'all');
    }
    let checklists;
    let snapshot;
    let viewSnapshot;
    let remotePage = null;
    let listSummary;
    let remoteSummary = null;
    let renderedSummarySignature = '';
    const fillBtn = canFillChecklist() ? `<a href="#checklist-fill" class="btn btn-primary">${ic('edit-3', 'icon-sm')} 填報檢核表</a>` : '';
    const renderListShell = (summary, page) => {
      document.getElementById('app').innerHTML = `<div class="animate-in cl-list-page" data-checklist-route="list" data-checklist-route-state="shell">
      <div class="page-header checklist-list-header"><div><h1 class="page-title">內稽檢核表</h1><p class="page-subtitle">按年度與一級單位分層檢視所有填報紀錄，協助管理者快速掌握檢核狀況。</p></div><div class="page-header-actions">${fillBtn}</div></div>
      <div class="card cl-list-shell" data-checklist-route="list" data-checklist-route-state="shell">
        <div class="cl-list-toolbar-wrap">
          ${buildChecklistListFilters()}
          <div class="cl-year-tabs-shell">
          <div class="cl-year-tabs-label">年度頁籤</div>
          ${buildChecklistListYearTabs(years)}
        </div>
        </div>
        <div class="cl-list-summary-shell" data-checklist-list-summary>${renderChecklistListSummary(summary)}</div>
        <div class="cl-list-pager-shell" data-checklist-list-pager>${useRemoteList ? renderChecklistListPager(page) : ''}</div>
        <div class="cl-list-content" data-checklist-route="list" data-checklist-route-state="shell"><div class="cl-list-loading-shell">載入檢核表列表…</div></div>
      </div>
    </div>`;
    };
    const updateChecklistListShellChrome = (summary, page) => {
      const summaryEl = document.querySelector('[data-checklist-list-summary]');
      if (summaryEl) summaryEl.innerHTML = renderChecklistListSummary(summary);
      const pagerEl = document.querySelector('[data-checklist-list-pager]');
      if (pagerEl) pagerEl.innerHTML = useRemoteList ? renderChecklistListPager(page) : '';
    };
    if (useRemoteList) {
      const remoteFilters = normalizeChecklistRemoteFilters(opts.remoteFilters || {
        limit: checklistRemotePageState.filters.limit,
        offset: checklistRemotePageState.filters.offset,
        auditYear: checklistBrowseState.year,
        statusBucket: checklistBrowseState.status,
        q: checklistBrowseState.keyword
      });
      remoteSummary = opts.skipRemoteSummary
        ? null
        : readChecklistRemoteSummary(remoteFilters, !!opts.forceRemoteSummary);
      const shellItems = localSnapshot.items;
      const shellSnapshot = localSnapshot;
      const shellViewSnapshot = getChecklistListViewSnapshot(shellSnapshot.items);
      const shellSummary = normalizeChecklistRemoteSummary(
        remoteSummary || checklistRemotePageState.summary || null,
        checklistRemotePageState.total || shellSnapshot.items.length
      );
      const shellPage = normalizeChecklistRemotePage(null, remoteFilters, shellItems, shellSnapshot.items.length);
      checklists = shellItems;
      snapshot = shellSnapshot;
      viewSnapshot = shellViewSnapshot;
      listSummary = shellSummary;
      remotePage = shellPage;
      renderedSummarySignature = serializeChecklistRemoteSummary(shellSummary);
      renderListShell(shellSummary, shellPage);
      setChecklistListRouteState('ready');
      scheduleChecklistPostPaint(() => {
        if (renderGeneration !== checklistListRenderGeneration) return;
        if (!String(window.location.hash || '').startsWith('#checklist')) return;
        renderChecklistListContent(shellItems, shellSnapshot, shellViewSnapshot);
        syncChecklistListToolbarState();
        refreshIcons();
        bindCopyButtons();
      }, 0);
      const remotePagePromise = prefetchedRemotePageResult
        ? Promise.resolve(prefetchedRemotePageResult)
        : loadChecklistRemotePage(remoteFilters, { force: !!opts.forceRemotePage });
      remotePagePromise.then((remotePageResult) => {
        if (renderGeneration !== checklistListRenderGeneration) return;
        if (!String(window.location.hash || '').startsWith('#checklist')) return;
        checklistRemotePageState = {
          filters: remotePageResult.filters,
          page: remotePageResult.page,
          items: Array.isArray(remotePageResult.items) ? remotePageResult.items.slice() : [],
          summary: normalizeChecklistRemoteSummary(remotePageResult.summary, remotePageResult.total),
          total: remotePageResult.total,
          signature: getChecklistRemoteSignature(remotePageResult.filters)
        };
        remotePage = remotePageResult.page;
        checklists = checklistRemotePageState.items;
        listSummary = normalizeChecklistRemoteSummary(remoteSummary || checklistRemotePageState.summary, checklistRemotePageState.total);
        snapshot = getChecklistListSnapshot(checklists);
        viewSnapshot = getChecklistListViewSnapshot(snapshot.items);
        renderedSummarySignature = serializeChecklistRemoteSummary(listSummary);
        updateChecklistListShellChrome(listSummary, remotePage);
        renderChecklistListContent(checklists, snapshot, viewSnapshot);
        syncChecklistListToolbarState();
        refreshIcons();
        bindCopyButtons();
      }).catch((error) => {
        window.__ismsWarn('checklist list remote page load failed', error);
      });
    } else {
      snapshot = localSnapshot;
      viewSnapshot = getChecklistListViewSnapshot(snapshot.items);
      checklists = snapshot.items;
      listSummary = summarizeChecklistListItems(viewSnapshot.filtered);
      renderedSummarySignature = serializeChecklistRemoteSummary(listSummary);
      renderListShell(listSummary, null);
      setChecklistListRouteState('ready');
      scheduleChecklistPostPaint(() => {
        if (renderGeneration !== checklistListRenderGeneration) return;
        if (!String(window.location.hash || '').startsWith('#checklist')) return;
        renderChecklistListContent(checklists, snapshot, viewSnapshot);
        syncChecklistListToolbarState();
        refreshIcons();
        bindCopyButtons();
      }, 0);
    }
    if (!opts.skipSync && !useRemoteList && syncPromise && typeof syncPromise.then === 'function') {
      syncPromise.then(() => {
        if (!String(window.location.hash || '').startsWith('#checklist')) return;
        renderChecklistList({ skipSync: true });
      }).catch((error) => {
        window.__ismsWarn('checklist list background rerender failed', error);
      });
    }
    if (useRemoteList && !opts.skipRemoteSummary) {
      const shouldPrimeRemoteSummary = !!getChecklistRemoteSummaryClient() && (!!opts.forceRemoteSummary || !remoteSummary);
      if (shouldPrimeRemoteSummary) {
        primeChecklistRemoteSummary(checklistRemotePageState.filters, { force: !!opts.forceRemoteSummary }).then((nextSummary) => {
          if (!String(window.location.hash || '').startsWith('#checklist')) return;
          if (serializeChecklistRemoteSummary(nextSummary) === renderedSummarySignature) return;
          renderChecklistList({ skipSync: true });
        }).catch((error) => {
          window.__ismsWarn('checklist list remote summary sync failed', error);
        });
      } else if (!remoteSummary) {
        queueChecklistRemoteSummaryBootstrap(checklistRemotePageState.filters);
      }
    }

    const keywordEl = document.getElementById('cl-list-keyword');
    const statusEl = document.getElementById('cl-list-status');
    const yearTabs = document.querySelectorAll('[data-checklist-year]');
    const pageLimitEl = document.getElementById('cl-list-page-limit');
    let browseTimer = null;
    const rerenderRemoteChecklistPage = (nextFilters) => {
      renderChecklistList({
        skipSync: true,
        remoteFilters: normalizeChecklistRemoteFilters({
          ...(checklistRemotePageState.filters || {}),
          ...(nextFilters || {})
        })
      });
    };
    const scheduleRerender = () => {
      if (browseTimer) window.clearTimeout(browseTimer);
      browseTimer = window.setTimeout(() => {
        browseTimer = null;
        if (useRemoteList) {
          rerenderRemoteChecklistPage({
            limit: pageLimitEl && pageLimitEl.value ? pageLimitEl.value : checklistRemotePageState.filters.limit,
            offset: '0',
            auditYear: checklistBrowseState.year,
            statusBucket: checklistBrowseState.status,
            q: checklistBrowseState.keyword
          });
          return;
        }
        applyChecklistKeywordFilter();
      }, 120);
    };
    registerChecklistPageCleanup(() => {
      if (browseTimer) {
        window.clearTimeout(browseTimer);
        browseTimer = null;
      }
    });
    bindChecklistPageEvent(keywordEl, 'input', () => {
      checklistBrowseState.keyword = keywordEl.value;
      scheduleRerender();
    });
    bindChecklistPageEvent(statusEl, 'change', () => {
      checklistBrowseState.status = statusEl.value;
      if (useRemoteList) {
        rerenderRemoteChecklistPage({
          limit: pageLimitEl && pageLimitEl.value ? pageLimitEl.value : checklistRemotePageState.filters.limit,
          offset: '0',
          auditYear: checklistBrowseState.year,
          statusBucket: checklistBrowseState.status,
          q: checklistBrowseState.keyword
        });
        return;
      }
      renderChecklistListContent(checklists, snapshot, viewSnapshot);
      syncChecklistListToolbarState();
    });
    yearTabs.forEach((tab) => {
      bindChecklistPageEvent(tab, 'click', () => {
        checklistBrowseState.year = String(tab.dataset.checklistYear || 'all');
        if (useRemoteList) {
          rerenderRemoteChecklistPage({
            limit: pageLimitEl && pageLimitEl.value ? pageLimitEl.value : checklistRemotePageState.filters.limit,
            offset: '0',
            auditYear: checklistBrowseState.year,
            statusBucket: checklistBrowseState.status,
            q: checklistBrowseState.keyword
          });
          return;
        }
        renderChecklistListContent(checklists, snapshot, viewSnapshot);
        syncChecklistListToolbarState();
      });
    });
    if (useRemoteList) {
      const pager = getChecklistPagerModule();
      if (pager && typeof pager.bindPagerControls === 'function') {
        pager.bindPagerControls({
          idPrefix: 'cl-list',
          page: checklistRemotePageState.page,
          defaultLimit: CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT,
          onChange: (delta) => {
            rerenderRemoteChecklistPage({
              limit: String((delta && delta.limit) || checklistRemotePageState.page.limit || CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT),
              offset: String((delta && delta.offset) || 0),
              auditYear: checklistBrowseState.year,
              statusBucket: checklistBrowseState.status,
              q: checklistBrowseState.keyword
            });
          }
        });
      }
    }

    registerActionHandlers(document.getElementById('app'), {
      resetListFilters: function () {
        checklistBrowseState.keyword = '';
        checklistBrowseState.status = 'all';
        checklistBrowseState.year = String(new Date().getFullYear() - 1911);
        if (useRemoteList) {
          renderChecklistList({
            skipSync: true,
            remoteFilters: {
              limit: pageLimitEl && pageLimitEl.value ? pageLimitEl.value : CHECKLIST_REMOTE_PAGE_DEFAULT_LIMIT,
              offset: '0',
              auditYear: checklistBrowseState.year,
              statusBucket: checklistBrowseState.status,
              q: ''
            }
          });
          return;
        }
        renderChecklistListContent(checklists, snapshot, viewSnapshot);
        syncChecklistListToolbarState();
        applyChecklistKeywordFilter();
        const keywordEl = document.getElementById('cl-list-keyword');
        if (keywordEl && typeof keywordEl.focus === 'function') keywordEl.focus({ preventScroll: true });
      }
    });
  }

  // Render: Checklist Fill
  function buildChecklistItemBlock(item, saved, sectionIndex, editable = true) {
    const lockedAttr = editable ? '' : ' disabled';
    const radios = COMPLIANCE_OPTS.map((opt) => `<label class="cl-radio-label cl-radio-${COMPLIANCE_CLASSES[opt]}"><input type="radio" name="cl-${item.id}" value="${opt}" ${saved.compliance === opt ? 'checked' : ''}${lockedAttr}><span class="cl-radio-indicator"></span>${opt}</label>`).join('');
    return `<div class="cl-item${editable ? '' : ' cl-item--locked'}" id="cl-item-${item.id}" data-cl-item-id="${item.id}" data-cl-section-index="${sectionIndex}" tabindex="-1">
      <div class="cl-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span></div>
      <div class="cl-item-body">
        <div class="cl-compliance"><label class="form-label form-required">\u7b26\u5408\u7a0b\u5ea6</label><div class="cl-radio-group">${radios}</div></div>
        <div class="cl-fields">
          <div class="form-group"><label class="form-label">\u57f7\u884c\u60c5\u5f62\u8aaa\u660e</label><textarea class="form-textarea cl-textarea" id="cl-exec-${item.id}" placeholder="${esc(item.hint)}" rows="2"${editable ? '' : ' readonly'}>${esc(saved.execution || '')}</textarea></div>
          <div class="form-group"><label class="form-label">\u4f50\u8b49\u8cc7\u6599\u8aaa\u660e</label><textarea class="form-textarea cl-textarea" id="cl-evidence-${item.id}" placeholder="\u4f8b\u5982\u6587\u4ef6\u540d\u7a31\u3001\u756b\u9762\u622a\u5716\u3001\u8def\u5f91\u6216\u88dc\u5145\u8aaa\u660e" rows="2"${editable ? '' : ' readonly'}>${esc(saved.evidence || '')}</textarea></div>
          ${buildChecklistEvidenceUpload(item, saved, editable)}
        </div>
      </div>
    </div>`;
  }
  function buildChecklistSectionsHtml(existing, sectionState, editable = true) {
    const sections = Array.isArray(sectionState) ? sectionState : getChecklistSectionsState();
    return sections.map((sec, si) => {
      const itemsHtml = sec.items.map((item) => buildChecklistItemBlock(item, existing?.results?.[item.id] || {}, si, editable)).join('');
      const total = sec.items.length;
      const filled = sec.items.filter((item) => !!(existing?.results?.[item.id] && existing.results[item.id].compliance)).length;
      const done = total > 0 && filled === total;
      const badgeClass = done ? 'badge-closed' : 'badge-pending';
      const label = done ? '已完成' : `已填報 ${filled}/${total}`;
      const open = si === 0 ? 'open' : '';
      return `<details class="cl-section cl-section-accordion" id="cl-section-${si}" data-cl-section-index="${si}" ${open}>
        <summary class="cl-section-header">
          <span class="cl-section-num">${si + 1}</span>
          <span class="cl-section-title">${esc(sec.section)}</span>
          <span class="cl-section-progress"><span class="badge ${badgeClass}" data-cl-section-progress="${si}"><span class="badge-dot"></span>${esc(label)}</span></span>
        </summary>
        <div class="cl-section-body">${itemsHtml}</div>
      </details>`;
    }).join('');
  }

  function renderChecklistFill(id) {
    cleanupRenderedAttachmentUrls();
    if (!canFillChecklist()) { navigate('checklist'); toast('目前無法填報此檢核表。', 'error'); return; }

    const u = getChecklistAccessProfile(currentUser());
    const currentAuditYear = String(new Date().getFullYear() - 1911);
    const authorizedUnits = Array.isArray(u && u.authorizedUnits) ? u.authorizedUnits : [];
    const defaultScopedUnit = String((u && u.activeUnit) || (u && u.primaryUnit) || (u && u.unit) || '').trim();
    if (!id && u.role !== ROLES.ADMIN && defaultScopedUnit && authorizedUnits.length <= 1) {
      const duplicateChecklist = findExistingChecklistForUnitYear(defaultScopedUnit, currentAuditYear);
      if (duplicateChecklist) {
        toast('同一單位與年度已有檢核表，將直接開啟既有資料。', 'error');
        clearUnsavedChangesGuard();
        navigate(canEditChecklist(duplicateChecklist) ? ('checklist-fill/' + duplicateChecklist.id) : ('checklist-detail/' + duplicateChecklist.id));
        return;
      }
    }
    let existing = id ? getChecklist(id) : getLatestEditableChecklistDraft();
    if (id && !existing) { navigate('checklist'); toast('\u627e\u4e0d\u5230\u8981\u7de8\u4fee\u7684\u6aa2\u6838\u8868', 'error'); return; }

    const sectionState = getChecklistSectionsState();
    const sectionLookup = new Map();
    sectionState.forEach((sec, si) => {
      sec.items.forEach((item) => sectionLookup.set(item.id, si));
    });
    const selectedUnitCandidate = existing ? existing.unit : defaultScopedUnit;
    const selectedUnitParts = typeof splitUnitValue === 'function' ? splitUnitValue(selectedUnitCandidate) : { parent: '', child: '' };
    const selectedUnitGovernanceMode = getChecklistGovernanceState(selectedUnitCandidate).mode;

    const checklistUnitLocked = !isAdmin(u) && authorizedUnits.length <= 1;
    const checklistGovernanceLocked = !isAdmin(u) && selectedUnitGovernanceMode === 'consolidated' && !!(selectedUnitParts && selectedUnitParts.child);
    const checklistEditable = !checklistGovernanceLocked && (!existing || canEditChecklist(existing));
    if (existing && !canEditChecklist(existing) && !checklistGovernanceLocked) { navigate('checklist'); toast('\u9019\u4efd\u6aa2\u6838\u8868\u76ee\u524d\u4e0d\u53ef\u4fee\u6539', 'error'); return; }
    const selectedUnit = checklistUnitLocked ? (u.activeUnit || existing?.unit || '') : (existing ? existing.unit : defaultScopedUnit);
    const sectionsHtml = buildChecklistSectionsHtml(existing, sectionState, checklistEditable);
    const today = new Date().toISOString().split('T')[0];
    const totalItems = sectionState.reduce((sum, sec) => sum + sec.items.length, 0);
    const supervisorName = existing?.supervisorName || existing?.supervisor || '';
    const supervisorTitle = existing?.supervisorTitle || '';
    const signStatus = existing?.signStatus || 'draft';
    const signDate = existing?.signDate || '';
    const supervisorNote = existing?.supervisorNote || '';
    const sectionAnchorHtml = sectionState.map((sec, si) => `<button type="button" class="cl-anchor-link" data-cl-anchor-index="${si}"><span class="cl-anchor-index">${si + 1}</span><span class="cl-anchor-text">${esc(sec.section)}</span></button>`).join('');
    const checklistLockBanner = checklistGovernanceLocked
      ? `<div class="cl-checklist-lock-banner"><strong>目前為受控單位檢核表</strong><span>此表單已鎖定，僅可檢視或由授權人員調整。</span></div>`
      : '';
    const formActionsHtml = checklistEditable
      ? `<div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 送出檢核表</button><button type="button" class="btn btn-secondary" id="cl-save-draft" data-testid="checklist-save-draft">${ic('save', 'icon-sm')} 儲存草稿</button><a href="#checklist" class="btn btn-ghost">返回列表</a></div>`
      : `<div class="cl-checklist-lock-banner cl-checklist-lock-banner--inline"><strong>目前為受控單位檢核表</strong><span>此表單已鎖定，僅可檢視或由授權人員調整。</span></div><div class="form-actions"><a href="#checklist" class="btn btn-secondary">返回列表</a>${existing ? `<a href="#checklist-detail/${esc(existing.id)}" class="btn btn-primary">查看明細</a>` : ''}</div>`;

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header page-header--editor" data-checklist-route="fill" data-checklist-route-state="shell"><div><h1 class="page-title">${existing ? '\u7de8\u4fee\u6aa2\u6838\u8868' : '\u586b\u5831\u6aa2\u6838\u8868'}</h1><p class="page-subtitle">\u53d7\u7a3d\u55ae\u4f4d\u9810\u8a2d\u5e36\u5165\u76ee\u524d\u767b\u5165\u55ae\u4f4d\uff0c\u4f46\u53ef\u4f9d\u5be6\u969b\u586b\u5831\u9700\u6c42\u5207\u63db\u5230\u5176\u4ed6\u55ae\u4f4d\u3002\u8349\u7a3f\u53ef\u96a8\u6642\u66ab\u5b58\uff0c\u6b63\u5f0f\u9001\u51fa\u5f8c\u9396\u5b9a\u3002</p></div><a href="#checklist" class="btn btn-secondary">\u8fd4\u56de\u5217\u8868</a></div>
      <div class="editor-shell editor-shell--checklist">
        <section class="editor-main">
          <div class="card editor-card"><form id="checklist-form" data-checklist-route="fill" data-checklist-route-state="shell" data-testid="checklist-form">
            ${checklistLockBanner}
            <div class="section-header">${ic('info', 'icon-sm')} \u57fa\u672c\u8cc7\u6599</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">\u53d7\u7a3d\u55ae\u4f4d</label>${buildUnitCascadeControl('cl-unit', selectedUnit, checklistUnitLocked || checklistGovernanceLocked, true)}</div>
              <div class="form-group"><label class="form-label form-required">\u586b\u5831\u4eba\u54e1</label><input type="text" class="form-input" id="cl-filler" value="${esc(u.name)}" readonly></div>
              <div class="form-group"><label class="form-label form-required">填報日期</label><input type="date" class="form-input" id="cl-date" value="${esc(toDateInputValue(existing?.fillDate) || today)}" ${checklistEditable ? 'required' : 'disabled'}></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">\u7a3d\u6838\u5e74\u5ea6</label><input type="text" class="form-input" id="cl-year" inputmode="numeric" maxlength="3" pattern="\\d{3}" value="${existing ? esc(existing.auditYear) : String(getChecklistCurrentAuditYear())}" ${checklistEditable ? 'required' : 'disabled'}></div>
              <div class="form-group"><label class="form-label form-required">\u6b0a\u8cac\u4e3b\u7ba1\u59d3\u540d</label><input type="text" class="form-input" id="cl-supervisor-name" value="${esc(supervisorName)}" placeholder="\u4f8b\u5982 \u8cc7\u8a0a\u7db2\u8def\u7d44\u7d44\u9577" ${checklistEditable ? 'required' : 'disabled'}></div>
              <div class="form-group"><label class="form-label form-required">\u4e3b\u7ba1\u8077\u7a31</label><input type="text" class="form-input" id="cl-supervisor-title" value="${esc(supervisorTitle)}" placeholder="\u4f8b\u5982 \u7d44\u9577 / \u4e3b\u4efb" ${checklistEditable ? 'required' : 'disabled'}></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">\u7c3d\u6838\u72c0\u614b</label><select class="form-select" id="cl-sign-status" ${checklistEditable ? 'required' : 'disabled'}><option value="\u5f85\u7c3d\u6838" ${signStatus === '\u5f85\u7c3d\u6838' ? 'selected' : ''}>\u5f85\u7c3d\u6838</option><option value="\u5df2\u7c3d\u6838" ${signStatus === '\u5df2\u7c3d\u6838' ? 'selected' : ''}>\u5df2\u7c3d\u6838</option></select></div>
              <div class="form-group"><label class="form-label form-required">簽核日期</label><input type="date" class="form-input" id="cl-sign-date" ${checklistEditable ? 'required' : 'disabled'} value="${esc(toDateInputValue(signDate))}"></div>
              <div class="form-group"><label class="form-label">\u7c3d\u6838\u5099\u8a3b</label><input type="text" class="form-input" id="cl-supervisor-note" value="${esc(supervisorNote)}" placeholder="\u53ef\u88dc\u5145\u4e3b\u7ba1\u610f\u898b\u6216\u8ffd\u8e64\u8aaa\u660e"></div>
            </div>
            <div class="cl-progress-bar-wrap"><div class="cl-progress-label">\u586b\u5831\u9032\u5ea6</div><div class="cl-progress-bar"><div class="cl-progress-fill" id="cl-progress-fill" style="width:0%"></div></div><span class="cl-progress-text" id="cl-progress-text">0 / ${totalItems}</span></div>
            <div class="cl-draft-status" id="cl-draft-status">${existing && isChecklistDraftStatus(existing.status) ? `\u8349\u7a3f\u4e0a\u6b21\u5132\u5b58\uff1a${fmtTime(existing.updatedAt || existing.createdAt)}` : '\u5c1a\u672a\u5efa\u7acb\u8349\u7a3f'}</div>
            ${sectionsHtml}
            ${formActionsHtml}
          </form></div>
        </section>
        <aside class="editor-aside">
          <details class="editor-mobile-summary editor-mobile-summary--checklist" id="cl-mobile-summary" open>
            <summary class="editor-mobile-summary-toggle">${ic('layout-dashboard', 'icon-sm')} \u586b\u5831\u6458\u8981</summary>
            <div class="editor-mobile-summary-body">
              <div class="editor-sticky">
                <div class="editor-side-card checklist-nav-card">
                  <div class="editor-side-title">填報目錄</div>
                  <div class="cl-anchor-list">${sectionAnchorHtml}</div>
                </div>
                <div class="editor-side-card editor-progress-card">
                  <div class="editor-side-kicker">\u5167\u7a3d\u6aa2\u6838</div>
                  <div class="editor-side-title">\u5373\u6642\u9032\u5ea6</div>
                  <div class="editor-progress-meta"><div class="editor-progress-value" id="cl-side-progress-value">0%</div><div class="editor-progress-caption" id="cl-side-progress-text">\u5df2\u5b8c\u6210 0 / ${totalItems}</div></div>
                  <div class="editor-progress-track"><div class="editor-progress-fill" id="cl-side-progress-fill" style="width:0%"></div></div>
                  <div class="editor-stat-grid">
                    <div class="editor-stat-pill"><span class="editor-stat-pill-label">\u5f85\u5b8c\u6210\u9805\u76ee</span><strong class="editor-stat-pill-value" id="cl-side-remaining">${totalItems}</strong></div>
                    <div class="editor-stat-pill"><span class="editor-stat-pill-label">\u7a3d\u6838\u5e74\u5ea6</span><strong class="editor-stat-pill-value" id="cl-side-year">${existing ? esc(existing.auditYear) : String(new Date().getFullYear() - 1911)}</strong></div>
                  </div>
                  <div class="editor-summary-list">
                    <div class="editor-summary-item"><span>\u53d7\u7a3d\u55ae\u4f4d</span><strong id="cl-side-unit">${esc(selectedUnit || '\u2014')}</strong></div>
                    <div class="editor-summary-item"><span>\u586b\u5831\u65e5\u671f</span><strong id="cl-side-date">${fmt(existing ? existing.fillDate : today)}</strong></div>
                    <div class="editor-summary-item"><span>\u7c3d\u6838\u72c0\u614b</span><strong id="cl-side-sign-status">${esc(signStatus)}</strong></div>
                  </div>
                  <button type="button" class="btn btn-secondary checklist-draft-inline" id="cl-save-draft-inline" data-testid="checklist-save-draft-inline">${ic('save', 'icon-sm')} \u7acb\u5373\u66ab\u5b58\u8349\u7a3f</button>
                </div>
                <div class="editor-side-card">
                  <div class="editor-side-title">\u5224\u5b9a\u7d71\u8a08</div>
                  <div class="editor-legend-list">
                    <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--green"></span>\u7b26\u5408</span><strong id="cl-side-conform">0</strong></div>
                    <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--amber"></span>\u90e8\u5206\u7b26\u5408</span><strong id="cl-side-partial">0</strong></div>
                    <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--red"></span>\u4e0d\u7b26\u5408</span><strong id="cl-side-nonconform">0</strong></div>
                    <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--slate"></span>\u4e0d\u9069\u7528</span><strong id="cl-side-na">0</strong></div>
                  </div>
                </div>
                <div class="editor-side-card">
                  <div class="editor-side-title">\u586b\u5831\u63d0\u9192</div>
                  <div class="editor-note-list">
                    <div class="editor-note-item"><span class="editor-note-dot"></span><span>\u6bcf\u4e00\u984c\u90fd\u8981\u5148\u9078\u64c7\u7b26\u5408\u7a0b\u5ea6\uff0c\u518d\u88dc\u5145\u57f7\u884c\u60c5\u5f62\u8207\u4f50\u8b49\u8aaa\u660e\uff0c\u624d\u80fd\u6b63\u78ba\u7d71\u8a08\u5b8c\u6210\u7387\u3002</span></div>
                    <div class="editor-note-item"><span class="editor-note-dot"></span><span>\u82e5\u5224\u5b9a\u70ba\u90e8\u5206\u7b26\u5408\u6216\u4e0d\u7b26\u5408\uff0c\u8acb\u5728\u57f7\u884c\u60c5\u5f62\u4e2d\u8aaa\u660e\u539f\u56e0\u3001\u98a8\u96aa\u8207\u5f8c\u7e8c\u6539\u5584\u65b9\u5411\u3002</span></div>
                    <div class="editor-note-item"><span class="editor-note-dot"></span><span>\u5b8c\u6210\u5f8c\u8acb\u78ba\u8a8d\u7c3d\u6838\u8cc7\u8a0a\u8207\u9644\u4ef6\u5df2\u9f4a\u5099\uff0c\u518d\u6b63\u5f0f\u9001\u51fa\uff1b\u9001\u51fa\u5f8c\u8349\u7a3f\u5c07\u9396\u5b9a\u3002</span></div>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </aside>
      </div>
      <button type="button" class="btn btn-secondary checklist-draft-floating" id="cl-save-draft-floating" data-testid="checklist-save-draft-floating">${ic('save', 'icon-sm')} \u66ab\u5b58\u8349\u7a3f</button>
    </div>`;
    refreshIcons();
    applyTestIds({
      'cl-filler': 'checklist-filler',
      'cl-date': 'checklist-date',
      'cl-year': 'checklist-year',
      'cl-supervisor-name': 'checklist-supervisor-name',
      'cl-supervisor-title': 'checklist-supervisor-title',
      'cl-sign-status': 'checklist-sign-status',
      'cl-sign-date': 'checklist-sign-date',
      'cl-supervisor-note': 'checklist-supervisor-note'
    });
    applySelectorTestIds([
      { selector: '#checklist-form button[type="submit"]', testId: 'checklist-submit' }
    ]);
    initUnitCascade('cl-unit', selectedUnit, { disabled: checklistUnitLocked, registerCleanup: registerChecklistPageCleanup });
    const checklistForm = document.getElementById('checklist-form');
    const evidenceFilesState = new Map();
    getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
      evidenceFilesState.set(item.id, getChecklistEvidenceFiles(existing?.results?.[item.id] || {}));
    }));
    clearUnsavedChangesGuard();

    function markChecklistDirty() {
      setUnsavedChangesGuard(true, '檢核表內容已變更，請記得儲存。');
    }

    function syncChecklistMeta() {
      document.getElementById('cl-side-unit').textContent = document.getElementById('cl-unit').value || '未填寫';
      document.getElementById('cl-side-date').textContent = document.getElementById('cl-date').value ? fmt(document.getElementById('cl-date').value) : '未填寫';
      document.getElementById('cl-side-year').textContent = normalizeChecklistAuditYearValue(document.getElementById('cl-year').value) || '未填寫';
      document.getElementById('cl-side-sign-status').textContent = document.getElementById('cl-sign-status').value || '草稿';
    }

    function getChecklistOwnerId() {
      const unitValue = checklistUnitLocked ? (u.activeUnit || document.getElementById('cl-unit').value) : document.getElementById('cl-unit').value;
      const fillDateValue = document.getElementById('cl-date').value;
      const auditYearValue = requireChecklistAuditYearValue(document.getElementById('cl-year').value);
      return existing ? existing.id : generateChecklistIdForYear(unitValue, auditYearValue, fillDateValue);
    }

    function renderChecklistEvidenceFiles(itemId, editable) {
      const target = document.getElementById(editable ? `cl-files-${itemId}` : `cl-detail-files-${itemId}`);
      if (!target) return;
      renderAttachmentList(target, evidenceFilesState.get(itemId) || [], {
        editable,
        emptyText: editable ? '\u5c1a\u672a\u4e0a\u50b3\u4f50\u8b49\u6a94' : '',
        emptyHtml: editable ? undefined : '',
        fileIconHtml: '<div class="file-pdf-icon">' + ic('file-box') + '</div>',
        itemClass: 'file-preview-item checklist-file-card',
        actionsClass: 'checklist-file-actions',
        onRemove: function (index) {
          const list = evidenceFilesState.get(itemId) || [];
          const removed = list.splice(Number(index), 1)[0];
          evidenceFilesState.set(itemId, list);
          revokeTransientUploadEntry(removed);
          const input = document.getElementById(`cl-file-${itemId}`);
          if (input) input.value = '';
          markChecklistDirty();
          renderChecklistEvidenceFiles(itemId, true);
        }
      });
      refreshIcons();
    }

    function initializeChecklistEvidenceInputs(editable = true) {
      getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
        renderChecklistEvidenceFiles(item.id, !!editable);
        if (!editable) return;
        const input = document.getElementById(`cl-file-${item.id}`);
        if (!input) return;
        bindChecklistPageEvent(input, 'change', function (event) {
          const currentFiles = evidenceFilesState.get(item.id) || [];
          const batch = prepareUploadBatch(currentFiles, event.target.files, {
            fileLabel: `${item.id} \u4f50\u8b49\u6a94`,
            maxSize: 5 * 1024 * 1024,
            maxSizeLabel: '5MB',
            allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
            allowedMimeTypes: ['image/*', 'application/pdf']
          });
          batch.errors.forEach((message) => toast(message, 'error'));
          batch.accepted.forEach(({ file, meta }) => {
            currentFiles.push(createTransientUploadEntry(file, meta, {
              prefix: 'chk',
              scope: 'checklist-evidence',
              ownerId: getChecklistOwnerId(),
              recordType: 'checklist-evidence'
            }));
          });
          evidenceFilesState.set(item.id, currentFiles);
          event.target.value = '';
          if (batch.accepted.length) markChecklistDirty();
          renderChecklistEvidenceFiles(item.id, true);
        });
      }));
    }

    function updateChecklistDraftStatus(item) {
      const statusEl = document.getElementById('cl-draft-status');
      if (!statusEl) return;
      if (item && isChecklistDraftStatus(item.status)) {
        statusEl.textContent = `\u8349\u7a3f\u4e0a\u6b21\u5132\u5b58\uff1a${fmtTime(item.updatedAt || item.createdAt)}`;
        statusEl.classList.add('is-saved');
      } else if (item) {
        statusEl.textContent = `\u6700\u5f8c\u66f4\u65b0\uff1a${fmtTime(item.updatedAt || item.createdAt)}`;
        statusEl.classList.add('is-saved');
      } else {
        statusEl.textContent = '\u5c1a\u672a\u5efa\u7acb\u8349\u7a3f';
        statusEl.classList.remove('is-saved');
      }
    }

    function revealChecklistItem(itemId) {
      const itemEl = document.getElementById(`cl-item-${itemId}`);
      if (!itemEl) return;
      const sectionIndex = sectionLookup.get(itemId);
      if (Number.isInteger(sectionIndex)) {
        const sectionEl = document.getElementById(`cl-section-${sectionIndex}`);
        if (sectionEl && !sectionEl.open) sectionEl.open = true;
      }
      itemEl.classList.add('is-highlighted');
      itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusTarget = itemEl.querySelector('input[type="radio"], textarea, input:not([type="hidden"]), select');
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true });
      }
      const highlightTimer = window.setTimeout(() => itemEl.classList.remove('is-highlighted'), 2200);
      registerChecklistPageCleanup(() => {
        window.clearTimeout(highlightTimer);
        itemEl.classList.remove('is-highlighted');
      });
    }

    function updateProgress() {
      let filled = 0;
      const counts = { [COMPLIANCE_OPTS[0]]: 0, [COMPLIANCE_OPTS[1]]: 0, [COMPLIANCE_OPTS[2]]: 0, [COMPLIANCE_OPTS[3]]: 0 };
      sectionState.forEach((sec, sectionIndex) => {
        let sectionFilled = 0;
        sec.items.forEach((item) => {
          const selected = document.querySelector(`input[name="cl-${item.id}"]:checked`);
          if (!selected) return;
          filled += 1;
          sectionFilled += 1;
          if (counts[selected.value] !== undefined) counts[selected.value] += 1;
        });
        const sectionProgress = document.querySelector(`[data-cl-section-progress="${sectionIndex}"]`);
        if (sectionProgress) {
          const total = sec.items.length;
          const done = total > 0 && sectionFilled === total;
          sectionProgress.classList.toggle('badge-closed', done);
          sectionProgress.classList.toggle('badge-pending', !done);
          sectionProgress.innerHTML = '<span class="badge-dot"></span>' + (done ? '已完成' : `已填報 ${sectionFilled}/${total}`);
        }
      });
      const pct = totalItems > 0 ? Math.round((filled / totalItems) * 100) : 0;
      document.getElementById('cl-progress-fill').style.width = pct + '%';
      document.getElementById('cl-progress-text').textContent = filled + ' / ' + totalItems;
      document.getElementById('cl-side-progress-value').textContent = pct + '%';
      document.getElementById('cl-side-progress-text').textContent = '已填報 ' + filled + ' / ' + totalItems;
      document.getElementById('cl-side-progress-fill').style.width = pct + '%';
      document.getElementById('cl-side-remaining').textContent = String(totalItems - filled);
      document.getElementById('cl-side-conform').textContent = String(counts[COMPLIANCE_OPTS[0]]);
      document.getElementById('cl-side-partial').textContent = String(counts[COMPLIANCE_OPTS[1]]);
      document.getElementById('cl-side-nonconform').textContent = String(counts[COMPLIANCE_OPTS[2]]);
      document.getElementById('cl-side-na').textContent = String(counts[COMPLIANCE_OPTS[3]]);
    }

    async function collectData(status) {
      const results = {};
      let conform = 0, partial = 0, nonConform = 0, na = 0, total = 0;
      const ownerId = getChecklistOwnerId();
      getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
        const sel = document.querySelector(`input[name="cl-${item.id}"]:checked`);
        const compliance = sel ? sel.value : '';
        results[item.id] = {
          compliance,
          execution: document.getElementById(`cl-exec-${item.id}`).value.trim(),
          evidence: document.getElementById(`cl-evidence-${item.id}`).value.trim()
        };
        total += 1;
        if (compliance === COMPLIANCE_OPTS[0]) conform += 1;
        else if (compliance === COMPLIANCE_OPTS[1]) partial += 1;
        else if (compliance === COMPLIANCE_OPTS[2]) nonConform += 1;
        else if (compliance === COMPLIANCE_OPTS[3]) na += 1;
      }));
      for (const item of getChecklistSectionsState().flatMap((sec) => sec.items)) {
        const persistedFiles = await persistUploadedEntries(evidenceFilesState.get(item.id) || [], {
          prefix: 'chk',
          scope: 'checklist-evidence',
          ownerId,
          recordType: 'checklist-evidence'
        });
        evidenceFilesState.set(item.id, persistedFiles);
        results[item.id].evidenceFiles = persistedFiles;
      }
      const now = new Date().toISOString();
      const supervisorNameValue = document.getElementById('cl-supervisor-name').value.trim();
      const supervisorTitleValue = document.getElementById('cl-supervisor-title').value.trim();
      const unitValue = checklistUnitLocked ? (u.activeUnit || document.getElementById('cl-unit').value) : document.getElementById('cl-unit').value;
      const fillDateValue = document.getElementById('cl-date').value;
      const auditYearValue = requireChecklistAuditYearValue(document.getElementById('cl-year').value);
      return {
        id: existing ? existing.id : generateChecklistIdForYear(unitValue, auditYearValue, fillDateValue),
        unit: unitValue,
        fillerName: u.name,
        fillerUsername: u.username,
        fillDate: fillDateValue,
        auditYear: auditYearValue,
        supervisor: supervisorNameValue,
        supervisorName: supervisorNameValue,
        supervisorTitle: supervisorTitleValue,
        signStatus: document.getElementById('cl-sign-status').value,
        signDate: document.getElementById('cl-sign-date').value || '',
        supervisorNote: document.getElementById('cl-supervisor-note').value.trim(),
        results,
        summary: { total, conform, partial, nonConform, na },
        status,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now
      };
    }

    function validateChecklistMeta() {
      const requiredMeta = [
        { el: document.getElementById('cl-unit'), label: '\u53d7\u7a3d\u55ae\u4f4d' },
        { el: document.getElementById('cl-date'), label: '\u586b\u5831\u65e5\u671f' },
        { el: document.getElementById('cl-year'), label: '\u7a3d\u6838\u5e74\u5ea6' },
        { el: document.getElementById('cl-supervisor-name'), label: '\u6b0a\u8cac\u4e3b\u7ba1\u59d3\u540d' },
        { el: document.getElementById('cl-supervisor-title'), label: '\u4e3b\u7ba1\u8077\u7a31' },
        { el: document.getElementById('cl-sign-status'), label: '\u7c3d\u6838\u72c0\u614b' },
        { el: document.getElementById('cl-sign-date'), label: '\u7c3d\u6838\u65e5\u671f' }
      ];
      return requiredMeta.find(({ el }) => !String(el && el.value || '').trim()) || null;
    }

    function replaceChecklistDraftRoute(id) {
      if (typeof window === 'undefined' || !window.history || !id) return;
      const nextHash = '#checklist-fill/' + encodeURIComponent(id);
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    }

    async function saveChecklistDraft() {
      await runWithBusyState('\u6b63\u5728\u5132\u5b58\u6aa2\u6838\u8868\u8349\u7a3f\u2026', async function () {
        const metaError = validateChecklistMeta();
        if (metaError) {
          toast(`\u8acb\u5b8c\u6574\u586b\u5beb${metaError.label}`, 'error');
          metaError.el.focus();
          return;
        }
        const data = await collectData('\u8349\u7a3f');
        const duplicateChecklist = findExistingChecklistForUnitYear(data.unit, data.auditYear, existing?.id);
        if (duplicateChecklist) {
          toast('\u672c\u5e74\u5ea6\u5df2\u5b58\u5728\u6aa2\u6838\u8868\uff0c\u8acb\u81f3\u5217\u8868\u7e7c\u7e8c\u7de8\u8f2f\u6216\u67e5\u770b\uff0c\u52ff\u91cd\u8907\u65b0\u589e\u3002', 'error');
          clearUnsavedChangesGuard();
          navigate(canEditChecklist(duplicateChecklist) ? ('checklist-fill/' + duplicateChecklist.id) : ('checklist-detail/' + duplicateChecklist.id));
          return;
        }
        const result = await submitChecklistDraft(data);
        dispatchChecklistCacheInvalidationScopes(['checklists-list', 'checklists-summary'], 'checklist-draft-save');
        existing = result && result.item ? result.item : (getChecklist(data.id) || data);
        debugFlow('checklist', 'draft saved', { id: data.id, unit: data.unit, status: data.status });
        updateChecklistDraftStatus(existing);
        clearUnsavedChangesGuard();
        if (result && result.warning) toast(result.warning, 'info');
        toast(`\u8349\u7a3f ${data.id} \u5df2\u66ab\u5b58`);
        replaceChecklistDraftRoute(data.id);
      });
    }

    document.querySelectorAll('.cl-radio-group input').forEach((radio) => bindChecklistPageEvent(radio, 'change', updateProgress));
    document.querySelectorAll('[data-cl-anchor-index]').forEach((button) => {
      bindChecklistPageEvent(button, 'click', () => {
        const index = Number(button.dataset.clAnchorIndex);
        const sectionEl = document.getElementById(`cl-section-${index}`);
        if (!sectionEl) return;
        sectionEl.open = true;
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    bindChecklistPageEvent(document.getElementById('cl-unit'), 'change', syncChecklistMeta);
    bindChecklistPageEvent(document.getElementById('cl-date'), 'change', syncChecklistMeta);
    bindChecklistPageEvent(document.getElementById('cl-year'), 'input', () => {
      const yearInput = document.getElementById('cl-year');
      if (yearInput) {
        yearInput.value = String(yearInput.value || '').replace(/[^\d]/g, '').slice(0, 3);
      }
      syncChecklistMeta();
    });
    bindChecklistPageEvent(document.getElementById('cl-sign-status'), 'change', syncChecklistMeta);

    const clDateInput = document.getElementById('cl-date');
    const clYearInput = document.getElementById('cl-year');
    function syncAuditYearByDate() {
      const val = clDateInput.value;
      if (!val) return;
      const year = Number(val.split('-')[0]);
      if (Number.isFinite(year) && year >= 1911) clYearInput.value = String(year - 1911);
      syncChecklistMeta();
    }
    bindChecklistPageEvent(clDateInput, 'change', syncAuditYearByDate);
    if (!existing) syncAuditYearByDate();
    syncChecklistMeta();
    updateProgress();
    updateChecklistDraftStatus(existing);
    initializeChecklistEvidenceInputs(checklistEditable);

    bindChecklistPageEvent(checklistForm, 'submit', async (event) => {
      event.preventDefault();
      if (!checklistEditable) {
        toast('目前此檢核表僅供檢視，無法送出。', 'info');
        return;
      }
      await runWithBusyState('\u6b63\u5728\u9001\u51fa\u6aa2\u6838\u8868\u2026', async function () {
        debugFlow('checklist', 'submit start', { id: existing?.id || null, unit: document.getElementById('cl-unit').value });
        const missing = [];
        sectionState.forEach((sec) => sec.items.forEach((item) => {
          if (!document.querySelector(`input[name="cl-${item.id}"]:checked`)) missing.push(item.id);
        }));
        if (missing.length > 0) {
          debugFlow('checklist', 'submit blocked by unanswered items', { count: missing.length, first: missing[0] });
          toast(`\u4ecd\u6709 ${missing.length} \u500b\u67e5\u6aa2\u9805\u76ee\u5c1a\u672a\u586b\u7b54`, 'error');
          revealChecklistItem(missing[0]);
          return;
        }
        const missingMeta = validateChecklistMeta();
        if (missingMeta) {
          debugFlow('checklist', 'submit blocked by metadata', { field: missingMeta.label });
          toast(`\u8acb\u5b8c\u6574\u586b\u5beb${missingMeta.label}`, 'error');
          missingMeta.el.focus();
          return;
        }
        const data = await collectData('\u5df2\u9001\u51fa');
        const duplicateChecklist = findExistingChecklistForUnitYear(data.unit, data.auditYear, existing?.id);
        if (duplicateChecklist) {
          toast('\u672c\u5e74\u5ea6\u5df2\u5b58\u5728\u6aa2\u6838\u8868\uff0c\u8acb\u81f3\u5217\u8868\u7e7c\u7e8c\u7de8\u8f2f\u6216\u67e5\u770b\uff0c\u52ff\u91cd\u8907\u65b0\u589e\u3002', 'error');
          navigate(canEditChecklist(duplicateChecklist) ? ('checklist-fill/' + duplicateChecklist.id) : ('checklist-detail/' + duplicateChecklist.id));
          return;
        }
        const result = await submitChecklistForm(data);
        dispatchChecklistCacheInvalidationScopes(['checklists-list', 'checklists-summary'], 'checklist-submit');
        existing = result && result.item ? result.item : (getChecklist(data.id) || data);
        debugFlow('checklist', 'submit success', { id: data.id, unit: data.unit, status: data.status });
        updateChecklistDraftStatus(existing);
        clearUnsavedChangesGuard();
        toast(`\u6aa2\u6838\u8868 ${data.id} \u5df2\u6b63\u5f0f\u9001\u51fa`);
        navigate('checklist-detail/' + data.id);
      });
    });

    bindChecklistPageEvent(checklistForm, 'input', markChecklistDirty);
    bindChecklistPageEvent(checklistForm, 'change', markChecklistDirty);

    if (checklistEditable) {
      bindChecklistPageEvent(document.getElementById('cl-save-draft'), 'click', saveChecklistDraft);
      bindChecklistPageEvent(document.getElementById('cl-save-draft-inline'), 'click', saveChecklistDraft);
      bindChecklistPageEvent(document.getElementById('cl-save-draft-floating'), 'click', saveChecklistDraft);
    }
    setChecklistRouteState('fill', 'ready');
  }

  function renderChecklistDetail(id) {
    cleanupRenderedAttachmentUrls();
    const cl = getChecklist(id);
    if (!cl) {
      document.getElementById('app').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ic('help-circle', 'icon-lg')}</div><div class="empty-state-title">找不到檢核表</div><a href="#checklist" class="btn btn-primary checklist-detail-back-btn">返回列表</a></div>`;
      return;
    }
    if (!canAccessChecklist(cl)) { navigate('checklist'); toast('目前無法檢視此檢核表。', 'error'); return; }

    const s = cl.summary || { total: 0, conform: 0, partial: 0, nonConform: 0, na: 0 };
    const applicable = Math.max((s.total || 0) - (s.na || 0), 0);
    const applicableRate = applicable > 0 ? Math.round(((s.conform || 0) / applicable) * 100) : 0;
    const R = 50;
    const C = 2 * Math.PI * R;
    const vals = [
      { label: COMPLIANCE_OPTS[0], count: s.conform || 0, color: COMPLIANCE_COLORS[COMPLIANCE_OPTS[0]] },
      { label: COMPLIANCE_OPTS[1], count: s.partial || 0, color: COMPLIANCE_COLORS[COMPLIANCE_OPTS[1]] },
      { label: COMPLIANCE_OPTS[2], count: s.nonConform || 0, color: COMPLIANCE_COLORS[COMPLIANCE_OPTS[2]] },
      { label: COMPLIANCE_OPTS[3], count: s.na || 0, color: COMPLIANCE_COLORS[COMPLIANCE_OPTS[3]] }
    ];

    let segs = '';
    let off = 0;
    if ((s.total || 0) > 0) {
      vals.forEach((v) => {
        if (!v.count) return;
        const len = v.count / s.total * C;
        segs += `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${v.color}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`;
        off += len;
      });
    } else {
      segs = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="#e2e8f0" stroke-width="16"/>`;
    }

    const svg = `<svg viewBox="0 0 120 120" class="cl-donut">${segs}<text x="60" y="56" text-anchor="middle" fill="#0f172a" font-size="18" font-weight="700" font-family="Inter">${applicableRate}%</text><text x="60" y="72" text-anchor="middle" fill="#94a3b8" font-size="8" font-weight="500" font-family="Inter">適用率</text></svg>`;
    const legend = vals.map((v) => `<div class="cl-legend-item"><span class="cl-legend-dot" style="background:${v.color}"></span>${v.label}<span class="cl-legend-count">${v.count}</span></div>`).join('');

    let sectDetail = '';
    getChecklistSectionsState().forEach((sec) => {
      let rows = '';
      sec.items.forEach((item) => {
        const r = cl.results?.[item.id] || {};
        const comp = r.compliance || '不適用';
        const compCls = COMPLIANCE_CLASSES[comp] || '';
        rows += `<div class="cl-detail-item"><div class="cl-detail-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span><span class="cl-compliance-badge cl-badge-${compCls}">${esc(comp)}</span></div>`;
        if (r.execution) rows += `<div class="cl-detail-field"><span class="cl-detail-label">執行情形：</span>${esc(r.execution)}</div>`;
        if (r.evidence) rows += `<div class="cl-detail-field"><span class="cl-detail-label">佐證說明：</span>${esc(r.evidence)}</div>`;
        if (Array.isArray(r.evidenceFiles) && r.evidenceFiles.length) rows += `<div class="cl-detail-field cl-detail-field--files"><span class="cl-detail-label">佐證檔案：</span>${buildChecklistEvidenceReadonlySlot(item.id)}</div>`;
        rows += '</div>';
      });
      sectDetail += `<div class="cl-detail-section"><div class="cl-detail-section-title">${esc(sec.section)}</div>${rows}</div>`;
    });

    const issues = [];
    getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
      const r = cl.results?.[item.id] || {};
      if (r.compliance === COMPLIANCE_OPTS[2] || r.compliance === COMPLIANCE_OPTS[1]) {
        issues.push({ id: item.id, text: item.text, compliance: r.compliance, execution: r.execution || '' });
      }
    }));
    const issueHtml = issues.length ? `<div class="card checklist-issue-card"><div class="section-header">${ic('alert-triangle', 'icon-sm')} 發現 ${issues.length} 個問題</div>${issues.map((iss) => `<div class="cl-issue-item"><span class="cl-compliance-badge cl-badge-${COMPLIANCE_CLASSES[iss.compliance]}">${iss.compliance}</span><span class="cl-item-id">${iss.id}</span> ${esc(iss.text)}${iss.execution ? `<div class="cl-issue-note">${esc(iss.execution)}</div>` : ''}</div>`).join('')}</div>` : '';
    const statusCls = normalizeChecklistStatus(cl.status) === CHECKLIST_STATUS_SUBMITTED ? 'badge-closed' : 'badge-pending';

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="detail-header"><div>
        <div class="detail-id detail-id-with-copy"><span>${esc(cl.id)} / ${esc(cl.auditYear)} 年</span>${renderCopyIdButton(cl.id, '複製編號')}</div>
        <h1 class="detail-title">內稽檢核表 / ${esc(cl.unit)}</h1>
        <div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">${ic('user', 'icon-xs')}</span>${esc(cl.fillerName)}</span><span class="detail-meta-item"><span class="detail-meta-icon">${ic('calendar', 'icon-xs')}</span>${fmt(cl.fillDate)}</span><span class="badge ${statusCls}"><span class="badge-dot"></span>${esc(cl.status)}</span></div>
      </div><a href="#checklist" class="btn btn-secondary">返回列表</a></div>
      <div class="panel-grid-two panel-grid-spaced">
        <div class="card"><div class="card-header"><span class="card-title">檢核統計</span></div><div class="cl-stats-wrap">${svg}<div class="cl-legend">${legend}</div></div></div>
        <div class="card"><div class="card-header"><span class="card-title">案件資訊</span></div>
          <div class="detail-grid">
            <div class="detail-field"><div class="detail-field-label">單位</div><div class="detail-field-value">${esc(cl.unit)}</div></div>
            <div class="detail-field"><div class="detail-field-label">填報者</div><div class="detail-field-value">${esc(cl.fillerName)}</div></div>
            <div class="detail-field"><div class="detail-field-label">檢核年度</div><div class="detail-field-value">${esc(cl.auditYear)} 年</div></div>
            <div class="detail-field"><div class="detail-field-label">填報時間</div><div class="detail-field-value">${fmt(cl.fillDate)}</div></div>
            <div class="detail-field"><div class="detail-field-label">主管姓名</div><div class="detail-field-value">${esc(cl.supervisorName || cl.supervisor || '未填寫')}</div></div>
            <div class="detail-field"><div class="detail-field-label">主管職稱</div><div class="detail-field-value">${esc(cl.supervisorTitle || '未填寫')}</div></div>
            <div class="detail-field"><div class="detail-field-label">簽核狀態</div><div class="detail-field-value">${esc(cl.signStatus || '草稿')}</div></div>
            <div class="detail-field"><div class="detail-field-label">簽核時間</div><div class="detail-field-value">${cl.signDate ? fmt(cl.signDate) : '未填寫'}</div></div>
            <div class="detail-field"><div class="detail-field-label">主管備註</div><div class="detail-field-value">${esc(cl.supervisorNote || '未填寫')}</div></div>
            <div class="detail-field"><div class="detail-field-label">適用率</div><div class="detail-field-value checklist-applicable-rate ${applicableRate >= 80 ? 'checklist-applicable-rate--good' : applicableRate >= 60 ? 'checklist-applicable-rate--warn' : 'checklist-applicable-rate--danger'}">${applicableRate}%（${s.conform || 0}/${applicable}）</div></div>
          </div>
        </div>
      </div>
      ${issueHtml}
      <div class="card card--top-20"><div class="card-header"><span class="card-title">${ic('clipboard-list', 'icon-sm')} 檢核項目明細</span></div>${sectDetail}</div>
    </div>`;
    getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
      const result = cl.results?.[item.id] || {};
      if (!Array.isArray(result.evidenceFiles) || !result.evidenceFiles.length) return;
      const target = document.getElementById(`cl-detail-files-${item.id}`);
      if (!target) return;
      renderAttachmentList(target, result.evidenceFiles, {
        editable: false,
        emptyHtml: '',
        fileIconHtml: '<div class="file-pdf-icon">' + ic('file-box') + '</div>',
        itemClass: 'file-preview-item checklist-file-card',
        actionsClass: 'checklist-file-actions'
      });
    }));
    refreshIcons();
    bindCopyButtons();
  }

  function getChecklistManageTotalItems() {
    return getChecklistSectionsState().reduce((acc, s) => acc + s.items.length, 0);
  }

  function renderChecklistManageItem(item, si, ii) {
    return `
        <div class="cm-item" data-si="${si}" data-ii="${ii}">
          <div class="cm-item-drag" title="拖曳調整順序">&#8942;&#8942;</div>
          <div class="cm-item-content">
            <div class="cm-item-row">
              <span class="cl-item-id cl-item-id--fixed">${esc(item.id)}</span>
              <span class="cm-item-text">${esc(item.text)}</span>
            </div>
            <div class="cm-item-hint">說明：${esc(item.hint || '尚無說明')}</div>
          </div>
          <div class="cm-item-actions">
            <button class="btn btn-sm btn-secondary" data-action="checklist.editItem" data-si="${si}" data-ii="${ii}" title="編輯題目">${ic('edit-2', 'btn-icon-svg')}</button>
            <button class="btn btn-sm btn-danger" data-action="checklist.deleteItem" data-si="${si}" data-ii="${ii}" title="刪除題目">${ic('trash-2', 'btn-icon-svg')}</button>
          </div>
        </div>`;
  }

  function renderChecklistManageSection(sec, si) {
    const itemRows = sec.items.map((item, ii) => renderChecklistManageItem(item, si, ii)).join('');
    return `
        <div class="cm-section" data-si="${si}">
          <div class="cm-section-header">
            <div class="cm-section-title-wrap">
              <span class="cl-section-num">${si + 1}</span>
              <span class="cm-section-name" id="cm-sname-${si}">${esc(sec.section)}</span>
            </div>
            <div class="cm-section-actions">
              <span class="cm-item-count">${sec.items.length} 題</span>
              <button class="btn btn-sm btn-secondary" data-action="checklist.editSection" data-si="${si}" title="編輯類別">${ic('edit-2', 'btn-icon-svg')}</button>
              <button class="btn btn-sm btn-primary" data-action="checklist.addItem" data-si="${si}" title="新增題目">${ic('plus', 'btn-icon-svg')} 新增題目</button>
              <button class="btn btn-sm btn-danger" data-action="checklist.deleteSection" data-si="${si}" title="刪除類別">${ic('trash-2', 'btn-icon-svg')}</button>
            </div>
          </div>
          <div class="cm-items-wrap">${itemRows}</div>
        </div>`;
  }

  function buildChecklistManageSectionsHtml() {
    return getChecklistSectionsState().map((sec, si) => renderChecklistManageSection(sec, si)).join('');
  }

  function renderChecklistManage() {
    if (!isAdmin()) { navigate('dashboard'); toast('只有管理者可以查看此頁面。', 'error'); return; }
    const totalItems = getChecklistManageTotalItems();
    const sectHtml = buildChecklistManageSectionsHtml();

    document.getElementById('app').innerHTML = `<div class="animate-in" data-checklist-route="manage" data-checklist-route-state="shell">
      <div class="page-header" data-checklist-route="manage" data-checklist-route-state="shell">
        <div>
          <h1 class="page-title">檢核管理</h1>
          <p class="page-subtitle">目前共有 ${getChecklistSectionsState().length} 個類別、${totalItems} 個題目可管理。</p>
        </div>
        <div class="review-inline-gap-8">
          <button class="btn btn-secondary" data-action="checklist.resetDefault">${ic('refresh-cw', 'icon-sm')} 恢復預設</button>
          <button class="btn btn-primary" data-action="checklist.addSection">${ic('plus-circle', 'icon-sm')} 新增類別</button>
        </div>
      </div>

      <div class="cm-info-banner">
        ${ic('info', 'icon-sm')}
        <span>可拖曳題目調整順序，變更後會即時同步到填報頁面。</span>
      </div>

      <div id="cm-sections-wrap" data-checklist-route="manage" data-checklist-route-state="shell">${sectHtml}</div>
    </div>`;

    refreshIcons();
    setChecklistRouteState('manage', 'ready');
  }

  function _cmRefreshSections() {
    const wrap = document.getElementById('cm-sections-wrap');
    if (!wrap) { renderChecklistManage(); return; }
    wrap.innerHTML = buildChecklistManageSectionsHtml();
    const totalItems = getChecklistManageTotalItems();
    const subtitle = document.querySelector('.page-subtitle');
    if (subtitle) subtitle.textContent = `目前共有 ${getChecklistSectionsState().length} 個類別、${totalItems} 個題目可管理。`;
    refreshIcons();
  }

  function _cmModal(title, bodyHtml, onSave) {
    const mr = document.getElementById('modal-root') || (function () {
      const fallbackRoot = document.createElement('div');
      fallbackRoot.id = 'modal-root';
      document.body.appendChild(fallbackRoot);
      return fallbackRoot;
    }());
    mr.innerHTML = `<div class="modal-backdrop" id="cm-modal-bg">
      <div class="modal checklist-modal--wide">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="btn btn-ghost btn-icon" data-dismiss-modal>關閉</button>
        </div>
        <form id="cm-modal-form">
          ${bodyHtml}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${ic('save', 'icon-sm')} 儲存</button>
            <button type="button" class="btn btn-secondary" data-dismiss-modal>返回</button>
          </div>
        </form>
      </div>
    </div>`;
    bindChecklistPageEvent(document.getElementById('cm-modal-bg'), 'click', e => { if (e.target === e.currentTarget) closeModalRoot(); });
    bindChecklistPageEvent(document.getElementById('cm-modal-form'), 'submit', e => { e.preventDefault(); onSave(); closeModalRoot(); _cmRefreshSections(); });
    refreshIcons();
  }

  function _cmNextItemId(si) {
    const sec = getChecklistSectionsState()[si];
    const prefix = String(si + 1) + '.';
    const used = sec.items.map(it => {
      const n = parseFloat(it.id.replace(prefix, ''));
      return isNaN(n) ? 0 : n;
    });
    const max = used.length ? Math.max(...used) : 0;
    return prefix + (max + 1);
  }

  function saveChecklistSectionsAndInvalidate(sections, reason) {
    const result = saveChecklistSections(sections);
    dispatchChecklistCacheInvalidationScopes(['checklists-template', 'checklists-list', 'checklists-summary'], reason || 'checklist-template-save');
    return result;
  }

  function resetChecklistSectionsAndInvalidate(reason) {
    const result = resetChecklistSections();
    dispatchChecklistCacheInvalidationScopes(['checklists-template', 'checklists-list', 'checklists-summary'], reason || 'checklist-template-reset');
    return result;
  }

  function cmAddSection() {
    _cmModal('新增類別', `
      <div class="form-group">
        <label class="form-label form-required">類別名稱</label>
        <input type="text" class="form-input" id="cm-sec-name" placeholder="例如 10. 基本資料" required autofocus>
      </div>`, () => {
      const name = document.getElementById('cm-sec-name').value.trim();
      if (!name) return;
      const secs = getChecklistSections();
      secs.push({ section: name, items: [] });
      saveChecklistSectionsAndInvalidate(secs, 'checklist-template-add-section');
      toast('已新增類別。');
    });
  };

  function cmEditSection(si) {
    const secs = getChecklistSections();
    const sec = secs[si];
    _cmModal('編輯類別', `
      <div class="form-group">
        <label class="form-label form-required">類別名稱</label>
        <input type="text" class="form-input" id="cm-sec-name" value="${esc(sec.section)}" required autofocus>
      </div>`, () => {
      const name = document.getElementById('cm-sec-name').value.trim();
      if (!name) return;
      const s2 = getChecklistSections();
      s2[si].section = name;
      saveChecklistSectionsAndInvalidate(s2, 'checklist-template-edit-section');
      toast('已更新類別。');
    });
  };

  async function cmDelSection(si) {
    const secs = getChecklistSections();
    const confirmed = await openConfirmDialog('確定要刪除這個類別嗎？', { title: '刪除類別', confirmText: '確定刪除', cancelText: '取消' });
    if (!confirmed) return;
    secs.splice(si, 1);
    saveChecklistSectionsAndInvalidate(secs, 'checklist-template-delete-section');
    toast('已刪除類別。', 'info');
    _cmRefreshSections();
  };

  function cmAddItem(si) {
    const nextId = _cmNextItemId(si);
    _cmModal('新增題目', `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label form-required">題號</label>
          <input type="text" class="form-input" id="cm-item-id" value="${esc(nextId)}" placeholder="例如 8.10" required>
          <p class="form-hint">題號應符合類別編號格式，並可搭配小數點子題號。</p>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label form-required">題目內容</label>
          <textarea class="form-textarea form-textarea--min-80" id="cm-item-text" placeholder="請輸入題目內容" required autofocus></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">說明</label>
          <textarea class="form-textarea form-textarea--min-60" id="cm-item-hint" placeholder="可選填，補充填寫說明或限制條件"></textarea>
      </div>`, () => {
      const id = document.getElementById('cm-item-id').value.trim();
      const text = document.getElementById('cm-item-text').value.trim();
      const hint = document.getElementById('cm-item-hint').value.trim();
      if (!id || !text) { toast('題號與題目不可為空。', 'error'); return; }
      const secs = getChecklistSections();
      const allIds = secs.flatMap(s => s.items.map(it => it.id));
      if (allIds.includes(id)) { toast(`題號 ${id} 已存在，請改用不同編號。`, 'error'); return; }
      secs[si].items.push({ id, text, hint });
      saveChecklistSectionsAndInvalidate(secs, 'checklist-template-add-item');
      toast('已新增題目。');
    });
  };

  function cmEditItem(si, ii) {
    const secs = getChecklistSections();
    const item = secs[si].items[ii];
    _cmModal('編輯題目', `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label form-required">題號</label>
          <input type="text" class="form-input" id="cm-item-id" value="${esc(item.id)}" required>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label form-required">題目內容</label>
          <textarea class="form-textarea form-textarea--min-80" id="cm-item-text" required>${esc(item.text)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">說明</label>
          <textarea class="form-textarea form-textarea--min-60" id="cm-item-hint">${esc(item.hint || '')}</textarea>
      </div>`, () => {
      const newId = document.getElementById('cm-item-id').value.trim();
      const text = document.getElementById('cm-item-text').value.trim();
      const hint = document.getElementById('cm-item-hint').value.trim();
      if (!newId || !text) { toast('題號與題目不可為空。', 'error'); return; }
      const s2 = getChecklistSections();
      const allIds = s2.flatMap((sec, sIdx) => sec.items.map((it, iIdx) => ({ id: it.id, si: sIdx, ii: iIdx }))).filter(x => !(x.si === si && x.ii === ii)).map(x => x.id);
      if (allIds.includes(newId)) { toast(`題號 ${newId} 已存在，請改用不同編號。`, 'error'); return; }
      s2[si].items[ii] = { id: newId, text, hint };
      saveChecklistSectionsAndInvalidate(s2, 'checklist-template-edit-item');
      toast('已更新題目。');
    });
  };

  async function cmDelItem(si, ii) {
    const secs = getChecklistSections();
    const item = secs[si].items[ii];
    const confirmed = await openConfirmDialog('確定要刪除題目 ' + esc(item.id) + ' 嗎？', { title: '刪除題目', confirmText: '確定刪除', cancelText: '取消' });
    if (!confirmed) return;
    secs[si].items.splice(ii, 1);
    saveChecklistSectionsAndInvalidate(secs, 'checklist-template-delete-item');
    toast('已刪除題目。', 'info');
    _cmRefreshSections();
  };

  async function cmResetDefault() {
    const confirmed = await openConfirmDialog('確定要恢復預設檢核類別嗎？', { title: '恢復預設', confirmText: '恢復預設', cancelText: '取消' });
    if (!confirmed) return;
    resetChecklistSectionsAndInvalidate('checklist-template-reset-default');
    toast('已恢復預設檢核類別。', 'info');
    _cmRefreshSections();
  };

  async function handleDeleteChecklistYear(year) {
    const targetYear = String(year || '').trim();
    if (!targetYear) {
      toast('請先輸入有效年度。', 'error');
      return;
    }
    const label = targetYear + ' 年';
    const confirmed = await openConfirmDialog('確定要刪除 ' + label + ' 的所有檢核資料嗎？', {
      title: '刪除年度資料',
      confirmText: '確定刪除',
      cancelText: '取消'
    });
    if (!confirmed) return;
    await runWithBusyState('正在刪除 ' + label + ' 資料…', async () => {
      const result = await deleteChecklistsByYear(targetYear);
      const deletedCount = Number(result && result.deletedCount || 0);
      dispatchChecklistCacheInvalidationScopes(['checklists-list', 'checklists-summary'], 'checklist-delete-year');
      toast(deletedCount ? ('已刪除 ' + label + ' 資料，共 ' + deletedCount + ' 筆。') : (label + ' 沒有可刪除的資料。'), deletedCount ? 'success' : 'info');
      await renderChecklistList({ skipSync: true });
    });
  }
  registerActionHandlers('checklist', {
    addSection: function () {
      cmAddSection();
    },
    editSection: function ({ dataset }) {
      cmEditSection(Number(dataset.si));
    },
    deleteSection: function ({ dataset }) {
      cmDelSection(Number(dataset.si));
    },
    addItem: function ({ dataset }) {
      cmAddItem(Number(dataset.si));
    },
    editItem: function ({ dataset }) {
      cmEditItem(Number(dataset.si), Number(dataset.ii));
    },
    deleteItem: function ({ dataset }) {
      cmDelItem(Number(dataset.si), Number(dataset.ii));
    },
    deleteYear: function ({ event, dataset }) {
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      return handleDeleteChecklistYear(dataset.year);
    },
    resetDefault: function () {
      cmResetDefault();
    }
  });

    return {
      renderChecklistList,
      renderChecklistFill,
      renderChecklistDetail,
      renderChecklistManage
    };
  };
})();
