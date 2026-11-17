const { pool } = require('../lib/db');
const { handler, requireUser } = require('../lib/auth');

// GET /api/data -> { email, data, version }
// PUT /api/data { data, version } -> { ok, version }
// Saves only apply on top of the version the client last saw; a save from an
// out-of-date copy (e.g. an old tab or another device) gets 409 + the current
// data instead of silently overwriting newer changes.
module.exports = handler(['GET', 'PUT'], async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const current = async () => (await pool.query('SELECT data, version FROM tiptrack_data WHERE user_id = $1', [user.id])).rows[0];

  if (req.method === 'GET') {
    const row = await current();
    return res.json({ id: user.id, email: user.email, data: row?.data || null, version: row?.version ?? 0 });
  }

  const data = req.body.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.shifts) || !Array.isArray(data.rates)) {
    return res.status(400).json({ error: 'Invalid data' });
  }
  const base = Number.isInteger(req.body.version) ? req.body.version : -1;
  const json = JSON.stringify({ rates: data.rates, shifts: data.shifts, brand: data.brand || null });
  if (json.length > 4_000_000) return res.status(413).json({ error: 'Too much data' });

  let rows;
  if (base === 0) {
    ({ rows } = await pool.query(
      `INSERT INTO tiptrack_data (user_id, data, version, updated_date) VALUES ($1, $2, 1, now())
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, version = tiptrack_data.version + 1, updated_date = now()
       WHERE tiptrack_data.version = 0 RETURNING version`, [user.id, json]));
  } else {
    ({ rows } = await pool.query(
      `UPDATE tiptrack_data SET data = $2, version = version + 1, updated_date = now()
       WHERE user_id = $1 AND version = $3 RETURNING version`, [user.id, json, base]));
  }
  if (!rows.length) {
    const row = await current();
    return res.status(409).json({ error: 'Your data changed on another device', data: row?.data || null, version: row?.version ?? 0 });
  }
  res.json({ ok: true, version: rows[0].version });
});
