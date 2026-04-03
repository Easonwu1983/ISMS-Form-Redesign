// @ts-check
(function () {
  window.createAppRouteModule = function createAppRouteModule(deps) {
    const options = deps && typeof deps === 'object' ? deps : {};
    const ROUTE_WHITELIST = options.ROUTE_WHITELIST || {};
    const DEFAULT_TITLE = String(options.defaultTitle || '內部稽核管考追蹤系統');

    function normalizeRouteParamValue(value) {
      const raw = String(value || '').trim();
      if (!raw || raw === 'undefined' || raw === 'null') return '';
      return raw;
    }

    function getRoute() {
      const h = window.location.hash.slice(1) || 'dashboard';
      const p = h.split('/');
      let param = normalizeRouteParamValue(p[1]);
      if (param) {
        try { param = normalizeRouteParamValue(decodeURIComponent(param)); } catch (_) { param = ''; }
      }
      return { page: p[0], param: param };
    }

    function getRouteMeta(page) {
      return ROUTE_WHITELIST[page] || ROUTE_WHITELIST.dashboard;
    }

    function getRouteTitle(page) {
      return getRouteMeta(page).title || DEFAULT_TITLE;
    }

    function canAccessRoute(page, routeParam) {
      const meta = getRouteMeta(page);
      if (!meta || typeof meta.allow !== 'function') return true;
      if (meta.requiresParam && !normalizeRouteParamValue(routeParam)) return false;
      try { return !!meta.allow(); } catch (_) { return false; }
    }

    function getRouteFallback(page) {
      const meta = getRouteMeta(page);
      return meta && meta.fallback ? meta.fallback : 'dashboard';
    }

    function getRouteManifest() {
      return Object.keys(ROUTE_WHITELIST).reduce(function (acc, page) {
        acc[page] = {
          title: ROUTE_WHITELIST[page].title,
          fallback: ROUTE_WHITELIST[page].fallback || null
        };
        return acc;
      }, {});
    }

    return {
      normalizeRouteParamValue: normalizeRouteParamValue,
      getRoute: getRoute,
      getRouteMeta: getRouteMeta,
      getRouteTitle: getRouteTitle,
      canAccessRoute: canAccessRoute,
      getRouteFallback: getRouteFallback,
      getRouteManifest: getRouteManifest
    };
  };
})();
