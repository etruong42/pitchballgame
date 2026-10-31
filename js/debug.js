// Live pitch-detection debug overlay: what the detector hears each frame and
// what the tracker decided to do with it.

import { midiToName } from './music.js';

const WINDOW_S = 5;
const STATS_S = 2;
export const KIND_COLORS = {
  strong: '#5ee08a',  // clean reading, used at full weight
  weak: '#ffcc33',    // weaker reading, used (down-weighted) because it was close
  jump: '#4fd1ff',    // confirmed jump to a far pitch
  pending: '#b48cff', // clean but far reading, waiting for confirmation
  unclear: '#ff6070', // loud but unusable: pitch held
  quiet: '#6b7394',   // below the volume gate
  muted: '#8a5cff',   // mic paused for a guide tone
};

function noteLabel(m) {
  if (m === null || m === undefined) return '—';
  const n = Math.round(m);
  const c = Math.round((m - n) * 100);
  return `${midiToName(n)} ${c >= 0 ? '+' : '−'}${Math.abs(c)}¢`;
}

const dB = v => (v > 0 ? 20 * Math.log10(v) : -120);

export class PitchDebugOverlay {
  constructor(root, params) {
    this.root = root;
    this.params = params; // live tracker params (thresholds)
    this.canvas = root.querySelector('canvas');
    this.text = root.querySelector('.debug-text');
    this.ctx = this.canvas.getContext('2d');
    this.entries = [];
    this.center = null;
    this.frameTimes = [];
  }

  clear() {
    this.entries.length = 0;
    this.center = null;
  }

  push(info, target, sung) {
    this.entries.push({ ...info, target, sung });
    this.frameTimes.push(info.t);
    const cutoff = info.t - WINDOW_S;
    while (this.entries.length && this.entries[0].t < cutoff) this.entries.shift();
    while (this.frameTimes.length && this.frameTimes[0] < info.t - 1) this.frameTimes.shift();
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const last = this.entries[this.entries.length - 1];
    if (!last) { this.text.textContent = 'Waiting for audio…'; return; }

    const now = last.t;
    const left = 34;
    const xOf = t => left + (1 - (now - t) / WINDOW_S) * (w - left - 4);
    const pitchH = Math.round(h * 0.56), cmndH = Math.round(h * 0.2), levelH = h - pitchH - cmndH;
    const panels = [
      { y: 0, h: pitchH }, { y: pitchH, h: cmndH }, { y: pitchH + cmndH, h: levelH },
    ];
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    for (const pnl of panels) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(left, pnl.y + 2, w - left - 4, pnl.h - 4);
    }

    // --- Pitch panel: centre on what's being heard, else on the target.
    const want = last.out ?? last.raw ?? last.target;
    if (want !== null && want !== undefined) {
      if (this.center === null || Math.abs(want - this.center) > 5) this.center = want;
      else this.center += (want - this.center) * 0.05;
    }
    const span = 12;
    const lo = (this.center ?? 60) - span / 2;
    const p0 = panels[0];
    const yOfPitch = m => p0.y + p0.h - 3 - ((m - lo) / span) * (p0.h - 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'right';
    for (let m = Math.ceil(lo); m <= lo + span; m++) {
      const y = yOfPitch(m);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - 4, y); ctx.stroke();
      if (m % 2 === 0) ctx.fillText(midiToName(m), left - 4, y);
    }
    // Target (moved into the plotted octave so it stays visible with octave folding).
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(120,170,255,0.9)';
    ctx.beginPath();
    let started = false;
    for (const e of this.entries) {
      if (e.target === null || e.target === undefined) { started = false; continue; }
      const tgt = e.target + 12 * Math.round(((this.center ?? e.target) - e.target) / 12);
      const x = xOf(e.t), y = yOfPitch(tgt);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Raw readings, coloured by decision.
    for (const e of this.entries) {
      if (e.raw === null) continue;
      const y = yOfPitch(e.raw);
      if (y < p0.y || y > p0.y + p0.h) continue;
      ctx.fillStyle = KIND_COLORS[e.kind] || '#fff';
      ctx.globalAlpha = e.kind === 'quiet' ? 0.35 : 0.9;
      ctx.fillRect(xOf(e.t) - 1.5, y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    // Filtered output.
    this.line(e => (e.out === null ? null : yOfPitch(e.out)), xOf, '#ffffff', 2);

    // --- CMND panel (0 … 0.6), with the strong / weak thresholds.
    const p1 = panels[1];
    const cmndMax = 0.6;
    const yOfCmnd = v => p1.y + 3 + (Math.min(v, cmndMax) / cmndMax) * (p1.h - 6);
    this.hline(yOfCmnd(this.params.strong), KIND_COLORS.strong, left, w);
    this.hline(yOfCmnd(this.params.weak), KIND_COLORS.weak, left, w);
    this.line(e => (e.cmnd === null ? null : yOfCmnd(e.cmnd)), xOf, '#e7ecff', 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('CMND', left - 4, p1.y + p1.h / 2);

    // --- Level panel (dB), with the volume gate on / off levels.
    const p2 = panels[2];
    const dbLo = -80, dbHi = -10;
    const yOfDb = v => p2.y + p2.h - 3 - ((Math.max(dbLo, Math.min(dbHi, v)) - dbLo) / (dbHi - dbLo)) * (p2.h - 6);
    if (last.gateOn) {
      this.hline(yOfDb(dB(last.gateOn)), '#ffffff', left, w);
      this.hline(yOfDb(dB(last.gateOff)), '#888fb0', left, w);
    }
    this.line(e => (e.rms === null ? null : yOfDb(dB(e.rms))), xOf, '#9fd0ff', 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('dB', left - 4, p2.y + p2.h / 2);
    // Muted stretches.
    ctx.fillStyle = 'rgba(138,92,255,0.18)';
    for (const e of this.entries) if (e.kind === 'muted') ctx.fillRect(xOf(e.t) - 2, 0, 4, h);

    this.renderText(last);
  }

  line(yFn, xOf, color, width) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (const e of this.entries) {
      const y = yFn(e);
      if (y === null) { started = false; continue; }
      const x = xOf(e.t);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  hline(y, color, left, w) {
    const { ctx } = this;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - 4, y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  renderText(e) {
    const p = this.params;
    const recent = this.entries.filter(x => x.t >= e.t - STATS_S);
    const counts = {};
    for (const x of recent) counts[x.kind] = (counts[x.kind] || 0) + 1;
    const pct = k => `${Math.round(((counts[k] || 0) / recent.length) * 100)}%`;
    const fps = this.frameTimes.length;
    const hz = e.raw === null ? '' : ` (${(440 * 2 ** ((e.raw - 69) / 12)).toFixed(1)} Hz)`;
    this.text.innerHTML = [
      `<b>${e.state}</b> · frame: <span style="color:${KIND_COLORS[e.kind]}">${e.kind}</span>${e.weight ? ` (weight ${e.weight.toFixed(2)})` : ''}`,
      `raw ${noteLabel(e.raw)}${hz} → filtered ${noteLabel(e.out)} · cutoff ${e.cutoff.toFixed(1)} Hz`,
      `CMND ${e.cmnd === null ? '—' : e.cmnd.toFixed(3)} (clean ≤ ${p.strong}, usable ≤ ${p.weak})`,
      `level ${e.rms === null ? '—' : dB(e.rms).toFixed(0)} dB (gate on ${e.gateOn ? dB(e.gateOn).toFixed(0) : '—'} / off ${e.gateOff ? dB(e.gateOff).toFixed(0) : '—'} dB)`,
      `last ${STATS_S}s: ${['strong', 'weak', 'jump', 'pending', 'unclear', 'quiet', 'muted']
        .filter(k => counts[k]).map(k => `<span style="color:${KIND_COLORS[k]}">${k} ${pct(k)}</span>`).join(' · ')} · ${fps} fps`,
    ].join('<br>');
  }
}
