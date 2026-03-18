(function () {
  window.createAttachmentModule = function createAttachmentModule(deps) {
    const {
      esc,
      toast,
      getBackendMode,
      fetchRemoteAttachmentDetail,
      fetchRemoteAttachmentBlob
    } = deps;

    const DB_NAME = 'cats_attachments_v1';
    const STORE_NAME = 'attachments';
    const DB_VERSION = 1;
    const CONTAINER_URLS = new WeakMap();
    const ACTIVE_URLS = new Set();
    const REMOTE_BLOB_CACHE = new Map();
    let dbPromise = null;
    let attachmentCounter = 0;

    function openDb() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          resolve(null);
          return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function (event) {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = function () {
          resolve(request.result);
        };
        request.onerror = function () {
          reject(request.error || new Error('Failed to open attachment database'));
        };
      });
      return dbPromise;
    }

    function runStoreRequest(mode, callback) {
      return openDb().then((db) => {
        if (!db) {
          const unsupported = new Error('\u700f\u89bd\u5668\u4e0d\u652f\u63f4\u672c\u6a5f\u9644\u4ef6\u5feb\u53d6\uff0c\u7cfb\u7d71\u5c07\u6539\u7528\u5373\u6642\u4e32\u6d41\u3002');
          unsupported.code = 'ATTACHMENT_CACHE_UNAVAILABLE';
          throw unsupported;
        }
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, mode);
          const store = tx.objectStore(STORE_NAME);
          let settled = false;

          function finish(fn, value) {
            if (settled) return;
            settled = true;
            fn(value);
          }

          tx.oncomplete = function () {
            if (!settled) finish(resolve);
          };
          tx.onerror = function () {
            finish(reject, tx.error || new Error('Attachment database transaction failed'));
          };
          tx.onabort = function () {
            finish(reject, tx.error || new Error('Attachment database transaction aborted'));
          };

          try {
            callback(store, resolve, reject, finish);
          } catch (error) {
            finish(reject, error);
          }
        });
      });
    }

    function buildAttachmentId(prefix) {
      const head = String(prefix || 'att').trim().toLowerCase() || 'att';
      const stamp = Date.now().toString(36);
      const bytes = new Uint8Array(6);
      if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
        window.crypto.getRandomValues(bytes);
      } else {
        attachmentCounter = (attachmentCounter + 1) % 0xffffff;
        const seed = String(Date.now()) + ':' + String(attachmentCounter) + ':' + String((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : 0);
        for (let index = 0; index < bytes.length; index += 1) {
          const code = seed.charCodeAt(index % seed.length) || 0;
          bytes[index] = (code + (index * 37) + attachmentCounter) % 256;
        }
      }
      const salt = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      return head + '_' + stamp + '_' + salt;
    }

    function getFileExtension(name) {
      const clean = String(name || '').trim();
      const match = clean.match(/\.([^.]+)$/);
      return match ? String(match[1] || '').toLowerCase() : '';
    }

    function buildUploadSignature(meta) {
      const name = String(meta && meta.name || '').trim().toLowerCase();
      const size = Number(meta && meta.size || 0);
      const type = String(meta && meta.type || '').trim().toLowerCase();
      return [name, size, type].join('::');
    }

    function normalizeLegacyAttachmentName(name) {
      const clean = String(name || '').replace(/^\uFEFF/, '').trim();
      if (!clean) return '';
      return clean
        .replace(/^(?:att|trn|chk|car|uca)(?:[-_][a-z0-9]{4,}){2,}(?:[-_]+)/i, '')
        .replace(/^[a-z]{3,6}(?:[-_][a-z0-9]{4,}){2,}(?:[-_]+)/i, '')
        .trim() || clean;
    }

    function normalizeAttachmentDescriptor(entry, overrides) {
      const next = {
        attachmentId: String(entry && entry.attachmentId || overrides && overrides.attachmentId || '').trim(),
        driveItemId: String(entry && entry.driveItemId || overrides && overrides.driveItemId || '').trim(),
        name: normalizeLegacyAttachmentName(String(entry && entry.name || overrides && overrides.name || '')),
        type: String(entry && (entry.type || entry.contentType) || overrides && (overrides.type || overrides.contentType) || '').trim(),
        contentType: String(entry && (entry.contentType || entry.type) || overrides && (overrides.contentType || overrides.type) || '').trim(),
        size: Number(entry && entry.size || overrides && overrides.size || 0),
        extension: String(entry && entry.extension || overrides && overrides.extension || getFileExtension(entry && entry.name || '')).trim().toLowerCase(),
        signature: String(entry && entry.signature || overrides && overrides.signature || buildUploadSignature(entry || overrides || {})).trim(),
        storedAt: String(entry && entry.storedAt || overrides && overrides.storedAt || '').trim(),
        uploadedAt: String(entry && entry.uploadedAt || overrides && overrides.uploadedAt || '').trim(),
        scope: String(entry && entry.scope || overrides && overrides.scope || '').trim(),
        ownerId: String(entry && entry.ownerId || overrides && overrides.ownerId || '').trim(),
        recordType: String(entry && entry.recordType || overrides && overrides.recordType || '').trim(),
        webUrl: String(entry && entry.webUrl || overrides && overrides.webUrl || '').trim(),
        downloadUrl: String(entry && entry.downloadUrl || overrides && overrides.downloadUrl || '').trim(),
        path: String(entry && entry.path || overrides && overrides.path || '').trim(),
        storage: String(entry && entry.storage || overrides && overrides.storage || '').trim()
      };
      if (!next.storedAt && next.uploadedAt) next.storedAt = next.uploadedAt;
      if (!next.uploadedAt && next.storedAt) next.uploadedAt = next.storedAt;
      if (!next.storage) next.storage = next.driveItemId || next.downloadUrl || next.webUrl ? 'm365' : 'local';
      return next;
    }

    function dataUrlToBlob(dataUrl) {
      const raw = String(dataUrl || '').trim();
      const match = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
      if (!match) throw new Error('Invalid data URL');
      const mime = match[1] || 'application/octet-stream';
      const payload = match[3] || '';
      if (match[2]) {
        const binary = atob(payload);
        const length = binary.length;
        const bytes = new Uint8Array(length);
        for (let index = 0; index < length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return new Blob([bytes], { type: mime });
      }
      return new Blob([decodeURIComponent(payload)], { type: mime });
    }

    function readStoredBlob(id) {
      const attachmentId = String(id || '').trim();
      if (!attachmentId) return Promise.resolve(null);
      return runStoreRequest('readonly', (store, resolve, reject, finish) => {
        const request = store.get(attachmentId);
        request.onsuccess = function () {
          const result = request.result;
          finish(resolve, result && result.blob ? result.blob : null);
        };
        request.onerror = function () {
          finish(reject, request.error || new Error('Failed to read attachment blob'));
        };
      });
    }

    function writeStoredBlob(blob, descriptor) {
      const attachment = normalizeAttachmentDescriptor(descriptor);
      return runStoreRequest('readwrite', (store, resolve, reject, finish) => {
        const request = store.put({
          id: attachment.attachmentId,
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          extension: attachment.extension,
          signature: attachment.signature,
          storedAt: attachment.storedAt,
          scope: attachment.scope,
          ownerId: attachment.ownerId,
          blob
        });
        request.onsuccess = function () {
          finish(resolve, attachment);
        };
        request.onerror = function () {
          finish(reject, request.error || new Error('Failed to write attachment blob'));
        };
      });
    }

    function deleteStoredBlob(id) {
      const attachmentId = String(id || '').trim();
      if (!attachmentId) return Promise.resolve();
      return runStoreRequest('readwrite', (store, resolve, reject, finish) => {
        const request = store.delete(attachmentId);
        request.onsuccess = function () {
          finish(resolve);
        };
        request.onerror = function () {
          finish(reject, request.error || new Error('Failed to delete attachment blob'));
        };
      });
    }

    function listStoredAttachments() {
      return runStoreRequest('readonly', (store, resolve, reject, finish) => {
        const request = store.getAll();
        request.onsuccess = function () {
          const records = Array.isArray(request.result) ? request.result : [];
          finish(resolve, records.map((record) => ({
            attachmentId: String(record && record.id || '').trim(),
            name: String(record && record.name || '').trim(),
            type: String(record && record.type || '').trim(),
            size: Number(record && record.size || (record && record.blob && record.blob.size) || 0),
            extension: String(record && record.extension || '').trim(),
            signature: String(record && record.signature || '').trim(),
            storedAt: String(record && record.storedAt || '').trim(),
            scope: String(record && record.scope || '').trim(),
            ownerId: String(record && record.ownerId || '').trim(),
            storage: 'local'
          })));
        };
        request.onerror = function () {
          finish(reject, request.error || new Error('Failed to list attachments'));
        };
      });
    }

    async function getAttachmentHealth(referencedIds) {
      const records = await listStoredAttachments();
      const referenced = new Set((Array.isArray(referencedIds) ? referencedIds : []).map((id) => String(id || '').trim()).filter(Boolean));
      const orphaned = records.filter((record) => !referenced.has(record.attachmentId));
      const linked = records.filter((record) => referenced.has(record.attachmentId));
      return {
        database: DB_NAME,
        generatedAt: new Date().toISOString(),
        totalAttachments: records.length,
        referencedAttachments: linked.length,
        orphanAttachments: orphaned.length,
        totalBytes: records.reduce((sum, record) => sum + Number(record.size || 0), 0),
        orphanBytes: orphaned.reduce((sum, record) => sum + Number(record.size || 0), 0),
        records,
        orphaned
      };
    }

    async function pruneUnusedAttachments(referencedIds) {
      const referenced = new Set((Array.isArray(referencedIds) ? referencedIds : []).map((id) => String(id || '').trim()).filter(Boolean));
      const records = await listStoredAttachments();
      const orphaned = records.filter((record) => !referenced.has(record.attachmentId));
      for (const record of orphaned) {
        await deleteStoredBlob(record.attachmentId);
      }
      return {
        removedCount: orphaned.length,
        removedBytes: orphaned.reduce((sum, record) => sum + Number(record.size || 0), 0),
        removedIds: orphaned.map((record) => record.attachmentId)
      };
    }

    function cleanupContainerUrls(container) {
      const urls = CONTAINER_URLS.get(container) || [];
      urls.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) { }
        ACTIVE_URLS.delete(url);
      });
      CONTAINER_URLS.delete(container);
    }

    function cleanupRenderedAttachmentUrls() {
      Array.from(ACTIVE_URLS).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) { }
        ACTIVE_URLS.delete(url);
      });
    }

    function createTransientUploadEntry(file, meta, options) {
      const descriptor = normalizeAttachmentDescriptor(meta, {
        name: file && file.name || '',
        type: file && file.type || '',
        size: file && file.size || 0,
        extension: getFileExtension(file && file.name || ''),
        signature: buildUploadSignature({
          name: file && file.name || '',
          type: file && file.type || '',
          size: file && file.size || 0
        }),
        scope: options && options.scope || '',
        ownerId: options && options.ownerId || '',
        storedAt: ''
      });
      return {
        ...descriptor,
        file,
        transient: true,
        previewUrl: URL.createObjectURL(file)
      };
    }

    function revokeTransientUploadEntry(entry) {
      if (entry && entry.previewUrl) {
        try { URL.revokeObjectURL(entry.previewUrl); } catch (_) { }
      }
    }

    async function persistUploadedEntries(entries, options) {
      const list = Array.isArray(entries) ? entries : [];
      const persisted = [];
      for (const entry of list) {
        if (!entry) continue;
        if (entry.attachmentId && !entry.file && !entry.data) {
          persisted.push(normalizeAttachmentDescriptor(entry, {
            scope: options && options.scope || entry.scope || '',
            ownerId: options && options.ownerId || entry.ownerId || ''
          }));
          continue;
        }

        let blob = null;
        if (entry.file instanceof Blob) {
          blob = entry.file;
        } else if (typeof entry.data === 'string' && entry.data.startsWith('data:')) {
          blob = dataUrlToBlob(entry.data);
        }
        if (!blob) continue;

        const descriptor = normalizeAttachmentDescriptor(entry, {
          attachmentId: buildAttachmentId(options && options.prefix || 'att'),
          storedAt: new Date().toISOString(),
          scope: options && options.scope || entry.scope || '',
          ownerId: options && options.ownerId || entry.ownerId || ''
        });
        const saved = await writeStoredBlob(blob, descriptor);
        if (entry.file || entry.previewUrl) revokeTransientUploadEntry(entry);
        persisted.push(saved);
      }
      return persisted;
    }

    async function migrateStoredAttachments(entries, options) {
      const list = Array.isArray(entries) ? entries : [];
      let changed = false;
      const persisted = [];
      for (const entry of list) {
        if (!entry) continue;
        if (entry.attachmentId && !entry.data && !entry.file && !entry.previewUrl) {
          persisted.push(normalizeAttachmentDescriptor(entry, {
            scope: options && options.scope || entry.scope || '',
            ownerId: options && options.ownerId || entry.ownerId || ''
          }));
          continue;
        }
        changed = true;
        const migrated = await persistUploadedEntries([entry], options);
        if (migrated.length) persisted.push(migrated[0]);
      }
      return {
        files: persisted,
        changed
      };
    }

    async function resolveRemoteAttachmentDescriptor(descriptor) {
      const detailFetcher = typeof fetchRemoteAttachmentDetail === 'function' ? fetchRemoteAttachmentDetail : null;
      if (!descriptor || !descriptor.driveItemId || !detailFetcher) return descriptor;
      try {
        const remote = await detailFetcher(descriptor);
        return normalizeAttachmentDescriptor(remote, descriptor);
      } catch (_) {
        return descriptor;
      }
    }

    function getRemoteBlobCacheKey(descriptor) {
      return String(descriptor && descriptor.driveItemId || '').trim();
    }

    async function fetchProtectedRemoteBlob(descriptor) {
      const blobFetcher = typeof fetchRemoteAttachmentBlob === 'function' ? fetchRemoteAttachmentBlob : null;
      const cacheKey = getRemoteBlobCacheKey(descriptor);
      if (!descriptor || !cacheKey || !blobFetcher) return null;
      if (!REMOTE_BLOB_CACHE.has(cacheKey)) {
        REMOTE_BLOB_CACHE.set(cacheKey, Promise.resolve().then(() => blobFetcher(descriptor)));
      }
      try {
        return await REMOTE_BLOB_CACHE.get(cacheKey);
      } catch (error) {
        REMOTE_BLOB_CACHE.delete(cacheKey);
        throw error;
      }
    }

    async function buildRenderModel(entry) {
      const descriptor = await resolveRemoteAttachmentDescriptor(normalizeAttachmentDescriptor(entry));
      if (entry && entry.previewUrl) {
        return {
          entry,
          descriptor,
          url: entry.previewUrl,
          isImage: descriptor.type.startsWith('image/')
        };
      }
      if (entry && typeof entry.data === 'string' && entry.data.startsWith('data:')) {
        return {
          entry,
          descriptor,
          url: entry.data,
          isImage: descriptor.type.startsWith('image/')
        };
      }
      const remoteDownloadUrl = String(descriptor.downloadUrl || '').trim();
      const remoteWebUrl = String(descriptor.webUrl || '').trim();
      const remoteUrl = remoteDownloadUrl || remoteWebUrl;
      if (remoteUrl) {
        return {
          entry,
          descriptor,
          url: remoteUrl,
          previewUrl: remoteWebUrl || remoteDownloadUrl,
          downloadUrl: remoteDownloadUrl || remoteWebUrl,
          requiresProtectedFetch: !!(descriptor.driveItemId && typeof fetchRemoteAttachmentBlob === 'function'),
          isImage: String(descriptor.contentType || descriptor.type || '').startsWith('image/')
        };
      }
      if (!descriptor.attachmentId) {
        return {
          entry,
          descriptor,
          url: '',
          isImage: false
        };
      }
      const blob = await readStoredBlob(descriptor.attachmentId);
      if (!blob) {
        return {
          entry,
          descriptor,
          url: '',
          isImage: false
        };
      }
      const url = URL.createObjectURL(blob);
      return {
        entry,
        descriptor,
        url,
        isImage: blob.type ? blob.type.startsWith('image/') : descriptor.type.startsWith('image/'),
        objectUrl: true
      };
    }

    async function renderAttachmentList(target, files, options) {
      const container = typeof target === 'string' ? document.getElementById(target) : target;
      if (!container) return;

      cleanupContainerUrls(container);
      const token = buildAttachmentId('render');
      container.dataset.attachmentRenderToken = token;

      const list = Array.isArray(files) ? files : [];
      const models = await Promise.all(list.map((entry) => buildRenderModel(entry)));
      if (container.dataset.attachmentRenderToken !== token) {
        models.forEach((model) => {
          if (model.objectUrl && model.url) {
            try { URL.revokeObjectURL(model.url); } catch (_) { }
          }
        });
        return;
      }

      const opts = options || {};
      const fileIconHtml = opts.fileIconHtml || '<div class="file-pdf-icon">FILE</div>';
      const previewLabel = opts.previewLabel || '預覽';
      const downloadLabel = opts.downloadLabel || '下載';
      const removeLabel = opts.removeLabel || '移除';
      const itemClass = opts.itemClass || 'file-preview-item';
      const actionsClass = opts.actionsClass || 'file-preview-actions';
      const emptyHtml = opts.emptyHtml || ('<p style="color:var(--text-muted);font-size:.88rem">' + esc(opts.emptyText || '尚未上傳文件') + '</p>');
      const urls = [];

      container.innerHTML = models.length ? models.map((model, index) => {
        if (model.objectUrl && model.url) {
          urls.push(model.url);
          ACTIVE_URLS.add(model.url);
        }
        const previewHtml = model.isImage && model.url
          ? '<img src="' + model.url + '" alt="' + esc(model.descriptor.name) + '">'
          : fileIconHtml;
        const previewUrl = model.previewUrl || model.url;
        const downloadUrl = model.downloadUrl || model.url;
        const previewAction = model.requiresProtectedFetch
          ? '<button type="button" class="btn btn-sm btn-secondary attachment-preview-remote" data-idx="' + index + '">' + previewLabel + '</button>'
          : (previewUrl ? '<a class="btn btn-sm btn-secondary" href="' + previewUrl + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">' + previewLabel + '</a>' : '');
        const downloadAction = model.requiresProtectedFetch
          ? '<button type="button" class="btn btn-sm btn-secondary attachment-download-remote" data-idx="' + index + '">' + downloadLabel + '</button>'
          : (downloadUrl ? '<a class="btn btn-sm btn-secondary" href="' + downloadUrl + '" download="' + esc(model.descriptor.name) + '">' + downloadLabel + '</a>' : '');
        const removeAction = opts.editable ? '<button type="button" class="btn btn-sm btn-danger attachment-remove" data-idx="' + index + '">' + removeLabel + '</button>' : '';
        return '<div class="' + itemClass + '">' + previewHtml + '<div class="file-name">' + esc(model.descriptor.name || '未命名檔案') + '</div><div class="' + actionsClass + '">' + previewAction + downloadAction + removeAction + '</div></div>';
      }).join('') : emptyHtml;

      CONTAINER_URLS.set(container, urls);

      if (opts.editable && typeof opts.onRemove === 'function') {
        container.querySelectorAll('.attachment-remove').forEach((button) => {
          button.addEventListener('click', () => {
            opts.onRemove(Number(button.dataset.idx));
          });
        });
      }
      async function openProtectedAttachment(index, download) {
        const buttonSelector = download ? '.attachment-download-remote' : '.attachment-preview-remote';
        const button = container.querySelector(buttonSelector + '[data-idx="' + index + '"]');
        const model = models[index];
        if (!model) return;
        if (button) button.disabled = true;
        try {
          const remote = await fetchProtectedRemoteBlob(model.descriptor);
          if (!remote || !(remote.blob instanceof Blob)) throw new Error('附件內容不存在');
          const objectUrl = URL.createObjectURL(remote.blob);
          urls.push(objectUrl);
          ACTIVE_URLS.add(objectUrl);
          if (download) {
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = model.descriptor.name || 'attachment';
            document.body.appendChild(link);
            link.click();
            link.remove();
          } else {
            window.open(objectUrl, '_blank', 'noopener,noreferrer');
          }
        } catch (error) {
          toast(String(error && error.message || error || '附件讀取失敗'), 'error');
        } finally {
          if (button) button.disabled = false;
        }
      }
      container.querySelectorAll('.attachment-preview-remote').forEach((button) => {
        button.addEventListener('click', () => {
          openProtectedAttachment(Number(button.dataset.idx), false);
        });
      });
      container.querySelectorAll('.attachment-download-remote').forEach((button) => {
        button.addEventListener('click', () => {
          openProtectedAttachment(Number(button.dataset.idx), true);
        });
      });
    }

    function readAttachmentPreviewData(entry) {
      if (entry && typeof entry.data === 'string' && entry.data.startsWith('data:')) {
        return Promise.resolve(entry.data);
      }
      if (entry && entry.previewUrl) return Promise.resolve(entry.previewUrl);
      const descriptor = normalizeAttachmentDescriptor(entry);
      if (descriptor.downloadUrl || descriptor.webUrl) {
        return Promise.resolve(descriptor.downloadUrl || descriptor.webUrl);
      }
      if (!descriptor.attachmentId) return Promise.resolve('');
      return readStoredBlob(descriptor.attachmentId).then((blob) => {
        if (!blob) return '';
        return URL.createObjectURL(blob);
      });
    }

    async function clearAttachmentDatabase() {
      cleanupRenderedAttachmentUrls();
      if (dbPromise) {
        try {
          const db = await dbPromise;
          db.close();
        } catch (_) { }
        dbPromise = null;
      }
      return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
          resolve();
          return;
        }
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { resolve(); };
        request.onblocked = function () { resolve(); };
      });
    }

    if (typeof window !== 'undefined') {
      window.__ATTACHMENT_DB_NAME__ = DB_NAME;
    }

    return {
      DB_NAME,
      buildAttachmentId,
      buildUploadSignature,
      clearAttachmentDatabase,
      cleanupRenderedAttachmentUrls,
      createTransientUploadEntry,
      deleteStoredBlob,
      getAttachmentHealth,
      listStoredAttachments,
      migrateStoredAttachments,
      persistUploadedEntries,
      pruneUnusedAttachments,
      readStoredBlob,
      readAttachmentPreviewData,
      renderAttachmentList,
      revokeTransientUploadEntry
    };
  };
})();
