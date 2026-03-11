const {
  GRAPH_ROOT,
  adminConsentUrl,
  acquireGraphToken,
  graphColumnFromSchema,
  graphGet,
  graphPost,
  loadBackendConfig,
  loadSchema,
  missingRoles,
  resolveSiteId
} = require('./_m365-a3-backend-utils.cjs');

async function ensureList(accessToken, siteId, listSchema) {
  const existing = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName,webUrl`);
  const found = existing.value.find((list) => list.displayName === listSchema.name);
  if (found) {
    return { created: false, list: found };
  }

  const created = await graphPost(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists`, {
    displayName: listSchema.name,
    description: listSchema.description,
    list: {
      template: 'genericList'
    }
  });

  return { created: true, list: created };
}

async function ensureColumns(accessToken, siteId, listId, listSchema) {
  const existing = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/columns?$select=id,name,displayName`);
  const existingNames = new Set(existing.value.map((column) => column.name));
  const created = [];

  for (const column of listSchema.columns) {
    if (column.name === 'Title') continue;
    if (existingNames.has(column.name)) continue;
    const payload = graphColumnFromSchema(column);
    await graphPost(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/columns`, payload);
    created.push(column.name);
  }

  return created;
}

(async () => {
  try {
    const config = loadBackendConfig();
    const { accessToken, decoded } = await acquireGraphToken(config);
    const missing = missingRoles(decoded);
    if (missing.length) {
      console.error(JSON.stringify({
        error: 'Admin consent not completed for backend app',
        missingRoles: missing,
        adminConsentUrl: adminConsentUrl(config)
      }, null, 2));
      process.exitCode = 2;
      return;
    }

    const siteId = await resolveSiteId(accessToken, config.siteId);
    const schema = loadSchema();
    const report = {
      siteId,
      lists: [],
      warnings: [
        'recommendedIndexes and unique constraints are documented in schema but not automatically applied by Microsoft Graph list provisioning'
      ]
    };

    for (const listSchema of schema.lists) {
      const ensured = await ensureList(accessToken, siteId, listSchema);
      const createdColumns = await ensureColumns(accessToken, siteId, ensured.list.id, listSchema);
      report.lists.push({
        name: listSchema.name,
        id: ensured.list.id,
        webUrl: ensured.list.webUrl || null,
        listCreated: ensured.created,
        columnsCreated: createdColumns
      });
    }

    console.log(JSON.stringify(report, null, 2));
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
