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
      closeModalRoot
    } = deps;

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

    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">System Governance</div><h1 class="page-title">自訂單位審核與合併</h1><p class="page-subtitle">集中處理最高管理員手動建立的自訂單位，已核准保留的名稱會回流到最高管理員的單位選單。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshUnitReview">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="review-callout"><span class="review-callout-icon">${ic('sparkles', 'icon-sm')}</span><div>建議優先處理<strong>待審核</strong>且引用次數高的自訂單位；若名稱合理但暫時不納入正式名錄，可先使用「核准保留」，系統會讓最高管理員之後可直接選用。</div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('building-2')}</div><div class="stat-value">${registry.length}</div><div class="stat-label">自訂單位總數</div></div><div class="stat-card pending"><div class="stat-icon">${ic('hourglass')}</div><div class="stat-value">${pendingCount}</div><div class="stat-label">待審核</div></div><div class="stat-card closed"><div class="stat-icon">${ic('shield-check')}</div><div class="stat-value">${approvedCount}</div><div class="stat-label">已核准保留</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('git-merge')}</div><div class="stat-value">${recentMerged.length}</div><div class="stat-label">最近合併筆數</div></div></div><div class="review-grid"><div class="card review-table-card"><div class="card-header"><span class="card-title">自訂單位清單</span><span class="review-card-subtitle">依待審核優先、引用次數排序</span></div><div class="table-wrapper"><table><thead><tr><th>單位名稱</th><th>狀態</th><th>引用數</th><th>使用位置</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="card review-history-card"><div class="card-header"><span class="card-title">最近治理紀錄</span><span class="review-card-subtitle">保留最近 8 筆操作</span></div><div class="review-history-list">${historyHtml}</div></div></div></div>`;
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
    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">Schema Diagnostics</div><h1 class="page-title">資料健康檢查</h1><p class="page-subtitle">檢查各個 localStorage store 的 schema version、envelope 格式、資料筆數與 migration 狀態，並補上支援包與附件資料庫診斷。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" data-action="admin.refreshSchemaHealth">${ic('refresh-cw', 'icon-sm')} 重新檢查</button><button type="button" class="btn btn-secondary" data-action="admin.exportSupportBundle">${ic('download', 'icon-sm')} 匯出支援包</button><button type="button" class="btn btn-secondary" data-action="admin.pruneOrphanAttachments">${ic('trash-2', 'icon-sm')} 清除孤兒附件</button><button type="button" class="btn btn-primary" data-action="admin.repairSchemaHealth">${ic('database', 'icon-sm')} 重跑 migration repair</button></div></div><div class="review-callout"><span class="review-callout-icon">${ic('shield-check', 'icon-sm')}</span><div>本頁只提供診斷與安全補寫，不會刪除表單資料。最近檢查時間：<strong>${esc(fmtTime(health.generatedAt))}</strong></div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('database')}</div><div class="stat-value">${health.totals.totalStores}</div><div class="stat-label">受管 Store</div></div><div class="stat-card closed"><div class="stat-icon">${ic('badge-check')}</div><div class="stat-value">${health.totals.healthy}</div><div class="stat-label">狀態正常</div></div><div class="stat-card pending"><div class="stat-icon">${ic('alert-triangle')}</div><div class="stat-value">${attentionCount}</div><div class="stat-label">待處理</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('paperclip')}</div><div class="stat-value">${attachmentHealth.totalAttachments}</div><div class="stat-label">附件總數</div></div></div><div class="review-grid"><div class="card review-table-card"><div class="card-header"><span class="card-title">Store 狀態明細</span><span class="review-card-subtitle">版本、格式與資料量一覽</span></div><div class="table-wrapper"><table><thead><tr><th>Store</th><th>狀態</th><th>版本</th><th>格式</th><th>內容摘要</th><th>筆數</th><th>容量</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="card review-history-card"><div class="card-header"><span class="card-title">待處理項目</span><span class="review-card-subtitle">優先處理格式損毀、待升級資料與孤兒附件</span></div><div class="review-history-list">${renderSchemaHealthIssueList(health.stores)}</div></div>${renderAttachmentHealthPanel(attachmentHealth)}</div></div>`;
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
      renderUnitReview,
      renderLoginLog,
      renderSchemaHealth
    };
  };
})();

