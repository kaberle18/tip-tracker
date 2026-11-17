// GET /api/icon?u=<userId>&v=<n>  -> the user's home-screen icon (PNG)
// PUT /api/icon { png: <base64> }  -> store the icon the app generated from the brand logo
const { pool } = require('../lib/db');
const { handler, requireUser } = require('../lib/auth');

module.exports = handler(['GET', 'PUT'], async (req, res) => {
  if (req.method === 'GET') {
    const id = String(req.query.u || '');
    const row = /^[0-9a-f-]{36}$/i.test(id)
      ? (await pool.query('SELECT png FROM tiptrack_icons WHERE user_id = $1', [id])).rows[0] : null;
    if (!row) { res.setHeader('location', '/icons/icon-180.png'); return res.status(302).end(); }
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    return res.status(200).send(row.png);
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const b64 = String(req.body.png || '').replace(/^data:image\/png;base64,/, '');
  const png = Buffer.from(b64, 'base64');
  if (png.length < 100 || png.length > 600_000 || png.readUInt32BE(0) !== 0x89504e47) return res.status(400).json({ error: 'Invalid image' });
  await pool.query(`INSERT INTO tiptrack_icons (user_id, png, updated_date) VALUES ($1, $2, now())
    ON CONFLICT (user_id) DO UPDATE SET png = EXCLUDED.png, updated_date = now()`, [user.id, png]);
  res.json({ ok: true });
});
