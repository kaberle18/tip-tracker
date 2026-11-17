const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, ensureSchema } = require('./db');

// JWT_SECRET is preferred. If it isn't set, fall back to a secret derived from
// DATABASE_URL (itself secret) so the app still works securely out of the box.
const SECRET = process.env.JWT_SECRET
  || (process.env.DATABASE_URL && crypto.createHash('sha256').update('tiptrack:' + process.env.DATABASE_URL).digest('hex'))
  || 'dev-only-insecure-secret-change-me';

const signToken = userId => jwt.sign({ sub: userId }, SECRET, { expiresIn: '60d' });
const verifyToken = t => { try { return jwt.verify(t, SECRET); } catch { return null; } };

const normEmail = e => String(e || '').toLowerCase().trim();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM tiptrack_users WHERE email = $1', [normEmail(email)]);
  return rows[0] || null;
}

// Returns the user row or sends 401 and returns null.
async function requireUser(req, res) {
  const h = req.headers.authorization || '';
  const payload = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
  if (!payload) { res.status(401).json({ error: 'Please sign in again' }); return null; }
  const { rows } = await pool.query('SELECT id, email FROM tiptrack_users WHERE id = $1', [payload.sub]);
  if (!rows[0]) { res.status(401).json({ error: 'Account not found' }); return null; }
  return rows[0];
}

// Wraps a handler: method check, schema migration, JSON body, error handling.
function handler(methods, fn) {
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    if (!methods.includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    try {
      await ensureSchema();
      if (typeof req.body === 'string') { try { req.body = JSON.parse(req.body); } catch { req.body = {}; } }
      req.body = req.body || {};
      await fn(req, res);
    } catch (err) {
      console.error('[api]', err);
      if (!res.headersSent) res.status(500).json({ error: process.env.DATABASE_URL ? 'Something went wrong — please try again' : 'Database is not connected yet' });
    }
  };
}

module.exports = { signToken, verifyToken, normEmail, validEmail, getUserByEmail, requireUser, handler };
