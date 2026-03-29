(function () {
  window.createAppFeatureRuntimeModule = function createAppFeatureRuntimeModule() {
    function createAccess(deps) {
      const state = {
        adminModuleApi: null,
        caseModuleApi: null
      };

      function resolveFeature(factoryName, scriptName, stateKey, globalSlot, configBuilder) {
        if (state[stateKey]) return state[stateKey];
        if (typeof window === 'undefined' || typeof window[factoryName] !== 'function') {
          throw new Error(scriptName + ' not loaded');
        }
        state[stateKey] = window[factoryName](configBuilder());
        if (globalSlot) window[globalSlot] = state[stateKey];
        return state[stateKey];
      }

      function getAdminModule() {
        return resolveFeature(
          'createAdminModule',
          'admin-module.js',
          'adminModuleApi',
          '_adminModule',
          deps.getAdminModuleConfig
        );
      }

      function getCaseModule() {
        return resolveFeature(
          'createCaseModule',
          'case-module.js',
          'caseModuleApi',
          '_caseModule',
          deps.getCaseModuleConfig
        );
      }

      return {
        getAdminModule: getAdminModule,
        getCaseModule: getCaseModule
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
