// @ts-check
'use strict';

const { Pool } = require('pg');
const log = require('./logger.cjs');

let pool = null;

function getPool() {
  if (pool) return pool;

  const config = {
    host: process.env.PG_HOST || '127.0.0.1',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'isms_db',
    user: process.env.PG_USER || 'isms_user',
    password: process.env.PG_PASSWORD || '',
    min: Number(process.env.PG_POOL_MIN || 2),
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  pool = new Pool(config);

  pool.on('error', (err) => {
    log.error('db', 'unexpected pool error', { error: err.message });
  });

  log.info('db', 'pool created', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    min: config.min,
    max: config.max,
  });

  return pool;
}

/**
 * 執行 SQL 查詢，自動偵測慢查詢
 * @param {string} sql - SQL 語句
 * @param {any[]} [params] - 綁定參數
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(sql, params) {
  const start = Date.now();
  const result = await getPool().query(sql, params);
  const ms = Date.now() - start;
  if (ms > 100) {
    log.warn('db', 'slow query', { ms, sql: sql.substring(0, 120) });
  }
  return result;
}

/**
 * 查詢單筆資料，無結果回傳 null
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<Record<string, any> | null>}
 */
async function queryOne(sql, params) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

/**
 * 查詢多筆資料，回傳陣列
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<Record<string, any>[]>}
 */
async function queryAll(sql, params) {
  const result = await query(sql, params);
  return result.rows;
}

/**
 * 在交易中執行回呼，自動 COMMIT/ROLLBACK
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 * @returns {Promise<any>}
 */
async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 檢查資料庫連線是否正常
 * @returns {Promise<{ok: boolean, latencyMs: number, error?: string}>}
 */
async function healthCheck() {
  const start = Date.now();
  try {
    await query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

/**
 * 關閉連線池，釋放所有連線
 * @returns {Promise<void>}
 */
async function close() {
  if (pool) {
    console.log('[db] draining pool');
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, queryOne, queryAll, transaction, healthCheck, close };
