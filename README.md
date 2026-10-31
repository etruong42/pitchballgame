# Pitch Ball

A 3D singing game in the browser. Each note you need to sing is shown as a **hole in a wall**: the higher the note, the higher the hole. Your voice controls a **ball**: the higher you sing, the higher it floats. The ball keeps rolling forward, so sing the right pitch to fly it through each hole. When you're silent, the ball rolls along the ground and bounces off the wall (or smashes through it, if you turn that on).

## Run it

```bash
npm start          # serves the game at http://localhost:8081
```

Open http://localhost:8081 and allow microphone access. Browsers only allow the mic on secure pages, and `http://localhost` counts as one. Any static file server works too (for example `python3 -m http.server 8081`). There's no build step. Three.js loads from a CDN, so the first load needs internet access.

## Settings

**Notes to sing**
- **Song**: Mary Had a Little Lamb, Twinkle Twinkle, Hot Cross Buns, Ode to Joy, Frère Jacques, Row Row Row Your Boat, London Bridge, Happy Birthday, Old MacDonald, Amazing Grace, Jingle Bells. You can pick the **key** (any of the 12 notes), the **octave**, and the **mode** (major, natural/harmonic minor, dorian, mixolydian). Note lengths follow the song's rhythm. Long notes become thick "tunnel" walls, so you have to hold the pitch all the way through.
- **Custom songs**: pick **＋ New custom song…** in the Song list and type the notes in. Each song has a name and the key it's written in. Songs are saved in your browser and appear under "Your songs". Picking one sets Key, Octave and Mode so it plays as written; change them to transpose or re-mode it. Errors are reported with the line and the token, and Start stays disabled until the song is fixed. The format:
  - `G4` is one beat of G in octave 4 (`C4` = middle C). Sharps and flats work: `F#3`, `Bb4`.
  - `G4:2` is two beats, `G4:0.5` half a beat, `G4:1/3` a triplet.
  - `R:1` is a one-beat rest (a gap with no wall).
  - `G4:0.25~` is a quick note: heard in the demo, but with no wall.
  - Separate notes with spaces, commas or new lines. `|` bar lines and `// comments` are ignored.
- **Lyrics**: songs show the syllable to sing on each wall (above the note name) and in a karaoke line at the bottom of the screen. The syllable to sing lights up on its beat, and the next line shows below. Every built-in song has public-domain lyrics. Ode to Joy uses the hymn "Joyful, Joyful, We Adore Thee", and Frère Jacques uses the English "Are you sleeping". Scales and random notes show movable-do solfège (do re mi…). Custom songs take an optional **Lyrics** box: one syllable per note, hyphens between syllables (`A-ma-zing`), `_` to hold a syllable over another note, and `/` or a new line to start a new karaoke line. The status line reports if the syllable count doesn't match the notes. Turn it all off with *Show lyrics*.
- **Short notes**: any note shorter than 0.18 s at the chosen tempo is slowed to 0.18 s so the ball has time to move between walls. The menu says how many notes were slowed. At 80 BPM, every built-in song keeps its exact rhythm.
- **Scale**: root, octave, scale type (major, minors, modes, pentatonics, blues, chromatic), direction (up, down, up & down) and 1–2 octaves.
- **Random**: a random sequence between a lowest and highest note, optionally limited to a key/scale, with a cap on how far consecutive notes can jump.

**Difficulty**
- **Hole size**, as a multiple of the ball's size (1.2×–5×). The menu shows how far off pitch that lets you be (for example, 2.5× = ±75 cents).
- **Tempo** (40–160 BPM).
- **Any octave counts**: your pitch is folded into the target's octave, so any voice can play any song.
- **Misses**: by default the ball bounces off the wall, rolls back, and gets another try. The wall flashes red and the guide tone plays again. Choose how many retries you get (1, 2, 3, 5 or unlimited) before the wall breaks anyway so the song can go on. Turn on **Walls break when you miss** for no second chances: the wall shatters and the ball carries on. Near-misses are guided through the hole; hitting solid wall bounces right away.

**Sound & input**
- Microphone (with a sensitivity control) or **mouse/touch**: hold the button and move up and down. This is handy for trying the game without singing.
- **Tuner gauge** (on by default): a corner gauge showing the note the app hears, in its real octave. The needle leans left when you're flat and right when you're sharp, compared with the nearest note. The gauge turns green within ±5 cents, yellow within ±20 cents, and red beyond that.

**Speaker sounds** (all off until you turn them on)

Your mic can pick up sound from your speakers, so while any of these play, the mic pauses. Tick **I'm wearing headphones** to keep the mic on.
- **Play the scale first:** before the ball rolls, the game plays the challenge's scale. For a song, that's its key and mode across the song's range (at least tonic to octave). For random notes, it's the chosen key and scale across the notes generated. As each note plays, the ball rises to that note's height and leaves a labelled rung, so you can see each note's level before you sing. Press Space or **Skip scale** to skip it.
- **Demo the track first:** the game plays the whole track on autopilot. Each note plays through the speakers in rhythm while the ball flies through every hole. Then the level resets and it's your turn. If the scale preview is also on, the scale comes first. Press Space or **Skip demo** to skip.
- **Guide tone:** plays each note just before its wall.
- **Sound effects:** chimes for cleared and missed walls.

Settings are saved in `localStorage`.

## While you play

The control strip at the top right of the game has:
- **⏮ Rewind** (← or R): goes back to the start of the current line, with a short run-up. Its walls go back up. If you haven't cleared a note of that line yet, it goes back one more line. Lines are the lyric lines, or groups of 8 notes when there are no lyrics. A note you missed or bounced off before rewinding doesn't count as "first try" when you sing it again.
- **− / +** (− and + keys, or [ and ]): slower or faster, in 10% steps from 50% to 150% of the tempo you picked. The walls stay where they are and the ball moves more slowly or quickly. This works during the countdown and the demo too. Play again keeps the speed; starting from the menu resets it to 100%.

## After the song

The results screen shows the usual totals, plus how sharp or flat you sang on average (**lean**). Below that:
- **What to work on**: habits spotted in your singing, such as going flat on the high notes, overshooting upward jumps, or long notes sagging as you hold them. It also names the line that gave you the most trouble. Only the parts of each note sung within a semitone of the target count toward these, so a wrong note doesn't look like a tuning habit.
- **Note by note**: one card per line, with a trace of your pitch drawn over the target notes and a chip for each note. Each chip shows the syllable, the note, and how sharp (+) or flat (−) you were, colored green (within 15¢), light green (within 35¢), yellow (cleared) or red (missed). ↻ shows retries. If you bounced off a wall, only the last try is shown.
- **Practise ▸** on any line loops just that line. It starts at 80% speed (or slower, if you sang the song slower). A clean pass, with every note first try, speeds it up 10%. Two missed passes in a row slow it down 10%. A clean pass at full speed masters the line. Press **Done practising** at any time to go back to the song's results.

## How pitch detection works

1. **Detect** (`js/audio.js`): each frame, YIN estimates the pitch from the latest ~43 ms of audio and reports its *CMND*, a 0–1 score of how aperiodic the sound is (≈ 1 / (1 + signal-to-noise ratio)). It doesn't make any keep-or-discard decisions.
2. **Track** (`js/pitchtrack.js`):
   - **Volume decides silence.** The volume gate has separate start and stop levels, and the note ends after 150 ms below it. Loud but unclear audio (breath, consonants, noise) *holds* the last pitch for up to 0.5 s instead of dropping the ball.
   - **Two thresholds.** Starting a note, or jumping far from the current pitch, needs clean readings (CMND ≤ 0.15). Once a note is going, weaker readings (≤ 0.35) still count if they're within a semitone of it.
   - **Confirmation.** A far jump needs two agreeing clean readings in a row, so a one-frame octave error can't move the ball.
   - **Weighting and smoothing.** Readings are weighted by how clean they are and smoothed with a **One-Euro filter**: heavy smoothing on a held note (calms vibrato and noise), light smoothing while the pitch is moving (quick note changes).
3. **Fold** (`js/main.js`): with "Any octave counts", the smoothed pitch is moved into the target's octave. The chosen octave sticks until you're more than 7.5 semitones away, so a big leap doesn't flip the ball down an octave halfway through.

**Debug overlay:** turn on *Show pitch-detection debug overlay* (or press **D** in a game). It shows a scrolling chart of raw readings, coloured by what the tracker did with them, plus the filtered pitch and the target. Below that are CMND and volume charts with their thresholds, and a live readout with the share of each decision over the last 2 seconds. To tune the thresholds live, edit `pitchBall.tracker.p` in the browser console (e.g. `pitchBall.tracker.p.weak = 0.4`). The defaults are `TRACK_DEFAULTS` in `js/pitchtrack.js`.

## Files

- `index.html`, `style.css`: UI
- `js/main.js`: the Three.js scene, game loop, scoring and menu wiring
- `js/audio.js`: microphone capture, YIN pitch detection, guide tones
- `js/pitchtrack.js`: silence and confidence decisions plus the One-Euro filter (turns raw estimates into a steady pitch track)
- `js/debug.js`: the pitch-detection debug overlay
- `js/review.js`: the results review: tips about sharp/flat habits, per-line pitch traces and note chips
- `js/music.js`: note maths, scales, songs, sequence generation
- `server.js`: a tiny zero-dependency static server
