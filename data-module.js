(function () {
  window.createDataModule = function createDataModule(deps) {
    const {
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
    } = deps;

    const STORAGE_CACHE = Object.create(null);
    const STORE_VERSIONS = {
      [DATA_KEY]: 1,
      [CHECKLIST_KEY]: 1,
      [TEMPLATE_KEY]: 1,
      [TRAINING_KEY]: 1,
      [LOGIN_LOG_KEY]: 1,
      [UNIT_REVIEW_KEY]: 1
    };
    const STORE_LABELS = {
      [DATA_KEY]: '矯正單與帳號資料',
      [CHECKLIST_KEY]: '內稽檢核表資料',
      [TEMPLATE_KEY]: '檢核表題庫模板',
      [TRAINING_KEY]: '教育訓練資料',
      [LOGIN_LOG_KEY]: '登入紀錄',
      [UNIT_REVIEW_KEY]: '單位治理資料'
    };

    function getStoreVersion(key) {
      return Number(STORE_VERSIONS[key] || 1);
    }

    function getManagedStoreKeys() {
      return Object.keys(STORE_VERSIONS);
    }

    function createStoreEnvelope(key, payload) {
      return {
        version: getStoreVersion(key),
        payload
      };
    }

    function isStoreEnvelope(value) {
      return !!value
        && typeof value === 'object'
        && Number.isFinite(Number(value.version))
        && Object.prototype.hasOwnProperty.call(value, 'payload');
    }

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

    function migrateDataStoreToV1(payload) {
      const base = payload && typeof payload === 'object' ? payload : {};
      return {
        items: Array.isArray(base.items) ? base.items : [],
        users: Array.isArray(base.users) ? base.users : DEFAULT_USERS.map((user) => ({ ...user })),
        nextId: Number.isFinite(Number(base.nextId)) ? Number(base.nextId) : 1
      };
    }

    function migrateChecklistStoreToV1(payload) {
      const base = payload && typeof payload === 'object' ? payload : {};
      return {
        items: Array.isArray(base.items) ? base.items : [],
        nextId: Number.isFinite(Number(base.nextId)) ? Number(base.nextId) : 1
      };
    }

    function migrateTrainingStoreToV1(payload) {
      const base = payload && typeof payload === 'object' ? payload : {};
      return {
        forms: Array.isArray(base.forms) ? base.forms : [],
        rosters: Array.isArray(base.rosters) ? base.rosters : [],
        nextFormId: Number.isFinite(Number(base.nextFormId)) ? Number(base.nextFormId) : 1,
        nextRosterId: Number.isFinite(Number(base.nextRosterId)) ? Number(base.nextRosterId) : 1
      };
    }

    function migrateLoginLogStoreToV1(payload) {
      return Array.isArray(payload) ? payload : [];
    }

    function migrateUnitReviewStoreToV1(payload) {
      const base = payload && typeof payload === 'object' ? payload : {};
      return {
        approvedUnits: Array.isArray(base.approvedUnits) ? base.approvedUnits : [],
        history: Array.isArray(base.history) ? base.history : []
      };
    }

    function migrateChecklistTemplateStoreToV1(payload) {
      return Array.isArray(payload) && payload.length
        ? payload
        : JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS));
    }

    const STORE_MIGRATIONS = {
      [DATA_KEY]: {
        1: migrateDataStoreToV1
      },
      [CHECKLIST_KEY]: {
        1: migrateChecklistStoreToV1
      },
      [TEMPLATE_KEY]: {
        1: migrateChecklistTemplateStoreToV1
      },
      [TRAINING_KEY]: {
        1: migrateTrainingStoreToV1
      },
      [LOGIN_LOG_KEY]: {
        1: migrateLoginLogStoreToV1
      },
      [UNIT_REVIEW_KEY]: {
        1: migrateUnitReviewStoreToV1
      }
    };

    function runStoreMigrations(key, payload, fromVersion) {
      const targetVersion = getStoreVersion(key);
      const migrations = STORE_MIGRATIONS[key] || {};
      let nextValue = payload;
      let version = Number.isFinite(Number(fromVersion)) ? Number(fromVersion) : 0;
      let changed = false;

      while (version < targetVersion) {
        const nextVersion = version + 1;
        const migrate = migrations[nextVersion];
        nextValue = typeof migrate === 'function' ? migrate(nextValue) : nextValue;
        version = nextVersion;
        changed = true;
      }

      return {
        value: nextValue,
        version,
        changed
      };
    }

    function readVersionedStore(key, fallbackFactory) {
      const fallback = typeof fallbackFactory === 'function' ? fallbackFactory : (() => undefined);
      const hadStoredValue = localStorage.getItem(key) !== null;
      const rawValue = readCachedJson(key, () => createStoreEnvelope(key, fallback()));
      const envelope = isStoreEnvelope(rawValue)
        ? rawValue
        : { version: 0, payload: rawValue };
      const migrated = runStoreMigrations(key, envelope.payload, envelope.version);
      if (!hadStoredValue || !isStoreEnvelope(rawValue) || migrated.changed || envelope.version !== getStoreVersion(key)) {
        writeVersionedStore(key, migrated.value);
      }
      return migrated.value;
    }

    function writeVersionedStore(key, payload) {
      writeCachedJson(key, createStoreEnvelope(key, payload));
    }

    function migrateAllStores() {
      readVersionedStore(DATA_KEY, createDefaultData);
      readVersionedStore(CHECKLIST_KEY, emptyChecklistStore);
      readVersionedStore(TEMPLATE_KEY, cloneDefaultChecklistSections);
      readVersionedStore(TRAINING_KEY, emptyTrainingStore);
      readVersionedStore(LOGIN_LOG_KEY, () => []);
      readVersionedStore(UNIT_REVIEW_KEY, emptyUnitReviewStore);
    }

    function inspectRawStore(key) {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) {
        return {
          key,
          exists: false,
          raw,
          parsed: null,
          parseError: '',
          rawSize: 0
        };
      }
      try {
        return {
          key,
          exists: true,
          raw,
          parsed: JSON.parse(raw),
          parseError: '',
          rawSize: raw.length
        };
      } catch (error) {
        return {
          key,
          exists: true,
          raw,
          parsed: null,
          parseError: String(error && error.message || 'JSON parse error'),
          rawSize: raw.length
        };
      }
    }

    function summarizeStorePayload(key, payload) {
      switch (key) {
        case DATA_KEY: {
          const items = Array.isArray(payload && payload.items) ? payload.items.length : 0;
          const users = Array.isArray(payload && payload.users) ? payload.users.length : 0;
          return {
            shape: 'items + users',
            recordCount: items + users,
            summary: `${items} 筆矯正單 / ${users} 位使用者`
          };
        }
        case CHECKLIST_KEY: {
          const items = Array.isArray(payload && payload.items) ? payload.items.length : 0;
          return {
            shape: 'items + nextId',
            recordCount: items,
            summary: `${items} 份檢核表`
          };
        }
        case TEMPLATE_KEY: {
          const sections = Array.isArray(payload) ? payload : [];
          const questions = sections.reduce((sum, section) => sum + (Array.isArray(section && section.items) ? section.items.length : 0), 0);
          return {
            shape: 'section[]',
            recordCount: questions,
            summary: `${sections.length} 個章節 / ${questions} 題`
          };
        }
        case TRAINING_KEY: {
          const forms = Array.isArray(payload && payload.forms) ? payload.forms.length : 0;
          const rosters = Array.isArray(payload && payload.rosters) ? payload.rosters.length : 0;
          return {
            shape: 'forms + rosters',
            recordCount: forms + rosters,
            summary: `${forms} 張填報單 / ${rosters} 筆名單`
          };
        }
        case LOGIN_LOG_KEY: {
          const logs = Array.isArray(payload) ? payload.length : 0;
          return {
            shape: 'log[]',
            recordCount: logs,
            summary: `${logs} 筆登入事件`
          };
        }
        case UNIT_REVIEW_KEY: {
          const approved = Array.isArray(payload && payload.approvedUnits) ? payload.approvedUnits.length : 0;
          const history = Array.isArray(payload && payload.history) ? payload.history.length : 0;
          return {
            shape: 'approvedUnits + history',
            recordCount: approved + history,
            summary: `${approved} 筆核准保留 / ${history} 筆治理紀錄`
          };
        }
        default:
          return {
            shape: typeof payload,
            recordCount: 0,
            summary: '未知資料格式'
          };
      }
    }

    function getSchemaHealth() {
      const stores = getManagedStoreKeys().map((key) => {
        const rawInfo = inspectRawStore(key);
        const expectedVersion = getStoreVersion(key);
        const hasEnvelope = !!rawInfo.exists && !rawInfo.parseError && isStoreEnvelope(rawInfo.parsed);
        const storedVersion = !rawInfo.exists
          ? null
          : (hasEnvelope ? Number(rawInfo.parsed.version) : (rawInfo.parseError ? null : 0));
        const payload = hasEnvelope ? rawInfo.parsed.payload : rawInfo.parsed;
        const migrationNeeded = !!rawInfo.exists && !rawInfo.parseError && (!hasEnvelope || storedVersion !== expectedVersion);
        const diagnostics = rawInfo.parseError
          ? { shape: 'invalid-json', recordCount: 0, summary: 'JSON 解析失敗' }
          : summarizeStorePayload(key, payload);
        let status = 'healthy';
        let statusLabel = '正常';
        if (rawInfo.parseError) {
          status = 'error';
          statusLabel = '損毀';
        } else if (!rawInfo.exists) {
          status = 'missing';
          statusLabel = '尚未建立';
        } else if (migrationNeeded) {
          status = 'attention';
          statusLabel = '待升級';
        }
        return {
          key,
          label: STORE_LABELS[key] || key,
          exists: rawInfo.exists,
          status,
          statusLabel,
          expectedVersion,
          storedVersion,
          hasEnvelope,
          migrationNeeded,
          parseError: rawInfo.parseError,
          rawSize: rawInfo.rawSize,
          shape: diagnostics.shape,
          recordCount: diagnostics.recordCount,
          summary: diagnostics.summary
        };
      });
      const totals = stores.reduce((acc, store) => {
        acc.totalStores += 1;
        acc.totalRecords += Number(store.recordCount || 0);
        if (store.status === 'healthy') acc.healthy += 1;
        if (store.status === 'attention') acc.attention += 1;
        if (store.status === 'error') acc.error += 1;
        if (store.status === 'missing') acc.missing += 1;
        return acc;
      }, {
        totalStores: 0,
        totalRecords: 0,
        healthy: 0,
        attention: 0,
        error: 0,
        missing: 0
      });
      return {
        generatedAt: new Date().toISOString(),
        stores,
        totals
      };
    }

    function createDefaultData() {
      return { items: [], users: DEFAULT_USERS.map((user) => ({ ...user })), nextId: 1 };
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
      if (Array.isArray(value)) {
        return Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean)));
      }
      if (typeof value === 'string') {
        return Array.from(new Set(value.split(/\r?\n|,|;|\|/).map((entry) => String(entry || '').trim()).filter(Boolean)));
      }
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

    function loadData() {
      const data = readVersionedStore(DATA_KEY, createDefaultData);
      if (!Array.isArray(data.users)) data.users = DEFAULT_USERS.map((user) => ({ ...user }));
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

    function saveData(data) { writeVersionedStore(DATA_KEY, data); }
    function getAllItems() { return loadData().items.slice(); }
    function getItem(id) { return loadData().items.find((item) => item.id === id); }
    function addItem(item) {
      const data = loadData();
      data.items.push(item);
      saveData(data);
    }
    function updateItem(id, updates) {
      const data = loadData();
      const index = data.items.findIndex((item) => item.id === id);
      if (index >= 0) {
        data.items[index] = { ...data.items[index], ...updates };
        saveData(data);
      }
    }
    function getUsers() { return loadData().users.slice().map((user) => normalizeUserRecord(user)); }
    function addUser(user) {
      const data = loadData();
      data.users.push(normalizeUserRecord(user));
      saveData(data);
    }
    function updateUser(username, updates) {
      const data = loadData();
      const index = data.users.findIndex((user) => user.username === username);
      if (index >= 0) {
        data.users[index] = normalizeUserRecord({ ...data.users[index], ...updates });
        saveData(data);
      }
    }
    function deleteUser(username) {
      const data = loadData();
      data.users = data.users.filter((user) => user.username !== username);
      saveData(data);
    }
    function findUser(username) {
      const user = loadData().users.find((entry) => entry.username === username);
      return user ? normalizeUserRecord(user) : null;
    }
    function findUserByEmail(email) {
      const user = loadData().users.find((entry) => entry.email && entry.email.toLowerCase() === String(email || '').toLowerCase());
      return user ? normalizeUserRecord(user) : null;
    }

    function loadLoginLogs() {
      const logs = readVersionedStore(LOGIN_LOG_KEY, () => []);
      return Array.isArray(logs) ? logs : [];
    }

    function saveLoginLogs(logs) {
      writeVersionedStore(LOGIN_LOG_KEY, Array.isArray(logs) ? logs : []);
    }

    function addLoginLog(username, user, success) {
      const logs = loadLoginLogs();
      logs.push({
        time: new Date().toISOString(),
        username: String(username || '').trim(),
        name: user?.name || '',
        role: user?.role || '',
        success: !!success
      });
      if (logs.length > 500) logs.splice(0, logs.length - 500);
      saveLoginLogs(logs);
    }

    function clearLoginLogs() {
      removeCachedJson(LOGIN_LOG_KEY);
    }

    function emptyUnitReviewStore() {
      return { approvedUnits: [], history: [] };
    }

    function loadUnitReviewStore() {
      const raw = readVersionedStore(UNIT_REVIEW_KEY, emptyUnitReviewStore);
      if (!raw || typeof raw !== 'object') return emptyUnitReviewStore();
      if (!Array.isArray(raw.approvedUnits)) raw.approvedUnits = [];
      if (!Array.isArray(raw.history)) raw.history = [];
      return raw;
    }

    function saveUnitReviewStore(store) {
      writeVersionedStore(UNIT_REVIEW_KEY, store);
    }

    function cloneDefaultChecklistSections() {
      return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS));
    }

    function getChecklistSections() {
      const saved = readVersionedStore(TEMPLATE_KEY, cloneDefaultChecklistSections);
      return Array.isArray(saved) && saved.length ? saved : cloneDefaultChecklistSections();
    }

    function saveChecklistSections(sections) {
      writeVersionedStore(TEMPLATE_KEY, Array.isArray(sections) ? sections : cloneDefaultChecklistSections());
    }

    function emptyChecklistStore() {
      return { items: [], nextId: 1 };
    }

    function normalizeChecklistStatus(status) {
      const value = String(status || '').trim();
      const lower = value.toLowerCase();
      if (!value || value === CHECKLIST_STATUS_DRAFT || lower === 'draft') return CHECKLIST_STATUS_DRAFT;
      if (value === '已提交' || value === CHECKLIST_STATUS_SUBMITTED || lower === 'submitted') return CHECKLIST_STATUS_SUBMITTED;
      return value;
    }

    function isChecklistDraftStatus(status) {
      return normalizeChecklistStatus(status) === CHECKLIST_STATUS_DRAFT;
    }

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
      const raw = readVersionedStore(CHECKLIST_KEY, emptyChecklistStore);
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

    function saveChecklists(store) { writeVersionedStore(CHECKLIST_KEY, store); }
    function getAllChecklists() { return loadChecklists().items.slice(); }
    function getChecklist(id) { return loadChecklists().items.find((item) => item.id === id); }
    function addChecklist(item) {
      const store = loadChecklists();
      store.items.push(normalizeChecklistItem(item));
      saveChecklists(store);
    }
    function updateChecklist(id, updates) {
      const store = loadChecklists();
      const index = store.items.findIndex((item) => item.id === id);
      if (index < 0) return false;
      store.items[index] = normalizeChecklistItem({ ...store.items[index], ...updates });
      saveChecklists(store);
      return true;
    }

    function emptyTrainingStore() {
      return { forms: [], rosters: [], nextFormId: 1, nextRosterId: 1 };
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

      let completedGeneral = isTrainingBooleanValue(String(normalized.completedGeneral || '').trim())
        ? String(normalized.completedGeneral || '').trim()
        : '';
      if (!completedGeneral && status === '在職' && hasTrainingValue(normalized.hours)) {
        completedGeneral = Number(normalized.hours || 0) >= 3 ? '是' : '否';
      }

      let isInfoStaff = isTrainingBooleanValue(String(normalized.isInfoStaff || '').trim())
        ? String(normalized.isInfoStaff || '').trim()
        : '';
      if (!isInfoStaff && isTrainingBooleanValue(String(normalized.outsourced || '').trim())) {
        isInfoStaff = String(normalized.outsourced || '').trim();
      }

      let completedProfessional = normalizeTrainingProfessionalValue(normalized.completedProfessional || '');
      if (!completedProfessional) completedProfessional = normalizeTrainingProfessionalValue(normalized.completedInfo || '');

      if (status !== '在職') {
        completedGeneral = '';
        isInfoStaff = '';
        completedProfessional = '';
      } else {
        if (!isTrainingBooleanValue(completedGeneral)) completedGeneral = '';
        if (!isTrainingBooleanValue(isInfoStaff)) isInfoStaff = '';
        if (isInfoStaff === '否') {
          completedProfessional = '不適用';
        } else if (isInfoStaff === '是') {
          if (!isTrainingBooleanValue(completedProfessional)) completedProfessional = '';
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
      const raw = readVersionedStore(TRAINING_KEY, emptyTrainingStore);
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
      writeVersionedStore(TRAINING_KEY, store);
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

    function exportManagedStoreSnapshot() {
      return getManagedStoreKeys().reduce((acc, key) => {
        acc[key] = inspectRawStore(key).parsed;
        return acc;
      }, {});
    }

    return {
      parseUserUnits,
      normalizeUserRole,
      getAuthorizedUnits,
      getActiveUnit,
      normalizeUserRecord,
      loadData,
      saveData,
      getAllItems,
      getItem,
      addItem,
      updateItem,
      getUsers,
      addUser,
      updateUser,
      deleteUser,
      findUser,
      findUserByEmail,
      loadLoginLogs,
      saveLoginLogs,
      addLoginLog,
      clearLoginLogs,
      loadUnitReviewStore,
      saveUnitReviewStore,
      getChecklistSections,
      saveChecklistSections,
      normalizeChecklistStatus,
      isChecklistDraftStatus,
      normalizeChecklistItem,
      loadChecklists,
      saveChecklists,
      getAllChecklists,
      getChecklist,
      addChecklist,
      updateChecklist,
      normalizeTrainingRosterRow,
      normalizeTrainingRecordState,
      normalizeTrainingRecordRow,
      normalizeTrainingForm,
      loadTrainingStore,
      saveTrainingStore,
      getAllTrainingForms,
      getTrainingForm,
      upsertTrainingForm,
      updateTrainingForm,
      getAllTrainingRosters,
      getTrainingRosterByUnit,
      addTrainingRosterPerson,
      deleteTrainingRosterPerson,
      updateTrainingRosterPerson
      ,
      migrateAllStores,
      getStoreVersion,
      getSchemaHealth,
      exportManagedStoreSnapshot
    };
  };
})();
