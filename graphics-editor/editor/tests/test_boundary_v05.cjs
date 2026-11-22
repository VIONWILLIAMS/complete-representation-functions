'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../web/crf-core.js');
const b64=a=>Buffer.from(a).toString('base64');
function small(){return{schema:'crf.scene.v0.5',width:3,height:1,rgbBase64:b64([180,160,130,120,116,106,180,160,130]),labelsBase64:b64([0,1,0]),objects:[{id:'wall.main',index:0,bbox:[0,0,3,1],depth:0},{id:'object.main',index:1,bbox:[1,0,2,1],depth:10}],boundaryMixture:{schema:'crf.boundary_mixture.v1',hostIndex:0,count:1,indicesBase64:Buffer.from(new Uint32Array([1]).buffer).toString('base64'),backgroundFractionBase64:b64([153]),backgroundRgbBase64:b64([180,160,130])}};}
function load(){const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/assets/scene-data.js'),'utf8'),context);return context.CRF_SCENE_DATA;}
function rgb(r,i){return [...r.rgba.slice(i*4,i*4+3)];}
test('a known mixed edge has exact default observation and follows the background material delta',()=>{
 const data=small(),s=C.initialState(data);const a=C.CPUrender(data,s,{quality:'exact',time:null});assert.deepEqual(rgb(a,1),[120,116,106]);
 const n=C.applyOperations(s,[{op:'set',id:'wall.main',path:'color',value:{tint:[100,150,180],amount:1}}]);const r=C.CPUrender(data,n,{quality:'exact',time:null});
 const B=[180,160,130],changed=C._internals.shade(B,n.objects[0],[1,1,1],false,false),expected=[120,116,106].map((v,c)=>Math.round(v+.6*(changed[c]-B[c])));
 assert.deepEqual(rgb(r,1),expected);assert.equal(r.stats.boundaryMaterialSampleCount,1);assert.deepEqual(rgb(C.CPUrender(data,s,{time:null}),1),[120,116,106]);
});
test('malformed boundary payload and invalid generator operations are rejected atomically',()=>{
 const data=small();data.boundaryMixture.backgroundRgbBase64=b64([1,2]);assert.throws(()=>C.decodeData(data));
 const s=C.initialState(small());const frozen=JSON.stringify(s);assert.throws(()=>C.applyOperations(s,[{op:'set',id:'object.main',path:'generator.seed',value:NaN}]));assert.equal(JSON.stringify(s),frozen);
});
test('Street recoloring only changes the wall and its declared mixed-edge influence band',()=>{
 const data=load(),d=C.decodeData(data),s=C.initialState(data),a=C.CPUrender(data,s,{quality:'exact',time:null});const n=C.applyOperations(s,[{op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:.72}}]);const r=C.CPUrender(data,n,{quality:'exact',time:null});
 let edgeChanged=0,unauthorized=0,baselineErrors=0;
 for(let i=0;i<d.labels.length;i++){let changed=false;for(let c=0;c<3;c++){if(a.rgba[i*4+c]!==d.rgb[i*3+c])baselineErrors++;if(r.rgba[i*4+c]!==a.rgba[i*4+c])changed=true;}if(changed&&d.labels[i]!==0){if(d.boundaryMixture.offset[i]<0)unauthorized++;else edgeChanged++;}}
 assert.equal(baselineErrors,0);assert.equal(unauthorized,0);assert.ok(edgeChanged>5000);console.log(JSON.stringify({case:'wall_mixed_edge',declaredMixturePixels:data.boundaryMixture.count,edgeChanged,undeclaredChanges:unauthorized,baselineErrors}));
});
test('removing the front signal reveals inferred wall at every housing pixel, including the bridge',()=>{
 const data=load(),d=C.decodeData(data),s=C.applyOperations(C.initialState(data),[{op:'set',id:'signal.main',path:'visible',value:false}]);const r=C.CPUrender(data,s,{quality:'exact',time:null});let count=0;
 for(let i=0;i<d.labels.length;i++)if(d.labels[i]===9){count++;assert.equal(r.ids[i],0);assert.equal(r.inferred[i],1);assert.deepEqual(rgb(r,i),[...d.backgroundRgb.slice(i*3,i*3+3)]);}
 assert.equal(d.labels[449*667+277],9);assert.equal(d.labels[451*667+321],9);assert.ok(count>4209);console.log(JSON.stringify({case:'signal_removed',allHousingPixelsRevealedAsInferredWall:count,staleHousingSeamTicks:0}));
});
