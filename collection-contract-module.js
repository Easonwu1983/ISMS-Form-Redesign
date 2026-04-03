// @ts-check
(function () {
  window.createCollectionContractModule = function createCollectionContractModule() {
    function cleanText(value) {
      return String(value || '').trim();
    }

    function normalizePage(page, total, query, fallbackLimit) {
      const source = page && typeof page === 'object' ? page : {};
      const queryObject = query && typeof query === 'object' ? query : {};
      const limit = Math.max(1, Number(source.limit || queryObject.limit || fallbackLimit || 50) || 50);
      const safeTotal = Math.max(0, Number(total) || 0);
      const offset = Math.max(0, Number(source.offset || queryObject.offset || 0) || 0);
      const pageCount = safeTotal > 0 ? Math.max(1, Math.ceil(safeTotal / limit)) : 0;
      const safeOffset = safeTotal > 0 ? Math.min(offset, Math.max(0, (pageCount - 1) * limit)) : 0;
      return {
        offset: safeOffset,
        limit: limit,
        total: safeTotal,
        pageCount: Number(source.pageCount || pageCount || 0),
        currentPage: Number(source.currentPage || (safeTotal > 0 ? Math.floor(safeOffset / limit) + 1 : 0)),
        hasPrev: Boolean(source.hasPrev || safeOffset > 0),
        hasNext: Boolean(source.hasNext || (safeTotal > 0 && (safeOffset + limit) < safeTotal)),
        prevOffset: Number(source.prevOffset || Math.max(0, safeOffset - limit) || 0),
        nextOffset: Number(source.nextOffset || ((safeTotal > 0 && (safeOffset + limit) < safeTotal) ? safeOffset + limit : safeOffset) || 0),
        pageStart: Number(source.pageStart || (safeTotal > 0 ? safeOffset + 1 : 0) || 0),
        pageEnd: Number(source.pageEnd || (safeTotal > 0 ? Math.min(safeOffset + limit, safeTotal) : 0) || 0)
      };
    }

    function normalizeFilters(bodyFilters, query) {
      if (bodyFilters && typeof bodyFilters === 'object') return { ...bodyFilters };
      return query && typeof query === 'object' ? { ...query } : {};
    }

    function normalizeCache(cache) {
      const source = cache && typeof cache === 'object' ? cache : {};
      return {
        query: cleanText(source.query),
        reason: cleanText(source.reason),
        summaryOnly: String(source.summaryOnly || '').trim() === '1' || source.summaryOnly === true
      };
    }

    function withSummaryOnly(query) {
      const filters = query && typeof query === 'object' ? { ...query } : {};
      filters.summaryOnly = '1';
      return filters;
    }

    function buildPagedCollectionResult(body, query, items, options) {
      const opts = options && typeof options === 'object' ? options : {};
      const list = Array.isArray(items) ? items : [];
      const total = Math.max(
        0,
        Number(body && body.total) || 0,
        opts.fallbackTotalFromItems === false ? 0 : list.length
      );
      const summary = body && body.summary && typeof body.summary === 'object'
        ? (typeof opts.normalizeSummary === 'function' ? opts.normalizeSummary(body.summary, body, list, total) : body.summary)
        : (typeof opts.buildSummary === 'function' ? opts.buildSummary(list, body, total) : null);
      return {
        ok: !!(body && body.ok !== false),
        mode: opts.mode || '',
        items: list,
        total: total,
        summary: summary,
        page: normalizePage(body && body.page, total, query, opts.defaultLimit),
        filters: normalizeFilters(body && body.filters, query),
        cache: normalizeCache(body && body.cache),
        generatedAt: cleanText(body && body.generatedAt),
        raw: body
      };
    }

    return {
      normalizePage: normalizePage,
      normalizeFilters: normalizeFilters,
      normalizeCache: normalizeCache,
      withSummaryOnly: withSummaryOnly,
      buildPagedCollectionResult: buildPagedCollectionResult
    };
  };
})();
