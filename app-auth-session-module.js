(function () {
  window.createAppAuthSessionModule = function createAppAuthSessionModule() {
    let authenticatedBootstrapKey = '';
    let authenticatedBootstrapPromise = null;
    let authenticatedBootstrapState = 'idle';
    let sessionHeartbeatTimer = null;
    let sessionHeartbeatKey = '';
    let sessionExpiryReminderKey = '';

    const SESSION_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
    const SESSION_EXPIRY_WARNING_MS = 10 * 60 * 1000;

    function setAuthenticatedBootstrapState(nextState) {
      authenticatedBootstrapState = String(nextState || 'idle').trim() || 'idle';
      if (typeof window !== 'undefined') {
        window.__REMOTE_BOOTSTRAP_STATE__ = authenticatedBootstrapState;
        window.__REMOTE_BOOTSTRAP_KEY__ = authenticatedBootstrapKey || '';
      }
      return authenticatedBootstrapState;
    }

    function buildAuthenticatedBootstrapKey(user) {
      if (!user) return '';
      return [
        String(user.username || '').trim(),
        String(user.activeUnit || '').trim(),
        String(user.sessionToken || '').trim(),
        String(user.sessionExpiresAt || '').trim()
      ].join('|');
    }

    function scheduleAuthenticatedBootstrapWarmup(taskFactory, labels) {
      const run = function () {
        let tasks = [];
        try {
          tasks = typeof taskFactory === 'function' ? (taskFactory() || []) : [];
        } catch (error) {
          window.__ismsWarn('authenticated bootstrap warmup setup failed', error);
          return;
        }
        Promise.allSettled(tasks).then(function (results) {
          const fallbackLabels = Array.isArray(labels) ? labels : [];
          results.forEach(function (result, index) {
            if (result.status === 'rejected') {
              window.__ismsWarn(fallbackLabels[index] || 'authenticated bootstrap warmup failed', result.reason);
            }
          });
        });
      };
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 2500 });
        return;
      }
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(run, 120);
        return;
      }
      run();
    }

    function buildSessionDeps(options) {
      const deps = options && typeof options === 'object' ? options : {};
      return {
        AUTH_KEY: String(deps.AUTH_KEY || 'cats_auth'),
        ROLES: deps.ROLES || {},
        getAuthMode: typeof deps.getAuthMode === 'function' ? deps.getAuthMode : function () { return 'local'; },
        currentUser: typeof deps.currentUser === 'function' ? deps.currentUser : function () { return null; },
        normalizeUserRecord: typeof deps.normalizeUserRecord === 'function' ? deps.normalizeUserRecord : function (value) { return value; },
        normalizeRemoteSystemUsers: typeof deps.normalizeRemoteSystemUsers === 'function' ? deps.normalizeRemoteSystemUsers : function () { return []; },
        requestAuthJson: typeof deps.requestAuthJson === 'function' ? deps.requestAuthJson : function () { return Promise.resolve(null); },
        toast: typeof deps.toast === 'function' ? deps.toast : function () {},
        logout: typeof deps.logout === 'function' ? deps.logout : function () { return Promise.resolve(); },
        canManageUsers: typeof deps.canManageUsers === 'function' ? deps.canManageUsers : function () { return false; },
        recordBootstrapStep: typeof deps.recordBootstrapStep === 'function' ? deps.recordBootstrapStep : function () {},
        syncTrainingFormsFromM365: typeof deps.syncTrainingFormsFromM365 === 'function' ? deps.syncTrainingFormsFromM365 : function () { return Promise.resolve(); },
        syncTrainingRostersFromM365: typeof deps.syncTrainingRostersFromM365 === 'function' ? deps.syncTrainingRostersFromM365 : function () { return Promise.resolve(); },
        syncChecklistsFromM365: typeof deps.syncChecklistsFromM365 === 'function' ? deps.syncChecklistsFromM365 : function () { return Promise.resolve(); },
        syncCorrectiveActionsFromM365: typeof deps.syncCorrectiveActionsFromM365 === 'function' ? deps.syncCorrectiveActionsFromM365 : function () { return Promise.resolve(); },
        syncUsersFromM365: typeof deps.syncUsersFromM365 === 'function' ? deps.syncUsersFromM365 : function () { return Promise.resolve(); },
        syncReviewScopesFromM365: typeof deps.syncReviewScopesFromM365 === 'function' ? deps.syncReviewScopesFromM365 : function () { return Promise.resolve(); }
      };
    }

    async function verifyCurrentSessionWithBackend(options) {
      const deps = buildSessionDeps(options);
      if (deps.getAuthMode() !== 'm365-api') return deps.currentUser();
      const user = deps.currentUser();
      if (!user || !String(user.sessionToken || '').trim()) return null;
      const cacheKey = [
        String(user.username || '').trim().toLowerCase(),
        String(user.sessionToken || '').trim()
      ].join('::');
      const cachedVerifyRaw = (function () {
        try {
          return String(sessionStorage.getItem('__AUTH_VERIFY_CACHE__') || '');
        } catch (_) {
          return '';
        }
      })();
      if (cachedVerifyRaw) {
        try {
          const cachedVerify = JSON.parse(cachedVerifyRaw);
          if (
            cachedVerify &&
            String(cachedVerify.key || '') === cacheKey &&
            Number(cachedVerify.expiresAt || 0) > Date.now() &&
            cachedVerify.user
          ) {
            return deps.normalizeUserRecord(cachedVerify.user);
          }
        } catch (_) {}
      }
      const body = await deps.requestAuthJson('/verify', { method: 'GET' });
      const item = deps.normalizeRemoteSystemUsers(body)[0];
      if (!item) return null;
      const normalized = deps.normalizeUserRecord({
        ...item,
        sessionToken: String(body && body.session && body.session.token || user.sessionToken || '').trim(),
        sessionExpiresAt: String(body && body.session && body.session.expiresAt || user.sessionExpiresAt || '').trim(),
        mustChangePassword: body && body.mustChangePassword === true
      });
      try {
        sessionStorage.setItem('__AUTH_VERIFY_CACHE__', JSON.stringify({
          key: cacheKey,
          expiresAt: Date.now() + (30 * 1000),
          user: normalized
        }));
      } catch (_) {}
      return normalized;
    }

    function markAuthenticatedBootstrapReady(options) {
      const deps = buildSessionDeps(options);
      const activeUser = options && options.user ? options.user : deps.currentUser();
      if (!activeUser) return '';
      authenticatedBootstrapKey = buildAuthenticatedBootstrapKey(activeUser);
      authenticatedBootstrapPromise = Promise.resolve(authenticatedBootstrapKey);
      setAuthenticatedBootstrapState('ready');
      return authenticatedBootstrapPromise;
    }

    async function ensureAuthenticatedRemoteBootstrap(options) {
      const deps = buildSessionDeps(options);
      const user = deps.currentUser();
      if (!user) {
        authenticatedBootstrapKey = '';
        authenticatedBootstrapPromise = null;
        setAuthenticatedBootstrapState('idle');
        return '';
      }
      const nextKey = buildAuthenticatedBootstrapKey(user);
      if (authenticatedBootstrapPromise && authenticatedBootstrapKey === nextKey) {
        return authenticatedBootstrapPromise;
      }
      const freshLoginBootstrap = (function () {
        try {
          return typeof window !== 'undefined'
            && window.sessionStorage
            && String(window.sessionStorage.getItem('__AUTH_BOOTSTRAP_FRESH__') || '').trim() === '1';
        } catch (_) {
          return false;
        }
      })();
      if (freshLoginBootstrap) {
        try { window.sessionStorage.removeItem('__AUTH_BOOTSTRAP_FRESH__'); } catch (_) {}
        authenticatedBootstrapKey = nextKey;
        authenticatedBootstrapPromise = Promise.resolve(nextKey);
        setAuthenticatedBootstrapState('ready');
        scheduleAuthenticatedBootstrapWarmup(function () {
          return [
            deps.syncTrainingFormsFromM365({ silent: true }),
            deps.syncTrainingRostersFromM365({ silent: true }),
            deps.syncChecklistsFromM365({ silent: true }),
            deps.syncCorrectiveActionsFromM365({ silent: true })
          ];
        }, [
          'training bootstrap warmup failed',
          'training roster bootstrap warmup failed',
          'checklist bootstrap warmup failed',
          'corrective action bootstrap warmup failed'
        ]);
        return authenticatedBootstrapPromise;
      }
      authenticatedBootstrapKey = nextKey;
      setAuthenticatedBootstrapState('pending');
      authenticatedBootstrapPromise = (async function () {
        let activeUser = user;
        try {
          const verifiedUser = await verifyCurrentSessionWithBackend(deps);
          if (!verifiedUser) {
            sessionStorage.removeItem(deps.AUTH_KEY);
            authenticatedBootstrapKey = '';
            authenticatedBootstrapPromise = null;
            setAuthenticatedBootstrapState('idle');
            return '';
          }
          sessionStorage.setItem(deps.AUTH_KEY, JSON.stringify(verifiedUser));
          activeUser = verifiedUser;
        } catch (error) {
          if (Number(error && error.statusCode) === 401 || Number(error && error.statusCode) === 403) {
            try { sessionStorage.removeItem(deps.AUTH_KEY); } catch (_) {}
            try { localStorage.removeItem(deps.AUTH_KEY); } catch (_) {}
            authenticatedBootstrapKey = '';
            authenticatedBootstrapPromise = null;
            setAuthenticatedBootstrapState('idle');
            deps.recordBootstrapStep('bootstrap-session-expired', String(activeUser && activeUser.username || 'anonymous'));
            return '';
          }
          setAuthenticatedBootstrapState('error');
          throw error;
        }
        setAuthenticatedBootstrapState('ready');
        scheduleAuthenticatedBootstrapWarmup(function () {
          const syncTasks = [
            deps.syncTrainingFormsFromM365({ silent: true }),
            deps.syncTrainingRostersFromM365({ silent: true }),
            deps.syncChecklistsFromM365({ silent: true }),
            deps.syncCorrectiveActionsFromM365({ silent: true })
          ];
          if (deps.canManageUsers(activeUser)) syncTasks.push(deps.syncUsersFromM365({ silent: true }));
          if (activeUser.role === deps.ROLES.ADMIN || activeUser.role === deps.ROLES.UNIT_ADMIN) {
            syncTasks.push(deps.syncReviewScopesFromM365({ silent: true }));
          }
          return syncTasks;
        }, [
          'training bootstrap warmup failed',
          'training roster bootstrap warmup failed',
          'checklist bootstrap warmup failed',
          'corrective action bootstrap warmup failed',
          'user bootstrap warmup failed',
          'review scope bootstrap warmup failed'
        ]);
        return nextKey;
      })();
      return authenticatedBootstrapPromise;
    }

    function isAuthenticatedRemoteBootstrapPending(options) {
      const deps = buildSessionDeps(options);
      const user = deps.currentUser();
      if (!user) return false;
      const nextKey = buildAuthenticatedBootstrapKey(user);
      return authenticatedBootstrapState === 'pending' && authenticatedBootstrapKey === nextKey;
    }

    function clearSessionHeartbeat() {
      if (sessionHeartbeatTimer && typeof window !== 'undefined' && typeof window.clearInterval === 'function') {
        window.clearInterval(sessionHeartbeatTimer);
      }
      sessionHeartbeatTimer = null;
      sessionHeartbeatKey = '';
    }

    function getSessionExpiresAtMs(user) {
      const value = Date.parse(String(user && user.sessionExpiresAt || '').trim());
      return Number.isFinite(value) ? value : 0;
    }

    function maybeWarnSessionExpiry(options, user) {
      const deps = buildSessionDeps(options);
      const expiresAt = getSessionExpiresAtMs(user);
      if (!expiresAt) return;
      const remainingMs = expiresAt - Date.now();
      if (remainingMs > SESSION_EXPIRY_WARNING_MS) return;
      const reminderKey = [
        String(user && user.username || '').trim(),
        String(user && user.sessionToken || '').trim(),
        String(expiresAt)
      ].join('|');
      if (!reminderKey || sessionExpiryReminderKey === reminderKey) return;
      sessionExpiryReminderKey = reminderKey;
      deps.toast('登入狀態將於 10 分鐘內到期，請儘速完成作業。', 'info');
    }

    async function runSessionHeartbeat(options) {
      const deps = buildSessionDeps(options);
      if (deps.getAuthMode() !== 'm365-api') return;
      const user = deps.currentUser();
      if (!user || !String(user.sessionToken || '').trim()) {
        clearSessionHeartbeat();
        sessionExpiryReminderKey = '';
        return;
      }
      try {
        const verifiedUser = await verifyCurrentSessionWithBackend(deps);
        if (!verifiedUser) {
          sessionStorage.removeItem(deps.AUTH_KEY);
          sessionExpiryReminderKey = '';
          deps.toast('登入狀態已失效，請重新登入。', 'error');
          await deps.logout();
          return;
        }
        sessionStorage.setItem(deps.AUTH_KEY, JSON.stringify(verifiedUser));
        maybeWarnSessionExpiry(deps, verifiedUser);
      } catch (error) {
        const statusCode = Number(error && error.statusCode || 0);
        const message = String(error && error.message || error || '').trim();
        if (statusCode === 401 || statusCode === 403 || message === '登入狀態已失效，請重新登入。') {
          sessionStorage.removeItem(deps.AUTH_KEY);
          sessionExpiryReminderKey = '';
          deps.toast('登入狀態已失效，請重新登入。', 'error');
          await deps.logout();
          return;
        }
        window.__ismsWarn('session heartbeat failed', error);
      }
    }

    function ensureSessionHeartbeat(options) {
      const deps = buildSessionDeps(options);
      if (typeof window === 'undefined') return;
      if (deps.getAuthMode() !== 'm365-api') return;
      const user = deps.currentUser();
      const heartbeatKey = user
        ? [
          String(user.username || '').trim().toLowerCase(),
          String(user.activeUnit || '').trim(),
          String(user.sessionToken || '').trim(),
          String(user.sessionExpiresAt || '').trim()
        ].join('|')
        : '';
      if (!user || !String(user.sessionToken || '').trim()) {
        clearSessionHeartbeat();
        sessionExpiryReminderKey = '';
        return;
      }
      if (sessionHeartbeatTimer && sessionHeartbeatKey === heartbeatKey) return;
      clearSessionHeartbeat();
      sessionExpiryReminderKey = '';
      maybeWarnSessionExpiry(deps, user);
      sessionHeartbeatKey = heartbeatKey;
      sessionHeartbeatTimer = window.setInterval(function () {
        runSessionHeartbeat(deps).catch(function (error) {
          window.__ismsWarn('session heartbeat failed', error);
        });
      }, SESSION_HEARTBEAT_INTERVAL_MS);
    }

    return {
      verifyCurrentSessionWithBackend: verifyCurrentSessionWithBackend,
      markAuthenticatedBootstrapReady: markAuthenticatedBootstrapReady,
      ensureAuthenticatedRemoteBootstrap: ensureAuthenticatedRemoteBootstrap,
      isAuthenticatedRemoteBootstrapPending: isAuthenticatedRemoteBootstrapPending,
      clearSessionHeartbeat: clearSessionHeartbeat,
      runSessionHeartbeat: runSessionHeartbeat,
      ensureSessionHeartbeat: ensureSessionHeartbeat
    };
  };
})();
