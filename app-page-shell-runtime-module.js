(function () {
  window.createAppPageShellRuntimeModule = function createAppPageShellRuntimeModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const ROUTE_WHITELIST = opts.getAppPageOrchestrationModule().buildRouteWhitelist({
        currentUser: opts.currentUser,
        canCreateCAR: opts.canCreateCAR,
        canManageUsers: opts.canManageUsers,
        isAdmin: opts.isAdmin,
        canFillChecklist: opts.canFillChecklist,
        canFillTraining: opts.canFillTraining,
        getCaseModule: opts.getCaseModule,
        getAdminModule: opts.getAdminModule,
        getChecklistModule: opts.getChecklistModule,
        getTrainingModule: opts.getTrainingModule,
        getUnitContactApplicationModule: opts.getUnitContactApplicationModule
      });

      function bindRouteManifest(target) {
        const scope = target && typeof target === 'object' ? target : window;
        scope._routeWhitelist = function () {
          return opts.getAppRouteModule().getRouteManifest();
        };
      }

      function getRouteMeta(page) {
        return opts.getAppRouteModule().getRouteMeta(page);
      }

      function getRouteTitle(page) {
        return opts.getAppRouteModule().getRouteTitle(page);
      }

      function canAccessRoute(page, routeParam) {
        return opts.getAppRouteModule().canAccessRoute(page, routeParam);
      }

      function getRouteFallback(page) {
        return opts.getAppRouteModule().getRouteFallback(page);
      }

      function refreshIcons() {
        return opts.getUiModule().refreshIcons();
      }

      function getVisibleItems(user) {
        return opts.getAppVisibilityModule().getVisibleItems({
          DATA_KEY: opts.DATA_KEY,
          currentUser: opts.currentUser,
          getDataModule: opts.getDataModule,
          getPolicyModule: opts.getPolicyModule
        }, user);
      }

      function canAccessItem(item, user) {
        return opts.getAppVisibilityModule().canAccessItem({
          currentUser: opts.currentUser,
          getPolicyModule: opts.getPolicyModule
        }, item, user);
      }

      function isItemHandler(item, user) {
        return opts.getAppVisibilityModule().isItemHandler({
          currentUser: opts.currentUser,
          getPolicyModule: opts.getPolicyModule
        }, item, user);
      }

      function canRespondItem(item, user) {
        return opts.getAppVisibilityModule().canRespondItem({
          currentUser: opts.currentUser,
          getPolicyModule: opts.getPolicyModule
        }, item, user);
      }

      function canSubmitTracking(item, user) {
        return opts.getAppVisibilityModule().canSubmitTracking({
          currentUser: opts.currentUser,
          getPolicyModule: opts.getPolicyModule
        }, item, user);
      }

      function toTestIdFragment(value) {
        return opts.getUiModule().toTestIdFragment(value);
      }

      function isMobileViewport() {
        return opts.getAppShellOrchestrationModule().isMobileViewport({
          getShellModule: opts.getShellModule
        });
      }

      function closeSidebar() {
        return opts.getAppShellOrchestrationModule().closeSidebar({
          getShellModule: opts.getShellModule
        });
      }

      function toggleSidebar() {
        return opts.getAppShellOrchestrationModule().toggleSidebar({
          getShellModule: opts.getShellModule
        });
      }

      function renderLogin() {
        return opts.getAppShellOrchestrationModule().renderLogin({
          getShellModule: opts.getShellModule
        });
      }

      function renderApp() {
        return opts.getAppShellOrchestrationModule().renderApp({
          getShellModule: opts.getShellModule,
          ensureSessionHeartbeat: opts.ensureSessionHeartbeat
        });
      }

      function renderSidebar() {
        return opts.getAppShellOrchestrationModule().renderSidebar({
          getShellModule: opts.getShellModule
        });
      }

      function renderHeader() {
        return opts.getAppShellOrchestrationModule().renderHeader({
          getShellModule: opts.getShellModule
        });
      }

      return {
        ROUTE_WHITELIST,
        bindRouteManifest,
        getRouteMeta,
        getRouteTitle,
        canAccessRoute,
        getRouteFallback,
        refreshIcons,
        getVisibleItems,
        canAccessItem,
        isItemHandler,
        canRespondItem,
        canSubmitTracking,
        toTestIdFragment,
        isMobileViewport,
        closeSidebar,
        toggleSidebar,
        renderLogin,
        renderApp,
        renderSidebar,
        renderHeader
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
