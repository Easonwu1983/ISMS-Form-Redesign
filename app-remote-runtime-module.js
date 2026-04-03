// @ts-check
(function () {
  window.createAppRemoteRuntimeModule = function createAppRemoteRuntimeModule() {
    function createAccess(deps) {
      const settings = deps && typeof deps === 'object' ? deps : {};

      function getRuntimeM365Config() {
        const raw = (typeof window !== 'undefined' && window.__M365_UNIT_CONTACT_CONFIG__) || {};
        const sameOriginUrl = function (value) {
          const rawValue = String(value || '').trim();
          if (!rawValue) return '';
          if (/^#/.test(rawValue)) return rawValue;
          if (/^\//.test(rawValue)) return rawValue.replace(/\/$/, '');
          try {
            const resolved = new URL(rawValue, window.location.href);
            if (resolved.origin === window.location.origin) {
              return `${resolved.pathname.replace(/\/$/, '')}${resolved.search}${resolved.hash}`;
            }
          } catch (_) {}
          return '';
        };
        const sharedHeaders = function (value) {
          if (!value || typeof value !== 'object') return {};
          return Object.entries(value).reduce(function (result, entry) {
            const key = String(entry[0] || '').trim();
            const headerValue = String(entry[1] || '').trim();
            if (!/^x-isms-/i.test(key) || !headerValue) return result;
            result[key] = headerValue;
            return result;
          }, {});
        };
        return {
          ...raw,
          systemUsersEndpoint: sameOriginUrl(raw.systemUsersEndpoint),
          systemUsersHealthEndpoint: sameOriginUrl(raw.systemUsersHealthEndpoint),
          systemUsersSharedHeaders: sharedHeaders(raw.systemUsersSharedHeaders),
          reviewScopesEndpoint: sameOriginUrl(raw.reviewScopesEndpoint),
          reviewScopesHealthEndpoint: sameOriginUrl(raw.reviewScopesHealthEndpoint),
          reviewScopesSharedHeaders: sharedHeaders(raw.reviewScopesSharedHeaders),
          auditTrailEndpoint: sameOriginUrl(raw.auditTrailEndpoint),
          auditTrailHealthEndpoint: sameOriginUrl(raw.auditTrailHealthEndpoint),
          auditTrailSharedHeaders: sharedHeaders(raw.auditTrailSharedHeaders),
          authEndpoint: sameOriginUrl(raw.authEndpoint),
          authHealthEndpoint: sameOriginUrl(raw.authHealthEndpoint),
          authSharedHeaders: sharedHeaders(raw.authSharedHeaders),
          attachmentsEndpoint: sameOriginUrl(raw.attachmentsEndpoint),
          attachmentsHealthEndpoint: sameOriginUrl(raw.attachmentsHealthEndpoint),
          attachmentsSharedHeaders: sharedHeaders(raw.attachmentsSharedHeaders)
        };
      }

      function isStrictRemoteDataMode() {
        const config = getRuntimeM365Config();
        if (config.strictRemoteData === true) return true;
        return String(config.activeProfile || '').trim() === 'a3CampusBackend';
      }

      function buildStrictRemoteError(label, error) {
        const detail = String(error && error.message || error || '').trim();
        return detail ? (label + '失敗，正式模式已停用本機暫存：' + detail) : (label + '失敗，正式模式已停用本機暫存');
      }

      function getSystemUsersMode() {
        const config = getRuntimeM365Config();
        return String(config.systemUsersMode || '').trim() || 'local-emulator';
      }

      function getSystemUsersEndpoint() {
        return String(getRuntimeM365Config().systemUsersEndpoint || '').trim().replace(/\/$/, '');
      }

      function getSystemUsersHealthEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.systemUsersHealthEndpoint || '').trim();
        if (explicit) return explicit;
        const endpoint = getSystemUsersEndpoint();
        return endpoint ? endpoint + '/health' : '';
      }

      function getSystemUsersSharedHeaders() {
        const config = getRuntimeM365Config();
        return config.systemUsersSharedHeaders && typeof config.systemUsersSharedHeaders === 'object' ? config.systemUsersSharedHeaders : {};
      }

      function getReviewScopesMode() {
        const config = getRuntimeM365Config();
        const explicit = String(config.reviewScopesMode || '').trim();
        return explicit || (getSystemUsersMode() === 'm365-api' ? 'm365-api' : 'local-emulator');
      }

      function getReviewScopesEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.reviewScopesEndpoint || '').trim();
        if (explicit) return explicit.replace(/\/$/, '');
        return '';
      }

      function getReviewScopesHealthEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.reviewScopesHealthEndpoint || '').trim();
        if (explicit) return explicit;
        const endpoint = getReviewScopesEndpoint();
        return endpoint ? endpoint + '/health' : '';
      }

      function getReviewScopesSharedHeaders() {
        const config = getRuntimeM365Config();
        if (config.reviewScopesSharedHeaders && typeof config.reviewScopesSharedHeaders === 'object') return config.reviewScopesSharedHeaders;
        return getSystemUsersSharedHeaders();
      }

      function getAuditTrailMode() {
        const config = getRuntimeM365Config();
        const explicit = String(config.auditTrailMode || '').trim();
        return explicit || (getSystemUsersMode() === 'm365-api' ? 'm365-api' : 'local-emulator');
      }

      function getAuditTrailEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.auditTrailEndpoint || '').trim();
        if (explicit) return explicit.replace(/\/$/, '');
        const usersEndpoint = getSystemUsersEndpoint();
        return usersEndpoint ? usersEndpoint.replace(/\/system-users$/, '/audit-trail') : '';
      }

      function getAuditTrailHealthEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.auditTrailHealthEndpoint || '').trim();
        if (explicit) return explicit;
        const endpoint = getAuditTrailEndpoint();
        return endpoint ? endpoint + '/health' : '';
      }

      function getAuditTrailSharedHeaders() {
        const config = getRuntimeM365Config();
        if (config.auditTrailSharedHeaders && typeof config.auditTrailSharedHeaders === 'object') return config.auditTrailSharedHeaders;
        return getSystemUsersSharedHeaders();
      }

      function getAuthMode() {
        const config = getRuntimeM365Config();
        const explicit = String(config.authMode || '').trim();
        if (explicit) return explicit;
        return getSystemUsersMode() === 'm365-api' ? 'm365-api' : 'local-emulator';
      }

      function getAuthEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.authEndpoint || '').trim();
        if (explicit) return explicit.replace(/\/$/, '');
        const usersEndpoint = getSystemUsersEndpoint();
        return usersEndpoint ? usersEndpoint.replace(/\/system-users$/, '/auth') : '';
      }

      function getAuthHealthEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.authHealthEndpoint || '').trim();
        if (explicit) return explicit;
        const endpoint = getAuthEndpoint();
        return endpoint ? endpoint + '/health' : '';
      }

      function getAuthSharedHeaders() {
        const config = getRuntimeM365Config();
        if (config.authSharedHeaders && typeof config.authSharedHeaders === 'object') return config.authSharedHeaders;
        return getSystemUsersSharedHeaders();
      }

      function getAttachmentsMode() {
        const config = getRuntimeM365Config();
        const explicit = String(config.attachmentsMode || '').trim();
        return explicit || 'local-emulator';
      }

      function getAttachmentsEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.attachmentsEndpoint || '').trim();
        return explicit ? explicit.replace(/\/$/, '') : '';
      }

      function getAttachmentsHealthEndpoint() {
        const config = getRuntimeM365Config();
        const explicit = String(config.attachmentsHealthEndpoint || '').trim();
        if (explicit) return explicit;
        const endpoint = getAttachmentsEndpoint();
        return endpoint ? endpoint + '/health' : '';
      }

      function getAttachmentsSharedHeaders() {
        const config = getRuntimeM365Config();
        return config.attachmentsSharedHeaders && typeof config.attachmentsSharedHeaders === 'object' ? config.attachmentsSharedHeaders : {};
      }

      function normalizeRequestUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
          const resolved = new URL(raw, typeof window !== 'undefined' ? window.location.href : undefined);
          if (typeof window === 'undefined' || !window.location || resolved.origin === window.location.origin) {
            return resolved.toString();
          }
        } catch (_) {}
        return '';
      }

      async function hashLocalPasswordValue(password) {
        const cleanPassword = String(password || '');
        if (!window.crypto || !window.crypto.subtle || typeof window.crypto.subtle.digest !== 'function') {
          throw new Error('瀏覽器不支援本機密碼雜湊');
        }
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(cleanPassword));
        return Array.from(new Uint8Array(digest)).map(function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }

      async function verifyLocalPasswordValue(user, password) {
        const storedHash = String(user && user.passwordHash || '').trim();
        if (storedHash) {
          return storedHash === await hashLocalPasswordValue(password);
        }
        const legacyPassword = String(user && user.password || '').trim();
        if (!legacyPassword) return false;
        const ok = legacyPassword === String(password || '');
        if (ok && user && user.username && typeof settings.updateUser === 'function') {
          settings.updateUser(user.username, {
            password: '',
            passwordHash: await hashLocalPasswordValue(password)
          });
        }
        return ok;
      }

      return {
        getRuntimeM365Config,
        isStrictRemoteDataMode,
        buildStrictRemoteError,
        getSystemUsersMode,
        getSystemUsersEndpoint,
        getSystemUsersHealthEndpoint,
        getSystemUsersSharedHeaders,
        getReviewScopesMode,
        getReviewScopesEndpoint,
        getReviewScopesHealthEndpoint,
        getReviewScopesSharedHeaders,
        getAuditTrailMode,
        getAuditTrailEndpoint,
        getAuditTrailHealthEndpoint,
        getAuditTrailSharedHeaders,
        getAuthMode,
        getAuthEndpoint,
        getAuthHealthEndpoint,
        getAuthSharedHeaders,
        getAttachmentsMode,
        getAttachmentsEndpoint,
        getAttachmentsHealthEndpoint,
        getAttachmentsSharedHeaders,
        normalizeRequestUrl,
        hashLocalPasswordValue,
        verifyLocalPasswordValue
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
