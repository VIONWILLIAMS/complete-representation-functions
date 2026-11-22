const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const G=require('../web/crf-generative09.js');
const offline=require('../scripts/render_v09.cjs');
const model=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/assets/v09/shared-appearance.json')));
const digest=image=>crypto.createHash('sha256').update(image.data).digest('hex');

test('explicit null model survives scene normalization and overrides a learned embedded model',()=>{
 const plain=G.createScene({category:'still_life',seed:122,width:128,height:96},null);
 assert.equal(Object.hasOwn(plain,'appearanceModel'),true);
 assert.equal(G.normalizeScene(plain).appearanceModel,null);
 const embedded=G.createScene(plain,model),expected=G.renderScene(plain,{model:null});
 const imported={schema:'crf.editor_project.v0.9',kind:'native',scene:embedded,model:null};
 const actual=offline.renderProject(imported);
 assert.equal(actual.diagnostics.learnedModel,null);
 assert.equal(digest(actual),digest(expected));
 assert.equal(digest(offline.renderProject(plain)),digest(expected));
 assert.notEqual(digest(G.renderScene(embedded)),digest(expected));
 assert.equal(digest(G.renderScene(embedded,{model:null})),digest(expected));
});

test('an absent wrapper model inherits the exact embedded snapshot without manufacturing an own null property',()=>{
 const scene=G.createScene({category:'still_life',seed:122,width:128,height:96},model);
 const imported={schema:'crf.editor_project.v0.9',kind:'native',scene};
 assert.equal(Object.hasOwn(offline.unwrap(imported),'model'),false);
 assert.equal(digest(offline.renderProject(imported)),digest(G.renderScene(scene)));
});

test('offline imports reject invalid original scene schemas and required fields before defaults',()=>{
 const scene=G.createScene({width:128,height:96});
 const wrap=s=>({schema:'crf.editor_project.v0.9',kind:'native',scene:s,model:null});
 assert.throws(()=>offline.renderProject(wrap({...scene,schema:'corrupt'})),/Invalid native scene.*schema/);
 const missing={...scene};delete missing.seed;
 assert.throws(()=>offline.renderProject(wrap(missing)),/seed/);
 assert.throws(()=>offline.renderProject(wrap({...scene,width:NaN})),/width/);
 assert.throws(()=>offline.renderProject(null),/Project/);
});

test('front time zero retains the authored camera and independent views actually move the same scene',()=>{
 const scene=G.createScene({category:'still_life',seed:122,width:128,height:96,camera:{panX:.03,panY:-.01,zoom:1.08}},null);
 const front=offline.renderProject(scene),left=offline.renderProject(scene,{view:'left'}),right=offline.renderProject(scene,{view:'right'});
 assert.equal(digest(front),digest(G.renderScene(scene,{model:null})));
 assert.equal(new Set([digest(front),digest(left),digest(right)]).size,3);
});
