#!/usr/bin/env node
'use strict';
// Independent source PNG decoding, pixel tests, and edit isolation checks.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function dependency(name){try{return require(name)}catch(error){if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw error;return require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,name));}}
const {PNG}=dependency('pngjs');
const C=require('../web/crf-core.js');
globalThis.window=globalThis;
require('../web/assets/scene-data.js');
const data=globalThis.CRF_SCENE_DATA, state=C.initialState(data),d=C.decodeData(data);
const source=PNG.sync.read(fs.readFileSync(path.join(root,'web/assets/reference.png')));
const checks=[],hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function check(name,pass,detail){checks.push({name,pass:!!pass,detail});if(!pass)console.error('FAIL '+name);}
function metrics(a,b){let exact=0,total=0,max=0;for(let i=0;i<a.length;i+=4){let same=true;for(let c=0;c<3;c++){const v=Math.abs(a[i+c]-b[i+c]);total+=v;max=Math.max(max,v);same&&=v===0;}exact+=same?1:0;}return{exactPixels:exact,totalPixels:a.length/4,exactPixelFraction:exact/(a.length/4),mae:total/(a.length/4*3),maxAbsChannelError:max};}
const baseline=C.CPUrender(data,state,{quality:'exact',time:null});
const pixel=metrics(baseline.rgba,source.data);
check('actual_gaussian_renderer_matches_independent_PNG',pixel.exactPixels===667000,pixel);
check('dimensions_are_original',baseline.width===667&&baseline.height===1000,{width:baseline.width,height:baseline.height});
check('all_pixels_have_one_observed_object',d.labels.length===667000&&[...new Set(d.labels)].every(i=>state.objects.some(o=>o.index===i)),{objects:state.objects.length,observedSamples:667000});
let scanMismatch=0;const canonical=Buffer.alloc(667000*3);for(let i=0;i<667000;i++)for(let c=0;c<3;c++){canonical[i*3+c]=source.data[i*4+c];scanMismatch+=d.rgb[i*3+c]!==source.data[i*4+c]?1:0;}
check('scanned_RGB_matches_independent_source',scanMismatch===0,{mismatchedChannels:scanMismatch,canonicalRGBSha256:hash(canonical)});
const before=JSON.stringify(state);
const blue=C.applyOperations(state,[{op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:.72}}]);
const blueImage=C.CPUrender(data,blue,{quality:'exact',time:null});
const wallIndex=state.objects.find(o=>o.id==='wall.main').index;
let outside=0,inside=0,mixed=0;for(let i=0;i<667000;i++){const changed=[0,1,2].some(c=>baseline.rgba[i*4+c]!==blueImage.rgba[i*4+c]);if(changed){if(d.labels[i]===wallIndex)inside++;else if(d.boundaryMixture&&d.boundaryMixture.offset[i]>=0)mixed++;else outside++;}}
check('wall_recolor_is_limited_to_wall_and_declared_mixed_edges',outside===0&&inside>10000&&mixed>0,{changedWallPixels:inside,changedMixedEdgePixels:mixed,changedOutsideDeclaredInfluence:outside,note:'v0.5 explicitly models wall contribution in mixed foreground edges; the frozen reference RGB gate is unchanged.'});
check('operations_are_immutable',JSON.stringify(state)===before,{});
let cycleRejected=false,invalidRejected=false;try{C.applyOperations(state,[{op:'reparent',id:'pole.main',parent:'signal.main'}]);}catch(e){cycleRejected=true;}try{C.applyOperations(state,[{op:'setCamera',values:{yaw:NaN}}]);}catch(e){invalidRejected=true;}
check('attachment_cycles_rejected',cycleRejected,{});check('nonfinite_parameters_rejected',invalidRejected,{});
const moved=C.applyOperations(state,[{op:'set',id:'pole.main',path:'transform.x',value:12}]);
const p0=C._internals.prepareFrame(data,state,{quality:'exact',time:null}),p1=C._internals.prepareFrame(data,moved,{quality:'exact',time:null});
const attachments=['pole.main','pole.arm','signal.support','signal.main','signal.side'].map(id=>{const a=p0.layers.find(l=>l.object.id===id),b=p1.layers.find(l=>l.object.id===id);return{id,deltaX:b.projection.b[0]-a.projection.b[0],deltaY:b.projection.b[1]-a.projection.b[1]};});
check('signal_rig_moves_as_connected_parent_group',attachments.every(x=>Math.abs(x.deltaX-12)<1e-8&&Math.abs(x.deltaY)<1e-8),attachments);
const created=C.applyOperations(state,[{op:'addPrototype',id:'probe.shape',prototype:'ellipse',x:500,y:450,width:50,height:80,color:[230,150,30]},{op:'duplicate',id:'probe.shape',newId:'probe.copy',offset:[60,0]},{op:'delete',id:'probe.shape'}]);
const prototypeImage=C.CPUrender(data,created,{quality:'exact',time:null});
const copy=created.objects.find(o=>o.id==='probe.copy');
check('prototype_CRUD_reaches_real_pixels',created.objects.find(o=>o.id==='probe.shape').deleted&&prototypeImage.ids.some(v=>v===copy.index),{visibleCopyPixels:prototypeImage.ids.reduce((n,v)=>n+(v===copy.index),0)});
const tilted=C.applyOperations(state,[{op:'setCamera',values:{yaw:7}}]);
const plane=C._internals.prepareFrame(data,tilted,{quality:'interactive',lod:2,time:null});
const near=plane.layers.find(l=>l.object.id==='pole.main'),far=plane.layers.find(l=>l.object.id==='wall.main');
check('depth_changes_camera_projection',Math.abs(near.projection.b[0]-far.projection.b[0])>5,{nearX:near.projection.b[0],farX:far.projection.b[0]});
const light=C.applyOperations(state,[{op:'setLight',values:{temperature:.6,exposure:.1}}]);
const lit=C.CPUrender(data,light,{quality:'exact',time:null});
check('relative_light_changes_actual_pixels',metrics(lit.rgba,baseline.rgba).mae>1,{maeVsBaseline:metrics(lit.rgba,baseline.rgba).mae});
// Changing a numeric sample must change the rendered observation: no hidden image blit.
const mutated=JSON.parse(JSON.stringify(data));const bytes=Buffer.from(mutated.rgbBase64,'base64');const probe=500*667+450;bytes[probe*3]^=127;mutated.rgbBase64=bytes.toString('base64');
const altered=C.CPUrender(mutated,C.initialState(mutated),{quality:'exact',time:null});
const probeMetrics=metrics(altered.rgba,baseline.rgba);
check('numeric_gaussian_coefficient_controls_output',probeMetrics.exactPixels===666999&&altered.rgba[probe*4]===bytes[probe*3],{...probeMetrics,probeXY:[450,500]});
const report={schema:'crf.delivery_verification.v0.5',pass:checks.every(x=>x.pass),referenceFileSha256:hash(fs.readFileSync(path.join(root,'web/assets/reference.png'))),coreSha256:hash(fs.readFileSync(path.join(root,'web/crf-core.js'))),sceneDataSha256:hash(fs.readFileSync(path.join(root,'web/assets/scene-data.js'))),representation:'dense observed RGB coefficients; does not test compact compression or physical 3D truth',checks};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,checks:checks.length,pixel},null,2));
if(!report.pass)process.exitCode=1;
