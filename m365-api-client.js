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

    const DEFAULT_CONFIG = {
      unitContactMode: 'local-emulator',
      unitContactSubmitEndpoint: '',
      unitContactStatusEndpoint: ''
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
      if (mode === 'sharepoint-flow') return 'SharePoint / Power Automate 模式';
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
        statusTone: meta.tone,
        statusDetail: application.statusDetail || meta.detail
      };
    }

    function normalizePayload(payload) {
      const unitValue = String(payload && payload.unitValue || '').trim();
      const officialMeta = getOfficialUnitMeta(unitValue);
      return {
        applicantName: String(payload && payload.applicantName || '').trim(),
        applicantEmail: String(payload && payload.applicantEmail || '').trim().toLowerCase(),
        extensionNumber: String(payload && payload.extensionNumber || '').trim(),
        unitCategory: String(payload && payload.unitCategory || '').trim(),
        primaryUnit: String(payload && payload.primaryUnit || '').trim(),
        secondaryUnit: String(payload && payload.secondaryUnit || '').trim(),
        unitValue,
        unitCode: String(payload && payload.unitCode || (officialMeta && officialMeta.code) || '').trim(),
        contactType: String(payload && payload.contactType || 'primary').trim(),
        note: String(payload && payload.note || '').trim()
      };
    }

    function assertApplicationPayload(payload) {
      if (!payload.unitValue) throw new Error('請先選擇申請單位');
      if (!payload.applicantName) throw new Error('請輸入姓名');
      if (!payload.extensionNumber) throw new Error('請輸入分機');
      if (!payload.applicantEmail) throw new Error('請輸入信箱');
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

    async function postJson(url, payload) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('後端回應異常（' + response.status + '）');
      }
      return response.json();
    }

    async function submitUnitContactApplication(payload) {
      const normalized = normalizePayload(payload);
      assertApplicationPayload(normalized);
      assertNoDuplicateActiveApplication(normalized);

      const config = getConfig();
      if (config.unitContactMode === 'm365-api' && config.unitContactSubmitEndpoint) {
        const result = await postJson(config.unitContactSubmitEndpoint, {
          action: 'unit-contact.apply',
          payload: normalized
        });
        return {
          ...result,
          application: decorateApplication(result && result.application)
        };
      }

      const application = createUnitContactApplication({
        ...normalized,
        status: UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW,
        statusLabel: getStatusMeta(UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW).label,
        statusDetail: getStatusMeta(UNIT_CONTACT_APPLICATION_STATUSES.PENDING_REVIEW).detail,
        backendMode: getMode()
      });

      return {
        ok: true,
        mode: getMode(),
        application: decorateApplication(application)
      };
    }

    async function lookupUnitContactApplicationsByEmail(email) {
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail) return [];

      const config = getConfig();
      if (config.unitContactMode === 'm365-api' && config.unitContactStatusEndpoint) {
        const result = await postJson(config.unitContactStatusEndpoint, {
          action: 'unit-contact.lookup',
          payload: { email: cleanEmail }
        });
        const list = Array.isArray(result && result.applications) ? result.applications : [];
        return list.map(decorateApplication);
      }

      return findUnitContactApplicationsByEmail(cleanEmail).map(decorateApplication);
    }

    function markActivationPending(id) {
      const updated = updateUnitContactApplication(id, {
        status: UNIT_CONTACT_APPLICATION_STATUSES.ACTIVATION_PENDING,
        activationSentAt: new Date().toISOString()
      });
      return decorateApplication(updated);
    }

    return {
      getMode,
      getModeLabel,
      getStatusMeta,
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
