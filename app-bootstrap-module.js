// @ts-check
(function () {
  window.createAppBootstrapModule = function createAppBootstrapModule() {
    function scheduleIdleTask(task, timeoutMs) {
      const run = function () {
        try {
          task();
        } catch (error) {
          window.__ismsWarn('bootstrap task failed', error);
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

      scheduleIdleTask(function () {
        if (options.getAuthMode() === 'm365-api') return;
        try {
          options.seedData();
        } catch (error) {
          window.__ismsWarn('seed data warmup failed', error);
        }
        try {
          options.ensurePrimaryAdminProfile();
        } catch (error) {
          window.__ismsWarn('primary admin warmup failed', error);
        }
      });

      scheduleIdleTask(function () {
        void options.migrateAttachmentStores().catch(function (error) {
          window.__ismsWarn('attachment migration failed', error);
        });
      });

      scheduleIdleTask(function () {
        try {
          options.getDataModule().migrateAllStores();
        } catch (error) {
          window.__ismsWarn('store migration failed', error);
        }
      });

      scheduleIdleTask(function () {
        void options.ensureAuthenticatedRemoteBootstrap().catch(function (error) {
          window.__ismsWarn('authenticated remote bootstrap failed', error);
        });
      }, 250);

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
