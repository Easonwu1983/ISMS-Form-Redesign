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

/** Known key-value label prefixes rendered as styled cards. */
const KV_LABELS = ['單號', '狀態', '所屬單位', '系統入口', '稽核年度', '填報期限'];

function isKvLine(line) {
  var idx = line.indexOf('：');
  if (idx < 1) return false;
  var label = line.substring(0, idx);
  for (var i = 0; i < KV_LABELS.length; i++) {
    if (label.indexOf(KV_LABELS[i]) !== -1) return true;
  }
  return true; // any line containing "：" is treated as key-value
}

function renderLine(line) {
  var escaped = escapeHtml(line);
  // Convert URLs to clickable links
  if (/https?:\/\//.test(line)) {
    escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563eb;text-decoration:underline">$1</a>');
  }

  var colonIdx = line.indexOf('：');
  if (colonIdx > 0 && isKvLine(line)) {
    var key = escapeHtml(line.substring(0, colonIdx));
    var rawValue = line.substring(colonIdx + 1);
    var value = escapeHtml(rawValue);
    if (/https?:\/\//.test(rawValue)) {
      value = value.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563eb;text-decoration:underline">$1</a>');
    }
    return '<div style="display:flex;gap:8px;margin:4px 0;padding:8px 12px;background:#f8fafc;border-radius:6px">'
      + '<span style="font-weight:700;color:#475569;min-width:80px;white-space:nowrap">' + key + '</span>'
      + '<span style="color:#1e293b">' + value + '</span>'
      + '</div>';
  }

  return '<p style="margin:8px 0">' + escaped + '</p>';
}

function buildHtmlDocument(lines) {
  const portalUrl = cleanText(process.env.ISMS_PORTAL_URL) || 'https://isms-campus-portal.pages.dev/';
  const bodyContent = (Array.isArray(lines) ? lines : [])
    .map(renderLine)
    .join('');

  return '<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9">'
    + '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">'
    // Header
    + '<div style="background:#1e40af;padding:20px 24px;text-align:center">'
    + '<span style="color:#fff;font-size:18px;font-weight:700;font-family:Arial,sans-serif">ISMS 資訊安全管理系統</span>'
    + '</div>'
    // Body
    + '<div style="padding:28px 24px;font-family:Arial,sans-serif;color:#1e293b;font-size:15px;line-height:1.8">'
    + bodyContent
    + '</div>'
    // Footer
    + '<div style="padding:16px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;font-family:Arial,sans-serif">'
    + '本信件由 ISMS 資訊安全管理系統自動發送，請勿直接回覆<br>'
    + '<a href="' + escapeHtml(portalUrl) + '" style="color:#2563eb;text-decoration:underline">登入系統</a>'
    + '</div>'
    + '</div>'
    + '</body></html>';
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
