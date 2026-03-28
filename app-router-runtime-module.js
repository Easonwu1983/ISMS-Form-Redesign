(function () {
  window.createAppRouterRuntimeModule = function createAppRouterRuntimeModule() {
    function buildRouterDeps(options) {
      const opts = options && typeof options === 'object' ? options : {};
      return {
        handleRoute: opts.handleRoute,
        hasUnsavedChangesGuard: opts.hasUnsavedChangesGuard,
        confirmDiscardUnsavedChanges: opts.confirmDiscardUnsavedChanges,
        isMobileViewport: opts.isMobileViewport,
        closeSidebar: opts.closeSidebar,
        refreshIcons: opts.refreshIcons,
        runSessionHeartbeat: opts.runSessionHeartbeat,
        toast: opts.toast
      };
    }

    function handleRoute(options) {
      const opts = options && typeof options === 'object' ? options : {};
      return opts.getAppShellOrchestrationModule().handleRoute({
        getShellModule: opts.getShellModule
      });
    }

    function setLastStableHash(routerModule, value) {
      return routerModule.setLastStableHash(value);
    }

    function handleHashChange(routerModule, options) {
      return routerModule.handleHashChange(buildRouterDeps(options));
    }

    function installAppEventListeners(routerModule, options) {
      return routerModule.installAppEventListeners(buildRouterDeps(options));
    }

    return {
      buildRouterDeps: buildRouterDeps,
      handleRoute: handleRoute,
      setLastStableHash: setLastStableHash,
      handleHashChange: handleHashChange,
      installAppEventListeners: installAppEventListeners
    };
  };
})();
