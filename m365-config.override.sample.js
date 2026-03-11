(function () {
  // Copy this file to `m365-config.override.js` on the campus host
  // and fill in the real values there. The app will load it after
  // `m365-config.js` and merge these overrides at runtime.
  window.__M365_UNIT_CONTACT_CONFIG_OVERRIDE__ = {
    activeProfile: 'a3CampusFlow',
    unitContactMode: 'sharepoint-flow',
    unitContactSubmitEndpoint: 'https://YOUR-POWER-AUTOMATE-ENDPOINT-HOST/workflows/.../triggers/manual/paths/invoke',
    unitContactStatusEndpoint: 'https://YOUR-POWER-AUTOMATE-ENDPOINT-HOST/workflows/.../triggers/manual/paths/invoke',
    unitContactStatusLookupMethod: 'POST',
    sharePointSiteUrl: 'https://YOUR-TENANT.sharepoint.com/sites/ISMS-Forms',
    sharePointSiteName: 'ISMS-Forms',
    sharePointLists: {
      applications: 'UnitContactApplications',
      unitAdmins: 'UnitAdmins',
      audit: 'OpsAudit'
    }
  };
})();
