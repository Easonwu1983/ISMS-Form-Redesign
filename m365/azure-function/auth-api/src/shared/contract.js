const CONTRACT_VERSION = '2026-04-02';

const AUTH_ACTIONS = {
  LOGIN: 'auth.login',
  VERIFY: 'auth.verify',
  LOGOUT: 'auth.logout',
  REQUEST_RESET: 'auth.request-reset',
  REDEEM_RESET: 'auth.redeem-reset',
  CHANGE_PASSWORD: 'auth.change-password'
};

function cleanText(value) {
  return String(value || '').trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode || 400;
  return error;
}

function validateActionEnvelope(envelope, expectedAction) {
  if (!envelope || typeof envelope !== 'object') {
    throw createError('Invalid request envelope', 400);
  }
  const action = cleanText(envelope.action);
  if (!action) throw createError('Missing action', 400);
  if (expectedAction && action !== expectedAction) {
    throw createError('Action does not match endpoint', 400);
  }
}

function validateNextPassword(password, fieldName) {
  const label = cleanText(fieldName) || 'password';
  const value = cleanText(password);
  if (!value) throw createError('Missing ' + label, 400);
  if (value.length < 8) throw createError('Password must be at least 8 characters', 400);
  if (!/[a-z]/.test(value)) throw createError('Password must include at least one lowercase letter', 400);
  if (!/[A-Z]/.test(value)) throw createError('Password must include at least one uppercase letter', 400);
  if (!/[0-9]/.test(value)) throw createError('Password must include at least one number', 400);
}

function normalizeLoginPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    username: cleanText(base.username || base.userName || base.UserName),
    password: cleanText(base.password || base.Password)
  };
}

function validateLoginPayload(payload) {
  if (!cleanText(payload.username)) throw createError('Missing username', 400);
  if (!cleanText(payload.password)) throw createError('Missing password', 400);
}

function normalizeRequestResetPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    username: cleanText(base.username || base.userName || base.UserName),
    email: cleanEmail(base.email || base.Email),
    actorEmail: cleanEmail(base.actorEmail || base.ActorEmail),
    actorName: cleanText(base.actorName || base.ActorName)
  };
}

function validateRequestResetPayload(payload) {
  if (!cleanText(payload.username)) throw createError('Missing username', 400);
  if (!cleanEmail(payload.email)) throw createError('Missing email', 400);
}

function normalizeRedeemResetPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    username: cleanText(base.username || base.userName || base.UserName),
    token: cleanText(base.token || base.resetToken || base.ResetToken),
    newPassword: cleanText(base.newPassword || base.password || base.Password)
  };
}

function validateRedeemResetPayload(payload) {
  if (!cleanText(payload.username)) throw createError('Missing username', 400);
  if (!cleanText(payload.token)) throw createError('Missing reset token', 400);
  validateNextPassword(payload.newPassword, 'new password');
}

function normalizeChangePasswordPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    username: cleanText(base.username || base.userName || base.UserName),
    currentPassword: cleanText(base.currentPassword || base.password || base.Password),
    newPassword: cleanText(base.newPassword || base.NextPassword),
    sessionToken: cleanText(base.sessionToken || base.token || base.SessionToken)
  };
}

function validateChangePasswordPayload(payload) {
  if (!cleanText(payload.username)) throw createError('Missing username', 400);
  if (!cleanText(payload.currentPassword)) throw createError('Missing current password', 400);
  validateNextPassword(payload.newPassword, 'new password');
}

module.exports = {
  CONTRACT_VERSION,
  AUTH_ACTIONS,
  cleanText,
  cleanEmail,
  createError,
  normalizeLoginPayload,
  normalizeRequestResetPayload,
  normalizeRedeemResetPayload,
  normalizeChangePasswordPayload,
  validateActionEnvelope,
  validateLoginPayload,
  validateRequestResetPayload,
  validateRedeemResetPayload,
  validateChangePasswordPayload,
  validateNextPassword
};
