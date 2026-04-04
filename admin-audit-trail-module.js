// @ts-check
/**
 * admin-audit-trail-module.js
 * Pure rendering helpers for the Audit Trail page.
 * Extracted from admin-module.js to reduce file size.
 *
 * Registers: window._adminAuditTrail
 * Dependencies: window globals — esc, ic, closeModalRoot (from app-core.bundle)
 */
(function () {
  'use strict';

  // ─── Event type 中文對照表 ──────────────────────────
  var EVENT_TYPE_LABELS = {
    'auth.login.success': '登入成功',
    'auth.login.failed': '登入失敗',
    'auth.login.locked': '帳號鎖定',
    'auth.logout': '登出',
    'auth.password-changed': '密碼變更',
    'auth.reset-password.completed': '密碼重設完成',
    'system-user.created': '帳號建立',
    'system-user.updated': '帳號更新',
    'system-user.deleted': '帳號刪除',
    'system-user.reset-token-issued': '重設密碼連結發送',
    'corrective-action.created': '矯正單開立',
    'corrective-action.updated': '矯正單更新',
    'corrective-action.status-changed': '矯正單狀態變更',
    'checklist.created': '檢核表建立',
    'checklist.updated': '檢核表更新',
    'checklist.submitted': '檢核表送出',
    'training.form.created': '訓練填報建立',
    'training.form.updated': '訓練填報更新',
    'training.form.submitted': '訓練填報送出',
    'asset-inventory.created': '資產建立',
    'asset-inventory.updated': '資產更新',
    'asset-inventory.deleted': '資產刪除',
    'unit-contact.created': '單位窗口申請',
    'unit-contact.approved': '單位窗口核准',
    'unit-contact.rejected': '單位窗口駁回',
    'system.error_alert': '系統錯誤警報',
    'system.overdue_reminder': '逾期提醒'
  };

  function localizeEventType(eventType) {
    var key = String(eventType || '').trim();
    return EVENT_TYPE_LABELS[key] || key;
  }

  var _escFn = null;
  var _icFn = null;
  function esc(s) { return (_escFn || (_escFn = window.__esc) || _escFallback)(s); }
  function ic(a, b) { return (_icFn || (_icFn = window.__ic) || _icFallback)(a, b); }
  function _escFallback(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] || c; }); }
  function _icFallback() { return ''; }
  function init(deps) { if (deps.esc) _escFn = deps.esc; if (deps.ic) _icFn = deps.ic; }

  // ─── Formatting helpers ─────────────────────────────

  function formatAuditOccurredAt(value) {
    var input = String(value || '').trim();
    if (!input) return '—';
    var date = new Date(input);
    if (Number.isNaN(date.getTime())) return input;
    return date.toLocaleString('zh-TW', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatAuditEventTypeSummary(summary) {
    var items = Array.isArray(summary && summary.eventTypes) ? summary.eventTypes : [];
    if (!items.length) {
      return '<div class="review-history-item"><div class="review-history-title">尚��事件分布</div><div class="review-history-meta">目前查詢範圍內沒有可用的事件類型統計。</div></div>';
    }
    var total = Math.max(0, Number(summary && summary.total) || 0);
    return items.map(function (entry) {
      var label = localizeEventType(entry && entry.eventType);
      var count = Math.max(0, Number(entry && entry.count) || 0);
      var percent = total > 0 ? Math.round((count / total) * 100) : 0;
      return '<div class="review-history-item"><div class="review-history-top"><span class="review-history-title">' + esc(label) + '</span><span class="review-history-time">' + count + ' 筆' + (total > 0 ? ' · ' + percent + '%' : '') + '</span></div><div class="review-history-meta">事件類型 ' + esc(label) + ' 共 ' + count + ' 筆' + (total > 0 ? '，��� ' + percent + '%' : '') + '。</div></div>';
    }).join('');
  }

  // ─── Row building ──────────────────────────────────

  function buildAuditTrailRow(entry, index) {
    var target = entry.targetEmail && entry.targetEmail !== entry.actorEmail ? entry.targetEmail : (entry.unitCode || '—');
    var summary = entry.payloadPreview || entry.title || entry.recordId || '—';
    return '<tr data-action="admin.viewAuditEntry" data-index="' + index + '" style="cursor:pointer"><td style="white-space:nowrap">' + formatAuditOccurredAt(entry.occurredAt) + '</td><td>' + esc(localizeEventType(entry.eventType)) + '</td><td>' + esc(entry.actorEmail || '—') + '</td><td>' + esc(target) + '</td><td class="review-cell-wrap">' + esc(summary) + '</td></tr>';
  }

  function buildAuditTrailEmptyRow() {
    return '<tr><td colspan="5"><div class="empty-state review-empty"><div class="empty-state-title">目前沒有稽核紀錄</div><div class="empty-state-desc">調整篩選條件後重新查詢。</div></div></td></tr>';
  }

  function buildAuditTrailVirtualSpacer(height) {
    return '<tr class="review-virtual-spacer" aria-hidden="true"><td class="review-virtual-spacer-cell" colspan="5" style="height:' + Math.max(0, Math.round(height)) + 'px"></td></tr>';
  }

  // ─── Audit entry modal ─────────────────────────────

  /**
   * @param {number} index  — index into the items array
   * @param {Array} items   — current auditTrailState.items (passed in by caller)
   * @param {{ toast: Function, closeModalRoot: Function, refreshIcons: Function, bindAdminPageEvent: Function }} helpers
   */
  function showAuditEntryModal(index, items, helpers) {
    var safeItems = Array.isArray(items) ? items : [];
    var entryIndex = Math.max(0, Number(index) || 0);
    var entry = safeItems[entryIndex] || null;
    if (!entry) {
      helpers.toast('找不到稽核紀錄明細', 'error');
      return;
    }
    var payload = entry && typeof entry.payload === 'object' && entry.payload ? entry.payload : null;
    var payloadText = payload
      ? JSON.stringify(payload, null, 2)
      : String(entry.payloadJson || entry.payloadPreview || '—');
    var mr = document.getElementById('modal-root') || (function () {
      var fallbackRoot = document.createElement('div');
      fallbackRoot.id = 'modal-root';
      document.body.appendChild(fallbackRoot);
      return fallbackRoot;
    }());
    var fieldRows = [
      ['事件類型', localizeEventType(entry.eventType) + (entry.eventType ? ' (' + entry.eventType + ')' : '')],
      ['時間', formatAuditOccurredAt(entry.occurredAt)],
      ['操作人', entry.actorEmail || '—'],
      ['目標', entry.targetEmail || '—'],
      ['單位', entry.unitCode || '��'],
      ['紀錄編號', entry.recordId || '—']
    ].map(function (pair) { return '<div class="audit-modal-field"><div class="audit-modal-label">' + esc(pair[0]) + '</div><div class="audit-modal-value">' + esc(pair[1]) + '</div></div>'; }).join('');

    mr.innerHTML = '<div class="modal-backdrop" id="modal-bg"><div class="modal audit-entry-modal" role="dialog" aria-modal="true" aria-labelledby="audit-entry-modal-title" aria-describedby="audit-entry-modal-description"><div class="modal-header"><span class="modal-title" id="audit-entry-modal-title">操作稽核差異檢視</span><button class="btn btn-ghost btn-icon" data-dismiss-modal aria-label="關閉操作稽核差異檢視">\u2715</button></div><div class="modal-body"><p class="sr-only" id="audit-entry-modal-description">檢視單筆操作稽核紀錄的摘要與完整內容。</p><div class="audit-modal-summary">' + fieldRows + '</div><div class="form-group audit-modal-summary-block"><label class="form-label">內容摘要</label><div class="review-card-subtitle review-cell-wrap">' + esc(entry.payloadPreview || '—') + '</div></div><div class="form-group"><label class="form-label">完整內容</label><pre class="audit-modal-pre">' + esc(payloadText) + '</pre></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss-modal>關閉</button></div></div></div>';
    var backdrop = document.getElementById('modal-bg');
    if (backdrop) {
      helpers.bindAdminPageEvent(backdrop, 'click', function (event) {
        if (event.target === event.currentTarget) helpers.closeModalRoot();
      });
    }
    helpers.refreshIcons();
  }

  // ─── Loading skeleton ──────────────────────────────

  var DEFAULT_AUDIT_FILTERS = Object.freeze({
    keyword: '',
    eventType: '',
    occurredFrom: '',
    occurredTo: '',
    actorEmail: '',
    targetEmail: '',
    unitCode: '',
    recordId: '',
    limit: '50',
    offset: '0'
  });

  function normalizeAuditTrailSummary(summary) {
    var source = summary && typeof summary === 'object' ? summary : {};
    return {
      total: Math.max(0, Number(source.total) || 0),
      actorCount: Math.max(0, Number(source.actorCount) || 0),
      latestOccurredAt: String(source.latestOccurredAt || '').trim(),
      eventTypes: Array.isArray(source.eventTypes) ? source.eventTypes.slice() : []
    };
  }

  /**
   * Build the loading skeleton markup shown while the audit trail data is fetching.
   * @param {object} filters
   * @param {object} summary
   * @param {{ normalizeAuditTrailPage: Function, buildReviewTableShell: Function }} helpers
   */
  function buildAuditTrailLoadingMarkup(filters, summary, helpers) {
    var safeFilters = Object.assign({}, DEFAULT_AUDIT_FILTERS, filters || {});
    var safeSummary = normalizeAuditTrailSummary(summary);
    var page = helpers.normalizeAuditTrailPage(null, safeFilters, []);
    var labels = {
      eyebrow: '\u7a3d\u6838\u8ffd\u8e64',
      title: '\u64cd\u4f5c\u7a3d\u6838\u8ecc\u8de1',
      subtitle: '\u5148\u5efa\u7acb\u67e5\u8a62\u8207\u6458\u8981\u9aa8\u67b6\uff0c\u80cc\u666f\u518d\u88dc\u9f4a\u5b8c\u6574\u7a3d\u6838\u8cc7\u6599\u3002',
      summary: 'count=' + (safeSummary.total || 0) + ' actors=' + (safeSummary.actorCount || 0),
      loading: '\u8f09\u5165\u4e2d',
      searchTitle: '\u7a3d\u6838\u7d00\u9304\u67e5\u8a62',
      distributionTitle: '\u4e8b\u4ef6\u5206\u5e03',
      distributionSubtitle: '\u6b63\u5728\u6574\u7406\u7d71\u8a08',
      summaryPending: '\u6458\u8981\u540c\u6b65\u4e2d',
      summaryPendingDesc: '\u80cc\u666f\u6458\u8981\u5b8c\u6210\u5f8c\u6703\u81ea\u52d5\u66f4\u65b0\u4e8b\u4ef6\u5206\u985e\u8207\u6700\u8fd1\u6642\u9593\u3002',
      tableLoadingTitle: 'Loading audit trail',
      tableLoadingDesc: 'Page shell is ready. Latest records continue loading in the background.',
      toolbarSubtitle: 'Audit trail is still syncing.',
      keyword: '\u95dc\u9375\u5b57',
      eventType: '\u4e8b\u4ef6\u985e\u578b',
      startDate: '\u958b\u59cb\u65e5\u671f',
      endDate: '\u7d50\u675f\u65e5\u671f',
      allEvents: '\u5168\u90e8\u4e8b\u4ef6',
      applyFilters: '\u5957\u7528\u7be9\u9078',
      resetFilters: '\u6e05\u7a7a\u689d\u4ef6'
    };
    var tableShell = helpers.buildReviewTableShell(
      'audit-trail-table',
      '<th>Time</th><th>Event</th><th>Actor</th><th>Target</th><th>Unit</th><th>Summary</th><th>Diff</th>',
      '<tr><td colspan="7"><div class="empty-state review-empty"><div class="empty-state-icon">' + ic('loader-circle') + '</div><div class="empty-state-title">' + labels.tableLoadingTitle + '</div><div class="empty-state-desc">' + labels.tableLoadingDesc + '</div></div></td></tr>',
      {
        toolbarSubtitle: labels.toolbarSubtitle,
        wrapperId: 'audit-trail-table-wrap',
        wrapperClass: 'audit-trail-table-wrap',
        tbodyId: 'audit-trail-table-body'
      }
    );
    return '<div class="animate-in"><div class="page-header review-page-header"><div><div class="page-eyebrow">' + labels.eyebrow + '</div><h1 class="page-title">' + labels.title + '</h1><p class="page-subtitle">' + labels.subtitle + '</p></div><div class="review-header-actions"><button type="button" class="btn btn-secondary" disabled>' + ic('loader-circle', 'icon-sm') + ' ' + labels.loading + '</button></div></div><div class="review-callout"><span class="review-callout-icon">' + ic('shield-check', 'icon-sm') + '</span><div><strong class="review-callout-strong">' + esc(labels.summary) + '</strong><div class="review-card-subtitle review-card-subtitle--top-6">' + labels.tableLoadingDesc + '</div></div></div><div class="review-grid"><div class="card review-table-card"><div class="card-header"><span class="card-title">' + labels.searchTitle + '</span><span class="review-card-subtitle">' + esc(labels.summary) + '</span></div><form id="audit-filter-form"><div class="panel-grid-two review-filter-grid"><div class="form-group"><label class="form-label">' + labels.keyword + '</label><input type="text" class="form-input" id="audit-keyword" value="' + esc(safeFilters.keyword) + '" placeholder="event, email, recordId, payload" disabled></div><div class="form-group"><label class="form-label">' + labels.eventType + '</label><select class="form-select" id="audit-event-type" disabled><option value="">' + labels.allEvents + '</option></select></div><div class="form-group"><label class="form-label">' + labels.startDate + '</label><input type="date" class="form-input" id="audit-occurred-from" value="' + esc(safeFilters.occurredFrom) + '" disabled></div><div class="form-group"><label class="form-label">' + labels.endDate + '</label><input type="date" class="form-input" id="audit-occurred-to" value="' + esc(safeFilters.occurredTo) + '" disabled></div></div><div class="form-actions review-form-actions-start"><button type="submit" class="btn btn-primary" disabled>' + ic('search', 'icon-sm') + ' ' + labels.applyFilters + '</button><button type="button" class="btn btn-secondary" disabled>' + ic('rotate-ccw', 'icon-sm') + ' ' + labels.resetFilters + '</button></div></form>' + tableShell + '</div><div class="card review-history-card"><div class="card-header"><span class="card-title">' + labels.distributionTitle + '</span><span class="review-card-subtitle">' + labels.distributionSubtitle + '</span></div><div class="empty-state review-empty"><div class="empty-state-icon">' + ic('activity') + '</div><div class="empty-state-title">' + labels.summaryPending + '</div><div class="empty-state-desc">' + labels.summaryPendingDesc + '</div></div></div></div></div>';
  }

  // ─── Public API ─────────────���──────────────────────

  window._adminAuditTrail = {
    init: init,
    formatAuditOccurredAt: formatAuditOccurredAt,
    formatAuditEventTypeSummary: formatAuditEventTypeSummary,
    buildAuditTrailRow: buildAuditTrailRow,
    buildAuditTrailEmptyRow: buildAuditTrailEmptyRow,
    buildAuditTrailVirtualSpacer: buildAuditTrailVirtualSpacer,
    showAuditEntryModal: showAuditEntryModal,
    buildAuditTrailLoadingMarkup: buildAuditTrailLoadingMarkup,
    normalizeAuditTrailSummary: normalizeAuditTrailSummary
  };
})();
