(function () {
  window.createM365ApiClient = function createM365ApiClient(deps) {
    const {
      UNIT_CONTACT_APPLICATION_STATUSES,
      createUnitContactApplication,
      updateUnitContactApplication,
      getUnitContactApplication,
      getAllUnitContactApplications,
      findUnitContactApplicationsByEmail,
      getOfficialUnitMeta
    } = deps;

    const CONTRACT_VERSION = '2026-03-11';
    const DEFAULT_CONFIG = {
      unitContactMode: 'local-emulator',
      unitContactSubmitEndpoint: '',
      unitContactStatusEndpoint: '',
      unitContactActivationEndpoint: '',
      unitContactRequestTimeoutMs: 15000,
      unitContactStatusLookupMethod: 'POST',
      unitContactStatusQueryParam: 'email',
      unitContactSharedHeaders: {}
    };

    const STATUS_META = {
      [UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW]: {
        label: '待人工審核',
        tone: 'pending',
        detail: '申請已收件，將由資安管理端確認單位與窗口資格。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.RETURNED]: {
        label: '待補件',
        tone: 'attention',
        detail: '管理端已退回申請，請依通知內容補齊資料。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.APPROVED]: {
        label: '已核准',
        tone: 'approved',
        detail: '申請已核准，系統將寄送啟用資訊。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.REJECTED]: {
        label: '已婉拒',
        tone: 'danger',
        detail: '申請未通過，若需協助請洽系統管理者。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.ACTIVATION_PENDING]: {
        label: '待啟用',
        tone: 'approved',
        detail: '啟用通知已送出，請依信件完成帳號啟用。'
      },
      [UNIT_CONTACT_APPLICATION_STATUSES.ACTIVE]: {
        label: '已啟用',
        tone: 'live',
        detail: '窗口帳號已完成啟用，可登入系統作業。'
      }
    };

    function nowIso() {
      return new Date().toISOString();
    }

    function makeRequestId(prefix) {
      return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function getConfig() {
      const runtime = (typeof window !== 'undefined' && window.__M365_UNIT_CONTACT_CONFIG__) || {};
      return {
        ...DEFAULT_CONFIG,
        ...(runtime && typeof runtime === 'object' ? runtime : {})
      };
    }

    function getMode() {
      return String(getConfig().unitContactMode || 'local-emulator').trim() || 'local-emulator';
    }

    function getModeLabel() {
      const mode = getMode();
      if (mode === 'm365-api') return 'M365 API 整合模式';
      if (mode === 'sharepoint-flow') return 'A3 / SharePoint / Power Automate 模式';
      return '前端驗證模式';
    }

    function getStatusMeta(status) {
      return STATUS_META[String(status || '').trim()] || {
        label: '處理中',
        tone: 'pending',
        detail: '申請已建立，等待後續處理。'
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

    function cleanText(value) {
      return String(value || '').trim();
    }

    function cleanEmail(value) {
      return cleanText(value).toLowerCase();
    }

    function buildClientContext() {
      return {
        contractVersion: CONTRACT_VERSION,
        source: 'isms-form-redesign-frontend',
        frontendOrigin: typeof window !== 'undefined' && window.location ? window.location.origin : '',
        frontendHash: typeof window !== 'undefined' && window.location ? String(window.location.hash || '') : '',
        sentAt: nowIso()
      };
    }

    function normalizePayload(payload) {
      const unitValue = cleanText(payload && payload.unitValue);
      const officialMeta = getOfficialUnitMeta(unitValue);
      return {
        applicantName: cleanText(payload && payload.applicantName),
        applicantEmail: cleanEmail(payload && payload.applicantEmail),
        extensionNumber: cleanText(payload && payload.extensionNumber),
        unitCategory: cleanText(payload && payload.unitCategory),
        primaryUnit: cleanText(payload && payload.primaryUnit),
        secondaryUnit: cleanText(payload && payload.secondaryUnit),
        unitValue,
        unitCode: cleanText(payload && payload.unitCode) || cleanText(officialMeta && officialMeta.code),
        contactType: cleanText(payload && payload.contactType) || 'primary',
        note: cleanText(payload && payload.note)
      };
    }

    function assertApplicationPayload(payload) {
      if (!payload.unitValue) throw new Error('請先選擇申請單位');
      if (!payload.applicantName) throw new Error('請輸入姓名');
      if (!payload.extensionNumber) throw new Error('請輸入分機');
      if (!payload.applicantEmail) throw new Error('請輸入信箱');
      if (!payload.unitCode) throw new Error('此單位尚未取得正式代碼，請先確認單位資料');
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
        throw new Error('此信箱已存在同單位的進行中申請，請改用進度查詢或洽管理者處理。');
      }
    }

    function buildHeaders(extraHeaders) {
      const config = getConfig();
      return {
        'Content-Type': 'application/json',
        'X-ISMS-Contract-Version': CONTRACT_VERSION,
        ...(config.unitContactSharedHeaders || {}),
        ...(extraHeaders || {})
      };
    }

    async function requestJson(url, options) {
      const requestOptions = options || {};
      const config = getConfig();
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutMs = Number(config.unitContactRequestTimeoutMs || 15000);
      let timeoutId = null;
      if (controller && timeoutMs > 0) {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      }
      try {
        const response = await fetch(url, {
          method: requestOptions.method || 'POST',
          headers: buildHeaders(requestOptions.headers),
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
          throw new Error(serverMessage || ('後端回應異常（HTTP ' + response.status + '）'));
        }
        return parsed || { ok: true };
      } catch (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('連線逾時，請稍後再試');
        }
        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    function buildSubmitEnvelope(payload) {
      return {
        action: 'unit-contact.apply',
        requestId: makeRequestId('uca'),
        context: buildClientContext(),
        payload
      };
    }

    function buildLookupEnvelope(email) {
      return {
        action: 'unit-contact.lookup',
        requestId: makeRequestId('ucl'),
        context: buildClientContext(),
        payload: { email: cleanEmail(email) }
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
        externalUserId: cleanText(source.ExternalUserId || source.externalUserId)
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

    async function submitToRemote(normalizedPayload) {
      const config = getConfig();
      const endpoint = cleanText(config.unitContactSubmitEndpoint);
      if (!endpoint) throw new Error('尚未設定 unitContactSubmitEndpoint');
      const body = await requestJson(endpoint, {
        method: 'POST',
        body: buildSubmitEnvelope(normalizedPayload)
      });
      const applications = normalizeRemoteApplications(body);
      if (!applications.length) {
        throw new Error('後端沒有回傳可辨識的申請資料');
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
      if (!endpoint) throw new Error('尚未設定 unitContactStatusEndpoint');
      const method = String(config.unitContactStatusLookupMethod || 'POST').trim().toUpperCase();
      let body;
      if (method === 'GET') {
        const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
        url.searchParams.set(String(config.unitContactStatusQueryParam || 'email'), cleanEmail(email));
        url.searchParams.set('contractVersion', CONTRACT_VERSION);
        body = await requestJson(url.toString(), { method: 'GET' });
      } else {
        body = await requestJson(endpoint, {
          method: 'POST',
          body: buildLookupEnvelope(email)
        });
      }
      return normalizeRemoteApplications(body);
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

      return findUnitContactApplicationsByEmail(cleanValue).map(decorateApplication);
    }

    function buildActivationUrl(applicationId) {
      const config = getConfig();
      const base = cleanText(config.unitContactActivationEndpoint) || cleanText(config.activationPathBase) || '#activate-unit-contact';
      const safeId = encodeURIComponent(cleanText(applicationId));
      if (!safeId) return base;
      if (base.indexOf('http://') === 0 || base.indexOf('https://') === 0) {
        const url = new URL(base);
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
      getMode,
      getModeLabel,
      getStatusMeta,
      buildActivationUrl,
      buildSubmitEnvelope,
      buildLookupEnvelope,
      getUnitContactApplication: function (id) {
        return decorateApplication(getUnitContactApplication(id));
      },
      getAllUnitContactApplications: function () {
        return getAllUnitContactApplications().map(decorateApplication);
      },
      submitUnitContactApplication,
      lookupUnitContactApplicationsByEmail,
      markActivationPending
    };
  };
})();
