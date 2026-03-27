(function () {
  window.createAppPageOrchestrationModule = function createAppPageOrchestrationModule() {
    function buildRouteWhitelist(deps) {
      const d = deps && typeof deps === 'object' ? deps : {};
      return {
        'apply-unit-contact': {
          title: '申請單位資安窗口',
          public: true,
          allow: () => true,
          fallback: 'apply-unit-contact',
          render: () => d.getUnitContactApplicationModule().renderApplyForm()
        },
        'apply-unit-contact-success': {
          title: '申請已送出',
          public: true,
          allow: () => true,
          fallback: 'apply-unit-contact',
          requiresParam: true,
          render: (param) => d.getUnitContactApplicationModule().renderApplySuccess(param)
        },
        'apply-unit-contact-status': {
          title: '查詢申請進度',
          public: true,
          allow: () => true,
          fallback: 'apply-unit-contact',
          render: () => d.getUnitContactApplicationModule().renderApplyStatus()
        },
        'activate-unit-contact': {
          title: '窗口帳號開通',
          public: true,
          allow: () => true,
          fallback: 'apply-unit-contact',
          requiresParam: true,
          render: (param) => d.getUnitContactApplicationModule().renderActivate(param)
        },
        dashboard: {
          title: '儀表板',
          allow: () => !!d.currentUser(),
          render: () => d.getCaseModule().renderDashboard()
        },
        list: {
          title: '矯正單列表',
          allow: () => !!d.currentUser(),
          render: () => d.getCaseModule().renderList()
        },
        create: {
          title: '開立矯正單',
          allow: () => d.canCreateCAR(),
          fallback: 'dashboard',
          deniedMessage: '您沒有開立矯正單權限',
          render: () => d.getCaseModule().renderCreate()
        },
        detail: {
          title: '矯正單詳情',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => d.getCaseModule().renderDetail(param)
        },
        respond: {
          title: '回填矯正措施',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => d.getCaseModule().renderRespond(param)
        },
        tracking: {
          title: '追蹤監控',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => d.getCaseModule().renderTracking(param)
        },
        users: {
          title: '帳號管理',
          allow: () => d.canManageUsers(),
          fallback: 'dashboard',
          deniedMessage: '您沒有帳號管理權限',
          render: () => d.getAdminModule().renderUsers()
        },
        'unit-contact-review': {
          title: '單位管理人申請',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '僅最高管理員可審核單位管理人申請',
          render: () => d.getAdminModule().renderUnitContactReview()
        },
        'login-log': {
          title: '登入紀錄',
          allow: () => d.canManageUsers(),
          fallback: 'dashboard',
          deniedMessage: '您沒有檢視登入紀錄權限',
          render: () => d.getAdminModule().renderLoginLog()
        },
        'audit-trail': {
          title: '操作稽核軌跡',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '僅最高管理者可檢視操作稽核軌跡',
          render: () => d.getAdminModule().renderAuditTrail()
        },
        'security-window': {
          title: '資安窗口',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '僅最高管理者可檢視資安窗口',
          render: () => d.getAdminModule().renderSecurityWindow()
        },
        'schema-health': {
          title: '資料健康檢查',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '僅最高管理者可檢視資料健康資訊',
          render: () => d.getAdminModule().renderSchemaHealth()
        },
        checklist: {
          title: '內稽檢核表',
          allow: () => !!d.currentUser(),
          render: () => d.getChecklistModule().renderChecklistList()
        },
        'checklist-fill': {
          title: '填報檢核表',
          allow: () => d.canFillChecklist(),
          fallback: 'checklist',
          deniedMessage: '您沒有填報檢核表權限',
          render: (param) => d.getChecklistModule().renderChecklistFill(param)
        },
        'checklist-detail': {
          title: '檢核表詳情',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => d.getChecklistModule().renderChecklistDetail(param)
        },
        'checklist-manage': {
          title: '檢核表管理',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '僅最高管理者可管理檢核表',
          render: () => d.getChecklistModule().renderChecklistManage()
        },
        'unit-review': {
          title: '單位治理',
          allow: () => d.isAdmin(),
          fallback: 'dashboard',
          deniedMessage: '僅最高管理者可管理單位治理',
          render: () => d.getAdminModule().renderUnitReview()
        },
        training: {
          title: '資安教育訓練統計',
          allow: () => !!d.currentUser(),
          render: () => d.getTrainingModule().renderTraining()
        },
        'training-fill': {
          title: '填報資安教育訓練統計',
          allow: () => d.canFillTraining(),
          fallback: 'training',
          deniedMessage: '您沒有填報教育訓練的權限',
          render: (param) => d.getTrainingModule().renderTrainingFill(param)
        },
        'training-detail': {
          title: '資安教育訓練統計詳情',
          allow: () => !!d.currentUser(),
          requiresParam: true,
          render: (param) => d.getTrainingModule().renderTrainingDetail(param)
        },
        'training-roster': {
          title: '教育訓練名單管理',
          allow: () => d.isAdmin(),
          fallback: 'training',
          deniedMessage: '僅最高管理者可管理教育訓練名單',
          render: () => d.getTrainingModule().renderTrainingRoster()
        }
      };
    }

    return {
      buildRouteWhitelist
    };
  };
})();
