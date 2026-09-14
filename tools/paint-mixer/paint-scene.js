/* Dependency-free WebGL mixing bowl. Canvas 2D remains available without WebGL. */
'use strict';
window.PaintScene = class PaintScene {
  constructor(canvas, onProgress, onRenderer) {
    this.canvas=canvas;this.onProgress=onProgress;this.onRenderer=onRenderer;
    this.progress=0;this.running=false;this.time=0;this.speed=1;this.yaw=0.4;this.elevation=0.85;this.distance=5.9;
    this.rows=[];this.color=[0.75,0.75,0.7];this.medium=PaintModel.MEDIA.acrylic;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});if(!this.gl)throw Error();this.initGL();onRenderer('LIVE 3D · WEBGL');}
    catch (error) {console.warn('Paint mixer WebGL initialization:',error.message);this.fallback();}
    this.bindPointer();
    this.resizeObserver=new ResizeObserver(()=>this.request());this.resizeObserver.observe(this.canvas);
    document.addEventListener('visibilitychange',()=>{this.last=0;if(!document.hidden)this.request();});
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.running=false;this.onRenderer('3D CONTEXT LOST · RELOAD TO RESTORE');this.onProgress(this.progress,false);});
    this.canvas.addEventListener('webglcontextrestored',()=>{try{this.initGL();this.updatePalette();this.onRenderer('LIVE 3D · WEBGL');this.request();}catch{this.fallback();}});
  }
  fallback() {
    if(this.gl || !this.canvas.getContext('2d')){const next=this.canvas.cloneNode();this.canvas.replaceWith(next);this.canvas=next;}
    this.gl=null;this.ctx=this.canvas.getContext('2d');this.onRenderer('2D PREVIEW · WEBGL UNAVAILABLE');
  }
  bindPointer() {
    let point=null;
    this.canvas.addEventListener('pointerdown',e=>{point=[e.clientX,e.clientY];this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{if(!point)return;this.yaw+=(e.clientX-point[0])*0.009;this.elevation=Math.max(.25,Math.min(1.48,this.elevation+(e.clientY-point[1])*0.007));point=[e.clientX,e.clientY];this.request();});
    this.canvas.addEventListener('pointerup',()=>point=null);this.canvas.addEventListener('pointercancel',()=>point=null);
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=Math.max(4,Math.min(8,this.distance+e.deltaY*.004));this.request();},{passive:false});
    this.canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')this.yaw-=.1;if(e.key==='ArrowRight')this.yaw+=.1;if(e.key==='ArrowUp')this.elevation=Math.min(1.48,this.elevation+.1);if(e.key==='ArrowDown')this.elevation=Math.max(.25,this.elevation-.1);if(e.key==='+')this.distance=Math.max(4,this.distance-.2);if(e.key==='-')this.distance=Math.min(8,this.distance+.2);this.request();});
  }
  setRecipe(result, medium, restart=true, procedure='swirl') {
    this.rows=result.rows.filter(r=>r.ml>0&&r.kind!=='liquid').map(r=>({...r,percent:r.paintPercent??r.percent}));this.procedure=procedure;this.color=PaintModel.rgb(result.color||'#b4b9b3');this.medium=medium;
    if(this.gl)this.updatePalette();
    if(restart){this.progress=this.reduced?1:0;this.running=!this.reduced&&this.rows.length>0;}
    this.onProgress(this.progress,this.running);this.request();
  }
  updatePalette() {
    const gl=this.gl,data=new Uint8Array(512*4);let row=0,sum=this.rows[0]?.percent/100||1;
    for(let i=0;i<512;i++){while(i/512>sum&&row<this.rows.length-1){row++;sum+=this.rows[row].percent/100;}const c=this.rows[row]?PaintModel.rgb(this.rows[row].color):this.color;for(let j=0;j<3;j++)data[i*4+j]=c[j]*255;data[i*4+3]=255;}
    gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,1,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  }
  request(){if(!this.frame&&!document.hidden)this.frame=requestAnimationFrame(t=>this.tick(t));}
  tick(t){this.frame=null;const dt=this.last?Math.min(.05,(t-this.last)/1000):0;this.last=t;
    if(this.running){this.time+=dt*this.speed;this.progress=Math.min(1,this.progress+dt*this.speed*(PaintModel.PROCEDURES[this.procedure||'swirl'].rate)/(8+this.medium.viscosity*12));if(this.progress===1)this.running=false;}
    this.render();if(!this.notified||t-this.notified>100||!this.running){this.onProgress(this.progress,this.running);this.notified=t;}
    if(this.running)this.request();
  }
  play(){if(!this.rows.length)return;if(this.progress>=1)this.progress=0;this.running=!this.running;this.last=0;this.onProgress(this.progress,this.running);this.request();}
  seek(value){this.progress=value;this.running=false;this.onProgress(value,false);this.request();}
  resetCamera(){this.yaw=.4;this.elevation=.85;this.distance=5.9;this.request();}
  dimensions(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}return [w,h];}
  initGL() {
    const gl=this.gl;
    const vertex=`precision mediump float;attribute vec3 position;attribute vec3 normal;uniform mat4 matrix;uniform float material;uniform float time;uniform float progress;uniform float viscosity;varying vec3 pos;varying vec3 norm;
      void main(){vec3 p=position;vec3 n=normal;if(material<.5){float r=length(p.xz);p.y+=sin(r*19.-time*4.)*.025*(1.1-viscosity*.8)*(1.-progress)*(1.-smoothstep(.9,1.5,r));n=normalize(n+vec3(cos(r*19.-time*4.)*p.x*.055,0.,sin(r*15.-time*3.)*p.z*.055)*(1.-progress));}pos=p;norm=n;gl_Position=matrix*vec4(p,1.);}`;
    const fragment=`precision mediump float;varying vec3 pos;varying vec3 norm;uniform vec3 eye;uniform vec3 mixed;uniform vec3 solid;uniform float material;uniform float time;uniform float progress;uniform float gloss;uniform float motion;uniform sampler2D palette;
      void main(){vec3 n=normalize(norm),light=normalize(vec3(-3.,6.,-4.)),view=normalize(eye-pos);float diffuse=max(0.,dot(n,light));vec3 color=solid;
      if(material<.5){float r=length(pos.xz);float a=atan(pos.z,pos.x)/6.283185+.5;float swirl=a+r*(.65+progress*5.)+sin(r*11.-time*.7)*.09+sin(a*6.+r*9.-time*.4)*.13+time*.07;if(motion>.5&&motion<1.5)swirl=pos.x*.8+sin(pos.z*5.+time)*.3+sin(pos.x*4.-time)*.25+progress*r*3.;
      else if(motion>1.5&&motion<2.5)swirl=abs(pos.x*sin(time*.6)+pos.z*cos(time*.6))*(1.+progress*4.)+sin(pos.z*5.)*.12;
      else if(motion>2.5&&motion<3.5)swirl+=sin(pos.x*13.+time*4.)*.3+cos(pos.z*11.-time*3.)*.25;
      float coordinate=fract(swirl);if(motion>3.5)coordinate*=smoothstep(0.,.8,progress);
      vec3 pigment=texture2D(palette,vec2(coordinate,.5)).rgb;float blend=smoothstep(.03,1.,progress);color=mix(pigment,mixed,blend);}
      float spec=pow(max(0.,dot(reflect(-light,n),view)),mix(18.,95.,gloss));vec3 lit=color*(.70+.30*diffuse)+vec3(1.)*spec*(material<.5?(.08+gloss*.36):.14);float edge=pow(1.-max(dot(n,view),0.),3.);lit+=vec3(.09)*edge;gl_FragColor=vec4(lit,1.);}`;
    const shader=(type,code)=>{const sh=gl.createShader(type);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
    this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
    this.attr={position:gl.getAttribLocation(this.program,'position'),normal:gl.getAttribLocation(this.program,'normal')};this.u={};for(const name of ['matrix','eye','mixed','solid','material','time','progress','gloss','motion','viscosity','palette'])this.u[name]=gl.getUniformLocation(this.program,name);
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.bowl=this.lathe([[.78,-.62],[1.10,-.58],[1.37,-.40],[1.58,-.1],[1.64,.10],[1.65,.16],[1.60,.19],[1.54,.16],[1.49,.02]]);
    this.paint=this.disk(1.495,.055);this.updatePalette();gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  }
  buffer(vertices){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);return {buffer:b,count:vertices.length/6};}
  lathe(profile){const data=[],segments=128;for(let j=0;j<profile.length-1;j++){const [r0,y0]=profile[j],[r1,y1]=profile[j+1],dy=y1-y0,dr=r1-r0,l=Math.hypot(dr,dy);for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;for(const [r,y,t] of [[r0,y0,a],[r1,y1,a],[r1,y1,b],[r0,y0,a],[r1,y1,b],[r0,y0,b]])data.push(r*Math.cos(t),y,r*Math.sin(t),dy/l*Math.cos(t),-dr/l,dy/l*Math.sin(t));}}return this.buffer(data);}
  disk(radius,y){const data=[],rings=36,segs=128;for(let j=0;j<rings;j++)for(let i=0;i<segs;i++){const r0=j/rings*radius,r1=(j+1)/rings*radius,a=i/segs*Math.PI*2,b=(i+1)/segs*Math.PI*2;for(const [r,t] of [[r0,a],[r1,a],[r1,b],[r0,a],[r1,b],[r0,b]])data.push(r*Math.cos(t),y,r*Math.sin(t),0,1,0);}return this.buffer(data);}
  draw(mesh,material,color){const gl=this.gl;gl.uniform1f(this.u.material,material);gl.uniform3fv(this.u.solid,color);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(this.attr.position);gl.vertexAttribPointer(this.attr.position,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(this.attr.normal);gl.vertexAttribPointer(this.attr.normal,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
  droplet(x,y,z,r){const data=[];for(let j=0;j<8;j++)for(let i=0;i<12;i++){for(const [a,b] of [[j,i],[j+1,i],[j+1,i+1],[j,i],[j+1,i+1],[j,i+1]]){const phi=a/8*Math.PI,theta=b/12*Math.PI*2,n=[Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];data.push(x+n[0]*r,y+n[1]*r*1.6,z+n[2]*r,...n);}}return this.buffer(data);}
  camera(aspect){const eye=[Math.sin(this.yaw)*Math.cos(this.elevation)*this.distance,Math.sin(this.elevation)*this.distance,Math.cos(this.yaw)*Math.cos(this.elevation)*this.distance],norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((t,x,i)=>t+x*b[i],0),z=norm([eye[0],eye[1]-.15,eye[2]]),x=norm(cross([0,1,0],z)),y=cross(z,x),view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1],f=1/Math.tan(.62/2),near=.1,far=50,p=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0],m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=p[k*4+r]*view[c*4+k];return {eye,m};}
  render(){const [w,h]=this.dimensions();if(!this.gl){this.render2D(w,h);return;}const gl=this.gl;gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);const camera=this.camera(w/h);gl.uniformMatrix4fv(this.u.matrix,false,camera.m);gl.uniform3fv(this.u.eye,camera.eye);gl.uniform3fv(this.u.mixed,this.color);gl.uniform1f(this.u.time,this.time);gl.uniform1f(this.u.progress,this.progress);gl.uniform1f(this.u.gloss,this.medium.gloss);gl.uniform1f(this.u.motion,['swirl','figure8','fold','whisk','incremental'].indexOf(this.procedure||'swirl'));gl.uniform1f(this.u.viscosity,this.medium.viscosity);gl.uniform1i(this.u.palette,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);this.draw(this.bowl,1,[.85,.87,.86]);this.draw(this.paint,0,this.color);
    if(this.progress<.9&&this.rows.length){for(let i=0;i<5;i++){const phase=(this.time*.65+i*.21)%1,theta=i*2.4+this.time*.25,mesh=this.droplet(Math.cos(theta)*.83,.18+(1-phase)*1.7,Math.sin(theta)*.83,.045+(1-phase)*.012);this.draw(mesh,2,PaintModel.rgb(this.rows[(i+Math.floor(this.time))%(this.procedure==='incremental'?Math.max(1,Math.min(this.rows.length,Math.ceil(this.progress/.8*this.rows.length))):this.rows.length)].color));gl.deleteBuffer(mesh.buffer);}}
  }
  render2D(w,h){const ctx=this.ctx;if(!ctx)return;ctx.clearRect(0,0,w,h);const x=w/2,y=h*.53,r=Math.min(w*.38,h*.4),ry=r*.55;ctx.save();ctx.translate(x,y);ctx.fillStyle='#c8cecb';ctx.beginPath();ctx.ellipse(0,r*.14,r*1.07,ry*1.08,0,0,Math.PI*2);ctx.fill();ctx.save();ctx.scale(1,.55);if(this.procedure==='figure8')ctx.rotate(Math.sin(this.time)*.5);if(this.procedure==='fold')ctx.scale(1,.8+Math.sin(this.time)*.15);if(this.procedure==='whisk')ctx.rotate(this.time*2);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();ctx.fillStyle=PaintModel.hex(this.color);ctx.fillRect(-r,-r,r*2,r*2);if(this.progress<1&&this.rows.length){ctx.globalAlpha=1-this.progress;let sum=0;for(const row of (this.procedure==='incremental'?this.rows.slice(0,Math.max(1,Math.ceil(this.progress/.8*this.rows.length))):this.rows)){const end=sum+row.percent/100*Math.PI*2;ctx.fillStyle=row.color;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,sum+this.time*.2,end+this.time*.2);ctx.closePath();ctx.fill();sum=end;}ctx.globalAlpha=(1-this.progress)*.25;for(let i=0;i<8;i++){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r*i/8,this.time*.4+i,this.time*.4+i+3.5);ctx.stroke();}}ctx.restore();ctx.strokeStyle='#f8faf8';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,0,r,ry,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
};
