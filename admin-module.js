// @ts-check
(function () {
  window.createAdminModule = function createAdminModule(deps) {
    const {
      ROLES,
      ROLE_BADGE,
      currentUser,
      isAdmin,
      isUnitAdmin,
      canManageUsers,
      getUsers,
      getAuthorizedUnits,
      getReviewUnits,
      getAccessProfile,
      getAccessProfileSignature,
      parseUserUnits,
      getUnitSearchEntries,
      splitUnitValue,
      composeUnitValue,
      findUser,
      submitUserUpsert,
      submitUserDelete,
      syncUsersFromM365,
      submitReviewScopeReplace,
      syncReviewScopesFromM365,
      getCustomUnitRegistry,
      loadUnitReviewStore,
      getUnitGovernanceMode,
      setUnitGovernanceMode,
      getUnitGovernanceModes,
      formatUnitScopeSummary,
      approveCustomUnit,
      mergeCustomUnit,
      loadLoginLogs,
      clearLoginLogs,
      fetchAuditTrailEntries,
      fetchAuditTrailHealth,
      listUnitContactApplications,
      listUnitContactApplicationsPaged,
      reviewUnitContactApplication,
      activateUnitContactApplication,
      listSystemUsersPaged,
      getSchemaHealth,
      migrateAllStores,
      exportManagedStoreSnapshot,
      getAttachmentHealth,
      pruneOrphanAttachments,
      exportSupportBundle,
      navigate,
      toast,
      fmtTime,
      esc,
      ic,
      refreshIcons,
      addPageEventListener,
      registerPageCleanup,
      downloadJson,
      buildUnitCascadeControl,
      initUnitCascade,
      registerActionHandlers,
      closeModalRoot,
      openConfirmDialog,
      getUnitContactApplication,
      requestUnitContactAuthorizationDocument
    } = deps;

    // Initialize extracted sub-modules with real dependency references
    if (window._adminAuditTrail && window._adminAuditTrail.init) window._adminAuditTrail.init({ esc: esc, ic: ic });
    if (window._adminLoginLog && window._adminLoginLog.init) window._adminLoginLog.init({ esc: esc });
    if (window._adminSecurityWindow && window._adminSecurityWindow.init) window._adminSecurityWindow.init({ esc: esc, ic: ic });

    async function promptActivationInfo(applicationId, opts) {
      const confirmed = typeof openConfirmDialog === 'function'
        ? await openConfirmDialog('確定要重新寄送登入資訊給此申請人嗎？', { title: '重新寄送', confirmLabel: '寄送', confirmClass: 'btn-primary', kicker: '操作確認' })
        : window.confirm('確定要重新寄送登入資訊嗎？');
      if (!confirmed) return;
      try {
        await activateUnitContactApplication({ id: applicationId, resend: true });
        toast('已重新寄送登入資訊', 'success');
      } catch (error) {
        toast(String(error && error.message || error || '寄送失敗'), 'error');
      }
    }

    async function promptReviewComment(title, placeholder, confirmLabel, callback) {
      if (typeof openConfirmDialog === 'function') {
        const confirmed = await openConfirmDialog(placeholder, { title: title, confirmLabel: confirmLabel, confirmClass: 'btn-primary', kicker: '審核操作' });
        if (!confirmed) return;
        callback('');
      } else {
        const comment = window.prompt(title + '\n' + placeholder);
        if (comment === null) return;
        callback(comment.trim());
      }
    }

    // ─── Audit Trail formatting: delegated to admin-audit-trail-module.js ───
    function formatAuditOccurredAt(value) { return window._adminAuditTrail.formatAuditOccurredAt(value); }
    function formatAuditEventTypeSummary(summary) { return window._adminAuditTrail.formatAuditEventTypeSummary(summary); }

    const DEFAULT_AUDIT_FILTERS = Object.freeze({
      keyword: '',
      eventType: '',
      occurredFrom: '',
      occurredTo: '',
      actorEmail: '',
      targetEmail: '',
      unitCode: '',
      recordId: '',
      limit: '50',
      offset: '0'
    });
    const AUDIT_TRAIL_SYNC_FRESHNESS_MS = 30000;
    const AUDIT_TRAIL_HEALTH_CACHE_MS = 30000;
    const AUDIT_TRAIL_QUERY_CACHE_MS = 30000;
    let auditTrailHealthLoadPromise = null;
    let auditTrailHealthCache = {
      value: null,
      loadedAt: 0
    };
    const AUDIT_TRAIL_QUERY_CACHE_MAX = 12;
    const auditTrailQueryCache = createAdminBoundedCacheStore({
      maxEntries: AUDIT_TRAIL_QUERY_CACHE_MAX,
      defaultTtlMs: AUDIT_TRAIL_QUERY_CACHE_MS
    });
    const auditTrailLoadPromiseMap = new Map();
    const AUDIT_TRAIL_SUMMARY_CACHE_MS = 15000;
    const AUDIT_TRAIL_SUMMARY_BOOTSTRAP_DELAYS = getAdminBootstrapRetryDelays();
    const AUDIT_TRAIL_VIRTUAL_ROW_HEIGHT = 76;
    const AUDIT_TRAIL_VIRTUAL_ROW_OVERSCAN = 10;
    const AUDIT_TRAIL_VIRTUAL_ROW_THRESHOLD = 140;
    const ADMIN_MIN_VIRTUAL_VIEWPORT_HEIGHT = 320;
    const ADMIN_COLLECTION_FILTER_INVENTORY_LIMIT = 60;
    const ADMIN_HORIZONTAL_SCROLL_MIN_PX = 260;
    const ADMIN_HORIZONTAL_SCROLL_RATIO = 0.72;
    let auditTrailCollectionBundle = null;
    let auditTrailState = null;
    let auditTrailSummaryCache = null;
    let auditTrailSummaryBootstrapState = { signature: '', timer: 0, attempt: 0 };
    let auditTrailRenderCache = null;
    let auditTrailMarkupCache = null;
    let auditTrailTableViewport = null;
    let auditTrailVirtualRowsRenderPending = false;
    let releaseAuditTrailVirtualScroll = null;
    let releaseAuditTrailVirtualResize = null;
    const DEFAULT_SYSTEM_USERS_FILTERS = Object.freeze({
      q: '',
      role: '',
      unit: '',
      limit: '20',
      offset: '0'
    });
    let systemUsersCollectionBundle = null;
    let systemUsersState = null;
    let systemUsersRenderCache = null;
    let systemUsersMarkupCache = null;
    const SYSTEM_USERS_VIRTUAL_ROW_HEIGHT = 64;
    const SYSTEM_USERS_VIRTUAL_ROW_OVERSCAN = 8;
    const SYSTEM_USERS_VIRTUAL_ROW_THRESHOLD = 40;
    let systemUsersTableViewport = null;
    let systemUsersVirtualRowsRenderPending = false;
    let releaseSystemUsersVirtualScroll = null;
    let releaseSystemUsersVirtualResize = null;
    const DEFAULT_UNIT_CONTACT_REVIEW_FILTERS = Object.freeze({
      status: '',
      keyword: '',
      email: '',
      limit: '50',
      offset: '0'
    });
    let unitContactReviewCollectionBundle = null;
    let unitContactReviewState = null;
    let unitContactReviewRenderCache = null;
    let unitContactReviewMarkupCache = null;
    const UNIT_CONTACT_REVIEW_VIRTUAL_ROW_HEIGHT = 72;
    const UNIT_CONTACT_REVIEW_VIRTUAL_ROW_OVERSCAN = 8;
    const UNIT_CONTACT_REVIEW_VIRTUAL_ROW_THRESHOLD = 40;
    let unitContactReviewTableViewport = null;
    let unitContactReviewVirtualRowsRenderPending = false;
    let releaseUnitContactReviewVirtualScroll = null;
    let releaseUnitContactReviewVirtualResize = null;
    const LOGIN_LOG_VIRTUAL_ROW_HEIGHT = 56;
    const LOGIN_LOG_VIRTUAL_ROW_OVERSCAN = 8;
    const LOGIN_LOG_VIRTUAL_ROW_THRESHOLD = 60;
    let loginLogItems = [];
    let loginLogTableViewport = null;
    let loginLogVirtualRowsRenderPending = false;
    let releaseLoginLogVirtualScroll = null;
    let releaseLoginLogVirtualResize = null;
    const DEFAULT_GOVERNANCE_FILTERS = Object.freeze({
      keyword: '',
      mode: 'all',
      category: 'all',
      limit: '12',
      offset: '0'
    });
    const unitGovernanceState = {
      filters: { ...DEFAULT_GOVERNANCE_FILTERS },
      items: [],
      summary: { total: 0, consolidated: 0, independent: 0, children: 0 },
      categorySummaries: {},
      page: { offset: 0, limit: 12, total: 0, pageCount: 0, currentPage: 0, hasPrev: false, hasNext: false, prevOffset: 0, nextOffset: 0, pageStart: 0, pageEnd: 0 },
      loading: false,
      lastLoadedAt: '',
      renderRequestId: 0
    };
    const DEFAULT_SECURITY_WINDOW_FILTERS = Object.freeze({
      keyword: '',
      status: 'all',
      category: 'all',
      limit: '12',
      offset: '0'
    });
    const securityWindowState = {
      filters: { ...DEFAULT_SECURITY_WINDOW_FILTERS },
      inventory: null,
      categorySummaries: {},
      page: { offset: 0, limit: 12, total: 0, pageCount: 0, currentPage: 0, hasPrev: false, hasNext: false, prevOffset: 0, nextOffset: 0, pageStart: 0, pageEnd: 0 },
      loading: false,
      lastLoadedAt: '',
      filterSignature: '',
      renderRequestId: 0
    };
    const SECURITY_WINDOW_SYNC_FRESHNESS_MS = 30000;
    let securityWindowLoadPromise = null;
    let securityWindowInventoryCache = {
      loadedAt: 0,
      value: null
    };
    let securityWindowFilteredCache = {
      signature: '',
      value: null
    };
    let unitGovernanceTopLevelCache = {
      signature: '',
      value: [],
      filteredSignature: '',
      filteredValue: []
    };
    let unitGovernanceFilteredCache = {
      signature: '',
      value: []
    };
    let unitGovernanceRenderCache = {
      signature: '',
      cardsHtml: ''
    };
    let unitGovernanceDeferredBodiesCache = {
      signature: '',
      itemsByCategory: {},
      htmlByCategory: {}
    };
    let securityWindowRenderCache = {
      unitCardsSignature: '',
      unitCardsHtml: '',
      peopleRowsSignature: '',
      peopleRowsHtml: ''
    };
    let adminAccessProfileListenerInstalled = false;

    function bindAdminPageEvent(target, type, listener, options) {
      if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
        return function () {};
      }
      if (typeof addPageEventListener === 'function') {
        return addPageEventListener(target, type, listener, options);
      }
      target.addEventListener(type, listener, options);
      return function () {
        try { target.removeEventListener(type, listener, options); } catch (_) {}
      };
    }

    function registerAdminPageCleanup(callback) {
      if (typeof registerPageCleanup === 'function') {
        return registerPageCleanup(callback);
      }
      return function () {};
    }

    function beginAdminRouteRender(state, routeHashPrefix) {
      const targetState = state && typeof state === 'object' ? state : {};
      const prefix = String(routeHashPrefix || '').trim();
      const requestId = Number(targetState.renderRequestId || 0) + 1;
      targetState.renderRequestId = requestId;
      registerAdminPageCleanup(function () {
        if (targetState.renderRequestId === requestId) {
          targetState.renderRequestId = requestId + 1;
        }
      });
      return function isStaleRender() {
        if (targetState.renderRequestId !== requestId) return true;
        if (!prefix) return false;
        return !String(window.location.hash || '').startsWith(prefix);
      };
    }

    function getAdminCollectionCacheModule() {
      if (typeof window === 'undefined') return null;
      if (window.__ISMS_ADMIN_COLLECTION_CACHE__ && typeof window.__ISMS_ADMIN_COLLECTION_CACHE__ === 'object') {
        return window.__ISMS_ADMIN_COLLECTION_CACHE__;
      }
      if (typeof window.createAdminCollectionCacheModule === 'function') {
        window.__ISMS_ADMIN_COLLECTION_CACHE__ = window.createAdminCollectionCacheModule();
        return window.__ISMS_ADMIN_COLLECTION_CACHE__;
      }
      return null;
    }

    function getAdminBootstrapRetryDelays(delays) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.getBootstrapRetryDelays === 'function') {
        return moduleApi.getBootstrapRetryDelays(delays);
      }
      const fallback = typeof window !== 'undefined' && Array.isArray(window.__ISMS_BOOTSTRAP_RETRY_DELAYS__)
        ? window.__ISMS_BOOTSTRAP_RETRY_DELAYS__
        : [];
      return Array.isArray(delays) && delays.length ? delays.slice() : fallback.slice();
    }

    function createAdminCollectionPage(limit) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createPage === 'function') {
        return moduleApi.createPage(limit);
      }
      const safeLimit = Math.max(1, Number(limit) || 20);
      return { offset: 0, limit: safeLimit, total: 0, pageCount: 0, currentPage: 0, hasPrev: false, hasNext: false, prevOffset: 0, nextOffset: 0, pageStart: 0, pageEnd: 0 };
    }

    function createAdminRemoteCollectionState(options) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createRemoteCollectionState === 'function') {
        return moduleApi.createRemoteCollectionState(options);
      }
      const settings = options && typeof options === 'object' ? options : {};
      return {
        filters: { ...(settings.filters || {}) },
        items: Array.isArray(settings.items) ? settings.items.slice() : [],
        summary: { ...(settings.summary || {}) },
        page: createAdminCollectionPage(settings.limit),
        total: Math.max(0, Number(settings.total) || 0),
        signature: String(settings.signature || ''),
        ...(settings.extra && typeof settings.extra === 'object' ? settings.extra : {})
      };
    }

    function createAdminBoundedCacheStore(options) {
      const moduleApi = getAdminCollectionCacheModule();
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

    function createAdminRemoteViewCache(filters, extra) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createRemoteViewCache === 'function') {
        return moduleApi.createRemoteViewCache(filters, extra);
      }
      return {
        items: [],
        summary: null,
        page: null,
        filters: { ...(filters || {}) },
        signature: '',
        fetchedAt: 0,
        promise: null,
        ...(extra && typeof extra === 'object' ? extra : {})
      };
    }

    function createAdminSummaryCache(extra) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createSummaryCache === 'function') {
        return moduleApi.createSummaryCache(extra);
      }
      return { signature: '', summary: null, fetchedAt: 0, promise: null, ...(extra && typeof extra === 'object' ? extra : {}) };
    }

    function primeAdminSummaryCache(cache, options) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.primeSummaryCache === 'function') {
        return moduleApi.primeSummaryCache(cache, options);
      }
      return Promise.resolve(null);
    }

    function replaceAdminCacheState(cache, nextState, defaults) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.replaceCacheState === 'function') {
        return moduleApi.replaceCacheState(cache, nextState, defaults);
      }
      const base = defaults && typeof defaults === 'object' ? { ...defaults } : {};
      const next = nextState && typeof nextState === 'object' ? nextState : {};
      if (!cache || typeof cache !== 'object') return { ...base, ...next };
      Object.keys(cache).forEach((key) => { delete cache[key]; });
      Object.assign(cache, base, next);
      return cache;
    }

    function createAdminRemoteCollectionBundle(options) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createRemoteCollectionBundle === 'function') {
        const settings = options && typeof options === 'object' ? options : {};
        return moduleApi.createRemoteCollectionBundle({
          ...settings,
          includeViewCache: true,
          includeSummaryCache: true,
          includeRenderCache: true,
          includeMarkupCache: true,
          renderCacheExtra: {
            filterSignature: '',
            ...(settings.renderCacheExtra && typeof settings.renderCacheExtra === 'object' ? settings.renderCacheExtra : {})
          }
        });
      }
      const settings = options && typeof options === 'object' ? options : {};
      return {
        state: createAdminRemoteCollectionState(settings),
        viewCache: createAdminRemoteViewCache(settings.filters, settings.viewCacheExtra),
        summaryCache: createAdminSummaryCache(settings.summaryCacheExtra),
        renderCache: createAdminRenderCache(),
        markupCache: createAdminMarkupCache()
      };
    }

    function createAdminRenderCache() {
      const moduleApi = getAdminCollectionCacheModule();
      return moduleApi && typeof moduleApi.createRenderCache === 'function'
        ? moduleApi.createRenderCache()
        : { signature: '', filterSignature: '' };
    }

    function createAdminMarkupCache() {
      const moduleApi = getAdminCollectionCacheModule();
      return moduleApi && typeof moduleApi.createMarkupCache === 'function'
        ? moduleApi.createMarkupCache()
        : { signature: '', html: '' };
    }

    function resetAdminRemoteViewCache(cache, filters) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.resetRemoteViewCache === 'function') {
        moduleApi.resetRemoteViewCache(cache, filters);
        return;
      }
      if (!cache || typeof cache !== 'object') return;
      cache.items = [];
      cache.summary = null;
      cache.page = null;
      cache.filters = { ...(filters || {}) };
      cache.signature = '';
      cache.fetchedAt = 0;
      cache.promise = null;
    }

    function resetAdminSummaryState(state, summary, remoteViewCache) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.resetSummaryState === 'function') {
        moduleApi.resetSummaryState(state, summary, remoteViewCache);
        return;
      }
      if (state && typeof state === 'object') state.summary = { ...(summary || {}) };
      if (remoteViewCache && typeof remoteViewCache === 'object') remoteViewCache.summary = null;
    }

    function resetAdminSummaryCache(cache) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.resetSummaryCache === 'function') {
        moduleApi.resetSummaryCache(cache);
        return;
      }
      if (!cache || typeof cache !== 'object') return;
      cache.signature = '';
      cache.summary = null;
      cache.fetchedAt = 0;
      cache.promise = null;
    }

    function resetAdminRenderCaches(renderCacheRef, markupCacheRef) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.resetRenderCaches === 'function') {
        moduleApi.resetRenderCaches(renderCacheRef, markupCacheRef);
        return;
      }
      if (renderCacheRef && typeof renderCacheRef === 'object') {
        renderCacheRef.signature = '';
        if (Object.prototype.hasOwnProperty.call(renderCacheRef, 'filterSignature')) renderCacheRef.filterSignature = '';
      }
      if (markupCacheRef && typeof markupCacheRef === 'object') {
        markupCacheRef.signature = '';
        markupCacheRef.html = '';
      }
    }

    function resetAdminPagedCollectionState(state, options) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.resetPagedCollectionState === 'function') {
        moduleApi.resetPagedCollectionState(state, options);
        return;
      }
      const settings = options && typeof options === 'object' ? options : {};
      state.filters = { ...(settings.filters || {}) };
      state.items = [];
      state.summary = { ...(settings.summary || {}) };
      state.page = createAdminCollectionPage(settings.limit);
      if (Object.prototype.hasOwnProperty.call(state, 'loading')) state.loading = false;
      if (Object.prototype.hasOwnProperty.call(state, 'lastLoadedAt')) state.lastLoadedAt = '';
      if (Object.prototype.hasOwnProperty.call(state, 'filterSignature')) state.filterSignature = '';
      if (typeof settings.afterReset === 'function') settings.afterReset(state);
    }

    function resetAdminRemoteCollectionBundle(bundle, options) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.resetRemoteCollectionBundle === 'function') {
        moduleApi.resetRemoteCollectionBundle(bundle, options);
        return;
      }
      if (!bundle || typeof bundle !== 'object') return;
      if (bundle.state) resetAdminPagedCollectionState(bundle.state, options);
      if (bundle.viewCache) resetAdminRemoteViewCache(bundle.viewCache, options && options.filters);
      if (bundle.summaryCache) resetAdminSummaryCache(bundle.summaryCache);
      resetAdminRenderCaches(bundle.renderCache, bundle.markupCache);
    }

    function buildAdminCollectionRenderSignature(options) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.buildRenderSignature === 'function') {
        return moduleApi.buildRenderSignature(options);
      }
      const settings = options && typeof options === 'object' ? options : {};
      const items = Array.isArray(settings.items) ? settings.items : [];
      const identity = typeof settings.identity === 'function'
        ? settings.identity
        : function (item) { return String(item && item.id || item && item.username || ''); };
      return JSON.stringify({
        filters: settings.filters || {},
        page: settings.page || {},
        summary: settings.summary || {},
        lastLoadedAt: String(settings.lastLoadedAt || ''),
        filterSignature: String(settings.filterSignature || ''),
        ids: items.map(identity)
      });
    }

    function buildAuditTrailCollectionBundle() {
      return createAdminRemoteCollectionBundle({
        filters: DEFAULT_AUDIT_FILTERS,
        summary: { total: 0, actorCount: 0, latestOccurredAt: '', eventTypes: [] },
        limit: 50,
        extra: {
          health: null,
          lastLoadedAt: '',
          filterSignature: '',
          loading: false
        }
      });
    }

    function buildSystemUsersCollectionBundle() {
      return createAdminRemoteCollectionBundle({
        filters: DEFAULT_SYSTEM_USERS_FILTERS,
        summary: { total: 0, admin: 0, unitAdmin: 0, securityWindow: 0 },
        limit: 20,
        extra: {
          loading: false,
          lastLoadedAt: '',
          renderRequestId: 0
        }
      });
    }

    function buildUnitContactReviewCollectionBundle() {
      return createAdminRemoteCollectionBundle({
        filters: DEFAULT_UNIT_CONTACT_REVIEW_FILTERS,
        summary: { total: 0, pendingReview: 0, approved: 0, activationPending: 0, active: 0, returned: 0, rejected: 0 },
        limit: 50,
        extra: {
          loading: false,
          lastLoadedAt: ''
        }
      });
    }

    auditTrailCollectionBundle = buildAuditTrailCollectionBundle();
    auditTrailState = auditTrailCollectionBundle.state;
    auditTrailSummaryCache = auditTrailCollectionBundle.summaryCache;
    auditTrailRenderCache = auditTrailCollectionBundle.renderCache;
    auditTrailMarkupCache = auditTrailCollectionBundle.markupCache;
    systemUsersCollectionBundle = buildSystemUsersCollectionBundle();
    systemUsersState = systemUsersCollectionBundle.state;
    systemUsersRenderCache = systemUsersCollectionBundle.renderCache;
    systemUsersMarkupCache = systemUsersCollectionBundle.markupCache;
    unitContactReviewCollectionBundle = buildUnitContactReviewCollectionBundle();
    unitContactReviewState = unitContactReviewCollectionBundle.state;
    unitContactReviewRenderCache = unitContactReviewCollectionBundle.renderCache;
    unitContactReviewMarkupCache = unitContactReviewCollectionBundle.markupCache;

    function normalizeAdminUnitList(units) {
      const source = Array.isArray(units) ? units : [];
      return Array.from(new Set(source.map((unit) => String(unit || '').trim()).filter(Boolean)));
    }

    function getAdminAccessProfile(user) {
      const source = user && typeof user === 'object' ? user : {};
      const accessProfile = typeof getAccessProfile === 'function' ? getAccessProfile(source) : null;
      const primaryUnit = String((accessProfile && (accessProfile.primaryUnit || accessProfile.unit)) || source.primaryUnit || source.unit || '').trim();
      const authorizedUnits = normalizeAdminUnitList([primaryUnit].concat(Array.isArray(accessProfile && accessProfile.authorizedUnits)
        ? accessProfile.authorizedUnits
        : getAuthorizedUnits(source)));
      const reviewUnits = normalizeAdminUnitList(Array.isArray(accessProfile && accessProfile.reviewUnits)
        ? accessProfile.reviewUnits
        : getReviewUnits(source));
      return {
        ...source,
        ...(accessProfile && typeof accessProfile === 'object' ? accessProfile : {}),
        role: String((accessProfile && accessProfile.role) || source.role || '').trim(),
        primaryUnit: primaryUnit || (authorizedUnits[0] || ''),
        activeUnit: String((accessProfile && accessProfile.activeUnit) || source.activeUnit || primaryUnit || authorizedUnits[0] || '').trim(),
        authorizedUnits,
        reviewUnits,
        securityRoles: normalizeSecurityRoles((accessProfile && accessProfile.securityRoles) || source.securityRoles)
      };
    }

    function formatUserUnitSummary(user) {
      const profile = getAdminAccessProfile(user);
      const primary = profile.primaryUnit;
      const units = profile.authorizedUnits.filter((unit) => unit && unit !== primary);
      if (!primary && !units.length) return '未指定';
      if (!units.length) return primary ? `${primary}（無額外授權）` : '未指定';
      const extraLabel = units.length ? units.join('、') : '無額外授權';
      return primary ? `主：${primary}；額外：${extraLabel}` : `額外：${extraLabel}`;
    }

    function formatUserReviewUnitSummary(user) {
      const units = getAdminAccessProfile(user).reviewUnits;
      return units.length ? units.join('、') : '沿用既有審核邏輯';
    }

    function getPrimaryAuthorizedUnit(user) {
      return String(getAdminAccessProfile(user).primaryUnit || '').trim();
    }

    function getExtraAuthorizedUnits(user) {
      const profile = getAdminAccessProfile(user);
      return profile.authorizedUnits.filter((unit) => unit && unit !== profile.primaryUnit);
    }

    function getGovernanceReviewScopeUnits(user) {
      return getAdminAccessProfile(user).reviewUnits;
    }

    function recordAdminBootstrapStep(step, detail) {
      if (typeof window === 'undefined' || !window.__ISMS_BOOTSTRAP__ || typeof window.__ISMS_BOOTSTRAP__.record !== 'function') return;
      window.__ISMS_BOOTSTRAP__.record(step, detail);
    }

    function resetSystemUsersRemoteState() {
      resetAdminRemoteCollectionBundle(systemUsersCollectionBundle, {
        filters: DEFAULT_SYSTEM_USERS_FILTERS,
        summary: { total: 0, admin: 0, unitAdmin: 0, securityWindow: 0 },
        limit: 20
      });
      if (renderUsers._remoteViewCache !== systemUsersCollectionBundle.viewCache) {
        renderUsers._remoteViewCache = systemUsersCollectionBundle.viewCache;
      } else {
        resetAdminRemoteViewCache(renderUsers._remoteViewCache, DEFAULT_SYSTEM_USERS_FILTERS);
      }
      systemUsersRenderCache = systemUsersCollectionBundle.renderCache;
      systemUsersMarkupCache = systemUsersCollectionBundle.markupCache;
    }

    function resetUnitContactReviewRemoteState() {
      resetAdminRemoteCollectionBundle(unitContactReviewCollectionBundle, {
        filters: DEFAULT_UNIT_CONTACT_REVIEW_FILTERS,
        summary: { total: 0, pendingReview: 0, approved: 0, activationPending: 0, active: 0, returned: 0, rejected: 0 },
        limit: 50
      });
      if (renderUnitContactReview._remoteViewCache !== unitContactReviewCollectionBundle.viewCache) {
        renderUnitContactReview._remoteViewCache = unitContactReviewCollectionBundle.viewCache;
      } else {
        resetAdminRemoteViewCache(renderUnitContactReview._remoteViewCache, DEFAULT_UNIT_CONTACT_REVIEW_FILTERS);
      }
      unitContactReviewRenderCache = unitContactReviewCollectionBundle.renderCache;
      unitContactReviewMarkupCache = unitContactReviewCollectionBundle.markupCache;
    }

    function resetAuditTrailRemoteState() {
      resetAdminRemoteCollectionBundle(auditTrailCollectionBundle, {
        filters: DEFAULT_AUDIT_FILTERS,
        summary: { total: 0, actorCount: 0, latestOccurredAt: '', eventTypes: [] },
        limit: 50,
        afterReset: function (state) { state.health = null; }
      });
      auditTrailQueryCache.clear();
      auditTrailLoadPromiseMap.clear();
      auditTrailHealthLoadPromise = null;
      auditTrailHealthCache = { value: null, loadedAt: 0 };
      auditTrailSummaryCache = auditTrailCollectionBundle.summaryCache;
      auditTrailSummaryBootstrapState = { signature: '', timer: 0, attempt: 0 };
      auditTrailRenderCache = auditTrailCollectionBundle.renderCache;
      auditTrailMarkupCache = auditTrailCollectionBundle.markupCache;
    }

    function resetSystemUsersSummaryState() {
      resetAdminSummaryState(systemUsersState, { total: 0, admin: 0, unitAdmin: 0, securityWindow: 0 }, renderUsers._remoteViewCache);
      resetAdminRenderCaches(systemUsersRenderCache, systemUsersMarkupCache);
    }

    function resetUnitContactReviewSummaryState() {
      resetAdminSummaryState(unitContactReviewState, { total: 0, pendingReview: 0, approved: 0, activationPending: 0, active: 0, returned: 0, rejected: 0 }, renderUnitContactReview._remoteViewCache);
      resetAdminRenderCaches(unitContactReviewRenderCache, unitContactReviewMarkupCache);
    }

    function resetAuditTrailSummaryState() {
      resetAdminSummaryState(auditTrailState, { total: 0, actorCount: 0, latestOccurredAt: '', eventTypes: [] }, null);
      resetAdminSummaryCache(auditTrailSummaryCache);
      auditTrailSummaryBootstrapState = { signature: '', timer: 0, attempt: 0 };
      resetAdminRenderCaches(auditTrailRenderCache, auditTrailMarkupCache);
    }

    function resetSystemUsersRenderState() {
      resetAdminRenderCaches(systemUsersRenderCache, systemUsersMarkupCache);
    }

    function resetUnitContactReviewRenderState() {
      resetAdminRenderCaches(unitContactReviewRenderCache, unitContactReviewMarkupCache);
    }

    function resetAuditTrailRenderState() {
      resetAdminRenderCaches(auditTrailRenderCache, auditTrailMarkupCache);
    }

    function getSystemUsersRenderSignature() {
      return buildAdminCollectionRenderSignature({
        filters: systemUsersState.filters,
        page: systemUsersState.page,
        summary: systemUsersState.summary,
        lastLoadedAt: systemUsersState.lastLoadedAt,
        items: systemUsersState.items,
        identity: function (item) {
          return String(item && item.username || '').trim();
        }
      });
    }

    function getUnitContactReviewRenderSignature() {
      return buildAdminCollectionRenderSignature({
        filters: unitContactReviewState.filters,
        page: unitContactReviewState.page,
        summary: unitContactReviewState.summary,
        lastLoadedAt: unitContactReviewState.lastLoadedAt,
        items: unitContactReviewState.items,
        identity: function (item) {
          return String(item && item.id || '').trim();
        }
      });
    }

    function resetGovernanceRemoteState() {
      unitGovernanceState.filters = { ...DEFAULT_GOVERNANCE_FILTERS };
      unitGovernanceState.items = [];
      unitGovernanceState.summary = { total: 0, consolidated: 0, independent: 0, children: 0 };
      unitGovernanceState.categorySummaries = {};
      unitGovernanceState.page = { offset: 0, limit: 12, total: 0, pageCount: 0, currentPage: 0, hasPrev: false, hasNext: false, prevOffset: 0, nextOffset: 0, pageStart: 0, pageEnd: 0 };
      unitGovernanceState.loading = false;
      unitGovernanceState.lastLoadedAt = '';
      securityWindowState.filters = { ...DEFAULT_SECURITY_WINDOW_FILTERS };
      securityWindowState.inventory = null;
      securityWindowState.categorySummaries = {};
      securityWindowState.page = { offset: 0, limit: 12, total: 0, pageCount: 0, currentPage: 0, hasPrev: false, hasNext: false, prevOffset: 0, nextOffset: 0, pageStart: 0, pageEnd: 0 };
      securityWindowState.loading = false;
      securityWindowState.lastLoadedAt = '';
      securityWindowState.filterSignature = '';
      securityWindowLoadPromise = null;
      securityWindowInventoryCache = { loadedAt: 0, value: null };
      securityWindowFilteredCache = { signature: '', value: null };
      unitGovernanceTopLevelCache = { signature: '', value: [], filteredSignature: '', filteredValue: [] };
      unitGovernanceFilteredCache = { signature: '', value: [] };
      unitGovernanceRenderCache = { signature: '', cardsHtml: '' };
      unitGovernanceDeferredBodiesCache = { signature: '', itemsByCategory: {}, htmlByCategory: {} };
      securityWindowRenderCache = { unitCardsSignature: '', unitCardsHtml: '', peopleRowsSignature: '', peopleRowsHtml: '' };
      if (window._adminSecurityWindow) window._adminSecurityWindow.resetRenderCaches();
    }

    function resetUnitGovernanceSummaryState() {
      unitGovernanceState.summary = { total: 0, consolidated: 0, independent: 0, children: 0 };
      unitGovernanceState.categorySummaries = {};
      unitGovernanceRenderCache = { signature: '', cardsHtml: '' };
      unitGovernanceDeferredBodiesCache = { signature: '', itemsByCategory: {}, htmlByCategory: {} };
    }

    function resetUnitGovernanceRenderState() {
      unitGovernanceRenderCache = { signature: '', cardsHtml: '' };
      unitGovernanceDeferredBodiesCache = { signature: '', itemsByCategory: {}, htmlByCategory: {} };
    }

    function resetSecurityWindowSummaryState() {
      securityWindowState.categorySummaries = {};
      securityWindowRenderCache = { unitCardsSignature: '', unitCardsHtml: '', peopleRowsSignature: '', peopleRowsHtml: '' };
      if (window._adminSecurityWindow) window._adminSecurityWindow.resetRenderCaches();
    }

    function resetSecurityWindowRenderState() {
      securityWindowRenderCache = { unitCardsSignature: '', unitCardsHtml: '', peopleRowsSignature: '', peopleRowsHtml: '' };
      if (window._adminSecurityWindow) window._adminSecurityWindow.resetRenderCaches();
    }

    function resetAdminRemoteCaches(reason, scope) {
      const safeReason = String(reason || 'profile-changed').trim() || 'profile-changed';
      const safeScope = String(scope || 'all').trim().toLowerCase() || 'all';
      if (safeScope === 'all' || safeScope === 'access-profile' || safeScope === 'admin') {
        resetSystemUsersRemoteState();
        resetUnitContactReviewRemoteState();
        resetAuditTrailRemoteState();
        resetGovernanceRemoteState();
        recordAdminBootstrapStep('admin-cache-reset', safeReason + ':all');
        return;
      }
      if (safeScope === 'system-users') {
        resetSystemUsersRemoteState();
      } else if (safeScope === 'system-users-summary') {
        resetSystemUsersSummaryState();
      } else if (safeScope === 'system-users-render') {
        resetSystemUsersRenderState();
      } else if (safeScope === 'unit-contact-review') {
        resetUnitContactReviewRemoteState();
      } else if (safeScope === 'unit-contact-review-summary') {
        resetUnitContactReviewSummaryState();
      } else if (safeScope === 'unit-contact-review-render') {
        resetUnitContactReviewRenderState();
      } else if (safeScope === 'audit-trail') {
        resetAuditTrailRemoteState();
      } else if (safeScope === 'audit-trail-summary') {
        resetAuditTrailSummaryState();
      } else if (safeScope === 'audit-trail-render') {
        resetAuditTrailRenderState();
      } else if (safeScope === 'unit-governance' || safeScope === 'unit-governance-query') {
        resetGovernanceRemoteState();
      } else if (safeScope === 'unit-governance-summary') {
        resetUnitGovernanceSummaryState();
      } else if (safeScope === 'unit-governance-render') {
        resetUnitGovernanceRenderState();
      } else if (safeScope === 'security-window' || safeScope === 'security-window-query') {
        resetGovernanceRemoteState();
      } else if (safeScope === 'security-window-summary') {
        resetSecurityWindowSummaryState();
      } else if (safeScope === 'security-window-render') {
        resetSecurityWindowRenderState();
      } else if (safeScope === 'governance-security') {
        resetGovernanceRemoteState();
      } else {
        resetSystemUsersRemoteState();
        resetUnitContactReviewRemoteState();
        resetAuditTrailRemoteState();
        resetGovernanceRemoteState();
      }
      recordAdminBootstrapStep('admin-cache-reset', safeReason + ':' + safeScope);
    }

    function getAdminCacheInvalidationModule() {
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
    function dispatchAdminCacheInvalidation(scope, reason) {
      const moduleApi = getAdminCacheInvalidationModule();
      if (!moduleApi || typeof moduleApi.dispatch !== 'function') return;
      moduleApi.dispatch(scope || 'admin', reason || 'admin-change');
    }

    function dispatchAdminCacheInvalidationScopes(scopes, reason) {
      const uniqueScopes = Array.from(new Set((Array.isArray(scopes) ? scopes : [scopes]).map((scope) => String(scope || '').trim()).filter(Boolean)));
      uniqueScopes.forEach((scope) => dispatchAdminCacheInvalidation(scope, reason));
    }

    function installAdminAccessProfileListener() {
      if (adminAccessProfileListenerInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      window.addEventListener('isms:access-profile-changed', function (event) {
        const detail = event && event.detail ? event.detail : {};
        resetAdminRemoteCaches(detail.reason || 'profile-changed', 'access-profile');
      });
      window.addEventListener('isms:cache-invalidate', function (event) {
        const detail = event && event.detail ? event.detail : {};
        const moduleApi = getAdminCacheInvalidationModule();
        const scope = moduleApi && typeof moduleApi.normalizeScope === 'function'
          ? moduleApi.normalizeScope(detail.scope, '')
          : String(detail.scope || '').trim().toLowerCase();
        const acceptedScopes = ['all', 'access-profile', 'admin', 'system-users', 'system-users-summary', 'system-users-render', 'unit-contact-review', 'unit-contact-review-summary', 'unit-contact-review-render', 'audit-trail', 'audit-trail-summary', 'audit-trail-render', 'unit-governance', 'unit-governance-query', 'unit-governance-summary', 'unit-governance-render', 'security-window', 'security-window-query', 'security-window-summary', 'security-window-render', 'governance-security'];
        const shouldReset = moduleApi && typeof moduleApi.matchesScope === 'function'
          ? moduleApi.matchesScope(scope, acceptedScopes)
          : (!scope || acceptedScopes.includes(scope));
        if (shouldReset) {
          resetAdminRemoteCaches(detail.reason || 'cache-invalidated', scope);
        }
      });
      adminAccessProfileListenerInstalled = true;
    }

    function getAdminApiClient() {
      installAdminAccessProfileListener();
      if (typeof window === 'undefined' || !window) return null;
      if (window._m365ApiClient && typeof window._m365ApiClient === 'object') return window._m365ApiClient;
      try {
        if (window.__ISMS_BOOTSTRAP__ && typeof window.__ISMS_BOOTSTRAP__.resolveM365ApiClient === 'function') {
          const client = window.__ISMS_BOOTSTRAP__.resolveM365ApiClient();
          if (client && typeof client === 'object') {
            recordAdminBootstrapStep('admin-client-hydrated', 'bootstrap-resolver');
            return client;
          }
        }
      } catch (error) {
        recordAdminBootstrapStep('admin-client-hydrate-failed', String(error && error.message || error || 'unknown'));
      }
      try {
        if (typeof window.getM365ApiClient === 'function') {
          const client = window.getM365ApiClient();
          if (client && typeof client === 'object') {
            recordAdminBootstrapStep('admin-client-hydrated', 'window-getter');
            return client;
          }
        }
      } catch (error) {
        recordAdminBootstrapStep('admin-client-hydrate-failed', String(error && error.message || error || 'unknown'));
      }
      return null;
    }

    function isRemoteGovernanceEnabled() {
      const client = getAdminApiClient();
      return !!(client
        && typeof client.getMode === 'function'
        && client.getMode() === 'm365-api'
        && typeof client.listUnitGovernanceEntries === 'function'
        && typeof client.upsertUnitGovernanceEntry === 'function');
    }

    function normalizePagedFilters(filters, defaults) {
      return {
        ...(defaults || {}),
        ...(filters && typeof filters === 'object' ? filters : {})
      };
    }

    function buildAdminCollectionPage(filters, total, defaultLimit, maxLimit) {
      const nextFilters = filters && typeof filters === 'object' ? filters : {};
      const safeTotal = Math.max(Number(total) || 0, 0);
      const safeDefaultLimit = Math.max(1, Number(defaultLimit) || 12);
      const safeMaxLimit = Math.max(safeDefaultLimit, Number(maxLimit) || safeDefaultLimit);
      const limit = Math.min(Math.max(Number.parseInt(String(nextFilters.limit || safeDefaultLimit), 10) || safeDefaultLimit, 1), safeMaxLimit);
      const maxOffset = safeTotal > 0 ? Math.max(0, Math.floor((safeTotal - 1) / limit) * limit) : 0;
      const offset = Math.min(Math.max(Number.parseInt(String(nextFilters.offset || '0'), 10) || 0, 0), maxOffset);
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
        pageEnd: returned > 0 ? offset + returned : 0
      };
    }

    function normalizeSystemUsersSummary(summary, fallbackTotal) {
      const source = summary && typeof summary === 'object' ? summary : {};
      return {
        total: Math.max(0, Number(source.total) || Number(fallbackTotal) || 0),
        admin: Math.max(0, Number(source.admin) || 0),
        unitAdmin: Math.max(0, Number(source.unitAdmin) || 0),
        securityWindow: Math.max(0, Number(source.securityWindow) || 0)
      };
    }

    function normalizeUnitContactReviewSummary(summary, fallbackTotal) {
      const source = summary && typeof summary === 'object' ? summary : {};
      return {
        total: Math.max(0, Number(source.total) || Number(fallbackTotal) || 0),
        pendingReview: Math.max(0, Number(source.pendingReview) || Number(source.pending_review) || 0),
        approved: Math.max(0, Number(source.approved) || 0),
        activationPending: Math.max(0, Number(source.activationPending) || Number(source.activation_pending) || 0),
        active: Math.max(0, Number(source.active) || 0),
        returned: Math.max(0, Number(source.returned) || 0),
        rejected: Math.max(0, Number(source.rejected) || 0)
      };
    }

    let cachedSystemUsersClient = null;
    let cachedUnitContactClient = null;

    function getSystemUsersPagedClient() {
      if (cachedSystemUsersClient) return cachedSystemUsersClient;
      if (typeof listSystemUsersPaged === 'function') { cachedSystemUsersClient = listSystemUsersPaged; return cachedSystemUsersClient; }
      const client = getAdminApiClient();
      if (client && typeof client.listSystemUsersPaged === 'function') { cachedSystemUsersClient = client.listSystemUsersPaged.bind(client); return cachedSystemUsersClient; }
      return null;
    }

    function getUnitContactApplicationsPagedClient() {
      if (cachedUnitContactClient) return cachedUnitContactClient;
      if (typeof listUnitContactApplicationsPaged === 'function') { cachedUnitContactClient = listUnitContactApplicationsPaged; return cachedUnitContactClient; }
      const client = getAdminApiClient();
      if (client && typeof client.listUnitContactApplicationsPaged === 'function') { cachedUnitContactClient = client.listUnitContactApplicationsPaged.bind(client); return cachedUnitContactClient; }
      return null;
    }

    function waitForPagedClient(getClient, timeoutMs) {
      const timeout = Math.max(50, Number(timeoutMs) || 400);
      const startedAt = Date.now();
      return new Promise((resolve) => {
        const tick = () => {
          let client = null;
          try {
            client = typeof getClient === 'function' ? getClient() : null;
          } catch (_) {
            client = null;
          }
          if (client) {
            resolve(client);
            return;
          }
          if ((Date.now() - startedAt) >= timeout) {
            resolve(null);
            return;
          }
          if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            window.setTimeout(tick, 25);
            return;
          }
          resolve(null);
        };
        tick();
      });
    }

    function getSharedPagerModule() {
      return typeof window !== 'undefined' && window.__ISMS_PAGER__ && typeof window.__ISMS_PAGER__ === 'object'
        ? window.__ISMS_PAGER__
        : null;
    }

    function getAdminCollectionOffsetByPageNumber(page, targetPage) {
      const pager = getSharedPagerModule();
      if (pager && typeof pager.getOffsetByPageNumber === 'function') {
        return pager.getOffsetByPageNumber(page, targetPage, 12);
      }
      const safePageCount = Math.max(1, Number(page && page.pageCount) || 1);
      const safeLimit = Math.max(1, Number(page && page.limit) || 12);
      const parsed = Number.parseInt(String(targetPage || '').trim(), 10);
      const safeTargetPage = Math.min(safePageCount, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
      return (safeTargetPage - 1) * safeLimit;
    }

    function formatAdminCollectionSummary(page, emptyText) {
      const pager = getSharedPagerModule();
      if (pager && typeof pager.formatPageSummary === 'function') {
        return pager.formatPageSummary(page, emptyText, 12);
      }
      const safePage = page && typeof page === 'object' ? page : {};
      if (!Number(safePage.total || 0)) {
        return emptyText || '目前沒有符合條件的資料';
      }
      return `第 ${safePage.currentPage || 0} / ${safePage.pageCount || 0} 頁，顯示 ${safePage.pageStart || 0}-${safePage.pageEnd || 0} / ${safePage.total || 0} 筆`;
    }

    function renderAdminCollectionPager(config) {
      const defaultLimit = Math.max(1, Number(config && config.defaultLimit || 12) || 12);
      const limitOptions = Array.isArray(config && config.limitOptions) && config.limitOptions.length
        ? config.limitOptions.map((value) => String(value))
        : ['12', '24', '48'];
      const pager = getSharedPagerModule();
      if (pager && typeof pager.renderPagerToolbar === 'function') {
        return pager.renderPagerToolbar({
          ...(config || {}),
          esc,
          ic,
          defaultLimit,
          limitOptions,
          toolbarStyle: 'margin:14px 0 0'
        });
      }
      const page = getSafeAdminCollectionPage(config && config.page, defaultLimit);
      const pageMax = Math.max(1, Number(page.pageCount) || 1);
      const pageValue = Math.max(1, Number(page.currentPage) || 1);
      const disableJump = Number(page.total || 0) > 0 ? '' : 'disabled';
      const idPrefix = String(config && config.idPrefix || '').trim();
      const actionPrefix = String(config && config.actionPrefix || '').trim();
      const summary = String(config && config.summary || formatAdminCollectionSummary(page)).trim();
      const limitValue = String(page.limit || '');
      const limitOptionsHtml = limitOptions
        .map((value) => `<option value="${esc(value)}" ${limitValue === value ? 'selected' : ''}>${esc(value)}</option>`)
        .join('');
      const actionAttr = function (suffix) {
        return actionPrefix ? ` data-action="${esc(actionPrefix)}${suffix}"` : '';
      };
      return `<div class="review-toolbar review-toolbar--compact review-toolbar--gap-top"><div class="review-toolbar-main"><span class="review-card-subtitle">${esc(summary)}</span></div><div class="review-toolbar-actions"><label class="form-label review-toolbar-label-inline" for="${esc(idPrefix)}-page-limit">每頁</label><select class="form-select review-page-limit-select" id="${esc(idPrefix)}-page-limit">${limitOptionsHtml}</select><button type="button" class="btn btn-secondary btn-sm" id="${esc(idPrefix)}-first-page"${actionAttr('FirstPage')} ${page.hasPrev ? '' : 'disabled'}>${ic('chevrons-left', 'icon-sm')} 首頁</button><button type="button" class="btn btn-secondary btn-sm" id="${esc(idPrefix)}-prev-page"${actionAttr('PrevPage')} ${page.hasPrev ? '' : 'disabled'}>${ic('chevron-left', 'icon-sm')} 上一頁</button><span class="review-card-subtitle review-page-status">頁次 ${page.currentPage || 0} / ${page.pageCount || 0}</span><label class="form-label review-page-jump-label" for="${esc(idPrefix)}-page-number">跳至</label><input type="number" class="form-input review-page-jump-input" id="${esc(idPrefix)}-page-number" min="1" max="${pageMax}" value="${pageValue}" ${disableJump}><button type="button" class="btn btn-secondary btn-sm" id="${esc(idPrefix)}-jump-page"${actionAttr('JumpPage')} ${disableJump}>前往</button><button type="button" class="btn btn-secondary btn-sm" id="${esc(idPrefix)}-next-page"${actionAttr('NextPage')} ${page.hasNext ? '' : 'disabled'}>下一頁 ${ic('chevron-right', 'icon-sm')}</button><button type="button" class="btn btn-secondary btn-sm" id="${esc(idPrefix)}-last-page"${actionAttr('LastPage')} ${page.hasNext ? '' : 'disabled'}>末頁 ${ic('chevrons-right', 'icon-sm')}</button></div></div>`;
    }

    function bindAdminCollectionPager(config) {
      const defaultLimit = Math.max(1, Number(config && config.defaultLimit || 12) || 12);
      const getOffsetByPageNumber = config && typeof config.getOffsetByPageNumber === 'function'
        ? config.getOffsetByPageNumber
        : getAdminCollectionOffsetByPageNumber;
      const pager = getSharedPagerModule();
      if (pager && typeof pager.bindPagerControls === 'function') {
        pager.bindPagerControls({
          ...(config || {}),
          defaultLimit,
          getOffsetByPageNumber
        });
        return;
      }
      const idPrefix = String(config && config.idPrefix || '').trim();
      const page = getSafeAdminCollectionPage(config && config.page, defaultLimit);
      const onChange = config && typeof config.onChange === 'function' ? config.onChange : null;
      const actionPrefix = String(config && config.actionPrefix || '').trim();
      if (!idPrefix || !onChange) return;
      const limitSelect = document.getElementById(`${idPrefix}-page-limit`);
      const pageNumberInput = document.getElementById(`${idPrefix}-page-number`);
      const queryAction = function (suffix, actionName) {
        const byId = document.getElementById(`${idPrefix}-${suffix}`);
        if (byId) return byId;
        if (!actionPrefix) return null;
        return document.querySelector(`[data-action="${CSS.escape(actionPrefix + actionName)}"]`);
      };
      const firstButton = queryAction('first-page', 'FirstPage');
      const prevButton = queryAction('prev-page', 'PrevPage');
      const jumpButton = queryAction('jump-page', 'JumpPage');
      const nextButton = queryAction('next-page', 'NextPage');
      const lastButton = queryAction('last-page', 'LastPage');
      if (limitSelect) {
        bindAdminPageEvent(limitSelect, 'change', () => onChange({
          limit: String(limitSelect.value || ''),
          offset: '0'
        }));
      }
      if (pageNumberInput) {
        bindAdminPageEvent(pageNumberInput, 'keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const nextOffset = getOffsetByPageNumber(page, pageNumberInput.value || '1');
          onChange({ offset: String(nextOffset) });
        });
      }
      if (jumpButton && pageNumberInput) {
        bindAdminPageEvent(jumpButton, 'click', () => {
          const nextOffset = getOffsetByPageNumber(page, pageNumberInput.value || '1');
          onChange({ offset: String(nextOffset) });
        });
      }
      if (firstButton) {
        bindAdminPageEvent(firstButton, 'click', () => onChange({ offset: '0' }));
      }
      if (prevButton) {
        bindAdminPageEvent(prevButton, 'click', () => onChange({ offset: String(page.prevOffset || 0) }));
      }
      if (nextButton) {
        bindAdminPageEvent(nextButton, 'click', () => onChange({ offset: String(page.nextOffset || 0) }));
      }
      if (lastButton) {
        bindAdminPageEvent(lastButton, 'click', () => {
          const nextOffset = getOffsetByPageNumber(page, page.pageCount || 1);
          onChange({ offset: String(nextOffset) });
        });
      }
    }

    function summarizeGovernanceItems(items) {
      return (Array.isArray(items) ? items : []).reduce((result, unit) => {
        result.total += 1;
        if (String(unit && unit.mode || 'independent').trim() === 'consolidated') result.consolidated += 1;
        else result.independent += 1;
        result.children += Array.isArray(unit && unit.children) ? unit.children.length : 0;
        return result;
      }, { total: 0, consolidated: 0, independent: 0, children: 0 });
    }

    function normalizeCategorySummaryMap(value, projector) {
      const source = value && typeof value === 'object' ? value : {};
      return Object.keys(source).reduce((result, category) => {
        const normalizedCategory = String(category || '').trim();
        if (!normalizedCategory) return result;
        result[normalizedCategory] = projector(source[category], normalizedCategory);
        return result;
      }, {});
    }

    function summarizeGovernanceCategoryItems(items, category) {
      const summary = summarizeGovernanceItems(items);
      return {
        category: String(category || '').trim(),
        unitCount: Number(summary.total || 0),
        consolidatedCount: Number(summary.consolidated || 0),
        independentCount: Number(summary.independent || 0),
        childCount: Number(summary.children || 0)
      };
    }

    function normalizeGovernanceCategorySummaries(value) {
      return normalizeCategorySummaryMap(value, function (summary, category) {
        const safe = summary && typeof summary === 'object' ? summary : {};
        return {
          category,
          unitCount: Number(safe.unitCount || safe.total || 0),
          consolidatedCount: Number(safe.consolidatedCount || safe.consolidated || 0),
          independentCount: Number(safe.independentCount || safe.independent || 0),
          childCount: Number(safe.childCount || safe.children || 0)
        };
      });
    }

    function buildGovernanceCategorySummaryMap(items, categoryFilter) {
      const rows = Array.isArray(items) ? items : [];
      const categories = categoryFilter && categoryFilter !== 'all'
        ? [String(categoryFilter).trim()]
        : Array.from(new Set(rows.map((item) => String(item && item.category || '').trim()).filter(Boolean)));
      return categories.reduce((result, category) => {
        result[category] = summarizeGovernanceCategoryItems(rows.filter((item) => String(item && item.category || '').trim() === category), category);
        return result;
      }, {});
    }

    async function listGovernanceItemsForAdmin(filters) {
      const nextFilters = normalizePagedFilters(filters, DEFAULT_GOVERNANCE_FILTERS);
      if (!isRemoteGovernanceEnabled()) {
        const items = (Array.isArray(getGovernanceTopLevelUnits()) ? getGovernanceTopLevelUnits() : []).filter((unit) => {
          const keyword = String(nextFilters.keyword || '').trim().toLowerCase();
          const modeFilter = String(nextFilters.mode || 'all').trim();
          const categoryFilter = String(nextFilters.category || 'all').trim();
          if (modeFilter !== 'all' && String(unit && unit.mode || 'independent').trim() !== modeFilter) return false;
          if (categoryFilter !== 'all' && String(unit && unit.category || '').trim() !== categoryFilter) return false;
          if (!keyword) return true;
          const haystack = [unit && unit.unit, unit && unit.category, unit && unit.mode, unit && unit.note, (unit && unit.children) || []]
            .flat()
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(keyword);
        });
        const page = buildAdminCollectionPage(nextFilters, items.length, 12, ADMIN_COLLECTION_FILTER_INVENTORY_LIMIT);
        return {
          items: items.slice(page.offset, page.offset + page.limit),
          page,
          summary: summarizeGovernanceItems(items),
          categorySummaries: buildGovernanceCategorySummaryMap(items, nextFilters.category),
          filters: nextFilters,
          generatedAt: new Date().toISOString()
        };
      }
      const client = getAdminApiClient();
      const response = await client.listUnitGovernanceEntries(nextFilters);
      return {
        items: Array.isArray(response && response.items) ? response.items : [],
        page: response && response.page ? response.page : buildAdminCollectionPage(nextFilters, response && response.total, 12, ADMIN_COLLECTION_FILTER_INVENTORY_LIMIT),
        summary: response && response.summary ? response.summary : summarizeGovernanceItems(response && response.items),
        categorySummaries: normalizeGovernanceCategorySummaries(response && response.categorySummaries),
        filters: { ...nextFilters, ...(response && response.filters ? response.filters : {}) },
        generatedAt: String(response && response.generatedAt || '').trim() || new Date().toISOString()
      };
    }

    async function saveGovernanceModeForAdmin(unit, mode, note) {
      const actor = currentUser() || {};
      if (isRemoteGovernanceEnabled()) {
        const client = getAdminApiClient();
        const response = await client.upsertUnitGovernanceEntry({
          unit,
          mode,
          note,
          actorName: String(actor.name || '').trim(),
          actorUsername: String(actor.username || '').trim()
        });
        if (typeof setUnitGovernanceMode === 'function') {
          setUnitGovernanceMode(unit, mode, String(actor.name || '').trim(), note);
        }
        return response && response.item ? response.item : null;
      }
      return setUnitGovernanceMode(unit, mode, String(actor.name || '').trim(), note);
    }

    async function fetchSecurityWindowInventoryFromSource(filters) {
      const nextFilters = normalizePagedFilters(filters, DEFAULT_SECURITY_WINDOW_FILTERS);
      if (isRemoteGovernanceEnabled()) {
        const client = getAdminApiClient();
        const response = await client.getSecurityWindowInventory(nextFilters);
        return {
          inventory: response && response.inventory ? response.inventory : buildEmptySecurityWindowInventory(),
          page: response && response.page ? response.page : buildAdminCollectionPage(nextFilters, response && response.total, 12, ADMIN_COLLECTION_FILTER_INVENTORY_LIMIT),
          filters: { ...nextFilters, ...(response && response.filters ? response.filters : {}) },
          categorySummaries: normalizeSecurityWindowCategorySummaries((response && response.categorySummaries) || (response && response.inventory && response.inventory.categorySummaries))
        };
      }
      const applications = await listUnitContactApplications({ limit: '200' });
      const inventory = buildSecurityWindowInventory(getUsers(), Array.isArray(applications) ? applications : []);
      const filteredInventory = filterSecurityWindowInventory(inventory, nextFilters);
      const page = buildAdminCollectionPage(nextFilters, Array.isArray(filteredInventory.units) ? filteredInventory.units.length : 0, 12, ADMIN_COLLECTION_FILTER_INVENTORY_LIMIT);
      return {
        inventory: {
          ...filteredInventory,
          units: Array.isArray(filteredInventory.units) ? filteredInventory.units.slice(page.offset, page.offset + page.limit) : []
        },
        page,
        filters: nextFilters,
        categorySummaries: buildSecurityWindowCategorySummaryMap(filteredInventory.units, nextFilters.category)
      };
    }

    function getAuditTrailEventTypeOptions(summary, items) {
      const summaryOptions = Array.isArray(summary && summary.eventTypes) ? summary.eventTypes : [];
      const itemOptions = Array.isArray(items)
        ? items.map((entry) => entry && entry.eventType)
        : [];
      const source = summaryOptions.length ? summaryOptions : itemOptions;
      return Array.from(new Set(source.map((value) => String(value || '').trim()).filter(Boolean)))
        .sort((left, right) => String(left).localeCompare(String(right), 'zh-Hant'));
    }

    function getAuditTrailFilterSignature(filters) {
      const next = { ...DEFAULT_AUDIT_FILTERS, ...(filters || {}) };
      return [
        next.keyword,
        next.eventType,
        next.occurredFrom,
        next.occurredTo,
        next.actorEmail,
        next.targetEmail,
        next.unitCode,
        next.recordId,
        next.limit,
        next.offset
      ].map((value) => String(value || '').trim()).join('|');
    }

    function getAuditTrailSummarySignature(filters) {
      const next = { ...DEFAULT_AUDIT_FILTERS, ...(filters || {}) };
      return [
        next.keyword,
        next.eventType,
        next.occurredFrom,
        next.occurredTo,
        next.actorEmail,
        next.targetEmail,
        next.unitCode,
        next.recordId
      ].map((value) => String(value || '').trim()).join('|');
    }

    function normalizeAuditTrailSummary(summary) { return window._adminAuditTrail.normalizeAuditTrailSummary(summary); }

    function serializeAuditTrailSummary(summary) {
      const safe = normalizeAuditTrailSummary(summary);
      return [safe.total, safe.actorCount, safe.latestOccurredAt, safe.eventTypes.join(',')].join('|');
    }

    function readAuditTrailSummary(filters, force) {
      const signature = getAuditTrailSummarySignature(filters);
      if (auditTrailSummaryCache.signature !== signature) return null;
      if (!auditTrailSummaryCache.summary) return null;
      const age = Date.now() - Number(auditTrailSummaryCache.fetchedAt || 0);
      if (force || age > AUDIT_TRAIL_SUMMARY_CACHE_MS) return null;
      return normalizeAuditTrailSummary(auditTrailSummaryCache.summary);
    }

    function resetAuditTrailSummaryBootstrapState() {
      const timer = Number(auditTrailSummaryBootstrapState.timer || 0);
      if (timer && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
        window.clearTimeout(timer);
      }
      auditTrailSummaryBootstrapState = { signature: '', timer: 0, attempt: 0 };
    }

    function primeAuditTrailSummary(filters, options) {
      const summaryFilters = { ...DEFAULT_AUDIT_FILTERS, ...(filters || {}), summaryOnly: '1', limit: '50', offset: '0' };
      const signature = getAuditTrailSummarySignature(summaryFilters);
      return primeAdminSummaryCache(auditTrailSummaryCache, {
        signature,
        force: !!(options && options.force),
        replaceState: replaceAdminCacheState,
        defaults: { signature: '', summary: null, fetchedAt: 0, promise: null },
        load: function () { return fetchAuditTrailEntries(summaryFilters); },
        normalize: function (response) {
          return normalizeAuditTrailSummary(response && response.summary);
        },
        onSuccess: function () {
          if (auditTrailSummaryBootstrapState.signature === signature) resetAuditTrailSummaryBootstrapState();
        }
      });
    }

    function queueAuditTrailSummaryBootstrap(filters) {
      const signature = getAuditTrailSummarySignature(filters);
      if (readAuditTrailSummary(filters, false)) {
        if (auditTrailSummaryBootstrapState.signature === signature) resetAuditTrailSummaryBootstrapState();
        return;
      }
      if (auditTrailSummaryCache.signature === signature && auditTrailSummaryCache.promise) return;
      if (auditTrailSummaryBootstrapState.signature !== signature) {
        resetAuditTrailSummaryBootstrapState();
        auditTrailSummaryBootstrapState.signature = signature;
      }
      if (auditTrailSummaryBootstrapState.timer) return;
      if (auditTrailSummaryBootstrapState.attempt >= AUDIT_TRAIL_SUMMARY_BOOTSTRAP_DELAYS.length) return;
      const delay = AUDIT_TRAIL_SUMMARY_BOOTSTRAP_DELAYS[auditTrailSummaryBootstrapState.attempt];
      auditTrailSummaryBootstrapState.attempt += 1;
      auditTrailSummaryBootstrapState.timer = window.setTimeout(() => {
        auditTrailSummaryBootstrapState.timer = 0;
        if (readAuditTrailSummary(filters, false)) {
          resetAuditTrailSummaryBootstrapState();
          return;
        }
        primeAuditTrailSummary(filters).then((summary) => {
          if (!String(window.location.hash || '').startsWith('#audit-trail')) return;
          if (serializeAuditTrailSummary(summary) !== serializeAuditTrailSummary(auditTrailState.summary)) {
            renderAuditTrail({ ...auditTrailState.filters });
          }
        }).catch((error) => {
          window.__ismsWarn('audit trail summary bootstrap failed', error);
        }).finally(() => {
          resetAuditTrailSummaryBootstrapState();
        });
      }, delay);
    }

    function isAuditTrailDataFresh(signature) {
      if (!signature || auditTrailState.filterSignature !== signature) return false;
      if (!Array.isArray(auditTrailState.items)) return false;
      const parsedAt = Date.parse(String(auditTrailState.lastLoadedAt || '').trim());
      if (!Number.isFinite(parsedAt)) return false;
      return (Date.now() - parsedAt) < AUDIT_TRAIL_SYNC_FRESHNESS_MS;
    }

    function isAuditTrailHealthFresh() {
      if (!auditTrailHealthCache || !auditTrailHealthCache.value) return false;
      return (Date.now() - Number(auditTrailHealthCache.loadedAt || 0)) < AUDIT_TRAIL_HEALTH_CACHE_MS;
    }

    function getAuditTrailQueryCacheRecord(signature) {
      if (!signature) return null;
      const hit = auditTrailQueryCache.get(signature);
      const cached = hit && Object.prototype.hasOwnProperty.call(hit, 'value') ? hit.value : hit;
      if (!cached || !cached.value) return null;
      return {
        loadedAt: Number(cached.loadedAt || 0),
        value: cached.value,
        fresh: (Date.now() - Number(cached.loadedAt || 0)) < AUDIT_TRAIL_QUERY_CACHE_MS
      };
    }

    function getAuditTrailQueryCacheValue(signature) {
      const record = getAuditTrailQueryCacheRecord(signature);
      return record ? record.value : null;
    }

    function getFreshAuditTrailQueryCacheValue(signature) {
      const record = getAuditTrailQueryCacheRecord(signature);
      return record && record.fresh ? record.value : null;
    }

    function setAuditTrailQueryCacheValue(signature, value) {
      if (!signature || !value) return;
      auditTrailQueryCache.set(signature, {
        loadedAt: Date.now(),
        value
      });
    }

    function getAuditTrailLoadPromise(signature) {
      if (!signature) return null;
      return auditTrailLoadPromiseMap.get(signature) || null;
    }

    function isAuditTrailQueryFresh(signature) {
      const record = getAuditTrailQueryCacheRecord(signature);
      return !!(record && record.fresh);
    }

    function getAuditTrailFiltersFromDom() {
      const next = {
        ...auditTrailState.filters,
        keyword: String(document.getElementById('audit-keyword')?.value || '').trim(),
        eventType: String(document.getElementById('audit-event-type')?.value || '').trim(),
        occurredFrom: String(document.getElementById('audit-occurred-from')?.value || '').trim(),
        occurredTo: String(document.getElementById('audit-occurred-to')?.value || '').trim(),
        actorEmail: String(document.getElementById('audit-actor-email')?.value || '').trim(),
        targetEmail: String(document.getElementById('audit-target-email')?.value || '').trim(),
        unitCode: String(document.getElementById('audit-unit-code')?.value || '').trim(),
        recordId: String(document.getElementById('audit-record-id')?.value || '').trim(),
        limit: String(document.getElementById('audit-limit')?.value || '50').trim(),
        offset: '0'
      };
      return next;
    }

    function normalizeAuditTrailPage(page, filters, items) {
      const resolvedFilters = { ...DEFAULT_AUDIT_FILTERS, ...(filters || {}) };
      const limit = Math.max(1, Math.min(Number(resolvedFilters.limit || 100) || 100, 200));
      const currentItems = Array.isArray(items) ? items : [];
      const total = Number(page && page.total);
      const safeTotal = Number.isFinite(total) && total >= 0 ? total : currentItems.length;
      const offset = Math.max(0, Math.min(Number(page && page.offset) || 0, safeTotal > 0 ? Math.max(0, Math.floor((safeTotal - 1) / limit) * limit) : 0));
      const pageCount = Number(page && page.pageCount);
      const safePageCount = Number.isFinite(pageCount) && pageCount >= 0 ? pageCount : (safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / limit)) : 0);
      const currentPage = Number(page && page.currentPage);
      const safeCurrentPage = Number.isFinite(currentPage) && currentPage >= 0 ? currentPage : (safeTotal > 0 ? Math.floor(offset / limit) + 1 : 0);
      const hasPrev = !!(page && page.hasPrev);
      const hasNext = !!(page && page.hasNext);
      return {
        offset,
        limit,
        total: safeTotal,
        pageCount: safePageCount,
        currentPage: safeCurrentPage,
        hasPrev,
        hasNext,
        prevOffset: Number.isFinite(Number(page && page.prevOffset)) ? Math.max(0, Number(page.prevOffset)) : Math.max(0, offset - limit),
        nextOffset: Number.isFinite(Number(page && page.nextOffset)) ? Math.max(0, Number(page.nextOffset)) : (hasNext ? offset + limit : offset),
        pageStart: Number.isFinite(Number(page && page.pageStart)) ? Number(page.pageStart) : (currentItems.length ? offset + 1 : 0),
        pageEnd: Number.isFinite(Number(page && page.pageEnd)) ? Number(page.pageEnd) : (currentItems.length ? offset + currentItems.length : 0)
      };
    }

    function getAuditTrailPageSummary(page) {
      const total = Math.max(0, Number(page && page.total) || 0);
      const currentPage = Math.max(0, Number(page && page.currentPage) || 0);
      const pageCount = Math.max(0, Number(page && page.pageCount) || 0);
      const pageStart = Math.max(0, Number(page && page.pageStart) || 0);
      const pageEnd = Math.max(0, Number(page && page.pageEnd) || 0);
      if (!total) return '目前沒有符合條件的稽核紀錄';
      return `第 ${currentPage || 1} / ${pageCount || 1} 頁 · 顯示 ${pageStart}-${pageEnd} / 共 ${total} 筆`;
    }

    function getAuditTrailPageActionMeta(page) {
      const currentPage = Math.max(0, Number(page && page.currentPage) || 0);
      const pageCount = Math.max(0, Number(page && page.pageCount) || 0);
      const limit = Math.max(1, Number(page && page.limit) || 50);
      return {
        currentPage,
        pageCount,
        limit,
        summary: getAuditTrailPageSummary(page),
        hasPrev: !!(page && page.hasPrev),
        hasNext: !!(page && page.hasNext),
        isEmpty: !Number(page && page.total)
      };
    }

    function getSafeAdminCollectionPage(page, defaultLimit) {
      const moduleApi = getAdminCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createPage === 'function') {
        const basePage = moduleApi.createPage(defaultLimit);
        return {
          ...basePage,
          ...(page && typeof page === 'object' ? page : {}),
          prevOffset: Math.max(0, Number(page && page.prevOffset) || 0),
          nextOffset: Math.max(0, Number(page && page.nextOffset) || 0)
        };
      }
      return {
        offset: Math.max(0, Number(page && page.offset) || 0),
        limit: Math.max(1, Number(page && page.limit) || Number(defaultLimit) || 20),
        total: Math.max(0, Number(page && page.total) || 0),
        pageCount: Math.max(0, Number(page && page.pageCount) || 0),
        currentPage: Math.max(0, Number(page && page.currentPage) || 0),
        hasPrev: !!(page && page.hasPrev),
        hasNext: !!(page && page.hasNext),
        prevOffset: Math.max(0, Number(page && page.prevOffset) || 0),
        nextOffset: Math.max(0, Number(page && page.nextOffset) || 0),
        pageStart: Math.max(0, Number(page && page.pageStart) || 0),
        pageEnd: Math.max(0, Number(page && page.pageEnd) || 0)
      };
    }

    function renderAuditTrailPager(page) {
      const meta = getAuditTrailPageActionMeta(page);
      return renderAdminCollectionPager({
        idPrefix: 'audit',
        page: meta,
        summary: meta.summary,
        defaultLimit: 50,
        limitOptions: ['50', '100', '200'],
        getOffsetByPageNumber: getAuditTrailOffsetByPageNumber
      });
    }

    // ─── Audit Trail row/skeleton building: delegated to admin-audit-trail-module.js ───
    function buildAuditTrailLoadingMarkup(filters, summary) {
      return window._adminAuditTrail.buildAuditTrailLoadingMarkup(filters, summary, { normalizeAuditTrailPage: normalizeAuditTrailPage, buildReviewTableShell: buildReviewTableShell });
    }
    function getAuditTrailOffsetByPageNumber(page, targetPage) {
      const meta = getAuditTrailPageActionMeta(page);
      const safePageCount = Math.max(1, meta.pageCount || 1);
      const safeTargetPage = Math.min(Math.max(1, Number(targetPage) || 1), safePageCount);
      return Math.max(0, (safeTargetPage - 1) * meta.limit);
    }

    function buildAuditTrailRow(entry, index) { return window._adminAuditTrail.buildAuditTrailRow(entry, index); }
    function buildAuditTrailEmptyRow() { return window._adminAuditTrail.buildAuditTrailEmptyRow(); }
    function buildAuditTrailVirtualSpacer(height) { return window._adminAuditTrail.buildAuditTrailVirtualSpacer(height); }

    function getAuditTrailVirtualWindow(totalRows) {
      if (!auditTrailTableViewport || totalRows <= AUDIT_TRAIL_VIRTUAL_ROW_THRESHOLD) {
        return {
          enabled: false,
          start: 0,
          end: totalRows,
          padTop: 0,
          padBottom: 0
        };
      }
      const scrollTop = Math.max(0, Number(auditTrailTableViewport.scrollTop || 0));
      const viewportHeight = Math.max(ADMIN_MIN_VIRTUAL_VIEWPORT_HEIGHT, Number(auditTrailTableViewport.clientHeight || 0) || 0);
      const start = Math.max(0, Math.floor(scrollTop / AUDIT_TRAIL_VIRTUAL_ROW_HEIGHT) - AUDIT_TRAIL_VIRTUAL_ROW_OVERSCAN);
      const visibleCount = Math.ceil(viewportHeight / AUDIT_TRAIL_VIRTUAL_ROW_HEIGHT) + (AUDIT_TRAIL_VIRTUAL_ROW_OVERSCAN * 2);
      const end = Math.min(totalRows, start + visibleCount);
      return {
        enabled: true,
        start,
        end,
        padTop: start * AUDIT_TRAIL_VIRTUAL_ROW_HEIGHT,
        padBottom: Math.max(0, (totalRows - end) * AUDIT_TRAIL_VIRTUAL_ROW_HEIGHT)
      };
    }

    function renderAuditTrailRows(items) {
      const body = document.getElementById('audit-trail-table-body');
      if (!body) return;
      const safeItems = Array.isArray(items) ? items : [];
      if (!safeItems.length) {
        body.innerHTML = buildAuditTrailEmptyRow();
        return;
      }
      const virtualWindow = getAuditTrailVirtualWindow(safeItems.length);
      if (!virtualWindow.enabled) {
        body.innerHTML = safeItems.map((entry, index) => buildAuditTrailRow(entry, index)).join('');
        return;
      }
      const rowsHtml = safeItems
        .slice(virtualWindow.start, virtualWindow.end)
        .map((entry, offset) => buildAuditTrailRow(entry, virtualWindow.start + offset))
        .join('');
      body.innerHTML = buildAuditTrailVirtualSpacer(virtualWindow.padTop)
        + rowsHtml
        + buildAuditTrailVirtualSpacer(virtualWindow.padBottom);
    }

    function scheduleAuditTrailRowsRender() {
      if (auditTrailVirtualRowsRenderPending) return;
      auditTrailVirtualRowsRenderPending = true;
      window.requestAnimationFrame(function () {
        auditTrailVirtualRowsRenderPending = false;
        if (!String(window.location.hash || '').startsWith('#audit-trail')) return;
        renderAuditTrailRows(Array.isArray(auditTrailState.items) ? auditTrailState.items : []);
      });
    }

    function buildSystemUsersRow(user) {
      const primaryUnit = getPrimaryAuthorizedUnit(user) || '未指定';
      const isProtectedUser = String(user && user.username || '').trim() === 'admin' || String(user && user.role || '').trim() === ROLES.ADMIN;
      const actionButtons = [
        `<button class="btn btn-sm btn-secondary" data-action="admin.editUser" data-username="${esc(user.username)}" aria-label="編輯">${ic('edit-2', 'btn-icon-svg')}</button>`
      ];
      if (!isProtectedUser) {
        actionButtons.push(`<button class="btn btn-sm btn-danger" data-action="admin.deleteUser" data-username="${esc(user.username)}" aria-label="刪除">${ic('trash-2', 'btn-icon-svg')}</button>`);
      }
      return `<tr><td class="review-cell-strong">${esc(user.username)}</td><td>${esc(user.name)}</td><td><span class="badge-role ${getRoleBadgeClass(user.role)}">${getRoleLabel(user.role)}</span></td><td>${esc(formatSecurityRolesSummary(user.securityRoles))}</td><td>${esc(primaryUnit)}</td><td class="review-cell-secondary">${esc(formatUserUnitSummary(user))}</td><td class="review-cell-secondary">${esc(formatUserReviewUnitSummary(user))}</td><td class="review-cell-secondary">${esc(user.email || '')}</td><td><div class="user-actions">${actionButtons.join('')}</div></td></tr>`;
    }

    function buildSystemUsersEmptyRow() {
      return `<tr><td colspan="9"><div class="empty-state review-empty review-empty--spacious"><div class="empty-state-icon">${ic('users')}</div><div class="empty-state-title">目前沒有符合條件的帳號</div><div class="empty-state-desc">請調整篩選條件，或確認系統帳號後端是否已同步資料。</div></div></td></tr>`;
    }

    function buildSystemUsersVirtualSpacer(height) {
      return `<tr class="review-virtual-spacer" aria-hidden="true"><td class="review-virtual-spacer-cell" colspan="9" style="height:${Math.max(0, Math.round(height))}px"></td></tr>`;
    }

    function getSystemUsersVirtualWindow(totalRows) {
      if (!systemUsersTableViewport || totalRows <= SYSTEM_USERS_VIRTUAL_ROW_THRESHOLD) {
        return {
          enabled: false,
          start: 0,
          end: totalRows,
          padTop: 0,
          padBottom: 0
        };
      }
      const scrollTop = Math.max(0, Number(systemUsersTableViewport.scrollTop || 0));
      const viewportHeight = Math.max(ADMIN_MIN_VIRTUAL_VIEWPORT_HEIGHT, Number(systemUsersTableViewport.clientHeight || 0) || 0);
      const start = Math.max(0, Math.floor(scrollTop / SYSTEM_USERS_VIRTUAL_ROW_HEIGHT) - SYSTEM_USERS_VIRTUAL_ROW_OVERSCAN);
      const visibleCount = Math.ceil(viewportHeight / SYSTEM_USERS_VIRTUAL_ROW_HEIGHT) + (SYSTEM_USERS_VIRTUAL_ROW_OVERSCAN * 2);
      const end = Math.min(totalRows, start + visibleCount);
      return {
        enabled: true,
        start,
        end,
        padTop: start * SYSTEM_USERS_VIRTUAL_ROW_HEIGHT,
        padBottom: Math.max(0, (totalRows - end) * SYSTEM_USERS_VIRTUAL_ROW_HEIGHT)
      };
    }

    function renderSystemUsersRows(items) {
      const body = document.getElementById('system-users-table-body');
      if (!body) return;
      const users = Array.isArray(items) ? items : [];
      if (!users.length) {
        body.innerHTML = buildSystemUsersEmptyRow();
        return;
      }
      const virtualWindow = getSystemUsersVirtualWindow(users.length);
      if (!virtualWindow.enabled) {
        body.innerHTML = users.map((user) => buildSystemUsersRow(user)).join('');
        return;
      }
      const rowsHtml = users
        .slice(virtualWindow.start, virtualWindow.end)
        .map((user) => buildSystemUsersRow(user))
        .join('');
      body.innerHTML = buildSystemUsersVirtualSpacer(virtualWindow.padTop)
        + rowsHtml
        + buildSystemUsersVirtualSpacer(virtualWindow.padBottom);
    }

    function scheduleSystemUsersRowsRender() {
      if (systemUsersVirtualRowsRenderPending) return;
      systemUsersVirtualRowsRenderPending = true;
      const run = function () {
        systemUsersVirtualRowsRenderPending = false;
        if (!String(window.location.hash || '').startsWith('#users')) return;
        renderSystemUsersRows(Array.isArray(systemUsersState && systemUsersState.items) ? systemUsersState.items : []);
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(run);
        return;
      }
      window.setTimeout(run, 0);
    }

    // ─── Login Log rendering: delegated to admin-login-log-module.js ───
    function buildLoginLogRow(log) { return window._adminLoginLog.buildLoginLogRow(log, fmtTime); }
    function buildLoginLogEmptyRow() { return window._adminLoginLog.buildLoginLogEmptyRow(); }
    function buildLoginLogVirtualSpacer(height) { return window._adminLoginLog.buildLoginLogVirtualSpacer(height); }
    function getLoginLogVirtualWindow(totalRows) { return window._adminLoginLog.getLoginLogVirtualWindow(totalRows, loginLogTableViewport); }
    function renderLoginLogRows(items) { return window._adminLoginLog.renderLoginLogRows(items, loginLogTableViewport, fmtTime); }
    function scheduleLoginLogRowsRender() {
      if (loginLogVirtualRowsRenderPending) return;
      loginLogVirtualRowsRenderPending = true;
      const run = function () {
        loginLogVirtualRowsRenderPending = false;
        if (!String(window.location.hash || '').startsWith('#login-log')) return;
        renderLoginLogRows(loginLogItems);
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(run);
        return;
      }
      window.setTimeout(run, 0);
    }

    function showAuditEntryModal(index) {
      window._adminAuditTrail.showAuditEntryModal(index, auditTrailState.items, { toast: toast, closeModalRoot: closeModalRoot, refreshIcons: refreshIcons, bindAdminPageEvent: bindAdminPageEvent });
    }

    async function loadAuditTrailData(nextFilters, options) {
      const force = !!(options && options.force);
      const prefetch = !!(options && options.prefetch);
      const resolvedFilters = { ...DEFAULT_AUDIT_FILTERS, ...(nextFilters || {}) };
      resolvedFilters.limit = String(Math.max(1, Math.min(Number(resolvedFilters.limit || 100) || 100, 200)));
      resolvedFilters.offset = String(Math.max(0, Number(resolvedFilters.offset || 0) || 0));
      const filterSignature = getAuditTrailFilterSignature(resolvedFilters);
      const freshCachedState = !force ? getFreshAuditTrailQueryCacheValue(filterSignature) : null;
      if (freshCachedState && !prefetch) {
        return freshCachedState;
      }
      const pendingState = !force ? getAuditTrailLoadPromise(filterSignature) : null;
      if (pendingState) {
        return pendingState;
      }
      const pending = Promise.resolve()
        .then(async () => {
          const [health, response] = await Promise.all([
            getAuditTrailHealthSnapshot(force),
            fetchAuditTrailEntries(resolvedFilters)
          ]);
          const items = Array.isArray(response && response.items) ? response.items : [];
          const summary = response && response.summary && typeof response.summary === 'object'
            ? response.summary
            : { total: items.length, actorCount: 0, latestOccurredAt: '', eventTypes: [] };
          const page = normalizeAuditTrailPage(response && response.page, resolvedFilters, items);
          const state = {
            filters: resolvedFilters,
            items,
            summary,
            page,
            health,
            lastLoadedAt: new Date().toISOString(),
            filterSignature,
            loading: false
          };
          setAuditTrailQueryCacheValue(filterSignature, state);
          if (!prefetch) {
            auditTrailState.filters = state.filters;
            auditTrailState.items = state.items;
            auditTrailState.summary = state.summary;
            auditTrailState.page = state.page;
            auditTrailState.health = state.health;
            auditTrailState.lastLoadedAt = state.lastLoadedAt;
            auditTrailState.filterSignature = state.filterSignature;
            auditTrailState.loading = false;
            if (state.page && state.page.hasNext) {
              const nextOffset = Number(state.page.nextOffset);
              if (Number.isFinite(nextOffset) && nextOffset >= 0) {
                const nextFilters = { ...resolvedFilters, offset: String(nextOffset) };
                const nextSignature = getAuditTrailFilterSignature(nextFilters);
                if (!getAuditTrailQueryCacheValue(nextSignature) && !getAuditTrailLoadPromise(nextSignature)) {
                  loadAuditTrailData(nextFilters, { prefetch: true }).catch((error) => {
                    window.__ismsWarn('audit trail prefetch failed', error);
                  });
                }
              }
            }
          }
          return state;
        })
        .catch((error) => {
          window.__ismsWarn('audit trail fetch failed', error);
          const cachedState = !force ? getAuditTrailQueryCacheValue(filterSignature) : null;
          if (cachedState && !prefetch) {
            return cachedState;
          }
          throw error;
        })
        .finally(() => {
          if (auditTrailLoadPromiseMap.get(filterSignature) === pending) {
            auditTrailLoadPromiseMap.delete(filterSignature);
          }
        });
      auditTrailLoadPromiseMap.set(filterSignature, pending);
      return pending;
    }

    async function loadAllAuditTrailEntriesForExport(filters) {
      const resolvedFilters = { ...DEFAULT_AUDIT_FILTERS, ...(filters || {}) };
      resolvedFilters.limit = '200';
      resolvedFilters.offset = '0';
      const collected = [];
      const seen = new Set();
      let offset = 0;
      while (true) {
        const response = await fetchAuditTrailEntries({ ...resolvedFilters, offset: String(offset) });
        const pageItems = Array.isArray(response && response.items) ? response.items : [];
        pageItems.forEach((entry) => {
          const key = String(entry && entry.listItemId || entry && entry.recordId || entry && entry.occurredAt || '').trim();
          if (key && seen.has(key)) return;
          if (key) seen.add(key);
          collected.push(entry);
        });
        const page = response && response.page ? response.page : null;
        if (!page || !page.hasNext) break;
        const nextOffset = Number(page.nextOffset);
        if (!Number.isFinite(nextOffset) || nextOffset <= offset) break;
        offset = nextOffset;
      }
      return collected;
    }

    async function loadAuditTrailExportPayload(filters) {
      const resolvedFilters = { ...DEFAULT_AUDIT_FILTERS, ...(filters || auditTrailState.filters) };
      const items = await loadAllAuditTrailEntriesForExport(resolvedFilters);
      const health = auditTrailState.health || await getAuditTrailHealthSnapshot(false).catch(() => auditTrailState.health || null);
      const total = items.length;
      const summary = {
        total,
        actorCount: new Set(items.map((entry) => String(entry && entry.actorEmail || '').trim()).filter(Boolean)).size,
        latestOccurredAt: items.reduce((latest, entry) => {
          const occurredAt = String(entry && entry.occurredAt || '').trim();
          if (!occurredAt) return latest;
          if (!latest) return occurredAt;
          return occurredAt > latest ? occurredAt : latest;
        }, ''),
        eventTypes: getAuditTrailEventTypeOptions({ eventTypes: items.map((entry) => entry && entry.eventType) }, items)
      };
      return {
        exportedAt: new Date().toISOString(),
        filters: resolvedFilters,
        health,
        summary,
        page: {
          offset: 0,
          limit: total,
          total,
          pageCount: total ? 1 : 0,
          currentPage: total ? 1 : 0,
          hasPrev: false,
          hasNext: false,
          prevOffset: 0,
          nextOffset: 0,
          pageStart: total ? 1 : 0,
          pageEnd: total
        },
        items
      };
    }

    async function getAuditTrailHealthSnapshot(force) {
      if (!force && isAuditTrailHealthFresh()) {
        return auditTrailHealthCache.value;
      }
      if (!force && auditTrailHealthLoadPromise) {
        return auditTrailHealthLoadPromise;
      }
      const pending = Promise.resolve()
        .then(() => fetchAuditTrailHealth())
        .then((health) => {
          auditTrailHealthCache = {
            value: health,
            loadedAt: Date.now()
          };
          return health;
        })
        .catch((error) => {
          window.__ismsWarn('audit trail health fetch failed', error);
          if (auditTrailHealthCache && auditTrailHealthCache.value) {
            return auditTrailHealthCache.value;
          }
          throw error;
        })
        .finally(() => {
          if (auditTrailHealthLoadPromise === pending) {
            auditTrailHealthLoadPromise = null;
          }
        });
      auditTrailHealthLoadPromise = pending;
      return pending;
    }

    function getAuditTrailRenderSignature(state, health) {
      return buildAdminCollectionRenderSignature({
        filters: state && state.filters,
        filterSignature: state && state.filterSignature,
        page: state && state.page,
        summary: {
          ...(state && state.summary ? state.summary : {}),
          healthReady: !!(health && health.ready)
        },
        lastLoadedAt: state && state.lastLoadedAt,
        items: state && state.items,
        identity: function (item) {
          return String(item && (item.listItemId || item.recordId || item.occurredAt) || '');
        }
      });
    }

    function getGovernanceTopLevelUnitsSourceSignature() {
      return typeof getStoreTouchToken === 'function' ? String(getStoreTouchToken('cats_unit_review') || '') : '0';
    }

    function buildGovernanceTopLevelUnitIndex() {
      const entries = Array.isArray(UNIT_SEARCH_ENTRIES) ? UNIT_SEARCH_ENTRIES : [];
      const groups = new Map();
      entries.forEach((entry) => {
        const value = String(entry && entry.value || '').trim();
        if (!value) return;
        const parsed = splitUnitValue(value);
        const parent = String(parsed && parsed.parent || value).trim();
        const child = String(parsed && parsed.child || '').trim();
        if (!parent) return;
        if (!groups.has(parent)) {
          groups.set(parent, {
            unit: parent,
            category: String(entry && entry.category || '').trim(),
            children: new Set()
          });
        }
        if (child) groups.get(parent).children.add(child);
      });
      const approvedModeMap = new Map(getUnitGovernanceModes().map((entry) => [String(entry && entry.unit || '').trim(), entry]));
      return Array.from(groups.values())
        .map((group) => {
          const modeEntry = approvedModeMap.get(group.unit) || null;
          return {
            unit: group.unit,
            category: group.category || '',
            mode: modeEntry && modeEntry.mode === 'consolidated' ? 'consolidated' : 'independent',
            note: modeEntry && modeEntry.note ? modeEntry.note : '',
            updatedAt: modeEntry && modeEntry.updatedAt ? modeEntry.updatedAt : '',
            updatedBy: modeEntry && modeEntry.updatedBy ? modeEntry.updatedBy : '',
            children: Array.from(group.children).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
          };
        })
        .sort((a, b) => a.unit.localeCompare(b.unit, 'zh-Hant'));
    }

    function getGovernanceTopLevelUnits() {
      const sourceSignature = getGovernanceTopLevelUnitsSourceSignature();
      if (unitGovernanceTopLevelCache.signature !== sourceSignature || !Array.isArray(unitGovernanceTopLevelCache.value)) {
        unitGovernanceTopLevelCache = {
          signature: sourceSignature,
          value: buildGovernanceTopLevelUnitIndex(),
          filteredSignature: '',
          filteredValue: []
        };
      }
      const user = currentUser();
      const accessProfile = typeof getAccessProfile === 'function' ? getAccessProfile(user) : null;
      const scopeUnits = getGovernanceReviewScopeUnits(user);
      const isScopeAdmin = !!(accessProfile ? String(accessProfile.role || '').trim() === ROLES.ADMIN : isAdmin());
      const accessSignature = typeof getAccessProfileSignature === 'function'
        ? getAccessProfileSignature(user)
        : [
            String((accessProfile && accessProfile.username) || user && user.username || '').trim().toLowerCase(),
            String((accessProfile && accessProfile.activeUnit) || user && user.activeUnit || '').trim(),
            scopeUnits.join('\u001f')
          ].join('|');
      const filteredSignature = [
        sourceSignature,
        isScopeAdmin ? 'admin' : 'scoped',
        accessSignature
      ].join('||');
      if (unitGovernanceTopLevelCache.filteredSignature === filteredSignature && Array.isArray(unitGovernanceTopLevelCache.filteredValue)) {
        return unitGovernanceTopLevelCache.filteredValue;
      }
      const filtered = isScopeAdmin
        ? unitGovernanceTopLevelCache.value
        : unitGovernanceTopLevelCache.value.filter((group) => scopeUnits.includes(group.unit));
      unitGovernanceTopLevelCache.filteredSignature = filteredSignature;
      unitGovernanceTopLevelCache.filteredValue = filtered;
      return filtered;
    }

    const GOVERNANCE_CATEGORY_ORDER = ['行政單位', '學術單位', '中心 / 研究單位'];

    function normalizeGovernanceCategory(category) {
      const raw = String(category || '').trim();
      if (!raw) return null;
      if (GOVERNANCE_CATEGORY_ORDER.includes(raw)) return raw;
      if (raw.includes('行政')) return '行政單位';
      if (raw.includes('學術')) return '學術單位';
      if (raw.includes('中心') || raw.includes('研究')) return '中心 / 研究單位';
      return null;
    }

    function groupGovernanceUnitsByCategory(units) {
      const groups = new Map();
      (Array.isArray(units) ? units : []).forEach((unit) => {
        const category = normalizeGovernanceCategory(unit && unit.category);
        if (!category) return;
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(unit);
      });
      return GOVERNANCE_CATEGORY_ORDER
        .map((category) => ({ category, items: groups.get(category) || [] }))
        .filter((group) => Array.isArray(group.items) && group.items.length);
    }

    function buildGovernanceModeBadge(mode) {
      const normalized = String(mode || '').trim() === 'consolidated' ? 'consolidated' : 'independent';
      const label = normalized === 'consolidated' ? '合併填報' : '獨立填報';
      const cls = normalized === 'consolidated' ? 'badge-closed' : 'badge-pending';
      return `<span class="badge ${cls}"><span class="badge-dot"></span>${esc(label)}</span>`;
    }

    function buildGovernanceUnitCard(unit) {
      const childrenHtml = Array.isArray(unit.children) && unit.children.length
        ? unit.children.map((child) => `<span class="cl-governance-child-chip">${esc(child)}</span>`).join('')
        : '<span class="cl-governance-child-chip cl-governance-child-chip--muted">無下轄二級單位</span>';
      const modeLabel = unit.mode === 'consolidated' ? '合併 / 統一填報' : '獨立填報';
      const modeHint = unit.mode === 'consolidated'
        ? '轄下二級單位將視為已整併至一級單位，儀表板不再顯示為缺交。'
        : '轄下二級單位需各自填報，儀表板會分別追蹤進度。';
      return `<div class="card governance-card" data-governance-unit="${esc(unit.unit)}">
        <div class="card-header governance-card-header">
          <div>
            <div class="review-unit-name">${esc(unit.unit)}</div>
            <div class="review-card-subtitle review-card-subtitle--top-4">${esc(unit.category || '正式單位')}</div>
          </div>
          <div class="governance-card-status">${buildGovernanceModeBadge(unit.mode)}</div>
        </div>
        <div class="governance-card-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">填報模式</label>
              <select class="form-select governance-mode-select" data-governance-unit-mode="${esc(unit.unit)}">
                <option value="independent" ${unit.mode !== 'consolidated' ? 'selected' : ''}>獨立填報</option>
                <option value="consolidated" ${unit.mode === 'consolidated' ? 'selected' : ''}>合併 / 統一填報</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">說明</label>
              <textarea class="form-textarea governance-note-input" data-governance-unit-note="${esc(unit.unit)}" rows="3" placeholder="例如：主計室由一級單位統一代填；學院各系獨立填報。">${esc(unit.note || '')}</textarea>
            </div>
          </div>
          <div class="review-callout compact review-callout--spaced">
            <span class="review-callout-icon">${ic('building-2', 'icon-sm')}</span>
            <div>${esc(modeHint)}</div>
          </div>
          <div class="cl-governance-child-wrap">
            <div class="cl-governance-child-title">轄下二級單位</div>
            <div class="cl-governance-child-list">${childrenHtml}</div>
          </div>
          <div class="form-actions form-actions--end">
            <button type="button" class="btn btn-primary" data-action="admin.saveGovernanceMode" data-unit="${esc(unit.unit)}">${ic('save', 'icon-sm')} 儲存設定</button>
          </div>
        </div>
      </div>`;
    }

    function buildGovernanceCategoryBodyHtml(items) {
      const units = Array.isArray(items) ? items : [];
      return `<div class="security-window-group-stack security-window-group-stack--nested governance-group-stack governance-group-stack--nested">${units.map((unit) => buildGovernanceUnitCard(unit)).join('')}</div>`;
    }

    function getDeferredGovernanceCategoryBody(category) {
      const key = String(category || '').trim();
      const cache = unitGovernanceDeferredBodiesCache || {};
      const bodies = cache.htmlByCategory && typeof cache.htmlByCategory === 'object' ? cache.htmlByCategory : null;
      if (key && bodies && Object.prototype.hasOwnProperty.call(bodies, key)) {
        return String(bodies[key] || '');
      }
      const itemsByCategory = cache.itemsByCategory && typeof cache.itemsByCategory === 'object' ? cache.itemsByCategory : null;
      const items = key && itemsByCategory && Object.prototype.hasOwnProperty.call(itemsByCategory, key)
        ? itemsByCategory[key]
        : [];
      const bodyHtml = buildGovernanceCategoryBodyHtml(items);
      if (key) {
        if (!cache.htmlByCategory || typeof cache.htmlByCategory !== 'object') {
          unitGovernanceDeferredBodiesCache.htmlByCategory = {};
        }
        unitGovernanceDeferredBodiesCache.htmlByCategory[key] = bodyHtml;
      }
      return bodyHtml;
    }

    function hydrateGovernanceCategoryCard(detailsEl) {
      if (!detailsEl || !detailsEl.open) return;
      const body = detailsEl.querySelector('[data-governance-category-body]');
      if (!body || body.dataset.governanceLoaded === 'true') return;
      const category = String(detailsEl.dataset.governanceCategory || '').trim();
      const bodyHtml = getDeferredGovernanceCategoryBody(category);
      body.innerHTML = bodyHtml || '<div class="review-card-subtitle">目前沒有可顯示的治理設定。</div>';
      body.dataset.governanceLoaded = 'true';
      refreshIcons();
      if (typeof bindCopyButtons === 'function') bindCopyButtons(body);
      else if (window && typeof window.bindCopyButtons === 'function') window.bindCopyButtons(body);
    }

    function wireGovernanceCategoryCards(root) {
      const host = root && typeof root.querySelectorAll === 'function' ? root : document;
      host.querySelectorAll('[data-governance-category]').forEach((detailsEl) => {
        if (detailsEl.dataset.governanceToggleReady === 'true') {
          if (detailsEl.open) hydrateGovernanceCategoryCard(detailsEl);
          return;
        }
        detailsEl.dataset.governanceToggleReady = 'true';
        bindAdminPageEvent(detailsEl, 'toggle', function () {
          if (detailsEl.open) hydrateGovernanceCategoryCard(detailsEl);
        });
        if (detailsEl.open) hydrateGovernanceCategoryCard(detailsEl);
      });
    }

    function renderGovernanceCategoryCard(group, index, categorySummaries, options) {
      const items = Array.isArray(group && group.items) ? group.items : [];
      const category = String(group && group.category || '').trim() || '中心 / 研究單位';
      const deferBody = !(options && options.deferBody === false);
      const summary = categorySummaries && categorySummaries[category]
        ? categorySummaries[category]
        : summarizeGovernanceCategoryItems(items, category);
      const unitCount = Number(summary && summary.unitCount || items.length);
      const consolidatedCount = Number(summary && summary.consolidatedCount || 0);
      const independentCount = Number(summary && summary.independentCount || Math.max(unitCount - consolidatedCount, 0));
      const childCount = Number(summary && summary.childCount || 0);
      const summaryChips = [
        ['單位數', unitCount],
        ['合併填報', consolidatedCount],
        ['獨立填報', independentCount],
        ['轄下二級單位', childCount]
      ];
      const subtitle = `${category} · ${unitCount} 個一級單位`;
      const bodyHtml = deferBody
        ? '<div class="review-card-subtitle">展開後載入治理設定與轄下單位。</div>'
        : buildGovernanceCategoryBodyHtml(items);
      return `<details class="training-group-card security-window-category-card governance-category-card" data-governance-category="${esc(category)}"><summary class="training-group-summary security-window-summary security-window-category-summary governance-category-summary"><div><span class="training-group-title">${esc(category)}</span><div class="training-group-subtitle">${esc(subtitle)}</div><div class="training-group-summary-grid security-window-category-summary-grid governance-category-summary-grid">${summaryChips.map(([label, value]) => `<span class="training-group-summary-chip security-window-category-summary-chip governance-category-summary-chip"><strong>${esc(String(value || 0))}</strong><small>${esc(label)}</small></span>`).join('')}</div></div><div class="training-group-meta"><span class="security-window-category-tag governance-category-tag">${esc(category)}</span><span class="training-group-toggle">${ic('chevron-down', 'icon-sm')}</span></div></summary><div class="security-window-category-body governance-category-body" data-governance-category-body="${esc(category)}" data-governance-loaded="${deferBody ? 'false' : 'true'}">${bodyHtml}</div></details>`;
    }

    function getSecurityWindowFilterSignature(filters) {
      const next = {
        keyword: '',
        status: 'all',
        category: 'all',
        limit: String(DEFAULT_SECURITY_WINDOW_FILTERS.limit),
        offset: '0',
        ...(filters || {})
      };
      return [next.keyword, next.status, next.category, next.limit, next.offset]
        .map((value) => String(value || '').trim())
        .join('|');
    }

    function isSecurityWindowInventoryFresh() {
      if (!securityWindowInventoryCache || !securityWindowInventoryCache.value) return false;
      return (Date.now() - Number(securityWindowInventoryCache.loadedAt || 0)) < SECURITY_WINDOW_SYNC_FRESHNESS_MS;
    }

    function normalizeSecurityWindowPerson(user) {
      const profile = getAdminAccessProfile(user);
      const units = profile.authorizedUnits;
      const securityRoles = profile.securityRoles;
      return {
        username: String(user && user.username || '').trim(),
        name: String(user && user.name || '').trim(),
        email: String(user && user.email || '').trim(),
        role: String(user && user.role || '').trim(),
        units,
        securityRoles,
        hasWindow: securityRoles.length > 0,
        activeUnit: String(profile.activeUnit || profile.primaryUnit || units[0] || '').trim()
      };
    }

    function resolveSecurityWindowApplicationUnit(application) {
      const direct = String(application && application.unitValue || '').trim();
      if (direct) return direct;
      const primary = String(application && application.primaryUnit || '').trim();
      const secondary = String(application && application.secondaryUnit || '').trim();
      if (!primary) return '';
      return secondary ? composeUnitValue(primary, secondary) : primary;
    }

    function getSecurityWindowUnitStatusMeta(status) { return window._adminSecurityWindow.getSecurityWindowUnitStatusMeta(status); }

    function buildEmptySecurityWindowInventory() {
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
        }
      };
    }

    function normalizeSecurityWindowInventory(inventory) {
      const fallback = buildEmptySecurityWindowInventory();
      if (!inventory || typeof inventory !== 'object') return fallback;
      const units = Array.isArray(inventory.units) ? inventory.units : [];
      const people = Array.isArray(inventory.people) ? inventory.people : [];
      const summary = inventory.summary && typeof inventory.summary === 'object'
        ? inventory.summary
        : fallback.summary;
      return {
        generatedAt: String(inventory.generatedAt || fallback.generatedAt || ''),
        units,
        people,
        summary: {
          totalUnits: Number(summary.totalUnits || 0),
          unitsWithWindows: Number(summary.unitsWithWindows || 0),
          unitsWithoutWindows: Number(summary.unitsWithoutWindows || 0),
          peopleWithWindows: Number(summary.peopleWithWindows || 0),
          peopleWithoutWindow: Number(summary.peopleWithoutWindow || 0),
          pendingApplications: Number(summary.pendingApplications || 0),
          exemptedUnits: Number(summary.exemptedUnits || 0)
        }
      };
    }

    function summarizeSecurityWindowCategoryItems(units, category) { return window._adminSecurityWindow.summarizeSecurityWindowCategoryItems(units, category); }

    function normalizeSecurityWindowCategorySummaries(value) {
      return normalizeCategorySummaryMap(value, function (summary, category) {
        const safe = summary && typeof summary === 'object' ? summary : {};
        return {
          category,
          unitCount: Number(safe.unitCount || 0),
          assignedCount: Number(safe.assignedCount || 0),
          pendingCount: Number(safe.pendingCount || 0),
          missingCount: Number(safe.missingCount || 0),
          childCount: Number(safe.childCount || 0)
        };
      });
    }

    function buildSecurityWindowCategorySummaryMap(units, categoryFilter) {
      const rows = Array.isArray(units) ? units : [];
      const categories = categoryFilter && categoryFilter !== 'all'
        ? [String(categoryFilter).trim()]
        : Array.from(new Set(rows.map((unit) => String(unit && unit.category || '').trim()).filter(Boolean)));
      return categories.reduce((result, category) => {
        result[category] = summarizeSecurityWindowCategoryItems(rows.filter((unit) => String(unit && unit.category || '').trim() === category), category);
        return result;
      }, {});
    }

    function renderSecurityWindowPersonBadge(person) {
      return window._adminSecurityWindow.renderSecurityWindowPersonBadge(person);
    }

    function buildSecurityWindowInventory(users, applications) {
      const people = Array.isArray(users)
        ? users
          .filter((user) => String(user && user.role || '').trim() === ROLES.UNIT_ADMIN)
          .map(normalizeSecurityWindowPerson)
        : [];
      const holderMap = new Map();
      people.forEach((person) => {
        if (!person.hasWindow) return;
        person.units.forEach((unit) => {
          const key = String(unit || '').trim();
          if (!key) return;
          if (!holderMap.has(key)) holderMap.set(key, []);
          holderMap.get(key).push(person);
        });
      });

      const pendingMap = new Map();
      const pendingStatuses = new Set(['pending_review', 'returned', 'approved', 'activation_pending']);
      (Array.isArray(applications) ? applications : []).forEach((application) => {
        const status = String(application && application.status || '').trim();
        if (!pendingStatuses.has(status)) return;
        const unit = resolveSecurityWindowApplicationUnit(application);
        if (!unit) return;
        if (!pendingMap.has(unit)) pendingMap.set(unit, []);
        pendingMap.get(unit).push({
          id: String(application && application.id || '').trim(),
          applicantName: String(application && application.applicantName || '').trim(),
          applicantEmail: String(application && application.applicantEmail || '').trim(),
          status,
          securityRoles: normalizeSecurityRoles(application && application.securityRoles)
        });
      });

      const topUnits = getGovernanceTopLevelUnits();
      const uniquePersons = Array.from(new Map(people.map((person) => [person.username, person])).values())
        .sort((left, right) => String(left.name || left.username || '').localeCompare(String(right.name || right.username || ''), 'zh-Hant'));

      const units = topUnits.map((unit) => {
        const topUnit = String(unit && unit.unit || '').trim();
        const children = Array.isArray(unit && unit.children) ? unit.children.map((child) => String(child || '').trim()).filter(Boolean) : [];
        const scopeRows = [];

        const pushScopeRow = (unitValue, label, exempted) => {
          const holders = Array.from(new Map((holderMap.get(unitValue) || []).map((person) => [person.username, person])).values())
            .sort((left, right) => String(left.name || left.username || '').localeCompare(String(right.name || right.username || ''), 'zh-Hant'));
          const pending = Array.from(new Map((pendingMap.get(unitValue) || []).map((item) => [item.id || `${item.applicantEmail}:${item.status}`, item])).values())
            .sort((left, right) => String(right.id || '').localeCompare(String(left.id || '')));
          const hasWindow = holders.length > 0;
          const status = exempted ? 'exempted' : (hasWindow ? 'assigned' : (pending.length ? 'pending' : 'missing'));
          scopeRows.push({
            unit: unitValue,
            label,
            status,
            exempted,
            holders,
            pending,
            hasWindow,
            isTop: unitValue === topUnit
          });
        };

        pushScopeRow(topUnit, topUnit, false);
        children.forEach((child) => {
          const childUnit = composeUnitValue(topUnit, child);
          pushScopeRow(childUnit, child, String(unit && unit.mode || 'independent').trim() === 'consolidated');
        });

        const holders = Array.from(new Map(scopeRows.flatMap((row) => row.holders || []).map((person) => [person.username, person])).values())
          .sort((left, right) => String(left.name || left.username || '').localeCompare(String(right.name || right.username || ''), 'zh-Hant'));
        const pending = Array.from(new Map(scopeRows.flatMap((row) => row.pending || []).map((item) => [item.id || `${item.applicantEmail}:${item.status}`, item])).values())
          .sort((left, right) => String(right.id || '').localeCompare(String(left.id || '')));
        const hasWindow = holders.length > 0;
        const assignedRows = scopeRows.filter((row) => row.status === 'assigned').length;
        const missingRows = scopeRows.filter((row) => row.status === 'missing').length;
        const exemptedRows = scopeRows.filter((row) => row.status === 'exempted').length;
        const pendingRows = scopeRows.filter((row) => row.status === 'pending').length;

        return {
          unit: topUnit,
          category: String(unit && unit.category || '').trim(),
          mode: String(unit && unit.mode || 'independent').trim() === 'consolidated' ? 'consolidated' : 'independent',
          note: String(unit && unit.note || '').trim(),
          updatedAt: String(unit && unit.updatedAt || '').trim(),
          updatedBy: String(unit && unit.updatedBy || '').trim(),
          children,
          scopeRows,
          holders,
          pending,
          hasWindow,
          status: hasWindow ? 'assigned' : (pending.length ? 'pending' : 'missing'),
          assignedRows,
          missingRows,
          exemptedRows,
          pendingRows
        };
      });

      const summary = units.reduce((acc, unit) => {
        acc.totalUnits += 1;
        if (unit.hasWindow) acc.unitsWithWindows += 1; else acc.unitsWithoutWindows += 1;
        acc.peopleWithWindows += Array.isArray(unit.holders) ? unit.holders.length : 0;
        acc.pendingApplications += Array.isArray(unit.pending) ? unit.pending.length : 0;
        acc.exemptedUnits += unit.exemptedRows || 0;
        return acc;
      }, {
        totalUnits: 0,
        unitsWithWindows: 0,
        unitsWithoutWindows: 0,
        peopleWithWindows: 0,
        pendingApplications: 0,
        exemptedUnits: 0
      });

      const peopleWithoutWindow = uniquePersons.filter((person) => !person.hasWindow).length;
      return {
        units,
        people: uniquePersons,
        summary: {
          ...summary,
          peopleWithoutWindow
        },
        generatedAt: new Date().toISOString()
      };
    }

    function renderSecurityWindowPersonRows(items) {
      return window._adminSecurityWindow.renderSecurityWindowPersonRows(items);
    }

    // ─── Security Window rendering: delegated to admin-security-window-module.js ───
    function renderSecurityWindowScopeCard(row) { return window._adminSecurityWindow.renderSecurityWindowScopeCard(row); }
    function renderSecurityWindowScopeSection(title, subtitle, rows, emptyText) { return window._adminSecurityWindow.renderSecurityWindowScopeSection(title, subtitle, rows, emptyText); }
    function renderSecurityWindowScopeRows(unit) { return window._adminSecurityWindow.renderSecurityWindowScopeRows(unit); }
    const SECURITY_WINDOW_CATEGORY_ORDER = window._adminSecurityWindow.SECURITY_WINDOW_CATEGORY_ORDER;
    function normalizeSecurityWindowCategory(category) { return window._adminSecurityWindow.normalizeSecurityWindowCategory(category); }
    function groupSecurityWindowUnitsByCategory(units) { return window._adminSecurityWindow.groupSecurityWindowUnitsByCategory(units); }
    function renderSecurityWindowUnitCard(unit) { return window._adminSecurityWindow.renderSecurityWindowUnitCard(unit); }
    function renderSecurityWindowCategoryCard(group, index, categorySummaries) { return window._adminSecurityWindow.renderSecurityWindowCategoryCard(group, index, categorySummaries); }
    function renderSecurityWindowUnitCards(units, categorySummaries) { return window._adminSecurityWindow.renderSecurityWindowUnitCards(units, categorySummaries); }

    function serializeCategorySummaries(categorySummaries) { return window._adminSecurityWindow.serializeCategorySummaries(categorySummaries); }

    function buildUnitGovernanceCardsRenderSignature(items, filters, page, loadedAt, categorySummaries) {
      const safeFilters = filters || {};
      const safePage = page || {};
      const rows = Array.isArray(items) ? items : [];
      return JSON.stringify([
        String(loadedAt || '').trim(),
        String(safeFilters.keyword || '').trim(),
        String(safeFilters.mode || 'all').trim(),
        String(safeFilters.category || 'all').trim(),
        Number(safePage.offset || 0),
        Number(safePage.limit || 12),
        Number(safePage.total || rows.length),
          rows.map((item) => [
            String(item && item.unit || '').trim(),
            String(item && item.category || '').trim(),
            String(item && item.mode || '').trim(),
            Number(Array.isArray(item && item.children) ? item.children.length : 0),
            String(item && item.updatedAt || '').trim()
          ]),
          serializeCategorySummaries(categorySummaries)
        ]);
      }

    function getCachedUnitGovernanceCardsHtml(items, filters, page, loadedAt, categorySummaries) {
      const signature = buildUnitGovernanceCardsRenderSignature(items, filters, page, loadedAt, categorySummaries);
      if (unitGovernanceRenderCache.signature === signature && unitGovernanceRenderCache.cardsHtml) {
        return unitGovernanceRenderCache.cardsHtml;
      }
      const groupedItems = groupGovernanceUnitsByCategory(items);
      unitGovernanceDeferredBodiesCache = {
        signature,
        itemsByCategory: groupedItems.reduce((result, group) => {
          const key = String(group && group.category || '').trim();
          if (key) result[key] = Array.isArray(group && group.items) ? group.items.slice() : [];
          return result;
        }, {}),
        htmlByCategory: {}
      };
      const cardsHtml = groupedItems.length
        ? groupedItems.map((group, index) => renderGovernanceCategoryCard(group, index, categorySummaries, { deferBody: true })).join('')
        : `<div class="empty-state review-empty review-empty--spacious"><div class="empty-state-icon">${ic('layout-grid')}</div><div class="empty-state-title">沒有符合條件的單位</div><div class="empty-state-desc">請嘗試調整關鍵字，或先確認單位治理範圍。</div></div>`;
      unitGovernanceRenderCache = {
        signature,
        cardsHtml
      };
      return cardsHtml;
    }

    function getCachedSecurityWindowUnitCardsHtml(units, filters, page, generatedAt, categorySummaries) {
      return window._adminSecurityWindow.getCachedSecurityWindowUnitCardsHtml(units, filters, page, generatedAt, categorySummaries);
    }
    function getCachedSecurityWindowPeopleRowsHtml(people, filters, generatedAt) {
      return window._adminSecurityWindow.getCachedSecurityWindowPeopleRowsHtml(people, filters, generatedAt);
    }

    function applyColHeaderScope(headersHtml) {
      return String(headersHtml || '').replace(/<th(?![^>]*\bscope=)/g, '<th scope="col"');
    }

    function buildSrCaption(caption) {
      const text = String(caption || '').trim();
      if (!text) return '';
      return '<caption class="sr-only">' + esc(text) + '</caption>';
    }

    function buildReviewTableShell(key, headersHtml, rowsHtml, options) {
      const config = options || {};
      const toolbarSubtitle = config.toolbarSubtitle
        ? `<span class="review-card-subtitle">${esc(config.toolbarSubtitle)}</span>`
        : '<span class="review-card-subtitle">可拖曳表格左右移動，也可使用右側按鈕快速查看其他欄位。</span>';
      const caption = config.caption || String(key || 'review-table').replace(/[-_]+/g, ' ') + ' table';
      const wrapperClass = String(config.wrapperClass || '').trim();
      const wrapperId = String(config.wrapperId || '').trim();
      const tableClass = String(config.tableClass || '').trim();
      const tbodyId = String(config.tbodyId || '').trim();
      return `<div class="review-table-shell"><div class="review-table-toolbar">${toolbarSubtitle}<div class="review-table-scroll-actions"><button type="button" class="btn btn-ghost btn-icon review-table-scroll-btn" data-review-scroll-left="${esc(key)}" aria-label="向左移動">${ic('chevron-left', 'icon-sm')}</button><button type="button" class="btn btn-ghost btn-icon review-table-scroll-btn" data-review-scroll-right="${esc(key)}" aria-label="向右移動">${ic('chevron-right', 'icon-sm')}</button></div></div><div class="table-wrapper review-table-wrapper${wrapperClass ? ' ' + esc(wrapperClass) : ''}" tabindex="0" data-review-scroll-root="${esc(key)}"${wrapperId ? ` id="${esc(wrapperId)}"` : ''}><table class="${tableClass ? esc(tableClass) + ' ' : ''}data-table">${buildSrCaption(caption)}<thead><tr>${applyColHeaderScope(headersHtml)}</tr></thead><tbody${tbodyId ? ` id="${esc(tbodyId)}"` : ''}>${rowsHtml}</tbody></table></div></div>`;
    }

    function wireReviewTableScrollers(scope) {
      const host = scope || document;
      host.querySelectorAll('[data-review-scroll-root]').forEach((wrapper) => {
        if (wrapper.dataset.reviewScrollReady === 'true') return;
        wrapper.dataset.reviewScrollReady = 'true';
        const key = wrapper.dataset.reviewScrollRoot;
        const leftButton = host.querySelector(`[data-review-scroll-left="${key}"]`);
        const rightButton = host.querySelector(`[data-review-scroll-right="${key}"]`);
        const maxScrollLeft = () => Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
        const isScrollable = () => maxScrollLeft() > 6;
        const isVerticallyScrollable = () => Math.max(0, wrapper.scrollHeight - wrapper.clientHeight) > 6;
        const syncButtonState = () => {
          const maxLeft = maxScrollLeft();
          wrapper.classList.toggle('is-scrollable', maxLeft > 6);
          if (leftButton) leftButton.disabled = wrapper.scrollLeft <= 4 || maxLeft <= 6;
          if (rightButton) rightButton.disabled = wrapper.scrollLeft >= maxLeft - 4 || maxLeft <= 6;
        };
        const scrollByDistance = (distance) => {
          wrapper.scrollBy({ left: distance, behavior: 'smooth' });
        };

        let dragState = null;
        bindAdminPageEvent(wrapper, 'pointerdown', (event) => {
          if (!isScrollable()) return;
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: wrapper.scrollLeft
          };
          wrapper.classList.add('is-dragging');
          if (wrapper.setPointerCapture) wrapper.setPointerCapture(event.pointerId);
        });
        bindAdminPageEvent(wrapper, 'pointermove', (event) => {
          if (!dragState || event.pointerId !== dragState.pointerId) return;
          const delta = event.clientX - dragState.startX;
          wrapper.scrollLeft = dragState.startScrollLeft - delta;
        });
        const endDrag = (event) => {
          if (!dragState) return;
          if (event && dragState.pointerId !== event.pointerId) return;
          wrapper.classList.remove('is-dragging');
          dragState = null;
        };
        bindAdminPageEvent(wrapper, 'pointerup', endDrag);
        bindAdminPageEvent(wrapper, 'pointercancel', endDrag);
        bindAdminPageEvent(wrapper, 'pointerleave', (event) => {
          if (dragState && event.pointerType !== 'mouse') endDrag(event);
        });
        bindAdminPageEvent(wrapper, 'wheel', (event) => {
          if (!isScrollable()) return;
          if (isVerticallyScrollable() && !event.shiftKey) return;
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) && !event.shiftKey) return;
          event.preventDefault();
          wrapper.scrollLeft += event.shiftKey ? event.deltaY + event.deltaX : event.deltaY;
        }, { passive: false });
        bindAdminPageEvent(wrapper, 'scroll', syncButtonState, { passive: true });
        if (leftButton) bindAdminPageEvent(leftButton, 'click', () => scrollByDistance(-Math.max(ADMIN_HORIZONTAL_SCROLL_MIN_PX, wrapper.clientWidth * ADMIN_HORIZONTAL_SCROLL_RATIO)));
        if (rightButton) bindAdminPageEvent(rightButton, 'click', () => scrollByDistance(Math.max(ADMIN_HORIZONTAL_SCROLL_MIN_PX, wrapper.clientWidth * ADMIN_HORIZONTAL_SCROLL_RATIO)));
        syncButtonState();
      });
    }

    function getGovernanceFiltersFromDom() {
      return {
        keyword: document.getElementById('unit-governance-keyword') ? document.getElementById('unit-governance-keyword').value.trim() : '',
        mode: document.getElementById('unit-governance-mode') ? document.getElementById('unit-governance-mode').value.trim() : 'all',
        category: document.getElementById('unit-governance-category') ? document.getElementById('unit-governance-category').value.trim() : 'all',
        limit: document.getElementById('unit-governance-page-limit') ? document.getElementById('unit-governance-page-limit').value.trim() : String(DEFAULT_GOVERNANCE_FILTERS.limit),
        offset: '0'
      };
    }

    function getSecurityWindowFiltersFromDom() {
      return {
        keyword: document.getElementById('security-window-keyword') ? document.getElementById('security-window-keyword').value.trim() : '',
        status: document.getElementById('security-window-status') ? document.getElementById('security-window-status').value.trim() : 'all',
        category: document.getElementById('security-window-category') ? document.getElementById('security-window-category').value.trim() : 'all',
        limit: document.getElementById('security-window-page-limit') ? document.getElementById('security-window-page-limit').value.trim() : String(DEFAULT_SECURITY_WINDOW_FILTERS.limit),
        offset: '0'
      };
    }

    function getSystemUsersFiltersFromDom() {
      return {
        q: document.getElementById('system-users-keyword') ? document.getElementById('system-users-keyword').value.trim() : '',
        role: document.getElementById('system-users-role') ? document.getElementById('system-users-role').value.trim() : '',
        unit: document.getElementById('system-users-unit') ? document.getElementById('system-users-unit').value.trim() : '',
        limit: document.getElementById('system-users-page-limit') ? document.getElementById('system-users-page-limit').value.trim() : String(DEFAULT_SYSTEM_USERS_FILTERS.limit),
        offset: '0'
      };
    }

    function getUnitContactReviewFiltersFromDom() {
      return {
        status: document.getElementById('unit-contact-review-status') ? document.getElementById('unit-contact-review-status').value.trim() : DEFAULT_UNIT_CONTACT_REVIEW_FILTERS.status,
        email: document.getElementById('unit-contact-review-email') ? document.getElementById('unit-contact-review-email').value.trim() : '',
        keyword: document.getElementById('unit-contact-review-keyword') ? document.getElementById('unit-contact-review-keyword').value.trim() : '',
        limit: document.getElementById('unit-contact-review-limit') ? document.getElementById('unit-contact-review-limit').value.trim() : String(DEFAULT_UNIT_CONTACT_REVIEW_FILTERS.limit),
        offset: '0'
      };
    }


    const SECURITY_ROLE_OPTIONS = ['一級單位資安窗口', '二級單位資安窗口'];
    const UNIT_SEARCH_ENTRIES = typeof getUnitSearchEntries === 'function'
      ? getUnitSearchEntries([], { excludeUnits: ['學校分部總辦事處'] })
      : [];

    function normalizeSecurityRoles(value) { return window._adminSecurityWindow.normalizeSecurityRoles(value); }
    function formatSecurityRolesSummary(value) { return window._adminSecurityWindow.formatSecurityRolesSummary(value); }

    function buildSecurityRoleCheckboxes(selectedRoles) {
      const selected = new Set(normalizeSecurityRoles(selectedRoles));
      return '<div class="unit-contact-security-roles">' + SECURITY_ROLE_OPTIONS.map((role) => {
        const checked = selected.has(role) ? 'checked' : '';
        const testId = 'user-security-role-' + role.replace(/[^\w\u4e00-\u9fff]+/g, '-');
        return '<label class="unit-contact-security-role-option">'
          + '<input type="checkbox" name="u-security-roles" value="' + esc(role) + '" data-testid="' + esc(testId) + '" ' + checked + '>'
          + '<span>' + esc(role) + '</span></label>';
      }).join('') + '</div>';
    }

    function readSelectedSecurityRoles() {
      return Array.from(document.querySelectorAll('input[name="u-security-roles"]:checked'))
        .map((input) => String(input && input.value || '').trim())
        .filter(Boolean);
    }

    function getDirectChildUnits(unitValue) {
      const parent = String(unitValue || '').trim();
      if (!parent) return [];
      return UNIT_SEARCH_ENTRIES.filter((entry) => entry && entry.parent === parent && entry.child)
        .map((entry) => entry.value);
    }

    function buildUnitMultiSelectControl(baseId, values, placeholder, hint) {
      const selected = Array.from(new Set(parseUserUnits(values).map((value) => String(value || '').trim()).filter(Boolean)));
      const chips = selected.map((value) => '<span class="unit-chip-picker-chip" data-unit-chip="' + esc(value) + '">' + esc(value) + '<button type="button" class="unit-chip-picker-chip-remove" data-remove-unit="' + esc(value) + '">×</button></span>').join('');
      const categoryButtons = '<div class="unit-chip-picker-category-bar" id="' + esc(baseId) + '-category-bar">'
        + '<span class="unit-chip-picker-category-label">快速選取：</span>'
        + '<button type="button" class="unit-chip-picker-category-btn" data-category="行政單位">行政單位</button>'
        + '<button type="button" class="unit-chip-picker-category-btn" data-category="學術單位">學術單位</button>'
        + '<button type="button" class="unit-chip-picker-category-btn" data-category="中心 / 研究單位">中心 / 研究單位</button>'
        + '<button type="button" class="unit-chip-picker-category-btn unit-chip-picker-category-btn--all" data-category="__all__">全選</button>'
        + '<button type="button" class="unit-chip-picker-category-btn unit-chip-picker-category-btn--clear" data-category="__clear__">清除</button>'
        + '</div>';
      return '<div class="unit-chip-picker" data-unit-chip-picker="' + esc(baseId) + '">'
        + categoryButtons
        + '<div class="unit-chip-picker-search">'
        + '<input type="search" class="form-input unit-chip-picker-search-input" id="' + esc(baseId) + '-search" placeholder="' + esc(placeholder || '請輸入單位名稱或用上方按鈕快速選取') + '" autocomplete="off">'
        + '<div class="unit-chip-picker-results" id="' + esc(baseId) + '-results" role="listbox" hidden></div>'
        + '</div>'
        + '<div class="unit-chip-picker-chips" id="' + esc(baseId) + '-chips">' + (chips || '<span class="unit-chip-picker-empty">尚未選取</span>') + '</div>'
        + '<textarea class="unit-chip-picker-hidden" id="' + esc(baseId) + '" hidden>' + esc(selected.join('\n')) + '</textarea>'
        + '</div>'
        + (hint ? '<div class="form-hint">' + esc(hint) + '</div>' : '');
    }

    function initUnitMultiSelectControl(baseId) {
      const hiddenEl = document.getElementById(baseId);
      const searchEl = document.getElementById(baseId + '-search');
      const resultsEl = document.getElementById(baseId + '-results');
      const chipsEl = document.getElementById(baseId + '-chips');
      if (!hiddenEl || !searchEl || !resultsEl || !chipsEl) return null;
      const state = new Set(parseUserUnits(hiddenEl.value));
      const syncHidden = () => {
        hiddenEl.value = Array.from(state).join('\n');
        hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const renderChips = () => {
        const chips = Array.from(state).map((value) => '<span class="unit-chip-picker-chip" data-unit-chip="' + esc(value) + '">' + esc(value) + '<button type="button" class="unit-chip-picker-chip-remove" data-remove-unit="' + esc(value) + '">×</button></span>').join('');
        chipsEl.innerHTML = chips || '<span class="unit-chip-picker-empty">尚未選取</span>';
      };
      const renderResults = (query) => {
        const text = String(query || '').trim();
        if (!text) {
          resultsEl.hidden = true;
          resultsEl.innerHTML = '';
          return;
        }
        const tokens = text.split(/\s+/).map((part) => String(part || '').trim().toLowerCase()).filter(Boolean);
        const matches = UNIT_SEARCH_ENTRIES.filter((entry) => !state.has(entry.value) && tokens.every((token) => entry.searchText.toLowerCase().includes(token))).slice(0, 20);
        resultsEl.hidden = false;
        if (!matches.length) {
          resultsEl.innerHTML = '<div class="unit-chip-picker-empty">找不到符合條件的單位</div>';
          return;
        }
        resultsEl.innerHTML = matches.map((entry) => '<button type="button" class="unit-cascade-search-option unit-chip-picker-option" data-unit-value="' + esc(entry.value) + '"><span class="unit-cascade-search-option-title">' + esc(entry.fullLabel) + '</span><span class="unit-cascade-search-option-meta">' + esc(entry.category || '') + (entry.code ? ' · ' + esc(entry.code) : '') + '</span></button>').join('');
      };
      const addValue = (value) => {
        const next = String(value || '').trim();
        if (!next || state.has(next)) return;
        state.add(next);
        renderChips();
        syncHidden();
      };
      const removeValue = (value) => {
        const next = String(value || '').trim();
        if (!state.has(next)) return;
        state.delete(next);
        renderChips();
        syncHidden();
      };
      // ── Category quick-select bar ──
      const categoryBarEl = document.getElementById(baseId + '-category-bar');
      if (categoryBarEl) {
        bindAdminPageEvent(categoryBarEl, 'click', (event) => {
          const btn = event.target.closest('[data-category]');
          if (!btn) return;
          event.preventDefault();
          const category = btn.dataset.category;
          if (category === '__clear__') {
            state.clear();
            renderChips();
            syncHidden();
            updateCategoryActiveState();
            return;
          }
          if (category === '__all__') {
            UNIT_SEARCH_ENTRIES.forEach((entry) => {
              if (entry && entry.value) state.add(entry.value);
            });
          } else {
            // Add only top-level units (parent only, no child) in this category
            UNIT_SEARCH_ENTRIES.forEach((entry) => {
              if (entry && entry.category === category && !entry.child && entry.value) {
                state.add(entry.value);
              }
            });
          }
          renderChips();
          syncHidden();
          updateCategoryActiveState();
        });
      }
      const updateCategoryActiveState = () => {
        if (!categoryBarEl) return;
        const buttons = categoryBarEl.querySelectorAll('[data-category]');
        buttons.forEach((btn) => {
          const cat = btn.dataset.category;
          if (cat === '__clear__' || cat === '__all__') {
            btn.classList.remove('unit-chip-picker-category-btn--active');
            return;
          }
          const catEntries = UNIT_SEARCH_ENTRIES.filter((e) => e && e.category === cat && !e.child);
          const allSelected = catEntries.length > 0 && catEntries.every((e) => state.has(e.value));
          btn.classList.toggle('unit-chip-picker-category-btn--active', allSelected);
        });
      };

      bindAdminPageEvent(chipsEl, 'click', (event) => {
        const button = event.target.closest('[data-remove-unit]');
        if (!button) return;
        event.preventDefault();
        removeValue(button.dataset.removeUnit);
        updateCategoryActiveState();
      });
      bindAdminPageEvent(resultsEl, 'mousedown', (event) => {
        const button = event.target.closest('[data-unit-value]');
        if (!button) return;
        event.preventDefault();
        addValue(button.dataset.unitValue);
        searchEl.value = '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        updateCategoryActiveState();
      });
      bindAdminPageEvent(searchEl, 'input', () => renderResults(searchEl.value));
      bindAdminPageEvent(searchEl, 'focus', () => renderResults(searchEl.value));
      bindAdminPageEvent(searchEl, 'keydown', (event) => {
        if (event.key !== 'Enter') return;
        const button = resultsEl.querySelector('[data-unit-value]');
        if (!button) return;
        event.preventDefault();
        addValue(button.dataset.unitValue);
        searchEl.value = '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      });
      bindAdminPageEvent(document, 'click', (event) => {
        if (!resultsEl.contains(event.target) && event.target !== searchEl) {
          resultsEl.hidden = true;
        }
      });
      renderChips();
      syncHidden();
      updateCategoryActiveState();
      return {
        setValues(values) {
          state.clear();
          parseUserUnits(values).forEach((value) => state.add(value));
          renderChips();
          syncHidden();
          updateCategoryActiveState();
        },
        getValues() { return Array.from(state); },
        addValue,
        removeValue,
        clear() {
          state.clear();
          renderChips();
          syncHidden();
          updateCategoryActiveState();
        }
      };
    }

    function getRoleBadgeClass(role) {
      return ROLE_BADGE[role] || 'badge-unit-admin';
    }

    function getRoleLabel(role) {
      return esc(String(role || '—'));
    }

  async function renderUsers(options) {
    if (!canManageUsers()) { navigate('dashboard'); return; }
    const opts = options || {};
    const app = document.getElementById('app');
      const visibleUsersCache = renderUsers._remoteViewCache || (renderUsers._remoteViewCache = systemUsersCollectionBundle.viewCache || createAdminRemoteViewCache(DEFAULT_SYSTEM_USERS_FILTERS));
    systemUsersState.filters = normalizePagedFilters({ ...systemUsersState.filters, ...(opts.filters || opts) }, DEFAULT_SYSTEM_USERS_FILTERS);
    systemUsersState.loading = true;
    if (!visibleUsersCache.items.length) {
      app.innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">帳號管理</h1><p class="page-subtitle">管理角色、主要歸屬單位與多單位授權範圍</p></div></div><div class="card review-loading-card">正在讀取系統帳號清單...</div></div>`;
      refreshIcons();
    }

    async function fetchUsersForAdminView(fetchOptions) {
      const remoteOpts = fetchOptions || {};
      const signature = JSON.stringify(systemUsersState.filters);
      const now = Date.now();
      if (!remoteOpts.force && visibleUsersCache.items.length && visibleUsersCache.signature === signature && (now - Number(visibleUsersCache.fetchedAt || 0)) < 30000) {
        return {
          items: visibleUsersCache.items.slice(),
          summary: visibleUsersCache.summary || normalizeSystemUsersSummary(null, visibleUsersCache.items.length),
          page: visibleUsersCache.page || buildAdminCollectionPage(systemUsersState.filters, visibleUsersCache.items.length, 20, 200),
          filters: visibleUsersCache.filters || { ...systemUsersState.filters },
          generatedAt: systemUsersState.lastLoadedAt || new Date().toISOString()
        };
      }
      if (!remoteOpts.force && visibleUsersCache.promise) return visibleUsersCache.promise;
      const client = await waitForPagedClient(getSystemUsersPagedClient, 800);
      if (!client) {
        throw new Error('system users paged client unavailable');
      }
      const pending = client(systemUsersState.filters).then((response) => {
        const items = Array.isArray(response && response.items) ? response.items : [];
        const summary = normalizeSystemUsersSummary(response && response.summary, response && response.total);
        const page = response && response.page ? response.page : buildAdminCollectionPage(systemUsersState.filters, response && response.total, 20, 200);
        visibleUsersCache.signature = signature;
        visibleUsersCache.items = items.slice();
        visibleUsersCache.summary = summary;
        visibleUsersCache.page = page;
        visibleUsersCache.filters = { ...systemUsersState.filters, ...(response && response.filters ? response.filters : {}) };
        visibleUsersCache.fetchedAt = Date.now();
        return {
          items,
          summary,
          page,
          filters: visibleUsersCache.filters,
          generatedAt: String(response && response.generatedAt || '').trim() || new Date().toISOString()
        };
      }).finally(() => {
        visibleUsersCache.promise = null;
      });
      visibleUsersCache.promise = pending;
      return pending;
    }

    try {
      const result = await fetchUsersForAdminView({ force: !!opts.forceRemote });
      systemUsersState.items = Array.isArray(result && result.items) ? result.items : [];
      systemUsersState.summary = normalizeSystemUsersSummary(result && result.summary, systemUsersState.items.length);
      systemUsersState.page = result && result.page ? result.page : buildAdminCollectionPage(systemUsersState.filters, systemUsersState.items.length, 20, 200);
      systemUsersState.filters = normalizePagedFilters(result && result.filters ? result.filters : systemUsersState.filters, DEFAULT_SYSTEM_USERS_FILTERS);
      systemUsersState.lastLoadedAt = String(result && result.generatedAt || '').trim() || new Date().toISOString();
      systemUsersState.loading = false;
    } catch (error) {
      systemUsersState.loading = false;
      app.innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">帳號管理</h1><p class="page-subtitle">無法讀取系統帳號清單。</p></div><button class="btn btn-secondary" data-action="admin.refreshUsers">${ic('refresh-cw', 'icon-sm')} 重試</button></div><div class="card"><div class="empty-state review-empty review-empty--spacious"><div class="empty-state-icon">${ic('users')}</div><div class="empty-state-title">系統帳號後端尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
    }

    const renderSignature = getSystemUsersRenderSignature();
    if (!(systemUsersRenderCache.signature === renderSignature && app && app.dataset.systemUsersRenderSignature === renderSignature)) {
      let pageHtml = systemUsersMarkupCache.signature === renderSignature ? systemUsersMarkupCache.html : '';
      if (!pageHtml) {
    const pager = renderAdminCollectionPager({
      idPrefix: 'system-users',
      actionPrefix: 'admin.user',
      page: systemUsersState.page,
      summary: formatAdminCollectionSummary(systemUsersState.page, '目前沒有符合條件的帳號'),
      defaultLimit: 20,
      limitOptions: ['5', '20', '50', '100']
    });
    pageHtml = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">帳號管理</h1><p class="page-subtitle">管理角色、主要歸屬單位與多單位授權範圍</p></div><button class="btn btn-primary" data-action="admin.addUser">${ic('user-plus', 'icon-sm')} 新增使用者</button></div>
      <div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('users')}</div><div class="stat-value">${systemUsersState.summary.total || 0}</div><div class="stat-label">符合條件帳號</div></div><div class="stat-card closed"><div class="stat-icon">${ic('shield-check')}</div><div class="stat-value">${systemUsersState.summary.admin || 0}</div><div class="stat-label">最高管理者</div></div><div class="stat-card pending"><div class="stat-icon">${ic('building-2')}</div><div class="stat-value">${systemUsersState.summary.unitAdmin || 0}</div><div class="stat-label">單位管理者</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('badge-check')}</div><div class="stat-value">${systemUsersState.summary.securityWindow || 0}</div><div class="stat-label">具資安窗口</div></div></div>
      <div class="card review-table-card"><div class="card-header"><span class="card-title">帳號清單</span><span class="review-card-subtitle">可依角色、單位與關鍵字查找帳號</span></div><div class="review-toolbar"><div class="review-toolbar-main"><div class="form-group"><label class="form-label">關鍵字</label><input class="form-input" id="system-users-keyword" value="${esc(systemUsersState.filters.q)}" placeholder="帳號、姓名、電子郵件"></div><div class="form-group"><label class="form-label">角色</label><select class="form-select" id="system-users-role"><option value="" ${!systemUsersState.filters.role ? 'selected' : ''}>全部</option><option value="${esc(ROLES.ADMIN)}" ${systemUsersState.filters.role === ROLES.ADMIN ? 'selected' : ''}>最高管理員</option><option value="${esc(ROLES.UNIT_ADMIN)}" ${systemUsersState.filters.role === ROLES.UNIT_ADMIN ? 'selected' : ''}>單位管理員</option></select></div><div class="form-group"><label class="form-label">單位</label><input class="form-input" id="system-users-unit" value="${esc(systemUsersState.filters.unit)}" placeholder="主要或授權單位"></div></div><div class="review-toolbar-actions"><button type="button" class="btn btn-primary" data-action="admin.applyUserFilters">${ic('filter', 'icon-sm')} 套用篩選</button><button type="button" class="btn btn-secondary" data-action="admin.resetUserFilters">${ic('rotate-ccw', 'icon-sm')} 重設</button></div></div>${pager}${buildReviewTableShell('system-users-table', '<th>帳號</th><th>姓名</th><th>角色</th><th>資安窗口</th><th>主要歸屬單位</th><th>額外授權範圍</th><th>審核範圍</th><th>電子郵件</th><th>操作</th>', '', { toolbarSubtitle: `最後更新：${fmtTime(systemUsersState.lastLoadedAt)}`, wrapperId: 'system-users-table-wrap', wrapperClass: 'system-users-table-wrap', tbodyId: 'system-users-table-body' })}</div></div>`;
        systemUsersMarkupCache = { signature: renderSignature, html: pageHtml };
      }
      app.innerHTML = pageHtml;
      systemUsersRenderCache = { signature: renderSignature, filterSignature: JSON.stringify(systemUsersState.filters) };
      if (app) app.dataset.systemUsersRenderSignature = renderSignature;
    }
    systemUsersTableViewport = document.getElementById('system-users-table-wrap');
    renderSystemUsersRows(Array.isArray(systemUsersState.items) ? systemUsersState.items : []);
    if (typeof releaseSystemUsersVirtualScroll === 'function') {
      releaseSystemUsersVirtualScroll();
      releaseSystemUsersVirtualScroll = null;
    }
    if (typeof releaseSystemUsersVirtualResize === 'function') {
      releaseSystemUsersVirtualResize();
      releaseSystemUsersVirtualResize = null;
    }
    if (systemUsersTableViewport) {
      releaseSystemUsersVirtualScroll = bindAdminPageEvent(systemUsersTableViewport, 'scroll', scheduleSystemUsersRowsRender, { passive: true });
      releaseSystemUsersVirtualResize = bindAdminPageEvent(window, 'resize', scheduleSystemUsersRowsRender);
    }
    registerAdminPageCleanup(function () {
      if (typeof releaseSystemUsersVirtualScroll === 'function') {
        releaseSystemUsersVirtualScroll();
      }
      if (typeof releaseSystemUsersVirtualResize === 'function') {
        releaseSystemUsersVirtualResize();
      }
      releaseSystemUsersVirtualScroll = null;
      releaseSystemUsersVirtualResize = null;
      systemUsersTableViewport = null;
      systemUsersVirtualRowsRenderPending = false;
    });
    bindAdminCollectionPager({
      idPrefix: 'system-users',
      actionPrefix: 'admin.user',
      page: systemUsersState.page,
      defaultLimit: 20,
      limitOptions: ['5', '20', '50', '100'],
      onChange: (patch) => renderUsers({ ...systemUsersState.filters, ...patch }, { skipSync: true, forceRemote: true })
    });
    wireReviewTableScrollers(app);
    refreshIcons();
  }

  async function handleDeleteUser(username) {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) {
      toast('找不到要刪除的帳號', 'error');
      return;
    }
    const visibleUsersCache = renderUsers._remoteViewCache || { items: [] };
    const user = findUser(cleanUsername)
      || (Array.isArray(visibleUsersCache.items) ? visibleUsersCache.items.find((item) => String(item && item.username || '').trim() === cleanUsername) : null);
    if (!user) {
      toast('找不到要刪除的帳號', 'error');
      return;
    }
    if (cleanUsername === 'admin' || String(user.role || '').trim() === ROLES.ADMIN) {
      toast('最高管理者無法刪除', 'error');
      return;
    }
    const displayName = user.name || user.username || cleanUsername;
    const label = `${displayName}（${cleanUsername}）`;
    const confirmed = typeof openConfirmDialog === 'function'
      ? await openConfirmDialog(`即將刪除「${label}」的系統帳號。\n\n刪除後該使用者將無法登入，且相關操作紀錄仍會保留。此操作無法復原。`, { title: '停用並刪除帳號', confirmLabel: '確認刪除', confirmClass: 'btn-danger', kicker: '注意' })
      : window.confirm(`即將刪除「${label}」的系統帳號。刪除後該使用者將無法登入。此操作無法復原。`);
    if (!confirmed) return;
    try {
      const currentFilters = { ...systemUsersState.filters };
      await submitUserDelete(cleanUsername, { username: cleanUsername });
      if (typeof syncUsersFromM365 === 'function') {
        await syncUsersFromM365({ silent: true, force: true }).catch(function (error) {
          window.__ismsWarn('system users sync after delete failed', error);
        });
      }
      dispatchAdminCacheInvalidationScopes(['system-users', 'audit-trail'], 'user-deleted');
      await renderUsers({ filters: currentFilters, forceRemote: true });
      toast(`已成功刪除「${displayName}」的帳號`);
    } catch (error) {
      toast(String(error && error.message || error || '刪除帳號失敗，請稍後再試'), 'error');
    }
  }

  function showUserModal(eu) {
    const isE = !!eu;
    const title = isE ? '編輯使用者' : '新增使用者';
    const mr = document.getElementById('modal-root') || (function () {
      const fallbackRoot = document.createElement('div');
      fallbackRoot.id = 'modal-root';
      document.body.appendChild(fallbackRoot);
      return fallbackRoot;
    }());
    const profile = getAdminAccessProfile(eu);
    const primaryUnit = profile.primaryUnit;
    const extraUnits = profile.authorizedUnits.filter((unit) => unit && unit !== primaryUnit);
    const reviewUnits = profile.reviewUnits;
    const selectedSecurityRoles = profile.securityRoles;

    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" aria-describedby="user-modal-description"><div class="modal-header"><span class="modal-title" id="user-modal-title">${esc(title)}</span><button class="btn btn-ghost btn-icon" data-dismiss-modal aria-label="關閉使用者表單">✕</button></div><form id="user-form">
      <p class="sr-only" id="user-modal-description">設定使用者的帳號、角色、單位與權限範圍。</p>
      <div class="form-group"><label class="form-label form-required">帳號</label><input type="text" class="form-input" id="u-username" value="${isE ? esc(eu.username) : ''}" ${isE ? 'readonly' : ''} required></div>
      <div class="form-group"><label class="form-label form-required">姓名</label><input type="text" class="form-input" id="u-name" value="${isE ? esc(eu.name) : ''}" required></div>
      <div class="form-group"><label class="form-label form-required">電子郵件</label><input type="email" class="form-input" id="u-email" value="${isE ? esc(eu.email || '') : ''}" required></div>
      <div class="form-row"><div class="form-group"><label class="form-label form-required">角色</label><select class="form-select" id="u-role" required><option value="${ROLES.UNIT_ADMIN}" ${isE && eu.role === ROLES.UNIT_ADMIN ? 'selected' : ''}>單位管理員</option><option value="${ROLES.ADMIN}" ${isE && eu.role === ROLES.ADMIN ? 'selected' : ''}>最高管理者</option></select></div>
      <div class="form-group"><label class="form-label" id="u-unit-label">主要歸屬單位</label>${buildUnitCascadeControl('u-unit', primaryUnit, false, false)}</div></div>
      <div class="form-group" id="u-security-role-group"><label class="form-label form-required">資安角色</label>${buildSecurityRoleCheckboxes(selectedSecurityRoles)}<div class="form-hint">請至少選擇一種資安角色身分。</div></div>
      <div class="form-group"><label class="form-label">額外授權資源範圍</label>${buildUnitMultiSelectControl('u-units', extraUnits, '請輸入單位名稱', '可搜尋並加入額外授權的資源範圍。')}</div>
      <div class="form-group"><label class="form-label">審核資源範圍</label>${buildUnitMultiSelectControl('u-review-units', reviewUnits, '請輸入單位名稱', '僅單位管理員可設定，留空表示沿用既有規則。')}</div>
      <div class="form-group"><label class="form-label ${isE ? '' : 'form-required'}">${isE ? '密碼（留空不修改）' : '密碼'}</label><input type="text" class="form-input" id="u-pass" ${isE ? '' : 'required'}></div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">${isE ? '儲存' : '新增'}</button><button type="button" class="btn btn-secondary" data-dismiss-modal>取消</button></div>
    </form></div></div>`;

    initUnitCascade('u-unit', primaryUnit, { disabled: false, registerCleanup: registerAdminPageCleanup });

    const roleEl = document.getElementById('u-role');
    const unitLabel = document.getElementById('u-unit-label');
    const parentEl = document.getElementById('u-unit-parent');
    const securityRoleGroup = document.getElementById('u-security-role-group');
    const extraUnitsGroup = document.querySelector('[data-unit-chip-picker="u-units"]')?.closest('.form-group');
    const reviewUnitsGroup = document.querySelector('[data-unit-chip-picker="u-review-units"]')?.closest('.form-group');
    const extraUnitsPicker = initUnitMultiSelectControl('u-units');
    const reviewUnitsPicker = initUnitMultiSelectControl('u-review-units');
    const unitEl = document.getElementById('u-unit');

    function setSecurityRoles(values) {
      const selected = new Set(normalizeSecurityRoles(values));
      document.querySelectorAll('input[name="u-security-roles"]').forEach((input) => {
        input.checked = selected.has(String(input.value || '').trim());
      });
    }

    function syncScopedUnits() {}

    function syncRoleFields() {
      const unitAdminMode = roleEl.value === ROLES.UNIT_ADMIN;
      unitLabel.textContent = unitAdminMode ? '主要歸屬單位' : '主要歸屬單位（選填）';
      parentEl.required = unitAdminMode;
      if (securityRoleGroup) {
        securityRoleGroup.style.display = unitAdminMode ? '' : 'none';
      }
      if (extraUnitsGroup) {
        extraUnitsGroup.style.display = unitAdminMode ? '' : 'none';
      }
      if (reviewUnitsGroup) {
        reviewUnitsGroup.style.display = unitAdminMode ? '' : 'none';
      }
      if (!unitAdminMode) {
        setSecurityRoles([]);
        if (extraUnitsPicker && typeof extraUnitsPicker.clear === 'function') extraUnitsPicker.clear();
        if (reviewUnitsPicker && typeof reviewUnitsPicker.clear === 'function') reviewUnitsPicker.clear();
      }
      syncScopedUnits();
    }

    syncRoleFields();
    bindAdminPageEvent(roleEl, 'change', syncRoleFields);
    document.querySelectorAll('input[name="u-security-roles"]').forEach((input) => {
      bindAdminPageEvent(input, 'change', syncScopedUnits);
    });
    bindAdminPageEvent(document.getElementById('modal-bg'), 'click', (e) => { if (e.target === e.currentTarget) closeModalRoot(); });
    bindAdminPageEvent(document.getElementById('user-form'), 'submit', async (e) => {
      e.preventDefault();
      const un = document.getElementById('u-username').value.trim();
      const nm = document.getElementById('u-name').value.trim();
      const em = document.getElementById('u-email').value.trim();
      const rl = document.getElementById('u-role').value;
      const ut = document.getElementById('u-unit').value.trim();
      const extraUnits = parseUserUnits(document.getElementById('u-units').value);
      const reviewScopeUnits = parseUserUnits(document.getElementById('u-review-units').value);
      const securityRoles = rl === ROLES.UNIT_ADMIN ? readSelectedSecurityRoles() : [];
      const pw = document.getElementById('u-pass').value;
      const authorizedUnits = Array.from(new Set([ut, ...extraUnits].filter(Boolean)));

      if (rl === ROLES.UNIT_ADMIN && !authorizedUnits.length) { toast('請至少指定一個授權單位', 'error'); return; }
      if (rl === ROLES.UNIT_ADMIN && !securityRoles.length) { toast('請至少選擇一種資安角色身分', 'error'); return; }

      const payload = {
        name: nm,
        email: em,
        role: rl,
        primaryUnit: ut,
        unit: ut,
        authorizedUnits,
        scopeUnits: authorizedUnits,
        units: authorizedUnits,
        activeUnit: ut,
        securityRoles
      };
      if (pw) payload.password = pw;
      if (isE) payload.skipPasswordCheck = true;
      try {
        if (!isE && findUser(un)) { toast('帳號已存在', 'error'); return; }
        const currentFilters = { ...systemUsersState.filters };
        await submitUserUpsert({ username: un, ...payload });
        try { await syncUsersFromM365({ silent: true }); } catch (syncErr) { window.__ismsWarn('使用者同步失敗（非致命）', syncErr); }
        if (rl === ROLES.UNIT_ADMIN) {
          await submitReviewScopeReplace({
            username: un,
            units: reviewScopeUnits,
            actorName: currentUser() && currentUser().name,
            actorEmail: currentUser() && currentUser().email
          });
          try { await syncReviewScopesFromM365({ silent: true }); } catch (syncErr) { window.__ismsWarn('審核範圍同步失敗（非致命）', syncErr); }
        }
        toast(isE ? '使用者已更新' : '使用者已新增');
        dispatchAdminCacheInvalidationScopes(['system-users', 'audit-trail'], isE ? 'user-updated' : 'user-created');
        closeModalRoot();
        renderUsers({ filters: currentFilters, forceRemote: true });
        refreshIcons();
      } catch (error) {
        toast(String(error && error.message || error || '使用者儲存失敗'), 'error');
        try { renderUsers({ filters: systemUsersState.filters, forceRemote: true }); } catch (_) {}
      }
    });
  }

  async function openUnitContactAuthorizationDocumentPreview(applicationId, email) {
    const result = await requestUnitContactAuthorizationDocument(applicationId, { email });
    const blob = result && result.blob ? result.blob : (result instanceof Blob ? result : await result.blob());
    const blobUrl = URL.createObjectURL(blob);
    const popup = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      window.location.href = blobUrl;
      return;
    }
    const revoke = () => {
      try { URL.revokeObjectURL(blobUrl); } catch (_) {}
    };
    popup.addEventListener('load', () => {
      setTimeout(revoke, 5000);
    }, { once: true });
    popup.addEventListener('beforeunload', revoke, { once: true });
  }
  function buildUnitContactReviewAttachmentBlock(item, id) {
    if (!(item && item.hasAuthorizationDoc)) return '';
    const fileName = String(item.authorizationDocFileName || '').trim() || '授權同意書';
    const uploadedAt = fmtTime(item.authorizationDocUploadedAt);
    const sizeText = Number(item.authorizationDocSize || 0) > 0 ? ` · ${formatSchemaBytes(item.authorizationDocSize)}` : '';
    return `<div class="unit-contact-review-attachment"><div class="unit-contact-review-attachment-copy"><div class="unit-contact-review-attachment-label">附件</div><div class="unit-contact-review-attachment-title">${esc(fileName)}</div><div class="unit-contact-review-attachment-meta">${uploadedAt ? `上傳：${esc(uploadedAt)}` : '已上傳'}${esc(sizeText)}</div></div><button type="button" class="btn btn-sm btn-secondary unit-contact-review-attachment-action" data-action="admin.unitContactViewAuthDoc" data-id="${esc(id)}" data-applicant-email="${esc(item && item.applicantEmail || '')}">${ic('file-search', 'icon-sm')} 檢視附件</button></div>`;
  }

  function buildUnitContactReviewActionNote(status) {
    if (status === 'pending_review' || status === 'returned') {
      return '<div class="unit-contact-review-actions-note">通過後會自動建立帳號並寄送登入資訊；退回與拒絕會保留審核紀錄。</div>';
    }
    if (status === 'approved' || status === 'activation_pending' || status === 'active') {
      return '<div class="unit-contact-review-actions-note">已啟用可重新寄送登入資訊；若需補件，仍可退回調整。</div>';
    }
    return '<div class="unit-contact-review-actions-note">請先確認申請內容與附件，再選擇審核動作。</div>';
  }

  function getUnitContactReviewActionStatusLabel(status) {
    if (status === 'pending_review' || status === 'returned') return '待審核';
    if (status === 'approved' || status === 'activation_pending' || status === 'active') return '已啟用';
    return '其他狀態';
  }

  function buildUnitContactReviewActions(item, id, status) {
    const buttons = [];
    if (status === 'pending_review' || status === 'returned') {
      buttons.push(`<button type="button" class="btn btn-sm btn-primary review-action-primary" data-action="admin.unitContactApprove" data-id="${esc(id)}">${ic('badge-check', 'icon-sm')} 通過並啟用</button>`);
      buttons.push(`<button type="button" class="btn btn-sm btn-secondary review-action-secondary" data-action="admin.unitContactReturn" data-id="${esc(id)}">${ic('undo-2', 'icon-sm')} 退回</button>`);
      buttons.push(`<button type="button" class="btn btn-sm btn-danger review-action-danger" data-action="admin.unitContactReject" data-id="${esc(id)}">${ic('x-circle', 'icon-sm')} 拒絕</button>`);
    } else if (status === 'approved' || status === 'activation_pending' || status === 'active') {
      buttons.push(`<button type="button" class="btn btn-sm btn-primary review-action-primary" data-action="admin.unitContactResendActivation" data-id="${esc(id)}">${ic('mail', 'icon-sm')} 重新寄送登入資訊</button>`);
      if (status !== 'active') {
        buttons.push(`<button type="button" class="btn btn-sm btn-secondary review-action-secondary" data-action="admin.unitContactReturn" data-id="${esc(id)}">${ic('undo-2', 'icon-sm')} 退回</button>`);
      }
    }
    const reviewModeClass = status === 'pending_review' || status === 'returned'
      ? 'unit-contact-review-actions--review'
      : 'unit-contact-review-actions--maintenance';
    return `<div class="unit-contact-review-actions ${reviewModeClass}" data-review-status="${esc(status)}"><div class="unit-contact-review-actions-header"><div class="unit-contact-review-actions-topline"><div class="unit-contact-review-actions-kicker">審核操作</div><span class="unit-contact-review-actions-chip">${esc(getUnitContactReviewActionStatusLabel(status))}</span></div>${buildUnitContactReviewActionNote(status)}</div><div class="review-actions review-actions--unit-contact ${status === 'pending_review' || status === 'returned' ? 'review-actions--unit-contact--review' : 'review-actions--unit-contact--maintenance'}">${buttons.join('')}</div></div>`;
  }

  function renderUnitContactReviewRows(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return `<tr><td colspan="7"><div class="empty-state review-empty review-empty--compact"><div class="empty-state-title">目前沒有申請紀錄</div><div class="empty-state-desc">尚無申請資料，或可調整上方篩選條件查看其他狀態。</div></div></td></tr>`;
    }
    return rows.map((item) => {
      const id = String(item && item.id || '').trim();
      const status = String(item && item.status || '').trim();
      const attachmentBlock = buildUnitContactReviewAttachmentBlock(item, id);
      const actionButtons = buildUnitContactReviewActions(item, id, status);
      const actionClass = status === 'pending_review' || status === 'returned'
        ? 'review-actions review-actions--unit-contact review-actions--unit-contact--review'
        : 'review-actions review-actions--unit-contact review-actions--unit-contact--maintenance';
      return `<tr data-review-id="${esc(id)}"><td><div class="review-unit-name">${esc(id)}</div><div class="review-card-subtitle review-card-subtitle--top-4">${esc(item && item.unitValue || '未指定單位')}</div></td><td>${esc(item && item.applicantName || '—')}<div class="review-card-subtitle review-card-subtitle--top-4">${esc(item && item.applicantEmail || '—')}</div><div class="review-card-subtitle review-card-subtitle--top-4">資安角色：${esc(formatSecurityRolesSummary(item && item.securityRoles))}</div>${attachmentBlock}</td><td>${esc(item && item.extensionNumber || '—')}</td><td>${unitContactStatusBadge(item)}</td><td>${esc(item && item.reviewComment || '—')}</td><td>${esc(fmtTime(item && (item.updatedAt || item.submittedAt)) || '—')}</td><td><div class="${actionClass}">${actionButtons}</div></td></tr>`;
    }).join('');
  }

  function buildUnitContactReviewVirtualSpacer(height) {
    return `<tr class="review-virtual-spacer" aria-hidden="true"><td class="review-virtual-spacer-cell" colspan="7" style="height:${Math.max(0, Math.round(height))}px"></td></tr>`;
  }

  function getUnitContactReviewVirtualWindow(totalRows) {
    if (!unitContactReviewTableViewport || totalRows <= UNIT_CONTACT_REVIEW_VIRTUAL_ROW_THRESHOLD) {
      return {
        enabled: false,
        start: 0,
        end: totalRows,
        padTop: 0,
        padBottom: 0
      };
    }
    const scrollTop = Math.max(0, Number(unitContactReviewTableViewport.scrollTop || 0));
    const viewportHeight = Math.max(ADMIN_MIN_VIRTUAL_VIEWPORT_HEIGHT, Number(unitContactReviewTableViewport.clientHeight || 0) || 0);
    const start = Math.max(0, Math.floor(scrollTop / UNIT_CONTACT_REVIEW_VIRTUAL_ROW_HEIGHT) - UNIT_CONTACT_REVIEW_VIRTUAL_ROW_OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / UNIT_CONTACT_REVIEW_VIRTUAL_ROW_HEIGHT) + (UNIT_CONTACT_REVIEW_VIRTUAL_ROW_OVERSCAN * 2);
    const end = Math.min(totalRows, start + visibleCount);
    return {
      enabled: true,
      start,
      end,
      padTop: start * UNIT_CONTACT_REVIEW_VIRTUAL_ROW_HEIGHT,
      padBottom: Math.max(0, (totalRows - end) * UNIT_CONTACT_REVIEW_VIRTUAL_ROW_HEIGHT)
    };
  }

  function renderUnitContactReviewVirtualRows(items) {
    const body = document.getElementById('unit-contact-review-table-body');
    if (!body) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      body.innerHTML = renderUnitContactReviewRows([]);
      return;
    }
    const virtualWindow = getUnitContactReviewVirtualWindow(rows.length);
    if (!virtualWindow.enabled) {
      body.innerHTML = renderUnitContactReviewRows(rows);
      return;
    }
    const rowsHtml = renderUnitContactReviewRows(rows.slice(virtualWindow.start, virtualWindow.end));
    body.innerHTML = buildUnitContactReviewVirtualSpacer(virtualWindow.padTop)
      + rowsHtml
      + buildUnitContactReviewVirtualSpacer(virtualWindow.padBottom);
  }

  function scheduleUnitContactReviewRowsRender() {
    if (unitContactReviewVirtualRowsRenderPending) return;
    unitContactReviewVirtualRowsRenderPending = true;
    const run = function () {
      unitContactReviewVirtualRowsRenderPending = false;
      if (!String(window.location.hash || '').startsWith('#unit-contact-review')) return;
      renderUnitContactReviewVirtualRows(Array.isArray(unitContactReviewState && unitContactReviewState.items) ? unitContactReviewState.items : []);
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
      return;
    }
    window.setTimeout(run, 0);
  }

  async function renderUnitContactReview(nextFilters, options) {
    if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可審核單位管理人申請', 'error'); return; }
    const opts = options || {};
    const isStaleRender = beginAdminRouteRender(unitContactReviewState, "#unit-contact-review");
      const visibleApplicationsCache = renderUnitContactReview._remoteViewCache || (renderUnitContactReview._remoteViewCache = unitContactReviewCollectionBundle.viewCache || createAdminRemoteViewCache(DEFAULT_UNIT_CONTACT_REVIEW_FILTERS));
    unitContactReviewState.filters = normalizePagedFilters({ ...unitContactReviewState.filters, ...(nextFilters || {}) }, DEFAULT_UNIT_CONTACT_REVIEW_FILTERS);
    unitContactReviewState.loading = true;
    const app = document.getElementById('app');
    if (!visibleApplicationsCache.items.length) {
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與登入資訊追蹤</h1></div></div><div class="card review-loading-card">正在讀取申請資料...</div></div>`;
      refreshIcons();
    }
    async function fetchApplicationsForAdminView(fetchOptions) {
      const remoteOpts = fetchOptions || {};
      const signature = JSON.stringify(unitContactReviewState.filters);
      const now = Date.now();
      if (!remoteOpts.force && visibleApplicationsCache.items.length && visibleApplicationsCache.signature === signature && (now - Number(visibleApplicationsCache.fetchedAt || 0)) < 30000) {
        return {
          items: visibleApplicationsCache.items.slice(),
          summary: visibleApplicationsCache.summary || normalizeUnitContactReviewSummary(null, visibleApplicationsCache.items.length),
          page: visibleApplicationsCache.page || buildAdminCollectionPage(unitContactReviewState.filters, visibleApplicationsCache.items.length, 50, 100),
          filters: visibleApplicationsCache.filters || { ...unitContactReviewState.filters },
          generatedAt: unitContactReviewState.lastLoadedAt || new Date().toISOString()
        };
      }
      if (!remoteOpts.force && visibleApplicationsCache.promise) return visibleApplicationsCache.promise;
      const client = await waitForPagedClient(getUnitContactApplicationsPagedClient, 800);
      if (!client) {
        throw new Error('unit contact applications paged client unavailable');
      }
      const pending = client(unitContactReviewState.filters).then((response) => {
        const items = Array.isArray(response && response.items) ? response.items : [];
        const summary = normalizeUnitContactReviewSummary(response && response.summary, response && response.total);
        const page = response && response.page ? response.page : buildAdminCollectionPage(unitContactReviewState.filters, response && response.total, 50, 100);
        visibleApplicationsCache.signature = signature;
        visibleApplicationsCache.items = items.slice();
        visibleApplicationsCache.summary = summary;
        visibleApplicationsCache.page = page;
        visibleApplicationsCache.filters = normalizePagedFilters(response && response.filters ? response.filters : unitContactReviewState.filters, DEFAULT_UNIT_CONTACT_REVIEW_FILTERS);
        visibleApplicationsCache.fetchedAt = Date.now();
        return {
          items,
          summary,
          page,
          filters: visibleApplicationsCache.filters,
          generatedAt: String(response && response.generatedAt || '').trim() || new Date().toISOString()
        };
      }).finally(() => {
        visibleApplicationsCache.promise = null;
      });
      visibleApplicationsCache.promise = pending;
      return pending;
    }
    try {
      const result = await fetchApplicationsForAdminView({ force: !!opts.forceRemote });
      if (isStaleRender()) return;
      unitContactReviewState.items = Array.isArray(result && result.items) ? result.items : [];
      unitContactReviewState.summary = normalizeUnitContactReviewSummary(result && result.summary, unitContactReviewState.items.length);
      unitContactReviewState.page = result && result.page ? result.page : buildAdminCollectionPage(unitContactReviewState.filters, unitContactReviewState.items.length, 50, 100);
      unitContactReviewState.filters = normalizePagedFilters(result && result.filters ? result.filters : unitContactReviewState.filters, DEFAULT_UNIT_CONTACT_REVIEW_FILTERS);
      unitContactReviewState.lastLoadedAt = String(result && result.generatedAt || '').trim() || new Date().toISOString();
      unitContactReviewState.loading = false;
    } catch (error) {
      if (isStaleRender()) return;
      unitContactReviewState.loading = false;
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與登入資訊追蹤</h1><p class="page-subtitle">無法讀取申請清單。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitContactReview">${ic('refresh-cw', 'icon-sm')} 重試</button></div></div><div class="card"><div class="empty-state review-empty review-empty--spacious"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">申請後端尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
    }

    const renderUnitContactReviewSignature = getUnitContactReviewRenderSignature();
    if (!(unitContactReviewRenderCache.signature === renderUnitContactReviewSignature && app && app.dataset.unitContactReviewRenderSignature === renderUnitContactReviewSignature)) {
      let unitContactReviewPageHtml = unitContactReviewMarkupCache.signature === renderUnitContactReviewSignature ? unitContactReviewMarkupCache.html : '';
      if (!unitContactReviewPageHtml) {
    const counts = unitContactReviewState.summary || normalizeUnitContactReviewSummary(null, unitContactReviewState.items.length);
    const pager = renderAdminCollectionPager({
      idPrefix: 'unit-contact-review',
      actionPrefix: 'admin.unitContactReview',
      page: unitContactReviewState.page,
      summary: formatAdminCollectionSummary(unitContactReviewState.page, '目前沒有符合條件的申請'),
      defaultLimit: 50,
      limitOptions: ['5', '20', '50', '100']
    });
    unitContactReviewPageHtml = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與登入資訊追蹤</h1><p class="page-subtitle">最後更新：${esc(fmtTime(unitContactReviewState.lastLoadedAt))}</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitContactReview">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('mail-plus')}</div><div class="stat-value">${counts.total || 0}</div><div class="stat-label">符合條件申請</div></div><div class="stat-card pending"><div class="stat-icon">${ic('hourglass')}</div><div class="stat-value">${counts.pendingReview || 0}</div><div class="stat-label">待審核</div></div><div class="stat-card closed"><div class="stat-icon">${ic('badge-check')}</div><div class="stat-value">${(counts.approved || 0) + (counts.activationPending || 0) + (counts.active || 0)}</div><div class="stat-label">已處理</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('key-round')}</div><div class="stat-value">${counts.active || 0}</div><div class="stat-label">已啟用</div></div></div><div class="card review-table-card"><div class="card-header"><span class="card-title">申請清單</span><span class="review-card-subtitle">可依狀態、電子郵件與關鍵字過濾</span></div><div class="review-toolbar"><div class="review-toolbar-main"><div class="form-group"><label class="form-label">狀態</label><select class="form-select" id="unit-contact-review-status"><option value="" ${!unitContactReviewState.filters.status ? 'selected' : ''}>全部</option><option value="pending_review" ${unitContactReviewState.filters.status === 'pending_review' ? 'selected' : ''}>待審核</option><option value="approved" ${unitContactReviewState.filters.status === 'approved' ? 'selected' : ''}>已通過（舊資料）</option><option value="returned" ${unitContactReviewState.filters.status === 'returned' ? 'selected' : ''}>退回補件</option><option value="rejected" ${unitContactReviewState.filters.status === 'rejected' ? 'selected' : ''}>未核准</option><option value="active" ${unitContactReviewState.filters.status === 'active' ? 'selected' : ''}>已啟用</option></select></div><div class="form-group"><label class="form-label">申請電子郵件</label><input class="form-input" id="unit-contact-review-email" value="${esc(unitContactReviewState.filters.email)}" placeholder="例如 ntu.edu.tw 或 Gmail"></div><div class="form-group"><label class="form-label">關鍵字</label><input class="form-input" id="unit-contact-review-keyword" value="${esc(unitContactReviewState.filters.keyword)}" placeholder="單位、申請人、編號"></div><div class="form-group"><label class="form-label">筆數</label><select class="form-select" id="unit-contact-review-limit"><option value="5" ${unitContactReviewState.filters.limit === '5' ? 'selected' : ''}>5</option><option value="20" ${unitContactReviewState.filters.limit === '20' ? 'selected' : ''}>20</option><option value="50" ${unitContactReviewState.filters.limit === '50' ? 'selected' : ''}>50</option><option value="100" ${unitContactReviewState.filters.limit === '100' ? 'selected' : ''}>100</option></select></div></div><div class="review-toolbar-actions"><button type="button" class="btn btn-primary" data-action="admin.applyUnitContactFilters">${ic('filter', 'icon-sm')} 套用篩選</button><button type="button" class="btn btn-secondary" data-action="admin.resetUnitContactFilters">${ic('rotate-ccw', 'icon-sm')} 重設</button></div></div>${pager}${buildReviewTableShell('unit-contact-review-table', '<th>申請編號 / 單位</th><th>申請人</th><th>分機</th><th>狀態</th><th>處理說明</th><th>最後更新</th><th>操作</th>', '', { toolbarSubtitle: '通過後會直接啟用帳號並寄送登入資訊；已啟用案件可補寄登入資訊。', wrapperId: 'unit-contact-review-table-wrap', wrapperClass: 'unit-contact-review-table-wrap', tbodyId: 'unit-contact-review-table-body' })}</div></div>`;
        unitContactReviewMarkupCache = { signature: renderUnitContactReviewSignature, html: unitContactReviewPageHtml };
      }
      app.innerHTML = unitContactReviewPageHtml;
      unitContactReviewRenderCache = { signature: renderUnitContactReviewSignature, filterSignature: JSON.stringify(unitContactReviewState.filters) };
      if (app) app.dataset.unitContactReviewRenderSignature = renderUnitContactReviewSignature;
    }
    unitContactReviewTableViewport = document.getElementById('unit-contact-review-table-wrap');
    renderUnitContactReviewVirtualRows(Array.isArray(unitContactReviewState.items) ? unitContactReviewState.items : []);
    if (typeof releaseUnitContactReviewVirtualScroll === 'function') {
      releaseUnitContactReviewVirtualScroll();
      releaseUnitContactReviewVirtualScroll = null;
    }
    if (typeof releaseUnitContactReviewVirtualResize === 'function') {
      releaseUnitContactReviewVirtualResize();
      releaseUnitContactReviewVirtualResize = null;
    }
    if (unitContactReviewTableViewport) {
      releaseUnitContactReviewVirtualScroll = bindAdminPageEvent(unitContactReviewTableViewport, 'scroll', scheduleUnitContactReviewRowsRender, { passive: true });
      releaseUnitContactReviewVirtualResize = bindAdminPageEvent(window, 'resize', scheduleUnitContactReviewRowsRender);
    }
    registerAdminPageCleanup(function () {
      if (typeof releaseUnitContactReviewVirtualScroll === 'function') {
        releaseUnitContactReviewVirtualScroll();
      }
      if (typeof releaseUnitContactReviewVirtualResize === 'function') {
        releaseUnitContactReviewVirtualResize();
      }
      releaseUnitContactReviewVirtualScroll = null;
      releaseUnitContactReviewVirtualResize = null;
      unitContactReviewTableViewport = null;
      unitContactReviewVirtualRowsRenderPending = false;
    });
    bindAdminCollectionPager({
      idPrefix: 'unit-contact-review',
      actionPrefix: 'admin.unitContactReview',
      page: unitContactReviewState.page,
      defaultLimit: 50,
      limitOptions: ['5', '20', '50', '100'],
      onChange: (patch) => renderUnitContactReview({ ...unitContactReviewState.filters, ...patch }, { forceRemote: true })
    });
    wireReviewTableScrollers(app);
    refreshIcons();
  }

  async function renderUnitReview(nextFilters) {
      if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可管理單位治理', 'error'); return; }
      unitGovernanceState.filters = normalizePagedFilters({ ...unitGovernanceState.filters, ...(nextFilters || {}) }, DEFAULT_GOVERNANCE_FILTERS);
      unitGovernanceState.loading = true;
    const isStaleRender = beginAdminRouteRender(unitGovernanceState, "#unit-review");
    const app = document.getElementById('app');
    if (!unitGovernanceState.items || !unitGovernanceState.items.length) {
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位治理</div><h1 class="page-title">填報模式與授權設定</h1></div></div><div class="card review-loading-card">正在整理單位治理資料...</div></div>`;
      refreshIcons();
    }
    try {
        const result = await listGovernanceItemsForAdmin(unitGovernanceState.filters);
        if (isStaleRender()) return;
        unitGovernanceState.items = Array.isArray(result && result.items) ? result.items : [];
        unitGovernanceState.summary = result && result.summary ? result.summary : summarizeGovernanceItems(unitGovernanceState.items);
        unitGovernanceState.categorySummaries = normalizeGovernanceCategorySummaries(result && result.categorySummaries);
        unitGovernanceState.page = result && result.page ? result.page : buildAdminCollectionPage(unitGovernanceState.filters, unitGovernanceState.items.length, 12, ADMIN_COLLECTION_FILTER_INVENTORY_LIMIT);
        unitGovernanceState.filters = normalizePagedFilters(result && result.filters ? result.filters : unitGovernanceState.filters, DEFAULT_GOVERNANCE_FILTERS);
        unitGovernanceState.lastLoadedAt = String(result && result.generatedAt || '').trim() || new Date().toISOString();
    } catch (error) {
      if (isStaleRender()) return;
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位治理</div><h1 class="page-title">填報模式與授權設定</h1><p class="page-subtitle">無法讀取單位治理資料。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitReview">${ic('refresh-cw', 'icon-sm')} 重試</button></div></div><div class="card"><div class="empty-state review-empty review-empty--spacious"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">單位治理資料尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
    }
    const counts = unitGovernanceState.summary || summarizeGovernanceItems(unitGovernanceState.items);
      const cardsHtml = getCachedUnitGovernanceCardsHtml(
        unitGovernanceState.items,
        unitGovernanceState.filters,
        unitGovernanceState.page,
        unitGovernanceState.lastLoadedAt,
        unitGovernanceState.categorySummaries
      );
    const governancePagerHtml = renderAdminCollectionPager({
      idPrefix: 'unit-governance',
      actionPrefix: 'admin.unitGovernance',
      page: unitGovernanceState.page,
      summary: formatAdminCollectionSummary(unitGovernanceState.page, '目前沒有符合條件的單位治理資料')
    });
    app.innerHTML = `<div class="animate-in">
      <div class="page-header review-page-header"><div><div class="page-eyebrow">單位治理</div><h1 class="page-title">填報模式與授權設定</h1><p class="page-subtitle">設定一級單位的獨立 / 合併填報模式，並依行政單位、學術單位、中心 / 研究單位分層檢視。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitReview">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div>
      <div class="stats-grid review-stats-grid">
        <div class="stat-card total"><div class="stat-icon">${ic('building-2')}</div><div class="stat-value">${counts.total}</div><div class="stat-label">可設定單位</div></div>
        <div class="stat-card closed"><div class="stat-icon">${ic('layers-3')}</div><div class="stat-value">${counts.consolidated}</div><div class="stat-label">合併填報</div></div>
        <div class="stat-card pending"><div class="stat-icon">${ic('split')}</div><div class="stat-value">${counts.independent}</div><div class="stat-label">獨立填報</div></div>
        <div class="stat-card overdue"><div class="stat-icon">${ic('users')}</div><div class="stat-value">${counts.children}</div><div class="stat-label">轄下二級單位</div></div>
      </div>
      <div class="card review-table-card governance-table-card">
        <div class="card-header"><span class="card-title">治理分類清單</span><span class="review-card-subtitle">依行政單位、學術單位、中心 / 研究單位展開，統一查看填報模式與轄下單位。</span></div>
        <div class="review-toolbar">
          <div class="review-toolbar-main">
            <div class="form-group review-filter-group review-filter-group--wide"><label class="form-label">關鍵字</label><input class="form-input" id="unit-governance-keyword" value="${esc(unitGovernanceState.filters.keyword || '')}" placeholder="單位名稱、子單位、模式、備註"></div>
            <div class="form-group review-filter-group"><label class="form-label">填報模式</label><select class="form-select" id="unit-governance-mode"><option value="all" ${unitGovernanceState.filters.mode === 'all' ? 'selected' : ''}>全部</option><option value="independent" ${unitGovernanceState.filters.mode === 'independent' ? 'selected' : ''}>獨立填報</option><option value="consolidated" ${unitGovernanceState.filters.mode === 'consolidated' ? 'selected' : ''}>合併 / 統一填報</option></select></div>
            <div class="form-group review-filter-group review-filter-group--medium"><label class="form-label">分類</label><select class="form-select" id="unit-governance-category"><option value="all" ${unitGovernanceState.filters.category === 'all' ? 'selected' : ''}>全部</option><option value="行政單位" ${unitGovernanceState.filters.category === '行政單位' ? 'selected' : ''}>行政單位</option><option value="學術單位" ${unitGovernanceState.filters.category === '學術單位' ? 'selected' : ''}>學術單位</option><option value="中心 / 研究單位" ${unitGovernanceState.filters.category === '中心 / 研究單位' ? 'selected' : ''}>中心 / 研究單位</option></select></div>
          </div>
          <div class="review-toolbar-actions">
            <button type="button" class="btn btn-primary" data-action="admin.applyGovernanceFilters">${ic('filter', 'icon-sm')} 套用篩選</button>
            <button type="button" class="btn btn-secondary" data-action="admin.resetGovernanceFilters">${ic('rotate-ccw', 'icon-sm')} 重設</button>
          </div>
        </div>
        <div class="security-window-category-stack governance-category-stack">${cardsHtml}</div>
        ${governancePagerHtml}
      </div>
    </div>`;
    refreshIcons();
    bindAdminCollectionPager({
      idPrefix: 'unit-governance',
      actionPrefix: 'admin.unitGovernance',
      page: unitGovernanceState.page,
      onChange: function (delta) {
        renderUnitReview({ ...unitGovernanceState.filters, ...(delta || {}) });
      }
    });
    wireGovernanceCategoryCards(app);
    if (typeof bindCopyButtons === 'function') bindCopyButtons();
    else if (window && typeof window.bindCopyButtons === 'function') window.bindCopyButtons();
    registerActionHandlers('admin', {
      applyGovernanceFilters: function () {
        renderUnitReview(getGovernanceFiltersFromDom());
      },
      resetGovernanceFilters: function () {
        renderUnitReview({ ...DEFAULT_GOVERNANCE_FILTERS });
      },
      saveGovernanceMode: function ({ dataset }) {
        const unit = String(dataset && dataset.unit || '').trim();
        if (!unit) return;
        const currentFilters = { ...unitGovernanceState.filters };
        const modeEl = document.querySelector(`[data-governance-unit-mode="${CSS.escape(unit)}"]`);
        const noteEl = document.querySelector(`[data-governance-unit-note="${CSS.escape(unit)}"]`);
        const mode = modeEl ? modeEl.value : 'independent';
        const note = noteEl ? noteEl.value.trim() : '';
        saveGovernanceModeForAdmin(unit, mode, note)
          .then((result) => {
            toast(result && result.mode === 'consolidated' ? `${unit} 已設定為合併填報` : `${unit} 已設定為獨立填報`);
            dispatchAdminCacheInvalidationScopes(['unit-governance', 'security-window', 'audit-trail'], 'governance-updated');
            renderUnitReview(currentFilters);
          })
          .catch((error) => {
            toast(String(error && error.message || error || '儲存單位治理設定失敗'), 'error');
          });
      }
    });
  }

  function filterSecurityWindowInventory(inventory, filters) {
    const source = inventory && typeof inventory === 'object' ? inventory : { units: [], people: [], summary: {}, generatedAt: '' };
    const keyword = String(filters && filters.keyword || '').trim().toLowerCase();
    const status = String(filters && filters.status || 'all').trim() || 'all';
    const matchesKeyword = (parts) => {
      if (!keyword) return true;
      const haystack = (Array.isArray(parts) ? parts : [parts])
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    };
    const units = Array.isArray(source.units) ? source.units.filter((unit) => {
      if (status !== 'all') {
        if (status === 'assigned' && unit.status !== 'assigned') return false;
        if (status === 'missing' && unit.status !== 'missing') return false;
        if (status === 'pending' && unit.status !== 'pending') return false;
        if (status === 'exempted' && unit.mode !== 'consolidated') return false;
      }
      return matchesKeyword([
        unit.unit,
        unit.category,
        unit.mode,
        unit.note,
        (unit.children || []).join(' '),
        (unit.holders || []).map((person) => [person.name, person.username, person.email].filter(Boolean).join(' ')).join(' '),
        (unit.pending || []).map((item) => [item.applicantName, item.applicantEmail, item.status].filter(Boolean).join(' ')).join(' ')
      ]);
    }) : [];
    const people = Array.isArray(source.people) ? source.people.filter((person) => {
      if (status !== 'all') {
        if (status === 'assigned' && !person.hasWindow) return false;
        if (status === 'missing' && person.hasWindow) return false;
        if (status === 'pending' || status === 'exempted') return true;
      }
      return matchesKeyword([
        person.name,
        person.username,
        person.email,
        person.activeUnit,
        (person.units || []).join(' '),
        (person.securityRoles || []).join(' ')
      ]);
    }) : [];
    const summary = {
      totalUnits: units.length,
      unitsWithWindows: units.filter((unit) => unit.hasWindow).length,
      unitsWithoutWindows: units.filter((unit) => !unit.hasWindow).length,
      peopleWithWindows: people.filter((person) => person.hasWindow).length,
      peopleWithoutWindow: people.filter((person) => !person.hasWindow).length,
      pendingApplications: units.reduce((count, unit) => count + (Array.isArray(unit.pending) ? unit.pending.length : 0), 0),
      exemptedUnits: units.reduce((count, unit) => count + (unit.exemptedRows || 0), 0)
    };
    return { units, people, summary, generatedAt: source && source.generatedAt ? source.generatedAt : '' };
  }

  async function loadSecurityWindowInventory(force) {
    if (!force && isSecurityWindowInventoryFresh() && securityWindowInventoryCache.value) {
      return securityWindowInventoryCache.value;
    }
    if (!force && securityWindowLoadPromise) {
      return securityWindowLoadPromise;
    }
    const pending = (async () => {
      const inventory = await fetchSecurityWindowInventoryFromSource();
      securityWindowInventoryCache = {
        loadedAt: Date.now(),
        value: inventory
      };
      return inventory;
    })().catch((error) => {
      window.__ismsWarn('security window inventory load failed', error);
      if (securityWindowInventoryCache.value) {
        return securityWindowInventoryCache.value;
      }
      throw error;
    }).finally(() => {
      if (securityWindowLoadPromise === pending) {
        securityWindowLoadPromise = null;
      }
    });
    securityWindowLoadPromise = pending;
    return pending;
  }

  async function renderSecurityWindow(nextFilters, options) {
    if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理者可檢視資安窗口', 'error'); return; }
    const opts = options || {};
    securityWindowState.filters = normalizePagedFilters({ ...securityWindowState.filters, ...(nextFilters || {}) }, DEFAULT_SECURITY_WINDOW_FILTERS);
    const isStaleRender = beginAdminRouteRender(securityWindowState, "#security-window");
    const app = document.getElementById('app');
    const resolvedFilters = { ...DEFAULT_SECURITY_WINDOW_FILTERS, ...securityWindowState.filters };
    let response;
    try {
      if (!securityWindowState.items || !securityWindowState.items.length) {
        app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">系統管理</div><h1 class="page-title">資安窗口</h1></div></div><div class="card review-loading-card">正在載入資安窗口盤點資料...</div></div>`;
      }
      refreshIcons();
      response = await fetchSecurityWindowInventoryFromSource(resolvedFilters, opts);
      if (isStaleRender()) return;
    } catch (error) {
      if (isStaleRender()) return;
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">系統管理</div><h1 class="page-title">資安窗口</h1><p class="page-subtitle">資安窗口盤點資料載入失敗，請稍後再試。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshSecurityWindow">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="card"><div class="empty-state review-empty review-empty--spacious"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">載入失敗</div><div class="empty-state-desc">${esc(String(error && error.message || error || '無法載入資安窗口盤點資料'))}</div></div></div></div>`;
      refreshIcons();
      return;
    }

      const safeInventory = normalizeSecurityWindowInventory(response && response.inventory);
      securityWindowState.inventory = safeInventory;
      securityWindowState.categorySummaries = normalizeSecurityWindowCategorySummaries(response && response.categorySummaries);
      securityWindowState.page = response && response.page ? response.page : buildAdminCollectionPage(resolvedFilters, safeInventory.units.length, 12, ADMIN_COLLECTION_FILTER_INVENTORY_LIMIT);
      securityWindowState.filters = normalizePagedFilters(response && response.filters ? response.filters : resolvedFilters, DEFAULT_SECURITY_WINDOW_FILTERS);
      securityWindowState.lastLoadedAt = safeInventory.generatedAt || new Date().toISOString();
    securityWindowState.filterSignature = getSecurityWindowFilterSignature(securityWindowState.filters);
    const summary = safeInventory.summary || buildEmptySecurityWindowInventory().summary;
      const unitCardsHtml = getCachedSecurityWindowUnitCardsHtml(
        safeInventory.units,
        securityWindowState.filters,
        securityWindowState.page,
        safeInventory.generatedAt,
        securityWindowState.categorySummaries
      );
    const peopleRowsHtml = getCachedSecurityWindowPeopleRowsHtml(
      safeInventory.people,
      securityWindowState.filters,
      safeInventory.generatedAt
    );
    const unitPagerHtml = renderAdminCollectionPager({
      idPrefix: 'security-window',
      actionPrefix: 'admin.securityWindow',
      page: securityWindowState.page,
      summary: formatAdminCollectionSummary(securityWindowState.page, '目前沒有符合條件的資安窗口單位')
    });
    app.innerHTML = `<div class="animate-in">
      <div class="page-header review-page-header">
        <div>
          <div class="page-eyebrow">系統管理</div>
          <h1 class="page-title">資安窗口</h1>
          <p class="page-subtitle">盤點全校各單位的資安窗口配置，依行政單位、學術單位、中心 / 研究單位分層顯示，僅最高管理者可檢視。</p>
        </div>
        <div class="review-header-actions">
          <button type="button" class="btn btn-secondary" data-action="admin.refreshSecurityWindow">${ic('refresh-cw', 'icon-sm')} 重新整理</button>
          <button type="button" class="btn btn-secondary" data-action="admin.exportSecurityWindow">${ic('download', 'icon-sm')} 匯出 JSON</button>
        </div>
      </div>
      <div class="stats-grid review-stats-grid">
        <div class="stat-card total"><div class="stat-icon">${ic('building-2')}</div><div class="stat-value">${summary.totalUnits}</div><div class="stat-label">可盤點單位</div></div>
        <div class="stat-card closed"><div class="stat-icon">${ic('badge-check')}</div><div class="stat-value">${summary.unitsWithWindows}</div><div class="stat-label">已設定資安窗口</div></div>
        <div class="stat-card pending"><div class="stat-icon">${ic('alert-triangle')}</div><div class="stat-value">${summary.unitsWithoutWindows}</div><div class="stat-label">尚未設定</div></div>
        <div class="stat-card overdue"><div class="stat-icon">${ic('users-round')}</div><div class="stat-value">${summary.peopleWithoutWindow}</div><div class="stat-label">尚未設定人員</div></div>
      </div>
      <div class="card review-table-card">
        <div class="card-header"><span class="card-title">單位盤點</span><span class="review-card-subtitle">依行政單位、學術單位、中心 / 研究單位展開，顯示各單位與二級單位的資安窗口狀態</span></div>
        <form id="security-window-filter-form" class="review-toolbar">
          <div class="review-toolbar-main">
            <div class="form-group review-filter-group review-filter-group--wide"><label class="form-label">關鍵字</label><input class="form-input" id="security-window-keyword" value="${esc(securityWindowState.filters.keyword)}" placeholder="單位、姓名、帳號、電子郵件、角色"></div>
            <div class="form-group review-filter-group"><label class="form-label">狀態</label><select class="form-select" id="security-window-status"><option value="all" ${securityWindowState.filters.status === 'all' ? 'selected' : ''}>全部</option><option value="assigned" ${securityWindowState.filters.status === 'assigned' ? 'selected' : ''}>已設定</option><option value="missing" ${securityWindowState.filters.status === 'missing' ? 'selected' : ''}>未設定</option><option value="pending" ${securityWindowState.filters.status === 'pending' ? 'selected' : ''}>待審核</option><option value="exempted" ${securityWindowState.filters.status === 'exempted' ? 'selected' : ''}>由一級單位統一</option></select></div>
            <div class="form-group review-filter-group review-filter-group--medium"><label class="form-label">分類</label><select class="form-select" id="security-window-category"><option value="all" ${securityWindowState.filters.category === 'all' ? 'selected' : ''}>全部</option><option value="行政單位" ${securityWindowState.filters.category === '行政單位' ? 'selected' : ''}>行政單位</option><option value="學術單位" ${securityWindowState.filters.category === '學術單位' ? 'selected' : ''}>學術單位</option><option value="中心 / 研究單位" ${securityWindowState.filters.category === '中心 / 研究單位' ? 'selected' : ''}>中心 / 研究單位</option></select></div>
          </div>
          <div class="review-toolbar-actions">
            <button type="button" class="btn btn-secondary" data-action="admin.applySecurityWindowFilters">${ic('search', 'icon-sm')} 套用</button>
            <button type="button" class="btn btn-secondary" data-action="admin.resetSecurityWindowFilters">${ic('rotate-ccw', 'icon-sm')} 重設</button>
          </div>
        </form>
        <div class="governance-grid">${unitCardsHtml}</div>
        ${unitPagerHtml}
      </div>
      <div class="card review-table-card review-table-card--spaced">
        <div class="card-header"><span class="card-title">資安窗口人員</span><span class="review-card-subtitle">依姓名、帳號、單位與狀態快速查找資安窗口人員</span></div>
        ${buildReviewTableShell('security-window-people-table', '<th>姓名</th><th>帳號 / 電子郵件</th><th>單位</th><th>資安角色</th><th>狀態</th><th>主要單位</th>', peopleRowsHtml, { toolbarSubtitle: '可依姓名、帳號、電子郵件、單位與資安角色篩選。' })}
      </div>
    </div>`;
    const form = document.getElementById('security-window-filter-form');
    if (form) {
      bindAdminPageEvent(form, 'submit', function (event) {
        event.preventDefault();
        renderSecurityWindow(getSecurityWindowFiltersFromDom());
      });
    }
    bindAdminCollectionPager({
      idPrefix: 'security-window',
      actionPrefix: 'admin.securityWindow',
      page: securityWindowState.page,
      onChange: function (delta) {
        renderSecurityWindow({ ...securityWindowState.filters, ...(delta || {}) });
      }
    });
    wireReviewTableScrollers(app);
    refreshIcons();
  }  async function handleRefreshSecurityWindow() {
    await renderSecurityWindow(securityWindowState.filters, { force: true });
  }

  async function handleApplySecurityWindowFilters() {
    await renderSecurityWindow(getSecurityWindowFiltersFromDom());
  }

  async function handleResetSecurityWindowFilters() {
    await renderSecurityWindow({ ...DEFAULT_SECURITY_WINDOW_FILTERS });
  }

  async function handleExportSecurityWindow() {
    let inventory;
    if (isRemoteGovernanceEnabled()) {
      const client = getAdminApiClient();
      const response = await client.getSecurityWindowInventory({ ...securityWindowState.filters, limit: '500', offset: '0' });
      inventory = response && response.inventory ? response.inventory : buildEmptySecurityWindowInventory();
    } else {
      inventory = await loadSecurityWindowInventory(false);
    }
    const filters = { ...securityWindowState.filters };
    downloadJson('isms-security-window-' + new Date().toISOString().slice(0, 10) + '.json', {
      exportedAt: new Date().toISOString(),
      filters,
      inventory
    });
    toast('已匯出資安窗口盤點 JSON');
  }

  async function handleExportSupportBundle() {
    if (!isAdmin()) return;
    const bundle = await exportSupportBundle();
    downloadJson('isms-support-bundle-' + new Date().toISOString().slice(0, 10) + '.json', bundle);
    toast('已匯出支援包（含 store snapshot 與附件健康資訊）');
  }

  async function handlePruneOrphanAttachments() {
    if (!isAdmin()) return;
    const health = await getAttachmentHealth();
    if (!health.orphanAttachments) {
      toast('目前沒有孤兒附件可清除', 'info');
      return;
    }
    const pruneConfirmed = typeof openConfirmDialog === 'function'
      ? await openConfirmDialog(`確定清除 ${health.orphanAttachments} 筆孤兒附件嗎？這不會影響仍被單據引用的檔案。`, { title: '清除孤兒附件', confirmLabel: '清除', confirmClass: 'btn-danger', kicker: '警告' })
      : confirm(`確定清除 ${health.orphanAttachments} 筆孤兒附件嗎？這不會影響仍被單據引用的檔案。`);
    if (!pruneConfirmed) return;
    const result = await pruneOrphanAttachments();
    toast(`已清除 ${result.removedCount} 筆孤兒附件，釋放 ${formatSchemaBytes(result.removedBytes)}`);
    renderSchemaHealth();
  }

    async function renderAuditTrail(nextFilters) {
      if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可檢視操作稽核軌跡', 'error'); return; }
      const app = document.getElementById('app');
      const resolvedFilters = { ...DEFAULT_AUDIT_FILTERS, ...(nextFilters || auditTrailState.filters) };
      const filterSignature = getAuditTrailFilterSignature(resolvedFilters);
      const cachedState = getAuditTrailQueryCacheValue(filterSignature);
      const canRenderFromCache = !!cachedState;

    let state;
    try {
      if (canRenderFromCache) {
        state = {
          ...cachedState,
          filters: resolvedFilters
        };
        const cachedSummary = readAuditTrailSummary(resolvedFilters, false);
        if (cachedSummary) {
          state.summary = cachedSummary;
        }
        Object.assign(auditTrailState, state);
        if (!isAuditTrailDataFresh(filterSignature) && !getAuditTrailLoadPromise(filterSignature)) {
          loadAuditTrailData(resolvedFilters).then(function () {
            if (document.getElementById('audit-filter-form')) {
              renderAuditTrail(resolvedFilters);
            }
          }).catch(function (error) {
            window.__ismsWarn('audit trail background refresh failed', error);
          });
        }
      } else {
        // Don't block rendering — show empty shell, load in background
        state = {
          filters: resolvedFilters,
          items: [],
          summary: { total: 0, actorCount: 0, latestOccurredAt: '', eventTypes: [] },
          page: { total: 0, returned: 0, limit: 50, offset: 0, hasNext: false, hasPrev: false },
          health: auditTrailState.health || null,
          lastLoadedAt: '',
          filterSignature,
          loading: true
        };
        Object.assign(auditTrailState, state);
        loadAuditTrailData(resolvedFilters).then(function () {
          if (document.getElementById('audit-filter-form')) {
            renderAuditTrail(resolvedFilters);
          }
        }).catch(function (error) {
          window.__ismsWarn('audit trail initial load failed', error);
          toast('操作軌跡載入失敗：' + String(error && error.message || error || ''), 'error');
        });
      }
    } catch (error) {
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">稽核追蹤</div><h1 class="page-title">操作稽核軌跡</h1><p class="page-subtitle">無法讀取後端稽核資料。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshAuditTrail">${ic('refresh-cw', 'icon-sm')} 重試</button></div></div><div class="card"><div class="empty-state review-empty review-empty--spacious"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">稽核軌跡後端尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
      }

    state.page = normalizeAuditTrailPage(state && state.page, resolvedFilters, Array.isArray(state && state.items) ? state.items : []);
    auditTrailState.page = state.page;
    const health = state.health || { ready: false, message: '未取得後端健康資訊' };
    const renderSignature = getAuditTrailRenderSignature(state, health);
    if (auditTrailRenderCache.signature === renderSignature && app && app.dataset.auditTrailRenderSignature === renderSignature) {
      return;
    }
    let pageHtml = auditTrailMarkupCache.signature === renderSignature
      ? auditTrailMarkupCache.html
      : '';
    if (!pageHtml) {
      const items = Array.isArray(state.items) ? state.items : [];
      const eventTypeOptions = getAuditTrailEventTypeOptions(state.summary, items);
      const eventTypeSelect = [`<option value="">全部事件</option>`]
        .concat(eventTypeOptions.map((value) => `<option value="${esc(value)}" ${state.filters.eventType === value ? 'selected' : ''}>${esc(value)}</option>`))
        .join('');
      const totalLabel = `共 ${state.summary.total || 0} 筆`;
      const pager = renderAuditTrailPager(state.page);
      pageHtml = `<div class="animate-in"><div class="page-header review-page-header"><div><h1 class="page-title">操作軌跡</h1><p class="page-subtitle">${esc(totalLabel)}，保留期限 ≥ 6 個月（符合附表十）</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshAuditTrail">${ic('refresh-cw', 'icon-sm')} 重新整理</button><button type="button" class="btn btn-secondary" data-action="admin.exportAuditTrail">${ic('download', 'icon-sm')} 匯出</button></div></div><div class="card review-table-card"><form id="audit-filter-form"><div class="review-filter-grid" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:0 0 16px"><div class="form-group" style="flex:1;min-width:180px"><label class="form-label">關鍵字</label><input type="text" class="form-input" id="audit-keyword" value="${esc(state.filters.keyword)}" placeholder="事件、帳號、單位"></div><div class="form-group" style="min-width:160px"><label class="form-label">事件類型</label><select class="form-select" id="audit-event-type">${eventTypeSelect}</select></div><div class="form-group" style="min-width:140px"><label class="form-label">開始日期</label><input type="date" class="form-input" id="audit-occurred-from" value="${esc(state.filters.occurredFrom)}"></div><div class="form-group" style="min-width:140px"><label class="form-label">結束日期</label><input type="date" class="form-input" id="audit-occurred-to" value="${esc(state.filters.occurredTo)}"></div><div style="display:flex;gap:8px"><button type="submit" class="btn btn-primary">${ic('search', 'icon-sm')} 套用篩選</button><button type="button" class="btn btn-secondary" data-action="admin.resetAuditTrailFilters">${ic('rotate-ccw', 'icon-sm')} 清空條件</button></div></div></form>${pager}${buildReviewTableShell('audit-trail-table', '<th>時間</th><th>事件類型</th><th>操作人</th><th>對象</th><th>摘要</th>', '', { wrapperId: 'audit-trail-table-wrap', wrapperClass: 'audit-trail-table-wrap', tbodyId: 'audit-trail-table-body' })}</div></div>`;
      auditTrailMarkupCache = {
        signature: renderSignature,
        html: pageHtml
      };
    }

    app.innerHTML = pageHtml;
    auditTrailRenderCache = {
      signature: renderSignature,
      filterSignature
    };
    if (app) {
      app.dataset.auditTrailRenderSignature = renderSignature;
    }
    auditTrailTableViewport = document.getElementById('audit-trail-table-wrap');
    renderAuditTrailRows(Array.isArray(state.items) ? state.items : []);
    if (typeof releaseAuditTrailVirtualScroll === 'function') {
      releaseAuditTrailVirtualScroll();
      releaseAuditTrailVirtualScroll = null;
    }
    if (typeof releaseAuditTrailVirtualResize === 'function') {
      releaseAuditTrailVirtualResize();
      releaseAuditTrailVirtualResize = null;
    }
    if (auditTrailTableViewport) {
      releaseAuditTrailVirtualScroll = bindAdminPageEvent(auditTrailTableViewport, 'scroll', scheduleAuditTrailRowsRender, { passive: true });
      releaseAuditTrailVirtualResize = bindAdminPageEvent(window, 'resize', scheduleAuditTrailRowsRender);
    }
    registerAdminPageCleanup(function () {
      if (typeof releaseAuditTrailVirtualScroll === 'function') {
        releaseAuditTrailVirtualScroll();
      }
      if (typeof releaseAuditTrailVirtualResize === 'function') {
        releaseAuditTrailVirtualResize();
      }
      releaseAuditTrailVirtualScroll = null;
      releaseAuditTrailVirtualResize = null;
      auditTrailTableViewport = null;
      auditTrailVirtualRowsRenderPending = false;
    });
    const form = document.getElementById('audit-filter-form');
    if (form) {
      bindAdminPageEvent(form, 'submit', function (event) {
        event.preventDefault();
        renderAuditTrail(getAuditTrailFiltersFromDom());
      });
    }
    bindAdminCollectionPager({
      idPrefix: 'audit',
      page: state.page,
      defaultLimit: 50,
      limitOptions: ['50', '100', '200'],
      getOffsetByPageNumber: getAuditTrailOffsetByPageNumber,
      onChange: function (delta) {
        const safePage = normalizeAuditTrailPage(auditTrailState.page, auditTrailState.filters, auditTrailState.items);
        renderAuditTrail({
          ...auditTrailState.filters,
          limit: String((delta && delta.limit) || safePage.limit || 50),
          offset: String((delta && delta.offset) || 0)
        });
      }
    });
    const renderedSummarySignature = serializeAuditTrailSummary(state.summary);
    const cachedSummary = readAuditTrailSummary(resolvedFilters, !!(nextFilters && nextFilters.forceRemoteSummary));
    if (cachedSummary && serializeAuditTrailSummary(cachedSummary) !== renderedSummarySignature) {
      auditTrailState.summary = cachedSummary;
    }
    const shouldPrimeAuditTrailSummary = !!(nextFilters && nextFilters.forceRemoteSummary) || !cachedSummary;
    if (shouldPrimeAuditTrailSummary) {
      primeAuditTrailSummary(resolvedFilters, { force: !!(nextFilters && nextFilters.forceRemoteSummary) }).then((summary) => {
        if (!String(window.location.hash || '').startsWith('#audit-trail')) return;
        if (serializeAuditTrailSummary(summary) === renderedSummarySignature) return;
        renderAuditTrail({ ...resolvedFilters });
      }).catch((error) => {
        window.__ismsWarn('audit trail remote summary sync failed', error);
      });
    } else if (!cachedSummary) {
      queueAuditTrailSummaryBootstrap(resolvedFilters);
    }
    wireReviewTableScrollers(app);
    refreshIcons();
  }

  async function handleClearLoginLogs() {
    if (!canManageUsers()) {
      toast('僅最高管理員可清除登入紀錄', 'error');
      return;
    }
    const clearConfirmed = typeof openConfirmDialog === 'function'
      ? await openConfirmDialog('確定要清除所有登入紀錄嗎？', { title: '清除登入紀錄', confirmLabel: '清除', confirmClass: 'btn-danger', kicker: '警告' })
      : confirm('確定要清除所有登入紀錄嗎？');
    if (!clearConfirmed) return;
    clearLoginLogs();
    toast('登入紀錄已清除');
    renderLoginLog();
  }

  function renderLoginLog() {
    if (!canManageUsers()) {
      navigate('dashboard');
      toast('您沒有檢視登入紀錄的權限', 'error');
      return;
    }
    loginLogItems = (loadLoginLogs() || []).slice().reverse();
    const app = document.getElementById('app');
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">登入紀錄</div><h1 class="page-title">登入紀錄</h1><p class="page-subtitle">最近 200 筆帳號登入與失敗事件。</p></div><div class="review-header-actions"><button type="button" class="btn btn-danger" data-action="admin.clearLoginLogs">${ic('trash-2', 'icon-sm')} 清除紀錄</button></div></div><div class="card"><div class="table-wrapper login-log-table-wrap review-table-wrapper" id="login-log-table-wrap"><table class="review-data-table data-table"><caption class="sr-only">登入紀錄清單</caption><thead><tr><th scope="col">時間</th><th scope="col">帳號</th><th scope="col">姓名</th><th scope="col">角色</th><th scope="col">結果</th></tr></thead><tbody id="login-log-table-body"></tbody></table></div></div></div>`;
    if (typeof releaseLoginLogVirtualScroll === 'function') {
      releaseLoginLogVirtualScroll();
      releaseLoginLogVirtualScroll = null;
    }
    if (typeof releaseLoginLogVirtualResize === 'function') {
      releaseLoginLogVirtualResize();
      releaseLoginLogVirtualResize = null;
    }
    loginLogTableViewport = document.getElementById('login-log-table-wrap');
    renderLoginLogRows(loginLogItems);
    if (loginLogTableViewport) {
      releaseLoginLogVirtualScroll = bindAdminPageEvent(loginLogTableViewport, 'scroll', scheduleLoginLogRowsRender, { passive: true });
      releaseLoginLogVirtualResize = bindAdminPageEvent(window, 'resize', scheduleLoginLogRowsRender);
    }
    registerAdminPageCleanup(function () {
      if (typeof releaseLoginLogVirtualScroll === 'function') {
        releaseLoginLogVirtualScroll();
      }
      if (typeof releaseLoginLogVirtualResize === 'function') {
        releaseLoginLogVirtualResize();
      }
      releaseLoginLogVirtualScroll = null;
      releaseLoginLogVirtualResize = null;
      loginLogTableViewport = null;
      loginLogItems = [];
      loginLogVirtualRowsRenderPending = false;
    });
    wireReviewTableScrollers(app);
    refreshIcons();
  }

  function unitContactStatusBadge(item) {
    const status = String(item && item.status || '').trim();
    const meta = {
      pending_review: { tone: 'pending', label: '待審核' },
      returned: { tone: 'attention', label: '退回補件' },
      approved: { tone: 'approved', label: '已通過' },
      rejected: { tone: 'danger', label: '未核准' },
      activation_pending: { tone: 'approved', label: '待啟用' },
      active: { tone: 'live', label: '已啟用' }
    }[status] || { tone: 'pending', label: status || '未知' };
    const tone = String(item && item.statusTone || meta.tone || 'pending').trim() || 'pending';
    const label = String(item && item.statusLabel || meta.label || '未知').trim() || '未知';
    return `<span class="unit-contact-status-badge unit-contact-status-badge--${esc(tone)}">${esc(label)}</span>`;
  }

  function formatSchemaBytes(size) {
    const value = Number(size || 0);
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + ' MB';
    if (value >= 1024) return (value / 1024).toFixed(1) + ' KB';
    return value + ' B';
  }

  function schemaStatusClass(status) {
    if (status === 'healthy') return 'approved';
    if (status === 'attention') return 'pending';
    return status;
  }

  function schemaStatusBadge(store) {
    return `<span class="review-status-badge ${schemaStatusClass(store.status)}">${esc(store.statusLabel)}</span>`;
  }

  function renderSchemaHealthIssueList(stores) {
    const issues = stores.filter((store) => store.status !== 'healthy');
    if (!issues.length) {
      return `<div class="empty-state empty-state--pad-32-20"><div class="empty-state-title">目前沒有待處理的 schema 問題</div><div class="empty-state-desc">所有受管 store 都已使用最新 envelope 與版本格式。</div></div>`;
    }
    return issues.map((store) => {
      const detail = store.parseError
        ? store.parseError
        : (store.migrationNeeded
          ? `目前版本 ${store.storedVersion === null ? '未知' : store.storedVersion}，預期版本 ${store.expectedVersion}`
          : '尚未建立資料，系統將在首次寫入時補齊');
      return `<div class="review-history-item"><div class="review-history-top"><span class="review-history-badge ${store.status === 'error' ? 'schema-error' : (store.status === 'missing' ? 'schema-missing' : 'merged')}">${esc(store.statusLabel)}</span><span class="review-history-time">${esc(store.key)}</span></div><div class="review-history-title">${esc(store.label)}</div><div class="review-history-meta">${esc(detail)}</div></div>`;
    }).join('');
  }

  function renderAttachmentHealthPanel(attachmentHealth) {
    const orphanText = attachmentHealth.orphanAttachments
      ? `${attachmentHealth.orphanAttachments} 筆孤兒附件，約 ${formatSchemaBytes(attachmentHealth.orphanBytes)}`
      : '目前沒有孤兒附件';
    const orphanList = attachmentHealth.orphaned.length
      ? attachmentHealth.orphaned.slice(0, 8).map((record) => `<div class="review-history-item"><div class="review-history-top"><span class="review-history-badge pending">孤兒附件</span><span class="review-history-time">${esc(record.scope || '未分類')}</span></div><div class="review-history-title">${esc(record.name || record.attachmentId)}</div><div class="review-history-meta">${esc(record.ownerId || '未綁定紀錄')} · ${formatSchemaBytes(record.size)}</div></div>`).join('')
      : `<div class="empty-state empty-state--pad-24-18"><div class="empty-state-title">附件引用正常</div><div class="empty-state-desc">所有 IndexedDB 附件都還有對應的單據引用。</div></div>`;
    return `<div class="card review-history-card"><div class="card-header"><span class="card-title">附件資料庫</span><span class="review-card-subtitle">${esc(attachmentHealth.database)}</span></div><div class="review-history-list"><div class="review-callout compact"><span class="review-callout-icon">${ic('paperclip', 'icon-sm')}</span><div>共 ${attachmentHealth.totalAttachments} 筆附件，已引用 ${attachmentHealth.referencedAttachments} 筆，${orphanText}。</div></div>${orphanList}</div></div>`;
  }

  async function renderSchemaHealth() {
    if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可檢視資料健康資訊', 'error'); return; }
    const health = getSchemaHealth();
    const attachmentHealth = await getAttachmentHealth();
    const attentionCount = health.totals.attention + health.totals.error + health.totals.missing;
    const rows = health.stores.map((store) => `<tr><td><div class="review-unit-name">${esc(store.label)}</div><div class="review-card-subtitle review-card-subtitle--top-4">${esc(store.key)}</div></td><td>${schemaStatusBadge(store)}</td><td>v${store.storedVersion === null ? '—' : store.storedVersion} / v${store.expectedVersion}</td><td>${store.hasEnvelope ? 'Versioned envelope' : (store.exists ? 'Legacy raw JSON' : 'Not created')}</td><td>${esc(store.summary)}</td><td>${store.recordCount}</td><td>${formatSchemaBytes(store.rawSize)}</td></tr>`).join('');
    const app = document.getElementById('app');
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">Schema Diagnostics</div><h1 class="page-title">資料健康檢查</h1><p class="page-subtitle">檢查各個 localStorage store 的 schema version、envelope 格式、資料筆數與 migration 狀態，並補上支援包與附件資料庫診斷。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshSchemaHealth">${ic('refresh-cw', 'icon-sm')} 重新檢查</button><button type="button" class="btn btn-secondary" data-action="admin.exportSupportBundle">${ic('download', 'icon-sm')} 匯出支援包</button><button type="button" class="btn btn-secondary" data-action="admin.pruneOrphanAttachments">${ic('trash-2', 'icon-sm')} 清除孤兒附件</button><button type="button" class="btn btn-primary" data-action="admin.repairSchemaHealth">${ic('database', 'icon-sm')} 重跑 migration repair</button></div></div><div class="review-callout"><span class="review-callout-icon">${ic('shield-check', 'icon-sm')}</span><div>本頁只提供診斷與安全補寫，不會刪除表單資料。最近檢查時間：<strong>${esc(fmtTime(health.generatedAt))}</strong></div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('database')}</div><div class="stat-value">${health.totals.totalStores}</div><div class="stat-label">受管 Store</div></div><div class="stat-card closed"><div class="stat-icon">${ic('badge-check')}</div><div class="stat-value">${health.totals.healthy}</div><div class="stat-label">狀態正常</div></div><div class="stat-card pending"><div class="stat-icon">${ic('alert-triangle')}</div><div class="stat-value">${attentionCount}</div><div class="stat-label">待處理</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('paperclip')}</div><div class="stat-value">${attachmentHealth.totalAttachments}</div><div class="stat-label">附件總數</div></div></div><div class="review-grid"><div class="card review-table-card"><div class="card-header"><span class="card-title">Store 狀態明細</span><span class="review-card-subtitle">版本、格式與資料量一覽</span></div>${buildReviewTableShell('schema-health-table', '<th>Store</th><th>狀態</th><th>版本</th><th>格式</th><th>內容摘要</th><th>筆數</th><th>容量</th>', rows, { toolbarSubtitle: '欄位較多時可直接拖曳左右平移，也可用右側按鈕快速查看後段欄位。' })}</div><div class="card review-history-card"><div class="card-header"><span class="card-title">待處理項目</span><span class="review-card-subtitle">優先處理格式損毀、待升級資料與孤兒附件</span></div><div class="review-history-list">${renderSchemaHealthIssueList(health.stores)}</div></div>${renderAttachmentHealthPanel(attachmentHealth)}</div></div>`;
    wireReviewTableScrollers(app);
    refreshIcons();
  }

  function handleRepairSchemaHealth() {
    if (!isAdmin()) return;
    migrateAllStores();
    toast('已重新執行 schema migration repair');
    renderSchemaHealth();
  }
  registerActionHandlers('admin', {
    addUser: function () {
      showUserModal(null);
    },
    refreshUsers: function () {
      renderUsers({ filters: { ...systemUsersState.filters }, forceRemote: true });
    },
    applyUserFilters: function () {
      renderUsers({ filters: getSystemUsersFiltersFromDom(), forceRemote: true });
    },
    resetUserFilters: function () {
      renderUsers({ filters: { ...DEFAULT_SYSTEM_USERS_FILTERS }, forceRemote: true });
    },
    editUser: function ({ dataset }) {
      const visibleUsersCache = renderUsers._remoteViewCache || { items: [] };
      const user = findUser(dataset.username)
        || (Array.isArray(visibleUsersCache.items) ? visibleUsersCache.items.find((item) => String(item && item.username || '').trim() === String(dataset.username || '').trim()) : null);
      showUserModal(user || null);
    },
    deleteUser: function ({ dataset }) {
      handleDeleteUser(dataset.username);
    },
    refreshUnitReview: function () {
      renderUnitReview();
    },
    viewUnitRefs: function ({ dataset }) {
      showUnitReferenceModal(decodeURIComponent(dataset.unit));
    },
    approveUnit: function ({ dataset }) {
      handleApproveUnit(dataset.unit);
    },
    mergeUnit: function ({ dataset }) {
      showUnitMergeModal(decodeURIComponent(dataset.unit));
    },
    clearLoginLogs: function () {
      handleClearLoginLogs();
    },
    refreshAuditTrail: function () {
      renderAuditTrail(auditTrailState.filters);
    },
    refreshSecurityWindow: function () {
      handleRefreshSecurityWindow();
    },
    applySecurityWindowFilters: function () {
      handleApplySecurityWindowFilters();
    },
    resetSecurityWindowFilters: function () {
      handleResetSecurityWindowFilters();
    },
    exportSecurityWindow: function () {
      handleExportSecurityWindow();
    },
    refreshUnitContactReview: function () {
      renderUnitContactReview(unitContactReviewState.filters, { forceRemote: true });
    },
    applyUnitContactFilters: function () {
      renderUnitContactReview(getUnitContactReviewFiltersFromDom(), { forceRemote: true });
    },
    resetUnitContactFilters: function () {
      renderUnitContactReview({ ...DEFAULT_UNIT_CONTACT_REVIEW_FILTERS }, { forceRemote: true });
    },
    unitContactApprove: function ({ dataset }) {
      promptReviewComment('審核通過並啟用帳號', '確認後系統將自動建立帳號並寄送登入資訊給申請人，此操作無法復原。', '確認通過並啟用', async function (reviewComment) {
        try {
          const currentFilters = { ...unitContactReviewState.filters };
          const result = await reviewUnitContactApplication({
            id: dataset.id,
            status: 'approved',
            reviewComment
          });
          toast(result && result.delivery && result.delivery.sent ? '已通過、帳號已啟用並寄送登入資訊' : '已通過，帳號已直接啟用');
          dispatchAdminCacheInvalidationScopes(['unit-contact-review', 'audit-trail'], 'unit-contact-reviewed');
          renderUnitContactReview(currentFilters, { forceRemote: true });
        } catch (error) {
          toast(String(error && error.message || error || '審核失敗'), 'error');
        }
      });
    },
    unitContactReturn: function ({ dataset }) {
      promptReviewComment('退回補件通知', '申請人將收到退回通知信，請確認是否退回此申請。', '確認退回', async function (reviewComment) {
        try {
          const currentFilters = { ...unitContactReviewState.filters };
          const result = await reviewUnitContactApplication({
            id: dataset.id,
            status: 'returned',
            reviewComment
          });
          toast(result && result.delivery && result.delivery.sent ? '已退回並寄送通知' : '已退回補件');
          dispatchAdminCacheInvalidationScopes(['unit-contact-review', 'audit-trail'], 'unit-contact-reviewed');
          renderUnitContactReview(currentFilters, { forceRemote: true });
        } catch (error) {
          toast(String(error && error.message || error || '退回失敗'), 'error');
        }
      });
    },
    unitContactReject: function ({ dataset }) {
      promptReviewComment('不予核准', '申請人將收到未核准通知信，確認後此申請將標記為未核准。', '確認不予核准', async function (reviewComment) {
        try {
          const currentFilters = { ...unitContactReviewState.filters };
          const result = await reviewUnitContactApplication({
            id: dataset.id,
            status: 'rejected',
            reviewComment
          });
          toast(result && result.delivery && result.delivery.sent ? '已拒絕並寄送通知' : '已標記未核准');
          dispatchAdminCacheInvalidationScopes(['unit-contact-review', 'audit-trail'], 'unit-contact-reviewed');
          renderUnitContactReview(currentFilters, { forceRemote: true });
        } catch (error) {
          toast(String(error && error.message || error || '未核准操作失敗'), 'error');
        }
      });
    },
    unitContactResendActivation: function ({ dataset }) {
      promptActivationInfo(dataset.id, { mode: 'resend' });
    },
    unitContactViewAuthDoc: function ({ dataset }) {
      openUnitContactAuthorizationDocumentPreview(dataset.id, dataset.applicantEmail).catch((error) => {
        toast(String(error && error.message || error || '無法開啟授權同意書'), 'error');
      });
    },
    viewAuditEntry: function ({ dataset }) {
      showAuditEntryModal(dataset.index);
    },
    resetAuditTrailFilters: function () {
      renderAuditTrail({ ...DEFAULT_AUDIT_FILTERS });
    },
    exportAuditTrail: function () {
      Promise.resolve()
        .then(() => loadAuditTrailExportPayload(auditTrailState.filters))
        .then((payload) => {
          downloadJson('isms-audit-trail-' + new Date().toISOString().slice(0, 10) + '.json', payload);
          toast('已匯出操作稽核軌跡 JSON');
        })
        .catch((error) => {
          toast(String(error && error.message || error || '匯出失敗'), 'error');
        });
    },
    auditTrailPrevPage: function () {
      const page = normalizeAuditTrailPage(auditTrailState.page, auditTrailState.filters, auditTrailState.items);
      const nextOffset = Math.max(0, Number(page.prevOffset || 0) || 0);
      return renderAuditTrail({ ...auditTrailState.filters, offset: String(nextOffset) });
    },
    auditTrailFirstPage: function () {
      return renderAuditTrail({ ...auditTrailState.filters, offset: '0' });
    },
    auditTrailJumpPage: function () {
      const targetPage = document.getElementById('audit-page-number')?.value || '1';
      const safePage = normalizeAuditTrailPage(auditTrailState.page, auditTrailState.filters, auditTrailState.items);
      const nextOffset = getAuditTrailOffsetByPageNumber(safePage, targetPage);
      return renderAuditTrail({ ...auditTrailState.filters, offset: String(nextOffset) });
    },
    auditTrailNextPage: function () {
      const page = normalizeAuditTrailPage(auditTrailState.page, auditTrailState.filters, auditTrailState.items);
      const nextOffset = Math.max(0, Number(page.nextOffset || 0) || 0);
      return renderAuditTrail({ ...auditTrailState.filters, offset: String(nextOffset) });
    },
    auditTrailLastPage: function () {
      const page = normalizeAuditTrailPage(auditTrailState.page, auditTrailState.filters, auditTrailState.items);
      const meta = getAuditTrailPageActionMeta(page);
      const nextOffset = getAuditTrailOffsetByPageNumber(page, meta.pageCount || 1);
      return renderAuditTrail({ ...auditTrailState.filters, offset: String(nextOffset) });
    },
    refreshSchemaHealth: function () {
      renderSchemaHealth();
    },
    exportSupportBundle: function () {
      handleExportSupportBundle();
    },
    pruneOrphanAttachments: function () {
      handlePruneOrphanAttachments();
    },
    repairSchemaHealth: function () {
      handleRepairSchemaHealth();
    }
  });

  // ─── Checklist Data Model ─────────────────
  // ★ UPDATED: Added GCB (8.8), RDP control (8.9) to section 8; IoT control moved to section 9 (9.3)

    return {
      renderUsers,
      renderUnitContactReview,
      renderUnitReview,
      renderSecurityWindow,
      renderLoginLog,
      renderAuditTrail,
      renderSchemaHealth
    };
  };
})();
