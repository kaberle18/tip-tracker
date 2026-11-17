const bcrypt = require('bcryptjs');
const { handler, signToken, getUserByEmail } = require('../../lib/auth');

// POST /api/auth/login { email, password }
module.exports = handler(['POST'], async (req, res) => {
  const user = await getUserByEmail(req.body.email);
  const ok = user && await bcrypt.compare(String(req.body.password || ''), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });
  res.json({ access_token: signToken(user.id), user: { id: user.id, email: user.email } });
});
