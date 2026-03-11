const {
  GRAPH_ROOT,
  acquireDelegatedGraphTokenFromCli,
  graphGet,
  loadBackendConfig,
  resolveSiteId,
  resolveSiteIdFromUrl
} = require('./_m365-a3-backend-utils.cjs');

async function detectSiteId(accessToken, config) {
  if (config.siteId) return config.siteId;
  if (config.sharePointSiteUrl) {
    const resolved = await resolveSiteIdFromUrl(accessToken, config.sharePointSiteUrl);
    if (resolved) return resolved;
  }
  return resolveSiteId(accessToken, null);
}

(async () => {
  try {
    const config = loadBackendConfig();
    const { accessToken, decoded } = acquireDelegatedGraphTokenFromCli();
    const me = await graphGet(accessToken, `${GRAPH_ROOT}/me?$select=id,displayName,mail,userPrincipalName`);
    const siteId = await detectSiteId(accessToken, config);
    const site = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}?$select=id,webUrl,displayName`);

    let listsStatus = 'unknown';
    let listCount = null;
    let canReadLists = false;
    let readError = null;
    try {
      const lists = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName`);
      canReadLists = true;
      listsStatus = 'ok';
      listCount = Array.isArray(lists.value) ? lists.value.length : 0;
    }
    catch (error) {
      listsStatus = 'forbidden';
      readError = error.body || error.message;
    }

    const report = {
      actor: me,
      delegatedRolesOrScopes: {
        roles: decoded.roles || [],
        scp: decoded.scp || null
      },
      site: {
        id: site.id,
        webUrl: site.webUrl,
        displayName: site.displayName
      },
      checks: {
        canReadSite: true,
        canReadLists,
        listCount
      },
      nextAction: canReadLists
        ? 'Run npm run m365:a3:site-owner:provision to create or verify the required lists.'
        : 'Ask the SharePoint site owner to add this account as Site Owner or grant Manage Lists capability on the target site.',
      error: readError
    };

    console.log(JSON.stringify(report, null, 2));
    if (!canReadLists) {
      process.exitCode = 2;
    }
  }
  catch (error) {
    console.error(JSON.stringify({
      error: error.message,
      status: error.status || null,
      body: error.body || null
    }, null, 2));
    process.exitCode = 1;
  }
})();
