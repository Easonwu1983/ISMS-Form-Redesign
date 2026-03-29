(function () {
  window.createRuntimeAssetLoaderModule = function createRuntimeAssetLoaderModule() {
    const inflightScripts = new Map();

    function normalizeAssetPath(assetPath) {
      return String(assetPath || '')
        .trim()
        .replace(/^\.?\//, '')
        .replace(/\?.*$/, '');
    }

    function getAssetVersion() {
      if (typeof window === 'undefined') return '';
      const buildInfo = window.__APP_BUILD_INFO__ && typeof window.__APP_BUILD_INFO__ === 'object'
        ? window.__APP_BUILD_INFO__
        : {};
      return String(window.__APP_ASSET_VERSION__ || buildInfo.versionKey || buildInfo.shortCommit || '').trim();
    }

    function buildAssetUrl(assetPath) {
      const normalizedPath = normalizeAssetPath(assetPath);
      const version = getAssetVersion();
      if (!normalizedPath || !version) return normalizedPath;
      return normalizedPath + '?v=' + encodeURIComponent(version);
    }

    function getAssetIntegrity(assetPath) {
      if (typeof window === 'undefined') return '';
      const integrityMap = window.__APP_ASSET_INTEGRITY__ && typeof window.__APP_ASSET_INTEGRITY__ === 'object'
        ? window.__APP_ASSET_INTEGRITY__
        : {};
      return String(integrityMap[normalizeAssetPath(assetPath)] || '').trim();
    }

    function appendScript(assetPath, globalKey) {
      if (typeof document === 'undefined') {
        return Promise.reject(new Error('document unavailable'));
      }
      const normalizedPath = normalizeAssetPath(assetPath);
      if (!normalizedPath) {
        return Promise.reject(new Error('asset path unavailable'));
      }
      if (globalKey && typeof window !== 'undefined' && window[globalKey]) {
        return Promise.resolve(window[globalKey]);
      }
      if (inflightScripts.has(normalizedPath)) {
        return inflightScripts.get(normalizedPath);
      }
      const existing = document.querySelector(`script[data-runtime-asset="${normalizedPath}"]`);
      const promise = new Promise(function (resolve, reject) {
        function resolveLoaded() {
          if (globalKey && typeof window !== 'undefined') {
            if (!window[globalKey]) {
              reject(new Error(normalizedPath + ' loaded without ' + globalKey));
              return;
            }
            resolve(window[globalKey]);
            return;
          }
          resolve(true);
        }

        function attachListeners(scriptNode) {
          scriptNode.addEventListener('load', resolveLoaded, { once: true });
          scriptNode.addEventListener('error', function () {
            reject(new Error('Failed to load ' + normalizedPath));
          }, { once: true });
        }

        if (existing) {
          if (globalKey && typeof window !== 'undefined' && window[globalKey]) {
            resolveLoaded();
            return;
          }
          attachListeners(existing);
          return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.defer = true;
        script.src = buildAssetUrl(normalizedPath);
        script.dataset.runtimeAsset = normalizedPath;
        const integrity = getAssetIntegrity(normalizedPath);
        if (integrity) {
          script.integrity = integrity;
          script.crossOrigin = 'anonymous';
        }
        attachListeners(script);
        (document.body || document.head || document.documentElement).appendChild(script);
      }).finally(function () {
        inflightScripts.delete(normalizedPath);
      });
      inflightScripts.set(normalizedPath, promise);
      return promise;
    }

    function ensureXlsxLoaded() {
      if (typeof window !== 'undefined' && window.XLSX) return Promise.resolve(window.XLSX);
      return appendScript('vendor/xlsx.full.min.js', 'XLSX');
    }

    return {
      appendScript: appendScript,
      ensureXlsxLoaded: ensureXlsxLoaded
    };
  };
})();
