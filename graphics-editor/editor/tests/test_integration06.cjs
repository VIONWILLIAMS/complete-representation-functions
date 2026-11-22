'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const Core=require('../web/crf-program.js'),Renderer=require('../web/crf-program-renderer.js');
require('../web/assets/v06/observed-fruit.js');
const Scenes=require('../web/crf-scenes06.js');
const render=p=>Renderer.render(p,{width:360,height:270,quality:'preview',time:null});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function count(frame,id){let n=0;for(const x of frame.ids)if(x===id)n++;return n;}
function difference(a,b){let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;}

test('common scene contains fitted and generated functions using one editable geometry protocol',()=>{
  const p=Scenes.create('common'),a=p.objects.find(x=>x.id==='apple.observed'),b=p.objects.find(x=>x.id==='pear.generated');
  assert.equal(a.source.kind,'observed_fit');assert.equal(b.source.kind,'generated');
  assert.equal(a.surface.kind,'lathe');assert.equal(b.surface.kind,'lathe');
  assert.equal(a.material.kind,'field');assert.equal(a.material.field.mode,'observed_radiance');
  assert(a.surface.profile.length>=8);assert(a.material.field.width<=256);assert(a.material.field.rgbBase64.length>0);
  const base=render(p);assert(base.rgba.length===360*270*4);assert(count(base,0)>100);assert(count(base,1)>100);
  for(const id of[a.id,b.id]){
    for(const [name,value]of[['surface.shape',.65],['material.color',[50,160,80]],['transform.position',[0,0,1.2]]]){
      const q=Core.applyOps(p,[{op:'set',id,path:name,value}]);
      assert(difference(base.rgba,render(q).rgba)>100,`${id} ${name} must change rendered output`);
      assert.equal(q.objects.find(o=>o.id===id).id,id);
    }
  }
});

test('common objects occlude each other according to their shared spatial positions',()=>{
  const p=Scenes.create('common');
  const near=Core.applyOps(p,[{op:'set',id:'pear.generated',path:'transform.position',value:[-1.05,0,1.4]}]);
  const far=Core.applyOps(p,[{op:'set',id:'pear.generated',path:'transform.position',value:[-1.05,0,-1.5]}]);
  const front=render(near),back=render(far);
  assert(count(front,1)>100);assert(count(back,0)>100);
  assert(count(front,0)<count(back,0)*.8,`foreground pear should obscure apple: ${count(front,0)} vs ${count(back,0)}`);
  for(let i=0;i<back.ids.length;i++)if(back.ids[i]>=0)assert(Number.isFinite(back.depth[i])&&back.depth[i]>0);
});

test('serialized scene renders identically in an isolated directory without reference images or asset globals',()=>{
  const p=Scenes.create('common'),expected=sha(render(p).rgba),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'crf06-roundtrip-'));
  try{
    for(const f of['crf-program.js','crf-program-renderer.js'])fs.copyFileSync(path.join(__dirname,'../web',f),path.join(tmp,f));
    fs.writeFileSync(path.join(tmp,'program.json'),JSON.stringify(p));
    const code="const fs=require('node:fs'),c=require('node:crypto'),r=require('./crf-program-renderer.js');const p=JSON.parse(fs.readFileSync('./program.json','utf8'));const f=r.render(p,{width:360,height:270,quality:'preview',time:null});process.stdout.write(c.createHash('sha256').update(f.rgba).digest('hex'));";
    const actual=cp.execFileSync(process.execPath,['-e',code],{cwd:tmp,encoding:'utf8'});
    assert.equal(actual,expected);assert.equal(fs.readdirSync(tmp).length,3);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('multi-view and time are scene evaluations with deterministic frame pixels',()=>{
  const p=Scenes.create('common'),front=render(p),side=render(Core.applyOps(p,[{op:'camera',values:{yaw:26}}]));
  const options={width:360,height:270,quality:'preview',time:2.5};
  const frame=Renderer.render(p,options),repeat=Renderer.render(p,options);
  assert(difference(front.rgba,side.rgba)>1000);assert(difference(front.rgba,frame.rgba)>1000);
  assert.equal(sha(frame.rgba),sha(repeat.rgba));assert.equal(p.camera.yaw,0);
});

test('invalid compound operations and source program imports do not partially mutate the source',()=>{
  const p=Scenes.create('common'),before=JSON.stringify(p);
  assert.throws(()=>Core.applyOps(p,[{op:'set',id:'apple.observed',path:'material.color',value:[0,0,255]},{op:'camera',values:{fov:0}}]));
  assert.equal(JSON.stringify(p),before);
  const invalid=Core.clone(p);invalid.objects[0].material.field.rgbBase64='AAAA';
  assert.equal(Core.validate(invalid).valid,false);assert.throws(()=>Core.assert(invalid));
});
