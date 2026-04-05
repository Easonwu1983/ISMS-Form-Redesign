// @ts-check
(function () {
  var LANG_KEY = 'isms_lang';

  var translations = {
    'zh-TW': {
      // Shell
      'app.title': '資訊安全管理系統',
      'app.subtitle': 'Information Security Management System',
      'nav.dashboard': '儀表板',
      'nav.corrective': '矯正單列表',
      'nav.checklist': '內稽檢核表',
      'nav.training': '資安教育訓練統計',
      'nav.assets': '資訊資產盤點',
      'nav.createCase': '開立矯正單',
      'nav.fillChecklist': '填報檢核表',
      'nav.batchImport': '資產批次匯入',
      'nav.yearCompare': '年度比較',
      'nav.users': '帳號管理',
      'nav.applications': '單位管理人申請',
      'nav.loginLog': '登入紀錄',
      'nav.auditTrail': '操作軌跡',
      'nav.securityWindow': '資安窗口',
      'nav.checklistManage': '檢核表管理',
      'nav.trainingRoster': '教育訓練名單',
      'nav.unitReview': '單位治理',
      'nav.assetDashboard': '資產盤點總覽',
      'nav.checklistCompare': '檢核表歷年比對',
      'nav.dataImport': '歷史資料匯入',
      'nav.help': '說明',
      'nav.tutorial': '使用教學',
      'nav.logout': '登出系統',
      'nav.operations': '操作',
      'nav.systemAdmin': '系統管理',
      'nav.mainMenu': '主選單',
      // Login
      'login.title': '資訊安全管理系統',
      'login.subtitle': 'Information Security Management System',
      'login.account': '帳號',
      'login.password': '密碼',
      'login.submit': '登入系統',
      'login.error': '帳號或密碼錯誤',
      'login.forgot': '忘記密碼？',
      'login.apply': '申請單位管理人員',
      'login.applyDesc': '如需新增或異動各單位管理窗口，請先送出單位管理人申請。審核通過後，系統會直接啟用帳號並寄送登入資訊。',
      'login.goApply': '前往申請',
      'login.checkStatus': '查詢進度',
      'login.skip': '跳到主要內容',
      'login.setupTitle': '建立本機管理員帳號',
      'login.setupText': '目前沒有任何本機帳號，請先建立一組本機管理員帳號，之後再登入系統。',
      'login.adminName': '管理員姓名',
      'login.adminUser': '管理員帳號',
      'login.email': '電子郵件',
      'login.initPassword': '初始密碼',
      'login.placeholderName': '請輸入管理員姓名',
      'login.placeholderUser': '請輸入登入帳號',
      'login.placeholderEmail': '請輸入電子郵件',
      'login.placeholderPassword': '至少 8 碼，含大小寫、數字與特殊符號',
      'login.defaultAdminName': '本機管理員',
      'login.createAdmin': '建立本機管理員',
      // Common
      'common.save': '儲存',
      'common.cancel': '取消',
      'common.delete': '刪除',
      'common.edit': '編輯',
      'common.search': '搜尋',
      'common.filter': '篩選',
      'common.reset': '重設',
      'common.export': '匯出',
      'common.import': '匯入',
      'common.submit': '送出',
      'common.confirm': '確認',
      'common.loading': '載入中...',
      'common.noData': '沒有資料',
      'common.retry': '重試',
      'common.refresh': '重新整理',
      'common.back': '返回',
      'common.close': '關閉',
      'common.autoSaved': '已自動儲存',
      'common.savedDraft': '已儲存草稿',
      // Dashboard
      'dashboard.title': '年度稽核進度總覽',
      'dashboard.filingProgress': '年度填報進度',
      'dashboard.trainingOverview': '教育訓練概覽',
      'dashboard.todayFocus': '今日焦點',
      'dashboard.createCase': '開立矯正單',
      'dashboard.pending': '待矯正',
      'dashboard.overdue': '已逾期',
      'dashboard.closedMonth': '本月結案',
      // Error
      'error.title': '系統發生錯誤',
      'error.desc': '請重新整理頁面，如果問題持續請聯繫管理員。',
      'error.reload': '重新整理'
    },
    'en': {
      'app.title': 'Information Security Management System',
      'app.subtitle': 'ISMS Platform',
      'nav.dashboard': 'Dashboard',
      'nav.corrective': 'Corrective Actions',
      'nav.checklist': 'Audit Checklist',
      'nav.training': 'Security Training',
      'nav.assets': 'Asset Inventory',
      'nav.createCase': 'Create Case',
      'nav.fillChecklist': 'Fill Checklist',
      'nav.batchImport': 'Batch Import',
      'nav.yearCompare': 'Year Comparison',
      'nav.users': 'User Management',
      'nav.applications': 'Unit Admin Applications',
      'nav.loginLog': 'Login Log',
      'nav.auditTrail': 'Audit Trail',
      'nav.securityWindow': 'Security Contacts',
      'nav.checklistManage': 'Checklist Admin',
      'nav.trainingRoster': 'Training Roster',
      'nav.unitReview': 'Unit Governance',
      'nav.assetDashboard': 'Asset Dashboard',
      'nav.checklistCompare': 'Checklist Year Comparison',
      'nav.dataImport': 'Historical Data Import',
      'nav.help': 'Help',
      'nav.tutorial': 'Tutorial',
      'nav.logout': 'Logout',
      'nav.operations': 'Operations',
      'nav.systemAdmin': 'System Admin',
      'nav.mainMenu': 'Main Menu',
      'login.title': 'Information Security Management System',
      'login.subtitle': 'ISMS Platform',
      'login.account': 'Account',
      'login.password': 'Password',
      'login.submit': 'Sign In',
      'login.error': 'Invalid account or password',
      'login.forgot': 'Forgot password?',
      'login.apply': 'Apply for Unit Admin',
      'login.applyDesc': 'To add or change a unit security contact, please submit an application. After approval, the system will activate your account and send login credentials.',
      'login.goApply': 'Apply Now',
      'login.checkStatus': 'Check Status',
      'login.skip': 'Skip to main content',
      'login.setupTitle': 'Create Local Admin Account',
      'login.setupText': 'No local accounts exist. Please create an admin account first, then sign in.',
      'login.adminName': 'Admin Name',
      'login.adminUser': 'Admin Username',
      'login.email': 'Email',
      'login.initPassword': 'Initial Password',
      'login.placeholderName': 'Enter admin name',
      'login.placeholderUser': 'Enter login username',
      'login.placeholderEmail': 'Enter email address',
      'login.placeholderPassword': 'At least 8 chars, upper/lower case, digits & special chars',
      'login.defaultAdminName': 'Local Admin',
      'login.createAdmin': 'Create Local Admin',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.search': 'Search',
      'common.filter': 'Filter',
      'common.reset': 'Reset',
      'common.export': 'Export',
      'common.import': 'Import',
      'common.submit': 'Submit',
      'common.confirm': 'Confirm',
      'common.loading': 'Loading...',
      'common.noData': 'No data',
      'common.retry': 'Retry',
      'common.refresh': 'Refresh',
      'common.back': 'Back',
      'common.close': 'Close',
      'common.autoSaved': 'Auto-saved',
      'common.savedDraft': 'Draft saved',
      'dashboard.title': 'Annual Audit Progress',
      'dashboard.filingProgress': 'Filing Progress',
      'dashboard.trainingOverview': 'Training Overview',
      'dashboard.todayFocus': 'Today\'s Focus',
      'dashboard.createCase': 'Create Case',
      'dashboard.pending': 'Pending',
      'dashboard.overdue': 'Overdue',
      'dashboard.closedMonth': 'Closed This Month',
      'error.title': 'System Error',
      'error.desc': 'Please refresh the page. Contact admin if the problem persists.',
      'error.reload': 'Refresh'
    }
  };

  var currentLang = 'zh-TW';

  function getLang() {
    try {
      var stored = localStorage.getItem(LANG_KEY);
      if (stored && translations[stored]) return stored;
    } catch (_) {}
    return 'zh-TW';
  }

  function setLang(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}
    // Dispatch event so modules can re-render
    window.dispatchEvent(new CustomEvent('isms:lang-changed', { detail: { lang: lang } }));
  }

  function t(key, fallback) {
    var dict = translations[currentLang] || translations['zh-TW'];
    return dict[key] || (translations['zh-TW'][key]) || fallback || key;
  }

  function getAvailableLangs() {
    return Object.keys(translations).map(function (code) {
      return { code: code, label: code === 'zh-TW' ? '繁體中文' : 'English' };
    });
  }

  currentLang = getLang();

  window.__i18n__ = {
    t: t,
    getLang: function () { return currentLang; },
    setLang: setLang,
    getAvailableLangs: getAvailableLangs
  };
})();
