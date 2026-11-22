(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const types = { window:'窗户',pole:'立杆',signal:'行人灯',tree:'树木',ridge:'山脊',apple:'苹果',pear:'梨',orange:'橙子',vase:'花瓶',rock:'岩石' };
  const hex = values => '#' + values.map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('');
  const rgb = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  const state = {
    kind:'street', scene:null, street:CRFBoundary09.createState(), model:null,
    selected:null, entry:'street', title:'午后红绿灯', cases:[], legacy:[],
    history:[], future:[], latest:null, display:'render', view:'front', time:0,
    filter:'mip', playing:false, reference:null, referenceUrl:null, referenceFor:'',
    job:null, verification:null, record:null, activeCase:null, currentProjectId:null
  };
  let worker = null, workerSequence = 0, drawSequence = 0, renderTimer, playTimer, toastTimer;
  let assetSequence = 0, sentAssetKey = null, runner = null, store = null;
  const assetKeys = new WeakMap(), pending = new Map(), assetDownloads = new Map();
  let videoObjectURLs = [];
  const errorText = error => String(error?.message || error).replace(/sk-[A-Za-z0-9_-]{12,}/g, '[凭据已隐藏]').slice(0, 850);
  function notify(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
  function status(text) { $('status').textContent = text; }
  function busy(value, text) { $('busy').hidden = !value; if (text) $('busyText').textContent = text; }
  function modal(title, value) {
    $('dialogTitle').textContent = title; $('dialogBody').replaceChildren();
    const element = document.createElement(typeof value === 'string' ? 'p' : 'pre');
    element.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    $('dialogBody').append(element); $('dialog').showModal();
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name.replace(/[\\/:*?"<>|]/g, '_'); document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const downloadJSON = (value, name) => download(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'}), name);
  async function readJSON(url) {
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) throw new Error('资源载入失败：' + url + '（' + response.status + '）');
    return response.json();
  }
  function resourceURL(url, sourceURL) {
    if (typeof url !== 'string' || !url) throw new Error('函数资产缺少可读取的地址。');
    return new URL(url, /^(assets\/|\/)/.test(url) ? location.href : sourceURL ? new URL(sourceURL,location.href) : location.href).href;
  }
  function gaussianAsset(asset) {
    return asset?.schema==='crf.gaussian_asset.v0.8'?CRFGaussian10.importLegacyAsset(asset):asset;
  }
  async function hydrateScene(raw, sourceURL) {
    if (!raw || raw.schema !== 'crf.gaussian_scene.v0.10') return raw;
    const assets = {...(raw.assets || {})}, references = {...(raw.assetUrls || {})};
    for (const [id,value] of Object.entries(assets)) if (typeof value === 'string' || value?.url) { references[id] = typeof value === 'string' ? value : value.url; delete assets[id]; }
    await Promise.all(Object.entries(references).map(async ([id,url]) => {
      if (assets[id]?.schema === 'crf.gaussian_asset.v0.10') return;
      const resolved = resourceURL(url, sourceURL);
      if (!assetDownloads.has(resolved)) assetDownloads.set(resolved,readJSON(resolved).then(gaussianAsset).catch(error => {assetDownloads.delete(resolved);throw error;}));
      assets[id] = await assetDownloads.get(resolved);
    }));
    for (const id of Object.keys(assets)) assets[id]=gaussianAsset(assets[id]);
    const scene = {...raw,assets}; delete scene.assetUrls;
    const valid = window.CRFGaussian10?.validateScene(scene); if (valid && !valid.ok) throw new Error(valid.errors.join(' '));
    return scene;
  }
  async function api(url, body, {signal} = {}) {
    const response = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    let data; try { data = await response.json(); } catch { throw new Error('服务没有返回有效的任务结果。'); }
    if (!response.ok || data.ok === false) { const error = new Error(data.error?.message || '服务请求未完成。'); error.code = data.error?.code || 'API_FAILED'; error.result = data; throw error; }
    return data;
  }
  function cloneScene(scene) {
    if (!scene) return null;
    if (scene.assets) { const {assets, ...rest} = scene; return {...clone(rest), assets}; }
    return clone(scene);
  }
  function snapshot() {
    return {kind:state.kind,scene:cloneScene(state.scene),street:clone(state.street),model:state.model,
      selected:state.selected,entry:state.entry,title:state.title,view:state.view,time:state.time,filter:state.filter,
      activeCase:state.activeCase,record:state.record,reference:state.reference,referenceUrl:state.referenceUrl,currentProjectId:state.currentProjectId};
  }
  function historyButtons() { $('undoButton').disabled = !state.history.length; $('redoButton').disabled = !state.future.length; }
  function checkpoint() { state.history.push(snapshot()); if (state.history.length > 30) state.history.shift(); state.future = []; historyButtons(); }
  async function restore(value) { Object.assign(state, value); state.verification = null; syncControls(); await render(); historyButtons(); }
  function setTab(name) {
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === name)));
    for (const tab of ['edit','assistant','verify']) $(tab + 'Panel').hidden = tab !== name;
  }
  function pixelsCanvas(result, canvas = document.createElement('canvas')) {
    canvas.width = result.width; canvas.height = result.height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height), 0, 0);
    return canvas;
  }
  function workerRequest(message, onProgress) {
    if (!worker) {
      worker = new Worker('render-worker10.js'); sentAssetKey = null;
      worker.onmessage = event => {
        const item = pending.get(event.data.id); if (!item) return;
        if (event.data.event === 'progress') { item.onProgress?.(event.data.progress); return; }
        pending.delete(event.data.id); clearTimeout(item.timer);
        event.data.ok ? item.resolve(event.data) : item.reject(new Error(event.data.error || '求值失败'));
      };
      worker.onerror = event => {
        for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(event.message || '计算线程未完成')); }
        pending.clear(); worker.terminate(); worker = null; sentAssetKey = null;
      };
    }
    const id = ++workerSequence, outgoing = {...message,id};
    if (outgoing.kind === 'gaussian' && outgoing.scene?.assets) {
      const {assets, ...scene} = outgoing.scene;
      let key = assetKeys.get(assets); if (!key) { key = 'assets-' + (++assetSequence); assetKeys.set(assets, key); }
      outgoing.scene = scene; outgoing.assetKey = key;
      if (sentAssetKey !== key) { outgoing.assets = assets; sentAssetKey = key; }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('计算超出当前等待预算，工程仍然保留。')); }, message.operation === 'fit' ? 600000 : 180000);
      pending.set(id, {resolve,reject,timer,onProgress}); worker.postMessage(outgoing);
    });
  }
  function motion(time = state.time, view = state.view) {
    const u = Math.max(0,Math.min(1,time / 5)), s = u*u*(3-2*u);
    return {panX:(view === 'left' ? -.035 : view === 'right' ? .035 : 0) + .035*s,panY:-.006*s,zoom:1+.06*s,rotation:0};
  }
  function imagePlaneView(result, time, view, width, height) {
    const transform = motion(time, view), source = pixelsCanvas(result), canvas = document.createElement('canvas');
    canvas.width = width || result.width; canvas.height = height || result.height;
    const zoom = Math.max(transform.zoom, 1 / (1 - 2*Math.abs(transform.panX))), sw = source.width/zoom, sh = source.height/zoom;
    const sx = (source.width-sw)/2+transform.panX*source.width, sy=(source.height-sh)/2+transform.panY*source.height;
    canvas.getContext('2d').drawImage(source,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    return {...result,width:canvas.width,height:canvas.height,data:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,
      diagnostics:{...result.diagnostics,viewMode:'image_plane_view_of_rendered_gaussians',realWorldReconstructionClaim:false}};
  }
  async function calculate({full = false, kind = state.kind, scene = state.scene, street = state.street, model = state.model, time = state.time, view = state.view, width, height, filter = state.filter, coverage = false} = {}) {
    const sourceWidth = kind === 'street' ? 667 : scene?.width || 1024, sourceHeight = kind === 'street' ? 1000 : scene?.height || 768;
    const w = width || (full ? sourceWidth : Math.min(1024,sourceWidth)), h = height || Math.round(w*sourceHeight/sourceWidth);
    const camera = motion(time, view), base = scene?.camera || {};
    let result = await workerRequest({kind,scene,street,options:{width:w,height:h,model,time:time/5,filter,coverage,
      transform:camera,camera:{panX:Math.max(-.12,Math.min(.12,(base.panX||0)+camera.panX)),panY:Math.max(-.12,Math.min(.12,(base.panY||0)+camera.panY)),zoom:Math.max(.8,Math.min(1.3,(base.zoom||1)*camera.zoom))}}});
    if (kind === 'street' && (time || view !== 'front' || w !== result.width || h !== result.height)) result = imagePlaneView(result,time,view,w,h);
    return result;
  }
  function displayCurrent() {
    if (!state.latest) return;
    const image = state.latest;
    if (state.display === 'render' || !state.reference) { pixelsCanvas(image, $('canvas')); return; }
    const reference = document.createElement('canvas'); reference.width=image.width; reference.height=image.height;
    reference.getContext('2d').drawImage(state.reference,0,0,image.width,image.height);
    if (state.display === 'reference') { pixelsCanvas({width:image.width,height:image.height,data:reference.getContext('2d').getImageData(0,0,image.width,image.height).data},$('canvas')); return; }
    const ref = reference.getContext('2d').getImageData(0,0,image.width,image.height).data, diff=new Uint8ClampedArray(image.data.length);
    for (let i=0;i<diff.length;i+=4) { diff[i]=Math.min(255,Math.abs(image.data[i]-ref[i])*6); diff[i+1]=Math.min(255,Math.abs(image.data[i+1]-ref[i+1])*6); diff[i+2]=Math.min(255,Math.abs(image.data[i+2]-ref[i+2])*6); diff[i+3]=255; }
    pixelsCanvas({...image,data:diff},$('canvas'));
  }
  async function render({showBusy=true,full=false} = {}) {
    const request = ++drawSequence; if (showBusy) busy(true,'正在计算当前视觉函数');
    try {
      const result = await calculate({full}); if (request !== drawSequence) return result;
      state.latest = result; displayCurrent(); $('exportPNG').disabled=false;
      $('dimensions').textContent=result.width+' × '+result.height; $('renderTime').textContent=Math.round(result.milliseconds||result.diagnostics?.elapsedMs||0)+' ms';
      updateRenderEvidence(); status('已由当前函数重新计算。修改和导出使用相同表示。');
      return result;
    } catch (error) { if (request === drawSequence) { status(errorText(error)); notify(errorText(error)); } throw error; }
    finally { if (request === drawSequence) busy(false); }
  }
  function showComputedOutput(output) {
    state.latest={...output,diagnostics:output.diagnostics||output.report||{}};displayCurrent();$('exportPNG').disabled=false;
    $('dimensions').textContent=output.width+' × '+output.height;$('renderTime').textContent=Math.round(output.milliseconds||state.latest.diagnostics.elapsedMs||0)+' ms';updateRenderEvidence();
  }
  function requestRender() { clearTimeout(renderTimer); renderTimer=setTimeout(()=>render({showBusy:false}).catch(()=>{}),120); }
  function stopPlayback() { state.playing=false; clearTimeout(playTimer); $('playButton').textContent='播放'; }
  function invalidate() { state.verification=null; state.display='render'; syncDisplayButtons(); updateChecks(); }
  function verificationScene() { return state.scene||{schema:'crf.street_edit.v0.9',width:667,height:1000,state:state.street}; }
  async function adoptVerification(verification,output=state.latest) {
    state.verification=null;
    if(verification&&window.CRF10Verifier&&output?.data){
      const [frameHash,sceneHash]=await Promise.all([CRF10Verifier.digest(output.data),CRF10Verifier.digest(CRF10Verifier.canonical(verificationScene()))]);
      if(verification.imageSha256===frameHash&&verification.sceneSha256===sceneHash)state.verification=verification;
    }
    updateChecks();
  }
  function syncDisplayButtons() {
    document.querySelectorAll('[data-display]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.display===state.display));button.disabled=button.dataset.display!=='render'&&!state.reference;});
    $('stageLabel').textContent=state.display==='reference'?'参考照片 · 仅用于比较':state.display==='difference'?'预览绝对差值 × 6 · 编辑变化也会计入':state.kind==='gaussian'?'高斯参数求值 · 参考驱动的可编辑画面':state.kind==='street'?'原街景 · 高斯观测与背景函数':'原生场景函数 · 质量待独立验证';
  }
  async function loadReference(url) {
    state.reference=null; state.referenceUrl=url||null; const expected=state.entry;
    if (url) { try { const response=await fetch(url); if(!response.ok)throw new Error('参考图不可用'); const bitmap=await createImageBitmap(await response.blob()); if(state.entry!==expected){bitmap.close();return;}const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();state.reference=canvas; } catch(error) { if(state.entry===expected)status('当前函数可用，参考对照图未载入。'); } }
    if(state.entry===expected){syncDisplayButtons();displayCurrent();}
  }
  function wrapAsset(asset) {
    const id=asset.id||'photo';
    return {schema:'crf.gaussian_scene.v0.10',id:'scene.'+id,title:asset.title||'高斯照片',width:asset.width,height:asset.height,background:[240,243,245],assets:{[id]:asset},objects:[{id:'image',label:'照片图层',assetId:id,x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:1,visible:true,zIndex:0,exposure:0,albedoTint:[1,1,1],illuminationGradient:[0,0]}],provenance:{kind:'reference_gaussian',singleImageLayer:true,modelTraining:false,source:asset.provenance||null}};
  }
  async function loadScene(scene, {entry='session',title,record=null,item=null,pushHistory=true,referenceUrl=null,kind} = {}) {
    scene=await hydrateScene(scene,item?.sceneUrl);stopPlayback(); if(pushHistory)checkpoint();
    if(kind==='gaussian')scene=gaussianAsset(scene);
    if(scene?.schema==='crf.gaussian_asset.v0.10')scene=wrapAsset(scene);
    const isGaussian=scene?.schema==='crf.gaussian_scene.v0.10';
    if(isGaussian){state.scene=cloneScene(scene);state.kind='gaussian';state.selected=scene.objects?.[0]?.id||'__all__';}
    else if(kind==='observation'||scene?.schema==='crf.gaussian_asset.v0.8'){state.scene=clone(scene);state.kind='observation';state.selected=null;}
    else {const valid=CRF09.validateScene(scene);if(!valid.ok)throw new Error(valid.errors.join(' '));state.scene=CRF09.normalizeScene(scene);state.kind='native';state.model=Object.hasOwn(scene,'appearanceModel')?scene.appearanceModel:state.model;state.selected=scene.objects.find(o=>o.visible!==false)?.id||null;}
    state.entry=entry;state.title=title||scene.title||'可编辑场景';state.view='front';state.time=0;state.record=record;state.activeCase=item;state.reference=null;state.referenceUrl=referenceUrl;state.verification=null;state.display='render';state.currentProjectId=null;state.job=null;
    syncControls(); await render(); if(referenceUrl)await loadReference(referenceUrl); await showPublishedCandidates(record).catch(()=>{});
  }
  async function loadStreet({pushHistory=true}={}) {
    stopPlayback();if(pushHistory)checkpoint();state.kind='street';state.scene=null;state.street=CRFBoundary09.createState();state.entry='street';state.title='午后红绿灯 · 原始街景';state.view='front';state.time=0;state.selected=null;state.record=null;state.activeCase={id:'street',title:state.title,sourceLabel:'用户提供的原始照片',referenceUrl:'assets/reference.png'};state.reference=null;state.display='render';state.verification=null;state.currentProjectId=null;state.job=null;
    syncControls();await render();await loadReference('assets/reference.png');$('candidateSection').hidden=true;
  }
  function caseButton(container,item,action) {
    const button=document.createElement('button');button.className='case-card';button.dataset.id=item.id;
    const source=item.thumbnailUrl||item.imageUrl;if(source){const image=document.createElement('img');image.src=source;image.alt='';image.loading='lazy';button.append(image);}else{const swatch=document.createElement('span');swatch.className='case-swatch';button.append(swatch);}
    const text=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=item.title||item.id;small.textContent=item.subtitle||item.scopeLabel||'';text.append(strong,small);button.append(text);button.onclick=()=>Promise.resolve(action()).catch(error=>notify(errorText(error)));container.append(button);
  }
  async function openCase(item) {
    if(item.kind==='legacy'&&(item.id==='street'||item.legacyKind==='street'))return loadStreet();
    busy(true,'读取保存的函数与参数');
    try {
      const file=item.sceneUrl||item.assetUrl||item.projectUrl;if(!file)throw new Error('此任务没有可执行的场景文件。');
      const scene=await hydrateScene(await readJSON(file),file);let record=item.record||null;if(item.reportUrl){try{record=await readJSON(item.reportUrl);}catch{record={reportUrl:item.reportUrl,status:'record_unavailable'};}}
      await loadScene(scene,{entry:item.id,title:item.title,record,item,referenceUrl:item.referenceUrl||item.originalUrl||null,kind:item.kind});
    } finally {busy(false);}
  }
  function addLink(container,label,url,downloadFile=false) { if(!url)return;const link=document.createElement('a');link.textContent=label;link.href=url;if(downloadFile)link.download='';else{link.target='_blank';link.rel='noopener';}container.append(link); }
  function updateArtifacts() {
    const item=state.activeCase;$('artifactLinks').replaceChildren();$('provenanceLinks').replaceChildren();
    if(item){addLink($('artifactLinks'),'原始输出 PNG',item.imageUrl,true);addLink($('artifactLinks'),'场景文件',item.sceneUrl||item.assetUrl,true);addLink($('artifactLinks'),'实验与调用记录',item.reportUrl,true);addLink($('artifactLinks'),'对照结果',item.comparisonUrl,true);addLink($('artifactLinks'),'运镜视频',item.videoUrl,true);addLink($('provenanceLinks'),'原始来源',item.sourceUrl);}
    $('artifactSection').hidden=!$('artifactLinks').children.length;
    $('artifactNote').textContent='这里是案例原始文件。场景文件可能引用独立资产；“保存工程”会把当前全部参数打包进同一个 JSON。';
    $('provenanceSummary').textContent=item?.sourceLabel||item?.provenanceSummary||(state.kind==='gaussian'?'由参考图像数值拟合的高斯函数。当前结果包含参考来源信息；没有训练模型权重。':state.kind==='street'?'原始用户照片的观测高斯。隐藏墙面补齐属于推断。':'解析场景函数与冻结的外观统计。当前操作不会训练或更新模型。');
  }
  function syncControls() {
    $('sceneTitle').textContent=state.title;$('sceneKind').textContent=state.kind==='gaussian'?'参考驱动 · 二维高斯':state.kind==='street'?'原始观测 · 街景编辑':'语义场景 · 程序求像素';
    $('representation').textContent=state.kind==='gaussian'?'各向异性二维高斯':state.kind==='street'?'高斯观测＋编辑':'解析函数与高斯场';
    $('sourceType').textContent=state.kind==='gaussian'?'参考图参数拟合':state.kind==='street'?'用户原始照片':'语义程序／冻结外观';
    $('editDescription').textContent=state.kind==='gaussian'?(state.scene.objects?.length>1?'选取高斯图层，修改颜色、位置和照明参数。':'当前为整图高斯图层，可调整色彩与低频照明。'):state.kind==='street'?'原始案例持续保留，支持墙面换色与灯体修改。':'对象与共同光照通过场景函数重新求值。';
    $('streetControls').hidden=state.kind!=='street';$('nativeControls').hidden=state.kind!=='native';$('gaussianControls').hidden=state.kind!=='gaussian';
    $('viewScope').textContent=state.kind==='native'?'有限分层视差，未验证真实三维':'二维画面查看，非真实新视角';
    $('filterMode').disabled=state.kind!=='gaussian';$('filterMode').value=state.filter;
    $('taskScope').textContent=state.kind==='gaussian'?'使用当前高斯资产库生成或修改构图。所有候选由 CRF 求值并检查，不训练模型。':state.kind==='street'?'原街景请使用编辑面板。生成新场景使用已实现的解析函数；每个候选均检查。':'使用已实现的语义函数生成和修改，外观模型冻结。每个候选均检查。';
    $('timeline').value=state.time;$('timeLabel').textContent=state.time.toFixed(2)+' / 5 s';
    document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===state.view)));
    document.querySelectorAll('.case-card').forEach(button=>button.classList.toggle('selected',button.dataset.id===state.entry));
    if(state.kind==='street'){$('wallColor').value=hex(state.street.wallColor||[72,142,181]);$('wallStrength').value=state.street.wallColor?state.street.wallStrength:0;$('wallStrengthValue').textContent=Math.round(Number($('wallStrength').value)*100)+'%';$('signalVisible').checked=state.street.signalVisible;$('signalX').value=state.street.signalOffsetX;$('signalXValue').textContent=state.street.signalOffsetX+' px';}
    if(state.kind==='native')syncNative();if(state.kind==='gaussian')syncGaussian();syncDisplayButtons();historyButtons();updateArtifacts();updateChecks();
  }
  function objectButton(container,id,title,subtitle,action) {const button=document.createElement('button');button.className='object-row'+(id===state.selected?' selected':'');const text=document.createElement('span'),small=document.createElement('small');text.textContent=title;small.textContent=subtitle||'';button.append(text,small);button.onclick=action;container.append(button);}
  function syncNative() {
    const scene=state.scene;$('nativeObjectList').replaceChildren();for(const object of scene.objects)objectButton($('nativeObjectList'),object.id,object.label||types[object.type]||object.id,object.visible===false?'已隐藏':object.attachment?'已连接':'',()=>{state.selected=object.id;syncNative();});
    const object=scene.objects.find(o=>o.id===state.selected);$('nativeObjectForm').hidden=!object;
    if(object){$('nativeObjectTitle').textContent=object.label||types[object.type]||object.id;$('nativeVisible').checked=object.visible!==false;$('nativeColor').value=hex(object.color||[140,150,130]);$('nativeType').value=object.type;for(const[key,id]of[['x','nativeX'],['y','nativeY'],['width','nativeWidth'],['height','nativeHeight']])$(id).value=object[key];$('nativeRoughness').value=object.roughness??.6;$('nativeRoughnessValue').textContent=Number(object.roughness??.6).toFixed(2);}
    $('nativeBackground').value=hex(scene.category==='landscape'?scene.environment.skyColor:scene.environment.wallColor);$('nativeAzimuth').value=scene.light.azimuth;$('nativeAzimuthValue').textContent=scene.light.azimuth+'°';$('nativeIntensity').value=scene.light.intensity;$('nativeIntensityValue').textContent=scene.light.intensity.toFixed(2);
  }
  function syncGaussian() {
    const objects=state.scene.objects||[];$('gaussianObjectList').replaceChildren();
    for(const id of ['gaussianAsset','addGaussianAsset']) { const selected=$(id).value;$(id).replaceChildren();for(const[assetId,asset]of Object.entries(state.scene.assets||{})){const option=document.createElement('option');option.value=assetId;option.textContent=asset.label||asset.title||assetId;$(id).append(option);}if([...$(id).options].some(option=>option.value===selected))$(id).value=selected; }
    $('gaussianBackground').value=hex(state.scene.background||[240,243,245]);
    objectButton($('gaussianObjectList'),'__all__','所有高斯图层',objects.length+' 层',()=>{state.selected='__all__';syncGaussian();});
    for(const object of objects)objectButton($('gaussianObjectList'),object.id,object.label||object.id,object.visible===false?'已隐藏':'可编辑',()=>{state.selected=object.id;syncGaussian();});
    const object=objects.find(o=>o.id===state.selected),values=object||objects[0]||{};
    $('gaussianObjectTitle').textContent=object?(object.label||object.id):'所有高斯图层';$('gaussianVisibleLabel').hidden=!object;$('gaussianVisible').checked=values.visible!==false;
    $('gaussianTint').value=hex((values.albedoTint||[1,1,1]).map(v=>v*255));$('gaussianHighlights').checked=values.preserveHighlights===true;$('gaussianExposure').value=values.exposure||0;$('gaussianExposureValue').textContent=Number(values.exposure||0).toFixed(2)+' EV';
    const gradient=values.illuminationGradient||[0,0];$('gaussianGradientX').value=gradient[0];$('gaussianGradientY').value=gradient[1];$('gaussianGradientXValue').textContent=Number(gradient[0]).toFixed(2);$('gaussianGradientYValue').textContent=Number(gradient[1]).toFixed(2);
    $('gaussianPlacement').hidden=!object;$('gaussianShadowField').hidden=!object||!state.scene.assets[object.assetId]?.alpha;if(object){$('gaussianAsset').value=object.assetId;$('gaussianX').value=object.x||0;$('gaussianY').value=object.y||0;$('gaussianScale').value=object.scaleX??1;$('gaussianRotation').value=object.rotation||0;$('gaussianShadow').value=object.shadow?.strength||0;$('gaussianShadowValue').textContent=Number(object.shadow?.strength||0).toFixed(2);}
  }
  function addGaussianObject() {
    if(state.kind!=='gaussian')return;const assetId=$('addGaussianAsset').value,asset=state.scene.assets[assetId];if(!asset)return;
    const scale=Math.min(state.scene.width*.4/asset.width,state.scene.height*.5/asset.height),id='layer.'+Date.now();checkpoint();
    try{state.scene=CRFGaussian10.applyOps(state.scene,[{op:'add',object:{id,label:asset.label||asset.title||assetId,assetId,x:(state.scene.width-asset.width*scale)/2,y:state.scene.height*.8-asset.height*scale,scaleX:scale,scaleY:scale,visible:true,opacity:1,zIndex:Math.max(0,...state.scene.objects.map(o=>o.zIndex||0))+1}}]);state.selected=id;invalidate();syncControls();requestRender();}
    catch(error){state.history.pop();historyButtons();notify(errorText(error));}
  }
  function nativeEdit(ops) {if(state.kind!=='native')return;checkpoint();try{state.scene=CRF09.applyOps(state.scene,ops);invalidate();syncControls();requestRender();}catch(error){state.history.pop();historyButtons();notify(errorText(error));}}
  function nativeObjectEdit(values) {if(state.selected)nativeEdit([{op:'set',id:state.selected,values}]);}
  function gaussianEdit(patch) {if(state.kind!=='gaussian')return;checkpoint();try{state.scene=CRFGaussian10.applyOps(state.scene,state.scene.objects.filter(object=>state.selected==='__all__'||object.id===state.selected).map(object=>({op:'set',id:object.id,values:patch})));invalidate();syncControls();requestRender();}catch(error){state.history.pop();historyButtons();notify(errorText(error));}}
  function streetEdit(patch) {checkpoint();try{state.street=CRFBoundary09.applyEdit(state.street,patch);invalidate();syncControls();requestRender();}catch(error){state.history.pop();historyButtons();notify(errorText(error));}}
  function message(text,type='assistant') {const element=document.createElement('div');element.className='message '+type;const heading=document.createElement('strong'),paragraph=document.createElement('p');heading.textContent=type==='user'?'你的目标':type==='error'?'任务状态':'CRF · DeepSeek';paragraph.textContent=text;element.append(heading,paragraph);$('messages').append(element);}
  const eventLabels={task_started:'开始任务',plan_ready:'目标与计划已记录',api_started:'正在调用模型',api_completed:'模型响应已记录',api_failed:'模型调用未完成',candidate_compiled:'候选函数已编译',candidate_rendered:'实际画面已计算',candidate_verified:'程序与像素检查完成',candidate_critiqued:'看图检查完成',candidate_evaluated:'候选检查完成',candidate_selected:'已更新最佳候选',task_ready:'候选与未完成项已保存',task_stopped:'任务停止，结果保留',capability_gap:'发现当前能力缺口',plateau_detected:'连续修订未见足够改善'};
  function eventText(event) {return(eventLabels[event.type]||event.type)+(event.index!==undefined?' · 候选 '+(event.index+1):'');}
  function assetsSummary(scene=state.scene) {
    return Object.entries(scene?.assets||{}).map(([id,asset])=>({id,label:asset.title||asset.label||id,width:asset.width,height:asset.height,role:asset.role||asset.provenance?.role||(asset.alpha?'object':'reference-frame'),visibleBounds:asset.visibleBounds||asset.imageSpaceSupportHint?.visibleBounds||[0,0,asset.width,asset.height],contactPoint:asset.contactPoint||asset.imageSpaceSupportHint?.lowerSilhouettePoint||null,sourceKind:asset.provenance?.kind||'observed_photo_gaussian',limitations:asset.limitations||(asset.alpha?'Observed image-plane appearance. Lower silhouette is a placement hint; physical ground contact, hidden geometry and new illumination are unverified.':'Full reference frame: only supported composition and light/color variants, not new underlying content or physical novel views.')}));
  }
  function createRunner(memoryOnly=false) {
    if(!window.CRF10Tasks?.create)return;
    try{store=memoryOnly?CRF10Tasks.createMemoryStore():CRF10Tasks.createIndexedDBStore();}catch{store=CRF10Tasks.createMemoryStore();}
    runner=CRF10Tasks.create({...(store?{store}:{}),api,renderer:representation=>representation==='reference_gaussian'?CRFGaussian10:CRF09,getModel:()=>state.model,getAssets:()=>state.scene?.assets||{},
      render:async(scene,model,{representation}={})=>{const kind=representation==='reference_gaussian'||scene.schema==='crf.gaussian_scene.v0.10'?'gaussian':'native';const result=await calculate({full:true,kind,scene,model,time:0,view:'front',coverage:true,filter:'mip'});const full=pixelsCanvas(result),preview=document.createElement('canvas'),scale=Math.min(1,960/Math.max(result.width,result.height));preview.width=Math.round(result.width*scale);preview.height=Math.round(result.height*scale);preview.getContext('2d').drawImage(full,0,0,preview.width,preview.height);return{width:result.width,height:result.height,data:result.data,image:preview.toDataURL('image/jpeg',.9),png:full.toDataURL('image/png'),report:result.diagnostics,diagnostics:result.diagnostics,objectCoverage:result.objectCoverage};},
      onEvent:(event,task)=>{state.job=task;$('jobPanel').hidden=false;$('jobTitle').textContent=eventText(event);const line=document.createElement('div');line.textContent=new Date().toLocaleTimeString('zh-CN',{hour12:false})+' '+eventText(event);$('jobLog').append(line);$('jobLog').scrollTop=$('jobLog').scrollHeight;status(eventText(event));updateJobControls();},
      onCandidate:async(candidate,output,task)=>{if(task.selectedCandidate!==null&&task.selectedCandidate!==undefined&&task.selectedCandidate!==candidate.index)return;state.kind=candidate.scene.schema==='crf.gaussian_scene.v0.10'?'gaussian':'native';state.scene=cloneScene(candidate.scene);if(state.kind==='native'&&task.modelSnapshot!==undefined)state.model=task.modelSnapshot;state.selected=state.scene.objects?.[0]?.id||null;state.entry='session';state.title=state.scene.title||'生成候选 '+(candidate.index+1);state.view='front';state.time=0;state.filter='mip';state.display='render';state.activeCase=null;state.currentProjectId=null;state.verification=null;if(task.mode==='generate'){state.reference=null;state.referenceUrl=null;}syncControls();showComputedOutput(output);await adoptVerification(candidate.verification,output);}
    });
    window.CRFEditor10.runner=runner;
  }
  async function runTask() {
    if(!runner){notify('任务循环尚未载入，当前工程仍可手动编辑。');return;}if(runner.isRunning())return;
    const prompt=$('promptInput').value.trim();if(!prompt){notify('先描述目标或要修改的内容。');return;}
    const mode=$('taskMode').value,representation=state.kind==='gaussian'?'reference_gaussian':'native_procedural';
    if(mode!=='generate'&&!['native','gaussian'].includes(state.kind)){notify('原街景请使用编辑面板；可在生成案例中使用自然语言修改。');return;}
    checkpoint();message(prompt,'user');$('sendButton').disabled=true;$('jobLog').replaceChildren();
    try{
      if(mode==='critique'){
        const result=await calculate({full:true}),canvas=pixelsCanvas(result),current={...state.scene};delete current.assets;delete current.assetUrls;delete current.appearanceModel;
        const response=await api('/api/crf/native10/generate',{mode,representation,prompt,currentScene:current,assetSummary:assetsSummary(),image:canvas.toDataURL('image/jpeg',.9),seed:state.scene.seed||42,reasoningEffort:$('reasoningEffort').value});
        state.record=response;message(response.message||'画面检查已返回。');if(response.issues?.length)message(response.issues.map(issue=>issue.description).join('\n'));
        if(window.CRF10Verifier){const critique={...response,imageEvidence:true,sourceFrameSha256:await CRF10Verifier.digest(result.data)};state.verification=await CRF10Verifier.verify({scene:state.scene,output:result,critique,contract:CRF10Verifier.createContract({representation,width:result.width,height:result.height}),validateScene:state.kind==='gaussian'?CRFGaussian10.validateScene:CRF09.validateScene});updateChecks();}return;
      }
      const count=Number($('candidateBudget').value),input={prompt,mode,representation,seed:state.scene?.seed||42,reasoningEffort:$('reasoningEffort').value,budget:{maxCandidates:count,maxQualityFeedback:count-1},assetSummary:assetsSummary(),assets:state.scene?.assets||{},...(state.kind==='gaussian'||mode==='edit'?{currentScene:cloneScene(state.scene)}:{})};
      const task=await runner.start(input);state.job=task;const candidate=task.candidates?.[task.selectedCandidate];
      if(candidate?.scene){state.scene=cloneScene(candidate.scene);state.kind=candidate.scene.schema==='crf.gaussian_scene.v0.10'?'gaussian':'native';state.selected=state.scene.objects?.[0]?.id||null;state.title=state.scene.title||'已保存的候选';state.entry='session';state.activeCase=null;state.currentProjectId=null;state.view='front';state.time=0;state.filter='mip';state.verification=null;syncControls();const output=await render({full:true});await adoptVerification(candidate.verification,output);}
      await showTaskCandidates(task);
      const note=task.stopReason||task.error?.message||'任务已保存。视觉真实感仍需独立审阅。';message('完成 '+(task.candidates?.length||0)+' 个候选。'+note,['failed','cancelled','blocked'].includes(task.status)?'error':'assistant');
      if(candidate)await saveProject(false);
    }catch(error){message(errorText(error),'error');}finally{$('sendButton').disabled=false;updateJobControls();await refreshTasks();}
  }
  async function showTaskCandidates(task) {
    $('candidateList').replaceChildren();const candidates=(task.candidates||[]).filter(candidate=>candidate.scene&&candidate.render);
    $('candidateSection').hidden=!candidates.length;$('candidateNote').textContent='选择依据：'+(task.selectionReason||'分别保留检查记录');
    for(const candidate of candidates){let image=null;try{const output=await runner.getRender(task.id,candidate.index);image=output?.png||output?.image;}catch{}
      const button=document.createElement('button');button.className='candidate-card'+(candidate.index===task.selectedCandidate?' selected':'');if(image){const picture=document.createElement('img');picture.src=image;picture.alt='候选 '+(candidate.index+1);button.append(picture);}const text=document.createElement('div'),title=document.createElement('strong'),small=document.createElement('small');title.textContent='候选 '+(candidate.index+1);const summary=candidate.verification?.summary;small.textContent=summary?'通过 '+summary.passed+' · 待处理 '+(summary.failed+summary.unknown+summary.blocked):'检查记录可查看';text.append(title,small);button.append(text);button.onclick=async()=>{try{await runner.selectCandidate(task.id,candidate.index);await loadScene(candidate.scene,{entry:'session',title:state.title,record:task,referenceUrl:state.referenceUrl});state.job=await runner.getTask(task.id);state.filter='mip';const output=await render({full:true});await adoptVerification(candidate.verification,output);await showTaskCandidates(state.job);}catch(error){notify(errorText(error));}};$('candidateList').append(button);
    }
  }
  async function showPublishedCandidates(record) {
    const candidates=record?.candidates||[];if(!candidates.some(c=>c.imageUrl||c.pngUrl||c.sceneUrl)){if(!state.job)$('candidateSection').hidden=true;return;}
    $('candidateList').replaceChildren();$('candidateSection').hidden=false;$('candidateNote').textContent='实际生成记录 · 点击打开可用候选';
    for(let index=0;index<candidates.length;index++){const candidate=candidates[index],button=document.createElement('button');button.className='candidate-card';const src=candidate.imageUrl||candidate.pngUrl;if(src){const image=document.createElement('img');image.src=src;image.alt='候选 '+(index+1);button.append(image);}const info=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent='候选 '+(index+1);small.textContent=({verified:'已检查 · 查看证据',rendered:'已渲染 · 评价未完成',compiled:'待渲染'}[candidate.status]||'检查记录已保留');info.append(strong,small);button.append(info);button.disabled=!candidate.sceneUrl&&!candidate.scene;button.onclick=async()=>{try{let scene=candidate.scene||await readJSON(candidate.sceneUrl);if(!scene.assets&&!scene.assetUrls&&state.scene?.assets)scene={...scene,assets:state.scene.assets};scene=await hydrateScene(scene,candidate.sceneUrl);await loadScene(scene,{entry:state.entry,title:state.title,record,referenceUrl:state.referenceUrl});state.filter='mip';const output=await render({full:true});await adoptVerification(candidate.verification,output);}catch(error){notify(errorText(error));}};$('candidateList').append(button);}
  }
  function compactTask(task) {if(!task)return null;const result={...task};if(result.candidates)result.candidates=result.candidates.map(candidate=>{const copy={...candidate};if(copy.scene){copy.scene={...copy.scene};if(copy.scene.assets){copy.scene.assetIds=Object.keys(copy.scene.assets);delete copy.scene.assets;}}return copy;});for(const key of ['initialScene','currentScene'])if(result[key]){result[key]={...result[key]};if(result[key].assets){result[key].assetIds=Object.keys(result[key].assets);delete result[key].assets;}}for(const key of ['assets','assetSnapshot'])if(result[key]){result.assetIds=Object.keys(result[key]);delete result[key];}return result;}
  function evidence() {return{schema:'crf.editor_evidence.v0.10',generatedAt:new Date().toISOString(),entry:state.entry,kind:state.kind,verification:state.verification,render:state.latest?.diagnostics,task:compactTask(state.job),record:compactTask(state.record),assets:assetsSummary(),provenance:state.scene?.provenance||state.activeCase||null,modelTraining:false};}
  function updateRenderEvidence() {
    const diagnostics=state.latest?.diagnostics||{},rows=[['输出尺寸',state.latest?state.latest.width+' × '+state.latest.height:'—'],['当前滤波',state.kind==='gaussian'?(state.filter==='mip'?'像素覆盖滤波':'中心采样'):'原版本求值器'],['模型训练','未执行'],['实际调用',state.job?.usage?.reduce((sum,u)=>sum+(u.providerCalls||0),0)||state.record?.providerRequests||'查看任务记录'],['表示范围',state.kind==='native'?'有限解析场景':'图像平面'],['质量认证','待独立评审']];
    const count=diagnostics.gaussians??diagnostics.gaussianCount??diagnostics.splats??diagnostics.splatCount;if(typeof count==='number')rows.splice(1,0,['高斯数',count.toLocaleString()]);$('renderEvidence').replaceChildren();for(const[label,value]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);$('renderEvidence').append(dt,dd);}
  }
  function updateChecks() {
    $('checkList').replaceChildren();const verification=state.verification;const checks=verification?.checks||[];
    $('verificationSummary').textContent=verification?(typeof verification.summary==='string'?verification.summary:'通过 '+checks.filter(c=>c.status==='passed').length+' · 失败 '+checks.filter(c=>c.status==='failed').length+' · 未知 '+checks.filter(c=>c.status==='unknown').length+' · 阻塞 '+checks.filter(c=>c.status==='blocked').length+'。真实感仍待独立评审。'):'当前画面尚未运行完整检查。点击“检查当前画面”获得程序与像素证据。';
    for(const check of checks){const card=document.createElement('div');card.className='check-card';const heading=document.createElement('div');heading.className='check-heading';const title=document.createElement('strong'),tag=document.createElement('span');title.textContent=check.title||check.label||check.name||({'program.finite':'参数与场景结构','render.frame':'实际像素数据','render.dimensions':'输出尺寸','visual.realism':'真实感 · 模型意见','visual.semantic':'语义符合度 · 模型意见','visual.coherence':'画面一致性 · 模型意见','visual.major_issues':'主要视觉问题','reference.mae':'与参考图的平均误差','reference.psnr':'与参考图的信噪比'}[check.id])||check.id;const status=check.status||(check.passed===true?'passed':check.passed===false?'failed':'unknown');tag.className='check-status '+status;tag.textContent=({passed:'通过',failed:'失败',unknown:'未知',blocked:'阻塞',not_applicable:'不适用'}[status]||status);heading.append(title,tag);const description=document.createElement('p');description.textContent=check.message||check.reason||check.description||check.scope||'';card.append(heading,description);const observed=check.value??check.observed;if(observed!==undefined){const value=document.createElement('div');value.className='check-value';value.textContent='观测值：'+(typeof observed==='object'?JSON.stringify(observed):String(observed));card.append(value);}$('checkList').append(card);}
    updateRenderEvidence();
  }
  async function verifyCurrent() {
    setTab('verify');busy(true,'计算完整画幅与逐项检查');
    try{const output=await calculate({full:true,coverage:true});if(!window.CRF10Verifier)throw new Error('验证模块未载入。');let reference=null;if(state.reference&&state.reference.width===output.width&&state.reference.height===output.height)reference=state.reference.getContext('2d').getImageData(0,0,state.reference.width,state.reference.height);
      const representation=state.kind==='gaussian'?'reference_gaussian':state.kind==='native'?'native_procedural':'reference_gaussian';
      const contract=CRF10Verifier.createContract({representation,width:output.width,height:output.height,perceptual:false,referenceRequired:false});
      state.verification=await CRF10Verifier.verify({scene:verificationScene(),output,contract,assetSummary:assetsSummary(),validateScene:state.kind==='gaussian'?CRFGaussian10.validateScene:state.kind==='native'?CRF09.validateScene:null});
      if(reference&&CRF10Verifier.measurePixels){const metrics=CRF10Verifier.measurePixels(reference,output);state.verification.observationDifference={scope:'Observed difference only; intentional edits are included, not a quality failure.',...metrics};const comparison={id:'reference_difference',title:'与参考图的观测差异',status:'unknown',message:'编辑变化也会进入差异。本项不用于证明新图真实感。',value:metrics};state.verification.checks.push(comparison);}
      updateChecks();status('检查完成。视觉真实感和未知区域保持独立状态。');
    }catch(error){notify(errorText(error));}finally{busy(false);}
  }
  function projectValue() {return{schema:'crf.editor_project.v0.10',savedAt:new Date().toISOString(),title:state.title,kind:state.kind,scene:state.scene,street:state.kind==='street'?state.street:undefined,model:state.kind==='native'?state.model:undefined,view:state.view,time:state.time,filter:state.filter,entry:state.entry,referenceUrl:state.referenceUrl,activeCase:state.activeCase,verification:state.verification,provenance:{modelTraining:false,rendererVersion:'0.10',qualityCertificate:false},...(state.kind==='street'?{dependencies:['crf-gaussian08.js','crf-boundary09.js','assets/v09/street/context.json','assets/v09/street/detail.json','assets/v08/gaussians/street.optimized.json']}:{})};}
  async function saveProject(exportFile=true) {
    const project=projectValue(),id=state.currentProjectId||'project:'+Date.now();
    let stored=false;try{if(store){await store.set(id,project);state.currentProjectId=id;stored=store.durable===true;await refreshProjects();}}catch(error){status('本机保存未完成：'+errorText(error));}
    if(exportFile){downloadJSON(project,'CRF_0_10_'+(state.scene?.id||state.entry||'scene')+'.json');notify(stored?'工程已保存到本机并下载。':'工程已下载；当前仅保留会话状态。');}
  }
  async function refreshProjects() {
    $('savedCases').replaceChildren();if(!store?.keys)return;const keys=(await store.keys('project:')).sort().reverse().slice(0,10);
    for(const key of keys){const project=await store.get(key);if(project)caseButton($('savedCases'),{id:key,title:project.title,subtitle:'本机工程 · '+new Date(project.savedAt).toLocaleDateString('zh-CN')},()=>openProject(project,key));}
    if(!keys.length)$('savedCases').innerHTML='<p class="muted">尚未保存工程。</p>';
  }
  async function openProject(project,id=null) {
    if(project.schema==='crf.editor_project.v0.9'){if(project.kind==='street'){await loadStreet();state.street=project.street;syncControls();await render();}else await loadScene(project.scene,{title:project.title});return;}
    if(project.schema!=='crf.editor_project.v0.10')return loadScene(project);
    if(project.kind==='street'){await loadStreet();state.street=project.street||CRFBoundary09.createState();}else await loadScene(project.scene,{entry:project.entry||'imported',title:project.title,item:project.activeCase,referenceUrl:project.referenceUrl});
    state.currentProjectId=id;state.model=project.model??state.model;state.view=project.view||'front';state.time=project.time||0;state.filter=project.filter||'mip';state.verification=null;syncControls();const output=await render({full:true});await adoptVerification(project.verification,output);
  }
  async function importFile(file) {
    if(!file)return;if(file.size>100*1024*1024)throw new Error('单个文件请小于 100 MiB。');
    if(file.name.toLowerCase().endsWith('.json')||file.type==='application/json')return openProject(JSON.parse(await file.text()));
    busy(true,'解码照片并逐图拟合高斯参数');
    try{const bitmap=await createImageBitmap(file),scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      const result=await workerRequest({operation:'fit',image:{width:pixels.width,height:pixels.height,data:pixels.data},options:{id:'import.'+Date.now(),budget:8192,iterations:20}},progress=>{$('busyText').textContent='逐图参数求解'+(progress.phase?' · '+({coarse:'粗尺度拟合',fine:'细尺度拟合',residual_refinement:'残差修正',refine:'参数修订',done:'完成'}[progress.phase]||progress.phase):'')+(progress.count!==undefined?' · '+progress.count+' 个高斯':'');});
      const asset=result.asset?.asset||result.asset;await loadScene(asset,{title:file.name.replace(/\.[^.]+$/,'')+' · 高斯重建',entry:'import.'+Date.now()});state.reference=canvas;state.referenceUrl=null;state.currentProjectId=null;syncDisplayButtons();notify('已完成逐图参数拟合。输出由高斯参数计算；没有训练模型。');
    }finally{busy(false);$('importFile').value='';}
  }
  function updateJobControls() {
    const running=runner?.isRunning()===true,task=state.job;
    $('cancelJob').hidden=!running;
    $('resumeJob').hidden=running||!task||!['failed','cancelled','blocked'].includes(task.status)||['CAPABILITY_GAP','UNSUPPORTED_REQUIREMENTS','CONTRACT_CHANGED'].includes(task.stopReason);
  }
  async function openTask(task) {
    const candidate=task.candidates?.[task.selectedCandidate];
    if(candidate){await loadScene(candidate.scene,{title:task.prompt?.slice(0,30),record:task});if(task.modelSnapshot!==undefined)state.model=task.modelSnapshot;state.filter='mip';const output=await render({full:true});await adoptVerification(candidate.verification,output);}
    state.job=task;$('jobPanel').hidden=false;$('jobTitle').textContent='已保存任务 · '+({review_required:'待独立审阅',blocked:'发现阻塞',cancelled:'已停止',failed:'未完成',running:'进行中'}[task.status]||task.status);$('jobLog').replaceChildren();
    for(const event of task.events||[]){const line=document.createElement('div');line.textContent=eventText(event);$('jobLog').append(line);}
    updateJobControls();await showTaskCandidates(task);updateRenderEvidence();
  }
  async function resumeTask() {
    if(!state.job||runner?.isRunning())return;$('sendButton').disabled=true;
    try{const task=await runner.resume(state.job.id);await openTask(task);message('任务已保存。'+(task.stopReason||'请检查当前候选。'));}catch(error){message(errorText(error),'error');}
    finally{$('sendButton').disabled=false;updateJobControls();await refreshTasks();}
  }
  async function refreshTasks() {
    $('recentTasks').replaceChildren();if(!runner)return;
    const tasks=(await runner.listTasks()).slice(0,6);for(const task of tasks)caseButton($('recentTasks'),{id:task.id,title:task.prompt?.slice(0,45)||task.id,subtitle:({review_required:'待独立审阅',blocked:'发现阻塞',cancelled:'已停止',failed:'未完成'}[task.status]||task.status||'已保存')},async()=>{if(runner.isRunning()){notify('请先完成或停止当前任务。');return;}await openTask(await runner.getTask(task.id));});
    if(!tasks.length)$('recentTasks').innerHTML='<p class="muted">任务与候选保存在本机。</p>';
  }
  async function exportPNG() {busy(true,'按完整画幅计算 PNG');try{const result=await calculate({full:true}),canvas=pixelsCanvas(result),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG 编码未完成');download(blob,'CRF_0_10_'+(state.scene?.id||state.entry)+'_'+state.view+'.png');status('已导出当前函数实际求值的完整画幅。');}catch(error){notify(errorText(error));}finally{busy(false);}}
  async function exportVideo() {
    if(!['native','gaussian'].includes(state.kind)){notify('原街景保留静态精确编辑。请选择本轮高斯或语义场景导出视频。');return;}
    stopPlayback();const saved=snapshot(),width=1280,height=720,scale=Math.min(width/saved.scene.width,height/saved.scene.height),vw=Math.round(saved.scene.width*scale),vh=Math.round(saved.scene.height*scale),x=Math.floor((width-vw)/2),y=Math.floor((height-vh)/2);$('exportVideo').disabled=true;busy(true,'检查逐帧编码能力');
    try{const result=await CRFVideo09.encode({width,height,fps:24,duration:5,renderFrame:async time=>{const image=await calculate({full:true,kind:saved.kind,scene:saved.scene,model:saved.model,time,view:'front',width:vw,height:vh,filter:saved.filter});const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#000';context.fillRect(0,0,width,height);context.putImageData(new ImageData(new Uint8ClampedArray(image.data),vw,vh),x,y);return canvas;},onProgress:progress=>{$('busyText').textContent='逐帧求值 '+progress.completed+' / '+progress.total;}});
      for(const url of videoObjectURLs)URL.revokeObjectURL(url);videoObjectURLs=[];const blobURL=URL.createObjectURL(result.blob),link=document.createElement('a');videoObjectURLs.push(blobURL);link.href=blobURL;link.download='CRF_0_10_'+(saved.scene.id||'scene')+'_5s.webm';link.textContent='下载刚生成的五秒视频';$('videoDownloads').replaceChildren(link);$('videoDownloads').hidden=false;const report={...result,blob:undefined,sceneId:saved.scene.id,viewport:{x,y,width:vw,height:vh},scope:saved.kind==='gaussian'?'2D Gaussian image-plane camera transform; not physical novel-view synthesis':'Declared finite depth parallax; not verified real-world 3D',aspectPolicy:'contain'};const reportURL=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),reportLink=document.createElement('a');videoObjectURLs.push(reportURL);reportLink.href=reportURL;reportLink.download='CRF_0_10_video_report.json';reportLink.textContent='编码与范围报告';$('videoDownloads').append(reportLink);download(result.blob,link.download);notify('五秒、120 帧视频已由函数逐帧计算完成。');
    }catch(error){modal('视频未完成',errorText(error));}finally{$('exportVideo').disabled=false;busy(false);}
  }
  async function play() {if(state.playing){stopPlayback();return;}state.playing=true;state.time=0;invalidate();$('playButton').textContent='暂停';const start=performance.now();async function frame(){if(!state.playing)return;state.time=Math.min(5,(performance.now()-start)/1000);$('timeline').value=state.time;$('timeLabel').textContent=state.time.toFixed(2)+' / 5 s';await render({showBusy:false}).catch(()=>{});if(state.time>=5){stopPlayback();return;}playTimer=setTimeout(frame,30);}await frame();}
  function bind() {
    $('closeDialog').onclick=()=>$('dialog').close();$('helpButton').onclick=()=>modal('CRF 0.10 · 使用说明','选择左侧案例，编辑对象或高斯图层。当前结果来自 CRF 求值器；参考图只在对照标签中显示。DeepSeek 会依据当前可用资产与函数生成候选，再检查真实画面。单图参数拟合不训练模型权重。二维查看不代表恢复了真实三维；照片真实感仍需独立评审。所有历史案例保留。');
    $('libraryToggle').onclick=()=>{const open=$('library').classList.toggle('open');$('libraryToggle').setAttribute('aria-expanded',String(open));};document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>setTab(button.dataset.tab));
    $('undoButton').onclick=async()=>{if(!state.history.length)return;state.future.push(snapshot());await restore(state.history.pop());};$('redoButton').onclick=async()=>{if(!state.future.length)return;state.history.push(snapshot());await restore(state.future.pop());};
    $('sourceButton').onclick=()=>{const source=state.kind==='street'?{schema:'crf.street_edit.v0.9',state:state.street}:{...state.scene};if(source.assets){source.assetSummary=assetsSummary();delete source.assets;source.assetNote='保存工程会包含全部高斯系数。此处展示当前可执行场景与资产摘要。';}delete source.appearanceModel;modal('当前可执行函数',source);};
    $('saveButton').onclick=()=>saveProject().catch(error=>notify(errorText(error)));$('exportPNG').onclick=exportPNG;$('exportVideo').onclick=exportVideo;$('playButton').onclick=play;$('verifyButton').onclick=verifyCurrent;
    document.querySelectorAll('[data-display]').forEach(button=>button.onclick=()=>{state.display=button.dataset.display;syncDisplayButtons();displayCurrent();});
    document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{stopPlayback();state.view=button.dataset.view;state.time=0;invalidate();syncControls();render().catch(()=>{});});
    $('fitView').onclick=()=>{stopPlayback();state.view='front';state.time=0;invalidate();syncControls();render().catch(()=>{});};$('filterMode').onchange=()=>{checkpoint();state.filter=$('filterMode').value;invalidate();requestRender();};
    $('timeline').oninput=()=>{stopPlayback();state.time=Number($('timeline').value);$('timeLabel').textContent=state.time.toFixed(2)+' / 5 s';invalidate();requestRender();};
    $('wallColor').oninput=()=>streetEdit({wallColor:rgb($('wallColor').value),wallStrength:Number($('wallStrength').value)||.75});$('wallStrength').oninput=()=>streetEdit({wallColor:rgb($('wallColor').value),wallStrength:Number($('wallStrength').value)});$('signalVisible').onchange=()=>streetEdit({signalVisible:$('signalVisible').checked});$('signalX').oninput=()=>streetEdit({signalOffsetX:Number($('signalX').value)});$('resetStreet').onclick=()=>loadStreet().catch(error=>notify(errorText(error)));
    for(const id of ['nativeType','addNativeType'])for(const[value,label]of Object.entries(types)){const option=document.createElement('option');option.value=value;option.textContent=label;$(id).append(option);}
    $('nativeObjectForm').onsubmit=event=>event.preventDefault();$('nativeColor').oninput=()=>nativeObjectEdit({color:rgb($('nativeColor').value)});$('nativeType').onchange=()=>nativeObjectEdit({type:$('nativeType').value,label:types[$('nativeType').value]});$('nativeVisible').onchange=()=>nativeObjectEdit({visible:$('nativeVisible').checked});for(const[key,id]of[['x','nativeX'],['y','nativeY'],['width','nativeWidth'],['height','nativeHeight']])$(id).onchange=()=>nativeObjectEdit({[key]:Number($(id).value)});$('nativeRoughness').oninput=()=>nativeObjectEdit({roughness:Number($('nativeRoughness').value)});$('removeNative').onclick=()=>nativeEdit([{op:'remove',id:state.selected}]);$('addNative').onclick=()=>{const type=$('addNativeType').value,id=type+'.'+Date.now();nativeEdit([{op:'add',object:{id,type,x:.5,y:.7,width:.18,height:.23,color:type==='orange'?[225,135,37]:type==='apple'?[175,45,31]:[122,151,91],depth:.75,roughness:.6,visible:true}}]);state.selected=id;syncNative();};
    $('nativeBackground').oninput=()=>nativeEdit([{op:'environment',values:{[state.scene.category==='landscape'?'skyColor':'wallColor']:rgb($('nativeBackground').value)}}]);$('nativeAzimuth').oninput=()=>nativeEdit([{op:'light',values:{azimuth:Number($('nativeAzimuth').value)}}]);$('nativeIntensity').oninput=()=>nativeEdit([{op:'light',values:{intensity:Number($('nativeIntensity').value)}}]);
    $('gaussianTint').oninput=()=>gaussianEdit({albedoTint:rgb($('gaussianTint').value).map(value=>value/255)});$('gaussianExposure').oninput=()=>gaussianEdit({exposure:Number($('gaussianExposure').value)});for(const[id,axis]of[['gaussianGradientX',0],['gaussianGradientY',1]])$(id).oninput=()=>{const object=state.scene.objects.find(o=>o.id===state.selected)||state.scene.objects[0],gradient=[...(object?.illuminationGradient||[0,0])];gradient[axis]=Number($(id).value);gaussianEdit({illuminationGradient:gradient});};$('gaussianVisible').onchange=()=>gaussianEdit({visible:$('gaussianVisible').checked});for(const[key,id]of[['x','gaussianX'],['y','gaussianY'],['rotation','gaussianRotation']])$(id).onchange=()=>gaussianEdit({[key]:Number($(id).value)});$('gaussianScale').onchange=()=>gaussianEdit({scaleX:Number($('gaussianScale').value),scaleY:Number($('gaussianScale').value)});$('resetGaussianEdits').onclick=()=>gaussianEdit({albedoTint:[1,1,1],exposure:0,illuminationGradient:[0,0]});
    $('gaussianHighlights').onchange=()=>gaussianEdit({preserveHighlights:$('gaussianHighlights').checked});$('gaussianShadow').oninput=()=>{const object=state.scene.objects.find(o=>o.id===state.selected);if(object)gaussianEdit({shadow:{...(object.shadow||{}),strength:Number($('gaussianShadow').value)}});};$('gaussianAsset').onchange=()=>gaussianEdit({assetId:$('gaussianAsset').value});$('addGaussian').onclick=addGaussianObject;$('gaussianBackground').oninput=()=>{if(state.kind!=='gaussian')return;checkpoint();state.scene=cloneScene(state.scene);state.scene.background=rgb($('gaussianBackground').value);invalidate();requestRender();};
    $('assistantForm').onsubmit=event=>{event.preventDefault();runTask();};document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{$('promptInput').value=button.dataset.prompt;$('taskMode').value=button.textContent==='细腻自然'?'edit':'generate';});$('cancelJob').onclick=()=>{if(runner?.cancel())status('正在停止任务，已完成结果会保留。');};$('resumeJob').onclick=resumeTask;
    $('exportEvidence').onclick=()=>downloadJSON(evidence(),'CRF_0_10_evidence.json');$('inspectRecord').onclick=()=>modal('当前证据记录',evidence());$('importButton').onclick=()=>$('importFile').click();$('importFile').onchange=()=>importFile($('importFile').files[0]).catch(error=>{busy(false);notify(errorText(error));});
    $('inspectPixels').onchange=()=>{$('loupe').hidden=!$('inspectPixels').checked;};$('canvas').onpointermove=event=>{if(!$('inspectPixels').checked)return;const canvas=$('canvas'),rect=canvas.getBoundingClientRect(),x=Math.max(0,Math.min(canvas.width-1,Math.floor((event.clientX-rect.left)/rect.width*canvas.width))),y=Math.max(0,Math.min(canvas.height-1,Math.floor((event.clientY-rect.top)/rect.height*canvas.height))),context=$('loupeCanvas').getContext('2d');context.imageSmoothingEnabled=false;context.clearRect(0,0,176,176);context.drawImage(canvas,x-22,y-22,44,44,0,0,176,176);context.strokeStyle='#22c5d9';context.strokeRect(86,86,4,4);const pixel=canvas.getContext('2d').getImageData(x,y,1,1).data;$('pixelInfo').textContent=x+', '+y+' · RGBA '+Array.from(pixel).join(', ');$('loupe').hidden=false;};$('canvas').onpointerleave=()=>{$('loupe').hidden=true;};
    window.addEventListener('beforeunload',event=>{if(runner?.isRunning()){event.preventDefault();event.returnValue='';}});
  }
  async function boot() {
    bind();createRunner();caseButton($('streetCases'),{id:'street',title:'午后红绿灯',subtitle:'原图重建 · 换色与背景补齐',thumbnailUrl:'assets/v09/street/reference.png'},loadStreet);
    const responses=await Promise.allSettled([readJSON('assets/v10/gallery.json'),readJSON('assets/v09/generated/index.json'),readJSON('assets/v09/shared-appearance.json'),fetch('/api/crf/status').then(response=>response.json())]);
    if(responses[2].status==='fulfilled')state.model=responses[2].value;
    if(responses[0].status==='fulfilled'){state.cases=responses[0].value.cases||responses[0].value.examples||[];$('newCases').replaceChildren();for(const item of state.cases)caseButton($('newCases'),item,()=>openCase(item));}
    if(!state.cases.length)$('newCases').innerHTML='<p class="muted">本轮案例索引尚未载入。可以导入照片拟合，或先打开保留案例。</p>';
    if(responses[1].status==='fulfilled'){state.legacy=responses[1].value.examples||[];for(const item of state.legacy)caseButton($('legacyCases'),{...item,subtitle:'0.9 实际生成 · '+({architecture:'建筑',landscape:'风景',still_life:'静物'}[item.category]||'场景')},()=>openCase(item));}
    $('legacyCount').textContent=state.legacy.length;$('caseCount').textContent=(state.cases.length+state.legacy.length+1)+' 个';
    $('connection').textContent=responses[3].status==='fulfilled'&&responses[3].value.configured?'DeepSeek 服务已配置':'DeepSeek 服务待连接';
    try{await refreshProjects();await refreshTasks();}catch(error){createRunner(true);await refreshProjects();await refreshTasks();notify('本机持久存储不可用；仍可编辑，并通过“保存工程”下载完整参数。');}
    const requested=new URLSearchParams(location.search).get('case'),item=[...state.cases,...state.legacy].find(entry=>entry.id===requested)||state.cases[0];
    try{if(item)await openCase(item);else await loadStreet({pushHistory:false});}catch(error){notify('新案例未能载入，已保留原街景入口。');await loadStreet({pushHistory:false});}
    state.history=[];state.future=[];historyButtons();
  }
  window.CRFEditor10={version:'0.10.0',getScene:()=>cloneScene(state.scene),getState:()=>({kind:state.kind,entry:state.entry,selected:state.selected,title:state.title,view:state.view,time:state.time,filter:state.filter,verification:state.verification}),getPixels:()=>state.latest,loadScene,loadStreet,render,verifyCurrent,saveProject,openProject,assetsSummary,runner:null};
  boot().catch(error=>{busy(false);status(errorText(error));notify(errorText(error));});
})();
