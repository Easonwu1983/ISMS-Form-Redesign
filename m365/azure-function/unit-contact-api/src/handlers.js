const {
  ACTIONS,
  ACTIVE_DUPLICATE_STATUSES,
  CONTRACT_VERSION,
  buildErrorResponse,
  buildJsonResponse,
  createApplicationRecord,
  mapApplicationForClient,
  normalizeApplyPayload,
  normalizeLookupEmail,
  parseJsonBody,
  validateActionEnvelope,
  validateApplyPayload
} = require('./shared/contract');
const { createMockStore } = require('./shared/mock-store');
const { createSharePointRepository } = require('./shared/sharepoint-repository');

let repositorySingleton = null;

function getRepository() {
  if (repositorySingleton) return repositorySingleton;
  const mode = String(process.env.UNIT_CONTACT_REPOSITORY || 'mock').trim().toLowerCase();
  repositorySingleton = mode === 'sharepoint'
    ? createSharePointRepository()
    : createMockStore();
  return repositorySingleton;
}

async function ensureNoDuplicateActiveApplication(repository, payload) {
  const existing = await repository.listApplicationsByEmail(payload.applicantEmail);
  const duplicated = existing.find((entry) => {
    return entry.unitValue === payload.unitValue && ACTIVE_DUPLICATE_STATUSES.has(entry.status);
  });
  if (!duplicated) return;
  const error = new Error('本單位與此信箱已有尚未結案的申請，請改用進度查詢或請管理者處理。');
  error.statusCode = 409;
  throw error;
}

async function handleApply(request) {
  try {
    const envelope = await parseJsonBody(request);
    validateActionEnvelope(envelope, ACTIONS.APPLY);
    const payload = normalizeApplyPayload(envelope.payload);
    validateApplyPayload(payload);

    const repository = getRepository();
    await ensureNoDuplicateActiveApplication(repository, payload);
    const nextSequence = await repository.getNextSequence(new Date().getFullYear());
    const application = createApplicationRecord(payload, nextSequence);
    const created = await repository.createApplication(application);

    return buildJsonResponse(201, {
      ok: true,
      application: mapApplicationForClient(created),
      contractVersion: CONTRACT_VERSION
    });
  } catch (error) {
    return buildErrorResponse(error, '申請送出失敗。');
  }
}

async function handleLookup(request) {
  try {
    const repository = getRepository();
    let email = '';

    if (String(request.method || 'GET').toUpperCase() === 'GET') {
      email = normalizeLookupEmail(request.query.get('email'));
    } else {
      const envelope = await parseJsonBody(request);
      validateActionEnvelope(envelope, ACTIONS.LOOKUP);
      email = normalizeLookupEmail(envelope && envelope.payload && envelope.payload.email);
    }

    const applications = await repository.listApplicationsByEmail(email);
    return buildJsonResponse(200, {
      ok: true,
      applications: applications.map(mapApplicationForClient),
      contractVersion: CONTRACT_VERSION
    });
  } catch (error) {
    return buildErrorResponse(error, '查詢申請狀態失敗。');
  }
}

async function handleHealth() {
  try {
    const repository = getRepository();
    return buildJsonResponse(200, {
      ok: true,
      contractVersion: CONTRACT_VERSION,
      repository: await repository.getHealth()
    });
  } catch (error) {
    return buildErrorResponse(error, '後端健康檢查失敗。', 500);
  }
}

module.exports = {
  handleApply,
  handleLookup,
  handleHealth
};
