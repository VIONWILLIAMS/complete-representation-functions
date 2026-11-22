/* Optional browser-agent interface. Calls the same validated actions as the UI. */
(function(){
  'use strict';
  const tools=[
    {name:'crf_read_scene',description:'Read the current CRF 0.6 scene, persistent object IDs, sources, capabilities and rendering state. Set includeProgram to receive the complete executable JSON including declared field coefficients.',inputSchema:{type:'object',properties:{includeProgram:{type:'boolean'}},additionalProperties:false},annotations:{readOnlyHint:true}},
    {name:'crf_apply_operations',description:'Apply a validated atomic array of CRF scene edits to the current program, then render and return the updated state. Supported op names are set, add, remove, replace, camera and light. Read the current program first for object IDs.',inputSchema:{type:'object',properties:{operations:{type:'array',minItems:1,maxItems:100,items:{type:'object'}}},required:['operations'],additionalProperties:false}},
    {name:'crf_set_program',description:'Replace the current scene with a validated crf.program.v0.6 JSON program and render it. This creates an undo entry. The program is declarative; arbitrary JavaScript is not executed.',inputSchema:{type:'object',properties:{program:{type:'object'}},required:['program'],additionalProperties:false}},
    {name:'crf_render_view',description:'Render the current program at a requested time and optional camera parameters. Camera changes are explicit editable scene operations. Return frame diagnostics and visible object coverage.',inputSchema:{type:'object',properties:{time:{type:'number',minimum:0,maximum:30},camera:{type:'object'},quality:{type:'string',enum:['preview','final']}},additionalProperties:false}},
    {name:'crf_undo',description:'Undo the last scene transaction and render the restored program.',inputSchema:{type:'object',properties:{},additionalProperties:false}}
  ];
  window.CRF06_TOOL_MANIFEST={schema:'crf.ai_tools.v0.6',interface:'document.modelContext, when supported; CRFEditor06 public API otherwise',tools};
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  function checked(input,allowed){
    if(!object(input))throw new Error('Expected an object argument.');
    for(const key of Object.keys(input))if(!allowed.includes(key))throw new Error('Unknown argument: '+key);
    return input;
  }
  function summary(api,full){
    const program=api.getProgram();
    const value={schema:program.schema,id:program.id,title:program.title,camera:program.camera,light:program.light,timeline:program.timeline,objects:program.objects.map(o=>({id:o.id,label:o.label,visible:o.visible,source:o.source,surface:o.surface,transform:o.transform,material:{kind:o.material.kind,color:o.material.color,roughness:o.material.roughness,field:o.material.field?{width:o.material.field.width,height:o.material.field.height,mode:o.material.field.mode,hasConfidence:!!o.material.field.confidenceBase64}:null}})),status:api.getStatus()};
    value.render=typeof api.inspect==='function'?api.inspect().canvas:null;
    if(full)value.program=program;
    return value;
  }
  async function execute(name,input){
    const api=window.CRFEditor06;if(!api)throw new Error('Editor is not initialized.');await api.ready;
    if(name==='crf_read_scene'){checked(input,['includeProgram']);if(input.includeProgram!==undefined&&typeof input.includeProgram!=='boolean')throw new Error('includeProgram must be boolean.');return summary(api,!!input.includeProgram);}
    if(name==='crf_apply_operations'){
      checked(input,['operations']);if(!Array.isArray(input.operations)||!input.operations.length||input.operations.length>100)throw new Error('Provide 1–100 operations.');
      window.CRFProgram.applyOps(api.getProgram(),input.operations);
      await api.applyOps(input.operations);await api.render({quality:'preview'});return summary(api,false);
    }
    if(name==='crf_set_program'){
      checked(input,['program']);window.CRFProgram.assert(input.program);await api.setProgram(input.program);await api.render({quality:'preview'});return summary(api,false);
    }
    if(name==='crf_render_view'){
      checked(input,['time','camera','quality']);
      const duration=api.getProgram().timeline.duration;
      if(input.time!==undefined&&(!Number.isFinite(input.time)||input.time<0||input.time>duration))throw new Error('time must be within the current scene timeline: 0..'+duration+' seconds.');
      if(input.quality!==undefined&&!['preview','final'].includes(input.quality))throw new Error('Unknown quality.');
      if(input.camera!==undefined){if(!object(input.camera))throw new Error('camera must be an object.');await api.applyOps([{op:'camera',values:input.camera}]);}
      const frame=await api.render({time:input.time===undefined?null:input.time,quality:input.quality||'preview'}),counts={};
      if(frame.ids){const objects=api.getProgram().objects;for(const id of frame.ids)if(id>=0){const key=objects[id].id;counts[key]=(counts[key]||0)+1;}}
      return {...summary(api,false),frame:{width:frame.width,height:frame.height,time:frame.time,objectPixelCoverage:counts}};
    }
    if(name==='crf_undo'){checked(input,[]);await api.undo();await api.render({quality:'preview'});return summary(api,false);}
    throw new Error('Unknown tool.');
  }
  window.CRF06Agent={manifest:()=>JSON.parse(JSON.stringify(window.CRF06_TOOL_MANIFEST)),execute};
  let started=false;
  async function boot(){
    if(started||!window.CRFEditor06)return;started=true;
    try{
      await window.CRFEditor06.ready;
      const registry=document.modelContext;
      window.CRF06_AGENT_STATUS={supported:typeof registry?.registerTool==='function',registered:[],errors:[]};
      if(!window.CRF06_AGENT_STATUS.supported)return;
      const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
      for(const definition of tools){
        try{await registry.registerTool({...definition,execute:input=>execute(definition.name,input)},{signal:lifecycle.signal});window.CRF06_AGENT_STATUS.registered.push(definition.name);}
        catch(error){window.CRF06_AGENT_STATUS.errors.push({name:definition.name,message:error.message});}
      }
    }catch(error){window.CRF06_AGENT_STATUS={supported:false,registered:[],errors:[{message:error.message}]};}
  }
  window.addEventListener('crf06-ready',boot,{once:true});window.addEventListener('load',boot,{once:true});boot();
})();
