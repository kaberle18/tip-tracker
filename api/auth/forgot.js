const crypto = require('crypto');
const { pool } = require('../../lib/db');
const { handler, getUserByEmail, normEmail } = require('../../lib/auth');
const { sendEmail } = require('../../lib/email');

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${req.headers['x-forwarded-proto'] || 'https'}://${host}`;
}

// POST /api/auth/forgot { email } — emails a 1-hour reset link
module.exports = handler(['POST'], async (req, res) => {
  const email = normEmail(req.body.email);
  const user = await getUserByEmail(email);
  // Always respond ok so the form doesn't reveal which emails have accounts.
  if (!user) return res.json({ ok: true });
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query('UPDATE tiptrack_users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3',
    [tokenHash, new Date(Date.now() + 60 * 60 * 1000), user.id]);
  const link = `${appUrl(req)}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Reset your TipTrack password',
    text: `Someone asked to reset the password for your TipTrack account.\n\nReset it here: ${link}\n\nThis link expires in 1 hour. If you didn't ask for this, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="margin:0 0 12px">Reset your TipTrack password</h2>
      <p>Someone asked to reset the password for your TipTrack account.</p>
      <p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Choose a new password</a></p>
      <p style="color:#6b7280;font-size:13px">This link expires in 1 hour. If you didn't ask for this, you can ignore this email.</p></div>`,
  });
  res.json({ ok: true });
});
