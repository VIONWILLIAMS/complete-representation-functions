/* CRF 0.6: deterministic CPU surface-Gaussian renderer. No source-image blit. */
(function(root,factory){const P=typeof module==='object'&&module.exports?require('./crf-program.js'):root.CRFProgram;const api=factory(P);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CRFProgramRenderer=api;})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const PI=Math.PI,TAU=PI*2,RAD=PI/180;
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const norm=(x,y,z)=>{const d=Math.hypot(x,y,z)||1;return [x/d,y/d,z/d];};
  function hash(x,y,z=0,seed=0){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647)^Math.imul(seed|0,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
  function noise(x,y,z=0,seed=0){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),smooth=t=>t*t*(3-2*t),u=smooth(x-X),v=smooth(y-Y),w=smooth(z-Z);return mix(mix(mix(hash(X,Y,Z,seed),hash(X+1,Y,Z,seed),u),mix(hash(X,Y+1,Z,seed),hash(X+1,Y+1,Z,seed),u),v),mix(mix(hash(X,Y,Z+1,seed),hash(X+1,Y,Z+1,seed),u),mix(hash(X,Y+1,Z+1,seed),hash(X+1,Y+1,Z+1,seed),u),v),w);}
  function sampleProfile(a,t,mode){const x=clamp(t)*(a.length-1),i=Math.min(a.length-2,Math.floor(x)),f=x-i,p0=a[Math.max(0,i-1)],p1=a[i],p2=a[i+1],p3=a[Math.min(a.length-1,i+2)];return mode==='linear'?mix(p1,p2,f):Math.max(0,.5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f));}
  function radiusAt(s,t,phi){const r=s.kind==='cylinder'?s.radius:s.radius*sampleProfile(s.profile,t,s.profileInterpolation),shape=s.shape||0;let organic=1;if(s.detail==='apple')organic+=.018*Math.cos(phi*5+.3)*(Math.pow(Math.abs(2*t-1),3)+.15);if(s.detail==='pear')organic+=.008*Math.cos(phi*4+.7);return r*(1+shape*.30*(1-2*t))*organic;}
  const geoCache=new Map(),fieldCache=new Map();let fieldObjects=new WeakMap(),cacheBytes=0;
  function geometry(surface,spacing){const s=surface,key=JSON.stringify(s)+'@'+String(spacing);if(geoCache.has(key))return geoCache.get(key);const data=[];
    const add=(x,y,z,nx,ny,nz,u,v,part=0)=>data.push(x,y,z,nx,ny,nz,u,v,part);
    if(s.kind==='box'){
      const w=s.width,h=s.height,d=s.depth;
      function face(axis,sign,A,B,na,nb){const ia=Math.max(2,Math.ceil(A/spacing)),ib=Math.max(2,Math.ceil(B/spacing));for(let a=0;a<=ia;a++)for(let b=0;b<=ib;b++){const p=[0,h/2,0],n=[0,0,0];n[axis]=sign;p[axis]=[w/2,h/2,d/2][axis]*sign+(axis===1?h/2:0);p[na]+=(a/ia-.5)*A;p[nb]+=(b/ib-.5)*B;add(...p,...n,a/ia,b/ib);}}
      face(0,-1,h,d,1,2);face(0,1,h,d,1,2);face(1,-1,w,d,0,2);face(1,1,w,d,0,2);face(2,-1,w,h,0,1);face(2,1,w,h,0,1);
    }else if(s.kind==='ellipsoid'){
      const nv=Math.max(14,Math.ceil(PI*Math.max(s.radius,s.height/2)/spacing));for(let j=0;j<=nv;j++){const a=PI*j/nv,si=Math.sin(a),co=Math.cos(a),r=s.radius*si,nu=Math.max(8,Math.ceil(TAU*r/spacing));for(let k=0;k<nu;k++){const ph=-PI+TAU*k/nu,x=r*Math.sin(ph),z=r*Math.cos(ph),y=s.height*(1-co)/2,n=norm(x/(s.radius*s.radius),(y-s.height/2)/Math.pow(s.height/2,2),z/(s.radius*s.radius));add(x,y,z,...n,k/nu,1-j/nv);}}
    }else{
      // Sample meridian arc length, not uniform y. Uniform y leaves large holes at steep caps.
      const meridian=new Float64Array(1025);for(let i=1;i<meridian.length;i++)meridian[i]=meridian[i-1]+Math.hypot(s.height/1024,radiusAt(s,i/1024,0)-radiusAt(s,(i-1)/1024,0));
      const total=meridian.at(-1),nv=Math.max(24,Math.ceil(total/spacing));let cursor=1;
      for(let j=0;j<=nv;j++){const distance=total*j/nv;while(cursor<1024&&meridian[cursor]<distance)cursor++;const t=(cursor-1+(distance-meridian[cursor-1])/(meridian[cursor]-meridian[cursor-1]||1))/1024,r=radiusAt(s,t,0),nu=Math.max(10,Math.ceil(TAU*r/spacing));for(let k=0;k<nu;k++){const ph=-PI+TAU*k/nu,rr=radiusAt(s,t,ph),dt=.0003,dr=(radiusAt(s,clamp(t+dt),ph)-radiusAt(s,clamp(t-dt),ph))/(s.height*(clamp(t+dt)-clamp(t-dt))||1),n=norm(Math.sin(ph),-dr,Math.cos(ph));add(rr*Math.sin(ph),t*s.height,rr*Math.cos(ph),...n,k/nu,1-t);}}
      if(s.kind==='cylinder'){for(const top of[0,1])for(let r=0;r<=s.radius;r+=spacing){const nu=Math.max(8,Math.ceil(TAU*r/spacing));for(let k=0;k<nu;k++){const a=k*TAU/nu;add(r*Math.sin(a),top*s.height,r*Math.cos(a),0,top?1:-1,0,k/nu,top);}}}
      else if(s.detail==='none'&&s.profile.at(-1)>.12){const max=s.radius*s.profile.at(-1)*.88;for(let r=0;r<max;r+=spacing){const nu=Math.max(8,Math.ceil(TAU*r/spacing));for(let k=0;k<nu;k++){const a=k*TAU/nu;add(r*Math.sin(a),s.height-.1,r*Math.cos(a),0,1,0,k/nu,.05,3);}}}
      if(s.kind==='lathe'&&(s.stem||s.detail==='apple'||s.detail==='pear')){for(const top of[0,1]){const max=radiusAt(s,top,0);for(let r=0;r<=max;r+=spacing){const nu=Math.max(8,Math.ceil(TAU*r/spacing));for(let k=0;k<nu;k++){const a=-PI+k*TAU/nu;add(r*Math.sin(a),top*s.height,r*Math.cos(a),0,top?1:-1,0,k/nu,1-top);}}}}
    }
    if(s.stem){const len=s.height*.12,rr=s.radius*.043,ny=Math.max(8,Math.ceil(len/spacing));for(let j=0;j<=ny;j++){const t=j/ny,y=s.height-.025+len*t,x=t*t*s.radius*.13,nu=Math.max(12,Math.ceil(TAU*rr/spacing));for(let k=0;k<nu;k++){const a=k*TAU/nu;add(x+rr*Math.sin(a),y,rr*Math.cos(a),Math.sin(a),-.1,Math.cos(a),k/nu,t,1);}}}
    if(s.leaf){const len=s.radius*.75,ny=Math.max(16,Math.ceil(len/spacing));for(let j=0;j<=ny;j++){const t=j/ny,wide=Math.sin(PI*t)*s.radius*.18,nw=Math.max(2,Math.ceil(wide*2/spacing));for(let k=0;k<=nw;k++){const w=(k/nw*2-1)*wide,x=s.radius*.08+len*t,y=s.height+s.height*.075+Math.sin(PI*t)*s.radius*.16+w*.72,z=w*.68-.02+t*.12,n=norm(-.12,.68,-.72);add(x,y,z,...n,t,k/nw,2);}}}
    const out={data:new Float32Array(data),count:data.length/9,spacing};if(cacheBytes+out.data.byteLength>65000000){geoCache.clear();cacheBytes=0;}geoCache.set(key,out);cacheBytes+=out.data.byteLength;return out;
  }
  function decodedField(f){const prior=fieldObjects.get(f),ref=f.referenceColor||[];if(prior&&prior.w===f.width&&prior.h===f.height&&prior.rgb===f.rgbBase64&&prior.conf===f.confidenceBase64&&prior.r===ref[0]&&prior.g===ref[1]&&prior.b===ref[2])return prior.value;
    const key=f.width+':'+f.height+':'+f.rgbBase64+':'+(f.confidenceBase64||'')+':'+JSON.stringify(f.referenceColor||null);let out=fieldCache.get(key);if(!out){const decode=s=>typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(s,'base64')):Uint8Array.from(atob(s),c=>c.charCodeAt(0));const rgb=decode(f.rgbBase64),confidence=f.confidenceBase64?decode(f.confidenceBase64):null,mean=f.referenceColor?f.referenceColor.slice():[0,0,0];if(!f.referenceColor){for(let i=0;i<rgb.length;i++)mean[i%3]+=rgb[i];for(let i=0;i<3;i++)mean[i]/=rgb.length/3;}out={rgb,confidence,mean,width:f.width,height:f.height};if(fieldCache.size>=12)fieldCache.clear();fieldCache.set(key,out);}fieldObjects.set(f,{w:f.width,h:f.height,rgb:f.rgbBase64,conf:f.confidenceBase64,r:ref[0],g:ref[1],b:ref[2],value:out});return out;}
  function fieldAt(f,u,v){const d=decodedField(f),x=clamp(u)*(d.width-1),y=clamp(v)*(d.height-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(d.width-1,x0+1),y1=Math.min(d.height-1,y0+1),a=x-x0,b=y-y0,c=[];for(let k=0;k<3;k++)c[k]=mix(mix(d.rgb[(y0*d.width+x0)*3+k],d.rgb[(y0*d.width+x1)*3+k],a),mix(d.rgb[(y1*d.width+x0)*3+k],d.rgb[(y1*d.width+x1)*3+k],a),b);return {color:c,confidence:d.confidence?d.confidence[Math.round(y)*d.width+Math.round(x)]/255:1,mean:d.mean};}
  function tintField(color,reference,target){
    // Preserve the original arithmetic on the no-edit branch: existing baseline frames
    // remain byte-identical, including floating-point rounding before accumulation.
    if(target.every((v,k)=>v===reference[k]))return color.map((c,k)=>clamp(c*target[k]/Math.max(8,reference[k]),0,255));
    // c ≈ k*b + s*[1,1,1] + residual. Estimate k in the chromatic subspace,
    // then transfer only the diffuse color component. Neutral highlights have k=0.
    const bm=(reference[0]+reference[1]+reference[2])/3,cm=(color[0]+color[1]+color[2])/3,b=reference.map(v=>v-bm),variance=dot(b,b);
    let amount;if(variance>36){amount=Math.max(0,((color[0]-cm)*b[0]+(color[1]-cm)*b[1]+(color[2]-cm)*b[2])/variance);}else{
      // A neutral reference cannot separate diffuse from specular in one image.
      // Tint midtones conservatively; near-white observations remain neutral.
      const high=clamp((Math.max(...color)-210)/40),preserve=1-high*high*(3-2*high);amount=Math.max(0,cm/Math.max(8,bm))*preserve;
    }
    amount=Math.min(4,amount);const delta=target.map((v,k)=>amount*(v-reference[k]));let gamut=1;
    // Scale the whole edit at the gamut boundary instead of clipping channels
    // independently, which would manufacture cyan/green specular plateaus.
    for(let k=0;k<3;k++){if(delta[k]>0)gamut=Math.min(gamut,(255-color[k])/delta[k]);else if(delta[k]<0)gamut=Math.min(gamut,-color[k]/delta[k]);}
    return color.map((c,k)=>clamp(c+clamp(gamut)*delta[k],0,255));
  }
  function baseMaterial(m,x,y,z,u,v,part){const seed=m.seed,grain=noise(x*27,y*27,z*27,seed),n=noise(x*5,y*5,z*5,seed);let color=m.color.slice(),confidence=1,unlit=false;
    if(part===1)return {color:[72+grain*22,45+grain*15,21+grain*8],confidence:1,unlit:false};
    if(part===2){const vein=Math.exp(-Math.abs(v-.5)*45),strip=Math.pow(Math.max(0,Math.cos(u*35+(v-.5)*35)),12)*.08;return {color:[46+vein*24+strip*70,83+vein*33+strip*95,28+vein*18],confidence:1,unlit:false};}
    if(part===3)return {color:color.map(c=>c*.25),confidence:1,unlit:false};
    if(m.kind==='field'){const f=fieldAt(m.field,u,v);color=tintField(f.color,f.mean,m.color);confidence=f.confidence;unlit=m.field.mode==='observed_radiance';}
    else if(m.kind==='apple'){
      const blush=noise(x*2.1,y*2.7,z*2.1,seed),stripe=(.5+.5*Math.sin(u*TAU*40+noise(x*4,y*3,z*4,seed)*7))*noise(x*7,y*2,z*7,seed),pore=hash(Math.floor(u*970),Math.floor(v*820),0,seed);let factor=.83+.22*blush+.12*stripe+(grain-.5)*.07;color=color.map((c,k)=>c*factor+(k===0?12:0)*blush);if(pore>.987){const f=(pore-.987)/.013;color=color.map((c,k)=>mix(c,[218,182,111][k],f*.58));}
    }else if(m.kind==='pear'){
      const patch=noise(x*3.5,y*3.5,z*3.5,seed),fine=hash(Math.floor(u*850),Math.floor(v*900),0,seed);color=color.map((c,k)=>c*(.83+.25*patch)+(grain-.5)*11+(k===0?patch*12:0));if(fine>.975)color=color.map(c=>c*(.58+.2*fine));
    }else if(m.kind==='ceramic'){const ring=Math.sin(y*180)*.008;color=color.map(c=>c*(.94+n*.1+ring)+(grain-.5)*3);}
    else if(m.kind==='foliage'){const leaves=noise(x*24,y*24,z*24,seed);color=color.map((c,k)=>c*(.7+leaves*.55)+(k===1?8*grain:0));}
    else if(m.kind==='wood'){const g=Math.sin(x*14+noise(x*2,y*.7,z*2,seed)*10);color=color.map(c=>c*(.85+g*.08+n*.22));}
    else if(m.kind==='stone'||m.kind==='plaster'){color=color.map(c=>c*(.965+grain*.06)+(n-.5)*5);}
    return {color,confidence,unlit};
  }
  function rotationMatrix(r){const a=r[0]*RAD,b=r[1]*RAD,c=r[2]*RAD,cx=Math.cos(a),sx=Math.sin(a),cy=Math.cos(b),sy=Math.sin(b),cz=Math.cos(c),sz=Math.sin(c);return [cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,-sy,cy*sx,cy*cx];}
  const rot=(m,x,y,z)=>[m[0]*x+m[1]*y+m[2]*z,m[3]*x+m[4]*y+m[5]*z,m[6]*x+m[7]*y+m[8]*z];
  function cameraState(c,w,h){const yaw=c.yaw*RAD,pitch=c.pitch*RAD,offset=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],position=c.target.map((v,k)=>v+offset[k]*c.distance),forward=offset.map(v=>-v),right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];return {position,forward,right,up,focal:h/(2*Math.tan(c.fov*RAD/2)),w,h};}
  function render(input,options={}){
    P.assert(input);const start=Date.now(),program=options.time===null||options.time===undefined?input:P.atTime(input,options.time),w=options.width||program.width,h=options.height||program.height;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<32||h<32||w>4096||h>4096||w*h>8000000)throw new Error('CRF renderer: invalid render dimensions');
    const quality=options.quality||'preview';if(!['preview','final'].includes(quality))throw new Error('CRF renderer: quality must be preview or final');
    const count=w*h,rgba=new Uint8ClampedArray(count*4),ids=new Int32Array(count).fill(-1),depth=new Float32Array(count).fill(Infinity),confidence=new Float32Array(count).fill(1),normals=options.normals?new Float32Array(count*3):null;
    const cam=cameraState(program.camera,w,h),L=program.light,la=L.azimuth*RAD,le=L.elevation*RAD,light=[Math.sin(la)*Math.cos(le),Math.sin(le),Math.cos(la)*Math.cos(le)],floor=program.environment.floor,bg=program.environment.background,warm=[1+L.temperature*.12,1+L.temperature*.025,1-L.temperature*.12],courtyard=program.id==='courtyard';
    const shadows=program.objects.filter(o=>o.visible&&o.opacity!==0&&!/wall|window|sill|lintel|jamb|mullion|crossbar|plinth/.test(o.id)).map(o=>{const s=o.surface,t=o.transform,r=(s.kind==='box'?Math.max(s.width,s.depth)/2:s.radius)*Math.max(t.scale[0],t.scale[2]),height=s.height*t.scale[1],x=t.position[0],z=t.position[2],y=t.position[1]+height*.43;return {x,z,y,r,height,strength:(o.opacity??1)*(o.material.kind==='foliage'?.16:.37),sx:x-light[0]/light[1]*y,sz:z-light[2]/light[1]*y};});
    // The floor is the declared analytic hybrid. All discrete objects use the same Gaussian path below.
    for(let py=0;py<h;py++)for(let px=0;px<w;px++){const i=py*w+px,k=i*4,sx=(px+.5-w/2)/cam.focal,sy=(h/2-py-.5)/cam.focal,ray=[cam.forward[0]+cam.right[0]*sx+cam.up[0]*sy,cam.forward[1]+cam.right[1]*sx+cam.up[1]*sy,cam.forward[2]+cam.right[2]*sx+cam.up[2]*sy];let c;
      const t=ray[1]<-.00001?-cam.position[1]/ray[1]:-1;
      if(t>0&&t<10000){const x=cam.position[0]+ray[0]*t,z=cam.position[2]+ray[2]*t,footprint=Math.max(.008,t/cam.focal/Math.max(.1,-ray[1]));let f=1;
        if(floor.texture==='stone'){const micro=1-clamp(footprint*18);f=.975+.035*noise(x*3,z*3,0,program.seed)+.035*micro*(noise(x*17,z*17,0,program.seed)-.5);if(courtyard){const gx=Math.abs(((x/1.5)%1+1)%1-.5)*1.5,gz=Math.abs(((z/1.5)%1+1)%1-.5)*1.5,edge=Math.max(gx,gz),line=clamp((edge-.74+footprint*.5)/Math.max(.012,footprint));f*=1-line*.19;}}
        if(floor.texture==='wood'){const micro=1-clamp(footprint*15),grain=Math.sin(x*14+noise(x*1.3,z*.25,0,program.seed)*3);f=.91+.08*noise(x*3,z*.4,0,program.seed)+grain*.035*micro;const edge=Math.abs(((x/1.25)%1+1)%1-.5)*1.25,line=clamp((edge-.617+footprint*.5)/Math.max(.012,footprint));f*=1-line*.15;}
        let shade=1;for(const sh of shadows){const dx=x-sh.x,dz=z-sh.z,direct=Math.exp(-(dx*dx+dz*dz)/(sh.r*sh.r*.72+.025))*sh.strength*.9;const ex=x-sh.sx,ez=z-sh.sz,along=ex*light[0]+ez*light[2],across=ex*light[2]-ez*light[0],extended=Math.exp(-across*across/(sh.r*sh.r+.05)-along*along/(sh.r*sh.r+sh.height*sh.height*.13+.1))*sh.strength*.53;shade*=1-clamp(direct+extended,0,.8);}
        if(courtyard&&x<-3.6&&z<1.5)shade*=.8;
        const fog=clamp((t-10)/35,0,1),diffuse=.77+.12*L.ambient+.14*L.intensity,grad=.91+.11*(1-py/h);
        c=floor.color.map((v,k)=>mix(v*f*shade*diffuse*warm[k],bg[k]*grad,fog));depth[i]=t;confidence[i]=1;
      }else{const grad=.91+.11*(1-py/h);c=bg.map(v=>v*grad);}
      rgba[k]=clamp(c[0],0,255);rgba[k+1]=clamp(c[1],0,255);rgba[k+2]=clamp(c[2],0,255);rgba[k+3]=255;
    }
    const nearest=new Float32Array(count).fill(Infinity),weight=new Float32Array(count),red=new Float32Array(count),green=new Float32Array(count),blue=new Float32Array(count),confSum=new Float32Array(count),alphaSum=new Float32Array(count),nearestID=new Int32Array(count).fill(-1);
    const normalSum=normals?new Float32Array(count*3):null;let sampleCount=0,visibleSamples=0,contributions=0,observedSamples=0,generatedSamples=0;
    const perObject=[];
    // Pass 0 establishes the complete depth surface before any color accumulation.
    // Pass 1 blends every compatible Gaussian; nearer arrivals can no longer erase neighbors.
    for(let pass=0;pass<2;pass++)for(let oi=0;oi<program.objects.length;oi++){const o=program.objects[oi];if(!o.visible||(o.opacity??1)<=0)continue;const s=o.surface,m=o.material,t=o.transform,scale=t.scale,maxScale=Math.max(...scale),matrix=rotationMatrix(t.rotation),worldPixel=program.camera.distance/cam.focal;
      const area=s.kind==='box'?2*(s.width*s.height+s.width*s.depth+s.height*s.depth):TAU*s.radius*s.height*1.4;
      const spacing=Math.max(.0055,worldPixel*(quality==='final'?.85:1.08)/maxScale,Math.sqrt(area/230000)),g=geometry(s,spacing),a=g.data,opacity=o.opacity??1;if(pass){sampleCount+=g.count;if(o.source.kind==='observed_fit')observedSamples+=g.count;else generatedSamples+=g.count;}let visible=0;
      for(let j=0;j<a.length;j+=9){const p=rot(matrix,a[j]*scale[0],a[j+1]*scale[1],a[j+2]*scale[2]),normal0=rot(matrix,a[j+3]/scale[0],a[j+4]/scale[1],a[j+5]/scale[2]),n=norm(...normal0),pos=[p[0]+t.position[0],p[1]+t.position[1],p[2]+t.position[2]],rel=[pos[0]-cam.position[0],pos[1]-cam.position[1],pos[2]-cam.position[2]],z=dot(rel,cam.forward);if(z<=.12)continue;
        let nv=-dot(n,rel)/Math.hypot(...rel);if(nv<-.08&&a[j+8]!==2)continue;if(nv<0){n[0]*=-1;n[1]*=-1;n[2]*=-1;nv=-nv;}
        const px=w/2+dot(rel,cam.right)*cam.focal/z,py=h/2-dot(rel,cam.up)*cam.focal/z,sigma=clamp(spacing*maxScale*cam.focal/z*.70,.54,3.4),radius=Math.ceil(sigma*2.45);if(px<-radius||px>=w+radius||py<-radius||py>=h+radius)continue;
        const base=pass?baseMaterial(m,a[j],a[j+1],a[j+2],a[j+6],a[j+7],a[j+8]):null,nd=Math.max(0,dot(n,light)),view=norm(-rel[0],-rel[1],-rel[2]),half=norm(light[0]+view[0],light[1]+view[1],light[2]+view[2]),nh=Math.max(0,dot(n,half)),rough=m.roughness,exponent=12+130*Math.pow(1-rough,2),spec=Math.pow(nh,exponent)*(1-rough)*48*L.intensity;
        const hemi=.75+.25*clamp(n[1]*.5+.5),contact=.86+.14*clamp(pos[1]/.28),lit=(L.ambient*1.08*hemi+nd*L.intensity*.73+.10)*contact;
        const color=!pass?null:base.unlit?base.color.map((c,k)=>clamp(c*(.92+.08*L.intensity)*(1+L.temperature*(k===0?.025:k===2?-.025:0)),0,255)):base.color.map((c,k)=>clamp(c*lit*warm[k]+spec*(k===2?.94:1),0,255));
        const x0=Math.max(0,Math.floor(px-radius)),x1=Math.min(w-1,Math.ceil(px+radius)),y0=Math.max(0,Math.floor(py-radius)),y1=Math.min(h-1,Math.ceil(py+radius)),inv=.5/(sigma*sigma),tolerance=Math.max(spacing*maxScale*6,s.height*maxScale*.18),nr=dot(n,cam.right),nu=dot(n,cam.up),centerDen=dot(n,rel)/z;
        for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){const dx=xx+.5-px,dy=yy+.5-py,d2=(dx*dx+dy*dy)*inv;if(d2>3.5)continue;const index=yy*w+xx,den=centerDen+(dx*nr-dy*nu)/cam.focal,planeZ=Math.abs(den)>.0001?z*centerDen/den:z,sampleZ=s.kind==='box'&&planeZ>.12?clamp(planeZ,z-spacing*maxScale*2,z+spacing*maxScale*2):z;if(sampleZ>depth[index]+spacing*maxScale)continue;
          if(!pass){if(sampleZ<nearest[index]){nearest[index]=sampleZ;nearestID[index]=oi;}continue;}
          if(nearestID[index]!==oi||sampleZ>nearest[index]+tolerance)continue;const wz=Math.exp(-d2);weight[index]+=wz;red[index]+=color[0]*wz;green[index]+=color[1]*wz;blue[index]+=color[2]*wz;confSum[index]+=base.confidence*wz;alphaSum[index]+=opacity*wz;if(normalSum){normalSum[index*3]+=n[0]*wz;normalSum[index*3+1]+=n[1]*wz;normalSum[index*3+2]+=n[2]*wz;}contributions++;}
        if(pass){visible++;visibleSamples++;}
      }if(pass)perObject.push({id:o.id,samples:g.count,visibleSamples:visible,source:o.source.kind,material:m.kind});
    }
    let objectPixels=0,inferredPixels=0;
    for(let i=0;i<count;i++){const a=weight[i];if(a<=0)continue;const k=i*4,opacity=alphaSum[i]/a,coverage=clamp(a*2.4)*opacity;rgba[k]=mix(rgba[k],red[i]/a,coverage);rgba[k+1]=mix(rgba[k+1],green[i]/a,coverage);rgba[k+2]=mix(rgba[k+2],blue[i]/a,coverage);if(coverage>.18){ids[i]=nearestID[i];depth[i]=nearest[i];confidence[i]=confSum[i]/a;objectPixels++;if(confidence[i]<.5)inferredPixels++;if(normals){const n=norm(normalSum[i*3],normalSum[i*3+1],normalSum[i*3+2]);normals.set(n,i*3);}}}
    const stats={backend:'cpu-perspective-gaussian',quality,sampleCount,visibleSamples,contributions,observedSamples,generatedSamples,objectPixels,inferredPixels,elapsedMs:Date.now()-start,sourceImageBlit:false,sharedGeometryAndVisibility:true,perspectiveCamera:true,groundMethod:'analytic_ray_plane',shadowMethod:'approximate_soft_contact_ellipses',physicalRelighting:false,perObject};
    return {width:w,height:h,rgba,ids,depth,confidence,...(normals?{normals}:{}),stats};
  }
  return {VERSION:'0.6.0',render,clearCaches(){geoCache.clear();fieldCache.clear();fieldObjects=new WeakMap();cacheBytes=0;},_internals:{sampleProfile,radiusAt,geometry,cameraState,baseMaterial,tintField}};
});
