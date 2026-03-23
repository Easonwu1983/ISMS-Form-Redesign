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
      UNIT_CONTACT_APP_KEY,
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
    const STORE_TOUCH_TOKENS = Object.create(null);
    const STORE_LOCKS = Object.create(null);
    let storageListenerInstalled = false;
    const STORAGE_WARNING_KEYS = Object.create(null);
    const STORE_VERSIONS = {
      [DATA_KEY]: 1,
      [CHECKLIST_KEY]: 1,
      [TEMPLATE_KEY]: 1,
      [TRAINING_KEY]: 1,
      [LOGIN_LOG_KEY]: 1,
      [UNIT_REVIEW_KEY]: 1,
      [UNIT_CONTACT_APP_KEY]: 1
    };
    const STORE_LABELS = {
      [DATA_KEY]: '矯正單與帳號資料',
      [CHECKLIST_KEY]: '內稽檢核表資料',
      [TEMPLATE_KEY]: '檢核表題庫模板',
      [TRAINING_KEY]: '教育訓練資料',
      [LOGIN_LOG_KEY]: '登入紀錄',
      [UNIT_REVIEW_KEY]: '單位治理資料'
    };

    STORE_LABELS[UNIT_CONTACT_APP_KEY] = '單位資安窗口申請';

    function getStoreVersion(key) {
      return Number(STORE_VERSIONS[key] || 1);
    }

    function getManagedStoreKeys() {
      return Object.keys(STORE_VERSIONS);
    }

    function createStoreEnvelope(key, payload, revision) {
      const envelope = {
        version: getStoreVersion(key),
        payload
      };
      const numericRevision = Number(revision);
      if (Number.isFinite(numericRevision) && numericRevision >= 0) {
        envelope.revision = Math.floor(numericRevision);
      }
      return envelope;
    }

    function isStoreEnvelope(value) {
      return !!value
        && typeof value === 'object'
        && Number.isFinite(Number(value.version))
        && Object.prototype.hasOwnProperty.call(value, 'payload');
    }

    function getStoreRevision(envelope) {
      if (!envelope || typeof envelope !== 'object') return 0;
      const revision = Number(envelope.revision);
      return Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0;
    }

    function installStorageCacheInvalidation() {
      if (storageListenerInstalled || typeof window === 'undefined' || !window.addEventListener) return;
      window.addEventListener('storage', function (event) {
        if (!event || !event.key) {
          Object.keys(STORAGE_CACHE).forEach(function (cacheKey) {
            delete STORAGE_CACHE[cacheKey];
          });
          Object.keys(STORE_TOUCH_TOKENS).forEach(function (storeKey) {
            delete STORE_TOUCH_TOKENS[storeKey];
          });
          return;
        }
        delete STORAGE_CACHE[event.key];
        touchStore(event.key);
      });
      storageListenerInstalled = true;
    }

    function touchStore(key) {
      const cleanKey = String(key || '').trim();
      if (!cleanKey) return;
      STORE_TOUCH_TOKENS[cleanKey] = (Number(STORE_TOUCH_TOKENS[cleanKey]) || 0) + 1;
    }

    function hasQuotaExceededError(error) {
      const code = Number(error && error.code);
      const name = String(error && error.name || '').trim();
      return code === 22 || code === 1014 || name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
    }

    function createStorageWriteError(error) {
      const wrapped = new Error(
        hasQuotaExceededError(error)
          ? '\u700f\u89bd\u5668\u66ab\u5b58\u7a7a\u9593\u4e0d\u8db3\uff0c\u7cfb\u7d71\u7121\u6cd5\u5beb\u5165\u6700\u65b0\u8cc7\u6599\u3002\u8acb\u6e05\u7406\u700f\u89bd\u5668\u5132\u5b58\u7a7a\u9593\u5f8c\u518d\u8a66\u3002'
          : '\u700f\u89bd\u5668\u66ab\u5b58\u5beb\u5165\u5931\u6557\uff0c\u7cfb\u7d71\u7121\u6cd5\u4fdd\u5b58\u6700\u65b0\u8cc7\u6599\u3002'
      );
      wrapped.code = hasQuotaExceededError(error) ? 'LOCAL_STORAGE_QUOTA' : 'LOCAL_STORAGE_WRITE_FAILED';
      wrapped.cause = error;
      return wrapped;
    }

    function emitStorageWarning(key, message) {
      if (typeof window === 'undefined' || !window.dispatchEvent) return;
      const warningKey = String(key || '').trim() + '::' + String(message || '').trim();
      if (!warningKey || STORAGE_WARNING_KEYS[warningKey]) return;
      STORAGE_WARNING_KEYS[warningKey] = true;
      try {
        window.dispatchEvent(new CustomEvent('isms:storage-warning', {
          detail: {
            key: String(key || '').trim(),
            message: String(message || '').trim()
          }
        }));
      } catch (_) {
        console.warn('[data-module] storage warning:', String(message || '').trim());
      }
    }

    function cloneStoreValue(value) {
      if (value === null || value === undefined) return value;
      return JSON.parse(JSON.stringify(value));
    }

    function readCachedJson(key, fallbackFactory) {
      installStorageCacheInvalidation();
      const raw = localStorage.getItem(key);
      const hit = STORAGE_CACHE[key];
      if (hit && hit.raw === raw) return hit.parsed;
      if (raw !== null && raw !== undefined) {
        try {
          const parsed = JSON.parse(raw);
          STORAGE_CACHE[key] = { raw, parsed };
          return parsed;
        } catch (_) {
          delete STORAGE_CACHE[key];
          localStorage.removeItem(key);
          touchStore(key);
          emitStorageWarning(key, '\u5075\u6e2c\u5230\u700f\u89bd\u5668\u66ab\u5b58\u8cc7\u6599\u640d\u6bc0\uff0c\u7cfb\u7d71\u5df2\u81ea\u52d5\u6e05\u9664\u4e26\u91cd\u65b0\u8f09\u5165\u3002');
        }
      }
      const fallback = fallbackFactory();
      STORAGE_CACHE[key] = { raw: JSON.stringify(fallback), parsed: fallback };
      return fallback;
    }

    function readStoreEnvelopeSnapshot(key) {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return null;
      try {
        const parsed = JSON.parse(raw);
        return isStoreEnvelope(parsed) ? parsed : { version: 0, payload: parsed };
      } catch (_) {
        return null;
      }
    }

    function writeCachedJson(key, value) {
      const raw = JSON.stringify(value);
      const previous = STORAGE_CACHE[key];
      try {
        localStorage.setItem(key, raw);
        STORAGE_CACHE[key] = { raw, parsed: value };
        touchStore(key);
      } catch (error) {
        if (previous) {
          STORAGE_CACHE[key] = previous;
        } else {
          delete STORAGE_CACHE[key];
        }
        throw createStorageWriteError(error);
      }
    }

    function removeCachedJson(key) {
      withStoreLock(key, function () {
        delete STORAGE_CACHE[key];
        localStorage.removeItem(key);
        touchStore(key);
      });
    }

    function parseStoreLockPayload(rawValue) {
      if (!rawValue) return null;
      try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
          owner: String(parsed.owner || '').trim(),
          expiresAt: Number(parsed.expiresAt || 0)
        };
      } catch (_) {
        return null;
      }
    }

    function acquireStoreLock(key) {
      const cleanKey = String(key || '').trim();
      if (!cleanKey) return null;
      const existing = STORE_LOCKS[cleanKey];
      if (existing) {
        existing.depth += 1;
        return existing;
      }
      const lockKey = cleanKey + '::__lock__';
      const owner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      // Keep lock acquisition short to avoid freezing the main thread during contention.
      const timeoutMs = 120;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() <= deadline) {
        const current = parseStoreLockPayload(localStorage.getItem(lockKey));
        if (!current || !current.owner || !Number.isFinite(current.expiresAt) || current.expiresAt < Date.now()) {
          const next = JSON.stringify({ owner, expiresAt: Date.now() + timeoutMs });
          localStorage.setItem(lockKey, next);
          if (localStorage.getItem(lockKey) === next) {
            const token = { key: cleanKey, lockKey, owner, depth: 1 };
            STORE_LOCKS[cleanKey] = token;
            return token;
          }
        }
        const pauseUntil = Date.now() + 1;
        while (Date.now() < pauseUntil) {
          // short spin to keep the lock synchronous and deterministic in browser storage
        }
      }
      throw new Error('瀏覽器暫存正在忙碌中，請稍後再試。');
    }

    function releaseStoreLock(token) {
      if (!token || !token.key) return;
      const current = STORE_LOCKS[token.key];
      if (!current) return;
      current.depth -= 1;
      if (current.depth > 0) return;
      delete STORE_LOCKS[token.key];
      const stored = parseStoreLockPayload(localStorage.getItem(token.lockKey));
      if (stored && stored.owner === token.owner) {
        localStorage.removeItem(token.lockKey);
      }
    }

    function withStoreLock(key, fn) {
      const cleanKey = String(key || '').trim();
      if (!cleanKey || typeof fn !== 'function') return fn();
      const token = acquireStoreLock(cleanKey);
      try {
        return fn();
      } finally {
        releaseStoreLock(token);
      }
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

    function migrateUnitContactApplicationStoreToV1(payload) {
      const base = payload && typeof payload === 'object' ? payload : {};
      return {
        applications: Array.isArray(base.applications) ? base.applications : [],
        nextId: Number.isFinite(Number(base.nextId)) ? Number(base.nextId) : 1
      };
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
      },
      [UNIT_CONTACT_APP_KEY]: {
        1: migrateUnitContactApplicationStoreToV1
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
      withStoreLock(key, function () {
        const currentEnvelope = readStoreEnvelopeSnapshot(key);
        const nextRevision = getStoreRevision(currentEnvelope) + 1;
        const nextEnvelope = createStoreEnvelope(key, payload, nextRevision);
        writeCachedJson(key, nextEnvelope);
      });
    }

    function mutateVersionedStore(key, fallbackFactory, mutator) {
      return withStoreLock(key, function () {
        const currentEnvelope = readStoreEnvelopeSnapshot(key);
        const current = readVersionedStore(key, fallbackFactory);
        const draft = cloneStoreValue(current);
        const result = typeof mutator === 'function' ? mutator(draft) : undefined;
        const nextValue = result === undefined ? draft : result;
        const nextRevision = getStoreRevision(currentEnvelope) + 1;
        const nextEnvelope = createStoreEnvelope(key, nextValue, nextRevision);
        writeCachedJson(key, nextEnvelope);
        return nextValue;
      });
    }

    function migrateAllStores() {
      readVersionedStore(DATA_KEY, createDefaultData);
      readVersionedStore(CHECKLIST_KEY, emptyChecklistStore);
      readVersionedStore(TEMPLATE_KEY, cloneDefaultChecklistSections);
      readVersionedStore(TRAINING_KEY, emptyTrainingStore);
      readVersionedStore(LOGIN_LOG_KEY, () => []);
      readVersionedStore(UNIT_REVIEW_KEY, emptyUnitReviewStore);
      readVersionedStore(UNIT_CONTACT_APP_KEY, emptyUnitContactApplicationStore);
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
        case UNIT_CONTACT_APP_KEY: {
          const applications = Array.isArray(payload && payload.applications) ? payload.applications.length : 0;
          return {
            shape: 'applications + nextId',
            recordCount: applications,
            summary: `${applications} 筆單位窗口申請`
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

    function getStoreTouchToken(key) {
      const cleanKey = String(key || '').trim();
      if (!cleanKey) return '0';
      return String(STORE_TOUCH_TOKENS[cleanKey] || 0);
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
        next.searchText = [
          next.id,
          next.deficiencyType,
          next.source,
        next.status,
        next.proposerUnit,
        next.proposerUnitCode,
        next.proposerName,
        next.proposerUsername,
        next.handlerUnit,
        next.handlerUnitCode,
        next.handlerName,
        next.handlerUsername,
        next.problemDesc,
        next.handlerSuggestion,
        next.correctiveResult,
        next.correctiveReason,
          next.correctiveDueDate,
          next.nextTrackDate
        ].filter(Boolean).join(' ').toLowerCase();
        next.createdAtTs = Date.parse(next.createdAt || next.updatedAt || next.proposerDate || '') || 0;

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

    function parseSecurityRoles(value) {
      if (Array.isArray(value)) {
        return Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean)));
      }
      if (typeof value === 'string') {
        const raw = String(value || '').trim();
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return Array.from(new Set(parsed.map((entry) => String(entry || '').trim()).filter(Boolean)));
          }
        } catch (_) {}
        return Array.from(new Set(raw.split(/\r?\n|,|;|\|/).map((entry) => String(entry || '').trim()).filter(Boolean)));
      }
      return [];
    }

    function normalizeUserRole(role) {
      if (role === ROLES.ADMIN) return ROLES.ADMIN;
      return ROLES.UNIT_ADMIN;
    }

    function getAuthorizedUnits(user) {
      const units = parseUserUnits(user?.units);
      if (units.length) return units;
      const unit = String(user?.unit || '').trim();
      return unit ? [unit] : [];
    }

    function getReviewUnits(user) {
      return parseUserUnits(user?.reviewUnits || user?.reviewScopes || user?.reviewScopeUnits);
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
      const reviewUnits = getReviewUnits(user);
      return {
        ...user,
        role,
        units,
        reviewUnits,
        securityRoles: parseSecurityRoles(user?.securityRoles),
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
      mutateVersionedStore(DATA_KEY, createDefaultData, function (data) {
        if (!Array.isArray(data.items)) data.items = [];
        data.items.push(item);
      });
    }
    function updateItem(id, updates) {
      mutateVersionedStore(DATA_KEY, createDefaultData, function (data) {
        if (!Array.isArray(data.items)) data.items = [];
        const index = data.items.findIndex((item) => item.id === id);
        if (index >= 0) {
          data.items[index] = { ...data.items[index], ...updates };
        }
      });
    }
    function getUsers() { return loadData().users.slice().map((user) => normalizeUserRecord(user)); }
    function hasUsers() { return getUsers().length > 0; }
    function addUser(user) {
      mutateVersionedStore(DATA_KEY, createDefaultData, function (data) {
        if (!Array.isArray(data.users)) data.users = [];
        data.users.push(normalizeUserRecord(user));
      });
    }
    function updateUser(username, updates) {
      mutateVersionedStore(DATA_KEY, createDefaultData, function (data) {
        if (!Array.isArray(data.users)) data.users = [];
        const index = data.users.findIndex((user) => user.username === username);
        if (index >= 0) {
          data.users[index] = normalizeUserRecord({ ...data.users[index], ...updates });
        }
      });
    }
    function deleteUser(username) {
      mutateVersionedStore(DATA_KEY, createDefaultData, function (data) {
        if (!Array.isArray(data.users)) data.users = [];
        data.users = data.users.filter((user) => user.username !== username);
      });
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
      mutateVersionedStore(LOGIN_LOG_KEY, () => [], function (logs) {
        if (!Array.isArray(logs)) logs = [];
        logs.push({
          time: new Date().toISOString(),
          username: String(username || '').trim(),
          name: user?.name || '',
          role: user?.role || '',
          success: !!success
        });
        if (logs.length > 500) logs.splice(0, logs.length - 500);
        return logs;
      });
    }

    function clearLoginLogs() {
      removeCachedJson(LOGIN_LOG_KEY);
    }

    function emptyUnitReviewStore() {
      return { approvedUnits: [], history: [], governance: { unitModes: {} } };
    }

    function normalizeGovernanceModeEntry(unit, entry) {
      const key = String(unit || '').trim();
      const base = entry && typeof entry === 'object' ? entry : {};
      const rawMode = String(base.mode || '').trim().toLowerCase();
      return {
        unit: key,
        mode: rawMode === 'consolidated' ? 'consolidated' : 'independent',
        note: String(base.note || '').trim(),
        updatedAt: String(base.updatedAt || '').trim(),
        updatedBy: String(base.updatedBy || '').trim()
      };
    }

    function normalizeUnitReviewStore(store) {
      const base = store && typeof store === 'object' ? store : {};
      const approvedUnits = Array.isArray(base.approvedUnits) ? base.approvedUnits.slice() : [];
      const history = Array.isArray(base.history) ? base.history.slice() : [];
      const governanceBase = base.governance && typeof base.governance === 'object' ? base.governance : {};
      const unitModes = {};
      const rawModes = governanceBase.unitModes && typeof governanceBase.unitModes === 'object' ? governanceBase.unitModes : {};
      Object.keys(rawModes).forEach((unit) => {
        const cleanUnit = String(unit || '').trim();
        if (!cleanUnit) return;
        unitModes[cleanUnit] = normalizeGovernanceModeEntry(cleanUnit, rawModes[cleanUnit]);
      });
      return {
        approvedUnits,
        history,
        governance: { unitModes }
      };
    }

    function splitGovernanceUnitValue(unitValue) {
      const raw = String(unitValue || '').trim();
      if (!raw) return { parent: '', child: '' };
      const separator = raw.includes('／') ? '／' : (raw.includes('/') ? '/' : '');
      if (!separator) return { parent: raw, child: '' };
      const parts = raw.split(separator);
      const parent = String(parts.shift() || '').trim();
      const child = String(parts.join(separator) || '').trim();
      return { parent, child };
    }

    function resolveGovernanceMode(unit, governanceModes) {
      const cleanUnit = String(unit || '').trim();
      if (!cleanUnit) return 'independent';
      const store = governanceModes && typeof governanceModes === 'object' ? governanceModes : {};
      const direct = store[cleanUnit];
      if (direct && direct.mode === 'consolidated') return 'consolidated';
      const parsed = splitGovernanceUnitValue(cleanUnit);
      const parent = String(parsed && parsed.parent || '').trim();
      if (parent && parent !== cleanUnit) {
        const parentEntry = store[parent];
        if (parentEntry && parentEntry.mode === 'consolidated') return 'consolidated';
      }
      return 'independent';
    }

    function emptyUnitContactApplicationStore() {
      return { applications: [], nextId: 1 };
    }

    function buildUnitContactApplicationId(sequence, createdAt) {
      const date = createdAt ? new Date(createdAt) : new Date();
      const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
      return 'UCA-' + String(safeDate.getFullYear()) + '-' + String(sequence || 1).padStart(4, '0');
    }

    function normalizeUnitContactApplication(application) {
      const base = application && typeof application === 'object' ? application : {};
      const submittedAt = base.submittedAt || new Date().toISOString();
      const sequence = Number.isFinite(Number(base.sequence)) ? Number(base.sequence) : 1;
      return {
        id: String(base.id || buildUnitContactApplicationId(sequence, submittedAt)).trim(),
        sequence,
        applicantName: String(base.applicantName || '').trim(),
        applicantEmail: String(base.applicantEmail || '').trim().toLowerCase(),
        extensionNumber: String(base.extensionNumber || '').trim(),
        unitCategory: String(base.unitCategory || '').trim(),
        primaryUnit: String(base.primaryUnit || '').trim(),
        secondaryUnit: String(base.secondaryUnit || '').trim(),
        unitValue: String(base.unitValue || '').trim(),
        unitCode: String(base.unitCode || '').trim(),
        contactType: String(base.contactType || 'primary').trim(),
        note: String(base.note || '').trim(),
        status: String(base.status || 'pending_review').trim() || 'pending_review',
        statusLabel: String(base.statusLabel || '').trim(),
        statusDetail: String(base.statusDetail || '').trim(),
        source: String(base.source || 'frontend').trim(),
        backendMode: String(base.backendMode || 'local-emulator').trim(),
        submittedAt,
        updatedAt: base.updatedAt || submittedAt,
        reviewedAt: base.reviewedAt || null,
        reviewedBy: String(base.reviewedBy || '').trim(),
        reviewComment: String(base.reviewComment || '').trim(),
        activationSentAt: base.activationSentAt || null,
        activatedAt: base.activatedAt || null,
        externalUserId: String(base.externalUserId || '').trim()
      };
    }

    function loadUnitReviewStore() {
      const raw = readVersionedStore(UNIT_REVIEW_KEY, emptyUnitReviewStore);
      return normalizeUnitReviewStore(raw);
    }

    function saveUnitReviewStore(store) {
      writeVersionedStore(UNIT_REVIEW_KEY, normalizeUnitReviewStore(store));
    }

    function getUnitGovernanceMode(unit) {
      const cleanUnit = String(unit || '').trim();
      if (!cleanUnit) return 'independent';
      const store = loadUnitReviewStore();
      return resolveGovernanceMode(cleanUnit, store.governance && store.governance.unitModes);
    }

    function setUnitGovernanceMode(unit, mode, actor, note) {
      const cleanUnit = String(unit || '').trim();
      if (!cleanUnit) return null;
      const nextMode = String(mode || '').trim().toLowerCase() === 'consolidated' ? 'consolidated' : 'independent';
      const now = new Date().toISOString();
      const store = loadUnitReviewStore();
      if (!store.governance || typeof store.governance !== 'object') store.governance = { unitModes: {} };
      if (!store.governance.unitModes || typeof store.governance.unitModes !== 'object') store.governance.unitModes = {};
      const nextEntry = normalizeGovernanceModeEntry(cleanUnit, {
        mode: nextMode,
        note: String(note || '').trim(),
        updatedAt: now,
        updatedBy: String(actor || '').trim()
      });
      store.governance.unitModes[cleanUnit] = nextEntry;
      store.history.unshift({
        type: 'governance',
        unit: cleanUnit,
        mode: nextMode,
        note: nextEntry.note,
        actor: nextEntry.updatedBy,
        time: now
      });
      store.history = store.history.slice(0, 40);
      saveUnitReviewStore(store);
      return nextEntry;
    }

    function getUnitGovernanceModes() {
      const store = loadUnitReviewStore();
      const unitModes = store.governance && store.governance.unitModes && typeof store.governance.unitModes === 'object'
        ? store.governance.unitModes
        : {};
      return Object.values(unitModes)
        .map((entry) => normalizeGovernanceModeEntry(entry.unit, entry))
        .filter((entry) => entry.unit)
        .sort((a, b) => a.unit.localeCompare(b.unit, 'zh-Hant'));
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

    function splitChecklistUnitValue(unitValue) {
      const raw = String(unitValue || '').trim();
      if (!raw) return { parent: '', child: '' };
      const sep = raw.includes('\uFF0F') ? '\uFF0F' : (raw.includes('/') ? '/' : '');
      if (!sep) return { parent: raw, child: '' };
      const parts = raw.split(sep);
      const parent = String(parts.shift() || '').trim();
      const child = String(parts.join(sep) || '').trim();
      return { parent, child };
    }

    function getChecklistTier1UnitValue(unitValue) {
      const parsed = splitChecklistUnitValue(unitValue);
      return String(parsed && parsed.parent || unitValue || '').trim();
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
      base.searchText = [
        base.id,
        base.unit,
        getChecklistTier1UnitValue(base.unit),
        base.fillerName,
        base.fillerUsername,
        base.auditYear,
        base.status
      ].filter(Boolean).join(' ').toLowerCase();
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
      mutateVersionedStore(CHECKLIST_KEY, emptyChecklistStore, function (store) {
        if (!Array.isArray(store.items)) store.items = [];
        store.items.push(normalizeChecklistItem(item));
      });
    }
    function deleteChecklistsByYear(auditYear) {
      const targetYear = String(auditYear || '').trim();
      if (!targetYear) {
        return { deletedCount: 0, deletedItems: [] };
      }
      const deletedItems = [];
      mutateVersionedStore(CHECKLIST_KEY, emptyChecklistStore, function (store) {
        if (!Array.isArray(store.items)) store.items = [];
        store.items = store.items.filter((item) => {
          const matches = String(item && item.auditYear || '').trim() === targetYear;
          if (matches) deletedItems.push(normalizeChecklistItem(item));
          return !matches;
        });
      });
      return {
        deletedCount: deletedItems.length,
        deletedItems,
        deletedIds: deletedItems.map((item) => String(item && item.id || '').trim()).filter(Boolean)
      };
    }
    function updateChecklist(id, updates) {
      let updated = false;
      mutateVersionedStore(CHECKLIST_KEY, emptyChecklistStore, function (store) {
        if (!Array.isArray(store.items)) store.items = [];
        const index = store.items.findIndex((item) => item.id === id);
        if (index < 0) return;
        store.items[index] = normalizeChecklistItem({ ...store.items[index], ...updates });
        updated = true;
      });
      return updated;
    }

    function emptyTrainingStore() {
      return { forms: [], rosters: [], nextFormId: 1, nextRosterId: 1 };
    }

    function parseTrainingRosterSequence(id) {
      const match = String(id || '').trim().match(/^RST-(\d+)$/i);
      return match ? Number(match[1]) : 0;
    }

    function ensureTrainingRosterSequence(store) {
      const base = store && typeof store === 'object' ? store : emptyTrainingStore();
      const maxExisting = Array.isArray(base.rosters)
        ? base.rosters.reduce((max, row) => Math.max(max, parseTrainingRosterSequence(row && row.id)), 0)
        : 0;
      const currentNext = Number.isFinite(Number(base.nextRosterId)) ? Number(base.nextRosterId) : 1;
      return {
        ...base,
        nextRosterId: Math.max(currentNext, maxExisting + 1, 1)
      };
    }

    function createNextTrainingRosterId(store) {
      const base = ensureTrainingRosterSequence(store);
      let nextValue = base.nextRosterId;
      const existingIds = new Set((Array.isArray(base.rosters) ? base.rosters : [])
        .map((row) => String(row && row.id || '').trim())
        .filter(Boolean));
      let candidate = 'RST-' + String(nextValue).padStart(4, '0');
      while (existingIds.has(candidate)) {
        nextValue += 1;
        candidate = 'RST-' + String(nextValue).padStart(4, '0');
      }
      base.nextRosterId = nextValue + 1;
      return {
        id: candidate,
        store: base
      };
    }

    function normalizeTrainingRosterRow(row, fallbackUnit) {
      const unit = String((row && row.unit) || fallbackUnit || '').trim();
      const statsUnit = String((row && (row.statsUnit || row.l1Unit)) || getTrainingStatsUnit(unit)).trim();
      const unitName = String((row && row.unitName) || getTrainingJobUnit(unit)).trim() || statsUnit;
      const rawSource = String((row && row.source) || '').trim().toLowerCase();
      const creatorUsername = String((row && row.createdByUsername) || '').trim();
      const creatorName = String((row && row.createdBy) || '').trim();
      const inferredManual = rawSource === 'manual'
        || (!!creatorUsername && rawSource !== 'import')
        || (!!creatorName && creatorName !== '系統' && creatorName !== '系統管理' && rawSource !== 'import');
      return {
        id: String((row && row.id) || '').trim(),
        unit,
        statsUnit,
        l1Unit: statsUnit,
        name: String((row && row.name) || '').trim(),
        unitName,
        identity: String((row && row.identity) || '').trim(),
        jobTitle: String((row && row.jobTitle) || '').trim(),
        searchText: [
          String((row && row.name) || '').trim(),
          unitName,
          String((row && row.identity) || '').trim(),
          String((row && row.jobTitle) || '').trim(),
          statsUnit,
          unit
        ].filter(Boolean).join(' ').toLowerCase(),
        source: inferredManual ? 'manual' : 'import',
        createdBy: creatorName || '系統',
        createdByUsername: creatorUsername,
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
      const store = ensureTrainingRosterSequence({
        forms: Array.isArray(raw.forms) ? raw.forms.map((form) => normalizeTrainingForm(form)) : [],
        rosters: Array.isArray(raw.rosters) ? raw.rosters.map((row) => normalizeTrainingRosterRow(row, row.unit)) : [],
        nextFormId: Number.isFinite(raw.nextFormId) ? raw.nextFormId : 1,
        nextRosterId: Number.isFinite(raw.nextRosterId) ? raw.nextRosterId : 1
      });
      let changed = store.nextRosterId !== (Number.isFinite(raw.nextRosterId) ? raw.nextRosterId : 1);
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
      mutateVersionedStore(TRAINING_KEY, emptyTrainingStore, function (store) {
        if (!Array.isArray(store.forms)) store.forms = [];
        const normalized = normalizeTrainingForm(form);
        const index = store.forms.findIndex((item) => item.id === normalized.id);
        if (index >= 0) store.forms[index] = normalized;
        else store.forms.push(normalized);
      });
    }

    function updateTrainingForm(id, updates) {
      mutateVersionedStore(TRAINING_KEY, emptyTrainingStore, function (store) {
        if (!Array.isArray(store.forms)) store.forms = [];
        const index = store.forms.findIndex((item) => item.id === id);
        if (index < 0) return;
        store.forms[index] = normalizeTrainingForm({ ...store.forms[index], ...updates });
      });
    }

    function getAllTrainingRosters() {
      return loadTrainingStore().rosters.slice();
    }

    function normalizeTrainingRosterUnitValue(value) {
      return String(value || '').trim();
    }

    function matchesTrainingRosterUnitValue(candidate, target) {
      const cleanTarget = normalizeTrainingRosterUnitValue(target);
      const cleanCandidate = normalizeTrainingRosterUnitValue(candidate);
      if (!cleanTarget || !cleanCandidate) return false;
      if (cleanCandidate === cleanTarget) return true;
      const parts = cleanCandidate.split(/[\/／]/).map((part) => normalizeTrainingRosterUnitValue(part)).filter(Boolean);
      return parts.includes(cleanTarget);
    }

    function getTrainingRosterByUnit(unit) {
      const cleanUnit = normalizeTrainingRosterUnitValue(unit);
      if (!cleanUnit) {
        return getAllTrainingRosters()
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
      }
      return getAllTrainingRosters()
        .filter((row) => (
          matchesTrainingRosterUnitValue(row && row.unit, cleanUnit)
          || matchesTrainingRosterUnitValue(row && row.statsUnit, cleanUnit)
          || matchesTrainingRosterUnitValue(row && row.l1Unit, cleanUnit)
          || matchesTrainingRosterUnitValue(row && row.unitName, cleanUnit)
        ))
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
        return { added: false, updated: false, reason: '???????' };
      }

      let outcome = { added: false, updated: false, reason: '' };
      mutateVersionedStore(TRAINING_KEY, emptyTrainingStore, function (store) {
        if (!Array.isArray(store.rosters)) store.rosters = [];
        const index = store.rosters.findIndex((row) => row.unit === cleanUnit && row.name.toLowerCase() === cleanName.toLowerCase());
        let nextRosterId = index >= 0 ? store.rosters[index].id : '';
        if (!nextRosterId) {
          const sequence = createNextTrainingRosterId(store);
          store.nextRosterId = sequence.store.nextRosterId;
          nextRosterId = sequence.id;
        }
        const nextRow = normalizeTrainingRosterRow({
          ...base,
          id: nextRosterId,
          unit: cleanUnit,
          source: source || base.source || 'manual',
          createdBy: index >= 0 ? store.rosters[index].createdBy : (actorName || '???'),
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
            outcome = { added: false, updated: true, id: merged.id, row: merged, reason: `??? ${cleanName} ?????` };
            return;
          }
          outcome = { added: false, updated: false, reason: `${cleanName} ?????????` };
          return;
        }

        store.rosters.push(nextRow);
        outcome = { added: true, updated: false, id: nextRow.id, row: nextRow };
      });
      return outcome;
    }

    function deleteTrainingRosterPerson(id) {
      const cleanId = String(id || '').trim();
      if (!cleanId) return;
      mutateVersionedStore(TRAINING_KEY, emptyTrainingStore, function (store) {
        if (!Array.isArray(store.rosters)) store.rosters = [];
        store.rosters = store.rosters.filter((row) => row.id !== cleanId);
      });
    }

    function updateTrainingRosterPerson(id, updates) {
      const cleanId = String(id || '').trim();
      if (!cleanId) return null;
      let updatedRow = null;
      mutateVersionedStore(TRAINING_KEY, emptyTrainingStore, function (store) {
        if (!Array.isArray(store.rosters)) store.rosters = [];
        const index = store.rosters.findIndex((row) => row.id === cleanId);
        if (index < 0) return;
        store.rosters[index] = normalizeTrainingRosterRow({ ...store.rosters[index], ...(updates || {}) }, store.rosters[index].unit);
        updatedRow = store.rosters[index];
      });
      return updatedRow;
    }

    function loadUnitContactApplicationStore() {
      const raw = readVersionedStore(UNIT_CONTACT_APP_KEY, emptyUnitContactApplicationStore);
      if (!raw || typeof raw !== 'object') return emptyUnitContactApplicationStore();
      const store = {
        applications: Array.isArray(raw.applications) ? raw.applications.map((entry) => normalizeUnitContactApplication(entry)) : [],
        nextId: Number.isFinite(Number(raw.nextId)) ? Number(raw.nextId) : 1
      };
      if (store.nextId < 1) store.nextId = 1;
      return store;
    }

    function saveUnitContactApplicationStore(store) {
      writeVersionedStore(UNIT_CONTACT_APP_KEY, store);
    }

    function getAllUnitContactApplications() {
      return loadUnitContactApplicationStore().applications
        .slice()
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    }

    function getUnitContactApplication(id) {
      const cleanId = String(id || '').trim();
      if (!cleanId) return null;
      return loadUnitContactApplicationStore().applications.find((entry) => entry.id === cleanId) || null;
    }

    function createUnitContactApplication(application) {
      let created = null;
      mutateVersionedStore(UNIT_CONTACT_APP_KEY, emptyUnitContactApplicationStore, function (store) {
        if (!Array.isArray(store.applications)) store.applications = [];
        const sequence = Number.isFinite(Number(store.nextId)) ? Number(store.nextId) : 1;
        const normalized = normalizeUnitContactApplication({
          ...application,
          sequence,
          submittedAt: (application && application.submittedAt) || new Date().toISOString(),
          updatedAt: (application && application.updatedAt) || new Date().toISOString()
        });
        store.applications.push(normalized);
        store.nextId = sequence + 1;
        created = normalized;
      });
      return created;
    }

    function updateUnitContactApplication(id, updates) {
      const cleanId = String(id || '').trim();
      if (!cleanId) return null;
      let updated = null;
      mutateVersionedStore(UNIT_CONTACT_APP_KEY, emptyUnitContactApplicationStore, function (store) {
        if (!Array.isArray(store.applications)) store.applications = [];
        const index = store.applications.findIndex((entry) => entry.id === cleanId);
        if (index < 0) return;
        store.applications[index] = normalizeUnitContactApplication({
          ...store.applications[index],
          ...(updates || {}),
          updatedAt: new Date().toISOString()
        });
        updated = store.applications[index];
      });
      return updated;
    }

    function findUnitContactApplicationsByEmail(email) {
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail) return [];
      return getAllUnitContactApplications().filter((entry) => entry.applicantEmail === cleanEmail);
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
      getReviewUnits,
      getActiveUnit,
      normalizeUserRecord,
      loadData,
      saveData,
      getAllItems,
      getItem,
      addItem,
      updateItem,
      getUsers,
      hasUsers,
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
      getUnitGovernanceMode,
      setUnitGovernanceMode,
      getUnitGovernanceModes,
      getChecklistSections,
      saveChecklistSections,
      normalizeChecklistStatus,
      isChecklistDraftStatus,
      normalizeChecklistItem,
      loadChecklists,
      saveChecklists,
      getAllChecklists,
      getChecklist,
      deleteChecklistsByYear,
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
      updateTrainingRosterPerson,
      loadUnitContactApplicationStore,
      saveUnitContactApplicationStore,
      getAllUnitContactApplications,
      getUnitContactApplication,
      createUnitContactApplication,
      updateUnitContactApplication,
      findUnitContactApplicationsByEmail,
      migrateAllStores,
      getStoreVersion,
      getStoreTouchToken,
      getSchemaHealth,
      exportManagedStoreSnapshot
    };
  };
})();
