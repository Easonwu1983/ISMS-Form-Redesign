(async function sharePointBrowserAttachmentProvision() {
  const LIBRARY_SCHEMA = {
    name: 'ISMSAttachments',
    description: 'Attachment library for corrective actions, checklists, and training records',
    template: 101,
    folders: [
      'corrective-actions',
      'checklists',
      'training',
      'misc'
    ],
    columns: [
      { name: 'AttachmentId', type: 'singleLineText', required: false },
      { name: 'Scope', type: 'choice', required: false, choices: ['corrective-actions', 'checklists', 'training', 'misc'] },
      { name: 'OwnerId', type: 'singleLineText', required: false },
      { name: 'RecordType', type: 'singleLineText', required: false },
      { name: 'ContentTypeHint', type: 'singleLineText', required: false },
      { name: 'UploadedAt', type: 'dateTime', required: false }
    ]
  };

  function escapeXml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function resolveWebAbsoluteUrl() {
    if (typeof window !== 'undefined' && window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl) {
      return String(window._spPageContextInfo.webAbsoluteUrl).trim();
    }
    const currentUrl = new URL(window.location.href);
    const segments = currentUrl.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && (segments[0] === 'sites' || segments[0] === 'teams')) {
      return `${currentUrl.origin}/${segments[0]}/${segments[1]}`;
    }
    return currentUrl.origin;
  }

  function fieldXml(column) {
    const required = column.required ? 'TRUE' : 'FALSE';
    const name = escapeXml(column.name);
    if (column.type === 'singleLineText') {
      return `<Field Type="Text" DisplayName="${name}" Name="${name}" StaticName="${name}" Required="${required}" MaxLength="255" />`;
    }
    if (column.type === 'dateTime') {
      return `<Field Type="DateTime" DisplayName="${name}" Name="${name}" StaticName="${name}" Required="${required}" Format="DateTime" FriendlyDisplayFormat="Disabled" />`;
    }
    if (column.type === 'choice') {
      const choices = (column.choices || []).map((choice) => `<CHOICE>${escapeXml(choice)}</CHOICE>`).join('');
      return `<Field Type="Choice" DisplayName="${name}" Name="${name}" StaticName="${name}" Required="${required}" Format="Dropdown"><CHOICES>${choices}</CHOICES></Field>`;
    }
    throw new Error(`Unsupported column type: ${column.type}`);
  }

  async function getDigest() {
    const response = await fetch(`${resolveWebAbsoluteUrl()}/_api/contextinfo`, {
      method: 'POST',
      headers: { Accept: 'application/json;odata=verbose' }
    });
    if (!response.ok) throw new Error(`contextinfo failed: ${response.status}`);
    const data = await response.json();
    return data.d.GetContextWebInformation.FormDigestValue;
  }

  async function spFetch(path, options) {
    const response = await fetch(`${resolveWebAbsoluteUrl()}${path}`, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function libraryExists(name) {
    try {
      await spFetch(`/_api/web/lists/GetByTitle('${encodeURIComponent(name)}')?$select=Id,Title,RootFolder/ServerRelativeUrl&$expand=RootFolder`, {
        headers: { Accept: 'application/json;odata=verbose' }
      });
      return true;
    } catch (error) {
      if (String(error.message || '').includes('404')) return false;
      throw error;
    }
  }

  async function ensureLibrary(schema, digest) {
    if (await libraryExists(schema.name)) {
      console.log(`[exists] ${schema.name}`);
      return;
    }
    await spFetch('/_api/web/lists', {
      method: 'POST',
      headers: {
        Accept: 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': digest
      },
      body: JSON.stringify({
        __metadata: { type: 'SP.List' },
        AllowContentTypes: true,
        BaseTemplate: schema.template || 101,
        ContentTypesEnabled: true,
        Description: schema.description,
        Title: schema.name
      })
    });
    console.log(`[created] ${schema.name}`);
  }

  async function getFieldNames(listName) {
    const data = await spFetch(`/_api/web/lists/GetByTitle('${encodeURIComponent(listName)}')/fields?$select=Title,InternalName`, {
      headers: { Accept: 'application/json;odata=verbose' }
    });
    return new Set((data.d.results || []).map((field) => String(field.InternalName || field.Title || '').trim()));
  }

  async function ensureField(listName, column, digest) {
    if (column.name === 'Title') return;
    const existing = await getFieldNames(listName);
    if (existing.has(column.name)) {
      console.log(`  [exists] ${listName}.${column.name}`);
      return;
    }
    await spFetch(`/_api/web/lists/GetByTitle('${encodeURIComponent(listName)}')/fields/createfieldasxml`, {
      method: 'POST',
      headers: {
        Accept: 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': digest
      },
      body: JSON.stringify({
        parameters: {
          __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
          SchemaXml: fieldXml(column),
          Options: 0
        }
      })
    });
    console.log(`  [created] ${listName}.${column.name}`);
  }

  async function getRootFolderServerRelativeUrl(listName) {
    const data = await spFetch(`/_api/web/lists/GetByTitle('${encodeURIComponent(listName)}')?$select=RootFolder/ServerRelativeUrl&$expand=RootFolder`, {
      headers: { Accept: 'application/json;odata=verbose' }
    });
    return String(data.d.RootFolder.ServerRelativeUrl || '').trim();
  }

  async function folderExists(serverRelativeUrl) {
    try {
      await spFetch(`/_api/web/GetFolderByServerRelativeUrl('${encodeURIComponent(serverRelativeUrl)}')?$select=Name`, {
        headers: { Accept: 'application/json;odata=verbose' }
      });
      return true;
    } catch (error) {
      if (String(error.message || '').includes('404')) return false;
      throw error;
    }
  }

  async function ensureFolder(listName, folderName, digest) {
    const rootUrl = await getRootFolderServerRelativeUrl(listName);
    const folderUrl = `${rootUrl}/${folderName}`;
    if (await folderExists(folderUrl)) {
      console.log(`  [exists] ${listName}/${folderName}`);
      return;
    }
    await spFetch('/_api/web/folders', {
      method: 'POST',
      headers: {
        Accept: 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': digest
      },
      body: JSON.stringify({
        __metadata: { type: 'SP.Folder' },
        ServerRelativeUrl: folderUrl
      })
    });
    console.log(`  [created] ${listName}/${folderName}`);
  }

  const digest = await getDigest();
  await ensureLibrary(LIBRARY_SCHEMA, digest);
  for (const column of LIBRARY_SCHEMA.columns) {
    await ensureField(LIBRARY_SCHEMA.name, column, digest);
  }
  for (const folderName of LIBRARY_SCHEMA.folders) {
    await ensureFolder(LIBRARY_SCHEMA.name, folderName, digest);
  }
  console.log('SharePoint attachment library provision completed.');
})();
