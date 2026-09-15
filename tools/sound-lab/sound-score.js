/* Sound Lab score playback and exports. Depends on window.Lab (sound-lab.js). */
'use strict';
(() => {
  const S = window.Studio, M = window.SoundModel, Synth = window.SoundSynth, P = window.ScoreParser, Lab = window.Lab, $ = S.$, esc = S.esc;
  const SAMPLES = {
    ode: () => ({name: 'ode.txt', text: '# title: Ode to Joy (Beethoven)\ntempo 112\nE4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4. D4/2 D4*2\nE4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4. C4/2 C4*2'}),
    greensleeves: () => ({name: 'greensleeves.abc', text: 'X:1\nT:Greensleeves\nM:6/8\nL:1/8\nQ:3/8=52\nK:Am\nA|c2d e>fe|d2B G>AB|c2A A>^GA|B2^G E2A|\nc2d e>fe|d2B G>AB|c>BA ^G>^FG|A3 A2|]'}),
    bach: () => ({name: 'minuet.txt', text: '# title: Minuet in G (Petzold, from the Anna Magdalena Bach notebook)\ntempo 132\nD5*2 G4 A4 B4 C5 | D5*2 G4*2 G4*2 | E5*2 C5 D5 E5 F#5 | G5*2 G4*2 G4*2\nC5*2 D5 C5 B4 A4 | B4*2 C5 B4 A4 G4 | F#4*2 G4 A4 B4 G4 | B4*2 A4*4'}),
    scale: () => { const [lo, hi] = Lab.rangeMidi(), a = Math.ceil(lo - .02), b = Math.floor(hi + .02), notes = []; for (let m = a; m <= b; m++) notes.push(M.noteName(m).replace('♯', '#') + '/2'); return {name: 'range-scale.txt', text: '# title: Chromatic range of ' + Lab.config.name + '\ntempo 150\n' + notes.join(' ')}; }
  };
  let score = null, fitted = [], rendered = null, renderKey = '', rendering = null, playback = null;

  /* ---------- loading ---------- */
  const inflateRaw = typeof DecompressionStream === 'function' ? async data => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : null;
  async function load(name, buffer) {
    try { setScore(await P.parseFile(name, buffer, {inflateRaw})); S.toast('Loaded ' + score.notes.length + ' notes from ' + score.format); }
    catch (e) { S.toast('Could not read this score: ' + e.message); }
  }
  function setScore(next) {
    stop(); score = next;
    $('scorePart').innerHTML = '<option value="all">All parts</option>' + score.parts.map(p => { const n = score.notes.filter(x => x.part === p.id).length; return `<option value="${esc(p.id)}"${!n ? ' disabled' : ''}>${esc(p.name)} · ${n} notes${p.percussion ? ' (percussion)' : ''}</option>`; }).join('');
    const pitched = score.parts.filter(p => !p.percussion && score.notes.some(n => n.part === p.id));
    $('scorePart').value = score.parts.some(p => p.percussion) && pitched.length ? (pitched.length === 1 ? pitched[0].id : 'all') : 'all';
    $('transpose').value = 0;
    update();
  }

  /* ---------- fitting notes to the calibrated instrument ---------- */
  function update() {
    if (!score) return;
    const part = $('scorePart').value, shift = S.clamp(Math.round(+$('transpose').value || 0), -36, 36), scale = 100 / +$('tempoScale').value;
    const drums = new Set(score.parts.filter(p => p.percussion).map(p => p.id));
    const notes = score.notes.filter(n => part === 'all' ? !drums.has(n.part) || score.parts.every(p => p.percussion) : n.part === part)
      .map(n => ({...n, t: n.t * scale, d: n.d * scale, midi: S.clamp(n.midi + shift, 0, 127)}));
    const [lo, hi] = Lab.rangeMidi();
    fitted = M.fitRange(notes, Math.ceil(lo - .02), Math.floor(hi + .02), $('rangePolicy').value);
    rendered = null;
    const counts = fitted.reduce((c, n) => (c[n.status] = (c[n.status] || 0) + 1, c), {});
    const dur = fitted.reduce((v, n) => Math.max(v, n.t + n.d), 0), minM = Math.min(...notes.map(n => n.midi)), maxM = Math.max(...notes.map(n => n.midi));
    $('scoreSummary').className = 'score-summary';
    $('scoreSummary').innerHTML = `<strong>${esc(score.title)}</strong>${esc(score.format)} · ${notes.length} notes · ${Math.round(score.tempo / scale)} BPM · ${time(dur)}${notes.length ? ` · written range ${M.noteName(minM)}–${M.noteName(maxM)}` : ''}<br>Instrument range ${M.noteName(Math.ceil(lo - .02))}–${M.noteName(Math.floor(hi + .02))}`;
    const label = {ok: 'in range', octave: 'octave-folded', skipped: 'skipped', extended: 'beyond range'};
    $('fitStats').innerHTML = Object.entries(counts).map(([k, v]) => `<span class="${k}">${v} ${label[k]}</span>`).join('');
    $('scoreWarnings').textContent = [...score.warnings, ...(counts.extended ? ['Notes beyond the playable range are extrapolated past the physical adjustment limits.'] : []), ...(dur > Synth.MAX_SECONDS ? ['Audio is limited to the first 20 minutes.'] : [])].join(' ');
    const playable = fitted.some(n => n.play !== null);
    $('playScore').disabled = $('exportScoreWAV').disabled = $('exportMIDI').disabled = !playable;
    $('scoreTime').textContent = '0:00 / ' + time(dur);
    roll();
  }
  const time = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  function roll(position = null) {
    const {g, w, h} = Lab.prepareCanvas($('pianoRoll'));
    if (!score || !fitted.length) { g.fillStyle = '#5d6578'; g.font = '12px system-ui, sans-serif'; g.fillText(score ? 'No notes to show for this part.' : 'The piano roll appears here when a score is loaded.', 16, h / 2); return; }
    const dur = Math.max(1, fitted.reduce((v, n) => Math.max(v, n.t + n.d), 0)), all = fitted.flatMap(n => n.play === null ? [n.midi] : [n.midi, n.play]);
    const [lo, hi] = Lab.rangeMidi(), top = Math.max(...all, Math.floor(hi)) + 1, bottom = Math.min(...all, Math.ceil(lo)) - 1, row = (h - 8) / (top - bottom + 1);
    const x = t => 8 + (w - 16) * t / dur, y = m => 4 + (top - m) * row;
    g.fillStyle = '#6fd39b12'; g.fillRect(0, y(Math.floor(hi + .02)), w, (Math.floor(hi + .02) - Math.ceil(lo - .02) + 1) * row);
    for (let m = bottom; m <= top; m++) if (m % 12 === 0) { g.fillStyle = '#1d2330'; g.fillRect(0, y(m) + row - 1, w, 1); g.fillStyle = '#5d6578'; g.font = '9px Consolas, monospace'; g.fillText('C' + (m / 12 - 1), 2, y(m) + row - 2); }
    const color = {ok: '#f2a541', octave: '#57dbff', skipped: '#ff7a7055', extended: '#f5c46b'};
    for (const n of fitted) {
      if (n.status === 'octave') { g.fillStyle = '#57dbff22'; g.fillRect(x(n.t), y(n.midi), Math.max(1.5, x(n.t + n.d) - x(n.t) - 1), Math.max(1.5, row - 1)); }
      const m = n.play ?? n.midi, active = position !== null && position >= n.t && position < n.t + n.d;
      g.fillStyle = active ? '#ffffff' : color[n.status]; g.fillRect(x(n.t), y(m), Math.max(2, x(n.t + n.d) - x(n.t) - 1), Math.max(2, row - 1));
    }
    if (position !== null) { g.fillStyle = '#ffffff'; g.fillRect(x(position), 0, 1.5, h); }
  }

  /* ---------- rendering and playback ---------- */
  const keyOf = rate => JSON.stringify([Lab.config.family, Lab.config.params, Lab.config.a4, fitted.map(n => [n.t, n.d, n.play, n.velocity]), Lab.letRing(), rate]);
  async function render(rate) {
    const key = keyOf(rate);
    if (rendered && renderKey === key) return rendered;
    if (rendering) { rendering.cancel = true; await rendering.done.catch(() => {}); }
    const job = {cancel: false}; rendering = job;
    const config = Lab.config, maxTail = Lab.letRing() ? 6 : .45, vibrato = config.params.vibrato || 0;
    $('renderProgress').value = 0;
    job.done = Synth.mixScore(fitted, midi => M.forFrequency(config, M.midiToFreq(midi, config.a4)), {sampleRate: rate, letRing: Lab.letRing(), maxTail, vibrato}, v => { $('renderProgress').value = v; }, () => new Promise(r => setTimeout(r, 0)), () => job.cancel);
    const out = await job.done;
    if (rendering === job) rendering = null;
    if (!out) return null;
    rendered = out; renderKey = key;
    return out;
  }
  async function play(offset = 0) {
    let ctx; try { ctx = Lab.audio.ensure(); } catch (e) { S.toast(e.message); return; }
    stop();
    $('playScore').disabled = true; $('playScore').textContent = 'Rendering…'; $('stopScore').disabled = false;
    const out = await render(44100); // same buffer as the WAV export; Web Audio resamples on playback
    $('playScore').textContent = '▶ Play score'; $('playScore').disabled = false;
    if (!out) return;
    if (out.truncated) S.toast('Only the first 20 minutes are rendered');
    const buffer = ctx.createBuffer(1, out.samples.length, out.sampleRate); buffer.copyToChannel(out.samples, 0);
    const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(Lab.audio.master);
    offset = S.clamp(offset, 0, out.seconds - .05);
    const started = ctx.currentTime + .05; src.start(started, offset);
    Lab.audio.sources.add(src); Lab.audio.live?.start?.();
    const state = playback = {src, started, offset, next: fitted.findIndex(n => n.t >= offset), frame: 0};
    if (state.next < 0) state.next = fitted.length;
    src.onended = () => { Lab.audio.sources.delete(src); if (playback === state) finish(); };
    $('stopScore').disabled = false;
    const dur = fitted.reduce((v, n) => Math.max(v, n.t + n.d), 0);
    const step = () => {
      if (playback !== state) return;
      const now = ctx.currentTime - started + offset;
      while (state.next < fitted.length && fitted[state.next].t <= now) {
        const n = fitted[state.next++];
        if (n.play === null || now - n.t > .25) continue;
        Lab.flashKey(n.play, Math.max(120, n.d * 900));
        try { Lab.scene.excite(M.forFrequency(Lab.config, M.midiToFreq(n.play, Lab.config.a4)), {velocity: n.velocity, hold: n.d, frac: Lab.noteDetails(n.play).frac}); } catch {}
      }
      $('scoreTime').textContent = time(Math.max(0, now)) + ' / ' + time(dur);
      $('renderProgress').value = S.clamp(now / Math.max(.001, out.seconds), 0, 1);
      roll(now);
      state.frame = requestAnimationFrame(step);
    };
    step();
  }
  function finish() { if (playback) cancelAnimationFrame(playback.frame); playback = null; $('stopScore').disabled = true; roll(); }
  function stop() {
    if (rendering) rendering.cancel = true;
    if (playback) { try { playback.src.stop(); } catch {} Lab.audio.sources.delete(playback.src); }
    finish();
    $('playScore').textContent = '▶ Play score'; $('playScore').disabled = !fitted.some(n => n.play !== null);
  }

  /* ---------- exports ---------- */
  const slug = () => (Lab.config.name || 'instrument').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'instrument';
  function projectJSON() {
    const c = Lab.config, a = Lab.analysis;
    return JSON.stringify({config: c, prediction: {f0: a.f0, note: a.pitch.name, centsFromNearest: a.pitch.cents, centsFromTarget: a.target.cents, centroidHz: a.centroid, t60: a.t60, inharmonicityCentsRms: a.inharmonicity, rangeHz: a.range, metrics: Object.fromEntries(a.metrics.map(([k, v, u]) => [k + (u ? ' (' + u + ')' : ''), v])), partials: a.partials.map(p => ({label: p.label, frequencyHz: p.f, ratio: p.ratio, cents: p.cents, levelDb: p.db, t60: p.t60})), warnings: a.warnings}, exported: new Date().toISOString(), model: 'Sound Lab physical model v1 — idealized; see README'}, null, 2);
  }
  function sheetSVG(width = 1200) {
    const c = Lab.config, a = Lab.analysis, settings = M.paramText(c), metrics = a.metrics.map(([k, v, u]) => [k, Lab.num(v) + (u ? ' ' + u : '')]);
    const parts = a.partials.slice(0, 16), rows = Math.max(settings.length, metrics.length + 6, parts.length);
    const H = 470 + rows * 22 + (a.warnings.length ? 40 + a.warnings.length * 22 : 0) + 60, fMin = 20, fMax = 20000;
    const cx = x => 60 + (width - 120) * Math.log(S.clamp(x, fMin, fMax) / fMin) / Math.log(fMax / fMin), cy = db => 200 + 170 * Math.min(1, -db / 60);
    const t = (x, y, s, o = '') => `<text x="${x}" y="${y}" ${o}>${esc(s)}</text>`;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" font-family="Segoe UI, Arial, sans-serif"><rect width="100%" height="100%" fill="#0b0d12"/>`;
    svg += t(60, 62, 'SOUND LAB · CALIBRATION SHEET', 'fill="#f2a541" font-size="13" font-weight="700" letter-spacing="2"') + t(60, 104, c.name, 'fill="#e9ecf2" font-size="34" font-weight="600"');
    svg += t(60, 134, M.FAMILIES[c.family].name + ' · target ' + c.target + ' at A4 = ' + c.a4 + ' Hz · exported ' + new Date().toISOString().slice(0, 10), 'fill="#8a93a6" font-size="14"');
    svg += t(width - 60, 100, a.pitch.name + '  ' + a.f0.toFixed(3) + ' Hz', 'fill="#e9ecf2" font-size="30" font-weight="600" text-anchor="end"') + t(width - 60, 130, Lab.signed(a.target.cents, 3) + '¢ from target · T60 ' + a.t60.toFixed(2) + ' s · centroid ' + Lab.hz(a.centroid), 'fill="#8a93a6" font-size="14" text-anchor="end"');
    svg += `<rect x="40" y="170" width="${width - 80}" height="230" rx="12" fill="#10141c" stroke="#252b38"/>`;
    for (const db of [0, -20, -40, -60]) svg += `<line x1="60" x2="${width - 60}" y1="${cy(db)}" y2="${cy(db)}" stroke="#1d2330"/>` + t(48, cy(db) + 4, db + '', 'fill="#5d6578" font-size="10" text-anchor="end"');
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) svg += t(cx(f), 392, f >= 1000 ? f / 1000 + 'k Hz' : f + ' Hz', 'fill="#5d6578" font-size="10" text-anchor="middle"');
    for (const p of a.partials) svg += `<line x1="${cx(p.f).toFixed(1)}" x2="${cx(p.f).toFixed(1)}" y1="370" y2="${cy(p.db).toFixed(1)}" stroke="#f2a541" stroke-width="2"/><circle cx="${cx(p.f).toFixed(1)}" cy="${cy(p.db).toFixed(1)}" r="3" fill="#ffc471"/>`;
    const col = (x, y, title, list) => t(x, y, title, 'fill="#f2a541" font-size="12" font-weight="700" letter-spacing="1.5"') + list.map((line, i) => t(x, y + 26 + i * 22, line, 'fill="#c9cfdb" font-size="13"')).join('');
    const third = (width - 120) / 3;
    svg += col(60, 440, 'SETTINGS', settings.map(s => s.length > 52 ? s.slice(0, 51) + '…' : s));
    svg += col(60 + third, 440, 'DERIVED', [...metrics.map(([k, v]) => k + ': ' + v), 'Brightness: ' + Lab.hz(a.centroid), 'Inharmonicity: ' + a.inharmonicity.toFixed(2) + '¢ rms', 'Range: ' + a.range.map(f => M.pitch(f, c.a4).name).join('–')]);
    svg += col(60 + 2 * third, 440, 'PARTIALS', parts.map((p, i) => (i + 1 + '').padStart(2) + '  ' + p.f.toFixed(1) + ' Hz  ×' + p.ratio.toFixed(3) + '  ' + p.db.toFixed(1) + ' dB'));
    let y = 470 + rows * 22;
    if (a.warnings.length) { svg += col(60, y, 'CHECKS', a.warnings.map(w => '! ' + (w.length > 140 ? w.slice(0, 139) + '…' : w))); y += 40 + a.warnings.length * 22; }
    svg += t(60, y + 24, 'Idealized physical model. Real instruments differ through construction, coupling, technique and room acoustics.', 'fill="#5d6578" font-size="12"');
    return svg + '</svg>';
  }
  function svgToPng(svg, name) {
    const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
    img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = img.width * 2; canvas.height = img.height * 2; const g = canvas.getContext('2d'); g.scale(2, 2); g.drawImage(img, 0, 0); URL.revokeObjectURL(url); S.canvasBlob(canvas, name); };
    img.onerror = () => { URL.revokeObjectURL(url); S.toast('PNG export failed in this browser'); };
    img.src = url;
  }
  function wav(samples, rate, name) { S.download(new Blob([Synth.encodeWav(samples, rate)], {type: 'audio/wav'}), name, 'audio/wav'); }
  async function exportScoreWav() {
    const btn = $('exportScoreWAV'); btn.disabled = true; btn.textContent = 'Rendering…';
    try { const out = await render(44100); if (out) { wav(out.samples, out.sampleRate, slug() + '-' + (score.title || 'score').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.wav'); S.toast('Score WAV exported · ' + time(out.seconds)); } }
    finally { btn.textContent = '↓ WAV score'; btn.disabled = !fitted.some(n => n.play !== null); }
  }
  function print() {
    const c = Lab.config, a = Lab.analysis;
    $('printArea').innerHTML = sheetSVG(1100) + `<h2>All partials</h2><table><thead><tr><th>#</th><th>Mode</th><th>Frequency</th><th>× f₀</th><th>Cents</th><th>Level</th><th>T60</th></tr></thead><tbody>${a.partials.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.label)}</td><td>${p.f.toFixed(2)} Hz</td><td>${p.ratio.toFixed(4)}</td><td>${Lab.signed(p.cents, 1)}</td><td>${p.db.toFixed(1)} dB</td><td>${p.t60.toFixed(2)} s</td></tr>`).join('')}</tbody></table>${c.notes ? `<h2>Notes</h2><p>${esc(c.notes)}</p>` : ''}`;
    window.print();
  }

  /* ---------- events ---------- */
  $('scoreFile').addEventListener('change', async e => { const f = e.target.files[0]; if (f) await load(f.name, await f.arrayBuffer()); e.target.value = ''; });
  const zone = $('dropZone');
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('over')));
  zone.addEventListener('drop', async e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) await load(f.name, await f.arrayBuffer()); });
  document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => { const s = SAMPLES[b.dataset.sample](); $('scoreText').value = s.text; load(s.name, new TextEncoder().encode(s.text)); }));
  $('applyText').addEventListener('click', () => { const text = $('scoreText').value; if (!text.trim()) { S.toast('Type some notes first'); return; } load(/^X:/m.test(text) ? 'typed.abc' : 'typed.txt', new TextEncoder().encode(text)); });
  ['scorePart', 'rangePolicy', 'transpose'].forEach(id => $(id).addEventListener('change', () => { stop(); update(); }));
  $('tempoScale').addEventListener('input', () => { $('tempoOut').value = $('tempoScale').value + '%'; });
  $('tempoScale').addEventListener('change', () => { stop(); update(); });
  $('letRing').addEventListener('change', () => { rendered = null; });
  $('playScore').addEventListener('click', () => play(0));
  $('stopScore').addEventListener('click', stop);
  $('pianoRoll').addEventListener('click', e => { if (!fitted.some(n => n.play !== null)) return; const r = e.currentTarget.getBoundingClientRect(), dur = Math.max(1, fitted.reduce((v, n) => Math.max(v, n.t + n.d), 0)); play(S.clamp((e.clientX - r.left - 8) / (r.width - 16), 0, 1) * dur); });
  Lab.onStop(stop);
  Lab.onChange(() => { if (score) { stop(); update(); } });
  window.addEventListener('resize', () => roll());

  $('exportJSON').addEventListener('click', () => { S.download(projectJSON(), slug() + '.sound-lab.json', 'application/json'); S.toast('Instrument JSON exported'); });
  $('exportCSV').addEventListener('click', () => { S.download(M.csv(Lab.config, Lab.analysis), slug() + '-partials.csv', 'text/csv'); S.toast('Partials CSV exported'); });
  $('exportTXT').addEventListener('click', () => { S.download(M.report(Lab.config, Lab.analysis), slug() + '-report.txt'); S.toast('Report exported'); });
  $('exportSVG').addEventListener('click', () => { S.download(sheetSVG(), slug() + '-calibration.svg', 'image/svg+xml'); S.toast('SVG sheet exported'); });
  $('exportPNG').addEventListener('click', () => svgToPng(sheetSVG(), slug() + '-calibration.png'));
  $('exportScene').addEventListener('click', async () => { const blob = await Lab.scene.snapshot(); if (blob) { S.download(blob, slug() + '-3d.png', 'image/png'); S.toast('3D snapshot exported'); } else S.toast('Snapshot failed'); });
  $('printSheet').addEventListener('click', print);
  $('exportToneWAV').addEventListener('click', () => {
    const c = Lab.config, hold = +$('hold').value, samples = Synth.renderNote(Lab.analysis, {sampleRate: 44100, duration: hold, velocity: +$('velocity').value / 100, letRing: Lab.letRing(), vibrato: c.params.vibrato || 0});
    Synth.normalize(samples, -1); wav(samples, 44100, slug() + '-' + c.target.replace('♯', 's') + '.wav'); S.toast('Test tone WAV exported');
  });
  $('exportScoreWAV').addEventListener('click', exportScoreWav);
  $('exportMIDI').addEventListener('click', () => { S.download(new Blob([P.writeMidi(fitted, score.tempo * +$('tempoScale').value / 100, score.title)], {type: 'audio/midi'}), slug() + '-as-played.mid', 'audio/midi'); S.toast('MIDI exported with range fitting applied'); });
  roll();

  window.LabScore = {get score() { return score; }, get fitted() { return fitted; }, load, setScore, render, play, stop, sheetSVG, projectJSON};
})();
