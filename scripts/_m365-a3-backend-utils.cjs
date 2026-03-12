const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const REQUIRED_ROLES = ['Sites.Manage.All', 'Sites.ReadWrite.All'];

function projectRoot() {
  return path.resolve(__dirname, '..');
}

function loadOptionalJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadBackendConfig() {
  const env = process.env;
  const localSecretPath = path.join(projectRoot(), '.local-secrets', 'm365-a3-backend.json');
  const localSecret = loadOptionalJson(localSecretPath) || {};

  const tenantId = env.M365_A3_TENANT_ID || localSecret.tenantId;
  const clientId = env.M365_A3_CLIENT_ID || localSecret.clientId;
  const clientSecret = env.M365_A3_CLIENT_SECRET || localSecret.clientSecret;
  const siteId = env.M365_A3_SITE_ID || localSecret.siteId || null;

  return {
    tenantId,
    clientId,
    clientSecret,
    siteId,
    localSecretPath,
    sharePointSiteUrl: env.M365_A3_SITE_URL || localSecret.sharePointSiteUrl || ''
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  }
  catch {
    json = null;
  }
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = json || text;
    throw error;
  }
  return json;
}

function decodeJwt(accessToken) {
  const payload = accessToken.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function tryAcquireDelegatedToken(command, options = {}) {
  try {
    const accessToken = execSync(command, {
      cwd: projectRoot(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    }).trim();

    if (!accessToken) {
      return null;
    }

    return {
      accessToken,
      decoded: decodeJwt(accessToken)
    };
  }
  catch {
    return null;
  }
}

async function acquireGraphToken(config) {
  if (!config.tenantId || !config.clientId || !config.clientSecret) {
    throw new Error('Missing M365 A3 backend config. Set tenant/client/secret or create .local-secrets/m365-a3-backend.json');
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const body = await tokenResponse.text();
  const json = body ? JSON.parse(body) : {};
  if (!tokenResponse.ok) {
    const error = new Error(`Token request failed: ${tokenResponse.status}`);
    error.status = tokenResponse.status;
    error.body = json;
    throw error;
  }
  return {
    accessToken: json.access_token,
    decoded: decodeJwt(json.access_token)
  };
}

function acquireDelegatedGraphTokenFromCli() {
  const azureCliToken = tryAcquireDelegatedToken(
    'az account get-access-token --resource-type ms-graph --query accessToken -o tsv'
  );
  if (azureCliToken) {
    return azureCliToken;
  }

  const m365CliToken = tryAcquireDelegatedToken(
    'm365 util accesstoken get --resource https://graph.microsoft.com --output text'
  );
  if (m365CliToken) {
    return m365CliToken;
  }

  const npxM365CliToken = tryAcquireDelegatedToken(
    'npx -y -p @pnp/cli-microsoft365 m365 util accesstoken get --resource https://graph.microsoft.com --output text'
  );
  if (npxM365CliToken) {
    return npxM365CliToken;
  }

  throw new Error('Unable to acquire delegated Graph token from Azure CLI or CLI for Microsoft 365.');
}

async function graphGet(accessToken, url) {
  return fetchJson(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

async function graphPost(accessToken, url, body) {
  return fetchJson(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function graphPatch(accessToken, url, body) {
  return fetchJson(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function adminConsentUrl(config) {
  return `https://login.microsoftonline.com/${config.tenantId}/adminconsent?client_id=${config.clientId}&redirect_uri=${encodeURIComponent('https://localhost')}`;
}

function rolesFromToken(decoded) {
  return Array.isArray(decoded.roles) ? decoded.roles : [];
}

function missingRoles(decoded) {
  const roles = new Set(rolesFromToken(decoded));
  return REQUIRED_ROLES.filter((role) => !roles.has(role));
}

async function resolveSiteId(accessToken, configuredSiteId) {
  if (configuredSiteId) return configuredSiteId;
  const root = await graphGet(accessToken, `${GRAPH_ROOT}/sites/root`);
  return root.id;
}

async function resolveSiteIdFromUrl(accessToken, siteUrl) {
  const cleanUrl = String(siteUrl || '').trim();
  if (!cleanUrl) return null;
  const parsed = new URL(cleanUrl);
  const hostname = parsed.hostname;
  const pathName = parsed.pathname || '/';
  const site = await graphGet(accessToken, `${GRAPH_ROOT}/sites/${hostname}:${pathName}`);
  return site.id;
}

function loadSchema() {
  const schemaPath = path.join(projectRoot(), 'm365', 'sharepoint', 'unit-contact-lists.schema.json');
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

function graphColumnFromSchema(column) {
  const base = {
    name: column.name,
    displayName: column.name,
    required: Boolean(column.required)
  };

  if (column.type === 'singleLineText') {
    return { ...base, text: {} };
  }

  if (column.type === 'multipleLinesText') {
    return {
      ...base,
      text: {
        allowMultipleLines: true,
        appendChangesToExistingText: false,
        linesForEditing: 6
      }
    };
  }

  if (column.type === 'choice') {
    return {
      ...base,
      choice: {
        allowTextEntry: false,
        choices: column.choices || [],
        displayAs: 'dropDownMenu'
      }
    };
  }

  if (column.type === 'dateTime') {
    return {
      ...base,
      dateTime: {
        displayAs: 'default',
        format: 'dateTime'
      }
    };
  }

  if (column.type === 'number') {
    return {
      ...base,
      number: {
        decimalPlaces: 'automatic',
        displayAs: 'number'
      }
    };
  }

  throw new Error(`Unsupported schema column type: ${column.type}`);
}

module.exports = {
  GRAPH_ROOT,
  REQUIRED_ROLES,
  adminConsentUrl,
  acquireGraphToken,
  acquireDelegatedGraphTokenFromCli,
  graphColumnFromSchema,
  graphGet,
  graphPatch,
  graphPost,
  loadBackendConfig,
  loadSchema,
  missingRoles,
  projectRoot,
  resolveSiteId,
  resolveSiteIdFromUrl,
  rolesFromToken
};
