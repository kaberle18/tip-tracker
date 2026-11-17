const { pool } = require('../lib/db');
const { handler, requireUser } = require('../lib/auth');

// GET /api/data  -> { data, updated }   PUT /api/data { data } -> { ok, updated }
module.exports = handler(['GET', 'PUT'], async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method === 'GET') {
    const { rows } = await pool.query('SELECT data, updated_date FROM tiptrack_data WHERE user_id = $1', [user.id]);
    return res.json({ email: user.email, data: rows[0]?.data || null, updated: rows[0]?.updated_date || null });
  }
  const data = req.body.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.shifts) || !Array.isArray(data.rates)) {
    return res.status(400).json({ error: 'Invalid data' });
  }
  const json = JSON.stringify({ rates: data.rates, shifts: data.shifts, brand: data.brand || null });
  if (json.length > 4_000_000) return res.status(413).json({ error: 'Too much data' });
  const { rows } = await pool.query(
    `INSERT INTO tiptrack_data (user_id, data, updated_date) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_date = now() RETURNING updated_date`,
    [user.id, json]);
  res.json({ ok: true, updated: rows[0].updated_date });
});
