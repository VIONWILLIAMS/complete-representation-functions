/* CRF 0.10. Explicit image-plane Gaussians, linear-light editing/compositing.
 * Images are evaluated from fitted functions at the requested resolution. No
 * photograph, RGB atlas, pre-rendered colour raster, or neural model is read.
 * The optional observed alpha coverage is a semantic mask, not an RGB texture.
 * Pixel-footprint filtering is a Gaussian approximation to a pixel box.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRFGaussian10=api;root.CRF10Gaussian=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ASSET_SCHEMA='crf.gaussian_asset.v0.10',SCENE_SCHEMA='crf.gaussian_scene.v0.10',MAX_PIXELS=4194304,MAX_SPLATS=262144;
const copy=x=>JSON.parse(JSON.stringify(x)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const vector=(v,n,a,b)=>Array.isArray(v)&&v.length===n&&v.every(x=>finite(x,a,b));
const linear=x=>(x/=255)<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const srgb=x=>Math.floor(clamp(x<=.0031308?12.92*x:1.055*Math.max(0,x)**(1/2.4)-.055,0,1)*255+.5);
const cachedAlpha=new WeakMap();
function validateAsset(a){
 const errors=[];if(!a||typeof a!=='object')return{ok:false,errors:['Asset must be an object.']};
 if(a.schema!==ASSET_SCHEMA)errors.push('Unsupported Gaussian asset schema.');
 if(!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<1||a.height<1||a.width*a.height>MAX_PIXELS)errors.push('Invalid asset dimensions.');
 if(!vector(a.base,3,-16,16))errors.push('base must be three finite coefficients.');
 if(a.kernel?.colorSpace!==undefined&&!['linear_srgb','srgb_encoded_0_1'].includes(a.kernel.colorSpace))errors.push('Unsupported colour basis.');
 if(!Array.isArray(a.splats)||a.splats.length>MAX_SPLATS)errors.push('Invalid Gaussian budget.');
 else for(const g of a.splats){if(!Array.isArray(g)||g.length!==8||!g.every(Number.isFinite)||Math.abs(g[0])>100000||Math.abs(g[1])>100000||g[2]<.05||g[3]<.05||g[2]>10000||g[3]>10000||g.slice(5).some(x=>Math.abs(x)>256)){errors.push('Invalid Gaussian parameters.');break;}}
 if(a.alpha){let count=0;const r=a.alpha.runs;if(a.alpha.encoding!=='rle8'||!Array.isArray(r)||r.length%2||r.length>2*MAX_PIXELS)errors.push('Invalid semantic coverage.');else{for(let i=0;i<r.length;i+=2){if(!Number.isInteger(r[i])||r[i]<0||r[i]>255||!Number.isInteger(r[i+1])||r[i+1]<1){errors.push('Invalid coverage run.');break;}count+=r[i+1];}if(count!==a.width*a.height)errors.push('Coverage dimensions differ.');}}
 return{ok:errors.length===0,errors};
}
function checkObject(o,errors){
 for(const k of ['x','y'])if(o[k]!==undefined&&!finite(o[k],-100000,100000))errors.push('Invalid '+k);
 for(const k of ['scaleX','scaleY'])if(o[k]!==undefined&&!finite(o[k],.01,20))errors.push('Invalid '+k);
 for(const [k,a,b]of [['rotation',-3600,3600],['opacity',0,1],['zIndex',-10000,10000],['exposure',-4,4]])if(o[k]!==undefined&&!finite(o[k],a,b))errors.push('Invalid '+k);
 if(o.visible!==undefined&&typeof o.visible!=='boolean')errors.push('Invalid visibility.');
 if(o.preserveHighlights!==undefined&&typeof o.preserveHighlights!=='boolean')errors.push('Invalid preserveHighlights.');
 if(o.albedoTint!==undefined&&!vector(o.albedoTint,3,0,4))errors.push('Invalid albedoTint multiplier.');
 if(o.illuminationGradient!==undefined&&!vector(o.illuminationGradient,2,-4,4))errors.push('Invalid illuminationGradient in EV.');
 if(o.shadow!==undefined){const s=o.shadow;if(!s||typeof s!=='object')errors.push('Invalid shadow.');else for(const[k,a,b]of [['strength',0,.9],['spread',.02,1],['dx',-1,1],['dy',-1,1],['squash',.01,.5]])if(s[k]!==undefined&&!finite(s[k],a,b))errors.push('Invalid shadow '+k);}
}
function validateScene(s){
 const errors=[];if(!s||typeof s!=='object')return{ok:false,errors:['Scene must be an object.']};
 if(s.schema!==SCENE_SCHEMA)errors.push('Unsupported Gaussian scene schema.');
 if(!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||s.width*s.height>MAX_PIXELS)errors.push('Invalid scene dimensions.');
 if(!vector(s.background,3,0,255))errors.push('Invalid sRGB background.');
 if(!s.assets||typeof s.assets!=='object'||Array.isArray(s.assets))errors.push('Missing assets.');
 else{let n=0;for(const[id,a]of Object.entries(s.assets)){if(['__proto__','constructor','prototype'].includes(id))errors.push('Forbidden asset ID.');const v=validateAsset(a);if(!v.ok)errors.push(id+': '+v.errors[0]);n+=a?.splats?.length||0;}if(n>MAX_SPLATS*4)errors.push('Scene Gaussian budget exceeded.');}
 if(!Array.isArray(s.objects)||s.objects.length>96)errors.push('Invalid object count.');
 else{const ids=new Set();for(const o of s.objects){if(!o||typeof o.id!=='string'||!o.id||ids.has(o.id)||['__proto__','constructor','prototype'].includes(o.id)){errors.push('Invalid/duplicate object ID.');continue;}ids.add(o.id);if(!Object.hasOwn(s.assets||{},o.assetId))errors.push('Unknown asset '+o.assetId);checkObject(o,errors);}}
 return{ok:!errors.length,errors:[...new Set(errors)]};
}
function checked(x,fn){const r=fn(x);if(!r.ok)throw new Error(r.errors.join(' '));}
function alphaInfo(a){
 if(cachedAlpha.has(a))return cachedAlpha.get(a);const n=a.width*a.height,alpha=new Uint8Array(n);let at=0;
 if(!a.alpha)alpha.fill(255);else for(let i=0;i<a.alpha.runs.length;i+=2){alpha.fill(a.alpha.runs[i],at,at+a.alpha.runs[i+1]);at+=a.alpha.runs[i+1];}
 let x0=a.width,y0=a.height,x1=-1,y1=-1;for(let i=0;i<n;i++)if(alpha[i]){const x=i%a.width,y=(i/a.width)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 const out={alpha,bounds:x1<0?null:[x0,y0,x1+1,y1+1]};cachedAlpha.set(a,out);return out;
}
function sampleAlpha(alpha,w,h,u,v){
 // u,v are coordinates of a sample in the original pixel-centre convention.
 u-=.5;v-=.5;const x=Math.floor(u),y=Math.floor(v),fx=u-x,fy=v-y;let a=0;
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x+i,yy=y+j;if(xx>=0&&yy>=0&&xx<w&&yy<h)a+=alpha[yy*w+xx]*(i?fx:1-fx)*(j?fy:1-fy);}
 return a/255;
}
function multiply(A,B){return[A[0]*B[0]+A[2]*B[1],A[1]*B[0]+A[3]*B[1],A[0]*B[2]+A[2]*B[3],A[1]*B[2]+A[3]*B[3],A[0]*B[4]+A[2]*B[5]+A[4],A[1]*B[4]+A[3]*B[5]+A[5]];}
function inverse(M){const d=M[0]*M[3]-M[1]*M[2];return[M[3]/d,-M[1]/d,-M[2]/d,M[0]/d,(M[2]*M[5]-M[3]*M[4])/d,(M[1]*M[4]-M[0]*M[5])/d];}
function point(M,x,y){return[M[0]*x+M[2]*y+M[4],M[1]*x+M[3]*y+M[5]];}
function bounds(M,a,w,h){const p=[[0,0],[a.width,0],[0,a.height],[a.width,a.height]].map(q=>point(M,...q));return[Math.max(0,Math.floor(Math.min(...p.map(q=>q[0]))-1)),Math.max(0,Math.floor(Math.min(...p.map(q=>q[1]))-1)),Math.min(w-1,Math.ceil(Math.max(...p.map(q=>q[0]))+1)),Math.min(h-1,Math.ceil(Math.max(...p.map(q=>q[1]))+1))];}
function viewport(s,w,h,t={}){
 const z=t.zoom??1,r=(t.rotation||0)*Math.PI/180,c=Math.cos(r),sn=Math.sin(r);
 if(!finite(z,.01,20)||!finite(t.panX??0,-4,4)||!finite(t.panY??0,-4,4)||!finite(t.rotation??0,-3600,3600))throw new Error('Invalid 2D viewport.');
 const A=[c*z,sn*z,-sn*z,c*z,0,0];A[4]=s.width*.5+(t.panX||0)*s.width-A[0]*s.width*.5-A[2]*s.height*.5;A[5]=s.height*.5+(t.panY||0)*s.height-A[1]*s.width*.5-A[3]*s.height*.5;
 return multiply([w/s.width,0,0,h/s.height,0,0],A);
}
function objectMatrix(o,a,V){const r=(o.rotation||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),sx=o.scaleX??1,sy=o.scaleY??1;const A=[c*sx,s*sx,-s*sy,c*sy,0,0];A[4]=(o.x||0)+a.width*sx/2-A[0]*a.width/2-A[2]*a.height/2;A[5]=(o.y||0)+a.height*sy/2-A[1]*a.width/2-A[3]*a.height/2;return multiply(V,A);}
function splat(g,M,w,h,target,filter){
 const [cx,cy]=point(M,g[0],g[1]),co=Math.cos(g[4]),si=Math.sin(g[4]);
 const ax=(M[0]*co+M[2]*si)*g[2],ay=(M[1]*co+M[3]*si)*g[2],bx=(-M[0]*si+M[2]*co)*g[3],by=(-M[1]*si+M[3]*co)*g[3];
 const a0=ax*ax+bx*bx,b0=ax*ay+bx*by,d0=ay*ay+by*by,det0=Math.max(1e-16,a0*d0-b0*b0),f=filter==='mip'?1/12:0;
 const a=a0+f,b=b0,d=d0+f,det=a*d-b*b,gain=Math.sqrt(det0/det),ia=d/det,ib=-b/det,id=a/det;
 const rx=4*Math.sqrt(a),ry=4*Math.sqrt(d),x0=Math.max(0,Math.ceil(cx-rx-.5)),x1=Math.min(w-1,Math.floor(cx+rx-.5)),y0=Math.max(0,Math.ceil(cy-ry-.5)),y1=Math.min(h-1,Math.floor(cy+ry-.5));let evaluated=0;
 for(let y=y0;y<=y1;y++){const dy=y+.5-cy;for(let x=x0;x<=x1;x++){const dx=x+.5-cx,q=ia*dx*dx+2*ib*dx*dy+id*dy*dy;if(q>16)continue;const k=gain*Math.exp(-.5*q),p=(y*w+x)*3;target[p]+=g[5]*k;target[p+1]+=g[6]*k;target[p+2]+=g[7]*k;evaluated++;}}
 return evaluated;
}
function renderScene(scene,options={}){
 checked(scene,validateScene);const started=Date.now(),w=options.width??scene.width,h=options.height??scene.height;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>MAX_PIXELS)throw new Error('Invalid output dimensions.');
 const filter=options.filter??'mip';if(!['mip','point'].includes(filter))throw new Error('Unsupported pixel filter.');
 const n=w*h,out=new Float64Array(n*3),background=scene.background.map(linear),coverage=options.coverage?{}:null,V=viewport(scene,w,h,options.transform);
 for(let i=0;i<n;i++){out[3*i]=background[0];out[3*i+1]=background[1];out[3*i+2]=background[2];}
 const global=options.edits||{},globalErrors=[];checkObject(global,globalErrors);if(globalErrors.length)throw new Error(globalErrors.join(' '));let evaluationCount=0,gaussianCount=0,visibleObjects=0,assetAlpha=null;
 const objects=scene.objects.map((o,i)=>({o:{...o,...(global.groups?.[o.id]||{})},i})).sort((a,b)=>(a.o.zIndex||0)-(b.o.zIndex||0)||a.i-b.i);
 for(const{ o }of objects){
  const errors=[];checkObject(o,errors);if(errors.length)throw new Error(errors.join(' '));if(o.visible===false||(o.opacity??1)===0)continue;
  const asset=scene.assets[o.assetId],info=alphaInfo(asset);if(!info.bounds)continue;visibleObjects++;
  const M=objectMatrix(o,asset,V),inv=inverse(M),roi=bounds(M,asset,w,h),field=new Float64Array(n*3),ap=new Float32Array(n);
  const pixelFootprint=Math.max(Math.hypot(inv[0],inv[1]),Math.hypot(inv[2],inv[3]));
  const samples=filter==='mip'&&pixelFootprint>1.2?Math.min(4,Math.ceil(pixelFootprint)):1;
  for(let y=roi[1];y<=roi[3];y++)for(let x=roi[0];x<=roi[2];x++){
   const p=y*w+x,[u,v]=point(inv,x+.5,y+.5);let a=0;
   if(samples===1)a=sampleAlpha(info.alpha,asset.width,asset.height,u,v);
   else for(let yy=0;yy<samples;yy++)for(let xx=0;xx<samples;xx++){const[q,r]=point(inv,x+(xx+.5)/samples,y+(yy+.5)/samples);a+=sampleAlpha(info.alpha,asset.width,asset.height,q,r)/(samples*samples);}
   ap[p]=a*(o.opacity??1);field[3*p]=asset.base[0];field[3*p+1]=asset.base[1];field[3*p+2]=asset.base[2];
  }
  for(const g of asset.splats)evaluationCount+=splat(g,M,w,h,field,filter);gaussianCount+=asset.splats.length;
  if(o.shadow&&(o.shadow.strength??.35)>0){
   const b=info.bounds,bw=b[2]-b[0],bh=b[3]-b[1],s=o.shadow,spread=s.spread??.3,squash=s.squash??.08;
   const p=[(b[0]+b[2])/2+(s.dx??.08)*bw,b[3]+(s.dy??0)*bh,Math.max(.5,bw*spread),Math.max(.4,bh*squash),0,1,0,0],sf=new Float64Array(n*3);
   splat(p,M,w,h,sf,filter);const strength=s.strength??.35;
   for(let i=0;i<n;i++){const shade=1-clamp(sf[3*i]*strength,0,.9);out[3*i]*=shade;out[3*i+1]*=shade;out[3*i+2]*=shade;}
  }
  const gain=2**((o.exposure||0)+(global.exposure||0)),tint=o.albedoTint||[1,1,1],gt=global.albedoTint||[1,1,1],grad=o.illuminationGradient||[0,0],gg=global.illuminationGradient||[0,0],keepHighlights=o.preserveHighlights??global.preserveHighlights??false,encoded=asset.kernel?.colorSpace==='srgb_encoded_0_1';
  if(coverage)coverage[o.id]=new Float32Array(n);
  for(let y=roi[1];y<=roi[3];y++)for(let x=roi[0];x<=roi[2];x++){const p=y*w+x,a=ap[p];if(a<=0)continue;const[u,v]=point(inv,x+.5,y+.5),illum=2**((grad[0]+gg[0])*(u/asset.width-.5)+(grad[1]+gg[1])*(v/asset.height-.5));
   // A deterministic, optional specular-like residual, not inverse rendering.
   // Bright neutral material can also satisfy this rule; provenance says so.
   const neutralRaw=Math.max(0,Math.min(field[3*p],field[3*p+1],field[3*p+2])),neutral=encoded?linear(clamp(neutralRaw,0,1)*255):neutralRaw,t=clamp((neutral-.25)/.55,0,1),highlight=keepHighlights?neutral*t*t*(3-2*t):0;
   for(let k=0;k<3;k++){const radiance=encoded?linear(clamp(field[3*p+k],0,1)*255):field[3*p+k],material=(radiance-highlight)*tint[k]*gt[k]+highlight;out[3*p+k]=clamp(material*gain*illum,0,8)*a+out[3*p+k]*(1-a);}if(coverage){for(const[id,cov]of Object.entries(coverage))if(id!==o.id)cov[p]*=1-a;coverage[o.id][p]=a;}}
  if(options._preserveAssetAlpha)assetAlpha=ap;
  options.onProgress?.({phase:'direct_gaussian_render',objectId:o.id,objects:visibleObjects});
 }
 const data=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++){const a=assetAlpha?assetAlpha[i]:1;for(let k=0;k<3;k++)data[4*i+k]=srgb(assetAlpha?(a>0?(out[3*i+k]-background[k]*(1-a))/a:0):out[3*i+k]);data[4*i+3]=Math.floor(a*255+.5);}
 return{width:w,height:h,data,...(coverage?{objectCoverage:coverage}:{}),diagnostics:{engine:'CRF10Gaussian',renderer:'direct_affine_anisotropic_gaussians',colorSpace:'linear_srgb_composite_then_srgb8',basisColorSpaces:[...new Set(Object.values(scene.assets).map(a=>a.kernel?.colorSpace||'linear_srgb'))],filter,pixelFilterVariance:filter==='mip'?1/12:0,gaussians:gaussianCount,basisEvaluations:evaluationCount,visibleObjects,elapsedMs:Date.now()-started,sourceRGBBlit:false,colourRasterResampling:false,neuralModelTraining:false,referenceConditioned:true,geometry:'image_plane_affine',physicalRelighting:false,editingModel:'multiplicative_albedo_and_low_frequency_illumination_approximation',highlightSeparation:'optional_neutral_bright_residual_heuristic_not_inverse_rendering',alphaFiltering:'separate_coverage_footprint_then_linear_float_composite',coverageSemantics:coverage?'visible_alpha_contribution':null}};
}
function render(asset,options={}){
 checked(asset,validateAsset);const id=asset.id||'image';const scene={schema:SCENE_SCHEMA,width:asset.width,height:asset.height,background:options.background||[0,0,0],assets:{image:asset},objects:[{id,assetId:'image',x:0,y:0}]};
 return renderScene(scene,{...options,_preserveAssetAlpha:options.preserveAlpha!==false});
}
function applyOps(scene,ops){
 checked(scene,validateScene);if(!Array.isArray(ops)||ops.length>100)throw new Error('Invalid operation count.');const next={...scene,objects:scene.objects.map(copy)},allowed=new Set(['label','x','y','scaleX','scaleY','rotation','opacity','visible','zIndex','exposure','albedoTint','illuminationGradient','preserveHighlights','shadow','assetId']);
 for(const op of ops){const i=next.objects.findIndex(o=>o.id===op.id);if(op.op==='add'){next.objects.push(copy(op.object));continue;}if(i<0)throw new Error('Unknown object '+op.id);if(op.op==='remove'){next.objects.splice(i,1);continue;}if(!['set','update'].includes(op.op))throw new Error('Unsupported operation.');const values=op.values||op.patch||(op.key?{[op.key]:op.value}:{});for(const[k,v]of Object.entries(values)){if(!allowed.has(k))throw new Error('Unsupported property '+k);next.objects[i][k]=copy(v);}}
 next.revision=(scene.revision||0)+1;checked(next,validateScene);return next;
}
function calculateMetrics(a,b,mask){if(a.width!==b.width||a.height!==b.height)throw new Error('Metric dimensions differ.');let n=0,sum=0,sq=0,max=0,exact=0;for(let i=0;i<a.width*a.height;i++){if(mask&&!mask[i])continue;n++;let same=true;for(let k=0;k<3;k++){const d=Math.abs(a.data[i*4+k]-b.data[i*4+k]);sum+=d;sq+=d*d;max=Math.max(max,d);same&&=d===0;}exact+=+same;}const mse=n?sq/(n*3):0;return{mae:n?sum/(n*3):0,rmse:Math.sqrt(mse),psnr:mse?10*Math.log10(65025/mse):null,maxError:max,exactRGBFraction:n?exact/n:1,evaluatedPixels:n};}
function importLegacyAsset(old){
 if(old?.schema!=='crf.gaussian_asset.v0.8')throw new Error('Expected a CRF 0.8 Gaussian function asset.');
 const a={schema:ASSET_SCHEMA,id:old.id,width:old.width,height:old.height,base:old.base.map(x=>x/255),splats:old.splats.map(g=>{if(g[2]**2<1/12+.0025||g[3]**2<1/12+.0025)throw new Error('Legacy covariance is too narrow for exact footprint conversion.');const sx=Math.sqrt(g[2]**2-1/12),sy=Math.sqrt(g[3]**2-1/12),gain=sx*sy/(g[2]*g[3]);return[g[0],g[1],sx,sy,g[4],g[5]/255/gain,g[6]/255/gain,g[7]/255/gain];}),...(old.alpha?{alpha:copy(old.alpha)}:{}),kernel:{type:'signed_additive_anisotropic_gaussian',colorSpace:'srgb_encoded_0_1',sample:'gaussian_pixel_box_approximation',pixelVariance:1/12},provenance:{...old.provenance,sourceRGBEmbedded:false,losslessResidualEmbedded:false,neuralModelTraining:false,algorithm:'legacy_observation_coefficients_with_exact_covariance_conversion',compatibility:'identity_mip_native_samples_preserved',illumination:'inherited_from_observation',filteringLimit:'encoded_colour_basis_is_not_linear_radiance_integration'},fit:copy(old.fit||{})};checked(a,validateAsset);return a;
}
async function fitImage(image,options={}){
 // The browser reuses the existing numerical optimizer, with full-precision
 // linear-light inputs. Its point-sampled Gaussians are converted analytically
 // to our pixel-filtered representation; no RGB raster remains in the asset.
 const previous=typeof globalThis!=='undefined'?globalThis.CRF08:null;
 const fitter=previous||(typeof require==='function'?require('./crf-gaussian08.js'):null);
 if(!fitter?.fitImage)throw new Error('Load crf-gaussian08.js for browser parameter fitting.');
 const {width,height,data}=image;if(!data||data.length!==width*height*4)throw new Error('Invalid image data.');
 const radiance=new Float64Array(data.length);for(let i=0;i<width*height;i++){for(let k=0;k<3;k++)radiance[4*i+k]=linear(data[4*i+k])*255;radiance[4*i+3]=data[4*i+3];}
 const raw=await fitter.fitImage({width,height,data:radiance},{...options,budget:Math.min(options.budget||4096,16384),onProgress:p=>options.onProgress?.({...p,metricsColorSpace:'linear_rgb_scaled_255'})});
 const asset={schema:ASSET_SCHEMA,id:raw.id,width,height,base:raw.base.map(x=>x/255),splats:raw.splats.map(g=>{const sx=Math.sqrt(Math.max(.0025,g[2]**2-1/12)),sy=Math.sqrt(Math.max(.0025,g[3]**2-1/12)),gain=sx*sy/(g[2]*g[3]);return[g[0],g[1],sx,sy,g[4],g[5]/255/gain,g[6]/255/gain,g[7]/255/gain];}),...(raw.alpha?{alpha:raw.alpha}:{}),kernel:{type:'signed_additive_anisotropic_gaussian',colorSpace:'linear_srgb',sample:'gaussian_pixel_box_approximation',pixelVariance:1/12},provenance:{kind:'observed_gaussian_reconstruction',algorithm:'browser_linear_light_legacy_optimizer_with_exact_footprint_conversion',sourceRGBEmbedded:false,losslessResidualEmbedded:false,neuralModelTraining:false,optimizationScope:'this_observation_only',illumination:'inherited_from_observation'},fit:{...raw.fit,configuration:'browser_preview_optimizer_not_offline_structure_irls'}};
 checked(asset,validateAsset);asset.fit.finalDisplayMetrics=calculateMetrics(image,render(asset),alphaInfo(asset).alpha);return asset;
}
return{VERSION:'0.10.0',ASSET_SCHEMA,SCENE_SCHEMA,validateAsset,validateScene,render,renderAsset:render,renderScene,applyOps,fitImage,fit:fitImage,importLegacyAsset,calculateMetrics,compare:calculateMetrics,linear,srgb,alphaArray:asset=>alphaInfo(asset).alpha,clearCache:asset=>cachedAlpha.delete(asset)};
});
