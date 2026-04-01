#!/usr/bin/env node
'use strict';

/**
 * ISMS SharePoint → PostgreSQL Data Migration
 *
 * Usage:
 *   node migrate-from-sharepoint.cjs [--dump-only] [--table <name>] [--skip-attachments]
 *
 * Prerequisites:
 *   - runtime.local.json or environment with both M365 and postgres config
 *   - PostgreSQL schema 001 + 002 already applied
 *   - Graph API token available (delegated-cli or app-only)
 *
 * The script:
 *   1. Reads each SharePoint list via Graph API
 *   2. Saves raw JSON to ./migration-data/<table>.json
 *   3. INSERTs into PostgreSQL
 *   4. Adjusts sequences to max(id) + 10
 *   5. Prints verification summary
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ── Load backend config ─────────────────────────────────────
// We need the M365 token + PG connection

// Bootstrap environment from runtime config
const serviceHostPath = path.resolve(__dirname, '..', 'service-host.cjs');
if (fs.existsSync(serviceHostPath)) {
  try {
    const { applyEnvFromConfig } = require(serviceHostPath);
    if (typeof applyEnvFromConfig === 'function') applyEnvFromConfig();
  } catch (_) { /* ok if not available */ }
}

const {
  GRAPH_ROOT,
  acquirePreferredGraphToken,
  loadBackendConfig,
  resolveSiteIdFromUrl
} = require('../../../scripts/_m365-a3-backend-utils.cjs');

// Contract mappers
const unitContactContract = require('../../azure-function/unit-contact-api/src/shared/contract');
const systemUserContract = require('../../azure-function/system-user-api/src/shared/contract');
const checklistContract = require('../../azure-function/checklist-api/src/shared/contract');
const correctiveActionContract = require('../../azure-function/corrective-action-api/src/shared/contract');
const trainingContract = require('../../azure-function/training-api/src/shared/contract');
const auditTrailContract = require('../../azure-function/audit-trail-api/src/shared/contract');
const reviewScopeContract = require('../../azure-function/review-scope-api/src/shared/contract');

// ── CLI args ────────────────────────────────────────────────

const args = process.argv.slice(2);
const DUMP_ONLY = args.includes('--dump-only');
const SKIP_ATTACHMENTS = args.includes('--skip-attachments');
const TABLE_FILTER = args.includes('--table') ? args[args.indexOf('--table') + 1] : null;
const DATA_DIR = path.resolve(__dirname, 'migration-data');

function cleanText(value) { return String(value || '').trim(); }

// ── Graph API helpers ───────────────────────────────────────

let _tokenCache = null;
let _tokenExpMs = 0;

async function getGraphToken() {
  if (_tokenCache && _tokenExpMs > Date.now() + 60000) return _tokenCache;
  const config = loadBackendConfig();
  const token = await acquirePreferredGraphToken(config);
  _tokenCache = token.accessToken;
  const decoded = JSON.parse(Buffer.from(String(token.accessToken).split('.')[1], 'base64url').toString('utf8'));
  _tokenExpMs = Number(decoded.exp || 0) * 1000;
  return _tokenCache;
}

async function graphRequest(method, pathOrUrl) {
  const accessToken = await getGraphToken();
  const targetUrl = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : GRAPH_ROOT + pathOrUrl;
  const response = await fetch(targetUrl, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph ${response.status}: ${text.substring(0, 200)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function resolveSiteId() {
  const config = loadBackendConfig();
  const siteId = cleanText(process.env.UNIT_CONTACT_SHAREPOINT_SITE_ID || config.siteId);
  if (siteId) return siteId;
  const siteUrl = cleanText(process.env.UNIT_CONTACT_SHAREPOINT_SITE_URL || config.sharePointSiteUrl);
  if (!siteUrl) throw new Error('No SharePoint site configured');
  const accessToken = await getGraphToken();
  return resolveSiteIdFromUrl(accessToken, siteUrl);
}

async function fetchAllListItems(siteId, listId) {
  const rows = [];
  let nextUrl = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`;
  while (nextUrl) {
    const body = await graphRequest('GET', nextUrl);
    const batch = Array.isArray(body && body.value) ? body.value : [];
    rows.push(...batch);
    nextUrl = cleanText(body && body['@odata.nextLink']);
  }
  return rows;
}

async function findListByName(siteId, listName) {
  const body = await graphRequest('GET', `/sites/${siteId}/lists?$select=id,displayName`);
  const lists = Array.isArray(body && body.value) ? body.value : [];
  const match = lists.find((l) => cleanText(l.displayName) === listName);
  if (!match) throw new Error(`SharePoint list not found: ${listName}`);
  return match;
}

// ── PG connection ───────────────────────────────────────────

function createPool() {
  return new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'isms_db',
    user: process.env.PG_USER || 'isms_user',
    password: process.env.PG_PASSWORD,
    max: 3
  });
}

// ── Utilities ───────────────────────────────────────────────

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  return value;
}

function saveJson(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  💾 Saved ${data.length} records → ${filePath}`);
}

function log(msg) { console.log(`[migrate] ${msg}`); }
function logOk(msg) { console.log(`  ✅ ${msg}`); }
function logWarn(msg) { console.warn(`  ⚠️  ${msg}`); }

// ── Migration: system_users ─────────────────────────────────

async function migrateSystemUsers(pool, siteId) {
  const listName = cleanText(process.env.SYSTEM_USERS_LIST) || 'SystemUsers';
  log(`Migrating ${listName} → system_users`);
  const list = await findListByName(siteId, listName);
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return systemUserContract.mapGraphFieldsToSystemUser
      ? systemUserContract.mapGraphFieldsToSystemUser(f)
      : {
          username: f.UserName || f.Title || '',
          password: f.PasswordSecret || f.Password || '',
          name: f.DisplayName || '',
          email: f.Email || '',
          role: f.Role || '單位管理員',
          securityRoles: parseJson(f.SecurityRolesJson, []),
          primaryUnit: f.PrimaryUnit || '',
          authorizedUnits: parseJson(f.AuthorizedUnitsJson, []),
          scopeUnits: parseJson(f.ScopeUnitsJson, []),
          activeUnit: f.ActiveUnit || '',
          mustChangePassword: f.MustChangePassword === true || f.MustChangePassword === 'true',
          sessionVersion: Number(f.SessionVersion) || 1,
          backendMode: f.BackendMode || '',
          recordSource: f.RecordSource || '',
          createdAt: f.CreatedAt || '',
          updatedAt: f.UpdatedAt || ''
        };
  }).filter((r) => cleanText(r.username));
  saveJson('system_users', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      await pool.query(`
        INSERT INTO system_users (
          username, password, name, display_name, email, role,
          security_roles_json, primary_unit, authorized_units_json,
          scope_units_json, units_json, unit, active_unit,
          must_change_password, session_version,
          backend_mode, record_source, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (username) DO NOTHING
      `, [
        cleanText(r.username), cleanText(r.password),
        cleanText(r.name), cleanText(r.name),
        cleanText(r.email), cleanText(r.role) || '單位管理員',
        JSON.stringify(r.securityRoles || []),
        cleanText(r.primaryUnit),
        JSON.stringify(r.authorizedUnits || []),
        JSON.stringify(r.scopeUnits || r.authorizedUnits || []),
        JSON.stringify(r.units || r.authorizedUnits || []),
        cleanText(r.unit || r.primaryUnit),
        cleanText(r.activeUnit),
        !!r.mustChangePassword,
        Number(r.sessionVersion) || 1,
        'migration', 'sharepoint-migration',
        cleanText(r.createdAt) || new Date().toISOString(),
        cleanText(r.updatedAt) || new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`system_users skip: ${cleanText(r.username)} — ${err.message}`);
    }
  }
  logOk(`system_users: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: unit_contact_applications ─────────────────────

async function migrateApplications(pool, siteId) {
  const listName = cleanText(process.env.UNIT_CONTACT_APPLICATIONS_LIST) || 'UnitContactApplications';
  log(`Migrating ${listName} → unit_contact_applications`);
  const list = await findListByName(siteId, listName);
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return unitContactContract.mapGraphFieldsToApplication
      ? unitContactContract.mapGraphFieldsToApplication({
          ...f,
          Created: item.createdDateTime,
          Modified: item.lastModifiedDateTime
        })
      : f;
  }).filter((r) => cleanText(r.id));
  saveJson('unit_contact_applications', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      await pool.query(`
        INSERT INTO unit_contact_applications (
          application_id, applicant_name, applicant_email, extension_number,
          unit_category, primary_unit, primary_unit_name, primary_unit_code,
          secondary_unit, secondary_unit_name, secondary_unit_code,
          unit_value, unit_code, contact_type, note,
          authorized_units_json, security_roles_json,
          authorization_doc_attachment_id, authorization_doc_drive_item_id,
          authorization_doc_file_name, authorization_doc_content_type,
          authorization_doc_size, authorization_doc_uploaded_at,
          status, status_label, status_detail, source, backend_mode,
          submitted_at, updated_at, reviewed_at, reviewed_by, review_comment,
          activation_sent_at, activated_at, external_user_id, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)
        ON CONFLICT (application_id) DO NOTHING
      `, [
        cleanText(r.id), cleanText(r.applicantName), cleanText(r.applicantEmail),
        cleanText(r.extensionNumber), cleanText(r.unitCategory),
        cleanText(r.primaryUnit), cleanText(r.primaryUnit), cleanText(r.unitCode),
        cleanText(r.secondaryUnit), cleanText(r.secondaryUnit), '',
        cleanText(r.unitValue), cleanText(r.unitCode), cleanText(r.contactType),
        cleanText(r.note),
        JSON.stringify(r.authorizedUnits || []),
        JSON.stringify(r.securityRoles || []),
        cleanText(r.authorizationDocAttachmentId), cleanText(r.authorizationDocDriveItemId),
        cleanText(r.authorizationDocFileName), cleanText(r.authorizationDocContentType),
        Number(r.authorizationDocSize || 0),
        cleanText(r.authorizationDocUploadedAt) || null,
        cleanText(r.status), cleanText(r.statusLabel), cleanText(r.statusDetail),
        cleanText(r.source) || 'sharepoint', 'migration',
        cleanText(r.submittedAt) || new Date().toISOString(),
        cleanText(r.updatedAt) || new Date().toISOString(),
        cleanText(r.reviewedAt) || null,
        cleanText(r.reviewedBy), cleanText(r.reviewComment),
        cleanText(r.activationSentAt) || null,
        cleanText(r.activatedAt) || null,
        cleanText(r.externalUserId),
        cleanText(r.createdAt || r.submittedAt) || new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`application skip: ${cleanText(r.id)} — ${err.message}`);
    }
  }
  logOk(`unit_contact_applications: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: unit_admins ──────────────────────────────────

async function migrateUnitAdmins(pool, siteId) {
  const listName = cleanText(process.env.UNIT_CONTACT_UNITADMINS_LIST) || 'UnitAdmins';
  log(`Migrating ${listName} → unit_admins`);
  let list;
  try {
    list = await findListByName(siteId, listName);
  } catch (_) {
    logWarn(`UnitAdmins list not found, skipping`);
    return 0;
  }
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return {
      displayName: f.DisplayName || f.Title || '',
      email: f.Email || '',
      unitCode: f.UnitCode || '',
      unitName: f.UnitName || '',
      contactType: f.ContactType || '',
      status: f.Status || 'active',
      externalUserId: f.ExternalUserId || '',
      appUsername: f.AppUsername || '',
      extensionNumber: f.ExtensionNumber || '',
      activatedAt: f.ActivatedAt || '',
      lastApplicationId: f.LastApplicationId || ''
    };
  }).filter((r) => cleanText(r.email));
  saveJson('unit_admins', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      await pool.query(`
        INSERT INTO unit_admins (
          display_name, email, app_username, extension_number,
          unit_code, unit_name, contact_type, status,
          external_user_id, activated_at, last_application_id,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [
        cleanText(r.displayName), cleanText(r.email),
        cleanText(r.appUsername), cleanText(r.extensionNumber),
        cleanText(r.unitCode), cleanText(r.unitName),
        cleanText(r.contactType) || 'primary',
        cleanText(r.status) || 'active',
        cleanText(r.externalUserId),
        cleanText(r.activatedAt) || null,
        cleanText(r.lastApplicationId),
        new Date().toISOString(), new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`unit_admin skip: ${cleanText(r.email)} — ${err.message}`);
    }
  }
  logOk(`unit_admins: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: checklists ───────────────────────────────────

async function migrateChecklists(pool, siteId) {
  const listName = cleanText(process.env.CHECKLISTS_LIST) || 'Checklists';
  log(`Migrating ${listName} → checklists`);
  const list = await findListByName(siteId, listName);
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return checklistContract.mapGraphFieldsToChecklist
      ? checklistContract.mapGraphFieldsToChecklist(f)
      : f;
  }).filter((r) => cleanText(r.id));
  saveJson('checklists', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      const results = Array.isArray(r.results) ? r.results : parseJson(r.results, []);
      const summary = r.summary || {};
      await pool.query(`
        INSERT INTO checklists (
          checklist_id, document_no, checklist_seq, unit, unit_code,
          filler_name, filler_username, fill_date, audit_year,
          supervisor_name, supervisor_title, sign_status, sign_date,
          supervisor_note, results_json,
          summary_total, summary_conform, summary_partial, summary_non_conform, summary_na,
          status, backend_mode, record_source, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        ON CONFLICT (checklist_id) DO NOTHING
      `, [
        cleanText(r.id), cleanText(r.documentNo), Number(r.checklistSeq) || null,
        cleanText(r.unit), cleanText(r.unitCode),
        cleanText(r.fillerName), cleanText(r.fillerUsername),
        cleanText(r.fillDate) || new Date().toISOString(),
        cleanText(r.auditYear),
        cleanText(r.supervisorName), cleanText(r.supervisorTitle),
        cleanText(r.signStatus) || '待簽核',
        cleanText(r.signDate) || null,
        cleanText(r.supervisorNote),
        JSON.stringify(results),
        Number(summary.total) || 0, Number(summary.conform) || 0,
        Number(summary.partial) || 0, Number(summary.nonConform) || 0,
        Number(summary.na) || 0,
        cleanText(r.status) || '草稿',
        'migration', 'sharepoint-migration',
        cleanText(r.createdAt) || new Date().toISOString(),
        cleanText(r.updatedAt) || new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`checklist skip: ${cleanText(r.id)} — ${err.message}`);
    }
  }
  logOk(`checklists: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: corrective_actions ───────────────────────────

async function migrateCorrectiveActions(pool, siteId) {
  const listName = cleanText(process.env.CORRECTIVE_ACTIONS_LIST) || 'CorrectiveActions';
  log(`Migrating ${listName} → corrective_actions`);
  const list = await findListByName(siteId, listName);
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return correctiveActionContract.mapGraphFieldsToCase
      ? correctiveActionContract.mapGraphFieldsToCase(f)
      : f;
  }).filter((r) => cleanText(r.id));
  saveJson('corrective_actions', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      await pool.query(`
        INSERT INTO corrective_actions (
          case_id, document_no, case_seq,
          proposer_unit, proposer_unit_code, proposer_name, proposer_username, proposer_date,
          handler_unit, handler_unit_code, handler_name, handler_username, handler_email, handler_date,
          deficiency_type, source, category_json, clause,
          problem_description, occurrence, corrective_action, corrective_due_date,
          root_cause, risk_description, risk_acceptor, risk_accept_date, risk_assess_date,
          root_elimination, root_elimination_due_date,
          review_result, review_next_date, reviewer, review_date,
          pending_tracking_json, trackings_json, status,
          evidence_json, history_json, closed_date,
          backend_mode, record_source, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43)
        ON CONFLICT (case_id) DO NOTHING
      `, [
        cleanText(r.id), cleanText(r.documentNo), Number(r.caseSeq) || null,
        cleanText(r.proposerUnit), cleanText(r.proposerUnitCode),
        cleanText(r.proposerName), cleanText(r.proposerUsername),
        cleanText(r.proposerDate) || new Date().toISOString(),
        cleanText(r.handlerUnit), cleanText(r.handlerUnitCode),
        cleanText(r.handlerName), cleanText(r.handlerUsername),
        cleanText(r.handlerEmail), cleanText(r.handlerDate) || null,
        cleanText(r.deficiencyType) || '主要缺失',
        cleanText(r.source) || 'manual',
        JSON.stringify(r.category || []), cleanText(r.clause),
        cleanText(r.problemDesc || r.problemDescription) || '',
        cleanText(r.occurrence) || '',
        cleanText(r.correctiveAction),
        cleanText(r.correctiveDueDate) || new Date().toISOString(),
        cleanText(r.rootCause), cleanText(r.riskDesc || r.riskDescription),
        cleanText(r.riskAcceptor),
        cleanText(r.riskAcceptDate) || null,
        cleanText(r.riskAssessDate) || null,
        cleanText(r.rootElimination),
        cleanText(r.rootElimDueDate || r.rootEliminationDueDate) || null,
        cleanText(r.reviewResult),
        cleanText(r.reviewNextDate) || null,
        cleanText(r.reviewer),
        cleanText(r.reviewDate) || null,
        JSON.stringify(r.pendingTracking || null),
        JSON.stringify(r.trackings || []),
        cleanText(r.status) || '開立',
        JSON.stringify(r.evidence || []),
        JSON.stringify(r.history || []),
        cleanText(r.closedDate) || null,
        'migration', 'sharepoint-migration',
        cleanText(r.createdAt) || new Date().toISOString(),
        cleanText(r.updatedAt) || new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`corrective_action skip: ${cleanText(r.id)} — ${err.message}`);
    }
  }
  logOk(`corrective_actions: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: training_forms ───────────────────────────────

async function migrateTrainingForms(pool, siteId) {
  const listName = cleanText(process.env.TRAINING_FORMS_LIST) || 'TrainingForms';
  log(`Migrating ${listName} → training_forms`);
  const list = await findListByName(siteId, listName);
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return trainingContract.mapGraphFieldsToTrainingForm
      ? trainingContract.mapGraphFieldsToTrainingForm(f)
      : f;
  }).filter((r) => cleanText(r.id));
  saveJson('training_forms', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      const summary = r.summary || {};
      await pool.query(`
        INSERT INTO training_forms (
          form_id, document_no, form_seq, unit, unit_code, stats_unit,
          filler_name, filler_username, submitter_phone, submitter_email,
          fill_date, training_year, status,
          records_json, summary_json,
          active_count, completed_count, incomplete_count, completion_rate,
          signed_files_json, return_reason,
          step_one_submitted_at, printed_at, signoff_uploaded_at, submitted_at,
          history_json, backend_mode, record_source, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
        ON CONFLICT (form_id) DO NOTHING
      `, [
        cleanText(r.id), cleanText(r.documentNo), Number(r.formSeq) || null,
        cleanText(r.unit), cleanText(r.unitCode), cleanText(r.statsUnit),
        cleanText(r.fillerName), cleanText(r.fillerUsername),
        cleanText(r.submitterPhone), cleanText(r.submitterEmail),
        cleanText(r.fillDate) || new Date().toISOString(),
        cleanText(r.trainingYear),
        cleanText(r.status) || '暫存',
        JSON.stringify(r.records || []),
        JSON.stringify(summary),
        Number(summary.activeCount) || 0,
        Number(summary.completedCount) || 0,
        Number(summary.incompleteCount) || 0,
        Number(summary.completionRate) || 0,
        JSON.stringify(r.signedFiles || []),
        cleanText(r.returnReason),
        cleanText(r.stepOneSubmittedAt) || null,
        cleanText(r.printedAt) || null,
        cleanText(r.signoffUploadedAt) || null,
        cleanText(r.submittedAt) || null,
        JSON.stringify(r.history || []),
        'migration', 'sharepoint-migration',
        cleanText(r.createdAt) || new Date().toISOString(),
        cleanText(r.updatedAt) || new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`training_form skip: ${cleanText(r.id)} — ${err.message}`);
    }
  }
  logOk(`training_forms: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: training_rosters ─────────────────────────────

async function migrateTrainingRosters(pool, siteId) {
  const listName = cleanText(process.env.TRAINING_ROSTERS_LIST) || 'TrainingRosters';
  log(`Migrating ${listName} → training_rosters`);
  const list = await findListByName(siteId, listName);
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return trainingContract.mapGraphFieldsToTrainingRoster
      ? trainingContract.mapGraphFieldsToTrainingRoster(f)
      : f;
  }).filter((r) => cleanText(r.id) || cleanText(r.name));
  saveJson('training_rosters', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      await pool.query(`
        INSERT INTO training_rosters (
          roster_id, unit, stats_unit, l1_unit, name, unit_name,
          identity, job_title, source, created_by, created_by_username,
          backend_mode, record_source, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (roster_id) DO NOTHING
      `, [
        cleanText(r.id), cleanText(r.unit), cleanText(r.statsUnit),
        cleanText(r.l1Unit), cleanText(r.name), cleanText(r.unitName),
        cleanText(r.identity), cleanText(r.jobTitle),
        cleanText(r.source) || 'import',
        cleanText(r.createdBy), cleanText(r.createdByUsername),
        'migration', 'sharepoint-migration',
        cleanText(r.createdAt) || new Date().toISOString(),
        cleanText(r.updatedAt) || new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`training_roster skip: ${cleanText(r.id)} — ${err.message}`);
    }
  }
  logOk(`training_rosters: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: unit_review_scopes ───────────────────────────

async function migrateReviewScopes(pool, siteId) {
  const listName = cleanText(process.env.REVIEW_SCOPES_LIST) || 'UnitReviewScopes';
  log(`Migrating ${listName} → unit_review_scopes`);
  let list;
  try {
    list = await findListByName(siteId, listName);
  } catch (_) {
    logWarn(`Review scopes list not found, skipping`);
    return 0;
  }
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return reviewScopeContract.mapGraphFieldsToReviewScope
      ? reviewScopeContract.mapGraphFieldsToReviewScope(f)
      : {
          id: f.ReviewScopeKey || f.ScopeId || f.Title || '',
          username: f.UserName || '',
          unit: f.UnitValue || '',
          createdAt: f.CreatedAt || '',
          updatedAt: f.UpdatedAt || '',
          backendMode: f.BackendMode || '',
          recordSource: f.RecordSource || ''
        };
  }).filter((r) => cleanText(r.username));
  saveJson('unit_review_scopes', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      const scopeKey = cleanText(r.id) || `${cleanText(r.username)}::${cleanText(r.unit)}`;
      await pool.query(`
        INSERT INTO unit_review_scopes (
          review_scope_key, username, unit_value,
          backend_mode, record_source, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (review_scope_key) DO NOTHING
      `, [
        scopeKey, cleanText(r.username), cleanText(r.unit),
        'migration', 'sharepoint-migration',
        cleanText(r.createdAt) || new Date().toISOString(),
        cleanText(r.updatedAt) || new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`review_scope skip: ${cleanText(r.id)} — ${err.message}`);
    }
  }
  logOk(`unit_review_scopes: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: ops_audit ────────────────────────────────────

async function migrateAuditTrail(pool, siteId) {
  const listName = cleanText(process.env.UNIT_CONTACT_AUDIT_LIST) || 'OpsAudit';
  log(`Migrating ${listName} → ops_audit`);
  const list = await findListByName(siteId, listName);
  const rawItems = await fetchAllListItems(siteId, list.id);
  log(`  Fetched ${rawItems.length} items from SharePoint`);

  const records = rawItems.map((item) => {
    const f = item.fields || {};
    return {
      title: f.Title || '',
      eventType: f.EventType || '',
      actorEmail: f.ActorEmail || '',
      targetEmail: f.TargetEmail || '',
      unitCode: f.UnitCode || '',
      recordId: f.RecordId || '',
      occurredAt: f.OccurredAt || '',
      payloadJson: f.PayloadJson || ''
    };
  }).filter((r) => cleanText(r.eventType));
  saveJson('ops_audit', records);
  if (DUMP_ONLY) return records.length;

  let inserted = 0;
  for (const r of records) {
    try {
      let payloadJsonb = null;
      if (cleanText(r.payloadJson)) {
        try { payloadJsonb = JSON.parse(r.payloadJson); } catch (_) { payloadJsonb = r.payloadJson; }
      }
      await pool.query(`
        INSERT INTO ops_audit (
          title, event_type, actor_email, target_email,
          unit_code, record_id, occurred_at, payload_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        cleanText(r.title), cleanText(r.eventType),
        cleanText(r.actorEmail), cleanText(r.targetEmail),
        cleanText(r.unitCode), cleanText(r.recordId),
        cleanText(r.occurredAt) || new Date().toISOString(),
        payloadJsonb ? JSON.stringify(payloadJsonb) : null
      ]);
      inserted++;
    } catch (err) {
      logWarn(`audit skip: ${cleanText(r.eventType)}/${cleanText(r.recordId)} — ${err.message}`);
    }
  }
  logOk(`ops_audit: ${inserted}/${records.length} inserted`);
  return records.length;
}

// ── Migration: attachments (metadata + file download) ───────

async function migrateAttachments(pool, siteId) {
  if (SKIP_ATTACHMENTS) {
    log('Skipping attachments (--skip-attachments)');
    return 0;
  }
  const libraryName = cleanText(process.env.ATTACHMENTS_LIBRARY) || 'ISMSAttachments';
  log(`Migrating ${libraryName} → attachments + filesystem`);

  let drive;
  try {
    const list = await findListByName(siteId, libraryName);
    const driveResp = await graphRequest('GET', `/sites/${siteId}/lists/${list.id}/drive?$select=id,name`);
    drive = driveResp;
  } catch (err) {
    logWarn(`Attachment library not found: ${err.message}`);
    return 0;
  }

  // Recursively enumerate all files in the drive
  const files = [];
  async function enumerateFolder(folderPath) {
    let nextUrl = `/sites/${siteId}/drives/${drive.id}/root${folderPath ? ':' + folderPath + ':' : ''}/children?$select=id,name,size,file,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl&$top=200`;
    while (nextUrl) {
      const body = await graphRequest('GET', nextUrl);
      const items = Array.isArray(body && body.value) ? body.value : [];
      for (const item of items) {
        if (item.file) {
          files.push(item);
        } else {
          // It's a folder, recurse
          const childPath = item.parentReference && item.parentReference.path
            ? item.parentReference.path.replace(/^.*root:?/, '') + '/' + item.name
            : '/' + item.name;
          await enumerateFolder(childPath);
        }
      }
      nextUrl = cleanText(body && body['@odata.nextLink']);
    }
  }

  try {
    await enumerateFolder('');
    log(`  Found ${files.length} files in drive`);
  } catch (err) {
    logWarn(`Failed to enumerate drive: ${err.message}`);
    return 0;
  }

  saveJson('attachments_metadata', files.map((f) => ({
    id: f.id, name: f.name, size: f.size,
    path: f.parentReference && f.parentReference.path,
    contentType: f.file && f.file.mimeType,
    downloadUrl: f['@microsoft.graph.downloadUrl']
  })));
  if (DUMP_ONLY) return files.length;

  const attachmentsDir = cleanText(process.env.ATTACHMENTS_DIR) || path.resolve(process.cwd(), 'data', 'attachments');
  let inserted = 0;

  for (const file of files) {
    try {
      // Parse path: typically /drives/.../root:/scope/ownerId/attachmentId/filename
      const rawPath = cleanText(file.parentReference && file.parentReference.path);
      const afterRoot = rawPath.replace(/^.*root:?\/?/, '');
      const parts = afterRoot.split('/').filter(Boolean);
      const scope = parts[0] || 'misc';
      const ownerId = parts[1] || 'unscoped';
      const attachmentId = parts[2] || `att-${file.id}`;
      const fileName = cleanText(file.name);
      const relativePath = [scope, ownerId, attachmentId, fileName].join('/');
      const storagePath = path.join(attachmentsDir, relativePath);

      // Download file
      const downloadUrl = file['@microsoft.graph.downloadUrl'];
      if (downloadUrl) {
        const resp = await fetch(downloadUrl);
        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          fs.mkdirSync(path.dirname(storagePath), { recursive: true });
          fs.writeFileSync(storagePath, buffer);
        } else {
          logWarn(`Download failed for ${fileName}: HTTP ${resp.status}`);
          continue;
        }
      } else {
        logWarn(`No download URL for ${fileName}`);
        continue;
      }

      // Insert metadata
      await pool.query(`
        INSERT INTO attachments (
          attachment_id, scope, owner_id, record_type,
          file_name, content_type, file_size, storage_path,
          backend_mode, record_source, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (attachment_id) DO NOTHING
      `, [
        attachmentId, scope, ownerId, scope,
        fileName,
        cleanText(file.file && file.file.mimeType) || 'application/octet-stream',
        Number(file.size || 0),
        relativePath,
        'migration', 'sharepoint-migration',
        cleanText(file.lastModifiedDateTime) || new Date().toISOString()
      ]);
      inserted++;
    } catch (err) {
      logWarn(`attachment skip: ${cleanText(file.name)} — ${err.message}`);
    }
  }
  logOk(`attachments: ${inserted}/${files.length} migrated`);
  return files.length;
}

// ── Sequence adjustment ─────────────────────────────────────

async function adjustSequences(pool) {
  log('Adjusting sequences...');
  const seqMap = [
    { seq: 'seq_application_id', table: 'unit_contact_applications', idCol: 'application_id', pattern: /^UCA-\d+-(\d+)$/ },
    { seq: 'seq_checklist_id', table: 'checklists', idCol: 'checklist_id', pattern: /^CHK-\d+-[A-Z0-9]+-(\d+)$/ },
    { seq: 'seq_case_id', table: 'corrective_actions', idCol: 'case_id', pattern: /^CAR-\d+-[A-Z0-9]+-(\d+)$/ },
    { seq: 'seq_training_form_id', table: 'training_forms', idCol: 'form_id', pattern: /^TRN-\d+-[A-Z0-9]+-(\d+)$/ },
    { seq: 'seq_roster_id', table: 'training_rosters', idCol: 'roster_id', pattern: /^RST-(\d+)$/ }
  ];

  for (const { seq, table, idCol, pattern } of seqMap) {
    try {
      const rows = await pool.query(`SELECT ${idCol} FROM ${table}`);
      let maxSeq = 0;
      for (const row of rows.rows) {
        const match = cleanText(row[idCol]).match(pattern);
        if (match) {
          maxSeq = Math.max(maxSeq, Number(match[1]) || 0);
        }
      }
      const nextVal = maxSeq + 10;
      await pool.query(`SELECT setval('${seq}', $1)`, [nextVal]);
      logOk(`${seq} → ${nextVal} (max was ${maxSeq})`);
    } catch (err) {
      logWarn(`${seq}: ${err.message}`);
    }
  }
}

// ── Verification ────────────────────────────────────────────

async function verify(pool) {
  log('Verification — row counts:');
  const tables = [
    'system_users', 'unit_contact_applications', 'unit_admins',
    'checklists', 'corrective_actions',
    'training_forms', 'training_rosters',
    'unit_review_scopes', 'ops_audit', 'attachments'
  ];
  for (const table of tables) {
    try {
      const result = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
      console.log(`  📊 ${table}: ${result.rows[0].cnt} rows`);
    } catch (err) {
      logWarn(`${table}: ${err.message}`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  ISMS SharePoint → PostgreSQL Data Migration');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  if (DUMP_ONLY) log('Mode: DUMP-ONLY (no PG writes)');
  if (TABLE_FILTER) log(`Table filter: ${TABLE_FILTER}`);
  if (SKIP_ATTACHMENTS) log('Skipping attachments');
  console.log('');

  const siteId = await resolveSiteId();
  log(`SharePoint site: ${siteId}`);

  const pool = DUMP_ONLY ? null : createPool();
  if (pool) {
    const test = await pool.query('SELECT 1 AS ok');
    log(`PostgreSQL connected: ${test.rows[0].ok === 1 ? 'OK' : 'FAIL'}`);
  }

  const summary = {};
  const migrationOrder = [
    { name: 'system_users', fn: migrateSystemUsers },
    { name: 'unit_contact_applications', fn: migrateApplications },
    { name: 'unit_admins', fn: migrateUnitAdmins },
    { name: 'checklists', fn: migrateChecklists },
    { name: 'corrective_actions', fn: migrateCorrectiveActions },
    { name: 'training_forms', fn: migrateTrainingForms },
    { name: 'training_rosters', fn: migrateTrainingRosters },
    { name: 'unit_review_scopes', fn: migrateReviewScopes },
    { name: 'ops_audit', fn: migrateAuditTrail },
    { name: 'attachments', fn: migrateAttachments }
  ];

  for (const step of migrationOrder) {
    if (TABLE_FILTER && step.name !== TABLE_FILTER) continue;
    console.log('');
    try {
      summary[step.name] = await step.fn(pool, siteId);
    } catch (err) {
      logWarn(`${step.name} FAILED: ${err.message}`);
      summary[step.name] = `ERROR: ${err.message}`;
    }
  }

  if (pool && !DUMP_ONLY) {
    console.log('');
    await adjustSequences(pool);
    console.log('');
    await verify(pool);
  }

  console.log('');
  console.log('─── Migration Summary ─────────────────────────────');
  for (const [table, count] of Object.entries(summary)) {
    console.log(`  ${table}: ${typeof count === 'number' ? count + ' records' : count}`);
  }
  console.log('───────────────────────────────────────────────────');
  console.log('');

  if (pool) await pool.end();
  log('Done.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
