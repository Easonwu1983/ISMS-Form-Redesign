(function () {
  // Copy this file to `m365-config.override.js` on the campus host
  // and fill in the real values there. The app will load it after
  // `m365-config.js` and merge these overrides at runtime.
  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {
    activeProfile: 'a3CampusBackend',
    unitContactMode: 'm365-api',
    unitContactSubmitEndpoint: 'https://YOUR-CAMPUS-HOST/api/unit-contact/apply',
    unitContactStatusEndpoint: 'https://YOUR-CAMPUS-HOST/api/unit-contact/status',
    unitContactStatusLookupMethod: 'POST',
    correctiveActionsMode: 'm365-api',
    correctiveActionsEndpoint: 'https://YOUR-CAMPUS-HOST/api/corrective-actions',
    correctiveActionsHealthEndpoint: 'https://YOUR-CAMPUS-HOST/api/corrective-actions/health',
    checklistMode: 'm365-api',
    checklistEndpoint: 'https://YOUR-CAMPUS-HOST/api/checklists',
    checklistHealthEndpoint: 'https://YOUR-CAMPUS-HOST/api/checklists/health',
    trainingMode: 'm365-api',
    trainingFormsEndpoint: 'https://YOUR-CAMPUS-HOST/api/training/forms',
    trainingRostersEndpoint: 'https://YOUR-CAMPUS-HOST/api/training/rosters',
    trainingHealthEndpoint: 'https://YOUR-CAMPUS-HOST/api/training/health',
    systemUsersMode: 'm365-api',
    systemUsersEndpoint: 'https://YOUR-CAMPUS-HOST/api/system-users',
    systemUsersHealthEndpoint: 'https://YOUR-CAMPUS-HOST/api/system-users/health',
    sharePointSiteUrl: 'https://YOUR-TENANT.sharepoint.com/sites/ISMSFormsWorkspace',
    sharePointSiteName: 'ISMSFormsWorkspace',
    sharePointProvisioningModel: 'delegated-site-owner',
    sharePointLists: {
      applications: 'UnitContactApplications',
      unitAdmins: 'UnitAdmins',
      audit: 'OpsAudit',
      correctiveActions: 'CorrectiveActions',
      checklists: 'Checklists',
      trainingForms: 'TrainingForms',
      trainingRosters: 'TrainingRosters',
      systemUsers: 'SystemUsers'
    }
  };
})();

