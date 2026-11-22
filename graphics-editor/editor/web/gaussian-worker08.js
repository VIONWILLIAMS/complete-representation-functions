'use strict';
importScripts('crf-gaussian08.js');
const E=globalThis.CRF08||globalThis.CRFgaussian08;
const assets=new Map();
let abortController=null;
self.onmessage=async function(event){
  const m=event.data;
  try{
    if(!E)throw new Error('高斯内核未加载。');
    if(m.type==='render'){
      const scene={...m.scene,assets:{...m.scene.assets}};
      if(m.assetKeys){for(const [id,key] of Object.entries(m.assetKeys)){if(scene.assets[id])assets.set(key,scene.assets[id]);else if(assets.has(key))scene.assets[id]=assets.get(key);else throw new Error('渲染线程缺少高斯资产：'+id);}}
      const started=performance.now(),out=await E.renderScene(scene);
      self.postMessage({type:'render',id:m.id,width:out.width,height:out.height,data:out.data,elapsedMs:performance.now()-started},[out.data.buffer]);
    }else if(m.type==='fit'){
      abortController=new AbortController();
      const started=performance.now();
      const asset=await E.fitImage({width:m.width,height:m.height,data:m.data},{...m.options,signal:abortController.signal,onProgress:p=>self.postMessage({type:'progress',id:m.id,...p})});
      self.postMessage({type:'fit',id:m.id,asset,elapsedMs:performance.now()-started});
    }else if(m.type==='cancel'){abortController?.abort();}
  }catch(error){self.postMessage({type:'error',id:m.id,error:String(error?.message||error)});}
};
