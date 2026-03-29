(function () {
  window.createAppPageOrchestrationModule = function createAppPageOrchestrationModule() {
    function buildRouteWhitelist(deps) {
      const d = deps && typeof deps === 'object' ? deps : {};

      function ensureModule(loader, getter) {
        if (typeof loader === 'function') {
          return Promise.resolve().then(loader);
        }
        return Promise.resolve().then(getter);
      }

      return {
        'apply-unit-contact': {
          title: '單位管理人申請',
          public: true,
          allow: () => true,
          fallback: 'apply-unit-contact',
          render: () => ensureModule(d.ensureUnitContactApplicationModule, d.getUnitContactApplicationModule).then((module) => module.renderApplyForm())
        },
        'apply-unit-contact-success': {
          title: '申請送出',
          public: true,
          allow: () => true,
          fallback: 'apply-unit-contact',
          requiresParam: true,
          render: (param) => ensureModule(d.ensureUnitContactApplicationModule, d.getUnitContactApplicationModule).then((module) => module.renderApplySuccess(param))
        },
        'apply-unit-contact-status': {
          title: '申請進度查詢',
          public: true,
          allow: () => true,
          fallback: 'apply-unit-contact',
          render: () => ensureModule(d.ensureUnitContactApplicationModule, d.getUnitContactApplicationModule).then((module) => module.renderApplyStatus())
        },
        'activate-unit-contact': {
          title: '帳號啟用',
          public: true,
          allow: () => true,
          fallback: 'apply-unit-contact',
          requiresParam: true,
          render: (param) => ensureModule(d.ensureUnitContactApplicationModule, d.getUnitContactApplicationModule).then((module) => module.renderActivate(param))
        },
        dashboard: {
          title: '儀表板',
          allow: () => !!d.currentUser(),
          render: () => ensureModule(d.ensureCaseModule, d.getCaseModule).then((module) => module.renderDashboard())
        },
        list: {
          title: '矯正單列表',
          allow: () => !!d.currentUser(),
          render: () => ensureModule(d.ensureCaseModule, d.getCaseModule).then((module) => module.renderList())
        },
        create: {
          title: '新增矯正單',
          allow: () => d.canCreateCAR(),
          fallback: 'dashboard',
          deniedMessage: '目前角色無法新增矯正單',
          render: () => ensureModule(d.ensureCaseModule, d.getCaseModule).then((module) => module.renderCreate())
        },
        detail: {
          title: '矯正單詳情',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => ensureModule(d.ensureCaseModule, d.getCaseModule).then((module) => module.renderDetail(param))
        },
        respond: {
          title: '矯正單回覆',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => ensureModule(d.ensureCaseModule, d.getCaseModule).then((module) => module.renderRespond(param))
        },
        tracking: {
          title: '追蹤管考',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => ensureModule(d.ensureCaseModule, d.getCaseModule).then((module) => module.renderTracking(param))
        },
        users: {
          title: '帳號管理',
          allow: () => d.canManageUsers(),
          fallback: 'dashboard',
          deniedMessage: '目前角色無法管理帳號',
          render: () => ensureModule(d.ensureAdminModule, d.getAdminModule).then((module) => module.renderUsers())
        },
        'unit-contact-review': {
          title: '單位管理人申請審核',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '只有最高管理者可以審核單位管理人申請',
          render: () => ensureModule(d.ensureAdminModule, d.getAdminModule).then((module) => module.renderUnitContactReview())
        },
        'login-log': {
          title: '登入紀錄',
          allow: () => d.canManageUsers(),
          fallback: 'dashboard',
          deniedMessage: '目前角色無法查看登入紀錄',
          render: () => ensureModule(d.ensureAdminModule, d.getAdminModule).then((module) => module.renderLoginLog())
        },
        'audit-trail': {
          title: '操作稽核軌跡',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '只有最高管理者可以查看操作稽核軌跡',
          render: () => ensureModule(d.ensureAdminModule, d.getAdminModule).then((module) => module.renderAuditTrail())
        },
        'security-window': {
          title: '資安窗口',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '只有最高管理者可以查看資安窗口',
          render: () => ensureModule(d.ensureAdminModule, d.getAdminModule).then((module) => module.renderSecurityWindow())
        },
        'schema-health': {
          title: '資料健康度',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '只有最高管理者可以查看資料健康度',
          render: () => ensureModule(d.ensureAdminModule, d.getAdminModule).then((module) => module.renderSchemaHealth())
        },
        checklist: {
          title: '檢核表',
          allow: () => !!d.currentUser(),
          render: () => ensureModule(d.ensureChecklistModule, d.getChecklistModule).then((module) => module.renderChecklistList())
        },
        'checklist-fill': {
          title: '填寫檢核表',
          allow: () => d.canFillChecklist(),
          fallback: 'checklist',
          deniedMessage: '目前角色無法填寫檢核表',
          render: (param) => ensureModule(d.ensureChecklistModule, d.getChecklistModule).then((module) => module.renderChecklistFill(param))
        },
        'checklist-detail': {
          title: '檢核表詳情',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => ensureModule(d.ensureChecklistModule, d.getChecklistModule).then((module) => module.renderChecklistDetail(param))
        },
        'checklist-manage': {
          title: '檢核表管理',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '只有最高管理者可以管理檢核表',
          render: () => ensureModule(d.ensureChecklistModule, d.getChecklistModule).then((module) => module.renderChecklistManage())
        },
        'unit-review': {
          title: '單位治理',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '只有最高管理者可以查看單位治理',
          render: () => ensureModule(d.ensureAdminModule, d.getAdminModule).then((module) => module.renderUnitReview())
        },
        training: {
          title: '教育訓練',
          allow: () => !!d.currentUser(),
          render: () => ensureModule(d.ensureTrainingModule, d.getTrainingModule).then((module) => module.renderTraining())
        },
        'training-fill': {
          title: '填寫教育訓練',
          allow: () => d.canFillTraining(),
          fallback: 'training',
          deniedMessage: '目前角色無法填寫教育訓練',
          render: (param) => ensureModule(d.ensureTrainingModule, d.getTrainingModule).then((module) => module.renderTrainingFill(param))
        },
        'training-detail': {
          title: '教育訓練詳情',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => ensureModule(d.ensureTrainingModule, d.getTrainingModule).then((module) => module.renderTrainingDetail(param))
        },
        'training-roster': {
          title: '教育訓練名單',
          allow: () => d.isAdmin(),
          fallback: 'training',
          deniedMessage: '只有最高管理者可以查看教育訓練名單',
          render: () => ensureModule(d.ensureTrainingModule, d.getTrainingModule).then((module) => module.renderTrainingRoster())
        }
      };
    }

    return {
      buildRouteWhitelist
    };
  };
})();
