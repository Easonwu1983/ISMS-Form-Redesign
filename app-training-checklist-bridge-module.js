(function () {
  'use strict';

  window.createAppTrainingChecklistBridgeModule = function createAppTrainingChecklistBridgeModule() {
    function createAccess(deps) {
      const options = deps && typeof deps === 'object' ? deps : {};
      const CHECKLIST_KEY = String(options.CHECKLIST_KEY || '').trim();
      const TRAINING_KEY = String(options.TRAINING_KEY || '').trim();
      const trainingGeneralLabel = String(options.trainingGeneralLabel || '').trim();
      const trainingInfoStaffLabel = String(options.trainingInfoStaffLabel || '').trim();
      const trainingProfessionalLabel = String(options.trainingProfessionalLabel || '').trim();
      const trainingBooleanOptions = Array.isArray(options.trainingBooleanOptions)
        ? options.trainingBooleanOptions.slice()
        : [];
      const getDataModule = typeof options.getDataModule === 'function' ? options.getDataModule : function () { return null; };
      const getWorkflowSupportModule = typeof options.getWorkflowSupportModule === 'function' ? options.getWorkflowSupportModule : function () { return null; };
      const getPolicyModule = typeof options.getPolicyModule === 'function' ? options.getPolicyModule : function () { return null; };
      const currentUser = typeof options.currentUser === 'function' ? options.currentUser : function () { return null; };
      const getSystemUnits = typeof options.getSystemUnits === 'function' ? options.getSystemUnits : function () { return []; };
      const getUnitCode = typeof options.getUnitCode === 'function' ? options.getUnitCode : function () { return ''; };
      const splitUnitValue = typeof options.splitUnitValue === 'function' ? options.splitUnitValue : function (value) {
        return { parent: String(value || '').trim(), child: '' };
      };

      const checklistCollectionCache = { token: '', items: null };
      const trainingFormsCollectionCache = { token: '', items: null };
      const trainingRosterCollectionCache = { token: '', items: null };

      function getStoreTouchToken(key) {
        return getDataModule().getStoreTouchToken(key);
      }

      function getCachedStoreCollection(storeKey, cache, loader) {
        const token = String(getStoreTouchToken(storeKey) || '0');
        if (cache.token !== token || !Array.isArray(cache.items)) {
          const items = typeof loader === 'function' ? loader() : [];
          cache.token = token;
          cache.items = Array.isArray(items) ? items.slice() : [];
        }
        return cache.items.slice();
      }

      function normalizeChecklistStatus(status) { return getDataModule().normalizeChecklistStatus(status); }
      function isChecklistDraftStatus(status) { return getDataModule().isChecklistDraftStatus(status); }
      function normalizeChecklistItem(item) { return getDataModule().normalizeChecklistItem(item); }
      function loadChecklists() { return getDataModule().loadChecklists(); }
      function saveChecklists(store) { return getDataModule().saveChecklists(store); }
      function getAllChecklists() {
        return getCachedStoreCollection(CHECKLIST_KEY, checklistCollectionCache, function () {
          return getDataModule().getAllChecklists();
        });
      }
      function getChecklist(id) { return getDataModule().getChecklist(id); }
      function addChecklist(item) { return getDataModule().addChecklist(item); }
      function updateChecklist(id, updates) { return getDataModule().updateChecklist(id, updates); }
      function getChecklistUnitCode(unit) { return getUnitCode(unit) || 'CHK'; }
      function buildChecklistDocumentNo(unit, auditYear, fillDate) { return getWorkflowSupportModule().buildChecklistDocumentNo(unit, auditYear, fillDate); }
      function parseChecklistId(value) { return getWorkflowSupportModule().parseChecklistId(value); }
      function buildChecklistIdByDocument(documentNo, sequence) { return getWorkflowSupportModule().buildChecklistIdByDocument(documentNo, sequence); }
      function getNextChecklistSequence(documentNo, items) { return getWorkflowSupportModule().getNextChecklistSequence(documentNo, items); }
      function generateChecklistId(unit) {
        const data = loadChecklists();
        const documentNo = buildChecklistDocumentNo(unit);
        if (!documentNo) throw new Error('Unable to derive checklist document number.');
        return buildChecklistIdByDocument(documentNo, getNextChecklistSequence(documentNo, data.items));
      }
      function generateChecklistIdForYear(unit, auditYear, fillDate) {
        const data = loadChecklists();
        const documentNo = buildChecklistDocumentNo(unit, auditYear, fillDate);
        if (!documentNo) throw new Error('Unable to derive checklist document number.');
        return buildChecklistIdByDocument(documentNo, getNextChecklistSequence(documentNo, data.items));
      }
      function isChecklistOwner(item, user) { return getPolicyModule().isChecklistOwner(item, user || currentUser()); }
      function canAccessChecklist(item, user) { return getPolicyModule().canAccessChecklist(item, user || currentUser()); }
      function getVisibleChecklists(user) { return getPolicyModule().getVisibleChecklists(user || currentUser()); }
      function canEditChecklist(item, user) { return getPolicyModule().canEditChecklist(item, user || currentUser()); }
      function findExistingChecklistForUnitYear(unit, auditYear, excludeId) {
        const safeUnit = String(unit || '').trim();
        const safeYear = String(auditYear || '').trim();
        const skipId = String(excludeId || '').trim();
        if (!safeUnit || !safeYear) return null;
        return getAllChecklists()
          .filter((item) => item.unit === safeUnit && String(item.auditYear || '').trim() === safeYear && item.id !== skipId)
          .sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt))[0] || null;
      }
      function getLatestEditableChecklistDraft() {
        const drafts = getVisibleChecklists().filter((item) => isChecklistDraftStatus(item.status) && canEditChecklist(item));
        drafts.sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt));
        return drafts[0] || null;
      }

      function getTrainingStatsUnit(unit) {
        const parsed = splitUnitValue(unit || '');
        return String(parsed.parent || unit || '').trim();
      }

      function getTrainingJobUnit(unit, explicit) {
        const parsed = splitUnitValue(unit || '');
        return String(explicit || parsed.child || parsed.parent || unit || '').trim();
      }

      function hasTrainingValue(value) {
        return value !== undefined && value !== null && String(value).trim() !== '';
      }

      function isTrainingBooleanValue(value) {
        const normalized = String(value || '').trim();
        return normalized === '是' || normalized === '否';
      }

      function isTrainingBooleanCompatibleValue(value) {
        return trainingBooleanOptions.includes(String(value || '').trim());
      }

      function normalizeTrainingProfessionalValue(value) {
        const normalized = String(value || '').trim();
        if (!isTrainingBooleanCompatibleValue(normalized)) return '';
        if (normalized === '不適用' || normalized === '略過') return '不適用';
        return normalized;
      }

      function getStoredTrainingProfessionalValue(record) {
        if (!record || record.status !== '在職') return '';
        if (record.isInfoStaff === '否') return '不適用';
        return isTrainingBooleanValue(record.completedProfessional) ? record.completedProfessional : '';
      }

      function normalizeTrainingRosterRow(row, fallbackUnit) { return getDataModule().normalizeTrainingRosterRow(row, fallbackUnit); }
      function normalizeTrainingRecordState(record) { return getDataModule().normalizeTrainingRecordState(record); }
      function normalizeTrainingRecordRow(row, fallbackUnit) { return getDataModule().normalizeTrainingRecordRow(row, fallbackUnit); }
      function normalizeTrainingForm(form) { return getDataModule().normalizeTrainingForm(form); }
      function loadTrainingStore() { return getDataModule().loadTrainingStore(); }
      function saveTrainingStore(store) { return getDataModule().saveTrainingStore(store); }
      function getAllTrainingForms() {
        return getCachedStoreCollection(TRAINING_KEY, trainingFormsCollectionCache, function () {
          return getDataModule().getAllTrainingForms();
        });
      }
      function getTrainingForm(id) { return getDataModule().getTrainingForm(id); }
      function upsertTrainingForm(form) { return getDataModule().upsertTrainingForm(form); }
      function updateTrainingForm(id, updates) { return getDataModule().updateTrainingForm(id, updates); }
      function buildTrainingFormDocumentNo(unit, trainingYear, fillDate) { return getWorkflowSupportModule().buildTrainingFormDocumentNo(unit, trainingYear, fillDate); }
      function parseTrainingFormId(value) { return getWorkflowSupportModule().parseTrainingFormId(value); }
      function buildTrainingFormIdByDocument(documentNo, sequence) { return getWorkflowSupportModule().buildTrainingFormIdByDocument(documentNo, sequence); }
      function getNextTrainingFormSequence(documentNo, forms) { return getWorkflowSupportModule().getNextTrainingFormSequence(documentNo, forms); }
      function generateTrainingFormId(unit, trainingYear, fillDate) {
        const store = loadTrainingStore();
        const documentNo = buildTrainingFormDocumentNo(unit, trainingYear, fillDate);
        if (!documentNo) throw new Error('Unable to derive training document number.');
        return buildTrainingFormIdByDocument(documentNo, getNextTrainingFormSequence(documentNo, store.forms));
      }
      function getAllTrainingRosters() {
        return getCachedStoreCollection(TRAINING_KEY, trainingRosterCollectionCache, function () {
          return getDataModule().getAllTrainingRosters();
        });
      }
      function getTrainingRosterByUnit(unit) { return getDataModule().getTrainingRosterByUnit(unit); }
      function addTrainingRosterPerson(unit, payload, source, actor, actorUsername) { return getDataModule().addTrainingRosterPerson(unit, payload, source, actor, actorUsername); }
      function deleteTrainingRosterPerson(id) { return getDataModule().deleteTrainingRosterPerson(id); }
      function updateTrainingRosterPerson(id, updates) { return getDataModule().updateTrainingRosterPerson(id, updates); }
      function getTrainingUnits() { return getSystemUnits(); }
      function getVisibleTrainingForms(user) { return getPolicyModule().getVisibleTrainingForms(user || currentUser()); }
      function canEditTrainingForm(form, user) { return getPolicyModule().canEditTrainingForm(form, user || currentUser()); }
      function canManageTrainingForm(form, user) { return getPolicyModule().canManageTrainingForm(form, user || currentUser()); }
      function isTrainingManualRowOwner(row, user) { return getPolicyModule().isTrainingManualRowOwner(row, user || currentUser()); }
      function canDeleteTrainingEditableRow(row, form, user) { return getPolicyModule().canDeleteTrainingEditableRow(row, form, user || currentUser()); }
      function getTrainingUndoRemainingMs(form, now) { return getPolicyModule().getTrainingUndoRemainingMs(form, now === undefined ? Date.now() : now); }
      function getTrainingUndoRemainingMinutes(form, now) { return getPolicyModule().getTrainingUndoRemainingMinutes(form, now === undefined ? Date.now() : now); }
      function canUndoTrainingForm(form, user) { return getPolicyModule().canUndoTrainingForm(form, user || currentUser()); }
      function isTrainingVisible(form, user) { return getPolicyModule().isTrainingVisible(form, user || currentUser()); }
      function findExistingTrainingFormForUnitYear(unit, trainingYear, excludeId) {
        const safeUnit = String(unit || '').trim();
        const safeYear = String(trainingYear || '').trim();
        const skipId = String(excludeId || '').trim();
        if (!safeUnit || !safeYear) return null;
        return getAllTrainingForms()
          .filter((form) => form.unit === safeUnit && String(form.trainingYear || '').trim() === safeYear && form.id !== skipId)
          .sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt))[0] || null;
      }
      function isTrainingRecordReadyForSubmit(record) {
        if (!record || !record.status) return false;
        if (record.status !== '在職') return true;
        if (!isTrainingBooleanValue(record.completedGeneral)) return false;
        if (!isTrainingBooleanValue(record.isInfoStaff)) return false;
        if (record.isInfoStaff === '是') return isTrainingBooleanValue(record.completedProfessional);
        return true;
      }
      function isTrainingRecordComplete(record) {
        if (!record || record.status !== '在職') return false;
        if (record.completedGeneral !== '是') return false;
        if (record.isInfoStaff === '是') return record.completedProfessional === '是';
        return record.isInfoStaff === '否';
      }
      function getTrainingRecordHint(record) {
        if (!record.status) return 'Please choose employee status first.';
        if (record.status !== '在職') return 'Non-active staff is treated as informational only.';
        if (!isTrainingBooleanValue(record.completedGeneral)) return 'Please confirm ' + trainingGeneralLabel + '.';
        if (!isTrainingBooleanValue(record.isInfoStaff)) return 'Please confirm ' + trainingInfoStaffLabel + '.';
        if (record.isInfoStaff === '是' && !isTrainingBooleanValue(record.completedProfessional)) {
          return 'Please confirm ' + trainingProfessionalLabel + '.';
        }
        if (isTrainingRecordComplete(record)) return 'All required training is complete.';
        if (record.completedGeneral === '否') return 'General training is still missing.';
        if (record.isInfoStaff === '是' && record.completedProfessional === '否') return 'Professional training is still missing.';
        return 'Training information is pending.';
      }
      function getTrainingDecisionMeta(record) {
        if (!record.status) return { label: '待補', tone: 'pending' };
        if (record.status !== '在職') return { label: '免填', tone: 'muted' };
        if (!isTrainingRecordReadyForSubmit(record)) return { label: '待補資料', tone: 'pending' };
        if (isTrainingRecordComplete(record)) return { label: '已完成', tone: 'complete' };
        if (record.completedGeneral === '否') return { label: '一般訓練未完成', tone: 'risk' };
        if (record.isInfoStaff === '是' && record.completedProfessional === '否') return { label: '專業訓練未完成', tone: 'warning' };
        return { label: '未完成', tone: 'warning' };
      }
      function getTrainingProfessionalDisplay(record) {
        if (!record || record.status !== '在職') return '—';
        if (record.isInfoStaff === '否') return '不適用';
        return normalizeTrainingProfessionalValue(record.completedProfessional || record.completedInfo || '') || '—';
      }
      function computeTrainingSummary(records) {
        const rows = Array.isArray(records) ? records.map((row) => normalizeTrainingRecordRow(row, row.unit)) : [];
        const activeRows = rows.filter((row) => row.status === '在職');
        const completedRows = activeRows.filter((row) => isTrainingRecordComplete(row));
        const infoRows = activeRows.filter((row) => row.isInfoStaff === '是');
        const readyRows = activeRows.filter((row) => isTrainingRecordReadyForSubmit(row));
        const incompleteCount = activeRows.length - completedRows.length;
        const completionRate = activeRows.length > 0 ? Math.round((completedRows.length / activeRows.length) * 100) : 0;
        const professionalPendingCount = infoRows.filter((row) => row.completedProfessional !== '是').length;
        const missingStatusCount = rows.filter((row) => !row.status).length;
        const missingFieldCount = activeRows.filter((row) => !isTrainingRecordReadyForSubmit(row)).length;
        return {
          totalPeople: activeRows.length,
          activeCount: activeRows.length,
          totalRoster: rows.length,
          inactiveCount: rows.length - activeRows.length,
          completedCount: completedRows.length,
          readyCount: readyRows.length,
          incompleteCount,
          completionRate,
          reachRate: completionRate,
          reached: completedRows.length,
          infoStaffCount: infoRows.length,
          professionalPendingCount,
          missingStatusCount,
          missingFieldCount
        };
      }

      return {
        normalizeChecklistStatus,
        isChecklistDraftStatus,
        normalizeChecklistItem,
        loadChecklists,
        saveChecklists,
        getStoreTouchToken,
        getAllChecklists,
        getChecklist,
        addChecklist,
        updateChecklist,
        getChecklistUnitCode,
        buildChecklistDocumentNo,
        parseChecklistId,
        buildChecklistIdByDocument,
        getNextChecklistSequence,
        generateChecklistId,
        generateChecklistIdForYear,
        isChecklistOwner,
        canAccessChecklist,
        getVisibleChecklists,
        canEditChecklist,
        findExistingChecklistForUnitYear,
        getLatestEditableChecklistDraft,
        getTrainingStatsUnit,
        getTrainingJobUnit,
        hasTrainingValue,
        isTrainingBooleanValue,
        isTrainingBooleanCompatibleValue,
        normalizeTrainingProfessionalValue,
        getStoredTrainingProfessionalValue,
        normalizeTrainingRosterRow,
        normalizeTrainingRecordState,
        normalizeTrainingRecordRow,
        normalizeTrainingForm,
        loadTrainingStore,
        saveTrainingStore,
        getAllTrainingForms,
        getTrainingForm,
        upsertTrainingForm,
        updateTrainingForm,
        buildTrainingFormDocumentNo,
        parseTrainingFormId,
        buildTrainingFormIdByDocument,
        getNextTrainingFormSequence,
        generateTrainingFormId,
        getAllTrainingRosters,
        getTrainingRosterByUnit,
        addTrainingRosterPerson,
        deleteTrainingRosterPerson,
        updateTrainingRosterPerson,
        getTrainingUnits,
        getVisibleTrainingForms,
        canEditTrainingForm,
        canManageTrainingForm,
        isTrainingManualRowOwner,
        canDeleteTrainingEditableRow,
        getTrainingUndoRemainingMs,
        getTrainingUndoRemainingMinutes,
        canUndoTrainingForm,
        isTrainingVisible,
        findExistingTrainingFormForUnitYear,
        isTrainingRecordReadyForSubmit,
        isTrainingRecordComplete,
        getTrainingRecordHint,
        getTrainingDecisionMeta,
        getTrainingProfessionalDisplay,
        computeTrainingSummary
      };
    }

    return {
      createAccess
    };
  };
})();
