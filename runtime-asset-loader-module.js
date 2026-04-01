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

    function normalizeAppendScriptOptions(globalKeyOrOptions) {
      if (typeof globalKeyOrOptions === 'string') {
        return {
          globalKey: globalKeyOrOptions,
          scriptType: 'classic'
        };
      }
      const options = globalKeyOrOptions && typeof globalKeyOrOptions === 'object' ? globalKeyOrOptions : {};
      return {
        globalKey: String(options.globalKey || '').trim(),
        scriptType: String(options.type || options.scriptType || 'classic').trim().toLowerCase() === 'module' ? 'module' : 'classic'
      };
    }

    function appendScript(assetPath, globalKeyOrOptions) {
      if (typeof document === 'undefined') {
        return Promise.reject(new Error('document unavailable'));
      }
      const normalizedPath = normalizeAssetPath(assetPath);
      const options = normalizeAppendScriptOptions(globalKeyOrOptions);
      const globalKey = options.globalKey;
      const scriptType = options.scriptType;
      const inflightKey = normalizedPath + '::' + scriptType;
      if (!normalizedPath) {
        return Promise.reject(new Error('asset path unavailable'));
      }
      if (globalKey && typeof window !== 'undefined' && window[globalKey]) {
        return Promise.resolve(window[globalKey]);
      }
      if (inflightScripts.has(inflightKey)) {
        return inflightScripts.get(inflightKey);
      }
      const existing = document.querySelector(`script[data-runtime-asset="${normalizedPath}"][data-runtime-type="${scriptType}"]`);
      const promise = new Promise(function (resolve, reject) {
        function markLoaded(scriptNode) {
          if (!scriptNode || !scriptNode.dataset) return;
          scriptNode.dataset.runtimeLoaded = 'true';
          delete scriptNode.dataset.runtimeError;
        }

        function markErrored(scriptNode) {
          if (!scriptNode || !scriptNode.dataset) return;
          scriptNode.dataset.runtimeError = 'true';
          delete scriptNode.dataset.runtimeLoaded;
        }

        function resolveLoaded() {
          if (existing) markLoaded(existing);
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
          scriptNode.addEventListener('load', function () {
            markLoaded(scriptNode);
            resolveLoaded();
          }, { once: true });
          scriptNode.addEventListener('error', function () {
            markErrored(scriptNode);
            reject(new Error('Failed to load ' + normalizedPath));
          }, { once: true });
        }

        if (existing) {
          if (existing.dataset && existing.dataset.runtimeLoaded === 'true') {
            resolveLoaded();
            return;
          }
          if (existing.dataset && existing.dataset.runtimeError === 'true') {
            reject(new Error('Failed to load ' + normalizedPath));
            return;
          }
          if (globalKey && typeof window !== 'undefined' && window[globalKey]) {
            markLoaded(existing);
            resolveLoaded();
            return;
          }
          attachListeners(existing);
          return;
        }

        const script = document.createElement('script');
        script.dataset.runtimeType = scriptType;
        if (scriptType === 'module') {
          script.type = 'module';
        } else {
          script.async = true;
          script.defer = true;
        }
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
        inflightScripts.delete(inflightKey);
      });
      inflightScripts.set(inflightKey, promise);
      return promise;
    }

    function ensureXlsxLoaded() {
      if (typeof window !== 'undefined' && window.XLSX) return Promise.resolve(window.XLSX);
      return appendScript('vendor/xlsx.full.min.js', 'XLSX');
    }

    function ensureLucideLoaded() {
      if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
        return Promise.resolve(window.lucide);
      }
      return appendScript('vendor/lucide.min.js', 'lucide');
    }

    function loadScriptsParallel(specs) {
      if (!Array.isArray(specs) || !specs.length) return Promise.resolve([]);
      return Promise.all(specs.map(function (spec) {
        if (typeof spec === 'string') return appendScript(spec);
        return appendScript(spec.path || spec.src, spec.globalKey || spec.options);
      }));
    }

    return {
      appendScript: appendScript,
      loadScriptsParallel: loadScriptsParallel,
      ensureXlsxLoaded: ensureXlsxLoaded,
      ensureLucideLoaded: ensureLucideLoaded
    };
  };
})();
