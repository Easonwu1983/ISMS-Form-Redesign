'use strict';

const fs = require('fs');
const path = require('path');
const {
  CONTRACT_VERSION,
  ATTACHMENT_ACTIONS,
  cleanText,
  createError,
  generateAttachmentId,
  normalizeUploadPayload,
  sanitizeFileName,
  sanitizePathSegment,
  validateActionEnvelope,
  validateUploadPayload
} = require('../azure-function/attachment-api/src/shared/contract');
const {
  summarizeAttachments
} = require('./audit-diff.cjs');
const db = require('./db.cjs');

/* ------------------------------------------------------------------ */
/*  Filesystem helpers                                                 */
/* ------------------------------------------------------------------ */

function getAttachmentsDir() {
  return cleanText(process.env.ATTACHMENTS_DIR) || path.join(process.cwd(), 'data', 'attachments');
}

function buildStoragePath(scope, ownerId, attachmentId, fileName) {
  return path.join(
    getAttachmentsDir(),
    sanitizePathSegment(scope, 'misc'),
    sanitizePathSegment(ownerId, 'unscoped'),
    sanitizePathSegment(attachmentId, 'att'),
    sanitizeFileName(fileName)
  );
}

function buildRelativePath(scope, ownerId, attachmentId, fileName) {
  return [
    sanitizePathSegment(scope, 'misc'),
    sanitizePathSegment(ownerId, 'unscoped'),
    sanitizePathSegment(attachmentId, 'att'),
    sanitizeFileName(fileName)
  ].join('/');
}

/* ------------------------------------------------------------------ */
/*  Row mapper                                                         */
/* ------------------------------------------------------------------ */

function mapRowToAttachment(row) {
  if (!row) return null;
  return {
    attachmentId: row.attachment_id || '',
    name: row.file_name || '',
    size: Number(row.file_size || 0),
    contentType: row.content_type || 'application/octet-stream',
    scope: row.scope || '',
    ownerId: row.owner_id || '',
    recordType: row.record_type || '',
    path: row.storage_path || '',
    uploadedAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    storage: 'local-fs'
  };
}

/* ------------------------------------------------------------------ */
/*  Display name normalization                                         */
/* ------------------------------------------------------------------ */

function normalizeAttachmentDisplayName(filename) {
  let cleanName = cleanText(filename);
  if (!cleanName) return 'attachment.bin';
  // Decode URL-encoded filenames (e.g. %E5%A0%B1%E5%91%8A.pdf → 報告.pdf)
  if (/%[0-9A-Fa-f]{2}/.test(cleanName)) {
    try { cleanName = decodeURIComponent(cleanName); } catch (_) {}
  }
  const normalized = cleanName
    .replace(/^(?:att|trn|chk|car|uca)(?:[-_][a-z0-9]{4,}){1,}(?:[-_]+)/i, '')
    .replace(/^[a-z]{3,6}(?:[-_][a-z0-9]{4,}){1,}(?:[-_]+)/i, '')
    .replace(/^([a-z0-9]{3,6}(?:[-_][a-z0-9]{3,}){2,})[-_]+/i, '')
    .trim();
  return normalized || cleanName;
}

function buildContentDisposition(filename, download) {
  const cleanName = cleanText(filename) || 'attachment.bin';
  const asciiFallback = cleanName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  const encoded = encodeURIComponent(cleanName);
  return `${download ? 'attachment' : 'inline'}; filename="${asciiFallback || 'attachment.bin'}"; filename*=UTF-8''${encoded}`;
}

/* ------------------------------------------------------------------ */
/*  Router factory                                                     */
/* ------------------------------------------------------------------ */

const MAX_ATTACHMENT_BYTES = Number(process.env.MAX_ATTACHMENT_SIZE_BYTES || 10 * 1024 * 1024); // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp', '.csv', '.txt', '.rtf',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
  '.zip', '.7z'
]);

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/csv', 'text/plain', 'application/rtf',
  'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml',
  'application/zip', 'application/x-7z-compressed',
  'application/octet-stream'
]);

function validateFileConstraints(fileName, contentType, sizeBytes) {
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw createError(`File size (${(sizeBytes / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed size (${(MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0)} MB).`, 413);
  }
  const ext = String(path.extname(fileName) || '').toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    throw createError(`File type "${ext}" is not allowed. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`, 415);
  }
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (ct && ct !== 'application/octet-stream' && !ALLOWED_CONTENT_TYPES.has(ct)) {
    throw createError(`Content type "${ct}" is not allowed.`, 415);
  }
}

function createAttachmentRouter(deps) {
  const { parseJsonBody, parseUploadBody, writeJson, writeBinary, requestAuthz } = deps;
  const parseAttachmentBody = typeof parseUploadBody === 'function' ? parseUploadBody : parseJsonBody;

  async function createAuditRow(input) {
    await db.query(`
      INSERT INTO ops_audit (title, event_type, actor_email, target_email, unit_code, record_id, occurred_at, payload_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      cleanText(input.recordId || input.eventType || 'audit'),
      cleanText(input.eventType),
      cleanText(input.actorEmail),
      cleanText(input.targetEmail || ''),
      cleanText(input.unitCode || ''),
      cleanText(input.recordId),
      cleanText(input.occurredAt) || new Date().toISOString(),
      cleanText(input.payloadJson)
    ]);
  }

  async function buildHealth() {
    const dbHealth = await db.healthCheck();
    const attachDir = getAttachmentsDir();
    let fsOk = false;
    try {
      await fs.promises.access(attachDir, fs.constants.W_OK);
      fsOk = true;
    } catch (_) {
      // directory does not exist or is not writable
      try {
        await fs.promises.mkdir(attachDir, { recursive: true });
        fsOk = true;
      } catch (_) { /* still not ok */ }
    }
    return {
      ok: dbHealth.ok && fsOk,
      ready: dbHealth.ok && fsOk,
      contractVersion: CONTRACT_VERSION,
      repository: 'postgresql+local-fs',
      database: { ok: dbHealth.ok, latencyMs: dbHealth.latencyMs },
      filesystem: { ok: fsOk, path: attachDir }
    };
  }

  async function handleHealth(_req, res, origin) {
    try {
      await writeJson(res, { status: 200, jsonBody: await buildHealth() }, origin);
    } catch (error) {
      await writeJson(res, {
        status: 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to read attachment health.' }
      }, origin);
    }
  }

  async function saveFileToDisk(storagePath, contentBuffer) {
    const dir = path.dirname(storagePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(storagePath, contentBuffer);
  }

  async function insertAttachmentMetadata(attachmentId, payload, fileSize, relativePath) {
    await db.query(`
      INSERT INTO attachments (
        attachment_id, scope, owner_id, record_type,
        file_name, content_type, file_size, storage_path,
        backend_mode, record_source, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      cleanText(attachmentId),
      cleanText(payload.scope),
      cleanText(payload.ownerId),
      cleanText(payload.recordType),
      cleanText(payload.fileName),
      cleanText(payload.contentType) || 'application/octet-stream',
      fileSize,
      relativePath,
      'pg-campus-backend',
      'frontend',
      new Date().toISOString()
    ]);
  }

  async function handleUploadCore(req, res, origin, isPublic) {
    try {
      let authz = null;
      if (!isPublic) {
        authz = await requestAuthz.requireAuthenticatedUser(req);
      }
      const envelope = await parseAttachmentBody(req);
      validateActionEnvelope(envelope, ATTACHMENT_ACTIONS.UPLOAD);
      const payload = normalizeUploadPayload(envelope.payload);

      if (isPublic) {
        if (cleanText(payload.scope) !== 'unit-contact-authorization-doc') throw createError('Forbidden', 403);
        if (cleanText(payload.recordType) !== 'unit-contact-application') throw createError('Forbidden', 403);
      }

      validateUploadPayload(payload);
      const attachmentId = cleanText(payload.attachmentId) || generateAttachmentId('att');
      const contentBuffer = Buffer.from(payload.contentBase64, 'base64');
      validateFileConstraints(payload.fileName, payload.contentType, contentBuffer.length);
      const relativePath = buildRelativePath(payload.scope, payload.ownerId, attachmentId, payload.fileName);
      const storagePath = buildStoragePath(payload.scope, payload.ownerId, attachmentId, payload.fileName);

      await saveFileToDisk(storagePath, contentBuffer);
      await insertAttachmentMetadata(attachmentId, payload, contentBuffer.length, relativePath);

      const clientItem = {
        attachmentId,
        name: cleanText(payload.fileName),
        size: contentBuffer.length,
        contentType: cleanText(payload.contentType) || 'application/octet-stream',
        scope: cleanText(payload.scope),
        ownerId: cleanText(payload.ownerId),
        recordType: cleanText(payload.recordType),
        path: relativePath,
        uploadedAt: new Date().toISOString(),
        storage: 'local-fs'
      };

      await writeJson(res, {
        status: 201,
        jsonBody: { ok: true, item: clientItem, contractVersion: CONTRACT_VERSION }
      }, origin);

      const eventType = isPublic ? 'unit_contact.authorization_doc_public_uploaded' : 'attachment.uploaded';
      const actorEmail = isPublic
        ? cleanText(payload.ownerId)
        : (authz ? requestAuthz.buildActorDetails(authz).actorEmail : '');

      await createAuditRow({
        eventType,
        actorEmail,
        targetEmail: isPublic ? cleanText(payload.ownerId) : '',
        unitCode: isPublic ? '' : cleanText(authz && requestAuthz.buildActorDetails(authz).actorActiveUnit || ''),
        recordId: attachmentId,
        occurredAt: new Date().toISOString(),
        payloadJson: JSON.stringify({
          ownerId: payload.ownerId,
          recordType: payload.recordType,
          scope: payload.scope,
          fileName: payload.fileName,
          contentType: payload.contentType,
          fileSize: contentBuffer.length,
          storedPath: relativePath,
          publicUpload: isPublic,
          attachment: summarizeAttachments([{
            attachmentId,
            name: payload.fileName,
            size: contentBuffer.length
          }])
        })
      }).catch((err) => console.warn('[attachment] audit write failed:', err && err.message));
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to upload attachment.' }
      }, origin);
    }
  }

  async function handleUpload(req, res, origin) {
    return handleUploadCore(req, res, origin, false);
  }

  async function handlePublicUpload(req, res, origin) {
    return handleUploadCore(req, res, origin, true);
  }

  function canAccessAttachment(authz, row) {
    if (!authz || !row) return false;
    if (requestAuthz.isAdmin(authz)) return true;
    const ownerScope = cleanText(row.scope);
    const ownerId = cleanText(row.owner_id);
    if (ownerScope === 'unit-contact-authorization-doc') return true;
    if (ownerId && requestAuthz.matchesUsername(authz, ownerId)) return true;
    if (ownerId && requestAuthz.hasUnitAccess(authz, ownerId)) return true;
    return false;
  }

  async function handleDetail(req, res, origin, itemId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const row = await db.queryOne(
        `SELECT * FROM attachments WHERE attachment_id = $1`,
        [cleanText(itemId)]
      );
      if (!row) throw createError('Attachment not found', 404);
      if (!canAccessAttachment(authz, row)) throw createError('Forbidden', 403);
      const item = mapRowToAttachment(row);
      item.name = normalizeAttachmentDisplayName(item.name);
      await writeJson(res, {
        status: 200,
        jsonBody: { ok: true, item, contractVersion: CONTRACT_VERSION }
      }, origin);
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to read attachment.' }
      }, origin);
    }
  }

  async function handleContent(req, res, origin, itemId, url) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const row = await db.queryOne(
        `SELECT * FROM attachments WHERE attachment_id = $1`,
        [cleanText(itemId)]
      );
      if (!row) throw createError('Attachment not found', 404);
      if (!canAccessAttachment(authz, row)) throw createError('Forbidden', 403);

      const relativePath = cleanText(row.storage_path);
      const storagePath = path.join(getAttachmentsDir(), relativePath);

      try {
        await fs.promises.access(storagePath, fs.constants.R_OK);
      } catch (_) {
        throw createError('Attachment file not found on disk', 404);
      }

      const download = cleanText(url && url.searchParams && url.searchParams.get('download')) === '1';
      const contentType = cleanText(row.content_type) || 'application/octet-stream';
      const displayName = normalizeAttachmentDisplayName(cleanText(row.file_name));
      const payload = await fs.promises.readFile(storagePath);

      await writeBinary(res, {
        status: 200,
        path: '/api/attachments/content',
        body: payload,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': buildContentDisposition(displayName, download)
        }
      }, origin);
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to read attachment content.' }
      }, origin);
    }
  }

  async function handleDelete(req, res, origin, itemId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ATTACHMENT_ACTIONS.DELETE);

      const row = await db.queryOne(
        `SELECT * FROM attachments WHERE attachment_id = $1`,
        [cleanText(itemId)]
      );
      if (!row) throw createError('Attachment not found', 404);

      // Only admin or owner can delete
      if (!requestAuthz.isAdmin(authz)) {
        const ownerId = cleanText(row.owner_id);
        if (!ownerId || !requestAuthz.matchesUsername(authz, ownerId)) {
          throw createError('Only the owner or admin can delete this attachment', 403);
        }
      }

      // Delete from DB
      await db.query(`DELETE FROM attachments WHERE attachment_id = $1`, [cleanText(itemId)]);

      // Delete from disk (best-effort)
      const relativePath = cleanText(row.storage_path);
      if (relativePath) {
        const storagePath = path.join(getAttachmentsDir(), relativePath);
        fs.promises.unlink(storagePath).catch(() => {});
      }

      await writeJson(res, {
        status: 200,
        jsonBody: { ok: true, deletedId: cleanText(itemId), contractVersion: CONTRACT_VERSION }
      }, origin);

      const actor = requestAuthz.buildActorDetails(authz);
      await createAuditRow({
        eventType: 'attachment.deleted',
        actorEmail: actor.actorEmail,
        unitCode: cleanText(actor.actorActiveUnit || actor.actorUnit),
        recordId: cleanText(itemId),
        occurredAt: new Date().toISOString(),
        payloadJson: JSON.stringify({
          actorUsername: actor.actorUsername,
          deletedAttachmentId: cleanText(itemId)
        })
      }).catch((err) => console.warn('[attachment] audit write failed:', err && err.message));
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to delete attachment.' }
      }, origin);
    }
  }

  function tryHandle(req, res, origin, url) {
    const detailMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/?$/);
    const contentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/content\/?$/);
    const deleteMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/delete\/?$/);

    if (url.pathname === '/api/attachments/health' && req.method === 'GET') {
      return handleHealth(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/attachments/public-upload' && req.method === 'POST') {
      return handlePublicUpload(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/attachments/upload' && req.method === 'POST') {
      return handleUpload(req, res, origin).then(() => true);
    }
    if (detailMatch && req.method === 'GET') {
      return handleDetail(req, res, origin, decodeURIComponent(detailMatch[1])).then(() => true);
    }
    if (contentMatch && req.method === 'GET') {
      return handleContent(req, res, origin, decodeURIComponent(contentMatch[1]), url).then(() => true);
    }
    if (deleteMatch && req.method === 'POST') {
      return handleDelete(req, res, origin, decodeURIComponent(deleteMatch[1])).then(() => true);
    }
    return Promise.resolve(false);
  }

  return { tryHandle };
}

module.exports = { createAttachmentRouter };
