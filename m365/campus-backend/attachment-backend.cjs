const {
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
} = require('../azure-function/attachment-api/src/shared/contract');
const {
  summarizeAttachments
} = require('./audit-diff.cjs');

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

function createAttachmentRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    writeBinary,
    graphRequest,
    resolveSiteId,
    getDelegatedToken,
    requestAuthz
  } = deps;

  const state = {
    listMap: null,
    drive: null,
    list: null
  };

  function getEnv(name, fallback) {
    const value = cleanText(process.env[name]);
    return value || fallback || '';
  }

  function getLibraryName() {
    return getEnv('ATTACHMENTS_LIBRARY', 'ISMSAttachments');
  }

  function getAuditListName() {
    return getEnv('UNIT_CONTACT_AUDIT_LIST', 'OpsAudit');
  }

  async function fetchListMap() {
    const siteId = await resolveSiteId();
    const body = await graphRequest('GET', `/sites/${siteId}/lists?$select=id,displayName,webUrl,list`);
    return new Map((Array.isArray(body && body.value) ? body.value : []).map((entry) => [cleanText(entry.displayName), entry]));
  }

  async function resolveLibraryList() {
    if (state.list) return state.list;
    const listName = getLibraryName();
    if (!state.listMap || !state.listMap.has(listName)) {
      state.listMap = await fetchListMap();
    }
    let list = state.listMap.get(listName);
    if (!list) {
      state.listMap = await fetchListMap();
      list = state.listMap.get(listName);
    }
    if (!list) {
      throw createError(`SharePoint library not found: ${listName}`, 500);
    }
    state.list = list;
    return list;
  }

  async function resolveDrive() {
    if (state.drive) return state.drive;
    const siteId = await resolveSiteId();
    const list = await resolveLibraryList();
    state.drive = await graphRequest('GET', `/sites/${siteId}/lists/${list.id}/drive?$select=id,name,webUrl,driveType`);
    return state.drive;
  }

  async function resolveAuditList() {
    const listName = getAuditListName();
    if (!state.listMap || !state.listMap.has(listName)) {
      state.listMap = await fetchListMap();
    }
    let list = state.listMap.get(listName);
    if (!list) {
      state.listMap = await fetchListMap();
      list = state.listMap.get(listName);
    }
    if (!list) {
      throw createError(`SharePoint list not found: ${listName}`, 500);
    }
    return list;
  }

  async function createAuditRow(input) {
    const siteId = await resolveSiteId();
    const list = await resolveAuditList();
    await graphRequest('POST', `/sites/${siteId}/lists/${list.id}/items`, {
      fields: {
        Title: cleanText(input.recordId || input.eventType || 'audit'),
        EventType: cleanText(input.eventType),
        ActorEmail: cleanText(input.actorEmail),
        TargetEmail: cleanText(input.targetEmail),
        UnitCode: cleanText(input.unitCode),
        RecordId: cleanText(input.recordId),
        OccurredAt: cleanText(input.occurredAt) || new Date().toISOString(),
        PayloadJson: cleanText(input.payloadJson)
      }
    });
  }

  async function rawGraphResponse(method, pathOrUrl, body, headers) {
    const { accessToken } = await getDelegatedToken();
    const targetUrl = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : GRAPH_ROOT + pathOrUrl;
    const response = await fetch(targetUrl, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(headers || {})
      },
      body
    });
    if (!response.ok) {
      const contentType = cleanText(response.headers.get('content-type'));
      if (contentType.includes('application/json')) {
        const json = await response.json();
        const error = new Error(cleanText(json && json.error && json.error.message) || `Graph request failed with HTTP ${response.status}`);
        error.statusCode = response.status >= 500 ? 502 : 500;
        throw error;
      }
      const text = await response.text();
      const error = new Error(cleanText(text) || `Graph request failed with HTTP ${response.status}`);
      error.statusCode = response.status >= 500 ? 502 : 500;
      throw error;
    }
    return response;
  }

  async function rawGraphRequest(method, pathOrUrl, body, headers) {
    const response = await rawGraphResponse(method, pathOrUrl, body, headers);
    const contentType = cleanText(response.headers.get('content-type'));
    if (response.status === 204) return null;
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return json;
    }
    const text = await response.text();
    return text;
  }

  function buildContentDisposition(filename, download) {
    const cleanName = cleanText(filename) || 'attachment.bin';
    const asciiFallback = cleanName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    const encoded = encodeURIComponent(cleanName);
    return `${download ? 'attachment' : 'inline'}; filename="${asciiFallback || 'attachment.bin'}"; filename*=UTF-8''${encoded}`;
  }

  function normalizeAttachmentDisplayName(filename) {
    const cleanName = cleanText(filename);
    if (!cleanName) return 'attachment.bin';
    const normalized = cleanName
      .replace(/^(?:att|trn|chk|car|uca)(?:[-_][a-z0-9]{4,}){1,}(?:[-_]+)/i, '')
      .replace(/^[a-z]{3,6}(?:[-_][a-z0-9]{4,}){1,}(?:[-_]+)/i, '')
      .replace(/^([a-z0-9]{3,6}(?:[-_][a-z0-9]{3,}){2,})[-_]+/i, '')
      .trim();
    return normalized || cleanName;
  }

  function buildDrivePath(payload, attachmentId) {
    const safeFileName = sanitizeFileName(payload.fileName);
    return [
      sanitizePathSegment(payload.scope, 'misc'),
      sanitizePathSegment(payload.ownerId, 'unscoped'),
      sanitizePathSegment(attachmentId, 'att'),
      safeFileName
    ].join('/');
  }

  async function getDriveItem(itemId) {
    const siteId = await resolveSiteId();
    const drive = await resolveDrive();
    return rawGraphRequest('GET', `/sites/${siteId}/drives/${drive.id}/items/${encodeURIComponent(cleanText(itemId))}?$select=id,name,size,webUrl,lastModifiedDateTime,parentReference,file,@microsoft.graph.downloadUrl`, undefined, {});
  }

  async function buildHealth() {
    const siteId = await resolveSiteId();
    const { decoded, mode } = await getDelegatedToken();
    const health = {
      ok: true,
      ready: true,
      contractVersion: CONTRACT_VERSION,
      repository: mode === 'app-only' ? 'sharepoint-app-only' : 'sharepoint-delegated-cli',
      actor: {
        tokenMode: cleanText(mode) || 'delegated-cli',
        appId: cleanText(decoded.appid || decoded.azp),
        upn: cleanText(decoded.upn),
        scopes: cleanText(decoded.scp),
        roles: Array.isArray(decoded.roles) ? decoded.roles.join(',') : ''
      },
      site: { id: siteId }
    };
    try {
      health.library = await resolveLibraryList();
      health.drive = await resolveDrive();
    } catch (error) {
      health.ok = false;
      health.ready = false;
      health.message = cleanText(error && error.message) || 'Attachment library is not ready.';
    }
    return health;
  }

  async function handleHealth(_req, res, origin) {
    try {
      await writeJson(res, {
        status: 200,
        jsonBody: await buildHealth()
      }, origin);
    } catch (error) {
      await writeJson(res, {
        status: 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to read attachment health.' }
      }, origin);
    }
  }

  async function handleUpload(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ATTACHMENT_ACTIONS.UPLOAD);
      const payload = normalizeUploadPayload(envelope.payload);
      validateUploadPayload(payload);
      const siteId = await resolveSiteId();
      const drive = await resolveDrive();
      const attachmentId = cleanText(payload.attachmentId) || generateAttachmentId('att');
      const drivePath = buildDrivePath(payload, attachmentId);
      const contentBuffer = Buffer.from(payload.contentBase64, 'base64');
      const encodedPath = drivePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
      const item = await rawGraphRequest(
        'PUT',
        `/sites/${siteId}/drives/${drive.id}/root:/${encodedPath}:/content`,
        contentBuffer,
        {
          'Content-Type': cleanText(payload.contentType) || 'application/octet-stream'
        }
      );
      await writeJson(res, {
        status: 201,
        jsonBody: {
          ok: true,
          item: mapDriveItemForClient(item, {
            attachmentId,
            scope: payload.scope,
            ownerId: payload.ownerId,
            recordType: payload.recordType,
            path: drivePath,
            contentType: payload.contentType,
            uploadedAt: new Date().toISOString()
          }),
          contractVersion: CONTRACT_VERSION
        }
      }, origin);
      const actor = requestAuthz.buildActorDetails(authz);
      await createAuditRow({
        eventType: 'attachment.uploaded',
        actorEmail: actor.actorEmail,
        unitCode: cleanText(actor.actorActiveUnit || actor.actorUnit),
        recordId: attachmentId,
        occurredAt: new Date().toISOString(),
        payloadJson: JSON.stringify({
          actorUsername: actor.actorUsername,
          ownerId: payload.ownerId,
          recordType: payload.recordType,
          scope: payload.scope,
          fileName: payload.fileName,
          contentType: payload.contentType,
          fileSize: Number(payload.size || contentBuffer.length || 0),
          storedPath: drivePath,
          attachment: summarizeAttachments([{
            attachmentId,
            name: payload.fileName,
            size: Number(payload.size || contentBuffer.length || 0)
          }])
        })
      });
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to upload attachment.' }
      }, origin);
    }
  }

  async function handlePublicUpload(req, res, origin) {
    try {
      const envelope = await parseJsonBody(req);
      validateActionEnvelope(envelope, ATTACHMENT_ACTIONS.UPLOAD);
      const payload = normalizeUploadPayload(envelope.payload);
      if (cleanText(payload.scope) !== 'unit-contact-authorization-doc') {
        throw createError('Forbidden', 403);
      }
      if (cleanText(payload.recordType) !== 'unit-contact-application') {
        throw createError('Forbidden', 403);
      }
      validateUploadPayload(payload);
      const siteId = await resolveSiteId();
      const drive = await resolveDrive();
      const attachmentId = cleanText(payload.attachmentId) || generateAttachmentId('att');
      const drivePath = buildDrivePath(payload, attachmentId);
      const contentBuffer = Buffer.from(payload.contentBase64, 'base64');
      const encodedPath = drivePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
      const item = await rawGraphRequest(
        'PUT',
        `/sites/${siteId}/drives/${drive.id}/root:/${encodedPath}:/content`,
        contentBuffer,
        {
          'Content-Type': cleanText(payload.contentType) || 'application/octet-stream'
        }
      );
      await writeJson(res, {
        status: 201,
        jsonBody: {
          ok: true,
          item: mapDriveItemForClient(item, {
            attachmentId,
            scope: payload.scope,
            ownerId: payload.ownerId,
            recordType: payload.recordType,
            path: drivePath,
            contentType: payload.contentType,
            uploadedAt: new Date().toISOString()
          }),
          contractVersion: CONTRACT_VERSION
        }
      }, origin);
      await createAuditRow({
        eventType: 'unit_contact.authorization_doc_public_uploaded',
        actorEmail: cleanText(payload.ownerId),
        targetEmail: cleanText(payload.ownerId),
        unitCode: '',
        recordId: attachmentId,
        occurredAt: new Date().toISOString(),
        payloadJson: JSON.stringify({
          ownerId: cleanText(payload.ownerId),
          recordType: cleanText(payload.recordType),
          scope: cleanText(payload.scope),
          fileName: payload.fileName,
          contentType: payload.contentType,
          fileSize: Number(payload.size || contentBuffer.length || 0),
          storedPath: drivePath,
          publicUpload: true,
          attachment: summarizeAttachments([{
            attachmentId,
            name: payload.fileName,
            size: Number(payload.size || contentBuffer.length || 0)
          }])
        })
      });
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to upload attachment.' }
      }, origin);
    }
  }

  async function handleDetail(req, res, origin, itemId) {
    try {
      await requestAuthz.requireAuthenticatedUser(req);
      const item = await getDriveItem(itemId);
      const clientItem = {
        ...(item || {}),
        name: normalizeAttachmentDisplayName(cleanText(item && item.name))
      };
      await writeJson(res, {
        status: 200,
        jsonBody: {
          ok: true,
          item: mapDriveItemForClient(clientItem, {
            path: cleanText(item && item.parentReference && item.parentReference.path)
          }),
          contractVersion: CONTRACT_VERSION
        }
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
      await requestAuthz.requireAuthenticatedUser(req);
      const siteId = await resolveSiteId();
      const drive = await resolveDrive();
      const item = await getDriveItem(itemId);
      const response = await rawGraphResponse(
        'GET',
        `/sites/${siteId}/drives/${drive.id}/items/${encodeURIComponent(cleanText(itemId))}/content`,
        undefined,
        { Accept: '*/*' }
      );
      const contentType = cleanText(response.headers.get('content-type')) || cleanText(item && item.file && item.file.mimeType) || 'application/octet-stream';
      const download = cleanText(url && url.searchParams && url.searchParams.get('download')) === '1';
      const payload = Buffer.from(await response.arrayBuffer());
      await writeBinary(res, {
        status: 200,
        path: '/api/attachments/content',
        body: payload,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': buildContentDisposition(normalizeAttachmentDisplayName(cleanText(item && item.name)), download)
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
      const siteId = await resolveSiteId();
      const drive = await resolveDrive();
      await rawGraphRequest('DELETE', `/sites/${siteId}/drives/${drive.id}/items/${encodeURIComponent(cleanText(itemId))}`);
      await writeJson(res, {
        status: 200,
        jsonBody: {
          ok: true,
          deletedId: cleanText(itemId),
          contractVersion: CONTRACT_VERSION
        }
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
      });
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

  return {
    tryHandle
  };
}

module.exports = {
  createAttachmentRouter
};
