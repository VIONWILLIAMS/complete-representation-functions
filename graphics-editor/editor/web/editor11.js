/* CRF 1.1 studio. GUI and agent edits use the same immutable Project/Patch API. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    root.CRFStudio11 = api;
    api.boot(root).catch(error => {
      const node = root.document.getElementById('status');
      if (node) node.textContent = '工作台未能启动：' + api.errorText(error);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const errorText = error => String(error?.message || error || '操作未完成。').replace(/sk-[A-Za-z0-9_-]{12,}/g, '[凭据已隐藏]').slice(0,1200);
  const need = (ok, message) => { if (!ok) throw new Error(message); };
  const assertValid = value => need(value && value.ok, (value?.errors || ['无效工程。']).join(' '));

  // The browser uses this controller directly. Tests exercise the same state
  // transitions, including stale frames and atomic failed imports/edits.
  function createSession(core) {
    const state = {project:null, selected:null, history:[], future:[], epoch:0, renderSequence:0, frame:null, previousFrame:null};
    function commit(project, {remember=true} = {}) {
      assertValid(core.validateProject(project));
      if (remember && state.project) { state.history.push(state.project); if (state.history.length > 25) state.history.shift(); state.future=[]; }
      state.previousFrame = state.frame || state.previousFrame;
      state.frame = null; state.project = project; state.epoch++;
      if (!project.scene.objects.some(object => object.id === state.selected)) state.selected = project.scene.objects[0]?.id || null;
      return project;
    }
    async function load(project, options = {}) {
      const candidate = clone(project), epoch = options.expectedEpoch ?? state.epoch;
      assertValid(await core.verifyProject(candidate));
      need(state.epoch === epoch, '工程在校验期间已变化，请重新打开。');
      need(!options.canCommit || options.canCommit(), '操作已取消或工程已变化，结果未写入。');
      return commit(candidate, options);
    }
    function patch(value) { need(state.project, '尚无工程。'); return commit(core.applyPatch(state.project, value)); }
    function applyCode(text, baseRevision, baseEpoch) {
      need(state.project.scene.revision === baseRevision && state.epoch === baseEpoch, '场景已变化；请重载当前程序，再提交修改。');
      let scene; try { scene = JSON.parse(text); } catch { throw new Error('场景程序不是有效 JSON。'); }
      return patch({baseRevision, operations:[{op:'replaceScene', scene}]});
    }
    function undo() {
      if (!state.history.length) return false;
      const previous = state.history.pop(); state.future.push(state.project); commit(withRetainedEvidence(previous), {remember:false}); return true;
    }
    function redo() {
      if (!state.future.length) return false;
      const next = state.future.pop(); state.history.push(state.project); commit(withRetainedEvidence(next), {remember:false}); return true;
    }
    function withRetainedEvidence(snapshot) {
      if (snapshot.id !== state.project.id) return snapshot;
      const restored={...snapshot,functions:{...snapshot.functions,...state.project.functions}};
      for (const field of ['references','datasets','learningRuns','feedback','history']) {
        const values=new Map();for(const value of [...snapshot[field],...state.project[field]])values.set(value?.id?'id:'+value.id:core.canonical(value),value);
        restored[field]=[...values.values()];
      }
      return restored;
    }
    function invalidateFrame() {state.previousFrame=state.frame||state.previousFrame;state.frame=null;state.renderSequence++;}
    function beginRender() {invalidateFrame();return {epoch:state.epoch, sequence:state.renderSequence};}
    function acceptFrame(ticket, frame) {
      if (ticket.epoch !== state.epoch || ticket.sequence !== state.renderSequence) return false;
      state.frame = frame; return true;
    }
    function append(field, record) {
      need(['feedback','learningRuns','history'].includes(field), '不支持的记录类型。');
      need(state.project[field].length<4096,'记录达到本工程上限，请导出后新建工程；原记录没有删除。');
      const project = {...state.project, [field]:[...(state.project[field] || []), clone(record)]};
      assertValid(core.validateProject(project)); state.project = project; return project;
    }
    return {state, load, patch, applyCode, undo, redo, beginRender, invalidateFrame, acceptFrame, append, snapshot:() => clone(state.project)};
  }

  async function boot(root) {
    const document=root.document, $=id=>document.getElementById(id), core=root.CRF11;
    need(core && root.CRFLearn11, '共享内核或学习模块不可用。');
    const session=createSession(core), state=session.state;
    const ui={references:[], selectedReference:null, time:0, playing:false, playbackTimer:null, backend:'cached', samples:1,
      active:null, training:null, comparison:null, exports:[], agentRuns:[], configured:false, codeRevision:null, codeEpoch:null, codeDirty:false,
      renderer:null, workerSequence:0, projectSequence:0, workerPending:new Map(), projectKeys:new WeakMap(), renderTimer:null, toastTimer:null,
      saveChain:Promise.resolve(), persistenceFailed:false, videoCancelled:false, videoURLs:[]};
    const fmt=(value,digits=3)=>Number.isFinite(Number(value))?Number(value).toFixed(digits):'—';
    const hex=values=>'#'+values.map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');
    const rgb=value=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255);
    function notify(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(ui.toastTimer); ui.toastTimer=setTimeout(()=>$('toast').hidden=true,6500); }
    function status(message) { $('status').textContent=message; }
    function report(title,value) { $('dialogTitle').textContent=title; $('dialogBody').textContent=typeof value==='string'?value:JSON.stringify(value,null,2); $('dialog').showModal(); }
    function guard(fn) { return async event=>{try{return await fn(event);}catch(error){status(errorText(error));notify(errorText(error));}}; }
    function setTab(name) { document.querySelectorAll('[data-tab]').forEach(node=>node.setAttribute('aria-selected',String(node.dataset.tab===name))); for(const tab of ['edit','learn','agent','evidence'])$(tab+'Panel').hidden=tab!==name; }
    function setActive(task) {
      ui.active=task;
      for(const id of ['newScene','openProject','importReference','sampleWater','searchReferences','train'])$(id).disabled=!!task;
      for(const id of ['cropX0','cropY0','cropX1','cropY1','coverageKind','removeReference'])$(id).disabled=!!task;
      $('runAgent').disabled=!!task||!ui.configured;
      $('compareBackends').disabled=!!task;
    }
    function download(blob,name) { const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000); }
    const downloadJSON=(value,name)=>download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),name);
    function imageCanvas(frame,canvas=document.createElement('canvas')) {canvas.width=frame.width;canvas.height=frame.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.data),frame.width,frame.height),0,0);return canvas;}
    async function post(url,body,{signal}={}) { const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});let result;try{result=await response.json();}catch{throw new Error('服务未返回有效 JSON（HTTP '+response.status+'）。');}if(!response.ok||result.ok===false){const error=new Error(result.error?.message||'请求失败（HTTP '+response.status+'）。');error.result=result;throw error;}return result; }
    function rows(node,entries) {node.replaceChildren();for(const [name,value] of entries){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value===undefined||value===null?'—':String(value);node.append(dt,dd);}}

    let dbPromise;
    function database() { if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{need(root.indexedDB,'浏览器不支持 IndexedDB，请下载工程保留权重。');const request=root.indexedDB.open('crf11-function-studio',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{dbPromise=null;reject(request.error);};});return dbPromise; }
    async function savedWorkspace() {const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readonly'),request=tx.objectStore('workspace').get('current');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}
    function persist() {
      if(!state.project)return Promise.resolve();
      const value={project:session.snapshot(),agentRuns:clone(ui.agentRuns),exports:clone(ui.exports),savedAt:new Date().toISOString()};
      ui.saveChain=ui.saveChain.catch(()=>{}).then(async()=>{const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('本机保存中断。'));});ui.persistenceFailed=false;$('persistenceStatus').textContent='已保存在此浏览器';}).catch(error=>{ui.persistenceFailed=true;$('persistenceStatus').textContent='本机保存失败，请下载工程';status(errorText(error));});
      return ui.saveChain;
    }

    function worker() {
      if(ui.renderer)return ui.renderer;
      ui.renderer=new Worker('render-worker11.js');
      ui.renderer.onmessage=event=>{const message=event.data,item=ui.workerPending.get(message.id);if(!item)return;ui.workerPending.delete(message.id);clearTimeout(item.timer);message.ok?item.resolve(message):item.reject(new Error(message.error||'计算未完成。'));};
      ui.renderer.onerror=event=>{for(const item of ui.workerPending.values()){clearTimeout(item.timer);item.reject(new Error(event.message||'计算线程中断。'));}ui.workerPending.clear();ui.renderer.terminate();ui.renderer=null;};
      return ui.renderer;
    }
    function calculate(project=state.project,options={}) {
      let key=ui.projectKeys.get(project);if(!key){key='project.'+(++ui.projectSequence);ui.projectKeys.set(project,key);}
      const id=++ui.workerSequence;
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ui.workerPending.delete(id);reject(new Error('计算超过等待预算；工程仍然保留。'));},90000);ui.workerPending.set(id,{resolve,reject,timer});worker().postMessage({id,operation:'render',projectKey:key,revision:project.scene.revision,project,options:{time:ui.time,backend:ui.backend,samples:ui.samples,...options}});});
    }
    function syncEvidence() {
      const frame=state.frame;
      $('frameState').classList.toggle('stale',!frame);$('frameState').textContent=frame?'当前帧已由固定版本的函数计算。':'场景已变化；等待新帧，旧评价不再代表当前画面。';
      const diagnostics=frame?.diagnostics||{},descriptor=frame?.descriptor||{};
      rows($('frameEvidence'),[['场景修订',state.project.scene.revision],['后端',descriptor.backend||ui.backend],['线性合成','RGB 与 alpha 联合采样'],['输出',frame?frame.width+' × '+frame.height:'待计算'],['实际求值',frame?fmt(frame.milliseconds,1)+' ms':'待计算'],['缓存网格',ui.backend==='cached'?'64 × 64（程序求值）':'直接求值'],['源 RGB 贴回','无'],['学习函数',Object.values(state.project.functions).filter(f=>f.kind==='neural').length],['内核构建',descriptor.rendererBuild||diagnostics.rendererBuild||core.VERSION||'见完整记录']]);
      if(ui.comparison&&ui.comparison.epoch===state.epoch){$('comparisonEvidence').textContent=JSON.stringify(ui.comparison.metrics,null,2)+'\n'+ui.comparison.width+' × '+ui.comparison.height+'；直接 '+fmt(ui.comparison.directMs,1)+' ms，缓存 '+fmt(ui.comparison.cachedMs,1)+' ms。';}else $('comparisonEvidence').textContent=ui.comparison?'场景已变化，上次对照已陈旧。':'尚未比较当前场景。';
    }
    async function render(options={}) {
      const ticket=session.beginRender();$('renderBusy').hidden=false;
      try {const frame=await calculate(state.project,options);if(!session.acceptFrame(ticket,frame))return frame;imageCanvas(frame,$('canvas'));$('dimensions').textContent=frame.width+' × '+frame.height;$('renderTime').textContent=fmt(frame.milliseconds,1)+' ms';$('backendLabel').textContent=ui.backend==='cached'?'CPU · 缓存':'CPU · 直接';$('exportPNG').disabled=false;$('stageLabel').textContent='函数求值 · '+(ui.backend==='cached'?'64² 程序场缓存':'直接数学 / 神经求值')+' · '+ui.samples+'² 联合采样';syncEvidence();return frame;}catch(error){if(ticket.epoch===state.epoch&&ticket.sequence===state.renderSequence){status(errorText(error));$('frameState').textContent='本次求值未完成：'+errorText(error);}throw error;}finally{if(ticket.sequence===state.renderSequence)$('renderBusy').hidden=true;}
    }
    function requestRender() {session.invalidateFrame();syncEvidence();clearTimeout(ui.renderTimer);ui.renderTimer=setTimeout(()=>render().catch(error=>notify(errorText(error))),100);}
    function stopPlayback() {ui.playing=false;clearTimeout(ui.playbackTimer);$('play').textContent='播放';}
    function syncTime() {$('timeline').value=String(ui.time);$('timeLabel').textContent=fmt(ui.time,2)+' / 5 s';}
    function reloadCode() {$('sceneCode').value=JSON.stringify(state.project.scene,null,2);ui.codeRevision=state.project.scene.revision;ui.codeEpoch=state.epoch;ui.codeDirty=false;$('codeStatus').textContent='与当前场景同步 · r'+ui.codeRevision;}
    function syncObjects() {
      const scene=state.project.scene;$('objectList').replaceChildren();
      for(const object of scene.objects){const button=document.createElement('button');button.className='object-row'+(object.id===state.selected?' selected':'');const dot=document.createElement('span');dot.className='dot';const label=document.createElement('span');label.textContent=object.label||object.id;const type=document.createElement('small');type.textContent=state.project.functions[object.functionRef]?.kind==='neural'?'神经':'显式';button.append(dot,label,type);button.onclick=()=>{state.selected=object.id;syncObjects();};$('objectList').append(button);}
      const object=scene.objects.find(o=>o.id===state.selected);$('objectForm').hidden=!object;
      if(object){const fn=state.project.functions[object.functionRef];$('objectTitle').textContent=object.label||object.id;const values={objectX:object.x,objectY:object.y,objectWidth:object.width,objectHeight:object.height,objectRotation:object.rotation||0,objectZ:object.zIndex||0,objectOpacity:object.opacity??1,motionX:object.motion?.vx||0,motionY:object.motion?.vy||0,motionRotation:object.motion?.rotationSpeed||0};for(const [key,value]of Object.entries(values))$(key).value=String(value);$('objectVisible').checked=object.visible!==false;$('objectTint').value=hex(object.tint||[1,1,1]);$('objectInstance').replaceChildren();const instances=fn.appearance?.model?.instances||[{label:'显式函数'}];for(let index=0;index<instances.length;index++){const option=document.createElement('option');option.value=String(index);option.textContent=(index+1)+' · '+(instances[index].label||instances[index].id||'实例');$('objectInstance').append(option);}$('objectInstance').value=String(object.instance||0);$('objectInstance').disabled=instances.length===1;}
      $('sceneWidth').value=String(scene.width);$('sceneHeight').value=String(scene.height);$('sceneBackground').value=hex(scene.background);$('objectStats').textContent=Object.keys(state.project.functions).length+' / '+scene.objects.length;
    }
    function syncLibrary() {
      const functions=Object.values(state.project.functions);$('functionCount').textContent=String(functions.length);$('functionList').replaceChildren();
      for(const fn of functions){const card=document.createElement('article');card.className='function-card';const title=document.createElement('h3');title.textContent=fn.label||fn.id;const meta=document.createElement('div');meta.className='function-meta';const tag=document.createElement('span');tag.className='function-type '+fn.kind;tag.textContent=fn.kind==='neural'?'神经外观':fn.kind==='gaussian'?'高斯':'显式函数';meta.append(tag,document.createTextNode(fn.version.slice(0,10)));const scope=document.createElement('p');scope.className='function-meta';scope.textContent=fn.kind==='neural'?(fn.appearance.model.instances.length+' 个学习实例 · '+root.CRFLearn11.parameterCount(fn.appearance.model)+' 参数'):fn.kind==='gaussian'?'观察高斯适配 · 详见来源':fn.provenance?.kind==='authored_explicit'?'人工编写的二维程序':'显式二维函数 · 详见来源';const controls=document.createElement('div');controls.className='button-row';const add=document.createElement('button');add.textContent='添加到场景';add.onclick=guard(()=>addFunction(fn));const inspect=document.createElement('button');inspect.textContent='版本与来源';inspect.onclick=()=>report(fn.label||fn.id,{...core.functionSummary(fn),provenance:fn.provenance,coverage:fn.coverage?.kind,model:fn.kind==='neural'?{architecture:fn.appearance.model.architecture,instances:fn.appearance.model.instances}:undefined});controls.append(add,inspect);card.append(title,meta,scope,controls);$('functionList').append(card);}
    }
    function trainingRecords() {
      const runs=state.project.learningRuns||[];$('trainingCount').textContent=String(runs.length);$('trainingHistory').replaceChildren();
      for(const run of runs.slice(-10).reverse()){const card=document.createElement('article');card.className='run-card'+(['failed','timed_out','cancelled','canceled'].includes(run.state||run.status)?' failed':'');const title=document.createElement('strong');title.textContent=(run.label||run.id||run.runId||'本地训练')+' · '+(run.state||run.status||'记录');const p=document.createElement('p');p.textContent='步骤 '+(run.stepsCompleted??0)+' · 最终 loss '+fmt(run.finalLoss,5)+' · 留出 '+fmt(run.validationLoss,5);const more=document.createElement('button');more.textContent='查看训练记录';more.onclick=()=>report('真实训练记录',run);card.append(title,p,more);$('trainingHistory').append(card);}
    }
    function sync() {
      $('sceneTitle').textContent=state.project.title||'函数场景';$('revision').textContent='r'+state.project.scene.revision;$('undo').disabled=!state.history.length;$('redo').disabled=!state.future.length;$('feedbackCount').textContent=(state.project.feedback?.length||0)+' 条反馈';$('integrityState').textContent='结构与固定版本已检查';syncObjects();syncLibrary();trainingRecords();syncEvidence();if(!ui.codeDirty)reloadCode();else $('codeStatus').textContent='保留未提交草稿 · 基于 r'+ui.codeRevision;syncTime();
    }
    async function changed(message,{immediate=false}={}) {stopPlayback();sync();persist();status(message);if(immediate)return render();requestRender();}
    async function applyPatch(operations,message='场景已更新。') {session.patch({baseRevision:state.project.scene.revision,operations});await changed(message);}
    async function addFunction(fn) {const scale=Math.min(state.project.scene.width*.75/fn.width,state.project.scene.height*.45/fn.height),width=fn.width*scale,height=fn.height*scale,id='object.'+Date.now().toString(36)+'.'+state.project.scene.objects.length;const object=core.createInstance(fn,{id,label:fn.label,x:(state.project.scene.width-width)/2,y:(state.project.scene.height-height)/2,width,height,zIndex:state.project.scene.objects.length+1});await applyPatch([{op:'add',object}],'固定版本已添加到场景。');state.selected=id;syncObjects();setTab('edit');}
    async function updateObject() {
      if(!state.selected)return;const object=state.project.scene.objects.find(o=>o.id===state.selected);if(!object)return;
      const values={x:Number($('objectX').value),y:Number($('objectY').value),width:Number($('objectWidth').value),height:Number($('objectHeight').value),rotation:Number($('objectRotation').value),zIndex:Number($('objectZ').value),opacity:Number($('objectOpacity').value),visible:$('objectVisible').checked,tint:rgb($('objectTint').value),instance:Number($('objectInstance').value),motion:{vx:Number($('motionX').value),vy:Number($('motionY').value),rotationSpeed:Number($('motionRotation').value)}};
      try{await applyPatch([{op:'update',id:state.selected,values}],'对象参数已更新，由内核重新计算。');}catch(error){syncObjects();throw error;}
    }

    function selectedReference() {return ui.references.find(item=>item.id===ui.selectedReference);}
    function rememberReferences() {
      const records=ui.references.map(({canvas,preview,...metadata})=>clone(metadata));
      const next={...state.project,references:[...(state.project.references||[]).filter(row=>!records.some(ref=>ref.id===row.id)),...records]};
      assertValid(core.validateProject(next));state.project=next;
      persist();
    }
    function drawReference() {
      const ref=selectedReference();$('referenceDetails').hidden=!ref;if(!ref)return;
      $('referenceTitle').textContent=ref.label;const source=ref.sourceUri;try{const url=new URL(source);$('referenceSource').hidden=!['https:','http:'].includes(url.protocol);if(!$('referenceSource').hidden)$('referenceSource').href=url.href;}catch{$('referenceSource').hidden=true;}
      ['cropX0','cropY0','cropX1','cropY1'].forEach((id,i)=>$(id).value=String(ref.crop[i]));$('coverageKind').value=ref.coverageKind==='ellipse'?'ellipse':'source_alpha';
      const canvas=$('referenceCanvas');canvas.width=480;canvas.height=Math.max(100,Math.round(480*ref.canvas.height/ref.canvas.width));const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(ref.canvas,0,0,canvas.width,canvas.height);const [x0,y0,x1,y1]=ref.crop,x=x0*canvas.width,y=y0*canvas.height,w=(x1-x0)*canvas.width,h=(y1-y0)*canvas.height;context.fillStyle='#19384777';context.fillRect(0,0,canvas.width,y);context.fillRect(0,y+h,canvas.width,canvas.height-y-h);context.fillRect(0,y,x,h);context.fillRect(x+w,y,canvas.width-x-w,h);context.strokeStyle='#f6df91';context.lineWidth=2;context.strokeRect(x,y,w,h);if(ref.coverageKind==='ellipse'){context.beginPath();context.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);context.stroke();}
      $('referenceScope').textContent=(ref.attribution?ref.attribution+' · ':'')+(ref.licenseStatus||'来源条款待核验')+'。'+(ref.coverageKind==='ellipse'?'人工椭圆覆盖。':ref.coverageKind==='inferred_mask'?'原有估计掩膜，非轮廓真值。':'保留输入透明度，未自动分离对象。');
    }
    function syncReferences() {
      $('referenceCount').textContent=String(ui.references.length);$('referenceList').replaceChildren();
      for(const [index,ref]of ui.references.entries()){const button=document.createElement('button');button.className='reference-card'+(ref.id===ui.selectedReference?' active':'');button.title=ref.label;const image=document.createElement('img');image.src=ref.preview;image.alt=ref.label;const count=document.createElement('span');count.textContent=String(index+1);button.append(image,count);button.onclick=()=>{ui.selectedReference=ref.id;syncReferences();};$('referenceList').append(button);}
      if(!ui.references.length){const p=document.createElement('p');p.className='empty';p.textContent='导入照片，或从湖水样本开始。';$('referenceList').append(p);}drawReference();
    }
    async function addReferenceBlob(blob,metadata={}) {
      need(ui.references.length<8,'一次训练最多保留 8 张参考。');need(blob.size>0&&blob.size<=12*1024*1024,'参考图片需要在 12 MiB 以内。');
      const sourceBytes=new Uint8Array(await blob.arrayBuffer()),contentHash=await core.digestBytes(sourceBytes);if(ui.references.some(ref=>ref.contentHash===contentHash)){notify('该参考已经在列表中。');return;}
      const bitmap=await createImageBitmap(blob);need(bitmap.width>=8&&bitmap.height>=8,'参考图边长至少 8 px。');const originalWidth=bitmap.width,originalHeight=bitmap.height,scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const ref={id:'reference.'+contentHash.slice(0,20),label:metadata.label||'参考 '+(ui.references.length+1),sourceGroup:metadata.sourceGroup||'source.'+contentHash,sourceUri:metadata.sourceUri||'local-file:'+String(metadata.label||'image'),contentHash,originalWidth,originalHeight,crop:metadata.crop||[0,0,1,1],coverageKind:metadata.coverageKind||'source_alpha',originalSourceHash:metadata.originalSourceHash,licenseStatus:metadata.licenseStatus||'用户导入；来源条款未核验',attribution:metadata.attribution||'',canvas,preview:canvas.toDataURL('image/png')};ui.references.push(ref);ui.selectedReference=ref.id;rememberReferences();syncReferences();setTab('learn');status('已读取真实参考。选择裁剪后可开始本地训练。');return ref;
    }
    function cropChanged() {const ref=selectedReference();if(!ref)return;need(!ui.active,'任务运行中，参考裁剪已冻结。');const crop=['cropX0','cropY0','cropX1','cropY1'].map(id=>Number($(id).value));need(crop.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&crop[0]<crop[2]&&crop[1]<crop[3],'裁剪需要有效的 0–1 边界，左小于右、上小于下。');ref.crop=crop;ref.coverageKind=$('coverageKind').value==='ellipse'?'ellipse':ref.originalSourceHash&&ref.label.includes('花瓶')?'inferred_mask':'source_alpha';rememberReferences();drawReference();}
    function preparedDataset() {
      need(ui.references.length>0,'请先导入至少一张参考。');
      return ui.references.map(ref=>{const [x0,y0,x1,y1]=ref.crop,sw=(x1-x0)*ref.canvas.width,sh=(y1-y0)*ref.canvas.height,scale=Math.min(1,128/Math.max(sw,sh));const width=Math.max(8,Math.round(sw*scale)),height=Math.max(8,Math.round(sh*scale)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(ref.canvas,x0*ref.canvas.width,y0*ref.canvas.height,sw,sh,0,0,width,height);const data=context.getImageData(0,0,width,height).data;if(ref.coverageKind==='ellipse')for(let y=0;y<height;y++)for(let x=0;x<width;x++){const dx=(x+.5)/width*2-1,dy=(y+.5)/height*2-1;if(dx*dx+dy*dy>1)data[(y*width+x)*4+3]=0;}
        return {id:ref.id,label:ref.label,sourceGroup:ref.sourceGroup,sourceUri:ref.sourceUri,contentHash:ref.contentHash,width,height,data,crop:ref.crop.slice(),coverageKind:ref.coverageKind,originalWidth:ref.originalWidth,originalHeight:ref.originalHeight,...(ref.originalSourceHash?{originalSourceHash:ref.originalSourceHash}:{}),licenseStatus:ref.licenseStatus,attribution:ref.attribution};});
    }
    async function searchReferences(event) {
      event.preventDefault();need(!ui.active,'请等待当前任务完成。');need(state.project.history.length<4095,'任务记录已达上限，请导出后新建工程。');const query=$('referenceQuery').value.trim();need(query,'输入关键词或 Commons 文件页。');setActive({kind:'reference'});$('referenceStatus').textContent='正在实际检索与下载公开参考…';
      try{const result=await post('/api/crf/functions11/references',/^https:\/\//i.test(query)?{sourceUrl:query,maxImages:3}:{query,maxImages:3});let count=0;for(const image of result.images||[]){if(ui.references.length>=8)break;const response=await fetch(image.url),blob=await response.blob();await addReferenceBlob(blob,{label:image.title,sourceUri:image.sourceUrl,sourceGroup:'source.'+image.sha256,licenseStatus:image.license?.name||'来源条款待核验',attribution:image.license?.artist||''});count++;}$('referenceStatus').textContent='实际取得 '+count+' 张参考；'+(result.attempts?.length||0)+' 条来源尝试。';session.append('history',{kind:'reference_collection',at:new Date().toISOString(),query,images:(result.images||[]).map(({url,...meta})=>meta),attempts:result.attempts||[],providerCalls:result.providerCalls??0});persist();if(!count)notify('没有取得可用参考，失败记录已保留。');}catch(error){$('referenceStatus').textContent='检索未完成：'+errorText(error);session.append('history',{kind:'reference_collection',at:new Date().toISOString(),query,status:'failed',error:errorText(error),result:error.result||null});persist();throw error;}finally{setActive(null);}
    }
    async function sampleWater() {need(!ui.active,'请等待当前任务完成。');const response=await fetch('assets/v08/references/landscape.alpine.png');need(response.ok,'本地湖水参考不可用。');await addReferenceBlob(await response.blob(),{label:'Lautersee 湖水反射',sourceUri:'https://commons.wikimedia.org/wiki/File:Lautersee_2026.jpg',sourceGroup:'source.1e0a844e3f99acdd3d03f67c50e457a638ed0f6a57e66783fe84f8ff9bb842f0',originalSourceHash:'1e0a844e3f99acdd3d03f67c50e457a638ed0f6a57e66783fe84f8ff9bb842f0',licenseStatus:'CC0 1.0（仓库来源记录）',attribution:'Taubenflieger68',crop:[.05,.70,.95,.98],coverageKind:'rectangle'});$('functionName').value='湖水外观函数';}

    function drawLoss(history) {const canvas=$('lossChart'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!history.length)return;const points=history.filter(p=>Number.isFinite(p.trainLoss));if(!points.length)return;const max=Math.max(...points.map(p=>p.trainLoss),1e-8),left=46,top=12,width=canvas.width-left-14,height=canvas.height-top-26;ctx.strokeStyle='#cbded7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,top+height);ctx.lineTo(left+width,top+height);ctx.stroke();ctx.font='16px system-ui';ctx.fillStyle='#71877e';ctx.fillText(max.toFixed(3),0,top+12);ctx.fillText('0',20,top+height);ctx.fillText('step '+points.at(-1).step,left+width-100,canvas.height-4);ctx.strokeStyle='#19716b';ctx.lineWidth=2.5;ctx.beginPath();points.forEach((p,i)=>{const x=left+width*(points.length===1?0:i/(points.length-1)),y=top+height*(1-p.trainLoss/max);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
    function recordTraining(record) {const existing=state.project.learningRuns.find(row=>row.id===record.id);if(!existing)session.append('learningRuns',record);else{const next={...state.project,learningRuns:state.project.learningRuns.map(row=>row.id===record.id?{...row,...clone(record)}:row)};assertValid(core.validateProject(next));state.project=next;}persist();}
    function trainingProgress(progress) {const item=ui.training;if(!item)return;item.progress.push(clone(progress));if(item.progress.length>300)item.progress.shift();$('trainingProgress').max=progress.totalSteps||item.config.steps;$('trainingProgress').value=progress.step||0;$('trainingState').textContent='正在本地优化权重';$('trainingDetail').textContent='步骤 '+progress.step+' / '+(progress.totalSteps||item.config.steps)+' · '+fmt((progress.elapsedMs||0)/1000,1)+' s';rows($('trainingMetrics'),[['训练 loss',fmt(progress.trainLoss,6)],['空间留出 loss',fmt(progress.validationLoss,6)],['最佳步骤',progress.bestStep??'—']]);drawLoss(item.progress);recordTraining({id:item.id,state:'running',stepsCompleted:progress.step,lastProgress:progress});}
    async function train(event) {
      event?.preventDefault();need(!ui.active,'请等待当前任务完成。');need(state.project.learningRuns.length<4095&&state.project.datasets.length<4095,'学习记录已达上限，请导出后新建工程。');const dataset=preparedDataset(),config={steps:Number($('trainingSteps').value),hidden:Number($('trainingHidden').value),seed:11};const label=$('functionName').value.trim()||'学习外观';const id='training.'+Date.now().toString(36),projectId=state.project.id,worker=new Worker('learn-worker11.js');ui.training={id,worker,config,label,projectId,progress:[],cancelRequested:false};setActive({kind:'training',id});$('trainingPanel').hidden=false;$('cancelTraining').disabled=false;$('trainingState').textContent='准备训练数据';$('trainingProgress').max=config.steps;$('trainingProgress').value=0;$('trainingDetail').textContent=dataset.length+' 张真实参考 · CPU / Adam';setTab('learn');
      recordTraining({id,label,state:'running',config,startedAt:new Date().toISOString(),stepsCompleted:0,preparedReferences:dataset.map(({data,...metadata})=>metadata)});
      let finalReport;
      try {
        const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.terminate();const error=new Error('训练 Worker 未在等待预算内返回。');error.report={state:'timed_out',stepsCompleted:ui.training?.progress.at(-1)?.step||0};reject(error);},70000);worker.onmessage=async event=>{const message=event.data;if(message.id!==id)return;if(message.type==='progress'){trainingProgress(message.progress);return;}clearTimeout(timer);if(message.type==='result')resolve(message.result);else{const error=new Error(message.error|| (message.type==='canceled'?'训练已取消。':'训练未完成。'));error.report=message.report||{state:message.type==='canceled'?'cancelled':'failed'};reject(error);}};worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message||'训练线程中断。'));};worker.postMessage({id,operation:'train',dataset,config});});
        finalReport={...result.report,id,label};need(!ui.training.cancelRequested,'训练已取消，结果不会自动加入函数库。');need(state.project.id===projectId,'当前工程已变化，训练结果未写入另一工程。');need((result.report.state||result.report.status)==='completed','训练未完整完成，结果未注册。');const model=result.model,first=model.instances[0];const fn=await core.createNeuralFunction(model,{id:'learned.'+id,label,width:first.width,height:first.height,coverageByInstance:result.coverageByInstance,report:finalReport,provenance:{kind:'local_reference_training',trainingRunId:id,evidenceScope:'spatial_reconstruction_holdout',independentSourceGeneralization:'not_evaluated',semanticControlsLearned:false}});
        need(!ui.training.cancelRequested,'训练已取消，结果未注册。');const current=state.project,epoch=state.epoch;let next=await core.registerFunction(current,fn);next={...next,learningRuns:next.learningRuns.map(row=>row.id===id?{...row,...finalReport,functionVersion:fn.version}:row),datasets:[...(next.datasets||[]),{id:'dataset.'+id,sha256:finalReport.datasetHash,instances:clone(model.instances),splitProtocol:finalReport.splitProtocol}]};await session.load(next,{expectedEpoch:epoch,canCommit:()=>!ui.training.cancelRequested&&state.project===current});$('trainingState').textContent='训练完成 · 已登记固定版本';$('trainingDetail').textContent='到左侧函数库点击“添加到场景”后使用。';rows($('trainingMetrics'),[['初始 loss',fmt(finalReport.initialLoss,6)],['最终 loss',fmt(finalReport.finalLoss,6)],['空间留出 loss',fmt(finalReport.validationLoss,6)],['实际参数',root.CRFLearn11.parameterCount(model)],['训练耗时',fmt(finalReport.elapsedMs/1000,1)+' s'],['版本',fn.version.slice(0,14)]]);await changed('真实权重已加入函数库。当前场景引用没有被替换。');notify('训练完成，已生成可重放的函数版本。');
      } catch(error) {finalReport={...(error.report||finalReport||{}),id,label,state:ui.training.cancelRequested?'canceled':error.report?.state||'failed',error:errorText(error),config};if(state.project.id===projectId)recordTraining(finalReport);$('trainingState').textContent=finalReport.state==='canceled'?'已取消 · 未注册函数':'训练未完成 · 未注册函数';$('trainingDetail').textContent=errorText(error);trainingRecords();persist();status(errorText(error));}
      finally {worker.terminate();$('cancelTraining').disabled=true;ui.training=null;setActive(null);}
      return finalReport;
    }
    function cancelTraining() {if(!ui.training)return;ui.training.cancelRequested=true;ui.training.worker.postMessage({id:ui.training.id,operation:'cancel'});$('cancelTraining').disabled=true;$('trainingState').textContent='正在取消本地训练';}

    async function annotate(choice) {
      need(state.frame,'请等待当前场景计算完成，再记录反馈。');const project=state.project,frame=state.frame,epoch=state.epoch,sceneSha256=await core.digest(project.scene),pixelSha256=await core.digestBytes(frame.data),frameSha256=await core.digest({descriptor:frame.descriptor||{width:frame.width,height:frame.height,backend:ui.backend,samples:ui.samples,time:ui.time},pixelSha256});need(state.epoch===epoch&&state.frame===frame,'画面已变化，请针对新帧重新记录反馈。');
      session.append('feedback',{id:'feedback.'+Date.now().toString(36),createdAt:new Date().toISOString(),kind:'explicit_user_annotation',choice,note:$('feedbackNote').value.trim(),sceneRevision:project.scene.revision,sceneSha256,functionVersions:[...new Set(project.scene.objects.map(o=>o.functionRef))].sort(),frameSha256,pixelSha256,width:frame.width,height:frame.height,time:frame.descriptor?.time??ui.time,descriptor:frame.descriptor||null});$('feedbackNote').value='';$('feedbackCount').textContent=state.project.feedback.length+' 条反馈';await persist();notify('人工反馈已绑定当前场景、函数版本与实际帧。');
    }
    async function agent(event) {
      event.preventDefault();need(!ui.active,'请等待当前任务完成。');need(state.project.history.length<4095,'任务记录已达上限，请导出后新建工程。');need(root.CRF11Harness,'Agent Harness 未加载。');const prompt=$('agentPrompt').value.trim();need(prompt,'请先描述视觉目标。');need(!$('protectOthers').checked||state.selected,'请先选择允许编辑的对象。');const project=session.snapshot(),digest=await core.digest(project),controller=new AbortController();setActive({kind:'agent',controller});$('cancelAgent').hidden=false;$('agentStatus').textContent='请求真实模型提议，并在内核中检查与计算。';$('agentLog').replaceChildren();
      try{const result=await root.CRF11Harness.propose({project,prompt,mode:$('agentMode').value,...($('protectOthers').checked?{editableObjectIds:[state.selected]}:{}),signal:controller.signal,onEvent:event=>{const p=document.createElement('p');p.className='run-card';p.textContent=typeof event==='string'?event:JSON.stringify(event);$('agentLog').append(p);}});ui.agentRuns.push(result.run);const observed=state.project,unchanged=await core.digest(observed)===digest&&state.project===observed;
        if(result.run.status==='review_required'&&unchanged&&!controller.signal.aborted){const next={...result.project,history:[...(result.project.history||[]),{kind:'agent_run',run:result.run}]};await session.load(next,{canCommit:()=>state.project===observed&&!controller.signal.aborted});await changed('模型候选已实际运行，等待您评价当前画面。',{immediate:true});$('agentStatus').textContent='候选已渲染，请检查画面并记录“采用”或“需要改进”。';}
        else {session.append('history',{kind:'agent_run',run:result.run,...(!unchanged?{adoption:'stale_project_rejected'}:{})});$('agentStatus').textContent=!unchanged?'工程在请求期间已变化；候选未覆盖新状态，运行记录已保留。':result.run.error?.message||result.run.error||'本次任务状态：'+result.run.status;persist();}
        const button=document.createElement('button');button.className='full';button.textContent='查看实际任务与用量';button.onclick=()=>report('Agent 任务记录',result.run);$('agentLog').append(button);
      }catch(error){const run={id:'ui-failure.'+Date.now(),status:controller.signal.aborted?'cancelled':'failed',error:errorText(error),providerUsage:'unknown'};ui.agentRuns.push(run);session.append('history',{kind:'agent_run',run});persist();throw error;}finally{$('cancelAgent').hidden=true;setActive(null);}
    }
    async function comparison() {
      need(!ui.active,'请等待当前任务完成。');const project=state.project,epoch=state.epoch,width=Math.min(256,project.scene.width),height=Math.max(1,Math.round(width*project.scene.height/project.scene.width)),time=ui.time;setActive({kind:'comparison'});status('用相同场景、尺寸、时间和采样比较直接与缓存求值。');
      try {const direct=await calculate(project,{width,height,time,backend:'direct'}),cached=await calculate(project,{width,height,time,backend:'cached'});ui.comparison={epoch,sceneSha256:await core.digest(project.scene),width,height,time,samples:ui.samples,metrics:core.compareFrames(direct,cached),directMs:direct.milliseconds,cachedMs:cached.milliseconds};syncEvidence();setTab('evidence');status('对照已完成。该次耗时与差分不代表通用实时性能。');}finally{setActive(null);}
    }
    async function saveProject() {await persist();downloadJSON(session.snapshot(),'CRF_1_1_'+state.project.id+'.json');status('工程已下载，包含全部固定函数、权重、覆盖、训练记录与反馈。');}
    async function loadProject(project) {need(!ui.active,'请等待或取消当前任务后再打开工程。');await session.load(project);ui.references=[];ui.selectedReference=null;ui.time=0;ui.codeDirty=false;syncReferences();await changed('工程校验通过，已恢复固定版本。',{immediate:true});return session.snapshot();}
    async function exportPNG() {const project=state.project,time=ui.time,profile={time,backend:ui.backend,samples:ui.samples};status('正在按当前求值配置生成 PNG。');const frame=await calculate(project,profile),canvas=imageCanvas(frame),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));need(blob,'PNG 编码未完成。');download(blob,'CRF_1_1_'+project.id+'.png');ui.exports.push({kind:'png',at:new Date().toISOString(),sceneSha256:await core.digest(project.scene),descriptor:frame.descriptor,profile,bytes:blob.size});persist();status('已导出由当前固定函数实际计算的 PNG。');}
    async function exportVideo() {
      if(ui.active?.kind==='video'){ui.videoCancelled=true;$('exportVideo').textContent='取消中';return;}
      need(!ui.active,'请等待当前任务完成。');need(root.CRFVideo09,'视频编码器未加载。');stopPlayback();const project=session.snapshot(),profile={backend:ui.backend,samples:ui.samples},width=project.scene.width,height=project.scene.height;ui.videoCancelled=false;setActive({kind:'video'});$('exportVideo').textContent='取消导出';
      try {const result=await root.CRFVideo09.encode({width,height,fps:24,duration:5,renderFrame:async time=>{if(ui.videoCancelled)throw new DOMException('视频导出已取消。','AbortError');const frame=await calculate(project,{...profile,width,height,time});if(ui.videoCancelled)throw new DOMException('视频导出已取消。','AbortError');return imageCanvas(frame);},onProgress:progress=>status('逐帧函数求值 / 编码 '+progress.completed+' / '+progress.total)});need(!ui.videoCancelled,'视频导出已取消。');const videoReport={...result,blob:undefined,kind:'video',scope:'fixed learned appearance with explicit 2D motion',sceneSha256:await core.digest(project.scene),functionVersions:[...new Set(project.scene.objects.map(o=>o.functionRef))].sort(),profile,at:new Date().toISOString()};for(const url of ui.videoURLs)URL.revokeObjectURL(url);ui.videoURLs=[];$('videoResult').replaceChildren();for(const [blob,name,label]of [[result.blob,'CRF_1_1_5s.webm','下载五秒 WebM'],[new Blob([JSON.stringify(videoReport,null,2)],{type:'application/json'}),'CRF_1_1_video_report.json','编码与范围记录']]){const url=URL.createObjectURL(blob),link=document.createElement('a');ui.videoURLs.push(url);link.href=url;link.download=name;link.textContent=label;$('videoResult').append(link);}$('videoResult').hidden=false;ui.exports.push(videoReport);await persist();download(result.blob,'CRF_1_1_5s.webm');status('五秒、120 帧已逐帧计算并实际编码。');return videoReport;}catch(error){ui.exports.push({kind:'video',status:ui.videoCancelled?'cancelled':'failed',error:errorText(error),profile,at:new Date().toISOString()});persist();throw error;}finally{$('exportVideo').textContent='导出 WebM';ui.videoCancelled=false;setActive(null);}
    }
    function evidence() {return{schema:'crf.studio_evidence/1.1',projectId:state.project.id,scene:state.project.scene,functionVersions:Object.keys(state.project.functions),frame:state.frame?{descriptor:state.frame.descriptor,diagnostics:state.frame.diagnostics,runtimeTrace:state.frame.runtimeTrace}:null,comparison:ui.comparison?{...ui.comparison,stale:ui.comparison.epoch!==state.epoch}:null,learningRuns:state.project.learningRuns,feedback:state.project.feedback,agentRuns:ui.agentRuns,exports:ui.exports,formalProof:'not_implemented',programRSI:'not_executed',independentSourceGeneralization:'not_evaluated',persistenceFailed:ui.persistenceFailed};}
    async function play() {if(ui.playing){stopPlayback();return;}ui.playing=true;$('play').textContent='暂停';const start=performance.now()-ui.time*1000;async function tick(){if(!ui.playing)return;ui.time=Math.min(5,(performance.now()-start)/1000);syncTime();try{await render();}catch{stopPlayback();return;}if(ui.time>=5){stopPlayback();return;}ui.playbackTimer=setTimeout(tick,20);}await tick();}

    document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>setTab(button.dataset.tab));
    $('closeDialog').onclick=()=>$('dialog').close();
    $('importReference').onclick=()=>$('referenceFiles').click();
    $('referenceFiles').onchange=guard(async()=>{for(const file of Array.from($('referenceFiles').files||[])){await addReferenceBlob(file,{label:file.name,sourceUri:'local-file:'+file.name});}$('referenceFiles').value='';});
    $('sampleWater').onclick=guard(sampleWater);$('referenceSearch').onsubmit=guard(searchReferences);
    for(const id of ['cropX0','cropY0','cropX1','cropY1','coverageKind'])$(id).onchange=guard(cropChanged);
    $('removeReference').onclick=guard(()=>{need(!ui.active,'训练或任务运行时不能修改参考集合。');ui.references=ui.references.filter(ref=>ref.id!==ui.selectedReference);ui.selectedReference=ui.references[0]?.id||null;syncReferences();});
    $('trainingForm').onsubmit=guard(train);$('cancelTraining').onclick=cancelTraining;
    $('objectForm').onsubmit=event=>event.preventDefault();for(const id of ['objectX','objectY','objectWidth','objectHeight','objectRotation','objectZ','objectOpacity','objectTint','objectVisible','objectInstance','motionX','motionY','motionRotation'])$(id).onchange=guard(updateObject);
    $('removeObject').onclick=guard(()=>applyPatch([{op:'remove',id:state.selected}],'对象已从场景移除，函数版本仍保留在库中。'));
    $('applyCanvas').onclick=guard(()=>applyPatch([{op:'scene',values:{width:Number($('sceneWidth').value),height:Number($('sceneHeight').value),background:rgb($('sceneBackground').value)}}],'画布设置已更新。'));
    $('undo').onclick=guard(async()=>{if(session.undo())await changed('已恢复前一工程快照。');});$('redo').onclick=guard(async()=>{if(session.redo())await changed('已重放下一工程快照。');});
    $('sceneCode').oninput=()=>{ui.codeDirty=true;$('codeStatus').textContent='未执行的草稿 · 基于 r'+ui.codeRevision;};$('reloadCode').onclick=reloadCode;$('runCode').onclick=guard(async()=>{session.applyCode($('sceneCode').value,ui.codeRevision,ui.codeEpoch);ui.codeDirty=false;await changed('场景程序检查通过，已执行同一内核。',{immediate:true});});
    $('renderBackend').onchange=guard(async()=>{ui.backend=$('renderBackend').value;await render();});$('renderSamples').onchange=guard(async()=>{ui.samples=Number($('renderSamples').value);await render();});
    $('timeline').oninput=()=>{stopPlayback();ui.time=Number($('timeline').value);syncTime();requestRender();};$('play').onclick=guard(play);
    $('acceptFrame').onclick=guard(()=>annotate('accept'));$('rejectFrame').onclick=guard(()=>annotate('needs_improvement'));
    $('agentForm').onsubmit=guard(agent);$('cancelAgent').onclick=()=>ui.active?.controller?.abort();$('compareBackends').onclick=guard(comparison);
    $('openProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=guard(async()=>{const file=$('projectFile').files?.[0];if(!file)return;need(file.size<=32*1024*1024,'工程超过 32 MiB 导入限制。');let project;try{project=JSON.parse(await file.text());}catch{throw new Error('工程文件不是有效 JSON。');}if(project.schema!=='crf.project.v1.1')throw new Error('这是其他版本的工程，请在对应历史工作空间打开。1.1 需要 crf.project.v1.1。');await loadProject(project);$('projectFile').value='';});
    $('newScene').onclick=guard(async()=>{await loadProject(await core.createDemoProject());status('已打开人工编写的显式山湖场景。');});
    $('saveProject').onclick=guard(saveProject);$('exportPNG').onclick=guard(exportPNG);$('exportVideo').onclick=guard(exportVideo);
    $('exportEvidence').onclick=()=>downloadJSON(evidence(),'CRF_1_1_evidence.json');$('showDependencies').onclick=()=>report('固定函数版本与运行依赖',{project:state.project.id,functions:Object.values(state.project.functions).map(fn=>({...core.functionSummary(fn),provenance:fn.provenance})),runtime:['crf-core11.js','learn11.js'],sourceImagesRequiredAtRender:false});

    root.CRFStudio11={...root.CRFStudio11,getProject:()=>session.snapshot(),loadProject,applyPatch:operations=>applyPatch(operations),render,train:()=>train(),cancelTraining,addReferenceBlob,exportVideo,
      getState:()=>({project:session.snapshot(),selected:state.selected,time:ui.time,frameCurrent:!!state.frame,active:ui.active?.kind||null,referenceCount:ui.references.length,training:ui.training?{id:ui.training.id,progress:clone(ui.training.progress)}:null}),getEvidence:evidence};
    let stored;
    try {stored=await savedWorkspace();}catch(error){ui.persistenceFailed=true;$('persistenceStatus').textContent='本机存储不可用，请下载工程';}
    if(stored?.project){try{await session.load(stored.project,{remember:false});ui.agentRuns=stored.agentRuns||[];ui.exports=stored.exports||[];for(const run of state.project.learningRuns.filter(row=>row.state==='running'))recordTraining({id:run.id,state:'interrupted',interruption:'Browser page closed or reloaded; local training did not continue in the background.'});status('已恢复本机工程与固定函数版本。');}catch(error){notify('保存的工程未通过校验：'+errorText(error));}}
    if(!state.project){await session.load(await core.createDemoProject(),{remember:false});status('显式山湖场景已就绪；可从左侧湖水样本开始学习。');}
    sync();syncReferences();await render();persist();
    try {const response=await fetch('/api/crf/functions11/status'),data=await response.json();ui.configured=response.ok&&data.configured===true;$('connection').textContent=ui.configured?'模型已配置':'本地计算就绪';$('connection').classList.toggle('ready',ui.configured);$('agentStatus').textContent=ui.configured?'已配置供应商；点击运行后才会发起真实请求。':'尚未配置模型凭证。本地训练、代码编辑与导出可以使用。';}catch{$('connection').textContent='本地计算就绪';$('agentStatus').textContent='模型服务不可用。本地训练、代码编辑与导出可以使用。';}
    setActive(null);
    return root.CRFStudio11;
  }
  return {createSession,errorText,boot};
});
