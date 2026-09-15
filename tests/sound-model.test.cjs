'use strict';
const assert = require('node:assert/strict');
const M = require('../tools/sound-lab/sound-model.js');
const Synth = require('../tools/sound-lab/sound-synth.js');
const P = require('../tools/sound-lab/score-parser.js');
let tests = 0; const pending = [];
const test = (name, fn) => pending.push(async () => { await fn(); tests++; console.log('PASS ' + name); });
const near = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} != ${b} (±${tol})`);
const rel = (a, b, frac, label = '') => near(a, b, Math.abs(b) * frac, label);
const cents = (a, b) => 1200 * Math.log2(a / b);
const config = (id, patch = {}) => { const c = M.fromPreset(id); return {...c, params: {...c.params, ...patch}}; };

/* ---------- notes ---------- */
test('Note names, parsing and A4 reference', () => {
  assert.equal(M.midiToFreq(69), 440); rel(M.midiToFreq(60), 261.6256, 1e-6); rel(M.midiToFreq(69, 432), 432, 1e-12);
  for (const [text, midi] of [['A4', 69], ['C4', 60], ['C#3', 49], ['Db3', 49], ['B#3', 60], ['Cb4', 59], ['E♭2', 39], ['F##5', 79], ['c-1', 0], ['G9', 127]]) assert.equal(M.parseNote(text), midi, text);
  for (const bad of ['H4', 'A', '', 'A10', 'C#-2', '4A']) assert.equal(M.parseNote(bad), null, bad);
  assert.equal(M.noteName(61), 'C♯4'); near(M.pitch(445).cents, cents(445, 440), 1e-9);
});

/* ---------- strings ---------- */
test('String fundamental follows Mersenne’s law exactly', () => {
  const c = config('acoustic-guitar'), p = c.params, mat = M.MATERIALS.string[p.material], d = p.diameter / 1000;
  const expected = Math.sqrt(p.tension / (mat.rho * Math.PI * d * d / 4)) / (2 * p.length);
  rel(M.analyze(c).f0, expected, 1e-12, 'f0');
  rel(M.analyze({...c, params: {...p, length: p.length / 2}}).f0, 2 * expected, 1e-12, 'half length');
  rel(M.analyze({...c, params: {...p, tension: p.tension * 4}}).f0, 2 * expected, 1e-12, '4× tension');
});
test('Plucked partials are sharpened by stiffness; bowed partials stay harmonic', () => {
  const c = config('piano'), a = M.analyze(c), p = c.params, mat = M.MATERIALS.string[p.material], core = p.diameter / 1000 * mat.core;
  const B = Math.PI ** 3 * mat.E * core ** 4 / (64 * p.tension * p.length ** 2);
  for (const x of a.partials.slice(0, 8)) rel(x.f, x.harmonic * a.f0 * Math.sqrt(1 + B * x.harmonic ** 2), 1e-12, 'partial ' + x.harmonic);
  assert.ok(a.partials[5].cents > 0, 'upper partials sharp');
  const bowed = M.analyze(config('violin'));
  for (const x of bowed.partials) near(x.cents, 0, 1e-9, 'bowed harmonic');
});
test('Plucking at 1/n of the length removes every nth partial', () => {
  const a = M.analyze(config('classical-guitar', {position: .25}));
  assert.ok(!a.partials.some(x => x.harmonic % 4 === 0), 'multiples of 4 absent');
  assert.ok(a.partials.some(x => x.harmonic === 2) && a.partials.some(x => x.harmonic === 3));
});
test('Over-tensioned strings are flagged', () => {
  const c = config('classical-guitar'); c.params.tension = 400;
  assert.ok(M.analyze(c).warnings.some(w => w.includes('break')));
});

/* ---------- air columns ---------- */
test('Closed tubes have only odd modes; open tubes have all', () => {
  const closed = M.analyze(config('clarinet')), open = M.analyze(config('flute'));
  assert.ok(closed.partials.every(x => x.harmonic % 2 === 1));
  assert.deepEqual(open.partials.slice(0, 4).map(x => x.harmonic), [1, 2, 3, 4]);
});
test('Air column pitch uses end correction and speed of sound', () => {
  const c = config('organ-open'), p = c.params, a = M.analyze(c), v = M.soundSpeed(p.temperature, p.humidity);
  near(M.soundSpeed(0, 0), 331.3, 1e-9); rel(M.soundSpeed(20, 0), 343.2, 1e-3);
  const low = v / (2 * (p.length + 2 * .6133 * p.bore / 2000)), none = v / (2 * p.length);
  assert.ok(a.f0 < none && a.f0 >= low * .9999, 'end correction lowers pitch by about 0.6 radius per open end');
  const warm = M.analyze({...c, params: {...p, temperature: p.temperature + 10}});
  rel(warm.f0 / a.f0, M.soundSpeed(p.temperature + 10, p.humidity) / v, 1e-9, 'pitch scales with sound speed');
});

/* ---------- bars ---------- */
test('Uniform free–free bar matches Euler–Bernoulli theory', () => {
  const modes = M.beamModes(0, .5), w = modes.map(m => Math.sqrt(m.lambda));
  rel(w[0] / (2 * Math.PI), 1.02797, 2e-4, 'f1 coefficient');
  [2.75654, 5.40392, 8.93295, 13.3443].forEach((ratio, i) => rel(w[i + 1] / w[0], ratio, 1e-3, 'mode ' + (i + 2)));
  const c = config('glockenspiel'), p = c.params, mat = M.MATERIALS.bar[p.material];
  const thin = {...p, length: 1000, thickness: 4};
  const ideal = 1.02797 * (thin.thickness / 1000) / (thin.length / 1000) ** 2 * Math.sqrt(mat.E / mat.rho);
  rel(M.analyze({...c, params: thin}).f0, ideal, 3e-4, 'slender bar f0');
  assert.ok(M.analyze(c).f0 < 1.02797 * p.thickness / 1000 / (p.length / 1000) ** 2 * Math.sqrt(mat.E / mat.rho), 'shear lowers a thick bar');
});
test('Undercut tuning reaches marimba and xylophone ratios', () => {
  for (const [id, ratio] of [['marimba', 4], ['xylophone', 3], ['vibraphone', 4]]) {
    const out = M.tuneBar(config(id), ratio), a = M.analyze(out.config);
    assert.equal(out.reached, true); near(a.metrics[0][1], ratio, 2e-3, id + ' ratio'); near(a.target.cents, 0, .01, id + ' pitch');
  }
  const unreachable = M.tuneOvertone(config('glockenspiel', {undercutSpan: .2}), 20);
  assert.equal(unreachable.reached, false);
});

/* ---------- membranes ---------- */
test('Unloaded membrane follows Bessel zero ratios', () => {
  const a = M.analyze(config('floor-tom', {airLoading: 0, pitchMode: '01'}));
  const byLabel = Object.fromEntries(a.partials.map(x => [x.label, x.f]));
  for (const [label, j] of [['Mode (1,1)', 3.83171], ['Mode (2,1)', 5.13562], ['Mode (0,2)', 5.52008]]) rel(byLabel[label] / byLabel['Mode (0,1)'], j / 2.40483, 1e-9, label);
  const c = config('floor-tom', {airLoading: 0}), p = c.params, sigma = M.MATERIALS.head[p.material].rho * p.thickness / 1000;
  rel(byLabel['Mode (0,1)'], 2.40483 * Math.sqrt(p.tension / sigma) / (2 * Math.PI * p.diameter / 2000), 1e-9, 'f01');
  near(M.besselJ(0, 2.40483), 0, 1e-5); near(M.besselJ(1, 1), .4400506, 1e-7);
});
test('Air-loaded timpani approaches published harmonic mode ratios', () => {
  const m = M.analyze(config('timpani')).metrics;
  near(m[2][1], 1.50, .04, '(2,1)'); near(m[3][1], 2.00, .06, '(3,1)'); near(m[4][1], 2.45, .12, '(4,1)');
});

/* ---------- calibration ---------- */
test('Every preset calibrates to its target within 0.01 cent', () => {
  assert.equal(M.PRESETS.length, 19);
  for (const p of M.PRESETS) { const a = M.analyze(M.fromPreset(p.id)); near(a.target.cents, 0, .01, p.id); M.validate(M.fromPreset(p.id)); }
});
test('Calibration solves any tuning field and reports limits', () => {
  for (const [id, fields] of [['acoustic-guitar', ['tension', 'length', 'diameter']], ['flute', ['length', 'temperature']], ['marimba', ['length', 'thickness']], ['timpani', ['tension', 'diameter', 'thickness']]]) {
    for (const key of fields) {
      const c = {...M.fromPreset(id), tuneBy: key, target: M.noteName(M.parseNote(M.fromPreset(id).target) + 2)};
      const {config: out, result} = M.calibrate(c);
      if (!result.limited) near(M.analyze(out).target.cents, 0, .01, id + ' ' + key);
    }
  }
  const c = {...M.fromPreset('ukulele'), target: 'C8'}, {result} = M.calibrate(c);
  assert.equal(result.limited, true);
});
test('A different A4 reference retunes calibration', () => {
  const c = {...M.fromPreset('violin'), a4: 415}, {config: out} = M.calibrate(c);
  rel(M.analyze(out).f0, 415, 1e-6);
});
test('Playing a note solves the physical adjustment for that pitch', () => {
  const c = M.fromPreset('acoustic-guitar'), oct = M.solve(c, 'length', 2 * M.analyze(c).f0);
  rel(oct.params.length, c.params.length / 2, 1e-9, 'twelfth fret halves the length');
  const drum = M.fromPreset('timpani'), up = M.forFrequency(drum, M.midiToFreq(M.parseNote('G2')));
  near(cents(up.f0, M.midiToFreq(M.parseNote('G2'))), 0, .01);
});

/* ---------- validation and exports ---------- */
test('Instrument JSON round-trips and rejects malformed files', () => {
  for (const p of M.PRESETS) { const c = M.fromPreset(p.id); assert.deepEqual(M.validate(JSON.parse(JSON.stringify({config: c}))), c); }
  const bad = [c => c.family = '__proto__', c => c.params.material = 'constructor', c => c.params.length = NaN, c => c.params.tension = -1, c => c.params.length = 99,
    c => c.target = 'H9', c => c.a4 = 1000, c => c.tuneBy = 'excitation', c => c.version = 2, c => c.name = 7, c => c.params.excitation = 'slap', c => delete c.params.range];
  for (const mutate of bad) { const c = M.fromPreset('acoustic-guitar'); mutate(c); assert.throws(() => M.validate(c)); }
  const bar = M.fromPreset('marimba'); bar.params.undercut = bar.params.thickness; assert.throws(() => M.validate(bar));
});
test('CSV guards formulas; report lists settings and partials', () => {
  const c = {...M.fromPreset('flute'), name: '=HYPERLINK("x")', notes: 'Room 21 °C'};
  const csv = M.csv(c);
  assert.ok(csv.startsWith('﻿')); assert.ok(csv.includes('"\'=HYPERLINK(""x"")"')); assert.ok(csv.includes('"frequency_hz"'));
  const txt = M.report(c);
  for (const term of ['Predicted pitch', 'Wall material: Silver', 'PARTIALS', 'Room 21 °C', 'Idealized']) assert.ok(txt.includes(term), term);
});
test('Range fitting folds, skips or extends out-of-range notes', () => {
  const notes = [40, 48, 60, 72, 90].map((midi, i) => ({t: i, d: 1, midi}));
  assert.deepEqual(M.fitRange(notes, 45, 70, 'octave').map(n => n.play), [52, 48, 60, 60, 66]);
  assert.deepEqual(M.fitRange(notes, 45, 70, 'skip').map(n => n.play), [null, 48, 60, null, null]);
  assert.deepEqual(M.fitRange(notes, 45, 70, 'extend').map(n => n.status), ['extended', 'ok', 'ok', 'extended', 'extended']);
  assert.deepEqual(M.fitRange(notes, 50, 55, 'octave').map(n => n.status), ['skipped', 'skipped', 'skipped', 'skipped', 'skipped'], 'no folding in a range under an octave');
});

/* ---------- score parsers ---------- */
test('Text scores: durations, dots, rests, chords, tempo and CSV rows', () => {
  const s = P.parseText('# title: T\ntempo 60\nC4 D4/2 E4*2 R F4. [C4 E4 G4]*2\n6.5,1,A4,0.5\n7.5,0.5,64');
  assert.equal(s.title, 'T');
  const got = s.notes.map(n => [n.midi, +n.t.toFixed(3), +n.d.toFixed(3)]);
  assert.deepEqual(got.slice(0, 7), [[60, 0, 1], [62, 1, .5], [64, 1.5, 2], [65, 4.5, 1.5], [60, 6, 2], [64, 6, 2], [67, 6, 2]]);
  assert.ok(got.some(n => n[0] === 69 && n[1] === 6.5) && got.some(n => n[0] === 64 && n[1] === 7.5));
  assert.equal(P.parseText('C4 H4 Q').warnings.length, 1);
});
test('ABC: key signatures, accidentals, broken rhythm, triplets and ties', () => {
  assert.deepEqual(P.keySignature('D'), {F: 1, C: 1}); assert.deepEqual(P.keySignature('Bb'), {B: -1, E: -1}); assert.deepEqual(P.keySignature('Am'), {}); assert.deepEqual(P.keySignature('Edor'), {F: 1, C: 1});
  const s = P.parseABC('X:1\nT:t\nM:4/4\nL:1/4\nQ:1/4=60\nK:G\nF =F ^F F | A>B (3cde c2- | c2 z2 |');
  const m = s.notes.map(n => n.midi), d = s.notes.map(n => +n.d.toFixed(3));
  assert.deepEqual(m.slice(0, 4), [66, 65, 66, 66], 'key sharp, natural and bar-scoped accidentals');
  assert.deepEqual(d.slice(4, 6), [1.5, .5], 'broken rhythm'); assert.deepEqual(d.slice(6, 9), [.667, .667, .667], 'triplet');
  assert.equal(d.at(-1), 4, 'tie across barline merges durations'); assert.equal(s.tempo, 60);
  assert.equal(P.parseABC('X:1\nM:6/8\nL:1/8\nQ:3/8=40\nK:C\nC').tempo, 60, 'dotted-quarter tempo reported in quarter notes');
});
test('MIDI writer and reader round-trip timing, tempo and velocity', () => {
  const notes = [{t: 0, d: .5, midi: 60, velocity: .5}, {t: .5, d: .25, midi: 64, velocity: 1}, {t: .5, d: 1, midi: 67, velocity: .8}, {t: 2, d: .1, play: 72, midi: 70, velocity: .3}, {t: 3, d: 1, play: null, midi: 10}];
  const back = P.parseMidi(P.writeMidi(notes, 90, 'Round trip'));
  assert.equal(back.title, 'Round trip'); rel(back.tempo, 90, 1e-3);
  assert.deepEqual(back.notes.map(n => n.midi), [60, 64, 67, 72]);
  back.notes.forEach((n, i) => { near(n.t, notes[i].t, 2e-3); near(n.d, notes[i].d, 2e-3); near(n.velocity, notes[i].velocity, 1 / 127); });
});
test('MIDI reader handles running status, note-on velocity 0 and tempo changes', () => {
  const bytes = [77,84,104,100,0,0,0,6,0,0,0,1,0,96, 77,84,114,107,0,0,0,0];
  const body = [0,0xFF,0x51,3,0x07,0xA1,0x20, 0,0x90,60,100, 96,60,0, 0,62,90, 0,0xFF,0x51,3,0x03,0xD0,0x90, 96,0x80,62,0, 0,0xFF,0x2F,0];
  const file = new Uint8Array([...bytes, ...body]); new DataView(file.buffer).setUint32(18, body.length);
  const s = P.parseMidi(file);
  assert.deepEqual(s.notes.map(n => [n.midi, +n.t.toFixed(3), +n.d.toFixed(3)]), [[60, 0, .5], [62, .5, .25]]);
  assert.throws(() => P.parseMidi(new Uint8Array([1, 2, 3])));
});
test('.mxl ZIP reader finds the score through container.xml', async () => {
  const zlib = require('node:zlib'), enc = s => new TextEncoder().encode(s);
  const files = [['META-INF/container.xml', enc('<container><rootfiles><rootfile full-path="score/a.musicxml"/></rootfiles></container>'), 0], ['score/a.musicxml', enc('<score-partwise>hello</score-partwise>'), 8]];
  const local = [], central = []; let offset = 0;
  for (const [name, data, method] of files) {
    const body = method ? zlib.deflateRawSync(data) : data, n = enc(name), h = new Uint8Array(30 + n.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(8, method, true); v.setUint32(18, body.length, true); v.setUint32(22, data.length, true); v.setUint16(26, n.length, true); h.set(n, 30);
    const c = new Uint8Array(46 + n.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, method, true); cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, offset, true); c.set(n, 46);
    local.push(h, body); central.push(c); offset += h.length + body.length;
  }
  const cdSize = central.reduce((v, c) => v + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const zip = Buffer.concat([...local, ...central, end]);
  const xml = await P.unzipMusicXML(zip, async d => new Uint8Array(zlib.inflateRawSync(d)));
  assert.equal(xml, '<score-partwise>hello</score-partwise>');
  await assert.rejects(P.unzipMusicXML(new Uint8Array(30)));
});

/* ---------- synthesis ---------- */
// Spectral peak near a frequency: Hann-windowed single-bin DFT scanned in 0.25-cent steps over ±50 cents.
const peakCents = (x, sr, f, from = .1, seconds = .6) => {
  const st = Math.round(from * sr), N = Math.min(x.length - st, Math.round(seconds * sr)), win = Float64Array.from({length: N}, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1)));
  let best = -1, bestC = 0;
  for (let c = -50; c <= 50; c += .25) {
    const w = 2 * Math.PI * f * 2 ** (c / 1200) / sr; let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const v = x[st + i] * win[i]; re += v * Math.cos(w * i); im += v * Math.sin(w * i); }
    const mag = re * re + im * im; if (mag > best) { best = mag; bestC = c; }
  }
  return bestC;
};
test('Rendered audio has its fundamental at the predicted pitch', () => {
  for (const id of ['acoustic-guitar', 'ukulele', 'piano', 'violin', 'flute', 'clarinet', 'organ-stopped', 'marimba', 'glockenspiel', 'timpani']) {
    const c = M.fromPreset(id), a = M.analyze(c), x = Synth.renderNote(a, {duration: 1.2, letRing: true, vibrato: 0});
    // Resolution is limited by the 0.6 s window (about ±3 cents at 80 Hz); the model partial itself is exact.
    near(peakCents(x, 44100, a.f0), 0, a.f0 < 150 ? 4 : 2, id);
  }
});
test('Synthesis is deterministic, finite and WAV-encodable', () => {
  const a = M.analyze(M.fromPreset('violin')), o = {duration: .6, velocity: .7, vibrato: 12, seed: 3};
  const x = Synth.renderNote(a, o), y = Synth.renderNote(a, o);
  assert.deepEqual(x, y); assert.ok(x.every(Number.isFinite));
  const peak = Synth.normalize(x, -1); assert.ok(peak > 0); near(Math.max(...x.map(Math.abs)), 10 ** (-1 / 20), 1e-6);
  const wav = Synth.encodeWav(x, 44100), v = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), 'RIFF'); assert.equal(v.getUint32(24, true), 44100); assert.equal(v.getUint16(34, true), 16); assert.equal(v.getUint32(40, true), x.length * 2);
});
test('Score mixing places notes at their start times', async () => {
  const c = M.fromPreset('glockenspiel'), events = [{t: .5, d: .2, play: 84, velocity: .8}, {t: 1.5, d: .2, play: null}, {t: 2, d: .2, play: 88, velocity: .8}];
  const out = await Synth.mixScore(events, midi => M.forFrequency(c, M.midiToFreq(midi)), {sampleRate: 8000, maxTail: .5});
  const onset = from => { for (let i = from; i < out.samples.length; i++) if (Math.abs(out.samples[i]) > .01) return i / 8000; };
  near(onset(0), .5, .01); near(onset(Math.round(1.9 * 8000)), 2, .01);
  assert.ok(out.samples.slice(Math.round(1.2 * 8000), Math.round(1.9 * 8000)).every(v => Math.abs(v) < .01), 'rest is silent');
});

(async () => { for (const run of pending) await run(); console.log(`${tests} sound lab checks passed`); })().catch(e => { console.error(e); process.exit(1); });
