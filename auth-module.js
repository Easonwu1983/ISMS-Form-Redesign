// @ts-check
(function () {
  window.createAuthModule = function createAuthModule(deps) {
    const {
      AUTH_KEY,
      DATA_KEY,
      ROLES,
      loadData,
      saveData,
      getStoreTouchToken,
      getAuthorizedUnits,
      getActiveUnit,
      normalizeUserRecord,
      findUser,
      findUserByEmail,
      updateUser,
      addLoginLog,
      loginWithBackend,
      logoutWithBackend,
      resetPasswordWithBackend,
      redeemResetPasswordWithBackend,
      changePasswordWithBackend
    } = deps;

    const PRIMARY_ADMIN_NAME = '計算機及資訊網路中心';

    let authSessionCacheKey = '';
    let authSessionCacheValue = null;
    let currentUserCacheKey = '';
    let currentUserCacheValue = null;
    let localUsersCacheKey = '';
    let localUsersCacheValue = null;
    let authCacheListenerInstalled = false;

    function validateLocalPasswordComplexity(password) {
      const value = String(password || '');
      if (value.length < 8) throw new Error('密碼至少需 8 碼');
      if (!/[a-z]/.test(value)) throw new Error('密碼至少需包含一個英文小寫字母');
      if (!/[A-Z]/.test(value)) throw new Error('密碼至少需包含一個英文大寫字母');
      if (!/[0-9]/.test(value)) throw new Error('密碼至少需包含一個數字');
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(value)) throw new Error('密碼至少需包含一個特殊符號（如 !@#$%）');
    }

    async function hashLocalPassword(password) {
      const value = String(password || '');
      if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return Array.from(new Uint8Array(digest)).map(function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }
      throw new Error('瀏覽器不支援本機密碼雜湊');
    }

    function createSecurePassword() {
      if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
        throw new Error('瀏覽器不支援安全密碼產生');
      }
      const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
      const lower = 'abcdefghjkmnpqrstuvwxyz';
      const digits = '23456789';
      const special = '!@#$%&*_+-=';
      const all = upper + lower + digits + special;
      const randomChar = function (charset) {
        const bytes = new Uint32Array(1);
        window.crypto.getRandomValues(bytes);
        return charset[bytes[0] % charset.length];
      };
      const chars = [randomChar(upper), randomChar(lower), randomChar(digits), randomChar(special)];
      while (chars.length < 8) chars.push(randomChar(all));
      for (let index = chars.length - 1; index > 0; index -= 1) {
        const bytes = new Uint32Array(1);
        window.crypto.getRandomValues(bytes);
        const swapIndex = bytes[0] % (index + 1);
        const temp = chars[index];
        chars[index] = chars[swapIndex];
        chars[swapIndex] = temp;
      }
      return chars.join('');
    }

    function readAuthStorageRaw(storage) {
      try {
        if (!storage) return '';
        return String(storage.getItem(AUTH_KEY) || '');
      } catch (_) {
        return '';
      }
    }

    function readAuthStorage(storage) {
      try {
        const raw = readAuthStorageRaw(storage);
        return raw ? JSON.parse(raw) : null;
      } catch (_) {
        return null;
      }
    }

    function writeAuthStorage(storage, user) {
      if (!storage) return;
      try {
        if (!user) {
          storage.removeItem(AUTH_KEY);
        } else {
          storage.setItem(AUTH_KEY, JSON.stringify(user));
        }
      } catch (_) {
        // Ignore storage failures on this tab.
      }
    }

    function notifyAccessProfileChanged(reason, user) {
      if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
      const detail = {
        reason: String(reason || 'session-updated').trim() || 'session-updated',
        username: user && user.username ? String(user.username) : '',
        role: user && user.role ? String(user.role) : '',
        activeUnit: user && user.activeUnit ? String(user.activeUnit) : '',
        at: new Date().toISOString()
      };
      try {
        window.dispatchEvent(new CustomEvent('isms:access-profile-changed', { detail }));
      } catch (_) {
        // Ignore event dispatch failures.
      }
    }

    function getCacheInvalidationModule() {
      if (typeof window === 'undefined') return null;
      if (window.__ISMS_CACHE_INVALIDATION__ && typeof window.__ISMS_CACHE_INVALIDATION__ === 'object') {
        return window.__ISMS_CACHE_INVALIDATION__;
      }
      if (typeof window.createCacheInvalidationModule === 'function') {
        window.__ISMS_CACHE_INVALIDATION__ = window.createCacheInvalidationModule();
        return window.__ISMS_CACHE_INVALIDATION__;
      }
      return null;
    }
    function notifyCacheInvalidation(scope, reason, user) {
      const moduleApi = getCacheInvalidationModule();
      if (!moduleApi || typeof moduleApi.dispatch !== 'function') return;
      moduleApi.dispatch(scope || 'access-profile', reason || 'session-updated', {
        username: user && user.username ? String(user.username) : '',
        role: user && user.role ? String(user.role) : '',
        activeUnit: user && user.activeUnit ? String(user.activeUnit) : ''
      });
    }

    function clearAuthSessionStorage(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const previousUser = opts.previousUser || readAuthSession();
      writeAuthStorage(sessionStorage, null);
      writeAuthStorage(localStorage, null);
      try {
        sessionStorage.removeItem('__AUTH_VERIFY_CACHE__');
      } catch (_) { }
      authSessionCacheKey = '';
      authSessionCacheValue = null;
      currentUserCacheKey = '';
      currentUserCacheValue = null;
      if (opts.notify) {
        queueSessionNotification(opts.reason || 'session-cleared', previousUser);
      }
    }

    function queueLoginLog(username, user, success) {
      if (typeof window !== 'undefined' && typeof window.queueMicrotask === 'function') {
        window.queueMicrotask(function () {
          try {
            addLoginLog(username, user, success);
          } catch (_) {}
        });
        return;
      }
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(function () {
          try {
            addLoginLog(username, user, success);
          } catch (_) {}
        }, 0);
        return;
      }
      try {
        addLoginLog(username, user, success);
      } catch (_) {}
    }

    function queueSessionNotification(reason, user) {
      const task = function () {
        try {
          notifyAccessProfileChanged(reason, user);
          notifyCacheInvalidation('access-profile', reason, user);
        } catch (_) {}
      };
      if (typeof window !== 'undefined' && typeof window.queueMicrotask === 'function') {
        window.queueMicrotask(task);
        return;
      }
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(task, 0);
        return;
      }
      task();
    }

    function writeAuthSession(user, options) {
      const opts = options && typeof options === 'object' ? options : {};
      const normalized = user ? normalizeUserRecord(user) : null;
      if (!normalized) {
        clearAuthSessionStorage({
          notify: !!opts.notify,
          reason: opts.reason || 'session-cleared',
          previousUser: opts.previousUser || null
        });
        return null;
      }
      writeAuthStorage(sessionStorage, normalized);
      writeAuthStorage(localStorage, normalized);
      authSessionCacheKey = '';
      authSessionCacheValue = null;
      currentUserCacheKey = '';
      currentUserCacheValue = null;
      if (opts.notify) {
        queueSessionNotification(opts.reason || 'session-updated', normalized);
      }
      return normalized;
    }

    function readAuthSession() {
      const localRaw = readAuthStorageRaw(localStorage);
      const sessionRaw = readAuthStorageRaw(sessionStorage);
      const cacheKey = localRaw + '||' + sessionRaw;
      if (cacheKey === authSessionCacheKey) {
        return authSessionCacheValue ? { ...authSessionCacheValue } : null;
      }
      const parseJson = function (raw) {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (_) { return null; }
      };
      const localParsed = parseJson(localRaw);
      const sessionParsed = parseJson(sessionRaw);

      // Choose the fresher session between localStorage and sessionStorage.
      // Previously preferred localStorage, but if admin updates own unit via
      // 帳號管理, sessionStorage gets the new value while localStorage stays
      // stale, causing currentUser() to return empty primaryUnit inconsistently.
      // Pick by updatedAt timestamp; fall back to whichever exists.
      let chosen = null;
      if (localParsed && sessionParsed) {
        const sameUser = String(localParsed.username || '') === String(sessionParsed.username || '')
          && String(localParsed.sessionToken || '') === String(sessionParsed.sessionToken || '');
        if (sameUser) {
          const localTs = Date.parse(String(localParsed.updatedAt || '')) || 0;
          const sessionTs = Date.parse(String(sessionParsed.updatedAt || '')) || 0;
          chosen = sessionTs > localTs ? sessionParsed : localParsed;
          // If sessionStorage is newer, backfill localStorage so subsequent
          // tabs/reloads get the up-to-date record.
          if (sessionTs > localTs) {
            try { localStorage.setItem(AUTH_KEY, JSON.stringify(sessionParsed)); } catch (_) {}
          }
        } else {
          // Different users — prefer localStorage (persistent across tabs)
          chosen = localParsed;
        }
      } else {
        chosen = localParsed || sessionParsed;
      }

      authSessionCacheKey = cacheKey;
      authSessionCacheValue = chosen ? { ...chosen } : null;
      return chosen ? { ...chosen } : null;
    }

    async function verifyLocalPassword(user, password) {
      const passwordHash = String(user && user.passwordHash || '').trim();
      if (passwordHash) {
        return passwordHash === await hashLocalPassword(password);
      }
      const legacyPassword = String(user && user.password || '');
      if (!legacyPassword) return false;
      const ok = legacyPassword === String(password || '');
      if (ok && user && user.username) {
        updateUser(user.username, {
          password: '',
          passwordHash: await hashLocalPassword(password)
        });
      }
      return ok;
    }

    function getUserStoreTouchToken() {
      if (typeof getStoreTouchToken === 'function') {
        try {
          return String(getStoreTouchToken(AUTH_KEY) || '0');
        } catch (_) {
          return '0';
        }
      }
      return '0';
    }

    function getLocalUsersStoreTouchToken() {
      if (typeof getStoreTouchToken === 'function') {
        try {
          return String(getStoreTouchToken(DATA_KEY) || '0');
        } catch (_) {
          return '0';
        }
      }
      return '0';
    }

    function installAuthCacheInvalidation() {
      if (authCacheListenerInstalled || typeof window === 'undefined' || !window.addEventListener) return;
      window.addEventListener('storage', function (event) {
        if (!event || event.key === AUTH_KEY || event.key === null) {
          authSessionCacheKey = '';
          authSessionCacheValue = null;
          currentUserCacheKey = '';
          currentUserCacheValue = null;
        }
      });
      authCacheListenerInstalled = true;
    }

    function syncSessionUnit(sourceUnit, targetUnit) {
      const auth = readAuthSession();
      if (!auth || auth.unit !== sourceUnit) return;
      const next = {
        ...auth,
        unit: targetUnit,
        activeUnit: auth.activeUnit === sourceUnit ? targetUnit : auth.activeUnit
      };
      writeAuthSession(next);
    }

    function currentUser() {
      installAuthCacheInvalidation();
      const user = readAuthSession();
      if (!user) return null;
      const cacheKey = authSessionCacheKey + '::' + getUserStoreTouchToken(DATA_KEY);
      if (cacheKey === currentUserCacheKey) {
        return currentUserCacheValue ? { ...currentUserCacheValue } : null;
      }
      const expiresAt = String(user.sessionExpiresAt || '').trim();
      if (expiresAt) {
        const expiresAtMs = Date.parse(expiresAt);
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
          clearAuthSessionStorage();
          if (!window.__ismsSessionExpiredWarned) {
            window.__ismsSessionExpiredWarned = true;
            setTimeout(function () {
              var tc = document.getElementById('toast-container');
              if (tc) {
                var toast = document.createElement('div');
                toast.className = 'toast toast-error';
                toast.setAttribute('role', 'alert');
                toast.textContent = '登入已逾時，頁面將自動跳轉至登入畫面。';
                tc.appendChild(toast);
                setTimeout(function () { try { tc.removeChild(toast); } catch (_) {} }, 4000);
              }
              setTimeout(function () { window.location.hash = '#'; window.location.reload(); }, 2000);
            }, 100);
          }
          return null;
        }
      }
      const normalized = normalizeUserRecord(user);
      const canonical = normalized.username ? findUser(normalized.username) : null;
      let resolved = normalized;
      if (canonical) {
        const merged = normalizeUserRecord({
          ...canonical,
          ...normalized,
          ...(normalized.username === 'admin' ? { name: PRIMARY_ADMIN_NAME, role: ROLES.ADMIN } : {}),
          activeUnit: normalized.activeUnit || canonical.activeUnit || ''
        });
        if (
          merged.username !== normalized.username ||
          merged.name !== normalized.name ||
          merged.role !== normalized.role ||
          merged.activeUnit !== normalized.activeUnit ||
          String(merged.sessionToken || '') !== String(normalized.sessionToken || '') ||
          String(merged.sessionExpiresAt || '') !== String(normalized.sessionExpiresAt || '') ||
          Boolean(merged.mustChangePassword) !== Boolean(normalized.mustChangePassword)
        ) {
          writeAuthSession(merged);
          resolved = merged;
        }
      }
      if (normalized.username === 'admin' && normalized.name !== PRIMARY_ADMIN_NAME) {
        const repaired = normalizeUserRecord({ ...normalized, name: PRIMARY_ADMIN_NAME, role: ROLES.ADMIN, activeUnit: '' });
        writeAuthSession(repaired);
        resolved = repaired;
      }
      currentUserCacheKey = cacheKey;
      currentUserCacheValue = resolved ? { ...resolved } : null;
      return resolved ? { ...resolved } : null;
    }

    function generatePassword() {
      return createSecurePassword();
    }

    async function login(username, password, options) {
      const cleanUsername = String(username || '').trim();
      const cleanPassword = String(password || '');
      const opts = options && typeof options === 'object' ? options : {};
      if (typeof loginWithBackend === 'function' && !opts.preferLocalLogin) {
        try {
          const remoteUser = await loginWithBackend(cleanUsername, cleanPassword);
          const success = !!remoteUser;
          if (!success) {
            queueLoginLog(cleanUsername, null, false);
            return null;
          }
          const session = writeAuthSession(remoteUser, { notify: true, reason: 'login' });
          queueLoginLog(cleanUsername, remoteUser, true);
          return session;
        } catch (error) {
          // Infrastructure errors (e.g. "未設定 authEndpoint") → fall through to local login.
          // Actual authentication failures (4xx) should still throw.
          var msg = (error && (error.message || '')) || '';
          var isInfraError = /未設定|authEndpoint|network|ECONNREFUSED|fetch failed|Failed to fetch/i.test(msg);
          if (!isInfraError) {
            queueLoginLog(cleanUsername, null, false);
            throw error;
          }
          if (typeof window !== 'undefined' && window.__ismsWarn) {
            window.__ismsWarn('login backend unavailable, falling back to local', error);
          }
        }
      }

      const user = findUser(cleanUsername);
      const success = !!(user && await verifyLocalPassword(user, cleanPassword));
      if (!success) {
        queueLoginLog(cleanUsername, user, false);
        return null;
      }
      const session = writeAuthSession(user, { notify: true, reason: 'login' });
      queueLoginLog(cleanUsername, user, true);
      return session;
    }

    async function logout() {
      const auth = readAuthSession();
      if (typeof logoutWithBackend === 'function' && auth && auth.sessionToken) {
        try {
          await logoutWithBackend({
            username: auth.username,
            sessionToken: auth.sessionToken
          });
        } catch (_) {
          // Ignore remote logout failures and still clear local session.
        }
      }
      clearAuthSessionStorage({ notify: true, reason: 'logout', previousUser: auth });
    }

    function canSwitchAuthorizedUnit(user = currentUser()) {
      return !!user && user.role !== ROLES.ADMIN && getAuthorizedUnits(user).length > 1;
    }

    function getScopedUnit(user = currentUser()) {
      if (!user) return '';
      if (user.role === ROLES.ADMIN) return '';
      return getActiveUnit(user);
    }

    function switchCurrentUserUnit(unit) {
      const user = currentUser();
      if (!user) return false;
      const target = String(unit || '').trim();
      if (!getAuthorizedUnits(user).includes(target)) return false;
      writeAuthSession({ ...user, activeUnit: target }, { notify: true, reason: 'active-unit-switched' });
      return true;
    }

    function ensurePrimaryAdminProfile() {
      const data = loadData();
      if (!data || !Array.isArray(data.users)) return;

      let changed = false;
      let admin = data.users.find(function (user) { return user.username === 'admin'; });
      if (!admin) return;
      if (admin.role !== ROLES.ADMIN) {
        admin.role = ROLES.ADMIN;
        changed = true;
      }
      if (admin.name !== PRIMARY_ADMIN_NAME) {
        admin.name = PRIMARY_ADMIN_NAME;
        changed = true;
      }

      if (changed) saveData(data);

      const auth = readAuthSession();
      if (auth && auth.username === 'admin') {
        writeAuthSession({ ...auth, role: ROLES.ADMIN, name: PRIMARY_ADMIN_NAME });
      }
    }

    function hasLocalUsers() {
      const cacheKey = getLocalUsersStoreTouchToken();
      if (cacheKey === localUsersCacheKey) {
        return !!localUsersCacheValue;
      }
      const data = loadData();
      const hasUsers = !!(data && Array.isArray(data.users) && data.users.length);
      localUsersCacheKey = cacheKey;
      localUsersCacheValue = hasUsers;
      return hasUsers;
    }

    async function bootstrapLocalAdminAccount(input) {
      const payload = input && typeof input === 'object' ? input : {};
      const username = String(payload.username || '').trim();
      const password = String(payload.password || '');
      const name = String(payload.name || PRIMARY_ADMIN_NAME).trim() || PRIMARY_ADMIN_NAME;
      const email = String(payload.email || '').trim().toLowerCase();
      if (!username) throw new Error('請輸入帳號');
      if (!email) throw new Error('請輸入電子郵件');
      validateLocalPasswordComplexity(password);
      if (findUser(username)) throw new Error('此帳號已存在');
      if (findUserByEmail(email)) throw new Error('此電子郵件已被使用');
      const data = loadData();
      if (!data || !Array.isArray(data.users)) throw new Error('本機帳號資料初始化失敗');
      const created = normalizeUserRecord({
        username: username,
        password: '',
        passwordHash: await hashLocalPassword(password),
        name: name,
        role: ROLES.ADMIN,
        unit: '',
        units: [],
        email: email,
        mustChangePassword: true
      });
      data.users.unshift(created);
      saveData(data);
      return created;
    }

    async function resetPasswordByEmail(input) {
      const payload = input && typeof input === 'object' ? input : { email: input };
      if (typeof resetPasswordWithBackend === 'function') {
        return resetPasswordWithBackend(payload);
      }
      const user = findUserByEmail(payload.email);
      if (!user) return null;
      const nextPassword = generatePassword();
      updateUser(user.username, {
        password: '',
        passwordHash: await hashLocalPassword(nextPassword),
        mustChangePassword: true
      });
      return {
        user: normalizeUserRecord(user),
        password: nextPassword,
        source: 'local'
      };
    }

    async function redeemResetPassword(payload) {
      const input = payload && typeof payload === 'object' ? payload : {};
      if (typeof redeemResetPasswordWithBackend === 'function') {
        const user = await redeemResetPasswordWithBackend(input);
        return user ? writeAuthSession(user, { notify: true, reason: 'password-reset-redeemed' }) : null;
      }
      const matched = findUser(input.username);
      if (!matched || String(input.token || '').trim() !== 'LOCAL-RESET') return null;
      validateLocalPasswordComplexity(input.newPassword);
      updateUser(matched.username, {
        password: '',
        passwordHash: await hashLocalPassword(String(input.newPassword || '').trim()),
        mustChangePassword: false
      });
      return writeAuthSession({ ...matched, password: '', passwordHash: '', mustChangePassword: false }, { notify: true, reason: 'password-reset-redeemed' });
    }

    async function changePassword(payload) {
      const input = payload && typeof payload === 'object' ? payload : {};
      const newPw = String(input.newPassword || '').trim();
      validateLocalPasswordComplexity(newPw);
      if (typeof changePasswordWithBackend === 'function') {
        try {
          const auth = currentUser();
          const user = await changePasswordWithBackend({
            ...input,
            sessionToken: auth && auth.sessionToken
          });
          return user ? writeAuthSession(user, { notify: true, reason: 'password-changed' }) : null;
        } catch (backendError) {
          // Fall through to local password change if backend is unavailable
          if (typeof window !== 'undefined' && window.__ismsWarn) {
            window.__ismsWarn('changePassword backend failed, falling back to local', backendError);
          }
        }
      }
      const matched = findUser(input.username);
      if (!matched || !(await verifyLocalPassword(matched, String(input.currentPassword || '')))) return null;
      updateUser(matched.username, {
        password: '',
        passwordHash: await hashLocalPassword(newPw),
        mustChangePassword: false
      });
      return writeAuthSession({ ...matched, password: '', passwordHash: '', mustChangePassword: false }, { notify: true, reason: 'password-changed' });
    }

    return {
      syncSessionUnit,
      currentUser,
      generatePassword,
      login,
      logout,
      canSwitchAuthorizedUnit,
      getScopedUnit,
      switchCurrentUserUnit,
      ensurePrimaryAdminProfile,
      hasLocalUsers,
      bootstrapLocalAdminAccount,
      resetPasswordByEmail,
      redeemResetPassword,
      changePassword
    };
  };
})();
