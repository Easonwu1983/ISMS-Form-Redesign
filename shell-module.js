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
        '<div class="login-logo"><span class="login-logo-icon">' + ntuLogo('ntu-logo-lg') + '</span><h1>內部稽核管考追蹤系統</h1><p>ISMS 管考與追蹤平台</p></div>' +
        '<div class="login-error" id="login-error" data-testid="login-error">帳號或密碼錯誤</div>' +
        '<div id="login-panel"><form class="login-form" id="login-form" data-testid="login-form">' +
        '<div class="form-group"><label class="form-label">帳號</label><input type="text" class="form-input" id="login-user" data-testid="login-user" placeholder="請輸入帳號" required autofocus></div>' +
        '<div class="form-group"><label class="form-label">密碼</label><input type="password" class="form-input" id="login-pass" data-testid="login-pass" placeholder="請輸入密碼" required></div>' +
        '<button type="submit" class="login-btn" data-testid="login-submit">登入系統 ' + ic('arrow-right', 'icon-sm') + '</button>' +
        '</form>' +
        '<div class="login-entry-card"><div class="login-entry-eyebrow">New</div><h3 class="login-entry-title">申請單位管理人員</h3><p class="login-entry-text">如需新增或異動各單位管理窗口，請先送出單位管理人申請，再由系統管理者建立登入帳號。</p><div class="login-entry-actions"><a class="btn btn-primary" href="#apply-unit-contact">前往申請</a><a class="btn btn-secondary" href="#apply-unit-contact-status">查詢進度</a></div></div>' +
        '<p style="text-align:center;margin-top:14px"><a href="#" id="forgot-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">忘記密碼？</a></p></div>' +
        '<div id="change-panel" style="display:none">' +
        '<div style="text-align:center;margin-bottom:18px">' + ic('shield-check', 'icon-xl') + '<h3 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">首次登入需變更密碼</h3></div>' +
        '<div class="login-error" id="change-error">密碼變更失敗</div>' +
        '<form class="login-form" id="change-form"><input type="hidden" id="change-username"><input type="hidden" id="change-current-password"><div class="form-group"><label class="form-label">新密碼</label><input type="password" class="form-input" id="change-pass" placeholder="至少 8 碼" required></div><div class="form-group"><label class="form-label">確認新密碼</label><input type="password" class="form-input" id="change-pass-confirm" placeholder="再次輸入新密碼" required></div><button type="submit" class="login-btn">' + ic('key-round', 'icon-sm') + ' 立即更新密碼</button></form>' +
        '<p style="text-align:center;margin-top:14px"><a href="#" id="change-back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">返回登入</a></p></div>' +
        '<div id="forgot-panel" style="display:none">' +
        '<div style="text-align:center;margin-bottom:18px">' + ic('key', 'icon-xl') + '<h3 style="font-size:1.1rem;font-weight:600;color:var(--text-heading);margin-top:8px">重設密碼</h3></div>' +
        '<div class="login-error" id="forgot-error">找不到符合帳號與信箱的使用者</div>' +
        '<form class="login-form" id="forgot-form"><div class="form-group"><label class="form-label">帳號</label><input type="text" class="form-input" id="forgot-username" placeholder="請輸入帳號" required></div><div class="form-group"><label class="form-label">註冊電子信箱</label><input type="email" class="form-input" id="forgot-email" placeholder="請輸入帳號綁定的電子信箱" required></div><button type="submit" class="login-btn" style="background:linear-gradient(135deg,#f59e0b,#d97706)">' + ic('mail', 'icon-sm') + ' 取得重設代碼</button></form>' +
        '<div id="forgot-result" style="display:none;margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px">' +
        '<p style="font-size:.88rem;color:#0f172a;font-weight:600" id="reset-result-title">已產生一次性重設代碼</p>' +
        '<p style="font-size:.82rem;color:var(--text-secondary)">帳號：<strong id="reset-username"></strong></p>' +
        '<p style="font-size:.82rem;color:var(--text-secondary)">有效期限：<strong id="reset-expire"></strong></p>' +
        '<p style="font-size:.82rem;color:var(--text-secondary);margin-top:6px" id="reset-result-message"></p>' +
        '<p style="font-size:1.1rem;font-weight:700;color:var(--text-heading);margin-top:6px;font-family:monospace;background:#f0f2f7;padding:8px;border-radius:8px" id="reset-token"></p>' +
        '<form class="login-form" id="redeem-form" style="margin-top:14px"><input type="hidden" id="redeem-username"><div class="form-group"><label class="form-label">重設代碼</label><input type="text" class="form-input" id="redeem-token" placeholder="請輸入信件中的重設代碼" required></div><div class="form-group"><label class="form-label">新密碼</label><input type="password" class="form-input" id="redeem-pass" placeholder="至少 8 碼" required></div><div class="form-group"><label class="form-label">確認新密碼</label><input type="password" class="form-input" id="redeem-pass-confirm" placeholder="再次輸入新密碼" required></div><button type="submit" class="login-btn">' + ic('check', 'icon-sm') + ' 完成重設</button></form></div>' +
        '<p style="text-align:center;margin-top:14px"><a href="#" id="back-login-link" style="color:var(--accent-primary);font-size:.85rem;text-decoration:none">返回登入</a></p></div>' +
        '<div class="login-hint"><p>測試帳號</p><table>' +
        '<tr><th>角色</th><th>帳號</th><th>密碼</th></tr>' +
        '<tr><td>最高管理員</td><td>admin</td><td>admin123</td></tr>' +
        '<tr><td>單位管理員</td><td>unit1</td><td>unit123</td></tr>' +
        '<tr><td>填報人</td><td>user1</td><td>user123</td></tr>' +
        '<tr><td>跨單位檢視者</td><td>viewer1</td><td>viewer123</td></tr>' +
        '</table></div></div></div><div class="toast-container" id="toast-container"></div>';

      function switchPanel(target) {
        ['login-panel', 'forgot-panel', 'change-panel'].forEach(function (id) {
          var panel = document.getElementById(id);
          if (panel) panel.style.display = id === target ? 'block' : 'none';
        });
        ['login-error', 'forgot-error', 'change-error'].forEach(function (id) {
          var errorEl = document.getElementById(id);
          if (errorEl) errorEl.classList.remove('show');
        });
      }

      document.getElementById('login-form').addEventListener('submit', async function (e) {
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
              toast('請先變更密碼後再進入系統', 'info');
              return;
            }
            toast('登入成功，歡迎 ' + user.name, 'success');
            setTimeout(function () {
              renderApp();
            }, 300);
          } else {
            document.getElementById('login-error').classList.add('show');
          }
        } catch (error) {
          document.getElementById('login-error').classList.add('show');
          toast(String(error && error.message || error || '登入失敗'), 'error');
        }
      });

      document.getElementById('change-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var username = document.getElementById('change-username').value.trim();
        var currentPassword = document.getElementById('change-current-password').value;
        var nextPassword = document.getElementById('change-pass').value;
        var confirmPassword = document.getElementById('change-pass-confirm').value;
        if (nextPassword !== confirmPassword) {
          document.getElementById('change-error').textContent = '兩次輸入的新密碼不一致';
          document.getElementById('change-error').classList.add('show');
          return;
        }
        try {
          var updatedUser = await changePassword({ username: username, currentPassword: currentPassword, newPassword: nextPassword });
          if (!updatedUser) {
            document.getElementById('change-error').textContent = '密碼變更失敗';
            document.getElementById('change-error').classList.add('show');
            return;
          }
          toast('密碼已更新，請重新登入系統', 'success');
          switchPanel('login-panel');
          document.getElementById('login-user').value = username;
          document.getElementById('login-pass').value = '';
        } catch (error) {
          document.getElementById('change-error').textContent = String(error && error.message || error || '密碼變更失敗');
          document.getElementById('change-error').classList.add('show');
        }
      });

      document.getElementById('forgot-link').addEventListener('click', function (e) {
        e.preventDefault();
        switchPanel('forgot-panel');
      });

      document.getElementById('back-login-link').addEventListener('click', function (e) {
        e.preventDefault();
        switchPanel('login-panel');
      });

      document.getElementById('change-back-login-link').addEventListener('click', function (e) {
        e.preventDefault();
        switchPanel('login-panel');
      });

      document.getElementById('forgot-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var username = document.getElementById('forgot-username').value.trim();
        var email = document.getElementById('forgot-email').value.trim();
        try {
          var resetResult = await resetPasswordByEmail({ username: username, email: email });
          if (!resetResult) {
            document.getElementById('forgot-error').classList.add('show');
            return;
          }
          document.getElementById('forgot-error').classList.remove('show');
          document.getElementById('reset-username').textContent = resetResult.user.username;
          document.getElementById('reset-expire').textContent = resetResult.resetTokenExpiresAt || '依系統設定';
          var deliveredByMail = !!(resetResult.delivery && resetResult.delivery.sent);
          document.getElementById('reset-result-title').textContent = deliveredByMail ? '重設信已寄出' : '已產生一次性重設代碼';
          document.getElementById('reset-result-message').textContent = deliveredByMail
            ? ('系統已將重設代碼寄送到 ' + (resetResult.user.email || email) + '，請查看信件後貼到下方欄位。')
            : '目前無法直接寄信，系統已提供一次性重設代碼供手動完成重設。';
          document.getElementById('reset-token').textContent = resetResult.resetToken || resetResult.password || '';
          document.getElementById('reset-token').style.display = (resetResult.resetToken || resetResult.password) ? 'block' : 'none';
          document.getElementById('redeem-username').value = resetResult.user.username;
          document.getElementById('redeem-token').value = resetResult.resetToken || '';
          document.getElementById('forgot-result').style.display = 'block';
          toast(deliveredByMail ? '重設信已寄出' : '已產生一次性重設代碼', deliveredByMail ? 'success' : 'info');
        } catch (error) {
          document.getElementById('forgot-error').textContent = String(error && error.message || error || '密碼重設失敗');
          document.getElementById('forgot-error').classList.add('show');
        }
      });

      document.getElementById('redeem-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var username = document.getElementById('redeem-username').value.trim();
        var token = document.getElementById('redeem-token').value.trim();
        var nextPassword = document.getElementById('redeem-pass').value;
        var confirmPassword = document.getElementById('redeem-pass-confirm').value;
        if (nextPassword !== confirmPassword) {
          toast('兩次輸入的新密碼不一致', 'error');
          return;
        }
        try {
          var user = await redeemResetPassword({ username: username, token: token, newPassword: nextPassword });
          if (!user) {
            toast('重設代碼無效或已過期', 'error');
            return;
          }
          toast('密碼已重設並完成登入', 'success');
          setTimeout(function () {
            renderApp();
          }, 300);
        } catch (error) {
          toast(String(error && error.message || error || '重設密碼失敗'), 'error');
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
      if (canManageUsers()) sysNav += '<a class="nav-item ' + (route.page === 'login-log' ? 'active' : '') + '" href="#login-log"><span class="nav-icon">' + ic('shield-check') + '</span>登入紀錄</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'audit-trail' ? 'active' : '') + '" href="#audit-trail"><span class="nav-icon">' + ic('scroll-text') + '</span>操作軌跡</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'schema-health' ? 'active' : '') + '" href="#schema-health"><span class="nav-icon">' + ic('database') + '</span>資料健康檢查</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'checklist-manage' ? 'active' : '') + '" href="#checklist-manage"><span class="nav-icon">' + ic('settings') + '</span>檢核表管理</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'training-roster' ? 'active' : '') + '" href="#training-roster"><span class="nav-icon">' + ic('users-round') + '</span>教育訓練名單</a>';
      if (isAdmin()) sysNav += '<a class="nav-item ' + (route.page === 'unit-review' ? 'active' : '') + '" href="#unit-review"><span class="nav-icon">' + ic('building-2') + '</span>單位治理</a>';
      if (sysNav) nav += '<div class="sidebar-section"><div class="sidebar-section-title">系統管理</div>' + sysNav + '</div>';

      var sidebarEl = document.getElementById('sidebar');
      if (!sidebarEl) return;
      sidebarEl.innerHTML = '<div class="sidebar-logo"><span class="sidebar-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><div class="sidebar-brand-text"><h1>內部稽核管考追蹤系統</h1><p>ISMS 管考與追蹤平台</p></div></div><nav class="sidebar-nav">' + nav + '</nav><div class="sidebar-footer"><span class="badge-role ' + ROLE_BADGE[u.role] + '">' + u.role + '</span></div>';
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
        switchHtml = '<label class="header-scope-switch"><span class="header-scope-label">目前單位</span><select class="form-select header-scope-select" id="header-unit-switch">' +
          getAuthorizedUnits(u).map(function (unit) {
            return '<option value="' + esc(unit) + '" ' + (getScopedUnit(u) === unit ? 'selected' : '') + '>' + esc(unit) + '</option>';
          }).join('') +
          '</select></label>';
      }

      var headerEl = document.getElementById('header');
      if (!headerEl) return;
      headerEl.innerHTML = '<div class="header-left"><button type="button" class="header-menu-btn" data-action="shell.toggle-sidebar" aria-label="開啟選單">' + ic('menu') + '</button><span class="header-title">' + getRouteTitle(route.page) + '</span></div><div class="header-right">' + switchHtml + '<div class="header-user"><span class="header-user-name">' + esc(u.name) + '</span><span class="header-user-role">' + u.role + '</span><div class="header-user-avatar">' + esc(u.name[0]) + '</div></div><button class="btn-logout" data-action="shell.logout">登出</button></div>';

      var switcher = document.getElementById('header-unit-switch');
      if (switcher) {
        switcher.addEventListener('change', function (event) {
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
      appEl.innerHTML = '<div class="animate-in"><div class="card"><div class="card-header"><span class="card-title">正在同步系統資料</span></div><p class="page-subtitle" style="margin:0">正在驗證登入狀態並同步矯正單、檢核表與教育訓練資料，完成後會自動載入頁面。</p></div></div>';
      refreshIcons();
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
      if (isAuthenticatedRemoteBootstrapPending()) {
        renderBootstrapShell();
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
      document.body.innerHTML = '<div class="public-shell"><header class="public-header"><a class="public-brand" href="#apply-unit-contact"><span class="public-brand-icon">' + ntuLogo('ntu-logo-sm') + '</span><span class="public-brand-text"><strong>內部稽核管考追蹤系統</strong><span>ISMS 管考與追蹤平台</span></span></a><div class="public-header-actions"><a class="btn btn-ghost" href="#apply-unit-contact-status">查詢進度</a>' + (currentUser() ? '<a class="btn btn-secondary" href="#dashboard">進入系統</a>' : '<a class="btn btn-secondary" href="#">登入系統</a>') + '</div></header><main class="public-main" id="app"></main><div class="toast-container" id="toast-container"></div><div id="modal-root"></div></div>';
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
      renderBootstrapShell();
      Promise.resolve(ensureAuthenticatedRemoteBootstrap()).then(function () {
        if (currentUser()) handleRoute();
      }).catch(function (error) {
        console.error(error && error.stack ? error.stack : String(error));
        if (String(error && error.message || '').indexOf('登入狀態已失效') >= 0) {
          toast('登入狀態已失效，請重新登入', 'error');
          handleRoute();
          return;
        }
        handleRoute();
      });
    }

    registerActionHandlers('shell', {
      logout: function () {
        if (hasUnsavedChangesGuard() && !confirmDiscardUnsavedChanges('目前有尚未儲存的內容，確定要登出嗎？')) return;
        Promise.resolve(logout()).catch(function (error) {
          console.error(error && error.stack ? error.stack : String(error));
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

