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

      function buildDomainBridgeConfig() {
        if (typeof opts.getDomainBridgeConfig === 'function') {
          return buildConfig(opts.getDomainBridgeConfig, 'domain-bridge-config');
        }
        return {
          getUnitModule: typeof opts.getUnitModule === 'function' ? opts.getUnitModule : function () { return null; },
          getWorkflowSupportModule: typeof opts.getWorkflowSupportModule === 'function' ? opts.getWorkflowSupportModule : function () { return null; },
          getDataModule: typeof opts.getDataModule === 'function' ? opts.getDataModule : function () { return null; },
          getAuthModule: typeof opts.getAuthModule === 'function' ? opts.getAuthModule : function () { return null; },
          getPolicyModule: typeof opts.getPolicyModule === 'function' ? opts.getPolicyModule : function () { return null; }
        };
      }

      function buildTrainingChecklistBridgeConfig() {
        if (typeof opts.getTrainingChecklistBridgeConfig === 'function') {
          return buildConfig(opts.getTrainingChecklistBridgeConfig, 'training-checklist-bridge-config');
        }
        return {
          CHECKLIST_KEY: opts.CHECKLIST_KEY,
          TRAINING_KEY: opts.TRAINING_KEY,
          trainingGeneralLabel: opts.trainingGeneralLabel,
          trainingInfoStaffLabel: opts.trainingInfoStaffLabel,
          trainingProfessionalLabel: opts.trainingProfessionalLabel,
          trainingBooleanOptions: opts.trainingBooleanOptions,
          trainingProfessionalOptions: opts.trainingProfessionalOptions,
          getDataModule: typeof opts.getDataModule === 'function' ? opts.getDataModule : function () { return null; },
          getWorkflowSupportModule: typeof opts.getWorkflowSupportModule === 'function' ? opts.getWorkflowSupportModule : function () { return null; },
          getPolicyModule: typeof opts.getPolicyModule === 'function' ? opts.getPolicyModule : function () { return null; },
          currentUser: typeof opts.currentUser === 'function' ? opts.currentUser : function () { return null; },
          getSystemUnits: typeof opts.getSystemUnits === 'function' ? opts.getSystemUnits : function () { return []; },
          getUnitCode: typeof opts.getUnitCode === 'function' ? opts.getUnitCode : function () { return ''; },
          splitUnitValue: typeof opts.splitUnitValue === 'function' ? opts.splitUnitValue : function () { return { parent: '', child: '' }; }
        };
      }

      return {
        getDomainBridge: function () {
          if (appDomainBridgeApi) return appDomainBridgeApi;
          appDomainBridgeApi = getAppDomainBridgeModule().createAccess(
            buildDomainBridgeConfig()
          );
          return appDomainBridgeApi;
        },
        getTrainingChecklistBridge: function () {
          if (appTrainingChecklistBridgeApi) return appTrainingChecklistBridgeApi;
          appTrainingChecklistBridgeApi = getAppTrainingChecklistBridgeModule().createAccess(
            buildTrainingChecklistBridgeConfig()
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
