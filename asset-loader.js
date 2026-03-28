(function () {
  var initialBuildInfo = window.__APP_BUILD_INFO__ && typeof window.__APP_BUILD_INFO__ === 'object'
    ? window.__APP_BUILD_INFO__
    : {};
  var cacheKey = String(initialBuildInfo.versionKey || initialBuildInfo.shortCommit || Date.now());
  var head = document.head;
  var body = document.body;
  var assets = [
    'vendor/lucide.min.js',
    'vendor/xlsx.full.min.js',
    'units.js',
    { src: 'm365-config.override.js', optional: true },
    'm365-config.js',
    'attachment-module.js',
    'data-module.js',
    'collection-cache-module.js',
    'cache-invalidation-module.js',
    'auth-module.js',
    'unit-module.js',
    'ui-module.js',
    'policy-module.js',
    'workflow-support-module.js',
    'collection-contract-module.js',
    'm365-api-client.js',
    'shell-module.js',
    'service-registry-module.js',
    'app-core-service-module.js',
    'app-bootstrap-access-module.js',
    'app-bootstrap-state-module.js',
    'app-service-access-module.js',
    'app-route-module.js',
    'app-page-orchestration-module.js',
    'app-visibility-module.js',
    'app-action-module.js',
    'app-shell-orchestration-module.js',
    'app-entry-module.js',
    'app-auth-session-module.js',
    'app-router-module.js',
    'app-bootstrap-module.js',
    'case-module.js',
    'admin-collection-cache-module.js',
    'admin-module.js',
    'checklist-module.js',
    'training-module.js',
    'unit-contact-application-module.js',
    'app.js'
  ];
  var index = 0;
  var integrityMap = {};
  var manifestPromise = null;

  window.__APP_BUILD_INFO__ = initialBuildInfo;
  window.__APP_ASSET_VERSION__ = cacheKey;

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
    if (type) link.type = type;
    applyIntegrity(link, href);
    head.appendChild(link);
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
        console.warn('Failed to load asset manifest:', error && error.message ? error.message : error);
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
      if (!optional) {
        console.error('Failed to load asset:', script.src);
      }
      index += 1;
      loadNextScript();
    };
    mount.appendChild(script);
  }

  async function bootstrap() {
    await loadManifest();
    appendLink('icon', 'favicon.svg', 'image/svg+xml');
    appendLink('stylesheet', 'styles.css');
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
