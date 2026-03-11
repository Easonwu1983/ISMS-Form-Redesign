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
      esc
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
      if (/^\d{1,3}$/.test(raw)) return String(Number(raw)).padStart(3, '0');
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
      const fileLabel = String(opts.fileLabel || '檔案').trim();
      const allowedExtensions = Array.isArray(opts.allowedExtensions) ? opts.allowedExtensions.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean) : [];
      const allowedMimeTypes = Array.isArray(opts.allowedMimeTypes) ? opts.allowedMimeTypes.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean) : [];
      const maxSize = Number(opts.maxSize || 0);
      const maxSizeLabel = String(opts.maxSizeLabel || '').trim() || (maxSize ? (Math.round(maxSize / (1024 * 1024)) + 'MB') : '');
      const name = String(file?.name || '').trim();
      const type = String(file?.type || '').trim().toLowerCase();
      const size = Number(file?.size || 0);
      const extension = getFileExtension(name);

      if (!name) {
        return { ok: false, message: `${fileLabel}缺少檔名，請重新選擇`, meta: null };
      }
      if (!size || size <= 0) {
        return { ok: false, message: `「${name}」是空檔，請重新輸出或掃描後再上傳`, meta: null };
      }
      if (maxSize > 0 && size > maxSize) {
        return { ok: false, message: `「${name}」超過 ${maxSizeLabel}`, meta: null };
      }
      if (allowedExtensions.length && !allowedExtensions.includes(extension)) {
        return { ok: false, message: `「${name}」副檔名不支援，僅接受 ${allowedExtensions.map((entry) => '.' + entry).join('、')}`, meta: null };
      }
      if (allowedMimeTypes.length && type && type !== 'application/octet-stream' && !allowedMimeTypes.some((rule) => matchesMimeRule(type, rule))) {
        return { ok: false, message: `「${name}」檔案格式不支援`, meta: null };
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
          errors.push(checked.message || '檔案驗證失敗');
          return;
        }
        if (known.has(checked.meta.signature)) {
          errors.push(`「${checked.meta.name}」已重複上傳`);
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
      if (text.includes(',') || text.includes('"') || text.includes('\n')) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    }

    function downloadWorkbook(filename, sheets) {
      if (typeof window === 'undefined' || !window.XLSX) {
        toast('Excel 模組尚未載入，請重新整理頁面後再試', 'error');
        return false;
      }
      const workbook = window.XLSX.utils.book_new();
      (Array.isArray(sheets) ? sheets : []).forEach((sheet, index) => {
        const name = String(sheet?.name || `Sheet${index + 1}`).slice(0, 31) || `Sheet${index + 1}`;
        const worksheet = window.XLSX.utils.aoa_to_sheet(Array.isArray(sheet?.rows) ? sheet.rows : []);
        window.XLSX.utils.book_append_sheet(workbook, worksheet, name);
      });
      window.XLSX.writeFile(workbook, filename);
      return true;
    }

    function exportTrainingSummaryCsv(forms, filename) {
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
      downloadWorkbook(filename || ('資安教育訓練統計總表_' + new Date().toISOString().slice(0, 10) + '.xlsx'), [{
        name: '統計總表',
        rows: [['編號', '統計單位', '填報單位', '年度', '狀態', '經辦人', '聯絡電話', '聯絡信箱', '單位總人數(人)', '已完成人數(人)', '未完成人數(人)', '單位達成比率', '填表日期', '流程一完成時間', '整體完成時間', '最後更新']].concat(rows)
      }]);
    }

    function exportTrainingDetailCsv(form) {
      const rows = (form.records || []).map((row, index) => [
        form.id,
        form.statsUnit || getTrainingStatsUnit(form.unit),
        form.unit,
        form.trainingYear,
        form.fillerName,
        index + 1,
        row.name,
        row.l1Unit || '',
        row.unitName || '',
        row.identity || '',
        row.jobTitle || '',
        row.status || '',
        row.completedGeneral || '',
        row.isInfoStaff || '',
        getTrainingProfessionalDisplay(row),
        getTrainingRecordHint(row),
        row.note || ''
      ]);
      downloadWorkbook('資安教育訓練明細_' + form.id + '.xlsx', [{
        name: '逐人明細',
        rows: [['填報單編號', '統計單位', '填報單位', '年度', '經辦人', '序號', '姓名', '一級單位', '本職單位', '身分別', '職稱', '在職狀態', TRAINING_GENERAL_LABEL, TRAINING_INFO_STAFF_LABEL, TRAINING_PROFESSIONAL_LABEL, '判定說明', '備註']].concat(rows)
      }]);
    }

    function getRocDateParts(value) {
      const date = value ? new Date(value) : new Date();
      if (!Number.isFinite(date.getTime())) return { year: '', month: '', day: '' };
      return {
        year: String(date.getFullYear() - 1911),
        month: String(date.getMonth() + 1),
        day: String(date.getDate())
      };
    }

    function buildTrainingPrintHtml(payload) {
      const summary = payload.summary || computeTrainingSummary(payload.records || []);
      const unitName = payload.statsUnit || getTrainingStatsUnit(payload.unit);
      const rocDate = getRocDateParts(payload.fillDate);
      return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>資安教育訓練簽核表</title><style>body{font-family:"Noto Sans TC",sans-serif;color:#111827;margin:0;padding:24px}.sheet{max-width:960px;margin:0 auto}h1{font-size:24px;text-align:center;margin:0 0 18px}.meta,.summary{width:100%;border-collapse:collapse;margin-bottom:18px}.meta th,.meta td,.summary th,.summary td{border:1px solid #111827;padding:10px 12px;font-size:14px;vertical-align:top}.meta th,.summary th{background:#f8fafc;text-align:left;width:18%}.summary-note{display:block;margin-top:4px;font-size:12px;color:#475569;font-weight:400}.statement,.notes{font-size:13px;line-height:1.8;color:#111827}.notes-title{font-weight:700;margin:14px 0 6px}.notes ol{padding-left:20px;margin:6px 0 0}.sign-row{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px;align-items:end;margin-top:22px}.sign-box{border:2px solid #111827;height:120px;padding:12px;font-size:16px;display:flex;align-items:flex-start;justify-content:flex-start}</style></head><body><div class="sheet"><h1>' + esc(payload.trainingYear || '') + '年國立臺灣大學資通安全教育訓練執行情形</h1><table class="meta"><tr><th>一級單位</th><td>' + esc(unitName || '未指定') + '</td><th>填表日期</th><td>' + esc(rocDate.year) + '年' + esc(rocDate.month) + '月' + esc(rocDate.day) + '日</td></tr><tr><th>經辦人</th><td>' + esc(payload.fillerName || payload.submitterName || '') + '</td><th>聯絡電話</th><td>' + esc(payload.submitterPhone || '') + '</td></tr><tr><th>聯絡信箱</th><td colspan="3">' + esc(payload.submitterEmail || '') + '</td></tr></table><table class="summary"><tr><th>單位總人數(人)<span class="summary-note">（勿自行填寫）</span></th><th>單位達成比率<span class="summary-note">（勿自行填寫）</span></th><th>未完成人數(人)<span class="summary-note">（勿自行填寫）</span></th><th>已完成人數(人)<span class="summary-note">（勿自行填寫）</span></th></tr><tr><td>' + (summary.activeCount || 0) + '</td><td>' + (summary.completionRate || 0) + '%</td><td>' + (summary.incompleteCount || 0) + '</td><td>' + (summary.completedCount || 0) + '</td></tr></table><div class="statement">單位是否已留存單位人員教育訓練佐證：是，本單位已留存單位人員教育訓練佐證。</div><div class="notes"><div class="notes-title">資通安全教育訓練統計注意事項:</div><ol><li>此表單將會作為校內資通安全二方稽核依據,請單位確實辦理。</li><li>請單位自行留存單位人員教育訓練佐證,佐證將於資通安全二方稽核時抽查審閱。</li><li>教育訓練佐證應包含:人員姓名、人員職稱、已完成之課程名稱、認證時數之單位、認證時數、完成課程之日期。</li><li>教育訓練佐證範例(皆須含上述內容):課程證書、認證時數之單位往來信件截圖、相關教育訓練系統截圖(如:公務人員終身學習網站-個人資料夾-查詢學習時數、e等公務員學習平台-個人專區-學習紀錄查詢時數、臺灣大學資通盤點系統-其他服務-研習證明-證書清單)。</li><li>線上資安教育訓練資源可參考本校網站:https://isms.ntu.edu.tw/e-learning.html (網站路徑:計中網站-資安專區-資通安全管理-教育訓練-線上課程資源)。</li></ol></div><div class="sign-row"><div></div><div class="sign-box">一級主管</div></div></div></body></html>';
    }

    function printTrainingSheet(payload) {
      const win = window.open('', '_blank', 'width=980,height=800');
      if (!win) {
        toast('無法開啟列印視窗，請確認瀏覽器未封鎖彈出視窗', 'error');
        return;
      }
      win.document.open();
      win.document.write(buildTrainingPrintHtml(payload));
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 250);
    }

    function normalizeTrainingImportHeader(value) {
      return String(value || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[\s\u3000]+/g, '')
        .replace(/[()（）]/g, '')
        .replace(/[／/]/g, '')
        .replace(/[._\-]/g, '');
    }

    function buildTrainingRosterHeaderMap(cells) {
      const headerAliases = {
        name: ['姓名', '人員姓名', 'name'],
        unitName: ['本職單位', '服務單位', '單位', '本單位', '任職單位'],
        identity: ['身分別', '身份別', '身分類別', '人員身分', '身份類別'],
        jobTitle: ['職稱', '職務', 'title'],
        unit: ['填報單位', '受填報單位', '單位代填', '歸屬單位'],
        statsUnit: ['統計單位', '一級單位']
      };
      const normalizedCells = (Array.isArray(cells) ? cells : []).map((cell) => normalizeTrainingImportHeader(cell));
      const map = {};
      Object.keys(headerAliases).forEach((key) => {
        const idx = normalizedCells.findIndex((cell) => headerAliases[key].some((alias) => cell === normalizeTrainingImportHeader(alias)));
        if (idx >= 0) map[key] = idx;
      });
      return map.name >= 0 ? map : null;
    }

    function resolveTrainingImportTargetUnit(defaultUnit, rawUnit, rawStatsUnit) {
      const selectedUnit = String(defaultUnit || '').trim();
      const unitText = String(rawUnit || '').trim().replace(/\//g, '／');
      const statsText = String(rawStatsUnit || '').trim().replace(/\//g, '／');
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
      const getCell = (key, fallbackIndex) => {
        if (headerMap && Number.isInteger(headerMap[key])) return clean[headerMap[key]] || '';
        return clean[fallbackIndex] || '';
      };
      const firstCell = getCell('name', 0);
      if (!firstCell || firstCell === '姓名') return null;
      const importedUnit = resolveTrainingImportTargetUnit(unit, getCell('unit', -1), getCell('statsUnit', -1));
      return {
        unit: importedUnit,
        name: firstCell,
        unitName: getCell('unitName', 1) || getTrainingJobUnit(importedUnit || unit),
        identity: getCell('identity', 2) || '',
        jobTitle: getCell('jobTitle', 3) || ''
      };
    }

    function parseTrainingRosterImport(text, unit) {
      const rows = String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.includes('\t') ? line.split('\t') : line.split(',')));
      const headerMap = rows.length ? buildTrainingRosterHeaderMap(rows[0]) : null;
      const dataRows = headerMap ? rows.slice(1) : rows;
      return dataRows.map((parts) => parseTrainingRosterCells(parts, unit, headerMap)).filter((row) => row && row.name);
    }

    function parseTrainingRosterWorkbook(file, unit) {
      return new Promise((resolve, reject) => {
        if (!file) {
          resolve([]);
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            if (typeof window === 'undefined' || !window.XLSX) throw new Error('Excel 模組尚未載入');
            const workbook = window.XLSX.read(event.target.result, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) {
              resolve([]);
              return;
            }
            const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, raw: false, defval: '' });
            const headerMap = rows.length ? buildTrainingRosterHeaderMap(rows[0]) : null;
            const dataRows = headerMap ? rows.slice(1) : rows;
            resolve(dataRows.map((cells) => parseTrainingRosterCells(cells, unit, headerMap)).filter((row) => row && row.name));
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('無法讀取匯入檔案'));
        reader.readAsArrayBuffer(file);
      });
    }

    function mergeTrainingRows(targetUnit, carryRows) {
      const carry = Array.isArray(carryRows) ? carryRows.map((row) => normalizeTrainingRecordRow(row, targetUnit)) : [];
      const rosterRows = targetUnit ? getTrainingRosterByUnit(targetUnit).map((row) => {
        const existing = carry.find((item) => (item.rosterId && item.rosterId === row.id) || item.name === row.name);
        return normalizeTrainingRecordRow({
          ...row,
          ...existing,
          rosterId: row.id,
          unit: targetUnit,
          statsUnit: row.statsUnit || getTrainingStatsUnit(targetUnit),
          unitName: existing?.unitName || row.unitName || getTrainingJobUnit(targetUnit),
          identity: existing?.identity || row.identity || '',
          jobTitle: existing?.jobTitle || row.jobTitle || '',
          source: existing?.source || row.source || 'import',
          status: existing?.status || '',
          completedGeneral: existing?.completedGeneral || '',
          isInfoStaff: existing?.isInfoStaff || '',
          completedProfessional: existing?.completedProfessional || '',
          note: existing?.note || ''
        }, targetUnit);
      }) : [];
      carry.forEach((row) => {
        const exists = rosterRows.some((item) => (row.rosterId && item.rosterId === row.rosterId) || item.name === row.name);
        if (!exists) rosterRows.push(normalizeTrainingRecordRow(row, targetUnit || row.unit));
      });
      return rosterRows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
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
      csvCell,
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
