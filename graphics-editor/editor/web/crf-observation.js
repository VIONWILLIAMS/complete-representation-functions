/* CRF 0.6 observation fitting. Deterministic RGB/alpha analysis; no model or image API.
 * The inferred lathe is a single-view hypothesis. UV values are observed radiance,
 * not recovered albedo. Backside colors are explicitly low-confidence inference.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CRFObservation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='0.6.0',TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  class CRFObservationError extends Error {constructor(message){super('CRFObservation: '+message);this.name='CRFObservationError';}}
  function need(v,m){if(!v)throw new CRFObservationError(m);}
  function encode(bytes){if(typeof Buffer!=='undefined')return Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('base64');let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
  function decode(s){if(typeof Buffer!=='undefined')return Uint8Array.from(Buffer.from(s,'base64'));return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
  function hash(x,y){let n=Math.imul(x+19,374761393)^Math.imul(y+71,668265263);n=Math.imul(n^(n>>>13),1274126177);return(n^(n>>>16))>>>0;}
  function imageInput(input){
    need(input&&Number.isInteger(input.width)&&Number.isInteger(input.height),'image width and height must be integers');
    const w=input.width,h=input.height;need(w>=8&&h>=8&&w<=8192&&h<=8192&&w*h<=16000000,'image size is outside 8..8192 or the 16 megapixel budget');
    const rgba=input.rgba;need(rgba&&typeof rgba.length==='number'&&rgba.length===w*h*4,'rgba length must equal width × height × 4');
    need(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray||Array.isArray(rgba),'rgba must be a byte array');
    if(Array.isArray(rgba))need(rgba.every(v=>Number.isInteger(v)&&v>=0&&v<=255),'rgba contains invalid bytes');
    return{width:w,height:h,rgba};
  }
  function roiFor(w,h,bbox){if(bbox===undefined)return[0,0,w,h];need(Array.isArray(bbox)&&bbox.length===4&&bbox.every(Number.isInteger),'bbox must contain four integer pixel bounds');const[x0,y0,x1,y1]=bbox;need(x0>=0&&y0>=0&&x1<=w&&y1<=h&&x1-x0>=8&&y1-y0>=8,'bbox must be a nonempty region inside the image, at least 8 × 8');return bbox.slice();}
  function largest(mask,w,h){
    const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let best=[];
    for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;let head=0,tail=1;queue[0]=i;seen[i]=1;
      while(head<tail){const q=queue[head++],x=q%w,y=Math.floor(q/w);if(x>0&&mask[q-1]&&!seen[q-1]){seen[q-1]=1;queue[tail++]=q-1;}if(x+1<w&&mask[q+1]&&!seen[q+1]){seen[q+1]=1;queue[tail++]=q+1;}if(y>0&&mask[q-w]&&!seen[q-w]){seen[q-w]=1;queue[tail++]=q-w;}if(y+1<h&&mask[q+w]&&!seen[q+w]){seen[q+w]=1;queue[tail++]=q+w;}}
      if(tail>best.length)best=Array.from(queue.subarray(0,tail));
    }
    const out=new Uint8Array(mask.length);for(const i of best)out[i]=1;return out;
  }
  function morph(mask,w,h,dilate){const out=new Uint8Array(mask.length);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)n+=mask[(y+dy)*w+x+dx];out[y*w+x]=dilate?(n>0?1:0):(n===9?1:0);}return out;}
  function fillHoles(mask,w,h){
    const outside=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let head=0,tail=0;
    function add(i){if(!mask[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}}
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x+1<w)add(i+1);if(y)add(i-w);if(y+1<h)add(i+w);}
    const out=new Uint8Array(mask.length);for(let i=0;i<out.length;i++)out[i]=outside[i]?0:1;return out;
  }
  function bounds(mask,w,h){let x0=w,y0=h,x1=0,y1=0,count=0;for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);count++;}return{bbox:[x0,y0,x1,y1],count};}
  // Opponent-color tests separate red skin from neighboring yellow fruit while
  // retaining very dark red edges. Yellow skin must also differ from gray cast
  // shadows in blue/green ratio. These are scoped color priors, not semantics.
  function foregroundColor(r,g,b,kind){return kind==='apple'?r>12&&r-b>16&&r>g*1.22&&r-g>.85*(g-b):r>60&&g>45&&g>r*.57&&b<g*.52&&r-g<.9*(g-b);}
  function segment(input,options){
    const im=imageInput(input),o=options||{},w=im.width,h=im.height,roi=roiFor(w,h,o.bbox);let kind=o.kind||'auto';need(['auto','apple','pear'].includes(kind),'kind must be auto, apple, or pear');
    let mask=new Uint8Array(w*h),method='color-connected-component-with-assisted-ROI';const [x0,y0,x1,y1]=roi;
    if(o.mask!==undefined){need(o.mask&&o.mask.length===w*h,'mask length must equal image pixel count');for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*w+x;need(Number.isFinite(o.mask[i])&&o.mask[i]>=0&&o.mask[i]<=255,'mask contains invalid values');mask[i]=o.mask[i]>0?1:0;}method='provided-mask';}
    else{
      let red=0,yellow=0,transparent=0,opaque=0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const p=(y*w+x)*4,r=im.rgba[p],g=im.rgba[p+1],b=im.rgba[p+2],a=im.rgba[p+3];if(a<16){transparent++;continue;}opaque++;if(foregroundColor(r,g,b,'apple'))red++;if(foregroundColor(r,g,b,'pear'))yellow++;}
      if(kind==='auto')kind=red>=yellow?'apple':'pear';
      const useAlpha=transparent>(x1-x0)*(y1-y0)*.15&&opaque>64;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*w+x,p=i*4,r=im.rgba[p],g=im.rgba[p+1],b=im.rgba[p+2];mask[i]=im.rgba[p+3]>=32&&(useAlpha||foregroundColor(r,g,b,kind))?1:0;}
      if(useAlpha)method='alpha-connected-component';
      mask=largest(mask,w,h);for(let k=0;k<2;k++)mask=morph(mask,w,h,true);for(let k=0;k<2;k++)mask=morph(mask,w,h,false);mask=fillHoles(mask,w,h);for(let k=0;k<2;k++)mask=morph(mask,w,h,false);mask=largest(mask,w,h);for(let k=0;k<2;k++)mask=morph(mask,w,h,true);mask=largest(mask,w,h);
    }
    const info=bounds(mask,w,h);need(info.count>=64,'no supported fruit foreground found; choose a tighter ROI, an alpha cutout, or provide a mask');
    need(info.bbox[2]-info.bbox[0]>=12&&info.bbox[3]-info.bbox[1]>=12,'foreground is too small to fit a surface');
    if(kind==='auto')kind='apple';
    // Thin stalks are not part of the body revolution. Keep the widest contiguous
    // body band; a generated stem will connect at the inferred body top.
    const widths=new Int32Array(h);let maxWidth=0;for(let y=info.bbox[1];y<info.bbox[3];y++){let l=w,r=-1;for(let x=info.bbox[0];x<info.bbox[2];x++)if(mask[y*w+x]){l=Math.min(l,x);r=x;}widths[y]=r>=l?r-l+1:0;maxWidth=Math.max(maxWidth,widths[y]);}
    const threshold=Math.max(4,maxWidth*.065);let top=info.bbox[1],bottom=info.bbox[3];while(top<bottom&&widths[top]<threshold)top++;while(bottom>top&&widths[bottom-1]<threshold)bottom--;
    for(let y=0;y<top;y++)mask.fill(0,y*w,(y+1)*w);for(let y=bottom;y<h;y++)mask.fill(0,y*w,(y+1)*w);
    const body=bounds(mask,w,h);need(body.count>=64&&body.bbox[3]-body.bbox[1]>=12,'no sufficiently large fruit body remains after stalk exclusion');
    return{mask,kind,method,roi,...body};
  }
  function linearWeights(t,n){const s=clamp(t,0,1)*(n-1),a=Math.min(n-2,Math.floor(s));return[a,a+1,1-(s-a),s-a];}
  function profileAt(profile,t){const[a,b,wa,wb]=linearWeights(t,profile.length);return profile[a]*wa+profile[b]*wb;}
  function fitProfile(seg,w,h,n){
    const [x0,y0,x1,y1]=seg.bbox,rows=[];let weightedCenter=0,totalCenterWeight=0,maxRadius=0;
    for(let y=y0;y<y1;y++){let left=w,right=-1;for(let x=x0;x<x1;x++)if(seg.mask[y*w+x]){left=Math.min(left,x);right=x;}if(right<left)continue;const r=(right-left+1)/2,c=(left+right+1)/2;rows.push({y,r,c});weightedCenter+=c*r;totalCenterWeight+=r;maxRadius=Math.max(maxRadius,r);}
    const center=weightedCenter/totalCenterWeight,height=y1-y0;
    const H=Array.from({length:n},()=>new Float64Array(n)),b=new Float64Array(n);const lambda=.003;
    for(const row of rows){const t=1-(row.y+.5-y0)/height,[a,z,wa,wz]=linearWeights(t,n),v=row.r/maxRadius,wt=1/rows.length;H[a][a]+=wa*wa*wt;H[z][z]+=wz*wz*wt;H[a][z]+=wa*wz*wt;H[z][a]+=wa*wz*wt;b[a]+=wa*v*wt;b[z]+=wz*v*wt;}
    for(let j=1;j<n-1;j++){const ids=[j-1,j,j+1],v=[1,-2,1];for(let a=0;a<3;a++)for(let z=0;z<3;z++)H[ids[a]][ids[z]]+=lambda*v[a]*v[z]/(n-2);}
    const p=Array.from({length:n},(_,i)=>Math.sqrt(Math.max(0,1-Math.pow(2*i/(n-1)-1,2))));
    function loss(){let data=0,smooth=0;for(const row of rows){const t=1-(row.y+.5-y0)/height;data+=Math.pow(profileAt(p,t)-row.r/maxRadius,2)/rows.length;}for(let i=1;i<n-1;i++)smooth+=lambda*Math.pow(p[i-1]-2*p[i]+p[i+1],2)/(n-2);return{objective:data+smooth,dataMSE:data,regularization:smooth};}
    const curve=[{iteration:0,...loss()}];
    for(let iter=1;iter<=48;iter++){let maxDelta=0;for(let j=0;j<n;j++){let rhs=b[j];for(let k=0;k<n;k++)if(k!==j)rhs-=H[j][k]*p[k];const next=clamp(rhs/Math.max(H[j][j],1e-12),0,1.25);maxDelta=Math.max(maxDelta,Math.abs(next-p[j]));p[j]=next;}const value=loss();curve.push({iteration:iter,...value});if(maxDelta<1e-7)break;}
    let intersection=0,union=0,predicted=0;for(let y=y0;y<y1;y++){const r=maxRadius*profileAt(p,1-(y+.5-y0)/height);for(let x=0;x<w;x++){const a=Math.abs(x+.5-center)<=r,b=seg.mask[y*w+x]>0;if(a)predicted++;if(a&&b)intersection++;if(a||b)union++;}}
    let asymmetry=0;for(const row of rows)asymmetry+=Math.abs(row.c-center)/rows.length;
    return{profile:p,center,maxRadius,height,rows,curve,silhouetteIoU:intersection/Math.max(1,union),predictedPixels:predicted,asymmetryPixels:asymmetry};
  }
  function fieldWeights(u,v,w,h){const x=clamp(u,0,1)*(w-1),y=clamp(v,0,1)*(h-1),x0=Math.min(w-2,Math.floor(x)),y0=Math.min(h-2,Math.floor(y)),fx=x-x0,fy=y-y0;return[[y0*w+x0,(1-fx)*(1-fy)],[y0*w+x0+1,fx*(1-fy)],[(y0+1)*w+x0,(1-fx)*fy],[(y0+1)*w+x0+1,fx*fy]];}
  function sampleArray(rgb,w,h,u,v){const out=[0,0,0];for(const[id,a]of fieldWeights(u,v,w,h))for(let c=0;c<3;c++)out[c]+=rgb[id*3+c]*a;return out;}
  function fitField(im,seg,shape,size){
    const w=im.width,h=im.height,[x0,y0,x1,y1]=seg.bbox,fw=size,fh=size,sums=new Float64Array(fw*fh*3),weights=new Float64Array(fw*fh),records=[],sumColor=[0,0,0];let count=0,trainCount=0;
    for(let y=y0;y<y1;y++){const v=(y+.5-y0)/shape.height,r=shape.maxRadius*profileAt(shape.profile,1-v);if(r<.5)continue;
      for(let x=x0;x<x1;x++){const id=y*w+x;if(!seg.mask[id])continue;const nx=clamp((x+.5-shape.center)/r,-.9999,.9999),u=.5+Math.asin(nx)/TAU,px=id*4,color=[im.rgba[px],im.rgba[px+1],im.rgba[px+2]],holdout=hash(x,y)%5===0,ws=fieldWeights(u,v,fw,fh);records.push({u,v,color,holdout,ws});count++;if(holdout)continue;trainCount++;for(let c=0;c<3;c++)sumColor[c]+=color[c];for(const[k,a]of ws){weights[k]+=a;for(let c=0;c<3;c++)sums[k*3+c]+=a*color[c];}}
    }
    need(count>=64&&trainCount>=32,'too few valid surface observations');const mean=sumColor.map(v=>v/trainCount),rgb=new Float64Array(fw*fh*3),conf=new Uint8Array(fw*fh),frontLo=Math.floor((fw-1)*.25),frontHi=Math.ceil((fw-1)*.75);
    for(let i=0;i<weights.length;i++)if(weights[i]>.00001){for(let c=0;c<3;c++)rgb[i*3+c]=sums[i*3+c]/weights[i];conf[i]=Math.round(160+95*Math.min(1,weights[i]/2));}
    // Missing front coefficients are filled from nearest measured coefficient on
    // that latitude; no input background pixels can become texture donors.
    for(let y=0;y<fh;y++)for(let x=frontLo;x<=frontHi;x++){const i=y*fw+x;if(conf[i])continue;let best=-1,dist=Infinity;for(let yy=Math.max(0,y-6);yy<=Math.min(fh-1,y+6);yy++)for(let xx=frontLo;xx<=frontHi;xx++){const q=yy*fw+xx;if(conf[q]>=160){const d=(xx-x)*(xx-x)+(yy-y)*(yy-y);if(d<dist){dist=d;best=q;}}}for(let c=0;c<3;c++)rgb[i*3+c]=best<0?mean[c]:rgb[best*3+c];conf[i]=best<0?24:64;}
    // Weighted least-squares refinement of the shared bilinear color coefficients.
    // Simultaneous normalized gradient updates use only training pixels.
    function error(which,data,squared){let e=0,n=0;for(const a of records){if(which==='train'&&a.holdout||which==='holdout'&&!a.holdout)continue;const p=sampleArray(data,fw,fh,a.u,a.v);for(let c=0;c<3;c++){const d=p[c]-a.color[c];e+=squared?d*d:Math.abs(d);}n+=3;}return e/Math.max(1,n);}
    function errors(iteration){return{iteration,trainMAE:error('train',rgb,false),holdoutMAE:error('holdout',rgb,false),trainMSE:error('train',rgb,true),holdoutMSE:error('holdout',rgb,true)};}
    const curve=[errors(0)];
    for(let iter=1;iter<=5;iter++){const delta=new Float64Array(rgb.length);for(const a of records){if(a.holdout)continue;const pred=sampleArray(rgb,fw,fh,a.u,a.v);for(const[k,weight]of a.ws)for(let c=0;c<3;c++)delta[k*3+c]+=weight*(a.color[c]-pred[c]);}for(let i=0;i<weights.length;i++)if(weights[i]>1e-8)for(let c=0;c<3;c++)rgb[i*3+c]=clamp(rgb[i*3+c]+.8*delta[i*3+c]/weights[i],0,255);curve.push(errors(iter));}
    for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){if(x>=frontLo&&x<=frontHi)continue;const phi=(x/(fw-1)-.5)*TAU,front=.5+Math.asin(Math.sin(phi))/TAU,color=sampleArray(rgb,fw,fh,front,y/(fh-1));for(let c=0;c<3;c++)rgb[(y*fw+x)*3+c]=color[c];conf[y*fw+x]=24;}
    const quantized=Uint8Array.from(rgb,v=>Math.round(clamp(v,0,255)));let baseline=0,holdout=0;for(const a of records)if(a.holdout){for(let c=0;c<3;c++)baseline+=Math.abs(mean[c]-a.color[c]);holdout++;}
    const observed=conf.reduce((n,v)=>n+(v>=160?1:0),0),field={width:fw,height:fh,rgbBase64:encode(quantized),confidenceBase64:encode(conf),referenceColor:mean.map(Math.round),mode:'observed_radiance'};
    return{field,decoded:quantized,confidence:conf,mean,report:{fieldWidth:fw,fieldHeight:fh,coefficientCount:fw*fh,storedRGBBytes:quantized.length,storedConfidenceBytes:conf.length,trainingPixels:trainCount,heldoutPixels:holdout,holdoutRule:'coordinate hash mod 5; RGB excluded from coefficient fitting, mean, and priors; segmentation/geometry use the full mask',trainRgbMAE:error('train',quantized,false),holdoutRgbMAE:error('holdout',quantized,false),constantBaselineMAE:baseline/Math.max(1,holdout*3),observedCoverage:observed/conf.length,lossCurve:curve,backsideMethod:'front-hemisphere mirrored radiance, confidence 24/255; not observed'}};
  }
  function frontPreview(im,seg,shape,field){
    const[x0,y0,x1,y1]=seg.bbox,w=x1-x0,h=y1-y0,rgba=new Uint8ClampedArray(w*h*4),mask=new Uint8Array(w*h);
    for(let y=0;y<h;y++){const v=(y+.5)/shape.height,r=shape.maxRadius*profileAt(shape.profile,1-v);for(let x=0;x<w;x++){const nx=(x+x0+.5-shape.center)/Math.max(r,.001);if(Math.abs(nx)>1)continue;const u=.5+Math.asin(clamp(nx,-1,1))/TAU,c=sampleArray(field.decoded,field.field.width,field.field.height,u,v),p=(y*w+x)*4;for(let k=0;k<3;k++)rgba[p+k]=Math.round(c[k]);rgba[p+3]=255;mask[y*w+x]=1;}}
    return{width:w,height:h,rgba,mask};
  }
  function fit(input,options){
    const im=imageInput(input),o=options||{},n=o.profileSamples===undefined?32:o.profileSamples,size=o.fieldSize===undefined?128:o.fieldSize;
    need(Number.isInteger(n)&&n>=8&&n<=128,'profileSamples must be an integer in 8..128');need(Number.isInteger(size)&&size>=16&&size<=256,'fieldSize must be an integer in 16..256');
    const budget=Object.assign({maxInputPixels:2000000,maxForegroundPixels:200000},o.budget||{});need(Number.isInteger(budget.maxInputPixels)&&budget.maxInputPixels>=64&&budget.maxInputPixels<=16000000&&Number.isInteger(budget.maxForegroundPixels)&&budget.maxForegroundPixels>=64&&budget.maxForegroundPixels<=400000,'invalid pixel fitting budget');need(im.width*im.height<=budget.maxInputPixels,'image exceeds the fitting budget; downsample or crop before importing');
    const id=o.id||'observed.fruit';need(typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(id),'id is invalid');const seg=segment(im,o);need(seg.count<=budget.maxForegroundPixels,'foreground exceeds the fitting budget; downsample the image before importing');const shape=fitProfile(seg,im.width,im.height,n),field=fitField(im,seg,shape,size),height=2,radius=shape.maxRadius/shape.height*height;
    const source={kind:'observed_fit',method:'silhouette least-squares lathe + fitted bilinear UV radiance',inputDimensions:[im.width,im.height],roi:seg.roi,bbox:seg.bbox,segmentation:seg.method,geometry:'single-view rotational hypothesis, not measured 3D',appearance:'observed radiance with inferred mirrored back',sourceImageRequiredAtRuntime:false};
    const object={id,label:o.label||(seg.kind==='pear'?'照片拟合梨子':'照片拟合苹果'),visible:true,source,surface:{kind:'lathe',height,radius,profile:shape.profile.map(x=>Number(x.toFixed(8))),profileInterpolation:'linear',shape:0,detail:'none',stem:true,leaf:false},material:{kind:'field',color:field.field.referenceColor.slice(),roughness:.38,seed:17,field:field.field},transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
    const warnings=[];if(shape.silhouetteIoU<.8)warnings.push('该轮廓与旋转体假设差异较大；请调整 ROI 或使用更合适的几何函数。');if(shape.asymmetryPixels/shape.maxRadius>.08)warnings.push('观测包含明显不对称；当前旋转体只拟合平均轴向轮廓。');const[r0,r1,r2,r3]=seg.roi,[b0,b1,b2,b3]=seg.bbox;if(b0<=r0+2||b1<=r1+2||b2>=r2-2||b3>=r3-2)warnings.push('轮廓接近 ROI 边缘，物品可能被裁切。');
    const report={schema:'crf.observation_fit.v0.6',pass:Number.isFinite(field.report.holdoutRgbMAE)&&shape.silhouetteIoU>=.65,acceptance:{scope:'bounded fruit-hypothesis import, not exact reconstruction',minimumSilhouetteIoU:.65,requiresFiniteAppearanceError:true,pixelExactClaim:false},kind:seg.kind,inputDimensions:[im.width,im.height],bbox:seg.bbox,roi:seg.roi,budget,sourceMaskPixels:seg.count,segmentation:seg.method,profile:{samples:n,initialLoss:shape.curve[0].objective,finalLoss:shape.curve.at(-1).objective,lossCurve:shape.curve,silhouetteIoU:shape.silhouetteIoU,axisX:shape.center,radiusPixels:shape.maxRadius,heightPixels:shape.height,meanAxisAsymmetryPixels:shape.asymmetryPixels},appearance:field.report,runtimeData:{fullSourceRGBStored:false,profileCoefficients:n,fieldRGBBytes:field.report.storedRGBBytes,fieldConfidenceBytes:field.report.storedConfidenceBytes,sourceImagePixelCount:im.width*im.height},warnings,limitations:['Single image implies a rotational geometry hypothesis; no hidden-side ground truth.','Silhouette IoU compares against the extracted mask; it is not an independent measurement of segmentation accuracy.','UV colors include original illumination and specular highlights; not a recovered physical material.','Held-out pixels measure local appearance interpolation only, not novel-view or semantic generalization.','Automatic color segmentation is restricted to red apples and yellow/green pears with separable foreground; arbitrary image understanding is not implemented.']};
    return{object,report,preview:frontPreview(im,seg,shape,field),mask:seg.mask};
  }
  function sampleField(field,u,v){need(field&&Number.isInteger(field.width)&&Number.isInteger(field.height),'invalid field');return sampleArray(decode(field.rgbBase64),field.width,field.height,u,v);}
  return{VERSION,CRFObservationError,fit,segment,sampleField,decodeField:field=>({rgb:decode(field.rgbBase64),confidence:field.confidenceBase64?decode(field.confidenceBase64):null}),_internals:{profileAt,fitProfile,fieldWeights,hash}};
});
