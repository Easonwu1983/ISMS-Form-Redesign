(function () {
  'use strict';

  window.createAppDomainTrainingRuntimeModule = function createAppDomainTrainingRuntimeModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};
      let appDomainBridgeModuleApi = null;
      let appTrainingChecklistBridgeModuleApi = null;
      let appDomainBridgeApi = null;
      let appTrainingChecklistBridgeApi = null;

      function getModule(factoryName, scriptName, currentValue, assign, globalSlot) {
        if (currentValue) return currentValue;
        if (typeof window === 'undefined' || typeof window[factoryName] !== 'function') {
          throw new Error(scriptName + ' not loaded');
        }
        const value = window[factoryName]();
        assign(value);
        if (globalSlot) window[globalSlot] = value;
        return value;
      }

      function getAppDomainBridgeModule() {
        return getModule(
          'createAppDomainBridgeModule',
          'app-domain-bridge-module.js',
          appDomainBridgeModuleApi,
          function (value) { appDomainBridgeModuleApi = value; },
          '_appDomainBridgeModule'
        );
      }

      function getAppTrainingChecklistBridgeModule() {
        return getModule(
          'createAppTrainingChecklistBridgeModule',
          'app-training-checklist-bridge-module.js',
          appTrainingChecklistBridgeModuleApi,
          function (value) { appTrainingChecklistBridgeModuleApi = value; },
          '_appTrainingChecklistBridgeModule'
        );
      }

      function buildConfig(factory, label) {
        if (typeof factory !== 'function') {
          throw new Error(label + ' factory missing');
        }
        const value = factory();
        return value && typeof value === 'object' ? value : {};
      }

      return {
        getDomainBridge: function () {
          if (appDomainBridgeApi) return appDomainBridgeApi;
          appDomainBridgeApi = getAppDomainBridgeModule().createAccess(
            buildConfig(opts.getDomainBridgeConfig, 'domain-bridge-config')
          );
          return appDomainBridgeApi;
        },
        getTrainingChecklistBridge: function () {
          if (appTrainingChecklistBridgeApi) return appTrainingChecklistBridgeApi;
          appTrainingChecklistBridgeApi = getAppTrainingChecklistBridgeModule().createAccess(
            buildConfig(opts.getTrainingChecklistBridgeConfig, 'training-checklist-bridge-config')
          );
          return appTrainingChecklistBridgeApi;
        }
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
