// =============================================
// ISMS Internal Audit Tracking System - v4
// =============================================
(function () {
  'use strict';
  const DATA_KEY = 'cats_data', AUTH_KEY = 'cats_auth', CHECKLIST_KEY = 'cats_checklists', TEMPLATE_KEY = 'cats_checklist_template', TRAINING_KEY = 'cats_training_hours', LOGIN_LOG_KEY = 'cats_login_log';
  const STATUSES = { CREATED: '開立', PENDING: '待矯正', PROPOSED: '已提案', REVIEWING: '審核中', TRACKING: '追蹤中', CLOSED: '結案' };
  const STATUS_CLASSES = { [STATUSES.CREATED]: 'created', [STATUSES.PENDING]: 'pending', [STATUSES.PROPOSED]: 'proposed', [STATUSES.REVIEWING]: 'reviewing', [STATUSES.TRACKING]: 'tracking', [STATUSES.CLOSED]: 'closed' };
  const STATUS_FLOW = [STATUSES.CREATED, STATUSES.PENDING, STATUSES.PROPOSED, STATUSES.REVIEWING, STATUSES.TRACKING, STATUSES.CLOSED];
  const ROLES = { ADMIN: '最高管理員', UNIT_ADMIN: '單位管理員', REPORTER: '填報人' };
  const ROLE_BADGE = { [ROLES.ADMIN]: 'badge-admin', [ROLES.UNIT_ADMIN]: 'badge-unit-admin', [ROLES.REPORTER]: 'badge-reporter' };
  const TRAINING_STATUSES = { DRAFT: '暫存', SUBMITTED: '正式送出', RETURNED: '退回更正' };
  const DEF_TYPES = ['主要缺失', '次要缺失', '觀察', '建議'];
  const SOURCES = ['內部稽核', '外部稽核', '教育部稽核', '資安事故', '系統變更', '使用者抱怨', '其他'];
  const CATEGORIES = ['人員', '資訊', '通訊', '軟體', '硬體', '個資', '服務', '虛擬機', '基礎設施', '可攜式設備', '其他'];
  const DEFAULT_USERS = [
    { username: 'admin', password: 'admin123', name: '系統管理員', role: ROLES.ADMIN, unit: '計算機及資訊網路中心／資訊網路組', email: 'admin@company.com' },
    { username: 'unit1', password: 'unit123', name: '王經理', role: ROLES.UNIT_ADMIN, unit: '計算機及資訊網路中心／資訊網路組', email: 'wang@company.com' },
    { username: 'unit2', password: 'unit123', name: '張稽核員', role: ROLES.UNIT_ADMIN, unit: '稽核室', email: 'zhang@company.com' },
    { username: 'user1', password: 'user123', name: '李工程師', role: ROLES.REPORTER, unit: '計算機及資訊網路中心／資訊網路組', email: 'li@company.com' },
    { username: 'user2', password: 'user123', name: '陳資安主管', role: ROLES.REPORTER, unit: '計算機及資訊網路中心／資訊網路組', email: 'chen@company.com' },
    { username: 'user3', password: 'user123', name: '黃工程師', role: ROLES.REPORTER, unit: '總務處／營繕組', email: 'huang@company.com' },
    { username: 'user4', password: 'user123', name: '劉文管人員', role: ROLES.REPORTER, unit: '人事室／綜合業務組', email: 'liu@company.com' },
  ];

  function getOfficialUnits() {
    try {
      if (typeof window !== 'undefined' && typeof window.getOfficialUnitList_ === 'function') {
        const units = window.getOfficialUnitList_();
        if (Array.isArray(units)) return units;
      }
    } catch (_) { }
    return [];
  }

  function getSystemUnits() {
    const set = new Set(getOfficialUnits());
    try {
      const data = loadData();
      (data.users || []).forEach((u) => { if (u && u.unit) set.add(String(u.unit)); });
      (data.items || []).forEach((i) => {
        if (i && i.proposerUnit) set.add(String(i.proposerUnit));
        if (i && i.handlerUnit) set.add(String(i.handlerUnit));
      });
    } catch (_) { }
    try {
      const checks = loadChecklists();
      (checks.items || []).forEach((c) => { if (c && c.unit) set.add(String(c.unit)); });
    } catch (_) { }
    try {
      const tr = loadTrainingStore();
      (tr.forms || []).forEach((f) => { if (f && f.unit) set.add(String(f.unit)); });
      (tr.rosters || []).forEach((r) => { if (r && r.unit) set.add(String(r.unit)); });
    } catch (_) { }
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }

  function buildUnitOptions(units, selected, includeEmpty) {
    const list = Array.isArray(units) ? units : [];
    const safeSelected = String(selected || '');
    const base = includeEmpty ? '<option value="">請選擇</option>' : '';
    return base + list.map((u) => `<option value="${esc(u)}" ${safeSelected === u ? 'selected' : ''}>${esc(u)}</option>`).join('');
  }

  function getUnitStructureSafe() {
    try {
      if (typeof window !== 'undefined' && typeof window.getUnitStructure_ === 'function') {
        const structure = window.getUnitStructure_();
        if (structure && typeof structure === 'object') return structure;
      }
    } catch (_) { }
    return {};
  }

  function splitUnitValue(unitValue) {
    const raw = String(unitValue || '').trim();
    if (!raw) return { parent: '', child: '' };
    const sep = raw.includes('／') ? '／' : (raw.includes('/') ? '/' : '');
    if (!sep) return { parent: raw, child: '' };
    const parts = raw.split(sep);
    const parent = String(parts.shift() || '').trim();
    const child = String(parts.join(sep) || '').trim();
    return { parent, child };
  }

  function composeUnitValue(parent, child) {
    const p = String(parent || '').trim();
    const c = String(child || '').trim();
    if (!p) return '';
    return c ? `${p}／${c}` : p;
  }

  function buildUnitCascadeControl(baseId, selectedUnit, disabled, required) {
    const dis = disabled ? 'disabled' : '';
    const req = required ? 'required' : '';
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <select class="form-select" id="${baseId}-parent" ${dis} ${req}></select>
      <select class="form-select" id="${baseId}-child" ${dis}></select>
      <input type="hidden" id="${baseId}" value="${esc(selectedUnit || '')}" />
    </div>`;
  }

  function initUnitCascade(baseId, initialValue, options) {
    const opts = options || {};
    const parentEl = document.getElementById(`${baseId}-parent`);
    const childEl = document.getElementById(`${baseId}-child`);
    const hiddenEl = document.getElementById(baseId);
    if (!parentEl || !childEl || !hiddenEl) return;

    const structure = getUnitStructureSafe();
    const parsed = splitUnitValue(initialValue || hiddenEl.value);
    const parentSet = new Set(Object.keys(structure || {}));
    if (parsed.parent) parentSet.add(parsed.parent);
    const parents = Array.from(parentSet).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

    parentEl.innerHTML = '<option value="">請選擇一級單位</option>' + parents.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

    const syncHidden = (dispatchChange) => {
      const parent = String(parentEl.value || '').trim();
      const hasChildren = Array.isArray(structure[parent]) && structure[parent].length > 0;
      const child = (!childEl.disabled && hasChildren) ? String(childEl.value || '').trim() : '';
      hiddenEl.value = composeUnitValue(parent, child);
      if (dispatchChange) hiddenEl.dispatchEvent(new Event('change'));
    };

    const renderChildren = (parent, selectedChild) => {
      const children = Array.isArray(structure[parent]) ? [...structure[parent]] : [];
      const child = String(selectedChild || '').trim();
      if (child && !children.includes(child)) children.unshift(child);

      if (!parent) {
        childEl.innerHTML = '<option value="">請先選擇一級單位</option>';
        childEl.disabled = true;
        return;
      }

      if (children.length === 0) {
        childEl.innerHTML = '<option value="">無二級單位</option>';
        childEl.disabled = true;
        return;
      }

      childEl.disabled = false;
      childEl.innerHTML = '<option value="">請選擇二級單位（選填）</option>' + children.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      if (child) childEl.value = child;
    };

    parentEl.addEventListener('change', () => {
      renderChildren(parentEl.value, '');
      syncHidden(true);
    });
    childEl.addEventListener('change', () => syncHidden(true));

    if (parsed.parent) parentEl.value = parsed.parent;
    renderChildren(parentEl.value, parsed.child);
    syncHidden(false);

    if (opts.disabled) {
      parentEl.disabled = true;
      childEl.disabled = true;
    }
  }
  const STORAGE_CACHE = Object.create(null);
  function readCachedJson(key, fallbackFactory) {
    const raw = localStorage.getItem(key);
    const hit = STORAGE_CACHE[key];
    if (hit && hit.raw === raw) return hit.parsed;
    if (raw !== null && raw !== undefined) {
      try {
        const parsed = JSON.parse(raw);
        STORAGE_CACHE[key] = { raw, parsed };
        return parsed;
      } catch (_) { }
    }
    const fallback = fallbackFactory();
    STORAGE_CACHE[key] = { raw: JSON.stringify(fallback), parsed: fallback };
    return fallback;
  }
  function writeCachedJson(key, value) {
    const raw = JSON.stringify(value);
    STORAGE_CACHE[key] = { raw, parsed: value };
    localStorage.setItem(key, raw);
  }
  function removeCachedJson(key) {
    delete STORAGE_CACHE[key];
    localStorage.removeItem(key);
  }
  function createDefaultData() {
    return { items: [], users: DEFAULT_USERS.map(u => ({ ...u })), nextId: 1 };
  }
  function loadData() { return readCachedJson(DATA_KEY, createDefaultData); }
  function saveData(d) { writeCachedJson(DATA_KEY, d); }
  function getAllItems() { return loadData().items.slice(); }
  function getItem(id) { return loadData().items.find(i => i.id === id); }
  function addItem(item) { const d = loadData(); d.items.push(item); saveData(d); }
  function updateItem(id, updates) { const d = loadData(); const i = d.items.findIndex(x => x.id === id); if (i >= 0) { d.items[i] = { ...d.items[i], ...updates }; saveData(d); } }
  function generateId() { const d = loadData(); const id = `CAR-${String(d.nextId).padStart(4, '0')}`; d.nextId++; saveData(d); return id; }
  function getUsers() { return loadData().users.slice(); }
  function addUser(user) { const d = loadData(); d.users.push(user); saveData(d); }
  function updateUser(un, upd) { const d = loadData(); const i = d.users.findIndex(u => u.username === un); if (i >= 0) { d.users[i] = { ...d.users[i], ...upd }; saveData(d); } }
  function deleteUser(un) { const d = loadData(); d.users = d.users.filter(u => u.username !== un); saveData(d); }
  function findUser(un) { return loadData().users.find(u => u.username === un); }
  function findUserByEmail(em) { return loadData().users.find(u => u.email && u.email.toLowerCase() === em.toLowerCase()); }
  function generatePassword() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; let p = ''; for (let i = 0; i < 8; i++)p += c[Math.floor(Math.random() * c.length)]; return p; }
  function loadLoginLogs() {
    const logs = readCachedJson(LOGIN_LOG_KEY, () => []);
    return Array.isArray(logs) ? logs : [];
  }
  function saveLoginLogs(logs) { writeCachedJson(LOGIN_LOG_KEY, Array.isArray(logs) ? logs : []); }
  function addLoginLog(username, user, success) {
    const logs = loadLoginLogs();
    logs.push({
      time: new Date().toISOString(),
      username: (username || '').trim(),
      name: user?.name || '',
      role: user?.role || '',
      success: !!success
    });
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    saveLoginLogs(logs);
  }
  function clearLoginLogs() { removeCachedJson(LOGIN_LOG_KEY); }
  function login(un, pw) {
    const u = findUser(un);
    const ok = !!(u && u.password === pw);
    addLoginLog(un, u, ok);
    if (ok) {
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(u));
      return u;
    }
    return null;
  }
  function logout() { sessionStorage.removeItem(AUTH_KEY); renderApp(); }
  function currentUser() { try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)); } catch { return null; } }
  function isAdmin() { return currentUser()?.role === ROLES.ADMIN; }
  function isUnitAdmin() { return currentUser()?.role === ROLES.UNIT_ADMIN; }
  function canCreateCAR() { return isAdmin() || isUnitAdmin(); }
  function canReview() { return isAdmin() || isUnitAdmin(); }
  function canFillChecklist() { return isAdmin() || isUnitAdmin(); }
  function canFillTraining() { return !!currentUser(); }
  function canManageUsers() { return isAdmin(); }
  function fmt(d) { if (!d) return '—'; const x = new Date(d); return `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}`; }
  function fmtTime(d) { if (!d) return '—'; const x = new Date(d); return `${fmt(d)} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; }
  function isOverdue(item) { return item.status !== STATUSES.CLOSED && item.correctiveDueDate && new Date(item.correctiveDueDate) < new Date(); }
  function ic(n, c = '') { return `<i data-lucide="${n}" ${c ? 'class="' + c + '"' : ''}></i>`; }
  function ntuLogo(c = '') { return '<span class="ntu-logo ' + c + '">NTU</span>'; }
  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function toast(msg, type = 'success') { const c = document.getElementById('toast-container'); if (!c) return; const t = document.createElement('div'); t.className = `toast toast-${type}`; t.innerHTML = `<span class="toast-message">${esc(msg)}</span>`; c.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; t.style.transition = 'all 300ms'; }, 2500); setTimeout(() => t.remove(), 2800); }
  function navigate(h) { window.location.hash = h; }
  function getRoute() { const h = window.location.hash.slice(1) || 'dashboard'; const p = h.split('/'); return { page: p[0], param: p[1] }; }
  let isSidebarOpen = false;
  function isMobileViewport() {
    if (window.matchMedia) return window.matchMedia('(max-width: 768px)').matches;
    return window.innerWidth <= 768;
  }
  function setSidebarOpen(nextOpen) {
    isSidebarOpen = !!nextOpen && isMobileViewport();
    if (!document.body) return;
    document.body.classList.toggle('sidebar-open', isSidebarOpen);
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('show', isSidebarOpen);
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) backdrop.classList.toggle('show', isSidebarOpen);
  }
  function closeSidebar() { setSidebarOpen(false); }
  function toggleSidebar() { setSidebarOpen(!isSidebarOpen); }
  let iconRetryTimer = null;
  let iconRetryCount = 0;
  function refreshIcons() {
    const lucideApi = window.lucide;
    if (!lucideApi || typeof lucideApi.createIcons !== 'function') {
      if (!iconRetryTimer && iconRetryCount < 20) {
        iconRetryTimer = setTimeout(() => {
          iconRetryTimer = null;
          iconRetryCount += 1;
          refreshIcons();
        }, 120);
      }
      return;
    }
    iconRetryCount = 0;
    if (iconRetryTimer) {
      clearTimeout(iconRetryTimer);
      iconRetryTimer = null;
    }
    const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
    raf(() => lucideApi.createIcons());
  }
  function getVisibleItems() { const u = currentUser(); if (!u) return []; const all = getAllItems(); if (u.role === ROLES.ADMIN) return all; if (u.role === ROLES.UNIT_ADMIN) return all.filter(i => i.proposerUnit === u.unit || i.handlerUnit === u.unit || i.proposerName === u.name); return all.filter(i => i.handlerName === u.name); }
  function canAccessItem(item) {
    if (!item) return false;
    const u = currentUser();
    if (!u) return false;
    if (u.role === ROLES.ADMIN) return true;
    if (u.role === ROLES.UNIT_ADMIN) return item.proposerUnit === u.unit || item.handlerUnit === u.unit || item.proposerName === u.name;
    return item.handlerName === u.name;
  }
  function mkChk(name, opts, sel) { return '<div class="checkbox-group">' + opts.map(o => '<label class="chk-label"><input type="checkbox" name="' + name + '" value="' + o + '" ' + ((sel || []).includes(o) ? 'checked' : '') + '><span class="chk-box"></span>' + o + '</label>').join('') + '</div>'; }
  function mkRadio(name, opts, sel) { return '<div class="radio-group">' + opts.map(o => '<label class="radio-label"><input type="radio" name="' + name + '" value="' + o + '" ' + (sel === o ? 'checked' : '') + '><span class="radio-dot"></span>' + o + '</label>').join('') + '</div>'; }

  // ─── Render: Login ─────────────────────────
  function renderLogin() {
    document.body.innerHTML = '<div class="login-page"><div class="login-card">' +
      '<div class="login-logo"><span class="login-logo-icon">' + ntuLogo('ntu-logo-lg') + '</span><h1>內部稽核管考追蹤系統</h1><p>ISMS Corrective Action Tracking</p></div>' +
      '<div class="login-error" id="login-error">帳號或密碼錯誤</div>' +
      '<div id="login-panel"><form class="login-form" id="login-form">' +
      '<div class="form-group"><label class="form-label">帳號</label><input type="text" class="form-input" id="login-user" placeholder="請輸入帳號" required autofocus></div>' +
      '<div class="form-group"><label class="form-label">密碼</label><input type="password" class="form-input" id="login-pass" placeholder="請輸入密碼" required></div>' +
      '<button type="submit" class="login-btn">登入系統 ' + ic('arrow-right', 'icon-sm') + '</button>' +
      '</form>' +
      '<p style="text-align:center;margin-top:14px"><a href="#" id="forgot-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">忘記密碼？</a></p></div>' +
      '<div id="forgot-panel" style="display:none">' +
      '<div style="text-align:center;margin-bottom:18px">' + ic('key', 'icon-xl') + '<h3 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">重設密碼</h3></div>' +
      '<div class="login-error" id="forgot-error">找不到此信箱對應的帳號</div>' +
      '<form class="login-form" id="forgot-form"><div class="form-group"><label class="form-label">電子信箱</label><input type="email" class="form-input" id="forgot-email" placeholder="請輸入註冊時的信箱" required></div>' +
      '<button type="submit" class="login-btn" style="background:linear-gradient(135deg,#f59e0b,#d97706)">' + ic('mail', 'icon-sm') + ' 取得新密碼</button></form>' +
      '<div id="forgot-result" style="display:none;margin-top:16px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;text-align:center">' +
      '<p style="font-size:.88rem;color:#15803d;font-weight:600">密碼已重設成功！</p>' +
      '<p style="font-size:.82rem;color:var(--text-secondary)">帳號：<strong id="reset-username"></strong></p>' +
      '<p style="font-size:1.1rem;font-weight:700;color:var(--text-heading);margin-top:6px;font-family:monospace;background:#f0f2f7;padding:8px;border-radius:8px" id="reset-newpass"></p></div>' +
      '<p style="text-align:center;margin-top:14px"><a href="#" id="back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">← 返回登入</a></p></div>' +
      '<div class="login-hint"><p>預設測試帳號</p><table>' +
      '<tr><th>角色</th><th>帳號</th><th>密碼</th></tr>' +
      '<tr><td>最高管理員</td><td>admin</td><td>admin123</td></tr>' +
      '<tr><td>單位管理員</td><td>unit1</td><td>unit123</td></tr>' +
      '<tr><td>填報人</td><td>user1</td><td>user123</td></tr>' +
      '</table></div></div></div><div class="toast-container" id="toast-container"></div>';
    document.getElementById('login-form').addEventListener('submit', function (e) { e.preventDefault(); var u = document.getElementById('login-user').value.trim(), p = document.getElementById('login-pass').value; var user = login(u, p); if (user) { toast('歡迎回來，' + user.name + '！'); setTimeout(function () { renderApp(); }, 300); } else { document.getElementById('login-error').classList.add('show'); } });
    document.getElementById('forgot-link').addEventListener('click', function (e) { e.preventDefault(); document.getElementById('login-panel').style.display = 'none'; document.getElementById('login-error').classList.remove('show'); document.getElementById('forgot-panel').style.display = 'block'; });
    document.getElementById('back-login-link').addEventListener('click', function (e) { e.preventDefault(); document.getElementById('forgot-panel').style.display = 'none'; document.getElementById('login-panel').style.display = 'block'; });
    document.getElementById('forgot-form').addEventListener('submit', function (e) { e.preventDefault(); var email = document.getElementById('forgot-email').value.trim(); var user = findUserByEmail(email); if (!user) { document.getElementById('forgot-error').classList.add('show'); return; } document.getElementById('forgot-error').classList.remove('show'); var np = generatePassword(); updateUser(user.username, { password: np }); document.getElementById('reset-username').textContent = user.username; document.getElementById('reset-newpass').textContent = np; document.getElementById('forgot-result').style.display = 'block'; document.getElementById('forgot-form').style.display = 'none'; toast('密碼已重設成功！', 'info'); });
    refreshIcons();
  }

  // ─── Render: App Shell ─────────────────────
  function renderApp() { var u = currentUser(); if (!u) { renderLogin(); return; } document.body.innerHTML = '<aside class="sidebar" id="sidebar"></aside><div class="sidebar-backdrop" id="sidebar-backdrop" onclick="window._closeSidebar()"></div><header class="header" id="header"></header><main class="main-content" id="app"></main><div class="toast-container" id="toast-container"></div><div id="modal-root"></div>'; handleRoute(); refreshIcons(); }

  // ─── Render: Sidebar ───────────────────────
  function renderSidebar() {
    var u = currentUser(); if (!u) return; var items = getVisibleItems(); var pc = items.filter(function (i) { return i.status === STATUSES.PENDING || isOverdue(i); }).length; var r = getRoute(); var nav = '<div class="sidebar-section"><div class="sidebar-section-title">主選單</div>' +
      '<a class="nav-item ' + (r.page === 'dashboard' ? 'active' : '') + '" href="#dashboard"><span class="nav-icon">' + ic('pie-chart') + '</span>儀表板</a>' +
      '<a class="nav-item ' + (r.page === 'list' ? 'active' : '') + '" href="#list"><span class="nav-icon">' + ic('file-text') + '</span>矯正單列表' + (pc ? '<span class="nav-badge">' + pc + '</span>' : '') + '</a>' +
      '<a class="nav-item ' + (r.page === 'checklist' || r.page === 'checklist-fill' || r.page === 'checklist-detail' ? 'active' : '') + '" href="#checklist"><span class="nav-icon">' + ic('clipboard-check') + '</span>內稽檢核表</a>' +
      '<a class="nav-item ' + (r.page === 'training' || r.page === 'training-fill' || r.page === 'training-detail' || r.page === 'training-roster' ? 'active' : '') + '" href="#training"><span class="nav-icon">' + ic('graduation-cap') + '</span>教育訓練時數統計</a></div>';
    var opNav = '';
    if (canCreateCAR()) opNav += '<a class="nav-item ' + (r.page === 'create' ? 'active' : '') + '" href="#create"><span class="nav-icon">' + ic('pen-tool') + '</span>開立矯正單</a>';
    if (canFillChecklist()) opNav += '<a class="nav-item ' + (r.page === 'checklist-fill' ? 'active' : '') + '" href="#checklist-fill"><span class="nav-icon">' + ic('edit-3') + '</span>填報檢核表</a>';
    if (opNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">操作</div>' + opNav + '</div>';
    var sysNav = '';
    if (canManageUsers()) sysNav += '<a class="nav-item ' + (r.page === 'users' ? 'active' : '') + '" href="#users"><span class="nav-icon">' + ic('users') + '</span>帳號管理</a>';
    if (canManageUsers()) sysNav += '<a class="nav-item ' + (r.page === 'login-log' ? 'active' : '') + '" href="#login-log"><span class="nav-icon">' + ic('shield-check') + '</span>登入紀錄</a>';
    if (isAdmin()) sysNav += '<a class="nav-item ' + (r.page === 'checklist-manage' ? 'active' : '') + '" href="#checklist-manage"><span class="nav-icon">' + ic('settings') + '</span>檢核表管理</a>';
    if (sysNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">系統管理</div>' + sysNav + '</div>';
    var sidebarEl = document.getElementById('sidebar'); sidebarEl.innerHTML = '<div class="sidebar-logo"><span class="sidebar-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><div class="sidebar-brand-text"><h1>內部稽核管考追蹤系統</h1><p>ISMS Corrective Action</p></div></div><nav class="sidebar-nav">' + nav + '</nav><div class="sidebar-footer"><span class="badge-role ' + ROLE_BADGE[u.role] + '">' + u.role + '</span></div>';
    sidebarEl.querySelectorAll('a.nav-item').forEach(function (link) {
      link.addEventListener('click', function () { if (isMobileViewport()) closeSidebar(); });
    });
  }

  function renderHeader() {
    var u = currentUser(); if (!u) return; var titles = { dashboard: '儀表板', list: '矯正單列表', create: '開立矯正單', detail: '矯正單詳情', respond: '回填矯正措施', tracking: '追蹤監控', users: '帳號管理', 'login-log': '登入紀錄', checklist: '內稽檢核表', 'checklist-fill': '填報檢核表', 'checklist-detail': '檢核表詳情', 'checklist-manage': '檢核表管理', training: '教育訓練時數統計', 'training-fill': '填報教育訓練時數', 'training-detail': '教育訓練填報詳情', 'training-roster': '教育訓練名單管理' }; var r = getRoute();
    document.getElementById('header').innerHTML = '<div class="header-left"><button type="button" class="header-menu-btn" onclick="window._toggleSidebar()" aria-label="open menu">' + ic('menu') + '</button><span class="header-title">' + (titles[r.page] || '內部稽核管考追蹤系統') + '</span></div><div class="header-right"><div class="header-user"><span class="header-user-name">' + esc(u.name) + '</span><span class="header-user-role">' + u.role + '</span><div class="header-user-avatar">' + esc(u.name[0]) + '</div></div><button class="btn-logout" onclick="window._logout()">登出</button></div>';
  }
  window._logout = function () { logout(); };
  window._toggleSidebar = function () { toggleSidebar(); };
  window._closeSidebar = function () { closeSidebar(); };

  // ─── Render: Dashboard ─────────────────────
  function renderDashboard() {
    var items = getVisibleItems(); var total = items.length; var pending = items.filter(function (i) { return i.status === STATUSES.PENDING; }).length; var overdue = items.filter(function (i) { return isOverdue(i); }).length; var now2 = new Date(); var closedM = items.filter(function (i) { return i.status === STATUSES.CLOSED && i.closedDate && new Date(i.closedDate).getMonth() === now2.getMonth() && new Date(i.closedDate).getFullYear() === now2.getFullYear(); }).length;
    var sc = {}; STATUS_FLOW.forEach(function (s) { sc[s] = 0; }); items.forEach(function (i) { if (sc[i.status] !== undefined) sc[i.status]++; });
    var cc = {}; cc[STATUSES.CREATED] = '#3b82f6'; cc[STATUSES.PENDING] = '#f59e0b'; cc[STATUSES.PROPOSED] = '#a855f7'; cc[STATUSES.REVIEWING] = '#06b6d4'; cc[STATUSES.TRACKING] = '#f97316'; cc[STATUSES.CLOSED] = '#22c55e';
    var R = 60, C = 2 * Math.PI * R; var segs = '', off = 0;
    if (total > 0) { STATUS_FLOW.forEach(function (s) { var c2 = sc[s]; if (!c2) return; var l = c2 / total * C; segs += '<circle r="' + R + '" cx="80" cy="80" fill="none" stroke="' + cc[s] + '" stroke-width="20" stroke-dasharray="' + l + ' ' + (C - l) + '" stroke-dashoffset="' + (-off) + '"/>'; off += l; }); } else { segs = '<circle r="' + R + '" cx="80" cy="80" fill="none" stroke="#e2e8f0" stroke-width="20"/>'; }
    var svg = '<svg viewBox="0 0 160 160" class="donut-chart">' + segs + '<text x="80" y="74" text-anchor="middle" fill="#0f172a" font-size="24" font-weight="700" font-family="Inter">' + total + '</text><text x="80" y="94" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="500" font-family="Inter">總計</text></svg>';
    var leg = STATUS_FLOW.map(function (s) { return '<div class="legend-item"><span class="legend-dot" style="background:' + cc[s] + '"></span><span>' + s + '</span><span class="legend-count">' + sc[s] + '</span></div>'; }).join('');
    var recent = items.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 5);
    var rr = recent.length ? recent.map(function (i) { return '<tr onclick="location.hash=\'detail/' + i.id + '\'"><td>' + esc(i.id) + '</td><td>' + esc(i.problemDesc || '').substring(0, 30) + '</td><td><span class="badge badge-' + (isOverdue(i) ? 'overdue' : STATUS_CLASSES[i.status]) + '"><span class="badge-dot"></span>' + (isOverdue(i) ? '已逾期' : i.status) + '</span></td><td>' + esc(i.handlerName) + '</td><td>' + fmt(i.correctiveDueDate) + '</td></tr>'; }).join('') : '<tr><td colspan="5"><div class="empty-state" style="padding:40px"><div class="empty-state-icon">' + ic('inbox') + '</div><div class="empty-state-title">尚無矯正單</div></div></td></tr>';
    var createBtn = canCreateCAR() ? '<a href="#create" class="btn btn-primary">' + ic('plus-circle', 'icon-sm') + ' 開立矯正單</a>' : '';
    document.getElementById('app').innerHTML = '<div class="animate-in">' +
      '<div class="page-header"><div><h1 class="page-title">儀表板</h1><p class="page-subtitle">內部稽核管考追蹤系統總覽</p></div>' + createBtn + '</div>' +
      '<div class="stats-grid">' +
      '<div class="stat-card total"><div class="stat-icon">' + ic('files') + '</div><div class="stat-value">' + total + '</div><div class="stat-label">矯正單總數</div></div>' +
      '<div class="stat-card pending"><div class="stat-icon">' + ic('clock') + '</div><div class="stat-value">' + pending + '</div><div class="stat-label">待矯正</div></div>' +
      '<div class="stat-card overdue"><div class="stat-icon">' + ic('alert-triangle') + '</div><div class="stat-value">' + overdue + '</div><div class="stat-label">已逾期</div></div>' +
      '<div class="stat-card closed"><div class="stat-icon">' + ic('check-circle-2') + '</div><div class="stat-value">' + closedM + '</div><div class="stat-label">本月結案</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">' +
      '<div class="card"><div class="card-header"><span class="card-title">狀態分布</span></div><div class="donut-chart-container">' + svg + '<div class="donut-legend">' + leg + '</div></div></div>' +
      '<div class="card"><div class="card-header"><span class="card-title">最近矯正單</span><a href="#list" class="btn btn-ghost btn-sm">查看全部 →</a></div><div class="table-wrapper"><table><thead><tr><th>單號</th><th>說明</th><th>狀態</th><th>處理人</th><th>預定完成</th></tr></thead><tbody>' + rr + '</tbody></table></div></div>' +
      '</div></div>';
    refreshIcons();
  }

  // ─── Render: List ──────────────────────────
  var curFilter = '全部', curSearch = '';
  function renderList() {
    var items = getVisibleItems(); var filters = ['全部'].concat(STATUS_FLOW).concat(['已逾期']); var filtered = items.slice();
    if (curFilter === '已逾期') filtered = items.filter(function (i) { return isOverdue(i); }); else if (curFilter !== '全部') filtered = items.filter(function (i) { return i.status === curFilter; });
    if (curSearch) { var q = curSearch.toLowerCase(); filtered = filtered.filter(function (i) { return i.id.toLowerCase().indexOf(q) >= 0 || (i.problemDesc || '').toLowerCase().indexOf(q) >= 0 || i.handlerName.toLowerCase().indexOf(q) >= 0 || i.proposerName.toLowerCase().indexOf(q) >= 0; }); }
    filtered.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    var rows = filtered.length ? filtered.map(function (i) { return '<tr onclick="location.hash=\'detail/' + i.id + '\'"><td>' + esc(i.id) + '</td><td>' + esc(i.deficiencyType) + '</td><td>' + esc(i.source) + '</td><td><span class="badge badge-' + (isOverdue(i) ? 'overdue' : STATUS_CLASSES[i.status]) + '"><span class="badge-dot"></span>' + (isOverdue(i) && i.status !== STATUSES.CLOSED ? '已逾期' : i.status) + '</span></td><td>' + esc(i.proposerName) + '</td><td>' + esc(i.handlerName) + '</td><td>' + fmt(i.correctiveDueDate) + '</td></tr>'; }).join('') : '<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">' + ic('search') + '</div><div class="empty-state-title">沒有符合條件的矯正單</div></div></td></tr>';
    var ftabs = filters.map(function (f) { return '<button class="filter-tab ' + (curFilter === f ? 'active' : '') + '" data-filter="' + f + '">' + f + '</button>'; }).join('');
    var createBtn = canCreateCAR() ? '<a href="#create" class="btn btn-primary">' + ic('plus-circle', 'icon-sm') + ' 開立矯正單</a>' : '';
    document.getElementById('app').innerHTML = '<div class="animate-in">' +
      '<div class="page-header"><div><h1 class="page-title">矯正單列表</h1><p class="page-subtitle">共 ' + items.length + ' 筆，顯示 ' + filtered.length + ' 筆</p></div>' + createBtn + '</div>' +
      '<div class="toolbar"><div class="search-box"><input type="text" placeholder="搜尋單號、說明、人員..." id="search-input" value="' + esc(curSearch) + '"></div><div class="filter-tabs" id="filter-tabs">' + ftabs + '</div></div>' +
      '<div class="card" style="padding:0;overflow:hidden;"><div class="table-wrapper"><table><thead><tr><th>單號</th><th>缺失種類</th><th>來源</th><th>狀態</th><th>提出人</th><th>處理人</th><th>預定完成</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
    refreshIcons();
    document.getElementById('search-input').addEventListener('input', function (e) { curSearch = e.target.value; renderList(); });
    document.getElementById('filter-tabs').addEventListener('click', function (e) { if (e.target.classList.contains('filter-tab')) { curFilter = e.target.dataset.filter; renderList(); } });
  }

  // ─── Render: Create ────────────────────────
  function renderCreate() {
    if (!canCreateCAR()) { navigate('dashboard'); toast('您沒有開立矯正單的權限', 'error'); return; }
    const u = currentUser();
    const allUsers = getUsers();
    const users = allUsers.filter(x => x.role === ROLES.REPORTER || x.role === ROLES.UNIT_ADMIN);


    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">開立矯正單</h1><p class="page-subtitle">依據 ISMS 規範填寫矯正措施需求單</p></div></div>
      <div class="card" style="max-width:850px;"><form id="create-form">
        <div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label form-required">提出單位</label>${buildUnitCascadeControl('f-punit', u.unit || '', false, true)}</div>
          <div class="form-group"><label class="form-label form-required">提出人員</label><input type="text" class="form-input" id="f-pname" value="${esc(u.name)}" readonly></div>
          <div class="form-group"><label class="form-label form-required">提出日期</label><input type="date" class="form-input" id="f-pdate" value="${new Date().toISOString().split('T')[0]}" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label form-required">處理單位</label>${buildUnitCascadeControl('f-hunit', '', false, true)}</div>
          <div class="form-group"><label class="form-label form-required">處理人員</label><select class="form-select" id="f-hname" required><option value="">請選擇</option></select></div>
          <div class="form-group"><label class="form-label">處理日期</label><input type="date" class="form-input" id="f-hdate"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">處理人員信箱</label><div class="input-with-icon"><input type="email" class="form-input" id="f-hemail" placeholder="選擇處理人員後自動帶入" readonly style="background:#f8fafc"><span class="input-icon-hint">${ic('mail', 'icon-xs')}</span></div><p class="form-hint">系統將發送通知信至此信箱</p></div>
          <div class="form-group"><label class="form-label">勾選發送通知</label><label class="chk-label" style="margin-top:4px"><input type="checkbox" id="f-notify" checked><span class="chk-box"></span>開單後發送信件通知處理人員</label></div>
        </div>
        <div class="section-header">${ic('tag', 'icon-sm')} 缺失分類</div>
        <div class="form-group"><label class="form-label form-required">缺失種類</label>${mkRadio('defType', DEF_TYPES, '')}</div>
        <div class="form-group"><label class="form-label form-required">來源</label>${mkRadio('source', SOURCES, '')}</div>
        <div class="form-group"><label class="form-label form-required">分類（可複選）</label>${mkChk('category', CATEGORIES, [])}</div>
        <div class="form-group"><label class="form-label">條文</label><input type="text" class="form-input" id="f-clause" placeholder="例：A.9.2.6、ISO 27001:2022"></div>
        <div class="section-header">${ic('message-square-warning', 'icon-sm')} 問題描述</div>
        <div class="form-group"><label class="form-label form-required">問題或缺失說明</label><textarea class="form-textarea" id="f-problem" placeholder="詳細描述觀察到的問題或缺失..." required style="min-height:100px"></textarea></div>
        <div class="form-group"><label class="form-label form-required">缺失發生過程</label><textarea class="form-textarea" id="f-occurrence" placeholder="說明缺失的發生過程與背景..." required style="min-height:80px"></textarea></div>
        <div class="section-header">${ic('calendar', 'icon-sm')} 矯正期限</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label form-required">預定完成日期</label><input type="date" class="form-input" id="f-due" required></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 送出矯正單</button><a href="#list" class="btn btn-secondary">取消</a></div>
      </form></div></div>`;
    refreshIcons();
    const proposerUnit = document.getElementById('f-punit');
    const handlerUnit = document.getElementById('f-hunit');
    const handlerName = document.getElementById('f-hname');
    const handlerEmailInput = document.getElementById('f-hemail');
    initUnitCascade('f-punit', u.unit || '', { disabled: false });
    initUnitCascade('f-hunit', '', { disabled: false });
    function updateHandlerEmail() {
      const sel = handlerName.options[handlerName.selectedIndex];
      const email = sel && sel.dataset ? (sel.dataset.email || '') : '';
      handlerEmailInput.value = email;
    }
    function renderHandlerOptionsByUnit(unit) {
      const prevSelected = handlerName.value;
      const filtered = unit ? users.filter(x => x.unit === unit || x.unit.startsWith(unit + '／')) : users;
      handlerName.innerHTML = '<option value="">請選擇</option>' + filtered.map(x => `<option value="${esc(x.name)}" data-username="${esc(x.username || '')}" data-email="${esc(x.email || '')}">${esc(x.name)}（${esc(x.unit)}）</option>`).join('');
      if (prevSelected && filtered.some(x => x.name === prevSelected)) handlerName.value = prevSelected;
      updateHandlerEmail();
    }
    renderHandlerOptionsByUnit(handlerUnit.value);
    handlerUnit.addEventListener('change', function () {
      renderHandlerOptionsByUnit(this.value);
    });
    handlerName.addEventListener('change', function () {
      const sel = this.options[this.selectedIndex];
      const email = sel && sel.dataset ? (sel.dataset.email || '') : '';
      handlerEmailInput.value = email;
    });
    document.getElementById('create-form').addEventListener('submit', e => {
      e.preventDefault();
      const defType = document.querySelector('input[name="defType"]:checked');
      const source = document.querySelector('input[name="source"]:checked');
      const cats = [...document.querySelectorAll('input[name="category"]:checked')].map(c => c.value);
      if (!defType) { toast('請選擇缺失種類', 'error'); return; }
      if (!source) { toast('請選擇來源', 'error'); return; }
      if (cats.length === 0) { toast('請至少選擇一個分類', 'error'); return; }
      const selectedHandler = handlerName.options[handlerName.selectedIndex];
      const handlerUsername = selectedHandler && selectedHandler.dataset ? (selectedHandler.dataset.username || '') : '';
      const now = new Date().toISOString();
      const item = {
        id: generateId(),
        proposerUnit: document.getElementById('f-punit').value,
        proposerName: document.getElementById('f-pname').value.trim(),
        proposerUsername: u.username,
        proposerDate: document.getElementById('f-pdate').value,
        handlerUnit: document.getElementById('f-hunit').value,
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
        history: [{ time: now, action: '開立矯正單', user: u.name }, { time: now, action: `狀態變更為「${STATUSES.PENDING}」`, user: '系統' }]
      };
      const shouldNotify = document.getElementById('f-notify').checked;
      const hEmail = document.getElementById('f-hemail').value;
      addItem(item);
      if (shouldNotify && hEmail) {
        item.history.push({ time: now, action: `系統寄送通知信至 ${hEmail}`, user: '系統' });
        updateItem(item.id, { history: item.history });
        toast(`矯正單 ${item.id} 已開立，通知信已寄至 ${hEmail}`);
      } else {
        toast(`矯正單 ${item.id} 已成功開立！`);
      }
      navigate('detail/' + item.id);
    });
  }

  // ─── Render: Detail ────────────────────────
  function renderDetail(id) {
    const item = getItem(id);
    if (!item) { document.getElementById('app').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ic('help-circle', 'icon-lg')}</div><div class="empty-state-title">找不到矯正單</div><a href="#list" class="btn btn-primary" style="margin-top:16px">返回列表</a></div>`; return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限檢視此矯正單', 'error'); return; }
    const u = currentUser(); const ci = STATUS_FLOW.indexOf(item.status);
    const stepper = STATUS_FLOW.map((s, i) => { let c = ''; if (i < ci) c = 'completed'; else if (i === ci) c = 'active'; return `<div class="stepper-step ${c}"><div class="stepper-circle">${i < ci ? '✓' : i + 1}</div><div class="stepper-label">${s}</div></div>`; }).join('');
    const otag = isOverdue(item) ? ` <span class="badge badge-overdue"><span class="badge-dot"></span>已逾期</span>` : '';
    const cats = (item.category || []).map(c => `<span class="badge badge-category">${esc(c)}</span>`).join(' ');
    let btns = '';
    const canRespond = item.status === STATUSES.PENDING && (u.name === item.handlerName || isAdmin());
    if (canRespond) btns += `<a href="#respond/${item.id}" class="btn btn-primary">${ic('edit-3', 'icon-sm')} 回填矯正措施</a>`;
    if (item.status === STATUSES.PROPOSED && canReview()) btns += `<button class="btn btn-primary" onclick="window._cs('${item.id}','${STATUSES.REVIEWING}')">${ic('eye', 'icon-sm')} 進入審核</button>`;
    if (item.status === STATUSES.REVIEWING && canReview()) { btns += `<button class="btn btn-success" onclick="window._cs('${item.id}','${STATUSES.CLOSED}')">${ic('check', 'icon-sm')} 審核通過結案</button>`; btns += `<button class="btn btn-warning" onclick="window._cs('${item.id}','${STATUSES.TRACKING}')">${ic('eye', 'icon-sm')} 轉為追蹤</button>`; btns += `<button class="btn btn-danger" onclick="window._cs('${item.id}','${STATUSES.PENDING}')">${ic('corner-up-left', 'icon-sm')} 退回重填</button>`; }
    if (item.status === STATUSES.TRACKING && canReview()) btns += `<a href="#tracking/${item.id}" class="btn btn-primary">${ic('clipboard-check', 'icon-sm')} 填寫追蹤</a>`;
    const evHtml = item.evidence && item.evidence.length ? `<div class="file-preview-list">${item.evidence.map(ev => ev.type && ev.type.startsWith('image/') ? `<div class="file-preview-item"><img src="${ev.data}" alt="${esc(ev.name)}"><div class="file-name">${esc(ev.name)}</div></div>` : `<div class="file-preview-item"><div class="file-pdf-icon">${ic('file-box')}</div><div class="file-name">${esc(ev.name)}</div></div>`).join('')}</div>` : '<p style="color:var(--text-muted);font-size:.88rem">尚無佐證</p>';
    const tl = [...(item.history || [])].reverse().map(h => `<div class="timeline-item"><div class="timeline-time">${fmtTime(h.time)}</div><div class="timeline-text">${esc(h.action)}${h.user ? ` — ${esc(h.user)}` : ''}</div></div>`).join('');
    const tkHtml = (item.trackings || []).map((tk, i) => `<div class="card" style="margin-bottom:16px;border-left:3px solid #f97316;"><div class="section-header">第 ${i + 1} 次追蹤 — ${fmt(tk.trackDate)}</div>
      <div class="detail-grid"><div class="detail-field"><div class="detail-field-label">追蹤人</div><div class="detail-field-value">${esc(tk.tracker)}</div></div><div class="detail-field"><div class="detail-field-label">審核人</div><div class="detail-field-value">${esc(tk.reviewer || '—')}</div></div></div>
      <div class="detail-section"><div class="detail-section-title">${ic('clipboard-list', 'icon-sm')} 執行情形</div><div class="detail-content">${esc(tk.execution)}</div></div>
      <div class="detail-section"><div class="detail-section-title">${ic('message-circle', 'icon-sm')} 追蹤說明</div><div class="detail-content">${esc(tk.trackNote)}</div></div>
      <div class="detail-section"><div class="detail-section-title">${ic('check-circle', 'icon-sm')} 結果</div><div class="detail-content">${esc(tk.result)}</div></div></div>`).join('') || '<p style="color:var(--text-muted);font-size:.88rem">尚無追蹤紀錄</p>';
    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="detail-header"><div><div class="detail-id">${esc(item.id)} · ${esc(item.deficiencyType)}</div><h1 class="detail-title">${esc(item.problemDesc || '').substring(0, 50)}</h1>
        <div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">${ic('user', 'icon-xs')}</span>${esc(item.proposerName)}</span><span class="detail-meta-item"><span class="detail-meta-icon">${ic('calendar', 'icon-xs')}</span>${fmt(item.proposerDate)}</span><span class="badge badge-${STATUS_CLASSES[item.status]}"><span class="badge-dot"></span>${item.status}</span>${otag}</div>
      </div><div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">${btns}<a href="#list" class="btn btn-secondary">← 返回</a></div></div>
      <div class="stepper">${stepper}</div>
      <div class="card" style="margin-top:20px"><div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div>
        <div class="detail-grid">
          <div class="detail-field"><div class="detail-field-label">提出單位</div><div class="detail-field-value">${esc(item.proposerUnit)}</div></div>
          <div class="detail-field"><div class="detail-field-label">提出人員</div><div class="detail-field-value">${esc(item.proposerName)}</div></div>
          <div class="detail-field"><div class="detail-field-label">提出日期</div><div class="detail-field-value">${fmt(item.proposerDate)}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理單位</div><div class="detail-field-value">${esc(item.handlerUnit)}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理人員</div><div class="detail-field-value">${esc(item.handlerName)}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理人員信箱</div><div class="detail-field-value">${item.handlerEmail ? '<a href="mailto:' + esc(item.handlerEmail) + '" style="color:var(--accent-primary);text-decoration:none">' + ic('mail', 'icon-xs') + ' ' + esc(item.handlerEmail) + '</a>' : '—'}</div></div>
          <div class="detail-field"><div class="detail-field-label">處理日期</div><div class="detail-field-value">${fmt(item.handlerDate)}</div></div>
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
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('paperclip', 'icon-sm')} 佐證文件</span></div>${evHtml}</div>
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('git-branch', 'icon-sm')} 追蹤監控</span></div>${tkHtml}</div>
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('history', 'icon-sm')} 歷程紀錄</span></div><div class="timeline">${tl}</div></div>
    </div>`;
    refreshIcons();
  }

  window._cs = function (id, ns) {
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
    const updates = { status: ns, updatedAt: now, history: [...item.history, { time: now, action: `狀態變更為「${ns}」`, user: u.name }] };
    if (ns === STATUSES.CLOSED) updates.closedDate = now;
    updateItem(id, updates);
    toast(`狀態已變更為「${ns}」`);
    renderDetail(id);
    renderSidebar();
    refreshIcons();
  };

  // ─── Render: Respond ───────────────────────
  function renderRespond(id) {
    const item = getItem(id); if (!item) { navigate('list'); return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限操作此矯正單', 'error'); return; }
    const canRespond = item.status === STATUSES.PENDING && (currentUser().name === item.handlerName || isAdmin());
    if (!canRespond) { navigate('detail/' + id); toast('目前狀態不可回填，或您沒有回填權限', 'error'); return; }
    let tempEv = [];
    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">回填矯正措施</h1><p class="page-subtitle">${esc(item.id)} · ${esc((item.problemDesc || '').substring(0, 40))}</p></div><a href="#detail/${item.id}" class="btn btn-secondary">← 返回詳情</a></div>
      <div class="card" style="max-width:850px"><form id="respond-form">
        <div class="section-header">${ic('wrench', 'icon-sm')} 矯正措施提案</div>
        <div class="form-group"><label class="form-label form-required">矯正措施說明</label><textarea class="form-textarea" id="r-action" placeholder="描述您所採取的矯正措施..." required style="min-height:120px">${esc(item.correctiveAction || '')}</textarea></div>
        <div class="form-group"><label class="form-label form-required">預定完成日期</label><input type="date" class="form-input" id="r-due" value="${item.correctiveDueDate || ''}" required></div>
        <div class="section-header">${ic('microscope', 'icon-sm')} 根因（Root Cause）分析</div>
        <div class="form-group"><label class="form-label form-required">根因分析</label><textarea class="form-textarea" id="r-root" placeholder="分析根本原因..." required style="min-height:100px">${esc(item.rootCause || '')}</textarea></div>
        <div class="section-header">${ic('shield-check', 'icon-sm')} 根因消除措施</div>
        <div class="form-group"><label class="form-label form-required">根因消除措施</label><textarea class="form-textarea" id="r-elim" placeholder="描述根因消除方案..." required style="min-height:100px">${esc(item.rootElimination || '')}</textarea></div>
        <div class="form-group"><label class="form-label">預定完成日期</label><input type="date" class="form-input" id="r-elimdue" value="${item.rootElimDueDate || ''}"></div>
        <div class="section-header">${ic('shield-alert', 'icon-sm')} 風險管理（選填）</div>
        <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px">※ 如無法找到根因或根因無法消除才需填寫此區塊</p>
        <div class="form-group"><label class="form-label">風險說明</label><textarea class="form-textarea" id="r-risk" placeholder="風險說明（選填）" style="min-height:70px">${esc(item.riskDesc || '')}</textarea></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">受理人員</label><input type="text" class="form-input" id="r-riskwho" value="${esc(item.riskAcceptor || '')}"></div>
          <div class="form-group"><label class="form-label">受理日期</label><input type="date" class="form-input" id="r-riskdate" value="${item.riskAcceptDate || ''}"></div>
          <div class="form-group"><label class="form-label">風險評鑑日期</label><input type="date" class="form-input" id="r-riskassess" value="${item.riskAssessDate || ''}"></div>
        </div>
        <div class="section-header">${ic('paperclip', 'icon-sm')} 上傳佐證文件</div>
        <div class="upload-zone" id="upload-zone"><input type="file" id="file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">${ic('folder-open')}</div><div class="upload-zone-text">拖放檔案或 <strong>點擊選擇</strong></div><div class="upload-zone-hint">支援 JPG、PNG、PDF（≤ 2MB）</div></div>
        <div class="file-preview-list" id="file-previews"></div>
        <div class="form-actions"><button type="submit" class="btn btn-success">${ic('check-circle', 'icon-sm')} 送出提案</button><a href="#detail/${item.id}" class="btn btn-secondary">取消</a></div>
      </form></div></div>`;
    refreshIcons();
    const fi = document.getElementById('file-input'), uz = document.getElementById('upload-zone'), fp = document.getElementById('file-previews');
    function handleF(files) { Array.from(files).forEach(f => { if (f.size > 2 * 1024 * 1024) { toast(`「${f.name}」超過2MB`, 'error'); return; } const r = new FileReader(); r.onload = e => { tempEv.push({ name: f.name, type: f.type, data: e.target.result }); updP(); }; r.readAsDataURL(f); }); }
    function updP() { fp.innerHTML = tempEv.map((e, i) => { const pv = e.type.startsWith('image/') ? `<img src="${e.data}" alt="${esc(e.name)}">` : `<div class="file-pdf-icon">${ic('file-box')}</div>`; return `<div class="file-preview-item">${pv}<div class="file-name">${esc(e.name)}</div><button type="button" class="file-remove" data-idx="${i}">✕</button></div>`; }).join(''); fp.querySelectorAll('.file-remove').forEach(b => b.addEventListener('click', e => { tempEv.splice(parseInt(e.target.dataset.idx), 1); updP(); })); }
    fi.addEventListener('change', e => handleF(e.target.files));
    uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('dragover'); });
    uz.addEventListener('dragleave', () => uz.classList.remove('dragover'));
    uz.addEventListener('drop', e => { e.preventDefault(); uz.classList.remove('dragover'); handleF(e.dataTransfer.files); });
    document.getElementById('respond-form').addEventListener('submit', e => {
      e.preventDefault();
      const ca = document.getElementById('r-action').value.trim(), rc = document.getElementById('r-root').value.trim(), el = document.getElementById('r-elim').value.trim();
      if (!ca || !rc || !el) { toast('請填寫矯正措施、根因分析與根因消除措施', 'error'); return; }
      const now = new Date().toISOString(), li = getItem(id), u = currentUser();
      if (!li || !canAccessItem(li)) { toast('您沒有權限操作此矯正單', 'error'); navigate('list'); return; }
      if (li.status !== STATUSES.PENDING || !(u.name === li.handlerName || isAdmin())) { toast('此矯正單狀態已變更，無法回填', 'error'); navigate('detail/' + id); return; }
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
        history: [...li.history, { time: now, action: `${u.name} 提交矯正措施提案`, user: u.name }, { time: now, action: `狀態變更為「${STATUSES.PROPOSED}」`, user: '系統' }]
      };
      if (tempEv.length) upd.history.push({ time: now, action: `上傳 ${tempEv.length} 個佐證`, user: u.name });
      updateItem(id, upd); toast('矯正措施提案已送出！'); navigate('detail/' + id);
    });
  }

  // ─── Render: Tracking ──────────────────────
  function renderTracking(id) {
    const item = getItem(id); if (!item) { navigate('list'); return; }
    if (!canAccessItem(item)) { navigate('list'); toast('您沒有權限操作此矯正單', 'error'); return; }
    if (!(item.status === STATUSES.TRACKING && canReview())) { navigate('detail/' + id); toast('目前狀態不可追蹤，或您沒有追蹤權限', 'error'); return; }
    const round = (item.trackings || []).length + 1;
    if (round > 3) { toast('已達最大追蹤次數（3次）', 'error'); navigate('detail/' + id); return; }
    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">第 ${round} 次追蹤監控</h1><p class="page-subtitle">${esc(item.id)}</p></div><a href="#detail/${item.id}" class="btn btn-secondary">← 返回詳情</a></div>
      <div class="card" style="max-width:850px"><form id="track-form">
        <div class="section-header">${ic('clipboard-check', 'icon-sm')} 追蹤內容</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label form-required">追蹤人</label><input type="text" class="form-input" id="tk-tracker" value="${esc(currentUser().name)}" readonly></div>
          <div class="form-group"><label class="form-label form-required">追蹤日期</label><input type="date" class="form-input" id="tk-date" value="${new Date().toISOString().split('T')[0]}" required></div>
        </div>
        <div class="form-group"><label class="form-label form-required">矯正措施執行情形</label><textarea class="form-textarea" id="tk-exec" placeholder="描述矯正措施的執行狀況..." required style="min-height:100px"></textarea></div>
        <div class="form-group"><label class="form-label form-required">追蹤狀況說明</label><textarea class="form-textarea" id="tk-note" placeholder="追蹤狀況補充說明..." required style="min-height:80px"></textarea></div>
        <div class="section-header">${ic('check-circle', 'icon-sm')} 審核決定</div>
        <div class="form-group"><label class="form-label form-required">審核結果</label>${mkRadio('tkResult', ['同意所提矯正措施，准以結案', '持續追蹤'], '')}</div>
        <div class="form-group" id="tk-next-wrap" style="display:none"><label class="form-label">預計下次追蹤日期</label><input type="date" class="form-input" id="tk-next"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label form-required">審核人員</label><input type="text" class="form-input" id="tk-reviewer" value="${esc(currentUser().name)}" readonly></div>
          <div class="form-group"><label class="form-label form-required">審核日期</label><input type="date" class="form-input" id="tk-revdate" value="${new Date().toISOString().split('T')[0]}" required></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">${ic('save', 'icon-sm')} 儲存追蹤</button><a href="#detail/${item.id}" class="btn btn-secondary">取消</a></div>
      </form></div></div>`;
    setTimeout(() => {
      refreshIcons();
      document.querySelectorAll('input[name="tkResult"]').forEach(r => r.addEventListener('change', e => { document.getElementById('tk-next-wrap').style.display = e.target.value === '持續追蹤' ? 'block' : 'none'; }));
    }, 50);
    document.getElementById('track-form').addEventListener('submit', e => {
      e.preventDefault(); const res = document.querySelector('input[name="tkResult"]:checked');
      if (!res) { toast('請選擇審核結果', 'error'); return; }
      const now = new Date().toISOString(), li = getItem(id), u = currentUser();
      if (!li || !canAccessItem(li)) { toast('您沒有權限操作此矯正單', 'error'); navigate('list'); return; }
      if (!(li.status === STATUSES.TRACKING && canReview())) { toast('此矯正單狀態已變更，無法儲存追蹤', 'error'); navigate('detail/' + id); return; }
      const tk = { tracker: document.getElementById('tk-tracker').value, trackDate: document.getElementById('tk-date').value, execution: document.getElementById('tk-exec').value.trim(), trackNote: document.getElementById('tk-note').value.trim(), result: res.value, nextTrackDate: document.getElementById('tk-next').value || null, reviewer: document.getElementById('tk-reviewer').value, reviewDate: document.getElementById('tk-revdate').value };
      const ns = res.value === '同意所提矯正措施，准以結案' ? STATUSES.CLOSED : STATUSES.TRACKING;
      const upd = { trackings: [...(li.trackings || []), tk], status: ns, updatedAt: now, history: [...li.history, { time: now, action: `第 ${round} 次追蹤 — ${res.value}`, user: u.name }, { time: now, action: `狀態變更為「${ns}」`, user: '系統' }] };
      if (ns === STATUSES.CLOSED) upd.closedDate = now;
      updateItem(id, upd); toast(ns === STATUSES.CLOSED ? '矯正單已結案！' : '追蹤紀錄已儲存'); navigate('detail/' + id);
    });
  }

  // ─── Render: Users ─────────────────────────
  function renderUsers() {
    if (!canManageUsers()) { navigate('dashboard'); return; } const users = getUsers();
    const rows = users.map(u => `<tr><td style="font-weight:500;color:var(--text-primary)">${esc(u.username)}</td><td>${esc(u.name)}</td><td><span class="badge-role ${ROLE_BADGE[u.role]}">${u.role}</span></td><td>${esc(u.unit)}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(u.email || '')}</td><td><div class="user-actions">${u.username !== 'admin' ? `<button class="btn btn-sm btn-secondary" onclick="window._editUser('${u.username}')">${ic('edit-2', 'btn-icon-svg')}</button><button class="btn btn-sm btn-danger" onclick="window._delUser('${u.username}')">${ic('trash-2', 'btn-icon-svg')}</button>` : ''}</div></td></tr>`).join('');
    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">帳號管理</h1><p class="page-subtitle">管理系統使用者帳號與權限</p></div><button class="btn btn-primary" onclick="window._addUser()">${ic('user-plus', 'icon-sm')} 新增使用者</button></div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>帳號</th><th>姓名</th><th>角色</th><th>單位</th><th>信箱</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
  }
  function showUserModal(eu) {
    const isE = !!eu; const title = isE ? '編輯使用者' : '新增使用者'; const mr = document.getElementById('modal-root'); const initUnit = isE ? (eu.unit || '') : '';
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal"><div class="modal-header"><span class="modal-title">${title}</span><button class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-root').innerHTML=''">✕</button></div><form id="user-form">
      <div class="form-group"><label class="form-label form-required">帳號</label><input type="text" class="form-input" id="u-username" value="${isE ? esc(eu.username) : ''}" ${isE ? 'readonly' : ''} required></div>
      <div class="form-group"><label class="form-label form-required">姓名</label><input type="text" class="form-input" id="u-name" value="${isE ? esc(eu.name) : ''}" required></div>
      <div class="form-group"><label class="form-label form-required">電子信箱</label><input type="email" class="form-input" id="u-email" value="${isE ? esc(eu.email || '') : ''}" required></div>
      <div class="form-row"><div class="form-group"><label class="form-label form-required">角色</label><select class="form-select" id="u-role" required><option value="${ROLES.REPORTER}" ${isE && eu.role === ROLES.REPORTER ? 'selected' : ''}>填報人</option><option value="${ROLES.UNIT_ADMIN}" ${isE && eu.role === ROLES.UNIT_ADMIN ? 'selected' : ''}>單位管理員</option><option value="${ROLES.ADMIN}" ${isE && eu.role === ROLES.ADMIN ? 'selected' : ''}>最高管理員</option></select></div>
      <div class="form-group"><label class="form-label form-required">單位</label>${buildUnitCascadeControl('u-unit', initUnit, false, true)}</div></div>
      <div class="form-group"><label class="form-label ${isE ? '' : 'form-required'}">${isE ? '密碼（留空不修改）' : '密碼'}</label><input type="text" class="form-input" id="u-pass" ${isE ? '' : 'required'}></div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">${isE ? ic('save', 'icon-sm') + ' 儲存' : ic('plus', 'icon-sm') + ' 新增'}</button><button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-root').innerHTML=''">取消</button></div>
    </form></div></div>`;
    initUnitCascade('u-unit', initUnit, { disabled: false });
    document.getElementById('modal-bg').addEventListener('click', e => { if (e.target === e.currentTarget) mr.innerHTML = ''; });
    document.getElementById('user-form').addEventListener('submit', e => {
      e.preventDefault(); const un = document.getElementById('u-username').value.trim(), nm = document.getElementById('u-name').value.trim(), em = document.getElementById('u-email').value.trim(), rl = document.getElementById('u-role').value, ut = document.getElementById('u-unit').value.trim(), pw = document.getElementById('u-pass').value;
      if (isE) { const upd = { name: nm, email: em, role: rl, unit: ut }; if (pw) upd.password = pw; updateUser(un, upd); toast('使用者已更新'); }
      else { if (findUser(un)) { toast('帳號已存在', 'error'); return; } addUser({ username: un, password: pw, name: nm, email: em, role: rl, unit: ut }); toast('使用者已新增'); }
      mr.innerHTML = ''; renderUsers(); refreshIcons();
    });
  }
  window._addUser = () => showUserModal(null);
  window._editUser = (un) => showUserModal(findUser(un));
  window._delUser = (un) => { if (confirm(`確定刪除使用者「${un}」？`)) { deleteUser(un); toast('使用者已刪除'); renderUsers(); } };
  window._clearLoginLogs = function () {
    if (!canManageUsers()) return;
    if (!confirm('確定清除所有登入紀錄？')) return;
    clearLoginLogs();
    toast('登入紀錄已清除', 'info');
    renderLoginLog();
  };

  // ─── Render: Login Log ─────────────────────
  function renderLoginLog() {
    if (!canManageUsers()) { navigate('dashboard'); return; }
    const logs = loadLoginLogs().slice().reverse();
    const rows = logs.length ? logs.map(log => {
      const status = log.success ? '<span style="color:#16a34a;font-weight:600">成功</span>' : '<span style="color:#dc2626;font-weight:600">失敗</span>';
      return `<tr><td>${fmtTime(log.time)}</td><td>${esc(log.username)}</td><td>${esc(log.name || '—')}</td><td>${esc(log.role || '—')}</td><td>${status}</td></tr>`;
    }).join('') : '<tr><td colspan="5"><div class="empty-state" style="padding:36px"><div class="empty-state-title">尚無登入紀錄</div></div></td></tr>';
    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">登入紀錄</h1><p class="page-subtitle">系統保存最近 500 筆登入成功與失敗事件</p></div><button type="button" class="btn btn-danger" onclick="window._clearLoginLogs()">${ic('trash-2', 'icon-sm')} 清除紀錄</button></div><div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>時間</th><th>帳號</th><th>姓名</th><th>角色</th><th>結果</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
  }

  // ─── Checklist Data Model ─────────────────
  // ★ UPDATED: Added GCB (8.8), RDP control (8.9) to section 8; IoT control moved to section 9 (9.3)
  const DEFAULT_CHECKLIST_SECTIONS = [
    {
      section: '1. 資安意識及資安通識教育訓練', items: [
        { id: '1.1', text: '單位同仁是否瞭解本校資通安全政策？', hint: '本校資安政策放置於資通安全管理專區，已透過 MAIL 方式向同仁宣導' },
        { id: '1.2', text: '單位同仁是否每年接受 3 小時以上之資通安全通識教育？', hint: '114 年資通安全教育訓練執行情形、全校資安通識教育訓練時數統計表' },
        { id: '1.3', text: '是否指派適當人員擔任單位資通安全長及資安窗口，負責推動及督導或執行機關內資通安全相關事務？', hint: '單位資通安全長及資安窗口聯絡資訊' }
      ]
    },
    {
      section: '2. 資通系統盤點暨安全等級評估', items: [
        { id: '2.1', text: '每年是否實施資通系統清查，並於本校「資通盤點系統」完成填報？', hint: '請參考資通盤點系統' },
        { id: '2.2', text: '自行或委外開發之資通系統，是否完成安全等級評估？', hint: '請參考資通盤點系統' },
        { id: '2.3', text: '自行或委外開發之資通系統，是否填寫相對應之防護基準表（普、中、高）？', hint: '請參考資通盤點系統' },
        { id: '2.4', text: '每年是否檢視一次資通系統分級妥適性？', hint: '請參考資通盤點系統' },
        { id: '2.5', text: '資訊資產上線前是否進行系統更新與漏洞修補，並採取適當管控機制，如連線控管、變更廠商預設帳密、禁止使用弱密碼？', hint: '系統更新與漏洞修補紀錄、弱點掃描報告、變更預設帳密的操作紀錄' }
      ]
    },
    {
      section: '3. 資訊資產盤點暨風險評鑑', items: [
        { id: '3.1', text: '每年是否實施資訊資產盤點，並建立「資訊資產清冊」？', hint: '請參考資通盤點系統' },
        { id: '3.2', text: '是否完成風險評鑑，並擬定對應之控制措施？', hint: '風險評鑑彙整表及風險改善計畫' },
        { id: '3.3', text: '危害國家資通安全產品是否已清查列冊管理？', hint: '大陸廠牌資通訊產品清查結果' },
        { id: '3.4', text: '是否清查物聯網設備，盤點範圍包含單位採購、公務使用之物聯網設備，並納入「資訊資產清冊」列管？', hint: '請參考資通盤點系統' },
        { id: '3.5', text: '資訊資產安裝完畢後是否立即更新廠商所預設之通行碼？', hint: '變更預設通行碼的操作紀錄、系統管理介面截圖' },
        { id: '3.6', text: '是否規劃已停止支援服務（EOS）資訊資產的汰換及升級計畫？', hint: 'EOS 資產清冊、汰換與升級計畫文件' }
      ]
    },
    {
      section: '4. 日常作業資訊安全管理', items: [
        { id: '4.1', text: '汰除之儲存設備是否已確認機敏資訊已刪除？並依本校「資訊設備回收再使用及汰除之安全控制作業程序與校內報廢程序」辦理？', hint: '儲存設備資料清除紀錄、資料刪除或摧毀證明文件' },
        { id: '4.2', text: '【適用設有機房單位】是否針對電腦機房及重要區域之安全控制、人員進出管控、環境維護（如溫溼度控制）等項目建立適當之管理措施，落實執行？', hint: '機房出入紀錄、環境監控紀錄、CCTV 架設紀錄' },
        { id: '4.3', text: '【適用設有機房單位】針對電腦機房及重要區域之公用服務（如水、電、消防及通訊等）建立適當之備援方案？', hint: 'UPS/發電機設備清單、電力異常應變 SOP、消防系統說明文件' }
      ]
    },
    {
      section: '5. 資通系統發展及維護安全', items: [
        { id: '5.1', text: '是否定期執行重要資料之備份作業？', hint: '備份排程設定截圖、備份作業紀錄或日誌、備份資料驗證紀錄' },
        { id: '5.2', text: '對外服務之資通系統是否上線前、重大變更時及定期執行各項系統之弱點掃描，並針對高風險（含）以上之漏洞執行修補？', hint: '今年度弱點掃描初測及複測報告' },
        { id: '5.3', text: '對外服務之資通系統（網站）是否定期更換憑證？', hint: 'SSL/TLS 憑證有效期限截圖、憑證更新紀錄' }
      ]
    },
    {
      section: '6. 資通系統或服務委外辦理之管理', items: [
        { id: '6.1', text: '單位辦理資訊系統建置、軟體開發、維運服務、資安強化等購案，是否依據政府採購法第 63 條第 1 項，採用「資訊服務採購契約範本」？', hint: '已核定或陳核中的資訊服務採購契約' },
        { id: '6.2', text: '資通系統或服務購案契約是否已納入相關資通安全責任規範？', hint: '已核定或陳核中的資訊服務採購契約' },
        { id: '6.3', text: '資通系統或服務委外辦理時，是否已將選任受託者應注意事項加入招標文件中？', hint: '招標文件或投標須知副本' },
        { id: '6.4', text: '辦理委外資通系統開發，是否於契約規範，要求受託者提出安全性檢測證明？', hint: '契約條文內容、安全性檢測報告' },
        { id: '6.5', text: '契約是否已訂定資通安全事件通報相關程序、通報機制、作法或管道？', hint: '契約條文、廠商承諾書或資安責任切結書' },
        { id: '6.6', text: '契約是否已訂定委託關係終止或解除時，本專案相關履行契約而持有資料之返還、移交、刪除或銷毀作法？', hint: '契約條文副本、資料銷毀證明文件' },
        { id: '6.7', text: '採購案契約範圍內之委外廠商是否為大陸廠商或所涉及之人員是否有陸籍身分？是否允許委外廠商使用大陸廠牌之資通訊產品？', hint: '廠商聲明文件或切結書' }
      ]
    },
    {
      section: '7. 資安事件通報', items: [
        { id: '7.1', text: '單位人員是否知悉資通安全事件，本校之通報應變處理程序？', hint: '資安事件通報流程文件、宣導紀錄、通報演練紀錄' }
      ]
    },
    {
      section: '8. 個人電腦安全管理（抽檢 2 台）', items: [
        { id: '8.1', text: '是否已安裝防毒軟體、啟動自動更新病毒碼並為最新版本？', hint: '抽檢同仁電腦之防毒軟體佐證圖片' },
        { id: '8.2', text: '是否已啟動微軟自動更新，並為最新版本？', hint: '抽檢同仁電腦之 Windows Update 佐證圖片' },
        { id: '8.3', text: '系統登出/重新開機是否需要登入帳號及密碼？密碼是否符合單位密碼長度及複雜度規範？', hint: '現場抽查' },
        { id: '8.4', text: '是否設置螢幕保護程式，並設定密碼保護？', hint: '現場抽查' },
        { id: '8.5', text: '是否將帳號密碼，紀錄或張貼於辦公公開區域？', hint: '現場抽查' },
        { id: '8.6', text: '電腦鐘訊是否定期核對校正以確保時間記錄正確？', hint: 'NTP Server 同步設定' },
        { id: '8.7', text: '是否設定有效且可信度較高之 DNS Server 做查詢？', hint: 'DNS 設定截圖' },
        { id: '8.8', text: '個人電腦是否依規定完成政府組態基準（GCB）檢核，並採取適當之安全組態設定？', hint: 'GCB 檢測工具（如瑞思 RISS）安裝佐證截圖、GCB 檢核報告、組態設定合規比對結果' },
        { id: '8.9', text: '是否針對遠端桌面連線（如 RDP）進行存取控管，限制非授權來源 IP 連線（如僅允許校內 IP），並關閉不必要之遠端存取服務？', hint: '遠端桌面連線設定截圖（如僅允許校內 IP 連線）、防火牆規則截圖、Windows 遠端桌面啟用/停用設定截圖、VPN 連線政策文件' }
      ]
    },
    {
      section: '9. 網路安全管理', items: [
        { id: '9.1', text: '是否定期備份網路設備的組態設定（如：防火牆、交換器）？', hint: '備份作業排程截圖、備份檔案名稱與時間截圖' },
        { id: '9.2', text: '是否有針對網路設備之遠端管理介面（如 Web GUI、SSH）設定連線保護？', hint: '管理介面使用加密通訊協定設定截圖' },
        { id: '9.3', text: '辦公室內物聯網（IoT）設備是否採取適當之網路存取控管措施，如限制使用內部 IP、實施網路區隔（VLAN）、關閉不必要之對外連線？', hint: 'IoT 設備網路配置截圖（如內部 IP 配置）、VLAN 區隔設定截圖、防火牆存取控制清單（ACL）、IoT 設備連線管控政策文件' }
      ]
    }
  ];

  // ─── Template management — stored in localStorage so admin can edit ───
  function getChecklistSections() {
    try { const saved = JSON.parse(localStorage.getItem(TEMPLATE_KEY)); if (saved && saved.length) return saved; } catch { }
    return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS));
  }
  function saveChecklistSections(sections) { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(sections)); }

  // Dynamic alias used throughout the fill/detail views
  var CHECKLIST_SECTIONS;
  function refreshChecklistSections() { CHECKLIST_SECTIONS = getChecklistSections(); }
  refreshChecklistSections();

  const COMPLIANCE_OPTS = ['符合', '部分符合', '不符合', '不適用'];
  const COMPLIANCE_COLORS = { '符合': '#22c55e', '部分符合': '#f59e0b', '不符合': '#ef4444', '不適用': '#94a3b8' };
  const COMPLIANCE_CLASSES = { '符合': 'comply', '部分符合': 'partial', '不符合': 'noncomply', '不適用': 'na' };

  // ─── Checklist Storage ─────────────────────
  function emptyChecklistStore() { return { items: [], nextId: 1 }; }
  function loadChecklists() {
    const raw = readCachedJson(CHECKLIST_KEY, emptyChecklistStore);
    if (!raw || typeof raw !== 'object') return emptyChecklistStore();
    if (!Array.isArray(raw.items)) raw.items = [];
    if (!Number.isFinite(raw.nextId)) raw.nextId = 1;
    return raw;
  }
  function saveChecklists(d) { writeCachedJson(CHECKLIST_KEY, d); }
  function getAllChecklists() { return loadChecklists().items.slice(); }
  function getChecklist(id) { return loadChecklists().items.find(i => i.id === id); }
  function addChecklist(item) { const d = loadChecklists(); d.items.push(item); saveChecklists(d); }
  function updateChecklist(id, updates) {
    const d = loadChecklists();
    const idx = d.items.findIndex(i => i.id === id);
    if (idx < 0) return false;
    d.items[idx] = { ...d.items[idx], ...updates };
    saveChecklists(d);
    return true;
  }
  function generateChecklistId() { const d = loadChecklists(); const id = `CHK-${String(d.nextId).padStart(4, '0')}`; d.nextId++; saveChecklists(d); return id; }
  function getVisibleChecklists() { const u = currentUser(); if (!u) return []; const all = getAllChecklists(); if (u.role === ROLES.ADMIN) return all; return all.filter(i => i.unit === u.unit); }
  function canEditChecklist(cl) {
    const u = currentUser();
    if (!u || !cl || cl.status !== '草稿' || !canFillChecklist()) return false;
    if (u.role === ROLES.ADMIN) return true;
    const sameUser = cl.fillerUsername ? cl.fillerUsername === u.username : cl.fillerName === u.name;
    return sameUser && cl.unit === u.unit;
  }
  function getLatestEditableChecklistDraft() {
    const drafts = getVisibleChecklists().filter(c => c.status === '草稿' && canEditChecklist(c));
    drafts.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return drafts[0] || null;
  }

  // ─── Render: Checklist List ────────────────
  function renderChecklistList() {
    refreshChecklistSections();
    const checklists = getVisibleChecklists();
    const fillBtn = canFillChecklist() ? `<a href="#checklist-fill" class="btn btn-primary">${ic('edit-3', 'icon-sm')} 填報檢核表</a>` : '';
    const rows = checklists.length ? checklists.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(c => {
      const rate = c.summary.total > 0 ? Math.round(c.summary.conform / c.summary.total * 100) : 0;
      const statusCls = c.status === '已提交' ? 'badge-closed' : 'badge-pending';
      const target = c.status === '草稿' && canEditChecklist(c) ? `checklist-fill/${c.id}` : `checklist-detail/${c.id}`;
      return `<tr onclick="location.hash='${target}'"><td style="font-weight:600;color:var(--accent-primary)">${esc(c.id)}</td><td>${esc(c.unit)}</td><td>${esc(c.fillerName)}</td><td>${esc(c.auditYear)} 年度</td><td><span class="badge ${statusCls}"><span class="badge-dot"></span>${c.status}</span></td><td><div class="cl-rate-bar"><div class="cl-rate-fill" style="width:${rate}%"></div></div><span class="cl-rate-text">${rate}%</span></td><td>${fmt(c.fillDate)}</td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty-state" style="padding:60px"><div class="empty-state-icon">${ic('clipboard-list')}</div><div class="empty-state-title">尚無檢核表紀錄</div><div class="empty-state-desc">單位管理員可點選「填報檢核表」開始填寫</div></div></td></tr>`;
    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">內稽檢核表</h1><p class="page-subtitle">國立臺灣大學內部資通安全稽核查檢表</p></div>${fillBtn}</div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>編號</th><th>受稽單位</th><th>填報人</th><th>稽核年度</th><th>狀態</th><th>符合率</th><th>填報日期</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
  }

  // ─── Render: Checklist Fill ────────────────
  function renderChecklistFill(id) {
    refreshChecklistSections();
    if (!canFillChecklist()) { navigate('checklist'); toast('您沒有填報檢核表的權限', 'error'); return; }

    const u = currentUser();
    let existing = id ? getChecklist(id) : getLatestEditableChecklistDraft();
    if (id && !existing) { navigate('checklist'); toast('找不到可續填的草稿', 'error'); return; }
    if (existing && !canEditChecklist(existing)) { navigate('checklist'); toast('此檢核表不可編輯', 'error'); return; }

    let sectionsHtml = '';
    CHECKLIST_SECTIONS.forEach((sec, si) => {
      let itemsHtml = '';
      sec.items.forEach(item => {
        const saved = existing?.results?.[item.id] || {};
        const radios = COMPLIANCE_OPTS.map(opt => `<label class="cl-radio-label cl-radio-${COMPLIANCE_CLASSES[opt]}"><input type="radio" name="cl-${item.id}" value="${opt}" ${saved.compliance === opt ? 'checked' : ''}><span class="cl-radio-indicator"></span>${opt}</label>`).join('');
        itemsHtml += `<div class="cl-item" id="cl-item-${item.id}">
          <div class="cl-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span></div>
          <div class="cl-item-body">
            <div class="cl-compliance"><label class="form-label form-required">單位自評</label><div class="cl-radio-group">${radios}</div></div>
            <div class="cl-fields">
              <div class="form-group"><label class="form-label">執行情形簡述</label><textarea class="form-textarea cl-textarea" id="cl-exec-${item.id}" placeholder="${esc(item.hint)}" rows="2">${esc(saved.execution || '')}</textarea></div>
              <div class="form-group"><label class="form-label">佐證資料</label><textarea class="form-textarea cl-textarea" id="cl-evidence-${item.id}" placeholder="如執行紀錄、公文、截圖說明等" rows="2">${esc(saved.evidence || '')}</textarea></div>
            </div>
          </div>
        </div>`;
      });
      sectionsHtml += `<div class="cl-section"><div class="cl-section-header"><span class="cl-section-num">${si + 1}</span>${esc(sec.section)}</div><div class="cl-section-body">${itemsHtml}</div></div>`;
    });

    const selectedUnit = existing ? existing.unit : u.unit;
    const today = new Date().toISOString().split('T')[0];

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">${existing ? '續填檢核表' : '填報檢核表'}</h1><p class="page-subtitle">國立臺灣大學內部資通安全稽核查檢表${existing ? `（草稿 ${esc(existing.id)}）` : ''}</p></div><a href="#checklist" class="btn btn-secondary">← 返回列表</a></div>
      <div class="card" style="max-width:960px"><form id="checklist-form">
        <div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label form-required">受稽單位</label>${buildUnitCascadeControl('cl-unit', selectedUnit, false, true)}</div>
          <div class="form-group"><label class="form-label form-required">填表人員</label><input type="text" class="form-input" id="cl-filler" value="${esc(u.name)}" readonly></div>
          <div class="form-group"><label class="form-label form-required">自評日期</label><input type="date" class="form-input" id="cl-date" value="${existing ? esc(existing.fillDate) : today}" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">稽核年度</label><input type="text" class="form-input" id="cl-year" value="${existing ? esc(existing.auditYear) : String(new Date().getFullYear() - 1911)}" required></div>
          <div class="form-group"><label class="form-label">權責主管</label><input type="text" class="form-input" id="cl-supervisor" value="${existing ? esc(existing.supervisor || '') : ''}" placeholder="請輸入權責主管姓名"></div>
        </div>
        <div class="cl-progress-bar-wrap"><div class="cl-progress-label">填報進度</div><div class="cl-progress-bar"><div class="cl-progress-fill" id="cl-progress-fill" style="width:0%"></div></div><span class="cl-progress-text" id="cl-progress-text">0 / ${CHECKLIST_SECTIONS.reduce((a, s) => a + s.items.length, 0)}</span></div>
        ${sectionsHtml}
        <div class="form-actions"><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} 送出檢核表</button><button type="button" class="btn btn-secondary" id="cl-save-draft">${ic('save', 'icon-sm')} 儲存草稿</button><a href="#checklist" class="btn btn-ghost">取消</a></div>
      </form></div></div>`;

    refreshIcons();
    initUnitCascade('cl-unit', selectedUnit, { disabled: false });

    const totalItems = CHECKLIST_SECTIONS.reduce((a, s) => a + s.items.length, 0);
    function updateProgress() {
      let filled = 0;
      CHECKLIST_SECTIONS.forEach(sec => sec.items.forEach(item => {
        if (document.querySelector(`input[name="cl-${item.id}"]:checked`)) filled++;
      }));
      const pct = Math.round(filled / totalItems * 100);
      document.getElementById('cl-progress-fill').style.width = pct + '%';
      document.getElementById('cl-progress-text').textContent = filled + ' / ' + totalItems;
    }

    document.querySelectorAll('.cl-radio-group input').forEach(r => r.addEventListener('change', updateProgress));
    updateProgress();
    const clDateInput = document.getElementById('cl-date');
    const clYearInput = document.getElementById('cl-year');
    function syncAuditYearByDate() {
      const val = clDateInput.value;
      if (!val) return;
      const y = Number(val.split('-')[0]);
      if (Number.isFinite(y) && y >= 1911) clYearInput.value = String(y - 1911);
    }
    clDateInput.addEventListener('change', syncAuditYearByDate);
    if (!existing) syncAuditYearByDate();

    function collectData(status) {
      const results = {};
      let conform = 0, partial = 0, nonConform = 0, na = 0, total = 0;
      CHECKLIST_SECTIONS.forEach(sec => sec.items.forEach(item => {
        const sel = document.querySelector(`input[name="cl-${item.id}"]:checked`);
        const compliance = sel ? sel.value : '';
        results[item.id] = { compliance, execution: document.getElementById(`cl-exec-${item.id}`).value.trim(), evidence: document.getElementById(`cl-evidence-${item.id}`).value.trim() };
        total++;
        if (compliance === '符合') conform++;
        else if (compliance === '部分符合') partial++;
        else if (compliance === '不符合') nonConform++;
        else if (compliance === '不適用') na++;
      }));

      const now = new Date().toISOString();
      return {
        id: existing ? existing.id : generateChecklistId(),
        unit: document.getElementById('cl-unit').value,
        fillerName: document.getElementById('cl-filler').value,
        fillerUsername: existing?.fillerUsername || u.username,
        fillDate: document.getElementById('cl-date').value,
        auditYear: document.getElementById('cl-year').value,
        supervisor: document.getElementById('cl-supervisor').value.trim(),
        results,
        summary: { total, conform, partial, nonConform, na },
        status,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now
      };
    }

    document.getElementById('checklist-form').addEventListener('submit', e => {
      e.preventDefault();
      const missing = [];
      CHECKLIST_SECTIONS.forEach(sec => sec.items.forEach(item => { if (!document.querySelector(`input[name="cl-${item.id}"]:checked`)) missing.push(item.id); }));
      if (missing.length > 0) {
        toast(`尚有 ${missing.length} 個項目未填寫自評結果`, 'error');
        const el = document.getElementById(`cl-item-${missing[0]}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const data = collectData('已提交');
      if (existing) updateChecklist(existing.id, data); else addChecklist(data);
      toast(`檢核表 ${data.id} 已成功送出！`);
      navigate('checklist-detail/' + data.id);
    });

    document.getElementById('cl-save-draft').addEventListener('click', () => {
      const data = collectData('草稿');
      if (existing) updateChecklist(existing.id, data); else addChecklist(data);
      toast(`草稿 ${data.id} 已儲存`);
      navigate('checklist');
    });
  }
  // ─── Render: Checklist Detail ──────────────
  function renderChecklistDetail(id) {
    refreshChecklistSections();
    const cl = getChecklist(id);
    if (!cl) { document.getElementById('app').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ic('help-circle', 'icon-lg')}</div><div class="empty-state-title">找不到檢核表</div><a href="#checklist" class="btn btn-primary" style="margin-top:16px">返回列表</a></div>`; return; }
    if (!isAdmin() && cl.unit !== currentUser().unit) { navigate('checklist'); toast('您沒有權限檢視此檢核表', 'error'); return; }
    const s = cl.summary;
    const applicable = s.total - s.na;
    const applicableRate = applicable > 0 ? Math.round(s.conform / applicable * 100) : 0;
    const R = 50, C = 2 * Math.PI * R;
    const vals = [{ label: '符合', count: s.conform, color: COMPLIANCE_COLORS['符合'] }, { label: '部分符合', count: s.partial, color: COMPLIANCE_COLORS['部分符合'] }, { label: '不符合', count: s.nonConform, color: COMPLIANCE_COLORS['不符合'] }, { label: '不適用', count: s.na, color: COMPLIANCE_COLORS['不適用'] }];
    let segs = '', off = 0;
    if (s.total > 0) { vals.forEach(v => { if (!v.count) return; const l = v.count / s.total * C; segs += `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${v.color}" stroke-width="16" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-off}"/>`; off += l; }); }
    else { segs = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="#e2e8f0" stroke-width="16"/>`; }
    const svg = `<svg viewBox="0 0 120 120" class="cl-donut"><style>circle{transition:stroke-dashoffset .8s ease}</style>${segs}<text x="60" y="56" text-anchor="middle" fill="#0f172a" font-size="18" font-weight="700" font-family="Inter">${applicableRate}%</text><text x="60" y="72" text-anchor="middle" fill="#94a3b8" font-size="8" font-weight="500" font-family="Inter">符合率</text></svg>`;
    const legend = vals.map(v => `<div class="cl-legend-item"><span class="cl-legend-dot" style="background:${v.color}"></span>${v.label}<span class="cl-legend-count">${v.count}</span></div>`).join('');
    let sectDetail = '';
    CHECKLIST_SECTIONS.forEach(sec => {
      let rows = '';
      sec.items.forEach(item => {
        const r = cl.results[item.id] || {};
        const comp = r.compliance || '未填';
        const compCls = COMPLIANCE_CLASSES[comp] || '';
        rows += `<div class="cl-detail-item"><div class="cl-detail-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span><span class="cl-compliance-badge cl-badge-${compCls}">${comp}</span></div>`;
        if (r.execution) rows += `<div class="cl-detail-field"><span class="cl-detail-label">執行情形：</span>${esc(r.execution)}</div>`;
        if (r.evidence) rows += `<div class="cl-detail-field"><span class="cl-detail-label">佐證資料：</span>${esc(r.evidence)}</div>`;
        rows += '</div>';
      });
      sectDetail += `<div class="cl-detail-section"><div class="cl-detail-section-title">${esc(sec.section)}</div>${rows}</div>`;
    });
    let issues = [];
    CHECKLIST_SECTIONS.forEach(sec => sec.items.forEach(item => {
      const r = cl.results[item.id] || {};
      if (r.compliance === '不符合' || r.compliance === '部分符合') issues.push({ id: item.id, text: item.text, compliance: r.compliance, execution: r.execution || '' });
    }));
    const issueHtml = issues.length > 0 ? `<div class="card" style="margin-top:20px;border-left:3px solid #ef4444"><div class="section-header">${ic('alert-triangle', 'icon-sm')} 待改善項目（${issues.length} 項）</div>${issues.map(iss => `<div class="cl-issue-item"><span class="cl-compliance-badge cl-badge-${COMPLIANCE_CLASSES[iss.compliance]}">${iss.compliance}</span><span class="cl-item-id">${iss.id}</span> ${esc(iss.text)}${iss.execution ? `<div class="cl-issue-note">${esc(iss.execution)}</div>` : ''}</div>`).join('')}</div>` : '';
    const statusCls = cl.status === '已提交' ? 'badge-closed' : 'badge-pending';
    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="detail-header"><div>
        <div class="detail-id">${esc(cl.id)} · ${esc(cl.auditYear)} 年度</div>
        <h1 class="detail-title">內稽檢核表 — ${esc(cl.unit)}</h1>
        <div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">${ic('user', 'icon-xs')}</span>${esc(cl.fillerName)}</span><span class="detail-meta-item"><span class="detail-meta-icon">${ic('calendar', 'icon-xs')}</span>${fmt(cl.fillDate)}</span><span class="badge ${statusCls}"><span class="badge-dot"></span>${cl.status}</span></div>
      </div><a href="#checklist" class="btn btn-secondary">← 返回列表</a></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
        <div class="card"><div class="card-header"><span class="card-title">符合度統計</span></div>
          <div class="cl-stats-wrap">${svg}<div class="cl-legend">${legend}</div></div>
        </div>
        <div class="card"><div class="card-header"><span class="card-title">基本資訊</span></div>
          <div class="detail-grid">
            <div class="detail-field"><div class="detail-field-label">受稽單位</div><div class="detail-field-value">${esc(cl.unit)}</div></div>
            <div class="detail-field"><div class="detail-field-label">填表人員</div><div class="detail-field-value">${esc(cl.fillerName)}</div></div>
            <div class="detail-field"><div class="detail-field-label">稽核年度</div><div class="detail-field-value">${esc(cl.auditYear)} 年度</div></div>
            <div class="detail-field"><div class="detail-field-label">自評日期</div><div class="detail-field-value">${fmt(cl.fillDate)}</div></div>
            <div class="detail-field"><div class="detail-field-label">權責主管</div><div class="detail-field-value">${esc(cl.supervisor || '—')}</div></div>
            <div class="detail-field"><div class="detail-field-label">適用項目符合率</div><div class="detail-field-value" style="font-weight:700;color:${applicableRate >= 80 ? '#22c55e' : applicableRate >= 60 ? '#f59e0b' : '#ef4444'}">${applicableRate}%（${s.conform}/${applicable}）</div></div>
          </div>
        </div>
      </div>
      ${issueHtml}
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('clipboard-list', 'icon-sm')} 逐項檢核結果</span></div>${sectDetail}</div>
    </div>`;
    refreshIcons();
  }

  // ─── Render: Checklist Manage (Admin only) ──────────────────────────────
  function renderChecklistManage() {
    if (!isAdmin()) { navigate('dashboard'); toast('僅最高管理員可管理檢核表', 'error'); return; }
    refreshChecklistSections();

    const totalItems = CHECKLIST_SECTIONS.reduce((acc, s) => acc + s.items.length, 0);

    // Build accordion UI for each section
    let sectHtml = '';
    CHECKLIST_SECTIONS.forEach((sec, si) => {
      const itemRows = sec.items.map((item, ii) => `
        <div class="cm-item" data-si="${si}" data-ii="${ii}">
          <div class="cm-item-drag" title="拖曳排序">≡</div>
          <div class="cm-item-content">
            <div class="cm-item-row">
              <span class="cl-item-id" style="flex-shrink:0">${esc(item.id)}</span>
              <span class="cm-item-text">${esc(item.text)}</span>
            </div>
            <div class="cm-item-hint">💡 ${esc(item.hint || '（無提示）')}</div>
          </div>
          <div class="cm-item-actions">
            <button class="btn btn-sm btn-secondary" onclick="window._cmEditItem(${si},${ii})" title="編輯">${ic('edit-2', 'btn-icon-svg')}</button>
            <button class="btn btn-sm btn-danger" onclick="window._cmDelItem(${si},${ii})" title="刪除">${ic('trash-2', 'btn-icon-svg')}</button>
          </div>
        </div>`).join('');

      sectHtml += `
        <div class="cm-section" data-si="${si}">
          <div class="cm-section-header">
            <div class="cm-section-title-wrap">
              <span class="cl-section-num">${si + 1}</span>
              <span class="cm-section-name" id="cm-sname-${si}">${esc(sec.section)}</span>
            </div>
            <div class="cm-section-actions">
              <span class="cm-item-count">${sec.items.length} 題</span>
              <button class="btn btn-sm btn-secondary" onclick="window._cmEditSection(${si})" title="編輯大項名稱">${ic('edit-2', 'btn-icon-svg')}</button>
              <button class="btn btn-sm btn-primary" onclick="window._cmAddItem(${si})" title="新增題目">${ic('plus', 'btn-icon-svg')} 新增題目</button>
              <button class="btn btn-sm btn-danger" onclick="window._cmDelSection(${si})" title="刪除大項">${ic('trash-2', 'btn-icon-svg')}</button>
            </div>
          </div>
          <div class="cm-items-wrap">${itemRows}</div>
        </div>`;
    });

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">檢核表管理</h1>
          <p class="page-subtitle">共 ${CHECKLIST_SECTIONS.length} 大項 · ${totalItems} 題 — 可新增、編輯、刪除各大項及題目</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="window._cmResetDefault()">${ic('refresh-cw', 'icon-sm')} 恢復預設</button>
          <button class="btn btn-primary" onclick="window._cmAddSection()">${ic('plus-circle', 'icon-sm')} 新增大項</button>
        </div>
      </div>

      <div class="cm-info-banner">
        ${ic('info', 'icon-sm')}
        <span>修改後立即生效，填報時將使用最新版本。已提交的檢核表不受影響。</span>
      </div>

      <div id="cm-sections-wrap">${sectHtml}</div>
    </div>`;

    refreshIcons();
  }

  // ── Checklist Manage: helper to re-render just the sections ──
  function _cmRefreshSections() {
    refreshChecklistSections();
    const wrap = document.getElementById('cm-sections-wrap');
    if (!wrap) { renderChecklistManage(); return; }

    let sectHtml = '';
    CHECKLIST_SECTIONS.forEach((sec, si) => {
      const itemRows = sec.items.map((item, ii) => `
        <div class="cm-item" data-si="${si}" data-ii="${ii}">
          <div class="cm-item-drag" title="拖曳排序">≡</div>
          <div class="cm-item-content">
            <div class="cm-item-row">
              <span class="cl-item-id" style="flex-shrink:0">${esc(item.id)}</span>
              <span class="cm-item-text">${esc(item.text)}</span>
            </div>
            <div class="cm-item-hint">💡 ${esc(item.hint || '（無提示）')}</div>
          </div>
          <div class="cm-item-actions">
            <button class="btn btn-sm btn-secondary" onclick="window._cmEditItem(${si},${ii})" title="編輯">${ic('edit-2', 'btn-icon-svg')}</button>
            <button class="btn btn-sm btn-danger" onclick="window._cmDelItem(${si},${ii})" title="刪除">${ic('trash-2', 'btn-icon-svg')}</button>
          </div>
        </div>`).join('');

      sectHtml += `
        <div class="cm-section" data-si="${si}">
          <div class="cm-section-header">
            <div class="cm-section-title-wrap">
              <span class="cl-section-num">${si + 1}</span>
              <span class="cm-section-name" id="cm-sname-${si}">${esc(sec.section)}</span>
            </div>
            <div class="cm-section-actions">
              <span class="cm-item-count">${sec.items.length} 題</span>
              <button class="btn btn-sm btn-secondary" onclick="window._cmEditSection(${si})" title="編輯大項名稱">${ic('edit-2', 'btn-icon-svg')}</button>
              <button class="btn btn-sm btn-primary" onclick="window._cmAddItem(${si})" title="新增題目">${ic('plus', 'btn-icon-svg')} 新增題目</button>
              <button class="btn btn-sm btn-danger" onclick="window._cmDelSection(${si})" title="刪除大項">${ic('trash-2', 'btn-icon-svg')}</button>
            </div>
          </div>
          <div class="cm-items-wrap">${itemRows}</div>
        </div>`;
    });

    wrap.innerHTML = sectHtml;
    // Update subtitle
    const totalItems = CHECKLIST_SECTIONS.reduce((acc, s) => acc + s.items.length, 0);
    const subtitle = document.querySelector('.page-subtitle');
    if (subtitle) subtitle.textContent = `共 ${CHECKLIST_SECTIONS.length} 大項 · ${totalItems} 題 — 可新增、編輯、刪除各大項及題目`;
    refreshIcons();
  }

  // ── Modal helper for checklist manage ──
  function _cmModal(title, bodyHtml, onSave) {
    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-backdrop" id="cm-modal-bg">
      <div class="modal" style="max-width:620px">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-root').innerHTML=''">✕</button>
        </div>
        <form id="cm-modal-form">
          ${bodyHtml}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${ic('save', 'icon-sm')} 儲存</button>
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-root').innerHTML=''">取消</button>
          </div>
        </form>
      </div>
    </div>`;
    document.getElementById('cm-modal-bg').addEventListener('click', e => { if (e.target === e.currentTarget) mr.innerHTML = ''; });
    document.getElementById('cm-modal-form').addEventListener('submit', e => { e.preventDefault(); onSave(); mr.innerHTML = ''; _cmRefreshSections(); });
    refreshIcons();
  }

  // ── Generate next item ID for a section ──
  function _cmNextItemId(si) {
    const sec = CHECKLIST_SECTIONS[si];
    const prefix = String(si + 1) + '.';
    const used = sec.items.map(it => {
      const n = parseFloat(it.id.replace(prefix, ''));
      return isNaN(n) ? 0 : n;
    });
    const max = used.length ? Math.max(...used) : 0;
    return prefix + (max + 1);
  }

  // ── Add Section ──
  window._cmAddSection = function () {
    _cmModal('新增大項', `
      <div class="form-group">
        <label class="form-label form-required">大項名稱</label>
        <input type="text" class="form-input" id="cm-sec-name" placeholder="例：10. 雲端服務安全管理" required autofocus>
      </div>`, () => {
      const name = document.getElementById('cm-sec-name').value.trim();
      if (!name) return;
      const secs = getChecklistSections();
      secs.push({ section: name, items: [] });
      saveChecklistSections(secs);
      toast('大項已新增');
    });
  };

  // ── Edit Section ──
  window._cmEditSection = function (si) {
    const secs = getChecklistSections();
    const sec = secs[si];
    _cmModal('編輯大項名稱', `
      <div class="form-group">
        <label class="form-label form-required">大項名稱</label>
        <input type="text" class="form-input" id="cm-sec-name" value="${esc(sec.section)}" required autofocus>
      </div>`, () => {
      const name = document.getElementById('cm-sec-name').value.trim();
      if (!name) return;
      const s2 = getChecklistSections();
      s2[si].section = name;
      saveChecklistSections(s2);
      toast('大項名稱已更新');
    });
  };

  // ── Delete Section ──
  window._cmDelSection = function (si) {
    const secs = getChecklistSections();
    if (!confirm(`確定刪除大項「${secs[si].section}」及其所有題目（共 ${secs[si].items.length} 題）？`)) return;
    secs.splice(si, 1);
    saveChecklistSections(secs);
    toast('大項已刪除', 'info');
    _cmRefreshSections();
  };

  // ── Add Item ──
  window._cmAddItem = function (si) {
    const nextId = _cmNextItemId(si);
    _cmModal('新增題目', `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label form-required">題號</label>
          <input type="text" class="form-input" id="cm-item-id" value="${esc(nextId)}" placeholder="例：8.10" required>
          <p class="form-hint">建議格式：大項編號.流水號</p>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label form-required">題目文字</label>
        <textarea class="form-textarea" id="cm-item-text" placeholder="請輸入稽核題目…" required style="min-height:80px" autofocus></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">佐證提示（填表說明）</label>
        <textarea class="form-textarea" id="cm-item-hint" placeholder="例：請提供截圖或相關文件" style="min-height:60px"></textarea>
      </div>`, () => {
      const id = document.getElementById('cm-item-id').value.trim();
      const text = document.getElementById('cm-item-text').value.trim();
      const hint = document.getElementById('cm-item-hint').value.trim();
      if (!id || !text) { toast('題號與題目為必填', 'error'); return; }
      const secs = getChecklistSections();
      // Check for duplicate ID
      const allIds = secs.flatMap(s => s.items.map(it => it.id));
      if (allIds.includes(id)) { toast(`題號「${id}」已存在，請使用其他題號`, 'error'); return; }
      secs[si].items.push({ id, text, hint });
      saveChecklistSections(secs);
      toast('題目已新增');
    });
  };

  // ── Edit Item ──
  window._cmEditItem = function (si, ii) {
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
        <label class="form-label form-required">題目文字</label>
        <textarea class="form-textarea" id="cm-item-text" required style="min-height:80px">${esc(item.text)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">佐證提示（填表說明）</label>
        <textarea class="form-textarea" id="cm-item-hint" style="min-height:60px">${esc(item.hint || '')}</textarea>
      </div>`, () => {
      const newId = document.getElementById('cm-item-id').value.trim();
      const text = document.getElementById('cm-item-text').value.trim();
      const hint = document.getElementById('cm-item-hint').value.trim();
      if (!newId || !text) { toast('題號與題目為必填', 'error'); return; }
      const s2 = getChecklistSections();
      // Check for duplicate ID (excluding current item)
      const allIds = s2.flatMap((sec, sIdx) => sec.items.map((it, iIdx) => ({ id: it.id, si: sIdx, ii: iIdx }))).filter(x => !(x.si === si && x.ii === ii)).map(x => x.id);
      if (allIds.includes(newId)) { toast(`題號「${newId}」已存在，請使用其他題號`, 'error'); return; }
      s2[si].items[ii] = { id: newId, text, hint };
      saveChecklistSections(s2);
      toast('題目已更新');
    });
  };

  // ── Delete Item ──
  window._cmDelItem = function (si, ii) {
    const secs = getChecklistSections();
    const item = secs[si].items[ii];
    if (!confirm(`確定刪除題目「${item.id}」？`)) return;
    secs[si].items.splice(ii, 1);
    saveChecklistSections(secs);
    toast('題目已刪除', 'info');
    _cmRefreshSections();
  };

  // ── Reset to Default ──
  window._cmResetDefault = function () {
    if (!confirm('確定恢復為系統預設題目？目前所有自訂修改將會遺失。')) return;
    localStorage.removeItem(TEMPLATE_KEY);
    refreshChecklistSections();
    toast('已恢復為系統預設', 'info');
    _cmRefreshSections();
  };

  // ─── Training Hours Data Model ─────────────────────
  function emptyTrainingStore() { return { forms: [], rosters: [], nextFormId: 1, nextRosterId: 1 }; }
  function loadTrainingStore() {
    const raw = readCachedJson(TRAINING_KEY, emptyTrainingStore);
    if (!raw || typeof raw !== 'object') return emptyTrainingStore();
    if (!Array.isArray(raw.forms)) raw.forms = [];
    if (!Array.isArray(raw.rosters)) raw.rosters = [];
    if (!Number.isFinite(raw.nextFormId)) raw.nextFormId = 1;
    if (!Number.isFinite(raw.nextRosterId)) raw.nextRosterId = 1;
    return raw;
  }
  function saveTrainingStore(d) { writeCachedJson(TRAINING_KEY, d); }
  function getAllTrainingForms() { return loadTrainingStore().forms.slice(); }
  function getTrainingForm(id) { return loadTrainingStore().forms.find(f => f.id === id); }
  function upsertTrainingForm(form) { const d = loadTrainingStore(); const i = d.forms.findIndex(f => f.id === form.id); if (i >= 0) d.forms[i] = form; else d.forms.push(form); saveTrainingStore(d); }
  function updateTrainingForm(id, updates) { const d = loadTrainingStore(); const i = d.forms.findIndex(f => f.id === id); if (i < 0) return; d.forms[i] = { ...d.forms[i], ...updates }; saveTrainingStore(d); }
  function generateTrainingFormId() { const d = loadTrainingStore(); const id = `TRN-${String(d.nextFormId).padStart(4, '0')}`; d.nextFormId++; saveTrainingStore(d); return id; }

  function getAllTrainingRosters() { return loadTrainingStore().rosters.slice(); }
  function getTrainingRosterByUnit(unit) { return getAllTrainingRosters().filter(r => r.unit === unit).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')); }
  function addTrainingRosterPerson(unit, name, source, actor) {
    const cleanUnit = (unit || '').trim();
    const cleanName = (name || '').trim();
    if (!cleanUnit || !cleanName) return { added: false, reason: '單位與姓名不可為空白' };
    const d = loadTrainingStore();
    const exists = d.rosters.find(r => r.unit === cleanUnit && r.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) return { added: false, reason: `「${cleanName}」已在名單中` };
    const id = `RST-${String(d.nextRosterId).padStart(4, '0')}`;
    d.nextRosterId++;
    d.rosters.push({ id, unit: cleanUnit, name: cleanName, source: source || 'manual', createdBy: actor || '系統', createdAt: new Date().toISOString() });
    saveTrainingStore(d);
    return { added: true, id };
  }
  function deleteTrainingRosterPerson(id) { const d = loadTrainingStore(); d.rosters = d.rosters.filter(r => r.id !== id); saveTrainingStore(d); }

  function getTrainingUnits() {
    return getSystemUnits();
  }
  function getVisibleTrainingForms() {
    const u = currentUser();
    if (!u) return [];
    const all = getAllTrainingForms();
    if (u.role === ROLES.ADMIN) return all;
    return all.filter(f => f.unit === u.unit || f.fillerUsername === u.username);
  }
  function canEditTrainingForm(form) {
    const u = currentUser();
    if (!u || !form) return false;
    const inScope = u.role === ROLES.ADMIN || form.unit === u.unit || form.fillerUsername === u.username;
    if (!inScope) return false;
    return form.status !== TRAINING_STATUSES.SUBMITTED;
  }
  function isTrainingVisible(form) {
    const u = currentUser();
    if (!u || !form) return false;
    if (u.role === ROLES.ADMIN) return true;
    return form.unit === u.unit || form.fillerUsername === u.username;
  }

  function computeTrainingSummary(records) {
    const rows = Array.isArray(records) ? records : [];
    let totalHours = 0;
    let filledPeople = 0;
    let reached = 0;
    rows.forEach(r => {
      const h = Number(r.hours || 0);
      if (h > 0) filledPeople++;
      if (h >= 3) reached++;
      totalHours += h;
    });
    const totalPeople = rows.length;
    const avgHours = totalPeople > 0 ? totalHours / totalPeople : 0;
    return { totalPeople, filledPeople, reached, totalHours: Number(totalHours.toFixed(2)), avgHours: Number(avgHours.toFixed(2)), reachRate: totalPeople > 0 ? Math.round(reached / totalPeople * 100) : 0 };
  }
  function trainingStatusBadge(status) {
    const cls = status === TRAINING_STATUSES.SUBMITTED ? 'badge-closed' : (status === TRAINING_STATUSES.RETURNED ? 'badge-overdue' : 'badge-pending');
    return `<span class="badge ${cls}"><span class="badge-dot"></span>${status}</span>`;
  }
  function csvCell(v) {
    const text = String(v === null || v === undefined ? '' : v);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }
  function downloadCsv(filename, headers, rows) {
    const lines = [headers.map(csvCell).join(',')].concat(rows.map(r => r.map(csvCell).join(',')));
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportTrainingSummaryCsv(forms, filename) {
    const rows = forms.map(f => [f.id, f.unit, f.trainingYear, f.status, f.fillerName, fmt(f.fillDate), f.summary?.totalPeople || 0, f.summary?.filledPeople || 0, f.summary?.reached || 0, f.summary?.totalHours || 0, f.summary?.avgHours || 0, f.submittedAt ? fmtTime(f.submittedAt) : '', fmtTime(f.updatedAt)]);
    downloadCsv(filename || `教育訓練時數統計_${new Date().toISOString().slice(0, 10)}.csv`, ['編號', '單位', '年度', '狀態', '填報人', '填報日期', '名單總人數', '已填時數人數', '達標人數(>=3h)', '總時數', '平均時數', '正式送出時間', '最後更新時間'], rows);
  }
  window._trainingReturn = function (id) {
    if (!isAdmin()) { toast('僅管理者可退回更正', 'error'); return; }
    const form = getTrainingForm(id);
    if (!form) return;
    if (form.status !== TRAINING_STATUSES.SUBMITTED) { toast('僅正式送出資料可退回', 'error'); return; }
    const reason = prompt('請輸入退回更正原因：');
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) { toast('退回原因不可空白', 'error'); return; }
    const now = new Date().toISOString();
    updateTrainingForm(id, {
      status: TRAINING_STATUSES.RETURNED,
      returnReason: trimmed,
      updatedAt: now,
      history: [...(form.history || []), { time: now, action: `管理者退回更正：${trimmed}`, user: currentUser().name }]
    });
    toast(`已退回 ${id} 供填報人更正`, 'info');
    const r = getRoute();
    if (r.page === 'training-detail') renderTrainingDetail(id); else renderTraining();
  };

  window._trainingExportDetailCsv = function (id) {
    const form = getTrainingForm(id);
    if (!form) return;
    const rows = (form.records || []).map(r => [form.id, form.unit, form.trainingYear, r.name, r.source === 'import' ? '管理者匯入' : '填報新增', Number(r.hours || 0), r.note || '']);
    downloadCsv(`教育訓練時數_${form.id}.csv`, ['填報編號', '單位', '年度', '人員姓名', '來源', '時數', '備註'], rows);
  };

  window._trainingDeleteRoster = function (id) {
    if (!isAdmin()) { toast('僅管理者可刪除名單', 'error'); return; }
    const roster = getAllTrainingRosters().find(r => r.id === id);
    if (!roster) return;
    if (!confirm(`確定刪除名單人員「${roster.name}（${roster.unit}）」？`)) return;
    deleteTrainingRosterPerson(id);
    toast('名單人員已刪除', 'info');
    renderTrainingRoster();
  };

  function renderTraining() {
    const forms = getVisibleTrainingForms().slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const summary = {
      total: forms.length,
      draft: forms.filter(f => f.status === TRAINING_STATUSES.DRAFT).length,
      submitted: forms.filter(f => f.status === TRAINING_STATUSES.SUBMITTED).length,
      returned: forms.filter(f => f.status === TRAINING_STATUSES.RETURNED).length
    };

    const toolbar = `<div style="display:flex;gap:8px;flex-wrap:wrap">${canFillTraining() ? `<a href="#training-fill" class="btn btn-primary">${ic('plus-circle', 'icon-sm')} 新增填報</a>` : ''}${forms.length ? `<button class="btn btn-secondary" id="training-export-all">${ic('download', 'icon-sm')} 匯出CSV</button>` : ''}${isAdmin() ? `<a href="#training-roster" class="btn btn-secondary">${ic('users', 'icon-sm')} 名單管理</a>` : ''}</div>`;

    const rows = forms.length ? forms.map(f => {
      const act = [`<a href="#training-detail/${f.id}" class="btn btn-sm btn-secondary">檢視</a>`];
      if (canEditTrainingForm(f)) act.push(`<a href="#training-fill/${f.id}" class="btn btn-sm btn-primary">繼續填報</a>`);
      if (isAdmin() && f.status === TRAINING_STATUSES.SUBMITTED) act.push(`<button type="button" class="btn btn-sm btn-danger" onclick="window._trainingReturn('${f.id}')">退回更正</button>`);
      return `<tr><td style="font-weight:600;color:var(--accent-primary)">${esc(f.id)}</td><td>${esc(f.unit)}</td><td>${esc(f.fillerName)}</td><td>${esc(f.trainingYear)}</td><td>${trainingStatusBadge(f.status)}</td><td>${f.summary?.totalPeople || 0}</td><td>${f.summary?.totalHours || 0}</td><td>${f.summary?.reachRate || 0}%</td><td>${fmtTime(f.updatedAt)}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap">${act.join('')}</div></td></tr>`;
    }).join('') : `<tr><td colspan="10"><div class="empty-state" style="padding:50px"><div class="empty-state-icon">${ic('graduation-cap')}</div><div class="empty-state-title">尚無教育訓練時數填報資料</div><div class="empty-state-desc">可先新增填報，或由管理者先匯入各單位名單</div></div></td></tr>`;

    let adminPanel = '';
    if (isAdmin()) {
      const allForms = getAllTrainingForms();
      const units = getTrainingUnits();
      const unitStats = units.map(unit => {
        const latest = allForms.filter(f => f.unit === unit).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
        return { unit, status: latest ? latest.status : '未填報', reachRate: latest ? (latest.summary?.reachRate || 0) : 0 };
      });
      const submittedUnits = unitStats.filter(x => x.status === TRAINING_STATUSES.SUBMITTED).length;
      const schoolProgress = unitStats.length ? Math.round(submittedUnits / unitStats.length * 100) : 0;
      const totalHours = allForms.reduce((sum, f) => sum + Number(f.summary?.totalHours || 0), 0).toFixed(1);
      const chartRows = unitStats.length ? unitStats.map(u => `<div class="training-chart-row"><div class="training-chart-label">${esc(u.unit)}</div><div class="training-chart-track"><div class="training-chart-fill" style="width:${Math.max(0, Math.min(100, u.reachRate))}%"></div></div><div class="training-chart-value">${u.reachRate}% (${esc(u.status)})</div></div>`).join('') : `<div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無單位資料</div></div>`;
      adminPanel = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px"><div class="card"><div class="card-header"><span class="card-title">全校填報進度</span></div><div class="training-kpi-value">${schoolProgress}%</div><div class="training-kpi-desc">已正式送出單位 ${submittedUnits} / ${unitStats.length}</div></div><div class="card"><div class="card-header"><span class="card-title">全校訓練總時數</span></div><div class="training-kpi-value">${totalHours}</div><div class="training-kpi-desc">以最新填報資料累計</div></div></div><div class="card" style="margin-bottom:20px"><div class="card-header"><span class="card-title">各單位達標率（每人 3 小時以上）</span></div><div class="training-chart">${chartRows}</div></div>`;
    }

    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">教育訓練時數統計</h1><p class="page-subtitle">支援名單匯入、暫存、正式送出、退回更正與 CSV 匯出</p></div>${toolbar}</div><div class="stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('files')}</div><div class="stat-value">${summary.total}</div><div class="stat-label">填報單總數</div></div><div class="stat-card pending"><div class="stat-icon">${ic('save')}</div><div class="stat-value">${summary.draft}</div><div class="stat-label">暫存中</div></div><div class="stat-card closed"><div class="stat-icon">${ic('check-circle-2')}</div><div class="stat-value">${summary.submitted}</div><div class="stat-label">正式送出</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('corner-up-left')}</div><div class="stat-value">${summary.returned}</div><div class="stat-label">退回更正</div></div></div>${adminPanel}<div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>編號</th><th>單位</th><th>填報人</th><th>年度</th><th>狀態</th><th>名單人數</th><th>總時數</th><th>達標率</th><th>最後更新</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;

    document.getElementById('training-export-all')?.addEventListener('click', () => exportTrainingSummaryCsv(forms));
    refreshIcons();
  }
  function renderTrainingFill(id) {
    if (!canFillTraining()) { navigate('training'); return; }
    const u = currentUser();
    const existing = id ? getTrainingForm(id) : null;
    if (id && !existing) { toast('找不到填報單', 'error'); navigate('training'); return; }
    if (existing && !isTrainingVisible(existing)) { toast('您沒有此填報單權限', 'error'); navigate('training'); return; }
    if (existing && !canEditTrainingForm(existing)) { toast('此填報單已正式送出，請待管理者退回後再修改', 'error'); navigate('training-detail/' + existing.id); return; }

    const units = getTrainingUnits();
    if (u.unit && !units.includes(u.unit)) units.push(u.unit);
    if (existing?.unit && !units.includes(existing.unit)) units.push(existing.unit);
    units.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const unitValue = existing ? existing.unit : (isAdmin() ? (u.unit || units[0] || '') : u.unit);
    const isUnitLocked = !!existing || !isAdmin();


    function buildRows(targetUnit, carryRows) {
      const rosterRows = getTrainingRosterByUnit(targetUnit).map(r => {
        const fromCarry = (carryRows || []).find(c => (c.rosterId && c.rosterId === r.id) || (!c.rosterId && c.name === r.name));
        return { rosterId: r.id, name: r.name, source: r.source || 'import', hours: fromCarry ? fromCarry.hours : '', note: fromCarry ? fromCarry.note : '' };
      });
      (carryRows || []).forEach(c => {
        const exists = rosterRows.some(r => (c.rosterId && r.rosterId === c.rosterId) || r.name === c.name);
        if (!exists) rosterRows.push({ rosterId: c.rosterId || '', name: c.name, source: c.source || 'manual', hours: c.hours || '', note: c.note || '' });
      });
      return rosterRows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    }

    let rowsState = buildRows(unitValue, existing ? (existing.records || []) : []);
    let signedFiles = existing ? [...(existing.signedFiles || [])] : [];
    const submitLabel = existing && existing.status === TRAINING_STATUSES.RETURNED ? '更正後正式送出' : '正式送出';

    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">填報教育訓練時數</h1><p class="page-subtitle">填報進度可暫存於系統，正式送出後將鎖定，需管理者退回才可更正</p></div><a href="#training" class="btn btn-secondary">← 返回列表</a></div>${existing && existing.status === TRAINING_STATUSES.RETURNED ? `<div class="training-return-banner">${ic('alert-triangle', 'icon-sm')} 退回原因：${esc(existing.returnReason || '未提供')}</div>` : ''}<div class="card" style="max-width:980px"><form id="training-form"><div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div><div class="form-row"><div class="form-group"><label class="form-label form-required">填報單位</label>${buildUnitCascadeControl('tr-unit', unitValue, isUnitLocked, true)}</div><div class="form-group"><label class="form-label form-required">填報人</label><input type="text" class="form-input" value="${esc(u.name)}" readonly></div><div class="form-group"><label class="form-label form-required">填報日期</label><input type="date" class="form-input" id="tr-date" value="${existing ? esc(existing.fillDate) : new Date().toISOString().split('T')[0]}" required></div></div><div class="form-row"><div class="form-group"><label class="form-label form-required">統計年度</label><input type="text" class="form-input" id="tr-year" value="${existing ? esc(existing.trainingYear) : String(new Date().getFullYear() - 1911)}" required></div><div class="form-group"><label class="form-label">填報說明</label><input type="text" class="form-input" value="管理者可匯入名單；填報人可新增名單外人員" readonly></div></div><div class="section-header">${ic('users', 'icon-sm')} 人員名單與時數</div><p class="form-hint">名單刪除僅限管理者。填報人可新增名單外人員，不可刪減既有名單。</p><div class="form-row" style="align-items:flex-end"><div class="form-group"><label class="form-label">新增名單外人員</label><input type="text" class="form-input" id="tr-new-person" placeholder="輸入姓名後按新增"></div><div class="form-group" style="flex:0 0 auto"><button type="button" class="btn btn-secondary" id="training-add-person">${ic('user-plus', 'icon-sm')} 新增到名單</button></div></div><div class="table-wrapper" style="margin-top:8px"><table><thead><tr><th style="width:160px">來源</th><th>姓名</th><th style="width:160px">時數</th><th>備註</th></tr></thead><tbody id="training-rows-body"></tbody></table></div><div id="training-summary" class="training-summary-grid"></div><div class="section-header" style="margin-top:16px">${ic('paperclip', 'icon-sm')} 上傳簽核後掃描檔</div><div class="upload-zone" id="training-upload-zone"><input type="file" id="training-file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">${ic('folder-open')}</div><div class="upload-zone-text">拖曳檔案或 <strong>點此選擇</strong></div><div class="upload-zone-hint">支援 JPG / PNG / PDF，單檔上限 5MB</div></div><div class="file-preview-list" id="training-file-previews"></div><div class="form-actions"><button type="button" class="btn btn-secondary" id="training-save-draft">${ic('save', 'icon-sm')} 儲存暫存</button><button type="submit" class="btn btn-primary">${ic('send', 'icon-sm')} ${submitLabel}</button><a href="#training" class="btn btn-ghost">取消</a></div></form></div></div>`;

    function renderSummary() {
      const s = computeTrainingSummary(rowsState.map(r => ({ ...r, hours: Number(r.hours || 0) })));
      document.getElementById('training-summary').innerHTML = `<div class="training-mini-card"><div class="training-mini-label">名單總人數</div><div class="training-mini-value">${s.totalPeople}</div></div><div class="training-mini-card"><div class="training-mini-label">已填時數人數</div><div class="training-mini-value">${s.filledPeople}</div></div><div class="training-mini-card"><div class="training-mini-label">總時數</div><div class="training-mini-value">${s.totalHours}</div></div><div class="training-mini-card"><div class="training-mini-label">達標率(>=3h)</div><div class="training-mini-value">${s.reachRate}%</div></div>`;
    }

    function renderRows() {
      const body = document.getElementById('training-rows-body');
      if (!rowsState.length) {
        body.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:24px"><div class="empty-state-title">此單位目前尚無名單人員</div><div class="empty-state-desc">請先新增名單外人員，或由管理者匯入名單</div></div></td></tr>`;
        renderSummary();
        return;
      }
      body.innerHTML = rowsState.map((r, idx) => `<tr><td><span class="training-source-tag ${r.source === 'import' ? 'import' : 'manual'}">${r.source === 'import' ? '管理者匯入' : '填報新增'}</span></td><td>${esc(r.name)}</td><td><input type="number" min="0" step="0.5" class="form-input training-hours-input" data-idx="${idx}" value="${esc(r.hours === 0 ? '0' : (r.hours || ''))}"></td><td><input type="text" class="form-input training-note-input" data-idx="${idx}" value="${esc(r.note || '')}" placeholder="可填課程名稱或備註"></td></tr>`).join('');
      body.querySelectorAll('.training-hours-input').forEach(el => el.addEventListener('input', e => { const i = Number(e.target.dataset.idx); rowsState[i].hours = e.target.value; renderSummary(); }));
      body.querySelectorAll('.training-note-input').forEach(el => el.addEventListener('input', e => { const i = Number(e.target.dataset.idx); rowsState[i].note = e.target.value; }));
      renderSummary();
    }

    function renderSignedFiles() {
      const wrap = document.getElementById('training-file-previews');
      if (!signedFiles.length) { wrap.innerHTML = '<p style="color:var(--text-muted);font-size:.88rem">尚未上傳簽核掃描檔</p>'; return; }
      wrap.innerHTML = signedFiles.map((f, i) => { const preview = f.type && f.type.startsWith('image/') ? `<img src="${f.data}" alt="${esc(f.name)}">` : `<div class="file-pdf-icon">${ic('file-box')}</div>`; return `<div class="file-preview-item">${preview}<div class="file-name">${esc(f.name)}</div><button type="button" class="file-remove" data-idx="${i}">✕</button></div>`; }).join('');
      wrap.querySelectorAll('.file-remove').forEach(btn => btn.addEventListener('click', e => { const i = Number(e.target.dataset.idx); signedFiles.splice(i, 1); renderSignedFiles(); }));
      refreshIcons();
    }

    function handleFiles(files) {
      Array.from(files).forEach(file => {
        if (file.size > 5 * 1024 * 1024) { toast(`「${file.name}」超過 5MB`, 'error'); return; }
        const reader = new FileReader();
        reader.onload = evt => { signedFiles.push({ name: file.name, type: file.type, data: evt.target.result }); renderSignedFiles(); };
        reader.readAsDataURL(file);
      });
    }

    function collectRecords() { return rowsState.map(r => ({ rosterId: r.rosterId || null, name: r.name, source: r.source || 'manual', hours: Number(r.hours || 0), note: (r.note || '').trim() })); }

    function saveTrainingForm(targetStatus) {
      const now = new Date().toISOString();
      const formId = existing ? existing.id : generateTrainingFormId();
      const records = collectRecords();
      const summary = computeTrainingSummary(records);
      if (targetStatus === TRAINING_STATUSES.SUBMITTED) {
        if (!signedFiles.length) { toast('正式送出前請先上傳簽核掃描檔', 'error'); return; }
        if (summary.filledPeople === 0) { toast('正式送出前請至少填寫一位人員時數', 'error'); return; }
      }
      const nextStatus = targetStatus === TRAINING_STATUSES.SUBMITTED ? TRAINING_STATUSES.SUBMITTED : ((existing && existing.status === TRAINING_STATUSES.RETURNED) ? TRAINING_STATUSES.RETURNED : TRAINING_STATUSES.DRAFT);
      const history = [...(existing?.history || [])];
      history.push({ time: now, action: targetStatus === TRAINING_STATUSES.SUBMITTED ? '正式送出教育訓練時數統計' : '儲存教育訓練時數暫存', user: u.name });
      const payload = { id: formId, unit: document.getElementById('tr-unit').value, fillerName: u.name, fillerUsername: u.username, fillDate: document.getElementById('tr-date').value, trainingYear: document.getElementById('tr-year').value.trim() || String(new Date().getFullYear() - 1911), status: nextStatus, records, summary, signedFiles, returnReason: targetStatus === TRAINING_STATUSES.SUBMITTED ? '' : (existing?.returnReason || ''), createdAt: existing?.createdAt || now, updatedAt: now, submittedAt: targetStatus === TRAINING_STATUSES.SUBMITTED ? now : (existing?.submittedAt || null), history };
      upsertTrainingForm(payload);
      toast(targetStatus === TRAINING_STATUSES.SUBMITTED ? `填報單 ${formId} 已正式送出` : `填報單 ${formId} 已暫存`);
      navigate('training-detail/' + formId);
    }

    document.getElementById('training-form').addEventListener('submit', e => { e.preventDefault(); saveTrainingForm(TRAINING_STATUSES.SUBMITTED); });
    document.getElementById('training-save-draft').addEventListener('click', () => saveTrainingForm(TRAINING_STATUSES.DRAFT));
    initUnitCascade('tr-unit', unitValue, { disabled: isUnitLocked });
    document.getElementById('training-add-person').addEventListener('click', () => {
      const unit = document.getElementById('tr-unit').value;
      const input = document.getElementById('tr-new-person');
      const name = input.value.trim();
      if (!name) { toast('請輸入要新增的人員姓名', 'error'); return; }
      const result = addTrainingRosterPerson(unit, name, 'manual', u.name);
      if (!result.added) { toast(result.reason, 'error'); return; }
      rowsState = buildRows(unit, rowsState);
      renderRows();
      input.value = '';
      toast(`已新增「${name}」至 ${unit} 名單`);
    });

    if (!isUnitLocked) document.getElementById('tr-unit').addEventListener('change', e => { rowsState = buildRows(e.target.value, rowsState); renderRows(); });

    const fi = document.getElementById('training-file-input');
    const uz = document.getElementById('training-upload-zone');
    fi.addEventListener('change', e => handleFiles(e.target.files));
    uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('dragover'); });
    uz.addEventListener('dragleave', () => uz.classList.remove('dragover'));
    uz.addEventListener('drop', e => { e.preventDefault(); uz.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });

    renderRows();
    renderSignedFiles();
    refreshIcons();
  }
  function renderTrainingDetail(id) {
    const form = getTrainingForm(id);
    if (!form) {
      document.getElementById('app').innerHTML = `<div class="empty-state"><div class="empty-state-icon">${ic('help-circle', 'icon-lg')}</div><div class="empty-state-title">找不到教育訓練填報單</div><a href="#training" class="btn btn-primary" style="margin-top:16px">返回列表</a></div>`;
      return;
    }
    if (!isTrainingVisible(form)) { navigate('training'); toast('您沒有權限檢視此填報單', 'error'); return; }

    const s = form.summary || computeTrainingSummary(form.records || []);
    const records = form.records || [];
    const detailRows = records.length ? records.map(r => `<tr><td>${esc(r.name)}</td><td><span class="training-source-tag ${r.source === 'import' ? 'import' : 'manual'}">${r.source === 'import' ? '管理者匯入' : '填報新增'}</span></td><td>${Number(r.hours || 0)}</td><td>${esc(r.note || '')}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無時數資料</div></div></td></tr>`;
    const files = form.signedFiles || [];
    const fileHtml = files.length ? `<div class="file-preview-list">${files.map(f => f.type && f.type.startsWith('image/') ? `<div class="file-preview-item"><img src="${f.data}" alt="${esc(f.name)}"><div class="file-name">${esc(f.name)}</div></div>` : `<div class="file-preview-item"><div class="file-pdf-icon">${ic('file-box')}</div><div class="file-name">${esc(f.name)}</div></div>`).join('')}</div>` : '<p style="color:var(--text-muted);font-size:.88rem">尚未上傳簽核掃描檔</p>';
    const timeline = (form.history || []).slice().reverse().map(h => `<div class="timeline-item"><div class="timeline-time">${fmtTime(h.time)}</div><div class="timeline-text">${esc(h.action)} · ${esc(h.user || '系統')}</div></div>`).join('') || '<div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無歷程紀錄</div></div>';

    const actions = [`<button type="button" class="btn btn-secondary" id="training-export-detail">${ic('download', 'icon-sm')} 匯出CSV</button>`, `<a href="#training" class="btn btn-secondary">← 返回列表</a>`];
    if (canEditTrainingForm(form)) actions.unshift(`<a href="#training-fill/${form.id}" class="btn btn-primary">${ic('edit-3', 'icon-sm')} 繼續填報</a>`);
    if (isAdmin() && form.status === TRAINING_STATUSES.SUBMITTED) actions.unshift(`<button type="button" class="btn btn-danger" onclick="window._trainingReturn('${form.id}')">${ic('corner-up-left', 'icon-sm')} 退回更正</button>`);

    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="detail-header"><div><div class="detail-id">${esc(form.id)} · ${esc(form.trainingYear)} 年度</div><h1 class="detail-title">教育訓練時數統計 — ${esc(form.unit)}</h1><div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">${ic('user', 'icon-xs')}</span>${esc(form.fillerName)}</span><span class="detail-meta-item"><span class="detail-meta-icon">${ic('calendar', 'icon-xs')}</span>${fmt(form.fillDate)}</span>${trainingStatusBadge(form.status)}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">${actions.join('')}</div></div>${form.status === TRAINING_STATUSES.RETURNED ? `<div class="training-return-banner">${ic('alert-triangle', 'icon-sm')} 退回原因：${esc(form.returnReason || '未提供')}</div>` : ''}<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px"><div class="card"><div class="card-header"><span class="card-title">統計摘要</span></div><div class="detail-grid"><div class="detail-field"><div class="detail-field-label">名單總人數</div><div class="detail-field-value">${s.totalPeople}</div></div><div class="detail-field"><div class="detail-field-label">已填時數人數</div><div class="detail-field-value">${s.filledPeople}</div></div><div class="detail-field"><div class="detail-field-label">總時數</div><div class="detail-field-value">${s.totalHours}</div></div><div class="detail-field"><div class="detail-field-label">達標率(>=3h)</div><div class="detail-field-value">${s.reachRate}%</div></div></div></div><div class="card"><div class="card-header"><span class="card-title">填報資訊</span></div><div class="detail-grid"><div class="detail-field"><div class="detail-field-label">單位</div><div class="detail-field-value">${esc(form.unit)}</div></div><div class="detail-field"><div class="detail-field-label">填報人</div><div class="detail-field-value">${esc(form.fillerName)}</div></div><div class="detail-field"><div class="detail-field-label">正式送出時間</div><div class="detail-field-value">${form.submittedAt ? fmtTime(form.submittedAt) : '—'}</div></div><div class="detail-field"><div class="detail-field-label">最後更新</div><div class="detail-field-value">${fmtTime(form.updatedAt)}</div></div></div></div></div><div class="card" style="margin-top:20px;padding:0;overflow:hidden"><div class="card-header" style="padding:16px 20px"><span class="card-title">人員時數明細</span></div><div class="table-wrapper"><table><thead><tr><th>姓名</th><th>來源</th><th>時數</th><th>備註</th></tr></thead><tbody>${detailRows}</tbody></table></div></div><div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">簽核掃描檔</span></div>${fileHtml}</div><div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">歷程紀錄</span></div><div class="timeline">${timeline}</div></div></div>`;

    document.getElementById('training-export-detail')?.addEventListener('click', () => window._trainingExportDetailCsv(form.id));
    refreshIcons();
  }

  function renderTrainingRoster() {
    if (!isAdmin()) { navigate('training'); toast('僅管理者可管理名單', 'error'); return; }

    const rosters = getAllTrainingRosters().slice().sort((a, b) => a.unit === b.unit ? a.name.localeCompare(b.name, 'zh-Hant') : a.unit.localeCompare(b.unit, 'zh-Hant'));
    const rows = rosters.length ? rosters.map(r => `<tr><td>${esc(r.unit)}</td><td>${esc(r.name)}</td><td>${r.source === 'import' ? '管理者匯入' : '填報新增'}</td><td>${esc(r.createdBy || '')}</td><td>${fmtTime(r.createdAt)}</td><td><button type="button" class="btn btn-sm btn-danger" onclick="window._trainingDeleteRoster('${r.id}')">${ic('trash-2', 'btn-icon-svg')}</button></td></tr>`).join('') : `<tr><td colspan="6"><div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無名單資料</div></div></td></tr>`;

    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">教育訓練名單管理</h1><p class="page-subtitle">管理者可依單位匯入與刪除人員；填報人僅可新增名單外人員</p></div><a href="#training" class="btn btn-secondary">← 返回統計</a></div><div class="card" style="max-width:960px;margin-bottom:20px"><form id="training-import-form"><div class="section-header">${ic('upload', 'icon-sm')} 匯入單位名單</div><div class="form-row"><div class="form-group"><label class="form-label form-required">單位</label>${buildUnitCascadeControl('training-import-unit', '', false, true)}</div><div class="form-group"><label class="form-label">說明</label><input type="text" class="form-input" value="每行一位人員，可混合逗號、分號分隔" readonly></div></div><div class="form-group"><label class="form-label form-required">人員名單</label><textarea class="form-textarea" id="training-import-names" rows="6" placeholder="王小明&#10;陳小華&#10;張小資" required></textarea></div><div class="form-actions"><button type="submit" class="btn btn-primary">${ic('upload', 'icon-sm')} 匯入名單</button></div></form></div><div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>單位</th><th>姓名</th><th>來源</th><th>建立者</th><th>建立時間</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;

    initUnitCascade('training-import-unit', '', { disabled: false });
    document.getElementById('training-import-form').addEventListener('submit', e => {
      e.preventDefault();
      const unit = document.getElementById('training-import-unit').value;
      const namesRaw = document.getElementById('training-import-names').value;
      const names = Array.from(new Set(namesRaw.split(/[\r\n,;]+/).map(x => x.trim()).filter(Boolean)));
      if (!names.length) { toast('請至少輸入一位人員', 'error'); return; }
      let added = 0, skipped = 0;
      names.forEach(name => { const ret = addTrainingRosterPerson(unit, name, 'import', currentUser().name); if (ret.added) added++; else skipped++; });
      toast(`匯入完成：新增 ${added} 人，略過 ${skipped} 人`);
      renderTrainingRoster();
    });

    refreshIcons();
  }

  function seedTrainingData() {
    const d = loadTrainingStore();
    if (d.rosters.length > 0) return;
    const now = new Date().toISOString();
    const seen = new Set();
    getUsers().filter(u => u.role !== ROLES.ADMIN).forEach(u => {
      const key = `${u.unit}::${u.name}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const id = `RST-${String(d.nextRosterId).padStart(4, '0')}`;
      d.nextRosterId++;
      d.rosters.push({ id, unit: u.unit, name: u.name, source: 'import', createdBy: '系統初始化', createdAt: now });
    });
    saveTrainingStore(d);
  }
  // ─── Router ────────────────────────────────
  function handleRoute() {
    if (!currentUser()) { renderLogin(); return; } const r = getRoute(); renderSidebar(); renderHeader(); closeSidebar();
    switch (r.page) { case 'dashboard': renderDashboard(); break; case 'list': renderList(); break; case 'create': renderCreate(); break; case 'detail': renderDetail(r.param); break; case 'respond': renderRespond(r.param); break; case 'tracking': renderTracking(r.param); break; case 'users': renderUsers(); break; case 'login-log': renderLoginLog(); break; case 'checklist': renderChecklistList(); break; case 'checklist-fill': renderChecklistFill(r.param); break; case 'checklist-detail': renderChecklistDetail(r.param); break; case 'checklist-manage': renderChecklistManage(); break; case 'training': renderTraining(); break; case 'training-fill': renderTrainingFill(r.param); break; case 'training-detail': renderTrainingDetail(r.param); break; case 'training-roster': renderTrainingRoster(); break; default: renderDashboard(); }
  }

  // ─── Seed Data ─────────────────────────────
  function seedData() {
    const d = loadData();
    if (d.items.length > 0 && d.items[0].title && !d.items[0].problemDesc) { d.items = []; d.nextId = 1; saveData(d); }
    if (d.items.length > 0) return;
    if (!d.users || d.users.length === 0) d.users = DEFAULT_USERS.map(u => ({ ...u }));
    const now = new Date(), ago = n => new Date(now - n * 864e5).toISOString(), fut = n => new Date(now.getTime() + n * 864e5).toISOString().split('T')[0], past = n => new Date(now - n * 864e5).toISOString().split('T')[0];
    d.items = [
      { id: 'CAR-0001', proposerUnit: '稽核室', proposerName: '張稽核員', proposerDate: past(25), handlerUnit: '計算機及資訊網路中心／資訊網路組', handlerName: '李工程師', handlerDate: past(24), deficiencyType: '主要缺失', source: '內部稽核', category: ['硬體', '基礎設施'], clause: 'A.11.2.2', problemDesc: '伺服器機房溫度超過 28°C 標準值，最高達 32°C。', occurrence: '例行巡檢時發現 A 區機房溫控設備失效，導致持續高溫 3 天。', correctiveAction: '已更換溫控感測器並校正空調系統。', correctiveDueDate: past(10), rootCause: '溫控感測器服役超過 5 年，精度下降且未按時校正。', rootElimination: '建立每季校正計畫，設定感測器更換週期為 3 年。', rootElimDueDate: past(8), riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null, reviewResult: '同意', reviewer: '王經理', reviewDate: past(5), trackings: [], status: STATUSES.CLOSED, createdAt: ago(25), updatedAt: ago(5), closedDate: ago(5), evidence: [], history: [{ time: ago(25), action: '開立矯正單', user: '張稽核員' }, { time: ago(25), action: '狀態變更為「待矯正」', user: '系統' }, { time: ago(18), action: '李工程師 提交矯正措施提案', user: '李工程師' }, { time: ago(18), action: '狀態變更為「已提案」', user: '系統' }, { time: ago(8), action: '狀態變更為「審核中」', user: '王經理' }, { time: ago(5), action: '狀態變更為「結案」', user: '王經理' }] },
      { id: 'CAR-0002', proposerUnit: '稽核室', proposerName: '張稽核員', proposerDate: past(10), handlerUnit: '計算機及資訊網路中心／資訊網路組', handlerName: '陳資安主管', handlerDate: past(9), deficiencyType: '次要缺失', source: '內部稽核', category: ['人員', '資訊'], clause: 'A.9.2.6', problemDesc: '3 名離職員工帳號仍為啟用狀態，未即時停用。', occurrence: '內部稽核時檢查帳號權限管理，發現 3 筆離職超過 1 個月的帳號仍可登入系統。', correctiveAction: '已停用所有離職員工帳號並清查全公司帳號。', correctiveDueDate: fut(5), rootCause: 'HR 離職通知流程未納入 IT 帳號停用程序。', rootElimination: '修訂離職檢核表，新增 IT 帳號停用確認欄位。', rootElimDueDate: fut(3), riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null, reviewResult: '', reviewer: '', reviewDate: null, trackings: [], status: STATUSES.PROPOSED, createdAt: ago(10), updatedAt: ago(3), closedDate: null, evidence: [], history: [{ time: ago(10), action: '開立矯正單', user: '張稽核員' }, { time: ago(10), action: '狀態變更為「待矯正」', user: '系統' }, { time: ago(3), action: '陳資安主管 提交矯正措施提案', user: '陳資安主管' }, { time: ago(3), action: '狀態變更為「已提案」', user: '系統' }] },
      { id: 'CAR-0003', proposerUnit: '計算機及資訊網路中心／資訊網路組', proposerName: '王經理', proposerDate: past(5), handlerUnit: '總務處／營繕組', handlerName: '黃工程師', handlerDate: null, deficiencyType: '主要缺失', source: '資安事故', category: ['軟體', '服務'], clause: 'A.12.3.1', problemDesc: '每日備份排程連續 3 天未執行，存在資料遺失風險。', occurrence: '監控系統發出告警，確認 CronJob 因磁碟空間不足而中斷執行。', correctiveAction: '', correctiveDueDate: fut(3), rootCause: '', rootElimination: '', rootElimDueDate: null, riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null, reviewResult: '', reviewer: '', reviewDate: null, trackings: [], status: STATUSES.PENDING, createdAt: ago(5), updatedAt: ago(5), closedDate: null, evidence: [], history: [{ time: ago(5), action: '開立矯正單', user: '王經理' }, { time: ago(5), action: '狀態變更為「待矯正」', user: '系統' }] },
      { id: 'CAR-0004', proposerUnit: '計算機及資訊網路中心／資訊網路組', proposerName: '王經理', proposerDate: past(14), handlerUnit: '人事室／綜合業務組', handlerName: '劉文管人員', handlerDate: past(13), deficiencyType: '次要缺失', source: '外部稽核', category: ['資訊'], clause: 'A.7.5.3', problemDesc: '3 份程序書紙本與電子版本不一致。', occurrence: '外部稽核時發現文管系統的版本控制未正確同步。', correctiveAction: '已回收舊版並重新分發正確版本。', correctiveDueDate: fut(1), rootCause: '文管系統未自動通知換版，且無版本確認機制。', rootElimination: '導入自動版次通知功能，新增版本確認簽收流程。', rootElimDueDate: fut(1), riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null, reviewResult: '', reviewer: '', reviewDate: null, trackings: [{ tracker: '張稽核員', trackDate: past(5), execution: '已完成舊版回收，新版已分發至各單位。', trackNote: '電子版已同步更新，需確認紙本是否全部替換。', result: '持續追蹤', nextTrackDate: fut(7), reviewer: '張稽核員', reviewDate: past(5) }], status: STATUSES.TRACKING, createdAt: ago(14), updatedAt: ago(5), closedDate: null, evidence: [], history: [{ time: ago(14), action: '開立矯正單', user: '王經理' }, { time: ago(14), action: '狀態變更為「待矯正」', user: '系統' }, { time: ago(10), action: '劉文管人員 提交矯正措施提案', user: '劉文管人員' }, { time: ago(10), action: '狀態變更為「已提案」', user: '系統' }, { time: ago(7), action: '狀態變更為「審核中」', user: '張稽核員' }, { time: ago(5), action: '狀態變更為「追蹤中」', user: '張稽核員' }, { time: ago(5), action: '第 1 次追蹤 — 持續追蹤', user: '張稽核員' }] }
    ];
    d.nextId = 5; saveData(d);
  }

  // ─── Init ──────────────────────────────────
  seedData();
  seedTrainingData();
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('resize', function () { if (!isMobileViewport()) closeSidebar(); });
  window.addEventListener('load', refreshIcons);
  renderApp();
  refreshIcons();

})();

