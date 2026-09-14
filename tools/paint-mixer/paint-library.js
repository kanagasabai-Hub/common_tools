'use strict';
/* Original illustrative mixing references, not measured pigment formulas. */
window.PaintLibrary = (() => {
  const paints=[['Titanium white','#f5f4e9'],['Ivory black','#242525'],['Warm yellow','#edc83c'],['Lemon yellow','#f0e54b'],['Yellow ochre','#c19743'],['Warm red','#cc4733'],['Crimson','#a62d43'],['Magenta','#be397b'],['Ultramarine blue','#315aaa'],['Phthalo blue','#126982'],['Cerulean blue','#4594bb'],['Cobalt violet','#7e6399'],['Viridian green','#39846d'],['Sap green','#657c39'],['Burnt sienna','#a65b3e'],['Burnt umber','#6b4738'],['Raw umber','#82734e'],['Neutral gray','#858884']];
  const groups={
    'Botanical':[['Sunlit sage',[2,8,0],[30,20,50]],['Deep forest',[2,8,1],[40,50,10]],['Olive leaf',[4,13,1],[45,45,10]],['Mint leaf',[12,0,3],[20,70,10]],['Moss stone',[13,16,0],[35,25,40]],['Fern green',[3,9,13],[45,20,35]]],
    'Coastal':[['Coastal blue',[9,0,12],[25,65,10]],['Sea glass',[12,10,0],[20,15,65]],['Lagoon',[9,12,0],[45,35,20]],['Storm water',[8,17,0],[25,40,35]],['Clear sky',[10,0],[25,75]],['Midnight tide',[8,9,1],[50,35,15]]],
    'Earth':[['Terracotta',[5,4,0],[35,25,40]],['Desert sand',[4,14,0],[20,10,70]],['Burnished clay',[14,5,15],[60,25,15]],['Ochre stone',[4,16,0],[50,15,35]],['Warm bark',[15,14,4],[55,30,15]],['Dusty canyon',[14,11,0],[35,15,50]]],
    'Pastels':[['Lavender haze',[8,7,0],[15,15,70]],['Peach cream',[5,2,0],[10,15,75]],['Buttercream',[2,0,4],[20,75,5]],['Powder blue',[8,10,0],[8,12,80]],['Pistachio',[13,3,0],[15,15,70]],['Soft apricot',[4,5,0],[15,10,75]]],
    'Floral':[['Dusty rose',[6,0,15],[25,70,5]],['Peony',[7,6,0],[25,15,60]],['Violet petal',[11,7,0],[40,25,35]],['Dried rose',[6,14,0],[35,20,45]],['Coral bloom',[5,7,0],[25,15,60]],['Iris blue',[8,11,0],[30,35,35]]],
    'Neutrals':[['Warm gray',[17,4,0],[50,10,40]],['Cool gray',[17,8,0],[50,10,40]],['Charcoal',[1,8,15],[65,15,20]],['Linen',[0,4,16],[80,12,8]],['Mushroom',[16,11,0],[30,10,60]],['Parchment',[0,4,14],[75,20,5]]],
    'Sunset':[['Golden hour',[2,5,0],[60,15,25]],['Tangerine',[2,5],[65,35]],['Amber glow',[2,4,14],[45,40,15]],['Burnt coral',[5,14,0],[40,25,35]],['Evening blush',[6,4,0],[25,15,60]],['Wine dusk',[6,8,15],[55,25,20]]],
    'Jewels':[['Emerald study',[12,9,3],[55,20,25]],['Sapphire study',[8,9,0],[60,30,10]],['Amethyst study',[11,7,8],[45,35,20]],['Ruby study',[6,7,15],[65,25,10]],['Turquoise study',[9,12,0],[35,40,25]],['Garnet study',[6,14,1],[60,30,10]]],
    'Portrait studies':[['Light warm study',[0,4,5],[80,15,5]],['Light cool study',[0,14,11],[80,15,5]],['Golden midtone',[4,14,0],[35,30,35]],['Rose midtone',[14,6,0],[35,15,50]],['Deep warm study',[15,14,4],[60,25,15]],['Deep cool study',[15,8,6],[65,20,15]]],
    'Color exercises':[['Yellow + blue',[2,8],[50,50]],['Red + blue',[5,8],[50,50]],['Yellow + red',[2,5],[50,50]],['Complement study',[5,12],[50,50]],['Three-color neutral',[2,5,8],[33,33,34]],['Ten-step tint start',[8,0],[10,90]]]
  };
  const recipes=Object.entries(groups).flatMap(([category,list])=>list.map(([name,ids,amounts])=>({id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name,category,ingredients:ids.map((id,i)=>({name:paints[id][0],color:paints[id][1],amount:amounts[i],unit:'ml',strength:1}))})));
  return {paints,recipes};
})();
