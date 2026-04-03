// @ts-check
(function () {
  var initialBuildInfo = window.__APP_BUILD_INFO__ && typeof window.__APP_BUILD_INFO__ === 'object'
    ? window.__APP_BUILD_INFO__
    : {};
  var cacheKey = String(initialBuildInfo.versionKey || initialBuildInfo.shortCommit || Date.now());
  var head = document.head;
  var body = document.body;
  var coreBundleSrc = 'app-core.bundle.min.js';
  var criticalStylesheet = 'styles.critical.min.css';
  var purgedStylesheet = 'styles.purged.min.css';
  var minifiedStylesheet = 'styles.min.css';
  var assets = [
    { src: 'm365-config.override.js', optional: true },
    coreBundleSrc
  ];
  var fallbackAssets = [
    'm365-config.js',
    'data-module.js',
    'collection-cache-module.js',
    'runtime-asset-loader-module.js',
    'cache-invalidation-module.js',
    'auth-module.js',
    'unit-module.js',
    'ui-module.js',
    'policy-module.js',
    'workflow-support-module.js',
    'collection-contract-module.js',
    'm365-api-client.js',
    'shell-module.js',
    'app-ui-bridge-module.js',
    'app-domain-bridge-module.js',
    'app-training-checklist-bridge-module.js',
    'app-domain-training-runtime-module.js',
    'app-feature-runtime-module.js',
    'service-registry-module.js',
    'app-core-service-module.js',
    'app-runtime-service-module.js',
    'app-runtime-access-module.js',
    'app-bootstrap-access-module.js',
    'app-bootstrap-wiring-module.js',
    'app-bootstrap-state-module.js',
    'app-service-access-module.js',
    'app-route-module.js',
    'app-page-orchestration-module.js',
    'app-visibility-module.js',
    'app-action-module.js',
    'app-shell-orchestration-module.js',
    'app-shell-runtime-module.js',
    'app-page-shell-runtime-module.js',
    'app-entry-module.js',
    'app-entry-runtime-module.js',
    'app-auth-session-module.js',
    'app-auth-session-runtime-module.js',
  'app-remote-runtime-module.js',
  'app-bridge-runtime-module.js',
  'app-attachment-migration-module.js',
    'app-router-module.js',
    'app-router-runtime-module.js',
    'app-start-runtime-module.js',
    'app-bootstrap-module.js',
    'app-core-module-access-module.js',
    'app-support-bridge-module.js',
    'app-remote-bridge-module.js',
    'app-auth-remote-module.js',
    'app.js'
  ];
  var coreBundleFallbackActive = false;
  var index = 0;
  var integrityMap = {};
  var manifestPromise = null;
  var nativeConsole = window.console && typeof window.console === 'object' ? window.console : {};
  var runtimeLogBuffer = Array.isArray(window.__ISMS_RUNTIME_LOG__) ? window.__ISMS_RUNTIME_LOG__ : [];
  var runtimeLogLimit = 200;

  window.__APP_BUILD_INFO__ = initialBuildInfo;
  window.__APP_ASSET_VERSION__ = cacheKey;
  window.__ISMS_RUNTIME_LOG__ = runtimeLogBuffer;

  function shouldMirrorRuntimeLogs() {
    try {
      var search = window.location && typeof window.location.search === 'string' ? window.location.search : '';
      var hostname = window.location && typeof window.location.hostname === 'string' ? window.location.hostname : '';
      if (/(^|[?&])debugLog=1(?:&|$)/.test(search)) return true;
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true;
      if (window.localStorage && window.localStorage.getItem('isms:debug-log') === '1') return true;
    } catch (_) {}
    return false;
  }

  function serializeRuntimeArg(value) {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack || ''
      };
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null) {
      return value;
    }
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return String(value);
    }
  }

  function emitRuntimeLog(level, argsLike) {
    var args = Array.prototype.slice.call(argsLike || []);
    runtimeLogBuffer.push({
      level: String(level || 'log'),
      time: new Date().toISOString(),
      args: args.map(serializeRuntimeArg)
    });
    if (runtimeLogBuffer.length > runtimeLogLimit) {
      runtimeLogBuffer.splice(0, runtimeLogBuffer.length - runtimeLogLimit);
    }
    if (!shouldMirrorRuntimeLogs()) return;
    var sink = nativeConsole[level];
    if (typeof sink === 'function') {
      sink.apply(nativeConsole, args);
    }
  }

  window.__ismsLog = function () { emitRuntimeLog('log', arguments); };
  window.__ismsWarn = function () { emitRuntimeLog('warn', arguments); };
  window.__ismsError = function () { emitRuntimeLog('error', arguments); };

  // ── Observability: global error handler + route tracking ──
  window.onerror = function (msg, src, line, col) {
    try { window.__ismsError('[unhandled]', msg, src + ':' + line + ':' + col); } catch (_) {}
  };
  window.addEventListener('unhandledrejection', function (event) {
    try { window.__ismsError('[promise]', String(event && event.reason && event.reason.message || event && event.reason || 'unknown')); } catch (_) {}
  });
  // Route tracking: log page views
  window.addEventListener('hashchange', function () {
    try {
      var page = (window.location.hash || '#dashboard').slice(1).split('/')[0];
      window.__ismsLog('[page]', page, new Date().toISOString());
    } catch (_) {}
  });

  function normalizeAssetPath(assetPath) {
    return String(assetPath || '').replace(/^\.?\//, '').replace(/\?.*$/, '');
  }

  function getAssetIntegrity(assetPath) {
    return integrityMap[normalizeAssetPath(assetPath)] || '';
  }

  function applyIntegrity(node, assetPath) {
    var integrity = getAssetIntegrity(assetPath);
    if (integrity) {
      node.integrity = integrity;
      node.crossOrigin = 'anonymous';
    }
  }

  function shouldLoadManifest() {
    return true;
  }

  function appendLink(rel, href, type) {
    var link = document.createElement('link');
    link.rel = rel;
    link.href = href + '?v=' + cacheKey;
    if (rel === 'preload') {
      link.as = type || 'script';
    } else if (type) {
      link.type = type;
    }
    applyIntegrity(link, href);
    head.appendChild(link);
  }

  function appendStylesheetChain(hrefs) {
    var remaining = Array.isArray(hrefs) ? hrefs.filter(Boolean) : [];
    if (!remaining.length) return;
    var currentHref = remaining.shift();
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.media = 'print';
    link.href = currentHref + '?v=' + cacheKey;
    applyIntegrity(link, currentHref);
    link.onload = function () {
      link.media = 'all';
    };
    link.onerror = function () {
      appendStylesheetChain(remaining);
    };
    head.appendChild(link);
  }

  function ensureCriticalStylesheet() {
    if (document.querySelector('link[data-critical-styles]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = criticalStylesheet + '?v=' + cacheKey;
    link.setAttribute('data-critical-styles', '1');
    applyIntegrity(link, criticalStylesheet);
    head.insertBefore(link, head.firstChild || null);
  }

  function loadManifest() {
    if (manifestPromise) return manifestPromise;
    if (window.__APP_ASSET_MANIFEST__ && typeof window.__APP_ASSET_MANIFEST__ === 'object') {
      var cachedBuildInfo = window.__APP_ASSET_MANIFEST__.buildInfo && typeof window.__APP_ASSET_MANIFEST__.buildInfo === 'object'
        ? window.__APP_ASSET_MANIFEST__.buildInfo
        : initialBuildInfo;
      if (cachedBuildInfo && typeof cachedBuildInfo === 'object') {
        cacheKey = String(cachedBuildInfo.versionKey || cacheKey);
        window.__APP_BUILD_INFO__ = cachedBuildInfo;
      }
      integrityMap = (window.__APP_ASSET_MANIFEST__.assetIntegrity && typeof window.__APP_ASSET_MANIFEST__.assetIntegrity === 'object')
        ? window.__APP_ASSET_MANIFEST__.assetIntegrity
        : {};
      window.__APP_ASSET_INTEGRITY__ = integrityMap;
      manifestPromise = Promise.resolve(window.__APP_ASSET_MANIFEST__);
      return manifestPromise;
    }
    manifestPromise = fetch('deploy-manifest.json?v=' + cacheKey, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('manifest load failed: ' + response.status);
        return response.json();
      })
      .then(function (manifest) {
        integrityMap = (manifest && manifest.assetIntegrity && typeof manifest.assetIntegrity === 'object') ? manifest.assetIntegrity : {};
        if (manifest && manifest.buildInfo && typeof manifest.buildInfo === 'object') {
          cacheKey = String(manifest.buildInfo.versionKey || cacheKey);
          window.__APP_BUILD_INFO__ = manifest.buildInfo;
        }
        window.__APP_ASSET_MANIFEST__ = manifest || {};
        window.__APP_ASSET_INTEGRITY__ = integrityMap;
        window.__APP_ASSET_VERSION__ = cacheKey;
        return manifest;
      })
      .catch(function (error) {
        window.__ismsWarn('Failed to load asset manifest:', error && error.message ? error.message : error);
        integrityMap = {};
        window.__APP_ASSET_MANIFEST__ = window.__APP_ASSET_MANIFEST__ || {};
        window.__APP_ASSET_INTEGRITY__ = integrityMap;
        window.__APP_BUILD_INFO__ = window.__APP_BUILD_INFO__ && typeof window.__APP_BUILD_INFO__ === 'object' ? window.__APP_BUILD_INFO__ : initialBuildInfo;
        window.__APP_ASSET_VERSION__ = cacheKey;
        return null;
      });
    return manifestPromise;
  }

  function loadNextScript() {
    if (index >= assets.length) return;
    var mount = body || document.body || head;
    var assetEntry = assets[index];
    var assetSrc = typeof assetEntry === 'string' ? assetEntry : assetEntry.src;
    var optional = !!(assetEntry && typeof assetEntry === 'object' && assetEntry.optional);

    var script = document.createElement('script');
    applyIntegrity(script, assetSrc);
    script.src = assetSrc + '?v=' + cacheKey;
    script.async = false;
    script.onload = function () {
      var pending = window.__APP_PENDING_ASSET_PROMISE__;
      if (pending && typeof pending.then === 'function') {
        window.__APP_PENDING_ASSET_PROMISE__ = null;
        pending.finally(function () {
          index += 1;
          loadNextScript();
        });
        return;
      }
      index += 1;
      loadNextScript();
    };
    script.onerror = function () {
      if (!optional && !coreBundleFallbackActive && assetSrc === coreBundleSrc) {
        window.__ismsWarn('Falling back to legacy core asset chain:', script.src);
        coreBundleFallbackActive = true;
        assets = fallbackAssets.slice();
        index = 0;
        loadNextScript();
        return;
      }
      if (!optional) {
        window.__ismsError('Failed to load asset:', script.src);
      }
      index += 1;
      loadNextScript();
    };
    mount.appendChild(script);
  }

  async function bootstrap() {
    await loadManifest();
    appendLink('icon', 'favicon.svg', 'image/svg+xml');
    appendLink('preload', coreBundleSrc, 'script');
    ensureCriticalStylesheet();
    (window.requestAnimationFrame || window.setTimeout)(function () {
      appendStylesheetChain([purgedStylesheet, minifiedStylesheet, 'styles.css']);
    }, 0);
    // Prefetch feature bundles after main load completes
    window.addEventListener('load', function () {
      setTimeout(function () {
        ['admin-feature','case-feature','checklist-feature','training-feature','unit-contact-application-feature'].forEach(function (name) {
          var link = document.createElement('link');
          link.rel = 'prefetch';
          link.as = 'script';
          link.href = 'feature-bundles/' + name + '.js' + (cacheKey ? '?v=' + cacheKey : '');
          document.head.appendChild(link);
        });
      }, 1000);
    }, { once: true });
    assets.unshift('units.js');
    loadNextScript();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bootstrap();
    }, { once: true });
  } else {
    bootstrap();
  }
})();
