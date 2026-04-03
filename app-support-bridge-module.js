// @ts-check
(function () {
  window.createAppSupportBridgeModule = function createAppSupportBridgeModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};

      function collectReferencedAttachmentIds() {
        const ids = new Set();
        const pushFiles = function (files) {
          (Array.isArray(files) ? files : []).forEach(function (file) {
            const attachmentId = String(file && file.attachmentId || '').trim();
            if (attachmentId) ids.add(attachmentId);
          });
        };
        const data = opts.loadData();
        (data.items || []).forEach(function (item) {
          pushFiles(item && item.evidence);
          pushFiles(item && item.pendingTracking && item.pendingTracking.evidence);
          (item && item.trackings || []).forEach(function (tracking) {
            pushFiles(tracking && tracking.evidence);
          });
        });
        const trainingStore = opts.loadTrainingStore();
        (trainingStore.forms || []).forEach(function (form) {
          pushFiles(form && form.signedFiles);
        });
        return Array.from(ids);
      }

      function getAttachmentHealth() {
        return opts.getAttachmentModule().getAttachmentHealth(collectReferencedAttachmentIds());
      }

      function pruneOrphanAttachments() {
        return opts.getAttachmentModule().pruneUnusedAttachments(collectReferencedAttachmentIds());
      }

      async function exportSupportBundle() {
        return {
          generatedAt: new Date().toISOString(),
          schemaHealth: opts.getDataModule().getSchemaHealth(),
          attachmentHealth: await getAttachmentHealth(),
          stores: opts.getDataModule().exportManagedStoreSnapshot()
        };
      }

      return {
        getFileExtension: function (name) { return opts.getWorkflowSupportModule().getFileExtension(name); },
        buildUploadSignature: function (meta) { return opts.getWorkflowSupportModule().buildUploadSignature(meta); },
        validateUploadFile: function (file, options) { return opts.getWorkflowSupportModule().validateUploadFile(file, options); },
        prepareUploadBatch: function (existingFiles, incomingFiles, options) { return opts.getWorkflowSupportModule().prepareUploadBatch(existingFiles, incomingFiles, options); },
        createTransientUploadEntry: function (file, meta, options) { return opts.getAttachmentModule().createTransientUploadEntry(file, meta, options); },
        revokeTransientUploadEntry: function (entry) { return opts.getAttachmentModule().revokeTransientUploadEntry(entry); },
        renderAttachmentList: function (target, files, options) { return opts.getAttachmentModule().renderAttachmentList(target, files, options); },
        cleanupRenderedAttachmentUrls: function () { return opts.getAttachmentModule().cleanupRenderedAttachmentUrls(); },
        collectReferencedAttachmentIds: collectReferencedAttachmentIds,
        getAttachmentHealth: getAttachmentHealth,
        pruneOrphanAttachments: pruneOrphanAttachments,
        exportSupportBundle: exportSupportBundle,
        csvCell: function (value) { return opts.getWorkflowSupportModule().csvCell(value); },
        downloadWorkbook: function (filename, sheets) { return opts.getWorkflowSupportModule().downloadWorkbook(filename, sheets); },
        exportTrainingSummaryCsv: function (forms, filename) { return opts.getWorkflowSupportModule().exportTrainingSummaryCsv(forms, filename); },
        exportTrainingDetailCsv: function (form) { return opts.getWorkflowSupportModule().exportTrainingDetailCsv(form); },
        getRocDateParts: function (value) { return opts.getWorkflowSupportModule().getRocDateParts(value); },
        buildTrainingPrintHtml: function (payload) { return opts.getWorkflowSupportModule().buildTrainingPrintHtml(payload); },
        printTrainingSheet: function (payload) { return opts.getWorkflowSupportModule().printTrainingSheet(payload); },
        sortTrainingRosterEntries: function (rows) { return opts.getWorkflowSupportModule().sortTrainingRosterEntries(rows); },
        normalizeTrainingImportHeader: function (value) { return opts.getWorkflowSupportModule().normalizeTrainingImportHeader(value); },
        buildTrainingRosterHeaderMap: function (cells) { return opts.getWorkflowSupportModule().buildTrainingRosterHeaderMap(cells); },
        resolveTrainingImportTargetUnit: function (defaultUnit, rawUnit, rawStatsUnit) { return opts.getWorkflowSupportModule().resolveTrainingImportTargetUnit(defaultUnit, rawUnit, rawStatsUnit); },
        parseTrainingRosterCells: function (cells, unit, headerMap) { return opts.getWorkflowSupportModule().parseTrainingRosterCells(cells, unit, headerMap); },
        parseTrainingRosterImport: function (text, unit) { return opts.getWorkflowSupportModule().parseTrainingRosterImport(text, unit); },
        parseTrainingRosterWorkbook: function (file, unit) { return opts.getWorkflowSupportModule().parseTrainingRosterWorkbook(file, unit); },
        mergeTrainingRows: function (targetUnit, carryRows) { return opts.getWorkflowSupportModule().mergeTrainingRows(targetUnit, carryRows); },
        seedData: function () { return opts.getWorkflowSupportModule().seedData(); }
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
