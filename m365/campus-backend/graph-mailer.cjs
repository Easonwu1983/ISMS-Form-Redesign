// @ts-check
function cleanText(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtmlDocument(lines) {
  const portalUrl = cleanText(process.env.ISMS_PORTAL_URL) || 'https://isms-campus-portal.pages.dev/';
  const body = (Array.isArray(lines) ? lines : [])
    .map(function (line) {
      // Convert URLs to clickable links
      let escaped = escapeHtml(line);
      if (/https?:\/\//.test(line)) {
        escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563eb">$1</a>');
      }
      return '<p>' + escaped + '</p>';
    })
    .join('');
  const footer = '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 16px"><p style="font-size:12px;color:#94a3b8">本信件由 ISMS 資訊安全管理系統自動發送，請勿直接回覆。<br><a href="' + escapeHtml(portalUrl) + '" style="color:#2563eb">登入系統</a></p>';
  return '<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.7;max-width:600px;margin:0 auto;padding:20px">' + body + footer + '</body></html>';
}

async function sendGraphMail(options) {
  const settings = options && typeof options === 'object' ? options : {};
  const graphRequest = settings.graphRequest;
  const getDelegatedToken = settings.getDelegatedToken;
  const to = cleanText(settings.to);
  const subject = cleanText(settings.subject);
  const html = cleanText(settings.html);

  if (typeof graphRequest !== 'function' || typeof getDelegatedToken !== 'function') {
    throw new Error('Graph mail helper is missing required dependencies.');
  }
  if (!to) {
    return { sent: false, channel: 'graph-mail', reason: 'missing-recipient' };
  }
  if (!subject || !html) {
    return { sent: false, channel: 'graph-mail', reason: 'missing-content' };
  }

  const token = await getDelegatedToken();
  const mode = cleanText(token && token.mode) || 'delegated-cli';
  const senderUpn = cleanText(process.env.GRAPH_MAIL_SENDER_UPN || process.env.AUTH_MAIL_SENDER_UPN);
  const path = mode === 'app-only'
    ? (senderUpn ? `/users/${encodeURIComponent(senderUpn)}/sendMail` : '')
    : '/me/sendMail';

  if (!path) {
    return {
      sent: false,
      channel: 'graph-mail',
      reason: 'missing-sender-upn',
      mode
    };
  }

  try {
    await graphRequest('POST', path, {
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: html
        },
        toRecipients: [
          {
            emailAddress: {
              address: to
            }
          }
        ]
      },
      saveToSentItems: true
    });
    return {
      sent: true,
      channel: 'graph-mail',
      mode,
      sender: mode === 'app-only' ? senderUpn : ''
    };
  } catch (error) {
    return {
      sent: false,
      channel: 'graph-mail',
      mode,
      sender: mode === 'app-only' ? senderUpn : '',
      error: cleanText(error && error.message) || 'unknown-mail-error'
    };
  }
}

module.exports = {
  buildHtmlDocument,
  sendGraphMail
};
