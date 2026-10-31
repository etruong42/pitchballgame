// Music theory helpers: note names, scales, songs and target-sequence generation.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToName(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

// Root pitch class (0-11) + octave number -> MIDI number. C4 = 60.
export function rootMidi(rootPc, octave) {
  return 12 * (octave + 1) + rootPc;
}

export const SCALES = {
  major:           { name: 'Major',            steps: [0, 2, 4, 5, 7, 9, 11] },
  naturalMinor:    { name: 'Natural minor',    steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor:   { name: 'Harmonic minor',   steps: [0, 2, 3, 5, 7, 8, 11] },
  melodicMinor:    { name: 'Melodic minor',    steps: [0, 2, 3, 5, 7, 9, 11] },
  dorian:          { name: 'Dorian',           steps: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian:      { name: 'Mixolydian',       steps: [0, 2, 4, 5, 7, 9, 10] },
  majorPentatonic: { name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  minorPentatonic: { name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  blues:           { name: 'Blues',            steps: [0, 3, 5, 6, 7, 10] },
  chromatic:       { name: 'Chromatic',        steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

// Modes a (major-key) song can be re-harmonised into. Only 7-note scales,
// so every major scale degree has a counterpart.
export const SONG_MODES = ['major', 'naturalMinor', 'harmonicMinor', 'dorian', 'mixolydian'];

// Songs are written as [semitones above the tonic of a major key, beats].
// Negative offsets are notes below the tonic. `lyrics` follow the format of
// parseLyrics() below: one syllable per note.
export const SONGS = {
  mary: {
    name: 'Mary Had a Little Lamb',
    lyrics: "Ma-ry had a lit-tle lamb, / lit-tle lamb, lit-tle lamb, / Ma-ry had a lit-tle lamb, / its fleece was white as snow.",
    notes: [
      [4, 1], [2, 1], [0, 1], [2, 1], [4, 1], [4, 1], [4, 2],
      [2, 1], [2, 1], [2, 2], [4, 1], [7, 1], [7, 2],
      [4, 1], [2, 1], [0, 1], [2, 1], [4, 1], [4, 1], [4, 1], [4, 1],
      [2, 1], [2, 1], [4, 1], [2, 1], [0, 4],
    ],
  },
  twinkle: {
    name: 'Twinkle Twinkle Little Star',
    lyrics: "Twin-kle, twin-kle, lit-tle star, / how I won-der what you are. / Up a-bove the world so high, / like a dia-mond in the sky. / Twin-kle, twin-kle, lit-tle star, / how I won-der what you are.",
    notes: [
      [0, 1], [0, 1], [7, 1], [7, 1], [9, 1], [9, 1], [7, 2],
      [5, 1], [5, 1], [4, 1], [4, 1], [2, 1], [2, 1], [0, 2],
      [7, 1], [7, 1], [5, 1], [5, 1], [4, 1], [4, 1], [2, 2],
      [7, 1], [7, 1], [5, 1], [5, 1], [4, 1], [4, 1], [2, 2],
      [0, 1], [0, 1], [7, 1], [7, 1], [9, 1], [9, 1], [7, 2],
      [5, 1], [5, 1], [4, 1], [4, 1], [2, 1], [2, 1], [0, 2],
    ],
  },
  hotCrossBuns: {
    name: 'Hot Cross Buns',
    lyrics: "Hot cross buns, / hot cross buns, / one a pen-ny, two a pen-ny, / hot cross buns!",
    notes: [
      [4, 1], [2, 1], [0, 2], [4, 1], [2, 1], [0, 2],
      [0, 0.5], [0, 0.5], [0, 0.5], [0, 0.5], [2, 0.5], [2, 0.5], [2, 0.5], [2, 0.5],
      [4, 1], [2, 1], [0, 2],
    ],
  },
  odeToJoy: {
    name: 'Ode to Joy',
    lyrics: "Joy-ful, joy-ful, we a-dore Thee, / God of glo-ry, Lord of love; / Hearts un-fold like flow'rs be-fore Thee, / op'-ning to the sun a-bove.",
    notes: [
      [4, 1], [4, 1], [5, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 1],
      [0, 1], [0, 1], [2, 1], [4, 1], [4, 1.5], [2, 0.5], [2, 2],
      [4, 1], [4, 1], [5, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 1],
      [0, 1], [0, 1], [2, 1], [4, 1], [2, 1.5], [0, 0.5], [0, 2],
    ],
  },
  frereJacques: {
    name: 'Frère Jacques',
    lyrics: "Are you sleep-ing, are you sleep-ing, / Bro-ther John, Bro-ther John? / Morn-ing bells are ring-ing, morn-ing bells are ring-ing, / ding, dang, dong, ding, dang, dong.",
    notes: [
      [0, 1], [2, 1], [4, 1], [0, 1], [0, 1], [2, 1], [4, 1], [0, 1],
      [4, 1], [5, 1], [7, 2], [4, 1], [5, 1], [7, 2],
      [7, 0.5], [9, 0.5], [7, 0.5], [5, 0.5], [4, 1], [0, 1],
      [7, 0.5], [9, 0.5], [7, 0.5], [5, 0.5], [4, 1], [0, 1],
      [0, 1], [-5, 1], [0, 2], [0, 1], [-5, 1], [0, 2],
    ],
  },
  rowYourBoat: {
    name: 'Row, Row, Row Your Boat',
    lyrics: "Row, row, row your boat, / gent-ly down the stream. / Mer-ri-ly, mer-ri-ly, mer-ri-ly, mer-ri-ly, / life is but a dream.",
    notes: [
      [0, 1.5], [0, 1.5], [0, 1], [2, 0.5], [4, 1.5],
      [4, 1], [2, 0.5], [4, 1], [5, 0.5], [7, 3],
      [12, 0.5], [12, 0.5], [12, 0.5], [7, 0.5], [7, 0.5], [7, 0.5],
      [4, 0.5], [4, 0.5], [4, 0.5], [0, 0.5], [0, 0.5], [0, 0.5],
      [7, 1], [5, 0.5], [4, 1], [2, 0.5], [0, 3],
    ],
  },
  londonBridge: {
    name: 'London Bridge',
    lyrics: "Lon-don Bridge is fall-ing down, / fall-ing down, fall-ing down. / Lon-don Bridge is fall-ing down, / my fair la-dy.",
    notes: [
      [7, 1.5], [9, 0.5], [7, 1], [5, 1], [4, 1], [5, 1], [7, 2],
      [2, 1], [4, 1], [5, 2], [4, 1], [5, 1], [7, 2],
      [7, 1.5], [9, 0.5], [7, 1], [5, 1], [4, 1], [5, 1], [7, 2],
      [2, 2], [7, 2], [4, 1], [0, 3],
    ],
  },
  happyBirthday: {
    name: 'Happy Birthday',
    lyrics: "Hap-py birth-day to you, / hap-py birth-day to you, / hap-py birth-day dear (name) _ / hap-py birth-day to you!",
    notes: [
      [-5, 0.75], [-5, 0.25], [-3, 1], [-5, 1], [0, 1], [-1, 2],
      [-5, 0.75], [-5, 0.25], [-3, 1], [-5, 1], [2, 1], [0, 2],
      [-5, 0.75], [-5, 0.25], [7, 1], [4, 1], [0, 1], [-1, 1], [-3, 2],
      [5, 0.75], [5, 0.25], [4, 1], [0, 1], [2, 1], [0, 2],
    ],
  },
  oldMacDonald: {
    name: 'Old MacDonald',
    lyrics: "Old Mac-Don-ald had a farm, / E-I-E-I-O! / And on that farm he had a cow, / E-I-E-I-O!",
    notes: [
      [0, 1], [0, 1], [0, 1], [-5, 1], [-3, 1], [-3, 1], [-5, 2],
      [4, 1], [4, 1], [2, 1], [2, 1], [0, 3], [-5, 1],
      [0, 1], [0, 1], [0, 1], [-5, 1], [-3, 1], [-3, 1], [-5, 2],
      [4, 1], [4, 1], [2, 1], [2, 1], [0, 4],
    ],
  },
  amazingGrace: {
    // 3/4 time; tied notes ("me—", "see—") are written as one long note.
    name: 'Amazing Grace',
    lyrics: "A-ma-zing _ grace how sweet the sound / that saved a _ wretch like me. / I once was _ lost but now am found, / was blind but _ now I see.",
    notes: [
      [-5, 1],                                  // A-
      [0, 2], [4, 0.5], [0, 0.5], [4, 2], [2, 1], // -ma-zing grace how
      [0, 2], [-3, 1], [-5, 2], [-5, 1],          // sweet the sound that
      [0, 2], [4, 0.5], [0, 0.5], [4, 2], [2, 1], // saved a wretch like
      [7, 5], [4, 1],                             // me, I
      [7, 2], [4, 0.5], [0, 0.5], [4, 2], [2, 1], // once was lost but
      [0, 2], [-3, 1], [-5, 2], [-5, 1],          // now am found, was
      [0, 2], [4, 0.5], [0, 0.5], [4, 2], [2, 1], // blind but now I
      [0, 5],                                     // see
    ],
  },
  jingleBells: {
    name: 'Jingle Bells (chorus)',
    lyrics: "Jin-gle bells, jin-gle bells, jin-gle all the way. / Oh what fun it is to ride / in a one horse o-pen sleigh, hey! / Jin-gle bells, jin-gle bells, jin-gle all the way. / Oh what fun it is to ride / in a one horse o-pen sleigh.",
    notes: [
      [4, 1], [4, 1], [4, 2], [4, 1], [4, 1], [4, 2],
      [4, 1], [7, 1], [0, 1.5], [2, 0.5], [4, 4],
      [5, 1], [5, 1], [5, 1.5], [5, 0.5], [5, 1], [4, 1], [4, 1], [4, 0.5], [4, 0.5],
      [4, 1], [2, 1], [2, 1], [4, 1], [2, 2], [7, 2],
      [4, 1], [4, 1], [4, 2], [4, 1], [4, 1], [4, 2],
      [4, 1], [7, 1], [0, 1.5], [2, 0.5], [4, 4],
      [5, 1], [5, 1], [5, 1], [5, 1], [5, 1], [4, 1], [4, 1], [4, 0.5], [4, 0.5],
      [7, 1], [7, 1], [5, 1], [2, 1], [0, 4],
    ],
  },
};

// Map an offset written in a major key into another 7-note mode by scale degree.
function remapToMode(offset, mode) {
  if (mode === 'major') return offset;
  const major = SCALES.major.steps;
  const target = SCALES[mode].steps;
  const oct = Math.floor(offset / 12);
  const pc = offset - oct * 12;
  const degree = major.indexOf(pc);
  if (degree < 0) return offset; // chromatic passing note: leave as is
  return target[degree] + oct * 12;
}

export function scaleNotesInRange(rootPc, scaleKey, low, high) {
  const steps = SCALES[scaleKey].steps;
  const out = [];
  for (let m = low; m <= high; m++) {
    const rel = (((m - rootPc) % 12) + 12) % 12;
    if (steps.includes(rel)) out.push(m);
  }
  return out;
}

// The scale behind the current challenge, as ascending MIDI notes, for the
// pre-round preview: the configured scale; for a song, its key and mode across
// the song's range (and at least tonic to octave); for random notes, the
// chosen key/scale across the notes actually generated.
export function previewScaleNotes(cfg, seq) {
  const midis = seq.filter(n => !n.rest).map(n => n.midi);
  const lo = Math.min(...midis), hi = Math.max(...midis);
  if (cfg.mode === 'scale') return [...new Set(midis)].sort((a, b) => a - b);
  if (cfg.mode === 'song') {
    const tonic = rootMidi(cfg.songRoot, cfg.songOctave);
    return scaleNotesInRange(cfg.songRoot, cfg.songMode, Math.min(lo, tonic), Math.max(hi, tonic + 12));
  }
  return scaleNotesInRange(cfg.randomRoot, cfg.randomScale, lo, hi);
}

// ---------------------------------------------------------------------------
// Lyrics
// ---------------------------------------------------------------------------
// Lyrics text: words separated by spaces, syllables of a word by hyphens
// ("A-ma-zing grace"), "_" holds the previous syllable over one more note,
// and "/" or a line break starts a new display line. Syllables are matched
// in order to the song's notes (rests are skipped).
// Returns [{ text, wordEnd, line, cont }].
export function parseLyrics(text) {
  const out = [];
  let line = 0;
  for (const rawLine of String(text || '').split(/\/|\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    for (const word of words) {
      if (word === '_') { out.push({ text: '', wordEnd: false, line, cont: true }); continue; }
      const parts = word.split('-').filter(Boolean);
      parts.forEach((p, k) => out.push({ text: p, wordEnd: k === parts.length - 1, line, cont: false }));
    }
    line++;
  }
  return out;
}

// Attach parsed lyrics to the pitched notes of a sequence (in place).
// Returns { syllables, notes } counts so mismatches can be reported.
export function assignLyrics(seq, lyrics) {
  const pitched = seq.filter(n => !n.rest);
  pitched.forEach((n, i) => { if (lyrics[i]) n.lyric = lyrics[i]; });
  return { syllables: lyrics.length, notes: pitched.length };
}

// Movable-do solfège relative to a root, with the minor-key spellings for
// the flattened degrees.
const SOLFEGE = ['do', 'ra', 're', 'me', 'mi', 'fa', 'fi', 'sol', 'le', 'la', 'te', 'ti'];
function solfege(seq, rootPc, perLine) {
  seq.forEach((n, i) => {
    n.lyric = { text: SOLFEGE[(((n.midi - rootPc) % 12) + 12) % 12], wordEnd: true, line: Math.floor(i / perLine), cont: false };
  });
  return seq;
}

// Returns an array of { midi, beats, lyric? } (songs may also contain
// { rest: true } entries and quick { noWall: true } notes).
export function buildSequence(cfg, rng = Math.random) {
  if (cfg.mode === 'scale') {
    const base = rootMidi(cfg.scaleRoot, cfg.scaleOctave);
    const steps = SCALES[cfg.scaleType].steps;
    const up = [];
    for (let o = 0; o < cfg.scaleOctaves; o++) {
      for (const s of steps) up.push(base + o * 12 + s);
    }
    up.push(base + cfg.scaleOctaves * 12);
    let midis;
    if (cfg.scaleDirection === 'down') midis = [...up].reverse();
    else if (cfg.scaleDirection === 'updown') midis = [...up, ...up.slice(0, -1).reverse()];
    else midis = up;
    const seq = midis.map((midi, i) => ({ midi, beats: i === midis.length - 1 ? 2 : 1 }));
    return solfege(seq, cfg.scaleRoot, cfg.scaleDirection === 'updown' ? up.length : 8);
  }

  if (cfg.mode === 'random') {
    const low = Math.min(cfg.randomLow, cfg.randomHigh);
    const high = Math.max(cfg.randomLow, cfg.randomHigh);
    let pool = scaleNotesInRange(cfg.randomRoot, cfg.randomScale, low, high);
    if (pool.length === 0) pool = [low];
    const seq = [];
    let prev = null;
    for (let i = 0; i < cfg.randomCount; i++) {
      let choices = pool;
      if (prev !== null) {
        choices = pool.filter(m => m !== prev && Math.abs(m - prev) <= cfg.randomMaxJump);
        if (choices.length === 0) choices = pool.filter(m => m !== prev);
        if (choices.length === 0) choices = pool;
      }
      const midi = choices[Math.floor(rng() * choices.length)];
      seq.push({ midi, beats: 1 });
      prev = midi;
    }
    return solfege(seq, cfg.randomRoot, 8);
  }

  // song
  const tonic = rootMidi(cfg.songRoot, cfg.songOctave);
  const seq = songNotes(cfg.song).map(n => (n.rest
    ? { midi: null, beats: n.beats, rest: true }
    : {
      midi: tonic + (n.remap ? remapToMode(n.offset, cfg.songMode) : n.offset),
      beats: n.beats,
      ...(n.noWall ? { noWall: true } : {}),
    }));
  assignLyrics(seq, parseLyrics(songLyrics(cfg.song)));
  return seq;
}

// ---------------------------------------------------------------------------
// Custom songs
// ---------------------------------------------------------------------------
// Parsed custom songs, keyed by the song setting value ("custom:<id>").
const customSongs = new Map();

export function setCustomSong(key, parsed, lyrics = '') {
  if (parsed) customSongs.set(key, { ...parsed, lyrics });
  else customSongs.delete(key);
}

function songLyrics(key) {
  if (isCustomSongKey(key)) {
    const c = customSongs.get(key);
    return c && c.ok ? c.lyrics : '';
  }
  return (SONGS[key] || SONGS.twinkle).lyrics || '';
}

export function isCustomSongKey(key) {
  return typeof key === 'string' && key.startsWith('custom:');
}

// A song's notes as { offset, beats, rest?, noWall?, remap } objects, where
// `offset` is semitones above the tonic of a major key and `remap` says the
// note may be moved into another mode by scale degree.
function songNotes(key) {
  if (isCustomSongKey(key)) {
    const c = customSongs.get(key);
    if (c && c.ok) return c.notes;
  }
  const song = SONGS[key] || SONGS.twinkle;
  return song.notes.map(([offset, beats]) => ({ offset, beats, remap: true }));
}

const LETTER_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const TOKEN_RE = /^(?:(r)|([a-g])(#|b|♯|♭)?(-?\d))(?::(\d*\.?\d+|\d+\/\d+))?(~)?$/i;

// Parse custom-song text written in real note names, e.g.
//   D4 G4:2 B4:0.5 G4:0.5 B4:2 A4 | R:1 C5:1/3~
// Tokens are separated by spaces, commas, line breaks or bar lines (|).
//   NOTE[:BEATS][~]   note name with octave (C4 = middle C), # or b allowed;
//                     BEATS defaults to 1 and may be a decimal or a fraction;
//                     a trailing ~ makes a quick note with no wall.
//   R[:BEATS]         a rest.
//   // ...           a comment to the end of the line.
// `writtenRoot` (0-11) and `writtenMode` give the key the notes are written in,
// so the song can be transposed and re-moded like the built-in ones.
// Returns { ok: true, notes, tonicOctave, stats } or { ok: false, error }.
export function parseSongText(text, writtenRoot, writtenMode) {
  const raw = [];
  const lines = String(text).split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].replace(/\/\/.*$/, '');
    for (const token of line.split(/[\s,|]+/).filter(Boolean)) {
      const m = TOKEN_RE.exec(token);
      const where = `Line ${li + 1}, "${token}"`;
      if (!m) {
        return { ok: false, error: `${where}: expected a note like G4, F#3, Bb4:2 or a rest like R:1` };
      }
      let beats = 1;
      if (m[5]) {
        const [a, b] = m[5].split('/').map(Number);
        beats = b === undefined ? a : a / b;
        if (!(beats > 0) || !Number.isFinite(beats) || beats > 32) {
          return { ok: false, error: `${where}: the length must be more than 0 and at most 32 beats` };
        }
      }
      if (m[1]) {
        if (m[6]) return { ok: false, error: `${where}: a rest can't be marked ~` };
        raw.push({ rest: true, beats });
        continue;
      }
      const accidental = m[3] === '#' || m[3] === '♯' ? 1 : m[3] ? -1 : 0;
      const midi = 12 * (Number(m[4]) + 1) + LETTER_PC[m[2].toLowerCase()] + accidental;
      if (midi < 24 || midi > 96) return { ok: false, error: `${where}: that note is outside C1–C7` };
      raw.push({ midi, beats, noWall: !!m[6] });
    }
  }
  const pitched = raw.filter(n => !n.rest);
  if (!pitched.some(n => !n.noWall)) {
    return { ok: false, error: 'Enter at least one note that has a wall (no ~)' };
  }

  // The written tonic: the lowest note on the key's root, or the root just
  // below the lowest note if the song never touches it.
  const lowest = Math.min(...pitched.map(n => n.midi));
  const highest = Math.max(...pitched.map(n => n.midi));
  const roots = pitched.filter(n => ((n.midi - writtenRoot) % 12 + 12) % 12 === 0).map(n => n.midi);
  const tonic = roots.length ? Math.min(...roots) : lowest - (((lowest - writtenRoot) % 12) + 12) % 12;

  // Store offsets as major-key scale degrees (like the built-in songs) so the
  // Mode setting can re-mode them; notes outside the written scale stay put.
  const written = SCALES[writtenMode] || SCALES.major;
  const major = SCALES.major.steps;
  const notes = raw.map(n => {
    if (n.rest) return n;
    const off = n.midi - tonic;
    const oct = Math.floor(off / 12);
    const degree = written.steps.indexOf(off - oct * 12);
    const out = { beats: n.beats, offset: off, remap: false };
    if (written.steps.length === 7 && degree >= 0) Object.assign(out, { offset: major[degree] + oct * 12, remap: true });
    if (n.noWall) out.noWall = true;
    return out;
  });

  return {
    ok: true,
    notes,
    tonicOctave: Math.floor(tonic / 12) - 1,
    stats: {
      walls: pitched.filter(n => !n.noWall).length,
      quick: pitched.filter(n => n.noWall).length,
      rests: raw.length - pitched.length,
      beats: raw.reduce((a, n) => a + n.beats, 0),
      low: lowest,
      high: highest,
    },
  };
}
