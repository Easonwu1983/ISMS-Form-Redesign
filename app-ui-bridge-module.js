(function () {
  window.createAppUiBridgeModule = function createAppUiBridgeModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};

      function getUiModule() {
        if (typeof opts.getUiModule !== 'function') {
          throw new Error('app ui bridge requires getUiModule');
        }
        return opts.getUiModule();
      }

      return {
        fmt: function (value) { return getUiModule().fmt(value); },
        fmtTime: function (value) { return getUiModule().fmtTime(value); },
        ic: function (name, cls) { return getUiModule().ic(name, cls || ''); },
        mkChk: function (name, optsList, selected) { return getUiModule().mkChk(name, optsList, selected); },
        mkRadio: function (name, optsList, selected) { return getUiModule().mkRadio(name, optsList, selected); },
        ntuLogo: function (cls) { return getUiModule().ntuLogo(cls || ''); },
        esc: function (value) { return getUiModule().esc(value); },
        toast: function (message, type) { return getUiModule().toast(message, type || 'success'); },
        renderCopyIdButton: function (value, label) { return getUiModule().renderCopyIdButton(value, label); },
        renderCopyIdCell: function (value, label, strong) { return getUiModule().renderCopyIdCell(value, label, strong); },
        copyTextToClipboard: function (value, label) { return getUiModule().copyTextToClipboard(value, label || '複製'); },
        bindCopyButtons: function (root) { return getUiModule().bindCopyButtons(root || document); },
        applyTestIds: function (map) { return getUiModule().applyTestIds(map); },
        applySelectorTestIds: function (entries) { return getUiModule().applySelectorTestIds(entries); },
        debugFlow: function (scope, message, data) { return getUiModule().debugFlow(scope, message, data); },
        setUnsavedChangesGuard: function (active, message) { return getUiModule().setUnsavedChangesGuard(active, message); },
        clearUnsavedChangesGuard: function () { return getUiModule().clearUnsavedChangesGuard(); },
        hasUnsavedChangesGuard: function () { return getUiModule().hasUnsavedChangesGuard(); },
        confirmDiscardUnsavedChanges: function (message, clearOnConfirm) {
          return getUiModule().confirmDiscardUnsavedChanges(message, clearOnConfirm);
        },
        downloadJson: function (filename, payload) { return getUiModule().downloadJson(filename, payload); },
        closeModalRoot: function () { return getUiModule().closeModal(); },
        openConfirmDialog: function (message, dialogOptions) { return getUiModule().openConfirmDialog(message, dialogOptions); },
        openPromptDialog: function (message, dialogOptions) { return getUiModule().openPromptDialog(message, dialogOptions); },
        showBusyState: function (message) { return getUiModule().showBusyState(message); },
        hideBusyState: function () { return getUiModule().hideBusyState(); },
        runWithBusyState: function (message, task) { return getUiModule().runWithBusyState(message, task); }
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
