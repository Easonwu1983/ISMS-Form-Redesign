const crypto = require('crypto');

const PASSWORD_SCHEME = 'scrypt-v1';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RESET_TTL_MS = 15 * 60 * 1000;
const SECRET_PREFIX = 'ps1';

function cleanText(value) {
  return String(value || '').trim();
}

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input + padding, 'base64').toString('utf8');
}

function stableEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashWithSalt(password, salt) {
  return base64UrlEncode(crypto.scryptSync(String(password || ''), String(salt || ''), 64));
}

function sha256(value) {
  return base64UrlEncode(crypto.createHash('sha256').update(String(value || ''), 'utf8').digest());
}

function toCompactTimestamp(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms.toString(36) : '';
}

function fromCompactTimestamp(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  const ms = Number.parseInt(raw, 36);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function parsePasswordSecret(rawValue) {
  const raw = cleanText(rawValue);
  if (!raw) {
    return {
      raw: '',
      hasPassword: false,
      legacy: false,
      scheme: '',
      salt: '',
      hash: '',
      plaintext: '',
      mustChangePassword: false,
      passwordChangedAt: '',
      resetTokenHash: '',
      resetTokenExpiresAt: '',
      resetRequestedAt: '',
      sessionVersion: 1
    };
  }
  if (raw.startsWith(SECRET_PREFIX + '|')) {
    const parts = raw.split('|');
    return {
      raw,
      hasPassword: true,
      legacy: false,
      scheme: PASSWORD_SCHEME,
      salt: cleanText(parts[1]),
      hash: cleanText(parts[2]),
      plaintext: '',
      mustChangePassword: cleanText(parts[3]) === '1',
      passwordChangedAt: fromCompactTimestamp(parts[4]),
      resetTokenHash: cleanText(parts[5]),
      resetTokenExpiresAt: fromCompactTimestamp(parts[6]),
      resetRequestedAt: fromCompactTimestamp(parts[7]),
      sessionVersion: Number.isFinite(Number(parts[8])) ? Number(parts[8]) : 1
    };
  }
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      return {
        raw,
        hasPassword: !!cleanText(parsed.hash || parsed.plaintext || raw),
        legacy: cleanText(parsed.scheme) === 'legacy-plain',
        scheme: cleanText(parsed.scheme || ''),
        salt: cleanText(parsed.salt || ''),
        hash: cleanText(parsed.hash || ''),
        plaintext: cleanText(parsed.plaintext || ''),
        mustChangePassword: parsed.mustChangePassword === true,
        passwordChangedAt: cleanText(parsed.passwordChangedAt || ''),
        resetTokenHash: cleanText(parsed.resetTokenHash || ''),
        resetTokenExpiresAt: cleanText(parsed.resetTokenExpiresAt || ''),
        resetRequestedAt: cleanText(parsed.resetRequestedAt || ''),
        sessionVersion: Number.isFinite(Number(parsed.sessionVersion)) ? Number(parsed.sessionVersion) : 1
      };
    } catch (_) {
      // fall through
    }
  }
  return {
    raw,
    hasPassword: true,
    legacy: true,
    scheme: 'legacy-plain',
    salt: '',
    hash: '',
    plaintext: raw,
    mustChangePassword: false,
    passwordChangedAt: '',
    resetTokenHash: '',
    resetTokenExpiresAt: '',
    resetRequestedAt: '',
    sessionVersion: 1
  };
}

function serializePasswordSecret(secret) {
  return [
    SECRET_PREFIX,
    cleanText(secret.salt),
    cleanText(secret.hash),
    secret.mustChangePassword === true ? '1' : '0',
    toCompactTimestamp(secret.passwordChangedAt),
    cleanText(secret.resetTokenHash),
    toCompactTimestamp(secret.resetTokenExpiresAt),
    toCompactTimestamp(secret.resetRequestedAt),
    Number.isFinite(Number(secret.sessionVersion)) ? String(Number(secret.sessionVersion)) : '1'
  ].join('|');
}

function createPasswordSecret(password, options) {
  const opts = options || {};
  const salt = base64UrlEncode(crypto.randomBytes(16));
  return {
    scheme: PASSWORD_SCHEME,
    salt,
    hash: hashWithSalt(password, salt),
    mustChangePassword: opts.mustChangePassword === true,
    passwordChangedAt: cleanText(opts.passwordChangedAt) || new Date().toISOString(),
    resetTokenHash: '',
    resetTokenExpiresAt: '',
    resetRequestedAt: '',
    sessionVersion: Number.isFinite(Number(opts.sessionVersion)) ? Number(opts.sessionVersion) : 1
  };
}

function verifyPassword(password, rawSecret) {
  const secret = parsePasswordSecret(rawSecret);
  if (!secret.hasPassword) return { ok: false, secret, needsUpgrade: false };
  if (secret.legacy) {
    return {
      ok: stableEqual(secret.plaintext || secret.raw, password),
      secret,
      needsUpgrade: true
    };
  }
  if (secret.scheme !== PASSWORD_SCHEME || !secret.salt || !secret.hash) {
    return { ok: false, secret, needsUpgrade: false };
  }
  return {
    ok: stableEqual(secret.hash, hashWithSalt(password, secret.salt)),
    secret,
    needsUpgrade: false
  };
}

function upgradePasswordSecret(password, secret) {
  const base = parsePasswordSecret(secret && secret.raw ? secret.raw : secret);
  return createPasswordSecret(password, {
    mustChangePassword: base.mustChangePassword,
    sessionVersion: base.sessionVersion
  });
}

function createResetToken(rawSecret, options) {
  const base = parsePasswordSecret(rawSecret);
  const now = cleanText(options && options.now) || new Date().toISOString();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  const token = base64UrlEncode(crypto.randomBytes(24));
  return {
    token,
    expiresAt,
    secret: {
      scheme: base.legacy ? PASSWORD_SCHEME : (base.scheme || PASSWORD_SCHEME),
      salt: cleanText(base.salt),
      hash: cleanText(base.hash),
      mustChangePassword: true,
      passwordChangedAt: cleanText(base.passwordChangedAt),
      resetTokenHash: sha256(token),
      resetTokenExpiresAt: expiresAt,
      resetRequestedAt: now,
      sessionVersion: Number.isFinite(Number(base.sessionVersion)) ? Number(base.sessionVersion) : 1
    }
  };
}

function verifyResetToken(token, rawSecret) {
  const secret = parsePasswordSecret(rawSecret);
  const expiresAt = cleanText(secret.resetTokenExpiresAt);
  if (!secret.resetTokenHash || !expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return false;
  return stableEqual(secret.resetTokenHash, sha256(token));
}

function clearResetState(rawSecret) {
  const secret = parsePasswordSecret(rawSecret);
  return {
    scheme: secret.legacy ? PASSWORD_SCHEME : (secret.scheme || PASSWORD_SCHEME),
    salt: cleanText(secret.salt),
    hash: cleanText(secret.hash),
    mustChangePassword: secret.mustChangePassword === true,
    passwordChangedAt: cleanText(secret.passwordChangedAt),
    resetTokenHash: '',
    resetTokenExpiresAt: '',
    resetRequestedAt: '',
    sessionVersion: Number.isFinite(Number(secret.sessionVersion)) ? Number(secret.sessionVersion) : 1
  };
}

function changePassword(rawSecret, newPassword, options) {
  const base = parsePasswordSecret(rawSecret);
  return createPasswordSecret(newPassword, {
    mustChangePassword: options && options.mustChangePassword === true,
    sessionVersion: (Number.isFinite(Number(base.sessionVersion)) ? Number(base.sessionVersion) : 1) + 1,
    passwordChangedAt: cleanText(options && options.passwordChangedAt) || new Date().toISOString()
  });
}

function invalidateSessions(rawSecret, options) {
  const base = parsePasswordSecret(rawSecret);
  const nextSessionVersion = (Number.isFinite(Number(base.sessionVersion)) ? Number(base.sessionVersion) : 1) + 1;
  const now = cleanText(options && options.updatedAt) || new Date().toISOString();
  if (base.legacy) {
    return createPasswordSecret(base.plaintext || base.raw, {
      mustChangePassword: base.mustChangePassword === true,
      sessionVersion: nextSessionVersion,
      passwordChangedAt: cleanText(base.passwordChangedAt) || now
    });
  }
  return {
    scheme: base.scheme || PASSWORD_SCHEME,
    salt: cleanText(base.salt),
    hash: cleanText(base.hash),
    mustChangePassword: base.mustChangePassword === true,
    passwordChangedAt: cleanText(base.passwordChangedAt) || now,
    resetTokenHash: '',
    resetTokenExpiresAt: '',
    resetRequestedAt: '',
    sessionVersion: nextSessionVersion
  };
}

function createSessionToken(user, secret, options) {
  const opts = options || {};
  const now = Date.now();
  const expiresAtMs = now + (Number.isFinite(Number(opts.ttlMs)) ? Number(opts.ttlMs) : SESSION_TTL_MS);
  const payload = {
    sub: cleanText(user && user.username),
    role: cleanText(user && user.role),
    sessionVersion: Number.isFinite(Number(opts.sessionVersion)) ? Number(opts.sessionVersion) : 1,
    iat: new Date(now).toISOString(),
    exp: new Date(expiresAtMs).toISOString()
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(crypto.createHmac('sha256', String(secret || '')).update(encodedPayload).digest());
  return {
    token: encodedPayload + '.' + signature,
    expiresAt: payload.exp,
    payload
  };
}

function verifySessionToken(token, secret) {
  const raw = cleanText(token);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const expectedSignature = base64UrlEncode(crypto.createHmac('sha256', String(secret || '')).update(parts[0]).digest());
  if (!stableEqual(expectedSignature, parts[1])) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    const expMs = Date.parse(payload.exp || '');
    if (!Number.isFinite(expMs) || expMs < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = {
  SESSION_TTL_MS,
  RESET_TTL_MS,
  cleanText,
  parsePasswordSecret,
  serializePasswordSecret,
  createPasswordSecret,
  verifyPassword,
  upgradePasswordSecret,
  createResetToken,
  verifyResetToken,
  clearResetState,
  changePassword,
  invalidateSessions,
  createSessionToken,
  verifySessionToken
};
