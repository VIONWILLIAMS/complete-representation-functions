#!/usr/bin/env node
'use strict';
// Inspect actual downloaded artifacts. This is not a substitute for observing
// the browser workflow; it verifies the resulting project, pixels and video.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {PNG}=require('pngjs');
const Core=require('../web/crf-core11.js');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const required=name=>{const value=arg(name);if(!value)throw new Error('Required: '+name+' <path>');return path.resolve(value);};
const need=(condition,message)=>{if(!condition)throw new Error(message);};
function difference(a,b,channels=4){need(a.length===b.length,'Pixel buffer sizes differ.');let total=0,max=0,count=0,exact=0;for(let i=0;i<a.length;i++){if(channels===4&&i%4===3)continue;const delta=Math.abs(a[i]-b[i]);total+=delta;max=Math.max(max,delta);count++;if(delta===0)exact++;}return{meanAbsoluteRGB8:total/count,maxChannelRGB8:max,exactChannelFraction:exact/count};}
async function main(){
  const projectFile=required('--project'),pngFile=required('--png'),videoFile=required('--video');
  const files=[projectFile,pngFile,videoFile].map(file=>{const bytes=fs.readFileSync(file);return{name:path.basename(file),bytes:bytes.length,sha256:sha(bytes)};});
  const project=JSON.parse(fs.readFileSync(projectFile,'utf8')),valid=await Core.verifyProject(project);need(valid.ok,valid.errors.join(' '));
  const png=PNG.sync.read(fs.readFileSync(pngFile)),time=Number(arg('--time','0')),samples=Number(arg('--samples','1')),backend=arg('--backend','cached');
  need(Number.isFinite(time)&&time>=0&&time<=5,'Invalid PNG time.');
  const frame=await Core.renderScene(project,{width:png.width,height:png.height,time,samples,backend});
  const pngDifference=difference(frame.data,png.data);let alphaExact=true;for(let i=3;i<png.data.length;i+=4)if(frame.data[i]!==png.data[i])alphaExact=false;
  const command=spawnSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,nb_read_frames,r_frame_rate,color_range,color_space,color_transfer,color_primaries:format=duration','-of','json',videoFile],{encoding:'utf8'});need(command.status===0,'ffprobe failed: '+(command.stderr||command.error?.message));
  const probe=JSON.parse(command.stdout),stream=probe.streams[0];need(stream,'No video stream.');need(Number(stream.nb_read_frames)===120,'Expected 120 decoded frames.');need(stream.width===project.scene.width&&stream.height===project.scene.height,'Video/project dimensions differ.');need(Math.abs(Number(probe.format.duration)-5)<.05,'Video duration is not five seconds.');
  const decoded=spawnSync('ffmpeg',['-v','error','-i',videoFile,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:32*1024*1024});need(decoded.status===0,'ffmpeg could not decode first frame.');need(decoded.stdout.length===stream.width*stream.height*4,'Decoded frame size differs.');
  const atZero=await Core.renderScene(project,{width:stream.width,height:stream.height,time:0,samples,backend});
  const report={schema:'crf.browser_artifact_validation/1.1',at:new Date().toISOString(),status:pngDifference.maxChannelRGB8<=1&&alphaExact?'passed':'pixel_comparison_failed',
    scope:'Actual downloaded artifact verification; browser interaction is documented by a separate observed run.',artifacts:files,
    project:{id:project.id,sceneDigest:valid.sceneDigest,projectDigest:valid.projectDigest,functions:valid.functionCount,neuralFunctions:Object.values(project.functions).filter(f=>f.kind==='neural').length,objects:project.scene.objects.length,trainingStates:project.learningRuns.map(run=>run.state),feedbackRecords:project.feedback.length,sourceRGBAtRender:false},
    profile:{backend,samples,time,cacheResolution:64},png:{width:png.width,height:png.height,alphaExact,...pngDifference,comparisonToleranceRGB8:1,toleranceScope:'Same JavaScript program across browser and Node numerical runtimes; browser reopen byte identity is checked separately.'},
    video:{...probe,expectedFrames:120,expectedDurationSeconds:5,firstFrameDifference:difference(atZero.data,decoded.stdout),differenceScope:'Measured lossy encode/decode difference; no universal visual-quality claim.'},
    sourceHashes:Object.fromEntries(['web/crf-core11.js','web/learn11.js','web/editor11.js','web/render-worker11.js','web/crf-video09.js'].map(relative=>[relative,sha(fs.readFileSync(path.resolve(__dirname,'..',relative)))])),environment:{node:process.version,platform:process.platform,arch:process.arch}};
  const destination=path.resolve(arg('--report',path.join(__dirname,'../reports/v11/browser/artifact-validation.json')));fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:report.status,report:destination,png:report.png,video:{codec:stream.codec_name,width:stream.width,height:stream.height,frames:stream.nb_read_frames,duration:probe.format.duration,firstFrameDifference:report.video.firstFrameDifference}},null,2)+'\n');
  if(report.status!=='passed')process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
