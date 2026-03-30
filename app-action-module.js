(function () {
  window.createAppActionModule = function createAppActionModule() {
    const globalActionHandlers = Object.create(null);
    let globalDelegationInstalled = false;

    function registerActionHandlers(namespace, handlers) {
      const prefix = String(namespace || '').trim();
      Object.entries(handlers || {}).forEach(function ([name, handler]) {
        if (typeof handler !== 'function') return;
        globalActionHandlers[prefix ? (prefix + '.' + name) : name] = handler;
      });
    }

    function handleActionClick(deps, event, actionEl) {
      if (!actionEl) return false;
      const handler = globalActionHandlers[actionEl.dataset.action];
      if (typeof handler !== 'function') return false;
      event.preventDefault();
      const result = handler({
        event: event,
        element: actionEl,
        dataset: { ...actionEl.dataset }
      });
      if (result && typeof result.then === 'function') {
        result.catch(function (error) {
          window.__ismsError(error && error.stack ? error.stack : String(error));
          deps.toast(String(error && error.message || error || '操作失敗'), 'error');
        });
      }
      return true;
    }

    function handleModalDismiss(event, dismissEl, deps) {
      if (!dismissEl) return false;
      event.preventDefault();
      deps.closeModalRoot();
      return true;
    }

    function handleRouteNavigation(event, routeEl, deps) {
      if (!routeEl) return false;
      const interactive = event.target.closest('a,button,input,select,textarea,label');
      if (interactive && interactive !== routeEl) return false;
      const route = String(routeEl.dataset.route || '').trim();
      if (!route) return false;
      event.preventDefault();
      deps.navigate(route);
      return true;
    }

    function installGlobalDelegation(deps) {
      if (globalDelegationInstalled || typeof document === 'undefined') return;
      globalDelegationInstalled = true;
      document.addEventListener('click', function (event) {
        const actionEl = event.target.closest('[data-action]');
        if (handleActionClick(deps, event, actionEl)) return;
        const dismissEl = event.target.closest('[data-dismiss-modal]');
        if (handleModalDismiss(event, dismissEl, deps)) return;
        const routeEl = event.target.closest('[data-route]');
        handleRouteNavigation(event, routeEl, deps);
      });
    }

    return {
      registerActionHandlers: registerActionHandlers,
      installGlobalDelegation: installGlobalDelegation
    };
  };
})();
