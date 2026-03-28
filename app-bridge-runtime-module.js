(function () {
  window.createAppBridgeRuntimeModule = function createAppBridgeRuntimeModule() {
    function getWindowModule(state, key, factoryName, scriptName, globalSlot) {
      if (state[key]) return state[key];
      if (typeof window === 'undefined' || typeof window[factoryName] !== 'function') {
        throw new Error(scriptName + ' not loaded');
      }
      state[key] = window[factoryName]();
      if (globalSlot) window[globalSlot] = state[key];
      return state[key];
    }

    function createAccess(deps) {
      const options = deps && typeof deps === 'object' ? deps : {};
      const state = {
        appRemoteRuntimeModuleApi: null,
        appStartRuntimeModuleApi: null,
        appAttachmentMigrationModuleApi: null,
        appSupportBridgeModuleApi: null,
        appRemoteBridgeModuleApi: null,
        appAuthRemoteModuleApi: null,
        appAuthRemoteApi: null
      };

      function getAppRemoteRuntimeModule() {
        return getWindowModule(state, 'appRemoteRuntimeModuleApi', 'createAppRemoteRuntimeModule', 'app-remote-runtime-module.js', '_appRemoteRuntimeModule');
      }

      function getAppStartRuntimeModule() {
        return getWindowModule(state, 'appStartRuntimeModuleApi', 'createAppStartRuntimeModule', 'app-start-runtime-module.js', '_appStartRuntimeModule');
      }

      function getAppAttachmentMigrationModule() {
        return getWindowModule(state, 'appAttachmentMigrationModuleApi', 'createAppAttachmentMigrationModule', 'app-attachment-migration-module.js', '_appAttachmentMigrationModule');
      }

      function getAppSupportBridgeModule() {
        return getWindowModule(state, 'appSupportBridgeModuleApi', 'createAppSupportBridgeModule', 'app-support-bridge-module.js', '_appSupportBridgeModule');
      }

      function getAppRemoteBridgeModule() {
        return getWindowModule(state, 'appRemoteBridgeModuleApi', 'createAppRemoteBridgeModule', 'app-remote-bridge-module.js', '_appRemoteBridgeModule');
      }

      function getAppAuthRemoteModule() {
        return getWindowModule(state, 'appAuthRemoteModuleApi', 'createAppAuthRemoteModule', 'app-auth-remote-module.js', '_appAuthRemoteModule');
      }

      const appRemoteRuntime = getAppRemoteRuntimeModule().createAccess({
        updateUser: options.updateUser
      });
      const appAttachmentMigration = getAppAttachmentMigrationModule().createAccess({
        loadData: options.loadData,
        saveData: options.saveData,
        loadTrainingStore: options.loadTrainingStore,
        saveTrainingStore: options.saveTrainingStore,
        migrateStoredAttachments: options.migrateStoredAttachments
      });
      const appSupportBridge = getAppSupportBridgeModule().createAccess({
        getAttachmentModule: options.getAttachmentModule,
        getWorkflowSupportModule: options.getWorkflowSupportModule,
        getDataModule: options.getDataModule,
        loadData: options.loadData,
        loadTrainingStore: options.loadTrainingStore
      });
      const appRemoteBridge = getAppRemoteBridgeModule().createAccess({
        getRuntimeM365Config: appRemoteRuntime.getRuntimeM365Config,
        normalizeRequestUrl: appRemoteRuntime.normalizeRequestUrl,
        getSystemUsersSharedHeaders: appRemoteRuntime.getSystemUsersSharedHeaders,
        getSessionAuthHeaders: options.getSessionAuthHeaders,
        getAuthEndpoint: appRemoteRuntime.getAuthEndpoint,
        getAuthSharedHeaders: appRemoteRuntime.getAuthSharedHeaders,
        getReviewScopesEndpoint: appRemoteRuntime.getReviewScopesEndpoint,
        getReviewScopesSharedHeaders: appRemoteRuntime.getReviewScopesSharedHeaders,
        getAuditTrailEndpoint: appRemoteRuntime.getAuditTrailEndpoint,
        getAuditTrailSharedHeaders: appRemoteRuntime.getAuditTrailSharedHeaders,
        getAttachmentsEndpoint: appRemoteRuntime.getAttachmentsEndpoint,
        getAttachmentsSharedHeaders: appRemoteRuntime.getAttachmentsSharedHeaders,
        getAttachmentModule: options.getAttachmentModule,
        getFileExtension: appSupportBridge.getFileExtension,
        buildUploadSignature: appSupportBridge.buildUploadSignature,
        contracts: options.contracts,
        actions: options.actions
      });

      function getAppAuthRemote() {
        if (state.appAuthRemoteApi) return state.appAuthRemoteApi;
        state.appAuthRemoteApi = getAppAuthRemoteModule().createAccess({
          AUTH_KEY: options.AUTH_KEY,
          AUTH_ACTIONS: options.AUTH_ACTIONS,
          getAuthMode: appRemoteRuntime.getAuthMode,
          getAuthHealthEndpoint: appRemoteRuntime.getAuthHealthEndpoint,
          requestAuthJson: appRemoteBridge.requestAuthJson,
          normalizeRemoteSystemUsers: options.normalizeRemoteSystemUsers,
          normalizeUserRecord: options.normalizeUserRecord,
          findUser: options.findUser,
          verifyLocalPasswordValue: appRemoteRuntime.verifyLocalPasswordValue,
          upsertSystemUserInStore: options.upsertSystemUserInStore,
          submitUserResetPassword: options.submitUserResetPassword,
          getAppAuthSessionModule: options.getAppAuthSessionModule,
          currentUser: options.currentUser
        });
        return state.appAuthRemoteApi;
      }

      return {
        getAppRemoteRuntimeModule: getAppRemoteRuntimeModule,
        getAppStartRuntimeModule: getAppStartRuntimeModule,
        getAppAttachmentMigrationModule: getAppAttachmentMigrationModule,
        getAppSupportBridgeModule: getAppSupportBridgeModule,
        getAppRemoteBridgeModule: getAppRemoteBridgeModule,
        getAppAuthRemoteModule: getAppAuthRemoteModule,
        getAppAuthRemote: getAppAuthRemote,
        ...appRemoteRuntime,
        ...appAttachmentMigration,
        ...appSupportBridge,
        ...appRemoteBridge
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
