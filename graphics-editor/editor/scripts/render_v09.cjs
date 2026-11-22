#!/usr/bin/env node
'use strict';
/** Zero-install offline renderer: uses only Node built-ins and the editor engines. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const G=require('../web/crf-generative09.js'),B=require('../web/crf-boundary09.js'),G08=require('../web/crf-gaussian08.js');
const ROOT=path.resolve(__dirname,'..'),WEB=path.join(ROOT,'web');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),out.length-4);return out;}
function encodePNG(image){
 const{width,height,data}=image;if(data.length!==width*height*4)throw new Error('Invalid RGBA output');
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(data.buffer,data.byteOffset+y*width*4,width*4).copy(rows,y*(width*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
function readJSON(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function webFile(url){if(typeof url!=='string'||url.includes('://'))throw new Error('Local relative dependency required');const p=path.resolve(WEB,url.replace(/^\//,''));if(p!==WEB&&!p.startsWith(WEB+path.sep))throw new Error('Dependency outside web root');return p;}
let streetCache=null;
function loadStreet(){if(streetCache)return streetCache;const context=readJSON(webFile('assets/v09/street/context.json')),asset=readJSON(webFile(context.baselineAssetUrl)),detail=readJSON(webFile(context.detailAssetUrl));streetCache=B.prepareStreet({baseline:G08.renderAsset(asset),context,detail});return streetCache;}
function cameraAt(base={},time=0,view='front'){
 if(!['front','left','right'].includes(view))throw new Error('View must be front, left or right');
 const u=clamp(time/5,0,1),s=u*u*(3-2*u),offset=view==='left'?-.042:view==='right'?.042:0;
 return{panX:clamp((base.panX||0)+offset+.056*s,-.12,.12),panY:clamp((base.panY||0)-.008*s,-.12,.12),zoom:clamp((base.zoom||1)*(1+.065*s),.8,1.3)};
}
function resample(image,width,height,camera={panX:0,panY:0,zoom:1}){
 const z=Math.max(camera.zoom,1/(1-2*Math.max(Math.abs(camera.panX),Math.abs(camera.panY)))),sw=image.width/z,sh=image.height/z,sx=(image.width-sw)/2+camera.panX*image.width,sy=(image.height-sh)/2+camera.panY*image.height;
 if(width===image.width&&height===image.height&&sx===0&&sy===0&&z===1)return image;
 const out=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const xx=clamp(sx+(x+.5)*sw/width-.5,0,image.width-1),yy=clamp(sy+(y+.5)*sh/height-.5,0,image.height-1),ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy,p=(y*width+x)*4;
  for(let c=0;c<4;c++){const a=image.data[(iy*image.width+ix)*4+c],b=image.data[(iy*image.width+Math.min(ix+1,image.width-1))*4+c],d=image.data[(Math.min(iy+1,image.height-1)*image.width+ix)*4+c],e=image.data[(Math.min(iy+1,image.height-1)*image.width+Math.min(ix+1,image.width-1))*4+c];out[p+c]=Math.round((a*(1-fx)+b*fx)*(1-fy)+(d*(1-fx)+e*fx)*fy);}
 }
 return{...image,width,height,data:out,diagnostics:{...(image.diagnostics||{}),viewMode:'image_plane_crop_not_3d_reconstruction',resampling:'fixed CPU bilinear; browser Canvas interpolation can differ'}};
}
function viewportSize(sourceWidth,sourceHeight,width,height,fit){
 if(fit!=='contain')return{width,height};
 const scale=Math.min(width/sourceWidth,height/sourceHeight),w=Math.round(sourceWidth*scale),h=Math.round(sourceHeight*scale);
 if(w<64||h<64)throw new Error('Contained native viewport is below the renderer minimum size');
 return{width:w,height:h};
}
function letterbox(image,width,height){
 const x=Math.floor((width-image.width)/2),y=Math.floor((height-image.height)/2);if(x<0||y<0)throw new Error('Contained content exceeds output canvas');
 const data=new Uint8ClampedArray(width*height*4);for(let i=3;i<data.length;i+=4)data[i]=255;
 for(let row=0;row<image.height;row++)data.set(image.data.subarray(row*image.width*4,(row+1)*image.width*4),((row+y)*width+x)*4);
 const viewport={fit:'contain',x,y,width:image.width,height:image.height,containerWidth:width,containerHeight:height,paddingRGBA:[0,0,0,255],nativeAspectPreserved:true,resampledContent:!!image.diagnostics?.resampling};
 return{...image,width,height,data,viewport,diagnostics:{...(image.diagnostics||{}),viewport}};
}
function unwrap(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Project must be an object');
 if(raw.schema==='crf.editor_project.v0.9')return{kind:raw.kind,scene:raw.scene,street:raw.street,...(Object.hasOwn(raw,'model')?{model:raw.model}:{}),view:raw.camera??'front',time:raw.time??0};
 if(raw.schema===G.GENERATIVE_SCHEMA09)return{kind:'native',scene:raw,...(Object.hasOwn(raw,'appearanceModel')?{model:raw.appearanceModel}:{}),view:'front',time:0};
 if(raw.schema==='crf.street_edit.v0.9')return{kind:'street',street:raw.state||raw,view:'front',time:0};
 if(raw.schema==='crf.gaussian_asset.v0.8')return{kind:'observation',scene:raw,view:'front',time:0};
 throw new Error('Unsupported CRF project schema');
}
function renderProject(raw,options={}){
 const project=unwrap(raw),view=options.view??project.view,time=options.time??project.time;if(!Number.isFinite(time)||time<0||time>5)throw new Error('Time must be 0..5 seconds');
 for(const k of ['width','height'])if(options[k]!==undefined&&(!Number.isInteger(options[k])||options[k]<64||options[k]>2048))throw new Error(k+' must be an integer in64..2048');
 const fit=options.fit??'native';if(!['native','contain'].includes(fit))throw new Error('fit must be native or contain');
 let image,camera,outputWidth,outputHeight;
 if(project.kind==='native'){
  const validation=G.validateScene(project.scene);if(!validation.ok)throw new Error('Invalid native scene: '+validation.errors.join(' '));
  const scene=G.normalizeScene(project.scene),model=Object.hasOwn(project,'model')?project.model:Object.hasOwn(scene,'appearanceModel')?scene.appearanceModel:(fs.existsSync(webFile('assets/v09/shared-appearance.json'))?readJSON(webFile('assets/v09/shared-appearance.json')):null);
  outputWidth=options.width??scene.width;outputHeight=options.height??scene.height;const size=viewportSize(scene.width,scene.height,outputWidth,outputHeight,fit);
  camera=cameraAt(scene.camera,time,view);image=G.renderScene(scene,{model,...size,time:time/5,camera});
 }else if(project.kind==='street'){
  const r=B.renderStreet(loadStreet(),project.street||B.createState());outputWidth=options.width??r.width;outputHeight=options.height??r.height;const size=viewportSize(r.width,r.height,outputWidth,outputHeight,fit);camera=cameraAt({},time,view);image=resample(r,size.width,size.height,camera);
 }else if(project.kind==='observation'){
  const r=G08.renderAsset(project.scene);outputWidth=options.width??r.width;outputHeight=options.height??r.height;const size=viewportSize(r.width,r.height,outputWidth,outputHeight,fit);camera=cameraAt({},time,view);image=resample(r,size.width,size.height,camera);
 }else throw new Error('Unsupported project kind');
 if(fit==='contain')image=letterbox(image,outputWidth,outputHeight);
 return{...image,projectKind:project.kind,sceneId:project.scene?.id||'street',view,time,camera};
}
function writeRender(raw,target,options={}){
 const started=performance.now(),r=renderProject(raw,options),png=encodePNG(r);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,png);
 const rgb=Buffer.alloc(r.width*r.height*3);for(let i=0;i<r.width*r.height;i++){rgb[i*3]=r.data[i*4];rgb[i*3+1]=r.data[i*4+1];rgb[i*3+2]=r.data[i*4+2];}
 const report={schema:'crf.offline_render.v0.9',sceneId:r.sceneId,kind:r.projectKind,width:r.width,height:r.height,view:r.view,time:r.time,camera:r.camera,viewport:r.viewport||{fit:'native',x:0,y:0,width:r.width,height:r.height},
  rgbaSHA256:hash(r.data),rgbSHA256:hash(rgb),pngSHA256:hash(png),bytes:png.length,elapsedMs:performance.now()-started,
  engineSourceSHA256:hash(fs.readFileSync(path.join(WEB,'crf-generative09.js'))),diagnostics:r.diagnostics||r.stats,sourcePhotoReadByRenderer:false};
 if(options.report!==false)fs.writeFileSync(target.replace(/\.png$/i,'')+'.render.json',JSON.stringify(report,null,2)+'\n');
 return report;
}
function argumentsOf(argv){const options={},pos=[];for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const name=a.slice(2);if(['help','frames','views','all'].includes(name))options[name]=true;else{if(i+1>=argv.length)throw new Error('Missing value for '+a);options[name]=argv[++i];}}else pos.push(a);}for(const k of ['width','height','time','fps','duration'])if(options[k]!==undefined){options[k]=Number(options[k]);if(!Number.isFinite(options[k]))throw new Error('Invalid '+k);}return{options,pos};}
async function main(argv){
 const{options:o,pos}=argumentsOf(argv);
 if(o.help||pos.length<2){console.log('CRF 0.9 offline renderer · Node >=20 · no npm install required\n\nnode scripts/render_v09.cjs scene.json output.png [--view front|left|right] [--time 0..5] [--width 1024 --height 768] [--fit native|contain]\nnode scripts/render_v09.cjs --views scene.json output_directory\nnode scripts/render_v09.cjs --frames scene.json frame_directory --fps 24 --duration 5 --width 1920 --height 1080\nFrames always preserve scene aspect ratio with opaque black padding (contain).\nnode scripts/render_v09.cjs --all web/assets/v09/generated/index.json output_directory');return;}
 const source=path.resolve(pos[0]),target=path.resolve(pos[1]),raw=readJSON(source);
 if(o.all){const entries=raw.examples||raw.results;if(!Array.isArray(entries)||!entries.length)throw new Error('Index has no published examples');const reports=[];fs.mkdirSync(target,{recursive:true});for(const e of entries){if(typeof e.id!=='string'||!/^[-a-zA-Z0-9_.]+$/.test(e.id))throw new Error('Unsafe example ID');if(!e.sceneUrl){if(e.imageUrl)throw new Error('Published image missing sceneUrl: '+e.id);reports.push({id:e.id,status:'not_renderable',reason:e.error||e.status||'No scene supplied'});continue;}reports.push({id:e.id,status:'rendered',...writeRender(readJSON(webFile(e.sceneUrl)),path.join(target,e.id+'.png'),o)});}fs.writeFileSync(path.join(target,'all-render-reports.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({count:reports.length,rendered:reports.filter(r=>r.status==='rendered').length,reports}));return;}
 if(o.views){const reports=[];for(const view of ['left','front','right'])reports.push(writeRender(raw,path.join(target,view+'.png'),{...o,view,time:o.time??0}));fs.writeFileSync(path.join(target,'views.json'),JSON.stringify({schema:'crf.views.v0.9',scope:unwrap(raw).kind==='native'?'inferred image-plane depth parallax':'observed image-plane crop',reports},null,2));console.log(JSON.stringify({views:reports}));return;}
 if(o.frames){const fps=o.fps??24,duration=o.duration??5;if(fps!==24||duration!==5)throw new Error('Frozen 0.9 video protocol is 24 FPS ×5 s');if(o.fit&&o.fit!=='contain')throw new Error('Video frames require contain projection; aspect stretching is unsupported');fs.mkdirSync(target,{recursive:true});const reports=[];for(let i=0;i<120;i++){const time=i/fps,report=writeRender(raw,path.join(target,String(i).padStart(4,'0')+'.png'),{...o,fit:'contain',width:o.width??1920,height:o.height??1080,time,view:o.view??'front',report:false});reports.push({frame:i,time,...report});if(i%12===0||i===119)console.log(JSON.stringify({phase:'frames',completed:i+1,total:120,elapsedMs:report.elapsedMs}));}
  const trajectory={schema:'crf.camera_trajectory.v0.9',fps,duration,frameCount:120,timeConvention:'frame i at i/24 s; normalized trajectory u=t/5',curve:'s=u*u*(3-2*u); panX += .056*s; panY -= .008*s; zoom *= 1+.065*s; viewOffset = ±.042',preservesSceneCamera:true,viewport:reports[0].viewport,aspectPolicy:'Native scene aspect preserved; opaque black padding; no content stretch or crop',width:o.width??1920,height:o.height??1080,source:path.basename(source),reports};fs.writeFileSync(path.join(target,'trajectory.json'),JSON.stringify(trajectory,null,2));console.log(JSON.stringify({phase:'frames_complete',frames:120,width:trajectory.width,height:trajectory.height,viewport:trajectory.viewport}));return;
 }
 console.log(JSON.stringify(writeRender(raw,target,{...o,view:o.view,time:o.time})));
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({error:e.message}));process.exitCode=1;});
module.exports={renderProject,writeRender,encodePNG,cameraAt,resample,letterbox,viewportSize,webFile,unwrap,main};
