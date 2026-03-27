(function () {
  window.createAppEntryModule = function createAppEntryModule() {
    function initializeCoreServices(deps, reason) {
      const label = String(reason || 'bootstrap').trim() || 'bootstrap';
      deps.getBootstrapCoordinator();
      try {
        deps.getM365ApiClient();
        deps.recordBootstrapStep('core-service-ready', 'm365ApiClient:' + label);
      } catch (error) {
        deps.recordBootstrapStep('core-service-failed', 'm365ApiClient:' + String(error && error.message || error || 'unknown'));
        throw error;
      }
      try {
        deps.getShellModule();
        deps.recordBootstrapStep('core-service-ready', 'shellModule:' + label);
      } catch (error) {
        deps.recordBootstrapStep('core-service-failed', 'shellModule:' + String(error && error.message || error || 'unknown'));
        throw error;
      }
    }

    async function initApp(deps) {
      return deps.getAppBootstrapModule().initApp({
        recordBootstrapStep: deps.recordBootstrapStep,
        installGlobalDelegation: deps.installGlobalDelegation,
        installAppEventListeners: deps.installAppEventListeners,
        initializeCoreServices: function (reason) { return initializeCoreServices(deps, reason); },
        renderApp: deps.renderApp,
        ensureAuthenticatedRemoteBootstrap: deps.ensureAuthenticatedRemoteBootstrap,
        getAuthMode: deps.getAuthMode,
        seedData: deps.seedData,
        ensurePrimaryAdminProfile: deps.ensurePrimaryAdminProfile,
        getTrainingModule: deps.getTrainingModule,
        migrateAttachmentStores: deps.migrateAttachmentStores,
        getDataModule: deps.getDataModule,
        setLastStableHash: deps.setLastStableHash,
        refreshIcons: deps.refreshIcons
      });
    }

    async function startApp(deps) {
      try {
        await initApp(deps);
      } catch (error) {
        deps.recordBootstrapStep('app-init-failed', String(error && error.message || error || 'unknown'));
        console.error(error && error.stack ? error.stack : String(error));
        const root = typeof document !== 'undefined' ? document.getElementById('app') : null;
        if (root) {
          root.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + deps.ic('alert-triangle', 'icon-lg') + '</div><div class="empty-state-title">系統初始化失敗</div><div class="empty-state-desc">' + deps.esc(String(error && error.message || error || '未知錯誤')) + '</div></div>';
        }
        if (typeof window !== 'undefined') {
          window.__APP_READY__ = true;
        }
      }
    }

    return {
      initializeCoreServices: initializeCoreServices,
      initApp: initApp,
      startApp: startApp
    };
  };
})();
