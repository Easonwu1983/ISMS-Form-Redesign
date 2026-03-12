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

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

function createAttachmentRouter(deps) {
  const {
    parseJsonBody,
    writeJson,
    graphRequest,
    resolveSiteId,
    getDelegatedToken
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

  async function rawGraphRequest(method, pathOrUrl, body, headers) {
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
    const contentType = cleanText(response.headers.get('content-type'));
    if (response.status === 204) return null;
    if (contentType.includes('application/json')) {
      const json = await response.json();
      if (!response.ok) {
        const error = new Error(cleanText(json && json.error && json.error.message) || `Graph request failed with HTTP ${response.status}`);
        error.statusCode = response.status >= 500 ? 502 : 500;
        throw error;
      }
      return json;
    }
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(cleanText(text) || `Graph request failed with HTTP ${response.status}`);
      error.statusCode = response.status >= 500 ? 502 : 500;
      throw error;
    }
    return text;
  }

  function buildDrivePath(payload, attachmentId) {
    const safeFileName = sanitizeFileName(payload.fileName);
    const encodedName = `${attachmentId}-${safeFileName}`;
    return [
      sanitizePathSegment(payload.scope, 'misc'),
      sanitizePathSegment(payload.ownerId, 'unscoped'),
      encodedName
    ].join('/');
  }

  async function getDriveItem(itemId) {
    const siteId = await resolveSiteId();
    const drive = await resolveDrive();
    return rawGraphRequest('GET', `/sites/${siteId}/drives/${drive.id}/items/${encodeURIComponent(cleanText(itemId))}?$select=id,name,size,webUrl,lastModifiedDateTime,parentReference,file,@microsoft.graph.downloadUrl`, undefined, {});
  }

  async function buildHealth() {
    const siteId = await resolveSiteId();
    const { decoded } = await getDelegatedToken();
    const health = {
      ok: true,
      ready: true,
      contractVersion: CONTRACT_VERSION,
      repository: 'sharepoint-delegated-cli',
      actor: {
        appId: cleanText(decoded.appid),
        upn: cleanText(decoded.upn),
        scopes: cleanText(decoded.scp)
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
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to upload attachment.' }
      }, origin);
    }
  }

  async function handleDetail(_req, res, origin, itemId) {
    try {
      const item = await getDriveItem(itemId);
      await writeJson(res, {
        status: 200,
        jsonBody: {
          ok: true,
          item: mapDriveItemForClient(item, {
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

  async function handleDelete(req, res, origin, itemId) {
    try {
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
    } catch (error) {
      await writeJson(res, {
        status: Number(error && error.statusCode) || 500,
        jsonBody: { ok: false, error: cleanText(error && error.message) || 'Failed to delete attachment.' }
      }, origin);
    }
  }

  function tryHandle(req, res, origin, url) {
    const detailMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/?$/);
    const deleteMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/delete\/?$/);

    if (url.pathname === '/api/attachments/health' && req.method === 'GET') {
      return handleHealth(req, res, origin).then(() => true);
    }
    if (url.pathname === '/api/attachments/upload' && req.method === 'POST') {
      return handleUpload(req, res, origin).then(() => true);
    }
    if (detailMatch && req.method === 'GET') {
      return handleDetail(req, res, origin, decodeURIComponent(detailMatch[1])).then(() => true);
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
