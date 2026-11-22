'use strict';
document.querySelector('#run').addEventListener('click',async()=>{
  const button=document.querySelector('#run'),status=document.querySelector('#status'),results=document.querySelector('#results');button.disabled=true;status.textContent='正在运行真实渲染与像素比较…';
  try{
    const data=globalThis.CRF_SCENE_DATA,C=globalThis.CRFCore;
    const image=new Image();image.src='assets/reference.png';await image.decode();
    const truth=document.createElement('canvas');truth.width=data.width;truth.height=data.height;const ctx=truth.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const reference=ctx.getImageData(0,0,data.width,data.height).data;
    const renderer=new CRFRenderer(document.querySelector('#canvas'),data);const state=C.initialState(data);
    const first=renderer.render(state,{quality:'exact',time:null}),actual=renderer.readPixels().rgba;
    const metrics=(a,b)=>{let exact=0,mae=0,max=0;for(let i=0;i<a.length;i+=4){let same=true;for(let c=0;c<3;c++){const v=Math.abs(a[i+c]-b[i+c]);mae+=v;max=Math.max(max,v);same&&=v===0;}exact+=same?1:0;}return{exactPixels:exact,totalPixels:a.length/4,mae:mae/(a.length/4*3),maxAbsChannelError:max}};
    const baseline=metrics(actual,reference),blue=C.applyOperations(state,[{op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:.72}}]);
    const blueStats=renderer.render(blue,{quality:'exact',time:null}),changed=renderer.readPixels().rgba,labels=C.decodeData(data).labels,wall=state.objects.find(o=>o.id==='wall.main').index;
    let outside=0,inside=0;for(let i=0;i<labels.length;i++){if([0,1,2].some(c=>actual[i*4+c]!==changed[i*4+c])){if(labels[i]===wall)inside++;else outside++;}}
    const tilted=C.applyOperations(state,[{op:'setCamera',values:{yaw:7,zoom:1.055}}]);const angleStats=renderer.render(tilted,{quality:'interactive',lod:2,time:null});const angle=renderer.readPixels().rgba;
    const angleDifference=metrics(angle,actual);
    const restored=renderer.render(state,{quality:'exact',time:null});const restore=metrics(renderer.readPixels().rgba,reference);
    const probes=[[300,425],[179,600],[450,500],[330,900]].map(([x,y])=>({x,y,id:renderer.pick(x,y)}));
    const report={schema:'crf.browser_verification.v0.4',userAgent:navigator.userAgent,pass:baseline.exactPixels===667000&&outside===0&&inside>10000&&angleDifference.mae>1&&restore.exactPixels===667000,baseline,recolor:{changedWallPixels:inside,changedOtherPixels:outside},angleDifference,restore,picking:probes,renders:{first,blue:blueStats,angle:angleStats,restored},mediaRecorderSupported:typeof MediaRecorder!=='undefined'&&typeof document.querySelector('#canvas').captureStream==='function'};
    results.textContent=JSON.stringify(report,null,2);status.textContent=report.pass?'通过：667,000 / 667,000 像素一致，局部编辑隔离通过':'验收失败：请查看下方具体差异';
  }catch(error){status.textContent='验收失败';results.textContent=String(error.stack||error);}finally{button.disabled=false;}
});
