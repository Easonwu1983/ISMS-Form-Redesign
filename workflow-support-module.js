// @ts-check
(function () {
  window.createWorkflowSupportModule = function createWorkflowSupportModule(deps) {
    const {
      DEFAULT_USERS,
      STATUSES,
      TRAINING_GENERAL_LABEL,
      TRAINING_INFO_STAFF_LABEL,
      TRAINING_PROFESSIONAL_LABEL,
      getUnitCode,
      getOfficialUnitMeta,
      getApprovedCustomUnits,
      composeUnitValue,
      loadData,
      saveData,
      getTrainingRosterByUnit,
      normalizeTrainingRecordRow,
      computeTrainingSummary,
      getTrainingStatsUnit,
      getTrainingJobUnit,
      getTrainingProfessionalDisplay,
      getTrainingRecordHint,
      fmt,
      fmtTime,
      toast,
      esc,
      ensureXlsxLoaded
    } = deps;

    function getCorrectionYear(dateValue) {
      const raw = String(dateValue || '').trim();
      const date = raw ? new Date(raw) : new Date();
      if (!Number.isFinite(date.getTime())) return String(new Date().getFullYear() - 1911).padStart(3, '0');
      return String(date.getFullYear() - 1911).padStart(3, '0');
    }

    function normalizeRocYear(value, fallbackDateValue) {
      const raw = String(value || '').trim();
      if (/^\d{4}$/.test(raw) && Number(raw) > 1911) return String(Number(raw) - 1911).padStart(3, '0');
      if (/^\d{1,3}$/.test(raw) && Number(raw) > 0) return String(Number(raw)).padStart(3, '0');
      return getCorrectionYear(fallbackDateValue);
    }

    function buildScopedRecordPrefix(prefix, unitValue, yearValue, fallbackDateValue) {
      const unitCode = getUnitCode(unitValue);
      const year = normalizeRocYear(yearValue, fallbackDateValue);
      return unitCode ? `${String(prefix || '').trim().toUpperCase()}-${year}-${unitCode}` : '';
    }

    function parseScopedRecordId(value, prefix) {
      const target = String(prefix || '').trim().toUpperCase();
      const pattern = target ? `^(${target}-\\d{3}-[A-Z0-9]+)-(\\d+)$` : '^([A-Z]{3}-\\d{3}-[A-Z0-9]+)-(\\d+)$';
      const match = String(value || '').trim().toUpperCase().match(new RegExp(pattern));
      if (!match) return null;
      return {
        documentNo: match[1],
        sequence: Number(match[2]),
        sequenceText: match[2]
      };
    }

    function buildScopedRecordId(documentNo, sequence) {
      if (!documentNo || !Number.isFinite(Number(sequence))) return '';
      return `${documentNo}-${String(Number(sequence))}`;
    }

    function getNextScopedRecordSequence(documentNo, items, parser) {
      let max = 0;
      const parse = typeof parser === 'function' ? parser : ((value) => parseScopedRecordId(value));
      (Array.isArray(items) ? items : []).forEach((item) => {
        const parsed = parse(item?.id);
        if (parsed && parsed.documentNo === documentNo) {
          max = Math.max(max, parsed.sequence);
        }
      });
      return max + 1;
    }

    function buildCorrectionDocumentNo(unitValue, dateValue) {
      return buildScopedRecordPrefix('CAR', unitValue, '', dateValue);
    }

    function parseCorrectionAutoId(value) {
      const match = String(value || '').trim().toUpperCase().match(/^(CAR-\d{3}-[A-Z0-9]+)-(\d+)$/);
      if (!match) return null;
      return {
        documentNo: match[1],
        sequence: Number(match[2]),
        sequenceText: match[2]
      };
    }

    function buildAutoCarIdByDocument(documentNo, sequence) {
      return buildScopedRecordId(documentNo, sequence);
    }

    function buildAutoCarId(unitValue, sequence, dateValue) {
      return buildAutoCarIdByDocument(buildCorrectionDocumentNo(unitValue, dateValue), sequence);
    }

    function getNextCorrectionSequence(documentNo, items) {
      let max = getNextScopedRecordSequence(documentNo, items, parseCorrectionAutoId) - 1;
      (Array.isArray(items) ? items : []).forEach((item) => {
        if (item?.documentNo === documentNo && Number.isFinite(Number(item.caseSeq))) {
          max = Math.max(max, Number(item.caseSeq));
        }
      });
      return max + 1;
    }

    function buildChecklistDocumentNo(unit, auditYear, fillDate) {
      return buildScopedRecordPrefix('CHK', unit, auditYear, fillDate);
    }

    function parseChecklistId(value) {
      return parseScopedRecordId(value, 'CHK');
    }

    function buildChecklistIdByDocument(documentNo, sequence) {
      return buildScopedRecordId(documentNo, sequence);
    }

    function getNextChecklistSequence(documentNo, items) {
      return getNextScopedRecordSequence(documentNo, items, parseChecklistId);
    }

    function buildTrainingFormDocumentNo(unit, trainingYear, fillDate) {
      return buildScopedRecordPrefix('TRN', unit, trainingYear, fillDate);
    }

    function parseTrainingFormId(value) {
      return parseScopedRecordId(value, 'TRN');
    }

    function buildTrainingFormIdByDocument(documentNo, sequence) {
      return buildScopedRecordId(documentNo, sequence);
    }

    function getNextTrainingFormSequence(documentNo, forms) {
      return getNextScopedRecordSequence(documentNo, forms, parseTrainingFormId);
    }

    function getFileExtension(name) {
      const clean = String(name || '').trim();
      const match = clean.match(/\.([^.]+)$/);
      return match ? String(match[1] || '').toLowerCase() : '';
    }

    function getTaipeiDateParts(value) {
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return null;
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
      }, {});
      return {
        year: parts.year || '',
        month: parts.month || '',
        day: parts.day || '',
        hour: parts.hour || '',
        minute: parts.minute || '',
        second: parts.second || ''
      };
    }

    function buildUploadSignature(meta) {
      const name = String(meta?.name || '').trim().toLowerCase();
      const size = Number(meta?.size || 0);
      const type = String(meta?.type || '').trim().toLowerCase();
      return [name, size, type].join('::');
    }

    function matchesMimeRule(type, rule) {
      const rawType = String(type || '').trim().toLowerCase();
      const rawRule = String(rule || '').trim().toLowerCase();
      if (!rawType || !rawRule) return false;
      if (rawRule.endsWith('/*')) return rawType.startsWith(rawRule.slice(0, -1));
      return rawType === rawRule;
    }

    function validateUploadFile(file, options) {
      const opts = options || {};
      const fileLabel = String(opts.fileLabel || '附件').trim();
      const allowedExtensions = Array.isArray(opts.allowedExtensions) ? opts.allowedExtensions.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean) : [];
      const allowedMimeTypes = Array.isArray(opts.allowedMimeTypes) ? opts.allowedMimeTypes.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean) : [];
      const maxSize = Number(opts.maxSize || 0);
      const maxSizeLabel = String(opts.maxSizeLabel || '').trim() || (maxSize ? (Math.round(maxSize / (1024 * 1024)) + 'MB') : '');
      const name = String(file?.name || '').trim();
      const type = String(file?.type || '').trim().toLowerCase();
      const size = Number(file?.size || 0);
      const extension = getFileExtension(name);

      if (!name) {
        return { ok: false, message: `${fileLabel}缺少檔名，請重新選擇檔案。`, meta: null };
      }
      if (!size || size <= 0) {
        return { ok: false, message: `附件 ${name} 沒有有效內容，請重新選擇檔案。`, meta: null };
      }
      if (maxSize > 0 && size > maxSize) {
        return { ok: false, message: `附件 ${name} 超過大小限制 ${maxSizeLabel}。`, meta: null };
      }
      if (allowedExtensions.length && !allowedExtensions.includes(extension)) {
        return { ok: false, message: `附件 ${name} 的副檔名不符合規定，只接受 ${allowedExtensions.map((entry) => '.' + entry).join('、')}。`, meta: null };
      }
      if (allowedMimeTypes.length && (!type || type === 'application/octet-stream' || !allowedMimeTypes.some((rule) => matchesMimeRule(type, rule)))) {
        return { ok: false, message: `附件 ${name} 的檔案格式不符合規定。`, meta: null };
      }

      const meta = {
        name,
        type: String(file?.type || '').trim(),
        size,
        extension,
        signature: buildUploadSignature({ name, type, size })
      };
      return { ok: true, message: '', meta };
    }

    function prepareUploadBatch(existingFiles, incomingFiles, options) {
      const accepted = [];
      const errors = [];
      const known = new Set((Array.isArray(existingFiles) ? existingFiles : []).map((entry) => buildUploadSignature(entry)).filter(Boolean));
      Array.from(incomingFiles || []).forEach((file) => {
        const checked = validateUploadFile(file, options);
        if (!checked.ok || !checked.meta) {
          errors.push(checked.message || '附件驗證失敗');
          return;
        }
        if (known.has(checked.meta.signature)) {
          errors.push(`附件 ${checked.meta.name} 已存在，請勿重複上傳。`);
          return;
        }
        known.add(checked.meta.signature);
        accepted.push({
          file,
          meta: checked.meta
        });
      });
      return { accepted, errors };
    }

    function csvCell(value) {
      const text = String(value === null || value === undefined ? '' : value);
      const trimmed = text.replace(/^[\u0000-\u0020\uFEFF]+/, '');
      const safeText = /^[=+\-@]/.test(trimmed) ? "'" + text : text;
      if (safeText.includes(',') || safeText.includes('"') || safeText.includes('\n')) return '"' + safeText.replace(/"/g, '""') + '"';
      return safeText;
    }

    async function ensureXlsxApi() {
      if (typeof window === 'undefined') {
        throw new Error('Excel 模組無法在目前環境載入');
      }
      if (window.XLSX) return window.XLSX;
      if (typeof ensureXlsxLoaded === 'function') {
        const xlsxApi = await ensureXlsxLoaded();
        if (window.XLSX) return window.XLSX;
        if (xlsxApi) return xlsxApi;
      }
      throw new Error('Excel 模組尚未載入');
    }

    async function downloadWorkbook(filename, sheets) {
      let xlsxApi;
      try {
        xlsxApi = await ensureXlsxApi();
      } catch (error) {
        toast(error && error.message ? error.message : 'Excel 模組尚未載入，請稍後再試', 'error');
        return false;
      }
      const workbook = xlsxApi.utils.book_new();
      (Array.isArray(sheets) ? sheets : []).forEach((sheet, index) => {
        const name = String(sheet?.name || `Sheet${index + 1}`).slice(0, 31) || `Sheet${index + 1}`;
        const worksheet = xlsxApi.utils.aoa_to_sheet(Array.isArray(sheet?.rows) ? sheet.rows : []);
        xlsxApi.utils.book_append_sheet(workbook, worksheet, name);
      });
      xlsxApi.writeFile(workbook, filename);
      return true;
    }

    function downloadCsvFile(filename, rows) {
      if (typeof window === 'undefined' || typeof document === 'undefined') return false;
      const lines = (Array.isArray(rows) ? rows : []).map((row) => {
        if (!Array.isArray(row)) return String(row === null || row === undefined ? '' : row);
        return row.map(csvCell).join(',');
      });
      const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      try {
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
        window.URL.revokeObjectURL(url);
      }
      return true;
    }

    function localeCompareZh(a, b) {
      return String(a || '').localeCompare(String(b || ''), 'zh-Hant', { sensitivity: 'base', numeric: true });
    }

    function localeCompareZhStroke(a, b) {
      return String(a || '').localeCompare(String(b || ''), 'zh-Hant-u-co-stroke', { sensitivity: 'base', numeric: true });
    }

    function getTrainingSourceRank(row) {
      const source = String(row && row.source || '').trim();
      if (source === 'import') return 0;
      if (source === 'manual') return 1;
      return 0;
    }

    function getTrainingIdentityRank(row) {
      const identity = String(row && row.identity || '').trim();
      const rankMap = new Map([
        ['\u4e00\u7d1a\u4e3b\u7ba1', 1],
        ['\u4e00\u7d1a\u526f\u4e3b\u7ba1', 2],
        ['\u4e8c\u7d1a\u4e3b\u7ba1', 3],
        ['\u4e8c\u7d1a\u526f\u4e3b\u7ba1', 4],
        ['\u9293\u6558\u65b0\u5236\u8077\u54e1', 6],
        ['\u6821\u8058\u4eba\u54e1', 6],
        ['\u6280\u5de5\u5de5\u53cb', 99]
      ]);
      if (rankMap.has(identity)) return rankMap.get(identity);
      return 6;
    }

    function getTrainingJobTitleRank(row) {
      const title = String(row && row.jobTitle || '').trim();
      const rankMap = new Map([
        ['\u7d93\u7406', 1],
        ['\u4e3b\u4efb', 1],
        ['\u7d44\u9577', 1],
        ['\u884c\u653f\u5c08\u54e1', 2],
        ['\u5c08\u54e1', 2],
        ['\u884c\u653f\u7d44\u54e1', 3],
        ['\u7d44\u54e1', 3],
        ['\u8cc7\u6df1\u5c08\u54e1', 4]
      ]);
      if (rankMap.has(title)) return rankMap.get(title);
      return 99;
    }

    function getTrainingRosterJobUnit(row) {
      return String(row && (row.unitName || getTrainingJobUnit(row.unit) || row.unit) || '').trim();
    }

    function compareTrainingRosterEntries(a, b) {
      const sourceCompare = getTrainingSourceRank(a) - getTrainingSourceRank(b);
      if (sourceCompare !== 0) {
        return sourceCompare;
      }

      const identityCompare = getTrainingIdentityRank(a) - getTrainingIdentityRank(b);
      if (identityCompare !== 0) {
        return identityCompare;
      }

      const unitCompare = localeCompareZhStroke(getTrainingRosterJobUnit(a), getTrainingRosterJobUnit(b));
      if (unitCompare !== 0) {
        return unitCompare;
      }

      const titleCompare = getTrainingJobTitleRank(a) - getTrainingJobTitleRank(b);
      if (titleCompare !== 0) {
        return titleCompare;
      }

      const nameCompare = localeCompareZhStroke(a && a.name, b && b.name);
      if (nameCompare !== 0) {
        return nameCompare;
      }

      return localeCompareZh(a && a.createdAt, b && b.createdAt);
    }

    function sortTrainingRosterEntries(rows) {
      return (Array.isArray(rows) ? rows.slice() : []).sort(compareTrainingRosterEntries);
    }

    function formatTrainingExportDate(value) {
      const parts = getTaipeiDateParts(value);
      if (!parts) return new Date().toISOString().slice(0, 10).replace(/-/g, '');
      return [parts.year, parts.month, parts.day].join('');
    }

    function formatTrainingExportTimestamp(value) {
      const parts = getTaipeiDateParts(value);
      if (!parts) return '';
      return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
    }

    function sanitizeTrainingFileNamePart(value, fallbackText) {
      const cleaned = String(value || '').trim().replace(/[\\/:*?\"<>|]+/g, '_');
      return cleaned || String(fallbackText || '').trim() || '\u672a\u547d\u540d';
    }

    function getTrainingDetailExportFilename(form) {
      const unitName = sanitizeTrainingFileNamePart(form && form.unit, '\u672a\u547d\u540d\u55ae\u4f4d');
      const fillerName = sanitizeTrainingFileNamePart(form && form.fillerName, '\u672a\u547d\u540d\u586b\u5831\u4eba');
      return '\u6559\u80b2\u8a13\u7df4\u7d71\u8a08_' + unitName + '_' + fillerName + '_' + formatTrainingExportDate(new Date()) + '.csv';
    }

    function getTrainingProfessionalExportValue(record) {
      if (!record || record.status !== '\u5728\u8077') return '';
      if (record.isInfoStaff === '\u5426') return '\u4e0d\u9069\u7528';
      return String(getTrainingProfessionalDisplay(record) || '').trim();
    }

    async function exportTrainingSummaryCsv(forms, filename) {
      const rows = forms.map((form) => {
        const summary = form.summary || computeTrainingSummary(form.records || []);
        return [
          form.id,
          form.statsUnit || getTrainingStatsUnit(form.unit),
          form.unit,
          form.trainingYear,
          form.status,
          form.fillerName,
          form.submitterPhone || '',
          form.submitterEmail || '',
          summary.activeCount || 0,
          summary.completedCount || 0,
          summary.incompleteCount || 0,
          (summary.completionRate || 0) + '%',
          fmt(form.fillDate),
          form.stepOneSubmittedAt ? fmtTime(form.stepOneSubmittedAt) : '',
          form.submittedAt ? fmtTime(form.submittedAt) : '',
          fmtTime(form.updatedAt)
        ];
      });
      return downloadWorkbook(filename || ('\u6559\u80b2\u8a13\u7df4\u7d71\u8a08\u7e3d\u8868_' + new Date().toISOString().slice(0, 10) + '.xlsx'), [{
        name: '\u6559\u80b2\u8a13\u7df4\u7d71\u8a08',
        rows: [[
          '\u8868\u55ae\u7de8\u865f',
          '\u7d71\u8a08\u55ae\u4f4d',
          '\u586b\u5831\u55ae\u4f4d',
          '\u5e74\u5ea6',
          '\u72c0\u614b',
          '\u586b\u5831\u4eba',
          '\u806f\u7d61\u96fb\u8a71',
          '\u806f\u7d61\u4fe1\u7bb1',
          '\u5728\u8077\u4eba\u6578',
          '\u5df2\u5b8c\u6210',
          '\u672a\u5b8c\u6210',
          '\u5b8c\u6210\u7387',
          '\u586b\u5831\u65e5\u671f',
          '\u6d41\u7a0b\u4e00\u9001\u51fa\u6642\u9593',
          '\u7c3d\u6838\u5b8c\u6210\u6642\u9593',
          '\u6700\u5f8c\u66f4\u65b0'
        ]].concat(rows)
      }]);
    }

    function exportTrainingDetailCsv(form) {
      const summary = form.summary || computeTrainingSummary(form.records || []);
      const records = sortTrainingRosterEntries(form.records || []);
      const trainingYear = String(form.trainingYear || new Date().getFullYear() - 1911).trim();
      const rows = [
        ['\u570b\u7acb\u81fa\u7063\u5927\u5b78 ' + trainingYear + ' \u5e74\u8cc7\u901a\u5b89\u5168\u6559\u80b2\u8a13\u7df4\u57f7\u884c\u60c5\u5f62\u7d71\u8a08\u8868'],
        [],
        ['\u8868\u55ae\u6458\u8981'],
        ['\u7d71\u8a08\u55ae\u4f4d', '\u586b\u5831\u4eba', '\u806f\u7d61\u96fb\u8a71', '\u806f\u7d61\u4fe1\u7bb1', '\u5728\u8077\u4eba\u6578', '\u672a\u5b8c\u6210', '\u5df2\u5b8c\u6210', '\u5b8c\u6210\u7387', '\u6700\u5f8c\u66f4\u65b0'],
        [
          form.statsUnit || getTrainingStatsUnit(form.unit) || '\u672a\u6307\u5b9a\u55ae\u4f4d',
          form.fillerName || '\u672a\u6307\u5b9a\u586b\u5831\u4eba',
          form.submitterPhone || '',
          form.submitterEmail || '',
          summary.activeCount || 0,
          summary.incompleteCount || 0,
          summary.completedCount || 0,
          (summary.completionRate || 0) + '%',
          formatTrainingExportTimestamp(form.submittedAt || form.updatedAt || form.createdAt)
        ],
        [],
        ['\u4eba\u54e1\u660e\u7d30'],
        ['\u5e8f\u865f', '\u59d3\u540d', '\u7d71\u8a08\u55ae\u4f4d', '\u672c\u8077\u55ae\u4f4d', '\u8eab\u5206\u5225', '\u8077\u7a31', '\u5728\u8077\u72c0\u614b', '\u8cc7\u5b89\u901a\u8b58\uff081 \u5e74 3 \u5c0f\u6642\uff09', '\u8cc7\u8a0a\u4eba\u54e1\u8a13\u7df4', '\u8cc7\u5b89\u5c08\u696d\u8a13\u7df4\uff082 \u5e74 3 \u5c0f\u6642\uff09']
      ].concat(records.map((row, index) => [
        index + 1,
        row.name || '',
        row.l1Unit || form.statsUnit || getTrainingStatsUnit(form.unit) || '',
        row.unitName || '',
        row.identity || '',
        row.jobTitle || '',
        row.status || '',
        row.completedGeneral || '',
        row.isInfoStaff || '',
        getTrainingProfessionalExportValue(row)
      ]));
      downloadCsvFile(getTrainingDetailExportFilename(form), rows);
    }

    function getRocDateParts(value) {
      const parts = getTaipeiDateParts(value);
      if (!parts) return { year: '', month: '', day: '' };
      return {
        year: String(Number(parts.year) - 1911),
        month: String(Number(parts.month)),
        day: String(Number(parts.day))
      };
    }

    function buildTrainingPrintHtml(payload) {
      const summary = payload.summary || computeTrainingSummary(payload.records || []);
      const unitName = payload.statsUnit || getTrainingStatsUnit(payload.unit) || '\u672a\u6307\u5b9a\u55ae\u4f4d';
      const rocDate = getRocDateParts(payload.fillDate);
      const title = String(payload.trainingYear || '') + '\u5e74\u570b\u7acb\u81fa\u7063\u5927\u5b78\u8cc7\u901a\u5b89\u5168\u6559\u80b2\u8a13\u7df4\u57f7\u884c\u60c5\u5f62\u7c3d\u6838\u8868';
      return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>' + esc(title) + '</title><style>'
        + 'body{font-family:"Noto Sans TC",sans-serif;color:#111827;margin:0;padding:24px;background:#fff}'
        + '.sheet{max-width:960px;margin:0 auto}'
        + 'h1{font-size:24px;text-align:center;margin:0 0 18px}'
        + '.meta,.summary,.confirm-table{width:100%;border-collapse:collapse;margin-bottom:18px}'
        + '.meta th,.meta td,.summary th,.summary td,.confirm-table th,.confirm-table td{border:1px solid #111827;padding:10px 12px;font-size:14px;vertical-align:top}'
        + '.meta th,.summary th,.confirm-table th{background:#f8fafc;text-align:left;width:18%}'
        + '.summary-note{display:block;margin-top:4px;font-size:12px;color:#475569;font-weight:400}'
        + '.confirm-check{display:inline-flex;align-items:center;gap:10px;font-weight:600}'
        + '.checkbox-box{display:inline-block;width:18px;height:18px;border:1.5px solid #111827;box-sizing:border-box}'
        + '.notes{font-size:13px;line-height:1.8;color:#111827}'
        + '.notes-title{font-weight:700;margin:14px 0 6px}'
        + '.notes ol{padding-left:20px;margin:6px 0 0}'
        + '.sign-row{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px;align-items:end;margin-top:22px}'
        + '.sign-box{border:2px solid #111827;height:120px;padding:12px;font-size:16px;display:flex;align-items:flex-start;justify-content:flex-start}'
        + '</style></head><body><div class="sheet">'
        + '<h1>' + esc(title) + '</h1>'
        + '<table class="meta">'
        + '<tr><th>\u7d71\u8a08\u55ae\u4f4d</th><td>' + esc(unitName) + '</td><th>\u586b\u5831\u65e5\u671f</th><td>' + esc(rocDate.year) + '\u5e74' + esc(rocDate.month) + '\u6708' + esc(rocDate.day) + '\u65e5</td></tr>'
        + '<tr><th>\u586b\u5831\u4eba</th><td>' + esc(payload.fillerName || payload.submitterName || '') + '</td><th>\u806f\u7d61\u96fb\u8a71</th><td>' + esc(payload.submitterPhone || '') + '</td></tr>'
        + '<tr><th>\u806f\u7d61\u4fe1\u7bb1</th><td colspan="3">' + esc(payload.submitterEmail || '') + '</td></tr>'
        + '</table>'
        + '<table class="summary">'
        + '<tr>'
        + '<th>\u5728\u8077\u4eba\u6578<span class="summary-note">\u4ee5\u540d\u55ae\u4e2d\u7684\u5728\u8077\u4eba\u54e1\u70ba\u6e96</span></th>'
        + '<th>\u5b8c\u6210\u7387<span class="summary-note">\u5df2\u5b8c\u6210\u4eba\u6578 / \u5728\u8077\u4eba\u6578</span></th>'
        + '<th>\u672a\u5b8c\u6210<span class="summary-note">\u5c1a\u672a\u5b8c\u6210\u61c9\u53d7\u8a13\u7df4\u4eba\u6578</span></th>'
        + '<th>\u5df2\u5b8c\u6210<span class="summary-note">\u7b26\u5408\u61c9\u5b8c\u6210\u689d\u4ef6\u4eba\u6578</span></th>'
        + '</tr>'
        + '<tr><td>' + (summary.activeCount || 0) + '</td><td>' + (summary.completionRate || 0) + '%</td><td>' + (summary.incompleteCount || 0) + '</td><td>' + (summary.completedCount || 0) + '</td></tr>'
        + '</table>'
        + '<table class="confirm-table">'
        + '<tr><th>\u672c\u55ae\u4f4d\u8cc7\u901a\u5b89\u5168\u6559\u80b2\u8a13\u7df4\u57f7\u884c\u60c5\u5f62\u78ba\u8a8d</th><td><span class="confirm-check"><span class="checkbox-box"></span><span>\u4ee5\u4e0a\u5167\u5bb9\u7d93\u78ba\u8a8d\u7121\u8aa4\uff0c\u4e26\u5df2\u5b8c\u6210\u55ae\u4f4d\u5167\u90e8\u6aa2\u6838\u3002</span></span></td></tr>'
        + '</table>'
        + '<div class="notes">'
        + '<div class="notes-title">\u7c3d\u6838\u524d\u8acb\u78ba\u8a8d\u4ee5\u4e0b\u4e8b\u9805</div>'
        + '<ol>'
        + '<li>\u8acb\u78ba\u8a8d\u586b\u5831\u540d\u55ae\u3001\u5728\u8077\u72c0\u614b\u8207\u6559\u80b2\u8a13\u7df4\u5b8c\u6210\u60c5\u5f62\u5747\u70ba\u6700\u65b0\u8cc7\u6599\u3002</li>'
        + '<li>\u7c3d\u6838\u524d\u8acb\u5148\u5b8c\u6210\u6d41\u7a0b\u4e00\u9001\u51fa\uff0c\u518d\u5217\u5370\u672c\u8868\u4e26\u7531\u55ae\u4f4d\u4e3b\u7ba1\u7c3d\u7ae0\u3002</li>'
        + '<li>\u7c3d\u6838\u6383\u63cf\u6a94\u4e0a\u50b3\u5f8c\uff0c\u8acb\u78ba\u8a8d\u7cfb\u7d71\u4e2d\u7684\u6a94\u6848\u53ef\u4ee5\u6b63\u5e38\u9810\u89bd\u8207\u4e0b\u8f09\u3002</li>'
        + '<li>\u82e5\u6709\u9000\u56de\u66f4\u6b63\uff0c\u8acb\u4f9d\u9000\u56de\u610f\u898b\u66f4\u65b0\u8cc7\u6599\u5f8c\u91cd\u65b0\u5217\u5370\u4e26\u88dc\u4e0a\u6700\u65b0\u7c3d\u6838\u6383\u63cf\u6a94\u3002</li>'
        + '<li>\u76f8\u95dc\u8cc7\u5b89\u8a13\u7df4\u8ab2\u7a0b\u8cc7\u8a0a\u53ef\u53c3\u8003\u672c\u6821\u8cc7\u5b89\u5c08\u5340\u8207 e-learning \u5e73\u53f0\u3002</li>'
        + '</ol></div>'
        + '<div class="sign-row"><div></div><div class="sign-box">\u55ae\u4f4d\u4e3b\u7ba1\u7c3d\u7ae0</div></div>'
        + '</div></body></html>';
    }

    function printTrainingSheet(payload) {
      const html = buildTrainingPrintHtml(payload);
      const win = window.open('', '_blank', 'width=980,height=800');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
          win.focus();
          win.print();
        }, 250);
        return;
      }
      toast('\u700f\u89bd\u5668\u5df2\u5c01\u9396\u5f48\u51fa\u8996\u7a97\uff0c\u7cfb\u7d71\u6539\u4ee5\u9801\u5167\u5217\u5370\u6a21\u5f0f\u958b\u555f\u3002', 'info');
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        iframe.remove();
        toast('\u7121\u6cd5\u5efa\u7acb\u5217\u5370\u8996\u7a97\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002', 'error');
        return;
      }
      frameWindow.document.open();
      frameWindow.document.write(html);
      frameWindow.document.close();
      const cleanup = () => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };
      frameWindow.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(() => {
        frameWindow.focus();
        frameWindow.print();
        setTimeout(cleanup, 1500);
      }, 250);
    }

    function normalizeTrainingImportHeader(value) {
      return String(value || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[\s\u3000]+/g, '')
        .replace(/[()\uFF08\uFF09]/g, '')
        .replace(/[._\-]/g, '');
    }

    function buildTrainingRosterHeaderMap(cells) {
      const headerAliases = {
        name: ['\u59d3\u540d', '\u53d7\u8a13\u4eba\u59d3\u540d', 'name'],
        unitName: ['\u672c\u8077\u55ae\u4f4d', '\u55ae\u4f4d\u540d\u7a31', '\u670d\u52d9\u55ae\u4f4d', '\u8077\u52d9\u55ae\u4f4d'],
        identity: ['\u8eab\u5206\u5225', '\u8eab\u4efd\u5225', '\u4eba\u54e1\u8eab\u5206', '\u8077\u54e1\u8eab\u5206'],
        jobTitle: ['\u8077\u7a31', '\u8077\u52d9', 'title'],
        unit: ['\u586b\u5831\u55ae\u4f4d', '\u6240\u5c6c\u55ae\u4f4d', '\u4e3b\u586b\u5831\u55ae\u4f4d', '\u55ae\u4f4d'],
        statsUnit: ['\u7d71\u8a08\u55ae\u4f4d', '\u4e00\u7d1a\u55ae\u4f4d', '\u6240\u5c6c\u4e00\u7d1a\u55ae\u4f4d']
      };
      const normalizedCells = (Array.isArray(cells) ? cells : []).map((cell) => normalizeTrainingImportHeader(cell));
      const map = {};
      Object.keys(headerAliases).forEach((key) => {
        const idx = normalizedCells.findIndex((cell) => headerAliases[key].some((alias) => cell === normalizeTrainingImportHeader(alias)));
        if (idx >= 0) map[key] = idx;
      });
      return Number.isInteger(map.name) ? map : null;
    }

    function isTrainingRosterHeaderLikeRow(cells) {
      const normalizedCells = (Array.isArray(cells) ? cells : [])
        .map((cell) => normalizeTrainingImportHeader(cell))
        .filter(Boolean);
      if (!normalizedCells.length) return false;
      if (buildTrainingRosterHeaderMap(cells)) return true;
      const headerTokens = new Set([
        normalizeTrainingImportHeader('\u59d3\u540d'),
        normalizeTrainingImportHeader('\u53d7\u8a13\u4eba\u59d3\u540d'),
        normalizeTrainingImportHeader('\u672c\u8077\u55ae\u4f4d'),
        normalizeTrainingImportHeader('\u55ae\u4f4d\u540d\u7a31'),
        normalizeTrainingImportHeader('\u8eab\u5206\u5225'),
        normalizeTrainingImportHeader('\u8eab\u4efd\u5225'),
        normalizeTrainingImportHeader('\u8077\u7a31'),
        normalizeTrainingImportHeader('\u8077\u52d9'),
        normalizeTrainingImportHeader('\u586b\u5831\u55ae\u4f4d'),
        normalizeTrainingImportHeader('\u7d71\u8a08\u55ae\u4f4d')
      ]);
      const matched = normalizedCells.filter((cell) => headerTokens.has(cell)).length;
      return matched >= 2 || (matched >= 1 && normalizedCells.length <= 4 && normalizedCells[0] === normalizeTrainingImportHeader('\u59d3\u540d'));
    }

    function resolveTrainingRosterDataRows(rows) {
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length) return { headerMap: null, dataRows: [] };
      for (let index = 0; index < Math.min(list.length, 5); index += 1) {
        const headerMap = buildTrainingRosterHeaderMap(list[index]);
        if (headerMap) {
          return {
            headerMap,
            dataRows: list.slice(index + 1)
          };
        }
      }
      return {
        headerMap: null,
        dataRows: list.filter((cells) => !isTrainingRosterHeaderLikeRow(cells))
      };
    }

    function resolveTrainingImportTargetUnit(defaultUnit, rawUnit, rawStatsUnit) {
      const selectedUnit = String(defaultUnit || '').trim();
      const normalizeUnitText = (value) => String(value || '')
        .trim()
        .replace(/\s*[\/\uFF0F]\s*/g, '\uFF0F')
        .replace(/\uFF0F+/g, '\uFF0F');
      const unitText = normalizeUnitText(rawUnit);
      const statsText = normalizeUnitText(rawStatsUnit);
      if (unitText) {
        if (getOfficialUnitMeta(unitText) || getApprovedCustomUnits().includes(unitText)) return unitText;
        if (statsText && getOfficialUnitMeta(composeUnitValue(statsText, unitText))) return composeUnitValue(statsText, unitText);
      }
      if (selectedUnit) return selectedUnit;
      if (statsText) {
        if (getOfficialUnitMeta(statsText) || getApprovedCustomUnits().includes(statsText)) return statsText;
      }
      return '';
    }

    function parseTrainingRosterCells(cells, unit, headerMap) {
      const clean = (Array.isArray(cells) ? cells : []).map((part) => String(part || '').replace(/^\uFEFF/, '').trim());
      if (isTrainingRosterHeaderLikeRow(clean)) return null;
      const getCell = (key, fallbackIndex) => {
        if (headerMap && Number.isInteger(headerMap[key])) return clean[headerMap[key]] || '';
        return clean[fallbackIndex] || '';
      };
      const firstCell = getCell('name', 0);
      if (!firstCell || firstCell === '\u59d3\u540d' || firstCell === '\u53d7\u8a13\u4eba\u59d3\u540d') return null;
      const importedUnit = resolveTrainingImportTargetUnit(unit, getCell('unit', -1), getCell('statsUnit', -1));
      return {
        unit: importedUnit,
        name: firstCell,
        unitName: getCell('unitName', 1) || getTrainingJobUnit(importedUnit || unit),
        identity: getCell('identity', 2) || '',
        jobTitle: getCell('jobTitle', 3) || ''
      };
    }

    function splitDelimitedLine(line, delimiter) {
      const text = String(line || '');
      const result = [];
      let current = '';
      let quoted = false;
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === '"') {
          if (quoted && text[index + 1] === '"') {
            current += '"';
            index += 1;
          } else {
            quoted = !quoted;
          }
          continue;
        }
        if (!quoted && char === delimiter) {
          result.push(current);
          current = '';
          continue;
        }
        current += char;
      }
      result.push(current);
      return result.map((part) => String(part || '').replace(/^\uFEFF/, '').trim());
    }

    function parseTrainingRosterImport(text, unit) {
      const rows = String(text || '').replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => splitDelimitedLine(line, line.includes('\t') ? '\t' : ','));
      const { headerMap, dataRows } = resolveTrainingRosterDataRows(rows);
      return dataRows.map((parts) => parseTrainingRosterCells(parts, unit, headerMap)).filter((row) => row && row.name);
    }

    function parseTrainingRosterWorkbook(file, unit) {
      return new Promise((resolve, reject) => {
        if (!file) {
          resolve([]);
          return;
        }
        const extension = getFileExtension(file.name || '');
        const useDelimitedTextParser = extension === 'csv' || extension === 'tsv';
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            if (useDelimitedTextParser) {
              resolve(parseTrainingRosterImport(String(event.target.result || ''), unit));
              return;
            }
            const xlsxApi = await ensureXlsxApi();
            const workbook = xlsxApi.read(event.target.result, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) {
              resolve([]);
              return;
            }
            const rows = xlsxApi.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, raw: false, defval: '' });
            const { headerMap, dataRows } = resolveTrainingRosterDataRows(rows);
            resolve(dataRows.map((cells) => parseTrainingRosterCells(cells, unit, headerMap)).filter((row) => row && row.name));
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('\u7121\u6cd5\u8b80\u53d6\u6a94\u6848\u5167\u5bb9'));
        if (useDelimitedTextParser) {
          reader.readAsText(file, 'UTF-8');
        } else {
          reader.readAsArrayBuffer(file);
        }
      });
    }

    function mergeTrainingRows(targetUnit, carryRows) {
      const normalizedTargetUnit = String(targetUnit || '').trim();
      const carry = (Array.isArray(carryRows) ? carryRows : [])
        .map((row) => {
          const rowUnit = String(row && row.unit || normalizedTargetUnit).trim();
          return normalizeTrainingRecordRow({ ...row, unit: rowUnit || normalizedTargetUnit }, rowUnit || normalizedTargetUnit);
        })
        .filter((row) => {
          if (!normalizedTargetUnit) return true;
          return String(row && row.unit || '').trim() === normalizedTargetUnit;
        });
      const rosterRows = normalizedTargetUnit ? getTrainingRosterByUnit(normalizedTargetUnit).map((row) => {
        const existing = carry.find((item) => (item.rosterId && item.rosterId === row.id) || item.name === row.name);
        return normalizeTrainingRecordRow({
          ...row,
          ...existing,
          rosterId: row.id,
          unit: normalizedTargetUnit,
          statsUnit: row.statsUnit || getTrainingStatsUnit(normalizedTargetUnit),
          unitName: existing?.unitName || row.unitName || getTrainingJobUnit(normalizedTargetUnit),
          identity: existing?.identity || row.identity || '',
          jobTitle: existing?.jobTitle || row.jobTitle || '',
          source: existing?.source || row.source || 'import',
          status: existing?.status || '',
          completedGeneral: existing?.completedGeneral || '',
          isInfoStaff: existing?.isInfoStaff || '',
          completedProfessional: existing?.completedProfessional || '',
          note: existing?.note || ''
        }, normalizedTargetUnit);
      }) : [];
      carry.forEach((row) => {
        const rowUnit = String(row && row.unit || '').trim();
        if (normalizedTargetUnit && rowUnit !== normalizedTargetUnit) return;
        const exists = rosterRows.some((item) => (row.rosterId && item.rosterId === row.rosterId) || item.name === row.name);
        if (!exists) rosterRows.push(normalizeTrainingRecordRow({ ...row, unit: normalizedTargetUnit || rowUnit }, normalizedTargetUnit || rowUnit));
      });
      return sortTrainingRosterEntries(rosterRows);
    }

    function seedData() {
      const d = loadData();
      if (d.items.length > 0 && d.items[0].title && !d.items[0].problemDesc) {
        d.items = [];
        d.nextId = 1;
        saveData(d);
      }
      if (d.items.length > 0) return;
      if (!d.users || d.users.length === 0) d.users = DEFAULT_USERS.map((u) => ({ ...u }));
      const now = new Date();
      const ago = (n) => new Date(now - n * 864e5).toISOString();
      const fut = (n) => new Date(now.getTime() + n * 864e5).toISOString().split('T')[0];
      const past = (n) => new Date(now - n * 864e5).toISOString().split('T')[0];
      d.items = [
        { id: 'CAR-0001', proposerUnit: '稽核室', proposerName: '張稽核員', proposerDate: past(25), handlerUnit: '計算機及資訊網路中心／資訊網路組', handlerName: '李工程師', handlerDate: past(24), deficiencyType: '主要缺失', source: '內部稽核', category: ['硬體', '基礎設施'], clause: 'A.11.2.2', problemDesc: '伺服器機房溫度超過 28°C 標準值，最高達 32°C。', occurrence: '例行巡檢時發現 A 區機房溫控設備失效，導致持續高溫 3 天。', correctiveAction: '已更換溫控感測器並校正空調系統。', correctiveDueDate: past(10), rootCause: '溫控感測器服役超過 5 年，精度下降且未按時校正。', rootElimination: '建立每季校正計畫，設定感測器更換週期為 3 年。', rootElimDueDate: past(8), riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null, reviewResult: '同意', reviewer: '王經理', reviewDate: past(5), trackings: [], status: STATUSES.CLOSED, createdAt: ago(25), updatedAt: ago(5), closedDate: ago(5), evidence: [], history: [{ time: ago(25), action: '開立矯正單', user: '張稽核員' }, { time: ago(25), action: '狀態變更為「待矯正」', user: '系統' }, { time: ago(18), action: '李工程師 提交矯正措施提案', user: '李工程師' }, { time: ago(18), action: '狀態變更為「已提案」', user: '系統' }, { time: ago(8), action: '狀態變更為「審核中」', user: '王經理' }, { time: ago(5), action: '狀態變更為「結案」', user: '王經理' }] },
        { id: 'CAR-0002', proposerUnit: '稽核室', proposerName: '張稽核員', proposerDate: past(10), handlerUnit: '計算機及資訊網路中心／資訊網路組', handlerName: '陳資安主管', handlerDate: past(9), deficiencyType: '次要缺失', source: '內部稽核', category: ['人員', '資訊'], clause: 'A.9.2.6', problemDesc: '3 名離職員工帳號仍為啟用狀態，未即時停用。', occurrence: '內部稽核時檢查帳號權限管理，發現 3 筆離職超過 1 個月的帳號仍可登入系統。', correctiveAction: '已停用所有離職員工帳號並清查全公司帳號。', correctiveDueDate: fut(5), rootCause: 'HR 離職通知流程未納入 IT 帳號停用程序。', rootElimination: '修訂離職檢核表，新增 IT 帳號停用確認欄位。', rootElimDueDate: fut(3), riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null, reviewResult: '', reviewer: '', reviewDate: null, trackings: [], status: STATUSES.PROPOSED, createdAt: ago(10), updatedAt: ago(3), closedDate: null, evidence: [], history: [{ time: ago(10), action: '開立矯正單', user: '張稽核員' }, { time: ago(10), action: '狀態變更為「待矯正」', user: '系統' }, { time: ago(3), action: '陳資安主管 提交矯正措施提案', user: '陳資安主管' }, { time: ago(3), action: '狀態變更為「已提案」', user: '系統' }] },
        { id: 'CAR-0003', proposerUnit: '計算機及資訊網路中心／資訊網路組', proposerName: '王經理', proposerDate: past(5), handlerUnit: '總務處／營繕組', handlerName: '黃工程師', handlerDate: null, deficiencyType: '主要缺失', source: '資安事故', category: ['軟體', '服務'], clause: 'A.12.3.1', problemDesc: '每日備份排程連續 3 天未執行，存在資料遺失風險。', occurrence: '監控系統發出告警，確認 CronJob 因磁碟空間不足而中斷執行。', correctiveAction: '', correctiveDueDate: fut(3), rootCause: '', rootElimination: '', rootElimDueDate: null, riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null, reviewResult: '', reviewer: '', reviewDate: null, trackings: [], status: STATUSES.PENDING, createdAt: ago(5), updatedAt: ago(5), closedDate: null, evidence: [], history: [{ time: ago(5), action: '開立矯正單', user: '王經理' }, { time: ago(5), action: '狀態變更為「待矯正」', user: '系統' }] },
        { id: 'CAR-0004', proposerUnit: '計算機及資訊網路中心／資訊網路組', proposerName: '王經理', proposerDate: past(14), handlerUnit: '人事室／綜合業務組', handlerName: '劉文管人員', handlerDate: past(13), deficiencyType: '次要缺失', source: '外部稽核', category: ['資訊'], clause: 'A.7.5.3', problemDesc: '3 份程序書紙本與電子版本不一致。', occurrence: '外部稽核時發現文管系統的版本控制未正確同步。', correctiveAction: '已回收舊版並重新分發正確版本。', correctiveDueDate: fut(1), rootCause: '文管系統未自動通知換版，且無版本確認機制。', rootElimination: '導入自動版次通知功能，新增版本確認簽收流程。', rootElimDueDate: fut(1), riskDesc: '', riskAcceptor: '', riskAcceptDate: null, riskAssessDate: null, reviewResult: '', reviewer: '', reviewDate: null, trackings: [{ tracker: '張稽核員', trackDate: past(5), execution: '已完成舊版回收，新版已分發至各單位。', trackNote: '電子版已同步更新，需確認紙本是否全部替換。', result: '持續追蹤', nextTrackDate: fut(7), reviewer: '張稽核員', reviewDate: past(5) }], status: STATUSES.TRACKING, createdAt: ago(14), updatedAt: ago(5), closedDate: null, evidence: [], history: [{ time: ago(14), action: '開立矯正單', user: '王經理' }, { time: ago(14), action: '狀態變更為「待矯正」', user: '系統' }, { time: ago(10), action: '劉文管人員 提交矯正措施提案', user: '劉文管人員' }, { time: ago(10), action: '狀態變更為「已提案」', user: '系統' }, { time: ago(7), action: '狀態變更為「審核中」', user: '張稽核員' }, { time: ago(5), action: '狀態變更為「追蹤中」', user: '張稽核員' }, { time: ago(5), action: '第 1 次追蹤 — 持續追蹤', user: '張稽核員' }] }
      ];
      d.nextId = 5;
      saveData(d);
    }

    return {
      getCorrectionYear,
      normalizeRocYear,
      buildScopedRecordPrefix,
      parseScopedRecordId,
      buildScopedRecordId,
      getNextScopedRecordSequence,
      buildCorrectionDocumentNo,
      parseCorrectionAutoId,
      buildAutoCarIdByDocument,
      buildAutoCarId,
      getNextCorrectionSequence,
      buildChecklistDocumentNo,
      parseChecklistId,
      buildChecklistIdByDocument,
      getNextChecklistSequence,
      buildTrainingFormDocumentNo,
      parseTrainingFormId,
      buildTrainingFormIdByDocument,
      getNextTrainingFormSequence,
      getFileExtension,
      buildUploadSignature,
      validateUploadFile,
      prepareUploadBatch,
      compareTrainingRosterEntries,
      sortTrainingRosterEntries,
      csvCell,
      downloadCsvFile,
      downloadWorkbook,
      exportTrainingSummaryCsv,
      exportTrainingDetailCsv,
      getRocDateParts,
      buildTrainingPrintHtml,
      printTrainingSheet,
      normalizeTrainingImportHeader,
      buildTrainingRosterHeaderMap,
      resolveTrainingImportTargetUnit,
      parseTrainingRosterCells,
      parseTrainingRosterImport,
      parseTrainingRosterWorkbook,
      mergeTrainingRows,
      seedData
    };
  };
})();
