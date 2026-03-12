(function () {
  window.createShellModule = function createShellModule(deps) {
    const {
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
    } = deps;

    let isSidebarOpen = false;

    function isPublicRoute(page) {
      return !!(page && ROUTE_WHITELIST[page] && ROUTE_WHITELIST[page].public);
    }

    function isMobileViewport() {
      if (window.matchMedia) return window.matchMedia('(max-width: 768px)').matches;
      return window.innerWidth <= 768;
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

    function renderLogin() {
      document.body.innerHTML = '<div class="login-page"><div class="login-card">' +
        '<div class="login-logo"><span class="login-logo-icon">' + ntuLogo('ntu-logo-lg') + '</span><h1>?折蝔賣蝞∟蕭頩斤頂蝯?/h1><p>ISMS Corrective Action Tracking</p></div>' +
        '<div class="login-error" id="login-error" data-testid="login-error">撣唾???蝣潮隤?/div>' +
        '<div id="login-panel"><form class="login-form" id="login-form" data-testid="login-form">' +
        '<div class="form-group"><label class="form-label">撣唾?</label><input type="text" class="form-input" id="login-user" data-testid="login-user" placeholder="隢撓?亙董?? required autofocus></div>' +
        '<div class="form-group"><label class="form-label">撖Ⅳ</label><input type="password" class="form-input" id="login-pass" data-testid="login-pass" placeholder="隢撓?亙?蝣? required></div>' +
        '<button type="submit" class="login-btn" data-testid="login-submit">?餃蝟餌絞 ' + ic('arrow-right', 'icon-sm') + '</button>' +
        '</form>' +
        '<div class="login-entry-card"><div class="login-entry-eyebrow">New</div><h3 class="login-entry-title">?唾??桐?鞈?蝒</h3><p class="login-entry-text">?雿?蝺??蝒?唾?嚗?蝥?銝脫 M365 ?祟?詻??刻?撣唾?蝬?瘚???/p><div class="login-entry-actions"><a class="btn btn-primary" href="#apply-unit-contact">???唾?</a><a class="btn btn-secondary" href="#apply-unit-contact-status">?亥岷?脣漲</a></div></div>' +
        '<p style="text-align:center;margin-top:14px"><a href="#" id="forgot-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">敹?撖Ⅳ嚗?/a></p></div>' +
        '<div id="forgot-panel" style="display:none">' +
        '<div style="text-align:center;margin-bottom:18px">' + ic('key', 'icon-xl') + '<h3 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">?身撖Ⅳ</h3></div>' +
        '<div class="login-error" id="forgot-error">?曆??唳迨靽∠拳撠??董??/div>' +
        '<form class="login-form" id="forgot-form"><div class="form-group"><label class="form-label">?餃?靽∠拳</label><input type="email" class="form-input" id="forgot-email" placeholder="隢撓?亥酉???縑蝞? required></div>' +
        '<button type="submit" class="login-btn" style="background:linear-gradient(135deg,#f59e0b,#d97706)">' + ic('mail', 'icon-sm') + ' ???啣?蝣?/button></form>' +
        '<div id="forgot-result" style="display:none;margin-top:16px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;text-align:center">' +
        '<p style="font-size:.88rem;color:#15803d;font-weight:600">撖Ⅳ撌脤?閮剜???</p>' +
        '<p style="font-size:.82rem;color:var(--text-secondary)">撣唾?嚗?strong id="reset-username"></strong></p>' +
        '<p style="font-size:1.1rem;font-weight:700;color:var(--text-heading);margin-top:6px;font-family:monospace;background:#f0f2f7;padding:8px;border-radius:8px" id="reset-newpass"></p></div>' +
        '<p style="text-align:center;margin-top:14px"><a href="#" id="back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">??餈??餃</a></p></div>' +
        '<div class="login-hint"><p>?身皜祈岫撣唾?</p><table>' +
        '<tr><th>閫</th><th>撣唾?</th><th>撖Ⅳ</th></tr>' +
        '<tr><td>?擃恣?</td><td>admin</td><td>admin123</td></tr>' +
        '<tr><td>?桐?蝞∠???/td><td>unit1</td><td>unit123</td></tr>' +
        '<tr><td>憛怠鈭?/td><td>user1</td><td>user123</td></tr>' +
        '<tr><td>頝典雿炎閬?/td><td>viewer1</td><td>viewer123</td></tr>' +
        '</table></div></div></div><div class="toast-container" id="toast-container"></div>';

      document.getElementById('login-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var u = document.getElementById('login-user').value.trim();
        var p = document.getElementById('login-pass').value;
        try {
          var user = await login(u, p);
          if (user) {
            toast('登入成功，歡迎 ' + user.name, 'success');
            setTimeout(function () { renderApp(); }, 300);
          } else {
            document.getElementById('login-error').classList.add('show');
          }
        } catch (error) {
          document.getElementById('login-error').classList.add('show');
          toast(String(error && error.message || error || '登入失敗'), 'error');
        }
      });

      document.getElementById('forgot-link').addEventListener('click', function (e) {
        e.preventDefault();
        document.getElementById('login-panel').style.display = 'none';
        document.getElementById('login-error').classList.remove('show');
        document.getElementById('forgot-panel').style.display = 'block';
      });

      document.getElementById('back-login-link').addEventListener('click', function (e) {
        e.preventDefault();
        document.getElementById('forgot-panel').style.display = 'none';
        document.getElementById('login-panel').style.display = 'block';
      });

      document.getElementById('forgot-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = document.getElementById('forgot-email').value.trim();
        try {
          var resetResult = await resetPasswordByEmail(email);
          if (!resetResult) {
            document.getElementById('forgot-error').classList.add('show');
            return;
          }
          document.getElementById('forgot-error').classList.remove('show');
          document.getElementById('reset-username').textContent = resetResult.user.username;
          document.getElementById('reset-newpass').textContent = resetResult.password;
          document.getElementById('forgot-result').style.display = 'block';
          document.getElementById('forgot-form').style.display = 'none';
          toast('撖Ⅳ撌脤?閮剜???', 'info');
        } catch (error) {
          document.getElementById('forgot-error').classList.add('show');
          toast(String(error && error.message || error || '密碼重設失敗'), 'error');
        }
      });

      refreshIcons();
    }

    function renderSidebar() {
      var u = currentUser();
      if (!u) return;
      var items = getVisibleItems();
      var pendingCount = items.filter(function (item) { return item.status === STATUSES.PENDING || isOverdue(item); }).length;
      var route = getRoute();
      var nav = '<div class="sidebar-section"><div class="sidebar-section-title">???</div>' +
        '<a class="nav-item ' + (route.page === 'dashboard' ? 'active' : '') + '" href="#dashboard"><span class="nav-icon">' + ic('pie-chart') + '</span>???</a>' +
        '<a class="nav-item ' + (route.page === 'list' ? 'active' : '') + '" href="#list"><span class="nav-icon">' + ic('file-text') + '</span>?????' + (pendingCount ? '<span class="nav-badge">' + pendingCount + '</span>' : '') + '</a>' +
        '<a class="nav-item ' + (route.page === 'checklist' || route.page === 'checklist-fill' || route.page === 'checklist-detail' ? 'active' : '') + '" href="#checklist"><span class="nav-icon">' + ic('clipboard-check') + '</span>?????</a>' +
        '<a class="nav-item ' + (route.page === 'training' || route.page === 'training-fill' || route.page === 'training-detail' || route.page === 'training-roster' ? 'active' : '') + '" href="#training"><span class="nav-icon">' + ic('graduation-cap') + '</span>????????</a></div>';

      var opNav = '';
      if (canCreateCAR()) opNav += '<a class="nav-item ' + (route.page === 'create' ? 'active' : '') + '" href="#create"><span class="nav-icon">' + ic('pen-tool') + '</span>?????</a>';
      if (canFillChecklist()) opNav += '<a class="nav-item ' + (route.page === 'checklist-fill' ? 'active' : '') + '" href="#checklist-fill"><span class="nav-icon">' + ic('edit-3') + '</span>?????</a>';
      if (opNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">??</div>' + opNav + '</div>';

      var sysNav = '';
      if (canManageUsers()) sysNav += '<a class="nav-item ' + (route.page === 'users' ? 'active' : '') + '" href="#users"><span class="nav-icon">' + ic('users') + '</span>????</a>';
      if (canManageUsers()) sysNav += '<a class="nav-item ' + (route.page === 'login-log' ? 'active' : '') + '" href="#login-log"><span class="nav-icon">' + ic('shield-check') + '</span>????</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'schema-health' ? 'active' : '') + '" href="#schema-health"><span class="nav-icon">' + ic('database') + '</span>??????</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'checklist-manage' ? 'active' : '') + '" href="#checklist-manage"><span class="nav-icon">' + ic('settings') + '</span>?????</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'training-roster' ? 'active' : '') + '" href="#training-roster"><span class="nav-icon">' + ic('users-round') + '</span>??????</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'unit-review' ? 'active' : '') + '" href="#unit-review"><span class="nav-icon">' + ic('building-2') + '</span>????</a>';
      if (sysNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">????</div>' + sysNav + '</div>';

      var sidebarEl = document.getElementById('sidebar');
      sidebarEl.innerHTML = '<div class="sidebar-logo"><span class="sidebar-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><div class="sidebar-brand-text"><h1>??????????</h1><p>ISMS Corrective Action</p></div></div><nav class="sidebar-nav">' + nav + '</nav><div class="sidebar-footer"><span class="badge-role ' + ROLE_BADGE[u.role] + '">' + u.role + '</span></div>';
      sidebarEl.querySelectorAll('a.nav-item').forEach(function (link) {
        link.addEventListener('click', function () {
          if (isMobileViewport()) closeSidebar();
        });
      });
    }

    function renderHeader() {
      var u = currentUser();
      if (!u) return;
      var route = getRoute();
      var switchHtml = '';
      if (canSwitchAuthorizedUnit(u)) {
        switchHtml = '<label class="header-scope-switch"><span class="header-scope-label">?桀??桐?</span><select class="form-select header-scope-select" id="header-unit-switch">' +
          getAuthorizedUnits(u).map(function (unit) {
            return '<option value="' + esc(unit) + '" ' + (getScopedUnit(u) === unit ? 'selected' : '') + '>' + esc(unit) + '</option>';
          }).join('') +
          '</select></label>';
      }

      document.getElementById('header').innerHTML = '<div class="header-left"><button type="button" class="header-menu-btn" data-action="shell.toggle-sidebar" aria-label="open menu">' + ic('menu') + '</button><span class="header-title">' + getRouteTitle(route.page) + '</span></div><div class="header-right">' + switchHtml + '<div class="header-user"><span class="header-user-name">' + esc(u.name) + '</span><span class="header-user-role">' + u.role + '</span><div class="header-user-avatar">' + esc(u.name[0]) + '</div></div><button class="btn-logout" data-action="shell.logout">?餃</button></div>';

      var switcher = document.getElementById('header-unit-switch');
      if (switcher) {
        switcher.addEventListener('change', function (event) {
          if (switchCurrentUserUnit(event.target.value)) handleRoute();
        });
      }
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
      if (!canAccessRoute(page)) {
        const fallback = getRouteFallback(page);
        const message = getRouteMeta(page).deniedMessage;
        navigate(fallback, { replace: true });
        if (message) toast(message, 'error');
        return;
      }
      renderSidebar();
      renderHeader();
      closeSidebar();
      getRouteMeta(page).render(route.param);
    }

    function renderPublicPage(page, param) {
      document.body.innerHTML = '<div class="public-shell"><header class="public-header"><a class="public-brand" href="#apply-unit-contact"><span class="public-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><span class="public-brand-text"><strong>?折蝔賣蝞∟蕭頩斤頂蝯?/strong><span>ISMS Corrective Action Tracking</span></span></a><div class="public-header-actions"><a class="btn btn-ghost" href="#apply-unit-contact-status">?亥岷?脣漲</a>' + (currentUser() ? '<a class="btn btn-secondary" href="#dashboard">?蝟餌絞</a>' : '<a class="btn btn-secondary" href="#">?餃蝟餌絞</a>') + '</div></header><main class="public-main" id="app"></main><div class="toast-container" id="toast-container"></div><div id="modal-root"></div></div>';
      getRouteMeta(page).render(param);
      refreshIcons();
    }

    function renderApp() {
      var u = currentUser();
      if (!u) {
        handleRoute();
        return;
      }
      document.body.innerHTML = '<aside class="sidebar" id="sidebar"></aside><div class="sidebar-backdrop" id="sidebar-backdrop" data-action="shell.close-sidebar"></div><header class="header" id="header"></header><main class="main-content" id="app"></main><div class="toast-container" id="toast-container"></div><div id="modal-root"></div>';
      handleRoute();
      refreshIcons();
    }

    registerActionHandlers('shell', {
      logout: function () {
        if (hasUnsavedChangesGuard() && !confirmDiscardUnsavedChanges('目前有尚未儲存的內容，確定要登出嗎？')) return;
        logout();
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

