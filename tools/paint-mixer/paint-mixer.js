'use strict';
(() => {
  const {$,esc,toast,copy,download,bindColor,setColor,read,write,history,wireHistory,canvasBlob,fullScreen,readJSON,contrast,toHsl}=Studio;
  const M=PaintModel;
  let recipe=M.initial(),result=M.compute(recipe),saved=read('bt-paint-recipes',[]);
  if(!Array.isArray(saved))saved=[];
  const fmt=n=>Number(n.toFixed(4)).toLocaleString('en-US',{maximumFractionDigits:4});
  const volumeText=n=>n>=1000?fmt(n/1000)+' L':fmt(n)+' ml';
  const colorValid=c=>/^#[0-9a-f]{6}$/i.test(c);
  const names={ml:'ml',l:'liter',drops:'drops',tsp:'US tsp',tbsp:'US tbsp',floz:'US fl oz',percentPaint:'% of paint'};
  const paintBox=PaintLibrary.paints;
  let selectedReference='';
  const amountUnit=i=>i.kind==='liquid'?names[i.unit]:(recipe.basis==='percent'?'% paint batch':names[i.unit]);
  $('medium').innerHTML=Object.entries(M.MEDIA).map(([id,m])=>`<option value="${id}">${esc(m.name)}</option>`).join('');
  const scene=new PaintScene($('mixCanvas'),(p,running)=>{
    $('mixProgress').value=p*100;$('mixPercent').value=Math.round(p*100)+'%';$('play').textContent=running?'Ⅱ Pause':p>=1?'▶ Replay':'▶ Mix';
    $('sceneStatus').textContent=!result.color?'Add some paint':p>=1?'Mix complete':running?'Mixing in progress':'Mixing paused';
    $('play').disabled=$('restart').disabled=!result.color;
  },label=>$('renderer').textContent=label);
  const hist=history(()=>recipe,apply);wireHistory(hist);
  function apply(value){recipe=M.validate(value);sync();render(true);}
  function sync(){for(const [id,key] of [['recipeName','name'],['medium','medium'],['basis','basis'],['batchMl','batchMl'],['dropMl','dropMl'],['model','model'],['coverage','coverage'],['notes','notes'],['procedure','procedure'],['productSystem','productSystem']])$(id).value=recipe[key];setColor('substrate',recipe.substrate);renderIngredients();renderLiquids();}
  function renderIngredients(){
    $('ingredients').innerHTML=recipe.ingredients.map((item,i)=>`<div class="ingredient" data-index="${i}"><div class="ingredient-top"><input type="color" value="${item.color}" data-field="color" aria-label="Ingredient ${i+1} color"><input type="text" value="${esc(item.name)}" maxlength="100" data-field="name" aria-label="Ingredient ${i+1} name"><button data-remove="${i}" aria-label="Remove ingredient ${i+1}" ${recipe.ingredients.length===1?'disabled':''}>×</button></div><div class="ingredient-measures"><input class="hex" data-field="hex" value="${item.color.toUpperCase()}" maxlength="7" aria-label="Ingredient ${i+1} HEX"><input type="number" min="0" max="1000000000" step="any" value="${item.amount}" data-field="amount" aria-label="Ingredient ${i+1} quantity">${recipe.basis==='percent'?'<input value="% of batch" disabled aria-label="Percentage unit">':`<select data-field="unit" aria-label="Ingredient ${i+1} unit">${Object.entries(names).filter(([key])=>key!=='percentPaint').map(([key,name])=>`<option value="${key}" ${item.unit===key?'selected':''}>${name}</option>`).join('')}</select>`}</div><div class="strength-field" ${$('showStrength').checked?'':'hidden'}><label for="strength-${i}">Relative tint strength ×</label><input id="strength-${i}" type="number" min="0.01" max="10" step="0.01" value="${item.strength}" data-field="strength"></div><div class="body-field" ${$('showBody').checked?'':'hidden'}><label for="body-${i}">Paint body (blank = base)</label><input id="body-${i}" type="number" min="0" max="100" step="0.5" placeholder="Base" value="${item.body??''}" data-field="body"></div><div class="ingredient-share"><i style="background:${item.color}"></i></div></div>`).join('');
    $('ingredientCount').textContent=recipe.ingredients.length;$('addColor').disabled=recipe.ingredients.length>=500;
  }
  function render(restart=false){
    result=M.compute(recipe);const media=M.MEDIA[recipe.medium];
    renderFluidStats();renderProcedure();
    $('totalVolume').textContent=recipe.basis==='percent'?fmt(result.sum)+'%':volumeText(result.totalMl);
    $('totalLabel').textContent=recipe.basis==='percent'?'Paint percentage total':result.liquidMl>0?'Final mix (paint + liquids)':'Total paint';
    $('quantityWarning').hidden=result.valid;
    $('quantityWarning').textContent=result.paintMl<=0?'Add a positive PAINT quantity to start mixing; clear liquids alone have no pigment color.':`Percentages total ${fmt(result.sum)}%. Normalize to 100% before exporting a finished recipe. The preview shows relative proportions.`;
    $('normalize').hidden=recipe.basis!=='percent'||result.valid||result.sum<=0;
    $('scaleBatch').hidden=recipe.basis==='percent';
    $('batchHelp').textContent=recipe.basis==='percent'?'Percentages apply to the PAINT batch only. Added liquids increase the final volume.':'Target is the final volume, including liquids. Rescale preserves all proportions.';
    $('mediumNote').textContent=media.name+' · '+(media.viscosity>.6?'thicker flow':media.viscosity<.25?'fluid flow':'medium flow')+' · '+(media.gloss>.6?'glossy':media.gloss<.25?'matte':'satin')+' preview';
    $('sceneMedium').textContent=media.name;$('coverageOut').value=recipe.coverage+'%';
    const c=result.color||'#e4e5e0',ink=contrast(c,'#ffffff')>=4.5?'#ffffff':'#243022';
    $('resultSwatch').style.background=c;$('resultSwatch').style.color=ink;$('resultSwatch').classList.toggle('empty-result',!result.color);$('resultHex').textContent=result.color?c.toUpperCase():'NO PAINT';$('copyHex').disabled=!result.color;
    $('resultRgb').textContent=result.color?'RGB '+M.rgb(c).map(v=>Math.round(v*255)).join(' / '):'Add a nonzero quantity';
    $('resultHsl').textContent=result.color?'HSL '+toHsl(c).map(v=>Math.round(v)).join(' / '):'';
    $('coatPreview').style.backgroundColor=recipe.substrate;$('coatPaint').style.background=c;$('coatPaint').style.opacity=result.color?media.coverage*recipe.coverage/100*result.concentration:0;
    $('coatLabel').textContent=media.name+' · simulated coat';
    $('ratioMeta').textContent=recipe.ingredients.length+' COLORS + '+recipe.additives.length+' LIQUIDS · '+(recipe.model==='ryb'?'RYB ESTIMATE':'RGB REFERENCE');
    $('ratioBar').innerHTML=result.rows.map(i=>`<span title="${esc(i.name)}: ${fmt(i.percent)}%" style="width:${i.percent}%;background:${i.color}"></span>`).join('');
    $('recipeRows').innerHTML=result.rows.map(i=>`<tr><td><i style="background:${i.color}"></i>${esc(i.name||'Unnamed paint')}${i.kind==='liquid'?' (liquid)':''}</td><td>${fmt(i.amount)} ${esc(amountUnit(i))}</td><td>${fmt(i.ml)} ml</td><td>${fmt(i.percent)}%</td></tr>`).join('');
    $('tableBasis').textContent=recipe.basis==='percent'?fmt(result.sum)+'% input':'Combined volume';$('tableTotal').textContent=volumeText(result.totalMl);$('tablePercent').textContent=result.totalMl?'100%':'0%';
    document.querySelectorAll('.ingredient-share i').forEach((el,i)=>{el.style.width=result.rows[i].paintPercent+'%';el.style.background=result.rows[i].color;});
    for(const id of ['exportCSV','exportTXT','exportSVG','exportPNG','printRecipe'])$(id).disabled=!result.valid;
    $('exportScene').disabled=!result.color;
    scene.setRecipe(result,{...media,viscosity:result.body/100},restart,recipe.procedure);
  }
  function commit(){hist.push();}
  function addIngredient(name='New paint',color='#c96b4c'){
    if(recipe.ingredients.length>=500){toast('Maximum 500 ingredients per recipe');return;}
    recipe.ingredients.push({name,color,amount:recipe.basis==='percent'?0:10,unit:'ml',strength:1});renderIngredients();render(true);commit();
    const cards=$('ingredients').children;$('ingredients').scrollTop=$('ingredients').scrollHeight;cards[cards.length-1].querySelector('[data-field=name]').focus();
  }
  $('addColor').onclick=()=>addIngredient();
  $('ingredients').addEventListener('input',e=>{
    const card=e.target.closest('[data-index]');if(!card)return;const item=recipe.ingredients[+card.dataset.index],field=e.target.dataset.field;
    if(field==='name'){item.name=e.target.value;render();}
    if(field==='color'){item.color=e.target.value;card.querySelector('[data-field=hex]').value=item.color.toUpperCase();render(true);}
    if(['amount','strength','body'].includes(field)&&e.target.value!==''&&e.target.validity.valid){item[field]=Number(e.target.value);render(true);}
  });
  $('ingredients').addEventListener('change',e=>{
    const card=e.target.closest('[data-index]');if(!card)return;const item=recipe.ingredients[+card.dataset.index],field=e.target.dataset.field;
    if(field==='body'&&e.target.value===''){delete item.body;render(true);}else if(['amount','strength','body'].includes(field)&&(!e.target.validity.valid||e.target.value==='')){e.target.value=item[field];toast('Enter a quantity within the field’s range');}
    if(field==='hex'){let c=e.target.value.trim();if(!c.startsWith('#'))c='#'+c;if(/^#[0-9a-f]{3}$/i.test(c))c='#'+[...c.slice(1)].map(v=>v+v).join('');if(colorValid(c)){item.color=c;card.querySelector('[data-field=color]').value=c;render(true);}else toast('Enter a valid 3- or 6-digit HEX color');e.target.value=item.color.toUpperCase();}
    if(field==='unit'){const newAmount=item.amount*M.factor(item.unit,recipe.dropMl)/M.factor(e.target.value,recipe.dropMl);if(newAmount>1e9){e.target.value=item.unit;toast('Converted quantity exceeds the per-ingredient limit');return;}item.amount=newAmount;item.unit=e.target.value;card.querySelector('[data-field=amount]').value=newAmount;render();}
    commit();
  });
  $('ingredients').onclick=e=>{if(e.target.dataset.remove===undefined||recipe.ingredients.length===1)return;recipe.ingredients.splice(+e.target.dataset.remove,1);renderIngredients();render(true);commit();};
  $('paintBox').innerHTML=paintBox.map(([name,c],i)=>`<button style="background:${c}" title="${esc(name)} · ${c}" aria-label="Add ${esc(name)}" data-paint="${i}"></button>`).join('');$('paintBox').onclick=e=>{if(e.target.dataset.paint!==undefined)addIngredient(...paintBox[+e.target.dataset.paint]);};
  $('basis').onchange=()=>{
    const next=$('basis').value;if(next===recipe.basis)return;
    if(next==='percent'){if(result.paintMl>1e9){$('basis').value=recipe.basis;toast('Reduce the total below one billion ml before converting');return;}recipe.batchMl=result.paintMl||recipe.batchMl;recipe.ingredients.forEach((i,k)=>i.amount=result.rows[k].paintPercent);}
    else recipe.ingredients.forEach((i,k)=>{i.amount=result.rows[k].ml;i.unit='ml';});
    recipe.basis=next;sync();render();commit();
  };
  $('normalize').onclick=()=>{const sum=recipe.ingredients.reduce((t,i)=>t+i.amount,0);if(sum<=0)return;recipe.ingredients.forEach(i=>i.amount=i.amount/sum*100);sync();render();commit();};
  $('scaleBatch').onclick=()=>{if(result.totalMl<=0){toast('Add paint before scaling the recipe');return;}const scale=recipe.batchMl/result.totalMl;if([...recipe.ingredients,...recipe.additives.filter(i=>i.unit!=='percentPaint')].some(i=>i.amount*scale>1e9)){toast('Scaled amount exceeds the per-ingredient limit. Change small units to ml or liters.');return;}recipe.ingredients.forEach(i=>i.amount*=scale);recipe.additives.forEach(i=>{if(i.unit!=='percentPaint')i.amount*=scale;});sync();render();commit();toast('Recipe scaled to '+volumeText(recipe.batchMl));};
  for(const [id,key] of [['recipeName','name'],['notes','notes']])$(id).onchange=()=>{recipe[key]=$(id).value;render();commit();};
  for(const id of ['medium','model'])$(id).onchange=()=>{recipe[id]=$(id).value;if(id==='medium'){recipe.baseBody=null;recipe.productSystem=M.systemFor(recipe.medium);$('productSystem').value=recipe.productSystem;}render(true);commit();};
  for(const id of ['batchMl','dropMl'])$(id).onchange=()=>{if($(id).value===''||!$(id).validity.valid){$(id).value=recipe[id];toast('Enter a valid positive volume');return;}recipe[id]=+$(id).value;render(id==='dropMl');commit();};
  $('coverage').oninput=()=>{recipe.coverage=+$('coverage').value;render();};$('coverage').onchange=commit;
  bindColor('substrate',c=>{recipe.substrate=c;render();commit();});$('showStrength').onchange=()=>{renderIngredients();render();};
  $('randomRecipe').onclick=()=>useReference(PaintLibrary.recipes[Math.floor(Math.random()*PaintLibrary.recipes.length)]);
  $('play').onclick=()=>scene.play();$('restart').onclick=()=>{scene.progress=0;scene.running=false;scene.play();};$('mixProgress').oninput=()=>scene.seek(+$('mixProgress').value/100);$('speed').onchange=()=>scene.speed=+$('speed').value;$('resetCamera').onclick=()=>scene.resetCamera();$('fullscreen').onclick=fullScreen;$('copyHex').onclick=()=>{if(result.color)copy(result.color.toUpperCase());};
  function savedList(){saved=saved.filter(v=>{try{M.validate(v);return true;}catch{return false;}}).slice(0,40);$('savedCount').textContent=saved.length;$('saved').innerHTML=saved.length?saved.map((r,i)=>`<div class="saved-item"><button class="saved-load" data-load="${i}"><i style="background:${M.compute(r).color||'#eee'}"></i>${esc(r.name||'Untitled recipe')}</button><button data-delete="${i}" aria-label="Delete saved recipe ${i+1}">×</button></div>`).join(''):'<p class="help">Saved recipes stay in this browser. Export JSON for a portable backup.</p>';}
  $('save').onclick=()=>{if(saved.length>=40){toast('40 recipes saved. Export JSON or remove a saved recipe first.');return;}const entry=structuredClone(recipe);if(write('bt-paint-recipes',[entry,...saved])){saved.unshift(entry);savedList();toast('Recipe saved to this browser');}};
  $('saved').onclick=e=>{const load=e.target.closest('[data-load]');if(load){apply(saved[+load.dataset.load]);commit();toast('Recipe restored');}if(e.target.dataset.delete!==undefined){const next=saved.filter((_,i)=>i!==+e.target.dataset.delete);if(write('bt-paint-recipes',next)){saved=next;savedList();}}};
  $('importRecipe').onchange=()=>{readJSON($('importRecipe').files[0],value=>{const checked=M.validate(value);apply(checked);commit();});$('importRecipe').value='';};
  const filename=()=>recipe.name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,80)||'paint-recipe';
  function description(){return 'Estimated screen color using '+(recipe.model==='ryb'?'an artist RYB approximation':'an RGB channel average')+'. Not a measured pigment match. Test a real swatch. '+fluidSummary();}
  function textRecipe(){return `${recipe.name||'Paint recipe'}\n${M.MEDIA[recipe.medium].name} | ${volumeText(result.totalMl)} | Estimated ${result.color}\n${description()}\nDrop calibration: ${recipe.dropMl} ml/drop\n\n`+result.rows.map(i=>`${i.name}: ${fmt(i.amount)} ${amountUnit(i)} | ${fmt(i.ml)} ml | ${fmt(i.percent)}% | ${i.kind==='liquid'?'Clear liquid | body index '+i.body:i.color+' | tint strength '+i.strength+'x | body index '+(i.body??result.baseBody)}`).join('\n')+`\n\nSurface: ${recipe.substrate} | Coat coverage: ${recipe.coverage}% (visual only)\nNotes:\n${recipe.notes}\n`;}
  const xml=s=>esc(String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''));
  function wrap(s,n){const lines=[];for(const paragraph of s.split('\n')){let rest=paragraph;while(rest.length>n){let split=rest.lastIndexOf(' ',n);if(split<n/2)split=n;lines.push(rest.slice(0,split));rest=rest.slice(split).trimStart();}lines.push(rest);}return lines;}
  function recipeSVG(){const notes=wrap(recipe.notes,92),rows=result.rows,title=wrap(recipe.name||'Paint recipe',42),height=430+rows.length*34+notes.length*18+title.length*36,w=1100;let y=55;
    let content=`<rect width="100%" height="100%" fill="#faf9f4"/><text x="50" y="${y}" font-size="12" letter-spacing="2" fill="#a54c2a">BROWSER TOOLS / PAINT MIXING RECIPE</text>`;y+=48;
    for(const line of title){content+=`<text x="50" y="${y}" font-size="30" font-weight="600">${xml(line)}</text>`;y+=36;}
    content+=`<text x="50" y="${y+5}" font-size="15" fill="#63705e">${xml(M.MEDIA[recipe.medium].name+' · '+volumeText(result.totalMl)+' · '+recipe.model.toUpperCase()+' approximation')}</text><rect x="50" y="${y+25}" width="1000" height="95" rx="8" fill="${result.color}"/><text x="75" y="${y+85}" font-family="monospace" font-size="34" fill="${contrast(result.color,'#ffffff')>4.5?'#ffffff':'#253020'}">${result.color.toUpperCase()}</text>`;y+=160;
    for(const [x,t] of [[50,'PAINT / HEX'],[570,'ADDED'],[760,'VOLUME (ML)'],[955,'SHARE']])content+=`<text x="${x}" y="${y}" font-size="11" fill="#63705e">${t}</text>`;y+=25;
    for(const row of rows){const name=row.name.length>42?row.name.slice(0,39)+'…':row.name;content+=`<rect x="50" y="${y-13}" width="14" height="14" rx="3" fill="${row.color}"/><text x="75" y="${y}" font-size="13">${xml(name)} (${row.kind==='liquid'?'liquid':row.color})</text><text x="570" y="${y}" font-size="12">${fmt(row.amount)} ${xml(amountUnit(row))}</text><text x="760" y="${y}" font-size="12">${fmt(row.ml)}</text><text x="955" y="${y}" font-size="12">${fmt(row.percent)}%</text><path d="M50 ${y+13} H1050" stroke="#e0e5da"/>`;y+=34;}
    y+=20;content+=`<text x="50" y="${y}" font-size="12">Drop calibration: ${recipe.dropMl} ml/drop · Surface: ${recipe.substrate} · Coat: ${recipe.coverage}%</text>`;y+=30;for(const line of notes){content+=`<text x="50" y="${y}" font-size="12">${xml(line)}</text>`;y+=18;}
    y+=20;for(const line of wrap(description()+' Full ingredient names and tint strengths are included in CSV, JSON and TXT.',125)){content+=`<text x="50" y="${y}" font-size="11" fill="#63705e">${xml(line)}</text>`;y+=16;}
    return {width:w,height:Math.max(height,y+30),source:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.max(height,y+30)}" viewBox="0 0 ${w} ${Math.max(height,y+30)}"><g font-family="Arial, sans-serif" fill="#263022">${content}</g></svg>`};
  }
  function finished(){if(result.valid)return true;toast('Add positive quantities and make percentages total 100%');return false;}
  $('exportCSV').onclick=()=>{if(finished())download(M.csv(recipe),filename()+'.csv','text/csv;charset=utf-8');};
  $('exportJSON').onclick=()=>download(JSON.stringify({recipe,estimate:{...result,hex:result.color,model:description(),ingredients:result.rows},exportedAt:new Date().toISOString()},null,2),filename()+'.json','application/json');
  $('exportTXT').onclick=()=>{if(finished())download(textRecipe(),filename()+'.txt');};
  $('exportSVG').onclick=()=>{if(finished())download(recipeSVG().source,filename()+'.svg','image/svg+xml');};
  $('exportPNG').onclick=async()=>{if(!finished())return;const button=$('exportPNG');button.disabled=true;let url;try{const card=recipeSVG();if(card.width*card.height>16e6||card.height>12000){toast('This recipe is too tall for a PNG. Export SVG, PDF, CSV or JSON to include every ingredient.');return;}const image=new Image();url=URL.createObjectURL(new Blob([card.source],{type:'image/svg+xml'}));await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas');canvas.width=card.width;canvas.height=card.height;canvas.getContext('2d').drawImage(image,0,0);await canvasBlob(canvas,filename()+'.png');}catch{toast('Unable to render PNG. Try SVG or JSON.');}finally{if(url)URL.revokeObjectURL(url);button.disabled=!result.valid;}};
  $('exportScene').onclick=async()=>{scene.render();try{await canvasBlob(scene.canvas,filename()+'-mixing-bowl.png');}catch{toast('Snapshot unavailable. Export the recipe PNG instead.');}};
  $('printRecipe').onclick=()=>{if(!finished())return;$('printSheet').innerHTML=`<h1>${esc(recipe.name||'Paint recipe')}</h1><p class="print-meta">${esc(M.MEDIA[recipe.medium].name)} · ${volumeText(result.totalMl)} · ${esc(description())}</p><div class="print-color" style="background:${result.color};color:${contrast(result.color,'#ffffff')>4.5?'white':'#222'}"><strong>${result.color.toUpperCase()}</strong></div><table><thead><tr><th>Paint / HEX</th><th>Amount</th><th>ml</th><th>Share</th><th>Strength</th></tr></thead><tbody>${result.rows.map(i=>`<tr><td>${esc(i.name)}<br>${i.kind==='liquid'?'Liquid / body '+i.body:i.color}</td><td>${fmt(i.amount)} ${esc(amountUnit(i))}</td><td>${fmt(i.ml)}</td><td>${fmt(i.percent)}%</td><td>${i.kind==='liquid'?'n/a':i.strength+'x'}</td></tr>`).join('')}</tbody></table><p class="print-meta">Drop calibration: ${recipe.dropMl} ml/drop. Surface: ${recipe.substrate}. Coat coverage: ${recipe.coverage}% (visual only).</p><p>${esc(recipe.notes)}</p>`;window.print();};
  function fluidSummary(){return `${M.PROCEDURES[recipe.procedure||'swirl'].name}. Paint ${fmt(result.paintMl)} ml + liquids ${fmt(result.liquidMl)} ml = ${fmt(result.totalMl)} ml. Paint concentration ${fmt(result.concentration*100)}%. Estimated body index ${fmt(result.body)}/100 (relative, not cP). ${result.warnings.join(' ')}`;}
  function renderProcedure(){
    const p=M.PROCEDURES[recipe.procedure];$('procedureDescription').textContent=p.description;
    $('procedureSteps').innerHTML=p.steps.map(step=>`<li>${esc(step)}</li>`).join('');
  }
  function renderFluidStats(){
    $('paintMl').textContent=volumeText(result.paintMl);$('liquidMl').textContent=volumeText(result.liquidMl);$('finalMl').textContent=volumeText(result.totalMl);$('concentration').textContent=fmt(result.concentration*100)+'%';
    $('baseBody').value=result.baseBody;$('baseBodyOut').value=result.baseBody.toFixed(1)+'/100';$('bodyEstimate').value=result.body.toFixed(1)+'/100';$('viscosityMeter').value=result.body;
    const flow=result.body<12?'Very fluid':result.body<30?'Fluid':result.body<60?'Medium body':result.body<85?'Thick':'Heavy body';
    $('bodyDescription').textContent=`${flow}. Undiluted paint index ${result.paintBody.toFixed(1)} → mixture ${result.body.toFixed(1)}. Liquid-to-paint ratio: ${result.paintMl?fmt(result.liquidMl/result.paintMl*100):'—'}% of paint volume.`;
    $('liquidWarnings').hidden=!result.warnings.length;$('liquidWarnings').textContent=result.warnings.join('\n');
    document.querySelector('label[for=batchMl]').textContent=recipe.basis==='percent'?'Paint batch before liquids (ml)':'Target FINAL batch (ml)';
  }
  function renderLiquids(){
    $('liquids').innerHTML=recipe.additives.map((a,i)=>`<div class="liquid-card" data-liquid="${i}"><div class="row"><select data-lfield="type" aria-label="Liquid ${i+1} type">${Object.entries(M.ADDITIVES).map(([key,p])=>`<option value="${key}" ${key===a.type?'selected':''}>${esc(p.name)}</option>`).join('')}</select><button data-liquid-remove="${i}" aria-label="Remove liquid ${i+1}">×</button></div><input class="liquid-name" data-lfield="name" value="${esc(a.name)}" maxlength="100" aria-label="Liquid ${i+1} name"><div class="grid2" style="margin-top:8px"><input type="number" min="0" max="1000000000" step="any" value="${a.amount}" data-lfield="amount" aria-label="Liquid ${i+1} quantity"><select data-lfield="unit" aria-label="Liquid ${i+1} unit">${Object.entries(names).map(([unit,name])=>`<option value="${unit}" ${unit===a.unit?'selected':''}>${name}</option>`).join('')}</select></div><div class="liquid-body"><label for="liquid-body-${i}">Liquid body index (editable)</label><input id="liquid-body-${i}" type="number" min="0" max="100" step="0.5" value="${a.body}" data-lfield="body"></div></div>`).join('');
    $('addLiquid').disabled=recipe.additives.length>=100;
  }
  function initLiquids(){
    $('procedure').innerHTML=Object.entries(M.PROCEDURES).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join('');
    $('procedure').onchange=()=>{recipe.procedure=$('procedure').value;render(true);commit();};
    $('productSystem').onchange=()=>{recipe.productSystem=$('productSystem').value;render();commit();};
    $('baseBody').oninput=()=>{recipe.baseBody=+$('baseBody').value;render(true);};$('baseBody').onchange=commit;
    $('resetBody').onclick=()=>{recipe.baseBody=null;render(true);commit();};
    $('showBody').onchange=()=>{renderIngredients();render();};
    $('addLiquid').onclick=()=>{if(recipe.additives.length>=100)return;const type=recipe.productSystem==='water'?'water':recipe.productSystem==='solvent'?'solvent':'custom';const a=M.ADDITIVES[type];recipe.additives.push({type,name:a.name,amount:0,unit:'ml',body:a.body});renderLiquids();render();commit();};
    $('liquids').addEventListener('input',e=>{const row=e.target.closest('[data-liquid]');if(!row)return;const a=recipe.additives[+row.dataset.liquid],key=e.target.dataset.lfield;
      if(key==='name'){a.name=e.target.value;render();}
      if(['amount','body'].includes(key)&&e.target.value!==''&&e.target.validity.valid){a[key]=+e.target.value;render(true);}
    });
    $('liquids').addEventListener('change',e=>{const row=e.target.closest('[data-liquid]');if(!row)return;const a=recipe.additives[+row.dataset.liquid],key=e.target.dataset.lfield;
      if(['amount','body'].includes(key)&&(!e.target.validity.valid||e.target.value==='')){e.target.value=a[key];toast('Enter a valid nonnegative quantity or body index');}
      if(key==='type'){const p=M.ADDITIVES[e.target.value];a.type=e.target.value;a.name=p.name;a.body=p.body;renderLiquids();render(true);}
      if(key==='unit'){const unit=e.target.value,ml=M.additiveVolume(a,recipe,result.paintMl);if(unit==='percentPaint'&&!result.paintMl){e.target.value=a.unit;toast('Add paint before converting a liquid to percent of paint');return;}const amount=unit==='percentPaint'?ml/result.paintMl*100:ml/M.factor(unit,recipe.dropMl);if(amount>1e9){e.target.value=a.unit;toast('Converted quantity exceeds the field limit');return;}a.amount=amount;a.unit=unit;row.querySelector('[data-lfield=amount]').value=amount;render();}
      commit();
    });
    $('liquids').onclick=e=>{if(e.target.dataset.liquidRemove===undefined)return;recipe.additives.splice(+e.target.dataset.liquidRemove,1);renderLiquids();render(true);commit();};
  }
  function useReference(p){
    recipe.name=p.name;recipe.basis='volume';recipe.batchMl=100;recipe.ingredients=structuredClone(p.ingredients);selectedReference=p.id;
    sync();render(true);renderReferences();commit();toast(p.name+' loaded. Your medium and liquid additions are retained.');
  }
  function renderReferences(){
    const query=$('referenceSearch').value.toLowerCase().trim(),category=$('referenceCategory').value;
    const list=PaintLibrary.recipes.filter(p=>(category==='All'||p.category===category)&&[p.name,p.category,...p.ingredients.map(i=>i.name)].join(' ').toLowerCase().includes(query));
    $('referenceCount').textContent=list.length+' / '+PaintLibrary.recipes.length;
    $('references').innerHTML=list.length?list.map(p=>{const hex=M.compute({...M.initial(),ingredients:p.ingredients}).color;return `<button class="reference-card ${p.id===selectedReference?'active':''}" data-reference="${p.id}" aria-label="Load ${esc(p.name)}" title="${esc(p.ingredients.map(i=>i.name+' '+i.amount+' parts').join(', '))}"><i style="background:${hex}"></i><strong>${esc(p.name)}</strong><span>${esc(p.category)} · ${hex.toUpperCase()}</span><small>${p.ingredients.map(i=>i.amount).join(' : ')} · ${p.ingredients.length} paints</small></button>`;}).join(''):'<p class="help">No references match. Try another name or color family.</p>';
  }
  function initReferences(){
    $('referenceCategory').innerHTML+=[...new Set(PaintLibrary.recipes.map(p=>p.category))].map(c=>`<option>${esc(c)}</option>`).join('');
    $('referenceSearch').oninput=$('referenceCategory').onchange=renderReferences;
    $('references').onclick=e=>{const b=e.target.closest('[data-reference]');if(b)useReference(PaintLibrary.recipes.find(p=>p.id===b.dataset.reference));};renderReferences();
  }
  initReferences();initLiquids();sync();render(true);savedList();
})();
