'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../web/crf-quality12.js'), H = require('../web/quality-harness12.js');
const asset = () => ({schema:'crf.gaussian_asset.v0.8',id:'test',width:8,height:6,
  base:[10,20,30],splats:[[3.5,2.5,1,1,0,70,40,20]]});
const scene = () => C.createProject(asset(), {qualityContractHash:'a'.repeat(64)});

test('JSON proposal renders a real changed frame without modifying the frozen function', async () => {
  const project = scene(), original = C.canonical(project), before = C.render(project);
  const result = await H.propose({project, proposal:{edits:{exposure:1}}});
  assert.equal(result.ok,true); assert.equal(result.run.status,'rendered');
  assert.notDeepEqual(result.frame.data,before.data);
  assert.deepEqual(result.project.asset,project.asset);
  assert.equal(C.canonical(project),original);
  assert.equal(result.project.qualityContractHash,project.qualityContractHash);
  assert.equal(result.run.referenceQualityReevaluated,false);
  assert.equal(result.run.providerCalls,0);
  assert.equal((await C.verifyProject(result.project)).ok,true);
});
test('a proposal cannot replace model weights, provenance or the evaluator contract', async () => {
  for (const key of ['asset','qualityContractHash','provenance','reference','script']) {
    const result = await H.propose({project:scene(),proposal:{[key]:{}}});
    assert.equal(result.ok,false); assert.equal(result.error.code,'EDIT_SCOPE');
    assert.equal(result.run.retainedCurrentProject,true);
  }
});
test('stale and tampered project proposals fail before invoking a renderer', async () => {
  let calls=0; const render=()=>{calls++;throw Error('must not be called');};
  const project=scene();
  const stale=await H.propose({project,proposal:{edits:{exposure:0}},baseProjectHash:'0'.repeat(64),render});
  assert.equal(stale.error.code,'STALE_PROJECT');
  const tampered=JSON.parse(await C.serializeProject(project));tampered.asset.base[0]=99;
  const result=await H.propose({project:tampered,proposal:{edits:{exposure:0}},render});
  assert.equal(result.error.code,'HASH_MISMATCH'); assert.equal(calls,0);
});
test('cancellation and incorrect-size frames do not yield an accepted candidate', async () => {
  const controller=new AbortController();controller.abort();
  assert.equal((await H.propose({project:scene(),proposal:{edits:{exposure:0}},signal:controller.signal})).run.status,'cancelled');
  const wrong=await H.propose({project:scene(),proposal:{edits:{exposure:0}},render:()=>({width:1,height:1,data:new Uint8Array(4)})});
  assert.equal(wrong.ok,false);assert.equal(wrong.error.code,'INVALID_FRAME');
});
test('validation-only and oversized output requests remain distinguishable from execution', async () => {
  const validated=await H.propose({project:scene(),proposal:{view:{width:16,height:12}},render:false});
  assert.equal(validated.ok,true);assert.equal(validated.run.rendered,false);assert.equal(validated.run.status,'validated');
  const tooLarge=await H.propose({project:scene(),proposal:{view:{width:4000,height:4000}}});
  assert.equal(tooLarge.ok,false);
});
