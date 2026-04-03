// @ts-check
(function () {
  window.createAppAttachmentMigrationModule = function createAppAttachmentMigrationModule() {
    function createAccess(options) {
      const opts = options && typeof options === 'object' ? options : {};

      async function migrateCaseAttachmentTree(item) {
        if (!item || typeof item !== 'object') return { changed: false, errors: [] };
        let changed = false;
        const errors = [];
        const caseEvidence = await opts.migrateStoredAttachments(item.evidence || [], { prefix: 'car', scope: 'case-evidence', ownerId: item.id });
        if (caseEvidence.changed) {
          item.evidence = caseEvidence.files;
          changed = true;
        }
        if (Array.isArray(caseEvidence.errors) && caseEvidence.errors.length) errors.push.apply(errors, caseEvidence.errors);
        if (item.pendingTracking && typeof item.pendingTracking === 'object') {
          const pendingEvidence = await opts.migrateStoredAttachments(item.pendingTracking.evidence || [], { prefix: 'trk', scope: 'tracking-evidence', ownerId: item.id });
          if (pendingEvidence.changed) {
            item.pendingTracking = { ...item.pendingTracking, evidence: pendingEvidence.files };
            changed = true;
          }
          if (Array.isArray(pendingEvidence.errors) && pendingEvidence.errors.length) errors.push.apply(errors, pendingEvidence.errors);
        }
        if (Array.isArray(item.trackings)) {
          const nextTrackings = [];
          let trackingsChanged = false;
          for (const tracking of item.trackings) {
            const migrated = await opts.migrateStoredAttachments(tracking && tracking.evidence || [], { prefix: 'trk', scope: 'tracking-evidence', ownerId: item.id });
            if (migrated.changed) {
              nextTrackings.push({ ...tracking, evidence: migrated.files });
              trackingsChanged = true;
            } else {
              nextTrackings.push(tracking);
            }
            if (Array.isArray(migrated.errors) && migrated.errors.length) errors.push.apply(errors, migrated.errors);
          }
          if (trackingsChanged) {
            item.trackings = nextTrackings;
            changed = true;
          }
        }
        return { changed: changed, errors: errors };
      }

      async function migrateAttachmentStores() {
        let dataChanged = false;
        const migrationErrors = [];
        const data = opts.loadData();
        for (const item of data.items || []) {
          const migratedItem = await migrateCaseAttachmentTree(item);
          if (migratedItem.changed) dataChanged = true;
          if (Array.isArray(migratedItem.errors) && migratedItem.errors.length) migrationErrors.push.apply(migrationErrors, migratedItem.errors);
        }
        if (dataChanged) opts.saveData(data);

        let trainingChanged = false;
        const trainingStore = opts.loadTrainingStore();
        for (const form of trainingStore.forms || []) {
          const migrated = await opts.migrateStoredAttachments(form && form.signedFiles || [], { prefix: 'trn', scope: 'training-signoff', ownerId: form.id });
          if (migrated.changed) {
            form.signedFiles = migrated.files;
            trainingChanged = true;
          }
          if (Array.isArray(migrated.errors) && migrated.errors.length) migrationErrors.push.apply(migrationErrors, migrated.errors);
        }
        if (trainingChanged) opts.saveTrainingStore(trainingStore);
        if (typeof window !== 'undefined') {
          window.__ATTACHMENT_MIGRATION_ERRORS__ = migrationErrors;
        }
      }

      return {
        migrateCaseAttachmentTree: migrateCaseAttachmentTree,
        migrateAttachmentStores: migrateAttachmentStores
      };
    }

    return {
      createAccess: createAccess
    };
  };
})();
