// @ts-check
﻿(function () {
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

    // Global error boundary — prevent white screen on JS crash
    if (typeof window !== 'undefined') {
      window.addEventListener('error', function (event) {
        const app = document.getElementById('app');
        if (app && !app.querySelector('.error-boundary')) {
          app.innerHTML = '<div class="error-boundary" style="padding:48px 24px;text-align:center;max-width:500px;margin:0 auto">'
            + '<div style="font-size:2rem;margin-bottom:16px">⚠️</div>'
            + '<h2 style="font-size:1.2rem;font-weight:700;color:#1e293b;margin-bottom:8px">系統發生錯誤</h2>'
            + '<p style="color:#64748b;margin-bottom:16px">請重新整理頁面，如果問題持續請聯繫管理員。</p>'
            + '<button onclick="location.reload()" style="padding:10px 24px;background:#2459a9;color:#fff;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer">重新整理</button>'
            + '<p style="font-size:0.75rem;color:#94a3b8;margin-top:12px">' + (event.message || '未知錯誤') + '</p>'
            + '</div>';
        }
      });
    }

    let isSidebarOpen = false;

    // ── Notification Center state ──────────────────────────────────────
    let notifPollTimer = null;
    let notifDropdownOpen = false;
    const NOTIF_POLL_INTERVAL_MS = 60000;

    function getNotifApiBase() {
      if (window._m365ApiClient && typeof window._m365ApiClient === 'object' && typeof window._m365ApiClient.getBaseUrl === 'function') {
        return window._m365ApiClient.getBaseUrl() || '';
      }
      try {
        if (window.__ISMS_BOOTSTRAP__ && typeof window.__ISMS_BOOTSTRAP__.resolveM365ApiClient === 'function') {
          var cl = window.__ISMS_BOOTSTRAP__.resolveM365ApiClient();
          if (cl && typeof cl.getBaseUrl === 'function') return cl.getBaseUrl() || '';
        }
      } catch (_) {}
      return '';
    }

    function getNotifAuthHeaders() {
      if (window._m365ApiClient && typeof window._m365ApiClient === 'object' && typeof window._m365ApiClient.getAuthHeaders === 'function') {
        return window._m365ApiClient.getAuthHeaders() || {};
      }
      try {
        if (window.__ISMS_BOOTSTRAP__ && typeof window.__ISMS_BOOTSTRAP__.resolveM365ApiClient === 'function') {
          var cl = window.__ISMS_BOOTSTRAP__.resolveM365ApiClient();
          if (cl && typeof cl.getAuthHeaders === 'function') return cl.getAuthHeaders() || {};
        }
      } catch (_) {}
      return {};
    }

    function notifFetchJson(path) {
      var base = getNotifApiBase();
      return fetch(base + path, {
        method: 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, getNotifAuthHeaders())
      }).then(function (r) { return r.json(); });
    }

    function notifPostJson(path, body) {
      var base = getNotifApiBase();
      return fetch(base + path, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, getNotifAuthHeaders()),
        body: JSON.stringify(body)
      }).then(function (r) { return r.json(); });
    }

    function updateNotifBadge(count) {
      var badge = document.getElementById('notif-badge');
      if (!badge) return;
      var n = Math.max(0, Number(count) || 0);
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = n > 0 ? 'inline-block' : 'none';
    }

    function pollNotifCount() {
      if (!currentUser()) return;
      notifFetchJson('/api/notifications/count').then(function (json) {
        var body = json && json.jsonBody ? json.jsonBody : json;
        if (body && body.ok) updateNotifBadge(body.count);
      }).catch(function () { /* silent */ });
    }

    function startNotifPolling() {
      stopNotifPolling();
      pollNotifCount();
      notifPollTimer = setInterval(pollNotifCount, NOTIF_POLL_INTERVAL_MS);
    }

    function stopNotifPolling() {
      if (notifPollTimer) { clearInterval(notifPollTimer); notifPollTimer = null; }
    }

    function renderNotifItem(item) {
      var readClass = item.read ? 'opacity:0.55;' : 'font-weight:600;';
      var timeStr = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-TW') : '';
      return '<div class="notif-item" data-notif-id="' + esc(String(item.id)) + '" style="padding:10px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer;' + readClass + '">'
        + '<div style="font-size:0.84rem;color:#1e293b">' + esc(item.title) + '</div>'
        + (item.message ? '<div style="font-size:0.78rem;color:#64748b;margin-top:2px">' + esc(item.message) + '</div>' : '')
        + '<div style="font-size:0.7rem;color:#94a3b8;margin-top:4px">' + esc(timeStr) + '</div>'
        + '</div>';
    }

    function loadNotifDropdown() {
      var content = document.getElementById('notif-dropdown-content');
      if (!content) return;
      content.innerHTML = '<div style="padding:12px;text-align:center;color:#94a3b8;font-size:0.82rem">載入中…</div>';
      notifFetchJson('/api/notifications').then(function (json) {
        var body = json && json.jsonBody ? json.jsonBody : json;
        if (!body || !body.ok || !Array.isArray(body.items) || !body.items.length) {
          content.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:0.82rem">沒有通知</div>';
          return;
        }
        content.innerHTML = '<div style="padding:8px 14px;font-size:0.78rem;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0">通知中心</div>'
          + body.items.map(renderNotifItem).join('');
        content.querySelectorAll('.notif-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var id = Number(el.getAttribute('data-notif-id'));
            if (id) {
              notifPostJson('/api/notifications/read', { id: id }).then(function () {
                pollNotifCount();
              }).catch(function () {});
              el.style.opacity = '0.55';
              el.style.fontWeight = 'normal';
            }
          });
        });
      }).catch(function () {
        content.innerHTML = '<div style="padding:16px;text-align:center;color:#dc2626;font-size:0.82rem">載入失���</div>';
      });
    }

    function toggleNotifDropdown() {
      var dd = document.getElementById('notif-dropdown');
      if (!dd) return;
      notifDropdownOpen = !notifDropdownOpen;
      dd.style.display = notifDropdownOpen ? 'block' : 'none';
      if (notifDropdownOpen) loadNotifDropdown();
    }

    function closeNotifDropdown() {
      notifDropdownOpen = false;
      var dd = document.getElementById('notif-dropdown');
      if (dd) dd.style.display = 'none';
    }

    function bindNotifBell() {
      var btn = document.getElementById('notif-bell-btn');
      if (btn) {
        bindPageEvent(btn, 'click', function (event) {
          event.stopPropagation();
          toggleNotifDropdown();
        });
      }
      // Close dropdown when clicking outside
      document.addEventListener('click', function (event) {
        var wrap = document.getElementById('notif-bell-wrap');
        if (wrap && !wrap.contains(event.target)) closeNotifDropdown();
      });
    }

    function isPublicRoute(page) {
      return !!(page && ROUTE_WHITELIST[page] && ROUTE_WHITELIST[page].public);
    }

    function normalizeUnitList(units) {
      const source = Array.isArray(units) ? units : [];
      return Array.from(new Set(source.map(function (unit) {
        return String(unit || '').trim();
      }).filter(Boolean)));
    }

    function getShellAccessProfile(user) {
      const base = user || currentUser();
      if (!base) return null;
      const authorizedUnits = normalizeUnitList(
        Array.isArray(base.authorizedUnits) && base.authorizedUnits.length
          ? base.authorizedUnits
          : getAuthorizedUnits(base)
      );
      const activeUnit = String(base.activeUnit || getScopedUnit(base) || base.primaryUnit || base.unit || authorizedUnits[0] || '').trim();
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
      const manifest = window.__APP_ASSET_MANIFEST__ && typeof window.__APP_ASSET_MANIFEST__ === 'object'
        ? window.__APP_ASSET_MANIFEST__
        : {};
      let buildInfo = window.__APP_BUILD_INFO__ && typeof window.__APP_BUILD_INFO__ === 'object'
        ? window.__APP_BUILD_INFO__
        : {};
      if ((!buildInfo || !buildInfo.versionKey) && manifest.buildInfo && typeof manifest.buildInfo === 'object') {
        buildInfo = manifest.buildInfo;
      }
      return buildInfo && typeof buildInfo === 'object' ? buildInfo : {};
    }

    function getBuildVersionText() {
      const buildInfo = getBuildInfo();
      const versionKey = String(buildInfo.versionKey || buildInfo.shortCommit || buildInfo.describe || '').trim();
      if (!versionKey) return 'vlocal';
      // Truncate long hashes for readability: "c11951764abe" → "v1195"
      var display = versionKey.length > 8 ? versionKey.substring(0, 7) : versionKey;
      return 'v' + display;
    }

    function getBuildVersionTitle() {
      const buildInfo = getBuildInfo();
      const parts = [];
      if (buildInfo.platform) parts.push('平台: ' + buildInfo.platform);
      if (buildInfo.versionKey) parts.push('版本: ' + buildInfo.versionKey);
      if (buildInfo.commit) parts.push('Commit: ' + buildInfo.commit);
      if (buildInfo.branch) parts.push('分支: ' + buildInfo.branch);
      if (buildInfo.builtAt) parts.push('建置時間: ' + buildInfo.builtAt);
      if (buildInfo.describe) parts.push('描述: ' + buildInfo.describe);
      return parts.length ? parts.join(' / ') : '版本資訊不可用';
    }

    function renderVersionChip(extraClass) {
      const classes = ['app-version-chip'];
      if (extraClass) classes.push(extraClass);
      return '<span class="' + classes.join(' ') + '" data-testid="app-version-chip" title="' + esc(getBuildVersionTitle()) + '">' + esc(getBuildVersionText()) + '</span>';
    }

    function validatePasswordComplexity(password) {
      const value = String(password || '');
      if (value.length < 8) return '密碼至少需要 8 碼';
      if (!/[a-z]/.test(value)) return '密碼至少需要一個小寫英文字母';
      if (!/[A-Z]/.test(value)) return '密碼至少需要一個大寫英文字母';
      if (!/[0-9]/.test(value)) return '密碼至少需要一個數字';
      if (!/[!@#$%&*_+\-=]/.test(value)) return '密碼至少需要一個特殊符號（如 !@#$%&*）';
      return '';
    }

    const AUTH_STORAGE_KEY = 'cats_auth';
    const AUTH_VERIFY_CACHE_KEY = '__AUTH_VERIFY_CACHE__';
    const AUTH_BOOTSTRAP_FRESH_KEY = '__AUTH_BOOTSTRAP_FRESH__';
    const AUTH_APP_TRANSITION_KEY = '__AUTH_APP_TRANSITION__';

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
      } catch (_) { /* storage may be unavailable in private browsing */ }
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
      const parsed = Date.parse(String(value || '').trim());
      return Number.isFinite(parsed) && parsed <= Date.now();
    }

    function purgeStaleLoginState() {
      const localRaw = safeReadStorage(window.localStorage, AUTH_STORAGE_KEY);
      const sessionRaw = safeReadStorage(window.sessionStorage, AUTH_STORAGE_KEY);
      const verifyRaw = safeReadStorage(window.sessionStorage, AUTH_VERIFY_CACHE_KEY);
      if (!localRaw && !sessionRaw && !verifyRaw) return false;

      const localAuth = parseJsonOrNull(localRaw);
      const sessionAuth = parseJsonOrNull(sessionRaw);
      const verifyCache = parseJsonOrNull(verifyRaw);
      const auth = localAuth || sessionAuth;
      let shouldClear = false;

      if ((localRaw && !localAuth) || (sessionRaw && !sessionAuth) || (verifyRaw && !verifyCache)) {
        shouldClear = true;
      }
      if (auth) {
        const sessionToken = String(auth.sessionToken || '').trim();
        const sessionExpiresAt = String(auth.sessionExpiresAt || '').trim();
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
      } catch (_) { /* sessionStorage unavailable */ }
    }

    function consumeAppTransitionFlag() {
      try {
        const enabled = String(window.sessionStorage.getItem(AUTH_APP_TRANSITION_KEY) || '').trim() === '1';
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
        const overlay = document.getElementById('app-transition-overlay');
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

    const HEADER_INTEGRATED_ROUTES = {
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
      'checklist-compare': true,
      'unit-review': true,
      training: true,
      'training-roster': true
    };

    function setHeaderContextText(selector, value) {
      const node = document.querySelector(selector);
      if (!node) return;
      node.textContent = String(value || '').trim();
    }

    function syncHeaderRouteContext(page) {
      const headerEl = document.getElementById('header');
      const app = document.getElementById('app');
      if (!headerEl || !app) return;

      const routePage = String(page || '').trim() || 'dashboard';
      const pageHeader = app.querySelector('.page-header');
      const eyebrow = app.querySelector('.page-header .page-eyebrow, .dashboard-hero-eyebrow');
      const title = app.querySelector('[data-route-heading], .page-header .page-title');
      const kickerText = eyebrow && eyebrow.textContent ? eyebrow.textContent.trim() : '';
      const titleText = title && title.textContent ? title.textContent.trim() : getRouteTitle(routePage);
      const headerContext = headerEl.querySelector('.header-context');
      const kickerEl = headerEl.querySelector('.header-kicker');
      const integrated = !!HEADER_INTEGRATED_ROUTES[routePage];
      const hasPageHeader = !!pageHeader;
      const shouldShowHeaderContext = !!titleText && !hasPageHeader;

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
        const heading = document.querySelector('[data-route-heading]');
        if (heading && typeof heading.focus === 'function') {
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: false });
          return;
        }
        const main = document.getElementById('app');
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
      if (typeof window !== 'undefined') {
        window.__APP_READY__ = false;
      }
      const authMode = getAuthMode();
      const bootstrapPanelDisplay = 'none';
      const loginPanelDisplay = 'block';
      const bootstrapAutoFocus = '';
      const loginAutoFocus = authMode === 'm365-api' ? 'autofocus' : '';
      const _t = window.__i18n__ && typeof window.__i18n__.t === 'function' ? window.__i18n__.t : function (k, fb) { return fb || k; };
      const textMap = {
        skip: _t('login.skip', '\u8df3\u5230\u4e3b\u8981\u5167\u5bb9'),
        title: _t('login.title', '\u8cc7\u8a0a\u5b89\u5168\u7ba1\u7406\u7cfb\u7d71'),
        subtitle: _t('login.subtitle', 'Information Security Management System'),
        loginError: _t('login.error', '\u5e33\u865f\u6216\u5bc6\u78bc\u932f\u8aa4'),
        setupTitle: _t('login.setupTitle', '\u5efa\u7acb\u672c\u6a5f\u7ba1\u7406\u54e1\u5e33\u865f'),
        setupText: _t('login.setupText', '\u76ee\u524d\u6c92\u6709\u4efb\u4f55\u672c\u6a5f\u5e33\u865f\uff0c\u8acb\u5148\u5efa\u7acb\u4e00\u7d44\u672c\u6a5f\u7ba1\u7406\u54e1\u5e33\u865f\uff0c\u4e4b\u5f8c\u518d\u767b\u5165\u7cfb\u7d71\u3002'),
        adminName: _t('login.adminName', '\u7ba1\u7406\u54e1\u59d3\u540d'),
        adminUser: _t('login.adminUser', '\u7ba1\u7406\u54e1\u5e33\u865f'),
        email: _t('login.email', '\u96fb\u5b50\u90f5\u4ef6'),
        initPassword: _t('login.initPassword', '\u521d\u59cb\u5bc6\u78bc'),
        placeholderName: _t('login.placeholderName', '\u8acb\u8f38\u5165\u7ba1\u7406\u54e1\u59d3\u540d'),
        placeholderUser: _t('login.placeholderUser', '\u8acb\u8f38\u5165\u767b\u5165\u5e33\u865f'),
        placeholderEmail: _t('login.placeholderEmail', '\u8acb\u8f38\u5165\u96fb\u5b50\u90f5\u4ef6'),
        placeholderPassword: _t('login.placeholderPassword', '\u81f3\u5c11 8 \u78bc\uff0c\u542b\u5927\u5c0f\u5beb\u3001\u6578\u5b57\u8207\u7279\u6b8a\u7b26\u865f'),
        defaultAdminName: _t('login.defaultAdminName', '\u672c\u6a5f\u7ba1\u7406\u54e1'),
        createAdmin: _t('login.createAdmin', '\u5efa\u7acb\u672c\u6a5f\u7ba1\u7406\u54e1'),
        account: _t('login.account', '\u5e33\u865f'),
        password: _t('login.password', '\u5bc6\u78bc'),
        loginAction: _t('login.submit', '\u767b\u5165\u7cfb\u7d71'),
        firstUseTitle: _t('login.apply', '\u7533\u8acb\u55ae\u4f4d\u7ba1\u7406\u4eba\u54e1'),
        firstUseText: _t('login.applyDesc', '\u5982\u9700\u65b0\u589e\u6216\u7570\u52d5\u5404\u55ae\u4f4d\u7ba1\u7406\u7a97\u53e3\uff0c\u8acb\u5148\u9001\u51fa\u55ae\u4f4d\u7ba1\u7406\u4eba\u7533\u8acb\u3002\u5be9\u6838\u901a\u904e\u5f8c\uff0c\u7cfb\u7d71\u6703\u76f4\u63a5\u555f\u7528\u5e33\u865f\u4e26\u5bc4\u9001\u767b\u5165\u8cc7\u8a0a\u3002'),
        applyUnitContact: _t('login.goApply', '\u524d\u5f80\u7533\u8acb'),
        checkProgress: _t('login.checkStatus', '\u67e5\u8a62\u9032\u5ea6'),
        forgotPassword: _t('login.forgot', '\u5fd8\u8a18\u5bc6\u78bc\uff1f'),
        changeTitle: '\u9996\u6b21\u767b\u5165\u9700\u8b8a\u66f4\u5bc6\u78bc',
        passwordRule: '\u5bc6\u78bc\u9700\u81f3\u5c11 8 \u78bc\uff0c\u4e26\u5305\u542b\u82f1\u6587\u5927\u5beb\u3001\u82f1\u6587\u5c0f\u5beb\u3001\u6578\u5b57\u8207\u7279\u6b8a\u7b26\u865f\uff08\u5982 !@#$%&*\uff09\u3002',
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
        '<div id="login-panel" style="display:' + loginPanelDisplay + '"><form class="login-form" id="login-form" data-testid="login-form"><div class="form-group"><label class="form-label">' + textMap.account + '</label><input type="text" class="form-input" id="login-user" data-testid="login-user" autocomplete="username" placeholder="' + textMap.placeholderUser + '" required ' + loginAutoFocus + '></div><div class="form-group"><label class="form-label">' + textMap.password + '</label><input type="password" class="form-input" id="login-pass" data-testid="login-pass" autocomplete="current-password" placeholder="' + textMap.password + '" required></div><button type="submit" class="login-btn" data-testid="login-submit">' + textMap.loginAction + ' ' + ic('arrow-right', 'icon-sm') + '</button></form>' +
        '<div class="login-entry-card"><div class="login-entry-eyebrow">New</div><h2 class="login-entry-title">' + textMap.firstUseTitle + '</h2><p class="login-entry-text">' + textMap.firstUseText + '</p><div class="login-entry-actions"><a class="btn btn-primary" href="#apply-unit-contact">' + textMap.applyUnitContact + '</a><a class="btn btn-secondary" href="#apply-unit-contact-status">' + textMap.checkProgress + '</a></div></div><p style="text-align:center;margin-top:14px"><a href="#" id="forgot-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">' + textMap.forgotPassword + '</a></p><div style="text-align:center;margin-top:8px"><button type="button" id="login-lang-toggle" style="background:none;border:1px solid var(--border-color);border-radius:20px;padding:5px 16px;font-size:.82rem;color:var(--text-secondary);cursor:pointer;transition:all .15s ease">' + ic('globe', 'icon-xs') + ' ' + (((window.__i18n__ && window.__i18n__.getLang()) || 'zh-TW') === 'zh-TW' ? 'Switch to English' : '切換為繁體中文') + '</button></div></div>' +
        '<div id="bootstrap-panel" style="display:' + bootstrapPanelDisplay + '"><div class="login-entry-card login-entry-card--setup"><div class="login-entry-eyebrow">Setup</div><h2 class="login-entry-title">' + textMap.setupTitle + '</h2><p class="login-entry-text">' + textMap.setupText + '</p><form class="login-form" id="bootstrap-form"><div class="form-group"><label class="form-label">' + textMap.adminName + '</label><input type="text" class="form-input" id="bootstrap-name" autocomplete="name" placeholder="' + textMap.placeholderName + '" value="' + textMap.defaultAdminName + '" required ' + bootstrapAutoFocus + '></div><div class="form-group"><label class="form-label">' + textMap.adminUser + '</label><input type="text" class="form-input" id="bootstrap-user" autocomplete="username" placeholder="' + textMap.placeholderUser + '" required></div><div class="form-group"><label class="form-label">' + textMap.email + '</label><input type="email" class="form-input" id="bootstrap-email" autocomplete="email" placeholder="' + textMap.placeholderEmail + '" required></div><div class="form-group"><label class="form-label">' + textMap.initPassword + '</label><input type="password" class="form-input" id="bootstrap-pass" autocomplete="new-password" placeholder="' + textMap.placeholderPassword + '" required></div><button type="submit" class="login-btn">' + textMap.createAdmin + '</button></form></div></div>' +
        '<div id="auth-secondary-panels"></div>' +
        '</main></div><div class="toast-container" id="toast-container" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div>';
      if (typeof window !== 'undefined') {
        window.__APP_READY__ = true;
        if (authMode !== 'm365-api' && typeof window.setTimeout === 'function') {
          window.setTimeout(function () {
            try {
              if (typeof hasLocalUsers !== 'function') return;
              const bootstrapPanel = document.getElementById('bootstrap-panel');
              const loginPanel = document.getElementById('login-panel');
              if (!bootstrapPanel || !loginPanel) return;
              const active = typeof document !== 'undefined' ? document.activeElement : null;
              if (active && active !== document.body) {
                if (typeof active.closest === 'function' && (active.closest('#login-form') || active.closest('#bootstrap-form'))) {
                  return;
                }
              }
              if (hasLocalUsers()) {
                const loginUser = document.getElementById('login-user');
                if (loginUser && typeof loginUser.focus === 'function' && document.activeElement === document.body) {
                  loginUser.focus({ preventScroll: true });
                }
                return;
              }
              bootstrapPanel.style.display = 'block';
              loginPanel.style.display = 'none';
              const bootstrapName = document.getElementById('bootstrap-name');
              if (bootstrapName && typeof bootstrapName.focus === 'function') {
                bootstrapName.focus({ preventScroll: true });
              }
            } catch (error) {
              if (window.__ismsWarn) window.__ismsWarn('login bootstrap check failed', error);
            }
          }, 0);
        }
      }

      function buildChangePanelHtml() {
        return '<div id="change-panel" style="display:none"><div style="text-align:center;margin-bottom:18px">' + ic('shield-check', 'icon-xl') + '<h2 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">' + textMap.changeTitle + '</h2><p style="margin-top:8px;color:var(--text-secondary);font-size:.82rem;line-height:1.6">' + textMap.passwordRule + '</p></div><div class="login-error" id="change-error" role="alert" aria-live="assertive" aria-atomic="true">' + textMap.changeError + '</div><form class="login-form" id="change-form"><input type="hidden" id="change-username"><div class="form-group"><label class="form-label">' + textMap.currentPassword + '</label><input type="password" class="form-input" id="change-current-password" autocomplete="current-password" placeholder="' + textMap.currentPassword + '" required></div><div class="form-group"><label class="form-label">' + textMap.newPassword + '</label><input type="password" class="form-input" id="change-pass" autocomplete="new-password" placeholder="' + textMap.placeholderPassword + '" required></div><div class="form-group"><label class="form-label">' + textMap.confirmNewPassword + '</label><input type="password" class="form-input" id="change-pass-confirm" autocomplete="new-password" placeholder="' + textMap.confirmNewPassword + '" required></div><button type="submit" class="login-btn">' + ic('key-round', 'icon-sm') + ' ' + textMap.updatePassword + '</button></form><p style="text-align:center;margin-top:14px"><a href="#" id="change-back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">' + textMap.backToLogin + '</a></p></div>';
      }

      function buildForgotPanelHtml() {
        return '<div id="forgot-panel" style="display:none"><div style="text-align:center;margin-bottom:18px">' + ic('key', 'icon-xl') + '<h2 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">' + textMap.resetTitle + '</h2><p style="margin-top:8px;color:var(--text-secondary);font-size:.82rem;line-height:1.6">' + textMap.passwordRule + '</p></div><div class="login-error" id="forgot-error" role="alert" aria-live="assertive" aria-atomic="true">' + textMap.resetError + '</div><form class="login-form" id="forgot-form"><div class="form-group"><label class="form-label">' + textMap.account + '</label><input type="text" class="form-input" id="forgot-username" autocomplete="username" placeholder="' + textMap.placeholderUser + '" required></div><div class="form-group"><label class="form-label">' + textMap.registeredEmail + '</label><input type="email" class="form-input" id="forgot-email" autocomplete="email" placeholder="' + textMap.registeredEmailPlaceholder + '" required></div><button type="submit" class="login-btn" style="background:linear-gradient(135deg,#f59e0b,#d97706)">' + ic('mail', 'icon-sm') + ' ' + textMap.sendReset + '</button></form><div id="forgot-result" style="display:none;margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px"><p style="font-size:.88rem;color:#0f172a;font-weight:600" id="reset-result-title">' + textMap.resetSent + '</p><p style="font-size:.82rem;color:var(--text-secondary)">' + textMap.accountPrefix + '<strong id="reset-username"></strong></p><p style="font-size:.82rem;color:var(--text-secondary)">' + textMap.expiryPrefix + '<strong id="reset-expire"></strong></p><p style="font-size:.82rem;color:var(--text-secondary);margin-top:6px" id="reset-result-message"></p><form class="login-form" id="redeem-form" style="margin-top:14px"><input type="hidden" id="redeem-username"><div class="form-group"><label class="form-label">\u91cd\u8a2d\u4ee3\u78bc</label><input type="text" class="form-input" id="redeem-token" autocomplete="one-time-code" placeholder="\u8acb\u8f38\u5165\u4fe1\u4ef6\u4e2d\u7684\u91cd\u8a2d\u4ee3\u78bc" required></div><div class="form-group"><label class="form-label">' + textMap.newPassword + '</label><input type="password" class="form-input" id="redeem-pass" autocomplete="new-password" placeholder="' + textMap.placeholderPassword + '" required></div><div class="form-group"><label class="form-label">' + textMap.confirmNewPassword + '</label><input type="password" class="form-input" id="redeem-pass-confirm" autocomplete="new-password" placeholder="' + textMap.confirmNewPassword + '" required></div><button type="submit" class="login-btn">' + ic('check', 'icon-sm') + ' \u5b8c\u6210\u91cd\u8a2d</button></form></div><p style="text-align:center;margin-top:14px"><a href="#" id="back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">' + textMap.backToLogin + '</a></p></div>';
      }

      function ensureAuthPanel(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) return panel;
        const host = document.getElementById('auth-secondary-panels');
        if (!host) return null;
        if (panelId === 'change-panel') {
          host.insertAdjacentHTML('beforeend', buildChangePanelHtml());
        } else if (panelId === 'forgot-panel') {
          host.insertAdjacentHTML('beforeend', buildForgotPanelHtml());
        }
        return document.getElementById(panelId);
      }

      function wireChangePanel() {
        const panel = ensureAuthPanel('change-panel');
        if (!panel || panel.dataset.authBound === '1') return panel;
        panel.dataset.authBound = '1';
        bindPageEvent(document.getElementById('change-form'), 'submit', async function (e) {
          e.preventDefault();
          const username = document.getElementById('change-username').value.trim();
          const currentPassword = document.getElementById('change-current-password').value;
          const nextPassword = document.getElementById('change-pass').value;
          const confirmPassword = document.getElementById('change-pass-confirm').value;
          if (nextPassword !== confirmPassword) {
            document.getElementById('change-error').textContent = textMap.changeMismatch;
            const changeError = document.getElementById('change-error');
            if (changeError) changeError.classList.add('show');
            return;
          }
          const changePasswordError = validatePasswordComplexity(nextPassword);
          if (changePasswordError) {
            document.getElementById('change-error').textContent = changePasswordError;
            const changeError = document.getElementById('change-error');
            if (changeError) changeError.classList.add('show');
            return;
          }
          try {
            const updatedUser = await changePassword({ username: username, currentPassword: currentPassword, newPassword: nextPassword });
            if (!updatedUser) {
              document.getElementById('change-error').textContent = textMap.changeError;
              const changeError = document.getElementById('change-error');
              if (changeError) changeError.classList.add('show');
              return;
            }
            toast(textMap.changeDone, 'success');
            switchPanel('login-panel');
            document.getElementById('login-user').value = username;
            document.getElementById('login-pass').value = '';
          } catch (error) {
            document.getElementById('change-error').textContent = String(error && error.message || error || textMap.changeError);
            const changeError = document.getElementById('change-error');
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
        const panel = ensureAuthPanel('forgot-panel');
        if (!panel || panel.dataset.authBound === '1') return panel;
        panel.dataset.authBound = '1';
        bindPageEvent(document.getElementById('forgot-form'), 'submit', async function (e) {
          e.preventDefault();
          const username = document.getElementById('forgot-username').value.trim();
          const email = document.getElementById('forgot-email').value.trim();
          try {
            const resetResult = await resetPasswordByEmail({ username: username, email: email });
            if (!resetResult) {
              const forgotError = document.getElementById('forgot-error');
              if (forgotError) forgotError.classList.add('show');
              return;
            }
            const forgotError = document.getElementById('forgot-error');
            if (forgotError) forgotError.classList.remove('show');
            document.getElementById('reset-username').textContent = resetResult.user.username;
            document.getElementById('reset-expire').textContent = resetResult.resetTokenExpiresAt || textMap.forgotExpireFallback;
            const deliveredByMail = !!(resetResult.delivery && resetResult.delivery.sent);
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
            const forgotError = document.getElementById('forgot-error');
            if (forgotError) forgotError.classList.add('show');
          }
        });
        bindPageEvent(document.getElementById('back-login-link'), 'click', function (e) {
          e.preventDefault();
          switchPanel(needsLocalBootstrap ? 'bootstrap-panel' : 'login-panel');
        });
        bindPageEvent(document.getElementById('redeem-form'), 'submit', async function (e) {
          e.preventDefault();
          const username = document.getElementById('redeem-username').value.trim();
          const token = document.getElementById('redeem-token').value.trim();
          const nextPassword = document.getElementById('redeem-pass').value;
          const confirmPassword = document.getElementById('redeem-pass-confirm').value;
          if (nextPassword !== confirmPassword) {
            toast(textMap.changeMismatch, 'error');
            return;
          }
          const redeemPasswordError = validatePasswordComplexity(nextPassword);
          if (redeemPasswordError) {
            toast(redeemPasswordError, 'error');
            return;
          }
          try {
            const user = await redeemResetPassword({ username: username, token: token, newPassword: nextPassword });
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
          const panel = document.getElementById(id);
          if (panel) panel.style.display = id === target ? 'block' : 'none';
        });
        ['login-error', 'forgot-error', 'change-error'].forEach(function (id) {
          const errorEl = document.getElementById(id);
          if (errorEl) errorEl.classList.remove('show');
        });
      }

      const bootstrapForm = document.getElementById('bootstrap-form');
      if (bootstrapForm) {
        bindPageEvent(bootstrapForm, 'submit', async function (e) {
          e.preventDefault();
          const username = document.getElementById('bootstrap-user').value.trim();
          const password = document.getElementById('bootstrap-pass').value;
          const email = document.getElementById('bootstrap-email').value.trim();
          const name = document.getElementById('bootstrap-name').value.trim();
          const passwordError = validatePasswordComplexity(password);
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
        const username = document.getElementById('login-user').value.trim();
        const password = document.getElementById('login-pass').value;
        try {
          const user = await login(username, password);
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
            const loginError = document.getElementById('login-error');
            if (loginError) loginError.classList.add('show');
          }
        } catch (error) {
          const loginError = document.getElementById('login-error');
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

      // Login page language toggle
      bindPageEvent(document.getElementById('login-lang-toggle'), 'click', function () {
        const i18n = window.__i18n__;
        if (!i18n) return;
        const next = i18n.getLang() === 'zh-TW' ? 'en' : 'zh-TW';
        i18n.setLang(next);
        renderLogin(); // Re-render login page with new language
      });

      const loggedInUser = currentUser();
      if (loggedInUser && loggedInUser.mustChangePassword) {
        ensureAuthPanel('change-panel');
        wireChangePanel();
        switchPanel('change-panel');
        document.getElementById('change-username').value = loggedInUser.username || '';
        const currentPasswordInput = document.getElementById('change-current-password');
        if (currentPasswordInput) currentPasswordInput.focus();
      }

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(refreshIcons);
      } else if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(refreshIcons, 0);
      } else {
        refreshIcons();
      }
    }


    let lastSidebarKey = '';
    let lastHeaderKey = '';
    let routeRenderGeneration = 0;
    function renderSidebar() {
      const u = getShellAccessProfile();
      if (!u) return;
      const items = getVisibleItems();
      const pendingCount = items.filter(function (item) { return item.status === STATUSES.PENDING || isOverdue(item); }).length;
      const route = getRoute();
      const sidebarKey = route.page + '|' + pendingCount + '|' + u.role + '|' + (u.activeUnit || '');
      if (sidebarKey === lastSidebarKey && document.getElementById('sidebar') && document.getElementById('sidebar').innerHTML) return;
      lastSidebarKey = sidebarKey;
      var _t = function (key, fallback) { return (window.__i18n__ && window.__i18n__.t(key)) || fallback; };
      let nav = '<div class="sidebar-section"><div class="sidebar-section-title">' + _t('nav.mainMenu', '主選單') + '</div>' +
        '<a class="nav-item ' + (route.page === 'dashboard' ? 'active' : '') + '" href="#dashboard"><span class="nav-icon">' + ic('pie-chart') + '</span>' + _t('nav.dashboard', '儀表板') + '</a>' +
        '<a class="nav-item ' + (route.page === 'list' ? 'active' : '') + '" href="#list"><span class="nav-icon">' + ic('file-text') + '</span>' + _t('nav.corrective', '矯正單列表') + (pendingCount ? '<span class="nav-badge">' + pendingCount + '</span>' : '') + '</a>' +
        '<a class="nav-item ' + (route.page === 'checklist' || route.page === 'checklist-fill' || route.page === 'checklist-detail' ? 'active' : '') + '" href="#checklist"><span class="nav-icon">' + ic('clipboard-check') + '</span>' + _t('nav.checklist', '內稽檢核表') + '</a>' +
        '<a class="nav-item ' + (route.page === 'training' || route.page === 'training-fill' || route.page === 'training-detail' || route.page === 'training-roster' ? 'active' : '') + '" href="#training"><span class="nav-icon">' + ic('graduation-cap') + '</span>' + _t('nav.training', '資安教育訓練統計') + '</a>' +
        '<a class="nav-item ' + (/^asset/.test(route.page) ? 'active' : '') + '" href="#assets"><span class="nav-icon">' + ic('database') + '</span>' + _t('nav.assets', '資訊資產盤點') + '</a></div>';

      let opNav = '';
      if (canCreateCAR()) opNav += '<a class="nav-item ' + (route.page === 'create' ? 'active' : '') + '" href="#create"><span class="nav-icon">' + ic('pen-tool') + '</span>' + _t('nav.createCase', '開立矯正單') + '</a>';
      if (canFillChecklist()) opNav += '<a class="nav-item ' + (route.page === 'checklist-fill' ? 'active' : '') + '" href="#checklist-fill"><span class="nav-icon">' + ic('edit-3') + '</span>' + _t('nav.fillChecklist', '填報檢核表') + '</a>';
      opNav += '<a class="nav-item ' + (route.page === 'asset-import' ? 'active' : '') + '" href="#asset-import"><span class="nav-icon">' + ic('upload') + '</span>' + _t('nav.batchImport', '資產批次匯入') + '</a>';
      opNav += '<a class="nav-item ' + (route.page === 'asset-compare' ? 'active' : '') + '" href="#asset-compare"><span class="nav-icon">' + ic('git-compare') + '</span>' + _t('nav.yearCompare', '年度比較') + '</a>';
      if (opNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">' + _t('nav.operations', '操作') + '</div>' + opNav + '</div>';

      let sysNav = '';
      if (canManageUsers()) sysNav += '<a class="nav-item ' + (route.page === 'users' ? 'active' : '') + '" href="#users"><span class="nav-icon">' + ic('users') + '</span>' + _t('nav.users', '帳號管理') + '</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'unit-contact-review' ? 'active' : '') + '" href="#unit-contact-review"><span class="nav-icon">' + ic('mail-plus') + '</span>' + _t('nav.applications', '單位管理人申請') + '</a>';
      if (canManageUsers()) sysNav += '<a class="nav-item ' + (route.page === 'login-log' ? 'active' : '') + '" href="#login-log"><span class="nav-icon">' + ic('shield-check') + '</span>' + _t('nav.loginLog', '登入紀錄') + '</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'audit-trail' ? 'active' : '') + '" href="#audit-trail"><span class="nav-icon">' + ic('scroll-text') + '</span>' + _t('nav.auditTrail', '操作軌跡') + '</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'security-window' ? 'active' : '') + '" href="#security-window"><span class="nav-icon">' + ic('shield-check') + '</span>' + _t('nav.securityWindow', '資安窗口') + '</a>';
      // schema-health 保留路由但不顯示在 sidebar（開發者可直接存取 #schema-health）
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'checklist-manage' ? 'active' : '') + '" href="#checklist-manage"><span class="nav-icon">' + ic('settings') + '</span>' + _t('nav.checklistManage', '檢核表管理') + '</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'checklist-compare' ? 'active' : '') + '" href="#checklist-compare"><span class="nav-icon">' + ic('git-compare') + '</span>' + _t('nav.checklistCompare', '檢核表歷年比對') + '</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'training-roster' ? 'active' : '') + '" href="#training-roster"><span class="nav-icon">' + ic('users-round') + '</span>' + _t('nav.trainingRoster', '教育訓練名單') + '</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'unit-review' ? 'active' : '') + '" href="#unit-review"><span class="nav-icon">' + ic('building-2') + '</span>' + _t('nav.unitReview', '單位治理') + '</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'asset-dashboard' ? 'active' : '') + '" href="#asset-dashboard"><span class="nav-icon">' + ic('bar-chart-3') + '</span>' + _t('nav.assetDashboard', '資產盤點總覽') + '</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'data-import' ? 'active' : '') + '" href="#data-import"><span class="nav-icon">' + ic('database') + '</span>' + _t('nav.dataImport', '歷史資料匯入') + '</a>';
      if (sysNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">' + _t('nav.systemAdmin', '系統管理') + '</div>' + sysNav + '</div>';

      // Tutorial nav at the bottom — only show if tutorial route is implemented
      if (typeof window.__ISMS_TUTORIAL_ENABLED__ !== 'undefined' && window.__ISMS_TUTORIAL_ENABLED__) {
        nav += '<div class="sidebar-section"><div class="sidebar-section-title">' + _t('nav.help', '說明') + '</div>'
          + '<a class="nav-item" href="#tutorial" data-action="shell.show-tutorial"><span class="nav-icon">' + ic('book-open') + '</span>' + _t('nav.tutorial', '使用教學') + '</a>'
          + '</div>';
      }

      const sidebarEl = document.getElementById('sidebar');
      if (!sidebarEl) return;
      // Language toggle moved to header
      sidebarEl.innerHTML = '<div class="sidebar-logo" style="height:58px;max-height:58px;min-height:0;overflow:hidden;display:flex;align-items:center;padding:10px 14px;gap:10px;box-sizing:border-box"><span style="flex-shrink:0;display:inline-flex">' + ntuLogo('ntu-logo-sm') + '</span><div style="min-width:0;line-height:1.3"><div style="font-size:0.78rem;font-weight:800;color:#0f3a7a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _t('app.title', '資訊安全管理系統') + '</div><div style="font-size:0.58rem;color:#8899ad;letter-spacing:0.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">ISMS 管理平台</div></div></div><nav class="sidebar-nav">' + nav + '</nav><div class="sidebar-footer"><div class="sidebar-footer-user"><span class="sidebar-footer-name">' + esc(u.name) + '</span><span class="badge-role ' + getRoleBadgeClass(u.role) + '">' + getRoleLabel(u.role) + '</span></div><button class="sidebar-logout-btn" data-action="shell.logout"><span class="nav-icon">' + ic('log-out') + '</span>' + _t('nav.logout', '登出系統') + '</button>' + renderVersionChip('sidebar-version-chip') + '</div>';
      sidebarEl.querySelectorAll('a.nav-item').forEach(function (link) {
        bindPageEvent(link, 'click', function () {
          if (isMobileViewport()) closeSidebar();
        });
      });
    }

    function renderHeader() {
      const u = getShellAccessProfile();
      if (!u) return;
      const route = getRoute();
      const headerKey = route.page + '|' + u.role + '|' + (u.activeUnit || '') + '|' + u.name + '|' + ((window.__i18n__ && window.__i18n__.getLang()) || 'zh-TW');
      if (headerKey === lastHeaderKey && document.getElementById('header') && document.getElementById('header').innerHTML) return;
      lastHeaderKey = headerKey;
      let switchHtml = '';
      if (canSwitchAuthorizedUnit(u)) {
        switchHtml = '<label class="header-scope-switch"><span class="header-scope-label">目前單位</span><select class="form-select header-scope-select" id="header-unit-switch" aria-label="切換目前單位">' +
          u.authorizedUnits.map(function (unit) {
            return '<option value="' + esc(unit) + '" ' + (u.activeUnit === unit ? 'selected' : '') + '>' + esc(unit) + '</option>';
          }).join('') +
          '</select></label>';
      }

      const headerEl = document.getElementById('header');
      if (!headerEl) return;
      const _langCode = (window.__i18n__ && window.__i18n__.getLang()) || 'zh-TW';
      const _langLabel = _langCode === 'zh-TW' ? 'EN' : '中文';
      headerEl.innerHTML = '<div class="header-left"><button type="button" class="header-menu-btn" data-action="shell.toggle-sidebar" aria-label="開啟選單">' + ic('menu') + '</button><div class="header-context" hidden><span class="header-kicker" hidden></span><span class="header-title">' + getRouteTitle(route.page) + '</span></div></div><div class="header-right">' + switchHtml + '<button class="btn btn-ghost btn-sm" data-action="shell.toggle-lang" title="Switch Language" style="font-size:0.78rem;letter-spacing:0.04em;font-weight:700;padding:6px 12px">' + ic('globe', 'icon-xs') + ' ' + _langLabel + '</button>'
        + '<div id="notif-bell-wrap" style="position:relative;display:inline-flex;align-items:center;margin:0 4px">'
        + '<button type="button" id="notif-bell-btn" class="btn btn-ghost btn-sm" title="通知" style="position:relative;padding:6px 10px;font-size:1rem" aria-label="通知">' + ic('bell', 'icon-xs')
        + '<span id="notif-badge" style="display:none;position:absolute;top:2px;right:2px;min-width:16px;height:16px;border-radius:8px;background:#dc2626;color:#fff;font-size:0.65rem;font-weight:700;line-height:16px;text-align:center;padding:0 4px">0</span>'
        + '</button>'
        + '<div id="notif-dropdown" style="display:none;position:absolute;top:100%;right:0;width:340px;max-height:420px;overflow-y:auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:9999;padding:8px 0">'
        + '<div id="notif-dropdown-content" style="padding:8px 12px;font-size:0.85rem;color:#64748b;text-align:center">載入中…</div></div></div>'
        + '<div class="header-user"><span class="header-user-name">' + esc(u.name) + '</span><span class="header-user-role">' + getRoleLabel(u.role) + '</span><div class="header-user-avatar">' + esc(u.name[0]) + '</div></div><button class="btn-logout" data-action="shell.logout"><span class="btn-logout-icon">' + ic('log-out') + '</span><span class="btn-logout-text">登出</span></button></div>';

      const switcher = document.getElementById('header-unit-switch');
      if (switcher) {
        bindPageEvent(switcher, 'change', function (event) {
          if (switchCurrentUserUnit(event.target.value)) handleRoute();
        });
      }
      // Notification bell binding and polling
      bindNotifBell();
      startNotifPolling();
      refreshIcons();
    }

    function renderBootstrapShell() {
      renderSidebar();
      renderHeader();
      closeSidebar();
      const appEl = document.getElementById('app');
      if (!appEl) return;
      appEl.innerHTML = '<div class="animate-in"><div class="card"><div class="card-header"><span class="card-title">\u6b63\u5728\u6e96\u5099\u767b\u5165\u74b0\u5883</span></div><p class="page-subtitle" style="margin:0">\u7cfb\u7d71\u6b63\u5728\u78ba\u8a8d\u767b\u5165\u72c0\u614b\u8207\u6b0a\u9650\u8cc7\u6599\uff0c\u5b8c\u6210\u5f8c\u6703\u81ea\u52d5\u9032\u5165\u76ee\u524d\u8def\u7531\u3002</p></div></div>';
      refreshIcons();
    }

    function setRouteLoadingState(isLoading) {
      const app = document.getElementById('app');
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
      window.scrollTo(0, 0);
      renderSidebar();
      renderHeader();
      closeSidebar();
      setRouteLoadingState(true);
      const thisGeneration = ++routeRenderGeneration;
      // ── Route transition: skeleton placeholder (only if render hasn't finished yet) ──
      const appEl = document.getElementById('app');
      setTimeout(function () {
        if (thisGeneration !== routeRenderGeneration) return;
        if (appEl && !appEl.querySelector('.skeleton-container') && !appEl.querySelector('.animate-in') && !appEl.querySelector('.page-title') && !appEl.querySelector('.dashboard-section-title')) {
          appEl.innerHTML = '<div class="skeleton-container animate-in"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-grid"><div class="skeleton-card"><div class="skeleton-line skeleton-line--short"></div><div class="skeleton-line skeleton-line--long"></div><div class="skeleton-line skeleton-line--medium"></div></div><div class="skeleton-card"><div class="skeleton-line skeleton-line--short"></div><div class="skeleton-line skeleton-line--long"></div><div class="skeleton-line skeleton-line--medium"></div></div><div class="skeleton-card"><div class="skeleton-line skeleton-line--short"></div><div class="skeleton-line skeleton-line--long"></div><div class="skeleton-line skeleton-line--medium"></div></div></div></div>';
        }
      }, 300);
      let renderAttempt = 0;
      function attemptRender() {
        if (thisGeneration !== routeRenderGeneration) return Promise.resolve();
        return Promise.resolve(getRouteMeta(page).render(route.param))
          .then(function () {
            if (thisGeneration !== routeRenderGeneration) return;
            syncHeaderRouteContext(page);
            focusRouteContent();
          })
          .catch(function (error) {
            if (thisGeneration !== routeRenderGeneration) return;
            const msg = error && error.message ? error.message : String(error);
            window.__ismsError('route render failed (attempt ' + (renderAttempt + 1) + '):', msg, error && error.stack);
            // Auto-retry once on module loading errors (not loaded / Failed to load)
            if (renderAttempt === 0 && /not loaded|Failed to load|尚未載入/i.test(msg)) {
              renderAttempt = 1;
              return new Promise(function (resolve) { setTimeout(resolve, 800); }).then(attemptRender);
            }
            toast('\u9801\u9762\u8f09\u5165\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66', 'error');
          });
      }
      attemptRender()
        .finally(function () {
          if (thisGeneration !== routeRenderGeneration) return;
          setRouteLoadingState(false);
          refreshIcons();
        });
    }

    function renderPublicPage(page, param) {
      if (typeof teardownPageRuntime === 'function') teardownPageRuntime();
      if (typeof window !== 'undefined') {
        window.__APP_READY__ = false;
      }
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
      lastSidebarKey = '';
      lastHeaderKey = '';
      if (typeof teardownPageRuntime === 'function') teardownPageRuntime();
      if (typeof window !== 'undefined') {
        window.__APP_READY__ = false;
      }
      const u = currentUser();
      if (!u) {
        handleRoute();
        return;
      }
      if (u.mustChangePassword) {
        renderLogin();
        return;
      }
      const showTransitionOverlay = consumeAppTransitionFlag();
      document.body.innerHTML = '<a class="skip-link" href="#app">\u8df3\u5230\u4e3b\u8981\u5167\u5bb9</a><aside class="sidebar" id="sidebar"></aside><div class="sidebar-backdrop" id="sidebar-backdrop" data-action="shell.close-sidebar"></div><header class="header" id="header"></header><main class="main-content" id="app" tabindex="-1" role="main"></main><div class="toast-container" id="toast-container" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div><div id="modal-root"></div>' + (showTransitionOverlay ? renderAppTransitionOverlay() : '');
      if (typeof window !== 'undefined') {
        window.__APP_READY__ = true;
        // Prefetch feature modules via fetch() for cross-browser compatibility
        if (!window.__featurePreloadStarted) {
          window.__featurePreloadStarted = true;
          setTimeout(function () {
            ['admin-feature','case-feature','checklist-feature','training-feature','unit-contact-application-feature'].forEach(function (name) {
              try { fetch('feature-bundles/' + name + '.js', { priority: 'low' }).catch(function () {}); } catch (_) {}
            });
          }, 800);
        }
      }
      if (typeof window !== 'undefined' && window.__REMOTE_BOOTSTRAP_STATE__ === 'ready') {
        handleRoute(u);
        if (showTransitionOverlay) dismissAppTransitionOverlay();
        return;
      }
      renderBootstrapShell();
      Promise.resolve(ensureAuthenticatedRemoteBootstrap()).then(function () {
        const resolvedUser = u || currentUser();
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
      'close-sidebar': function () { closeSidebar(); },
      'toggle-lang': function () {
        var i18n = window.__i18n__;
        if (!i18n) return;
        var next = i18n.getLang() === 'zh-TW' ? 'en' : 'zh-TW';
        i18n.setLang(next);
        // Re-render sidebar and header to apply new language
        lastSidebarKey = '';
        lastHeaderKey = '';
        renderSidebar();
        renderHeader();
        toast(next === 'en' ? 'Switched to English' : '已切換為繁體中文', 'info');
      },
      'show-tutorial': function () {
        // Tutorial modal
        var modalRoot = document.getElementById('modal-root');
        if (!modalRoot) return;
        var backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center';
        var modal = document.createElement('div');
        modal.className = 'modal-dialog';
        modal.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.2);max-width:640px;width:90%;max-height:85vh;overflow-y:auto;z-index:9999;animation:fadeInUp 0.2s ease';
        modal.innerHTML = '<div style="padding:24px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'
          + '<h2 style="font-size:1.2rem;font-weight:700;color:#1e293b;margin:0">' + ic('book-open', 'icon-sm') + ' 使用教學</h2>'
          + '<button class="btn btn-ghost btn-sm" id="tutorial-close-btn" style="font-size:1.2rem;padding:4px 8px">' + ic('x') + '</button>'
          + '</div>'
          + '<div style="margin-bottom:20px">'
          + '<h3 style="font-size:0.95rem;font-weight:600;color:#334155;margin-bottom:12px">操作手冊</h3>'
          + '<a href="docs/user-sop-beginner.html" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f1f5f9;border-radius:8px;text-decoration:none;color:#1e40af;font-weight:600;margin-bottom:8px">'
          + ic('file-text', 'icon-sm') + ' 新手入門操作手冊（HTML）</a>'
          + '<a href="docs/user-sop-beginner.pdf" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f1f5f9;border-radius:8px;text-decoration:none;color:#1e40af;font-weight:600;margin-bottom:8px">'
          + ic('file', 'icon-sm') + ' 新手入門操作手冊（PDF）</a>'
          + '</div>'
          + '<div style="margin-bottom:20px">'
          + '<h3 style="font-size:0.95rem;font-weight:600;color:#334155;margin-bottom:12px">教學影片</h3>'
          + '<div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:8px;padding:32px 16px;text-align:center;color:#64748b">'
          + '<div style="font-size:2rem;margin-bottom:8px">' + ic('video') + '</div>'
          + '<div style="font-weight:600;margin-bottom:4px">教學影片即將上線</div>'
          + '<div style="font-size:0.8rem">影片製作中，完成後將自動顯示於此處。</div>'
          + '</div></div>'
          + '<div>'
          + '<h3 style="font-size:0.95rem;font-weight:600;color:#334155;margin-bottom:12px">常見問題</h3>'
          + '<details style="margin-bottom:8px;background:#f8fafc;border-radius:8px;padding:12px 16px"><summary style="cursor:pointer;font-weight:600;color:#334155">如何填報內稽檢核表？</summary><p style="margin:8px 0 0;color:#64748b;font-size:0.88rem">請前往左側選單「內稽檢核表」，點擊「填報檢核表」按鈕，依據表單欄位逐一填寫後按「儲存」或「送出」。</p></details>'
          + '<details style="margin-bottom:8px;background:#f8fafc;border-radius:8px;padding:12px 16px"><summary style="cursor:pointer;font-weight:600;color:#334155">忘記密碼怎麼辦？</summary><p style="margin:8px 0 0;color:#64748b;font-size:0.88rem">請在登入頁面點擊「忘記密碼」，輸入您的 Email 後系統將寄送重設密碼連結。</p></details>'
          + '<details style="margin-bottom:8px;background:#f8fafc;border-radius:8px;padding:12px 16px"><summary style="cursor:pointer;font-weight:600;color:#334155">如何查看歷年稽核資料？</summary><p style="margin:8px 0 0;color:#64748b;font-size:0.88rem">管理者可透過儀表板的「年度稽核進度總覽」區塊切換年度查看，或前往各模組使用年度篩選功能。</p></details>'
          + '</div></div>';
        backdrop.appendChild(modal);
        modalRoot.appendChild(backdrop);
        refreshIcons();
        var closeBtn = document.getElementById('tutorial-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', function () { backdrop.remove(); });
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });
        if (isMobileViewport()) closeSidebar();
      }
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




