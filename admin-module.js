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
      findUser,
      submitUserUpsert,
      submitUserDelete,
      syncUsersFromM365,
      submitReviewScopeReplace,
      syncReviewScopesFromM365,
      getCustomUnitRegistry,
      loadUnitReviewStore,
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
      getUnitContactApplication
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
      loading: false
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

    function formatUserUnitSummary(user) {
      const units = getAuthorizedUnits(user);
      return units.length ? units.join('、') : '未指定';
    }

    function formatUserReviewUnitSummary(user) {
      const units = getReviewUnits(user);
      return units.length ? units.join('、') : '沿用既有審核邏輯';
    }

  function renderUsers() {
    if (!canManageUsers()) { navigate('dashboard'); return; }
    const users = getUsers();
    const rows = users.map(u => `<tr><td style="font-weight:500;color:var(--text-primary)">${esc(u.username)}</td><td>${esc(u.name)}</td><td><span class="badge-role ${ROLE_BADGE[u.role]}">${u.role}</span></td><td>${esc(u.unit || '未指定')}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(formatUserUnitSummary(u))}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(formatUserReviewUnitSummary(u))}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(u.email || '')}</td><td><div class="user-actions">${u.username !== 'admin' ? `<button class="btn btn-sm btn-secondary" data-action="admin.editUser" data-username="${esc(u.username)}">${ic('edit-2', 'btn-icon-svg')}</button><button class="btn btn-sm btn-danger" data-action="admin.deleteUser" data-username="${esc(u.username)}">${ic('trash-2', 'btn-icon-svg')}</button>` : ''}</div></td></tr>`).join('');
    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">帳號管理</h1><p class="page-subtitle">管理角色、主要單位與多單位授權範圍</p></div><button class="btn btn-primary" data-action="admin.addUser">${ic('user-plus', 'icon-sm')} 新增使用者</button></div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>帳號</th><th>姓名</th><th>角色</th><th>主要單位</th><th>授權單位</th><th>可審核單位</th><th>信箱</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
  }
  function showUserModal(eu) {
    const isE = !!eu; const title = isE ? '編輯使用者' : '新增使用者'; const mr = document.getElementById('modal-root'); const units = getAuthorizedUnits(eu); const reviewUnits = getReviewUnits(eu); const initUnit = units[0] || '';
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal"><div class="modal-header"><span class="modal-title">${title}</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><form id="user-form">
      <div class="form-group"><label class="form-label form-required">帳號</label><input type="text" class="form-input" id="u-username" value="${isE ? esc(eu.username) : ''}" ${isE ? 'readonly' : ''} required></div>
      <div class="form-group"><label class="form-label form-required">姓名</label><input type="text" class="form-input" id="u-name" value="${isE ? esc(eu.name) : ''}" required></div>
      <div class="form-group"><label class="form-label form-required">電子信箱</label><input type="email" class="form-input" id="u-email" value="${isE ? esc(eu.email || '') : ''}" required></div>
      <div class="form-row"><div class="form-group"><label class="form-label form-required">角色</label><select class="form-select" id="u-role" required><option value="${ROLES.REPORTER}" ${isE && eu.role === ROLES.REPORTER ? 'selected' : ''}>填報人</option><option value="${ROLES.UNIT_ADMIN}" ${isE && eu.role === ROLES.UNIT_ADMIN ? 'selected' : ''}>單位管理員</option><option value="${ROLES.VIEWER}" ${isE && eu.role === ROLES.VIEWER ? 'selected' : ''}>跨單位檢視者</option><option value="${ROLES.ADMIN}" ${isE && eu.role === ROLES.ADMIN ? 'selected' : ''}>最高管理員</option></select></div>
      <div class="form-group"><label class="form-label" id="u-unit-label">主要單位</label>${buildUnitCascadeControl('u-unit', initUnit, false, false)}</div></div>
      <div class="form-group"><label class="form-label">額外授權單位</label><textarea class="form-textarea" id="u-units" rows="4" placeholder="每行一個單位，可用於跨單位代理">${esc(units.slice(1).join('\n'))}</textarea><div class="form-hint">系統不另外做代理模組，直接以授權單位陣列決定可切換單位。</div></div>
      <div class="form-group"><label class="form-label">可審核單位</label><textarea class="form-textarea" id="u-review-units" rows="4" placeholder="每行一個單位。留空代表沿用既有審核邏輯。">${esc(reviewUnits.join('\n'))}</textarea><div class="form-hint">僅當角色為單位管理員時生效。啟用後，該帳號只能審核列出的單位。</div></div>
      <div class="form-group"><label class="form-label ${isE ? '' : 'form-required'}">${isE ? '密碼（留空不修改）' : '密碼'}</label><input type="text" class="form-input" id="u-pass" ${isE ? '' : 'required'}></div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">${isE ? ic('save', 'icon-sm') + ' 儲存' : ic('plus', 'icon-sm') + ' 新增'}</button><button type="button" class="btn btn-secondary" data-dismiss-modal>取消</button></div>
    </form></div></div>`;
    initUnitCascade('u-unit', initUnit, { disabled: false });
    const roleEl = document.getElementById('u-role');
    const unitLabel = document.getElementById('u-unit-label');
    const parentEl = document.getElementById('u-unit-parent');
    function syncRoleFields() {
      const viewerMode = roleEl.value === ROLES.VIEWER;
      unitLabel.textContent = viewerMode ? '主要單位（留空代表全校唯讀）' : '主要單位';
      parentEl.required = !viewerMode;
    }
    syncRoleFields();
    roleEl.addEventListener('change', syncRoleFields);
    document.getElementById('modal-bg').addEventListener('click', e => { if (e.target === e.currentTarget) closeModalRoot(); });
    document.getElementById('user-form').addEventListener('submit', async e => {
      e.preventDefault();
      const un = document.getElementById('u-username').value.trim(), nm = document.getElementById('u-name').value.trim(), em = document.getElementById('u-email').value.trim(), rl = document.getElementById('u-role').value, ut = document.getElementById('u-unit').value.trim(), extraUnits = parseUserUnits(document.getElementById('u-units').value), reviewScopeUnits = parseUserUnits(document.getElementById('u-review-units').value), pw = document.getElementById('u-pass').value;
      const finalUnits = rl === ROLES.VIEWER ? Array.from(new Set([ut, ...extraUnits].filter(Boolean))) : Array.from(new Set([ut, ...extraUnits].filter(Boolean)));
      if (rl !== ROLES.VIEWER && !finalUnits.length) { toast('請至少指定一個授權單位', 'error'); return; }
      const payload = { name: nm, email: em, role: rl, unit: finalUnits[0] || '', units: finalUnits, activeUnit: finalUnits[0] || '' };
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
  async function handleDeleteUser(un) {
    if (!confirm(`確定刪除使用者「${un}」？`)) return;
    try {
      await submitUserDelete(un, { actorName: currentUser() && currentUser().name, actorEmail: currentUser() && currentUser().email });
      await syncUsersFromM365({ silent: true });
      await submitReviewScopeReplace({
        username: un,
        units: [],
        actorName: currentUser() && currentUser().name,
        actorEmail: currentUser() && currentUser().email
      });
      await syncReviewScopesFromM365({ silent: true });
      toast('使用者已刪除');
      renderUsers();
    } catch (error) {
      toast(String(error && error.message || error || '使用者刪除失敗'), 'error');
    }
  }
  function unitReviewStatusBadge(entry) {
    const approved = entry.status === 'approved';
    return `<span class="review-status-badge ${approved ? 'approved' : 'pending'}">${approved ? '已核准保留' : '待審核'}</span>`;
  }

  function formatUnitReviewHistory(entry) {
    if (entry.type === 'merged') {
      return {
        badgeClass: 'merged',
        badgeText: '合併單位',
        title: `${entry.unit} → ${entry.targetUnit}`,
        meta: entry.summary ? formatUnitScopeSummary(entry.summary) : '已完成資料同步'
      };
    }
    return {
      badgeClass: 'approved',
      badgeText: '核准保留',
      title: entry.unit,
      meta: '保留為可接受的自訂單位'
    };
  }

  function showUnitReferenceModal(unit) {
    const entry = getCustomUnitRegistry().find((item) => item.unit === unit);
    if (!entry) { toast('找不到此自訂單位引用資料', 'error'); return; }

    const refs = entry.references.length
      ? entry.references.map((ref) => `<li class="review-ref-item">${esc(ref)}</li>`).join('')
      : '<li class="review-ref-item">目前沒有可顯示的引用明細</li>';

    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal unit-review-modal"><div class="modal-header"><span class="modal-title">自訂單位引用明細</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><div class="review-modal-head"><div class="review-unit-name">${esc(entry.unit)}</div><div class="review-modal-subtitle">共 ${entry.count} 筆引用，涵蓋 ${esc(formatUnitScopeSummary(entry.scopes))}</div></div><ul class="review-ref-list">${refs}</ul></div></div>`;
    document.getElementById('modal-bg').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModalRoot(); });
  }

  function showUnitMergeModal(unit) {
    const entry = getCustomUnitRegistry().find((item) => item.unit === unit);
    if (!entry) { toast('找不到此自訂單位', 'error'); return; }

    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal unit-review-modal"><div class="modal-header"><span class="modal-title">合併自訂單位</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><div class="review-callout compact"><span class="review-callout-icon">${ic('git-merge', 'icon-sm')}</span><div><strong>${esc(entry.unit)}</strong> 目前共有 ${entry.count} 筆引用，合併後會同步更新帳號、矯正單、檢核表與教育訓練資料。</div></div><form id="unit-merge-form"><div class="form-group"><label class="form-label">來源單位</label><input type="text" class="form-input" value="${esc(entry.unit)}" readonly></div><div class="form-group"><label class="form-label form-required">合併目標</label>${buildUnitCascadeControl('unit-merge-target', '', false, true)}<div class="form-hint">可選正式單位，或使用「其他」輸入新的標準名稱。</div></div><div class="form-actions"><button type="submit" class="btn btn-primary">${ic('git-merge', 'icon-sm')} 立即合併</button><button type="button" class="btn btn-secondary" data-dismiss-modal>取消</button></div></form></div></div>`;
    initUnitCascade('unit-merge-target', '', { disabled: false });
    document.getElementById('modal-bg').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModalRoot(); });
    document.getElementById('unit-merge-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const target = document.getElementById('unit-merge-target').value.trim();
      if (!target) { toast('請選擇或輸入合併目標', 'error'); return; }
      if (target === entry.unit) { toast('來源與目標單位不能相同', 'error'); return; }
      const summary = mergeCustomUnit(entry.unit, target, currentUser().name);
      if (!summary) { toast('單位合併失敗', 'error'); return; }
      closeModalRoot();
      toast(`已完成單位合併，共更新 ${summary.total} 筆資料`);
      renderUnitReview();
      refreshIcons();
    });
  }

  function renderUnitReview() {
    if (!isAdmin()) { navigate('dashboard'); toast('您沒有管理單位治理的權限', 'error'); return; }

    const registry = getCustomUnitRegistry();
    const reviewStore = loadUnitReviewStore();
    const pendingCount = registry.filter((entry) => entry.status === 'pending').length;
    const approvedCount = registry.filter((entry) => entry.status === 'approved').length;
    const recentMerged = reviewStore.history.filter((entry) => entry.type === 'merged').slice(0, 10);
    const history = reviewStore.history.slice(0, 8);

    const rows = registry.length ? registry.map((entry) => {
      const encoded = encodeURIComponent(entry.unit);
      const sampleRefs = entry.references.slice(0, 2).map((ref) => `<span class="review-source-pill">${esc(ref)}</span>`).join('');
      const approveBtn = entry.status === 'approved'
        ? `<button type="button" class="btn btn-sm btn-secondary" disabled>${ic('shield-check', 'icon-sm')} 已核准</button>`
        : `<button type="button" class="btn btn-sm btn-secondary" data-action="admin.approveUnit" data-unit="${encoded}">${ic('shield-check', 'icon-sm')} 核准保留</button>`;
      return `<tr><td><div class="review-unit-name">${esc(entry.unit)}</div></td><td>${unitReviewStatusBadge(entry)}</td><td><div class="review-count-chip">${entry.count} 筆</div></td><td><div class="review-scope-text">${esc(formatUnitScopeSummary(entry.scopes))}</div><div class="review-source-list">${sampleRefs}</div></td><td><div class="review-actions"><button type="button" class="btn btn-sm btn-ghost" data-action="admin.viewUnitRefs" data-unit="${encoded}">${ic('list', 'icon-sm')} 檢視引用</button>${approveBtn}<button type="button" class="btn btn-sm btn-primary" data-action="admin.mergeUnit" data-unit="${encoded}">${ic('git-merge', 'icon-sm')} 合併</button></div></td></tr>`;
    }).join('') : `<tr><td colspan="5"><div class="empty-state review-empty"><div class="empty-state-icon">${ic('badge-check')}</div><div class="empty-state-title">目前沒有待治理的自訂單位</div><div class="empty-state-desc">所有單位都已符合正式名錄，或已由最高管理員審核完成。</div></div></td></tr>`;

    const historyHtml = history.length ? history.map((entry) => {
      const detail = formatUnitReviewHistory(entry);
      return `<div class="review-history-item"><div class="review-history-top"><span class="review-history-badge ${detail.badgeClass}">${detail.badgeText}</span><span class="review-history-time">${fmtTime(entry.time)}</span></div><div class="review-history-title">${esc(detail.title)}</div><div class="review-history-meta">${esc(detail.meta)}${entry.actor ? ` · ${esc(entry.actor)}` : ''}</div></div>`;
    }).join('') : `<div class="empty-state" style="padding:32px 20px"><div class="empty-state-title">尚無治理紀錄</div></div>`;

    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位治理</div><h1 class="page-title">自訂單位審核與合併</h1><p class="page-subtitle">集中處理最高管理員手動建立的自訂單位，已核准保留的名稱會回流到最高管理員的單位選單。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitReview">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="review-callout"><span class="review-callout-icon">${ic('sparkles', 'icon-sm')}</span><div>建議優先處理<strong>待審核</strong>且引用次數高的自訂單位；若名稱合理但暫時不納入正式名錄，可先使用「核准保留」，系統會讓最高管理員之後可直接選用。</div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('building-2')}</div><div class="stat-value">${registry.length}</div><div class="stat-label">自訂單位總數</div></div><div class="stat-card pending"><div class="stat-icon">${ic('hourglass')}</div><div class="stat-value">${pendingCount}</div><div class="stat-label">待審核</div></div><div class="stat-card closed"><div class="stat-icon">${ic('shield-check')}</div><div class="stat-value">${approvedCount}</div><div class="stat-label">已核准保留</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('git-merge')}</div><div class="stat-value">${recentMerged.length}</div><div class="stat-label">最近合併筆數</div></div></div><div class="review-grid"><div class="card review-table-card"><div class="card-header"><span class="card-title">自訂單位清單</span><span class="review-card-subtitle">依待審核優先、引用次數排序</span></div><div class="table-wrapper"><table><thead><tr><th>單位名稱</th><th>狀態</th><th>引用數</th><th>使用位置</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="card review-history-card"><div class="card-header"><span class="card-title">最近治理紀錄</span><span class="review-card-subtitle">保留最近 8 筆操作</span></div><div class="review-history-list">${historyHtml}</div></div></div></div>`;
    refreshIcons();
  }

  function handleApproveUnit(encodedUnit) {
    if (!isAdmin()) return;
    const unit = decodeURIComponent(encodedUnit);
    if (!confirm(`確定將「${unit}」核准保留為自訂單位？`)) return;
    approveCustomUnit(unit, currentUser().name);
    toast('自訂單位已核准保留，之後可於最高管理員單位選單直接選用');
    renderUnitReview();
  }
  function handleClearLoginLogs() {
    if (!canManageUsers()) return;
    if (!confirm('確定清除所有登入紀錄？')) return;
    clearLoginLogs();
    toast('登入紀錄已清除', 'info');
    renderLoginLog();
  }

  // ─── Render: Login Log ─────────────────────
  function renderLoginLog() {
    if (!canManageUsers()) { navigate('dashboard'); return; }
    const logs = loadLoginLogs().slice().reverse();
    const rows = logs.length ? logs.map(log => {
      const status = log.success ? '<span style="color:#16a34a;font-weight:600">成功</span>' : '<span style="color:#dc2626;font-weight:600">失敗</span>';
      return `<tr><td>${fmtTime(log.time)}</td><td>${esc(log.username)}</td><td>${esc(log.name || '—')}</td><td>${esc(log.role || '—')}</td><td>${status}</td></tr>`;
    }).join('') : '<tr><td colspan="5"><div class="empty-state" style="padding:36px"><div class="empty-state-title">尚無登入紀錄</div></div></td></tr>';
    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">登入紀錄</h1><p class="page-subtitle">系統保存最近 500 筆登入成功與失敗事件</p></div><button type="button" class="btn btn-danger" data-action="admin.clearLoginLogs">${ic('trash-2', 'icon-sm')} 清除紀錄</button></div><div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>時間</th><th>帳號</th><th>姓名</th><th>角色</th><th>結果</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
  }

  function getUnitContactReviewFiltersFromDom() {
    return {
      status: document.getElementById('unit-contact-review-status') ? document.getElementById('unit-contact-review-status').value.trim() : '',
      keyword: document.getElementById('unit-contact-review-keyword') ? document.getElementById('unit-contact-review-keyword').value.trim() : '',
      email: document.getElementById('unit-contact-review-email') ? document.getElementById('unit-contact-review-email').value.trim() : '',
      limit: document.getElementById('unit-contact-review-limit') ? document.getElementById('unit-contact-review-limit').value.trim() : '50'
    };
  }

  function unitContactStatusBadge(item) {
    const tone = String(item && item.statusTone || 'pending').trim() || 'pending';
    return `<span class="unit-contact-status-badge unit-contact-status-badge--${esc(tone)}">${esc(item && item.statusLabel || item && item.status || '—')}</span>`;
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
        actionButtons.push(`<button type="button" class="btn btn-sm btn-secondary" data-action="admin.unitContactApprove" data-id="${esc(id)}">${ic('badge-check', 'icon-sm')} 通過</button>`);
        actionButtons.push(`<button type="button" class="btn btn-sm btn-ghost" data-action="admin.unitContactReturn" data-id="${esc(id)}">${ic('undo-2', 'icon-sm')} 退回</button>`);
        actionButtons.push(`<button type="button" class="btn btn-sm btn-danger" data-action="admin.unitContactReject" data-id="${esc(id)}">${ic('x-circle', 'icon-sm')} 拒絕</button>`);
      } else if (status === 'approved' || status === 'activation_pending') {
        actionButtons.push(`<button type="button" class="btn btn-sm btn-primary" data-action="admin.unitContactActivate" data-id="${esc(id)}">${ic('key-round', 'icon-sm')} 已啟用</button>`);
        actionButtons.push(`<button type="button" class="btn btn-sm btn-ghost" data-action="admin.unitContactReturn" data-id="${esc(id)}">${ic('undo-2', 'icon-sm')} 退回</button>`);
      } else if (status === 'active') {
        actionButtons.push(`<button type="button" class="btn btn-sm btn-secondary" data-action="admin.unitContactResendActivation" data-id="${esc(id)}">${ic('mail', 'icon-sm')} 重新寄送啟用通知</button>`);
      }
      return `<tr><td><div class="review-unit-name">${esc(id)}</div><div class="review-card-subtitle" style="margin-top:4px">${esc(item && item.unitValue || '未指定單位')}</div></td><td>${esc(item && item.applicantName || '—')}<div class="review-card-subtitle" style="margin-top:4px">${esc(item && item.applicantEmail || '—')}</div></td><td>${esc(item && item.extensionNumber || '—')}</td><td>${unitContactStatusBadge(item)}</td><td>${esc(item && item.reviewComment || '—')}</td><td>${esc(fmtTime(item && (item.updatedAt || item.submittedAt)) || '—')}</td><td><div class="review-actions review-actions--unit-contact">${actionButtons.join('')}</div></td></tr>`;
    }).join('');
  }

  async function renderUnitContactReview(nextFilters) {
    if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可審核單位管理人申請', 'error'); return; }
    unitContactReviewState.filters = { ...unitContactReviewState.filters, ...(nextFilters || {}) };
    unitContactReviewState.loading = true;
    const app = document.getElementById('app');
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與啟用追蹤</h1><p class="page-subtitle">集中處理單位管理人申請，支援通過、退回、拒絕與啟用完成通知。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" disabled>${ic('loader-circle', 'icon-sm')} 載入中</button></div></div><div class="card" style="padding:32px;text-align:center;color:var(--text-secondary)">正在讀取申請資料...</div></div>`;
    refreshIcons();
    try {
      const items = await listUnitContactApplications(unitContactReviewState.filters);
      unitContactReviewState.items = Array.isArray(items) ? items : [];
      unitContactReviewState.lastLoadedAt = new Date().toISOString();
    } catch (error) {
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與啟用追蹤</h1><p class="page-subtitle">無法讀取申請清單。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitContactReview">${ic('refresh-cw', 'icon-sm')} 重試</button></div></div><div class="card"><div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">申請後端尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
    }

    const counts = unitContactReviewState.items.reduce((result, item) => {
      const key = String(item && item.status || 'unknown').trim() || 'unknown';
      result[key] = Number(result[key] || 0) + 1;
      return result;
    }, {});
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">單位管理人申請</div><h1 class="page-title">申請審核與啟用追蹤</h1><p class="page-subtitle">最後更新：${esc(fmtTime(unitContactReviewState.lastLoadedAt))}</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitContactReview">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('mail-plus')}</div><div class="stat-value">${unitContactReviewState.items.length}</div><div class="stat-label">目前清單筆數</div></div><div class="stat-card pending"><div class="stat-icon">${ic('hourglass')}</div><div class="stat-value">${counts.pending_review || 0}</div><div class="stat-label">待審核</div></div><div class="stat-card closed"><div class="stat-icon">${ic('badge-check')}</div><div class="stat-value">${counts.approved || 0}</div><div class="stat-label">已通過</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('key-round')}</div><div class="stat-value">${counts.active || 0}</div><div class="stat-label">已啟用</div></div></div><div class="card review-table-card"><div class="card-header"><span class="card-title">申請清單</span><span class="review-card-subtitle">可依狀態、信箱與關鍵字過濾</span></div><div class="review-toolbar"><div class="review-toolbar-main"><div class="form-group"><label class="form-label">狀態</label><select class="form-select" id="unit-contact-review-status"><option value="" ${!unitContactReviewState.filters.status ? 'selected' : ''}>全部</option><option value="pending_review" ${unitContactReviewState.filters.status === 'pending_review' ? 'selected' : ''}>待審核</option><option value="approved" ${unitContactReviewState.filters.status === 'approved' ? 'selected' : ''}>已通過</option><option value="returned" ${unitContactReviewState.filters.status === 'returned' ? 'selected' : ''}>退回補件</option><option value="rejected" ${unitContactReviewState.filters.status === 'rejected' ? 'selected' : ''}>未核准</option><option value="active" ${unitContactReviewState.filters.status === 'active' ? 'selected' : ''}>已啟用</option></select></div><div class="form-group"><label class="form-label">申請信箱</label><input class="form-input" id="unit-contact-review-email" value="${esc(unitContactReviewState.filters.email)}" placeholder="例如 user@ntu.edu.tw"></div><div class="form-group"><label class="form-label">關鍵字</label><input class="form-input" id="unit-contact-review-keyword" value="${esc(unitContactReviewState.filters.keyword)}" placeholder="單位、申請人、編號"></div><div class="form-group"><label class="form-label">筆數</label><select class="form-select" id="unit-contact-review-limit"><option value="20" ${unitContactReviewState.filters.limit === '20' ? 'selected' : ''}>20</option><option value="50" ${unitContactReviewState.filters.limit === '50' ? 'selected' : ''}>50</option><option value="100" ${unitContactReviewState.filters.limit === '100' ? 'selected' : ''}>100</option></select></div></div><div class="review-toolbar-actions"><button type="button" class="btn btn-primary" data-action="admin.applyUnitContactFilters">${ic('filter', 'icon-sm')} 套用篩選</button><button type="button" class="btn btn-secondary" data-action="admin.resetUnitContactFilters">${ic('rotate-ccw', 'icon-sm')} 重設</button></div></div>${buildReviewTableShell('unit-contact-review-table', '<th>申請編號 / 單位</th><th>申請人</th><th>分機</th><th>狀態</th><th>處理說明</th><th>最後更新</th><th>操作</th>', renderUnitContactReviewRows(unitContactReviewState.items), { toolbarSubtitle: '通過、退回、拒絕與已啟用都會同步更新狀態並寄送通知信。' })}</div></div>`;
    wireReviewTableScrollers(app);
    refreshIcons();
  }

  function promptReviewComment(title, placeholder, submitLabel, onSubmit) {
    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal"><div class="modal-header"><span class="modal-title">${esc(title)}</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><form id="unit-contact-review-form"><div class="form-group"><label class="form-label">處理說明</label><textarea class="form-textarea" id="unit-contact-review-comment" rows="5" placeholder="${esc(placeholder || '')}"></textarea></div><div class="form-actions"><button type="submit" class="btn btn-primary">${esc(submitLabel)}</button><button type="button" class="btn btn-secondary" data-dismiss-modal>取消</button></div></form></div></div>`;
    document.getElementById('modal-bg').addEventListener('click', function (event) { if (event.target === event.currentTarget) closeModalRoot(); });
    document.getElementById('unit-contact-review-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const comment = String(document.getElementById('unit-contact-review-comment').value || '').trim();
      closeModalRoot();
      onSubmit(comment);
    });
  }

  function promptActivationInfo(applicationId, options) {
    const opts = options || {};
    const isResend = opts.mode === 'resend';
    const application = unitContactReviewState.items.find((item) => String(item && item.id || '').trim() === String(applicationId || '').trim()) || getUnitContactApplication(applicationId);
    const defaultUsername = String(application && application.externalUserId || '').trim();
    const hasRequestedPassword = !!(application && application.hasRequestedPassword);
    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal"><div class="modal-header"><span class="modal-title">${isResend ? '重新寄送啟用通知' : '完成帳號啟用'}</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><form id="unit-contact-activate-form"><div class="form-group"><label class="form-label form-required">登入帳號</label><input type="text" class="form-input" id="unit-contact-external-user-id" value="${esc(defaultUsername)}" placeholder="例如 sheila.tsai 或 sheila" required></div><div class="form-group"><label class="form-label${hasRequestedPassword ? '' : ' form-required'}">初始密碼</label><input type="text" class="form-input" id="unit-contact-initial-password" placeholder="${hasRequestedPassword ? '留空代表沿用申請時填寫的密碼' : '至少 8 碼，需含大小寫英文與數字'}"></div><div class="form-hint">${hasRequestedPassword ? '若申請人已在申請頁填入初始密碼，可留空並直接沿用。若要改發新密碼，也可在此重新輸入。' : '申請頁未保留可用密碼時，這裡必須由最高管理員提供新的初始密碼。'}</div><div class="form-group"><label class="form-label">通知說明</label><textarea class="form-textarea" id="unit-contact-activate-comment" rows="4" placeholder="可補充啟用說明、聯絡方式或首次登入提醒"></textarea></div><div class="form-actions"><button type="submit" class="btn btn-primary">${ic(isResend ? 'mail' : 'key-round', 'icon-sm')} ${isResend ? '重新寄送通知' : '完成啟用'}</button><button type="button" class="btn btn-secondary" data-dismiss-modal>取消</button></div></form></div></div>`;
    document.getElementById('modal-bg').addEventListener('click', function (event) { if (event.target === event.currentTarget) closeModalRoot(); });
    document.getElementById('unit-contact-activate-form').addEventListener('submit', async function (event) {
      event.preventDefault();
      const externalUserId = String(document.getElementById('unit-contact-external-user-id').value || '').trim();
      const initialPassword = String(document.getElementById('unit-contact-initial-password').value || '').trim();
      const reviewComment = String(document.getElementById('unit-contact-activate-comment').value || '').trim();
      if (!externalUserId) {
        toast('請輸入登入帳號。', 'error');
        return;
      }
      if (!initialPassword && !hasRequestedPassword && !isResend) {
        toast('這筆申請沒有可沿用的初始密碼，請由最高管理員設定新的初始密碼。', 'error');
        return;
      }
      if (initialPassword) {
        const strongEnough = initialPassword.length >= 8 && /[A-Z]/.test(initialPassword) && /[a-z]/.test(initialPassword) && /\d/.test(initialPassword);
        if (!strongEnough) {
          toast('初始密碼至少 8 碼，且需包含大小寫英文與數字。', 'error');
          return;
        }
      }
      closeModalRoot();
      try {
        const result = await activateUnitContactApplication({
          id: applicationId,
          externalUserId,
          initialPassword,
          reviewComment
        });
        toast(result && result.delivery && result.delivery.sent ? '啟用通知已寄出。' : '狀態已更新，但未寄出通知。');
        renderUnitContactReview(unitContactReviewState.filters);
      } catch (error) {
        toast(String(error && error.message || error || '啟用處理失敗。'), 'error');
      }
    });
  }

  function getAuditTrailFiltersFromDom() {
    return {
      keyword: document.getElementById('audit-keyword') ? document.getElementById('audit-keyword').value.trim() : '',
      eventType: document.getElementById('audit-event-type') ? document.getElementById('audit-event-type').value.trim() : '',
      actorEmail: document.getElementById('audit-actor-email') ? document.getElementById('audit-actor-email').value.trim() : '',
      unitCode: document.getElementById('audit-unit-code') ? document.getElementById('audit-unit-code').value.trim() : '',
      recordId: document.getElementById('audit-record-id') ? document.getElementById('audit-record-id').value.trim() : '',
      limit: document.getElementById('audit-limit') ? document.getElementById('audit-limit').value.trim() : '100'
    };
  }

  function formatAuditOccurredAt(value) {
    return value ? fmtTime(value) : '—';
  }

  function formatAuditEventTypeSummary(summary) {
    const rows = Array.isArray(summary && summary.eventTypes) ? summary.eventTypes : [];
    if (!rows.length) {
      return `<div class="empty-state" style="padding:28px 18px"><div class="empty-state-title">目前沒有稽核事件摘要</div></div>`;
    }
    return rows.slice(0, 10).map((entry) => `<div class="review-history-item"><div class="review-history-top"><span class="review-history-badge approved">${esc(entry.eventType || 'unknown')}</span><span class="review-history-time">${entry.count} 筆</span></div><div class="review-history-title">${esc(entry.eventType || 'unknown')}</div><div class="review-history-meta">事件類型統計</div></div>`).join('');
  }

  function parseAuditPayload(entry) {
    if (entry && entry.payload && typeof entry.payload === 'object') return entry.payload;
    if (!entry || !entry.payloadJson) return {};
    try {
      const parsed = JSON.parse(entry.payloadJson);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function formatAuditValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) {
      if (!value.length) return '—';
      return value.join('\n');
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (_) {
        return String(value);
      }
    }
    return String(value);
  }

  function renderAuditDiffTable(changes) {
    const entries = changes && typeof changes === 'object' ? Object.entries(changes) : [];
    if (!entries.length) {
      return `<div class="empty-state" style="padding:24px 18px"><div class="empty-state-title">本事件沒有欄位差異</div></div>`;
    }
    const rows = entries.map(([field, diff]) => `<tr><td style="font-weight:600;color:var(--text-primary)">${esc(field)}</td><td><pre style="margin:0;white-space:pre-wrap;font-family:inherit">${esc(formatAuditValue(diff && diff.before))}</pre></td><td><pre style="margin:0;white-space:pre-wrap;font-family:inherit">${esc(formatAuditValue(diff && diff.after))}</pre></td></tr>`).join('');
    return `<div class="table-wrapper"><table><thead><tr><th>欄位</th><th>變更前</th><th>變更後</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function buildReviewTableShell(key, headersHtml, rowsHtml, options) {
    const config = options || {};
    const toolbarSubtitle = config.toolbarSubtitle
      ? `<span class="review-card-subtitle">${esc(config.toolbarSubtitle)}</span>`
      : '<span class="review-card-subtitle">可拖曳表格左右移動，也可使用右側按鈕快速查看其他欄位。</span>';
    return `<div class="review-table-shell"><div class="review-table-toolbar">${toolbarSubtitle}<div class="review-table-scroll-actions"><button type="button" class="btn btn-ghost btn-icon review-table-scroll-btn" data-review-scroll-left="${esc(key)}" aria-label="向左移動">${ic('chevron-left', 'icon-sm')}</button><button type="button" class="btn btn-ghost btn-icon review-table-scroll-btn" data-review-scroll-right="${esc(key)}" aria-label="向右移動">${ic('chevron-right', 'icon-sm')}</button></div></div><div class="table-wrapper review-table-wrapper" data-review-scroll-root="${esc(key)}"><table class="review-data-table"><thead><tr>${headersHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
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

  function renderAuditObjectCard(title, value, badge) {
    if (!value || (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)) return '';
    return `<div class="card" style="padding:18px 20px"><div class="card-header"><span class="card-title">${esc(title)}</span>${badge ? `<span class="review-status-badge approved">${esc(badge)}</span>` : ''}</div><pre style="margin:0;white-space:pre-wrap;font-size:.84rem;line-height:1.65;color:var(--text-primary)">${esc(formatAuditValue(value))}</pre></div>`;
  }

  function showAuditEntryModal(indexValue) {
    const index = Number(indexValue);
    const entry = Number.isInteger(index) ? auditTrailState.items[index] : null;
    if (!entry) {
      toast('找不到對應的稽核紀錄', 'error');
      return;
    }
    const payload = parseAuditPayload(entry);
    const summaryBits = [
      entry.actorEmail ? `操作人：${entry.actorEmail}` : '',
      entry.targetEmail ? `目標：${entry.targetEmail}` : '',
      entry.unitCode ? `單位：${entry.unitCode}` : '',
      entry.recordId ? `編號：${entry.recordId}` : ''
    ].filter(Boolean).join(' · ');
    const metaRows = Object.entries(payload).filter(([key]) => !['changes', 'snapshot', 'deletedState', 'requested', 'duplicated', 'duplicatedChanges', 'summary'].includes(key));
    const metaHtml = metaRows.length
      ? `<div class="card" style="padding:18px 20px"><div class="card-header"><span class="card-title">事件附帶資訊</span></div><div class="table-wrapper"><table><tbody>${metaRows.map(([key, value]) => `<tr><th style="width:180px">${esc(key)}</th><td><pre style="margin:0;white-space:pre-wrap;font-family:inherit">${esc(formatAuditValue(value))}</pre></td></tr>`).join('')}</tbody></table></div></div>`
      : '';
    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal unit-review-modal" style="max-width:1040px"><div class="modal-header"><span class="modal-title">操作稽核差異檢視</span><button class="btn btn-ghost btn-icon" data-dismiss-modal>✕</button></div><div class="review-modal-head"><div class="review-unit-name">${esc(entry.eventType || 'unknown')}</div><div class="review-modal-subtitle">${esc(formatAuditOccurredAt(entry.occurredAt))}${summaryBits ? ` · ${esc(summaryBits)}` : ''}</div></div><div class="review-grid" style="grid-template-columns:minmax(0,1.35fr) minmax(300px,.85fr)"><div class="card review-table-card"><div class="card-header"><span class="card-title">欄位差異</span><span class="review-card-subtitle">${esc(entry.payloadPreview || entry.title || '後端 audit payload')}</span></div>${renderAuditDiffTable(payload.changes)}</div><div class="review-history-list" style="display:grid;gap:16px">${renderAuditObjectCard('快照資料', payload.snapshot, 'snapshot')}${renderAuditObjectCard('刪除前資料', payload.deletedState, 'deleted')}${renderAuditObjectCard('重複申請比對', payload.duplicated, 'duplicate')}${renderAuditObjectCard('查詢摘要', payload.summary, 'summary')}${renderAuditObjectCard('重複申請差異', payload.duplicatedChanges, 'diff')}${renderAuditObjectCard('請求內容', payload.requested, 'requested')}${metaHtml}<details class="card" style="padding:18px 20px"><summary style="cursor:pointer;font-weight:700;color:var(--text-primary)">原始 Payload JSON</summary><pre style="margin-top:14px;white-space:pre-wrap;font-size:.82rem;line-height:1.65">${esc(entry.payloadJson || '{}')}</pre></details></div></div></div></div>`;
    document.getElementById('modal-bg').addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeModalRoot();
    });
  }

  async function loadAuditTrailData(filters) {
    const nextFilters = { ...DEFAULT_AUDIT_FILTERS, ...(filters || {}) };
    auditTrailState.loading = true;
    auditTrailState.filters = nextFilters;
    try {
      const [health, payload] = await Promise.all([
        fetchAuditTrailHealth(),
        fetchAuditTrailEntries(nextFilters)
      ]);
      auditTrailState.health = health;
      auditTrailState.items = Array.isArray(payload && payload.items) ? payload.items : [];
      auditTrailState.summary = payload && payload.summary ? payload.summary : { total: 0, actorCount: 0, latestOccurredAt: '', eventTypes: [] };
      auditTrailState.lastLoadedAt = new Date().toISOString();
      return auditTrailState;
    } finally {
      auditTrailState.loading = false;
    }
  }

  async function renderAuditTrail(nextFilters) {
    if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可檢視操作稽核軌跡', 'error'); return; }
    const app = document.getElementById('app');
    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">稽核追蹤</div><h1 class="page-title">操作稽核軌跡</h1><p class="page-subtitle">集中查詢系統登入、帳號異動、權限調整、表單送出與附件操作的後端稽核紀錄。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" disabled>${ic('loader-circle', 'icon-sm')} 載入中</button></div></div><div class="card" style="padding:32px;text-align:center;color:var(--text-secondary)">正在從正式稽核後端讀取資料...</div></div>`;
    refreshIcons();

    let state;
    try {
      state = await loadAuditTrailData(nextFilters || auditTrailState.filters);
    } catch (error) {
      app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">稽核追蹤</div><h1 class="page-title">操作稽核軌跡</h1><p class="page-subtitle">無法讀取後端稽核資料。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshAuditTrail">${ic('refresh-cw', 'icon-sm')} 重試</button></div></div><div class="card"><div class="empty-state" style="padding:40px 24px"><div class="empty-state-icon">${ic('shield-alert')}</div><div class="empty-state-title">稽核軌跡後端尚未就緒</div><div class="empty-state-desc">${esc(String(error && error.message || error || '讀取失敗'))}</div></div></div></div>`;
      refreshIcons();
      return;
    }

    const health = state.health || { ready: false, message: '未取得後端健康資訊' };
    const items = Array.isArray(state.items) ? state.items : [];
    const eventTypeOptions = Array.from(new Set(items.map((entry) => entry.eventType).filter(Boolean))).sort((left, right) => String(left).localeCompare(String(right), 'zh-Hant'));
    const eventTypeSelect = [`<option value="">全部事件</option>`]
      .concat(eventTypeOptions.map((value) => `<option value="${esc(value)}" ${state.filters.eventType === value ? 'selected' : ''}>${esc(value)}</option>`))
      .join('');
    const rows = items.length ? items.map((entry, index) => `<tr><td>${formatAuditOccurredAt(entry.occurredAt)}</td><td><div style="font-weight:600;color:var(--text-primary)">${esc(entry.eventType || 'unknown')}</div><div class="review-card-subtitle" style="margin-top:4px">${esc(entry.recordId || '—')}</div></td><td>${esc(entry.actorEmail || '—')}</td><td>${esc(entry.targetEmail || '—')}</td><td>${esc(entry.unitCode || '—')}</td><td style="max-width:360px;white-space:normal;line-height:1.55">${esc(entry.payloadPreview || entry.title || '—')}</td><td><button type="button" class="btn btn-sm btn-secondary" data-action="admin.viewAuditEntry" data-index="${index}">${ic('search', 'icon-sm')} 檢視差異</button></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state review-empty"><div class="empty-state-icon">${ic('scroll-text')}</div><div class="empty-state-title">目前查無符合條件的稽核紀錄</div><div class="empty-state-desc">可調整關鍵字、事件類型、單位代碼或紀錄編號後再查詢。</div></div></td></tr>`;
    const filterSummary = `共 ${state.summary.total || 0} 筆 · ${state.summary.actorCount || 0} 位操作人 · 最近事件 ${formatAuditOccurredAt(state.summary.latestOccurredAt)}`;
    const healthBadge = health.ready === false
      ? `<span class="review-status-badge pending">後端未就緒</span>`
      : `<span class="review-status-badge approved">後端正常</span>`;

    app.innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">稽核追蹤</div><h1 class="page-title">操作稽核軌跡</h1><p class="page-subtitle">查詢後端權限控管與稽核寫入結果，協助管理者追查異動來源。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshAuditTrail">${ic('refresh-cw', 'icon-sm')} 重新整理</button><button type="button" class="btn btn-secondary" data-action="admin.exportAuditTrail">${ic('download', 'icon-sm')} 匯出 JSON</button></div></div><div class="review-callout"><span class="review-callout-icon">${ic('shield-check', 'icon-sm')}</span><div>${healthBadge} <strong style="margin-left:8px">${esc(filterSummary)}</strong><div class="review-card-subtitle" style="margin-top:6px">${esc(health.repository || '')}${health.actor && health.actor.tokenMode ? ` · token=${esc(health.actor.tokenMode)}` : ''}${health.message ? ` · ${esc(health.message)}` : ''}</div></div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('scroll-text')}</div><div class="stat-value">${state.summary.total || 0}</div><div class="stat-label">符合條件事件</div></div><div class="stat-card closed"><div class="stat-icon">${ic('users')}</div><div class="stat-value">${state.summary.actorCount || 0}</div><div class="stat-label">操作人數</div></div><div class="stat-card pending"><div class="stat-icon">${ic('activity')}</div><div class="stat-value">${eventTypeOptions.length}</div><div class="stat-label">事件類型</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('clock-3')}</div><div class="stat-value">${state.summary.latestOccurredAt ? esc(formatAuditOccurredAt(state.summary.latestOccurredAt).slice(5, 16)) : '—'}</div><div class="stat-label">最近事件</div></div></div><div class="review-grid"><div class="card review-table-card"><div class="card-header"><span class="card-title">稽核紀錄查詢</span><span class="review-card-subtitle">${esc(filterSummary)}</span></div><form id="audit-filter-form"><div class="panel-grid-two" style="margin-bottom:18px"><div class="form-group"><label class="form-label">關鍵字</label><input type="text" class="form-input" id="audit-keyword" value="${esc(state.filters.keyword)}" placeholder="事件類型、email、recordId、payload 關鍵字"></div><div class="form-group"><label class="form-label">事件類型</label><select class="form-select" id="audit-event-type">${eventTypeSelect}</select></div><div class="form-group"><label class="form-label">操作人 email</label><input type="text" class="form-input" id="audit-actor-email" value="${esc(state.filters.actorEmail)}" placeholder="actorEmail"></div><div class="form-group"><label class="form-label">單位代碼</label><input type="text" class="form-input" id="audit-unit-code" value="${esc(state.filters.unitCode)}" placeholder="unitCode"></div><div class="form-group"><label class="form-label">紀錄編號</label><input type="text" class="form-input" id="audit-record-id" value="${esc(state.filters.recordId)}" placeholder="recordId"></div><div class="form-group"><label class="form-label">筆數上限</label><select class="form-select" id="audit-limit"><option value="50" ${state.filters.limit === '50' ? 'selected' : ''}>50</option><option value="100" ${state.filters.limit === '100' ? 'selected' : ''}>100</option><option value="200" ${state.filters.limit === '200' ? 'selected' : ''}>200</option></select></div></div><div class="form-actions" style="justify-content:flex-start;margin-bottom:8px"><button type="submit" class="btn btn-primary">${ic('search', 'icon-sm')} 套用篩選</button><button type="button" class="btn btn-secondary" data-action="admin.resetAuditTrailFilters">${ic('rotate-ccw', 'icon-sm')} 清空條件</button></div></form>${buildReviewTableShell('audit-trail-table', '<th>時間</th><th>事件</th><th>操作人</th><th>目標</th><th>單位</th><th>內容摘要</th><th>差異</th>', rows, { toolbarSubtitle: '套用篩選後可直接拖曳表格左右移動，也可用右側按鈕快速平移。' })}</div><div class="card review-history-card"><div class="card-header"><span class="card-title">事件分布</span><span class="review-card-subtitle">最近查詢摘要</span></div><div class="review-history-list">${formatAuditEventTypeSummary(state.summary)}</div></div></div></div>`;
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
      promptReviewComment('審核通過', '可填寫後續建帳或啟用說明。', '確認通過', async function (reviewComment) {
        try {
          const result = await reviewUnitContactApplication({
            id: dataset.id,
            status: 'approved',
            reviewComment
          });
          toast(result && result.delivery && result.delivery.sent ? '已通過並寄送通知' : '已通過');
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
    unitContactActivate: function ({ dataset }) {
      promptActivationInfo(dataset.id);
    },
    unitContactResendActivation: function ({ dataset }) {
      promptActivationInfo(dataset.id, { mode: 'resend' });
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
      renderLoginLog,
      renderAuditTrail,
      renderSchemaHealth
    };
  };
})();

