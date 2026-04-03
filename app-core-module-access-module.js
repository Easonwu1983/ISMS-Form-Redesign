// @ts-check
(function () {
  window.createAppCoreModuleAccessModule = function createAppCoreModuleAccessModule() {
    function createAccess(deps) {
      let unitModuleApi = null;
      let uiModuleApi = null;
      let attachmentModuleApi = null;
      let policyModuleApi = null;
      let workflowSupportModuleApi = null;
      let dataModuleApi = null;
      let authModuleApi = null;
      let runtimeAssetLoaderModuleApi = null;

      function getUnitModule() {
        if (unitModuleApi) return unitModuleApi;
        unitModuleApi = deps.resolveFactoryService('unitModule', {
          factory: function () {
            if (typeof window === 'undefined' || typeof window.createUnitModule !== 'function') {
              throw new Error('unit-module.js not loaded');
            }
            return window.createUnitModule({
              UNIT_CUSTOM_VALUE: deps.UNIT_CUSTOM_VALUE,
              UNIT_CUSTOM_LABEL: deps.UNIT_CUSTOM_LABEL,
              UNIT_ADMIN_PRIMARY_WHITELIST: deps.UNIT_ADMIN_PRIMARY_WHITELIST,
              UNIT_ACADEMIC_PRIMARY_WHITELIST: deps.UNIT_ACADEMIC_PRIMARY_WHITELIST,
              loadData: function () { return deps.getDataModule().loadData(); },
              saveData: function (data) { return deps.getDataModule().saveData(data); },
              loadChecklists: function () { return deps.getDataModule().loadChecklists(); },
              saveChecklists: function (store) { return deps.getDataModule().saveChecklists(store); },
              loadTrainingStore: function () { return deps.getDataModule().loadTrainingStore(); },
              saveTrainingStore: function (store) { return deps.getDataModule().saveTrainingStore(store); },
              loadUnitReviewStore: function () { return deps.getDataModule().loadUnitReviewStore(); },
              saveUnitReviewStore: function (store) { return deps.getDataModule().saveUnitReviewStore(store); },
              getAuthorizedUnits: function (user) { return deps.getDataModule().getAuthorizedUnits(user); },
              syncSessionUnit: function (sourceUnit, targetUnit) { return deps.getAuthModule().syncSessionUnit(sourceUnit, targetUnit); },
              isAdmin: function () { return deps.getPolicyModule().isAdmin(); },
              esc: function (value) { return deps.getUiModule().esc(value); }
            });
          },
          globalSlot: '_unitModule'
        });
        return unitModuleApi;
      }

      function getUiModule() {
        if (uiModuleApi) return uiModuleApi;
        uiModuleApi = deps.resolveFactoryService('uiModule', {
          factory: function () {
            if (typeof window === 'undefined' || typeof window.createUiModule !== 'function') {
              throw new Error('ui-module.js not loaded');
            }
            return window.createUiModule();
          },
          globalSlot: '_uiModule'
        });
        return uiModuleApi;
      }

      function getAttachmentModule() {
        if (attachmentModuleApi) return attachmentModuleApi;
        if (typeof window === 'undefined' || typeof window.createAttachmentModule !== 'function') {
          throw new Error('attachment-module.js not loaded');
        }
        attachmentModuleApi = window.createAttachmentModule({
          esc: function (value) { return deps.getUiModule().esc(value); },
          toast: function (message, type) { return deps.getUiModule().toast(message, type); },
          getBackendMode: function () { return deps.getAttachmentsMode(); },
          fetchRemoteAttachmentDetail: function (entry) { return deps.fetchRemoteAttachmentDetail(entry); },
          fetchRemoteAttachmentBlob: function (entry) { return deps.fetchRemoteAttachmentBlob(entry); }
        });
        window._attachmentModule = attachmentModuleApi;
        return attachmentModuleApi;
      }

      function getPolicyModule() {
        if (policyModuleApi) return policyModuleApi;
        policyModuleApi = deps.resolveFactoryService('policyModule', {
          factory: function () {
            if (typeof window === 'undefined' || typeof window.createPolicyModule !== 'function') {
              throw new Error('policy-module.js not loaded');
            }
            return window.createPolicyModule({
              ROLES: deps.ROLES,
              STATUSES: deps.STATUSES,
              TRAINING_STATUSES: deps.TRAINING_STATUSES,
              TRAINING_UNDO_WINDOW_MINUTES: deps.TRAINING_UNDO_WINDOW_MINUTES,
              currentUser: function () { return deps.getAuthModule().currentUser(); },
              getAuthorizedUnits: function (user) { return deps.getDataModule().getAuthorizedUnits(user); },
              getReviewUnits: function (user) { return deps.getDataModule().getReviewUnits(user); },
              getAccessProfile: function (user) { return deps.getDataModule().getAccessProfile(user); },
              getAccessProfileSignature: function (user) { return deps.getDataModule().getAccessProfileSignature(user); },
              getActiveUnit: function (user) { return deps.getDataModule().getActiveUnit(user); },
              getStoreTouchToken: function (key) { return deps.getDataModule().getStoreTouchToken(key); },
              getUnitGovernanceMode: function (unit) { return deps.getDataModule().getUnitGovernanceMode(unit); },
              splitUnitValue: function (value) { return deps.getUnitModule().splitUnitValue(value); },
              getAllItems: function () { return deps.getDataModule().getAllItems(); },
              getAllChecklists: function () { return deps.getDataModule().getAllChecklists(); },
              getAllTrainingForms: function () { return deps.getDataModule().getAllTrainingForms(); },
              isChecklistDraftStatus: function (status) { return deps.getDataModule().isChecklistDraftStatus(status); },
              isReviewScopeEnforced: function () { return deps.getReviewScopeRepositoryState().ready === true && deps.getReviewScopesMode() === 'm365-api'; }
            });
          },
          globalSlot: '_policyModule'
        });
        return policyModuleApi;
      }

      function getRuntimeAssetLoaderModule() {
        if (runtimeAssetLoaderModuleApi) return runtimeAssetLoaderModuleApi;
        if (typeof window === 'undefined' || typeof window.createRuntimeAssetLoaderModule !== 'function') {
          throw new Error('runtime-asset-loader-module.js not loaded');
        }
        runtimeAssetLoaderModuleApi = window.createRuntimeAssetLoaderModule();
        window._runtimeAssetLoaderModule = runtimeAssetLoaderModuleApi;
        return runtimeAssetLoaderModuleApi;
      }

      function getWorkflowSupportModule() {
        if (workflowSupportModuleApi) return workflowSupportModuleApi;
        if (typeof window === 'undefined' || typeof window.createWorkflowSupportModule !== 'function') {
          throw new Error('workflow-support-module.js not loaded');
        }
        workflowSupportModuleApi = window.createWorkflowSupportModule({
          DEFAULT_USERS: deps.DEFAULT_USERS,
          STATUSES: deps.STATUSES,
          TRAINING_GENERAL_LABEL: deps.TRAINING_GENERAL_LABEL,
          TRAINING_INFO_STAFF_LABEL: deps.TRAINING_INFO_STAFF_LABEL,
          TRAINING_PROFESSIONAL_LABEL: deps.TRAINING_PROFESSIONAL_LABEL,
          getUnitCode: deps.getUnitCode,
          getOfficialUnitMeta: deps.getOfficialUnitMeta,
          getApprovedCustomUnits: function () { return deps.loadUnitReviewStore().approvedUnits.map((entry) => String(entry && entry.unit || '').trim()).filter(Boolean); },
          composeUnitValue: deps.composeUnitValue,
          loadData: deps.loadData,
          saveData: deps.saveData,
          getTrainingRosterByUnit: deps.getTrainingRosterByUnit,
          normalizeTrainingRecordRow: deps.normalizeTrainingRecordRow,
          computeTrainingSummary: deps.computeTrainingSummary,
          getTrainingStatsUnit: deps.getTrainingStatsUnit,
          getTrainingJobUnit: deps.getTrainingJobUnit,
          getTrainingProfessionalDisplay: deps.getTrainingProfessionalDisplay,
          getTrainingRecordHint: deps.getTrainingRecordHint,
          fmt: deps.fmt,
          fmtTime: deps.fmtTime,
          toast: deps.toast,
          esc: deps.esc,
          ensureXlsxLoaded: function () { return getRuntimeAssetLoaderModule().ensureXlsxLoaded(); }
        });
        window._workflowSupportModule = workflowSupportModuleApi;
        return workflowSupportModuleApi;
      }

      function getDataModule() {
        if (dataModuleApi) return dataModuleApi;
        dataModuleApi = deps.resolveFactoryService('dataModule', {
          factory: function () {
            if (typeof window === 'undefined' || typeof window.createDataModule !== 'function') {
              throw new Error('data-module.js not loaded');
            }
            return window.createDataModule({
              DATA_KEY: deps.DATA_KEY,
              AUTH_KEY: deps.AUTH_KEY,
              CHECKLIST_KEY: deps.CHECKLIST_KEY,
              TEMPLATE_KEY: deps.TEMPLATE_KEY,
              TRAINING_KEY: deps.TRAINING_KEY,
              LOGIN_LOG_KEY: deps.LOGIN_LOG_KEY,
              UNIT_REVIEW_KEY: deps.UNIT_REVIEW_KEY,
              UNIT_CONTACT_APP_KEY: deps.UNIT_CONTACT_APP_KEY,
              DEFAULT_USERS: deps.DEFAULT_USERS,
              DEFAULT_CHECKLIST_SECTIONS: deps.getDefaultChecklistSections(),
              ROLES: deps.ROLES,
              CHECKLIST_STATUS_DRAFT: deps.CHECKLIST_STATUS_DRAFT,
              CHECKLIST_STATUS_SUBMITTED: deps.CHECKLIST_STATUS_SUBMITTED,
              TRAINING_STATUSES: deps.TRAINING_STATUSES,
              TRAINING_EMPLOYEE_STATUS: deps.TRAINING_EMPLOYEE_STATUS,
              getUnitCode: deps.getUnitCode,
              buildCorrectionDocumentNo: deps.buildCorrectionDocumentNo,
              parseCorrectionAutoId: deps.parseCorrectionAutoId,
              getNextCorrectionSequence: deps.getNextCorrectionSequence,
              buildAutoCarIdByDocument: deps.buildAutoCarIdByDocument,
              buildChecklistDocumentNo: deps.buildChecklistDocumentNo,
              parseChecklistId: deps.parseChecklistId,
              buildChecklistIdByDocument: deps.buildChecklistIdByDocument,
              getNextChecklistSequence: deps.getNextChecklistSequence,
              getTrainingStatsUnit: deps.getTrainingStatsUnit,
              getTrainingJobUnit: deps.getTrainingJobUnit,
              hasTrainingValue: deps.hasTrainingValue,
              isTrainingBooleanValue: deps.isTrainingBooleanValue,
              normalizeTrainingProfessionalValue: deps.normalizeTrainingProfessionalValue,
              computeTrainingSummary: deps.computeTrainingSummary,
              buildTrainingFormDocumentNo: deps.buildTrainingFormDocumentNo,
              parseTrainingFormId: deps.parseTrainingFormId,
              buildTrainingFormIdByDocument: deps.buildTrainingFormIdByDocument,
              getNextTrainingFormSequence: deps.getNextTrainingFormSequence
            });
          },
          globalSlot: '_dataModule'
        });
        return dataModuleApi;
      }

      function getAuthModule() {
        if (authModuleApi) return authModuleApi;
        authModuleApi = deps.resolveFactoryService('authModule', {
          factory: function () {
            if (typeof window === 'undefined' || typeof window.createAuthModule !== 'function') {
              throw new Error('auth-module.js not loaded');
            }
            return window.createAuthModule({
              AUTH_KEY: deps.AUTH_KEY,
              DATA_KEY: deps.DATA_KEY,
              ROLES: deps.ROLES,
              DEFAULT_USERS: deps.DEFAULT_USERS,
              loadData: function () { return deps.getDataModule().loadData(); },
              saveData: function (data) { return deps.getDataModule().saveData(data); },
              getStoreTouchToken: function (key) { return deps.getDataModule().getStoreTouchToken(key); },
              getAuthorizedUnits: function (user) { return deps.getDataModule().getAuthorizedUnits(user); },
              getActiveUnit: function (user) { return deps.getDataModule().getActiveUnit(user); },
              normalizeUserRecord: function (user) { return deps.getDataModule().normalizeUserRecord(user); },
              findUser: function (username) { return deps.getDataModule().findUser(username); },
              findUserByEmail: function (email) { return deps.getDataModule().findUserByEmail(email); },
              updateUser: function (username, updates) { return deps.getDataModule().updateUser(username, updates); },
              addLoginLog: function (username, user, success) { return deps.getDataModule().addLoginLog(username, user, success); },
              loginWithBackend: deps.submitBackendLogin,
              logoutWithBackend: deps.submitAuthLogout,
              resetPasswordWithBackend: deps.submitAuthResetPasswordByEmail,
              redeemResetPasswordWithBackend: deps.submitAuthRedeemResetPassword,
              changePasswordWithBackend: deps.submitAuthChangePassword
            });
          },
          globalSlot: '_authModule'
        });
        return authModuleApi;
      }

      return {
        getUnitModule: getUnitModule,
        getUiModule: getUiModule,
        getAttachmentModule: getAttachmentModule,
        getPolicyModule: getPolicyModule,
        getRuntimeAssetLoaderModule: getRuntimeAssetLoaderModule,
        getWorkflowSupportModule: getWorkflowSupportModule,
        getDataModule: getDataModule,
        getAuthModule: getAuthModule
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
