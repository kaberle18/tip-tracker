/* TipTrack — tips, hours and effective hourly pay. Data lives in localStorage. */
(() => {
  'use strict';

  const KEY = 'tiptrack:v1';
  const DEFAULT_BRAND = { name: 'TipTrack', primary: '#0f766e', accent: '#f59e0b', background: '#f6f7f9', logo: '' };

  // ---------- storage ----------
  const blank = () => ({ rates: [], shifts: [], clock: null, brand: { ...DEFAULT_BRAND } });
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const s = JSON.parse(raw);
      return { ...blank(), ...s, brand: { ...DEFAULT_BRAND, ...(s.brand || {}) } };
    } catch { return blank(); }
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { toast('Could not save — browser storage is unavailable'); }
  }

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const round2 = n => Math.round(n * 100) / 100;
  const money = (n, cents = true) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const hrs = n => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = s => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: parseYmd(s).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
  }

  // Rate in effect on a given date (latest effective <= date). Falls back to earliest rate.
  function rateOn(dateStr) {
    const sorted = [...state.rates].sort((a, b) => a.effective.localeCompare(b.effective));
    let r = null;
    for (const x of sorted) if (x.effective <= dateStr) r = x;
    return r ? r.rate : (sorted[0]?.rate ?? 0);
  }

  const shiftTips = s => num(s.cashTips) + num(s.cardTips);
  const shiftBase = s => num(s.hours) * num(s.baseRate);
  const shiftTotal = s => shiftTips(s) + shiftBase(s);

  function summarize(shifts) {
    const hours = shifts.reduce((a, s) => a + num(s.hours), 0);
    const tips = shifts.reduce((a, s) => a + shiftTips(s), 0);
    const base = shifts.reduce((a, s) => a + shiftBase(s), 0);
    const total = tips + base;
    return {
      hours, tips, base, total, count: shifts.length,
      effective: hours ? total / hours : 0,
      tipsPerHr: hours ? tips / hours : 0,
      baseAvg: hours ? base / hours : 0,
      perShift: shifts.length ? total / shifts.length : 0,
    };
  }

  // ---------- period ----------
  function startOfWeek(d) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; }
  function periodRange() {
    const p = $('#periodSelect').value;
    const now = new Date();
    const t = today();
    switch (p) {
      case 'today': return [t, t];
      case 'week': return [ymd(startOfWeek(now)), t];
      case 'lastweek': { const s = startOfWeek(now); s.setDate(s.getDate() - 7); const e = new Date(s); e.setDate(e.getDate() + 6); return [ymd(s), ymd(e)]; }
      case 'month': return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), t];
      case '30': { const s = new Date(now); s.setDate(s.getDate() - 29); return [ymd(s), t]; }
      case 'year': return [`${now.getFullYear()}-01-01`, t];
      case 'custom': return [$('#rangeFrom').value || '0000-01-01', $('#rangeTo').value || '9999-12-31'];
      default: return ['0000-01-01', '9999-12-31'];
    }
  }
  const inRange = (s, [a, b]) => s.date >= a && s.date <= b;

  // ---------- rendering ----------
  function applyBrand() {
    const b = state.brand;
    const root = document.documentElement.style;
    root.setProperty('--brand', b.primary);
    root.setProperty('--brand-ink', inkFor(b.primary));
    root.setProperty('--accent', b.accent);
    root.setProperty('--bg', b.background || DEFAULT_BRAND.background);
    const dark = luminance(b.background || '#ffffff') < 0.25;
    root.setProperty('--surface', dark ? mix(b.background, '#ffffff', 0.08) : '#ffffff');
    root.setProperty('--text', dark ? '#f3f4f6' : '#111827');
    root.setProperty('--muted', dark ? '#a1a1aa' : '#6b7280');
    root.setProperty('--line', dark ? 'rgba(255,255,255,.12)' : '#e5e7eb');
    $('meta[name=theme-color]').setAttribute('content', b.primary);
    $('#brandName').textContent = b.name || 'TipTrack';
    document.title = (b.name && b.name !== 'TipTrack') ? `${b.name} · TipTrack` : 'TipTrack';
    const logo = $('#brandLogo');
    if (b.logo) { logo.src = b.logo; logo.hidden = false; logo.onerror = () => (logo.hidden = true); }
    else logo.hidden = true;
    $('#manName').value = b.name || '';
    $('#manPrimary').value = toHex6(b.primary);
    $('#manAccent').value = toHex6(b.accent);
    $('#manBg').value = toHex6(b.background || DEFAULT_BRAND.background);
  }

  function renderStats() {
    const range = periodRange();
    const s = summarize(state.shifts.filter(x => inRange(x, range)));
    $('#statEffective').textContent = money(s.effective);
    $('#statEffectiveSub').textContent = s.hours ? `${money(s.total)} over ${hrs(s.hours)} hours` : 'No hours logged in this period';
    $('#statTips').textContent = money(s.tips);
    $('#statTipsHr').textContent = `${money(s.tipsPerHr)}/hr in tips`;
    $('#statHours').textContent = hrs(s.hours);
    $('#statShifts').textContent = `${s.count} shift${s.count === 1 ? '' : 's'}`;
    $('#statBase').textContent = money(s.base);
    $('#statBaseAvg').textContent = `avg ${money(s.baseAvg)}/hr`;
    $('#statTotal').textContent = money(s.total);
    $('#statPerShift').textContent = `${money(s.perShift)} per shift`;

    const all = summarize(state.shifts);
    $('#runningTotals').innerHTML = `
      <div><span class="label">Total tips</span><b>${money(all.tips)}</b></div>
      <div><span class="label">Total hours</span><b>${hrs(all.hours)}</b></div>
      <div><span class="label">Total earned</span><b>${money(all.total)}</b></div>
      <div><span class="label">Avg hourly</span><b>${money(all.effective)}</b></div>`;
    renderChart();
  }

  function renderChart() {
    const weeks = [];
    const start = startOfWeek(new Date());
    for (let i = 7; i >= 0; i--) {
      const s = new Date(start); s.setDate(s.getDate() - i * 7);
      const e = new Date(s); e.setDate(e.getDate() + 6);
      const sum = summarize(state.shifts.filter(x => inRange(x, [ymd(s), ymd(e)])));
      weeks.push({ label: s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), ...sum });
    }
    const max = Math.max(1, ...weeks.map(w => w.total));
    const W = 640, H = 200, padL = 8, padB = 22, padT = 18;
    const bw = (W - padL * 2) / weeks.length;
    const bars = weeks.map((w, i) => {
      const x = padL + i * bw + bw * 0.18, width = bw * 0.64;
      const hBase = (w.base / max) * (H - padB - padT);
      const hTips = (w.tips / max) * (H - padB - padT);
      const yBase = H - padB - hBase, yTips = yBase - hTips;
      const tip = `${w.label}: ${money(w.total)} (${money(w.effective)}/hr)`;
      return `<g><title>${esc(tip)}</title>
        <rect x="${x}" y="${yBase}" width="${width}" height="${hBase}" rx="3" fill="var(--brand)"/>
        <rect x="${x}" y="${yTips}" width="${width}" height="${hTips}" rx="3" fill="var(--accent)"/>
        ${w.total ? `<text class="axis" x="${x + width / 2}" y="${yTips - 5}" text-anchor="middle">${money(w.total, false)}</text>` : ''}
        <text class="axis" x="${x + width / 2}" y="${H - 6}" text-anchor="middle">${esc(w.label)}</text></g>`;
    }).join('');
    $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly earnings">
      <line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="var(--line)"/>${bars}</svg>`;
  }

  function renderShifts() {
    const rows = [...state.shifts].sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
    $('#emptyShifts').hidden = rows.length > 0;
    $('#shiftRows').innerHTML = rows.map(s => {
      const total = shiftTotal(s), eff = num(s.hours) ? total / num(s.hours) : 0;
      const tipsDetail = [num(s.cashTips) ? `cash ${money(num(s.cashTips))}` : '', num(s.cardTips) ? `card ${money(num(s.cardTips))}` : ''].filter(Boolean).join(' · ');
      return `<tr>
        <td><b>${esc(fmtDate(s.date))}</b>${s.start && s.end ? `<div class="sub">${esc(s.start)}–${esc(s.end)}</div>` : ''}${s.note ? `<div class="sub">${esc(s.note)}</div>` : ''}</td>
        <td>${hrs(num(s.hours))}</td>
        <td>${money(num(s.baseRate))}</td>
        <td>${money(shiftTips(s))}${tipsDetail ? `<div class="sub">${tipsDetail}</div>` : ''}</td>
        <td>${money(total)}</td>
        <td><b>${money(eff)}</b></td>
        <td class="actions"><button class="icon-btn" data-edit="${s.id}">Edit</button><button class="icon-btn del" data-del="${s.id}">Delete</button></td>
      </tr>`;
    }).join('');
  }

  function renderRates() {
    const sorted = [...state.rates].sort((a, b) => b.effective.localeCompare(a.effective));
    const currentId = sorted.find(r => r.effective <= today())?.id;
    $('#rateList').innerHTML = sorted.length ? sorted.map(r => `
      <li><span><b>${money(r.rate)}/hr</b> <span class="muted small">from ${esc(fmtDate(r.effective))}</span>${r.id === currentId ? '<span class="current">CURRENT</span>' : ''}</span>
      <button class="icon-btn del" data-delrate="${r.id}">Remove</button></li>`).join('')
      : '<li class="muted small">No base rate yet — add yours above so hourly averages include it.</li>';
  }

  function renderClock() {
    const c = state.clock;
    const card = $('.clock-card');
    card.classList.toggle('on', !!c && !c.breakStart);
    card.classList.toggle('onbreak', !!c?.breakStart);
    $('#btnClockIn').hidden = !!c;
    $('#btnClockOut').hidden = !c;
    $('#btnBreak').hidden = !c;
    $('#btnBreak').textContent = c?.breakStart ? 'End break' : 'Start break';
    $('#clockStatus').textContent = !c ? 'Off the clock' : c.breakStart ? 'On break' : 'On the clock';
    const rate = rateOn(today());
    if (c) {
      const ms = workedMs();
      const h = ms / 3.6e6;
      $('#clockMeta').textContent = `Since ${hhmm(new Date(c.start))} · base so far ${money(h * rate)} @ ${money(rate)}/hr`;
    } else {
      $('#clockMeta').textContent = state.rates.length ? `Base rate: ${money(rate)}/hr` : 'Set your base rate in Settings';
    }
    tick();
  }
  function workedMs() {
    const c = state.clock; if (!c) return 0;
    const now = Date.now();
    const brk = (c.breakMs || 0) + (c.breakStart ? now - c.breakStart : 0);
    return Math.max(0, now - new Date(c.start).getTime() - brk);
  }
  function tick() {
    const ms = workedMs();
    const s = Math.floor(ms / 1000);
    $('#clockTime').textContent = `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }

  function renderAll() { applyBrand(); renderClock(); renderStats(); renderShifts(); renderRates(); }

  // ---------- tabs ----------
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${t.dataset.view}`));
    window.scrollTo({ top: 0 });
  }));

  // ---------- period ----------
  $('#periodSelect').addEventListener('change', e => {
    $('#customRange').hidden = e.target.value !== 'custom';
    if (e.target.value === 'custom' && !$('#rangeFrom').value) {
      const s = new Date(); s.setDate(s.getDate() - 13);
      $('#rangeFrom').value = ymd(s); $('#rangeTo').value = today();
    }
    renderStats();
  });
  $('#rangeFrom').addEventListener('change', renderStats);
  $('#rangeTo').addEventListener('change', renderStats);

  // ---------- clock ----------
  $('#btnClockIn').addEventListener('click', () => {
    state.clock = { start: new Date().toISOString(), breakMs: 0, breakStart: null };
    save(); renderClock();
    if (!state.rates.length) toast('Tip: add your base rate in Settings');
  });
  $('#btnBreak').addEventListener('click', () => {
    const c = state.clock; if (!c) return;
    if (c.breakStart) { c.breakMs = (c.breakMs || 0) + (Date.now() - c.breakStart); c.breakStart = null; }
    else c.breakStart = Date.now();
    save(); renderClock();
  });
  const dlg = $('#clockOutDialog');
  $('#btnClockOut').addEventListener('click', () => {
    const c = state.clock; if (!c) return;
    const f = $('#clockOutForm');
    const h = round2(workedMs() / 3.6e6);
    const startD = new Date(c.start);
    f.hours.value = h;
    f.baseRate.value = rateOn(ymd(startD));
    f.cashTips.value = ''; f.cardTips.value = ''; f.note.value = '';
    $('#coSummary').textContent = `${hhmm(startD)} – ${hhmm(new Date())} · ${hrs(h)} hours worked${c.breakMs ? ` (breaks excluded)` : ''}`;
    dlg.showModal();
    setTimeout(() => f.cashTips.focus(), 50);
  });
  $('#coCancel').addEventListener('click', () => dlg.close());
  $('#coDiscard').addEventListener('click', () => {
    state.clock = null; save(); dlg.close(); renderClock(); toast('Shift discarded');
  });
  $('#clockOutForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, c = state.clock; if (!c) return dlg.close();
    const startD = new Date(c.start);
    state.shifts.push({
      id: uid(), date: ymd(startD), start: hhmm(startD), end: hhmm(new Date()),
      hours: round2(num(f.hours.value)), baseRate: num(f.baseRate.value),
      cashTips: round2(num(f.cashTips.value)), cardTips: round2(num(f.cardTips.value)), note: f.note.value.trim(),
    });
    state.clock = null; save(); dlg.close(); renderAll(); toast('Shift saved');
  });
  setInterval(() => { if (state.clock) { tick(); if (Date.now() % 15000 < 1000) renderClock(); } }, 1000);

  // ---------- shift form ----------
  const sf = $('#shiftForm');
  let editingId = null;
  function resetShiftForm() {
    editingId = null; sf.reset();
    sf.date.value = today(); sf.baseRate.value = state.rates.length ? rateOn(today()) : '';
    $('#shiftFormTitle').textContent = 'Log a shift'; $('#btnCancelEdit').hidden = true;
  }
  sf.date.addEventListener('change', () => { if (!editingId && state.rates.length) sf.baseRate.value = rateOn(sf.date.value); });
  function autoHours() {
    if (!sf.start.value || !sf.end.value) return;
    const [h1, m1] = sf.start.value.split(':').map(Number), [h2, m2] = sf.end.value.split(':').map(Number);
    let mins = h2 * 60 + m2 - (h1 * 60 + m1); if (mins < 0) mins += 1440;
    sf.hours.value = round2(mins / 60);
  }
  sf.start.addEventListener('change', autoHours);
  sf.end.addEventListener('change', autoHours);
  sf.addEventListener('submit', e => {
    e.preventDefault();
    const rec = {
      date: sf.date.value, start: sf.start.value, end: sf.end.value,
      hours: round2(num(sf.hours.value)), baseRate: num(sf.baseRate.value),
      cashTips: round2(num(sf.cashTips.value)), cardTips: round2(num(sf.cardTips.value)), note: sf.note.value.trim(),
    };
    if (editingId) Object.assign(state.shifts.find(s => s.id === editingId), rec);
    else state.shifts.push({ id: uid(), ...rec });
    save(); toast(editingId ? 'Shift updated' : 'Shift saved'); resetShiftForm(); renderAll();
  });
  $('#btnCancelEdit').addEventListener('click', resetShiftForm);
  $('#shiftRows').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) {
      const s = state.shifts.find(x => x.id === ed.dataset.edit); if (!s) return;
      editingId = s.id;
      for (const k of ['date', 'start', 'end', 'hours', 'baseRate', 'note']) sf[k].value = s[k] ?? '';
      sf.cashTips.value = num(s.cashTips) || ''; sf.cardTips.value = num(s.cardTips) || '';
      $('#shiftFormTitle').textContent = 'Edit shift'; $('#btnCancelEdit').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (del) {
      if (del.dataset.confirm !== '1') { del.dataset.confirm = '1'; del.textContent = 'Confirm?'; setTimeout(() => { del.dataset.confirm = ''; del.textContent = 'Delete'; }, 3000); return; }
      state.shifts = state.shifts.filter(x => x.id !== del.dataset.del); save(); renderAll(); toast('Shift deleted');
    }
  });

  // ---------- rates ----------
  $('#rateForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    state.rates = state.rates.filter(r => r.effective !== f.effective.value);
    state.rates.push({ id: uid(), rate: num(f.rate.value), effective: f.effective.value });
    save(); f.reset(); f.effective.value = today(); renderAll(); resetShiftForm(); toast('Base rate saved');
  });
  $('#rateList').addEventListener('click', e => {
    const b = e.target.closest('[data-delrate]'); if (!b) return;
    state.rates = state.rates.filter(r => r.id !== b.dataset.delrate); save(); renderAll();
  });

  // ---------- branding ----------
  $('#brandForm').addEventListener('submit', async e => {
    e.preventDefault();
    const url = e.target.url.value.trim(); if (!url) return;
    const btn = $('#btnBrand'), st = $('#brandStatus');
    btn.disabled = true; btn.textContent = 'Reading site…'; st.textContent = 'Fetching the website and picking out its colors…';
    try {
      const r = await fetch(`/api/brand?url=${encodeURIComponent(url)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not read that site');
      state.brand = {
        name: data.name || state.brand.name, primary: data.primary || DEFAULT_BRAND.primary,
        accent: data.accent || DEFAULT_BRAND.accent, background: data.background || DEFAULT_BRAND.background, logo: data.logo || '',
      };
      save(); applyBrand(); renderStats();
      st.innerHTML = `Styled to match <b>${esc(state.brand.name)}</b><span class="swatches"><i style="background:${esc(state.brand.primary)}"></i><i style="background:${esc(state.brand.accent)}"></i><i style="background:${esc(state.brand.background)}"></i></span> ${data.source === 'ai' ? '· picked by AI' : ''} — fine-tune below if needed.`;
    } catch (err) {
      st.textContent = `${err.message}. You can still set the colors by hand below.`;
    } finally { btn.disabled = false; btn.textContent = 'Customize'; }
  });
  $('#manName').addEventListener('input', e => { state.brand.name = e.target.value; save(); applyBrand(); });
  $('#manPrimary').addEventListener('input', e => { state.brand.primary = e.target.value; save(); applyBrand(); });
  $('#manAccent').addEventListener('input', e => { state.brand.accent = e.target.value; save(); applyBrand(); });
  $('#manBg').addEventListener('input', e => { state.brand.background = e.target.value; save(); applyBrand(); });
  $('#btnResetBrand').addEventListener('click', () => { state.brand = { ...DEFAULT_BRAND }; save(); applyBrand(); $('#brandStatus').textContent = 'Back to the default look.'; });

  // ---------- data ----------
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  $('#btnExport').addEventListener('click', () => {
    const head = ['Date', 'Start', 'End', 'Hours', 'Base rate', 'Base pay', 'Cash tips', 'Card tips', 'Total tips', 'Total earned', 'Effective $/hr', 'Note'];
    const rows = [...state.shifts].sort((a, b) => a.date.localeCompare(b.date)).map(s => {
      const t = shiftTotal(s);
      return [s.date, s.start, s.end, num(s.hours), num(s.baseRate), round2(shiftBase(s)), num(s.cashTips), num(s.cardTips), round2(shiftTips(s)), round2(t), num(s.hours) ? round2(t / num(s.hours)) : 0, s.note];
    });
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    download(`tips-${today()}.csv`, csv, 'text/csv');
  });
  $('#btnBackup').addEventListener('click', () => download(`tiptrack-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json'));
  $('#restoreFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const s = JSON.parse(await file.text());
      if (!Array.isArray(s.shifts) || !Array.isArray(s.rates)) throw new Error();
      state = { ...blank(), ...s, brand: { ...DEFAULT_BRAND, ...(s.brand || {}) } };
      save(); renderAll(); resetShiftForm(); toast('Backup restored');
    } catch { toast('That file is not a TipTrack backup'); }
    e.target.value = '';
  });
  $('#btnWipe').addEventListener('click', e => {
    const b = e.currentTarget;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again to erase everything'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Erase all data'; }, 4000); return; }
    state = blank(); save(); renderAll(); resetShiftForm(); b.dataset.confirm = ''; b.textContent = 'Erase all data'; toast('All data erased');
  });

  // ---------- color utils ----------
  function toHex6(c) {
    if (!c) return '#000000';
    c = c.trim();
    if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(x => x + x).join('');
    if (/^#[0-9a-f]{6}/i.test(c)) return c.slice(0, 7);
    const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = c; return ctx.fillStyle.startsWith('#') ? ctx.fillStyle : '#000000';
  }
  function rgb(c) { const h = toHex6(c); return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
  function luminance(c) {
    const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function inkFor(c) { return luminance(c) > 0.45 ? '#111827' : '#ffffff'; }
  function mix(a, b, t) { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

  // ---------- init ----------
  $('#rateForm').effective.value = today();
  resetShiftForm();
  renderAll();
})();
