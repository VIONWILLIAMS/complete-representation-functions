const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../web/crf-verifier10.js');
function frame(pixels,width=pixels.length){return{width,height:pixels.length/width,data:Uint8ClampedArray.from(pixels.flat())};}
const original=()=>frame([[0,0,0,255],[100,100,100,255],[255,255,255,255]]);
const scene=()=>({schema:'crf.generative_scene.v0.9',width:3,height:1,objects:[{id:'apple',type:'apple',x:.2,y:.5,visible:true}]});
async function critique(output,scores={realism:5,semantic:5,coherence:5}){return{issues:[],scores,imageEvidence:true,sourceFrameSha256:await V.digest(output.data)};}

test('pixel measurement has known arithmetic, exact RGB vs alpha, and refuses implicit resizing',()=>{
 const a=original(),b=original();b.data[4]=110;b.data[7]=0;
 const m=V.measurePixels(a,b);assert.equal(m.mae,10/9);assert.equal(m.mse,100/9);assert.equal(m.maxChannelError,10);assert.equal(m.exactRGB,2/3);assert.equal(m.alphaMAE,85);
 assert.equal(V.measurePixels(a,b,Uint8Array.from([0,1,0])).mae,10/3);
 assert.throws(()=>V.measurePixels(a,{...b,width:1,height:3}),/identical dimensions/);
 assert.throws(()=>V.measurePixels(a,b,new Uint8Array(3)),/no evaluated pixel/);
});

test('protected region checks all RGBA channels and excludes the editable region',async()=>{
 const a=original(),b=original();b.data[0]=230;b.data[7]=200;
 const contract=V.createContract({perceptual:false,protectedMask:'protected'});
 const result=await V.verify({scene:scene(),output:b,previousOutput:a,masks:{protected:Uint8Array.from([0,1,0])},contract});
 assert.equal(result.checks.find(x=>x.id==='edit.protected').status,'failed');
 b.data[7]=255;const fixed=await V.verify({scene:scene(),output:b,previousOutput:a,masks:{protected:Uint8Array.from([0,1,0])},contract});
 assert.equal(fixed.checks.find(x=>x.id==='edit.protected').status,'passed');
});

test('encoded preview or missing reference stays unknown; no fake pixel acceptance',async()=>{
 const result=await V.verify({scene:scene(),output:{width:3,height:1,image:'data:image/png;base64,AAAA'},contract:V.createContract({referenceRequired:true})});
 assert.equal(result.hardPassed,false);assert.equal(result.referenceReconstructionAccepted,false);assert.equal(result.photorealisticAccepted,false);
 assert.ok(result.unknowns.includes('render.frame'));assert.ok(result.unknowns.includes('reference.mae'));
});

test('stale visual judgment is not reused after one pixel changes',async()=>{
 const a=original(),b=original(),opinion=await critique(a);b.data[0]=1;
 const result=await V.verify({scene:scene(),output:b,critique:opinion});
 assert.equal(result.checks.find(x=>x.id==='visual.realism').status,'unknown');
 const current=await V.verify({scene:scene(),output:b,critique:await critique(b)});
 assert.equal(current.allRequiredPassed,true);assert.equal(current.photorealisticAccepted,false);
});

test('even perfect model scores need independent version-matched review for photorealism',async()=>{
 const output=original(),c=await critique(output);
 const result=await V.verify({scene:scene(),output,critique:c,independentReview:{passed:true,reviewer:'human:reviewer',imageSha256:'wrong'}});
 assert.equal(result.photorealisticAccepted,false);
 const accepted=await V.verify({scene:scene(),output,critique:c,independentReview:{passed:true,reviewer:'human:reviewer',imageSha256:await V.digest(output.data)}});
 assert.equal(accepted.photorealisticAccepted,true);
});

test('declared count does not prove actual visibility behind an opaque layer',async()=>{
 const output={...original(),objectCoverage:{apple:new Float32Array(3)},diagnostics:{coverageSemantics:'visible_alpha_contribution'}};
 const contract=V.createContract({perceptual:false,plan:{constraints:[{type:'count',subject:'apple',value:1}]},checks:[{id:'apple.seen',kind:'pixel',type:'visible_coverage',objectId:'apple',minimumPixels:1,required:true}]});
 const result=await V.verify({scene:scene(),output,contract});
 assert.equal(result.checks.find(x=>x.id==='declaration.0').status,'passed');assert.equal(result.checks.find(x=>x.id==='apple.seen').status,'failed');
 output.diagnostics.coverageSemantics='projected_alpha_before_occlusion';output.objectCoverage.apple.fill(1);
 const preliminary=await V.verify({scene:scene(),output,contract});assert.equal(preliminary.checks.find(x=>x.id==='apple.seen').status,'unknown');
});

test('reference reconstruction and new-scene photorealism are different gates',async()=>{
 const output=original(),contract=V.createContract({perceptual:false,referenceRequired:true,referenceMAE:0,referencePSNR:60});
 const result=await V.verify({scene:scene(),output,reference:original(),contract});
 assert.equal(result.referenceReconstructionAccepted,true);assert.equal(result.photorealisticAccepted,false);
 const metric=result.checks.find(x=>x.type==='reference_psnr').metrics;assert.equal(metric.perfectRGB,true);assert.equal(metric.psnr,null);
});

test('capability gaps remain blocked and do not silently become model success',async()=>{
 const result=await V.verify({scene:scene(),output:original(),contract:V.createContract({perceptual:false,checks:[{id:'transmission',kind:'program',type:'capability',value:'physical_refraction',required:true}]}),capabilities:{operations:['layout']}});
 assert.equal(result.hardPassed,false);assert.deepEqual(result.blocked,['transmission']);
 const diagnosis=V.diagnose({issues:[{code:'texture',severity:'major',description:'Needs micro-normal field',requiredCapability:'micro_normal',requiredForGoal:true}]},{operations:['layout']});assert.equal(diagnosis[0].status,'blocked');
});

test('general representation limits remain unknown while required unseen geometry blocks',()=>{
 for(const gap of ['Unseen apple right side cannot be recovered; occlude it with the pear.',{capability:'unseen_geometry',description:'Occlusion can satisfy this arrangement.',requiredForGoal:false}]){
  const diagnosis=V.diagnose({issues:[{code:'contact',severity:'major',description:'Move the pear in front of the missing apple edge.'}],capabilityGaps:[gap]});
  assert.equal(diagnosis[0].status,'actionable');assert.equal(diagnosis[1].status,'unknown');assert.equal(diagnosis.some(x=>x.status==='blocked'),false);
 }
 const required=V.diagnose({capabilityGaps:[{capability:'unseen_geometry',description:'The required rear view has never been observed and alternatives are disallowed.',requiredForGoal:true}]});assert.equal(required[0].status,'blocked');
 assert.equal(V.diagnose({issues:[{code:'unsupported',severity:'major',description:'Required rear view cannot be produced.'}]})[0].status,'blocked');
});

test('candidate ranking rejects hard regression and preserves ties instead of latest',async()=>{
 const output=original();
 async function make(index,scores,extra=[]){const c=await critique(output,scores);return{index,critique:c,verification:await V.verify({scene:scene(),output,critique:c,contract:V.createContract({checks:extra})})};}
 const good=await make(0,{realism:4,semantic:4,coherence:4}),same=await make(1,{realism:4,semantic:4,coherence:4}),bad=await make(2,{realism:5,semantic:5,coherence:5},[{id:'size',kind:'pixel',type:'dimensions',value:[99,99],required:true}]);
 assert.equal(V.selectBest([good,same,bad]).index,0);assert.equal(V.compareCandidates(same,good),0);assert.equal(V.compareCandidates(bad,good),-1);
});

test('complete required checks and fewer unresolved perceptions outrank higher self-scores',async()=>{
 const output=original();
 async function candidate(index,scores,issues=[]){const c={...await critique(output,scores),issues};return{index,critique:c,verification:await V.verify({scene:scene(),output,critique:c})};}
 const major=[{code:'lighting',severity:'major',description:'Required coherent lighting is not achieved.'}];
 const older=await candidate(0,{realism:4.8,semantic:4.8,coherence:4.8},major),passed=await candidate(1,{realism:4,semantic:4,coherence:4});
 assert.equal(older.verification.allRequiredPassed,false);assert.equal(passed.verification.allRequiredPassed,true);assert.equal(V.selectBest([older,passed]).index,1);assert.ok(V.ranking(older).visual>V.ranking(passed).visual);
 const twoFailures=await candidate(2,{realism:4.9,semantic:4.9,coherence:3},major),oneFailure=await candidate(3,{realism:3.8,semantic:4,coherence:4});
 assert.equal(twoFailures.verification.allRequiredPassed,false);assert.equal(oneFailure.verification.allRequiredPassed,false);assert.equal(V.ranking(twoFailures).perceptualUnresolved,2);assert.equal(V.ranking(oneFailure).perceptualUnresolved,1);assert.equal(V.selectBest([twoFailures,oneFailure]).index,3);
});

test('non-finite numeric parameters fail and JSON-unknown predicate stays unknown',async()=>{
 const s=scene();s.objects[0].x=NaN;
 const r=await V.verify({scene:s,output:original(),contract:V.createContract({perceptual:false,checks:[{id:'unimplemented',kind:'measurement',type:'natural_photo_truth',required:true}]})});
 assert.equal(r.checks.find(x=>x.id==='program.finite').status,'failed');assert.ok(r.unknowns.includes('unimplemented'));
});

test('actual Gaussian kernel occlusion and schema validation integrate with the verifier',async()=>{
 const G=require('../web/crf-gaussian10.js');
 const asset={schema:G.ASSET_SCHEMA,width:4,height:4,base:[.3,.2,.1],splats:[]};
 const s={schema:G.SCENE_SCHEMA,width:4,height:4,background:[0,0,0],assets:{solid:asset},objects:[{id:'behind',assetId:'solid',x:0,y:0,zIndex:0},{id:'front',assetId:'solid',x:0,y:0,zIndex:1}]};
 const contract=V.createContract({representation:'reference_gaussian',perceptual:false,checks:[{id:'behind.seen',kind:'pixel',type:'visible_coverage',objectId:'behind',minimumPixels:1,required:true},{id:'front.seen',kind:'pixel',type:'visible_coverage',objectId:'front',minimumPixels:16,required:true}]});
 const output=G.renderScene(s,{coverage:true,filter:'mip'});
 const result=await V.verify({scene:s,output,contract,validateScene:G.validateScene});
 assert.equal(result.checks.find(c=>c.id==='program.finite').status,'passed');
 assert.equal(result.checks.find(c=>c.id==='behind.seen').status,'failed');
 assert.equal(result.checks.find(c=>c.id==='front.seen').status,'passed');
 const invalid=structuredClone(s);invalid.objects[0].scaleX=0;
 const rejected=await V.verify({scene:invalid,output,contract,validateScene:G.validateScene});
 assert.equal(rejected.checks.find(c=>c.id==='program.finite').status,'failed');
 output.objectCoverage.front=Float32Array.of(1);
 const incomplete=await V.verify({scene:s,output,contract,validateScene:G.validateScene});
 assert.equal(incomplete.checks.find(c=>c.id==='front.seen').status,'failed');
});
