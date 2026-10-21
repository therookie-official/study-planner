/* Study Planner - offline, no AI. Data lives on the phone (localStorage). */
const $ = s => document.querySelector(s);
const DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYFULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const KEY = 'studyplanner.v1';

// ---------- state ----------
const defaults = () => ({ slots: [], deadlines: [], goals: [], done: {}, nextId: 1, pdfName: '',
  settings: { lead: 10, morning: '07:00', evening: '21:00' } });
let S = (() => { try { const j = JSON.parse(localStorage.getItem(KEY)); if (j) return Object.assign(defaults(), j); } catch (e) {} return defaults(); })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const newId = () => S.nextId++;

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const t12 = t => { let [h, m] = t.split(':').map(Number); const a = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad(m) + ' ' + a; };
const slotsFor = day => S.slots.filter(s => s.day === day).sort((a, b) => a.start.localeCompare(b.start));
const isDone = (slot, date) => !!S.done[iso(date) + '#' + slot.id];
const dayDiff = (isoStr) => { const [y, m, d] = isoStr.split('-').map(Number); const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(y, m - 1, d) - t) / 864e5); };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2600); }
function modal(html) { const m = $('#modal'); m.innerHTML = '<div class="sheet">' + html + '</div>'; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

// ---------- views ----------
let tab = 'today', weekDay = new Date().getDay();

function weekProgress() {
  let total = 0, done = 0; const now = new Date(); now.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    if (i > 0 || true) for (const s of slotsFor(d.getDay())) { total++; if (isDone(s, d)) done++; }
  }
  return total ? Math.round(done / total * 100) : 0;
}

function vToday() {
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  const list = slotsFor(now.getDay());
  const doneCt = list.filter(s => isDone(s, now)).length;
  const goal = S.goals.find(g => !g.done);
  let nextMarked = false;
  let h = `<h1>${DAYFULL[now.getDay()]}</h1><p class="sub">${now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>`;
  if (goal) h += `<div class="card goal"><div class="sub">🎯 My goal</div><div class="title">${esc(goal.text)}</div></div>`;
  if (!S.slots.length) {
    return h + `<div class="empty">No timetable yet.<br>Import your timetable PDF and I'll organise everything from it.<button class="btn" data-act="import">Import timetable PDF</button></div>`;
  }
  h += `<div class="card"><div class="row"><div class="grow"><b>Today</b> · ${doneCt}/${list.length} done</div><div class="note">Week: ${weekProgress()}%</div></div><div class="bar"><i style="width:${list.length ? doneCt / list.length * 100 : 0}%"></i></div></div>`;
  h += '<h2>Today\'s plan</h2>';
  if (!list.length) h += '<div class="card note">Nothing scheduled today. Enjoy the break (or add a slot in Week).</div>';
  for (const s of list) {
    const st = toMin(s.start), en = toMin(s.end), d = isDone(s, now);
    let badge = '', cls = '';
    if (!d && nm >= st && nm < en) { badge = '<span class="badge">NOW</span>'; cls = 'now'; }
    else if (!d && nm < st && !nextMarked) { badge = '<span class="badge">NEXT</span>'; nextMarked = true; }
    else if (!d && nm >= en) badge = '<span class="badge warn">MISSED</span>';
    h += `<div class="card row ${d ? 'done' : ''} ${cls}"><button class="chk" data-act="toggle" data-id="${s.id}">${d ? '✓' : ''}</button>
      <div class="grow"><div class="title">${esc(s.title)}${badge}</div><div class="time">${t12(s.start)} – ${t12(s.end)}</div></div></div>`;
  }
  const dls = S.deadlines.filter(d => !d.done).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  if (dls.length) { h += '<h2>Upcoming deadlines</h2>'; for (const d of dls) h += dlCard(d, true); }
  return h;
}

function dlCard(d, small) {
  const n = dayDiff(d.date);
  const badge = n < 0 ? `<span class="badge bad">${-n}d overdue</span>` : n === 0 ? '<span class="badge bad">TODAY</span>' : n <= 3 ? `<span class="badge warn">${n}d left</span>` : `<span class="badge">${n}d left</span>`;
  return `<div class="card row ${d.done ? 'done' : ''}"><button class="chk" data-act="dl-toggle" data-id="${d.id}">${d.done ? '✓' : ''}</button>
    <div class="grow"><div class="title">${esc(d.title)}${badge}</div><div class="time">${d.date}${d.time ? ' · ' + t12(d.time) : ''}</div></div>
    ${small ? '' : `<button class="icon" data-act="dl-del" data-id="${d.id}">🗑</button>`}</div>`;
}

function vWeek() {
  let h = '<h1>Weekly timetable</h1><p class="sub">Tap a slot to edit it.</p><div class="chips">';
  for (let i = 0; i < 7; i++) h += `<button class="chip ${i === weekDay ? 'on' : ''}" data-act="day" data-day="${i}">${DAYN[i]}</button>`;
  h += '</div>';
  const list = slotsFor(weekDay);
  if (!list.length) h += '<div class="card note">No slots on ' + DAYFULL[weekDay] + '.</div>';
  for (const s of list) h += `<div class="card row" data-act="edit" data-id="${s.id}"><div class="grow"><div class="title">${esc(s.title)}</div><div class="time">${t12(s.start)} – ${t12(s.end)}</div></div><span class="icon">✎</span></div>`;
  return h + `<button class="btn ghost" data-act="add-slot">+ Add slot</button>`;
}

function vDeadlines() {
  const list = S.deadlines.slice().sort((a, b) => (a.done - b.done) || a.date.localeCompare(b.date));
  let h = '<h1>Deadlines</h1><p class="sub">You get reminders 3 days before, the day before, and on the day.</p>';
  if (!list.length) h += '<div class="card note">No deadlines yet.</div>';
  for (const d of list) h += dlCard(d);
  return h + '<button class="btn" data-act="add-dl">+ Add deadline</button>';
}

function vGoals() {
  let h = '<h1>My goals</h1><p class="sub">Your top unfinished goal shows on the Today screen and in reminders.</p>';
  if (!S.goals.length) h += '<div class="card note">Add what you are working towards, for example "Score 99 percentile in JEE Main".</div>';
  for (const g of S.goals) h += `<div class="card row ${g.done ? 'done' : ''}"><button class="chk" data-act="goal-toggle" data-id="${g.id}">${g.done ? '✓' : ''}</button><div class="grow title">${esc(g.text)}</div><button class="icon" data-act="goal-del" data-id="${g.id}">🗑</button></div>`;
  return h + '<button class="btn" data-act="add-goal">+ Add goal</button>';
}

function vMore() {
  const st = S.settings;
  return `<h1>More</h1>
  <h2>Timetable</h2>
  <div class="card"><div class="title">${S.pdfName ? esc(S.pdfName) : 'No PDF imported'}</div><div class="time">${S.slots.length} slots · ${S.deadlines.length} deadlines</div>
  <button class="btn" data-act="import">Import / replace timetable PDF</button></div>
  <h2>Reminders</h2>
  <div class="card">
    <label>Remind me before each slot</label>
    <select id="s-lead">${[0, 5, 10, 15, 30].map(v => `<option value="${v}" ${st.lead === v ? 'selected' : ''}>${v ? v + ' minutes before' : 'At start time'}</option>`).join('')}</select>
    <div class="two"><div><label>Morning summary</label><input id="s-morning" type="time" value="${st.morning}"></div>
    <div><label>Evening check-in</label><input id="s-evening" type="time" value="${st.evening}"></div></div>
    <button class="btn" data-act="save-settings">Save &amp; reschedule reminders</button>
    <button class="btn ghost" data-act="test-notif">Send test notification</button>
  </div>
  <div class="card note"><b>Vivo phones:</b> to make reminders reliable, open Settings → Battery → Background power consumption → Study Planner → Allow. Also allow Autostart (Settings → Apps → Autostart), and allow notifications and "Alarms &amp; reminders" for this app.</div>
  <h2>Data</h2>
  <button class="btn danger" data-act="wipe">Erase everything</button>`;
}

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#view').innerHTML = { today: vToday, week: vWeek, deadlines: vDeadlines, goals: vGoals, more: vMore }[tab]();
}

// ---------- forms ----------
function slotForm(s) {
  s = s || { day: weekDay, start: '18:00', end: '19:00', title: '' };
  modal(`<h1>${s.id ? 'Edit slot' : 'New slot'}</h1>
    <label>Subject / task</label><input id="f-title" value="${esc(s.title)}" placeholder="Physics - Kinematics">
    <label>Day</label><select id="f-day">${DAYFULL.map((d, i) => `<option value="${i}" ${i === s.day ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <div class="two"><div><label>Start</label><input id="f-start" type="time" value="${s.start}"></div><div><label>End</label><input id="f-end" type="time" value="${s.end}"></div></div>
    <button class="btn" data-act="save-slot" data-id="${s.id || ''}">Save</button>
    ${s.id ? `<button class="btn danger" data-act="del-slot" data-id="${s.id}">Delete</button>` : ''}
    <button class="btn ghost" data-act="close">Cancel</button>`);
}
function dlForm() {
  const t = new Date(); t.setDate(t.getDate() + 7);
  modal(`<h1>New deadline</h1><label>What is due?</label><input id="f-title" placeholder="Maths assignment">
    <div class="two"><div><label>Date</label><input id="f-date" type="date" value="${iso(t)}"></div><div><label>Time (optional)</label><input id="f-time" type="time"></div></div>
    <button class="btn" data-act="save-dl">Save</button><button class="btn ghost" data-act="close">Cancel</button>`);
}
function goalForm() {
  modal(`<h1>New goal</h1><label>Goal</label><input id="f-title" placeholder="Finish Physics NCERT by 30 Nov"><button class="btn" data-act="save-goal">Save</button><button class="btn ghost" data-act="close">Cancel</button>`);
}

// ---------- PDF import ----------
let pending = null;
async function importPdf(file) {
  toast('Reading PDF…');
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const lines = await Parser.extractLines(pdf);
    const res = Parser.parse(lines, new Date());
    pending = { name: file.name, slots: res.slots, deadlines: res.deadlines, raw: lines.map(l => l.text).join('\n') };
    reviewImport();
  } catch (e) { modal(`<h1>Couldn't read that PDF</h1><p class="sub">${esc(e.message || e)}</p><p class="note">Scanned (photo) PDFs have no text to read. Use a PDF exported from a document or spreadsheet, or add slots by hand in the Week tab.</p><button class="btn" data-act="close">OK</button>`); }
}
function reviewImport() {
  const p = pending;
  let h = `<h1>Found ${p.slots.length} slots</h1><p class="sub">${p.deadlines.length} deadlines · remove anything wrong, you can edit the rest later.</p>`;
  if (!p.slots.length) h += `<p class="note">I couldn't find time slots like "6:00 AM - 8:00 AM". Here is the text I could read from the PDF:</p><pre>${esc(p.raw.slice(0, 2500) || '(no text found: this may be a scanned image)')}</pre>`;
  const byDay = {}; p.slots.forEach((s, i) => (byDay[s.day] = byDay[s.day] || []).push([s, i]));
  for (let d = 0; d < 7; d++) if (byDay[d]) {
    h += `<h2>${DAYFULL[d]}</h2>`;
    for (const [s, i] of byDay[d]) h += `<div class="card row"><div class="grow"><div class="title">${esc(s.title)}</div><div class="time">${t12(s.start)} – ${t12(s.end)}</div></div><button class="icon" data-act="imp-rm-slot" data-i="${i}">✕</button></div>`;
  }
  if (p.deadlines.length) h += '<h2>Deadlines</h2>' + p.deadlines.map((d, i) => `<div class="card row"><div class="grow"><div class="title">${esc(d.title)}</div><div class="time">${d.date}</div></div><button class="icon" data-act="imp-rm-dl" data-i="${i}">✕</button></div>`).join('');
  h += p.slots.length || p.deadlines.length ? '<button class="btn" data-act="imp-ok">Use this timetable</button>' : '';
  modal(h + '<button class="btn ghost" data-act="close">Cancel</button>');
}

// ---------- notifications ----------
const LN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && LN);

async function ensurePermission() {
  if (!native) return false;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    if (p.display !== 'granted') { toast('Please allow notifications for reminders'); return false; }
    try { await LN.createChannel({ id: 'reminders', name: 'Study reminders', importance: 5, vibration: true, visibility: 1 }); } catch (e) {}
    try { const x = await LN.checkExactNotificationSetting(); if (x.exact_alarm !== 'granted') await LN.changeExactNotificationSetting(); } catch (e) {}
    return true;
  } catch (e) { return false; }
}

async function reschedule(quiet) {
  if (!native) { if (!quiet) toast('Reminders only work in the installed app'); return; }
  if (!(await ensurePermission())) return;
  try {
    const pend = await LN.getPending();
    if (pend.notifications.length) await LN.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
  } catch (e) {}
  const st = S.settings, out = [], base = { channelId: 'reminders' };
  const goal = S.goals.find(g => !g.done);
  const hm = t => { const [h, m] = t.split(':').map(Number); return { hour: h, minute: m }; };
  for (const s of S.slots) {
    let total = toMin(s.start) - st.lead, day = s.day;
    if (total < 0) { total += 1440; day = (day + 6) % 7; }
    out.push({ ...base, id: 1000 + s.id, title: '📚 ' + s.title, body: (st.lead ? 'Starts in ' + st.lead + ' min' : 'Starting now') + ' · ' + t12(s.start) + ' – ' + t12(s.end),
      schedule: { on: { weekday: day + 1, hour: Math.floor(total / 60), minute: total % 60 }, allowWhileIdle: true } });
  }
  out.push({ ...base, id: 1, title: '☀️ Good morning', body: goal ? 'Goal: ' + goal.text + '. Open your plan for today.' : 'Open your plan for today.', schedule: { on: hm(st.morning), allowWhileIdle: true } });
  out.push({ ...base, id: 2, title: '🌙 Evening check-in', body: 'Mark what you finished today and see what is left.', schedule: { on: hm(st.evening), allowWhileIdle: true } });
  const now = Date.now();
  for (const d of S.deadlines) {
    if (d.done) continue;
    const [y, m, dd] = d.date.split('-').map(Number);
    [[3, 9, 0, 'in 3 days'], [1, 9, 0, 'tomorrow'], [0, 8, 0, 'TODAY']].forEach(([before, hh, mm, when], k) => {
      const at = new Date(y, m - 1, dd - before, hh, mm);
      if (at.getTime() > now) out.push({ ...base, id: 100000 + d.id * 10 + k, title: '⏰ Deadline ' + when, body: d.title + (d.time ? ' · due ' + t12(d.time) : ''), schedule: { at, allowWhileIdle: true } });
    });
  }
  try { await LN.schedule({ notifications: out }); if (!quiet) toast(out.length + ' reminders scheduled'); }
  catch (e) { toast('Could not schedule: ' + (e.message || e)); }
}

async function testNotif() {
  if (!native) return toast('Test works only in the installed app');
  if (!(await ensurePermission())) return;
  await LN.schedule({ notifications: [{ id: 7, channelId: 'reminders', title: '✅ It works', body: 'Reminders are set up on this phone.', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
  toast('Notification arrives in 5 seconds. Close the app to test.');
}

// ---------- events ----------
document.addEventListener('click', async ev => {
  const tb = ev.target.closest('#tabs button');
  if (tb) { tab = tb.dataset.tab; return render(); }
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = +el.dataset.id, val = i => ($('#' + i) || {}).value;
  const today = new Date();
  switch (a) {
    case 'toggle': { const k = iso(today) + '#' + id; if (S.done[k]) delete S.done[k]; else S.done[k] = 1; save(); render(); break; }
    case 'day': weekDay = +el.dataset.day; render(); break;
    case 'add-slot': slotForm(); break;
    case 'edit': slotForm(S.slots.find(s => s.id === id)); break;
    case 'save-slot': {
      const t = val('f-title').trim(), st = val('f-start'), en = val('f-end');
      if (!t || !st || !en) return toast('Fill in name and times');
      if (toMin(en) <= toMin(st)) return toast('End must be after start');
      const rec = { day: +val('f-day'), start: st, end: en, title: t };
      if (id) Object.assign(S.slots.find(s => s.id === id), rec); else S.slots.push({ id: newId(), ...rec });
      save(); closeModal(); weekDay = rec.day; render(); reschedule(true); break;
    }
    case 'del-slot': S.slots = S.slots.filter(s => s.id !== id); save(); closeModal(); render(); reschedule(true); break;
    case 'add-dl': dlForm(); break;
    case 'save-dl': {
      const t = val('f-title').trim(), d = val('f-date'); if (!t || !d) return toast('Add a name and date');
      S.deadlines.push({ id: newId(), title: t, date: d, time: val('f-time') || '', done: false }); save(); closeModal(); render(); reschedule(true); break;
    }
    case 'dl-toggle': { const d = S.deadlines.find(x => x.id === id); d.done = !d.done; save(); render(); reschedule(true); break; }
    case 'dl-del': S.deadlines = S.deadlines.filter(x => x.id !== id); save(); render(); reschedule(true); break;
    case 'add-goal': goalForm(); break;
    case 'save-goal': { const t = val('f-title').trim(); if (!t) return; S.goals.push({ id: newId(), text: t, done: false }); save(); closeModal(); render(); reschedule(true); break; }
    case 'goal-toggle': { const g = S.goals.find(x => x.id === id); g.done = !g.done; save(); render(); reschedule(true); break; }
    case 'goal-del': S.goals = S.goals.filter(x => x.id !== id); save(); render(); reschedule(true); break;
    case 'import': { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,.pdf'; inp.onchange = () => inp.files[0] && importPdf(inp.files[0]); inp.click(); break; }
    case 'imp-rm-slot': pending.slots.splice(+el.dataset.i, 1); reviewImport(); break;
    case 'imp-rm-dl': pending.deadlines.splice(+el.dataset.i, 1); reviewImport(); break;
    case 'imp-ok':
      S.slots = pending.slots.map(s => ({ id: newId(), ...s }));
      for (const d of pending.deadlines) if (!S.deadlines.some(x => x.title === d.title && x.date === d.date)) S.deadlines.push({ id: newId(), ...d, done: false });
      S.pdfName = pending.name; pending = null; save(); closeModal(); tab = 'today'; render(); reschedule(false); break;
    case 'save-settings': S.settings = { lead: +val('s-lead'), morning: val('s-morning') || '07:00', evening: val('s-evening') || '21:00' }; save(); await reschedule(false); break;
    case 'test-notif': testNotif(); break;
    case 'wipe': if (confirm('Erase all timetable, goals and progress from this phone?')) { S = defaults(); save(); render(); reschedule(true); } break;
    case 'close': closeModal(); break;
  }
});

render();
setInterval(() => { if (tab === 'today' && $('#modal').hidden) render(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
if (S.slots.length) reschedule(true);
