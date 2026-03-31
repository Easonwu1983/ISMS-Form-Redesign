(function () {
  window.createShellModule = function createShellModule(deps) {
    const {
      ROUTE_WHITELIST,
      ROLE_BADGE,
      STATUSES,
      currentUser,
      login,
      logout,
      getAuthMode,
      hasLocalUsers,
      bootstrapLocalAdminAccount,
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
      addPageEventListener,
      beginPageRuntime,
      teardownPageRuntime,
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
    } = deps;

    let isSidebarOpen = false;

    function isPublicRoute(page) {
      return !!(page && ROUTE_WHITELIST[page] && ROUTE_WHITELIST[page].public);
    }

    function normalizeUnitList(units) {
      var source = Array.isArray(units) ? units : [];
      return Array.from(new Set(source.map(function (unit) {
        return String(unit || '').trim();
      }).filter(Boolean)));
    }

    function getShellAccessProfile(user) {
      var base = user || currentUser();
      if (!base) return null;
      var authorizedUnits = normalizeUnitList(
        Array.isArray(base.authorizedUnits) && base.authorizedUnits.length
          ? base.authorizedUnits
          : getAuthorizedUnits(base)
      );
      var activeUnit = String(base.activeUnit || getScopedUnit(base) || base.primaryUnit || base.unit || authorizedUnits[0] || '').trim();
      return Object.assign({}, base, {
        authorizedUnits: authorizedUnits,
        activeUnit: activeUnit
      });
    }

    function isMobileViewport() {
      if (window.matchMedia) return window.matchMedia('(max-width: 1280px)').matches;
      return window.innerWidth <= 1280;
    }

    function setSidebarOpen(nextOpen) {
      isSidebarOpen = !!nextOpen && isMobileViewport();
      if (!document.body) return;
      document.body.classList.toggle('sidebar-open', isSidebarOpen);
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('show', isSidebarOpen);
      const backdrop = document.getElementById('sidebar-backdrop');
      if (backdrop) backdrop.classList.toggle('show', isSidebarOpen);
    }

    function closeSidebar() { setSidebarOpen(false); }
    function toggleSidebar() { setSidebarOpen(!isSidebarOpen); }

    function getBuildInfo() {
      var manifest = window.__APP_ASSET_MANIFEST__ && typeof window.__APP_ASSET_MANIFEST__ === 'object'
        ? window.__APP_ASSET_MANIFEST__
        : {};
      var buildInfo = window.__APP_BUILD_INFO__ && typeof window.__APP_BUILD_INFO__ === 'object'
        ? window.__APP_BUILD_INFO__
        : {};
      if ((!buildInfo || !buildInfo.versionKey) && manifest.buildInfo && typeof manifest.buildInfo === 'object') {
        buildInfo = manifest.buildInfo;
      }
      return buildInfo && typeof buildInfo === 'object' ? buildInfo : {};
    }

    function getBuildVersionText() {
      var buildInfo = getBuildInfo();
      var versionKey = String(buildInfo.versionKey || buildInfo.shortCommit || buildInfo.describe || '').trim();
      return versionKey ? ('v' + versionKey) : 'vlocal';
    }

    function getBuildVersionTitle() {
      var buildInfo = getBuildInfo();
      var parts = [];
      if (buildInfo.platform) parts.push('平台: ' + buildInfo.platform);
      if (buildInfo.versionKey) parts.push('版本: ' + buildInfo.versionKey);
      if (buildInfo.commit) parts.push('Commit: ' + buildInfo.commit);
      if (buildInfo.branch) parts.push('分支: ' + buildInfo.branch);
      if (buildInfo.builtAt) parts.push('建置時間: ' + buildInfo.builtAt);
      if (buildInfo.describe) parts.push('描述: ' + buildInfo.describe);
      return parts.length ? parts.join(' / ') : '版本資訊不可用';
    }

    function renderVersionChip(extraClass) {
      var classes = ['app-version-chip'];
      if (extraClass) classes.push(extraClass);
      return '<span class="' + classes.join(' ') + '" data-testid="app-version-chip" title="' + esc(getBuildVersionTitle()) + '">' + esc(getBuildVersionText()) + '</span>';
    }

    function validatePasswordComplexity(password) {
      var value = String(password || '');
      if (value.length < 8) return '密碼至少需要 8 碼';
      if (!/[a-z]/.test(value)) return '密碼至少需要一個小寫英文字母';
      if (!/[A-Z]/.test(value)) return '密碼至少需要一個大寫英文字母';
      if (!/[0-9]/.test(value)) return '密碼至少需要一個數字';
      return '';
    }

    var AUTH_STORAGE_KEY = 'cats_auth';
    var AUTH_VERIFY_CACHE_KEY = '__AUTH_VERIFY_CACHE__';
    var AUTH_BOOTSTRAP_FRESH_KEY = '__AUTH_BOOTSTRAP_FRESH__';
    var AUTH_APP_TRANSITION_KEY = '__AUTH_APP_TRANSITION__';

    function safeReadStorage(storage, key) {
      try {
        if (!storage || !key) return '';
        return String(storage.getItem(key) || '');
      } catch (_) {
        return '';
      }
    }

    function safeRemoveStorage(storage, key) {
      try {
        if (storage && key) storage.removeItem(key);
      } catch (_) { }
    }

    function parseJsonOrNull(raw) {
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }

    function hasExpiredTimestamp(value) {
      var parsed = Date.parse(String(value || '').trim());
      return Number.isFinite(parsed) && parsed <= Date.now();
    }

    function purgeStaleLoginState() {
      var localRaw = safeReadStorage(window.localStorage, AUTH_STORAGE_KEY);
      var sessionRaw = safeReadStorage(window.sessionStorage, AUTH_STORAGE_KEY);
      var verifyRaw = safeReadStorage(window.sessionStorage, AUTH_VERIFY_CACHE_KEY);
      if (!localRaw && !sessionRaw && !verifyRaw) return false;

      var localAuth = parseJsonOrNull(localRaw);
      var sessionAuth = parseJsonOrNull(sessionRaw);
      var verifyCache = parseJsonOrNull(verifyRaw);
      var auth = localAuth || sessionAuth;
      var shouldClear = false;

      if ((localRaw && !localAuth) || (sessionRaw && !sessionAuth) || (verifyRaw && !verifyCache)) {
        shouldClear = true;
      }
      if (auth) {
        var sessionToken = String(auth.sessionToken || '').trim();
        var sessionExpiresAt = String(auth.sessionExpiresAt || '').trim();
        if (sessionToken || sessionExpiresAt) {
          shouldClear = true;
        }
        if (sessionExpiresAt && hasExpiredTimestamp(sessionExpiresAt)) {
          shouldClear = true;
        }
      }
      if (verifyRaw) {
        shouldClear = true;
      }
      if (!shouldClear) return false;

      safeRemoveStorage(window.localStorage, AUTH_STORAGE_KEY);
      safeRemoveStorage(window.sessionStorage, AUTH_STORAGE_KEY);
      safeRemoveStorage(window.sessionStorage, AUTH_VERIFY_CACHE_KEY);
      safeRemoveStorage(window.sessionStorage, AUTH_BOOTSTRAP_FRESH_KEY);
      return true;
    }

    function setAppTransitionFlag() {
      try {
        window.sessionStorage.setItem(AUTH_APP_TRANSITION_KEY, '1');
      } catch (_) { }
    }

    function consumeAppTransitionFlag() {
      try {
        var enabled = String(window.sessionStorage.getItem(AUTH_APP_TRANSITION_KEY) || '').trim() === '1';
        window.sessionStorage.removeItem(AUTH_APP_TRANSITION_KEY);
        return enabled;
      } catch (_) {
        return false;
      }
    }

    function renderAppTransitionOverlay() {
      return '<div class="app-transition-overlay" id="app-transition-overlay" aria-hidden="true">' +
        '<div class="app-transition-shell">' +
        '<div class="app-transition-icon">' + ntuLogo('ntu-logo-sm') + '</div>' +
        '<div class="app-transition-title">正在登入系統</div>' +
        '<div class="app-transition-subtitle">請稍候，正在同步登入狀態與頁面權限。</div>' +
        '</div></div>';
    }

    function dismissAppTransitionOverlay() {
      if (typeof window === 'undefined') return;
      window.requestAnimationFrame(function () {
        var overlay = document.getElementById('app-transition-overlay');
        if (!overlay) return;
        overlay.classList.add('is-leaving');
        window.setTimeout(function () {
          if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 280);
      });
    }

    function getRoleBadgeClass(role) {
      return ROLE_BADGE[role] || 'badge-unit-admin';
    }

    function getRoleLabel(role) {
      return esc(String(role || '未設定'));
    }

    var HEADER_INTEGRATED_ROUTES = {
      dashboard: true,
      list: true,
      users: true,
      'unit-contact-review': true,
      'login-log': true,
      'audit-trail': true,
      'security-window': true,
      'schema-health': true,
      checklist: true,
      'checklist-manage': true,
      'unit-review': true,
      training: true,
      'training-roster': true
    };

    function setHeaderContextText(selector, value) {
      var node = document.querySelector(selector);
      if (!node) return;
      node.textContent = String(value || '').trim();
    }

    function syncHeaderRouteContext(page) {
      var headerEl = document.getElementById('header');
      var app = document.getElementById('app');
      if (!headerEl || !app) return;

      var routePage = String(page || '').trim() || 'dashboard';
      var pageHeader = app.querySelector('.page-header');
      var eyebrow = app.querySelector('.page-header .page-eyebrow, .dashboard-hero-eyebrow');
      var title = app.querySelector('[data-route-heading], .page-header .page-title');
      var kickerText = eyebrow && eyebrow.textContent ? eyebrow.textContent.trim() : '';
      var titleText = title && title.textContent ? title.textContent.trim() : getRouteTitle(routePage);
      var headerContext = headerEl.querySelector('.header-context');
      var kickerEl = headerEl.querySelector('.header-kicker');
      var integrated = !!HEADER_INTEGRATED_ROUTES[routePage];
      var hasPageHeader = !!pageHeader;
      var shouldShowHeaderContext = !!titleText && !hasPageHeader;

      if (kickerEl) {
        kickerEl.textContent = kickerText;
        kickerEl.hidden = !kickerText || !shouldShowHeaderContext;
      }
      if (headerContext) {
        headerContext.hidden = !shouldShowHeaderContext;
      }
      headerEl.classList.toggle('header--contextual', shouldShowHeaderContext);
      headerEl.classList.toggle('header--page-owned', hasPageHeader && !integrated);
      setHeaderContextText('.header-title', shouldShowHeaderContext ? titleText : '');

      if (pageHeader) {
        pageHeader.classList.toggle('page-header--integrated', integrated);
        pageHeader.classList.toggle('page-header--shell-owned', !integrated);
      }
    }

    function focusRouteContent() {
      window.requestAnimationFrame(function () {
        var heading = document.querySelector('[data-route-heading]');
        if (heading && typeof heading.focus === 'function') {
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: false });
          return;
        }
        var main = document.getElementById('app');
        if (main && typeof main.focus === 'function') {
          main.focus({ preventScroll: false });
        }
      });
    }

    function bindPageEvent(target, type, listener, options) {
      if (typeof addPageEventListener === 'function') {
        return addPageEventListener(target, type, listener, options);
      }
      if (!target || typeof target.addEventListener !== 'function') return function () {};
      target.addEventListener(type, listener, options);
      return function () {
        try { target.removeEventListener(type, listener, options); } catch (_) {}
      };
    }



    function renderLogin() {
      if (typeof teardownPageRuntime === 'function') teardownPageRuntime();
      if (typeof beginPageRuntime === 'function') beginPageRuntime();
      purgeStaleLoginState();
      var needsLocalBootstrap = getAuthMode() !== 'm365-api' && !hasLocalUsers();
      var textMap = {
        skip: '\u8df3\u5230\u4e3b\u8981\u5167\u5bb9',
        title: '\u5167\u90e8\u7a3d\u6838\u7ba1\u8003\u8ffd\u8e64\u7cfb\u7d71',
        subtitle: 'ISMS \u7ba1\u8003\u8207\u8ffd\u8e64\u5e73\u53f0',
        loginError: '\u5e33\u865f\u6216\u5bc6\u78bc\u932f\u8aa4',
        setupTitle: '\u5efa\u7acb\u672c\u6a5f\u7ba1\u7406\u54e1\u5e33\u865f',
        setupText: '\u76ee\u524d\u6c92\u6709\u4efb\u4f55\u672c\u6a5f\u5e33\u865f\uff0c\u8acb\u5148\u5efa\u7acb\u4e00\u7d44\u672c\u6a5f\u7ba1\u7406\u54e1\u5e33\u865f\uff0c\u4e4b\u5f8c\u518d\u767b\u5165\u7cfb\u7d71\u3002',
        adminName: '\u7ba1\u7406\u54e1\u59d3\u540d',
        adminUser: '\u7ba1\u7406\u54e1\u5e33\u865f',
        email: '\u96fb\u5b50\u90f5\u4ef6',
        initPassword: '\u521d\u59cb\u5bc6\u78bc',
        placeholderName: '\u8acb\u8f38\u5165\u7ba1\u7406\u54e1\u59d3\u540d',
        placeholderUser: '\u8acb\u8f38\u5165\u767b\u5165\u5e33\u865f',
        placeholderEmail: '\u8acb\u8f38\u5165\u96fb\u5b50\u90f5\u4ef6',
        placeholderPassword: '\u81f3\u5c11 8 \u78bc\uff0c\u542b\u5927\u5c0f\u5beb\u8207\u6578\u5b57',
        defaultAdminName: '\u672c\u6a5f\u7ba1\u7406\u54e1',
        createAdmin: '\u5efa\u7acb\u672c\u6a5f\u7ba1\u7406\u54e1',
        account: '\u5e33\u865f',
        password: '\u5bc6\u78bc',
        loginAction: '\u767b\u5165\u7cfb\u7d71',
        firstUseTitle: '\u7533\u8acb\u55ae\u4f4d\u7ba1\u7406\u4eba\u54e1',
        firstUseText: '\u5982\u9700\u65b0\u589e\u6216\u7570\u52d5\u5404\u55ae\u4f4d\u7ba1\u7406\u7a97\u53e3\uff0c\u8acb\u5148\u9001\u51fa\u55ae\u4f4d\u7ba1\u7406\u4eba\u7533\u8acb\u3002\u5be9\u6838\u901a\u904e\u5f8c\uff0c\u7cfb\u7d71\u6703\u76f4\u63a5\u555f\u7528\u5e33\u865f\u4e26\u5bc4\u9001\u767b\u5165\u8cc7\u8a0a\u3002',
        applyUnitContact: '\u524d\u5f80\u7533\u8acb',
        checkProgress: '\u67e5\u8a62\u9032\u5ea6',
        forgotPassword: '\u5fd8\u8a18\u5bc6\u78bc\uff1f',
        changeTitle: '\u9996\u6b21\u767b\u5165\u9700\u8b8a\u66f4\u5bc6\u78bc',
        passwordRule: '\u5bc6\u78bc\u9700\u81f3\u5c11 8 \u78bc\uff0c\u4e26\u5305\u542b\u82f1\u6587\u5927\u5beb\u3001\u82f1\u6587\u5c0f\u5beb\u8207\u6578\u5b57\u3002',
        changeError: '\u5bc6\u78bc\u8b8a\u66f4\u5931\u6557',
        currentPassword: '\u76ee\u524d\u5bc6\u78bc',
        newPassword: '\u65b0\u5bc6\u78bc',
        confirmNewPassword: '\u78ba\u8a8d\u65b0\u5bc6\u78bc',
        updatePassword: '\u7acb\u5373\u66f4\u65b0\u5bc6\u78bc',
        backToLogin: '\u8fd4\u56de\u767b\u5165',
        resetTitle: '\u91cd\u8a2d\u5bc6\u78bc',
        resetError: '\u627e\u4e0d\u5230\u7b26\u5408\u5e33\u865f\u8207\u96fb\u5b50\u90f5\u4ef6\u7684\u4f7f\u7528\u8005',
        registeredEmail: '\u8a3b\u518a\u96fb\u5b50\u90f5\u4ef6',
        registeredEmailPlaceholder: '\u8acb\u8f38\u5165\u5e33\u865f\u7d81\u5b9a\u7684\u96fb\u5b50\u90f5\u4ef6',
        sendReset: '\u5bc4\u9001\u91cd\u8a2d\u4fe1',
        resetSent: '\u91cd\u8a2d\u4fe1\u5df2\u5bc4\u51fa',
        accountPrefix: '\u5e33\u865f\uff1a',
        expiryPrefix: '\u6709\u6548\u671f\u9650\uff1a',
        resetFailed: '\u5bc6\u78bc\u91cd\u8a2d\u5931\u6557',
        resetInvalid: '\u91cd\u8a2d\u4ee3\u78bc\u7121\u6548\u6216\u5df2\u904e\u671f',
        resetDone: '\u5bc6\u78bc\u5df2\u91cd\u8a2d\u4e26\u5b8c\u6210\u767b\u5165',
        createdAdmin: '\u672c\u6a5f\u7ba1\u7406\u54e1\u5e33\u865f\u5df2\u5efa\u7acb\uff0c\u8acb\u4f7f\u7528\u65b0\u5e33\u865f\u767b\u5165',
        createAdminFailed: '\u5efa\u7acb\u672c\u6a5f\u7ba1\u7406\u54e1\u5931\u6557',
        loginFailed: '\u767b\u5165\u5931\u6557',
        changeMismatch: '\u5169\u6b21\u8f38\u5165\u7684\u65b0\u5bc6\u78bc\u4e0d\u4e00\u81f4',
        changeDone: '\u5bc6\u78bc\u5df2\u66f4\u65b0\uff0c\u8acb\u91cd\u65b0\u767b\u5165\u7cfb\u7d71',
        forgotExpireFallback: '\u4f9d\u7cfb\u7d71\u8a2d\u5b9a',
        forgotDeliveryUnavailable: '\u76ee\u524d\u7121\u6cd5\u5bc4\u9001\u91cd\u8a2d\u4fe1',
        forgotDeliverySent: '\u91cd\u8a2d\u4fe1\u5df2\u5bc4\u51fa',
        forgotDeliverySentMessagePrefix: '\u7cfb\u7d71\u5df2\u5c07\u91cd\u8a2d\u4ee3\u78bc\u5bc4\u9001\u5230 ',
        forgotDeliverySentMessageSuffix: '\uff0c\u8acb\u67e5\u770b\u4fe1\u4ef6\u5f8c\u8cbc\u5230\u4e0b\u65b9\u6b04\u4f4d\u3002',
        forgotDeliveryUnavailableMessage: '\u7cfb\u7d71\u66ab\u6642\u7121\u6cd5\u5bc4\u9001\u91cd\u8a2d\u4fe1\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\uff0c\u6216\u806f\u7d61\u6700\u9ad8\u7ba1\u7406\u54e1\u5354\u52a9\u91cd\u8a2d\u3002'
      };
      document.body.innerHTML = '<a class="skip-link" href="#app">' + textMap.skip + '</a><div class="login-page" tabindex="0"><main class="login-card" id="app" tabindex="-1" role="main" aria-labelledby="login-page-title">' +
        '<div class="login-logo"><span class="login-logo-icon">' + ntuLogo('ntu-logo-lg') + '</span><h1 id="login-page-title">' + textMap.title + '</h1><p>' + textMap.subtitle + '</p></div>' +
        '<div class="login-error" id="login-error" data-testid="login-error" role="alert" aria-live="assertive" aria-atomic="true">' + textMap.loginError + '</div>' +
        '<div id="bootstrap-panel" style="display:' + (needsLocalBootstrap ? 'block' : 'none') + '"><div class="login-entry-card login-entry-card--setup"><div class="login-entry-eyebrow">Setup</div><h2 class="login-entry-title">' + textMap.setupTitle + '</h2><p class="login-entry-text">' + textMap.setupText + '</p><form class="login-form" id="bootstrap-form"><div class="form-group"><label class="form-label">' + textMap.adminName + '</label><input type="text" class="form-input" id="bootstrap-name" autocomplete="name" placeholder="' + textMap.placeholderName + '" value="' + textMap.defaultAdminName + '" required></div><div class="form-group"><label class="form-label">' + textMap.adminUser + '</label><input type="text" class="form-input" id="bootstrap-user" autocomplete="username" placeholder="' + textMap.placeholderUser + '" required></div><div class="form-group"><label class="form-label">' + textMap.email + '</label><input type="email" class="form-input" id="bootstrap-email" autocomplete="email" placeholder="' + textMap.placeholderEmail + '" required></div><div class="form-group"><label class="form-label">' + textMap.initPassword + '</label><input type="password" class="form-input" id="bootstrap-pass" autocomplete="new-password" placeholder="' + textMap.placeholderPassword + '" required></div><button type="submit" class="login-btn">' + textMap.createAdmin + '</button></form></div></div>' +
        '<div id="login-panel" style="display:' + (needsLocalBootstrap ? 'none' : 'block') + '"><form class="login-form" id="login-form" data-testid="login-form"><div class="form-group"><label class="form-label">' + textMap.account + '</label><input type="text" class="form-input" id="login-user" data-testid="login-user" autocomplete="username" placeholder="' + textMap.placeholderUser + '" required autofocus></div><div class="form-group"><label class="form-label">' + textMap.password + '</label><input type="password" class="form-input" id="login-pass" data-testid="login-pass" autocomplete="current-password" placeholder="' + textMap.password + '" required></div><button type="submit" class="login-btn" data-testid="login-submit">' + textMap.loginAction + ' ' + ic('arrow-right', 'icon-sm') + '</button></form>' +
        '<div class="login-entry-card"><div class="login-entry-eyebrow">New</div><h2 class="login-entry-title">' + textMap.firstUseTitle + '</h2><p class="login-entry-text">' + textMap.firstUseText + '</p><div class="login-entry-actions"><a class="btn btn-primary" href="#apply-unit-contact">' + textMap.applyUnitContact + '</a><a class="btn btn-secondary" href="#apply-unit-contact-status">' + textMap.checkProgress + '</a></div></div><p style="text-align:center;margin-top:14px"><a href="#" id="forgot-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">' + textMap.forgotPassword + '</a></p></div>' +
        '<div id="auth-secondary-panels"></div>' +
        '</main></div><div class="toast-container" id="toast-container" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div>';

      function buildChangePanelHtml() {
        return '<div id="change-panel" style="display:none"><div style="text-align:center;margin-bottom:18px">' + ic('shield-check', 'icon-xl') + '<h2 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">' + textMap.changeTitle + '</h2><p style="margin-top:8px;color:var(--text-secondary);font-size:.82rem;line-height:1.6">' + textMap.passwordRule + '</p></div><div class="login-error" id="change-error" role="alert" aria-live="assertive" aria-atomic="true">' + textMap.changeError + '</div><form class="login-form" id="change-form"><input type="hidden" id="change-username"><div class="form-group"><label class="form-label">' + textMap.currentPassword + '</label><input type="password" class="form-input" id="change-current-password" autocomplete="current-password" placeholder="' + textMap.currentPassword + '" required></div><div class="form-group"><label class="form-label">' + textMap.newPassword + '</label><input type="password" class="form-input" id="change-pass" autocomplete="new-password" placeholder="' + textMap.placeholderPassword + '" required></div><div class="form-group"><label class="form-label">' + textMap.confirmNewPassword + '</label><input type="password" class="form-input" id="change-pass-confirm" autocomplete="new-password" placeholder="' + textMap.confirmNewPassword + '" required></div><button type="submit" class="login-btn">' + ic('key-round', 'icon-sm') + ' ' + textMap.updatePassword + '</button></form><p style="text-align:center;margin-top:14px"><a href="#" id="change-back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">' + textMap.backToLogin + '</a></p></div>';
      }

      function buildForgotPanelHtml() {
        return '<div id="forgot-panel" style="display:none"><div style="text-align:center;margin-bottom:18px">' + ic('key', 'icon-xl') + '<h2 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">' + textMap.resetTitle + '</h2><p style="margin-top:8px;color:var(--text-secondary);font-size:.82rem;line-height:1.6">' + textMap.passwordRule + '</p></div><div class="login-error" id="forgot-error" role="alert" aria-live="assertive" aria-atomic="true">' + textMap.resetError + '</div><form class="login-form" id="forgot-form"><div class="form-group"><label class="form-label">' + textMap.account + '</label><input type="text" class="form-input" id="forgot-username" autocomplete="username" placeholder="' + textMap.placeholderUser + '" required></div><div class="form-group"><label class="form-label">' + textMap.registeredEmail + '</label><input type="email" class="form-input" id="forgot-email" autocomplete="email" placeholder="' + textMap.registeredEmailPlaceholder + '" required></div><button type="submit" class="login-btn" style="background:linear-gradient(135deg,#f59e0b,#d97706)">' + ic('mail', 'icon-sm') + ' ' + textMap.sendReset + '</button></form><div id="forgot-result" style="display:none;margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px"><p style="font-size:.88rem;color:#0f172a;font-weight:600" id="reset-result-title">' + textMap.resetSent + '</p><p style="font-size:.82rem;color:var(--text-secondary)">' + textMap.accountPrefix + '<strong id="reset-username"></strong></p><p style="font-size:.82rem;color:var(--text-secondary)">' + textMap.expiryPrefix + '<strong id="reset-expire"></strong></p><p style="font-size:.82rem;color:var(--text-secondary);margin-top:6px" id="reset-result-message"></p><form class="login-form" id="redeem-form" style="margin-top:14px"><input type="hidden" id="redeem-username"><div class="form-group"><label class="form-label">\u91cd\u8a2d\u4ee3\u78bc</label><input type="text" class="form-input" id="redeem-token" autocomplete="one-time-code" placeholder="\u8acb\u8f38\u5165\u4fe1\u4ef6\u4e2d\u7684\u91cd\u8a2d\u4ee3\u78bc" required></div><div class="form-group"><label class="form-label">' + textMap.newPassword + '</label><input type="password" class="form-input" id="redeem-pass" autocomplete="new-password" placeholder="' + textMap.placeholderPassword + '" required></div><div class="form-group"><label class="form-label">' + textMap.confirmNewPassword + '</label><input type="password" class="form-input" id="redeem-pass-confirm" autocomplete="new-password" placeholder="' + textMap.confirmNewPassword + '" required></div><button type="submit" class="login-btn">' + ic('check', 'icon-sm') + ' \u5b8c\u6210\u91cd\u8a2d</button></form></div><p style="text-align:center;margin-top:14px"><a href="#" id="back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">' + textMap.backToLogin + '</a></p></div>';
      }

      function ensureAuthPanel(panelId) {
        var panel = document.getElementById(panelId);
        if (panel) return panel;
        var host = document.getElementById('auth-secondary-panels');
        if (!host) return null;
        if (panelId === 'change-panel') {
          host.insertAdjacentHTML('beforeend', buildChangePanelHtml());
        } else if (panelId === 'forgot-panel') {
          host.insertAdjacentHTML('beforeend', buildForgotPanelHtml());
        }
        return document.getElementById(panelId);
      }

      function wireChangePanel() {
        var panel = ensureAuthPanel('change-panel');
        if (!panel || panel.dataset.authBound === '1') return panel;
        panel.dataset.authBound = '1';
        bindPageEvent(document.getElementById('change-form'), 'submit', async function (e) {
          e.preventDefault();
          var username = document.getElementById('change-username').value.trim();
          var currentPassword = document.getElementById('change-current-password').value;
          var nextPassword = document.getElementById('change-pass').value;
          var confirmPassword = document.getElementById('change-pass-confirm').value;
          if (nextPassword !== confirmPassword) {
            document.getElementById('change-error').textContent = textMap.changeMismatch;
            var changeError = document.getElementById('change-error');
            if (changeError) changeError.classList.add('show');
            return;
          }
          var changePasswordError = validatePasswordComplexity(nextPassword);
          if (changePasswordError) {
            document.getElementById('change-error').textContent = changePasswordError;
            var changeError = document.getElementById('change-error');
            if (changeError) changeError.classList.add('show');
            return;
          }
          try {
            var updatedUser = await changePassword({ username: username, currentPassword: currentPassword, newPassword: nextPassword });
            if (!updatedUser) {
              document.getElementById('change-error').textContent = textMap.changeError;
              var changeError = document.getElementById('change-error');
              if (changeError) changeError.classList.add('show');
              return;
            }
            toast(textMap.changeDone, 'success');
            switchPanel('login-panel');
            document.getElementById('login-user').value = username;
            document.getElementById('login-pass').value = '';
          } catch (error) {
            document.getElementById('change-error').textContent = String(error && error.message || error || textMap.changeError);
            var changeError = document.getElementById('change-error');
            if (changeError) changeError.classList.add('show');
          }
        });
        bindPageEvent(document.getElementById('change-back-login-link'), 'click', function (e) {
          e.preventDefault();
          switchPanel(needsLocalBootstrap ? 'bootstrap-panel' : 'login-panel');
        });
        return panel;
      }

      function wireForgotPanel() {
        var panel = ensureAuthPanel('forgot-panel');
        if (!panel || panel.dataset.authBound === '1') return panel;
        panel.dataset.authBound = '1';
        bindPageEvent(document.getElementById('forgot-form'), 'submit', async function (e) {
          e.preventDefault();
          var username = document.getElementById('forgot-username').value.trim();
          var email = document.getElementById('forgot-email').value.trim();
          try {
            var resetResult = await resetPasswordByEmail({ username: username, email: email });
            if (!resetResult) {
              var forgotError = document.getElementById('forgot-error');
              if (forgotError) forgotError.classList.add('show');
              return;
            }
            var forgotError = document.getElementById('forgot-error');
            if (forgotError) forgotError.classList.remove('show');
            document.getElementById('reset-username').textContent = resetResult.user.username;
            document.getElementById('reset-expire').textContent = resetResult.resetTokenExpiresAt || textMap.forgotExpireFallback;
            var deliveredByMail = !!(resetResult.delivery && resetResult.delivery.sent);
            document.getElementById('reset-result-title').textContent = deliveredByMail ? textMap.forgotDeliverySent : textMap.forgotDeliveryUnavailable;
            document.getElementById('reset-result-message').textContent = deliveredByMail
              ? (textMap.forgotDeliverySentMessagePrefix + (resetResult.user.email || email) + textMap.forgotDeliverySentMessageSuffix)
              : textMap.forgotDeliveryUnavailableMessage;
            document.getElementById('redeem-username').value = resetResult.user.username;
            document.getElementById('redeem-token').value = '';
            document.getElementById('redeem-form').style.display = deliveredByMail ? '' : 'none';
            document.getElementById('forgot-result').style.display = 'block';
            toast(deliveredByMail ? textMap.forgotDeliverySent : textMap.forgotDeliveryUnavailable, deliveredByMail ? 'success' : 'error');
          } catch (error) {
            document.getElementById('forgot-error').textContent = String(error && error.message || error || textMap.resetFailed);
            var forgotError = document.getElementById('forgot-error');
            if (forgotError) forgotError.classList.add('show');
          }
        });
        bindPageEvent(document.getElementById('back-login-link'), 'click', function (e) {
          e.preventDefault();
          switchPanel(needsLocalBootstrap ? 'bootstrap-panel' : 'login-panel');
        });
        bindPageEvent(document.getElementById('redeem-form'), 'submit', async function (e) {
          e.preventDefault();
          var username = document.getElementById('redeem-username').value.trim();
          var token = document.getElementById('redeem-token').value.trim();
          var nextPassword = document.getElementById('redeem-pass').value;
          var confirmPassword = document.getElementById('redeem-pass-confirm').value;
          if (nextPassword !== confirmPassword) {
            toast(textMap.changeMismatch, 'error');
            return;
          }
          var redeemPasswordError = validatePasswordComplexity(nextPassword);
          if (redeemPasswordError) {
            toast(redeemPasswordError, 'error');
            return;
          }
          try {
            var user = await redeemResetPassword({ username: username, token: token, newPassword: nextPassword });
            if (!user) {
              toast(textMap.resetInvalid, 'error');
              return;
            }
            toast(textMap.resetDone, 'success');
            renderApp();
          } catch (error) {
            toast(String(error && error.message || error || textMap.resetFailed), 'error');
          }
        });
        return panel;
      }

      function switchPanel(target) {
        ['bootstrap-panel', 'login-panel', 'forgot-panel', 'change-panel'].forEach(function (id) {
          var panel = document.getElementById(id);
          if (panel) panel.style.display = id === target ? 'block' : 'none';
        });
        ['login-error', 'forgot-error', 'change-error'].forEach(function (id) {
          var errorEl = document.getElementById(id);
          if (errorEl) errorEl.classList.remove('show');
        });
      }

      var bootstrapForm = document.getElementById('bootstrap-form');
      if (bootstrapForm) {
        bindPageEvent(bootstrapForm, 'submit', async function (e) {
          e.preventDefault();
          var username = document.getElementById('bootstrap-user').value.trim();
          var password = document.getElementById('bootstrap-pass').value;
          var email = document.getElementById('bootstrap-email').value.trim();
          var name = document.getElementById('bootstrap-name').value.trim();
          var passwordError = validatePasswordComplexity(password);
          if (passwordError) {
            toast(passwordError, 'error');
            return;
          }
          try {
            await bootstrapLocalAdminAccount({ username: username, password: password, email: email, name: name });
            toast(textMap.createdAdmin, 'success');
            switchPanel('login-panel');
            document.getElementById('login-user').value = username;
            document.getElementById('login-pass').value = '';
            document.getElementById('login-user').focus();
          } catch (error) {
            toast(String(error && error.message || error || textMap.createAdminFailed), 'error');
          }
        });
      }

      bindPageEvent(document.getElementById('login-form'), 'submit', async function (e) {
        e.preventDefault();
        var username = document.getElementById('login-user').value.trim();
        var password = document.getElementById('login-pass').value;
        try {
          var user = await login(username, password);
          if (user) {
            if (user.mustChangePassword) {
              ensureAuthPanel('change-panel');
              wireChangePanel();
              document.getElementById('change-username').value = username;
              document.getElementById('change-current-password').value = password;
              switchPanel('change-panel');
              toast('\u8acb\u5148\u8b8a\u66f4\u5bc6\u78bc\u5f8c\u518d\u9032\u5165\u7cfb\u7d71', 'info');
              return;
            }
            toast('\u767b\u5165\u6210\u529f\uff0c\u6b61\u8fce ' + user.name, 'success');
            try {
              sessionStorage.setItem('__AUTH_BOOTSTRAP_FRESH__', '1');
            } catch (_) {}
            setAppTransitionFlag();
            if (typeof markAuthenticatedBootstrapReady === 'function') {
              try {
                markAuthenticatedBootstrapReady(user);
              } catch (_) {}
            }
            renderApp();
          } else {
            var loginError = document.getElementById('login-error');
            if (loginError) loginError.classList.add('show');
          }
        } catch (error) {
          var loginError = document.getElementById('login-error');
          if (loginError) loginError.classList.add('show');
          toast(String(error && error.message || error || textMap.loginFailed), 'error');
        }
      });

      bindPageEvent(document.getElementById('forgot-link'), 'click', function (e) {
        e.preventDefault();
        ensureAuthPanel('forgot-panel');
        wireForgotPanel();
        switchPanel('forgot-panel');
      });

      var loggedInUser = currentUser();
      if (loggedInUser && loggedInUser.mustChangePassword) {
        ensureAuthPanel('change-panel');
        wireChangePanel();
        switchPanel('change-panel');
        document.getElementById('change-username').value = loggedInUser.username || '';
        var currentPasswordInput = document.getElementById('change-current-password');
        if (currentPasswordInput) currentPasswordInput.focus();
      }

      refreshIcons();
    }


    function renderSidebar() {
      var u = getShellAccessProfile();
      if (!u) return;
      var items = getVisibleItems();
      var pendingCount = items.filter(function (item) { return item.status === STATUSES.PENDING || isOverdue(item); }).length;
      var route = getRoute();
      var nav = '<div class="sidebar-section"><div class="sidebar-section-title">主選單</div>' +
        '<a class="nav-item ' + (route.page === 'dashboard' ? 'active' : '') + '" href="#dashboard"><span class="nav-icon">' + ic('pie-chart') + '</span>儀表板</a>' +
        '<a class="nav-item ' + (route.page === 'list' ? 'active' : '') + '" href="#list"><span class="nav-icon">' + ic('file-text') + '</span>矯正單列表' + (pendingCount ? '<span class="nav-badge">' + pendingCount + '</span>' : '') + '</a>' +
        '<a class="nav-item ' + (route.page === 'checklist' || route.page === 'checklist-fill' || route.page === 'checklist-detail' ? 'active' : '') + '" href="#checklist"><span class="nav-icon">' + ic('clipboard-check') + '</span>內稽檢核表</a>' +
        '<a class="nav-item ' + (route.page === 'training' || route.page === 'training-fill' || route.page === 'training-detail' || route.page === 'training-roster' ? 'active' : '') + '" href="#training"><span class="nav-icon">' + ic('graduation-cap') + '</span>資安教育訓練統計</a></div>';

      var opNav = '';
      if (canCreateCAR()) opNav += '<a class="nav-item ' + (route.page === 'create' ? 'active' : '') + '" href="#create"><span class="nav-icon">' + ic('pen-tool') + '</span>開立矯正單</a>';
      if (canFillChecklist()) opNav += '<a class="nav-item ' + (route.page === 'checklist-fill' ? 'active' : '') + '" href="#checklist-fill"><span class="nav-icon">' + ic('edit-3') + '</span>填報檢核表</a>';
      if (opNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">操作</div>' + opNav + '</div>';

      var sysNav = '';
      if (canManageUsers()) sysNav += '<a class="nav-item ' + (route.page === 'users' ? 'active' : '') + '" href="#users"><span class="nav-icon">' + ic('users') + '</span>帳號管理</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'unit-contact-review' ? 'active' : '') + '" href="#unit-contact-review"><span class="nav-icon">' + ic('mail-plus') + '</span>單位管理人申請</a>';
      if (canManageUsers()) sysNav += '<a class="nav-item ' + (route.page === 'login-log' ? 'active' : '') + '" href="#login-log"><span class="nav-icon">' + ic('shield-check') + '</span>登入紀錄</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'audit-trail' ? 'active' : '') + '" href="#audit-trail"><span class="nav-icon">' + ic('scroll-text') + '</span>操作軌跡</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'security-window' ? 'active' : '') + '" href="#security-window"><span class="nav-icon">' + ic('shield-check') + '</span>資安窗口</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'schema-health' ? 'active' : '') + '" href="#schema-health"><span class="nav-icon">' + ic('database') + '</span>資料健康檢查</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'checklist-manage' ? 'active' : '') + '" href="#checklist-manage"><span class="nav-icon">' + ic('settings') + '</span>檢核表管理</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'training-roster' ? 'active' : '') + '" href="#training-roster"><span class="nav-icon">' + ic('users-round') + '</span>教育訓練名單</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'unit-review' ? 'active' : '') + '" href="#unit-review"><span class="nav-icon">' + ic('building-2') + '</span>單位治理</a>';
      if (sysNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">系統管理</div>' + sysNav + '</div>';

      var sidebarEl = document.getElementById('sidebar');
      if (!sidebarEl) return;
      sidebarEl.innerHTML = '<div class="sidebar-logo"><span class="sidebar-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><div class="sidebar-brand-text"><h1>內部稽核管考追蹤系統</h1><p>ISMS 管考與追蹤平台</p></div></div><nav class="sidebar-nav">' + nav + '</nav><div class="sidebar-footer"><span class="badge-role ' + getRoleBadgeClass(u.role) + '">' + getRoleLabel(u.role) + '</span>' + renderVersionChip('sidebar-version-chip') + '</div>';
      sidebarEl.querySelectorAll('a.nav-item').forEach(function (link) {
        bindPageEvent(link, 'click', function () {
          if (isMobileViewport()) closeSidebar();
        });
      });
    }

    function renderHeader() {
      var u = getShellAccessProfile();
      if (!u) return;
      var route = getRoute();
      var switchHtml = '';
      if (canSwitchAuthorizedUnit(u)) {
        switchHtml = '<label class="header-scope-switch"><span class="header-scope-label">目前單位</span><select class="form-select header-scope-select" id="header-unit-switch" aria-label="切換目前單位">' +
          u.authorizedUnits.map(function (unit) {
            return '<option value="' + esc(unit) + '" ' + (u.activeUnit === unit ? 'selected' : '') + '>' + esc(unit) + '</option>';
          }).join('') +
          '</select></label>';
      }

      var headerEl = document.getElementById('header');
      if (!headerEl) return;
      headerEl.innerHTML = '<div class="header-left"><button type="button" class="header-menu-btn" data-action="shell.toggle-sidebar" aria-label="開啟選單">' + ic('menu') + '</button><div class="header-context" hidden><span class="header-kicker" hidden></span><span class="header-title">' + getRouteTitle(route.page) + '</span></div></div><div class="header-right">' + switchHtml + '<div class="header-user"><span class="header-user-name">' + esc(u.name) + '</span><span class="header-user-role">' + getRoleLabel(u.role) + '</span><div class="header-user-avatar">' + esc(u.name[0]) + '</div></div><button class="btn-logout" data-action="shell.logout">登出</button></div>';

      var switcher = document.getElementById('header-unit-switch');
      if (switcher) {
        bindPageEvent(switcher, 'change', function (event) {
          if (switchCurrentUserUnit(event.target.value)) handleRoute();
        });
      }
    }

    function renderBootstrapShell() {
      renderSidebar();
      renderHeader();
      closeSidebar();
      var appEl = document.getElementById('app');
      if (!appEl) return;
      appEl.innerHTML = '<div class="animate-in"><div class="card"><div class="card-header"><span class="card-title">\u6b63\u5728\u6e96\u5099\u767b\u5165\u74b0\u5883</span></div><p class="page-subtitle" style="margin:0">\u7cfb\u7d71\u6b63\u5728\u78ba\u8a8d\u767b\u5165\u72c0\u614b\u8207\u6b0a\u9650\u8cc7\u6599\uff0c\u5b8c\u6210\u5f8c\u6703\u81ea\u52d5\u9032\u5165\u76ee\u524d\u8def\u7531\u3002</p></div></div>';
      refreshIcons();
    }

    function setRouteLoadingState(isLoading) {
      var app = document.getElementById('app');
      if (!app) return;
      app.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      app.classList.toggle('page-loading', !!isLoading);
    }

    function handleRoute(cachedUser) {
      const route = getRoute();
      const page = ROUTE_WHITELIST[route.page] ? route.page : 'dashboard';
      const user = cachedUser || currentUser();
      if (isPublicRoute(page)) {
        renderPublicPage(page, route.param);
        return;
      }
      if (!user) {
        renderLogin();
        return;
      }
      if (user.mustChangePassword) {
        renderLogin();
        return;
      }
      if (isAuthenticatedRemoteBootstrapPending()) {
        renderBootstrapShell();
        return;
      }
      if (!canAccessRoute(page, route.param)) {
        const fallback = getRouteFallback(page);
        const message = getRouteMeta(page).deniedMessage;
        navigate(fallback, { replace: true });
        if (message) toast(message, 'error');
        return;
      }
      if (typeof beginPageRuntime === 'function') beginPageRuntime();
      renderSidebar();
      renderHeader();
      closeSidebar();
      setRouteLoadingState(true);
      Promise.resolve(getRouteMeta(page).render(route.param))
        .then(function () {
          syncHeaderRouteContext(page);
          focusRouteContent();
        })
        .catch(function (error) {
          window.__ismsError('route render failed:', error);
          toast('\u9801\u9762\u8f09\u5165\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66', 'error');
        })
        .finally(function () {
          setRouteLoadingState(false);
          refreshIcons();
        });
    }

    function renderPublicPage(page, param) {
      if (typeof teardownPageRuntime === 'function') teardownPageRuntime();
      const loggedInUser = currentUser();
      document.body.innerHTML = '<a class="skip-link" href="#app">\u8df3\u5230\u4e3b\u8981\u5167\u5bb9</a><div class="public-shell"><header class="public-header"><a class="public-brand" href="#apply-unit-contact"><span class="public-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><span class="public-brand-text"><strong>\u5167\u90e8\u7a3d\u6838\u7ba1\u8003\u8ffd\u8e64\u7cfb\u7d71</strong><span>ISMS \u7ba1\u8003\u8207\u8ffd\u8e64\u5e73\u53f0</span></span></a><div class="public-header-actions"><a class="btn btn-ghost" href="#apply-unit-contact-status">\u67e5\u8a62\u9032\u5ea6</a>' + (loggedInUser ? '<a class="btn btn-secondary" href="#dashboard">\u9032\u5165\u7cfb\u7d71</a>' : '<a class="btn btn-secondary" href="#">\u767b\u5165\u7cfb\u7d71</a>') + '</div></header><main class="public-main" id="app" tabindex="-1" role="main"></main><div class="toast-container" id="toast-container" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div><div id="modal-root"></div></div>';
      if (typeof beginPageRuntime === 'function') beginPageRuntime();
      setRouteLoadingState(true);
      Promise.resolve(getRouteMeta(page).render(param))
        .then(function () {
          focusRouteContent();
        })
        .catch(function (error) {
          window.__ismsError('public route render failed:', error);
          toast('\u9801\u9762\u8f09\u5165\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66', 'error');
        })
        .finally(function () {
          setRouteLoadingState(false);
          refreshIcons();
        });
    }

    function renderApp() {
      if (typeof teardownPageRuntime === 'function') teardownPageRuntime();
      var u = currentUser();
      if (!u) {
        handleRoute();
        return;
      }
      if (u.mustChangePassword) {
        renderLogin();
        return;
      }
      var showTransitionOverlay = consumeAppTransitionFlag();
      document.body.innerHTML = '<a class="skip-link" href="#app">\u8df3\u5230\u4e3b\u8981\u5167\u5bb9</a><aside class="sidebar" id="sidebar"></aside><div class="sidebar-backdrop" id="sidebar-backdrop" data-action="shell.close-sidebar"></div><header class="header" id="header"></header><main class="main-content" id="app" tabindex="-1" role="main"></main><div class="toast-container" id="toast-container" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div><div id="modal-root"></div>' + (showTransitionOverlay ? renderAppTransitionOverlay() : '');
      if (typeof window !== 'undefined' && window.__REMOTE_BOOTSTRAP_STATE__ === 'ready') {
        handleRoute(u);
        if (showTransitionOverlay) dismissAppTransitionOverlay();
        return;
      }
      renderBootstrapShell();
      Promise.resolve(ensureAuthenticatedRemoteBootstrap()).then(function () {
        var resolvedUser = u || currentUser();
        if (resolvedUser) handleRoute(resolvedUser);
      }).catch(function (error) {
        window.__ismsError(error && error.stack ? error.stack : String(error));
        if (String(error && error.message || '').indexOf('\u767b\u5165\u72c0\u614b\u5df2\u5931\u6548') >= 0) {
          toast('\u767b\u5165\u72c0\u614b\u5df2\u5931\u6548\uff0c\u8acb\u91cd\u65b0\u767b\u5165', 'error');
          handleRoute();
          return;
        }
        handleRoute();
      }).finally(function () {
        if (showTransitionOverlay) dismissAppTransitionOverlay();
      });
    }

    registerActionHandlers('shell', {
      logout: function () {
        if (hasUnsavedChangesGuard() && !confirmDiscardUnsavedChanges('\u76ee\u524d\u6709\u5c1a\u672a\u5132\u5b58\u7684\u5167\u5bb9\uff0c\u78ba\u5b9a\u8981\u767b\u51fa\u55ce\uff1f')) return;
        Promise.resolve(logout()).catch(function (error) {
          window.__ismsError(error && error.stack ? error.stack : String(error));
        });
      },
      'toggle-sidebar': function () { toggleSidebar(); },
      'close-sidebar': function () { closeSidebar(); }
    });

    return {
      renderLogin,
      renderApp,
      renderSidebar,
      renderHeader,
      handleRoute,
      isMobileViewport,
      closeSidebar,
      toggleSidebar
    };
  };
})();




