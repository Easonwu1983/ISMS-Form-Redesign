// @ts-check
(function () {
  window.createAppShellRuntimeModule = function createAppShellRuntimeModule() {
    function buildShellModuleDeps(deps) {
      const d = deps && typeof deps === 'object' ? deps : {};
      return d.getAppShellOrchestrationModule().buildShellModuleDeps({
        ROUTE_WHITELIST: d.ROUTE_WHITELIST,
        ROLE_BADGE: d.ROLE_BADGE,
        STATUSES: d.STATUSES,
        currentUser: d.currentUser,
        login: d.login,
        logout: d.logout,
        getAuthMode: d.getAuthMode,
        hasLocalUsers: d.hasLocalUsers,
        bootstrapLocalAdminAccount: d.bootstrapLocalAdminAccount,
        resetPasswordByEmail: d.resetPasswordByEmail,
        redeemResetPassword: d.redeemResetPassword,
        changePassword: d.changePassword,
        getVisibleItems: d.getVisibleItems,
        isOverdue: d.isOverdue,
        getRoute: d.getRoute,
        getRouteMeta: d.getRouteMeta,
        getRouteTitle: d.getRouteTitle,
        canAccessRoute: d.canAccessRoute,
        getRouteFallback: d.getRouteFallback,
        navigate: d.navigate,
        toast: d.toast,
        refreshIcons: d.refreshIcons,
        beginPageRuntime: d.beginPageRuntime,
        teardownPageRuntime: d.teardownPageRuntime,
        markAuthenticatedBootstrapReady: d.markAuthenticatedBootstrapReady,
        esc: d.esc,
        ic: d.ic,
        ntuLogo: d.ntuLogo,
        canCreateCAR: d.canCreateCAR,
        canFillChecklist: d.canFillChecklist,
        canManageUsers: d.canManageUsers,
        isAdmin: d.isAdmin,
        canSwitchAuthorizedUnit: d.canSwitchAuthorizedUnit,
        getAuthorizedUnits: d.getAuthorizedUnits,
        getScopedUnit: d.getScopedUnit,
        switchCurrentUserUnit: d.switchCurrentUserUnit,
        ensureAuthenticatedRemoteBootstrap: d.ensureAuthenticatedRemoteBootstrap,
        isAuthenticatedRemoteBootstrapPending: d.isAuthenticatedRemoteBootstrapPending,
        hasUnsavedChangesGuard: d.hasUnsavedChangesGuard,
        confirmDiscardUnsavedChanges: d.confirmDiscardUnsavedChanges,
        registerActionHandlers: d.registerActionHandlers
      });
    }

    function getShellModule(currentApi, deps) {
      if (currentApi) return currentApi;
      const d = deps && typeof deps === 'object' ? deps : {};
      return d.resolveFactoryService('shellModule', {
        factory: function () {
          if (typeof window === 'undefined' || typeof window.createShellModule !== 'function') {
            d.recordBootstrapStep('shell-module-missing-factory', 'createShellModule unavailable');
            throw new Error('shell-module.js not loaded');
          }
          return window.createShellModule(buildShellModuleDeps(d));
        },
        globalSlot: '_shellModule',
        globalGetter: 'getShellModule',
        aliases: ['resolveShellModule'],
        readyStep: 'shell-module-ready'
      });
    }

    return {
      buildShellModuleDeps: buildShellModuleDeps,
      getShellModule: getShellModule
    };
  };
})();
