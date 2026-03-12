const fs = require('fs');
const path = require('path');
const {
  GRAPH_ROOT,
  acquireDelegatedGraphTokenFromCli,
  graphColumnFromSchema,
  graphGet,
  graphPost,
  loadBackendConfig,
  resolveSiteIdFromUrl
} = require('./_m365-a3-backend-utils.cjs');

async function ensureColumn(accessToken, siteId, listId, column) {
  const columns = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/columns?$select=id,name,displayName`);
  const exists = (columns.value || []).some((entry) => String(entry.name || '').trim() === column.name);
  if (exists) return false;
  await graphPost(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/columns`, graphColumnFromSchema(column));
  return true;
}

async function ensureFolder(accessToken, siteId, driveId, folderName) {
  const encodedName = encodeURIComponent(String(folderName || '').trim());
  try {
    await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/drives/${driveId}/root:/${encodedName}`);
    return false;
  } catch (_) {
    await graphPost(accessToken, `${GRAPH_ROOT}/sites/${siteId}/drives/${driveId}/root/children`, {
      name: String(folderName || '').trim(),
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail'
    });
    return true;
  }
}

(async () => {
  try {
    const config = loadBackendConfig();
    const schemaPath = path.join(process.cwd(), 'm365', 'sharepoint', 'attachment-libraries.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const siteUrl = config.sharePointSiteUrl;
    if (!siteUrl) throw new Error('Missing sharePointSiteUrl in backend config');
    const { accessToken } = acquireDelegatedGraphTokenFromCli();
    const siteId = await resolveSiteIdFromUrl(accessToken, siteUrl);
    const existingLists = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName,list`);
    const existingMap = new Map((existingLists.value || []).map((entry) => [entry.displayName, entry]));
    const report = [];

    for (const library of schema.libraries || []) {
      let target = existingMap.get(library.name);
      let created = false;
      if (!target) {
        target = await graphPost(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists`, {
          displayName: library.name,
          list: { template: library.template || 'documentLibrary' }
        });
        created = true;
      }
      const drive = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists/${target.id}/drive?$select=id,name,webUrl`);
      const createdColumns = [];
      for (const column of library.columns || []) {
        const changed = await ensureColumn(accessToken, siteId, target.id, column);
        if (changed) createdColumns.push(column.name);
      }
      const createdFolders = [];
      for (const folderName of library.folders || []) {
        const changed = await ensureFolder(accessToken, siteId, drive.id, folderName);
        if (changed) createdFolders.push(folderName);
      }
      report.push({
        library: library.name,
        created,
        createdColumns,
        createdFolders,
        driveId: drive.id,
        webUrl: drive.webUrl
      });
    }

    console.log(JSON.stringify({ ok: true, siteId, report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, status: error.status || null, body: error.body || null }, null, 2));
    process.exit(1);
  }
})();
