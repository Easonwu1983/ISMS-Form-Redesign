// @ts-check
(function () {
  window.createAppFeatureRuntimeModule = function createAppFeatureRuntimeModule() {
    function createAccess(deps) {
      const state = {
        adminModuleApi: null,
        caseModuleApi: null,
        adminModulePromise: null,
        caseModulePromise: null
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

      function ensureFeature(factoryName, scriptName, stateKey, promiseKey, globalSlot, configBuilder, loader) {
        if (state[stateKey]) return Promise.resolve(state[stateKey]);
        if (state[promiseKey]) return state[promiseKey];
        const start = typeof loader === 'function'
          ? Promise.resolve().then(loader)
          : Promise.resolve();
        state[promiseKey] = start.then(function () {
          return resolveFeature(factoryName, scriptName, stateKey, globalSlot, configBuilder);
        }).catch(function (error) {
          // Clear promise on failure so retry is possible
          state[promiseKey] = null;
          throw error;
        });
        // Don't clear on success — state[stateKey] will be set by resolveFeature,
        // so subsequent calls hit the fast path above
        return state[promiseKey];
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

      function ensureAdminModule() {
        return ensureFeature(
          'createAdminModule',
          'admin-module.js',
          'adminModuleApi',
          'adminModulePromise',
          '_adminModule',
          deps.getAdminModuleConfig,
          deps.ensureAdminModuleScript
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

      function ensureCaseModule() {
        return ensureFeature(
          'createCaseModule',
          'case-module.js',
          'caseModuleApi',
          'caseModulePromise',
          '_caseModule',
          deps.getCaseModuleConfig,
          deps.ensureCaseModuleScript
        );
      }

      return {
        getAdminModule: getAdminModule,
        ensureAdminModule: ensureAdminModule,
        getCaseModule: getCaseModule,
        ensureCaseModule: ensureCaseModule
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
