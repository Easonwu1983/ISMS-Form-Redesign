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

  function getOfficialUnits() { return getUnitModule().getOfficialUnits(); }
  function getOfficialUnitCatalog() { return getUnitModule().getOfficialUnitCatalog(); }
  function getOfficialUnitMeta(unitValue) { return getUnitModule().getOfficialUnitMeta(unitValue); }
  function getUnitCode(unitValue) { return getUnitModule().getUnitCode(unitValue); }
  function getUnitCodeWithDots(unitValue) { return getUnitModule().getUnitCodeWithDots(unitValue); }
  function getUnitOptionLabel(unitValue, fallbackText) { return getUnitModule().getUnitOptionLabel(unitValue, fallbackText); }

  function getCorrectionYear(dateValue) { return getWorkflowSupportModule().getCorrectionYear(dateValue); }
  function normalizeRocYear(value, fallbackDateValue) { return getWorkflowSupportModule().normalizeRocYear(value, fallbackDateValue); }
  function buildScopedRecordPrefix(prefix, unitValue, yearValue, fallbackDateValue) { return getWorkflowSupportModule().buildScopedRecordPrefix(prefix, unitValue, yearValue, fallbackDateValue); }
  function parseScopedRecordId(value, prefix) { return getWorkflowSupportModule().parseScopedRecordId(value, prefix); }
  function buildScopedRecordId(documentNo, sequence) { return getWorkflowSupportModule().buildScopedRecordId(documentNo, sequence); }
  function getNextScopedRecordSequence(documentNo, items, parser) { return getWorkflowSupportModule().getNextScopedRecordSequence(documentNo, items, parser); }
  function buildCorrectionDocumentNo(unitValue, dateValue) { return getWorkflowSupportModule().buildCorrectionDocumentNo(unitValue, dateValue); }
  function parseCorrectionAutoId(value) { return getWorkflowSupportModule().parseCorrectionAutoId(value); }
  function buildAutoCarIdByDocument(documentNo, sequence) { return getWorkflowSupportModule().buildAutoCarIdByDocument(documentNo, sequence); }
  function buildAutoCarId(unitValue, sequence, dateValue) { return getWorkflowSupportModule().buildAutoCarId(unitValue, sequence, dateValue); }
  function getNextCorrectionSequence(documentNo, items) { return getWorkflowSupportModule().getNextCorrectionSequence(documentNo, items); }

  function getSystemUnits() { return getUnitModule().getSystemUnits(); }
  function isOfficialUnit(unit) { return getUnitModule().isOfficialUnit(unit); }

  function loadUnitReviewStore() { return getDataModule().loadUnitReviewStore(); }
  function saveUnitReviewStore(store) { return getDataModule().saveUnitReviewStore(store); }
  function loadUnitContactApplicationStore() { return getDataModule().loadUnitContactApplicationStore(); }
  function saveUnitContactApplicationStore(store) { return getDataModule().saveUnitContactApplicationStore(store); }
  function getAllUnitContactApplications() { return getDataModule().getAllUnitContactApplications(); }
  function getUnitContactApplication(id) { return getDataModule().getUnitContactApplication(id); }
  function createUnitContactApplication(application) { return getDataModule().createUnitContactApplication(application); }
  function updateUnitContactApplication(id, updates) { return getDataModule().updateUnitContactApplication(id, updates); }
  function findUnitContactApplicationsByEmail(email) { return getDataModule().findUnitContactApplicationsByEmail(email); }

  function formatUnitScopeSummary(scopes) { return getUnitModule().formatUnitScopeSummary(scopes); }
  function approveCustomUnit(unit, actor) { return getUnitModule().approveCustomUnit(unit, actor); }
  function getCustomUnitRegistry() { return getUnitModule().getCustomUnitRegistry(); }

  function syncSessionUnit(sourceUnit, targetUnit) { return getAuthModule().syncSessionUnit(sourceUnit, targetUnit); }
  function mergeCustomUnit(sourceUnit, targetUnit, actor) { return getUnitModule().mergeCustomUnit(sourceUnit, targetUnit, actor); }
  function splitUnitValue(unitValue) { return getUnitModule().splitUnitValue(unitValue); }
  function composeUnitValue(parent, child) { return getUnitModule().composeUnitValue(parent, child); }
  function categorizeTopLevelUnit(unitValue) { return getUnitModule().categorizeTopLevelUnit(unitValue); }
  function getTrainingUnitCategories() { return getUnitModule().getTrainingUnitCategories(); }
  function getParentsByUnitCategory(parents, category) { return getUnitModule().getParentsByUnitCategory(parents, category); }
  function buildUnitSearchEntry(unitValue) { return getUnitModule().buildUnitSearchEntry(unitValue); }
  function getUnitSearchEntries(extraValues) { return getUnitModule().getUnitSearchEntries(extraValues); }
  function buildUnitCascadeControl(baseId, selectedUnit, disabled, required) { return getUnitModule().buildUnitCascadeControl(baseId, selectedUnit, disabled, required); }
  function initUnitCascade(baseId, initialValue, options) { return getUnitModule().initUnitCascade(baseId, initialValue, options); }

  function parseUserUnits(value) { return getDataModule().parseUserUnits(value); }
  function normalizeUserRole(role) { return getDataModule().normalizeUserRole(role); }
  function getAuthorizedUnits(user) { return getDataModule().getAuthorizedUnits(user); }
  function getActiveUnit(user) { return getDataModule().getActiveUnit(user); }
  function normalizeUserRecord(user) { return getDataModule().normalizeUserRecord(user); }
  function hasGlobalReadScope(user = currentUser()) { return getPolicyModule().hasGlobalReadScope(user); }
  function hasUnitAccess(unit, user = currentUser()) { return getPolicyModule().hasUnitAccess(unit, user); }
  function canSwitchAuthorizedUnit(user = currentUser()) { return getAuthModule().canSwitchAuthorizedUnit(user); }
  function getScopedUnit(user = currentUser()) { return getAuthModule().getScopedUnit(user); }
  function switchCurrentUserUnit(unit) { return getAuthModule().switchCurrentUserUnit(unit); }
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
  function ensurePrimaryAdminProfile() { return getAuthModule().ensurePrimaryAdminProfile(); }
  function generatePassword() { return getAuthModule().generatePassword(); }
  function resetPasswordByEmail(email) { return getAuthModule().resetPasswordByEmail(email); }
  function loadLoginLogs() { return getDataModule().loadLoginLogs(); }
  function saveLoginLogs(logs) { return getDataModule().saveLoginLogs(logs); }
  function addLoginLog(username, user, success) { return getDataModule().addLoginLog(username, user, success); }
  function clearLoginLogs() { return getDataModule().clearLoginLogs(); }
  function login(un, pw) { return getAuthModule().login(un, pw); }
  function logout() { getAuthModule().logout(); renderApp(); }
  function currentUser() { return getAuthModule().currentUser(); }
  function isAdmin(user = currentUser()) { return getPolicyModule().isAdmin(user); }
  function isUnitAdmin(user = currentUser()) { return getPolicyModule().isUnitAdmin(user); }
  function isViewer(user = currentUser()) { return getPolicyModule().isViewer(user); }
  function canCreateCAR(user = currentUser()) { return getPolicyModule().canCreateCAR(user); }
  function canReview(user = currentUser()) { return getPolicyModule().canReview(user); }
  function canFillChecklist(user = currentUser()) { return getPolicyModule().canFillChecklist(user); }
  function canFillTraining(user = currentUser()) { return getPolicyModule().canFillTraining(user); }
  function canManageUsers(user = currentUser()) { return getPolicyModule().canManageUsers(user); }
  function fmt(d) { return getUiModule().fmt(d); }
  function fmtTime(d) { return getUiModule().fmtTime(d); }
  function isOverdue(item) { return item.status !== STATUSES.CLOSED && item.correctiveDueDate && new Date(item.correctiveDueDate) < new Date(); }
  function ic(n, c = '') { return getUiModule().ic(n, c); }
  function ntuLogo(c = '') { return getUiModule().ntuLogo(c); }
  function esc(s) { return getUiModule().esc(s); }
  function toast(msg, type = 'success') { return getUiModule().toast(msg, type); }
  function renderCopyIdButton(value, label) { return getUiModule().renderCopyIdButton(value, label); }
  function renderCopyIdCell(value, label, strong = false) { return getUiModule().renderCopyIdCell(value, label, strong); }
  function copyTextToClipboard(value, label = '編號') { return getUiModule().copyTextToClipboard(value, label); }
  function bindCopyButtons(root = document) { return getUiModule().bindCopyButtons(root); }
  function applyTestIds(map) { return getUiModule().applyTestIds(map); }
  function applySelectorTestIds(entries) { return getUiModule().applySelectorTestIds(entries); }
  function debugFlow(scope, message, data) { return getUiModule().debugFlow(scope, message, data); }
  function setUnsavedChangesGuard(active, message) { return getUiModule().setUnsavedChangesGuard(active, message); }
  function clearUnsavedChangesGuard() { return getUiModule().clearUnsavedChangesGuard(); }
  function hasUnsavedChangesGuard() { return getUiModule().hasUnsavedChangesGuard(); }
  function confirmDiscardUnsavedChanges(message, clearOnConfirm) { return getUiModule().confirmDiscardUnsavedChanges(message, clearOnConfirm); }
  function downloadJson(filename, payload) { return getUiModule().downloadJson(filename, payload); }
  const GLOBAL_ACTION_HANDLERS = Object.create(null);
  function registerActionHandlers(namespace, handlers) {
    const prefix = String(namespace || '').trim();
    Object.entries(handlers || {}).forEach(([name, handler]) => {
      if (typeof handler !== 'function') return;
      GLOBAL_ACTION_HANDLERS[prefix ? (prefix + '.' + name) : name] = handler;
    });
  }
  function closeModalRoot() {
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) modalRoot.innerHTML = '';
  }
  let globalDelegationInstalled = false;
  function installGlobalDelegation() {
    if (globalDelegationInstalled || typeof document === 'undefined') return;
    globalDelegationInstalled = true;
    document.addEventListener('click', function (event) {
      const actionEl = event.target.closest('[data-action]');
      if (actionEl) {
        const handler = GLOBAL_ACTION_HANDLERS[actionEl.dataset.action];
        if (typeof handler === 'function') {
          event.preventDefault();
          const result = handler({
            event,
            element: actionEl,
            dataset: { ...actionEl.dataset }
          });
          if (result && typeof result.then === 'function') {
            result.catch(function (error) {
              console.error(error && error.stack ? error.stack : String(error));
              toast(String(error && error.message || error || '操作失敗'), 'error');
            });
          }
          return;
        }
      }
      const dismissEl = event.target.closest('[data-dismiss-modal]');
      if (dismissEl) {
        event.preventDefault();
        closeModalRoot();
        return;
      }
      const routeEl = event.target.closest('[data-route]');
      if (routeEl) {
        const interactive = event.target.closest('a,button,input,select,textarea,label');
        if (interactive && interactive !== routeEl) return;
        const route = String(routeEl.dataset.route || '').trim();
        if (route) {
          event.preventDefault();
          navigate(route);
        }
      }
    });
  }
  function navigate(h, options) {
    const opts = options || {};
    if (!opts.allowDirtyNavigation && hasUnsavedChangesGuard()) {
      if (!confirmDiscardUnsavedChanges(opts.unsavedMessage)) return;
    }
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
  let unitModuleApi = null;
  function getUnitModule() {
    if (unitModuleApi) return unitModuleApi;
    if (typeof window === 'undefined' || typeof window.createUnitModule !== 'function') {
      throw new Error('unit-module.js not loaded');
    }
    unitModuleApi = window.createUnitModule({
      UNIT_CUSTOM_VALUE,
      UNIT_CUSTOM_LABEL,
      UNIT_ADMIN_PRIMARY_WHITELIST,
      UNIT_ACADEMIC_PRIMARY_WHITELIST,
      loadData: function () { return getDataModule().loadData(); },
      saveData: function (data) { return getDataModule().saveData(data); },
      loadChecklists: function () { return getDataModule().loadChecklists(); },
      saveChecklists: function (store) { return getDataModule().saveChecklists(store); },
      loadTrainingStore: function () { return getDataModule().loadTrainingStore(); },
      saveTrainingStore: function (store) { return getDataModule().saveTrainingStore(store); },
      loadUnitReviewStore: function () { return getDataModule().loadUnitReviewStore(); },
      saveUnitReviewStore: function (store) { return getDataModule().saveUnitReviewStore(store); },
      getAuthorizedUnits: function (user) { return getDataModule().getAuthorizedUnits(user); },
      syncSessionUnit: function (sourceUnit, targetUnit) { return getAuthModule().syncSessionUnit(sourceUnit, targetUnit); },
      isAdmin: function () { return getPolicyModule().isAdmin(); },
      esc: function (value) { return getUiModule().esc(value); }
    });
    window._unitModule = unitModuleApi;
    return unitModuleApi;
  }

  let uiModuleApi = null;
  function getUiModule() {
    if (uiModuleApi) return uiModuleApi;
    if (typeof window === 'undefined' || typeof window.createUiModule !== 'function') {
      throw new Error('ui-module.js not loaded');
    }
    uiModuleApi = window.createUiModule();
    window._uiModule = uiModuleApi;
    return uiModuleApi;
  }

  let attachmentModuleApi = null;
  function getAttachmentModule() {
    if (attachmentModuleApi) return attachmentModuleApi;
    if (typeof window === 'undefined' || typeof window.createAttachmentModule !== 'function') {
      throw new Error('attachment-module.js not loaded');
    }
    attachmentModuleApi = window.createAttachmentModule({
      esc: function (value) { return getUiModule().esc(value); },
      toast: function (message, type) { return getUiModule().toast(message, type); },
      getBackendMode: function () { return getAttachmentsMode(); },
      fetchRemoteAttachmentDetail: function (entry) { return fetchRemoteAttachmentDetail(entry); }
    });
    window._attachmentModule = attachmentModuleApi;
    return attachmentModuleApi;
  }

  let policyModuleApi = null;
  function getPolicyModule() {
    if (policyModuleApi) return policyModuleApi;
    if (typeof window === 'undefined' || typeof window.createPolicyModule !== 'function') {
      throw new Error('policy-module.js not loaded');
    }
    policyModuleApi = window.createPolicyModule({
      ROLES,
      STATUSES,
      TRAINING_STATUSES,
      TRAINING_UNDO_WINDOW_MINUTES,
      currentUser: function () { return getAuthModule().currentUser(); },
      getAuthorizedUnits: function (user) { return getDataModule().getAuthorizedUnits(user); },
      getActiveUnit: function (user) { return getDataModule().getActiveUnit(user); },
      getAllItems: function () { return getDataModule().getAllItems(); },
      getAllChecklists: function () { return getDataModule().getAllChecklists(); },
      getAllTrainingForms: function () { return getDataModule().getAllTrainingForms(); },
      isChecklistDraftStatus: function (status) { return getDataModule().isChecklistDraftStatus(status); }
    });
    window._policyModule = policyModuleApi;
    return policyModuleApi;
  }

  let workflowSupportModuleApi = null;
  function getWorkflowSupportModule() {
    if (workflowSupportModuleApi) return workflowSupportModuleApi;
    if (typeof window === 'undefined' || typeof window.createWorkflowSupportModule !== 'function') {
      throw new Error('workflow-support-module.js not loaded');
    }
    workflowSupportModuleApi = window.createWorkflowSupportModule({
      DEFAULT_USERS,
      STATUSES,
      TRAINING_GENERAL_LABEL,
      TRAINING_INFO_STAFF_LABEL,
      TRAINING_PROFESSIONAL_LABEL,
      getUnitCode,
      getOfficialUnitMeta,
      getApprovedCustomUnits: function () { return loadUnitReviewStore().approvedUnits.map((entry) => String(entry && entry.unit || '').trim()).filter(Boolean); },
      composeUnitValue,
      loadData,
      saveData,
      getTrainingRosterByUnit,
      normalizeTrainingRecordRow,
      computeTrainingSummary,
      getTrainingStatsUnit,
      getTrainingJobUnit,
      getTrainingProfessionalDisplay,
      getTrainingRecordHint,
      fmt,
      fmtTime,
      toast,
      esc
    });
    window._workflowSupportModule = workflowSupportModuleApi;
    return workflowSupportModuleApi;
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
    });
    window._dataModule = dataModuleApi;
    return dataModuleApi;
  }
  let authModuleApi = null;
  function getAuthModule() {
    if (authModuleApi) return authModuleApi;
    if (typeof window === 'undefined' || typeof window.createAuthModule !== 'function') {
      throw new Error('auth-module.js not loaded');
    }
    authModuleApi = window.createAuthModule({
      AUTH_KEY,
      ROLES,
      DEFAULT_USERS,
      loadData: function () { return getDataModule().loadData(); },
      saveData: function (data) { return getDataModule().saveData(data); },
      getAuthorizedUnits: function (user) { return getDataModule().getAuthorizedUnits(user); },
      getActiveUnit: function (user) { return getDataModule().getActiveUnit(user); },
      normalizeUserRecord: function (user) { return getDataModule().normalizeUserRecord(user); },
      findUser: function (username) { return getDataModule().findUser(username); },
      findUserByEmail: function (email) { return getDataModule().findUserByEmail(email); },
      updateUser: function (username, updates) { return getDataModule().updateUser(username, updates); },
      addLoginLog: function (username, user, success) { return getDataModule().addLoginLog(username, user, success); },
      loginWithBackend: submitBackendLogin,
      resetPasswordWithBackend: submitAuthResetPasswordByEmail
    });
    window._authModule = authModuleApi;
    return authModuleApi;
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
      submitUserUpsert,
      submitUserDelete,
      syncUsersFromM365,
      getCustomUnitRegistry,
      loadUnitReviewStore,
      formatUnitScopeSummary,
      approveCustomUnit,
      mergeCustomUnit,
      loadLoginLogs,
      clearLoginLogs,
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
      closeModalRoot
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
      submitCreateCase,
      submitRespondCase,
      submitReviewDecision,
      submitTrackingSubmission,
      submitTrackingReviewDecision,
      applyTestIds,
      applySelectorTestIds,
      debugFlow,
      registerActionHandlers
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
      syncChecklistsFromM365,
      submitChecklistDraft,
      submitChecklistForm,
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
      closeModalRoot
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
      syncTrainingFormsFromM365,
      syncTrainingRostersFromM365,
      submitTrainingDraft,
      submitTrainingStepOne,
      submitTrainingFinalize,
      submitTrainingReturn,
      submitTrainingUndo,
      submitTrainingRosterUpsert,
      submitTrainingRosterDelete,
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
      registerActionHandlers
    });
    window._trainingModule = trainingModuleApi;
    return trainingModuleApi;
  }
  let m365ApiClientApi = null;
  function getM365ApiClient() {
    if (m365ApiClientApi) return m365ApiClientApi;
    if (typeof window === 'undefined' || typeof window.createM365ApiClient !== 'function') {
      throw new Error('m365-api-client.js not loaded');
    }
    m365ApiClientApi = window.createM365ApiClient({
      UNIT_CONTACT_APPLICATION_STATUSES,
      createUnitContactApplication,
      updateUnitContactApplication,
      getUnitContactApplication,
      getAllUnitContactApplications,
      findUnitContactApplicationsByEmail,
      getOfficialUnitMeta
    });
    window._m365ApiClient = m365ApiClientApi;
    return m365ApiClientApi;
  }
  const SYSTEM_USERS_CONTRACT_VERSION = '2026-03-12';
  const SYSTEM_USER_ACTIONS = {
    UPSERT: 'system-user.upsert',
    DELETE: 'system-user.delete',
    RESET_PASSWORD: 'system-user.reset-password'
  };
  const AUTH_CONTRACT_VERSION = '2026-03-13';
  const AUTH_ACTIONS = {
    LOGIN: 'auth.login',
    RESET_PASSWORD: 'auth.reset-password-by-email'
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
  function setSystemUserRepositoryState(patch) {
    Object.assign(systemUserRepositoryState, patch || {});
    return { ...systemUserRepositoryState };
  }
  function getRuntimeM365Config() {
    return (typeof window !== 'undefined' && window.__M365_UNIT_CONTACT_CONFIG__) || {};
  }
  function getSystemUsersMode() {
    const config = getRuntimeM365Config();
    return String(config.systemUsersMode || '').trim() || 'local-emulator';
  }
  function getSystemUsersEndpoint() {
    return String(getRuntimeM365Config().systemUsersEndpoint || '').trim().replace(/\/$/, '');
  }
  function getSystemUsersHealthEndpoint() {
    const config = getRuntimeM365Config();
    const explicit = String(config.systemUsersHealthEndpoint || '').trim();
    if (explicit) return explicit;
    const endpoint = getSystemUsersEndpoint();
    return endpoint ? endpoint + '/health' : '';
  }
  function getSystemUsersSharedHeaders() {
    const config = getRuntimeM365Config();
    return config.systemUsersSharedHeaders && typeof config.systemUsersSharedHeaders === 'object' ? config.systemUsersSharedHeaders : {};
  }
  function getAuthMode() {
    const config = getRuntimeM365Config();
    const explicit = String(config.authMode || '').trim();
    if (explicit) return explicit;
    return getSystemUsersMode() === 'm365-api' ? 'm365-api' : 'local-emulator';
  }
  function getAuthEndpoint() {
    const config = getRuntimeM365Config();
    const explicit = String(config.authEndpoint || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const usersEndpoint = getSystemUsersEndpoint();
    return usersEndpoint ? usersEndpoint.replace(/\/system-users$/, '/auth') : '';
  }
  function getAuthHealthEndpoint() {
    const config = getRuntimeM365Config();
    const explicit = String(config.authHealthEndpoint || '').trim();
    if (explicit) return explicit;
    const endpoint = getAuthEndpoint();
    return endpoint ? endpoint + '/health' : '';
  }
  function getAuthSharedHeaders() {
    const config = getRuntimeM365Config();
    if (config.authSharedHeaders && typeof config.authSharedHeaders === 'object') return config.authSharedHeaders;
    return getSystemUsersSharedHeaders();
  }
  function getAttachmentsMode() {
    const config = getRuntimeM365Config();
    const explicit = String(config.attachmentsMode || '').trim();
    return explicit || 'local-emulator';
  }
  function getAttachmentsEndpoint() {
    const config = getRuntimeM365Config();
    const explicit = String(config.attachmentsEndpoint || '').trim();
    return explicit ? explicit.replace(/\/$/, '') : '';
  }
  function getAttachmentsHealthEndpoint() {
    const config = getRuntimeM365Config();
    const explicit = String(config.attachmentsHealthEndpoint || '').trim();
    if (explicit) return explicit;
    const endpoint = getAttachmentsEndpoint();
    return endpoint ? endpoint + '/health' : '';
  }
  function getAttachmentsSharedHeaders() {
    const config = getRuntimeM365Config();
    return config.attachmentsSharedHeaders && typeof config.attachmentsSharedHeaders === 'object' ? config.attachmentsSharedHeaders : {};
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
      unit: unit,
      units: units,
      activeUnit: role === ROLES.ADMIN ? '' : String(source.activeUnit || source.ActiveUnit || unit).trim(),
      createdAt: String(source.createdAt || source.CreatedAt || '').trim(),
      updatedAt: String(source.updatedAt || source.UpdatedAt || '').trim(),
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
  async function requestSystemUserJson(url, options) {
    const requestOptions = options || {};
    const config = getRuntimeM365Config();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = Number(config.unitContactRequestTimeoutMs || 15000);
    let timeoutId = null;
    if (controller && timeoutMs > 0) timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
    try {
      const response = await fetch(url, {
        method: requestOptions.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-ISMS-Contract-Version': SYSTEM_USERS_CONTRACT_VERSION,
          ...getSystemUsersSharedHeaders(),
          ...(requestOptions.headers || {})
        },
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
        throw new Error(String(parsed && (parsed.message || parsed.error || parsed.detail) || ('HTTP ' + response.status)).trim());
      }
      return parsed || { ok: true };
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('連線逾時，請稍後再試');
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
  async function requestAuthJson(path, options) {
    const endpoint = getAuthEndpoint();
    if (!endpoint) throw new Error('未設定 authEndpoint');
    const suffix = String(path || '').trim();
    const url = suffix ? (endpoint + suffix) : endpoint;
    return requestSystemUserJson(url, {
      ...(options || {}),
      headers: {
        'X-ISMS-Contract-Version': AUTH_CONTRACT_VERSION,
        ...getAuthSharedHeaders(),
        ...((options && options.headers) || {})
      }
    });
  }
  async function requestAttachmentJson(path, options) {
    const endpoint = getAttachmentsEndpoint();
    if (!endpoint) throw new Error('未設定 attachmentsEndpoint');
    const suffix = String(path || '').trim();
    const url = suffix ? (endpoint + suffix) : endpoint;
    return requestSystemUserJson(url, {
      ...(options || {}),
      headers: {
        'X-ISMS-Contract-Version': ATTACHMENT_CONTRACT_VERSION,
        ...getAttachmentsSharedHeaders(),
        ...((options && options.headers) || {})
      }
    });
  }
  function readBlobAsDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      if (!(blob instanceof Blob)) {
        reject(new Error('缺少附件內容'));
        return;
      }
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('無法讀取附件內容')); };
      reader.readAsDataURL(blob);
    });
  }
  async function resolveAttachmentBlob(entry) {
    if (entry && entry.file instanceof Blob) return entry.file;
    if (entry && typeof entry.data === 'string' && entry.data.startsWith('data:')) {
      const match = entry.data.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
      if (!match) throw new Error('附件資料格式不正確');
      const mime = String(match[1] || entry.type || 'application/octet-stream').trim();
      const raw = match[2] ? atob(match[3] || '') : decodeURIComponent(match[3] || '');
      const bytes = new Uint8Array(raw.length);
      for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
      return new Blob([bytes], { type: mime });
    }
    if (entry && entry.attachmentId && !entry.driveItemId) {
      const blob = await getAttachmentModule().readStoredBlob(entry.attachmentId);
      if (blob) return blob;
    }
    return null;
  }
  function normalizeRemoteAttachmentDescriptor(item, fallback) {
    const source = item && typeof item === 'object' ? item : {};
    const base = fallback && typeof fallback === 'object' ? fallback : {};
    const name = String(source.name || base.name || '').trim();
    const contentType = String(source.contentType || source.type || base.contentType || base.type || '').trim();
    const size = Number(source.size || base.size || 0);
    return {
      attachmentId: String(source.attachmentId || base.attachmentId || '').trim(),
      driveItemId: String(source.driveItemId || base.driveItemId || '').trim(),
      name: name,
      type: contentType,
      contentType: contentType,
      size: size,
      extension: String(source.extension || base.extension || getFileExtension(name)).trim().toLowerCase(),
      signature: String(base.signature || buildUploadSignature({ name: name, type: contentType, size: size })).trim(),
      storedAt: String(source.uploadedAt || source.storedAt || base.storedAt || new Date().toISOString()).trim(),
      uploadedAt: String(source.uploadedAt || source.storedAt || base.storedAt || new Date().toISOString()).trim(),
      scope: String(source.scope || base.scope || '').trim(),
      ownerId: String(source.ownerId || base.ownerId || '').trim(),
      recordType: String(source.recordType || base.recordType || base.scope || '').trim(),
      webUrl: String(source.webUrl || base.webUrl || '').trim(),
      downloadUrl: String(source.downloadUrl || base.downloadUrl || '').trim(),
      path: String(source.path || base.path || '').trim(),
      storage: 'm365'
    };
  }
  async function fetchRemoteAttachmentDetail(entry) {
    const descriptor = entry && typeof entry === 'object' ? entry : {};
    const driveItemId = String(descriptor.driveItemId || '').trim();
    if (!driveItemId) return descriptor;
    const body = await requestAttachmentJson('/' + encodeURIComponent(driveItemId), { method: 'GET' });
    return normalizeRemoteAttachmentDescriptor(body && body.item || {}, descriptor);
  }
  async function submitAttachmentUpload(entry, options) {
    const blob = await resolveAttachmentBlob(entry);
    if (!blob) throw new Error('找不到附件內容，無法上傳到 M365');
    const dataUrl = await readBlobAsDataUrl(blob);
    const contentBase64 = String(dataUrl.split(',')[1] || '').trim();
    if (!contentBase64) throw new Error('附件內容轉換失敗');
    const descriptor = entry && typeof entry === 'object' ? entry : {};
    const opts = options && typeof options === 'object' ? options : {};
    const body = await requestAttachmentJson('/upload', {
      method: 'POST',
      body: {
        action: ATTACHMENT_ACTIONS.UPLOAD,
        payload: {
          attachmentId: String(descriptor.attachmentId || '').trim(),
          fileName: String(descriptor.name || (entry && entry.file && entry.file.name) || 'attachment.bin').trim(),
          contentType: String(descriptor.type || descriptor.contentType || blob.type || 'application/octet-stream').trim(),
          contentBase64: contentBase64,
          scope: String(opts.scope || descriptor.scope || '').trim(),
          ownerId: String(opts.ownerId || descriptor.ownerId || '').trim(),
          recordType: String(opts.recordType || descriptor.recordType || opts.scope || descriptor.scope || '').trim()
        }
      }
    });
    return normalizeRemoteAttachmentDescriptor(body && body.item || {}, {
      ...descriptor,
      scope: String(opts.scope || descriptor.scope || '').trim(),
      ownerId: String(opts.ownerId || descriptor.ownerId || '').trim(),
      recordType: String(opts.recordType || descriptor.recordType || opts.scope || descriptor.scope || '').trim()
    });
  }
  function mergeRemoteUsersIntoStore(items) {
    const data = loadData();
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const username = String(item && item.username || '').trim().toLowerCase();
      if (!username) return;
      remoteMap.set(username, normalizeUserRecord(item));
    });
    const merged = Array.from(remoteMap.values());
    (data.users || []).forEach(function (user) {
      const username = String(user && user.username || '').trim().toLowerCase();
      if (!username || remoteMap.has(username)) return;
      merged.push(normalizeUserRecord(user));
    });
    data.users = merged;
    saveData(data);
    return data.users.slice();
  }
  function upsertSystemUserInStore(item) {
    if (!item || !item.username) return null;
    const data = loadData();
    const normalized = normalizeUserRecord(item);
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
    return detail ? ('M365 帳號後端未就緒，已改用本機暫存：' + detail) : 'M365 帳號後端未就緒，已改用本機暫存。';
  }
  async function syncUsersFromM365(options) {
    const opts = options || {};
    const mode = getSystemUsersMode();
    setSystemUserRepositoryState({ mode: mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (mode !== 'm365-api') {
      return setSystemUserRepositoryState({ ready: false, message: '目前使用本機帳號模式', error: '' });
    }
    try {
      const healthEndpoint = getSystemUsersHealthEndpoint();
      if (healthEndpoint) {
        const health = await requestSystemUserJson(healthEndpoint, { method: 'GET' });
        if (health && health.ready === false) {
          return setSystemUserRepositoryState({
            ready: false,
            source: 'local-fallback',
            message: String(health.message || 'M365 帳號後端尚未就緒，系統維持本機資料模式'),
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
      mergeRemoteUsersIntoStore(normalizeRemoteSystemUsers(body));
      return setSystemUserRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: new Date().toISOString(),
        message: '已同步 M365 帳號資料',
        error: ''
      });
    } catch (error) {
      return setSystemUserRepositoryState({
        ready: false,
        source: 'local-fallback',
        message: 'M365 帳號後端尚未就緒，系統維持本機資料模式',
        error: String(error && error.message || error || '')
      });
    }
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
    if (getSystemUsersMode() !== 'm365-api') {
      if (existing) {
        updateUser(requestPayload.username, {
          ...requestPayload,
          password: requestPayload.password || String(existing.password || '').trim()
        });
      }
      else addUser(requestPayload);
      return { ok: true, item: findUser(requestPayload.username) || requestPayload, source: 'local' };
    }
    try {
      const body = await requestSystemUserJson(getSystemUsersEndpoint() + '/upsert', {
        method: 'POST',
        body: buildSystemUserEnvelope(SYSTEM_USER_ACTIONS.UPSERT, requestPayload)
      });
      const stored = upsertSystemUserInStore(normalizeRemoteSystemUsers(body)[0] || requestPayload);
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '帳號資料已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      if (existing) updateUser(requestPayload.username, requestPayload);
      else addUser(requestPayload);
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 帳號後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: findUser(requestPayload.username) || requestPayload, source: 'local-fallback', warning: buildSystemUserFallbackWarning(error) };
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
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '帳號刪除已寫入 M365', error: '' });
      return { ok: true, deletedId: cleanUsername, source: 'remote' };
    } catch (error) {
      deleteSystemUserFromStore(cleanUsername);
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 帳號後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, deletedId: cleanUsername, source: 'local-fallback', warning: buildSystemUserFallbackWarning(error) };
    }
  }
  async function submitUserResetPassword(payload) {
    const input = payload && typeof payload === 'object' ? payload : {};
    const matchedUser = input.username ? findUser(input.username) : findUserByEmail(input.email);
    const username = String(input.username || (matchedUser && matchedUser.username) || '').trim();
    if (!username) return null;
    const fallbackPassword = String(input.password || '').trim() || generatePassword();
    if (getSystemUsersMode() !== 'm365-api') {
      updateUser(username, { password: fallbackPassword });
      return { user: normalizeUserRecord(findUser(username) || matchedUser), password: fallbackPassword, source: 'local' };
    }
    try {
      const body = await requestSystemUserJson(getSystemUsersEndpoint() + '/' + encodeURIComponent(username) + '/reset-password', {
        method: 'POST',
        body: buildSystemUserEnvelope(SYSTEM_USER_ACTIONS.RESET_PASSWORD, input)
      });
      const item = normalizeRemoteSystemUsers(body)[0] || { ...(matchedUser || {}), username: username, password: String(body && body.password || fallbackPassword).trim() };
      const stored = upsertSystemUserInStore({ ...item, password: String(body && body.password || item.password || fallbackPassword).trim() });
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '密碼重設已寫入 M365', error: '' });
      return { user: stored, password: String(body && body.password || fallbackPassword).trim(), source: 'remote' };
    } catch (error) {
      updateUser(username, { password: fallbackPassword });
      setSystemUserRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 帳號後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { user: normalizeUserRecord(findUser(username) || matchedUser), password: fallbackPassword, source: 'local-fallback', warning: buildSystemUserFallbackWarning(error) };
    }
  }
  async function submitBackendLogin(username, password) {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();
    if (!cleanUsername || !cleanPassword) return null;

    if (getAuthMode() !== 'm365-api') {
      const localUser = findUser(cleanUsername);
      if (!localUser || String(localUser.password || '') !== cleanPassword) return null;
      return normalizeUserRecord(localUser);
    }

    const healthEndpoint = getAuthHealthEndpoint();
    if (healthEndpoint) {
      const health = await requestAuthJson('/health', { method: 'GET' });
      if (health && health.ready === false) {
        throw new Error(String(health.message || 'M365 登入後端尚未就緒').trim());
      }
    }

    try {
      const body = await requestAuthJson('/login', {
        method: 'POST',
        body: {
          action: AUTH_ACTIONS.LOGIN,
          payload: {
            username: cleanUsername,
            password: cleanPassword
          }
        }
      });
      const item = normalizeRemoteSystemUsers(body)[0];
      return item ? normalizeUserRecord(item) : null;
    } catch (error) {
      const message = String(error && error.message || error || '').trim();
      if (message === 'Invalid username or password') return null;
      throw error;
    }
  }
  async function submitAuthResetPasswordByEmail(email) {
    const cleanMail = String(email || '').trim().toLowerCase();
    if (!cleanMail) return null;

    if (getAuthMode() !== 'm365-api') {
      return submitUserResetPassword({ email: cleanMail });
    }

    const healthEndpoint = getAuthHealthEndpoint();
    if (healthEndpoint) {
      const health = await requestAuthJson('/health', { method: 'GET' });
      if (health && health.ready === false) {
        throw new Error(String(health.message || 'M365 登入後端尚未就緒').trim());
      }
    }

    try {
      const body = await requestAuthJson('/reset-password', {
        method: 'POST',
        body: {
          action: AUTH_ACTIONS.RESET_PASSWORD,
          payload: {
            email: cleanMail
          }
        }
      });
      const item = normalizeRemoteSystemUsers(body)[0] || { email: cleanMail };
      const stored = upsertSystemUserInStore({
        ...item,
        password: String(body && body.password || '').trim()
      });
      return {
        user: stored,
        password: String(body && body.password || '').trim(),
        source: 'remote'
      };
    } catch (error) {
      const message = String(error && error.message || error || '').trim();
      if (message === 'System user not found') return null;
      throw error;
    }
  }
  const correctiveActionRepositoryState = {
    mode: 'local-emulator',
    ready: false,
    source: 'local',
    lastSyncAt: '',
    message: '',
    error: ''
  };
  function setCorrectiveActionRepositoryState(patch) {
    Object.assign(correctiveActionRepositoryState, patch || {});
    return { ...correctiveActionRepositoryState };
  }
  function getCorrectiveActionRepositoryState() {
    return { ...correctiveActionRepositoryState };
  }
  function mergeRemoteCorrectiveActionsIntoStore(items) {
    const data = loadData();
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      remoteMap.set(id, item);
    });
    const merged = Array.from(remoteMap.values());
    (data.items || []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id || remoteMap.has(id)) return;
      merged.push(item);
    });
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
    return detail ? ('M365 矯正單後端未就緒，已改用本機暫存：' + detail) : 'M365 矯正單後端未就緒，已改用本機暫存。';
  }
  async function syncCorrectiveActionsFromM365(options) {
    const opts = options || {};
    const client = getM365ApiClient();
    const mode = client.getCorrectiveActionMode();
    setCorrectiveActionRepositoryState({ mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (mode !== 'm365-api') {
      return setCorrectiveActionRepositoryState({
        ready: false,
        message: '目前使用本機暫存模式',
        error: ''
      });
    }
    try {
      const health = await client.getCorrectiveActionHealth();
      if (health && health.ready === false) {
        return setCorrectiveActionRepositoryState({
          ready: false,
          source: 'local-fallback',
          message: String(health.message || 'M365 矯正單後端尚未就緒，系統維持本機資料模式'),
          error: String(health.message || '')
        });
      }
      const response = await client.listCorrectiveActions(opts.query);
      mergeRemoteCorrectiveActionsIntoStore(response.items || []);
      return setCorrectiveActionRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: new Date().toISOString(),
        message: '已同步 M365 矯正單資料',
        error: ''
      });
    } catch (error) {
      return setCorrectiveActionRepositoryState({
        ready: false,
        source: 'local-fallback',
        message: 'M365 矯正單後端尚未就緒，系統維持本機資料模式',
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
        message: '矯正單已寫入 M365',
        error: ''
      });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      addItem(item);
      setCorrectiveActionRepositoryState({
        mode: 'm365-api',
        source: 'local-fallback',
        ready: false,
        message: 'M365 矯正單後端尚未就緒，已改用本機暫存',
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
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '矯正單回覆已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalCorrectiveActionUpdate(id, fallbackUpdates);
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 矯正單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '矯正單審核狀態已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalCorrectiveActionUpdate(id, fallbackUpdates);
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 矯正單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '追蹤提報已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalCorrectiveActionUpdate(id, fallbackUpdates);
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 矯正單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastSyncAt: new Date().toISOString(), message: '追蹤審核已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalCorrectiveActionUpdate(id, fallbackUpdates);
      setCorrectiveActionRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 矯正單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
  function setChecklistRepositoryState(patch) {
    Object.assign(checklistRepositoryState, patch || {});
    return { ...checklistRepositoryState };
  }
  function getChecklistRepositoryState() {
    return { ...checklistRepositoryState };
  }
  function mergeRemoteChecklistsIntoStore(items) {
    const store = loadChecklists();
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      remoteMap.set(id, item);
    });
    const merged = Array.from(remoteMap.values());
    (store.items || []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id || remoteMap.has(id)) return;
      merged.push(item);
    });
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
    return detail ? ('M365 檢核表後端未就緒，已改用本機暫存：' + detail) : 'M365 檢核表後端未就緒，已改用本機暫存。';
  }
  async function syncChecklistsFromM365(options) {
    const opts = options || {};
    const client = getM365ApiClient();
    const mode = client.getChecklistMode();
    setChecklistRepositoryState({ mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (mode !== 'm365-api') {
      return setChecklistRepositoryState({
        ready: false,
        message: '目前使用本機暫存模式',
        error: ''
      });
    }
    try {
      const health = await client.getChecklistHealth();
      if (health && health.ready === false) {
        return setChecklistRepositoryState({
          ready: false,
          source: 'local-fallback',
          message: String(health.message || 'M365 檢核表後端尚未就緒，系統維持本機資料模式'),
          error: String(health.message || '')
        });
      }
      const response = await client.listChecklists(opts.query);
      mergeRemoteChecklistsIntoStore(response.items || []);
      return setChecklistRepositoryState({
        ready: true,
        source: 'remote',
        lastSyncAt: new Date().toISOString(),
        message: '已同步 M365 檢核表資料',
        error: ''
      });
    } catch (error) {
      return setChecklistRepositoryState({
        ready: false,
        source: 'local-fallback',
        message: 'M365 檢核表後端尚未就緒，系統維持本機資料模式',
        error: String(error && error.message || error || '')
      });
    }
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
        message: '檢核表草稿已寫入 M365',
        error: ''
      });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalChecklist(payload);
      setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'local-fallback',
        ready: false,
        message: 'M365 檢核表後端尚未就緒，已改用本機暫存',
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
        message: '檢核表已寫入 M365',
        error: ''
      });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalChecklist(payload);
      setChecklistRepositoryState({
        mode: 'm365-api',
        source: 'local-fallback',
        ready: false,
        message: 'M365 檢核表後端尚未就緒，已改用本機暫存',
        error: String(error && error.message || error || '')
      });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildChecklistFallbackWarning(error) };
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
  function setTrainingRepositoryState(patch) {
    Object.assign(trainingRepositoryState, patch || {});
    return { ...trainingRepositoryState };
  }
  function mergeRemoteTrainingFormsIntoStore(items) {
    const store = loadTrainingStore();
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      remoteMap.set(id, item);
    });
    const merged = Array.from(remoteMap.values());
    (store.forms || []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id || remoteMap.has(id)) return;
      merged.push(item);
    });
    store.forms = merged;
    saveTrainingStore(store);
    return store.forms.slice();
  }
  function mergeRemoteTrainingRostersIntoStore(items) {
    const store = loadTrainingStore();
    const remoteMap = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id) return;
      remoteMap.set(id, item);
    });
    const merged = Array.from(remoteMap.values());
    (store.rosters || []).forEach(function (item) {
      const id = String(item && item.id || '').trim();
      if (!id || remoteMap.has(id)) return;
      merged.push(item);
    });
    store.rosters = merged;
    saveTrainingStore(store);
    return store.rosters.slice();
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
  function persistLocalTrainingForm(payload) {
    return upsertTrainingFormInStore(payload);
  }
  function buildTrainingFallbackWarning(error) {
    const detail = String(error && error.message || error || '').trim();
    return detail ? ('M365 教育訓練後端未就緒，已改用本機暫存：' + detail) : 'M365 教育訓練後端未就緒，已改用本機暫存。';
  }
  async function syncTrainingFormsFromM365(options) {
    const opts = options || {};
    const client = getM365ApiClient();
    const mode = client.getTrainingMode();
    setTrainingRepositoryState({ mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (mode !== 'm365-api') {
      return setTrainingRepositoryState({ ready: false, message: '目前使用本機暫存模式', error: '' });
    }
    try {
      const health = await client.getTrainingHealth();
      if (health && health.ready === false) {
        return setTrainingRepositoryState({
          ready: false,
          source: 'local-fallback',
          message: String(health.message || 'M365 教育訓練後端尚未就緒，系統維持本機資料模式'),
          error: String(health.message || '')
        });
      }
      const response = await client.listTrainingForms(opts.query);
      mergeRemoteTrainingFormsIntoStore(response.items || []);
      return setTrainingRepositoryState({
        ready: true,
        source: 'remote',
        lastFormsSyncAt: new Date().toISOString(),
        message: '已同步 M365 教育訓練資料',
        error: ''
      });
    } catch (error) {
      return setTrainingRepositoryState({
        ready: false,
        source: 'local-fallback',
        message: 'M365 教育訓練後端尚未就緒，系統維持本機資料模式',
        error: String(error && error.message || error || '')
      });
    }
  }
  async function syncTrainingRostersFromM365(options) {
    const opts = options || {};
    const client = getM365ApiClient();
    const mode = client.getTrainingMode();
    setTrainingRepositoryState({ mode, source: mode === 'm365-api' ? 'remote' : 'local' });
    if (mode !== 'm365-api') {
      return setTrainingRepositoryState({ ready: false, message: '目前使用本機暫存模式', error: '' });
    }
    try {
      const health = await client.getTrainingHealth();
      if (health && health.ready === false) {
        return setTrainingRepositoryState({
          ready: false,
          source: 'local-fallback',
          message: String(health.message || 'M365 教育訓練後端尚未就緒，系統維持本機資料模式'),
          error: String(health.message || '')
        });
      }
      const response = await client.listTrainingRosters(opts.query);
      mergeRemoteTrainingRostersIntoStore(response.items || []);
      return setTrainingRepositoryState({
        ready: true,
        source: 'remote',
        lastRostersSyncAt: new Date().toISOString(),
        message: '已同步 M365 教育訓練名單',
        error: ''
      });
    } catch (error) {
      return setTrainingRepositoryState({
        ready: false,
        source: 'local-fallback',
        message: 'M365 教育訓練名單後端尚未就緒，系統維持本機資料模式',
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
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練草稿已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練流程一已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練結案已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練退回已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastFormsSyncAt: new Date().toISOString(), message: '教育訓練撤回已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = persistLocalTrainingForm(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 教育訓練後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
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
      const stored = upsertTrainingRosterInStore(response.item || payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastRostersSyncAt: new Date().toISOString(), message: '教育訓練名單已寫入 M365', error: '' });
      return { ok: true, item: stored, source: 'remote' };
    } catch (error) {
      const stored = upsertTrainingRosterInStore(payload);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 教育訓練名單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, item: stored, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
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
      setTrainingRepositoryState({ mode: 'm365-api', source: 'remote', ready: true, lastRostersSyncAt: new Date().toISOString(), message: '教育訓練名單刪除已寫入 M365', error: '' });
      return { ok: true, deletedId: cleanId, source: 'remote' };
    } catch (error) {
      deleteTrainingRosterFromStore(cleanId);
      setTrainingRepositoryState({ mode: 'm365-api', source: 'local-fallback', ready: false, message: 'M365 教育訓練名單後端尚未就緒，已改用本機暫存', error: String(error && error.message || error || '') });
      return { ok: true, deletedId: cleanId, source: 'local-fallback', warning: buildTrainingFallbackWarning(error) };
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
      submitUnitContactApplication: function (payload) { return getM365ApiClient().submitUnitContactApplication(payload); },
      getUnitContactApplication: function (id) { return getM365ApiClient().getUnitContactApplication(id); },
      lookupUnitContactApplicationsByEmail: function (email) { return getM365ApiClient().lookupUnitContactApplicationsByEmail(email); }
    });
    window._unitContactApplicationModule = unitContactApplicationModuleApi;
    return unitContactApplicationModuleApi;
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
      resetPasswordByEmail,
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
      switchCurrentUserUnit,
      hasUnsavedChangesGuard,
      confirmDiscardUnsavedChanges,
      registerActionHandlers
    });
    window._shellModule = shellModuleApi;
    return shellModuleApi;
  }
  const ROUTE_WHITELIST = {
    'apply-unit-contact': { title: '申請單位資安窗口', public: true, allow: () => true, fallback: 'apply-unit-contact', render: () => getUnitContactApplicationModule().renderApplyForm() },
    'apply-unit-contact-success': { title: '申請已送出', public: true, allow: () => true, fallback: 'apply-unit-contact', render: (param) => getUnitContactApplicationModule().renderApplySuccess(param) },
    'apply-unit-contact-status': { title: '查詢申請進度', public: true, allow: () => true, fallback: 'apply-unit-contact', render: () => getUnitContactApplicationModule().renderApplyStatus() },
    'activate-unit-contact': { title: '窗口帳號開通', public: true, allow: () => true, fallback: 'apply-unit-contact', render: (param) => getUnitContactApplicationModule().renderActivate(param) },
    dashboard: { title: '\u5100\u8868\u677f', allow: () => !!currentUser(), render: () => getCaseModule().renderDashboard() },
    list: { title: '\u77ef\u6b63\u55ae\u5217\u8868', allow: () => !!currentUser(), render: () => getCaseModule().renderList() },
    create: { title: '\u958b\u7acb\u77ef\u6b63\u55ae', allow: () => canCreateCAR(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u958b\u7acb\u77ef\u6b63\u55ae\u6b0a\u9650', render: () => getCaseModule().renderCreate() },
    detail: { title: '\u77ef\u6b63\u55ae\u8a73\u60c5', allow: () => !!currentUser(), render: (param) => getCaseModule().renderDetail(param) },
    respond: { title: '\u56de\u586b\u77ef\u6b63\u63aa\u65bd', allow: () => !!currentUser(), render: (param) => getCaseModule().renderRespond(param) },
    tracking: { title: '\u8ffd\u8e64\u76e3\u63a7', allow: () => !!currentUser(), render: (param) => getCaseModule().renderTracking(param) },
    users: { title: '\u5e33\u865f\u7ba1\u7406', allow: () => canManageUsers(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u5e33\u865f\u7ba1\u7406\u6b0a\u9650', render: () => getAdminModule().renderUsers() },
    'login-log': { title: '\u767b\u5165\u7d00\u9304', allow: () => canManageUsers(), fallback: 'dashboard', deniedMessage: '\u60a8\u6c92\u6709\u6aa2\u8996\u767b\u5165\u7d00\u9304\u6b0a\u9650', render: () => getAdminModule().renderLoginLog() },
    'schema-health': { title: '\u8cc7\u6599\u5065\u5eb7\u6aa2\u67e5', allow: () => isAdmin(), fallback: 'dashboard', deniedMessage: '\u50c5\u6700\u9ad8\u7ba1\u7406\u8005\u53ef\u6aa2\u8996\u8cc7\u6599\u5065\u5eb7\u8cc7\u8a0a', render: () => getAdminModule().renderSchemaHealth() },
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
  function refreshIcons() { return getUiModule().refreshIcons(); }
  function getVisibleItems(user = currentUser()) { return getPolicyModule().getVisibleItems(user); }
  function canAccessItem(item, user = currentUser()) { return getPolicyModule().canAccessItem(item, user); }
  function isItemHandler(item, user = currentUser()) { return getPolicyModule().isItemHandler(item, user); }
  function canRespondItem(item, user = currentUser()) { return getPolicyModule().canRespondItem(item, user); }
  function canSubmitTracking(item, user = currentUser()) { return getPolicyModule().canSubmitTracking(item, user); }
  
  function toTestIdFragment(value) { return getUiModule().toTestIdFragment(value); }

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
  function mkChk(name, opts, sel) { return getUiModule().mkChk(name, opts, sel); }
  function mkRadio(name, opts, sel) { return getUiModule().mkRadio(name, opts, sel); }
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
  function resetChecklistSections() { return saveChecklistSections(JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_SECTIONS))); }

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
  function buildChecklistDocumentNo(unit, auditYear, fillDate) { return getWorkflowSupportModule().buildChecklistDocumentNo(unit, auditYear, fillDate); }
  function parseChecklistId(value) { return getWorkflowSupportModule().parseChecklistId(value); }
  function buildChecklistIdByDocument(documentNo, sequence) { return getWorkflowSupportModule().buildChecklistIdByDocument(documentNo, sequence); }
  function getNextChecklistSequence(documentNo, items) { return getWorkflowSupportModule().getNextChecklistSequence(documentNo, items); }
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
  function isChecklistOwner(cl, user = currentUser()) { return getPolicyModule().isChecklistOwner(cl, user); }
  function canAccessChecklist(cl, user = currentUser()) { return getPolicyModule().canAccessChecklist(cl, user); }
  function getVisibleChecklists(user = currentUser()) { return getPolicyModule().getVisibleChecklists(user); }
  function canEditChecklist(cl, user = currentUser()) { return getPolicyModule().canEditChecklist(cl, user); }

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

  function buildTrainingFormDocumentNo(unit, trainingYear, fillDate) { return getWorkflowSupportModule().buildTrainingFormDocumentNo(unit, trainingYear, fillDate); }
  function parseTrainingFormId(value) { return getWorkflowSupportModule().parseTrainingFormId(value); }
  function buildTrainingFormIdByDocument(documentNo, sequence) { return getWorkflowSupportModule().buildTrainingFormIdByDocument(documentNo, sequence); }
  function getNextTrainingFormSequence(documentNo, forms) { return getWorkflowSupportModule().getNextTrainingFormSequence(documentNo, forms); }

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

  function getVisibleTrainingForms(user = currentUser()) { return getPolicyModule().getVisibleTrainingForms(user); }
  function canEditTrainingForm(form, user = currentUser()) { return getPolicyModule().canEditTrainingForm(form, user); }
  function canManageTrainingForm(form, user = currentUser()) { return getPolicyModule().canManageTrainingForm(form, user); }
  function isTrainingManualRowOwner(row, user = currentUser()) { return getPolicyModule().isTrainingManualRowOwner(row, user); }
  function canDeleteTrainingEditableRow(row, form, user = currentUser()) { return getPolicyModule().canDeleteTrainingEditableRow(row, form, user); }
  function getTrainingUndoRemainingMs(form, now = Date.now()) { return getPolicyModule().getTrainingUndoRemainingMs(form, now); }
  function getTrainingUndoRemainingMinutes(form, now = Date.now()) { return getPolicyModule().getTrainingUndoRemainingMinutes(form, now); }
  function canUndoTrainingForm(form, user = currentUser()) { return getPolicyModule().canUndoTrainingForm(form, user); }
  function isTrainingVisible(form, user = currentUser()) { return getPolicyModule().isTrainingVisible(form, user); }

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

  function getFileExtension(name) { return getWorkflowSupportModule().getFileExtension(name); }
  function buildUploadSignature(meta) { return getWorkflowSupportModule().buildUploadSignature(meta); }
  function validateUploadFile(file, options) { return getWorkflowSupportModule().validateUploadFile(file, options); }
  function prepareUploadBatch(existingFiles, incomingFiles, options) { return getWorkflowSupportModule().prepareUploadBatch(existingFiles, incomingFiles, options); }
  function createTransientUploadEntry(file, meta, options) { return getAttachmentModule().createTransientUploadEntry(file, meta, options); }
  function revokeTransientUploadEntry(entry) { return getAttachmentModule().revokeTransientUploadEntry(entry); }
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
    for (const entry of list) {
      if (!entry) continue;
      if (entry.driveItemId && !entry.file && !entry.data) {
        files.push(normalizeRemoteAttachmentDescriptor(entry, entry));
        continue;
      }
      changed = true;
      files.push(await submitAttachmentUpload(entry, options));
    }
    return { files: files, changed: changed };
  }
  function renderAttachmentList(target, files, options) { return getAttachmentModule().renderAttachmentList(target, files, options); }
  function cleanupRenderedAttachmentUrls() { return getAttachmentModule().cleanupRenderedAttachmentUrls(); }
  function collectReferencedAttachmentIds() {
    const ids = new Set();
    const pushFiles = function (files) {
      (Array.isArray(files) ? files : []).forEach(function (file) {
        const attachmentId = String(file && file.attachmentId || '').trim();
        if (attachmentId) ids.add(attachmentId);
      });
    };
    const data = loadData();
    (data.items || []).forEach(function (item) {
      pushFiles(item && item.evidence);
      pushFiles(item && item.pendingTracking && item.pendingTracking.evidence);
      (item && item.trackings || []).forEach(function (tracking) {
        pushFiles(tracking && tracking.evidence);
      });
    });
    const trainingStore = loadTrainingStore();
    (trainingStore.forms || []).forEach(function (form) {
      pushFiles(form && form.signedFiles);
    });
    return Array.from(ids);
  }
  function getAttachmentHealth() { return getAttachmentModule().getAttachmentHealth(collectReferencedAttachmentIds()); }
  function pruneOrphanAttachments() { return getAttachmentModule().pruneUnusedAttachments(collectReferencedAttachmentIds()); }
  async function exportSupportBundle() {
    return {
      generatedAt: new Date().toISOString(),
      schemaHealth: getDataModule().getSchemaHealth(),
      attachmentHealth: await getAttachmentHealth(),
      stores: getDataModule().exportManagedStoreSnapshot()
    };
  }
  function csvCell(value) { return getWorkflowSupportModule().csvCell(value); }
  function downloadWorkbook(filename, sheets) { return getWorkflowSupportModule().downloadWorkbook(filename, sheets); }
  function exportTrainingSummaryCsv(forms, filename) { return getWorkflowSupportModule().exportTrainingSummaryCsv(forms, filename); }
  function exportTrainingDetailCsv(form) { return getWorkflowSupportModule().exportTrainingDetailCsv(form); }
  function getRocDateParts(value) { return getWorkflowSupportModule().getRocDateParts(value); }
  function buildTrainingPrintHtml(payload) { return getWorkflowSupportModule().buildTrainingPrintHtml(payload); }
  function printTrainingSheet(payload) { return getWorkflowSupportModule().printTrainingSheet(payload); }
  function normalizeTrainingImportHeader(value) { return getWorkflowSupportModule().normalizeTrainingImportHeader(value); }
  function buildTrainingRosterHeaderMap(cells) { return getWorkflowSupportModule().buildTrainingRosterHeaderMap(cells); }
  function resolveTrainingImportTargetUnit(defaultUnit, rawUnit, rawStatsUnit) { return getWorkflowSupportModule().resolveTrainingImportTargetUnit(defaultUnit, rawUnit, rawStatsUnit); }
  function parseTrainingRosterCells(cells, unit, headerMap) { return getWorkflowSupportModule().parseTrainingRosterCells(cells, unit, headerMap); }
  function parseTrainingRosterImport(text, unit) { return getWorkflowSupportModule().parseTrainingRosterImport(text, unit); }
  function parseTrainingRosterWorkbook(file, unit) { return getWorkflowSupportModule().parseTrainingRosterWorkbook(file, unit); }
  function mergeTrainingRows(targetUnit, carryRows) { return getWorkflowSupportModule().mergeTrainingRows(targetUnit, carryRows); }


  function handleRoute() { return getShellModule().handleRoute(); }

  // ─── Seed Data ─────────────────────────────
  function seedData() { return getWorkflowSupportModule().seedData(); }

  async function migrateCaseAttachmentTree(item) {
    if (!item || typeof item !== 'object') return false;
    let changed = false;
    const caseEvidence = await migrateStoredAttachments(item.evidence || [], { prefix: 'car', scope: 'case-evidence', ownerId: item.id });
    if (caseEvidence.changed) {
      item.evidence = caseEvidence.files;
      changed = true;
    }
    if (item.pendingTracking && typeof item.pendingTracking === 'object') {
      const pendingEvidence = await migrateStoredAttachments(item.pendingTracking.evidence || [], { prefix: 'trk', scope: 'tracking-evidence', ownerId: item.id });
      if (pendingEvidence.changed) {
        item.pendingTracking = { ...item.pendingTracking, evidence: pendingEvidence.files };
        changed = true;
      }
    }
    if (Array.isArray(item.trackings)) {
      const nextTrackings = [];
      let trackingsChanged = false;
      for (const tracking of item.trackings) {
        const migrated = await migrateStoredAttachments(tracking && tracking.evidence || [], { prefix: 'trk', scope: 'tracking-evidence', ownerId: item.id });
        if (migrated.changed) {
          nextTrackings.push({ ...tracking, evidence: migrated.files });
          trackingsChanged = true;
        } else {
          nextTrackings.push(tracking);
        }
      }
      if (trackingsChanged) {
        item.trackings = nextTrackings;
        changed = true;
      }
    }
    return changed;
  }

  async function migrateAttachmentStores() {
    let dataChanged = false;
    const data = loadData();
    for (const item of data.items || []) {
      if (await migrateCaseAttachmentTree(item)) dataChanged = true;
    }
    if (dataChanged) saveData(data);

    let trainingChanged = false;
    const trainingStore = loadTrainingStore();
    for (const form of trainingStore.forms || []) {
      const migrated = await migrateStoredAttachments(form && form.signedFiles || [], { prefix: 'trn', scope: 'training-signoff', ownerId: form.id });
      if (migrated.changed) {
        form.signedFiles = migrated.files;
        trainingChanged = true;
      }
    }
    if (trainingChanged) saveTrainingStore(trainingStore);
  }

  let lastStableHash = '';
  let suppressHashGuard = false;
  function handleHashChange() {
    const nextHash = window.location.hash || '#dashboard';
    if (suppressHashGuard) {
      suppressHashGuard = false;
      handleRoute();
      lastStableHash = window.location.hash || '#dashboard';
      return;
    }
    if (nextHash !== lastStableHash && hasUnsavedChangesGuard()) {
      const ok = confirmDiscardUnsavedChanges('目前有未儲存的變更，確定要離開此頁嗎？');
      if (!ok) {
        suppressHashGuard = true;
        window.history.replaceState(null, '', lastStableHash || '#dashboard');
        return;
      }
    }
    handleRoute();
    lastStableHash = window.location.hash || '#dashboard';
  }

  async function initApp() {
    installGlobalDelegation();
    getDataModule().migrateAllStores();
    seedData();
    ensurePrimaryAdminProfile();
    await syncUsersFromM365({ silent: true });
    getTrainingModule().seedTrainingData();
    await migrateAttachmentStores();
    await syncTrainingFormsFromM365({ silent: true });
    await syncTrainingRostersFromM365({ silent: true });
    await syncChecklistsFromM365({ silent: true });
    await syncCorrectiveActionsFromM365({ silent: true });
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('resize', function () { if (!isMobileViewport()) closeSidebar(); });
    window.addEventListener('load', refreshIcons);
    renderApp();
    lastStableHash = window.location.hash || '#dashboard';
    refreshIcons();
    if (typeof window !== 'undefined') {
      window.__APP_READY__ = true;
    }
  }

  // ─── Init ──────────────────────────────────
  initApp().catch(function (error) {
    console.error(error && error.stack ? error.stack : String(error));
    document.getElementById('app').innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + ic('alert-triangle', 'icon-lg') + '</div><div class="empty-state-title">系統初始化失敗</div><div class="empty-state-desc">' + esc(String(error && error.message || error || '未知錯誤')) + '</div></div>';
    if (typeof window !== 'undefined') {
      window.__APP_READY__ = true;
    }
  });

})();

