(function () {
  window.createAppServiceAccessModule = function createAppServiceAccessModule() {
    const cache = Object.create(null);

    function resolve(deps, name, options) {
      if (cache[name]) return cache[name];
      const d = deps && typeof deps === 'object' ? deps : {};
      if (typeof d.resolveFactoryService !== 'function') {
        throw new Error('resolveFactoryService unavailable');
      }
      cache[name] = d.resolveFactoryService(name, options || {});
      return cache[name];
    }

    function requireFactory(factoryName, scriptName, readyStep, detail, create) {
      return {
        factory: function () {
          if (typeof window === 'undefined' || typeof window[factoryName] !== 'function') {
            if (typeof create.recordBootstrapStep === 'function') {
              create.recordBootstrapStep(readyStep.replace('-ready', '-missing-factory'), detail);
            }
            throw new Error(scriptName + ' not loaded');
          }
          return window[factoryName](create.args);
        },
        globalSlot: create.globalSlot,
        readyStep: readyStep
      };
    }

    function getAppBootstrapModule(deps) {
      return resolve(deps, 'appBootstrapModule', requireFactory(
        'createAppBootstrapModule',
        'app-bootstrap-module.js',
        'app-bootstrap-ready',
        'createAppBootstrapModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appBootstrapModule' }
      ));
    }

    function getAppBootstrapStateModule(deps) {
      return resolve(deps, 'appBootstrapStateModule', requireFactory(
        'createAppBootstrapStateModule',
        'app-bootstrap-state-module.js',
        'app-bootstrap-state-ready',
        'createAppBootstrapStateModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appBootstrapStateModule' }
      ));
    }

    function getAppEntryModule(deps) {
      return resolve(deps, 'appEntryModule', requireFactory(
        'createAppEntryModule',
        'app-entry-module.js',
        'app-entry-ready',
        'createAppEntryModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appEntryModule' }
      ));
    }

    function getAppRouteModule(deps) {
      return resolve(deps, 'appRouteModule', requireFactory(
        'createAppRouteModule',
        'app-route-module.js',
        'app-route-ready',
        'createAppRouteModule unavailable',
        {
          recordBootstrapStep: deps.recordBootstrapStep,
          globalSlot: '_appRouteModule',
          args: {
            ROUTE_WHITELIST: deps.routeWhitelist,
            defaultTitle: deps.defaultTitle
          }
        }
      ));
    }

    function getAppPageOrchestrationModule(deps) {
      return resolve(deps, 'appPageOrchestrationModule', requireFactory(
        'createAppPageOrchestrationModule',
        'app-page-orchestration-module.js',
        'app-page-orchestration-ready',
        'createAppPageOrchestrationModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appPageOrchestrationModule' }
      ));
    }

    function getAppVisibilityModule(deps) {
      return resolve(deps, 'appVisibilityModule', requireFactory(
        'createAppVisibilityModule',
        'app-visibility-module.js',
        'app-visibility-ready',
        'createAppVisibilityModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appVisibilityModule' }
      ));
    }

    function getAppActionModule(deps) {
      return resolve(deps, 'appActionModule', requireFactory(
        'createAppActionModule',
        'app-action-module.js',
        'app-action-ready',
        'createAppActionModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appActionModule' }
      ));
    }

    function getAppShellOrchestrationModule(deps) {
      return resolve(deps, 'appShellOrchestrationModule', requireFactory(
        'createAppShellOrchestrationModule',
        'app-shell-orchestration-module.js',
        'app-shell-orchestration-ready',
        'createAppShellOrchestrationModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appShellOrchestrationModule' }
      ));
    }

    function getAppAuthSessionModule(deps) {
      return resolve(deps, 'appAuthSessionModule', requireFactory(
        'createAppAuthSessionModule',
        'app-auth-session-module.js',
        'app-auth-session-ready',
        'createAppAuthSessionModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appAuthSessionModule' }
      ));
    }

    function getAppRouterModule(deps) {
      return resolve(deps, 'appRouterModule', requireFactory(
        'createAppRouterModule',
        'app-router-module.js',
        'app-router-ready',
        'createAppRouterModule unavailable',
        { recordBootstrapStep: deps.recordBootstrapStep, globalSlot: '_appRouterModule' }
      ));
    }

    return {
      getAppBootstrapModule,
      getAppBootstrapStateModule,
      getAppEntryModule,
      getAppRouteModule,
      getAppPageOrchestrationModule,
      getAppVisibilityModule,
      getAppActionModule,
      getAppShellOrchestrationModule,
      getAppAuthSessionModule,
      getAppRouterModule
    };
  };
})();
