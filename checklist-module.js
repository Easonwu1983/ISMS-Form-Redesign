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
        return `<div class="form-group cl-evidence-upload-group"><label class="form-label">上傳佐證附件</label>${buildChecklistEvidenceReadonlySlot(item.id)}</div>`;
      }
      return `<div class="form-group cl-evidence-upload-group"><label class="form-label">上傳佐證附件</label><label class="training-file-input checklist-file-input"><input type="file" id="cl-file-${item.id}" data-item-id="${item.id}" multiple accept="image/*,.pdf"><span class="training-file-input-copy"><strong>選擇佐證附件</strong><small>${existingCount ? `目前已附 ${existingCount} 個檔案` : '支援 JPG / PNG / PDF，單檔上限 5MB。'}</small></span></label>${buildChecklistEvidencePreviewSlot(item.id, 'checklist-evidence-files')}</div>`;
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
    let checklistListRenderCache = { signature: '', html: '' };
    let checklistListSnapshotCache = { token: '', length: 0, items: [], years: [] };

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
        if (year) years.add(year);
      });
      const currentYear = String(new Date().getFullYear() - 1911);
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
        const year = getChecklistAuditYear(item) || '未知';
        const unit = getChecklistTier1Unit(item) || String(item && item.unit || '未命名單位').trim();
        const yearKey = year;
        if (!groups.has(yearKey)) groups.set(yearKey, new Map());
        const yearGroups = groups.get(yearKey);
        if (!yearGroups.has(unit)) {
          yearGroups.set(unit, { year, unit, items: [] });
        }
        yearGroups.get(unit).items.push(item);
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
      const searchText = [
        item && item.id,
        item && item.unit,
        getChecklistTier1Unit(item),
        item && item.fillerName,
        item && item.fillerUsername,
        item && item.auditYear,
        item && item.status
      ].filter(Boolean).join(' ');
      return '<tr data-route="' + esc(target) + '" data-cl-search-text="' + esc(searchText) + '" class="cl-list-row">'
        + '<td class="record-id-col">' + renderCopyIdCell(item.id, '檢核表編號', true) + '</td>'
        + '<td><div class="cl-list-unit">' + esc(item.unit) + '<small>' + esc(getChecklistTier1Unit(item) || '—') + '</small>' + (governanceNote ? '<div class="cl-list-unit-note">' + esc(governanceNote) + '</div>' : '') + '</div></td>'
        + '<td>' + esc(item.fillerName || '—') + '<div class="review-card-subtitle" style="margin-top:4px">' + esc(item.fillerUsername || '—') + '</div></td>'
        + '<td>' + esc(getChecklistAuditYear(item)) + ' 年</td>'
        + '<td>' + buildChecklistListStatusPill(item) + '</td>'
        + '<td><div class="cl-rate-bar"><div class="cl-rate-fill" style="width:' + rate + '%"></div></div><span class="cl-rate-text">' + rate + '%</span></td>'
        + '<td>' + fmt(item && item.fillDate) + '</td>'
        + '</tr>';
    }

    function buildChecklistListYearTabs(years) {
      const activeYear = String(checklistBrowseState.year || '').trim() || 'all';
      const tabButtons = ['all'].concat(Array.isArray(years) ? years : []).map((year) => {
        const isActive = activeYear === year;
        const label = year === 'all' ? '全部' : (year === String(new Date().getFullYear() - 1911) ? `今年度（${year}）` : `${year} 年`);
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
        + '<button type="button" class="btn btn-secondary" data-action="checklist.resetListFilters">' + ic('rotate-ccw', 'icon-sm') + ' 重設</button>'
        + '</div>'
        + '</div>';
    }

    function getChecklistListSnapshot(items) {
      const source = Array.isArray(items) ? items.slice() : [];
      const token = typeof getStoreTouchToken === 'function' ? String(getStoreTouchToken('checklists') || '') : '';
      const cacheKey = token + '::' + String(source.length);
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

    function renderChecklistListContent(items) {
      const signature = [
        typeof getStoreTouchToken === 'function' ? String(getStoreTouchToken('checklists') || '') : '',
        String(checklistBrowseState.year || 'all'),
        String(checklistBrowseState.status || 'all'),
        String(checklistBrowseState.keyword || '')
      ].join('::');
      const contentEl = document.querySelector('.cl-list-content');
      if (!contentEl) return;
      if (checklistListRenderCache.signature === signature && contentEl.dataset.checklistRenderSignature === signature) {
        applyChecklistKeywordFilter();
        return;
      }
      const filtered = filterChecklistListItems(items);
      const grouped = groupChecklistListItems(filtered);
      const html = grouped.length ? grouped.map((yearGroup) => buildChecklistYearAccordion(yearGroup)).join('') : '';
      checklistListRenderCache = { signature, html };
      contentEl.dataset.checklistRenderSignature = signature;
      contentEl.innerHTML = `<div class="card checklist-empty-card cl-list-empty-state" hidden><div class="empty-state checklist-empty-state"><div class="empty-state-icon">${ic('clipboard-list')}</div><div class="empty-state-title">目前沒有符合條件的檢核表</div><div class="empty-state-desc">可切換年份、狀態或關鍵字重新搜尋。</div></div></div>`
        + html;
      refreshIcons();
      bindCopyButtons();
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
      const rowEls = Array.from(contentEl.querySelectorAll('.cl-list-row'));
      rowEls.forEach((row) => {
        const haystack = String(row.getAttribute('data-cl-search-text') || '').toLowerCase();
        row.hidden = !!keyword && !haystack.includes(keyword);
      });
      const unitEls = Array.from(contentEl.querySelectorAll('.cl-unit-accordion'));
      unitEls.forEach((unitEl) => {
        const hasVisibleRow = Array.from(unitEl.querySelectorAll('.cl-list-row')).some((row) => !row.hidden);
        unitEl.hidden = !hasVisibleRow;
        unitEl.open = hasKeyword ? hasVisibleRow : false;
      });
      const yearEls = Array.from(contentEl.querySelectorAll('.cl-year-accordion'));
      yearEls.forEach((yearEl) => {
        const hasVisibleUnit = Array.from(yearEl.querySelectorAll('.cl-unit-accordion')).some((unitEl) => !unitEl.hidden);
        yearEl.hidden = !hasVisibleUnit;
        yearEl.open = hasVisibleUnit ? true : false;
      });
      const emptyState = contentEl.querySelector('.cl-list-empty-state');
      const hasVisibleRows = rowEls.some((row) => !row.hidden);
      if (emptyState) emptyState.hidden = hasVisibleRows;
      const keywordEl = document.getElementById('cl-list-keyword');
      if (hasKeyword && keywordEl && document.activeElement === keywordEl && typeof keywordEl.focus === 'function') {
        keywordEl.focus({ preventScroll: true });
      }
    }

    function buildChecklistYearAccordion(yearGroup) {
      const unitCards = Array.isArray(yearGroup && yearGroup.units) ? yearGroup.units : [];
      const totalCount = unitCards.reduce((sum, group) => sum + group.items.length, 0);
      const closedCount = unitCards.reduce((sum, group) => sum + group.items.filter((item) => normalizeChecklistStatus(item.status) === CHECKLIST_STATUS_SUBMITTED).length, 0);
      const yearValue = String(yearGroup && yearGroup.year || '').trim();
      const showDelete = isAdmin() && yearValue && yearValue !== '未知';
      const deleteButton = showDelete
        ? '<button type="button" class="btn btn-sm btn-danger cl-year-delete" data-action="checklist.deleteYear" data-year="' + esc(yearValue) + '" title="刪除年度資料">' + ic('trash-2', 'btn-icon-svg') + ' 刪除年度</button>'
        : '';
      const body = unitCards.length
        ? unitCards.map((group) => {
            const groupId = 'cl-year-' + yearGroup.year + '-unit-' + group.unit.replace(/[^\w\u4e00-\u9fff]+/g, '-');
            const rows = group.items.map((item) => renderChecklistListRow(item)).join('');
            const groupClosed = group.items.filter((item) => normalizeChecklistStatus(item.status) === CHECKLIST_STATUS_SUBMITTED).length;
            const groupTotal = group.items.length;
            return '<details class="cl-unit-accordion" id="' + esc(groupId) + '"><summary class="cl-unit-summary"><div><div class="cl-unit-title">' + esc(group.unit) + '</div><div class="cl-unit-meta">已結案 ' + groupClosed + ' / ' + groupTotal + ' 份</div></div><div class="cl-unit-summary-right"><span class="badge ' + (groupClosed === groupTotal && groupTotal > 0 ? 'badge-closed' : 'badge-pending') + '"><span class="badge-dot"></span>' + groupClosed + ' / ' + groupTotal + '</span><span class="cl-unit-toggle">' + ic('chevron-down', 'icon-sm') + '</span></div></summary><div class="cl-unit-body"><div class="table-wrapper"><table><thead><tr><th class="record-id-head">編號</th><th>受稽單位</th><th>填報人員</th><th>稽核年度</th><th>狀態</th><th>完成率</th><th>填報日期</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></details>';
          }).join('')
        : '<div class="empty-state checklist-empty-state"><div class="empty-state-icon">' + ic('clipboard-list') + '</div><div class="empty-state-title">此年度沒有資料</div><div class="empty-state-desc">可切換到其他年份，或使用上方關鍵字搜尋。</div></div>';
      return '<details class="cl-year-accordion" open><summary class="cl-year-summary"><div><div class="cl-year-title">' + esc(yearGroup.year === '未知' ? '未知年度' : yearGroup.year + ' 年') + '</div><div class="cl-year-meta">已結案 ' + closedCount + ' / ' + totalCount + ' 份</div></div><div class="cl-year-summary-right"><span class="badge ' + (closedCount === totalCount && totalCount > 0 ? 'badge-closed' : 'badge-pending') + '"><span class="badge-dot"></span>' + closedCount + ' / ' + totalCount + '</span>' + deleteButton + '<span class="cl-unit-toggle">' + ic('chevron-down', 'icon-sm') + '</span></div></summary><div class="cl-year-body">' + body + '</div></details>';
    }

    async function renderChecklistList(options) {
    const opts = options || {};
    const syncPromise = opts.skipSync
      ? Promise.resolve()
      : syncChecklistsFromM365({ silent: true }).catch((error) => {
        console.warn('checklist list sync failed', error);
      });
    const snapshot = getChecklistListSnapshot(getVisibleChecklists());
    const checklists = snapshot.items;
    const years = snapshot.years;
    if (!checklistBrowseState.year || !years.includes(checklistBrowseState.year) && checklistBrowseState.year !== 'all') {
      checklistBrowseState.year = years.includes(String(new Date().getFullYear() - 1911)) ? String(new Date().getFullYear() - 1911) : (years[0] || 'all');
    }
    const fillBtn = canFillChecklist() ? `<a href="#checklist-fill" class="btn btn-primary">${ic('edit-3', 'icon-sm')} 填報檢核表</a>` : '';
    document.getElementById('app').innerHTML = `<div class="animate-in cl-list-page">
      <div class="page-header checklist-list-header"><div><h1 class="page-title">內稽檢核表</h1><p class="page-subtitle">按年度與一級單位分層檢視所有填報內容，可快速搜尋填報人員與單位狀態。</p></div><div class="page-header-actions">${fillBtn}</div></div>
      <div class="card cl-list-shell">
        <div class="cl-list-toolbar-wrap">
          ${buildChecklistListFilters()}
          <div class="cl-year-tabs-shell">
          <div class="cl-year-tabs-label">年份頁籤</div>
          ${buildChecklistListYearTabs(years)}
        </div>
        </div>
        <div class="cl-list-content"></div>
      </div>
    </div>`;
    renderChecklistListContent(checklists);
    syncChecklistListToolbarState();
    refreshIcons();
    bindCopyButtons();
    if (!opts.skipSync && syncPromise && typeof syncPromise.then === 'function') {
      syncPromise.then(() => {
        if (!String(window.location.hash || '').startsWith('#checklist')) return;
        renderChecklistList({ skipSync: true });
      }).catch((error) => {
        console.warn('checklist list background rerender failed', error);
      });
    }

    const keywordEl = document.getElementById('cl-list-keyword');
    const statusEl = document.getElementById('cl-list-status');
    const yearTabs = document.querySelectorAll('[data-checklist-year]');
    let browseTimer = null;
    const scheduleRerender = () => {
      if (browseTimer) window.clearTimeout(browseTimer);
      browseTimer = window.setTimeout(() => {
        browseTimer = null;
        applyChecklistKeywordFilter();
      }, 120);
    };
    keywordEl?.addEventListener('input', () => {
      checklistBrowseState.keyword = keywordEl.value;
      scheduleRerender();
    });
    statusEl?.addEventListener('change', () => {
      checklistBrowseState.status = statusEl.value;
      renderChecklistListContent(checklists);
      syncChecklistListToolbarState();
    });
    yearTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        checklistBrowseState.year = String(tab.dataset.checklistYear || 'all');
        renderChecklistListContent(checklists);
        syncChecklistListToolbarState();
      });
    });
    registerActionHandlers(document.getElementById('app'), {
      resetListFilters: function () {
        checklistBrowseState.keyword = '';
        checklistBrowseState.status = 'all';
        checklistBrowseState.year = String(new Date().getFullYear() - 1911);
        renderChecklistListContent(checklists);
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
      const label = done ? '✅ 已完成' : `已填 ${filled}/${total} 題`;
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
    if (!canFillChecklist()) { navigate('checklist'); toast('您沒有填報檢核表權限', 'error'); return; }

    const u = currentUser();
    const currentAuditYear = String(new Date().getFullYear() - 1911);
    const defaultScopedUnit = getScopedUnit(u) || u.unit || '';
    if (!id && u.role !== ROLES.ADMIN && defaultScopedUnit && getAuthorizedUnits(u).length <= 1) {
      const duplicateChecklist = findExistingChecklistForUnitYear(defaultScopedUnit, currentAuditYear);
      if (duplicateChecklist) {
        toast('本年度已存在檢核表，請至列表繼續編輯或查看，勿重複新增。', 'error');
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
    const selectedUnitCandidate = existing ? existing.unit : (getScopedUnit(u) || u.unit || '');
    const selectedUnitParts = typeof splitUnitValue === 'function' ? splitUnitValue(selectedUnitCandidate) : { parent: '', child: '' };
    const selectedUnitGovernanceMode = getChecklistGovernanceState(selectedUnitCandidate).mode;

    const checklistUnitLocked = !isAdmin(u) && getAuthorizedUnits(u).length <= 1;
    const checklistGovernanceLocked = !isAdmin(u) && selectedUnitGovernanceMode === 'consolidated' && !!(selectedUnitParts && selectedUnitParts.child);
    const checklistEditable = !checklistGovernanceLocked && (!existing || canEditChecklist(existing));
    if (existing && !canEditChecklist(existing) && !checklistGovernanceLocked) { navigate('checklist'); toast('\u9019\u4efd\u6aa2\u6838\u8868\u76ee\u524d\u4e0d\u53ef\u4fee\u6539', 'error'); return; }
    const selectedUnit = checklistUnitLocked ? (getScopedUnit(u) || existing?.unit || '') : (existing ? existing.unit : (getScopedUnit(u) || u.unit || ''));
    const sectionsHtml = buildChecklistSectionsHtml(existing, sectionState, checklistEditable);
    const today = new Date().toISOString().split('T')[0];
    const totalItems = sectionState.reduce((sum, sec) => sum + sec.items.length, 0);
    const supervisorName = existing?.supervisorName || existing?.supervisor || '';
    const supervisorTitle = existing?.supervisorTitle || '';
    const signStatus = existing?.signStatus || '待簽核';
    const signDate = existing?.signDate || '';
    const supervisorNote = existing?.supervisorNote || '';
    const sectionAnchorHtml = sectionState.map((sec, si) => `<button type="button" class="cl-anchor-link" data-cl-anchor-index="${si}"><span class="cl-anchor-index">${si + 1}</span><span class="cl-anchor-text">${esc(sec.section)}</span></button>`).join('');
    const checklistLockBanner = checklistGovernanceLocked
      ? `<div class="cl-checklist-lock-banner"><strong>本單位由一級單位統一填報。</strong><span>目前子單位僅供檢視，請由一級單位窗口完成填報。</span></div>`
      : '';
    const formActionsHtml = checklistEditable
      ? `<div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 正式送出檢核表</button><button type="button" class="btn btn-secondary" id="cl-save-draft" data-testid="checklist-save-draft">${ic('save', 'icon-sm')} 暫存草稿</button><a href="#checklist" class="btn btn-ghost">取消返回</a></div>`
      : `<div class="cl-checklist-lock-banner cl-checklist-lock-banner--inline"><strong>本單位由一級單位統一填報。</strong><span>您目前可檢視內容，但無法在此單位填寫或送出。</span></div><div class="form-actions"><a href="#checklist" class="btn btn-secondary">返回列表</a>${existing ? `<a href="#checklist-detail/${esc(existing.id)}" class="btn btn-primary">查看明細</a>` : ''}</div>`;

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">${existing ? '\u7de8\u4fee\u6aa2\u6838\u8868' : '\u586b\u5831\u6aa2\u6838\u8868'}</h1><p class="page-subtitle">\u53d7\u7a3d\u55ae\u4f4d\u9810\u8a2d\u5e36\u5165\u76ee\u524d\u767b\u5165\u55ae\u4f4d\uff0c\u4f46\u53ef\u4f9d\u5be6\u969b\u586b\u5831\u9700\u6c42\u5207\u63db\u5230\u5176\u4ed6\u55ae\u4f4d\u3002\u8349\u7a3f\u53ef\u96a8\u6642\u66ab\u5b58\uff0c\u6b63\u5f0f\u9001\u51fa\u5f8c\u9396\u5b9a\u3002</p></div><a href="#checklist" class="btn btn-secondary">\u8fd4\u56de\u5217\u8868</a></div>
      <div class="editor-shell editor-shell--checklist">
        <section class="editor-main">
          <div class="card editor-card"><form id="checklist-form" data-testid="checklist-form">
            ${checklistLockBanner}
            <div class="section-header">${ic('info', 'icon-sm')} \u57fa\u672c\u8cc7\u6599</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">\u53d7\u7a3d\u55ae\u4f4d</label>${buildUnitCascadeControl('cl-unit', selectedUnit, checklistUnitLocked || checklistGovernanceLocked, true)}</div>
              <div class="form-group"><label class="form-label form-required">\u586b\u5831\u4eba\u54e1</label><input type="text" class="form-input" id="cl-filler" value="${esc(u.name)}" readonly></div>
              <div class="form-group"><label class="form-label form-required">填報日期</label><input type="date" class="form-input" id="cl-date" value="${esc(toDateInputValue(existing?.fillDate) || today)}" ${checklistEditable ? 'required' : 'disabled'}></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">\u7a3d\u6838\u5e74\u5ea6</label><input type="text" class="form-input" id="cl-year" value="${existing ? esc(existing.auditYear) : String(new Date().getFullYear() - 1911)}" ${checklistEditable ? 'required' : 'disabled'}></div>
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
                  <div class="editor-side-title">九大類目錄</div>
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
    initUnitCascade('cl-unit', selectedUnit, { disabled: checklistUnitLocked });
    const checklistForm = document.getElementById('checklist-form');
    const evidenceFilesState = new Map();
    getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
      evidenceFilesState.set(item.id, getChecklistEvidenceFiles(existing?.results?.[item.id] || {}));
    }));
    clearUnsavedChangesGuard();

    function markChecklistDirty() {
      setUnsavedChangesGuard(true, '檢核表內容尚未儲存，確定要離開此頁嗎？');
    }

    function syncChecklistMeta() {
      document.getElementById('cl-side-unit').textContent = document.getElementById('cl-unit').value || '—';
      document.getElementById('cl-side-date').textContent = document.getElementById('cl-date').value ? fmt(document.getElementById('cl-date').value) : '—';
      document.getElementById('cl-side-year').textContent = document.getElementById('cl-year').value || '—';
      document.getElementById('cl-side-sign-status').textContent = document.getElementById('cl-sign-status').value || '待簽核';
    }

    function getChecklistOwnerId() {
      const unitValue = checklistUnitLocked ? (getScopedUnit(u) || document.getElementById('cl-unit').value) : document.getElementById('cl-unit').value;
      const fillDateValue = document.getElementById('cl-date').value;
      const auditYearValue = document.getElementById('cl-year').value;
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
        input.addEventListener('change', function (event) {
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
      window.setTimeout(() => itemEl.classList.remove('is-highlighted'), 2200);
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
          sectionProgress.innerHTML = '<span class="badge-dot"></span>' + (done ? '✅ 已完成' : `已填 ${sectionFilled}/${total} 題`);
        }
      });
      const pct = totalItems > 0 ? Math.round((filled / totalItems) * 100) : 0;
      document.getElementById('cl-progress-fill').style.width = pct + '%';
      document.getElementById('cl-progress-text').textContent = filled + ' / ' + totalItems;
      document.getElementById('cl-side-progress-value').textContent = pct + '%';
      document.getElementById('cl-side-progress-text').textContent = '已完成 ' + filled + ' / ' + totalItems;
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
      const unitValue = checklistUnitLocked ? (getScopedUnit(u) || document.getElementById('cl-unit').value) : document.getElementById('cl-unit').value;
      const fillDateValue = document.getElementById('cl-date').value;
      const auditYearValue = document.getElementById('cl-year').value;
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
        existing = result && result.item ? result.item : (getChecklist(data.id) || data);
        debugFlow('checklist', 'draft saved', { id: data.id, unit: data.unit, status: data.status });
        updateChecklistDraftStatus(existing);
        clearUnsavedChangesGuard();
        if (result && result.warning) toast(result.warning, 'info');
        toast(`\u8349\u7a3f ${data.id} \u5df2\u66ab\u5b58`);
        replaceChecklistDraftRoute(data.id);
      });
    }

    document.querySelectorAll('.cl-radio-group input').forEach((radio) => radio.addEventListener('change', updateProgress));
    document.querySelectorAll('[data-cl-anchor-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.clAnchorIndex);
        const sectionEl = document.getElementById(`cl-section-${index}`);
        if (!sectionEl) return;
        sectionEl.open = true;
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    document.getElementById('cl-unit').addEventListener('change', syncChecklistMeta);
    document.getElementById('cl-date').addEventListener('change', syncChecklistMeta);
    document.getElementById('cl-year').addEventListener('input', syncChecklistMeta);
    document.getElementById('cl-sign-status').addEventListener('change', syncChecklistMeta);

    const clDateInput = document.getElementById('cl-date');
    const clYearInput = document.getElementById('cl-year');
    function syncAuditYearByDate() {
      const val = clDateInput.value;
      if (!val) return;
      const year = Number(val.split('-')[0]);
      if (Number.isFinite(year) && year >= 1911) clYearInput.value = String(year - 1911);
      syncChecklistMeta();
    }
    clDateInput.addEventListener('change', syncAuditYearByDate);
    if (!existing) syncAuditYearByDate();
    syncChecklistMeta();
    updateProgress();
    updateChecklistDraftStatus(existing);
    initializeChecklistEvidenceInputs(checklistEditable);

    checklistForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!checklistEditable) {
        toast('本單位由一級單位統一填報，請由一級單位窗口處理。', 'info');
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
        existing = result && result.item ? result.item : (getChecklist(data.id) || data);
        debugFlow('checklist', 'submit success', { id: data.id, unit: data.unit, status: data.status });
        updateChecklistDraftStatus(existing);
        clearUnsavedChangesGuard();
        toast(`\u6aa2\u6838\u8868 ${data.id} \u5df2\u6b63\u5f0f\u9001\u51fa`);
        navigate('checklist-detail/' + data.id);
      });
    });

    checklistForm.addEventListener('input', markChecklistDirty);
    checklistForm.addEventListener('change', markChecklistDirty);

    if (checklistEditable) {
      document.getElementById('cl-save-draft')?.addEventListener('click', saveChecklistDraft);
      document.getElementById('cl-save-draft-inline')?.addEventListener('click', saveChecklistDraft);
      document.getElementById('cl-save-draft-floating')?.addEventListener('click', saveChecklistDraft);
    }
  }

  function renderChecklistDetail(id) {
    cleanupRenderedAttachmentUrls();
    const cl = getChecklist(id);
    if (!cl) {
      document.getElementById('app').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ic('help-circle', 'icon-lg')}</div><div class="empty-state-title">找不到這份檢核表</div><a href="#checklist" class="btn btn-primary" style="margin-top:16px">返回列表</a></div>`;
      return;
    }
    if (!canAccessChecklist(cl)) { navigate('checklist'); toast('您沒有權限檢視這份檢核表', 'error'); return; }

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

    const svg = `<svg viewBox="0 0 120 120" class="cl-donut">${segs}<text x="60" y="56" text-anchor="middle" fill="#0f172a" font-size="18" font-weight="700" font-family="Inter">${applicableRate}%</text><text x="60" y="72" text-anchor="middle" fill="#94a3b8" font-size="8" font-weight="500" font-family="Inter">適用項目符合率</text></svg>`;
    const legend = vals.map((v) => `<div class="cl-legend-item"><span class="cl-legend-dot" style="background:${v.color}"></span>${v.label}<span class="cl-legend-count">${v.count}</span></div>`).join('');

    let sectDetail = '';
    getChecklistSectionsState().forEach((sec) => {
      let rows = '';
      sec.items.forEach((item) => {
        const r = cl.results?.[item.id] || {};
        const comp = r.compliance || '尚未填寫';
        const compCls = COMPLIANCE_CLASSES[comp] || '';
        rows += `<div class="cl-detail-item"><div class="cl-detail-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span><span class="cl-compliance-badge cl-badge-${compCls}">${esc(comp)}</span></div>`;
        if (r.execution) rows += `<div class="cl-detail-field"><span class="cl-detail-label">執行情形說明：</span>${esc(r.execution)}</div>`;
        if (r.evidence) rows += `<div class="cl-detail-field"><span class="cl-detail-label">佐證資料說明：</span>${esc(r.evidence)}</div>`;
        if (Array.isArray(r.evidenceFiles) && r.evidenceFiles.length) rows += `<div class="cl-detail-field cl-detail-field--files"><span class="cl-detail-label">附件：</span>${buildChecklistEvidenceReadonlySlot(item.id)}</div>`;
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
    const issueHtml = issues.length ? `<div class="card" style="margin-top:20px;border-left:3px solid #ef4444"><div class="section-header">${ic('alert-triangle', 'icon-sm')} 需改善項目 ${issues.length} 項</div>${issues.map((iss) => `<div class="cl-issue-item"><span class="cl-compliance-badge cl-badge-${COMPLIANCE_CLASSES[iss.compliance]}">${iss.compliance}</span><span class="cl-item-id">${iss.id}</span> ${esc(iss.text)}${iss.execution ? `<div class="cl-issue-note">${esc(iss.execution)}</div>` : ''}</div>`).join('')}</div>` : '';
    const statusCls = normalizeChecklistStatus(cl.status) === CHECKLIST_STATUS_SUBMITTED ? 'badge-closed' : 'badge-pending';

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="detail-header"><div>
        <div class="detail-id detail-id-with-copy"><span>${esc(cl.id)} / ${esc(cl.auditYear)} 年</span>${renderCopyIdButton(cl.id, '檢核表編號')}</div>
        <h1 class="detail-title">內稽檢核表 / ${esc(cl.unit)}</h1>
        <div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">${ic('user', 'icon-xs')}</span>${esc(cl.fillerName)}</span><span class="detail-meta-item"><span class="detail-meta-icon">${ic('calendar', 'icon-xs')}</span>${fmt(cl.fillDate)}</span><span class="badge ${statusCls}"><span class="badge-dot"></span>${esc(cl.status)}</span></div>
      </div><a href="#checklist" class="btn btn-secondary">返回列表</a></div>
      <div class="panel-grid-two panel-grid-spaced">
        <div class="card"><div class="card-header"><span class="card-title">符合程度統計</span></div><div class="cl-stats-wrap">${svg}<div class="cl-legend">${legend}</div></div></div>
        <div class="card"><div class="card-header"><span class="card-title">基本資料與簽核資訊</span></div>
          <div class="detail-grid">
            <div class="detail-field"><div class="detail-field-label">受稽單位</div><div class="detail-field-value">${esc(cl.unit)}</div></div>
            <div class="detail-field"><div class="detail-field-label">編修人員</div><div class="detail-field-value">${esc(cl.fillerName)}</div></div>
            <div class="detail-field"><div class="detail-field-label">稽核年度</div><div class="detail-field-value">${esc(cl.auditYear)} 年</div></div>
            <div class="detail-field"><div class="detail-field-label">填報日期</div><div class="detail-field-value">${fmt(cl.fillDate)}</div></div>
            <div class="detail-field"><div class="detail-field-label">權責主管姓名</div><div class="detail-field-value">${esc(cl.supervisorName || cl.supervisor || '—')}</div></div>
            <div class="detail-field"><div class="detail-field-label">主管職稱</div><div class="detail-field-value">${esc(cl.supervisorTitle || '—')}</div></div>
            <div class="detail-field"><div class="detail-field-label">簽核狀態</div><div class="detail-field-value">${esc(cl.signStatus || '待簽核')}</div></div>
            <div class="detail-field"><div class="detail-field-label">簽核日期</div><div class="detail-field-value">${cl.signDate ? fmt(cl.signDate) : '—'}</div></div>
            <div class="detail-field"><div class="detail-field-label">簽核備註</div><div class="detail-field-value">${esc(cl.supervisorNote || '—')}</div></div>
            <div class="detail-field"><div class="detail-field-label">適用項目符合率</div><div class="detail-field-value" style="font-weight:700;color:${applicableRate >= 80 ? '#22c55e' : applicableRate >= 60 ? '#f59e0b' : '#ef4444'}">${applicableRate}%（${s.conform || 0}/${applicable}）</div></div>
          </div>
        </div>
      </div>
      ${issueHtml}
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('clipboard-list', 'icon-sm')} 檢核項目明細</span></div>${sectDetail}</div>
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
          <div class="cm-item-drag" title="拖曳排序">&#8942;&#8942;</div>
          <div class="cm-item-content">
            <div class="cm-item-row">
              <span class="cl-item-id" style="flex-shrink:0">${esc(item.id)}</span>
              <span class="cm-item-text">${esc(item.text)}</span>
            </div>
            <div class="cm-item-hint">提示說明：${esc(item.hint || '未提供提示說明')}</div>
          </div>
          <div class="cm-item-actions">
            <button class="btn btn-sm btn-secondary" data-action="checklist.editItem" data-si="${si}" data-ii="${ii}" title="編輯項目">${ic('edit-2', 'btn-icon-svg')}</button>
            <button class="btn btn-sm btn-danger" data-action="checklist.deleteItem" data-si="${si}" data-ii="${ii}" title="刪除項目">${ic('trash-2', 'btn-icon-svg')}</button>
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
              <span class="cm-item-count">${sec.items.length} 項</span>
              <button class="btn btn-sm btn-secondary" data-action="checklist.editSection" data-si="${si}" title="編輯章節">${ic('edit-2', 'btn-icon-svg')}</button>
              <button class="btn btn-sm btn-primary" data-action="checklist.addItem" data-si="${si}" title="新增項目">${ic('plus', 'btn-icon-svg')} 新增項目</button>
              <button class="btn btn-sm btn-danger" data-action="checklist.deleteSection" data-si="${si}" title="刪除章節">${ic('trash-2', 'btn-icon-svg')}</button>
            </div>
          </div>
          <div class="cm-items-wrap">${itemRows}</div>
        </div>`;
  }

  function buildChecklistManageSectionsHtml() {
    return getChecklistSectionsState().map((sec, si) => renderChecklistManageSection(sec, si)).join('');
  }

  function renderChecklistManage() {
    if (!isAdmin()) { navigate('dashboard'); toast('只有管理者可以維護檢核題目。', 'error'); return; }
    const totalItems = getChecklistManageTotalItems();
    const sectHtml = buildChecklistManageSectionsHtml();

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">檢核題庫管理</h1>
          <p class="page-subtitle">目前共有 ${getChecklistSectionsState().length} 個章節、${totalItems} 個題目，可拖曳調整順序並維護題目內容。</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" data-action="checklist.resetDefault">${ic('refresh-cw', 'icon-sm')} 還原預設題庫</button>
          <button class="btn btn-primary" data-action="checklist.addSection">${ic('plus-circle', 'icon-sm')} 新增章節</button>
        </div>
      </div>

      <div class="cm-info-banner">
        ${ic('info', 'icon-sm')}
        <span>這裡調整的是後續新建檢核表會使用的題目與提示；已建立的檢核表仍保留當時版本，避免影響既有填報。</span>
      </div>

      <div id="cm-sections-wrap">${sectHtml}</div>
    </div>`;

    refreshIcons();
  }

  function _cmRefreshSections() {
    const wrap = document.getElementById('cm-sections-wrap');
    if (!wrap) { renderChecklistManage(); return; }
    wrap.innerHTML = buildChecklistManageSectionsHtml();
    const totalItems = getChecklistManageTotalItems();
    const subtitle = document.querySelector('.page-subtitle');
    if (subtitle) subtitle.textContent = `目前共有 ${getChecklistSectionsState().length} 個章節、${totalItems} 個題目，可拖曳調整順序並維護題目內容。`;
    refreshIcons();
  }

  function _cmModal(title, bodyHtml, onSave) {
    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-backdrop" id="cm-modal-bg">
      <div class="modal" style="max-width:620px">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="btn btn-ghost btn-icon" data-dismiss-modal>關閉</button>
        </div>
        <form id="cm-modal-form">
          ${bodyHtml}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${ic('save', 'icon-sm')} 儲存</button>
            <button type="button" class="btn btn-secondary" data-dismiss-modal>取消</button>
          </div>
        </form>
      </div>
    </div>`;
    document.getElementById('cm-modal-bg').addEventListener('click', e => { if (e.target === e.currentTarget) closeModalRoot(); });
    document.getElementById('cm-modal-form').addEventListener('submit', e => { e.preventDefault(); onSave(); closeModalRoot(); _cmRefreshSections(); });
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

  function cmAddSection() {
    _cmModal('新增章節', `
      <div class="form-group">
        <label class="form-label form-required">章節名稱</label>
        <input type="text" class="form-input" id="cm-sec-name" placeholder="例如 10. 資訊系統存取控制" required autofocus>
      </div>`, () => {
      const name = document.getElementById('cm-sec-name').value.trim();
      if (!name) return;
      const secs = getChecklistSections();
      secs.push({ section: name, items: [] });
      saveChecklistSections(secs);
      toast('章節已新增');
    });
  };

  function cmEditSection(si) {
    const secs = getChecklistSections();
    const sec = secs[si];
    _cmModal('編輯章節', `
      <div class="form-group">
        <label class="form-label form-required">章節名稱</label>
        <input type="text" class="form-input" id="cm-sec-name" value="${esc(sec.section)}" required autofocus>
      </div>`, () => {
      const name = document.getElementById('cm-sec-name').value.trim();
      if (!name) return;
      const s2 = getChecklistSections();
      s2[si].section = name;
      saveChecklistSections(s2);
      toast('章節名稱已更新');
    });
  };

  async function cmDelSection(si) {
    const secs = getChecklistSections();
    const confirmed = await openConfirmDialog('確認要刪除章節嗎？此操作會一併刪除相關檢核項目。', { title: '確認刪除章節', confirmText: '確認刪除', cancelText: '取消' });
    if (!confirmed) return;
    secs.splice(si, 1);
    saveChecklistSections(secs);
    toast('章節已刪除', 'info');
    _cmRefreshSections();
  };

  function cmAddItem(si) {
    const nextId = _cmNextItemId(si);
    _cmModal('新增項目', `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label form-required">項目編號</label>
          <input type="text" class="form-input" id="cm-item-id" value="${esc(nextId)}" placeholder="例如 8.10" required>
          <p class="form-hint">項目編號建議沿用章節編碼，方便排序與後續追蹤。</p>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label form-required">項目內容</label>
        <textarea class="form-textarea" id="cm-item-text" placeholder="請輸入檢核項目內容" required style="min-height:80px" autofocus></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">提示說明</label>
        <textarea class="form-textarea" id="cm-item-hint" placeholder="例如 可補充應提供的文件、畫面截圖或查核重點" style="min-height:60px"></textarea>
      </div>`, () => {
      const id = document.getElementById('cm-item-id').value.trim();
      const text = document.getElementById('cm-item-text').value.trim();
      const hint = document.getElementById('cm-item-hint').value.trim();
      if (!id || !text) { toast('項目編號與內容皆為必填', 'error'); return; }
      const secs = getChecklistSections();
      const allIds = secs.flatMap(s => s.items.map(it => it.id));
      if (allIds.includes(id)) { toast(`項目編號 ${id} 已存在，請改用其他編號。`, 'error'); return; }
      secs[si].items.push({ id, text, hint });
      saveChecklistSections(secs);
      toast('項目已新增');
    });
  };

  function cmEditItem(si, ii) {
    const secs = getChecklistSections();
    const item = secs[si].items[ii];
    _cmModal('編輯項目', `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label form-required">項目編號</label>
          <input type="text" class="form-input" id="cm-item-id" value="${esc(item.id)}" required>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label form-required">項目內容</label>
        <textarea class="form-textarea" id="cm-item-text" required style="min-height:80px">${esc(item.text)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">提示說明</label>
        <textarea class="form-textarea" id="cm-item-hint" style="min-height:60px">${esc(item.hint || '')}</textarea>
      </div>`, () => {
      const newId = document.getElementById('cm-item-id').value.trim();
      const text = document.getElementById('cm-item-text').value.trim();
      const hint = document.getElementById('cm-item-hint').value.trim();
      if (!newId || !text) { toast('項目編號與內容皆為必填', 'error'); return; }
      const s2 = getChecklistSections();
      const allIds = s2.flatMap((sec, sIdx) => sec.items.map((it, iIdx) => ({ id: it.id, si: sIdx, ii: iIdx }))).filter(x => !(x.si === si && x.ii === ii)).map(x => x.id);
      if (allIds.includes(newId)) { toast(`項目編號 ${newId} 已存在，請改用其他編號。`, 'error'); return; }
      s2[si].items[ii] = { id: newId, text, hint };
      saveChecklistSections(s2);
      toast('項目已更新');
    });
  };

  async function cmDelItem(si, ii) {
    const secs = getChecklistSections();
    const item = secs[si].items[ii];
    const confirmed = await openConfirmDialog('確認要刪除項目 ' + esc(item.id) + ' 嗎？', { title: '確認刪除項目', confirmText: '確認刪除', cancelText: '取消' });
    if (!confirmed) return;
    secs[si].items.splice(ii, 1);
    saveChecklistSections(secs);
    toast('項目已刪除', 'info');
    _cmRefreshSections();
  };

  async function cmResetDefault() {
    const confirmed = await openConfirmDialog('確認要還原成預設題庫？這會覆蓋目前自訂的章節與項目內容。', { title: '確認還原題庫', confirmText: '確認還原', cancelText: '取消' });
    if (!confirmed) return;
    resetChecklistSections();
    toast('已還原成預設題庫', 'info');
    _cmRefreshSections();
  };

  async function handleDeleteChecklistYear(year) {
    const targetYear = String(year || '').trim();
    if (!targetYear) {
      toast('請先指定年度', 'error');
      return;
    }
    const label = targetYear + ' 年';
    const confirmed = await openConfirmDialog('確認要刪除 ' + label + ' 的所有檢核表資料嗎？此操作無法復原。', {
      title: '確認刪除年度資料',
      confirmText: '確認刪除',
      cancelText: '取消'
    });
    if (!confirmed) return;
    await runWithBusyState('正在刪除 ' + label + ' 資料…', async () => {
      const result = await deleteChecklistsByYear(targetYear);
      const deletedCount = Number(result && result.deletedCount || 0);
      toast(deletedCount ? ('已刪除 ' + label + ' 資料，共 ' + deletedCount + ' 筆') : (label + ' 沒有可刪除的資料'), deletedCount ? 'success' : 'info');
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

