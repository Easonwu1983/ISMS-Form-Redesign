// @ts-check
﻿(function () {
  window.createCaseModule = function createCaseModule(deps) {
    const {
      STATUSES,
      STATUS_FLOW,
      STATUS_CLASSES,
      DEF_TYPES,
      SOURCES,
      CATEGORIES,
      ROLES,
      currentUser,
      canCreateCAR,
      canReview,
      canReviewItem,
      canAccessItem,
      canRespondItem,
      canSubmitTracking,
      canManageUsers,
      isItemHandler,
      getVisibleItems,
      getCurrentNextTrackingDate,
      isOverdue,
      getItem,
      addItem,
      updateItem,
      getUsers,
      loadData,
      reserveCarId,
      normalizeCarIdInput,
      buildCorrectionDocumentNo,
      getNextCorrectionSequence,
      buildAutoCarIdByDocument,
      parseCorrectionAutoId,
      getUnitCode,
      getUnitCodeWithDots,
      splitUnitValue,
      getScopedUnit,
      renderSidebar,
      navigate,
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      toast,
      fmt,
      fmtTime,
      esc,
      ic,
      mkChk,
      mkRadio,
      refreshIcons,
      bindCopyButtons,
      renderCopyIdCell,
      renderCopyIdButton,
      prepareUploadBatch,
      createTransientUploadEntry,
      revokeTransientUploadEntry,
      persistUploadedEntries,
      renderAttachmentList,
      cleanupRenderedAttachmentUrls,
      buildUnitCascadeControl,
      initUnitCascade,
      syncCorrectiveActionsFromM365,
      syncUsersFromM365,
      fetchDashboardSummary,
      fetchMyTasks,
      submitCreateCase,
      submitDeleteCase,
      submitRespondCase,
      submitReviewDecision,
      submitTrackingSubmission,
      submitTrackingReviewDecision,
      applyTestIds,
      applySelectorTestIds,
      debugFlow,
      registerActionHandlers,
      openConfirmDialog,
      addPageEventListener,
      registerPageCleanup
    } = deps;

  const CASE_DASHBOARD_HYDRATION_IDLE_TIMEOUT_MS = 0;
  const CASE_ASYNC_FALLBACK_DELAY_MS = 0;
  const CASE_LIST_SEARCH_DEBOUNCE_MS = 120;

  function normalizeCaseUnitList(units) {
    const source = Array.isArray(units) ? units : [];
    return Array.from(new Set(source.map(function (unit) {
      return String(unit || '').trim();
    }).filter(Boolean)));
  }

  function getCaseAccessProfile(user) {
    const base = user || currentUser();
    if (!base) return null;
    const authorizedUnits = normalizeCaseUnitList(
      Array.isArray(base.authorizedUnits) && base.authorizedUnits.length
        ? base.authorizedUnits
        : [base.primaryUnit || getScopedUnit(base) || base.unit]
    );
    const activeUnit = String(base.activeUnit || getScopedUnit(base) || authorizedUnits[0] || base.primaryUnit || base.unit || '').trim();
    const primaryUnit = String(base.primaryUnit || activeUnit || base.unit || '').trim();
    return Object.assign({}, base, {
      primaryUnit: primaryUnit,
      authorizedUnits: authorizedUnits,
      activeUnit: activeUnit
    });
  }

  function bindCasePageEvent(target, type, listener, options) {
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

  function registerCasePageCleanup(callback) {
    if (typeof registerPageCleanup === 'function') {
      return registerPageCleanup(callback);
    }
    return function () {};
  }

  function scheduleRefreshIcons() {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(refreshIcons);
      return;
    }
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(refreshIcons, 0);
      return;
    }
    refreshIcons();
  }

  function renderCaseStatusCell(item, useClosedGuard) {
    const overdue = isOverdue(item);
    const label = overdue && (!useClosedGuard || item.status !== STATUSES.CLOSED) ? '已逾期' : item.status;
    return '<span class="badge badge-' + (overdue ? 'overdue' : STATUS_CLASSES[item.status]) + '"><span class="badge-dot"></span>' + label + '</span>';
  }

  function renderDashboardIdCell(item) {
    return '<div class="copy-id-cell copy-id-cell--strong dashboard-recent-id-cell"><span class="copy-id-text dashboard-recent-id-text">' + esc(item.id || '') + '</span>' + renderCopyIdButton(item.id, '矯正單號') + '</div>';
  }

  function renderDashboardTableRow(item, lastActivityText) {
    const problemDesc = String(item.problemDesc || '').trim();
    return '<tr data-route="detail/' + item.id + '">'
      + '<td class="record-id-col">' + renderDashboardIdCell(item) + '</td>'
      + '<td class="dashboard-recent-desc-cell" title="' + esc(problemDesc) + '"><span class="dashboard-recent-desc">' + esc(problemDesc || '—') + '</span></td>'
      + '<td class="dashboard-recent-status-cell">' + renderCaseStatusCell(item, false) + '</td>'
      + '<td class="dashboard-recent-date-cell"><span class="dashboard-recent-date-value">' + esc(lastActivityText || formatCaseLastActivity(item)) + '</span></td>'
      + '<td class="dashboard-recent-handler-cell"><span class="dashboard-recent-handler-name">' + esc(item.handlerName || '—') + '</span></td>'
      + '<td class="dashboard-recent-date-cell"><span class="dashboard-recent-date-value">' + fmt(item.correctiveDueDate) + '</span></td>'
      + '<td class="dashboard-recent-date-cell"><span class="dashboard-recent-date-value">' + fmt(getCurrentNextTrackingDate(item)) + '</span></td>'
      + '</tr>';
  }

  function renderListTableRow(item) {
    return '<tr data-route="detail/' + item.id + '"><td class="batch-chk-col" data-no-route="1"><label class="chk-label chk-label--center"><input type="checkbox" class="batch-row-chk" value="' + esc(item.id) + '"><span class="chk-box"></span></label></td><td class="record-id-col">' + renderCopyIdCell(item.id, '矯正單號', true) + '</td><td>' + esc(item.deficiencyType) + '</td><td>' + esc(item.source) + '</td><td>' + renderCaseStatusCell(item, true) + '</td><td>' + esc(item.proposerName) + '</td><td>' + esc(item.handlerName) + '</td><td>' + fmt(item.correctiveDueDate) + '</td><td>' + fmt(getCurrentNextTrackingDate(item)) + '</td></tr>';
  }

  function buildCaseCard(headerHtml, bodyHtml, options) {
    const opts = options || {};
    const styleAttr = opts.style ? ' style="' + opts.style + '"' : '';
    const headerClass = opts.headerClass || 'card-header';
    const cardClass = opts.cardClass ? 'card ' + opts.cardClass : 'card';
    return '<div class="' + cardClass + '"' + styleAttr + '>' + (headerHtml ? '<div class="' + headerClass + '">' + headerHtml + '</div>' : '') + bodyHtml + '</div>';
  }

  function getCaseEmptyStateClass(padding) {
    return Number(padding) >= 40 ? 'empty-state review-empty--spacious' : 'empty-state empty-state--pad-32-20';
  }

  function applyCaseTableHeaderScope(headersHtml) {
    return String(headersHtml || '').replace(/<th(?![^>]*\bscope=)/g, '<th scope="col"');
  }

  function buildCaseTableCaption(caption) {
    const text = String(caption || '').trim();
    if (!text) return '';
    return '<caption class="sr-only">' + esc(text) + '</caption>';
  }

  function buildCaseTableMarkup(headersHtml, rowsHtml, options) {
    const opts = options || {};
    const wrapperClass = opts.wrapperClass ? 'table-wrapper ' + opts.wrapperClass : 'table-wrapper';
    const tableClass = opts.tableClass ? ' class="' + opts.tableClass + ' data-table"' : ' class="data-table"';
    const caption = opts.caption || '矯正單資料表';
    return '<div class="' + wrapperClass + '" tabindex="0"><table' + tableClass + '>' + buildCaseTableCaption(caption) + '<thead><tr>' + applyCaseTableHeaderScope(headersHtml) + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }

  function buildCaseStatCard(tone, iconName, value, label) {
    return '<div class="stat-card ' + esc(tone) + '"><div class="stat-icon">' + ic(iconName) + '</div><div class="stat-value">' + esc(String(value)) + '</div><div class="stat-label">' + esc(label) + '</div></div>';
  }

  function buildCaseTableCard(title, headersHtml, rowsHtml, options) {
    const opts = options || {};
    const headerHtml = '<span class="card-title">' + title + '</span>' + (opts.actionHtml || '');
    const cardStyle = opts.cardStyle || '';
    const headerClass = opts.headerClass || 'card-header';
    return buildCaseCard(headerHtml, buildCaseTableMarkup(headersHtml, rowsHtml, opts), { style: cardStyle, headerClass: headerClass, cardClass: opts.cardClass || '' });
  }

  function buildDashboardStatusOverview(summary) {
    const stats = [
      { label: '進行中', value: summary.openCount || 0 },
      { label: '已結案', value: summary.closedCount || 0 },
      { label: '逾期', value: summary.overdueCount || 0 }
    ];
    return '<div class="dashboard-panel-summary">'
      + stats.map(function (stat) {
        return '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">' + stat.label + '</span><strong class="dashboard-panel-pill-value">' + stat.value + '</strong></div>';
      }).join('')
      + '<div class="dashboard-panel-note">狀態分布依目前可見案件計算，總數 ' + (summary.total || 0) + ' 筆。</div>'
      + '</div>';
  }

  function buildDashboardSnapshot(items) {
    const list = Array.isArray(items) ? items : [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const bucketCounts = {};
    bucketCounts[STATUSES.CREATED] = 0;
    bucketCounts[STATUSES.PENDING] = 0;
    bucketCounts[STATUSES.PROPOSED] = 0;
    bucketCounts[STATUSES.REVIEWING] = 0;
    bucketCounts[STATUSES.TRACKING] = 0;
    bucketCounts['已逾期'] = 0;
    bucketCounts[STATUSES.CLOSED] = 0;
    const snapshot = {
      total: list.length,
      openCount: 0,
      closedCount: 0,
      overdueCount: 0,
      pendingCount: 0,
      closedThisMonth: 0,
      bucketCounts: bucketCounts,
      nextDueItem: null,
      recent: []
    };
    let nextDueTimestamp = 0;
    const recent = [];
    function compareRecentEntry(a, b) {
      const aClosed = a.item && a.item.status === STATUSES.CLOSED ? 1 : 0;
      const bClosed = b.item && b.item.status === STATUSES.CLOSED ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      return (b.sortTime || 0) - (a.sortTime || 0);
    }
    function insertRecentEntry(entry) {
      let index = 0;
      while (index < recent.length && compareRecentEntry(recent[index], entry) <= 0) {
        index += 1;
      }
      recent.splice(index, 0, entry);
      if (recent.length > 5) {
        recent.length = 5;
      }
    }
    list.forEach(function (item) {
      if (!item) return;
      const status = item.status || STATUSES.CREATED;
      const isClosed = status === STATUSES.CLOSED;
      const isLate = isOverdue(item);
      const bucket = isLate ? '已逾期' : status;
      if (bucketCounts[bucket] !== undefined) bucketCounts[bucket] += 1;
      if (status === STATUSES.PENDING) snapshot.pendingCount += 1;
      if (isClosed) {
        snapshot.closedCount += 1;
        const closedDate = String(item.closedDate || '').trim();
        if (closedDate) {
          const closedTime = new Date(closedDate);
          if (closedTime.getMonth() === currentMonth && closedTime.getFullYear() === currentYear) snapshot.closedThisMonth += 1;
        }
      } else {
        snapshot.openCount += 1;
      }
      if (isLate) snapshot.overdueCount += 1;
      const dueTime = toTimestamp(item.correctiveDueDate);
      if (!isClosed && dueTime && (!nextDueTimestamp || dueTime < nextDueTimestamp)) {
        nextDueTimestamp = dueTime;
        snapshot.nextDueItem = item;
      }
      insertRecentEntry({
        item: item,
        sortTime: getDashboardRecentSortTime(item)
      });
    });
    snapshot.recent = recent.map(function (entry) {
      return {
        item: entry.item,
        lastActivity: getCaseLastActivityTime(entry.item)
      };
    });
    return snapshot;
  }

  let dashboardSnapshotCache = { items: null, snapshot: null };
  let caseListRenderCache = { items: null, filter: '', search: '', snapshot: null };

  function getCachedDashboardSnapshot(items) {
    if (dashboardSnapshotCache.items === items && dashboardSnapshotCache.snapshot) return dashboardSnapshotCache.snapshot;
    const snapshot = buildDashboardSnapshot(items);
    dashboardSnapshotCache = { items: items, snapshot: snapshot };
    return snapshot;
  }

  function getCachedCaseListSnapshot(items) {
    const list = Array.isArray(items) ? items : [];
    const filter = curFilter || '全部';
    const search = String(curSearch || '').trim().toLowerCase();
    if (caseListRenderCache.items === list && caseListRenderCache.filter === filter && caseListRenderCache.search === search && caseListRenderCache.snapshot) {
      return caseListRenderCache.snapshot;
    }
    const filtered = [];
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      if (!item) continue;
      if (filter === '已逾期') {
        if (!isOverdue(item)) continue;
      } else if (filter !== '全部' && item.status !== filter) {
        continue;
      }
      if (search) {
        const haystack = String(item.searchText || [item.id, item.problemDesc, item.handlerName, item.proposerName, item.source, item.status, item.deficiencyType].filter(Boolean).join(' ').toLowerCase());
        if (haystack.indexOf(search) < 0) continue;
      }
      filtered.push(item);
    }
    filtered.sort(function (a, b) {
      return (Number(b && b.createdAtTs) || Date.parse(b && b.createdAt || '') || 0) - (Number(a && a.createdAtTs) || Date.parse(a && a.createdAt || '') || 0);
    });
    const rows = filtered.length ? filtered.map(function (i) { return renderListTableRow(i); }).join('') : buildCaseEmptyTableRow(9, 'search', '沒有符合條件的矯正單');
    const snapshot = { total: list.length, filtered: filtered, filteredCount: filtered.length, rows: rows };
    caseListRenderCache = { items: list, filter: filter, search: search, snapshot: snapshot };
    return snapshot;
  }

  function buildCaseEmptyTableRow(colspan, iconName, title, padding) {
    return '<tr><td colspan="' + colspan + '"><div class="' + getCaseEmptyStateClass(padding || 32) + '"><div class="empty-state-icon">' + ic(iconName || 'inbox') + '</div><div class="empty-state-title">' + esc(title) + '</div></div></td></tr>';
  }

  function toDateInputValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : raw;
  }

  function buildEditorSummaryItems(items) {
    return '<div class="editor-summary-list editor-summary-list--compact">' + items.map(function (item) {
      const idAttr = item.id ? ' id="' + item.id + '"' : '';
      return '<div class="editor-summary-item"><span>' + esc(item.label) + '</span><strong' + idAttr + '>' + item.value + '</strong></div>';
    }).join('') + '</div>';
  }

  function buildEditorStepItems(items) {
    return '<div class="editor-step-list">' + items.map(function (item, index) {
      return '<div class="editor-step-item"><span class="editor-step-badge">' + (index + 1) + '</span><div><strong>' + esc(item.title) + '</strong><p>' + esc(item.text) + '</p></div></div>';
    }).join('') + '</div>';
  }

  function buildEditorNoteItems(items) {
    return '<div class="editor-note-list">' + items.map(function (item) {
      return '<div class="editor-note-item"><span class="editor-note-dot"></span><span>' + item + '</span></div>';
    }).join('') + '</div>';
  }

  function buildEditorSideCard(options) {
    const opts = options || {};
    const classes = 'editor-side-card' + (opts.accent ? ' editor-side-card--accent' : '');
    const kickerHtml = opts.kicker ? '<div class="editor-side-kicker">' + esc(opts.kicker) + '</div>' : '';
    const titleHtml = opts.title ? '<div class="editor-side-title">' + esc(opts.title) + '</div>' : '';
    const textHtml = opts.text ? '<div class="editor-side-text">' + esc(opts.text) + '</div>' : '';
    return '<div class="' + classes + '">' + kickerHtml + titleHtml + textHtml + (opts.bodyHtml || '') + '</div>';
  }

  function buildCaseEvidenceSlot(slotId) {
    return '<div class="file-preview-list" id="' + esc(slotId) + '"></div>';
  }

  function mountCaseEvidenceList(slotId, files, emptyText) {
    return renderAttachmentList(slotId, files, {
      emptyText: emptyText || '尚未上傳文件',
      fileIconHtml: '<div class="file-pdf-icon">' + ic('file-box') + '</div>',
      itemClass: 'file-preview-item',
      actionsClass: 'file-preview-actions'
    });
  }

  function buildCaseTimeline(historyList) {
    return (historyList || []).map(function (h, index, all) {
      let actor = h.user || '';
      if (!actor || actor === '系統' || actor === '蝟餌絞') {
        const linked = all.slice(0, index).reverse().find(function (entry) { return entry.time === h.time && entry.user && entry.user !== '蝟餌絞'; });
        if (linked) actor = linked.user;
      }
      return '<div class="timeline-item"><div class="timeline-time">' + fmtTime(h.time) + '</div><div class="timeline-text">' + esc(h.action) + (actor ? (' - ' + esc(actor)) : '') + '</div></div>';
    }).reverse().join('');
  }

  function toTimestamp(value) {
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function getCaseLastActivityTime(item) {
    if (!item) return 0;
    const candidates = [
      item.updatedAt,
      item.createdAt,
      item.closedDate,
      item.reviewDate,
      item.handlerDate,
      item.correctiveDueDate,
      item.pendingTracking && item.pendingTracking.submittedAt,
      item.pendingTracking && item.pendingTracking.reviewedAt,
      item.pendingTracking && item.pendingTracking.nextTrackDate
    ];
    (Array.isArray(item.trackings) ? item.trackings : []).forEach(function (tracking) {
      candidates.push(tracking && tracking.trackDate);
      candidates.push(tracking && tracking.reviewDate);
      candidates.push(tracking && tracking.nextTrackDate);
    });
    (Array.isArray(item.history) ? item.history : []).forEach(function (history) {
      candidates.push(history && history.time);
    });
    return candidates.reduce(function (max, value) {
      return Math.max(max, toTimestamp(value));
    }, 0);
  }

  function formatCaseLastActivity(item) {
    const last = getCaseLastActivityTime(item);
    return last ? fmtTime(new Date(last).toISOString()) : '—';
  }

  function getDashboardRecentSortTime(item) {
    if (!item) return 0;
    const candidates = [
      item.updatedAt,
      item.createdAt,
      item.closedDate,
      item.reviewDate,
      item.handlerDate,
      item.correctiveDueDate,
      item.pendingTracking && item.pendingTracking.submittedAt,
      item.pendingTracking && item.pendingTracking.reviewedAt,
      item.pendingTracking && item.pendingTracking.nextTrackDate
    ];
    return candidates.reduce(function (max, value) {
      return Math.max(max, toTimestamp(value));
    }, 0);
  }

  function getDashboardStatusBucket(item) {
    if (!item) return STATUSES.CREATED;
    return isOverdue(item) ? '已逾期' : item.status;
  }

  let dashboardRenderToken = 0;

  // ── Dashboard card customization ──
  const DASHBOARD_PREFS_KEY = 'isms_dashboard_prefs';
  const DASHBOARD_SECTIONS = [
    { key: 'auditProgress',    label: '年度稽核進度總覽',  icon: 'shield-check',    adminOnly: true },
    { key: 'filingProgress',   label: '年度填報進度',      icon: 'clipboard-list',  adminOnly: true },
    { key: 'trainingOverview', label: '教育訓練概覽',      icon: 'graduation-cap',  adminOnly: true },
    { key: 'correctiveStats',  label: '矯正單統計',        icon: 'files',           adminOnly: false },
    { key: 'recentCases',      label: '最近矯正單',        icon: 'clock',           adminOnly: false },
    { key: 'todayFocus',       label: '今日焦點',          icon: 'target',          adminOnly: false },
    { key: 'myTasks',          label: '我的待辦事項',      icon: 'list-checks',     adminOnly: false }
  ];

  function getDashboardPrefs() {
    try {
      return JSON.parse(localStorage.getItem(DASHBOARD_PREFS_KEY) || '{}');
    } catch (_e) {
      return {};
    }
  }

  function saveDashboardPrefs(prefs) {
    try {
      localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs));
    } catch (_e) { /* storage full or unavailable */ }
  }

  function isDashboardSectionVisible(key) {
    const prefs = getDashboardPrefs();
    return prefs[key] !== false; // default: all visible
  }

  function applyDashboardVisibility() {
    const prefs = getDashboardPrefs();
    const sections = document.querySelectorAll('[data-dashboard-section]');
    for (let i = 0; i < sections.length; i++) {
      const el = sections[i];
      const key = el.getAttribute('data-dashboard-section');
      el.style.display = prefs[key] === false ? 'none' : '';
    }
  }

  function buildDashboardSettingsModal() {
    const prefs = getDashboardPrefs();
    const user = currentUser();
    const isAdmin = user && user.role === ROLES.ADMIN;
    const rows = DASHBOARD_SECTIONS.filter(function (sec) {
      if (sec.adminOnly && !isAdmin) return false;
      if (sec.key === 'myTasks' && isAdmin) return false;
      return true;
    }).map(function (sec) {
      const checked = prefs[sec.key] !== false;
      return '<label class="dashboard-pref-row">'
        + '<input type="checkbox" class="dashboard-pref-checkbox" data-pref-key="' + sec.key + '"' + (checked ? ' checked' : '') + '>'
        + '<span class="dashboard-pref-icon">' + ic(sec.icon, 'icon-sm') + '</span>'
        + '<span class="dashboard-pref-label">' + esc(sec.label) + '</span>'
        + '</label>';
    }).join('');

    return '<div class="modal-backdrop dashboard-settings-backdrop" data-action="case.closeDashboardSettings">'
      + '<div class="modal dashboard-settings-modal" role="dialog" aria-label="自訂儀表板">'
      + '<div class="modal-header"><h3 class="modal-title">' + ic('settings', 'icon-sm') + ' 自訂儀表板</h3>'
      + '<button class="btn btn-ghost btn-icon modal-close" data-action="case.closeDashboardSettings" title="關閉">' + ic('x', 'icon-sm') + '</button></div>'
      + '<div class="modal-body"><p class="dashboard-pref-hint">選擇要在儀表板上顯示的區塊：</p>'
      + '<div class="dashboard-pref-list">' + rows + '</div></div>'
      + '<div class="modal-footer">'
      + '<button class="btn btn-ghost btn-sm" data-action="case.resetDashboardPrefs">重設預設值</button>'
      + '<button class="btn btn-primary btn-sm" data-action="case.closeDashboardSettings">完成</button>'
      + '</div></div></div>';
  }

  function scheduleDashboardHydration(task) {
    if (typeof task !== 'function') return;
    const cancelled = false;
    let frameId = 0;
    let timerId = 0;
    const runTask = function () {
      if (cancelled) return;
      try {
        task();
      } catch (error) {
        if (typeof window !== 'undefined' && window.__ismsWarn) {
          window.__ismsWarn('dashboard hydration failed', error);
        }
      }
    };
    const scheduleTimeout = function () {
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        timerId = window.setTimeout(runTask, CASE_DASHBOARD_HYDRATION_IDLE_TIMEOUT_MS);
        return;
      }
      runTask();
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      frameId = window.requestAnimationFrame(scheduleTimeout);
      return;
    }
    scheduleTimeout();
  }

  function renderDashboard() {
    const renderToken = ++dashboardRenderToken;
    const chartSlotId = 'dashboard-chart-slot';
    const recentSlotId = 'dashboard-recent-slot';
    const heroMetaIds = {
      pending: 'dashboard-meta-pending',
      overdue: 'dashboard-meta-overdue',
      closed: 'dashboard-meta-closed',
      total: 'dashboard-stat-total',
      pendingStat: 'dashboard-stat-pending',
      overdueStat: 'dashboard-stat-overdue',
      closedStat: 'dashboard-stat-closed',
      focusText: 'dashboard-focus-text',
      nextDue: 'dashboard-next-due',
      openCount: 'dashboard-open-count',
      latestHandler: 'dashboard-latest-handler'
    };
    const createBtn = canCreateCAR() ? '<a href="#create" class="btn btn-primary">' + ic('plus-circle', 'icon-sm') + ' 開立矯正單</a>' : '';
    const recentShell = '<div id="' + recentSlotId + '" class="dashboard-card-loading" aria-busy="true">正在載入最近矯正單</div>';
    const chartShell = '<div id="' + chartSlotId + '" class="dashboard-card-loading" aria-busy="true">正在載入狀態分布</div>';
    const heroMeta = [
      { label: '待矯正', id: heroMetaIds.pending, value: '—' },
      { label: '已逾期', id: heroMetaIds.overdue, value: '—' },
      { label: '本月結案', id: heroMetaIds.closed, value: '—' }
    ].map(function (item) {
      return '<div class="dashboard-meta-chip"><span class="dashboard-meta-label">' + item.label + '</span><strong class="dashboard-meta-value" id="' + item.id + '">' + item.value + '</strong></div>';
    }).join('');
    const heroSide = '<div class="dashboard-hero-side"><div class="dashboard-focus-card"><div class="dashboard-focus-label">今日焦點</div><div class="dashboard-focus-text" id="' + heroMetaIds.focusText + '">正在整理近期案件與逾期資訊…</div><div class="dashboard-focus-list">'
      + '<div class="dashboard-focus-item"><span>下一個截止</span><strong id="' + heroMetaIds.nextDue + '">載入中</strong></div>'
      + '<div class="dashboard-focus-item"><span>進行中案件</span><strong id="' + heroMetaIds.openCount + '">—</strong></div>'
      + '<div class="dashboard-focus-item"><span>最新處理人</span><strong id="' + heroMetaIds.latestHandler + '">—</strong></div>'
      + '</div></div>';

    const user = currentUser();
    const showAuditProgress = user && user.role === ROLES.ADMIN;
    const showMyTasks = user && user.role !== ROLES.ADMIN;
    const myTasksSlotId = 'my-tasks-slot';
    const auditSlotIds = { filingStat: 'audit-filing-stat', trainingStat: 'audit-training-stat', pendingStat: 'audit-pending-stat', filing: 'audit-filing-slot', training: 'audit-training-slot' };
    const currentAuditYear = String(new Date().getFullYear() - 1911);
    const auditYearOptions = [currentAuditYear, String(Number(currentAuditYear) - 1), String(Number(currentAuditYear) - 2)].map(function (y) {
      return '<option value="' + y + '"' + (y === currentAuditYear ? ' selected' : '') + '>' + y + ' 年度</option>';
    }).join('');
    const auditProgressHtml = showAuditProgress ? (
      '<div data-dashboard-section="auditProgress">'
      + '<section class="dashboard-audit-progress"><div class="dashboard-section-header"><h2 class="dashboard-section-title">' + ic('shield-check', 'icon-sm') + ' 年度稽核進度總覽</h2><select class="form-select dashboard-year-select" id="audit-year-select">' + auditYearOptions + '</select></div>'
      + '<div class="stats-grid stats-grid--audit">'
      + '<div class="stat-card total"><div class="stat-icon">' + ic('clipboard-list') + '</div><div class="stat-value" id="' + auditSlotIds.filingStat + '">—</div><div class="stat-label">年度填報</div></div>'
      + '<div class="stat-card closed"><div class="stat-icon">' + ic('graduation-cap') + '</div><div class="stat-value" id="' + auditSlotIds.trainingStat + '">—</div><div class="stat-label">訓練達成率</div></div>'
      + '<div class="stat-card overdue"><div class="stat-icon">' + ic('bell-ring') + '</div><div class="stat-value" id="' + auditSlotIds.pendingStat + '">—</div><div class="stat-label">待處理事項</div></div>'
      + '</div>'
      + '<div class="dashboard-grid dashboard-grid--audit">'
      + '<div data-dashboard-section="filingProgress"><div class="card dashboard-panel"><div class="card-header"><span class="card-title">年度填報進度</span></div><div id="' + auditSlotIds.filing + '" class="dashboard-card-loading" aria-busy="true">正在載入填報進度…</div></div></div>'
      + '<div data-dashboard-section="trainingOverview"><div class="card dashboard-panel"><div class="card-header"><span class="card-title">教育訓練概覽</span></div><div id="' + auditSlotIds.training + '" class="dashboard-card-loading" aria-busy="true">正在載入訓練資料…</div></div></div>'
      + '</div></section></div>'
    ) : '';

    const myTasksHtml = showMyTasks ? (
      '<div data-dashboard-section="myTasks"><section class="dashboard-my-tasks"><div class="dashboard-section-header"><h2 class="dashboard-section-title">' + ic('list-checks', 'icon-sm') + ' 我的待辦事項</h2></div>'
      + '<div id="' + myTasksSlotId + '" class="dashboard-card-loading" aria-busy="true">正在載入您的待辦事項…</div></section></div>'
    ) : '';

    const settingsBtn = '<button class="btn btn-ghost btn-sm" data-action="case.dashboardSettings" title="自訂儀表板">' + ic('settings', 'icon-sm') + ' 自訂</button>';

    document.getElementById('app').innerHTML = '<div class="animate-in">'
        + '<div class="dashboard-toolbar"><div class="dashboard-toolbar-actions">' + settingsBtn + '</div></div>'
        + auditProgressHtml
        + myTasksHtml
        + '<div data-dashboard-section="todayFocus"><section class="dashboard-hero dashboard-hero--integrated"><h1 class="sr-only" data-route-heading="true">儀表板</h1><div class="dashboard-hero-grid"><div class="dashboard-hero-copy dashboard-hero-copy--integrated"><p class="dashboard-hero-text dashboard-hero-text--lead">集中掌握矯正單進度、逾期風險與最近活動，讓主管與承辦人可以在同一個入口快速判斷優先順序。</p><div class="dashboard-meta-row">' + heroMeta + '</div><div class="dashboard-hero-actions">' + createBtn + '</div></div>' + heroSide + '</div></section></div>'
      + '<div data-dashboard-section="correctiveStats"><div class="stats-grid">'
      + buildCaseStatCard('total', 'files', '—', '矯正單總數')
      + buildCaseStatCard('pending', 'clock', '—', '待矯正')
      + buildCaseStatCard('overdue', 'alert-triangle', '—', '已逾期')
      + buildCaseStatCard('closed', 'check-circle-2', '—', '本月結案')
      + '</div></div>'
      + '<div data-dashboard-section="recentCases"><div class="dashboard-grid">'
      + buildCaseCard('<span class="card-title">狀態分布</span>', chartShell, { cardClass: 'dashboard-panel dashboard-chart-panel' })
      + buildCaseCard('<span class="card-title">最近矯正單</span><a href="#list" class="btn btn-ghost btn-sm">查看全部 →</a>', recentShell, { cardClass: 'dashboard-panel dashboard-table-panel' })
        + '</div></div></div>';

    applyDashboardVisibility();
    scheduleRefreshIcons();

    scheduleDashboardHydration(function () {
      if (renderToken !== dashboardRenderToken) return;
      const items = getVisibleItems();
      const snapshot = getCachedDashboardSnapshot(items);
      const total = snapshot.total;
      const pending = snapshot.pendingCount;
      const overdue = snapshot.overdueCount;
      const closedM = snapshot.closedThisMonth;
      const openCount = snapshot.openCount;
      const distributionOrder = [STATUSES.CREATED, STATUSES.PENDING, STATUSES.PROPOSED, STATUSES.REVIEWING, STATUSES.TRACKING, '已逾期', STATUSES.CLOSED];
      const sc = snapshot.bucketCounts;
      const cc = {};
      cc[STATUSES.CREATED] = 'var(--status-created)';
      cc[STATUSES.PENDING] = 'var(--status-pending)';
      cc[STATUSES.PROPOSED] = 'var(--status-responded)';
      cc[STATUSES.REVIEWING] = '#06b6d4';
      cc[STATUSES.TRACKING] = '#f97316';
      cc['已逾期'] = 'var(--status-overdue)';
      cc[STATUSES.CLOSED] = 'var(--status-closed)';
      const R = 60, C = 2 * Math.PI * R; let segs = '', off = 0;
      if (total > 0) {
        distributionOrder.forEach(function (s) {
          const c2 = sc[s];
          if (!c2) return;
          const l = c2 / total * C;
          segs += '<circle r="' + R + '" cx="80" cy="80" fill="none" stroke="' + cc[s] + '" stroke-width="20" stroke-dasharray="' + l + ' ' + (C - l) + '" stroke-dashoffset="' + (-off) + '"/>';
          off += l;
        });
      } else {
        segs = '<circle r="' + R + '" cx="80" cy="80" fill="none" stroke="var(--border-color)" stroke-width="20"/>';
      }
      const svg = '<svg viewBox="0 0 160 160" class="donut-chart">' + segs + '<text x="80" y="74" text-anchor="middle" fill="var(--text-heading)" font-size="24" font-weight="700" font-family="Inter">' + total + '</text><text x="80" y="94" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-weight="500" font-family="Inter">總計</text></svg>';
      const leg = distributionOrder.map(function (s) {
        return '<div class="legend-item"><span class="legend-dot" style="background:' + cc[s] + '"></span><span>' + s + '</span><span class="legend-count">' + sc[s] + '</span></div>';
      }).join('');
      const nextDueItem = snapshot.nextDueItem;
      const focusLine = overdue > 0
        ? '目前有 ' + overdue + ' 筆矯正單已逾期，建議優先追蹤。'
        : (pending > 0 ? '目前有 ' + pending + ' 筆待矯正事項，可優先分派與提醒。' : '目前沒有逾期項目，整體進度維持穩定。');
      const chartSlot = document.getElementById(chartSlotId);
      const recentSlot = document.getElementById(recentSlotId);
      if (!chartSlot || !recentSlot) return;
      const recentRows = snapshot.recent.length ? snapshot.recent.map(function (entry) {
        const lastActivityText = entry.lastActivity ? fmtTime(new Date(entry.lastActivity).toISOString()) : '—';
        return renderDashboardTableRow(entry.item, lastActivityText);
      }).join('') : buildCaseEmptyTableRow(7, 'inbox', '沒有矯正單資料', 40);
      const totalStat = document.getElementById(heroMetaIds.total);
      const pendingStat = document.getElementById(heroMetaIds.pendingStat);
      const overdueStat = document.getElementById(heroMetaIds.overdueStat);
      const closedStat = document.getElementById(heroMetaIds.closedStat);
      if (totalStat) totalStat.textContent = String(total);
      if (pendingStat) pendingStat.textContent = String(pending);
      if (overdueStat) overdueStat.textContent = String(overdue);
      if (closedStat) closedStat.textContent = String(closedM);
      const heroPending = document.getElementById(heroMetaIds.pending);
      const heroOverdue = document.getElementById(heroMetaIds.overdue);
      const heroClosed = document.getElementById(heroMetaIds.closed);
      if (heroPending) heroPending.textContent = String(pending);
      if (heroOverdue) heroOverdue.textContent = String(overdue);
      if (heroClosed) heroClosed.textContent = String(closedM);
      const focusTextEl = document.getElementById(heroMetaIds.focusText);
      if (focusTextEl) focusTextEl.textContent = focusLine;
      const nextDueEl = document.getElementById(heroMetaIds.nextDue);
      if (nextDueEl) nextDueEl.textContent = nextDueItem ? (String(nextDueItem.id || '') + ' · ' + fmt(nextDueItem.correctiveDueDate)) : '目前無';
      const openCountEl = document.getElementById(heroMetaIds.openCount);
      if (openCountEl) openCountEl.textContent = String(openCount);
      const latestHandlerEl = document.getElementById(heroMetaIds.latestHandler);
      if (latestHandlerEl) latestHandlerEl.textContent = snapshot.recent[0] ? String(snapshot.recent[0].item && snapshot.recent[0].item.handlerName || '—') : '—';
      chartSlot.classList.remove('dashboard-card-loading');
      chartSlot.innerHTML = buildDashboardStatusOverview(snapshot) + '<div class="donut-chart-container">' + svg + '<div class="donut-legend">' + leg + '</div></div>';
      recentSlot.classList.remove('dashboard-card-loading');
      recentSlot.innerHTML = buildCaseTableMarkup('<th class="record-id-head">單號</th><th>說明</th><th>狀態</th><th>最後活動</th><th>處理人</th><th>預定完成</th><th>下次追蹤</th>', recentRows, { wrapperClass: 'dashboard-recent-table-wrapper', tableClass: 'dashboard-recent-table' });
      window.setTimeout(function () {
        if (renderToken !== dashboardRenderToken) return;
        scheduleRefreshIcons();
        bindCopyButtons(recentSlot);
      }, 0);
    });

    // Audit progress hydration (admin only, parallel to CAR hydration)
    // ── First-time user guide ──
    const guideKey = '__isms_guide_shown_' + (user && user.username || 'anon');
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(guideKey)) {
      localStorage.setItem(guideKey, '1');
      window.setTimeout(function () {
        if (renderToken !== dashboardRenderToken) return;
        if (showMyTasks) {
          toast('歡迎！請先從「待辦事項」開始，完成您的檢核表填報。', 'info');
          window.setTimeout(function () { toast('提示：左側選單可以查看矯正單和教育訓練統計。', 'info'); }, 2500);
        } else {
          toast('歡迎！儀表板顯示全校稽核進度。', 'info');
          window.setTimeout(function () { toast('提示：向下滾動可查看矯正單狀態分布。', 'info'); }, 2500);
        }
      }, 1500);
    }

    // ── My Tasks hydration (unit admin only) ──
    if (showMyTasks && typeof fetchMyTasks === 'function') {
      fetchMyTasks().then(function (result) {
        if (renderToken !== dashboardRenderToken) return;
        const slot = document.getElementById(myTasksSlotId);
        if (!slot) return;
        slot.classList.remove('dashboard-card-loading');
        slot.removeAttribute('aria-busy');
        if (!result || !result.ok || !result.data) {
          slot.innerHTML = '<div class="card empty-state--pad-20"><div class="empty-state empty-state--compact"><div class="empty-state-title">無法載入待辦事項</div></div></div>';
          return;
        }
        const tasks = Array.isArray(result.data.tasks) ? result.data.tasks : [];
        const summary = result.data.summary || {};
        if (!tasks.length) {
          slot.innerHTML = '<div class="card empty-state--pad-24"><div class="empty-state"><div class="empty-state-icon">' + ic('check-circle-2') + '</div><div class="empty-state-title">太棒了！目前沒有待辦事項</div><div class="empty-state-desc">所有檢核表已送出、矯正單已處理完畢。</div></div></div>';
          scheduleRefreshIcons();
          return;
        }
        const priorityIcons = { urgent: 'alert-circle', high: 'alert-triangle', medium: 'clock' };
        const priorityColors = { urgent: 'var(--color-error)', high: 'var(--color-warning)', medium: 'var(--color-info)' };
        const taskCards = tasks.map(function (t) {
          const iconName = priorityIcons[t.priority] || 'circle';
          const color = priorityColors[t.priority] || 'var(--text-muted)';
          return '<a href="' + esc(t.route || '#') + '" class="my-task-card" style="border-left:3px solid ' + color + '">'
            + '<div class="my-task-icon" style="color:' + color + '">' + ic(iconName, 'icon-sm') + '</div>'
            + '<div class="my-task-content"><div class="my-task-title">' + esc(t.title) + '</div>'
            + (t.subtitle ? '<div class="my-task-subtitle">' + esc(t.subtitle) + '</div>' : '')
            + '</div>'
            + '<span class="my-task-action btn btn-sm btn-primary">' + esc(t.action || '處理') + '</span></a>';
        }).join('');
        const summaryHtml = '<div class="my-tasks-summary">'
          + '<span class="my-tasks-chip ' + (summary.checklistStatus === '已送出' ? 'chip-success' : 'chip-warning') + '">' + ic(summary.checklistStatus === '已送出' ? 'check-circle-2' : 'file-edit', 'icon-xs') + ' 檢核表：' + esc(summary.checklistStatus || '未知') + '</span>'
          + '<span class="my-tasks-chip ' + (summary.openCases > 0 ? 'chip-warning' : 'chip-success') + '">' + ic(summary.openCases > 0 ? 'alert-triangle' : 'check-circle-2', 'icon-xs') + ' 矯正單：' + (summary.openCases || 0) + ' 件開放</span>'
          + '<span class="my-tasks-chip ' + (summary.trainingStatus === '已完成' ? 'chip-success' : 'chip-warning') + '">' + ic(summary.trainingStatus === '已完成' ? 'check-circle-2' : 'graduation-cap', 'icon-xs') + ' 教育訓練：' + esc(summary.trainingStatus || '未知') + '</span>'
          + '</div>';
        slot.innerHTML = '<div class="card card--flush">'
          + '<div class="dashboard-tasks-header">' + summaryHtml + '</div>'
          + '<div class="my-tasks-list">' + taskCards + '</div></div>';
        scheduleRefreshIcons();
      }).catch(function () {});
    }

    if (showAuditProgress && typeof fetchDashboardSummary === 'function') {
      const selectedYear = (document.getElementById('audit-year-select') || {}).value || currentAuditYear;
      fetchDashboardSummary({ auditYear: selectedYear, trainingYear: selectedYear }).then(function (result) {
        if (renderToken !== dashboardRenderToken) return;
        if (!result || !result.ok || !result.data) {
          const errSlot = document.getElementById(auditSlotIds.filing);
          if (errSlot) { errSlot.classList.remove('dashboard-card-loading'); errSlot.innerHTML = '<div class="empty-state empty-state--compact"><div class="empty-state-title">無法載入稽核進度</div></div>'; }
          return;
        }
        const d = result.data;
        const cl = d.checklist || {};
        const tr = d.training || {};
        const pd = d.pending || {};
        const totalU = Number(cl.totalUnits) || 163;
        const subU = Number(cl.submittedUnits) || 0;
        const filingPct = totalU > 0 ? Math.round(subU / totalU * 100) : 0;
        const avgRate = Number(tr.avgCompletionRate) || 0;
        const pendingTotal = Number(pd.totalPendingItems) || 0;

        // Update stat cards
        const fs = document.getElementById(auditSlotIds.filingStat);
        if (fs) fs.textContent = subU + '/' + totalU;
        const ts2 = document.getElementById(auditSlotIds.trainingStat);
        if (ts2) ts2.textContent = avgRate + '%';
        const ps = document.getElementById(auditSlotIds.pendingStat);
        if (ps) ps.textContent = String(pendingTotal);

        // Filing progress panel
        const filingSlot = document.getElementById(auditSlotIds.filing);
        if (filingSlot) {
          filingSlot.classList.remove('dashboard-card-loading');
          filingSlot.removeAttribute('aria-busy');
          const filingLight = filingPct >= 80 ? 'var(--color-success)' : (filingPct >= 50 ? 'var(--color-warning)' : 'var(--color-error)');
          const filingLightLabel = filingPct >= 80 ? '進度良好' : (filingPct >= 50 ? '需要催辦' : '嚴重落後');
          filingSlot.innerHTML = '<div class="dashboard-panel-body">'
            + '<div class="dashboard-panel-row"><div class="dashboard-panel-indicator"><span class="dashboard-status-dot" style="background:' + filingLight + '"></span><span class="dashboard-status-label" style="color:' + filingLight + '">' + filingLightLabel + '</span></div><span class="dashboard-panel-text">' + esc(String(subU)) + ' / ' + esc(String(totalU)) + ' 個單位已送出</span><strong class="dashboard-panel-pct">' + filingPct + '%</strong></div>'
            + '<div class="dashboard-progress-bar"><div class="dashboard-progress-fill" style="width:' + filingPct + '%;background:linear-gradient(90deg,' + filingLight + ',' + filingLight + ')"></div></div>'
            + '<div class="dashboard-panel-pills">'
            + '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">已送出</span><strong class="dashboard-panel-pill-value">' + esc(String(cl.submittedCount || subU)) + '</strong></div>'
            + '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">草稿中</span><strong class="dashboard-panel-pill-value">' + esc(String(cl.draftCount || 0)) + '</strong></div>'
            + '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">未填報</span><strong class="dashboard-panel-pill-value">' + esc(String(cl.notFiledUnits || (totalU - subU))) + '</strong></div>'
            + '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">稽核年度</span><strong class="dashboard-panel-pill-value">' + esc(cl.auditYear || '') + '</strong></div>'
            + '</div></div>';
        }

        // Training overview panel
        const trainingSlot = document.getElementById(auditSlotIds.training);
        if (trainingSlot) {
          trainingSlot.classList.remove('dashboard-card-loading');
          trainingSlot.removeAttribute('aria-busy');
          const compF = Number(tr.completedForms) || 0;
          const draftF = Number(tr.draftForms) || 0;
          const pendF = Number(tr.pendingForms) || 0;
          const retF = Number(tr.returnedForms) || 0;
          const totalF = Number(tr.totalForms) || 0;
          const tPct = totalF > 0 ? Math.round(compF / totalF * 100) : 0;
          const trainLight = tPct >= 80 ? 'var(--color-success)' : (tPct >= 50 ? 'var(--color-warning)' : 'var(--color-error)');
          const trainLightLabel = tPct >= 80 ? '達標' : (tPct >= 50 ? '進行中' : '需注意');
          trainingSlot.innerHTML = '<div class="dashboard-panel-body">'
            + '<div class="dashboard-panel-row"><div class="dashboard-panel-indicator"><span class="dashboard-status-dot" style="background:' + trainLight + '"></span><span class="dashboard-status-label" style="color:' + trainLight + '">' + trainLightLabel + '</span></div><span class="dashboard-panel-text">全校訓練完成率</span><strong class="dashboard-panel-pct">' + tPct + '%</strong></div>'
            + '<div class="dashboard-progress-bar"><div class="dashboard-progress-fill" style="width:' + tPct + '%;background:linear-gradient(90deg,' + trainLight + ',' + trainLight + ')"></div></div>'
            + '<div class="dashboard-panel-pills">'
            + '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">已完成</span><strong class="dashboard-panel-pill-value">' + compF + '</strong></div>'
            + '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">填報中</span><strong class="dashboard-panel-pill-value">' + (draftF + pendF) + '</strong></div>'
            + '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">退回更正</span><strong class="dashboard-panel-pill-value">' + retF + '</strong></div>'
            + '<div class="dashboard-panel-pill"><span class="dashboard-panel-pill-label">待處理</span><strong class="dashboard-panel-pill-value" style="' + (pendingTotal > 0 ? 'color:var(--color-error)' : '') + '">' + pendingTotal + ' 項</strong></div>'
            + '</div></div>';
        }
        // Show toast notification for pending items
        if (pendingTotal > 0) {
          toast('您有 ' + pendingTotal + ' 項待處理事項需要關注', 'info');
        }
        scheduleRefreshIcons();

        // Bind year selector change
        const yearSelect = document.getElementById('audit-year-select');
        if (yearSelect) {
          yearSelect.addEventListener('change', function () {
            renderDashboard();
          });
        }
      }).catch(function () {});
    }
  }

  function exportCaseListCsv() {
    const items = getVisibleItems();
    if (!items.length) { toast('沒有可匯出的矯正單資料', 'error'); return; }
    const headers = ['單號', '缺失種類', '來源', '分類', '狀態', '提報單位', '提報人', '處理單位', '處理人', '處理人郵件', '問題說明', '矯正措施', '預定完成日', '下次追蹤', '開立日期', '結案日期'];
    const rows = items.map(function (item) {
      return [
        item.id, item.deficiencyType, item.source,
        Array.isArray(item.category) ? item.category.join('、') : '',
        item.status, item.proposerUnit, item.proposerName,
        item.handlerUnit, item.handlerName, item.handlerEmail,
        String(item.problemDesc || '').replace(/[\r\n]+/g, ' '),
        String(item.correctiveAction || '').replace(/[\r\n]+/g, ' '),
        item.correctiveDueDate ? item.correctiveDueDate.slice(0, 10) : '',
        item.reviewNextDate ? item.reviewNextDate.slice(0, 10) : '',
        item.createdAt ? item.createdAt.slice(0, 10) : '',
        item.closedDate ? item.closedDate.slice(0, 10) : ''
      ];
    });
    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(function (row) {
      return row.map(function (cell) { return '"' + String(cell || '').replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ISMS_矯正單_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast('已匯出 ' + items.length + ' 筆矯正單', 'success');
  }

  let curFilter = '全部', curSearch = '';

  // ─── Batch operations ─────────────────────
  function getSelectedBatchIds() {
    const checks = document.querySelectorAll('.batch-row-chk:checked');
    const ids = [];
    for (let i = 0; i < checks.length; i++) { ids.push(checks[i].value); }
    return ids;
  }

  function updateBatchToolbar() {
    const toolbar = document.getElementById('batch-toolbar');
    if (!toolbar) return;
    const selected = getSelectedBatchIds();
    const countEl = toolbar.querySelector('.batch-selected-count');
    if (countEl) countEl.textContent = '\u5df2\u9078\u53d6 ' + selected.length + ' \u7b46';
    toolbar.style.display = selected.length > 0 ? 'flex' : 'none';
    const selectAll = document.getElementById('batch-select-all');
    if (selectAll) {
      const allChecks = document.querySelectorAll('.batch-row-chk');
      selectAll.checked = allChecks.length > 0 && selected.length === allChecks.length;
      selectAll.indeterminate = selected.length > 0 && selected.length < allChecks.length;
    }
  }

  function handleBatchSelectAll(event) {
    const checked = event.target.checked;
    const allChecks = document.querySelectorAll('.batch-row-chk');
    for (let i = 0; i < allChecks.length; i++) { allChecks[i].checked = checked; }
    updateBatchToolbar();
  }

  async function handleBatchReminder() {
    const ids = getSelectedBatchIds();
    if (!ids.length) { toast('\u8acb\u5148\u52fe\u9078\u8981\u50ac\u8fa6\u7684\u77ef\u6b63\u55ae', 'error'); return; }
    try {
      const response = await fetch('/api/batch-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseIds: ids })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      toast('\u5df2\u9001\u51fa ' + ids.length + ' \u7b46\u50ac\u8fa6\u901a\u77e5', 'success');
    } catch (error) {
      toast('\u6279\u6b21\u50ac\u8fa6\u5931\u6557\uff1a' + String(error && error.message || error), 'error');
    }
  }

  function handleBatchExportCsv() {
    const ids = getSelectedBatchIds();
    if (!ids.length) { toast('\u8acb\u5148\u52fe\u9078\u8981\u532f\u51fa\u7684\u77ef\u6b63\u55ae', 'error'); return; }
    const allItems = getVisibleItems();
    const items = allItems.filter(function (item) { return ids.indexOf(item.id) >= 0; });
    if (!items.length) { toast('\u627e\u4e0d\u5230\u5df2\u9078\u53d6\u7684\u77ef\u6b63\u55ae\u8cc7\u6599', 'error'); return; }
    const headers = ['\u55ae\u865f', '\u7f3a\u5931\u7a2e\u985e', '\u4f86\u6e90', '\u5206\u985e', '\u72c0\u614b', '\u63d0\u5831\u55ae\u4f4d', '\u63d0\u5831\u4eba', '\u8655\u7406\u55ae\u4f4d', '\u8655\u7406\u4eba', '\u8655\u7406\u4eba\u90f5\u4ef6', '\u554f\u984c\u8aaa\u660e', '\u77ef\u6b63\u63aa\u65bd', '\u9810\u5b9a\u5b8c\u6210\u65e5', '\u4e0b\u6b21\u8ffd\u8e64', '\u958b\u7acb\u65e5\u671f', '\u7d50\u6848\u65e5\u671f'];
    const rows = items.map(function (item) {
      return [
        item.id, item.deficiencyType, item.source,
        Array.isArray(item.category) ? item.category.join('\u3001') : '',
        item.status, item.proposerUnit, item.proposerName,
        item.handlerUnit, item.handlerName, item.handlerEmail,
        String(item.problemDesc || '').replace(/[\r\n]+/g, ' '),
        String(item.correctiveAction || '').replace(/[\r\n]+/g, ' '),
        item.correctiveDueDate ? item.correctiveDueDate.slice(0, 10) : '',
        item.reviewNextDate ? item.reviewNextDate.slice(0, 10) : '',
        item.createdAt ? item.createdAt.slice(0, 10) : '',
        item.closedDate ? item.closedDate.slice(0, 10) : ''
      ];
    });
    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(function (row) {
      return row.map(function (cell) { return '"' + String(cell || '').replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ISMS_\u77ef\u6b63\u55ae_\u6279\u6b21\u532f\u51fa_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast('\u5df2\u532f\u51fa ' + items.length + ' \u7b46\u5df2\u9078\u53d6\u77ef\u6b63\u55ae', 'success');
  }

  function renderList() {
    const items = getVisibleItems(); const filters = ['全部'].concat(STATUS_FLOW).concat(['已逾期']); const listSnapshot = getCachedCaseListSnapshot(items); const filtered = listSnapshot.filtered;
    const ftabs = filters.map(function (f) { return '<button class="filter-tab ' + (curFilter === f ? 'active' : '') + '" data-filter="' + f + '">' + f + '</button>'; }).join('');
    const createBtn = canCreateCAR() ? '<a href="#create" class="btn btn-primary">' + ic('plus-circle', 'icon-sm') + ' 開立矯正單</a>' : '';
    const exportBtn = '<button type="button" class="btn btn-secondary" id="case-export-csv">' + ic('download', 'icon-sm') + ' \u532f\u51fa CSV</button>';
    const batchToolbar = '<div id="batch-toolbar" class="batch-toolbar" style="display:none;align-items:center;gap:10px;padding:8px 16px;background:var(--color-surface-secondary,#f5f6fa);border-radius:6px;margin-bottom:8px">'
      + '<span class="batch-selected-count" style="font-weight:600;font-size:0.95em">\u5df2\u9078\u53d6 0 \u7b46</span>'
      + '<button type="button" class="btn btn-primary btn-sm" id="batch-reminder-btn">' + ic('bell', 'icon-sm') + ' \u6279\u6b21\u50ac\u8fa6</button>'
      + '<button type="button" class="btn btn-secondary btn-sm" id="batch-export-btn">' + ic('download', 'icon-sm') + ' \u6279\u6b21\u532f\u51fa</button>'
      + '</div>';
    document.getElementById('app').innerHTML = '<div class="animate-in">' +
      '<div class="page-header"><div><h1 class="page-title">\u77ef\u6b63\u55ae\u5217\u8868</h1><p class="page-subtitle">\u5171 ' + listSnapshot.total + ' \u7b46\uff0c\u986f\u793a ' + listSnapshot.filteredCount + ' \u7b46</p></div><div class="page-header-actions">' + exportBtn + createBtn + '</div></div>' +
      '<div class="toolbar"><div class="search-box"><input type="text" placeholder="\u641c\u5c0b\u55ae\u865f\u3001\u8aaa\u660e\u3001\u4eba\u54e1..." id="search-input" value="' + esc(curSearch) + '"></div><div class="filter-tabs" id="filter-tabs">' + ftabs + '</div></div>' +
      batchToolbar +
      buildCaseCard('', buildCaseTableMarkup('<th class="batch-chk-col" style="width:40px"><label class="chk-label chk-label--center" title="\u5168\u9078"><input type="checkbox" id="batch-select-all"><span class="chk-box"></span></label></th><th class="record-id-head">\u55ae\u865f</th><th>\u7f3a\u5931\u7a2e\u985e</th><th>\u4f86\u6e90</th><th>\u72c0\u614b</th><th>\u63d0\u51fa\u4eba</th><th>\u8655\u7406\u4eba</th><th>\u9810\u5b9a\u5b8c\u6210</th><th>\u4e0b\u6b21\u8ffd\u8e64</th>', listSnapshot.rows), { cardClass: 'case-table-card' }) + '</div>';
    window.setTimeout(function () {
      scheduleRefreshIcons();
      bindCopyButtons();
      const exportCsvBtn = document.getElementById('case-export-csv');
      if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCaseListCsv);
    }, 0);
    // ─── Batch operation event wiring ────────
    const selectAllChk = document.getElementById('batch-select-all');
    if (selectAllChk) bindCasePageEvent(selectAllChk, 'change', handleBatchSelectAll);
    bindCasePageEvent(document.getElementById('app'), 'change', function (e) {
      if (e.target && e.target.classList.contains('batch-row-chk')) updateBatchToolbar();
    });
    const batchReminderBtn = document.getElementById('batch-reminder-btn');
    if (batchReminderBtn) bindCasePageEvent(batchReminderBtn, 'click', handleBatchReminder);
    const batchExportBtn = document.getElementById('batch-export-btn');
    if (batchExportBtn) bindCasePageEvent(batchExportBtn, 'click', handleBatchExportCsv);
    let searchRenderTimer = null;
    const scheduleRenderList = function () {
      if (searchRenderTimer) window.clearTimeout(searchRenderTimer);
      searchRenderTimer = window.setTimeout(function () {
        searchRenderTimer = null;
        renderList();
      }, CASE_LIST_SEARCH_DEBOUNCE_MS);
    };
    registerCasePageCleanup(function () {
      if (searchRenderTimer) {
        window.clearTimeout(searchRenderTimer);
        searchRenderTimer = null;
      }
    });
    bindCasePageEvent(document.getElementById('search-input'), 'input', function (e) { curSearch = e.target.value; scheduleRenderList(); });
    bindCasePageEvent(document.getElementById('filter-tabs'), 'click', function (e) { if (e.target.classList.contains('filter-tab')) { curFilter = e.target.dataset.filter; renderList(); } });
  }

  // ─── Render: Create ────────────────────────
  function buildCreatePage(u) {
    const accessProfile = getCaseAccessProfile(u);
    const scopedUnit = String((accessProfile && accessProfile.activeUnit) || (accessProfile && accessProfile.primaryUnit) || (accessProfile && accessProfile.unit) || '').trim();
    const createAside = '<div class="editor-sticky">'
      + buildEditorSideCard({
        accent: true,
        kicker: 'Issue Routing',
        title: '開單摘要',
        text: '右側摘要會跟著你的填寫內容即時更新，避免漏掉單號、指派與期限設定。',
        bodyHtml: buildEditorSummaryItems([
          { label: '編號前綴', value: '待指定', id: 'create-summary-docno' },
          { label: '矯正單號', value: '自動編號', id: 'create-summary-id' },
          { label: '提報單位', value: esc(scopedUnit || '未指定'), id: 'create-summary-proposer' },
          { label: '處理單位', value: '待指定', id: 'create-summary-handler-unit' },
          { label: '處理人員', value: '待指定', id: 'create-summary-handler' },
          { label: '預計完成', value: '未指定', id: 'create-summary-due' },
          { label: '通知方式', value: '送出後寄送通知', id: 'create-summary-notify' }
        ])
      })
      + buildEditorSideCard({
        title: '流程節點',
        bodyHtml: buildEditorStepItems([
          { title: '建立矯正單', text: '填寫缺失、來源與改善期限，並指定處理單位與人員。' },
          { title: '處理人員回覆', text: '承辦人填寫改善措施、根因與佐證資料後送審。' },
          { title: '管理者審核追蹤', text: '管理者可核可、退回或進入追蹤，直到結案。' }
        ])
      })
      + buildEditorSideCard({
        title: '填寫提醒',
        bodyHtml: buildEditorNoteItems([
          '若要使用自訂單號，建議先依正式公文或管考序號命名，避免後續重複。',
          '缺失描述請直接寫出現況、風險與影響範圍，後續追蹤會更清楚。',
          '改善期限建議保留合理緩衝，避免剛送出就進入逾期狀態。'
        ])
      })
      + '</div>';

    return `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">開立矯正單</h1><p class="page-subtitle">建立內部資通安全稽核矯正單，送出後即可進入處理與追蹤流程。</p></div></div>
      <div class="editor-shell editor-shell--car">
        <section class="editor-main">
          <div class="card editor-card"><form id="create-form" data-testid="create-form">
            <div class="form-feedback" id="create-feedback" data-state="idle" aria-live="polite" hidden></div>
            <div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div>
            <div class="form-row form-row--create-meta">
              <div class="form-group"><label class="form-label">編號前綴</label><input type="text" class="form-input" id="f-docno" placeholder="選擇處理單位後自動帶入" readonly><p class="form-hint">系統依 NTU 文件編號規範自動帶入，例如 NTU-022-IS2-11-F03-115。</p></div>
              <div class="form-group"><label class="form-label">案件編號</label><input type="text" class="form-input" id="f-id" placeholder="留白則由系統自動產生，例如 NTU-022-IS2-11-F03-115-1"><p class="form-hint">若留白，系統自動產生，例如 NTU-022-IS2-11-F03-115-1；若手動輸入，僅支援英數、連字號與底線。</p></div>
              <div class="form-group"><label class="form-label form-required">提報單位</label>${buildUnitCascadeControl('f-punit', scopedUnit, true, true)}</div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">提報日期</label><input type="date" class="form-input" id="f-pdate" value="${new Date().toISOString().split('T')[0]}" required></div>
              <div class="form-group"><label class="form-label form-required">提報人員</label><input type="text" class="form-input" id="f-pname" value="${esc(u.name)}" readonly></div>
              <div class="form-group"><label class="form-label form-required">處理單位</label>${buildUnitCascadeControl('f-hunit', '', false, true)}</div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">處理人員</label><select class="form-select" id="f-hname" data-testid="create-handler-name" required><option value="">請先選擇處理單位</option></select></div>
              <div class="form-group"><label class="form-label">指派日期</label><input type="date" class="form-input" id="f-hdate"></div>
              <div class="form-group"><label class="form-label">處理人員電子郵件</label><div class="input-with-icon"><input type="email" class="form-input" id="f-hemail" placeholder="選擇處理人員後自動帶入" readonly><span class="input-icon-hint">${ic('mail', 'icon-xs')}</span></div><p class="form-hint">系統後續通知將優先送往此電子郵件</p></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">通知設定</label><label class="chk-label chk-label--top-4"><input type="checkbox" id="f-notify" checked><span class="chk-box"></span>開單後寄送指派通知給處理人員</label></div>
            </div>
            <div class="section-header">${ic('tag', 'icon-sm')} 缺失分類</div>
            <div class="form-group"><label class="form-label form-required">缺失種類</label>${mkRadio('defType', DEF_TYPES, '')}</div>
            <div class="form-group"><label class="form-label form-required">來源</label>${mkRadio('source', SOURCES, '')}</div>
            <div class="form-group"><label class="form-label form-required">分類（可複選）</label>${mkChk('category', CATEGORIES, [])}</div>
            <div class="form-group"><label class="form-label">條文</label><input type="text" class="form-input" id="f-clause" placeholder="例：A.9.2.6、ISO 27001:2022"></div>
            <div class="section-header">${ic('message-square-warning', 'icon-sm')} 問題描述</div>
            <div class="form-group"><label class="form-label form-required">問題或缺失說明</label><textarea class="form-textarea form-textarea--min-112" id="f-problem" placeholder="請具體描述發現的問題、缺失情境與影響範圍" required></textarea></div>
            <div class="form-group"><label class="form-label form-required">缺失發生情形</label><textarea class="form-textarea form-textarea--min-92" id="f-occurrence" placeholder="說明缺失發生的背景、時間點與實際狀況" required></textarea></div>
            <div class="section-header">${ic('calendar', 'icon-sm')} 時程設定</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">預定完成日期</label><input type="date" class="form-input" id="f-due" required></div>
            </div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 送出矯正單</button><a href="#list" class="btn btn-secondary">返回列表</a></div>
          </form></div>
        </section>
        <aside class="editor-aside">${createAside}</aside>
      </div></div>`;
  }

  function renderCreate() {
    if (!canCreateCAR()) { navigate('dashboard'); toast('您沒有開立矯正單權限', 'error'); return; }
    const u = getCaseAccessProfile(currentUser());
    const allUsers = getUsers().map((entry) => getCaseAccessProfile(entry));
    const users = allUsers.filter((x) => x && x.role === ROLES.UNIT_ADMIN);

    if (canManageUsers(u) && !users.length && !renderCreate._usersSyncAttempted) {
      const appRoot = document.getElementById('app');
      if (appRoot) {
        appRoot.innerHTML = '<div class="busy-overlay" aria-live="polite" aria-busy="true"><div class="busy-card"><span class="busy-spinner" aria-hidden="true"></span><div class="busy-title">正在同步處理人員清單…</div></div></div>';
      }
      if (!renderCreate._usersSyncPromise && typeof syncUsersFromM365 === 'function') {
        renderCreate._usersSyncAttempted = true;
        renderCreate._usersSyncPromise = Promise.resolve()
          .then(() => syncUsersFromM365({ silent: true }))
          .catch((error) => {
            window.__ismsWarn('create handler sync failed', error);
          })
          .finally(() => {
            renderCreate._usersSyncPromise = null;
            if (String(window.location.hash || '').startsWith('#create')) {
              navigate('create', { replace: true, allowDirtyNavigation: true });
            }
          });
      }
      return;
    }

    document.getElementById('app').innerHTML = buildCreatePage(u);
    scheduleRefreshIcons();
    applyTestIds({
      'f-docno': 'create-document-no',
      'f-id': 'create-id',
      'f-pdate': 'create-proposer-date',
      'f-pname': 'create-proposer-name',
      'f-hdate': 'create-handler-date',
      'f-hemail': 'create-handler-email',
      'f-notify': 'create-notify',
      'f-clause': 'create-clause',
      'f-problem': 'create-problem',
      'f-occurrence': 'create-occurrence',
      'f-due': 'create-due'
    });
    applySelectorTestIds([
      { selector: '#create-form button[type="submit"]', testId: 'create-submit' }
    ]);
    const documentNoInput = document.getElementById('f-docno');
    const idInput = document.getElementById('f-id');
    const proposerUnit = document.getElementById('f-punit');
    const proposerDateInput = document.getElementById('f-pdate');
    const handlerUnit = document.getElementById('f-hunit');
    const handlerName = document.getElementById('f-hname');
    const handlerEmailInput = document.getElementById('f-hemail');
    const dueInput = document.getElementById('f-due');
    dueInput.min = new Date().toISOString().slice(0, 10);
    const notifyInput = document.getElementById('f-notify');
    const summaryDocNo = document.getElementById('create-summary-docno');
    const summaryId = document.getElementById('create-summary-id');
    const summaryProposer = document.getElementById('create-summary-proposer');
    const summaryHandlerUnit = document.getElementById('create-summary-handler-unit');
    const summaryHandler = document.getElementById('create-summary-handler');
    const summaryDue = document.getElementById('create-summary-due');
    const summaryNotify = document.getElementById('create-summary-notify');

    // 管理者可以選任何單位作為提報單位；單位管理員則固定為自己的單位
    const isAdminUser = typeof isAdmin === 'function' && isAdmin();
    const proposerDisabled = !isAdminUser && !!(u.activeUnit || u.primaryUnit || u.unit);
    initUnitCascade('f-punit', u.activeUnit || u.primaryUnit || u.unit || '', { disabled: proposerDisabled, registerCleanup: registerCasePageCleanup });
    initUnitCascade('f-hunit', '', { disabled: false, registerCleanup: registerCasePageCleanup });

    function getAutoGeneratedIdPreview() {
      const documentNo = buildCorrectionDocumentNo(handlerUnit.value, proposerDateInput.value);
      if (!documentNo) return '待選擇處理單位';
      const sequence = getNextCorrectionSequence(documentNo, loadData().items);
      return buildAutoCarIdByDocument(documentNo, sequence) || '待選擇處理單位';
    }

    function getSelectedHandlerOption() {
      return handlerName.options[handlerName.selectedIndex] || null;
    }

    function getSelectedHandlerDisplayName() {
      const selected = getSelectedHandlerOption();
      if (!selected || !selected.value) return '';
      return (selected.dataset && selected.dataset.displayName) || selected.value || '';
    }

    function syncCreateSummary() {
      const documentNo = buildCorrectionDocumentNo(handlerUnit.value, proposerDateInput.value);
      if (documentNoInput) documentNoInput.value = documentNo || '';
      if (summaryDocNo) summaryDocNo.textContent = documentNo || '\u672a\u6307\u5b9a';
      summaryId.textContent = normalizeCarIdInput(idInput.value) || getAutoGeneratedIdPreview();
      const proposerCode = getUnitCodeWithDots(proposerUnit.value);
      const handlerCode = getUnitCodeWithDots(handlerUnit.value);
      summaryProposer.textContent = proposerUnit.value ? `${proposerCode ? `${proposerCode} ` : ''}${proposerUnit.value}` : '\u672a\u6307\u5b9a';
      summaryHandlerUnit.textContent = handlerUnit.value ? `${handlerCode ? `${handlerCode} ` : ''}${handlerUnit.value}` : '\u5f85\u6307\u5b9a';
      summaryHandler.textContent = getSelectedHandlerDisplayName() || '\u5f85\u6307\u5b9a';
      summaryDue.textContent = dueInput.value ? fmt(dueInput.value) : '\u672a\u6307\u5b9a';
      summaryNotify.textContent = notifyInput.checked ? '\u9001\u51fa\u5f8c\u5bc4\u9001\u901a\u77e5' : '\u50c5\u5efa\u7acb\u55ae\u64da\uff0c\u4e0d\u5bc4\u9001\u901a\u77e5';
    }

    const currentUsername = String((u && u.username) || '').trim().toLowerCase();
    const currentEmail = String((u && u.email) || '').trim().toLowerCase();

    function filterUsersByUnit(unit) {
      if (!unit) return users;
      const selected = splitUnitValue(unit);
      return users.filter((entry) => {
        const entryUnits = normalizeCaseUnitList(
          Array.isArray(entry.authorizedUnits) && entry.authorizedUnits.length
            ? entry.authorizedUnits
            : [entry.primaryUnit || entry.unit]
        );
        const entryUsername = String(entry.username || '').trim().toLowerCase();
        const entryEmail = String(entry.email || '').trim().toLowerCase();
        if (entryUsername && entryUsername === currentUsername) return false;
        if (entryEmail && entryEmail === currentEmail) return false;
        if (!entryUnits.length) return false;
        return entryUnits.some((userUnit) => {
          if (userUnit === unit) return true;
          const target = splitUnitValue(userUnit);
          if (!selected.parent || selected.parent !== target.parent) return false;
          return !selected.child || selected.child === target.child;
        });
      });
    }

    function updateHandlerEmail() {
      const sel = getSelectedHandlerOption();
      const email = sel && sel.dataset ? (sel.dataset.email || '') : '';
      handlerEmailInput.value = email;
      syncCreateSummary();
    }

    function renderHandlerOptionsByUnit(unit) {
      const prevSelected = handlerName.value;
      const filtered = filterUsersByUnit(unit);
      let optionsHtml = '<option value="">\u8acb\u9078\u64c7\u8655\u7406\u4eba\u54e1</option>';
      optionsHtml += filtered.map((entry) => {
        const username = String(entry.username || '').trim();
        const displayName = String(entry.name || entry.username || entry.email || '\u672a\u547d\u540d\u5e33\u865f').trim();
        const unitLabel = formatUserUnitSummary(entry);
        return `<option value="${esc(username)}" data-display-name="${esc(displayName)}" data-username="${esc(username)}" data-email="${esc(entry.email || '')}">${esc(displayName)}\uFF08${esc(unitLabel)}\uFF09</option>`;
      }).join('');
      if (filtered.length === 0 && unit) {
        optionsHtml += '<option value="" disabled>\u2500\u2500 \u8a72\u55ae\u4f4d\u76ee\u524d\u7121\u7ba1\u7406\u54e1 \u2500\u2500</option>';
      }
      // Always show all users as fallback
      if (unit) {
        const allOther = users.filter(function(entry) {
          const un = String(entry.username || '').trim().toLowerCase();
          return un !== currentUsername && !filtered.some(function(f) { return String(f.username || '').trim() === un; });
        });
        if (allOther.length > 0) {
          optionsHtml += '<option value="" disabled>\u2500\u2500 \u5176\u4ed6\u55ae\u4f4d\u4eba\u54e1 \u2500\u2500</option>';
          optionsHtml += allOther.map(function(entry) {
            const username = String(entry.username || '').trim();
            const displayName = String(entry.name || entry.username || entry.email || '\u672a\u547d\u540d').trim();
            const unitLabel = formatUserUnitSummary(entry);
            return '<option value="' + esc(username) + '" data-display-name="' + esc(displayName) + '" data-username="' + esc(username) + '" data-email="' + esc(entry.email || '') + '">' + esc(displayName) + '\uFF08' + esc(unitLabel) + '\uFF09</option>';
          }).join('');
        }
      }
      handlerName.innerHTML = optionsHtml;
      if (prevSelected && handlerName.querySelector('option[value="' + prevSelected + '"]')) handlerName.value = prevSelected;
      else handlerName.value = '';
      updateHandlerEmail();
    }

    renderHandlerOptionsByUnit(handlerUnit.value);
    bindCasePageEvent(handlerUnit, 'change', function () {
      renderHandlerOptionsByUnit(this.value);
      syncCreateSummary();
    });
    bindCasePageEvent(proposerUnit, 'change', syncCreateSummary);
    bindCasePageEvent(proposerDateInput, 'change', syncCreateSummary);
    bindCasePageEvent(handlerName, 'change', updateHandlerEmail);
    bindCasePageEvent(dueInput, 'change', syncCreateSummary);
    bindCasePageEvent(notifyInput, 'change', syncCreateSummary);
    bindCasePageEvent(idInput, 'input', syncCreateSummary);
    syncCreateSummary();

    const createForm = document.getElementById('create-form');
    const createFeedback = document.getElementById('create-feedback');
    clearUnsavedChangesGuard();

    function markCreateDirty() {
      setUnsavedChangesGuard(true, '開立矯正單內容尚未送出，確定要離開此頁嗎？');
    }
    function focusCreateField(el) {
      if (!el || typeof el.focus !== 'function') return;
      const group = el.closest('.form-group') || el;
      if (group && typeof group.scrollIntoView === 'function') group.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }

    function setCreateFeedback(state, title, details) {
      if (!createFeedback) return;
      const lines = Array.isArray(details) ? details.filter(Boolean) : [];
      createFeedback.dataset.state = state || 'info';
      createFeedback.hidden = false;
      createFeedback.innerHTML = `<div class="form-feedback-title">${esc(title || '')}</div>${lines.length ? `<div class="form-feedback-list">${lines.map((line) => `<span>${esc(line)}</span>`).join('')}</div>` : ''}`;
    }

    function clearCreateFeedback() {
      if (!createFeedback) return;
      createFeedback.hidden = true;
      createFeedback.dataset.state = 'idle';
      createFeedback.innerHTML = '';
    }

    function validateCreateForm() {
      if (!createForm.reportValidity()) {
        const invalid = createForm.querySelector(':invalid');
        const label = invalid?.closest('.form-group')?.querySelector('.form-label')?.textContent?.trim() || '\u5fc5\u586b\u6b04\u4f4d';
        debugFlow('create', 'native validation failed', { field: invalid?.id || invalid?.name || label });
        setCreateFeedback('error', `\u8acb\u5b8c\u6574\u586b\u5beb${label}`, ['\u8acb\u6aa2\u67e5\u5fc5\u586b\u6b04\u4f4d\u662f\u5426\u5df2\u8f38\u5165\u5b8c\u6574\u8cc7\u6599\u3002']);
        toast(`\u8acb\u5b8c\u6574\u586b\u5beb${label}`, 'error');
        focusCreateField(invalid);
        return false;
      }
      const missing = [];
      if (!document.querySelector('input[name="defType"]:checked')) missing.push({ label: '缺失類型', el: document.querySelector('input[name="defType"]') });
      if (!document.querySelector('input[name="source"]:checked')) missing.push({ label: '來源', el: document.querySelector('input[name="source"]') });
      if (![...document.querySelectorAll('input[name="category"]:checked')].length) missing.push({ label: '缺失分類', el: document.querySelector('input[name="category"]') });
      if (missing.length > 0) {
        debugFlow('create', 'business validation failed', { missing: missing.map((entry) => entry.label) });
        setCreateFeedback('error', '\u9001\u51fa\u524d\u4ecd\u6709\u5fc5\u586b\u9078\u9805\u672a\u5b8c\u6210', missing.map((entry) => `\u5c1a\u672a\u5b8c\u6210\uff1a${entry.label}`));
        toast(`\u8acb\u5b8c\u6574\u586b\u5beb${missing.map((entry) => entry.label).join('\u3001')}`, 'error');
        focusCreateField(missing[0].el);
        return false;
      }
      clearCreateFeedback();
      return true;
    }

    bindCasePageEvent(document.getElementById('create-form'), 'submit', async e => {
      e.preventDefault();
      debugFlow('create', 'submit start', { handlerUnit: document.getElementById('f-hunit').value, handlerName: document.getElementById('f-hname').value });
      setCreateFeedback('info', '\u6b63\u5728\u6aa2\u67e5\u958b\u55ae\u8cc7\u6599', ['\u6aa2\u6838\u5fc5\u586b\u6b04\u4f4d\u3001\u8655\u7406\u55ae\u4f4d\u8207\u8655\u7406\u4eba\u8cc7\u8a0a\u3002']);
      if (!validateCreateForm()) return;
      const defType = document.querySelector('input[name="defType"]:checked');
      const source = document.querySelector('input[name="source"]:checked');
      const cats = [...document.querySelectorAll('input[name="category"]:checked')].map(c => c.value);
      if (!defType) { toast('請選擇缺失種類', 'error'); return; }
      if (!source) { toast('請選擇來源', 'error'); return; }
      if (cats.length === 0) { toast('請至少選擇一項分類', 'error'); return; }
      const proposerUnitValue = u.activeUnit || u.primaryUnit || u.unit || document.getElementById('f-punit').value;
      const handlerUnitValue = document.getElementById('f-hunit').value;
      let itemId = '';
      debugFlow('create', 'validation passed');
      setCreateFeedback('success', '\u6b04\u4f4d\u6aa2\u67e5\u5b8c\u6210\uff0c\u6b63\u5728\u5efa\u7acb\u77ef\u6b63\u55ae', ['\u7cfb\u7d71\u5df2\u4fdd\u7559\u55ae\u865f\uff0c\u5373\u5c07\u5beb\u5165\u55ae\u64da\u8207\u901a\u77e5\u8cc7\u8a0a\u3002']);
      try {
        itemId = reserveCarId(idInput.value, handlerUnitValue, proposerDateInput.value);
      } catch (error) {
        debugFlow('create', 'reserve id failed', { message: error.message || '' });
        setCreateFeedback('error', error.message || '\u55ae\u865f\u7121\u6cd5\u4f7f\u7528', ['\u8acb\u8abf\u6574\u55ae\u865f\u5f8c\u91cd\u65b0\u9001\u51fa\u3002']);
        toast(error.message || '矯正單號格式不正確', 'error');
        idInput.focus();
        return;
      }
      const selectedHandler = getSelectedHandlerOption();
      const handlerUsername = selectedHandler && selectedHandler.dataset ? (selectedHandler.dataset.username || '') : (handlerName.value || '');
      const handlerDisplayName = getSelectedHandlerDisplayName() || handlerUsername;
      const now = new Date().toISOString();
      const parsedAutoId = parseCorrectionAutoId(itemId);
      const item = {
        id: itemId,
        documentNo: buildCorrectionDocumentNo(handlerUnitValue, proposerDateInput.value) || '',
        caseSeq: parsedAutoId ? parsedAutoId.sequence : null,
        proposerUnit: proposerUnitValue,
        proposerUnitCode: getUnitCode(proposerUnitValue) || '',
        proposerName: document.getElementById('f-pname').value.trim(),
        proposerUsername: u.username,
        proposerDate: proposerDateInput.value,
        handlerUnit: handlerUnitValue,
        handlerUnitCode: getUnitCode(handlerUnitValue) || '',
        handlerName: handlerDisplayName,
        handlerUsername,
        handlerEmail: document.getElementById('f-hemail').value || '',
        handlerDate: document.getElementById('f-hdate').value || null,
        deficiencyType: defType.value,
        source: source.value,
        category: cats,
        clause: document.getElementById('f-clause').value.trim(),
        problemDesc: document.getElementById('f-problem').value.trim(),
        occurrence: document.getElementById('f-occurrence').value.trim(),
        correctiveAction: '', correctiveDueDate: document.getElementById('f-due').value,
        rootCause: '', riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null,
        rootElimination: '', rootElimDueDate: null,
        reviewResult: '', reviewNextDate: null, reviewer: '', reviewDate: null,
        trackings: [],
        status: STATUSES.PENDING, createdAt: now, updatedAt: now, closedDate: null, evidence: [],
        notifyHandler: document.getElementById('f-notify').checked,
        history: [{ time: now, action: '開立矯正單', user: u.name }, { time: now, action: `狀態變更為「${STATUSES.PENDING}」`, user: u.name }]
      };
      const shouldNotify = document.getElementById('f-notify').checked;
      const hEmail = document.getElementById('f-hemail').value;
      try {
        const createResult = await submitCreateCase(item);
        const storedItem = createResult && createResult.item ? createResult.item : item;
        debugFlow('create', 'submit success', { id: item.id, notify: shouldNotify, handlerEmail: hEmail || '' });
        if (createResult && createResult.notification && createResult.notification.sent) {
          item.history.push({ time: now, action: `系統寄送指派通知至 ${hEmail}`, user: '系統' });
          updateItem(item.id, { history: item.history });
          toast(`矯正單 ${item.id} 已建立，並已寄送通知至 ${hEmail}`);
        } else if (shouldNotify && hEmail) {
          const notifyError = createResult && createResult.notification && createResult.notification.error
            ? `，但通知寄送失敗：${createResult.notification.error}`
            : '，但通知尚未成功寄出';
          toast(`矯正單 ${item.id} 已建立${notifyError}`, 'warning');
        } else {
          toast(`矯正單 ${item.id} 已建立完成`);
        }
        if (createResult && createResult.warning) toast(createResult.warning, 'info');
        clearUnsavedChangesGuard();
        navigate('detail/' + storedItem.id);
      } catch (submitError) {
        debugFlow('create', 'submit failed', { message: submitError.message || '' });
        setCreateFeedback('error', '矯正單建立失敗', [String(submitError && submitError.message || submitError || '請稍後再試')]);
        toast('矯正單建立失敗：' + String(submitError && submitError.message || '請稍後再試'), 'error');
      }
    });
    bindCasePageEvent(createForm, 'input', function () {
      clearCreateFeedback();
      markCreateDirty();
    });
    bindCasePageEvent(createForm, 'change', function () {
      clearCreateFeedback();
      markCreateDirty();
    });
  }

  function renderDetail(id) {
    const item = getItem(id);
    if (!item) { navigate('list'); toast('找不到矯正單', 'error'); return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限檢視此矯正單', 'error'); return; }
    cleanupRenderedAttachmentUrls();
    const u = currentUser();
    const ci = STATUS_FLOW.indexOf(item.status);
    const isHandler = isItemHandler(item, u);
    const canRespond = canRespondItem(item, u);
    const canFillTracking = canSubmitTracking(item, u);
    const canReviewTracking = item.status === STATUSES.TRACKING && !!item.pendingTracking && canReviewItem(item);
    const pending = item.pendingTracking || null;
    const stepper = STATUS_FLOW.map((s, i) => { let c = ''; if (i < ci) c = 'completed'; else if (i === ci) c = 'active'; return `<div class="stepper-step ${c}"><div class="stepper-circle">${i < ci ? '✓' : i + 1}</div><div class="stepper-label">${s}</div></div>`; }).join('');
    const otag = isOverdue(item) ? ` <span class="badge badge-overdue"><span class="badge-dot"></span>已逾期</span>` : '';
    const cats = (item.category || []).map(c => `<span class="badge badge-category">${esc(c)}</span>`).join(' ');
    let btns = '';
    if (canRespond) btns += `<a href="#respond/${item.id}" class="btn btn-primary" data-testid="case-respond">${ic('edit-3', 'icon-sm')} 回填矯正措施</a>`;
    if (item.status === STATUSES.PROPOSED && canReviewItem(item)) btns += `<button class="btn btn-primary" data-testid="case-transition-review" data-action="case.statusTransition" data-id="${item.id}" data-status="${STATUSES.REVIEWING}">${ic('eye', 'icon-sm')} 進入審核</button>`;
    if (item.status === STATUSES.REVIEWING && canReviewItem(item)) {
      btns += `<button class="btn btn-success" data-testid="case-transition-close" data-action="case.statusTransition" data-id="${item.id}" data-status="${STATUSES.CLOSED}">${ic('check', 'icon-sm')} 審核通過結案</button>`;
      btns += `<button class="btn btn-warning" data-testid="case-transition-tracking" data-action="case.statusTransition" data-id="${item.id}" data-status="${STATUSES.TRACKING}">${ic('eye', 'icon-sm')} 轉為追蹤</button>`;
      btns += `<button class="btn btn-danger" data-testid="case-transition-return" data-action="case.statusTransition" data-id="${item.id}" data-status="${STATUSES.PENDING}">${ic('corner-up-left', 'icon-sm')} 退回重填</button>`;
    }
    if (canFillTracking) btns += `<a href="#tracking/${item.id}" class="btn btn-primary" data-testid="case-fill-tracking">${ic('clipboard-check', 'icon-sm')} 填報追蹤結果</a>`;
    if (canReviewTracking) {
      btns += `<button class="btn btn-success" data-testid="case-tracking-approve-close" data-action="case.reviewTracking" data-id="${item.id}" data-decision="close">${ic('check', 'icon-sm')} 同意結案</button>`;
      btns += `<button class="btn btn-warning" data-testid="case-tracking-approve-continue" data-action="case.reviewTracking" data-id="${item.id}" data-decision="continue">${ic('refresh-cw', 'icon-sm')} 同意繼續追蹤</button>`;
    }
    if (canManageUsers()) {
      btns += `<button class="btn btn-danger" data-testid="case-delete" data-action="case.deleteCase" data-id="${item.id}">${ic('trash-2', 'icon-sm')} 刪除矯正單</button>`;
    }

    const evidenceMounts = [];
    const mainEvidenceSlotId = 'case-evidence-main';
    evidenceMounts.push({ id: mainEvidenceSlotId, files: item.evidence || [], emptyText: '尚無佐證' });
    const tl = buildCaseTimeline(item.history || []);
    const pendingTrackingHtml = pending ? `<div class="card card--top-20 card--accent-teal"><div class="card-header"><span class="card-title">${ic('hourglass', 'icon-sm')} 待管理者審核的追蹤提報</span></div>
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-field-label">追蹤輪次</div><div class="detail-field-value">第 ${pending.round || ((item.trackings || []).length + 1)} 次</div></div>
        <div class="detail-field"><div class="detail-field-label">提報人員</div><div class="detail-field-value">${esc(pending.tracker || '—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">提報日期</div><div class="detail-field-value">${fmt(pending.trackDate)}</div></div>
        <div class="detail-field"><div class="detail-field-label">填報建議</div><div class="detail-field-value">${esc(pending.result || '—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">下一次追蹤日期</div><div class="detail-field-value">${pending.nextTrackDate ? fmt(pending.nextTrackDate) : '—'}</div></div>
      </div>
      <div class="detail-section"><div class="detail-section-title">${ic('clipboard-list', 'icon-sm')} 執行情形</div><div class="detail-content">${esc(pending.execution || '')}</div></div>
      <div class="detail-section"><div class="detail-section-title">${ic('message-circle', 'icon-sm')} 追蹤說明</div><div class="detail-content">${esc(pending.trackNote || '')}</div></div>
      <div class="detail-section"><div class="detail-section-title">${ic('paperclip', 'icon-sm')} 本次提報佐證</div>${buildCaseEvidenceSlot('case-pending-evidence')}</div>
      ${canReviewTracking ? `<div class="form-actions"><button type="button" class="btn btn-success" data-testid="pending-tracking-approve-close" data-action="case.reviewTracking" data-id="${item.id}" data-decision="close">${ic('check', 'icon-sm')} 同意結案</button><button type="button" class="btn btn-warning" data-testid="pending-tracking-approve-continue" data-action="case.reviewTracking" data-id="${item.id}" data-decision="continue">${ic('refresh-cw', 'icon-sm')} 同意繼續追蹤</button></div>` : `<div class="detail-section"><div class="detail-content detail-content--muted">${isHandler ? '已送出追蹤提報，待管理者審核。' : '目前已有追蹤提報待管理者審核。'}</div></div>`}
    </div>` : '';
    if (pending) evidenceMounts.push({ id: 'case-pending-evidence', files: pending.evidence || [], emptyText: '本次追蹤未附佐證' });

    const tkHtml = (item.trackings || []).map((tk, i) => {
      const requestedHtml = tk.requestedResult ? `<div class="detail-section"><div class="detail-section-title">${ic('message-square', 'icon-sm')} 填報建議</div><div class="detail-content">${esc(tk.requestedResult)}</div></div>` : '';
      const nextHtml = tk.nextTrackDate ? `<div class="detail-field"><div class="detail-field-label">下一次追蹤日期</div><div class="detail-field-value">${fmt(tk.nextTrackDate)}</div></div>` : '';
      const evidenceSlotId = 'case-tracking-evidence-' + i;
      const evidenceHtml = tk.evidence && tk.evidence.length ? `<div class="detail-section"><div class="detail-section-title">${ic('paperclip', 'icon-sm')} 本次佐證</div>${buildCaseEvidenceSlot(evidenceSlotId)}</div>` : '';
      if (tk.evidence && tk.evidence.length) evidenceMounts.push({ id: evidenceSlotId, files: tk.evidence || [], emptyText: '' });
      return `<div class="card card--bottom-16 card--accent-orange"><div class="section-header">第 ${i + 1} 次追蹤 — ${fmt(tk.trackDate)}</div>
        <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">追蹤人</div><div class="detail-field-value">${esc(tk.tracker)}</div></div><div class="detail-field"><div class="detail-field-label">審核人</div><div class="detail-field-value">${esc(tk.reviewer || '—')}</div></div><div class="detail-field"><div class="detail-field-label">審核日期</div><div class="detail-field-value">${tk.reviewDate ? fmt(tk.reviewDate) : '—'}</div></div>${nextHtml}</div>
        <div class="detail-section"><div class="detail-section-title">${ic('clipboard-list', 'icon-sm')} 執行情形</div><div class="detail-content">${esc(tk.execution)}</div></div>
        <div class="detail-section"><div class="detail-section-title">${ic('message-circle', 'icon-sm')} 追蹤說明</div><div class="detail-content">${esc(tk.trackNote)}</div></div>
        ${requestedHtml}
        <div class="detail-section"><div class="detail-section-title">${ic('check-circle', 'icon-sm')} 管理者決議</div><div class="detail-content">${esc(tk.result || '—')}</div></div>
        ${evidenceHtml}</div>`;
    }).join('') || '<p class="detail-empty-note">尚無追蹤紀錄</p>';

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="detail-header"><div><div class="detail-id detail-id-with-copy"><span>${esc(item.id)} · ${esc(item.deficiencyType)}</span>${renderCopyIdButton(item.id, '矯正單號')}</div><h1 class="detail-title">${esc(item.problemDesc || '').substring(0, 50)}</h1>
        <div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">${ic('user', 'icon-xs')}</span>${esc(item.proposerName)}</span><span class="detail-meta-item"><span class="detail-meta-icon">${ic('calendar', 'icon-xs')}</span>${fmt(item.proposerDate)}</span><span class="badge badge-${STATUS_CLASSES[item.status]}"><span class="badge-dot"></span>${item.status}</span>${otag}</div>
      </div><div class="detail-actions-row">${btns}<a href="#list" class="btn btn-secondary">← 返回</a></div></div>
      <div class="stepper">${stepper}</div>
      <div class="card card--top-20"><div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div>
        <div class="detail-grid">
          <div class="detail-field"><div class="detail-field-label">案件編號</div><div class="detail-field-value">${esc(item.id)}</div></div>
          <div class="detail-field"><div class="detail-field-label">編號前綴</div><div class="detail-field-value">${esc(item.documentNo || '—')}</div></div>
          <div class="detail-field"><div class="detail-field-label">提出單位代碼</div><div class="detail-field-value">${esc(item.proposerUnitCode || getUnitCode(item.proposerUnit) || '—')}</div></div>
          <div class="detail-field"><div class="detail-field-label">提出單位</div><div class="detail-field-value">${esc(item.proposerUnit)}</div></div>
          <div class="detail-field"><div class="detail-field-label">提出人員</div><div class="detail-field-value">${esc(item.proposerName)}</div></div>
          <div class="detail-field"><div class="detail-field-label">提出日期</div><div class="detail-field-value">${fmt(item.proposerDate)}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理單位代碼</div><div class="detail-field-value">${esc(item.handlerUnitCode || getUnitCode(item.handlerUnit) || '—')}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理單位</div><div class="detail-field-value">${esc(item.handlerUnit)}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理人員</div><div class="detail-field-value">${esc(item.handlerName)}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理人員電子郵件</div><div class="detail-field-value">${item.handlerEmail ? '<a href="mailto:' + esc(item.handlerEmail) + '" class="link-accent">' + ic('mail', 'icon-xs') + ' ' + esc(item.handlerEmail) + '</a>' : '—'}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理日期</div><div class="detail-field-value">${fmt(item.handlerDate)}</div></div>
          <div class="detail-field"><div class="detail-field-label">下一次追蹤日期</div><div class="detail-field-value">${fmt(getCurrentNextTrackingDate(item))}</div></div>
        </div></div>
      <div class="card card--top-20"><div class="section-header">${ic('tag', 'icon-sm')} 缺失分類</div>
        <div class="detail-grid">
          <div class="detail-field"><div class="detail-field-label">缺失種類</div><div class="detail-field-value">${esc(item.deficiencyType)}</div></div>
          <div class="detail-field"><div class="detail-field-label">來源</div><div class="detail-field-value">${esc(item.source)}</div></div>
          <div class="detail-field"><div class="detail-field-label">條文</div><div class="detail-field-value">${esc(item.clause || '—')}</div></div>
        </div>
        <div class="detail-section detail-section--top-12"><div class="detail-section-title">分類</div><div class="detail-content">${cats || '—'}</div></div></div>
      <div class="card card--top-20"><div class="section-header">${ic('message-square-warning', 'icon-sm')} 問題描述</div>
        <div class="detail-section"><div class="detail-section-title">問題或缺失說明</div><div class="detail-content">${esc(item.problemDesc)}</div></div>
        <div class="detail-section"><div class="detail-section-title">缺失發生過程</div><div class="detail-content">${esc(item.occurrence)}</div></div></div>
      ${item.correctiveAction ? `<div class="card card--top-20"><div class="section-header">${ic('wrench', 'icon-sm')} 矯正措施提案</div>
        <div class="detail-section"><div class="detail-content">${esc(item.correctiveAction)}</div></div>
        <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">預定完成日期</div><div class="detail-field-value">${fmt(item.correctiveDueDate)}</div></div></div></div>` : ''}
      ${item.rootCause ? `<div class="card card--top-20"><div class="section-header">${ic('microscope', 'icon-sm')} 根因分析</div>
        <div class="detail-section"><div class="detail-content">${esc(item.rootCause)}</div></div></div>` : ''}
      ${item.riskDesc ? `<div class="card card--top-20"><div class="section-header">${ic('shield-alert', 'icon-sm')} 風險管理</div>
        <div class="detail-section"><div class="detail-content">${esc(item.riskDesc)}</div></div>
        <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">受理人員</div><div class="detail-field-value">${esc(item.riskAcceptor || '—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">受理日期</div><div class="detail-field-value">${fmt(item.riskAcceptDate)}</div></div>
        <div class="detail-field"><div class="detail-field-label">風險評鑑日期</div><div class="detail-field-value">${fmt(item.riskAssessDate)}</div></div></div></div>` : ''}
      ${item.rootElimination ? `<div class="card card--top-20"><div class="section-header">${ic('shield-check', 'icon-sm')} 根因消除措施</div>
        <div class="detail-section"><div class="detail-content">${esc(item.rootElimination)}</div></div>
        <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">預定完成日期</div><div class="detail-field-value">${fmt(item.rootElimDueDate)}</div></div></div></div>` : ''}
      ${buildCaseCard('<span class="card-title">' + ic('paperclip', 'icon-sm') + ' 佐證文件</span>', buildCaseEvidenceSlot(mainEvidenceSlotId), { cardClass: 'card--top-20' })}
      ${pendingTrackingHtml}
      ${buildCaseCard('<span class="card-title">' + ic('git-branch', 'icon-sm') + ' 追蹤監控</span>', tkHtml, { cardClass: 'card--top-20' })}
      ${buildCaseCard('<span class="card-title">' + ic('history', 'icon-sm') + ' 歷程紀錄</span>', '<div class="timeline">' + tl + '</div>', { cardClass: 'card--top-20' })}
    </div>`;
    scheduleRefreshIcons();
    bindCopyButtons();
    Promise.allSettled(evidenceMounts.map((entry) => mountCaseEvidenceList(entry.id, entry.files, entry.emptyText))).then(() => {
      scheduleRefreshIcons();
    });
  }

  
function getReviewDecisionByNextStatus(item, nextStatus) {
    if (!item) return '';
    if (item.status === STATUSES.PROPOSED && nextStatus === STATUSES.REVIEWING) return 'start_review';
    if (item.status === STATUSES.REVIEWING && nextStatus === STATUSES.CLOSED) return 'close';
    if (item.status === STATUSES.REVIEWING && nextStatus === STATUSES.TRACKING) return 'tracking';
    if (item.status === STATUSES.REVIEWING && nextStatus === STATUSES.PENDING) return 'return';
    return '';
  }

async function handleStatusTransition(id, ns) {
    const item = getItem(id);
    const u = currentUser();
    if (!item || !u) return;
    if (!canAccessItem(item) || !canReviewItem(item)) { toast('您沒有權限審核此案件', 'error'); return; }
    const allowedTransitions = {
      [STATUSES.PROPOSED]: [STATUSES.REVIEWING],
      [STATUSES.REVIEWING]: [STATUSES.CLOSED, STATUSES.TRACKING, STATUSES.PENDING]
    };
    const next = allowedTransitions[item.status] || [];
    if (!next.includes(ns)) { toast(`狀態 ${item.status} 無法轉換為 ${ns}`, 'error'); return; }
    const reviewDecision = getReviewDecisionByNextStatus(item, ns);
    if (!reviewDecision) { toast('找不到對應的審核動作', 'error'); return; }
    const confirmed = await openConfirmDialog(`確定要將案件 ${item.id} 更新為「${ns}」嗎？`, {
      title: '確認審核動作',
      confirmText: '確認送出',
      cancelText: '取消'
    });
    if (!confirmed) return;
    const now = new Date().toISOString();
    const updates = { status: ns, updatedAt: now, pendingTracking: null, history: [...item.history, { time: now, action: `審核狀態更新為${ns}`, user: u.name }] };
    updates.closedDate = ns === STATUSES.CLOSED ? now : null;
    const result = await submitReviewDecision(id, {
      decision: reviewDecision,
      actorName: u.name,
      actorUsername: u.username
    }, updates);
    if (result && result.warning) toast(result.warning, 'info');
    toast(`已更新為 ${ns}`);
    renderDetail(id);
    renderSidebar();
    scheduleRefreshIcons();
  };

  async function handleReviewTracking(id, decision) {
    const item = getItem(id);
    const u = currentUser();
    if (!item || !u) return;
    if (!(item.status === STATUSES.TRACKING && item.pendingTracking && canReviewItem(item))) { toast('目前沒有可審核的追蹤提報', 'error'); return; }
    const pending = item.pendingTracking;
    const round = pending.round || ((item.trackings || []).length + 1);
    const now = new Date().toISOString();
    const shouldClose = decision === 'close';
    const finalResult = shouldClose ? '同意結案' : '同意持續追蹤';
    const approvedTracking = {
      ...pending,
      requestedResult: pending.result,
      result: finalResult,
      decision: finalResult,
      reviewer: u.name,
      reviewDate: now.split('T')[0],
      reviewedAt: now
    };
    const history = [
      ...(item.history || []),
      { time: now, action: `審核第 ${round} 次追蹤`, user: u.name },
      { time: now, action: finalResult, user: u.name }
    ];
    if (!shouldClose && pending.nextTrackDate) {
      history.push({ time: now, action: `下一次追蹤日期：${pending.nextTrackDate}`, user: u.name });
    }
    if (pending.evidence && pending.evidence.length) {
      history.push({ time: now, action: `新增 ${pending.evidence.length} 份佐證`, user: u.name });
    }
    const result = await submitTrackingReviewDecision(id, {
      decision: shouldClose ? 'close' : 'continue',
      actorName: u.name,
      actorUsername: u.username
    }, {
      trackings: [...(item.trackings || []), approvedTracking],
      pendingTracking: null,
      status: shouldClose ? STATUSES.CLOSED : STATUSES.TRACKING,
      updatedAt: now,
      closedDate: shouldClose ? now : null,
      evidence: pending.evidence && pending.evidence.length ? [...(item.evidence || []), ...pending.evidence] : (item.evidence || []),
      history
    });
    if (result && result.warning) toast(result.warning, 'info');
    toast(shouldClose ? '已核定結案' : '已核定持續追蹤');
    renderDetail(id);
    renderSidebar();
    scheduleRefreshIcons();
  };

  // ─── Render: Respond ───────────────────────
  
  function buildRespondPage(item) {
    const respondAside = '<div class="editor-sticky">'
      + buildEditorSideCard({
        accent: true,
        kicker: '回覆摘要',
        title: '送審摘要',
        text: '送出前先檢查期限、根因與附件是否完整，避免被退回補件。',
        bodyHtml: buildEditorSummaryItems([
          { label: '案件編號', value: esc(item.id) },
          { label: '處理人員', value: esc(item.handlerName || currentUser().name) },
          { label: '改善期限', value: item.correctiveDueDate ? fmt(item.correctiveDueDate) : '未指定', id: 'respond-summary-due' },
          { label: '根因消除完成', value: item.rootElimDueDate ? fmt(item.rootElimDueDate) : '未指定', id: 'respond-summary-elimdue' },
          { label: '附件數量', value: '0 份', id: 'respond-summary-files' }
        ])
      })
      + buildEditorSideCard({
        title: '送審前檢查',
        bodyHtml: buildEditorStepItems([
          { title: '措施要可驗證', text: '不要只寫「加強管理」，請明確寫出會執行的制度、流程或技術措施。' },
          { title: '根因與改善要對應', text: '根因分析和消除措施必須互相對應，管理者才能快速判斷是否足以結案。' },
          { title: '附件補足證據', text: '若有截圖、文件或簽核資料，這一階段就先補上，後續追蹤會更順。' }
        ])
      })
      + buildEditorSideCard({
        title: '風險接受說明',
        bodyHtml: buildEditorNoteItems([
          '只有在短期內無法完全消除根因時，才建議補充風險接受資訊。',
          '若填寫風險接受人，建議同步補上接受日期與評估日期，資料會比較完整。'
        ])
      })
      + '</div>';

    return `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">回覆矯正單</h1><p class="page-subtitle">${esc(item.id)} · ${esc((item.problemDesc || '').substring(0, 48))}</p></div><a href="#detail/${item.id}" class="btn btn-secondary">返回單據</a></div>
      <div class="editor-shell editor-shell--respond">
        <section class="editor-main">
          <div class="card editor-card"><form id="respond-form">
            <div class="section-header">${ic('wrench', 'icon-sm')} 矯正措施與期限</div>
            <div class="form-group"><label class="form-label form-required">矯正措施說明</label><textarea class="form-textarea form-textarea--min-126" id="r-action" placeholder="請說明預計採取的改善措施、執行方式與完成標準" required>${esc(item.correctiveAction || '')}</textarea></div>
            <div class="form-group"><label class="form-label form-required">預定完成日期</label><input type="date" class="form-input" id="r-due" value="${toDateInputValue(item.correctiveDueDate)}" required></div>
            <div class="section-header">${ic('microscope', 'icon-sm')} 根因分析</div>
            <div class="form-group"><label class="form-label form-required">根因說明</label><textarea class="form-textarea form-textarea--min-108" id="r-root" placeholder="請說明缺失發生的根本原因，而不是只描述表面現象" required>${esc(item.rootCause || '')}</textarea></div>
            <div class="section-header">${ic('shield-check', 'icon-sm')} 根因消除措施</div>
            <div class="form-group"><label class="form-label form-required">消除措施</label><textarea class="form-textarea form-textarea--min-108" id="r-elim" placeholder="請說明如何從制度、流程或系統面消除此根因" required>${esc(item.rootElimination || '')}</textarea></div>
            <div class="form-group"><label class="form-label">消除措施完成日期</label><input type="date" class="form-input" id="r-elimdue" value="${toDateInputValue(item.rootElimDueDate)}"></div>
            <div class="section-header">${ic('shield-alert', 'icon-sm')} 風險接受資訊</div>
            <p class="detail-note-muted">若評估暫時無法完全消除根因，可補充風險接受說明與責任歸屬。</p>
            <div class="form-group"><label class="form-label">風險說明</label><textarea class="form-textarea form-textarea--min-78" id="r-risk" placeholder="請說明暫時保留的風險內容與影響">${esc(item.riskDesc || '')}</textarea></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">風險接受人</label><input type="text" class="form-input" id="r-riskwho" value="${esc(item.riskAcceptor || '')}"></div>
              <div class="form-group"><label class="form-label">接受日期</label><input type="date" class="form-input" id="r-riskdate" value="${toDateInputValue(item.riskAcceptDate)}"></div>
              <div class="form-group"><label class="form-label">風險評估日期</label><input type="date" class="form-input" id="r-riskassess" value="${toDateInputValue(item.riskAssessDate)}"></div>
            </div>
            <div class="section-header">${ic('paperclip', 'icon-sm')} 佐證附件</div>
            <div class="upload-zone" id="upload-zone"><input type="file" id="file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">${ic('folder-open')}</div><div class="upload-zone-text">可拖曳檔案，或 <strong>點擊選擇</strong></div><div class="upload-zone-hint">支援 JPG、PNG、PDF，單檔 2MB 內</div></div>
            <div class="file-preview-list" id="file-previews"></div>
            <div class="form-actions"><button type="submit" class="btn btn-success">${ic('check-circle', 'icon-sm')} 送出回覆</button><a href="#detail/${item.id}" class="btn btn-secondary">取消返回</a></div>
          </form></div>
        </section>
        <aside class="editor-aside">${respondAside}</aside>
      </div></div>`;
  }

function renderRespond(id) {
    const item = getItem(id); if (!item) { navigate('list'); return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限存取此矯正單', 'error'); return; }
    const canRespond = canRespondItem(item);
    if (!canRespond) { navigate('detail/' + id); toast('目前無法回覆這筆待矯正案件', 'error'); return; }
    cleanupRenderedAttachmentUrls();
    let tempEv = [];
    document.getElementById('app').innerHTML = buildRespondPage(item);
    scheduleRefreshIcons();
    applyTestIds({
      'respond-form': 'respond-form',
      'r-action': 'respond-action',
      'r-due': 'respond-due',
      'r-root': 'respond-root-cause',
      'r-elim': 'respond-root-elimination',
      'r-elimdue': 'respond-root-elimination-due',
      'r-risk': 'respond-risk',
      'r-riskwho': 'respond-risk-owner',
      'r-riskdate': 'respond-risk-date',
      'r-riskassess': 'respond-risk-assess-date',
      'upload-zone': 'respond-upload-zone',
      'file-input': 'respond-file-input'
    });
    applySelectorTestIds([
      { selector: '#respond-form button[type="submit"]', testId: 'respond-submit' }
    ]);
    const fi = document.getElementById('file-input');
    const uz = document.getElementById('upload-zone');
    const fp = document.getElementById('file-previews');
    const dueInput = document.getElementById('r-due');
    const elimDueInput = document.getElementById('r-elimdue');
    const summaryDue = document.getElementById('respond-summary-due');
    const summaryElimDue = document.getElementById('respond-summary-elimdue');
    const summaryFiles = document.getElementById('respond-summary-files');
    const respondForm = document.getElementById('respond-form');
    clearUnsavedChangesGuard();

    function markRespondDirty() {
      setUnsavedChangesGuard(true, '回填矯正措施尚未送出，確定要離開此頁嗎？');
    }

    function syncRespondSummary() {
      summaryDue.textContent = dueInput.value ? fmt(dueInput.value) : '未指定';
      summaryElimDue.textContent = elimDueInput.value ? fmt(elimDueInput.value) : '未指定';
      summaryFiles.textContent = tempEv.length + ' 份';
    }

    function handleF(files) {
      const batch = prepareUploadBatch(tempEv, files, {
        fileLabel: '佐證檔案',
        maxSize: 2 * 1024 * 1024,
        maxSizeLabel: '2MB',
        allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
        allowedMimeTypes: ['image/*', 'application/pdf']
      });
      batch.errors.forEach((message) => toast(message, 'error'));
      batch.accepted.forEach(({ file, meta }) => {
        tempEv.push(createTransientUploadEntry(file, meta, {
          prefix: 'car',
          scope: 'case-evidence',
          ownerId: item.id
        }));
      });
      if (batch.accepted.length) markRespondDirty();
      updP();
      if (fi) fi.value = '';
    }

    function updP() {
      renderAttachmentList(fp, tempEv, {
        editable: true,
        emptyText: '尚未上傳文件',
        fileIconHtml: '<div class="file-pdf-icon">' + ic('file-box') + '</div>',
        itemClass: 'file-preview-item',
        actionsClass: 'file-preview-actions',
        onRemove: function (index) {
          const removed = tempEv.splice(index, 1)[0];
          revokeTransientUploadEntry(removed);
          if (fi) fi.value = '';
          markRespondDirty();
          updP();
        }
      });
      syncRespondSummary();
    }

    bindCasePageEvent(fi, 'change', e => handleF(e.target.files));
    bindCasePageEvent(uz, 'dragover', e => { e.preventDefault(); uz.classList.add('dragover'); });
    bindCasePageEvent(uz, 'dragleave', () => uz.classList.remove('dragover'));
    bindCasePageEvent(uz, 'drop', e => { e.preventDefault(); uz.classList.remove('dragover'); handleF(e.dataTransfer.files); });
    bindCasePageEvent(dueInput, 'change', syncRespondSummary);
    bindCasePageEvent(elimDueInput, 'change', syncRespondSummary);
    syncRespondSummary();

    bindCasePageEvent(respondForm, 'input', markRespondDirty);
    bindCasePageEvent(respondForm, 'change', markRespondDirty);

    bindCasePageEvent(respondForm, 'submit', async e => {
      e.preventDefault();
      const ca = document.getElementById('r-action').value.trim();
      const rc = document.getElementById('r-root').value.trim();
      const el = document.getElementById('r-elim').value.trim();
      if (!ca || !rc || !el) { toast('請完整填寫矯正措施、根因分析與根因消除措施', 'error'); return; }
      const now = new Date().toISOString(), li = getItem(id), u = currentUser();
      if (!li || !canAccessItem(li)) { toast('找不到可操作的矯正單', 'error'); navigate('list'); return; }
      if (!canRespondItem(li, u)) { toast('您沒有權限填寫此矯正單', 'error'); navigate('detail/' + id); return; }
      const persistedEvidence = await persistUploadedEntries(tempEv, {
        prefix: 'car',
        scope: 'case-evidence',
        ownerId: id
      });
      clearUnsavedChangesGuard();
      const upd = {
        correctiveAction: ca, correctiveDueDate: document.getElementById('r-due').value,
        rootCause: rc,
        rootElimination: el, rootElimDueDate: document.getElementById('r-elimdue').value || null,
        riskDesc: document.getElementById('r-risk').value.trim(),
        riskAcceptor: document.getElementById('r-riskwho').value.trim(),
        riskAcceptDate: document.getElementById('r-riskdate').value || null,
        riskAssessDate: document.getElementById('r-riskassess').value || null,
        status: STATUSES.PROPOSED, updatedAt: now,
        evidence: [...(li.evidence || []), ...persistedEvidence],
        history: [...li.history, { time: now, action: `${u.name} 提交改善回覆`, user: u.name }, { time: now, action: `審核狀態更新為${STATUSES.PROPOSED}`, user: u.name }]
      };
      if (tempEv.length) upd.history.push({ time: now, action: `新增 ${tempEv.length} 份佐證`, user: u.name });
      const result = await submitRespondCase(id, {
        correctiveAction: ca,
        correctiveDueDate: document.getElementById('r-due').value,
        rootCause: rc,
        rootElimination: el,
        rootElimDueDate: document.getElementById('r-elimdue').value || null,
        riskDesc: document.getElementById('r-risk').value.trim(),
        riskAcceptor: document.getElementById('r-riskwho').value.trim(),
        riskAcceptDate: document.getElementById('r-riskdate').value || null,
        riskAssessDate: document.getElementById('r-riskassess').value || null,
        evidence: persistedEvidence,
        actorName: u.name,
        actorUsername: u.username
      }, upd);
      if (result && result.warning) toast(result.warning, 'info');
      toast('改善回覆已送出');
      navigate('detail/' + id);
    });
  }

  function buildTrackingPage(item, round) {
    const trackingAside = '<div class="editor-sticky">'
      + buildEditorSideCard({
        accent: true,
        kicker: '追蹤摘要',
        title: '追蹤提報摘要',
        text: '這一輪先由處理人員提出追蹤建議，再由管理者決定是否結案或繼續追蹤。',
        bodyHtml: buildEditorSummaryItems([
          { label: '案件編號', value: esc(item.id) },
          { label: '追蹤輪次', value: '第 ' + round + ' 次（' + round + '/3）' },
          { label: '填報日期', value: fmt(new Date().toISOString().split('T')[0]), id: 'track-summary-date' },
          { label: '提報建議', value: '待判定', id: 'track-summary-result' },
          { label: '下一次追蹤', value: '未指定', id: 'track-summary-next' }
        ])
      })
      + buildEditorSideCard({
        title: '提報規則',
        bodyHtml: buildEditorStepItems([
          { title: '擬請同意結案', text: '只有改善措施已完成，且可提供佐證資料時才使用。' },
          { title: '建議持續追蹤', text: '仍需補強或觀察時使用，必須填寫下一次追蹤日期。' },
          { title: '管理者核定', text: '送出後會回到案件明細，由管理者決定同意結案或同意繼續追蹤。' }
        ])
      })
      + buildEditorSideCard({
        title: '案件脈絡',
        bodyHtml: buildEditorNoteItems([
          '目前案件狀態：' + esc(item.status),
          '既有追蹤次數：' + esc(String((item.trackings || []).length)) + ' 次',
          '處理人員：' + esc(item.handlerName || '未指定')
        ])
      })
      + '</div>';

    return `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">第 ${round}/3 次追蹤提報</h1><p class="page-subtitle">${esc(item.id)} · ${esc(item.handlerName || '')}</p></div><a href="#detail/${item.id}" class="btn btn-secondary">返回單據</a></div>
      <div class="editor-shell editor-shell--tracking">
        <section class="editor-main">
          <div class="card editor-card"><form id="track-form">
            <div class="section-header">${ic('clipboard-check', 'icon-sm')} 追蹤提報</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">編修人員</label><input type="text" class="form-input" id="tk-tracker" value="${esc(currentUser().name)}" readonly></div>
              <div class="form-group"><label class="form-label form-required">填報日期</label><input type="date" class="form-input" id="tk-date" value="${new Date().toISOString().split('T')[0]}" required></div>
            </div>
            <div class="form-group"><label class="form-label form-required">改善措施執行情形</label><textarea class="form-textarea form-textarea--min-112" id="tk-exec" placeholder="請說明目前的改善進度、已完成內容與尚待處理事項" required></textarea></div>
            <div class="form-group"><label class="form-label form-required">追蹤觀察與說明</label><textarea class="form-textarea form-textarea--min-88" id="tk-note" placeholder="請記錄本次追蹤的判斷依據、重點發現或需補強事項" required></textarea></div>
            <div class="section-header">${ic('check-circle', 'icon-sm')} 提報建議</div>
            <div class="form-group"><label class="form-label form-required">本次建議</label>${mkRadio('tkResult', ['擬請同意結案', '建議持續追蹤'], '')}</div>
            <div class="form-group is-hidden" id="tk-next-wrap"><label class="form-label form-required">下一次追蹤日期</label><input type="date" class="form-input" id="tk-next"></div>
            <div class="form-group is-hidden" id="tk-evidence-wrap"><label class="form-label form-required">結案佐證資料</label><div class="upload-zone" id="tk-upload-zone"><input type="file" id="tk-file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">${ic('folder-open')}</div><div class="upload-zone-text">可拖曳檔案，或 <strong>點擊選擇</strong></div><div class="upload-zone-hint">只有選擇「擬請同意結案」時，才會強制要求上傳佐證</div></div><div class="file-preview-list" id="tk-file-previews"></div></div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 送出追蹤提報</button><a href="#detail/${item.id}" class="btn btn-secondary">取消返回</a></div>
          </form></div>
        </section>
        <aside class="editor-aside">${trackingAside}</aside>
      </div></div>`;
  }

function renderTracking(id) {
    const item = getItem(id); if (!item) { navigate('list'); return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限存取此矯正單', 'error'); return; }
    if (item.pendingTracking) { navigate('detail/' + id); toast('目前已有待管理者審核的追蹤提報', 'error'); return; }
    if (!canSubmitTracking(item)) { navigate('detail/' + id); toast('目前由處理人員填報追蹤結果，管理者負責審核', 'error'); return; }
    cleanupRenderedAttachmentUrls();
    const round = (item.trackings || []).length + 1;
    if (round > 3) { toast('系統目前最多支援 3 次追蹤', 'error'); navigate('detail/' + id); return; }
    document.getElementById('app').innerHTML = buildTrackingPage(item, round);
    scheduleRefreshIcons();
    applyTestIds({
      'track-form': 'tracking-form',
      'tk-tracker': 'tracking-tracker',
      'tk-date': 'tracking-date',
      'tk-exec': 'tracking-execution',
      'tk-note': 'tracking-note',
      'tk-next': 'tracking-next-date',
      'tk-upload-zone': 'tracking-upload-zone',
      'tk-file-input': 'tracking-file-input'
    });
    applySelectorTestIds([
      { selector: '#track-form button[type="submit"]', testId: 'tracking-submit' }
    ]);
    const dateInput = document.getElementById('tk-date');
    const nextInput = document.getElementById('tk-next');
    const nextWrap = document.getElementById('tk-next-wrap');
    const summaryDate = document.getElementById('track-summary-date');
    const summaryResult = document.getElementById('track-summary-result');
    const summaryNext = document.getElementById('track-summary-next');
    const evidenceWrap = document.getElementById('tk-evidence-wrap');
    const uploadZone = document.getElementById('tk-upload-zone');
    const fileInput = document.getElementById('tk-file-input');
    const filePreviews = document.getElementById('tk-file-previews');
    let tempEv = [];
    const trackForm = document.getElementById('track-form');
    clearUnsavedChangesGuard();

    function markTrackingDirty() {
      setUnsavedChangesGuard(true, '追蹤提報內容尚未送出，確定要離開此頁嗎？');
    }

    function syncTrackingSummary() {
      summaryDate.textContent = dateInput.value ? fmt(dateInput.value) : '未指定';
      const selected = document.querySelector('input[name="tkResult"]:checked');
      const selectedValue = selected ? String(selected.value || '') : '';
      const isContinue = selectedValue.includes('追蹤');
      const isClosable = selectedValue.includes('結案');
      summaryResult.textContent = selected ? selected.value : '待判定';
      summaryNext.textContent = nextInput.value ? fmt(nextInput.value) : '未指定';
      nextWrap.classList.toggle('is-hidden', !isContinue);
      nextInput.required = !!isContinue;
      if (fileInput) fileInput.required = false;
      if (evidenceWrap) evidenceWrap.classList.toggle('is-hidden', !isClosable);
    }

    function handleTrackingFiles(files) {
      const batch = prepareUploadBatch(tempEv, files, {
        fileLabel: '結案佐證',
        maxSize: 2 * 1024 * 1024,
        maxSizeLabel: '2MB',
        allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
        allowedMimeTypes: ['image/*', 'application/pdf']
      });
      batch.errors.forEach((message) => toast(message, 'error'));
      batch.accepted.forEach(({ file, meta }) => {
        tempEv.push(createTransientUploadEntry(file, meta, {
          prefix: 'trk',
          scope: 'tracking-evidence',
          ownerId: item.id
        }));
      });
      if (batch.accepted.length) markTrackingDirty();
      updateTrackingPreviews();
      if (fileInput) fileInput.value = '';
    }

    function updateTrackingPreviews() {
      if (!filePreviews) return;
      renderAttachmentList(filePreviews, tempEv, {
        editable: true,
        emptyText: '尚未上傳文件',
        fileIconHtml: '<div class="file-pdf-icon">' + ic('file-box') + '</div>',
        itemClass: 'file-preview-item',
        actionsClass: 'file-preview-actions',
        onRemove: function (index) {
          const removed = tempEv.splice(index, 1)[0];
          revokeTransientUploadEntry(removed);
          if (fileInput) fileInput.value = '';
          markTrackingDirty();
          updateTrackingPreviews();
        }
      });
    }

    document.querySelectorAll('input[name="tkResult"]').forEach(r => bindCasePageEvent(r, 'change', syncTrackingSummary));
    bindCasePageEvent(dateInput, 'change', syncTrackingSummary);
    bindCasePageEvent(nextInput, 'change', syncTrackingSummary);
    if (fileInput) bindCasePageEvent(fileInput, 'change', (event) => handleTrackingFiles(event.target.files));
    if (uploadZone) {
      bindCasePageEvent(uploadZone, 'dragover', (event) => { event.preventDefault(); uploadZone.classList.add('dragover'); });
      bindCasePageEvent(uploadZone, 'dragleave', () => uploadZone.classList.remove('dragover'));
      bindCasePageEvent(uploadZone, 'drop', (event) => { event.preventDefault(); uploadZone.classList.remove('dragover'); handleTrackingFiles(event.dataTransfer.files); });
    }
    syncTrackingSummary();

    bindCasePageEvent(trackForm, 'input', markTrackingDirty);
    bindCasePageEvent(trackForm, 'change', markTrackingDirty);

    bindCasePageEvent(trackForm, 'submit', async e => {
      e.preventDefault();
      const res = document.querySelector('input[name="tkResult"]:checked');
      if (!res) { toast('請選擇本次追蹤建議', 'error'); return; }
      const now = new Date().toISOString(), li = getItem(id), u = currentUser();
      if (!li || !canAccessItem(li)) { toast('找不到可操作的矯正單', 'error'); navigate('list'); return; }
      if (li.pendingTracking) { toast('目前已有待管理者審核的追蹤提報', 'error'); navigate('detail/' + id); return; }
      if (!canSubmitTracking(li, u)) { toast('您沒有權限送出追蹤提報', 'error'); navigate('detail/' + id); return; }
      const isClose = res.value === '擬請同意結案';
      const isContinue = res.value === '建議持續追蹤';
      if (isContinue && !document.getElementById('tk-next').value) { toast('若建議持續追蹤，請填寫下一次追蹤日期', 'error'); return; }
      if (isClose && tempEv.length === 0) { toast('若擬請同意結案，請至少上傳一份佐證', 'error'); return; }
      const persistedEvidence = await persistUploadedEntries(tempEv, {
        prefix: 'trk',
        scope: 'tracking-evidence',
        ownerId: id
      });
      clearUnsavedChangesGuard();
      const submission = {
        round,
        tracker: document.getElementById('tk-tracker').value,
        trackDate: document.getElementById('tk-date').value,
        execution: document.getElementById('tk-exec').value.trim(),
        trackNote: document.getElementById('tk-note').value.trim(),
        result: res.value,
        nextTrackDate: isContinue ? (document.getElementById('tk-next').value || null) : null,
        evidence: persistedEvidence,
        submittedAt: now
      };
      const history = [
        ...(li.history || []),
        { time: now, action: `提交第 ${round} 次追蹤`, user: u.name },
        { time: now, action: `提報建議：${res.value}`, user: u.name }
      ];
      if (submission.nextTrackDate) history.push({ time: now, action: `下一次追蹤日期：${submission.nextTrackDate}`, user: u.name });
      if (submission.evidence.length) history.push({ time: now, action: `新增 ${submission.evidence.length} 份佐證`, user: u.name });
      const result = await submitTrackingSubmission(id, {
        tracker: submission.tracker,
        trackDate: submission.trackDate,
        execution: submission.execution,
        trackNote: submission.trackNote,
        result: submission.result,
        nextTrackDate: submission.nextTrackDate,
        evidence: submission.evidence,
        actorName: u.name,
        actorUsername: u.username
      }, {
        pendingTracking: submission,
        updatedAt: now,
        history
      });
      if (result && result.warning) toast(result.warning, 'info');
      toast('追蹤提報已送出，等待管理者審核');
      navigate('detail/' + id);
    });
  }

  function formatUserUnitSummary(user) {
    const accessProfile = getCaseAccessProfile(user);
    const units = normalizeCaseUnitList((accessProfile && accessProfile.authorizedUnits) || []);
    if (!units.length) return '未指定';
    return units.join('、');
  }
  registerActionHandlers('case', {
    statusTransition: function ({ dataset }) {
      handleStatusTransition(dataset.id, dataset.status);
    },
    reviewTracking: function ({ dataset }) {
      handleReviewTracking(dataset.id, dataset.decision);
    },
    deleteCase: async function ({ dataset }) {
      const caseId = dataset.id;
      if (!caseId) return;
      const item = getItem(caseId);
      const label = item ? (item.id + '（' + (item.handlerUnit || '') + '）') : caseId;
      const confirmed = typeof openConfirmDialog === 'function'
        ? await openConfirmDialog('即將刪除「' + label + '」矯正單。\n\n刪除後相關操作紀錄仍會保留於操作軌跡。此操作無法復原。', { title: '刪除矯正單', confirmLabel: '確認刪除', confirmClass: 'btn-danger', kicker: '注意' })
        : window.confirm('確定要刪除矯正單 ' + label + ' 嗎？此操作無法復原。');
      if (!confirmed) return;
      try {
        await submitDeleteCase(caseId);
        toast('已成功刪除矯正單「' + caseId + '」');
        navigate('list');
      } catch (error) {
        toast('刪除失敗：' + String(error && error.message || error || ''), 'error');
      }
    },
    dashboardSettings: function () {
      const existing = document.querySelector('.dashboard-settings-backdrop');
      if (existing) { existing.remove(); return; }
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildDashboardSettingsModal();
      const modal = wrapper.firstChild;
      document.body.appendChild(modal);
      scheduleRefreshIcons();
      modal.addEventListener('change', function (e) {
        const cb = e.target;
        if (!cb.classList.contains('dashboard-pref-checkbox')) return;
        const key = cb.getAttribute('data-pref-key');
        if (!key) return;
        const prefs = getDashboardPrefs();
        prefs[key] = cb.checked;
        saveDashboardPrefs(prefs);
        applyDashboardVisibility();
      });
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          modal.remove();
        }
      });
    },
    closeDashboardSettings: function () {
      const backdrop = document.querySelector('.dashboard-settings-backdrop');
      if (backdrop) backdrop.remove();
    },
    resetDashboardPrefs: function () {
      saveDashboardPrefs({});
      applyDashboardVisibility();
      const checkboxes = document.querySelectorAll('.dashboard-pref-checkbox');
      for (let i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = true;
      }
      toast('已重設為預設值', 'info');
    }
  });

    return {
      renderDashboard,
      renderList,
      renderCreate,
      renderDetail,
      renderRespond,
      renderTracking
    };
  };
})();
