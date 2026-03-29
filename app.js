// =============================================
// ISMS Internal Audit Tracking System - v4
// =============================================
(function () {
  'use strict';
  if (typeof window !== 'undefined') {
    window.__APP_READY__ = false;
  }
  const DATA_KEY = 'cats_data', AUTH_KEY = 'cats_auth', CHECKLIST_KEY = 'cats_checklists', TEMPLATE_KEY = 'cats_checklist_template', TRAINING_KEY = 'cats_training_hours', LOGIN_LOG_KEY = 'cats_login_log', UNIT_REVIEW_KEY = 'cats_unit_review', UNIT_CONTACT_APP_KEY = 'cats_unit_contact_applications';
  const STATUSES = { CREATED: '開立', PENDING: '待矯正', PROPOSED: '已提案', REVIEWING: '審核中', TRACKING: '追蹤中', CLOSED: '結案' };
  const STATUS_CLASSES = { [STATUSES.CREATED]: 'created', [STATUSES.PENDING]: 'pending', [STATUSES.PROPOSED]: 'proposed', [STATUSES.REVIEWING]: 'reviewing', [STATUSES.TRACKING]: 'tracking', [STATUSES.CLOSED]: 'closed' };
  const STATUS_FLOW = [STATUSES.CREATED, STATUSES.PENDING, STATUSES.PROPOSED, STATUSES.REVIEWING, STATUSES.TRACKING, STATUSES.CLOSED];
  const ROLES = { ADMIN: '最高管理員', UNIT_ADMIN: '單位管理員' };
  const ROLE_BADGE = { [ROLES.ADMIN]: 'badge-admin', [ROLES.UNIT_ADMIN]: 'badge-unit-admin' };
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
  const UNIT_CONTACT_APPLICATION_STATUSES = {
    PENDING_REVIEW: 'pending_review',
    RETURNED: 'returned',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ACTIVATION_PENDING: 'activation_pending',
    ACTIVE: 'active'
  };
  const DEF_TYPES = ['主要缺失', '次要缺失', '觀察', '建議'];
  const SOURCES = ['內部稽核', '外部稽核', '教育部稽核', '資安事故', '系統變更', '使用者抱怨', '其他'];
  const CATEGORIES = ['人員', '資訊', '通訊', '軟體', '硬體', '個資', '服務', '虛擬機', '基礎設施', '可攜式設備', '其他'];
  const DEFAULT_USERS = [];



  const SYSTEM_USER_SECURITY_ROLE_OPTIONS = ['????????', '????????'];

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
    '法務處',
    '學校分部總辦事處'
  ]);
  const UNIT_ACADEMIC_PRIMARY_WHITELIST = new Set([
    '共同教育中心',
    '進修推廣學院'
  ]);

  let appDomainBridgeModuleApi = null;
  function getAppDomainBridgeModule() {
    if (appDomainBridgeModuleApi) return appDomainBridgeModuleApi;
    if (typeof window === 'undefined' || typeof window.createAppDomainBridgeModule !== 'function') {
      throw new Error('app-domain-bridge-module.js not loaded');
    }
    appDomainBridgeModuleApi = window.createAppDomainBridgeModule();
    window._appDomainBridgeModule = appDomainBridgeModuleApi;
    return appDomainBridgeModuleApi;
  }
  const appDomainBridge = getAppDomainBridgeModule().createAccess({
    getUnitModule: function () { return getUnitModule(); },
    getWorkflowSupportModule: function () { return getWorkflowSupportModule(); },
    getDataModule: function () { return getDataModule(); },
    getAuthModule: function () { return getAuthModule(); },
    getPolicyModule: function () { return getPolicyModule(); }
  });
  const {
    getOfficialUnits,
    getOfficialUnitCatalog,
    getOfficialUnitMeta,
    getUnitCode,
    getUnitCodeWithDots,
    getUnitOptionLabel,
    getCorrectionYear,
    normalizeRocYear,
    buildScopedRecordPrefix,
    parseScopedRecordId,
    buildScopedRecordId,
    getNextScopedRecordSequence,
    buildCorrectionDocumentNo,
    parseCorrectionAutoId,
    buildAutoCarIdByDocument,
    buildAutoCarId,
    getNextCorrectionSequence,
    getSystemUnits,
    isOfficialUnit,
    loadUnitReviewStore,
    saveUnitReviewStore,
    getUnitGovernanceMode,
    setUnitGovernanceMode,
    getUnitGovernanceModes,
    loadUnitContactApplicationStore,
    saveUnitContactApplicationStore,
    getAllUnitContactApplications,
    getUnitContactApplication,
    createUnitContactApplication,
    updateUnitContactApplication,
    findUnitContactApplicationsByEmail,
    formatUnitScopeSummary,
    approveCustomUnit,
    getCustomUnitRegistry,
    syncSessionUnit,
    mergeCustomUnit,
    splitUnitValue,
    composeUnitValue,
    categorizeTopLevelUnit,
    isTrainingDashboardExcludedUnit,
    getTrainingUnitCategories,
    getParentsByUnitCategory,
    buildUnitSearchEntry,
    getUnitSearchEntries,
    buildUnitCascadeControl,
    initUnitCascade,
    parseUserUnits,
    normalizeUserRole,
    getAuthorizedUnits,
    getReviewUnits,
    getActiveUnit,
    normalizeUserRecord,
    hasGlobalReadScope,
    hasUnitAccess,
    canSwitchAuthorizedUnit,
    getScopedUnit,
    switchCurrentUserUnit,
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
    ensurePrimaryAdminProfile,
    generatePassword,
    resetPasswordByEmail,
    redeemResetPassword,
    changePassword,
    loadLoginLogs,
    saveLoginLogs,
    addLoginLog,
    clearLoginLogs,
    login,
    currentUser,
    isAdmin,
    isUnitAdmin,
    isViewer,
    canCreateCAR,
    canReview,
    canReviewItem,
    canFillChecklist,
    canFillTraining,
    canManageUsers
  } = appDomainBridge;

  function parseSecurityRoles(value) {
    const rawValues = Array.isArray(value)
      ? value
      : String(value || '')
        .replaceAll(String.fromCharCode(13), ',')
        .replaceAll(String.fromCharCode(10), ',')
        .replaceAll('?', ',')
        .split(',');
    return Array.from(new Set(rawValues.map((item) => String(item || '').trim()).filter((item) => SYSTEM_USER_SECURITY_ROLE_OPTIONS.includes(item))));
  }
  function validatePasswordComplexity(password, fieldName) {
    const label = String(fieldName || '').trim() || 'password';
    const value = String(password || '').trim();
    if (!value) throw new Error('??' + label);
    if (value.length < 8) throw new Error('????? 8 ?');
    if (!/[a-z]/.test(value)) throw new Error('???????????????');
    if (!/[A-Z]/.test(value)) throw new Error('???????????????');
    if (!/[0-9]/.test(value)) throw new Error('???????????');
  }
  function validateSystemUserPayload(payload, options) {
    const opts = options || {};
    const item = payload && typeof payload === 'object' ? payload : {};
    if (!String(item.username || '').trim()) throw new Error('????');
    if (!String(item.name || '').trim()) throw new Error('??????');
    if (!String(item.email || '').trim()) throw new Error('??????');
    if (opts.requirePassword && !String(item.password || '').trim()) throw new Error('????');
    if (String(item.password || '').trim()) validatePasswordComplexity(item.password, '??');
    const role = normalizeUserRole(item.role);
    const units = parseUserUnits(item.units || item.authorizedUnits || item.AuthorizedUnitsJson);
    const securityRoles = parseSecurityRoles(item.securityRoles || item.SecurityRolesJson || item.securityRolesJson);
    if (role !== ROLES.ADMIN && !units.length) throw new Error('???????????');
    if (role === ROLES.UNIT_ADMIN && !securityRoles.length) throw new Error('?????????????');
  }
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
  async function logout() { await getAuthModule().logout(); renderApp(); }
  function isOverdue(item) { return item.status !== STATUSES.CLOSED && item.correctiveDueDate && new Date(item.correctiveDueDate) < new Date(); }
  function registerActionHandlers(namespace, handlers) {
    return getAppActionModule().registerActionHandlers(namespace, handlers);
  }
  function installGlobalDelegation() {
    return getAppActionModule().installGlobalDelegation({
      closeModalRoot,
      navigate,
      toast
    });
  }
  function navigate(h, options) {
    return getAppRouterModule().navigate({
      hasUnsavedChangesGuard,
      confirmDiscardUnsavedChanges,
      handleRoute
    }, h, options);
  }
  function getRoute() {
    return getAppRouteModule().getRoute();
  }
  let appCoreModuleAccessModuleApi = null;
  function getAppCoreModuleAccessModule() {
    if (appCoreModuleAccessModuleApi) return appCoreModuleAccessModuleApi;
    if (typeof window === 'undefined' || typeof window.createAppCoreModuleAccessModule !== 'function') {
      throw new Error('app-core-module-access-module.js not loaded');
    }
    appCoreModuleAccessModuleApi = window.createAppCoreModuleAccessModule();
    window._appCoreModuleAccessModule = appCoreModuleAccessModuleApi;
    return appCoreModuleAccessModuleApi;
  }
  let appUiBridgeModuleApi = null;
  function getAppUiBridgeModule() {
    if (appUiBridgeModuleApi) return appUiBridgeModuleApi;
    if (typeof window === 'undefined' || typeof window.createAppUiBridgeModule !== 'function') {
      throw new Error('app-ui-bridge-module.js not loaded');
    }
    appUiBridgeModuleApi = window.createAppUiBridgeModule();
    window._appUiBridgeModule = appUiBridgeModuleApi;
    return appUiBridgeModuleApi;
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
      isUnitAdmin,
      canManageUsers,
      getUsers,
      getAuthorizedUnits,
      getReviewUnits,
      parseUserUnits,
      getUnitSearchEntries,
      splitUnitValue,
      composeUnitValue,
      findUser,
      submitUserUpsert,
      submitUserDelete,
      syncUsersFromM365,
      submitReviewScopeReplace,
      syncReviewScopesFromM365,
      getCustomUnitRegistry,
      loadUnitReviewStore,
      getUnitGovernanceMode,
      setUnitGovernanceMode,
      getUnitGovernanceModes,
      formatUnitScopeSummary,
      approveCustomUnit,
      mergeCustomUnit,
      loadLoginLogs,
      clearLoginLogs,
      fetchAuditTrailEntries,
      fetchAuditTrailHealth,
      listUnitContactApplications: function (filters) { return getM365ApiClient().listUnitContactApplications(filters); },
      reviewUnitContactApplication: function (payload) { return getM365ApiClient().reviewUnitContactApplication(payload); },
      activateUnitContactApplication: function (payload) { return getM365ApiClient().activateUnitContactApplication(payload); },
      requestUnitContactAuthorizationDocument: function (applicationId, options) {
        const id = encodeURIComponent(String(applicationId || '').trim());
        const query = [];
        const email = String(options && options.email || '').trim().toLowerCase();
        const download = String(options && options.download || '').trim() === '1';
        if (email) query.push('email=' + encodeURIComponent(email));
        if (download) query.push('download=1');
        const suffix = query.length ? ('?' + query.join('&')) : '';
        return requestSameOriginBlob('/api/unit-contact/applications/' + id + '/authorization-doc/content' + suffix, { method: 'GET' });
      },
      getSchemaHealth: function () { return getDataModule().getSchemaHealth(); },
      migrateAllStores: function () { return getDataModule().migrateAllStores(); },
      exportManagedStoreSnapshot: function () { return getDataModule().exportManagedStoreSnapshot(); },
      getAttachmentHealth,
      pruneOrphanAttachments,
      exportSupportBundle,
      navigate,
      toast,
      fmtTime,
      esc,
      ic,
      refreshIcons,
      downloadJson,
      buildUnitCascadeControl,
      initUnitCascade,
      registerActionHandlers,
      closeModalRoot,
      getUnitContactApplication
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
        canManageUsers,
        canReview,
        canReviewItem,
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
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      toast,
      fmt,
      fmtTime,
      esc,
      ic,
      mkChk,
      mkRadio,
      refreshIcons,
      bindCopyButtons,
      renderCopyIdCell,
      renderCopyIdButton,
      prepareUploadBatch,
      createTransientUploadEntry,
      revokeTransientUploadEntry,
      persistUploadedEntries,
      renderAttachmentList,
      cleanupRenderedAttachmentUrls,
      buildUnitCascadeControl,
      initUnitCascade,
      syncCorrectiveActionsFromM365,
      syncUsersFromM365,
      submitCreateCase,
      submitRespondCase,
      submitReviewDecision,
      submitTrackingSubmission,
      submitTrackingReviewDecision,
      applyTestIds,
      applySelectorTestIds,
      debugFlow,
      registerActionHandlers,
      openConfirmDialog
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
      getStoreTouchToken,
      canEditChecklist,
      findExistingChecklistForUnitYear,
      getChecklist,
      deleteChecklistsByYear,
      getLatestEditableChecklistDraft,
      canAccessChecklist,
      splitUnitValue,
      getUnitGovernanceMode,
      categorizeTopLevelUnit,
      buildUnitCascadeControl,
      initUnitCascade,
      applyTestIds,
      applySelectorTestIds,
      debugFlow,
      generateChecklistIdForYear,
      addChecklist,
      updateChecklist,
      syncChecklistsFromM365,
      submitChecklistDraft,
      submitChecklistForm,
      prepareUploadBatch,
      createTransientUploadEntry,
      revokeTransientUploadEntry,
      persistUploadedEntries,
      renderAttachmentList,
      cleanupRenderedAttachmentUrls,
      getChecklistSections,
      saveChecklistSections,
      resetChecklistSections,
      navigate,
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      toast,
      fmt,
      fmtTime,
      esc,
      ic,
      refreshIcons,
      bindCopyButtons,
      renderCopyIdCell,
      renderCopyIdButton,
      registerActionHandlers,
      closeModalRoot,
      openConfirmDialog,
      runWithBusyState
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
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
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
      hasUnitAccess,
      isViewer,
      buildUnitCascadeControl,
      initUnitCascade,
      trainingSelectOptionsHtml,
      getTrainingForm,
      getAllTrainingForms,
      getAllTrainingRosters,
      getStoreTouchToken,
      upsertTrainingForm,
      updateTrainingForm,
      addTrainingRosterPerson,
      updateTrainingRosterPerson,
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
      isOfficialUnit,
      categorizeTopLevelUnit,
      isTrainingDashboardExcludedUnit,
      getTrainingUnitCategories,
      sortTrainingRosterEntries,
      syncTrainingFormsFromM365,
      syncTrainingRostersFromM365,
      submitTrainingDraft,
      submitTrainingStepOne,
      submitTrainingMarkPrinted,
      submitTrainingFinalize,
      submitTrainingReturn,
      submitTrainingUndo,
      submitTrainingRosterUpsert,
      submitTrainingRosterBatchUpsert,
      submitTrainingRosterDelete,
      submitTrainingRosterBatchDelete,
      getVisibleTrainingForms,
      isTrainingVisible,
      canEditTrainingForm,
      canUndoTrainingForm,
      getTrainingUndoRemainingMinutes,
      canDeleteTrainingEditableRow,
      isTrainingRecordReadyForSubmit,
      isTrainingRecordComplete,
      getStoredTrainingProfessionalValue,
      prepareUploadBatch,
      createTransientUploadEntry,
      revokeTransientUploadEntry,
      persistUploadedEntries,
      renderAttachmentList,
      cleanupRenderedAttachmentUrls,
      exportTrainingSummaryCsv,
      exportTrainingDetailCsv,
      printTrainingSheet,
      parseTrainingRosterWorkbook,
      parseTrainingRosterImport,
      loadTrainingStore,
      saveTrainingStore,
      registerActionHandlers,
      openConfirmDialog,
      openPromptDialog,
      runWithBusyState
    });
    window._trainingModule = trainingModuleApi;
    return trainingModuleApi;
  }
  let appRuntimeServiceModuleApi = null;
  const appRuntimeServiceState = getAppRuntimeServiceModule().createState();
  function getAppRuntimeServiceModule() {
    if (appRuntimeServiceModuleApi) return appRuntimeServiceModuleApi;
    if (typeof window === 'undefined' || typeof window.createAppRuntimeServiceModule !== 'function') {
      throw new Error('app-runtime-service-module.js not loaded');
    }
    appRuntimeServiceModuleApi = window.createAppRuntimeServiceModule();
    window._appRuntimeServiceModule = appRuntimeServiceModuleApi;
    return appRuntimeServiceModuleApi;
  }
  function getAppRuntimeAccessModule() {
    return getAppRuntimeServiceModule().getAppRuntimeAccessModule(appRuntimeServiceState);
  }
  const appRuntimeAccess = getAppRuntimeAccessModule().createAccess({
    getAppRuntimeServiceModule,
    appRuntimeServiceState
  });
  const {
    getAppCoreServiceModule,
    getAppBootstrapAccessModule,
    getAppEntryRuntimeModule,
    getAppShellRuntimeModule,
    getAppAuthSessionRuntimeModule,
    getAppRouterRuntimeModule,
    getAppBootstrapWiringModule
  } = appRuntimeAccess;
  const appBootstrapWiring = getAppBootstrapWiringModule().createWiring({
    getAppRuntimeServiceModule,
    appRuntimeServiceState,
    getRouteWhitelist: function () { return ROUTE_WHITELIST; },
    defaultTitle: 'ISMS 管考與追蹤平台',
    getClientArgs: function () {
      return {
        UNIT_CONTACT_APPLICATION_STATUSES,
        createUnitContactApplication,
        updateUnitContactApplication,
        getUnitContactApplication,
        getAllUnitContactApplications,
        findUnitContactApplicationsByEmail,
        getOfficialUnitMeta,
        getSessionAuthHeaders
      };
    }
  });
  const {
    getServiceRegistryModule,
    getAppServiceAccessModule,
    getAppBootstrapModule,
    getAppBootstrapStateModule,
    getAppEntryModule,
    getAppRouteModule,
    getAppPageOrchestrationModule,
    getAppVisibilityModule,
    getAppActionModule,
    getAppShellOrchestrationModule,
    getAppAuthSessionModule,
    getAppRouterModule,
    getBootstrapCoordinator,
    recordBootstrapStep,
    registerCoreService,
    resolveFactoryService,
    getM365ApiClient
  } = appBootstrapWiring;
  const appCoreModuleAccess = getAppCoreModuleAccessModule().createAccess({
    resolveFactoryService,
    UNIT_CUSTOM_VALUE,
    UNIT_CUSTOM_LABEL,
    UNIT_ADMIN_PRIMARY_WHITELIST,
    UNIT_ACADEMIC_PRIMARY_WHITELIST,
    ROLES,
    STATUSES,
    TRAINING_STATUSES,
    TRAINING_UNDO_WINDOW_MINUTES,
    DEFAULT_USERS,
    TRAINING_GENERAL_LABEL,
    TRAINING_INFO_STAFF_LABEL,
    TRAINING_PROFESSIONAL_LABEL,
    DATA_KEY,
    AUTH_KEY,
    CHECKLIST_KEY,
    TEMPLATE_KEY,
    TRAINING_KEY,
    LOGIN_LOG_KEY,
    UNIT_REVIEW_KEY,
    UNIT_CONTACT_APP_KEY,
    getDefaultChecklistSections: function () { return DEFAULT_CHECKLIST_SECTIONS; },
    CHECKLIST_STATUS_DRAFT,
    CHECKLIST_STATUS_SUBMITTED,
    TRAINING_EMPLOYEE_STATUS,
    getAttachmentsMode: function () { return getAttachmentsMode(); },
    fetchRemoteAttachmentDetail: function (entry) { return fetchRemoteAttachmentDetail(entry); },
    fetchRemoteAttachmentBlob: function (entry) { return fetchRemoteAttachmentBlob(entry); },
    getReviewScopeRepositoryState,
    getReviewScopesMode: function () { return getReviewScopesMode(); },
    getUnitCode,
    getOfficialUnitMeta,
    loadUnitReviewStore,
    composeUnitValue,
    loadData,
    saveData,
    getTrainingRosterByUnit: function () { return getTrainingRosterByUnit.apply(null, arguments); },
    normalizeTrainingRecordRow: function () { return normalizeTrainingRecordRow.apply(null, arguments); },
    computeTrainingSummary: function () { return computeTrainingSummary.apply(null, arguments); },
    getTrainingStatsUnit: function () { return getTrainingStatsUnit.apply(null, arguments); },
    getTrainingJobUnit: function () { return getTrainingJobUnit.apply(null, arguments); },
    getTrainingProfessionalDisplay: function () { return getTrainingProfessionalDisplay.apply(null, arguments); },
    getTrainingRecordHint: function () { return getTrainingRecordHint.apply(null, arguments); },
    fmt: function (value) { return getUiModule().fmt(value); },
    fmtTime: function (value) { return getUiModule().fmtTime(value); },
    toast: function (message, type) { return getUiModule().toast(message, type); },
    esc: function (value) { return getUiModule().esc(value); },
    buildCorrectionDocumentNo,
    parseCorrectionAutoId,
    getNextCorrectionSequence,
    buildAutoCarIdByDocument,
    buildChecklistDocumentNo: function () { return buildChecklistDocumentNo.apply(null, arguments); },
    parseChecklistId: function () { return parseChecklistId.apply(null, arguments); },
    buildChecklistIdByDocument: function () { return buildChecklistIdByDocument.apply(null, arguments); },
    getNextChecklistSequence: function () { return getNextChecklistSequence.apply(null, arguments); },
    hasTrainingValue: function () { return hasTrainingValue.apply(null, arguments); },
    isTrainingBooleanValue: function () { return isTrainingBooleanValue.apply(null, arguments); },
    normalizeTrainingProfessionalValue: function () { return normalizeTrainingProfessionalValue.apply(null, arguments); },
    buildTrainingFormDocumentNo: function () { return buildTrainingFormDocumentNo.apply(null, arguments); },
    parseTrainingFormId: function () { return parseTrainingFormId.apply(null, arguments); },
    buildTrainingFormIdByDocument: function () { return buildTrainingFormIdByDocument.apply(null, arguments); },
    getNextTrainingFormSequence: function () { return getNextTrainingFormSequence.apply(null, arguments); },
    submitBackendLogin,
    submitAuthLogout,
    submitAuthResetPasswordByEmail,
    submitAuthRedeemResetPassword,
    submitAuthChangePassword,
    getDataModule: function () { return getDataModule(); },
    getAuthModule: function () { return getAuthModule(); },
    getPolicyModule: function () { return getPolicyModule(); },
    getUnitModule: function () { return getUnitModule(); },
    getUiModule: function () { return getUiModule(); }
  });
  const {
    getUnitModule,
    getUiModule,
    getAttachmentModule,
    getPolicyModule,
    getWorkflowSupportModule,
    getDataModule,
    getAuthModule
  } = appCoreModuleAccess;
  const appUiBridge = getAppUiBridgeModule().createAccess({
    getUiModule: function () { return getUiModule(); }
  });
  const {
    fmt,
    fmtTime,
    ic,
    mkChk,
    mkRadio,
    ntuLogo,
    esc,
    toast,
    renderCopyIdButton,
    renderCopyIdCell,
    copyTextToClipboard,
    bindCopyButtons,
    applyTestIds,
    applySelectorTestIds,
    debugFlow,
    setUnsavedChangesGuard,
    clearUnsavedChangesGuard,
    hasUnsavedChangesGuard,
    confirmDiscardUnsavedChanges,
    downloadJson,
    closeModalRoot,
    openConfirmDialog,
    openPromptDialog,
    showBusyState,
    hideBusyState,
    runWithBusyState
  } = appUiBridge;
  const SYSTEM_USERS_CONTRACT_VERSION = '2026-03-12';
  const REVIEW_SCOPE_CONTRACT_VERSION = '2026-03-13';
  const AUDIT_TRAIL_CONTRACT_VERSION = '2026-03-14';
  const SYSTEM_USER_ACTIONS = {
    UPSERT: 'system-user.upsert',
    DELETE: 'system-user.delete',
    RESET_PASSWORD: 'system-user.reset-password'
  };
  const AUTH_CONTRACT_VERSION = '2026-03-13';
    const AUTH_ACTIONS = {
      LOGIN: 'auth.login',
      VERIFY: 'auth.verify',
      LOGOUT: 'auth.logout',
      REQUEST_RESET: 'auth.request-reset',
      REDEEM_RESET: 'auth.redeem-reset',
      CHANGE_PASSWORD: 'auth.change-password'
    };
    const REVIEW_SCOPE_ACTIONS = {
      REPLACE: 'review-scope.replace'
    };
  const ATTACHMENT_CONTRACT_VERSION = '2026-03-13';
  const ATTACHMENT_ACTIONS = {
    UPLOAD: 'attachment.upload',
    DELETE: 'attachment.delete'
  };
  const systemUserRepositoryState = {
    mode: 'local-emulator',
    ready: false,
    source: 'local',
    lastSyncAt: '',
    message: '',
    error: ''
  };
  const SYSTEM_USERS_SYNC_FRESHNESS_MS = 30000;
  let systemUsersSyncCachePromise = null;
  function setSystemUserRepositoryState(patch) {
    Object.assign(systemUserRepositoryState, patch || {});
    return { ...systemUserRepositoryState };
  }
  function isSystemUsersSyncFresh() {
    if (!systemUserRepositoryState.ready) return false;
    if (systemUserRepositoryState.mode !== 'm365-api') return false;
    const parsedAt = Date.parse(String(systemUserRepositoryState.lastSyncAt || '').trim());
    if (!Number.isFinite(parsedAt)) return false;
    return (Date.now() - parsedAt) < SYSTEM_USERS_SYNC_FRESHNESS_MS;
  }
  function buildSystemUserEnvelope(action, payload) {
    return {
      action: String(action || '').trim(),
      payload: payload && typeof payload === 'object' ? payload : {},
      clientContext: {
        contractVersion: SYSTEM_USERS_CONTRACT_VERSION,
        source: 'isms-form-redesign-frontend',
        frontendOrigin: typeof window !== 'undefined' && window.location ? window.location.origin : '',
        frontendHash: typeof window !== 'undefined' && window.location ? String(window.location.hash || '') : '',
        sentAt: new Date().toISOString()
      }
    };
  }
  function parseUserUnitsFromRemote(value) {
    if (Array.isArray(value)) return value.map(function (entry) { return String(entry || '').trim(); }).filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(function (entry) { return String(entry || '').trim(); }).filter(Boolean);
      } catch (_) {}
    }
    return parseUserUnits(value);
  }
  function normalizeRemoteSystemUserRecord(record) {
    const source = record && record.fields ? record.fields : (record && (record.item || record.data || record.result || record));
    if (!source || typeof source !== 'object') return null;
    const username = String(source.username || source.userName || source.UserName || source.Title || '').trim();
    if (!username) return null;
    const units = parseUserUnitsFromRemote(source.units || source.authorizedUnits || source.AuthorizedUnitsJson);
    const role = normalizeUserRole(source.role || source.Role);
    const unit = String(source.unit || source.primaryUnit || source.PrimaryUnit || units[0] || '').trim();
    if (unit && units.indexOf(unit) < 0) units.unshift(unit);
      return normalizeUserRecord({
        username: username,
        password: String(source.password || source.Password || '').trim(),
        name: String(source.name || source.displayName || source.DisplayName || '').trim(),
        email: String(source.email || source.Email || '').trim().toLowerCase(),
        role: role,
        securityRoles: source.securityRoles || source.SecurityRolesJson || source.SecurityRoles,
        unit: unit,
        units: units,
        activeUnit: role === ROLES.ADMIN ? '' : String(source.activeUnit || source.ActiveUnit || unit).trim(),
      createdAt: String(source.createdAt || source.CreatedAt || '').trim(),
      updatedAt: String(source.updatedAt || source.UpdatedAt || '').trim(),
      passwordChangedAt: String(source.passwordChangedAt || source.PasswordChangedAt || '').trim(),
      resetTokenExpiresAt: String(source.resetTokenExpiresAt || source.ResetTokenExpiresAt || '').trim(),
      mustChangePassword: source.mustChangePassword === true || String(source.MustChangePassword || '').trim().toLowerCase() === 'true',
      sessionVersion: Number.isFinite(Number(source.sessionVersion || source.SessionVersion)) ? Number(source.sessionVersion || source.SessionVersion) : 1,
      sessionToken: String(source.sessionToken || source.SessionToken || '').trim(),
      sessionExpiresAt: String(source.sessionExpiresAt || source.SessionExpiresAt || '').trim(),
      backendMode: String(source.backendMode || source.BackendMode || 'a3-campus-backend').trim(),
      recordSource: String(source.recordSource || source.RecordSource || 'remote').trim()
    });
  }
  function normalizeRemoteSystemUsers(body) {
    const candidates = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body && body.items) ? body.items : [])
      .concat(Array.isArray(body && body.value) ? body.value : [])
      .concat(Array.isArray(body && body.data) ? body.data : []);
    const items = candidates.map(normalizeRemoteSystemUserRecord).filter(Boolean);
    if (items.length) return items;
    const single = normalizeRemoteSystemUserRecord(body && (body.item || body.data || body.result || body));
    return single ? [single] : [];
  }
  function getSessionAuthHeaders() {
    const user = currentUser();
    if (!user) return {};
    const headers = {};
    const sessionToken = String(user.sessionToken || '').trim();
    const activeUnit = String(user.activeUnit || '').trim();
    if (sessionToken) headers.Authorization = 'Bearer ' + sessionToken;
    if (activeUnit) headers['X-ISMS-Active-Unit'] = encodeURIComponent(activeUnit);
    return headers;
  }
  const appBridgeRuntime = getAppRuntimeServiceModule().getAppBridgeRuntimeModule(appRuntimeServiceState).createAccess({
    updateUser,
    loadData,
    saveData,
    loadTrainingStore: function () { return loadTrainingStore.apply(null, arguments); },
    saveTrainingStore: function () { return saveTrainingStore.apply(null, arguments); },
    migrateStoredAttachments,
    getAttachmentModule,
    getWorkflowSupportModule,
    getDataModule,
    getSessionAuthHeaders,
    AUTH_KEY,
    AUTH_ACTIONS,
    normalizeRemoteSystemUsers,
    normalizeUserRecord,
    findUser,
    upsertSystemUserInStore,
    submitUserResetPassword,
    getAppAuthSessionModule,
    currentUser,
    contracts: {
      systemUsers: SYSTEM_USERS_CONTRACT_VERSION,
      auth: AUTH_CONTRACT_VERSION,
      reviewScopes: REVIEW_SCOPE_CONTRACT_VERSION,
      auditTrail: AUDIT_TRAIL_CONTRACT_VERSION,
      attachments: ATTACHMENT_CONTRACT_VERSION
    },
    actions: {
      upload: ATTACHMENT_ACTIONS.UPLOAD
    }
  });
  const {
    getAppRemoteRuntimeModule,
    getAppStartRuntimeModule,
    getAppAttachmentMigrationModule,
    getAppSupportBridgeModule,
    getAppRemoteBridgeModule,
    getAppAuthRemoteModule,
    getAppAuthRemote,
    getRuntimeM365Config,
    isStrictRemoteDataMode,
    buildStrictRemoteError,
    getSystemUsersMode,
    getSystemUsersEndpoint,
    getSystemUsersHealthEndpoint,
    getSystemUsersSharedHeaders,
    getReviewScopesMode,
    getReviewScopesEndpoint,
    getReviewScopesHealthEndpoint,
    getReviewScopesSharedHeaders,
    getAuditTrailMode,
    getAuditTrailEndpoint,
    getAuditTrailHealthEndpoint,
    getAuditTrailSharedHeaders,
    getAuthMode,
    getAuthEndpoint,
    getAuthHealthEndpoint,
    getAuthSharedHeaders,
    getAttachmentsMode,
    getAttachmentsEndpoint,
    getAttachmentsHealthEndpoint,
    getAttachmentsSharedHeaders,
    normalizeRequestUrl,
    hashLocalPasswordValue,
    verifyLocalPasswordValue,
    migrateAttachmentStores,
    getFileExtension,
    buildUploadSignature,
    validateUploadFile,
    prepareUploadBatch,
    createTransientUploadEntry,
    revokeTransientUploadEntry,
    renderAttachmentList,
    cleanupRenderedAttachmentUrls,
    getAttachmentHealth,
    pruneOrphanAttachments,
    exportSupportBundle,
    csvCell,
    downloadWorkbook,
    exportTrainingSummaryCsv,
    exportTrainingDetailCsv,
    getRocDateParts,
    buildTrainingPrintHtml,
    printTrainingSheet,
    sortTrainingRosterEntries,
    normalizeTrainingImportHeader,
    buildTrainingRosterHeaderMap,
    resolveTrainingImportTargetUnit,
    parseTrainingRosterCells,
    parseTrainingRosterImport,
    parseTrainingRosterWorkbook,
    mergeTrainingRows,
    seedData,
    requestSystemUserJson,
    requestAuthJson,
    requestReviewScopeJson,
    requestAuditTrailJson,
    requestAttachmentJson,
    requestAttachmentBlob,
    requestSameOriginBlob,
    readBlobAsDataUrl,
    resolveAttachmentBlob,
    normalizeLegacyAttachmentName,
    normalizeRemoteAttachmentDescriptor,
    fetchRemoteAttachmentDetail,
    fetchRemoteAttachmentBlob,
    submitAttachmentUpload
  } = appBridgeRuntime;
  function mergeRemoteUsersIntoStore(items, options) {
    const strict = !!(options && options.strict);
    const data = loadData();
    const existingReviewUnits = new Map((data.users || []).map(function (user) {
      return [String(user && user.username || '').trim().toLowerCase(), getReviewUnits(user)];
    }));
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const username = String(item && item.username || '').trim().toLowerCase();
      if (!username) return;
      remoteMap.set(username, normalizeUserRecord({
        ...item,
        reviewUnits: getReviewUnits(item).length ? getReviewUnits(item) : (existingReviewUnits.get(username) || [])
      }));
    });
    const merged = Array.from(remoteMap.values());
    if (!strict) {
      (data.users || []).forEach(function (user) {
        const username = String(user && user.username || '').trim().toLowerCase();
        if (!username || remoteMap.has(username)) return;
        merged.push(normalizeUserRecord(user));
      });
    }
    data.users = merged;
    saveData(data);
    return data.users.slice();
  }
  function normalizeRemoteReviewScopeRecord(record) {
    const source = record && record.fields ? record.fields : (record && (record.item || record.data || record.result || record));
    if (!source || typeof source !== 'object') return null;
    const username = String(source.username || source.userName || source.UserName || '').trim();
    const unit = String(source.unit || source.unitValue || source.UnitValue || '').trim();
    if (!username || !unit) return null;
    return {
      username: username,
      unit: unit,
      createdAt: String(source.createdAt || source.CreatedAt || '').trim(),
      updatedAt: String(source.updatedAt || source.UpdatedAt || '').trim(),
      backendMode: String(source.backendMode || source.BackendMode || 'a3-campus-backend').trim(),
      recordSource: String(source.recordSource || source.RecordSource || 'remote').trim()
    };
  }
  function normalizeRemoteReviewScopeRecords(body) {
    const candidates = []
      .concat(Array.isArray(body) ? body : [])
      .concat(Array.isArray(body && body.items) ? body.items : [])
      .concat(Array.isArray(body && body.value) ? body.value : [])
      .concat(Array.isArray(body && body.data) ? body.data : []);
    return candidates.map(normalizeRemoteReviewScopeRecord).filter(Boolean);
  }
  function mergeReviewScopesIntoUsers(scopeItems) {
    const data = loadData();
    const scopeMap = new Map();
    (Array.isArray(scopeItems) ? scopeItems : []).forEach(function (entry) {
      const username = String(entry && entry.username || '').trim().toLowerCase();
      const unit = String(entry && entry.unit || '').trim();
      if (!username || !unit) return;
      if (!scopeMap.has(username)) scopeMap.set(username, []);
      if (scopeMap.get(username).indexOf(unit) < 0) scopeMap.get(username).push(unit);
    });
    data.users = (data.users || []).map(function (user) {
      const username = String(user && user.username || '').trim().toLowerCase();
      return normalizeUserRecord({
        ...user,
        reviewUnits: scopeMap.get(username) || []
      });
    });
    saveData(data);
    return data.users.slice();
  }
  function upsertSystemUserInStore(item) {
    if (!item || !item.username) return null;
    const data = loadData();
    const existing = (data.users || []).find(function (entry) { return entry.username === item.username; });
    const normalized = normalizeUserRecord({
      ...(existing || {}),
      ...item,
      reviewUnits: getReviewUnits(item).length ? getReviewUnits(item) : getReviewUnits(existing)
    });
    const index = (data.users || []).findIndex(function (entry) { return entry.username === normalized.username; });
    if (index >= 0) data.users[index] = normalized;
    else data.users.push(normalized);
    saveData(data);
    return findUser(normalized.username) || normalized;
  }
  function deleteSystemUserFromStore(username) {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return;
    deleteUser(cleanUsername);
  }
  function buildSystemUserFallbackWarning(error) {
    const detail = String(error && error.message || error || '').trim();
    return detail ? ('正式帳號後端未就緒，已改用本機暫存：' + detail) : '正式帳號後端未就緒，已改用本機暫存。';
  }
  const reviewScopeRepositoryState = {
    mode: 'local-emulator',
    ready: false,
    source: 'local',
    lastSyncAt: '',
    message: '',
    error: ''
  };
  const REVIEW_SCOPE_SYNC_FRESHNESS_MS = 30000;
  let reviewScopeSyncCachePromise = null;
  function setReviewScopeRepositoryState(patch) {
    Object.assign(reviewScopeRepositoryState, patch || {});
    return { ...reviewScopeRepositoryState };
  }
  function getReviewScopeRepositoryState() {
    return { ...reviewScopeRepositoryState };
  }
  function isReviewScopesSyncFresh() {
    if (!reviewScopeRepositoryState.ready) return false;
    if (reviewScopeRepositoryState.mode !== 'm365-api') return false;
    const parsedAt = Date.parse(String(reviewScopeRepositoryState.lastSyncAt || '').trim());
    if (!Number.isFinite(parsedAt)) return false;
    return (Date.now() - parsedAt) < REVIEW_SCOPE_SYNC_FRESHNESS_MS;
  }
  async function syncUsersFromM365(options) {
    const opts = options || {};
    const user = currentUser();
    const mode = getSystemUsersMode();
    const strict = isStrictRemoteDataMode();
    setSystemUserRepositoryState({ mode: mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (!opts.force && isSystemUsersSyncFresh()) {
      return setSystemUserRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: systemUserRepositoryState.lastSyncAt,
        message: 'system users loaded from fresh cache',
        error: ''
      });
    }
    if (mode !== 'm365-api') {
      return setSystemUserRepositoryState({ ready: false, message: '目前使用本機帳號模式', error: '' });
    }
    if (!user) {
      return setSystemUserRepositoryState({ ready: false, source: 'auth-pending', message: '登入後才會同步帳號主檔', error: '' });
    }
    if (!canManageUsers(user)) {
      return setSystemUserRepositoryState({ ready: false, source: 'auth-scoped', message: '目前角色不需同步帳號主檔', error: '' });
    }
    try {
      const healthEndpoint = getSystemUsersHealthEndpoint();
      if (healthEndpoint) {
        const health = await requestSystemUserJson(healthEndpoint, { method: 'GET' });
        if (health && health.ready === false) {
          return setSystemUserRepositoryState({
            ready: false,
            source: strict ? 'remote-error' : 'local-fallback',
            message: strict
              ? String(health.message || '正式帳號後端尚未就緒，正式模式已停用本機暫存')
              : String(health.message || '正式帳號後端尚未就緒，系統維持本機資料模式'),
            error: String(health.message || '')
          });
        }
      }
      const endpoint = getSystemUsersEndpoint();
      if (!endpoint) throw new Error('未設定 systemUsersEndpoint');
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const filters = opts.query && typeof opts.query === 'object' ? opts.query : {};
      Object.keys(filters).forEach(function (key) {
        const cleanValue = String(filters[key] || '').trim();
        if (cleanValue) url.searchParams.set(key, cleanValue);
      });
      const body = await requestSystemUserJson(url.toString(), { method: 'GET' });
      mergeRemoteUsersIntoStore(normalizeRemoteSystemUsers(body), { strict: strict });
      return setSystemUserRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: new Date().toISOString(),
        message: '已同步正式帳號資料',
        error: ''
      });
    } catch (error) {
      return setSystemUserRepositoryState({
        ready: false,
        source: strict ? 'remote-error' : 'local-fallback',
        message: strict ? '正式帳號後端連線失敗，正式模式已停用本機暫存' : '正式帳號後端尚未就緒，系統維持本機資料模式',
        error: String(error && error.message || error || '')
      });
    }
  }
  async function syncReviewScopesFromM365(options) {
    const opts = options || {};
    const user = currentUser();
    const mode = getReviewScopesMode();
    setReviewScopeRepositoryState({ mode: mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (!opts.force && isReviewScopesSyncFresh()) {
      return setReviewScopeRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: reviewScopeRepositoryState.lastSyncAt,
        message: 'review scopes loaded from fresh cache',
        error: ''
      });
    }
    if (mode !== 'm365-api') {
      return setReviewScopeRepositoryState({ ready: false, message: '目前未啟用審核權限矩陣後端', error: '' });
    }
    if (!user) {
      return setReviewScopeRepositoryState({ ready: false, source: 'auth-pending', message: '登入後才會同步審核權限矩陣', error: '' });
    }
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.UNIT_ADMIN) {
      return setReviewScopeRepositoryState({ ready: false, source: 'auth-scoped', message: '目前角色不需要審核權限矩陣', error: '' });
    }
    try {
      const healthEndpoint = getReviewScopesHealthEndpoint();
      if (healthEndpoint) {
        const health = await requestSystemUserJson(healthEndpoint, {
          method: 'GET',
          headers: {
            'X-ISMS-Contract-Version': REVIEW_SCOPE_CONTRACT_VERSION,
            ...getReviewScopesSharedHeaders()
          }
        });
        if (health && health.ready === false) {
          return setReviewScopeRepositoryState({
            ready: false,
            source: 'local-fallback',
            message: String(health.message || '審核權限矩陣後端尚未就緒，系統維持既有審核邏輯'),
            error: String(health.message || '')
          });
        }
      }
      const endpoint = getReviewScopesEndpoint();
      if (!endpoint) throw new Error('未設定 reviewScopesEndpoint');
      const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
      const filters = opts.query && typeof opts.query === 'object' ? opts.query : {};
      Object.keys(filters).forEach(function (key) {
        const cleanValue = String(filters[key] || '').trim();
        if (cleanValue) url.searchParams.set(key, cleanValue);
      });
      const body = await requestReviewScopeJson(url.toString(), { method: 'GET' });
      mergeReviewScopesIntoUsers(normalizeRemoteReviewScopeRecords(body));
      return setReviewScopeRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: new Date().toISOString(),
        message: '已同步審核權限矩陣',
        error: ''
      });
    } catch (error) {
      return setReviewScopeRepositoryState({
        ready: false,
        source: 'local-fallback',
        message: '審核權限矩陣後端未就緒，系統維持既有審核邏輯',
        error: String(error && error.message || error || '')
      });
    }
  }
  async function fetchAuditTrailHealth() {
    if (getAuditTrailMode() !== 'm365-api') {
      return { ok: false, ready: false, message: '目前未啟用操作稽核軌跡後端' };
    }
    const healthEndpoint = getAuditTrailHealthEndpoint();
    if (!healthEndpoint) throw new Error('未設定 auditTrailHealthEndpoint');
    return requestSystemUserJson(healthEndpoint, {
      method: 'GET',
      headers: {
        'X-ISMS-Contract-Version': AUDIT_TRAIL_CONTRACT_VERSION,
        ...getAuditTrailSharedHeaders()
      }
    });
  }
  async function fetchAuditTrailEntries(filters) {
    if (getAuditTrailMode() !== 'm365-api') {
      return { ok: false, items: [], summary: { total: 0, actorCount: 0, latestOccurredAt: '', eventTypes: [] }, message: '目前未啟用操作稽核軌跡後端' };
    }
    const endpoint = getAuditTrailEndpoint();
    if (!endpoint) throw new Error('未設定 auditTrailEndpoint');
    const url = new URL(endpoint, typeof window !== 'undefined' ? window.location.href : undefined);
    const query = filters && typeof filters === 'object' ? filters : {};
    Object.keys(query).forEach(function (key) {
      const cleanValue = String(query[key] || '').trim();
      if (cleanValue) url.searchParams.set(key, cleanValue);
    });
    return requestAuditTrailJson(url.toString(), { method: 'GET' });
  }
  async function submitReviewScopeReplace(payload) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const username = String(input.username || '').trim();
    const units = parseUserUnits((input.units || []).concat(String(input.unitsText || '').trim()));
    if (!username) throw new Error('缺少帳號');
    if (getReviewScopesMode() !== 'm365-api' || getReviewScopeRepositoryState().ready !== true) {
      const existing = findUser(username);
      if (!existing) return { ok: false, item: null, source: 'local' };
      updateUser(username, { reviewUnits: units });
      return { ok: true, item: findUser(username), source: 'local' };
    }
    const body = await requestReviewScopeJson('/replace', {
      method: 'POST',
      body: {
        action: REVIEW_SCOPE_ACTIONS.REPLACE,
        payload: {
          username: username,
          units: units,
          actorName: String(input.actorName || '').trim(),
          actorEmail: String(input.actorEmail || '').trim()
        }
      }
    });
    mergeReviewScopesIntoUsers(normalizeRemoteReviewScopeRecords(body));
    setReviewScopeRepositoryState({
      mode: 'm365-api',
      source: 'remote',
      ready: true,
      lastSyncAt: new Date().toISOString(),
      message: '審核權限矩陣已寫入正式後端',
      error: ''
    });
    return { ok: true, item: findUser(username), source: 'remote' };
  }
  async function submitUserUpsert(payload) {
    const incoming = payload && typeof payload === 'object' ? payload : {};
    const username = String(incoming.username || '').trim();
    const existing = username ? findUser(username) : null;
    const requestPayload = normalizeUserRecord({
      ...(existing || {}),
      ...incoming,
      username: username,
      password: String(incoming.password || (existing && existing.password) || '').trim()
    });
    if (!requestPayload.username) throw new Error('缺少帳號');
    if (!requestPayload.password && !existing) throw new Error('缺少密碼');
    validateSystemUserPayload(requestPayload, { requirePassword: !existing });
    if (getSystemUsersMode() !== 'm365-api') {
      const localPayload = {
        ...requestPayload,
        password: '',
        passwordHash: requestPayload.password
          ? await hashLocalPasswordValue(requestPayload.password)
          : String(existing && existing.passwordHash || '').trim()
      };
      if (existing) {
        updateUser(requestPayload.username, {
          ...localPayload
        });
      }
      else addUser(localPayload);
      return { ok: true, item: findUser(requestPayload.username) || localPayload, source: 'local' };
    }
    try {
      const body = await requestSystemUserJson(getSystemUsersEndpoint() + '/upsert', {
        method: 'POST',
        body: buildSystemUserEnvelope(SYSTEM_USER_ACTIONS.UPSERT, requestPayload)
      });
      const stored = upsertSystemUserInStore(normalizeRemoteSystemUsers(body)[0] || requestPayload);
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '帳號資料已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式帳號寫入失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('帳號資料寫入', error));
      }
      const localFallbackPayload = {
        ...requestPayload,
        password: '',
        passwordHash: requestPayload.password
          ? await hashLocalPasswordValue(requestPayload.password)
          : String(existing && existing.passwordHash || '').trim()
      };
      if (existing) updateUser(requestPayload.username, localFallbackPayload);
      else addUser(localFallbackPayload);
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式帳號後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: findUser(requestPayload.username) || localFallbackPayload, source: 'local-fallback', warning: buildSystemUserFallbackWarning(error) };
    }
  }
  async function submitUserDelete(username, payload) {
    const cleanUsername = String(username || (payload && payload.username) || '').trim();
    if (!cleanUsername) throw new Error('缺少帳號');
    if (getSystemUsersMode() !== 'm365-api') {
      deleteSystemUserFromStore(cleanUsername);
      return { ok: true, deletedId: cleanUsername, source: 'local' };
    }
    try {
      await requestSystemUserJson(getSystemUsersEndpoint() + '/' + encodeURIComponent(cleanUsername) + '/delete', {
        method: 'POST',
        body: buildSystemUserEnvelope(SYSTEM_USER_ACTIONS.DELETE, payload && typeof payload === 'object' ? payload : {})
      });
      deleteSystemUserFromStore(cleanUsername);
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '帳號刪除已寫入正式後端', error: '' });
      return { ok: true, deletedId: cleanUsername, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式帳號刪除失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('帳號刪除', error));
      }
      deleteSystemUserFromStore(cleanUsername);
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式帳號後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, deletedId: cleanUsername, source: 'local-fallback', warning: buildSystemUserFallbackWarning(error) };
    }
  }
  async function submitUserResetPassword(payload) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const matchedUser = input.username ? findUser(input.username) : findUserByEmail(input.email);
    const username = String(input.username || (matchedUser && matchedUser.username) || '').trim();
    if (!username) return null;
    if (getSystemUsersMode() !== 'm365-api') {
      const fallbackPassword = String(input.password || '').trim() || generatePassword();
      validateSystemUserPayload({
        username: username,
        name: String((matchedUser && matchedUser.name) || '').trim() || username,
        email: String((matchedUser && matchedUser.email) || input.email || '').trim(),
        role: String((matchedUser && matchedUser.role) || USER_ROLES.UNIT_ADMIN).trim(),
        units: parseUserUnits((matchedUser && matchedUser.units) || (matchedUser && matchedUser.unit) || []),
        password: fallbackPassword
      }, { requirePassword: true });
      updateUser(username, { password: '', passwordHash: await hashLocalPasswordValue(fallbackPassword), mustChangePassword: true });
      return { user: normalizeUserRecord(findUser(username) || matchedUser), password: fallbackPassword, source: 'local' };
    }
    try {
      const body = await requestSystemUserJson(getSystemUsersEndpoint() + '/' + encodeURIComponent(username) + '/reset-password', {
        method: 'POST',
        body: buildSystemUserEnvelope(SYSTEM_USER_ACTIONS.RESET_PASSWORD, input)
      });
      const item = normalizeRemoteSystemUsers(body)[0] || { ...(matchedUser || {}), username: username };
      const stored = upsertSystemUserInStore(item);
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '密碼重設代碼已寫入正式後端', error: '' });
      return {
        user: stored,
        resetTokenExpiresAt: String(body && body.resetTokenExpiresAt || '').trim(),
        source: 'remote'
      };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '重設密碼失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('重設密碼', error));
      }
      const fallbackPassword = String(input.password || '').trim() || generatePassword();
      validateSystemUserPayload({
        username: username,
        name: String((matchedUser && matchedUser.name) || '').trim() || username,
        email: String((matchedUser && matchedUser.email) || input.email || '').trim(),
        role: String((matchedUser && matchedUser.role) || USER_ROLES.UNIT_ADMIN).trim(),
        units: parseUserUnits((matchedUser && matchedUser.units) || (matchedUser && matchedUser.unit) || []),
        password: fallbackPassword
      }, { requirePassword: true });
      updateUser(username, { password: '', passwordHash: await hashLocalPasswordValue(fallbackPassword), mustChangePassword: true });
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式帳號後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { user: normalizeUserRecord(findUser(username) || matchedUser), password: fallbackPassword, source: 'local-fallback', warning: buildSystemUserFallbackWarning(error) };
    }
  }
  function submitBackendLogin(username, password) {
    return getAppAuthRemote().submitBackendLogin(username, password);
  }
  function verifyCurrentSessionWithBackend() {
    return getAppAuthRemote().verifyCurrentSessionWithBackend();
  }
  function submitAuthLogout(payload) {
    return getAppAuthRemote().submitAuthLogout(payload);
  }
  function submitAuthResetPasswordByEmail(email) {
    return getAppAuthRemote().submitAuthResetPasswordByEmail(email);
  }
  function submitAuthRedeemResetPassword(payload) {
    return getAppAuthRemote().submitAuthRedeemResetPassword(payload);
  }
  function submitAuthChangePassword(payload) {
    return getAppAuthRemote().submitAuthChangePassword(payload);
  }
  const correctiveActionRepositoryState = {
    mode: 'local-emulator',
    ready: false,
    source: 'local',
    lastSyncAt: '',
    message: '',
    error: ''
  };
  const CORRECTIVE_ACTION_SYNC_FRESHNESS_MS = 30000;
  let correctiveActionSyncCachePromise = null;
  function setCorrectiveActionRepositoryState(patch) {
    Object.assign(correctiveActionRepositoryState, patch || {});
    return { ...correctiveActionRepositoryState };
  }
  function isCorrectiveActionSyncFresh() {
    if (!correctiveActionRepositoryState.ready) return false;
    if (correctiveActionRepositoryState.mode !== 'm365-api') return false;
    const parsedAt = Date.parse(String(correctiveActionRepositoryState.lastSyncAt || '').trim());
    if (!Number.isFinite(parsedAt)) return false;
    return (Date.now() - parsedAt) < CORRECTIVE_ACTION_SYNC_FRESHNESS_MS;
  }
  function getCorrectiveActionRepositoryState() {
    return { ...correctiveActionRepositoryState };
  }
  function mergeRemoteCorrectiveActionsIntoStore(items, options) {
    const strict = !!(options && options.strict);
    const data = loadData();
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      remoteMap.set(id, item);
    });
    const merged = Array.from(remoteMap.values());
    if (!strict) {
      (data.items || []).forEach(function (item) {
        const id = String(item && item.id || '').trim();
        if (!id || remoteMap.has(id)) return;
        merged.push(item);
      });
    }
    data.items = merged;
    saveData(data);
    return data.items.slice();
  }
  function upsertCorrectiveActionInStore(item) {
    if (!item || !item.id) return null;
    const data = loadData();
    const index = (data.items || []).findIndex(function (entry) { return entry.id === item.id; });
    if (index >= 0) {
      data.items[index] = item;
    } else {
      data.items.push(item);
    }
    saveData(data);
    return item;
  }
  function persistLocalCorrectiveActionUpdate(id, updates) {
    updateItem(id, updates);
    return getItem(id);
  }
  function buildCorrectiveActionFallbackWarning(error) {
    const detail = String(error && error.message || error || '').trim();
    return detail ? ('正式矯正單後端未就緒，已改用本機暫存：' + detail) : '正式矯正單後端未就緒，已改用本機暫存。';
  }
  async function syncCorrectiveActionsFromM365(options) {
    const opts = options || {};
    const user = currentUser();
    const client = getM365ApiClient();
    const mode = client.getCorrectiveActionMode();
    const strict = isStrictRemoteDataMode();
    setCorrectiveActionRepositoryState({ mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (!opts.force && isCorrectiveActionSyncFresh()) {
      return setCorrectiveActionRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: correctiveActionRepositoryState.lastSyncAt,
        message: 'corrective actions loaded from fresh cache',
        error: ''
      });
    }
    if (mode !== 'm365-api') {
      return setCorrectiveActionRepositoryState({
        ready: false,
        message: '目前使用本機暫存模式',
        error: ''
      });
    }
    if (!user) {
      return setCorrectiveActionRepositoryState({
        ready: false,
        source: 'auth-pending',
        message: '登入後才會同步矯正單資料',
        error: ''
      });
    }
    try {
      const health = await client.getCorrectiveActionHealth();
      if (health && health.ready === false) {
        return setCorrectiveActionRepositoryState({
          ready: false,
          source: strict ? 'remote-error' : 'local-fallback',
          message: strict ? String(health.message || '正式矯正單後端尚未就緒，正式模式已停用本機暫存') : String(health.message || '正式矯正單後端尚未就緒，系統維持本機資料模式'),
          error: String(health.message || '')
        });
      }
      const response = await client.listCorrectiveActions(opts.query);
      mergeRemoteCorrectiveActionsIntoStore(response.items || [], { strict: strict });
      return setCorrectiveActionRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: new Date().toISOString(),
        message: '已同步正式矯正單資料',
        error: ''
      });
    } catch (error) {
      return setCorrectiveActionRepositoryState({
        ready: false,
        source: strict ? 'remote-error' : 'local-fallback',
        message: strict ? '正式矯正單後端連線失敗，正式模式已停用本機暫存' : '正式矯正單後端尚未就緒，系統維持本機資料模式',
        error: String(error && error.message || error || '')
      });
    }
  }
  async function submitCreateCase(item) {
    const client = getM365ApiClient();
    if (client.getCorrectiveActionMode() !== 'm365-api') {
      addItem(item);
      setCorrectiveActionRepositoryState({ mode: 'local-emulator', source: 'local', ready: false });
      return { ok: true, item: getItem(item.id) || item, source: 'local' };
    }
    try {
      const response = await client.createCorrectiveAction(item);
      const stored = upsertCorrectiveActionInStore(response.item || item);
      setCorrectiveActionRepositoryState({
        mode: 'm365-api',
        source: 'remote',
        ready: true,
        lastSyncAt: new Date().toISOString(),
        message: '矯正單已寫入正式後端',
        error: ''
      });
      return { ok: true, item: stored, source: 'remote', notification: response && response.notification ? response.notification : null };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式矯正單寫入失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('矯正單建立', error));
      }
      addItem(item);
      setCorrectiveActionRepositoryState({
        mode: 'm365-api',
        source: 'local-fallback',
        ready: false,
        message: '正式矯正單後端尚未就緒，已改用本機暫存',
        error: String(error && error.message || error || '')
      });
      return { ok: true, item: getItem(item.id) || item, source: 'local-fallback', warning: buildCorrectiveActionFallbackWarning(error) };
    }
  }
  async function submitRespondCase(id, payload, fallbackUpdates) {
    const client = getM365ApiClient();
    if (client.getCorrectiveActionMode() !== 'm365-api') {
      return { ok: true, item: persistLocalCorrectiveActionUpdate(id, fallbackUpdates), source: 'local' };
    }
    try {
      const response = await client.respondCorrectiveAction(id, payload);
      const stored = upsertCorrectiveActionInStore(response.item || persistLocalCorrectiveActionUpdate(id, fallbackUpdates));
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '矯正單回覆已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式矯正單回覆失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('矯正單回覆', error));
      }
      const stored = persistLocalCorrectiveActionUpdate(id, fallbackUpdates);
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式矯正單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildCorrectiveActionFallbackWarning(error) };
    }
  }
  async function submitReviewDecision(id, payload, fallbackUpdates) {
    const client = getM365ApiClient();
    if (client.getCorrectiveActionMode() !== 'm365-api') {
      return { ok: true, item: persistLocalCorrectiveActionUpdate(id, fallbackUpdates), source: 'local' };
    }
    try {
      const response = await client.reviewCorrectiveAction(id, payload);
      const stored = upsertCorrectiveActionInStore(response.item || persistLocalCorrectiveActionUpdate(id, fallbackUpdates));
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '矯正單審核狀態已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式矯正單審核失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('矯正單審核', error));
      }
      const stored = persistLocalCorrectiveActionUpdate(id, fallbackUpdates);
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式矯正單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildCorrectiveActionFallbackWarning(error) };
    }
  }
  async function submitTrackingSubmission(id, payload, fallbackUpdates) {
    const client = getM365ApiClient();
    if (client.getCorrectiveActionMode() !== 'm365-api') {
      return { ok: true, item: persistLocalCorrectiveActionUpdate(id, fallbackUpdates), source: 'local' };
    }
    try {
      const response = await client.submitCorrectiveActionTracking(id, payload);
      const stored = upsertCorrectiveActionInStore(response.item || persistLocalCorrectiveActionUpdate(id, fallbackUpdates));
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '追蹤提報已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式追蹤提報失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('追蹤提報', error));
      }
      const stored = persistLocalCorrectiveActionUpdate(id, fallbackUpdates);
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式矯正單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildCorrectiveActionFallbackWarning(error) };
    }
  }
  async function submitTrackingReviewDecision(id, payload, fallbackUpdates) {
    const client = getM365ApiClient();
    if (client.getCorrectiveActionMode() !== 'm365-api') {
      return { ok: true, item: persistLocalCorrectiveActionUpdate(id, fallbackUpdates), source: 'local' };
    }
    try {
      const response = await client.reviewCorrectiveActionTracking(id, payload);
      const stored = upsertCorrectiveActionInStore(response.item || persistLocalCorrectiveActionUpdate(id, fallbackUpdates));
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '追蹤審核已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式追蹤審核失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('追蹤審核', error));
      }
      const stored = persistLocalCorrectiveActionUpdate(id, fallbackUpdates);
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式矯正單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildCorrectiveActionFallbackWarning(error) };
    }
  }
  const checklistRepositoryState = {
    mode: 'local-emulator',
    ready: false,
    source: 'local',
    lastSyncAt: '',
    message: '',
    error: ''
  };
  const CHECKLIST_SYNC_FRESHNESS_MS = 15000;
  let checklistSyncCachePromise = null;
  function setChecklistRepositoryState(patch) {
    Object.assign(checklistRepositoryState, patch || {});
    return { ...checklistRepositoryState };
  }
  function getChecklistRepositoryState() {
    return { ...checklistRepositoryState };
  }
  function isChecklistSyncFresh() {
    if (!checklistRepositoryState.ready) return false;
    const parsedAt = Date.parse(String(checklistRepositoryState.lastSyncAt || '').trim());
    if (!Number.isFinite(parsedAt)) return false;
    return (Date.now() - parsedAt) < CHECKLIST_SYNC_FRESHNESS_MS;
  }
  function mergeRemoteChecklistsIntoStore(items, options) {
    const strict = !!(options && options.strict);
    const store = loadChecklists();
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      remoteMap.set(id, item);
    });
    const merged = Array.from(remoteMap.values());
    if (!strict) {
      (store.items || []).forEach(function (item) {
        const id = String(item && item.id || '').trim();
        if (!id || remoteMap.has(id)) return;
        merged.push(item);
      });
    }
    store.items = merged;
    saveChecklists(store);
    return store.items.slice();
  }
  function upsertChecklistInStore(item) {
    if (!item || !item.id) return null;
    const store = loadChecklists();
    const index = (store.items || []).findIndex(function (entry) { return entry.id === item.id; });
    if (index >= 0) {
      store.items[index] = item;
    } else {
      store.items.push(item);
    }
    saveChecklists(store);
    return item;
  }
  function persistLocalChecklist(item) {
    if (!item || !item.id) return null;
    if (getChecklist(item.id)) {
      updateChecklist(item.id, item);
    } else {
      addChecklist(item);
    }
    return getChecklist(item.id) || item;
  }
  function buildChecklistFallbackWarning(error) {
    const detail = String(error && error.message || error || '').trim();
    return detail ? ('正式檢核表後端未就緒，已改用本機暫存：' + detail) : '正式檢核表後端未就緒，已改用本機暫存。';
  }
  async function syncChecklistsFromM365(options) {
    const opts = options || {};
    const user = currentUser();
    const client = getM365ApiClient();
    const mode = client.getChecklistMode();
    const strict = isStrictRemoteDataMode();
    if (!opts.force && checklistSyncCachePromise) return checklistSyncCachePromise;
    if (!opts.force && isChecklistSyncFresh()) {
      return setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'remote',
        ready: true,
        message: 'checklists synced from M365',
        error: ''
      });
    }
    const request = (async function () {
    setChecklistRepositoryState({ mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (mode !== 'm365-api') {
      return setChecklistRepositoryState({
        ready: false,
        message: '目前使用本機暫存模式',
        error: ''
      });
    }
    if (!user) {
      return setChecklistRepositoryState({
        ready: false,
        source: 'auth-pending',
        message: '登入後才會同步檢核表資料',
        error: ''
      });
    }
    try {
      const health = await client.getChecklistHealth();
      if (health && health.ready === false) {
        return setChecklistRepositoryState({
          ready: false,
          source: strict ? 'remote-error' : 'local-fallback',
          message: strict ? String(health.message || '正式檢核表後端尚未就緒，正式模式已停用本機暫存') : String(health.message || '正式檢核表後端尚未就緒，系統維持本機資料模式'),
          error: String(health.message || '')
        });
      }
      const response = await client.listChecklists(opts.query);
      mergeRemoteChecklistsIntoStore(response.items || [], { strict: strict });
      return setChecklistRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: new Date().toISOString(),
        message: '已同步正式檢核表資料',
        error: ''
      });
    } catch (error) {
      return setChecklistRepositoryState({
        ready: false,
        source: strict ? 'remote-error' : 'local-fallback',
        message: strict ? '正式檢核表後端連線失敗，正式模式已停用本機暫存' : '正式檢核表後端尚未就緒，系統維持本機資料模式',
        error: String(error && error.message || error || '')
      });
    }
    })();
    if (!opts.force) {
      const tracked = request.finally(function () {
        if (checklistSyncCachePromise === tracked) checklistSyncCachePromise = null;
      });
      checklistSyncCachePromise = tracked;
      return tracked;
    }
    return request;
  }
  async function submitChecklistDraft(payload) {
    const client = getM365ApiClient();
    const id = String(payload && payload.id || '').trim();
    if (client.getChecklistMode() !== 'm365-api') {
      return { ok: true, item: persistLocalChecklist(payload), source: 'local' };
    }
    try {
      const response = await client.saveChecklistDraft(id, payload);
      const stored = upsertChecklistInStore(response.item || payload);
      setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'remote',
        ready: true,
        lastSyncAt: new Date().toISOString(),
        message: '檢核表草稿已寫入正式後端',
        error: ''
      });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setChecklistRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式檢核表草稿儲存失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('檢核表草稿儲存', error));
      }
      const stored = persistLocalChecklist(payload);
      setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'local-fallback',
        ready: false,
        message: '正式檢核表後端尚未就緒，已改用本機暫存',
        error: String(error && error.message || error || '')
      });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildChecklistFallbackWarning(error) };
    }
  }
  async function submitChecklistForm(payload) {
    const client = getM365ApiClient();
    const id = String(payload && payload.id || '').trim();
    if (client.getChecklistMode() !== 'm365-api') {
      return { ok: true, item: persistLocalChecklist(payload), source: 'local' };
    }
    try {
      const response = await client.submitChecklist(id, payload);
      const stored = upsertChecklistInStore(response.item || payload);
      setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'remote',
        ready: true,
        lastSyncAt: new Date().toISOString(),
        message: '檢核表已寫入正式後端',
        error: ''
      });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setChecklistRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '正式檢核表送出失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('檢核表送出', error));
      }
      const stored = persistLocalChecklist(payload);
      setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'local-fallback',
        ready: false,
        message: '正式檢核表後端尚未就緒，已改用本機暫存',
        error: String(error && error.message || error || '')
      });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildChecklistFallbackWarning(error) };
    }
  }
  async function deleteChecklistsByYear(auditYear) {
    const targetYear = String(auditYear || '').trim();
    if (!targetYear) throw new Error('請指定年度。');
    const client = getM365ApiClient();
    if (client.getChecklistMode() !== 'm365-api') {
      const localResult = getDataModule().deleteChecklistsByYear(targetYear);
      return { ok: true, source: 'local', year: targetYear, deletedCount: Number(localResult && localResult.deletedCount || 0), deletedIds: Array.isArray(localResult && localResult.deletedIds) ? localResult.deletedIds : [] };
    }
    try {
      const response = await client.deleteChecklistsByYear(targetYear);
      const localResult = getDataModule().deleteChecklistsByYear(targetYear);
      setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'remote',
        ready: true,
        lastSyncAt: new Date().toISOString(),
        message: 'checklists synced from M365',
        error: ''
      });
      return {
        ok: true,
        source: 'remote',
        year: targetYear,
        deletedCount: Number((response && response.deletedCount) || (localResult && localResult.deletedCount) || 0),
        deletedIds: Array.isArray(response && response.deletedIds) ? response.deletedIds : (localResult && localResult.deletedIds) || []
      };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setChecklistRepositoryState({
          mode: 'm365-api',
          source: 'remote-error',
          ready: false,
          message: 'Failed to delete checklist year.',
          error: String(error && error.message || error || '')
        });
        throw new Error(buildStrictRemoteError('刪除檢核表年度', error));
      }
      const localResult = getDataModule().deleteChecklistsByYear(targetYear);
      setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'local-fallback',
        ready: false,
        message: 'checklists deleted locally',
        error: String(error && error.message || error || '')
      });
      return {
        ok: true,
        source: 'local-fallback',
        year: targetYear,
        deletedCount: Number(localResult && localResult.deletedCount || 0),
        deletedIds: Array.isArray(localResult && localResult.deletedIds) ? localResult.deletedIds : [],
        warning: buildChecklistFallbackWarning(error)
      };
    }
  }
  const trainingRepositoryState = {
    mode: 'local-emulator',
    ready: false,
    source: 'local',
    lastFormsSyncAt: '',
    lastRostersSyncAt: '',
    message: '',
    error: ''
  };
  const TRAINING_FORM_SYNC_FRESHNESS_MS = 15000;
  const TRAINING_ROSTER_SYNC_FRESHNESS_MS = 120000;
  const TRAINING_HEALTH_CACHE_MS = 15000;
  let trainingHealthCacheValue = null;
  let trainingHealthCacheAt = 0;
  let trainingHealthCachePromise = null;
  function setTrainingRepositoryState(patch) {
    Object.assign(trainingRepositoryState, patch || {});
    return { ...trainingRepositoryState };
  }
  function isTrainingSyncFresh(kind) {
    const lastSyncAt = kind === 'rosters' ? trainingRepositoryState.lastRostersSyncAt : trainingRepositoryState.lastFormsSyncAt;
    if (!trainingRepositoryState.ready) return false;
    const parsedAt = Date.parse(String(lastSyncAt || '').trim());
    if (!Number.isFinite(parsedAt)) return false;
    const freshnessMs = kind === 'rosters'
      ? TRAINING_ROSTER_SYNC_FRESHNESS_MS
      : TRAINING_FORM_SYNC_FRESHNESS_MS;
    return (Date.now() - parsedAt) < freshnessMs;
  }
  function isTrainingHealthCacheFresh() {
    if (!trainingHealthCacheValue) return false;
    if (!trainingHealthCacheAt) return false;
    return (Date.now() - trainingHealthCacheAt) < TRAINING_HEALTH_CACHE_MS;
  }
  async function getTrainingHealthCached(client, force) {
    if (!force) {
      if (trainingHealthCachePromise) return trainingHealthCachePromise;
      if (isTrainingHealthCacheFresh()) return trainingHealthCacheValue;
    }
    const request = Promise.resolve().then(() => client.getTrainingHealth()).then((health) => {
      trainingHealthCacheValue = health || null;
      trainingHealthCacheAt = Date.now();
      return health;
    }).finally(() => {
      trainingHealthCachePromise = null;
    });
    trainingHealthCachePromise = request;
    return request;
  }
  function mergeRemoteTrainingFormsIntoStore(items, options) {
    const strict = !!(options && options.strict);
    const store = loadTrainingStore();
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      remoteMap.set(id, item);
    });
    const merged = Array.from(remoteMap.values());
    if (!strict) {
      (store.forms || []).forEach(function (item) {
        const id = String(item && item.id || '').trim();
        if (!id || remoteMap.has(id)) return;
        merged.push(item);
      });
    }
    const latestStore = loadTrainingStore();
    latestStore.forms = merged;
    saveTrainingStore(latestStore);
    return latestStore.forms.slice();
  }
  function mergeRemoteTrainingRostersIntoStore(items, options) {
    const strict = !!(options && options.strict);
    const keepLocalRowsUpdatedAfter = Number(options && options.keepLocalRowsUpdatedAfter || 0);
    const keepLocalRowsGraceMs = Number(options && options.keepLocalRowsGraceMs || 0);
    const store = loadTrainingStore();
    const remoteMap = new Map();
    const localRows = Array.isArray(store.rosters) ? store.rosters.slice() : [];
    function rowTimestamp(item) {
      const raw = String((item && (item.updatedAt || item.createdAt)) || '').trim();
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      remoteMap.set(id, item);
    });
    const mergedById = new Map(remoteMap);
    localRows.forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      const remoteItem = mergedById.get(id);
      if (remoteItem) {
        if (keepLocalRowsUpdatedAfter > 0) {
          const localTimestamp = rowTimestamp(item);
          const remoteTimestamp = rowTimestamp(remoteItem);
          if (localTimestamp >= keepLocalRowsUpdatedAfter && localTimestamp >= remoteTimestamp) {
            mergedById.set(id, item);
          }
        }
        return;
      }
      const rowTimestampValue = rowTimestamp(item);
      const isWithinGrace = keepLocalRowsGraceMs > 0
        && keepLocalRowsUpdatedAfter > 0
        && rowTimestampValue >= (keepLocalRowsUpdatedAfter - keepLocalRowsGraceMs);
      if (!strict || (keepLocalRowsUpdatedAfter > 0 && rowTimestampValue >= keepLocalRowsUpdatedAfter) || isWithinGrace) {
        mergedById.set(id, item);
      }
    });
    const latestStore = loadTrainingStore();
    latestStore.rosters = Array.from(mergedById.values());
    saveTrainingStore(latestStore);
    return latestStore.rosters.slice();
  }
  function upsertTrainingFormInStore(item) {
    if (!item || !item.id) return null;
    upsertTrainingForm(item);
    return getTrainingForm(item.id) || item;
  }
  function upsertTrainingRosterInStore(item) {
    if (!item || !item.id) return null;
    const store = loadTrainingStore();
    const index = (store.rosters || []).findIndex(function (entry) { return entry.id === item.id; });
    if (index >= 0) {
      store.rosters[index] = item;
    } else {
      store.rosters.push(item);
    }
    saveTrainingStore(store);
    return loadTrainingStore().rosters.find(function (entry) { return entry.id === item.id; }) || item;
  }
  function deleteTrainingRosterFromStore(id) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;
    deleteTrainingRosterPerson(cleanId);
  }
  function deleteTrainingRostersFromStore(ids) {
    const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map(function (value) {
      return String(value || '').trim();
    }).filter(Boolean)));
    uniqueIds.forEach(function (id) {
      deleteTrainingRosterFromStore(id);
    });
  }
  function persistLocalTrainingForm(payload) {
    return upsertTrainingFormInStore(payload);
  }
  function buildTrainingFallbackWarning(error) {
    const detail = String(error && error.message || error || '').trim();
    return detail ? ('正式教育訓練後端未就緒，已改用本機暫存：' + detail) : '正式教育訓練後端未就緒，已改用本機暫存。';
  }
  async function syncTrainingFormsFromM365(options) {
    const opts = options || {};
    const user = currentUser();
    const client = getM365ApiClient();
    const mode = client.getTrainingMode();
    const strict = isStrictRemoteDataMode();
    if (!opts.force && isTrainingSyncFresh('forms')) {
      return setTrainingRepositoryState({
        mode: 'm365-api',
        source: 'remote',
        ready: true,
        message: '教育訓練草稿沿用近期同步資料',
        error: ''
      });
    }
    setTrainingRepositoryState({ mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (mode !== 'm365-api') {
      return setTrainingRepositoryState({ ready: false, message: '目前使用本機暫存模式', error: '' });
    }
    if (!user) {
      return setTrainingRepositoryState({ ready: false, source: 'auth-pending', message: '登入後才會同步教育訓練資料', error: '' });
    }
    const syncStartedAt = Date.now();
    try {
      const health = await getTrainingHealthCached(client, !!opts.force);
      if (health && health.ready === false) {
        return setTrainingRepositoryState({
          ready: false,
          source: strict ? 'remote-error' : 'local-fallback',
          message: strict ? String(health.message || '正式教育訓練後端尚未就緒，正式模式已停用本機暫存') : String(health.message || '正式教育訓練後端尚未就緒，系統維持本機資料模式'),
          error: String(health.message || '')
        });
      }
      const response = await client.listTrainingForms(opts.query);
      mergeRemoteTrainingFormsIntoStore(response.items || [], { strict: strict });
      return setTrainingRepositoryState({
        ready: true,
        source: 'remote',
        lastFormsSyncAt: new Date().toISOString(),
        message: '已同步正式教育訓練資料',
        error: ''
      });
    } catch (error) {
      return setTrainingRepositoryState({
        ready: false,
        source: strict ? 'remote-error' : 'local-fallback',
        message: strict ? '正式教育訓練後端連線失敗，正式模式已停用本機暫存' : '正式教育訓練後端尚未就緒，系統維持本機資料模式',
        error: String(error && error.message || error || '')
      });
    }
  }
  async function syncTrainingRostersFromM365(options) {
    const opts = options || {};
    const user = currentUser();
    const client = getM365ApiClient();
    const mode = client.getTrainingMode();
    const strict = isStrictRemoteDataMode();
    if (!opts.force && isTrainingSyncFresh('rosters')) {
      return setTrainingRepositoryState({
        mode: 'm365-api',
        source: 'remote',
        ready: true,
        message: '教育訓練名單沿用近期同步資料',
        error: ''
      });
    }
    setTrainingRepositoryState({ mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (mode !== 'm365-api') {
      return setTrainingRepositoryState({ ready: false, message: '目前使用本機暫存模式', error: '' });
    }
    if (!user) {
      return setTrainingRepositoryState({ ready: false, source: 'auth-pending', message: '登入後才會同步教育訓練名單', error: '' });
    }
    try {
      const health = await getTrainingHealthCached(client, !!opts.force);
      if (health && health.ready === false) {
        return setTrainingRepositoryState({
          ready: false,
          source: strict ? 'remote-error' : 'local-fallback',
          message: strict ? String(health.message || '正式教育訓練後端尚未就緒，正式模式已停用本機暫存') : String(health.message || '正式教育訓練後端尚未就緒，系統維持本機資料模式'),
          error: String(health.message || '')
        });
      }
      const response = await client.listTrainingRosters(opts.query);
      mergeRemoteTrainingRostersIntoStore(response.items || [], {
        strict: strict,
        keepLocalRowsUpdatedAfter: syncStartedAt,
        keepLocalRowsGraceMs: TRAINING_ROSTER_SYNC_FRESHNESS_MS
      });
      return setTrainingRepositoryState({
        ready: true,
        source: 'remote',
        lastRostersSyncAt: new Date().toISOString(),
        message: '已同步正式教育訓練名單',
        error: ''
      });
    } catch (error) {
      return setTrainingRepositoryState({
        ready: false,
        source: strict ? 'remote-error' : 'local-fallback',
        message: strict ? '正式教育訓練名單後端連線失敗，正式模式已停用本機暫存' : '正式教育訓練名單後端尚未就緒，系統維持本機資料模式',
        error: String(error && error.message || error || '')
      });
    }
  }
  async function submitTrainingDraft(payload) {
    const client = getM365ApiClient();
    const id = String(payload && payload.id || '').trim();
    if (client.getTrainingMode() !== 'm365-api') {
      return { ok: true, item: persistLocalTrainingForm(payload), source: 'local' };
    }
    try {
      const response = await client.saveTrainingDraft(id, payload);
      const stored = upsertTrainingFormInStore(response.item || payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練草稿已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練草稿儲存失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練草稿儲存', error));
      }
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  async function submitTrainingStepOne(payload) {
    const client = getM365ApiClient();
    const id = String(payload && payload.id || '').trim();
    if (client.getTrainingMode() !== 'm365-api') {
      return { ok: true, item: persistLocalTrainingForm(payload), source: 'local' };
    }
    try {
      const response = await client.submitTrainingStepOne(id, payload);
      const stored = upsertTrainingFormInStore(response.item || payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練流程一已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練流程一送出失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練流程一送出', error));
      }
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  async function submitTrainingMarkPrinted(payload) {
    const client = getM365ApiClient();
    const id = String(payload && payload.id || '').trim();
    if (client.getTrainingMode() !== 'm365-api') {
      return { ok: true, item: persistLocalTrainingForm(payload), source: 'local' };
    }
    try {
      const response = await client.markTrainingPrinted(id, payload);
      const stored = upsertTrainingFormInStore(response.item || payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練列印紀錄已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練列印紀錄寫入失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練列印紀錄寫入', error));
      }
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  async function submitTrainingFinalize(payload) {
    const client = getM365ApiClient();
    const id = String(payload && payload.id || '').trim();
    if (client.getTrainingMode() !== 'm365-api') {
      return { ok: true, item: persistLocalTrainingForm(payload), source: 'local' };
    }
    try {
      const response = await client.finalizeTrainingForm(id, payload);
      const stored = upsertTrainingFormInStore(response.item || payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練結案已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練結案失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練結案', error));
      }
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  async function submitTrainingReturn(payload) {
    const client = getM365ApiClient();
    const id = String(payload && payload.id || '').trim();
    if (client.getTrainingMode() !== 'm365-api') {
      return { ok: true, item: persistLocalTrainingForm(payload), source: 'local' };
    }
    try {
      const response = await client.returnTrainingForm(id, payload);
      const stored = upsertTrainingFormInStore(response.item || payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練退回已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練退回失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練退回', error));
      }
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  async function submitTrainingUndo(payload) {
    const client = getM365ApiClient();
    const id = String(payload && payload.id || '').trim();
    if (client.getTrainingMode() !== 'm365-api') {
      return { ok: true, item: persistLocalTrainingForm(payload), source: 'local' };
    }
    try {
      const response = await client.undoTrainingForm(id, payload);
      const stored = upsertTrainingFormInStore(response.item || payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練撤回已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練撤回失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練撤回', error));
      }
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  async function submitTrainingRosterUpsert(payload) {
    const client = getM365ApiClient();
    if (client.getTrainingMode() !== 'm365-api') {
      return { ok: true, item: upsertTrainingRosterInStore(payload), source: 'local' };
    }
    try {
      const response = await client.upsertTrainingRoster(payload);
      const remoteItem = response && response.item && String(response.item.id || '').trim()
        ? response.item
        : null;
      if (!remoteItem) {
        throw new Error('教育訓練名單後端未回傳已儲存資料');
      }
      const stored = upsertTrainingRosterInStore(remoteItem);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastRostersSyncAt: new Date().toISOString(), message: '教育訓練名單已寫入正式後端', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練名單寫入失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練名單寫入', error));
      }
      const stored = upsertTrainingRosterInStore(payload);
        setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練名單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  async function submitTrainingRosterBatchUpsert(payload) {
    const client = getM365ApiClient();
    const inputItems = Array.isArray(payload && payload.items) ? payload.items : [];
    if (!inputItems.length) {
      return {
        ok: true,
        items: [],
        summary: { added: 0, updated: 0, skipped: 0, failed: 0 },
        errors: [],
        source: 'noop'
      };
    }
    if (client.getTrainingMode() !== 'm365-api') {
      const storedItems = inputItems.map((item) => upsertTrainingRosterInStore(item));
      return {
        ok: true,
        items: storedItems,
        summary: { added: storedItems.length, updated: 0, skipped: 0, failed: 0 },
        errors: [],
        source: 'local'
      };
    }
    try {
      const response = await client.upsertTrainingRosterBatch(payload);
      const remoteItems = Array.isArray(response && response.items)
        ? response.items.filter((item) => String(item && item.id || '').trim())
        : [];
      if (!remoteItems.length && Number(response && response.summary && response.summary.failed || 0) > 0) {
        throw new Error('教育訓練名單批次匯入失敗');
      }
      const storedItems = remoteItems.map((item) => upsertTrainingRosterInStore(item));
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastRostersSyncAt: new Date().toISOString(), message: '教育訓練名單批次匯入已寫入正式後端', error: '' });
      return {
        ok: true,
        items: storedItems,
        summary: response && response.summary ? response.summary : { added: storedItems.length, updated: 0, skipped: 0, failed: 0 },
        errors: Array.isArray(response && response.errors) ? response.errors : [],
        source: 'remote'
      };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練名單批次匯入失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練名單批次匯入', error));
      }
      const storedItems = inputItems.map((item) => upsertTrainingRosterInStore(item));
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練名單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return {
        ok: true,
        items: storedItems,
        summary: { added: storedItems.length, updated: 0, skipped: 0, failed: 0 },
        errors: [],
        source: 'local-fallback',
        warning: buildTrainingFallbackWarning(error)
      };
    }
  }
  async function submitTrainingRosterDelete(id, payload) {
    const client = getM365ApiClient();
    const cleanId = String(id || (payload && payload.id) || '').trim();
    if (client.getTrainingMode() !== 'm365-api') {
      deleteTrainingRosterFromStore(cleanId);
      return { ok: true, deletedId: cleanId, source: 'local' };
    }
    try {
      await client.deleteTrainingRoster(cleanId, payload);
      deleteTrainingRosterFromStore(cleanId);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastRostersSyncAt: new Date().toISOString(), message: '教育訓練名單刪除已寫入正式後端', error: '' });
      return { ok: true, deletedId: cleanId, source: 'remote' };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '教育訓練名單刪除失敗，正式模式已停用本機暫存', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('教育訓練名單刪除', error));
      }
      deleteTrainingRosterFromStore(cleanId);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '正式教育訓練名單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, deletedId: cleanId, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  async function submitTrainingRosterBatchDelete(payload) {
    const client = getM365ApiClient();
    const inputIds = Array.isArray(payload && payload.ids) ? payload.ids : [];
    const cleanIds = Array.from(new Set(inputIds.map(function (value) {
      return String(value || '').trim();
    }).filter(Boolean)));
    if (!cleanIds.length) {
      return { ok: true, deletedIds: [], deletedCount: 0, skippedIds: [], source: 'noop' };
    }
    if (client.getTrainingMode() !== 'm365-api') {
      deleteTrainingRostersFromStore(cleanIds);
      return { ok: true, deletedIds: cleanIds, deletedCount: cleanIds.length, skippedIds: [], source: 'local' };
    }
    try {
      const response = await client.deleteTrainingRosterBatch({ ...payload, ids: cleanIds });
      const deletedIds = Array.isArray(response && response.deletedIds)
        ? response.deletedIds.map(function (value) { return String(value || '').trim(); }).filter(Boolean)
        : cleanIds;
      deleteTrainingRostersFromStore(deletedIds);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastRostersSyncAt: new Date().toISOString(), message: '訓練名單已同步刪除', error: '' });
      return {
        ok: true,
        deletedIds,
        deletedCount: Number(response && response.deletedCount || deletedIds.length),
        skippedIds: Array.isArray(response && response.skippedIds) ? response.skippedIds : [],
        source: 'remote'
      };
    } catch (error) {
      if (isStrictRemoteDataMode()) {
        setTrainingRepositoryState({ mode: 'm365-api', source: 'remote-error', ready: false, message: '訓練名單刪除失敗', error: String(error && error.message || error || '') });
        throw new Error(buildStrictRemoteError('刪除訓練名單', error));
      }
      deleteTrainingRostersFromStore(cleanIds);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: '訓練名單刪除改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, deletedIds: cleanIds, deletedCount: cleanIds.length, skippedIds: [], source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
    }
  }
  let unitContactApplicationModuleApi = null;
  function getUnitContactApplicationModule() {
    if (unitContactApplicationModuleApi) return unitContactApplicationModuleApi;
    if (typeof window === 'undefined' || typeof window.createUnitContactApplicationModule !== 'function') {
      throw new Error('unit-contact-application-module.js not loaded');
    }
    unitContactApplicationModuleApi = window.createUnitContactApplicationModule({
      UNIT_CONTACT_APPLICATION_STATUSES,
      navigate,
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      toast,
      esc,
      ic,
      fmtTime,
      refreshIcons,
      buildUnitCascadeControl,
      initUnitCascade,
      getUnitCode,
      getM365ModeLabel: function () { return getM365ApiClient().getModeLabel(); },
      getM365ModeKey: function () { return getM365ApiClient().getMode(); },
      submitAttachmentUpload: function (entry, options) { return submitAttachmentUpload(entry, options); },
      requestUnitContactAuthorizationDocument: function (applicationId, options) {
        const id = encodeURIComponent(String(applicationId || '').trim());
        const query = [];
        const email = String(options && options.email || '').trim().toLowerCase();
        const download = String(options && options.download || '').trim() === '1';
        if (email) query.push('email=' + encodeURIComponent(email));
        if (download) query.push('download=1');
        const suffix = query.length ? ('?' + query.join('&')) : '';
        return requestSameOriginBlob('/api/unit-contact/applications/' + id + '/authorization-doc/content' + suffix, { method: 'GET' });
      },
      submitUnitContactApplication: function (payload) { return getM365ApiClient().submitUnitContactApplication(payload); },
      getUnitContactApplication: function (id) { return getM365ApiClient().getUnitContactApplication(id); },
      lookupUnitContactApplicationsByEmail: function (email) { return getM365ApiClient().lookupUnitContactApplicationsByEmail(email); }
    });
    window._unitContactApplicationModule = unitContactApplicationModuleApi;
    return unitContactApplicationModuleApi;
  }

  function markAuthenticatedBootstrapReady(user) {
    return getAppAuthSessionRuntimeModule().markAuthenticatedBootstrapReady(buildAppAuthSessionRuntimeDeps(), user);
  }
  function buildAppAuthSessionRuntimeDeps() {
    return {
      AUTH_KEY,
      ROLES,
      getAuthMode,
      currentUser,
      normalizeUserRecord,
      normalizeRemoteSystemUsers,
      requestAuthJson,
      toast,
      logout,
      canManageUsers,
      recordBootstrapStep,
      syncTrainingFormsFromM365,
      syncTrainingRostersFromM365,
      syncChecklistsFromM365,
      syncCorrectiveActionsFromM365,
      syncUsersFromM365,
      syncReviewScopesFromM365,
      getAppAuthSessionModule
    };
  }
  async function ensureAuthenticatedRemoteBootstrap() {
    return getAppAuthSessionRuntimeModule().ensureAuthenticatedRemoteBootstrap(buildAppAuthSessionRuntimeDeps());
  }
  function isAuthenticatedRemoteBootstrapPending() {
    return getAppAuthSessionRuntimeModule().isAuthenticatedRemoteBootstrapPending(buildAppAuthSessionRuntimeDeps());
  }
  function clearSessionHeartbeat() {
    return getAppAuthSessionRuntimeModule().clearSessionHeartbeat(buildAppAuthSessionRuntimeDeps());
  }
  async function runSessionHeartbeat() {
    return getAppAuthSessionRuntimeModule().runSessionHeartbeat(buildAppAuthSessionRuntimeDeps());
  }
  function ensureSessionHeartbeat() {
    return getAppAuthSessionRuntimeModule().ensureSessionHeartbeat(buildAppAuthSessionRuntimeDeps());
  }
  let shellModuleApi = null;
  function getShellModule() {
    shellModuleApi = getAppShellRuntimeModule().getShellModule(shellModuleApi, {
      resolveFactoryService,
      recordBootstrapStep,
      getAppShellOrchestrationModule,
      ROUTE_WHITELIST,
      ROLE_BADGE,
      STATUSES,
      currentUser,
      login,
      logout,
      getAuthMode,
      hasLocalUsers: function () { return getAuthModule().hasLocalUsers(); },
      bootstrapLocalAdminAccount: function (input) { return getAuthModule().bootstrapLocalAdminAccount(input); },
      resetPasswordByEmail,
      redeemResetPassword,
      changePassword,
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
      markAuthenticatedBootstrapReady,
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
      switchCurrentUserUnit,
      ensureAuthenticatedRemoteBootstrap,
      isAuthenticatedRemoteBootstrapPending,
      hasUnsavedChangesGuard,
      confirmDiscardUnsavedChanges,
      registerActionHandlers
    });
    return shellModuleApi;
  }
    const appPageShellRuntime = getAppRuntimeServiceModule().getAppPageShellRuntimeModule(appRuntimeServiceState).createAccess({
    DATA_KEY,
    currentUser,
    canCreateCAR,
    canManageUsers,
    isAdmin,
    canFillChecklist,
    canFillTraining,
    getCaseModule,
    getAdminModule,
    getChecklistModule,
    getTrainingModule,
    getUnitContactApplicationModule,
    getAppPageOrchestrationModule,
    getAppRouteModule,
    getAppVisibilityModule,
    getAppShellOrchestrationModule,
    getDataModule,
    getPolicyModule,
    getUiModule,
    getShellModule,
    ensureSessionHeartbeat
  });
  const {
    ROUTE_WHITELIST,
    bindRouteManifest,
    getRouteMeta,
    getRouteTitle,
    canAccessRoute,
    getRouteFallback,
    refreshIcons,
    getVisibleItems,
    canAccessItem,
    isItemHandler,
    canRespondItem,
    canSubmitTracking,
    toTestIdFragment,
    isMobileViewport,
    closeSidebar,
    toggleSidebar,
    renderLogin,
    renderApp,
    renderSidebar,
    renderHeader
  } = appPageShellRuntime;
  bindRouteManifest(window);

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
  function resetChecklistSections() { return saveChecklistSections(JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS))); }

  // Dynamic alias used throughout the fill/detail views
  var CHECKLIST_SECTIONS;
  function refreshChecklistSections() { CHECKLIST_SECTIONS = getChecklistSections(); }
  refreshChecklistSections();

  const COMPLIANCE_OPTS = ['符合', '部分符合', '不符合', '不適用'];
  const COMPLIANCE_COLORS = { '符合': '#22c55e', '部分符合': '#f59e0b', '不符合': '#ef4444', '不適用': '#94a3b8' };
  const COMPLIANCE_CLASSES = { '符合': 'comply', '部分符合': 'partial', '不符合': 'noncomply', '不適用': 'na' };

  // ─── Checklist Storage ─────────────────────
  let appTrainingChecklistBridgeModuleApi = null;
  function getAppTrainingChecklistBridgeModule() {
    if (appTrainingChecklistBridgeModuleApi) return appTrainingChecklistBridgeModuleApi;
    if (typeof window === 'undefined' || typeof window.createAppTrainingChecklistBridgeModule !== 'function') {
      throw new Error('app-training-checklist-bridge-module.js not loaded');
    }
    appTrainingChecklistBridgeModuleApi = window.createAppTrainingChecklistBridgeModule();
    window._appTrainingChecklistBridgeModule = appTrainingChecklistBridgeModuleApi;
    return appTrainingChecklistBridgeModuleApi;
  }
  const TRAINING_PROFESSIONAL_OPTIONS = ['是', '否'];
  const appTrainingChecklistBridge = getAppTrainingChecklistBridgeModule().createAccess({
    CHECKLIST_KEY,
    TRAINING_KEY,
    trainingGeneralLabel: TRAINING_GENERAL_LABEL,
    trainingInfoStaffLabel: TRAINING_INFO_STAFF_LABEL,
    trainingProfessionalLabel: TRAINING_PROFESSIONAL_LABEL,
    trainingBooleanOptions: TRAINING_BOOLEAN_OPTIONS,
    trainingProfessionalOptions: TRAINING_PROFESSIONAL_OPTIONS,
    getDataModule: function () { return getDataModule(); },
    getWorkflowSupportModule: function () { return getWorkflowSupportModule(); },
    getPolicyModule: function () { return getPolicyModule(); },
    currentUser,
    getSystemUnits,
    getUnitCode,
    splitUnitValue
  });
  const {
    normalizeChecklistStatus,
    isChecklistDraftStatus,
    normalizeChecklistItem,
    loadChecklists,
    saveChecklists,
    getStoreTouchToken,
    getAllChecklists,
    getChecklist,
    addChecklist,
    updateChecklist,
    getChecklistUnitCode,
    buildChecklistDocumentNo,
    parseChecklistId,
    buildChecklistIdByDocument,
    getNextChecklistSequence,
    generateChecklistId,
    generateChecklistIdForYear,
    isChecklistOwner,
    canAccessChecklist,
    getVisibleChecklists,
    canEditChecklist,
    findExistingChecklistForUnitYear,
    getLatestEditableChecklistDraft,
    getTrainingStatsUnit,
    getTrainingJobUnit,
    hasTrainingValue,
    isTrainingBooleanValue,
    isTrainingBooleanCompatibleValue,
    normalizeTrainingProfessionalValue,
    getStoredTrainingProfessionalValue,
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
    buildTrainingFormDocumentNo,
    parseTrainingFormId,
    buildTrainingFormIdByDocument,
    getNextTrainingFormSequence,
    generateTrainingFormId,
    getAllTrainingRosters,
    getTrainingRosterByUnit,
    addTrainingRosterPerson,
    deleteTrainingRosterPerson,
    updateTrainingRosterPerson,
    getTrainingUnits,
    getVisibleTrainingForms,
    canEditTrainingForm,
    canManageTrainingForm,
    isTrainingManualRowOwner,
    canDeleteTrainingEditableRow,
    getTrainingUndoRemainingMs,
    getTrainingUndoRemainingMinutes,
    canUndoTrainingForm,
    isTrainingVisible,
    findExistingTrainingFormForUnitYear,
    isTrainingRecordReadyForSubmit,
    isTrainingRecordComplete,
    getTrainingRecordHint,
    getTrainingDecisionMeta,
    getTrainingProfessionalDisplay,
    computeTrainingSummary
  } = appTrainingChecklistBridge;

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

  async function persistUploadedEntries(entries, options) {
    if (getAttachmentsMode() !== 'm365-api') return getAttachmentModule().persistUploadedEntries(entries, options);
    const list = Array.isArray(entries) ? entries : [];
    const persisted = [];
    for (const entry of list) {
      if (!entry) continue;
      if (entry.driveItemId && !entry.file && !entry.data) {
        persisted.push(normalizeRemoteAttachmentDescriptor(entry, entry));
        continue;
      }
      const saved = await submitAttachmentUpload(entry, options);
      if (entry.file || entry.previewUrl) revokeTransientUploadEntry(entry);
      persisted.push(saved);
    }
    return persisted;
  }
  async function migrateStoredAttachments(entries, options) {
    if (getAttachmentsMode() !== 'm365-api') return getAttachmentModule().migrateStoredAttachments(entries, options);
    const list = Array.isArray(entries) ? entries : [];
    let changed = false;
    const files = [];
    const errors = [];
    for (const entry of list) {
      if (!entry) continue;
      if ((entry.driveItemId || entry.downloadUrl || entry.webUrl) && !entry.file && !entry.data) {
        files.push(normalizeRemoteAttachmentDescriptor(entry, entry));
        continue;
      }
      if (!entry.file && !entry.data && !entry.previewUrl && entry.attachmentId) {
        const storedBlob = await getAttachmentModule().readStoredBlob(entry.attachmentId);
        if (!storedBlob) {
          files.push(normalizeRemoteAttachmentDescriptor(entry, entry));
          continue;
        }
      }
      try {
        changed = true;
        files.push(await submitAttachmentUpload(entry, options));
      } catch (error) {
        const message = String(error && error.message || error || 'attachment-migration-failed');
        console.warn('[attachment-migration]', message, entry && entry.name ? entry.name : '');
        errors.push({
          name: String(entry && entry.name || '').trim(),
          scope: String(options && options.scope || '').trim(),
          ownerId: String(options && options.ownerId || '').trim(),
          message
        });
        files.push(normalizeRemoteAttachmentDescriptor(entry, entry));
      }
    }
    return { files: files, changed: changed, errors: errors };
  }
  // ─── Seed Data ─────────────────────────────
  const appStartRuntime = getAppStartRuntimeModule().createAccess({
    getAppRouterRuntimeModule,
    getAppRouterModule,
    getAppShellOrchestrationModule,
    getShellModule,
    hasUnsavedChangesGuard,
    confirmDiscardUnsavedChanges,
    isMobileViewport,
    closeSidebar,
    refreshIcons,
    runSessionHeartbeat,
    toast,
    getAppEntryRuntimeModule,
    getAppEntryModule,
    getBootstrapCoordinator,
    getM365ApiClient,
    getAppBootstrapModule,
    recordBootstrapStep,
    installGlobalDelegation,
    renderApp,
    ensureAuthenticatedRemoteBootstrap,
    getAuthMode,
    seedData,
    ensurePrimaryAdminProfile,
    getTrainingModule,
    migrateAttachmentStores,
    getDataModule,
    ic,
    esc
  });
  const {
    handleRoute,
    setLastStableHash,
    handleHashChange,
    installAppEventListeners,
    startApp
  } = appStartRuntime;
  startApp();

})();
