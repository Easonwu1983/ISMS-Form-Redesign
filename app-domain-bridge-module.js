(function () {
  window.createAppDomainBridgeModule = function createAppDomainBridgeModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};

      function getUnitModule() { return opts.getUnitModule(); }
      function getWorkflowSupportModule() { return opts.getWorkflowSupportModule(); }
      function getDataModule() { return opts.getDataModule(); }
      function getAuthModule() { return opts.getAuthModule(); }
      function getPolicyModule() { return opts.getPolicyModule(); }

      function getFallbackUser(user) {
        return arguments.length ? user : getAuthModule().currentUser();
      }

      return {
        getOfficialUnits: function () { return getUnitModule().getOfficialUnits(); },
        getOfficialUnitCatalog: function () { return getUnitModule().getOfficialUnitCatalog(); },
        getOfficialUnitMeta: function (unitValue) { return getUnitModule().getOfficialUnitMeta(unitValue); },
        getUnitCode: function (unitValue) { return getUnitModule().getUnitCode(unitValue); },
        getUnitCodeWithDots: function (unitValue) { return getUnitModule().getUnitCodeWithDots(unitValue); },
        getUnitOptionLabel: function (unitValue, fallbackText) { return getUnitModule().getUnitOptionLabel(unitValue, fallbackText); },
        getCorrectionYear: function (dateValue) { return getWorkflowSupportModule().getCorrectionYear(dateValue); },
        normalizeRocYear: function (value, fallbackDateValue) { return getWorkflowSupportModule().normalizeRocYear(value, fallbackDateValue); },
        buildScopedRecordPrefix: function (prefix, unitValue, yearValue, fallbackDateValue) {
          return getWorkflowSupportModule().buildScopedRecordPrefix(prefix, unitValue, yearValue, fallbackDateValue);
        },
        parseScopedRecordId: function (value, prefix) { return getWorkflowSupportModule().parseScopedRecordId(value, prefix); },
        buildScopedRecordId: function (documentNo, sequence) { return getWorkflowSupportModule().buildScopedRecordId(documentNo, sequence); },
        getNextScopedRecordSequence: function (documentNo, items, parser) {
          return getWorkflowSupportModule().getNextScopedRecordSequence(documentNo, items, parser);
        },
        buildCorrectionDocumentNo: function (unitValue, dateValue) { return getWorkflowSupportModule().buildCorrectionDocumentNo(unitValue, dateValue); },
        parseCorrectionAutoId: function (value) { return getWorkflowSupportModule().parseCorrectionAutoId(value); },
        buildAutoCarIdByDocument: function (documentNo, sequence) { return getWorkflowSupportModule().buildAutoCarIdByDocument(documentNo, sequence); },
        buildAutoCarId: function (unitValue, sequence, dateValue) { return getWorkflowSupportModule().buildAutoCarId(unitValue, sequence, dateValue); },
        getNextCorrectionSequence: function (documentNo, items) { return getWorkflowSupportModule().getNextCorrectionSequence(documentNo, items); },
        getSystemUnits: function () { return getUnitModule().getSystemUnits(); },
        isOfficialUnit: function (unit) { return getUnitModule().isOfficialUnit(unit); },
        loadUnitReviewStore: function () { return getDataModule().loadUnitReviewStore(); },
        saveUnitReviewStore: function (store) { return getDataModule().saveUnitReviewStore(store); },
        getUnitGovernanceMode: function (unit) { return getDataModule().getUnitGovernanceMode(unit); },
        setUnitGovernanceMode: function (unit, mode, actor, note) { return getDataModule().setUnitGovernanceMode(unit, mode, actor, note); },
        getUnitGovernanceModes: function () { return getDataModule().getUnitGovernanceModes(); },
        loadUnitContactApplicationStore: function () { return getDataModule().loadUnitContactApplicationStore(); },
        saveUnitContactApplicationStore: function (store) { return getDataModule().saveUnitContactApplicationStore(store); },
        getAllUnitContactApplications: function () { return getDataModule().getAllUnitContactApplications(); },
        getUnitContactApplication: function (id) { return getDataModule().getUnitContactApplication(id); },
        createUnitContactApplication: function (application) { return getDataModule().createUnitContactApplication(application); },
        updateUnitContactApplication: function (id, updates) { return getDataModule().updateUnitContactApplication(id, updates); },
        findUnitContactApplicationsByEmail: function (email) { return getDataModule().findUnitContactApplicationsByEmail(email); },
        formatUnitScopeSummary: function (scopes) { return getUnitModule().formatUnitScopeSummary(scopes); },
        approveCustomUnit: function (unit, actor) { return getUnitModule().approveCustomUnit(unit, actor); },
        getCustomUnitRegistry: function () { return getUnitModule().getCustomUnitRegistry(); },
        syncSessionUnit: function (sourceUnit, targetUnit) { return getAuthModule().syncSessionUnit(sourceUnit, targetUnit); },
        mergeCustomUnit: function (sourceUnit, targetUnit, actor) { return getUnitModule().mergeCustomUnit(sourceUnit, targetUnit, actor); },
        splitUnitValue: function (unitValue) { return getUnitModule().splitUnitValue(unitValue); },
        composeUnitValue: function (parent, child) { return getUnitModule().composeUnitValue(parent, child); },
        categorizeTopLevelUnit: function (unitValue) { return getUnitModule().categorizeTopLevelUnit(unitValue); },
        isTrainingDashboardExcludedUnit: function (unitValue) { return getUnitModule().isTrainingDashboardExcludedUnit(unitValue); },
        getTrainingUnitCategories: function () { return getUnitModule().getTrainingUnitCategories(); },
        getParentsByUnitCategory: function (parents, category) { return getUnitModule().getParentsByUnitCategory(parents, category); },
        buildUnitSearchEntry: function (unitValue) { return getUnitModule().buildUnitSearchEntry(unitValue); },
        getUnitSearchEntries: function (extraValues) { return getUnitModule().getUnitSearchEntries(extraValues); },
        buildUnitCascadeControl: function (baseId, selectedUnit, disabled, required) {
          return getUnitModule().buildUnitCascadeControl(baseId, selectedUnit, disabled, required);
        },
        initUnitCascade: function (baseId, initialValue, optionsArg) { return getUnitModule().initUnitCascade(baseId, initialValue, optionsArg); },
        parseUserUnits: function (value) { return getDataModule().parseUserUnits(value); },
        normalizeUserRole: function (role) { return getDataModule().normalizeUserRole(role); },
        getAuthorizedUnits: function (user) { return getDataModule().getAuthorizedUnits(user); },
        getReviewUnits: function (user) { return getDataModule().getReviewUnits(user); },
        getActiveUnit: function (user) { return getDataModule().getActiveUnit(user); },
        normalizeUserRecord: function (user) { return getDataModule().normalizeUserRecord(user); },
        hasGlobalReadScope: function (user) { return getPolicyModule().hasGlobalReadScope(getFallbackUser.apply(null, arguments)); },
        hasUnitAccess: function (unit, user) {
          return arguments.length >= 2
            ? getPolicyModule().hasUnitAccess(unit, user)
            : getPolicyModule().hasUnitAccess(unit, getAuthModule().currentUser());
        },
        canSwitchAuthorizedUnit: function (user) { return getAuthModule().canSwitchAuthorizedUnit(getFallbackUser.apply(null, arguments)); },
        getScopedUnit: function (user) { return getAuthModule().getScopedUnit(getFallbackUser.apply(null, arguments)); },
        switchCurrentUserUnit: function (unit) { return getAuthModule().switchCurrentUserUnit(unit); },
        loadData: function () { return getDataModule().loadData(); },
        saveData: function (data) { return getDataModule().saveData(data); },
        getAllItems: function () { return getDataModule().getAllItems(); },
        getItem: function (id) { return getDataModule().getItem(id); },
        addItem: function (item) { return getDataModule().addItem(item); },
        updateItem: function (id, updates) { return getDataModule().updateItem(id, updates); },
        getUsers: function () { return getDataModule().getUsers(); },
        addUser: function (user) { return getDataModule().addUser(user); },
        updateUser: function (username, updates) { return getDataModule().updateUser(username, updates); },
        deleteUser: function (username) { return getDataModule().deleteUser(username); },
        findUser: function (username) { return getDataModule().findUser(username); },
        findUserByEmail: function (email) { return getDataModule().findUserByEmail(email); },
        ensurePrimaryAdminProfile: function () { return getAuthModule().ensurePrimaryAdminProfile(); },
        generatePassword: function () { return getAuthModule().generatePassword(); },
        resetPasswordByEmail: function (email) { return getAuthModule().resetPasswordByEmail(email); },
        redeemResetPassword: function (payload) { return getAuthModule().redeemResetPassword(payload); },
        changePassword: function (payload) { return getAuthModule().changePassword(payload); },
        loadLoginLogs: function () { return getDataModule().loadLoginLogs(); },
        saveLoginLogs: function (logs) { return getDataModule().saveLoginLogs(logs); },
        addLoginLog: function (username, user, success) { return getDataModule().addLoginLog(username, user, success); },
        clearLoginLogs: function () { return getDataModule().clearLoginLogs(); },
        login: function (username, password) { return getAuthModule().login(username, password); },
        currentUser: function () { return getAuthModule().currentUser(); },
        isAdmin: function (user) { return getPolicyModule().isAdmin(getFallbackUser.apply(null, arguments)); },
        isUnitAdmin: function (user) { return getPolicyModule().isUnitAdmin(getFallbackUser.apply(null, arguments)); },
        isViewer: function (user) { return getPolicyModule().isViewer(getFallbackUser.apply(null, arguments)); },
        canCreateCAR: function (user) { return getPolicyModule().canCreateCAR(getFallbackUser.apply(null, arguments)); },
        canReview: function (user) { return getPolicyModule().canReview(getFallbackUser.apply(null, arguments)); },
        canReviewItem: function (item, user) {
          return arguments.length >= 2
            ? getPolicyModule().canReviewItem(item, user)
            : getPolicyModule().canReviewItem(item, getAuthModule().currentUser());
        },
        canFillChecklist: function (user) { return getPolicyModule().canFillChecklist(getFallbackUser.apply(null, arguments)); },
        canFillTraining: function (user) { return getPolicyModule().canFillTraining(getFallbackUser.apply(null, arguments)); },
        canManageUsers: function (user) { return getPolicyModule().canManageUsers(getFallbackUser.apply(null, arguments)); }
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
