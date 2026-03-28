(function () {
  window.createTrainingModule = function createTrainingModule(deps) {
    const {
      TRAINING_STATUSES,
      TRAINING_UNDO_WINDOW_MINUTES,
      TRAINING_EMPLOYEE_STATUS,
      TRAINING_GENERAL_LABEL,
      TRAINING_INFO_STAFF_LABEL,
      TRAINING_PROFESSIONAL_LABEL,
      TRAINING_BOOLEAN_SELECT_OPTIONS,
      ROLES,
      currentUser,
      canFillTraining,
      isAdmin,
      isUnitAdmin,
      getScopedUnit,
      getUsers,
      getAuthorizedUnits,
      getRoute,
      navigate,
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      toast,
      fmt,
      fmtTime,
      esc,
      ic,
      toTestIdFragment,
      bindCopyButtons,
      refreshIcons,
      renderCopyIdCell,
      renderCopyIdButton,
      hasUnitAccess,
      isViewer,
      buildUnitCascadeControl,
      initUnitCascade,
      trainingSelectOptionsHtml,
      getTrainingForm,
      getAllTrainingForms,
      getAllTrainingRosters,
      getStoreTouchToken,
      upsertTrainingForm,
      updateTrainingForm,
      addTrainingRosterPerson,
      updateTrainingRosterPerson,
      deleteTrainingRoster: deleteTrainingRosterPerson,
      generateTrainingFormId,
      findExistingTrainingFormForUnitYear,
      mergeTrainingRows,
      normalizeTrainingRosterRow,
      normalizeTrainingRecordRow,
      computeTrainingSummary,
      trainingStatusBadge,
      trainingDecisionBadge,
      getTrainingRecordHint,
      getTrainingProfessionalDisplay,
      getTrainingStatsUnit,
      getTrainingJobUnit,
      getTrainingUnits,
      isOfficialUnit,
      categorizeTopLevelUnit,
      isTrainingDashboardExcludedUnit,
      getTrainingUnitCategories,
      sortTrainingRosterEntries,
      syncTrainingFormsFromM365,
      syncTrainingRostersFromM365,
      submitTrainingDraft,
      submitTrainingStepOne,
      submitTrainingMarkPrinted,
      submitTrainingFinalize,
      submitTrainingReturn,
      submitTrainingUndo,
      submitTrainingRosterUpsert,
      submitTrainingRosterBatchUpsert,
      submitTrainingRosterDelete,
      submitTrainingRosterBatchDelete,
      getVisibleTrainingForms,
      isTrainingVisible,
      canEditTrainingForm,
      canUndoTrainingForm,
      getTrainingUndoRemainingMinutes,
      canDeleteTrainingEditableRow,
      isTrainingRecordReadyForSubmit,
      isTrainingRecordComplete,
      getStoredTrainingProfessionalValue,
      prepareUploadBatch,
      createTransientUploadEntry,
      revokeTransientUploadEntry,
      persistUploadedEntries,
      renderAttachmentList,
      cleanupRenderedAttachmentUrls,
      exportTrainingSummaryCsv,
      exportTrainingDetailCsv,
      printTrainingSheet,
      parseTrainingRosterWorkbook,
      parseTrainingRosterImport,
      loadTrainingStore,
      saveTrainingStore,
      registerActionHandlers,
      openConfirmDialog,
      openPromptDialog,
      runWithBusyState
    } = deps;

    let lastTrainingRosterFocusState = null;
    let trainingRosterFocusTrackerInstalled = false;
    let trainingRosterGroupingCache = { token: '', groups: null };
    let trainingRosterSnapshotCache = { token: '', rawLength: 0, rosters: null, hiddenCount: 0, summary: null };
    let trainingRosterRenderCache = createTrainingRenderCache({ selectedSignature: '', defer: false });
    let trainingRosterGroupMarkupCache = createTrainingMarkupCache();
    let trainingRosterPageShellCache = createTrainingMarkupCache();
    let trainingDashboardUnitsCache = { signature: '', units: [] };
    let trainingListViewCache = { signature: '', visibleForms: [], summary: null };
    let trainingRemoteListSummaryCache = createTrainingSummaryCache();
    let trainingRemoteListSummaryBootstrapState = { signature: '', timer: 0, attempt: 0 };
    let trainingAdminDashboardCache = { signature: '', statsUnits: [], latestByUnit: [], completedUnits: [], incompleteUnits: [] };
    const TRAINING_REMOTE_LIST_SUMMARY_TTL_MS = 15000;
    const TRAINING_REMOTE_LIST_SUMMARY_BOOTSTRAP_DELAYS = [80, 160, 320, 640];
    const TRAINING_ROSTER_PAGE_LIMIT_OPTIONS = ['100', '200', '500'];
    const TRAINING_ROSTER_DEFAULT_PAGE_LIMIT = '200';
    const TRAINING_ROSTER_REMOTE_PAGE_CACHE_MAX = 12;
    const trainingRosterRemotePageCache = new Map();
    let trainingRosterRemotePageState = createTrainingRemoteCollectionState({
      filters: { limit: TRAINING_ROSTER_DEFAULT_PAGE_LIMIT, offset: '0', q: '', source: '', unit: '', statsUnit: '' },
      limit: TRAINING_ROSTER_DEFAULT_PAGE_LIMIT
    });
    let trainingRosterDomCache = { signature: '', contentEl: null, rows: [], groupSelectAll: [], rowsByGroup: new Map(), selectedCountLabel: null, deleteSelectedButton: null };
      let trainingAccessProfileListenerInstalled = false;
      let trainingRowsStateVersion = 0;
      let trainingRowsFilterCache = { signature: '', rows: [] };
      const trainingManualRosterDraftCache = new Map();
      const TRAINING_MANUAL_ROSTER_DRAFT_STORAGE_KEY = '__TRAINING_MANUAL_ROSTER_DRAFTS__';
      function readTrainingManualRosterDraftStorage() {
        try {
          if (typeof window === 'undefined' || !window.sessionStorage) return [];
          const raw = window.sessionStorage.getItem(TRAINING_MANUAL_ROSTER_DRAFT_STORAGE_KEY);
          if (!raw) return [];
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      function writeTrainingManualRosterDraftStorage(rows) {
        try {
          if (typeof window === 'undefined' || !window.sessionStorage) return;
          window.sessionStorage.setItem(TRAINING_MANUAL_ROSTER_DRAFT_STORAGE_KEY, JSON.stringify(rows || []));
        } catch (_) { }
      }
      function syncTrainingManualRosterDraftStorage(nextRows) {
        const map = new Map();
        const merged = [].concat(
          Array.isArray(nextRows) ? nextRows : [],
          readTrainingManualRosterDraftStorage()
        ).filter((row) => row && typeof row === 'object');
        merged.forEach((row) => {
          const normalized = normalizeTrainingRecordRow(row, row && row.unit);
          if (row && row.manualDraft) normalized.manualDraft = true;
          const key = getTrainingManualRosterDraftKey(normalized);
          if (!key) return;
          map.set(key, normalized);
        });
        const rows = Array.from(map.values());
        writeTrainingManualRosterDraftStorage(rows);
        return rows;
      }
      function getTrainingManualRosterDraftKey(row) {
        const unit = String(row && row.unit || '').trim().toLowerCase();
        const rosterId = String(row && (row.rosterId || row.id) || '').trim().toUpperCase();
        const name = String(row && row.name || '').trim().toLowerCase();
        const identity = String(row && row.identity || '').trim().toLowerCase();
        const jobTitle = String(row && row.jobTitle || '').trim().toLowerCase();
        return [unit, rosterId || name, identity, jobTitle].filter(Boolean).join('::');
      }
      function rememberTrainingManualRosterRow(row) {
        if (!row || typeof row !== 'object') return null;
        const normalized = normalizeTrainingRecordRow(row, row.unit || document.getElementById('tr-unit')?.value || '');
        if (!normalized.name) return null;
        normalized.manualDraft = true;
        const primaryKey = getTrainingManualRosterDraftKey(normalized);
        if (!primaryKey) return normalized;
        trainingManualRosterDraftCache.set(primaryKey, normalized);
        const rosterId = String(normalized.rosterId || normalized.id || '').trim().toUpperCase();
        if (rosterId) trainingManualRosterDraftCache.set(`id:${rosterId}`, normalized);
        const aliasKey = `${String(normalized.unit || '').trim().toLowerCase()}::${String(normalized.name || '').trim().toLowerCase()}`;
        if (aliasKey.trim() !== '::') trainingManualRosterDraftCache.set(`name:${aliasKey}`, normalized);
        syncTrainingManualRosterDraftStorage([normalized]);
        return normalized;
      }
      function forgetTrainingManualRosterRow(rowOrId) {
        const raw = typeof rowOrId === 'object' && rowOrId ? rowOrId : { id: rowOrId };
        const rosterId = String(raw && (raw.rosterId || raw.id) || '').trim().toUpperCase();
        const name = String(raw && raw.name || '').trim().toLowerCase();
        const unit = String(raw && raw.unit || '').trim().toLowerCase();
        Array.from(trainingManualRosterDraftCache.keys()).forEach((key) => {
          const entry = trainingManualRosterDraftCache.get(key);
          const entryId = String(entry && (entry.rosterId || entry.id) || '').trim().toUpperCase();
          const entryName = String(entry && entry.name || '').trim().toLowerCase();
          const entryUnit = String(entry && entry.unit || '').trim().toLowerCase();
          if ((rosterId && (key === `id:${rosterId}` || entryId === rosterId))
            || (name && entryName === name && (!unit || entryUnit === unit))) {
            trainingManualRosterDraftCache.delete(key);
          }
        });
        const remaining = readTrainingManualRosterDraftStorage().filter((row) => {
          const normalized = normalizeTrainingRecordRow(row, row && row.unit);
          if (row && row.manualDraft) normalized.manualDraft = true;
          const entryId = String(normalized && (normalized.rosterId || normalized.id) || '').trim().toUpperCase();
          const entryName = String(normalized && normalized.name || '').trim().toLowerCase();
          const entryUnit = String(normalized && normalized.unit || '').trim().toLowerCase();
          return !((rosterId && entryId === rosterId) || (name && entryName === name && (!unit || entryUnit === unit)));
        });
        writeTrainingManualRosterDraftStorage(remaining);
      }
      function getRememberedTrainingRosterRows() {
        const rows = [];
        const seen = new Set();
        [].concat(readTrainingManualRosterDraftStorage(), Array.from(trainingManualRosterDraftCache.values())).forEach((row) => {
          if (!row || typeof row !== 'object') return;
          const normalized = normalizeTrainingRecordRow(row, row && row.unit);
          if (row.manualDraft) normalized.manualDraft = true;
          const key = getTrainingManualRosterDraftKey(normalized);
          if (!key || seen.has(key)) return;
          seen.add(key);
          rows.push(normalized);
        });
        return rows;
      }
      function syncTrainingManualRosterDraftCacheFromRows(rows) {
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          if (!row || typeof row !== 'object') return;
          const source = String(row.source || '').trim().toLowerCase();
          const rosterId = String(row.rosterId || row.id || '').trim().toUpperCase();
          if (source !== 'manual' && !rosterId.startsWith('TMP-') && row.manualDraft !== true) return;
          rememberTrainingManualRosterRow(row);
        });
      }
      function getTrainingManualRosterMatchKey(row) {
        if (!row || typeof row !== 'object') return '';
        const unit = String(row.unit || '').trim().toLowerCase();
        const name = String(row.name || '').trim().toLowerCase();
        const identity = String(row.identity || '').trim().toLowerCase();
        const jobTitle = String(row.jobTitle || '').trim().toLowerCase();
        return [unit, name, identity, jobTitle].filter(Boolean).join('::');
      }
      function pruneTrainingManualRosterDraftsAgainstRows(rows) {
        const currentRows = Array.isArray(rows) ? rows : [];
        getRememberedTrainingRosterRows().forEach((draftRow) => {
          const draftKey = getTrainingManualRosterMatchKey(draftRow);
          if (!draftKey) return;
          const hasCommittedMatch = currentRows.some((row) => {
            if (!row || typeof row !== 'object') return false;
            if (row.manualDraft === true) return false;
            const rosterId = String(row.rosterId || row.id || '').trim().toUpperCase();
            if (rosterId.startsWith('TMP-')) return false;
            return getTrainingManualRosterMatchKey(row) === draftKey;
          });
          if (hasCommittedMatch) {
            forgetTrainingManualRosterRow(draftRow);
          }
        });
      }
    function scheduleDeferredPromise(taskFactory, timeoutMs) {
      const delay = Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : 250;
      return new Promise((resolve) => {
        const run = function () {
          try {
            resolve(Promise.resolve(typeof taskFactory === 'function' ? taskFactory() : null));
          } catch (error) {
            console.warn('deferred task failed to start', error);
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

    function recordTrainingBootstrapStep(step, detail) {
      if (typeof window === 'undefined' || !window.__ISMS_BOOTSTRAP__ || typeof window.__ISMS_BOOTSTRAP__.record !== 'function') return;
      window.__ISMS_BOOTSTRAP__.record(step, detail);
    }
    function getTrainingCacheInvalidationModule() {
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
    function getTrainingCollectionCacheModule() {
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
    function createTrainingCollectionPage(limit) {
      const moduleApi = getTrainingCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createPage === 'function') return moduleApi.createPage(limit);
      const safeLimit = Math.max(1, Number(limit) || 200);
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
    function createTrainingRemoteCollectionState(options) {
      const moduleApi = getTrainingCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createRemoteCollectionState === 'function') return moduleApi.createRemoteCollectionState(options);
      const settings = options && typeof options === 'object' ? options : {};
      return {
        filters: { ...(settings.filters || {}) },
        items: Array.isArray(settings.items) ? settings.items.slice() : [],
        summary: { ...(settings.summary || {}) },
        page: createTrainingCollectionPage(settings.limit),
        total: Math.max(0, Number(settings.total) || 0),
        signature: String(settings.signature || ''),
        ...(settings.extra && typeof settings.extra === 'object' ? settings.extra : {})
      };
    }
    function createTrainingSummaryCache(extra) {
      const moduleApi = getTrainingCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createSummaryCache === 'function') return moduleApi.createSummaryCache(extra);
      return { signature: '', summary: null, fetchedAt: 0, promise: null, ...(extra && typeof extra === 'object' ? extra : {}) };
    }
    function createTrainingRenderCache(extra) {
      const moduleApi = getTrainingCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createRenderCache === 'function') return moduleApi.createRenderCache(extra);
      return { signature: '', ...(extra && typeof extra === 'object' ? extra : {}) };
    }
    function createTrainingMarkupCache(extra) {
      const moduleApi = getTrainingCollectionCacheModule();
      if (moduleApi && typeof moduleApi.createMarkupCache === 'function') return moduleApi.createMarkupCache(extra);
      return { signature: '', html: '', ...(extra && typeof extra === 'object' ? extra : {}) };
    }
    function resetTrainingRenderCaches() {
      const moduleApi = getTrainingCollectionCacheModule();
      if (moduleApi && typeof moduleApi.resetRenderCaches === 'function') {
        return moduleApi.resetRenderCaches.apply(null, arguments);
      }
      Array.from(arguments).forEach((cache) => {
        if (!cache || typeof cache !== 'object') return;
        cache.signature = '';
        if (Object.prototype.hasOwnProperty.call(cache, 'html')) cache.html = '';
        if (Object.prototype.hasOwnProperty.call(cache, 'selectedSignature')) cache.selectedSignature = '';
        if (Object.prototype.hasOwnProperty.call(cache, 'defer')) cache.defer = false;
      });
    }
    function resetTrainingRemoteCaches(reason) {
      const safeReason = String(reason || 'profile-changed').trim() || 'profile-changed';
      clearTrainingRosterRemotePageCache();
      trainingRosterRemotePageState = createTrainingRemoteCollectionState({
        filters: { limit: TRAINING_ROSTER_DEFAULT_PAGE_LIMIT, offset: '0', q: '', source: '', unit: '', statsUnit: '' },
        limit: TRAINING_ROSTER_DEFAULT_PAGE_LIMIT
      });
      trainingRemoteListSummaryCache = createTrainingSummaryCache();
      resetTrainingRemoteListSummaryBootstrapState();
      trainingRosterGroupingCache = { token: '', groups: null };
      trainingRosterSnapshotCache = { token: '', rawLength: 0, rosters: null, hiddenCount: 0, summary: null };
      trainingRosterRenderCache = createTrainingRenderCache({ selectedSignature: '', defer: false });
      trainingRosterGroupMarkupCache = createTrainingMarkupCache();
      trainingRosterPageShellCache = createTrainingMarkupCache();
      trainingDashboardUnitsCache = { signature: '', units: [] };
      trainingListViewCache = { signature: '', visibleForms: [], summary: null };
      trainingAdminDashboardCache = { signature: '', statsUnits: [], latestByUnit: [], completedUnits: [], incompleteUnits: [] };
      trainingRosterDomCache = { signature: '', contentEl: null, rows: [], groupSelectAll: [], rowsByGroup: new Map(), selectedCountLabel: null, deleteSelectedButton: null };
      trainingRowsFilterCache = { signature: '', rows: [] };
      lastTrainingRosterFocusState = null;
      trainingManualRosterDraftCache.clear();
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem(TRAINING_MANUAL_ROSTER_DRAFT_STORAGE_KEY);
        }
      } catch (_) {
        // Ignore draft storage cleanup failures.
      }
      resetTrainingRenderCaches(trainingRosterRenderCache, trainingRosterGroupMarkupCache, trainingRosterPageShellCache);
      recordTrainingBootstrapStep('training-cache-reset', safeReason);
    }

    function installTrainingAccessProfileListener() {
      if (trainingAccessProfileListenerInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      window.addEventListener('isms:access-profile-changed', function (event) {
        const detail = event && event.detail ? event.detail : {};
        resetTrainingRemoteCaches(detail.reason || 'profile-changed');
      });
      window.addEventListener('isms:cache-invalidate', function (event) {
        const detail = event && event.detail ? event.detail : {};
        const moduleApi = getTrainingCacheInvalidationModule();
        const scope = moduleApi && typeof moduleApi.normalizeScope === 'function'
          ? moduleApi.normalizeScope(detail.scope, '')
          : String(detail.scope || '').trim().toLowerCase();
        const acceptedScopes = ['all', 'access-profile', 'training'];
        const shouldReset = moduleApi && typeof moduleApi.matchesScope === 'function'
          ? moduleApi.matchesScope(scope, acceptedScopes)
          : (!scope || acceptedScopes.includes(scope));
        if (shouldReset) {
          resetTrainingRemoteCaches(detail.reason || 'cache-invalidated');
        }
      });
      trainingAccessProfileListenerInstalled = true;
    }

    function getTrainingRemoteClient() {
      installTrainingAccessProfileListener();
      if (typeof window === 'undefined') return null;
      if (window._m365ApiClient && typeof window._m365ApiClient === 'object') return window._m365ApiClient;
      try {
        if (window.__ISMS_BOOTSTRAP__ && typeof window.__ISMS_BOOTSTRAP__.resolveM365ApiClient === 'function') {
          const client = window.__ISMS_BOOTSTRAP__.resolveM365ApiClient();
          if (client && typeof client === 'object') {
            recordTrainingBootstrapStep('training-client-hydrated', 'bootstrap-resolver');
            return client;
          }
        }
      } catch (error) {
        recordTrainingBootstrapStep('training-client-hydrate-failed', String(error && error.message || error || 'unknown'));
      }
      try {
        if (typeof window.getM365ApiClient === 'function') {
          const client = window.getM365ApiClient();
          if (client && typeof client === 'object') {
            recordTrainingBootstrapStep('training-client-hydrated', 'window-getter');
            return client;
          }
        }
      } catch (error) {
        recordTrainingBootstrapStep('training-client-hydrate-failed', String(error && error.message || error || 'unknown'));
      }
      return null;
    }

    function canUseRemoteTrainingRosterPaging() {
      const client = getTrainingRemoteClient();
      return !!(client
        && typeof client.getTrainingMode === 'function'
        && client.getTrainingMode() === 'm365-api'
        && typeof client.listTrainingRosters === 'function');
    }

    function normalizeTrainingRosterPageKeyword(value) {
      return String(value || '').trim().slice(0, 100);
    }

    function normalizeTrainingRosterPageSource(value) {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized === 'import' || normalized === 'manual' ? normalized : '';
    }

    function normalizeTrainingRosterPageFilters(filters) {
      const source = filters && typeof filters === 'object' ? filters : {};
      const limit = Math.max(1, Math.min(Number(source.limit || TRAINING_ROSTER_DEFAULT_PAGE_LIMIT) || Number(TRAINING_ROSTER_DEFAULT_PAGE_LIMIT), 500));
      const offset = Math.max(0, Number(source.offset || 0) || 0);
      return {
        limit: String(limit),
        offset: String(offset),
        q: normalizeTrainingRosterPageKeyword(source.q || source.keyword || ''),
        source: normalizeTrainingRosterPageSource(source.source || ''),
        unit: String(source.unit || '').trim(),
        statsUnit: String(source.statsUnit || '').trim()
      };
    }

    function getTrainingRosterRemoteSignature(filters) {
      const normalized = normalizeTrainingRosterPageFilters(filters);
      return [normalized.limit, normalized.offset, normalized.q, normalized.source, normalized.unit, normalized.statsUnit].join('::');
    }

    function normalizeTrainingRosterRemotePage(page, filters, items, total) {
      const normalizedFilters = normalizeTrainingRosterPageFilters(filters);
      const limit = Math.max(1, Number(normalizedFilters.limit || TRAINING_ROSTER_DEFAULT_PAGE_LIMIT) || Number(TRAINING_ROSTER_DEFAULT_PAGE_LIMIT));
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

    function getTrainingRosterPageSummary(page) {
      const normalizedPage = normalizeTrainingRosterRemotePage(page, trainingRosterRemotePageState.filters, trainingRosterRemotePageState.items, trainingRosterRemotePageState.total);
      if (!normalizedPage.total) return '\u76ee\u524d\u6c92\u6709\u540d\u55ae\u8cc7\u6599';
      return '\u7b2c ' + normalizedPage.currentPage + ' / ' + normalizedPage.pageCount + ' \u9801\uff0c\u986f\u793a '
        + normalizedPage.pageStart + '-' + normalizedPage.pageEnd + ' / ' + normalizedPage.total + ' \u7b46';
    }

    function getTrainingPagerModule() {
      return typeof window !== 'undefined' && window.__ISMS_PAGER__ && typeof window.__ISMS_PAGER__ === 'object'
        ? window.__ISMS_PAGER__
        : null;
    }

    function getTrainingRosterOffsetByPageNumber(page, targetPage) {
      const pager = getTrainingPagerModule();
      if (pager && typeof pager.getOffsetByPageNumber === 'function') {
        return pager.getOffsetByPageNumber(page, targetPage, TRAINING_ROSTER_DEFAULT_PAGE_LIMIT);
      }
      const normalizedPage = normalizeTrainingRosterRemotePage(page, trainingRosterRemotePageState.filters, trainingRosterRemotePageState.items, trainingRosterRemotePageState.total);
      if (!normalizedPage.total) return 0;
      const pageCount = normalizedPage.pageCount || 1;
      const parsed = Number.parseInt(targetPage, 10);
      const safePage = Math.min(pageCount, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
      return (safePage - 1) * normalizedPage.limit;
    }

    function renderTrainingRosterPager(page) {
      const normalizedPage = normalizeTrainingRosterRemotePage(page, trainingRosterRemotePageState.filters, trainingRosterRemotePageState.items, trainingRosterRemotePageState.total);
      const pager = getTrainingPagerModule();
      const normalizedFilters = normalizeTrainingRosterPageFilters(trainingRosterRemotePageState.filters);
      const statsUnitOptions = ['']
        .concat(getTrainingDashboardUnits())
        .map((value) => '<option value="' + esc(value) + '" ' + (normalizedFilters.statsUnit === value ? 'selected' : '') + '>' + esc(value || '全部統計單位') + '</option>')
        .join('');
      const unitOptions = ['']
        .concat(getTrainingUnits()
          .filter((unit) => {
            const cleanUnit = String(unit || '').trim();
            if (!cleanUnit) return false;
            if (!normalizedFilters.statsUnit) return true;
            return String(getTrainingStatsUnit(cleanUnit) || '').trim() === normalizedFilters.statsUnit;
          })
          .sort(compareZhStroke))
        .map((value) => '<option value="' + esc(value) + '" ' + (normalizedFilters.unit === value ? 'selected' : '') + '>' + esc(value || '全部填報單位') + '</option>')
        .join('');
      const sourceOptions = [
        ['', '全部來源'],
        ['import', '管理者匯入'],
        ['manual', '填報新增']
      ].map(([value, label]) => '<option value="' + esc(value) + '" ' + (normalizedFilters.source === value ? 'selected' : '') + '>' + esc(label) + '</option>').join('');
      const activeFilters = [];
      if (normalizedFilters.q) activeFilters.push('關鍵字：' + normalizedFilters.q);
      if (normalizedFilters.source === 'import') activeFilters.push('來源：管理者匯入');
      if (normalizedFilters.source === 'manual') activeFilters.push('來源：填報新增');
      if (normalizedFilters.statsUnit) activeFilters.push('統計單位：' + normalizedFilters.statsUnit);
      if (normalizedFilters.unit) activeFilters.push('填報單位：' + normalizedFilters.unit);
      const extraActionsHtml = ''
        + '<input type="search" class="form-input" id="training-roster-keyword" placeholder="搜尋姓名、本職單位、身分別、職稱" value="' + esc(normalizedFilters.q || '') + '" style="min-width:260px">'
        + '<select class="form-select" id="training-roster-stats-unit" style="min-width:180px">' + statsUnitOptions + '</select>'
        + '<select class="form-select" id="training-roster-unit" style="min-width:220px">' + unitOptions + '</select>'
        + '<select class="form-select" id="training-roster-source" style="min-width:132px">' + sourceOptions + '</select>';
      if (pager && typeof pager.renderPagerToolbar === 'function') {
        return pager.renderPagerToolbar({
          page: normalizedPage,
          idPrefix: 'training-roster',
          limitOptions: TRAINING_ROSTER_PAGE_LIMIT_OPTIONS,
          defaultLimit: TRAINING_ROSTER_DEFAULT_PAGE_LIMIT,
          esc,
          ic,
          toolbarClass: 'review-toolbar review-toolbar--compact training-roster-pager',
          toolbarStyle: 'margin:14px 0 16px',
          summary: getTrainingRosterPageSummary(normalizedPage),
          mainHtml: '<span class="review-card-subtitle">' + esc(getTrainingRosterPageSummary(normalizedPage)) + '</span>'
            + (activeFilters.length ? '<div class="form-hint" style="margin-top:4px">目前篩選：' + esc(activeFilters.join('｜')) + '</div>' : ''),
          extraActionsHtml
        });
      }
      const pagerControls = pager && typeof pager.renderPagerControls === 'function'
        ? pager.renderPagerControls({
            page: normalizedPage,
            idPrefix: 'training-roster',
            limitOptions: TRAINING_ROSTER_PAGE_LIMIT_OPTIONS,
            defaultLimit: TRAINING_ROSTER_DEFAULT_PAGE_LIMIT,
            esc,
            ic
          })
        : '';
      return '<div class="review-toolbar review-toolbar--compact training-roster-pager" style="margin:14px 0 16px">'
        + '<div class="review-toolbar-main">'
        + '<span class="review-card-subtitle">' + esc(getTrainingRosterPageSummary(normalizedPage)) + '</span>'
        + (activeFilters.length ? '<div class="form-hint" style="margin-top:4px">目前篩選：' + esc(activeFilters.join('｜')) + '</div>' : '')
        + '</div>'
        + '<div class="review-toolbar-actions">'
        + extraActionsHtml
        + pagerControls
        + '</div></div>';
    }
    function clearTrainingRosterRemotePageCache() {
      trainingRosterRemotePageCache.clear();
    }

    async function loadTrainingRosterRemotePage(filters, options) {
      const client = getTrainingRemoteClient();
      if (!client || typeof client.listTrainingRosters !== 'function') {
        return {
          filters: normalizeTrainingRosterPageFilters(filters),
          items: [],
          total: 0,
          page: normalizeTrainingRosterRemotePage(null, filters, [], 0),
          raw: null
        };
      }
      const resolvedFilters = normalizeTrainingRosterPageFilters(filters);
      const signature = getTrainingRosterRemoteSignature(resolvedFilters);
      if (!(options && options.force) && trainingRosterRemotePageCache.has(signature)) {
        return trainingRosterRemotePageCache.get(signature);
      }
      const response = await client.listTrainingRosters(resolvedFilters);
      const items = Array.isArray(response && response.items) ? response.items : [];
      const total = Math.max(0, Number(response && response.total) || items.length);
      const value = {
        filters: resolvedFilters,
        items,
        total,
        page: normalizeTrainingRosterRemotePage(response && response.page, resolvedFilters, items, total),
        raw: response
      };
      trainingRosterRemotePageCache.set(signature, value);
      while (trainingRosterRemotePageCache.size > TRAINING_ROSTER_REMOTE_PAGE_CACHE_MAX) {
        const oldestKey = trainingRosterRemotePageCache.keys().next().value;
        if (!oldestKey) break;
        trainingRosterRemotePageCache.delete(oldestKey);
      }
      return value;
    }

    function getTrainingUserSignature(user) {
      const input = getTrainingAccessProfile(user) || {};
      return [
        String(input.username || '').trim().toLowerCase(),
        String(input.role || '').trim(),
        String(input.activeUnit || '').trim(),
        String(input.primaryUnit || input.unit || '').trim(),
        String(input.sessionToken || '').trim()
      ].join('::');
    }

    function normalizeTrainingUnitList(units) {
      const source = Array.isArray(units) ? units : [];
      return Array.from(new Set(source.map((unit) => String(unit || '').trim()).filter(Boolean)));
    }

    function getTrainingAccessProfile(user) {
      const base = user || currentUser();
      if (!base) return null;
      const authorizedUnits = normalizeTrainingUnitList(
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

    function normalizeTrainingListCounts(summary) {
      const source = summary && typeof summary === 'object' ? summary : {};
      return {
        total: Math.max(0, Number(source.total) || 0),
        draft: Math.max(0, Number(source.draft) || 0),
        pending: Math.max(0, Number(source.pending) || 0),
        submitted: Math.max(0, Number(source.submitted) || 0),
        returned: Math.max(0, Number(source.returned) || 0)
      };
    }

    function serializeTrainingListCounts(summary) {
      const normalized = normalizeTrainingListCounts(summary);
      return [
        normalized.total,
        normalized.draft,
        normalized.pending,
        normalized.submitted,
        normalized.returned
      ].join('|');
    }

    function getTrainingRemoteListSummarySignature(user) {
      const profile = getTrainingAccessProfile(user) || {};
      return [
        getTrainingUserSignature(profile),
        normalizeTrainingUnitList(profile.authorizedUnits).join('|')
      ].join('::');
    }

    function getTrainingRemoteListSummaryClient() {
      const client = getTrainingRemoteClient();
      if (!client || (typeof client.getTrainingFormsSummary !== 'function' && typeof client.listTrainingForms !== 'function')) return null;
      if (typeof client.getTrainingMode === 'function') {
        const mode = String(client.getTrainingMode() || '').trim();
        if (mode && mode !== 'm365-api') return null;
      }
      return client;
    }

    function resetTrainingRemoteListSummaryBootstrapState() {
      const timer = Number(trainingRemoteListSummaryBootstrapState.timer || 0);
      if (timer && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
        try { window.clearTimeout(timer); } catch (_) { }
      }
      trainingRemoteListSummaryBootstrapState = { signature: '', timer: 0, attempt: 0 };
    }

    function queueTrainingRemoteListSummaryBootstrap(user) {
      if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return;
      const signature = getTrainingRemoteListSummarySignature(user);
      if (!signature) return;
      if (readTrainingRemoteListSummary(user, false)) {
        if (trainingRemoteListSummaryBootstrapState.signature === signature) resetTrainingRemoteListSummaryBootstrapState();
        return;
      }
      if (trainingRemoteListSummaryCache.signature === signature && trainingRemoteListSummaryCache.promise) return;
      if (trainingRemoteListSummaryBootstrapState.signature !== signature) {
        resetTrainingRemoteListSummaryBootstrapState();
        trainingRemoteListSummaryBootstrapState.signature = signature;
      }
      if (trainingRemoteListSummaryBootstrapState.timer) return;
      if (trainingRemoteListSummaryBootstrapState.attempt >= TRAINING_REMOTE_LIST_SUMMARY_BOOTSTRAP_DELAYS.length) return;
      const delay = TRAINING_REMOTE_LIST_SUMMARY_BOOTSTRAP_DELAYS[trainingRemoteListSummaryBootstrapState.attempt];
      trainingRemoteListSummaryBootstrapState.attempt += 1;
      trainingRemoteListSummaryBootstrapState.timer = window.setTimeout(() => {
        trainingRemoteListSummaryBootstrapState.timer = 0;
        if (!String(window.location.hash || '').startsWith('#training')) {
          resetTrainingRemoteListSummaryBootstrapState();
          return;
        }
        if (readTrainingRemoteListSummary(user, false)) {
          resetTrainingRemoteListSummaryBootstrapState();
          return;
        }
        if (!getTrainingRemoteListSummaryClient()) {
          queueTrainingRemoteListSummaryBootstrap(user);
          return;
        }
        primeTrainingRemoteListSummary(user).then((summary) => {
          if (!String(window.location.hash || '').startsWith('#training')) return;
          const localSummary = getTrainingListSnapshot(user).summary;
          if (serializeTrainingListCounts(summary) !== serializeTrainingListCounts(localSummary)) {
            renderTraining({ skipSync: true });
          }
        }).catch((error) => {
          console.warn('training list summary bootstrap failed', error);
        }).finally(() => {
          resetTrainingRemoteListSummaryBootstrapState();
        });
      }, delay);
    }

    function readTrainingRemoteListSummary(user, force) {
      const signature = getTrainingRemoteListSummarySignature(user);
      if (!signature) return null;
      if (trainingRemoteListSummaryCache.signature !== signature) return null;
      if (!trainingRemoteListSummaryCache.summary) return null;
      const age = Date.now() - Number(trainingRemoteListSummaryCache.fetchedAt || 0);
      if (force || age > TRAINING_REMOTE_LIST_SUMMARY_TTL_MS) return null;
      return normalizeTrainingListCounts(trainingRemoteListSummaryCache.summary);
    }

    function primeTrainingRemoteListSummary(user, options) {
      const opts = options || {};
      const client = getTrainingRemoteListSummaryClient();
      const signature = getTrainingRemoteListSummarySignature(user);
      if (!client || !signature) return Promise.resolve(null);
      if (!opts.force
        && trainingRemoteListSummaryCache.signature === signature
        && trainingRemoteListSummaryCache.promise) {
        return trainingRemoteListSummaryCache.promise;
      }
      const loadSummary = typeof client.getTrainingFormsSummary === 'function'
        ? client.getTrainingFormsSummary.bind(client)
        : client.listTrainingForms.bind(client);
      const promise = loadSummary().then((response) => {
        const summary = normalizeTrainingListCounts(response && response.summary);
        if (trainingRemoteListSummaryBootstrapState.signature === signature) resetTrainingRemoteListSummaryBootstrapState();
        trainingRemoteListSummaryCache = {
          signature,
          summary,
          fetchedAt: Date.now(),
          promise: null
        };
        return summary;
      }).catch((error) => {
        if (trainingRemoteListSummaryCache.signature === signature) {
          trainingRemoteListSummaryCache = {
            ...trainingRemoteListSummaryCache,
            promise: null
          };
        }
        throw error;
      });
      trainingRemoteListSummaryCache = {
        signature,
        summary: trainingRemoteListSummaryCache.signature === signature ? trainingRemoteListSummaryCache.summary : null,
        fetchedAt: trainingRemoteListSummaryCache.signature === signature ? trainingRemoteListSummaryCache.fetchedAt : 0,
        promise
      };
      return promise;
    }

    function getTrainingListSnapshot(user) {
      const input = user || currentUser();
      const signature = [
        String(typeof getStoreTouchToken === 'function' ? getStoreTouchToken('cats_training_hours') : ''),
        getTrainingUserSignature(input)
      ].join('::');
      if (trainingListViewCache.signature === signature && Array.isArray(trainingListViewCache.visibleForms) && trainingListViewCache.summary) {
        return trainingListViewCache;
      }
      const source = getVisibleTrainingForms(input);
      const visibleForms = Array.isArray(source)
        ? source.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        : [];
      const summary = normalizeTrainingListCounts();
      for (const form of visibleForms) {
        summary.total += 1;
        if (form.status === TRAINING_STATUSES.DRAFT) summary.draft += 1;
        if (form.status === TRAINING_STATUSES.PENDING_SIGNOFF) summary.pending += 1;
        if (form.status === TRAINING_STATUSES.SUBMITTED) summary.submitted += 1;
        if (form.status === TRAINING_STATUSES.RETURNED) summary.returned += 1;
      }
      trainingListViewCache = { signature, visibleForms, summary };
      return trainingListViewCache;
    }

    function getTrainingAdminDashboardSnapshot() {
      const allForms = getAllTrainingForms();
      const statsUnits = getTrainingDashboardUnits();
      const unitSignature = statsUnits.join('|');
      const signature = [
        String(typeof getStoreTouchToken === 'function' ? getStoreTouchToken('cats_training_hours') : ''),
        String(allForms.length || 0),
        unitSignature
      ].join('::');
      if (trainingAdminDashboardCache.signature === signature && Array.isArray(trainingAdminDashboardCache.latestByUnit)) {
        return trainingAdminDashboardCache;
      }
      const formsByStatsUnit = new Map();
      allForms.forEach((form) => {
        const statsUnit = String(form?.statsUnit || getTrainingStatsUnit(form?.unit) || '').trim();
        if (!statsUnit || !isValidTrainingDashboardUnit(statsUnit)) return;
        if (!formsByStatsUnit.has(statsUnit)) formsByStatsUnit.set(statsUnit, []);
        formsByStatsUnit.get(statsUnit).push(form);
      });
      const latestByUnit = statsUnits.map((statsUnit) => {
        const unitForms = formsByStatsUnit.get(statsUnit) || [];
        let latest = null;
        let latestSubmitted = null;
        let latestTime = -Infinity;
        let latestSubmittedTime = -Infinity;
        let totalActive = 0;
        let totalCompleted = 0;
        let totalIncomplete = 0;
        for (const form of unitForms) {
          const time = new Date(form && (form.updatedAt || form.createdAt || 0)).getTime();
          const safeTime = Number.isFinite(time) ? time : 0;
          if (safeTime >= latestTime) {
            latest = form;
            latestTime = safeTime;
          }
          if (form && form.status === TRAINING_STATUSES.SUBMITTED && safeTime >= latestSubmittedTime) {
            latestSubmitted = form;
            latestSubmittedTime = safeTime;
          }
          const summary = form.summary || computeTrainingSummary(form.records || []);
          totalActive += Number(summary.activeCount || 0);
          totalCompleted += Number(summary.completedCount || 0);
          totalIncomplete += Number(summary.incompleteCount || 0);
        }
        const effectiveLatest = latestSubmitted || latest;
        return {
          statsUnit,
          displayUnit: getTrainingDashboardDisplayUnit(effectiveLatest, statsUnit),
          latest: effectiveLatest,
          summary: effectiveLatest ? (effectiveLatest.summary || computeTrainingSummary(effectiveLatest.records || [])) : computeTrainingSummary([]),
          aggregate: {
            activeCount: totalActive,
            completedCount: totalCompleted,
            incompleteCount: totalIncomplete
          }
        };
      });
      const completedUnits = latestByUnit.filter((item) => item.latest && item.latest.status === TRAINING_STATUSES.SUBMITTED);
      const incompleteUnits = latestByUnit.filter((item) => !item.latest || item.latest.status !== TRAINING_STATUSES.SUBMITTED);
      trainingAdminDashboardCache = {
        signature,
        statsUnits,
        latestByUnit,
        completedUnits,
        incompleteUnits
      };
      return trainingAdminDashboardCache;
    }

    function refreshTrainingRosterDomCache(contentEl, signature) {
      if (!contentEl) return;
      const rows = Array.from(contentEl.querySelectorAll('tr[data-roster-id]'));
      const groupSelectAll = Array.from(contentEl.querySelectorAll('.training-roster-group-select-all'));
      const rowsByGroup = new Map();
      rows.forEach((row) => {
        const groupKey = String(row.dataset.rosterGroup || '').trim();
        if (!groupKey) return;
        if (!rowsByGroup.has(groupKey)) rowsByGroup.set(groupKey, []);
        rowsByGroup.get(groupKey).push(row);
      });
      trainingRosterDomCache = {
        signature,
        contentEl,
        rows,
        groupSelectAll,
        rowsByGroup,
        selectedCountLabel: contentEl.querySelector('#training-roster-selected-count'),
        deleteSelectedButton: contentEl.querySelector('#training-roster-delete-selected')
      };
    }
  function buildTrainingSummaryCards(summary) {
    const cards = [['在職人數', summary.activeCount || 0, 'active'], ['已完成', summary.completedCount || 0, 'complete'], ['未完成', summary.incompleteCount || 0, 'warning'], ['完成率', (summary.completionRate || 0) + '%', 'rate'], ['資訊人員', summary.infoStaffCount || 0, 'info'], ['待補欄位', (summary.missingStatusCount || 0) + (summary.missingFieldCount ? ' / ' + summary.missingFieldCount : ''), 'pending']];
    return cards.map(([label, value, tone]) => '<div class="training-mini-card training-mini-card--' + tone + '"><div class="training-mini-label">' + label + '</div><div class="training-mini-value">' + value + '</div></div>').join('');
  }

  function buildTrainingOverviewStats(summary) {
    return ''
      + '<div class="stat-card total"><div class="stat-icon">' + ic('graduation-cap') + '</div><div class="stat-value">' + summary.total + '</div><div class="stat-label">填報單數</div></div>'
      + '<div class="stat-card closed"><div class="stat-icon">' + ic('check-circle-2') + '</div><div class="stat-value">' + summary.submitted + '</div><div class="stat-label">已完成填報</div></div>'
      + '<div class="stat-card pending"><div class="stat-icon">' + ic('clock-3') + '</div><div class="stat-value">' + summary.pending + '</div><div class="stat-label">待簽核</div></div>'
      + '<div class="stat-card overdue"><div class="stat-icon">' + ic('rotate-ccw') + '</div><div class="stat-value">' + (summary.draft + summary.returned) + '</div><div class="stat-label">待補件 / 草稿</div></div>';
  }

  function compareZhStroke(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'zh-Hant-u-co-stroke', { sensitivity: 'base', numeric: true });
  }

  function getFileExtension(name) {
    const clean = String(name || '').trim();
    const match = clean.match(/\.([^.]+)$/);
    return match ? String(match[1] || '').toLowerCase() : '';
  }

  function normalizeTrainingYearLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return String(new Date().getFullYear() - 1911);
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return raw;
    if (digits.length >= 4) {
      const adYear = Number(digits.slice(0, 4));
      if (Number.isFinite(adYear) && adYear >= 1911) return String(adYear - 1911);
    }
    const parsed = Number(digits);
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : raw;
  }

  function buildTrainingSignoffFileName(form, entry) {
    const fillUnit = String(form?.unit || '').trim();
    const fallbackUnit = String(form?.statsUnit || getTrainingStatsUnit(form?.unit) || '').trim();
    const unitLabel = fillUnit || fallbackUnit || '未指定單位';
    const yearLabel = normalizeTrainingYearLabel(form?.trainingYear);
    const extension = String(entry?.extension || getFileExtension(entry?.name || entry?.file?.name || '')).trim().toLowerCase();
    const suffix = extension ? ('.' + extension) : '';
    return unitLabel + '-' + yearLabel + '年國立臺灣大學資通安全教育訓練執行情形簽核表-掃描檔' + suffix;
  }

  function applyTrainingSignoffFileName(entry, form) {
    const source = entry && typeof entry === 'object' ? entry : {};
    return {
      ...source,
      name: buildTrainingSignoffFileName(form, source)
    };
  }

  async function runAsyncPool(items, worker, concurrency) {
    const list = Array.isArray(items) ? items : [];
    const runner = typeof worker === 'function' ? worker : async function noop() {};
    const limit = Math.max(1, Number(concurrency) || 1);
    const results = new Array(list.length);
    let index = 0;
    async function next() {
      while (index < list.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await runner(list[currentIndex], currentIndex);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, list.length) }, next));
    return results;
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

  function hasDisplayCorruption(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/\?{3,}/.test(text)) return true;
    return /(\uFFFD|銵|摮貉|銝剖|蝟餌絞|撣唾|瑼Ｘ)/.test(text);
  }

  function isRenderableTrainingRoster(row) {
    const fields = [
      row && row.statsUnit,
      row && row.unit,
      row && row.name,
      row && row.unitName,
      row && row.identity,
      row && row.jobTitle,
      row && row.createdBy
    ];
    return fields.every((field) => !hasDisplayCorruption(field));
  }

    function isValidTrainingDashboardUnit(unitValue) {
      const statsUnit = String(getTrainingStatsUnit(unitValue) || '').trim();
      return !!statsUnit && isOfficialUnit(statsUnit) && !isTrainingDashboardExcludedUnit(statsUnit);
    }

    function getTrainingDashboardUnits() {
      const cacheSignature = [
        String(typeof getStoreTouchToken === 'function' ? getStoreTouchToken('cats_data') : ''),
        String(typeof getStoreTouchToken === 'function' ? getStoreTouchToken('cats_training_hours') : '')
      ].join('::');
      if (trainingDashboardUnitsCache.signature === cacheSignature && Array.isArray(trainingDashboardUnitsCache.units)) {
        return trainingDashboardUnitsCache.units.slice();
      }
      const unitSet = new Set();
      getTrainingUnits().forEach((unit) => {
        const statsUnit = String(getTrainingStatsUnit(unit) || '').trim();
        if (statsUnit && isValidTrainingDashboardUnit(statsUnit)) unitSet.add(statsUnit);
      });
      getAllTrainingForms().forEach((form) => {
        const statsUnit = String(form?.statsUnit || getTrainingStatsUnit(form?.unit) || '').trim();
        if (statsUnit && isValidTrainingDashboardUnit(statsUnit)) unitSet.add(statsUnit);
      });
      const units = Array.from(unitSet).sort(compareZhStroke);
      trainingDashboardUnitsCache = { signature: cacheSignature, units };
      return units;
    }

  function getTrainingDashboardDisplayUnit(form, statsUnit) {
    const displayUnit = String(form?.unit || '').trim();
    return displayUnit || String(statsUnit || '').trim();
  }

  function renderTrainingDashboardUnitCell(statsUnit, displayUnit) {
    const topLevel = String(statsUnit || '').trim();
    const display = String(displayUnit || '').trim();
    if (!display || display === topLevel) return esc(topLevel || '—');
    return '<div class="training-dashboard-unit-cell"><strong>' + esc(topLevel || '—') + '</strong><small>' + esc(display) + '</small></div>';
  }

  function buildTrainingTableCard(title, subtitle, badgeText, headersHtml, rowsHtml) {
    const badge = badgeText ? '<span class="training-inline-status">' + badgeText + '</span>' : '';
    const subtitleHtml = subtitle ? '<div class="training-table-subtitle">' + subtitle + '</div>' : '';
    return '<div class="card training-table-card"><div class="card-header"><div><span class="card-title">' + title + '</span>' + subtitleHtml + '</div>' + badge + '</div>' + buildTrainingTableMarkup(headersHtml, rowsHtml) + '</div>';
  }

  function buildTrainingGroupedSection(title, subtitle, groups) {
    const actionsHtml = (groups || []).length
      ? '<div class="training-group-header-actions"><button type="button" class="btn btn-secondary btn-sm" id="training-expand-groups">' + ic('list-plus', 'icon-sm') + ' 全部展開</button><button type="button" class="btn btn-secondary btn-sm" id="training-collapse-groups">' + ic('list-collapse', 'icon-sm') + ' 全部收合</button></div>'
      : '';
    const groupHtml = (groups || []).map((group, index) => {
      const bodyRows = group.rows || buildTrainingEmptyTableRow(9, '此分類目前沒有單位', '', 20);
      return '<details class="training-group-card" ' + (index === 0 ? 'open' : '') + '><summary class="training-group-summary"><div><span class="training-group-title">' + esc(group.label) + '</span><div class="training-group-subtitle">' + esc(group.subtitle || '') + '</div>' + (group.summaryHtml || '') + '</div><div class="training-group-meta"><span class="training-inline-status">' + esc(String(group.count || 0)) + ' 個單位</span><span class="training-group-toggle">' + ic('chevron-down', 'icon-sm') + '</span></div></summary>' + buildTrainingTableMarkup('<th>一級單位</th><th>狀態</th><th>經辦人</th><th>單位總人數</th><th>已完成</th><th>達成比率</th><th>說明</th><th>最後更新</th><th>操作</th>', bodyRows) + '</details>';
    }).join('');
    return '<div class="card training-table-card"><div class="card-header"><div><span class="card-title">' + esc(title) + '</span><div class="training-table-subtitle">' + esc(subtitle || '') + '</div></div>' + actionsHtml + '</div><div class="training-group-stack">' + groupHtml + '</div></div>';
  }

  function buildTrainingGroupSummary(summary) {
    const stats = summary || {};
    const completionRate = stats.activeCount ? Math.round((stats.completedCount / stats.activeCount) * 100) : 0;
    const chips = [
      ['已建立填報', stats.filledUnits || 0],
      ['待處理單位', stats.count || 0],
      ['平均達成率', completionRate + '%']
    ];
    return '<div class="training-group-summary-grid">' + chips.map(([label, value]) => '<span class="training-group-summary-chip"><strong>' + esc(String(value)) + '</strong><small>' + esc(label) + '</small></span>').join('') + '</div>';
  }

  function buildTrainingSummarySection(summary) {
    return '<div class="training-summary-grid training-summary-grid-wide">' + buildTrainingSummaryCards(summary) + '</div>';
  }

  function buildTrainingTableMarkup(headersHtml, rowsHtml, options) {
    const opts = options || {};
    const tbodyIdAttr = opts.tbodyId ? ' id="' + esc(opts.tbodyId) + '"' : '';
    return '<div class="table-wrapper"><table><thead><tr>' + headersHtml + '</tr></thead><tbody' + tbodyIdAttr + '>' + rowsHtml + '</tbody></table></div>';
  }

  function buildTrainingEmptyTableRow(colspan, title, desc, padding) {
    const descHtml = desc ? '<div class="empty-state-desc">' + esc(desc) + '</div>' : '';
    return '<tr><td colspan="' + colspan + '"><div class="empty-state" style="padding:' + (padding || 24) + 'px"><div class="empty-state-title">' + esc(title) + '</div>' + descHtml + '</div></td></tr>';
  }

  function buildTrainingDetailField(label, value) {
    const displayValue = value === undefined || value === null || value === '' ? '—' : value;
    return '<div class="detail-field"><div class="detail-field-label">' + esc(label) + '</div><div class="detail-field-value">' + esc(displayValue) + '</div></div>';
  }

  function buildTrainingDetailGrid(fields) {
    return '<div class="detail-grid">' + fields.map((field) => buildTrainingDetailField(field.label, field.value)).join('') + '</div>';
  }

  function buildTrainingCard(title, bodyHtml, options) {
    const opts = options || {};
    const styleAttr = opts.style ? ' style="' + opts.style + '"' : '';
    const headerStyleAttr = opts.headerStyle ? ' style="' + opts.headerStyle + '"' : '';
    return '<div class="card"' + styleAttr + '><div class="card-header"' + headerStyleAttr + '><span class="card-title">' + title + '</span></div>' + bodyHtml + '</div>';
  }

  function showTrainingRepositoryFallback(result, successMessage) {
    if (successMessage) {
      toast(successMessage, 'info');
    }
    if (result && result.warning) {
      toast(result.warning, 'info');
    }
  }

  function buildTrainingFileSlot(slotId, extraClass) {
    return '<div class="file-preview-list ' + esc(extraClass || '') + '" id="' + esc(slotId) + '"></div>';
  }

  function buildTrainingSignoffUploadCard() {
    return '<div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">流程三：上傳簽核掃描檔</span></div><div class="upload-zone" id="training-upload-zone"><input type="file" id="training-file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">' + ic('folder-open') + '</div><div class="upload-zone-text">拖曳檔案或 <strong>點此選擇</strong></div><div class="upload-zone-hint">支援 JPG / PNG / PDF，單檔上限 5MB</div></div>' + buildTrainingFileSlot('training-file-previews', 'training-signoff-files') + '<div class="form-actions"><button type="button" class="btn btn-primary" id="training-finalize-submit">' + ic('check-circle-2', 'icon-sm') + ' 完成流程三並正式結束填報</button></div></div>';
  }

  function buildTrainingStepCards(stepDefs) {
    return stepDefs.map((step) => '<div class="training-step-card"><div class="training-step-kicker">' + esc(step[0]) + '</div><div class="training-step-title">' + esc(step[1]) + '</div><div class="training-step-status">' + esc(step[2]) + '</div><div class="training-step-note">' + esc(step[3]) + '</div></div>').join('');
  }

  function buildTrainingDetailRow(row) {
    return '<tr><td>' + esc(row.name) + '</td><td>' + esc(row.unitName || '—') + '</td><td>' + esc(row.identity || '—') + '</td><td>' + esc(row.jobTitle || '—') + '</td><td>' + esc(row.status || '—') + '</td><td>' + esc(row.completedGeneral || '—') + '</td><td>' + esc(row.isInfoStaff || '—') + '</td><td>' + esc(getTrainingProfessionalDisplay(row)) + '</td><td>' + trainingDecisionBadge(row) + '</td><td>' + esc(row.note || '') + '</td></tr>';
  }

  function buildTrainingDetailRows(records) {
    if (!(records || []).length) return buildTrainingEmptyTableRow(10, '尚無明細資料', '', 24);
    return records.map((row) => buildTrainingDetailRow(row)).join('');
  }

  function buildTrainingEditableMetaCell(row, index, field, canDeleteRow, editableMetaClass, placeholder) {
    if (!canDeleteRow) return esc(row[field] || '—');
    return '<input type="text" class="form-input training-row-meta' + editableMetaClass + '" data-idx="' + index + '" data-field="' + field + '" value="' + esc(row[field] || '') + '" placeholder="' + esc(placeholder) + '">';
  }

  function buildTrainingFillRow(params) {
    const { row, index, visibleIndex, key, selected, canDeleteRow } = params;
    const isActive = row.status === '在職';
    const professionalDisabled = !isActive || row.isInfoStaff !== '是';
    const editableMetaClass = canDeleteRow ? ' training-row-meta--editable' : '';
    const professionalHtml = row.isInfoStaff === '否'
      ? '<span class="training-na-chip">不適用</span>'
      : renderTrainingBinaryButtons('completedProfessional', row.completedProfessional, index, professionalDisabled, '✓', '✕');
    const actionHtml = canDeleteRow
      ? '<div class="training-row-actions"><button type="button" class="btn btn-sm btn-danger training-row-delete" data-idx="' + index + '">' + ic('trash-2', 'btn-icon-svg') + '</button></div>'
      : '<div class="training-row-actions"><span class="training-row-action-hint">' + (row.source === 'manual' ? '僅建立者可刪' : '正式名單') + '</span></div>';
    return '<tr>'
      + '<td><input type="checkbox" class="training-row-check" data-key="' + esc(key) + '" ' + (selected ? 'checked' : '') + '></td>'
      + '<td>' + (visibleIndex + 1) + '</td>'
      + '<td><div class="training-person-cell"><div class="training-person-name">' + esc(row.name) + '</div><span class="training-source-tag ' + (row.source === 'import' ? 'import' : 'manual') + '">' + (row.source === 'import' ? '管理者匯入' : '填報新增') + '</span></div></td>'
      + '<td>' + buildTrainingEditableMetaCell(row, index, 'unitName', canDeleteRow, editableMetaClass, '本職單位') + '</td>'
      + '<td>' + buildTrainingEditableMetaCell(row, index, 'identity', canDeleteRow, editableMetaClass, '身分別') + '</td>'
      + '<td>' + buildTrainingEditableMetaCell(row, index, 'jobTitle', canDeleteRow, editableMetaClass, '職稱') + '</td>'
      + '<td><select class="form-select training-row-select" data-idx="' + index + '" data-field="status">' + trainingSelectOptionsHtml(TRAINING_EMPLOYEE_STATUS, row.status, '請選擇') + '</select></td>'
      + '<td>' + renderTrainingBinaryButtons('completedGeneral', row.completedGeneral, index, !isActive, '✓', '✕') + '</td>'
      + '<td><select class="form-select training-row-select" data-idx="' + index + '" data-field="isInfoStaff" ' + (isActive ? '' : 'disabled') + '>' + trainingSelectOptionsHtml(TRAINING_BOOLEAN_SELECT_OPTIONS, row.isInfoStaff, '請選擇') + '</select></td>'
      + '<td>' + professionalHtml + '</td>'
      + '<td><div class="training-cell-note">' + trainingDecisionBadge(row) + '<div class="training-cell-hint">' + esc(getTrainingRecordHint(row)) + '</div></div></td>'
      + '<td><input type="text" class="form-input training-row-note" data-idx="' + index + '" value="' + esc(row.note || '') + '" placeholder="可填補充說明或課程名稱"></td>'
      + '<td>' + actionHtml + '</td>'
      + '</tr>';
  }

  function buildTrainingStatCard(tone, iconName, value, label) {
    return '<div class="stat-card ' + esc(tone) + '"><div class="stat-icon">' + ic(iconName) + '</div><div class="stat-value">' + esc(String(value)) + '</div><div class="stat-label">' + esc(label) + '</div></div>';
  }

  function buildTrainingRosterStats(summary) {
    const totalLabel = summary && summary.paged ? '全部名單' : '總名單筆數';
    const importedLabel = summary && summary.paged ? '本頁匯入' : '管理者匯入';
    const manualLabel = summary && summary.paged ? '本頁新增' : '填報新增';
    return ''
      + buildTrainingStatCard('total', 'users', summary.total, totalLabel)
      + buildTrainingStatCard('closed', 'download', summary.imported, importedLabel)
      + buildTrainingStatCard('pending', 'user-plus', summary.manual, manualLabel);
  }

  function getTrainingRosterGroupKey(row) {
    const unit = String(row && row.unit || row && row.statsUnit || '').trim();
    return unit || '未指定單位';
  }

  function groupTrainingRosterEntries(rows, cacheKeyOverride) {
      const rosterToken = typeof getStoreTouchToken === 'function'
        ? String(getStoreTouchToken('training-rosters') || '')
        : '';
    const cacheKey = cacheKeyOverride || (rosterToken + '::' + String(Array.isArray(rows) ? rows.length : 0));
    if (trainingRosterGroupingCache.token === cacheKey && Array.isArray(trainingRosterGroupingCache.groups)) {
      return trainingRosterGroupingCache.groups;
    }
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = getTrainingRosterGroupKey(row);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          unit: String(row && row.unit || '').trim() || key,
          statsUnit: String(row && row.statsUnit || getTrainingStatsUnit(row && row.unit) || '').trim() || getTrainingStatsUnit(row && row.unit) || key,
          rows: [],
          totalCount: 0,
          importedCount: 0,
          manualCount: 0
        });
      }
      const group = groups.get(key);
      group.rows.push(row);
      group.totalCount += 1;
      if (row && row.source === 'import') group.importedCount += 1;
      if (row && row.source === 'manual') group.manualCount += 1;
    });
    const grouped = Array.from(groups.values())
      .map((group) => ({
        ...group,
        rows: sortTrainingRosterEntries(group.rows || [])
      }))
      .sort((a, b) => compareZhStroke(a.unit, b.unit) || compareZhStroke(a.statsUnit, b.statsUnit));
      trainingRosterGroupingCache = { token: cacheKey, groups: grouped };
      return grouped;
    }

    function getTrainingRosterSnapshot(rawRosters, cacheKeyOverride) {
      const source = Array.isArray(rawRosters) ? rawRosters : [];
      const rosterToken = typeof getStoreTouchToken === 'function'
        ? String(getStoreTouchToken('training-rosters') || '')
        : '';
      const cacheKey = cacheKeyOverride || (rosterToken + '::' + String(source.length));
      if (trainingRosterSnapshotCache.token === cacheKey && Array.isArray(trainingRosterSnapshotCache.rosters)) {
        return trainingRosterSnapshotCache;
      }
      const rosters = [];
      let hiddenCount = 0;
      let imported = 0;
      let manual = 0;
      for (const row of source) {
        if (!isRenderableTrainingRoster(row)) {
          hiddenCount += 1;
          continue;
        }
        rosters.push(row);
        if (row && row.source === 'import') imported += 1;
        if (row && row.source === 'manual') manual += 1;
      }
      const summary = {
        total: rosters.length,
        imported,
        manual
      };
      trainingRosterSnapshotCache = {
        token: cacheKey,
        rawLength: source.length,
        rosters,
        hiddenCount,
        summary
      };
      return trainingRosterSnapshotCache;
    }

  function buildTrainingRosterGroupSummary(group) {
    const rows = Array.isArray(group && group.rows) ? group.rows : [];
    const imported = Number(group && group.importedCount || rows.filter((row) => row.source === 'import').length);
    const manual = Number(group && group.manualCount || rows.filter((row) => row.source === 'manual').length);
    const stats = [
      ['總筆數', Number(group && group.totalCount || rows.length)],
      ['管理者匯入', imported],
      ['填報新增', manual]
    ];
    return '<div class="training-group-summary-grid">' + stats.map(([label, value]) => '<span class="training-group-summary-chip"><strong>' + esc(String(value)) + '</strong><small>' + esc(label) + '</small></span>').join('') + '</div>';
  }

  function buildTrainingRosterRow(row, rowNumber, selected) {
    const sourceLabel = row.source === 'import' ? '管理者匯入' : '填報新增';
    const sourceTone = row.source === 'import' ? 'import' : 'manual';
    const rowAttrs = [
      'data-roster-id="' + esc(row.id) + '"',
      'data-roster-name="' + esc(row.name || '') + '"',
      'data-roster-unit="' + esc(row.unit || '') + '"',
      'data-roster-group="' + esc(getTrainingRosterGroupKey(row)) + '"'
    ].join(' ');
    return '<tr ' + rowAttrs + '>'
      + '<td><input type="checkbox" class="training-roster-check" data-roster-id="' + esc(row.id) + '" data-roster-group="' + esc(getTrainingRosterGroupKey(row)) + '" ' + (selected ? 'checked' : '') + '></td>'
      + '<td><strong class="training-roster-order">' + esc(String(rowNumber || 0)) + '</strong></td>'
      + '<td><div class="training-person-cell"><div class="training-person-name">' + esc(row.name) + '</div><span class="training-source-tag ' + sourceTone + '">' + esc(sourceLabel) + '</span></div></td>'
      + '<td>' + esc(row.unitName || '—') + '</td>'
      + '<td>' + esc(row.identity || '—') + '</td>'
      + '<td>' + esc(row.jobTitle || '—') + '</td>'
      + '<td>' + esc(row.createdBy || '') + '</td>'
      + '<td>' + fmtTime(row.createdAt) + '</td>'
      + '<td><button type="button" class="btn btn-sm btn-danger" data-testid="training-roster-delete-' + esc(row.id) + '" data-action="training.deleteRoster" data-id="' + esc(row.id) + '">' + ic('trash-2', 'btn-icon-svg') + '</button></td>'
      + '</tr>';
  }

  function buildTrainingRosterGroupTable(group, selectedRosterIds, index) {
    const rows = Array.isArray(group && group.rows) ? group.rows : [];
    const bodyRows = rows.length
      ? rows.map((row, rowIndex) => buildTrainingRosterRow(row, rowIndex + 1, selectedRosterIds.has(row.id))).join('')
      : buildTrainingEmptyTableRow(9, '尚無名單資料', '', 24);
    const totalCount = Number(group && group.totalCount || rows.length);
    const subtitle = '統計單位：' + esc(group.statsUnit || '—') + '｜填報單位：' + esc(group.unit || '—') + '｜可展開 ' + totalCount + ' 位人員';
    return '<details class="training-group-card training-roster-group-card" ' + (index === 0 ? 'open' : '') + '>'
      + '<summary class="training-group-summary">'
      + '<div><span class="training-group-title">' + esc(group.unit || '未指定單位') + '</span><div class="training-group-subtitle">' + subtitle + '</div>' + buildTrainingRosterGroupSummary(group) + '</div>'
      + '<div class="training-group-meta"><span class="training-inline-status">' + esc(String(totalCount || 0)) + ' 人</span><span class="training-group-toggle">' + ic('chevron-down', 'icon-sm') + '</span></div>'
      + '</summary>'
      + buildTrainingTableMarkup('<th style="width:56px"><input type="checkbox" class="training-roster-group-select-all" data-roster-group="' + esc(group.key || '') + '"></th><th style="width:68px">編號</th><th style="width:180px">姓名 / 來源</th><th style="min-width:180px">本職單位</th><th style="width:140px">身分別</th><th style="width:140px">職稱</th><th style="width:160px">建立者</th><th style="width:160px">建立時間</th><th style="width:120px">操作</th>', bodyRows)
      + '</details>';
  }

  function buildTrainingRosterGroupChunkHtml(groups, selectedRosterIds, startIndex, endIndex) {
    const selectedSet = selectedRosterIds instanceof Set ? selectedRosterIds : new Set();
    const sourceGroups = Array.isArray(groups) ? groups : [];
    const from = Math.max(0, Number(startIndex) || 0);
    const to = Math.min(sourceGroups.length, Number(endIndex) || sourceGroups.length);
    if (to <= from) return '';
    return sourceGroups.slice(from, to).map((group, offset) => buildTrainingRosterGroupTable(group, selectedSet, from + offset)).join('');
  }

  function buildTrainingRosterRowsFromGroups(groups, selectedRosterIds) {
    const selectedSet = selectedRosterIds instanceof Set ? selectedRosterIds : new Set();
    const sourceGroups = Array.isArray(groups) ? groups : [];
    if (!sourceGroups.length) {
      return '<div class="empty-state" style="padding:28px"><div class="empty-state-title">撠?鞈?</div><div class="empty-state-desc">隢??梁恣??亙??殷???桐?蝞∠??⊥憓??桀?鈭箏??/div></div>';
    }
    return buildTrainingRosterGroupChunkHtml(sourceGroups, selectedSet, 0, sourceGroups.length);
  }

  function buildTrainingRosterRows(rosters, selectedRosterIds) {
    return buildTrainingRosterRowsFromGroups(groupTrainingRosterEntries(rosters), selectedRosterIds);
  }

  function buildTrainingRosterPreviewRows(options) {
    const opts = options || {};
    const ids = Array.isArray(opts.rosterIds) ? opts.rosterIds.map((value) => String(value || '').trim()).filter(Boolean) : [];
    const names = Array.isArray(opts.rosterNames) ? opts.rosterNames.map((value) => String(value || '').trim()).filter(Boolean) : [];
    const units = Array.isArray(opts.rosterUnits) ? opts.rosterUnits.map((value) => String(value || '').trim()) : [];
    const total = Math.max(ids.length, names.length, units.length);
    const rows = [];
    const seen = new Set();
    for (let index = 0; index < total; index += 1) {
      const name = String(names[index] || '').trim();
      if (!name) continue;
      const unit = String(units[index] || '').trim();
      const id = String(ids[index] || '').trim() || ('import-preview-' + index);
      const key = id + '::' + name + '::' + unit;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id,
        name,
        unit: unit || String(opts.importUnit || '').trim() || '未指定單位',
        unitName: unit || String(opts.importUnit || '').trim() || '未指定單位',
        statsUnit: unit || String(opts.importUnit || '').trim() || '未指定單位',
        identity: '—',
        jobTitle: '—',
        source: 'import'
      });
    }
    return rows;
  }

  function buildTrainingRosterImportPreview(options, selectedRosterIds) {
    const rows = buildTrainingRosterPreviewRows(options);
    if (!rows.length) return '';
    const selectedSet = selectedRosterIds instanceof Set ? selectedRosterIds : new Set();
    return '<div class="training-roster-import-preview"><div class="training-editor-note">本次匯入名單先行顯示，完整名單將在背景載入。</div>' + buildTrainingRosterRows(rows, selectedSet) + '</div>';
  }

  function buildTrainingRosterFileCopy(fileName) {
    return fileName
      ? '<strong>' + esc(fileName) + '</strong><small>已選取檔案，送出後將直接匯入</small>'
      : '<strong>選擇 Excel / CSV 檔</strong><small>支援 `.xlsx`、`.xls`、`.csv`、`.tsv`</small>';
  }

  function buildTrainingRosterImportNote() {
    return '支援 Excel 檔（`.xlsx` / `.xls`）匯入，也可直接貼上 CSV / TSV。預設欄位：姓名、本職單位、身分別、職稱；若檔案已含「填報單位」欄位，也會自動分流到對應單位。';
  }

  function buildTrainingRosterSampleCsv() {
    return '姓名,本職單位,身分別,職稱\n王小明,資訊網路組,職員,工程師\n陳小華,資訊網路組,委外,駐點工程師';
  }

  function renderTrainingBinaryButtons(field, value, index, disabled, yesLabel, noLabel) {
    const dis = disabled ? 'disabled' : '';
    const testIdBase = 'training-binary-' + toTestIdFragment(field || 'field') + '-' + index;
    return '<div class="training-binary-group" role="group">'
      + '<button type="button" class="training-binary-btn ' + (value === '是' ? 'is-active is-yes' : '') + '" data-testid="' + testIdBase + '-yes" data-idx="' + index + '" data-field="' + field + '" data-value="是" aria-label="' + esc(field + '-yes') + '" ' + dis + '>' + esc(yesLabel || '✓') + '</button>'
      + '<button type="button" class="training-binary-btn ' + (value === '否' ? 'is-active is-no' : '') + '" data-testid="' + testIdBase + '-no" data-idx="' + index + '" data-field="' + field + '" data-value="否" aria-label="' + esc(field + '-no') + '" ' + dis + '>' + esc(noLabel || '✕') + '</button>'
      + '</div>';
  }

  async function handleTrainingUndo(id) {
    const form = getTrainingForm(id);
    const user = currentUser();
    if (!form || !user) return;
    if (!canUndoTrainingForm(form, user)) {
      toast('目前已無法撤回流程一，若需更正請由管理者退回', 'error');
      return;
    }
    const remainingMinutes = getTrainingUndoRemainingMinutes(form);
    const confirmed = await openConfirmDialog('\u64a4\u56de\u5f8c\u6703\u56de\u5230\u53ef\u7de8\u4fee\u7684\u8349\u7a3f\u72c0\u614b\uff0c\u4e26\u4e2d\u6b62\u5f8c\u7e8c\u7c3d\u6838\u6d41\u7a0b\uff0c\u78ba\u5b9a\u8981\u64a4\u56de\u55ce\uff1f', { title: '\u78ba\u8a8d\u64a4\u56de\u6d41\u7a0b\u4e00', confirmText: '\u78ba\u8a8d\u64a4\u56de', cancelText: '\u53d6\u6d88' });
    if (!confirmed) return;
    const now = new Date().toISOString();
    const payload = {
      ...form,
      status: TRAINING_STATUSES.DRAFT,
      updatedAt: now,
      stepOneSubmittedAt: null,
      printedAt: null,
      signoffUploadedAt: null,
      submittedAt: null,
      history: [...(form.history || []), {
        time: now,
        action: '單位管理員撤回流程一，重新開放編修（剩餘撤回時限 ' + remainingMinutes + ' 分鐘）',
        user: user.name
      }]
    };
    const result = await submitTrainingUndo(payload);
    showTrainingRepositoryFallback(result, '已撤回流程一，您可以繼續修改填報內容');
    navigate('training-fill/' + id, { replace: true });
  }

  async function handleTrainingReturn(id) {
    if (!isAdmin()) {
      toast('僅最高管理員可退回填報單', 'error');
      return;
    }
    const form = getTrainingForm(id);
    if (!form) return;
    if (form.status !== TRAINING_STATUSES.SUBMITTED) {
      toast('\u53ea\u6709\u6b63\u5f0f\u9001\u51fa\u7684\u586b\u5831\u55ae\u53ef\u4ee5\u9000\u56de', 'error');
      return;
    }
    const reason = await openPromptDialog('\u8acb\u8f38\u5165\u9000\u56de\u539f\u56e0', { title: '\u9000\u56de\u586b\u5831\u55ae', confirmText: '\u78ba\u8a8d\u9000\u56de', cancelText: '\u53d6\u6d88', placeholder: '\u8acb\u8f38\u5165\u9000\u56de\u539f\u56e0' });
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast('退回原因不可空白', 'error');
      return;
    }
    const now = new Date().toISOString();
    const result = await submitTrainingReturn({
      ...form,
      status: TRAINING_STATUSES.RETURNED,
      returnReason: trimmed,
      updatedAt: now,
      history: [...(form.history || []), { time: now, action: '管理者退回更正：' + trimmed, user: currentUser().name }]
    });
    showTrainingRepositoryFallback(result, '已退回 ' + id + ' 供單位管理員更正');
    dispatchTrainingCacheInvalidationScopes(['training-forms', 'training-summary', 'training-dashboard'], 'training-return');
    const route = getRoute();
    if (route.page === 'training-detail') renderTrainingDetail(id); else renderTraining();
  }

  async function handleTrainingDeleteRoster(id) {
    if (!isAdmin()) {
      toast('僅管理者可刪除名單', 'error');
      return;
    }
    const roster = getAllTrainingRosters().find((row) => row.id === id);
    if (!roster) return;
    const focusState = captureTrainingRosterFocusState() || (lastTrainingRosterFocusState ? { ...lastTrainingRosterFocusState } : null);
    const confirmed = await openConfirmDialog('\u78ba\u5b9a\u522a\u9664 ' + roster.unit + ' \u7684 ' + roster.name + ' \u55ce\uff1f\u5df2\u586b\u5831\u7684\u6b77\u53f2\u8cc7\u6599\u4e0d\u6703\u88ab\u522a\u9664\u3002', { title: '\u78ba\u8a8d\u522a\u9664\u540d\u55ae', confirmText: '\u78ba\u8a8d\u522a\u9664', cancelText: '\u53d6\u6d88' });
    if (!confirmed) return;
    await runWithBusyState('正在刪除名單…', async () => {
      const result = await submitTrainingRosterBatchDelete({
        ids: [id],
        actorName: currentUser()?.name || '',
        actorUsername: currentUser()?.username || ''
      });
      clearTrainingRosterRemotePageCache();
      dispatchTrainingCacheInvalidation('training-rosters', 'training-roster-delete');
      const restoreFocusState = focusState || (lastTrainingRosterFocusState ? { ...lastTrainingRosterFocusState } : null);
      try {
        await renderTrainingRoster({
          skipSync: true,
          restoreFocusState
        });
      } catch (error) {
        console.warn('training roster rerender after delete failed; retrying once', error);
        clearTrainingRosterRemotePageCache();
        try {
          await new Promise((resolve) => setTimeout(resolve, 450));
          await renderTrainingRoster({
            skipSync: true,
            restoreFocusState
          });
        } catch (retryError) {
          console.error('training roster rerender after delete failed twice', retryError);
          toast('名單刪除成功，但列表刷新失敗，請重新整理頁面。', 'warning');
        }
      }
      const deletedCount = Number(result && result.deletedCount || 0);
      toast(deletedCount > 1 ? ('名單已刪除，並同步清理重複資料 ' + deletedCount + ' 筆') : '名單已刪除', 'success');
      if (result && result.warning) {
        toast(result.warning, 'info');
      }
    });
  }

  function handleTrainingPrintDetail(id) {
    const form = getTrainingForm(id);
    if (!form) return;
    printTrainingSheet(form);
  }

  function handleTrainingExportDetailCsv(id) {
    const form = getTrainingForm(id);
    if (!form) return;
    exportTrainingDetailCsv(form);
  }

    async function renderTraining(options) {
      const opts = options || {};
      const accessProfile = getTrainingAccessProfile();
      const syncPromise = opts.skipSync
        ? Promise.resolve()
        : scheduleDeferredPromise(() => syncTrainingFormsFromM365({ silent: true }), 250).catch((error) => {
          console.warn('training list sync failed', error);
        });
      const listSnapshot = getTrainingListSnapshot(accessProfile);
      const visibleForms = listSnapshot.visibleForms;
      const remoteSummary = opts.skipRemoteSummary
        ? null
        : readTrainingRemoteListSummary(accessProfile, !!opts.forceRemoteSummary);
      const summary = normalizeTrainingListCounts(remoteSummary || listSnapshot.summary);
      const toolbar = '<div class="training-toolbar-actions">'
        + (canFillTraining() ? '<a href="#training-fill" class="btn btn-primary">' + ic('plus-circle', 'icon-sm') + ' 新增填報</a>' : '')
        + (visibleForms.length ? '<button class="btn btn-secondary" id="training-export-all">' + ic('download', 'icon-sm') + ' 匯出 Excel</button>' : '')
        + (isAdmin() ? '<a href="#training-roster" class="btn btn-secondary">' + ic('users', 'icon-sm') + ' 名單管理</a>' : '')
        + '</div>';
      let renderedSummarySignature = serializeTrainingListCounts(summary);

    const buildFormActions = (form, options) => {
      const opts = options || {};
      if (!form) {
        if (isAdmin() && opts.unit) {
          return '<a href="#training-fill/' + encodeURIComponent('unit:' + opts.unit) + '" class="btn btn-sm btn-primary">編修</a>';
        }
        return canFillTraining() ? '<a href="#training-fill" class="btn btn-sm btn-primary">開始填報</a>' : '—';
      }
      const actions = ['<a href="#training-detail/' + form.id + '" class="btn btn-sm btn-secondary">檢視</a>'];
      if (canEditTrainingForm(form)) actions.push('<a href="#training-fill/' + form.id + '" class="btn btn-sm btn-primary">編修</a>');
      if (canUndoTrainingForm(form)) actions.push('<button type="button" class="btn btn-sm btn-warning" data-action="training.undo" data-id="' + esc(form.id) + '">撤回流程一</button>');
      if (isAdmin() && form.status === TRAINING_STATUSES.SUBMITTED) actions.push('<button type="button" class="btn btn-sm btn-danger" data-action="training.return" data-id="' + esc(form.id) + '">退回更正</button>');
      return '<div class="training-table-actions">' + actions.join('') + '</div>';
    };

    let contentHtml = '';
    if (isAdmin()) {
      const dashboardSnapshot = getTrainingAdminDashboardSnapshot();
      const latestByUnit = dashboardSnapshot.latestByUnit;
      const completedUnits = dashboardSnapshot.completedUnits;
      const incompleteUnits = dashboardSnapshot.incompleteUnits;
      const adminSummary = { ...summary, submitted: completedUnits.length };
      const completedRows = completedUnits.length ? completedUnits.map((item) => '<tr>'
        + '<td>' + esc(item.statsUnit) + '</td>'
        + '<td>' + esc(item.displayUnit || item.statsUnit) + '</td>'
        + '<td>' + renderCopyIdCell(item.latest.id, '教育訓練編號', true) + '</td>'
        + '<td>' + esc(item.latest.fillerName || '—') + '</td>'
        + '<td>' + (item.summary.activeCount || 0) + '</td>'
        + '<td>' + (item.summary.completedCount || 0) + '</td>'
        + '<td>' + (item.summary.incompleteCount || 0) + '</td>'
        + '<td><span class="training-rate-pill">' + (item.summary.completionRate || 0) + '%</span></td>'
        + '<td>' + fmtTime(item.latest.submittedAt || item.latest.updatedAt) + '</td>'
        + '<td>' + buildFormActions(item.latest) + '</td>'
        + '</tr>').join('') : '<tr><td colspan="10"><div class="empty-state" style="padding:28px"><div class="empty-state-title">目前沒有已完成填報的單位</div></div></td></tr>';

      const categoryOrder = getTrainingUnitCategories().slice();
      const categoryLabels = {
        '行政單位': '行政單位',
        '學術單位': '學術單位',
        '研究中心': '中心 / 研究單位',
        '中心 / 研究單位': '中心 / 研究單位'
      };
      const incompleteGroups = categoryOrder.map((category) => {
        const units = incompleteUnits.filter((item) => categorizeTopLevelUnit(item.statsUnit) === category);
        const groupSummary = units.reduce((acc, item) => {
          const latest = item.latest;
          acc.count += 1;
          if (latest) acc.filledUnits += 1;
          acc.activeCount += Number(item.summary.activeCount || 0);
          acc.completedCount += Number(item.summary.completedCount || 0);
          acc.incompleteCount += Number(item.summary.incompleteCount || 0);
          return acc;
        }, { count: 0, filledUnits: 0, activeCount: 0, completedCount: 0, incompleteCount: 0 });
        const rows = units.length ? units.map((item) => {
          const latest = item.latest;
          const statusText = latest ? trainingStatusBadge(latest.status) : '<span class="training-inline-status">尚未填報</span>';
          const note = !latest
            ? '尚未建立填報單'
            : (latest.status === TRAINING_STATUSES.PENDING_SIGNOFF
              ? '流程一已完成，待列印與上傳簽核表'
              : (latest.status === TRAINING_STATUSES.RETURNED ? ('退回原因：' + (latest.returnReason || '未提供')) : '尚在填寫中'));
          return '<tr>'
            + '<td>' + renderTrainingDashboardUnitCell(item.statsUnit, item.displayUnit) + '</td>'
            + '<td>' + statusText + '</td>'
            + '<td>' + (latest ? esc(latest.fillerName || '—') : '—') + '</td>'
            + '<td>' + (item.summary.activeCount || 0) + '</td>'
            + '<td>' + (item.summary.completedCount || 0) + '</td>'
            + '<td><span class="training-rate-pill">' + (item.summary.completionRate || 0) + '%</span></td>'
            + '<td>' + esc(note) + '</td>'
            + '<td>' + (latest ? fmtTime(latest.updatedAt) : '—') + '</td>'
            + '<td>' + buildFormActions(latest, { unit: item.statsUnit }) + '</td>'
            + '</tr>';
        }).join('') : buildTrainingEmptyTableRow(9, '此分類目前沒有未完成單位', '', 20);
        return {
          label: categoryLabels[category] || category,
          subtitle: units.length ? ('依一級單位彙總，共 ' + units.length + ' 個單位待補件或未送出。') : '此分類目前沒有未完成單位。',
          count: units.length,
          summaryHtml: units.length ? buildTrainingGroupSummary(groupSummary) : '',
          rows
        };
      });

      contentHtml = '<div class="training-dashboard-sections">'
        + buildTrainingTableCard('已完成填報', '填報清單已併入此區，方便直接查看已完成資料與下載。', completedUnits.length + ' 個單位', '<th>統計單位</th><th>填報單位</th><th>編號</th><th>經辦人</th><th>單位總人數</th><th>已完成</th><th>未完成</th><th>達成比率</th><th>完成時間</th><th>操作</th>', completedRows)
        + buildTrainingGroupedSection('未完成填報', '依行政單位、學術單位、中心 / 研究單位分類展開，方便內測與催辦。', incompleteGroups)
        + '</div>';
      summary.total = adminSummary.total;
      summary.draft = adminSummary.draft;
      summary.pending = adminSummary.pending;
      summary.submitted = adminSummary.submitted;
      summary.returned = adminSummary.returned;
    } else {
      const rows = visibleForms.length ? visibleForms.map((form) => {
        const formSummary = form.summary || computeTrainingSummary(form.records || []);
        return '<tr>'
          + '<td>' + renderCopyIdCell(form.id, '教育訓練編號', true) + '</td>'
          + '<td>' + esc(form.unit) + '</td>'
          + '<td>' + trainingStatusBadge(form.status) + '</td>'
          + '<td>' + (formSummary.activeCount || 0) + '</td>'
          + '<td>' + (formSummary.completedCount || 0) + '</td>'
          + '<td><span class="training-rate-pill">' + (formSummary.completionRate || 0) + '%</span></td>'
          + '<td>' + fmtTime(form.updatedAt) + '</td>'
          + '<td>' + buildFormActions(form) + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="8"><div class="empty-state" style="padding:28px"><div class="empty-state-title">尚無填報單</div><div class="empty-state-desc">可先建立草稿，完成流程一後再進入簽核。</div></div></td></tr>';
      contentHtml = buildTrainingTableCard('我的填報單', '流程一完成後內容會先鎖定；若尚未列印簽核表，可在 ' + TRAINING_UNDO_WINDOW_MINUTES + ' 分鐘內撤回重新編修。', '', '<th>編號</th><th>填報單位</th><th>狀態</th><th>單位總人數</th><th>已完成</th><th>達成比率</th><th>最後更新</th><th>操作</th>', rows);
    }
    renderedSummarySignature = serializeTrainingListCounts(summary);

    document.getElementById('app').innerHTML = '<div class="animate-in training-dashboard-page">'
      + '<div class="page-header"><div><h1 class="page-title">資安教育訓練統計</h1><p class="page-subtitle">依流程一填報、流程二列印、流程三上傳簽核表完成整體申報；流程一送出後若尚未列印，可於 ' + TRAINING_UNDO_WINDOW_MINUTES + ' 分鐘內撤回。</p></div>' + toolbar + '</div>'
      + '<div class="stats-grid">'
      + buildTrainingOverviewStats(summary)
      + '</div>'
      + contentHtml
      + '</div>';

      if (!opts.skipRemoteSummary) {
        const shouldPrimeRemoteSummary = !!getTrainingRemoteListSummaryClient() && (!!opts.forceRemoteSummary || !remoteSummary);
        if (shouldPrimeRemoteSummary) {
          primeTrainingRemoteListSummary(accessProfile, { force: !!opts.forceRemoteSummary }).then((nextSummary) => {
            if (!String(window.location.hash || '').startsWith('#training')) return;
          if (serializeTrainingListCounts(nextSummary) === renderedSummarySignature) return;
          renderTraining({ skipSync: true });
        }).catch((error) => {
          console.warn('training list remote summary sync failed', error);
        });
      } else if (!remoteSummary) {
        queueTrainingRemoteListSummaryBootstrap(accessProfile);
      }
    }

    if (!opts.skipSync) {
      syncPromise.then(() => {
        if (!String(window.location.hash || '').startsWith('#training')) return;
        renderTraining({ skipSync: true, forceRemoteSummary: true });
      }).catch((error) => {
        console.warn('training list background sync failed', error);
      });
    }

    document.getElementById('training-export-all')?.addEventListener('click', () => exportTrainingSummaryCsv(visibleForms));
    document.getElementById('training-expand-groups')?.addEventListener('click', () => {
      document.querySelectorAll('.training-group-card').forEach((element) => { element.open = true; });
    });
    document.getElementById('training-collapse-groups')?.addEventListener('click', () => {
      document.querySelectorAll('.training-group-card').forEach((element) => { element.open = false; });
    });
    refreshIcons();
    bindCopyButtons();
  }

  function buildTrainingFillPage(params) {
    const { existing, isUnitLocked, submitLabel, takeoverDraft, unitValue, user } = params;
    return '<div class="animate-in">'
      + '<div class="page-header"><div><h1 class="page-title">填報資安教育訓練統計</h1><p class="page-subtitle">此頁為流程一：逐人填報教育訓練完成情形。送出後會先鎖定；若尚未列印簽核表，可於 ' + TRAINING_UNDO_WINDOW_MINUTES + ' 分鐘內撤回重新編修。</p></div><div class="training-toolbar-actions"><a href="#training" class="btn btn-secondary">← 返回列表</a></div></div>'
      + (existing && existing.status === TRAINING_STATUSES.RETURNED ? '<div class="training-return-banner">' + ic('alert-triangle', 'icon-sm') + ' 退回原因：' + esc(existing.returnReason || '未提供') + '</div>' : '')
      + (takeoverDraft ? '<div class="training-return-banner">' + ic('user-cog', 'icon-sm') + ' 此草稿原送件者為 ' + esc(existing.fillerName || '未指定') + '，本次儲存後將改由目前單位管理員 ' + esc(user.name) + ' 接手編修。</div>' : '')
      + '<div class="training-editor-layout">'
      + '<div class="card training-editor-card"><form id="training-form" data-testid="training-form">'
      + '<div class="form-feedback" id="training-feedback" data-state="idle" aria-live="polite" hidden></div>'
      + '<div class="section-header">' + ic('info', 'icon-sm') + ' 基本資訊</div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label form-required">統計單位（一級）</label><input type="text" class="form-input" id="tr-stats-unit" value="' + esc(existing?.statsUnit || getTrainingStatsUnit(unitValue)) + '" readonly></div><div class="form-group"><label class="form-label form-required">填報單位</label>' + buildUnitCascadeControl('tr-unit', unitValue, isUnitLocked, true) + '</div></div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label form-required">經辦人姓名</label><input type="text" class="form-input" value="' + esc(user.name) + '" readonly></div><div class="form-group"><label class="form-label form-required">聯絡電話</label><input type="text" class="form-input" id="tr-phone" value="' + esc(existing?.submitterPhone || '') + '" placeholder="例如 02-3366-0000 分機 12345" required></div><div class="form-group"><label class="form-label form-required">聯絡電子郵件</label><input type="email" class="form-input" id="tr-email" value="' + esc(existing?.submitterEmail || user.email || '') + '" placeholder="name@g.ntu.edu.tw" required></div></div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label form-required">統計年度</label><input type="text" class="form-input" id="tr-year" value="' + esc(existing?.trainingYear || String(new Date().getFullYear() - 1911)) + '" required></div><div class="form-group"><label class="form-label form-required">填表日期</label><input type="date" class="form-input" id="tr-date" value="' + esc(toDateInputValue(existing?.fillDate) || new Date().toISOString().split('T')[0]) + '" required></div><div class="form-group"><label class="form-label">說明</label><input type="text" class="form-input" value="流程一送出後會先鎖定；若尚未列印簽核表，可於短時間內撤回。" readonly></div></div>'
      + '<div class="section-header">' + ic('users', 'icon-sm') + ' 人員清單</div>'
      + '<div class="training-editor-note">可先多選人員，再一次套用相同在職狀態與' + TRAINING_GENERAL_LABEL + '完成情形。' + TRAINING_PROFESSIONAL_LABEL + '僅在' + TRAINING_INFO_STAFF_LABEL + '為「是」時需要填寫。</div>'
      + '<div class="training-draft-status" id="training-draft-status">' + (existing ? (existing.status === TRAINING_STATUSES.DRAFT ? ('草稿上次儲存：' + fmtTime(existing.updatedAt || existing.createdAt)) : ('退回版本最後更新：' + fmtTime(existing.updatedAt || existing.createdAt))) : '尚未建立草稿') + '</div>'
      + '<div class="training-editor-toolbar"><label class="training-search-box"><span class="training-search-icon">' + ic('search', 'icon-sm') + '</span><input type="search" class="form-input" id="training-search" placeholder="搜尋姓名、本職單位、職稱"></label><label class="training-inline-check"><input type="checkbox" id="training-only-focus"> 只看未完成或未填</label></div>'
      + '<div id="training-summary">' + buildTrainingSummarySection(computeTrainingSummary(existing?.records || [])) + '</div>'
      + '<div class="training-bulk-bar"><div class="training-bulk-count" id="training-selected-count">尚未選取人員</div><div class="training-bulk-controls"><select class="form-select" id="training-bulk-status"><option value="">套用在職狀態</option>' + TRAINING_EMPLOYEE_STATUS.map((status) => '<option value="' + esc(status) + '">' + esc(status) + '</option>').join('') + '</select><div class="training-bulk-general"><span>' + TRAINING_GENERAL_LABEL + '</span><div class="training-binary-group"><button type="button" class="training-binary-btn" data-bulk-general="是">✓</button><button type="button" class="training-binary-btn" data-bulk-general="否">✕</button></div></div><button type="button" class="btn btn-secondary" id="training-apply-bulk">' + ic('check-circle-2', 'icon-sm') + ' 套用到所選人員</button></div></div>'
      + '<div class="training-inline-form"><div class="form-group"><label class="form-label">新增名單外人員</label><input type="text" class="form-input" id="tr-new-name" placeholder="姓名"></div><div class="form-group"><label class="form-label">本職單位</label><input type="text" class="form-input" id="tr-new-unit-name" placeholder="例如 資訊網路組"></div><div class="form-group"><label class="form-label">身分別</label><input type="text" class="form-input" id="tr-new-identity" placeholder="例如 職員／委外"></div><div class="form-group"><label class="form-label">職稱</label><input type="text" class="form-input" id="tr-new-job-title" placeholder="例如 工程師"></div><div class="training-inline-action"><button type="button" class="btn btn-secondary" id="training-add-person">' + ic('user-plus', 'icon-sm') + ' 新增名單</button></div></div>'
      + '<div class="training-editor-note" style="margin-top:-4px">草稿或退回更正狀態下，可刪除自己手動新增的人員；正式名單與他人新增資料仍會保留。</div>'
      + '<div class="training-record-table-wrap">' + buildTrainingTableMarkup('<th style="width:56px"><input type="checkbox" id="training-select-all"></th><th style="width:68px">序號</th><th style="width:180px">姓名 / 來源</th><th style="min-width:180px">本職單位</th><th style="width:140px">身分別</th><th style="width:140px">職稱</th><th style="width:140px">在職狀態</th><th style="width:180px">' + TRAINING_GENERAL_LABEL + '</th><th style="width:180px">' + TRAINING_INFO_STAFF_LABEL + '</th><th style="width:180px">' + TRAINING_PROFESSIONAL_LABEL + '</th><th style="width:160px">判定</th><th style="min-width:240px">備註</th><th style="width:120px">操作</th>', '', { tbodyId: 'training-rows-body' }) + '</div>'
      + '<div class="form-actions"><button type="button" class="btn btn-secondary" id="training-save-draft" data-testid="training-save-draft">' + ic('save', 'icon-sm') + ' 儲存暫存</button><button type="submit" class="btn btn-primary" data-testid="training-submit">' + ic('lock', 'icon-sm') + ' ' + submitLabel + '</button><a href="#training" class="btn btn-ghost">取消</a></div>'
      + '</form></div>'
      + '</div>'
      + '</div>';
  }

  function renderTrainingFill(id) {
    if (!canFillTraining()) {
      navigate('training');
      return;
    }

    const user = getTrainingAccessProfile(currentUser());
    const defaultTrainingYear = String(new Date().getFullYear() - 1911);
    const lockedUserUnit = user.activeUnit || user.primaryUnit || user.unit || '';
    const unitPrefill = id && String(id).startsWith('unit:') ? String(id).slice(5).trim() : '';
    let existing = unitPrefill ? null : (id ? getTrainingForm(id) : null);
    const unitValue = existing ? existing.unit : (unitPrefill || (isAdmin(user) ? (user.primaryUnit || user.activeUnit || user.unit || getTrainingUnits()[0] || '') : (user.activeUnit || user.primaryUnit || user.unit)));
    const isUnitLocked = !!existing || !isAdmin(user);
    const takeoverDraft = !!(existing && existing.fillerUsername && existing.fillerUsername !== user.username && isUnitAdmin());
    let rowsState = sortTrainingRosterEntries(existing ? (existing.records || []) : []);
    const selectedKeys = new Set();
    let bulkGeneralValue = '';
    const submitLabel = existing && existing.status === TRAINING_STATUSES.RETURNED ? '完成更正並進入簽核' : '完成流程一並進入簽核';
    let pendingRosterMutation = null;
    let trainingRosterHydrating = false;
    let trainingRowsRenderToken = 0;
    let trainingRowsDelegatesInstalled = false;
    function hasTemporaryTrainingRows() {
      return Array.isArray(rowsState) && rowsState.some((row) => String(row && row.rosterId || row && row.id || "").trim().toUpperCase().startsWith("TMP-"));
    }
      function getPreservedTrainingRosterRows() {
        const preserved = Array.isArray(rowsState) && rowsState.length ? rowsState.filter((row) => {
          const rosterId = String(row && (row.rosterId || row.id) || '').trim().toUpperCase();
          const source = String(row && row.source || '').trim().toLowerCase();
          return rosterId.startsWith('TMP-') || source === 'manual' || row.manualDraft === true;
        }) : [];
        return preserved.concat(getRememberedTrainingRosterRows());
      }

    document.getElementById('app').innerHTML = buildTrainingFillPage({ existing, isUnitLocked, submitLabel, takeoverDraft, unitValue, user });

    if (!id && !isAdmin(user) && lockedUserUnit) {
      const duplicateDraft = findExistingTrainingFormForUnitYear(lockedUserUnit, defaultTrainingYear);
      if (duplicateDraft && isTrainingVisible(duplicateDraft)) {
        toast('本年度已存在填報單，請至列表繼續編輯或查看，勿重複新增。', 'error');
        navigate(canEditTrainingForm(duplicateDraft) ? ('training-fill/' + duplicateDraft.id) : ('training-detail/' + duplicateDraft.id));
        return;
      }
    }
    if (id && !unitPrefill && !existing) {
      toast('找不到填報單', 'error');
      navigate('training');
      return;
    }
    if (existing && !isTrainingVisible(existing)) {
      toast('您沒有此填報單權限', 'error');
      navigate('training');
      return;
    }
    if (existing && !canEditTrainingForm(existing)) {
      toast('流程一已完成並鎖定，請改至詳情頁繼續簽核流程', 'error');
      navigate('training-detail/' + existing.id);
      return;
    }
    if (unitPrefill && isAdmin() && !isOfficialUnit(getTrainingStatsUnit(unitPrefill))) {
      toast('找不到指定的填報單位', 'error');
      navigate('training');
      return;
    }

    const trainingForm = document.getElementById('training-form');
    const trainingFeedback = document.getElementById('training-feedback');
    const trainingDraftStatus = document.getElementById('training-draft-status');
    const trainingAddPersonButton = document.getElementById('training-add-person');
    const trainingSaveDraftButton = document.getElementById('training-save-draft');
    const trainingSubmitButton = trainingForm.querySelector('[data-testid="training-submit"]');
    clearUnsavedChangesGuard();

    function markTrainingDirty() {
      trainingRowsStateVersion += 1;
      trainingRowsFilterCache = { signature: '', rows: [] };
      setUnsavedChangesGuard(true, '教育訓練填報內容尚未儲存，確定要離開此頁嗎？');
    }

    function shouldIgnoreTrainingDirtyTarget(target) {
      if (!target || typeof target.closest !== 'function') return false;
      if (target.closest('#training-search, #training-only-focus, #training-select-all, #training-bulk-status')) return true;
      if (target.closest('.training-row-check')) return true;
      return false;
    }

    function getRowKey(row, index) {
      return row.rosterId ? ('roster:' + row.rosterId) : ('row:' + index + ':' + row.name);
    }

    function resolveTrainingRowIndex(target) {
      if (!target) return -1;
      const attr = String(target.dataset && target.dataset.idx || '').trim();
      const idx = Number(attr);
      return Number.isFinite(idx) ? idx : -1;
    }

    function installTrainingRowDelegates() {
      if (trainingRowsDelegatesInstalled) return;
      const body = document.getElementById('training-rows-body');
      if (!body) return;
      trainingRowsDelegatesInstalled = true;

      body.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains('training-row-check')) {
          const key = String(target.dataset.key || '').trim();
          if (!key) return;
          if (target.checked) selectedKeys.add(key); else selectedKeys.delete(key);
          updateBulkSelectionText();
          const visibleRowsNow = getFilteredRows();
          const visibleKeys = visibleRowsNow.map(({ row, index }) => getRowKey(row, index));
          const allVisibleSelected = visibleKeys.length && visibleKeys.every((visibleKey) => selectedKeys.has(visibleKey));
          const selectAll = document.getElementById('training-select-all');
          if (selectAll) selectAll.checked = !!allVisibleSelected;
          return;
        }
        if (target.classList.contains('training-row-select')) {
          const idx = resolveTrainingRowIndex(target);
          const row = rowsState[idx];
          if (!row) return;
          const field = String(target.dataset.field || '').trim();
          row[field] = target.value;
          if (field === 'status' && row.status !== '在職') {
            row.completedGeneral = '';
            row.isInfoStaff = '';
            row.completedProfessional = '';
          }
          if (field === 'isInfoStaff') row.completedProfessional = row.isInfoStaff === '否' ? '不適用' : '';
          rowsState[idx] = normalizeTrainingRecordRow(row, document.getElementById('tr-unit').value);
          markTrainingDirty();
          scheduleTrainingRowsRender();
          return;
        }
        if (target.classList.contains('training-row-meta')) {
          const idx = resolveTrainingRowIndex(target);
          const field = String(target.dataset.field || '').trim();
          if (!rowsState[idx] || !field) return;
          rowsState[idx] = normalizeTrainingRecordRow({ ...rowsState[idx], [field]: target.value }, document.getElementById('tr-unit').value);
          persistEditableRosterRow(rowsState[idx]);
          rowsState = sortTrainingRosterEntries(rowsState);
          markTrainingDirty();
          scheduleTrainingRowsRender();
        }
      });

      body.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains('training-row-meta')) {
          const idx = resolveTrainingRowIndex(target);
          const field = String(target.dataset.field || '').trim();
          if (!rowsState[idx] || !field) return;
          rowsState[idx][field] = target.value;
          markTrainingDirty();
          return;
        }
        if (target.classList.contains('training-row-note')) {
          const idx = resolveTrainingRowIndex(target);
          if (!rowsState[idx]) return;
          rowsState[idx].note = target.value;
          markTrainingDirty();
        }
      });

      body.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const binaryButton = target.closest('.training-binary-btn[data-field]');
        if (binaryButton instanceof HTMLElement && body.contains(binaryButton)) {
          const idx = resolveTrainingRowIndex(binaryButton);
          const row = rowsState[idx];
          if (!row) return;
          const field = String(binaryButton.dataset.field || '').trim();
          const value = String(binaryButton.dataset.value || '').trim();
          row[field] = row[field] === value ? '' : value;
          if (field === 'completedProfessional' && row.isInfoStaff !== '是') row.completedProfessional = row.isInfoStaff === '否' ? '不適用' : '';
          rowsState[idx] = normalizeTrainingRecordRow(row, document.getElementById('tr-unit').value);
          markTrainingDirty();
          scheduleTrainingRowsRender();
          return;
        }
        const deleteButton = target.closest('.training-row-delete');
        if (deleteButton instanceof HTMLElement && body.contains(deleteButton)) {
          const idx = resolveTrainingRowIndex(deleteButton);
          const row = rowsState[idx];
          if (!row) return;
          if (!canDeleteTrainingEditableRow(row, existing, user)) {
            toast('\u76ee\u524d\u53ea\u80fd\u522a\u9664\u81ea\u5df1\u624b\u52d5\u65b0\u589e\u7684\u4eba\u54e1', 'error');
            return;
          }
          const confirmed = await openConfirmDialog('確定刪除「' + row.name + '」嗎？這會一併從此單位名單移除。', { title: '確認刪除列', confirmText: '確認刪除', cancelText: '取消' });
          if (!confirmed) return;
          forgetTrainingManualRosterRow(row);
          if (row.rosterId) deleteTrainingRosterPerson(row.rosterId);
          rowsState = rowsState.filter((_, rowIndex) => rowIndex !== idx);
          selectedKeys.clear();
          markTrainingDirty();
          scheduleTrainingRowsRender();
          toast('已刪除「' + row.name + '」');
        }
      });
    }

    function setTrainingFeedback(state, title, details) {
      const lines = Array.isArray(details) ? details.filter(Boolean) : [];
      trainingFeedback.dataset.state = state || 'info';
      trainingFeedback.hidden = false;
      trainingFeedback.innerHTML = '<div class="form-feedback-title">' + esc(title || '') + '</div>' + (lines.length ? '<div class="form-feedback-list">' + lines.map((line) => '<span>' + esc(line) + '</span>').join('') + '</div>' : '');
    }

    function clearTrainingFeedback() {
      trainingFeedback.hidden = true;
      trainingFeedback.dataset.state = 'idle';
      trainingFeedback.innerHTML = '';
    }

    function setTrainingMutationPending(isPending) {
      if (trainingAddPersonButton) trainingAddPersonButton.disabled = !!isPending;
      if (trainingSaveDraftButton) trainingSaveDraftButton.disabled = !!isPending;
      if (trainingSubmitButton) trainingSubmitButton.disabled = !!isPending;
    }

    function registerRosterMutation(task) {
      const wrapped = Promise.resolve()
        .then(task)
        .finally(() => {
          if (pendingRosterMutation === wrapped) {
            pendingRosterMutation = null;
            setTrainingMutationPending(false);
          }
        });
      pendingRosterMutation = wrapped;
      setTrainingMutationPending(true);
      return wrapped;
    }

    function readPendingManualRosterPayload(currentUnit) {
      return {
        currentUnit: currentUnit || document.getElementById('tr-unit').value,
        name: document.getElementById('tr-new-name').value.trim(),
        unitName: document.getElementById('tr-new-unit-name').value.trim() || getTrainingJobUnit(currentUnit || document.getElementById('tr-unit').value),
        identity: document.getElementById('tr-new-identity').value.trim(),
        jobTitle: document.getElementById('tr-new-job-title').value.trim()
      };
    }

    function replaceTrainingRosterRowsByKey(rows, draftRow) {
      const next = [];
      let replaced = false;
      const draftName = String(draftRow && draftRow.name || '').trim().toLowerCase();
      const draftUnit = String(draftRow && draftRow.unit || '').trim();
      const draftTempId = String(draftRow && draftRow.rosterId || draftRow && draftRow.id || '').trim();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const rowName = String(row && row.name || '').trim().toLowerCase();
        const rowUnit = String(row && row.unit || '').trim();
        const rowId = String(row && row.rosterId || row && row.id || '').trim();
        const shouldReplace = !!draftRow && (
          (draftTempId && rowId === draftTempId)
          || (draftName && rowName === draftName && (!draftUnit || rowUnit === draftUnit))
        );
        if (shouldReplace) {
          if (!replaced) {
            next.push(draftRow);
            replaced = true;
          }
          return;
        }
        next.push(row);
      });
      if (draftRow && !replaced) next.push(draftRow);
      return sortTrainingRosterEntries(next);
    }

    async function commitManualRosterInput(options) {
      const opts = options || {};
      const payload = readPendingManualRosterPayload(opts.currentUnit);
      if (!payload.name) return null;
      return registerRosterMutation(async () => {
        const createdAt = new Date().toISOString();
        const tempRosterId = 'TMP-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const draftRoster = normalizeTrainingRecordRow({
          id: tempRosterId,
          rosterId: tempRosterId,
          unit: payload.currentUnit,
          statsUnit: getTrainingStatsUnit(payload.currentUnit),
          unitName: payload.unitName,
          name: payload.name,
          identity: payload.identity,
          jobTitle: payload.jobTitle,
          source: 'manual',
          createdBy: user.name,
          createdByUsername: user.username,
          createdAt,
          status: '',
          completedGeneral: '',
          isInfoStaff: '',
          completedProfessional: '',
          note: ''
        }, payload.currentUnit);
        draftRoster.manualDraft = true;
        rememberTrainingManualRosterRow(draftRoster);
        rowsState = replaceTrainingRosterRowsByKey(rowsState, draftRoster);
        selectedKeys.clear();
        ['tr-new-name', 'tr-new-unit-name', 'tr-new-identity', 'tr-new-job-title'].forEach((idName) => {
          document.getElementById(idName).value = '';
        });
        markTrainingDirty();
        renderRows();
        let result;
        try {
          result = await submitTrainingRosterBatchUpsert({
            items: [{
              name: payload.name,
              unit: payload.currentUnit,
              statsUnit: getTrainingStatsUnit(payload.currentUnit),
              unitName: payload.unitName,
              identity: payload.identity,
              jobTitle: payload.jobTitle,
              source: 'manual',
              createdBy: user.name,
              createdByUsername: user.username,
              actorName: user.name,
              actorUsername: user.username
            }],
            actorName: user.name,
            actorUsername: user.username
          });
        } catch (error) {
          markTrainingDirty();
          renderRows();
          throw error;
        }
        const roster = result && Array.isArray(result.items) && result.items[0] && String(result.items[0].id || '').trim()
          ? result.items[0]
          : null;
        const syncedRoster = roster || (await (async () => {
          try {
            await syncTrainingRostersFromM365({ silent: true });
          } catch (error) {
            console.warn('training roster post-sync failed', error);
          }
          return getAllTrainingRosters().find((row) => row.unit === payload.currentUnit && row.name.toLowerCase() === payload.name.toLowerCase()) || null;
        })());
        if (!syncedRoster) {
          throw new Error('教育訓練名單已送出，但後端同步結果未返回，請重新整理後確認。');
        }
        clearTrainingRosterRemotePageCache();
        dispatchTrainingCacheInvalidation('training-rosters', 'training-roster-manual-upsert');
        const nextManualRow = normalizeTrainingRecordRow({
          ...syncedRoster,
          rosterId: syncedRoster.id,
          unit: payload.currentUnit,
          statsUnit: syncedRoster.statsUnit || getTrainingStatsUnit(payload.currentUnit),
          unitName: syncedRoster.unitName || payload.unitName,
          identity: syncedRoster.identity || payload.identity,
          jobTitle: syncedRoster.jobTitle || payload.jobTitle,
          source: 'manual',
          status: '',
          completedGeneral: '',
          isInfoStaff: '',
          completedProfessional: '',
          note: ''
        }, payload.currentUnit);
        nextManualRow.manualDraft = true;
        forgetTrainingManualRosterRow(tempRosterId);
          rememberTrainingManualRosterRow(nextManualRow);
          rowsState = replaceTrainingRosterRowsByKey(rowsState, nextManualRow);
        renderRows();
        if (!opts.silentSuccess) {
          showTrainingRepositoryFallback(result, '已新增「' + payload.name + '」到名單');
        }
        return { payload, result, syncedRoster };
      });
    }

    function updateTrainingDraftStatus(item) {
      if (!item) {
        trainingDraftStatus.textContent = '尚未建立草稿';
        trainingDraftStatus.classList.remove('is-saved');
        return;
      }
      trainingDraftStatus.textContent = (item.status === TRAINING_STATUSES.RETURNED ? '退回版本最後更新：' : '草稿上次儲存：') + fmtTime(item.updatedAt || item.createdAt);
      trainingDraftStatus.classList.add('is-saved');
    }

    function syncStatsUnitField(unit) {
      document.getElementById('tr-stats-unit').value = getTrainingStatsUnit(unit);
    }

    function openExistingTrainingForm(form, message) {
      if (!form) return false;
      setTrainingFeedback('error', message, ['本年度同一填報單位只能維護一份教育訓練統計。']);
      toast(message, 'error');
      clearUnsavedChangesGuard();
      navigate(canEditTrainingForm(form) ? ('training-fill/' + form.id) : ('training-detail/' + form.id));
      return true;
    }

    function persistEditableRosterRow(row) {
      if (!row || !row.rosterId || !canDeleteTrainingEditableRow(row, existing, user)) return;
      updateTrainingRosterPerson(row.rosterId, {
        unitName: row.unitName,
        identity: row.identity,
        jobTitle: row.jobTitle
      });
    }

    function renderSummary() {
      document.getElementById('training-summary').innerHTML = buildTrainingSummarySection(computeTrainingSummary(rowsState));
    }

    function updateBulkSelectionText() {
      const count = selectedKeys.size;
      document.getElementById('training-selected-count').textContent = count ? ('已選取 ' + count + ' 位人員') : '尚未選取人員';
      document.querySelectorAll('[data-bulk-general]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.bulkGeneral === bulkGeneralValue);
      });
    }

    function getFilteredRows() {
      const keyword = String(document.getElementById('training-search')?.value || '').trim().toLowerCase();
      const focusOnly = !!document.getElementById('training-only-focus')?.checked;
      const signature = [
        String(trainingRowsStateVersion || 0),
        String(rowsState.length || 0),
        keyword,
        focusOnly ? '1' : '0'
      ].join('::');
      if (trainingRowsFilterCache.signature === signature && Array.isArray(trainingRowsFilterCache.rows)) {
        return trainingRowsFilterCache.rows;
      }
      const result = [];
      for (let index = 0; index < rowsState.length; index += 1) {
        const row = rowsState[index];
        if (!row) continue;
        const haystack = String(row.searchText || [row.name, row.unitName, row.identity, row.jobTitle].join(' ').toLowerCase());
        if (keyword && !haystack.includes(keyword)) continue;
        if (focusOnly && isTrainingRecordComplete(row) && isTrainingRecordReadyForSubmit(row)) continue;
        result.push({ row, index });
      }
      trainingRowsFilterCache = { signature, rows: result };
      return result;
    }

    function renderRows() {
      const body = document.getElementById('training-rows-body');
      pruneTrainingManualRosterDraftsAgainstRows(rowsState);
      const preservedRows = getPreservedTrainingRosterRows();
      if (preservedRows.length) {
        let nextRows = Array.isArray(rowsState) ? rowsState.slice() : [];
        preservedRows.forEach((row) => {
          nextRows = replaceTrainingRosterRowsByKey(nextRows, row);
        });
        rowsState = nextRows;
      }
      const visibleRows = getFilteredRows();
      installTrainingRowDelegates();
      syncTrainingManualRosterDraftCacheFromRows(rowsState);
      if (!rowsState.length) {
        trainingRowsRenderToken += 1;
        body.innerHTML = buildTrainingEmptyTableRow(13, '此單位尚未建立名單', '請由管理者匯入名單，或由單位管理員新增名單外人員。', 28);
        renderSummary();
        updateBulkSelectionText();
        document.getElementById('training-select-all').checked = false;
        return;
      }
      if (!visibleRows.length) {
        trainingRowsRenderToken += 1;
        body.innerHTML = buildTrainingEmptyTableRow(13, '沒有符合條件的人員', '請調整搜尋條件或取消「只看未完成或未填」。', 28);
        renderSummary();
        updateBulkSelectionText();
        document.getElementById('training-select-all').checked = false;
        return;
      }

      const visibleKeys = visibleRows.map(({ row, index }) => getRowKey(row, index));
      const allVisibleSelected = visibleKeys.length && visibleKeys.every((key) => selectedKeys.has(key));
      document.getElementById('training-select-all').checked = !!allVisibleSelected;
      renderSummary();
      updateBulkSelectionText();
      const token = ++trainingRowsRenderToken;
      const chunkSize = visibleRows.length <= 400
        ? Math.max(1, visibleRows.length)
        : (visibleRows.length > 1500 ? 80 : (visibleRows.length > 600 ? 120 : 180));
      const renderChunk = (rowsSlice) => rowsSlice.map(({ row, index }, visibleIndex) => buildTrainingFillRow({
        row,
        index,
        visibleIndex,
        key: getRowKey(row, index),
        selected: selectedKeys.has(getRowKey(row, index)),
        canDeleteRow: canDeleteTrainingEditableRow(row, existing, user)
      })).join('');
      body.innerHTML = renderChunk(visibleRows.slice(0, chunkSize));
      if (visibleRows.length <= chunkSize) return;
      body.insertAdjacentHTML('beforeend', '<tr class="training-rows-loading"><td colspan="13"><div class="empty-state" style="padding:16px"><div class="empty-state-title">正在載入更多名單</div><div class="empty-state-desc">名單筆數較多，系統會分批顯示以維持操作流暢。</div></div></td></tr>');
      const loadingRow = body.querySelector('.training-rows-loading');
      const paintRest = async () => {
        for (let start = chunkSize; start < visibleRows.length; start += chunkSize) {
          if (token !== trainingRowsRenderToken) return;
          const slice = visibleRows.slice(start, start + chunkSize);
          if (loadingRow && loadingRow.isConnected) {
            loadingRow.insertAdjacentHTML('beforebegin', renderChunk(slice));
          } else {
            body.insertAdjacentHTML('beforeend', renderChunk(slice));
          }
          await new Promise((resolve) => {
            if (typeof window.requestAnimationFrame === 'function') {
              window.requestAnimationFrame(() => resolve());
              return;
            }
            window.setTimeout(resolve, 0);
          });
        }
        if (token !== trainingRowsRenderToken) return;
        loadingRow?.remove();
      };
      paintRest().catch((error) => {
        console.warn('training row chunk render failed', error);
      });
    }

    let trainingRowsRenderPending = false;
    function scheduleTrainingRowsRender() {
      if (trainingRowsRenderPending) return;
      trainingRowsRenderPending = true;
      const run = function () {
        trainingRowsRenderPending = false;
        if (String(window.location.hash || '').indexOf('#training-fill') !== 0) return;
        if (!document.getElementById('training-rows-body')) return;
        renderRows();
      };
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 250 });
      } else {
        window.setTimeout(run, 0);
      }
    }

    function collectRecords() {
      const unit = document.getElementById('tr-unit').value;
      return rowsState.map((row) => normalizeTrainingRecordRow({
        ...row,
        unit,
        statsUnit: getTrainingStatsUnit(unit),
        completedProfessional: getStoredTrainingProfessionalValue(row)
      }, unit));
    }

    function validateSubmitPayload(records) {
      const unit = document.getElementById('tr-unit').value;
      const phone = document.getElementById('tr-phone').value.trim();
      const email = document.getElementById('tr-email').value.trim();
      const year = document.getElementById('tr-year').value.trim();
      const fillDate = document.getElementById('tr-date').value;
      if (!unit) return { message: '請先選擇填報單位', field: document.getElementById('tr-unit') };
      if (!phone) return { message: '請填寫聯絡電話', field: document.getElementById('tr-phone') };
      if (!email) return { message: '請填寫聯絡電子郵件', field: document.getElementById('tr-email') };
      if (!/^.+@.+\..+$/.test(email)) return { message: '聯絡電子郵件格式不正確', field: document.getElementById('tr-email') };
      if (!year) return { message: '請填寫統計年度', field: document.getElementById('tr-year') };
      if (!fillDate) return { message: '請填寫填表日期', field: document.getElementById('tr-date') };
      if (!records.length) return { message: '至少需要一筆受訓人員資料', field: document.getElementById('training-add-person') };
      const invalid = records.find((record) => !isTrainingRecordReadyForSubmit(record));
      if (invalid) return { message: '請先完成 ' + (invalid.name || '受訓人員') + ' 的訓練欄位', field: document.getElementById('training-rows-body') };
      return null;
    }

    async function saveTrainingForm(targetStatus) {
      if (pendingRosterMutation) {
        try {
          await pendingRosterMutation;
        } catch (error) {
          const message = String(error && error.message || error || '新增名單失敗');
          setTrainingFeedback('error', message, ['請先修正新增名單錯誤，再儲存教育訓練填報。']);
          toast(message, 'error');
          return;
        }
      }
      const now = new Date().toISOString();
      const currentUnit = document.getElementById('tr-unit').value;
      const pendingManualRoster = readPendingManualRosterPayload(currentUnit);
      if (pendingManualRoster.name) {
        try {
          await commitManualRosterInput({ currentUnit, silentSuccess: true });
        } catch (error) {
          const message = String(error && error.message || error || '新增名單失敗');
          setTrainingFeedback('error', message, ['請先完成名單外人員新增，再儲存教育訓練填報。']);
          toast(message, 'error');
          return;
        }
      }
      const trainingYearValue = document.getElementById('tr-year').value.trim() || String(new Date().getFullYear() - 1911);
      const fillDateValue = document.getElementById('tr-date').value;
      const duplicateForm = findExistingTrainingFormForUnitYear(currentUnit, trainingYearValue, existing?.id);
      if (duplicateForm) {
        openExistingTrainingForm(duplicateForm, '本年度已存在填報單，請至列表繼續編輯或查看，勿重複新增。');
        return;
      }
      const formId = existing ? existing.id : generateTrainingFormId(currentUnit, trainingYearValue, fillDateValue);
      const records = collectRecords();
      if (targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF) {
        const validationError = validateSubmitPayload(records);
        if (validationError) {
          setTrainingFeedback('error', validationError.message, ['流程一完成前，請先補齊聯絡資訊與人員欄位。']);
          toast(validationError.message, 'error');
          return;
        }
      }
      const history = [...(existing?.history || [])];
      if (takeoverDraft) history.push({ time: now, action: '單位管理員接手編修草稿，送件者改為目前編修者', user: user.name });
      history.push({ time: now, action: targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF ? '完成流程一並鎖定填報內容' : '儲存教育訓練統計暫存', user: user.name });
      const payload = {
        id: formId,
        unit: currentUnit,
        statsUnit: getTrainingStatsUnit(currentUnit),
        fillerName: user.name,
        fillerUsername: user.username,
        submitterPhone: document.getElementById('tr-phone').value.trim(),
        submitterEmail: document.getElementById('tr-email').value.trim(),
        fillDate: fillDateValue,
        trainingYear: trainingYearValue,
        status: targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF ? TRAINING_STATUSES.PENDING_SIGNOFF : ((existing && existing.status === TRAINING_STATUSES.RETURNED) ? TRAINING_STATUSES.RETURNED : TRAINING_STATUSES.DRAFT),
        records,
        summary: computeTrainingSummary(records),
        signedFiles: existing?.signedFiles || [],
        returnReason: targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF ? '' : (existing?.returnReason || ''),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        stepOneSubmittedAt: targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF ? now : (existing?.stepOneSubmittedAt || null),
        printedAt: existing?.printedAt || null,
        signoffUploadedAt: existing?.signoffUploadedAt || null,
        submittedAt: existing?.submittedAt || null,
        history
      };
      const result = targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF
        ? await submitTrainingStepOne(payload)
        : await submitTrainingDraft(payload);
      dispatchTrainingCacheInvalidationScopes(['training-forms', 'training-summary', 'training-dashboard'], targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF ? 'training-step-one-submit' : 'training-draft-save');
      existing = (result && result.item) || getTrainingForm(formId) || existing;
      updateTrainingDraftStatus(existing);
      clearUnsavedChangesGuard();
      if (targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF) {
        showTrainingRepositoryFallback(result, '填報單 ' + formId + ' 已完成流程一並鎖定');
        navigate('training-detail/' + formId);
        return;
      }
      showTrainingRepositoryFallback(result, '填報單 ' + formId + ' 已儲存暫存');
      if (typeof window !== 'undefined' && window.history) {
        const nextHash = '#training-fill/' + encodeURIComponent(formId);
        if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
      }
    }

    document.getElementById('training-save-draft').addEventListener('click', async () => {
      await runWithBusyState('\u6b63\u5728\u5132\u5b58\u6559\u80b2\u8a13\u7df4\u8349\u7a3f\u2026', async () => {
        await saveTrainingForm(TRAINING_STATUSES.DRAFT);
      });
    });
    trainingForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await runWithBusyState('\u6b63\u5728\u9001\u51fa\u6559\u80b2\u8a13\u7df4\u6d41\u7a0b\u4e00\u2026', async () => {
        await saveTrainingForm(TRAINING_STATUSES.PENDING_SIGNOFF);
      });
    });
    let trainingSearchTimer = null;
    const scheduleTrainingSearchRender = function () {
      if (trainingSearchTimer) window.clearTimeout(trainingSearchTimer);
      trainingSearchTimer = window.setTimeout(function () {
        trainingSearchTimer = null;
        renderRows();
      }, 120);
    };
    document.getElementById('training-search').addEventListener('input', scheduleTrainingSearchRender);
    document.getElementById('training-only-focus').addEventListener('change', renderRows);
    trainingForm.addEventListener('input', (event) => {
      clearTrainingFeedback();
      if (!shouldIgnoreTrainingDirtyTarget(event.target)) markTrainingDirty();
    });
    trainingForm.addEventListener('change', (event) => {
      clearTrainingFeedback();
      if (!shouldIgnoreTrainingDirtyTarget(event.target)) markTrainingDirty();
    });
    document.getElementById('training-select-all').addEventListener('change', (event) => {
      getFilteredRows().forEach(({ row, index }) => {
        const key = getRowKey(row, index);
        if (event.target.checked) selectedKeys.add(key); else selectedKeys.delete(key);
      });
      renderRows();
    });
    document.querySelectorAll('[data-bulk-general]').forEach((button) => {
      button.addEventListener('click', () => {
        bulkGeneralValue = bulkGeneralValue === button.dataset.bulkGeneral ? '' : button.dataset.bulkGeneral;
        updateBulkSelectionText();
      });
    });
    document.getElementById('training-apply-bulk').addEventListener('click', () => {
      if (!selectedKeys.size) {
        toast('請先選取要套用的人員', 'error');
        return;
      }
      const bulkStatus = document.getElementById('training-bulk-status').value;
      if (!bulkStatus && !bulkGeneralValue) {
        toast('請先選擇要套用的內容', 'error');
        return;
      }
      rowsState = rowsState.map((row, index) => {
        const key = getRowKey(row, index);
        if (!selectedKeys.has(key)) return row;
        const nextRow = { ...row };
        if (bulkStatus) nextRow.status = bulkStatus;
        if (nextRow.status !== '在職') {
          nextRow.completedGeneral = '';
          nextRow.isInfoStaff = '';
          nextRow.completedProfessional = '';
        } else if (bulkGeneralValue) {
          nextRow.completedGeneral = bulkGeneralValue;
        }
          const normalized = normalizeTrainingRecordRow(nextRow, document.getElementById('tr-unit').value);
          if (normalized.source === 'manual') rememberTrainingManualRosterRow(normalized);
          return normalized;
        });
      markTrainingDirty();
      toast('已套用批次設定');
      renderRows();
    });

    trainingAddPersonButton.addEventListener('click', async () => {
      const currentUnit = document.getElementById('tr-unit').value;
      if (!readPendingManualRosterPayload(currentUnit).name) {
        toast('請輸入要新增的人員姓名', 'error');
        return;
      }
      try {
        await commitManualRosterInput({ currentUnit });
      } catch (error) {
        toast(error && error.message ? error.message : '新增名單失敗', 'error');
      }
    });

    initUnitCascade('tr-unit', unitValue, { disabled: isUnitLocked });
    if (!isUnitLocked) {
      document.getElementById('tr-unit').addEventListener('change', (event) => {
        syncStatsUnitField(event.target.value);
        rowsState = mergeTrainingRows(event.target.value, rowsState);
        selectedKeys.clear();
        markTrainingDirty();
        renderRows();
      });
    }

    syncStatsUnitField(unitValue);
    updateTrainingDraftStatus(existing);
    clearTrainingFeedback();
      const immediateUnit = document.getElementById('tr-unit') ? document.getElementById('tr-unit').value : unitValue;
      rowsState = mergeTrainingRows(immediateUnit, [
        ...(existing ? (existing.records || []) : []),
        ...getPreservedTrainingRosterRows()
      ]);
      const forceRosterSync = !rowsState.length;
      trainingRowsStateVersion += 1;
      trainingRowsFilterCache = { signature: '', rows: [] };
      trainingRosterHydrating = false;
      scheduleTrainingRowsRender();
      refreshIcons();

      const syncPromise = Promise.allSettled([
        syncTrainingRostersFromM365({ silent: true, force: forceRosterSync }),
        syncTrainingFormsFromM365({ silent: true })
      ]);
    syncPromise.then((syncResults) => {
      syncResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(index === 0 ? 'training roster bootstrap sync failed' : 'training form bootstrap sync failed', result.reason);
        }
      });
      if (!document.getElementById('training-form')) return;
      const activeUnit = document.getElementById('tr-unit') ? document.getElementById('tr-unit').value : unitValue;
      if (!id && !isAdmin() && lockedUserUnit) {
        const duplicateDraft = findExistingTrainingFormForUnitYear(lockedUserUnit, defaultTrainingYear);
        if (duplicateDraft && isTrainingVisible(duplicateDraft)) {
          toast('本年度已存在填報單，請至列表繼續編輯或查看，勿重複新增。', 'error');
          navigate(canEditTrainingForm(duplicateDraft) ? ('training-fill/' + duplicateDraft.id) : ('training-detail/' + duplicateDraft.id));
          return;
        }
      }
      if (id && !unitPrefill && !existing) {
        existing = id ? getTrainingForm(id) : existing;
      }
      if (existing && !isTrainingVisible(existing)) {
        toast('您沒有此填報單權限', 'error');
        navigate('training');
        return;
      }
      if (existing && !canEditTrainingForm(existing)) {
        toast('流程一已完成並鎖定，請改至詳情頁繼續簽核流程', 'error');
        navigate('training-detail/' + existing.id);
        return;
      }
      if (hasTemporaryTrainingRows() || pendingRosterMutation) {
        trainingRosterHydrating = false;
        scheduleTrainingRowsRender();
        return;
      }
        rowsState = mergeTrainingRows(activeUnit, [
          ...(existing ? (existing.records || []) : []),
          ...getPreservedTrainingRosterRows()
        ]);
        trainingRowsStateVersion += 1;
        trainingRowsFilterCache = { signature: '', rows: [] };
        trainingRosterHydrating = false;
        updateTrainingDraftStatus(existing);
        syncStatsUnitField(activeUnit);
      scheduleTrainingRowsRender();
    }).catch((error) => {
      trainingRosterHydrating = false;
      console.warn('training fill background sync failed', error);
    });
  }

  function renderTrainingDetail(id) {
    const form = getTrainingForm(id);
    if (!form) {
      document.getElementById('app').innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + ic('help-circle', 'icon-lg') + '</div><div class="empty-state-title">找不到教育訓練填報單</div><a href="#training" class="btn btn-primary" style="margin-top:16px">返回列表</a></div>';
      return;
    }
    if (!isTrainingVisible(form)) {
      navigate('training');
      toast('您沒有權限檢視此填報單', 'error');
      return;
    }
    cleanupRenderedAttachmentUrls();

    const user = getTrainingAccessProfile(currentUser());
    const canManage = !!user && !isViewer(user) && (isAdmin(user) || hasUnitAccess(form.unit, user) || form.fillerUsername === user.username);
    const canUndo = canUndoTrainingForm(form, user);
    const undoRemainingMinutes = canUndo ? getTrainingUndoRemainingMinutes(form) : 0;
    let filesState = (form.signedFiles || []).map((entry) => applyTrainingSignoffFileName(entry, form));
    clearUnsavedChangesGuard();

    function markTrainingDetailDirty() {
      setUnsavedChangesGuard(true, '簽核掃描檔尚未送出，確定要離開此頁嗎？');
    }

    const summary = form.summary || computeTrainingSummary(form.records || []);
    const detailRows = buildTrainingDetailRows(form.records || []);
    const timeline = (form.history || []).slice().reverse().map((item) => '<div class="timeline-item"><div class="timeline-time">' + fmtTime(item.time) + '</div><div class="timeline-text">' + esc(item.action) + ' · ' + esc(item.user || '系統') + '</div></div>').join('') || '<div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無歷程紀錄</div></div>';
      const actions = ['<button type="button" class="btn btn-secondary" id="training-export-detail">' + ic('download', 'icon-sm') + ' 匯出明細 CSV</button>', '<button type="button" class="btn btn-secondary" id="training-print-detail">' + ic('printer', 'icon-sm') + ' 列印簽核表</button>', '<a href="#training" class="btn btn-secondary">← 返回列表</a>'];
    if (canEditTrainingForm(form)) actions.unshift('<a href="#training-fill/' + form.id + '" class="btn btn-primary">' + ic('edit-3', 'icon-sm') + ' 繼續填報</a>');
    if (canUndo) actions.unshift('<button type="button" class="btn btn-warning" id="training-undo-step-one">' + ic('rotate-ccw', 'icon-sm') + ' 撤回流程一</button>');
    if (isAdmin() && form.status === TRAINING_STATUSES.SUBMITTED) actions.unshift('<button type="button" class="btn btn-danger" data-action="training.return" data-id="' + esc(form.id) + '">' + ic('corner-up-left', 'icon-sm') + ' 退回更正</button>');

    const stepCards = buildTrainingStepCards([
      ['流程一', '依人員填報教育訓練完成情形', form.stepOneSubmittedAt ? '已完成並鎖定' : '待完成', form.stepOneSubmittedAt ? (canUndo ? ('可於剩餘 ' + undoRemainingMinutes + ' 分鐘內撤回；列印簽核表後將不可撤回') : fmtTime(form.stepOneSubmittedAt)) : '完成後才可進入簽核'],
      ['流程二', '列印簽核表', form.printedAt ? '已列印' : (form.status === TRAINING_STATUSES.DRAFT || form.status === TRAINING_STATUSES.RETURNED ? '待流程一完成' : '待列印'), form.printedAt ? fmtTime(form.printedAt) : '請列印後交主管簽核'],
      ['流程三', '上傳簽核掃描檔', form.status === TRAINING_STATUSES.SUBMITTED ? '已完成填報' : ((filesState.length || form.signoffUploadedAt) ? '已上傳，待完成送件' : '待上傳'), form.status === TRAINING_STATUSES.SUBMITTED ? fmtTime(form.submittedAt || form.updatedAt) : (form.signoffUploadedAt ? fmtTime(form.signoffUploadedAt) : '上傳後完成整體流程')]
    ]);

    const uploadSection = (form.status === TRAINING_STATUSES.PENDING_SIGNOFF && canManage)
      ? buildTrainingSignoffUploadCard()
      : '';

    document.getElementById('app').innerHTML = '<div class="animate-in">'
      + '<div class="detail-header"><div><div class="detail-id detail-id-with-copy"><span>' + esc(form.id) + ' · ' + esc(form.trainingYear) + ' 年度</span>' + renderCopyIdButton(form.id, '教育訓練編號') + '</div><h1 class="detail-title">資安教育訓練統計 — ' + esc(form.statsUnit || getTrainingStatsUnit(form.unit)) + '</h1><div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">' + ic('building-2', 'icon-xs') + '</span>' + esc(form.unit) + '</span><span class="detail-meta-item"><span class="detail-meta-icon">' + ic('user', 'icon-xs') + '</span>' + esc(form.fillerName) + '</span><span class="detail-meta-item"><span class="detail-meta-icon">' + ic('calendar', 'icon-xs') + '</span>' + fmt(form.fillDate) + '</span>' + trainingStatusBadge(form.status) + '</div></div><div class="training-toolbar-actions">' + actions.join('') + '</div></div>'
      + (form.status === TRAINING_STATUSES.RETURNED ? '<div class="training-return-banner">' + ic('alert-triangle', 'icon-sm') + ' 退回原因：' + esc(form.returnReason || '未提供') + '</div>' : '')
      + (canUndo ? '<div class="training-undo-banner">' + ic('rotate-ccw', 'icon-sm') + '<div><strong>流程一剛完成，仍可撤回。</strong><div>尚未列印簽核表前，可在剩餘 ' + undoRemainingMinutes + ' 分鐘內撤回，回到可編修的草稿狀態。</div></div></div>' : '')
      + buildTrainingCard('流程概況', '<div class="training-step-grid">' + stepCards + '</div>')
      + buildTrainingCard('統計摘要', buildTrainingSummarySection(summary), { style: 'margin-top:20px' })
      + '<div class="panel-grid-two panel-grid-spaced">'
      + buildTrainingCard('填報資訊', buildTrainingDetailGrid([
        { label: '統計單位', value: form.statsUnit || getTrainingStatsUnit(form.unit) },
        { label: '填報單位', value: form.unit },
        { label: '經辦人', value: form.fillerName },
        { label: '聯絡電話', value: form.submitterPhone || '—' },
        { label: '聯絡電子郵件', value: form.submitterEmail || '—' },
        { label: '整體完成時間', value: form.submittedAt ? fmtTime(form.submittedAt) : '—' }
      ]))
      + buildTrainingCard('簽核掃描檔', buildTrainingFileSlot('training-signed-files-readonly', 'training-signoff-files'))
      + '</div>'
      + uploadSection
      + buildTrainingCard('逐人明細', buildTrainingTableMarkup('<th>姓名</th><th>本職單位</th><th>身分別</th><th>職稱</th><th>在職狀態</th><th>' + TRAINING_GENERAL_LABEL + '</th><th>' + TRAINING_INFO_STAFF_LABEL + '</th><th>' + TRAINING_PROFESSIONAL_LABEL + '</th><th>判定</th><th>備註</th>', detailRows), { style: 'margin-top:20px;padding:0;overflow:hidden', headerStyle: 'padding:16px 20px' })
      + buildTrainingCard('歷程紀錄', '<div class="timeline">' + timeline + '</div>', { style: 'margin-top:20px' })
      + '</div>';

    function renderSignedFiles(targetId, editable) {
      const wrap = document.getElementById(targetId);
      if (!wrap) return;
      renderAttachmentList(wrap, filesState, {
        editable,
        emptyText: '尚未上傳簽核掃描檔',
        fileIconHtml: '<div class="file-pdf-icon">' + ic('file-box') + '</div>',
        itemClass: 'file-preview-item training-file-card',
        actionsClass: 'training-file-actions',
        onRemove: function (index) {
          const removed = filesState.splice(Number(index), 1)[0];
          revokeTransientUploadEntry(removed);
          const targetInput = document.getElementById('training-file-input');
          if (targetInput) targetInput.value = '';
          markTrainingDetailDirty();
          renderSignedFiles(targetId, true);
          renderSignedFiles('training-signed-files-readonly', false);
        }
      });
      refreshIcons();
    }

    function handleFiles(files) {
      const batch = prepareUploadBatch(filesState, files, {
        fileLabel: '簽核掃描檔',
        maxSize: 5 * 1024 * 1024,
        maxSizeLabel: '5MB',
        allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
        allowedMimeTypes: ['image/*', 'application/pdf']
      });
      batch.errors.forEach((message) => toast(message, 'error'));
      batch.accepted.forEach(({ file, meta }) => {
        filesState.push(applyTrainingSignoffFileName(createTransientUploadEntry(file, meta, {
          prefix: 'trn',
          scope: 'training-signoff',
          ownerId: form.id
        }), form));
      });
      if (batch.accepted.length) markTrainingDetailDirty();
      renderSignedFiles('training-file-previews', true);
      renderSignedFiles('training-signed-files-readonly', false);
      const targetInput = document.getElementById('training-file-input');
      if (targetInput) targetInput.value = '';
    }

    document.getElementById('training-export-detail')?.addEventListener('click', () => exportTrainingDetailCsv(form));
    document.getElementById('training-undo-step-one')?.addEventListener('click', () => handleTrainingUndo(form.id));
    document.getElementById('training-print-detail')?.addEventListener('click', () => {
      (async () => {
        let printPayload = form;
        if (form.status === TRAINING_STATUSES.PENDING_SIGNOFF && !form.printedAt) {
          const now = new Date().toISOString();
          const payload = {
            ...form,
            printedAt: now,
            updatedAt: now,
            history: [...(form.history || []), { time: now, action: '列印簽核表', user: currentUser().name }],
            actorName: currentUser().name,
            actorUsername: currentUser().username
          };
          try {
            const result = await submitTrainingMarkPrinted(payload);
            dispatchTrainingCacheInvalidationScopes(['training-forms', 'training-summary', 'training-dashboard'], 'training-mark-printed');
            const nextForm = (result && result.item) || getTrainingForm(form.id) || payload;
            showTrainingRepositoryFallback(result, '已記錄簽核表列印時間');
            form.printedAt = nextForm.printedAt || now;
            form.updatedAt = nextForm.updatedAt || now;
            form.history = nextForm.history || payload.history;
            printPayload = nextForm;
            renderTrainingDetail(form.id);
          } catch (error) {
            toast(error && error.message ? error.message : '列印紀錄寫入失敗', 'error');
            return;
          }
        }
        printTrainingSheet(printPayload);
      })();
    });
    if (form.status === TRAINING_STATUSES.PENDING_SIGNOFF && canManage) {
      const fileInput = document.getElementById('training-file-input');
      const uploadZone = document.getElementById('training-upload-zone');
      fileInput.addEventListener('change', (event) => handleFiles(event.target.files));
      uploadZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        uploadZone.classList.add('dragover');
      });
      uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
      uploadZone.addEventListener('drop', (event) => {
        event.preventDefault();
        uploadZone.classList.remove('dragover');
        handleFiles(event.dataTransfer.files);
      });
      document.getElementById('training-finalize-submit').addEventListener('click', async () => {
        if (!filesState.length) {
          toast('\u8acb\u5148\u4e0a\u50b3\u7c3d\u6838\u6383\u63cf\u6a94', 'error');
          return;
        }
        await runWithBusyState('\u6b63\u5728\u4e0a\u50b3\u7c3d\u6838\u6383\u63cf\u6a94\u4e26\u5b8c\u6210\u6d41\u7a0b\u4e09\u2026', async () => {
          const now = new Date().toISOString();
          const latestForm = getTrainingForm(form.id) || form;
          const persistedFiles = (await persistUploadedEntries(filesState, {
            prefix: 'trn',
            scope: 'training-signoff',
            ownerId: form.id,
            buildFileName: function (_descriptor, uploadEntry) {
              return buildTrainingSignoffFileName(form, uploadEntry);
            }
          })).map((entry) => applyTrainingSignoffFileName(entry, form));
          clearUnsavedChangesGuard();
          const result = await submitTrainingFinalize({
            ...latestForm,
            id: form.id,
            status: TRAINING_STATUSES.SUBMITTED,
            signedFiles: persistedFiles,
            signoffUploadedAt: now,
            submittedAt: now,
            updatedAt: now,
            history: [...(latestForm.history || []), { time: now, action: '\u4e0a\u50b3\u7c3d\u6838\u6383\u63cf\u6a94\u4e26\u5b8c\u6210\u6574\u9ad4\u586b\u5831', user: currentUser().name }]
          });
          dispatchTrainingCacheInvalidationScopes(['training-forms', 'training-summary', 'training-dashboard'], 'training-finalize');
          showTrainingRepositoryFallback(result, '\u5df2\u5b8c\u6210\u6d41\u7a0b\u4e09\uff0c\u6574\u9ad4\u586b\u5831\u7d50\u675f');
          renderTrainingDetail(form.id);
        });
      });
      renderSignedFiles('training-file-previews', true);
    }
    renderSignedFiles('training-signed-files-readonly', false);
    refreshIcons();
    bindCopyButtons();
  }

  function captureTrainingRosterFocusState() {
    const active = document.activeElement;
    if (!active || typeof active.closest !== 'function') return null;
    const row = active.closest('tr[data-roster-id]');
    if (!row) return null;
    const rows = Array.from(document.querySelectorAll('tr[data-roster-id]'));
    const rowIndex = rows.indexOf(row);
    const rowId = String(row.dataset.rosterId || '').trim();
    if (!rowId) return null;
    const state = { rowId, rowIndex };
    if (active.matches('.training-row-check')) {
      state.kind = 'check';
      return state;
    }
    if (active.matches('.training-row-select')) {
      state.kind = 'select';
      state.field = String(active.dataset.field || '').trim();
      return state;
    }
    if (active.matches('.training-row-meta')) {
      state.kind = 'meta';
      state.field = String(active.dataset.field || '').trim();
      state.selectionStart = Number.isInteger(active.selectionStart) ? active.selectionStart : null;
      state.selectionEnd = Number.isInteger(active.selectionEnd) ? active.selectionEnd : null;
      state.selectionDirection = active.selectionDirection || 'none';
      return state;
    }
    if (active.matches('.training-row-note')) {
      state.kind = 'note';
      state.selectionStart = Number.isInteger(active.selectionStart) ? active.selectionStart : null;
      state.selectionEnd = Number.isInteger(active.selectionEnd) ? active.selectionEnd : null;
      state.selectionDirection = active.selectionDirection || 'none';
      return state;
    }
    if (active.matches('.training-binary-btn[data-field]')) {
      state.kind = 'binary';
      state.field = String(active.dataset.field || '').trim();
      state.value = String(active.dataset.value || '').trim();
      return state;
    }
    if (active.matches('button[data-testid^="training-roster-delete-"]')) {
      state.kind = 'delete';
      lastTrainingRosterFocusState = { ...state };
      return state;
    }
    lastTrainingRosterFocusState = { ...state };
    return state;
  }

  function installTrainingRosterFocusTracker() {
    if (trainingRosterFocusTrackerInstalled || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    document.addEventListener('focusin', function () {
      const state = captureTrainingRosterFocusState();
      if (state) {
        lastTrainingRosterFocusState = { ...state };
      }
    }, true);
    trainingRosterFocusTrackerInstalled = true;
  }

  function focusTrainingRosterElement(element, state) {
    if (!element) return false;
    try {
      if (typeof element.focus === 'function') {
        element.focus({ preventScroll: true });
      } else if (typeof element.focus === 'function') {
        element.focus();
      }
    } catch (_) {
      try {
        element.focus();
      } catch (_) {
        // ignore focus failures
      }
    }
    if (!state) return true;
    if ((state.kind === 'meta' || state.kind === 'note') && typeof element.setSelectionRange === 'function'
      && Number.isInteger(state.selectionStart) && Number.isInteger(state.selectionEnd)) {
      try {
        element.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection || 'none');
      } catch (_) {
        // ignore selection failures
      }
    }
    return true;
  }

  function restoreTrainingRosterFocusState(state) {
    if (!state) return false;
    const rows = Array.from(document.querySelectorAll('tr[data-roster-id]'));
    if (!rows.length) return false;
    const rowId = String(state.rowId || '').trim();
    let row = rowId ? rows.find((entry) => String(entry.dataset.rosterId || '').trim() === rowId) : null;
    if (!row && Number.isInteger(state.rowIndex) && state.rowIndex >= 0 && state.rowIndex < rows.length) {
      row = rows[state.rowIndex];
    }
    if (!row) row = rows[0];
    if (!row) return false;
    const groupCard = row.closest('.training-roster-group-card');
    if (groupCard && !groupCard.open) {
      groupCard.open = true;
    }
    row.classList.add('training-roster-row-focused');

    let target = null;
    const field = String(state.field || '').trim();
    switch (state.kind) {
      case 'check':
        target = row.querySelector('.training-row-check');
        break;
      case 'select':
        target = Array.from(row.querySelectorAll('.training-row-select')).find((element) => String(element.dataset.field || '').trim() === field) || null;
        break;
      case 'meta':
        target = Array.from(row.querySelectorAll('.training-row-meta')).find((element) => String(element.dataset.field || '').trim() === field) || null;
        break;
      case 'note':
        target = row.querySelector('.training-row-note');
        break;
      case 'binary':
        target = Array.from(row.querySelectorAll('.training-binary-btn[data-field]')).find((element) => String(element.dataset.field || '').trim() === field && String(element.dataset.value || '').trim() === String(state.value || '').trim()) || null;
        break;
      case 'delete':
        target = row.querySelector('button[data-testid^="training-roster-delete-"]');
        break;
      default:
        target = row.querySelector('.training-row-delete')
          || row.querySelector('.training-row-check')
          || row.querySelector('.training-row-select')
          || row.querySelector('.training-row-note');
        break;
    }
    if (!target) return false;
    const focused = focusTrainingRosterElement(target, state);
    if (focused) {
      lastTrainingRosterFocusState = { ...state };
    }
    return focused;
  }

  function focusTrainingRosterRows(options) {
    const opts = options || {};
    const ids = new Set((Array.isArray(opts.rosterIds) ? opts.rosterIds : []).map((value) => String(value || '').trim()).filter(Boolean));
    const names = new Set((Array.isArray(opts.rosterNames) ? opts.rosterNames : []).map((value) => String(value || '').trim()).filter(Boolean));
    const units = new Set((Array.isArray(opts.rosterUnits) ? opts.rosterUnits : []).map((value) => String(value || '').trim()).filter(Boolean));
    if (!ids.size && !names.size) return;
    const matchedRows = Array.from(document.querySelectorAll('tr[data-roster-id]')).filter((row) => {
      const rosterId = String(row.dataset.rosterId || '').trim();
      const rosterName = String(row.dataset.rosterName || '').trim();
      const rosterUnit = String(row.dataset.rosterUnit || '').trim();
      if (ids.size && ids.has(rosterId)) return true;
      if (names.size && names.has(rosterName)) {
        if (!units.size) return true;
        return units.has(rosterUnit);
      }
      return false;
    });
    if (!matchedRows.length) return;
    matchedRows.forEach((row) => row.classList.add('training-roster-row-focused'));
    matchedRows.forEach((row) => {
      const groupCard = row.closest('.training-roster-group-card');
      if (groupCard && !groupCard.open) groupCard.open = true;
    });
    matchedRows[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    const preferredFocus = matchedRows[0].querySelector('button[data-testid^="training-roster-delete-"]')
      || matchedRows[0].querySelector('.training-row-check')
      || matchedRows[0].querySelector('.training-row-select')
      || matchedRows[0].querySelector('.training-row-note');
    const state = {
      kind: 'delete',
      rowId: String(matchedRows[0].dataset.rosterId || '').trim(),
      rowIndex: Array.from(document.querySelectorAll('tr[data-roster-id]')).indexOf(matchedRows[0])
    };
    if (focusTrainingRosterElement(preferredFocus, state)) {
      lastTrainingRosterFocusState = { ...state };
    }
  }

  function buildTrainingRosterPage(summary, groupsHtml, hiddenCount, selectedCount, pagerHtml) {
    const hiddenNote = hiddenCount
      ? '<div class="training-editor-note" style="margin-bottom:16px">已略過 ' + hiddenCount + ' 筆異常名單資料，請由管理者檢查來源內容。</div>'
      : '';
    const rosterActions = '<div class="card training-table-card"><div class="card-header"><div><span class="card-title">名單管理</span><div class="training-table-subtitle">依單位分區展開檢視；單位管理員只能新增名單外人員，不能刪除原名單。</div></div><div class="training-group-header-actions"><span class="training-inline-status" id="training-roster-selected-count">' + esc(selectedCount > 0 ? ('已選取 ' + selectedCount + ' 筆') : '尚未選取人員') + '</span><button type="button" class="btn btn-secondary btn-sm" id="training-roster-select-all">' + ic('check-square', 'icon-sm') + ' 全選</button><button type="button" class="btn btn-secondary btn-sm" id="training-roster-clear-selection">' + ic('square', 'icon-sm') + ' 清除選取</button><button type="button" class="btn btn-danger btn-sm" id="training-roster-delete-selected" ' + (selectedCount ? '' : 'disabled') + '>' + ic('trash-2', 'icon-sm') + ' 刪除所選</button><button type="button" class="btn btn-primary" id="training-roster-toggle-import">' + ic('upload', 'icon-sm') + ' 匯入名單</button></div></div>' + (pagerHtml || '') + '<div id="training-roster-import-wrap" style="display:none">' + buildTrainingRosterImportCard() + '</div><div class="training-group-stack" id="training-roster-groups">' + (groupsHtml || buildTrainingEmptyTableRow(9, '尚無名單資料', '', 24)) + '</div></div>';
    return '<div class="animate-in">'
      + '<div class="page-header"><div><h1 class="page-title">教育訓練名單管理</h1><p class="page-subtitle">管理者可匯入正式名單；單位管理員只能新增名單外人員，不能刪除原名單。</p></div><div><a href="#training" class="btn btn-secondary">← 返回統計</a></div></div>'
      + '<div class="stats-grid">'
      + buildTrainingRosterStats(summary)
      + '</div>'
      + hiddenNote
      + rosterActions
      + '</div>';
  }

  function buildTrainingRosterImportCard() {
    return '<div class="card training-editor-card" style="margin-bottom:20px"><form id="training-import-form"><div class="section-header">' + ic('upload', 'icon-sm') + ' 匯入單位名單</div><div class="training-editor-note">' + buildTrainingRosterImportNote() + '</div><div class="form-row"><div class="form-group"><label class="form-label">單位</label>' + buildUnitCascadeControl('training-import-unit', '', false, false) + '<div class="form-hint">可先指定單位當作預設值；若 Excel 內已有「填報單位」欄位，系統會優先使用檔案中的單位。</div></div><div class="form-group"><label class="form-label">Excel 檔案</label><label class="training-file-input"><input type="file" id="training-import-file" accept=".xlsx,.xls,.csv,.tsv"><span class="training-file-input-copy" id="training-import-file-copy">' + buildTrainingRosterFileCopy('') + '</span></label></div></div><div class="form-group"><label class="form-label">格式範例</label><textarea class="form-textarea" rows="4" readonly>' + buildTrainingRosterSampleCsv() + '</textarea></div><div class="form-group"><label class="form-label">或直接貼上內容</label><textarea class="form-textarea" id="training-import-names" rows="8" placeholder="姓名,本職單位,身分別,職稱"></textarea></div><div class="form-actions"><button type="submit" class="btn btn-primary" data-testid="training-import-submit">' + ic('upload', 'icon-sm') + ' 匯入名單</button></div></form></div>';
  }

  async function renderTrainingRoster(options) {
    const opts = options || {};
    if (!isAdmin()) {
      navigate('training');
      toast('僅管理者可管理名單', 'error');
      return;
    }
    installTrainingRosterFocusTracker();
    const focusState = opts.restoreFocusState
      ? { ...opts.restoreFocusState }
      : (captureTrainingRosterFocusState() || (lastTrainingRosterFocusState ? { ...lastTrainingRosterFocusState } : null));
    const selectedRosterIds = new Set(
      (Array.isArray(opts.selectedRosterIds) ? opts.selectedRosterIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    );
    const useRemoteRosters = canUseRemoteTrainingRosterPaging();
    const syncPromise = (opts.skipSync || useRemoteRosters)
      ? Promise.resolve()
      : scheduleDeferredPromise(() => syncTrainingRostersFromM365({ silent: true }), 250).catch((error) => {
        console.warn('training roster page sync failed', error);
      });

    let snapshot;
    let rosters;
    let hiddenCount;
    let summary;
    let rosterPage = null;
    let remotePageSignature = '';

    if (useRemoteRosters) {
      const remoteFilters = opts.remoteFilters || trainingRosterRemotePageState.filters;
      const remotePageResult = await loadTrainingRosterRemotePage(remoteFilters, { force: !!opts.forceRemotePage });
      remotePageSignature = getTrainingRosterRemoteSignature(remotePageResult.filters);
      trainingRosterRemotePageState = {
        filters: remotePageResult.filters,
        page: remotePageResult.page,
        items: Array.isArray(remotePageResult.items) ? remotePageResult.items.slice() : [],
        total: remotePageResult.total,
        signature: remotePageSignature
      };
      rosterPage = remotePageResult.page;
      snapshot = getTrainingRosterSnapshot(remotePageResult.items, 'remote::' + remotePageSignature);
      rosters = snapshot.rosters;
      hiddenCount = snapshot.hiddenCount;
      summary = {
        total: Number(rosterPage && rosterPage.total || 0),
        imported: rosters.filter((row) => row && row.source === 'import').length,
        manual: rosters.filter((row) => row && row.source === 'manual').length,
        paged: true
      };
    } else {
      const rawRosters = getAllTrainingRosters();
      snapshot = getTrainingRosterSnapshot(rawRosters);
      rosters = snapshot.rosters;
      hiddenCount = snapshot.hiddenCount;
      summary = {
        ...(snapshot.summary || { total: 0, imported: 0, manual: 0 }),
        paged: false
      };
    }

    const groups = groupTrainingRosterEntries(
      rosters,
      useRemoteRosters ? ('remote::' + remotePageSignature) : undefined
    );
    const rosterCount = Array.isArray(rosters) ? rosters.length : 0;
    const useChunkedRosterRender = rosterCount > 120 || groups.length > 24;
    const deferRosterGroups = useChunkedRosterRender && !opts.deferFullRender;
    const selectedSignature = Array.from(selectedRosterIds.values()).sort().join(',');
    const rosterRenderSignature = [
      snapshot.token || '',
      String(snapshot.rawLength || rosterCount || 0),
      String(hiddenCount || 0),
      useChunkedRosterRender ? '1' : '0',
      opts.deferFullRender ? '1' : '0',
      selectedSignature,
      useRemoteRosters ? remotePageSignature : 'local'
    ].join('::');
    const currentApp = document.getElementById('app');
    const selectedCountLabel = trainingRosterDomCache.selectedCountLabel || document.getElementById('training-roster-selected-count');
    const deleteSelectedButton = trainingRosterDomCache.deleteSelectedButton || document.getElementById('training-roster-delete-selected');
    if (opts.skipSync && currentApp && currentApp.dataset.trainingRosterRenderSignature === rosterRenderSignature && trainingRosterRenderCache.signature === rosterRenderSignature && String(window.location.hash || '').startsWith('#training-roster')) {
      syncRosterSelectionDom();
      if (focusState) restoreTrainingRosterFocusState(focusState);
      return;
    }
    const importedPreviewHtml = (opts.rosterNames || opts.rosterIds)
      ? buildTrainingRosterImportPreview(opts, selectedRosterIds)
      : '';
    const initialGroupCount = useChunkedRosterRender && opts.deferFullRender
      ? Math.min(3, groups.length)
      : 0;
    const groupMarkupSignature = [
      snapshot.token || '',
      String(snapshot.rawLength || rosterCount || 0),
      String(hiddenCount || 0),
      useChunkedRosterRender ? '1' : '0',
      opts.deferFullRender ? '1' : '0',
      String(initialGroupCount || 0),
      useRemoteRosters ? remotePageSignature : 'local'
    ].join('::');
    const chunkedGroupsHtml = trainingRosterGroupMarkupCache.signature === groupMarkupSignature
      ? trainingRosterGroupMarkupCache.html
      : (useChunkedRosterRender
        ? buildTrainingRosterGroupChunkHtml(groups, selectedRosterIds, 0, initialGroupCount)
        : buildTrainingRosterRowsFromGroups(groups, selectedRosterIds));
    const loadingChunkHtml = useChunkedRosterRender && initialGroupCount < groups.length
      ? '<div class="empty-state training-roster-chunk-loading" style="padding:28px"><div class="empty-state-title">正在載入大量名單</div><div class="empty-state-desc">系統會先顯示摘要，名單區塊將在背景完成展開與排序。</div></div>'
      : '';
    trainingRosterGroupMarkupCache = {
      signature: groupMarkupSignature,
      html: chunkedGroupsHtml
    };
    const groupsHtml = deferRosterGroups
      ? importedPreviewHtml + loadingChunkHtml
      : importedPreviewHtml + chunkedGroupsHtml + loadingChunkHtml;
    const pagerHtml = useRemoteRosters ? renderTrainingRosterPager(rosterPage) : '';
    const pageShellSignature = importedPreviewHtml
      ? ''
      : [
          rosterRenderSignature,
          groupMarkupSignature,
          String(hiddenCount || 0),
          String(selectedRosterIds.size || 0),
          useRemoteRosters ? JSON.stringify([
            Number(rosterPage && rosterPage.offset || 0),
            Number(rosterPage && rosterPage.limit || 0),
            Number(rosterPage && rosterPage.total || 0),
            Number(rosterPage && rosterPage.currentPage || 0),
            Number(rosterPage && rosterPage.pageCount || 0)
          ]) : 'local'
        ].join('::');
    const pageHtml = pageShellSignature && trainingRosterPageShellCache.signature === pageShellSignature
      ? trainingRosterPageShellCache.html
      : buildTrainingRosterPage(summary, groupsHtml, hiddenCount, selectedRosterIds.size, pagerHtml);
    if (pageShellSignature) {
      trainingRosterPageShellCache = {
        signature: pageShellSignature,
        html: pageHtml
      };
    }
    if (currentApp) {
      currentApp.innerHTML = pageHtml;
      currentApp.dataset.trainingRosterRenderSignature = rosterRenderSignature;
      refreshTrainingRosterDomCache(currentApp, rosterRenderSignature);
      syncRosterSelectionDom();
    }
    trainingRosterRenderCache = {
      signature: rosterRenderSignature,
      selectedSignature,
      defer: !!deferRosterGroups
    };

    if (useChunkedRosterRender && opts.deferFullRender && initialGroupCount < groups.length) {
      const chunkSize = Math.max(4, Math.min(12, Math.ceil(groups.length / 8)));
      const appendRosterChunk = function (startIndex) {
        if (String(window.location.hash || '').indexOf('#training-roster') !== 0) return;
        const groupsContainer = document.getElementById('training-roster-groups');
        if (!groupsContainer) return;
        const endIndex = Math.min(startIndex + chunkSize, groups.length);
        const chunkHtml = buildTrainingRosterGroupChunkHtml(groups, selectedRosterIds, startIndex, endIndex);
        if (!chunkHtml) return;
        const loadingNode = groupsContainer.querySelector('.training-roster-chunk-loading');
        if (loadingNode) loadingNode.remove();
        groupsContainer.insertAdjacentHTML('beforeend', chunkHtml);
        refreshTrainingRosterDomCache(currentApp, rosterRenderSignature);
        syncRosterSelectionDom();
        if (endIndex < groups.length) {
          const next = function () {
            appendRosterChunk(endIndex);
          };
          if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(next, { timeout: 250 });
            return;
          }
          if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            window.setTimeout(next, 60);
            return;
          }
          next();
          return;
        }
        const finalLoadingNode = groupsContainer.querySelector('.training-roster-chunk-loading');
        if (finalLoadingNode) finalLoadingNode.remove();
        refreshTrainingRosterDomCache(currentApp, rosterRenderSignature);
        syncRosterSelectionDom();
      };
      appendRosterChunk(initialGroupCount);
    }

    if (deferRosterGroups) {
      const rerender = function () {
        if (String(window.location.hash || '').indexOf('#training-roster') !== 0) return;
        renderTrainingRoster({
          ...opts,
          skipSync: true,
          deferFullRender: true,
          restoreFocusState: focusState,
          selectedRosterIds: Array.from(selectedRosterIds)
        });
      };
      if (syncPromise && typeof syncPromise.then === 'function') {
        syncPromise.then(() => {
          if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(rerender, { timeout: 250 });
            return;
          }
          if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            window.setTimeout(rerender, 250);
            return;
          }
          rerender();
        }).catch((error) => {
          console.warn('training roster background rerender failed', error);
        });
      }
      return;
    }

    const toggleBtn = document.getElementById('training-roster-toggle-import');
    const importWrap = document.getElementById('training-roster-import-wrap');
    const keywordInput = document.getElementById('training-roster-keyword');
    const statsUnitSelect = document.getElementById('training-roster-stats-unit');
    const unitSelect = document.getElementById('training-roster-unit');
    const sourceSelect = document.getElementById('training-roster-source');
    const pageLimitSelect = document.getElementById('training-roster-page-limit');
    const rerenderRemoteRosterPage = (nextFilters) => {
      renderTrainingRoster({
        skipSync: true,
        deferFullRender: true,
        restoreFocusState: focusState,
        selectedRosterIds: Array.from(selectedRosterIds),
        remoteFilters: normalizeTrainingRosterPageFilters({
          ...(trainingRosterRemotePageState.filters || {}),
          ...(nextFilters || {})
        })
      });
    };
    if (toggleBtn && importWrap) {
      toggleBtn.addEventListener('click', () => {
        const visible = importWrap.style.display !== 'none';
        importWrap.style.display = visible ? 'none' : '';
      });
    }
    if (useRemoteRosters && keywordInput) {
      let keywordTimer = null;
      keywordInput.addEventListener('input', () => {
        if (keywordTimer) window.clearTimeout(keywordTimer);
        keywordTimer = window.setTimeout(() => {
          keywordTimer = null;
          rerenderRemoteRosterPage({
            q: keywordInput.value || '',
            offset: '0'
          });
        }, 220);
      });
    }
    if (useRemoteRosters && sourceSelect) {
      sourceSelect.addEventListener('change', () => {
        rerenderRemoteRosterPage({
          source: sourceSelect.value || '',
          offset: '0'
        });
      });
    }
    if (useRemoteRosters && statsUnitSelect) {
      statsUnitSelect.addEventListener('change', () => {
        rerenderRemoteRosterPage({
          statsUnit: statsUnitSelect.value || '',
          unit: '',
          offset: '0'
        });
      });
    }
    if (useRemoteRosters && unitSelect) {
      unitSelect.addEventListener('change', () => {
        const selectedUnit = unitSelect.value || '';
        rerenderRemoteRosterPage({
          unit: selectedUnit,
          statsUnit: selectedUnit ? String(getTrainingStatsUnit(selectedUnit) || '').trim() : String((statsUnitSelect && statsUnitSelect.value) || '').trim(),
          offset: '0'
        });
      });
    }
    if (useRemoteRosters) {
      const pager = getTrainingPagerModule();
      if (pager && typeof pager.bindPagerControls === 'function') {
        pager.bindPagerControls({
          idPrefix: 'training-roster',
          page: trainingRosterRemotePageState.page,
          defaultLimit: TRAINING_ROSTER_DEFAULT_PAGE_LIMIT,
          onChange: (delta) => {
            rerenderRemoteRosterPage({
              limit: String((delta && delta.limit) || trainingRosterRemotePageState.page.limit || TRAINING_ROSTER_DEFAULT_PAGE_LIMIT),
              offset: String((delta && delta.offset) || 0)
            });
          }
        });
      }
    }
    const selectAllButton = document.getElementById('training-roster-select-all');
    const clearSelectionButton = document.getElementById('training-roster-clear-selection');
    const groupsContainer = document.getElementById('training-roster-groups');

    function getRosterRowsInDom() {
      if (trainingRosterDomCache.signature === rosterRenderSignature && Array.isArray(trainingRosterDomCache.rows)) {
        return trainingRosterDomCache.rows;
      }
      return Array.from(document.querySelectorAll('tr[data-roster-id]'));
    }

    function syncRosterSelectionDom() {
      const rows = getRosterRowsInDom();
      rows.forEach((row) => {
        const rosterId = String(row.dataset.rosterId || '').trim();
        const checked = selectedRosterIds.has(rosterId);
        row.classList.toggle('is-selected', checked);
        const checkbox = row.querySelector('.training-roster-check');
        if (checkbox) checkbox.checked = checked;
      });
      const groupCheckboxes = trainingRosterDomCache.signature === rosterRenderSignature && Array.isArray(trainingRosterDomCache.groupSelectAll)
        ? trainingRosterDomCache.groupSelectAll
        : Array.from(document.querySelectorAll('.training-roster-group-select-all'));
      groupCheckboxes.forEach((checkbox) => {
        const groupKey = String(checkbox.dataset.rosterGroup || '').trim();
        const groupRows = trainingRosterDomCache.signature === rosterRenderSignature && trainingRosterDomCache.rowsByGroup instanceof Map
          ? (trainingRosterDomCache.rowsByGroup.get(groupKey) || [])
          : rows.filter((row) => String(row.dataset.rosterGroup || '').trim() === groupKey);
        const checkedCount = groupRows.filter((row) => selectedRosterIds.has(String(row.dataset.rosterId || '').trim())).length;
        checkbox.checked = !!groupRows.length && checkedCount === groupRows.length;
        checkbox.indeterminate = checkedCount > 0 && checkedCount < groupRows.length;
      });
      if (selectedCountLabel) {
        selectedCountLabel.textContent = selectedRosterIds.size ? ('已選取 ' + selectedRosterIds.size + ' 筆') : '尚未選取人員';
      }
      if (deleteSelectedButton) {
        deleteSelectedButton.disabled = !selectedRosterIds.size;
      }
    }

    async function deleteSelectedRosters(selectedIds) {
      const ids = Array.from(new Set((selectedIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
      if (!ids.length) {
        toast('請先選取要刪除的人員', 'error');
        return;
      }
      const focusState = captureTrainingRosterFocusState() || (lastTrainingRosterFocusState ? { ...lastTrainingRosterFocusState } : null);
      const previewRows = rosters.filter((row) => ids.includes(String(row.id || '').trim()));
      const remainingRows = rosters.filter((row) => !ids.includes(String(row.id || '').trim()));
      const preferredFocusRow = remainingRows.length
        ? remainingRows[Math.min(
          Number.isInteger(focusState && focusState.rowIndex) ? Math.max(0, focusState.rowIndex) : 0,
          remainingRows.length - 1
        )]
        : null;
      const previewText = previewRows.slice(0, 3).map((row) => row.name).filter(Boolean).join('、');
      const confirmed = await openConfirmDialog('確定刪除已選取的 ' + ids.length + ' 位人員嗎？' + (previewText ? ('（' + previewText + (previewRows.length > 3 ? '…' : '') + '）') : '') + ' 已填報的歷史資料不會被刪除。', { title: '確認刪除所選', confirmText: '確認刪除', cancelText: '取消' });
      if (!confirmed) return;
      await runWithBusyState('正在刪除所選名單…', async () => {
        const result = await submitTrainingRosterBatchDelete({
          ids,
          actorName: currentUser()?.name || '',
          actorUsername: currentUser()?.username || ''
        });
        try {
          await syncTrainingRostersFromM365({ silent: true, force: true });
        } catch (error) {
          console.warn('training roster delete post-sync failed', error);
        }
        clearTrainingRosterRemotePageCache();
        dispatchTrainingCacheInvalidation('training-rosters', 'training-roster-batch-delete');
        selectedRosterIds.clear();
        await renderTrainingRoster({
          skipSync: true,
          deferFullRender: true,
          restoreFocusState: preferredFocusRow ? {
            kind: 'delete',
            rowId: String(preferredFocusRow.id || '').trim(),
            rowIndex: remainingRows.indexOf(preferredFocusRow)
          } : focusState,
          selectedRosterIds: []
        });
        if (preferredFocusRow) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, 350);
          });
          focusTrainingRosterRows({
            rosterIds: [preferredFocusRow.id],
            rosterNames: [preferredFocusRow.name],
            rosterUnits: [preferredFocusRow.unit]
          });
        }
        const deletedCount = Number(result && result.deletedCount || ids.length);
        toast(deletedCount > 1 ? ('名單已刪除，並同步清理重複資料 ' + deletedCount + ' 筆') : '名單已刪除', 'success');
        if (result && result.warning) {
          toast(result.warning, 'info');
        }
      });
    }

    syncRosterSelectionDom();

    if (selectAllButton) {
      selectAllButton.addEventListener('click', () => {
        getRosterRowsInDom().forEach((row) => {
          const rosterId = String(row.dataset.rosterId || '').trim();
          if (rosterId) selectedRosterIds.add(rosterId);
        });
        syncRosterSelectionDom();
      });
    }

    if (groupsContainer && !groupsContainer.dataset.trainingRosterDelegatesInstalled) {
      groupsContainer.dataset.trainingRosterDelegatesInstalled = '1';
      groupsContainer.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const groupSelectAll = target.closest('.training-roster-group-select-all');
        if (groupSelectAll instanceof HTMLInputElement) {
          const groupKey = String(groupSelectAll.dataset.rosterGroup || '').trim();
          const rows = getRosterRowsInDom().filter((row) => String(row.dataset.rosterGroup || '').trim() === groupKey);
          rows.forEach((row) => {
            const rosterId = String(row.dataset.rosterId || '').trim();
            if (!rosterId) return;
            if (groupSelectAll.checked) selectedRosterIds.add(rosterId); else selectedRosterIds.delete(rosterId);
          });
          syncRosterSelectionDom();
          return;
        }
        const rowCheck = target.closest('.training-roster-check');
        if (rowCheck instanceof HTMLInputElement) {
          const rosterId = String(rowCheck.dataset.rosterId || '').trim();
          if (!rosterId) return;
          if (rowCheck.checked) selectedRosterIds.add(rosterId); else selectedRosterIds.delete(rosterId);
          syncRosterSelectionDom();
        }
      });
      groupsContainer.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const deleteButton = target.closest('button[data-testid^="training-roster-delete-"]');
        if (!(deleteButton instanceof HTMLButtonElement)) return;
        event.preventDefault();
        event.stopPropagation();
        const rosterId = String(deleteButton.dataset.id || '').trim();
        if (!rosterId) return;
        await deleteSelectedRosters([rosterId]);
      });
    }

    if (!opts.skipSync && !useRemoteRosters) {
      syncPromise.then(() => {
        if (!document.getElementById('training-roster-groups')) return;
        if (!String(window.location.hash || '').startsWith('#training-roster')) return;
        renderTrainingRoster({
          skipSync: true,
          restoreFocusState: focusState,
          selectedRosterIds: Array.from(selectedRosterIds)
        });
      });
    }

    if (clearSelectionButton) {
      clearSelectionButton.addEventListener('click', () => {
        selectedRosterIds.clear();
        syncRosterSelectionDom();
      });
    }

    if (deleteSelectedButton) {
      deleteSelectedButton.addEventListener('click', () => {
        deleteSelectedRosters(Array.from(selectedRosterIds));
      });
    }

    initUnitCascade('training-import-unit', '', { disabled: false, excludeUnits: ['學校分部總辦事處'] });
    const fileInput = document.getElementById('training-import-file');
    const fileCopy = document.getElementById('training-import-file-copy');
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        fileCopy.innerHTML = buildTrainingRosterFileCopy('');
        return;
      }
      const batch = prepareUploadBatch([], [file], {
        fileLabel: '名單匯入檔',
        maxSize: 10 * 1024 * 1024,
        maxSizeLabel: '10MB',
        allowedExtensions: ['xlsx', 'xls', 'csv', 'tsv']
      });
      if (!batch.accepted.length) {
        batch.errors.forEach((message) => toast(message, 'error'));
        fileInput.value = '';
        fileCopy.innerHTML = buildTrainingRosterFileCopy('');
        return;
      }
      fileCopy.innerHTML = buildTrainingRosterFileCopy(file.name || '');
    });
      document.getElementById('training-import-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await runWithBusyState('\u6b63\u5728\u532f\u5165\u6559\u80b2\u8a13\u7df4\u540d\u55ae\u2026', async () => {
      const unit = document.getElementById('training-import-unit').value;
      const raw = document.getElementById('training-import-names').value;
      const file = document.getElementById('training-import-file')?.files[0];
      let entries = [];
      if (file) {
        const batch = prepareUploadBatch([], [file], {
          fileLabel: '名單匯入檔',
          maxSize: 10 * 1024 * 1024,
          maxSizeLabel: '10MB',
          allowedExtensions: ['xlsx', 'xls', 'csv', 'tsv']
        });
        if (!batch.accepted.length) {
          batch.errors.forEach((message) => toast(message, 'error'));
          return;
        }
        try {
          entries = await parseTrainingRosterWorkbook(batch.accepted[0].file, unit);
        } catch (error) {
          toast(error.message || 'Excel 匯入失敗', 'error');
          return;
        }
      } else {
        entries = parseTrainingRosterImport(raw, unit);
      }
      if (!entries.length) {
        toast('請提供至少一筆可匯入的人員資料', 'error');
        return;
      }
      if (entries.some((entry) => !String(entry.unit || unit || '').trim())) {
        toast('請先選擇單位，或在匯入檔中提供「填報單位」欄位', 'error');
        return;
      }
      let added = 0;
      let updated = 0;
      let skipped = 0;
      let fallbackWarning = '';
      const importErrors = [];
      const importedRosterIds = [];
      const importedRosterNames = [];
      const importedRosterUnits = [];
      try {
        await syncTrainingRostersFromM365({ silent: true });
      } catch (error) {
        console.warn('training roster import pre-sync failed', error);
      }
      const actor = currentUser() || {};
      const rosterIndex = new Map(
        getAllTrainingRosters().map((row) => [
          (String(row.unit || '').trim() + '::' + String(row.name || '').trim().toLowerCase()),
          row
        ])
      );
      const pendingUpserts = new Map();
      entries.forEach((entry) => {
        const targetUnit = String(entry.unit || unit || '').trim();
        const normalizedName = String(entry.name || '').trim().toLowerCase();
        if (!targetUnit || !normalizedName) {
          skipped += 1;
          return;
        }
        const rosterKey = targetUnit + '::' + normalizedName;
        const existingRoster = rosterIndex.get(rosterKey) || null;
        const nextPayload = {
          ...(existingRoster || {}),
          ...entry,
          id: existingRoster && existingRoster.id ? existingRoster.id : '',
          unit: targetUnit,
          source: 'import',
          createdBy: existingRoster?.createdBy || actor.name || '',
          createdByUsername: existingRoster?.createdByUsername || actor.username || '',
          actorName: actor.name || '',
          actorUsername: actor.username || ''
        };
        const unchanged = !!existingRoster
          && String(existingRoster.unitName || '') === String(nextPayload.unitName || '')
          && String(existingRoster.identity || '') === String(nextPayload.identity || '')
          && String(existingRoster.jobTitle || '') === String(nextPayload.jobTitle || '')
          && String(existingRoster.source || 'import') === 'import';
        if (unchanged) {
          skipped += 1;
          return;
        }
        if (pendingUpserts.has(rosterKey)) {
          skipped += 1;
        }
        pendingUpserts.set(rosterKey, nextPayload);
      });
      const batchPayload = Array.from(pendingUpserts.values());
      if (batchPayload.length) {
        // Use a moderate batch size to balance throughput and reliability
        // on large imports.
        const chunkSize = 100;
        const chunks = [];
        for (let startIndex = 0; startIndex < batchPayload.length; startIndex += chunkSize) {
          chunks.push({
            index: chunks.length,
            items: batchPayload.slice(startIndex, startIndex + chunkSize)
          });
        }
        const chunkResults = await runAsyncPool(chunks, async (chunkPayload) => {
          try {
            const result = await submitTrainingRosterBatchUpsert({
              items: chunkPayload.items,
              actorName: actor.name || '',
              actorUsername: actor.username || ''
            });
            return { index: chunkPayload.index, result };
          } catch (error) {
            return { index: chunkPayload.index, error: String(error && error.message || error || '匯入失敗') };
          }
        }, 2);
        chunkResults
          .slice()
          .sort((left, right) => Number(left && left.index || 0) - Number(right && right.index || 0))
          .forEach((entry) => {
            if (!entry) return;
            const result = entry.result || null;
            if (result) {
              const summary = result && result.summary && typeof result.summary === 'object' ? result.summary : {};
              added += Number(summary.added || 0);
              updated += Number(summary.updated || 0);
              skipped += Number(summary.skipped || 0);
              if (!fallbackWarning && result && result.warning) fallbackWarning = result.warning;
              if (Array.isArray(result && result.items)) {
                result.items.forEach((item) => {
                  const targetUnit = String(item.unit || '').trim();
                  importedRosterIds.push(String(item.id || '').trim());
                  importedRosterNames.push(String(item.name || '').trim());
                  importedRosterUnits.push(String(item.unit || targetUnit).trim());
                });
              }
              if (Array.isArray(result && result.errors) && result.errors.length) {
                importErrors.push(...result.errors);
              }
              return;
            }
            if (entry.error) {
              importErrors.push(entry.error);
            }
          });
      }
      try {
        await syncTrainingRostersFromM365({ silent: true, force: true });
      } catch (error) {
        console.warn('training roster import post-sync failed', error);
      }
      dispatchTrainingCacheInvalidation('training-rosters', 'training-roster-import');
      clearTrainingRosterRemotePageCache();
      await renderTrainingRoster({
        skipSync: true,
        deferFullRender: true,
        rosterIds: importedRosterIds,
        rosterNames: importedRosterNames,
        rosterUnits: importedRosterUnits
      });
      toast('匯入完成：新增 ' + added + ' 筆、更新 ' + updated + ' 筆、略過 ' + skipped + ' 筆', importErrors.length ? 'info' : 'success');
      if ((added + updated) > 0) {
        toast('已自動定位到本次匯入的名單列', 'info');
      }
      if (fallbackWarning) toast(fallbackWarning, 'info');
      if (importErrors.length) toast(importErrors[0], 'error');
      });
    });

    const restoreFocus = function () {
      if (!restoreTrainingRosterFocusState(focusState)) {
        focusTrainingRosterRows(opts);
      }
    };
    const scheduleRestoreFocus = function () {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(restoreFocus);
        });
        window.setTimeout(restoreFocus, 250);
        return;
      }
      if (typeof window.setTimeout === 'function') {
        window.setTimeout(restoreFocus, 50);
        window.setTimeout(restoreFocus, 250);
        return;
      }
      restoreFocus();
    };
    scheduleRestoreFocus();
    refreshIcons();
  }

  function seedTrainingData() {
    const store = loadTrainingStore();
    if (store.rosters.length > 0) return;
    const now = new Date().toISOString();
    const seen = new Set();
    getUsers().map((user) => getTrainingAccessProfile(user)).filter((user) => !isAdmin(user)).forEach((user) => {
      const authorizedUnits = Array.isArray(user.authorizedUnits) ? user.authorizedUnits : [];
      authorizedUnits.forEach((unit) => {
        const key = (unit + '::' + user.name).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const row = normalizeTrainingRosterRow({
          id: 'RST-' + String(store.nextRosterId).padStart(4, '0'),
          unit,
          name: user.name,
          unitName: getTrainingJobUnit(unit),
          identity: '單位管理員',
          jobTitle: '',
          source: 'import',
          createdBy: '系統初始化',
          createdAt: now
        }, unit);
        store.nextRosterId += 1;
        store.rosters.push(row);
      });
    });
    saveTrainingStore(store);
  }
    registerActionHandlers('training', {
      undo: function ({ dataset }) {
        handleTrainingUndo(dataset.id);
      },
      return: function ({ dataset }) {
        handleTrainingReturn(dataset.id);
      },
      deleteRoster: function ({ dataset }) {
        handleTrainingDeleteRoster(dataset.id);
      },
      printDetail: function ({ dataset }) {
        handleTrainingPrintDetail(dataset.id);
      },
      exportDetail: function ({ dataset }) {
        handleTrainingExportDetailCsv(dataset.id);
      }
    });

    return {
      renderTraining,
      renderTrainingFill,
      renderTrainingDetail,
      renderTrainingRoster,
      submitTrainingRosterUpsert,
      submitTrainingRosterBatchUpsert,
      submitTrainingRosterDelete,
      submitTrainingRosterBatchDelete,
      seedTrainingData
    };
  };
})();
