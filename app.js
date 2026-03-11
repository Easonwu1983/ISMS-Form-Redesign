// =============================================
// ISMS Internal Audit Tracking System - v4
// =============================================
(function () {
  'use strict';
  if (typeof window !== 'undefined') {
    window.__APP_READY__ = false;
  }
  const DATA_KEY = 'cats_data', AUTH_KEY = 'cats_auth', CHECKLIST_KEY = 'cats_checklists', TEMPLATE_KEY = 'cats_checklist_template', TRAINING_KEY = 'cats_training_hours', LOGIN_LOG_KEY = 'cats_login_log', UNIT_REVIEW_KEY = 'cats_unit_review';
  const STATUSES = { CREATED: '開立', PENDING: '待矯正', PROPOSED: '已提案', REVIEWING: '審核中', TRACKING: '追蹤中', CLOSED: '結案' };
  const STATUS_CLASSES = { [STATUSES.CREATED]: 'created', [STATUSES.PENDING]: 'pending', [STATUSES.PROPOSED]: 'proposed', [STATUSES.REVIEWING]: 'reviewing', [STATUSES.TRACKING]: 'tracking', [STATUSES.CLOSED]: 'closed' };
  const STATUS_FLOW = [STATUSES.CREATED, STATUSES.PENDING, STATUSES.PROPOSED, STATUSES.REVIEWING, STATUSES.TRACKING, STATUSES.CLOSED];
  const ROLES = { ADMIN: '最高管理員', UNIT_ADMIN: '單位管理員', REPORTER: '填報人', VIEWER: '跨單位檢視者' };
  const ROLE_BADGE = { [ROLES.ADMIN]: 'badge-admin', [ROLES.UNIT_ADMIN]: 'badge-unit-admin', [ROLES.REPORTER]: 'badge-reporter', [ROLES.VIEWER]: 'badge-viewer' };
  const CHECKLIST_STATUS_DRAFT = '\u8349\u7a3f';
  const CHECKLIST_STATUS_SUBMITTED = '\u5df2\u9001\u51fa';
  const TRAINING_STATUSES = { DRAFT: '暫存', PENDING_SIGNOFF: '待簽核', SUBMITTED: '已完成填報', RETURNED: '退回更正' };
  const TRAINING_EMPLOYEE_STATUS = ['在職', '離職', '退休', '留職停薪', '單位調職'];
  const TRAINING_BOOLEAN_OPTIONS = ['是', '否', '無須', '不適用'];
  const TRAINING_BOOLEAN_SELECT_OPTIONS = ['是', '否'];
  const TRAINING_GENERAL_LABEL = '資安通識（1年3小時）';
  const TRAINING_INFO_STAFF_LABEL = '資訊人員(含承辦委外資通系統)';
  const TRAINING_PROFESSIONAL_LABEL = '資安專業課程（1年3小時）';
  const TRAINING_UNDO_WINDOW_MINUTES = 30;
  const DEF_TYPES = ['主要缺失', '次要缺失', '觀察', '建議'];
  const SOURCES = ['內部稽核', '外部稽核', '教育部稽核', '資安事故', '系統變更', '使用者抱怨', '其他'];
  const CATEGORIES = ['人員', '資訊', '通訊', '軟體', '硬體', '個資', '服務', '虛擬機', '基礎設施', '可攜式設備', '其他'];
  const DEFAULT_USERS = [
    { username: 'admin', password: 'admin123', name: '計算機及資訊網路中心', role: ROLES.ADMIN, unit: '計算機及資訊網路中心／資訊網路組', units: ['計算機及資訊網路中心／資訊網路組'], email: 'admin@company.com' },
    { username: 'unit1', password: 'unit123', name: '王經理', role: ROLES.UNIT_ADMIN, unit: '計算機及資訊網路中心／資訊網路組', units: ['計算機及資訊網路中心／資訊網路組'], email: 'wang@company.com' },
    { username: 'unit2', password: 'unit123', name: '張稽核員', role: ROLES.UNIT_ADMIN, unit: '稽核室', units: ['稽核室'], email: 'zhang@company.com' },
    { username: 'user1', password: 'user123', name: '李工程師', role: ROLES.REPORTER, unit: '計算機及資訊網路中心／資訊網路組', units: ['計算機及資訊網路中心／資訊網路組'], email: 'li@company.com' },
    { username: 'user2', password: 'user123', name: '陳資安主管', role: ROLES.REPORTER, unit: '計算機及資訊網路中心／資訊網路組', units: ['計算機及資訊網路中心／資訊網路組', '總務處／營繕組'], activeUnit: '計算機及資訊網路中心／資訊網路組', email: 'chen@company.com' },
    { username: 'user3', password: 'user123', name: '黃工程師', role: ROLES.REPORTER, unit: '總務處／營繕組', units: ['總務處／營繕組'], email: 'huang@company.com' },
    { username: 'user4', password: 'user123', name: '劉文管人員', role: ROLES.REPORTER, unit: '人事室／綜合業務組', units: ['人事室／綜合業務組'], email: 'liu@company.com' },
    { username: 'viewer1', password: 'viewer123', name: '跨單位檢視者', role: ROLES.VIEWER, unit: '', units: [], email: 'viewer@company.com' },
  ];

  const UNIT_CUSTOM_VALUE = '__unit_custom__';
  const UNIT_CUSTOM_LABEL = '其他（手動輸入）';
  const UNIT_ADMIN_PRIMARY_WHITELIST = new Set([
    '秘書室',
    '教務處',
    '學生事務處',
    '總務處',
    '研究發展處',
    '國際事務處',
    '財務管理處',
    '圖書館',
    '主計室',
    '人事室',
    '計算機及資訊網路中心',
    '出版中心',
    '環境保護暨職業安全衛生中心',
    '研究誠信辦公室',
    '法務處'
  ]);
  const UNIT_ACADEMIC_PRIMARY_WHITELIST = new Set([
    '共同教育中心',
    '進修推廣學院'
  ]);

  function getOfficialUnits() {
    try {
      if (typeof window !== 'undefined' && typeof window.getOfficialUnitList_ === 'function') {
        const units = window.getOfficialUnitList_();
        if (Array.isArray(units)) return units;
      }
    } catch (_) { }
    return [];
  }

  function getOfficialUnitCatalog() {
    try {
      if (typeof window !== 'undefined' && typeof window.getOfficialUnitCatalog_ === 'function') {
        const catalog = window.getOfficialUnitCatalog_();
        if (Array.isArray(catalog)) return catalog;
      }
    } catch (_) { }
    return [];
  }

  function getOfficialUnitMeta(unitValue) {
    const value = String(unitValue || '').trim();
    if (!value) return null;
    try {
      if (typeof window !== 'undefined' && typeof window.getOfficialUnitMeta_ === 'function') {
        const meta = window.getOfficialUnitMeta_(value);
        if (meta && typeof meta === 'object') return meta;
      }
    } catch (_) { }
    return getOfficialUnitCatalog().find((entry) => entry && entry.value === value) || null;
  }

  function getUnitCode(unitValue) {
    return String(getOfficialUnitMeta(unitValue)?.normalizedCode || '').trim();
  }

  function getUnitCodeWithDots(unitValue) {
    return String(getOfficialUnitMeta(unitValue)?.code || '').trim();
  }

  function getUnitOptionLabel(unitValue, fallbackText) {
    const meta = getOfficialUnitMeta(unitValue);
    if (meta && meta.name) return meta.name;
    return String(fallbackText || unitValue || '').trim();
  }

  function getCorrectionYear(dateValue) {
    const raw = String(dateValue || '').trim();
    const date = raw ? new Date(raw) : new Date();
    if (!Number.isFinite(date.getTime())) return String(new Date().getFullYear() - 1911).padStart(3, '0');
    return String(date.getFullYear() - 1911).padStart(3, '0');
  }

  function normalizeRocYear(value, fallbackDateValue) {
    const raw = String(value || '').trim();
    if (/^\d{4}$/.test(raw) && Number(raw) > 1911) return String(Number(raw) - 1911).padStart(3, '0');
    if (/^\d{1,3}$/.test(raw)) return String(Number(raw)).padStart(3, '0');
    return getCorrectionYear(fallbackDateValue);
  }

  function buildScopedRecordPrefix(prefix, unitValue, yearValue, fallbackDateValue) {
    const unitCode = getUnitCode(unitValue);
    const year = normalizeRocYear(yearValue, fallbackDateValue);
    return unitCode ? `${String(prefix || '').trim().toUpperCase()}-${year}-${unitCode}` : '';
  }

  function parseScopedRecordId(value, prefix) {
    const target = String(prefix || '').trim().toUpperCase();
    const pattern = target ? `^(${target}-\\d{3}-[A-Z0-9]+)-(\\d+)$` : '^([A-Z]{3}-\\d{3}-[A-Z0-9]+)-(\\d+)$';
    const match = String(value || '').trim().toUpperCase().match(new RegExp(pattern));
    if (!match) return null;
    return {
      documentNo: match[1],
      sequence: Number(match[2]),
      sequenceText: match[2]
    };
  }

  function buildScopedRecordId(documentNo, sequence) {
    if (!documentNo || !Number.isFinite(Number(sequence))) return '';
    return `${documentNo}-${String(Number(sequence))}`;
  }

  function getNextScopedRecordSequence(documentNo, items, parser) {
    let max = 0;
    const parse = typeof parser === 'function' ? parser : ((value) => parseScopedRecordId(value));
    (Array.isArray(items) ? items : []).forEach((item) => {
      const parsed = parse(item?.id);
      if (parsed && parsed.documentNo === documentNo) {
        max = Math.max(max, parsed.sequence);
      }
    });
    return max + 1;
  }

  function buildCorrectionDocumentNo(unitValue, dateValue) {
    return buildScopedRecordPrefix('CAR', unitValue, '', dateValue);
  }

  function parseCorrectionAutoId(value) {
    const match = String(value || '').trim().toUpperCase().match(/^(CAR-\d{3}-[A-Z0-9]+)-(\d+)$/);
    if (!match) return null;
    return {
      documentNo: match[1],
      sequence: Number(match[2]),
      sequenceText: match[2]
    };
  }

  function buildAutoCarIdByDocument(documentNo, sequence) {
    return buildScopedRecordId(documentNo, sequence);
  }

  function buildAutoCarId(unitValue, sequence, dateValue) {
    return buildAutoCarIdByDocument(buildCorrectionDocumentNo(unitValue, dateValue), sequence);
  }

  function getNextCorrectionSequence(documentNo, items) {
    let max = getNextScopedRecordSequence(documentNo, items, parseCorrectionAutoId) - 1;
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item?.documentNo === documentNo && Number.isFinite(Number(item.caseSeq))) {
        max = Math.max(max, Number(item.caseSeq));
      }
    });
    return max + 1;
  }

  function getSystemUnits() {
    const set = new Set(getOfficialUnits());
    try {
      const data = loadData();
      (data.users || []).forEach((u) => { getAuthorizedUnits(u).forEach((unit) => set.add(String(unit))); });
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

  function getOfficialUnitSet() {
    return new Set(getOfficialUnits());
  }

  function isOfficialUnit(unit) {
    const value = String(unit || '').trim();
    if (!value) return true;
    return getOfficialUnitSet().has(value);
  }

  function loadUnitReviewStore() { return getDataModule().loadUnitReviewStore(); }
  function saveUnitReviewStore(store) { return getDataModule().saveUnitReviewStore(store); }

  function formatUnitScopeSummary(scopes) {
    const defs = [
      ['users', '帳號'],
      ['items', '矯正單'],
      ['checklists', '檢核表'],
      ['trainingForms', '訓練填報'],
      ['trainingRosters', '名單']
    ];
    const parts = defs.filter(([key]) => scopes[key] > 0).map(([key, label]) => `${label} ${scopes[key]}`);
    return parts.join('、') || '尚未使用';
  }

  function approveCustomUnit(unit, actor) {
    const value = String(unit || '').trim();
    if (!value) return false;

    const now = new Date().toISOString();
    const store = loadUnitReviewStore();
    const existing = store.approvedUnits.find((entry) => entry.unit === value);
    if (existing) {
      existing.approvedAt = now;
      existing.approvedBy = actor || '';
    } else {
      store.approvedUnits.push({ unit: value, approvedAt: now, approvedBy: actor || '' });
    }
    store.history.unshift({ type: 'approved', unit: value, targetUnit: '', actor: actor || '', time: now });
    store.history = store.history.slice(0, 40);
    saveUnitReviewStore(store);
    return true;
  }

  function removeCustomUnitApproval(unit) {
    const value = String(unit || '').trim();
    if (!value) return;
    const store = loadUnitReviewStore();
    store.approvedUnits = store.approvedUnits.filter((entry) => entry.unit !== value);
    saveUnitReviewStore(store);
  }

  function createUnitReferenceEntry(unit) {
    return {
      unit,
      count: 0,
      scopes: { users: 0, items: 0, checklists: 0, trainingForms: 0, trainingRosters: 0 },
      references: []
    };
  }

  function pushUnitReference(map, unit, scope, label) {
    const value = String(unit || '').trim();
    if (!value) return;

    let entry = map.get(value);
    if (!entry) {
      entry = createUnitReferenceEntry(value);
      map.set(value, entry);
    }

    entry.count += 1;
    entry.scopes[scope] += 1;
    if (entry.references.length < 24) entry.references.push(label);
  }

  function collectUnitReferences() {
    const map = new Map();
    const data = loadData();
    const checklistStore = loadChecklists();
    const trainingStore = loadTrainingStore();

    (data.users || []).forEach((user) => {
      getAuthorizedUnits(user).forEach((unit) => {
        pushUnitReference(map, unit, 'users', `帳號 ${user.username} · ${user.name}`);
      });
    });

    (data.items || []).forEach((item) => {
      pushUnitReference(map, item.proposerUnit, 'items', `矯正單 ${item.id}（提出單位）`);
      pushUnitReference(map, item.handlerUnit, 'items', `矯正單 ${item.id}（處理單位）`);
    });

    (checklistStore.items || []).forEach((item) => {
      pushUnitReference(map, item.unit, 'checklists', `檢核表 ${item.id} · ${item.fillerName || '未填報'}`);
    });

    (trainingStore.forms || []).forEach((form) => {
      pushUnitReference(map, form.unit, 'trainingForms', `教育訓練 ${form.id} · ${form.fillerName || '未填報'}`);
    });

    (trainingStore.rosters || []).forEach((row) => {
      pushUnitReference(map, row.unit, 'trainingRosters', `教育訓練名單 · ${row.name}`);
    });

    return Array.from(map.values());
  }

  function getCustomUnitRegistry() {
    const store = loadUnitReviewStore();
    const approvedMap = new Map(store.approvedUnits.map((entry) => [entry.unit, entry]));
    return collectUnitReferences()
      .filter((entry) => !isOfficialUnit(entry.unit))
      .map((entry) => ({
        ...entry,
        approval: approvedMap.get(entry.unit) || null,
        status: approvedMap.has(entry.unit) ? 'approved' : 'pending'
      }))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        if (b.count !== a.count) return b.count - a.count;
        return a.unit.localeCompare(b.unit, 'zh-Hant');
      });
  }

  function syncSessionUnit(sourceUnit, targetUnit) {
    try {
      const raw = sessionStorage.getItem(AUTH_KEY);
      if (!raw) return;
      const auth = JSON.parse(raw);
      if (!auth || auth.unit !== sourceUnit) return;
      auth.unit = targetUnit;
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    } catch (_) { }
  }

  function mergeCustomUnit(sourceUnit, targetUnit, actor) {
    const source = String(sourceUnit || '').trim();
    const target = String(targetUnit || '').trim();
    if (!source || !target || source === target) return null;

    const now = new Date().toISOString();
    const summary = { users: 0, items: 0, checklists: 0, trainingForms: 0, trainingRosters: 0 };

    const data = loadData();
    let dataChanged = false;
    (data.users || []).forEach((user) => {
      const units = getAuthorizedUnits(user);
      if (units.includes(source)) {
        user.units = units.map((unit) => unit === source ? target : unit);
        user.unit = user.units[0] || '';
        if (user.activeUnit === source) user.activeUnit = target;
        summary.users += 1;
        dataChanged = true;
      }
    });
    (data.items || []).forEach((item) => {
      let changed = false;
      if (item.proposerUnit === source) {
        item.proposerUnit = target;
        changed = true;
      }
      if (item.handlerUnit === source) {
        item.handlerUnit = target;
        changed = true;
      }
      if (changed) {
        item.updatedAt = now;
        summary.items += 1;
        dataChanged = true;
      }
    });
    if (dataChanged) saveData(data);

    const checklistStore = loadChecklists();
    let checklistChanged = false;
    (checklistStore.items || []).forEach((item) => {
      if (item.unit === source) {
        item.unit = target;
        item.updatedAt = now;
        summary.checklists += 1;
        checklistChanged = true;
      }
    });
    if (checklistChanged) saveChecklists(checklistStore);

    const trainingStore = loadTrainingStore();
    let trainingChanged = false;
    (trainingStore.forms || []).forEach((form) => {
      if (form.unit === source) {
        form.unit = target;
        form.updatedAt = now;
        summary.trainingForms += 1;
        trainingChanged = true;
      }
    });
    (trainingStore.rosters || []).forEach((row) => {
      if (row.unit === source) {
        row.unit = target;
        summary.trainingRosters += 1;
        trainingChanged = true;
      }
    });
    if (trainingChanged) saveTrainingStore(trainingStore);

    syncSessionUnit(source, target);

    const store = loadUnitReviewStore();
    store.approvedUnits = store.approvedUnits.filter((entry) => entry.unit !== source);
    if (!isOfficialUnit(target) && !store.approvedUnits.some((entry) => entry.unit === target)) {
      store.approvedUnits.push({ unit: target, approvedAt: now, approvedBy: actor || '' });
    }
    store.history.unshift({
      type: 'merged',
      unit: source,
      targetUnit: target,
      actor: actor || '',
      time: now,
      summary
    });
    store.history = store.history.slice(0, 40);
    saveUnitReviewStore(store);

    return { ...summary, total: summary.users + summary.items + summary.checklists + summary.trainingForms + summary.trainingRosters };
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

  function getApprovedCustomUnits() {
    const store = loadUnitReviewStore();
    return (store.approvedUnits || [])
      .map((entry) => String(entry && entry.unit || '').trim())
      .filter(Boolean);
  }

  function getSelectableUnitStructure() {
    const base = getUnitStructureSafe();
    const merged = {};

    Object.keys(base).forEach((parent) => {
      merged[parent] = Array.isArray(base[parent]) ? [...base[parent]] : [];
    });

    getApprovedCustomUnits().forEach((unit) => {
      const parsed = splitUnitValue(unit);
      if (!parsed.parent) return;
      if (!merged[parsed.parent]) merged[parsed.parent] = [];
      if (parsed.child && !merged[parsed.parent].includes(parsed.child)) {
        merged[parsed.parent].push(parsed.child);
      }
    });

    Object.keys(merged).forEach((parent) => {
      merged[parent] = merged[parent]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    });

    return merged;
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

  function getTopLevelUnitOfficialMeta(unitValue) {
    const parsed = splitUnitValue(unitValue);
    const parent = String(parsed.parent || unitValue || '').trim();
    if (!parent) return null;
    return getOfficialUnitMeta(parent) || getOfficialUnitMeta(unitValue) || null;
  }

  function categorizeTopLevelUnit(unitValue) {
    const unit = String(splitUnitValue(unitValue).parent || unitValue || '').trim();
    if (!unit) return '行政單位';
    if (UNIT_ADMIN_PRIMARY_WHITELIST.has(unit)) return '行政單位';
    if (UNIT_ACADEMIC_PRIMARY_WHITELIST.has(unit)) return '學術單位';
    const meta = getTopLevelUnitOfficialMeta(unit) || {};
    const code = String(meta.topCode || meta.code || '').trim().toUpperCase();
    const academicKeywords = ['學院', '共同教育中心', '國際學院', '研究學院', '創新設計學院', '進修推廣學院', '附設醫院'];
    if (academicKeywords.some((keyword) => unit.includes(keyword))) return '學術單位';
    if (unit.includes('研究中心') || unit.includes('研究院')) return '研究中心';
    if (/^0\.\d{2}$/.test(code)) {
      const numeric = Number(code.slice(2));
      if (numeric >= 51) return '學術單位';
      if (unit.includes('中心') || unit.includes('委員會') || unit.includes('辦公室') || unit.includes('研究室') || unit.includes('籌備處') || unit.includes('博物館群')) {
        return '研究中心';
      }
      return '行政單位';
    }
    if (/^0\.[A-Z0-9]{2}$/.test(code)) return '研究中心';
    if (unit.includes('中心') || unit.includes('委員會') || unit.includes('辦公室') || unit.includes('研究室') || unit.includes('籌備處') || unit.includes('博物館群')) {
      return '研究中心';
    }
    return '行政單位';
  }

  function getTrainingUnitCategories() {
    return ['行政單位', '學術單位', '研究中心'];
  }

  function getParentsByUnitCategory(parents, category) {
    const targetCategory = String(category || '').trim();
    if (!targetCategory) return [];
    return (Array.isArray(parents) ? parents : []).filter((parent) => categorizeTopLevelUnit(parent) === targetCategory);
  }

  function normalizeUnitSearchText(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s\u3000]+/g, '')
      .replace(/[／/]/g, '')
      .replace(/[()（）．.、,，:：;；\-_'"]/g, '');
  }

  function buildUnitSearchEntry(unitValue) {
    const value = String(unitValue || '').trim();
    if (!value) return null;
    const meta = getOfficialUnitMeta(value) || {};
    const parsed = splitUnitValue(value);
    const parent = parsed.parent || value;
    const child = parsed.child || '';
    const label = child || String(meta.name || parent).trim() || value;
    const fullLabel = child ? `${parent}／${child}` : parent;
    const category = categorizeTopLevelUnit(parent);
    const code = String(meta.code || '').trim();
    const normalizedCode = String(meta.normalizedCode || getUnitCode(value) || '').trim();
    const keywords = [
      value,
      fullLabel,
      label,
      meta.name,
      meta.fullName,
      parent,
      child,
      code,
      normalizedCode,
      category
    ].filter(Boolean).join(' ');
    return {
      value,
      parent,
      child,
      category,
      label,
      fullLabel,
      code,
      normalizedCode,
      searchText: normalizeUnitSearchText(keywords)
    };
  }

  function getUnitSearchEntries(extraValues) {
    const catalog = getOfficialUnitCatalog();
    const seen = new Set();
    const values = [];
    (Array.isArray(catalog) ? catalog : []).forEach((entry) => {
      const value = String(entry && entry.value || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      values.push(value);
    });
    getApprovedCustomUnits().forEach((value) => {
      const safeValue = String(value || '').trim();
      if (!safeValue || seen.has(safeValue)) return;
      seen.add(safeValue);
      values.push(safeValue);
    });
    (Array.isArray(extraValues) ? extraValues : []).forEach((value) => {
      const safeValue = String(value || '').trim();
      if (!safeValue || seen.has(safeValue)) return;
      seen.add(safeValue);
      values.push(safeValue);
    });
    return values
      .map((value) => buildUnitSearchEntry(value))
      .filter(Boolean)
      .sort((a, b) => a.fullLabel.localeCompare(b.fullLabel, 'zh-Hant'));
  }

  function buildUnitCascadeControl(baseId, selectedUnit, disabled, required) {
    const dis = disabled ? 'disabled' : '';
    const req = required ? 'required' : '';
    return `<div class="unit-cascade">
      <div class="unit-cascade-search">
        <input type="search" class="form-input unit-cascade-search-input" id="${baseId}-search" data-testid="${baseId}-search" placeholder="可搜尋單位名稱或代碼" autocomplete="off" ${dis}>
        <div class="unit-cascade-search-results" id="${baseId}-search-results" hidden></div>
        <div class="form-hint unit-cascade-search-hint">可直接輸入單位名稱或代碼，系統會自動帶入類別與層級。</div>
      </div>
      <div class="unit-cascade-grid unit-cascade-grid--training" id="${baseId}-grid">
        <div class="unit-cascade-segment">
          <select class="form-select" id="${baseId}-category" data-testid="${baseId}-category" ${dis} ${req}></select>
        </div>
        <div class="unit-cascade-segment">
          <select class="form-select" id="${baseId}-parent" data-testid="${baseId}-parent" ${dis} ${req}></select>
        </div>
        <div class="unit-cascade-child-wrap" id="${baseId}-child-wrap">
          <select class="form-select" id="${baseId}-child" data-testid="${baseId}-child" ${dis}></select>
        </div>
      </div>
      <div class="unit-cascade-custom" id="${baseId}-custom-wrap" style="display:none;margin-top:8px">
        <input type="text" class="form-input" id="${baseId}-custom" data-testid="${baseId}-custom" placeholder="\u8acb\u8f38\u5165\u81ea\u8a02\u55ae\u4f4d\u540d\u7a31" ${dis}>
      </div>
      <input type="hidden" id="${baseId}" data-testid="${baseId}" value="${esc(selectedUnit || '')}" />
    </div>`;
  }

  function initUnitCascade(baseId, initialValue, options) {
    const opts = options || {};
    const searchEl = document.getElementById(`${baseId}-search`);
    const searchResultsEl = document.getElementById(`${baseId}-search-results`);
    const categoryEl = document.getElementById(`${baseId}-category`);
    const parentEl = document.getElementById(`${baseId}-parent`);
    const childEl = document.getElementById(`${baseId}-child`);
    const childWrap = document.getElementById(`${baseId}-child-wrap`);
    const hiddenEl = document.getElementById(baseId);
    const customWrap = document.getElementById(`${baseId}-custom-wrap`);
    const customEl = document.getElementById(`${baseId}-custom`);
    if (!categoryEl || !parentEl || !childEl || !hiddenEl) return;

    const allowCustom = isAdmin() && !opts.disabled && !!customWrap && !!customEl;
    const structure = getSelectableUnitStructure();
    const rawInitial = String(initialValue || hiddenEl.value || '').trim();
    const searchEntries = getUnitSearchEntries(rawInitial ? [rawInitial] : []);
    const parsed = splitUnitValue(rawInitial);
    const knownParents = new Set(Object.keys(structure || {}));
    const isInitialCustom = allowCustom && !!rawInitial && !!parsed.parent && !knownParents.has(parsed.parent);

    const parentSet = new Set(knownParents);
    if (parsed.parent && !isInitialCustom) parentSet.add(parsed.parent);
    const parents = Array.from(parentSet).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const initialCategory = parsed.parent ? categorizeTopLevelUnit(parsed.parent) : '';

    categoryEl.innerHTML =
      '<option value="">選單位類別</option>' +
      getTrainingUnitCategories().map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');

    const setCustomMode = (enabled) => {
      if (!customWrap || !customEl) return;
      customWrap.style.display = enabled ? 'block' : 'none';
      customEl.required = !!enabled;
    };

    const hideSearchResults = () => {
      if (!searchResultsEl) return;
      searchResultsEl.hidden = true;
      searchResultsEl.innerHTML = '';
    };

    const syncSearchInput = () => {
      if (!searchEl) return;
      if (allowCustom && String(parentEl.value || '').trim() === UNIT_CUSTOM_VALUE) {
        searchEl.value = String(customEl?.value || '').trim();
        return;
      }
      const currentValue = String(hiddenEl.value || '').trim();
      if (!currentValue) {
        searchEl.value = '';
        return;
      }
      const entry = searchEntries.find((item) => item.value === currentValue) || buildUnitSearchEntry(currentValue);
      searchEl.value = entry ? entry.fullLabel : currentValue;
    };

    const applySelectedUnit = (unitValue) => {
      const targetValue = String(unitValue || '').trim();
      const target = splitUnitValue(targetValue);
      const targetCategory = target.parent ? categorizeTopLevelUnit(target.parent) : '';
      if (targetCategory) categoryEl.value = targetCategory;
      renderParents(categoryEl.value, target.parent);
      parentEl.value = target.parent;
      renderChildren(target.parent, target.child);
      if (!childEl.disabled) childEl.value = target.child || '';
      syncHidden(true);
      syncSearchInput();
      hideSearchResults();
    };

    const renderSearchResults = (query) => {
      if (!searchEl || !searchResultsEl) return;
      const text = String(query || '').trim();
      if (!text) {
        hideSearchResults();
        return;
      }
      const tokens = text.split(/\s+/).map((part) => normalizeUnitSearchText(part)).filter(Boolean);
      const matches = searchEntries
        .filter((entry) => tokens.every((token) => entry.searchText.includes(token)))
        .slice(0, 8);
      if (!matches.length) {
        searchResultsEl.hidden = false;
        searchResultsEl.innerHTML = '<div class="unit-cascade-search-empty">找不到符合的單位，仍可改用下方層級選擇。</div>';
        return;
      }
      searchResultsEl.hidden = false;
      searchResultsEl.innerHTML = matches.map((entry) => {
        const meta = [entry.category, entry.code ? ('代碼 ' + entry.code) : '', entry.child ? entry.parent : ''].filter(Boolean).join(' · ');
        return '<button type="button" class="unit-cascade-search-option" data-unit-value="' + esc(entry.value) + '"><span class="unit-cascade-search-option-title">' + esc(entry.fullLabel) + '</span><span class="unit-cascade-search-option-meta">' + esc(meta) + '</span></button>';
      }).join('');
      searchResultsEl.querySelectorAll('[data-unit-value]').forEach((button) => {
        button.addEventListener('click', () => applySelectedUnit(button.dataset.unitValue));
      });
    };

    const syncHidden = (dispatchChange) => {
      const parent = String(parentEl.value || '').trim();

      if (allowCustom && parent === UNIT_CUSTOM_VALUE) {
        setCustomMode(true);
        customEl.placeholder = '\u8acb\u8f38\u5165\u81ea\u8a02\u55ae\u4f4d\u540d\u7a31';
        childEl.innerHTML = '<option value="">\u81ea\u8a02\u55ae\u4f4d\u6a21\u5f0f</option>';
        childEl.disabled = true;
        hiddenEl.value = String(customEl.value || '').trim();
        syncSearchInput();
        if (dispatchChange) hiddenEl.dispatchEvent(new Event('change'));
        return;
      }

      setCustomMode(false);
      const hasChildren = Array.isArray(structure[parent]) && structure[parent].length > 0;
      const child = (!childEl.disabled && hasChildren) ? String(childEl.value || '').trim() : '';
      hiddenEl.value = composeUnitValue(parent, child);
      syncSearchInput();
      if (dispatchChange) hiddenEl.dispatchEvent(new Event('change'));
    };

    const renderParents = (category, selectedParent) => {
      const targetCategory = String(category || '').trim();
      const parent = String(selectedParent || '').trim();
      if (!targetCategory) {
        parentEl.innerHTML = '<option value="">再選單位</option>';
        parentEl.disabled = true;
        if (childWrap) childWrap.style.display = 'none';
        childEl.innerHTML = '<option value="">有二級單位再選</option>';
        childEl.disabled = true;
        return;
      }
      const categoryParents = getParentsByUnitCategory(parents, targetCategory);
      const parentOptions = parent && !categoryParents.includes(parent) ? [parent].concat(categoryParents) : categoryParents;
      parentEl.disabled = false;
      parentEl.innerHTML =
        '<option value="">請選擇單位</option>' +
        parentOptions.map((item) => `<option value="${esc(item)}">${esc(getUnitOptionLabel(item, item))}</option>`).join('') +
        (allowCustom ? `<option value="${UNIT_CUSTOM_VALUE}">${UNIT_CUSTOM_LABEL}</option>` : '');
      if (parent) parentEl.value = parent;
    };

    const renderChildren = (parent, selectedChild) => {
      const child = String(selectedChild || '').trim();

      if (allowCustom && parent === UNIT_CUSTOM_VALUE) {
        childEl.innerHTML = '<option value="">\u81ea\u8a02\u55ae\u4f4d\u6a21\u5f0f</option>';
        childEl.disabled = true;
        if (childWrap) childWrap.style.display = 'none';
        return;
      }

      const children = Array.isArray(structure[parent]) ? [...structure[parent]] : [];
      if (child && !children.includes(child)) children.unshift(child);

      if (!parent) {
        childEl.innerHTML = '<option value="">\u8acb\u5148\u9078\u64c7\u4e00\u7d1a\u55ae\u4f4d</option>';
        childEl.disabled = true;
        if (childWrap) childWrap.style.display = 'none';
        return;
      }

      if (children.length === 0) {
        childEl.innerHTML = '<option value="">\u7121\u4e8c\u7d1a\u55ae\u4f4d</option>';
        childEl.disabled = true;
        if (childWrap) childWrap.style.display = 'none';
        return;
      }

      childEl.disabled = false;
      if (childWrap) childWrap.style.display = '';
      childEl.innerHTML = '<option value="">選二級單位（選填）</option>' + children.map((c) => {
        const unitValue = composeUnitValue(parent, c);
        return `<option value="${esc(c)}">${esc(getUnitOptionLabel(unitValue, c))}</option>`;
      }).join('');
      if (child) childEl.value = child;
    };

    categoryEl.addEventListener('change', () => {
      renderParents(categoryEl.value, '');
      renderChildren('', '');
      syncHidden(true);
    });
    parentEl.addEventListener('change', () => {
      renderChildren(parentEl.value, '');
      syncHidden(true);
    });
    childEl.addEventListener('change', () => syncHidden(true));
    if (allowCustom) customEl.addEventListener('input', () => syncHidden(true));

    if (isInitialCustom) {
      categoryEl.value = initialCategory || '行政單位';
      renderParents(categoryEl.value, UNIT_CUSTOM_VALUE);
      parentEl.value = UNIT_CUSTOM_VALUE;
      customEl.value = rawInitial;
    } else {
      if (initialCategory) categoryEl.value = initialCategory;
      renderParents(categoryEl.value, parsed.parent);
    }
    renderChildren(parentEl.value, parsed.child);
    syncHidden(false);

    if (searchEl) {
      searchEl.addEventListener('input', (event) => renderSearchResults(event.target.value));
      searchEl.addEventListener('focus', () => {
        if (String(searchEl.value || '').trim()) renderSearchResults(searchEl.value);
      });
      searchEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          hideSearchResults();
          return;
        }
        if (event.key === 'Enter') {
          const firstMatch = searchResultsEl?.querySelector('[data-unit-value]');
          if (firstMatch) {
            event.preventDefault();
            firstMatch.click();
          }
        }
      });
      searchEl.addEventListener('blur', () => {
        window.setTimeout(hideSearchResults, 120);
      });
      syncSearchInput();
    }

    if (opts.disabled) {
      if (searchEl) searchEl.disabled = true;
      categoryEl.disabled = true;
      parentEl.disabled = true;
      childEl.disabled = true;
      if (customEl) customEl.disabled = true;
    }
  }

  function parseUserUnits(value) { return getDataModule().parseUserUnits(value); }
  function normalizeUserRole(role) { return getDataModule().normalizeUserRole(role); }
  function getAuthorizedUnits(user) { return getDataModule().getAuthorizedUnits(user); }
  function getActiveUnit(user) { return getDataModule().getActiveUnit(user); }
  function normalizeUserRecord(user) { return getDataModule().normalizeUserRecord(user); }
  function hasGlobalReadScope(user = currentUser()) {
    return !!user && (user.role === ROLES.ADMIN || user.role === ROLES.VIEWER);
  }
  function hasUnitAccess(unit, user = currentUser()) {
    if (!user) return false;
    const target = String(unit || '').trim();
    if (!target) return true;
    if (user.role === ROLES.ADMIN) return true;
    if (user.role === ROLES.VIEWER) {
      const scoped = getActiveUnit(user);
      return !scoped || scoped === target;
    }
    return getAuthorizedUnits(user).includes(target);
  }
  function canSwitchAuthorizedUnit(user = currentUser()) {
    return !!user && user.role !== ROLES.ADMIN && getAuthorizedUnits(user).length > 1;
  }
  function getScopedUnit(user = currentUser()) {
    if (!user) return '';
    if (user.role === ROLES.ADMIN) return '';
    return getActiveUnit(user);
  }
  function switchCurrentUserUnit(unit) {
    const user = currentUser();
    if (!user) return false;
    const target = String(unit || '').trim();
    if (!getAuthorizedUnits(user).includes(target)) return false;
    const next = normalizeUserRecord({ ...user, activeUnit: target });
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(next));
    return true;
  }
  function loadData() { return getDataModule().loadData(); }
  function saveData(data) { return getDataModule().saveData(data); }
  function getAllItems() { return getDataModule().getAllItems(); }
  function getItem(id) { return getDataModule().getItem(id); }
  function addItem(item) { return getDataModule().addItem(item); }
  function updateItem(id, updates) { return getDataModule().updateItem(id, updates); }
  function normalizeCarIdInput(value) { return String(value || '').trim().toUpperCase().replace(/\s+/g, ''); }
  function generateId(unitValue, dateValue) {
    const d = loadData();
    const documentNo = buildCorrectionDocumentNo(unitValue, dateValue);
    if (!documentNo) throw new Error('請先選擇具正式代碼的處理單位，或手動輸入案件編號');
    const sequence = getNextCorrectionSequence(documentNo, d.items);
    return buildAutoCarIdByDocument(documentNo, sequence);
  }
  function reserveCarId(preferredId, handlerUnit, dateValue) {
    const customId = normalizeCarIdInput(preferredId);
    if (!customId) return generateId(handlerUnit, dateValue);
    if (!/^[A-Z0-9_-]+$/.test(customId)) throw new Error('矯正單號僅支援英數、連字號與底線');
    const d = loadData();
    if (d.items.some((item) => String(item.id || '').toUpperCase() === customId)) throw new Error('矯正單號已存在');
    return customId;
  }
  function getUsers() { return getDataModule().getUsers(); }
  function addUser(user) { return getDataModule().addUser(user); }
  function updateUser(username, updates) { return getDataModule().updateUser(username, updates); }
  function deleteUser(username) { return getDataModule().deleteUser(username); }
  function findUser(username) { return getDataModule().findUser(username); }
  function findUserByEmail(email) { return getDataModule().findUserByEmail(email); }
  function ensurePrimaryAdminProfile() {
    const d = loadData();
    if (!d || !Array.isArray(d.users)) return;

    let changed = false;
    let admin = d.users.find((u) => u.username === 'admin');
    if (!admin) {
      const defaultAdmin = DEFAULT_USERS.find((u) => u.username === 'admin');
      if (defaultAdmin) {
        admin = { ...defaultAdmin };
        d.users.unshift(admin);
        changed = true;
      }
    }

    if (!admin) return;
    if (admin.role !== ROLES.ADMIN) {
      admin.role = ROLES.ADMIN;
      changed = true;
    }
    if (admin.name !== '計算機及資訊網路中心') {
      admin.name = '計算機及資訊網路中心';
      changed = true;
    }

    if (changed) saveData(d);

    try {
      const rawAuth = sessionStorage.getItem(AUTH_KEY);
      if (!rawAuth) return;
      const auth = JSON.parse(rawAuth);
      if (auth && auth.username === 'admin') {
        auth.role = ROLES.ADMIN;
        auth.name = '計算機及資訊網路中心';
        sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));
      }
    } catch (_) { }
  }

  function generatePassword() { const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; let p = ''; for (let i = 0; i < 8; i++)p += c[Math.floor(Math.random() * c.length)]; return p; }
  function loadLoginLogs() { return getDataModule().loadLoginLogs(); }
  function saveLoginLogs(logs) { return getDataModule().saveLoginLogs(logs); }
  function addLoginLog(username, user, success) { return getDataModule().addLoginLog(username, user, success); }
  function clearLoginLogs() { return getDataModule().clearLoginLogs(); }
  function login(un, pw) {
    const u = findUser(un);
    const ok = !!(u && u.password === pw);
    addLoginLog(un, u, ok);
    if (ok) {
      const normalized = normalizeUserRecord(u);
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(normalized));
      return normalized;
    }
    return null;
  }
  function logout() { sessionStorage.removeItem(AUTH_KEY); renderApp(); }
  function currentUser() { try { const user = JSON.parse(sessionStorage.getItem(AUTH_KEY)); return user ? normalizeUserRecord(user) : null; } catch { return null; } }
  function isAdmin() { return currentUser()?.role === ROLES.ADMIN; }
  function isUnitAdmin() { return currentUser()?.role === ROLES.UNIT_ADMIN; }
  function isViewer(user = currentUser()) { return user?.role === ROLES.VIEWER; }
  function canCreateCAR() { return isAdmin(); }
  function canReview() { return isAdmin(); }
  function canFillChecklist() { return !!currentUser() && !isViewer(); }
  function canFillTraining() { return !!currentUser() && !isViewer(); }
  function canManageUsers() { return isAdmin(); }
  function fmt(d) { if (!d) return '—'; const x = new Date(d); return `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}`; }
  function fmtTime(d) { if (!d) return '—'; const x = new Date(d); return `${fmt(d)} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; }
  function isOverdue(item) { return item.status !== STATUSES.CLOSED && item.correctiveDueDate && new Date(item.correctiveDueDate) < new Date(); }
  function ic(n, c = '') { return `<i data-lucide="${n}" ${c ? 'class="' + c + '"' : ''}></i>`; }
  function ntuLogo(c = '') { return '<span class="ntu-logo ' + c + '">NTU</span>'; }
  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function toast(msg, type = 'success') { const c = document.getElementById('toast-container'); if (!c) return; const t = document.createElement('div'); t.className = `toast toast-${type}`; t.innerHTML = `<span class="toast-message">${esc(msg)}</span>`; c.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; t.style.transition = 'all 300ms'; }, 2500); setTimeout(() => t.remove(), 2800); }
  function renderCopyIdButton(value, label) {
    const text = String(value || '').trim();
    if (!text) return '';
    const safeLabel = String(label || '編號').trim();
    return `<button type="button" class="copy-id-btn" data-copy="${esc(text)}" data-copy-label="${esc(safeLabel)}" title="複製${esc(safeLabel)}" aria-label="複製${esc(safeLabel)}">${ic('copy', 'icon-xs')}</button>`;
  }
  function renderCopyIdCell(value, label, strong = false) {
    const text = String(value || '').trim();
    const classes = ['copy-id-cell'];
    if (strong) classes.push('copy-id-cell--strong');
    return `<div class="${classes.join(' ')}"><span class="copy-id-text">${esc(text || '—')}</span>${renderCopyIdButton(text, label)}</div>`;
  }
  function copyTextToClipboard(value, label = '編號') {
    const text = String(value || '').trim();
    if (!text) {
      toast(`沒有可複製的${label}`, 'error');
      return Promise.resolve(false);
    }
    const fallbackCopy = () => {
      try {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(input);
        if (!ok) throw new Error('copy command failed');
        toast(`${label}已複製`);
        return true;
      } catch (_) {
        toast(`${label}複製失敗`, 'error');
        return false;
      }
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(() => {
        toast(`${label}已複製`);
        return true;
      }).catch(() => fallbackCopy());
    }
    return Promise.resolve(fallbackCopy());
  }
  function bindCopyButtons(root = document) {
    root.querySelectorAll('.copy-id-btn:not([data-copy-bound])').forEach((button) => {
      button.dataset.copyBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyTextToClipboard(button.dataset.copy || '', button.dataset.copyLabel || '編號');
      });
    });
  }
  function applyTestIds(map) {
    Object.entries(map || {}).forEach(([id, testId]) => {
      const el = document.getElementById(id);
      if (el && testId) el.setAttribute('data-testid', testId);
    });
  }
  function applySelectorTestIds(entries) {
    (entries || []).forEach((entry) => {
      const el = document.querySelector(entry.selector);
      if (el && entry.testId) el.setAttribute('data-testid', entry.testId);
    });
  }
  function debugFlow(scope, message, data) {
    try {
      if (!window.console || typeof window.console.info !== 'function') return;
      if (data === undefined) window.console.info(`[ISMS:${scope}] ${message}`);
      else window.console.info(`[ISMS:${scope}] ${message}`, data);
    } catch (_) { }
  }
  function navigate(h, options) {
    const opts = options || {};
    const target = '#' + String(h || '').replace(/^#/, '');
    if (window.location.hash === target) {
      if (opts.replace && window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', target);
      }
      handleRoute();
      return;
    }
    if (opts.replace && window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', target);
      handleRoute();
      return;
    }
    window.location.hash = target;
  }
  function getRoute() {
    const h = window.location.hash.slice(1) || 'dashboard';
    const p = h.split('/');
    let param = p[1];
    if (param) {
      try { param = decodeURIComponent(param); } catch (_) { }
    }
    return { page: p[0], param };
  }
  let dataModuleApi = null;
  function getDataModule() {
    if (dataModuleApi) return dataModuleApi;
    if (typeof window === 'undefined' || typeof window.createDataModule !== 'function') {
      throw new Error('data-module.js not loaded');
    }
    dataModuleApi = window.createDataModule({
      DATA_KEY,
      AUTH_KEY,
      CHECKLIST_KEY,
      TEMPLATE_KEY,
      TRAINING_KEY,
      LOGIN_LOG_KEY,
      UNIT_REVIEW_KEY,
      DEFAULT_USERS,
      DEFAULT_CHECKLIST_SECTIONS,
      ROLES,
      CHECKLIST_STATUS_DRAFT,
      CHECKLIST_STATUS_SUBMITTED,
      TRAINING_STATUSES,
      TRAINING_EMPLOYEE_STATUS,
      getUnitCode,
      buildCorrectionDocumentNo,
      parseCorrectionAutoId,
      getNextCorrectionSequence,
      buildAutoCarIdByDocument,
      buildChecklistDocumentNo,
      parseChecklistId,
      buildChecklistIdByDocument,
      getNextChecklistSequence,
      getTrainingStatsUnit,
      getTrainingJobUnit,
      hasTrainingValue,
      isTrainingBooleanValue,
      normalizeTrainingProfessionalValue,
      computeTrainingSummary,
      buildTrainingFormDocumentNo,
      parseTrainingFormId,
      buildTrainingFormIdByDocument,
      getNextTrainingFormSequence
    });
    window._dataModule = dataModuleApi;
    return dataModuleApi;
  }
  let adminModuleApi = null;
  function getAdminModule() {
    if (adminModuleApi) return adminModuleApi;
    if (typeof window === 'undefined' || typeof window.createAdminModule !== 'function') {
      throw new Error('admin-module.js not loaded');
    }
    adminModuleApi = window.createAdminModule({
      ROLES,
      ROLE_BADGE,
      currentUser,
      isAdmin,
      canManageUsers,
      getUsers,
      getAuthorizedUnits,
      parseUserUnits,
      findUser,
      addUser,
      updateUser,
      deleteUser,
      getCustomUnitRegistry,
      loadUnitReviewStore,
      formatUnitScopeSummary,
      approveCustomUnit,
      mergeCustomUnit,
      loadLoginLogs,
      clearLoginLogs,
      navigate,
      toast,
      fmtTime,
      esc,
      ic,
      refreshIcons,
      buildUnitCascadeControl,
      initUnitCascade
    });
    window._adminModule = adminModuleApi;
    return adminModuleApi;
  }
  let caseModuleApi = null;
  function getCaseModule() {
    if (caseModuleApi) return caseModuleApi;
    if (typeof window === 'undefined' || typeof window.createCaseModule !== 'function') {
      throw new Error('case-module.js not loaded');
    }
    caseModuleApi = window.createCaseModule({
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
      applySelectorTestIds
    });
    window._caseModule = caseModuleApi;
    return caseModuleApi;
  }
  let checklistModuleApi = null;
  function getChecklistModule() {
    if (checklistModuleApi) return checklistModuleApi;
    if (typeof window === 'undefined' || typeof window.createChecklistModule !== 'function') {
      throw new Error('checklist-module.js not loaded');
    }
    checklistModuleApi = window.createChecklistModule({
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
      getChecklistSections,
      saveChecklistSections,
      navigate,
      toast,
      fmt,
      fmtTime,
      esc,
      ic,
      refreshIcons,
      bindCopyButtons,
      renderCopyIdCell,
      renderCopyIdButton
    });
    window._checklistModule = checklistModuleApi;
    return checklistModuleApi;
  }
  let trainingModuleApi = null;
  function getTrainingModule() {
    if (trainingModuleApi) return trainingModuleApi;
    if (typeof window === 'undefined' || typeof window.createTrainingModule !== 'function') {
      throw new Error('training-module.js 尚未載入');
    }
    trainingModuleApi = window.createTrainingModule({
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
      saveTrainingStore
    });
    window._trainingModule = trainingModuleApi;
    return trainingModuleApi;
  }
  let shellModuleApi = null;
  function getShellModule() {
    if (shellModuleApi) return shellModuleApi;
    if (typeof window === 'undefined' || typeof window.createShellModule !== 'function') {
      throw new Error('shell-module.js not loaded');
    }
    shellModuleApi = window.createShellModule({
      ROUTE_WHITELIST,
      ROLE_BADGE,
      STATUSES,
      currentUser,
      login,
      logout,
      findUserByEmail,
      generatePassword,
      updateUser,
      getVisibleItems,
      isOverdue,
      getRoute,
      getRouteMeta,
      getRouteTitle,
      canAccessRoute,
      getRouteFallback,
      navigate,
      toast,
      refreshIcons,
      esc,
      ic,
      ntuLogo,
      canCreateCAR,
      canFillChecklist,
      canManageUsers,
      isAdmin,
      canSwitchAuthorizedUnit,
      getAuthorizedUnits,
      getScopedUnit,
      switchCurrentUserUnit
    });
    window._shellModule = shellModuleApi;
    return shellModuleApi;
  }
  const ROUTE_WHITELIST = {
    dashboard: { title: '\u5100\u8868\u677f', allow: () => !!currentUser(), render: () => getCaseModule().renderDashboard() },
    list: { title: '\u77ef\u6b63\u55ae\u5217\u8868', allow: () => !!currentUser(), render: () => getCaseModule().renderList() },
    create: { title: '\u958b\u7acb\u77ef\u6b63\u55ae', allow: () => canCreateCAR(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u958b\u7acb\u77ef\u6b63\u55ae\u6b0a\u9650', render: () => getCaseModule().renderCreate() },
    detail: { title: '\u77ef\u6b63\u55ae\u8a73\u60c5', allow: () => !!currentUser(), render: (param) => getCaseModule().renderDetail(param) },
    respond: { title: '\u56de\u586b\u77ef\u6b63\u63aa\u65bd', allow: () => !!currentUser(), render: (param) => getCaseModule().renderRespond(param) },
    tracking: { title: '\u8ffd\u8e64\u76e3\u63a7', allow: () => !!currentUser(), render: (param) => getCaseModule().renderTracking(param) },
    users: { title: '\u5e33\u865f\u7ba1\u7406', allow: () => canManageUsers(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u5e33\u865f\u7ba1\u7406\u6b0a\u9650', render: () => getAdminModule().renderUsers() },
    'login-log': { title: '\u767b\u5165\u7d00\u9304', allow: () => canManageUsers(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u6aa2\u8996\u767b\u5165\u7d00\u9304\u6b0a\u9650', render: () => getAdminModule().renderLoginLog() },
    checklist: { title: '\u5167\u7a3d\u6aa2\u6838\u8868', allow: () => !!currentUser(), render: () => getChecklistModule().renderChecklistList() },
    'checklist-fill': { title: '\u586b\u5831\u6aa2\u6838\u8868', allow: () => canFillChecklist(), fallback: 'checklist', deniedMessage: '\u60a8\u6c92\u6709\u586b\u5831\u6aa2\u6838\u8868\u6b0a\u9650', render: (param) => getChecklistModule().renderChecklistFill(param) },
    'checklist-detail': { title: '\u6aa2\u6838\u8868\u8a73\u60c5', allow: () => !!currentUser(), render: (param) => getChecklistModule().renderChecklistDetail(param) },
    'checklist-manage': { title: '\u6aa2\u6838\u8868\u7ba1\u7406', allow: () => isAdmin(), fallback: 'dashboard', deniedMessage: '\u50c5\u6700\u9ad8\u7ba1\u7406\u8005\u53ef\u7ba1\u7406\u6aa2\u6838\u8868', render: () => getChecklistModule().renderChecklistManage() },
    'unit-review': { title: '\u55ae\u4f4d\u6cbb\u7406', allow: () => isAdmin(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u7ba1\u7406\u55ae\u4f4d\u6cbb\u7406\u7684\u6b0a\u9650', render: () => getAdminModule().renderUnitReview() },
    training: { title: '\u8cc7\u5b89\u6559\u80b2\u8a13\u7df4\u7d71\u8a08', allow: () => !!currentUser(), render: () => getTrainingModule().renderTraining() },
    'training-fill': { title: '\u586b\u5831\u8cc7\u5b89\u6559\u80b2\u8a13\u7df4\u7d71\u8a08', allow: () => canFillTraining(), fallback: 'training', deniedMessage: '\u60a8\u6c92\u6709\u586b\u5831\u6559\u80b2\u8a13\u7df4\u7684\u6b0a\u9650', render: (param) => getTrainingModule().renderTrainingFill(param) },
    'training-detail': { title: '\u8cc7\u5b89\u6559\u80b2\u8a13\u7df4\u7d71\u8a08\u8a73\u60c5', allow: () => !!currentUser(), render: (param) => getTrainingModule().renderTrainingDetail(param) },
    'training-roster': { title: '\u6559\u80b2\u8a13\u7df4\u540d\u55ae\u7ba1\u7406', allow: () => isAdmin(), fallback: 'training', deniedMessage: '\u50c5\u6700\u9ad8\u7ba1\u7406\u8005\u53ef\u7ba1\u7406\u6559\u80b2\u8a13\u7df4\u540d\u55ae', render: () => getTrainingModule().renderTrainingRoster() }
  };
  function getRouteMeta(page) { return ROUTE_WHITELIST[page] || ROUTE_WHITELIST.dashboard; }
  function getRouteTitle(page) { return getRouteMeta(page).title || '\u5167\u90e8\u7a3d\u6838\u7ba1\u8003\u8ffd\u8e64\u7cfb\u7d71'; }
  function canAccessRoute(page) {
    const meta = getRouteMeta(page);
    if (!meta || typeof meta.allow !== 'function') return true;
    try { return !!meta.allow(); } catch (_) { return false; }
  }
  function getRouteFallback(page) {
    const meta = getRouteMeta(page);
    return meta && meta.fallback ? meta.fallback : 'dashboard';
  }
  window._routeWhitelist = function () {
    return Object.keys(ROUTE_WHITELIST).reduce((acc, page) => {
      acc[page] = {
        title: ROUTE_WHITELIST[page].title,
        fallback: ROUTE_WHITELIST[page].fallback || null
      };
      return acc;
    }, {});
  };
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
  function getVisibleItems() {
    const u = currentUser();
    if (!u) return [];
    const all = getAllItems();
    if (hasGlobalReadScope(u)) return all;
    return all.filter((item) => hasUnitAccess(item.handlerUnit, u) || isItemHandler(item, u));
  }
  function canAccessItem(item) {
    if (!item) return false;
    const u = currentUser();
    if (!u) return false;
    if (hasGlobalReadScope(u)) return true;
    return hasUnitAccess(item.handlerUnit, u) || isItemHandler(item, u);
  }
  function isItemHandler(item, user = currentUser()) {
    if (!item || !user) return false;
    if (hasUnitAccess(item.handlerUnit, user)) return true;
    return item.handlerUsername ? item.handlerUsername === user.username : item.handlerName === user.name;
  }
  function canRespondItem(item, user = currentUser()) {
    if (!item || !user) return false;
    return item.status === STATUSES.PENDING && !isViewer(user) && (isItemHandler(item, user) || user.role === ROLES.ADMIN);
  }
  function canSubmitTracking(item, user = currentUser()) {
    if (!item || !user) return false;
    return item.status === STATUSES.TRACKING && !isViewer(user) && isItemHandler(item, user) && !item.pendingTracking;
  }
  
  function toTestIdFragment(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function isTrainingBooleanValue(value) {
    return TRAINING_BOOLEAN_SELECT_OPTIONS.includes(String(value || '').trim());
  }

  function isTrainingBooleanCompatibleValue(value) {
    return TRAINING_BOOLEAN_OPTIONS.includes(String(value || '').trim());
  }

  function normalizeTrainingProfessionalValue(value) {
    const safeValue = String(value || '').trim();
    if (!isTrainingBooleanCompatibleValue(safeValue)) return '';
    if (safeValue === '無須' || safeValue === '不適用') return '不適用';
    return safeValue;
  }

  function getStoredTrainingProfessionalValue(record) {
    if (!record || record.status !== '在職') return '';
    if (record.isInfoStaff === '否') return '不適用';
    return isTrainingBooleanValue(record.completedProfessional) ? record.completedProfessional : '';
  }
  function mkChk(name, opts, sel) {
    return '<div class="checkbox-group" data-testid="' + name + '-group">' + opts.map((o, index) => {
      const key = toTestIdFragment(o) || String(index);
      return '<label class="chk-label" data-testid="' + name + '-option-' + key + '"><input type="checkbox" name="' + name + '" value="' + o + '" data-testid="' + name + '-input-' + key + '" ' + ((sel || []).includes(o) ? 'checked' : '') + '><span class="chk-box"></span>' + o + '</label>';
    }).join('') + '</div>';
  }
  function mkRadio(name, opts, sel) {
    return '<div class="radio-group" data-testid="' + name + '-group">' + opts.map((o, index) => {
      const key = toTestIdFragment(o) || String(index);
      return '<label class="radio-label" data-testid="' + name + '-option-' + key + '"><input type="radio" name="' + name + '" value="' + o + '" data-testid="' + name + '-input-' + key + '" ' + (sel === o ? 'checked' : '') + '><span class="radio-dot"></span>' + o + '</label>';
    }).join('') + '</div>';
  }
  function isMobileViewport() { return getShellModule().isMobileViewport(); }
  function closeSidebar() { return getShellModule().closeSidebar(); }
  function toggleSidebar() { return getShellModule().toggleSidebar(); }
  function renderLogin() { return getShellModule().renderLogin(); }
  function renderApp() { return getShellModule().renderApp(); }
  function renderSidebar() { return getShellModule().renderSidebar(); }
  function renderHeader() { return getShellModule().renderHeader(); }

  // ─── Render: Dashboard ─────────────────────
  function getCurrentNextTrackingDate(item) {
    if (!item) return '';
    const pendingDate = String(item.pendingTracking?.nextTrackDate || '').trim();
    if (pendingDate) return pendingDate;
    const latestTracked = (Array.isArray(item.trackings) ? item.trackings : [])
      .slice()
      .reverse()
      .find((tracking) => String(tracking && tracking.nextTrackDate || '').trim());
    return latestTracked ? String(latestTracked.nextTrackDate || '').trim() : '';
  }

  const DEFAULT_CHECKLIST_SECTIONS = [
    {
      section: '1. 資安意識及資安通識教育訓練', items: [
        { id: '1.1', text: '單位同仁是否瞭解本校資通安全政策？', hint: '本校資安政策放置於資通安全管理專區，已透過 MAIL 方式向同仁宣導' },
        { id: '1.2', text: '單位同仁是否每年接受 3 小時以上之資通安全通識教育？', hint: '114 年資通安全教育訓練執行情形、全校資安通識教育訓練統計表' },
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
  function getChecklistSections() { return getDataModule().getChecklistSections(); }
  function saveChecklistSections(sections) { return getDataModule().saveChecklistSections(sections); }

  // Dynamic alias used throughout the fill/detail views
  var CHECKLIST_SECTIONS;
  function refreshChecklistSections() { CHECKLIST_SECTIONS = getChecklistSections(); }
  refreshChecklistSections();

  const COMPLIANCE_OPTS = ['符合', '部分符合', '不符合', '不適用'];
  const COMPLIANCE_COLORS = { '符合': '#22c55e', '部分符合': '#f59e0b', '不符合': '#ef4444', '不適用': '#94a3b8' };
  const COMPLIANCE_CLASSES = { '符合': 'comply', '部分符合': 'partial', '不符合': 'noncomply', '不適用': 'na' };

  // ─── Checklist Storage ─────────────────────
  function normalizeChecklistStatus(status) { return getDataModule().normalizeChecklistStatus(status); }
  function isChecklistDraftStatus(status) { return getDataModule().isChecklistDraftStatus(status); }
  function normalizeChecklistItem(item) { return getDataModule().normalizeChecklistItem(item); }
  function loadChecklists() { return getDataModule().loadChecklists(); }
  function saveChecklists(store) { return getDataModule().saveChecklists(store); }
  function getAllChecklists() { return getDataModule().getAllChecklists(); }
  function getChecklist(id) { return getDataModule().getChecklist(id); }
  function addChecklist(item) { return getDataModule().addChecklist(item); }
  function updateChecklist(id, updates) { return getDataModule().updateChecklist(id, updates); }
  function getChecklistUnitCode(unit) {
    return getUnitCode(unit) || 'CHK';
  }
  function buildChecklistDocumentNo(unit, auditYear, fillDate) {
    return buildScopedRecordPrefix('CHK', unit, auditYear, fillDate);
  }
  function parseChecklistId(value) {
    return parseScopedRecordId(value, 'CHK');
  }
  function buildChecklistIdByDocument(documentNo, sequence) {
    return buildScopedRecordId(documentNo, sequence);
  }
  function getNextChecklistSequence(documentNo, items) {
    return getNextScopedRecordSequence(documentNo, items, parseChecklistId);
  }
  function generateChecklistId(unit) {
    const d = loadChecklists();
    const documentNo = buildChecklistDocumentNo(unit);
    if (!documentNo) throw new Error('請先選擇具正式代碼的受稽單位');
    return buildChecklistIdByDocument(documentNo, getNextChecklistSequence(documentNo, d.items));
  }
  function generateChecklistIdForYear(unit, auditYear, fillDate) {
    const d = loadChecklists();
    const documentNo = buildChecklistDocumentNo(unit, auditYear, fillDate);
    if (!documentNo) throw new Error('請先選擇具正式代碼的受稽單位');
    return buildChecklistIdByDocument(documentNo, getNextChecklistSequence(documentNo, d.items));
  }
  function isChecklistOwner(cl, user) {
    const actor = user || currentUser();
    if (!actor || !cl) return false;
    if (cl.fillerUsername) return cl.fillerUsername === actor.username;
    return cl.fillerName === actor.name;
  }
  function canAccessChecklist(cl) {
    const u = currentUser();
    if (!u || !cl) return false;
    if (hasGlobalReadScope(u)) return true;
    return hasUnitAccess(cl.unit, u) || isChecklistOwner(cl, u);
  }
  function getVisibleChecklists() {
    const u = currentUser();
    if (!u) return [];
    const all = getAllChecklists();
    if (hasGlobalReadScope(u)) return all;
    return all.filter((item) => canAccessChecklist(item));
  }
  function canEditChecklist(cl) {
    const u = currentUser();
    if (!u || !cl || !isChecklistDraftStatus(cl.status) || !canFillChecklist()) return false;
    if (u.role === ROLES.ADMIN) return true;
    return hasUnitAccess(cl.unit, u) || isChecklistOwner(cl, u);
  }

  function findExistingChecklistForUnitYear(unit, auditYear, excludeId) {
    const safeUnit = String(unit || '').trim();
    const safeYear = String(auditYear || '').trim();
    const skipId = String(excludeId || '').trim();
    if (!safeUnit || !safeYear) return null;
    return getAllChecklists()
      .filter((item) => item.unit === safeUnit && String(item.auditYear || '').trim() === safeYear && item.id !== skipId)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0] || null;
  }

  function getLatestEditableChecklistDraft() {
    const drafts = getVisibleChecklists().filter((c) => isChecklistDraftStatus(c.status) && canEditChecklist(c));
    drafts.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return drafts[0] || null;
  }

  const TRAINING_PROFESSIONAL_OPTIONS = ['是', '否'];

  function getTrainingStatsUnit(unit) {
    const parsed = splitUnitValue(unit || '');
    return String(parsed.parent || unit || '').trim();
  }

  function getTrainingJobUnit(unit, explicit) {
    const parsed = splitUnitValue(unit || '');
    return String(explicit || parsed.child || parsed.parent || unit || '').trim();
  }

  function hasTrainingValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  function normalizeTrainingRosterRow(row, fallbackUnit) { return getDataModule().normalizeTrainingRosterRow(row, fallbackUnit); }
  function normalizeTrainingRecordState(record) { return getDataModule().normalizeTrainingRecordState(record); }
  function normalizeTrainingRecordRow(row, fallbackUnit) { return getDataModule().normalizeTrainingRecordRow(row, fallbackUnit); }
  function normalizeTrainingForm(form) { return getDataModule().normalizeTrainingForm(form); }
  function loadTrainingStore() { return getDataModule().loadTrainingStore(); }
  function saveTrainingStore(store) { return getDataModule().saveTrainingStore(store); }
  function getAllTrainingForms() { return getDataModule().getAllTrainingForms(); }
  function getTrainingForm(id) { return getDataModule().getTrainingForm(id); }
  function upsertTrainingForm(form) { return getDataModule().upsertTrainingForm(form); }
  function updateTrainingForm(id, updates) { return getDataModule().updateTrainingForm(id, updates); }

  function buildTrainingFormDocumentNo(unit, trainingYear, fillDate) {
    return buildScopedRecordPrefix('TRN', unit, trainingYear, fillDate);
  }

  function parseTrainingFormId(value) {
    return parseScopedRecordId(value, 'TRN');
  }

  function buildTrainingFormIdByDocument(documentNo, sequence) {
    return buildScopedRecordId(documentNo, sequence);
  }

  function getNextTrainingFormSequence(documentNo, forms) {
    return getNextScopedRecordSequence(documentNo, forms, parseTrainingFormId);
  }

  function generateTrainingFormId(unit, trainingYear, fillDate) {
    const store = loadTrainingStore();
    const documentNo = buildTrainingFormDocumentNo(unit, trainingYear, fillDate);
    if (!documentNo) throw new Error('請先選擇具正式代碼的填報單位');
    return buildTrainingFormIdByDocument(documentNo, getNextTrainingFormSequence(documentNo, store.forms));
  }

  function getAllTrainingRosters() { return getDataModule().getAllTrainingRosters(); }
  function getTrainingRosterByUnit(unit) { return getDataModule().getTrainingRosterByUnit(unit); }
  function addTrainingRosterPerson(unit, payload, source, actor, actorUsername) { return getDataModule().addTrainingRosterPerson(unit, payload, source, actor, actorUsername); }
  function deleteTrainingRosterPerson(id) { return getDataModule().deleteTrainingRosterPerson(id); }
  function updateTrainingRosterPerson(id, updates) { return getDataModule().updateTrainingRosterPerson(id, updates); }

  function getTrainingUnits() {
    return getSystemUnits();
  }

  function getVisibleTrainingForms() {
    const user = currentUser();
    if (!user) return [];
    const forms = getAllTrainingForms();
    if (hasGlobalReadScope(user)) return forms;
    return forms.filter((form) => hasUnitAccess(form.unit, user) || form.fillerUsername === user.username);
  }

  function canEditTrainingForm(form) {
    const user = currentUser();
    if (!user || !form) return false;
    if (isViewer(user)) return false;
    const inScope = user.role === ROLES.ADMIN || hasUnitAccess(form.unit, user) || form.fillerUsername === user.username;
    if (!inScope) return false;
    return form.status === TRAINING_STATUSES.DRAFT || form.status === TRAINING_STATUSES.RETURNED;
  }

  function canManageTrainingForm(form, user = currentUser()) {
    if (!user || !form || isViewer(user)) return false;
    return user.role === ROLES.ADMIN || hasUnitAccess(form.unit, user) || form.fillerUsername === user.username;
  }

  function isTrainingManualRowOwner(row, user = currentUser()) {
    if (!row || row.source !== 'manual' || !user) return false;
    const ownerUsername = String(row.createdByUsername || '').trim();
    const ownerName = String(row.createdBy || '').trim();
    if (ownerUsername) return ownerUsername === user.username;
    return !!ownerName && ownerName === user.name;
  }

  function canDeleteTrainingEditableRow(row, form, user = currentUser()) {
    if (!row || row.source !== 'manual' || !user || isViewer(user)) return false;
    const editable = !form || canEditTrainingForm(form);
    if (!editable) return false;
    return isTrainingManualRowOwner(row, user);
  }

  function getTrainingUndoRemainingMs(form, now = Date.now()) {
    if (!form || !form.stepOneSubmittedAt) return 0;
    const submittedAt = Date.parse(form.stepOneSubmittedAt);
    if (!Number.isFinite(submittedAt)) return 0;
    const deadline = submittedAt + (TRAINING_UNDO_WINDOW_MINUTES * 60 * 1000);
    return Math.max(0, deadline - now);
  }

  function getTrainingUndoRemainingMinutes(form, now = Date.now()) {
    const remainingMs = getTrainingUndoRemainingMs(form, now);
    if (!remainingMs) return 0;
    return Math.max(1, Math.ceil(remainingMs / 60000));
  }

  function canUndoTrainingForm(form, user = currentUser()) {
    if (!form || !user || isViewer(user)) return false;
    if (form.status !== TRAINING_STATUSES.PENDING_SIGNOFF) return false;
    if (!canManageTrainingForm(form, user)) return false;
    if (form.fillerUsername && form.fillerUsername !== user.username) return false;
    if (form.printedAt || form.signoffUploadedAt || form.submittedAt) return false;
    return getTrainingUndoRemainingMs(form) > 0;
  }

  function isTrainingVisible(form) {
    const user = currentUser();
    if (!user || !form) return false;
    if (hasGlobalReadScope(user)) return true;
    return hasUnitAccess(form.unit, user) || form.fillerUsername === user.username;
  }

  function findExistingTrainingFormForUnitYear(unit, trainingYear, excludeId) {
    const safeUnit = String(unit || '').trim();
    const safeYear = String(trainingYear || '').trim();
    const skipId = String(excludeId || '').trim();
    if (!safeUnit || !safeYear) return null;
    return getAllTrainingForms()
      .filter((form) => form.unit === safeUnit && String(form.trainingYear || '').trim() === safeYear && form.id !== skipId)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0] || null;
  }

  function isTrainingRecordReadyForSubmit(record) {
    if (!record || !record.status) return false;
    if (record.status !== '在職') return true;
    if (!isTrainingBooleanValue(record.completedGeneral)) return false;
    if (!isTrainingBooleanValue(record.isInfoStaff)) return false;
    if (record.isInfoStaff === '是') return isTrainingBooleanValue(record.completedProfessional);
    return true;
  }

  function isTrainingRecordComplete(record) {
    if (!record || record.status !== '在職') return false;
    if (record.completedGeneral !== '是') return false;
    if (record.isInfoStaff === '是') return record.completedProfessional === '是';
    return record.isInfoStaff === '否';
  }

  function getTrainingRecordHint(record) {
    if (!record.status) return '請先選擇在職狀態';
    if (record.status !== '在職') return '非在職人員，不列入統計';
    if (!isTrainingBooleanValue(record.completedGeneral)) return '請填寫' + TRAINING_GENERAL_LABEL + '完成情形';
    if (!isTrainingBooleanValue(record.isInfoStaff)) return '請判定是否為' + TRAINING_INFO_STAFF_LABEL;
    if (record.isInfoStaff === '是' && !isTrainingBooleanValue(record.completedProfessional)) {
      return '請填寫' + TRAINING_PROFESSIONAL_LABEL + '完成情形';
    }
    if (isTrainingRecordComplete(record)) return '已符合完成條件';
    if (record.completedGeneral === '否') return '未完成' + TRAINING_GENERAL_LABEL;
    if (record.isInfoStaff === '是' && record.completedProfessional === '否') return '待補' + TRAINING_PROFESSIONAL_LABEL;
    return '尚未完成';
  }

  function getTrainingDecisionMeta(record) {
    if (!record.status) return { label: '待填資料', tone: 'pending' };
    if (record.status !== '在職') return { label: '不列計', tone: 'muted' };
    if (!isTrainingRecordReadyForSubmit(record)) return { label: '待補欄位', tone: 'pending' };
    if (isTrainingRecordComplete(record)) return { label: '已完成', tone: 'complete' };
    if (record.completedGeneral === '否') return { label: '通識未完成', tone: 'risk' };
    if (record.isInfoStaff === '是' && record.completedProfessional === '否') return { label: '專業未完成', tone: 'warning' };
    return { label: '未完成', tone: 'warning' };
  }

  function trainingDecisionBadge(record) {
    const meta = getTrainingDecisionMeta(record);
    return '<span class="training-judgement training-judgement--' + meta.tone + '">' + esc(meta.label) + '</span>';
  }

  function getTrainingProfessionalDisplay(record) {
    if (!record || record.status !== '在職') return '—';
    if (record.isInfoStaff === '否') return '不適用';
    return normalizeTrainingProfessionalValue(record.completedProfessional || record.completedInfo || '') || '—';
  }

  function computeTrainingSummary(records) {
    const rows = Array.isArray(records) ? records.map((row) => normalizeTrainingRecordRow(row, row.unit)) : [];
    const activeRows = rows.filter((row) => row.status === '在職');
    const completedRows = activeRows.filter((row) => isTrainingRecordComplete(row));
    const infoRows = activeRows.filter((row) => row.isInfoStaff === '是');
    const readyRows = activeRows.filter((row) => isTrainingRecordReadyForSubmit(row));
    const incompleteCount = activeRows.length - completedRows.length;
    const completionRate = activeRows.length > 0 ? Math.round((completedRows.length / activeRows.length) * 100) : 0;
    const professionalPendingCount = infoRows.filter((row) => row.completedProfessional !== '是').length;
    const missingStatusCount = rows.filter((row) => !row.status).length;
    const missingFieldCount = activeRows.filter((row) => !isTrainingRecordReadyForSubmit(row)).length;
    return {
      totalPeople: activeRows.length,
      activeCount: activeRows.length,
      totalRoster: rows.length,
      inactiveCount: rows.length - activeRows.length,
      completedCount: completedRows.length,
      readyCount: readyRows.length,
      incompleteCount,
      completionRate,
      reachRate: completionRate,
      reached: completedRows.length,
      infoStaffCount: infoRows.length,
      professionalPendingCount,
      missingStatusCount,
      missingFieldCount
    };
  }

  function trainingStatusBadge(status) {
    const cls = status === TRAINING_STATUSES.SUBMITTED
      ? 'badge-closed'
      : (status === TRAINING_STATUSES.RETURNED ? 'badge-overdue' : 'badge-pending');
    return '<span class="badge ' + cls + '"><span class="badge-dot"></span>' + status + '</span>';
  }

  function trainingSelectOptionsHtml(options, selected, placeholder) {
    const base = placeholder ? '<option value="">' + placeholder + '</option>' : '';
    return base + options.map((option) => '<option value="' + esc(option) + '" ' + (selected === option ? 'selected' : '') + '>' + esc(option) + '</option>').join('');
  }

  function csvCell(value) {
    const text = String(value === null || value === undefined ? '' : value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function downloadWorkbook(filename, sheets) {
    if (typeof window === 'undefined' || !window.XLSX) {
      toast('Excel 模組尚未載入，請重新整理頁面後再試', 'error');
      return false;
    }
    const workbook = window.XLSX.utils.book_new();
    (Array.isArray(sheets) ? sheets : []).forEach((sheet, index) => {
      const name = String(sheet?.name || `Sheet${index + 1}`).slice(0, 31) || `Sheet${index + 1}`;
      const worksheet = window.XLSX.utils.aoa_to_sheet(Array.isArray(sheet?.rows) ? sheet.rows : []);
      window.XLSX.utils.book_append_sheet(workbook, worksheet, name);
    });
    window.XLSX.writeFile(workbook, filename);
    return true;
  }

  function exportTrainingSummaryCsv(forms, filename) {
    const rows = forms.map((form) => {
      const summary = form.summary || computeTrainingSummary(form.records || []);
      return [
        form.id,
        form.statsUnit || getTrainingStatsUnit(form.unit),
        form.unit,
        form.trainingYear,
        form.status,
        form.fillerName,
        form.submitterPhone || '',
        form.submitterEmail || '',
        summary.activeCount || 0,
        summary.completedCount || 0,
        summary.incompleteCount || 0,
        (summary.completionRate || 0) + '%',
        fmt(form.fillDate),
        form.stepOneSubmittedAt ? fmtTime(form.stepOneSubmittedAt) : '',
        form.submittedAt ? fmtTime(form.submittedAt) : '',
        fmtTime(form.updatedAt)
      ];
    });
    downloadWorkbook(filename || ('資安教育訓練統計總表_' + new Date().toISOString().slice(0, 10) + '.xlsx'), [{
      name: '統計總表',
      rows: [['編號', '統計單位', '填報單位', '年度', '狀態', '經辦人', '聯絡電話', '聯絡信箱', '單位總人數(人)', '已完成人數(人)', '未完成人數(人)', '單位達成比率', '填表日期', '流程一完成時間', '整體完成時間', '最後更新']].concat(rows)
    }]);
  }

  function exportTrainingDetailCsv(form) {
    const rows = (form.records || []).map((row, index) => [form.id, form.statsUnit || getTrainingStatsUnit(form.unit), form.unit, form.trainingYear, form.fillerName, index + 1, row.name, row.l1Unit || '', row.unitName || '', row.identity || '', row.jobTitle || '', row.status || '', row.completedGeneral || '', row.isInfoStaff || '', getTrainingProfessionalDisplay(row), getTrainingRecordHint(row), row.note || '']);
    downloadWorkbook('資安教育訓練明細_' + form.id + '.xlsx', [{
      name: '逐人明細',
      rows: [['填報單編號', '統計單位', '填報單位', '年度', '經辦人', '序號', '姓名', '一級單位', '本職單位', '身分別', '職稱', '在職狀態', TRAINING_GENERAL_LABEL, TRAINING_INFO_STAFF_LABEL, TRAINING_PROFESSIONAL_LABEL, '判定說明', '備註']].concat(rows)
    }]);
  }

  function getRocDateParts(value) {
    const date = value ? new Date(value) : new Date();
    if (!Number.isFinite(date.getTime())) return { year: '', month: '', day: '' };
    return {
      year: String(date.getFullYear() - 1911),
      month: String(date.getMonth() + 1),
      day: String(date.getDate())
    };
  }

  function buildTrainingPrintHtml(payload) {
    const summary = payload.summary || computeTrainingSummary(payload.records || []);
    const unitName = payload.statsUnit || getTrainingStatsUnit(payload.unit);
    const rocDate = getRocDateParts(payload.fillDate);
    return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>資安教育訓練簽核表</title><style>body{font-family:"Noto Sans TC",sans-serif;color:#111827;margin:0;padding:24px}.sheet{max-width:960px;margin:0 auto}h1{font-size:24px;text-align:center;margin:0 0 18px}.meta,.summary{width:100%;border-collapse:collapse;margin-bottom:18px}.meta th,.meta td,.summary th,.summary td{border:1px solid #111827;padding:10px 12px;font-size:14px;vertical-align:top}.meta th,.summary th{background:#f8fafc;text-align:left;width:18%}.summary-note{display:block;margin-top:4px;font-size:12px;color:#475569;font-weight:400}.statement,.notes{font-size:13px;line-height:1.8;color:#111827}.notes-title{font-weight:700;margin:14px 0 6px}.notes ol{padding-left:20px;margin:6px 0 0}.sign-row{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px;align-items:end;margin-top:22px}.sign-box{border:2px solid #111827;height:120px;padding:12px;font-size:16px;display:flex;align-items:flex-start;justify-content:flex-start}</style></head><body><div class="sheet"><h1>' + esc(payload.trainingYear || '') + '年國立臺灣大學資通安全教育訓練執行情形</h1><table class="meta"><tr><th>一級單位</th><td>' + esc(unitName || '未指定') + '</td><th>填表日期</th><td>' + esc(rocDate.year) + '年' + esc(rocDate.month) + '月' + esc(rocDate.day) + '日</td></tr><tr><th>經辦人</th><td>' + esc(payload.fillerName || payload.submitterName || '') + '</td><th>聯絡電話</th><td>' + esc(payload.submitterPhone || '') + '</td></tr><tr><th>聯絡信箱</th><td colspan="3">' + esc(payload.submitterEmail || '') + '</td></tr></table><table class="summary"><tr><th>單位總人數(人)<span class="summary-note">（勿自行填寫）</span></th><th>單位達成比率<span class="summary-note">（勿自行填寫）</span></th><th>未完成人數(人)<span class="summary-note">（勿自行填寫）</span></th><th>已完成人數(人)<span class="summary-note">（勿自行填寫）</span></th></tr><tr><td>' + (summary.activeCount || 0) + '</td><td>' + (summary.completionRate || 0) + '%</td><td>' + (summary.incompleteCount || 0) + '</td><td>' + (summary.completedCount || 0) + '</td></tr></table><div class="statement">單位是否已留存單位人員教育訓練佐證：是，本單位已留存單位人員教育訓練佐證。</div><div class="notes"><div class="notes-title">資通安全教育訓練統計注意事項:</div><ol><li>此表單將會作為校內資通安全二方稽核依據,請單位確實辦理。</li><li>請單位自行留存單位人員教育訓練佐證,佐證將於資通安全二方稽核時抽查審閱。</li><li>教育訓練佐證應包含:人員姓名、人員職稱、已完成之課程名稱、認證時數之單位、認證時數、完成課程之日期。</li><li>教育訓練佐證範例(皆須含上述內容):課程證書、認證時數之單位往來信件截圖、相關教育訓練系統截圖(如:公務人員終身學習網站-個人資料夾-查詢學習時數、e等公務員學習平台-個人專區-學習紀錄查詢時數、臺灣大學資通盤點系統-其他服務-研習證明-證書清單)。</li><li>線上資安教育訓練資源可參考本校網站:https://isms.ntu.edu.tw/e-learning.html (網站路徑:計中網站-資安專區-資通安全管理-教育訓練-線上課程資源)。</li></ol></div><div class="sign-row"><div></div><div class="sign-box">一級主管</div></div></div></body></html>';
  }

  function printTrainingSheet(payload) {
    const win = window.open('', '_blank', 'width=980,height=800');
    if (!win) {
      toast('無法開啟列印視窗，請確認瀏覽器未封鎖彈出視窗', 'error');
      return;
    }
    win.document.open();
    win.document.write(buildTrainingPrintHtml(payload));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }

  function normalizeTrainingImportHeader(value) {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[\s\u3000]+/g, '')
      .replace(/[()（）]/g, '')
      .replace(/[／/]/g, '')
      .replace(/[._\-]/g, '');
  }

  function buildTrainingRosterHeaderMap(cells) {
    const headerAliases = {
      name: ['姓名', '人員姓名', 'name'],
      unitName: ['本職單位', '服務單位', '單位', '本單位', '任職單位'],
      identity: ['身分別', '身份別', '身分類別', '人員身分', '身份類別'],
      jobTitle: ['職稱', '職務', 'title'],
      unit: ['填報單位', '受填報單位', '單位代填', '歸屬單位'],
      statsUnit: ['統計單位', '一級單位']
    };
    const normalizedCells = (Array.isArray(cells) ? cells : []).map((cell) => normalizeTrainingImportHeader(cell));
    const map = {};
    Object.keys(headerAliases).forEach((key) => {
      const idx = normalizedCells.findIndex((cell) => headerAliases[key].some((alias) => cell === normalizeTrainingImportHeader(alias)));
      if (idx >= 0) map[key] = idx;
    });
    return map.name >= 0 ? map : null;
  }

  function resolveTrainingImportTargetUnit(defaultUnit, rawUnit, rawStatsUnit) {
    const selectedUnit = String(defaultUnit || '').trim();
    const unitText = String(rawUnit || '').trim().replace(/\//g, '／');
    const statsText = String(rawStatsUnit || '').trim().replace(/\//g, '／');
    if (unitText) {
      if (getOfficialUnitMeta(unitText) || getApprovedCustomUnits().includes(unitText)) return unitText;
      if (statsText && getOfficialUnitMeta(composeUnitValue(statsText, unitText))) return composeUnitValue(statsText, unitText);
    }
    if (selectedUnit) return selectedUnit;
    if (statsText) {
      if (getOfficialUnitMeta(statsText) || getApprovedCustomUnits().includes(statsText)) return statsText;
    }
    return '';
  }

  function parseTrainingRosterCells(cells, unit, headerMap) {
    const clean = (Array.isArray(cells) ? cells : []).map((part) => String(part || '').replace(/^\uFEFF/, '').trim());
    const getCell = (key, fallbackIndex) => {
      if (headerMap && Number.isInteger(headerMap[key])) return clean[headerMap[key]] || '';
      return clean[fallbackIndex] || '';
    };
    const firstCell = getCell('name', 0);
    if (!firstCell || firstCell === '姓名') return null;
    const importedUnit = resolveTrainingImportTargetUnit(unit, getCell('unit', -1), getCell('statsUnit', -1));
    return {
      unit: importedUnit,
      name: firstCell,
      unitName: getCell('unitName', 1) || getTrainingJobUnit(importedUnit || unit),
      identity: getCell('identity', 2) || '',
      jobTitle: getCell('jobTitle', 3) || ''
    };
  }

  function parseTrainingRosterImport(text, unit) {
    const rows = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => (line.includes('\t') ? line.split('\t') : line.split(',')));
    const headerMap = rows.length ? buildTrainingRosterHeaderMap(rows[0]) : null;
    const dataRows = headerMap ? rows.slice(1) : rows;
    return dataRows.map((parts) => parseTrainingRosterCells(parts, unit, headerMap)).filter((row) => row && row.name);
  }

  function parseTrainingRosterWorkbook(file, unit) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve([]);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          if (typeof window === 'undefined' || !window.XLSX) throw new Error('Excel 模組尚未載入');
          const workbook = window.XLSX.read(event.target.result, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            resolve([]);
            return;
          }
          const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, raw: false, defval: '' });
          const headerMap = rows.length ? buildTrainingRosterHeaderMap(rows[0]) : null;
          const dataRows = headerMap ? rows.slice(1) : rows;
          resolve(dataRows.map((cells) => parseTrainingRosterCells(cells, unit, headerMap)).filter((row) => row && row.name));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('無法讀取匯入檔案'));
      reader.readAsArrayBuffer(file);
    });
  }

  function mergeTrainingRows(targetUnit, carryRows) {
    const carry = Array.isArray(carryRows) ? carryRows.map((row) => normalizeTrainingRecordRow(row, targetUnit)) : [];
    const rosterRows = targetUnit ? getTrainingRosterByUnit(targetUnit).map((row) => {
      const existing = carry.find((item) => (item.rosterId && item.rosterId === row.id) || item.name === row.name);
      return normalizeTrainingRecordRow({ ...row, ...existing, rosterId: row.id, unit: targetUnit, statsUnit: row.statsUnit || getTrainingStatsUnit(targetUnit), unitName: existing?.unitName || row.unitName || getTrainingJobUnit(targetUnit), identity: existing?.identity || row.identity || '', jobTitle: existing?.jobTitle || row.jobTitle || '', source: existing?.source || row.source || 'import', status: existing?.status || '', completedGeneral: existing?.completedGeneral || '', isInfoStaff: existing?.isInfoStaff || '', completedProfessional: existing?.completedProfessional || '', note: existing?.note || '' }, targetUnit);
    }) : [];
    carry.forEach((row) => {
      const exists = rosterRows.some((item) => (row.rosterId && item.rosterId === row.rosterId) || item.name === row.name);
      if (!exists) rosterRows.push(normalizeTrainingRecordRow(row, targetUnit || row.unit));
    });
    return rosterRows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }


  function handleRoute() { return getShellModule().handleRoute(); }

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
  getDataModule().migrateAllStores();
  seedData();
  ensurePrimaryAdminProfile();
  getTrainingModule().seedTrainingData();
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('resize', function () { if (!isMobileViewport()) closeSidebar(); });
  window.addEventListener('load', refreshIcons);
  renderApp();
  refreshIcons();
  if (typeof window !== 'undefined') {
    window.__APP_READY__ = true;
  }

})();
