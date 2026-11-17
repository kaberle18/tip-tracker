const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../../lib/db');
const { handler, signToken } = require('../../lib/auth');

// POST /api/auth/reset { token, password }
module.exports = handler(['POST'], async (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (!token) return res.status(400).json({ error: 'This reset link is missing its code' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await pool.query('SELECT id, email FROM tiptrack_users WHERE reset_token = $1 AND reset_token_expires_at > now()', [tokenHash]);
  const user = rows[0];
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired — request a new one' });
  await pool.query('UPDATE tiptrack_users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL, updated_date = now() WHERE id = $2',
    [await bcrypt.hash(password, 10), user.id]);
  res.json({ ok: true, access_token: signToken(user.id), user });
});
