// @ts-check
'use strict';

/**
 * 結構化日誌工具
 * - 預設：可讀格式 [tag] message { details }
 * - LOG_FORMAT=json 時：JSON 一行一筆，方便機器解析
 */

const useJson = String(process.env.LOG_FORMAT || '').toLowerCase() === 'json';

function formatMsg(level, tag, message, details) {
  if (useJson) {
    return JSON.stringify({ ts: new Date().toISOString(), level, tag, msg: message, ...details });
  }
  const prefix = '[' + tag + ']';
  if (details && Object.keys(details).length > 0) {
    return prefix + ' ' + message + ' ' + JSON.stringify(details);
  }
  return prefix + ' ' + message;
}

function info(tag, message, details) {
  console.log(formatMsg('info', tag, message, details));
}

function warn(tag, message, details) {
  console.warn(formatMsg('warn', tag, message, details));
}

function error(tag, message, details) {
  console.error(formatMsg('error', tag, message, details));
}

module.exports = { info, warn, error };
