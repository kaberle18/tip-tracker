// Postgres connection (Neon on Vercel). Same approach as Horizon Pro.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) console.warn('[db] DATABASE_URL is not set — connect the Neon integration in Vercel > Storage.');

const pool = global.__tipPool || new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX) || 3,
  keepAlive: true,
});
global.__tipPool = pool;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tiptrack_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  reset_token TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tiptrack_data (
  user_id UUID PRIMARY KEY REFERENCES tiptrack_users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tiptrack_data ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS tiptrack_icons (
  user_id UUID PRIMARY KEY REFERENCES tiptrack_users(id) ON DELETE CASCADE,
  png BYTEA NOT NULL,
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

let ready = null;
function ensureSchema() {
  if (!ready) ready = pool.query(SCHEMA).catch(err => { ready = null; throw err; });
  return ready;
}

module.exports = { pool, ensureSchema };
