// @ts-check
'use strict';

/**
 * 錯誤告警模組 — 收集 API 錯誤，批次寄 Email 給管理者
 *
 * 策略：
 * - 收集所有 5xx 錯誤和未捕獲異常
 * - 每 15 分鐘檢查一次，有錯誤才寄
 * - 每封信最多包含 20 筆錯誤摘要
 * - 同一錯誤 1 小時內不重複告警
 */

const log = require('./logger.cjs');

const ALERT_INTERVAL_MS = 15 * 60 * 1000; // 15 分鐘
const MAX_ERRORS_PER_ALERT = 20;
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 小時去重

const MAX_BUFFER_SIZE = 500;
/** @type {Array<{time: string, path: string, status: number, message: string, clientIp: string}>} */
const errorBuffer = [];
/** @type {Map<string, number>} */
const sentHashes = new Map();
let alertTimer = null;

function getErrorHash(err) {
  return String(err.path || '') + '::' + String(err.message || '').substring(0, 100);
}

function collectError(requestInfo) {
  const hash = getErrorHash(requestInfo);
  const now = Date.now();
  // 去重：同一錯誤 1 小時內不重複收集
  if (sentHashes.has(hash) && now - sentHashes.get(hash) < DEDUP_WINDOW_MS) return;
  // 防止記憶體無限增長
  if (errorBuffer.length >= MAX_BUFFER_SIZE) errorBuffer.shift();
  errorBuffer.push({
    time: new Date().toISOString(),
    path: String(requestInfo.path || '').substring(0, 200),
    status: Number(requestInfo.status) || 500,
    message: String(requestInfo.message || '').substring(0, 500),
    clientIp: String(requestInfo.clientIp || '').substring(0, 50)
  });
}

function buildAlertHtml(errors) {
  const rows = errors.map(function (e) {
    return '<tr><td style="padding:4px 8px;border:1px solid #e2e8f0">' + e.time.substring(0, 19).replace('T', ' ') + '</td>'
      + '<td style="padding:4px 8px;border:1px solid #e2e8f0">' + e.status + '</td>'
      + '<td style="padding:4px 8px;border:1px solid #e2e8f0">' + e.path + '</td>'
      + '<td style="padding:4px 8px;border:1px solid #e2e8f0">' + e.message.substring(0, 100) + '</td></tr>';
  }).join('');
  return '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a">'
    + '<h2 style="color:#dc2626">ISMS 系統錯誤告警</h2>'
    + '<p>過去 15 分鐘內偵測到 ' + errors.length + ' 筆 API 錯誤：</p>'
    + '<table style="border-collapse:collapse;font-size:13px"><thead><tr style="background:#f1f5f9">'
    + '<th style="padding:6px 8px;border:1px solid #e2e8f0">時間</th>'
    + '<th style="padding:6px 8px;border:1px solid #e2e8f0">狀態碼</th>'
    + '<th style="padding:6px 8px;border:1px solid #e2e8f0">路徑</th>'
    + '<th style="padding:6px 8px;border:1px solid #e2e8f0">錯誤訊息</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
    + '<p style="color:#94a3b8;font-size:12px;margin-top:16px">本信件由 ISMS 錯誤告警模組自動發送</p>'
    + '</body></html>';
}

function startAlertSchedule(sendMailFn) {
  if (alertTimer) return;
  alertTimer = setInterval(function () {
    if (!errorBuffer.length) return;
    const adminEmail = String(process.env.ISMS_ADMIN_EMAIL || '').trim();
    if (!adminEmail) {
      log.warn('error-alerter', 'No ISMS_ADMIN_EMAIL configured, skipping alert', { errorCount: errorBuffer.length });
      errorBuffer.length = 0;
      return;
    }
    const errors = errorBuffer.splice(0, MAX_ERRORS_PER_ALERT);
    // 記錄已發送的 hash
    const now = Date.now();
    errors.forEach(function (e) { sentHashes.set(getErrorHash(e), now); });
    // 清理過期的 hash
    sentHashes.forEach(function (ts, key) { if (now - ts > DEDUP_WINDOW_MS) sentHashes.delete(key); });

    if (typeof sendMailFn === 'function') {
      sendMailFn({
        to: adminEmail,
        subject: 'ISMS 系統告警：偵測到 ' + errors.length + ' 筆 API 錯誤',
        html: buildAlertHtml(errors)
      }).catch(function (err) {
        log.error('error-alerter', 'Failed to send alert', { error: String(err && err.message || err) });
      });
    }
    log.info('error-alerter', 'Alert sent', { errorCount: errors.length, to: adminEmail });
  }, ALERT_INTERVAL_MS);
  alertTimer.unref();
  log.info('error-alerter', 'Alert schedule started', { intervalMin: ALERT_INTERVAL_MS / 60000 });
}

function getErrorCount() { return errorBuffer.length; }
function getRecentErrors(limit) { return errorBuffer.slice(-(limit || 10)); }

module.exports = { collectError, startAlertSchedule, getErrorCount, getRecentErrors };
