#!/usr/bin/env node
'use strict';
// Verify actual browser downloads independently from page state and screenshots.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const cp=require('node:child_process'), {PNG}=require('pngjs');
const Core=require('../web/crf-quality12.js');
const root=path.resolve(__dirname,'..'), directory=path.join(root,'reports/quality12/browser');
const read=name=>fs.readFileSync(path.join(directory,name));
const json=name=>JSON.parse(read(name));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function compare(a,b) {
  if(a.width!==b.width||a.height!==b.height||a.data.length!==b.data.length)throw Error('Frame dimension mismatch');
  let absolute=0,square=0,max=0,changed=0;
  for(let i=0;i<a.data.length;i++) {
    const d=Math.abs(a.data[i]-b.data[i]);changed+=+(d!==0);max=Math.max(max,d);
    if(i%4!==3){absolute+=d;square+=d*d;}
  }
  const channels=a.width*a.height*3,mse=square/channels;
  return {width:a.width,height:a.height,changedRGBAChannels:changed,maxChannelError:max,
    mae: absolute/channels,psnr:mse?10*Math.log10(65025/mse):null,exact:changed===0};
}
function fileRecord(name){const bytes=read(name);return {path:'reports/quality12/browser/'+name,bytes:bytes.length,sha256:sha(bytes)};}
(async()=>{
  const wrapper=JSON.parse(fs.readFileSync(path.join(root,'web/assets/quality12/alpine.asset.json')));
  const project=Core.createProject(wrapper),native=Core.render(project);
  const nativePNG=PNG.sync.read(read('native-browser.png'));
  const nativeMatch=compare(native,nativePNG);
  const reopenedPNG=PNG.sync.read(read('reopened-browser.png'));
  const reopenedMatch=compare(native,reopenedPNG);
  const doubled=compare(Core.render(project,{width:1600,height:1062}),PNG.sync.read(read('double-browser.png')));
  const editedProject=await Core.parseProject(read('edited-browser.crf.json').toString('utf8'));
  const editedMatch=compare(Core.render(editedProject),PNG.sync.read(read('edited-browser.png')));
  const editedDifference=compare(native,PNG.sync.read(read('edited-browser.png')));
  const reviewed=await Core.parseProject(read('reviewed-browser.crf.json').toString('utf8'));
  const reviewedMatch=compare(native,Core.render(reviewed));
  for(const row of [nativeMatch,reopenedMatch,doubled,editedMatch,reviewedMatch])if(!row.exact)throw Error('Browser PNG or project replay differs from the actual function');
  if(!editedDifference.changedRGBAChannels||reviewed.feedback?.length!==1)throw Error('Editing or persistent feedback was not observed');
  const baselineSession=json('source-free-session.json'),editSession=json('edit-session.json'),lastSession=json('reopen-video-session.json');
  if(baselineSession.referenceImageLoads!==0||baselineSession.referencePixelsPassedToWorker!==false)throw Error('Default export did not demonstrate source-free UI rendering');
  const renderedRun=editSession.runs.find(r=>r.kind==='harness'&&r.status==='rendered');
  const rejectedRun=editSession.runs.find(r=>r.kind==='harness'&&r.status==='failed'&&r.error.code==='EDIT_SCOPE');
  if(!renderedRun||!rejectedRun)throw Error('Actual harness edit and rejection evidence is missing');
  if(!lastSession.exports.some(r=>r.kind==='video'&&r.status==='cancelled'))throw Error('Actual video cancellation evidence missing');
  const videoPath=path.join(directory,'camera-browser.webm'),videoReport=json('video-export.json');
  const probe=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,avg_frame_rate,nb_read_frames,color_space,color_range','-show_entries','format=duration','-of','json',videoPath],{encoding:'utf8'}));
  const stream=probe.streams[0];
  if(stream.codec_name!=='vp9'||stream.width!==800||stream.height!==531||stream.nb_read_frames!=='120'||stream.avg_frame_rate!=='24/1'||+probe.format.duration!==5)throw Error('Exported video stream does not match requested frames, duration or dimensions');
  const frames=cp.execFileSync('ffmpeg',['-v','error','-i',videoPath,'-vf','select=eq(n\\,0)+eq(n\\,119)','-vsync','0','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:16*1024*1024});
  const frameBytes=800*531*4;
  if(frames.length!==2*frameBytes)throw Error('Could not decode first and last camera frames');
  const cameraChecks=[0,119].map((index,i)=>{
    const z=1+.08*(index/24)/5,rw=1/z,rh=1/z;
    const expected=Core.render(Core.withView(reviewed,{width:800,height:531,roi:[.5-rw/2,.5-rh/2,.5+rw/2,.5+rh/2]}));
    return {frameIndex:index,timeSeconds:index/24,comparisonToComputedFrame:compare(expected,{width:800,height:531,data:frames.subarray(i*frameBytes,(i+1)*frameBytes)})};
  });
  const report={schema:'crf.quality_browser_artifact_verification.v1',verifiedAt:new Date().toISOString(),status:'passed',
    verifier:{path:'scripts/verify_browser_quality12.cjs',sha256:sha(fs.readFileSync(__filename))},
    nativePNG:nativeMatch,reopenedPNG:reopenedMatch,doubleResolutionPNG:doubled,editedPNG:editedMatch,
    editedDifferenceFromBaseline:editedDifference,savedProjectReplay:reviewedMatch,
    savedProjectHash:reviewed.contentHash,feedbackCount:reviewed.feedback.length,
    sourceFreeUI:{referenceImageLoads:baselineSession.referenceImageLoads,referencePixelsPassedToWorker:false},
    harness:{actualBoundedCodeEdit:true,actualOutOfScopeRejection:true,successfulRun:renderedRun,failedRun:rejectedRun},
    video:{independentProbe:probe,reported:{width:videoReport.width,height:videoReport.height,fps:videoReport.fps,frameCount:videoReport.frameCount,duration:videoReport.duration,codec:videoReport.codec},
      firstDecodedFrameAgainstRealReference:compare(PNG.sync.read(fs.readFileSync(path.join(root,'web/assets/v08/references/landscape.alpine.png'))),
        {width:800,height:531,data:frames.subarray(0,frameBytes)}),
      actualCancellationObserved:true,cameraChecks,scope:'Explicit 2D camera zoom; natural scene dynamics not learned. Decoded-frame errors include lossy video encoding and color conversion.'},
    artifacts:['native-browser.png','native-browser.crf.json','edited-browser.png','edited-browser.crf.json','double-browser.png',
      'reviewed-browser.crf.json','reopened-browser.png','camera-browser.webm','video-export.json','source-free-session.json',
      'edit-session.json','reopen-video-session.json','verified-workspace.jpg'].map(fileRecord),
    numericalScope:'PNG replay is exact across runtimes. Video frames are compared separately. Real-reference image quality is in alpine.quality.json, not these replay differences.'};
  fs.writeFileSync(path.join(directory,'artifact-verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,allPNGExact:true,feedbackCount:report.feedbackCount,sourceFreeUI:report.sourceFreeUI,video:report.video},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
