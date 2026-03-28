(function () {
  window.createAppEntryRuntimeModule = function createAppEntryRuntimeModule() {
    function buildAppEntryDeps(options) {
      const opts = options && typeof options === 'object' ? options : {};
      return {
        getBootstrapCoordinator: opts.getBootstrapCoordinator,
        getM365ApiClient: opts.getM365ApiClient,
        getShellModule: opts.getShellModule,
        getAppBootstrapModule: opts.getAppBootstrapModule,
        recordBootstrapStep: opts.recordBootstrapStep,
        installGlobalDelegation: opts.installGlobalDelegation,
        installAppEventListeners: opts.installAppEventListeners,
        renderApp: opts.renderApp,
        ensureAuthenticatedRemoteBootstrap: opts.ensureAuthenticatedRemoteBootstrap,
        getAuthMode: opts.getAuthMode,
        seedData: opts.seedData,
        ensurePrimaryAdminProfile: opts.ensurePrimaryAdminProfile,
        getTrainingModule: opts.getTrainingModule,
        migrateAttachmentStores: opts.migrateAttachmentStores,
        getDataModule: opts.getDataModule,
        setLastStableHash: opts.setLastStableHash,
        refreshIcons: opts.refreshIcons,
        ic: opts.ic,
        esc: opts.esc
      };
    }

    function initializeCoreServices(entryModule, options, reason) {
      return entryModule.initializeCoreServices(buildAppEntryDeps(options), reason);
    }

    function initApp(entryModule, options) {
      return entryModule.initApp(buildAppEntryDeps(options));
    }

    function startApp(entryModule, options) {
      return entryModule.startApp(buildAppEntryDeps(options));
    }

    return {
      buildAppEntryDeps: buildAppEntryDeps,
      initializeCoreServices: initializeCoreServices,
      initApp: initApp,
      startApp: startApp
    };
  };
})();
