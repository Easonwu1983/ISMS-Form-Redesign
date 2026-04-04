// @ts-check
/**
 * admin-login-log-module.js
 * Pure rendering helpers for the Login Log page.
 * Extracted from admin-module.js to reduce file size.
 *
 * Registers: window._adminLoginLog
 * Dependencies: window globals — esc, fmtTime (from app-core.bundle)
 */
(function () {
  'use strict';

  var _escFn = null;
  function esc(s) { return (_escFn || (_escFn = window.__esc) || _escFallback)(s); }
  function _escFallback(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c] || c; }); }
  function init(deps) { if (deps.esc) _escFn = deps.esc; }

  // ─── Row building ──────────────────────────────────

  function buildLoginLogRow(log, fmtTime) {
    var success = !!(log && log.success);
    var badge = success
      ? '<span class="review-status-badge approved">成功</span>'
      : '<span class="review-status-badge danger">失敗</span>';
    var nameDisplay = (log && log.name) ? log.name : (success ? '—' : '(未知帳號)');
    var roleDisplay = (log && log.role) ? log.role : (success ? '—' : '');
    return '<tr><td>' + esc(fmtTime(log && log.time) || '—') + '</td><td class="review-cell-strong">' + esc(log && log.username || '—') + '</td><td>' + esc(nameDisplay) + '</td><td>' + esc(roleDisplay) + '</td><td>' + badge + '</td></tr>';
  }

  function buildLoginLogEmptyRow() {
    return '<tr><td colspan="5"><div class="empty-state review-empty review-empty--spacious"><div class="empty-state-title">目前沒有登入紀錄</div><div class="empty-state-desc">系統會保留最近的登入與失敗紀錄。</div></div></td></tr>';
  }

  function buildLoginLogVirtualSpacer(height) {
    return '<tr class="review-virtual-spacer" aria-hidden="true"><td class="review-virtual-spacer-cell" colspan="5" style="height:' + Math.max(0, Math.round(height)) + 'px"></td></tr>';
  }

  // ─��─ Virtual window calculation ────────────────────

  var LOGIN_LOG_VIRTUAL_ROW_HEIGHT = 56;
  var LOGIN_LOG_VIRTUAL_ROW_OVERSCAN = 8;
  var LOGIN_LOG_VIRTUAL_ROW_THRESHOLD = 60;
  var ADMIN_MIN_VIRTUAL_VIEWPORT_HEIGHT = 200;

  function getLoginLogVirtualWindow(totalRows, loginLogTableViewport) {
    if (!loginLogTableViewport || totalRows <= LOGIN_LOG_VIRTUAL_ROW_THRESHOLD) {
      return {
        enabled: false,
        start: 0,
        end: totalRows,
        padTop: 0,
        padBottom: 0
      };
    }
    var scrollTop = Math.max(0, Number(loginLogTableViewport.scrollTop || 0));
    var viewportHeight = Math.max(ADMIN_MIN_VIRTUAL_VIEWPORT_HEIGHT, Number(loginLogTableViewport.clientHeight || 0) || 0);
    var start = Math.max(0, Math.floor(scrollTop / LOGIN_LOG_VIRTUAL_ROW_HEIGHT) - LOGIN_LOG_VIRTUAL_ROW_OVERSCAN);
    var visibleCount = Math.ceil(viewportHeight / LOGIN_LOG_VIRTUAL_ROW_HEIGHT) + (LOGIN_LOG_VIRTUAL_ROW_OVERSCAN * 2);
    var end = Math.min(totalRows, start + visibleCount);
    return {
      enabled: true,
      start: start,
      end: end,
      padTop: start * LOGIN_LOG_VIRTUAL_ROW_HEIGHT,
      padBottom: Math.max(0, (totalRows - end) * LOGIN_LOG_VIRTUAL_ROW_HEIGHT)
    };
  }

  /**
   * Render login log rows into the table body, with optional virtual scrolling.
   * @param {Array} items — login log entries
   * @param {HTMLElement|null} loginLogTableViewport — scroll container element
   * @param {Function} fmtTime — time formatting function from deps
   */
  function renderLoginLogRows(items, loginLogTableViewport, fmtTime) {
    var body = document.getElementById('login-log-table-body');
    if (!body) return;
    var logs = Array.isArray(items) ? items : [];
    if (!logs.length) {
      body.innerHTML = buildLoginLogEmptyRow();
      return;
    }
    var virtualWindow = getLoginLogVirtualWindow(logs.length, loginLogTableViewport);
    if (!virtualWindow.enabled) {
      body.innerHTML = logs.map(function (log) { return buildLoginLogRow(log, fmtTime); }).join('');
      return;
    }
    var rowsHtml = logs
      .slice(virtualWindow.start, virtualWindow.end)
      .map(function (log) { return buildLoginLogRow(log, fmtTime); })
      .join('');
    body.innerHTML = buildLoginLogVirtualSpacer(virtualWindow.padTop)
      + rowsHtml
      + buildLoginLogVirtualSpacer(virtualWindow.padBottom);
  }

  // ─── Public API ────────────────────────────────────

  window._adminLoginLog = {
    init: init,
    buildLoginLogRow: buildLoginLogRow,
    buildLoginLogEmptyRow: buildLoginLogEmptyRow,
    buildLoginLogVirtualSpacer: buildLoginLogVirtualSpacer,
    getLoginLogVirtualWindow: getLoginLogVirtualWindow,
    renderLoginLogRows: renderLoginLogRows,
    LOGIN_LOG_VIRTUAL_ROW_HEIGHT: LOGIN_LOG_VIRTUAL_ROW_HEIGHT,
    LOGIN_LOG_VIRTUAL_ROW_OVERSCAN: LOGIN_LOG_VIRTUAL_ROW_OVERSCAN,
    LOGIN_LOG_VIRTUAL_ROW_THRESHOLD: LOGIN_LOG_VIRTUAL_ROW_THRESHOLD
  };
})();
