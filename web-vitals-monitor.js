// @ts-check
(function () {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  const metrics = {};

  // LCP
  try {
    new PerformanceObserver(function (list) {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) metrics.lcp = Math.round(last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}

  // FID
  try {
    new PerformanceObserver(function (list) {
      const entry = list.getEntries()[0];
      if (entry) metrics.fid = Math.round(entry.processingStart - entry.startTime);
    }).observe({ type: 'first-input', buffered: true });
  } catch (_) {}

  // CLS
  try {
    let clsValue = 0;
    new PerformanceObserver(function (list) {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) clsValue += entry.value;
      }
      metrics.cls = Math.round(clsValue * 1000) / 1000;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (_) {}

  // Report after page is fully loaded
  window.addEventListener('load', function () {
    setTimeout(function () {
      metrics.ttfb = Math.round(performance.timing.responseStart - performance.timing.requestStart);
      metrics.domReady = Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart);
      window.__WEB_VITALS__ = metrics;
      console.log('[web-vitals]', JSON.stringify(metrics));
    }, 3000);
  });
})();
