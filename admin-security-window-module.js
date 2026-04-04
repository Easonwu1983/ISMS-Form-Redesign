// @ts-check
/**
 * admin-security-window-module.js
 * Pure rendering helpers for the Security Window page.
 * Extracted from admin-module.js to reduce file size.
 *
 * Registers: window._adminSecurityWindow
 * Dependencies: window globals — esc, ic (from app-core.bundle)
 */
(function () {
  'use strict';

  var _escFn = null;
  var _icFn = null;
  function esc(s) { return (_escFn || (_escFn = window.__esc) || _escFallback)(s); }
  function ic(a, b) { return (_icFn || (_icFn = window.__ic) || _icFallback)(a, b); }
  function _escFallback(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] || c; }); }
  function _icFallback() { return ''; }
  function init(deps) { if (deps.esc) _escFn = deps.esc; if (deps.ic) _icFn = deps.ic; }

  var SECURITY_WINDOW_CATEGORY_ORDER = ['行政單位', '學術單位', '中心 / 研究單位'];

  var SECURITY_ROLE_OPTIONS = ['一級單位資安窗口', '二級單位資安窗口'];

  function normalizeSecurityRoles(value) {
    var rawValues = Array.isArray(value)
      ? value
      : String(value || '').split(/[\n,，]+/);
    return Array.from(new Set(rawValues.map(function (item) { return String(item || '').trim(); }).filter(function (item) { return SECURITY_ROLE_OPTIONS.includes(item); })));
  }

  function formatSecurityRolesSummary(value) {
    var roles = normalizeSecurityRoles(value);
    return roles.length ? roles.join('、') : '未指定';
  }

  function getSecurityWindowUnitStatusMeta(status) {
    var key = String(status || '').trim();
    if (key === 'assigned') return { label: '已設定', tone: 'approved' };
    if (key === 'pending') return { label: '待審核', tone: 'pending' };
    if (key === 'missing') return { label: '未設定', tone: 'danger' };
    if (key === 'exempted') return { label: '由一級單位統一', tone: 'closed' };
    return { label: key || '未知', tone: 'pending' };
  }

  function summarizeSecurityWindowCategoryItems(units, category) {
    var rows = Array.isArray(units) ? units : [];
    return {
      category: String(category || '').trim(),
      unitCount: rows.length,
      assignedCount: rows.filter(function (unit) { return unit && unit.hasWindow; }).length,
      pendingCount: rows.reduce(function (sum, unit) { return sum + (Array.isArray(unit && unit.pending) ? unit.pending.length : 0); }, 0),
      missingCount: rows.filter(function (unit) { return unit && !unit.hasWindow && !(Array.isArray(unit.pending) && unit.pending.length); }).length,
      childCount: rows.reduce(function (sum, unit) { return sum + (Array.isArray(unit && unit.children) ? unit.children.length : 0); }, 0)
    };
  }

  function normalizeSecurityWindowCategory(category) {
    var raw = String(category || '').trim();
    if (!raw) return null;
    if (SECURITY_WINDOW_CATEGORY_ORDER.includes(raw)) return raw;
    if (raw.includes('行政')) return '行政單位';
    if (raw.includes('學術')) return '學術單位';
    if (raw.includes('中心') || raw.includes('研究')) return '中心 / 研究單位';
    return null;
  }

  function groupSecurityWindowUnitsByCategory(units) {
    var groups = new Map();
    (Array.isArray(units) ? units : []).forEach(function (unit) {
      var category = normalizeSecurityWindowCategory(unit && unit.category);
      if (!category) return;
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(unit);
    });
    return SECURITY_WINDOW_CATEGORY_ORDER
      .map(function (category) { return { category: category, items: groups.get(category) || [] }; })
      .filter(function (group) { return Array.isArray(group.items) && group.items.length; });
  }

  // ─── Person badge / row renderers ──────────────────

  function renderSecurityWindowPersonBadge(person) {
    var roles = Array.isArray(person && person.securityRoles) ? person.securityRoles : [];
    if (!roles.length) return '<span class="badge-role badge-pending">未設定</span>';
    return roles.map(function (role) { return '<span class="badge-role badge-unit-admin badge-role-chip">' + esc(role) + '</span>'; }).join('');
  }

  function renderSecurityWindowPersonRows(items) {
    var rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return '<tr><td colspan="6"><div class="empty-state empty-state--pad-32-20"><div class="empty-state-title">沒有符合條件的資安窗口人員</div><div class="empty-state-desc">請調整關鍵字或狀態篩選。</div></div></td></tr>';
    }
    return rows.map(function (person) {
      var units = Array.isArray(person.units) ? person.units : [];
      var unitSummary = units.length ? units.join('、') : '未指定';
      var statusMeta = getSecurityWindowUnitStatusMeta(person.hasWindow ? 'assigned' : 'missing');
      return '<tr><td class="review-cell-strong">' + esc(person.name || person.username || '—') + '</td><td>' + esc(person.username || '—') + '<div class="review-card-subtitle review-card-subtitle--top-4">' + esc(person.email || '—') + '</div></td><td class="review-cell-secondary">' + esc(unitSummary) + '</td><td>' + renderSecurityWindowPersonBadge(person) + '</td><td><span class="review-status-badge ' + statusMeta.tone + '">' + esc(statusMeta.label) + '</span></td><td class="review-cell-secondary">' + esc(person.activeUnit || '—') + '</td></tr>';
    }).join('');
  }

  // ─── Scope card renderers ──────────────────────────

  function renderSecurityWindowScopeCard(row) {
    var meta = getSecurityWindowUnitStatusMeta(row.status);
    var holders = Array.isArray(row.holders) ? row.holders : [];
    var pending = Array.isArray(row.pending) ? row.pending : [];
    var holderHtml = holders.length
      ? holders.map(function (person) { return '<span class="cl-governance-child-chip">' + esc(person.name || person.username || '—') + ' · ' + esc(formatSecurityRolesSummary(person.securityRoles)) + '</span>'; }).join('')
      : '<span class="cl-governance-child-chip cl-governance-child-chip--muted">尚未指定</span>';
    var pendingHtml = pending.length
      ? pending.map(function (item) { return '<span class="cl-governance-child-chip">' + esc(item.applicantName || item.applicantEmail || '—') + ' · ' + esc(formatSecurityRolesSummary(item.securityRoles)) + '</span>'; }).join('')
      : '<span class="cl-governance-child-chip cl-governance-child-chip--muted">無待審核申請</span>';
    var tierLabel = row.exempted ? '已整併' : (row.isTop ? '一級單位' : '二級單位');
    var tierTone = row.exempted ? 'closed' : (row.isTop ? 'approved' : meta.tone);
    var noteLabel = row.exempted
      ? '由一級單位統一填報'
      : (row.isTop ? '本部 / 主體盤點' : '轄下單位分層盤點');
    return '\n        <article class="security-window-scope-card ' + (row.isTop ? 'is-top' : 'is-child') + ' ' + (row.exempted ? 'is-exempted' : '') + '">\n          <div class="security-window-scope-card-head">\n            <div>\n              <div class="security-window-scope-card-title">' + esc(row.label || row.unit || '—') + '</div>\n              <div class="security-window-scope-card-subtitle">\n                <span class="review-count-chip">' + esc(tierLabel) + '</span>\n                <span>' + esc(noteLabel) + '</span>\n              </div>\n            </div>\n            <span class="review-status-badge ' + tierTone + '">' + esc(meta.label) + '</span>\n          </div>\n          <div class="security-window-scope-card-body">\n            <div class="security-window-scope-chip-row">' + holderHtml + '</div>\n            ' + (pending.length ? '<div class="review-card-subtitle review-card-subtitle--top-10">待審核：<div class="security-window-scope-chip-row security-window-scope-chip-row--top-8">' + pendingHtml + '</div></div>' : '') + '\n          </div>\n        </article>';
  }

  function renderSecurityWindowScopeSection(title, subtitle, rows, emptyText) {
    var items = Array.isArray(rows) ? rows : [];
    var safeEmptyText = emptyText || '沒有可顯示的單位範圍';
    return '\n        <section class="security-window-tier-section">\n          <div class="security-window-tier-section-header">\n            <div>\n              <div class="security-window-tier-section-title">' + esc(title) + '</div>\n              <div class="review-card-subtitle">' + esc(subtitle || '') + '</div>\n            </div>\n            <span class="review-count-chip">' + esc(String(items.length)) + ' 筆</span>\n          </div>\n          ' + (items.length
        ? '<div class="security-window-tier-items">' + items.map(function (row) { return renderSecurityWindowScopeCard(row); }).join('') + '</div>'
        : '<div class="empty-state security-window-tier-empty"><div class="empty-state-title">' + esc(safeEmptyText) + '</div><div class="empty-state-desc">請確認單位資料與治理設定是否已就緒。</div></div>') + '\n        </section>';
  }

  function renderSecurityWindowScopeRows(unit) {
    var rows = Array.isArray(unit && unit.scopeRows) ? unit.scopeRows : [];
    var topRows = rows.filter(function (row) { return row && row.isTop; });
    var childRows = rows.filter(function (row) { return row && !row.isTop; });
    return '\n        <div class="security-window-tier-stack">\n          ' + renderSecurityWindowScopeSection('一級單位', '主單位與本部資安窗口盤點', topRows, '沒有可顯示的一級單位盤點資料') + '\n          ' + renderSecurityWindowScopeSection('二級單位', String(unit && unit.mode || 'independent').trim() === 'consolidated' ? '已整併單位會顯示為由一級單位統一' : '轄下單位的資安窗口盤點', childRows, '沒有可顯示的二級單位盤點資料') + '\n        </div>';
  }

  // ─── Unit / category card renderers ────────────────

  function renderSecurityWindowUnitCard(unit) {
    var statusMeta = getSecurityWindowUnitStatusMeta(unit.status);
    var holderCount = Array.isArray(unit.holders) ? unit.holders.length : 0;
    var pendingCount = Array.isArray(unit.pending) ? unit.pending.length : 0;
    var childCount = Array.isArray(unit.children) ? unit.children.length : 0;
    var summaryChips = [
      ['一級單位', 1],
      ['二級單位', childCount],
      ['已設定', holderCount],
      ['待審核', pendingCount]
    ];
    return '<details class="training-group-card security-window-card" data-security-window-unit="' + esc(unit.unit) + '"><summary class="training-group-summary security-window-summary"><div><span class="training-group-title">' + esc(unit.unit) + '</span><div class="training-group-subtitle">' + esc(unit.category || '正式單位') + ' · ' + esc(unit.mode === 'consolidated' ? '合併 / 統一填報' : '獨立填報') + '</div><div class="training-group-summary-grid">' + summaryChips.map(function (chip) { return '<span class="training-group-summary-chip"><strong>' + esc(String(chip[1] || 0)) + '</strong><small>' + esc(chip[0]) + '</small></span>'; }).join('') + '</div></div><div class="training-group-meta"><span class="review-status-badge ' + statusMeta.tone + '">' + esc(statusMeta.label) + '</span><span class="training-group-toggle">' + ic('chevron-down', 'icon-sm') + '</span></div></summary><div class="governance-card-body governance-card-body--top-pad"><div class="review-callout compact"><span class="review-callout-icon">' + ic('users-round', 'icon-sm') + '</span><div>' + esc(unit.note || (unit.mode === 'consolidated' ? '轄下單位由一級單位統一管理。' : '轄下單位需各自維護資安窗口。')) + '</div></div>' + renderSecurityWindowScopeRows(unit) + '</div></details>';
  }

  function renderSecurityWindowCategoryCard(group, index, categorySummaries) {
    var items = Array.isArray(group && group.items) ? group.items : [];
    var category = String(group && group.category || '').trim() || '中心 / 研究單位';
    var summary = categorySummaries && categorySummaries[category]
      ? categorySummaries[category]
      : summarizeSecurityWindowCategoryItems(items, category);
    var unitCount = Number(summary && summary.unitCount || items.length);
    var assignedCount = Number(summary && summary.assignedCount || 0);
    var pendingCount = Number(summary && summary.pendingCount || 0);
    var childCount = Number(summary && summary.childCount || 0);
    var missingCount = Number(summary && summary.missingCount || 0);
    var summaryChips = [
      ['單位數', unitCount],
      ['已設定', assignedCount],
      ['待審核', pendingCount],
      ['未設定', missingCount]
    ];
    var openAttr = index === 0 ? ' open' : '';
    var subtitle = category + ' · ' + childCount + ' 個二級單位';
    var bodyHtml = '<div class="security-window-group-stack security-window-group-stack--nested">' + items.map(function (unit) { return renderSecurityWindowUnitCard(unit); }).join('') + '</div>';
    return '<details class="training-group-card security-window-category-card"' + openAttr + ' data-security-window-category="' + esc(category) + '"><summary class="training-group-summary security-window-summary security-window-category-summary"><div><span class="training-group-title">' + esc(category) + '</span><div class="training-group-subtitle">' + esc(subtitle) + '</div><div class="training-group-summary-grid security-window-category-summary-grid">' + summaryChips.map(function (chip) { return '<span class="training-group-summary-chip security-window-category-summary-chip"><strong>' + esc(String(chip[1] || 0)) + '</strong><small>' + esc(chip[0]) + '</small></span>'; }).join('') + '</div></div><div class="training-group-meta"><span class="security-window-category-tag">' + esc(category) + '</span><span class="training-group-toggle">' + ic('chevron-down', 'icon-sm') + '</span></div></summary><div class="security-window-category-body">' + bodyHtml + '</div></details>';
  }

  function renderSecurityWindowUnitCards(units, categorySummaries) {
    var rows = Array.isArray(units) ? units : [];
    if (!rows.length) {
      return '<div class="empty-state review-empty review-empty--spacious"><div class="empty-state-icon">' + ic('shield-alert') + '</div><div class="empty-state-title">目前沒有符合條件的資安窗口單位</div><div class="empty-state-desc">請調整關鍵字、狀態或先確認單位治理設定。</div></div>';
    }
    var groups = groupSecurityWindowUnitsByCategory(rows);
    return '<div class="security-window-category-stack">' + groups.map(function (group, index) { return renderSecurityWindowCategoryCard(group, index, categorySummaries); }).join('') + '</div>';
  }

  // ─── Render-cache signature helpers ────────────────

  function serializeCategorySummaries(categorySummaries) {
    var source = categorySummaries && typeof categorySummaries === 'object' ? categorySummaries : {};
    return Object.keys(source).sort().map(function (category) {
      var summary = source[category] && typeof source[category] === 'object' ? source[category] : {};
      return [
        category,
        Number(summary.unitCount || summary.total || 0),
        Number(summary.consolidatedCount || summary.consolidated || 0),
        Number(summary.independentCount || summary.independent || 0),
        Number(summary.childCount || summary.children || 0),
        Number(summary.assignedCount || 0),
        Number(summary.pendingCount || 0),
        Number(summary.missingCount || 0)
      ];
    });
  }

  function buildSecurityWindowUnitCardsRenderSignature(units, filters, page, generatedAt, categorySummaries) {
    var safeFilters = filters || {};
    var safePage = page || {};
    var rows = Array.isArray(units) ? units : [];
    return JSON.stringify([
      String(generatedAt || '').trim(),
      String(safeFilters.keyword || '').trim(),
      String(safeFilters.status || 'all').trim(),
      String(safeFilters.category || 'all').trim(),
      Number(safePage.offset || 0),
      Number(safePage.limit || 12),
      Number(safePage.total || rows.length),
        rows.map(function (item) { return [
          String(item && item.unit || '').trim(),
          String(item && item.category || '').trim(),
          String(item && item.mode || '').trim(),
          String(item && item.status || '').trim(),
          Number(Array.isArray(item && item.children) ? item.children.length : 0),
          Number(Array.isArray(item && item.holders) ? item.holders.length : 0),
          Number(Array.isArray(item && item.pending) ? item.pending.length : 0)
        ]; }),
        serializeCategorySummaries(categorySummaries)
    ]);
  }

  function buildSecurityWindowPeopleRowsRenderSignature(people, filters, generatedAt) {
    var safeFilters = filters || {};
    var rows = Array.isArray(people) ? people : [];
    return JSON.stringify([
      String(generatedAt || '').trim(),
      String(safeFilters.keyword || '').trim(),
      String(safeFilters.status || 'all').trim(),
      String(safeFilters.category || 'all').trim(),
      rows.length,
      rows.slice(0, 5).map(function (item) { return [
        String(item && item.username || '').trim(),
        String(item && item.activeUnit || '').trim(),
        Array.isArray(item && item.units) ? item.units.length : 0,
        Array.isArray(item && item.securityRoles) ? item.securityRoles.join('|') : '',
        item && item.hasWindow ? 1 : 0
      ]; }),
      rows.slice(-5).map(function (item) { return [
        String(item && item.username || '').trim(),
        String(item && item.activeUnit || '').trim(),
        Array.isArray(item && item.units) ? item.units.length : 0,
        Array.isArray(item && item.securityRoles) ? item.securityRoles.join('|') : '',
        item && item.hasWindow ? 1 : 0
      ]; })
    ]);
  }

  // ─── Render-cache wrappers (own local cache) ──────

  var _unitCardsCache = { signature: '', html: '' };
  var _peopleRowsCache = { signature: '', html: '' };

  function getCachedSecurityWindowUnitCardsHtml(units, filters, page, generatedAt, categorySummaries) {
    var signature = buildSecurityWindowUnitCardsRenderSignature(units, filters, page, generatedAt, categorySummaries);
    if (_unitCardsCache.signature === signature && _unitCardsCache.html) {
      return _unitCardsCache.html;
    }
    var unitCardsHtml = renderSecurityWindowUnitCards(units, categorySummaries);
    _unitCardsCache.signature = signature;
    _unitCardsCache.html = unitCardsHtml;
    return unitCardsHtml;
  }

  function getCachedSecurityWindowPeopleRowsHtml(people, filters, generatedAt) {
    var signature = buildSecurityWindowPeopleRowsRenderSignature(people, filters, generatedAt);
    if (_peopleRowsCache.signature === signature && _peopleRowsCache.html) {
      return _peopleRowsCache.html;
    }
    var peopleRowsHtml = renderSecurityWindowPersonRows(people);
    _peopleRowsCache.signature = signature;
    _peopleRowsCache.html = peopleRowsHtml;
    return peopleRowsHtml;
  }

  function resetRenderCaches() {
    _unitCardsCache = { signature: '', html: '' };
    _peopleRowsCache = { signature: '', html: '' };
  }

  // ─── Public API ────────────────────────────────────

  window._adminSecurityWindow = {
    init: init,
    SECURITY_WINDOW_CATEGORY_ORDER: SECURITY_WINDOW_CATEGORY_ORDER,
    getSecurityWindowUnitStatusMeta: getSecurityWindowUnitStatusMeta,
    summarizeSecurityWindowCategoryItems: summarizeSecurityWindowCategoryItems,
    normalizeSecurityWindowCategory: normalizeSecurityWindowCategory,
    groupSecurityWindowUnitsByCategory: groupSecurityWindowUnitsByCategory,
    normalizeSecurityRoles: normalizeSecurityRoles,
    formatSecurityRolesSummary: formatSecurityRolesSummary,
    renderSecurityWindowPersonBadge: renderSecurityWindowPersonBadge,
    renderSecurityWindowPersonRows: renderSecurityWindowPersonRows,
    renderSecurityWindowScopeCard: renderSecurityWindowScopeCard,
    renderSecurityWindowScopeSection: renderSecurityWindowScopeSection,
    renderSecurityWindowScopeRows: renderSecurityWindowScopeRows,
    renderSecurityWindowUnitCard: renderSecurityWindowUnitCard,
    renderSecurityWindowCategoryCard: renderSecurityWindowCategoryCard,
    renderSecurityWindowUnitCards: renderSecurityWindowUnitCards,
    serializeCategorySummaries: serializeCategorySummaries,
    buildSecurityWindowUnitCardsRenderSignature: buildSecurityWindowUnitCardsRenderSignature,
    buildSecurityWindowPeopleRowsRenderSignature: buildSecurityWindowPeopleRowsRenderSignature,
    getCachedSecurityWindowUnitCardsHtml: getCachedSecurityWindowUnitCardsHtml,
    getCachedSecurityWindowPeopleRowsHtml: getCachedSecurityWindowPeopleRowsHtml,
    resetRenderCaches: resetRenderCaches
  };
})();
