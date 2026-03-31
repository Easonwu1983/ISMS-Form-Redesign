function carListService_(payload, authContext) {
  const rows = readSheetRows_(SHEET_NAMES.carItems)
    .filter((r) => !safeToBool_(r.is_deleted));

  const visible = rows.filter((row) => canViewCar_(row, authContext));

  const status = String(payload.status || '').trim();
  const unit = String(payload.unit || '').trim();
  const q = String(payload.q || '').trim().toLowerCase();

  let filtered = visible;
  if (status) filtered = filtered.filter((x) => String(x.status || '') === status);
  if (unit) filtered = filtered.filter((x) => String(x.proposer_unit || '') === unit || String(x.handler_unit || '') === unit);
  if (q) {
    filtered = filtered.filter((x) => {
      const text = [
        x.id, x.problem_desc, x.proposer_name, x.handler_name,
        x.proposer_unit, x.handler_unit, x.source, x.deficiency_type
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      return text.indexOf(q) >= 0;
    });
  }

  filtered.sort((a, b) => safeDateMs_(b.created_at || b.updated_at) - safeDateMs_(a.created_at || a.updated_at));

  const pageSize = clampPageSize_(payload.pageSize);
  const page = clampPage_(payload.page);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const list = filtered.slice(start, start + pageSize).map(mapCarListItem_);

  return {
    items: list,
    paging: {
      page: safePage,
      pageSize,
      total,
      pageCount
    },
    stats: {
      pending: filtered.filter((x) => String(x.status) === '待矯正').length,
      closed: filtered.filter((x) => String(x.status) === '結案').length
    }
  };
}

function canViewCar_(row, authContext) {
  if (!authContext) return false;
  if (isAdmin_(authContext)) return true;

  const unit = String(authContext.unit || '');
  const name = String(authContext.name || '');

  if (isUnitAdmin_(authContext)) {
    return String(row.proposer_unit || '') === unit
      || String(row.handler_unit || '') === unit
      || String(row.proposer_name || '') === name;
  }

  return String(row.handler_name || '') === name;
}

function mapCarListItem_(row) {
  let categories = [];
  const raw = String(row.categories_json || '').trim();
  if (raw) {
    try {
      categories = JSON.parse(raw);
      if (!Array.isArray(categories)) categories = [];
    } catch (err) {
      recordInternalError_('CarService.mapCarListItem_.categories', err, { id: String(row.id || '') });
      categories = [];
    }
  }

  return {
    id: String(row.id || ''),
    status: String(row.status || ''),
    proposerUnit: String(row.proposer_unit || ''),
    proposerName: String(row.proposer_name || ''),
    handlerUnit: String(row.handler_unit || ''),
    handlerName: String(row.handler_name || ''),
    deficiencyType: String(row.deficiency_type || ''),
    source: String(row.source || ''),
    categories,
    clause: String(row.clause || ''),
    problemDesc: String(row.problem_desc || ''),
    correctiveDueDate: String(row.corrective_due_date || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    rowVersion: Number(row.row_version || 0)
  };
}

function clampPageSize_(value) {
  const n = Number(value || APP_LIMITS.defaultPageSize);
  if (!Number.isFinite(n) || n < 1) return APP_LIMITS.defaultPageSize;
  return Math.min(Math.floor(n), APP_LIMITS.maxPageSize);
}

function clampPage_(value) {
  const n = Number(value || 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function safeDateMs_(isoString) {
  const ms = new Date(String(isoString || '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
