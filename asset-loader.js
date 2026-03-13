(function () {
  var cacheKey = String(Date.now());
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
    'auth-module.js',
    'unit-module.js',
    'ui-module.js',
    'policy-module.js',
    'workflow-support-module.js',
    'm365-api-client.js',
    'shell-module.js',
    'case-module.js',
    'admin-module.js',
    'checklist-module.js',
    'training-module.js',
    'unit-contact-application-module.js',
    'app.js'
  ];
  var index = 0;

  window.__APP_ASSET_VERSION__ = cacheKey;

  function appendLink(rel, href, type) {
    var link = document.createElement('link');
    link.rel = rel;
    link.href = href + '?v=' + cacheKey;
    if (type) link.type = type;
    head.appendChild(link);
  }

  function loadNextScript() {
    if (index >= assets.length) return;
    var mount = body || document.body || head;
    var assetEntry = assets[index];
    var assetSrc = typeof assetEntry === 'string' ? assetEntry : assetEntry.src;
    var optional = !!(assetEntry && typeof assetEntry === 'object' && assetEntry.optional);

    var script = document.createElement('script');
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

  function bootstrap() {
    appendLink('icon', 'favicon.svg', 'image/svg+xml');
    appendLink('stylesheet', 'styles.css');
    loadNextScript();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
