(function () {
  window.createAppRuntimeServiceModule = function createAppRuntimeServiceModule() {
    function createState() {
      return {
        serviceRegistryModuleApi: null,
        appServiceAccessModuleApi: null,
        appBootstrapStateModuleApi: null,
        appCoreServiceModuleApi: null,
        appBootstrapAccessModuleApi: null,
        appBootstrapWiringModuleApi: null,
        appRuntimeAccessModuleApi: null,
        appEntryRuntimeModuleApi: null,
        appShellRuntimeModuleApi: null,
        appAuthSessionRuntimeModuleApi: null,
        appRouterRuntimeModuleApi: null,
        appPageShellRuntimeModuleApi: null,
        appBridgeRuntimeModuleApi: null,
        appCoreServiceState: {
          serviceRegistryModuleApi: null,
          appServiceAccessModuleApi: null
        }
      };
    }

    function getModuleFactory(factoryName, scriptName, state, stateKey, globalSlot) {
      if (state[stateKey]) return state[stateKey];
      if (typeof window === 'undefined' || typeof window[factoryName] !== 'function') {
        throw new Error(scriptName + ' not loaded');
      }
      state[stateKey] = window[factoryName]();
      if (globalSlot) window[globalSlot] = state[stateKey];
      return state[stateKey];
    }

    function getAppCoreServiceModule(state) {
      return getModuleFactory('createAppCoreServiceModule', 'app-core-service-module.js', state, 'appCoreServiceModuleApi', '_appCoreServiceModule');
    }

    function getAppBootstrapAccessModule(state) {
      return getModuleFactory('createAppBootstrapAccessModule', 'app-bootstrap-access-module.js', state, 'appBootstrapAccessModuleApi', '_appBootstrapAccessModule');
    }

    function getAppBootstrapWiringModule(state) {
      return getModuleFactory('createAppBootstrapWiringModule', 'app-bootstrap-wiring-module.js', state, 'appBootstrapWiringModuleApi', '_appBootstrapWiringModule');
    }

    function getAppRuntimeAccessModule(state) {
      return getModuleFactory('createAppRuntimeAccessModule', 'app-runtime-access-module.js', state, 'appRuntimeAccessModuleApi', '_appRuntimeAccessModule');
    }

    function getAppEntryRuntimeModule(state) {
      return getModuleFactory('createAppEntryRuntimeModule', 'app-entry-runtime-module.js', state, 'appEntryRuntimeModuleApi', '_appEntryRuntimeModule');
    }

    function getAppShellRuntimeModule(state) {
      return getModuleFactory('createAppShellRuntimeModule', 'app-shell-runtime-module.js', state, 'appShellRuntimeModuleApi', '_appShellRuntimeModule');
    }

    function getAppAuthSessionRuntimeModule(state) {
      return getModuleFactory('createAppAuthSessionRuntimeModule', 'app-auth-session-runtime-module.js', state, 'appAuthSessionRuntimeModuleApi', '_appAuthSessionRuntimeModule');
    }

    function getAppRouterRuntimeModule(state) {
      return getModuleFactory('createAppRouterRuntimeModule', 'app-router-runtime-module.js', state, 'appRouterRuntimeModuleApi', '_appRouterRuntimeModule');
    }

    function getAppPageShellRuntimeModule(state) {
      return getModuleFactory('createAppPageShellRuntimeModule', 'app-page-shell-runtime-module.js', state, 'appPageShellRuntimeModuleApi', '_appPageShellRuntimeModule');
    }

    function getAppBridgeRuntimeModule(state) {
      return getModuleFactory('createAppBridgeRuntimeModule', 'app-bridge-runtime-module.js', state, 'appBridgeRuntimeModuleApi', '_appBridgeRuntimeModule');
    }

    return {
      createState: createState,
      getAppCoreServiceModule: getAppCoreServiceModule,
      getAppBootstrapAccessModule: getAppBootstrapAccessModule,
      getAppBootstrapWiringModule: getAppBootstrapWiringModule,
      getAppRuntimeAccessModule: getAppRuntimeAccessModule,
      getAppEntryRuntimeModule: getAppEntryRuntimeModule,
      getAppShellRuntimeModule: getAppShellRuntimeModule,
      getAppAuthSessionRuntimeModule: getAppAuthSessionRuntimeModule,
      getAppRouterRuntimeModule: getAppRouterRuntimeModule,
      getAppPageShellRuntimeModule: getAppPageShellRuntimeModule,
      getAppBridgeRuntimeModule: getAppBridgeRuntimeModule
    };
  };
})();
