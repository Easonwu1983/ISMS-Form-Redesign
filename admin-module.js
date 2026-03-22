(function () {
  window.createAdminModule = function createAdminModule(deps) {
    const {
      ROLES,
      ROLE_BADGE,
      currentUser,
      isAdmin,
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

    const DEFAULT_AUDIT_FILTERS = Object.freeze({
      keyword: '',
      eventType: '',
      actorEmail: '',
      unitCode: '',
      recordId: '',
      limit: '100'
    });
    const auditTrailState = {
      filters: { ...DEFAULT_AUDIT_FILTERS },
      items: [],
      summary: { total: 0, actorCount: 0, latestOccurredAt: '', eventTypes: [] },
      health: null,
      lastLoadedAt: '',
      filterSignature: '',
      loading: false
    };
    const AUDIT_TRAIL_SYNC_FRESHNESS_MS = 30000;
    const AUDIT_TRAIL_HEALTH_CACHE_MS = 30000;
    const AUDIT_TRAIL_QUERY_CACHE_MS = 30000;
    let auditTrailLoadPromise = null;
    let auditTrailHealthLoadPromise = null;
    let auditTrailHealthCache = {
      value: null,
      loadedAt: 0
    };
    let auditTrailQueryCache = {
      signature: '',
      loadedAt: 0,
      value: null
    };
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
      const units = getAuthorizedUnits(user);
      return units.length ? units.join('、') : '未指定';
    }

    function formatUserReviewUnitSummary(user) {
      const units = getReviewUnits(user);
      return units.length ? units.join('、') : '沿用既有審核邏輯';
    }

    function getGovernanceReviewScopeUnits(user) {
      const units = getReviewUnits(user);
      return Array.isArray(units) ? units.map((unit) => String(unit || '').trim()).filter(Boolean) : [];
    }

    function getAuditTrailFilterSignature(filters) {
      const next = { ...DEFAULT_AUDIT_FILTERS, ...(filters || {}) };
      return [
        next.keyword,
        next.eventType,
        next.actorEmail,
        next.unitCode,
        next.recordId,
        next.limit
      ].map((value) => String(value || '').trim()).join('|');
    }

    function isAuditTrailDataFresh(signature) {
      if (!signature || auditTrailState.filterSignature !== signature) return false;
      if (!Array.isArray(auditTrailState.items) || !auditTrailState.items.length) return false;
      const parsedAt = Date.parse(String(auditTrailState.lastLoadedAt || '').trim());
      if (!Number.isFinite(parsedAt)) return false;
      return (Date.now() - parsedAt) < AUDIT_TRAIL_SYNC_FRESHNESS_MS;
    }

    function isAuditTrailHealthFresh() {
      if (!auditTrailHealthCache || !auditTrailHealthCache.value) return false;
      return (Date.now() - Number(auditTrailHealthCache.loadedAt || 0)) < AUDIT_TRAIL_HEALTH_CACHE_MS;
    }

    function isAuditTrailQueryFresh(signature) {
      if (!signature || auditTrailQueryCache.signature !== signature) return false;
      if (!auditTrailQueryCache || !auditTrailQueryCache.value) return false;
      return (Date.now() - Number(auditTrailQueryCache.loadedAt || 0)) < AUDIT_TRAIL_QUERY_CACHE_MS;
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

    function renderSecurityWindowScopeRows(unit) {
      const rows = Array.isArray(unit && unit.scopeRows) ? unit.scopeRows : [];
      if (!rows.length) {
        return `<tr><td colspan="4"><div class="empty-state" style="padding:24px 18px"><div class="empty-state-title">沒有可顯示的單位範圍</div><div class="empty-state-desc">請確認單位資料與治理設定是否已就緒。</div></div></td></tr>`;
      }
      return rows.map((row) => {
        const meta = getSecurityWindowUnitStatusMeta(row.status);
        const holders = Array.isArray(row.holders) ? row.holders : [];
        const pending = Array.isArray(row.pending) ? row.pending : [];
        const holderHtml = holders.length
          ? holders.map((person) => `<span class="cl-governance-child-chip">${esc(person.name || person.username || '—')} · ${esc(formatSecurityRolesSummary(person.securityRoles))}</span>`).join('')
          : '<span class="cl-governance-child-chip cl-governance-child-chip--muted">尚未指定</span>';
        const pendingHtml = pending.length
          ? pending.map((item) => `<span class="cl-governance-child-chip">${esc(item.applicantName || item.applicantEmail || '—')} · ${esc(formatSecurityRolesSummary(item.securityRoles))}</span>`).join('')
          : '<span class="cl-governance-child-chip cl-governance-child-chip--muted">無待審核申請</span>';
        return `<tr><td style="font-weight:600;color:var(--text-primary)">${esc(row.label || row.unit || '—')}</td><td><span class="review-status-badge ${meta.tone}">${esc(meta.label)}</span></td><td>${holderHtml}${pending.length ? `<div class="review-card-subtitle" style="margin-top:8px">待審核：${pendingHtml}</div>` : ''}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(row.exempted ? '已整併至一級單位' : (row.isTop ? '一級單位' : '二級單位'))}</td></tr>`;
      }).join('');
    }

    function renderSecurityWindowUnitCards(units) {
      const rows = Array.isArray(units) ? units : [];
      if (!rows.length) {
        return `<div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">目前沒有符合條件的資安窗口單位</div><div class="empty-state-desc">請調整關鍵字、狀態或先確認單位治理設定。</div></div>`;
      }
      return rows.map((unit) => {
        const statusMeta = getSecurityWindowUnitStatusMeta(unit.status);
        const holderCount = Array.isArray(unit.holders) ? unit.holders.length : 0;
        const pendingCount = Array.isArray(unit.pending) ? unit.pending.length : 0;
        const childCount = Array.isArray(unit.children) ? unit.children.length : 0;
        const childSummary = `${holderCount} 位資安窗口 · ${pendingCount} 筆待審核 · ${childCount} 個二級單位`;
        return `<details class="card governance-card security-window-card" data-security-window-unit="${esc(unit.unit)}"><summary class="security-window-summary"><div><div class="review-unit-name">${esc(unit.unit)}</div><div class="review-card-subtitle" style="margin-top:4px">${esc(unit.category || '正式單位')} · ${esc(unit.mode === 'consolidated' ? '合併 / 統一填報' : '獨立填報')}</div></div><div class="security-window-summary-meta"><span class="review-status-badge ${statusMeta.tone}">${esc(statusMeta.label)}</span><div class="review-card-subtitle" style="margin-top:6px">${esc(childSummary)}</div></div></summary><div class="governance-card-body" style="padding-top:12px"><div class="review-callout compact"><span class="review-callout-icon">${ic('users-round', 'icon-sm')}</span><div>${esc(unit.note || (unit.mode === 'consolidated' ? '轄下單位由一級單位統一管理。' : '轄下單位需各自維護資安窗口。'))}</div></div><div class="table-wrapper" style="margin-top:14px"><table class="review-data-table"><thead><tr><th>單位</th><th>狀態</th><th>資安窗口</th><th>備註</th></tr></thead><tbody>${renderSecurityWindowScopeRows(unit)}</tbody></table></div></div></details>`;
      }).join('');
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
    const rows = users.map(u => `<tr><td style="font-weight:500;color:var(--text-primary)">${esc(u.username)}</td><td>${esc(u.name)}</td><td><span class="badge-role ${getRoleBadgeClass(u.role)}">${getRoleLabel(u.role)}</span></td><td>${esc(formatSecurityRolesSummary(u.securityRoles))}</td><td>${esc(u.unit || '未指定')}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(formatUserUnitSummary(u))}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(formatUserReviewUnitSummary(u))}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(u.email || '')}</td><td><div class="user-actions">${u.username !== 'admin' ? `<button class="btn btn-sm btn-secondary" data-action="admin.editUser" data-username="${esc(u.username)}">${ic('edit-2', 'btn-icon-svg')}</button><button class="btn btn-sm btn-danger" data-action="admin.deleteUser" data-username="${esc(u.username)}">${ic('trash-2', 'btn-icon-svg')}</button>` : ''}</div></td></tr>`).join('');
    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">帳號管理</h1><p class="page-subtitle">管理角色、主要單位與多單位授權範圍</p></div><button class="btn btn-primary" data-action="admin.addUser">${ic('user-plus', 'icon-sm')} 新增使用者</button></div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>帳號</th><th>姓名</th><th>角色</th><th>資安窗口</th><th>主要單位</th><th>授權單位</th><th>可審核單位</th><th>電子郵件</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
  }

  function showUserModal(eu) {
    const isE = !!eu;
    const title = isE ? '編輯使用者' : '新增使用者';
    const mr = document.getElementById('modal-root');
    const units = getAuthorizedUnits(eu);
    const reviewUnits = getReviewUnits(eu);
    const initUnit = units[0] || '';
    const selectedSecurityRoles = normalizeSecurityRoles(eu && eu.securityRoles);

    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal"><div class="modal-header"><span class="modal-title">${esc(title)}</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><form id="user-form">
      <div class="form-group"><label class="form-label form-required">帳號</label><input type="text" class="form-input" id="u-username" value="${isE ? esc(eu.username) : ''}" ${isE ? 'readonly' : ''} required></div>
      <div class="form-group"><label class="form-label form-required">姓名</label><input type="text" class="form-input" id="u-name" value="${isE ? esc(eu.name) : ''}" required></div>
      <div class="form-group"><label class="form-label form-required">電子郵件</label><input type="email" class="form-input" id="u-email" value="${isE ? esc(eu.email || '') : ''}" required></div>
      <div class="form-row"><div class="form-group"><label class="form-label form-required">角色</label><select class="form-select" id="u-role" required><option value="${ROLES.UNIT_ADMIN}" ${isE && eu.role === ROLES.UNIT_ADMIN ? 'selected' : ''}>單位管理員</option><option value="${ROLES.ADMIN}" ${isE && eu.role === ROLES.ADMIN ? 'selected' : ''}>最高管理者</option></select></div>
      <div class="form-group"><label class="form-label" id="u-unit-label">主要單位</label>${buildUnitCascadeControl('u-unit', initUnit, false, false)}</div></div>
      <div class="form-group" id="u-security-role-group"><label class="form-label form-required">資安角色</label>${buildSecurityRoleCheckboxes(selectedSecurityRoles)}<div class="form-hint">請至少選擇一種資安角色身分。</div></div>
      <div class="form-group"><label class="form-label">額外授權單位</label>${buildUnitMultiSelectControl('u-units', units.slice(1), '請輸入單位名稱', '可搜尋並加入多個授權單位。')}</div>
      <div class="form-group"><label class="form-label">可審核單位</label>${buildUnitMultiSelectControl('u-review-units', reviewUnits, '請輸入單位名稱', '僅單位管理員可設定，留空表示不限制。')}</div>
      <div class="form-group"><label class="form-label ${isE ? '' : 'form-required'}">${isE ? '密碼（留空不修改）' : '密碼'}</label><input type="text" class="form-input" id="u-pass" ${isE ? '' : 'required'}></div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">${isE ? ic('save', 'icon-sm') + ' 儲存' : ic('plus', 'icon-sm') + ' 新增'}</button><button type="button" class="btn btn-secondary" data-dismiss-modal>取消</button></div>
    </form></div></div>`;

    initUnitCascade('u-unit', initUnit, { disabled: false });

    const roleEl = document.getElementById('u-role');
    const unitLabel = document.getElementById('u-unit-label');
    const parentEl = document.getElementById('u-unit-parent');
    const securityRoleGroup = document.getElementById('u-security-role-group');
    const extraUnitsPicker = initUnitMultiSelectControl('u-units');
    const reviewUnitsPicker = initUnitMultiSelectControl('u-review-units');
    const unitEl = document.getElementById('u-unit');

    function setSecurityRoles(values) {
      const selected = new Set(normalizeSecurityRoles(values));
      document.querySelectorAll('input[name="u-security-roles"]').forEach((input) => {
        input.checked = selected.has(String(input.value || '').trim());
      });
    }

    function syncScopedUnits() {
      if (roleEl.value !== ROLES.UNIT_ADMIN) return;
      const roles = readSelectedSecurityRoles();
      const mainUnit = String(unitEl.value || '').trim();
      const childUnits = getDirectChildUnits(mainUnit);
      if (roles.includes('一級單位資安窗口') && childUnits.length) {
        extraUnitsPicker.setValues(childUnits);
        reviewUnitsPicker.setValues(childUnits);
      } else if (roles.length === 1 && roles[0] === '二級單位資安窗口') {
        reviewUnitsPicker.clear();
      }
    }

    function syncRoleFields() {
      const unitAdminMode = roleEl.value === ROLES.UNIT_ADMIN;
      unitLabel.textContent = unitAdminMode ? '主要單位' : '主要單位（選填）';
      parentEl.required = unitAdminMode;
      if (securityRoleGroup) {
        securityRoleGroup.style.display = unitAdminMode ? '' : 'none';
      }
      if (!unitAdminMode) {
        setSecurityRoles([]);
      }
      syncScopedUnits();
    }

    syncRoleFields();    unitEl.addEventListener('change', syncScopedUnits);
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
      const finalUnits = Array.from(new Set([ut, ...extraUnits].filter(Boolean)));

      if (rl === ROLES.UNIT_ADMIN && !finalUnits.length) { toast('請至少指定一個授權單位', 'error'); return; }
      if (rl === ROLES.UNIT_ADMIN && !securityRoles.length) { toast('請至少選擇一種資安角色身分', 'error'); return; }

      const payload = { name: nm, email: em, role: rl, unit: finalUnits[0] || '', units: finalUnits, activeUnit: finalUnits[0] || '', securityRoles };
      if (pw) payload.password = pw;
      try {
        if (!isE && findUser(un)) { toast('帳號已存在', 'error'); return; }
        await submitUserUpsert({ username: un, ...payload });
        await syncUsersFromM365({ silent: true });
        await submitReviewScopeReplace({
          username: un,
          units: rl === ROLES.UNIT_ADMIN ? reviewScopeUnits : [],
          actorName: currentUser() && currentUser().name,
          actorEmail: currentUser() && currentUser().email
        });
        await syncReviewScopesFromM365({ silent: true });
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
      if (!isAdmin() && !isUnitAdmin()) { navigate('dashboard'); toast('您沒有管理單位治理的權限', 'error'); return; }
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
    const cardsHtml = items.length ? items.map((unit) => buildGovernanceUnitCard(unit)).join('') : `<div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('layout-grid')}</div><div class="empty-state-title">沒有符合條件的單位</div><div class="empty-state-desc">請嘗試調整關鍵字，或先確認單位治理範圍。</div></div>`;
    app.innerHTML = `<div class="animate-in">
      <div class="page-header review-page-header"><div><div class="page-eyebrow">單位治理</div><h1 class="page-title">填報模式與授權設定</h1><p class="page-subtitle">設定一級單位的獨立 / 合併填報模式，並同步反映在儀表板與管考清單。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitReview">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div>
      <div class="stats-grid review-stats-grid">
        <div class="stat-card total"><div class="stat-icon">${ic('building-2')}</div><div class="stat-value">${counts.total}</div><div class="stat-label">可設定單位</div></div>
        <div class="stat-card closed"><div class="stat-icon">${ic('layers-3')}</div><div class="stat-value">${counts.consolidated}</div><div class="stat-label">合併填報</div></div>
        <div class="stat-card pending"><div class="stat-icon">${ic('split')}</div><div class="stat-value">${counts.independent}</div><div class="stat-label">獨立填報</div></div>
        <div class="stat-card overdue"><div class="stat-icon">${ic('users')}</div><div class="stat-value">${counts.children}</div><div class="stat-label">轄下二級單位</div></div>
      </div>
      <div class="card review-table-card governance-table-card">
        <div class="card-header"><span class="card-title">治理設定清單</span><span class="review-card-subtitle">最高管理員可管理全部單位；單位管理員僅可管理自己被授權的單位</span></div>
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
        <div class="governance-grid">${cardsHtml}</div>
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
    const source = inventory && typeof inventory === 'object' ? inventory : { units: [], people: [], summary: {} };
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
    return { units, people, summary, generatedAt: source.generatedAt || '' };
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
        if (!isSecurityWindowInventoryFresh() && !securityWindowLoadPromise) {
          loadSecurityWindowInventory(false).then(() => {
            if (document.getElementById('security-window-filter-form')) {
              renderSecurityWindow(resolvedFilters);
            }
          }).catch((error) => {
            console.warn('security window background refresh failed', error);
          });
        } else if (securityWindowLoadPromise) {
          inventory = await securityWindowLoadPromise;
        } else {
          app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">系統管理</div><h1 class="page-title">資安窗口</h1><p class="page-subtitle">盤點全校各單位資安窗口、待審核申請與尚未設定狀態，僅最高管理者可檢視。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" disabled>${ic('loader-circle', 'icon-sm')} 載入中</button></div></div><div class="card" style="padding:32px;text-align:center;color:var(--text-secondary)">正在載入資安窗口盤點資料...</div></div>`;
          refreshIcons();
          inventory = await loadSecurityWindowInventory(!!opts.force);
        }
      } catch (error) {
        app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">系統管理</div><h1 class="page-title">資安窗口</h1><p class="page-subtitle">資安窗口盤點資料載入失敗，請稍後再試。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshSecurityWindow">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="card"><div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">載入失敗</div><div class="empty-state-desc">${esc(String(error && error.message || error || '無法載入資安窗口盤點資料'))}</div></div></div></div>`;
        refreshIcons();
        return;
      }
    }

    securityWindowState.inventory = inventory;
    securityWindowState.lastLoadedAt = inventory.generatedAt || new Date().toISOString();
    securityWindowState.filterSignature = filterSignature;
    const filtered = filterSecurityWindowInventory(inventory, resolvedFilters);
    const summary = filtered.summary;
    const unitCardsHtml = renderSecurityWindowUnitCards(filtered.units);
    const peopleRowsHtml = renderSecurityWindowPersonRows(filtered.people);
    app.innerHTML = `<div class="animate-in">
      <div class="page-header review-page-header">
        <div>
          <div class="page-eyebrow">系統管理</div>
          <h1 class="page-title">資安窗口</h1>
          <p class="page-subtitle">盤點全校各單位的資安窗口配置、待審核申請與未設定單位，僅最高管理者可檢視。</p>
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
        <div class="card-header"><span class="card-title">單位盤點</span><span class="review-card-subtitle">依一級單位展開，顯示各單位與二級單位的資安窗口狀態</span></div>
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
      downloadJson('isms-audit-trail-' + new Date().toISOString().slice(0, 10) + '.json', {
        exportedAt: new Date().toISOString(),
        filters: auditTrailState.filters,
        health: auditTrailState.health,
        summary: auditTrailState.summary,
        items: auditTrailState.items
      });
      toast('已匯出操作稽核軌跡 JSON');
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
