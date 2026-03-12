const CONTRACT_VERSION = '2026-03-13';

const ATTACHMENT_ACTIONS = {
  UPLOAD: 'attachment.upload',
  DELETE: 'attachment.delete'
};

function cleanText(value) {
  return String(value || '').trim();
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

function sanitizePathSegment(value, fallback) {
  const cleaned = cleanText(value)
    .replace(/[\\/:*?"<>|#%&{}+]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || cleanText(fallback) || 'misc';
}

function sanitizeFileName(value) {
  return sanitizePathSegment(value, 'attachment.bin');
}

function generateAttachmentId(prefix) {
  const head = sanitizePathSegment(prefix, 'att').toLowerCase();
  const stamp = Date.now().toString(36);
  const salt = Math.random().toString(36).slice(2, 8);
  return `${head}_${stamp}_${salt}`;
}

function normalizeUploadPayload(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  return {
    attachmentId: cleanText(base.attachmentId),
    fileName: cleanText(base.fileName || base.name),
    contentType: cleanText(base.contentType || base.type) || 'application/octet-stream',
    contentBase64: cleanText(base.contentBase64 || base.dataBase64),
    scope: sanitizePathSegment(base.scope, 'misc'),
    ownerId: sanitizePathSegment(base.ownerId, 'unscoped'),
    recordType: sanitizePathSegment(base.recordType || base.scope, 'misc')
  };
}

function validateUploadPayload(payload) {
  if (!cleanText(payload.fileName)) throw createError('Missing fileName', 400);
  if (!cleanText(payload.contentBase64)) throw createError('Missing contentBase64', 400);
}

function mapDriveItemForClient(item, extras) {
  const source = item && typeof item === 'object' ? item : {};
  const meta = extras && typeof extras === 'object' ? extras : {};
  return {
    attachmentId: cleanText(meta.attachmentId),
    driveItemId: cleanText(source.id || meta.driveItemId),
    name: cleanText(source.name || meta.name),
    size: Number(source.size || meta.size || 0),
    webUrl: cleanText(source.webUrl || meta.webUrl),
    downloadUrl: cleanText(source['@microsoft.graph.downloadUrl'] || meta.downloadUrl),
    contentType: cleanText(source.file && source.file.mimeType || meta.contentType),
    scope: cleanText(meta.scope),
    ownerId: cleanText(meta.ownerId),
    recordType: cleanText(meta.recordType),
    path: cleanText(meta.path || source.parentReference && source.parentReference.path),
    uploadedAt: cleanText(source.lastModifiedDateTime || meta.uploadedAt)
  };
}

module.exports = {
  CONTRACT_VERSION,
  ATTACHMENT_ACTIONS,
  cleanText,
  createError,
  generateAttachmentId,
  mapDriveItemForClient,
  normalizeUploadPayload,
  sanitizeFileName,
  sanitizePathSegment,
  validateActionEnvelope,
  validateUploadPayload
};
