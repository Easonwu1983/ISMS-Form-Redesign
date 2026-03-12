const fs = require('fs');
const path = require('path');
const {
  GRAPH_ROOT,
  acquireDelegatedGraphTokenFromCli,
  graphColumnFromSchema,
  graphGet,
  graphPost,
  loadBackendConfig,
  resolveSiteId,
  resolveSiteIdFromUrl
} = require('./_m365-a3-backend-utils.cjs');

function projectRoot() {
  return path.resolve(__dirname, '..');
}

function loadTrainingSchema() {
  const schemaPath = path.join(projectRoot(), 'm365', 'sharepoint', 'training-lists.schema.json');
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

async function detectSiteId(accessToken, config) {
  if (config.siteId) return config.siteId;
  if (config.sharePointSiteUrl) {
    const resolved = await resolveSiteIdFromUrl(accessToken, config.sharePointSiteUrl);
    if (resolved) return resolved;
  }
  return resolveSiteId(accessToken, null);
}

async function ensureList(accessToken, siteId, listSchema) {
  const existing = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName,webUrl`);
  const found = existing.value.find((list) => list.displayName === listSchema.name);
  if (found) return { created: false, list: found };

  const created = await graphPost(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists`, {
    displayName: listSchema.name,
    description: listSchema.description,
    list: { template: 'genericList' }
  });
  return { created: true, list: created };
}

async function ensureColumns(accessToken, siteId, listId, columns) {
  const existing = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/columns?$select=id,name`);
  const names = new Set(existing.value.map((column) => column.name));
  const created = [];

  for (const column of columns) {
    if (column.name === 'Title') continue;
    if (names.has(column.name)) continue;
    await graphPost(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/columns`, graphColumnFromSchema(column));
    created.push(column.name);
  }

  return created;
}

(async () => {
  try {
    const config = loadBackendConfig();
    const { accessToken } = acquireDelegatedGraphTokenFromCli();
    const siteId = await detectSiteId(accessToken, config);
    const schema = loadTrainingSchema();
    const report = {
      siteId,
      lists: []
    };

    for (const listSchema of schema.lists) {
      const ensured = await ensureList(accessToken, siteId, listSchema);
      const columnsCreated = await ensureColumns(accessToken, siteId, ensured.list.id, listSchema.columns);
      report.lists.push({
        name: listSchema.name,
        id: ensured.list.id,
        webUrl: ensured.list.webUrl || null,
        listCreated: ensured.created,
        columnsCreated
      });
    }

    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error.message,
      status: error.status || null,
      body: error.body || null,
      hint: error.status === 403
        ? 'This account can sign in but still lacks Manage Lists capability on the selected SharePoint site.'
        : null
    }, null, 2));
    process.exitCode = 1;
  }
})();
