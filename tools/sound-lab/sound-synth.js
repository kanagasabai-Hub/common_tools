/* Modal synthesis of a SoundModel analysis: each predicted partial is a sine with its own
   frequency, level and decay, plus excitation noise (pick click, mallet, breath, bow, snares).
   Deterministic (seeded) so exports are reproducible. No dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SoundSynth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = Math.PI * 2, T60 = 6.9078;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function random(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; }; }
  // Sine lookup with linear interpolation (error ≈ −140 dB): several times faster than Math.sin per sample.
  const TABLE = 4096, SINE = new Float32Array(TABLE + 1);
  for (let i = 0; i <= TABLE; i++) SINE[i] = Math.sin(TAU * i / TABLE);
  let scratchEnv = new Float32Array(0);
  const onePole = (cutoff, sr) => 1 - Math.exp(-TAU * Math.min(cutoff, sr * .45) / sr);

  // Seconds of audio a note needs, given how long it is held.
  function noteLength(an, o) {
    const hold = Math.max(.02, o.duration ?? 1), tail = o.maxTail ?? 8;
    if (an.sustained) return hold + Math.min(.8, T60 / Math.max(10, Math.min(...an.partials.slice(0, 4).map(p => T60 / p.t60))));
    const ring = Math.max(...an.partials.slice(0, 4).map(p => p.t60));
    return o.letRing ? Math.min(tail, Math.max(hold, ring * .85)) : Math.min(hold + tail, hold + .45);
  }

  function renderNote(an, o = {}) {
    const sr = o.sampleRate || 44100, vel = clamp(o.velocity ?? .8, .05, 1), hold = Math.max(.02, o.duration ?? 1);
    const len = noteLength(an, o), count = Math.max(1, Math.ceil(len * sr)), out = new Float32Array(count);
    const f0 = an.f0, family = an.family, noise = an.noise || {type: 'click', level: .02, tau: .002};
    const excitation = noise.type, rnd = random((o.seed ?? 1) + Math.round(f0 * 100));
    const depth = an.sustained ? (o.vibrato || 0) : 0;
    let vib = null;
    if (depth > 0) { vib = new Float32Array(count); for (let i = 0; i < count; i++) { const t = i / sr, ramp = clamp((t - .25) / .35, 0, 1); vib[i] = 2 ** (depth / 1200 * ramp * Math.sin(TAU * 5.3 * t)); } }
    const brightness = an.sustained ? .25 * (vel - .75) : .35 * (vel - .75);
    const nyquist = sr * .47;
    let total = 0;
    // Partials more than 50 dB below the strongest are masked and inaudible; skipping them halves render time.
    const partials = an.partials.filter(p => p.f < nyquist && p.amp >= .003).map(p => { const amp = p.amp * (p.f / f0) ** brightness; total += amp; return {...p, amp}; });
    const gain = .8 * vel ** 1.5 / Math.max(1, total * .55);
    const attackStrike = Math.max(.0008, noise.tau || .001);
    partials.forEach((p, index) => {
      const alpha = T60 / p.t60, amp = p.amp * gain;
      let ph = (rnd() + 1) * TABLE / 2, end = count; // phase in table units, always non-negative
      if (!an.sustained) end = Math.min(count, Math.ceil((Math.log(amp / 2e-5) / alpha + .005) * sr));
      const tauA = excitation === 'bow' ? .07 + .01 * Math.sqrt(index) : excitation === 'breath' ? .045 * (1 + .12 * index) : excitation === 'reed' ? .025 : 0;
      if (amp < 2e-5) return;
      const release = Math.max(alpha, 10), holdSample = Math.min(count, Math.round(hold * sr)), inc = p.f / sr * TABLE;
      // Build a per-sample increment and envelope, then run one tight oscillator loop.
      // Envelope factors stop shrinking once negligible: repeated multiplication reaches denormal floats (~100× slower).
      let n = end;
      const env = scratchEnv.length >= count ? scratchEnv : (scratchEnv = new Float32Array(count));
      if (an.sustained) {
        const attackStep = Math.exp(-1 / (tauA * sr)), relStep = Math.exp(-release / sr), attackN = Math.min(holdSample, Math.ceil(Math.log(1e-6) / Math.log(attackStep)));
        let rest = 1, i = 0;
        for (; i < attackN; i++) { env[i] = amp * (1 - rest); rest *= attackStep; }
        for (; i < holdSample; i++) env[i] = amp;
        let e = amp * (1 - (holdSample > attackN ? 0 : rest));
        for (; i < count && e > amp * 1e-5; i++) { env[i] = e; e *= relStep; }
        n = i;
      } else {
        const decayStep = Math.exp(-alpha / sr), dampStep = decayStep * Math.exp(-18 / sr), attackN = Math.max(1, Math.round(attackStrike * sr));
        const stopAt = o.letRing ? end : Math.min(end, holdSample);
        let e = amp, i = 0;
        for (; i < end && e > 2e-5; i++) { env[i] = i < attackN ? e * (.5 - .5 * Math.cos(Math.PI * i / attackN)) : e; e *= i >= stopAt ? dampStep : decayStep; }
        n = i;
      }
      const glide0 = family === 'membrane' ? .012 * vel * vel : 0;
      if (vib || glide0) {
        const glideStep = Math.exp(-1 / (.08 * sr)), glideN = glide0 ? Math.min(n, Math.ceil(.08 * sr * Math.log(glide0 / 1e-7))) : 0;
        let g = glide0;
        for (let i = 0; i < n; i++) {
          let step = inc;
          if (vib) step *= vib[i];
          if (i < glideN) { step *= 1 + g; g *= glideStep; }
          ph += step; if (ph >= TABLE) ph -= TABLE;
          const k = ph | 0; out[i] += env[i] * (SINE[k] + (SINE[k + 1] - SINE[k]) * (ph - k));
        }
      } else {
        for (let i = 0; i < n; i++) {
          ph += inc; if (ph >= TABLE) ph -= TABLE;
          const k = ph | 0; out[i] += env[i] * (SINE[k] + (SINE[k + 1] - SINE[k]) * (ph - k));
        }
      }
    });
    addNoise(out, an, o, sr, vel, gain, hold, rnd);
    return out;
  }

  function addNoise(out, an, o, sr, vel, gain, hold, rnd) {
    const noise = an.noise; if (!noise || !noise.level) return;
    const type = noise.type, level = noise.level * vel * gain * 2.2, count = out.length, holdSample = Math.round(hold * sr);
    let lp = 0, lp2 = 0, hp = 0;
    if (type === 'click' || type === 'strike') {
      const decay = type === 'click' ? .004 : noise.tau * 1.6 + .002, k = onePole(type === 'click' ? 2500 + 9000 * (1 - (noise.tau || .002) / .004) : .35 / Math.max(.0003, noise.tau), sr);
      const n = Math.min(count, Math.ceil(decay * 8 * sr));
      for (let i = 0; i < n; i++) { lp += k * (rnd() - lp); out[i] += level * lp * Math.exp(-i / (decay * sr)); }
    } else if (type === 'snare') {
      const kl = onePole(7500, sr), kh = onePole(1400, sr), n = Math.min(count, Math.ceil(.9 * sr));
      for (let i = 0; i < n; i++) { const x = rnd(); lp += kl * (x - lp); hp += kh * (lp - hp); out[i] += level * (lp - hp) * Math.exp(-i / (.1 * sr)) * Math.min(1, i / (.001 * sr)); }
    } else { // breath, bow, reed: noise that follows the sustained envelope, with an initial chiff
      const kl = onePole(type === 'breath' ? 3200 : 1800, sr), kh = onePole(type === 'breath' ? 350 : 120, sr);
      for (let i = 0; i < count; i++) {
        const t = i / sr, env = (i < holdSample ? 1 - Math.exp(-t / .03) : Math.exp(-(t - hold) * 14)) * (1 + 1.6 * Math.exp(-t / .035));
        if (i >= holdSample && env < 1e-4) break;
        lp += kl * (rnd() - lp); lp2 += kl * (lp - lp2); hp += kh * (lp2 - hp);
        out[i] += level * (lp2 - hp) * env;
      }
    }
  }

  function normalize(samples, dbfs = -1) {
    let peak = 0; for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    if (peak > 0) { const g = 10 ** (dbfs / 20) / peak; for (let i = 0; i < samples.length; i++) samples[i] *= g; }
    return peak;
  }

  // Render a list of {t, d, play, velocity} events into one buffer. getAnalysis(midi) → analysis.
  const MAX_SECONDS = 20 * 60;
  async function mixScore(events, getAnalysis, o = {}, onProgress = () => {}, pause = () => Promise.resolve(), cancelled = () => false) {
    const sr = o.sampleRate || 44100, notes = events.filter(e => e.play !== null && e.play !== undefined);
    const tail = o.maxTail ?? 8, end = Math.min(MAX_SECONDS, notes.reduce((v, e) => Math.max(v, e.t + e.d + tail), .5));
    const out = new Float32Array(Math.ceil(end * sr)), cache = new Map();
    for (let i = 0; i < notes.length; i++) {
      const e = notes[i], start = Math.round(e.t * sr);
      if (start >= out.length) break;
      const vel = Math.round(clamp(e.velocity ?? .8, .05, 1) * 20) / 20, key = e.play + '|' + Math.round(e.d * 100) + '|' + vel;
      let buf = cache.get(key);
      if (!buf) { buf = renderNote(getAnalysis(e.play), {...o, duration: Math.max(.02, Math.round(e.d * 100) / 100), velocity: vel, seed: 7 + i}); if (cache.size > 48) cache.delete(cache.keys().next().value); cache.set(key, buf); }
      const n = Math.min(buf.length, out.length - start);
      for (let k = 0; k < n; k++) out[start + k] += buf[k];
      onProgress((i + 1) / notes.length); await pause(); if (cancelled()) return null;
    }
    let last = out.length - 1; while (last > sr * .5 && Math.abs(out[last]) < 1e-5) last--;
    const samples = out.slice(0, Math.min(out.length, last + Math.round(sr * .1)));
    normalize(samples, -1);
    onProgress(1);
    return {samples, sampleRate: sr, seconds: samples.length / sr, truncated: notes.some(e => e.t + e.d > MAX_SECONDS)};
  }

  function encodeWav(samples, sampleRate = 44100) {
    const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
    text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) { const s = clamp(samples[i], -1, 1); view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true); }
    return bytes;
  }

  return {renderNote, noteLength, mixScore, normalize, encodeWav, MAX_SECONDS};
});
