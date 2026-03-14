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
      canEditChecklist,
      findExistingChecklistForUnitYear,
      getChecklist,
      getLatestEditableChecklistDraft,
      canAccessChecklist,
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
      renderCopyIdButton
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

    function buildChecklistEvidenceUpload(item, saved) {
      const existingCount = getChecklistEvidenceFiles(saved).length;
      return `<div class="form-group cl-evidence-upload-group"><label class="form-label">佐證附件</label><label class="training-file-input checklist-file-input"><input type="file" id="cl-file-${item.id}" data-item-id="${item.id}" multiple accept="image/*,.pdf"><span class="training-file-input-copy"><strong>選擇佐證附件</strong><small>${existingCount ? `目前已附 ${existingCount} 份檔案` : '支援 JPG / PNG / PDF，每檔 5MB 內'}</small></span></label>${buildChecklistEvidencePreviewSlot(item.id, 'checklist-evidence-files')}</div>`;
    }

  function renderChecklistList() {
    Promise.resolve(syncChecklistsFromM365({ silent: true })).catch(function () { });
    const checklists = getVisibleChecklists();
    const fillBtn = canFillChecklist() ? `<a href="#checklist-fill" class="btn btn-primary">${ic('edit-3', 'icon-sm')} 填報檢核表</a>` : '';
    const rows = checklists.length ? checklists.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(c => {
      const rate = c.summary.total > 0 ? Math.round(c.summary.conform / c.summary.total * 100) : 0;
      const statusCls = normalizeChecklistStatus(c.status) === CHECKLIST_STATUS_SUBMITTED ? 'badge-closed' : 'badge-pending';
      const target = isChecklistDraftStatus(c.status) && canEditChecklist(c) ? `checklist-fill/${c.id}` : `checklist-detail/${c.id}`;
      return `<tr data-route="${target}"><td class="record-id-col">${renderCopyIdCell(c.id, '檢核表編號', true)}</td><td>${esc(c.unit)}</td><td>${esc(c.fillerName)}</td><td>${esc(c.auditYear)} 年</td><td><span class="badge ${statusCls}"><span class="badge-dot"></span>${c.status}</span></td><td><div class="cl-rate-bar"><div class="cl-rate-fill" style="width:${rate}%"></div></div><span class="cl-rate-text">${rate}%</span></td><td>${fmt(c.fillDate)}</td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty-state" style="padding:60px"><div class="empty-state-icon">${ic('clipboard-list')}</div><div class="empty-state-title">目前沒有檢核表</div><div class="empty-state-desc">可以先建立新的檢核表草稿，或等待其他填報者送出後再查看。</div></div></td></tr>`;
    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">內稽檢核表</h1><p class="page-subtitle">查看各單位檢核表填報狀況，並可直接進入草稿編修或檢視明細。</p></div>${fillBtn}</div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th class="record-id-head">編號</th><th>受稽單位</th><th>填報人員</th><th>稽核年度</th><th>狀態</th><th>完成率</th><th>填報日期</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
    bindCopyButtons();
  }

  // Render: Checklist Fill
  function buildChecklistItemBlock(item, saved) {
    const radios = COMPLIANCE_OPTS.map((opt) => `<label class="cl-radio-label cl-radio-${COMPLIANCE_CLASSES[opt]}"><input type="radio" name="cl-${item.id}" value="${opt}" ${saved.compliance === opt ? 'checked' : ''}><span class="cl-radio-indicator"></span>${opt}</label>`).join('');
    return `<div class="cl-item" id="cl-item-${item.id}">
      <div class="cl-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span></div>
      <div class="cl-item-body">
        <div class="cl-compliance"><label class="form-label form-required">\u7b26\u5408\u7a0b\u5ea6</label><div class="cl-radio-group">${radios}</div></div>
        <div class="cl-fields">
          <div class="form-group"><label class="form-label">\u57f7\u884c\u60c5\u5f62\u8aaa\u660e</label><textarea class="form-textarea cl-textarea" id="cl-exec-${item.id}" placeholder="${esc(item.hint)}" rows="2">${esc(saved.execution || '')}</textarea></div>
          <div class="form-group"><label class="form-label">\u4f50\u8b49\u8cc7\u6599\u8aaa\u660e</label><textarea class="form-textarea cl-textarea" id="cl-evidence-${item.id}" placeholder="\u4f8b\u5982\u6587\u4ef6\u540d\u7a31\u3001\u756b\u9762\u622a\u5716\u3001\u8def\u5f91\u6216\u88dc\u5145\u8aaa\u660e" rows="2">${esc(saved.evidence || '')}</textarea></div>
          ${buildChecklistEvidenceUpload(item, saved)}
        </div>
      </div>
    </div>`;
  }
  function buildChecklistSectionsHtml(existing) {
    return getChecklistSectionsState().map((sec, si) => {
      const itemsHtml = sec.items.map((item) => buildChecklistItemBlock(item, existing?.results?.[item.id] || {})).join('');
      return `<div class="cl-section"><div class="cl-section-header"><span class="cl-section-num">${si + 1}</span>${esc(sec.section)}</div><div class="cl-section-body">${itemsHtml}</div></div>`;
    }).join('');
  }

  function renderChecklistFill(id) {
    cleanupRenderedAttachmentUrls();
    if (!canFillChecklist()) { navigate('checklist'); toast('\u60a8\u6c92\u6709\u586b\u5831\u6aa2\u6838\u8868\u6b0a\u9650', 'error'); return; }

    const u = currentUser();
    const currentAuditYear = String(new Date().getFullYear() - 1911);
    const defaultScopedUnit = getScopedUnit(u) || u.unit || '';
    if (!id && u.role !== ROLES.ADMIN && defaultScopedUnit && getAuthorizedUnits(u).length <= 1) {
      const duplicateChecklist = findExistingChecklistForUnitYear(defaultScopedUnit, currentAuditYear);
      if (duplicateChecklist) {
        toast('已存在相同單位與年度的檢核表草稿，系統將直接帶您前往該筆紀錄。', 'error');
        clearUnsavedChangesGuard();
        navigate(canEditChecklist(duplicateChecklist) ? ('checklist-fill/' + duplicateChecklist.id) : ('checklist-detail/' + duplicateChecklist.id));
        return;
      }
    }
    let existing = id ? getChecklist(id) : getLatestEditableChecklistDraft();
    if (id && !existing) { navigate('checklist'); toast('\u627e\u4e0d\u5230\u8981\u7de8\u4fee\u7684\u6aa2\u6838\u8868', 'error'); return; }
    if (existing && !canEditChecklist(existing)) { navigate('checklist'); toast('\u9019\u4efd\u6aa2\u6838\u8868\u76ee\u524d\u4e0d\u53ef\u4fee\u6539', 'error'); return; }

    const sectionsHtml = buildChecklistSectionsHtml(existing);

    const checklistUnitLocked = u.role === ROLES.REPORTER;
    const selectedUnit = checklistUnitLocked ? (getScopedUnit(u) || existing?.unit || '') : (existing ? existing.unit : (getScopedUnit(u) || u.unit || ''));
    const today = new Date().toISOString().split('T')[0];
    const totalItems = getChecklistSectionsState().reduce((sum, sec) => sum + sec.items.length, 0);
    const supervisorName = existing?.supervisorName || existing?.supervisor || '';
    const supervisorTitle = existing?.supervisorTitle || '';
    const signStatus = existing?.signStatus || '待簽核';
    const signDate = existing?.signDate || '';
    const supervisorNote = existing?.supervisorNote || '';

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">${existing ? '編修檢核表' : '填報檢核表'}</h1><p class="page-subtitle">受稽單位預設帶入目前登入單位，但可依實際填報需求切換到其他單位。草稿可隨時暫存，正式送出後鎖定。</p></div><a href="#checklist" class="btn btn-secondary">返回列表</a></div>
      <div class="editor-shell editor-shell--checklist">
        <section class="editor-main">
          <div class="card editor-card"><form id="checklist-form" data-testid="checklist-form">
            <div class="section-header">${ic('info', 'icon-sm')} 基本資料</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">受稽單位</label>${buildUnitCascadeControl('cl-unit', selectedUnit, checklistUnitLocked, true)}</div>
              <div class="form-group"><label class="form-label form-required">填報人員</label><input type="text" class="form-input" id="cl-filler" value="${esc(u.name)}" readonly></div>
              <div class="form-group"><label class="form-label form-required">填報日期</label><input type="date" class="form-input" id="cl-date" value="${existing ? esc(existing.fillDate) : today}" required></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">稽核年度</label><input type="text" class="form-input" id="cl-year" value="${existing ? esc(existing.auditYear) : String(new Date().getFullYear() - 1911)}" required></div>
              <div class="form-group"><label class="form-label form-required">\u6b0a\u8cac\u4e3b\u7ba1\u59d3\u540d</label><input type="text" class="form-input" id="cl-supervisor-name" value="${esc(supervisorName)}" placeholder="\u4f8b\u5982 \u8cc7\u8a0a\u7db2\u8def\u7d44\u7d44\u9577" required></div>
              <div class="form-group"><label class="form-label form-required">\u4e3b\u7ba1\u8077\u7a31</label><input type="text" class="form-input" id="cl-supervisor-title" value="${esc(supervisorTitle)}" placeholder="\u4f8b\u5982 \u7d44\u9577 / \u4e3b\u4efb" required></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">\u7c3d\u6838\u72c0\u614b</label><select class="form-select" id="cl-sign-status" required><option value="\u5f85\u7c3d\u6838" ${signStatus === '\u5f85\u7c3d\u6838' ? 'selected' : ''}>\u5f85\u7c3d\u6838</option><option value="\u5df2\u7c3d\u6838" ${signStatus === '\u5df2\u7c3d\u6838' ? 'selected' : ''}>\u5df2\u7c3d\u6838</option></select></div>
              <div class="form-group"><label class="form-label form-required">\u7c3d\u6838\u65e5\u671f</label><input type="date" class="form-input" id="cl-sign-date" required value="${esc(signDate)}"></div>
              <div class="form-group"><label class="form-label">簽核備註</label><input type="text" class="form-input" id="cl-supervisor-note" value="${esc(supervisorNote)}" placeholder="可補充主管意見或追蹤說明"></div>
            </div>
            <div class="cl-progress-bar-wrap"><div class="cl-progress-label">填報進度</div><div class="cl-progress-bar"><div class="cl-progress-fill" id="cl-progress-fill" style="width:0%"></div></div><span class="cl-progress-text" id="cl-progress-text">0 / ${totalItems}</span></div>
            <div class="cl-draft-status" id="cl-draft-status">${existing && isChecklistDraftStatus(existing.status) ? `\u8349\u7a3f\u4e0a\u6b21\u5132\u5b58\uff1a${fmtTime(existing.updatedAt || existing.createdAt)}` : '\u5c1a\u672a\u5efa\u7acb\u8349\u7a3f'}</div>
            ${sectionsHtml}
            <div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 正式送出檢核表</button><button type="button" class="btn btn-secondary" id="cl-save-draft" data-testid="checklist-save-draft">${ic('save', 'icon-sm')} 暫存草稿</button><a href="#checklist" class="btn btn-ghost">取消返回</a></div>
          </form></div>
        </section>
        <aside class="editor-aside">
          <div class="editor-sticky">
            <div class="editor-side-card editor-progress-card">
              <div class="editor-side-kicker">Checklist Progress</div>
              <div class="editor-side-title">即時進度</div>
              <div class="editor-progress-meta"><div class="editor-progress-value" id="cl-side-progress-value">0%</div><div class="editor-progress-caption" id="cl-side-progress-text">已完成 0 / ${totalItems}</div></div>
              <div class="editor-progress-track"><div class="editor-progress-fill" id="cl-side-progress-fill" style="width:0%"></div></div>
              <div class="editor-stat-grid">
                <div class="editor-stat-pill"><span class="editor-stat-pill-label">待完成項目</span><strong class="editor-stat-pill-value" id="cl-side-remaining">${totalItems}</strong></div>
                <div class="editor-stat-pill"><span class="editor-stat-pill-label">稽核年度</span><strong class="editor-stat-pill-value" id="cl-side-year">${existing ? esc(existing.auditYear) : String(new Date().getFullYear() - 1911)}</strong></div>
              </div>
              <div class="editor-summary-list">
                <div class="editor-summary-item"><span>受稽單位</span><strong id="cl-side-unit">${esc(selectedUnit || '—')}</strong></div>
                <div class="editor-summary-item"><span>填報日期</span><strong id="cl-side-date">${fmt(existing ? existing.fillDate : today)}</strong></div>
                <div class="editor-summary-item"><span>簽核狀態</span><strong id="cl-side-sign-status">${esc(signStatus)}</strong></div>
              </div>
              <button type="button" class="btn btn-secondary checklist-draft-inline" id="cl-save-draft-inline" data-testid="checklist-save-draft-inline">${ic('save', 'icon-sm')} 立即暫存草稿</button>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">判定統計</div>
              <div class="editor-legend-list">
                <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--green"></span>符合</span><strong id="cl-side-conform">0</strong></div>
                <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--amber"></span>部分符合</span><strong id="cl-side-partial">0</strong></div>
                <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--red"></span>不符合</span><strong id="cl-side-nonconform">0</strong></div>
                <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--slate"></span>不適用</span><strong id="cl-side-na">0</strong></div>
              </div>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">填報提醒</div>
              <div class="editor-note-list">
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>每一題都要先選擇符合程度，再補充執行情形與佐證說明，才能正確統計完成率。</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>若判定為部分符合或不符合，請在執行情形中說明原因、風險與後續改善方向。</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>完成後請確認簽核資訊與附件已齊備，再正式送出；送出後草稿將鎖定。</span></div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <button type="button" class="btn btn-secondary checklist-draft-floating" id="cl-save-draft-floating" data-testid="checklist-save-draft-floating">${ic('save', 'icon-sm')} 暫存草稿</button>
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

    function initializeChecklistEvidenceInputs() {
      getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
        renderChecklistEvidenceFiles(item.id, true);
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

    function updateProgress() {
      let filled = 0;
      const counts = { [COMPLIANCE_OPTS[0]]: 0, [COMPLIANCE_OPTS[1]]: 0, [COMPLIANCE_OPTS[2]]: 0, [COMPLIANCE_OPTS[3]]: 0 };
      getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
        const selected = document.querySelector(`input[name="cl-${item.id}"]:checked`);
        if (!selected) return;
        filled += 1;
        if (counts[selected.value] !== undefined) counts[selected.value] += 1;
      }));
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

    async function saveChecklistDraft() {
      const data = await collectData('\u8349\u7a3f');
      const duplicateChecklist = findExistingChecklistForUnitYear(data.unit, data.auditYear, existing?.id);
      if (duplicateChecklist) {
        toast('已存在相同單位與年度的檢核表草稿，系統將直接帶您前往該筆紀錄。', 'error');
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
      navigate('checklist-fill/' + data.id, { replace: true });
    }

    document.querySelectorAll('.cl-radio-group input').forEach((radio) => radio.addEventListener('change', updateProgress));
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
    initializeChecklistEvidenceInputs();

    checklistForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      debugFlow('checklist', 'submit start', { id: existing?.id || null, unit: document.getElementById('cl-unit').value });
      const missing = [];
      getChecklistSectionsState().forEach((sec) => sec.items.forEach((item) => {
        if (!document.querySelector(`input[name="cl-${item.id}"]:checked`)) missing.push(item.id);
      }));
      if (missing.length > 0) {
        debugFlow('checklist', 'submit blocked by unanswered items', { count: missing.length, first: missing[0] });
        toast(`\u4ecd\u6709 ${missing.length} \u500b\u67e5\u6aa2\u9805\u76ee\u5c1a\u672a\u586b\u7b54`, 'error');
        const el = document.getElementById(`cl-item-${missing[0]}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const requiredMeta = [
        { el: document.getElementById('cl-supervisor-name'), label: '\u6b0a\u8cac\u4e3b\u7ba1\u59d3\u540d' },
        { el: document.getElementById('cl-supervisor-title'), label: '\u4e3b\u7ba1\u8077\u7a31' },
        { el: document.getElementById('cl-sign-status'), label: '\u7c3d\u6838\u72c0\u614b' },
        { el: document.getElementById('cl-sign-date'), label: '\u7c3d\u6838\u65e5\u671f' }
      ];
      const missingMeta = requiredMeta.find(({ el }) => !String(el.value || '').trim());
      if (missingMeta) {
        debugFlow('checklist', 'submit blocked by metadata', { field: missingMeta.label });
        toast(`\u8acb\u5b8c\u6574\u586b\u5beb${missingMeta.label}`, 'error');
        missingMeta.el.focus();
        return;
      }
      const data = await collectData('\u5df2\u9001\u51fa');
      const duplicateChecklist = findExistingChecklistForUnitYear(data.unit, data.auditYear, existing?.id);
      if (duplicateChecklist) {
        toast('已存在相同單位與年度的檢核表草稿，系統將直接帶您前往該筆紀錄。', 'error');
        navigate(canEditChecklist(duplicateChecklist) ? ('checklist-fill/' + duplicateChecklist.id) : ('checklist-detail/' + duplicateChecklist.id));
        return;
      }
      const result = await submitChecklistForm(data);
      existing = result && result.item ? result.item : (getChecklist(data.id) || data);
      debugFlow('checklist', 'submit success', { id: data.id, unit: data.unit, status: data.status });
      updateChecklistDraftStatus(existing);
      clearUnsavedChangesGuard();
      if (result && result.warning) toast(result.warning, 'info');
      toast(`\u6aa2\u6838\u8868 ${data.id} \u5df2\u6b63\u5f0f\u9001\u51fa`);
      navigate('checklist-detail/' + data.id);
    });

    checklistForm.addEventListener('input', markChecklistDirty);
    checklistForm.addEventListener('change', markChecklistDirty);

    document.getElementById('cl-save-draft')?.addEventListener('click', saveChecklistDraft);
    document.getElementById('cl-save-draft-inline').addEventListener('click', saveChecklistDraft);
    document.getElementById('cl-save-draft-floating').addEventListener('click', saveChecklistDraft);
  }

  function renderChecklistDetail(id) {
    cleanupRenderedAttachmentUrls();
    const cl = getChecklist(id);
    if (!cl) {
      document.getElementById('app').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ic('help-circle', 'icon-lg')}</div><div class="empty-state-title">找不到檢核表</div><a href="#checklist" class="btn btn-primary" style="margin-top:16px">返回列表</a></div>`;
      return;
    }
    if (!canAccessChecklist(cl)) { navigate('checklist'); toast('您沒有權限檢視此檢核表', 'error'); return; }

    const s = cl.summary || { total: 0, conform: 0, partial: 0, nonConform: 0, na: 0 };
    const applicable = Math.max((s.total || 0) - (s.na || 0), 0);
    const applicableRate = applicable > 0 ? Math.round(((s.conform || 0) / applicable) * 100) : 0;
    const R = 50;
    const C = 2 * Math.PI * R;
    const vals = [
      { label: '符合', count: s.conform || 0, color: COMPLIANCE_COLORS['符合'] },
      { label: '部分符合', count: s.partial || 0, color: COMPLIANCE_COLORS['部分符合'] },
      { label: '不符合', count: s.nonConform || 0, color: COMPLIANCE_COLORS['不符合'] },
      { label: '不適用', count: s.na || 0, color: COMPLIANCE_COLORS['不適用'] }
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
      if (r.compliance === '不符合' || r.compliance === '部分符合') {
        issues.push({ id: item.id, text: item.text, compliance: r.compliance, execution: r.execution || '' });
      }
    }));
    const issueHtml = issues.length ? `<div class="card" style="margin-top:20px;border-left:3px solid #ef4444"><div class="section-header">${ic('alert-triangle', 'icon-sm')} 待改善項目 ${issues.length} 項</div>${issues.map((iss) => `<div class="cl-issue-item"><span class="cl-compliance-badge cl-badge-${COMPLIANCE_CLASSES[iss.compliance]}">${iss.compliance}</span><span class="cl-item-id">${iss.id}</span> ${esc(iss.text)}${iss.execution ? `<div class="cl-issue-note">${esc(iss.execution)}</div>` : ''}</div>`).join('')}</div>` : '';
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
            <div class="detail-field"><div class="detail-field-label">填報人員</div><div class="detail-field-value">${esc(cl.fillerName)}</div></div>
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
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('clipboard-list', 'icon-sm')} 檢核題目明細</span></div>${sectDetail}</div>
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
            <div class="cm-item-hint">提示：${esc(item.hint || '未提供填報提示')}</div>
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
              <button class="btn btn-sm btn-secondary" data-action="checklist.editSection" data-si="${si}" title="編輯章節名稱">${ic('edit-2', 'btn-icon-svg')}</button>
              <button class="btn btn-sm btn-primary" data-action="checklist.addItem" data-si="${si}" title="新增題目">${ic('plus', 'btn-icon-svg')} 新增題目</button>
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
    if (!isAdmin()) { navigate('dashboard'); toast('只有管理者可以管理檢核表題庫', 'error'); return; }
    const totalItems = getChecklistManageTotalItems();
    const sectHtml = buildChecklistManageSectionsHtml();

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">檢核表管理</h1>
          <p class="page-subtitle">目前共有 ${getChecklistSectionsState().length} 個章節、${totalItems} 個題目，可在此維護預設檢核內容。</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" data-action="checklist.resetDefault">${ic('refresh-cw', 'icon-sm')} 還原預設題庫</button>
          <button class="btn btn-primary" data-action="checklist.addSection">${ic('plus-circle', 'icon-sm')} 新增章節</button>
        </div>
      </div>

      <div class="cm-info-banner">
        ${ic('info', 'icon-sm')}
        <span>調整題庫內容後，新的檢核表會立即套用最新章節與題目設定，請確認名稱與提示文字都清楚可理解。</span>
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
    if (subtitle) subtitle.textContent = `目前共有 ${getChecklistSectionsState().length} 個章節、${totalItems} 個題目，可在此維護預設檢核內容。`;
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
        <input type="text" class="form-input" id="cm-sec-name" placeholder="例如 10. 資安政策與管理" required autofocus>
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
    _cmModal('編輯章節名稱', `
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

  function cmDelSection(si) {
    const secs = getChecklistSections();
    if (!confirm(`確定要刪除章節「${secs[si].section}」嗎？這會一併刪除其中 ${secs[si].items.length} 個題目。`)) return;
    secs.splice(si, 1);
    saveChecklistSections(secs);
    toast('章節已刪除', 'info');
    _cmRefreshSections();
  };

  function cmAddItem(si) {
    const nextId = _cmNextItemId(si);
    _cmModal('新增題目', `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label form-required">題號</label>
          <input type="text" class="form-input" id="cm-item-id" value="${esc(nextId)}" placeholder="例如 8.10" required>
          <p class="form-hint">題號建議保持章節前綴，方便後續排序與維護。</p>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label form-required">題目內容</label>
        <textarea class="form-textarea" id="cm-item-text" placeholder="請輸入檢核題目文字" required style="min-height:80px" autofocus></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">填報提示</label>
        <textarea class="form-textarea" id="cm-item-hint" placeholder="例如需要附上的佐證或應補充的說明" style="min-height:60px"></textarea>
      </div>`, () => {
      const id = document.getElementById('cm-item-id').value.trim();
      const text = document.getElementById('cm-item-text').value.trim();
      const hint = document.getElementById('cm-item-hint').value.trim();
      if (!id || !text) { toast('題號與題目內容都必須填寫', 'error'); return; }
      const secs = getChecklistSections();
      const allIds = secs.flatMap(s => s.items.map(it => it.id));
      if (allIds.includes(id)) { toast(`題號 ${id} 已存在，請改用其他題號`, 'error'); return; }
      secs[si].items.push({ id, text, hint });
      saveChecklistSections(secs);
      toast('題目已新增');
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
        <textarea class="form-textarea" id="cm-item-text" required style="min-height:80px">${esc(item.text)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">填報提示</label>
        <textarea class="form-textarea" id="cm-item-hint" style="min-height:60px">${esc(item.hint || '')}</textarea>
      </div>`, () => {
      const newId = document.getElementById('cm-item-id').value.trim();
      const text = document.getElementById('cm-item-text').value.trim();
      const hint = document.getElementById('cm-item-hint').value.trim();
      if (!newId || !text) { toast('題號與題目內容都必須填寫', 'error'); return; }
      const s2 = getChecklistSections();
      const allIds = s2.flatMap((sec, sIdx) => sec.items.map((it, iIdx) => ({ id: it.id, si: sIdx, ii: iIdx }))).filter(x => !(x.si === si && x.ii === ii)).map(x => x.id);
      if (allIds.includes(newId)) { toast(`題號 ${newId} 已存在，請改用其他題號`, 'error'); return; }
      s2[si].items[ii] = { id: newId, text, hint };
      saveChecklistSections(s2);
      toast('題目已更新');
    });
  };

  function cmDelItem(si, ii) {
    const secs = getChecklistSections();
    const item = secs[si].items[ii];
    if (!confirm(`確定要刪除題目 ${item.id} 嗎？`)) return;
    secs[si].items.splice(ii, 1);
    saveChecklistSections(secs);
    toast('題目已刪除', 'info');
    _cmRefreshSections();
  };

  function cmResetDefault() {
    if (!confirm('確定要還原成系統預設題庫嗎？目前自訂的章節與題目會被覆蓋。')) return;
    resetChecklistSections();
    toast('已還原為預設題庫', 'info');
    _cmRefreshSections();
  };
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

