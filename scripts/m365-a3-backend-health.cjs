const {
  GRAPH_ROOT,
  adminConsentUrl,
  acquireGraphToken,
  graphGet,
  loadBackendConfig,
  missingRoles,
  resolveSiteId,
  rolesFromToken
} = require('./_m365-a3-backend-utils.cjs');

(async () => {
  try {
    const config = loadBackendConfig();
    const { accessToken, decoded } = await acquireGraphToken(config);
    const missing = missingRoles(decoded);
    if (missing.length) {
      const report = {
        tenantId: config.tenantId,
        clientId: config.clientId,
        siteId: config.siteId || null,
        siteUrl: null,
        roles: rolesFromToken(decoded),
        missingRoles: missing,
        adminConsentUrl: adminConsentUrl(config),
        ready: false
      };
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 2;
      return;
    }

    const siteId = await resolveSiteId(accessToken, config.siteId);
    const site = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}`);

    const report = {
      tenantId: config.tenantId,
      clientId: config.clientId,
      siteId,
      siteUrl: site.webUrl,
      roles: rolesFromToken(decoded),
      missingRoles: missing,
      adminConsentUrl: null,
      ready: true
    };

    console.log(JSON.stringify(report, null, 2));
  }
  catch (error) {
    console.error(JSON.stringify({
      error: error.message,
      status: error.status || null,
      body: error.body || null
    }, null, 2));
    process.exit(1);
  }
})();
