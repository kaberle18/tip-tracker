// GET /api/logo-proxy?url=https://... — fetches a company logo so the browser
// can draw it onto a canvas (same-origin) to build the home-screen icon.
const MAX = 3_000_000;
module.exports = async (req, res) => {
  let u;
  try { u = new URL(String(req.query.url || '')); } catch { return res.status(400).end(); }
  if (!/^https?:$/.test(u.protocol) || !/\./.test(u.hostname) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(u.hostname)) return res.status(400).end();
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(u.href, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 TipTrack icon fetcher', accept: 'image/*' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type)) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) return res.status(413).end();
    res.setHeader('content-type', type);
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=86400');
    res.status(200).send(buf);
  } catch { res.status(502).end(); } finally { clearTimeout(t); }
};
