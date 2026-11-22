const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../web/crf-generative09.js');
const offline=require('../scripts/render_v09.cjs');

test('1080p video viewport preserves the exact 1440×1080 native content with opaque black sidebars',()=>{
 const scene=G.createScene({category:'still_life',seed:90108,width:1024,height:768,camera:{panX:.01,panY:-.01,zoom:1.03}},null);
 const frame=offline.renderProject(scene,{width:1920,height:1080,time:2.5,fit:'contain'});
 const expected=G.renderScene(scene,{width:1440,height:1080,time:.5,model:null,camera:offline.cameraAt(scene.camera,2.5,'front')});
 assert.equal(frame.width,1920);assert.equal(frame.height,1080);
 assert.deepEqual([frame.viewport.x,frame.viewport.y,frame.viewport.width,frame.viewport.height],[240,0,1440,1080]);
 assert.equal(frame.viewport.nativeAspectPreserved,true);assert.equal(frame.viewport.resampledContent,false);
 let invalidPadding=0;
 for(let y=0;y<1080;y++){
  assert.deepEqual(frame.data.subarray((y*1920+240)*4,(y*1920+1680)*4),expected.data.subarray(y*1440*4,(y+1)*1440*4));
  for(let x=0;x<1920;x++)if(x<240||x>=1680){const p=(y*1920+x)*4;if(frame.data[p]||frame.data[p+1]||frame.data[p+2]||frame.data[p+3]!==255)invalidPadding++;}
 }
 assert.equal(invalidPadding,0);
});

test('native single-image rendering at the authored size keeps all pixels and does not add padding',()=>{
 const scene=G.createScene({category:'architecture',seed:99,width:192,height:144},null);
 const actual=offline.renderProject(scene);
 assert.deepEqual(actual.data,G.renderScene(scene,{model:null}).data);
 assert.equal(actual.viewport,undefined);
});
