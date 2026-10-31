// Post-song review: a note-by-note strip and a pitch trace per line, plus
// tips about sharp/flat habits. Works on the plain data from makeReview()
// in main.js, so nothing here touches the 3D scene.
import { midiToName } from './music.js';

export const NEAR_CENTS = 100;  // only samples within a semitone count towards sharp/flat lean
const BIAS = 10;     // an average lean this size (cents) is worth mentioning
const SPLIT = 12;    // high vs low notes must differ by this much
const LEAP = 12;     // average over/undershoot on jumps worth mentioning
const DRIFT = 10;    // held notes sagging/rising by this much
const LEAP_SEMIS = 3; // a "jump" is at least this many semitones

const COLORS = { perfect: '#5ee08a', great: '#9be86b', good: '#ffcc33', miss: '#ff6070', silent: '#6b7394' };

// Accuracy class for one note.
export function grade(n) {
  if (!n.passed) return 'miss';
  if (!n.voiced) return 'silent';
  return n.cents < 15 ? 'perfect' : n.cents < 35 ? 'great' : 'good';
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
export const fmtCents = c => { const r = Math.round(c); return `${r >= 0 ? '+' : '−'}${Math.abs(r)}¢`; };
const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// The average sharp (+) / flat (−) lean over notes sung close to pitch.
export function overallLean(r) {
  const ws = r.notes.filter(n => n.signed !== null);
  return ws.length ? mean(ws.map(n => n.signed)) : null;
}

// Per-line summary used for the cards and to find the weakest line.
export function lineStats(r, ph) {
  const ns = r.notes.slice(ph.first, ph.last + 1);
  const first = ns.filter(n => n.firstTry).length;
  const voiced = ns.filter(n => n.voiced);
  const cents = voiced.length ? mean(voiced.map(n => n.cents)) : null;
  const leaning = ns.filter(n => n.signed !== null);
  const lean = leaning.length ? mean(leaning.map(n => n.signed)) : null;
  // 0 is a perfect line; misses weigh most, then average error.
  const trouble = (ns.length - first) / ns.length + (cents === null ? 1 : Math.min(1, cents / 100));
  return { ns, first, cents, lean, trouble };
}

// Habits worth telling the singer about, as plain sentences.
export function tendencyTips(r) {
  const tips = [];
  const ws = r.notes.filter(n => n.signed !== null);
  if (ws.length < 3) {
    return ['Not enough notes were sung close to pitch to spot any habits yet.'];
  }
  const all = mean(ws.map(n => n.signed));
  if (all <= -BIAS) tips.push(`Overall you sing a little flat (${fmtCents(all)} on average). Aim for the top of each note.`);
  else if (all >= BIAS) tips.push(`Overall you sing a little sharp (${fmtCents(all)} on average). Relax and let each note settle.`);

  // High notes against low notes.
  if (r.maxMidi - r.minMidi >= 4) {
    const cut = (r.minMidi + r.maxMidi) / 2;
    const high = ws.filter(n => n.midi > cut), low = ws.filter(n => n.midi < cut);
    if (high.length >= 2 && low.length >= 2) {
      const h = mean(high.map(n => n.signed)), l = mean(low.map(n => n.signed));
      const vs = `(${fmtCents(h)} on high notes, ${fmtCents(l)} on low ones)`;
      if (h - l <= -SPLIT && h <= -BIAS) tips.push(`You go flat on the high notes ${vs}. Keep the breath flowing as you go up.`);
      else if (h - l >= SPLIT && h >= BIAS) tips.push(`You go sharp on the high notes ${vs}. Don't push; let them float.`);
      else if (l - h <= -SPLIT && l <= -BIAS) tips.push(`You go flat on the low notes ${vs}. Keep them bright rather than letting them drop.`);
      else if (l - h >= SPLIT && l >= BIAS) tips.push(`You go sharp on the low notes ${vs}. Let them sit lower and relaxed.`);
    }
  }

  // Jumps: positive means past the note in the jump's direction.
  const up = [], down = [];
  r.notes.forEach((n, k) => {
    if (!k || n.signed === null) return;
    const jump = n.midi - r.notes[k - 1].midi;
    if (jump >= LEAP_SEMIS) up.push(n.signed);
    else if (jump <= -LEAP_SEMIS) down.push(-n.signed);
  });
  if (up.length >= 2) {
    const u = mean(up);
    if (u >= LEAP) tips.push(`You overshoot upward jumps (landing ${Math.round(u)}¢ above the note). Hear the target before you leap.`);
    else if (u <= -LEAP) tips.push(`You fall short on upward jumps (landing ${Math.round(-u)}¢ under the note). Reach all the way up.`);
  }
  if (down.length >= 2) {
    const d = mean(down);
    if (d >= LEAP) tips.push(`You overshoot downward jumps (landing ${Math.round(d)}¢ below the note).`);
    else if (d <= -LEAP) tips.push(`You don't drop far enough on downward jumps (landing ${Math.round(-d)}¢ above the note).`);
  }

  // Long notes that sag or creep up while held.
  const drifts = r.notes.filter(n => n.drift !== null).map(n => n.drift);
  if (drifts.length >= 2) {
    const d = mean(drifts);
    if (d <= -DRIFT) tips.push(`Long notes sag flat as you hold them (${fmtCents(d)} from start to end). Keep the air steady to the end.`);
    else if (d >= DRIFT) tips.push(`Long notes creep sharp as you hold them (${fmtCents(d)} from start to end).`);
  }

  if (!tips.length) tips.push('No sharp or flat habits stood out. Your pitch was even throughout.');
  return tips;
}

// Results body: tips plus one card per line. onPractice(k) is called with the
// phrase index when its "Practise" button is pressed (omit it to hide them).
export function renderReview(root, r, { onPractice } = {}) {
  const stats = r.phrases.map(ph => lineStats(r, ph));
  let worst = -1;
  if (r.phrases.length > 1) {
    stats.forEach((s, k) => { if (s.trouble > 0.35 && (worst < 0 || s.trouble > stats[worst].trouble)) worst = k; });
  }
  const tips = tendencyTips(r);
  if (worst >= 0) tips.push(`Line ${worst + 1} (“${r.phrases[worst].text}”) gave you the most trouble. Practise it below.`);

  let html = `<section class="res-tips"><h3>What to work on</h3><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
  html += '<section class="res-review"><h3>Note by note</h3>';
  html += '<p class="res-legend"><span class="perfect">within 15¢</span><span class="great">within 35¢</span><span class="good">cleared</span><span class="miss">missed</span>'
    + '<span class="trace-key">your pitch</span></p>';
  r.phrases.forEach((ph, k) => {
    const s = stats[k];
    const bits = [`${s.first}/${s.ns.length} first try`];
    if (s.cents !== null) bits.push(`±${Math.round(s.cents)}¢`);
    if (s.lean !== null && Math.abs(s.lean) >= BIAS) bits.push(s.lean < 0 ? `leans flat ${fmtCents(s.lean)}` : `leans sharp ${fmtCents(s.lean)}`);
    html += `<div class="res-line${k === worst ? ' weak' : ''}">`
      + '<div class="res-line-head">'
      + `<span class="res-line-text"><b>${r.phrases.length > 1 ? `${k + 1}.` : ''}</b> ${esc(ph.text)}${k === worst ? ' <em>needs work</em>' : ''}</span>`
      + `<span class="res-line-stats">${esc(bits.join(' · '))}</span>`
      + (onPractice ? `<button type="button" class="ghost small" data-practice="${k}">Practise ▸</button>` : '')
      + '</div>'
      + `<canvas class="res-trace" data-phrase="${k}" aria-label="Your pitch against the target notes for line ${k + 1}"></canvas>`
      + `<div class="res-chips">${s.ns.map(chipHtml).join('')}</div>`
      + '</div>';
  });
  html += '</section>';
  root.innerHTML = html;
  if (onPractice) {
    root.querySelectorAll('[data-practice]').forEach(b => b.addEventListener('click', () => onPractice(Number(b.dataset.practice))));
  }
  drawTraces(root, r);
}

function chipHtml(n) {
  const g = grade(n);
  const syl = n.held ? '~' : n.syllable || midiToName(n.midi);
  let val;
  if (!n.voiced) val = '—';
  else if (n.signed !== null) val = fmtCents(n.signed);
  else val = n.signedAll < 0 ? '↓ low' : '↑ high';
  const tries = n.attempts ? `<i>↻${n.attempts}</i>` : '';
  const title = `${midiToName(n.midi)}: ${!n.passed ? 'missed' : n.firstTry ? 'cleared first try' : `cleared after ${n.attempts} ${n.attempts === 1 ? 'retry' : 'retries'}`}`
    + (n.voiced ? `, average ${Math.round(n.cents)}¢ off` : ', not sung')
    + (n.signed !== null ? ` (${n.signed < 0 ? 'flat' : 'sharp'} ${fmtCents(n.signed)})` : '');
  return `<span class="chip ${g}" title="${esc(title)}"><b>${esc(syl)}</b><small>${midiToName(n.midi)}</small><span>${val}${tries}</span></span>`;
}

// Pitch traces: each target note as a band as tall as the hole allows,
// running the length of the note (brighter where the wall is), with the sung
// pitch as a line on top.
export function drawTraces(root, r) {
  for (const cv of root.querySelectorAll('canvas.res-trace')) {
    drawTrace(cv, r, r.phrases[Number(cv.dataset.phrase)]);
  }
}

function drawTrace(cv, r, ph) {
  const ns = r.notes.slice(ph.first, ph.last + 1);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 600, H = cv.clientHeight || 90;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  const pts = ns.flatMap(n => n.trace);
  let x0 = ns[0].dStart - r.beatLen * 0.8, x1 = ns[ns.length - 1].dNoteEnd;
  for (const p of pts) x0 = Math.min(x0, p.d);
  const midis = ns.map(n => n.midi);
  const lo = Math.min(...midis) - 2, hi = Math.max(...midis) + 2;
  const pad = 6;
  const X = d => pad + (d - x0) / (x1 - x0) * (W - 2 * pad);
  const Y = m => pad + (hi - Math.min(hi, Math.max(lo, m))) / (hi - lo) * (H - 2 * pad);

  // Target bands.
  const half = Math.max(0.12, r.tol);
  for (const n of ns) {
    const c = COLORS[grade(n)];
    const xa = X(n.dStart), xw = Math.max(xa + 3, X(n.dEnd)), xb = Math.max(xw, X(n.dNoteEnd) - 2);
    const top = Y(n.midi + half), h = Y(n.midi - half) - top;
    g.fillStyle = c;
    g.globalAlpha = 0.16;
    g.fillRect(xa, top, xb - xa, h);
    g.globalAlpha = 0.4;
    g.fillRect(xa, top, xw - xa, h);
    g.globalAlpha = 0.9;
    g.fillRect(xa, Y(n.midi) - 1, xb - xa, 2);
    g.globalAlpha = 1;
  }

  // Sung pitch, broken where the singer was silent.
  g.strokeStyle = '#eef1ff';
  g.lineWidth = 2;
  g.lineJoin = g.lineCap = 'round';
  g.beginPath();
  let pen = false, prevD = -Infinity;
  for (const p of pts) {
    if (p.m === null || p.d - prevD > r.beatLen) pen = false;
    prevD = p.d;
    if (p.m === null) continue;
    const x = X(p.d), y = Y(p.m);
    if (pen) g.lineTo(x, y); else g.moveTo(x, y);
    pen = true;
  }
  g.stroke();
}
