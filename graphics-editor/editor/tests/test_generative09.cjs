const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const G=require('../web/crf-generative09.js');
const digest=x=>crypto.createHash('sha256').update(x.data).digest('hex');

test('all three function families render deterministically without a source-image dependency',()=>{
 for(const category of G.CATEGORIES){const scene=G.createScene({category,seed:9,width:128,height:96}),a=G.renderScene(scene),b=G.renderScene(JSON.parse(JSON.stringify(scene)));assert.equal(digest(a),digest(b));assert.equal(a.data.length,128*96*4);assert.equal(a.diagnostics.sourceImageBlit,false);assert.equal(a.diagnostics.meshUsed,false);assert.ok(a.diagnostics.gaussianBasisEvaluations>0);}
});

test('invalid semantic state and attachment cycles are rejected before render',()=>{
 assert.throws(()=>G.createScene({category:'invented'}),/Unsupported/);
 assert.throws(()=>G.createScene({seed:NaN}),/seed/);
 const s=G.createScene();s.objects[0].type='arbitrary_script';assert.equal(G.validateScene(s).ok,false);
 const c=G.createScene();c.objects[0].attachment={parentId:c.objects[1].id,anchor:[0,0]};c.objects[1].attachment={parentId:c.objects[0].id,anchor:[0,0]};assert.equal(G.validateScene(c).ok,false);
 const b=G.createScene();b.objects[0].attachment={parentId:'missing',anchor:[0,0]};assert.equal(G.validateScene(b).ok,false);
});

test('semantic color edit protects all unrelated pixels beyond the declared object influence',()=>{
 const s=G.createScene({category:'still_life',seed:41,width:256,height:192,objects:[{id:'apple',type:'apple',x:.5,y:.55,width:.25,height:.30,color:[160,30,25],depth:.5}]}),before=G.renderScene(s),edited=G.applyOps(s,[{op:'set',id:'apple',values:{color:[65,130,35]}}]),after=G.renderScene(edited);
 let changed=0,protectedChanged=0;for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const p=(y*s.width+x)*4,delta=before.data[p]!==after.data[p]||before.data[p+1]!==after.data[p+1]||before.data[p+2]!==after.data[p+2];if(delta)changed++;if(delta&&(x<s.width*.3||x>s.width*.7||y<s.height*.32||y>s.height*.77))protectedChanged++;}
 assert.ok(changed>100);assert.equal(protectedChanged,0);assert.deepEqual(s.objects[0].color,[160,30,25]);
});

test('removing parent hides attached child and background remains a computed opaque field',()=>{
 const scene=G.createScene({category:'architecture',seed:9,width:128,height:96}),a=G.applyOps(scene,[{op:'remove',id:'street.pole'}]),b=G.applyOps(scene,[{op:'remove',id:'street.pole'},{op:'remove',id:'street.signal'}]),rendered=G.renderScene(a);assert.equal(digest(rendered),digest(G.renderScene(b)));for(let p=3;p<rendered.data.length;p+=4)assert.equal(rendered.data[p],255);
});

test('appearance learning deduplicates observations and preserves trained coefficient families',()=>{
 const data=new Uint8ClampedArray(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const p=(y*32+x)*4;data[p]=30+x*4;data[p+1]=70+y*2;data[p+2]=45;data[p+3]=255;}
 const sample=G.extractAppearance({width:32,height:32,data},{id:'one',sourceGroup:'s1',category:'architecture'}),a=G.learnAppearance([sample,sample]);assert.equal(a.sourceCount,1);assert.equal(a.categories.architecture.count,1);assert.equal(a.categories.architecture.bands.length,4);const previous={...a,functionFamilies:{mock:{schema:'fixture'}}};const b=G.learnAppearance([{...sample,id:'two',sourceGroup:'s2'}],{previousModel:previous});assert.equal(b.sourceCount,2);assert.deepEqual(b.functionFamilies,previous.functionFamilies);assert.equal(b.sourceRGBEmbedded,false);
});

test('shared Gaussian coefficients actually affect pixels while independent seeds remain deterministic',()=>{
 const path=require('node:path').join(__dirname,'../web/assets/v09/shared-appearance.json');if(!fs.existsSync(path))throw new Error('Run build_shared09.py first.');
 const model=JSON.parse(fs.readFileSync(path)),family=model.functionFamilies.fruit_skin;assert.ok(family.trainingCount>=2);assert.equal(family.mean.length,289);assert.ok(family.rank>0);
 const scene=G.createScene({category:'still_life',seed:27,width:192,height:144}),without=structuredClone(model);delete without.functionFamilies;const a=G.renderScene(scene,{model}),b=G.renderScene(scene,{model:without});assert.notEqual(digest(a),digest(b));assert.equal(digest(a),digest(G.renderScene(scene,{model})));
 const modified=structuredClone(model);modified.functionFamilies.fruit_skin.mean[144][0]+=.3;assert.notEqual(digest(a),digest(G.renderScene(scene,{model:modified})));
});

test('fixed camera movement changes the result without resampling latent object identity',()=>{
 const scene=G.createScene({category:'still_life',seed:91,width:128,height:96}),a=G.renderScene(scene,{camera:{panX:-.06}}),b=G.renderScene(scene,{camera:{panX:.06}});assert.notEqual(digest(a),digest(b));assert.equal(digest(a),digest(G.renderScene(scene,{camera:{panX:-.06}})));assert.throws(()=>G.renderScene(scene,{camera:{zoom:Infinity}}),/Invalid/);
});

test('alpine, coast and forest execute distinct terrain functions rather than label-only variants',()=>{
 const hashes=G.TERRAINS.map(terrain=>digest(G.renderScene(G.createScene({category:'landscape',seed:48,width:160,height:120,environment:{terrain}}))));assert.equal(new Set(hashes).size,3);
 assert.throws(()=>G.createScene({category:'landscape',environment:{terrain:'desert'}}),/Unsupported terrain/);
});
