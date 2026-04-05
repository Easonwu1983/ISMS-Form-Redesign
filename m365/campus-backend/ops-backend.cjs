// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');

const {
  buildErrorResponse,
  buildJsonResponse
} = require('../azure-function/checklist-api/src/shared/contract');
const {
  sendGraphMail,
  buildHtmlDocument
} = require('./graph-mailer.cjs');
const db = require('./db.cjs');

/**
 * @param {object} deps
 * @param {Function} deps.parseJsonBody
 * @param {Function} deps.writeJson
 * @param {Function} deps.writeBinary
 * @param {object} deps.requestAuthz
 * @param {Function} deps.cleanText
 * @param {Function} deps.graphRequest
 * @param {Function} deps.getDelegatedToken
 * @param {object} deps.correctiveActionRouter  — the corrective-action router (for checkOverdueAndNotify)
 * @param {number}  deps.globalRateLimitMaxRequests
 * @param {number}  deps.globalRateLimitWindowMs
 */
function createOpsRouter(deps) {
  const {
    parseJsonBody, writeJson, writeBinary, requestAuthz, cleanText,
    graphRequest, getDelegatedToken,
    correctiveActionRouter,
    globalRateLimitMaxRequests, globalRateLimitWindowMs
  } = deps;

  /**
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @param {string} origin
   * @param {URL} url
   * @returns {Promise<boolean>}
   */
  async function tryHandle(req, res, origin, url) {

    // ── Batch reminder endpoint (admin only) ──
    if (url.pathname === '/api/batch-reminder' && req.method === 'POST') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        requestAuthz.requireAdmin(authz, 'Only admin can send batch reminders');
        const envelope = await parseJsonBody(req);
        const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
        const auditYear = cleanText(payload.auditYear) || String(new Date().getFullYear() - 1911);
        // Find all units that haven't submitted checklists
        const submitted = await db.queryAll(`SELECT DISTINCT unit FROM checklists WHERE audit_year = $1 AND status = '已送出'`, [auditYear]);
        const submittedUnits = new Set((submitted || []).map(function (r) { return cleanText(r.unit); }));
        // Get all unit admin emails for non-submitted units
        const allAdmins = await db.queryAll(`SELECT username, display_name, email, primary_unit FROM system_users WHERE role = '單位管理員'`);
        const targets = (allAdmins || []).filter(function (u) { return u.email && u.primary_unit && !submittedUnits.has(cleanText(u.primary_unit)); });
        let sent = 0;
        const portalUrl = cleanText(process.env.ISMS_PORTAL_URL) || 'https://isms-campus-portal.pages.dev/';
        for (const target of targets.slice(0, 50)) { // Cap at 50 to prevent spam
          try {
            await sendGraphMail({
              graphRequest, getDelegatedToken, to: cleanText(target.email),
              subject: 'ISMS 檢核表催辦通知：' + auditYear + ' 年度內稽檢核表尚未送出',
              html: buildHtmlDocument([
                '您好，' + cleanText(target.display_name) + '：',
                '您負責的「' + cleanText(target.primary_unit) + '」尚未完成 ' + auditYear + ' 年度內稽檢核表。',
                '請儘速登入系統完成填報並送出。',
                '系統入口：' + portalUrl,
                '如有問題請聯繫資安管理中心。'
              ])
            });
            sent++;
          } catch (_) {}
        }
        await writeJson(res, buildJsonResponse(200, { ok: true, totalTargets: targets.length, sent, submittedUnits: submittedUnits.size, auditYear }), origin);
      } catch (error) { await writeJson(res, buildErrorResponse(error, 'Batch reminder failed.', 500), origin); }
      return true;
    }

    // ── Server stats endpoint (admin only) ──
    if (url.pathname === '/api/server-stats' && req.method === 'GET') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        requestAuthz.requireAdmin(authz, 'Only admin can view server stats');
        const uptime = process.uptime();
        const mem = process.memoryUsage();
        // DB health
        let dbHealth = { ok: false, latencyMs: 0, activeConnections: 0 };
        try {
          const dbStart = Date.now();
          await db.queryOne('SELECT 1');
          dbHealth = { ok: true, latencyMs: Date.now() - dbStart, activeConnections: db.pool ? db.pool.totalCount : 0, idleConnections: db.pool ? db.pool.idleCount : 0 };
        } catch (dbErr) { dbHealth = { ok: false, latencyMs: 0, error: String(dbErr && dbErr.message || dbErr) }; }
        // Disk usage (attachments dir)
        let diskUsage = { path: '', totalFiles: 0, totalSizeMB: 0 };
        try {
          const attachDir = cleanText(process.env.ATTACHMENTS_DIR) || path.join(__dirname, '..', '..', 'attachments');
          if (fs.existsSync(attachDir)) {
            let totalSize = 0; let fileCount = 0;
            const walk = function (dir) { try { fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) { if (e.isDirectory()) walk(path.join(dir, e.name)); else { fileCount++; try { totalSize += fs.statSync(path.join(dir, e.name)).size; } catch (_) {} } }); } catch (_) {} };
            walk(attachDir);
            diskUsage = { path: attachDir, totalFiles: fileCount, totalSizeMB: Math.round(totalSize / 1024 / 1024 * 10) / 10 };
          }
        } catch (_) {}
        // Error alerter stats
        let errorStats = { buffered: 0, recent: [] };
        try { const alerter = require('./error-alerter.cjs'); errorStats = { buffered: alerter.getErrorCount(), recent: alerter.getRecentErrors(5) }; } catch (_) {}
        // Request stats from HTTP log
        const requestStats = { totalSinceStart: Number(global.__ISMS_REQUEST_COUNT__ || 0), errorsSinceStart: Number(global.__ISMS_ERROR_COUNT__ || 0) };
        await writeJson(res, buildJsonResponse(200, {
          ok: true,
          uptime: Math.round(uptime),
          uptimeHuman: Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm',
          memory: { rss: Math.round(mem.rss / 1024 / 1024) + 'MB', heap: Math.round(mem.heapUsed / 1024 / 1024) + 'MB', heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB' },
          database: dbHealth,
          disk: diskUsage,
          errors: errorStats,
          requests: requestStats,
          nodeVersion: process.version,
          platform: process.platform,
          rateLimit: { maxRequests: globalRateLimitMaxRequests, windowMs: globalRateLimitWindowMs }
        }), origin);
      } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to read server stats.', 500), origin); }
      return true;
    }

    // ── Audit report PDF download (admin only) ──
    if (url.pathname === '/api/audit-report/pdf' && req.method === 'GET') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        requestAuthz.requireAdmin(authz, 'Only admin can download audit report');
        const auditYear = cleanText(url.searchParams && url.searchParams.get('auditYear')) || String(new Date().getFullYear() - 1911);
        // Reuse dashboard summary queries
        const [checklistStats, trainingStats, pendingApps, pendingCases] = await Promise.all([
          db.queryOne(`SELECT COUNT(DISTINCT unit) FILTER (WHERE status = '已送出')::int AS submitted_units, COUNT(DISTINCT unit)::int AS total_filing_units, COUNT(*) FILTER (WHERE status = '草稿')::int AS draft_count FROM checklists WHERE audit_year = $1`, [auditYear]),
          db.queryOne(`SELECT COUNT(*)::int AS total_forms, COUNT(*) FILTER (WHERE status = '已完成填報')::int AS completed_forms, COUNT(*) FILTER (WHERE status = '暫存')::int AS draft_forms, COUNT(*) FILTER (WHERE status = '待簽核')::int AS pending_forms, COUNT(*) FILTER (WHERE status = '退回更正')::int AS returned_forms, COALESCE(AVG(completion_rate),0)::numeric(5,2) AS avg_completion_rate FROM training_forms WHERE training_year = $1`, [auditYear]),
          db.queryOne(`SELECT COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review, COUNT(*) FILTER (WHERE status = 'activation_pending')::int AS activation_pending FROM unit_contact_applications`),
          db.queryOne(`SELECT COUNT(*) FILTER (WHERE status = '待矯正')::int AS pending_correction, COUNT(*) FILTER (WHERE status = '已提案')::int AS proposed, COUNT(*) FILTER (WHERE status = '追蹤中')::int AS tracking, COUNT(*) FILTER (WHERE status NOT IN ('結案'))::int AS open_total FROM corrective_actions`)
        ]);
        const cs = checklistStats || {}; const ts = trainingStats || {}; const pa = pendingApps || {}; const pc = pendingCases || {};
        // Total visible level-1 units: 152 in unitStructure - 14 hidden = 138
        const totalUnits = Math.max(Number(cs.total_filing_units) || 0, 138);
        const data = {
          checklist: { totalUnits, submittedUnits: Number(cs.submitted_units) || 0, notFiledUnits: totalUnits - (Number(cs.submitted_units) || 0), draftCount: Number(cs.draft_count) || 0, auditYear },
          training: { completedForms: Number(ts.completed_forms) || 0, draftForms: Number(ts.draft_forms) || 0, pendingForms: Number(ts.pending_forms) || 0, returnedForms: Number(ts.returned_forms) || 0, avgCompletionRate: Number(ts.avg_completion_rate) || 0 },
          pending: { applicationsPendingReview: Number(pa.pending_review) || 0, activationPending: Number(pa.activation_pending) || 0, correctivePending: Number(pc.pending_correction) || 0, correctiveProposed: Number(pc.proposed) || 0, correctiveTracking: Number(pc.tracking) || 0, correctiveOpenTotal: Number(pc.open_total) || 0, totalPendingItems: (Number(pa.pending_review) || 0) + (Number(pa.activation_pending) || 0) + (Number(pc.pending_correction) || 0) + (Number(pc.proposed) || 0) + (Number(pc.tracking) || 0) }
        };
        const { generateAuditReportPdf } = require(require('path').join(__dirname, '..', '..', 'scripts', 'generate-audit-report-pdf.cjs'));
        const pdfBuffer = await generateAuditReportPdf(data);
        await writeBinary(res, { status: 200, path: '/api/audit-report/pdf', body: pdfBuffer, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="ISMS-audit-report-' + auditYear + '.pdf"' } }, origin);
      } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to generate audit report PDF.', 500), origin); }
      return true;
    }

    // ── Audit report DOCX download (admin only) ──
    if (url.pathname === '/api/audit-report/docx' && req.method === 'GET') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        requestAuthz.requireAdmin(authz, 'Only admin can download audit report');
        const auditYear = cleanText(url.searchParams && url.searchParams.get('year'))
          || cleanText(url.searchParams && url.searchParams.get('auditYear'))
          || String(new Date().getFullYear() - 1911);
        // Reuse the same dashboard summary queries as PDF
        const [checklistStats, trainingStats, pendingApps, pendingCases, correctiveDetails, overdueCounts] = await Promise.all([
          db.queryOne(`SELECT COUNT(DISTINCT unit) FILTER (WHERE status = '已送出')::int AS submitted_units, COUNT(DISTINCT unit)::int AS total_filing_units, COUNT(*) FILTER (WHERE status = '草稿')::int AS draft_count FROM checklists WHERE audit_year = $1`, [auditYear]),
          db.queryOne(`SELECT COUNT(*)::int AS total_forms, COUNT(*) FILTER (WHERE status = '已完成填報')::int AS completed_forms, COUNT(*) FILTER (WHERE status = '暫存')::int AS draft_forms, COUNT(*) FILTER (WHERE status = '待簽核')::int AS pending_forms, COUNT(*) FILTER (WHERE status = '退回更正')::int AS returned_forms, COALESCE(AVG(completion_rate),0)::numeric(5,2) AS avg_completion_rate FROM training_forms WHERE training_year = $1`, [auditYear]),
          db.queryOne(`SELECT COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review, COUNT(*) FILTER (WHERE status = 'activation_pending')::int AS activation_pending FROM unit_contact_applications`),
          db.queryOne(`SELECT COUNT(*) FILTER (WHERE status = '待矯正')::int AS pending_correction, COUNT(*) FILTER (WHERE status = '已提案')::int AS proposed, COUNT(*) FILTER (WHERE status = '追蹤中')::int AS tracking, COUNT(*) FILTER (WHERE status NOT IN ('結案'))::int AS open_total FROM corrective_actions`),
          db.queryAll(`SELECT case_id, handler_unit, handler_name, status, corrective_due_date FROM corrective_actions WHERE status NOT IN ('結案') ORDER BY corrective_due_date LIMIT 20`),
          db.queryOne(`SELECT COUNT(*) FILTER (WHERE status = '結案')::int AS closed, COUNT(*) FILTER (WHERE status NOT IN ('結案') AND corrective_due_date < NOW() AND corrective_due_date IS NOT NULL)::int AS overdue FROM corrective_actions`)
        ]);
        const cs = checklistStats || {}; const ts = trainingStats || {}; const pa = pendingApps || {}; const pc = pendingCases || {}; const oc = overdueCounts || {};
        // Total visible level-1 units: 152 in unitStructure - 14 hidden = 138
        const totalUnits = Math.max(Number(cs.total_filing_units) || 0, 138);
        const docxData = {
          checklist: { totalUnits, submittedUnits: Number(cs.submitted_units) || 0, notFiledUnits: totalUnits - (Number(cs.submitted_units) || 0), draftCount: Number(cs.draft_count) || 0, auditYear },
          training: { completedForms: Number(ts.completed_forms) || 0, draftForms: Number(ts.draft_forms) || 0, pendingForms: Number(ts.pending_forms) || 0, returnedForms: Number(ts.returned_forms) || 0, avgCompletionRate: Number(ts.avg_completion_rate) || 0 },
          pending: { applicationsPendingReview: Number(pa.pending_review) || 0, activationPending: Number(pa.activation_pending) || 0, correctivePending: Number(pc.pending_correction) || 0, correctiveProposed: Number(pc.proposed) || 0, correctiveTracking: Number(pc.tracking) || 0, correctiveOpenTotal: Number(pc.open_total) || 0, correctiveOverdue: Number(oc.overdue) || 0, correctiveClosed: Number(oc.closed) || 0, totalPendingItems: (Number(pa.pending_review) || 0) + (Number(pa.activation_pending) || 0) + (Number(pc.pending_correction) || 0) + (Number(pc.proposed) || 0) + (Number(pc.tracking) || 0) },
          correctiveDetails: correctiveDetails || []
        };
        const { generateAuditReportDocx } = require(require('path').join(__dirname, '..', '..', 'scripts', 'generate-audit-report-docx.cjs'));
        const docxBuffer = await generateAuditReportDocx(docxData);
        await writeBinary(res, { status: 200, path: '/api/audit-report/docx', body: docxBuffer, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="ISMS-audit-report-' + auditYear + '.docx"' } }, origin);
      } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to generate audit report DOCX.', 500), origin); }
      return true;
    }

    // ── Overdue check endpoint (admin only) ──
    if (url.pathname === '/api/overdue-check' && req.method === 'POST') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        requestAuthz.requireAdmin(authz, 'Only admin can trigger overdue check');
        const result = await correctiveActionRouter.checkOverdueAndNotify();
        // Also write overdue summary to ops_audit for audit trail
        if (result && result.checked > 0) {
          try {
            const overdueRows = await db.queryAll(
              "SELECT case_id, handler_email, handler_unit, corrective_due_date FROM corrective_actions WHERE status NOT IN ('結案') AND corrective_due_date < NOW() AND corrective_due_date IS NOT NULL ORDER BY corrective_due_date LIMIT 10"
            );
            await db.query(
              'INSERT INTO ops_audit (title, event_type, actor_email, record_id, occurred_at, payload_json) VALUES ($1,$2,$3,$4,$5,$6)',
              ['overdue-reminder', 'system.overdue_reminder', authz.user || 'admin', 'overdue-' + Date.now(), new Date().toISOString(),
               JSON.stringify({ trigger: 'manual', count: result.checked, notified: result.notified, cases: (overdueRows || []).map(function (r) { return { id: r.case_id, unit: r.handler_unit, email: r.handler_email, due: r.corrective_due_date }; }) })]
            );
          } catch (_auditErr) { /* audit write is best-effort */ }
        }
        await writeJson(res, buildJsonResponse(200, { ok: true, ...result }), origin);
      } catch (error) { await writeJson(res, buildErrorResponse(error, 'Overdue check failed.', 500), origin); }
      return true;
    }

    // ── Year-end settlement endpoint (admin only) ──
    if (url.pathname === '/api/audit-year/summary' && req.method === 'GET') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        requestAuthz.requireAdmin(authz, 'Only admin can view year summary');
        const years = await db.queryAll(`
          SELECT DISTINCT audit_year, COUNT(*)::int AS checklist_count,
            COUNT(*) FILTER (WHERE status = '已送出')::int AS submitted
          FROM checklists GROUP BY audit_year ORDER BY audit_year DESC LIMIT 10
        `);
        const trainingYears = await db.queryAll(`
          SELECT DISTINCT training_year, COUNT(*)::int AS form_count,
            COUNT(*) FILTER (WHERE status = '已完成填報')::int AS completed
          FROM training_forms GROUP BY training_year ORDER BY training_year DESC LIMIT 10
        `);
        await writeJson(res, buildJsonResponse(200, {
          ok: true,
          checklistYears: (years || []).map(function (r) { return { year: r.audit_year, total: r.checklist_count, submitted: r.submitted }; }),
          trainingYears: (trainingYears || []).map(function (r) { return { year: r.training_year, total: r.form_count, completed: r.completed }; })
        }), origin);
      } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to load year summary.', 500), origin); }
      return true;
    }

    // ── Historical data import endpoint (admin only) ──
    if (url.pathname === '/api/data-import' && req.method === 'POST') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        requestAuthz.requireAdmin(authz, 'Only admin can import historical data');
        const envelope = await parseJsonBody(req);
        const payload = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
        const auditYear = cleanText(payload.auditYear);
        const dataType = cleanText(payload.dataType);
        const headers = Array.isArray(payload.headers) ? payload.headers.map(function (h) { return cleanText(h); }) : [];
        const rows = Array.isArray(payload.rows) ? payload.rows : [];

        if (!auditYear || !/^\d{2,4}$/.test(auditYear)) {
          await writeJson(res, buildErrorResponse(new Error('Invalid auditYear'), 'auditYear is required.', 400), origin);
          return true;
        }
        const allowedTypes = ['checklists', 'training', 'corrective_actions'];
        if (!allowedTypes.includes(dataType)) {
          await writeJson(res, buildErrorResponse(new Error('Invalid dataType'), 'dataType must be one of: ' + allowedTypes.join(', '), 400), origin);
          return true;
        }
        if (!headers.length || !rows.length) {
          await writeJson(res, buildErrorResponse(new Error('Empty data'), 'No headers or rows provided.', 400), origin);
          return true;
        }

        let insertedCount = 0;
        let skippedCount = 0;

        if (dataType === 'checklists') {
          for (const row of rows) {
            try {
              const obj = {};
              headers.forEach(function (h, i) { obj[h] = row[i] || ''; });
              const unit = cleanText(obj.unit || obj['\u55ae\u4f4d'] || obj.unit_name || '');
              if (!unit) { skippedCount++; continue; }
              await db.queryOne(
                `INSERT INTO checklists (unit, audit_year, status, filled_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, NOW(), NOW())
                 ON CONFLICT DO NOTHING`,
                [unit, auditYear, cleanText(obj.status || obj['\u72c0\u614b'] || '\u5df2\u9001\u51fa'), cleanText(obj.filled_by || obj['\u586b\u5831\u4eba'] || '')]
              );
              insertedCount++;
            } catch (_) { skippedCount++; }
          }
        } else if (dataType === 'training') {
          for (const row of rows) {
            try {
              const obj = {};
              headers.forEach(function (h, i) { obj[h] = row[i] || ''; });
              const unit = cleanText(obj.unit || obj['\u55ae\u4f4d'] || obj.unit_name || '');
              if (!unit) { skippedCount++; continue; }
              await db.queryOne(
                `INSERT INTO training_forms (unit, training_year, status, filled_by, completion_rate, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                 ON CONFLICT DO NOTHING`,
                [unit, auditYear, cleanText(obj.status || obj['\u72c0\u614b'] || '\u5df2\u5b8c\u6210\u586b\u5831'), cleanText(obj.filled_by || obj['\u586b\u5831\u4eba'] || ''), Number(obj.completion_rate || obj['\u5b8c\u6210\u7387'] || 100)]
              );
              insertedCount++;
            } catch (_) { skippedCount++; }
          }
        } else if (dataType === 'corrective_actions') {
          for (const row of rows) {
            try {
              const obj = {};
              headers.forEach(function (h, i) { obj[h] = row[i] || ''; });
              const problemDesc = cleanText(obj.problem_desc || obj['\u554f\u984c\u63cf\u8ff0'] || obj.problemDesc || '');
              if (!problemDesc) { skippedCount++; continue; }
              await db.queryOne(
                `INSERT INTO corrective_actions (problem_desc, deficiency_type, source, status, audit_year, proposer_name, handler_name, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                [
                  problemDesc,
                  cleanText(obj.deficiency_type || obj['\u7f3a\u5931\u985e\u578b'] || ''),
                  cleanText(obj.source || obj['\u4f86\u6e90'] || ''),
                  cleanText(obj.status || obj['\u72c0\u614b'] || '\u7d50\u6848'),
                  auditYear,
                  cleanText(obj.proposer_name || obj['\u63d0\u6848\u4eba'] || ''),
                  cleanText(obj.handler_name || obj['\u8655\u7406\u4eba'] || '')
                ]
              );
              insertedCount++;
            } catch (_) { skippedCount++; }
          }
        }

        await writeJson(res, buildJsonResponse(200, { ok: true, insertedCount, skippedCount, auditYear, dataType }), origin);
      } catch (error) { await writeJson(res, buildErrorResponse(error, 'Data import failed.', 500), origin); }
      return true;
    }

    return false;
  }

  return { tryHandle };
}

module.exports = { createOpsRouter };
