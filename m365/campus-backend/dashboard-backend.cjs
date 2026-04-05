// @ts-check
'use strict';

const {
  buildErrorResponse,
  buildJsonResponse
} = require('../azure-function/checklist-api/src/shared/contract');
const db = require('./db.cjs');

/**
 * @param {object} deps
 * @param {Function} deps.writeJson
 * @param {object} deps.requestAuthz
 * @param {Function} deps.cleanText
 */
function createDashboardRouter(deps) {
  const { writeJson, requestAuthz, cleanText } = deps;

  /**
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @param {string} origin
   * @param {URL} url
   * @returns {Promise<boolean>}
   */
  async function tryHandle(req, res, origin, url) {

    // ── My tasks endpoint (all authenticated users) ──
    if (url.pathname === '/api/my-tasks' && req.method === 'GET') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        const username = cleanText(authz.username);
        const units = Array.isArray(authz.authorizedUnits) ? authz.authorizedUnits.filter(Boolean) : [];
        const auditYear = cleanText(url.searchParams && url.searchParams.get('auditYear')) || String(new Date().getFullYear() - 1911);
        const unitPlaceholders = units.map(function (_, i) { return '$' + (i + 2); });
        const unitClause = unitPlaceholders.length ? 'unit = ANY($2)' : 'FALSE';

        const [myChecklists, myTraining, myCases] = await Promise.all([
          units.length ? db.queryAll('SELECT checklist_id, unit, status, audit_year FROM checklists WHERE ' + unitClause + ' AND audit_year = $1 ORDER BY updated_at DESC LIMIT 10', [auditYear].concat([units])) : Promise.resolve([]),
          units.length ? db.queryAll('SELECT form_id, unit, status, training_year, completion_rate FROM training_forms WHERE ' + unitClause + ' AND training_year = $1 ORDER BY updated_at DESC LIMIT 10', [auditYear].concat([units])) : Promise.resolve([]),
          db.queryAll("SELECT case_id, handler_unit, handler_name, status, corrective_due_date, deficiency_type FROM corrective_actions WHERE (LOWER(handler_username) = $1 OR handler_unit = ANY($2)) AND status NOT IN ('結案') ORDER BY corrective_due_date LIMIT 10", [username.toLowerCase(), units])
        ]);

        const draftChecklists = (myChecklists || []).filter(function (r) { return r.status === '草稿'; });
        const submittedChecklists = (myChecklists || []).filter(function (r) { return r.status === '已送出'; });
        const pendingCases = (myCases || []).filter(function (r) { return r.status === '待矯正'; });
        const allOpenCases = myCases || [];
        const draftTraining = (myTraining || []).filter(function (r) { return r.status === '暫存' || r.status === '退回更正'; });

        const tasks = [];
        if (!myChecklists.length) tasks.push({ type: 'checklist', priority: 'high', title: '尚未建立 ' + auditYear + ' 年度檢核表', action: '前往填報', route: '#checklist-fill' });
        draftChecklists.forEach(function (c) { tasks.push({ type: 'checklist', priority: 'high', title: '檢核表草稿待送出（' + c.unit + '）', action: '繼續填報', route: '#checklist-fill/' + c.checklist_id }); });
        pendingCases.forEach(function (c) { tasks.push({ type: 'corrective', priority: 'urgent', title: '矯正單待回覆：' + c.case_id, subtitle: c.handler_unit + ' · ' + (c.deficiency_type || ''), action: '填寫回覆', route: '#detail/' + c.case_id }); });
        draftTraining.forEach(function (t) { tasks.push({ type: 'training', priority: 'medium', title: '教育訓練' + (t.status === '退回更正' ? '退回待修正' : '草稿中') + '（' + t.unit + '）', subtitle: '完成率 ' + (Number(t.completion_rate) || 0) + '%', action: '繼續填報', route: '#training-fill/' + t.form_id }); });
        if (!myTraining.length && units.length) tasks.push({ type: 'training', priority: 'medium', title: '尚未建立 ' + auditYear + ' 年度教育訓練', action: '前往填報', route: '#training-fill' });

        await writeJson(res, buildJsonResponse(200, {
          ok: true, tasks: tasks,
          summary: {
            checklistStatus: submittedChecklists.length ? '已送出' : (draftChecklists.length ? '草稿中' : '未建立'),
            openCases: allOpenCases.length,
            pendingCases: pendingCases.length,
            trainingStatus: (myTraining || []).some(function (t) { return t.status === '已完成填報'; }) ? '已完成' : (draftTraining.length ? '填報中' : '未建立')
          },
          units: units, auditYear: auditYear
        }), origin);
      } catch (error) { await writeJson(res, buildErrorResponse(error, 'Failed to load my tasks.', 500), origin); }
      return true;
    }

    // ── Dashboard summary endpoint (admin only) ──
    if (url.pathname === '/api/dashboard/summary' && req.method === 'GET') {
      try {
        const authz = await requestAuthz.requireAuthenticatedUser(req);
        requestAuthz.requireAdmin(authz, 'Only admin can access dashboard summary');
        const auditYear = cleanText(url.searchParams && url.searchParams.get('auditYear')) || String(new Date().getFullYear() - 1911);
        const trainingYear = cleanText(url.searchParams && url.searchParams.get('trainingYear')) || auditYear;

        const apiCache = require('./api-cache.cjs');
        const cacheKey = 'dashboard:' + auditYear + ':' + trainingYear;
        const cachedResult = apiCache.get(cacheKey);
        if (cachedResult) { await writeJson(res, buildJsonResponse(200, cachedResult), origin); return true; }

        const [checklistStats, trainingStats, trainingByUnit, checklistByUnit, pendingApps, pendingCases] = await Promise.all([
          db.queryOne(`SELECT
            COUNT(DISTINCT unit) FILTER (WHERE status = '已送出')::int AS submitted_units,
            COUNT(DISTINCT unit)::int AS total_filing_units,
            COUNT(*)::int AS total_checklists,
            COUNT(*) FILTER (WHERE status = '草稿')::int AS draft_count,
            COUNT(*) FILTER (WHERE status = '已送出')::int AS submitted_count
            FROM checklists WHERE audit_year = $1`, [auditYear]),
          db.queryOne(`SELECT
            COUNT(*)::int AS total_forms,
            COUNT(*) FILTER (WHERE status = '已完成填報')::int AS completed_forms,
            COUNT(*) FILTER (WHERE status = '暫存')::int AS draft_forms,
            COUNT(*) FILTER (WHERE status = '待簽核')::int AS pending_forms,
            COUNT(*) FILTER (WHERE status = '退回更正')::int AS returned_forms,
            COALESCE(AVG(completion_rate), 0)::numeric(5,2) AS avg_completion_rate
            FROM training_forms WHERE training_year = $1`, [trainingYear]),
          db.queryAll(`SELECT stats_unit, status, COUNT(*)::int AS form_count,
            COALESCE(AVG(completion_rate), 0)::numeric(5,2) AS avg_rate
            FROM training_forms WHERE training_year = $1
            GROUP BY stats_unit, status ORDER BY stats_unit`, [trainingYear]),
          db.queryAll(`SELECT unit, status, COUNT(*)::int AS count FROM checklists WHERE audit_year = $1 GROUP BY unit, status ORDER BY unit`, [auditYear]),
          db.queryOne(`SELECT
            COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review,
            COUNT(*) FILTER (WHERE status = 'activation_pending')::int AS activation_pending
            FROM unit_contact_applications`),
          db.queryOne(`SELECT
            COUNT(*) FILTER (WHERE status = '待矯正')::int AS pending_correction,
            COUNT(*) FILTER (WHERE status = '已提案')::int AS proposed,
            COUNT(*) FILTER (WHERE status = '追蹤中')::int AS tracking,
            COUNT(*) FILTER (WHERE status NOT IN ('結案'))::int AS open_total
            FROM corrective_actions`)
        ]);

        const cs = checklistStats || {};
        const ts = trainingStats || {};
        const pa = pendingApps || {};
        const pc = pendingCases || {};
        // Total visible level-1 units: 152 in unitStructure - 14 hidden (醫院/副校長/etc.) = 138
        const totalUnits = Math.max(Number(cs.total_filing_units) || 0, 138);

        // Filter checklist rows: exclude hidden units and level-2 (containing '／')
        // so that submitted/draft/notFiled counts match the level-1 total (138).
        const { HIDDEN_UNITS } = require('../../shared/unit-categories.js');
        const hiddenSet = new Set(HIDDEN_UNITS || []);
        const hiddenRegex = /醫院|分院|副校長|紀念品/;
        const isLevel1Visible = function (unitName) {
          const name = String(unitName || '').trim();
          if (!name) return false;
          if (name.indexOf('／') >= 0 || name.indexOf('/') >= 0) return false; // level-2
          if (hiddenSet.has(name)) return false;
          if (hiddenRegex.test(name)) return false;
          return true;
        };
        const rawByUnit = Array.isArray(checklistByUnit) ? checklistByUnit : [];
        const level1ByUnit = rawByUnit.filter(function (r) { return isLevel1Visible(r && r.unit); });
        // Count distinct level-1 units by status
        const submittedLv1 = new Set();
        const draftLv1 = new Set();
        level1ByUnit.forEach(function (r) {
          const status = String(r.status || '').trim();
          if (status === '已送出') submittedLv1.add(r.unit);
          else if (status === '草稿') draftLv1.add(r.unit);
        });
        const submittedUnits = submittedLv1.size;
        const draftCount = draftLv1.size;
        const notFiledUnits = Math.max(0, totalUnits - submittedUnits - draftCount);

        const pendingTotal = (Number(pa.pending_review) || 0) + (Number(pa.activation_pending) || 0)
          + (Number(pc.pending_correction) || 0) + (Number(pc.proposed) || 0) + (Number(pc.tracking) || 0);

        const dashboardResult = {
          checklist: {
            totalUnits,
            submittedUnits,
            notFiledUnits,
            draftCount,
            submittedCount: Number(cs.submitted_count) || 0,
            auditYear,
            byUnit: level1ByUnit.map(function (r) { return { unit: r.unit, status: r.status, count: Number(r.count) || 0 }; })
          },
          training: {
            totalForms: Number(ts.total_forms) || 0,
            completedForms: Number(ts.completed_forms) || 0,
            draftForms: Number(ts.draft_forms) || 0,
            pendingForms: Number(ts.pending_forms) || 0,
            returnedForms: Number(ts.returned_forms) || 0,
            avgCompletionRate: Number(ts.avg_completion_rate) || 0,
            trainingYear,
            byStatsUnit: (trainingByUnit || []).map(function (r) {
              return { statsUnit: r.stats_unit, status: r.status, formCount: Number(r.form_count) || 0, avgRate: Number(r.avg_rate) || 0 };
            })
          },
          pending: {
            applicationsPendingReview: Number(pa.pending_review) || 0,
            activationPending: Number(pa.activation_pending) || 0,
            correctivePending: Number(pc.pending_correction) || 0,
            correctiveProposed: Number(pc.proposed) || 0,
            correctiveTracking: Number(pc.tracking) || 0,
            correctiveOpenTotal: Number(pc.open_total) || 0,
            totalPendingItems: pendingTotal
          },
          generatedAt: new Date().toISOString()
        };
        apiCache.set(cacheKey, dashboardResult, 60000); // 60 秒快取
        await writeJson(res, buildJsonResponse(200, dashboardResult), origin);
      } catch (error) {
        await writeJson(res, buildErrorResponse(error, 'Failed to load dashboard summary.', 500), origin);
      }
      return true;
    }

    return false;
  }

  return { tryHandle };
}

module.exports = { createDashboardRouter };
