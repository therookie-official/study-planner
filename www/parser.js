/* Timetable PDF parser. Works fully offline.
   Supports: day sections ("Monday" then lines with times), "Mon-Sat" ranges, "Daily",
   grids with days as columns, and grids with days as rows. Also picks up deadlines. */
(function (root) {
  const DAY_IDX = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
    thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
  const DAY_WORD = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)';
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const T = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?';
  const RANGE_RE = new RegExp(T + '\\s*(?:-|–|—|to|till|until)\\s*' + T, 'i');
  const RANGE_G = new RegExp(RANGE_RE.source, 'ig');
  const DAY_START = new RegExp('^\\s*' + DAY_WORD + '\\b\\.?\\s*(?:(?:-|–|—|to)\\s*' + DAY_WORD + '\\b\\.?)?\\s*[:\\-–—|]?\\s*(.*)$', 'i');

  const ALL = [0, 1, 2, 3, 4, 5, 6];
  const pad = n => String(n).padStart(2, '0');
  const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const mer = s => (s ? (s[0].toLowerCase() === 'p' ? 'pm' : 'am') : null);

  function dayRange(a, b) {
    const s = DAY_IDX[a.toLowerCase()], e = DAY_IDX[b.toLowerCase()];
    const out = [];
    for (let d = s, n = 0; n < 7; n++, d = (d + 1) % 7) { out.push(d); if (d === e) break; }
    return out;
  }

  // Turn a regex match of a time range into [startMin, endMin] or null
  function resolveRange(m) {
    let h1 = +m[1], m1 = m[2] ? +m[2] : 0, a1 = mer(m[3]);
    let h2 = +m[4], m2 = m[5] ? +m[5] : 0, a2 = mer(m[6]);
    if (!(m[2] || m[5] || m[3] || m[6])) return null;      // bare "1-3" is probably "chapter 1-3"
    if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) return null;
    if (h1 === 0 && !a1) { /* 00:xx 24h */ }
    const to24 = (h, a) => (a === 'pm' ? (h % 12) + 12 : a === 'am' ? h % 12 : h);
    let s, e;
    if (a1 || a2) {
      if (!a1) a1 = (a2 === 'pm' && (h1 <= h2 || h1 === 12)) ? 'pm' : (a2 === 'pm' ? 'am' : a2);
      if (!a2) a2 = a1;
      s = to24(h1, a1) * 60 + m1; e = to24(h2, a2) * 60 + m2;
    } else {
      const guess = h => (h >= 1 && h <= 5) || h === 12 ? (h % 12) + 12 : h; // study hours: 1-5 => pm
      s = (h1 >= 13 ? h1 : guess(h1)) * 60 + m1;
      e = (h2 >= 13 ? h2 : guess(h2)) * 60 + m2;
      if (h1 >= 13 || h2 >= 13) { s = h1 * 60 + m1; e = h2 * 60 + m2; }
    }
    if (e <= s) e += 12 * 60;
    if (e <= s || e > 24 * 60 + 59) return null;
    return [s, Math.min(e, 24 * 60 - 1)];
  }

  function cleanTitle(t) {
    return t.replace(/^[\s|:\-–—•·*>▪■□☐✓✔\[\]()]+/, '').replace(/[\s|:\-–—•·]+$/, '').replace(/\s{2,}/g, ' ').trim();
  }

  // ---- Group PDF text items into lines (browser: pdf.js doc) ----
  async function extractLines(pdf) {
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      let cur = null;
      for (const it of items) {
        if (cur && Math.abs(cur.y - it.y) <= 3) cur.items.push(it);
        else { cur = { y: it.y, items: [it], page: p }; lines.push(cur); }
      }
    }
    for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' '); }
    return lines;
  }

  function parseDate(text, today) {
    let m, y, mo, d;
    if ((m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/))) { d = +m[1]; mo = +m[2] - 1; y = +m[3]; if (y < 100) y += 2000; }
    else if ((m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?,?\s*(\d{4})?\b/i))) { d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = m[3] ? +m[3] : null; }
    else if ((m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/i))) { mo = MONTHS[m[1].toLowerCase()]; d = +m[2]; y = m[3] ? +m[3] : null; }
    else return null;
    if (!y) { y = today.getFullYear(); const t = new Date(y, mo, d); if (t < new Date(today.getTime() - 30 * 864e5)) y++; }
    const dt = new Date(y, mo, d);
    if (isNaN(dt) || dt.getMonth() !== mo) return null;
    return { iso: y + '-' + pad(mo + 1) + '-' + pad(d), matched: m[0] };
  }

  function parse(lines, today) {
    today = today || new Date();
    const slots = [], deadlines = [];
    const seen = new Set();
    const addSlot = (day, r, title) => {
      title = cleanTitle(title) || 'Study';
      const key = day + '|' + r[0] + '|' + title.toLowerCase();
      if (seen.has(key)) return; seen.add(key);
      slots.push({ day, start: hhmm(r[0]), end: hhmm(r[1]), title });
    };

    let curDays = null, colHead = null, rowTimes = null;

    for (const line of lines) {
      const text = line.text;

      // deadlines
      if (/deadline|due\b|submit|submission|last date|exam on|test on/i.test(text)) {
        const dd = parseDate(text, today);
        if (dd) deadlines.push({ title: cleanTitle(text.replace(dd.matched, '')) || 'Deadline', date: dd.iso, time: '' });
      }

      // header with many day names => column grid (days across the top)
      const dayItems = line.items.filter(i => new RegExp('^' + DAY_WORD + '\\b\\.?$', 'i').test(i.str));
      if (dayItems.length >= 3 && !RANGE_RE.test(text)) {
        colHead = dayItems.map(i => ({ day: DAY_IDX[i.str.replace('.', '').toLowerCase()], x: i.x + i.w / 2 }));
        rowTimes = null; curDays = null; continue;
      }

      // header with many time ranges => row grid (times across the top)
      const ranges = [];
      for (const it of line.items) { const m = it.str.match(RANGE_RE); if (m) { const r = resolveRange(m); if (r) ranges.push({ r, x: it.x + it.w / 2 }); } }
      if (ranges.length >= 3) { rowTimes = ranges; colHead = null; curDays = null; continue; }

      // row grid: first item is a day, following items are cells under time headers
      if (rowTimes) {
        const first = line.items[0];
        const dm = first && first.str.match(new RegExp('^' + DAY_WORD + '\\b', 'i'));
        if (dm) {
          const day = DAY_IDX[dm[1].toLowerCase()];
          for (const it of line.items.slice(1)) {
            if (/^(-|–|—|break|lunch|free|off)$/i.test(it.str)) continue;
            let best = null, bd = 1e9;
            for (const c of rowTimes) { const d = Math.abs(c.x - (it.x + it.w / 2)); if (d < bd) { bd = d; best = c; } }
            if (best) addSlot(day, best.r, it.str);
          }
          continue;
        }
      }

      // column grid: first range item is the time label, other items fall under day columns
      if (colHead) {
        const tIdx = line.items.findIndex(i => { const m = i.str.match(RANGE_RE); return m && resolveRange(m); });
        if (tIdx >= 0) {
          const r = resolveRange(line.items[tIdx].str.match(RANGE_RE));
          const spacing = colHead.length > 1 ? Math.abs(colHead[1].x - colHead[0].x) : 80;
          const left = Math.min.apply(null, colHead.map(c => c.x)) - spacing / 2;
          const rest = line.items.filter((_, i) => i !== tIdx).filter(i => i.x + i.w / 2 >= left);
          for (const it of rest) {
            if (/^(-|–|—|break|lunch|free|off)$/i.test(it.str)) continue;
            let best = null, bd = 1e9;
            for (const c of colHead) { const d = Math.abs(c.x - (it.x + it.w / 2)); if (d < bd) { bd = d; best = c; } }
            if (best && bd <= spacing * 0.75) addSlot(best.day, r, it.str);
          }
          continue;
        }
      }

      // list mode
      let rest = text;
      const dm = text.match(DAY_START);
      if (dm) {
        curDays = dm[2] ? dayRange(dm[1], dm[2]) : [DAY_IDX[dm[1].toLowerCase()]];
        rest = dm[3] || '';
        colHead = null; rowTimes = null;
      } else if (/^\s*(daily|every ?day|all days)\b/i.test(text)) {
        curDays = ALL; rest = text.replace(/^\s*(daily|every ?day|all days)\b[\s:\-–—|]*/i, '');
      }
      const rm = rest.match(RANGE_RE);
      if (rm) {
        const r = resolveRange(rm);
        if (r) {
          const title = rest.replace(rm[0], ' ');
          // days written inline after the time e.g. "6-8 PM Mon, Wed Physics"
          addSlotForDays(curDays || ALL, r, title);
        }
      }
    }

    function addSlotForDays(days, r, title) { for (const d of days) addSlot(d, r, title); }

    slots.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
    return { slots, deadlines };
  }

  const api = { extractLines, parse, parseDate, resolveRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);
