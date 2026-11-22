/* CRF 0.9: explicit image-plane functions with learned Gaussian appearance statistics.
 * No photographs, patch atlas, embedded RGB residual, mesh or external image generator
 * is consulted by renderScene. Geometry is analytic coverage and image-plane normals;
 * texture is newly sampled from multiscale Gaussian fields. This is a restricted
 * procedural/statistical generator, not a trained general text-to-image network.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRF09=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const GENERATIVE_SCHEMA09='crf.generative_scene.v0.9', MODEL_SCHEMA='crf.shared_appearance.v0.9';
const TYPES=['window','pole','signal','tree','ridge','apple','pear','orange','vase','rock'];
const CATEGORIES=['architecture','landscape','still_life'];
const TERRAINS=['alpine','coast','forest'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
const clone=x=>JSON.parse(JSON.stringify(x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const linear=x=>{x=clamp(x/255,0,1);return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
const srgb=x=>{x=clamp(x,0,1);return Math.round(255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055));};
const LUT=new Float64Array(256);for(let i=0;i<256;i++)LUT[i]=linear(i);
const OUT=new Uint8Array(16385);for(let i=0;i<OUT.length;i++)OUT[i]=srgb(i/16384);
const toRGB=c=>c.map(linear), byte=x=>OUT[clamp(Math.round(x*16384),0,16384)];
function hash(v){let n=Number(v)>>>0;n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return(n^(n>>>16))>>>0;}
function hashText(s){let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return hash(n);}
function random(seed){let s=seed>>>0;return()=>{s=(s+0x6d2b79f5)>>>0;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
function normal(rng){return Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*Math.cos(6.283185307179586*rng());}
function rgb(v){return Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&x>=0&&x<=255);}
function num(v,a,b){return typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;}
function vector(v,a,b,n=2){return Array.isArray(v)&&v.length===n&&v.every(x=>num(x,a,b));}
function validateScene(s){
 const errors=[];if(!s||typeof s!=='object'||Array.isArray(s))return{ok:false,errors:['Scene must be an object.']};
 if(s.schema!==GENERATIVE_SCHEMA09)errors.push('Unknown generative scene schema.');
 if(!CATEGORIES.includes(s.category))errors.push('Unsupported category.');
 for(const k of ['width','height'])if(!Number.isInteger(s[k])||s[k]<64||s[k]>2048)errors.push(k+' must be 64..2048.');
 if(s.width*s.height>4194304)errors.push('Pixel budget exceeded.');
 if(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295)errors.push('seed must be uint32.');
 const e=s.environment||{},l=s.light||{},c=s.camera||{};
 for(const k of ['skyColor','wallColor','groundColor'])if(e[k]!==undefined&&!rgb(e[k]))errors.push('Invalid environment '+k);
 for(const [k,a,b]of [['horizon',.15,.9],['fog',0,1],['texture',0,2]])if(e[k]!==undefined&&!num(e[k],a,b))errors.push('Invalid environment '+k);
 if(e.terrain!==undefined&&!TERRAINS.includes(e.terrain))errors.push('Unsupported terrain.');
 for(const [k,a,b]of [['azimuth',-180,180],['elevation',5,85],['intensity',.2,2],['warmth',0,1]])if(l[k]!==undefined&&!num(l[k],a,b))errors.push('Invalid light '+k);
 for(const [k,a,b]of [['panX',-.12,.12],['panY',-.12,.12],['zoom',.8,1.3]])if(c[k]!==undefined&&!num(c[k],a,b))errors.push('Invalid camera '+k);
 if(!Array.isArray(s.objects)||s.objects.length>64)errors.push('At most 64 semantic objects required.');
 else{
  const ids=new Set();for(const o of s.objects){
   if(!o||typeof o!=='object'){errors.push('Invalid object.');continue;}
   if(typeof o.id!=='string'||!o.id||o.id.length>100||ids.has(o.id)||['__proto__','constructor','prototype'].includes(o.id))errors.push('Object IDs must be unique safe strings.');else ids.add(o.id);
   if(!TYPES.includes(o.type))errors.push('Unsupported object type: '+o.type);
   for(const k of ['x','y'])if(!num(o[k],-.5,1.5))errors.push('Invalid object '+k);
   for(const k of ['width','height'])if(!num(o[k],.005,1.8))errors.push('Invalid object '+k);
   if(o.color!==undefined&&!rgb(o.color))errors.push('Invalid object color.');
   if(o.depth!==undefined&&!num(o.depth,0,1))errors.push('Invalid object depth.');
   if(o.rotation!==undefined&&!num(o.rotation,-180,180))errors.push('Invalid rotation.');
   if(o.roughness!==undefined&&!num(o.roughness,0,1))errors.push('Invalid roughness.');
   if(o.visible!==undefined&&typeof o.visible!=='boolean')errors.push('Invalid visibility.');
   if(o.seed!==undefined&&(!Number.isInteger(o.seed)||o.seed<0||o.seed>4294967295))errors.push('Invalid object seed.');
   if(o.attachment&&(!o.attachment.parentId||!vector(o.attachment.anchor,-2,2)))errors.push('Invalid attachment.');
  }
  const byId=new Map(s.objects.filter(Boolean).map(o=>[o.id,o]));
  for(const o of s.objects.filter(Boolean)){const seen=new Set([o.id]);let p=o;while(p.attachment){const id=p.attachment.parentId;if(!byId.has(id)){errors.push('Missing attachment parent.');break;}if(seen.has(id)){errors.push('Cyclic attachment.');break;}seen.add(id);p=byId.get(id);}}
 }
 return{ok:errors.length===0,errors:[...new Set(errors)]};
}

const DEFAULTS={
 architecture:{environment:{wallColor:[194,189,161],skyColor:[173,204,222],groundColor:[111,101,83],horizon:.83,fog:0,texture:1,terrain:'alpine'},light:{azimuth:-55,elevation:38,intensity:1.1,warmth:.72},objects:[
  {id:'window.left.upper',type:'window',x:.22,y:.24,width:.18,height:.22,color:[160,158,137],depth:.08},
  {id:'window.right.upper',type:'window',x:.70,y:.24,width:.18,height:.22,color:[160,158,137],depth:.08},
  {id:'window.left.lower',type:'window',x:.22,y:.61,width:.18,height:.22,color:[160,158,137],depth:.08},
  {id:'window.right.lower',type:'window',x:.70,y:.61,width:.18,height:.22,color:[160,158,137],depth:.08},
  {id:'street.pole',type:'pole',x:.44,y:.48,width:.024,height:.91,color:[40,46,39],depth:.72},
  {id:'street.signal',type:'signal',x:.59,y:.46,width:.078,height:.17,color:[54,57,43],depth:.74,attachment:{parentId:'street.pole',anchor:[.15,-.02]}}]},
 landscape:{environment:{wallColor:[190,188,172],skyColor:[128,171,197],groundColor:[43,74,72],horizon:.60,fog:.3,texture:1,terrain:'alpine'},light:{azimuth:-40,elevation:30,intensity:1,warmth:.55},objects:[
  {id:'ridge.far',type:'ridge',x:.40,y:.43,width:1.65,height:.32,color:[105,128,139],depth:.15},
  {id:'ridge.middle',type:'ridge',x:.75,y:.48,width:1.75,height:.25,color:[67,95,99],depth:.32},
  {id:'shore.tree.left',type:'tree',x:.035,y:.63,width:.17,height:.72,color:[29,58,43],depth:.9},
  {id:'shore.tree.right',type:'tree',x:.975,y:.73,width:.13,height:.40,color:[34,63,45],depth:.91},
  {id:'shore.rock',type:'rock',x:.22,y:.94,width:.28,height:.10,color:[106,116,109],depth:.92}]},
 still_life:{environment:{wallColor:[165,171,162],skyColor:[182,193,188],groundColor:[165,144,111],horizon:.63,fog:0,texture:1,terrain:'alpine'},light:{azimuth:-48,elevation:45,intensity:1,warmth:.55},objects:[
  {id:'fruit.apple',type:'apple',x:.37,y:.64,width:.26,height:.28,color:[151,44,33],depth:.58,roughness:.36},
  {id:'fruit.pear',type:'pear',x:.66,y:.57,width:.23,height:.42,color:[157,166,65],depth:.52,roughness:.68},
  {id:'fruit.orange',type:'orange',x:.58,y:.76,width:.19,height:.22,color:[221,123,28],depth:.8,roughness:.62}]}
};
const TERRAIN_OBJECTS={
 coast:[{id:'coast.rock.left',type:'rock',x:.18,y:.79,width:.29,height:.19,color:[94,102,94],depth:.8},
 {id:'coast.rock.right',type:'rock',x:.75,y:.88,width:.27,height:.15,color:[117,111,95],depth:.9}],
 forest:[{id:'forest.tree.left',type:'tree',x:.12,y:.43,width:.19,height:1.15,color:[39,66,36],depth:.85},
 {id:'forest.tree.right',type:'tree',x:.88,y:.44,width:.20,height:1.18,color:[42,67,37],depth:.87},
 {id:'forest.tree.middle',type:'tree',x:.65,y:.40,width:.09,height:.8,color:[48,75,41],depth:.58}]
};
function normalizeScene(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Scene must be an object.');
 if(raw.category!==undefined&&!CATEGORIES.includes(raw.category))throw new Error('Unsupported category.');
 if(raw.seed!==undefined&&(!Number.isInteger(raw.seed)||raw.seed<0||raw.seed>4294967295))throw new Error('seed must be uint32.');
 const category=CATEGORIES.includes(raw.category)?raw.category:'architecture',d=DEFAULTS[category],seed=(raw.seed??1909)>>>0,terrain=raw.environment?.terrain||d.environment.terrain;
 const scene={schema:GENERATIVE_SCHEMA09,id:raw.id||'scene-'+seed,title:raw.title||'CRF 0.9 '+category,category,seed,width:raw.width??1024,height:raw.height??768,
  environment:{...clone(d.environment),...(raw.environment||{})},light:{...d.light,...(raw.light||{})},camera:{panX:0,panY:0,zoom:1,...(raw.camera||{})},
  objects:clone(raw.objects??(category==='landscape'&&TERRAIN_OBJECTS[terrain]?TERRAIN_OBJECTS[terrain]:d.objects)).map(o=>({depth:.5,rotation:0,roughness:.6,visible:true,color:[140,150,130],...o,seed:o.seed??hash(seed^hashText(o.id))})),
  revision:raw.revision??0,provenance:raw.provenance||{kind:'generated',mechanism:'analytic_image_plane_geometry_and_learned_gaussian_appearance',sourceImageEmbedded:false,rawPixelResidual:false,meshUsed:false,unobservedAppearance:'procedural inference',scope:'restricted three-category statistical/procedural generator'}};
 if(Object.hasOwn(raw,'appearanceModel')&&raw.appearanceModel!==undefined)scene.appearanceModel=clone(raw.appearanceModel);
 if(category==='landscape'&&raw.environment?.horizon===undefined&&terrain==='coast')scene.environment.horizon=.40;
 const v=validateScene(scene);if(!v.ok)throw new Error(v.errors.join(' '));return scene;
}
function createScene(raw={},model){const s=normalizeScene(raw);if(model!==undefined)s.appearanceModel=clone(model);return s;}
function resolveObjects(scene,camera){
 const objects=scene.objects.map(clone),byId=new Map(objects.map(o=>[o.id,o]));
 const resolved=new Set();function visit(o){if(resolved.has(o.id))return;if(o.attachment){const p=byId.get(o.attachment.parentId);visit(p);o.x=p.x+o.attachment.anchor[0];o.y=p.y+o.attachment.anchor[1];if(p.visible===false)o.visible=false;}resolved.add(o.id);}
 for(const o of objects)visit(o);
 const zoom=camera.zoom??1;for(const o of objects){o.x=.5+(o.x-.5)*zoom-(camera.panX||0)*(.25+.75*o.depth);o.y=.5+(o.y-.5)*zoom-(camera.panY||0)*(.25+.75*o.depth);o.width*=zoom;o.height*=zoom;}
 return objects.sort((a,b)=>a.depth-b.depth);
}
function applyOps(scene,ops){
 if(!Array.isArray(ops)||ops.length>100)throw new Error('Operation budget exceeded.');const next=clone(scene);
 const allowed=new Set(['x','y','width','height','color','depth','rotation','visible','roughness','seed','attachment','type']);
 for(const op of ops){
  if(op.op==='environment'||op.op==='light'||op.op==='camera'){Object.assign(next[op.op],op.values||op.patch||{});continue;}
  const i=next.objects.findIndex(o=>o.id===op.id);
  if(op.op==='add'){next.objects.push(clone(op.object));continue;}
  if(i<0)throw new Error('Unknown object '+op.id);
  if(op.op==='remove'){next.objects[i].visible=false;continue;}
  if(!['set','update'].includes(op.op))throw new Error('Unsupported operation.');
  const patch=op.values||op.patch||(op.key?{[op.key]:op.value}:{});for(const[k,v]of Object.entries(patch)){if(!allowed.has(k))throw new Error('Unsupported property '+k);next.objects[i][k]=clone(v);}
  if(next.objects[i].attachment&&!patch.attachment&&(patch.x!==undefined||patch.y!==undefined)){const p=next.objects.find(o=>o.id===next.objects[i].attachment.parentId);if(p){if(patch.x!==undefined)next.objects[i].attachment.anchor[0]=patch.x-p.x;if(patch.y!==undefined)next.objects[i].attachment.anchor[1]=patch.y-p.y;}}
 }
 next.revision=(scene.revision||0)+1;return normalizeScene(next);
}

function gaussianBlur(src,w,h,sigma,periodic=false){
 const radius=Math.max(1,Math.ceil(3*sigma)),kernel=new Float64Array(2*radius+1);let sum=0;
 for(let k=-radius;k<=radius;k++){const v=Math.exp(-.5*(k/sigma)**2);kernel[k+radius]=v;sum+=v;}for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
 const tmp=new Float32Array(w*h),out=new Float32Array(w*h),index=(v,n)=>periodic?(v%n+n)%n:clamp(v,0,n-1);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let k=-radius;k<=radius;k++)v+=src[y*w+index(x+k,w)]*kernel[k+radius];tmp[y*w+x]=v;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let k=-radius;k<=radius;k++)v+=tmp[index(y+k,h)*w+x]*kernel[k+radius];out[y*w+x]=v;}return out;
}
function extractAppearance(image,semantic={}){
 const {width,height,data}=image;if(!data||data.length!==width*height*4)throw new Error('Decoded RGBA required.');
 const scale=Math.min(1,128/Math.max(width,height)),w=Math.max(8,Math.round(width*scale)),h=Math.max(8,Math.round(height*scale));
 const lum=new Float32Array(w*h),weight=new Float32Array(w*h),mean=[0,0,0],second=[0,0,0];let count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const ix=clamp(Math.floor((x+.5)*width/w),0,width-1),iy=clamp(Math.floor((y+.5)*height/h),0,height-1),p=(iy*width+ix)*4,i=y*w+x,a=data[p+3]/255,r=LUT[data[p]],g=LUT[data[p+1]],b=LUT[data[p+2]];weight[i]=a;lum[i]=.2126*r+.7152*g+.0722*b;count+=a;for(let c=0;c<3;c++){const v=[r,g,b][c];mean[c]+=v*a;second[c]+=v*v*a;}}
 if(count<1)throw new Error('No usable pixels.');for(let c=0;c<3;c++)mean[c]/=count;
 const std=second.map((v,c)=>Math.sqrt(Math.max(0,v/count-mean[c]*mean[c]))),bands=[];let prev=lum;
 for(const sigma of [.6,1.2,2.4,4.8]){const blurred=gaussianBlur(lum,w,h,sigma);let v=0;for(let i=0;i<lum.length;i++)v+=(prev[i]-blurred[i])**2*weight[i];bands.push(Math.sqrt(v/count));prev=blurred;}
 return{id:semantic.id||'observation',sourceGroup:semantic.sourceGroup||semantic.id||'observation',category:CATEGORIES.includes(semantic.category)?semantic.category:'still_life',material:semantic.material||null,mean,std,bands,sampleCount:Math.round(count),analysisSize:[w,h],method:'linear_rgb_moments_and_gaussian_band_rms_v1'};
}
function learnAppearance(samples,{previousModel=null}={}){
 if(!Array.isArray(samples)||samples.length>2000)throw new Error('Invalid appearance samples.');
 const all=[...(previousModel?.observations||[]),...samples],unique=new Map();
 for(const x of all){if(!x||typeof x.id!=='string'||!CATEGORIES.includes(x.category)||!vector(x.mean,0,1,3)||!vector(x.std,0,1,3)||!vector(x.bands,0,1,4))continue;unique.set(x.id,clone(x));}
 const observations=[...unique.values()],categories={};
 for(const category of CATEGORIES){const rows=observations.filter(x=>x.category===category);if(!rows.length)continue;const aggregate=k=>rows[0][k].map((_,j)=>rows.reduce((a,x)=>a+x[k][j],0)/rows.length);categories[category]={count:rows.length,mean:aggregate('mean'),std:aggregate('std'),bands:aggregate('bands'),sourceGroups:[...new Set(rows.map(x=>x.sourceGroup))]};}
 const signature=[observations.map(x=>[x.id,x.category,x.mean,x.bands]),previousModel?.functionFamilies||null];
 return{schema:MODEL_SCHEMA,id:'shared-'+hashText(JSON.stringify(signature)).toString(16),revision:(previousModel?.revision||0)+1,categories,observations,sourceCount:observations.length,
  ...(previousModel?.functionFamilies?{functionFamilies:clone(previousModel.functionFamilies),retainedFamilyNote:'Existing Gaussian coefficient families retained; these new observations update band statistics only.'}:{}),
  scope:'shared multi-image linear-color moments and Gaussian frequency-band amplitude estimates; procedural shape prior is hand-authored',training:'maximum-likelihood sample moments, equal weight per independent observation',sourceRGBEmbedded:false,neuralWeightsTrained:false,generativeGeneralizationProven:false};
}

const textureCache=new Map();
function texture(seed,category,model,amount=1){
 const row=model?.categories?.[category],bands=(row?.bands||[.018,.013,.018,.024]).map((x,i)=>clamp(x*.7,.003,[.05,.04,.045,.06][i])*amount),key=seed+':'+bands.join(',');
 if(textureCache.has(key))return textureCache.get(key);
 const size=128,n=size*size,rng=random(seed),white=new Float32Array(n);for(let i=0;i<n;i++)white[i]=normal(rng);
 const layers=[],sigmas=[.55,1.2,2.5,5.2];let prev=white;
 for(let k=0;k<4;k++){const blur=gaussianBlur(white,size,size,sigmas[k],true),band=new Float32Array(n);let sq=0;for(let i=0;i<n;i++){band[i]=prev[i]-blur[i];sq+=band[i]**2;}const gain=bands[k]/Math.sqrt(sq/n);for(let i=0;i<n;i++)band[i]*=gain;layers.push(band);prev=blur;}
 const broad=gaussianBlur(white,size,size,10,true);let bs=0;for(const v of broad)bs+=v*v;const gain=.018*amount/Math.sqrt(bs/n);for(let i=0;i<n;i++)broad[i]*=gain;
 const combined=new Float32Array(n);for(let i=0;i<n;i++)combined[i]=layers.reduce((a,v)=>a+v[i],0)+broad[i];
 const out={size,data:combined,bands,gaussianBasisSamples:n*4,sourceCount:row?.count||0};textureCache.set(key,out);if(textureCache.size>40)textureCache.delete(textureCache.keys().next().value);return out;
}
function tex(t,x,y){const n=t.size;x=((x%n)+n)%n;y=((y%n)+n)%n;const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,x1=(ix+1)%n,y1=(iy+1)%n;return mix(mix(t.data[iy*n+ix],t.data[iy*n+x1],fx),mix(t.data[y1*n+ix],t.data[y1*n+x1],fx),fy);}
const familyCache=new Map();
function skinField(seed,model){
 const family=model?.functionFamilies?.fruit_skin;if(!family)return null;
 const n=family.gridSize,rank=family.rank;
 if(!Number.isInteger(n)||n<3||n>25||!Number.isInteger(rank)||rank<1||rank>8||!num(family.sigma,.015,.5)||!Array.isArray(family.mean)||family.mean.length!==n*n||!Array.isArray(family.modes)||family.modes.length!==rank||!vector(family.standardDeviations,0,100,rank))throw new Error('Invalid learned Gaussian family.');
 const key=hashText(JSON.stringify(family))+':'+seed;if(familyCache.has(key))return familyCache.get(key);
 const rng=random(seed^392489),z=family.standardDeviations.map(v=>clamp(normal(rng),-1.5,1.5)*v),size=128,data=new Float32Array(size*size*3),sigma=family.sigma*size/2,radius=Math.ceil(4*sigma);
 for(let j=0;j<n*n;j++){
  if(!vector(family.mean[j],-100,100,3)||family.modes.some(m=>!Array.isArray(m)||m.length!==n*n||!vector(m[j],-100,100,3)))throw new Error('Invalid family coefficients.');
  const coeff=family.mean[j].map((v,c)=>v+z.reduce((a,q,k)=>a+q*family.modes[k][j][c],0)),cx=(j%n)/(n-1)*(size-1),cy=Math.floor(j/n)/(n-1)*(size-1);
  for(let y=Math.max(0,Math.floor(cy-radius));y<=Math.min(size-1,cy+radius);y++)for(let x=Math.max(0,Math.floor(cx-radius));x<=Math.min(size-1,cx+radius);x++){const q=((x-cx)**2+(y-cy)**2)/(sigma*sigma);if(q>16)continue;const weight=Math.exp(-q*.5),p=(y*size+x)*3;for(let c=0;c<3;c++)data[p+c]+=coeff[c]*weight;}
 }
 const out={size,data,basis:n*n,latent:z};familyCache.set(key,out);if(familyCache.size>24)familyCache.delete(familyCache.keys().next().value);return out;
}
function skinSample(field,u,v){if(!field)return[0,0,0];const n=field.size,x=clamp((u*.5+.5)*(n-1),0,n-1),y=clamp((v*.5+.5)*(n-1),0,n-1),ix=Math.floor(x),iy=Math.floor(y),x1=Math.min(n-1,ix+1),y1=Math.min(n-1,iy+1),fx=x-ix,fy=y-iy;return[0,1,2].map(c=>clamp(mix(mix(field.data[(iy*n+ix)*3+c],field.data[(iy*n+x1)*3+c],fx),mix(field.data[(y1*n+ix)*3+c],field.data[(y1*n+x1)*3+c],fx),fy),-.65,.65));}
function shapeProfile(model,type,seed){const m=model?.functionFamilies?.fruit_skin?.shapeModels?.[type];if(!m||m.trainingCount<2)return null;if(!vector(m.widthMean,0,1.5,33)||!vector(m.centerMean,-1,1,33)||!Array.isArray(m.widthModes)||m.widthModes.length>2||m.widthModes.some(x=>!vector(x,-2,2,33)))throw new Error('Invalid learned shape profile.');const rng=random(seed+13423),z=m.widthModes.map(()=>clamp(normal(rng),-1.1,1.1));return{widths:m.widthMean.map((v,i)=>clamp(v+z.reduce((a,q,k)=>a+q*m.widthModes[k][i],0),.01,1.10)),centers:m.centerMean};}
function profileAt(values,v){const y=clamp((v*.5+.5)*(values.length-1),0,values.length-1),i=Math.floor(y);return mix(values[i],values[Math.min(values.length-1,i+1)],y-i);}
function noise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),at=(a,b)=>hash(Math.imul(a,374761393)^Math.imul(b,668265263)^seed)/4294967295;return mix(mix(at(ix,iy),at(ix+1,iy),u),mix(at(ix,iy+1),at(ix+1,iy+1),u),v);}
function fbm(x,y,seed,n=4){let a=.5,v=0;for(let i=0;i<n;i++){v+=a*(noise(x,y,seed+i*929)-.5);x*=2.07;y*=2.07;a*=.5;}return v;}
function lightVector(l){const a=l.azimuth*Math.PI/180,e=l.elevation*Math.PI/180;return[Math.sin(a)*Math.cos(e),-Math.sin(e),Math.cos(a)*Math.cos(e)];}
function illumination(ctx,nx,ny,nz,roughness=.65){const L=ctx.L,diff=Math.max(0,nx*L[0]+ny*L[1]+nz*L[2]),half=[L[0],L[1],L[2]+1],hn=Math.hypot(...half),spec=Math.max(0,(nx*half[0]+ny*half[1]+nz*half[2])/hn)**mix(110,12,roughness);return{diff:ctx.scene.light.intensity*(.25+.75*diff),spec:spec*(1-roughness)*.32};}
function setPixel(ctx,x,y,c,a=1){if(x<0||y<0||x>=ctx.w||y>=ctx.h||a<=0)return;const p=(y*ctx.w+x)*3;for(let k=0;k<3;k++)ctx.buf[p+k]=ctx.buf[p+k]*(1-a)+c[k]*a;}
function blendGaussian(ctx,cx,cy,sx,sy,color,opacity=1,theta=0){
 const co=Math.cos(theta),si=Math.sin(theta),rx=3.4*Math.hypot(sx*co,sy*si),ry=3.4*Math.hypot(sx*si,sy*co),x0=Math.max(0,Math.floor(cx-rx)),x1=Math.min(ctx.w-1,Math.ceil(cx+rx)),y0=Math.max(0,Math.floor(cy-ry)),y1=Math.min(ctx.h-1,Math.ceil(cy+ry));ctx.gaussians++;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const dx=x+.5-cx,dy=y+.5-cy,u=(dx*co+dy*si)/sx,v=(-dx*si+dy*co)/sy,q=u*u+v*v;if(q<12)setPixel(ctx,x,y,color,Math.exp(-q*.5)*opacity);}
}
function roundRect(x,y,cx,cy,hw,hh,r){const qx=Math.abs(x-cx)-(hw-r),qy=Math.abs(y-cy)-(hh-r);return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;}
function paintRect(ctx,cx,cy,w,h,r,color){const x0=Math.max(0,Math.floor(cx-w/2-2)),x1=Math.min(ctx.w-1,Math.ceil(cx+w/2+2)),y0=Math.max(0,Math.floor(cy-h/2-2)),y1=Math.min(ctx.h-1,Math.ceil(cy+h/2+2));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=roundRect(x+.5,y+.5,cx,cy,w/2,h/2,r),a=clamp(.5-d,0,1);if(a)setPixel(ctx,x,y,typeof color==='function'?color(x,y,d):color,a);}}
function stroke(ctx,x0,y0,x1,y1,width,color){const dx=x1-x0,dy=y1-y0,len=dx*dx+dy*dy,xmin=Math.max(0,Math.floor(Math.min(x0,x1)-width)),xmax=Math.min(ctx.w-1,Math.ceil(Math.max(x0,x1)+width)),ymin=Math.max(0,Math.floor(Math.min(y0,y1)-width)),ymax=Math.min(ctx.h-1,Math.ceil(Math.max(y0,y1)+width));for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){const t=clamp(((x+.5-x0)*dx+(y+.5-y0)*dy)/Math.max(1e-10,len),0,1),d=Math.hypot(x+.5-x0-t*dx,y+.5-y0-t*dy);setPixel(ctx,x,y,color,clamp(width/2+.5-d,0,1));}}

function base(ctx){
 const {w,h,scene:s,buf}=ctx,e=s.environment,wall=toRGB(e.wallColor),ground=toRGB(e.groundColor),sky=toRGB(e.skyColor),t=texture(hash(s.seed^17),s.category,ctx.model,e.texture),light=s.light;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x/w-.5)/ctx.camera.zoom+.5+(ctx.camera.panX||0)*.25,v=(y/h-.5)/ctx.camera.zoom+.5+(ctx.camera.panY||0)*.25;
  const fine=tex(t,u*340,v*340),broad=fbm(u*3,v*3,s.seed,3),p=(y*w+x)*3;let col;
  if(s.category==='landscape'){
   const gradient=clamp(v/e.horizon,0,1),haze=gradient**2*.42;
   col=sky.map((c,k)=>mix(c,[.78,.80,.77][k],haze)+broad*.025+fine*.07);
   const glow=Math.exp(-((u-.28)**2/.18+(v-.22)**2/.11))*light.warmth*.18;
   col[0]+=glow;col[1]+=glow*.7;col[2]+=glow*.3;
  }else if(s.category==='architecture'){
   const isGround=v>e.horizon,stone=isGround?ground:wall;
   const diagonal=.22+.40*u+.05*Math.sin(u*3+s.seed),shadow=smooth(-.007,.007,v-diagonal),secondShadow=smooth(-.012,.012,Math.abs(u-.79)-.10)*(1-smooth(.34,.38,v));
   const shade=(.47+.53*(1-shadow*.68))*(1-.18*secondShadow),bounce=.03*Math.exp(-Math.abs(v-e.horizon)*6);
   col=stone.map((c,k)=>c*(shade*light.intensity+fine*.25+broad*.055)+bounce*(k===2?.5:1));
   if(!isGround){const seam=Math.abs(((v+.023)*2.8)%1-.5);if(seam<.002)col=col.map(c=>c*.54);}
   else{const yy=(v-e.horizon)/Math.max(.01,1-e.horizon),z=1/(.25+yy),row=Math.floor(z*1.35),jointX=Math.abs((u*z*6+(row%2)*.5)%1-.5),jointY=Math.abs((z*1.35)%1-.5);if(jointX<.022||jointY<.024)col=col.map(c=>c*.61);}
  }else{
   const isGround=v>e.horizon,stone=isGround?ground:wall,glow=Math.exp(-((u-.23)**2/.25+(v-.29)**2/.5));
   const shade=.48+.40*glow+.08*v;
   col=stone.map((c,k)=>c*(shade*light.intensity+fine*(isGround?.25:.10)+broad*.025)+.013);
   if(isGround){const yy=(v-e.horizon)/(1-e.horizon),grain=Math.sin(u*190+fbm(u*11,yy*3,s.seed+231)*13);for(let k=0;k<3;k++)col[k]+=grain*.007*(1-yy*.4);}
  }
  const vignette=1-.10*((u-.5)**2+(v-.5)**2);for(let k=0;k<3;k++)buf[p+k]=Math.max(0,col[k]*vignette);
 }
 ctx.gaussians+=t.gaussianBasisSamples;
}

function windowObject(ctx,o){
 const cx=o.x*ctx.w,cy=o.y*ctx.h,w=o.width*ctx.w,h=o.height*ctx.h,frame=toRGB(o.color),t=texture(o.seed,'architecture',ctx.model,.4),pad=Math.max(2,w*.055);
 blendGaussian(ctx,cx+w*.06,cy+h*.08,w*.52,h*.55,[.015,.02,.018],.32);
 paintRect(ctx,cx,cy,w+pad*1.3,h+pad*1.3,1,[.035,.043,.036]);
 paintRect(ctx,cx,cy,w,h,1,(x,y)=>{const edge=Math.min(x-(cx-w/2),cx+w/2-x,y-(cy-h/2),cy+h/2-y),sh=edge<pad*.4?.78:1.08;return frame.map(c=>c*sh+tex(t,x*.8,y*.8)*.2);});
 paintRect(ctx,cx,cy,w-pad*2,h-pad*2,0,(x,y)=>{const u=(x-cx)/w+.5,v=(y-cy)/h+.5,reflection=.018+Math.max(0,.5-u)*.07+Math.exp(-((u-.72)**2/.03+(v-.35)**2/.1))*.035,curtain=smooth(.17,.22,u)*(1-smooth(.76,.81,u))*(.5+.5*Math.sin(u*36)),shadow=smooth(.5,.52,v-.25*u),dust=tex(t,u*160,v*150)*.045;return[reflection*.69+curtain*.013-dust,reflection*.88+curtain*.011-dust,reflection*.85+curtain*.006-dust].map(c=>c*(1-.25*shadow));});
 stroke(ctx,cx-w/2+pad,cy-h/2+pad,cx+w/2-pad,cy-h/2+pad,pad*.22,[.57,.55,.42]);
 stroke(ctx,cx-w/2+pad,cy-h/2+pad,cx-w/2+pad,cy+h/2-pad,pad*.25,[.42,.43,.34]);
 stroke(ctx,cx-w/2,cy+h/2,cx+w/2,cy+h/2,pad*.3,[.055,.06,.048]);
 if((o.seed%3)===0)stroke(ctx,cx,cy-h/2+pad,cx,cy+h/2-pad,pad*.48,frame.map(c=>c*.7));
}
function poleObject(ctx,o){
 const cx=o.x*ctx.w,cy=o.y*ctx.h,w=o.width*ctx.w,h=o.height*ctx.h,c=toRGB(o.color);
 paintRect(ctx,cx,cy,w,h,w*.35,(x,y)=>{const u=(x-cx)/w,glint=Math.exp(-(((u+.20)/.16)**2))*.26;return c.map((v,k)=>v*(.5+.7*Math.sqrt(Math.max(0,1-4*u*u)))+glint*[1,.91,.68][k]);});
 paintRect(ctx,cx,cy+h*.10,w*1.13,h*.12,2,c.map(v=>v*.9));
}
function signalObject(ctx,o){
 const cx=o.x*ctx.w,cy=o.y*ctx.h,w=o.width*ctx.w,h=o.height*ctx.h,c=toRGB(o.color),parent=ctx.objects.find(p=>p.id===o.attachment?.parentId);
 if(parent&&parent.visible){const px=parent.x*ctx.w,py=cy-h*.68;stroke(ctx,px,py,cx,py,Math.max(2,w*.105),[.09,.095,.065]);stroke(ctx,cx,py,cx,cy-h*.48,Math.max(2,w*.08),[.10,.105,.07]);}
 paintRect(ctx,cx,cy,w*1.06,h*1.02,w*.21,[.025,.03,.018]);
 paintRect(ctx,cx,cy,w,h,w*.18,c);
 for(let k=0;k<2;k++){const sy=cy+(k?1:-1)*h*.25;paintRect(ctx,cx,sy,w*.83,h*.43,w*.13,[.014,.018,.014]);paintRect(ctx,cx,sy,w*.70,h*.33,w*.09,k?[.035,.19,.21]:[.83,.009,.012]);blendGaussian(ctx,cx-w*.13,sy-h*.07,w*.22,h*.10,k?[.14,.30,.30]:[1,.07,.035],.34);const symbol=k?[.28,.47,.40]:[1,.88,.65];blendGaussian(ctx,cx,sy-h*.07,w*.065,h*.034,symbol,.95);stroke(ctx,cx,sy-h*.03,cx,sy+h*.08,w*.07,symbol);stroke(ctx,cx,sy+h*.02,cx-w*.10,sy+h*.11,w*.045,symbol);stroke(ctx,cx,sy+h*.02,cx+w*.09,sy+h*.10,w*.045,symbol);}
}

function fruitObject(ctx,o){
 const cx=o.x*ctx.w,cy=o.y*ctx.h,rx=o.width*ctx.w/2,ry=o.height*ctx.h/2,color=toRGB(o.color),t=texture(o.seed,'still_life',ctx.model,.9*ctx.scene.environment.texture),family=skinField(o.seed,ctx.model),shape=shapeProfile(ctx.model,o.type,o.seed),rotation=o.rotation*Math.PI/180,co=Math.cos(rotation),si=Math.sin(rotation),rough=o.roughness;
 const groundY=cy+ry*.96,shx=-ctx.L[0]*rx*.55,shy=-ctx.L[1]*ry*.10;
 blendGaussian(ctx,cx+shx,groundY+shy,rx*.86,ry*.13,[.016,.020,.012],.40);
 blendGaussian(ctx,cx,groundY,rx*.63,Math.max(1,ry*.028),[.008,.011,.006],.63);
 const x0=Math.max(0,Math.floor(cx-rx*1.08-2)),x1=Math.min(ctx.w-1,Math.ceil(cx+rx*1.08+2)),y0=Math.max(0,Math.floor(cy-ry*1.06-2)),y1=Math.min(ctx.h-1,Math.ceil(cy+ry*1.06+2));
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  const dx=x+.5-cx,dy=y+.5-cy,v=(-si*dx+co*dy)/ry,u=(co*dx+si*dy)/rx-(shape?profileAt(shape.centers,v)*.45:0);
  let radial=1,radialDerivative=0;
  if(o.type==='pear'){const q=(v-.35)/.68;radial=.46+.56*Math.exp(-q*q);radialDerivative=-1.12*q/.68*Math.exp(-q*q);}
  else if(o.type==='apple'){radial=1.02-.105*v+.022*Math.cos(v*3);radialDerivative=-.105-.066*Math.sin(v*3);}
  if(shape&&Math.abs(v)<.96){const ellipse=Math.sqrt(Math.max(.02,1-v*v)),learnedRadius=profileAt(shape.widths,v)/ellipse,delta=.012,derivative=(profileAt(shape.widths,v+delta)/Math.sqrt(Math.max(.02,1-(v+delta)**2))-profileAt(shape.widths,v-delta)/Math.sqrt(Math.max(.02,1-(v-delta)**2)))/(2*delta);radial=mix(radial,learnedRadius,.40);radialDerivative=mix(radialDerivative,derivative,.40);}
  const uu=u/radial,q=uu*uu+v*v,edge=(1-Math.sqrt(q))*Math.min(rx*radial,ry),alpha=clamp(edge+.5,0,1);if(!alpha)continue;
  const zz=Math.sqrt(Math.max(0,1-q)),theta=Math.atan2(uu,Math.max(.05,zz)),small=tex(t,theta*50+14,v*74+27),surface=fbm(theta*5,v*5,o.seed,3);
  let nx=uu/radial,ny=v-u*u*radialDerivative/(radial**3),nz=zz;const pores=(noise(theta*130,v*140,o.seed+18)-.5),bump=(o.type==='orange'?.055:.012)*pores;nx+=bump;ny+=bump;const length=Math.hypot(nx,ny,nz);nx/=length;ny/=length;nz/=length;
  const il=illumination(ctx,nx,ny,nz,rough),mottle=small*.5+surface*.08,redStripe=o.type==='apple'?Math.sin(theta*28+v*3+surface*20)*.045:0;
  const learned=skinSample(family,uu,v),alb=color.map((c,k)=>Math.max(.001,c*(1+mottle*2+redStripe*(k===0?.4:1.6))*Math.exp(learned[k]*.30)));
  if(o.type==='pear'){const freckles=noise(theta*230,v*230,o.seed+71)>.82?.018:0;for(let k=0;k<3;k++)alb[k]*=1-freckles*6;}
  if(o.type==='orange'){const cells=noise(theta*160,v*160,o.seed+41);for(let k=0;k<3;k++)alb[k]*=.92+.16*cells;}
  const bottom=.86+.14*smooth(.96,.50,v),warm=ctx.scene.light.warmth,box=Math.exp(-(((nx-ctx.L[0]*.45)/.19)**4+((ny-ctx.L[1]*.50)/.30)**4))*(1-rough)*.055,col=alb.map((c,k)=>c*il.diff*bottom*[1+.07*warm,1,.93+.03*warm][k]+(il.spec*.65+box)*[1,.96,.87][k]);
  if(o.type==='apple'){const dimple=Math.exp(-((u/.14)**2+((v+.83)/.10)**2)),blush=smooth(.25,.55,noise(theta*2,v*3,o.seed+455));for(let k=0;k<3;k++){col[k]*=1-.45*dimple;if(k===1)col[k]+=blush*.012*(1-dimple);}}
  setPixel(ctx,x,y,col,alpha);
 }
 if(o.type!=='orange'){
  const top=cy-ry*.92,stemEnd=top-ry*.16;
  stroke(ctx,cx,top+ry*.07,cx+rx*.055,stemEnd,Math.max(1.2,rx*.045),[.072,.041,.014]);
  stroke(ctx,cx-rx*.01,top,cx+rx*.04,stemEnd,Math.max(.7,rx*.014),[.19,.13,.05]);
  const rng=random(o.seed+32);if(rng()>.4){const lx=cx+rx*.20,ly=top-ry*.09;for(let y=Math.floor(ly-ry*.10);y<=ly+ry*.10;y++)for(let x=Math.floor(lx-rx*.20);x<=lx+rx*.20;x++){const u=(x-lx)/(rx*.20),v=(y-ly)/(ry*.10),d=u*u+v*v;if(d<1)setPixel(ctx,x,y,[.035,.10,.025],clamp((1-d)*4,0,1));}stroke(ctx,cx,top,lx+rx*.15,ly,Math.max(1,rx*.012),[.12,.19,.045]);}
 }else blendGaussian(ctx,cx,cy-ry*.89,rx*.07,ry*.025,[.09,.12,.028],.8);
 ctx.gaussians+=t.gaussianBasisSamples+(family?.basis||0);
}
function vaseObject(ctx,o){
 const cx=o.x*ctx.w,cy=o.y*ctx.h,rx=o.width*ctx.w/2,ry=o.height*ctx.h/2,c=toRGB(o.color),t=texture(o.seed,'still_life',ctx.model,.5);
 blendGaussian(ctx,cx-ctx.L[0]*rx*.5,cy+ry,rx*.9,ry*.12,[.012,.018,.014],.45);blendGaussian(ctx,cx,cy+ry,rx*.68,ry*.025,[.005,.009,.007],.65);
 for(let y=Math.max(0,Math.floor(cy-ry-2));y<Math.min(ctx.h,cy+ry+2);y++)for(let x=Math.max(0,Math.floor(cx-rx-2));x<Math.min(ctx.w,cx+rx+2);x++){
  const v=(y+.5-cy)/ry,u=(x+.5-cx)/rx,r=.38+.60*Math.exp(-(((v-.30)/.64)**2)),edge=Math.min((r-Math.abs(u))*rx,(1-Math.abs(v))*ry),a=clamp(edge+.5,0,1);if(!a)continue;
  const nx=u/r,nz=Math.sqrt(Math.max(0,1-nx*nx)),il=illumination(ctx,nx,-.1,nz,o.roughness),grain=tex(t,u*80,v*90),ring=Math.sin(v*140)*.004;
  setPixel(ctx,x,y,c.map((k,i)=>k*(il.diff+grain*.8+ring)+il.spec*[.94,.98,1][i]),a);
 }
 const mouth=rx*(.38+.60*Math.exp(-(((-1-.30)/.64)**2))),my=cy-ry+1;
 for(let y=Math.max(0,Math.floor(my-ry*.026-2));y<Math.min(ctx.h,my+ry*.026+2);y++)for(let x=Math.max(0,Math.floor(cx-mouth-2));x<Math.min(ctx.w,cx+mouth+2);x++){const q=((x-cx)/mouth)**2+((y-my)/(ry*.026))**2,a=clamp((1-Math.sqrt(q))*Math.min(mouth,ry*.026)+.5,0,1);if(a)setPixel(ctx,x,y,[.008,.018,.014],a);}
 stroke(ctx,cx-mouth,cy-ry,cx+mouth,cy-ry,Math.max(1,ry*.010),c.map(v=>v*1.3));ctx.gaussians+=t.gaussianBasisSamples;
}

function ridgeProfile(o,u){const local=(u-o.x)/o.width,seed=o.seed;return o.y-o.height*(.32+.28*Math.sin(local*4+seed%10)+.27*Math.abs(Math.sin(local*9.1+1.4))+.15*fbm(local*18,3,seed,4));}
function ridgeObject(ctx,o){
 const color=toRGB(o.color),fog=ctx.scene.environment.fog*(1-o.depth),sky=toRGB(ctx.scene.environment.skyColor),t=texture(o.seed,'landscape',ctx.model,.7),horizon=ctx.scene.environment.horizon;
 for(let x=0;x<ctx.w;x++){const u=x/ctx.w,top=ridgeProfile(o,u),du=ridgeProfile(o,u+.001)-ridgeProfile(o,u-.001),xleft=o.x-o.width*.6,xright=o.x+o.width*.6;if(u<xleft||u>xright)continue;
  for(let y=Math.max(0,Math.floor(top*ctx.h));y<Math.min(ctx.h,Math.ceil((horizon+.03)*ctx.h));y++){
   const v=(y+.5)/ctx.h,edge=(v-top)*ctx.h,a=clamp(edge+.5,0,1),vertical=(v-top)/Math.max(.01,horizon-top),grain=tex(t,u*170,v*160),strata=fbm(u*28+v*18,v*34,o.seed,4),slopeLight=.58+.35*clamp(-du*130*ctx.L[0]+.4,0,1),snow=smooth(.42,.11,vertical)*(smooth(.02,.20,strata+.18))*(o.depth<.25?1:0);
   let col=color.map((c,k)=>mix(c*(slopeLight+grain*.7+strata*.2),[.71,.75,.74][k],snow*.85));col=col.map((c,k)=>mix(c,sky[k]*.8+.07,fog*.75));setPixel(ctx,x,y,col,a);
  }
 }
 ctx.gaussians+=t.gaussianBasisSamples;
}
function treeObject(ctx,o){
 const rng=random(o.seed),cx=o.x*ctx.w,top=(o.y-o.height/2)*ctx.h,baseY=(o.y+o.height/2)*ctx.h,h=o.height*ctx.h,w=o.width*ctx.w,c=toRGB(o.color),fog=ctx.scene.environment.fog*(1-o.depth)*.6,sky=toRGB(ctx.scene.environment.skyColor),trunk=[.05,.04,.023];
 stroke(ctx,cx,top+h*.08,cx,baseY,Math.max(.8,w*.045),trunk);
 const levelCount=Math.max(9,Math.min(30,Math.round(h/9)));
 for(let i=0;i<levelCount;i++){const v=(i+1)/levelCount,yy=top+h*v*.90,spread=w*.46*(.12+.88*v),jitter=(rng()-.5)*w*.1,shade=.65+.48*rng(),col=c.map((x,k)=>mix(x*shade,sky[k]*.55,fog));
  for(let side=-1;side<=1;side+=2){const ex=cx+side*spread*(.65+.4*rng())+jitter,ey=yy+h*.025;stroke(ctx,cx,yy-h*.035,ex,ey,Math.max(.6,w*.015),col);const n=5+Math.round(spread/4);for(let j=0;j<n;j++){const q=j/n,px=mix(cx,ex,q)+(rng()-.5)*w*.07,py=mix(yy-h*.035,ey,q)+(rng()-.5)*h*.025,sx=Math.max(.65,w*(.025+.024*rng())*(1-q*.4)),sy=Math.max(.6,h*(.006+.005*rng()));blendGaussian(ctx,px,py,sx,sy,col,.95,-side*.3);}}
 }
}
function rockObject(ctx,o){
 const cx=o.x*ctx.w,cy=o.y*ctx.h,rx=o.width*ctx.w/2,ry=o.height*ctx.h/2,c=toRGB(o.color),t=texture(o.seed,'landscape',ctx.model,1.2);
 blendGaussian(ctx,cx,cy+ry*.7,rx*.8,ry*.18,[.01,.02,.017],.5);
 for(let y=Math.max(0,Math.floor(cy-ry-3));y<Math.min(ctx.h,cy+ry+3);y++)for(let x=Math.max(0,Math.floor(cx-rx-3));x<Math.min(ctx.w,cx+rx+3);x++){
  const u=(x+.5-cx)/rx,v=(y+.5-cy)/ry,angle=Math.atan2(v,u),r=1+.08*Math.sin(angle*5+o.seed)+.04*Math.sin(angle*11),q=u*u+v*v,a=clamp((r-Math.sqrt(q))*Math.min(rx,ry)+.5,0,1);if(!a)continue;
  const z=Math.sqrt(Math.max(0,r*r-q)),detail=fbm(u*8,v*8,o.seed,4),il=illumination(ctx,u+detail*.4,v*.6,z,.95),grain=tex(t,u*100,v*100),vein=Math.exp(-Math.abs(Math.sin(u*14+v*6+detail*5))*32)*.05;
  setPixel(ctx,x,y,c.map(k=>k*(il.diff+grain+detail*.22)+vein),a);
 }ctx.gaussians+=t.gaussianBasisSamples;
}
function water(ctx){
 const {w,h,scene:s}=ctx,hor=s.environment.horizon,yh=Math.round(hor*h),before=ctx.buf.slice(),waterColor=toRGB(s.environment.groundColor),t=texture(s.seed+717,'landscape',ctx.model,.4);
 for(let y=yh;y<h;y++)for(let x=0;x<w;x++){
  const v=(y-yh)/Math.max(1,h-yh),u=x/w,ripple=Math.sin(v*190+Math.sin(u*17+s.seed)*2)*(.2+v*2.7)+Math.sin(v*71-u*21)*v*2,xx=clamp(Math.round(x+ripple),0,w-1),yy=clamp(Math.round(yh-(y-yh)*.9+Math.sin(u*30+v*70)*v*2),0,yh-1),src=(yy*w+xx)*3,p=(y*w+x)*3;
  const reflect=.72-v*.23,shine=Math.max(0,Math.sin(v*380+u*14))*v*.009,grain=tex(t,u*170,v*28)*.11;
  for(let k=0;k<3;k++)ctx.buf[p+k]=before[src+k]*reflect+waterColor[k]*(1-reflect)+shine+grain;
 }
 // Stable Gaussian glints share the scene seed; time never re-samples texture.
 const rng=random(s.seed+945);for(let i=0;i<260;i++){const y=yh+rng()*(h-yh),v=(y-yh)/(h-yh),x=rng()*w;blendGaussian(ctx,x,y,(1+v*5)*w/1024,.3+v*.45,[.47,.55,.54],.04+v*.04);}
}
function shoreline(ctx){const h=ctx.h,w=ctx.w,seed=ctx.scene.seed;for(let y=Math.floor(h*.84);y<h;y++)for(let x=0;x<w;x++){const u=x/w,v=y/h,edge=.93+.065*Math.sin(u*5+1)+fbm(u*8,0,seed,3)*.06;if(v>edge){const n=fbm(u*70,v*70,seed+72,3),shade=.045+n*.05;setPixel(ctx,x,y,[shade*.85,shade*1.15,shade*.77],clamp((v-edge)*h,0,1));}}}

function coast(ctx){
 const{w,h,scene:s}=ctx,hor=s.environment.horizon,yh=Math.round(h*hor),seed=s.seed,t=texture(seed+651,'landscape',ctx.model,.6),sky=toRGB(s.environment.skyColor),sand=toRGB(s.environment.wallColor),water=toRGB(s.environment.groundColor);
 for(let y=yh;y<h;y++)for(let x=0;x<w;x++){
  const u=(x/w-.5)/ctx.camera.zoom+.5+(ctx.camera.panX||0)*.35,v=(y/h-.5)/ctx.camera.zoom+.5+(ctx.camera.panY||0)*.35,shore=.79+.045*Math.sin(u*4.8+seed%7),n=fbm(u*18,v*31,seed+19,4),fine=tex(t,u*240,v*210),depth=clamp((v-hor)/Math.max(.01,shore-hor),0,1);let color;
  if(v<shore){
   const phase=2.2/Math.max(.04,v-hor+.025)+Math.sin(u*11+seed)*.7+n*2,crest=Math.max(0,Math.sin(phase*6.28))**12,ripple=Math.sin(u*29+phase*1.3)*.017;
   color=[0,1,2].map(k=>mix(sky[k]*.25+water[k]*.38,[.065,.25,.235][k],depth*.55)+crest*(.018+.045*depth)+ripple+fine*.1);
   const foamEdge=shore-.028-.012*Math.sin(u*13+fbm(u*8,1,seed)*4),foam=Math.exp(-(((v-foamEdge)/(.004+depth*.004))**2))*(.55+.45*noise(u*130,v*80,seed+111));
   color=color.map((c,k)=>mix(c,[.77,.80,.76][k],foam*.84));
   const backWave=shore-.14+.012*Math.sin(u*9+1),wave=Math.exp(-(((v-backWave)/.005)**2))*(.3+.7*noise(u*70,0,seed+51));color=color.map((c,k)=>mix(c,[.70,.77,.73][k],wave*.52));
  }else{
   const wet=1-smooth(shore,shore+.075,v),gleam=Math.exp(-(((u-.30)/.20)**2))*.08*wet;
   color=sand.map((c,k)=>c*(.66-.28*wet+n*.06+fine*.15)+gleam*[1,.85,.65][k]);
  }
  setPixel(ctx,x,y,color);
 }
 const rng=random(seed+1111);for(let i=0;i<240;i++){const u=rng(),shore=.79+.045*Math.sin(u*4.8+seed%7),y=(shore-.028-.012*Math.sin(u*13+fbm(u*8,1,seed)*4)+(rng()-.5)*.013)*h;blendGaussian(ctx,u*w,y,(.5+rng()*2.5)*w/1024,(.4+rng()*.7)*h/768,[.80,.82,.77],.12+rng()*.3);}
 ctx.gaussians+=t.gaussianBasisSamples;
}
function forestTree(ctx,o){
 const rng=random(o.seed),cx=o.x*ctx.w,top=(o.y-o.height/2)*ctx.h,bottom=(o.y+o.height/2)*ctx.h,height=o.height*ctx.h,width=o.width*ctx.w,trunkW=Math.max(1,width*.22),color=toRGB(o.color),fog=clamp(ctx.scene.environment.fog*(1-o.depth)*1.1,0,.8),haze=[.20,.28,.20];
 // A tapered image-plane trunk with stable bark grooves and shared illumination.
 for(let y=Math.max(0,Math.floor(top));y<Math.min(ctx.h,bottom);y++){
  const v=clamp((y-top)/height,0,1),bend=Math.sin(v*2.7+o.seed%7)*width*.06,half=trunkW*(.18+.32*v);
  for(let x=Math.max(0,Math.floor(cx+bend-half-1));x<Math.min(ctx.w,cx+bend+half+1);x++){
   const u=(x-cx-bend)/Math.max(1,half),a=clamp((1-Math.abs(u))*half+.5,0,1),grain=fbm(u*12,v*65,o.seed,3),groove=Math.sin(u*24+grain*7)*.012,lit=.54+.24*Math.max(0,-u*ctx.L[0]);
   const c=[.11,.082,.049].map((c,k)=>mix(c*(lit+grain*.34)+groove,haze[k],fog));setPixel(ctx,x,y,c,a);
  }
 }
 const branches=8;for(let i=0;i<branches;i++){const v=.12+i*.065,by=top+height*v,side=i%2?1:-1,ex=cx+side*width*(.35+.25*rng()),ey=by-height*(.06+.04*rng());stroke(ctx,cx,by,ex,ey,Math.max(1,trunkW*(.07+.07*rng())),[.055,.054,.029].map((c,k)=>mix(c,haze[k],fog)));
  for(let j=0;j<11;j++){const q=rng(),px=mix(cx,ex,q)+(rng()-.5)*width*.18,py=mix(by,ey,q)+(rng()-.5)*height*.06,shade=.65+.65*rng(),leafColor=color.map((c,k)=>mix(c*shade,haze[k],fog));blendGaussian(ctx,px,py,Math.max(1,width*(.035+.04*rng())),Math.max(1,height*(.006+.005*rng())),leafColor,.72,(rng()-.5)*1.4);for(let leaf=0;leaf<5;leaf++)blendGaussian(ctx,px+(rng()-.5)*width*.13,py+(rng()-.5)*height*.02,Math.max(.55,width*.012),Math.max(.45,height*.0019),leafColor.map(c=>c*(.75+rng()*.5)),.8,(rng()-.5)*2);}
 }
}
function forest(ctx){
 const{w,h,scene:s}=ctx,seed=s.seed,hor=s.environment.horizon,ground=toRGB(s.environment.groundColor),t=texture(seed+443,'landscape',ctx.model,.7);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w+(ctx.camera.panX||0)*.3,v=y/h+(ctx.camera.panY||0)*.3,n=fbm(u*12,v*12,seed,4),fine=tex(t,u*260,v*260),p=(y*w+x)*3;
  if(v<hor){const glow=Math.exp(-((u-.47)**2/.07+(v-.34)**2/.16));for(let k=0;k<3;k++)ctx.buf[p+k]=[.09,.16,.09][k]+glow*[.16,.20,.11][k]+n*.025;}
  else{const z=(v-hor)/Math.max(.01,1-hor),center=.47+.055*Math.sin(z*3),pathWidth=.018+z*.22,distance=Math.abs(u-center),pathway=1-smooth(pathWidth*.85,pathWidth,distance),leaf=(noise(u*190,v*180,seed+44)-.5)*.018;
   const distanceFog=1-smooth(hor,hor+.17,v),glow=Math.exp(-((u-.47)**2/.07+(hor-.34)**2/.16));
   for(let k=0;k<3;k++){const floor=mix(ground[k]*(.32+n*.13)+[.025,.027,.011][k]+fine*.05,[.19,.145,.08][k]*(.50+.40*z),pathway)+leaf,far=[.09,.16,.09][k]+glow*[.16,.20,.11][k];ctx.buf[p+k]=mix(floor,far,distanceFog);}
  }
 }
 const rng=random(seed+748);for(let layer=0;layer<3;layer++){const depth=.12+layer*.18,count=18-layer*3;for(let i=0;i<count;i++){let x=(i+rng())/count;if(Math.abs(x-.48)<.04+layer*.01)continue;const height=.55+layer*.16+rng()*.2,y=hor+.04+layer*.055-height/2;forestTree(ctx,{id:'forest.background.'+layer+'.'+i,x:x-(ctx.camera.panX||0)*(.25+.75*depth),y:y-(ctx.camera.panY||0)*(.25+.75*depth),width:.025+layer*.012,height,color:[45,79,37],depth,seed:hash(seed+i+layer*129)});}}
 // Visible mist shafts are Gaussian image-plane illumination functions.
 const angle=(.15+ctx.L[0]*.25);for(let i=0;i<4;i++)blendGaussian(ctx,w*(.48+i*.055),h*.40,w*(.006+i*.002),h*.43,[.54,.61,.39],.035+s.environment.fog*.055,angle);
 ctx.gaussians+=t.gaussianBasisSamples;
}

function renderScene(raw,options={}){
 const start=Date.now(),scene=normalizeScene(raw),w=options.width??scene.width,h=options.height??scene.height;if(!Number.isInteger(w)||!Number.isInteger(h)||w<64||h<64||w*h>4194304)throw new Error('Invalid render size.');
 const camera={...scene.camera,...(options.camera||{})},time=clamp(Number(options.time)||0,0,1);
 for(const[k,a,b]of[['panX',-.12,.12],['panY',-.12,.12],['zoom',.8,1.3]])if(!num(camera[k],a,b))throw new Error('Invalid render camera '+k);
 if(options.motion){camera.panX=clamp((camera.panX||0)+Math.sin(time*Math.PI*2)*.035,-.12,.12);camera.panY=clamp((camera.panY||0)+Math.sin(time*Math.PI)*.012,-.12,.12);camera.zoom=clamp((camera.zoom||1)+time*.035,.8,1.3);}
 const objects=resolveObjects(scene,camera),ctx={w,h,scene,camera,objects,buf:new Float32Array(w*h*3),model:Object.hasOwn(options,'model')?options.model:(scene.appearanceModel??null),L:lightVector(scene.light),gaussians:0};base(ctx);
 if(scene.category==='landscape'&&scene.environment.terrain==='alpine'){
  for(const o of objects)if(o.visible&&o.type==='ridge')ridgeObject(ctx,o);
  // Mid-distance forest is an explicit seeded population, not copied pixels.
  const rng=random(scene.seed+811);for(let i=0;i<145;i++){const x=(i+rng())/144,hh=.014+.045*rng(),bank=scene.environment.horizon-.008-.018*Math.sin(x*7+2)**2;treeObject(ctx,{id:'generated.forest.'+i,type:'tree',x,y:bank-hh*.5,width:hh*.28,height:hh,color:[36,63,49],depth:.42,seed:hash(scene.seed+i+191)});}
  for(const o of objects)if(o.visible&&o.type==='tree'&&o.depth<.7)treeObject(ctx,o);
  water(ctx);shoreline(ctx);
 }
 if(scene.category==='landscape'&&scene.environment.terrain==='coast')coast(ctx);
 if(scene.category==='landscape'&&scene.environment.terrain==='forest')forest(ctx);
 for(const o of objects){if(!o.visible)continue;if(scene.category==='landscape'&&scene.environment.terrain==='alpine'&&(o.type==='ridge'||o.type==='tree'&&o.depth<.7))continue;
  if(['apple','pear','orange'].includes(o.type))fruitObject(ctx,o);else if(o.type==='vase')vaseObject(ctx,o);else if(o.type==='window')windowObject(ctx,o);else if(o.type==='pole')poleObject(ctx,o);else if(o.type==='signal')signalObject(ctx,o);else if(o.type==='tree'){if(scene.environment.terrain==='forest')forestTree(ctx,o);else treeObject(ctx,o);}else if(o.type==='rock')rockObject(ctx,o);else if(o.type==='ridge')ridgeObject(ctx,o);
 }
 const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){for(let k=0;k<3;k++)data[i*4+k]=byte(ctx.buf[i*3+k]);data[i*4+3]=255;}
 return{width:w,height:h,data,diagnostics:{engine:'CRF09',schema:GENERATIVE_SCHEMA09,renderer:'analytic_image_plane_plus_sampled_gaussian_fields',colorSpace:'linear_srgb_illumination_then_srgb8',gaussianBasisEvaluations:ctx.gaussians,semanticObjects:objects.filter(x=>x.visible).length,learnedModel:ctx.model?.id||null,learnedSources:ctx.model?.sourceCount||0,time,elapsedMs:Date.now()-start,sourceImageBlit:false,embeddedPixelResidual:false,meshUsed:false,cameraMode:'depth_layer_parallax_with_analytic_inferred_shapes',realWorldReconstructionClaim:false,photorealQualityGate:'not_evaluated'}};
}
function generateExamples(model){
 const specs=[
  {id:'facade-golden',title:'暖光墙面与行人信号灯',category:'architecture',seed:19091},
  {id:'facade-blue',title:'蓝灰墙面与午后光影',category:'architecture',seed:19092,environment:{wallColor:[115,150,166]},light:{azimuth:-68,elevation:48,warmth:.40}},
  {id:'alpine-morning',title:'晨雾山湖与针叶林',category:'landscape',seed:19093},
  {id:'alpine-dusk',title:'暮色山湖与岸边岩石',category:'landscape',seed:19094,environment:{skyColor:[189,159,145],groundColor:[75,93,95],fog:.42},light:{azimuth:-65,elevation:18,intensity:.8,warmth:.8}},
  {id:'coast-afternoon',title:'海岸浪花与湿润岩石',category:'landscape',seed:19301,environment:{terrain:'coast',horizon:.40,skyColor:[152,191,211],wallColor:[202,185,152],groundColor:[48,116,128]}},
  {id:'forest-path',title:'林间小径与薄雾光线',category:'landscape',seed:19302,environment:{terrain:'forest',fog:.40,groundColor:[89,100,58]}},
  {id:'fruit-window',title:'窗边的苹果、梨与橙子',category:'still_life',seed:19095},
  {id:'vase-oranges',title:'青釉花瓶与两只柑橘',category:'still_life',seed:19096,objects:[{id:'vase.celadon',type:'vase',x:.58,y:.49,width:.29,height:.56,color:[80,143,135],depth:.5,roughness:.23},{id:'orange.left',type:'orange',x:.32,y:.75,width:.22,height:.24,color:[226,125,29],depth:.8,roughness:.65},{id:'orange.right',type:'orange',x:.68,y:.79,width:.19,height:.21,color:[224,139,35],depth:.85,roughness:.67}]}];
 return specs.map(s=>createScene(s,model));
}
return{VERSION:'0.9.0-candidate',GENERATIVE_SCHEMA09,SCENE_SCHEMA:GENERATIVE_SCHEMA09,MODEL_SCHEMA,TYPES,CATEGORIES,TERRAINS,DEFAULTS,createScene,normalizeScene,validateScene,renderScene,render:renderScene,applyOps,extractAppearance,learnAppearance,generateExamples,gaussianBlur,linear,srgb};
});
