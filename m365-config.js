(function () {
  const BASE_CONFIG = {
    unitContactRequestTimeoutMs: 15000,
    unitContactStatusLookupMethod: 'POST',
    unitContactStatusQueryParam: 'email',
    unitContactSharedHeaders: {},
    unitContactActivationEndpoint: '',
    sharePointSiteName: 'ISMS-Forms',
    sharePointSiteUrl: '',
    sharePointLists: {
      applications: 'UnitContactApplications',
      unitAdmins: 'UnitAdmins',
      audit: 'OpsAudit'
    },
    entraTenantId: '',
    entraClientId: '',
    activationPathBase: '#activate-unit-contact'
  };

  const DEPLOYMENT_PROFILES = {
    localDemo: {
      label: 'Local demo / browser-only mode',
      unitContactMode: 'local-emulator',
      unitContactSubmitEndpoint: '',
      unitContactStatusEndpoint: ''
    },
    a3CampusFlow: {
      label: 'A3-ready campus frontend + SharePoint / Power Automate',
      unitContactMode: 'sharepoint-flow',
      unitContactSubmitEndpoint: 'https://YOUR-POWER-AUTOMATE-ENDPOINT-HOST/workflows/.../triggers/manual/paths/invoke',
      unitContactStatusEndpoint: 'https://YOUR-POWER-AUTOMATE-ENDPOINT-HOST/workflows/.../triggers/manual/paths/invoke',
      unitContactStatusLookupMethod: 'POST',
      sharePointSiteUrl: 'https://YOUR-TENANT.sharepoint.com/sites/ISMS-Forms'
    },
    azureFunctionCampus: {
      label: 'Campus frontend + Azure Function backend',
      unitContactMode: 'm365-api',
      unitContactSubmitEndpoint: 'https://YOUR-FUNCTION-APP.azurewebsites.net/api/unit-contact/apply',
      unitContactStatusEndpoint: 'https://YOUR-FUNCTION-APP.azurewebsites.net/api/unit-contact/status',
      unitContactActivationEndpoint: 'https://YOUR-FUNCTION-APP.azurewebsites.net/api/unit-contact/activate',
      sharePointSiteUrl: 'https://YOUR-TENANT.sharepoint.com/sites/ISMS-Forms'
    }
  };

  // Change only this value during deployment.
  // Recommended:
  // - local development: localDemo
  // - A3 production: a3CampusFlow
  // - future upgrade: azureFunctionCampus
  const ACTIVE_PROFILE = 'localDemo';

  DEPLOYMENT_PROFILES.sharePointFlowCampus = DEPLOYMENT_PROFILES.a3CampusFlow;

  const selectedProfile = DEPLOYMENT_PROFILES[ACTIVE_PROFILE] || DEPLOYMENT_PROFILES.localDemo;

  window.__M365_UNIT_CONTACT_CONFIG__ = {
    ...BASE_CONFIG,
    ...selectedProfile,
    activeProfile: ACTIVE_PROFILE,
    availableProfiles: Object.keys(DEPLOYMENT_PROFILES),
    deploymentChecklistDoc: 'docs/m365-unit-contact-go-live-runbook.md'
  };
})();
