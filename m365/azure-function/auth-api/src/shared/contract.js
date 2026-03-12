const CONTRACT_VERSION = '2026-03-13';

const AUTH_ACTIONS = {
  LOGIN: 'auth.login',
  RESET_PASSWORD: 'auth.reset-password-by-email'
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

function normalizeResetPasswordPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    email: cleanEmail(base.email || base.Email),
    password: cleanText(base.password || base.Password),
    actorEmail: cleanEmail(base.actorEmail || base.ActorEmail),
    actorName: cleanText(base.actorName || base.ActorName)
  };
}

function validateResetPasswordPayload(payload) {
  if (!cleanEmail(payload.email)) throw createError('Missing email', 400);
}

module.exports = {
  CONTRACT_VERSION,
  AUTH_ACTIONS,
  cleanText,
  cleanEmail,
  createError,
  normalizeLoginPayload,
  normalizeResetPasswordPayload,
  validateActionEnvelope,
  validateLoginPayload,
  validateResetPasswordPayload
};
