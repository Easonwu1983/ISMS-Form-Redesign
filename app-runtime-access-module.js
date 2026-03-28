(function () {
  window.createAppRuntimeAccessModule = function createAppRuntimeAccessModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const getAppRuntimeServiceModule = opts.getAppRuntimeServiceModule;
      const appRuntimeServiceState = opts.appRuntimeServiceState;

      if (typeof getAppRuntimeServiceModule !== 'function') {
        throw new Error('getAppRuntimeServiceModule unavailable');
      }
      if (!appRuntimeServiceState || typeof appRuntimeServiceState !== 'object') {
        throw new Error('appRuntimeServiceState unavailable');
      }

      function getAppCoreServiceModule() {
        return getAppRuntimeServiceModule().getAppCoreServiceModule(appRuntimeServiceState);
      }

      function getAppBootstrapAccessModule() {
        return getAppRuntimeServiceModule().getAppBootstrapAccessModule(appRuntimeServiceState);
      }

      function getAppEntryRuntimeModule() {
        return getAppRuntimeServiceModule().getAppEntryRuntimeModule(appRuntimeServiceState);
      }

      function getAppShellRuntimeModule() {
        return getAppRuntimeServiceModule().getAppShellRuntimeModule(appRuntimeServiceState);
      }

      function getAppAuthSessionRuntimeModule() {
        return getAppRuntimeServiceModule().getAppAuthSessionRuntimeModule(appRuntimeServiceState);
      }

      function getAppRouterRuntimeModule() {
        return getAppRuntimeServiceModule().getAppRouterRuntimeModule(appRuntimeServiceState);
      }

      function getAppBootstrapWiringModule() {
        return getAppRuntimeServiceModule().getAppBootstrapWiringModule(appRuntimeServiceState);
      }

      return {
        getAppCoreServiceModule,
        getAppBootstrapAccessModule,
        getAppEntryRuntimeModule,
        getAppShellRuntimeModule,
        getAppAuthSessionRuntimeModule,
        getAppRouterRuntimeModule,
        getAppBootstrapWiringModule
      };
    }

    return {
      createAccess
    };
  };
})();
