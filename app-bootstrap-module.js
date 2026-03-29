(function () {
  window.createAppBootstrapModule = function createAppBootstrapModule() {
    function scheduleIdleTask(task, timeoutMs) {
      const run = function () {
        try {
          task();
        } catch (error) {
          console.warn('bootstrap task failed', error);
        }
      };
      const waitMs = Number(timeoutMs) || 2000;
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: waitMs });
        return;
      }
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(run, 0);
        return;
      }
      run();
    }

    async function initApp(deps) {
      const options = deps && typeof deps === 'object' ? deps : {};
      const recordBootstrapStep = typeof options.recordBootstrapStep === 'function' ? options.recordBootstrapStep : function () {};
      recordBootstrapStep('app-init-start', window.location.hash || '#dashboard');
      options.installGlobalDelegation();
      options.installAppEventListeners();
      options.initializeCoreServices('initApp');
      options.renderApp();
      void options.ensureAuthenticatedRemoteBootstrap();

      scheduleIdleTask(function () {
        if (options.getAuthMode() === 'm365-api') return;
        try {
          options.seedData();
        } catch (error) {
          console.warn('seed data warmup failed', error);
        }
        try {
          options.ensurePrimaryAdminProfile();
        } catch (error) {
          console.warn('primary admin warmup failed', error);
        }
      });

      scheduleIdleTask(function () {
        void options.migrateAttachmentStores().catch(function (error) {
          console.warn('attachment migration failed', error);
        });
      });

      scheduleIdleTask(function () {
        try {
          options.getDataModule().migrateAllStores();
        } catch (error) {
          console.warn('store migration failed', error);
        }
      });

      options.setLastStableHash(window.location.hash || '#dashboard');
      options.refreshIcons();
      if (typeof window !== 'undefined') {
        window.__APP_READY__ = true;
      }
      recordBootstrapStep('app-ready', window.location.hash || '#dashboard');
    }

    return {
      scheduleIdleTask: scheduleIdleTask,
      initApp: initApp
    };
  };
})();
