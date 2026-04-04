// @ts-check
'use strict';

const db = require('./db.cjs');

/**
 * Create notification router
 * @param {{parseJsonBody: Function, writeJson: Function, requestAuthz: object}} deps
 * @returns {{tryHandle: (req: import('http').IncomingMessage, res: import('http').ServerResponse, origin: string, url: URL) => Promise<boolean>}}
 */
function createNotificationRouter(deps) {
  const { parseJsonBody, writeJson, requestAuthz } = deps;

  function buildResponse(status, jsonBody) {
    return { status, jsonBody };
  }

  function buildErrorRes(error, fallbackMsg, status) {
    const code = (error && error.statusCode) || status || 500;
    const message = (error && error.message) || fallbackMsg || 'Internal error';
    return { status: code, jsonBody: { ok: false, message } };
  }

  /**
   * GET /api/notifications — list user's notifications (unread first, limit 20)
   */
  async function handleList(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const username = String(authz.username || '').trim().toLowerCase();
      if (!username) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      const rows = await db.queryAll(
        `SELECT id, username, title, message, link, read, created_at
         FROM notifications
         WHERE LOWER(username) = $1
         ORDER BY read ASC, created_at DESC
         LIMIT 20`,
        [username]
      );
      const items = rows.map(function (row) {
        return {
          id: row.id,
          username: row.username || '',
          title: row.title || '',
          message: row.message || '',
          link: row.link || '',
          read: !!row.read,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : ''
        };
      });
      await writeJson(res, buildResponse(200, { ok: true, items }), origin);
    } catch (error) {
      await writeJson(res, buildErrorRes(error, 'Failed to list notifications.', 500), origin);
    }
  }

  /**
   * POST /api/notifications/read — mark notification as read
   * Body: { id: number }
   */
  async function handleMarkRead(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const username = String(authz.username || '').trim().toLowerCase();
      if (!username) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      const body = await parseJsonBody(req);
      const notifId = Number(body && body.id);
      if (!notifId) throw Object.assign(new Error('Missing notification id'), { statusCode: 400 });
      await db.query(
        `UPDATE notifications SET read = TRUE WHERE id = $1 AND LOWER(username) = $2`,
        [notifId, username]
      );
      await writeJson(res, buildResponse(200, { ok: true }), origin);
    } catch (error) {
      await writeJson(res, buildErrorRes(error, 'Failed to mark notification as read.', 500), origin);
    }
  }

  /**
   * GET /api/notifications/count — get unread count
   */
  async function handleCount(req, res, origin) {
    try {
      const authz = await requestAuthz.requireAuthenticatedUser(req);
      const username = String(authz.username || '').trim().toLowerCase();
      if (!username) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      const row = await db.queryOne(
        `SELECT COUNT(*)::int AS count FROM notifications WHERE LOWER(username) = $1 AND read = FALSE`,
        [username]
      );
      await writeJson(res, buildResponse(200, { ok: true, count: (row && row.count) || 0 }), origin);
    } catch (error) {
      await writeJson(res, buildErrorRes(error, 'Failed to count notifications.', 500), origin);
    }
  }

  function tryHandle(req, res, origin, url) {
    if (url.pathname === '/api/notifications' && req.method === 'GET') {
      return handleList(req, res, origin).then(function () { return true; });
    }
    if (url.pathname === '/api/notifications/read' && req.method === 'POST') {
      return handleMarkRead(req, res, origin).then(function () { return true; });
    }
    if (url.pathname === '/api/notifications/count' && req.method === 'GET') {
      return handleCount(req, res, origin).then(function () { return true; });
    }
    return Promise.resolve(false);
  }

  return { tryHandle };
}

module.exports = { createNotificationRouter };
