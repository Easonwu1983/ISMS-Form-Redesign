(function () {
  window.createAppBootstrapAccessModule = function createAppBootstrapAccessModule() {
    let m365ApiClientApi = null;

    function getAppBootstrapModule(deps) {
      return deps.getAppServiceAccessModule().getAppBootstrapModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep
      });
    }

    function getAppEntryModule(deps) {
      return deps.getAppServiceAccessModule().getAppEntryModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep
      });
    }

    function getAppRouteModule(deps) {
      return deps.getAppServiceAccessModule().getAppRouteModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep,
        routeWhitelist: deps.routeWhitelist,
        defaultTitle: deps.defaultTitle
      });
    }

    function getAppPageOrchestrationModule(deps) {
      return deps.getAppServiceAccessModule().getAppPageOrchestrationModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep
      });
    }

    function getAppVisibilityModule(deps) {
      return deps.getAppServiceAccessModule().getAppVisibilityModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep
      });
    }

    function getAppActionModule(deps) {
      return deps.getAppServiceAccessModule().getAppActionModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep
      });
    }

    function getAppShellOrchestrationModule(deps) {
      return deps.getAppServiceAccessModule().getAppShellOrchestrationModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep
      });
    }

    function getAppAuthSessionModule(deps) {
      return deps.getAppServiceAccessModule().getAppAuthSessionModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep
      });
    }

    function getAppRouterModule(deps) {
      return deps.getAppServiceAccessModule().getAppRouterModule({
        resolveFactoryService: deps.resolveFactoryService,
        recordBootstrapStep: deps.recordBootstrapStep
      });
    }

    function getM365ApiClient(deps) {
      if (m365ApiClientApi) return m365ApiClientApi;
      m365ApiClientApi = deps.resolveFactoryService('m365ApiClient', {
        factory: function () {
          if (typeof window === 'undefined' || typeof window.createM365ApiClient !== 'function') {
            deps.recordBootstrapStep('m365-client-missing-factory', 'createM365ApiClient unavailable');
            throw new Error('m365-api-client.js not loaded');
          }
          return window.createM365ApiClient(deps.clientArgs);
        },
        globalSlot: '_m365ApiClient',
        readyStep: 'm365-client-ready'
      });
      return m365ApiClientApi;
    }

    return {
      getAppBootstrapModule: getAppBootstrapModule,
      getAppEntryModule: getAppEntryModule,
      getAppRouteModule: getAppRouteModule,
      getAppPageOrchestrationModule: getAppPageOrchestrationModule,
      getAppVisibilityModule: getAppVisibilityModule,
      getAppActionModule: getAppActionModule,
      getAppShellOrchestrationModule: getAppShellOrchestrationModule,
      getAppAuthSessionModule: getAppAuthSessionModule,
      getAppRouterModule: getAppRouterModule,
      getM365ApiClient: getM365ApiClient
    };
  };
})();
