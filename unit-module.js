// @ts-check
(function () {
  window.createUnitModule = function createUnitModule(deps) {
    const {
      UNIT_CUSTOM_VALUE,
      UNIT_CUSTOM_LABEL,
      UNIT_ADMIN_PRIMARY_WHITELIST,
      UNIT_ACADEMIC_PRIMARY_WHITELIST,
      loadData,
      saveData,
      loadChecklists,
      saveChecklists,
      loadTrainingStore,
      saveTrainingStore,
      loadUnitReviewStore,
      saveUnitReviewStore,
      getAuthorizedUnits,
      syncSessionUnit,
      isAdmin,
      esc
    } = deps;
    const TRAINING_UNIT_CATEGORY_ADMIN = '\u884c\u653f\u55ae\u4f4d';
    const TRAINING_UNIT_CATEGORY_ACADEMIC = '\u5b78\u8853\u55ae\u4f4d';
    const TRAINING_UNIT_CATEGORY_CENTER = '\u4e2d\u5fc3 / \u7814\u7a76\u55ae\u4f4d';
    const TRAINING_CENTER_OVERRIDE_UNITS = new Set([
      '學校分部總辦事處',
      '學校分部總辦事處竹北分部籌備小組',
      '學校分部總辦事處雲林分部籌備小組'
    ]);
    const HIDDEN_OFFICIAL_UNIT_VALUES = new Set([
      '國立臺灣大學系統'
    ]);
    const TRAINING_DASHBOARD_EXCLUDED_UNITS = new Set([
      '學校分部總辦事處',
      '國立臺灣大學系統'
    ]);
    const UNIT_CASCADE_SEARCH_BLUR_DELAY_MS = 180;
    let officialUnitsCache = null;
    let officialUnitCatalogCache = null;
    let officialUnitSetCache = null;
    let officialUnitMetaCache = null;

    function getOfficialUnits() {
      if (Array.isArray(officialUnitsCache)) return officialUnitsCache.slice();
      try {
        if (typeof window !== 'undefined' && typeof window.getOfficialUnitList_ === 'function') {
          const units = window.getOfficialUnitList_();
          if (Array.isArray(units)) {
            officialUnitsCache = units.map((entry) => String(entry || '').trim()).filter((entry) => entry && !HIDDEN_OFFICIAL_UNIT_VALUES.has(entry) && !entry.includes('?'));
            return officialUnitsCache.slice();
          }
        }
      } catch (_) { }
      officialUnitsCache = [];
      return [];
    }

    function getOfficialUnitCatalog() {
      if (Array.isArray(officialUnitCatalogCache)) return officialUnitCatalogCache.slice();
      try {
        if (typeof window !== 'undefined' && typeof window.getOfficialUnitCatalog_ === 'function') {
          const catalog = window.getOfficialUnitCatalog_();
          if (Array.isArray(catalog)) {
            officialUnitCatalogCache = catalog.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry)).filter((entry) => { if (!entry || typeof entry !== 'object') return false; const value = String(entry.value || '').trim(); const name = String(entry.name || '').trim(); const fullName = String(entry.fullName || '').trim(); return !!value && !HIDDEN_OFFICIAL_UNIT_VALUES.has(value) && !HIDDEN_OFFICIAL_UNIT_VALUES.has(name) && !HIDDEN_OFFICIAL_UNIT_VALUES.has(fullName) && !value.includes('?') && !name.includes('?') && !fullName.includes('?'); });
            officialUnitMetaCache = null;
            return officialUnitCatalogCache.slice();
          }
        }
      } catch (_) { }
      officialUnitCatalogCache = [];
      officialUnitMetaCache = null;
      return [];
    }

    function getOfficialUnitMeta(unitValue) {
      const value = String(unitValue || '').trim();
      if (!value) return null;
      if (!officialUnitMetaCache) {
        officialUnitMetaCache = new Map(getOfficialUnitCatalog().map((entry) => [String(entry && entry.value || '').trim(), entry]));
      }
      if (officialUnitMetaCache.has(value)) return officialUnitMetaCache.get(value) || null;
      try {
        if (typeof window !== 'undefined' && typeof window.getOfficialUnitMeta_ === 'function') {
          const meta = window.getOfficialUnitMeta_(value);
          if (meta && typeof meta === 'object') return meta;
        }
      } catch (_) { }
      return null;
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
      if (!officialUnitSetCache) {
        officialUnitSetCache = new Set(getOfficialUnits());
      }
      return new Set(officialUnitSetCache);
    }

    function isOfficialUnit(unit) {
      const value = String(unit || '').trim();
      if (!value) return false;
      return getOfficialUnitSet().has(value);
    }

    function isCorruptedUnitValue(unit) {
      const value = String(unit || '').trim();
      if (!value) return false;
      if (/\uFFFD/.test(value)) return true;
      if (/\?{3,}/.test(value)) return true;
      return /(\u92b5\uf5fb\ue71c|\u646e\u8cb9|\u929d\u5256|\u875f\u990c\u7d5e|\u64a3\u553e|\u747c\uff38\ufeb1)/.test(value);
    }

    function formatUnitScopeSummary(scopes) {
      const defs = [
        ['users', '帳號'],
        ['items', '矯正單'],
        ['checklists', '檢核表'],
        ['trainingForms', '教育訓練'],
        ['trainingRosters', '教育訓練名單']
      ];
      const parts = defs.filter(([key]) => scopes[key] > 0).map(([key, label]) => `${label} ${scopes[key]}`);
      return parts.join(' · ') || '尚無引用';
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
      if (!value || isCorruptedUnitValue(value)) return;

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
        pushUnitReference(map, item.proposerUnit, 'items', `矯正單 ${item.id} · 提案單位`);
        pushUnitReference(map, item.handlerUnit, 'items', `矯正單 ${item.id} · 責任單位`);
      });

      (checklistStore.items || []).forEach((item) => {
        pushUnitReference(map, item.unit, 'checklists', `檢核表 ${item.id} · ${item.fillerName || '未填寫'}`);
      });

      (trainingStore.forms || []).forEach((form) => {
        pushUnitReference(map, form.unit, 'trainingForms', `教育訓練 ${form.id} · ${form.fillerName || '未填寫'}`);
      });

      (trainingStore.rosters || []).forEach((row) => {
        pushUnitReference(map, row.unit, 'trainingRosters', `教育訓練名單 · ${row.name || '未命名'}`);
      });

      return Array.from(map.values());
    }

    function getCustomUnitRegistry() {
      const store = loadUnitReviewStore();
      const approvedMap = new Map(store.approvedUnits.map((entry) => [entry.unit, entry]));
      return collectUnitReferences()
        .filter((entry) => !isCorruptedUnitValue(entry.unit))
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
          row.updatedAt = now;
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

    function normalizeExcludedUnitValues(values) {
      const excluded = new Set();
      (Array.isArray(values) ? values : []).forEach((value) => {
        const text = String(value || '').trim();
        if (text) excluded.add(text);
      });
      return excluded;
    }

    function isExcludedUnitValue(unitValue, excludedUnits) {
      const excluded = excludedUnits instanceof Set ? excludedUnits : normalizeExcludedUnitValues(excludedUnits);
      if (!excluded.size) return false;
      const raw = String(unitValue || '').trim();
      if (!raw) return false;
      if (excluded.has(raw)) return true;
      const parsed = splitUnitValue(raw);
      const parent = String(parsed.parent || '').trim();
      const child = String(parsed.child || '').trim();
      if (parent && excluded.has(parent)) return true;
      if (child && excluded.has(child)) return true;
      if (parent && child && excluded.has(composeUnitValue(parent, child))) return true;
      return false;
    }

    function getSelectableUnitStructure(options) {
      const opts = options || {};
      const excludedUnits = normalizeExcludedUnitValues(opts.excludeUnits);
      const base = getUnitStructureSafe();
      const merged = {};

      Object.keys(base).forEach((parent) => {
        if (isExcludedUnitValue(parent, excludedUnits) || HIDDEN_OFFICIAL_UNIT_VALUES.has(String(parent || '').trim())) return;
        merged[parent] = Array.isArray(base[parent]) ? [...base[parent]] : [];
      });

      getApprovedCustomUnits().forEach((unit) => {
        if (isExcludedUnitValue(unit, excludedUnits) || HIDDEN_OFFICIAL_UNIT_VALUES.has(String(unit || '').trim())) return;
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
          .filter((child) => !isExcludedUnitValue(composeUnitValue(parent, child), excludedUnits))
          .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      });

      return merged;
    }

    function splitUnitValue(unitValue) {
      const raw = String(unitValue || '').trim();
      if (!raw) return { parent: '', child: '' };
      const sep = raw.includes('\uFF0F') ? '\uFF0F' : (raw.includes('/') ? '/' : '');
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
      return c ? `${p}\uFF0F${c}` : p;
    }

    function getTopLevelUnitOfficialMeta(unitValue) {
      const parsed = splitUnitValue(unitValue);
      const parent = String(parsed.parent || unitValue || '').trim();
      if (!parent) return null;
      return getOfficialUnitMeta(parent) || getOfficialUnitMeta(unitValue) || null;
    }

    function categorizeTopLevelUnit(unitValue) {
      const unit = String(splitUnitValue(unitValue).parent || unitValue || '').trim();
      if (TRAINING_CENTER_OVERRIDE_UNITS.has(unit)) return TRAINING_UNIT_CATEGORY_CENTER;
      if (!unit || isCorruptedUnitValue(unit)) return TRAINING_UNIT_CATEGORY_ADMIN;
      if (UNIT_ADMIN_PRIMARY_WHITELIST.has(unit)) return TRAINING_UNIT_CATEGORY_ADMIN;
      if (UNIT_ACADEMIC_PRIMARY_WHITELIST.has(unit)) return TRAINING_UNIT_CATEGORY_ACADEMIC;
      const meta = getTopLevelUnitOfficialMeta(unit) || {};
      const code = String(meta.topCode || meta.code || '').trim().toUpperCase();
      const academicKeywords = ['學院', '學系', '研究所', '學位學程', '共同教育中心', '進修推廣學院', '國際學院'];
      const centerKeywords = ['中心', '研究中心', '辦公室', '委員會', '聯盟', '聯合辦公室', '館'];
      if (academicKeywords.some((keyword) => unit.includes(keyword))) return TRAINING_UNIT_CATEGORY_ACADEMIC;
      if (centerKeywords.some((keyword) => unit.includes(keyword))) return TRAINING_UNIT_CATEGORY_CENTER;
      if (/^0\.\d{2}$/.test(code)) {
        const numeric = Number(code.slice(2));
        if (numeric >= 51) return TRAINING_UNIT_CATEGORY_ACADEMIC;
        return TRAINING_UNIT_CATEGORY_ADMIN;
      }
      if (/^0\.[A-Z0-9]{2}$/.test(code)) return TRAINING_UNIT_CATEGORY_CENTER;
      return TRAINING_UNIT_CATEGORY_ADMIN;
    }

    function isTrainingDashboardExcludedUnit(unitValue) {
      const unit = String(splitUnitValue(unitValue).parent || unitValue || '').trim();
      return !!unit && TRAINING_DASHBOARD_EXCLUDED_UNITS.has(unit);
    }

    function getTrainingUnitCategories() {
      return [TRAINING_UNIT_CATEGORY_ADMIN, TRAINING_UNIT_CATEGORY_ACADEMIC, TRAINING_UNIT_CATEGORY_CENTER];
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
        .replace(/[()（）．.、,，:：;；\\-_'"]/g, '');
    }

    function buildUnitSearchEntry(unitValue) {
      const value = String(unitValue || '').trim();
      if (!value || isCorruptedUnitValue(value) || HIDDEN_OFFICIAL_UNIT_VALUES.has(value)) return null;
      const meta = getOfficialUnitMeta(value) || {};
      const parsed = splitUnitValue(value);
      const parent = parsed.parent || value;
      const child = parsed.child || '';
      if (isCorruptedUnitValue(parent) || isCorruptedUnitValue(child)) return null;
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

    function getUnitSearchEntries(extraValues, options) {
      const opts = options || {};
      const excludedUnits = normalizeExcludedUnitValues(opts.excludeUnits);
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
        if (isExcludedUnitValue(safeValue, excludedUnits)) return;
        seen.add(safeValue);
        values.push(safeValue);
      });
      (Array.isArray(extraValues) ? extraValues : []).forEach((value) => {
        const safeValue = String(value || '').trim();
        if (!safeValue || seen.has(safeValue)) return;
        if (isExcludedUnitValue(safeValue, excludedUnits)) return;
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
        <input type="search" class="form-input unit-cascade-search-input" id="${baseId}-search" data-testid="${baseId}-search" placeholder="\u53ef\u641c\u5c0b\u55ae\u4f4d\u540d\u7a31\u6216\u4ee3\u78bc" autocomplete="off" role="combobox" aria-label="\u641c\u5c0b\u55ae\u4f4d" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="${baseId}-search-results" ${dis}>
        <div class="unit-cascade-search-results" id="${baseId}-search-results" role="listbox" aria-label="\u641c\u5c0b\u5efa\u8b70" hidden></div>
        <div class="form-hint unit-cascade-search-hint">\u53ef\u76f4\u63a5\u8f38\u5165\u55ae\u4f4d\u540d\u7a31\u6216\u4ee3\u78bc\uff0c\u7cfb\u7d71\u6703\u81ea\u52d5\u5e36\u5165\u985e\u5225\u8207\u5c64\u7d1a\u3002</div>
      </div>
      <div class="unit-cascade-grid unit-cascade-grid--training" id="${baseId}-grid">
        <div class="unit-cascade-segment">
          <select class="form-select" id="${baseId}-category" data-testid="${baseId}-category" aria-label="\u55ae\u4f4d\u985e\u5225" ${dis} ${req}></select>
        </div>
        <div class="unit-cascade-segment">
          <select class="form-select" id="${baseId}-parent" data-testid="${baseId}-parent" aria-label="\u4e00\u7d1a\u55ae\u4f4d" ${dis} ${req}></select>
        </div>
        <div class="unit-cascade-child-wrap" id="${baseId}-child-wrap">
          <select class="form-select" id="${baseId}-child" data-testid="${baseId}-child" aria-label="\u4e8c\u7d1a\u55ae\u4f4d" ${dis}></select>
        </div>
      </div>
      <div class="unit-cascade-custom unit-cascade-custom--hidden" id="${baseId}-custom-wrap">
        <input type="text" class="form-input" id="${baseId}-custom" data-testid="${baseId}-custom" aria-label="\u81ea\u8a02\u55ae\u4f4d\u540d\u7a31" placeholder="\u8acb\u8f38\u5165\u81ea\u8a02\u55ae\u4f4d\u540d\u7a31" ${dis}>
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
      if (typeof hiddenEl.__unitCascadeCleanup__ === 'function') {
        try { hiddenEl.__unitCascadeCleanup__(); } catch (_) {}
      }

      const allowCustom = isAdmin() && !opts.disabled && !!customWrap && !!customEl;
      const structure = getSelectableUnitStructure({ excludeUnits: opts.excludeUnits });
      const rawInitial = String(initialValue || hiddenEl.value || '').trim();
      const searchEntries = getUnitSearchEntries(rawInitial ? [rawInitial] : [], { excludeUnits: opts.excludeUnits });
      const parsed = splitUnitValue(rawInitial);
      const knownParents = new Set(Object.keys(structure || {}));
      const isInitialCustom = allowCustom && !!rawInitial && !!parsed.parent && !knownParents.has(parsed.parent);
      const listboxId = `${baseId}-search-results`;

      const parentSet = new Set(knownParents);
      if (parsed.parent && !isInitialCustom) parentSet.add(parsed.parent);
      const parents = Array.from(parentSet).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      const initialCategory = parsed.parent ? categorizeTopLevelUnit(parsed.parent) : '';
      let activeSearchIndex = -1;
      let searchBlurTimer = null;
      const cleanupFns = [];

      const bindCascadeEvent = (target, type, listener, eventOptions) => {
        if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') return function () {};
        target.addEventListener(type, listener, eventOptions);
        const cleanup = () => {
          try { target.removeEventListener(type, listener, eventOptions); } catch (_) {}
        };
        cleanupFns.push(cleanup);
        return cleanup;
      };

      const destroy = () => {
        if (searchBlurTimer) {
          window.clearTimeout(searchBlurTimer);
          searchBlurTimer = null;
        }
        while (cleanupFns.length) {
          const cleanup = cleanupFns.pop();
          try { cleanup(); } catch (_) {}
        }
        if (hiddenEl.__unitCascadeCleanup__ === destroy) {
          delete hiddenEl.__unitCascadeCleanup__;
        }
      };

      hiddenEl.__unitCascadeCleanup__ = destroy;
      if (typeof opts.registerCleanup === 'function') {
        opts.registerCleanup(destroy);
      }

      categoryEl.innerHTML =
        '<option value="">\u9078\u55ae\u4f4d\u985e\u5225</option>' +
        getTrainingUnitCategories().map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');

      const setSearchExpanded = (expanded) => {
        if (!searchEl) return;
        searchEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (!expanded) searchEl.removeAttribute('aria-activedescendant');
      };

      const setCustomMode = (enabled) => {
        if (!customWrap || !customEl) return;
        customWrap.classList.toggle('unit-cascade-custom--hidden', !enabled);
        customEl.required = !!enabled;
      };

      const hideSearchResults = () => {
        if (!searchResultsEl) return;
        searchResultsEl.hidden = true;
        searchResultsEl.innerHTML = '';
        activeSearchIndex = -1;
        setSearchExpanded(false);
      };

      const setActiveSearchOption = (index) => {
        if (!searchEl || !searchResultsEl) return;
        const options = Array.from(searchResultsEl.querySelectorAll('[data-unit-value]'));
        if (!options.length) {
          activeSearchIndex = -1;
          searchEl.removeAttribute('aria-activedescendant');
          return;
        }
        const boundedIndex = Math.max(0, Math.min(index, options.length - 1));
        activeSearchIndex = boundedIndex;
        options.forEach((button, buttonIndex) => {
          const isActive = buttonIndex === boundedIndex;
          button.classList.toggle('is-active', isActive);
          button.setAttribute('aria-selected', isActive ? 'true' : 'false');
          if (isActive) {
            searchEl.setAttribute('aria-activedescendant', button.id);
            button.scrollIntoView({ block: 'nearest' });
          }
        });
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

      const renderParents = (category, selectedParent) => {
        const targetCategory = String(category || '').trim();
        const parent = String(selectedParent || '').trim();
        if (!targetCategory) {
          parentEl.innerHTML = '<option value="">\u8acb\u5148\u9078\u55ae\u4f4d\u985e\u5225</option>';
          parentEl.disabled = true;
          if (childWrap) childWrap.style.display = 'none';
          childEl.innerHTML = '<option value="">\u8acb\u5148\u9078\u4e00\u7d1a\u55ae\u4f4d</option>';
          childEl.disabled = true;
          return;
        }
        const categoryParents = getParentsByUnitCategory(parents, targetCategory);
        const parentOptions = parent && !categoryParents.includes(parent) ? [parent].concat(categoryParents) : categoryParents;
        parentEl.disabled = false;
        parentEl.innerHTML =
          '<option value="">\u9078\u64c7\u4e00\u7d1a\u55ae\u4f4d</option>' +
          parentOptions.map((item) => `<option value="${esc(item)}">${esc(getUnitOptionLabel(item, item))}</option>`).join('') +
          (allowCustom ? `<option value="${UNIT_CUSTOM_VALUE}">${UNIT_CUSTOM_LABEL}</option>` : '');
        if (parent) parentEl.value = parent;
      };

      const renderChildren = (parent, selectedChild) => {
        const child = String(selectedChild || '').trim();

        if (allowCustom && parent === UNIT_CUSTOM_VALUE) {
          childEl.innerHTML = '<option value="">\u8acb\u8f38\u5165\u81ea\u8a02\u55ae\u4f4d</option>';
          childEl.disabled = true;
          if (childWrap) childWrap.style.display = 'none';
          return;
        }

        const children = Array.isArray(structure[parent]) ? [...structure[parent]] : [];
        if (child && !children.includes(child)) children.unshift(child);

        if (!parent) {
          childEl.innerHTML = '<option value="">\u8acb\u5148\u9078\u4e00\u7d1a\u55ae\u4f4d</option>';
          childEl.disabled = true;
          if (childWrap) childWrap.style.display = 'none';
          return;
        }

        if (children.length === 0) {
          childEl.innerHTML = '<option value="">\u6b64\u55ae\u4f4d\u7121\u4e8c\u7d1a\u55ae\u4f4d</option>';
          childEl.disabled = true;
          if (childWrap) childWrap.style.display = 'none';
          return;
        }

        childEl.disabled = false;
        if (childWrap) childWrap.style.display = '';
        childEl.innerHTML = '<option value="">\u9078\u64c7\u4e8c\u7d1a\u55ae\u4f4d</option>' + children.map((c) => {
          const unitValue = composeUnitValue(parent, c);
          return `<option value="${esc(c)}">${esc(getUnitOptionLabel(unitValue, c))}</option>`;
        }).join('');
        if (child) childEl.value = child;
      };

      const syncHidden = (dispatchChange) => {
        const parent = String(parentEl.value || '').trim();

        if (allowCustom && parent === UNIT_CUSTOM_VALUE) {
          setCustomMode(true);
          customEl.placeholder = '\u8acb\u8f38\u5165\u81ea\u8a02\u55ae\u4f4d';
          childEl.innerHTML = '<option value="">\u8acb\u8f38\u5165\u81ea\u8a02\u55ae\u4f4d</option>';
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
          .slice(0, 20);
        if (!matches.length) {
          searchResultsEl.hidden = false;
          setSearchExpanded(true);
          searchResultsEl.innerHTML = '<div class="unit-cascade-search-empty">\u627e\u4e0d\u5230\u7b26\u5408\u7684\u55ae\u4f4d\uff0c\u53ef\u6539\u7528\u4e0b\u65b9\u5c64\u7d1a\u9078\u64c7\u3002</div>';
          return;
        }
        searchResultsEl.hidden = false;
        setSearchExpanded(true);
        searchResultsEl.innerHTML = matches.map((entry) => {
          const meta = [entry.category, entry.code ? ('\u4ee3\u78bc ' + entry.code) : '', entry.child ? entry.parent : ''].filter(Boolean).join(' \u00b7 ');
          const optionId = `${listboxId}-option-${entry.value.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
          return '<button type="button" class="unit-cascade-search-option" id="' + esc(optionId) + '" role="option" aria-selected="false" data-unit-value="' + esc(entry.value) + '"><span class="unit-cascade-search-option-title">' + esc(entry.fullLabel) + '</span><span class="unit-cascade-search-option-meta">' + esc(meta) + '</span></button>';
        }).join('');
        searchResultsEl.querySelectorAll('[data-unit-value]').forEach((button) => {
          bindCascadeEvent(button, 'mousedown', (event) => {
            event.preventDefault();
            applySelectedUnit(button.dataset.unitValue);
          });
          bindCascadeEvent(button, 'mouseenter', () => {
            const options = Array.from(searchResultsEl.querySelectorAll('[data-unit-value]'));
            setActiveSearchOption(options.indexOf(button));
          });
        });
        setActiveSearchOption(0);
      };

      bindCascadeEvent(categoryEl, 'change', () => {
        renderParents(categoryEl.value, '');
        renderChildren('', '');
        syncHidden(true);
      });
      bindCascadeEvent(parentEl, 'change', () => {
        renderChildren(parentEl.value, '');
        syncHidden(true);
      });
      bindCascadeEvent(childEl, 'change', () => syncHidden(true));
      if (allowCustom) bindCascadeEvent(customEl, 'input', () => syncHidden(true));

      if (isInitialCustom) {
        categoryEl.value = initialCategory || '\u4e2d\u5fc3\uff0f\u7814\u7a76\u55ae\u4f4d';
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
        bindCascadeEvent(searchEl, 'input', (event) => renderSearchResults(event.target.value));
        bindCascadeEvent(searchEl, 'focus', () => {
          if (searchBlurTimer) {
            window.clearTimeout(searchBlurTimer);
            searchBlurTimer = null;
          }
          if (String(searchEl.value || '').trim()) renderSearchResults(searchEl.value);
        });
        bindCascadeEvent(searchEl, 'keydown', (event) => {
          const options = Array.from(searchResultsEl?.querySelectorAll('[data-unit-value]') || []);
          if (event.key === 'Escape') {
            hideSearchResults();
            return;
          }
          if (event.key === 'ArrowDown') {
            if (options.length) {
              event.preventDefault();
              setActiveSearchOption(activeSearchIndex < 0 ? 0 : Math.min(activeSearchIndex + 1, options.length - 1));
            }
            return;
          }
          if (event.key === 'ArrowUp') {
            if (options.length) {
              event.preventDefault();
              setActiveSearchOption(activeSearchIndex <= 0 ? 0 : activeSearchIndex - 1);
            }
            return;
          }
          if (event.key === 'Enter') {
            const activeMatch = activeSearchIndex >= 0 ? options[activeSearchIndex] : options[0];
            if (activeMatch) {
              event.preventDefault();
              applySelectedUnit(activeMatch.dataset.unitValue);
            }
          }
        });
        bindCascadeEvent(searchEl, 'blur', () => {
          searchBlurTimer = window.setTimeout(hideSearchResults, UNIT_CASCADE_SEARCH_BLUR_DELAY_MS);
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
      return { destroy };
    }

    return {
      getOfficialUnits,
      getOfficialUnitCatalog,
      getOfficialUnitMeta,
      getUnitCode,
      getUnitCodeWithDots,
      getUnitOptionLabel,
      getSystemUnits,
      isOfficialUnit,
      formatUnitScopeSummary,
      approveCustomUnit,
      getCustomUnitRegistry,
      mergeCustomUnit,
      getSelectableUnitStructure,
      splitUnitValue,
      composeUnitValue,
      categorizeTopLevelUnit,
      isTrainingDashboardExcludedUnit,
      getTrainingUnitCategories,
      getParentsByUnitCategory,
      buildUnitSearchEntry,
      getUnitSearchEntries,
      buildUnitCascadeControl,
      initUnitCascade
    };
  };
})();
