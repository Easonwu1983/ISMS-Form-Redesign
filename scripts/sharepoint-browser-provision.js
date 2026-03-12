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
        { name: 'ProposerUnitCode', type: 'singleLineText', required: false },
        { name: 'ProposerName', type: 'singleLineText', required: true },
        { name: 'ProposerUsername', type: 'singleLineText', required: false },
        { name: 'ProposerDate', type: 'dateTime', required: false },
        { name: 'HandlerUnit', type: 'singleLineText', required: true },
        { name: 'HandlerUnitCode', type: 'singleLineText', required: false },
        { name: 'HandlerName', type: 'singleLineText', required: true },
        { name: 'HandlerUsername', type: 'singleLineText', required: false },
        { name: 'HandlerEmail', type: 'singleLineText', required: false },
        { name: 'HandlerDate', type: 'dateTime', required: false },
        { name: 'DeficiencyType', type: 'singleLineText', required: false },
        { name: 'Source', type: 'singleLineText', required: false },
        { name: 'CategoryJson', type: 'multipleLinesText', required: true },
        { name: 'Clause', type: 'singleLineText', required: false },
        { name: 'ProblemDescription', type: 'multipleLinesText', required: false },
        { name: 'Occurrence', type: 'multipleLinesText', required: false },
        { name: 'CorrectiveAction', type: 'multipleLinesText', required: false },
        { name: 'CorrectiveDueDate', type: 'dateTime', required: false },
        { name: 'RootCause', type: 'multipleLinesText', required: false },
        { name: 'RiskDescription', type: 'multipleLinesText', required: false },
        { name: 'RiskAcceptor', type: 'singleLineText', required: false },
        { name: 'RiskAcceptDate', type: 'dateTime', required: false },
        { name: 'RiskAssessDate', type: 'dateTime', required: false },
        { name: 'RootElimination', type: 'multipleLinesText', required: false },
        { name: 'RootEliminationDueDate', type: 'dateTime', required: false },
        { name: 'ReviewResult', type: 'singleLineText', required: false },
        { name: 'ReviewNextDate', type: 'dateTime', required: false },
        { name: 'Reviewer', type: 'singleLineText', required: false },
        { name: 'ReviewDate', type: 'dateTime', required: false },
        { name: 'PendingTrackingJson', type: 'multipleLinesText', required: false },
        { name: 'TrackingsJson', type: 'multipleLinesText', required: true },
        { name: 'Status', type: 'choice', required: true, choices: ['開立', '待矯正', '已提案', '審核中', '追蹤中', '結案'] },
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
        { name: 'SignStatus', type: 'choice', required: true, choices: ['待簽核', '已簽核'] },
        { name: 'SignDate', type: 'dateTime', required: false },
        { name: 'SupervisorNote', type: 'multipleLinesText', required: false },
        { name: 'ResultsJson', type: 'multipleLinesText', required: true },
        { name: 'SummaryTotal', type: 'number', required: true },
        { name: 'SummaryConform', type: 'number', required: true },
        { name: 'SummaryPartial', type: 'number', required: true },
        { name: 'SummaryNonConform', type: 'number', required: true },
        { name: 'SummaryNa', type: 'number', required: true },
        { name: 'Status', type: 'choice', required: true, choices: ['草稿', '已送出'] },
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
        { name: 'Status', type: 'choice', required: true, choices: ['暫存', '待簽核', '已完成填報', '退回更正'] },
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
      headers: {
        Accept: 'application/json;odata=verbose'
      }
    });
    if (!response.ok) {
      throw new Error(`contextinfo failed: ${response.status}`);
    }
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
