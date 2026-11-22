'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const G=require('../web/crf-gaussian08.js');
const asset=(overrides={})=>({schema:G.ASSET_SCHEMA,id:'a',width:24,height:18,base:[70,95,110],splats:[[11.2,7.3,3.2,1.4,.37,110,-50,24],[18.1,12.5,2,3,-.8,-30,50,100]],...overrides});
const scene=a=>({schema:G.SCENE_SCHEMA,width:a.width,height:a.height,background:[25,50,75],assets:{a},objects:[{id:'a',assetId:'a'}]});

test('direct Gaussian equation uses pixel centres and signed coefficients',()=>{
 const a=asset({width:3,height:3,base:[10,20,30],splats:[[1.5,1.5,1,1,0,100,-10,40]]}),p=G.renderAsset(a).data;
 assert.deepEqual([...p.slice(16,20)],[110,10,70,255]);
 assert.equal(p[0],Math.floor(10+100*Math.exp(-1)+.5));
});

test('Python and browser independent renderers agree for exported parameters',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crf08-parity-'));const a=asset();
 fs.writeFileSync(path.join(dir,'asset.json'),JSON.stringify(a));
 const source=path.resolve(__dirname,'../fitting');
 const program='import sys,json;sys.path.insert(0,sys.argv[1]);from crf08_gaussian import render_asset;a=json.load(open(sys.argv[2]));sys.stdout.buffer.write(render_asset(a).tobytes())';
 const result=cp.spawnSync('python',['-c',program,source,path.join(dir,'asset.json')],{env:{...process.env,OPENBLAS_NUM_THREADS:'1'}});
 assert.equal(result.status,0,result.stderr.toString());
 assert.deepEqual(Buffer.from(G.renderAsset(a).data),result.stdout);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('native view of opaque asset equals direct reconstruction exactly',()=>{
 const a=asset(),direct=G.renderAsset(a),composed=G.renderScene(scene(a));
 assert.equal(G.calculateMetrics(direct,composed).exactRGBFraction,1);
});

test('semantic alpha protects the outside region during colour edits',()=>{
 const a=asset({alpha:{encoding:'rle8',runs:[0,24*5,255,24*8,0,24*5]}}),s=scene(a),before=G.renderScene(s);
 const after=G.renderScene(G.applyOps(s,[{op:'set',id:'a',values:{hue:95,exposure:.4}}]));
 const alpha=G.alphaArray(a);let changed=0;
 for(let i=0;i<alpha.length;i++){const same=before.data.slice(4*i,4*i+3).every((x,k)=>x===after.data[4*i+k]);if(!alpha[i])assert.ok(same);else if(!same)changed++;}
 assert.ok(changed>0);
 assert.equal(s.objects[0].hue,undefined);
});

test('transparent boundary resampling uses premultiplied colour',()=>{
 const a=asset({width:2,height:1,base:[255,0,0],splats:[],alpha:{encoding:'rle8',runs:[255,1,0,1]}});
 const s={...scene(a),width:6,height:2,background:[255,255,255],objects:[{id:'a',assetId:'a',scaleX:2,scaleY:2}]};
 const im=G.renderScene(s);for(let i=0;i<12;i++)assert.equal(im.data[i*4],255);
});

test('invalid coefficient, coverage and operations fail atomically',()=>{
 assert.equal(G.validateAsset(asset({splats:[[0,0,0,1,0,1,1,1]]})).ok,false);
 assert.equal(G.validateAsset(asset({alpha:{encoding:'rle8',runs:[255,1]}})).ok,false);
 const s=scene(asset());assert.throws(()=>G.applyOps(s,[{op:'set',id:'a',values:{scaleX:0}}]));assert.equal(s.objects[0].scaleX,undefined);
 assert.throws(()=>G.applyOps(s,[{op:'set',id:'a',values:{__forbidden:1}}]));
});

test('browser fitting optimizes a compact Gaussian field without source RGB data',async()=>{
 const original=G.renderAsset(asset()),a=await G.fitImage(original,{budget:80,iterations:3,geometrySteps:25,id:'fitted'}),out=G.renderAsset(a);
 const flat=G.renderAsset({...a,splats:[]}),initial=G.calculateMetrics(original,flat),final=G.calculateMetrics(original,out);
 assert.ok(final.mae<initial.mae*.35,JSON.stringify({initial,final}));
 assert.ok(a.splats.length<=80);assert.equal(a.provenance.sourceRGBEmbedded,false);
 assert.equal(a.provenance.losslessResidualEmbedded,false);
 assert.ok(a.fit.history.some(x=>x.phase==='geometry_gradient_25'));
 assert.ok(!('rgb' in a)&&!('pixels' in a)&&!('image' in a));
});
