importScripts('crf-gaussian08.js','crf-generative09.js','crf-boundary09.js');
let streetPromise=null;
self.onmessage=async function(event){
 const {id,kind,scene,state,options}=event.data;const started=performance.now();
 try{
  let result;
  if(kind==='street'){
   if(!streetPromise)streetPromise=CRFBoundary09.loadStreet({baseUrl:'',gaussianEngine:CRF08}).catch(e=>{streetPromise=null;throw e;});
   result=CRFBoundary09.renderStreet(await streetPromise,state||{});
  }else if(kind==='observation')result=CRF08.renderAsset(scene);
  else if(kind==='native'){const valid=CRF09.validateScene(scene);if(!valid.ok)throw new Error(valid.errors.join(' '));result=CRF09.renderScene(scene,options||{});}
  else throw new Error('Unsupported rendering kind');
  const data=new Uint8ClampedArray(result.data);
  self.postMessage({id,ok:true,width:result.width,height:result.height,data,diagnostics:result.diagnostics||result.stats||{},milliseconds:performance.now()-started},[data.buffer]);
 }catch(error){self.postMessage({id,ok:false,error:String(error.message||error).slice(0,500)});}
};
