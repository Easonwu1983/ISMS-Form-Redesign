// @ts-check
(function () {
  window.createAppAuthSessionRuntimeModule = function createAppAuthSessionRuntimeModule() {
    function buildAuthSessionDeps(deps) {
      const d = deps && typeof deps === 'object' ? deps : {};
      return {
        AUTH_KEY: d.AUTH_KEY,
        ROLES: d.ROLES,
        getAuthMode: d.getAuthMode,
        currentUser: d.currentUser,
        normalizeUserRecord: d.normalizeUserRecord,
        normalizeRemoteSystemUsers: d.normalizeRemoteSystemUsers,
        requestAuthJson: d.requestAuthJson,
        toast: d.toast,
        logout: d.logout,
        canManageUsers: d.canManageUsers,
        recordBootstrapStep: d.recordBootstrapStep,
        syncTrainingFormsFromM365: d.syncTrainingFormsFromM365,
        syncTrainingRostersFromM365: d.syncTrainingRostersFromM365,
        syncChecklistsFromM365: d.syncChecklistsFromM365,
        syncCorrectiveActionsFromM365: d.syncCorrectiveActionsFromM365,
        syncUsersFromM365: d.syncUsersFromM365,
        syncReviewScopesFromM365: d.syncReviewScopesFromM365
      };
    }

    function markAuthenticatedBootstrapReady(deps, user) {
      return deps.getAppAuthSessionModule().markAuthenticatedBootstrapReady({
        ...buildAuthSessionDeps(deps),
        user
      });
    }

    function ensureAuthenticatedRemoteBootstrap(deps) {
      return deps.getAppAuthSessionModule().ensureAuthenticatedRemoteBootstrap(buildAuthSessionDeps(deps));
    }

    function isAuthenticatedRemoteBootstrapPending(deps) {
      return deps.getAppAuthSessionModule().isAuthenticatedRemoteBootstrapPending(buildAuthSessionDeps(deps));
    }

    function clearSessionHeartbeat(deps) {
      return deps.getAppAuthSessionModule().clearSessionHeartbeat(buildAuthSessionDeps(deps));
    }

    function runSessionHeartbeat(deps) {
      return deps.getAppAuthSessionModule().runSessionHeartbeat(buildAuthSessionDeps(deps));
    }

    function ensureSessionHeartbeat(deps) {
      return deps.getAppAuthSessionModule().ensureSessionHeartbeat(buildAuthSessionDeps(deps));
    }

    return {
      buildAuthSessionDeps: buildAuthSessionDeps,
      markAuthenticatedBootstrapReady: markAuthenticatedBootstrapReady,
      ensureAuthenticatedRemoteBootstrap: ensureAuthenticatedRemoteBootstrap,
      isAuthenticatedRemoteBootstrapPending: isAuthenticatedRemoteBootstrapPending,
      clearSessionHeartbeat: clearSessionHeartbeat,
      runSessionHeartbeat: runSessionHeartbeat,
      ensureSessionHeartbeat: ensureSessionHeartbeat
    };
  };
})();
