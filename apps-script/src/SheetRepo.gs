function getSheetOrNull_(sheetName) {
  return getSpreadsheet_().getSheetByName(sheetName);
}

function getSheetOrThrow_(sheetName) {
  const sheet = getSheetOrNull_(sheetName);
  if (!sheet) throw createHttpError_('CONFIG_ERROR', `Sheet not found: ${sheetName}`);
  return sheet;
}

function ensureSheet_(sheetName, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0].slice(0, headers.length)
    : [];

  let same = currentHeaders.length === headers.length;
  if (same) {
    for (let i = 0; i < headers.length; i += 1) {
      if (String(currentHeaders[i] || '') !== String(headers[i])) {
        same = false;
        break;
      }
    }
  }

  if (!same) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function readSheetRows_(sheetName) {
  const sheet = getSheetOrNull_(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return values.map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[String(h || '').trim()] = row[idx];
    });
    return obj;
  });
}

function appendSheetRow_(sheetName, rowObj) {
  const headers = SHEET_SCHEMAS[sheetName];
  if (!headers) throw createHttpError_('CONFIG_ERROR', `Unknown schema: ${sheetName}`);

  const sheet = ensureSheet_(sheetName, headers);
  const row = headers.map((h) => rowObj[h] !== undefined ? rowObj[h] : '');
  sheet.appendRow(row);
}

function upsertSheetRowByKey_(sheetName, keyField, rowObj) {
  const headers = SHEET_SCHEMAS[sheetName];
  if (!headers) throw createHttpError_('CONFIG_ERROR', `Unknown schema: ${sheetName}`);

  const keyValue = rowObj[keyField];
  if (keyValue === undefined || keyValue === null || keyValue === '') {
    throw createHttpError_('VALIDATION_ERROR', `${keyField} is required`);
  }

  const sheet = ensureSheet_(sheetName, headers);
  const all = readSheetRows_(sheetName);
  const idx = all.findIndex((r) => String(r[keyField]) === String(keyValue));

  const row = headers.map((h) => rowObj[h] !== undefined ? rowObj[h] : '');
  if (idx < 0) {
    sheet.appendRow(row);
  } else {
    const targetRow = idx + 2;
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([row]);
  }
}

function replaceSheetRows_(sheetName, rowObjs) {
  const headers = SHEET_SCHEMAS[sheetName];
  if (!headers) throw createHttpError_('CONFIG_ERROR', `Unknown schema: ${sheetName}`);

  const sheet = ensureSheet_(sheetName, headers);
  const maxRows = sheet.getMaxRows();
  const maxCols = sheet.getMaxColumns();
  if (maxRows > 1 && maxCols > 0) {
    sheet.getRange(2, 1, maxRows - 1, maxCols).clearContent();
  }

  if (!Array.isArray(rowObjs) || rowObjs.length === 0) return;

  const rows = rowObjs.map((obj) => headers.map((h) => obj[h] !== undefined ? obj[h] : ''));
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function nextSequence_(key) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheetName = SHEET_NAMES.sequences;
    const headers = SHEET_SCHEMAS[sheetName];
    const sheet = ensureSheet_(sheetName, headers);

    const rows = readSheetRows_(sheetName);
    const idx = rows.findIndex((r) => String(r.key) === String(key));
    if (idx < 0) {
      const startNo = 1;
      sheet.appendRow([key, startNo + 1]);
      return startNo;
    }

    const row = rows[idx];
    const current = Number(row.next_no || 1);
    const next = current + 1;
    const targetRow = idx + 2;
    sheet.getRange(targetRow, 2).setValue(next);
    return current;
  } finally {
    lock.releaseLock();
  }
}

function createId_(prefix) {
  const no = nextSequence_(prefix);
  return `${prefix}-${String(no).padStart(6, '0')}`;
}
