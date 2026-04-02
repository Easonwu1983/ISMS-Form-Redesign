(function () {
  window.createAppRemoteBridgeModule = function createAppRemoteBridgeModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const contracts = opts.contracts && typeof opts.contracts === 'object' ? opts.contracts : {};
      const actions = opts.actions && typeof opts.actions === 'object' ? opts.actions : {};

      function getRequestTimeout(primary, fallback) {
        const config = opts.getRuntimeM365Config();
        return Number(primary || fallback || config.unitContactRequestTimeoutMs || 15000);
      }

      async function requestJson(url, options) {
        const requestOptions = options || {};
        const safeUrl = opts.normalizeRequestUrl(url);
        if (!safeUrl) throw new Error('未設定或無效的請求端點');
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutMs = getRequestTimeout(requestOptions.timeoutMs, (opts.getRuntimeM365Config() || {}).unitContactRequestTimeoutMs);
        let timeoutId = null;
        if (controller && timeoutMs > 0) timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
        try {
          const response = await fetch(safeUrl, {
            method: requestOptions.method || 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(requestOptions.headers || {})
            },
            body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
            signal: controller ? controller.signal : undefined
          });
          const rawText = await response.text();
          let parsed = null;
          if (rawText) {
            try {
              parsed = JSON.parse(rawText);
            } catch (_) {
              parsed = { ok: false, message: rawText };
            }
          }
          if (!response.ok) {
            const error = new Error(String(parsed && (parsed.message || parsed.error || parsed.detail) || ('HTTP ' + response.status)).trim());
            error.statusCode = response.status;
            throw error;
          }
          return parsed || { ok: true };
        } catch (error) {
          if (error && error.name === 'AbortError') throw new Error('連線逾時，請稍後再試');
          throw error;
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      async function requestBlob(url, options) {
        const requestOptions = options || {};
        const safeUrl = opts.normalizeRequestUrl(url);
        if (!safeUrl) throw new Error('Invalid request endpoint');
        const config = opts.getRuntimeM365Config();
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutMs = getRequestTimeout(
          requestOptions.timeoutMs,
          config.attachmentsRequestTimeoutMs || config.apiReadTimeoutMs || config.unitContactRequestTimeoutMs
        );
        let timeoutId = null;
        if (controller && timeoutMs > 0) timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
        try {
          const response = await fetch(safeUrl, {
            method: requestOptions.method || 'GET',
            headers: {
              ...(requestOptions.headers || {})
            },
            signal: controller ? controller.signal : undefined
          });
          if (!response.ok) {
            const rawText = await response.text();
            let parsed = null;
            try {
              parsed = rawText ? JSON.parse(rawText) : null;
            } catch (_) {
              parsed = { ok: false, message: rawText };
            }
            const error = new Error(String(parsed && (parsed.message || parsed.error || parsed.detail) || ('HTTP ' + response.status)).trim());
            error.statusCode = response.status;
            throw error;
          }
          return {
            response: response,
            blob: await response.blob()
          };
        } catch (error) {
          if (error && error.name === 'AbortError') throw new Error('連線逾時，請稍後再試');
          throw error;
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      function safeGetSessionAuthHeaders() {
        try { return opts.getSessionAuthHeaders() || {}; } catch (_) { return {}; }
      }
      async function requestSystemUserJson(url, options) {
        return requestJson(url, {
          ...(options || {}),
          headers: {
            'X-ISMS-Contract-Version': contracts.systemUsers,
            ...opts.getSystemUsersSharedHeaders(),
            ...safeGetSessionAuthHeaders(),
            ...(((options || {}).headers) || {})
          }
        });
      }

      async function requestAuthJson(path, options) {
        const endpoint = opts.getAuthEndpoint();
        if (!endpoint) throw new Error('未設定 authEndpoint');
        const suffix = String(path || '').trim();
        const url = suffix ? (endpoint + suffix) : endpoint;
        return requestSystemUserJson(url, {
          ...(options || {}),
          headers: {
            'X-ISMS-Contract-Version': contracts.auth,
            ...opts.getAuthSharedHeaders(),
            ...(((options || {}).headers) || {})
          }
        });
      }

      async function requestReviewScopeJson(path, options) {
        const endpoint = opts.getReviewScopesEndpoint();
        if (!endpoint) throw new Error('未設定 reviewScopesEndpoint');
        const suffix = String(path || '').trim();
        const url = suffix ? (/^https?:\/\//i.test(suffix) ? suffix : (endpoint + suffix)) : endpoint;
        return requestSystemUserJson(url, {
          ...(options || {}),
          headers: {
            'X-ISMS-Contract-Version': contracts.reviewScopes,
            ...opts.getReviewScopesSharedHeaders(),
            ...(((options || {}).headers) || {})
          }
        });
      }

      async function requestAuditTrailJson(path, options) {
        const endpoint = opts.getAuditTrailEndpoint();
        if (!endpoint) throw new Error('未設定 auditTrailEndpoint');
        const suffix = String(path || '').trim();
        const url = suffix ? (/^https?:\/\//i.test(suffix) ? suffix : (endpoint + suffix)) : endpoint;
        return requestSystemUserJson(url, {
          ...(options || {}),
          headers: {
            'X-ISMS-Contract-Version': contracts.auditTrail,
            ...opts.getAuditTrailSharedHeaders(),
            ...(((options || {}).headers) || {})
          }
        });
      }

      async function requestAttachmentJson(path, options) {
        const endpoint = opts.getAttachmentsEndpoint();
        if (!endpoint) throw new Error('未設定 attachmentsEndpoint');
        const suffix = String(path || '').trim();
        const url = suffix ? (endpoint + suffix) : endpoint;
        return requestSystemUserJson(url, {
          ...(options || {}),
          headers: {
            'X-ISMS-Contract-Version': contracts.attachments,
            ...opts.getAttachmentsSharedHeaders(),
            ...(((options || {}).headers) || {})
          }
        });
      }

      async function requestPublicAttachmentJson(path, options) {
        const endpoint = opts.getAttachmentsEndpoint();
        if (!endpoint) throw new Error('未設定 attachmentsEndpoint');
        const suffix = String(path || '').trim();
        const url = suffix ? (endpoint + suffix) : endpoint;
        return requestJson(url, {
          ...(options || {}),
          headers: {
            'X-ISMS-Contract-Version': contracts.attachments,
            ...opts.getAttachmentsSharedHeaders(),
            ...(((options || {}).headers) || {})
          }
        });
      }

      async function requestAttachmentBlob(path, options) {
        const endpoint = opts.getAttachmentsEndpoint();
        if (!endpoint) throw new Error('未設定 attachmentsEndpoint');
        const suffix = String(path || '').trim();
        const url = suffix ? (endpoint + suffix) : endpoint;
        return requestBlob(url, {
          ...(options || {}),
          headers: {
            'X-ISMS-Contract-Version': contracts.attachments,
            ...opts.getAttachmentsSharedHeaders(),
            ...safeGetSessionAuthHeaders(),
            ...(((options || {}).headers) || {})
          }
        });
      }

      async function requestSameOriginBlob(url, options) {
        return requestBlob(url, {
          ...(options || {}),
          headers: {
            ...safeGetSessionAuthHeaders(),
            ...(((options || {}).headers) || {})
          }
        });
      }

      function readBlobAsDataUrl(blob) {
        return new Promise(function (resolve, reject) {
          if (!(blob instanceof Blob)) {
            reject(new Error('缺少附件內容'));
            return;
          }
          const reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result || '')); };
          reader.onerror = function () { reject(reader.error || new Error('無法讀取附件內容')); };
          reader.readAsDataURL(blob);
        });
      }

      async function resolveAttachmentBlob(entry) {
        if (entry && entry.file instanceof Blob) return entry.file;
        if (entry && typeof entry.data === 'string' && entry.data.startsWith('data:')) {
          const match = entry.data.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
          if (!match) throw new Error('附件資料格式不正確');
          const mime = String(match[1] || entry.type || 'application/octet-stream').trim();
          const raw = match[2] ? atob(match[3] || '') : decodeURIComponent(match[3] || '');
          const bytes = new Uint8Array(raw.length);
          for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
          return new Blob([bytes], { type: mime });
        }
        if (entry && entry.attachmentId && !entry.driveItemId) {
          const blob = await opts.getAttachmentModule().readStoredBlob(entry.attachmentId);
          if (blob) return blob;
        }
        return null;
      }

      function normalizeLegacyAttachmentName(name) {
        const clean = String(name || '').replace(/^\uFEFF/, '').trim();
        if (!clean) return '';
        return clean
          .replace(/^(?:att|trn|chk|car|uca)(?:[-_][a-z0-9]{4,}){2,}(?:[-_]+)/i, '')
          .replace(/^[a-z]{3,6}(?:[-_][a-z0-9]{4,}){2,}(?:[-_]+)/i, '')
          .trim() || clean;
      }

      function normalizeRemoteAttachmentDescriptor(item, fallback) {
        const source = item && typeof item === 'object' ? item : {};
        const base = fallback && typeof fallback === 'object' ? fallback : {};
        const scope = String(source.scope || base.scope || '').trim();
        const name = normalizeLegacyAttachmentName(
          scope === 'training-signoff' && String(base.name || '').trim()
            ? String(base.name || '').trim()
            : String(source.name || base.name || '').trim()
        );
        const contentType = String(source.contentType || source.type || base.contentType || base.type || '').trim();
        const size = Number(source.size || base.size || 0);
        return {
          attachmentId: String(source.attachmentId || base.attachmentId || '').trim(),
          driveItemId: String(source.driveItemId || base.driveItemId || '').trim(),
          name: name,
          type: contentType,
          contentType: contentType,
          size: size,
          extension: String(source.extension || base.extension || opts.getFileExtension(name)).trim().toLowerCase(),
          signature: String(base.signature || opts.buildUploadSignature({ name: name, type: contentType, size: size })).trim(),
          storedAt: String(source.uploadedAt || source.storedAt || base.storedAt || new Date().toISOString()).trim(),
          uploadedAt: String(source.uploadedAt || source.storedAt || base.storedAt || new Date().toISOString()).trim(),
          scope: scope,
          ownerId: String(source.ownerId || base.ownerId || '').trim(),
          recordType: String(source.recordType || base.recordType || base.scope || '').trim(),
          webUrl: String(source.webUrl || base.webUrl || '').trim(),
          downloadUrl: String(source.downloadUrl || base.downloadUrl || '').trim(),
          path: String(source.path || base.path || '').trim(),
          storage: 'm365'
        };
      }

      async function fetchRemoteAttachmentDetail(entry) {
        const descriptor = entry && typeof entry === 'object' ? entry : {};
        const driveItemId = String(descriptor.driveItemId || '').trim();
        if (!driveItemId) return descriptor;
        const body = await requestAttachmentJson('/' + encodeURIComponent(driveItemId), { method: 'GET' });
        return normalizeRemoteAttachmentDescriptor(body && body.item || {}, descriptor);
      }

      async function fetchRemoteAttachmentBlob(entry) {
        const descriptor = entry && typeof entry === 'object' ? entry : {};
        const driveItemId = String(descriptor.driveItemId || '').trim();
        if (!driveItemId) return null;
        const result = await requestAttachmentBlob('/' + encodeURIComponent(driveItemId) + '/content', { method: 'GET' });
        return {
          blob: result.blob,
          contentType: String(result.response.headers.get('content-type') || descriptor.contentType || descriptor.type || '').trim()
        };
      }

      async function submitAttachmentUpload(entry, options) {
        const blob = await resolveAttachmentBlob(entry);
        if (!blob) throw new Error('找不到附件內容，無法上傳到正式後端');
        const dataUrl = await readBlobAsDataUrl(blob);
        const contentBase64 = String(dataUrl.split(',')[1] || '').trim();
        if (!contentBase64) throw new Error('附件內容轉換失敗');
        const descriptor = entry && typeof entry === 'object' ? entry : {};
        const opts2 = options && typeof options === 'object' ? options : {};
        const publicUpload = !!opts2.publicUpload;
        const resolvedFileName = (() => {
          if (typeof opts2.buildFileName === 'function') {
            const built = String(opts2.buildFileName(descriptor, entry, blob) || '').trim();
            if (built) return built;
          }
          if (opts2.fileName) {
            const explicit = String(opts2.fileName || '').trim();
            if (explicit) return explicit;
          }
          return String(descriptor.name || (entry && entry.file && entry.file.name) || 'attachment.bin').trim();
        })();
        const body = await (publicUpload ? requestPublicAttachmentJson('/public-upload', {
          method: 'POST',
          body: {
            action: actions.upload,
            payload: {
              attachmentId: String(descriptor.attachmentId || '').trim(),
              fileName: resolvedFileName,
              contentType: String(descriptor.type || descriptor.contentType || blob.type || 'application/octet-stream').trim(),
              contentBase64: contentBase64,
              scope: String(opts2.scope || descriptor.scope || '').trim(),
              ownerId: String(opts2.ownerId || descriptor.ownerId || '').trim(),
              recordType: String(opts2.recordType || descriptor.recordType || opts2.scope || descriptor.scope || '').trim()
            }
          }
        }) : requestAttachmentJson('/upload', {
          method: 'POST',
          body: {
            action: actions.upload,
            payload: {
              attachmentId: String(descriptor.attachmentId || '').trim(),
              fileName: resolvedFileName,
              contentType: String(descriptor.type || descriptor.contentType || blob.type || 'application/octet-stream').trim(),
              contentBase64: contentBase64,
              scope: String(opts2.scope || descriptor.scope || '').trim(),
              ownerId: String(opts2.ownerId || descriptor.ownerId || '').trim(),
              recordType: String(opts2.recordType || descriptor.recordType || opts2.scope || descriptor.scope || '').trim()
            }
          }
        }));
        return normalizeRemoteAttachmentDescriptor(body && body.item || {}, {
          ...descriptor,
          scope: String(opts2.scope || descriptor.scope || '').trim(),
          ownerId: String(opts2.ownerId || descriptor.ownerId || '').trim(),
          recordType: String(opts2.recordType || descriptor.recordType || opts2.scope || descriptor.scope || '').trim()
        });
      }

      return {
        requestSystemUserJson: requestSystemUserJson,
        requestAuthJson: requestAuthJson,
        requestReviewScopeJson: requestReviewScopeJson,
        requestAuditTrailJson: requestAuditTrailJson,
        requestAttachmentJson: requestAttachmentJson,
        requestPublicAttachmentJson: requestPublicAttachmentJson,
        requestAttachmentBlob: requestAttachmentBlob,
        requestSameOriginBlob: requestSameOriginBlob,
        readBlobAsDataUrl: readBlobAsDataUrl,
        resolveAttachmentBlob: resolveAttachmentBlob,
        normalizeLegacyAttachmentName: normalizeLegacyAttachmentName,
        normalizeRemoteAttachmentDescriptor: normalizeRemoteAttachmentDescriptor,
        fetchRemoteAttachmentDetail: fetchRemoteAttachmentDetail,
        fetchRemoteAttachmentBlob: fetchRemoteAttachmentBlob,
        submitAttachmentUpload: submitAttachmentUpload
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
