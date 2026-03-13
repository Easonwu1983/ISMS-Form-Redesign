(async function sharePointBrowserProvision() {
  const LIST_SCHEMAS = [
    {
      name: 'CorrectiveActions',
      description: 'Corrective action cases, tracking rounds, and supporting metadata',
      columns: [
        { name: 'CaseId', type: 'singleLineText', required: true },
        { name: 'DocumentNo', type: 'singleLineText', required: false },
        { name: 'CaseSeq', type: 'number', required: false },
        { name: 'ProposerUnit', type: 'singleLineText', required: true },
        { name: 'ProposerName', type: 'singleLineText', required: true },
        { name: 'HandlerUnit', type: 'singleLineText', required: true },
        { name: 'HandlerName', type: 'singleLineText', required: true },
        { name: 'DeficiencyType', type: 'choice', required: true, choices: ['\u4e3b\u8981\u7f3a\u5931', '\u6b21\u8981\u7f3a\u5931', '\u89c0\u5bdf', '\u5efa\u8b70'] },
        { name: 'Source', type: 'choice', required: true, choices: ['\u5167\u90e8\u7a3d\u6838', '\u5916\u90e8\u7a3d\u6838', '\u6559\u80b2\u90e8\u7a3d\u6838', '\u8cc7\u5b89\u4e8b\u6545', '\u7cfb\u7d71\u8b8a\u66f4', '\u4f7f\u7528\u8005\u62b1\u6028', '\u5176\u4ed6'] },
        { name: 'CategoryJson', type: 'multipleLinesText', required: true },
        { name: 'ProblemDescription', type: 'multipleLinesText', required: true },
        { name: 'Occurrence', type: 'multipleLinesText', required: true },
        { name: 'CorrectiveAction', type: 'multipleLinesText', required: false },
        { name: 'CorrectiveDueDate', type: 'dateTime', required: false },
        { name: 'PendingTrackingJson', type: 'multipleLinesText', required: false },
        { name: 'TrackingsJson', type: 'multipleLinesText', required: true },
        { name: 'Status', type: 'choice', required: true, choices: ['\u958b\u7acb', '\u5f85\u77ef\u6b63', '\u5df2\u63d0\u6848', '\u5be9\u6838\u4e2d', '\u8ffd\u8e64\u4e2d', '\u7d50\u6848'] },
        { name: 'CreatedAt', type: 'dateTime', required: true },
        { name: 'UpdatedAt', type: 'dateTime', required: true },
        { name: 'ClosedDate', type: 'dateTime', required: false },
        { name: 'EvidenceJson', type: 'multipleLinesText', required: true },
        { name: 'HistoryJson', type: 'multipleLinesText', required: true },
        { name: 'BackendMode', type: 'choice', required: true, choices: ['a3-campus-backend'] },
        { name: 'RecordSource', type: 'choice', required: true, choices: ['frontend', 'manual', 'migration'] }
      ]
    },
    {
      name: 'Checklists',
      description: 'Submitted and draft checklist records for internal audit forms',
      columns: [
        { name: 'ChecklistId', type: 'singleLineText', required: true },
        { name: 'DocumentNo', type: 'singleLineText', required: false },
        { name: 'ChecklistSeq', type: 'number', required: false },
        { name: 'Unit', type: 'singleLineText', required: true },
        { name: 'UnitCode', type: 'singleLineText', required: false },
        { name: 'FillerName', type: 'singleLineText', required: true },
        { name: 'FillerUsername', type: 'singleLineText', required: false },
        { name: 'FillDate', type: 'dateTime', required: true },
        { name: 'AuditYear', type: 'singleLineText', required: true },
        { name: 'SupervisorName', type: 'singleLineText', required: false },
        { name: 'SupervisorTitle', type: 'singleLineText', required: false },
        { name: 'SignStatus', type: 'choice', required: true, choices: ['\u5f85\u7c3d\u6838', '\u5df2\u7c3d\u6838'] },
        { name: 'SignDate', type: 'dateTime', required: false },
        { name: 'SupervisorNote', type: 'multipleLinesText', required: false },
        { name: 'ResultsJson', type: 'multipleLinesText', required: true },
        { name: 'SummaryTotal', type: 'number', required: true },
        { name: 'SummaryConform', type: 'number', required: true },
        { name: 'SummaryPartial', type: 'number', required: true },
        { name: 'SummaryNonConform', type: 'number', required: true },
        { name: 'SummaryNa', type: 'number', required: true },
        { name: 'Status', type: 'choice', required: true, choices: ['\u8349\u7a3f', '\u5df2\u9001\u51fa'] },
        { name: 'CreatedAt', type: 'dateTime', required: true },
        { name: 'UpdatedAt', type: 'dateTime', required: true },
        { name: 'BackendMode', type: 'choice', required: true, choices: ['a3-campus-backend'] },
        { name: 'RecordSource', type: 'choice', required: true, choices: ['frontend', 'manual', 'migration'] }
      ]
    },
    {
      name: 'TrainingForms',
      description: 'Draft and submitted training statistics forms',
      columns: [
        { name: 'FormId', type: 'singleLineText', required: true },
        { name: 'DocumentNo', type: 'singleLineText', required: false },
        { name: 'FormSeq', type: 'number', required: false },
        { name: 'Unit', type: 'singleLineText', required: true },
        { name: 'UnitCode', type: 'singleLineText', required: false },
        { name: 'StatsUnit', type: 'singleLineText', required: false },
        { name: 'FillerName', type: 'singleLineText', required: true },
        { name: 'FillerUsername', type: 'singleLineText', required: false },
        { name: 'SubmitterPhone', type: 'singleLineText', required: false },
        { name: 'SubmitterEmail', type: 'singleLineText', required: false },
        { name: 'FillDate', type: 'dateTime', required: true },
        { name: 'TrainingYear', type: 'singleLineText', required: true },
        { name: 'Status', type: 'choice', required: true, choices: ['\u66ab\u5b58', '\u5f85\u7c3d\u6838', '\u5df2\u5b8c\u6210\u586b\u5831', '\u9000\u56de\u66f4\u6b63'] },
        { name: 'RecordsJson', type: 'multipleLinesText', required: true },
        { name: 'SummaryJson', type: 'multipleLinesText', required: true },
        { name: 'ActiveCount', type: 'number', required: true },
        { name: 'CompletedCount', type: 'number', required: true },
        { name: 'IncompleteCount', type: 'number', required: true },
        { name: 'CompletionRate', type: 'number', required: true },
        { name: 'SignedFilesJson', type: 'multipleLinesText', required: false },
        { name: 'ReturnReason', type: 'multipleLinesText', required: false },
        { name: 'CreatedAt', type: 'dateTime', required: true },
        { name: 'UpdatedAt', type: 'dateTime', required: true },
        { name: 'StepOneSubmittedAt', type: 'dateTime', required: false },
        { name: 'PrintedAt', type: 'dateTime', required: false },
        { name: 'SignoffUploadedAt', type: 'dateTime', required: false },
        { name: 'SubmittedAt', type: 'dateTime', required: false },
        { name: 'HistoryJson', type: 'multipleLinesText', required: true },
        { name: 'BackendMode', type: 'choice', required: true, choices: ['a3-campus-backend'] },
        { name: 'RecordSource', type: 'choice', required: true, choices: ['frontend', 'manual', 'migration'] }
      ]
    },
    {
      name: 'TrainingRosters',
      description: 'Imported and manually added training roster rows',
      columns: [
        { name: 'RosterId', type: 'singleLineText', required: true },
        { name: 'Unit', type: 'singleLineText', required: true },
        { name: 'StatsUnit', type: 'singleLineText', required: false },
        { name: 'L1Unit', type: 'singleLineText', required: false },
        { name: 'Name', type: 'singleLineText', required: true },
        { name: 'UnitName', type: 'singleLineText', required: false },
        { name: 'Identity', type: 'singleLineText', required: false },
        { name: 'JobTitle', type: 'singleLineText', required: false },
        { name: 'Source', type: 'choice', required: true, choices: ['import', 'manual'] },
        { name: 'CreatedBy', type: 'singleLineText', required: false },
        { name: 'CreatedByUsername', type: 'singleLineText', required: false },
        { name: 'CreatedAt', type: 'dateTime', required: true },
        { name: 'UpdatedAt', type: 'dateTime', required: true },
        { name: 'BackendMode', type: 'choice', required: true, choices: ['a3-campus-backend'] },
        { name: 'RecordSource', type: 'choice', required: true, choices: ['frontend', 'manual', 'migration'] }
      ]
    },
    {
      name: 'SystemUsers',
      description: 'System user accounts and authorized unit scopes',
      columns: [
        { name: 'UserName', type: 'singleLineText', required: true },
        { name: 'Password', type: 'singleLineText', required: true },
        { name: 'PasswordSecret', type: 'multipleLinesText', required: false },
        { name: 'DisplayName', type: 'singleLineText', required: true },
        { name: 'Email', type: 'singleLineText', required: true },
        { name: 'Role', type: 'choice', required: true, choices: ['\u6700\u9ad8\u7ba1\u7406\u54e1', '\u55ae\u4f4d\u7ba1\u7406\u54e1', '\u586b\u5831\u4eba', '\u8de8\u55ae\u4f4d\u6aa2\u8996\u8005'] },
        { name: 'PrimaryUnit', type: 'singleLineText', required: false },
        { name: 'AuthorizedUnitsJson', type: 'multipleLinesText', required: true },
        { name: 'ActiveUnit', type: 'singleLineText', required: false },
        { name: 'CreatedAt', type: 'dateTime', required: true },
        { name: 'UpdatedAt', type: 'dateTime', required: true },
        { name: 'PasswordChangedAt', type: 'dateTime', required: false },
        { name: 'ResetTokenExpiresAt', type: 'dateTime', required: false },
        { name: 'ResetRequestedAt', type: 'dateTime', required: false },
        { name: 'MustChangePassword', type: 'choice', required: true, choices: ['true', 'false'] },
        { name: 'SessionVersion', type: 'number', required: true },
        { name: 'BackendMode', type: 'choice', required: true, choices: ['a3-campus-backend'] },
        { name: 'RecordSource', type: 'choice', required: true, choices: ['frontend', 'manual', 'migration'] }
      ]
    },
    {
      name: 'UnitReviewScopes',
      description: 'Reviewable unit scopes assigned to unit administrators',
      columns: [
        { name: 'ScopeId', type: 'singleLineText', required: true },
        { name: 'UserName', type: 'singleLineText', required: true },
        { name: 'UnitValue', type: 'singleLineText', required: true },
        { name: 'CreatedAt', type: 'dateTime', required: true },
        { name: 'UpdatedAt', type: 'dateTime', required: true },
        { name: 'BackendMode', type: 'choice', required: true, choices: ['a3-campus-backend'] },
        { name: 'RecordSource', type: 'choice', required: true, choices: ['frontend', 'manual', 'migration'] }
      ]
    }
  ];

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
    if (column.type === 'multipleLinesText') {
      return `<Field Type="Note" DisplayName="${name}" Name="${name}" StaticName="${name}" Required="${required}" NumLines="6" RichText="FALSE" AppendOnly="FALSE" />`;
    }
    if (column.type === 'number') {
      return `<Field Type="Number" DisplayName="${name}" Name="${name}" StaticName="${name}" Required="${required}" Decimals="AUTO" />`;
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
    return response.json();
  }

  async function listExists(name) {
    try {
      await spFetch(`/_api/web/lists/GetByTitle('${encodeURIComponent(name)}')?$select=Id,Title`, {
        headers: { Accept: 'application/json;odata=verbose' }
      });
      return true;
    } catch (error) {
      if (String(error.message || '').includes('404')) return false;
      throw error;
    }
  }

  async function ensureList(schema, digest) {
    const exists = await listExists(schema.name);
    if (exists) {
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
        BaseTemplate: 100,
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

  const digest = await getDigest();
  for (const schema of LIST_SCHEMAS) {
    await ensureList(schema, digest);
    for (const column of schema.columns) {
      await ensureField(schema.name, column, digest);
    }
  }
  console.log('SharePoint browser provision completed.');
})();
