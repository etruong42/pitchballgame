// Turns raw per-frame pitch estimates into a steady, responsive pitch track.
//
//  • Volume decides silence. Loud-but-unclear audio holds the last pitch
//    instead of dropping the ball.
//  • Two YIN thresholds: a clean reading (cmnd ≤ strong) is needed to start a
//    note or jump far from the current pitch; once a note is going, weaker
//    readings (cmnd ≤ weak) are accepted if they're close to it.
//  • A far jump must be confirmed by two consecutive agreeing clean readings,
//    so a single octave error or noise pop can't move the ball.
//  • Accepted readings are weighted by how clean they are and smoothed with a
//    One-Euro filter: heavy smoothing on held notes, light on note changes.
//
// All pitches are fractional MIDI note numbers (semitones).

export const TRACK_DEFAULTS = {
  strong: 0.15,      // cmnd at or below this is a clean reading
  weak: 0.35,        // cmnd at or below this is usable if close to the current pitch
  close: 1.0,        // semitones: "close to the current pitch"
  confirmTol: 0.5,   // semitones: two readings "agree"
  offGateRatio: 0.6, // once voiced, stay voiced until volume drops below gate × this
  release: 0.15,     // seconds below the volume gate before the note ends
  holdMax: 0.5,      // seconds of loud-but-unusable audio before giving up the note
  minWeight: 0.25,   // weight of a reading right at the weak threshold
  minCutoff: 1.0,    // One-Euro: Hz of smoothing on a steady note
  beta: 0.5,         // One-Euro: extra Hz per semitone/second of movement
  dCutoff: 1.0,      // One-Euro: Hz smoothing of the speed estimate
};

export class OneEuroFilter {
  constructor(params) {
    this.p = params;
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = 0;
    this.cutoff = this.p.minCutoff;
  }

  static alpha(cutoff, dt) {
    return 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  }

  // `weight` in (0, 1] scales how far this sample can pull the output.
  filter(x, t, weight = 1) {
    if (this.x === null) {
      this.x = x;
      this.t = t;
      return x;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const rawDx = (x - this.x) / dt;
    this.dx += weight * OneEuroFilter.alpha(this.p.dCutoff, dt) * (rawDx - this.dx);
    this.cutoff = this.p.minCutoff + this.p.beta * Math.abs(this.dx);
    this.x += weight * OneEuroFilter.alpha(this.cutoff, dt) * (x - this.x);
    return this.x;
  }
}

export class PitchTracker {
  constructor(params = {}) {
    this.p = { ...TRACK_DEFAULTS, ...params };
    this.euro = new OneEuroFilter(this.p);
    this.reset();
  }

  reset() {
    this.state = 'silent'; // silent | voiced | holding
    this.out = null;
    this.pending = null;   // unconfirmed clean reading (note start or far jump)
    this.quietTime = 0;
    this.unclearTime = 0;
    this.lastT = null;
    this.euro.reset();
  }

  weightFor(cmnd) {
    const { strong, weak, minWeight } = this.p;
    const full = Math.min(0.1, strong);
    if (cmnd <= full) return 1;
    return Math.max(minWeight, 1 - ((cmnd - full) / (weak - full)) * (1 - minWeight));
  }

  // `frame` is AudioEngine.analyze() output, or null while the mic is muted.
  // Returns a record describing the decision (also used by the debug overlay).
  update(frame, t) {
    const dt = this.lastT === null ? 0 : Math.min(0.25, t - this.lastT);
    this.lastT = t;
    const p = this.p;
    const info = {
      t, kind: 'muted', weight: 0,
      raw: frame ? frame.midi : null,
      cmnd: frame ? frame.cmnd : null,
      rms: frame ? frame.rms : null,
      gateOn: frame ? frame.gate : null,
      gateOff: frame ? frame.gate * p.offGateRatio : null,
    };

    // Muted (guide tone playing): no information, so hold everything as is.
    if (!frame) return this.finish(info);

    const active = this.state !== 'silent';
    const loud = frame.rms >= (active ? info.gateOff : info.gateOn);
    const hasPitch = frame.midi !== null;
    const strong = hasPitch && frame.cmnd <= p.strong;
    const weak = hasPitch && frame.cmnd <= p.weak;

    if (!loud) {
      info.kind = 'quiet';
      this.pending = null;
      if (active) {
        this.quietTime += dt;
        if (this.quietTime >= p.release) this.endNote();
      }
      return this.finish(info);
    }
    this.quietTime = 0;

    if (!active) {
      // Starting a note needs two agreeing clean readings.
      if (strong && this.pending !== null && Math.abs(frame.midi - this.pending) <= p.confirmTol) {
        this.euro.reset();
        this.out = this.euro.filter((frame.midi + this.pending) / 2, t, 1);
        this.state = 'voiced';
        this.pending = null;
        this.unclearTime = 0;
        info.kind = 'strong';
        info.weight = 1;
      } else if (strong) {
        this.pending = frame.midi;
        info.kind = 'pending';
      } else {
        this.pending = null;
        info.kind = 'unclear';
      }
      return this.finish(info);
    }

    const isClose = hasPitch && Math.abs(frame.midi - this.out) <= p.close;
    if (isClose && weak) {
      info.weight = this.weightFor(frame.cmnd);
      info.kind = strong ? 'strong' : 'weak';
      this.accept(frame.midi, t, info.weight);
    } else if (strong) {
      // Far from the current pitch: a new note, or a one-off error?
      if (this.pending !== null && Math.abs(frame.midi - this.pending) <= p.confirmTol) {
        info.kind = 'jump';
        info.weight = 1;
        this.accept(frame.midi, t, 1);
      } else {
        this.pending = frame.midi;
        info.kind = 'pending';
        this.unclearTime += dt;
      }
    } else {
      info.kind = 'unclear';
      this.pending = null;
      this.unclearTime += dt;
    }

    if (this.unclearTime >= p.holdMax) this.endNote();
    else if (this.unclearTime > 0) this.state = 'holding';
    return this.finish(info);
  }

  accept(midi, t, weight) {
    this.out = this.euro.filter(midi, t, weight);
    this.pending = null;
    this.unclearTime = 0;
    this.state = 'voiced';
  }

  endNote() {
    this.state = 'silent';
    this.out = null;
    this.pending = null;
    this.quietTime = 0;
    this.unclearTime = 0;
    this.euro.reset();
  }

  finish(info) {
    info.state = this.state;
    info.out = this.out;
    info.cutoff = this.euro.cutoff;
    return info;
  }
}
