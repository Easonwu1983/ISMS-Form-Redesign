const {
  buildApplicationId,
  createError,
  mapApplicationToGraphFields,
  mapGraphFieldsToApplication
} = require('./contract');

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

function getEnv(name, required) {
  const value = String(process.env[name] || '').trim();
  if (required && !value) {
    throw createError('Missing required environment variable: ' + name, 500);
  }
  return value;
}

function getSettings() {
  return {
    tenantId: getEnv('MS_TENANT_ID', true),
    clientId: getEnv('MS_CLIENT_ID', true),
    clientSecret: getEnv('MS_CLIENT_SECRET', true),
    graphScope: getEnv('MS_GRAPH_SCOPE', false) || 'https://graph.microsoft.com/.default',
    siteId: getEnv('SHAREPOINT_SITE_ID', true),
    applicationsListId: getEnv('SHAREPOINT_APPLICATIONS_LIST_ID', true)
  };
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    const message = body.error && body.error.message
      ? body.error.message
      : body.message || ('Graph request failed with HTTP ' + response.status);
    throw createError(message, response.status >= 500 ? 502 : 500);
  }
  return body;
}

let tokenCache = null;

async function getGraphAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60 * 1000) {
    return tokenCache.token;
  }
  const settings = getSettings();
  const body = new URLSearchParams({
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    grant_type: 'client_credentials',
    scope: settings.graphScope
  });
  const url = 'https://login.microsoftonline.com/' + settings.tenantId + '/oauth2/v2.0/token';
  const tokenBody = await requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  tokenCache = {
    token: tokenBody.access_token,
    expiresAt: Date.now() + (Number(tokenBody.expires_in || 3600) * 1000)
  };
  return tokenCache.token;
}

async function graphRequest(pathOrUrl, options) {
  const token = await getGraphAccessToken();
  const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
  const url = isAbsolute ? pathOrUrl : GRAPH_ROOT + pathOrUrl;
  const method = (options && options.method) || 'GET';
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json'
  };
  let body;
  if (options && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  return requestJson(url, { method, headers, body });
}

async function listAllApplications() {
  const settings = getSettings();
  let url = GRAPH_ROOT + '/sites/' + settings.siteId + '/lists/' + settings.applicationsListId + '/items?$expand=fields&$top=200';
  const items = [];

  while (url) {
    const body = await graphRequest(url);
    const batch = Array.isArray(body.value) ? body.value : [];
    items.push(...batch);
    url = body['@odata.nextLink'] || '';
  }

  return items
    .map((entry) => entry && entry.fields ? mapGraphFieldsToApplication(entry.fields) : null)
    .filter(Boolean);
}

function parseSequenceFromId(id, year) {
  const prefix = 'UCA-' + year + '-';
  if (!String(id || '').startsWith(prefix)) return 0;
  const raw = String(id).slice(prefix.length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createSharePointRepository() {
  return {
    async getNextSequence(year) {
      const applications = await listAllApplications();
      const max = applications.reduce((currentMax, entry) => {
        return Math.max(currentMax, parseSequenceFromId(entry.id, year));
      }, 0);
      return max + 1;
    },

    async createApplication(application) {
      const settings = getSettings();
      const fields = mapApplicationToGraphFields(application);
      const created = await graphRequest(
        '/sites/' + settings.siteId + '/lists/' + settings.applicationsListId + '/items',
        {
          method: 'POST',
          body: { fields }
        }
      );
      return created && created.fields ? mapGraphFieldsToApplication(created.fields) : mapGraphFieldsToApplication(fields);
    },

    async listApplicationsByEmail(email) {
      const applications = await listAllApplications();
      return applications
        .filter((entry) => entry.applicantEmail === email)
        .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)));
    },

    async getHealth() {
      const settings = getSettings();
      const listInfo = await graphRequest('/sites/' + settings.siteId + '/lists/' + settings.applicationsListId + '?$select=id,name,displayName,webUrl');
      const nextSequence = await this.getNextSequence(new Date().getFullYear());
      return {
        mode: 'sharepoint',
        siteId: settings.siteId,
        applicationsListId: settings.applicationsListId,
        listDisplayName: listInfo.displayName || listInfo.name || '',
        listWebUrl: listInfo.webUrl || '',
        sampleNextId: buildApplicationId(nextSequence, new Date())
      };
    }
  };
}

module.exports = {
  createSharePointRepository
};
