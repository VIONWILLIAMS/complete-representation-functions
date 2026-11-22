/* CRF 0.8 image-plane Gaussian functions. No source-image blit or RGB residual. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CRF08=api;root.CRFgaussian08=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ASSET_SCHEMA='crf.gaussian_asset.v0.8', SCENE_SCHEMA='crf.gaussian_scene.v0.8';
const MAX_PIXELS=4200000, MAX_SPLATS=262144, CUTOFF2=16;
const fieldCache=new WeakMap();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), byte=x=>clamp(Math.floor(x+.5),0,255);
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const rgb=v=>Array.isArray(v)&&v.length===3&&v.every(x=>finite(x,0,255));
const copy=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function validateAsset(a){
 const errors=[];
 if(!a||typeof a!=='object')return{ok:false,errors:['Asset must be an object.']};
 if(a.schema!==ASSET_SCHEMA)errors.push('Unknown Gaussian asset schema.');
 if(!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<1||a.height<1||a.width*a.height>MAX_PIXELS)errors.push('Invalid asset dimensions.');
 if(!rgb(a.base))errors.push('Asset base must be three finite RGB values.');
 if(!Array.isArray(a.splats)||a.splats.length>MAX_SPLATS)errors.push('Gaussian count exceeds limit.');
 else for(let i=0;i<a.splats.length;i++){const g=a.splats[i];if(!Array.isArray(g)||g.length!==8||!g.every(Number.isFinite)||Math.abs(g[0])>100000||Math.abs(g[1])>100000||g[2]<.05||g[3]<.05||g[2]>10000||g[3]>10000||g.slice(5).some(c=>Math.abs(c)>100000)){errors.push('Invalid Gaussian at index '+i);break;}}
 if(a.alpha){const ar=a.alpha;if(ar.encoding!=='rle8'||!Array.isArray(ar.runs)||ar.runs.length%2||ar.runs.length>2*MAX_PIXELS)errors.push('Invalid alpha coverage.');else{let n=0;for(let i=0;i<ar.runs.length;i+=2){if(!Number.isInteger(ar.runs[i])||ar.runs[i]<0||ar.runs[i]>255||!Number.isInteger(ar.runs[i+1])||ar.runs[i+1]<1){errors.push('Invalid alpha run.');break;}n+=ar.runs[i+1];}if(n!==a.width*a.height)errors.push('Alpha coverage size mismatch.');}}
 return{ok:!errors.length,errors};
}
function validateScene(s){
 const errors=[];
 if(!s||typeof s!=='object')return{ok:false,errors:['Scene must be an object.']};
 if(s.schema!==SCENE_SCHEMA)errors.push('Unknown Gaussian scene schema.');
 if(!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||s.width*s.height>MAX_PIXELS)errors.push('Invalid scene dimensions.');
 if(!rgb(s.background))errors.push('Scene background must be three RGB values.');
 if(!s.assets||typeof s.assets!=='object'||Array.isArray(s.assets))errors.push('Missing asset map.');
 else{let count=0;for(const [id,a] of Object.entries(s.assets)){if(['__proto__','constructor','prototype'].includes(id))errors.push('Forbidden asset ID.');const v=validateAsset(a);if(!v.ok)errors.push(id+': '+v.errors[0]);count+=Array.isArray(a?.splats)?a.splats.length:0;}if(count>MAX_SPLATS*4)errors.push('Scene total Gaussian budget exceeded.');}
 if(!Array.isArray(s.objects)||s.objects.length>96)errors.push('Scene requires at most 96 objects.');
 else{const ids=new Set();for(const o of s.objects){if(!o||typeof o.id!=='string'||ids.has(o.id)){errors.push('Object IDs must be unique.');continue;}ids.add(o.id);if(!Object.prototype.hasOwnProperty.call(s.assets||{},o.assetId))errors.push('Unknown asset: '+o.assetId);for(const k of ['x','y'])if(o[k]!==undefined&&!finite(o[k],-100000,100000))errors.push('Invalid '+k);for(const k of ['scaleX','scaleY'])if(o[k]!==undefined&&!finite(o[k],.01,20))errors.push('Invalid '+k);for(const [k,lo,hi] of [['rotation',-3600,3600],['opacity',0,1],['hue',-180,180],['exposure',-4,4],['zIndex',-10000,10000]])if(o[k]!==undefined&&!finite(o[k],lo,hi))errors.push('Invalid '+k);if(o.visible!==undefined&&typeof o.visible!=='boolean')errors.push('visible must be boolean.');}}
 return{ok:!errors.length,errors};
}
function checked(value,validate){const r=validate(value);if(!r.ok)throw new Error(r.errors.join(' '));}
function alphaArray(asset){const n=asset.width*asset.height,a=new Uint8Array(n);if(!asset.alpha){a.fill(255);return a;}let at=0;const runs=asset.alpha.runs;for(let i=0;i<runs.length;i+=2){a.fill(runs[i],at,at+runs[i+1]);at+=runs[i+1];}return a;}
function encodeAlpha(data){const runs=[];let last=data[0],count=0,all=true;for(let i=0;i<data.length;i++){const v=data[i];if(v!==255)all=false;if(v===last)count++;else{runs.push(last,count);last=v;count=1;}}if(count)runs.push(last,count);return all?undefined:{encoding:'rle8',runs};}
function visitGaussian(g,width,height,callback){
 const [cx,cy,sx,sy,theta]=g,c=Math.cos(theta),s=Math.sin(theta),rx=4*Math.sqrt(sx*sx*c*c+sy*sy*s*s),ry=4*Math.sqrt(sx*sx*s*s+sy*sy*c*c);
 const x0=Math.max(0,Math.ceil(cx-rx-.5)),x1=Math.min(width-1,Math.floor(cx+rx-.5)),y0=Math.max(0,Math.ceil(cy-ry-.5)),y1=Math.min(height-1,Math.floor(cy+ry-.5));
 for(let y=y0;y<=y1;y++){const dy=y+.5-cy;for(let x=x0;x<=x1;x++){const dx=x+.5-cx,u=(c*dx+s*dy)/sx,v=(-s*dx+c*dy)/sy,q=u*u+v*v;if(q<=CUTOFF2)callback(y*width+x,Math.exp(-.5*q));}}
}
function field(asset){
 if(fieldCache.has(asset))return fieldCache.get(asset);
 checked(asset,validateAsset);const n=asset.width*asset.height,values=new Float64Array(n*3),alpha=alphaArray(asset);
 for(let i=0;i<n;i++){values[3*i]=asset.base[0];values[3*i+1]=asset.base[1];values[3*i+2]=asset.base[2];}
 for(const g of asset.splats)visitGaussian(g,asset.width,asset.height,(i,w)=>{values[3*i]+=g[5]*w;values[3*i+1]+=g[6]*w;values[3*i+2]+=g[7]*w;});
 let xmin=asset.width,ymin=asset.height,xmax=-1,ymax=-1;
 for(let i=0;i<n;i++)if(alpha[i]){const x=i%asset.width,y=Math.floor(i/asset.width);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
 const bounds=xmax<0?null:[xmin,ymin,xmax,ymax];
 const result={values,alpha,bounds};fieldCache.set(asset,result);return result;
}
function renderAsset(asset){const {values,alpha}=field(asset),data=new Uint8ClampedArray(asset.width*asset.height*4);for(let i=0;i<alpha.length;i++){data[4*i]=byte(values[3*i]);data[4*i+1]=byte(values[3*i+1]);data[4*i+2]=byte(values[3*i+2]);data[4*i+3]=alpha[i];}return{width:asset.width,height:asset.height,data};}

function renderScene(scene,options={}){
 checked(scene,validateScene);const {width,height}=scene,n=width*height,values=new Float64Array(n*3);
 for(let i=0;i<n;i++){values[3*i]=scene.background[0];values[3*i+1]=scene.background[1];values[3*i+2]=scene.background[2];}
 const objects=scene.objects.map((o,i)=>({o,i})).sort((a,b)=>(a.o.zIndex||0)-(b.o.zIndex||0)||a.i-b.i).map(v=>v.o);
 for(let oi=0;oi<objects.length;oi++){
  const o=objects[oi];if(o.visible===false||(o.opacity??1)===0)continue;
  const a=scene.assets[o.assetId],f=field(a);if(!f.bounds)continue;
  const sx=o.scaleX??1,sy=o.scaleY??1,rad=(o.rotation||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),cx=(o.x||0)+a.width*sx/2,cy=(o.y||0)+a.height*sy/2;
  // Only nonzero semantic coverage can affect the output. Include the half-pixel
  // bilinear support, then rotate its local bounds around the full asset centre.
  const [ax0,ay0,ax1,ay1]=f.bounds,hw=(ax1-ax0+2)*sx/2,hh=(ay1-ay0+2)*sy/2,
   bx=((ax0+ax1+1)/2-a.width/2)*sx,by=((ay0+ay1+1)/2-a.height/2)*sy,
   bcx=cx+c*bx-s*by,bcy=cy+s*bx+c*by;
  const ex=Math.abs(c*hw)+Math.abs(s*hh),ey=Math.abs(s*hw)+Math.abs(c*hh),x0=Math.max(0,Math.floor(bcx-ex-1)),x1=Math.min(width-1,Math.ceil(bcx+ex+1)),y0=Math.max(0,Math.floor(bcy-ey-1)),y1=Math.min(height-1,Math.ceil(bcy+ey+1));
  const gain=2**(o.exposure||0),hue=(o.hue||0)*Math.PI/180,hc=Math.cos(hue),hs=Math.sin(hue),opacity=o.opacity??1;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const dx=x+.5-cx,dy=y+.5-cy,u=(c*dx+s*dy)/sx+a.width/2-.5,v=(-s*dx+c*dy)/sy+a.height/2-.5;
   if(u<=-1||v<=-1||u>=a.width||v>=a.height)continue;
   const ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;let ap=0,r=0,g=0,b=0;
   for(let j=0;j<2;j++)for(let k=0;k<2;k++){const xx=ix+k,yy=iy+j;if(xx<0||yy<0||xx>=a.width||yy>=a.height)continue;const p=yy*a.width+xx,w=(k?fx:1-fx)*(j?fy:1-fy)*f.alpha[p]/255;ap+=w;r+=clamp(f.values[p*3],0,255)*w;g+=clamp(f.values[p*3+1],0,255)*w;b+=clamp(f.values[p*3+2],0,255)*w;}
   if(ap<=0)continue;r/=ap;g/=ap;b/=ap;
   if(hue){const Y=.299*r+.587*g+.114*b,I=.596*r-.274*g-.322*b,Q=.211*r-.523*g+.312*b,ii=I*hc-Q*hs,qq=I*hs+Q*hc;r=Y+.956*ii+.621*qq;g=Y-.272*ii-.647*qq;b=Y-1.106*ii+1.703*qq;}
   ap*=opacity;const p=(y*width+x)*3;values[p]=clamp(r*gain,0,255)*ap+values[p]*(1-ap);values[p+1]=clamp(g*gain,0,255)*ap+values[p+1]*(1-ap);values[p+2]=clamp(b*gain,0,255)*ap+values[p+2]*(1-ap);
  }
  options.onProgress?.({phase:'render',fraction:(oi+1)/objects.length,objectId:o.id});
 }
 const data=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++){data[4*i]=byte(values[3*i]);data[4*i+1]=byte(values[3*i+1]);data[4*i+2]=byte(values[3*i+2]);data[4*i+3]=255;}
 return{width,height,data};
}
function calculateMetrics(a,b,mask){
 if(a.width!==b.width||a.height!==b.height)throw new Error('Metric dimensions differ.');
 let abs=0,sq=0,max=0,exact=0,n=0;
 for(let i=0;i<a.width*a.height;i++){if(mask&&!mask[i])continue;n++;let same=true;for(let c=0;c<3;c++){const d=Math.abs(a.data[4*i+c]-b.data[4*i+c]);abs+=d;sq+=d*d;max=Math.max(max,d);same=same&&d===0;}if(same)exact++;}
 const mse=n?sq/(n*3):0;return{mae:n?abs/(n*3):0,rmse:Math.sqrt(mse),psnr:mse?10*Math.log10(255*255/mse):null,maxError:max,exactRGBFraction:n?exact/n:1,evaluatedPixels:n,ssim:null,ssimNote:'Full Gaussian-window SSIM is reported by the offline verifier.'};
}
function applyOps(scene,ops){
 if(!Array.isArray(ops)||ops.length>96)throw new Error('Invalid operation list.');
 const next={...scene,objects:scene.objects.map(o=>({...o}))};
 const props=new Set(['label','x','y','scaleX','scaleY','rotation','opacity','visible','hue','exposure','zIndex','assetId']);
 for(const op of ops){if(!op||typeof op!=='object')throw new Error('Invalid operation.');const i=next.objects.findIndex(o=>o.id===op.id);if(op.op==='add'){if(!op.object)throw new Error('Missing object.');next.objects.push(copy(op.object));}else if(op.op==='remove'){if(i<0)throw new Error('Unknown object.');next.objects.splice(i,1);}else if(op.op==='set'||op.op==='update'){if(i<0)throw new Error('Unknown object.');const patch=op.values||op.patch||(op.key?{[op.key]:op.value}:{});for(const [key,value]of Object.entries(patch)){if(!props.has(key))throw new Error('Unsupported property: '+key);next.objects[i][key]=value;}}else throw new Error('Unsupported operation: '+op.op);}
 next.revision=(scene.revision||0)+1;checked(next,validateScene);return next;
}

async function fitImage(image,options={}){
 const {width,height,data}=image,n=width*height;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||n>MAX_PIXELS||!data||data.length!==n*4)throw new Error('Invalid image data.');
 const budget=Math.max(16,Math.min(65536,Math.floor(options.budget||4096),n)),iterations=Math.max(1,Math.min(8,Math.floor(options.iterations||3))),alpha=new Uint8Array(n),residual=new Float64Array(n*3),base=[0,0,0];let total=0,visible=0;
 for(let i=0;i<n;i++){alpha[i]=data[i*4+3];const w=alpha[i]/255;total+=w;if(w)visible++;for(let c=0;c<3;c++)base[c]+=data[4*i+c]*w;}
 if(!total)throw new Error('Image has no visible pixels.');for(let c=0;c<3;c++)base[c]/=total;
 for(let i=0;i<n;i++)for(let c=0;c<3;c++)residual[3*i+c]=data[4*i+c]-base[c];
 const splats=[],history=[],started=Date.now(),cancel=()=>{if(options.signal?.aborted)throw new Error('Fitting cancelled.');};
 const getMetrics=()=>{let err=0,ab=0,max=0;for(let i=0;i<n;i++){if(!alpha[i])continue;for(let c=0;c<3;c++){const e=residual[3*i+c];err+=e*e;ab+=Math.abs(e);max=Math.max(max,Math.abs(e));}}const mse=err/(visible*3);return{mae:ab/(visible*3),psnr:mse?10*Math.log10(65025/mse):null,maxError:max};};
 const report=(phase,fraction)=>{const item={phase,fraction,count:splats.length,elapsedMs:Date.now()-started,...getMetrics()};history.push(item);options.onProgress?.(item);};
 function optimize(g){let den=1e-9,r=0,gg=0,b=0;visitGaussian(g,width,height,(i,w)=>{const aw=alpha[i]/255;den+=w*w*aw;r+=residual[3*i]*w*aw;gg+=residual[3*i+1]*w*aw;b+=residual[3*i+2]*w*aw;});const delta=[r/den,gg/den,b/den];g[5]=(g[5]||0)+delta[0];g[6]=(g[6]||0)+delta[1];g[7]=(g[7]||0)+delta[2];visitGaussian(g,width,height,(i,w)=>{residual[3*i]-=delta[0]*w;residual[3*i+1]-=delta[1]*w;residual[3*i+2]-=delta[2]*w;});}
 report('initialization',0);await tick();
 // Multiscale residual fitting starts broad, then spends most coefficients on
 // local errors. Each update analytically minimizes weighted squared error.
 const finest=Math.max(1,Math.sqrt(visible/(budget*.65))),levels=[finest*8,finest*4,finest*2,finest];
 for(let level=0;level<levels.length;level++){
  cancel();const spacing=levels[level],target=level===levels.length-1?Math.floor(budget*.35):Math.min(budget,Math.floor(budget*[.01,.04,.12][level]));
  const nx=Math.max(1,Math.ceil(width/spacing)),ny=Math.max(1,Math.ceil(height/spacing)),dx=width/nx,dy=height/ny;
  const centres=[];for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const cx=(x+.5)*dx,cy=(y+.5)*dy;if(alpha[Math.min(height-1,Math.floor(cy))*width+Math.min(width-1,Math.floor(cx))])centres.push([cx,cy]);}
  const available=Math.max(0,Math.min(centres.length,target-splats.length));
  for(let k=0;k<available;k++){const [cx,cy]=centres[Math.min(centres.length-1,Math.floor((k+.5)*centres.length/available))],g=[cx,cy,Math.max(.45,dx*.65),Math.max(.45,dy*.65),0,0,0,0];optimize(g);splats.push(g);if(k%128===0){cancel();await tick();}}
  report('multiscale_fit',(level+1)*.15);await tick();
 }
 const remaining=budget-splats.length,step=Math.max(1,Math.floor(Math.sqrt(visible/Math.max(1,remaining)))),peaks=[];
 for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){let best=-1,bx=x,by=y;for(let yy=y;yy<Math.min(height,y+step);yy++)for(let xx=x;xx<Math.min(width,x+step);xx++){const i=yy*width+xx,e=(residual[3*i]**2+residual[3*i+1]**2+residual[3*i+2]**2)*alpha[i]/255;if(e>best){best=e;bx=xx;by=yy;}}if(best>.01)peaks.push({e:best,x:bx+.5,y:by+.5});}
 peaks.sort((a,b)=>b.e-a.e);
 for(let k=0;k<Math.min(remaining,peaks.length);k++){cancel();const p=peaks[k],g=[p.x,p.y,Math.max(.55,finest*.34),Math.max(.55,finest*.34),0,0,0,0];optimize(g);splats.push(g);if(k%128===0){options.onProgress?.({phase:'residual_refinement',fraction:.6+.15*k/Math.max(1,remaining),count:splats.length});await tick();}}
 report('adaptive_centres',.75);
 for(let pass=0;pass<iterations;pass++){for(let i=0;i<splats.length;i++){optimize(splats[pass%2?splats.length-1-i:i]);if(i%256===0){cancel();await tick();}}report('coefficient_refinement',.75+.10*(pass+1)/iterations);}
 const geometrySteps=clamp(Math.floor(options.geometrySteps??35),0,160),moment=new Float64Array(splats.length*8),variance=new Float64Array(splats.length*8),grad=new Float64Array(splats.length*8),rates=[.06,.06,.018,.018,.025,.7,.7,.7];
 let bestError=Infinity,bestSplats=null;
 function rebuildResidual(){for(let i=0;i<n;i++)for(let k=0;k<3;k++)residual[i*3+k]=data[i*4+k]-base[k];for(const g of splats)visitGaussian(g,width,height,(i,w)=>{residual[i*3]-=g[5]*w;residual[i*3+1]-=g[6]*w;residual[i*3+2]-=g[7]*w;});}
 for(let step=0;step<=geometrySteps&&geometrySteps>0;step++){
  cancel();let error=0;for(let i=0;i<n;i++)error+=(residual[3*i]**2+residual[3*i+1]**2+residual[3*i+2]**2)*alpha[i]/255;
  if(error<bestError){bestError=error;bestSplats=splats.map(g=>g.slice());}
  if(step%5===0||step===geometrySteps){report('geometry_gradient_'+step,.85+.15*step/geometrySteps);await tick();}
  if(step===geometrySteps)break;
  grad.fill(0);
  for(let j=0;j<splats.length;j++){
   const g=splats[j],c=Math.cos(g[4]),s=Math.sin(g[4]),at=j*8;
   visitGaussian(g,width,height,(i,w)=>{const dx=i%width+.5-g[0],dy=Math.floor(i/width)+.5-g[1],u=(c*dx+s*dy)/g[2],v=(-s*dx+c*dy)/g[3],aw=alpha[i]/255;let dot=0;for(let k=0;k<3;k++){const e=-residual[i*3+k]*aw;grad[at+5+k]+=e*w;dot+=e*g[5+k];}dot*=w;grad[at]+=dot*(u*c/g[2]-v*s/g[3]);grad[at+1]+=dot*(u*s/g[2]+v*c/g[3]);grad[at+2]+=dot*u*u;grad[at+3]+=dot*v*v;grad[at+4]+=dot*u*v*(g[2]/g[3]-g[3]/g[2]);});
  }
  const correctionM=1-.9**(step+1),correctionV=1-.999**(step+1),decay=Math.max(.1,1-step/geometrySteps);
  for(let j=0;j<splats.length;j++)for(let k=0;k<8;k++){const at=j*8+k;moment[at]=.9*moment[at]+.1*grad[at];variance[at]=.999*variance[at]+.001*grad[at]**2;const change=rates[k]*decay*(moment[at]/correctionM)/(Math.sqrt(variance[at]/correctionV)+1e-8);if(k===2||k===3)splats[j][k]=clamp(splats[j][k]*Math.exp(-change),.3,Math.max(width,height));else splats[j][k]-=change;}
  for(const g of splats){g[0]=clamp(g[0],-.5,width+.5);g[1]=clamp(g[1],-.5,height+.5);for(let k=5;k<8;k++)g[k]=clamp(g[k],-4000,4000);}
  rebuildResidual();
 }
 if(bestSplats)for(let i=0;i<splats.length;i++)splats[i]=bestSplats[i];
 const asset={schema:ASSET_SCHEMA,id:options.id||'uploaded-observation',width,height,base,splats,kernel:{type:'signed_additive_gaussian',cutoffSigma:4,sample:'pixel_centres',colorSpace:'srgb_encoded_0_255'},provenance:{kind:'observed',algorithm:'crf08-browser-residual-adam-v1',budget,sourceRGBEmbedded:false,losslessResidualEmbedded:false},fit:{history,seconds:(Date.now()-started)/1000,geometrySteps,bestCheckpointRule:'lowest_weighted_float_mse_after_analytic_geometry_gradient',note:'Browser coordinate descent + geometry Adam; offline sparse initialization is a separately measured configuration.'}};
 const encoded=encodeAlpha(alpha);if(encoded)asset.alpha=encoded;
 checked(asset,validateAsset);return asset;
}
return{VERSION:'0.8.0',ASSET_SCHEMA,SCENE_SCHEMA,validateAsset,validateScene,renderAsset,renderScene,render:renderScene,fitImage,fit:fitImage,calculateMetrics,applyOps,clearCache:asset=>fieldCache.delete(asset),alphaArray};
});
