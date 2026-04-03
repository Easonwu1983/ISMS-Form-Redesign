// @ts-check
(function () {
  window.createAppAuthRemoteModule = function createAppAuthRemoteModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};

      function buildRemoteSessionUser(body) {
        const item = opts.normalizeRemoteSystemUsers(body)[0];
        if (!item) return null;
        return opts.normalizeUserRecord({
          ...item,
          sessionToken: String(body && body.session && body.session.token || '').trim(),
          sessionExpiresAt: String(body && body.session && body.session.expiresAt || '').trim(),
          mustChangePassword: body && body.mustChangePassword === true
        });
      }

      async function submitBackendLogin(username, password) {
        const cleanUsername = String(username || '').trim();
        const cleanPassword = String(password || '').trim();
        if (!cleanUsername || !cleanPassword) return null;

        if (opts.getAuthMode() !== 'm365-api') {
          const localUser = opts.findUser(cleanUsername);
          if (!localUser || !(await opts.verifyLocalPasswordValue(localUser, cleanPassword))) return null;
          return opts.normalizeUserRecord(localUser);
        }

        const healthEndpoint = opts.getAuthHealthEndpoint();
        if (healthEndpoint) {
          const health = await opts.requestAuthJson('/health', { method: 'GET' });
          if (health && health.ready === false) {
            throw new Error(String(health.message || '登入後端尚未就緒').trim());
          }
        }

        try {
          const body = await opts.requestAuthJson('/login', {
            method: 'POST',
            body: {
              action: opts.AUTH_ACTIONS.LOGIN,
              payload: {
                username: cleanUsername,
                password: cleanPassword
              }
            }
          });
          return buildRemoteSessionUser(body);
        } catch (error) {
          const message = String(error && error.message || error || '').trim();
          if (message === 'Invalid username or password') return null;
          throw error;
        }
      }

      function verifyCurrentSessionWithBackend() {
        return opts.getAppAuthSessionModule().verifyCurrentSessionWithBackend({
          AUTH_KEY: opts.AUTH_KEY,
          getAuthMode: opts.getAuthMode,
          currentUser: opts.currentUser,
          normalizeUserRecord: opts.normalizeUserRecord,
          normalizeRemoteSystemUsers: opts.normalizeRemoteSystemUsers,
          requestAuthJson: opts.requestAuthJson
        });
      }

      function submitAuthLogout(payload) {
        const input = payload && typeof payload === 'object' ? payload : {};
        if (opts.getAuthMode() !== 'm365-api') return Promise.resolve({ ok: true, source: 'local' });
        return opts.requestAuthJson('/logout', {
          method: 'POST',
          body: {
            action: opts.AUTH_ACTIONS.LOGOUT,
            payload: {
              username: String(input.username || '').trim(),
              sessionToken: String(input.sessionToken || '').trim()
            }
          }
        });
      }

      async function submitAuthResetPasswordByEmail(email) {
        const input = email && typeof email === 'object' ? email : { email: email };
        const cleanMail = String(input.email || '').trim().toLowerCase();
        const cleanUsername = String(input.username || '').trim();
        if (!cleanMail || !cleanUsername) return null;

        if (opts.getAuthMode() !== 'm365-api') {
          return opts.submitUserResetPassword({ email: cleanMail });
        }

        const healthEndpoint = opts.getAuthHealthEndpoint();
        if (healthEndpoint) {
          const health = await opts.requestAuthJson('/health', { method: 'GET' });
          if (health && health.ready === false) {
            throw new Error(String(health.message || '登入後端尚未就緒').trim());
          }
        }

        try {
          const body = await opts.requestAuthJson('/request-reset', {
            method: 'POST',
            body: {
              action: opts.AUTH_ACTIONS.REQUEST_RESET,
              payload: {
                username: cleanUsername,
                email: cleanMail
              }
            }
          });
          const item = opts.normalizeRemoteSystemUsers(body)[0] || { email: cleanMail, username: cleanUsername };
          const stored = opts.upsertSystemUserInStore(item);
          return {
            user: stored,
            resetTokenExpiresAt: String(body && body.resetTokenExpiresAt || '').trim(),
            delivery: body && body.delivery ? body.delivery : null,
            source: 'remote'
          };
        } catch (error) {
          const message = String(error && error.message || error || '').trim();
          if (message === 'System user not found') return null;
          throw error;
        }
      }

      async function submitAuthRedeemResetPassword(payload) {
        const input = payload && typeof payload === 'object' ? payload : {};
        const username = String(input.username || '').trim();
        const token = String(input.token || '').trim();
        const newPassword = String(input.newPassword || '').trim();
        if (!username || !token || !newPassword) return null;
        const body = await opts.requestAuthJson('/redeem-reset', {
          method: 'POST',
          body: {
            action: opts.AUTH_ACTIONS.REDEEM_RESET,
            payload: {
              username: username,
              token: token,
              newPassword: newPassword
            }
          }
        });
        return buildRemoteSessionUser(body);
      }

      async function submitAuthChangePassword(payload) {
        const input = payload && typeof payload === 'object' ? payload : {};
        const username = String(input.username || '').trim();
        const currentPassword = String(input.currentPassword || '').trim();
        const newPassword = String(input.newPassword || '').trim();
        if (!username || !currentPassword || !newPassword) return null;
        const body = await opts.requestAuthJson('/change-password', {
          method: 'POST',
          body: {
            action: opts.AUTH_ACTIONS.CHANGE_PASSWORD,
            payload: {
              username: username,
              currentPassword: currentPassword,
              newPassword: newPassword,
              sessionToken: String(input.sessionToken || '').trim()
            }
          }
        });
        return buildRemoteSessionUser(body);
      }

      return {
        submitBackendLogin: submitBackendLogin,
        verifyCurrentSessionWithBackend: verifyCurrentSessionWithBackend,
        submitAuthLogout: submitAuthLogout,
        submitAuthResetPasswordByEmail: submitAuthResetPasswordByEmail,
        submitAuthRedeemResetPassword: submitAuthRedeemResetPassword,
        submitAuthChangePassword: submitAuthChangePassword
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
