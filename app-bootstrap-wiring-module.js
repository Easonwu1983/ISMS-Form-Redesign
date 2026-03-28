(function () {
  window.createAppBootstrapWiringModule = function createAppBootstrapWiringModule() {
    function createWiring(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const getAppRuntimeServiceModule = opts.getAppRuntimeServiceModule;
      const appRuntimeServiceState = opts.appRuntimeServiceState;
      const getRouteWhitelist = typeof opts.getRouteWhitelist === 'function'
        ? opts.getRouteWhitelist
        : function () { return []; };
      const defaultTitle = String(opts.defaultTitle || 'ISMS 管考與追蹤平台');
      const getClientArgs = typeof opts.getClientArgs === 'function'
        ? opts.getClientArgs
        : function () { return {}; };

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

      function getServiceRegistryModule() {
        appRuntimeServiceState.serviceRegistryModuleApi = getAppCoreServiceModule().getServiceRegistryModule(appRuntimeServiceState.appCoreServiceState, {});
        appRuntimeServiceState.appCoreServiceState.serviceRegistryModuleApi = appRuntimeServiceState.serviceRegistryModuleApi;
        return appRuntimeServiceState.serviceRegistryModuleApi;
      }

      function recordBootstrapStep(step, detail) {
        return getAppBootstrapStateModule().recordBootstrapStep({
          getServiceRegistryModule
        }, step, detail);
      }

      function getAppServiceAccessModule() {
        appRuntimeServiceState.appServiceAccessModuleApi = getAppCoreServiceModule().getAppServiceAccessModule(appRuntimeServiceState.appCoreServiceState, {
          recordBootstrapStep
        });
        appRuntimeServiceState.appCoreServiceState.appServiceAccessModuleApi = appRuntimeServiceState.appServiceAccessModuleApi;
        return appRuntimeServiceState.appServiceAccessModuleApi;
      }

      function resolveFactoryService(name, options) {
        appRuntimeServiceState.appCoreServiceState.serviceRegistryModuleApi = appRuntimeServiceState.serviceRegistryModuleApi || appRuntimeServiceState.appCoreServiceState.serviceRegistryModuleApi;
        return getAppCoreServiceModule().resolveFactoryService(appRuntimeServiceState.appCoreServiceState, {}, name, options || {});
      }

      function registerCoreService(name, resolver) {
        appRuntimeServiceState.appCoreServiceState.serviceRegistryModuleApi = appRuntimeServiceState.serviceRegistryModuleApi || appRuntimeServiceState.appCoreServiceState.serviceRegistryModuleApi;
        return getAppCoreServiceModule().registerCoreService(appRuntimeServiceState.appCoreServiceState, {}, name, resolver);
      }

      function getAppBootstrapStateModule() {
        if (appRuntimeServiceState.appBootstrapStateModuleApi) return appRuntimeServiceState.appBootstrapStateModuleApi;
        appRuntimeServiceState.appBootstrapStateModuleApi = getAppServiceAccessModule().getAppBootstrapStateModule({
          resolveFactoryService,
          recordBootstrapStep
        });
        return appRuntimeServiceState.appBootstrapStateModuleApi;
      }

      function getAppBootstrapModule() {
        return getAppBootstrapAccessModule().getAppBootstrapModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep
        });
      }

      function getAppEntryModule() {
        return getAppBootstrapAccessModule().getAppEntryModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep
        });
      }

      function getAppRouteModule() {
        return getAppBootstrapAccessModule().getAppRouteModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep,
          routeWhitelist: getRouteWhitelist(),
          defaultTitle
        });
      }

      function getAppPageOrchestrationModule() {
        return getAppBootstrapAccessModule().getAppPageOrchestrationModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep
        });
      }

      function getAppVisibilityModule() {
        return getAppBootstrapAccessModule().getAppVisibilityModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep
        });
      }

      function getAppActionModule() {
        return getAppBootstrapAccessModule().getAppActionModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep
        });
      }

      function getAppShellOrchestrationModule() {
        return getAppBootstrapAccessModule().getAppShellOrchestrationModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep
        });
      }

      function getAppAuthSessionModule() {
        return getAppBootstrapAccessModule().getAppAuthSessionModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep
        });
      }

      function getAppRouterModule() {
        return getAppBootstrapAccessModule().getAppRouterModule({
          getAppServiceAccessModule,
          resolveFactoryService,
          recordBootstrapStep
        });
      }

      function getBootstrapCoordinator() {
        return getAppBootstrapStateModule().getBootstrapCoordinator({
          getServiceRegistryModule
        });
      }

      function getM365ApiClient() {
        return getAppBootstrapAccessModule().getM365ApiClient({
          resolveFactoryService,
          recordBootstrapStep,
          clientArgs: getClientArgs()
        });
      }

      return {
        getAppCoreServiceModule,
        getAppBootstrapAccessModule,
        getServiceRegistryModule,
        getAppServiceAccessModule,
        getAppBootstrapModule,
        getAppBootstrapStateModule,
        getAppEntryModule,
        getAppRouteModule,
        getAppPageOrchestrationModule,
        getAppVisibilityModule,
        getAppActionModule,
        getAppShellOrchestrationModule,
        getAppAuthSessionModule,
        getAppRouterModule,
        getBootstrapCoordinator,
        recordBootstrapStep,
        registerCoreService,
        resolveFactoryService,
        getM365ApiClient
      };
    }

    return {
      createWiring
    };
  };
})();
