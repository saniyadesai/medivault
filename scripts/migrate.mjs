#!/usr/bin/env node
// Apply db/migrations/*.sql in order to DATABASE_URL, recording each in schema_migrations.
//   node scripts/migrate.mjs                 apply pending migrations
//   node scripts/migrate.mjs --mark-applied  record every file as applied WITHOUT running it
//                                            (baseline a database that was migrated by hand)
// Works for local Postgres and hosted ones (Neon etc.): TLS is picked automatically by server/src/db.js.
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/src/db.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const markOnly = process.argv.includes('--mark-applied');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = await pool.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    if (markOnly) {
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      console.log(`marked   ${file}`);
      count++;
      continue;
    }
    const sql = readFileSync(join(dir, file), 'utf8');
    process.stdout.write(`applying ${file} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('ok');
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      console.error(`  ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  console.log(count === 0 ? 'nothing to apply' : `${count} migration(s) ${markOnly ? 'marked' : 'applied'}`);
} finally {
  client.release();
  await pool.end();
}
