/* Recipe arithmetic and an explicitly approximate artist's RYB mixing model. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaintModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const UNITS = {ml: 1, l: 1000, tsp: 4.92892159375, tbsp: 14.78676478125, floz: 29.5735295625};
  const MEDIA = {
    acrylic: {name:'Acrylic', viscosity:0.65, gloss:0.4, coverage:1},
    watercolor: {name:'Watercolor', viscosity:0.12, gloss:0.18, coverage:0.5},
    gouache: {name:'Gouache', viscosity:0.5, gloss:0.1, coverage:1},
    oil: {name:'Oil paint', viscosity:0.95, gloss:0.72, coverage:1},
    alkyd: {name:'Alkyd', viscosity:0.7, gloss:0.65, coverage:1},
    enamel: {name:'Enamel', viscosity:0.45, gloss:0.95, coverage:1},
    latex: {name:'Latex / emulsion', viscosity:0.6, gloss:0.15, coverage:1},
    spray: {name:'Spray / automotive color', viscosity:0.2, gloss:0.8, coverage:0.9},
    airbrush: {name:'Airbrush color', viscosity:0.15, gloss:0.45, coverage:0.75},
    ink: {name:'Artist ink', viscosity:0.08, gloss:0.25, coverage:0.6},
    tempera: {name:'Tempera', viscosity:0.45, gloss:0.12, coverage:0.95}
  };
  const PROCEDURES = {
    swirl:{name:'Circular stir',rate:1,description:'Continuous circular sweeps bring color ribbons toward the center.',steps:['Measure the paint colors into the bowl.','Stir around the sides and through the center.','Scrape the sides, then check a test swatch.']},
    figure8:{name:'Figure-eight stir',rate:1.15,description:'Crossing sweeps move material between opposite sides of the bowl.',steps:['Measure the selected colors.','Sweep a figure eight across the whole mixture.','Scrape the walls and repeat until evenly blended.']},
    fold:{name:'Palette-knife fold',rate:.65,description:'Slow folding bands model a palette-knife mixing motion for thicker paint.',steps:['Place the colors together on a palette.','Spread, scrape and fold the paint back over itself.','Repeat until streaks disappear; test the resulting color.']},
    whisk:{name:'Fast agitation',rate:1.8,description:'Rapid multi-directional movement provides a visual agitation reference.',steps:['Check the product’s approved mixing method.','Agitate uniformly while avoiding excessive air entrainment.','Allow entrained bubbles to settle as directed before testing.']},
    incremental:{name:'Incremental addition',rate:.8,description:'Colors enter in recipe order, with mixing between additions.',steps:['Start with the first listed color.','Add subsequent colors a little at a time, blending between additions.','Add the recorded compatible liquid gradually; compare a test swatch.']}
  };
  const ADDITIVES = {
    water:{name:'Water',body:.5,system:'water'},
    waterReducer:{name:'Waterborne reducer',body:2,system:'water'},
    solvent:{name:'Product-specified solvent / thinner',body:1,system:'solvent'},
    acrylicMedium:{name:'Acrylic liquid medium',body:30,system:'water',media:['acrylic','airbrush','latex']},
    glazing:{name:'Acrylic glazing medium',body:35,system:'water',media:['acrylic','airbrush','latex']},
    pouring:{name:'Acrylic pouring medium',body:25,system:'water',media:['acrylic']},
    oilMedium:{name:'Oil painting medium',body:55,system:'solvent',media:['oil','alkyd']},
    gel:{name:'Acrylic gel medium',body:95,system:'water',media:['acrylic','latex']},
    flowAid:{name:'Prepared flow improver',body:10,system:'water'},
    retarder:{name:'Product-specified retarder',body:15,system:'custom'},
    custom:{name:'Custom compatible liquid',body:50,system:'custom'}
  };
  const systemFor = medium => ['oil','alkyd'].includes(medium)?'solvent':['spray','enamel','ink'].includes(medium)?'unknown':'water';
  const additiveVolume=(item,recipe,paintMl)=>item.unit==='percentPaint'?paintMl*item.amount/100:item.amount*factor(item.unit,recipe.dropMl);
  const rgb = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
  const hex = a => '#'+a.map(x=>Math.round(Math.max(0,Math.min(1,x))*255).toString(16).padStart(2,'0')).join('');
  function toRyb([r,g,b]) {
    const white=Math.min(r,g,b); r-=white; g-=white; b-=white;
    const max=Math.max(r,g,b), yellow=Math.min(r,g); r-=yellow; g-=yellow;
    if (b>0 && g>0) {b/=2; g/=2;}
    let y=yellow+g; b+=g;
    const m=Math.max(r,y,b); if(m>0){const k=max/m;r*=k;y*=k;b*=k;}
    return [r+white,y+white,b+white];
  }
  function fromRyb([r,y,b]) {
    const white=Math.min(r,y,b);r-=white;y-=white;b-=white;
    const max=Math.max(r,y,b);let g=Math.min(y,b);y-=g;b-=g;
    if(b>0&&g>0){b*=2;g*=2;}
    r+=y;g+=y;const m=Math.max(r,g,b);if(m>0){const k=max/m;r*=k;g*=k;b*=k;}
    return [r+white,g+white,b+white];
  }
  const factor = (unit,dropMl) => unit==='drops'?dropMl:UNITS[unit];
  const volume = (item,recipe) => recipe.basis==='percent'?item.amount*recipe.batchMl/100:item.amount*factor(item.unit,recipe.dropMl);
  function compute(recipe) {
    const quantities=recipe.ingredients.map(i=>volume(i,recipe));
    const paintMl=quantities.reduce((a,b)=>a+b,0);
    const liquids=(recipe.additives||[]).map(item=>({...item,ml:additiveVolume(item,recipe,paintMl)}));
    const liquidMl=liquids.reduce((a,b)=>a+b.ml,0),totalMl=paintMl+liquidMl;
    const sum=recipe.ingredients.reduce((a,b)=>a+b.amount,0);
    const weights=quantities.map((q,i)=>q*recipe.ingredients[i].strength);
    const weightSum=weights.reduce((a,b)=>a+b,0);
    const mixed=[0,0,0];
    if(weightSum>0) recipe.ingredients.forEach((item,i)=>{
      const channels=recipe.model==='ryb'?toRyb(rgb(item.color)):rgb(item.color);
      channels.forEach((c,k)=>mixed[k]+=c*weights[i]/weightSum);
    });
    const color=weightSum?hex(recipe.model==='ryb'?fromRyb(mixed):mixed):null;
    const baseBody=recipe.baseBody??MEDIA[recipe.medium].viscosity*100;
    const paintBody=paintMl?Math.exp(recipe.ingredients.reduce((v,item,i)=>v+quantities[i]/paintMl*Math.log(1+(item.body??baseBody)),0))-1:baseBody;
    const body=totalMl?Math.exp((paintMl*Math.log(1+paintBody)+liquids.reduce((v,item)=>v+item.ml*Math.log(1+item.body),0))/totalMl)-1:0;
    const concentration=totalMl?paintMl/totalMl:0;
    const warnings=liquids.filter(i=>i.ml>0).flatMap(item=>{
      const required=ADDITIVES[item.type].system,actual=recipe.productSystem||systemFor(recipe.medium);
      const media=ADDITIVES[item.type].media;
      if(media&&!media.includes(recipe.medium))return [`${item.name}: medium-family mismatch with ${MEDIA[recipe.medium].name}. Verify the actual product system; this is not a recommended combination.`];
      if(actual==='unknown'||required==='custom')return [`${item.name}: compatibility is unverified; check the product instructions.`];
      return required!==actual?[`${item.name}: profile mismatch with the selected ${actual}-based system. Change the liquid or product-system selection; no compatibility is implied.`]:[];
    });
    return {color,totalMl,paintMl,liquidMl,concentration,body,paintBody,baseBody,warnings,sum,valid:paintMl>0&&(recipe.basis!=='percent'||Math.abs(sum-100)<0.000001),
      rows:[...recipe.ingredients.map((item,i)=>({...item,kind:'paint',ml:quantities[i],percent:totalMl?quantities[i]/totalMl*100:0,paintPercent:paintMl?quantities[i]/paintMl*100:0,opticalShare:weightSum?weights[i]/weightSum:0})),...liquids.map(item=>({...item,kind:'liquid',color:'#b4cfda',strength:0,percent:totalMl?item.ml/totalMl*100:0,opticalShare:0}))]};
  }
  const initial = () => ({version:1,tool:'paint-mixer',name:'Sunlit sage',medium:'acrylic',model:'ryb',basis:'volume',batchMl:100,dropMl:0.05,substrate:'#f6f0e5',coverage:100,notes:'',procedure:'swirl',baseBody:null,productSystem:'water',additives:[],ingredients:[
    {name:'Warm yellow',color:'#edc83c',amount:30,unit:'ml',strength:1},
    {name:'Ultramarine blue',color:'#315aaa',amount:20,unit:'ml',strength:1},
    {name:'Titanium white',color:'#f5f4e9',amount:50,unit:'ml',strength:1}
  ]});
  function validate(value) {
    const v=value&&value.recipe?value.recipe:value;
    if(!v||v.tool!=='paint-mixer'||v.version!==1||!Object.hasOwn(MEDIA,v.medium)||!['ryb','rgb'].includes(v.model)||!['volume','percent'].includes(v.basis)||!Array.isArray(v.ingredients)||v.ingredients.length<1||v.ingredients.length>500)throw Error('Invalid recipe');
    const text=(x,n)=>{if(typeof x!=='string'||x.length>n)throw Error('Invalid text');return x;};
    const number=(x,min,max)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw Error('Invalid quantity');return x;};
    const color=x=>{if(typeof x!=='string'||!/^#[0-9a-f]{6}$/i.test(x))throw Error('Invalid color');return x;};
    if(v.procedure!==undefined&&!Object.hasOwn(PROCEDURES,v.procedure))throw Error('Invalid procedure');
    if(v.productSystem!==undefined&&!['water','solvent','unknown'].includes(v.productSystem))throw Error('Invalid product system');
    if(v.additives!==undefined&&(!Array.isArray(v.additives)||v.additives.length>100))throw Error('Invalid additives');
    return {version:1,tool:'paint-mixer',name:text(v.name,120),medium:v.medium,model:v.model,basis:v.basis,batchMl:number(v.batchMl,0.001,1e9),dropMl:number(v.dropMl,0.001,1),substrate:color(v.substrate),coverage:number(v.coverage,0,100),notes:text(v.notes,10000),procedure:v.procedure||'swirl',baseBody:v.baseBody==null?null:number(v.baseBody,0,100),productSystem:v.productSystem||systemFor(v.medium),additives:(v.additives||[]).map(a=>{
      if(!a||!Object.hasOwn(ADDITIVES,a.type)||!(a.unit==='percentPaint'||a.unit==='drops'||Object.hasOwn(UNITS,a.unit)))throw Error('Invalid liquid');
      return {type:a.type,name:text(a.name,100),amount:number(a.amount,0,1e9),unit:a.unit,body:number(a.body,0,100)};
    }),ingredients:v.ingredients.map(i=>{
      if(!i||!(i.unit==='drops'||Object.hasOwn(UNITS,i.unit)))throw Error('Invalid unit');
      return {name:text(i.name,100),color:color(i.color),amount:number(i.amount,0,1e9),unit:i.unit,strength:number(i.strength,0.01,10),...(i.body==null?{}:{body:number(i.body,0,100)})};
    })};
  }
  function csvCell(v) {let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function csv(recipe) {
    const result=compute(recipe);
    const header=['recipe','medium','mixing_model','ingredient','hex','amount','unit','volume_ml','percentage_of_final_mix','tint_strength','estimated_mix_hex','drop_ml','batch_ml','substrate_hex','coverage_percent','notes','kind','procedure','viscosity_index_estimate','paint_ml','liquid_ml','concentration_percent','compatibility_notes','ingredient_body_index','product_system','base_body_index'];
    return '\uFEFF'+[header,...result.rows.map(i=>[recipe.name,MEDIA[recipe.medium].name,recipe.model,i.name,i.kind==='paint'?i.color:'',i.amount,i.kind==='paint'&&recipe.basis==='percent'?'% paint batch':i.unit,i.ml,i.percent,i.strength,result.color,recipe.dropMl,recipe.batchMl,recipe.substrate,recipe.coverage,recipe.notes,i.kind,recipe.procedure||'swirl',result.body,result.paintMl,result.liquidMl,result.concentration*100,result.warnings.join(' | '),i.body??result.baseBody,recipe.productSystem||systemFor(recipe.medium),result.baseBody])].map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  return {UNITS,MEDIA,ADDITIVES,PROCEDURES,systemFor,additiveVolume,rgb,hex,toRyb,fromRyb,factor,volume,compute,initial,validate,csv};
});
