// @ts-check
'use strict';

/**
 * API 回應快取 — 減少重複 DB 查詢
 *
 * 策略：
 * - 以 URL path + query string 為 key
 * - TTL 60 秒（可調整）
 * - 最多 100 個快取條目
 * - 只快取 GET 請求的 200 回應
 */

const DEFAULT_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 100;

/** @type {Map<string, {data: any, expiresAt: number}>} */
const cache = new Map();

/**
 * @param {string} key
 * @returns {any|null}
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * @param {string} key
 * @param {any} data
 * @param {number} [ttlMs]
 */
function set(key, data, ttlMs) {
  // Evict oldest if full
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + (ttlMs || DEFAULT_TTL_MS) });
}

function clear() { cache.clear(); }
function size() { return cache.size; }

/**
 * Express/http middleware-style cache wrapper
 * @param {string} cacheKey
 * @param {Function} queryFn - async function that returns data
 * @param {number} [ttlMs]
 * @returns {Promise<any>}
 */
async function cached(cacheKey, queryFn, ttlMs) {
  const hit = get(cacheKey);
  if (hit !== null) return hit;
  const data = await queryFn();
  set(cacheKey, data, ttlMs);
  return data;
}

module.exports = { get, set, clear, size, cached };
