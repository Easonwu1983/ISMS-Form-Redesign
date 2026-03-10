// =============================================
// ISMS Internal Audit Tracking System - v4
// =============================================
(function () {
  'use strict';
  const DATA_KEY = 'cats_data', AUTH_KEY = 'cats_auth', CHECKLIST_KEY = 'cats_checklists', TEMPLATE_KEY = 'cats_checklist_template', TRAINING_KEY = 'cats_training_hours', LOGIN_LOG_KEY = 'cats_login_log', UNIT_REVIEW_KEY = 'cats_unit_review';
  const STATUSES = { CREATED: '開立', PENDING: '待矯正', PROPOSED: '已提案', REVIEWING: '審核中', TRACKING: '追蹤中', CLOSED: '結案' };
  const STATUS_CLASSES = { [STATUSES.CREATED]: 'created', [STATUSES.PENDING]: 'pending', [STATUSES.PROPOSED]: 'proposed', [STATUSES.REVIEWING]: 'reviewing', [STATUSES.TRACKING]: 'tracking', [STATUSES.CLOSED]: 'closed' };
  const STATUS_FLOW = [STATUSES.CREATED, STATUSES.PENDING, STATUSES.PROPOSED, STATUSES.REVIEWING, STATUSES.TRACKING, STATUSES.CLOSED];
  const ROLES = { ADMIN: '最高管理員', UNIT_ADMIN: '單位管理員', REPORTER: '填報人', VIEWER: '跨單位檢視者' };
  const ROLE_BADGE = { [ROLES.ADMIN]: 'badge-admin', [ROLES.UNIT_ADMIN]: 'badge-unit-admin', [ROLES.REPORTER]: 'badge-reporter', [ROLES.VIEWER]: 'badge-viewer' };
  const TRAINING_STATUSES = { DRAFT: '暫存', PENDING_SIGNOFF: '待簽核', SUBMITTED: '已完成填報', RETURNED: '退回更正' };
  const TRAINING_EMPLOYEE_STATUS = ['在職', '離職', '退休', '留職停薪', '單位調職'];
  const TRAINING_BOOLEAN_OPTIONS = ['是', '否'];
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

  function emptyUnitReviewStore() {
    return { approvedUnits: [], history: [] };
  }

  function loadUnitReviewStore() {
    const raw = readCachedJson(UNIT_REVIEW_KEY, emptyUnitReviewStore);
    if (!raw || typeof raw !== 'object') return emptyUnitReviewStore();
    if (!Array.isArray(raw.approvedUnits)) raw.approvedUnits = [];
    if (!Array.isArray(raw.history)) raw.history = [];
    return raw;
  }

  function saveUnitReviewStore(store) {
    writeCachedJson(UNIT_REVIEW_KEY, store);
  }

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
  function normalizeCorrectionItem(item, normalizedItems) {
    const next = { ...(item || {}) };
    let changed = false;

    const proposerUnitCode = getUnitCode(next.proposerUnit);
    const handlerUnitCode = getUnitCode(next.handlerUnit);
    const documentNo = buildCorrectionDocumentNo(next.handlerUnit, next.proposerDate || next.createdAt || next.updatedAt);

    if (proposerUnitCode && next.proposerUnitCode !== proposerUnitCode) {
      next.proposerUnitCode = proposerUnitCode;
      changed = true;
    }
    if (handlerUnitCode && next.handlerUnitCode !== handlerUnitCode) {
      next.handlerUnitCode = handlerUnitCode;
      changed = true;
    }
    if (documentNo && next.documentNo !== documentNo) {
      next.documentNo = documentNo;
      changed = true;
    }

    const parsedAutoId = parseCorrectionAutoId(next.id);
    if (parsedAutoId) {
      if (next.documentNo !== parsedAutoId.documentNo) {
        next.documentNo = parsedAutoId.documentNo;
        changed = true;
      }
      if (next.caseSeq !== parsedAutoId.sequence) {
        next.caseSeq = parsedAutoId.sequence;
        changed = true;
      }
      return { item: next, changed };
    }

    if (/^CAR-\d+$/i.test(String(next.id || '').trim()) && documentNo) {
      const sequence = getNextCorrectionSequence(documentNo, normalizedItems);
      const autoId = buildAutoCarIdByDocument(documentNo, sequence);
      if (next.id !== autoId) {
        next.id = autoId;
        changed = true;
      }
      if (next.caseSeq !== sequence) {
        next.caseSeq = sequence;
        changed = true;
      }
    }

    return { item: next, changed };
  }
  function parseUserUnits(value) {
    if (Array.isArray(value)) return Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean)));
    if (typeof value === 'string') return Array.from(new Set(value.split(/\r?\n|,|;|\|/).map((entry) => String(entry || '').trim()).filter(Boolean)));
    return [];
  }
  function normalizeUserRole(role) {
    if (role === ROLES.ADMIN) return ROLES.ADMIN;
    if (role === ROLES.VIEWER || String(role || '').trim().toLowerCase() === 'super_viewer') return ROLES.VIEWER;
    if (role === ROLES.UNIT_ADMIN || role === ROLES.REPORTER) return role;
    return ROLES.REPORTER;
  }
  function getAuthorizedUnits(user) {
    const units = parseUserUnits(user?.units);
    if (units.length) return units;
    const unit = String(user?.unit || '').trim();
    return unit ? [unit] : [];
  }
  function getActiveUnit(user) {
    const units = getAuthorizedUnits(user);
    if (!units.length) return '';
    const candidate = String(user?.activeUnit || '').trim();
    return units.includes(candidate) ? candidate : units[0];
  }
  function normalizeUserRecord(user) {
    const role = normalizeUserRole(user?.role);
    const units = getAuthorizedUnits(user);
    return {
      ...user,
      role,
      units,
      unit: units[0] || '',
      activeUnit: role === ROLES.ADMIN ? '' : getActiveUnit({ ...user, units })
    };
  }
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
  function loadData() {
    const data = readCachedJson(DATA_KEY, createDefaultData);
    if (!Array.isArray(data.users)) data.users = DEFAULT_USERS.map((u) => ({ ...u }));
    if (!Array.isArray(data.items)) data.items = [];
    if (!Number.isFinite(Number(data.nextId))) data.nextId = 1;
    let changed = false;
    data.users = data.users.map((user) => normalizeUserRecord(user));
    const normalizedItems = [];
    data.items.forEach((item) => {
      const normalized = normalizeCorrectionItem(item, normalizedItems);
      normalizedItems.push(normalized.item);
      if (normalized.changed) changed = true;
    });
    data.items = normalizedItems;
    if (changed) saveData(data);
    return data;
  }
  function saveData(d) { writeCachedJson(DATA_KEY, d); }
  function getAllItems() { return loadData().items.slice(); }
  function getItem(id) { return loadData().items.find(i => i.id === id); }
  function addItem(item) { const d = loadData(); d.items.push(item); saveData(d); }
  function updateItem(id, updates) { const d = loadData(); const i = d.items.findIndex(x => x.id === id); if (i >= 0) { d.items[i] = { ...d.items[i], ...updates }; saveData(d); } }
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
  function getUsers() { return loadData().users.slice().map((user) => normalizeUserRecord(user)); }
  function addUser(user) { const d = loadData(); d.users.push(normalizeUserRecord(user)); saveData(d); }
  function updateUser(un, upd) { const d = loadData(); const i = d.users.findIndex(u => u.username === un); if (i >= 0) { d.users[i] = normalizeUserRecord({ ...d.users[i], ...upd }); saveData(d); } }
  function deleteUser(un) { const d = loadData(); d.users = d.users.filter(u => u.username !== un); saveData(d); }
  function findUser(un) { const user = loadData().users.find(u => u.username === un); return user ? normalizeUserRecord(user) : null; }
  function findUserByEmail(em) { const user = loadData().users.find(u => u.email && u.email.toLowerCase() === em.toLowerCase()); return user ? normalizeUserRecord(user) : null; }
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
  const ROUTE_WHITELIST = {
    dashboard: { title: '\u5100\u8868\u677f', allow: () => !!currentUser(), render: () => renderDashboard() },
    list: { title: '\u77ef\u6b63\u55ae\u5217\u8868', allow: () => !!currentUser(), render: () => renderList() },
    create: { title: '\u958b\u7acb\u77ef\u6b63\u55ae', allow: () => canCreateCAR(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u958b\u7acb\u77ef\u6b63\u55ae\u6b0a\u9650', render: () => renderCreate() },
    detail: { title: '\u77ef\u6b63\u55ae\u8a73\u60c5', allow: () => !!currentUser(), render: (param) => renderDetail(param) },
    respond: { title: '\u56de\u586b\u77ef\u6b63\u63aa\u65bd', allow: () => !!currentUser(), render: (param) => renderRespond(param) },
    tracking: { title: '\u8ffd\u8e64\u76e3\u63a7', allow: () => !!currentUser(), render: (param) => renderTracking(param) },
    users: { title: '\u5e33\u865f\u7ba1\u7406', allow: () => canManageUsers(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u5e33\u865f\u7ba1\u7406\u6b0a\u9650', render: () => renderUsers() },
    'login-log': { title: '\u767b\u5165\u7d00\u9304', allow: () => canManageUsers(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u6aa2\u8996\u767b\u5165\u7d00\u9304\u6b0a\u9650', render: () => renderLoginLog() },
    checklist: { title: '\u5167\u7a3d\u6aa2\u6838\u8868', allow: () => !!currentUser(), render: () => renderChecklistList() },
    'checklist-fill': { title: '\u586b\u5831\u6aa2\u6838\u8868', allow: () => canFillChecklist(), fallback: 'checklist', deniedMessage: '\u60a8\u6c92\u6709\u586b\u5831\u6aa2\u6838\u8868\u6b0a\u9650', render: (param) => renderChecklistFill(param) },
    'checklist-detail': { title: '\u6aa2\u6838\u8868\u8a73\u60c5', allow: () => !!currentUser(), render: (param) => renderChecklistDetail(param) },
    'checklist-manage': { title: '\u6aa2\u6838\u8868\u7ba1\u7406', allow: () => isAdmin(), fallback: 'dashboard', deniedMessage: '\u50c5\u6700\u9ad8\u7ba1\u7406\u8005\u53ef\u7ba1\u7406\u6aa2\u6838\u8868', render: () => renderChecklistManage() },
    'unit-review': { title: '\u55ae\u4f4d\u6cbb\u7406', allow: () => isAdmin(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u7ba1\u7406\u55ae\u4f4d\u6cbb\u7406\u7684\u6b0a\u9650', render: () => renderUnitReview() },
    training: { title: '\u8cc7\u5b89\u6559\u80b2\u8a13\u7df4\u7d71\u8a08', allow: () => !!currentUser(), render: () => renderTraining() },
    'training-fill': { title: '\u586b\u5831\u8cc7\u5b89\u6559\u80b2\u8a13\u7df4\u7d71\u8a08', allow: () => canFillTraining(), fallback: 'training', deniedMessage: '\u60a8\u6c92\u6709\u586b\u5831\u6559\u80b2\u8a13\u7df4\u7684\u6b0a\u9650', render: (param) => renderTrainingFill(param) },
    'training-detail': { title: '\u8cc7\u5b89\u6559\u80b2\u8a13\u7df4\u7d71\u8a08\u8a73\u60c5', allow: () => !!currentUser(), render: (param) => renderTrainingDetail(param) },
    'training-roster': { title: '\u6559\u80b2\u8a13\u7df4\u540d\u55ae\u7ba1\u7406', allow: () => isAdmin(), fallback: 'training', deniedMessage: '\u50c5\u6700\u9ad8\u7ba1\u7406\u8005\u53ef\u7ba1\u7406\u6559\u80b2\u8a13\u7df4\u540d\u55ae', render: () => renderTrainingRoster() }
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
      '<tr><td>跨單位檢視者</td><td>viewer1</td><td>viewer123</td></tr>' +
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
      '<a class="nav-item ' + (r.page === 'training' || r.page === 'training-fill' || r.page === 'training-detail' || r.page === 'training-roster' ? 'active' : '') + '" href="#training"><span class="nav-icon">' + ic('graduation-cap') + '</span>資安教育訓練統計</a></div>';
    var opNav = '';
    if (canCreateCAR()) opNav += '<a class="nav-item ' + (r.page === 'create' ? 'active' : '') + '" href="#create"><span class="nav-icon">' + ic('pen-tool') + '</span>開立矯正單</a>';
    if (canFillChecklist()) opNav += '<a class="nav-item ' + (r.page === 'checklist-fill' ? 'active' : '') + '" href="#checklist-fill"><span class="nav-icon">' + ic('edit-3') + '</span>填報檢核表</a>';
    if (opNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">操作</div>' + opNav + '</div>';
    var sysNav = '';
    if (canManageUsers()) sysNav += '<a class="nav-item ' + (r.page === 'users' ? 'active' : '') + '" href="#users"><span class="nav-icon">' + ic('users') + '</span>\u5e33\u865f\u7ba1\u7406</a>';
    if (canManageUsers()) sysNav += '<a class="nav-item ' + (r.page === 'login-log' ? 'active' : '') + '" href="#login-log"><span class="nav-icon">' + ic('shield-check') + '</span>\u767b\u5165\u7d00\u9304</a>';
    if (isAdmin()) sysNav += '<a class="nav-item ' + (r.page === 'checklist-manage' ? 'active' : '') + '" href="#checklist-manage"><span class="nav-icon">' + ic('settings') + '</span>\u6aa2\u6838\u8868\u7ba1\u7406</a>';
    if (isAdmin()) sysNav += '<a class="nav-item ' + (r.page === 'training-roster' ? 'active' : '') + '" href="#training-roster"><span class="nav-icon">' + ic('users-round') + '</span>\u6559\u80b2\u8a13\u7df4\u540d\u55ae\u7ba1\u7406</a>';
    if (isAdmin()) sysNav += '<a class="nav-item ' + (r.page === 'unit-review' ? 'active' : '') + '" href="#unit-review"><span class="nav-icon">' + ic('building-2') + '</span>\u55ae\u4f4d\u6cbb\u7406</a>';
    if (sysNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">\u7cfb\u7d71\u7ba1\u7406</div>' + sysNav + '</div>';
    var sidebarEl = document.getElementById('sidebar'); sidebarEl.innerHTML = '<div class="sidebar-logo"><span class="sidebar-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><div class="sidebar-brand-text"><h1>內部稽核管考追蹤系統</h1><p>ISMS Corrective Action</p></div></div><nav class="sidebar-nav">' + nav + '</nav><div class="sidebar-footer"><span class="badge-role ' + ROLE_BADGE[u.role] + '">' + u.role + '</span></div>';
    sidebarEl.querySelectorAll('a.nav-item').forEach(function (link) {
      link.addEventListener('click', function () { if (isMobileViewport()) closeSidebar(); });
    });
  }

  function renderHeader() {
    var u = currentUser(); if (!u) return; var r = getRoute();
    var switchHtml = '';
    if (canSwitchAuthorizedUnit(u)) {
      switchHtml = '<label class="header-scope-switch"><span class="header-scope-label">目前單位</span><select class="form-select header-scope-select" id="header-unit-switch">' +
        getAuthorizedUnits(u).map(function (unit) { return '<option value="' + esc(unit) + '" ' + (getScopedUnit(u) === unit ? 'selected' : '') + '>' + esc(unit) + '</option>'; }).join('') +
        '</select></label>';
    }
    document.getElementById('header').innerHTML = '<div class="header-left"><button type="button" class="header-menu-btn" onclick="window._toggleSidebar()" aria-label="open menu">' + ic('menu') + '</button><span class="header-title">' + getRouteTitle(r.page) + '</span></div><div class="header-right">' + switchHtml + '<div class="header-user"><span class="header-user-name">' + esc(u.name) + '</span><span class="header-user-role">' + u.role + '</span><div class="header-user-avatar">' + esc(u.name[0]) + '</div></div><button class="btn-logout" onclick="window._logout()">\u767b\u51fa</button></div>';
    var switcher = document.getElementById('header-unit-switch');
    if (switcher) {
      switcher.addEventListener('change', function (event) {
        if (switchCurrentUserUnit(event.target.value)) handleRoute();
      });
    }
  }
  window._logout = function () { logout(); };
  window._toggleSidebar = function () { toggleSidebar(); };
  window._closeSidebar = function () { closeSidebar(); };

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
      return '<tr onclick="location.hash=\'detail/' + i.id + '\'"><td class="record-id-col">' + renderCopyIdCell(i.id, '矯正單號', true) + '</td><td>' + esc(i.problemDesc || '').substring(0, 34) + '</td><td><span class="badge badge-' + (isOverdue(i) ? 'overdue' : STATUS_CLASSES[i.status]) + '"><span class="badge-dot"></span>' + (isOverdue(i) ? '已逾期' : i.status) + '</span></td><td>' + esc(i.handlerName) + '</td><td>' + fmt(i.correctiveDueDate) + '</td><td>' + fmt(getCurrentNextTrackingDate(i)) + '</td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty-state" style="padding:40px"><div class="empty-state-icon">' + ic('inbox') + '</div><div class="empty-state-title">尚無矯正單</div></div></td></tr>';

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
    var rows = filtered.length ? filtered.map(function (i) { return '<tr onclick="location.hash=\'detail/' + i.id + '\'"><td class="record-id-col">' + renderCopyIdCell(i.id, '矯正單號', true) + '</td><td>' + esc(i.deficiencyType) + '</td><td>' + esc(i.source) + '</td><td><span class="badge badge-' + (isOverdue(i) ? 'overdue' : STATUS_CLASSES[i.status]) + '"><span class="badge-dot"></span>' + (isOverdue(i) && i.status !== STATUSES.CLOSED ? '已逾期' : i.status) + '</span></td><td>' + esc(i.proposerName) + '</td><td>' + esc(i.handlerName) + '</td><td>' + fmt(i.correctiveDueDate) + '</td><td>' + fmt(getCurrentNextTrackingDate(i)) + '</td></tr>'; }).join('') : '<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">' + ic('search') + '</div><div class="empty-state-title">沒有符合條件的矯正單</div></div></td></tr>';
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
    if (canRespond) btns += `<a href="#respond/${item.id}" class="btn btn-primary">${ic('edit-3', 'icon-sm')} 回填矯正措施</a>`;
    if (item.status === STATUSES.PROPOSED && canReview()) btns += `<button class="btn btn-primary" onclick="window._cs('${item.id}','${STATUSES.REVIEWING}')">${ic('eye', 'icon-sm')} 進入審核</button>`;
    if (item.status === STATUSES.REVIEWING && canReview()) {
      btns += `<button class="btn btn-success" onclick="window._cs('${item.id}','${STATUSES.CLOSED}')">${ic('check', 'icon-sm')} 審核通過結案</button>`;
      btns += `<button class="btn btn-warning" onclick="window._cs('${item.id}','${STATUSES.TRACKING}')">${ic('eye', 'icon-sm')} 轉為追蹤</button>`;
      btns += `<button class="btn btn-danger" onclick="window._cs('${item.id}','${STATUSES.PENDING}')">${ic('corner-up-left', 'icon-sm')} 退回重填</button>`;
    }
    if (canFillTracking) btns += `<a href="#tracking/${item.id}" class="btn btn-primary">${ic('clipboard-check', 'icon-sm')} 填報追蹤結果</a>`;
    if (canReviewTracking) {
      btns += `<button class="btn btn-success" onclick="window._reviewTracking('${item.id}','close')">${ic('check', 'icon-sm')} 同意結案</button>`;
      btns += `<button class="btn btn-warning" onclick="window._reviewTracking('${item.id}','continue')">${ic('refresh-cw', 'icon-sm')} 同意繼續追蹤</button>`;
    }

    const renderEvidenceList = (files, emptyText = '尚無佐證') => files && files.length
      ? `<div class="file-preview-list">${files.map(ev => {
        const preview = ev.type && ev.type.startsWith('image/')
          ? `<img src="${ev.data}" alt="${esc(ev.name)}">`
          : `<div class="file-pdf-icon">${ic('file-box')}</div>`;
        return `<div class="file-preview-item">${preview}<div class="file-name">${esc(ev.name)}</div><div class="file-preview-actions"><a class="btn btn-sm btn-secondary" href="${ev.data}" target="_blank" rel="noopener">預覽</a><a class="btn btn-sm btn-secondary" href="${ev.data}" download="${esc(ev.name)}">下載</a></div></div>`;
      }).join('')}</div>`
      : `<p style="color:var(--text-muted);font-size:.88rem">${emptyText}</p>`;

    const evHtml = renderEvidenceList(item.evidence, '尚無佐證');
    const historyList = item.history || [];
    const tl = historyList.map((h, index) => {
      let actor = h.user || '';
      if (!actor || actor === '系統') {
        const linked = historyList.slice(0, index).reverse().find((entry) => entry.time === h.time && entry.user && entry.user !== '系統');
        if (linked) actor = linked.user;
      }
      return `<div class="timeline-item"><div class="timeline-time">${fmtTime(h.time)}</div><div class="timeline-text">${esc(h.action)}${actor ? ` - ${esc(actor)}` : ''}</div></div>`;
    }).reverse().join('');

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
      ${canReviewTracking ? `<div class="form-actions"><button type="button" class="btn btn-success" onclick="window._reviewTracking('${item.id}','close')">${ic('check', 'icon-sm')} 同意結案</button><button type="button" class="btn btn-warning" onclick="window._reviewTracking('${item.id}','continue')">${ic('refresh-cw', 'icon-sm')} 同意繼續追蹤</button></div>` : `<div class="detail-section"><div class="detail-content" style="color:var(--text-muted)">${isHandler ? '已送出追蹤提報，待管理者審核。' : '目前已有追蹤提報待管理者審核。'}</div></div>`}
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
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('paperclip', 'icon-sm')} 佐證文件</span></div>${evHtml}</div>
      ${pendingTrackingHtml}
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('git-branch', 'icon-sm')} 追蹤監控</span></div>${tkHtml}</div>
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('history', 'icon-sm')} 歷程紀錄</span></div><div class="timeline">${tl}</div></div>
    </div>`;
    refreshIcons();
    bindCopyButtons();
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
    const updates = { status: ns, updatedAt: now, pendingTracking: null, history: [...item.history, { time: now, action: `狀態變更為「${ns}」`, user: u.name }] };
    updates.closedDate = ns === STATUSES.CLOSED ? now : null;
    updateItem(id, updates);
    toast(`狀態已變更為「${ns}」`);
    renderDetail(id);
    renderSidebar();
    refreshIcons();
  };

  window._reviewTracking = function (id, decision) {
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
  function renderUsers() {
    if (!canManageUsers()) { navigate('dashboard'); return; }
    const users = getUsers();
    const rows = users.map(u => `<tr><td style="font-weight:500;color:var(--text-primary)">${esc(u.username)}</td><td>${esc(u.name)}</td><td><span class="badge-role ${ROLE_BADGE[u.role]}">${u.role}</span></td><td>${esc(u.unit || '未指定')}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(formatUserUnitSummary(u))}</td><td style="font-size:.82rem;color:var(--text-secondary)">${esc(u.email || '')}</td><td><div class="user-actions">${u.username !== 'admin' ? `<button class="btn btn-sm btn-secondary" onclick="window._editUser('${u.username}')">${ic('edit-2', 'btn-icon-svg')}</button><button class="btn btn-sm btn-danger" onclick="window._delUser('${u.username}')">${ic('trash-2', 'btn-icon-svg')}</button>` : ''}</div></td></tr>`).join('');
    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header"><div><h1 class="page-title">帳號管理</h1><p class="page-subtitle">管理角色、主要單位與多單位授權範圍</p></div><button class="btn btn-primary" onclick="window._addUser()">${ic('user-plus', 'icon-sm')} 新增使用者</button></div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th>帳號</th><th>姓名</th><th>角色</th><th>主要單位</th><th>授權單位</th><th>信箱</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
  }
  function showUserModal(eu) {
    const isE = !!eu; const title = isE ? '編輯使用者' : '新增使用者'; const mr = document.getElementById('modal-root'); const units = getAuthorizedUnits(eu); const initUnit = units[0] || '';
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal"><div class="modal-header"><span class="modal-title">${title}</span><button class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-root').innerHTML=''">✕</button></div><form id="user-form">
      <div class="form-group"><label class="form-label form-required">帳號</label><input type="text" class="form-input" id="u-username" value="${isE ? esc(eu.username) : ''}" ${isE ? 'readonly' : ''} required></div>
      <div class="form-group"><label class="form-label form-required">姓名</label><input type="text" class="form-input" id="u-name" value="${isE ? esc(eu.name) : ''}" required></div>
      <div class="form-group"><label class="form-label form-required">電子信箱</label><input type="email" class="form-input" id="u-email" value="${isE ? esc(eu.email || '') : ''}" required></div>
      <div class="form-row"><div class="form-group"><label class="form-label form-required">角色</label><select class="form-select" id="u-role" required><option value="${ROLES.REPORTER}" ${isE && eu.role === ROLES.REPORTER ? 'selected' : ''}>填報人</option><option value="${ROLES.UNIT_ADMIN}" ${isE && eu.role === ROLES.UNIT_ADMIN ? 'selected' : ''}>單位管理員</option><option value="${ROLES.VIEWER}" ${isE && eu.role === ROLES.VIEWER ? 'selected' : ''}>跨單位檢視者</option><option value="${ROLES.ADMIN}" ${isE && eu.role === ROLES.ADMIN ? 'selected' : ''}>最高管理員</option></select></div>
      <div class="form-group"><label class="form-label" id="u-unit-label">主要單位</label>${buildUnitCascadeControl('u-unit', initUnit, false, false)}</div></div>
      <div class="form-group"><label class="form-label">額外授權單位</label><textarea class="form-textarea" id="u-units" rows="4" placeholder="每行一個單位，可用於跨單位代理">${esc(units.slice(1).join('\n'))}</textarea><div class="form-hint">系統不另外做代理模組，直接以授權單位陣列決定可切換單位。</div></div>
      <div class="form-group"><label class="form-label ${isE ? '' : 'form-required'}">${isE ? '密碼（留空不修改）' : '密碼'}</label><input type="text" class="form-input" id="u-pass" ${isE ? '' : 'required'}></div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">${isE ? ic('save', 'icon-sm') + ' 儲存' : ic('plus', 'icon-sm') + ' 新增'}</button><button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-root').innerHTML=''">取消</button></div>
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
    document.getElementById('modal-bg').addEventListener('click', e => { if (e.target === e.currentTarget) mr.innerHTML = ''; });
    document.getElementById('user-form').addEventListener('submit', e => {
      e.preventDefault();
      const un = document.getElementById('u-username').value.trim(), nm = document.getElementById('u-name').value.trim(), em = document.getElementById('u-email').value.trim(), rl = document.getElementById('u-role').value, ut = document.getElementById('u-unit').value.trim(), extraUnits = parseUserUnits(document.getElementById('u-units').value), pw = document.getElementById('u-pass').value;
      const finalUnits = rl === ROLES.VIEWER ? Array.from(new Set([ut, ...extraUnits].filter(Boolean))) : Array.from(new Set([ut, ...extraUnits].filter(Boolean)));
      if (rl !== ROLES.VIEWER && !finalUnits.length) { toast('請至少指定一個授權單位', 'error'); return; }
      const payload = { name: nm, email: em, role: rl, unit: finalUnits[0] || '', units: finalUnits, activeUnit: finalUnits[0] || '' };
      if (pw) payload.password = pw;
      if (isE) { updateUser(un, payload); toast('使用者已更新'); }
      else { if (findUser(un)) { toast('帳號已存在', 'error'); return; } addUser({ username: un, password: pw, ...payload }); toast('使用者已新增'); }
      mr.innerHTML = ''; renderUsers(); refreshIcons();
    });
  }
  window._addUser = () => showUserModal(null);
  window._editUser = (un) => showUserModal(findUser(un));
  window._delUser = (un) => { if (confirm(`確定刪除使用者「${un}」？`)) { deleteUser(un); toast('使用者已刪除'); renderUsers(); } };
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
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal unit-review-modal"><div class="modal-header"><span class="modal-title">自訂單位引用明細</span><button class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-root').innerHTML=''">✕</button></div><div class="review-modal-head"><div class="review-unit-name">${esc(entry.unit)}</div><div class="review-modal-subtitle">共 ${entry.count} 筆引用，涵蓋 ${esc(formatUnitScopeSummary(entry.scopes))}</div></div><ul class="review-ref-list">${refs}</ul></div></div>`;
    document.getElementById('modal-bg').addEventListener('click', (e) => { if (e.target === e.currentTarget) mr.innerHTML = ''; });
  }

  function showUnitMergeModal(unit) {
    const entry = getCustomUnitRegistry().find((item) => item.unit === unit);
    if (!entry) { toast('找不到此自訂單位', 'error'); return; }

    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-backdrop" id="modal-bg"><div class="modal unit-review-modal"><div class="modal-header"><span class="modal-title">合併自訂單位</span><button class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-root').innerHTML=''">✕</button></div><div class="review-callout compact"><span class="review-callout-icon">${ic('git-merge', 'icon-sm')}</span><div><strong>${esc(entry.unit)}</strong> 目前共有 ${entry.count} 筆引用，合併後會同步更新帳號、矯正單、檢核表與教育訓練資料。</div></div><form id="unit-merge-form"><div class="form-group"><label class="form-label">來源單位</label><input type="text" class="form-input" value="${esc(entry.unit)}" readonly></div><div class="form-group"><label class="form-label form-required">合併目標</label>${buildUnitCascadeControl('unit-merge-target', '', false, true)}<div class="form-hint">可選正式單位，或使用「其他」輸入新的標準名稱。</div></div><div class="form-actions"><button type="submit" class="btn btn-primary">${ic('git-merge', 'icon-sm')} 立即合併</button><button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-root').innerHTML=''">取消</button></div></form></div></div>`;
    initUnitCascade('unit-merge-target', '', { disabled: false });
    document.getElementById('modal-bg').addEventListener('click', (e) => { if (e.target === e.currentTarget) mr.innerHTML = ''; });
    document.getElementById('unit-merge-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const target = document.getElementById('unit-merge-target').value.trim();
      if (!target) { toast('請選擇或輸入合併目標', 'error'); return; }
      if (target === entry.unit) { toast('來源與目標單位不能相同', 'error'); return; }
      const summary = mergeCustomUnit(entry.unit, target, currentUser().name);
      if (!summary) { toast('單位合併失敗', 'error'); return; }
      mr.innerHTML = '';
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
        : `<button type="button" class="btn btn-sm btn-secondary" onclick="window._approveUnit('${encoded}')">${ic('shield-check', 'icon-sm')} 核准保留</button>`;
      return `<tr><td><div class="review-unit-name">${esc(entry.unit)}</div></td><td>${unitReviewStatusBadge(entry)}</td><td><div class="review-count-chip">${entry.count} 筆</div></td><td><div class="review-scope-text">${esc(formatUnitScopeSummary(entry.scopes))}</div><div class="review-source-list">${sampleRefs}</div></td><td><div class="review-actions"><button type="button" class="btn btn-sm btn-ghost" onclick="window._viewUnitRefs('${encoded}')">${ic('list', 'icon-sm')} 檢視引用</button>${approveBtn}<button type="button" class="btn btn-sm btn-primary" onclick="window._mergeUnit('${encoded}')">${ic('git-merge', 'icon-sm')} 合併</button></div></td></tr>`;
    }).join('') : `<tr><td colspan="5"><div class="empty-state review-empty"><div class="empty-state-icon">${ic('badge-check')}</div><div class="empty-state-title">目前沒有待治理的自訂單位</div><div class="empty-state-desc">所有單位都已符合正式名錄，或已由最高管理員審核完成。</div></div></td></tr>`;

    const historyHtml = history.length ? history.map((entry) => {
      const detail = formatUnitReviewHistory(entry);
      return `<div class="review-history-item"><div class="review-history-top"><span class="review-history-badge ${detail.badgeClass}">${detail.badgeText}</span><span class="review-history-time">${fmtTime(entry.time)}</span></div><div class="review-history-title">${esc(detail.title)}</div><div class="review-history-meta">${esc(detail.meta)}${entry.actor ? ` · ${esc(entry.actor)}` : ''}</div></div>`;
    }).join('') : `<div class="empty-state" style="padding:32px 20px"><div class="empty-state-title">尚無治理紀錄</div></div>`;

    document.getElementById('app').innerHTML = `<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">System Governance</div><h1 class="page-title">自訂單位審核與合併</h1><p class="page-subtitle">集中處理最高管理員手動建立的自訂單位，已核准保留的名稱會回流到最高管理員的單位選單。</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" onclick="window._refreshUnitReview()">${ic('refresh-cw', 'icon-sm')} 重新整理</button></div></div><div class="review-callout"><span class="review-callout-icon">${ic('sparkles', 'icon-sm')}</span><div>建議優先處理<strong>待審核</strong>且引用次數高的自訂單位；若名稱合理但暫時不納入正式名錄，可先使用「核准保留」，系統會讓最高管理員之後可直接選用。</div></div><div class="stats-grid review-stats-grid"><div class="stat-card total"><div class="stat-icon">${ic('building-2')}</div><div class="stat-value">${registry.length}</div><div class="stat-label">自訂單位總數</div></div><div class="stat-card pending"><div class="stat-icon">${ic('hourglass')}</div><div class="stat-value">${pendingCount}</div><div class="stat-label">待審核</div></div><div class="stat-card closed"><div class="stat-icon">${ic('shield-check')}</div><div class="stat-value">${approvedCount}</div><div class="stat-label">已核准保留</div></div><div class="stat-card overdue"><div class="stat-icon">${ic('git-merge')}</div><div class="stat-value">${recentMerged.length}</div><div class="stat-label">最近合併筆數</div></div></div><div class="review-grid"><div class="card review-table-card"><div class="card-header"><span class="card-title">自訂單位清單</span><span class="review-card-subtitle">依待審核優先、引用次數排序</span></div><div class="table-wrapper"><table><thead><tr><th>單位名稱</th><th>狀態</th><th>引用數</th><th>使用位置</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="card review-history-card"><div class="card-header"><span class="card-title">最近治理紀錄</span><span class="review-card-subtitle">保留最近 8 筆操作</span></div><div class="review-history-list">${historyHtml}</div></div></div></div>`;
    refreshIcons();
  }

  window._refreshUnitReview = function () { renderUnitReview(); };
  window._viewUnitRefs = function (encodedUnit) { showUnitReferenceModal(decodeURIComponent(encodedUnit)); };
  window._approveUnit = function (encodedUnit) {
    if (!isAdmin()) return;
    const unit = decodeURIComponent(encodedUnit);
    if (!confirm(`確定將「${unit}」核准保留為自訂單位？`)) return;
    approveCustomUnit(unit, currentUser().name);
    toast('自訂單位已核准保留，之後可於最高管理員單位選單直接選用');
    renderUnitReview();
  };
  window._mergeUnit = function (encodedUnit) { showUnitMergeModal(decodeURIComponent(encodedUnit)); };
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
  const CHECKLIST_STATUS_DRAFT = '\u8349\u7a3f';
  const CHECKLIST_STATUS_SUBMITTED = '\u5df2\u9001\u51fa';
  function normalizeChecklistStatus(status) {
    const value = String(status || '').trim();
    const lower = value.toLowerCase();
    if (!value || value === CHECKLIST_STATUS_DRAFT || lower === 'draft') return CHECKLIST_STATUS_DRAFT;
    if (value === '\u5df2\u63d0\u4ea4' || value === CHECKLIST_STATUS_SUBMITTED || lower === 'submitted') return CHECKLIST_STATUS_SUBMITTED;
    return value;
  }
  function isChecklistDraftStatus(status) { return normalizeChecklistStatus(status) === CHECKLIST_STATUS_DRAFT; }
  function normalizeChecklistItem(item) {
    const base = item && typeof item === 'object' ? { ...item } : {};
    base.status = normalizeChecklistStatus(base.status);
    base.unit = String(base.unit || '').trim();
    base.fillerName = String(base.fillerName || '').trim();
    base.fillerUsername = String(base.fillerUsername || '').trim();
    base.auditYear = String(base.auditYear || '').trim();
    base.supervisor = String(base.supervisor || '').trim();
    base.supervisorName = String(base.supervisorName || base.supervisor || '').trim();
    base.supervisorTitle = String(base.supervisorTitle || '').trim();
    base.signStatus = String(base.signStatus || (base.signDate ? '已簽核' : '待簽核')).trim() || (base.signDate ? '已簽核' : '待簽核');
    base.signDate = base.signDate || '';
    base.supervisorNote = String(base.supervisorNote || '').trim();
    base.results = base.results && typeof base.results === 'object' ? base.results : {};
    base.summary = base.summary && typeof base.summary === 'object' ? base.summary : { total: 0, conform: 0, partial: 0, nonConform: 0, na: 0 };
    const parsedId = parseChecklistId(base.id);
    if (parsedId) {
      base.id = buildChecklistIdByDocument(parsedId.documentNo, parsedId.sequence);
    }
    return base;
  }
  function loadChecklists() {
    const raw = readCachedJson(CHECKLIST_KEY, emptyChecklistStore);
    if (!raw || typeof raw !== 'object') return emptyChecklistStore();
    if (!Array.isArray(raw.items)) raw.items = [];
    if (!Number.isFinite(raw.nextId)) raw.nextId = 1;
    let changed = false;
    const normalizedItems = [];
    raw.items.forEach((item) => {
      const normalized = normalizeChecklistItem(item);
      const documentNo = buildChecklistDocumentNo(normalized.unit, normalized.auditYear, normalized.fillDate || normalized.updatedAt || normalized.createdAt);
      const parsedId = parseChecklistId(normalized.id);
      if (parsedId && normalized.id !== buildChecklistIdByDocument(parsedId.documentNo, parsedId.sequence)) {
        normalized.id = buildChecklistIdByDocument(parsedId.documentNo, parsedId.sequence);
        changed = true;
      } else if ((!parsedId || !String(normalized.id || '').startsWith('CHK-')) && documentNo) {
        const sequence = getNextChecklistSequence(documentNo, normalizedItems);
        normalized.id = buildChecklistIdByDocument(documentNo, sequence);
        changed = true;
      }
      normalizedItems.push(normalized);
    });
    raw.items = normalizedItems;
    if (changed) saveChecklists(raw);
    return raw;
  }
  function saveChecklists(d) { writeCachedJson(CHECKLIST_KEY, d); }
  function getAllChecklists() { return loadChecklists().items.slice(); }
  function getChecklist(id) { return loadChecklists().items.find(i => i.id === id); }
  function addChecklist(item) { const d = loadChecklists(); d.items.push(normalizeChecklistItem(item)); saveChecklists(d); }
  function updateChecklist(id, updates) {
    const d = loadChecklists();
    const idx = d.items.findIndex(i => i.id === id);
    if (idx < 0) return false;
    d.items[idx] = normalizeChecklistItem({ ...d.items[idx], ...updates });
    saveChecklists(d);
    return true;
  }
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

  function renderChecklistList() {
    refreshChecklistSections();
    const checklists = getVisibleChecklists();
    const fillBtn = canFillChecklist() ? `<a href="#checklist-fill" class="btn btn-primary">${ic('edit-3', 'icon-sm')} 填報檢核表</a>` : '';
    const rows = checklists.length ? checklists.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(c => {
      const rate = c.summary.total > 0 ? Math.round(c.summary.conform / c.summary.total * 100) : 0;
      const statusCls = normalizeChecklistStatus(c.status) === CHECKLIST_STATUS_SUBMITTED ? 'badge-closed' : 'badge-pending';
      const target = isChecklistDraftStatus(c.status) && canEditChecklist(c) ? `checklist-fill/${c.id}` : `checklist-detail/${c.id}`;
      return `<tr onclick="location.hash='${target}'"><td class="record-id-col">${renderCopyIdCell(c.id, '檢核表編號', true)}</td><td>${esc(c.unit)}</td><td>${esc(c.fillerName)}</td><td>${esc(c.auditYear)} 年度</td><td><span class="badge ${statusCls}"><span class="badge-dot"></span>${c.status}</span></td><td><div class="cl-rate-bar"><div class="cl-rate-fill" style="width:${rate}%"></div></div><span class="cl-rate-text">${rate}%</span></td><td>${fmt(c.fillDate)}</td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty-state" style="padding:60px"><div class="empty-state-icon">${ic('clipboard-list')}</div><div class="empty-state-title">尚無檢核表紀錄</div><div class="empty-state-desc">登入使用者可點選「填報檢核表」開始填寫</div></div></td></tr>`;
    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">內稽檢核表</h1><p class="page-subtitle">國立臺灣大學內部資通安全稽核查檢表</p></div>${fillBtn}</div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table><thead><tr><th class="record-id-head">編號</th><th>受稽單位</th><th>填報人</th><th>稽核年度</th><th>狀態</th><th>符合率</th><th>填報日期</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
    refreshIcons();
    bindCopyButtons();
  }

  // ─── Render: Checklist Fill ────────────────
  function buildChecklistItemBlock(item, saved) {
    const radios = COMPLIANCE_OPTS.map((opt) => `<label class="cl-radio-label cl-radio-${COMPLIANCE_CLASSES[opt]}"><input type="radio" name="cl-${item.id}" value="${opt}" ${saved.compliance === opt ? 'checked' : ''}><span class="cl-radio-indicator"></span>${opt}</label>`).join('');
    return `<div class="cl-item" id="cl-item-${item.id}">
      <div class="cl-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span></div>
      <div class="cl-item-body">
        <div class="cl-compliance"><label class="form-label form-required">\u7b26\u5408\u7a0b\u5ea6</label><div class="cl-radio-group">${radios}</div></div>
        <div class="cl-fields">
          <div class="form-group"><label class="form-label">\u57f7\u884c\u60c5\u5f62\u8aaa\u660e</label><textarea class="form-textarea cl-textarea" id="cl-exec-${item.id}" placeholder="${esc(item.hint)}" rows="2">${esc(saved.execution || '')}</textarea></div>
          <div class="form-group"><label class="form-label">\u4f50\u8b49\u8cc7\u6599\u8aaa\u660e</label><textarea class="form-textarea cl-textarea" id="cl-evidence-${item.id}" placeholder="\u4f8b\u5982\u6587\u4ef6\u540d\u7a31\u3001\u756b\u9762\u622a\u5716\u3001\u8def\u5f91\u6216\u88dc\u5145\u8aaa\u660e" rows="2">${esc(saved.evidence || '')}</textarea></div>
        </div>
      </div>
    </div>`;
  }
  function buildChecklistSectionsHtml(existing) {
    return CHECKLIST_SECTIONS.map((sec, si) => {
      const itemsHtml = sec.items.map((item) => buildChecklistItemBlock(item, existing?.results?.[item.id] || {})).join('');
      return `<div class="cl-section"><div class="cl-section-header"><span class="cl-section-num">${si + 1}</span>${esc(sec.section)}</div><div class="cl-section-body">${itemsHtml}</div></div>`;
    }).join('');
  }

  function renderChecklistFill(id) {
    refreshChecklistSections();
    if (!canFillChecklist()) { navigate('checklist'); toast('\u60a8\u6c92\u6709\u586b\u5831\u6aa2\u6838\u8868\u6b0a\u9650', 'error'); return; }

    const u = currentUser();
    const currentAuditYear = String(new Date().getFullYear() - 1911);
    const defaultScopedUnit = getScopedUnit(u) || u.unit || '';
    if (!id && u.role !== ROLES.ADMIN && defaultScopedUnit && getAuthorizedUnits(u).length <= 1) {
      const duplicateChecklist = findExistingChecklistForUnitYear(defaultScopedUnit, currentAuditYear);
      if (duplicateChecklist) {
        toast('本年度已存在填報單，請至列表繼續編輯或查看，勿重複新增。', 'error');
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
    const totalItems = CHECKLIST_SECTIONS.reduce((sum, sec) => sum + sec.items.length, 0);
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
            <div class="section-header">${ic('info', 'icon-sm')} 基本資訊</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label form-required">受稽單位</label>${buildUnitCascadeControl('cl-unit', selectedUnit, checklistUnitLocked, true)}</div>
              <div class="form-group"><label class="form-label form-required">填表人員</label><input type="text" class="form-input" id="cl-filler" value="${esc(u.name)}" readonly></div>
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
              <div class="form-group"><label class="form-label">簽核備註</label><input type="text" class="form-input" id="cl-supervisor-note" value="${esc(supervisorNote)}" placeholder="可填簽核說明或補充備註"></div>
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
                <div class="editor-stat-pill"><span class="editor-stat-pill-label">尚未填答</span><strong class="editor-stat-pill-value" id="cl-side-remaining">${totalItems}</strong></div>
                <div class="editor-stat-pill"><span class="editor-stat-pill-label">稽核年度</span><strong class="editor-stat-pill-value" id="cl-side-year">${existing ? esc(existing.auditYear) : String(new Date().getFullYear() - 1911)}</strong></div>
              </div>
              <div class="editor-summary-list">
                <div class="editor-summary-item"><span>受稽單位</span><strong id="cl-side-unit">${esc(selectedUnit || '未指定')}</strong></div>
                <div class="editor-summary-item"><span>填報日期</span><strong id="cl-side-date">${fmt(existing ? existing.fillDate : today)}</strong></div>
                <div class="editor-summary-item"><span>簽核狀態</span><strong id="cl-side-sign-status">${esc(signStatus)}</strong></div>
              </div>
              <button type="button" class="btn btn-secondary checklist-draft-inline" id="cl-save-draft-inline" data-testid="checklist-save-draft-inline">${ic('save', 'icon-sm')} 立即暫存草稿</button>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">判定分布</div>
              <div class="editor-legend-list">
                <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--green"></span>符合</span><strong id="cl-side-conform">0</strong></div>
                <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--amber"></span>部分符合</span><strong id="cl-side-partial">0</strong></div>
                <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--red"></span>不符合</span><strong id="cl-side-nonconform">0</strong></div>
                <div class="editor-legend-item"><span class="editor-legend-key"><span class="editor-legend-dot editor-legend-dot--slate"></span>不適用</span><strong id="cl-side-na">0</strong></div>
              </div>
            </div>
            <div class="editor-side-card">
              <div class="editor-side-title">填報原則</div>
              <div class="editor-note-list">
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>所有查檢項目都要選擇符合程度，正式送出前系統會檢查遺漏題目。</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>若判定為部分符合或不符合，建議在執行情形中寫出改善方向與原因。</span></div>
                <div class="editor-note-item"><span class="editor-note-dot"></span><span>權責主管簽核欄位已結構化，後續若要串掃描檔或流程引擎可直接延伸。</span></div>
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

    function syncChecklistMeta() {
      document.getElementById('cl-side-unit').textContent = document.getElementById('cl-unit').value || '未指定';
      document.getElementById('cl-side-date').textContent = document.getElementById('cl-date').value ? fmt(document.getElementById('cl-date').value) : '未指定';
      document.getElementById('cl-side-year').textContent = document.getElementById('cl-year').value || '未指定';
      document.getElementById('cl-side-sign-status').textContent = document.getElementById('cl-sign-status').value || '待簽核';
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
      CHECKLIST_SECTIONS.forEach((sec) => sec.items.forEach((item) => {
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

    function collectData(status) {
      const results = {};
      let conform = 0, partial = 0, nonConform = 0, na = 0, total = 0;
      CHECKLIST_SECTIONS.forEach((sec) => sec.items.forEach((item) => {
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

    function saveChecklistDraft() {
      const data = collectData('\u8349\u7a3f');
      const duplicateChecklist = findExistingChecklistForUnitYear(data.unit, data.auditYear, existing?.id);
      if (duplicateChecklist) {
        toast('本年度已存在填報單，請至列表繼續編輯或查看，勿重複新增。', 'error');
        navigate(canEditChecklist(duplicateChecklist) ? ('checklist-fill/' + duplicateChecklist.id) : ('checklist-detail/' + duplicateChecklist.id));
        return;
      }
      if (existing) updateChecklist(existing.id, data); else addChecklist(data);
      existing = getChecklist(data.id) || data;
      debugFlow('checklist', 'draft saved', { id: data.id, unit: data.unit, status: data.status });
      updateChecklistDraftStatus(existing);
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

    document.getElementById('checklist-form').addEventListener('submit', (event) => {
      event.preventDefault();
      debugFlow('checklist', 'submit start', { id: existing?.id || null, unit: document.getElementById('cl-unit').value });
      const missing = [];
      CHECKLIST_SECTIONS.forEach((sec) => sec.items.forEach((item) => {
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
      const data = collectData('\u5df2\u9001\u51fa');
      const duplicateChecklist = findExistingChecklistForUnitYear(data.unit, data.auditYear, existing?.id);
      if (duplicateChecklist) {
        toast('本年度已存在填報單，請至列表繼續編輯或查看，勿重複新增。', 'error');
        navigate(canEditChecklist(duplicateChecklist) ? ('checklist-fill/' + duplicateChecklist.id) : ('checklist-detail/' + duplicateChecklist.id));
        return;
      }
      if (existing) updateChecklist(existing.id, data); else addChecklist(data);
      existing = getChecklist(data.id) || data;
      debugFlow('checklist', 'submit success', { id: data.id, unit: data.unit, status: data.status });
      updateChecklistDraftStatus(existing);
      toast(`\u6aa2\u6838\u8868 ${data.id} \u5df2\u6b63\u5f0f\u9001\u51fa`);
      navigate('checklist-detail/' + data.id);
    });

    document.getElementById('cl-save-draft')?.addEventListener('click', saveChecklistDraft);
    document.getElementById('cl-save-draft-inline').addEventListener('click', saveChecklistDraft);
    document.getElementById('cl-save-draft-floating').addEventListener('click', saveChecklistDraft);
  }

  function renderChecklistDetail(id) {
    refreshChecklistSections();
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

    const svg = `<svg viewBox="0 0 120 120" class="cl-donut">${segs}<text x="60" y="56" text-anchor="middle" fill="#0f172a" font-size="18" font-weight="700" font-family="Inter">${applicableRate}%</text><text x="60" y="72" text-anchor="middle" fill="#94a3b8" font-size="8" font-weight="500" font-family="Inter">適用項目</text></svg>`;
    const legend = vals.map((v) => `<div class="cl-legend-item"><span class="cl-legend-dot" style="background:${v.color}"></span>${v.label}<span class="cl-legend-count">${v.count}</span></div>`).join('');

    let sectDetail = '';
    CHECKLIST_SECTIONS.forEach((sec) => {
      let rows = '';
      sec.items.forEach((item) => {
        const r = cl.results?.[item.id] || {};
        const comp = r.compliance || '未填答';
        const compCls = COMPLIANCE_CLASSES[comp] || '';
        rows += `<div class="cl-detail-item"><div class="cl-detail-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span><span class="cl-compliance-badge cl-badge-${compCls}">${esc(comp)}</span></div>`;
        if (r.execution) rows += `<div class="cl-detail-field"><span class="cl-detail-label">執行情形：</span>${esc(r.execution)}</div>`;
        if (r.evidence) rows += `<div class="cl-detail-field"><span class="cl-detail-label">佐證說明：</span>${esc(r.evidence)}</div>`;
        rows += '</div>';
      });
      sectDetail += `<div class="cl-detail-section"><div class="cl-detail-section-title">${esc(sec.section)}</div>${rows}</div>`;
    });

    const issues = [];
    CHECKLIST_SECTIONS.forEach((sec) => sec.items.forEach((item) => {
      const r = cl.results?.[item.id] || {};
      if (r.compliance === '不符合' || r.compliance === '部分符合') {
        issues.push({ id: item.id, text: item.text, compliance: r.compliance, execution: r.execution || '' });
      }
    }));
    const issueHtml = issues.length ? `<div class="card" style="margin-top:20px;border-left:3px solid #ef4444"><div class="section-header">${ic('alert-triangle', 'icon-sm')} 需追蹤項目 ${issues.length} 項</div>${issues.map((iss) => `<div class="cl-issue-item"><span class="cl-compliance-badge cl-badge-${COMPLIANCE_CLASSES[iss.compliance]}">${iss.compliance}</span><span class="cl-item-id">${iss.id}</span> ${esc(iss.text)}${iss.execution ? `<div class="cl-issue-note">${esc(iss.execution)}</div>` : ''}</div>`).join('')}</div>` : '';
    const statusCls = normalizeChecklistStatus(cl.status) === CHECKLIST_STATUS_SUBMITTED ? 'badge-closed' : 'badge-pending';

    document.getElementById('app').innerHTML = `<div class="animate-in">
      <div class="detail-header"><div>
        <div class="detail-id detail-id-with-copy"><span>${esc(cl.id)} · ${esc(cl.auditYear)} 年度</span>${renderCopyIdButton(cl.id, '檢核表編號')}</div>
        <h1 class="detail-title">內稽檢核表 — ${esc(cl.unit)}</h1>
        <div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">${ic('user', 'icon-xs')}</span>${esc(cl.fillerName)}</span><span class="detail-meta-item"><span class="detail-meta-icon">${ic('calendar', 'icon-xs')}</span>${fmt(cl.fillDate)}</span><span class="badge ${statusCls}"><span class="badge-dot"></span>${esc(cl.status)}</span></div>
      </div><a href="#checklist" class="btn btn-secondary">返回列表</a></div>
      <div class="panel-grid-two panel-grid-spaced">
        <div class="card"><div class="card-header"><span class="card-title">符合率統計</span></div><div class="cl-stats-wrap">${svg}<div class="cl-legend">${legend}</div></div></div>
        <div class="card"><div class="card-header"><span class="card-title">基本與簽核資訊</span></div>
          <div class="detail-grid">
            <div class="detail-field"><div class="detail-field-label">受稽單位</div><div class="detail-field-value">${esc(cl.unit)}</div></div>
            <div class="detail-field"><div class="detail-field-label">填表人員</div><div class="detail-field-value">${esc(cl.fillerName)}</div></div>
            <div class="detail-field"><div class="detail-field-label">稽核年度</div><div class="detail-field-value">${esc(cl.auditYear)} 年度</div></div>
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
      <div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">${ic('clipboard-list', 'icon-sm')} 檢核結果明細</span></div>${sectDetail}</div>
    </div>`;
    refreshIcons();
    bindCopyButtons();
  }

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
        <span>修改後立即生效，填報時將使用最新版本。已送出的檢核表不受影響。</span>
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
  const TRAINING_PROFESSIONAL_OPTIONS = ['是', '否'];

  function emptyTrainingStore() {
    return { forms: [], rosters: [], nextFormId: 1, nextRosterId: 1 };
  }

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

  function normalizeTrainingRosterRow(row, fallbackUnit) {
    const unit = String((row && row.unit) || fallbackUnit || '').trim();
    const statsUnit = String((row && (row.statsUnit || row.l1Unit)) || getTrainingStatsUnit(unit)).trim();
    const unitName = String((row && row.unitName) || getTrainingJobUnit(unit)).trim() || statsUnit;
    return {
      id: String((row && row.id) || '').trim(),
      unit,
      statsUnit,
      l1Unit: statsUnit,
      name: String((row && row.name) || '').trim(),
      unitName,
      identity: String((row && row.identity) || '').trim(),
      jobTitle: String((row && row.jobTitle) || '').trim(),
      source: ((row && row.source) === 'manual') ? 'manual' : 'import',
      createdBy: String((row && row.createdBy) || '系統').trim() || '系統',
      createdByUsername: String((row && row.createdByUsername) || '').trim(),
      createdAt: (row && row.createdAt) || new Date().toISOString()
    };
  }

  function normalizeTrainingRecordState(record) {
    const normalized = { ...record };
    const status = TRAINING_EMPLOYEE_STATUS.includes(String(normalized.status || '').trim())
      ? String(normalized.status || '').trim()
      : '';

    let completedGeneral = TRAINING_BOOLEAN_OPTIONS.includes(String(normalized.completedGeneral || '').trim())
      ? String(normalized.completedGeneral || '').trim()
      : '';
    if (!completedGeneral && status === '在職' && hasTrainingValue(normalized.hours)) {
      completedGeneral = Number(normalized.hours || 0) >= 3 ? '是' : '否';
    }

    let isInfoStaff = TRAINING_BOOLEAN_OPTIONS.includes(String(normalized.isInfoStaff || '').trim())
      ? String(normalized.isInfoStaff || '').trim()
      : '';
    if (!isInfoStaff && TRAINING_BOOLEAN_OPTIONS.includes(String(normalized.outsourced || '').trim())) {
      isInfoStaff = String(normalized.outsourced || '').trim();
    }

    let completedProfessional = ['是', '否', '無須'].includes(String(normalized.completedProfessional || '').trim())
      ? String(normalized.completedProfessional || '').trim()
      : '';
    if (!completedProfessional && ['是', '否', '無須'].includes(String(normalized.completedInfo || '').trim())) {
      completedProfessional = String(normalized.completedInfo || '').trim();
    }

    if (status !== '在職') {
      completedGeneral = '';
      isInfoStaff = '';
      completedProfessional = '';
    } else {
      if (!TRAINING_BOOLEAN_OPTIONS.includes(completedGeneral)) completedGeneral = '';
      if (!TRAINING_BOOLEAN_OPTIONS.includes(isInfoStaff)) isInfoStaff = '';
      if (isInfoStaff === '否') {
        completedProfessional = '';
      } else if (isInfoStaff === '是') {
        if (!TRAINING_BOOLEAN_OPTIONS.includes(completedProfessional)) completedProfessional = '';
      } else {
        completedProfessional = '';
      }
    }

    normalized.status = status;
    normalized.completedGeneral = completedGeneral;
    normalized.isInfoStaff = isInfoStaff;
    normalized.completedProfessional = completedProfessional;
    normalized.note = String(normalized.note || '').trim();
    return normalized;
  }

  function normalizeTrainingRecordRow(row, fallbackUnit) {
    const base = normalizeTrainingRosterRow(row, fallbackUnit);
    return normalizeTrainingRecordState({
      ...base,
      rosterId: (row && row.rosterId) || null,
      status: String((row && row.status) || '').trim(),
      completedGeneral: String((row && row.completedGeneral) || '').trim(),
      isInfoStaff: String((row && (row.isInfoStaff || row.outsourced)) || '').trim(),
      completedProfessional: String((row && (row.completedProfessional || row.completedInfo)) || '').trim(),
      note: String((row && row.note) || '').trim(),
      hours: hasTrainingValue(row && row.hours) ? Number(row.hours) : ''
    });
  }

  function normalizeTrainingForm(form) {
    const unit = String((form && form.unit) || '').trim();
    const records = Array.isArray(form && form.records)
      ? form.records.map((row) => normalizeTrainingRecordRow(row, unit))
      : [];
    const rawStatus = String((form && form.status) || '').trim();
    const legacyStatusMap = {
      '正式送出': TRAINING_STATUSES.SUBMITTED,
      '已完成填報': TRAINING_STATUSES.SUBMITTED,
      '待列印簽核': TRAINING_STATUSES.PENDING_SIGNOFF,
      '待簽核': TRAINING_STATUSES.PENDING_SIGNOFF
    };
    const normalizedStatus = Object.values(TRAINING_STATUSES).includes(rawStatus)
      ? rawStatus
      : (legacyStatusMap[rawStatus] || TRAINING_STATUSES.DRAFT);
    const normalized = {
      id: String((form && form.id) || '').trim(),
      unit,
      statsUnit: String((form && form.statsUnit) || getTrainingStatsUnit(unit)).trim(),
      fillerName: String((form && form.fillerName) || '').trim(),
      fillerUsername: String((form && form.fillerUsername) || '').trim(),
      submitterPhone: String((form && form.submitterPhone) || '').trim(),
      submitterEmail: String((form && form.submitterEmail) || '').trim(),
      fillDate: (form && form.fillDate) || new Date().toISOString().split('T')[0],
      trainingYear: String((form && form.trainingYear) || String(new Date().getFullYear() - 1911)).trim(),
      status: normalizedStatus,
      records,
      summary: computeTrainingSummary(records),
      signedFiles: Array.isArray(form && form.signedFiles) ? form.signedFiles : [],
      returnReason: String((form && form.returnReason) || '').trim(),
      createdAt: (form && form.createdAt) || new Date().toISOString(),
      updatedAt: (form && form.updatedAt) || new Date().toISOString(),
      stepOneSubmittedAt: (form && form.stepOneSubmittedAt) || ((normalizedStatus !== TRAINING_STATUSES.DRAFT && normalizedStatus !== TRAINING_STATUSES.RETURNED) ? ((form && form.submittedAt) || (form && form.updatedAt) || null) : null),
      printedAt: (form && form.printedAt) || null,
      signoffUploadedAt: (form && form.signoffUploadedAt) || null,
      submittedAt: (form && form.submittedAt) || null,
      history: Array.isArray(form && form.history) ? form.history : []
    };
    const parsedId = parseTrainingFormId(normalized.id);
    if (parsedId) {
      normalized.id = buildTrainingFormIdByDocument(parsedId.documentNo, parsedId.sequence);
    }
    return normalized;
  }

  function loadTrainingStore() {
    const raw = readCachedJson(TRAINING_KEY, emptyTrainingStore);
    if (!raw || typeof raw !== 'object') return emptyTrainingStore();
    const store = {
      forms: Array.isArray(raw.forms) ? raw.forms.map((form) => normalizeTrainingForm(form)) : [],
      rosters: Array.isArray(raw.rosters) ? raw.rosters.map((row) => normalizeTrainingRosterRow(row, row.unit)) : [],
      nextFormId: Number.isFinite(raw.nextFormId) ? raw.nextFormId : 1,
      nextRosterId: Number.isFinite(raw.nextRosterId) ? raw.nextRosterId : 1
    };
    let changed = false;
    const normalizedForms = [];
    store.forms.forEach((form) => {
      const documentNo = buildTrainingFormDocumentNo(form.unit, form.trainingYear, form.fillDate || form.updatedAt || form.createdAt);
      const parsedId = parseTrainingFormId(form.id);
      if (parsedId && form.id !== buildTrainingFormIdByDocument(parsedId.documentNo, parsedId.sequence)) {
        form.id = buildTrainingFormIdByDocument(parsedId.documentNo, parsedId.sequence);
        changed = true;
      } else if ((!parsedId || !String(form.id || '').startsWith('TRN-')) && documentNo) {
        const sequence = getNextTrainingFormSequence(documentNo, normalizedForms);
        form.id = buildTrainingFormIdByDocument(documentNo, sequence);
        changed = true;
      }
      normalizedForms.push(form);
    });
    store.forms = normalizedForms;
    if (changed) saveTrainingStore(store);
    return store;
  }

  function saveTrainingStore(store) {
    writeCachedJson(TRAINING_KEY, store);
  }

  function getAllTrainingForms() {
    return loadTrainingStore().forms.slice();
  }

  function getTrainingForm(id) {
    return loadTrainingStore().forms.find((form) => form.id === id);
  }

  function upsertTrainingForm(form) {
    const store = loadTrainingStore();
    const normalized = normalizeTrainingForm(form);
    const index = store.forms.findIndex((item) => item.id === normalized.id);
    if (index >= 0) store.forms[index] = normalized;
    else store.forms.push(normalized);
    saveTrainingStore(store);
  }

  function updateTrainingForm(id, updates) {
    const store = loadTrainingStore();
    const index = store.forms.findIndex((item) => item.id === id);
    if (index < 0) return;
    store.forms[index] = normalizeTrainingForm({ ...store.forms[index], ...updates });
    saveTrainingStore(store);
  }

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

  function getAllTrainingRosters() {
    return loadTrainingStore().rosters.slice();
  }

  function getTrainingRosterByUnit(unit) {
    return getAllTrainingRosters()
      .filter((row) => row.unit === unit)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }

  function addTrainingRosterPerson(unit, payload, source, actor, actorUsername) {
    const cleanUnit = String(unit || '').trim();
    const base = typeof payload === 'string' ? { name: payload } : (payload || {});
    const cleanName = String(base.name || '').trim();
    const actorName = typeof actor === 'object'
      ? String((actor && actor.name) || '').trim()
      : String(actor || '').trim();
    const actorUser = typeof actor === 'object'
      ? String((actor && actor.username) || '').trim()
      : String(actorUsername || '').trim();
    if (!cleanUnit || !cleanName) {
      return { added: false, updated: false, reason: '請先選擇單位並輸入姓名' };
    }

    const store = loadTrainingStore();
    const index = store.rosters.findIndex((row) => row.unit === cleanUnit && row.name.toLowerCase() === cleanName.toLowerCase());
    const nextRow = normalizeTrainingRosterRow({
      ...base,
      id: index >= 0 ? store.rosters[index].id : 'RST-' + String(store.nextRosterId).padStart(4, '0'),
      unit: cleanUnit,
      source: source || base.source || 'manual',
      createdBy: index >= 0 ? store.rosters[index].createdBy : (actorName || '系統'),
      createdByUsername: index >= 0 ? store.rosters[index].createdByUsername : actorUser,
      createdAt: index >= 0 ? store.rosters[index].createdAt : new Date().toISOString()
    }, cleanUnit);

    if (index >= 0) {
      const current = store.rosters[index];
      const merged = { ...current, ...nextRow };
      const changed = ['unitName', 'identity', 'jobTitle', 'statsUnit', 'l1Unit'].some(
        (key) => String(current[key] || '') !== String(merged[key] || '')
      );
      if (changed) {
        store.rosters[index] = merged;
        saveTrainingStore(store);
        return { added: false, updated: true, reason: `已更新 ${cleanName} 的名單資訊` };
      }
      return { added: false, updated: false, reason: `${cleanName} 已存在於該單位名單` };
    }

    store.nextRosterId += 1;
    store.rosters.push(nextRow);
    saveTrainingStore(store);
    return { added: true, updated: false, id: nextRow.id };
  }

  function deleteTrainingRosterPerson(id) {
    const store = loadTrainingStore();
    store.rosters = store.rosters.filter((row) => row.id !== id);
    saveTrainingStore(store);
  }

  function updateTrainingRosterPerson(id, updates) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;
    const store = loadTrainingStore();
    const index = store.rosters.findIndex((row) => row.id === cleanId);
    if (index < 0) return null;
    store.rosters[index] = normalizeTrainingRosterRow({ ...store.rosters[index], ...(updates || {}) }, store.rosters[index].unit);
    saveTrainingStore(store);
    return store.rosters[index];
  }

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
    if (!TRAINING_BOOLEAN_OPTIONS.includes(record.completedGeneral)) return false;
    if (!TRAINING_BOOLEAN_OPTIONS.includes(record.isInfoStaff)) return false;
    if (record.isInfoStaff === '是') return TRAINING_BOOLEAN_OPTIONS.includes(record.completedProfessional);
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
    if (!TRAINING_BOOLEAN_OPTIONS.includes(record.completedGeneral)) return '請填寫' + TRAINING_GENERAL_LABEL + '完成情形';
    if (!TRAINING_BOOLEAN_OPTIONS.includes(record.isInfoStaff)) return '請判定是否為' + TRAINING_INFO_STAFF_LABEL;
    if (record.isInfoStaff === '是' && !TRAINING_BOOLEAN_OPTIONS.includes(record.completedProfessional)) {
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
    return record.completedProfessional || '—';
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

  function buildTrainingSummaryCards(summary) {
    const cards = [['在職人數', summary.activeCount || 0, 'active'], ['已完成', summary.completedCount || 0, 'complete'], ['未完成', summary.incompleteCount || 0, 'warning'], ['完成率', (summary.completionRate || 0) + '%', 'rate'], ['資訊人員', summary.infoStaffCount || 0, 'info'], ['待補欄位', (summary.missingStatusCount || 0) + (summary.missingFieldCount ? ' / ' + summary.missingFieldCount : ''), 'pending']];
    return cards.map(([label, value, tone]) => '<div class="training-mini-card training-mini-card--' + tone + '"><div class="training-mini-label">' + label + '</div><div class="training-mini-value">' + value + '</div></div>').join('');
  }

  function renderTrainingBinaryButtons(field, value, index, disabled, yesLabel, noLabel) {
    const dis = disabled ? 'disabled' : '';
    return '<div class="training-binary-group" role="group">'
      + '<button type="button" class="training-binary-btn ' + (value === '是' ? 'is-active is-yes' : '') + '" data-idx="' + index + '" data-field="' + field + '" data-value="是" ' + dis + '>' + esc(yesLabel || '✓') + '</button>'
      + '<button type="button" class="training-binary-btn ' + (value === '否' ? 'is-active is-no' : '') + '" data-idx="' + index + '" data-field="' + field + '" data-value="否" ' + dis + '>' + esc(noLabel || '✕') + '</button>'
      + '</div>';
  }

  window._trainingUndo = function (id) {
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
  };

  window._trainingReturn = function (id) {
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
  };

  window._trainingDeleteRoster = function (id) {
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
  };

  window._trainingPrintDetail = function (id) {
    const form = getTrainingForm(id);
    if (!form) return;
    printTrainingSheet(form);
  };

  window._trainingExportDetailCsv = function (id) {
    const form = getTrainingForm(id);
    if (!form) return;
    exportTrainingDetailCsv(form);
  };

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
      if (canUndoTrainingForm(form)) actions.push('<button type="button" class="btn btn-sm btn-warning" onclick="window._trainingUndo(\'' + form.id + '\')">撤回流程一</button>');
      if (isAdmin() && form.status === TRAINING_STATUSES.SUBMITTED) actions.push('<button type="button" class="btn btn-sm btn-danger" onclick="window._trainingReturn(\'' + form.id + '\')">退回更正</button>');
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
        + '<div class="card training-table-card"><div class="card-header"><div><span class="card-title">已完成填報</span><div class="training-table-subtitle">填報清單已併入此區，方便直接查看已完成資料與下載。</div></div><span class="training-inline-status">' + completedUnits.length + ' 個單位</span></div><div class="table-wrapper"><table><thead><tr><th>統計單位</th><th>填報單位</th><th>編號</th><th>經辦人</th><th>單位總人數</th><th>已完成</th><th>未完成</th><th>達成比率</th><th>完成時間</th><th>操作</th></tr></thead><tbody>' + completedRows + '</tbody></table></div></div>'
        + '<div class="card training-table-card"><div class="card-header"><div><span class="card-title">未完成填報</span><div class="training-table-subtitle">包含尚未填報、暫存、退回更正與待簽核中的單位。</div></div><span class="training-inline-status">' + incompleteUnits.length + ' 個單位</span></div><div class="table-wrapper"><table><thead><tr><th>填報單位</th><th>狀態</th><th>經辦人</th><th>單位總人數</th><th>已完成</th><th>達成比率</th><th>說明</th><th>最後更新</th><th>操作</th></tr></thead><tbody>' + incompleteRows + '</tbody></table></div></div>'
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
      contentHtml = '<div class="card training-table-card"><div class="card-header"><div><span class="card-title">我的填報單</span><div class="training-table-subtitle">流程一完成後內容會先鎖定；若尚未列印簽核表，可在 ' + TRAINING_UNDO_WINDOW_MINUTES + ' 分鐘內撤回重新編修。</div></div></div><div class="table-wrapper"><table><thead><tr><th>編號</th><th>填報單位</th><th>狀態</th><th>單位總人數</th><th>已完成</th><th>達成比率</th><th>最後更新</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }

    document.getElementById('app').innerHTML = '<div class="animate-in training-dashboard-page">'
      + '<div class="page-header"><div><h1 class="page-title">資安教育訓練統計</h1><p class="page-subtitle">依流程一填報、流程二列印、流程三上傳簽核表完成整體申報；流程一送出後若尚未列印，可於 ' + TRAINING_UNDO_WINDOW_MINUTES + ' 分鐘內撤回。</p></div>' + toolbar + '</div>'
      + '<div class="stats-grid">'
      + '<div class="stat-card total"><div class="stat-icon">' + ic('graduation-cap') + '</div><div class="stat-value">' + summary.total + '</div><div class="stat-label">填報單數</div></div>'
      + '<div class="stat-card closed"><div class="stat-icon">' + ic('check-circle-2') + '</div><div class="stat-value">' + summary.submitted + '</div><div class="stat-label">已完成填報</div></div>'
      + '<div class="stat-card pending"><div class="stat-icon">' + ic('clock-3') + '</div><div class="stat-value">' + summary.pending + '</div><div class="stat-label">待簽核</div></div>'
      + '<div class="stat-card overdue"><div class="stat-icon">' + ic('rotate-ccw') + '</div><div class="stat-value">' + (summary.draft + summary.returned) + '</div><div class="stat-label">待補件 / 草稿</div></div>'
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
      + '<div id="training-summary" class="training-summary-grid training-summary-grid-wide"></div>'
      + '<div class="training-bulk-bar"><div class="training-bulk-count" id="training-selected-count">尚未選取人員</div><div class="training-bulk-controls"><select class="form-select" id="training-bulk-status"><option value="">套用在職狀態</option>' + TRAINING_EMPLOYEE_STATUS.map((status) => '<option value="' + esc(status) + '">' + esc(status) + '</option>').join('') + '</select><div class="training-bulk-general"><span>' + TRAINING_GENERAL_LABEL + '</span><div class="training-binary-group"><button type="button" class="training-binary-btn" data-bulk-general="是">✓</button><button type="button" class="training-binary-btn" data-bulk-general="否">✕</button></div></div><button type="button" class="btn btn-secondary" id="training-apply-bulk">' + ic('check-circle-2', 'icon-sm') + ' 套用到所選人員</button></div></div>'
      + '<div class="training-inline-form"><div class="form-group"><label class="form-label">新增名單外人員</label><input type="text" class="form-input" id="tr-new-name" placeholder="姓名"></div><div class="form-group"><label class="form-label">本職單位</label><input type="text" class="form-input" id="tr-new-unit-name" placeholder="例如 資訊網路組"></div><div class="form-group"><label class="form-label">身分別</label><input type="text" class="form-input" id="tr-new-identity" placeholder="例如 職員／委外"></div><div class="form-group"><label class="form-label">職稱</label><input type="text" class="form-input" id="tr-new-job-title" placeholder="例如 工程師"></div><div class="training-inline-action"><button type="button" class="btn btn-secondary" id="training-add-person">' + ic('user-plus', 'icon-sm') + ' 新增名單</button></div></div>'
      + '<div class="training-editor-note" style="margin-top:-4px">草稿或退回更正狀態下，可刪除自己手動新增的人員；正式名單與他人新增資料仍會保留。</div>'
      + '<div class="training-record-table-wrap"><div class="table-wrapper"><table><thead><tr><th style="width:56px"><input type="checkbox" id="training-select-all"></th><th style="width:68px">序號</th><th style="width:180px">姓名 / 來源</th><th style="min-width:180px">本職單位</th><th style="width:140px">身分別</th><th style="width:140px">職稱</th><th style="width:140px">在職狀態</th><th style="width:180px">' + TRAINING_GENERAL_LABEL + '</th><th style="width:180px">' + TRAINING_INFO_STAFF_LABEL + '</th><th style="width:180px">' + TRAINING_PROFESSIONAL_LABEL + '</th><th style="width:160px">判定</th><th style="min-width:240px">備註</th><th style="width:120px">操作</th></tr></thead><tbody id="training-rows-body"></tbody></table></div></div>'
      + '<div class="form-actions"><button type="button" class="btn btn-secondary" id="training-save-draft" data-testid="training-save-draft">' + ic('save', 'icon-sm') + ' 儲存暫存</button><button type="submit" class="btn btn-primary">' + ic('lock', 'icon-sm') + ' ' + submitLabel + '</button><a href="#training" class="btn btn-ghost">取消</a></div>'
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
      document.getElementById('training-summary').innerHTML = buildTrainingSummaryCards(computeTrainingSummary(rowsState));
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
        body.innerHTML = '<tr><td colspan="13"><div class="empty-state" style="padding:28px"><div class="empty-state-title">此單位尚未建立名單</div><div class="empty-state-desc">請由管理者匯入名單，或由填報人新增名單外人員。</div></div></td></tr>';
        renderSummary();
        updateBulkSelectionText();
        return;
      }
      if (!visibleRows.length) {
        body.innerHTML = '<tr><td colspan="13"><div class="empty-state" style="padding:28px"><div class="empty-state-title">沒有符合條件的人員</div><div class="empty-state-desc">請調整搜尋條件或取消「只看未完成或未填」。</div></div></td></tr>';
        renderSummary();
        updateBulkSelectionText();
        return;
      }

      body.innerHTML = visibleRows.map(({ row, index }, visibleIndex) => {
        const key = getRowKey(row, index);
        const isActive = row.status === '在職';
        const professionalDisabled = !isActive || row.isInfoStaff !== '是';
        const canDeleteRow = canDeleteTrainingEditableRow(row, existing, user);
        const editableMetaClass = canDeleteRow ? ' training-row-meta--editable' : '';
        const professionalHtml = row.isInfoStaff === '否'
          ? '<span class="training-na-chip">不適用</span>'
          : renderTrainingBinaryButtons('completedProfessional', row.completedProfessional, index, professionalDisabled, '✓', '✕');
        const actionHtml = canDeleteRow
          ? '<div class="training-row-actions"><button type="button" class="btn btn-sm btn-danger training-row-delete" data-idx="' + index + '">' + ic('trash-2', 'btn-icon-svg') + '</button></div>'
          : '<div class="training-row-actions"><span class="training-row-action-hint">' + (row.source === 'manual' ? '僅建立者可刪' : '正式名單') + '</span></div>';
        return '<tr>'
          + '<td><input type="checkbox" class="training-row-check" data-key="' + esc(key) + '" ' + (selectedKeys.has(key) ? 'checked' : '') + '></td>'
          + '<td>' + (visibleIndex + 1) + '</td>'
          + '<td><div class="training-person-cell"><div class="training-person-name">' + esc(row.name) + '</div><span class="training-source-tag ' + (row.source === 'import' ? 'import' : 'manual') + '">' + (row.source === 'import' ? '管理者匯入' : '填報新增') + '</span></div></td>'
          + '<td>' + (canDeleteRow ? '<input type="text" class="form-input training-row-meta' + editableMetaClass + '" data-idx="' + index + '" data-field="unitName" value="' + esc(row.unitName || '') + '" placeholder="本職單位">' : esc(row.unitName || '—')) + '</td>'
          + '<td>' + (canDeleteRow ? '<input type="text" class="form-input training-row-meta' + editableMetaClass + '" data-idx="' + index + '" data-field="identity" value="' + esc(row.identity || '') + '" placeholder="身分別">' : esc(row.identity || '—')) + '</td>'
          + '<td>' + (canDeleteRow ? '<input type="text" class="form-input training-row-meta' + editableMetaClass + '" data-idx="' + index + '" data-field="jobTitle" value="' + esc(row.jobTitle || '') + '" placeholder="職稱">' : esc(row.jobTitle || '—')) + '</td>'
          + '<td><select class="form-select training-row-select" data-idx="' + index + '" data-field="status">' + trainingSelectOptionsHtml(TRAINING_EMPLOYEE_STATUS, row.status, '請選擇') + '</select></td>'
          + '<td>' + renderTrainingBinaryButtons('completedGeneral', row.completedGeneral, index, !isActive, '✓', '✕') + '</td>'
          + '<td><select class="form-select training-row-select" data-idx="' + index + '" data-field="isInfoStaff" ' + (isActive ? '' : 'disabled') + '>' + trainingSelectOptionsHtml(TRAINING_BOOLEAN_OPTIONS, row.isInfoStaff, '請選擇') + '</select></td>'
          + '<td>' + professionalHtml + '</td>'
          + '<td><div class="training-cell-note">' + trainingDecisionBadge(row) + '<div class="training-cell-hint">' + esc(getTrainingRecordHint(row)) + '</div></div></td>'
          + '<td><input type="text" class="form-input training-row-note" data-idx="' + index + '" value="' + esc(row.note || '') + '" placeholder="可填補充說明或課程名稱"></td>'
          + '<td>' + actionHtml + '</td>'
          + '</tr>';
      }).join('');

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
          if (field === 'isInfoStaff' && row.isInfoStaff !== '是') row.completedProfessional = '';
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
          if (field === 'completedProfessional' && row.isInfoStaff !== '是') row.completedProfessional = '';
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
        completedProfessional: row.isInfoStaff === '是' ? row.completedProfessional : ''
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
    const detailRows = (form.records || []).length
      ? (form.records || []).map((row) => '<tr><td>' + esc(row.name) + '</td><td>' + esc(row.unitName || '—') + '</td><td>' + esc(row.identity || '—') + '</td><td>' + esc(row.jobTitle || '—') + '</td><td>' + esc(row.status || '—') + '</td><td>' + esc(row.completedGeneral || '—') + '</td><td>' + esc(row.isInfoStaff || '—') + '</td><td>' + esc(getTrainingProfessionalDisplay(row)) + '</td><td>' + trainingDecisionBadge(row) + '</td><td>' + esc(row.note || '') + '</td></tr>').join('')
      : '<tr><td colspan="10"><div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無明細資料</div></div></td></tr>';
    const timeline = (form.history || []).slice().reverse().map((item) => '<div class="timeline-item"><div class="timeline-time">' + fmtTime(item.time) + '</div><div class="timeline-text">' + esc(item.action) + ' · ' + esc(item.user || '系統') + '</div></div>').join('') || '<div class="empty-state" style="padding:24px"><div class="empty-state-title">尚無歷程紀錄</div></div>';
    const actions = ['<button type="button" class="btn btn-secondary" id="training-export-detail">' + ic('download', 'icon-sm') + ' 匯出 Excel</button>', '<button type="button" class="btn btn-secondary" id="training-print-detail">' + ic('printer', 'icon-sm') + ' 列印簽核表</button>', '<a href="#training" class="btn btn-secondary">← 返回列表</a>'];
    if (canEditTrainingForm(form)) actions.unshift('<a href="#training-fill/' + form.id + '" class="btn btn-primary">' + ic('edit-3', 'icon-sm') + ' 繼續填報</a>');
    if (canUndo) actions.unshift('<button type="button" class="btn btn-warning" id="training-undo-step-one">' + ic('rotate-ccw', 'icon-sm') + ' 撤回流程一</button>');
    if (isAdmin() && form.status === TRAINING_STATUSES.SUBMITTED) actions.unshift('<button type="button" class="btn btn-danger" onclick="window._trainingReturn(\'' + form.id + '\')">' + ic('corner-up-left', 'icon-sm') + ' 退回更正</button>');

    const stepCards = [
      ['流程一', '依人員填報教育訓練完成情形', form.stepOneSubmittedAt ? '已完成並鎖定' : '待完成', form.stepOneSubmittedAt ? (canUndo ? ('可於剩餘 ' + undoRemainingMinutes + ' 分鐘內撤回；列印簽核表後將不可撤回') : fmtTime(form.stepOneSubmittedAt)) : '完成後才可進入簽核'],
      ['流程二', '列印簽核表', form.printedAt ? '已列印' : (form.status === TRAINING_STATUSES.DRAFT || form.status === TRAINING_STATUSES.RETURNED ? '待流程一完成' : '待列印'), form.printedAt ? fmtTime(form.printedAt) : '請列印後交主管簽核'],
      ['流程三', '上傳簽核掃描檔', form.status === TRAINING_STATUSES.SUBMITTED ? '已完成填報' : ((filesState.length || form.signoffUploadedAt) ? '已上傳，待完成送件' : '待上傳'), form.status === TRAINING_STATUSES.SUBMITTED ? fmtTime(form.submittedAt || form.updatedAt) : (form.signoffUploadedAt ? fmtTime(form.signoffUploadedAt) : '上傳後完成整體流程')]
    ].map((step) => '<div class="training-step-card"><div class="training-step-kicker">' + esc(step[0]) + '</div><div class="training-step-title">' + esc(step[1]) + '</div><div class="training-step-status">' + esc(step[2]) + '</div><div class="training-step-note">' + esc(step[3]) + '</div></div>').join('');

    const uploadSection = (form.status === TRAINING_STATUSES.PENDING_SIGNOFF && canManage)
      ? '<div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">流程三：上傳簽核掃描檔</span></div><div class="upload-zone" id="training-upload-zone"><input type="file" id="training-file-input" multiple accept="image/*,.pdf"><div class="upload-zone-icon">' + ic('folder-open') + '</div><div class="upload-zone-text">拖曳檔案或 <strong>點此選擇</strong></div><div class="upload-zone-hint">支援 JPG / PNG / PDF，單檔上限 5MB</div></div><div class="file-preview-list training-signoff-files" id="training-file-previews"></div><div class="form-actions"><button type="button" class="btn btn-primary" id="training-finalize-submit">' + ic('check-circle-2', 'icon-sm') + ' 完成流程三並正式結束填報</button></div></div>'
      : '';

    document.getElementById('app').innerHTML = '<div class="animate-in">'
      + '<div class="detail-header"><div><div class="detail-id detail-id-with-copy"><span>' + esc(form.id) + ' · ' + esc(form.trainingYear) + ' 年度</span>' + renderCopyIdButton(form.id, '教育訓練編號') + '</div><h1 class="detail-title">資安教育訓練統計 — ' + esc(form.statsUnit || getTrainingStatsUnit(form.unit)) + '</h1><div class="detail-meta"><span class="detail-meta-item"><span class="detail-meta-icon">' + ic('building-2', 'icon-xs') + '</span>' + esc(form.unit) + '</span><span class="detail-meta-item"><span class="detail-meta-icon">' + ic('user', 'icon-xs') + '</span>' + esc(form.fillerName) + '</span><span class="detail-meta-item"><span class="detail-meta-icon">' + ic('calendar', 'icon-xs') + '</span>' + fmt(form.fillDate) + '</span>' + trainingStatusBadge(form.status) + '</div></div><div class="training-toolbar-actions">' + actions.join('') + '</div></div>'
      + (form.status === TRAINING_STATUSES.RETURNED ? '<div class="training-return-banner">' + ic('alert-triangle', 'icon-sm') + ' 退回原因：' + esc(form.returnReason || '未提供') + '</div>' : '')
      + (canUndo ? '<div class="training-undo-banner">' + ic('rotate-ccw', 'icon-sm') + '<div><strong>流程一剛完成，仍可撤回。</strong><div>尚未列印簽核表前，可在剩餘 ' + undoRemainingMinutes + ' 分鐘內撤回，回到可編修的草稿狀態。</div></div></div>' : '')
      + '<div class="card"><div class="card-header"><span class="card-title">流程概況</span></div><div class="training-step-grid">' + stepCards + '</div></div>'
      + '<div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">統計摘要</span></div><div class="training-summary-grid training-summary-grid-wide">' + buildTrainingSummaryCards(summary) + '</div></div>'
      + '<div class="panel-grid-two panel-grid-spaced">'
      + '<div class="card"><div class="card-header"><span class="card-title">填報資訊</span></div><div class="detail-grid"><div class="detail-field"><div class="detail-field-label">統計單位</div><div class="detail-field-value">' + esc(form.statsUnit || getTrainingStatsUnit(form.unit)) + '</div></div><div class="detail-field"><div class="detail-field-label">填報單位</div><div class="detail-field-value">' + esc(form.unit) + '</div></div><div class="detail-field"><div class="detail-field-label">經辦人</div><div class="detail-field-value">' + esc(form.fillerName) + '</div></div><div class="detail-field"><div class="detail-field-label">聯絡電話</div><div class="detail-field-value">' + esc(form.submitterPhone || '—') + '</div></div><div class="detail-field"><div class="detail-field-label">聯絡信箱</div><div class="detail-field-value">' + esc(form.submitterEmail || '—') + '</div></div><div class="detail-field"><div class="detail-field-label">整體完成時間</div><div class="detail-field-value">' + (form.submittedAt ? fmtTime(form.submittedAt) : '—') + '</div></div></div></div>'
      + '<div class="card"><div class="card-header"><span class="card-title">簽核掃描檔</span></div><div class="file-preview-list training-signoff-files" id="training-signed-files-readonly"></div></div>'
      + '</div>'
      + uploadSection
      + '<div class="card" style="margin-top:20px;padding:0;overflow:hidden"><div class="card-header" style="padding:16px 20px"><span class="card-title">逐人明細</span></div><div class="table-wrapper"><table><thead><tr><th>姓名</th><th>本職單位</th><th>身分別</th><th>職稱</th><th>在職狀態</th><th>' + TRAINING_GENERAL_LABEL + '</th><th>' + TRAINING_INFO_STAFF_LABEL + '</th><th>' + TRAINING_PROFESSIONAL_LABEL + '</th><th>判定</th><th>備註</th></tr></thead><tbody>' + detailRows + '</tbody></table></div></div>'
      + '<div class="card" style="margin-top:20px"><div class="card-header"><span class="card-title">歷程紀錄</span></div><div class="timeline">' + timeline + '</div></div>'
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
    document.getElementById('training-undo-step-one')?.addEventListener('click', () => window._trainingUndo(form.id));
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
    return rosters.map((row) => '<tr><td>' + esc(row.statsUnit || getTrainingStatsUnit(row.unit)) + '</td><td>' + esc(row.unit) + '</td><td>' + esc(row.name) + '</td><td>' + esc(row.unitName || '—') + '</td><td>' + esc(row.identity || '—') + '</td><td>' + esc(row.jobTitle || '—') + '</td><td>' + (row.source === 'import' ? '管理者匯入' : '填報新增') + '</td><td>' + esc(row.createdBy || '') + '</td><td>' + fmtTime(row.createdAt) + '</td><td><button type="button" class="btn btn-sm btn-danger" data-testid="training-roster-delete-' + esc(row.id) + '" onclick="window._trainingDeleteRoster(\'' + row.id + '\')">' + ic('trash-2', 'btn-icon-svg') + '</button></td></tr>').join('');
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

  function handleRoute() {
    if (!currentUser()) { renderLogin(); return; }
    const route = getRoute();
    const page = ROUTE_WHITELIST[route.page] ? route.page : 'dashboard';
    if (!canAccessRoute(page)) {
      const fallback = getRouteFallback(page);
      const message = getRouteMeta(page).deniedMessage;
      navigate(fallback, { replace: true });
      if (message) toast(message, 'error');
      return;
    }
    renderSidebar();
    renderHeader();
    closeSidebar();
    getRouteMeta(page).render(route.param);
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
  ensurePrimaryAdminProfile();
  seedTrainingData();
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('resize', function () { if (!isMobileViewport()) closeSidebar(); });
  window.addEventListener('load', refreshIcons);
  renderApp();
  refreshIcons();

})();

