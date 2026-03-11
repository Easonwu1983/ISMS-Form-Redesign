(function () {
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
      canAccessItem,
      canRespondItem,
      canSubmitTracking,
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
      toast,
      fmt,
      esc,
      ic,
      mkChk,
      mkRadio,
      refreshIcons,
      bindCopyButtons,
      renderCopyIdCell,
      renderCopyIdButton,
      buildUnitCascadeControl,
      initUnitCascade,
      applyTestIds,
      applySelectorTestIds,
      registerActionHandlers
    } = deps;

  function renderCaseStatusCell(item, useClosedGuard) {
    var overdue = isOverdue(item);
    var label = overdue && (!useClosedGuard || item.status !== STATUSES.CLOSED) ? '已逾期' : item.status;
    return '<span class="badge badge-' + (overdue ? 'overdue' : STATUS_CLASSES[item.status]) + '"><span class="badge-dot"></span>' + label + '</span>';
  }

  function renderDashboardTableRow(item) {
    return '<tr data-route="detail/' + item.id + '"><td class="record-id-col">' + renderCopyIdCell(item.id, '矯正單號', true) + '</td><td>' + esc(item.problemDesc || '').substring(0, 34) + '</td><td>' + renderCaseStatusCell(item, false) + '</td><td>' + esc(item.handlerName) + '</td><td>' + fmt(item.correctiveDueDate) + '</td><td>' + fmt(getCurrentNextTrackingDate(item)) + '</td></tr>';
  }

  function renderListTableRow(item) {
    return '<tr data-route="detail/' + item.id + '"><td class="record-id-col">' + renderCopyIdCell(item.id, '矯正單號', true) + '</td><td>' + esc(item.deficiencyType) + '</td><td>' + esc(item.source) + '</td><td>' + renderCaseStatusCell(item, true) + '</td><td>' + esc(item.proposerName) + '</td><td>' + esc(item.handlerName) + '</td><td>' + fmt(item.correctiveDueDate) + '</td><td>' + fmt(getCurrentNextTrackingDate(item)) + '</td></tr>';
  }

  function buildCaseCard(headerHtml, bodyHtml, options) {
    var opts = options || {};
    var styleAttr = opts.style ? ' style="' + opts.style + '"' : '';
    var headerClass = opts.headerClass || 'card-header';
    return '<div class="card"' + styleAttr + '>' + (headerHtml ? '<div class="' + headerClass + '">' + headerHtml + '</div>' : '') + bodyHtml + '</div>';
  }

  function buildCaseEvidenceList(files, emptyText) {
    return files && files.length
      ? '<div class="file-preview-list">' + files.map(function (ev) {
        var preview = ev.type && ev.type.startsWith('image/')
          ? '<img src="' + ev.data + '" alt="' + esc(ev.name) + '">'
          : '<div class="file-pdf-icon">' + ic('file-box') + '</div>';
        return '<div class="file-preview-item">' + preview + '<div class="file-name">' + esc(ev.name) + '</div><div class="file-preview-actions"><a class="btn btn-sm btn-secondary" href="' + ev.data + '" target="_blank" rel="noopener">預覽</a><a class="btn btn-sm btn-secondary" href="' + ev.data + '" download="' + esc(ev.name) + '">下載</a></div></div>';
      }).join('') + '</div>'
      : '<p style="color:var(--text-muted);font-size:.88rem">' + esc(emptyText || '尚未上傳文件') + '</p>';
  }

  function buildCaseTimeline(historyList) {
    return (historyList || []).map(function (h, index, all) {
      var actor = h.user || '';
      if (!actor || actor === '蝟餌絞') {
        var linked = all.slice(0, index).reverse().find(function (entry) { return entry.time === h.time && entry.user && entry.user !== '蝟餌絞'; });
        if (linked) actor = linked.user;
      }
      return '<div class="timeline-item"><div class="timeline-time">' + fmtTime(h.time) + '</div><div class="timeline-text">' + esc(h.action) + (actor ? (' - ' + esc(actor)) : '') + '</div></div>';
    }).reverse().join('');
  }

  function renderDashboard() {
    var items = getVisibleItems();
    var total = items.length;
    var pending = items.filter(function (i) { return i.status === STATUSES.PENDING; }).length;
    var overdue = items.filter(function (i) { return isOverdue(i); }).length;
    var now2 = new Date();
    var closedM = items.filter(function (i) {
      return i.status === STATUSES.CLOSED && i.closedDate && new Date(i.closedDate).getMonth() === now2.getMonth() && new Date(i.closedDate).getFullYear() === now2.getFullYear();
    }).length;
    var sc = {};
    STATUS_FLOW.forEach(function (s) { sc[s] = 0; });
    items.forEach(function (i) { if (sc[i.status] !== undefined) sc[i.status]++; });
    var cc = {};
    cc[STATUSES.CREATED] = '#3b82f6';
    cc[STATUSES.PENDING] = '#f59e0b';
    cc[STATUSES.PROPOSED] = '#a855f7';
    cc[STATUSES.REVIEWING] = '#06b6d4';
    cc[STATUSES.TRACKING] = '#f97316';
    cc[STATUSES.CLOSED] = '#22c55e';

    var R = 60, C = 2 * Math.PI * R, segs = '', off = 0;
    if (total > 0) {
      STATUS_FLOW.forEach(function (s) {
        var c2 = sc[s];
        if (!c2) return;
        var l = c2 / total * C;
        segs += '<circle r="' + R + '" cx="80" cy="80" fill="none" stroke="' + cc[s] + '" stroke-width="20" stroke-dasharray="' + l + ' ' + (C - l) + '" stroke-dashoffset="' + (-off) + '"/>';
        off += l;
      });
    } else {
      segs = '<circle r="' + R + '" cx="80" cy="80" fill="none" stroke="#e2e8f0" stroke-width="20"/>';
    }

    var svg = '<svg viewBox="0 0 160 160" class="donut-chart">' + segs + '<text x="80" y="74" text-anchor="middle" fill="#0f172a" font-size="24" font-weight="700" font-family="Inter">' + total + '</text><text x="80" y="94" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="500" font-family="Inter">總計</text></svg>';
    var leg = STATUS_FLOW.map(function (s) {
      return '<div class="legend-item"><span class="legend-dot" style="background:' + cc[s] + '"></span><span>' + s + '</span><span class="legend-count">' + sc[s] + '</span></div>';
    }).join('');

    var recent = items.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 5);
    var recentRows = recent.length ? recent.map(function (i) {
      return renderDashboardTableRow(i);
    }).join('') : '<tr><td colspan="6"><div class="empty-state" style="padding:40px"><div class="empty-state-icon">' + ic('inbox') + '</div><div class="empty-state-title">沒有矯正單資料</div></div></td></tr>';

    var createBtn = canCreateCAR() ? '<a href="#create" class="btn btn-primary">' + ic('plus-circle', 'icon-sm') + ' 開立矯正單</a>' : '';
    var nextDueItem = items.filter(function (i) { return i.status !== STATUSES.CLOSED && i.correctiveDueDate; }).sort(function (a, b) { return new Date(a.correctiveDueDate) - new Date(b.correctiveDueDate); })[0] || null;
    var focusLine = overdue > 0
      ? '目前有 ' + overdue + ' 筆矯正單已逾期，建議優先追蹤。'
      : (pending > 0 ? '目前有 ' + pending + ' 筆待矯正事項，可優先分派與提醒。' : '目前沒有逾期項目，整體進度維持穩定。');
    var heroMeta = [
      { label: '待矯正', value: pending },
      { label: '已逾期', value: overdue },
      { label: '本月結案', value: closedM }
    ].map(function (item) {
      return '<div class="dashboard-meta-chip"><span class="dashboard-meta-label">' + item.label + '</span><strong class="dashboard-meta-value">' + item.value + '</strong></div>';
    }).join('');
    var heroSide = '<div class="dashboard-hero-side"><div class="dashboard-focus-card"><div class="dashboard-focus-label">今日焦點</div><div class="dashboard-focus-text">' + focusLine + '</div><div class="dashboard-focus-list">'
      + '<div class="dashboard-focus-item"><span>下一個截止</span><strong>' + (nextDueItem ? (esc(nextDueItem.id) + ' · ' + fmt(nextDueItem.correctiveDueDate)) : '目前無') + '</strong></div>'
      + '<div class="dashboard-focus-item"><span>進行中案件</span><strong>' + (total - closedM) + '</strong></div>'
      + '<div class="dashboard-focus-item"><span>最新處理人</span><strong>' + (recent[0] ? esc(recent[0].handlerName) : '—') + '</strong></div>'
      + '</div></div>';

    document.getElementById('app').innerHTML = '<div class="animate-in">'
      + '<section class="dashboard-hero"><div class="dashboard-hero-grid"><div class="dashboard-hero-copy"><div class="dashboard-hero-eyebrow">Internal Audit Operations</div><h1 class="dashboard-hero-title">儀表板</h1><p class="dashboard-hero-text">集中掌握矯正單進度、逾期風險與最近活動，讓主管與承辦人可以在同一個入口快速判斷優先順序。</p><div class="dashboard-meta-row">' + heroMeta + '</div><div class="dashboard-hero-actions">' + createBtn + '</div></div>' + heroSide + '</div></section>'
      + '<div class="stats-grid">'
      + '<div class="stat-card total"><div class="stat-icon">' + ic('files') + '</div><div class="stat-value">' + total + '</div><div class="stat-label">矯正單總數</div></div>'
      + '<div class="stat-card pending"><div class="stat-icon">' + ic('clock') + '</div><div class="stat-value">' + pending + '</div><div class="stat-label">待矯正</div></div>'
      + '<div class="stat-card overdue"><div class="stat-icon">' + ic('alert-triangle') + '</div><div class="stat-value">' + overdue + '</div><div class="stat-label">已逾期</div></div>'
      + '<div class="stat-card closed"><div class="stat-icon">' + ic('check-circle-2') + '</div><div class="stat-value">' + closedM + '</div><div class="stat-label">本月結案</div></div>'
      + '</div>'
      + '<div class="dashboard-grid">'
      + '<div class="card dashboard-panel dashboard-chart-panel"><div class="card-header"><span class="card-title">狀態分布</span></div><div class="donut-chart-container">' + svg + '<div class="donut-legend">' + leg + '</div></div></div>'
      + '<div class="card dashboard-panel dashboard-table-panel"><div class="card-header"><span class="card-title">最近矯正單</span><a href="#list" class="btn btn-ghost btn-sm">查看全部 →</a></div><div class="table-wrapper"><table><thead><tr><th class="record-id-head">單號</th><th>說明</th><th>狀態</th><th>處理人</th><th>預定完成</th><th>下次追蹤</th></tr></thead><tbody>' + recentRows + '</tbody></table></div></div>'
      + '</div></div>';
    refreshIcons();
    bindCopyButtons();
  }

  var curFilter = '全部', curSearch = '';
  function renderList() {
    var items = getVisibleItems(); var filters = ['全部'].concat(STATUS_FLOW).concat(['已逾期']); var filtered = items.slice();
    if (curFilter === '已逾期') filtered = items.filter(function (i) { return isOverdue(i); }); else if (curFilter !== '全部') filtered = items.filter(function (i) { return i.status === curFilter; });
    if (curSearch) { var q = curSearch.toLowerCase(); filtered = filtered.filter(function (i) { return i.id.toLowerCase().indexOf(q) >= 0 || (i.problemDesc || '').toLowerCase().indexOf(q) >= 0 || i.handlerName.toLowerCase().indexOf(q) >= 0 || i.proposerName.toLowerCase().indexOf(q) >= 0; }); }
    filtered.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    var rows = filtered.length ? filtered.map(function (i) { return renderListTableRow(i); }).join('') : '<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">' + ic('search') + '</div><div class="empty-state-title">沒有符合條件的矯正單</div></div></td></tr>';
    var ftabs = filters.map(function (f) { return '<button class="filter-tab ' + (curFilter === f ? 'active' : '') + '" data-filter="' + f + '">' + f + '</button>'; }).join('');
    var createBtn = canCreateCAR() ? '<a href="#create" class="btn btn-primary">' + ic('plus-circle', 'icon-sm') + ' 開立矯正單</a>' : '';
    document.getElementById('app').innerHTML = '<div class="animate-in">' +
      '<div class="page-header"><div><h1 class="page-title">矯正單列表</h1><p class="page-subtitle">共 ' + items.length + ' 筆，顯示 ' + filtered.length + ' 筆</p></div>' + createBtn + '</div>' +
      '<div class="toolbar"><div class="search-box"><input type="text" placeholder="搜尋單號、說明、人員..." id="search-input" value="' + esc(curSearch) + '"></div><div class="filter-tabs" id="filter-tabs">' + ftabs + '</div></div>' +
      '<div class="card" style="padding:0;overflow:hidden;"><div class="table-wrapper"><table><thead><tr><th class="record-id-head">單號</th><th>缺失種類</th><th>來源</th><th>狀態</th><th>提出人</th><th>處理人</th><th>預定完成</th><th>下次追蹤</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
    refreshIcons();
    bindCopyButtons();
    document.getElementById('search-input').addEventListener('input', function (e) { curSearch = e.target.value; renderList(); });
    document.getElementById('filter-tabs').addEventListener('click', function (e) { if (e.target.classList.contains('filter-tab')) { curFilter = e.target.dataset.filter; renderList(); } });
  }

  // ─── Render: Create ────────────────────────
  function buildCreatePage(u) {
    return `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">開立矯正單</h1><p class="page-subtitle">建立內部資通安全稽核矯正單，送出後即可進入處理與追蹤流程。</p></div></div>
      <div class="editor-shell editor-shell--car">
        <section class="editor-main">
          <div class="card editor-card"><form id="create-form" data-testid="create-form">
            <div class="form-feedback" id="create-feedback" data-state="idle" aria-live="polite" hidden></div>
            <div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div>
            <div class="form-row form-row--create-meta">
              <div class="form-group"><label class="form-label">編號前綴</label><input type="text" class="form-input" id="f-docno" placeholder="選擇處理單位後自動帶入" readonly><p class="form-hint">系統依民國年與處理單位代碼帶入，例如 CAR-115-022。</p></div>
              <div class="form-group"><label class="form-label">案件編號</label><input type="text" class="form-input" id="f-id" placeholder="留白則由系統自動產生，例如 CAR-115-022-1"><p class="form-hint">若留白，系統會在編號前綴後加上該單位流水號；若手動輸入，僅支援英數、連字號與底線。</p></div>
              <div class="form-group"><label class="form-label form-required">提報單位</label>${buildUnitCascadeControl('f-punit', getScopedUnit(u) || u.unit || '', true, true)}</div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">提報日期</label><input type="date" class="form-input" id="f-pdate" value="${new Date().toISOString().split('T')[0]}" required></div>
              <div class="form-group"><label class="form-label form-required">提報人員</label><input type="text" class="form-input" id="f-pname" value="${esc(u.name)}" readonly></div>
              <div class="form-group"><label class="form-label form-required">處理單位</label>${buildUnitCascadeControl('f-hunit', '', false, true)}</div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">處理人員</label><select class="form-select" id="f-hname" data-testid="create-handler-name" required><option value="">請先選擇處理單位</option></select></div>
              <div class="form-group"><label class="form-label">指派日期</label><input type="date" class="form-input" id="f-hdate"></div>
              <div class="form-group"><label class="form-label">處理人員信箱</label><div class="input-with-icon"><input type="email" class="form-input" id="f-hemail" placeholder="選擇處理人員後自動帶入" readonly style="background:#f8fafc"><span class="input-icon-hint">${ic('mail', 'icon-xs')}</span></div><p class="form-hint">系統後續通知將優先送往此信箱</p></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">通知設定</label><label class="chk-label" style="margin-top:4px"><input type="checkbox" id="f-notify" checked><span class="chk-box"></span>開單後寄送指派通知給處理人員</label></div>
            </div>
            <div class="section-header">${ic('tag', 'icon-sm')} 缺失分類</div>
            <div class="form-group"><label class="form-label form-required">缺失種類</label>${mkRadio('defType', DEF_TYPES, '')}</div>
            <div class="form-group"><label class="form-label form-required">來源</label>${mkRadio('source', SOURCES, '')}</div>
            <div class="form-group"><label class="form-label form-required">分類（可複選）</label>${mkChk('category', CATEGORIES, [])}</div>
            <div class="form-group"><label class="form-label">條文</label><input type="text" class="form-input" id="f-clause" placeholder="例：A.9.2.6、ISO 27001:2022"></div>
            <div class="section-header">${ic('message-square-warning', 'icon-sm')} 問題描述</div>
            <div class="form-group"><label class="form-label form-required">問題或缺失說明</label><textarea class="form-textarea" id="f-problem" placeholder="請具體描述發現的問題、缺失情境與影響範圍" required style="min-height:112px"></textarea></div>
            <div class="form-group"><label class="form-label form-required">缺失發生情形</label><textarea class="form-textarea" id="f-occurrence" placeholder="說明缺失發生的背景、時間點與實際狀況" required style="min-height:92px"></textarea></div>
            <div class="section-header">${ic('calendar', 'icon-sm')} 時程設定</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">預定完成日期</label><input type="date" class="form-input" id="f-due" required></div>
            </div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 送出矯正單</button><a href="#list" class="btn btn-secondary">返回列表</a></div>
          </form></div>
        </section>
        <aside class="editor-aside">
          <div class="editor-sticky">
            <div class="editor-side-card editor-side-card--accent">
              <div class="editor-side-kicker">Issue Routing</div>
              <div class="editor-side-title">開單摘要</div>
              <div class="editor-side-text">右側摘要會跟著你的填寫內容即時更新，避免漏掉單號、指派與期限設定。</div>
              <div class="editor-summary-list editor-summary-list--compact">
                <div class="editor-summary-item"><span>編號前綴</span><strong id="create-summary-docno">待指定</strong></div>
                <div class="editor-summary-item"><span>矯正單號</span><strong id="create-summary-id">自動編號</strong></div>
                <div class="editor-summary-item"><span>提報單位</span><strong id="create-summary-proposer">${esc(getScopedUnit(u) || u.unit || '未指定')}</strong></div>
                <div class="editor-summary-item"><span>處理單位</span><strong id="create-summary-handler-unit">待指定</strong></div>
                <div class="editor-summary-item"><span>處理人員</span><strong id="create-summary-handler">待指定</strong></div>
                <div class="editor-summary-item"><span>預計完成</span><strong id="create-summary-due">未指定</strong></div>
                <div class="editor-summary-item"><span>通知方式</span><strong id="create-summary-notify">送出後寄送通知</strong></div>
              </div>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">流程節點</div>
              <div class="editor-step-list">
                <div class="editor-step-item"><span class="editor-step-badge">1</span><div><strong>建立矯正單</strong><p>填寫缺失、來源與改善期限，並指定處理單位與人員。</p></div></div>
                <div class="editor-step-item"><span class="editor-step-badge">2</span><div><strong>處理人員回覆</strong><p>承辦人填寫改善措施、根因與佐證資料後送審。</p></div></div>
                <div class="editor-step-item"><span class="editor-step-badge">3</span><div><strong>管理者審核追蹤</strong><p>管理者可核可、退回或進入追蹤，直到結案。</p></div></div>
              </div>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">填寫提醒</div>
              <div class="editor-note-list">
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>若要使用自訂單號，建議先依正式公文或管考序號命名，避免後續重複。</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>缺失描述請直接寫出現況、風險與影響範圍，後續追蹤會更清楚。</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>改善期限建議保留合理緩衝，避免剛送出就進入逾期狀態。</span></div>
              </div>
            </div>
          </div>
        </aside>
      </div></div>`;
  }

function renderCreate() {
    if (!canCreateCAR()) { navigate('dashboard'); toast('您沒有開立矯正單權限', 'error'); return; }
    const u = currentUser();
    const allUsers = getUsers();
    const users = allUsers.filter(x => x.role === ROLES.REPORTER || x.role === ROLES.UNIT_ADMIN);

    document.getElementById('app').innerHTML = buildCreatePage(u);
    refreshIcons();
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
    const notifyInput = document.getElementById('f-notify');
    const summaryDocNo = document.getElementById('create-summary-docno');
    const summaryId = document.getElementById('create-summary-id');
    const summaryProposer = document.getElementById('create-summary-proposer');
    const summaryHandlerUnit = document.getElementById('create-summary-handler-unit');
    const summaryHandler = document.getElementById('create-summary-handler');
    const summaryDue = document.getElementById('create-summary-due');
    const summaryNotify = document.getElementById('create-summary-notify');

    initUnitCascade('f-punit', getScopedUnit(u) || u.unit || '', { disabled: true });
    initUnitCascade('f-hunit', '', { disabled: false });

    function getAutoGeneratedIdPreview() {
      const documentNo = buildCorrectionDocumentNo(handlerUnit.value, proposerDateInput.value);
      if (!documentNo) return '待選擇處理單位';
      const sequence = getNextCorrectionSequence(documentNo, loadData().items);
      return buildAutoCarIdByDocument(documentNo, sequence) || '待選擇處理單位';
    }

    function syncCreateSummary() {
      const documentNo = buildCorrectionDocumentNo(handlerUnit.value, proposerDateInput.value);
      if (documentNoInput) documentNoInput.value = documentNo || '';
      if (summaryDocNo) summaryDocNo.textContent = documentNo || '待指定';
      summaryId.textContent = normalizeCarIdInput(idInput.value) || getAutoGeneratedIdPreview();
      const proposerCode = getUnitCodeWithDots(proposerUnit.value);
      const handlerCode = getUnitCodeWithDots(handlerUnit.value);
      summaryProposer.textContent = proposerUnit.value ? `${proposerCode ? `${proposerCode} ` : ''}${proposerUnit.value}` : '未指定';
      summaryHandlerUnit.textContent = handlerUnit.value ? `${handlerCode ? `${handlerCode} ` : ''}${handlerUnit.value}` : '待指定';
      summaryHandler.textContent = handlerName.value || '待指定';
      summaryDue.textContent = dueInput.value ? fmt(dueInput.value) : '未指定';
      summaryNotify.textContent = notifyInput.checked ? '送出後寄送通知' : '僅建立單據，不寄送通知';
    }

    function filterUsersByUnit(unit) {
      if (!unit) return users;
      const selected = splitUnitValue(unit);
      return users.filter((entry) => {
        const userUnit = String(entry.unit || '').trim();
        if (!userUnit) return false;
        if (userUnit === unit) return true;
        const target = splitUnitValue(userUnit);
        if (!selected.parent || selected.parent !== target.parent) return false;
        return !selected.child || selected.child === target.child;
      });
    }

    function updateHandlerEmail() {
      const sel = handlerName.options[handlerName.selectedIndex];
      const email = sel && sel.dataset ? (sel.dataset.email || '') : '';
      handlerEmailInput.value = email;
      syncCreateSummary();
    }

    function renderHandlerOptionsByUnit(unit) {
      const prevSelected = handlerName.value;
      const filtered = filterUsersByUnit(unit);
      handlerName.innerHTML = '<option value="">請選擇處理人員</option>' + filtered.map(x => `<option value="${esc(x.name)}" data-username="${esc(x.username || '')}" data-email="${esc(x.email || '')}">${esc(x.name)}（${esc(x.unit)}）</option>`).join('');
      if (prevSelected && filtered.some(x => x.name === prevSelected)) handlerName.value = prevSelected;
      else if (filtered.length > 0) handlerName.value = filtered[0].name;
      updateHandlerEmail();
    }

    renderHandlerOptionsByUnit(handlerUnit.value);
    handlerUnit.addEventListener('change', function () {
      renderHandlerOptionsByUnit(this.value);
      syncCreateSummary();
    });
    proposerUnit.addEventListener('change', syncCreateSummary);
    proposerDateInput.addEventListener('change', syncCreateSummary);
    handlerName.addEventListener('change', updateHandlerEmail);
    dueInput.addEventListener('change', syncCreateSummary);
    notifyInput.addEventListener('change', syncCreateSummary);
    idInput.addEventListener('input', syncCreateSummary);
    syncCreateSummary();

    const createForm = document.getElementById('create-form');
    const createFeedback = document.getElementById('create-feedback');
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

    document.getElementById('create-form').addEventListener('submit', e => {
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
      const proposerUnitValue = getScopedUnit(u) || u.unit || document.getElementById('f-punit').value;
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
      const selectedHandler = handlerName.options[handlerName.selectedIndex];
      const handlerUsername = selectedHandler && selectedHandler.dataset ? (selectedHandler.dataset.username || '') : '';
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
        handlerName: document.getElementById('f-hname').value,
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
        history: [{ time: now, action: '開立矯正單', user: u.name }, { time: now, action: `狀態變更為「${STATUSES.PENDING}」`, user: u.name }]
      };
      const shouldNotify = document.getElementById('f-notify').checked;
      const hEmail = document.getElementById('f-hemail').value;
      addItem(item);
      debugFlow('create', 'submit success', { id: item.id, notify: shouldNotify, handlerEmail: hEmail || '' });
      if (shouldNotify && hEmail) {
        item.history.push({ time: now, action: `系統寄送指派通知至 ${hEmail}`, user: '系統' });
        updateItem(item.id, { history: item.history });
        toast(`矯正單 ${item.id} 已建立，並已寄送通知至 ${hEmail}`);
      } else {
        toast(`矯正單 ${item.id} 已建立完成`);
      }
      navigate('detail/' + item.id);
    });
    createForm.addEventListener('input', clearCreateFeedback);
    createForm.addEventListener('change', clearCreateFeedback);
  }

  function renderDetail(id) {
    const item = getItem(id);
    if (!item) { document.getElementById('app').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ic('help-circle', 'icon-lg')}</div><div class="empty-state-title">找不到矯正單</div><a href="#list" class="btn btn-primary" style="margin-top:16px">返回列表</a></div>`; return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限檢視此矯正單', 'error'); return; }
    const u = currentUser();
    const ci = STATUS_FLOW.indexOf(item.status);
    const isHandler = isItemHandler(item, u);
    const canRespond = canRespondItem(item, u);
    const canFillTracking = canSubmitTracking(item, u);
    const canReviewTracking = item.status === STATUSES.TRACKING && !!item.pendingTracking && canReview();
    const pending = item.pendingTracking || null;
    const stepper = STATUS_FLOW.map((s, i) => { let c = ''; if (i < ci) c = 'completed'; else if (i === ci) c = 'active'; return `<div class="stepper-step ${c}"><div class="stepper-circle">${i < ci ? '✓' : i + 1}</div><div class="stepper-label">${s}</div></div>`; }).join('');
    const otag = isOverdue(item) ? ` <span class="badge badge-overdue"><span class="badge-dot"></span>已逾期</span>` : '';
    const cats = (item.category || []).map(c => `<span class="badge badge-category">${esc(c)}</span>`).join(' ');
    let btns = '';
    if (canRespond) btns += `<a href="#respond/${item.id}" class="btn btn-primary" data-testid="case-respond">${ic('edit-3', 'icon-sm')} 回填矯正措施</a>`;
    if (item.status === STATUSES.PROPOSED && canReview()) btns += `<button class="btn btn-primary" data-testid="case-transition-review" data-action="case.statusTransition" data-id="${item.id}" data-status="${STATUSES.REVIEWING}">${ic('eye', 'icon-sm')} 進入審核</button>`;
    if (item.status === STATUSES.REVIEWING && canReview()) {
      btns += `<button class="btn btn-success" data-testid="case-transition-close" data-action="case.statusTransition" data-id="${item.id}" data-status="${STATUSES.CLOSED}">${ic('check', 'icon-sm')} 審核通過結案</button>`;
      btns += `<button class="btn btn-warning" data-testid="case-transition-tracking" data-action="case.statusTransition" data-id="${item.id}" data-status="${STATUSES.TRACKING}">${ic('eye', 'icon-sm')} 轉為追蹤</button>`;
      btns += `<button class="btn btn-danger" data-testid="case-transition-return" data-action="case.statusTransition" data-id="${item.id}" data-status="${STATUSES.PENDING}">${ic('corner-up-left', 'icon-sm')} 退回重填</button>`;
    }
    if (canFillTracking) btns += `<a href="#tracking/${item.id}" class="btn btn-primary" data-testid="case-fill-tracking">${ic('clipboard-check', 'icon-sm')} 填報追蹤結果</a>`;
    if (canReviewTracking) {
      btns += `<button class="btn btn-success" data-testid="case-tracking-approve-close" data-action="case.reviewTracking" data-id="${item.id}" data-decision="close">${ic('check', 'icon-sm')} 同意結案</button>`;
      btns += `<button class="btn btn-warning" data-testid="case-tracking-approve-continue" data-action="case.reviewTracking" data-id="${item.id}" data-decision="continue">${ic('refresh-cw', 'icon-sm')} 同意繼續追蹤</button>`;
    }

    const renderEvidenceList = buildCaseEvidenceList;
    const evHtml = renderEvidenceList(item.evidence, '尚無佐證');
    const tl = buildCaseTimeline(item.history || []);
    const pendingTrackingHtml = pending ? `<div class="card" style="margin-top:20px;border-left:3px solid #0f766e;"><div class="card-header"><span class="card-title">${ic('hourglass', 'icon-sm')} 待管理者審核的追蹤提報</span></div>
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-field-label">追蹤輪次</div><div class="detail-field-value">第 ${pending.round || ((item.trackings || []).length + 1)} 次</div></div>
        <div class="detail-field"><div class="detail-field-label">提報人員</div><div class="detail-field-value">${esc(pending.tracker || '—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">提報日期</div><div class="detail-field-value">${fmt(pending.trackDate)}</div></div>
        <div class="detail-field"><div class="detail-field-label">填報建議</div><div class="detail-field-value">${esc(pending.result || '—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">下一次追蹤日期</div><div class="detail-field-value">${pending.nextTrackDate ? fmt(pending.nextTrackDate) : '—'}</div></div>
      </div>
      <div class="detail-section"><div class="detail-section-title">${ic('clipboard-list', 'icon-sm')} 執行情形</div><div class="detail-content">${esc(pending.execution || '')}</div></div>
      <div class="detail-section"><div class="detail-section-title">${ic('message-circle', 'icon-sm')} 追蹤說明</div><div class="detail-content">${esc(pending.trackNote || '')}</div></div>
      <div class="detail-section"><div class="detail-section-title">${ic('paperclip', 'icon-sm')} 本次提報佐證</div>${renderEvidenceList(pending.evidence, '本次追蹤未附佐證')}</div>
      ${canReviewTracking ? `<div class="form-actions"><button type="button" class="btn btn-success" data-testid="pending-tracking-approve-close" data-action="case.reviewTracking" data-id="${item.id}" data-decision="close">${ic('check', 'icon-sm')} 同意結案</button><button type="button" class="btn btn-warning" data-testid="pending-tracking-approve-continue" data-action="case.reviewTracking" data-id="${item.id}" data-decision="continue">${ic('refresh-cw', 'icon-sm')} 同意繼續追蹤</button></div>` : `<div class="detail-section"><div class="detail-content" style="color:var(--text-muted)">${isHandler ? '已送出追蹤提報，待管理者審核。' : '目前已有追蹤提報待管理者審核。'}</div></div>`}
    </div>` : '';

    const tkHtml = (item.trackings || []).map((tk, i) => {
      const requestedHtml = tk.requestedResult ? `<div class="detail-section"><div class="detail-section-title">${ic('message-square', 'icon-sm')} 填報建議</div><div class="detail-content">${esc(tk.requestedResult)}</div></div>` : '';
      const nextHtml = tk.nextTrackDate ? `<div class="detail-field"><div class="detail-field-label">下一次追蹤日期</div><div class="detail-field-value">${fmt(tk.nextTrackDate)}</div></div>` : '';
      const evidenceHtml = tk.evidence && tk.evidence.length ? `<div class="detail-section"><div class="detail-section-title">${ic('paperclip', 'icon-sm')} 本次佐證</div>${renderEvidenceList(tk.evidence, '')}</div>` : '';
      return `<div class="card" style="margin-bottom:16px;border-left:3px solid #f97316;"><div class="section-header">第 ${i + 1} 次追蹤 — ${fmt(tk.trackDate)}</div>
        <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">追蹤人</div><div class="detail-field-value">${esc(tk.tracker)}</div></div><div class="detail-field"><div class="detail-field-label">審核人</div><div class="detail-field-value">${esc(tk.reviewer || '—')}</div></div><div class="detail-field"><div class="detail-field-label">審核日期</div><div class="detail-field-value">${tk.reviewDate ? fmt(tk.reviewDate) : '—'}</div></div>${nextHtml}</div>
        <div class="detail-section"><div class="detail-section-title">${ic('clipboard-list', 'icon-sm')} 執行情形</div><div class="detail-content">${esc(tk.execution)}</div></div>
        <div class="detail-section"><div class="detail-section-title">${ic('message-circle', 'icon-sm')} 追蹤說明</div><div class="detail-content">${esc(tk.trackNote)}</div></div>
        ${requestedHtml}
        <div class="detail-section"><div class="detail-section-title">${ic('check-circle', 'icon-sm')} 管理者決議</div><div class="detail-content">${esc(tk.result || '—')}</div></div>
        ${evidenceHtml}</div>`;
    }).join('') || '<p style="color:var(--text-muted);font-size:.88rem">尚無追蹤紀錄</p>';

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="detail-header"><div><div class="detail-id detail-id-with-copy"><span>${esc(item.id)} · ${esc(item.deficiencyType)}</span>${renderCopyIdButton(item.id, '矯正單號')}</div><h1 class="detail-title">${esc(item.problemDesc || '').substring(0, 50)}</h1>
        <div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">${ic('user', 'icon-xs')}</span>${esc(item.proposerName)}</span><span class="detail-meta-item"><span class="detail-meta-icon">${ic('calendar', 'icon-xs')}</span>${fmt(item.proposerDate)}</span><span class="badge badge-${STATUS_CLASSES[item.status]}"><span class="badge-dot"></span>${item.status}</span>${otag}</div>
      </div><div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">${btns}<a href="#list" class="btn btn-secondary">← 返回</a></div></div>
      <div class="stepper">${stepper}</div>
      <div class="card" style="margin-top:20px"><div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div>
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
          <div class="detail-field"><div class="detail-field-label">處理人員信箱</div><div class="detail-field-value">${item.handlerEmail ? '<a href="mailto:' + esc(item.handlerEmail) + '" style="color:var(--accent-primary);text-decoration:none">' + ic('mail', 'icon-xs') + ' ' + esc(item.handlerEmail) + '</a>' : '—'}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理日期</div><div class="detail-field-value">${fmt(item.handlerDate)}</div></div>
          <div class="detail-field"><div class="detail-field-label">下一次追蹤日期</div><div class="detail-field-value">${fmt(getCurrentNextTrackingDate(item))}</div></div>
        </div></div>
      <div class="card" style="margin-top:20px"><div class="section-header">${ic('tag', 'icon-sm')} 缺失分類</div>
        <div class="detail-grid">
          <div class="detail-field"><div class="detail-field-label">缺失種類</div><div class="detail-field-value">${esc(item.deficiencyType)}</div></div>
          <div class="detail-field"><div class="detail-field-label">來源</div><div class="detail-field-value">${esc(item.source)}</div></div>
          <div class="detail-field"><div class="detail-field-label">條文</div><div class="detail-field-value">${esc(item.clause || '—')}</div></div>
        </div>
        <div class="detail-section" style="margin-top:12px"><div class="detail-section-title">分類</div><div class="detail-content">${cats || '—'}</div></div></div>
      <div class="card" style="margin-top:20px"><div class="section-header">${ic('message-square-warning', 'icon-sm')} 問題描述</div>
        <div class="detail-section"><div class="detail-section-title">問題或缺失說明</div><div class="detail-content">${esc(item.problemDesc)}</div></div>
        <div class="detail-section"><div class="detail-section-title">缺失發生過程</div><div class="detail-content">${esc(item.occurrence)}</div></div></div>
      ${item.correctiveAction ? `<div class="card" style="margin-top:20px"><div class="section-header">${ic('wrench', 'icon-sm')} 矯正措施提案</div>
        <div class="detail-section"><div class="detail-content">${esc(item.correctiveAction)}</div></div>
        <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">預定完成日期</div><div class="detail-field-value">${fmt(item.correctiveDueDate)}</div></div></div></div>` : ''}
      ${item.rootCause ? `<div class="card" style="margin-top:20px"><div class="section-header">${ic('microscope', 'icon-sm')} 根因分析</div>
        <div class="detail-section"><div class="detail-content">${esc(item.rootCause)}</div></div></div>` : ''}
      ${item.riskDesc ? `<div class="card" style="margin-top:20px"><div class="section-header">${ic('shield-alert', 'icon-sm')} 風險管理</div>
        <div class="detail-section"><div class="detail-content">${esc(item.riskDesc)}</div></div>
        <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">受理人員</div><div class="detail-field-value">${esc(item.riskAcceptor || '—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">受理日期</div><div class="detail-field-value">${fmt(item.riskAcceptDate)}</div></div>
        <div class="detail-field"><div class="detail-field-label">風險評鑑日期</div><div class="detail-field-value">${fmt(item.riskAssessDate)}</div></div></div></div>` : ''}
      ${item.rootElimination ? `<div class="card" style="margin-top:20px"><div class="section-header">${ic('shield-check', 'icon-sm')} 根因消除措施</div>
        <div class="detail-section"><div class="detail-content">${esc(item.rootElimination)}</div></div>
        <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">預定完成日期</div><div class="detail-field-value">${fmt(item.rootElimDueDate)}</div></div></div></div>` : ''}
      ${buildCaseCard('<span class="card-title">' + ic('paperclip', 'icon-sm') + ' 佐證文件</span>', evHtml, { style: 'margin-top:20px' })}
      ${pendingTrackingHtml}
      ${buildCaseCard('<span class="card-title">' + ic('git-branch', 'icon-sm') + ' 追蹤監控</span>', tkHtml, { style: 'margin-top:20px' })}
      ${buildCaseCard('<span class="card-title">' + ic('history', 'icon-sm') + ' 歷程紀錄</span>', '<div class="timeline">' + tl + '</div>', { style: 'margin-top:20px' })}
    </div>`;
    refreshIcons();
    bindCopyButtons();
  }

  
function handleStatusTransition(id, ns) {
    const item = getItem(id);
    const u = currentUser();
    if (!item || !u) return;
    if (!canAccessItem(item) || !canReview()) { toast('您沒有變更狀態的權限', 'error'); return; }
    const allowedTransitions = {
      [STATUSES.PROPOSED]: [STATUSES.REVIEWING],
      [STATUSES.REVIEWING]: [STATUSES.CLOSED, STATUSES.TRACKING, STATUSES.PENDING]
    };
    const next = allowedTransitions[item.status] || [];
    if (!next.includes(ns)) { toast(`不允許從「${item.status}」變更為「${ns}」`, 'error'); return; }
    const now = new Date().toISOString();
    const updates = { status: ns, updatedAt: now, pendingTracking: null, history: [...item.history, { time: now, action: `狀態變更為「${ns}」`, user: u.name }] };
    updates.closedDate = ns === STATUSES.CLOSED ? now : null;
    updateItem(id, updates);
    toast(`狀態已變更為「${ns}」`);
    renderDetail(id);
    renderSidebar();
    refreshIcons();
  };

  function handleReviewTracking(id, decision) {
    const item = getItem(id);
    const u = currentUser();
    if (!item || !u) return;
    if (!(item.status === STATUSES.TRACKING && item.pendingTracking && canReview())) { toast('目前沒有可審核的追蹤提報', 'error'); return; }
    const pending = item.pendingTracking;
    const round = pending.round || ((item.trackings || []).length + 1);
    const now = new Date().toISOString();
    const shouldClose = decision === 'close';
    const finalResult = shouldClose ? '同意結案' : '同意繼續追蹤';
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
      { time: now, action: `管理者審核第 ${round} 次追蹤提報`, user: u.name },
      { time: now, action: finalResult, user: u.name }
    ];
    if (!shouldClose && pending.nextTrackDate) {
      history.push({ time: now, action: `下一次追蹤日期：${pending.nextTrackDate}`, user: u.name });
    }
    if (pending.evidence && pending.evidence.length) {
      history.push({ time: now, action: `追蹤佐證歸檔 ${pending.evidence.length} 份`, user: u.name });
    }
    updateItem(id, {
      trackings: [...(item.trackings || []), approvedTracking],
      pendingTracking: null,
      status: shouldClose ? STATUSES.CLOSED : STATUSES.TRACKING,
      updatedAt: now,
      closedDate: shouldClose ? now : null,
      evidence: pending.evidence && pending.evidence.length ? [...(item.evidence || []), ...pending.evidence] : (item.evidence || []),
      history
    });
    toast(shouldClose ? '已同意結案' : '已同意繼續追蹤');
    renderDetail(id);
    renderSidebar();
    refreshIcons();
  };

  // ─── Render: Respond ───────────────────────
  
  function buildRespondPage(item) {
    return `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">回覆矯正單</h1><p class="page-subtitle">${esc(item.id)} · ${esc((item.problemDesc || '').substring(0, 48))}</p></div><a href="#detail/${item.id}" class="btn btn-secondary">返回單據</a></div>
      <div class="editor-shell editor-shell--respond">
        <section class="editor-main">
          <div class="card editor-card"><form id="respond-form">
            <div class="section-header">${ic('wrench', 'icon-sm')} 矯正措施與期限</div>
            <div class="form-group"><label class="form-label form-required">矯正措施說明</label><textarea class="form-textarea" id="r-action" placeholder="請說明預計採取的改善措施、執行方式與完成標準" required style="min-height:126px">${esc(item.correctiveAction || '')}</textarea></div>
            <div class="form-group"><label class="form-label form-required">預定完成日期</label><input type="date" class="form-input" id="r-due" value="${item.correctiveDueDate || ''}" required></div>
            <div class="section-header">${ic('microscope', 'icon-sm')} 根因分析</div>
            <div class="form-group"><label class="form-label form-required">根因說明</label><textarea class="form-textarea" id="r-root" placeholder="請說明缺失發生的根本原因，而不是只描述表面現象" required style="min-height:108px">${esc(item.rootCause || '')}</textarea></div>
            <div class="section-header">${ic('shield-check', 'icon-sm')} 根因消除措施</div>
            <div class="form-group"><label class="form-label form-required">消除措施</label><textarea class="form-textarea" id="r-elim" placeholder="請說明如何從制度、流程或系統面消除此根因" required style="min-height:108px">${esc(item.rootElimination || '')}</textarea></div>
            <div class="form-group"><label class="form-label">消除措施完成日期</label><input type="date" class="form-input" id="r-elimdue" value="${item.rootElimDueDate || ''}"></div>
            <div class="section-header">${ic('shield-alert', 'icon-sm')} 風險接受資訊</div>
            <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px">若評估暫時無法完全消除根因，可補充風險接受說明與責任歸屬。</p>
            <div class="form-group"><label class="form-label">風險說明</label><textarea class="form-textarea" id="r-risk" placeholder="請說明暫時保留的風險內容與影響" style="min-height:78px">${esc(item.riskDesc || '')}</textarea></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">風險接受人</label><input type="text" class="form-input" id="r-riskwho" value="${esc(item.riskAcceptor || '')}"></div>
              <div class="form-group"><label class="form-label">接受日期</label><input type="date" class="form-input" id="r-riskdate" value="${item.riskAcceptDate || ''}"></div>
              <div class="form-group"><label class="form-label">風險評估日期</label><input type="date" class="form-input" id="r-riskassess" value="${item.riskAssessDate || ''}"></div>
            </div>
            <div class="section-header">${ic('paperclip', 'icon-sm')} 佐證附件</div>
            <div class="upload-zone" id="upload-zone"><input type="file" id="file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">${ic('folder-open')}</div><div class="upload-zone-text">可拖曳檔案，或 <strong>點擊選擇</strong></div><div class="upload-zone-hint">支援 JPG、PNG、PDF，單檔 2MB 內</div></div>
            <div class="file-preview-list" id="file-previews"></div>
            <div class="form-actions"><button type="submit" class="btn btn-success">${ic('check-circle', 'icon-sm')} 送出回覆</button><a href="#detail/${item.id}" class="btn btn-secondary">取消返回</a></div>
          </form></div>
        </section>
        <aside class="editor-aside">
          <div class="editor-sticky">
            <div class="editor-side-card editor-side-card--accent">
              <div class="editor-side-kicker">Response Summary</div>
              <div class="editor-side-title">送審摘要</div>
              <div class="editor-side-text">送出前先檢查期限、根因與附件是否完整，避免被退回補件。</div>
              <div class="editor-summary-list editor-summary-list--compact">
                <div class="editor-summary-item"><span>案件編號</span><strong>${esc(item.id)}</strong></div>
                <div class="editor-summary-item"><span>處理人員</span><strong>${esc(item.handlerName || currentUser().name)}</strong></div>
                <div class="editor-summary-item"><span>改善期限</span><strong id="respond-summary-due">${item.correctiveDueDate ? fmt(item.correctiveDueDate) : '未指定'}</strong></div>
                <div class="editor-summary-item"><span>根因消除完成</span><strong id="respond-summary-elimdue">${item.rootElimDueDate ? fmt(item.rootElimDueDate) : '未指定'}</strong></div>
                <div class="editor-summary-item"><span>附件數量</span><strong id="respond-summary-files">0 份</strong></div>
              </div>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">送審前檢查</div>
              <div class="editor-step-list">
                <div class="editor-step-item"><span class="editor-step-badge">1</span><div><strong>措施要可驗證</strong><p>不要只寫「加強管理」，請明確寫出會執行的制度、流程或技術措施。</p></div></div>
                <div class="editor-step-item"><span class="editor-step-badge">2</span><div><strong>根因與改善要對應</strong><p>根因分析和消除措施必須互相對應，管理者才能快速判斷是否足以結案。</p></div></div>
                <div class="editor-step-item"><span class="editor-step-badge">3</span><div><strong>附件補足證據</strong><p>若有截圖、文件或簽核資料，這一階段就先補上，後續追蹤會更順。</p></div></div>
              </div>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">風險接受說明</div>
              <div class="editor-note-list">
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>只有在短期內無法完全消除根因時，才建議補充風險接受資訊。</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>若填寫風險接受人，建議同步補上接受日期與評估日期，資料會比較完整。</span></div>
              </div>
            </div>
          </div>
        </aside>
      </div></div>`;
  }

function renderRespond(id) {
    const item = getItem(id); if (!item) { navigate('list'); return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限存取此矯正單', 'error'); return; }
    const canRespond = canRespondItem(item);
    if (!canRespond) { navigate('detail/' + id); toast('目前無法回覆這筆待矯正案件', 'error'); return; }
    let tempEv = [];
    document.getElementById('app').innerHTML = buildRespondPage(item);
    refreshIcons();
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

    function syncRespondSummary() {
      summaryDue.textContent = dueInput.value ? fmt(dueInput.value) : '未指定';
      summaryElimDue.textContent = elimDueInput.value ? fmt(elimDueInput.value) : '未指定';
      summaryFiles.textContent = tempEv.length + ' 份';
    }

    function handleF(files) {
      Array.from(files).forEach(f => {
        if (f.size > 2 * 1024 * 1024) { toast(`${f.name} 超過 2MB`, 'error'); return; }
        const r = new FileReader();
        r.onload = e => { tempEv.push({ name: f.name, type: f.type, data: e.target.result }); updP(); };
        r.readAsDataURL(f);
      });
      if (fi) fi.value = '';
    }

    function updP() {
      fp.innerHTML = tempEv.map((e, i) => {
        const pv = e.type.startsWith('image/') ? `<img src="${e.data}" alt="${esc(e.name)}">` : `<div class="file-pdf-icon">${ic('file-box')}</div>`;
        return `<div class="file-preview-item">${pv}<div class="file-name">${esc(e.name)}</div><button type="button" class="file-remove" data-idx="${i}">移除</button></div>`;
      }).join('');
      fp.querySelectorAll('.file-remove').forEach(b => b.addEventListener('click', e => { tempEv.splice(parseInt(e.target.dataset.idx, 10), 1); if (fi) fi.value = ''; updP(); }));
      syncRespondSummary();
    }

    fi.addEventListener('change', e => handleF(e.target.files));
    uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('dragover'); });
    uz.addEventListener('dragleave', () => uz.classList.remove('dragover'));
    uz.addEventListener('drop', e => { e.preventDefault(); uz.classList.remove('dragover'); handleF(e.dataTransfer.files); });
    dueInput.addEventListener('change', syncRespondSummary);
    elimDueInput.addEventListener('change', syncRespondSummary);
    syncRespondSummary();

    document.getElementById('respond-form').addEventListener('submit', e => {
      e.preventDefault();
      const ca = document.getElementById('r-action').value.trim();
      const rc = document.getElementById('r-root').value.trim();
      const el = document.getElementById('r-elim').value.trim();
      if (!ca || !rc || !el) { toast('請完整填寫矯正措施、根因分析與根因消除措施', 'error'); return; }
      const now = new Date().toISOString(), li = getItem(id), u = currentUser();
      if (!li || !canAccessItem(li)) { toast('您沒有權限存取此矯正單', 'error'); navigate('list'); return; }
      if (!canRespondItem(li, u)) { toast('\u9019\u7b46\u6848\u4ef6\u76ee\u524d\u4e0d\u5141\u8a31\u9001\u51fa\u56de\u8986', 'error'); navigate('detail/' + id); return; }
      const upd = {
        correctiveAction: ca, correctiveDueDate: document.getElementById('r-due').value,
        rootCause: rc,
        rootElimination: el, rootElimDueDate: document.getElementById('r-elimdue').value || null,
        riskDesc: document.getElementById('r-risk').value.trim(),
        riskAcceptor: document.getElementById('r-riskwho').value.trim(),
        riskAcceptDate: document.getElementById('r-riskdate').value || null,
        riskAssessDate: document.getElementById('r-riskassess').value || null,
        status: STATUSES.PROPOSED, updatedAt: now,
        evidence: [...(li.evidence || []), ...tempEv],
        history: [...li.history, { time: now, action: `${u.name} 已回覆矯正措施`, user: u.name }, { time: now, action: `狀態變更為「${STATUSES.PROPOSED}」`, user: u.name }]
      };
      if (tempEv.length) upd.history.push({ time: now, action: `上傳 ${tempEv.length} 份佐證附件`, user: u.name });
      updateItem(id, upd); toast('矯正措施回覆已正式送出'); navigate('detail/' + id);
    });
  }

  function buildTrackingPage(item, round) {
    return `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">第 ${round} 次追蹤提報</h1><p class="page-subtitle">${esc(item.id)} · ${esc(item.handlerName || '')}</p></div><a href="#detail/${item.id}" class="btn btn-secondary">返回單據</a></div>
      <div class="editor-shell editor-shell--tracking">
        <section class="editor-main">
          <div class="card editor-card"><form id="track-form">
            <div class="section-header">${ic('clipboard-check', 'icon-sm')} 追蹤提報</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">填報人員</label><input type="text" class="form-input" id="tk-tracker" value="${esc(currentUser().name)}" readonly></div>
              <div class="form-group"><label class="form-label form-required">填報日期</label><input type="date" class="form-input" id="tk-date" value="${new Date().toISOString().split('T')[0]}" required></div>
            </div>
            <div class="form-group"><label class="form-label form-required">改善措施執行情形</label><textarea class="form-textarea" id="tk-exec" placeholder="請說明目前的改善進度、已完成內容與尚待處理事項" required style="min-height:112px"></textarea></div>
            <div class="form-group"><label class="form-label form-required">追蹤觀察與說明</label><textarea class="form-textarea" id="tk-note" placeholder="請記錄本次追蹤的判斷依據、重點發現或需補強事項" required style="min-height:88px"></textarea></div>
            <div class="section-header">${ic('check-circle', 'icon-sm')} 提報建議</div>
            <div class="form-group"><label class="form-label form-required">本次建議</label>${mkRadio('tkResult', ['擬請同意結案', '建議持續追蹤'], '')}</div>
            <div class="form-group" id="tk-next-wrap" style="display:none"><label class="form-label form-required">下一次追蹤日期</label><input type="date" class="form-input" id="tk-next"></div>
            <div class="form-group" id="tk-evidence-wrap" style="display:none"><label class="form-label form-required">結案佐證資料</label><div class="upload-zone" id="tk-upload-zone"><input type="file" id="tk-file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">${ic('folder-open')}</div><div class="upload-zone-text">可拖曳檔案，或 <strong>點擊選擇</strong></div><div class="upload-zone-hint">只有選擇「擬請同意結案」時，才會強制要求上傳佐證</div></div><div class="file-preview-list" id="tk-file-previews"></div></div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 送出追蹤提報</button><a href="#detail/${item.id}" class="btn btn-secondary">取消返回</a></div>
          </form></div>
        </section>
        <aside class="editor-aside">
          <div class="editor-sticky">
            <div class="editor-side-card editor-side-card--accent">
              <div class="editor-side-kicker">Tracking Summary</div>
              <div class="editor-side-title">追蹤提報摘要</div>
              <div class="editor-side-text">這一輪先由處理人員提出追蹤建議，再由管理者決定是否結案或繼續追蹤。</div>
              <div class="editor-summary-list editor-summary-list--compact">
                <div class="editor-summary-item"><span>案件編號</span><strong>${esc(item.id)}</strong></div>
                <div class="editor-summary-item"><span>追蹤輪次</span><strong>第 ${round} 次</strong></div>
                <div class="editor-summary-item"><span>填報日期</span><strong id="track-summary-date">${fmt(new Date().toISOString().split('T')[0])}</strong></div>
                <div class="editor-summary-item"><span>提報建議</span><strong id="track-summary-result">待判定</strong></div>
                <div class="editor-summary-item"><span>下一次追蹤</span><strong id="track-summary-next">未指定</strong></div>
              </div>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">提報規則</div>
              <div class="editor-step-list">
                <div class="editor-step-item"><span class="editor-step-badge">1</span><div><strong>擬請同意結案</strong><p>只有改善措施已完成，且可提供佐證資料時才使用。</p></div></div>
                <div class="editor-step-item"><span class="editor-step-badge">2</span><div><strong>建議持續追蹤</strong><p>仍需補強或觀察時使用，必須填寫下一次追蹤日期。</p></div></div>
                <div class="editor-step-item"><span class="editor-step-badge">3</span><div><strong>管理者核定</strong><p>送出後會回到案件明細，由管理者決定同意結案或同意繼續追蹤。</p></div></div>
              </div>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">案件脈絡</div>
              <div class="editor-note-list">
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>目前案件狀態：${esc(item.status)}</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>既有追蹤次數：${(item.trackings || []).length} 次</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>處理人員：${esc(item.handlerName || '未指定')}</span></div>
              </div>
            </div>
          </div>
        </aside>
      </div></div>`;
  }

function renderTracking(id) {
    const item = getItem(id); if (!item) { navigate('list'); return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限存取此矯正單', 'error'); return; }
    if (item.pendingTracking) { navigate('detail/' + id); toast('目前已有待管理者審核的追蹤提報', 'error'); return; }
    if (!canSubmitTracking(item)) { navigate('detail/' + id); toast('目前由處理人員填報追蹤結果，管理者負責審核', 'error'); return; }
    const round = (item.trackings || []).length + 1;
    if (round > 3) { toast('系統目前最多支援 3 次追蹤', 'error'); navigate('detail/' + id); return; }
    document.getElementById('app').innerHTML = buildTrackingPage(item, round);
    refreshIcons();
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

    function syncTrackingSummary() {
      summaryDate.textContent = dateInput.value ? fmt(dateInput.value) : '未指定';
      const selected = document.querySelector('input[name="tkResult"]:checked');
      const selectedValue = selected ? String(selected.value || '') : '';
      const isContinue = selectedValue.includes('追蹤');
      const isClosable = selectedValue.includes('結案');
      summaryResult.textContent = selected ? selected.value : '待判定';
      summaryNext.textContent = nextInput.value ? fmt(nextInput.value) : '未指定';
      nextWrap.style.display = isContinue ? 'block' : 'none';
      nextInput.required = !!isContinue;
      if (fileInput) fileInput.required = false;
      if (evidenceWrap) evidenceWrap.style.display = isClosable ? 'block' : 'none';
    }

    function handleTrackingFiles(files) {
      Array.from(files).forEach((file) => {
        if (file.size > 2 * 1024 * 1024) { toast(file.name + ' 超過 2MB', 'error'); return; }
        const reader = new FileReader();
        reader.onload = (event) => {
          tempEv.push({ name: file.name, type: file.type, data: event.target.result });
          updateTrackingPreviews();
        };
        reader.readAsDataURL(file);
      });
      if (fileInput) fileInput.value = '';
    }

    function updateTrackingPreviews() {
      if (!filePreviews) return;
      filePreviews.innerHTML = tempEv.map((file, index) => {
        const preview = file.type && file.type.startsWith('image/') ? '<img src="' + file.data + '" alt="' + esc(file.name) + '">' : '<div class="file-pdf-icon">' + ic('file-box') + '</div>';
        return '<div class="file-preview-item">' + preview + '<div class="file-name">' + esc(file.name) + '</div><button type="button" class="file-remove" data-idx="' + index + '">移除</button></div>';
      }).join('');
      filePreviews.querySelectorAll('.file-remove').forEach((button) => {
        button.addEventListener('click', (event) => {
          tempEv.splice(parseInt(event.target.dataset.idx, 10), 1);
          if (fileInput) fileInput.value = '';
          updateTrackingPreviews();
        });
      });
    }

    document.querySelectorAll('input[name="tkResult"]').forEach(r => r.addEventListener('change', syncTrackingSummary));
    dateInput.addEventListener('change', syncTrackingSummary);
    nextInput.addEventListener('change', syncTrackingSummary);
    if (fileInput) fileInput.addEventListener('change', (event) => handleTrackingFiles(event.target.files));
    if (uploadZone) {
      uploadZone.addEventListener('dragover', (event) => { event.preventDefault(); uploadZone.classList.add('dragover'); });
      uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
      uploadZone.addEventListener('drop', (event) => { event.preventDefault(); uploadZone.classList.remove('dragover'); handleTrackingFiles(event.dataTransfer.files); });
    }
    syncTrackingSummary();

    document.getElementById('track-form').addEventListener('submit', e => {
      e.preventDefault();
      const res = document.querySelector('input[name="tkResult"]:checked');
      if (!res) { toast('請選擇追蹤建議結果', 'error'); return; }
      const now = new Date().toISOString(), li = getItem(id), u = currentUser();
      if (!li || !canAccessItem(li)) { toast('您沒有權限存取此矯正單', 'error'); navigate('list'); return; }
      if (li.pendingTracking) { toast('目前已有待管理者審核的追蹤提報', 'error'); navigate('detail/' + id); return; }
      if (!canSubmitTracking(li, u)) { toast('目前只有處理人員可送出追蹤提報', 'error'); navigate('detail/' + id); return; }
      const isClose = res.value === '擬請同意結案';
      const isContinue = res.value === '建議持續追蹤';
      if (isContinue && !document.getElementById('tk-next').value) { toast('選擇建議持續追蹤時，請填寫下一次追蹤日期', 'error'); return; }
      if (isClose && tempEv.length === 0) { toast('選擇擬請同意結案時，請上傳佐證資料', 'error'); return; }
      const submission = {
        round,
        tracker: document.getElementById('tk-tracker').value,
        trackDate: document.getElementById('tk-date').value,
        execution: document.getElementById('tk-exec').value.trim(),
        trackNote: document.getElementById('tk-note').value.trim(),
        result: res.value,
        nextTrackDate: isContinue ? (document.getElementById('tk-next').value || null) : null,
        evidence: tempEv.slice(),
        submittedAt: now
      };
      const history = [
        ...(li.history || []),
        { time: now, action: `提交第 ${round} 次追蹤提報`, user: u.name },
        { time: now, action: `提報建議：${res.value}`, user: u.name }
      ];
      if (submission.nextTrackDate) history.push({ time: now, action: `建議下一次追蹤日期：${submission.nextTrackDate}`, user: u.name });
      if (submission.evidence.length) history.push({ time: now, action: `上傳 ${submission.evidence.length} 份追蹤佐證`, user: u.name });
      updateItem(id, {
        pendingTracking: submission,
        updatedAt: now,
        history
      });
      toast('追蹤提報已送出，待管理者審核');
      navigate('detail/' + id);
    });
  }

  
  function formatUserUnitSummary(user) {
    const units = getAuthorizedUnits(user);
    if (user?.role === ROLES.VIEWER && !units.length) return '全校唯讀';
    if (!units.length) return '未指定';
    return units.join('、');
  }
  registerActionHandlers('case', {
    statusTransition: function ({ dataset }) {
      handleStatusTransition(dataset.id, dataset.status);
    },
    reviewTracking: function ({ dataset }) {
      handleReviewTracking(dataset.id, dataset.decision);
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
