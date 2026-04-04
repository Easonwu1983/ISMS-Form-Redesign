// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db.cjs');

async function run() {
  // Create tracking table
  await db.query(`CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  // Get already applied
  const applied = new Set(
    (await db.queryAll('SELECT filename FROM _migrations')).map(r => r.filename)
  );

  // Scan migration files
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) { console.log('SKIP', file); continue; }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.query(sql);
    await db.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log('APPLIED', file);
  }
  console.log('Migration complete');
  await db.close();
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1); });
