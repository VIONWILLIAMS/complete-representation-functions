'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Canvas = require('../web/crf-canvas07.js');
const program = () => ({schema:'crf.canvas_program.v0.7',id:'direct_2d',title:'二维画面',width:1200,height:800,seed:1139,source:"ctx.fillStyle='#123456';ctx.fillRect(0,0,W,H);",parameters:{light:0.7}});

test('accepts portable Canvas program and clones editable parameters', () => {
  const original=program(), checked=Canvas.validate(original);
  assert.deepEqual(checked,original);
  checked.parameters.light=0.1;
  assert.equal(original.parameters.light,0.7);
});
test('rejects network, image assets, nested worker and dynamic import capabilities', () => {
  for (const source of ["fetch('/secret')",'new Worker("x")','import("x")','loadImage("x")','new Image()','globalThis.fetch("x")']) {
    assert.throws(()=>Canvas.validate({...program(),source}),{name:'ValidationError'});
  }
});
test('requires supported schema and finite drawing budgets', () => {
  for (const patch of [{schema:'crf.radiance_program.v0.7'},{width:2000,height:2000},{source:'x'.repeat(80001)},{seed:-1},{unknown:true}]) {
    assert.throws(()=>Canvas.validate({...program(),...patch}),{name:'ValidationError'});
  }
});
test('keeps procedural pixels and locally drawn layers in the supported interface', () => {
  const p=program();p.source="const layer=createCanvas(W,H);const a=layer.getContext('2d');a.fillStyle='red';a.fillRect(0,0,W,H);ctx.filter='blur(4px)';ctx.drawImage(layer,0,0);const data=ctx.getImageData(0,0,W,H);ctx.putImageData(data,0,0);";
  assert.equal(Canvas.compile(p).source,p.source);
});
test('preserves API provenance without sharing a mutable reference', () => {
  const p=program();p.provenance={provider:'deepseek-flash',requestId:'request-example',pipeline:'crf-editor-canvas07',referenceMode:'text_research',generatedAt:'2026-11-21T00:00:00Z'};
  const result=Canvas.validate(p);
  assert.deepEqual(result.provenance,p.provenance);
  assert.notEqual(result.provenance,p.provenance);
});
test('ignores explanatory comments without stripping string and template content', () => {
  const source="// warm window glow\n/* document and fetch are not used */\nctx.fillStyle='red';ctx.fillRect(0,0,W,H);";
  assert.equal(Canvas.validate({...program(),source}).source,source);
  for (const text of ["const text='https://example.com/image.png';",'const text=`https://example.com/image.png`;']) {
    assert.throws(()=>Canvas.validate({...program(),source:text}),{name:'ValidationError'});
  }
});
test('worker wrapper allows source-local W/H and provides deterministic rand alias', () => {
  // Inspect the actual generated script without adding a public execution API.
  const raw=fs.readFileSync(require.resolve('../web/crf-canvas07.js'),'utf8');
  const inspected=raw.replace('return Object.freeze({SCHEMA,LIMITS,validate,compile:validate,renderToCanvas});','return {workerSource};');
  const context={module:{exports:{}},TextEncoder};vm.runInNewContext(inspected,context);
  const p={...program(),source:'const W=1200,H=800; ctx.fillRect(rand()*W,rng()*H,1,1);'};
  const script=context.module.exports.workerSource(p);
  assert.doesNotThrow(()=>new vm.Script(script));
  assert.match(script,/function\(ctx,W,H,random,rng,rand,Math/);
  assert.match(script,/paint\(ctx,spec.width,spec.height,random,random,random,localMath/);
  assert.ok(script.includes(p.source));
});
