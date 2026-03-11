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
    sharePointSiteUrl: 'https://YOUR-TENANT.sharepoint.com/sites/ISMSFormsWorkspace',
    sharePointSiteName: 'ISMSFormsWorkspace',
    sharePointProvisioningModel: 'delegated-site-owner',
    sharePointLists: {
      applications: 'UnitContactApplications',
      unitAdmins: 'UnitAdmins',
      audit: 'OpsAudit'
    }
  };
})();
