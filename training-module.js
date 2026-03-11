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
      buildUnitCascadeControl,
      initUnitCascade,
      trainingSelectOptionsHtml,
      getTrainingForm,
      getAllTrainingForms,
      getAllTrainingRosters,
      updateTrainingForm,
      addTrainingRosterPerson,
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
      getVisibleTrainingForms,
      isTrainingVisible,
      canEditTrainingForm,
      canUndoTrainingForm,
      getTrainingUndoRemainingMinutes,
      canDeleteTrainingEditableRow,
      getStoredTrainingProfessionalValue,
      exportTrainingSummaryCsv,
      exportTrainingDetailCsv,
      printTrainingSheet,
      parseTrainingRosterWorkbook,
      parseTrainingRosterImport,
      loadTrainingStore,
      saveTrainingStore,
      registerActionHandlers
    } = deps;
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

  function buildTrainingTableCard(title, subtitle, badgeText, headersHtml, rowsHtml) {
    const badge = badgeText ? '<span class="training-inline-status">' + badgeText + '</span>' : '';
    const subtitleHtml = subtitle ? '<div class="training-table-subtitle">' + subtitle + '</div>' : '';
    return '<div class="card training-table-card"><div class="card-header"><div><span class="card-title">' + title + '</span>' + subtitleHtml + '</div>' + badge + '</div>' + buildTrainingTableMarkup(headersHtml, rowsHtml) + '</div>';
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

  function renderTrainingBinaryButtons(field, value, index, disabled, yesLabel, noLabel) {
    const dis = disabled ? 'disabled' : '';
    const testIdBase = 'training-binary-' + toTestIdFragment(field || 'field') + '-' + index;
    return '<div class="training-binary-group" role="group">'
      + '<button type="button" class="training-binary-btn ' + (value === '是' ? 'is-active is-yes' : '') + '" data-testid="' + testIdBase + '-yes" data-idx="' + index + '" data-field="' + field + '" data-value="是" aria-label="' + esc(field + '-yes') + '" ' + dis + '>' + esc(yesLabel || '✓') + '</button>'
      + '<button type="button" class="training-binary-btn ' + (value === '否' ? 'is-active is-no' : '') + '" data-testid="' + testIdBase + '-no" data-idx="' + index + '" data-field="' + field + '" data-value="否" aria-label="' + esc(field + '-no') + '" ' + dis + '>' + esc(noLabel || '✕') + '</button>'
      + '</div>';
  }

  function handleTrainingUndo(id) {
    const form = getTrainingForm(id);
    const user = currentUser();
    if (!form || !user) return;
    if (!canUndoTrainingForm(form, user)) {
      toast('目前已無法撤回流程一，若需更正請由管理者退回', 'error');
      return;
    }
    const remainingMinutes = getTrainingUndoRemainingMinutes(form);
    if (!confirm('撤回後會回到可編修的草稿狀態，並中止後續簽核流程，確定要撤回嗎？')) return;
    const now = new Date().toISOString();
    updateTrainingForm(id, {
      status: TRAINING_STATUSES.DRAFT,
      updatedAt: now,
      stepOneSubmittedAt: null,
      printedAt: null,
      signoffUploadedAt: null,
      submittedAt: null,
      history: [...(form.history || []), {
        time: now,
        action: '填報人撤回流程一，重新開放編修（剩餘撤回時限 ' + remainingMinutes + ' 分鐘）',
        user: user.name
      }]
    });
    toast('已撤回流程一，您可以繼續修改填報內容', 'info');
    navigate('training-fill/' + id, { replace: true });
  }

  function handleTrainingReturn(id) {
    if (!isAdmin()) {
      toast('僅最高管理員可退回填報單', 'error');
      return;
    }
    const form = getTrainingForm(id);
    if (!form) return;
    if (form.status !== TRAINING_STATUSES.SUBMITTED) {
      toast('只有正式送出的填報單可以退回', 'error');
      return;
    }
    const reason = prompt('請輸入退回原因');
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast('退回原因不可空白', 'error');
      return;
    }
    const now = new Date().toISOString();
    updateTrainingForm(id, { status: TRAINING_STATUSES.RETURNED, returnReason: trimmed, updatedAt: now, history: [...(form.history || []), { time: now, action: '管理者退回更正：' + trimmed, user: currentUser().name }] });
    toast('已退回 ' + id + ' 供填報人更正', 'info');
    const route = getRoute();
    if (route.page === 'training-detail') renderTrainingDetail(id); else renderTraining();
  }

  function handleTrainingDeleteRoster(id) {
    if (!isAdmin()) {
      toast('僅管理者可刪除名單', 'error');
      return;
    }
    const roster = getAllTrainingRosters().find((row) => row.id === id);
    if (!roster) return;
    if (!confirm('確定刪除 ' + roster.unit + ' 的 ' + roster.name + ' 嗎？已填報的歷史資料不會被刪除。')) return;
    deleteTrainingRosterPerson(id);
    toast('名單已刪除', 'info');
    renderTrainingRoster();
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

  function renderTraining() {
    const visibleForms = getVisibleTrainingForms().slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const summary = {
      total: visibleForms.length,
      draft: visibleForms.filter((form) => form.status === TRAINING_STATUSES.DRAFT).length,
      pending: visibleForms.filter((form) => form.status === TRAINING_STATUSES.PENDING_SIGNOFF).length,
      submitted: visibleForms.filter((form) => form.status === TRAINING_STATUSES.SUBMITTED).length,
      returned: visibleForms.filter((form) => form.status === TRAINING_STATUSES.RETURNED).length
    };
    const toolbar = '<div class="training-toolbar-actions">'
      + (canFillTraining() ? '<a href="#training-fill" class="btn btn-primary">' + ic('plus-circle', 'icon-sm') + ' 新增填報</a>' : '')
      + (visibleForms.length ? '<button class="btn btn-secondary" id="training-export-all">' + ic('download', 'icon-sm') + ' 匯出 Excel</button>' : '')
      + (isAdmin() ? '<a href="#training-roster" class="btn btn-secondary">' + ic('users', 'icon-sm') + ' 名單管理</a>' : '')
      + '</div>';

    const buildFormActions = (form) => {
      if (!form) return canFillTraining() ? '<a href="#training-fill" class="btn btn-sm btn-primary">開始填報</a>' : '—';
      const actions = ['<a href="#training-detail/' + form.id + '" class="btn btn-sm btn-secondary">檢視</a>'];
      if (canEditTrainingForm(form)) actions.push('<a href="#training-fill/' + form.id + '" class="btn btn-sm btn-primary">編修</a>');
      if (canUndoTrainingForm(form)) actions.push('<button type="button" class="btn btn-sm btn-warning" data-action="training.undo" data-id="' + esc(form.id) + '">撤回流程一</button>');
      if (isAdmin() && form.status === TRAINING_STATUSES.SUBMITTED) actions.push('<button type="button" class="btn btn-sm btn-danger" data-action="training.return" data-id="' + esc(form.id) + '">退回更正</button>');
      return '<div class="training-table-actions">' + actions.join('') + '</div>';
    };

    let contentHtml = '';
    if (isAdmin()) {
      const allForms = getAllTrainingForms();
      const latestByUnit = getTrainingUnits().map((unit) => {
        const latest = allForms.filter((form) => form.unit === unit).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
        return {
          unit,
          latest,
          summary: latest ? (latest.summary || computeTrainingSummary(latest.records || [])) : computeTrainingSummary([])
        };
      }).sort((a, b) => a.unit.localeCompare(b.unit, 'zh-Hant'));

      const completedUnits = latestByUnit.filter((item) => item.latest && item.latest.status === TRAINING_STATUSES.SUBMITTED);
      const incompleteUnits = latestByUnit.filter((item) => !item.latest || item.latest.status !== TRAINING_STATUSES.SUBMITTED);
      const completedRows = completedUnits.length ? completedUnits.map((item) => '<tr>'
        + '<td>' + esc(item.latest.statsUnit || getTrainingStatsUnit(item.unit)) + '</td>'
        + '<td>' + esc(item.unit) + '</td>'
        + '<td>' + renderCopyIdCell(item.latest.id, '教育訓練編號', true) + '</td>'
        + '<td>' + esc(item.latest.fillerName || '—') + '</td>'
        + '<td>' + (item.summary.activeCount || 0) + '</td>'
        + '<td>' + (item.summary.completedCount || 0) + '</td>'
        + '<td>' + (item.summary.incompleteCount || 0) + '</td>'
        + '<td><span class="training-rate-pill">' + (item.summary.completionRate || 0) + '%</span></td>'
        + '<td>' + fmtTime(item.latest.submittedAt || item.latest.updatedAt) + '</td>'
        + '<td>' + buildFormActions(item.latest) + '</td>'
        + '</tr>').join('') : '<tr><td colspan="10"><div class="empty-state" style="padding:28px"><div class="empty-state-title">目前沒有已完成填報的單位</div></div></td></tr>';

      const incompleteRows = incompleteUnits.length ? incompleteUnits.map((item) => {
        const latest = item.latest;
        const statusText = latest ? trainingStatusBadge(latest.status) : '<span class="training-inline-status">尚未填報</span>';
        const note = !latest
          ? '尚未建立填報單'
          : (latest.status === TRAINING_STATUSES.PENDING_SIGNOFF
            ? '流程一已完成，待列印與上傳簽核表'
            : (latest.status === TRAINING_STATUSES.RETURNED ? ('退回原因：' + (latest.returnReason || '未提供')) : '尚在填寫中'));
        return '<tr>'
          + '<td>' + esc(item.unit) + '</td>'
          + '<td>' + statusText + '</td>'
          + '<td>' + (latest ? esc(latest.fillerName || '—') : '—') + '</td>'
          + '<td>' + (item.summary.activeCount || 0) + '</td>'
          + '<td>' + (item.summary.completedCount || 0) + '</td>'
          + '<td><span class="training-rate-pill">' + (item.summary.completionRate || 0) + '%</span></td>'
          + '<td>' + esc(note) + '</td>'
          + '<td>' + (latest ? fmtTime(latest.updatedAt) : '—') + '</td>'
          + '<td>' + buildFormActions(latest) + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="9"><div class="empty-state" style="padding:28px"><div class="empty-state-title">所有單位都已完成填報</div></div></td></tr>';

      contentHtml = '<div class="training-dashboard-sections">'
        + buildTrainingTableCard('已完成填報', '填報清單已併入此區，方便直接查看已完成資料與下載。', completedUnits.length + ' 個單位', '<th>統計單位</th><th>填報單位</th><th>編號</th><th>經辦人</th><th>單位總人數</th><th>已完成</th><th>未完成</th><th>達成比率</th><th>完成時間</th><th>操作</th>', completedRows)
        + buildTrainingTableCard('未完成填報', '包含尚未填報、暫存、退回更正與待簽核中的單位。', incompleteUnits.length + ' 個單位', '<th>填報單位</th><th>狀態</th><th>經辦人</th><th>單位總人數</th><th>已完成</th><th>達成比率</th><th>說明</th><th>最後更新</th><th>操作</th>', incompleteRows)
        + '</div>';
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

    document.getElementById('app').innerHTML = '<div class="animate-in training-dashboard-page">'
      + '<div class="page-header"><div><h1 class="page-title">資安教育訓練統計</h1><p class="page-subtitle">依流程一填報、流程二列印、流程三上傳簽核表完成整體申報；流程一送出後若尚未列印，可於 ' + TRAINING_UNDO_WINDOW_MINUTES + ' 分鐘內撤回。</p></div>' + toolbar + '</div>'
      + '<div class="stats-grid">'
      + buildTrainingOverviewStats(summary)
      + '</div>'
      + contentHtml
      + '</div>';

    document.getElementById('training-export-all')?.addEventListener('click', () => exportTrainingSummaryCsv(visibleForms));
    refreshIcons();
    bindCopyButtons();
  }

  function buildTrainingFillPage(params) {
    const { existing, isUnitLocked, submitLabel, takeoverDraft, unitValue, user } = params;
    return '<div class="animate-in">'
      + '<div class="page-header"><div><h1 class="page-title">填報資安教育訓練統計</h1><p class="page-subtitle">此頁為流程一：逐人填報教育訓練完成情形。送出後會先鎖定；若尚未列印簽核表，可於 ' + TRAINING_UNDO_WINDOW_MINUTES + ' 分鐘內撤回重新編修。</p></div><div class="training-toolbar-actions"><a href="#training" class="btn btn-secondary">← 返回列表</a></div></div>'
      + (existing && existing.status === TRAINING_STATUSES.RETURNED ? '<div class="training-return-banner">' + ic('alert-triangle', 'icon-sm') + ' 退回原因：' + esc(existing.returnReason || '未提供') + '</div>' : '')
      + (takeoverDraft ? '<div class="training-return-banner">' + ic('user-cog', 'icon-sm') + ' 此草稿原填報人為 ' + esc(existing.fillerName || '未指定') + '，本次儲存後將改由目前單位管理員 ' + esc(user.name) + ' 接手填報。</div>' : '')
      + '<div class="training-editor-layout">'
      + '<div class="card training-editor-card"><form id="training-form" data-testid="training-form">'
      + '<div class="form-feedback" id="training-feedback" data-state="idle" aria-live="polite" hidden></div>'
      + '<div class="section-header">' + ic('info', 'icon-sm') + ' 基本資訊</div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label form-required">統計單位（一級）</label><input type="text" class="form-input" id="tr-stats-unit" value="' + esc(existing?.statsUnit || getTrainingStatsUnit(unitValue)) + '" readonly></div><div class="form-group"><label class="form-label form-required">填報單位</label>' + buildUnitCascadeControl('tr-unit', unitValue, isUnitLocked, true) + '</div></div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label form-required">經辦人姓名</label><input type="text" class="form-input" value="' + esc(user.name) + '" readonly></div><div class="form-group"><label class="form-label form-required">聯絡電話</label><input type="text" class="form-input" id="tr-phone" value="' + esc(existing?.submitterPhone || '') + '" placeholder="例如 02-3366-0000 分機 12345" required></div><div class="form-group"><label class="form-label form-required">聯絡信箱</label><input type="email" class="form-input" id="tr-email" value="' + esc(existing?.submitterEmail || user.email || '') + '" placeholder="name@g.ntu.edu.tw" required></div></div>'
      + '<div class="form-row"><div class="form-group"><label class="form-label form-required">統計年度</label><input type="text" class="form-input" id="tr-year" value="' + esc(existing?.trainingYear || String(new Date().getFullYear() - 1911)) + '" required></div><div class="form-group"><label class="form-label form-required">填表日期</label><input type="date" class="form-input" id="tr-date" value="' + esc(existing?.fillDate || new Date().toISOString().split('T')[0]) + '" required></div><div class="form-group"><label class="form-label">說明</label><input type="text" class="form-input" value="流程一送出後會先鎖定；若尚未列印簽核表，可於短時間內撤回。" readonly></div></div>'
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

    const user = currentUser();
    const defaultTrainingYear = String(new Date().getFullYear() - 1911);
    const lockedUserUnit = getScopedUnit(user) || user.unit || '';
    if (!id && !isAdmin() && lockedUserUnit) {
      const duplicateDraft = findExistingTrainingFormForUnitYear(lockedUserUnit, defaultTrainingYear);
      if (duplicateDraft && isTrainingVisible(duplicateDraft)) {
        toast('本年度已存在填報單，請至列表繼續編輯或查看，勿重複新增。', 'error');
        navigate(canEditTrainingForm(duplicateDraft) ? ('training-fill/' + duplicateDraft.id) : ('training-detail/' + duplicateDraft.id));
        return;
      }
    }
    let existing = id ? getTrainingForm(id) : null;
    if (id && !existing) {
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

    const unitValue = existing ? existing.unit : (isAdmin() ? (user.unit || getTrainingUnits()[0] || '') : (getScopedUnit(user) || user.unit));
    const isUnitLocked = !!existing || !isAdmin();
    const takeoverDraft = !!(existing && existing.fillerUsername && existing.fillerUsername !== user.username && isUnitAdmin());
    let rowsState = mergeTrainingRows(unitValue, existing ? (existing.records || []) : []);
    const selectedKeys = new Set();
    let bulkGeneralValue = '';
    const submitLabel = existing && existing.status === TRAINING_STATUSES.RETURNED ? '完成更正並進入簽核' : '完成流程一並進入簽核';

    document.getElementById('app').innerHTML = buildTrainingFillPage({ existing, isUnitLocked, submitLabel, takeoverDraft, unitValue, user });

    const trainingForm = document.getElementById('training-form');
    const trainingFeedback = document.getElementById('training-feedback');
    const trainingDraftStatus = document.getElementById('training-draft-status');

    function getRowKey(row, index) {
      return row.rosterId ? ('roster:' + row.rosterId) : ('row:' + index + ':' + row.name);
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
      return rowsState.map((row, index) => ({ row, index })).filter(({ row }) => {
        const haystack = [row.name, row.unitName, row.identity, row.jobTitle].join(' ').toLowerCase();
        return (!keyword || haystack.includes(keyword))
          && (!focusOnly || !isTrainingRecordComplete(row) || !isTrainingRecordReadyForSubmit(row));
      });
    }

    function renderRows() {
      const body = document.getElementById('training-rows-body');
      const visibleRows = getFilteredRows();
      if (!rowsState.length) {
        body.innerHTML = buildTrainingEmptyTableRow(13, '此單位尚未建立名單', '請由管理者匯入名單，或由填報人新增名單外人員。', 28);
        renderSummary();
        updateBulkSelectionText();
        return;
      }
      if (!visibleRows.length) {
        body.innerHTML = buildTrainingEmptyTableRow(13, '沒有符合條件的人員', '請調整搜尋條件或取消「只看未完成或未填」。', 28);
        renderSummary();
        updateBulkSelectionText();
        return;
      }

      body.innerHTML = visibleRows.map(({ row, index }, visibleIndex) => buildTrainingFillRow({
        row,
        index,
        visibleIndex,
        key: getRowKey(row, index),
        selected: selectedKeys.has(getRowKey(row, index)),
        canDeleteRow: canDeleteTrainingEditableRow(row, existing, user)
      })).join('');

      body.querySelectorAll('.training-row-check').forEach((checkbox) => {
        checkbox.addEventListener('change', (event) => {
          const key = event.target.dataset.key;
          if (event.target.checked) selectedKeys.add(key); else selectedKeys.delete(key);
          updateBulkSelectionText();
        });
      });

      body.querySelectorAll('.training-row-select').forEach((element) => {
        element.addEventListener('change', (event) => {
          const row = rowsState[Number(event.target.dataset.idx)];
          const field = event.target.dataset.field;
          row[field] = event.target.value;
          if (field === 'status' && row.status !== '在職') {
            row.completedGeneral = '';
            row.isInfoStaff = '';
            row.completedProfessional = '';
          }
          if (field === 'isInfoStaff') row.completedProfessional = row.isInfoStaff === '否' ? '不適用' : '';
          rowsState[Number(event.target.dataset.idx)] = normalizeTrainingRecordRow(row, document.getElementById('tr-unit').value);
          renderRows();
        });
      });

      body.querySelectorAll('.training-row-meta').forEach((element) => {
        element.addEventListener('input', (event) => {
          const idx = Number(event.target.dataset.idx);
          const field = event.target.dataset.field;
          if (!rowsState[idx] || !field) return;
          rowsState[idx][field] = event.target.value;
        });
        element.addEventListener('change', (event) => {
          const idx = Number(event.target.dataset.idx);
          const field = event.target.dataset.field;
          if (!rowsState[idx] || !field) return;
          rowsState[idx] = normalizeTrainingRecordRow({ ...rowsState[idx], [field]: event.target.value }, document.getElementById('tr-unit').value);
          persistEditableRosterRow(rowsState[idx]);
        });
      });

      body.querySelectorAll('.training-row-note').forEach((element) => {
        element.addEventListener('input', (event) => {
          rowsState[Number(event.target.dataset.idx)].note = event.target.value;
        });
      });

      body.querySelectorAll('.training-binary-btn[data-field]').forEach((button) => {
        button.addEventListener('click', () => {
          const idx = Number(button.dataset.idx);
          const row = rowsState[idx];
          if (!row) return;
          const field = button.dataset.field;
          const value = button.dataset.value;
          row[field] = row[field] === value ? '' : value;
          if (field === 'completedProfessional' && row.isInfoStaff !== '是') row.completedProfessional = row.isInfoStaff === '否' ? '不適用' : '';
          rowsState[idx] = normalizeTrainingRecordRow(row, document.getElementById('tr-unit').value);
          renderRows();
        });
      });

      body.querySelectorAll('.training-row-delete').forEach((button) => {
        button.addEventListener('click', () => {
          const idx = Number(button.dataset.idx);
          const row = rowsState[idx];
          if (!row) return;
          if (!canDeleteTrainingEditableRow(row, existing, user)) {
            toast('目前只能刪除自己手動新增的人員', 'error');
            return;
          }
          if (!confirm('確定刪除「' + row.name + '」嗎？這會一併從此單位名單移除。')) return;
          if (row.rosterId) deleteTrainingRosterPerson(row.rosterId);
          rowsState = rowsState.filter((_, rowIndex) => rowIndex !== idx);
          selectedKeys.clear();
          renderRows();
          toast('已刪除「' + row.name + '」');
        });
      });

      const visibleKeys = visibleRows.map(({ row, index }) => getRowKey(row, index));
      const allVisibleSelected = visibleKeys.length && visibleKeys.every((key) => selectedKeys.has(key));
      document.getElementById('training-select-all').checked = !!allVisibleSelected;
      renderSummary();
      updateBulkSelectionText();
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
      if (!email) return { message: '請填寫聯絡信箱', field: document.getElementById('tr-email') };
      if (!/^.+@.+\..+$/.test(email)) return { message: '聯絡信箱格式不正確', field: document.getElementById('tr-email') };
      if (!year) return { message: '請填寫統計年度', field: document.getElementById('tr-year') };
      if (!fillDate) return { message: '請填寫填表日期', field: document.getElementById('tr-date') };
      if (!records.length) return { message: '至少需要一筆受訓人員資料', field: document.getElementById('training-add-person') };
      const invalid = records.find((record) => !isTrainingRecordReadyForSubmit(record));
      if (invalid) return { message: '請先完成 ' + (invalid.name || '受訓人員') + ' 的訓練欄位', field: document.getElementById('training-rows-body') };
      return null;
    }

    function saveTrainingForm(targetStatus) {
      const now = new Date().toISOString();
      const currentUnit = document.getElementById('tr-unit').value;
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
      if (takeoverDraft) history.push({ time: now, action: '單位管理員接手編修草稿，填報人改為目前編修者', user: user.name });
      history.push({ time: now, action: targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF ? '完成流程一並鎖定填報內容' : '儲存教育訓練統計暫存', user: user.name });
      upsertTrainingForm({
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
      });
      existing = getTrainingForm(formId) || existing;
      updateTrainingDraftStatus(existing);
      if (targetStatus === TRAINING_STATUSES.PENDING_SIGNOFF) {
        toast('填報單 ' + formId + ' 已完成流程一並鎖定');
        navigate('training-detail/' + formId);
        return;
      }
      toast('填報單 ' + formId + ' 已儲存暫存');
      navigate('training-fill/' + formId, { replace: true });
    }

    document.getElementById('training-save-draft').addEventListener('click', () => saveTrainingForm(TRAINING_STATUSES.DRAFT));
    trainingForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveTrainingForm(TRAINING_STATUSES.PENDING_SIGNOFF);
    });
    document.getElementById('training-search').addEventListener('input', renderRows);
    document.getElementById('training-only-focus').addEventListener('change', renderRows);
    trainingForm.addEventListener('input', clearTrainingFeedback);
    trainingForm.addEventListener('change', clearTrainingFeedback);
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
        return normalizeTrainingRecordRow(nextRow, document.getElementById('tr-unit').value);
      });
      toast('已套用批次設定');
      renderRows();
    });

    document.getElementById('training-add-person').addEventListener('click', () => {
      const currentUnit = document.getElementById('tr-unit').value;
      const payload = {
        name: document.getElementById('tr-new-name').value.trim(),
        unitName: document.getElementById('tr-new-unit-name').value.trim() || getTrainingJobUnit(currentUnit),
        identity: document.getElementById('tr-new-identity').value.trim(),
        jobTitle: document.getElementById('tr-new-job-title').value.trim()
      };
      if (!payload.name) {
        toast('請輸入要新增的人員姓名', 'error');
        return;
      }
      const result = addTrainingRosterPerson(currentUnit, payload, 'manual', user);
      if (!result.added && !result.updated) {
        toast(result.reason, 'error');
        return;
      }
      rowsState = mergeTrainingRows(currentUnit, rowsState);
      selectedKeys.clear();
      ['tr-new-name', 'tr-new-unit-name', 'tr-new-identity', 'tr-new-job-title'].forEach((idName) => {
        document.getElementById(idName).value = '';
      });
      renderRows();
      toast(result.updated ? result.reason : ('已新增「' + payload.name + '」到名單'));
    });

    initUnitCascade('tr-unit', unitValue, { disabled: isUnitLocked });
    if (!isUnitLocked) {
      document.getElementById('tr-unit').addEventListener('change', (event) => {
        syncStatsUnitField(event.target.value);
        rowsState = mergeTrainingRows(event.target.value, rowsState);
        selectedKeys.clear();
        renderRows();
      });
    }

    syncStatsUnitField(unitValue);
    updateTrainingDraftStatus(existing);
    clearTrainingFeedback();
    renderRows();
    refreshIcons();
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

    const user = currentUser();
    const canManage = !!user && !isViewer(user) && (user.role === ROLES.ADMIN || hasUnitAccess(form.unit, user) || form.fillerUsername === user.username);
    const canUndo = canUndoTrainingForm(form, user);
    const undoRemainingMinutes = canUndo ? getTrainingUndoRemainingMinutes(form) : 0;
    let filesState = [...(form.signedFiles || [])];
    const summary = form.summary || computeTrainingSummary(form.records || []);
    const detailRows = buildTrainingDetailRows(form.records || []);
    const timeline = (form.history || []).slice().reverse().map((item) => '<div class="timeline-item"><div class="timeline-time">' + fmtTime(item.time) + '</div><div class="timeline-text">' + esc(item.action) + ' · ' + esc(item.user || '系統') + '</div></div>').join('') || '<div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無歷程紀錄</div></div>';
    const actions = ['<button type="button" class="btn btn-secondary" id="training-export-detail">' + ic('download', 'icon-sm') + ' 匯出 Excel</button>', '<button type="button" class="btn btn-secondary" id="training-print-detail">' + ic('printer', 'icon-sm') + ' 列印簽核表</button>', '<a href="#training" class="btn btn-secondary">← 返回列表</a>'];
    if (canEditTrainingForm(form)) actions.unshift('<a href="#training-fill/' + form.id + '" class="btn btn-primary">' + ic('edit-3', 'icon-sm') + ' 繼續填報</a>');
    if (canUndo) actions.unshift('<button type="button" class="btn btn-warning" id="training-undo-step-one">' + ic('rotate-ccw', 'icon-sm') + ' 撤回流程一</button>');
    if (isAdmin() && form.status === TRAINING_STATUSES.SUBMITTED) actions.unshift('<button type="button" class="btn btn-danger" data-action="training.return" data-id="' + esc(form.id) + '">' + ic('corner-up-left', 'icon-sm') + ' 退回更正</button>');

    const stepCards = buildTrainingStepCards([
      ['流程一', '依人員填報教育訓練完成情形', form.stepOneSubmittedAt ? '已完成並鎖定' : '待完成', form.stepOneSubmittedAt ? (canUndo ? ('可於剩餘 ' + undoRemainingMinutes + ' 分鐘內撤回；列印簽核表後將不可撤回') : fmtTime(form.stepOneSubmittedAt)) : '完成後才可進入簽核'],
      ['流程二', '列印簽核表', form.printedAt ? '已列印' : (form.status === TRAINING_STATUSES.DRAFT || form.status === TRAINING_STATUSES.RETURNED ? '待流程一完成' : '待列印'), form.printedAt ? fmtTime(form.printedAt) : '請列印後交主管簽核'],
      ['流程三', '上傳簽核掃描檔', form.status === TRAINING_STATUSES.SUBMITTED ? '已完成填報' : ((filesState.length || form.signoffUploadedAt) ? '已上傳，待完成送件' : '待上傳'), form.status === TRAINING_STATUSES.SUBMITTED ? fmtTime(form.submittedAt || form.updatedAt) : (form.signoffUploadedAt ? fmtTime(form.signoffUploadedAt) : '上傳後完成整體流程')]
    ]);

    const uploadSection = (form.status === TRAINING_STATUSES.PENDING_SIGNOFF && canManage)
      ? '<div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">流程三：上傳簽核掃描檔</span></div><div class="upload-zone" id="training-upload-zone"><input type="file" id="training-file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">' + ic('folder-open') + '</div><div class="upload-zone-text">拖曳檔案或 <strong>點此選擇</strong></div><div class="upload-zone-hint">支援 JPG / PNG / PDF，單檔上限 5MB</div></div><div class="file-preview-list training-signoff-files" id="training-file-previews"></div><div class="form-actions"><button type="button" class="btn btn-primary" id="training-finalize-submit">' + ic('check-circle-2', 'icon-sm') + ' 完成流程三並正式結束填報</button></div></div>'
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
        { label: '聯絡信箱', value: form.submitterEmail || '—' },
        { label: '整體完成時間', value: form.submittedAt ? fmtTime(form.submittedAt) : '—' }
      ]))
      + buildTrainingCard('簽核掃描檔', '<div class="file-preview-list training-signoff-files" id="training-signed-files-readonly"></div>')
      + '</div>'
      + uploadSection
      + buildTrainingCard('逐人明細', buildTrainingTableMarkup('<th>姓名</th><th>本職單位</th><th>身分別</th><th>職稱</th><th>在職狀態</th><th>' + TRAINING_GENERAL_LABEL + '</th><th>' + TRAINING_INFO_STAFF_LABEL + '</th><th>' + TRAINING_PROFESSIONAL_LABEL + '</th><th>判定</th><th>備註</th>', detailRows), { style: 'margin-top:20px;padding:0;overflow:hidden', headerStyle: 'padding:16px 20px' })
      + buildTrainingCard('歷程紀錄', '<div class="timeline">' + timeline + '</div>', { style: 'margin-top:20px' })
      + '</div>';

    function renderSignedFiles(targetId, editable) {
      const wrap = document.getElementById(targetId);
      if (!wrap) return;
      wrap.innerHTML = filesState.length ? filesState.map((file, index) => {
        const preview = file.type && file.type.startsWith('image/')
          ? '<img src="' + file.data + '" alt="' + esc(file.name) + '">'
          : '<div class="file-pdf-icon">' + ic('file-box') + '</div>';
        const actionsHtml = '<div class="training-file-actions"><a class="btn btn-sm btn-secondary" href="' + file.data + '" target="_blank" rel="noopener">預覽</a><a class="btn btn-sm btn-secondary" href="' + file.data + '" download="' + esc(file.name) + '">下載</a>' + (editable ? '<button type="button" class="btn btn-sm btn-danger training-file-remove" data-idx="' + index + '">移除</button>' : '') + '</div>';
        return '<div class="file-preview-item training-file-card">' + preview + '<div class="file-name">' + esc(file.name) + '</div>' + actionsHtml + '</div>';
      }).join('') : '<p style="color:var(--text-muted);font-size:.88rem">尚未上傳簽核掃描檔</p>';
      wrap.querySelectorAll('.training-file-remove').forEach((button) => {
        button.addEventListener('click', () => {
          filesState.splice(Number(button.dataset.idx), 1);
          const targetInput = document.getElementById('training-file-input');
          if (targetInput) targetInput.value = '';
          renderSignedFiles(targetId, true);
          renderSignedFiles('training-signed-files-readonly', false);
        });
      });
      refreshIcons();
    }

    function handleFiles(files) {
      Array.from(files).forEach((file) => {
        if (file.size > 5 * 1024 * 1024) {
          toast('「' + file.name + '」超過 5MB', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          filesState.push({ name: file.name, type: file.type, data: evt.target.result });
          renderSignedFiles('training-file-previews', true);
          renderSignedFiles('training-signed-files-readonly', false);
        };
        reader.readAsDataURL(file);
      });
      const targetInput = document.getElementById('training-file-input');
      if (targetInput) targetInput.value = '';
    }

    document.getElementById('training-export-detail')?.addEventListener('click', () => exportTrainingDetailCsv(form));
    document.getElementById('training-undo-step-one')?.addEventListener('click', () => handleTrainingUndo(form.id));
    document.getElementById('training-print-detail')?.addEventListener('click', () => {
      if (form.status === TRAINING_STATUSES.PENDING_SIGNOFF && !form.printedAt) {
        const now = new Date().toISOString();
        updateTrainingForm(form.id, { printedAt: now, updatedAt: now, history: [...(form.history || []), { time: now, action: '列印簽核表', user: currentUser().name }] });
        form.printedAt = now;
      }
      printTrainingSheet(form);
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
      document.getElementById('training-finalize-submit').addEventListener('click', () => {
        if (!filesState.length) {
          toast('請先上傳簽核掃描檔', 'error');
          return;
        }
        const now = new Date().toISOString();
        const latestForm = getTrainingForm(form.id) || form;
        updateTrainingForm(form.id, {
          status: TRAINING_STATUSES.SUBMITTED,
          signedFiles: filesState,
          signoffUploadedAt: now,
          submittedAt: now,
          updatedAt: now,
          history: [...(latestForm.history || []), { time: now, action: '上傳簽核掃描檔並完成整體填報', user: currentUser().name }]
        });
        toast('已完成流程三，整體填報結束');
        renderTrainingDetail(form.id);
      });
      renderSignedFiles('training-file-previews', true);
    }
    renderSignedFiles('training-signed-files-readonly', false);
    refreshIcons();
    bindCopyButtons();
  }

  function buildTrainingRosterRows(rosters) {
    if (!rosters.length) return '<tr><td colspan="10"><div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無名單資料</div></div></td></tr>';
    return rosters.map((row) => '<tr><td>' + esc(row.statsUnit || getTrainingStatsUnit(row.unit)) + '</td><td>' + esc(row.unit) + '</td><td>' + esc(row.name) + '</td><td>' + esc(row.unitName || '—') + '</td><td>' + esc(row.identity || '—') + '</td><td>' + esc(row.jobTitle || '—') + '</td><td>' + (row.source === 'import' ? '管理者匯入' : '填報新增') + '</td><td>' + esc(row.createdBy || '') + '</td><td>' + fmtTime(row.createdAt) + '</td><td><button type="button" class="btn btn-sm btn-danger" data-testid="training-roster-delete-' + esc(row.id) + '" data-action="training.deleteRoster" data-id="' + esc(row.id) + '">' + ic('trash-2', 'btn-icon-svg') + '</button></td></tr>').join('');
  }

  function buildTrainingRosterPage(summary, rowsHtml) {
    return '<div class="animate-in">'
      + '<div class="page-header"><div><h1 class="page-title">教育訓練名單管理</h1><p class="page-subtitle">可依單位匯入正式名單；填報人只能新增名單外人員，不能刪除原名單。</p></div><a href="#training" class="btn btn-secondary">← 返回統計</a></div>'
      + '<div class="stats-grid">'
      + '<div class="stat-card total"><div class="stat-icon">' + ic('users') + '</div><div class="stat-value">' + summary.total + '</div><div class="stat-label">總名單筆數</div></div>'
      + '<div class="stat-card closed"><div class="stat-icon">' + ic('download') + '</div><div class="stat-value">' + summary.imported + '</div><div class="stat-label">管理者匯入</div></div>'
      + '<div class="stat-card pending"><div class="stat-icon">' + ic('user-plus') + '</div><div class="stat-value">' + summary.manual + '</div><div class="stat-label">填報新增</div></div>'
      + '</div>'
      + buildTrainingRosterImportCard()
      + '<div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>統計單位</th><th>填報單位</th><th>姓名</th><th>本職單位</th><th>身分別</th><th>職稱</th><th>來源</th><th>建立者</th><th>建立時間</th><th>操作</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div></div>'
      + '</div>';
  }

  function buildTrainingRosterImportCard() {
    return '<div class="card training-editor-card" style="margin-bottom:20px"><form id="training-import-form"><div class="section-header">' + ic('upload', 'icon-sm') + ' 匯入單位名單</div><div class="training-editor-note">支援 Excel 檔（`.xlsx` / `.xls`）匯入，也可直接貼上 CSV / TSV。預設欄位：姓名、本職單位、身分別、職稱；若檔案已含「填報單位」欄位，也會自動分流到對應單位。</div><div class="form-row"><div class="form-group"><label class="form-label">單位</label>' + buildUnitCascadeControl('training-import-unit', '', false, false) + '<div class="form-hint">可先指定單位當作預設值；若 Excel 內已有「填報單位」欄位，系統會優先使用檔案中的單位。</div></div><div class="form-group"><label class="form-label">Excel 檔案</label><label class="training-file-input"><input type="file" id="training-import-file" accept=".xlsx,.xls,.csv,.tsv"><span class="training-file-input-copy" id="training-import-file-copy"><strong>選擇 Excel / CSV 檔</strong><small>支援 `.xlsx`、`.xls`、`.csv`、`.tsv`</small></span></label></div></div><div class="form-group"><label class="form-label">格式範例</label><textarea class="form-textarea" rows="4" readonly>姓名,本職單位,身分別,職稱\n王小明,資訊網路組,職員,工程師\n陳小華,資訊網路組,委外,駐點工程師</textarea></div><div class="form-group"><label class="form-label">或直接貼上內容</label><textarea class="form-textarea" id="training-import-names" rows="8" placeholder="姓名,本職單位,身分別,職稱"></textarea></div><div class="form-actions"><button type="submit" class="btn btn-primary" data-testid="training-import-submit">' + ic('upload', 'icon-sm') + ' 匯入名單</button></div></form></div>';
  }

  async function renderTrainingRoster() {
    if (!isAdmin()) {
      navigate('training');
      toast('僅管理者可管理名單', 'error');
      return;
    }

    const rosters = getAllTrainingRosters().slice().sort((a, b) => {
      if (a.unit === b.unit) return a.name.localeCompare(b.name, 'zh-Hant');
      return a.unit.localeCompare(b.unit, 'zh-Hant');
    });
    const summary = {
      total: rosters.length,
      imported: rosters.filter((row) => row.source === 'import').length,
      manual: rosters.filter((row) => row.source === 'manual').length
    };
    const rows = buildTrainingRosterRows(rosters);
    document.getElementById('app').innerHTML = buildTrainingRosterPage(summary, rows);

    initUnitCascade('training-import-unit', '', { disabled: false });
    const fileInput = document.getElementById('training-import-file');
    const fileCopy = document.getElementById('training-import-file-copy');
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileCopy.innerHTML = file
        ? '<strong>' + esc(file.name) + '</strong><small>已選取檔案，送出後將直接匯入</small>'
        : '<strong>選擇 Excel / CSV 檔</strong><small>支援 `.xlsx`、`.xls`、`.csv`、`.tsv`</small>';
    });
    document.getElementById('training-import-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const unit = document.getElementById('training-import-unit').value;
      const raw = document.getElementById('training-import-names').value;
      const file = fileInput.files[0];
      let entries = [];
      if (file) {
        try {
          entries = await parseTrainingRosterWorkbook(file, unit);
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
      entries.forEach((entry) => {
        const targetUnit = String(entry.unit || unit || '').trim();
        const result = addTrainingRosterPerson(targetUnit, { ...entry, unit: targetUnit }, 'import', currentUser());
        if (result.added) added += 1;
        else if (result.updated) updated += 1;
        else skipped += 1;
      });
      toast('匯入完成：新增 ' + added + ' 筆、更新 ' + updated + ' 筆、略過 ' + skipped + ' 筆');
      renderTrainingRoster();
    });

    refreshIcons();
  }

  function seedTrainingData() {
    const store = loadTrainingStore();
    if (store.rosters.length > 0) return;
    const now = new Date().toISOString();
    const seen = new Set();
    getUsers().filter((user) => user.role !== ROLES.ADMIN && user.role !== ROLES.VIEWER).forEach((user) => {
      getAuthorizedUnits(user).forEach((unit) => {
        const key = (unit + '::' + user.name).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const row = normalizeTrainingRosterRow({
          id: 'RST-' + String(store.nextRosterId).padStart(4, '0'),
          unit,
          name: user.name,
          unitName: getTrainingJobUnit(unit),
          identity: user.role === ROLES.UNIT_ADMIN ? '單位管理員' : '填報人',
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
      seedTrainingData
    };
  };
})();
