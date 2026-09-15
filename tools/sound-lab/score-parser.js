/* Sheet-music readers: Standard MIDI (.mid), MusicXML (.musicxml/.xml and compressed .mxl),
   ABC notation (.abc) and a plain-text note list (.txt/.csv). Also writes Standard MIDI.
   Output: {title, format, tempo, parts:[{id,name,percussion}], notes:[{t,d,midi,velocity,part}], duration, warnings}.
   No dependencies; the DOM parser and raw-deflate decoder are injected so Node tests can run it. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoreParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_NOTES = 20000;
  const STEP = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function finish(score) {
    score.notes = score.notes.filter(n => n.d > 0 && n.midi >= 0 && n.midi <= 127).sort((a, b) => a.t - b.t || a.midi - b.midi);
    if (score.notes.length > MAX_NOTES) { score.warnings.push(`Only the first ${MAX_NOTES} notes are used.`); score.notes.length = MAX_NOTES; }
    score.duration = score.notes.reduce((v, n) => Math.max(v, n.t + n.d), 0);
    if (!score.notes.length) score.warnings.push('No playable pitched notes were found.');
    return score;
  }
  // Tempo map: [{beat, bpm}] sorted → converts beats (quarter notes) to seconds.
  function tempoClock(changes, fallback = 120) {
    const map = (changes.length ? changes : [{beat: 0, bpm: fallback}]).slice().sort((a, b) => a.beat - b.beat);
    if (map[0].beat > 0) map.unshift({beat: 0, bpm: map[0].bpm});
    let seconds = 0; map.forEach((m, i) => { m.at = seconds; if (map[i + 1]) seconds += (map[i + 1].beat - m.beat) * 60 / m.bpm; });
    return beat => { let m = map[0]; for (const x of map) { if (x.beat <= beat) m = x; else break; } return m.at + (beat - m.beat) * 60 / m.bpm; };
  }

  /* ---------- Standard MIDI ---------- */
  function parseMidi(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const str = (at, n) => String.fromCharCode(...bytes.subarray(at, at + n));
    if (bytes.length < 14 || str(0, 4) !== 'MThd') throw Error('Not a Standard MIDI file');
    const format = view.getUint16(8), trackCount = view.getUint16(10), division = view.getUint16(12);
    if (division & 0x8000) throw Error('SMPTE-timed MIDI files are not supported');
    let at = 8 + view.getUint32(4);
    const tempos = [], raw = [], names = {}, warnings = [];
    let title = '';
    for (let track = 0; track < trackCount && at + 8 <= bytes.length; track++) {
      if (str(at, 4) !== 'MTrk') { warnings.push('Skipped a malformed track chunk.'); break; }
      const end = Math.min(bytes.length, at + 8 + view.getUint32(at + 4));
      let p = at + 8, tick = 0, status = 0;
      const open = new Map();
      const vlq = () => { let v = 0, b; do { if (p >= end) throw Error('Truncated MIDI track'); b = bytes[p++]; v = (v << 7) | (b & 127); } while (b & 128); return v; };
      while (p < end) {
        tick += vlq();
        let b = bytes[p];
        if (b & 128) { status = b; p++; } else if (!status) throw Error('Invalid MIDI running status');
        const type = status & 0xF0, ch = status & 15;
        if (status === 0xFF) {
          const meta = bytes[p++], len = vlq(), data = bytes.subarray(p, p + len); p += len;
          if (meta === 0x51 && len === 3) tempos.push({tick, bpm: 60e6 / ((data[0] << 16) | (data[1] << 8) | data[2])});
          if (meta === 0x03) { const name = new TextDecoder().decode(data).trim(); if (track === 0 && !title) title = name; names[track] = name; }
          if (meta === 0x2F) break;
          status = 0;
        } else if (status === 0xF0 || status === 0xF7) { p += vlq(); status = 0; }
        else if (type === 0x90 || type === 0x80) {
          const key = bytes[p++], vel = bytes[p++], id = ch * 128 + key;
          if (type === 0x90 && vel > 0) { if (!open.has(id)) open.set(id, []); open.get(id).push({tick, vel}); }
          else { const stack = open.get(id); if (stack && stack.length) { const on = stack.shift(); raw.push({on: on.tick, off: tick, key, vel: on.vel, part: track + ':' + ch}); } }
        } else if (type === 0xC0 || type === 0xD0) p += 1;
        else p += 2;
      }
      for (const [id, stack] of open) for (const on of stack) raw.push({on: on.tick, off: tick, key: id % 128, vel: on.vel, part: track + ':' + Math.floor(id / 128)});
      at = end;
    }
    const clock = tempoClock(tempos.map(x => ({beat: x.tick / division, bpm: x.bpm})), 120);
    const partIds = [...new Set(raw.map(n => n.part))];
    const parts = partIds.map(id => { const [track, ch] = id.split(':').map(Number); return {id, name: (names[track] || 'Track ' + (track + 1)) + ' · ch ' + (ch + 1), percussion: ch === 9}; });
    if (format === 2) warnings.push('MIDI format 2 (independent sequences) is played as simultaneous tracks.');
    return finish({title: title || 'MIDI score', format: 'MIDI', tempo: tempos.length ? tempos[0].bpm : 120, parts, warnings,
      notes: raw.map(n => ({t: clock(n.on / division), d: clock(n.off / division) - clock(n.on / division), midi: n.key, velocity: n.vel / 127, part: n.part}))});
  }

  function writeMidi(notes, bpm = 120, title = 'Sound Lab export') {
    const ppq = 480, tickOf = s => Math.round(s * ppq * bpm / 60), events = [];
    for (const n of notes) { if (n.play === null) continue; const key = clamp(Math.round(n.play ?? n.midi), 0, 127), vel = clamp(Math.round((n.velocity ?? .8) * 127), 1, 127); events.push([tickOf(n.t), 1, key, vel], [tickOf(n.t + n.d), 0, key, 0]); }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const body = [], vlq = v => { const out = [v & 127]; while ((v >>= 7)) out.unshift((v & 127) | 128); body.push(...out); };
    const name = Array.from(new TextEncoder().encode(title.slice(0, 120)));
    vlq(0); body.push(0xFF, 0x03); vlq(name.length); body.push(...name);
    const mpq = Math.round(60e6 / bpm); vlq(0); body.push(0xFF, 0x51, 3, (mpq >> 16) & 255, (mpq >> 8) & 255, mpq & 255);
    let last = 0; for (const [tick, on, key, vel] of events) { vlq(tick - last); last = tick; body.push(on ? 0x90 : 0x80, key, on ? vel : 64); }
    vlq(0); body.push(0xFF, 0x2F, 0);
    const out = new Uint8Array(22 + body.length), view = new DataView(out.buffer);
    out.set([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1], 0); view.setUint16(12, ppq); out.set([77, 84, 114, 107], 14); view.setUint32(18, body.length); out.set(body, 22);
    return out;
  }

  /* ---------- MusicXML ---------- */
  function parseMusicXML(text, DOMParserImpl) {
    const Parser = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!Parser) throw Error('MusicXML needs a DOM parser');
    const doc = new Parser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw Error('The MusicXML file is not valid XML');
    const root = doc.documentElement;
    if (!root || !/score-(partwise|timewise)/.test(root.nodeName)) throw Error('Not a MusicXML score');
    if (root.nodeName === 'score-timewise') throw Error('Timewise MusicXML is not supported; export it as partwise');
    const kids = (el, name) => Array.from(el.childNodes).filter(n => n.nodeName === name);
    const kid = (el, name) => kids(el, name)[0];
    const num = (el, name, fallback = 0) => { const k = el && kid(el, name); const v = k ? parseFloat(k.textContent) : NaN; return Number.isFinite(v) ? v : fallback; };
    const warnings = [], names = {}, tempos = [], notes = [];
    for (const sp of Array.from(doc.getElementsByTagName('score-part'))) names[sp.getAttribute('id')] = (kid(sp, 'part-name')?.textContent || sp.getAttribute('id')).trim();
    const title = (doc.getElementsByTagName('work-title')[0] || doc.getElementsByTagName('movement-title')[0])?.textContent?.trim() || 'MusicXML score';
    let unpitched = 0, repeats = false, grace = 0;
    const parts = [];
    for (const part of kids(root, 'part')) {
      const id = part.getAttribute('id') || 'P' + (parts.length + 1);
      let divisions = 1, beat = 0, transpose = 0, velocity = .75, percussion = false, lastStart = 0;
      const ties = new Map();
      for (const measure of kids(part, 'measure')) {
        for (const el of Array.from(measure.childNodes)) {
          if (el.nodeType !== 1) continue;
          const name = el.nodeName;
          if (name === 'attributes') {
            divisions = num(el, 'divisions', divisions) || divisions;
            const tr = kid(el, 'transpose'); if (tr) transpose = num(tr, 'chromatic') + 12 * num(tr, 'octave-change');
          } else if (name === 'sound' || name === 'direction') {
            const sound = name === 'sound' ? el : el.getElementsByTagName('sound')[0];
            if (sound?.getAttribute('tempo') && parts.length === 0) tempos.push({beat, bpm: clamp(parseFloat(sound.getAttribute('tempo')) || 120, 10, 400)});
            if (sound?.getAttribute('dynamics')) velocity = clamp(parseFloat(sound.getAttribute('dynamics')) / 110, .05, 1);
            if (name === 'direction') { const metro = el.getElementsByTagName('metronome')[0]; if (metro && parts.length === 0 && !sound?.getAttribute('tempo')) { const pm = metro.getElementsByTagName('per-minute')[0]; const unit = metro.getElementsByTagName('beat-unit')[0]?.textContent; const scale = {whole: 4, half: 2, quarter: 1, eighth: .5, '16th': .25}[unit] || 1; if (pm && parseFloat(pm.textContent)) tempos.push({beat, bpm: clamp(parseFloat(pm.textContent) * scale, 10, 400)}); } }
          } else if (name === 'backup') beat -= num(el, 'duration') / divisions;
          else if (name === 'forward') beat += num(el, 'duration') / divisions;
          else if (name === 'barline') { if (el.getElementsByTagName('repeat').length) repeats = true; }
          else if (name === 'note') {
            if (kid(el, 'grace')) { grace++; continue; }
            const dur = num(el, 'duration') / divisions, chord = !!kid(el, 'chord'), start = chord ? lastStart : beat;
            if (!chord) { lastStart = beat; beat += dur; }
            if (kid(el, 'rest')) continue;
            if (kid(el, 'unpitched')) { unpitched++; percussion = true; continue; }
            const p = kid(el, 'pitch'); if (!p) continue;
            const step = kid(p, 'step')?.textContent.trim().toUpperCase();
            if (!(step in STEP)) continue;
            const midi = (num(p, 'octave', 4) + 1) * 12 + STEP[step] + num(p, 'alter') + transpose;
            const tieTypes = kids(el, 'tie').map(t => t.getAttribute('type'));
            const dyn = el.getAttribute('dynamics'), vel = dyn ? clamp(parseFloat(dyn) / 110, .05, 1) : velocity;
            if (tieTypes.includes('stop') && ties.has(midi)) { const held = ties.get(midi); held.end = start + dur; if (!tieTypes.includes('start')) ties.delete(midi); continue; }
            const note = {start, end: start + dur, midi: Math.round(midi), velocity: vel, part: id};
            notes.push(note);
            if (tieTypes.includes('start')) ties.set(midi, note);
          }
        }
      }
      parts.push({id, name: names[id] || id, percussion: percussion && !notes.some(n => n.part === id)});
    }
    if (repeats) warnings.push('Repeat signs are ignored; the score plays straight through.');
    if (unpitched) warnings.push(unpitched + ' unpitched percussion notes were skipped.');
    if (grace) warnings.push(grace + ' grace notes were skipped.');
    const clock = tempoClock(tempos, 120);
    return finish({title, format: 'MusicXML', tempo: tempos[0]?.bpm || 120, parts, warnings,
      notes: notes.map(n => ({t: clock(n.start), d: clock(n.end) - clock(n.start), midi: n.midi, velocity: n.velocity, part: n.part}))});
  }

  // Compressed MusicXML (.mxl) is a ZIP. inflateRaw(Uint8Array) → Promise<Uint8Array>.
  async function unzipMusicXML(buffer, inflateRaw) {
    const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1; for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw Error('Not a valid .mxl (ZIP) file');
    const entries = new Map(), count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    for (let i = 0; i < count && p + 46 <= bytes.length; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true), nameLen = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true), offset = view.getUint32(p + 42, true);
      entries.set(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)), {method, size, offset});
      p += 46 + nameLen + extra + comment;
    }
    const read = async name => {
      const e = entries.get(name); if (!e) throw Error('Missing ' + name + ' in .mxl');
      const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true), data = bytes.subarray(start, start + e.size);
      if (e.method === 0) return data;
      if (e.method !== 8) throw Error('Unsupported compression in .mxl');
      if (!inflateRaw) throw Error('This browser cannot decompress .mxl files; export uncompressed MusicXML instead');
      return inflateRaw(data);
    };
    let target = null;
    if (entries.has('META-INF/container.xml')) { const m = /full-path="([^"]+)"/.exec(new TextDecoder().decode(await read('META-INF/container.xml'))); if (m) target = m[1]; }
    target = target || [...entries.keys()].find(n => !n.startsWith('META-INF') && /\.(musicxml|xml)$/i.test(n));
    if (!target) throw Error('No MusicXML score inside the .mxl file');
    return new TextDecoder().decode(await read(target));
  }

  /* ---------- ABC notation (common subset) ---------- */
  const KEY_ACCIDENTALS = {C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7};
  const MODE_SHIFT = {maj: 0, ion: 0, min: -3, m: -3, aeo: -3, dor: -2, phr: -4, lyd: 1, mix: -1, loc: -5};
  function keySignature(k) {
    const m = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(k || 'C'); if (!m) return {};
    const mode = (m[3] || 'maj').toLowerCase(), shift = MODE_SHIFT[mode] ?? MODE_SHIFT[mode.slice(0, 3)] ?? 0;
    const tonic = m[1] + m[2]; // circle-of-fifths position of the tonic as a major key, shifted for the mode
    let count = (KEY_ACCIDENTALS[tonic] ?? 0) + shift;
    if (!(tonic in KEY_ACCIDENTALS)) { const alt = {'G#': 8, 'D#': 9, 'A#': 10, Fb: -8}; count = (alt[tonic] ?? 0) + shift; }
    const sig = {}, sharps = 'FCGDAEB', flats = 'BEADGCF';
    for (let i = 0; i < Math.min(7, Math.abs(count)); i++) sig[(count > 0 ? sharps : flats)[i]] = count > 0 ? 1 : -1;
    return sig;
  }
  function fraction(text, fallback = 1) { if (!text) return fallback; const m = /^(\d*)(\/+)?(\d*)$/.exec(text); if (!m) return fallback; const num = m[1] ? +m[1] : 1; let den = 1; if (m[2]) den = m[3] ? +m[3] : 2 ** m[2].length; return num / den; }
  function parseABC(text) {
    const warnings = [], notes = [];
    let title = '', meter = '4/4', unit = null, tempo = 120, tempoUnit = .25, sig = {}, body = [], voices = 0;
    for (const line of String(text).split(/\r?\n/)) {
      const h = /^([A-Za-z]):\s*(.*)$/.exec(line.trim());
      if (h && 'XTMLQKCOZNRSWHBDGFIPV'.includes(h[1])) {
        const v = h[2].replace(/%.*/, '').trim();
        if (h[1] === 'T' && !title) title = v; else if (h[1] === 'M') meter = v; else if (h[1] === 'L') unit = fraction(v, .125);
        else if (h[1] === 'Q') { const q = /(?:(\d+\/\d+)\s*=\s*)?(\d+)/.exec(v); if (q) { tempo = clamp(+q[2], 10, 400); tempoUnit = q[1] ? fraction(q[1], .25) : unit || .25; } }
        else if (h[1] === 'K') { sig = keySignature(v); body.push('\n'); }
        else if (h[1] === 'V') voices++;
        continue;
      }
      if (voices > 1) continue;
      body.push(line.replace(/%.*/, ''));
    }
    if (voices > 1) warnings.push('Only the first ABC voice is played.');
    if (unit === null) { const [a, b] = meter.split('/').map(Number); unit = a && b && a / b < .75 ? 1 / 16 : 1 / 8; }
    const secondsPerWhole = 60 / tempo / tempoUnit, src = body.join('\n');
    let i = 0, time = 0, bar = {}, lastNotes = [], broken = 0, tuplet = null, repeats = false, pendingTie = new Map();
    const push = (group, len) => {
      let lenMul = 1;
      if (broken) { lenMul = broken; broken = 0; }
      if (tuplet) { lenMul *= tuplet.q / tuplet.p; if (--tuplet.left <= 0) tuplet = null; }
      const d = len * lenMul * unit * secondsPerWhole;
      lastNotes = [];
      for (const g of group) {
        const tied = pendingTie.get(g.midi);
        if (tied) { tied.d += d; pendingTie.delete(g.midi); if (g.tie) pendingTie.set(g.midi, tied); lastNotes.push(tied); continue; }
        if (g.midi !== null) { const n = {t: time, d, midi: g.midi, velocity: .8, part: 'abc'}; notes.push(n); lastNotes.push(n); if (g.tie) pendingTie.set(g.midi, n); }
      }
      time += d;
      return d;
    };
    const readNote = () => {
      let acc = null;
      while (/[\^_=]/.test(src[i])) { acc = (acc || 0) + (src[i] === '^' ? 1 : src[i] === '_' ? -1 : 0); if (src[i] === '=') acc = 0; i++; }
      const letter = src[i]; if (!/[A-Ga-gzx]/.test(letter)) return null; i++;
      let octave = 0; while (src[i] === "'" || src[i] === ',') { octave += src[i] === "'" ? 1 : -1; i++; }
      const lm = /^(\d*\/*\d*)/.exec(src.slice(i)); i += lm[1].length;
      let tie = false; if (src[i] === '-') { tie = true; i++; }
      const len = fraction(lm[1], 1);
      if (letter === 'z' || letter === 'x') return {midi: null, len};
      const up = letter.toUpperCase();
      if (acc !== null) bar[up + octave + (letter === up ? 0 : 1)] = acc;
      const barAcc = bar[up + octave + (letter === up ? 0 : 1)];
      const alter = barAcc !== undefined ? barAcc : (sig[up] || 0);
      return {midi: 60 + (letter === up ? 0 : 12) + 12 * octave + STEP[up] + alter, len, tie};
    };
    while (i < src.length) {
      const c = src[i];
      if (c === '"') { const j = src.indexOf('"', i + 1); i = j < 0 ? src.length : j + 1; }
      else if (c === '!' || c === '+') { const j = src.indexOf(c, i + 1); i = j < 0 ? i + 1 : j + 1; }
      else if (c === '{') { const j = src.indexOf('}', i); i = j < 0 ? src.length : j + 1; }
      else if (c === '|' || c === ':') { if (src.slice(i, i + 2) === '|:' || src.slice(i, i + 2) === ':|') repeats = true; bar = {}; i++; if (/[0-9]/.test(src[i])) i++; }
      else if (c === '[' && /[A-Za-z]:/.test(src.slice(i + 1, i + 3))) { const j = src.indexOf(']', i); i = j < 0 ? src.length : j + 1; }
      else if (c === '[') { i++; const group = []; let len = 1; while (i < src.length && src[i] !== ']') { const n = readNote(); if (n) { group.push(n); len = n.len; } else i++; } i++; const lm = /^(\d*\/*\d*)/.exec(src.slice(i)); if (lm[1]) { len *= fraction(lm[1], 1); i += lm[1].length; } push(group, len); }
      else if (c === '(' && /\d/.test(src[i + 1])) { const p = +src[i + 1]; tuplet = {p, q: {2: 3, 3: 2, 4: 3, 5: 2, 6: 2, 7: 2, 9: 2}[p] || 2, left: p}; i += 2; }
      else if (c === '>' || c === '<') { const dots = /^[<>]+/.exec(src.slice(i))[0], k = 1 / 2 ** dots.length; const prev = lastNotes; const shift = c === '>' ? 1 - k : -(1 - k); const d0 = prev.length ? prev[0].d : 0; const delta = d0 * shift; prev.forEach(n => n.d += delta); time += delta; broken = c === '>' ? k : 2 - k; i += dots.length; }
      else if (/[\^_=A-Ga-gzx]/.test(c)) { const n = readNote(); if (n) push([n], n.len); else i++; }
      else if (c === 'Z') { const lm = /^Z(\d*)/.exec(src.slice(i)); const [a, b] = meter.split('/').map(Number); time += (+lm[1] || 1) * (a && b ? a / b : 1) * secondsPerWhole; i += lm[0].length; }
      else i++;
    }
    if (repeats) warnings.push('Repeat signs are ignored; the tune plays straight through.');
    return finish({title: title || 'ABC tune', format: 'ABC', tempo: tempo * tempoUnit / .25, parts: [{id: 'abc', name: title || 'Tune', percussion: false}], notes, warnings});
  }

  /* ---------- plain text: "tempo 96" then tokens like C4 E4/2 G4*2 A4. [C4 E4 G4] R ---------- */
  const NOTE_RE = /^([A-Ga-g])(#{1,2}|b{1,2}|♯|♭)?(-?\d)$/;
  function textMidi(token) { const m = NOTE_RE.exec(token); if (!m) return null; const acc = {'#': 1, '##': 2, '♯': 1, b: -1, bb: -2, '♭': -1}[m[2]] || 0; return (Number(m[3]) + 1) * 12 + STEP[m[1].toUpperCase()] + acc; }
  function parseText(text) {
    const warnings = [], notes = [], tempos = [];
    let beat = 0, velocity = .8, title = '', bad = 0;
    for (const rawLine of String(text).split(/\r?\n/)) {
      const line = rawLine.replace(/\/\/.*$/, '').trim();
      if (!line) continue;
      if (line.startsWith('#')) { const t = /^#\s*title\s*:\s*(.+)$/i.exec(line); if (t) title = t[1].trim(); continue; }
      const csv = line.split(',').map(x => x.trim());
      if (csv.length >= 3 && /^\d+(\.\d+)?$/.test(csv[0]) && /^\d+(\.\d+)?$/.test(csv[1])) { // start_beats,duration_beats,note[,velocity]
        const midi = /^\d+$/.test(csv[2]) ? +csv[2] : textMidi(csv[2]);
        if (midi === null) { bad++; continue; }
        notes.push({beat: +csv[0], beats: +csv[1], midi, velocity: csv[3] ? clamp(+csv[3] > 1 ? +csv[3] / 127 : +csv[3], .05, 1) : velocity});
        continue;
      }
      if (/^(start|time|beat)/i.test(csv[0])) continue; // CSV header
      const tokens = line.replace(/\[/g, ' [ ').replace(/\]([*\/\d.]*)/g, ' ]$1 ').split(/\s+/).filter(Boolean);
      for (let k = 0; k < tokens.length; k++) {
        const tok = tokens[k], low = tok.toLowerCase();
        if ((low === 'tempo' || low === 'bpm') && tokens[k + 1]) { tempos.push({beat, bpm: clamp(+tokens[++k] || 120, 10, 400)}); continue; }
        if ((low === 'vel' || low === 'velocity') && tokens[k + 1]) { velocity = clamp(+tokens[++k] || .8, .05, 1); continue; }
        if (tok === '|') continue;
        let group = [], lenTok = tok;
        if (tok === '[') { while (tokens[++k] && !tokens[k].startsWith(']')) group.push(tokens[k]); lenTok = tokens[k] && tokens[k] !== ']' ? tokens[k] : (group[group.length - 1] || ''); }
        else group = tok.split('+');
        const lenMatch = /((?:[*\/]\d+(?:\.\d+)?)*)(\.?)$/.exec(lenTok);
        let beats = 1;
        for (const op of lenMatch[1].match(/[*\/]\d+(?:\.\d+)?/g) || []) beats = op[0] === '*' ? beats * +op.slice(1) : beats / +op.slice(1);
        if (lenMatch[2]) beats *= 1.5;
        const names = group.map(g => g.replace(/((?:[*\/]\d+(?:\.\d+)?)*)(\.?)$/, ''));
        if (names.length === 1 && /^(r|rest|-)$/i.test(names[0])) { beat += beats; continue; }
        const midis = names.map(textMidi);
        if (midis.some(m => m === null)) { bad++; continue; }
        midis.forEach(midi => notes.push({beat, beats, midi, velocity}));
        beat += beats;
      }
    }
    if (bad) warnings.push(bad + ' unrecognised token' + (bad === 1 ? ' was' : 's were') + ' skipped (use names like C4, F#3, Bb2).');
    const clock = tempoClock(tempos, 120);
    return finish({title: title || 'Text score', format: 'Text', tempo: tempos[0]?.bpm || 120, parts: [{id: 'text', name: 'Notes', percussion: false}], warnings,
      notes: notes.map(n => ({t: clock(n.beat), d: clock(n.beat + n.beats) - clock(n.beat), midi: n.midi, velocity: n.velocity, part: 'text'}))});
  }

  async function parseFile(name, buffer, env = {}) {
    const bytes = new Uint8Array(buffer), ext = (/\.([a-z0-9]+)$/i.exec(name || '') || [])[1]?.toLowerCase();
    if (bytes.length > 8 * 1024 * 1024) throw Error('Score is too large (maximum 8 MB)');
    const head = String.fromCharCode(...bytes.subarray(0, 4));
    if (head === 'MThd') return parseMidi(bytes);
    if (head === 'PK\u0003\u0004' || ext === 'mxl') return parseMusicXML(await unzipMusicXML(bytes, env.inflateRaw), env.DOMParser);
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
    if (ext === 'musicxml' || ext === 'xml' || /<score-(partwise|timewise)/.test(text.slice(0, 4000))) return parseMusicXML(text, env.DOMParser);
    if (ext === 'abc' || /^X:\s*\d+/m.test(text) && /^K:/m.test(text)) return parseABC(text);
    if (ext === 'mid' || ext === 'midi') throw Error('Not a Standard MIDI file');
    return parseText(text);
  }

  return {parseMidi, writeMidi, parseMusicXML, unzipMusicXML, parseABC, parseText, parseFile, keySignature, MAX_NOTES};
});
