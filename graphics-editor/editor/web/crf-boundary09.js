/* CRF 0.9 observed-street editing. The reference is a Gaussian field, never a photo blit.
 * Detail coefficients are explicitly disclosed observed residual Gaussians.
 * The matte and hidden facade are estimates, not recovered physical ground truth. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRFBoundary09=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='0.9.0',SCHEMA='crf.street_context.v0.9',clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),byte=v=>clamp(Math.floor(v+.5),0,255);
const toLinear=v=>{v=clamp(v,0,255)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const toSRGB=v=>{v=clamp(v,0,1);return 255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055);};
const LUT=Float64Array.from({length:256},(_,i)=>toLinear(i));
function decodeRLE(encoded,length){if(!encoded||encoded.encoding!=='rle8'||!Array.isArray(encoded.runs)||encoded.runs.length%2)throw new Error('Invalid RLE field');const out=new Uint8Array(length);let at=0;for(let i=0;i<encoded.runs.length;i+=2){const v=encoded.runs[i],n=encoded.runs[i+1];if(!Number.isInteger(v)||v<0||v>255||!Number.isInteger(n)||n<1||at+n>length)throw new Error('Invalid RLE run');out.fill(v,at,at+n);at+=n;}if(at!==length)throw new Error('RLE field size mismatch');return out;}
function encodeRLE(array){const runs=[];let last=array[0],n=0;for(const v of array){if(v!==last){runs.push(last,n);last=v;n=0;}n++;}if(n)runs.push(last,n);return{encoding:'rle8',runs};}
function checkImage(image){if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.width*image.height>4200000||image.data?.length!==image.width*image.height*4)throw new Error('Invalid RGBA image');}

// Known-only surface continuation. The function never reads a masked color.
// A row preserves facade joints; vertical estimates are fallback when a row has no donors.
function fillMaskedSurface(image,known,holes,options={}){
 checkImage(image);const {width:w,height:h,data}=image,n=w*h;
 if(known.length!==n||holes.length!==n)throw new Error('Invalid completion mask');
 const result=new Float64Array(n*3),confidence=new Float32Array(n),left=new Int32Array(n),right=new Int32Array(n);left.fill(-1);right.fill(-1);
 for(let y=0;y<h;y++){let p=-1;for(let x=0;x<w;x++){const i=y*w+x;if(known[i]&&!holes[i])p=x;left[i]=p;}p=-1;for(let x=w-1;x>=0;x--){const i=y*w+x;if(known[i]&&!holes[i])p=x;right[i]=p;}}
 let completed=0,unresolved=0,maxSpan=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(!holes[i]){if(known[i]){for(let c=0;c<3;c++)result[i*3+c]=data[i*4+c];confidence[i]=1;}continue;}
  let lx=left[i],rx=right[i],a=-1,b=-1,t=0;
  if(lx>=0&&rx>=0){a=y*w+lx;b=y*w+rx;t=(x-lx)/Math.max(1,rx-lx);confidence[i]=1/(1+(rx-lx)/96);maxSpan=Math.max(maxSpan,rx-lx);}
  else{
   let uy=y-1,dy=y+1;while(uy>=0&&(!known[uy*w+x]||holes[uy*w+x]))uy--;while(dy<h&&(!known[dy*w+x]||holes[dy*w+x]))dy++;
   if(uy>=0&&dy<h){a=uy*w+x;b=dy*w+x;t=(y-uy)/(dy-uy);confidence[i]=1/(1+(dy-uy)/64);}
   else if(lx>=0||rx>=0){a=b=y*w+(lx>=0?lx:rx);confidence[i]=.15;}
   else if(uy>=0||dy<h){a=b=(uy>=0?uy:dy)*w+x;confidence[i]=.1;}
  }
  if(a<0){unresolved++;continue;}
  // Average a short visible donor strip rather than stretching one noisy pixel
  // into a horizontal line. Use donor-centroid coordinates to retain gradients.
  if(lx>=0&&rx>=0){
   const av=[0,0,0],bv=[0,0,0];let an=0,bn=0,ax=0,bx=0;
   for(let k=0;k<7;k++){const xa=lx-k,xb=rx+k;
    if(xa>=0){const j=y*w+xa;if(known[j]&&!holes[j]){an++;ax+=xa;for(let c=0;c<3;c++)av[c]+=data[4*j+c];}}
    if(xb<w){const j=y*w+xb;if(known[j]&&!holes[j]){bn++;bx+=xb;for(let c=0;c<3;c++)bv[c]+=data[4*j+c];}}
   }
   ax/=an;bx/=bn;t=(x-ax)/Math.max(1,bx-ax);for(let c=0;c<3;c++)result[i*3+c]=(1-t)*av[c]/an+t*bv[c]/bn;
  }else for(let c=0;c<3;c++)result[i*3+c]=(1-t)*data[a*4+c]+t*data[b*4+c];completed++;
 }
 // Interpolating noisy endpoint rows alone produces horizontal streaks. Separate
 // low-frequency continuation from fresh deterministic plaster microstructure.
 const raw=new Float64Array(result),variance=[0,0,0];let count=0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!known[i]||holes[i]||!known[i+1]||holes[i+1])continue;let good=true;for(let c=0;c<3;c++)if(Math.abs(data[4*i+c]-data[4*(i+1)+c])>18)good=false;if(!good)continue;count++;for(let c=0;c<3;c++){const d=data[4*i+c]-data[4*(i+1)+c];variance[c]+=d*d/2;}}
 const textureSigma=variance.map(v=>clamp(Math.sqrt(v/Math.max(1,count)),0,5));
 function random(x,y,k){let q=(Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^Math.imul(k+1,1274126177)^91317)>>>0;q=Math.imul(q^(q>>>13),1274126177);return((q^(q>>>16))>>>0)/4294967296;}
 function gaussianNoise(x,y,k){const a=Math.max(1e-8,random(x,y,k)),b=random(x+419,y-53,k+71);return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b);}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!holes[i]||!confidence[i])continue;const u=Math.max(0,y-1)*w+x,d=Math.min(h-1,y+1)*w+x,sharp=[0,1,2].some(c=>Math.abs(raw[i*3+c]-.5*(raw[u*3+c]+raw[d*3+c]))>6);
  const common=gaussianNoise(x,y,0),fade=left[i]>=0&&right[i]>=0?clamp(Math.min(x-left[i],right[i]-x)/3,0,1):1;
  for(let c=0;c<3;c++){let value=raw[i*3+c];if(!sharp){let sum=0,total=0;for(let k=-3;k<=3;k++){const yy=y+k;if(yy<0||yy>=h)continue;const j=yy*w+x;if(!holes[j]&&!known[j])continue;if(Math.abs(raw[j*3+c]-raw[i*3+c])>14)continue;const weight=Math.exp(-k*k/5);sum+=raw[j*3+c]*weight;total+=weight;}if(total)value=sum/total;}
   // An unseen noise phase is not recoverable. Shrink sampled texture toward
   // the context mean as donor confidence falls instead of adding full noise
   // variance to an already uncertain estimate. This is a disclosed heuristic,
   // not a calibrated probabilistic posterior or hidden ground-truth recovery.
   const noise=(.94*common+.34*gaussianNoise(x,y,c+1))/Math.sqrt(.94*.94+.34*.34);result[i*3+c]=clamp(value+noise*textureSigma[c]*fade*confidence[i],0,255);
  }
 }
 return{width:w,height:h,values:result,confidence,completed,unresolved,maxSpan,textureSigma,textureAmplitude:'visible sigma × donor confidence × boundary fade; heuristic uncertainty shrinkage',method:'known-only structure-aware row continuation plus confidence-shrunk deterministic microtexture',hiddenGroundTruthUsed:false};
}

function applyDetail(baseline,detail){
 checkImage(baseline);if(!detail||detail.schema!=='crf.gaussian_detail.v0.9'||detail.width!==baseline.width||detail.height!==baseline.height||!Array.isArray(detail.coefficients))throw new Error('Invalid observed Gaussian detail');
 const data=new Uint8ClampedArray(baseline.data),n=baseline.width*baseline.height;
 for(const row of detail.coefficients){if(!Array.isArray(row)||row.length!==4||!Number.isInteger(row[0])||row[0]<0||row[0]>=n||!row.slice(1).every(Number.isFinite))throw new Error('Invalid detail Gaussian');const p=row[0]*4;for(let c=0;c<3;c++)data[p+c]=byte(data[p+c]+row[c+1]);}
 // sigma=.12, cutoff=4: only its own pixel centre lies within support, exp(0)=1.
 return{width:baseline.width,height:baseline.height,data};
}

function recolorSurface(rgb,target,amount=1){
 const linear=rgb.map(v=>toLinear(v)),color=target.map(v=>toLinear(v));
 const lum=.2126*linear[0]+.7152*linear[1]+.0722*linear[2],tl=Math.max(.015,.2126*color[0]+.7152*color[1]+.0722*color[2]);
 const gain=lum/tl;
 return linear.map((v,c)=>toSRGB(v*(1-amount)+clamp(color[c]*gain,0,1)*amount));
}

// Background replacement in a declared composition domain. Encoded mixing is
// supported for legacy observed mattes; linear is used for controlled fixtures.
function replaceBackground(composite,before,after,backgroundFraction,domain='linear'){
 if(!Number.isFinite(backgroundFraction)||backgroundFraction<0||backgroundFraction>1)throw new Error('Invalid background fraction');
 if(domain!=='linear'&&domain!=='srgb')throw new Error('Unknown mixture color domain');
 return composite.map((v,c)=>domain==='linear'?toSRGB(toLinear(v)+backgroundFraction*(toLinear(after[c])-toLinear(before[c]))):clamp(v+backgroundFraction*(after[c]-before[c]),0,255));
}

function estimateBackgroundFraction(composite,foreground,background,domain='srgb'){
 if(![composite,foreground,background].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)))throw new Error('Three finite RGB triples required');
 const conv=domain==='linear'?toLinear:v=>v;let dot=0,den=0;
 for(let c=0;c<3;c++){const d=conv(background[c])-conv(foreground[c]);dot+=(conv(composite[c])-conv(foreground[c]))*d;den+=d*d;}
 if(den<1e-12)return{fraction:0,identifiable:false};
 return{fraction:clamp(dot/den,0,1),identifiable:true};
}

function prepareStreet({baseline,context,detail}){
 checkImage(baseline);if(context?.schema!==SCHEMA||context.width!==baseline.width||context.height!==baseline.height)throw new Error('Street context does not match Gaussian baseline');
 const image=detail?applyDetail(baseline,detail):{...baseline,data:new Uint8ClampedArray(baseline.data)},n=image.width*image.height;
 const labels=decodeRLE(context.labels,n),beta=decodeRLE(context.backgroundFraction,n),wall=new Uint8Array(n),holes=new Uint8Array(n),signalMask=new Uint8Array(n),attachmentMask=new Uint8Array(n);
 for(let i=0;i<n;i++){wall[i]=labels[i]===0?1:0;signalMask[i]=labels[i]===9?1:0;const y=Math.floor(i/image.width),x=i%image.width;attachmentMask[i]=(labels[i]===8&&y>=393&&x>=285)?1:0;holes[i]=(signalMask[i]||attachmentMask[i]||beta[i]>0&&!wall[i])?1:0;}
 const completion=fillMaskedSurface(image,wall,holes);
 const background=new Float64Array(n*3);for(let i=0;i<n;i++)for(let c=0;c<3;c++)background[3*i+c]=wall[i]?image.data[4*i+c]:completion.values[3*i+c];
 // Hidden pixels are themselves evaluated as compact, pixel-centred Gaussians.
 // These coefficients are generated from visible context, never observed behind the lamp.
 const inferredGaussians=[];for(let i=0;i<n;i++)if(signalMask[i]||attachmentMask[i])inferredGaussians.push([i%image.width+.5,Math.floor(i/image.width)+.5,.12,.12,0,...background.slice(i*3,i*3+3)]);
 return{width:image.width,height:image.height,baseline:image,context,labels,beta,wall,signalMask,attachmentMask,background,completion,inferredGaussians,detailCount:detail?.coefficients.length||0,cache:new Map(),provenance:{baseline:'v0.8 optimized observed Gaussian field',detail:detail?.provenance||null,matte:context.matte,background:'inferred known-only surface continuation; pixel-centred Gaussian coefficients',hiddenGroundTruthAvailable:false}};
}

function createState(){return{schema:'crf.street_edit.v0.9',wallColor:null,wallStrength:.78,signalVisible:true,signalOffsetX:0,signalOffsetY:0,revision:0};}
function validateState(state){if(!state||state.wallColor!==null&&(!Array.isArray(state.wallColor)||state.wallColor.length!==3||!state.wallColor.every(v=>Number.isFinite(v)&&v>=0&&v<=255)))throw new Error('Wall color must be RGB or null');if(!Number.isFinite(state.wallStrength)||state.wallStrength<0||state.wallStrength>1)throw new Error('Wall strength outside 0..1');if(typeof state.signalVisible!=='boolean')throw new Error('Signal visibility must be boolean');if(!Number.isFinite(state.signalOffsetX)||Math.abs(state.signalOffsetX)>70||!Number.isFinite(state.signalOffsetY)||Math.abs(state.signalOffsetY)>40)throw new Error('Signal movement exceeds supported observed plane');}
function applyEdit(state,patch){const next={...state};for(const [key,value]of Object.entries(patch)){if(!['wallColor','wallStrength','signalVisible','signalOffsetX','signalOffsetY'].includes(key))throw new Error('Unsupported street edit: '+key);next[key]=Array.isArray(value)?value.slice():value;}next.revision=(state.revision||0)+1;validateState(next);return next;}

function renderStreet(prepared,rawState={}){
 const state={...createState(),...rawState};validateState(state);const p=prepared,{width:w,height:h}=p,n=w*h,data=new Uint8ClampedArray(p.baseline.data),influence=new Uint8Array(n),inferred=new Uint8Array(n);
 const color=state.wallColor,amount=color?state.wallStrength:0,key=JSON.stringify([color,amount]);let changedBackground=p.cache.get(key);
 if(!changedBackground){changedBackground=new Float64Array(p.background.length);const target=amount?color.map(toLinear):[0,0,0],targetLum=Math.max(.015,.2126*target[0]+.7152*target[1]+.0722*target[2]);for(let i=0;i<n;i++){if(!p.wall[i]&&!p.beta[i]&&!p.signalMask[i]&&!p.attachmentMask[i])continue;const at=i*3;
   if(!amount){changedBackground[at]=p.background[at];changedBackground[at+1]=p.background[at+1];changedBackground[at+2]=p.background[at+2];continue;}
   const r=p.background[at],g=p.background[at+1],b=p.background[at+2],lr=Number.isInteger(r)?LUT[r]:toLinear(r),lg=Number.isInteger(g)?LUT[g]:toLinear(g),lb=Number.isInteger(b)?LUT[b]:toLinear(b),gain=(.2126*lr+.7152*lg+.0722*lb)/targetLum;
   changedBackground[at]=toSRGB(lr*(1-amount)+clamp(target[0]*gain,0,1)*amount);changedBackground[at+1]=toSRGB(lg*(1-amount)+clamp(target[1]*gain,0,1)*amount);changedBackground[at+2]=toSRGB(lb*(1-amount)+clamp(target[2]*gain,0,1)*amount);
  }p.cache.clear();p.cache.set(key,changedBackground);}
 let mixedChanged=0;
 if(amount)for(let i=0;i<n;i++){
  if(p.wall[i]){for(let c=0;c<3;c++)data[i*4+c]=byte(changedBackground[i*3+c]);influence[i]=1;}
  else if(p.beta[i]){const v=replaceBackground([data[i*4],data[i*4+1],data[i*4+2]],[p.background[i*3],p.background[i*3+1],p.background[i*3+2]],[changedBackground[i*3],changedBackground[i*3+1],changedBackground[i*3+2]],p.beta[i]/255,p.context.matte.compositionDomain);for(let c=0;c<3;c++)data[i*4+c]=byte(v[c]);influence[i]=1;mixedChanged++;}
 }
 const dx=Math.round(state.signalOffsetX),dy=Math.round(state.signalOffsetY),moved=dx!==0||dy!==0,removed=!state.signalVisible||moved;
 if(removed)for(let i=0;i<n;i++)if(p.signalMask[i]||(moved&&p.attachmentMask[i])){for(let c=0;c<3;c++)data[4*i+c]=byte(changedBackground[3*i+c]);influence[i]=1;inferred[i]=1;}
 if(state.signalVisible&&moved){
  // Relocate the observed lamp foreground, then reconnect hanger to support.
  for(let i=0;i<n;i++)if(p.signalMask[i]){const x=i%w+dx,y=Math.floor(i/w)+dy;if(x<0||y<0||x>=w||y>=h)continue;const j=y*w+x,beta=p.beta[i]/255,alpha=1-beta;
   for(let c=0;c<3;c++){const F=alpha>.02?clamp((p.baseline.data[4*i+c]-beta*p.background[3*i+c])/alpha,0,255):0;data[4*j+c]=byte(alpha*F+beta*data[4*j+c]);}influence[j]=1;}
  const segment=(x0,y0,x1,y1,radius,base)=>{const rx=Math.ceil(Math.min(x0,x1)-radius-1),ry=Math.ceil(Math.min(y0,y1)-radius-1),ex=Math.floor(Math.max(x0,x1)+radius+1),ey=Math.floor(Math.max(y0,y1)+radius+1),vx=x1-x0,vy=y1-y0,den=vx*vx+vy*vy;
   for(let y=Math.max(0,ry);y<=Math.min(h-1,ey);y++)for(let x=Math.max(0,rx);x<=Math.min(w-1,ex);x++){const t=den?clamp(((x+.5-x0)*vx+(y+.5-y0)*vy)/den,0,1):0,dist=Math.hypot(x+.5-x0-t*vx,y+.5-y0-t*vy),a=clamp(radius+.5-dist,0,1);if(!a)continue;const i=y*w+x;for(let c=0;c<3;c++){const shade=base[c]*(.65+.35*clamp((radius+1-(y+.5-y0-t*vy))/(2*radius+1),0,1));data[4*i+c]=byte(data[4*i+c]*(1-a)+shade*a);}influence[i]=1;}
  };
  const hangerX=296+dx,hangerY=405+dy,joinY=Math.min(391,hangerY-10);segment(295,388,hangerX,joinY,3.7,[169,156,115]);segment(hangerX,joinY,hangerX,hangerY,2.2,[160,145,100]);
 }
 return{width:w,height:h,data,influenceMask:influence,inferredMask:inferred,stats:{engine:'crf-boundary09',baselineGaussians:p.context.baselineGaussianCount,observedDetailGaussians:p.detailCount,mixedEdgePixels:mixedChanged,inferredGaussianCount:removed?p.inferredGaussians.length:0,hiddenGroundTruthAvailable:false,signalAttachmentRecomputed:state.signalVisible&&moved,spatialMode:'observed image plane; inferred connector on bounded translation'},state};
}

function comparePixels(a,b,mask){checkImage(a);checkImage(b);if(a.width!==b.width||a.height!==b.height)throw new Error('Image dimensions differ');let pixels=0,changed=0,sum=0,max=0;for(let i=0;i<a.width*a.height;i++){if(mask&&!mask[i])continue;pixels++;let any=false;for(let c=0;c<3;c++){const d=Math.abs(a.data[4*i+c]-b.data[4*i+c]);sum+=d;max=Math.max(max,d);if(d)any=true;}if(any)changed++;}return{pixels,changedPixels:changed,mae:pixels?sum/(pixels*3):0,maxError:max,exactRGBFraction:pixels?1-changed/pixels:1};}
async function loadStreet(options={}){
 const f=options.fetchImpl||(typeof fetch==='function'?fetch:null),G=options.gaussianEngine||(typeof globalThis!=='undefined'?globalThis.CRF08:null);if(!f||!G)throw new Error('Street loader needs fetch and CRF08 Gaussian engine');
 const base=options.baseUrl||'',read=async path=>{const r=await f(base+path);if(!r.ok)throw new Error('Street resource HTTP '+r.status);return r.json();};
 const context=await read('assets/v09/street/context.json');const [asset,detail]=await Promise.all([read(context.baselineAssetUrl),read(context.detailAssetUrl)]);const baseline=G.renderAsset(asset);return prepareStreet({baseline,context,detail});
}
return{VERSION,SCHEMA,createState,validateState,applyEdit,prepareStreet,renderStreet,loadStreet,fillMaskedSurface,replaceBackground,estimateBackgroundFraction,recolorSurface,comparePixels,decodeRLE,encodeRLE,applyDetail,toLinear,toSRGB};
});
