import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { PitchTracker } from './pitchtrack.js';
import { PitchDebugOverlay } from './debug.js';
import {
  NOTE_NAMES, SCALES, SONGS, SONG_MODES, buildSequence, midiToName, previewScaleNotes,
  parseSongText, setCustomSong, isCustomSongKey, parseLyrics,
} from './music.js';

// ---------------------------------------------------------------------------
// World constants
// ---------------------------------------------------------------------------
const SEMI = 1;          // world units per semitone (vertical)
const BALL_R = 0.5;      // ball radius
const BEAT_LEN = 6;      // world units travelled per beat
const WALL_W = 9;        // wall width
const LEAD_BEATS = 3;    // empty runway before the first wall
const TAIL_BEATS = 3;    // runway after the last wall
const MIN_GAP = 1.2;     // minimum free space between consecutive walls
const MIN_NOTE_S = 0.18; // notes with walls shorter than this (in seconds) are stretched to it
const LATENCY_S = 0.3;   // seconds of slack for pitch-detection + ball movement lag
const BOUNCE_ACCEL = 1.5; // after a bounce, the ball regains forward speed at this many × speed per second

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const DEFAULTS = {
  mode: 'song',
  song: 'twinkle', songRoot: 0, songOctave: 3, songMode: 'major',
  scaleRoot: 0, scaleOctave: 3, scaleType: 'major', scaleOctaves: 1, scaleDirection: 'updown',
  randomLow: 48, randomHigh: 60, randomRoot: 0, randomScale: 'major', randomCount: 16, randomMaxJump: 5,
  holeScale: 2.5, bpm: 80, octaveFold: true, wallBreaks: false, maxRetries: 3,
  input: 'mic', sensitivity: 0.5, showTuner: true, showLyrics: true, showDebug: false,
  // Speaker sounds are opt-in: the mic pauses while they play (unless on headphones).
  previewScale: false, demoTrack: false, guideTone: false, sfx: false, headphones: false,
};
const STORAGE_KEY = 'pitchball.settings.v2';
const OLD_STORAGE_KEY = 'pitchball.settings.v1'; // speaker sounds defaulted on there
const IN_TUNE_CENTS = 5; // the tuner turns green within this many cents of a note

function loadSettings() {
  try {
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) {
      // Carry over older settings, but not the speaker-sound ones, which used
      // to be on by default and now need an explicit opt-in.
      saved = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || '{}');
      delete saved.guideTone;
      delete saved.sfx;
    }
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
const settings = loadSettings();

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const form = $('settings');
const ui = {
  menu: $('menu'), hud: $('hud'), countdown: $('countdown'), toast: $('toast'),
  pause: $('pauseScreen'), results: $('results'),
  score: $('hudScore'), streak: $('hudStreak'), target: $('hudTarget'), sung: $('hudSung'),
  progress: $('hudProgress'), mouseHint: $('mouseHint'),
  debug: $('debugOverlay'), tuner: $('tuner'), lyrics: $('lyrics'), lyricCur: $('lyricCur'), lyricNext: $('lyricNext'),
  csLyrics: $('csLyrics'), tunerNeedle: $('tunerNeedle'), tunerNote: $('tunerNote'), tunerCents: $('tunerCents'),
  preview: $('preview'), holeInfo: $('holeInfo'), bpmInfo: $('bpmInfo'), menuError: $('menuError'),
  btnStart: $('btnStart'), customEditor: $('customEditor'), csName: $('csName'), csRoot: $('csRoot'),
  csMode: $('csMode'), csText: $('csText'), csStatus: $('csStatus'), csDelete: $('csDelete'), csExample: $('csExample'),
  sensRow: $('sensRow'), retriesRow: $('retriesRow'), headphonesRow: $('headphonesRow'), skipPreview: $('btnSkipPreview'),
};

function populateSelects() {
  for (const sel of form.querySelectorAll('.root-select')) {
    sel.innerHTML = NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  }
  for (const sel of form.querySelectorAll('.octave-select')) {
    sel.innerHTML = [1, 2, 3, 4, 5, 6].map(o => `<option value="${o}">${o}</option>`).join('');
  }
  for (const sel of form.querySelectorAll('.scale-select')) {
    sel.innerHTML = Object.entries(SCALES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  }
  for (const sel of form.querySelectorAll('.note-select')) {
    let html = '';
    for (let m = 36; m <= 84; m++) html += `<option value="${m}">${midiToName(m)}</option>`;
    sel.innerHTML = html;
  }
  populateSongSelect();
  ui.csMode.innerHTML = SONG_MODES.map(k => `<option value="${k}">${SCALES[k].name}</option>`).join('');
  $('songModeSelect').innerHTML = SONG_MODES.map(k => `<option value="${k}">${SCALES[k].name}</option>`).join('');
}

function writeForm() {
  for (const el of form.querySelectorAll('[name]')) {
    const v = settings[el.name];
    if (el.type === 'radio') el.checked = String(v) === el.value;
    else if (el.type === 'checkbox') el.checked = !!v;
    else el.value = String(v);
  }
}

function readForm() {
  for (const el of form.querySelectorAll('[name]')) {
    if (el.type === 'radio') { if (el.checked) settings[el.name] = el.value; }
    else if (el.type === 'checkbox') settings[el.name] = el.checked;
    else if ('num' in el.dataset) {
      const n = Number(el.value);
      if (Number.isFinite(n)) settings[el.name] = n;
    } else settings[el.name] = el.value;
  }
  settings.randomCount = Math.max(4, Math.min(100, Math.round(settings.randomCount)));
  settings.randomMaxJump = Math.max(1, Math.min(12, Math.round(settings.randomMaxJump)));
}

// ---------------------------------------------------------------------------
// Custom songs: stored in this browser, edited in the menu, parsed live.
// ---------------------------------------------------------------------------
const CUSTOM_KEY = 'pitchball.customSongs.v1';
const NEW_SONG = '__new__';
const EXAMPLE_SONG = `// Amazing Grace, written in G major
D4
G4:2 B4:0.5 G4:0.5 B4:2 A4   // -ma-zing grace how
G4:2 E4 D4:2 D4               // sweet the sound that
G4:2 B4:0.5 G4:0.5 B4:2 A4   // saved a wretch like
D5:5 B4                       // me, I
D5:2 B4:0.5 G4:0.5 B4:2 A4   // once was lost but
G4:2 E4 D4:2 D4               // now am found, was
G4:2 B4:0.5 G4:0.5 B4:2 A4   // blind but now I
G4:5                          // see`;
const EXAMPLE_LYRICS = `A-ma-zing _ grace how sweet the sound
that saved a _ wretch like me.
I once was _ lost but now am found,
was blind but _ now I see.`;

function loadCustomSongs() {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(list) ? list.filter(c => c && c.id) : [];
  } catch {
    return [];
  }
}
const customSongs = loadCustomSongs();
function saveCustomSongs() {
  const stored = customSongs.map(({ id, name, root, mode, text, lyrics }) => ({ id, name, root, mode, text, lyrics }));
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(stored)); } catch { /* ignore */ }
}
const customKey = c => `custom:${c.id}`;
function findCustom(key) {
  return customSongs.find(c => customKey(c) === key) || null;
}
function parseCustom(c) {
  c.lyrics = c.lyrics || '';
  c.parsed = parseSongText(c.text, c.root, c.mode);
  // Remembered across half-typed (invalid) states, so typing doesn't reset the key.
  if (c.parsed.ok) c.lastTonicOctave = c.parsed.tonicOctave;
  setCustomSong(customKey(c), c.parsed, c.lyrics);
  return c.parsed;
}
customSongs.forEach(parseCustom);
if (isCustomSongKey(settings.song) && !findCustom(settings.song)) settings.song = 'twinkle';

function populateSongSelect() {
  const esc = t => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  let html = Object.entries(SONGS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  if (customSongs.length) {
    html += `<optgroup label="Your songs">${customSongs
      .map(c => `<option value="${customKey(c)}">${esc(c.name || 'Untitled')}</option>`).join('')}</optgroup>`;
  }
  html += `<option value="${NEW_SONG}">＋ New custom song…</option>`;
  $('songSelect').innerHTML = html;
}

// Point Key / Octave / Mode at the key the song is written in, so it plays as written.
function playCustomAsWritten(c) {
  settings.songRoot = c.root;
  settings.songMode = c.mode;
  if (c.parsed && c.parsed.ok) settings.songOctave = Math.max(1, Math.min(6, c.parsed.tonicOctave));
}

function createCustomSong() {
  const n = customSongs.length + 1;
  const c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: `My song ${n}`, root: 0, mode: 'major', text: '' };
  customSongs.push(c);
  parseCustom(c);
  saveCustomSongs();
  populateSongSelect();
  settings.song = customKey(c);
  playCustomAsWritten(c);
  saveSettings();
  writeForm();
  ui.csName.focus();
  ui.csName.select();
}

function customSongError() {
  if (settings.mode !== 'song' || !isCustomSongKey(settings.song)) return null;
  const c = findCustom(settings.song);
  return c && c.parsed && !c.parsed.ok ? c.parsed.error : null;
}

let deleteArmed = false;
function refreshCustomEditor() {
  const c = settings.mode === 'song' ? findCustom(settings.song) : null;
  ui.customEditor.hidden = !c;
  if (!c) return;
  if (document.activeElement !== ui.csName) ui.csName.value = c.name;
  if (document.activeElement !== ui.csText) ui.csText.value = c.text;
  if (document.activeElement !== ui.csLyrics) ui.csLyrics.value = c.lyrics;
  ui.csRoot.value = String(c.root);
  ui.csMode.value = c.mode;
  ui.csExample.hidden = c.text.trim() !== '';
  ui.csDelete.textContent = deleteArmed ? 'Click again to delete' : 'Delete song';
  const p = c.parsed;
  ui.csStatus.className = 'cs-status ' + (p.ok ? 'ok' : 'bad');
  if (!c.text.trim()) {
    ui.csStatus.className = 'cs-status';
    ui.csStatus.textContent = 'Type or paste notes, e.g. D4 G4:2 B4:0.5 G4:0.5 — or load the example.';
  } else if (p.ok) {
    const st = p.stats;
    const extras = [st.quick && `${st.quick} quick`, st.rests && `${st.rests} rest${st.rests > 1 ? 's' : ''}`].filter(Boolean).join(', ');
    const asWritten = settings.songRoot === c.root && settings.songMode === c.mode && settings.songOctave === p.tonicOctave;
    const sung = st.walls + st.quick;
    const syl = parseLyrics(c.lyrics).length;
    const lyr = !c.lyrics.trim() ? '' : syl === sung ? ' · lyrics ✓'
      : ` · lyrics: ${syl} syllables for ${sung} notes${syl < sung
        ? (sung - syl === 1 ? ' (the last note has none)' : ` (the last ${sung - syl} notes have none)`)
        : ' (extras ignored)'}`;
    ui.csStatus.textContent = `✓ ${st.walls} notes${extras ? ` (+ ${extras})` : ''} · ${+st.beats.toFixed(2)} beats · `
      + `${midiToName(st.low)}–${midiToName(st.high)} · ${asWritten ? 'playing as written' : 'transposed by the Key/Octave/Mode above'}${lyr}`;
  } else {
    ui.csStatus.textContent = p.error;
  }
}

function onCustomEdit(e) {
  const c = findCustom(settings.song);
  if (!c) return;
  const keyChanged = e.target === ui.csRoot || e.target === ui.csMode;
  if (e.target === ui.csName) c.name = ui.csName.value.slice(0, 60);
  else if (e.target === ui.csText) c.text = ui.csText.value;
  else if (e.target === ui.csLyrics) c.lyrics = ui.csLyrics.value;
  else if (e.target === ui.csRoot) c.root = Number(ui.csRoot.value);
  else if (e.target === ui.csMode) c.mode = ui.csMode.value;
  // Was it playing as written (or never valid yet, e.g. a brand-new song)?
  const wasAsWritten = c.lastTonicOctave === undefined
    || (settings.songRoot === c.root && settings.songOctave === c.lastTonicOctave);
  parseCustom(c);
  saveCustomSongs();
  if (e.target === ui.csName) {
    const opt = $('songSelect').querySelector(`option[value="${customKey(c)}"]`);
    if (opt) opt.textContent = c.name || 'Untitled';
    refreshCustomEditor();
    return;
  }
  // Keep playing as written when the written key changes, or when editing
  // notes moves the written tonic to another octave.
  if (keyChanged || wasAsWritten) {
    playCustomAsWritten(c);
    saveSettings();
    writeForm();
  }
  // Status updates at once; the 3D preview rebuilds when typing pauses.
  refreshMenuLabels();
  clearTimeout(customRebuildTimer);
  customRebuildTimer = setTimeout(regenerate, e.target === ui.csText || e.target === ui.csLyrics ? 300 : 0);
}
let customRebuildTimer = 0;

function refreshMenuLabels() {
  for (const p of form.querySelectorAll('.mode-panel')) p.hidden = p.dataset.mode !== settings.mode;
  ui.sensRow.hidden = settings.input !== 'mic';
  ui.retriesRow.hidden = settings.wallBreaks;
  ui.headphonesRow.hidden = !(settings.previewScale || settings.demoTrack || settings.guideTone || settings.sfx);
  const cents = Math.round((settings.holeScale - 1) * BALL_R / SEMI * 100);
  ui.holeInfo.textContent = `Hole is ${settings.holeScale.toFixed(1)}× the ball — you can be off by up to ±${cents} cents (${(cents / 100).toFixed(2)} semitones)`;
  ui.bpmInfo.textContent = `${settings.bpm} beats per minute`;

  refreshCustomEditor();
  const songError = customSongError();
  ui.btnStart.disabled = !!songError;
  if (songError) {
    ui.preview.textContent = `Fix the custom song to play it. ${songError}`;
    return;
  }
  const names = sequence.map(n => (n.rest ? '·' : midiToName(n.midi) + (n.noWall ? '~' : '')));
  const shown = names.length > 40 ? names.slice(0, 40).join(' ') + ' …' : names.join(' ');
  const layout = layoutNotes(sequence);
  const walls = sequence.filter(n => !n.rest && !n.noWall).length;
  const secs = Math.round(layout.totalBeats * 60 / settings.bpm);
  const slowed = layout.stretched
    ? ` · ${layout.stretched} quick note${layout.stretched > 1 ? 's' : ''} slowed down to fit this tempo` : '';
  ui.preview.textContent = `${walls} notes · about ${secs}s${slowed} — ${shown}`;
}

// ---------------------------------------------------------------------------
// Three.js scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x1a2552);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 35, 110);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30244a, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
scene.add(sun, sun.target);

// Ball
const ballMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.35, metalness: 0.1, emissive: 0x000000 });
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 24), ballMat);
ball.castShadow = true;
scene.add(ball);
// A stripe so rolling is visible
const stripe = new THREE.Mesh(
  new THREE.TorusGeometry(BALL_R * 1.001, 0.06, 8, 40),
  new THREE.MeshStandardMaterial({ color: 0xff6a3d, roughness: 0.4 }),
);
stripe.rotation.y = Math.PI / 2;
ball.add(stripe);

// Trail behind the ball
const TRAIL_N = 90;
const trailPos = new Float32Array(TRAIL_N * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.6 }));
trail.frustumCulled = false;
scene.add(trail);

// Aim helper: a line from the ball to where it will meet the next wall
const aimMarker = new THREE.Mesh(
  new THREE.RingGeometry(BALL_R * 0.55, BALL_R, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }),
);
aimMarker.renderOrder = 10;
const aimGeo = new THREE.BufferGeometry();
aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const aimLine = new THREE.Line(aimGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
aimLine.frustumCulled = false;
aimMarker.visible = aimLine.visible = false;
scene.add(aimMarker, aimLine);

// Level objects are rebuilt per game
let levelGroup = new THREE.Group();
scene.add(levelGroup);
const fx = []; // transient particles / debris

function makeGridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#26315f';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(160,180,255,0.35)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const gridTex = makeGridTexture();

function makeLabel(text, color = '#ffffff', scale = 1) {
  const c = document.createElement('canvas');
  const font = 'bold 76px system-ui, sans-serif';
  const g0 = c.getContext('2d');
  g0.font = font;
  // Wide enough for the text (lyrics can be long); at least the old 256px.
  c.width = Math.max(256, Math.ceil(g0.measureText(text).width) + 40);
  c.height = 128;
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(10,14,35,0.85)';
  g.strokeText(text, c.width / 2, 66);
  g.fillStyle = color;
  g.fillText(text, c.width / 2, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: true }));
  sprite.scale.set(2 * scale * (c.width / 256), 1 * scale, 1);
  return sprite;
}

function noteColor(midi) {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  return new THREE.Color().setHSL(pc / 12, 0.6, 0.55);
}

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map && m.map !== gridTex) m.map.dispose();
        m.dispose();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------
let sequence = [];
let level = null; // { walls, minMidi, maxMidi, holeR, groundGap, wallH, endD, noteLabels }

function buildLevel(seq) {
  scene.remove(levelGroup);
  disposeTree(levelGroup);
  levelGroup = new THREE.Group();
  scene.add(levelGroup);

  const midis = seq.filter(n => !n.rest).map(n => n.midi);
  const minMidi = Math.min(...midis);
  const maxMidi = Math.max(...midis);
  const holeR = BALL_R * settings.holeScale;
  const groundGap = holeR + 0.8; // lowest hole sits clear of the ground, so silence never passes
  const yFor = m => groundGap + (m - minMidi) * SEMI;
  const wallH = yFor(maxMidi) + holeR + 2.5;

  // Lay walls out along the track according to rhythm. Rests and quick (~)
  // notes take up time but get no wall.
  const walls = [];
  const speed = BEAT_LEN * settings.bpm / 60;
  const lag = LATENCY_S * speed; // walls start a touch after the beat so on-time singing lands
  const layout = layoutNotes(seq);
  const notes = layout.notes.map(n => {
    const onset = LEAD_BEATS * BEAT_LEN + n.startBeat * BEAT_LEN;
    const span = n.layoutBeats * BEAT_LEN;
    const note = { ...n, onset, end: onset + span };
    if (!n.rest && !n.noWall) {
      const dStart = onset + lag;
      const depth = Math.max(Math.min(0.5, span * 0.45), Math.min(span * 0.5, span - lag - MIN_GAP));
      note.wall = {
        i: walls.length, midi: n.midi, holeY: yFor(n.midi), dStart, dEnd: dStart + depth, lyric: n.lyric,
        state: 'pending', outDist: 0, errSum: 0, samples: 0, toneDone: false, attempts: 0, flash: 0,
      };
      walls.push(note.wall);
    }
    return note;
  });
  const endD = LEAD_BEATS * BEAT_LEN + layout.totalBeats * BEAT_LEN + TAIL_BEATS * BEAT_LEN;

  // Ground
  const trackLen = endD + 60;
  const groundTex = gridTex.clone();
  groundTex.needsUpdate = true;
  groundTex.repeat.set(40 / 3, trackLen / 3);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, trackLen),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -trackLen / 2 + 30);
  ground.receiveShadow = true;
  levelGroup.add(ground);

  // Pitch guide lines for each distinct target note
  const unique = [...new Set(midis)].sort((a, b) => a - b);
  const noteLabels = [];
  const lineMat = new THREE.LineBasicMaterial({ color: 0x9fb0ff, transparent: true, opacity: 0.35 });
  for (const m of unique) {
    const y = yFor(m);
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-WALL_W / 2 - 0.4, y, 30),
      new THREE.Vector3(-WALL_W / 2 - 0.4, y, -trackLen + 30),
    ]);
    levelGroup.add(new THREE.Line(geo, lineMat));
    const label = makeLabel(midiToName(m), '#' + noteColor(m).getHexString(), 0.7);
    label.position.set(-WALL_W / 2 - 1.3, y, 0);
    levelGroup.add(label);
    noteLabels.push(label);
  }

  // Walls with holes
  for (const w of walls) {
    const depth = w.dEnd - w.dStart;
    const shape = new THREE.Shape();
    shape.moveTo(-WALL_W / 2, 0);
    shape.lineTo(WALL_W / 2, 0);
    shape.lineTo(WALL_W / 2, wallH);
    shape.lineTo(-WALL_W / 2, wallH);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, w.holeY, holeR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 });
    const color = noteColor(w.midi);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.6, transparent: true, opacity: 0.72, emissive: color.clone().multiplyScalar(0.12),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = -w.dEnd;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(holeR, 0.09, 10, 48),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }),
    );
    rim.position.set(0, w.holeY, -w.dStart + 0.02);

    const label = makeLabel(midiToName(w.midi), '#ffffff', 0.9);
    label.position.set(0, w.holeY + holeR + 0.75, -w.dStart + 0.3);

    const group = new THREE.Group();
    group.add(mesh, rim, label);
    // The syllable to sing, above the note name (a held syllable shows nothing new).
    let lyricLabel = null;
    if (settings.showLyrics && w.lyric && !w.lyric.cont) {
      lyricLabel = makeLabel(w.lyric.text + (w.lyric.wordEnd ? '' : '-'), '#ffe28a', 1.0);
      lyricLabel.position.set(0, w.holeY + holeR + 1.65, -w.dStart + 0.3);
      group.add(lyricLabel);
    }
    levelGroup.add(group);
    Object.assign(w, { group, mesh, rim, label, lyricLabel, color });
  }

  // Syllables for the lyric bar; each note points at the syllable it sings
  // (a held "_" note points at the one before).
  const syllables = [];
  for (const n of notes) {
    if (!n.lyric) continue;
    if (n.lyric.cont) { if (syllables.length) n.syl = syllables.length - 1; continue; }
    n.syl = syllables.length;
    syllables.push(n.lyric);
  }
  level = { walls, notes, syllables, minMidi, maxMidi, holeR, groundGap, wallH, endD, noteLabels, yFor };
  lyricCache = '';
}

// Beat positions for a sequence at the current tempo. Notes with walls that
// would last under MIN_NOTE_S are stretched so the ball has time to move.
function layoutNotes(seq) {
  const minBeats = MIN_NOTE_S * settings.bpm / 60;
  let beat = 0, stretched = 0;
  const notes = seq.map(n => {
    const stretch = !n.rest && !n.noWall && n.beats < minBeats;
    if (stretch) stretched++;
    const layoutBeats = stretch ? minBeats : n.beats;
    const out = { ...n, startBeat: beat, layoutBeats };
    beat += layoutBeats;
    return out;
  });
  return { notes, totalBeats: beat, stretched };
}

function midiForY(y) {
  return level.minMidi + (y - level.groundGap) / SEMI;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
const sparkGeo = new THREE.SphereGeometry(0.09, 6, 4);
const debrisGeo = new THREE.BoxGeometry(1, 1, 1);

function burst(w) {
  const mat = new THREE.MeshBasicMaterial({ color: w.color.clone().lerp(new THREE.Color(0xffffff), 0.4), transparent: true });
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const m = new THREE.Mesh(sparkGeo, mat);
    m.position.set(Math.cos(a) * level.holeR, w.holeY + Math.sin(a) * level.holeR, -w.dEnd);
    const speed = 3 + Math.random() * 3;
    scene.add(m);
    fx.push({ obj: m, vel: new THREE.Vector3(Math.cos(a) * speed, Math.sin(a) * speed, -2 - Math.random() * 3), life: 0.8, max: 0.8, gravity: 0, mat, shared: true });
  }
  w.rim.material.color.set(0x5ee08a);
  w.rim.material.emissive.set(0x5ee08a);
  w.rim.material.emissiveIntensity = 1.2;
  w.mesh.material.emissive.copy(w.color).multiplyScalar(0.5);
  fadingWalls.push({ w, t: 0 });
}

function shatter(w) {
  w.mesh.visible = false;
  w.rim.visible = false;
  w.label.visible = false;
  if (w.lyricLabel) w.lyricLabel.visible = false;
  const mat = new THREE.MeshStandardMaterial({ color: w.color.clone().lerp(new THREE.Color(0xff3344), 0.5), roughness: 0.6, transparent: true });
  const cy = ball.position.y;
  for (let k = 0; k < 46; k++) {
    const m = new THREE.Mesh(debrisGeo, mat);
    const s = 0.3 + Math.random() * 0.7;
    m.scale.set(s, s, Math.min(s, (w.dEnd - w.dStart)));
    m.position.set((Math.random() - 0.5) * WALL_W, Math.random() * level.wallH, -w.dStart - Math.random() * (w.dEnd - w.dStart));
    const dir = new THREE.Vector3(m.position.x, m.position.y - cy, 0).normalize();
    const vel = dir.multiplyScalar(2 + Math.random() * 5);
    vel.z = -4 - Math.random() * 6;
    vel.y += 3;
    m.castShadow = true;
    scene.add(m);
    fx.push({ obj: m, vel, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), life: 1.6, max: 1.6, gravity: 18, mat, shared: true });
  }
}

function updateFx(dt) {
  for (let k = fx.length - 1; k >= 0; k--) {
    const p = fx[k];
    p.life -= dt;
    p.vel.y -= p.gravity * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    if (p.gravity && p.obj.position.y < 0.2) { p.obj.position.y = 0.2; p.vel.y *= -0.3; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    if (p.spin) { p.obj.rotation.x += p.spin.x * dt; p.obj.rotation.y += p.spin.y * dt; }
    p.mat.opacity = Math.max(0, Math.min(1, p.life / (p.max * 0.4)));
    if (p.life <= 0) {
      scene.remove(p.obj);
      fx.splice(k, 1);
      if (!fx.some(o => o.mat === p.mat)) p.mat.dispose();
    }
  }
}

// Cleared walls fade out so they don't block the camera behind the ball.
const fadingWalls = [];
const FADE_S = 0.4;
function updateFadingWalls(dt) {
  for (let k = fadingWalls.length - 1; k >= 0; k--) {
    const f = fadingWalls[k];
    f.t += dt;
    const a = Math.max(0, 1 - f.t / FADE_S);
    f.w.mesh.material.opacity = 0.72 * a;
    f.w.rim.material.transparent = true;
    f.w.rim.material.opacity = a;
    f.w.label.material.opacity = a;
    if (f.w.lyricLabel) f.w.lyricLabel.material.opacity = a;
    if (a === 0) { f.w.group.visible = false; fadingWalls.splice(k, 1); }
  }
}

function updateAim() {
  const w = ['playing', 'countdown', 'demo'].includes(game.state) ? currentTargetWall() : null;
  if (!w || w.dStart - game.d > 3 * BEAT_LEN || game.d > w.dStart) {
    aimMarker.visible = aimLine.visible = false;
    return;
  }
  const y = ball.position.y;
  const inHole = Math.abs(y - w.holeY) <= level.holeR - BALL_R;
  const color = inHole ? 0x5ee08a : 0xff6070;
  aimMarker.material.color.set(color);
  aimLine.material.color.set(color);
  aimMarker.position.set(0, y, -w.dStart + 0.05);
  const pos = aimGeo.attributes.position;
  pos.setXYZ(0, 0, y, ball.position.z - BALL_R);
  pos.setXYZ(1, 0, y, -w.dStart);
  pos.needsUpdate = true;
  aimMarker.visible = aimLine.visible = true;
}

function clearFx() {
  fadingWalls.length = 0;
  for (const p of fx) { scene.remove(p.obj); p.mat.dispose(); }
  fx.length = 0;
}

let toastTimer = 0;
function toast(text, color) {
  ui.toast.textContent = text;
  ui.toast.style.color = color;
  ui.toast.classList.remove('show');
  void ui.toast.offsetWidth; // restart animation
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 950);
}

// ---------------------------------------------------------------------------
// Input: microphone or mouse
// ---------------------------------------------------------------------------
const audio = new AudioEngine();
const pointer = { ndc: new THREE.Vector2(), down: false };
const raycaster = new THREE.Raycaster();
const ballPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const tmpV = new THREE.Vector3();

renderer.domElement.addEventListener('pointermove', e => {
  pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});
renderer.domElement.addEventListener('pointerdown', e => {
  pointer.down = true;
  pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  renderer.domElement.setPointerCapture?.(e.pointerId);
});
window.addEventListener('pointerup', () => { pointer.down = false; });
window.addEventListener('pointercancel', () => { pointer.down = false; });

// Mouse "singing": pitch at the pointer's height in the ball's plane, or null.
function readMousePitch() {
  if (!pointer.down) return null;
  ballPlane.constant = -ball.position.z;
  raycaster.setFromCamera(pointer.ndc, camera);
  if (!raycaster.ray.intersectPlane(ballPlane, tmpV)) return null;
  return midiForY(tmpV.y);
}

const tracker = new PitchTracker();
const debugOverlay = new PitchDebugOverlay(ui.debug, tracker.p);

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const game = {
  state: 'menu', // menu | countdown | playing | paused | results
  d: 0, speed: 8, countdown: 0, nextWall: 0,
  score: 0, firstTry: 0, bounces: 0, vel: 0, freeY: BALL_R, streak: 0, bestStreak: 0, centsSum: 0, centsN: 0,
  sungMidi: null, heardMidi: null, foldShift: null, time: 0, shake: 0,
};

function currentTargetWall() {
  if (!level) return null;
  return level.walls.find(w => w.state === 'pending') || null;
}

function foldOctave(midi, ref) {
  return midi + 12 * Math.round((ref - midi) / 12);
}

// Octave folding with hysteresis: keep the octave shift chosen for the current
// note unless the pitch ends up well over half an octave from the target.
// Re-folding every frame would flip the ball down an octave halfway through
// a leap of more than 6 semitones.
const FOLD_SLACK = 7.5;
function foldSticky(midi, ref) {
  if (game.foldShift === null || Math.abs(midi + game.foldShift - ref) > FOLD_SLACK) {
    game.foldShift = foldOctave(midi, ref) - midi;
  }
  return midi + game.foldShift;
}

function resetBall() {
  ball.position.set(0, BALL_R, 0);
  ball.rotation.set(0, 0, 0);
  for (let k = 0; k < TRAIL_N; k++) trailPos.set([0, BALL_R, 0], k * 3);
  trailGeo.attributes.position.needsUpdate = true;
}

function regenerate() {
  if (customSongError()) { refreshMenuLabels(); return; }
  sequence = buildSequence(settings);
  buildLevel(sequence);
  resetBall();
  game.d = 0;
  snapCamera();
  refreshMenuLabels();
}

async function startGame(sameSequence = false) {
  ui.menuError.hidden = true;
  audio.ensureContext();
  if (settings.input === 'mic') {
    if (!navigator.mediaDevices?.getUserMedia) {
      showMenuError('Microphone access needs a secure page (https:// or http://localhost). Try "Mouse / touch" input, or open the game via localhost.');
      return;
    }
    try {
      await audio.startMic();
    } catch (err) {
      showMenuError(`Couldn't use the microphone (${err.name || err.message}). Allow mic access in your browser, or switch to "Mouse / touch" input.`);
      return;
    }
  } else {
    audio.stopMic();
  }

  if (!sameSequence) sequence = buildSequence(settings);
  buildLevel(sequence);
  clearFx();
  resetBall();
  Object.assign(game, {
    state: 'countdown', d: 0, countdown: 3, nextWall: 0,
    speed: BEAT_LEN * settings.bpm / 60,
    vel: BEAT_LEN * settings.bpm / 60,
    score: 0, firstTry: 0, bounces: 0, freeY: BALL_R, streak: 0, bestStreak: 0, centsSum: 0, centsN: 0,
    sungMidi: null, heardMidi: null, foldShift: null, shake: 0,
  });
  ui.menu.hidden = true;
  ui.results.hidden = true;
  ui.pause.hidden = true;
  ui.hud.hidden = false;
  ui.mouseHint.hidden = settings.input !== 'mouse';
  ui.tuner.hidden = !settings.showTuner;
  ui.debug.hidden = !settings.showDebug;
  tracker.reset();
  debugOverlay.clear();
  snapCamera();
  // Optional intros run in order before the countdown.
  game.intros = [settings.previewScale && startPreview, settings.demoTrack && startDemo].filter(Boolean);
  nextIntro();
}

function nextIntro() {
  const step = game.intros.shift();
  if (step) step();
  else startCountdown();
}

function startCountdown() {
  game.state = 'countdown';
  game.countdown = 3;
  tracker.reset();
  ui.skipPreview.hidden = true;
  ui.countdown.className = '';
  ui.countdown.hidden = false;
  ui.countdown.textContent = '3';
  if (settings.guideTone) audio.playTone(level.walls[0].midi, 0.6, 0.2, !settings.headphones);
}

// ---------------------------------------------------------------------------
// Scale preview: before the ball rolls, play the challenge's scale and lift
// the ball to the height of each note, leaving a labelled ladder of levels.
// ---------------------------------------------------------------------------
let ladder = null;

function startPreview() {
  const notes = previewScaleNotes(settings, sequence);
  const step = Math.min(0.7, Math.max(0.35, 0.75 * 60 / settings.bpm));
  game.state = 'preview';
  game.preview = { notes, i: -1, timer: 0.4, step, y: BALL_R };
  buildLadder(notes);
  ui.skipPreview.textContent = 'Skip scale ▸';
  ui.skipPreview.hidden = false;
  ui.countdown.className = 'previewing';
  ui.countdown.hidden = false;
  ui.countdown.innerHTML = '<small>Listen to the scale</small>';
}

function buildLadder(notes) {
  removeLadder();
  ladder = new THREE.Group();
  ladder.userData.rungs = notes.map(m => {
    const y = level.yFor(m);
    const color = noteColor(m);
    const rung = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.07, 0.07),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 }),
    );
    rung.position.set(BALL_R + 0.9, y, 0);
    const label = makeLabel(midiToName(m), '#' + color.getHexString(), 0.8);
    label.position.set(BALL_R + 2.4, y, 0);
    label.material.opacity = 0.25;
    ladder.add(rung, label);
    return { rung, label };
  });
  scene.add(ladder);
}

function removeLadder() {
  if (!ladder) return;
  scene.remove(ladder);
  disposeTree(ladder);
  ladder = null;
}

function updatePreview(dt) {
  const pv = game.preview;
  pv.timer -= dt;
  if (pv.timer <= 0) {
    pv.i++;
    if (pv.i >= pv.notes.length) {
      endPreview();
      return;
    }
    pv.timer = pv.step;
    const m = pv.notes[pv.i];
    audio.playTone(m, pv.step * 0.85, 0.2, !settings.headphones);
    ui.countdown.innerHTML = `<small>Listen to the scale</small>${midiToName(m)}`;
    ladder.userData.rungs.forEach((r, k) => {
      const lit = k <= pv.i;
      r.rung.material.opacity = k === pv.i ? 1 : lit ? 0.7 : 0.25;
      r.label.material.opacity = lit ? 1 : 0.25;
      const s = k === pv.i ? 1.1 : 0.8;
      r.label.scale.set(2 * s, s, 1);
    });
  }
  const target = pv.i >= 0 ? level.yFor(pv.notes[pv.i]) : BALL_R;
  pv.y += (target - pv.y) * (1 - Math.exp(-14 * dt));
  ball.position.set(0, pv.y, 0);
  ballMat.emissive.setRGB(0.35, 0.25, 0);
}

function endPreview() {
  if (game.state !== 'preview') return;
  // The ladder stays up through the countdown as a reference, then goes.
  if (ladder) ladder.userData.rungs.forEach(r => { r.rung.material.opacity = 0.45; r.label.material.opacity = 0.8; });
  game.freeY = ball.position.y;
  if (game.intros.length) removeLadder(); // the ball is about to roll away from it
  nextIntro();
}

// ---------------------------------------------------------------------------
// Track demo: run the level on autopilot, playing each note through the
// speakers in rhythm while the ball flies through every hole. The level is
// then rebuilt for the real round.
// ---------------------------------------------------------------------------
function startDemo() {
  // Sound starts on the beat; the ball moves a little later so it reaches each
  // hole just before its wall, which sits LATENCY_S after the beat.
  const shift = (LATENCY_S - 0.14) * game.speed;
  game.state = 'demo';
  game.demo = { notes: level.notes, shift, sound: -1, ball: -1 };
  game.d = 0;
  game.vel = game.speed;
  game.freeY = ball.position.y;
  ui.skipPreview.textContent = 'Skip demo ▸';
  ui.skipPreview.hidden = false;
  ui.countdown.className = 'previewing';
  ui.countdown.hidden = false;
  ui.countdown.innerHTML = '<small>Demo · listen and watch</small>';
}

function updateDemo() {
  const dm = game.demo;
  const secPerBeat = 60 / settings.bpm;
  while (dm.sound + 1 < dm.notes.length && game.d >= dm.notes[dm.sound + 1].onset) {
    const n = dm.notes[++dm.sound];
    if (n.rest) continue;
    audio.playNote(n.midi, n.layoutBeats * secPerBeat * 0.92, 0.16, !settings.headphones);
    ui.countdown.innerHTML = `<small>Demo · listen and watch</small>${midiToName(n.midi)}`;
  }
  while (dm.ball + 1 < dm.notes.length && game.d >= dm.notes[dm.ball + 1].onset + dm.shift) dm.ball++;
  const cur = dm.ball >= 0 ? dm.notes[dm.ball] : null;
  game.sungMidi = game.heardMidi = cur && !cur.rest && game.d < cur.end + dm.shift ? cur.midi : null;
  const last = dm.notes[dm.notes.length - 1];
  if (game.d >= last.end) ui.countdown.innerHTML = '<small>Demo · your turn next</small>';
}

function endDemo() {
  if (game.state !== 'demo') return;
  audio.stopNotes();
  // Fresh walls and ball for the real round.
  buildLevel(sequence);
  clearFx();
  resetBall();
  Object.assign(game, {
    d: 0, nextWall: 0, vel: game.speed, freeY: BALL_R, sungMidi: null, heardMidi: null,
    score: 0, firstTry: 0, bounces: 0, streak: 0, bestStreak: 0, centsSum: 0, centsN: 0, shake: 0,
  });
  snapCamera();
  nextIntro();
}

function showMenuError(msg) {
  ui.menuError.textContent = msg;
  ui.menuError.hidden = false;
}

function toMenu() {
  game.state = 'menu';
  ui.hud.hidden = true;
  ui.countdown.hidden = true;
  ui.pause.hidden = true;
  ui.results.hidden = true;
  ui.menu.hidden = false;
  ui.skipPreview.hidden = true;
  audio.stopNotes();
  removeLadder();
  clearFx();
  regenerate();
}

function setPaused(p) {
  if (p && ['playing', 'countdown', 'preview', 'demo'].includes(game.state)) {
    game.prevState = game.state;
    game.state = 'paused';
    ui.pause.hidden = false;
  } else if (!p && game.state === 'paused') {
    game.state = game.prevState;
    ui.pause.hidden = true;
  }
}

function finishGame() {
  game.state = 'results';
  ui.hud.hidden = true;
  const total = level.walls.length;
  const ratio = game.firstTry / total;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
  $('resTitle').textContent = ['Keep practising!', 'Not bad!', 'Great singing!', 'Superstar!'][stars];
  $('resStars').innerHTML = [0, 1, 2].map(k => `<span class="${k < stars ? '' : 'off'}">★</span>`).join('');
  $('resScore').textContent = `${game.firstTry} / ${total} (${Math.round(ratio * 100)}%)`;
  $('resScoreLabel').textContent = settings.wallBreaks ? 'Holes cleared' : 'Cleared first try';
  $('resBouncesRow').hidden = settings.wallBreaks;
  $('resBounces').textContent = String(game.bounces);
  $('resStreak').textContent = String(game.bestStreak);
  $('resCents').textContent = game.centsN ? `${Math.round(game.centsSum / game.centsN)} cents` : '—';
  ui.results.hidden = false;
}

// ---------------------------------------------------------------------------
// Per-frame update
// ---------------------------------------------------------------------------
function updatePitch(now) {
  const target = currentTargetWall();
  const ref = target ? target.midi : (level.minMidi + level.maxMidi) / 2;
  if (settings.input === 'mouse') {
    game.heardMidi = game.sungMidi = readMousePitch();
    return;
  }
  const info = tracker.update(audio.analyze(settings.sensitivity), now);
  // The tracker works on the pitch as heard; octave folding is applied after
  // filtering so a change of target octave can't make the filter glide.
  game.heardMidi = info.out;
  if (info.out === null) game.foldShift = null;
  game.sungMidi = info.out === null ? null
    : settings.octaveFold ? foldSticky(info.out, ref) : info.out;
  if (settings.showDebug) debugOverlay.push(info, target ? target.midi : null, game.sungMidi);
}

// Tuner gauge: ±50 cents maps to ±60° of needle swing; flat leans left, sharp right.
const TUNER_SWING = 60;
function buildTunerGauge() {
  const cx = 100, cy = 100, r = 78;
  const pt = (deg, rad) => {
    const a = deg * Math.PI / 180;
    return `${(cx + rad * Math.sin(a)).toFixed(2)} ${(cy - rad * Math.cos(a)).toFixed(2)}`;
  };
  const arc = (c0, c1) => {
    const a0 = (c0 / 50) * TUNER_SWING, a1 = (c1 / 50) * TUNER_SWING;
    return `M ${pt(a0, r)} A ${r} ${r} 0 0 1 ${pt(a1, r)}`;
  };
  const zones = [[-50, -20, 'far'], [-20, -IN_TUNE_CENTS, 'near'], [-IN_TUNE_CENTS, IN_TUNE_CENTS, 'ok'],
    [IN_TUNE_CENTS, 20, 'near'], [20, 50, 'far']];
  let svg = zones.map(([a, b, cls]) => `<path class="zone ${cls}" d="${arc(a, b)}"/>`).join('');
  for (let c = -50; c <= 50; c += 10) {
    const a = (c / 50) * TUNER_SWING;
    const inner = c === 0 ? r - 16 : r - 10;
    svg += `<path class="tick" d="M ${pt(a, inner)} L ${pt(a, r - 5)}"/>`;
  }
  svg += `<text class="flat" x="${cx - r + 6}" y="${cy + 14}">♭</text><text class="sharp" x="${cx + r - 6}" y="${cy + 14}">♯</text>`;
  ui.tuner.querySelector('.tuner-scale').innerHTML = svg;
}

function updateTuner() {
  if (!settings.showTuner) return;
  const m = game.heardMidi;
  if (m === null) {
    ui.tuner.className = 'tuner silent';
    ui.tunerNote.textContent = '—';
    ui.tunerCents.textContent = 'listening…';
    ui.tunerNeedle.style.transform = 'rotate(0deg)';
    return;
  }
  const nearest = Math.round(m);
  const cents = (m - nearest) * 100; // -50 … +50
  const shown = Math.round(cents);
  const state = Math.abs(shown) <= IN_TUNE_CENTS ? 'ok' : Math.abs(shown) <= 20 ? 'near' : 'far';
  ui.tuner.className = `tuner ${state}`;
  ui.tunerNote.textContent = midiToName(nearest);
  ui.tunerCents.textContent = state === 'ok' ? 'in tune' : `${Math.abs(shown)}¢ ${cents < 0 ? 'flat' : 'sharp'}`;
  ui.tunerNeedle.style.transform = `rotate(${(cents / 50) * TUNER_SWING}deg)`;
}

function updateBall(dt, prevD) {
  const maxY = level.wallH - BALL_R;
  const targetY = game.sungMidi === null
    ? BALL_R
    : Math.min(maxY, Math.max(BALL_R, level.yFor(game.sungMidi)));
  // Live pitch is already filtered, so this just eases lift-off; the demo glides like a singer.
  const k = game.sungMidi === null ? 9 : game.state === 'demo' ? 30 : 40;
  game.freeY += (targetY - game.freeY) * (1 - Math.exp(-k * dt));
  ball.position.y = game.freeY;
  ball.position.z = -game.d;
  const moved = game.d - prevD;
  const onGround = ball.position.y < BALL_R + 0.05;
  ball.rotation.x -= moved / BALL_R * (onGround ? 1 : 0.35);
  const glow = game.sungMidi === null ? 0 : 0.35;
  ballMat.emissive.setRGB(glow, glow * 0.7, 0);
}

// While the ball is inside a wall it can't leave the hole: it scrapes along
// the edge instead of clipping through the wall.
function constrainBall() {
  const tol = level.holeR - BALL_R;
  for (let idx = game.nextWall; idx < level.walls.length; idx++) {
    const w = level.walls[idx];
    if (w.dStart > game.d) break;
    // In break mode a ball that's way off still ploughs into the wall (it shatters).
    const nearHole = Math.abs(game.freeY - w.holeY) <= level.holeR;
    if (w.state === 'pending' && game.d <= w.dEnd && (!settings.wallBreaks || nearHole)) {
      ball.position.y = Math.min(w.holeY + tol, Math.max(w.holeY - tol, ball.position.y));
    }
  }
  // Behind the current wall (rolling back after a bounce) the previous wall is already cleared.

  // Trail
  trailPos.copyWithin(3, 0, (TRAIL_N - 1) * 3);
  trailPos[0] = 0; trailPos[1] = ball.position.y; trailPos[2] = ball.position.z;
  trailGeo.attributes.position.needsUpdate = true;
}

function updateWalls(prevD) {
  const tol = level.holeR - BALL_R;
  const y = game.freeY;
  for (let idx = game.nextWall; idx < level.walls.length; idx++) {
    const w = level.walls[idx];
    if (w.dStart > game.d + BEAT_LEN) break;

    // Guide tone just under a beat before each wall
    const demo = game.state === 'demo';
    if (settings.guideTone && !w.toneDone && game.d >= w.dStart - 0.9 * BEAT_LEN && game.state === 'playing') {
      w.toneDone = true;
      const dur = Math.min(0.45, 0.6 * 60 / settings.bpm);
      audio.playTone(w.midi, dur, 0.16, !settings.headphones);
    }

    if (w.state !== 'pending') continue;
    if (demo) {
      if (game.d >= w.dEnd) { w.state = 'pass'; burst(w); }
      continue;
    }
    const canRetry = !settings.wallBreaks && (settings.maxRetries === 0 || w.attempts < settings.maxRetries);
    // Bounce mode: hitting solid wall (not just grazing the rim) bounces at once.
    if (canRetry && prevD + BALL_R < w.dStart && game.d + BALL_R >= w.dStart && Math.abs(y - w.holeY) > level.holeR) {
      game.d = w.dStart - BALL_R;
      ball.position.z = -game.d;
      bounceOff(w);
      break;
    }
    const overlap = Math.min(game.d, w.dEnd) - Math.max(prevD, w.dStart);
    if (overlap > 0) {
      const err = Math.abs(y - w.holeY);
      if (err > tol) w.outDist += overlap;
      if (game.sungMidi !== null) {
        w.errSum += Math.abs(game.sungMidi - w.midi) * 100;
        w.samples++;
      }
      const allowance = Math.min(0.25 * game.speed, 0.5 * (w.dEnd - w.dStart));
      if (w.outDist > allowance) {
        if (canRetry) {
          bounceOff(w);
          break; // the ball is now heading backwards; nothing further to check this frame
        }
        resolveWall(w, false);
        continue;
      }
    }
    if (game.d >= w.dEnd) resolveWall(w, true);
  }
  while (game.nextWall < level.walls.length && level.walls[game.nextWall].state !== 'pending') game.nextWall++;
}

function resolveWall(w, passed) {
  w.state = passed ? 'pass' : 'fail';
  if (passed) {
    game.score++;
    if (w.attempts === 0) game.firstTry++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    const cents = w.samples ? w.errSum / w.samples : 0;
    game.centsSum += cents;
    game.centsN++;
    burst(w);
    if (w.attempts > 0) toast('Got it!', '#9be86b');
    else if (cents < 15) toast('Perfect!', '#5ee08a');
    else if (cents < 35) toast('Great!', '#9be86b');
    else toast('Good', '#ffcc33');
    if (settings.sfx) audio.playChime(true, !settings.headphones);
  } else {
    game.streak = 0;
    game.shake = 0.35;
    shatter(w);
    const sung = game.sungMidi;
    if (sung === null) toast('Sing!', '#ff6070');
    else toast(sung < w.midi ? 'Too low ↑' : 'Too high ↓', '#ff6070');
    if (settings.sfx) audio.playChime(false, !settings.headphones);
  }
}

function bounceOff(w) {
  w.attempts++;
  w.outDist = 0;
  w.errSum = 0;
  w.samples = 0;
  w.flash = 1;
  game.bounces++;
  game.streak = 0;
  game.shake = 0.2;
  // Roll back far enough to come out of the front of the wall (even from deep
  // inside a long tunnel) with a short run-up for the next try.
  const backDist = Math.max(2.5, game.d - w.dStart + BALL_R + 2);
  game.vel = -Math.sqrt(2 * BOUNCE_ACCEL * game.speed * backDist);
  const sung = game.sungMidi;
  const left = settings.maxRetries === 0 ? '' : ` (${settings.maxRetries - w.attempts + 1} left)`;
  if (sung === null) toast('Sing!' + left, '#ff6070');
  else toast((sung < w.midi ? 'Too low ↑' : 'Too high ↓') + left, '#ff6070');
  if (settings.sfx) audio.playChime(false, !settings.headphones);
  if (settings.guideTone) setTimeout(() => {
    if (game.state === 'playing') audio.playTone(w.midi, 0.4, 0.16, !settings.headphones);
  }, 350);
}

// Walls flash red when the ball bounces off them.
const RED = new THREE.Color(0xff3344);
function updateWallFlash(dt) {
  if (!level) return;
  for (let idx = game.nextWall; idx < level.walls.length; idx++) {
    const w = level.walls[idx];
    if (w.dStart > game.d + 3 * BEAT_LEN) break;
    if (w.flash <= 0) continue;
    w.flash = Math.max(0, w.flash - dt * 2.5);
    w.mesh.material.emissive.copy(w.color).multiplyScalar(0.12).lerp(RED, w.flash * 0.8);
  }
}

// Karaoke-style lyric bar: the current line with the syllable being sung
// highlighted, and the next line below it.
let lyricCache = '';
const escHtml = t => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function lyricLineHtml(line, cur) {
  let html = '';
  level.syllables.forEach((s, i) => {
    if (s.line !== line) return;
    const cls = cur === null || i > cur ? 'ly-future' : i === cur ? 'ly-now' : 'ly-past';
    html += `<span class="${cls}">${escHtml(s.text)}</span>${s.wordEnd ? ' ' : ''}`;
  });
  return html;
}
function updateLyrics() {
  const show = settings.showLyrics && level && level.syllables.length > 0;
  ui.lyrics.hidden = !show;
  if (!show) return;
  // Highlight a syllable just before its beat, so there's time to read it.
  const ahead = game.d + 0.12 * game.speed;
  let cur = null;
  for (const n of level.notes) {
    if (n.onset > ahead) break;
    if (n.syl !== undefined) cur = n.syl;
  }
  const line = cur === null ? level.syllables[0].line : level.syllables[cur].line;
  const key = `${line}:${cur}`;
  if (key === lyricCache) return;
  lyricCache = key;
  ui.lyricCur.innerHTML = lyricLineHtml(line, cur);
  ui.lyricNext.innerHTML = lyricLineHtml(line + 1, null);
}

function updateHud() {
  updateLyrics();
  updateTuner();
  const target = currentTargetWall();
  ui.score.textContent = `${game.score} / ${level.walls.length}`;
  ui.streak.textContent = String(game.streak);
  ui.target.textContent = target ? midiToName(target.midi) : '—';
  if (game.sungMidi === null) {
    ui.sung.textContent = '—';
    ui.sung.className = '';
  } else {
    const nearest = Math.round(game.sungMidi);
    const cents = Math.round((game.sungMidi - nearest) * 100);
    ui.sung.textContent = `${midiToName(nearest)} ${cents >= 0 ? '+' : ''}${cents}¢`;
    const inTune = target && Math.abs(game.sungMidi - target.midi) * SEMI <= level.holeR - BALL_R;
    ui.sung.className = inTune ? 'in-tune' : 'off-tune';
  }
  const lastEnd = level.walls[level.walls.length - 1].dEnd;
  ui.progress.style.width = `${Math.min(100, (game.d / lastEnd) * 100)}%`;
}

// Camera
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
function desiredCamera(outPos, outLook) {
  if (game.state === 'preview' || (game.state === 'paused' && game.prevState === 'preview')) {
    // Hold still and frame the whole ladder, looking at it from the side a little.
    const pv = game.preview;
    const lo = level.yFor(pv.notes[0]), hi = level.yFor(pv.notes[pv.notes.length - 1]);
    const mid = (lo + hi) / 2, span = Math.max(6, hi - lo + 3);
    const lift = span * 0.07; // leave room under the HUD bar
    outPos.set(3 + span * 0.15, mid + lift + 0.5, span * 1.05 + 3.5);
    outLook.set(1.2, mid + lift, 0);
    return;
  }
  const h = level ? level.wallH : 10;
  const z = ball.position.z;
  const midY = h * 0.42;
  const camY = midY * 0.45 + ball.position.y * 0.55;
  outPos.set(2.5 + h * 0.06, camY + 1.6 + h * 0.08, z + 7 + h * 0.45);
  outLook.set(0, camY, z - 12);
}
function snapCamera() {
  desiredCamera(camPos, camLook);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}
const wantPos = new THREE.Vector3();
const wantLook = new THREE.Vector3();
function updateCamera(dt) {
  desiredCamera(wantPos, wantLook);
  const a = 1 - Math.exp(-5 * dt);
  camPos.lerp(wantPos, a);
  camLook.lerp(wantLook, a);
  camera.position.copy(camPos);
  if (game.shake > 0) {
    game.shake -= dt;
    const s = game.shake * 0.6;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
  camera.lookAt(camLook);

  sun.position.set(6, 22, ball.position.z + 8);
  sun.target.position.set(0, 0, ball.position.z - 6);

  if (level) for (const l of level.noteLabels) l.position.z = ball.position.z - 3;
}

let lastT = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (t - lastT) / 1000); // large steps are safe: wall checks use swept overlap
  lastT = t;
  const now = t / 1000;

  if (level && game.state !== 'paused') {
    const prevD = game.d;
    if (game.state === 'countdown' || game.state === 'playing') updatePitch(now);
    else game.sungMidi = null;

    if (game.state === 'preview') { updatePreview(dt); updateHud(); }
    if (game.state === 'demo') {
      game.d += game.speed * dt;
      updateDemo();
      updateBall(dt, prevD);
      updateWalls(prevD);
      constrainBall();
      updateHud();
      if (game.d >= level.endD) endDemo();
    }

    if (game.state === 'countdown') {
      game.countdown -= dt;
      const n = Math.ceil(game.countdown);
      ui.countdown.textContent = n > 0 ? String(n) : 'Go!';
      if (game.countdown <= -0.4) {
        ui.countdown.hidden = true;
        removeLadder();
        game.state = 'playing';
      } else if (game.countdown <= 0 && game.state === 'countdown') {
        // let "Go!" show briefly while the ball starts moving
        game.d += game.speed * dt;
      }
    } else if (game.state === 'playing') {
      // After a bounce the ball rolls backwards, then picks up speed again.
      if (game.vel < game.speed) game.vel = Math.min(game.speed, game.vel + BOUNCE_ACCEL * game.speed * dt);
      game.d += game.vel * dt;
    } else if (game.state === 'menu') {
      // gentle idle drift so the preview feels alive
      game.d = (Math.sin(now * 0.3) * 0.5 + 0.5) * Math.min(30, level.endD * 0.3);
    }

    if (game.state === 'countdown' || game.state === 'playing') {
      updateBall(dt, prevD);
      updateWalls(prevD);
      constrainBall();
      updateHud();
      if (settings.showDebug) debugOverlay.draw();
      if (game.d >= level.endD) finishGame();
    } else if (game.state === 'menu') {
      ball.position.z = -game.d;
    }
    updateFx(dt);
    updateFadingWalls(dt);
    updateWallFlash(dt);
    updateAim();
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
populateSelects();
buildTunerGauge();
writeForm();
readForm(); // normalise anything the stored settings had that the form rejected

form.addEventListener('input', e => {
  if ('custom' in e.target.dataset) { onCustomEdit(e); return; }
  if (e.target.id === 'songSelect') {
    deleteArmed = false;
    if (e.target.value === NEW_SONG) {
      createCustomSong();
      regenerate();
      return;
    }
    const c = findCustom(e.target.value);
    if (c) { settings.song = e.target.value; playCustomAsWritten(c); writeForm(); }
  }
  readForm();
  saveSettings();
  // Only rebuild the level when a setting that affects it changes.
  const name = e.target.name;
  if (['input', 'sensitivity', 'guideTone', 'headphones', 'sfx', 'octaveFold', 'wallBreaks', 'maxRetries', 'showTuner', 'showDebug', 'previewScale', 'demoTrack'].includes(name)) {
    refreshMenuLabels();
  } else if (name === 'holeScale' || name === 'bpm' || name === 'showLyrics') {
    buildLevel(sequence); // same notes, new geometry/spacing
    refreshMenuLabels();
  } else {
    regenerate();
  }
});
form.addEventListener('submit', e => {
  e.preventDefault();
  if (customSongError()) return;
  readForm();
  saveSettings();
  startGame(true);
});
$('btnReshuffle').addEventListener('click', regenerate);
ui.csExample.addEventListener('click', () => {
  const c = findCustom(settings.song);
  if (!c) return;
  Object.assign(c, { text: EXAMPLE_SONG, lyrics: EXAMPLE_LYRICS, root: 7, mode: 'major' });
  if (/^My song \d+$/.test(c.name)) c.name = 'Amazing Grace (custom)';
  parseCustom(c);
  saveCustomSongs();
  populateSongSelect();
  playCustomAsWritten(c);
  saveSettings();
  writeForm();
  regenerate();
});
ui.csDelete.addEventListener('click', () => {
  const c = findCustom(settings.song);
  if (!c) return;
  if (!deleteArmed) { deleteArmed = true; refreshCustomEditor(); return; }
  deleteArmed = false;
  customSongs.splice(customSongs.indexOf(c), 1);
  setCustomSong(customKey(c), null);
  saveCustomSongs();
  populateSongSelect();
  settings.song = 'twinkle';
  saveSettings();
  writeForm();
  regenerate();
});
$('btnPause').addEventListener('click', () => setPaused(true));
$('btnResume').addEventListener('click', () => setPaused(false));
$('btnQuit').addEventListener('click', toMenu);
$('btnPauseQuit').addEventListener('click', toMenu);
$('btnAgain').addEventListener('click', () => startGame(settings.mode !== 'random'));
$('btnSettings').addEventListener('click', toMenu);
function skipIntro() {
  if (game.state === 'preview') endPreview();
  else if (game.state === 'demo') endDemo();
}
$('btnSkipPreview').addEventListener('click', skipIntro);
window.addEventListener('keydown', e => {
  if ((game.state === 'preview' || game.state === 'demo') && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    skipIntro();
  }
  if ((e.key === 'd' || e.key === 'D') && game.state !== 'menu') {
    settings.showDebug = !settings.showDebug;
    ui.debug.hidden = !settings.showDebug;
    if (!settings.showDebug) debugOverlay.clear();
    saveSettings();
    writeForm();
  }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (game.state === 'paused') setPaused(false);
    else setPaused(true);
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

regenerate();
requestAnimationFrame(frame);

// Handy for debugging from the browser console.
window.pitchBall = { game, settings, camera, ball, tracker, get level() { return level; } };
