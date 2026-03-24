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
      reviewUnitContactApplication,
      activateUnitContactApplication,
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
      downloadJson,
      buildUnitCascadeControl,
      initUnitCascade,
      registerActionHandlers,
      closeModalRoot,
      getUnitContactApplication,
      requestUnitContactAuthorizationDocument
    } = deps;

    function formatAuditOccurredAt(value) {
      const input = String(value || '').trim();
      if (!input) return '—';
      const date = new Date(input);
      if (Number.isNaN(date.getTime())) return input;
      return date.toLocaleString('zh-TW', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    function formatAuditEventTypeSummary(summary) {
      const items = Array.isArray(summary && summary.eventTypes) ? summary.eventTypes : [];
      if (!items.length) {
        return '<div class="review-history-item"><div class="review-history-title">尚無事件分布</div><div class="review-history-meta">目前查詢範圍內沒有可用的事件類型統計。</div></div>';
      }
      const total = Math.max(0, Number(summary && summary.total) || 0);
      return items.map((entry) => {
        const label = String(entry && entry.eventType || 'unknown').trim() || 'unknown';
        const count = Math.max(0, Number(entry && entry.count) || 0);
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        return `<div class="review-history-item"><div class="review-history-top"><span class="review-history-title">${esc(label)}</span><span class="review-history-time">${count} 筆${total > 0 ? ` · ${percent}%` : ''}</span></div><div class="review-history-meta">事件類型 ${esc(label)} 共 ${count} 筆${total > 0 ? `，佔 ${percent}%` : ''}。</div></div>`;
      }).join('');
    }

    const DEFAULT_AUDIT_FILTERS = Object.freeze({
      keyword: '',
      eventType: '',
      actorEmail: '',
      unitCode: '',
      recordId: '',
      limit: '100',
      offset: '0'
    });
    const auditTrailState = {
      filters: { ...DEFAULT_AUDIT_FILTERS },
      items: [],
      summary: { total: 0, actorCount: 0, latestOccurredAt: '', eventTypes: [] },
      page: { offset: 0, limit: 100, total: 0, pageCount: 0, currentPage: 0, hasPrev: false, hasNext: false, prevOffset: 0, nextOffset: 0, pageStart: 0, pageEnd: 0 },
      health: null,
      lastLoadedAt: '',
      filterSignature: '',
      loading: false
    };
    const AUDIT_TRAIL_SYNC_FRESHNESS_MS = 30000;
    const AUDIT_TRAIL_HEALTH_CACHE_MS = 30000;
    const AUDIT_TRAIL_QUERY_CACHE_MS = 30000;
    let auditTrailHealthLoadPromise = null;
    let auditTrailHealthCache = {
      value: null,
      loadedAt: 0
    };
    const AUDIT_TRAIL_QUERY_CACHE_MAX = 12;
    const auditTrailQueryCache = new Map();
    const auditTrailLoadPromiseMap = new Map();
    const unitContactReviewState = {
      filters: {
        status: 'pending_review',
        keyword: '',
        email: '',
        limit: '50'
      },
      items: [],
      loading: false,
      lastLoadedAt: ''
    };
    const unitGovernanceState = {
      filters: {
        keyword: '',
        mode: 'all'
      },
      items: [],
      loading: false,
      lastLoadedAt: ''
    };
    const securityWindowState = {
      filters: {
        keyword: '',
        status: 'all'
      },
      inventory: null,
      loading: false,
      lastLoadedAt: '',
      filterSignature: ''
    };
    const SECURITY_WINDOW_SYNC_FRESHNESS_MS = 30000;
    let securityWindowLoadPromise = null;
    let securityWindowInventoryCache = {
      loadedAt: 0,
      value: null
    };

    function formatUserUnitSummary(user) {
      const primary = String((user && (user.primaryUnit || user.unit)) || '').trim();
      const units = getAuthorizedUnits(user).filter((unit) => unit && unit !== primary);
      if (!primary && !units.length) return '未指定';
      if (!units.length) return primary ? `${primary}（無額外授權）` : '未指定';
      const extraLabel = units.length ? units.join('、') : '無額外授權';
      return primary ? `主：${primary}；額外：${extraLabel}` : `額外：${extraLabel}`;
    }

    function formatUserReviewUnitSummary(user) {
      const units = getReviewUnits(user);
      return units.length ? units.join('、') : '沿用既有審核邏輯';
    }

    function getPrimaryAuthorizedUnit(user) {
      return String((user && (user.primaryUnit || user.unit)) || '').trim() || (getAuthorizedUnits(user)[0] || '');
    }

    function getExtraAuthorizedUnits(user) {
      const primary = getPrimaryAuthorizedUnit(user);
      return getAuthorizedUnits(user).filter((unit) => unit && unit !== primary);
    }

    function getGovernanceReviewScopeUnits(user) {
      const units = getReviewUnits(user);
      return Array.isArray(units) ? units.map((unit) => String(unit || '').trim()).filter(Boolean) : [];
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
        next.actorEmail,
        next.unitCode,
        next.recordId,
        next.limit,
        next.offset
      ].map((value) => String(value || '').trim()).join('|');
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
      const cached = auditTrailQueryCache.get(signature);
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
      while (auditTrailQueryCache.size > AUDIT_TRAIL_QUERY_CACHE_MAX) {
        const oldestKey = auditTrailQueryCache.keys().next().value;
        if (!oldestKey) break;
        auditTrailQueryCache.delete(oldestKey);
      }
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
        actorEmail: String(document.getElementById('audit-actor-email')?.value || '').trim(),
        unitCode: String(document.getElementById('audit-unit-code')?.value || '').trim(),
        recordId: String(document.getElementById('audit-record-id')?.value || '').trim(),
        limit: String(document.getElementById('audit-limit')?.value || '100').trim(),
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
      return {
        currentPage,
        pageCount,
        summary: getAuditTrailPageSummary(page),
        hasPrev: !!(page && page.hasPrev),
        hasNext: !!(page && page.hasNext)
      };
    }

    function renderAuditTrailPager(page) {
      const meta = getAuditTrailPageActionMeta(page);
      return `<div class="review-toolbar review-toolbar--compact" style="margin:14px 0 0"><div class="review-toolbar-main"><span class="review-card-subtitle">${esc(meta.summary)}</span></div><div class="review-toolbar-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="admin.auditTrailPrevPage" ${meta.hasPrev ? '' : 'disabled'}>${ic('chevron-left', 'icon-sm')} 上一頁</button><button type="button" class="btn btn-secondary btn-sm" data-action="admin.auditTrailNextPage" ${meta.hasNext ? '' : 'disabled'}>下一頁 ${ic('chevron-right', 'icon-sm')}</button><span class="review-card-subtitle" style="margin-left:8px">頁次 ${meta.currentPage || 0} / ${meta.pageCount || 0}</span></div></div>`;
    }

    function showAuditEntryModal(index) {
      const items = Array.isArray(auditTrailState.items) ? auditTrailState.items : [];
      const entryIndex = Math.max(0, Number(index) || 0);
      const entry = items[entryIndex] || null;
      if (!entry) {
        toast('找不到稽核紀錄明細', 'error');
        return;
      }
      const payload = entry && typeof entry.payload === 'object' && entry.payload ? entry.payload : null;
      const payloadText = payload
        ? JSON.stringify(payload, null, 2)
        : String(entry.payloadJson || entry.payloadPreview || '—');
      const mr = document.getElementById('modal-root') || (function () {
        const fallbackRoot = document.createElement('div');
        fallbackRoot.id = 'modal-root';
        document.body.appendChild(fallbackRoot);
        return fallbackRoot;
      }());
      const fieldRows = [
        ['事件類型', entry.eventType || '—'],
        ['時間', formatAuditOccurredAt(entry.occurredAt)],
        ['操作人', entry.actorEmail || '—'],
        ['目標', entry.targetEmail || '—'],
        ['單位', entry.unitCode || '—'],
        ['紀錄編號', entry.recordId || '—']
      ].map(([label, value]) => `<div class="audit-modal-field"><div class="audit-modal-label">${esc(label)}</div><div class="audit-modal-value">${esc(value)}</div></div>`).join('');

      mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal" style="max-width:min(96vw,980px);width:min(96vw,980px);max-height:90vh;overflow:auto"><div class="modal-header"><span class="modal-title">操作稽核差異檢視</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><div class="modal-body"><div class="audit-modal-summary">${fieldRows}</div><div class="form-group" style="margin-top:18px"><label class="form-label">內容摘要</label><div class="review-card-subtitle" style="white-space:pre-wrap;line-height:1.6">${esc(entry.payloadPreview || '—')}</div></div><div class="form-group"><label class="form-label">完整內容</label><pre class="audit-modal-pre">${esc(payloadText)}</pre></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss-modal>關閉</button></div></div></div>`;
      const backdrop = document.getElementById('modal-bg');
      if (backdrop) {
        backdrop.addEventListener('click', (event) => {
          if (event.target === event.currentTarget) closeModalRoot();
        });
      }
      refreshIcons();
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
                    console.warn('audit trail prefetch failed', error);
                  });
                }
              }
            }
          }
          return state;
        })
        .catch((error) => {
          console.warn('audit trail fetch failed', error);
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
          console.warn('audit trail health fetch failed', error);
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

    function getGovernanceTopLevelUnits() {
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
        .filter((group) => {
          const scopeUnits = getGovernanceReviewScopeUnits(currentUser());
          if (isAdmin()) return true;
          return scopeUnits.includes(group.unit);
        })
        .sort((a, b) => a.unit.localeCompare(b.unit, 'zh-Hant'));
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
            <div class="review-card-subtitle" style="margin-top:4px">${esc(unit.category || '正式單位')}</div>
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
          <div class="review-callout compact" style="margin-top:14px">
            <span class="review-callout-icon">${ic('building-2', 'icon-sm')}</span>
            <div>${esc(modeHint)}</div>
          </div>
          <div class="cl-governance-child-wrap">
            <div class="cl-governance-child-title">轄下二級單位</div>
            <div class="cl-governance-child-list">${childrenHtml}</div>
          </div>
          <div class="form-actions" style="justify-content:flex-end">
            <button type="button" class="btn btn-primary" data-action="admin.saveGovernanceMode" data-unit="${esc(unit.unit)}">${ic('save', 'icon-sm')} 儲存設定</button>
          </div>
        </div>
      </div>`;
    }

    function renderGovernanceCategoryCard(group, index) {
      const items = Array.isArray(group && group.items) ? group.items : [];
      const category = String(group && group.category || '').trim() || '中心 / 研究單位';
      const unitCount = items.length;
      const consolidatedCount = items.filter((unit) => String(unit && unit.mode || 'independent').trim() === 'consolidated').length;
      const independentCount = unitCount - consolidatedCount;
      const childCount = items.reduce((sum, unit) => sum + (Array.isArray(unit && unit.children) ? unit.children.length : 0), 0);
      const summaryChips = [
        ['單位數', unitCount],
        ['合併填報', consolidatedCount],
        ['獨立填報', independentCount],
        ['轄下二級單位', childCount]
      ];
      const openAttr = index === 0 ? ' open' : '';
      const subtitle = `${category} · ${unitCount} 個一級單位`;
      const bodyHtml = `<div class="security-window-group-stack security-window-group-stack--nested governance-group-stack governance-group-stack--nested">${items.map((unit) => buildGovernanceUnitCard(unit)).join('')}</div>`;
      return `<details class="training-group-card security-window-category-card governance-category-card"${openAttr} data-governance-category="${esc(category)}"><summary class="training-group-summary security-window-summary security-window-category-summary governance-category-summary"><div><span class="training-group-title">${esc(category)}</span><div class="training-group-subtitle">${esc(subtitle)}</div><div class="training-group-summary-grid security-window-category-summary-grid governance-category-summary-grid">${summaryChips.map(([label, value]) => `<span class="training-group-summary-chip security-window-category-summary-chip governance-category-summary-chip"><strong>${esc(String(value || 0))}</strong><small>${esc(label)}</small></span>`).join('')}</div></div><div class="training-group-meta"><span class="security-window-category-tag governance-category-tag">${esc(category)}</span><span class="training-group-toggle">${ic('chevron-down', 'icon-sm')}</span></div></summary><div class="security-window-category-body governance-category-body">${bodyHtml}</div></details>`;
    }

    function getSecurityWindowFilterSignature(filters) {
      const next = {
        keyword: '',
        status: 'all',
        ...(filters || {})
      };
      return [next.keyword, next.status]
        .map((value) => String(value || '').trim())
        .join('|');
    }

    function isSecurityWindowInventoryFresh() {
      if (!securityWindowInventoryCache || !securityWindowInventoryCache.value) return false;
      return (Date.now() - Number(securityWindowInventoryCache.loadedAt || 0)) < SECURITY_WINDOW_SYNC_FRESHNESS_MS;
    }

    function normalizeSecurityWindowPerson(user) {
      const units = Array.from(new Set(getAuthorizedUnits(user).map((unit) => String(unit || '').trim()).filter(Boolean)));
      const securityRoles = normalizeSecurityRoles(user && user.securityRoles);
      return {
        username: String(user && user.username || '').trim(),
        name: String(user && user.name || '').trim(),
        email: String(user && user.email || '').trim(),
        role: String(user && user.role || '').trim(),
        units,
        securityRoles,
        hasWindow: securityRoles.length > 0,
        activeUnit: String(user && user.activeUnit || user && user.unit || units[0] || '').trim()
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

    function getSecurityWindowUnitStatusMeta(status) {
      const key = String(status || '').trim();
      if (key === 'assigned') return { label: '已設定', tone: 'approved' };
      if (key === 'pending') return { label: '待審核', tone: 'pending' };
      if (key === 'missing') return { label: '未設定', tone: 'danger' };
      if (key === 'exempted') return { label: '由一級單位統一', tone: 'closed' };
      return { label: key || '未知', tone: 'pending' };
    }

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

    function renderSecurityWindowPersonBadge(person) {
      const roles = Array.isArray(person && person.securityRoles) ? person.securityRoles : [];
      if (!roles.length) return '<span class="badge-role badge-pending">未設定</span>';
      return roles.map((role) => `<span class="badge-role badge-unit-admin" style="margin-right:6px">${esc(role)}</span>`).join('');
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
      const rows = Array.isArray(items) ? items : [];
      if (!rows.length) {
        return `<tr><td colspan="6"><div class="empty-state" style="padding:32px 20px"><div class="empty-state-title">沒有符合條件的資安窗口人員</div><div class="empty-state-desc">請調整關鍵字或狀態篩選。</div></div></td></tr>`;
      }
      return rows.map((person) => {
        const units = Array.isArray(person.units) ? person.units : [];
        const unitSummary = units.length ? units.join('、') : '未指定';
        const statusMeta = getSecurityWindowUnitStatusMeta(person.hasWindow ? 'assigned' : 'missing');
        return `<tr><td style="font-weight:600;color:var(--text-primary)">${esc(person.name || person.username || '—')}</td><td>${esc(person.username || '—')}<div class="review-card-subtitle" style="margin-top:4px">${esc(person.email || '—')}</div></td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(unitSummary)}</td><td>${renderSecurityWindowPersonBadge(person)}</td><td><span class="review-status-badge ${statusMeta.tone}">${esc(statusMeta.label)}</span></td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(person.activeUnit || '—')}</td></tr>`;
      }).join('');
    }

    function renderSecurityWindowScopeCard(row) {
      const meta = getSecurityWindowUnitStatusMeta(row.status);
      const holders = Array.isArray(row.holders) ? row.holders : [];
      const pending = Array.isArray(row.pending) ? row.pending : [];
      const holderHtml = holders.length
        ? holders.map((person) => `<span class="cl-governance-child-chip">${esc(person.name || person.username || '—')} · ${esc(formatSecurityRolesSummary(person.securityRoles))}</span>`).join('')
        : '<span class="cl-governance-child-chip cl-governance-child-chip--muted">尚未指定</span>';
      const pendingHtml = pending.length
        ? pending.map((item) => `<span class="cl-governance-child-chip">${esc(item.applicantName || item.applicantEmail || '—')} · ${esc(formatSecurityRolesSummary(item.securityRoles))}</span>`).join('')
        : '<span class="cl-governance-child-chip cl-governance-child-chip--muted">無待審核申請</span>';
      const tierLabel = row.exempted ? '已整併' : (row.isTop ? '一級單位' : '二級單位');
      const tierTone = row.exempted ? 'closed' : (row.isTop ? 'approved' : meta.tone);
      const noteLabel = row.exempted
        ? '由一級單位統一填報'
        : (row.isTop ? '本部 / 主體盤點' : '轄下單位分層盤點');
      return `
        <article class="security-window-scope-card ${row.isTop ? 'is-top' : 'is-child'} ${row.exempted ? 'is-exempted' : ''}">
          <div class="security-window-scope-card-head">
            <div>
              <div class="security-window-scope-card-title">${esc(row.label || row.unit || '—')}</div>
              <div class="security-window-scope-card-subtitle">
                <span class="review-count-chip">${esc(tierLabel)}</span>
                <span>${esc(noteLabel)}</span>
              </div>
            </div>
            <span class="review-status-badge ${tierTone}">${esc(meta.label)}</span>
          </div>
          <div class="security-window-scope-card-body">
            <div class="security-window-scope-chip-row">${holderHtml}</div>
            ${pending.length ? `<div class="review-card-subtitle" style="margin-top:10px">待審核：<div class="security-window-scope-chip-row" style="margin-top:8px">${pendingHtml}</div></div>` : ''}
          </div>
        </article>`;
    }

    function renderSecurityWindowScopeSection(title, subtitle, rows, emptyText) {
      const items = Array.isArray(rows) ? rows : [];
      const safeEmptyText = emptyText || '沒有可顯示的單位範圍';
      return `
        <section class="security-window-tier-section">
          <div class="security-window-tier-section-header">
            <div>
              <div class="security-window-tier-section-title">${esc(title)}</div>
              <div class="review-card-subtitle">${esc(subtitle || '')}</div>
            </div>
            <span class="review-count-chip">${esc(String(items.length))} 筆</span>
          </div>
          ${items.length
            ? `<div class="security-window-tier-items">${items.map((row) => renderSecurityWindowScopeCard(row)).join('')}</div>`
            : `<div class="empty-state security-window-tier-empty"><div class="empty-state-title">${esc(safeEmptyText)}</div><div class="empty-state-desc">請確認單位資料與治理設定是否已就緒。</div></div>`}
        </section>`;
    }

    function renderSecurityWindowScopeRows(unit) {
      const rows = Array.isArray(unit && unit.scopeRows) ? unit.scopeRows : [];
      const topRows = rows.filter((row) => row && row.isTop);
      const childRows = rows.filter((row) => row && !row.isTop);
      return `
        <div class="security-window-tier-stack">
          ${renderSecurityWindowScopeSection('一級單位', '主單位與本部資安窗口盤點', topRows, '沒有可顯示的一級單位盤點資料')}
          ${renderSecurityWindowScopeSection('二級單位', String(unit && unit.mode || 'independent').trim() === 'consolidated' ? '已整併單位會顯示為由一級單位統一' : '轄下單位的資安窗口盤點', childRows, '沒有可顯示的二級單位盤點資料')}
        </div>`;
    }

    const SECURITY_WINDOW_CATEGORY_ORDER = ['行政單位', '學術單位', '中心 / 研究單位'];

    function normalizeSecurityWindowCategory(category) {
      const raw = String(category || '').trim();
      if (!raw) return null;
      if (SECURITY_WINDOW_CATEGORY_ORDER.includes(raw)) return raw;
      if (raw.includes('行政')) return '行政單位';
      if (raw.includes('學術')) return '學術單位';
      if (raw.includes('中心') || raw.includes('研究')) return '中心 / 研究單位';
      return null;
    }

    function groupSecurityWindowUnitsByCategory(units) {
      const groups = new Map();
      (Array.isArray(units) ? units : []).forEach((unit) => {
        const category = normalizeSecurityWindowCategory(unit && unit.category);
        if (!category) return;
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(unit);
      });
      return SECURITY_WINDOW_CATEGORY_ORDER
        .map((category) => ({ category, items: groups.get(category) || [] }))
        .filter((group) => Array.isArray(group.items) && group.items.length);
    }

    function renderSecurityWindowUnitCard(unit) {
      const statusMeta = getSecurityWindowUnitStatusMeta(unit.status);
      const holderCount = Array.isArray(unit.holders) ? unit.holders.length : 0;
      const pendingCount = Array.isArray(unit.pending) ? unit.pending.length : 0;
      const childCount = Array.isArray(unit.children) ? unit.children.length : 0;
      const summaryChips = [
        ['一級單位', 1],
        ['二級單位', childCount],
        ['已設定', holderCount],
        ['待審核', pendingCount]
      ];
      return `<details class="training-group-card security-window-card" data-security-window-unit="${esc(unit.unit)}"><summary class="training-group-summary security-window-summary"><div><span class="training-group-title">${esc(unit.unit)}</span><div class="training-group-subtitle">${esc(unit.category || '正式單位')} · ${esc(unit.mode === 'consolidated' ? '合併 / 統一填報' : '獨立填報')}</div><div class="training-group-summary-grid">${summaryChips.map(([label, value]) => `<span class="training-group-summary-chip"><strong>${esc(String(value || 0))}</strong><small>${esc(label)}</small></span>`).join('')}</div></div><div class="training-group-meta"><span class="review-status-badge ${statusMeta.tone}">${esc(statusMeta.label)}</span><span class="training-group-toggle">${ic('chevron-down', 'icon-sm')}</span></div></summary><div class="governance-card-body" style="padding-top:14px"><div class="review-callout compact"><span class="review-callout-icon">${ic('users-round', 'icon-sm')}</span><div>${esc(unit.note || (unit.mode === 'consolidated' ? '轄下單位由一級單位統一管理。' : '轄下單位需各自維護資安窗口。'))}</div></div>${renderSecurityWindowScopeRows(unit)}</div></details>`;
    }

    function renderSecurityWindowCategoryCard(group, index) {
      const items = Array.isArray(group && group.items) ? group.items : [];
      const category = String(group && group.category || '').trim() || '中心 / 研究單位';
      const unitCount = items.length;
      const assignedCount = items.filter((unit) => unit && unit.hasWindow).length;
      const pendingCount = items.reduce((sum, unit) => sum + (Array.isArray(unit && unit.pending) ? unit.pending.length : 0), 0);
      const childCount = items.reduce((sum, unit) => sum + (Array.isArray(unit && unit.children) ? unit.children.length : 0), 0);
      const missingCount = items.filter((unit) => unit && !unit.hasWindow && !(Array.isArray(unit.pending) && unit.pending.length)).length;
      const summaryChips = [
        ['單位數', unitCount],
        ['已設定', assignedCount],
        ['待審核', pendingCount],
        ['未設定', missingCount]
      ];
      const openAttr = index === 0 ? ' open' : '';
      const subtitle = `${category} · ${childCount} 個二級單位`;
      const bodyHtml = `<div class="security-window-group-stack security-window-group-stack--nested">${items.map((unit) => renderSecurityWindowUnitCard(unit)).join('')}</div>`;
      return `<details class="training-group-card security-window-category-card"${openAttr} data-security-window-category="${esc(category)}"><summary class="training-group-summary security-window-summary security-window-category-summary"><div><span class="training-group-title">${esc(category)}</span><div class="training-group-subtitle">${esc(subtitle)}</div><div class="training-group-summary-grid security-window-category-summary-grid">${summaryChips.map(([label, value]) => `<span class="training-group-summary-chip security-window-category-summary-chip"><strong>${esc(String(value || 0))}</strong><small>${esc(label)}</small></span>`).join('')}</div></div><div class="training-group-meta"><span class="security-window-category-tag">${esc(category)}</span><span class="training-group-toggle">${ic('chevron-down', 'icon-sm')}</span></div></summary><div class="security-window-category-body">${bodyHtml}</div></details>`;
    }

    function renderSecurityWindowUnitCards(units) {
      const rows = Array.isArray(units) ? units : [];
      if (!rows.length) {
        return `<div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">目前沒有符合條件的資安窗口單位</div><div class="empty-state-desc">請調整關鍵字、狀態或先確認單位治理設定。</div></div>`;
      }
      const groups = groupSecurityWindowUnitsByCategory(rows);
      return `<div class="security-window-category-stack">${groups.map((group, index) => renderSecurityWindowCategoryCard(group, index)).join('')}</div>`;
    }

    function buildReviewTableShell(key, headersHtml, rowsHtml, options) {
      const config = options || {};
      const toolbarSubtitle = config.toolbarSubtitle
        ? `<span class="review-card-subtitle">${esc(config.toolbarSubtitle)}</span>`
        : '<span class="review-card-subtitle">可拖曳表格左右移動，也可使用右側按鈕快速查看其他欄位。</span>';
      return `<div class="review-table-shell"><div class="review-table-toolbar">${toolbarSubtitle}<div class="review-table-scroll-actions"><button type="button" class="btn btn-ghost btn-icon review-table-scroll-btn" data-review-scroll-left="${esc(key)}" aria-label="向左移動">${ic('chevron-left', 'icon-sm')}</button><button type="button" class="btn btn-ghost btn-icon review-table-scroll-btn" data-review-scroll-right="${esc(key)}" aria-label="向右移動">${ic('chevron-right', 'icon-sm')}</button></div></div><div class="table-wrapper review-table-wrapper" data-review-scroll-root="${esc(key)}"><table><thead><tr>${headersHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
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
        wrapper.addEventListener('pointerdown', (event) => {
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
        wrapper.addEventListener('pointermove', (event) => {
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
        wrapper.addEventListener('pointerup', endDrag);
        wrapper.addEventListener('pointercancel', endDrag);
        wrapper.addEventListener('pointerleave', (event) => {
          if (dragState && event.pointerType !== 'mouse') endDrag(event);
        });
        wrapper.addEventListener('wheel', (event) => {
          if (!isScrollable()) return;
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) && !event.shiftKey) return;
          event.preventDefault();
          wrapper.scrollLeft += event.shiftKey ? event.deltaY + event.deltaX : event.deltaY;
        }, { passive: false });
        wrapper.addEventListener('scroll', syncButtonState, { passive: true });
        if (leftButton) leftButton.addEventListener('click', () => scrollByDistance(-Math.max(260, wrapper.clientWidth * 0.72)));
        if (rightButton) rightButton.addEventListener('click', () => scrollByDistance(Math.max(260, wrapper.clientWidth * 0.72)));
        syncButtonState();
      });
    }

    function getSecurityWindowFiltersFromDom() {
        return {
          keyword: document.getElementById('security-window-keyword') ? document.getElementById('security-window-keyword').value.trim() : '',
          status: document.getElementById('security-window-status') ? document.getElementById('security-window-status').value.trim() : 'all'
      };
    }


    const SECURITY_ROLE_OPTIONS = ['二級單位資安窗口', '一級單位資安窗口'];
    const UNIT_SEARCH_ENTRIES = typeof getUnitSearchEntries === 'function'
      ? getUnitSearchEntries([], { excludeUnits: ['學校分部總辦事處'] })
      : [];

    function normalizeSecurityRoles(value) {
      const rawValues = Array.isArray(value)
        ? value
        : String(value || '').split(/[\n,，]+/);
      return Array.from(new Set(rawValues.map((item) => String(item || '').trim()).filter((item) => SECURITY_ROLE_OPTIONS.includes(item))));
    }

    function formatSecurityRolesSummary(value) {
      const roles = normalizeSecurityRoles(value);
      return roles.length ? roles.join('、') : '未指定';
    }

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
      return '<div class="unit-chip-picker" data-unit-chip-picker="' + esc(baseId) + '">'
        + '<div class="unit-chip-picker-search">'
        + '<input type="search" class="form-input unit-chip-picker-search-input" id="' + esc(baseId) + '-search" placeholder="' + esc(placeholder || '請輸入單位名稱') + '" autocomplete="off">'
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
        const matches = UNIT_SEARCH_ENTRIES.filter((entry) => !state.has(entry.value) && tokens.every((token) => entry.searchText.toLowerCase().includes(token))).slice(0, 8);
        resultsEl.hidden = false;
        if (!matches.length) {
          resultsEl.innerHTML = '<div class="unit-chip-picker-empty">找不到符合條件的單位</div>';
          return;
        }
        resultsEl.innerHTML = matches.map((entry) => '<button type="button" class="unit-cascade-search-option unit-chip-picker-option" data-unit-value="' + esc(entry.value) + '"><span class="unit-cascade-search-option-title">' + esc(entry.fullLabel) + '</span><span class="unit-cascade-search-option-meta">' + esc(entry.category || '') + (entry.code ? ' · ' + entry.code : '') + '</span></button>').join('');
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
      chipsEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-remove-unit]');
        if (!button) return;
        event.preventDefault();
        removeValue(button.dataset.removeUnit);
      });
      resultsEl.addEventListener('mousedown', (event) => {
        const button = event.target.closest('[data-unit-value]');
        if (!button) return;
        event.preventDefault();
        addValue(button.dataset.unitValue);
        searchEl.value = '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      });
      searchEl.addEventListener('input', () => renderResults(searchEl.value));
      searchEl.addEventListener('focus', () => renderResults(searchEl.value));
      searchEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const button = resultsEl.querySelector('[data-unit-value]');
        if (!button) return;
        event.preventDefault();
        addValue(button.dataset.unitValue);
        searchEl.value = '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      });
      document.addEventListener('click', (event) => {
        if (!resultsEl.contains(event.target) && event.target !== searchEl) {
          resultsEl.hidden = true;
        }
      });
      renderChips();
      syncHidden();
      return {
        setValues(values) {
          state.clear();
          parseUserUnits(values).forEach((value) => state.add(value));
          renderChips();
          syncHidden();
        },
        getValues() { return Array.from(state); },
        addValue,
        removeValue,
        clear() {
          state.clear();
          renderChips();
          syncHidden();
        }
      };
    }

    function getRoleBadgeClass(role) {
      return ROLE_BADGE[role] || 'badge-unit-admin';
    }

    function getRoleLabel(role) {
      return esc(String(role || '—'));
    }

  function renderUsers() {
    if (!canManageUsers()) { navigate('dashboard'); return; }
    const users = getUsers();
    const rows = users.map(u => {
      const primaryUnit = getPrimaryAuthorizedUnit(u) || '未指定';
      return `<tr><td style="font-weight:500;color:var(--text-primary)">${esc(u.username)}</td><td>${esc(u.name)}</td><td><span class="badge-role ${getRoleBadgeClass(u.role)}">${getRoleLabel(u.role)}</span></td><td>${esc(formatSecurityRolesSummary(u.securityRoles))}</td><td>${esc(primaryUnit)}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(formatUserUnitSummary(u))}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(formatUserReviewUnitSummary(u))}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(u.email || '')}</td><td><div class="user-actions">${u.username !== 'admin' ? `<button class="btn btn-sm btn-secondary" data-action="admin.editUser" data-username="${esc(u.username)}">${ic('edit-2', 'btn-icon-svg')}</button><button class="btn btn-sm btn-danger" data-action="admin.deleteUser" data-username="${esc(u.username)}">${ic('trash-2', 'btn-icon-svg')}</button>` : ''}</div></td></tr>`;
    }).join('');
    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">帳號管理</h1><p class="page-subtitle">管理角色、主要歸屬單位與多單位授權範圍</p></div><button class="btn btn-primary" data-action="admin.addUser">${ic('user-plus', 'icon-sm')} 新增使用者</button></div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>帳號</th><th>姓名</th><th>角色</th><th>資安窗口</th><th>主要歸屬單位</th><th>額外授權範圍</th><th>審核範圍</th><th>電子郵件</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
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
    const units = getAuthorizedUnits(eu);
    const primaryUnit = getPrimaryAuthorizedUnit(eu);
    const extraUnits = getExtraAuthorizedUnits(eu);
    const reviewUnits = getReviewUnits(eu);
    const selectedSecurityRoles = normalizeSecurityRoles(eu && eu.securityRoles);

    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal"><div class="modal-header"><span class="modal-title">${esc(title)}</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><form id="user-form">
      <div class="form-group"><label class="form-label form-required">帳號</label><input type="text" class="form-input" id="u-username" value="${isE ? esc(eu.username) : ''}" ${isE ? 'readonly' : ''} required></div>
      <div class="form-group"><label class="form-label form-required">姓名</label><input type="text" class="form-input" id="u-name" value="${isE ? esc(eu.name) : ''}" required></div>
      <div class="form-group"><label class="form-label form-required">電子郵件</label><input type="email" class="form-input" id="u-email" value="${isE ? esc(eu.email || '') : ''}" required></div>
      <div class="form-row"><div class="form-group"><label class="form-label form-required">角色</label><select class="form-select" id="u-role" required><option value="${ROLES.UNIT_ADMIN}" ${isE && eu.role === ROLES.UNIT_ADMIN ? 'selected' : ''}>單位管理員</option><option value="${ROLES.ADMIN}" ${isE && eu.role === ROLES.ADMIN ? 'selected' : ''}>最高管理者</option></select></div>
      <div class="form-group"><label class="form-label" id="u-unit-label">主要歸屬單位</label>${buildUnitCascadeControl('u-unit', primaryUnit, false, false)}</div></div>
      <div class="form-group" id="u-security-role-group"><label class="form-label form-required">資安角色</label>${buildSecurityRoleCheckboxes(selectedSecurityRoles)}<div class="form-hint">請至少選擇一種資安角色身分。</div></div>
      <div class="form-group"><label class="form-label">額外授權資源範圍</label>${buildUnitMultiSelectControl('u-units', extraUnits, '請輸入單位名稱', '可搜尋並加入額外授權的資源範圍。')}</div>
      <div class="form-group"><label class="form-label">審核資源範圍</label>${buildUnitMultiSelectControl('u-review-units', reviewUnits, '請輸入單位名稱', '僅單位管理員可設定，留空表示沿用既有規則。')}</div>
      <div class="form-group"><label class="form-label ${isE ? '' : 'form-required'}">${isE ? '密碼（留空不修改）' : '密碼'}</label><input type="text" class="form-input" id="u-pass" ${isE ? '' : 'required'}></div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">${isE ? ic('save', 'icon-sm') + ' 儲存' : ic('plus', 'icon-sm') + ' 新增'}</button><button type="button" class="btn btn-secondary" data-dismiss-modal>取消</button></div>
    </form></div></div>`;

    initUnitCascade('u-unit', primaryUnit, { disabled: false });

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
    roleEl.addEventListener('change', syncRoleFields);
    document.querySelectorAll('input[name="u-security-roles"]').forEach((input) => {
      input.addEventListener('change', syncScopedUnits);
    });
    document.getElementById('modal-bg').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModalRoot(); });
    document.getElementById('user-form').addEventListener('submit', async (e) => {
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
      try {
        if (!isE && findUser(un)) { toast('帳號已存在', 'error'); return; }
        await submitUserUpsert({ username: un, ...payload });
        await syncUsersFromM365({ silent: true });
        if (rl === ROLES.UNIT_ADMIN) {
          await submitReviewScopeReplace({
            username: un,
            units: reviewScopeUnits,
            actorName: currentUser() && currentUser().name,
            actorEmail: currentUser() && currentUser().email
          });
          await syncReviewScopesFromM365({ silent: true });
        }
        toast(isE ? '使用者已更新' : '使用者已新增');
        closeModalRoot(); renderUsers(); refreshIcons();
      } catch (error) {
        toast(String(error && error.message || error || '使用者儲存失敗'), 'error');
      }
    });
  }

  async function openUnitContactAuthorizationDocumentPreview(applicationId, email) {
    const response = await requestUnitContactAuthorizationDocument(applicationId, { email });
    const blob = await response.blob();
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
  function renderUnitContactReviewRows(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return `<tr><td colspan="7"><div class="empty-state" style="padding:36px 20px"><div class="empty-state-title">目前沒有符合條件的申請</div><div class="empty-state-desc">請調整篩選條件，或等待新的申請送出。</div></div></td></tr>`;
    }
    return rows.map((item) => {
      const id = String(item && item.id || '').trim();
      const status = String(item && item.status || '').trim();
      const actionButtons = [];
      if (status === 'pending_review' || status === 'returned') {
        actionButtons.push(`<button type="button" class="btn btn-sm btn-secondary" data-action="admin.unitContactApprove" data-id="${esc(id)}">${ic('badge-check', 'icon-sm')} 通過並啟用</button>`);
        actionButtons.push(`<button type="button" class="btn btn-sm btn-ghost" data-action="admin.unitContactReturn" data-id="${esc(id)}">${ic('undo-2', 'icon-sm')} 退回</button>`);
        actionButtons.push(`<button type="button" class="btn btn-sm btn-danger" data-action="admin.unitContactReject" data-id="${esc(id)}">${ic('x-circle', 'icon-sm')} 拒絕</button>`);
      } else if (status === 'approved' || status === 'activation_pending' || status === 'active') {
        if (item && item.hasAuthorizationDoc) {
          actionButtons.push(`<button type="button" class="btn btn-sm btn-secondary" data-action="admin.unitContactViewAuthDoc" data-id="${esc(id)}" data-applicant-email="${esc(item && item.applicantEmail || '')}">${ic('file-search', 'icon-sm')} 檢視授權同意書</button>`);
        }
        actionButtons.push(`<button type="button" class="btn btn-sm btn-secondary" data-action="admin.unitContactResendActivation" data-id="${esc(id)}">${ic('mail', 'icon-sm')} 重新寄送登入資訊</button>`);
        if (status !== 'active') {
          actionButtons.push(`<button type="button" class="btn btn-sm btn-ghost" data-action="admin.unitContactReturn" data-id="${esc(id)}">${ic('undo-2', 'icon-sm')} 退回</button>`);
        }
      }
      return `<tr><td><div class="review-unit-name">${esc(id)}</div><div class="review-card-subtitle" style="margin-top:4px">${esc(item && item.unitValue || '未指定單位')}</div></td><td>${esc(item && item.applicantName || '—')}<div class="review-card-subtitle" style="margin-top:4px">${esc(item && item.applicantEmail || '—')}</div><div class="review-card-subtitle" style="margin-top:4px">資安角色：${esc(formatSecurityRolesSummary(item && item.securityRoles))}</div></td><td>${esc(item && item.extensionNumber || '—')}</td><td>${unitContactStatusBadge(item)}</td><td>${esc(item && item.reviewComment || '—')}</td><td>${esc(fmtTime(item && (item.updatedAt || item.submittedAt)) || '—')}</td><td><div class="review-actions review-actions--unit-contact">${actionButtons.join('')}</div></td></tr>`;
    }).join('');
  }

  async function renderUnitContactReview(nextFilters) {
    if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可審核單位管理人申請', 'error'); return; }
    unitContactReviewState.filters = { ...unitContactReviewState.filters, ...(nextFilters || {}) };
    unitContactReviewState.loading = true;
    const app = document.getElementById('app');
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與登入資訊追蹤</h1><p class="page-subtitle">集中處理單位管理人申請，通過後會直接啟用帳號並寄送登入資訊。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" disabled>${ic('loader-circle', 'icon-sm')} 載入中</button></div></div><div class="card" style="padding:32px;text-align:center;color:var(--text-secondary)">正在讀取申請資料...</div></div>`;
    refreshIcons();
    try {
      const items = await listUnitContactApplications(unitContactReviewState.filters);
      unitContactReviewState.items = Array.isArray(items) ? items : [];
      unitContactReviewState.lastLoadedAt = new Date().toISOString();
    } catch (error) {
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與登入資訊追蹤</h1><p class="page-subtitle">無法讀取申請清單。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitContactReview">${ic('refresh-cw', 'icon-sm')} 重試</button></div></div><div class="card"><div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">申請後端尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
    }

    const counts = unitContactReviewState.items.reduce((result, item) => {
      const key = String(item && item.status || 'unknown').trim() || 'unknown';
      result[key] = Number(result[key] || 0) + 1;
      return result;
    }, {});
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與登入資訊追蹤</h1><p class="page-subtitle">最後更新：${esc(fmtTime(unitContactReviewState.lastLoadedAt))}</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitContactReview">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('mail-plus')}</div><div class="stat-value">${unitContactReviewState.items.length}</div><div class="stat-label">目前清單筆數</div></div><div class="stat-card pending"><div class="stat-icon">${ic('hourglass')}</div><div class="stat-value">${counts.pending_review || 0}</div><div class="stat-label">待審核</div></div><div class="stat-card closed"><div class="stat-icon">${ic('badge-check')}</div><div class="stat-value">${(counts.approved || 0) + (counts.activation_pending || 0) + (counts.active || 0)}</div><div class="stat-label">已處理</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('key-round')}</div><div class="stat-value">${counts.active || 0}</div><div class="stat-label">已啟用</div></div></div><div class="card review-table-card"><div class="card-header"><span class="card-title">申請清單</span><span class="review-card-subtitle">可依狀態、電子郵件與關鍵字過濾</span></div><div class="review-toolbar"><div class="review-toolbar-main"><div class="form-group"><label class="form-label">狀態</label><select class="form-select" id="unit-contact-review-status"><option value="" ${!unitContactReviewState.filters.status ? 'selected' : ''}>全部</option><option value="pending_review" ${unitContactReviewState.filters.status === 'pending_review' ? 'selected' : ''}>待審核</option><option value="approved" ${unitContactReviewState.filters.status === 'approved' ? 'selected' : ''}>已通過（舊資料）</option><option value="returned" ${unitContactReviewState.filters.status === 'returned' ? 'selected' : ''}>退回補件</option><option value="rejected" ${unitContactReviewState.filters.status === 'rejected' ? 'selected' : ''}>未核准</option><option value="active" ${unitContactReviewState.filters.status === 'active' ? 'selected' : ''}>已啟用</option></select></div><div class="form-group"><label class="form-label">申請電子郵件</label><input class="form-input" id="unit-contact-review-email" value="${esc(unitContactReviewState.filters.email)}" placeholder="例如 ntu.edu.tw 或 Gmail"></div><div class="form-group"><label class="form-label">關鍵字</label><input class="form-input" id="unit-contact-review-keyword" value="${esc(unitContactReviewState.filters.keyword)}" placeholder="單位、申請人、編號"></div><div class="form-group"><label class="form-label">筆數</label><select class="form-select" id="unit-contact-review-limit"><option value="20" ${unitContactReviewState.filters.limit === '20' ? 'selected' : ''}>20</option><option value="50" ${unitContactReviewState.filters.limit === '50' ? 'selected' : ''}>50</option><option value="100" ${unitContactReviewState.filters.limit === '100' ? 'selected' : ''}>100</option></select></div></div><div class="review-toolbar-actions"><button type="button" class="btn btn-primary" data-action="admin.applyUnitContactFilters">${ic('filter', 'icon-sm')} 套用篩選</button><button type="button" class="btn btn-secondary" data-action="admin.resetUnitContactFilters">${ic('rotate-ccw', 'icon-sm')} 重設</button></div></div>${buildReviewTableShell('unit-contact-review-table', '<th>申請編號 / 單位</th><th>申請人</th><th>分機</th><th>狀態</th><th>處理說明</th><th>最後更新</th><th>操作</th>', renderUnitContactReviewRows(unitContactReviewState.items), { toolbarSubtitle: '通過後會直接啟用帳號並寄送登入資訊；已啟用案件可補寄登入資訊。' })}</div></div>`;
    wireReviewTableScrollers(app);
    refreshIcons();
  }

    async function renderUnitReview(nextFilters) {
      if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可管理單位治理', 'error'); return; }
      unitGovernanceState.filters = { ...unitGovernanceState.filters, ...(nextFilters || {}) };
      unitGovernanceState.loading = true;
    const app = document.getElementById('app');
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位治理</div><h1 class="page-title">填報模式與授權設定</h1><p class="page-subtitle">可為一級單位設定獨立或合併填報模式，並快速檢視轄下二級單位的填報關聯。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" disabled>${ic('loader-circle', 'icon-sm')} 載入中</button></div></div><div class="card" style="padding:32px;text-align:center;color:var(--text-secondary)">正在整理單位治理資料...</div></div>`;
    refreshIcons();
    try {
      const items = getGovernanceTopLevelUnits();
      unitGovernanceState.items = Array.isArray(items) ? items : [];
      unitGovernanceState.lastLoadedAt = new Date().toISOString();
    } catch (error) {
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位治理</div><h1 class="page-title">填報模式與授權設定</h1><p class="page-subtitle">無法讀取單位治理資料。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitReview">${ic('refresh-cw', 'icon-sm')} 重試</button></div></div><div class="card"><div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">單位治理資料尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
    }

    const keyword = String(unitGovernanceState.filters.keyword || '').trim().toLowerCase();
    const modeFilter = String(unitGovernanceState.filters.mode || 'all').trim();
    const items = unitGovernanceState.items.filter((unit) => {
      if (modeFilter !== 'all' && String(unit.mode || 'independent').trim() !== modeFilter) return false;
      if (!keyword) return true;
      const haystack = [unit.unit, unit.category, unit.mode, unit.note, (unit.children || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
    const counts = items.reduce((result, unit) => {
      if (unit.mode === 'consolidated') result.consolidated += 1; else result.independent += 1;
      result.children += Array.isArray(unit.children) ? unit.children.length : 0;
      return result;
    }, { total: items.length, consolidated: 0, independent: 0, children: 0 });
    const groupedItems = groupGovernanceUnitsByCategory(items);
    const cardsHtml = groupedItems.length ? groupedItems.map((group, index) => renderGovernanceCategoryCard(group, index)).join('') : `<div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('layout-grid')}</div><div class="empty-state-title">沒有符合條件的單位</div><div class="empty-state-desc">請嘗試調整關鍵字，或先確認單位治理範圍。</div></div>`;
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
            <div class="form-group" style="min-width:260px;flex:1"><label class="form-label">關鍵字</label><input class="form-input" id="unit-governance-keyword" value="${esc(unitGovernanceState.filters.keyword || '')}" placeholder="單位名稱、子單位、模式、備註"></div>
            <div class="form-group" style="min-width:180px"><label class="form-label">填報模式</label><select class="form-select" id="unit-governance-mode"><option value="all" ${modeFilter === 'all' ? 'selected' : ''}>全部</option><option value="independent" ${modeFilter === 'independent' ? 'selected' : ''}>獨立填報</option><option value="consolidated" ${modeFilter === 'consolidated' ? 'selected' : ''}>合併 / 統一填報</option></select></div>
          </div>
          <div class="review-toolbar-actions">
            <button type="button" class="btn btn-primary" data-action="admin.applyGovernanceFilters">${ic('filter', 'icon-sm')} 套用篩選</button>
            <button type="button" class="btn btn-secondary" data-action="admin.resetGovernanceFilters">${ic('rotate-ccw', 'icon-sm')} 重設</button>
          </div>
        </div>
        <div class="security-window-category-stack governance-category-stack">${cardsHtml}</div>
      </div>
    </div>`;
    refreshIcons();
    if (typeof bindCopyButtons === 'function') bindCopyButtons();
    else if (window && typeof window.bindCopyButtons === 'function') window.bindCopyButtons();
    registerActionHandlers('admin', {
      applyGovernanceFilters: function () {
        unitGovernanceState.filters.keyword = document.getElementById('unit-governance-keyword') ? document.getElementById('unit-governance-keyword').value : '';
        unitGovernanceState.filters.mode = document.getElementById('unit-governance-mode') ? document.getElementById('unit-governance-mode').value : 'all';
        renderUnitReview(unitGovernanceState.filters);
      },
      resetGovernanceFilters: function () {
        unitGovernanceState.filters.keyword = '';
        unitGovernanceState.filters.mode = 'all';
        renderUnitReview(unitGovernanceState.filters);
      },
      saveGovernanceMode: function ({ dataset }) {
        const unit = String(dataset && dataset.unit || '').trim();
        if (!unit) return;
        const modeEl = document.querySelector(`[data-governance-unit-mode="${CSS.escape(unit)}"]`);
        const noteEl = document.querySelector(`[data-governance-unit-note="${CSS.escape(unit)}"]`);
        const mode = modeEl ? modeEl.value : 'independent';
        const note = noteEl ? noteEl.value.trim() : '';
        const result = setUnitGovernanceMode(unit, mode, currentUser()?.name || '', note);
        toast(result && result.mode === 'consolidated' ? `${unit} 已設定為合併填報` : `${unit} 已設定為獨立填報`);
        renderUnitReview(unitGovernanceState.filters);
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
      const applications = await listUnitContactApplications({ limit: '200' });
      const inventory = buildSecurityWindowInventory(getUsers(), Array.isArray(applications) ? applications : []);
      securityWindowInventoryCache = {
        loadedAt: Date.now(),
        value: inventory
      };
      return inventory;
    })().catch((error) => {
      console.warn('security window inventory load failed', error);
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
    securityWindowState.filters = { ...securityWindowState.filters, ...(nextFilters || {}) };
    const app = document.getElementById('app');
    const resolvedFilters = { keyword: '', status: 'all', ...securityWindowState.filters };
    const filterSignature = getSecurityWindowFilterSignature(resolvedFilters);
    const canRenderFromCache = securityWindowState.filterSignature === filterSignature && securityWindowState.inventory;
    let inventory = canRenderFromCache ? securityWindowState.inventory : null;
    if (!inventory) {
      try {
        if (securityWindowLoadPromise) {
          inventory = await securityWindowLoadPromise;
        } else {
          app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">系統管理</div><h1 class="page-title">資安窗口</h1><p class="page-subtitle">盤點全校各單位的資安窗口配置，依行政單位、學術單位、中心 / 研究單位分層顯示，僅最高管理者可檢視。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" disabled>${ic('loader-circle', 'icon-sm')} 載入中</button></div></div><div class="card" style="padding:32px;text-align:center;color:var(--text-secondary)">正在載入資安窗口盤點資料...</div></div>`;
          refreshIcons();
          inventory = await loadSecurityWindowInventory(!!opts.force);
        }
      } catch (error) {
        app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">系統管理</div><h1 class="page-title">資安窗口</h1><p class="page-subtitle">資安窗口盤點資料載入失敗，請稍後再試。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshSecurityWindow">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="card"><div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">載入失敗</div><div class="empty-state-desc">${esc(String(error && error.message || error || '無法載入資安窗口盤點資料'))}</div></div></div></div>`;
        refreshIcons();
        return;
      }
    }

    const safeInventory = normalizeSecurityWindowInventory(inventory);
    securityWindowState.inventory = safeInventory;
    securityWindowState.lastLoadedAt = safeInventory.generatedAt || new Date().toISOString();
    securityWindowState.filterSignature = filterSignature;
    let filtered;
    try {
      filtered = filterSecurityWindowInventory(safeInventory, resolvedFilters);
    } catch (error) {
      console.warn('security window inventory filter failed', error);
      filtered = filterSecurityWindowInventory(buildEmptySecurityWindowInventory(), resolvedFilters);
    }
    const summary = filtered.summary;
    const unitCardsHtml = renderSecurityWindowUnitCards(filtered.units);
    const peopleRowsHtml = renderSecurityWindowPersonRows(filtered.people);
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
            <div class="form-group" style="min-width:260px;flex:1"><label class="form-label">關鍵字</label><input class="form-input" id="security-window-keyword" value="${esc(resolvedFilters.keyword)}" placeholder="單位、姓名、帳號、電子郵件、角色"></div>
            <div class="form-group" style="min-width:180px"><label class="form-label">狀態</label><select class="form-select" id="security-window-status"><option value="all" ${resolvedFilters.status === 'all' ? 'selected' : ''}>全部</option><option value="assigned" ${resolvedFilters.status === 'assigned' ? 'selected' : ''}>已設定</option><option value="missing" ${resolvedFilters.status === 'missing' ? 'selected' : ''}>未設定</option><option value="pending" ${resolvedFilters.status === 'pending' ? 'selected' : ''}>待審核</option><option value="exempted" ${resolvedFilters.status === 'exempted' ? 'selected' : ''}>由一級單位統一</option></select></div>
          </div>
          <div class="review-toolbar-actions">
            <button type="button" class="btn btn-secondary" data-action="admin.applySecurityWindowFilters">${ic('search', 'icon-sm')} 套用</button>
            <button type="button" class="btn btn-secondary" data-action="admin.resetSecurityWindowFilters">${ic('rotate-ccw', 'icon-sm')} 重設</button>
          </div>
        </form>
        <div class="governance-grid">${unitCardsHtml}</div>
      </div>
      <div class="card review-table-card" style="margin-top:18px">
        <div class="card-header"><span class="card-title">資安窗口人員</span><span class="review-card-subtitle">依姓名、帳號、單位與狀態快速查找資安窗口人員</span></div>
        ${buildReviewTableShell('security-window-people-table', '<th>姓名</th><th>帳號 / 電子郵件</th><th>單位</th><th>資安角色</th><th>狀態</th><th>主要單位</th>', peopleRowsHtml, { toolbarSubtitle: '可依姓名、帳號、電子郵件、單位與資安角色篩選。' })}
      </div>
    </div>`;
    const form = document.getElementById('security-window-filter-form');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        renderSecurityWindow(getSecurityWindowFiltersFromDom());
      });
    }
    wireReviewTableScrollers(app);
    refreshIcons();
  }  async function handleRefreshSecurityWindow() {
    await renderSecurityWindow(securityWindowState.filters, { force: true });
  }

  async function handleApplySecurityWindowFilters() {
    await renderSecurityWindow(getSecurityWindowFiltersFromDom());
  }

  async function handleResetSecurityWindowFilters() {
    await renderSecurityWindow({
      keyword: '',
      status: 'all'
    });
  }

  async function handleExportSecurityWindow() {
    const inventory = await loadSecurityWindowInventory(false);
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
    if (!confirm(`確定清除 ${health.orphanAttachments} 筆孤兒附件嗎？這不會影響仍被單據引用的檔案。`)) return;
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
        Object.assign(auditTrailState, state);
        if (!isAuditTrailDataFresh(filterSignature) && !getAuditTrailLoadPromise(filterSignature)) {
          loadAuditTrailData(resolvedFilters).then(function () {
            if (document.getElementById('audit-filter-form')) {
              renderAuditTrail(resolvedFilters);
            }
          }).catch(function (error) {
            console.warn('audit trail background refresh failed', error);
          });
        }
      } else {
        app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">稽核追蹤</div><h1 class="page-title">操作稽核軌跡</h1><p class="page-subtitle">集中查詢系統登入、帳號異動、權限調整、表單送出與附件操作的後端稽核紀錄。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" disabled>${ic('loader-circle', 'icon-sm')} 載入中</button></div></div><div class="card" style="padding:32px;text-align:center;color:var(--text-secondary)">正在從正式稽核後端讀取資料...</div></div>`;
        refreshIcons();
        state = await loadAuditTrailData(resolvedFilters);
      }
    } catch (error) {
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">稽核追蹤</div><h1 class="page-title">操作稽核軌跡</h1><p class="page-subtitle">無法讀取後端稽核資料。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshAuditTrail">${ic('refresh-cw', 'icon-sm')} 重試</button></div></div><div class="card"><div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">稽核軌跡後端尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
      }

    const health = state.health || { ready: false, message: '未取得後端健康資訊' };
    const items = Array.isArray(state.items) ? state.items : [];
    const eventTypeOptions = getAuditTrailEventTypeOptions(state.summary, items);
    const eventTypeSelect = [`<option value="">全部事件</option>`]
      .concat(eventTypeOptions.map((value) => `<option value="${esc(value)}" ${state.filters.eventType === value ? 'selected' : ''}>${esc(value)}</option>`))
      .join('');
    const rows = items.length ? items.map((entry, index) => `<tr><td>${formatAuditOccurredAt(entry.occurredAt)}</td><td><div style="font-weight:600;color:var(--text-primary)">${esc(entry.eventType || 'unknown')}</div><div class="review-card-subtitle" style="margin-top:4px">${esc(entry.recordId || '—')}</div></td><td>${esc(entry.actorEmail || '—')}</td><td>${esc(entry.targetEmail || '—')}</td><td>${esc(entry.unitCode || '—')}</td><td style="max-width:360px;white-space:normal;line-height:1.55">${esc(entry.payloadPreview || entry.title || '—')}</td><td><button type="button" class="btn btn-sm btn-secondary" data-action="admin.viewAuditEntry" data-index="${index}">${ic('search', 'icon-sm')} 檢視差異</button></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state review-empty"><div class="empty-state-icon">${ic('scroll-text')}</div><div class="empty-state-title">目前查無符合條件的稽核紀錄</div><div class="empty-state-desc">可調整關鍵字、事件類型、單位代碼或紀錄編號後再查詢。</div></div></td></tr>`;
    const filterSummary = `共 ${state.summary.total || 0} 筆 · ${state.summary.actorCount || 0} 位操作人 · 最近事件 ${formatAuditOccurredAt(state.summary.latestOccurredAt)}`;
    const healthBadge = health.ready === false
      ? `<span class="review-status-badge pending">後端未就緒</span>`
      : `<span class="review-status-badge approved">後端正常</span>`;
    const pager = renderAuditTrailPager(state.page);

    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">稽核追蹤</div><h1 class="page-title">操作稽核軌跡</h1><p class="page-subtitle">查詢後端權限控管與稽核寫入結果，協助管理者追查異動來源。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshAuditTrail">${ic('refresh-cw', 'icon-sm')} 重新整理</button><button type="button" class="btn btn-secondary" data-action="admin.exportAuditTrail">${ic('download', 'icon-sm')} 匯出 JSON</button></div></div><div class="review-callout"><span class="review-callout-icon">${ic('shield-check', 'icon-sm')}</span><div>${healthBadge} <strong style="margin-left:8px">${esc(filterSummary)}</strong><div class="review-card-subtitle" style="margin-top:6px">${esc(health.repository || '')}${health.actor && health.actor.tokenMode ? ` · token=${esc(health.actor.tokenMode)}` : ''}${health.message ? ` · ${esc(health.message)}` : ''}</div></div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('scroll-text')}</div><div class="stat-value">${state.summary.total || 0}</div><div class="stat-label">符合條件事件</div></div><div class="stat-card closed"><div class="stat-icon">${ic('users')}</div><div class="stat-value">${state.summary.actorCount || 0}</div><div class="stat-label">操作人數</div></div><div class="stat-card pending"><div class="stat-icon">${ic('activity')}</div><div class="stat-value">${eventTypeOptions.length}</div><div class="stat-label">事件類型</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('clock-3')}</div><div class="stat-value">${state.summary.latestOccurredAt ? esc(formatAuditOccurredAt(state.summary.latestOccurredAt).slice(5, 16)) : '—'}</div><div class="stat-label">最近事件</div></div></div><div class="review-grid"><div class="card review-table-card"><div class="card-header"><span class="card-title">稽核紀錄查詢</span><span class="review-card-subtitle">${esc(filterSummary)}</span></div><form id="audit-filter-form"><div class="panel-grid-two" style="margin-bottom:18px"><div class="form-group"><label class="form-label">關鍵字</label><input type="text" class="form-input" id="audit-keyword" value="${esc(state.filters.keyword)}" placeholder="事件類型、email、recordId、payload 關鍵字"></div><div class="form-group"><label class="form-label">事件類型</label><select class="form-select" id="audit-event-type">${eventTypeSelect}</select></div><div class="form-group"><label class="form-label">操作人 email</label><input type="text" class="form-input" id="audit-actor-email" value="${esc(state.filters.actorEmail)}" placeholder="actorEmail"></div><div class="form-group"><label class="form-label">單位代碼</label><input type="text" class="form-input" id="audit-unit-code" value="${esc(state.filters.unitCode)}" placeholder="unitCode"></div><div class="form-group"><label class="form-label">紀錄編號</label><input type="text" class="form-input" id="audit-record-id" value="${esc(state.filters.recordId)}" placeholder="recordId"></div><div class="form-group"><label class="form-label">筆數上限</label><select class="form-select" id="audit-limit"><option value="50" ${state.filters.limit === '50' ? 'selected' : ''}>50</option><option value="100" ${state.filters.limit === '100' ? 'selected' : ''}>100</option><option value="200" ${state.filters.limit === '200' ? 'selected' : ''}>200</option></select></div></div><div class="form-actions" style="justify-content:flex-start;margin-bottom:8px"><button type="submit" class="btn btn-primary">${ic('search', 'icon-sm')} 套用篩選</button><button type="button" class="btn btn-secondary" data-action="admin.resetAuditTrailFilters">${ic('rotate-ccw', 'icon-sm')} 清空條件</button></div></form>${pager}${buildReviewTableShell('audit-trail-table', '<th>時間</th><th>事件</th><th>操作人</th><th>目標</th><th>單位</th><th>內容摘要</th><th>差異</th>', rows, { toolbarSubtitle: '套用篩選後可直接拖曳表格左右移動，也可用右側按鈕快速平移。' })}</div><div class="card review-history-card"><div class="card-header"><span class="card-title">事件分布</span><span class="review-card-subtitle">最近查詢摘要</span></div><div class="review-history-list">${formatAuditEventTypeSummary(state.summary)}</div></div></div></div>`;
    const form = document.getElementById('audit-filter-form');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        renderAuditTrail(getAuditTrailFiltersFromDom());
      });
    }
    wireReviewTableScrollers(app);
    refreshIcons();
  }

  function handleClearLoginLogs() {
    if (!canManageUsers()) {
      toast('僅最高管理員可清除登入紀錄', 'error');
      return;
    }
    if (!confirm('確定要清除所有登入紀錄嗎？')) return;
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
    const logs = (loadLoginLogs() || []).slice().reverse();
    const rows = logs.length ? logs.map((log) => {
      const success = !!(log && log.success);
      const badge = success
        ? '<span class="review-status-badge approved">成功</span>'
        : '<span class="review-status-badge danger">失敗</span>';
      return `<tr><td>${esc(fmtTime(log && log.time) || '—')}</td><td style="font-weight:500">${esc(log && log.username || '—')}</td><td>${esc(log && log.name || '—')}</td><td>${esc(log && log.role || '—')}</td><td>${badge}</td></tr>`;
    }).join('') : '<tr><td colspan="5"><div class="empty-state" style="padding:40px 24px"><div class="empty-state-title">目前沒有登入紀錄</div><div class="empty-state-desc">系統會保留最近的登入與失敗紀錄。</div></div></td></tr>';
    const app = document.getElementById('app');
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">登入紀錄</div><h1 class="page-title">登入紀錄</h1><p class="page-subtitle">最近 200 筆帳號登入與失敗事件。</p></div><div class="review-header-actions"><button type="button" class="btn btn-danger" data-action="admin.clearLoginLogs">${ic('trash-2', 'icon-sm')} 清除紀錄</button></div></div><div class="card"><div class="table-wrapper"><table><thead><tr><th>時間</th><th>帳號</th><th>姓名</th><th>角色</th><th>結果</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
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
      return `<div class="empty-state" style="padding:32px 20px"><div class="empty-state-title">目前沒有待處理的 schema 問題</div><div class="empty-state-desc">所有受管 store 都已使用最新 envelope 與版本格式。</div></div>`;
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
      : `<div class="empty-state" style="padding:24px 18px"><div class="empty-state-title">附件引用正常</div><div class="empty-state-desc">所有 IndexedDB 附件都還有對應的單據引用。</div></div>`;
    return `<div class="card review-history-card"><div class="card-header"><span class="card-title">附件資料庫</span><span class="review-card-subtitle">${esc(attachmentHealth.database)}</span></div><div class="review-history-list"><div class="review-callout compact"><span class="review-callout-icon">${ic('paperclip', 'icon-sm')}</span><div>共 ${attachmentHealth.totalAttachments} 筆附件，已引用 ${attachmentHealth.referencedAttachments} 筆，${orphanText}。</div></div>${orphanList}</div></div>`;
  }

  async function renderSchemaHealth() {
    if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可檢視資料健康資訊', 'error'); return; }
    const health = getSchemaHealth();
    const attachmentHealth = await getAttachmentHealth();
    const attentionCount = health.totals.attention + health.totals.error + health.totals.missing;
    const rows = health.stores.map((store) => `<tr><td><div class="review-unit-name">${esc(store.label)}</div><div class="review-card-subtitle" style="margin-top:4px">${esc(store.key)}</div></td><td>${schemaStatusBadge(store)}</td><td>v${store.storedVersion === null ? '—' : store.storedVersion} / v${store.expectedVersion}</td><td>${store.hasEnvelope ? 'Versioned envelope' : (store.exists ? 'Legacy raw JSON' : 'Not created')}</td><td>${esc(store.summary)}</td><td>${store.recordCount}</td><td>${formatSchemaBytes(store.rawSize)}</td></tr>`).join('');
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
    editUser: function ({ dataset }) {
      showUserModal(findUser(dataset.username));
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
      renderUnitContactReview(unitContactReviewState.filters);
    },
    applyUnitContactFilters: function () {
      renderUnitContactReview(getUnitContactReviewFiltersFromDom());
    },
    resetUnitContactFilters: function () {
      renderUnitContactReview({
        status: 'pending_review',
        keyword: '',
        email: '',
        limit: '50'
      });
    },
    unitContactApprove: function ({ dataset }) {
      promptReviewComment('審核通過並直接啟用', '可補充首次登入提醒或處理說明。', '確認通過', async function (reviewComment) {
        try {
          const result = await reviewUnitContactApplication({
            id: dataset.id,
            status: 'approved',
            reviewComment
          });
          toast(result && result.delivery && result.delivery.sent ? '已通過、帳號已啟用並寄送登入資訊' : '已通過，帳號已直接啟用');
          renderUnitContactReview(unitContactReviewState.filters);
        } catch (error) {
          toast(String(error && error.message || error || '審核失敗'), 'error');
        }
      });
    },
    unitContactReturn: function ({ dataset }) {
      promptReviewComment('退回補件', '請填寫需要補充或修正的內容。', '確認退回', async function (reviewComment) {
        try {
          const result = await reviewUnitContactApplication({
            id: dataset.id,
            status: 'returned',
            reviewComment
          });
          toast(result && result.delivery && result.delivery.sent ? '已退回並寄送通知' : '已退回補件');
          renderUnitContactReview(unitContactReviewState.filters);
        } catch (error) {
          toast(String(error && error.message || error || '退回失敗'), 'error');
        }
      });
    },
    unitContactReject: function ({ dataset }) {
      promptReviewComment('未核准', '請填寫未核准原因。', '確認未核准', async function (reviewComment) {
        try {
          const result = await reviewUnitContactApplication({
            id: dataset.id,
            status: 'rejected',
            reviewComment
          });
          toast(result && result.delivery && result.delivery.sent ? '已拒絕並寄送通知' : '已標記未核准');
          renderUnitContactReview(unitContactReviewState.filters);
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
      const page = auditTrailState.page || {};
      const nextOffset = Math.max(0, Number(page.prevOffset || 0) || 0);
      return renderAuditTrail({ ...auditTrailState.filters, offset: String(nextOffset) });
    },
    auditTrailNextPage: function () {
      const page = auditTrailState.page || {};
      const nextOffset = Math.max(0, Number(page.nextOffset || 0) || 0);
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
