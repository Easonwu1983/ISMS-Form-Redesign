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
      addLoginLog
    } = deps;

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
      return user ? normalizeUserRecord(user) : null;
    }

    function generatePassword() {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let password = '';
      for (let index = 0; index < 8; index += 1) {
        password += chars[Math.floor(Math.random() * chars.length)];
      }
      return password;
    }

    function login(username, password) {
      const user = findUser(username);
      const success = !!(user && user.password === password);
      addLoginLog(username, user, success);
      if (!success) return null;
      return writeAuthSession(user);
    }

    function logout() {
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
      if (admin.name !== '計算機及資訊網路中心') {
        admin.name = '計算機及資訊網路中心';
        changed = true;
      }

      if (changed) saveData(data);

      const auth = readAuthSession();
      if (auth && auth.username === 'admin') {
        writeAuthSession({ ...auth, role: ROLES.ADMIN, name: '計算機及資訊網路中心' });
      }
    }

    function resetPasswordByEmail(email) {
      const user = findUserByEmail(email);
      if (!user) return null;
      const nextPassword = generatePassword();
      updateUser(user.username, { password: nextPassword });
      return {
        user: normalizeUserRecord(user),
        password: nextPassword
      };
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
      resetPasswordByEmail
    };
  };
})();
