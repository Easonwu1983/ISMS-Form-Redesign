(function () {
  window.createAuthModule = function createAuthModule(deps) {
    const {
      AUTH_KEY,
      ROLES,
      DEFAULT_USERS,
      loadData,
      saveData,
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

    function readAuthSession() {
      try {
        const raw = sessionStorage.getItem(AUTH_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (_) {
        return null;
      }
    }

    function writeAuthSession(user) {
      const normalized = user ? normalizeUserRecord(user) : null;
      if (!normalized) {
        sessionStorage.removeItem(AUTH_KEY);
        return null;
      }
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(normalized));
      return normalized;
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
      const user = readAuthSession();
      if (!user) return null;
      const expiresAt = String(user.sessionExpiresAt || '').trim();
      if (expiresAt) {
        const expiresAtMs = Date.parse(expiresAt);
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
          sessionStorage.removeItem(AUTH_KEY);
          return null;
        }
      }
      const normalized = normalizeUserRecord(user);
      const canonical = normalized.username ? findUser(normalized.username) : null;
      if (canonical) {
        const merged = normalizeUserRecord({
          ...canonical,
          ...normalized,
          ...(normalized.username === 'admin' ? { name: PRIMARY_ADMIN_NAME, role: ROLES.ADMIN } : {}),
          activeUnit: normalized.activeUnit || canonical.activeUnit || ''
        });
        if (JSON.stringify(merged) !== JSON.stringify(normalized)) writeAuthSession(merged);
        return merged;
      }
      if (normalized.username === 'admin' && normalized.name !== PRIMARY_ADMIN_NAME) {
        const repaired = normalizeUserRecord({ ...normalized, name: PRIMARY_ADMIN_NAME, role: ROLES.ADMIN, activeUnit: '' });
        writeAuthSession(repaired);
        return repaired;
      }
      return normalized;
    }

    function generatePassword() {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let password = '';
      for (let index = 0; index < 8; index += 1) {
        password += chars[Math.floor(Math.random() * chars.length)];
      }
      return password;
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
          return writeAuthSession(remoteUser);
        } catch (error) {
          addLoginLog(cleanUsername, null, false);
          throw error;
        }
      }

      const user = findUser(cleanUsername);
      const success = !!(user && user.password === cleanPassword);
      addLoginLog(cleanUsername, user, success);
      if (!success) return null;
      return writeAuthSession(user);
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
      sessionStorage.removeItem(AUTH_KEY);
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
      writeAuthSession({ ...user, activeUnit: target });
      return true;
    }

    function ensurePrimaryAdminProfile() {
      const data = loadData();
      if (!data || !Array.isArray(data.users)) return;

      let changed = false;
      let admin = data.users.find((user) => user.username === 'admin');
      if (!admin) {
        const defaultAdmin = DEFAULT_USERS.find((user) => user.username === 'admin');
        if (defaultAdmin) {
          admin = { ...defaultAdmin };
          data.users.unshift(admin);
          changed = true;
        }
      }

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

    async function resetPasswordByEmail(input) {
      const payload = input && typeof input === 'object' ? input : { email: input };
      if (typeof resetPasswordWithBackend === 'function') {
        return resetPasswordWithBackend(payload);
      }
      const user = findUserByEmail(payload.email);
      if (!user) return null;
      const nextPassword = generatePassword();
      updateUser(user.username, { password: nextPassword, mustChangePassword: true });
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
        return user ? writeAuthSession(user) : null;
      }
      const matched = findUser(input.username);
      if (!matched || String(input.token || '').trim() !== 'LOCAL-RESET') return null;
      updateUser(matched.username, { password: String(input.newPassword || '').trim(), mustChangePassword: false });
      return writeAuthSession({ ...matched, password: '', mustChangePassword: false });
    }

    async function changePassword(payload) {
      const input = payload && typeof payload === 'object' ? payload : {};
      const newPw = String(input.newPassword || '').trim();
      if (newPw.length < 8) {
        throw new Error('密碼至少需 8 碼');
      }
      if (typeof changePasswordWithBackend === 'function') {
        const user = await changePasswordWithBackend({
          ...input,
          sessionToken: currentUser() && currentUser().sessionToken
        });
        return user ? writeAuthSession(user) : null;
      }
      const matched = findUser(input.username);
      if (!matched || String(matched.password || '') !== String(input.currentPassword || '')) return null;
      updateUser(matched.username, { password: newPw, mustChangePassword: false });
      return writeAuthSession({ ...matched, password: '', mustChangePassword: false });
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
      resetPasswordByEmail,
      redeemResetPassword,
      changePassword
    };
  };
})();
