(function () {
  window.createAppRouterModule = function createAppRouterModule() {
    let lastStableHash = '';
    let appEventListenersInstalled = false;

    function setLastStableHash(value) {
      lastStableHash = String(value || '').trim() || '#dashboard';
    }

    function navigate(deps, hash, options) {
      const opts = options || {};
      if (!opts.allowDirtyNavigation && deps.hasUnsavedChangesGuard()) {
        if (!deps.confirmDiscardUnsavedChanges(opts.unsavedMessage)) return;
      }
      const target = '#' + String(hash || '').replace(/^#/, '');
      if (window.location.hash === target) {
        if (opts.replace && window.history && typeof window.history.replaceState === 'function') {
          window.history.replaceState(null, '', target);
        }
        deps.handleRoute();
        return;
      }
      if (opts.replace && window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', target);
        deps.handleRoute();
        return;
      }
      window.location.hash = target;
    }

    function handleHashChange(deps) {
      const nextHash = window.location.hash || '#dashboard';
      if (nextHash !== lastStableHash && deps.hasUnsavedChangesGuard()) {
        const ok = deps.confirmDiscardUnsavedChanges('變更尚未儲存，確定要離開目前頁面嗎？');
        if (!ok) {
          window.history.replaceState(null, '', lastStableHash || '#dashboard');
          return;
        }
      }
      deps.handleRoute();
      setLastStableHash(window.location.hash || '#dashboard');
    }

    function handleWindowResize(deps) {
      if (!deps.isMobileViewport()) deps.closeSidebar();
    }

    function handleWindowLoad(deps) {
      deps.refreshIcons();
    }

    function handleWindowFocus(deps) {
      deps.runSessionHeartbeat().catch(function (error) {
        console.warn('session heartbeat failed', error);
      });
    }

    function handleDocumentVisibilityChange(deps) {
      if (document.visibilityState === 'visible') {
        deps.runSessionHeartbeat().catch(function (error) {
          console.warn('session heartbeat failed', error);
        });
      }
    }

    function handleStorageWarningEvent(deps, event) {
      const message = String(event && event.detail && event.detail.message || '').trim();
      if (message) deps.toast(message, 'error');
    }

    function installAppEventListeners(deps) {
      if (appEventListenersInstalled) return;
      appEventListenersInstalled = true;
      window.addEventListener('hashchange', function () { handleHashChange(deps); });
      window.addEventListener('resize', function () { handleWindowResize(deps); });
      window.addEventListener('load', function () { handleWindowLoad(deps); });
      window.addEventListener('focus', function () { handleWindowFocus(deps); });
      document.addEventListener('visibilitychange', function () { handleDocumentVisibilityChange(deps); });
      window.addEventListener('isms:storage-warning', function (event) { handleStorageWarningEvent(deps, event); });
    }

    return {
      navigate: navigate,
      setLastStableHash: setLastStableHash,
      handleHashChange: handleHashChange,
      installAppEventListeners: installAppEventListeners
    };
  };
})();
