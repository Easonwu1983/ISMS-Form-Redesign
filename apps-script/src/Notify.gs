function notifySendUnitManagersAction_(payload, authContext) {
  if (!authContext) throw createHttpError_('UNAUTHORIZED', 'Unauthorized', 401);
  if (!isAdmin_(authContext)) {
    throw createHttpError_('FORBIDDEN', 'Only admin can send manager notifications', 403);
  }

  const subject = String((payload && payload.subject) || '').trim() || '[內部稽核管考追蹤系統] 通知';
  const body = String((payload && payload.body) || '').trim();
  if (!body) {
    throw createHttpError_('VALIDATION_ERROR', 'body is required', 400);
  }

  const targetUnits = normalizeUnitList_(payload && payload.units ? payload.units : payload && payload.unit ? [payload.unit] : []);
  const recipients = listActiveUnitManagerEmails_(targetUnits);
  if (recipients.length === 0) {
    throw createHttpError_('VALIDATION_ERROR', 'No active unit manager email found', 400);
  }

  const sender = getMailSender_();
  const fromName = String((payload && payload.fromName) || '內部稽核管考追蹤系統').trim();
  const sentAt = nowIso_();

  recipients.forEach((to) => {
    sendMailByGmailApp_(to, subject, body, sender, fromName);
  });

  return {
    ok: true,
    sentCount: recipients.length,
    recipients,
    sender: sender || Session.getActiveUser().getEmail() || '',
    sentAt
  };
}

function listActiveUnitManagerEmails_(units) {
  const rows = readSheetRows_(SHEET_NAMES.users);
  const unitSet = new Set((units || []).map((x) => String(x || '').trim()).filter((x) => !!x));

  const emails = rows
    .filter((r) => String(r.role || '') === '單位管理員')
    .filter((r) => safeToBool_(r.is_active === '' ? true : r.is_active))
    .filter((r) => {
      if (unitSet.size === 0) return true;
      const unit = String(r.unit || '').trim();
      return unitSet.has(unit);
    })
    .map((r) => String(r.email || '').trim().toLowerCase())
    .filter((email) => !!email);

  return Array.from(new Set(emails));
}

function sendMailByGmailApp_(to, subject, body, preferredSender, fromName) {
  const options = {
    name: fromName || '內部稽核管考追蹤系統'
  };

  const sender = String(preferredSender || '').trim().toLowerCase();
  if (sender) {
    try {
      const aliases = GmailApp.getAliases().map((x) => String(x || '').toLowerCase());
      if (aliases.includes(sender)) {
        options.from = sender;
      }
    } catch (_) {
      // Ignore alias lookup failure and fallback to default sender.
    }
  }

  GmailApp.sendEmail(String(to || '').trim(), subject, body, options);
}

function normalizeUnitList_(units) {
  if (!Array.isArray(units)) return [];
  const clean = units.map((x) => String(x || '').trim()).filter((x) => !!x);
  return Array.from(new Set(clean));
}
