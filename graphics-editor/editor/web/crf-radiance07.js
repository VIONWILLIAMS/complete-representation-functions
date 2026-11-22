/* CRF 0.7: deterministic, code-native ray transport. No image textures or eval. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CRFRadiance07=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PI=Math.PI,TAU=2*PI,EPS=0.00012,INF=1e20;
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const length=a=>Math.hypot(...a);
  const unit=a=>{const d=length(a)||1;return mul(a,1/d);};
  const reflect=(d,n)=>sub(d,mul(n,2*dot(d,n)));
  const at=(o,d,t)=>[o[0]+d[0]*t,o[1]+d[1]*t,o[2]+d[2]*t];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const srgb=v=>{v=clamp(v/255);return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);};
  const linear=color=>color.map(srgb);
  function hash(x,y,z,seed){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647)^Math.imul(seed|0,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
  function noise(x,y,z,seed=0){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),f=t=>t*t*(3-2*t),u=f(x-X),v=f(y-Y),w=f(z-Z);return mix(mix(mix(hash(X,Y,Z,seed),hash(X+1,Y,Z,seed),u),mix(hash(X,Y+1,Z,seed),hash(X+1,Y+1,Z,seed),u),v),mix(mix(hash(X,Y,Z+1,seed),hash(X+1,Y,Z+1,seed),u),mix(hash(X,Y+1,Z+1,seed),hash(X+1,Y+1,Z+1,seed),u),v),w);}
  function fbm(x,y,z,seed=0){return noise(x,y,z,seed)*.55+noise(x*2.03+5.7,y*2.03-2.2,z*2.03+1.3,seed+7)*.28+noise(x*4.17-3,y*4.17+1.7,z*4.17+4.8,seed+13)*.17;}
  function voronoi(x,y,z,seed=0){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z);let closest=9;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){const ix=X+a,iy=Y+b,iz=Z+c,dx=ix+.15+.7*hash(ix,iy,iz,seed)-x,dy=iy+.15+.7*hash(ix,iy,iz,seed+1)-y,dz=iz+.15+.7*hash(ix,iy,iz,seed+2)-z;closest=Math.min(closest,dx*dx+dy*dy+dz*dz);}return clamp(Math.sqrt(closest));}
  function random(seed){let state=seed>>>0;return ()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  function matrix(rotation){const [a,b,c]=rotation.map(x=>x*PI/180),cx=Math.cos(a),sx=Math.sin(a),cy=Math.cos(b),sy=Math.sin(b),cz=Math.cos(c),sz=Math.sin(c);return [cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,-sy,cy*sx,cy*cx];}
  const rotate=(m,p)=>[m[0]*p[0]+m[1]*p[1]+m[2]*p[2],m[3]*p[0]+m[4]*p[1]+m[5]*p[2],m[6]*p[0]+m[7]*p[1]+m[8]*p[2]];
  const unrotate=(m,p)=>[m[0]*p[0]+m[3]*p[1]+m[6]*p[2],m[1]*p[0]+m[4]*p[1]+m[7]*p[2],m[2]*p[0]+m[5]*p[1]+m[8]*p[2]];
  const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(x);
  const allowedTextures=new Set(['none','wood','stone','orange','ceramic','fabric','asphalt']);
  function validate(program){
    const errors=[],error=(path,message)=>errors.push(path+': '+message);
    const number=(v,path,min,max,optional=false)=>{if(v===undefined&&optional)return;if(!finite(v)||v<min||v>max)error(path,'expected finite number '+min+'..'+max);};
    const vector=(v,path,min,max)=>{if(!Array.isArray(v)||v.length!==3){error(path,'expected three numbers');return;}v.forEach((x,i)=>number(x,path+'['+i+']',min,max));};
    if(!isObject(program))return {valid:false,errors:['program: expected an object']};
    if(program.schema!=='crf.image_program.v0.7')error('schema','expected crf.image_program.v0.7');
    if(!safeId(program.id))error('id','invalid ID');
    if(typeof program.title!=='string'||program.title.length>200)error('title','expected a title up to200characters');
    for(const k of['width','height']){number(program[k],k,64,2048);if(!Number.isInteger(program[k]))error(k,'expected integer');}
    if(program.width*program.height>2100000)error('dimensions','pixel budget exceeded');
    number(program.seed,'seed',0,2147483647);if(!Number.isInteger(program.seed))error('seed','expected integer');
    number(program.exposure,'exposure',.05,8,true);
    const camera=program.camera;
    if(!isObject(camera))error('camera','required');else{
      vector(camera.position,'camera.position',-200,200);vector(camera.target,'camera.target',-200,200);
      number(camera.fov,'camera.fov',10,110);number(camera.aperture,'camera.aperture',0,1,true);number(camera.focusDistance,'camera.focusDistance',.1,300,true);
      if(Array.isArray(camera.position)&&Array.isArray(camera.target)&&length(sub(camera.position,camera.target))<.01)error('camera','position and target must differ');
    }
    const env=program.environment;
    if(!isObject(env))error('environment','required');else{vector(env.top,'environment.top',0,255);vector(env.bottom,'environment.bottom',0,255);number(env.strength,'environment.strength',0,8);}
    if(!Array.isArray(program.lights)||program.lights.length>8)error('lights','expected up to8area lights');else{
      const ids=new Set();program.lights.forEach((l,i)=>{const p='lights['+i+']';if(!isObject(l)){error(p,'expected object');return;}if(!safeId(l.id)||ids.has(l.id))error(p+'.id','invalid or duplicate ID');ids.add(l.id);if(l.type!=='area')error(p+'.type','expected area');vector(l.position,p+'.position',-200,200);vector(l.target,p+'.target',-200,200);if(Array.isArray(l.position)&&Array.isArray(l.target)&&length(sub(l.position,l.target))<.01)error(p,'position and target must differ');if(!Array.isArray(l.size)||l.size.length!==2)error(p+'.size','expected width and height');else l.size.forEach((x,j)=>number(x,p+'.size['+j+']',.05,30));vector(l.color,p+'.color',0,255);number(l.intensity,p+'.intensity',0,120);});
    }
    function expression(node,path,counter,depth){
      counter.n++;if(counter.n>96||depth>12){error(path,'function budget exceeded');return;}
      if(!isObject(node)||typeof node.op!=='string'){error(path,'invalid expression');return;}
      const op=node.op;
      if(op==='const'){number(node.value,path+'.value',-100,100);return;}
      if(['x','y','z'].includes(op))return;
      if(['noise','fbm','voronoi'].includes(op)){number(node.frequency,path+'.frequency',.001,1000,true);number(node.seed,path+'.seed',0,2147483647,true);return;}
      const count=['add','mul'].includes(op)?-1:['sin','abs','clamp'].includes(op)?1:0;
      if(!count){error(path+'.op','unknown operation');return;}
      if(!Array.isArray(node.args)||(count===-1?(node.args.length<2||node.args.length>8):node.args.length!==count)){error(path+'.args','expected '+(count===-1?'2..8':count)+' operands');return;}
      if(op==='clamp'){number(node.min,path+'.min',-100,100,true);number(node.max,path+'.max',-100,100,true);if((node.min??0)>(node.max??1))error(path,'min exceeds max');}
      node.args.forEach((n,i)=>expression(n,path+'.args['+i+']',counter,depth+1));
    }
    if(!Array.isArray(program.objects)||program.objects.length<1||program.objects.length>64)error('objects','expected1..64objects');else{
      const ids=new Set();program.objects.forEach((o,i)=>{
        const p='objects['+i+']';if(!isObject(o)){error(p,'expected object');return;}
        if(!safeId(o.id)||ids.has(o.id))error(p+'.id','invalid or duplicate ID');ids.add(o.id);
        if(o.visible!==undefined&&typeof o.visible!=='boolean')error(p+'.visible','expected boolean');
        if(o.label!==undefined&&(typeof o.label!=='string'||o.label.length>200))error(p+'.label','invalid label');
        const s=o.surface;if(!isObject(s)){error(p+'.surface','required');}else{
          if(!['ellipsoid','box','cylinder','lathe'].includes(s.kind))error(p+'.surface.kind','unsupported geometry');
          number(s.height,p+'.surface.height',.005,100);
          if(s.kind==='box'){number(s.width,p+'.surface.width',.005,100);number(s.depth,p+'.surface.depth',.005,100);number(s.bevel,p+'.surface.bevel',0,10,true);if(s.bevel>Math.min(s.width,s.height,s.depth)/2)error(p+'.surface.bevel','bevel exceeds half the smallest dimension');}else number(s.radius,p+'.surface.radius',.005,20);
          if(s.kind==='lathe'){if(!Array.isArray(s.profile)||s.profile.length<3||s.profile.length>64)error(p+'.surface.profile','expected3..64radii');else{s.profile.forEach((v,j)=>number(v,p+'.surface.profile['+j+']',0,1.5));if(!s.profile.some(x=>x>.01))error(p+'.surface.profile','degenerate profile');}number(s.thickness,p+'.surface.thickness',0,.5,true);}
        }
        const t=o.transform;if(!isObject(t))error(p+'.transform','required');else{vector(t.position,p+'.transform.position',-200,200);vector(t.rotation,p+'.transform.rotation',-3600,3600);vector(t.scale,p+'.transform.scale',.01,20);}
        const m=o.material;if(!isObject(m)){error(p+'.material','required');return;}
        vector(m.color,p+'.material.color',0,255);number(m.roughness,p+'.material.roughness',.025,1);number(m.metalness,p+'.material.metalness',0,1,true);number(m.transmission,p+'.material.transmission',0,1,true);number(m.ior,p+'.material.ior',1,2.5,true);number(m.bump,p+'.material.bump',0,.25,true);
        if(m.texture!==undefined){if(!isObject(m.texture)||!allowedTextures.has(m.texture.kind))error(p+'.material.texture','unsupported texture');else{number(m.texture.scale,p+'.material.texture.scale',.01,200,true);number(m.texture.strength,p+'.material.texture.strength',0,1,true);}}
        if(m.emission!==undefined)vector(m.emission,p+'.material.emission',0,255);number(m.emissionStrength,p+'.material.emissionStrength',0,100,true);
        if(m.function!==undefined)expression(m.function,p+'.material.function',{n:0},0);
      });
    }
    return {valid:errors.length===0,errors};
  }
  function assert(p){const r=validate(p);if(!r.valid)throw new Error('CRF image program: '+r.errors.slice(0,12).join('; '));return p;}
  function compileExpression(node){
    if(!node)return ()=>1;
    if(node.op==='const')return ()=>node.value;
    if(node.op==='x')return (x)=>x;if(node.op==='y')return (x,y)=>y;if(node.op==='z')return (x,y,z)=>z;
    if(['noise','fbm','voronoi'].includes(node.op)){const f=node.frequency??1,s=node.seed??0,func={noise,fbm,voronoi}[node.op];return (x,y,z)=>func(x*f,y*f,z*f,s);}
    if(node.op==='add'||node.op==='mul'){const operands=node.args.map(compileExpression),multiply=node.op==='mul';return(x,y,z)=>{let value=operands[0](x,y,z);for(let i=1;i<operands.length;i++)value=multiply?value*operands[i](x,y,z):value+operands[i](x,y,z);return value;};}
    const a=compileExpression(node.args[0]);
    if(node.op==='sin')return(x,y,z)=>Math.sin(a(x,y,z));
    if(node.op==='abs')return(x,y,z)=>Math.abs(a(x,y,z));
    return(x,y,z)=>clamp(a(x,y,z),node.min??0,node.max??1);
  }
  function applyOps(input,ops){
    assert(input);if(!Array.isArray(ops)||ops.length<1||ops.length>100)throw new Error('Provide1..100operations');const p=clone(input);
    for(const op of ops){if(!isObject(op))throw new Error('Invalid operation');
      if(op.op==='add'){p.objects.push(clone(op.object));continue;}
      if(op.op==='remove'){const i=p.objects.findIndex(x=>x.id===op.id);if(i<0)throw new Error('Object not found: '+op.id);p.objects.splice(i,1);continue;}
      if(['camera','environment','light'].includes(op.op)){const target=op.op==='light'?p.lights.find(l=>l.id===op.id):p[op.op];if(!target||!isObject(op.values))throw new Error('Invalid '+op.op+' edit');for(const [k,v]of Object.entries(op.values)){if(['__proto__','prototype','constructor'].includes(k))throw new Error('Forbidden path');target[k]=clone(v);}continue;}
      if(op.op!=='set'||typeof op.path!=='string'||!/^((surface|material|transform)\.|label$|visible$)/.test(op.path))throw new Error('Unsupported edit path');
      const o=p.objects.find(x=>x.id===op.id);if(!o)throw new Error('Object not found: '+op.id);const parts=op.path.split('.');if(parts.length>8||parts.some(x=>!x||['__proto__','prototype','constructor'].includes(x)))throw new Error('Forbidden path');let target=o;for(const k of parts.slice(0,-1)){if(!isObject(target[k])&&!Array.isArray(target[k]))throw new Error('Missing path '+op.path);target=target[k];}target[parts.at(-1)]=clone(op.value);
    }
    assert(p);return p;
  }
  function bounds(object){const s=object.surface,r=s.radius?Math.max(s.radius,...(s.profile||[]).map(x=>x*s.radius)):0,min=[s.kind==='box'?-s.width/2:-r,0,s.kind==='box'?-s.depth/2:-r],max=[-min[0],s.height,-min[2]],lo=[INF,INF,INF],hi=[-INF,-INF,-INF];for(let i=0;i<8;i++){const q=[i&1?max[0]:min[0],i&2?max[1]:min[1],i&4?max[2]:min[2]],v=add(rotate(object.rotation,q.map((x,k)=>x*object.transform.scale[k])),object.transform.position);for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],v[k]-EPS);hi[k]=Math.max(hi[k],v[k]+EPS);}}return {lo,hi};}
  function buildBVH(objects){if(!objects.length)return null;const lo=[INF,INF,INF],hi=[-INF,-INF,-INF];for(const o of objects)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],o.bounds.lo[k]);hi[k]=Math.max(hi[k],o.bounds.hi[k]);}if(objects.length<=3)return {lo,hi,objects};const lengths=sub(hi,lo),axis=lengths.indexOf(Math.max(...lengths));objects.sort((a,b)=>(a.bounds.lo[axis]+a.bounds.hi[axis])-(b.bounds.lo[axis]+b.bounds.hi[axis]));const mid=objects.length>>1;return {lo,hi,left:buildBVH(objects.slice(0,mid)),right:buildBVH(objects.slice(mid))};}
  function aabb(node,o,d,maxT){let near=EPS,far=maxT;for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-12){if(o[k]<node.lo[k]||o[k]>node.hi[k])return false;continue;}let a=(node.lo[k]-o[k])/d[k],b=(node.hi[k]-o[k])/d[k];if(a>b){const t=a;a=b;b=t;}near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;}return true;}
  function intersectObject(obj,origin,direction,maxT){
    const p=unrotate(obj.rotation,sub(origin,obj.transform.position)).map((v,k)=>v/obj.transform.scale[k]),d=unrotate(obj.rotation,direction).map((v,k)=>v/obj.transform.scale[k]),s=obj.surface;
    let closest=maxT,normal=null;
    const accept=(t,n)=>{if(t>EPS&&t<closest){closest=t;normal=n;}};
    if(s.kind==='ellipsoid'){
      const rr=s.radius*s.radius,hh=s.height*s.height/4,y=p[1]-s.height/2,A=(d[0]*d[0]+d[2]*d[2])/rr+d[1]*d[1]/hh,B=(p[0]*d[0]+p[2]*d[2])/rr+y*d[1]/hh,C=(p[0]*p[0]+p[2]*p[2])/rr+y*y/hh-1,disc=B*B-A*C;
      if(disc>=0){const root=Math.sqrt(disc);for(const t of[(-B-root)/A,(-B+root)/A])if(t>EPS&&t<closest){const q=at(p,d,t);accept(t,[q[0]/rr,(q[1]-s.height/2)/hh,q[2]/rr]);}}
    }else if(s.kind==='box'){
      const lo=[-s.width/2,0,-s.depth/2],hi=[s.width/2,s.height,s.depth/2];let near=-INF,far=INF,nearAxis=0,farAxis=0,nearSign=0,farSign=0,valid=true;
      for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-12){if(p[k]<lo[k]||p[k]>hi[k]){valid=false;break;}continue;}let a=(lo[k]-p[k])/d[k],b=(hi[k]-p[k])/d[k],sign=-1;if(a>b){const t=a;a=b;b=t;sign=1;}if(a>near){near=a;nearAxis=k;nearSign=sign;}if(b<far){far=b;farAxis=k;farSign=-sign;}if(near>far){valid=false;break;}}
      if(valid&&s.bevel>0){
        const r=s.bevel,half=[s.width/2-r,s.height/2-r,s.depth/2-r],speed=length(d),distance=q=>{const z=[Math.abs(q[0])-half[0],Math.abs(q[1]-s.height/2)-half[1],Math.abs(q[2])-half[2]];return Math.hypot(Math.max(z[0],0),Math.max(z[1],0),Math.max(z[2],0))+Math.min(Math.max(...z),0)-r;};
        let t=Math.max(near,EPS*2),limit=Math.min(far,closest);
        for(let step=0;step<64&&t<=limit;step++){const q=at(p,d,t),value=distance(q);if(Math.abs(value)<.000025){const delta=.00004,n=[distance([q[0]+delta,q[1],q[2]])-distance([q[0]-delta,q[1],q[2]]),distance([q[0],q[1]+delta,q[2]])-distance([q[0],q[1]-delta,q[2]]),distance([q[0],q[1],q[2]+delta])-distance([q[0],q[1],q[2]-delta])];accept(t,n);break;}t+=Math.max(.00001,Math.abs(value)*.9/speed);}
      }else if(valid){const n=[0,0,0];if(near>EPS){n[nearAxis]=nearSign;accept(near,n);}else{n[farAxis]=farSign;accept(far,n);}}
    }else if(s.kind==='cylinder'){
      const A=d[0]*d[0]+d[2]*d[2],B=p[0]*d[0]+p[2]*d[2],C=p[0]*p[0]+p[2]*p[2]-s.radius*s.radius,disc=B*B-A*C;
      if(A>1e-12&&disc>=0){const root=Math.sqrt(disc);for(const t of[(-B-root)/A,(-B+root)/A]){const y=p[1]+d[1]*t;if(y>=0&&y<=s.height)accept(t,[p[0]+d[0]*t,0,p[2]+d[2]*t]);}}
      if(Math.abs(d[1])>1e-12)for(const y of[0,s.height]){const t=(y-p[1])/d[1],x=p[0]+d[0]*t,z=p[2]+d[2]*t;if(x*x+z*z<=s.radius*s.radius)accept(t,[0,y===0?-1:1,0]);}
    }else{
      const profile=s.profile,dy=s.height/(profile.length-1),wall=s.thickness||0;
      for(let inner=0;inner<=(wall>0?1:0);inner++)for(let i=0;i<profile.length-1;i++){
        let y0=i*dy,y1=(i+1)*dy;if(inner)y0=Math.max(y0,wall);if(y0>=y1)continue;
        const k=s.radius*(profile[i+1]-profile[i])/dy,b=s.radius*profile[i]-k*i*dy-inner*wall;
        if(Math.max(k*y0+b,k*y1+b)<=.0001)continue;
        const py=k*p[1]+b,dd=k*d[1],A=d[0]*d[0]+d[2]*d[2]-dd*dd,B=2*(p[0]*d[0]+p[2]*d[2]-py*dd),C=p[0]*p[0]+p[2]*p[2]-py*py;
        let roots;if(Math.abs(A)<1e-12)roots=Math.abs(B)>1e-12?[-C/B]:[];else{const disc=B*B-4*A*C;if(disc<0)continue;const root=Math.sqrt(disc);roots=[(-B-root)/(2*A),(-B+root)/(2*A)];}
        for(const t of roots)if(t>EPS&&t<closest){const y=p[1]+d[1]*t,r=k*y+b;if(y>=y0-1e-8&&y<=y1+1e-8&&r>0){const previous=i>0?s.radius*(profile[i]-profile[i-1])/dy:k,next=i+2<profile.length?s.radius*(profile[i+2]-profile[i+1])/dy:k,slope=mix((previous+k)/2,(k+next)/2,clamp((y-i*dy)/dy)),n=[p[0]+d[0]*t,-slope*r,p[2]+d[2]*t];accept(t,inner?mul(n,-1):n);}}
      }
      if(Math.abs(d[1])>1e-12){
        for(const end of[0,1]){const y=end*s.height,r=s.radius*profile[end?profile.length-1:0],t=(y-p[1])/d[1],x=p[0]+d[0]*t,z=p[2]+d[2]*t,r2=x*x+z*z,inner=end&&wall>0?Math.max(0,r-wall):0;if(r2<=r*r&&r2>=inner*inner)accept(t,[0,end?1:-1,0]);}
        if(wall>0){const y=wall,u=y/dy,i=Math.min(profile.length-2,Math.floor(u)),r=Math.max(0,s.radius*mix(profile[i],profile[i+1],u-i)-wall),t=(y-p[1])/d[1],x=p[0]+d[0]*t,z=p[2]+d[2]*t;if(x*x+z*z<=r*r)accept(t,[0,1,0]);}
      }
    }
    if(!normal)return null;
    const geometric=unit(rotate(obj.rotation,normal.map((v,k)=>v/obj.transform.scale[k]))),front=dot(direction,geometric)<0;
    return {t:closest,object:obj,point:at(origin,direction,closest),local:at(p,d,closest),normal:front?geometric:mul(geometric,-1),outward:geometric,front};
  }
  function trace(ctx,origin,direction,maxT=INF,includeLights=true){let closest=maxT,result=null;const stack=ctx.bvh?[ctx.bvh]:[];while(stack.length){const node=stack.pop();if(!aabb(node,origin,direction,closest))continue;if(node.objects){for(const obj of node.objects){if(!aabb(obj.bounds,origin,direction,closest))continue;const hit=intersectObject(obj,origin,direction,closest);if(hit){closest=hit.t;result=hit;}}}else{stack.push(node.left,node.right);}}
    if(includeLights)for(const light of ctx.lights){const den=dot(direction,light.normal);if(den>=-1e-7)continue;const t=dot(sub(light.position,origin),light.normal)/den;if(t<=EPS||t>=closest)continue;const point=at(origin,direction,t),rel=sub(point,light.position);if(Math.abs(dot(rel,light.u))>light.size[0]/2||Math.abs(dot(rel,light.v))>light.size[1]/2)continue;closest=t;result={t,point,light,normal:light.normal,front:true};}
    return result;
  }
  function shadow(ctx,origin,direction,distance){let color=[1,1,1],remaining=distance;for(let step=0;step<5;step++){const hit=trace(ctx,origin,direction,remaining-EPS,false);if(!hit)return color;const m=hit.object.material;if((m.transmission||0)<.05)return [0,0,0];for(let k=0;k<3;k++)color[k]*=(.55+.45*hit.object.base[k])*m.transmission*.94;remaining-=hit.t+EPS*3;if(remaining<=EPS)return color;origin=at(hit.point,direction,EPS*3);}return [0,0,0];}
  function environment(ctx,d){const t=clamp(d[1]*.5+.5);return ctx.envBottom.map((v,k)=>mix(v,ctx.envTop[k],t)*ctx.program.environment.strength);}
  function materialAt(hit){
    const obj=hit.object,m=obj.material,t=m.texture||{kind:'none'},scale=t.scale??1,strength=t.strength??.5,p=hit.local,x=p[0],y=p[1],z=p[2],seed=obj.seed;let factor=1,rough=m.roughness;
    if(t.kind==='wood'){const warp=fbm(x*.9*scale,y*.13*scale,z*.17*scale,seed),wave=.5+.5*Math.sin((x*14*scale+warp*6)*PI);factor=1-strength*(.10+.3*Math.pow(wave,7))+.07*strength*noise(x*45*scale,y*2,z*.7*scale,seed+9);}
    else if(t.kind==='stone'){const n=fbm(x*scale,y*scale,z*scale,seed),vein=Math.pow(Math.max(0,1-Math.abs(Math.sin(x*1.3*scale+z*.7*scale+n*5))*5),4);factor=1+strength*((n-.5)*.3-vein*.5);}
    else if(t.kind==='orange'){const u=Math.atan2(z,x)/TAU,v=y/obj.surface.height,fx=u*96*scale,fy=v*84*scale,X=Math.floor(fx),Y=Math.floor(fy);let nearest=9;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const dx=X+a+.2+.6*hash(X+a,Y+b,0,seed)-fx,dy=Y+b+.2+.6*hash(X+a,Y+b,0,seed+1)-fy;nearest=Math.min(nearest,dx*dx+dy*dy);}const pores=Math.exp(-nearest*9),patch=fbm(x*3,y*3,z*3,seed);factor=1+strength*((patch-.5)*.25-pores*.34);rough=clamp(rough+.14*pores,.025,1);}
    else if(t.kind==='ceramic'){factor=1+strength*(noise(x*80*scale,y*80*scale,z*80*scale,seed)-.5)*.08;}
    else if(t.kind==='fabric'){const weave=Math.sin(x*95*scale)*Math.sin(y*95*scale+z*95*scale);factor=1+strength*(weave*.08+(noise(x*18*scale,y*18*scale,z*18*scale,seed)-.5)*.15);}
    else if(t.kind==='asphalt'){const n=noise(x*45*scale,y*45*scale,z*45*scale,seed);factor=1+strength*(n-.5)*.8;rough=clamp(rough+(n-.5)*.07,.025,1);}
    if(obj.expression)factor*=clamp(obj.expression(x,y,z),0,2);
    const color=obj.base.map(c=>clamp(c*factor,0,1)),normal=hit.normal;
    let shadingNormal=normal;
    if((m.bump||0)>0){const f=(t.kind==='orange'?50:t.kind==='wood'?28:t.kind==='fabric'?90:52)*scale,v=[noise(x*f+2,y*f,z*f,seed)-.5,noise(x*f,y*f+7,z*f,seed+3)-.5,noise(x*f,y*f,z*f+4,seed+8)-.5],w=rotate(obj.rotation,v),tangent=sub(w,mul(normal,dot(w,normal)));shadingNormal=unit(add(normal,mul(tangent,m.bump*3)));}
    return {color,roughness:rough,normal:shadingNormal,metalness:m.metalness||0,transmission:m.transmission||0,ior:m.ior||1.5};
  }
  function basis(n){const tangent=unit(cross(Math.abs(n[1])>.95?[1,0,0]:[0,1,0],n));return [tangent,cross(n,tangent)];}
  function fromBasis(n,x,y,z){const [u,v]=basis(n);return unit([u[0]*x+v[0]*y+n[0]*z,u[1]*x+v[1]*y+n[1]*z,u[2]*x+v[2]*y+n[2]*z]);}
  function cosineDirection(n,rng){const r=Math.sqrt(rng()),phi=TAU*rng();return fromBasis(n,r*Math.cos(phi),r*Math.sin(phi),Math.sqrt(Math.max(0,1-r*r)));}
  function ggxNormal(n,rough,rng){const a=rough*rough,u=rng(),cosTheta=Math.sqrt((1-u)/(1+(a*a-1)*u)),sinTheta=Math.sqrt(Math.max(0,1-cosTheta*cosTheta)),phi=TAU*rng();return fromBasis(n,sinTheta*Math.cos(phi),sinTheta*Math.sin(phi),cosTheta);}
  function bsdf(mat,n,v,l){
    const nv=Math.max(.00001,dot(n,v)),nl=Math.max(0,dot(n,l));if(nl<=0)return {value:[0,0,0],pdf:0};
    const h=unit(add(v,l)),nh=Math.max(0,dot(n,h)),vh=Math.max(.00001,dot(v,h)),a=mat.roughness*mat.roughness,a2=a*a,den=nh*nh*(a2-1)+1,D=a2/(PI*den*den),G1=c=>2*c/(c+Math.sqrt(a2+(1-a2)*c*c)),G=G1(nv)*G1(nl),f= Math.pow(1-vh,5),pSpec=.25+.5*mat.metalness;
    const value=mat.color.map(c=>{const f0=mix(.04,c,mat.metalness),F=f0+(1-f0)*f;return (1-mat.transmission)*((1-mat.metalness)*c*(1-F)/PI+D*G*F/(4*nv*nl));});
    return {value,pdf:(1-pSpec)*nl/PI+pSpec*D*nh/(4*vh)};
  }
  function refract(d,n,eta){const cos=-dot(d,n),k=1-eta*eta*(1-cos*cos);return k<0?null:add(mul(d,eta),mul(n,eta*cos-Math.sqrt(k)));}
  function integrate(ctx,origin,direction,rng,metadata){
    let result=[0,0,0],through=[1,1,1],specular=true,previousPdf=0,previousPoint=origin;
    for(let bounce=0;bounce<ctx.bounces;bounce++){
      const hit=trace(ctx,origin,direction);
      if(bounce===0&&metadata){metadata.id=hit?.object?.index??-1;metadata.depth=hit?hit.t:Infinity;}
      if(!hit){const env=environment(ctx,direction);for(let k=0;k<3;k++)result[k]+=through[k]*env[k];break;}
      if(hit.light){const distance=length(sub(hit.point,previousPoint)),lightPdf=distance*distance/Math.max(.000001,-dot(hit.light.normal,direction)*hit.light.area),weight=specular||bounce===0?1:previousPdf*previousPdf/(previousPdf*previousPdf+lightPdf*lightPdf);for(let k=0;k<3;k++)result[k]+=through[k]*hit.light.radiance[k]*weight;break;}
      const obj=hit.object,m=obj.material,mat=materialAt(hit),n=mat.normal,v=mul(direction,-1);
      if((m.emissionStrength||0)>0){for(let k=0;k<3;k++)result[k]+=through[k]*obj.emission[k]*(m.emissionStrength||0);}
      if(mat.transmission<.999)for(const light of ctx.lights){
        const point=add(light.position,add(mul(light.u,(rng()-.5)*light.size[0]),mul(light.v,(rng()-.5)*light.size[1]))),delta=sub(point,hit.point),distance=length(delta),l=mul(delta,1/distance),nl=dot(n,l),lc=-dot(light.normal,l);
        if(nl<=0||lc<=0)continue;const visibility=shadow(ctx,add(hit.point,mul(hit.normal,EPS*3)),l,distance);if(Math.max(...visibility)<=0)continue;
        const evaluated=bsdf(mat,n,v,l),f=evaluated.value,geometry=nl*lc*light.area/(distance*distance),lightPdf=distance*distance/(lc*light.area),bsdfPdf=evaluated.pdf*(1-mat.transmission),weight=bounce===ctx.bounces-1?1:lightPdf*lightPdf/(lightPdf*lightPdf+bsdfPdf*bsdfPdf);
        for(let k=0;k<3;k++)result[k]+=through[k]*f[k]*light.radiance[k]*geometry*visibility[k]*weight;
      }
      if(bounce===ctx.bounces-1)break;
      if(mat.transmission>0&&rng()<mat.transmission){
        const cos=clamp(-dot(direction,hit.normal)),eta=hit.front?1/mat.ior:mat.ior,r0=Math.pow((mat.ior-1)/(mat.ior+1),2),F=r0+(1-r0)*Math.pow(1-cos,5),transmitted=refract(direction,hit.normal,eta);
        if(!transmitted||rng()<F){direction=reflect(direction,hit.normal);origin=add(hit.point,mul(hit.normal,EPS*4));}else{direction=unit(transmitted);origin=add(hit.point,mul(hit.normal,-EPS*4));for(let k=0;k<3;k++)through[k]*=.91+.09*mat.color[k];}
        specular=true;
      }else{
        const pSpec=.25+.5*mat.metalness;
        direction=rng()<pSpec?reflect(mul(v,-1),ggxNormal(n,mat.roughness,rng)):cosineDirection(n,rng);
        const nl=dot(n,direction);if(nl<=0||dot(hit.normal,direction)<=0)break;
        const b=bsdf(mat,n,v,direction);if(b.pdf<=1e-9)break;
        for(let k=0;k<3;k++)through[k]*=b.value[k]*nl/b.pdf/(1-mat.transmission||1);
        origin=add(hit.point,mul(hit.normal,EPS*4));specular=false;previousPdf=b.pdf*(1-mat.transmission);previousPoint=hit.point;
      }
      if(bounce>=2){const probability=clamp(Math.max(...through),.12,.94);if(rng()>probability)break;through=mul(through,1/probability);}
      if(!through.every(Number.isFinite))break;
    }
    return result;
  }
  function prepare(program,options){
    assert(program);const width=options.width??program.width,height=options.height??program.height,samples=options.samples??8,bounces=options.bounces??5;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||width>2048||height>2048||width*height>2100000)throw new Error('Render dimension budget exceeded');
    if(!Number.isInteger(samples)||samples<1||samples>128||width*height*samples>128000000)throw new Error('Render sample budget exceeded');
    if(!Number.isInteger(bounces)||bounces<1||bounces>8)throw new Error('Render bounce budget exceeded');
    const objects=program.objects.map((o,index)=>{const obj={...o,index,rotation:matrix(o.transform.rotation),base:linear(o.material.color),emission:linear(o.material.emission||[0,0,0]),seed:program.seed+index*127,expression:o.material.function?compileExpression(o.material.function):null};obj.bounds=bounds(obj);return obj;}).filter(o=>o.visible!==false);
    const lights=program.lights.map(l=>{const n=unit(sub(l.target,l.position)),u=unit(cross(Math.abs(n[1])>.95?[1,0,0]:[0,1,0],n)),v=cross(n,u);return {...l,normal:n,u,v,area:l.size[0]*l.size[1],radiance:linear(l.color).map(c=>c*l.intensity)};});
    const c=program.camera,forward=unit(sub(c.target,c.position)),right=unit(cross(forward,Math.abs(forward[1])>.999?[0,0,1]:[0,1,0])),up=cross(right,forward),focus=c.focusDistance??length(sub(c.position,c.target));
    return {program,width,height,samples,bounces,denoise:options.denoise===true,objects,bvh:buildBVH(objects.slice()),lights,envTop:linear(program.environment.top),envBottom:linear(program.environment.bottom),camera:{...c,forward,right,up,focus,halfHeight:Math.tan(c.fov*PI/360)},rgba:new Uint8ClampedArray(width*height*4),ids:new Int32Array(width*height).fill(-1),depth:new Float32Array(width*height).fill(Infinity),started:Date.now(),tracedSamples:0};
  }
  function pixel(ctx,x,y){const index=y*ctx.width+x,c=ctx.camera,sum=[0,0,0],meta={};for(let s=0;s<ctx.samples;s++){
      const seed=((ctx.program.seed+1)*1664525^Math.imul(index+1,1013904223)^Math.imul(s+1,374761393))>>>0,rng=random(seed),sx=((x+rng())/ctx.width*2-1)*ctx.width/ctx.height*c.halfHeight,sy=(1-(y+rng())/ctx.height*2)*c.halfHeight;
      let origin=c.position,direction=unit(add(c.forward,add(mul(c.right,sx),mul(c.up,sy))));
      if((c.aperture||0)>0){const r=Math.sqrt(rng())*c.aperture/2,angle=TAU*rng(),offset=add(mul(c.right,r*Math.cos(angle)),mul(c.up,r*Math.sin(angle))),focus=at(origin,direction,c.focus/Math.max(.01,dot(direction,c.forward)));origin=add(origin,offset);direction=unit(sub(focus,origin));}
      const value=integrate(ctx,origin,direction,rng,s===0?meta:null);for(let k=0;k<3;k++)sum[k]+=Math.min(50,Math.max(0,value[k]));
    }
    for(let k=0;k<3;k++){const value=sum[k]/ctx.samples*(ctx.program.exposure??1),mapped=clamp(value*(2.51*value+.03)/(value*(2.43*value+.59)+.14)),encoded=mapped<=.0031308?mapped*12.92:1.055*Math.pow(mapped,1/2.4)-.055;ctx.rgba[index*4+k]=Math.round(clamp(encoded)*255);}
    ctx.rgba[index*4+3]=255;ctx.ids[index]=meta.id;ctx.depth[index]=meta.depth;ctx.tracedSamples+=ctx.samples;
  }
  function denoise(ctx){
    let source=ctx.rgba;const width=ctx.width,height=ctx.height,range=ctx.samples<16?3000:1800;
    const robust=new Uint8ClampedArray(source);
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x,o=i*4,neighbors=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const j=(y+dy)*width+x+dx;if(ctx.ids[j]!==ctx.ids[i])continue;const q=j*4;neighbors.push({q,l:(source[q]+source[q+1]+source[q+2])/3});}if(neighbors.length<6)continue;neighbors.sort((a,b)=>a.l-b.l);const mid=neighbors[neighbors.length>>1],lum=(source[o]+source[o+1]+source[o+2])/3;if(lum>mid.l+24&&neighbors.filter(v=>v.l>mid.l+18).length<=3)for(let k=0;k<3;k++)robust[o+k]=source[mid.q+k];}
    source=robust;
    for(const step of[1,2,3]){const target=new Uint8ClampedArray(source.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,o=i*4,id=ctx.ids[i],depth=ctx.depth[i],acc=[0,0,0],detail=ctx.program.objects[id]?.material.texture?.kind==='orange' ? .32 : 1;if(detail<1&&step>1){target.set(source.subarray(o,o+4),o);continue;}let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx*step,yy=y+dy*step;if(xx<0||xx>=width||yy<0||yy>=height)continue;const j=yy*width+xx,q=j*4;if(ctx.ids[j]!==id)continue;const dr=source[q]-source[o],dg=source[q+1]-source[o+1],db=source[q+2]-source[o+2],edge=(dr*dr+dg*dg+db*db)/(range*detail),z=Number.isFinite(depth)&&Number.isFinite(ctx.depth[j])?Math.abs(depth-ctx.depth[j])/Math.max(.015,depth*.035):0,w=Math.exp(-edge-z*z)*((dx===0?2:1)*(dy===0?2:1));for(let k=0;k<3;k++)acc[k]+=source[q+k]*w;sum+=w;}for(let k=0;k<3;k++)target[o+k]=Math.round(acc[k]/sum);target[o+3]=255;}source=target;}return source;
  }
  function finish(ctx){if(ctx.denoise)ctx.rgba=denoise(ctx);return {width:ctx.width,height:ctx.height,rgba:ctx.rgba,ids:ctx.ids,depth:ctx.depth,stats:{backend:'cpu-analytic-ray-transport',schema:ctx.program.schema,samplesPerPixel:ctx.samples,maxBounces:ctx.bounces,tracedPrimarySamples:ctx.tracedSamples,objects:ctx.objects.length,areaLights:ctx.lights.length,elapsedMs:Date.now()-ctx.started,sourceImageBlit:false,imageTextureReads:0,proceduralFunctionMaterials:ctx.objects.filter(o=>o.expression).length,reflection:true,refraction:true,softVisibility:true,deterministic:true,denoiser:ctx.denoise?'bounded-spatial-object-depth-bilateral':'none',transportLimitations:['finite bounce budget','clamped sample radiance','approximate rough glass','no volumetric scattering','no spectral transport',...(ctx.denoise?['spatial denoising can soften fine detail']:[])]}};}
  function render(program,options={}){const ctx=prepare(program,options);for(let y=0;y<ctx.height;y++){for(let x=0;x<ctx.width;x++)pixel(ctx,x,y);if(options.onProgress&&y%8===0)options.onProgress({completed:y+1,total:ctx.height,progress:(y+1)/ctx.height});}return finish(ctx);}
  async function renderAsync(program,options={}){const ctx=prepare(program,options),batch=options.batchRows??2;for(let y=0;y<ctx.height;y++){if(options.signal?.aborted){const error=new Error('Render cancelled');error.name='AbortError';throw error;}for(let x=0;x<ctx.width;x++)pixel(ctx,x,y);if((y+1)%batch===0||y===ctx.height-1){options.onProgress?.({completed:y+1,total:ctx.height,progress:(y+1)/ctx.height,rgba:ctx.rgba,width:ctx.width,height:ctx.height});await new Promise(resolve=>setTimeout(resolve,0));}}return finish(ctx);}
  return {VERSION:'0.7.0',validate,assert,applyOps,render,renderAsync,limits:{objects:64,lights:8,maxExpressionNodes:96,maxPixels:2100000,maxPrimarySamples:128000000},_internals:{noise,fbm,voronoi,compileExpression,prepare,trace,intersectObject,materialAt,bsdf}};
});
