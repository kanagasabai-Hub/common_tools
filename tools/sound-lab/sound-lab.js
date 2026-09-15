/* Sound Lab controller: instrument editing, calibration, readouts, spectrum, keyboard and audio. */
'use strict';
window.Lab = (() => {
  const S = window.Studio, M = window.SoundModel, Synth = window.SoundSynth, $ = S.$, esc = S.esc;
  const STORE = 'bt-sound-instruments', CURRENT = 'bt-sound-current';
  const changeListeners = [], stopListeners = [];
  let config = restore(), analysis = M.analyze(config), octave = 2, sceneTimer = null;

  function restore() { try { return M.validate(S.read(CURRENT, null)); } catch { return M.initial(); } }

  /* ---------- formatting ---------- */
  const hz = f => !Number.isFinite(f) ? '—' : f >= 1000 ? (f / 1000).toFixed(2) + ' kHz' : f.toFixed(f < 100 ? 2 : 1) + ' Hz';
  const num = v => { if (!Number.isFinite(v)) return String(v); const a = Math.abs(v); return a !== 0 && a < .01 ? v.toExponential(2) : a >= 1000 ? Math.round(v).toLocaleString('en-US') : +v.toPrecision(4) + ''; };
  const signed = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const decimals = step => Math.max(0, Math.min(4, -Math.floor(Math.log10(step))));
  const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

  /* ---------- audio ---------- */
  const audio = {
    ctx: null, master: null, analyser: null, sources: new Set(),
    ensure() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw Error('Web Audio is not available in this browser');
        const ctx = this.ctx = new Ctx(), comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = .003; comp.release.value = .15;
        this.master = ctx.createGain(); this.master.gain.value = volume();
        this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = .72;
        this.master.connect(comp); comp.connect(this.analyser); this.analyser.connect(ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    play(samples, rate, when = 0) {
      const ctx = this.ensure(), buffer = ctx.createBuffer(1, samples.length, rate);
      buffer.copyToChannel(samples, 0);
      const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(this.master);
      src.start(ctx.currentTime + when); this.sources.add(src);
      src.onended = () => this.sources.delete(src);
      live.start();
      return src;
    },
    stop() { for (const s of this.sources) { try { s.stop(); } catch {} } this.sources.clear(); }
  };
  const volume = () => (+$('volume').value / 100) ** 2;

  /* ---------- scene ---------- */
  const scene = new window.SoundScene($('scene'), $('sceneOverlay'));
  $('renderer').textContent = scene.kind === 'webgl' ? 'LIVE 3D · WEBGL · THREE.JS R' + (window.THREE?.REVISION || '') : '2D PREVIEW · ' + (scene.error?.message || 'WEBGL UNAVAILABLE').toUpperCase();
  function scheduleScene(immediate) {
    clearTimeout(sceneTimer);
    const run = () => { try { scene.setInstrument(config, analysis); } catch (e) { console.error(e); } };
    immediate ? run() : sceneTimer = setTimeout(run, 90);
  }

  /* ---------- controls ---------- */
  function buildStatic() {
    $('familyTabs').innerHTML = Object.entries(M.FAMILIES).map(([id, f]) => `<button role="tab" data-family="${id}"><i aria-hidden="true">${f.icon}</i>${esc(f.name.split(' ')[0])}</button>`).join('');
    $('preset').innerHTML = Object.entries(M.FAMILIES).map(([id, f]) => `<optgroup label="${esc(f.name)}">${M.PRESETS.filter(p => p.family === id).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('') + '<option value="custom">Custom instrument</option>';
  }
  const fieldsOf = () => M.FAMILIES[config.family].fields;
  const narrow = () => window.innerWidth < 700; // phones: collapsed settings, two-octave keyboard
  const logScale = f => f.min > 0 && f.max / f.min >= 50;
  const toSlider = (f, v) => logScale(f) ? Math.round(1000 * Math.log(v / f.min) / Math.log(f.max / f.min)) : v;
  const fromSlider = (f, s) => logScale(f) ? f.min * (f.max / f.min) ** (s / 1000) : +s;

  function buildParams() {
    const groups = {};
    for (const f of fieldsOf()) (groups[f.group] = groups[f.group] || []).push(f);
    $('paramSections').innerHTML = Object.entries(groups).map(([name, fields], gi) => `<section class="section"><details class="param-group" ${gi < 3 && !narrow() ? 'open' : ''}><summary>${esc(name)}</summary>${fields.map(paramHtml).join('')}</details></section>`).join('');
    syncParams();
  }
  function paramHtml(f) {
    const id = 'p-' + f.key;
    if (f.type === 'select') {
      const opts = typeof f.options === 'string' ? Object.entries(M.MATERIALS[f.options]).map(([k, m]) => [k, m.name]) : f.options;
      return `<div class="param"><label for="${id}">${esc(f.label)}</label><select id="${id}" data-param="${f.key}">${opts.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>`;
    }
    if (f.type === 'bool') return `<label class="bool-param check" for="${id}"><span>${esc(f.label)}</span><input id="${id}" type="checkbox" data-param="${f.key}"></label>`;
    const s = logScale(f) ? 'min="0" max="1000" step="1"' : `min="${f.min}" max="${f.max}" step="${f.step}"`;
    return `<div class="param" data-wrap="${f.key}"><div class="param-head"><label for="${id}">${esc(f.label)}</label><span class="param-value"><input id="${id}" type="number" min="${f.min}" max="${f.max}" step="any" data-param="${f.key}"><span>${esc(f.unit)}</span></span></div><input type="range" ${s} data-slider="${f.key}" aria-label="${esc(f.label)} slider">${f.help ? `<p class="param-help">${esc(f.help)}</p>` : ''}</div>`;
  }
  function syncParams() {
    for (const f of fieldsOf()) {
      const el = $('p-' + f.key); if (!el) continue;
      const v = config.params[f.key];
      if (f.type === 'bool') el.checked = v;
      else if (f.type === 'select') el.value = v;
      else {
        if (document.activeElement !== el) el.value = +v.toFixed(decimals(f.step));
        const slider = document.querySelector(`[data-slider="${f.key}"]`); if (slider) slider.value = toSlider(f, v);
        document.querySelector(`[data-wrap="${f.key}"]`).classList.toggle('tuned', f.key === config.tuneBy);
      }
    }
  }
  function syncStatic() {
    document.querySelectorAll('[data-family]').forEach(b => { const on = b.dataset.family === config.family; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    $('familyBadge').textContent = M.FAMILIES[config.family].name.toUpperCase();
    $('preset').value = M.PRESETS.some(p => p.id === config.preset) ? config.preset : 'custom';
    $('instrumentName').value = config.name; $('targetNote').value = config.target; $('a4').value = config.a4; $('notes').value = config.notes;
    $('tuneBy').innerHTML = fieldsOf().filter(f => f.tune).map(f => `<option value="${f.key}">${esc(f.label)} (${esc(f.unit)})</option>`).join('');
    $('tuneBy').value = config.tuneBy;
    $('overtoneBox').hidden = config.family !== 'bar';
  }

  function setParam(key, value, commit) {
    const f = fieldsOf().find(x => x.key === key);
    if (f.type === 'number') { if (!Number.isFinite(value)) return; value = S.clamp(value, f.min, f.max); }
    config = {...config, preset: 'custom', params: {...config.params, [key]: value}};
    if (config.family === 'bar' && config.params.undercut > config.params.thickness * .9) config.params.undercut = +(config.params.thickness * .9).toFixed(2);
    refresh();
    if (commit) history.push();
  }

  /* ---------- analysis and readouts ---------- */
  function refresh({statics = false, scene: rebuild = true} = {}) {
    try { analysis = M.analyze(config); }
    catch (e) { S.toast('These settings cannot be modelled: ' + e.message); return; }
    if (statics) syncStatic();
    syncParams();
    readout(); spectrum(); partialTable(); warnings(); modeOptions(); buildKeyboard();
    $('preset').value = M.PRESETS.some(p => p.id === config.preset) ? config.preset : 'custom';
    if (rebuild) scheduleScene(statics);
    S.write(CURRENT, config);
    changeListeners.forEach(fn => fn(config, analysis));
  }
  function readout() {
    const a = analysis, cents = a.pitch.cents, off = a.target.cents;
    $('noteName').textContent = a.pitch.name;
    $('noteCents').textContent = signed(cents) + '¢';
    $('noteCents').className = 'cents ' + (Math.abs(cents) < 2 ? 'good' : Math.abs(cents) < 10 ? 'warn' : 'bad');
    $('noteHz').textContent = a.f0.toFixed(3) + ' Hz';
    $('tunerNeedle').style.left = (50 + S.clamp(off, -50, 50)) + '%';
    $('targetLine').innerHTML = `Target <strong>${esc(config.target)}</strong> · ${a.target.f.toFixed(3)} Hz · offset <strong class="${Math.abs(off) < 1 ? 'good' : 'bad'}">${signed(off, 2)}¢</strong>${Math.abs(off) > 50 ? ' (off scale)' : ''}`;
    $('statCentroid').textContent = hz(a.centroid);
    $('statT60').textContent = a.t60.toFixed(2) + ' s';
    $('statInharm').textContent = a.inharmonicity.toFixed(2) + '¢ rms';
    const [lo, hi] = a.range.map(f => M.pitch(f, config.a4));
    $('statRange').textContent = lo.name + '–' + hi.name;
    $('metricList').innerHTML = a.metrics.map(([k, v, u]) => `<div><dt>${esc(k)}</dt><dd>${esc(num(v))}${u ? ' ' + esc(u) : ''}</dd></div>`).join('');
    const slow = a.f0 / 1.25;
    $('slowMotion').textContent = 'MOTION SLOWED ≈' + (slow >= 100 ? Math.round(slow) : slow.toFixed(0)) + '×';
    const status = $('calibrateStatus');
    if (Math.abs(off) > .05 && !status.dataset.fresh) status.textContent = 'Not calibrated: ' + signed(off, 2) + '¢ from ' + config.target + '. Press Calibrate to solve ' + fieldsOf().find(f => f.key === config.tuneBy).label.toLowerCase() + '.';
    else if (!status.dataset.fresh) status.textContent = 'In tune with ' + config.target + ' (' + signed(off, 3) + '¢).';
    delete status.dataset.fresh;
  }
  function warnings() {
    const list = analysis.warnings;
    $('warningCount').textContent = list.length;
    $('warnings').innerHTML = list.length ? list.map(w => `<p>${esc(w)}</p>`).join('') : '<span class="ok">✓ No physical issues detected.</span>';
  }
  function partialTable() {
    $('partialCount').textContent = analysis.partials.length + ' PARTIALS';
    $('partialRows').innerHTML = analysis.partials.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.label)}</td><td>${p.f.toFixed(2)} Hz</td><td>${p.ratio.toFixed(3)}</td><td>${signed(p.cents, 1)}</td><td>${p.db.toFixed(1)} dB</td><td>${p.t60.toFixed(2)} s</td></tr>`).join('');
  }
  function modeOptions() {
    const sel = $('modeView'), keep = sel.value;
    sel.innerHTML = '<option value="">All modes · live</option>' + analysis.partials.slice(0, 10).map((p, i) => `<option value="${i}">${esc(p.label)} · ${hz(p.f)}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === keep) ? keep : '';
  }

  function prepareCanvas(canvas) {
    const r = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth || 600, h = canvas.clientHeight || 250;
    if (canvas.width !== Math.round(w * r) || canvas.height !== Math.round(h * r)) { canvas.width = Math.round(w * r); canvas.height = Math.round(h * r); }
    const g = canvas.getContext('2d'); g.setTransform(r, 0, 0, r, 0, 0); g.clearRect(0, 0, w, h);
    return {g, w, h};
  }
  function spectrum() {
    const {g, w, h} = prepareCanvas($('spectrum')), a = analysis, pad = {l: 38, r: 12, t: 14, b: 24};
    const fMin = 20, fMax = 20000, x = f => pad.l + (w - pad.l - pad.r) * Math.log(f / fMin) / Math.log(fMax / fMin), y = db => pad.t + (h - pad.t - pad.b) * Math.min(1, -db / 60);
    g.font = '10px Consolas, monospace'; g.lineWidth = 1;
    for (const db of [0, -20, -40, -60]) { g.strokeStyle = '#1d2330'; g.beginPath(); g.moveTo(pad.l, y(db)); g.lineTo(w - pad.r, y(db)); g.stroke(); g.fillStyle = '#5d6578'; g.fillText(db + ' dB', 2, y(db) + 3); }
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { g.strokeStyle = '#1a1f2b'; g.beginPath(); g.moveTo(x(f), pad.t); g.lineTo(x(f), h - pad.b); g.stroke(); g.fillStyle = '#5d6578'; g.fillText(f >= 1000 ? f / 1000 + 'k' : f, x(f) - 8, h - 8); }
    if (a.bodyGain) {
      let peak = 0; const pts = []; for (let i = 0; i <= 240; i++) { const f = fMin * (fMax / fMin) ** (i / 240), v = a.bodyGain(f); peak = Math.max(peak, v); pts.push([f, v]); }
      g.strokeStyle = '#57dbffaa'; g.setLineDash([4, 4]); g.beginPath(); pts.forEach(([f, v], i) => { const yy = y(20 * Math.log10(v / peak)); i ? g.lineTo(x(f), yy) : g.moveTo(x(f), yy); }); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = '#ffffff30'; g.beginPath(); g.moveTo(x(a.target.f), pad.t); g.lineTo(x(a.target.f), h - pad.b); g.stroke();
    a.partials.forEach((p, i) => {
      if (p.f < fMin || p.f > fMax) return;
      const px = x(p.f), py = y(p.db), grad = g.createLinearGradient(0, py, 0, h - pad.b);
      grad.addColorStop(0, '#ffc471'); grad.addColorStop(1, '#f2a54110');
      g.strokeStyle = grad; g.lineWidth = i === 0 ? 3 : 2; g.beginPath(); g.moveTo(px, h - pad.b); g.lineTo(px, py); g.stroke();
      g.fillStyle = i === 0 ? '#fff' : '#ffc471'; g.beginPath(); g.arc(px, py, i === 0 ? 3.5 : 2.5, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = '#e9ecf2'; g.fillText('f₀ ' + hz(a.f0), Math.min(w - 90, x(a.f0) + 6), Math.max(12, y(a.partials[0]?.db ?? 0) - 6));
  }

  /* ---------- keyboard ---------- */
  const rangeMidi = () => analysis.range.map(f => M.freqToMidi(f, config.a4));
  function buildKeyboard() {
    const kb = $('keyboard'), start = (octave + 1) * 12, end = start + (narrow() ? 24 : 48), [lo, hi] = rangeMidi();
    let whites = 0; for (let m = start; m < end; m++) if (!isBlack(m)) whites++;
    kb.style.setProperty('--w', 100 / whites + '%');
    let wi = 0, html = '';
    for (let m = start; m < end; m++) {
      const black = isBlack(m), out = m < lo - .02 || m > hi + .02;
      html += `<button class="key${black ? ' black' : ''}${out ? ' out' : ''}" tabindex="-1" data-midi="${m}" aria-label="${M.noteName(m)}${out ? ' (out of range)' : ''}"${black ? ` style="left:calc(${wi} * var(--w) - var(--w) * .31)"` : ''}>${!black && m % 12 === 0 ? 'C' + (m / 12 - 1) : ''}</button>`;
      if (!black) wi++;
    }
    kb.innerHTML = html;
    $('octaveLabel').textContent = M.noteName(start) + '–' + M.noteName(end - 1);
  }
  function noteDetails(midi) {
    const f = M.midiToFreq(midi, config.a4), key = M.NOTE_FIELD[config.family], solved = M.solve(config, key, f), p = solved.params;
    const text = config.family === 'string' ? `stopped length ${(p.length * 1000).toFixed(1)} mm (fret ${(-12 * Math.log2(p.length / config.params.length)).toFixed(1)})`
      : config.family === 'air' ? `sounding tube ${(p.length * 1000).toFixed(1)} mm` : config.family === 'bar' ? `bar length ${p.length.toFixed(1)} mm` : `head tension ${p.tension.toFixed(0)} N/m`;
    return {f, text, frac: config.family === 'string' || config.family === 'air' ? p.length / config.params.length : 1};
  }
  const letRing = () => $('letRing').checked;
  function playNote(midi, opts = {}) {
    let ctx, an, details;
    try { ctx = audio.ensure(); details = noteDetails(midi); an = M.forFrequency(config, details.f); }
    catch (e) { S.toast(e.message); return; }
    const hold = opts.hold ?? +$('hold').value, velocity = opts.velocity ?? +$('velocity').value / 100;
    audio.play(Synth.renderNote(an, {sampleRate: ctx.sampleRate, duration: hold, velocity, letRing: letRing(), vibrato: config.params.vibrato || 0, seed: midi}), ctx.sampleRate);
    scene.excite(an, {velocity, hold, frac: details.frac});
    const [lo, hi] = rangeMidi();
    $('keyInfo').innerHTML = `<strong>${M.noteName(midi)}</strong> · ${details.f.toFixed(2)} Hz → ${esc(details.text)}${midi < lo - .02 || midi > hi + .02 ? ' · <span class="bad">outside the playable range</span>' : ''}`;
  }
  function playTone() {
    let ctx; try { ctx = audio.ensure(); } catch (e) { S.toast(e.message); return; }
    const hold = +$('hold').value, velocity = +$('velocity').value / 100;
    audio.play(Synth.renderNote(analysis, {sampleRate: ctx.sampleRate, duration: hold, velocity, letRing: letRing(), vibrato: config.params.vibrato || 0}), ctx.sampleRate);
    scene.excite(analysis, {velocity, hold, frac: 1});
  }
  function flashKey(midi, ms = 220) {
    const k = document.querySelector(`.key[data-midi="${midi}"]`); if (!k) return;
    k.classList.add('down'); clearTimeout(k._t); k._t = setTimeout(() => k.classList.remove('down'), ms);
  }

  /* ---------- live analyser ---------- */
  const live = {
    frame: null, idleSince: 0,
    start() { if (!this.frame) this.frame = requestAnimationFrame(t => this.draw(t)); },
    draw(t) {
      this.frame = null;
      const an = audio.analyser, scope = prepareCanvas($('scope')), fft = prepareCanvas($('fft'));
      const playing = audio.sources.size > 0;
      $('liveState').textContent = playing ? 'PLAYING' : 'IDLE';
      if (an) {
        const time = new Float32Array(an.fftSize); an.getFloatTimeDomainData(time);
        let trig = 0; for (let i = 1; i < time.length / 2; i++) if (time[i - 1] < 0 && time[i] >= 0) { trig = i; break; }
        scope.g.strokeStyle = '#57dbff'; scope.g.lineWidth = 1.6; scope.g.beginPath();
        const n = 1400; for (let i = 0; i < n; i++) { const xx = i / n * scope.w, yy = scope.h / 2 - time[trig + i] * scope.h * .45; i ? scope.g.lineTo(xx, yy) : scope.g.moveTo(xx, yy); } scope.g.stroke();
        const bins = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(bins);
        const rate = audio.ctx.sampleRate, bars = 96;
        for (let b = 0; b < bars; b++) {
          const f0 = 30 * (18000 / 30) ** (b / bars), f1 = 30 * (18000 / 30) ** ((b + 1) / bars);
          let v = -120; for (let k = Math.floor(f0 / rate * an.fftSize); k <= Math.ceil(f1 / rate * an.fftSize) && k < bins.length; k++) v = Math.max(v, bins[k]);
          const hh = S.clamp((v + 100) / 80, 0, 1) * (fft.h - 4), bw = fft.w / bars;
          fft.g.fillStyle = `hsl(${36 - b * .2}, 90%, ${45 + hh / fft.h * 25}%)`; fft.g.fillRect(b * bw + .5, fft.h - hh, bw - 1.5, hh);
        }
      }
      if (playing) this.idleSince = t; else if (!this.idleSince) this.idleSince = t;
      if (playing || t - this.idleSince < 600) this.start();
    }
  };

  audio.live = live;

  /* ---------- history, saving, events ---------- */
  const history = S.history(() => config, state => { config = state; refresh({statics: true}); buildParams(); scheduleScene(true); });
  function apply(next, message) {
    const familyChanged = next.family !== config.family;
    config = next;
    syncStatic();
    if (familyChanged || !document.querySelector('[data-param]')) buildParams();
    if (familyChanged) $('letRing').checked = config.family === 'bar' || config.family === 'membrane';
    refresh({statics: true});
    history.push();
    if (message) S.toast(message);
  }
  const savedList = () => S.read(STORE, []);
  function renderSaved() {
    const list = savedList();
    $('savedCount').textContent = list.length;
    $('saved').innerHTML = list.length ? list.map((c, i) => `<div class="saved-item"><button class="saved-load" data-load="${i}" title="Load">${esc(c.name)} · ${esc(c.target)}</button><button data-delete="${i}" aria-label="Delete ${esc(c.name)}">✕</button></div>`).join('') : '<p class="empty">No saved instruments yet.</p>';
  }

  function bind() {
    $('familyTabs').addEventListener('click', e => { const b = e.target.closest('[data-family]'); if (!b || b.dataset.family === config.family) return; apply(M.fromPreset(M.PRESETS.find(p => p.family === b.dataset.family).id), 'Loaded ' + M.FAMILIES[b.dataset.family].name.toLowerCase()); });
    $('preset').addEventListener('change', e => { if (e.target.value !== 'custom') apply(M.fromPreset(e.target.value), 'Preset calibrated to pitch'); });
    const rename = e => { config = {...config, name: e.target.value.slice(0, 120)}; S.write(CURRENT, config); };
    $('instrumentName').addEventListener('input', rename);
    $('instrumentName').addEventListener('change', e => { rename(e); history.push(); });
    $('notes').addEventListener('change', e => { config = {...config, notes: e.target.value.slice(0, 10000)}; S.write(CURRENT, config); history.push(); });
    $('targetNote').addEventListener('change', e => {
      const midi = M.parseNote(e.target.value);
      if (midi === null) { S.toast('Enter a note such as A4, C#3 or Bb2'); e.target.value = config.target; return; }
      config = {...config, target: M.noteName(midi)}; e.target.value = config.target; refresh({scene: false}); history.push();
    });
    $('a4').addEventListener('change', e => { const v = +e.target.value; if (!(v >= 400 && v <= 480)) { S.toast('Reference pitch must be 400–480 Hz'); e.target.value = config.a4; return; } config = {...config, a4: v}; refresh({scene: false}); history.push(); });
    $('tuneBy').addEventListener('change', e => { config = {...config, tuneBy: e.target.value}; refresh({scene: false}); history.push(); });
    $('calibrate').addEventListener('click', () => {
      const {config: next, result} = M.calibrate(config), f = fieldsOf().find(x => x.key === result.key);
      config = next;
      $('calibrateStatus').dataset.fresh = '1';
      $('calibrateStatus').textContent = result.limited ? `Reached the ${f.label.toLowerCase()} limit (${num(result.value)} ${f.unit}); still ${signed(result.cents, 2)}¢ away. Change another setting.` : `Solved ${f.label.toLowerCase()} = ${num(result.value)} ${f.unit} → ${result.f0.toFixed(3)} Hz (${signed(result.cents, 3)}¢).`;
      refresh(); history.push(); S.toast(result.limited ? 'Calibration hit a limit' : 'Calibrated to ' + config.target);
    });
    $('tuneOvertone').addEventListener('click', () => {
      const ratio = +$('overtoneRatio').value, out = M.tuneBar(config, ratio);
      config = {...out.config, preset: 'custom'};
      $('calibrateStatus').dataset.fresh = '1';
      $('calibrateStatus').textContent = out.reached ? `Undercut ${config.params.undercut.toFixed(2)} mm gives 1 : ${out.ratio.toFixed(3)}; pitch re-solved.` : `1 : ${ratio} is not reachable with this material and span (best 1 : ${out.ratio.toFixed(2)}). Try a wider undercut span.`;
      refresh(); history.push();
    });
    $('paramSections').addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.slider) { const f = fieldsOf().find(x => x.key === t.dataset.slider); const v = +fromSlider(f, +t.value).toFixed(decimals(f.step)); $('p-' + f.key).value = v; setParam(f.key, v, false); }
      else if (t.dataset.param && t.type === 'number' && t.value !== '' && t.checkValidity()) setParam(t.dataset.param, +t.value, false);
    });
    $('paramSections').addEventListener('change', e => {
      const t = e.target, key = t.dataset.param || t.dataset.slider; if (!key) return;
      if (t.type === 'checkbox') setParam(key, t.checked, true);
      else if (t.tagName === 'SELECT') setParam(key, t.value, true);
      else if (t.type === 'number') { const f = fieldsOf().find(x => x.key === key); if (t.value === '' || !Number.isFinite(+t.value)) { t.value = config.params[key]; return; } if (+t.value < f.min || +t.value > f.max) S.toast(`${f.label}: ${f.min}–${f.max} ${f.unit}`); setParam(key, +t.value, true); }
      else history.push();
    });
    $('modeView').addEventListener('change', e => scene.setMode(e.target.value));
    $('resetView').addEventListener('click', () => scene.resetCamera());
    $('fullscreen').addEventListener('click', S.fullScreen);
    $('testTone').addEventListener('click', playTone);
    $('stopAll').addEventListener('click', stopAll);
    for (const [id, fmt] of [['velocity', v => v + '%'], ['hold', v => (+v).toFixed(1) + ' s'], ['volume', v => v + '%']]) {
      const out = () => { $(id + 'Out').value = fmt($(id).value); }; $(id).addEventListener('input', out); out();
    }
    $('volume').addEventListener('input', () => { if (audio.master) audio.master.gain.setTargetAtTime(volume(), audio.ctx.currentTime, .02); });
    $('octDown').addEventListener('click', () => { octave = Math.max(0, octave - 1); buildKeyboard(); });
    $('octUp').addEventListener('click', () => { octave = Math.min(6, octave + 1); buildKeyboard(); });
    const kb = $('keyboard'); let pressed = null;
    const press = k => { if (!k || k === pressed) return; pressed = k; const m = +k.dataset.midi; flashKey(m, 260); playNote(m); };
    kb.addEventListener('pointerdown', e => { const k = e.target.closest('.key'); if (!k) return; e.preventDefault(); kb.setPointerCapture?.(e.pointerId); press(k); });
    kb.addEventListener('pointermove', e => { if (!(e.buttons & 1)) return; press(document.elementFromPoint(e.clientX, e.clientY)?.closest('.key')); });
    const release = () => { pressed = null; }; kb.addEventListener('pointerup', release); kb.addEventListener('pointercancel', release);
    const map = 'awsedftgyhujk';
    document.addEventListener('keydown', e => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.id === 'scene') return;
      const k = e.key.toLowerCase(), i = map.indexOf(k);
      if (i >= 0) { const m = (octave + 1) * 12 + i; flashKey(m, 260); playNote(m); }
      else if (k === 'z') { octave = Math.max(0, octave - 1); buildKeyboard(); }
      else if (k === 'x') { octave = Math.min(6, octave + 1); buildKeyboard(); }
    });
    $('save').addEventListener('click', () => {
      const list = savedList().filter(c => c.name !== config.name);
      list.unshift(config); if (list.length > 40) list.length = 40;
      if (S.write(STORE, list)) { renderSaved(); S.toast('Instrument saved in this browser'); }
    });
    $('saved').addEventListener('click', e => {
      const list = savedList(), load = e.target.closest('[data-load]'), del = e.target.closest('[data-delete]');
      if (load) { try { apply(M.validate(list[+load.dataset.load]), 'Instrument loaded'); } catch { S.toast('That saved instrument is no longer valid'); } }
      if (del) { list.splice(+del.dataset.delete, 1); S.write(STORE, list); renderSaved(); }
    });
    $('importInstrument').addEventListener('change', e => { S.readJSON(e.target.files[0], data => apply(M.validate(data))); e.target.value = ''; });
    let wasNarrow = narrow();
    window.addEventListener('resize', () => { spectrum(); if (narrow() !== wasNarrow) { wasNarrow = narrow(); buildKeyboard(); } });
  }
  function stopAll() { audio.stop(); scene.stop(); stopListeners.forEach(fn => fn()); }

  buildStatic(); syncStatic(); buildParams();
  $('letRing').checked = config.family === 'bar' || config.family === 'membrane';
  octave = S.clamp(Math.floor(M.freqToMidi(analysis.range[0], config.a4) / 12) - 1, 0, 6);
  bind(); refresh({statics: true}); renderSaved(); S.wireHistory(history); live.start();

  return {
    get config() { return config; }, get analysis() { return analysis; }, audio, scene, playNote, flashKey, noteDetails, letRing, rangeMidi, hz, num, signed, prepareCanvas, stopAll,
    onChange: fn => changeListeners.push(fn), onStop: fn => stopListeners.push(fn)
  };
})();
