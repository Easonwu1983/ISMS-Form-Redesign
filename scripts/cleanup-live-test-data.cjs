const {
  GRAPH_ROOT,
  acquirePreferredGraphToken,
  graphGet,
  loadBackendConfig,
  resolveSiteId,
  resolveSiteIdFromUrl
} = require('./_m365-a3-backend-utils.cjs');

const LIST_PATTERNS = {
  SystemUsers: [
    /^(gov-smoke-|diagadmin|probe-unit-manager-|ucae2e)/i,
    /治理測試/i,
    /診斷管理者/i,
    /flow probe/i
  ],
  UnitReviewScopes: [
    /gov-smoke-/i,
    /diagadmin/i,
    /probe-unit-manager-/i,
    /ucae2e/i
  ],
  TrainingRosters: [
    /\bprobex-/i,
    /\bprobey-/i,
    /\bprobeunit-/i,
    /\bfocusprobe-/i,
    /\brosterfocusunit-/i,
    /\bapiprobe-/i,
    /\brosterapiprobe-/i,
    /training-roster-focus-smoke/i,
    /training-roster-batch-delete-smoke/i
  ],
  TrainingForms: [
    /trn-api-/i,
    /trn-990-dbg001-/i,
    /ucae2e/i,
    /account-to-fill smoke/i,
    /flow probe/i,
    /security smoke/i
  ],
  CorrectiveActions: [
    /car-probe-/i,
    /car-777-focus-/i,
    /car-999-e2e-/i,
    /uar-sec-/i,
    /ui-attach-smoke/i,
    /flow probe/i,
    /smoke verification/i
  ],
  UnitContactApplications: [
    /public smoke/i,
    /campus backend smoke/i,
    /account-to-fill smoke/i,
    /unit-contact admin review smoke/i,
    /unit-contact activation smoke/i,
    /auto-credential-check/i,
    /contract diagnostic/i,
    /ucae2e/i,
    /unit-contact-campus-/i,
    /unit-contact-auto-/i,
    /unit-contact-\d+@/i,
    /unit-contact-admin-review-/i
  ],
  Checklists: [
    /chk-smoke-/i,
    /uar-sec-/i,
    /flow probe/i,
    /ui smoke only/i
  ],
  OpsAudit: [
    /gov-smoke-/i,
    /diagadmin/i,
    /probe-unit-manager-/i,
    /car-probe-/i,
    /car-777-focus-/i,
    /car-999-e2e-/i,
    /trn-api-/i,
    /trn-990-dbg001-/i,
    /chk-smoke-/i,
    /focusprobe-/i,
    /apiprobe-/i,
    /rosterfocusunit-/i,
    /rosterapiprobe-/i,
    /public smoke/i,
    /campus backend smoke/i,
    /account-to-fill smoke/i,
    /contract diagnostic/i,
    /auto-credential-check/i,
    /unit-contact-admin-review/i,
    /ui-attach-smoke/i,
    /flow probe/i
  ]
};

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    verbose: argv.includes('--verbose')
  };
}

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function toComparableBlob(item) {
  return JSON.stringify({
    id: item && item.id,
    fields: item && item.fields ? item.fields : item
  });
}

function getDisplayId(item) {
  const fields = item && item.fields ? item.fields : {};
  return normalizeText(
    fields.Title ||
    fields.CaseId ||
    fields.ChecklistId ||
    fields.TrainingId ||
    fields.RosterId ||
    fields.ApplicationId ||
    fields.RecordId ||
    fields.Username ||
    fields.ApplicantEmail ||
    item.id
  );
}

async function graphDelete(accessToken, url) {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const body = await res.text();
    const error = new Error(`DELETE failed: ${res.status} ${res.statusText}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
}

async function fetchAllListItems(accessToken, siteId, listId) {
  const items = [];
  let nextUrl = `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/items?$top=200&expand=fields`;
  while (nextUrl) {
    const page = await graphGet(accessToken, nextUrl);
    items.push(...(Array.isArray(page && page.value) ? page.value : []));
    nextUrl = page && page['@odata.nextLink'] ? page['@odata.nextLink'] : '';
  }
  return items;
}

function findMatches(listName, items) {
  const patterns = LIST_PATTERNS[listName] || [];
  if (!patterns.length) return [];
  return items.filter((item) => {
    const blob = toComparableBlob(item);
    return patterns.some((pattern) => pattern.test(blob));
  });
}

async function resolveLists(accessToken, siteId) {
  const result = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${siteId}/lists?$select=id,displayName&$top=200`);
  const byName = new Map();
  for (const list of result.value || []) {
    byName.set(list.displayName, list);
  }
  return byName;
}

async function main() {
  const { apply, verbose } = parseArgs(process.argv.slice(2));
  const config = loadBackendConfig();
  const token = await acquirePreferredGraphToken(config);
  const siteId = config.siteId || (config.sharePointSiteUrl
    ? await resolveSiteIdFromUrl(token.accessToken, config.sharePointSiteUrl)
    : await resolveSiteId(token.accessToken, null));
  const lists = await resolveLists(token.accessToken, siteId);
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    tokenMode: token.mode,
    siteId,
    lists: []
  };

  for (const listName of Object.keys(LIST_PATTERNS)) {
    const list = lists.get(listName);
    if (!list) {
      report.lists.push({ listName, found: false, matched: 0, deleted: 0, samples: [] });
      continue;
    }
    const items = await fetchAllListItems(token.accessToken, siteId, list.id);
    const matches = findMatches(listName, items);
    const samples = matches.slice(0, 20).map((item) => ({
      id: item.id,
      displayId: getDisplayId(item)
    }));
    const entry = {
      listName,
      found: true,
      total: items.length,
      matched: matches.length,
      deleted: 0,
      samples
    };

    if (apply) {
      for (const item of matches) {
        const deleteUrl = `${GRAPH_ROOT}/sites/${siteId}/lists/${list.id}/items/${item.id}`;
        await graphDelete(token.accessToken, deleteUrl);
        entry.deleted += 1;
        if (verbose) {
          console.log(`[cleanup] deleted ${listName} ${getDisplayId(item)}`);
        }
      }
    }

    report.lists.push(entry);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: error.message,
    status: error.status || null,
    body: error.body || null
  }, null, 2));
  process.exitCode = 1;
});
