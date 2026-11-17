// GET /api/manifest?u=<userId>&v=<n>&name=<company>&color=<hex> -> web app manifest
module.exports = (req, res) => {
  const name = String(req.query.name || 'TipTrack').slice(0, 40);
  const color = /^#[0-9a-f]{6}$/i.test(req.query.color || '') ? req.query.color : '#0f766e';
  const u = /^[0-9a-f-]{36}$/i.test(req.query.u || '') ? req.query.u : '';
  const v = encodeURIComponent(String(req.query.v || '0'));
  const icon = u ? `/api/icon?u=${u}&v=${v}` : null;
  res.setHeader('content-type', 'application/manifest+json');
  res.setHeader('cache-control', 'public, max-age=300');
  res.status(200).json({
    name: name === 'TipTrack' ? 'TipTrack' : `${name} · TipTrack`, short_name: name, start_url: '/', display: 'standalone',
    background_color: '#ffffff', theme_color: color,
    icons: icon ? [{ src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' }]
                : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
};
