// @ts-check
'use strict';

const db = require('./db.cjs');

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function cleanText(v) { return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)); }

function mapRowToAsset(row) {
  if (!row) return null;
  return {
    id: row.asset_id || '',
    assetName: row.asset_name || '',
    category: row.category || '',
    subCategory: row.sub_category || '',
    ownerName: row.owner_name || '',
    custodianName: row.custodian_name || '',
    userName: row.user_name || '',
    groupName: row.group_name || '',
    locationBuilding: row.location_building || '',
    locationRoom: row.location_room || '',
    ipAddress: row.ip_address || '',
    domainUrl: row.domain_url || '',
    brand: row.brand || '',
    modelVersion: row.model_version || '',
    quantity: row.quantity || 1,
    passwordChanged: row.password_changed || '不適用',
    remoteMaintenance: row.remote_maintenance || '不適用',
    confidentiality: row.confidentiality || '普',
    integrity: row.integrity || '普',
    availability: row.availability || '普',
    legalCompliance: row.legal_compliance || '普',
    protectionLevel: row.protection_level || '普',
    hasPii: !!row.has_pii,
    hasSensitivePii: !!row.has_sensitive_pii,
    piiCount: row.pii_count || '',
    inventoryYear: row.inventory_year,
    changeType: row.change_type || '新增',
    previousAssetId: row.previous_asset_id || '',
    isItSystem: !!row.is_it_system,
    isChinaBrand: !!row.is_china_brand,
    itSystemData: parseJsonField(row.it_system_data_json) || {},
    chinaBrandData: parseJsonField(row.china_brand_data_json) || {},
    riskData: parseJsonField(row.risk_data_json) || {},
    status: row.status || '填報中',
    unitCode: row.unit_code || '',
    unitName: row.unit_name || '',
    createdBy: row.created_by || '',
    notes: row.notes || '',
    rowVersion: row.row_version || 1,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

const CIA_MAP = { '普': 1, '中': 2, '高': 3 };
const CIA_REVERSE = { 1: '普', 2: '中', 3: '高' };

function computeProtectionLevel(c, i, a, l) {
  const max = Math.max(CIA_MAP[c] || 1, CIA_MAP[i] || 1, CIA_MAP[a] || 1, CIA_MAP[l] || 1);
  return CIA_REVERSE[max] || '普';
}

function createAssetInventoryRouter(deps) {
  const { parseJsonBody, writeJson, requestAuthz } = deps;

  function routeAssetId(v) { return decodeURIComponent(cleanText(v)); }

  // ── Generate asset ID ──
  async function nextAssetId(unitCode, category) {
    const seq = await db.queryOne("SELECT nextval('seq_asset_id') AS n");
    const prefix = cleanText(unitCode).replace(/\./g, '').substring(0, 4).toUpperCase() || 'XXXX';
    const cat = cleanText(category).substring(0, 2).toUpperCase() || 'XX';
    return `${prefix}-${cat}-${String(seq.n).padStart(5, '0')}`;
  }

  // ── Health Check ──
  async function handleHealth(req, res, origin) {
    try {
      await db.healthCheck();
      writeJson(res, { status: 200, jsonBody: { status: 'ok', module: 'asset-inventory' } }, origin);
    } catch (e) {
      writeJson(res, { status: 503, jsonBody: { status: 'error', message: e.message } }, origin);
    }
  }

  // ── List Assets ──
  async function handleList(req, res, origin, url) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const params = url.searchParams || new URLSearchParams();
      const year = params.get('year') ? parseInt(params.get('year'), 10) : new Date().getFullYear() - 1911;
      const unitFilter = params.get('unit') || '';
      const statusFilter = params.get('status') || '';
      const categoryFilter = params.get('category') || '';

      let sql = 'SELECT * FROM information_assets WHERE inventory_year = $1';
      const values = [year];
      let idx = 2;

      if (!requestAuthz.isAdmin(authz)) {
        const units = requestAuthz.getAccessUnits ? requestAuthz.getAccessUnits(authz) : [];
        const primaryUnit = authz.primaryUnit || '';
        const allUnits = [primaryUnit, ...units].filter(Boolean);
        if (allUnits.length > 0) {
          sql += ` AND unit_code = ANY($${idx})`;
          values.push(allUnits);
          idx++;
        }
      } else if (unitFilter) {
        sql += ` AND unit_code = $${idx}`;
        values.push(unitFilter);
        idx++;
      }

      if (statusFilter) {
        sql += ` AND status = $${idx}`;
        values.push(statusFilter);
        idx++;
      }
      if (categoryFilter) {
        sql += ` AND category = $${idx}`;
        values.push(categoryFilter);
        idx++;
      }

      sql += ' ORDER BY created_at DESC';
      const rows = await db.queryAll(sql, values);
      writeJson(res, { status: 200, jsonBody: { items: rows.map(mapRowToAsset), total: rows.length } }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Get Single Asset ──
  async function handleDetail(req, res, origin, assetId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const row = await db.queryOne('SELECT * FROM information_assets WHERE asset_id = $1', [assetId]);
      if (!row) { writeJson(res, { status: 404, jsonBody: { error: 'not_found' } }, origin); return; }

      const a10 = await db.queryOne('SELECT * FROM appendix10_assessments WHERE asset_id = $1', [assetId]);

      const asset = mapRowToAsset(row);
      asset.appendix10 = a10 ? {
        protectionLevel: a10.protection_level,
        assessments: parseJsonField(a10.assessments_json) || [],
        complianceStatus: a10.compliance_status || '',
        nonComplianceCodes: a10.non_compliance_codes || '',
        assessedBy: a10.assessed_by || '',
        assessedAt: a10.assessed_at ? new Date(a10.assessed_at).toISOString() : ''
      } : null;

      writeJson(res, { status: 200, jsonBody: asset }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Create Asset ──
  async function handleCreate(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const body = await parseJsonBody(req);
      const p = body.payload || body;

      if (!p.assetName || !p.category) {
        writeJson(res, { status: 400, jsonBody: { error: 'assetName and category are required' } }, origin);
        return;
      }

      const assetId = await nextAssetId(p.unitCode || authz.primaryUnit, p.category);
      const protLevel = computeProtectionLevel(p.confidentiality, p.integrity, p.availability, p.legalCompliance);
      const year = p.inventoryYear || (new Date().getFullYear() - 1911);

      const sql = `INSERT INTO information_assets (
        asset_id, asset_name, category, sub_category,
        owner_name, custodian_name, user_name, group_name,
        location_building, location_room, ip_address, domain_url,
        brand, model_version, quantity,
        password_changed, remote_maintenance,
        confidentiality, integrity, availability, legal_compliance, protection_level,
        has_pii, has_sensitive_pii, pii_count,
        inventory_year, change_type, previous_asset_id,
        is_it_system, is_china_brand,
        it_system_data_json, china_brand_data_json, risk_data_json,
        status, unit_code, unit_name, created_by, notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
      ) RETURNING *`;

      const values = [
        assetId, cleanText(p.assetName), p.category, cleanText(p.subCategory || ''),
        cleanText(p.ownerName || ''), cleanText(p.custodianName || ''), cleanText(p.userName || ''), cleanText(p.groupName || ''),
        cleanText(p.locationBuilding || ''), cleanText(p.locationRoom || ''), cleanText(p.ipAddress || ''), cleanText(p.domainUrl || ''),
        cleanText(p.brand || ''), cleanText(p.modelVersion || ''), p.quantity || 1,
        cleanText(p.passwordChanged || '不適用'), cleanText(p.remoteMaintenance || '不適用'),
        p.confidentiality || '普', p.integrity || '普', p.availability || '普', p.legalCompliance || '普', protLevel,
        !!p.hasPii, !!p.hasSensitivePii, cleanText(p.piiCount || ''),
        year, p.changeType || '新增', cleanText(p.previousAssetId || ''),
        !!p.isItSystem, !!p.isChinaBrand,
        JSON.stringify(p.itSystemData || {}), JSON.stringify(p.chinaBrandData || {}), JSON.stringify(p.riskData || {}),
        '填報中',
        cleanText(p.unitCode || authz.primaryUnit || ''),
        cleanText(p.unitName || ''),
        cleanText(authz.username || authz.email || ''),
        cleanText(p.notes || '')
      ];

      const row = await db.queryOne(sql, values);
      writeJson(res, { status: 201, jsonBody: mapRowToAsset(row) }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Update Asset ──
  async function handleUpdate(req, res, origin, assetId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const body = await parseJsonBody(req);
      const p = body.payload || body;

      const existing = await db.queryOne('SELECT * FROM information_assets WHERE asset_id = $1', [assetId]);
      if (!existing) { writeJson(res, { status: 404, jsonBody: { error: 'not_found' } }, origin); return; }

      if (p.rowVersion && p.rowVersion !== existing.row_version) {
        writeJson(res, { status: 409, jsonBody: { error: 'conflict', message: 'Record modified by another user' } }, origin);
        return;
      }

      const protLevel = computeProtectionLevel(
        p.confidentiality || existing.confidentiality,
        p.integrity || existing.integrity,
        p.availability || existing.availability,
        p.legalCompliance || existing.legal_compliance
      );

      const sql = `UPDATE information_assets SET
        asset_name=$1, category=$2, sub_category=$3,
        owner_name=$4, custodian_name=$5, user_name=$6, group_name=$7,
        location_building=$8, location_room=$9, ip_address=$10, domain_url=$11,
        brand=$12, model_version=$13, quantity=$14,
        password_changed=$15, remote_maintenance=$16,
        confidentiality=$17, integrity=$18, availability=$19, legal_compliance=$20, protection_level=$21,
        has_pii=$22, has_sensitive_pii=$23, pii_count=$24,
        change_type=$25, is_it_system=$26, is_china_brand=$27,
        it_system_data_json=$28, china_brand_data_json=$29, risk_data_json=$30,
        notes=$31
      WHERE asset_id=$32 RETURNING *`;

      const values = [
        cleanText(p.assetName || existing.asset_name), p.category || existing.category, cleanText(p.subCategory ?? existing.sub_category),
        cleanText(p.ownerName ?? existing.owner_name), cleanText(p.custodianName ?? existing.custodian_name),
        cleanText(p.userName ?? existing.user_name), cleanText(p.groupName ?? existing.group_name),
        cleanText(p.locationBuilding ?? existing.location_building), cleanText(p.locationRoom ?? existing.location_room),
        cleanText(p.ipAddress ?? existing.ip_address), cleanText(p.domainUrl ?? existing.domain_url),
        cleanText(p.brand ?? existing.brand), cleanText(p.modelVersion ?? existing.model_version), p.quantity ?? existing.quantity,
        cleanText(p.passwordChanged ?? existing.password_changed), cleanText(p.remoteMaintenance ?? existing.remote_maintenance),
        p.confidentiality || existing.confidentiality, p.integrity || existing.integrity,
        p.availability || existing.availability, p.legalCompliance || existing.legal_compliance, protLevel,
        p.hasPii != null ? !!p.hasPii : existing.has_pii,
        p.hasSensitivePii != null ? !!p.hasSensitivePii : existing.has_sensitive_pii,
        cleanText(p.piiCount ?? existing.pii_count),
        p.changeType || existing.change_type,
        p.isItSystem != null ? !!p.isItSystem : existing.is_it_system,
        p.isChinaBrand != null ? !!p.isChinaBrand : existing.is_china_brand,
        JSON.stringify(p.itSystemData || parseJsonField(existing.it_system_data_json) || {}),
        JSON.stringify(p.chinaBrandData || parseJsonField(existing.china_brand_data_json) || {}),
        JSON.stringify(p.riskData || parseJsonField(existing.risk_data_json) || {}),
        cleanText(p.notes ?? existing.notes),
        assetId
      ];

      const row = await db.queryOne(sql, values);
      writeJson(res, { status: 200, jsonBody: mapRowToAsset(row) }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Delete Asset (soft) ──
  async function handleDelete(req, res, origin, assetId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const row = await db.queryOne('SELECT * FROM information_assets WHERE asset_id = $1', [assetId]);
      if (!row) { writeJson(res, { status: 404, jsonBody: { error: 'not_found' } }, origin); return; }

      await db.query("UPDATE information_assets SET change_type = '刪除' WHERE asset_id = $1", [assetId]);
      writeJson(res, { status: 200, jsonBody: { success: true, id: assetId } }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Update Status ──
  async function handleStatusUpdate(req, res, origin, assetId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const body = await parseJsonBody(req);
      const newStatus = cleanText(body.status || (body.payload && body.payload.status));
      const valid = ['填報中', '待簽核', '已完成'];
      if (!valid.includes(newStatus)) {
        writeJson(res, { status: 400, jsonBody: { error: `Invalid status. Must be one of: ${valid.join(', ')}` } }, origin);
        return;
      }

      const row = await db.queryOne(
        'UPDATE information_assets SET status = $1 WHERE asset_id = $2 RETURNING *',
        [newStatus, assetId]
      );
      if (!row) { writeJson(res, { status: 404, jsonBody: { error: 'not_found' } }, origin); return; }
      writeJson(res, { status: 200, jsonBody: mapRowToAsset(row) }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Batch Status Update (for unit-level sign-off) ──
  async function handleBatchStatus(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const body = await parseJsonBody(req);
      const p = body.payload || body;
      const newStatus = cleanText(p.status);
      const unitCode = cleanText(p.unitCode);
      const year = p.year || (new Date().getFullYear() - 1911);

      if (!newStatus || !unitCode) {
        writeJson(res, { status: 400, jsonBody: { error: 'status and unitCode required' } }, origin);
        return;
      }

      const result = await db.query(
        'UPDATE information_assets SET status = $1 WHERE unit_code = $2 AND inventory_year = $3 RETURNING asset_id',
        [newStatus, unitCode, year]
      );
      writeJson(res, { status: 200, jsonBody: { updated: result.rowCount } }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Dashboard Summary ──
  async function handleSummary(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const year = new Date().getFullYear() - 1911;
      const sql = `
        SELECT unit_code, unit_name, status, category, is_it_system, is_china_brand,
               COUNT(*) as cnt,
               COUNT(*) FILTER (WHERE (risk_data_json->>'riskLevel') = '高') as high_risk_count
        FROM information_assets
        WHERE inventory_year = $1
        GROUP BY unit_code, unit_name, status, category, is_it_system, is_china_brand
        ORDER BY unit_code, category
      `;
      const rows = await db.queryAll(sql, [year]);
      writeJson(res, { status: 200, jsonBody: { year, summary: rows } }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Appendix 10: Get ──
  async function handleGetAppendix10(req, res, origin, assetId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const row = await db.queryOne('SELECT * FROM appendix10_assessments WHERE asset_id = $1', [assetId]);
      if (!row) {
        writeJson(res, { status: 200, jsonBody: { assetId, assessments: [], protectionLevel: '', complianceStatus: '' } }, origin);
        return;
      }
      writeJson(res, { status: 200, jsonBody: {
        assetId: row.asset_id,
        protectionLevel: row.protection_level,
        assessments: parseJsonField(row.assessments_json) || [],
        complianceStatus: row.compliance_status || '',
        nonComplianceCodes: row.non_compliance_codes || '',
        assessedBy: row.assessed_by || '',
        assessedAt: row.assessed_at ? new Date(row.assessed_at).toISOString() : ''
      } }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Appendix 10: Save ──
  async function handleSaveAppendix10(req, res, origin, assetId) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);

      const body = await parseJsonBody(req);
      const p = body.payload || body;

      const sql = `
        INSERT INTO appendix10_assessments (asset_id, protection_level, assessments_json, compliance_status, non_compliance_codes, assessed_by, assessed_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (asset_id) DO UPDATE SET
          protection_level = EXCLUDED.protection_level,
          assessments_json = EXCLUDED.assessments_json,
          compliance_status = EXCLUDED.compliance_status,
          non_compliance_codes = EXCLUDED.non_compliance_codes,
          assessed_by = EXCLUDED.assessed_by,
          assessed_at = NOW()
        RETURNING *
      `;

      const nonCompliance = (p.assessments || [])
        .filter(a => a.result === '不符合')
        .map(a => a.code)
        .join(', ');

      const compliance = nonCompliance ? '不符合' : '符合';

      const row = await db.queryOne(sql, [
        assetId,
        cleanText(p.protectionLevel || '普'),
        JSON.stringify(p.assessments || []),
        compliance,
        nonCompliance,
        cleanText(authz.username || authz.email || '')
      ]);

      // Update main asset compliance status
      await db.query(
        "UPDATE information_assets SET it_system_data_json = jsonb_set(it_system_data_json, '{complianceStatus}', $1::jsonb) WHERE asset_id = $2",
        [JSON.stringify(compliance), assetId]
      );

      writeJson(res, { status: 200, jsonBody: {
        assetId: row.asset_id,
        protectionLevel: row.protection_level,
        assessments: parseJsonField(row.assessments_json) || [],
        complianceStatus: row.compliance_status,
        nonComplianceCodes: row.non_compliance_codes,
        assessedBy: row.assessed_by,
        assessedAt: row.assessed_at ? new Date(row.assessed_at).toISOString() : ''
      } }, origin);
    } catch (e) {
      writeJson(res, { status: 500, jsonBody: { error: e.message } }, origin);
    }
  }

  // ── Main Router ──
  async function tryHandle(req, res, origin, url) {
    const pathname = cleanText(url && url.pathname);

    if (pathname === '/api/assets/health') { await handleHealth(req, res, origin); return true; }
    if (pathname === '/api/assets/summary' && req.method === 'GET') { await handleSummary(req, res, origin); return true; }
    if (pathname === '/api/assets/batch-status' && req.method === 'POST') { await handleBatchStatus(req, res, origin); return true; }
    if (pathname === '/api/assets' && req.method === 'GET') { await handleList(req, res, origin, url); return true; }
    if (pathname === '/api/assets' && req.method === 'POST') { await handleCreate(req, res, origin); return true; }

    const detailMatch = pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (detailMatch && req.method === 'GET') { await handleDetail(req, res, origin, routeAssetId(detailMatch[1])); return true; }
    if (detailMatch && req.method === 'POST') { await handleUpdate(req, res, origin, routeAssetId(detailMatch[1])); return true; }

    const deleteMatch = pathname.match(/^\/api\/assets\/([^/]+)\/delete$/);
    if (deleteMatch && req.method === 'POST') { await handleDelete(req, res, origin, routeAssetId(deleteMatch[1])); return true; }

    const statusMatch = pathname.match(/^\/api\/assets\/([^/]+)\/status$/);
    if (statusMatch && req.method === 'POST') { await handleStatusUpdate(req, res, origin, routeAssetId(statusMatch[1])); return true; }

    const a10GetMatch = pathname.match(/^\/api\/assets\/([^/]+)\/appendix10$/);
    if (a10GetMatch && req.method === 'GET') { await handleGetAppendix10(req, res, origin, routeAssetId(a10GetMatch[1])); return true; }
    if (a10GetMatch && req.method === 'POST') { await handleSaveAppendix10(req, res, origin, routeAssetId(a10GetMatch[1])); return true; }

    return false;
  }

  return { tryHandle };
}

module.exports = { createAssetInventoryRouter };
