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
    let authCacheListenerInstalled = false;

    function validateLocalPasswordComplexity(password) {
      const value = String(password || '');
      if (value.length < 8) throw new Error('密碼至少需 8 碼');
      if (!/[a-z]/.test(value)) throw new Error('密碼至少需包含一個英文小寫字母');
      if (!/[A-Z]/.test(value)) throw new Error('密碼至少需包含一個英文大寫字母');
      if (!/[0-9]/.test(value)) throw new Error('密碼至少需包含一個數字');
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
      const all = upper + lower + digits;
      const randomChar = function (charset) {
        const bytes = new Uint32Array(1);
        window.crypto.getRandomValues(bytes);
        return charset[bytes[0] % charset.length];
      };
      const chars = [randomChar(upper), randomChar(lower), randomChar(digits)];
      while (chars.length < 10) chars.push(randomChar(all));
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
        notifyAccessProfileChanged(opts.reason || 'session-cleared', previousUser);
        notifyCacheInvalidation('access-profile', opts.reason || 'session-cleared', previousUser);
      }
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
        notifyAccessProfileChanged(opts.reason || 'session-updated', normalized);
        notifyCacheInvalidation('access-profile', opts.reason || 'session-updated', normalized);
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
      const parsed = localRaw ? (() => { try { return JSON.parse(localRaw); } catch (_) { return null; } })() : null;
      const fallback = parsed || (sessionRaw ? (() => { try { return JSON.parse(sessionRaw); } catch (_) { return null; } })() : null);
      authSessionCacheKey = cacheKey;
      authSessionCacheValue = fallback ? { ...fallback } : null;
      return fallback ? { ...fallback } : null;
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

    async function login(username, password) {
      const cleanUsername = String(username || '').trim();
      const cleanPassword = String(password || '');
      if (typeof loginWithBackend === 'function') {
        try {
          const remoteUser = await loginWithBackend(cleanUsername, cleanPassword);
          const success = !!remoteUser;
          addLoginLog(cleanUsername, remoteUser, success);
          if (!success) return null;
          return writeAuthSession(remoteUser, { notify: true, reason: 'login' });
        } catch (error) {
          addLoginLog(cleanUsername, null, false);
          throw error;
        }
      }

      const user = findUser(cleanUsername);
      const success = !!(user && await verifyLocalPassword(user, cleanPassword));
      addLoginLog(cleanUsername, user, success);
      if (!success) return null;
      return writeAuthSession(user, { notify: true, reason: 'login' });
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
      const data = loadData();
      return !!(data && Array.isArray(data.users) && data.users.length);
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
        const auth = currentUser();
        const user = await changePasswordWithBackend({
          ...input,
          sessionToken: auth && auth.sessionToken
        });
        return user ? writeAuthSession(user, { notify: true, reason: 'password-changed' }) : null;
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
