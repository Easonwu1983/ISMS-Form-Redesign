(function () {
  window.createAppShellOrchestrationModule = function createAppShellOrchestrationModule() {
    function buildShellModuleDeps(deps) {
      return {
        ROUTE_WHITELIST: deps.ROUTE_WHITELIST,
        ROLE_BADGE: deps.ROLE_BADGE,
        STATUSES: deps.STATUSES,
        currentUser: deps.currentUser,
        login: deps.login,
        logout: deps.logout,
        getAuthMode: deps.getAuthMode,
        hasLocalUsers: deps.hasLocalUsers,
        bootstrapLocalAdminAccount: deps.bootstrapLocalAdminAccount,
        resetPasswordByEmail: deps.resetPasswordByEmail,
        redeemResetPassword: deps.redeemResetPassword,
        changePassword: deps.changePassword,
        getVisibleItems: deps.getVisibleItems,
        isOverdue: deps.isOverdue,
        getRoute: deps.getRoute,
        getRouteMeta: deps.getRouteMeta,
        getRouteTitle: deps.getRouteTitle,
        canAccessRoute: deps.canAccessRoute,
        getRouteFallback: deps.getRouteFallback,
        navigate: deps.navigate,
        toast: deps.toast,
        refreshIcons: deps.refreshIcons,
        beginPageRuntime: deps.beginPageRuntime,
        teardownPageRuntime: deps.teardownPageRuntime,
        markAuthenticatedBootstrapReady: deps.markAuthenticatedBootstrapReady,
        esc: deps.esc,
        ic: deps.ic,
        ntuLogo: deps.ntuLogo,
        canCreateCAR: deps.canCreateCAR,
        canFillChecklist: deps.canFillChecklist,
        canManageUsers: deps.canManageUsers,
        isAdmin: deps.isAdmin,
        canSwitchAuthorizedUnit: deps.canSwitchAuthorizedUnit,
        getAuthorizedUnits: deps.getAuthorizedUnits,
        getScopedUnit: deps.getScopedUnit,
        switchCurrentUserUnit: deps.switchCurrentUserUnit,
        ensureAuthenticatedRemoteBootstrap: deps.ensureAuthenticatedRemoteBootstrap,
        isAuthenticatedRemoteBootstrapPending: deps.isAuthenticatedRemoteBootstrapPending,
        hasUnsavedChangesGuard: deps.hasUnsavedChangesGuard,
        confirmDiscardUnsavedChanges: deps.confirmDiscardUnsavedChanges,
        registerActionHandlers: deps.registerActionHandlers
      };
    }

    function isMobileViewport(deps) {
      return deps.getShellModule().isMobileViewport();
    }

    function closeSidebar(deps) {
      return deps.getShellModule().closeSidebar();
    }

    function toggleSidebar(deps) {
      return deps.getShellModule().toggleSidebar();
    }

    function renderLogin(deps) {
      return deps.getShellModule().renderLogin();
    }

    function renderApp(deps) {
      deps.ensureSessionHeartbeat();
      return deps.getShellModule().renderApp();
    }

    function renderSidebar(deps) {
      return deps.getShellModule().renderSidebar();
    }

    function renderHeader(deps) {
      return deps.getShellModule().renderHeader();
    }

    function handleRoute(deps) {
      return deps.getShellModule().handleRoute();
    }

    return {
      buildShellModuleDeps: buildShellModuleDeps,
      isMobileViewport: isMobileViewport,
      closeSidebar: closeSidebar,
      toggleSidebar: toggleSidebar,
      renderLogin: renderLogin,
      renderApp: renderApp,
      renderSidebar: renderSidebar,
      renderHeader: renderHeader,
      handleRoute: handleRoute
    };
  };
})();
