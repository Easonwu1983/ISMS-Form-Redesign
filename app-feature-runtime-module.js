(function () {
  window.createAppFeatureRuntimeModule = function createAppFeatureRuntimeModule() {
    function createAccess(deps) {
      const state = {
        adminModuleApi: null,
        caseModuleApi: null
      };

      function resolveFeature(factoryName, scriptName, stateKey, globalSlot, configBuilder) {
        if (state[stateKey]) return state[stateKey];
        if (typeof window === 'undefined' || typeof window[factoryName] !== 'function') {
          throw new Error(scriptName + ' not loaded');
        }
        state[stateKey] = window[factoryName](configBuilder());
        if (globalSlot) window[globalSlot] = state[stateKey];
        return state[stateKey];
      }

      function getAdminModule() {
        return resolveFeature('createAdminModule', 'admin-module.js', 'adminModuleApi', '_adminModule', function () {
          return {
            ROLES: deps.ROLES,
            ROLE_BADGE: deps.ROLE_BADGE,
            currentUser: deps.currentUser,
            isAdmin: deps.isAdmin,
            isUnitAdmin: deps.isUnitAdmin,
            canManageUsers: deps.canManageUsers,
            getUsers: deps.getUsers,
            getAuthorizedUnits: deps.getAuthorizedUnits,
            getReviewUnits: deps.getReviewUnits,
            parseUserUnits: deps.parseUserUnits,
            getUnitSearchEntries: deps.getUnitSearchEntries,
            splitUnitValue: deps.splitUnitValue,
            composeUnitValue: deps.composeUnitValue,
            findUser: deps.findUser,
            submitUserUpsert: deps.submitUserUpsert,
            submitUserDelete: deps.submitUserDelete,
            syncUsersFromM365: deps.syncUsersFromM365,
            submitReviewScopeReplace: deps.submitReviewScopeReplace,
            syncReviewScopesFromM365: deps.syncReviewScopesFromM365,
            getCustomUnitRegistry: deps.getCustomUnitRegistry,
            loadUnitReviewStore: deps.loadUnitReviewStore,
            getUnitGovernanceMode: deps.getUnitGovernanceMode,
            setUnitGovernanceMode: deps.setUnitGovernanceMode,
            getUnitGovernanceModes: deps.getUnitGovernanceModes,
            formatUnitScopeSummary: deps.formatUnitScopeSummary,
            approveCustomUnit: deps.approveCustomUnit,
            mergeCustomUnit: deps.mergeCustomUnit,
            loadLoginLogs: deps.loadLoginLogs,
            clearLoginLogs: deps.clearLoginLogs,
            fetchAuditTrailEntries: deps.fetchAuditTrailEntries,
            fetchAuditTrailHealth: deps.fetchAuditTrailHealth,
            listUnitContactApplications: function (filters) { return deps.getM365ApiClient().listUnitContactApplications(filters); },
            reviewUnitContactApplication: function (payload) { return deps.getM365ApiClient().reviewUnitContactApplication(payload); },
            activateUnitContactApplication: function (payload) { return deps.getM365ApiClient().activateUnitContactApplication(payload); },
            requestUnitContactAuthorizationDocument: function (applicationId, options) {
              const id = encodeURIComponent(String(applicationId || '').trim());
              const query = [];
              const email = String(options && options.email || '').trim().toLowerCase();
              const download = String(options && options.download || '').trim() === '1';
              if (email) query.push('email=' + encodeURIComponent(email));
              if (download) query.push('download=1');
              const suffix = query.length ? ('?' + query.join('&')) : '';
              return deps.requestSameOriginBlob('/api/unit-contact/applications/' + id + '/authorization-doc/content' + suffix, { method: 'GET' });
            },
            getSchemaHealth: function () { return deps.getDataModule().getSchemaHealth(); },
            migrateAllStores: function () { return deps.getDataModule().migrateAllStores(); },
            exportManagedStoreSnapshot: function () { return deps.getDataModule().exportManagedStoreSnapshot(); },
            getAttachmentHealth: deps.getAttachmentHealth,
            pruneOrphanAttachments: deps.pruneOrphanAttachments,
            exportSupportBundle: deps.exportSupportBundle,
            navigate: deps.navigate,
            toast: deps.toast,
            fmtTime: deps.fmtTime,
            esc: deps.esc,
            ic: deps.ic,
            refreshIcons: deps.refreshIcons,
            downloadJson: deps.downloadJson,
            buildUnitCascadeControl: deps.buildUnitCascadeControl,
            initUnitCascade: deps.initUnitCascade,
            registerActionHandlers: deps.registerActionHandlers,
            closeModalRoot: deps.closeModalRoot,
            getUnitContactApplication: deps.getUnitContactApplication
          };
        });
      }

      function getCaseModule() {
        return resolveFeature('createCaseModule', 'case-module.js', 'caseModuleApi', '_caseModule', function () {
          return {
            STATUSES: deps.STATUSES,
            STATUS_FLOW: deps.STATUS_FLOW,
            STATUS_CLASSES: deps.STATUS_CLASSES,
            DEF_TYPES: deps.DEF_TYPES,
            SOURCES: deps.SOURCES,
            CATEGORIES: deps.CATEGORIES,
            ROLES: deps.ROLES,
            currentUser: deps.currentUser,
            canCreateCAR: deps.canCreateCAR,
            canManageUsers: deps.canManageUsers,
            canReview: deps.canReview,
            canReviewItem: deps.canReviewItem,
            canAccessItem: deps.canAccessItem,
            canRespondItem: deps.canRespondItem,
            canSubmitTracking: deps.canSubmitTracking,
            isItemHandler: deps.isItemHandler,
            getVisibleItems: deps.getVisibleItems,
            getCurrentNextTrackingDate: deps.getCurrentNextTrackingDate,
            isOverdue: deps.isOverdue,
            getItem: deps.getItem,
            addItem: deps.addItem,
            updateItem: deps.updateItem,
            getUsers: deps.getUsers,
            loadData: deps.loadData,
            reserveCarId: deps.reserveCarId,
            normalizeCarIdInput: deps.normalizeCarIdInput,
            buildCorrectionDocumentNo: deps.buildCorrectionDocumentNo,
            getNextCorrectionSequence: deps.getNextCorrectionSequence,
            buildAutoCarIdByDocument: deps.buildAutoCarIdByDocument,
            parseCorrectionAutoId: deps.parseCorrectionAutoId,
            getUnitCode: deps.getUnitCode,
            getUnitCodeWithDots: deps.getUnitCodeWithDots,
            splitUnitValue: deps.splitUnitValue,
            getScopedUnit: deps.getScopedUnit,
            renderSidebar: deps.renderSidebar,
            navigate: deps.navigate,
            setUnsavedChangesGuard: deps.setUnsavedChangesGuard,
            clearUnsavedChangesGuard: deps.clearUnsavedChangesGuard,
            toast: deps.toast,
            fmt: deps.fmt,
            fmtTime: deps.fmtTime,
            esc: deps.esc,
            ic: deps.ic,
            mkChk: deps.mkChk,
            mkRadio: deps.mkRadio,
            refreshIcons: deps.refreshIcons,
            bindCopyButtons: deps.bindCopyButtons,
            renderCopyIdCell: deps.renderCopyIdCell,
            renderCopyIdButton: deps.renderCopyIdButton,
            prepareUploadBatch: deps.prepareUploadBatch,
            createTransientUploadEntry: deps.createTransientUploadEntry,
            revokeTransientUploadEntry: deps.revokeTransientUploadEntry,
            persistUploadedEntries: deps.persistUploadedEntries,
            renderAttachmentList: deps.renderAttachmentList,
            cleanupRenderedAttachmentUrls: deps.cleanupRenderedAttachmentUrls,
            buildUnitCascadeControl: deps.buildUnitCascadeControl,
            initUnitCascade: deps.initUnitCascade,
            syncCorrectiveActionsFromM365: deps.syncCorrectiveActionsFromM365,
            syncUsersFromM365: deps.syncUsersFromM365,
            submitCreateCase: deps.submitCreateCase,
            submitRespondCase: deps.submitRespondCase,
            submitReviewDecision: deps.submitReviewDecision,
            submitTrackingSubmission: deps.submitTrackingSubmission,
            submitTrackingReviewDecision: deps.submitTrackingReviewDecision,
            applyTestIds: deps.applyTestIds,
            applySelectorTestIds: deps.applySelectorTestIds,
            debugFlow: deps.debugFlow,
            registerActionHandlers: deps.registerActionHandlers,
            openConfirmDialog: deps.openConfirmDialog
          };
        });
      }

      return {
        getAdminModule: getAdminModule,
        getCaseModule: getCaseModule
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
