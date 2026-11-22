/* Shared 0.6 scene assembly for the editor and headless exports. */
(function(root,factory){
  const Core = typeof module==='object'&&module.exports ? require('./crf-program.js') : root.CRFProgram;
  const api=factory(root,Core);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CRFScenes06=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root,Core){
  'use strict';
  const copy=v=>JSON.parse(JSON.stringify(v));
  function observation(kind){
    const data=root.CRF_OBSERVED_FRUIT;
    if(!data||!Array.isArray(data.assets))return null;
    return data.assets.find(a=>a.kind===kind||a.id===kind||a.object&&a.object.surface&&a.object.surface.detail===kind)||null;
  }
  function create(id){
    const program=Core.createPreset(id||'common');
    if((id||'common')==='common'){
      const asset=observation('apple');
      if(!asset)throw new Error('参考拟合资产尚未载入，无法建立共同场景。');
      const index=program.objects.findIndex(o=>o.id==='apple.observed');
      if(index<0)throw new Error('共同场景缺少观测对象插槽。');
      const slot=program.objects[index],object=copy(asset.object);
      object.id=slot.id;object.label='参考照片中的苹果';object.transform=copy(slot.transform);
      object.source=Object.assign({},object.source,{kind:'observed_fit',assetId:asset.id||'apple',referenceUrl:asset.referenceUrl||null});
      program.objects[index]=object;
    }
    Core.assert(program);
    return program;
  }
  function manifest(){
    return {schema:'crf.scenes.v0.6',scenes:[
      {id:'common',title:'同一个场景',description:'参考照片拟合的苹果与程序生成的梨，共享空间、材质操作、遮挡与时间。'},
      {id:'stilllife',title:'函数静物',description:'以场景函数构建形状、材质、接触关系与光照。'},
      {id:'courtyard',title:'午后庭院',description:'完全由场景程序构造的建筑、立柱和庭院空间。'}]};
  }
  return {VERSION:'0.6.0',create,observation,manifest};
});
