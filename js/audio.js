// Microphone pitch detection (YIN) and a simple guide-tone synth.

import { freqToMidi, midiToFreq } from './music.js';

const MIN_FREQ = 65;   // ~C2
const MAX_FREQ = 1100; // ~C#6

// YIN pitch estimator. Returns { freq, cmnd } or null if the buffer is too short.
// `cmnd` is the cumulative-mean-normalised difference at the chosen period:
// ~0 for a perfectly periodic signal, rising towards 1 as noise takes over
// (roughly 1 / (1 + SNR)). Deciding whether to trust the estimate is left to
// the caller (see pitchtrack.js).
// `threshold` only steers which period is picked: the first dip below it,
// which avoids octave errors; with no such dip, the deepest dip (as in the
// original YIN paper).
export function yin(buf, sampleRate, threshold = 0.15) {
  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const tauMax = Math.min(Math.floor(sampleRate / MIN_FREQ), Math.floor(buf.length / 2));
  const W = buf.length - tauMax;
  if (W < 64) return null;

  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalised difference.
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    tau = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (cmnd[t] < cmnd[tau]) tau = t;
  }

  // Parabolic interpolation around the minimum.
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
    const denom = a + c - 2 * b;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }
  return { freq: sampleRate / better, cmnd: cmnd[tau] };
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this.buf = null;
    this.muteUntil = 0;
    this.voices = new Set(); // sounding notes, so they can be cut off
  }

  ensureContext() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async startMic() {
    this.ensureContext();
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
  }

  stopMic() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.analyser = null;
  }

  // Analyse the latest audio. Returns null while the mic is muted (or not
  // running), otherwise { rms, gate, midi, freq, cmnd } with no judgement
  // applied: midi/freq are null only when no estimate is possible.
  // `sensitivity` in [0,1]: higher means a lower volume gate.
  analyze(sensitivity = 0.5) {
    if (!this.analyser) return null;
    if (this.ctx.currentTime < this.muteUntil) return null;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    const gate = 0.04 * Math.pow(10, -2 * sensitivity); // 0.04 .. 0.0004
    const res = yin(this.buf, this.ctx.sampleRate);
    const valid = res && res.freq >= MIN_FREQ && res.freq <= MAX_FREQ;
    return {
      rms, gate,
      freq: valid ? res.freq : null,
      midi: valid ? freqToMidi(res.freq) : null,
      cmnd: res ? res.cmnd : 1,
    };
  }

  // Play a short guide tone. If muteMic is set, pitch reading is suspended
  // while it sounds so the speaker doesn't "sing" for the player.
  playTone(midi, duration = 0.35, volume = 0.18, muteMic = true) {
    const ctx = this.ensureContext();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(midi);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
    if (muteMic) this.muteUntil = Math.max(this.muteUntil, t0 + duration + 0.06);
  }

  // A sustained melody note (for the track demo): quick attack, held, short release.
  playNote(midi, duration, volume = 0.16, muteMic = true) {
    const ctx = this.ensureContext();
    const t0 = ctx.currentTime;
    const end = t0 + Math.max(0.12, duration);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(midi);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.linearRampToValueAtTime(volume * 0.7, t0 + 0.12);
    gain.gain.setValueAtTime(volume * 0.7, end - 0.06);
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(end + 0.02);
    const voice = { osc, gain };
    this.voices.add(voice);
    osc.onended = () => this.voices.delete(voice);
    if (muteMic) this.muteUntil = Math.max(this.muteUntil, end + 0.06);
  }

  // Fade out every sounding melody note (e.g. when a demo is skipped).
  stopNotes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const { osc, gain } of this.voices) {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.04);
      osc.stop(t + 0.05);
    }
    this.voices.clear();
    this.muteUntil = Math.min(this.muteUntil, t + 0.1);
  }

  playChime(good, muteMic = true) {
    const ctx = this.ensureContext();
    const t0 = ctx.currentTime;
    const freqs = good ? [880, 1320] : [180, 120];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = good ? 'sine' : 'sawtooth';
      osc.frequency.value = f;
      const s = t0 + i * 0.06;
      gain.gain.setValueAtTime(0, s);
      gain.gain.linearRampToValueAtTime(good ? 0.08 : 0.06, s + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(s);
      osc.stop(s + 0.2);
    });
    if (muteMic) this.muteUntil = Math.max(this.muteUntil, t0 + 0.28);
  }
}
