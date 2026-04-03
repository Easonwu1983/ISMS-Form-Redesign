// @ts-check
(function () {
  window.createAppBootstrapStateModule = function createAppBootstrapStateModule() {
    function getBootstrapCoordinator(deps) {
      if (!deps || typeof deps.getServiceRegistryModule !== 'function') {
        throw new Error('getServiceRegistryModule unavailable');
      }
      return deps.getServiceRegistryModule().getBootstrapState();
    }

    function recordBootstrapStep(deps, step, detail) {
      const coordinator = getBootstrapCoordinator(deps);
      if (!coordinator || typeof coordinator.record !== 'function') return;
      coordinator.record(step, detail);
    }

    return {
      getBootstrapCoordinator: getBootstrapCoordinator,
      recordBootstrapStep: recordBootstrapStep
    };
  };
})();
