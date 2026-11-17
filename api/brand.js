// GET /api/brand?url=example.com
// Reads a company website and returns { name, logo, primary, accent, background, source }.
// Uses Claude to choose the palette when ANTHROPIC_API_KEY is set; otherwise a color-frequency heuristic.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

async function get(url, ms = 8000, max = 600_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,text/css,*/*' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    return { text: text.slice(0, max), finalUrl: r.url };
  } finally { clearTimeout(t); }
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : '';
};
const metaContent = (html, key) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const n = (attr(tag, 'name') || attr(tag, 'property')).toLowerCase();
    if (n === key) return attr(tag, 'content');
  }
  return '';
};
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&[a-z]+;/gi, ' ').trim();

// ---- color math ----
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('');
  h = h.slice(0, 6);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
const colorful = rgb => { const [, s, l] = hsl(rgb); return s > 0.28 && l > 0.12 && l < 0.85; };
const hueDist = (a, b) => { const d = Math.abs(hsl(a)[0] - hsl(b)[0]); return Math.min(d, 360 - d); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function parseColor(str) {
  str = str.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(str) && [4, 5, 7, 9].includes(str.length)) return hexToRgb(str);
  const m = str.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    if (m[4] !== undefined) { const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); if (a < 0.5) return null; }
    return [+m[1], +m[2], +m[3]];
  }
  return null;
}

function countColors(css, counts, weight = 1) {
  const re = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))/g;
  let m;
  while ((m = re.exec(css))) {
    const rgb = parseColor(m[1]);
    if (!rgb) continue;
    // Colors used as backgrounds/fills/borders on buttons, headers, links count more
    const ctx = css.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
    let w = weight;
    if (/background|fill|--[a-z-]*(primary|brand|main|accent)/.test(ctx)) w *= 2;
    const hex = rgbToHex(rgb);
    counts.set(hex, (counts.get(hex) || 0) + w);
  }
}

function heuristic(themeColor, counts) {
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex, n]) => ({ hex, rgb: hexToRgb(hex), n }));
  const vivid = ranked.filter(c => colorful(c.rgb));
  let primary = themeColor && colorful(hexToRgb(themeColor)) ? hexToRgb(themeColor) : vivid[0]?.rgb;
  if (!primary) {
    // Monochrome site: use the darkest frequent color for a sleek look
    const dark = ranked.find(c => hsl(c.rgb)[2] < 0.3);
    primary = dark ? dark.rgb : [17, 24, 39];
  }
  let accent = vivid.find(c => hueDist(c.rgb, primary) > 35)?.rgb
    || vivid.find(c => Math.abs(hsl(c.rgb)[2] - hsl(primary)[2]) > 0.2)?.rgb;
  if (!accent) { const [h] = hsl(primary); accent = hslToRgb((h + 40) % 360, 0.85, 0.55); }
  const background = rgbToHex(mix(primary, [255, 255, 255], 0.94));
  return { primary: rgbToHex(primary), accent: rgbToHex(accent), background };
}
function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

async function askClaude(payload) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `You are styling a mobile tip-tracking app so it feels like it belongs to this company. Using the data scraped from the company's website, choose a palette.

Return ONLY JSON: {"name": string, "primary": "#rrggbb", "accent": "#rrggbb", "background": "#rrggbb"}
- name: the company's short brand name as customers know it (no taglines).
- primary: the main brand color, used for the header bar and primary buttons (white or black text sits on it).
- accent: a secondary brand color that contrasts with primary, used for highlights and chart bars.
- background: a very light page background (or very dark if the brand is clearly dark-themed) that harmonizes with primary.

Website data:
${JSON.stringify(payload, null, 1)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = data.content?.map(c => c.text || '').join('') || '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const hex = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
    if (!hex(json.primary)) return null;
    return { name: typeof json.name === 'string' ? json.name.slice(0, 40) : null, primary: hex(json.primary), accent: hex(json.accent), background: hex(json.background) };
  } catch { return null; } finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 's-maxage=86400, stale-while-revalidate');
  let input = String(req.query.url || '').trim();
  if (!input) return res.status(400).json({ error: 'Enter a website address' });
  if (!/^https?:\/\//i.test(input)) input = 'https://' + input;
  let target;
  try { target = new URL(input); } catch { return res.status(400).json({ error: "That doesn't look like a website address" }); }
  if (!/\./.test(target.hostname) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(target.hostname)) {
    return res.status(400).json({ error: "That doesn't look like a public website" });
  }

  let html, base;
  try { ({ text: html, finalUrl: base } = await get(target.href)); }
  catch { return res.status(502).json({ error: "Couldn't reach that website (it may block automated visitors)" }); }

  // Name
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  let name = decode(metaContent(html, 'og:site_name') || metaContent(html, 'application-name') || '')
    || title.split(/\s[|\-–—:·]\s/)[0].trim()
    || target.hostname.replace(/^www\./, '').split('.')[0];
  name = name.slice(0, 40);

  // Logo: apple-touch-icon > largest icon > google favicon service
  const links = html.match(/<link\b[^>]*>/gi) || [];
  let logo = '';
  const icons = links.filter(l => /rel\s*=\s*["']?[^"'>]*icon/i.test(l)).map(l => ({
    href: attr(l, 'href'), rel: attr(l, 'rel').toLowerCase(), size: parseInt((attr(l, 'sizes').match(/\d+/) || [0])[0], 10),
  })).filter(i => i.href && !i.rel.includes('mask'));
  icons.sort((a, b) => (b.rel.includes('apple') - a.rel.includes('apple')) || b.size - a.size);
  if (icons[0]) { try { logo = new URL(icons[0].href, base).href; } catch {} }
  if (!logo) logo = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(base).hostname)}&sz=128`;

  // Colors
  const counts = new Map();
  const themeColor = parseColor(metaContent(html, 'theme-color') || '') ? rgbToHex(parseColor(metaContent(html, 'theme-color'))) : '';
  const tile = metaContent(html, 'msapplication-tilecolor');
  if (parseColor(tile || '')) counts.set(rgbToHex(parseColor(tile)), 40);
  for (const s of html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []) countColors(s, counts, 1);
  for (const s of html.match(/style\s*=\s*"[^"]*"/gi) || []) countColors(s, counts, 2);
  const sheets = links.filter(l => /rel\s*=\s*["']?stylesheet/i.test(l)).map(l => attr(l, 'href')).filter(Boolean).slice(0, 4);
  await Promise.all(sheets.map(async href => {
    try { const { text } = await get(new URL(href, base).href, 5000, 800_000); countColors(text, counts, 1); } catch {}
  }));
  if (themeColor) counts.set(themeColor, (counts.get(themeColor) || 0) + 100);

  const guess = heuristic(themeColor, counts);
  const topColors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([hex, n]) => ({ hex, weight: Math.round(n) }));
  const description = decode(metaContent(html, 'description') || metaContent(html, 'og:description') || '').slice(0, 300);

  const ai = await askClaude({ url: base, title, siteName: name, description, themeColor: themeColor || null, mostUsedColors: topColors, heuristicGuess: guess });
  const result = ai
    ? { name: ai.name || name, primary: ai.primary, accent: ai.accent || guess.accent, background: ai.background || guess.background, logo, source: 'ai' }
    : { name, ...guess, logo, source: 'heuristic' };
  res.status(200).json(result);
};
