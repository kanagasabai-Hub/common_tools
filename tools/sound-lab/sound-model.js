/* Physical sound prediction for four instrument families. Idealized textbook models:
   strings (Mersenne + stiffness), air columns (Levine–Schwinger end correction),
   free–free bars (Euler–Bernoulli finite elements + Timoshenko correction) and circular
   membranes (Bessel modes + an empirical air-loading fit). No dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SoundModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = Math.PI * 2, RHO_AIR = 1.204;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /* ---------- notes ---------- */
  const NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const midiToFreq = (m, a4 = 440) => a4 * 2 ** ((m - 69) / 12);
  const freqToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);
  const noteName = m => { const r = Math.round(m); return NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1); };
  function parseNote(text) {
    const m = /^\s*([A-Ga-g])\s*(##|bb|#|b|♯|♭|x)?\s*(-?\d{1,2})\s*$/.exec(String(text));
    if (!m) return null;
    const base = {c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()];
    const acc = {'#':1,'♯':1,'x':2,'##':2,'b':-1,'♭':-1,'bb':-2}[m[2]] || 0;
    const midi = (Number(m[3]) + 1) * 12 + base + acc;
    return midi >= 0 && midi <= 127 ? midi : null;
  }
  function pitch(f, a4 = 440) {
    if (!(f > 0)) return {midi:null, name:'—', cents:0};
    const exact = freqToMidi(f, a4), midi = Math.round(exact);
    return {midi, name: noteName(midi), cents: (exact - midi) * 100, exact};
  }
  const soundSpeed = (tempC = 20, humidity = 50) => 331.3 * Math.sqrt(1 + tempC / 273.15) + 0.0124 * humidity;

  /* ---------- materials ---------- */
  // rho kg/m³, E Pa, eta loss factor. Wound strings use an effective density over the
  // full diameter; bending stiffness uses the core fraction. Values are typical, not certified.
  const MATERIALS = {
    string: {
      steel:     {name:'Plain steel (music wire)', rho:7850, E:200e9, eta:.0003, core:1, strength:2200, color:'#c9ced6', metal:.95, rough:.25},
      bronze:    {name:'Phosphor bronze-wound steel', rho:4800, E:200e9, eta:.0006, core:.34, strength:2200, color:'#c99a5b', metal:.9, rough:.35},
      nickel:    {name:'Nickel-wound steel', rho:5400, E:200e9, eta:.0005, core:.38, strength:2200, color:'#b9b5aa', metal:.9, rough:.3},
      tungsten:  {name:'Tungsten-wound steel core', rho:7900, E:200e9, eta:.0006, core:.45, strength:2200, color:'#8d9099', metal:.9, rough:.35},
      synthetic: {name:'Synthetic core, aluminium-wound', rho:1650, E:5e9, eta:.002, core:.7, strength:700, color:'#c7ccd1', metal:.7, rough:.4},
      nylon:     {name:'Nylon monofilament', rho:1140, E:3.5e9, eta:.0035, core:1, strength:500, color:'#efe9dc', metal:0, rough:.35},
      fluoro:    {name:'Fluorocarbon (PVDF)', rho:1780, E:4.5e9, eta:.0025, core:1, strength:450, color:'#e3e9e6', metal:0, rough:.3},
      gut:       {name:'Natural gut', rho:1300, E:5.5e9, eta:.006, core:1, strength:350, color:'#d9c38f', metal:0, rough:.55}
    },
    wood: {
      spruce:   {name:'Spruce top', rho:420, E:11e9, eta:.008, color:'#e8cf9e'},
      cedar:    {name:'Cedar top', rho:380, E:9e9, eta:.009, color:'#c98b5a'},
      mahogany: {name:'Mahogany', rho:540, E:10e9, eta:.011, color:'#8a4a2f'},
      maple:    {name:'Maple', rho:640, E:12e9, eta:.01, color:'#e0c190'},
      laminate: {name:'Laminated wood', rho:600, E:8e9, eta:.02, color:'#b98a5e'},
      carbon:   {name:'Carbon fibre', rho:1500, E:70e9, eta:.004, color:'#2b2e33'}
    },
    bar: {
      rosewood:  {name:'Honduras rosewood', rho:1050, E:20e9, eta:.007, eg:14, color:'#7a3b24', metal:0, rough:.5},
      padauk:    {name:'Padauk', rho:740, E:12e9, eta:.008, eg:14, color:'#a4472b', metal:0, rough:.55},
      maple:     {name:'Hard maple', rho:700, E:12.6e9, eta:.009, eg:12, color:'#d9b98a', metal:0, rough:.55},
      bamboo:    {name:'Bamboo (laminated)', rho:700, E:17e9, eta:.012, eg:10, color:'#cfb57a', metal:0, rough:.5},
      fiberglass:{name:'Fibreglass composite', rho:1800, E:16e9, eta:.0025, eg:4, color:'#4d3b30', metal:.1, rough:.35},
      aluminum:  {name:'Aluminium alloy', rho:2700, E:69e9, eta:.0003, eg:2.6, color:'#c3c8cd', metal:1, rough:.3},
      steel:     {name:'Steel', rho:7850, E:200e9, eta:.00015, eg:2.6, color:'#9ba1a9', metal:1, rough:.25},
      brass:     {name:'Brass', rho:8500, E:100e9, eta:.0004, eg:2.7, color:'#caa24e', metal:1, rough:.28},
      glass:     {name:'Borosilicate glass', rho:2230, E:63e9, eta:.0006, eg:2.4, color:'#bfe3e8', metal:.1, rough:.05}
    },
    wall: { // wall losses relative to smooth brass; brightness multiplies partial slope
      brass:      {name:'Brass', loss:1, bright:1, color:'#caa24e', metal:1, rough:.25},
      silver:     {name:'Silver', loss:1, bright:1.03, color:'#d8dde2', metal:1, rough:.18},
      organMetal: {name:'Organ metal (tin–lead)', loss:1.05, bright:1, color:'#aeb4b8', metal:.9, rough:.35},
      grenadilla: {name:'Grenadilla wood', loss:1.25, bright:.92, color:'#2e2522', metal:0, rough:.4},
      pine:       {name:'Pine / oak (organ wood)', loss:1.35, bright:.88, color:'#c8a070', metal:0, rough:.6},
      bamboo:     {name:'Bamboo', loss:1.45, bright:.86, color:'#c9ad6c', metal:0, rough:.5},
      pvc:        {name:'PVC', loss:1.1, bright:.95, color:'#e9eaec', metal:0, rough:.3},
      glass:      {name:'Glass', loss:.95, bright:1, color:'#bfe3e8', metal:.1, rough:.05}
    },
    head: {
      mylar:     {name:'Clear polyester (Mylar)', rho:1390, eta:.01, color:'#ebe7dc', rough:.2},
      coated:    {name:'Coated polyester', rho:1450, eta:.02, color:'#f4f1ea', rough:.7},
      calfskin:  {name:'Calfskin', rho:1100, eta:.03, color:'#e3cfa2', rough:.65},
      goatskin:  {name:'Goatskin', rho:1050, eta:.035, color:'#d8c08a', rough:.7},
      mesh:      {name:'Aramid mesh', rho:1440, eta:.08, color:'#34363a', rough:.8}
    }
  };

  /* ---------- parameter schemas (drive the UI, calibration and validation) ---------- */
  // power: exponent p in f ∝ x^p, used as the first guess when calibrating by that field.
  const n = (key, label, unit, min, max, step, group, extra = {}) => ({key, label, unit, min, max, step, group, type:'number', ...extra});
  const s = (key, label, options, group, extra = {}) => ({key, label, options, group, type:'select', ...extra});
  const b = (key, label, group, extra = {}) => ({key, label, group, type:'bool', ...extra});
  const FAMILIES = {
    string: {name:'Strings', icon:'〰', pitchLabel:'Open string', fields:[
      s('material','String material','string','Material'),
      s('bodyWood','Body top wood','wood','Material'),
      n('length','Vibrating length','m',.05,3,.001,'Dimensions',{power:-1,tune:true,help:'Nut/bridge to bridge (scale length).'}),
      n('diameter','Overall diameter','mm',.1,5,.01,'Dimensions',{power:-1,tune:true}),
      n('bodyLength','Body length (0 = no body)','mm',0,2000,1,'Dimensions'),
      n('bodyDepth','Body depth','mm',5,400,1,'Dimensions'),
      n('soundhole','Sound-hole equivalent diameter','mm',5,200,1,'Dimensions'),
      n('tension','String tension','N',1,3000,.1,'Adjustments',{power:.5,tune:true}),
      s('excitation','Excitation',[['pluck','Pluck'],['bow','Bow'],['hammer','Hammer']],'Adjustments'),
      n('position','Excitation point from bridge','× length',.02,.5,.005,'Adjustments'),
      n('hardness','Pick / hammer hardness','0–1',0,1,.01,'Adjustments'),
      n('vibrato','Vibrato depth (bowed)','cents',0,50,1,'Adjustments'),
      n('range','Playable range above open string','semitones',0,48,1,'Adjustments'),
      n('temperature','Air temperature','°C',-10,45,.5,'Environment')
    ]},
    air: {name:'Air columns', icon:'◎', pitchLabel:'Lowest note (all holes closed)', fields:[
      s('wall','Wall material','wall','Material'),
      n('length','Tube length','m',.02,12,.0005,'Dimensions',{power:-1,tune:true}),
      n('bore','Bore diameter','mm',2,400,.1,'Dimensions'),
      s('ends','Ends',[['open','Open – open (flute, open pipe)'],['closed','Closed – open (clarinet, stopped pipe)']],'Dimensions'),
      s('excitation','Excitation',[['edge','Air jet / edge tone'],['reed','Single reed']],'Adjustments'),
      n('breath','Breath / reed brightness','0–1',0,1,.01,'Adjustments'),
      n('vibrato','Vibrato depth','cents',0,50,1,'Adjustments'),
      n('range','Playable range above lowest note','semitones',0,48,1,'Adjustments'),
      n('temperature','Air temperature in the bore','°C',-10,45,.5,'Environment',{power:.5,tune:true,offset:273.15}),
      n('humidity','Relative humidity','%',0,100,1,'Environment')
    ]},
    bar: {name:'Bars & mallets', icon:'▭', pitchLabel:'Calibrated bar', fields:[
      s('material','Bar material','bar','Material'),
      n('length','Bar length','mm',20,2000,.1,'Dimensions',{power:-2,tune:true}),
      n('width','Bar width','mm',5,200,.5,'Dimensions'),
      n('thickness','Thickness at ends','mm',1,100,.1,'Dimensions',{power:1,tune:true}),
      n('undercut','Undercut arch depth','mm',0,90,.05,'Dimensions',{help:'Parabolic arch cut under the centre. Lowers mode 1 more than mode 2.'}),
      n('undercutSpan','Undercut span','× length',.2,.9,.01,'Dimensions'),
      n('position','Strike point from end','× length',0,.5,.01,'Adjustments'),
      n('hardness','Mallet hardness','0–1',0,1,.01,'Adjustments'),
      b('resonator','Tuned tube resonator','Adjustments'),
      n('rangeLow','Range below','semitones',0,48,1,'Adjustments'),
      n('rangeHigh','Range above','semitones',0,60,1,'Adjustments')
    ]},
    membrane: {name:'Drums & membranes', icon:'◉', pitchLabel:'Tuned head', fields:[
      s('material','Head material','head','Material'),
      n('diameter','Head diameter','mm',50,1500,1,'Dimensions',{power:-1,tune:true}),
      n('thickness','Head thickness','mm',.05,2,.005,'Dimensions',{power:-.5,tune:true}),
      n('shellDepth','Shell / kettle depth','mm',0,1000,1,'Dimensions'),
      n('tension','Head tension','N/m',10,20000,1,'Adjustments',{power:.5,tune:true}),
      s('pitchMode','Pitch reference mode',[['11','(1,1) — timpani principal tone'],['01','(0,1) — fundamental']],'Adjustments'),
      n('position','Strike point','r / radius',0,.95,.01,'Adjustments'),
      n('hardness','Stick / mallet hardness','0–1',0,1,.01,'Adjustments'),
      n('airLoading','Air loading (kettle / shell)','0–1',0,1,.01,'Adjustments',{help:'Empirical fit: 1 reproduces published timpani mode ratios near 1 : 1.5 : 2 : 2.5.'}),
      b('snares','Snare wires','Adjustments'),
      n('rangeLow','Retune range below','semitones',0,24,1,'Adjustments'),
      n('rangeHigh','Retune range above','semitones',0,24,1,'Adjustments')
    ]}
  };

  /* ---------- presets (dimensions are typical; calibration solves the tuning field) ---------- */
  const PRESETS = [
    {id:'acoustic-guitar', name:'Steel-string guitar · low E', family:'string', target:'E2', tuneBy:'tension', params:{material:'bronze', bodyWood:'spruce', length:.645, diameter:1.35, bodyLength:505, bodyDepth:105, soundhole:100, tension:78, excitation:'pluck', position:.12, hardness:.75, vibrato:0, range:20, temperature:20}},
    {id:'classical-guitar', name:'Classical guitar · high E', family:'string', target:'E4', tuneBy:'tension', params:{material:'nylon', bodyWood:'cedar', length:.65, diameter:.72, bodyLength:485, bodyDepth:95, soundhole:85, tension:70, excitation:'pluck', position:.13, hardness:.3, vibrato:0, range:19, temperature:20}},
    {id:'ukulele', name:'Ukulele · C string', family:'string', target:'C4', tuneBy:'tension', params:{material:'fluoro', bodyWood:'mahogany', length:.345, diameter:.81, bodyLength:300, bodyDepth:65, soundhole:50, tension:30, excitation:'pluck', position:.18, hardness:.25, vibrato:0, range:15, temperature:20}},
    {id:'violin', name:'Violin · A string', family:'string', target:'A4', tuneBy:'tension', params:{material:'synthetic', bodyWood:'spruce', length:.328, diameter:.68, bodyLength:356, bodyDepth:36, soundhole:40, tension:50, excitation:'bow', position:.09, hardness:.5, vibrato:12, range:36, temperature:20}},
    {id:'cello', name:'Cello · C string', family:'string', target:'C2', tuneBy:'tension', params:{material:'tungsten', bodyWood:'spruce', length:.69, diameter:1.6, bodyLength:755, bodyDepth:120, soundhole:75, tension:130, excitation:'bow', position:.1, hardness:.5, vibrato:10, range:36, temperature:20}},
    {id:'piano', name:'Piano · A4 string', family:'string', target:'A4', tuneBy:'tension', params:{material:'steel', bodyWood:'spruce', length:.38, diameter:1, bodyLength:1500, bodyDepth:300, soundhole:200, tension:690, excitation:'hammer', position:.12, hardness:.6, vibrato:0, range:39, temperature:20}},
    {id:'flute', name:'Concert flute (open tube)', family:'air', target:'C4', tuneBy:'length', params:{wall:'silver', length:.644, bore:19, ends:'open', excitation:'edge', breath:.55, vibrato:15, range:36, temperature:20, humidity:60}},
    {id:'clarinet', name:'Clarinet (ideal cylinder)', family:'air', target:'D3', tuneBy:'length', params:{wall:'grenadilla', length:.58, bore:14.6, ends:'closed', excitation:'reed', breath:.5, vibrato:0, range:39, temperature:20, humidity:60}},
    {id:'organ-open', name:'Open organ pipe 8′ C', family:'air', target:'C2', tuneBy:'length', params:{wall:'organMetal', length:2.56, bore:100, ends:'open', excitation:'edge', breath:.45, vibrato:0, range:12, temperature:18, humidity:50}},
    {id:'organ-stopped', name:'Stopped flute pipe 4′ C', family:'air', target:'C3', tuneBy:'length', params:{wall:'pine', length:.6376, bore:60, ends:'closed', excitation:'edge', breath:.35, vibrato:0, range:12, temperature:18, humidity:50}},
    {id:'pan-flute', name:'Pan flute pipe A4', family:'air', target:'A4', tuneBy:'length', params:{wall:'bamboo', length:.1913, bore:12, ends:'closed', excitation:'edge', breath:.7, vibrato:8, range:24, temperature:20, humidity:60}},
    {id:'marimba', name:'Marimba bar C4 (1 : 4 tuned)', family:'bar', target:'C4', tuneBy:'length', overtone:4, params:{material:'rosewood', length:361.4, width:57, thickness:22, undercut:14.19, undercutSpan:.6, position:.4, hardness:.35, resonator:true, rangeLow:27, rangeHigh:36}},
    {id:'xylophone', name:'Xylophone bar C5 (1 : 3 tuned)', family:'bar', target:'C5', tuneBy:'length', overtone:3, params:{material:'rosewood', length:374.8, width:38, thickness:24, undercut:7.13, undercutSpan:.55, position:.42, hardness:.8, resonator:true, rangeLow:12, rangeHigh:36}},
    {id:'vibraphone', name:'Vibraphone bar F3 (1 : 4 tuned)', family:'bar', target:'F3', tuneBy:'length', overtone:4, params:{material:'aluminum', length:396.3, width:57, thickness:13, undercut:7.76, undercutSpan:.6, position:.42, hardness:.45, resonator:true, rangeLow:0, rangeHigh:36}},
    {id:'glockenspiel', name:'Glockenspiel bar C6 (uniform)', family:'bar', target:'C6', tuneBy:'length', params:{material:'steel', length:200, width:25, thickness:8, undercut:0, undercutSpan:.5, position:.45, hardness:.9, resonator:false, rangeLow:5, rangeHigh:24}},
    {id:'timpani', name:'Timpani 26″', family:'membrane', target:'F2', tuneBy:'tension', params:{material:'mylar', diameter:660, thickness:.19, shellDepth:450, tension:3000, pitchMode:'11', position:.75, hardness:.4, airLoading:1, snares:false, rangeLow:3, rangeHigh:5}},
    {id:'floor-tom', name:'Floor tom 16″', family:'membrane', target:'A2', tuneBy:'tension', params:{material:'coated', diameter:406, thickness:.35, shellDepth:406, tension:1200, pitchMode:'01', position:.35, hardness:.6, airLoading:.35, snares:false, rangeLow:5, rangeHigh:5}},
    {id:'snare', name:'Snare drum 14″', family:'membrane', target:'A3', tuneBy:'tension', params:{material:'coated', diameter:355, thickness:.25, shellDepth:140, tension:3500, pitchMode:'01', position:.3, hardness:.8, airLoading:.3, snares:true, rangeLow:5, rangeHigh:5}},
    {id:'frame-drum', name:'Frame drum 20″ (goatskin)', family:'membrane', target:'G2', tuneBy:'tension', params:{material:'goatskin', diameter:508, thickness:.35, shellDepth:60, tension:600, pitchMode:'01', position:.8, hardness:.15, airLoading:.2, snares:false, rangeLow:4, rangeHigh:4}}
  ];

  /* ---------- numerical helpers ---------- */
  function besselJ(m, x) { // power series; accurate to ~1e-10 for x < 25
    let term = (x / 2) ** m, sum = 0;
    for (let k = 1; k <= m; k++) term /= k;
    for (let k = 0; k < 80; k++) {
      sum += term;
      term *= -(x * x / 4) / ((k + 1) * (k + m + 1));
      if (Math.abs(term) < 1e-16 * Math.max(1, Math.abs(sum)) && k > x) break;
    }
    return sum;
  }
  // Zeros j(m,n) of J_m, sorted by value: [m, n, j]
  const BESSEL_ZEROS = [[0,1,2.40483],[1,1,3.83171],[2,1,5.13562],[0,2,5.52008],[3,1,6.38016],[1,2,7.01559],[4,1,7.58834],[2,2,8.41724],[0,3,8.65373],[5,1,8.77148],[3,2,9.76102],[6,1,9.93611],[1,3,10.17347],[4,2,11.06471],[7,1,11.08637],[2,3,11.61984],[0,4,11.79153],[8,1,12.22509],[5,2,12.33860],[3,3,13.01520]];
  const besselPeak = {};
  function besselMax(m) { // largest |J_m| on [0, 14], for strike-point normalisation
    if (besselPeak[m] === undefined) { let v = 0; for (let x = 0; x <= 14; x += .01) v = Math.max(v, Math.abs(besselJ(m, x))); besselPeak[m] = v; }
    return besselPeak[m];
  }

  // Generalised symmetric eigenproblem K x = λ M x via Cholesky + cyclic Jacobi.
  function eigenGeneral(K, M, size) {
    const L = new Float64Array(size * size);
    for (let i = 0; i < size; i++) for (let j = 0; j <= i; j++) {
      let v = M[i * size + j];
      for (let k = 0; k < j; k++) v -= L[i * size + k] * L[j * size + k];
      if (i === j) { if (v <= 0) throw Error('Mass matrix is not positive definite'); L[i * size + i] = Math.sqrt(v); }
      else L[i * size + j] = v / L[j * size + j];
    }
    const solveLower = (col, get, set) => { for (let i = 0; i < size; i++) { let v = get(i); for (let k = 0; k < i; k++) v -= L[i * size + k] * col[k]; col[i] = v / L[i * size + i]; } };
    const Y = new Float64Array(size * size), col = new Float64Array(size);
    for (let j = 0; j < size; j++) { solveLower(col, i => K[i * size + j]); for (let i = 0; i < size; i++) Y[i * size + j] = col[i]; }
    const A = new Float64Array(size * size);
    for (let j = 0; j < size; j++) { solveLower(col, i => Y[j * size + i]); for (let i = 0; i < size; i++) A[i * size + j] = col[i]; }
    for (let i = 0; i < size; i++) for (let j = 0; j < i; j++) { const v = (A[i * size + j] + A[j * size + i]) / 2; A[i * size + j] = A[j * size + i] = v; }
    const V = new Float64Array(size * size); for (let i = 0; i < size; i++) V[i * size + i] = 1;
    for (let sweep = 0; sweep < 80; sweep++) {
      let off = 0, diag = 0;
      for (let i = 0; i < size; i++) { diag += A[i * size + i] ** 2; for (let j = i + 1; j < size; j++) off += A[i * size + j] ** 2; }
      if (off <= 1e-22 * diag) break;
      for (let p = 0; p < size - 1; p++) for (let q = p + 1; q < size; q++) {
        const apq = A[p * size + q]; if (Math.abs(apq) < 1e-13 * Math.sqrt(Math.abs(A[p * size + p] * A[q * size + q]))) continue;
        const theta = (A[q * size + q] - A[p * size + p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
        for (let k = 0; k < size; k++) { const kp = A[k * size + p], kq = A[k * size + q]; A[k * size + p] = c * kp - sn * kq; A[k * size + q] = sn * kp + c * kq; }
        for (let k = 0; k < size; k++) { const pk = A[p * size + k], qk = A[q * size + k]; A[p * size + k] = c * pk - sn * qk; A[q * size + k] = sn * pk + c * qk; }
        for (let k = 0; k < size; k++) { const kp = V[k * size + p], kq = V[k * size + q]; V[k * size + p] = c * kp - sn * kq; V[k * size + q] = sn * kp + c * kq; }
      }
    }
    const out = [];
    for (let j = 0; j < size; j++) { // back-substitute x = L⁻ᵀ v
      const x = new Float64Array(size);
      for (let i = size - 1; i >= 0; i--) { let v = V[i * size + j]; for (let k = i + 1; k < size; k++) v -= L[k * size + i] * x[k]; x[i] = v / L[i * size + i]; }
      out.push({value: A[j * size + j], vector: x});
    }
    return out.sort((a, b) => a.value - b.value);
  }

  // Free–free Euler–Bernoulli beam, normalised to L = 1, end thickness = 1, E/ρ = 1.
  // u = undercut depth ÷ end thickness, w = undercut span. Width cancels out.
  const beamCache = new Map(), ELEMENTS = 24;
  const thicknessAt = (x, u, w) => { const sN = (x - .5) / (w / 2); return Math.abs(sN) < 1 ? 1 - u * (1 - sN * sN) : 1; };
  function beamModes(u, w) {
    const key = u.toFixed(6) + '|' + w.toFixed(4);
    if (beamCache.has(key)) return beamCache.get(key);
    const ne = ELEMENTS, l = 1 / ne, size = 2 * (ne + 1), K = new Float64Array(size * size), M = new Float64Array(size * size);
    const g = [.5 - .5 / Math.sqrt(3), .5 + .5 / Math.sqrt(3)];
    for (let e = 0; e < ne; e++) {
      const hs = g.map(q => thicknessAt((e + q) * l, u, w)), I = (hs[0] ** 3 + hs[1] ** 3) / 24, A = (hs[0] + hs[1]) / 2;
      const ke = [12, 6*l, -12, 6*l, 6*l, 4*l*l, -6*l, 2*l*l, -12, -6*l, 12, -6*l, 6*l, 2*l*l, -6*l, 4*l*l].map(v => v * I / l ** 3);
      const me = [156, 22*l, 54, -13*l, 22*l, 4*l*l, 13*l, -3*l*l, 54, 13*l, 156, -22*l, -13*l, -3*l*l, -22*l, 4*l*l].map(v => v * A * l / 420);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const at = (2 * e + i) * size + 2 * e + j; K[at] += ke[i * 4 + j]; M[at] += me[i * 4 + j]; }
    }
    const modes = eigenGeneral(K, M, size).filter(m => m.value > 1).slice(0, 8).map(m => {
      const shape = Array.from({length: ne + 1}, (_, i) => m.vector[2 * i]);
      const peak = Math.max(...shape.map(Math.abs)) || 1, sign = shape[0] < 0 ? -1 : 1;
      return {lambda: m.value, shape: shape.map(v => sign * v / peak)};
    });
    if (beamCache.size > 80) beamCache.delete(beamCache.keys().next().value);
    beamCache.set(key, modes);
    return modes;
  }
  const sampleShape = (shape, x) => { const p = clamp(x, 0, 1) * (shape.length - 1), i = Math.min(shape.length - 2, Math.floor(p)), f = p - i; return shape[i] * (1 - f) + shape[i + 1] * f; };

  /* ---------- family analyses ---------- */
  const T60 = 6.9078; // ln(1000): seconds to fall 60 dB = T60 / amplitude decay rate
  const BETA = [4.73004, 7.85320, 10.99561, 14.13717, 17.27876, 20.42035, 23.56194, 26.70354]; // free–free βL
  const peak = (f, fk, q) => 1 / Math.sqrt(1 + q * q * (f / fk - fk / f) ** 2);
  const malletLowpass = (f, tau) => 1 / Math.sqrt(1 + (2 * f * tau) ** 4);

  function stringBody(p, c) {
    const wood = MATERIALS.wood[p.bodyWood];
    if (!p.bodyLength) return {gain: f => .6 / (1 + (f / 9000) ** 2), coupling: () => 0, modes: []};
    const Lb = p.bodyLength / 1000, Wb = Lb * .72, depth = p.bodyDepth / 1000, volume = .7 * Lb * Wb * depth;
    const r = p.soundhole / 2000, area = Math.PI * r * r, neck = .003 + 1.7 * r;
    const fH = c / TAU * Math.sqrt(area / (volume * neck));
    const h = .0028, rigidity = wood.E * .3 * h ** 3 / (12 * .91), a = Lb * .8, bw = Wb * .8, q = .25 / wood.eta;
    const plate = (i, j) => Math.PI / 2 * Math.sqrt(rigidity / (wood.rho * h)) * ((i / a) ** 2 + (j / bw) ** 2) * 2.8; // 2.8 ≈ bracing + edge stiffening
    const modes = [{f:fH, q:25, w:1.1, label:'Air cavity (Helmholtz)'}, {f:plate(1,1), q, w:1, label:'Top plate (1,1)'}, {f:plate(2,1), q, w:.6, label:'Top plate (2,1)'}, {f:plate(1,2), q, w:.5, label:'Top plate (1,2)'}, {f:plate(2,2), q, w:.35, label:'Top plate (2,2)'}];
    return {
      modes, volume,
      gain: f => (.35 + modes.reduce((v, m) => v + m.w * peak(f, m.f, m.q), 0)) * f * f / (f * f + (.7 * fH) ** 2) / (1 + (f / 9000) ** 2),
      coupling: f => modes.reduce((v, m) => v + 2.5 * m.w * peak(f, m.f, m.q) ** 2, 0)
    };
  }

  function analyzeString(p) {
    const mat = MATERIALS.string[p.material], d = p.diameter / 1000, mu = mat.rho * Math.PI * d * d / 4;
    const f0 = Math.sqrt(p.tension / mu) / (2 * p.length), core = d * mat.core;
    const B = Math.PI ** 3 * mat.E * core ** 4 / (64 * p.tension * p.length ** 2);
    const stress = p.tension / (Math.PI * core * core / 4) / 1e6, c = soundSpeed(p.temperature, 50), body = stringBody(p, c);
    const bow = p.excitation === 'bow', tau = .004 - .0034 * p.hardness, partials = [];
    for (let k = 1; k <= 90; k++) {
      const f = bow ? k * f0 : k * f0 * Math.sqrt(1 + B * k * k); // bowing mode-locks partials to exact harmonics
      if (f > 18000) break;
      const shape = Math.abs(Math.sin(k * Math.PI * p.position));
      const exc = p.excitation === 'pluck' ? shape / (k * k) / (1 + (k / (3 + 57 * p.hardness ** 2)) ** 2) * (1 + p.hardness * k * .15)
        : p.excitation === 'hammer' ? shape / k / Math.sqrt(1 + (f * tau) ** 4) : shape / k;
      const alpha = .3 + Math.PI * f * mat.eta + 1.2 / (p.diameter * Math.sqrt(f)) + body.coupling(f);
      partials.push({f, amp: exc * body.gain(f), t60: T60 / alpha, label: 'Partial ' + k, harmonic: k});
    }
    const warnings = [], pct = stress / mat.strength * 100;
    if (pct > 90) warnings.push('Core stress is ' + pct.toFixed(0) + '% of typical breaking strength — this string would likely break.');
    else if (pct > 70) warnings.push('High core stress (' + pct.toFixed(0) + '% of breaking strength).');
    if (pct < 4) warnings.push('Very low tension: the string would be floppy and buzz against frets.');
    if (B > .005) warnings.push('Very stiff string for its length: partials are strongly sharp (inharmonic).');
    if (Math.abs(Math.sin(2 * Math.PI * p.position)) < .02) warnings.push('Exciting the string at a node of partial 2 suppresses the even partials.');
    return {f0, partials, sustained: bow, bodyModes: body.modes, bodyGain: body.gain,
      metrics: [['Linear density', mu * 1000, 'g/m'], ['Wave speed', 2 * p.length * f0, 'm/s'], ['Inharmonicity B', B, ''], ['Core stress', stress, 'MPa'], ['Stress vs breaking', pct, '%'], ...body.modes.slice(0, 2).map(m => [m.label, m.f, 'Hz'])],
      warnings, noise: {type: bow ? 'bow' : 'click', level: bow ? .012 : .02 + .05 * p.hardness, tau}};
  }

  function analyzeAir(p) {
    const wall = MATERIALS.wall[p.wall], c = soundSpeed(p.temperature, p.humidity), r = p.bore / 2000, closed = p.ends === 'closed';
    const quarter = closed ? 4 : 2, ends = closed ? 1 : 2;
    const endCorrection = f => r * Math.max(.3, .6133 - .1168 * (TAU * f / c * r) ** 2); // Levine–Schwinger, low ka
    const modeFreq = k => { let f = k * c / (quarter * (p.length + ends * .6133 * r)); for (let i = 0; i < 8; i++) f = k * c / (quarter * (p.length + ends * endCorrection(f))); return f; };
    const f0 = modeFreq(1), Leff = c / (quarter * f0), partials = [];
    const slope = (p.excitation === 'reed' ? 1.9 - 1.2 * p.breath : 2.6 - 1.6 * p.breath) / wall.bright;
    for (let k = 1; k <= 80; k += closed ? 2 : 1) {
      const f = modeFreq(k), ka = TAU * f / c * r;
      if (f > 16000 || ka > 1.84) break; // above the first transverse cut-on the 1-D model no longer applies
      const alpha = 3e-5 * Math.sqrt(f) / r * wall.loss * c + ka * ka * c / (4 * Leff) * ends;
      partials.push({f, amp: k ** -slope * (1 + .2 * Math.min(1, ka * 4)), t60: T60 / alpha, label: 'Mode ' + k, harmonic: k, q: Math.PI * f / alpha});
    }
    const warnings = [];
    if (p.bore / 1000 > p.length * .25) warnings.push('Very wide bore for its length: the one-dimensional tube model is less reliable.');
    if (p.excitation === 'reed' && !closed) warnings.push('A single reed normally closes the tube end; open–open with a reed is unusual.');
    if (closed && p.excitation === 'reed') warnings.push('Real clarinets add a mouthpiece, bell and tone holes, so the real instrument is longer than this ideal cylinder.');
    return {f0, partials, sustained: true,
      metrics: [['Speed of sound', c, 'm/s'], ['Effective length', Leff, 'm'], ['End correction', (Leff - p.length) * 1000, 'mm'], ['Q of mode 1', partials[0] ? partials[0].q : 0, ''], ['Wavelength', c / f0, 'm']],
      warnings, noise: {type: p.excitation === 'edge' ? 'breath' : 'reed', level: p.excitation === 'edge' ? .03 + .05 * p.breath : .012}};
  }

  function analyzeBar(p) {
    const mat = MATERIALS.bar[p.material], L = p.length / 1000, h = p.thickness / 1000;
    const u = clamp(p.undercut / p.thickness, 0, .9), modes = beamModes(u, p.undercutSpan);
    const scale = h / (L * L) * Math.sqrt(mat.E / mat.rho), tau = .0045 * (1 - p.hardness) + .0002;
    const hMean = h * (1 - u * p.undercutSpan * 2 / 3); // shear/rotary-inertia correction uses the mean thickness
    const freqs = modes.map((m, i) => Math.sqrt(m.lambda) / TAU * scale / Math.sqrt(1 + (BETA[i] * hMean / L) ** 2 / 12 * (1 + 1.2 * mat.eg)));
    const f0 = freqs[0], c = soundSpeed(20, 50), tubeR = p.width / 2000 * .9, tubeLength = c / (4 * f0) - .6133 * tubeR;
    const partials = modes.map((m, i) => {
      const f = freqs[i]; let amp = Math.abs(sampleShape(m.shape, p.position)) * malletLowpass(f, tau), alpha = Math.PI * f * mat.eta * (1 + f / 6000) + .25;
      if (p.resonator) for (const odd of [1, 3, 5]) { const near = peak(f, odd * f0, 30); amp *= 1 + (odd === 1 ? 1.4 : .6) * near; alpha += (odd === 1 ? 1.6 : .8) * near; }
      return {f, amp, t60: T60 / alpha, label: 'Flexural mode ' + (i + 1), harmonic: i + 1};
    }).filter(x => x.f < 18000);
    const warnings = [];
    if (u > .86) warnings.push('Very deep undercut: the bar would be fragile at its centre.');
    if (L / h < 6) warnings.push('Short, thick bar: shear dominates and beam theory is less accurate.');
    if (Math.min(p.position, 1 - p.position) < .03) warnings.push('Striking the very end excites every mode but is not typical playing technique.');
    const shape1 = modes[0].shape, node = shape1.findIndex((v, i) => i > 0 && Math.sign(v) !== Math.sign(shape1[i - 1]));
    const nodeAt = node > 0 ? (node - 1 + shape1[node - 1] / (shape1[node - 1] - shape1[node])) / ELEMENTS : .224; // linear zero crossing
    const massG = mat.rho * (p.width / 1000) * h * L * (1 - u * p.undercutSpan * 2 / 3) * 1000;
    return {f0, partials, sustained: false, shapes: modes.map(m => m.shape), profile: {u, w: p.undercutSpan},
      metrics: [['Mode 2 ÷ mode 1', freqs[1] / f0, ''], ['Mode 3 ÷ mode 1', freqs[2] / f0, ''], ['Bar mass', massG, 'g'], ['Support node from end', nodeAt, '× length'], ...(p.resonator ? [['Resonator tube length', tubeLength * 1000, 'mm']] : [])],
      warnings, noise: {type: 'strike', level: .03 + .1 * p.hardness, tau}};
  }

  function analyzeMembrane(p) {
    const mat = MATERIALS.head[p.material], a = p.diameter / 2000, sigma = mat.rho * p.thickness / 1000, wave = Math.sqrt(p.tension / sigma);
    const loadRatio = RHO_AIR * a / sigma, load = 9.5 * p.airLoading * loadRatio, tau = .006 * (1 - p.hardness) + .0006, c = soundSpeed(20, 50);
    const shellF = p.shellDepth > 0 ? c / (2 * p.shellDepth / 1000) : 0;
    const modes = BESSEL_ZEROS.map(([m, k, j]) => {
      const f = j * wave / (TAU * a) / Math.sqrt(1 + load / j);
      let amp = Math.abs(besselJ(m, j * p.position)) / besselMax(m) * malletLowpass(f, tau) * (m === 0 ? 1 : .8);
      if (shellF) amp *= 1 + .8 * peak(f, shellF, 8);
      const alpha = .5 + Math.PI * f * mat.eta + (m === 0 ? 20 : m === 1 ? 1.2 : .6) * Math.sqrt(loadRatio) * .8 / k;
      return {f, amp, t60: T60 / alpha, label: 'Mode (' + m + ',' + k + ')', m, n: k, j};
    });
    const ref = modes.find(x => x.m === (p.pitchMode === '11' ? 1 : 0) && x.n === 1), r11 = modes[1].f;
    const warnings = [];
    if (p.tension < 300) warnings.push('Slack head: very low tension gives a flappy, pitchless sound.');
    if (p.position < .05) warnings.push('Striking the exact centre excites only the circular (0,n) modes.');
    if (p.pitchMode === '11' && p.airLoading < .5) warnings.push('The (1,1) principal tone is only strong with a kettle; consider more air loading.');
    return {f0: ref.f, partials: modes.filter(x => x.f < 18000), sustained: false,
      metrics: [['Surface density', sigma * 1000, 'g/m²'], ['Transverse wave speed', wave, 'm/s'], ['(2,1) ÷ (1,1)', modes[2].f / r11, ''], ['(3,1) ÷ (1,1)', modes[4].f / r11, ''], ['(4,1) ÷ (1,1)', modes[6].f / r11, ''], ...(shellF ? [['Shell axial resonance', shellF, 'Hz']] : [])],
      warnings, noise: {type: p.snares ? 'snare' : 'strike', level: p.snares ? .35 : .05 + .08 * p.hardness, tau}};
  }

  /* ---------- analysis, calibration and validation ---------- */
  const ANALYZERS = {string: analyzeString, air: analyzeAir, bar: analyzeBar, membrane: analyzeMembrane};
  const NOTE_FIELD = {string: 'length', air: 'length', bar: 'length', membrane: 'tension'};
  const field = (family, key) => FAMILIES[family].fields.find(f => f.key === key);

  function playableRange(config, f0) {
    const p = config.params;
    return config.family === 'string' || config.family === 'air' ? [f0, f0 * 2 ** (p.range / 12)] : [f0 * 2 ** (-p.rangeLow / 12), f0 * 2 ** (p.rangeHigh / 12)];
  }

  function analyze(config, params = config.params) {
    const raw = ANALYZERS[config.family](params);
    const top = Math.max(1e-12, ...raw.partials.map(x => x.amp));
    const partials = raw.partials.map(x => ({...x, amp: x.amp / top})).filter(x => x.amp >= 5e-4 && x.f > 0).slice(0, 64).map(x => {
      const harmonic = Math.max(1, Math.round(x.f / raw.f0));
      return {...x, db: 20 * Math.log10(x.amp), ratio: x.f / raw.f0, cents: 1200 * Math.log2(x.f / (harmonic * raw.f0))};
    });
    const targetMidi = parseNote(config.target), targetF = midiToFreq(targetMidi, config.a4);
    const weight = partials.reduce((v, x) => v + x.amp, 0) || 1, first = partials.slice(0, 8);
    const loudest = [...partials].sort((a, b) => b.amp - a.amp).slice(0, 6), loudW = loudest.reduce((v, x) => v + x.amp, 0) || 1;
    return {...raw, family: config.family, partials,
      pitch: pitch(raw.f0, config.a4),
      target: {midi: targetMidi, name: noteName(targetMidi), f: targetF, cents: 1200 * Math.log2(raw.f0 / targetF)},
      centroid: partials.reduce((v, x) => v + x.f * x.amp, 0) / weight,
      t60: loudest.reduce((v, x) => v + x.t60 * x.amp, 0) / loudW,
      inharmonicity: Math.sqrt(first.reduce((v, x) => v + x.cents ** 2, 0) / Math.max(1, first.length)),
      range: playableRange(config, raw.f0)};
  }

  // Solve one tuning field so the reference pitch equals targetF (log-space secant, bounded).
  function solve(config, key, targetF) {
    const def = field(config.family, key);
    if (!def || !def.tune) throw Error('This field cannot be used for calibration');
    const off = def.offset || 0, params = {...config.params}, run = ANALYZERS[config.family];
    let x = params[key], f = run(params).f0, px = null, pf = null;
    for (let i = 0; i < 30 && Math.abs(1200 * Math.log2(f / targetF)) > 1e-4; i++) {
      let slope = def.power;
      if (px !== null && x !== px) { const sl = Math.log(f / pf) / Math.log((x + off) / (px + off)); if (Number.isFinite(sl) && Math.abs(sl) > .05 && Math.sign(sl) === Math.sign(def.power)) slope = sl; }
      const next = clamp((x + off) * (targetF / f) ** (1 / slope) - off, def.min, def.max);
      if (next === x) break;
      px = x; pf = f; x = next; params[key] = x; f = run(params).f0;
    }
    const cents = 1200 * Math.log2(f / targetF);
    return {params, key, value: x, f0: f, cents, limited: Math.abs(cents) > .5};
  }

  function calibrate(config) {
    const result = solve(config, config.tuneBy, midiToFreq(parseNote(config.target), config.a4));
    return {config: {...config, params: result.params}, result};
  }

  // Parameters for sounding frequency f: fretting / tone holes / a different bar / pedal tension.
  const noteCache = new Map();
  function forFrequency(config, f) {
    const key = JSON.stringify([config.family, config.params, config.a4]) + '|' + f.toFixed(4);
    if (noteCache.has(key)) return noteCache.get(key);
    const out = analyze(config, solve(config, NOTE_FIELD[config.family], f).params);
    if (noteCache.size > 600) noteCache.delete(noteCache.keys().next().value);
    noteCache.set(key, out);
    return out;
  }

  // Undercut depth giving mode2/mode1 = ratio (e.g. 4 for marimba, 3 for xylophone). Illinois regula falsi.
  function tuneOvertone(config, ratio) {
    if (config.family !== 'bar') throw Error('Overtone tuning applies to bars');
    const p = {...config.params}, at = u => { p.undercut = u * p.thickness; return analyzeBar(p).metrics[0][1] - ratio; };
    // The ratio rises with depth, then collapses when very deep cuts reorder the modes: bracket the first crossing.
    let a = 0, fa = at(0), b = null, fb = 0;
    for (let x = .04; x <= .8801 && b === null; x += .04) { const fx = at(x); if (fa <= 0 && fx >= 0) { b = x; fb = fx; } else { a = x; fa = fx; } }
    if (b === null) { const best = at(0) > 0 ? 0 : .64; p.undercut = best * p.thickness; return {config: {...config, params: p}, reached: false, ratio: analyzeBar(p).metrics[0][1]}; }
    let side = 0, u = a, fu = fa;
    for (let i = 0; i < 60; i++) {
      u = (a * fb - b * fa) / (fb - fa); fu = at(u);
      if (Math.abs(fu) < 1e-6 || b - a < 1e-9) break;
      if (fu * fb > 0) { b = u; fb = fu; if (side === -1) fa /= 2; side = -1; } else { a = u; fa = fu; if (side === 1) fb /= 2; side = 1; }
    }
    p.undercut = Number((u * p.thickness).toFixed(4));
    return {config: {...config, params: p}, reached: true, ratio: analyzeBar(p).metrics[0][1]};
  }

  // Overtone ratio depends slightly on length (shear), so alternate undercut and pitch solves.
  function tuneBar(config, ratio) {
    let out = {config, reached: false, ratio: 0};
    for (let i = 0; i < 8; i++) { out = tuneOvertone(out.config, ratio); out.config = calibrate(out.config).config; if (Math.abs(analyzeBar(out.config.params).metrics[0][1] - ratio) < 2e-4) break; }
    return {...out, ratio: analyzeBar(out.config.params).metrics[0][1]};
  }
  function fromPreset(id) {
    const preset = PRESETS.find(x => x.id === id) || PRESETS[0];
    let config = {version: 1, tool: 'sound-lab', name: preset.name, preset: preset.id, family: preset.family, a4: 440, target: preset.target, tuneBy: preset.tuneBy, params: {...preset.params}, notes: ''};
    const inTune = preset.overtone && Math.abs(analyzeBar(config.params).metrics[0][1] - preset.overtone) < .01;
    return preset.overtone && !inTune ? tuneBar(config, preset.overtone).config : calibrate(config).config;
  }
  const initial = () => fromPreset('acoustic-guitar');

  function validate(value) {
    const v = value && value.config ? value.config : value;
    if (!v || v.tool !== 'sound-lab' || v.version !== 1 || typeof v.family !== 'string' || !Object.hasOwn(FAMILIES, v.family) || !v.params || typeof v.params !== 'object') throw Error('Invalid instrument file');
    const text = (x, max) => { if (typeof x !== 'string' || x.length > max) throw Error('Invalid text'); return x; };
    const params = {};
    for (const f of FAMILIES[v.family].fields) {
      const x = v.params[f.key];
      if (f.type === 'number') { if (typeof x !== 'number' || !Number.isFinite(x) || x < f.min || x > f.max) throw Error('Invalid ' + f.label); }
      else if (f.type === 'bool') { if (typeof x !== 'boolean') throw Error('Invalid ' + f.label); }
      else if (typeof x !== 'string' || !(typeof f.options === 'string' ? Object.hasOwn(MATERIALS[f.options], x) : f.options.some(o => o[0] === x))) throw Error('Invalid ' + f.label);
      params[f.key] = x;
    }
    if (v.family === 'bar' && params.undercut > params.thickness * .9) throw Error('Undercut is deeper than the bar allows');
    if (parseNote(v.target) === null) throw Error('Invalid target note');
    if (typeof v.a4 !== 'number' || !(v.a4 >= 400 && v.a4 <= 480)) throw Error('Invalid reference pitch');
    const tune = field(v.family, v.tuneBy);
    if (!tune || !tune.tune) throw Error('Invalid calibration field');
    return {version: 1, tool: 'sound-lab', name: text(v.name, 120), preset: text(v.preset ?? 'custom', 60), family: v.family, a4: v.a4, target: noteName(parseNote(v.target)), tuneBy: v.tuneBy, params, notes: text(v.notes ?? '', 10000)};
  }

  // Map score notes into the playable range. policy: octave | skip | extend
  function fitRange(notes, lowMidi, highMidi, policy = 'octave') {
    const lo = lowMidi - 1e-6, hi = highMidi + 1e-6;
    return notes.map(note => {
      if (note.midi >= lo && note.midi <= hi) return {...note, play: note.midi, status: 'ok'};
      if (policy === 'extend') return {...note, play: note.midi, status: 'extended'};
      if (policy === 'octave' && hi - lo >= 12) { let m = note.midi; while (m < lo) m += 12; while (m > hi) m -= 12; if (m >= lo) return {...note, play: m, status: 'octave'}; }
      return {...note, play: null, status: 'skipped'};
    });
  }

  function csvCell(v) { let s = String(v ?? ''); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  const paramText = config => FAMILIES[config.family].fields.map(f => {
    const x = config.params[f.key];
    const digits = Math.max(0, Math.min(4, -Math.floor(Math.log10(f.step || 1))));
    return f.label + ': ' + (f.type === 'select' ? (typeof f.options === 'string' ? MATERIALS[f.options][x].name : f.options.find(o => o[0] === x)[1]) : f.type === 'bool' ? (x ? 'yes' : 'no') : +x.toFixed(digits) + (f.unit === '0–1' ? ' (0–1)' : ' ' + f.unit));
  });
  function csv(config, analysis = analyze(config)) {
    const header = ['instrument','family','target_note','reference_a4_hz','predicted_f0_hz','predicted_note','cents_from_target','partial','label','frequency_hz','ratio_to_f0','cents_from_nearest_harmonic','relative_level_db','t60_seconds','parameters','warnings'];
    const rows = analysis.partials.map((x, i) => [config.name, config.family, config.target, config.a4, analysis.f0, analysis.pitch.name, analysis.target.cents, i + 1, x.label, x.f, x.ratio, x.cents, x.db, x.t60, paramText(config).join(' | '), analysis.warnings.join(' | ')]);
    return '﻿' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  function report(config, analysis = analyze(config)) {
    const fmt = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : String(x);
    return [config.name, '='.repeat(Math.min(80, config.name.length || 1)), '',
      'Family: ' + FAMILIES[config.family].name, 'Target: ' + config.target + ' (' + fmt(analysis.target.f) + ' Hz, A4 = ' + config.a4 + ' Hz)',
      'Predicted pitch: ' + fmt(analysis.f0, 3) + ' Hz  ' + analysis.pitch.name + ' ' + (analysis.pitch.cents >= 0 ? '+' : '') + fmt(analysis.pitch.cents, 1) + ' cents',
      'Offset from target: ' + fmt(analysis.target.cents, 2) + ' cents', 'Spectral centroid: ' + fmt(analysis.centroid, 0) + ' Hz',
      'Weighted decay T60: ' + fmt(analysis.t60) + ' s', 'Playable range: ' + fmt(analysis.range[0]) + '–' + fmt(analysis.range[1]) + ' Hz', '',
      'SETTINGS', ...paramText(config).map(x => '  ' + x), '', 'DERIVED', ...analysis.metrics.map(([k, v, u]) => '  ' + k + ': ' + (Math.abs(v) < .01 && v !== 0 ? v.toExponential(3) : fmt(v, 3)) + (u ? ' ' + u : '')), '',
      'PARTIALS', ...analysis.partials.map((x, i) => '  ' + String(i + 1).padStart(2) + '  ' + fmt(x.f, 2).padStart(10) + ' Hz  ×' + fmt(x.ratio, 3).padStart(7) + '  ' + fmt(x.db, 1).padStart(6) + ' dB  T60 ' + fmt(x.t60) + ' s  ' + x.label), '',
      ...(analysis.warnings.length ? ['WARNINGS', ...analysis.warnings.map(w => '  ! ' + w), ''] : []),
      ...(config.notes ? ['NOTES', config.notes, ''] : []),
      'Idealized physical model. Real instruments differ through construction details, coupling, player technique and room acoustics.'].join('\r\n');
  }

  return {MATERIALS, FAMILIES, PRESETS, NOTE_FIELD, BESSEL_ZEROS, midiToFreq, freqToMidi, noteName, parseNote, pitch, soundSpeed, besselJ, beamModes, sampleShape, analyze, solve, calibrate, forFrequency, tuneOvertone, tuneBar, fromPreset, initial, validate, fitRange, csv, report, paramText};
});
