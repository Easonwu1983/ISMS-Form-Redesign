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
        '<div class="app-transition-title">甇?頛蝟餌絞</div>' +
        '<div class="app-transition-subtitle">?餃??嚗迤?典???銵冽??/div>' +
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
      var shouldShowHeaderContext = !!titleText && (integrated || !hasPageHeader);

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
      document.body.innerHTML = '<a class="skip-link" href="#app">頝喳銝餉??批捆</a><div class="login-page"><main class="login-card" id="app" tabindex="-1" role="main" aria-labelledby="login-page-title">' +
        '<div class="login-logo"><span class="login-logo-icon">' + ntuLogo('ntu-logo-lg') + '</span><h1 id="login-page-title">?折蝔賣蝞∟蕭頩斤頂蝯?/h1><p>ISMS 蝞∟?餈質馱撟喳</p></div>' +
        '<div class="login-error" id="login-error" data-testid="login-error" role="alert" aria-live="assertive" aria-atomic="true">撣唾???蝣潮隤?/div>' +
        '<div id="bootstrap-panel" style="display:' + (needsLocalBootstrap ? 'block' : 'none') + '"><div class="login-entry-card login-entry-card--setup"><div class="login-entry-eyebrow">Setup</div><h2 class="login-entry-title">撱箇??祆?蝞∠??∪董??/h2><p class="login-entry-text">?桀?瘝?隞颱??祆?撣唾????遣蝡?蝯璈恣?撣唾?嚗?敺??餃蝟餌絞??/p><form class="login-form" id="bootstrap-form"><div class="form-group"><label class="form-label">蝞∠??∪???/label><input type="text" class="form-input" id="bootstrap-name" autocomplete="name" placeholder="隢撓?亦恣?憪?" value="?祆?蝞∠??? required></div><div class="form-group"><label class="form-label">蝞∠??∪董??/label><input type="text" class="form-input" id="bootstrap-user" autocomplete="username" placeholder="隢撓?亦?亙董?? required></div><div class="form-group"><label class="form-label">?餃??萎辣</label><input type="email" class="form-input" id="bootstrap-email" autocomplete="email" placeholder="隢撓?仿摮隞? required></div><div class="form-group"><label class="form-label">??撖Ⅳ</label><input type="password" class="form-input" id="bootstrap-pass" autocomplete="new-password" placeholder="?喳? 8 蝣潘??怠之撠神?摮? required></div><button type="submit" class="login-btn">撱箇??祆?蝞∠???/button></form></div></div>' +
        '<div id="login-panel" style="display:' + (needsLocalBootstrap ? 'none' : 'block') + '"><form class="login-form" id="login-form" data-testid="login-form">' +
        '<div class="form-group"><label class="form-label">撣唾?</label><input type="text" class="form-input" id="login-user" data-testid="login-user" autocomplete="username" placeholder="隢撓?亙董?? required autofocus></div>' +
        '<div class="form-group"><label class="form-label">撖Ⅳ</label><input type="password" class="form-input" id="login-pass" data-testid="login-pass" autocomplete="current-password" placeholder="隢撓?亙?蝣? required></div>' +
        '<button type="submit" class="login-btn" data-testid="login-submit">?餃蝟餌絞 ' + ic('arrow-right', 'icon-sm') + '</button>' +
        '</form>' +
        '<div class="login-entry-card"><div class="login-entry-eyebrow">New</div><h2 class="login-entry-title">?唾??桐?蝞∠?鈭箏</h2><p class="login-entry-text">憒??啣?????桐?蝞∠?蝒嚗???桐?蝞∠?鈭箇隢祟?賊?敺?蝟餌絞??亙??典董?蒂撖?亥?閮?/p><div class="login-entry-actions"><a class="btn btn-primary" href="#apply-unit-contact">???唾?</a><a class="btn btn-secondary" href="#apply-unit-contact-status">?亥岷?脣漲</a></div></div>' +
        '<p style="text-align:center;margin-top:14px"><a href="#" id="forgot-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">敹?撖Ⅳ嚗?/a></p></div>' +
        '<div id="change-panel" style="display:none">' +
        '<div style="text-align:center;margin-bottom:18px">' + ic('shield-check', 'icon-xl') + '<h2 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">擐活?餃?霈撖Ⅳ</h2><p style="margin-top:8px;color:var(--text-secondary);font-size:.82rem;line-height:1.6">撖Ⅳ??喳? 8 蝣潘?銝血??怨?之撖怒??撖怨??詨???/p></div>' +
        '<div class="login-error" id="change-error" role="alert" aria-live="assertive" aria-atomic="true">撖Ⅳ霈憭望?</div>' +
        '<form class="login-form" id="change-form"><input type="hidden" id="change-username"><div class="form-group"><label class="form-label">?桀?撖Ⅳ</label><input type="password" class="form-input" id="change-current-password" autocomplete="current-password" placeholder="隢撓?亦??蝣? required></div><div class="form-group"><label class="form-label">?啣?蝣?/label><input type="password" class="form-input" id="change-pass" autocomplete="new-password" placeholder="?喳? 8 蝣? required></div><div class="form-group"><label class="form-label">蝣箄??啣?蝣?/label><input type="password" class="form-input" id="change-pass-confirm" autocomplete="new-password" placeholder="?活頛詨?啣?蝣? required></div><button type="submit" class="login-btn">' + ic('key-round', 'icon-sm') + ' 蝡?湔撖Ⅳ</button></form>' +
        '<p style="text-align:center;margin-top:14px"><a href="#" id="change-back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">餈??餃</a></p></div>' +
        '<div id="forgot-panel" style="display:none">' +
        '<div style="text-align:center;margin-bottom:18px">' + ic('key', 'icon-xl') + '<h2 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">?身撖Ⅳ</h2><p style="margin-top:8px;color:var(--text-secondary);font-size:.82rem;line-height:1.6">?啣?蝣潮??喳? 8 蝣潘?銝血??怨?之撖怒??撖怨??詨???/p></div>' +
        '<div class="login-error" id="forgot-error" role="alert" aria-live="assertive" aria-atomic="true">?曆??啁泵?董???餃??萎辣?蝙?刻?/div>' +
        '<form class="login-form" id="forgot-form"><div class="form-group"><label class="form-label">撣唾?</label><input type="text" class="form-input" id="forgot-username" autocomplete="username" placeholder="隢撓?亙董?? required></div><div class="form-group"><label class="form-label">閮餃??餃??萎辣</label><input type="email" class="form-input" id="forgot-email" autocomplete="email" placeholder="隢撓?亙董??摰??餃??萎辣" required></div><button type="submit" class="login-btn" style="background:linear-gradient(135deg,#f59e0b,#d97706)">' + ic('mail', 'icon-sm') + ' 撖?閮凋縑</button></form>' +
        '<div id="forgot-result" style="display:none;margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px">' +
        '<p style="font-size:.88rem;color:#0f172a;font-weight:600" id="reset-result-title">?身靽∪歇撖</p>' +
        '<p style="font-size:.82rem;color:var(--text-secondary)">撣唾?嚗?strong id="reset-username"></strong></p>' +
        '<p style="font-size:.82rem;color:var(--text-secondary)">????嚗?strong id="reset-expire"></strong></p>' +
        '<p style="font-size:.82rem;color:var(--text-secondary);margin-top:6px" id="reset-result-message"></p>' +
        '<form class="login-form" id="redeem-form" style="margin-top:14px"><input type="hidden" id="redeem-username"><div class="form-group"><label class="form-label">?身隞?Ⅳ</label><input type="text" class="form-input" id="redeem-token" autocomplete="one-time-code" placeholder="隢撓?乩縑隞嗡葉??閮凋誨蝣? required></div><div class="form-group"><label class="form-label">?啣?蝣?/label><input type="password" class="form-input" id="redeem-pass" autocomplete="new-password" placeholder="?喳? 8 蝣? required></div><div class="form-group"><label class="form-label">蝣箄??啣?蝣?/label><input type="password" class="form-input" id="redeem-pass-confirm" autocomplete="new-password" placeholder="?活頛詨?啣?蝣? required></div><button type="submit" class="login-btn">' + ic('check', 'icon-sm') + ' 摰??身</button></form></div>' +
        '<p style="text-align:center;margin-top:14px"><a href="#" id="back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">餈??餃</a></p></div>' +
        '</main></div><div class="toast-container" id="toast-container" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div>';

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
            toast('已建立本機管理員帳號，請使用新帳號登入。', 'success');
            switchPanel('login-panel');
            document.getElementById('login-user').value = username;
            document.getElementById('login-pass').value = '';
            document.getElementById('login-user').focus();
          } catch (error) {
            toast(String(error && error.message || error || '建立本機管理員帳號失敗'), 'error');
          }
        });
      }

      bindPageEvent(document.getElementById('login-form'), 'submit', async function (e) {
        e.preventDefault();
        var u = document.getElementById('login-user').value.trim();
        var p = document.getElementById('login-pass').value;
        try {
          var user = await login(u, p);
          if (user) {
            if (user.mustChangePassword) {
              document.getElementById('change-username').value = u;
              document.getElementById('change-current-password').value = p;
              switchPanel('change-panel');
              toast('隢?霈撖Ⅳ敺??脣蝟餌絞', 'info');
              return;
            }
            toast('?餃??嚗迭餈?' + user.name, 'success');
            try {
              sessionStorage.setItem('__AUTH_BOOTSTRAP_FRESH__', '1');
            } catch (_) { }
            setAppTransitionFlag();
            if (typeof markAuthenticatedBootstrapReady === 'function') {
              try {
                markAuthenticatedBootstrapReady(user);
              } catch (_) { }
            }
            renderApp();
          } else {
            var loginError = document.getElementById('login-error');
            if (loginError) loginError.classList.add('show');
          }
        } catch (error) {
          var loginError = document.getElementById('login-error');
          if (loginError) loginError.classList.add('show');
          toast(String(error && error.message || error || '?餃憭望?'), 'error');
        }
      });

      bindPageEvent(document.getElementById('change-form'), 'submit', async function (e) {
        e.preventDefault();
        var username = document.getElementById('change-username').value.trim();
        var currentPassword = document.getElementById('change-current-password').value;
        var nextPassword = document.getElementById('change-pass').value;
        var confirmPassword = document.getElementById('change-pass-confirm').value;
        if (nextPassword !== confirmPassword) {
          document.getElementById('change-error').textContent = '新密碼與確認密碼不一致';
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
            document.getElementById('change-error').textContent = '密碼更新失敗';
            var changeError = document.getElementById('change-error');
            if (changeError) changeError.classList.add('show');
            return;
          }
          toast('密碼已更新，請使用新密碼重新登入。', 'success');
          switchPanel('login-panel');
          document.getElementById('login-user').value = username;
          document.getElementById('login-pass').value = '';
        } catch (error) {
          document.getElementById('change-error').textContent = String(error && error.message || error || '密碼更新失敗');
          var changeError = document.getElementById('change-error');
          if (changeError) changeError.classList.add('show');
        }
      });

      bindPageEvent(document.getElementById('forgot-link'), 'click', function (e) {
        e.preventDefault();
        switchPanel('forgot-panel');
      });

      bindPageEvent(document.getElementById('back-login-link'), 'click', function (e) {
        e.preventDefault();
        switchPanel('login-panel');
      });

      bindPageEvent(document.getElementById('change-back-login-link'), 'click', function (e) {
        e.preventDefault();
        switchPanel('login-panel');
      });

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
          document.getElementById('reset-expire').textContent = resetResult.resetTokenExpiresAt || '稍後再次嘗試';
          var deliveredByMail = !!(resetResult.delivery && resetResult.delivery.sent);
          document.getElementById('reset-result-title').textContent = deliveredByMail ? '重設信已寄出' : '無法寄送重設信';
          document.getElementById('reset-result-message').textContent = deliveredByMail
            ? ('系統已將重設密碼通知寄到 ' + (resetResult.user.email || email) + '，請依信件說明完成後續操作。')
            : '系統目前無法寄送重設通知，請稍後再試或由管理員協助處理。';
          document.getElementById('redeem-username').value = resetResult.user.username;
          document.getElementById('redeem-token').value = '';
          document.getElementById('redeem-form').style.display = deliveredByMail ? '' : 'none';
          document.getElementById('forgot-result').style.display = 'block';
          toast(deliveredByMail ? '重設信已寄出' : '無法寄送重設信', deliveredByMail ? 'success' : 'error');
        } catch (error) {
          document.getElementById('forgot-error').textContent = String(error && error.message || error || '密碼重設申請失敗');
          var forgotError = document.getElementById('forgot-error');
          if (forgotError) forgotError.classList.add('show');
        }
      });

      bindPageEvent(document.getElementById('redeem-form'), 'submit', async function (e) {
        e.preventDefault();
        var username = document.getElementById('redeem-username').value.trim();
        var token = document.getElementById('redeem-token').value.trim();
        var nextPassword = document.getElementById('redeem-pass').value;
        var confirmPassword = document.getElementById('redeem-pass-confirm').value;
        if (nextPassword !== confirmPassword) {
          toast('新密碼與確認密碼不一致', 'error');
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
            toast('重設密碼失敗', 'error');
            return;
          }
          toast('密碼已重設，請重新登入', 'success');
            renderApp();
        } catch (error) {
          toast(String(error && error.message || error || '重設密碼失敗'), 'error');
        }
      });

      var loggedInUser = currentUser();
      if (loggedInUser && loggedInUser.mustChangePassword) {
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
      appEl.innerHTML = '<div class="animate-in"><div class="card"><div class="card-header"><span class="card-title">甇??郊蝟餌絞鞈?</span></div><p class="page-subtitle" style="margin:0">甇?撽??餃??蒂?郊?舀迤?柴炎?貉”???脰?蝺渲???摰?敺??芸?頛???/p></div></div>';
      refreshIcons();
    }

    function setRouteLoadingState(isLoading) {
      var app = document.getElementById('app');
      if (!app) return;
      app.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      app.classList.toggle('page-loading', !!isLoading);
    }

    function handleRoute() {
      const route = getRoute();
      const page = ROUTE_WHITELIST[route.page] ? route.page : 'dashboard';
      if (isPublicRoute(page)) {
        renderPublicPage(page, route.param);
        return;
      }
      if (!currentUser()) {
        renderLogin();
        return;
      }
      if (currentUser() && currentUser().mustChangePassword) {
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
          toast('?頛憭望?嚗?蝔??岫', 'error');
        })
        .finally(function () {
          setRouteLoadingState(false);
          refreshIcons();
        });
    }

    function renderPublicPage(page, param) {
      if (typeof teardownPageRuntime === 'function') teardownPageRuntime();
      document.body.innerHTML = '<a class="skip-link" href="#app">頝喳銝餉??批捆</a><div class="public-shell"><header class="public-header"><a class="public-brand" href="#apply-unit-contact"><span class="public-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><span class="public-brand-text"><strong>?折蝔賣蝞∟蕭頩斤頂蝯?/strong><span>ISMS 蝞∟?餈質馱撟喳</span></span></a><div class="public-header-actions"><a class="btn btn-ghost" href="#apply-unit-contact-status">?亥岷?脣漲</a>' + (currentUser() ? '<a class="btn btn-secondary" href="#dashboard">?脣蝟餌絞</a>' : '<a class="btn btn-secondary" href="#">?餃蝟餌絞</a>') + '</div></header><main class="public-main" id="app" tabindex="-1" role="main"></main><div class="toast-container" id="toast-container" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div><div id="modal-root"></div></div>';
      if (typeof beginPageRuntime === 'function') beginPageRuntime();
      setRouteLoadingState(true);
      Promise.resolve(getRouteMeta(page).render(param))
        .then(function () {
          focusRouteContent();
        })
        .catch(function (error) {
          window.__ismsError('public route render failed:', error);
          toast('?頛憭望?嚗?蝔??岫', 'error');
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
      document.body.innerHTML = '<a class="skip-link" href="#app">頝喳銝餉??批捆</a><aside class="sidebar" id="sidebar"></aside><div class="sidebar-backdrop" id="sidebar-backdrop" data-action="shell.close-sidebar"></div><header class="header" id="header"></header><main class="main-content" id="app" tabindex="-1" role="main"></main><div class="toast-container" id="toast-container" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div><div id="modal-root"></div>' + (showTransitionOverlay ? renderAppTransitionOverlay() : '');
      if (typeof window !== 'undefined' && window.__REMOTE_BOOTSTRAP_STATE__ === 'ready') {
        handleRoute();
        if (showTransitionOverlay) dismissAppTransitionOverlay();
        return;
      }
      renderBootstrapShell();
      Promise.resolve(ensureAuthenticatedRemoteBootstrap()).then(function () {
        if (currentUser()) handleRoute();
      }).catch(function (error) {
        window.__ismsError(error && error.stack ? error.stack : String(error));
        if (String(error && error.message || '').indexOf('?餃??歇憭望?') >= 0) {
          toast('?餃??歇憭望?嚗???餃', 'error');
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
        if (hasUnsavedChangesGuard() && !confirmDiscardUnsavedChanges('?桀????芸摮??批捆嚗Ⅱ摰??餃??')) return;
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



