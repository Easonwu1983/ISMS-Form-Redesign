(function () {
  window.createM365ApiClient = function createM365ApiClient(deps) {
    const {
      UNIT_CONTACT_APPLICATION_STATUSES,
      createUnitContactApplication,
      updateUnitContactApplication,
      getUnitContactApplication,
      getAllUnitContactApplications,
      findUnitContactApplicationsByEmail,
      getOfficialUnitMeta,
      getSessionAuthHeaders
    } = deps;

    const CONTRACT_VERSION = '2026-03-20';
    const CORRECTIVE_ACTIONS_CONTRACT_VERSION = '2026-03-12';
    const CHECKLISTS_CONTRACT_VERSION = '2026-03-12';
    const TRAINING_CONTRACT_VERSION = '2026-03-12';
    const CORRECTIVE_ACTION_ACTIONS = {
      CREATE: 'corrective-action.create',
      RESPOND: 'corrective-action.respond',
      REVIEW: 'corrective-action.review',
      TRACKING_SUBMIT: 'corrective-action.tracking.submit',
      TRACKING_REVIEW: 'corrective-action.tracking.review'
    };
    const CHECKLIST_ACTIONS = {
      SAVE_DRAFT: 'checklist.save-draft',
      SUBMIT: 'checklist.submit',
      DELETE_YEAR: 'checklist.delete-year'
    };
    const TRAINING_FORM_ACTIONS = {
      SAVE_DRAFT: 'training.form.save-draft',
      SUBMIT_STEP_ONE: 'training.form.submit-step-one',
      MARK_PRINTED: 'training.form.mark-printed',
      FINALIZE: 'training.form.finalize',
      RETURN: 'training.form.return',
      UNDO: 'training.form.undo'
    };
    const TRAINING_ROSTER_ACTIONS = {
      UPSERT: 'training.roster.upsert',
      UPSERT_BATCH: 'training.roster.upsert-batch',
      DELETE: 'training.roster.delete',
      DELETE_BATCH: 'training.roster.delete-batch'
    };
    let requestCounter = 0;
    let cachedConfig = null;
    let cachedRuntimeConfigSource = null;
    const DEFAULT_CONFIG = {
      unitContactMode: 'local-emulator',
      unitContactSubmitEndpoint: '',
      unitContactStatusEndpoint: '',
      unitContactActivationEndpoint: '',
      unitContactRequestTimeoutMs: 15000,
      apiReadTimeoutMs: 15000,
      apiWriteTimeoutMs: 20000,
      attachmentsRequestTimeoutMs: 15000,
      trainingBatchTimeoutMs: 45000,
      unitContactStatusLookupMethod: 'POST',
      unitContactStatusQueryParam: 'email',
      unitContactSharedHeaders: {},
      correctiveActionsMode: 'local-emulator',
      correctiveActionsEndpoint: '',
      correctiveActionsHealthEndpoint: '',
      correctiveActionsSharedHeaders: {},
      checklistMode: 'local-emulator',
      checklistEndpoint: '',
      checklistHealthEndpoint: '',
      checklistSharedHeaders: {},
      trainingMode: 'local-emulator',
      trainingFormsEndpoint: '',
      trainingRostersEndpoint: '',
      trainingHealthEndpoint: '',
      trainingSharedHeaders: {}
    };

    const STATUS_META = {
      [UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW]: {
        label: '待審核',
        tone: 'pending',
        detail: '申請已送出，等待管理者審核。審核通過後會直接啟用帳號並寄送登入資訊。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.RETURNED]: {
        label: '退回補件',
        tone: 'attention',
        detail: '申請資料需要補充，請依退回意見修正後重新送出。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.APPROVED]: {
        label: '已通過',
        tone: 'approved',
        detail: '申請已通過，系統會直接啟用帳號並寄送登入資訊。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.REJECTED]: {
        label: '未核准',
        tone: 'danger',
        detail: '申請未通過，若需再申請請先與系統管理者確認。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.ACTIVATION_PENDING]: {
        label: '寄信處理中',
        tone: 'approved',
        detail: '系統正在寄送登入資訊，登入帳號會使用申請時填寫的電子郵件。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.ACTIVE]: {
        label: '已啟用',
        tone: 'live',
        detail: '申請已完成啟用，可直接使用申請時填寫的電子郵件登入系統。'
      }
    };

    function nowIso() {
      return new Date().toISOString();
    }

    function cleanText(value) {
      return String(value || '').trim();
    }

    function cleanEmail(value) {
      return cleanText(value).toLowerCase();
    }

    function parseSecurityRoles(value) {
      if (Array.isArray(value)) {
        return Array.from(new Set(value.map((entry) => cleanText(entry)).filter(Boolean)));
      }
      if (typeof value === 'string') {
        const raw = cleanText(value);
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return Array.from(new Set(parsed.map((entry) => cleanText(entry)).filter(Boolean)));
          }
        } catch (_) {}
        return Array.from(new Set(raw.split(/\r?\n|,|;|\|/).map((entry) => cleanText(entry)).filter(Boolean)));
      }
      return [];
    }

    function sanitizeSharedHeaders(value) {
      if (!value || typeof value !== 'object') return {};
      return Object.entries(value).reduce((result, [key, headerValue]) => {
        const name = String(key || '').trim();
        const text = cleanText(headerValue);
        if (!/^x-isms-/i.test(name) || !text) return result;
        result[name] = text;
        return result;
      }, {});
    }

    function sanitizeRuntimeEndpoint(value, allowHash) {
      const raw = cleanText(value);
      if (!raw) return '';
      if (allowHash && raw.startsWith('#')) return raw;
      if (raw.startsWith('/')) return raw.replace(/\/$/, '');
      try {
        const resolved = new URL(raw, typeof window !== 'undefined' ? window.location.href : undefined);
        if (typeof window === 'undefined' || !window.location || resolved.origin === window.location.origin) {
          return `${resolved.pathname.replace(/\/$/, '')}${resolved.search}${resolved.hash}`;
        }
      } catch (_) {}
      return '';
    }

    function resolveRequestUrl(value) {
      const raw = cleanText(value);
      if (!raw) return '';
      try {
        const resolved = new URL(raw, typeof window !== 'undefined' ? window.location.href : undefined);
        if (typeof window === 'undefined' || !window.location || resolved.origin === window.location.origin) {
          return resolved.toString();
        }
      } catch (_) {}
      return '';
    }

    function sanitizeRuntimeConfig(runtime) {
      const source = runtime && typeof runtime === 'object' ? runtime : {};
      return {
        ...source,
        unitContactSubmitEndpoint: sanitizeRuntimeEndpoint(source.unitContactSubmitEndpoint, false),
        unitContactStatusEndpoint: sanitizeRuntimeEndpoint(source.unitContactStatusEndpoint, false),
        unitContactActivationEndpoint: sanitizeRuntimeEndpoint(source.unitContactActivationEndpoint, true) || sanitizeRuntimeEndpoint(source.activationPathBase, true),
        unitContactSharedHeaders: sanitizeSharedHeaders(source.unitContactSharedHeaders),
        correctiveActionsEndpoint: sanitizeRuntimeEndpoint(source.correctiveActionsEndpoint, false),
        correctiveActionsHealthEndpoint: sanitizeRuntimeEndpoint(source.correctiveActionsHealthEndpoint, false),
        correctiveActionsSharedHeaders: sanitizeSharedHeaders(source.correctiveActionsSharedHeaders),
        checklistEndpoint: sanitizeRuntimeEndpoint(source.checklistEndpoint, false),
        checklistHealthEndpoint: sanitizeRuntimeEndpoint(source.checklistHealthEndpoint, false),
        checklistSharedHeaders: sanitizeSharedHeaders(source.checklistSharedHeaders),
        trainingFormsEndpoint: sanitizeRuntimeEndpoint(source.trainingFormsEndpoint, false),
        trainingRostersEndpoint: sanitizeRuntimeEndpoint(source.trainingRostersEndpoint, false),
        trainingHealthEndpoint: sanitizeRuntimeEndpoint(source.trainingHealthEndpoint, false),
        trainingSharedHeaders: sanitizeSharedHeaders(source.trainingSharedHeaders),
        authEndpoint: sanitizeRuntimeEndpoint(source.authEndpoint, false),
        authHealthEndpoint: sanitizeRuntimeEndpoint(source.authHealthEndpoint, false),
        authSharedHeaders: sanitizeSharedHeaders(source.authSharedHeaders),
        systemUsersEndpoint: sanitizeRuntimeEndpoint(source.systemUsersEndpoint, false),
        systemUsersHealthEndpoint: sanitizeRuntimeEndpoint(source.systemUsersHealthEndpoint, false),
        systemUsersSharedHeaders: sanitizeSharedHeaders(source.systemUsersSharedHeaders),
        reviewScopesEndpoint: sanitizeRuntimeEndpoint(source.reviewScopesEndpoint, false),
        reviewScopesHealthEndpoint: sanitizeRuntimeEndpoint(source.reviewScopesHealthEndpoint, false),
        reviewScopesSharedHeaders: sanitizeSharedHeaders(source.reviewScopesSharedHeaders),
        auditTrailEndpoint: sanitizeRuntimeEndpoint(source.auditTrailEndpoint, false),
        auditTrailHealthEndpoint: sanitizeRuntimeEndpoint(source.auditTrailHealthEndpoint, false),
        auditTrailSharedHeaders: sanitizeSharedHeaders(source.auditTrailSharedHeaders),
        attachmentsEndpoint: sanitizeRuntimeEndpoint(source.attachmentsEndpoint, false),
        attachmentsHealthEndpoint: sanitizeRuntimeEndpoint(source.attachmentsHealthEndpoint, false),
        attachmentsSharedHeaders: sanitizeSharedHeaders(source.attachmentsSharedHeaders)
      };
    }

    function cleanArray(value) {
      return Array.isArray(value)
        ? value.map((entry) => cleanText(entry)).filter(Boolean)
        : [];
    }

    function makeRequestId(prefix) {
      requestCounter = (requestCounter + 1) % 0xffffff;
      const seed = (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function')
        ? Array.from(window.crypto.getRandomValues(new Uint8Array(4)), function (value) { return value.toString(16).padStart(2, '0'); }).join('')
        : (Date.now().toString(36) + requestCounter.toString(36)).slice(-8);
      return prefix + '-' + Date.now() + '-' + seed;
    }

    function getConfig() {
      const runtime = (typeof window !== 'undefined' && window.__M365_UNIT_CONTACT_CONFIG__) || {};
      if (cachedRuntimeConfigSource === runtime && cachedConfig) return cachedConfig;
      cachedRuntimeConfigSource = runtime;
      cachedConfig = {
        ...DEFAULT_CONFIG,
        ...sanitizeRuntimeConfig(runtime)
      };
      return cachedConfig;
    }

    function getMode() {
      return String(getConfig().unitContactMode || 'local-emulator').trim() || 'local-emulator';
    }

    function getCorrectiveActionMode() {
      const config = getConfig();
      return String(config.correctiveActionsMode || '').trim() || (getMode() === 'm365-api' ? 'm365-api' : 'local-emulator');
    }

    function getChecklistMode() {
      const config = getConfig();
      return String(config.checklistMode || '').trim() || (getMode() === 'm365-api' ? 'm365-api' : 'local-emulator');
    }

    function getTrainingMode() {
      const config = getConfig();
      return String(config.trainingMode || '').trim() || (getMode() === 'm365-api' ? 'm365-api' : 'local-emulator');
    }

    function getModeLabel() {
      const mode = getMode();
      if (mode === 'm365-api') {
        const config = getConfig();
        if (String(config.activeProfile || '').trim() === 'a3CampusBackend') {
          return '校內正式模式';
        }
        return '正式模式';
      }
      if (mode === 'sharepoint-flow') {
        const config = getConfig();
        if (String(config.sharePointProvisioningModel || '').trim() === 'delegated-site-owner') {
          return '正式流程整合模式';
        }
        return '正式流程模式';
      }
      return '本機瀏覽器模式';
    }

    function getCorrectiveActionModeLabel() {
      const mode = getCorrectiveActionMode();
      if (mode === 'm365-api') {
        const config = getConfig();
        if (String(config.activeProfile || '').trim() === 'a3CampusBackend') {
          return '校內正式後端';
        }
        return '正式矯正單後端';
      }
      return '瀏覽器本地暫存';
    }

    function getChecklistModeLabel() {
      const mode = getChecklistMode();
      if (mode === 'm365-api') {
        const config = getConfig();
        if (String(config.activeProfile || '').trim() === 'a3CampusBackend') {
          return '校內正式後端';
        }
        return '正式檢核表後端';
      }
      return '瀏覽器本地暫存';
    }

    function getTrainingModeLabel() {
      const mode = getTrainingMode();
      if (mode === 'm365-api') {
        const config = getConfig();
        if (String(config.activeProfile || '').trim() === 'a3CampusBackend') {
          return '校內正式後端';
        }
        return '正式教育訓練後端';
      }
      return '瀏覽器本地暫存';
    }

    function getStatusMeta(status) {
      return STATUS_META[String(status || '').trim()] || {
        label: '待處理',
        tone: 'pending',
        detail: '申請狀態尚未定義，請稍後再查詢。'
      };
    }

    function decorateApplication(application) {
      if (!application) return null;
      const meta = getStatusMeta(application.status);
      return {
        ...application,
        statusLabel: application.statusLabel || meta.label,
        statusTone: application.statusTone || meta.tone,
        statusDetail: application.statusDetail || meta.detail
      };
    }

    function buildClientContext(contractVersion) {
      return {
        contractVersion: cleanText(contractVersion) || CONTRACT_VERSION,
        source: 'isms-form-redesign-frontend',
        frontendOrigin: typeof window !== 'undefined' && window.location ? window.location.origin : '',
        frontendHash: typeof window !== 'undefined' && window.location ? String(window.location.hash || '') : '',
        sentAt: nowIso()
      };
    }

    function normalizePayload(payload) {
      const unitValue = cleanText(payload && payload.unitValue);
      const officialMeta = getOfficialUnitMeta(unitValue);
      const primaryUnit = cleanText(payload && payload.primaryUnit) || unitValue;
      const authorizedUnits = parseUnitList(payload && (payload.authorizedUnits || payload.scopeUnits || payload.units), primaryUnit);
      return {
        applicantName: cleanText(payload && payload.applicantName),
        applicantEmail: cleanEmail(payload && payload.applicantEmail),
        extensionNumber: cleanText(payload && payload.extensionNumber),
        unitCategory: cleanText(payload && payload.unitCategory),
        primaryUnit,
        secondaryUnit: cleanText(payload && payload.secondaryUnit),
        unitValue,
        unitCode: cleanText(payload && payload.unitCode) || cleanText(officialMeta && officialMeta.code),
        contactType: cleanText(payload && payload.contactType) || 'primary',
        note: cleanText(payload && payload.note),
        securityRoles: parseSecurityRoles(payload && payload.securityRoles),
        authorizedUnits,
        scopeUnits: authorizedUnits.slice(),
        authorizationDocAttachmentId: cleanText(payload && payload.authorizationDocAttachmentId),
        authorizationDocFileName: cleanText(payload && payload.authorizationDocFileName),
        authorizationDocContentType: cleanText(payload && payload.authorizationDocContentType),
        authorizationDocSize: Number(payload && payload.authorizationDocSize || 0),
        authorizationDocUploadedAt: cleanText(payload && payload.authorizationDocUploadedAt),
        authorizationDocDriveItemId: cleanText(payload && payload.authorizationDocDriveItemId)
      };
    }

    function parseUnitList(value, primaryUnit) {
      const ordered = [];
      const primary = cleanText(primaryUnit);
      if (primary) ordered.push(primary);
      const source = Array.isArray(value)
        ? value
        : (typeof value === 'string'
            ? (() => {
                const raw = cleanText(value);
                if (!raw) return [];
                try {
                  const parsed = JSON.parse(raw);
                  if (Array.isArray(parsed)) return parsed;
                } catch (_) {}
                return raw.split(/\r?\n|,|;|\|/);
              })()
            : []);
      source.map((entry) => cleanText(entry)).filter(Boolean).forEach((entry) => {
        if (!ordered.includes(entry)) ordered.push(entry);
      });
      return ordered;
    }

    function assertApplicationPayload(payload) {
      if (!payload.unitValue) throw new Error('請選擇申請單位');
      if (!payload.applicantName) throw new Error('請填寫申請人姓名');
      if (!payload.extensionNumber) throw new Error('請填寫分機');
      if (!payload.applicantEmail) throw new Error('請填寫電子郵件');
      if (!payload.unitCode) throw new Error('找不到對應的正式單位代碼，請先確認單位資料');
      if (!Array.isArray(payload.securityRoles) || !payload.securityRoles.length) throw new Error('請至少選擇一種資安角色身分');
      if (!payload.authorizationDocAttachmentId && !payload.authorizationDocDriveItemId) throw new Error('請上傳主管授權同意書');
    }

    function assertNoDuplicateActiveApplication(payload) {
      const existing = findUnitContactApplicationsByEmail(payload.applicantEmail);
      const activeStatuses = new Set([
        UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW,
        UNIT_CONTACT_APPLICATION_STATUSES.APPROVED,
        UNIT_CONTACT_APPLICATION_STATUSES.ACTIVATION_PENDING,
        UNIT_CONTACT_APPLICATION_STATUSES.ACTIVE
      ]);
      const duplicated = existing.find((entry) => entry.unitValue === payload.unitValue && activeStatuses.has(entry.status));
      if (duplicated) {
        throw new Error('這個單位已存在進行中的聯絡人申請，請先查詢既有案件進度。');
      }
    }

    function buildHeaders(extraHeaders, options) {
      const opts = options && typeof options === 'object' ? options : {};
      const sessionHeaders = typeof getSessionAuthHeaders === 'function'
        ? (getSessionAuthHeaders() || {})
        : {};
      const sharedHeaders = opts.sharedHeaders && typeof opts.sharedHeaders === 'object'
        ? Object.entries(opts.sharedHeaders).reduce((result, [key, value]) => {
            const name = String(key || '').trim();
            const text = cleanText(value);
            if (!/^x-isms-/i.test(name) || !text) return result;
            result[name] = text;
            return result;
          }, {})
        : {};
      return {
        'Content-Type': 'application/json',
        'X-ISMS-Contract-Version': cleanText(opts.contractVersion) || CONTRACT_VERSION,
        ...sharedHeaders,
        ...(sessionHeaders && typeof sessionHeaders === 'object' ? sessionHeaders : {}),
        ...(extraHeaders || {})
      };
    }

    async function requestJson(url, options) {
      const requestOptions = options || {};
      const config = getConfig();
      const safeUrl = resolveRequestUrl(url);
      if (!safeUrl) throw new Error('Invalid request endpoint');
      const method = String(requestOptions.method || 'POST').toUpperCase();
      const maxAttempts = method === 'GET' ? 2 : 1;
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const defaultTimeoutMs = method === 'GET'
          ? Number(config.apiReadTimeoutMs || config.unitContactRequestTimeoutMs || 15000)
          : Number(config.apiWriteTimeoutMs || config.unitContactRequestTimeoutMs || 15000);
        const timeoutMs = Number(requestOptions.timeoutMs || defaultTimeoutMs || 15000);
        let timeoutId = null;
        if (controller && timeoutMs > 0) {
          timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        }
        try {
          const response = await fetch(safeUrl, {
            method,
            headers: buildHeaders(requestOptions.headers, {
              contractVersion: requestOptions.contractVersion,
              sharedHeaders: requestOptions.sharedHeaders
            }),
            body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
            signal: controller ? controller.signal : undefined
          });

          const rawText = await response.text();
          let parsed = null;
          if (rawText) {
            try {
              parsed = JSON.parse(rawText);
            } catch (_) {
              parsed = { ok: false, message: rawText };
            }
          }
          if (!response.ok) {
            const serverMessage = cleanText(parsed && (parsed.message || parsed.error || parsed.detail));
            if (response.status === 401) {
              throw new Error('\u767b\u5165\u72c0\u614b\u5df2\u5931\u6548\uff0c\u8acb\u91cd\u65b0\u767b\u5165');
            }
            throw new Error(serverMessage || ('HTTP ' + response.status));
          }
          return parsed || { ok: true };
        } catch (error) {
          lastError = error && error.name === 'AbortError'
            ? new Error('\u9023\u7dda\u903e\u6642\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66')
            : error;
          if (attempt >= maxAttempts || method !== 'GET') break;
          await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
      throw lastError;
    }

    function buildSubmitEnvelope(payload) {
      return {
        action: 'unit-contact.apply',
        requestId: makeRequestId('uca'),
        context: buildClientContext(CONTRACT_VERSION),
        payload
      };
    }

    function buildLookupEnvelope(email) {
      return {
        action: 'unit-contact.lookup',
        requestId: makeRequestId('ucl'),
        context: buildClientContext(CONTRACT_VERSION),
        payload: { email: cleanEmail(email) }
      };
    }

    function buildUnitContactAdminEnvelope(action, payload) {
      return {
        action: cleanText(action),
        requestId: makeRequestId('uca'),
        context: buildClientContext(CONTRACT_VERSION),
        payload: payload && typeof payload === 'object' ? payload : {}
      };
    }

    function buildCorrectiveActionEnvelope(action, payload) {
      return {
        action: cleanText(action),
        requestId: makeRequestId('car'),
        context: buildClientContext(CORRECTIVE_ACTIONS_CONTRACT_VERSION),
        payload: payload && typeof payload === 'object' ? payload : {}
      };
    }

    function buildChecklistEnvelope(action, payload) {
      return {
        action: cleanText(action),
        requestId: makeRequestId('chk'),
        context: buildClientContext(CHECKLISTS_CONTRACT_VERSION),
        payload: payload && typeof payload === 'object' ? payload : {}
      };
    }

    function buildTrainingEnvelope(action, payload) {
      return {
        action: cleanText(action),
        requestId: makeRequestId('trn'),
        context: buildClientContext(TRAINING_CONTRACT_VERSION),
        payload: payload && typeof payload === 'object' ? payload : {}
      };
    }

    function maybeFields(record) {
      return record && typeof record === 'object' && record.fields && typeof record.fields === 'object'
        ? record.fields
        : record;
    }

    function normalizeRemoteApplication(record) {
      const source = maybeFields(record);
      if (!source || typeof source !== 'object') return null;
      const directId = cleanText(source.ApplicationId || source.applicationId || source.id || source.Title || source.title);
      if (!directId) return null;
      const authorizedUnits = parseUnitList(source.AuthorizedUnitsJson || source.authorizedUnits || source.scopeUnits || source.ScopeUnitsJson, cleanText(source.PrimaryUnitName || source.primaryUnit || source.primaryUnitName || source.UnitValue));
      const normalized = {
        id: directId,
        applicantName: cleanText(source.ApplicantName || source.applicantName || source.DisplayName),
        applicantEmail: cleanEmail(source.ApplicantEmail || source.applicantEmail || source.Email),
        extensionNumber: cleanText(source.ExtensionNumber || source.extensionNumber),
        unitCategory: cleanText(source.UnitCategory || source.unitCategory),
        primaryUnit: cleanText(source.PrimaryUnitName || source.primaryUnit || source.primaryUnitName),
        secondaryUnit: cleanText(source.SecondaryUnitName || source.secondaryUnit || source.secondaryUnitName),
        unitValue: cleanText(source.UnitValue || source.unitValue || [source.PrimaryUnitName, source.SecondaryUnitName].filter(Boolean).join('／')),
        unitCode: cleanText(source.UnitCode || source.unitCode || source.PrimaryUnitCode),
        contactType: cleanText(source.ContactType || source.contactType) || 'primary',
        note: cleanText(source.Note || source.note),
        securityRoles: parseSecurityRoles(source.securityRoles || source.SecurityRolesJson),
        authorizedUnits,
        status: cleanText(source.Status || source.status) || UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW,
        statusLabel: cleanText(source.StatusLabel || source.statusLabel),
        statusDetail: cleanText(source.StatusDetail || source.statusDetail || source.ReviewComment || source.reviewComment),
        source: cleanText(source.Source || source.source) || 'remote',
        backendMode: getMode(),
        submittedAt: source.SubmittedAt || source.submittedAt || source.Created || source.createdAt || nowIso(),
        updatedAt: source.UpdatedAt || source.updatedAt || source.Modified || source.modifiedAt || nowIso(),
        reviewedAt: source.ReviewedAt || source.reviewedAt || null,
        reviewedBy: cleanText(source.ReviewedBy || source.reviewedBy),
        reviewComment: cleanText(source.ReviewComment || source.reviewComment),
        activationSentAt: source.ActivationSentAt || source.activationSentAt || null,
        activatedAt: source.ActivatedAt || source.activatedAt || null,
        externalUserId: cleanText(source.ExternalUserId || source.externalUserId),
        authorizationDocAttachmentId: cleanText(source.AuthorizationDocAttachmentId || source.authorizationDocAttachmentId),
        authorizationDocFileName: cleanText(source.AuthorizationDocFileName || source.authorizationDocFileName),
        authorizationDocContentType: cleanText(source.AuthorizationDocContentType || source.authorizationDocContentType),
        authorizationDocSize: Number(source.AuthorizationDocSize || source.authorizationDocSize || 0),
        authorizationDocUploadedAt: cleanText(source.AuthorizationDocUploadedAt || source.authorizationDocUploadedAt),
        authorizationDocDriveItemId: cleanText(source.AuthorizationDocDriveItemId || source.authorizationDocDriveItemId),
        hasAuthorizationDoc: !!cleanText(source.AuthorizationDocAttachmentId || source.authorizationDocAttachmentId || source.AuthorizationDocDriveItemId || source.authorizationDocDriveItemId),
        hasRequestedPassword: source.hasRequestedPassword === true || cleanText(source.HasRequestedPassword).toLowerCase() === 'true'
      };
      return decorateApplication(normalized);
    }

    function normalizeRemoteApplications(body) {
      const candidateList = []
        .concat(Array.isArray(body) ? body : [])
        .concat(Array.isArray(body && body.applications) ? body.applications : [])
        .concat(Array.isArray(body && body.items) ? body.items : [])
        .concat(Array.isArray(body && body.value) ? body.value : [])
        .concat(Array.isArray(body && body.data) ? body.data : []);
      const list = candidateList
        .map(normalizeRemoteApplication)
        .filter(Boolean);
      if (list.length) return list;

      const single = normalizeRemoteApplication(body && (body.application || body.item || body.data || body.result || body));
      return single ? [single] : [];
    }

    function buildRemoteApplicationFallback(payload, body) {
      const source = body && typeof body === 'object' ? body : {};
      const authorizedUnits = parseUnitList(payload && (payload.authorizedUnits || payload.scopeUnits || payload.units), cleanText(payload && payload.primaryUnit) || cleanText(payload && payload.unitValue));
      return decorateApplication({
        id: cleanText(source.id || source.applicationId || source.ApplicationId || source.Title) || ('pending-' + Date.now()),
        applicantName: cleanText(payload && payload.applicantName),
        applicantEmail: cleanEmail(payload && payload.applicantEmail),
        extensionNumber: cleanText(payload && payload.extensionNumber),
        unitCategory: cleanText(payload && payload.unitCategory),
        primaryUnit: cleanText(payload && payload.primaryUnit),
        secondaryUnit: cleanText(payload && payload.secondaryUnit),
        unitValue: cleanText(payload && payload.unitValue),
        unitCode: cleanText(payload && payload.unitCode),
        contactType: cleanText(payload && payload.contactType) || 'primary',
        note: cleanText(payload && payload.note),
        securityRoles: parseSecurityRoles(payload && payload.securityRoles),
        authorizedUnits,
        status: cleanText(source.status || source.Status) || UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW,
        statusLabel: cleanText(source.statusLabel || source.StatusLabel),
        statusDetail: cleanText(source.statusDetail || source.StatusDetail),
        source: 'remote',
        backendMode: getMode(),
        submittedAt: cleanText(source.submittedAt || source.SubmittedAt) || nowIso(),
        updatedAt: cleanText(source.updatedAt || source.UpdatedAt) || nowIso(),
        reviewedAt: cleanText(source.reviewedAt || source.ReviewedAt),
        reviewedBy: cleanText(source.reviewedBy || source.ReviewedBy),
        reviewComment: cleanText(source.reviewComment || source.ReviewComment),
        activationSentAt: cleanText(source.activationSentAt || source.ActivationSentAt),
        activatedAt: cleanText(source.activatedAt || source.ActivatedAt),
        externalUserId: cleanText(source.externalUserId || source.ExternalUserId),
        authorizationDocAttachmentId: cleanText(source.authorizationDocAttachmentId || source.AuthorizationDocAttachmentId),
        authorizationDocFileName: cleanText(source.authorizationDocFileName || source.AuthorizationDocFileName),
        authorizationDocContentType: cleanText(source.authorizationDocContentType || source.AuthorizationDocContentType),
        authorizationDocSize: Number(source.authorizationDocSize || source.AuthorizationDocSize || 0),
        authorizationDocUploadedAt: cleanText(source.authorizationDocUploadedAt || source.AuthorizationDocUploadedAt),
        authorizationDocDriveItemId: cleanText(source.authorizationDocDriveItemId || source.AuthorizationDocDriveItemId),
        hasAuthorizationDoc: !!cleanText(source.authorizationDocAttachmentId || source.AuthorizationDocAttachmentId || source.authorizationDocDriveItemId || source.AuthorizationDocDriveItemId),
        hasRequestedPassword: false
      });
    }

    function normalizeCorrectiveAttachment(entry) {
      const source = entry && typeof entry === 'object' ? entry : {};
      return {
        attachmentId: cleanText(source.attachmentId),
        driveItemId: cleanText(source.driveItemId),
        name: cleanText(source.name),
        type: cleanText(source.type || source.contentType),
        contentType: cleanText(source.contentType || source.type),
        size: Number(source.size || 0),
        extension: cleanText(source.extension).toLowerCase(),
        signature: cleanText(source.signature),
        storedAt: cleanText(source.storedAt),
        uploadedAt: cleanText(source.uploadedAt || source.storedAt),
        scope: cleanText(source.scope),
        ownerId: cleanText(source.ownerId),
        recordType: cleanText(source.recordType),
        webUrl: cleanText(source.webUrl),
        downloadUrl: cleanText(source.downloadUrl),
        path: cleanText(source.path),
        storage: cleanText(source.storage) || (cleanText(source.driveItemId) || cleanText(source.downloadUrl) || cleanText(source.webUrl) ? 'm365' : '')
      };
    }

    function normalizeCorrectiveHistoryEntry(entry) {
      const source = entry && typeof entry === 'object' ? entry : {};
      return {
        time: cleanText(source.time) || nowIso(),
        action: cleanText(source.action),
        user: cleanText(source.user)
      };
    }

    function normalizeCorrectiveTracking(entry) {
      const source = entry && typeof entry === 'object' ? entry : {};
      return {
        round: Number.isFinite(Number(source.round)) ? Number(source.round) : null,
        tracker: cleanText(source.tracker),
        trackDate: cleanText(source.trackDate) || null,
        execution: cleanText(source.execution),
        trackNote: cleanText(source.trackNote),
        result: cleanText(source.result),
        nextTrackDate: cleanText(source.nextTrackDate) || null,
        evidence: (Array.isArray(source.evidence) ? source.evidence : []).map(normalizeCorrectiveAttachment),
        submittedAt: cleanText(source.submittedAt) || null,
        requestedResult: cleanText(source.requestedResult),
        decision: cleanText(source.decision),
        reviewer: cleanText(source.reviewer),
        reviewDate: cleanText(source.reviewDate) || null,
        reviewedAt: cleanText(source.reviewedAt) || null
      };
    }

    function normalizeRemoteCorrectiveAction(record) {
      const source = maybeFields(record && (record.item || record.data || record.result || record));
      if (!source || typeof source !== 'object') return null;
      const id = cleanText(source.id || source.caseId || source.CaseId || source.Title);
      if (!id) return null;
      return {
        id,
        documentNo: cleanText(source.documentNo || source.DocumentNo),
        caseSeq: Number.isFinite(Number(source.caseSeq)) ? Number(source.caseSeq) : null,
        proposerUnit: cleanText(source.proposerUnit || source.ProposerUnit),
        proposerUnitCode: cleanText(source.proposerUnitCode || source.ProposerUnitCode),
        proposerName: cleanText(source.proposerName || source.ProposerName),
        proposerUsername: cleanText(source.proposerUsername || source.ProposerUsername),
        proposerDate: cleanText(source.proposerDate || source.ProposerDate) || null,
        handlerUnit: cleanText(source.handlerUnit || source.HandlerUnit),
        handlerUnitCode: cleanText(source.handlerUnitCode || source.HandlerUnitCode),
        handlerName: cleanText(source.handlerName || source.HandlerName),
        handlerUsername: cleanText(source.handlerUsername || source.HandlerUsername),
        handlerEmail: cleanEmail(source.handlerEmail || source.HandlerEmail),
        handlerDate: cleanText(source.handlerDate || source.HandlerDate) || null,
        deficiencyType: cleanText(source.deficiencyType || source.DeficiencyType),
        source: cleanText(source.source || source.Source),
        category: cleanArray(source.category || source.Category),
        clause: cleanText(source.clause || source.Clause),
        problemDesc: cleanText(source.problemDesc || source.ProblemDesc),
        occurrence: cleanText(source.occurrence || source.Occurrence),
        correctiveAction: cleanText(source.correctiveAction || source.CorrectiveAction),
        correctiveDueDate: cleanText(source.correctiveDueDate || source.CorrectiveDueDate) || null,
        rootCause: cleanText(source.rootCause || source.RootCause),
        riskDesc: cleanText(source.riskDesc || source.RiskDesc),
        riskAcceptor: cleanText(source.riskAcceptor || source.RiskAcceptor),
        riskAcceptDate: cleanText(source.riskAcceptDate || source.RiskAcceptDate) || null,
        riskAssessDate: cleanText(source.riskAssessDate || source.RiskAssessDate) || null,
        rootElimination: cleanText(source.rootElimination || source.RootElimination),
        rootElimDueDate: cleanText(source.rootElimDueDate || source.RootElimDueDate) || null,
        reviewResult: cleanText(source.reviewResult || source.ReviewResult),
        reviewNextDate: cleanText(source.reviewNextDate || source.ReviewNextDate) || null,
        reviewer: cleanText(source.reviewer || source.Reviewer),
        reviewDate: cleanText(source.reviewDate || source.ReviewDate) || null,
        trackings: (Array.isArray(source.trackings) ? source.trackings : []).map(normalizeCorrectiveTracking),
        pendingTracking: source.pendingTracking ? normalizeCorrectiveTracking(source.pendingTracking) : null,
        status: cleanText(source.status || source.Status),
        createdAt: cleanText(source.createdAt || source.CreatedAt) || nowIso(),
        updatedAt: cleanText(source.updatedAt || source.UpdatedAt) || nowIso(),
        closedDate: cleanText(source.closedDate || source.ClosedDate) || null,
        evidence: (Array.isArray(source.evidence) ? source.evidence : []).map(normalizeCorrectiveAttachment),
        history: (Array.isArray(source.history) ? source.history : []).map(normalizeCorrectiveHistoryEntry),
        backendMode: getCorrectiveActionMode()
      };
    }

    function normalizeRemoteCorrectiveActions(body) {
      const candidateList = []
        .concat(Array.isArray(body) ? body : [])
        .concat(Array.isArray(body && body.items) ? body.items : [])
        .concat(Array.isArray(body && body.value) ? body.value : [])
        .concat(Array.isArray(body && body.data) ? body.data : []);
      const list = candidateList
        .map(normalizeRemoteCorrectiveAction)
        .filter(Boolean);
      if (list.length) return list;
      const single = normalizeRemoteCorrectiveAction(body && (body.item || body.data || body.result || body));
      return single ? [single] : [];
    }

    function normalizeChecklistResult(source) {
      const base = source && typeof source === 'object' ? source : {};
      return {
        compliance: cleanText(base.compliance),
        execution: cleanText(base.execution),
        evidence: cleanText(base.evidence),
        evidenceFiles: (Array.isArray(base.evidenceFiles) ? base.evidenceFiles : []).map(normalizeTrainingAttachment)
      };
    }

    function normalizeChecklistResults(source) {
      let base = source;
      if (typeof base === 'string') {
        try {
          base = JSON.parse(base);
        } catch (_) {
          base = {};
        }
      }
      base = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
      const next = {};
      Object.keys(base).forEach((key) => {
        const cleanKey = cleanText(key);
        if (!cleanKey) return;
        next[cleanKey] = normalizeChecklistResult(base[key]);
      });
      return next;
    }

    function normalizeRemoteChecklist(record) {
      const source = maybeFields(record && (record.item || record.data || record.result || record));
      if (!source || typeof source !== 'object') return null;
      const id = cleanText(source.id || source.checklistId || source.ChecklistId || source.Title);
      if (!id) return null;
      const results = normalizeChecklistResults(source.results || source.ResultsJson);
      return {
        id,
        documentNo: cleanText(source.documentNo || source.DocumentNo),
        checklistSeq: Number.isFinite(Number(source.checklistSeq)) ? Number(source.checklistSeq) : (Number.isFinite(Number(source.ChecklistSeq)) ? Number(source.ChecklistSeq) : null),
        unit: cleanText(source.unit || source.Unit),
        unitCode: cleanText(source.unitCode || source.UnitCode),
        fillerName: cleanText(source.fillerName || source.FillerName),
        fillerUsername: cleanText(source.fillerUsername || source.FillerUsername),
        fillDate: cleanText(source.fillDate || source.FillDate) || null,
        auditYear: cleanText(source.auditYear || source.AuditYear),
        supervisor: cleanText(source.supervisor || source.supervisorName || source.SupervisorName),
        supervisorName: cleanText(source.supervisorName || source.SupervisorName || source.supervisor),
        supervisorTitle: cleanText(source.supervisorTitle || source.SupervisorTitle),
        signStatus: cleanText(source.signStatus || source.SignStatus),
        signDate: cleanText(source.signDate || source.SignDate) || null,
        supervisorNote: cleanText(source.supervisorNote || source.SupervisorNote),
        results,
        summary: {
          total: Number.isFinite(Number(source.summary && source.summary.total)) ? Number(source.summary.total) : Number(source.SummaryTotal || 0),
          conform: Number.isFinite(Number(source.summary && source.summary.conform)) ? Number(source.summary.conform) : Number(source.SummaryConform || 0),
          partial: Number.isFinite(Number(source.summary && source.summary.partial)) ? Number(source.summary.partial) : Number(source.SummaryPartial || 0),
          nonConform: Number.isFinite(Number(source.summary && source.summary.nonConform)) ? Number(source.summary.nonConform) : Number(source.SummaryNonConform || 0),
          na: Number.isFinite(Number(source.summary && source.summary.na)) ? Number(source.summary.na) : Number(source.SummaryNa || 0)
        },
        status: cleanText(source.status || source.Status) || '\u8349\u7a3f',
        createdAt: source.createdAt || source.CreatedAt || source.Created || nowIso(),
        updatedAt: source.updatedAt || source.UpdatedAt || source.Modified || nowIso(),
        backendMode: cleanText(source.backendMode || source.BackendMode) || getChecklistMode(),
        recordSource: cleanText(source.recordSource || source.RecordSource) || 'remote'
      };
    }

    function normalizeRemoteChecklists(body) {
      const candidateList = []
        .concat(Array.isArray(body) ? body : [])
        .concat(Array.isArray(body && body.items) ? body.items : [])
        .concat(Array.isArray(body && body.value) ? body.value : [])
        .concat(Array.isArray(body && body.data) ? body.data : []);
      const list = candidateList
        .map(normalizeRemoteChecklist)
        .filter(Boolean);
      if (list.length) return list;
      const single = normalizeRemoteChecklist(body && (body.item || body.data || body.result || body));
      return single ? [single] : [];
    }

    function parseJsonValue(value, fallback) {
      if (value === null || value === undefined || value === '') return typeof fallback === 'function' ? fallback() : fallback;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (_) {
          return typeof fallback === 'function' ? fallback() : fallback;
        }
      }
      return value;
    }

    function normalizeTrainingAttachment(entry) {
      const source = entry && typeof entry === 'object' ? entry : {};
      return {
        attachmentId: cleanText(source.attachmentId),
        driveItemId: cleanText(source.driveItemId),
        name: cleanText(source.name),
        type: cleanText(source.type || source.contentType),
        contentType: cleanText(source.contentType || source.type),
        size: Number(source.size || 0),
        extension: cleanText(source.extension).toLowerCase(),
        signature: cleanText(source.signature),
        storedAt: cleanText(source.storedAt),
        uploadedAt: cleanText(source.uploadedAt || source.storedAt),
        scope: cleanText(source.scope),
        ownerId: cleanText(source.ownerId),
        recordType: cleanText(source.recordType),
        webUrl: cleanText(source.webUrl),
        downloadUrl: cleanText(source.downloadUrl),
        path: cleanText(source.path),
        storage: cleanText(source.storage) || (cleanText(source.driveItemId) || cleanText(source.downloadUrl) || cleanText(source.webUrl) ? 'm365' : '')
      };
    }

    function normalizeTrainingHistoryEntry(entry) {
      const source = entry && typeof entry === 'object' ? entry : {};
      return {
        time: cleanText(source.time) || nowIso(),
        action: cleanText(source.action),
        user: cleanText(source.user)
      };
    }

    function normalizeTrainingRecord(entry) {
      const source = entry && typeof entry === 'object' ? entry : {};
      return {
        rosterId: cleanText(source.rosterId),
        unit: cleanText(source.unit),
        statsUnit: cleanText(source.statsUnit),
        l1Unit: cleanText(source.l1Unit),
        name: cleanText(source.name),
        unitName: cleanText(source.unitName),
        identity: cleanText(source.identity),
        jobTitle: cleanText(source.jobTitle),
        source: cleanText(source.source) || 'import',
        status: cleanText(source.status),
        completedGeneral: cleanText(source.completedGeneral),
        isInfoStaff: cleanText(source.isInfoStaff),
        completedProfessional: cleanText(source.completedProfessional),
        note: cleanText(source.note),
        hours: source.hours === '' ? '' : Number(source.hours || 0)
      };
    }

    function normalizeTrainingRecords(value) {
      const list = parseJsonValue(value, function () { return []; });
      return Array.isArray(list) ? list.map(normalizeTrainingRecord) : [];
    }

    function normalizeTrainingSummary(value, source) {
      const base = parseJsonValue(value, function () { return {}; });
      const summary = base && typeof base === 'object' ? base : {};
      return {
        totalPeople: Number(summary.totalPeople || source.TotalPeople || 0),
        activeCount: Number(summary.activeCount || source.ActiveCount || 0),
        totalRoster: Number(summary.totalRoster || source.TotalRoster || 0),
        inactiveCount: Number(summary.inactiveCount || source.InactiveCount || 0),
        completedCount: Number(summary.completedCount || source.CompletedCount || 0),
        readyCount: Number(summary.readyCount || source.ReadyCount || 0),
        incompleteCount: Number(summary.incompleteCount || source.IncompleteCount || 0),
        completionRate: Number(summary.completionRate || source.CompletionRate || 0),
        reachRate: Number(summary.reachRate || source.ReachRate || 0),
        reached: Number(summary.reached || source.Reached || 0),
        infoStaffCount: Number(summary.infoStaffCount || source.InfoStaffCount || 0),
        professionalPendingCount: Number(summary.professionalPendingCount || source.ProfessionalPendingCount || 0),
        missingStatusCount: Number(summary.missingStatusCount || source.MissingStatusCount || 0),
        missingFieldCount: Number(summary.missingFieldCount || source.MissingFieldCount || 0)
      };
    }

    function normalizeTrainingListSummary(value) {
      const summary = value && typeof value === 'object' ? value : {};
      return {
        total: Number(summary.total || 0),
        draft: Number(summary.draft || 0),
        pending: Number(summary.pending || 0),
        submitted: Number(summary.submitted || 0),
        returned: Number(summary.returned || 0)
      };
    }

    function normalizeTrainingAttachments(value) {
      const list = parseJsonValue(value, function () { return []; });
      return Array.isArray(list) ? list.map(normalizeTrainingAttachment) : [];
    }

    function normalizeTrainingHistory(value) {
      const list = parseJsonValue(value, function () { return []; });
      return Array.isArray(list) ? list.map(normalizeTrainingHistoryEntry) : [];
    }

    function normalizeRemoteTrainingForm(record) {
      const source = maybeFields(record && (record.item || record.data || record.result || record));
      if (!source || typeof source !== 'object') return null;
      const id = cleanText(source.id || source.formId || source.FormId || source.Title);
      if (!id) return null;
      return {
        id,
        documentNo: cleanText(source.documentNo || source.DocumentNo),
        formSeq: Number.isFinite(Number(source.formSeq)) ? Number(source.formSeq) : (Number.isFinite(Number(source.FormSeq)) ? Number(source.FormSeq) : null),
        unit: cleanText(source.unit || source.Unit),
        unitCode: cleanText(source.unitCode || source.UnitCode),
        statsUnit: cleanText(source.statsUnit || source.StatsUnit),
        fillerName: cleanText(source.fillerName || source.FillerName),
        fillerUsername: cleanText(source.fillerUsername || source.FillerUsername),
        submitterPhone: cleanText(source.submitterPhone || source.SubmitterPhone),
        submitterEmail: cleanEmail(source.submitterEmail || source.SubmitterEmail),
        fillDate: cleanText(source.fillDate || source.FillDate) || null,
        trainingYear: cleanText(source.trainingYear || source.TrainingYear),
        status: cleanText(source.status || source.Status) || '草稿',
        records: normalizeTrainingRecords(source.records || source.RecordsJson),
        summary: normalizeTrainingSummary(source.summary || source.SummaryJson, source),
        signedFiles: normalizeTrainingAttachments(source.signedFiles || source.SignedFilesJson),
        returnReason: cleanText(source.returnReason || source.ReturnReason),
        createdAt: cleanText(source.createdAt || source.CreatedAt || source.Created) || nowIso(),
        updatedAt: cleanText(source.updatedAt || source.UpdatedAt || source.Modified) || nowIso(),
        stepOneSubmittedAt: cleanText(source.stepOneSubmittedAt || source.StepOneSubmittedAt) || null,
        printedAt: cleanText(source.printedAt || source.PrintedAt) || null,
        signoffUploadedAt: cleanText(source.signoffUploadedAt || source.SignoffUploadedAt) || null,
        submittedAt: cleanText(source.submittedAt || source.SubmittedAt) || null,
        history: normalizeTrainingHistory(source.history || source.HistoryJson),
        backendMode: cleanText(source.backendMode || source.BackendMode) || getTrainingMode(),
        recordSource: cleanText(source.recordSource || source.RecordSource) || 'remote'
      };
    }

    function normalizeRemoteTrainingForms(body) {
      const candidateList = []
        .concat(Array.isArray(body) ? body : [])
        .concat(Array.isArray(body && body.items) ? body.items : [])
        .concat(Array.isArray(body && body.value) ? body.value : [])
        .concat(Array.isArray(body && body.data) ? body.data : []);
      const list = candidateList
        .map(normalizeRemoteTrainingForm)
        .filter(Boolean);
      if (list.length) return list;
      const single = normalizeRemoteTrainingForm(body && (body.item || body.data || body.result || body));
      return single ? [single] : [];
    }

    function normalizeRemoteTrainingRoster(record) {
      const source = maybeFields(record && (record.item || record.data || record.result || record));
      if (!source || typeof source !== 'object') return null;
      const id = cleanText(source.id || source.rosterId || source.RosterId || source.Title);
      if (!id) return null;
      return {
        id,
        unit: cleanText(source.unit || source.Unit),
        statsUnit: cleanText(source.statsUnit || source.StatsUnit),
        l1Unit: cleanText(source.l1Unit || source.L1Unit || source.statsUnit || source.StatsUnit),
        name: cleanText(source.name || source.Name || source.Title),
        unitName: cleanText(source.unitName || source.UnitName),
        identity: cleanText(source.identity || source.Identity),
        jobTitle: cleanText(source.jobTitle || source.JobTitle),
        source: cleanText(source.source || source.Source) || 'import',
        createdBy: cleanText(source.createdBy || source.CreatedBy),
        createdByUsername: cleanText(source.createdByUsername || source.CreatedByUsername),
        createdAt: cleanText(source.createdAt || source.CreatedAt || source.Created) || nowIso(),
        updatedAt: cleanText(source.updatedAt || source.UpdatedAt || source.Modified) || nowIso(),
        backendMode: cleanText(source.backendMode || source.BackendMode) || getTrainingMode(),
        recordSource: cleanText(source.recordSource || source.RecordSource) || 'remote'
      };
    }

    function normalizeRemoteTrainingRosters(body) {
      const candidateList = []
        .concat(Array.isArray(body) ? body : [])
        .concat(Array.isArray(body && body.items) ? body.items : [])
        .concat(Array.isArray(body && body.value) ? body.value : [])
        .concat(Array.isArray(body && body.data) ? body.data : []);
      const list = candidateList
        .map(normalizeRemoteTrainingRoster)
        .filter(Boolean);
      if (list.length) return list;
      const single = normalizeRemoteTrainingRoster(body && (body.item || body.data || body.result || body));
      return single ? [single] : [];
    }

    async function submitToRemote(normalizedPayload) {
      const config = getConfig();
      const endpoint = cleanText(config.unitContactSubmitEndpoint);
      if (!endpoint) throw new Error('未設定 unitContactSubmitEndpoint');
      const body = await requestJson(endpoint, {
        method: 'POST',
        body: buildSubmitEnvelope(normalizedPayload),
        contractVersion: CONTRACT_VERSION,
        sharedHeaders: config.unitContactSharedHeaders || {}
      });
      const applications = normalizeRemoteApplications(body);
      if (!applications.length) {
        if (body && typeof body === 'object' && body.ok !== false) {
          return {
            ok: true,
            mode: getMode(),
            application: buildRemoteApplicationFallback(normalizedPayload, body),
            raw: body,
            warning: '遠端服務未完整回傳申請資料，已使用送件內容建立暫時結果。'
          };
        }
        throw new Error('遠端服務沒有回傳申請資料');
      }
      return {
        ok: true,
        mode: getMode(),
        application: applications[0],
        raw: body
      };
    }

    async function lookupFromRemote(email) {
      const config = getConfig();
      const endpoint = cleanText(config.unitContactStatusEndpoint);
      if (!endpoint) throw new Error('未設定 unitContactStatusEndpoint');
      const method = String(config.unitContactStatusLookupMethod || 'POST').trim().toUpperCase();
      let body;
      if (method === 'GET') {
        const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
        url.searchParams.set(String(config.unitContactStatusQueryParam || 'email'), cleanEmail(email));
        url.searchParams.set('contractVersion', CONTRACT_VERSION);
        body = await requestJson(url.toString(), {
          method: 'GET',
          contractVersion: CONTRACT_VERSION,
          sharedHeaders: config.unitContactSharedHeaders || {}
        });
      } else {
        body = await requestJson(endpoint, {
          method: 'POST',
          body: buildLookupEnvelope(email),
          contractVersion: CONTRACT_VERSION,
          sharedHeaders: config.unitContactSharedHeaders || {}
        });
      }
      return normalizeRemoteApplications(body);
    }

    function getUnitContactApplicationsEndpoint() {
      const submitEndpoint = cleanText(getConfig().unitContactSubmitEndpoint);
      if (!submitEndpoint) return '';
      return submitEndpoint.replace(/\/apply$/, '/applications');
    }

    function getUnitContactReviewEndpoint() {
      const submitEndpoint = cleanText(getConfig().unitContactSubmitEndpoint);
      if (!submitEndpoint) return '';
      return submitEndpoint.replace(/\/apply$/, '/review');
    }

    function getUnitContactActivateEndpoint() {
      const submitEndpoint = cleanText(getConfig().unitContactSubmitEndpoint);
      if (!submitEndpoint) return '';
      return submitEndpoint.replace(/\/apply$/, '/activate');
    }

    function getUnitGovernanceEndpoint() {
      return '/api/unit-governance';
    }

    function getSecurityWindowInventoryEndpoint() {
      return '/api/security-window/inventory';
    }

    async function listUnitContactApplications(filters) {
      const endpoint = getUnitContactApplicationsEndpoint();
      if (!endpoint) throw new Error('未設定 unit-contact applications endpoint');
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const query = filters && typeof filters === 'object' ? filters : {};
      Object.keys(query).forEach(function (key) {
        const value = cleanText(query[key]);
        if (value) url.searchParams.set(key, value);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: CONTRACT_VERSION,
        sharedHeaders: getConfig().unitContactSharedHeaders || {}
      });
      return normalizeRemoteApplications({ applications: body && body.items ? body.items : [] });
    }

    async function listUnitContactApplicationsPaged(filters) {
      const endpoint = getUnitContactApplicationsEndpoint();
      if (!endpoint) throw new Error('未設定 unit-contact applications endpoint');
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const query = filters && typeof filters === 'object' ? filters : {};
      Object.keys(query).forEach(function (key) {
        const value = cleanText(query[key]);
        if (value) url.searchParams.set(key, value);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: CONTRACT_VERSION,
        sharedHeaders: getConfig().unitContactSharedHeaders || {}
      });
      const items = normalizeRemoteApplications({ applications: body && body.items ? body.items : [] });
      const total = Math.max(0, Number(body && body.total) || items.length || 0);
      const summary = body && body.summary && typeof body.summary === 'object'
        ? body.summary
        : {
            total,
            pendingReview: items.filter((item) => String(item && item.status || '').trim() === 'pending_review').length,
            approved: items.filter((item) => String(item && item.status || '').trim() === 'approved').length,
            activationPending: items.filter((item) => String(item && item.status || '').trim() === 'activation_pending').length,
            active: items.filter((item) => String(item && item.status || '').trim() === 'active').length,
            returned: items.filter((item) => String(item && item.status || '').trim() === 'returned').length,
            rejected: items.filter((item) => String(item && item.status || '').trim() === 'rejected').length
          };
      return {
        ok: !!(body && body.ok !== false),
        items,
        total,
        summary,
        page: body && body.page ? body.page : null,
        filters: body && body.filters ? body.filters : { ...query },
        generatedAt: cleanText(body && body.generatedAt),
        raw: body
      };
    }

    async function listSystemUsersPaged(filters) {
      const endpoint = getConfig().systemUsersEndpoint;
      if (!endpoint) throw new Error('未設定 systemUsersEndpoint');
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const query = filters && typeof filters === 'object' ? filters : {};
      Object.keys(query).forEach(function (key) {
        const value = cleanText(query[key]);
        if (value) url.searchParams.set(key, value);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: CONTRACT_VERSION,
        sharedHeaders: getConfig().systemUsersSharedHeaders || {}
      });
      const items = Array.isArray(body && body.items)
        ? body.items
        : (Array.isArray(body && body.value) ? body.value : []);
      return {
        ok: !!(body && body.ok !== false),
        items,
        total: Math.max(0, Number(body && body.total) || items.length || 0),
        summary: body && body.summary && typeof body.summary === 'object'
          ? body.summary
          : {
              total: items.length,
              admin: items.filter((item) => cleanText(item && item.role) === '最高管理員').length,
              unitAdmin: items.filter((item) => cleanText(item && item.role) === '單位管理員').length,
              securityWindow: items.filter((item) => Array.isArray(item && item.securityRoles) && item.securityRoles.filter(Boolean).length > 0).length
            },
        page: body && body.page ? body.page : null,
        filters: body && body.filters ? body.filters : { ...query },
        generatedAt: cleanText(body && body.generatedAt),
        raw: body
      };
    }

    async function reviewUnitContactApplication(payload) {
      const endpoint = getUnitContactReviewEndpoint();
      if (!endpoint) throw new Error('未設定 unit-contact review endpoint');
      const body = await requestJson(endpoint, {
        method: 'POST',
        body: buildUnitContactAdminEnvelope('unit-contact.review', payload),
        contractVersion: CONTRACT_VERSION,
        sharedHeaders: getConfig().unitContactSharedHeaders || {}
      });
      const items = normalizeRemoteApplications({ applications: body && body.item ? [body.item] : [] });
      return {
        ok: !!(body && body.ok !== false),
        item: items[0] || null,
        delivery: body && body.delivery ? body.delivery : null,
        raw: body
      };
    }

    async function activateUnitContactApplication(payload) {
      const endpoint = getUnitContactActivateEndpoint();
      if (!endpoint) throw new Error('未設定 unit-contact activate endpoint');
      const body = await requestJson(endpoint, {
        method: 'POST',
        body: buildUnitContactAdminEnvelope('unit-contact.activate', payload),
        contractVersion: CONTRACT_VERSION,
        sharedHeaders: getConfig().unitContactSharedHeaders || {}
      });
      const items = normalizeRemoteApplications({ applications: body && body.item ? [body.item] : [] });
      return {
        ok: !!(body && body.ok !== false),
        item: items[0] || null,
        delivery: body && body.delivery ? body.delivery : null,
        raw: body
      };
    }

    async function listUnitGovernanceEntries(query) {
      const endpoint = getUnitGovernanceEndpoint();
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const filters = query && typeof query === 'object' ? query : {};
      Object.entries(filters).forEach(([key, value]) => {
        const cleanValue = cleanText(value);
        if (cleanValue) url.searchParams.set(key, cleanValue);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: CONTRACT_VERSION
      });
      return {
        ok: !!(body && body.ok !== false),
        items: Array.isArray(body && body.items) ? body.items : [],
        summary: body && body.summary && typeof body.summary === 'object' ? body.summary : null,
        categorySummaries: body && body.categorySummaries && typeof body.categorySummaries === 'object' ? body.categorySummaries : null,
        page: body && body.page && typeof body.page === 'object' ? body.page : null,
        filters: body && body.filters && typeof body.filters === 'object' ? body.filters : null,
        total: Math.max(0, Number(body && body.total) || 0),
        generatedAt: cleanText(body && body.generatedAt),
        raw: body
      };
    }

    async function upsertUnitGovernanceEntry(payload) {
      const body = await requestJson(getUnitGovernanceEndpoint() + '/upsert', {
        method: 'POST',
        contractVersion: CONTRACT_VERSION,
        body: payload && typeof payload === 'object' ? payload : {}
      });
      return {
        ok: !!(body && body.ok !== false),
        item: body && body.item && typeof body.item === 'object' ? body.item : null,
        raw: body
      };
    }

    async function getSecurityWindowInventory(query) {
      const endpoint = getSecurityWindowInventoryEndpoint();
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const filters = query && typeof query === 'object' ? query : {};
      Object.entries(filters).forEach(([key, value]) => {
        const cleanValue = cleanText(value);
        if (cleanValue) url.searchParams.set(key, cleanValue);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: CONTRACT_VERSION
      });
      return {
        ok: !!(body && body.ok !== false),
        inventory: body && body.inventory && typeof body.inventory === 'object' ? body.inventory : null,
        categorySummaries: body && body.categorySummaries && typeof body.categorySummaries === 'object' ? body.categorySummaries : null,
        page: body && body.page && typeof body.page === 'object' ? body.page : null,
        filters: body && body.filters && typeof body.filters === 'object' ? body.filters : null,
        total: Math.max(0, Number(body && body.total) || 0),
        raw: body
      };
    }

    function getCorrectiveActionsEndpoint() {
      return cleanText(getConfig().correctiveActionsEndpoint).replace(/\/$/, '');
    }

    function getCorrectiveActionsHealthEndpoint() {
      const config = getConfig();
      const explicit = cleanText(config.correctiveActionsHealthEndpoint);
      if (explicit) return explicit;
      const endpoint = getCorrectiveActionsEndpoint();
      return endpoint ? endpoint + '/health' : '';
    }

    function assertCorrectiveActionsEndpoint() {
      const endpoint = getCorrectiveActionsEndpoint();
      if (!endpoint) throw new Error('未設定 correctiveActionsEndpoint');
      return endpoint;
    }

    function getCorrectiveActionsSharedHeaders() {
      const config = getConfig();
      return config.correctiveActionsSharedHeaders || {};
    }

    async function requestCorrectiveAction(path, options) {
      const endpoint = assertCorrectiveActionsEndpoint();
      return requestJson(endpoint + path, {
        method: options && options.method || 'GET',
        body: options && options.body,
        contractVersion: CORRECTIVE_ACTIONS_CONTRACT_VERSION,
        sharedHeaders: getCorrectiveActionsSharedHeaders()
      });
    }

    async function getCorrectiveActionHealth() {
      const endpoint = getCorrectiveActionsHealthEndpoint();
      if (!endpoint) throw new Error('未設定 correctiveActionsHealthEndpoint');
      return requestJson(endpoint, {
        method: 'GET',
        contractVersion: CORRECTIVE_ACTIONS_CONTRACT_VERSION,
        sharedHeaders: getCorrectiveActionsSharedHeaders()
      });
    }

    async function listCorrectiveActions(query) {
      const endpoint = assertCorrectiveActionsEndpoint();
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const filters = query && typeof query === 'object' ? query : {};
      Object.entries(filters).forEach(([key, value]) => {
        const cleanValue = cleanText(value);
        if (cleanValue) url.searchParams.set(key, cleanValue);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: CORRECTIVE_ACTIONS_CONTRACT_VERSION,
        sharedHeaders: getCorrectiveActionsSharedHeaders()
      });
      return {
        ok: !!(body && body.ok !== false),
        mode: getCorrectiveActionMode(),
        items: normalizeRemoteCorrectiveActions(body),
        raw: body
      };
    }

    async function getCorrectiveAction(id) {
      const body = await requestCorrectiveAction('/' + encodeURIComponent(cleanText(id)), {
        method: 'GET'
      });
      const items = normalizeRemoteCorrectiveActions(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getCorrectiveActionMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function createCorrectiveAction(payload) {
      const body = await requestCorrectiveAction('', {
        method: 'POST',
        body: buildCorrectiveActionEnvelope(CORRECTIVE_ACTION_ACTIONS.CREATE, payload)
      });
      const items = normalizeRemoteCorrectiveActions(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getCorrectiveActionMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function respondCorrectiveAction(id, payload) {
      const body = await requestCorrectiveAction('/' + encodeURIComponent(cleanText(id)) + '/respond', {
        method: 'POST',
        body: buildCorrectiveActionEnvelope(CORRECTIVE_ACTION_ACTIONS.RESPOND, payload)
      });
      const items = normalizeRemoteCorrectiveActions(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getCorrectiveActionMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function reviewCorrectiveAction(id, payload) {
      const body = await requestCorrectiveAction('/' + encodeURIComponent(cleanText(id)) + '/review', {
        method: 'POST',
        body: buildCorrectiveActionEnvelope(CORRECTIVE_ACTION_ACTIONS.REVIEW, payload)
      });
      const items = normalizeRemoteCorrectiveActions(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getCorrectiveActionMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function submitCorrectiveActionTracking(id, payload) {
      const body = await requestCorrectiveAction('/' + encodeURIComponent(cleanText(id)) + '/tracking-submit', {
        method: 'POST',
        body: buildCorrectiveActionEnvelope(CORRECTIVE_ACTION_ACTIONS.TRACKING_SUBMIT, payload)
      });
      const items = normalizeRemoteCorrectiveActions(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getCorrectiveActionMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function reviewCorrectiveActionTracking(id, payload) {
      const body = await requestCorrectiveAction('/' + encodeURIComponent(cleanText(id)) + '/tracking-review', {
        method: 'POST',
        body: buildCorrectiveActionEnvelope(CORRECTIVE_ACTION_ACTIONS.TRACKING_REVIEW, payload)
      });
      const items = normalizeRemoteCorrectiveActions(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getCorrectiveActionMode(),
        item: items[0] || null,
        raw: body
      };
    }

    function getChecklistsEndpoint() {
      return cleanText(getConfig().checklistEndpoint).replace(/\/$/, '');
    }

    function getChecklistHealthEndpoint() {
      const config = getConfig();
      const explicit = cleanText(config.checklistHealthEndpoint);
      if (explicit) return explicit;
      const endpoint = getChecklistsEndpoint();
      return endpoint ? endpoint + '/health' : '';
    }

    function assertChecklistEndpoint() {
      const endpoint = getChecklistsEndpoint();
      if (!endpoint) throw new Error('未設定 checklistEndpoint');
      return endpoint;
    }

    function getChecklistSharedHeaders() {
      const config = getConfig();
      return config.checklistSharedHeaders || {};
    }

    async function requestChecklist(path, options) {
      const endpoint = assertChecklistEndpoint();
      return requestJson(endpoint + path, {
        method: options && options.method || 'GET',
        body: options && options.body,
        timeoutMs: options && options.timeoutMs,
        contractVersion: CHECKLISTS_CONTRACT_VERSION,
        sharedHeaders: getChecklistSharedHeaders()
      });
    }

    async function getChecklistHealth() {
      const endpoint = getChecklistHealthEndpoint();
      if (!endpoint) throw new Error('未設定 checklistHealthEndpoint');
      return requestJson(endpoint, {
        method: 'GET',
        contractVersion: CHECKLISTS_CONTRACT_VERSION,
        sharedHeaders: getChecklistSharedHeaders()
      });
    }

    async function listChecklists(query) {
      const endpoint = assertChecklistEndpoint();
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const filters = query && typeof query === 'object' ? query : {};
      Object.entries(filters).forEach(([key, value]) => {
        const cleanValue = cleanText(value);
        if (cleanValue) url.searchParams.set(key, cleanValue);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: CHECKLISTS_CONTRACT_VERSION,
        sharedHeaders: getChecklistSharedHeaders()
      });
      return {
        ok: !!(body && body.ok !== false),
        mode: getChecklistMode(),
        items: normalizeRemoteChecklists(body),
        total: Number(body && body.total || 0),
        summary: body && body.summary && typeof body.summary === 'object'
          ? {
              total: Number(body.summary.total || 0),
              editing: Number(body.summary.editing || 0),
              pendingExport: Number(body.summary.pendingExport || 0),
              closed: Number(body.summary.closed || 0)
            }
          : null,
        page: body && body.page && typeof body.page === 'object' ? body.page : null,
        raw: body
      };
    }

    async function getChecklistListSummary(query) {
      const filters = query && typeof query === 'object' ? { ...query } : {};
      filters.summaryOnly = '1';
      const response = await listChecklists(filters);
      return {
        ok: !!response.ok,
        mode: response.mode,
        summary: response.summary && typeof response.summary === 'object'
          ? {
              total: Number(response.summary.total || 0),
              editing: Number(response.summary.editing || 0),
              pendingExport: Number(response.summary.pendingExport || 0),
              closed: Number(response.summary.closed || 0)
            }
          : { total: 0, editing: 0, pendingExport: 0, closed: 0 },
        total: Math.max(0, Number(response.total) || 0),
        raw: response.raw
      };
    }

    async function getChecklistRecord(id) {
      const body = await requestChecklist('/' + encodeURIComponent(cleanText(id)), {
        method: 'GET'
      });
      const items = normalizeRemoteChecklists(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getChecklistMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function saveChecklistDraft(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestChecklist('/' + encodeURIComponent(cleanId) + '/save-draft', {
        method: 'POST',
        body: buildChecklistEnvelope(CHECKLIST_ACTIONS.SAVE_DRAFT, payload)
      });
      const items = normalizeRemoteChecklists(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getChecklistMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function submitChecklist(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestChecklist('/' + encodeURIComponent(cleanId) + '/submit', {
        method: 'POST',
        body: buildChecklistEnvelope(CHECKLIST_ACTIONS.SUBMIT, payload)
      });
      const items = normalizeRemoteChecklists(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getChecklistMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function deleteChecklistsByYear(auditYear) {
      const cleanYear = cleanText(auditYear);
      const config = getConfig();
      const body = await requestChecklist('/year/' + encodeURIComponent(cleanYear), {
        method: 'DELETE',
        timeoutMs: Number(config.apiWriteTimeoutMs || config.unitContactRequestTimeoutMs || 45000),
        body: buildChecklistEnvelope(CHECKLIST_ACTIONS.DELETE_YEAR, { auditYear: cleanYear })
      });
      return {
        ok: !!(body && body.ok !== false),
        mode: getChecklistMode(),
        deletedCount: Number(body && body.deletedCount || 0),
        deletedIds: Array.isArray(body && body.deletedIds) ? body.deletedIds.map(cleanText).filter(Boolean) : [],
        year: cleanYear,
        raw: body
      };
    }

    function getTrainingFormsEndpoint() {
      return cleanText(getConfig().trainingFormsEndpoint).replace(/\/$/, '');
    }

    function getTrainingRostersEndpoint() {
      return cleanText(getConfig().trainingRostersEndpoint).replace(/\/$/, '');
    }

    function getTrainingHealthEndpoint() {
      const config = getConfig();
      const explicit = cleanText(config.trainingHealthEndpoint);
      if (explicit) return explicit;
      const endpoint = getTrainingFormsEndpoint();
      if (!endpoint) return '';
      return endpoint.replace(/\/forms$/, '') + '/health';
    }

    function assertTrainingFormsEndpoint() {
      const endpoint = getTrainingFormsEndpoint();
      if (!endpoint) throw new Error('未設定 trainingFormsEndpoint');
      return endpoint;
    }

    function assertTrainingRostersEndpoint() {
      const endpoint = getTrainingRostersEndpoint();
      if (!endpoint) throw new Error('未設定 trainingRostersEndpoint');
      return endpoint;
    }

    function getTrainingSharedHeaders() {
      const config = getConfig();
      return config.trainingSharedHeaders || {};
    }

    async function requestTrainingForms(path, options) {
      const endpoint = assertTrainingFormsEndpoint();
      return requestJson(endpoint + path, {
        method: options && options.method || 'GET',
        body: options && options.body,
        timeoutMs: options && options.timeoutMs,
        contractVersion: TRAINING_CONTRACT_VERSION,
        sharedHeaders: getTrainingSharedHeaders()
      });
    }

    async function requestTrainingRosters(path, options) {
      const endpoint = assertTrainingRostersEndpoint();
      return requestJson(endpoint + path, {
        method: options && options.method || 'GET',
        body: options && options.body,
        timeoutMs: options && options.timeoutMs,
        contractVersion: TRAINING_CONTRACT_VERSION,
        sharedHeaders: getTrainingSharedHeaders()
      });
    }

    async function getTrainingHealth() {
      const endpoint = getTrainingHealthEndpoint();
      if (!endpoint) throw new Error('未設定 trainingHealthEndpoint');
      return requestJson(endpoint, {
        method: 'GET',
        contractVersion: TRAINING_CONTRACT_VERSION,
        sharedHeaders: getTrainingSharedHeaders()
      });
    }

    async function listTrainingForms(query) {
      const endpoint = assertTrainingFormsEndpoint();
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const filters = query && typeof query === 'object' ? query : {};
      Object.entries(filters).forEach(([key, value]) => {
        const cleanValue = cleanText(value);
        if (cleanValue) url.searchParams.set(key, cleanValue);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: TRAINING_CONTRACT_VERSION,
        sharedHeaders: getTrainingSharedHeaders()
      });
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        items: normalizeRemoteTrainingForms(body),
        summary: normalizeTrainingListSummary(body && body.summary),
        total: Math.max(0, Number(body && body.total) || 0),
        raw: body
      };
    }

    async function getTrainingFormsSummary(query) {
      const filters = query && typeof query === 'object' ? { ...query } : {};
      filters.summaryOnly = '1';
      const response = await listTrainingForms(filters);
      return {
        ok: !!response.ok,
        mode: response.mode,
        summary: normalizeTrainingListSummary(response.summary),
        total: Math.max(0, Number(response.total) || 0),
        raw: response.raw
      };
    }

    async function getTrainingFormRecord(id) {
      const body = await requestTrainingForms('/' + encodeURIComponent(cleanText(id)), {
        method: 'GET'
      });
      const items = normalizeRemoteTrainingForms(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function saveTrainingDraft(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestTrainingForms('/' + encodeURIComponent(cleanId) + '/save-draft', {
        method: 'POST',
        body: buildTrainingEnvelope(TRAINING_FORM_ACTIONS.SAVE_DRAFT, payload)
      });
      const items = normalizeRemoteTrainingForms(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function submitTrainingStepOne(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestTrainingForms('/' + encodeURIComponent(cleanId) + '/submit-step-one', {
        method: 'POST',
        body: buildTrainingEnvelope(TRAINING_FORM_ACTIONS.SUBMIT_STEP_ONE, payload)
      });
      const items = normalizeRemoteTrainingForms(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function markTrainingPrinted(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestTrainingForms('/' + encodeURIComponent(cleanId) + '/mark-printed', {
        method: 'POST',
        body: buildTrainingEnvelope(TRAINING_FORM_ACTIONS.MARK_PRINTED, payload)
      });
      const items = normalizeRemoteTrainingForms(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function finalizeTrainingForm(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestTrainingForms('/' + encodeURIComponent(cleanId) + '/finalize', {
        method: 'POST',
        body: buildTrainingEnvelope(TRAINING_FORM_ACTIONS.FINALIZE, payload)
      });
      const items = normalizeRemoteTrainingForms(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function returnTrainingForm(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestTrainingForms('/' + encodeURIComponent(cleanId) + '/return', {
        method: 'POST',
        body: buildTrainingEnvelope(TRAINING_FORM_ACTIONS.RETURN, payload)
      });
      const items = normalizeRemoteTrainingForms(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function undoTrainingForm(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestTrainingForms('/' + encodeURIComponent(cleanId) + '/undo', {
        method: 'POST',
        body: buildTrainingEnvelope(TRAINING_FORM_ACTIONS.UNDO, payload)
      });
      const items = normalizeRemoteTrainingForms(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function listTrainingRosters(query) {
      const endpoint = assertTrainingRostersEndpoint();
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const filters = query && typeof query === 'object' ? query : {};
      Object.entries(filters).forEach(([key, value]) => {
        const cleanValue = cleanText(value);
        if (cleanValue) url.searchParams.set(key, cleanValue);
      });
      const body = await requestJson(url.toString(), {
        method: 'GET',
        contractVersion: TRAINING_CONTRACT_VERSION,
        sharedHeaders: getTrainingSharedHeaders()
      });
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        items: normalizeRemoteTrainingRosters(body),
        total: Number(body && body.total || 0),
        page: body && body.page && typeof body.page === 'object' ? body.page : null,
        raw: body
      };
    }

    async function upsertTrainingRoster(payload) {
      const body = await requestTrainingRosters('/upsert', {
        method: 'POST',
        body: buildTrainingEnvelope(TRAINING_ROSTER_ACTIONS.UPSERT, payload)
      });
      const items = normalizeRemoteTrainingRosters(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function upsertTrainingRosterBatch(payload) {
      const config = getConfig();
      const body = await requestTrainingRosters('/upsert-batch', {
        method: 'POST',
        timeoutMs: Math.max(120000, Number(config.trainingBatchTimeoutMs || config.apiWriteTimeoutMs || config.unitContactRequestTimeoutMs || 45000)),
        body: buildTrainingEnvelope(TRAINING_ROSTER_ACTIONS.UPSERT_BATCH, payload)
      });
      const items = normalizeRemoteTrainingRosters(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        items,
        summary: body && body.summary && typeof body.summary === 'object' ? body.summary : {},
        errors: Array.isArray(body && body.errors) ? body.errors : [],
        raw: body
      };
    }

    async function deleteTrainingRoster(id, payload) {
      const cleanId = cleanText(id || (payload && payload.id));
      const body = await requestTrainingRosters('/' + encodeURIComponent(cleanId) + '/delete', {
        method: 'POST',
        body: buildTrainingEnvelope(TRAINING_ROSTER_ACTIONS.DELETE, payload)
      });
      const items = normalizeRemoteTrainingRosters(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        item: items[0] || null,
        raw: body
      };
    }

    async function deleteTrainingRosterBatch(payload) {
      const config = getConfig();
      const body = await requestTrainingRosters('/delete-batch', {
        method: 'POST',
        timeoutMs: Math.max(120000, Number(config.trainingBatchTimeoutMs || config.apiWriteTimeoutMs || config.unitContactRequestTimeoutMs || 45000)),
        body: buildTrainingEnvelope(TRAINING_ROSTER_ACTIONS.DELETE_BATCH, payload)
      });
      const items = normalizeRemoteTrainingRosters(body);
      return {
        ok: !!(body && body.ok !== false),
        mode: getTrainingMode(),
        items,
        deletedIds: Array.isArray(body && body.deletedIds) ? body.deletedIds.map(cleanText).filter(Boolean) : [],
        deletedCount: Number(body && body.deletedCount || 0),
        skippedIds: Array.isArray(body && body.skippedIds) ? body.skippedIds.map(cleanText).filter(Boolean) : [],
        raw: body
      };
    }

    async function submitUnitContactApplication(payload) {
      const normalized = normalizePayload(payload);
      assertApplicationPayload(normalized);
      assertNoDuplicateActiveApplication(normalized);

      const mode = getMode();
      if (mode === 'sharepoint-flow' || mode === 'm365-api') {
        return submitToRemote(normalized);
      }

      const application = createUnitContactApplication({
        ...normalized,
        status: UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW,
        statusLabel: getStatusMeta(UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW).label,
        statusDetail: getStatusMeta(UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW).detail,
        backendMode: mode
      });

      return {
        ok: true,
        mode,
        application: decorateApplication(application)
      };
    }

    async function lookupUnitContactApplicationsByEmail(email) {
      const cleanValue = cleanEmail(email);
      if (!cleanValue) return [];

      const mode = getMode();
      if (mode === 'sharepoint-flow' || mode === 'm365-api') {
        return lookupFromRemote(cleanValue);
      }

      return findUnitContactApplicationsByEmail(cleanValue).map((application) => {
        const decorated = decorateApplication(application);
        return decorated ? {
          id: decorated.id,
          status: decorated.status,
          statusLabel: decorated.statusLabel,
          statusDetail: decorated.statusDetail,
          statusTone: decorated.statusTone,
          submittedAt: decorated.submittedAt,
          updatedAt: decorated.updatedAt
        } : null;
      }).filter(Boolean);
    }

    function buildActivationUrl(applicationId) {
      const config = getConfig();
      const base = cleanText(config.unitContactActivationEndpoint) || cleanText(config.activationPathBase) || '#activate-unit-contact';
      const safeId = encodeURIComponent(cleanText(applicationId));
      if (!safeId) return base;
      if (/^https?:\/\//i.test(base)) {
        const url = new URL(base, typeof window !== 'undefined' ? window.location.href : undefined);
        if (typeof window !== 'undefined' && window.location && url.origin !== window.location.origin) {
          return '#activate-unit-contact';
        }
        url.searchParams.set('applicationId', safeId);
        return url.toString();
      }
      const hash = base.replace(/\/$/, '');
      return hash + '/' + safeId;
    }

    function markActivationPending(id) {
      const updated = updateUnitContactApplication(id, {
        status: UNIT_CONTACT_APPLICATION_STATUSES.ACTIVATION_PENDING,
        activationSentAt: nowIso()
      });
      return decorateApplication(updated);
    }

    return {
      CONTRACT_VERSION,
      CORRECTIVE_ACTIONS_CONTRACT_VERSION,
      CHECKLISTS_CONTRACT_VERSION,
      TRAINING_CONTRACT_VERSION,
      getMode,
      getModeLabel,
      getCorrectiveActionMode,
      getCorrectiveActionModeLabel,
      getChecklistMode,
      getChecklistModeLabel,
      getTrainingMode,
      getTrainingModeLabel,
      getStatusMeta,
      buildActivationUrl,
      buildSubmitEnvelope,
      buildLookupEnvelope,
      buildUnitContactAdminEnvelope,
      buildCorrectiveActionEnvelope,
      buildChecklistEnvelope,
      buildTrainingEnvelope,
      getUnitContactApplication: function (id) {
        return decorateApplication(getUnitContactApplication(id));
      },
      getAllUnitContactApplications: function () {
        return getAllUnitContactApplications().map(decorateApplication);
      },
      submitUnitContactApplication,
      lookupUnitContactApplicationsByEmail,
      listUnitContactApplications,
      listUnitContactApplicationsPaged,
      reviewUnitContactApplication,
      activateUnitContactApplication,
      listSystemUsersPaged,
      listUnitGovernanceEntries,
      upsertUnitGovernanceEntry,
      getSecurityWindowInventory,
      markActivationPending,
      getCorrectiveActionHealth,
      listCorrectiveActions,
      getCorrectiveAction,
      createCorrectiveAction,
      respondCorrectiveAction,
      reviewCorrectiveAction,
      submitCorrectiveActionTracking,
      reviewCorrectiveActionTracking,
      getChecklistHealth,
      listChecklists,
      getChecklistListSummary,
      getChecklistRecord,
      saveChecklistDraft,
      submitChecklist,
      deleteChecklistsByYear,
      getTrainingHealth,
      listTrainingForms,
      getTrainingFormsSummary,
      getTrainingFormRecord,
      saveTrainingDraft,
      submitTrainingStepOne,
      markTrainingPrinted,
      finalizeTrainingForm,
      returnTrainingForm,
      undoTrainingForm,
      listTrainingRosters,
      upsertTrainingRoster,
      upsertTrainingRosterBatch,
      deleteTrainingRoster,
      deleteTrainingRosterBatch
    };
  };
})();
