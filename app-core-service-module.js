// @ts-check
(function () {
  window.createAppCoreServiceModule = function createAppCoreServiceModule() {
    function getServiceRegistryModule(state, deps) {
      if (state.serviceRegistryModuleApi) return state.serviceRegistryModuleApi;
      if (typeof window === 'undefined' || typeof window.createServiceRegistryModule !== 'function') {
        throw new Error('service-registry-module.js not loaded');
      }
      state.serviceRegistryModuleApi = window.createServiceRegistryModule();
      window._serviceRegistryModule = state.serviceRegistryModuleApi;
      return state.serviceRegistryModuleApi;
    }

    function getAppServiceAccessModule(state, deps) {
      if (state.appServiceAccessModuleApi) return state.appServiceAccessModuleApi;
      if (typeof window === 'undefined' || typeof window.createAppServiceAccessModule !== 'function') {
        if (deps && typeof deps.recordBootstrapStep === 'function') {
          deps.recordBootstrapStep('app-service-access-missing-factory', 'createAppServiceAccessModule unavailable');
        }
        throw new Error('app-service-access-module.js not loaded');
      }
      state.appServiceAccessModuleApi = window.createAppServiceAccessModule();
      window._appServiceAccessModule = state.appServiceAccessModuleApi;
      return state.appServiceAccessModuleApi;
    }

    function registerCoreService(state, deps, name, resolver) {
      getServiceRegistryModule(state, deps).register(name, resolver, {
        aliases: name === 'm365ApiClient'
          ? ['resolveM365ApiClient']
          : (name === 'shellModule' ? ['resolveShellModule'] : [])
      });
    }

    function resolveFactoryService(state, deps, name, options) {
      return getServiceRegistryModule(state, deps).resolve(name, options || {});
    }

    return {
      getServiceRegistryModule: getServiceRegistryModule,
      getAppServiceAccessModule: getAppServiceAccessModule,
      registerCoreService: registerCoreService,
      resolveFactoryService: resolveFactoryService
    };
  };
})();
