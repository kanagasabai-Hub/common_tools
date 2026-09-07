/* Local-only utilities shared by the design tools. No dependencies or network requests. */
'use strict';
window.Studio = (() => {
  const $ = id => document.getElementById(id);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let timer;
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('toast').hidden = true, 3500); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
    catch { const a = document.createElement('textarea'); a.value = text; a.style.cssText='position:fixed;top:0;left:0;opacity:0'; document.body.append(a); a.select(); let ok=false; try {ok=document.execCommand('copy');} catch {} a.remove(); toast(ok?'Copied to clipboard':'Clipboard unavailable. Select and copy the code below.'); }
  }
  function download(data, name, mime='text/plain') { const blob = data instanceof Blob ? data : new Blob([data], {type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000); }
  function rgb(hex) { return hex.replace('#','').match(/../g).slice(0,3).map(x=>parseInt(x,16)); }
  function hex(r,g,b) { return '#'+[r,g,b].map(x=>Math.round(clamp(x,0,255)).toString(16).padStart(2,'0')).join(''); }
  function toHsl(color) { let [r,g,b]=rgb(color).map(v=>v/255), max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2,h=0,s=0; if(d){s=d/(1-Math.abs(2*l-1)); h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4; h=(h*60+360)%360;} return [h,s*100,l*100]; }
  function fromHsl(h,s,l) { h=((h%360)+360)%360;s/=100;l/=100;const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};return hex(f(0)*255,f(8)*255,f(4)*255); }
  function hsv(color) { const [h,s,l]=toHsl(color),v=l/100+(s/100)*Math.min(l/100,1-l/100);return [h,v?200*(1-l/100/v):0,v*100]; }
  function fromHsv(h,s,v) { s/=100;v/=100;const l=v*(1-s/2);return fromHsl(h,l===0||l===1?0:100*(v-l)/Math.min(l,1-l),l*100); }
  function oklab(color) { let [r,g,b]=rgb(color).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s]; }
  function luminance(color) { const a=rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722; }
  function contrast(a,b) { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
  function rgba(color,a=1) {return `rgba(${rgb(color).join(', ')}, ${Number(a.toFixed(3))})`;}
  function bindColor(id,fn) { const picker=$(id),text=$(id+'Hex');picker.addEventListener('input',()=>{text.value=picker.value;fn(picker.value);});text.addEventListener('change',()=>{let v=text.value.trim();if(/^[0-9a-f]{6}$/i.test(v))v='#'+v;if(/^#[0-9a-f]{3}$/i.test(v))v='#'+[...v.slice(1)].map(c=>c+c).join('');if(!/^#[0-9a-f]{6}$/i.test(v)){text.value=picker.value;toast('Enter a valid 3- or 6-digit HEX color');return;}picker.value=v;text.value=v;fn(v);}); }
  function setColor(id,v) {$(id).value=v;$(id+'Hex').value=v;}
  const read = (key,fallback) => {try {const x=localStorage.getItem(key);return x?JSON.parse(x):fallback;}catch{return fallback;}};
  function write(key,value) {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('Browser storage unavailable or full. Export a JSON project to save.');return false;}}
  function history(get,apply) {let stack=[JSON.stringify(get())],at=0;return {push(){const s=JSON.stringify(get());if(stack[at]!==s){stack=stack.slice(0,at+1);stack.push(s);if(stack.length>80)stack.shift();at=stack.length-1;}this.buttons();},undo(){if(at>0){apply(JSON.parse(stack[--at]));this.buttons();}},redo(){if(at<stack.length-1){apply(JSON.parse(stack[++at]));this.buttons();}},buttons(){if($('undo'))$('undo').disabled=at===0;if($('redo'))$('redo').disabled=at===stack.length-1;}};}
  function wireHistory(h) {$('undo').onclick=()=>h.undo();$('redo').onclick=()=>h.redo();h.buttons();document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?h.redo():h.undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();h.redo();}});}
  function size() {const w=clamp($('exportW').value,16,4096),h=clamp($('exportH').value,16,4096);$('exportW').value=Math.round(w);$('exportH').value=Math.round(h);return [Math.round(w),Math.round(h)];}
  function canvasBlob(canvas,name) {return new Promise(resolve=>canvas.toBlob(blob=>{if(blob){download(blob,name,'image/png');toast('PNG exported');}else toast('Export failed. Try a smaller image.');resolve();},'image/png'));}
  function fullScreen() {const p=$('previewPanel');if(document.fullscreenElement)document.exitFullscreen?.();else if(p.requestFullscreen)p.requestFullscreen().catch(()=>toast('Fullscreen unavailable in this browser'));else toast('Fullscreen unavailable in this browser');}
  function readJSON(file,apply) {if(!file)return;if(file.size>1024*1024){toast('Project is too large (maximum 1 MB)');return;}file.text().then(s=>{try{apply(JSON.parse(s));toast('Project imported');}catch{toast('Invalid or incompatible project file');}}).catch(()=>toast('Unable to read this file'));}
  return {$,clamp,esc,toast,copy,download,rgb,hex,toHsl,fromHsl,hsv,fromHsv,oklab,luminance,contrast,rgba,bindColor,setColor,read,write,history,wireHistory,size,canvasBlob,fullScreen,readJSON};
})();
