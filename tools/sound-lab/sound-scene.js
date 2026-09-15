/* Instrument visualiser: Three.js (vendored r149) with a Canvas 2D fallback.
   Vibration is shown in slow motion using the predicted mode shapes and relative levels. */
'use strict';
window.SoundScene = (() => {
  const M = window.SoundModel, TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const MAX_VOICES = 6;
  const visualFreq = ratio => clamp(1.25 * Math.sqrt(ratio), .6, 9); // slow motion, preserving mode order

  // Mode shape at normalised coordinate u (0..1) for 1-D families.
  function shape1d(family, mode, u, closed, shapes) {
    if (family === 'string') return Math.sin(mode.harmonic * Math.PI * u);
    if (family === 'air') return closed ? Math.sin(mode.harmonic * Math.PI * u / 2) : Math.cos(mode.harmonic * Math.PI * u);
    return shapes ? M.sampleShape(shapes[mode.index] || shapes[0], u) : 0;
  }

  class SoundScene {
    constructor(canvas, overlay) {
      this.canvas = canvas; this.overlay = overlay; this.voices = []; this.mode = null; this.labels = [];
      this.orbit = {theta: -.62, phi: 1.1, radius: 7, target: [0, 0, 0], fit: 7};
      this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.kind = '2d';
      try { this.initThree(); this.kind = 'webgl'; }
      catch (error) { this.error = error; this.ctx = canvas.getContext('2d'); }
      this.bindControls();
      if (typeof ResizeObserver === 'function') new ResizeObserver(() => { this.resize(); this.requestRender(); }).observe(canvas.parentElement);
      this.resize();
    }

    initThree() {
      const THREE = window.THREE;
      if (!THREE) throw Error('Three.js is unavailable');
      const renderer = new THREE.WebGLRenderer({canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
      if (!renderer.getContext()) throw Error('WebGL is unavailable');
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = .82;
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, .01, 200);
      // A small procedural "studio" for reflections on metal and lacquer.
      const env = new THREE.Scene(), sky = new THREE.SphereGeometry(10, 32, 16), colors = [];
      for (let i = 0; i < sky.attributes.position.count; i++) { const y = sky.attributes.position.getY(i) / 10, c = new THREE.Color().setHSL(.6, .18, .16 + .34 * Math.max(0, y)); colors.push(c.r, c.g, c.b); }
      sky.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide})));
      [[0, 6, 2, 7, .3, 4, [6, 5.6, 5.2]], [-6, 2, -3, .3, 4, 6, [1.6, 3.2, 4]], [6, 1.5, 3, .3, 3.5, 5, [4.6, 3.4, 2.2]], [0, -3, -6, 6, 2, .3, [1.4, 1.4, 1.6]]].forEach(([x, y, z, w, h, d, c]) => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({color: new THREE.Color(...c)})); box.position.set(x, y, z); box.lookAt(0, 0, 0); env.add(box);
      });
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(env, .03).texture;
      pmrem.dispose();
      scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x1d140b, .35));
      const key = new THREE.DirectionalLight(0xffe0b3, 1.35); key.position.set(4, 7, 5); scene.add(key);
      const rim = new THREE.DirectionalLight(0x69d7ff, 1.2); rim.position.set(-5, 3, -4); scene.add(rim);
      // Floor: soft contact shadow and a faint polar grid.
      const tex = document.createElement('canvas'); tex.width = tex.height = 256;
      const g = tex.getContext('2d'), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(0,0,0,.55)'); grad.addColorStop(.55, 'rgba(0,0,0,.22)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
      this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(tex), transparent: true, depthWrite: false}));
      this.floor.rotation.x = -Math.PI / 2; scene.add(this.floor);
      this.grid = new THREE.PolarGridHelper(6, 12, 8, 96, 0x2c3a52, 0x1a2333);
      this.grid.material.transparent = true; this.grid.material.opacity = .55; scene.add(this.grid);
      this.group = new THREE.Group(); scene.add(this.group);
      Object.assign(this, {THREE, renderer, scene, camera});
    }

    bindControls() {
      const c = this.canvas, o = this.orbit; let drag = null;
      c.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY}; c.setPointerCapture?.(e.pointerId); });
      c.addEventListener('pointermove', e => { if (!drag) return; o.theta -= (e.clientX - drag.x) * .008; o.phi = clamp(o.phi - (e.clientY - drag.y) * .008, .2, 1.52); drag = {x: e.clientX, y: e.clientY}; this.requestRender(); });
      const end = () => { drag = null; }; c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
      c.addEventListener('wheel', e => { e.preventDefault(); o.radius = clamp(o.radius * Math.exp(e.deltaY * .0012), o.fit * .35, o.fit * 3); this.requestRender(); }, {passive: false});
      c.addEventListener('dblclick', () => this.resetCamera());
      c.addEventListener('keydown', e => {
        const k = e.key, step = .12;
        if (k === 'ArrowLeft') o.theta += step; else if (k === 'ArrowRight') o.theta -= step;
        else if (k === 'ArrowUp') o.phi = clamp(o.phi - step, .2, 1.52); else if (k === 'ArrowDown') o.phi = clamp(o.phi + step, .2, 1.52);
        else if (k === '+' || k === '=') o.radius = clamp(o.radius * .88, o.fit * .35, o.fit * 3); else if (k === '-' || k === '_') o.radius = clamp(o.radius * 1.14, o.fit * .35, o.fit * 3);
        else return;
        e.preventDefault(); this.requestRender();
      });
    }
    resetCamera() { Object.assign(this.orbit, {theta: -.62, phi: 1.1, radius: this.orbit.fit}); this.requestRender(); }

    resize() {
      const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
      if (this.kind === 'webgl') { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
      else { const r = Math.min(2, window.devicePixelRatio || 1); this.canvas.width = w * r; this.canvas.height = h * r; }
    }

    requestRender() { if (!this.frame) this.frame = requestAnimationFrame(ms => this.tick(ms)); }
    tick(ms) {
      this.frame = null;
      const now = ms / 1000;
      this.voices = this.voices.filter(v => this.voiceActive(v, now));
      if (this.kind === 'webgl') { this.update?.(now); this.render(); } else this.draw2d(now);
      if ((this.voices.length || this.mode !== null || this.busy?.(now)) && !this.reduced) this.requestRender();
    }
    render() {
      const o = this.orbit, cam = this.camera, [tx, ty, tz] = o.target;
      cam.position.set(tx + o.radius * Math.sin(o.phi) * Math.sin(o.theta), ty + o.radius * Math.cos(o.phi), tz + o.radius * Math.sin(o.phi) * Math.cos(o.theta));
      cam.lookAt(tx, ty, tz);
      this.renderer.render(this.scene, cam);
      this.placeLabels();
    }
    placeLabels() {
      if (!this.overlay) return;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      this.labels.forEach(l => {
        const v = l.anchor.clone().project(this.camera), hidden = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
        const px = (v.x + 1) / 2 * w, flip = px > w * .62;
        l.el.style.transform = `translate(${px.toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)` + (flip ? ' translateX(calc(-100% - 16px))' : '');
        l.el.hidden = hidden;
      });
    }

    // Amplitude of mode i for a voice at time `now`.
    modeLevel(v, mode, now) {
      const t = now - v.start;
      if (v.sustained) return v.velocity * mode.amp * (t < v.hold ? 1 - Math.exp(-t / .12) : Math.exp(-(t - v.hold) * 5));
      return v.velocity * mode.amp * Math.exp(-t * mode.decay) * clamp(t / .025, 0, 1);
    }
    voiceActive(v, now) { return now - v.start < 30 && v.modes.some(m => this.modeLevel(v, m, now) > .004 || now - v.start < .05); }
    // Signed level of every base mode at time `now` (mode viewer or all sounding voices).
    coefficients(now) {
      const n = this.baseModes.length, out = new Float32Array(n);
      if (this.mode !== null) { const m = this.baseModes[this.mode]; if (m) out[this.mode] = .9 * Math.cos(TAU * m.fv * now); return out; }
      for (const v of this.voices) v.modes.forEach((m, k) => { if (k < n) { const a = this.modeLevel(v, m, now); if (a > 1e-4) out[k] += a * Math.cos(TAU * m.fv * (now - v.start)); } });
      return out;
    }
    // Displacement profile along a 1-D instrument, sampled at rows + 1 points over u ∈ [0, frac].
    profile(now, rows, frac, shapeFn) {
      const coef = this.coefficients(now), out = new Float32Array(rows + 1);
      for (let k = 0; k < coef.length; k++) { const c = coef[k]; if (Math.abs(c) < 1e-5) continue; const m = this.baseModes[k]; for (let r = 0; r <= rows; r++) { const u = r / rows; if (u <= frac) out[r] += c * shapeFn(m, u / frac); } }
      return out;
    }
    modesOf(analysis) {
      return analysis.partials.slice(0, 10).map((p, index) => ({index, amp: p.amp, harmonic: p.harmonic || index + 1, m: p.m, j: p.j, fv: visualFreq(p.ratio), decay: clamp(6.9 / p.t60, .35, 7) * .45}));
    }

    excite(analysis, {velocity = .8, hold = 1, frac = 1} = {}) {
      const now = performance.now() / 1000;
      this.voices.push({start: now, velocity: clamp(velocity, .1, 1), hold, frac, sustained: analysis.sustained, modes: this.modesOf(analysis)});
      if (this.voices.length > MAX_VOICES) this.voices.shift();
      this.lastFrac = frac; this.strikeAt = now;
      if (this.reduced) { const v = this.voices[this.voices.length - 1]; v.start = now - .03; }
      this.requestRender();
    }
    stop() { this.voices = []; this.requestRender(); }
    setMode(index) { this.mode = index === null || index === '' ? null : Number(index); this.requestRender(); }

    snapshot() {
      const src = this.canvas, out = document.createElement('canvas'); out.width = src.width; out.height = src.height;
      const g = out.getContext('2d'), grad = g.createRadialGradient(out.width / 2, out.height * .38, 0, out.width / 2, out.height * .38, Math.max(out.width, out.height) * .75);
      grad.addColorStop(0, '#1e2638'); grad.addColorStop(.45, '#121724'); grad.addColorStop(1, '#0a0c11');
      g.fillStyle = grad; g.fillRect(0, 0, out.width, out.height);
      if (this.kind === 'webgl') {
        // Read the frame back directly: drawImage(webglCanvas) can return a blank image for some scenes.
        this.render();
        const gl = this.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const layer = document.createElement('canvas'); layer.width = w; layer.height = h;
        const image = layer.getContext('2d').createImageData(w, h), data = image.data;
        for (let y = 0; y < h; y++) {
          const from = (h - 1 - y) * w * 4, to = y * w * 4;
          for (let x = 0; x < w * 4; x += 4) {
            const a = px[from + x + 3], k = a ? 255 / a : 0; // undo premultiplied alpha
            data[to + x] = Math.min(255, px[from + x] * k); data[to + x + 1] = Math.min(255, px[from + x + 1] * k); data[to + x + 2] = Math.min(255, px[from + x + 2] * k); data[to + x + 3] = a;
          }
        }
        layer.getContext('2d').putImageData(image, 0, 0);
        g.drawImage(layer, 0, 0, out.width, out.height);
      } else { this.draw2d(performance.now() / 1000); g.drawImage(src, 0, 0); }
      return new Promise(resolve => out.toBlob(resolve, 'image/png'));
    }

    label(text, anchor) {
      const el = document.createElement('span'); el.className = 'scene-callout'; el.textContent = text; this.overlay?.append(el);
      this.labels.push({el, anchor: new this.THREE.Vector3(...anchor)});
    }
    clear() {
      this.labels.forEach(l => l.el.remove()); this.labels = [];
      if (this.overlay) this.overlay.querySelectorAll('.scene-callout').forEach(el => el.remove());
      if (!this.group) return;
      this.group.traverse(obj => { obj.geometry?.dispose(); [].concat(obj.material || []).forEach(m => { m.map?.dispose(); m.dispose(); }); });
      this.group.clear();
      this.update = null; this.busy = null;
    }
    material(color, metal = 0, rough = .5, extra = {}) { return new this.THREE.MeshStandardMaterial({color, metalness: metal, roughness: rough, envMapIntensity: .9, ...extra}); }
    woodTexture(color) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const g = c.getContext('2d'), base = new this.THREE.Color(color).multiplyScalar(.78), grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#' + base.getHexString()); grad.addColorStop(.5, color); grad.addColorStop(1, '#' + base.getHexString()); g.fillStyle = grad; g.fillRect(0, 0, 512, 128);
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${rnd() > .35 ? '60,30,10' : '255,235,200'},${.08 + rnd() * .16})`; g.lineWidth = .5 + rnd() * 2.5; g.beginPath(); const y = rnd() * 128; g.moveTo(0, y); for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * .01 + i) * 4 + (rnd() - .5) * 2); g.stroke(); }
      const t = new this.THREE.CanvasTexture(c); t.wrapS = t.wrapT = this.THREE.RepeatWrapping; t.encoding = this.THREE.sRGBEncoding; return t;
    }

    setInstrument(config, analysis) {
      // Forget the previous instrument's strike: a stale strike time makes the mallet lift formula explode and the camera fit fly out past the far plane.
      this.config = config; this.analysis = analysis; this.voices = []; this.strikeAt = -9; this.lastFrac = 1; this.baseModes = this.modesOf(analysis);
      if (this.mode !== null && this.mode >= this.baseModes.length) this.mode = null;
      if (this.kind === 'webgl') {
        this.clear();
        ({string: this.buildString, air: this.buildAir, bar: this.buildBar, membrane: this.buildMembrane})[config.family].call(this, config, analysis);
        this.fitCamera();
      }
      this.requestRender();
    }
    fitCamera() {
      const THREE = this.THREE, box = new THREE.Box3();
      this.group.children.forEach(child => { if (!child.userData.tool) box.expandByObject(child); });
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = sphere.radius / Math.sin(this.camera.fov * Math.PI / 360) * .92;
      this.orbit.target = [sphere.center.x, sphere.center.y, sphere.center.z];
      this.orbit.fit = this.orbit.radius = Math.max(1.5, radius);
      const floorY = box.min.y - .02, size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.6;
      this.floor.position.y = floorY; this.floor.scale.set(size, size * .7, 1);
      this.grid.position.y = floorY - .001; this.grid.scale.setScalar(Math.max(.5, size / 10));
    }

    /* ---------- strings: body, neck, frets and a vibrating string ---------- */
    buildString(c, an) {
      const T = this.THREE, p = c.params, sm = M.MATERIALS.string[p.material], wood = M.MATERIALS.wood[p.bodyWood], G = this.group;
      const L = p.length, Lb = p.bodyLength / 1000, piano = Lb > 2.2 * L, fretted = p.excitation === 'pluck' && !piano;
      const s = 3.6 / Math.max(L + (Lb ? .22 * Lb : .05), Lb || 0), Ls = L * s, Lbs = Lb * s, Wbs = .72 * Lbs;
      const xb = (Math.max(Ls, .78 * Lbs) - (Lb ? .22 * Lbs : .05)) / 2, xNut = xb - Ls;
      const stringY = .014 * s + .02, depth = p.bodyDepth / 1000 * s;
      if (Lb) {
        const shape = new T.Shape();
        if (piano) { const x0 = xb + .22 * Lbs, x1 = xb - .78 * Lbs, w = Wbs / 2; shape.moveTo(x0, -w); shape.lineTo(x0, w * .35); shape.quadraticCurveTo(x0 - Lbs * .45, w, x1, w); shape.lineTo(x1, -w); shape.closePath(); }
        else {
          const N = 90, width = t => Wbs / 2 * Math.sqrt(Math.sin(Math.PI * t)) * (1 - .3 * Math.exp(-(((t - .55) / .11) ** 2)) - .14 * t);
          for (let i = 0; i <= N; i++) { const t = i / N, x = xb + .22 * Lbs - t * Lbs; i ? shape.lineTo(x, width(t)) : shape.moveTo(x, width(t)); }
          for (let i = N - 1; i > 0; i--) { const t = i / N; shape.lineTo(xb + .22 * Lbs - t * Lbs, -width(t)); }
          shape.closePath();
        }
        const holeR = p.soundhole / 2000 * s, holeX = xb - .4 * Lbs;
        if (p.excitation === 'pluck') { const h = new T.Path(); h.absarc(holeX, 0, holeR, 0, TAU, true); shape.holes.push(h); }
        else if (p.excitation === 'bow') for (const z of [-1, 1]) { const h = new T.Path(); h.absellipse(xb, z * Wbs * .2, holeR * 1.3, holeR * .22, 0, TAU, true, .25 * z); shape.holes.push(h); }
        const geo = new T.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 2, curveSegments: 40});
        const top = this.material('#ffffff', 0, .5, {map: this.woodTexture(wood.color)}); top.map.repeat.set(.9, 2.2);
        const side = this.material(new T.Color(wood.color).multiplyScalar(.55), 0, .38);
        const body = new T.Mesh(geo, [top, side]); body.rotation.x = Math.PI / 2; G.add(body);
        if (p.excitation === 'pluck') {
          const cavity = new T.Mesh(new T.CircleGeometry(holeR, 48), this.material('#07060a', 0, 1)); cavity.rotation.x = -Math.PI / 2; cavity.position.set(holeX, -depth * .6, 0); G.add(cavity);
          const rosette = new T.Mesh(new T.RingGeometry(holeR * 1.08, holeR * 1.32, 64), this.material('#2d1d12', .2, .35)); rosette.rotation.x = -Math.PI / 2; rosette.position.set(holeX, .002, 0); G.add(rosette);
        }
        this.label('Body ' + p.bodyLength + ' × ' + p.bodyDepth + ' mm · ' + wood.name, [xb - .15 * Lbs, -depth, Wbs * .45]);
      }
      const neckW = Math.max(.05 * s, .12), bridge = new T.Mesh(new T.BoxGeometry(.03, stringY - .01, Math.max(neckW * 1.6, .2)), this.material('#1b120d', 0, .45));
      bridge.position.set(xb, (stringY - .01) / 2, 0); G.add(bridge);
      const neckEnd = Lb ? xb - .78 * Lbs + .03 : xb;
      if (!piano && xNut < neckEnd) {
        const len = neckEnd - xNut + .04, board = new T.Mesh(new T.BoxGeometry(len, .03, neckW), this.material('#1a110c', 0, .55));
        board.position.set(xNut + len / 2 - .04, .015, 0); G.add(board);
        const neck = new T.Mesh(new T.BoxGeometry(len, .07, neckW * .92), this.material(new T.Color(wood.color).multiplyScalar(.7), 0, .45));
        neck.position.set(board.position.x, -.035, 0); G.add(neck);
        const nut = new T.Mesh(new T.BoxGeometry(.018, stringY + .005, neckW), this.material('#efe8d8', 0, .4)); nut.position.set(xNut, (stringY + .005) / 2, 0); G.add(nut);
      }
      this.frets = [];
      if (fretted) for (let k = 1; k <= Math.min(24, p.range); k++) {
        const fret = new T.Mesh(new T.BoxGeometry(.008, .012, neckW), this.material('#d7d9de', 1, .22, {emissive: '#ffae42', emissiveIntensity: 0}));
        fret.position.set(xb - Ls * 2 ** (-k / 12), .034, 0); G.add(fret); this.frets.push(fret);
      }
      const radius = Math.max(p.diameter / 2000 * s * 1.3, .011), rows = 200;
      const geo = new T.CylinderGeometry(radius, radius, Ls, 10, rows, true); geo.rotateZ(Math.PI / 2); geo.translate(xb - Ls / 2, stringY, 0);
      const strand = new T.Mesh(geo, this.material(sm.color, sm.metal, sm.rough)); G.add(strand);
      const base = Float32Array.from(geo.attributes.position.array), rowOf = new Uint16Array(geo.attributes.position.count);
      for (let i = 0; i < rowOf.length; i++) rowOf[i] = Math.round(clamp((xb - base[i * 3]) / Ls, 0, 1) * rows);
      const tool = p.excitation === 'bow' ? new T.Mesh(new T.BoxGeometry(.018, .012, .9), this.material('#d9cfb8', 0, .9))
        : p.excitation === 'hammer' ? new T.Mesh(new T.BoxGeometry(.06, .08, .1), this.material('#efe7d6', 0, .95))
        : new T.Mesh(new T.SphereGeometry(.03, 16, 12), this.material('#ffb347', 0, .35, {emissive: '#ff8a1f', emissiveIntensity: 0}));
      if (p.excitation === 'pluck') tool.scale.set(1, .45, 1.4);
      tool.userData.tool = true; G.add(tool);
      this.label('Scale ' + (L * 1000).toFixed(0) + ' mm · ' + p.tension.toFixed(1) + ' N', [xb - Ls * .55, stringY + .12, 0]);
      this.label('Ø ' + p.diameter + ' mm · ' + sm.name, [xb, stringY + .08, -.15]);
      const pos = geo.attributes.position;
      this.busy = now => now - (this.strikeAt || -9) < 1.2;
      this.update = now => {
        const frac = this.mode !== null ? 1 : clamp(this.lastFrac ?? 1, .05, 1);
        const disp = this.profile(now, rows, frac, (m, u) => Math.sin(m.harmonic * Math.PI * u));
        for (let i = 0; i < rowOf.length; i++) pos.setY(i, base[i * 3 + 1] + disp[rowOf[i]] * .12);
        pos.needsUpdate = true;
        const since = now - (this.strikeAt || -9), x = xb - p.position * Ls * frac;
        if (p.excitation === 'bow') tool.position.set(x, stringY + .012, (this.voices.length ? Math.sin(now * 2.4) * .2 : 0));
        else if (p.excitation === 'hammer') tool.position.set(x, stringY + .05 + .18 * clamp(1 - Math.exp(-since * 8) * (since < .03 ? 0 : 1), 0, 1), 0);
        else { tool.position.set(x, stringY + .05, 0); tool.material.emissiveIntensity = 2.5 * Math.exp(-since * 5); }
        const active = Math.round(-12 * Math.log2(frac));
        this.frets.forEach((f, k) => { f.material.emissiveIntensity = k + 1 === active && this.mode === null ? 1.4 : 0; });
      };
    }

    /* ---------- air columns: glassy tube with pressure-coloured particles ---------- */
    buildAir(c, an) {
      const T = this.THREE, p = c.params, wall = M.MATERIALS.wall[p.wall], G = this.group, closed = p.ends === 'closed';
      const s = 3.8 / Math.max(p.length, .3), Ls = p.length * s, r = Math.max(p.bore / 2000 * s, .075), x0 = -Ls / 2; // minimum visual bore so thin tubes stay readable
      const shell = new T.Mesh(new T.CylinderGeometry(r * 1.14, r * 1.14, Ls, 72, 1, true).rotateZ(Math.PI / 2), this.material(wall.color, wall.metal, wall.rough, {transparent: true, opacity: .28, side: T.DoubleSide, depthWrite: false}));
      G.add(shell);
      for (const x of [x0, -x0]) { const rim = new T.Mesh(new T.TorusGeometry(r * 1.1, r * .07, 14, 72).rotateY(Math.PI / 2), this.material(wall.color, wall.metal, wall.rough)); rim.position.x = x; G.add(rim); }
      if (closed) { const cap = new T.Mesh(new T.CircleGeometry(r * 1.14, 48).rotateY(Math.PI / 2), this.material(wall.color, wall.metal, wall.rough, {side: T.DoubleSide})); cap.position.x = x0; G.add(cap); }
      if (p.excitation === 'reed') {
        const mouth = new T.Mesh(new T.CylinderGeometry(r * .55, r * 1.1, r * 3, 40).rotateZ(Math.PI / 2), this.material('#111114', .2, .3)); mouth.position.x = x0 - r * 1.5; G.add(mouth);
        const reed = new T.Mesh(new T.BoxGeometry(r * 2.6, r * .06, r * .9), this.material('#d8c48a', 0, .7)); reed.position.set(x0 - r * 1.6, -r * .9, 0); G.add(reed);
      } else {
        const hole = new T.Mesh(new T.SphereGeometry(r * .36, 24, 12), this.material('#050507', 0, 1)); hole.scale.set(1.35, .3, .9); hole.position.set(x0 + (closed ? r * 1.6 : Math.min(Ls * .08, r * 4)), r * 1.12, 0); G.add(hole);
      }
      const count = Math.round(clamp(Ls * r * 5200, 1200, 3600)), base = new Float32Array(count * 3), rowOf = new Uint16Array(count), rows = 140;
      let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < count; i++) { const u = rnd(), a = rnd() * TAU, rr = Math.sqrt(rnd()) * r * .95; base[i * 3] = x0 + u * Ls; base[i * 3 + 1] = Math.cos(a) * rr; base[i * 3 + 2] = Math.sin(a) * rr; rowOf[i] = Math.round(u * rows); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(base.slice(), 3)); geo.setAttribute('color', new T.BufferAttribute(new Float32Array(count * 3), 3));
      const points = new T.Points(geo, new T.PointsMaterial({size: clamp(r * .22, .018, .05), vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending}));
      G.add(points);
      const marker = new T.Mesh(new T.TorusGeometry(r * 1.2, r * .05, 10, 64).rotateY(Math.PI / 2), new T.MeshBasicMaterial({color: '#ffb347'})); G.add(marker);
      const shapeFn = (m, u) => closed ? Math.sin(m.harmonic * Math.PI * u / 2) : Math.cos(m.harmonic * Math.PI * u);
      const pressureFn = (m, u) => closed ? -Math.cos(m.harmonic * Math.PI * u / 2) : Math.sin(m.harmonic * Math.PI * u);
      this.label('Tube ' + (p.length * 1000).toFixed(1) + ' mm · ' + wall.name, [0, r * 1.5 + .1, 0]);
      this.label('Bore Ø ' + p.bore + ' mm · ' + (closed ? 'closed–open' : 'open–open'), [x0, -r * 1.4, 0]);
      const pos = geo.attributes.position, col = geo.attributes.color;
      this.update = now => {
        const frac = this.mode !== null ? 1 : clamp(this.lastFrac ?? 1, .05, 1);
        const disp = this.profile(now, rows, frac, shapeFn), pres = this.profile(now, rows, frac, pressureFn);
        const norm = Math.max(.35, ...pres.map(Math.abs));
        for (let i = 0; i < count; i++) {
          const row = rowOf[i], u = row / rows;
          pos.setX(i, base[i * 3] + disp[row] * .09);
          if (u > frac) { col.setXYZ(i, .05, .06, .09); continue; }
          const q = pres[row] / norm, k = .18 + .82 * Math.abs(q);
          q >= 0 ? col.setXYZ(i, 1 * k, .62 * k, .22 * k) : col.setXYZ(i, .25 * k, .82 * k, 1 * k);
        }
        pos.needsUpdate = col.needsUpdate = true;
        marker.visible = frac < .999; marker.position.x = x0 + frac * Ls;
      };
      this.update(performance.now() / 1000);
    }

    /* ---------- bars: undercut profile, nodal cords, resonator and mallet ---------- */
    buildBar(c, an) {
      const T = this.THREE, p = c.params, mat = M.MATERIALS.bar[p.material], G = this.group;
      const L = p.length / 1000, s = 3.4 / Math.max(L, .25), Ls = L * s, hs = p.thickness / 1000 * s, Ws = p.width / 1000 * s;
      const u = clamp(p.undercut / p.thickness, 0, .9), w = p.undercutSpan, N = 96, x0 = -Ls / 2;
      const thick = x => { const q = (x - .5) / (w / 2); return Math.abs(q) < 1 ? 1 - u * (1 - q * q) : 1; };
      const shape = new T.Shape(); shape.moveTo(x0, 0);
      for (let i = 1; i <= N; i++) shape.lineTo(x0 + i / N * Ls, 0);
      for (let i = N; i >= 0; i--) shape.lineTo(x0 + i / N * Ls, -thick(i / N) * hs);
      const geo = new T.ExtrudeGeometry(shape, {depth: Ws, bevelEnabled: false}); geo.translate(0, 0, -Ws / 2);
      const wood = mat.metal < .5, barMat = this.material(wood ? '#ffffff' : mat.color, mat.metal, mat.rough, wood ? {map: this.woodTexture(mat.color)} : {});
      if (wood) barMat.map.repeat.set(1 / Math.max(.5, Ls), 1.5);
      const bar = new T.Mesh(geo, barMat); G.add(bar);
      const base = Float32Array.from(geo.attributes.position.array), rows = 120, rowOf = new Uint16Array(geo.attributes.position.count);
      for (let i = 0; i < rowOf.length; i++) rowOf[i] = Math.round(clamp((base[i * 3] - x0) / Ls, 0, 1) * rows);
      const shapes = an.shapes, crossings = sh => sh.flatMap((v, i) => i && Math.sign(v) !== Math.sign(sh[i - 1]) ? [(i - 1 + Math.abs(sh[i - 1]) / (Math.abs(sh[i - 1]) + Math.abs(v))) / (sh.length - 1)] : []);
      const cordMat = this.material('#7c1f24', 0, .8), postMat = this.material('#2b2f36', .8, .35);
      for (const un of crossings(shapes[0])) {
        const x = x0 + un * Ls, y = -thick(un) * hs;
        const cord = new T.Mesh(new T.CylinderGeometry(.012, .012, Ws * 1.5, 10).rotateX(Math.PI / 2), cordMat); cord.position.set(x, y - .012, 0); G.add(cord);
        for (const z of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(.035, .32, .035), postMat); post.position.set(x, y - .17, z * Ws * .75); G.add(post); }
      }
      const tubeMm = an.metrics.find(m => m[0] === 'Resonator tube length');
      if (p.resonator && tubeMm) {
        const tl = Math.max(.1, tubeMm[1] / 1000 * s), rt = Math.min(Ws * .42, Ls * .12), top = -hs - .38, tubeMat = this.material(mat.metal > .5 ? '#d5d9df' : '#d9ad52', .6, .3);
        const tube = new T.Mesh(new T.CylinderGeometry(rt, rt, tl, 48, 1, true), tubeMat); tube.position.y = top - tl / 2; G.add(tube);
        const inner = new T.Mesh(new T.CylinderGeometry(rt * .97, rt * .97, tl, 48, 1, true), this.material('#0b0b0f', 0, 1, {side: T.BackSide})); inner.position.y = tube.position.y; G.add(inner);
        const cap = new T.Mesh(new T.CircleGeometry(rt, 48).rotateX(Math.PI / 2), tubeMat); cap.position.y = top - tl; G.add(cap);
        this.label('Resonator ' + tubeMm[1].toFixed(0) + ' mm', [rt * 1.2, top - tl * .6, 0]);
      }
      const headR = clamp(Ws * .3, .06, .14), soft = p.hardness < .5;
      const mallet = new T.Group(), head = new T.Mesh(new T.SphereGeometry(headR, 28, 18), this.material(soft ? '#6d4ea3' : '#ddd5c4', 0, soft ? .95 : .4));
      const handle = new T.Mesh(new T.CylinderGeometry(.013, .013, 1.5, 10), this.material('#c9a77a', 0, .6)); handle.rotation.z = -Math.PI / 3; handle.position.set(.75 * Math.sin(Math.PI / 3), .75 * Math.cos(Math.PI / 3), 0); // shaft starts at the head
      mallet.add(head, handle); mallet.userData.tool = true; G.add(mallet);
      const markers = new T.Group(); G.add(markers);
      const markerGeo = new T.SphereGeometry(.022, 12, 8), markerMat = new T.MeshBasicMaterial({color: '#57dbff'});
      this.label('Bar ' + p.length.toFixed(1) + ' × ' + p.width + ' × ' + p.thickness + ' mm · ' + mat.name, [0, .22, Ws / 2]);
      if (u > 0) this.label('Undercut ' + p.undercut.toFixed(2) + ' mm', [0, -hs * (1 - u) - .06, Ws / 2]);
      let shownMode = -1;
      const pos = geo.attributes.position;
      this.busy = now => now - (this.strikeAt || -9) < .7;
      this.update = now => {
        const disp = this.profile(now, rows, 1, (m, uu) => M.sampleShape(shapes[m.index] || shapes[0], uu));
        for (let i = 0; i < rowOf.length; i++) pos.setY(i, base[i * 3 + 1] + disp[rowOf[i]] * .12);
        pos.needsUpdate = true; geo.computeVertexNormals();
        const since = Math.max(0, now - (this.strikeAt ?? -9)), lift = since < .04 ? 1 - since / .04 : clamp((since - .04) / .35, 0, 1);
        mallet.position.set(x0 + p.position * Ls, headR + .03 + lift * .5 + disp[Math.round(p.position * rows)] * .12, 0);
        if (shownMode !== this.mode) {
          shownMode = this.mode; markers.clear();
          if (this.mode !== null && shapes[this.mode]) for (const un of crossings(shapes[this.mode])) { const m = new T.Mesh(markerGeo, markerMat); m.position.set(x0 + un * Ls, .03, 0); markers.add(m); }
        }
      };
      this.update(performance.now() / 1000);
    }

    /* ---------- membranes: Bessel-mode head, shell or kettle, lugs and stick ---------- */
    buildMembrane(c, an) {
      const T = this.THREE, p = c.params, head = M.MATERIALS.head[p.material], G = this.group, R = 1.6, kettle = p.pitchMode === '11';
      const s = R / (p.diameter / 2000), depth = Math.max(.1, p.shellDepth / 1000 * s), rings = 46, seg = 128, nv = 1 + rings * seg;
      const positions = new Float32Array(nv * 3), radial = new Float32Array(nv), angle = new Float32Array(nv), index = [];
      for (let ri = 1; ri <= rings; ri++) for (let si = 0; si < seg; si++) { const k = 1 + (ri - 1) * seg + si, rr = ri / rings, a = si / seg * TAU; radial[k] = rr; angle[k] = a; positions[k * 3] = Math.cos(a) * rr * R; positions[k * 3 + 2] = Math.sin(a) * rr * R; }
      for (let si = 0; si < seg; si++) index.push(0, 1 + (si + 1) % seg, 1 + si);
      for (let ri = 1; ri < rings; ri++) for (let si = 0; si < seg; si++) { const a = 1 + (ri - 1) * seg + si, b = 1 + (ri - 1) * seg + (si + 1) % seg, c2 = a + seg, d = b + seg; index.push(a, b, d, a, d, c2); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(positions, 3)); geo.setAttribute('color', new T.BufferAttribute(new Float32Array(nv * 3), 3)); geo.setIndex(index); geo.computeVertexNormals();
      const basis = this.baseModes.map(m => { const b = new Float32Array(nv); let peak = 0; for (let x = 0; x <= 1; x += .005) peak = Math.max(peak, Math.abs(M.besselJ(m.m, m.j * x))); for (let k = 0; k < nv; k++) b[k] = M.besselJ(m.m, m.j * radial[k]) / (peak || 1) * Math.cos(m.m * angle[k]); return b; });
      G.add(new T.Mesh(geo, new T.MeshStandardMaterial({vertexColors: true, roughness: head.rough, metalness: 0, side: T.DoubleSide, envMapIntensity: .6})));
      const chrome = this.material('#dfe3e8', 1, .2);
      G.add(new T.Mesh(new T.TorusGeometry(R * 1.015, .045, 16, 160).rotateX(Math.PI / 2), chrome));
      if (kettle) {
        const pts = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI / 2; pts.push(new T.Vector2(Math.max(.2 * R, R * 1.01 * Math.cos(a) ** .7), -depth * Math.sin(a))); }
        G.add(new T.Mesh(new T.LatheGeometry(pts, 96), this.material('#c98450', .7, .3, {side: T.DoubleSide})));
        for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .5, leg = new T.Mesh(new T.CylinderGeometry(.03, .03, .7, 10), chrome); leg.position.set(Math.cos(a) * R * .55, -depth - .3, Math.sin(a) * R * .55); G.add(leg); }
      } else {
        const lacquer = new T.MeshPhysicalMaterial({color: '#6c1b2a', metalness: .35, roughness: .3, clearcoat: 1, clearcoatRoughness: .08});
        const shell = new T.Mesh(new T.CylinderGeometry(R * 1.01, R * 1.01, depth, 128, 1, true), lacquer); shell.position.y = -depth / 2; G.add(shell);
        const bottom = new T.Mesh(new T.TorusGeometry(R * 1.015, .04, 12, 160).rotateX(Math.PI / 2), chrome); bottom.position.y = -depth; G.add(bottom);
        const lugs = p.diameter > 450 ? 10 : 8;
        for (let k = 0; k < lugs; k++) { const a = k / lugs * TAU, lug = new T.Mesh(new T.BoxGeometry(.07, Math.min(.22, depth * .4), .09), chrome); lug.position.set(Math.cos(a) * R * 1.05, -Math.min(depth * .35, .4), Math.sin(a) * R * 1.05); lug.lookAt(0, lug.position.y, 0); G.add(lug); }
        if (p.snares) for (let k = -7; k <= 7; k++) { const wire = new T.Mesh(new T.CylinderGeometry(.005, .005, R * 1.2, 6).rotateZ(Math.PI / 2), chrome); wire.position.set(0, -depth - .02, k * .035); G.add(wire); }
      }
      const stick = new T.Group();
      if (kettle || p.hardness < .3) { stick.add(new T.Mesh(new T.SphereGeometry(.11, 24, 16), this.material('#efe6d4', 0, 1))); const h = new T.Mesh(new T.CylinderGeometry(.015, .015, 1.6, 10), this.material('#a9825b', 0, .5)); h.rotation.z = -Math.PI / 3; h.position.set(.69, .4, 0); stick.add(h); }
      else { const tip = new T.Mesh(new T.SphereGeometry(.04, 16, 12), this.material('#e2c38e', 0, .45)); const body = new T.Mesh(new T.CylinderGeometry(.02, .035, 2, 14), this.material('#d8b67a', 0, .45)); body.rotation.z = -Math.PI / 3; body.position.set(.87, .5, 0); stick.add(tip, body); }
      stick.userData.tool = true; G.add(stick);
      this.label('Head Ø ' + p.diameter + ' mm · ' + p.thickness + ' mm ' + head.name, [0, .25, R * .8]);
      this.label('Tension ' + p.tension.toFixed(0) + ' N/m', [-R * .9, .15, -R * .3]);
      if (p.shellDepth) this.label((kettle ? 'Kettle ' : 'Shell ') + p.shellDepth + ' mm', [R * 1.1, -depth * .6, 0]);
      const pos = geo.attributes.position, col = geo.attributes.color, headColor = new T.Color(head.color), up = new T.Color('#ffae42'), down = new T.Color('#3fd0ff'), tmp = new T.Color();
      this.busy = now => now - (this.strikeAt || -9) < .7;
      this.update = now => {
        const coef = this.coefficients(now);
        for (let k = 0; k < nv; k++) {
          let d = 0; for (let m = 0; m < coef.length; m++) if (coef[m]) d += coef[m] * basis[m][k];
          pos.setY(k, d * .32);
          tmp.copy(headColor).lerp(d > 0 ? up : down, clamp(Math.abs(d) * 3.2, 0, .9));
          col.setXYZ(k, tmp.r, tmp.g, tmp.b);
        }
        pos.needsUpdate = col.needsUpdate = true; geo.computeVertexNormals();
        const since = Math.max(0, now - (this.strikeAt ?? -9)), lift = since < .035 ? 1 - since / .035 : clamp((since - .035) / .35, 0, 1);
        stick.position.set(p.position * R, (kettle || p.hardness < .3 ? .11 : .04) + lift * .7, 0);
      };
      this.update(performance.now() / 1000);
    }

    /* ---------- Canvas 2D fallback ---------- */
    draw2d(now) {
      const g = this.ctx, cv = this.canvas; if (!g || !this.config) return;
      const w = cv.width, h = cv.height, fam = this.config.family, dpr = Math.min(2, window.devicePixelRatio || 1);
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#8d9bb3'; g.font = 11 * dpr + 'px system-ui, sans-serif'; g.fillText('2D PREVIEW · WebGL unavailable', 16 * dpr, h - 16 * dpr);
      if (fam === 'membrane') {
        const coef = this.coefficients(now), R = Math.min(w, h) * .38, cx = w / 2, cy = h / 2;
        for (let ri = 0; ri < 22; ri++) for (let ti = 0; ti < 64; ti++) {
          const rr = (ri + .5) / 22, a = (ti + .5) / 64 * TAU; let d = 0;
          this.baseModes.forEach((m, k) => { if (coef[k]) d += coef[k] * M.besselJ(m.m, m.j * rr) * Math.cos(m.m * a); });
          const q = clamp(d * 1.5, -1, 1); g.fillStyle = q >= 0 ? `rgba(255,174,66,${.15 + .8 * q})` : `rgba(63,208,255,${.15 - .8 * q})`;
          g.beginPath(); g.arc(cx, cy, R * (ri + 1) / 22, a - TAU / 128, a + TAU / 128); g.arc(cx, cy, R * ri / 22, a + TAU / 128, a - TAU / 128, true); g.fill();
        }
        g.strokeStyle = '#dfe3e8'; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
        return;
      }
      const closed = this.config.params.ends === 'closed', frac = this.mode !== null ? 1 : clamp(this.lastFrac ?? 1, .05, 1);
      const disp = this.profile(now, 160, fam === 'bar' ? 1 : frac, (m, u) => shape1d(fam, m, u, closed, this.analysis.shapes));
      const x0 = w * .08, x1 = w * .92, y = h / 2;
      g.strokeStyle = '#2d3a52'; g.lineWidth = (fam === 'string' ? 2 : 26) * dpr; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.strokeStyle = '#ffb347'; g.lineWidth = 3 * dpr; g.beginPath();
      disp.forEach((d, i) => { const x = x0 + (x1 - x0) * i / 160, yy = y - d * h * .22; i ? g.lineTo(x, yy) : g.moveTo(x, yy); }); g.stroke();
    }
  }
  return SoundScene;
})();
