const bcrypt = require('bcryptjs');
const { pool } = require('../../lib/db');
const { handler, signToken, normEmail, validEmail, getUserByEmail } = require('../../lib/auth');

// POST /api/auth/register { email, password }
module.exports = handler(['POST'], async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (await getUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists — try signing in' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [email, hash]);
  res.json({ access_token: signToken(rows[0].id), user: rows[0] });
});
