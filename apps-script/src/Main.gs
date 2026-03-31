function doGet(e) {
  const request = {
    action: (e && e.parameter && e.parameter.action) ? e.parameter.action : 'health.ping',
    payload: (e && e.parameter) ? e.parameter : {},
    sessionToken: (e && e.parameter && e.parameter.sessionToken) ? e.parameter.sessionToken : '',
    requestId: (e && e.parameter && e.parameter.requestId) ? e.parameter.requestId : '',
    ip: (e && e.parameter && e.parameter.ip) ? e.parameter.ip : '',
    ua: (e && e.parameter && e.parameter.ua) ? e.parameter.ua : ''
  };
  return dispatchRequest_(request);
}

function doPost(e) {
  const request = parseRequestBody_(e);
  return dispatchRequest_(request);
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return { action: '', payload: {}, sessionToken: '', requestId: '', ip: '', ua: '' };
  }

  try {
    const body = JSON.parse(e.postData.contents);
    return {
      action: body.action || '',
      payload: body.payload || {},
      sessionToken: body.sessionToken || '',
      requestId: body.requestId || '',
      ip: body.ip || '',
      ua: body.ua || ''
    };
  } catch (_) {
    throw createHttpError_('BAD_REQUEST', 'Invalid JSON body', 400);
  }
}

function dispatchRequest_(request) {
  return withRequestScope_(() => {
    const requestId = request.requestId || createRequestId_();
    const action = String(request.action || '').trim();
    const payload = request.payload || {};

    runDailySecurityMaintenance_();

    let actorEmail = '';
    let actorUsername = '';
    try {
      if (!action) throw createHttpError_('BAD_REQUEST', 'Missing action', 400);

      const handlers = getActionHandlers_();
      const handler = handlers[action];
      if (!handler) throw createHttpError_('NOT_FOUND', `Unknown action: ${action}`, 404);

      let authContext = null;
      if (isAuthRequired_(action)) {
        authContext = authenticateRequest_(request);
        actorEmail = authContext.email || '';
        actorUsername = authContext.username || '';
        assertPasswordChangeGate_(action, authContext);
      }

      const data = handler(payload, authContext, request);
      logApiAudit_(requestId, action, actorEmail, actorUsername, 'OK', '');
      return jsonResponse_(200, {
        ok: true,
        requestId,
        data,
        ts: nowIso_()
      });
    } catch (err) {
      const normalized = normalizeError_(err);
      logApiAudit_(requestId, action || 'unknown', actorEmail, actorUsername, 'ERR', `${normalized.code}: ${normalized.message}`);
      return jsonResponse_(normalized.status, {
        ok: false,
        requestId,
        error: {
          code: normalized.code,
          message: normalized.message
        },
        ts: nowIso_()
      });
    }
  });
}

function getActionHandlers_() {
  return {
    'health.ping': healthPingAction_,

    'auth.login': authLoginAction_,
    'auth.logout': authLogoutAction_,
    'auth.me': authMeAction_,
    'auth.changePassword': authChangePasswordAction_,
    'auth.requestPasswordReset': authRequestPasswordResetAction_,
    'auth.resetPassword': authResetPasswordAction_,

    'car.list': carListAction_,
    'notify.sendUnitManagers': notifySendUnitManagersAction_
  };
}

function isAuthRequired_(action) {
  const publicActions = new Set([
    'health.ping',
    'auth.login',
    'auth.requestPasswordReset',
    'auth.resetPassword'
  ]);
  return !publicActions.has(String(action || ''));
}

function healthPingAction_(_payload, _authContext) {
  return {
    service: APP_META.serviceName,
    version: APP_META.version,
    status: 'ok',
    time: nowIso_()
  };
}

function authMeAction_(_payload, authContext) {
  if (!authContext) throw createHttpError_('UNAUTHORIZED', 'Unauthorized', 401);
  return {
    user: {
      id: authContext.userId,
      username: authContext.username,
      email: authContext.email,
      name: authContext.name,
      role: authContext.role,
      unit: authContext.unit,
      subUnit: authContext.subUnit,
      mustChangePassword: !!authContext.mustChangePassword,
      passwordExpiresAt: authContext.passwordExpiresAt || ''
    },
    config: {
      timezone: getTimezone_(),
      sessionTtlHours: getNumberConfig_('session_ttl_hours', 12)
    }
  };
}

function carListAction_(payload, authContext) {
  if (!authContext) throw createHttpError_('UNAUTHORIZED', 'Unauthorized', 401);
  return carListService_(payload || {}, authContext);
}

function logApiAudit_(requestId, action, actorEmail, actorUsername, status, message) {
  try {
    const row = {
      id: createId_('AUD'),
      request_id: requestId,
      action: action || '',
      actor_email: actorEmail || '',
      actor_username: actorUsername || '',
      status: status || 'OK',
      message: message || '',
      created_at: nowIso_()
    };
    row.integrity_hash = computeLogIntegrityHash_(row);

    appendSheetRow_(SHEET_NAMES.apiAudit, row);
  } catch (err) {
    recordInternalError_('Main.logApiAudit_', err, {
      requestId,
      action,
      actorEmail,
      actorUsername,
      status
    });
  }
}

function jsonResponse_(_statusCode, obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function createHttpError_(code, message, status) {
  const err = new Error(message);
  err.code = code || 'INTERNAL_ERROR';
  err.status = status || 500;
  return err;
}

function normalizeError_(err) {
  if (!err) return { code: 'INTERNAL_ERROR', message: 'Unknown error', status: 500 };
  return {
    code: err.code || 'INTERNAL_ERROR',
    message: err.message || 'Unexpected error',
    status: Number(err.status || 500)
  };
}
