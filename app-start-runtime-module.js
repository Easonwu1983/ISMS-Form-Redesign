// @ts-check
(function () {
  window.createAppStartRuntimeModule = function createAppStartRuntimeModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};

      function handleRoute() {
        return opts.getAppRouterRuntimeModule().handleRoute({
          getAppShellOrchestrationModule: opts.getAppShellOrchestrationModule,
          getShellModule: opts.getShellModule
        });
      }

      function setLastStableHash(value) {
        return opts.getAppRouterRuntimeModule().setLastStableHash(opts.getAppRouterModule(), value);
      }

      function handleHashChange() {
        return opts.getAppRouterRuntimeModule().handleHashChange(opts.getAppRouterModule(), {
          hasUnsavedChangesGuard: opts.hasUnsavedChangesGuard,
          confirmDiscardUnsavedChanges: opts.confirmDiscardUnsavedChanges,
          handleRoute: handleRoute
        });
      }

      function installAppEventListeners() {
        return opts.getAppRouterRuntimeModule().installAppEventListeners(opts.getAppRouterModule(), {
          handleRoute: handleRoute,
          hasUnsavedChangesGuard: opts.hasUnsavedChangesGuard,
          confirmDiscardUnsavedChanges: opts.confirmDiscardUnsavedChanges,
          isMobileViewport: opts.isMobileViewport,
          closeSidebar: opts.closeSidebar,
          refreshIcons: opts.refreshIcons,
          runSessionHeartbeat: opts.runSessionHeartbeat,
          toast: opts.toast
        });
      }

      function startApp() {
        return opts.getAppEntryRuntimeModule().startApp(opts.getAppEntryModule(), {
          getBootstrapCoordinator: opts.getBootstrapCoordinator,
          getM365ApiClient: opts.getM365ApiClient,
          getShellModule: opts.getShellModule,
          getAppBootstrapModule: opts.getAppBootstrapModule,
          recordBootstrapStep: opts.recordBootstrapStep,
          installGlobalDelegation: opts.installGlobalDelegation,
          installAppEventListeners: installAppEventListeners,
          renderApp: opts.renderApp,
          ensureAuthenticatedRemoteBootstrap: opts.ensureAuthenticatedRemoteBootstrap,
          getAuthMode: opts.getAuthMode,
          seedData: opts.seedData,
          ensurePrimaryAdminProfile: opts.ensurePrimaryAdminProfile,
          getTrainingModule: opts.getTrainingModule,
          migrateAttachmentStores: opts.migrateAttachmentStores,
          getDataModule: opts.getDataModule,
          setLastStableHash: setLastStableHash,
          refreshIcons: opts.refreshIcons,
          ic: opts.ic,
          esc: opts.esc
        });
      }

      return {
        handleRoute: handleRoute,
        setLastStableHash: setLastStableHash,
        handleHashChange: handleHashChange,
        installAppEventListeners: installAppEventListeners,
        startApp: startApp
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
