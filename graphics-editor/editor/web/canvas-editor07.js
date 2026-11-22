(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const state = {program:null,cases:[],busy:false,phase:'initializing',render:null,model:null,error:null,abort:null,undo:[],generation:0};
  const canvas = $('artCanvas');
  const engine = () => { if (!window.CRFCanvas07) throw new Error('二维绘制管线未加载，请刷新页面重试。'); return window.CRFCanvas07; };
  function message(text, error=false) { $('statusText').textContent=text; $('errorBanner').hidden=!error; $('errorBanner').textContent=error?text:''; state.error=error?text:null; }
  function busy(value, text='正在绘制像素') {
    state.busy=value; $('renderOverlay').hidden=!value; $('renderMessage').textContent=text;
    for (const id of ['renderButton','variationButton','exportPNGButton','exportJSONButton','applySourceButton']) $(id).disabled=value||!state.program;
    $('undoButton').disabled=value||!state.undo.length; $('generateButton').disabled=value; $('importButton').disabled=value;
    $('seedInput').disabled=value; $('generateButton').textContent=value?'正在处理…':'通过编辑器生成';
    for (const button of $('gallery').querySelectorAll('button')) button.disabled=value;
  }
  function evidence() { $('evidenceText').textContent=JSON.stringify({pipeline:'crf.canvas_program.v0.7',caseId:state.program?.id,render:state.render,model:state.model,error:state.error},null,2); }
  function updateProgram() {
    const p=state.program; if (!p) return;
    $('sceneTitle').textContent=p.title||p.id; $('seedInput').value=p.seed;
    $('sourceInput').value=p.source; $('sourceSize').textContent=p.source.length.toLocaleString()+' 字符';
    $('dimensions').textContent=p.width+' × '+p.height;
    for (const button of $('gallery').querySelectorAll('button')) { const selected=button.dataset.id===p.id; button.classList.toggle('active',selected); button.setAttribute('aria-current',selected?'true':'false'); }
    try { localStorage.setItem('crf.canvas07.lastProgram',JSON.stringify(p)); } catch {}
  }
  async function draw(program, options={}) {
    const valid=engine().validate(program), staging=document.createElement('canvas');
    staging.width=valid.width; staging.height=valid.height;
    state.phase='rendering'; message('正在执行二维图像程序');
    const result=await engine().renderToCanvas(staging,valid,{timeoutMs:60000,signal:state.abort?.signal});
    if (state.abort?.signal.aborted) throw new DOMException('绘制已停止','AbortError');
    if (options.history!==false && state.program) { state.undo.push(clone(state.program)); if(state.undo.length>20) state.undo.shift(); }
    canvas.width=staging.width; canvas.height=staging.height; canvas.getContext('2d').drawImage(staging,0,0);
    state.program=valid; state.render=result.stats||{}; state.phase='ready';
    updateProgram(); $('emptyState').hidden=true; $('renderTime').textContent=((state.render.elapsedMs||0)/1000).toFixed(2)+' s';
    message('实际程序渲染完成'); evidence(); return {program:clone(valid),stats:clone(state.render),canvas};
  }
  async function loadProgram(program, options={}) {
    if(state.busy) throw new Error('当前任务正在执行，请等待完成或停止后再切换。');
    state.model=options.evidence===undefined?(program.provenance?{provenance:clone(program.provenance)}:null):options.evidence;
    state.abort=new AbortController(); busy(true);
    try { return await draw(program,options); }
    catch(error) { state.phase=error.name==='AbortError'?'cancelled':'error'; message(error.message||'绘制失败',error.name!=='AbortError'); evidence(); throw error; }
    finally { state.abort=null; busy(false); }
  }
  async function render() { if(!state.program) throw new Error('请先打开图像程序。'); const program=clone(state.program); program.seed=Number($('seedInput').value); return loadProgram(program); }
  async function selectCase(id) {
    const entry=state.cases.find(item=>item.id===id); if(!entry) throw new Error('找不到这个案例。');
    const filename=entry.program||entry.url||id+'.json';
    const url=new URL(filename,new URL('assets/direct2d07/',location.href));
    if(url.origin!==location.origin) throw new Error('案例必须来自当前编辑器。');
    message('正在打开 '+(entry.title||entry.id));
    const response=await fetch(url.href,{cache:'no-store'}); if(!response.ok) throw new Error('案例读取失败（HTTP '+response.status+'）。');
    const value=await response.json();
    if(entry.prompt) $('promptInput').value=entry.prompt;
    return loadProgram(value.program||value,{evidence:entry.evidence||value.provenance||value.program?.provenance||null});
  }
  function download(blob,name) { const url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000); }
  async function exportPNG(options={}) {
    if(state.busy||!state.program||!state.render) throw new Error('请等待画面渲染完成。');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')); if(!blob) throw new Error('PNG 导出失败。');
    const result={blob,width:canvas.width,height:canvas.height,dataUrl:canvas.toDataURL('image/png'),stats:clone(state.render)};
    if(options.download!==false) download(blob,'CRF_2D_'+state.program.id+'.png'); return result;
  }
  function exportJSON(options={}) {
    if(!state.program) throw new Error('尚无图像程序。');
    const text=JSON.stringify(state.program,null,2); if(options.download!==false) download(new Blob([text],{type:'application/json'}),'CRF_2D_'+state.program.id+'.json'); return text;
  }
  async function generate(options={}) {
    if(state.busy) throw new Error('当前任务尚未完成。');
    const prompt=(options.prompt??$('promptInput').value).trim(), mode=options.mode||$('generationMode').value;
    if(!prompt) throw new Error('请先描述你想生成的画面。');
    if(mode==='edit'&&!state.program) throw new Error('请先打开需要修改的图片。');
    state.abort=new AbortController(); busy(true,'模型正在编写二维图像程序'); state.phase='generating'; message('已提交模型生成请求');
    try {
      const input={prompt,mode,search:options.search??$('searchEnabled').checked,currentProgram:mode==='edit'?clone(state.program):null};
      if(mode==='edit'){input.id=state.program.id;input.title=state.program.title;input.seed=state.program.seed;}
      if(mode==='edit'&&state.render) input.image=canvas.toDataURL('image/png');
      const response=await fetch('/api/crf/canvas/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:state.abort.signal});
      const contentType=response.headers.get('content-type')||'';
      if(!contentType.includes('application/json')) throw new Error('当前环境尚未接通二维模型服务；已有案例仍可打开、修改代码和重新渲染。');
      const value=await response.json();
      if(!response.ok||value.ok===false) throw new Error(value.error?.message||value.message||'模型请求失败（HTTP '+response.status+'）。');
      if(!value.program) throw new Error('模型没有返回可执行的二维图像程序。');
      state.model={requestId:value.requestId||value.runId||value.program.provenance?.requestId,model:value.model||value.program.provenance?.provider,usage:value.usage,research:value.research,provenance:value.program.provenance};
      $('modelMessage').textContent=value.message||'模型已返回图像程序，编辑器正在执行。'; $('modelMessage').hidden=false;
      $('renderMessage').textContent='编辑器正在绘制像素';
      const result=await draw(value.program); $('serviceNote').textContent='实际生成与渲染记录已保留。'; return result;
    } catch(error) { state.phase=error.name==='AbortError'?'cancelled':'error'; message(error.name==='AbortError'?'任务已停止':error.message,error.name!=='AbortError'); evidence(); throw error; }
    finally {state.abort=null;busy(false);}
  }
  function onError(error) { message(error.message||String(error),error.name!=='AbortError'); evidence(); }
  function drawGallery() {
    $('gallery').replaceChildren(); $('caseCount').textContent=state.cases.length;
    state.cases.forEach((entry,index)=>{
      const button=document.createElement('button');button.className='gallery-item';button.dataset.id=entry.id;button.setAttribute('aria-label','打开二维案例：'+(entry.title||entry.id));
      const number=document.createElement('span');number.className='gallery-number';number.textContent=String(index+1).padStart(2,'0');
      const copy=document.createElement('span');copy.className='gallery-copy';const title=document.createElement('strong');title.textContent=entry.title||entry.id;const detail=document.createElement('small');detail.textContent=entry.subtitle||'Canvas 2D · 程序绘制';copy.append(title,detail);button.append(number,copy);button.addEventListener('click',()=>selectCase(entry.id).catch(onError));$('gallery').append(button);
    });
    if(!state.cases.length) { const note=document.createElement('p');note.className='gallery-note';note.textContent='案例正在准备。你也可以导入自己的二维图像程序。';$('gallery').append(note); }
  }
  async function initialize() {
    try {
      engine();
      const response=await fetch('assets/direct2d07/manifest.json',{cache:'no-store'});
      if(response.ok){const value=await response.json();state.cases=Array.isArray(value)?value:value.cases||value.entries||[];}
      drawGallery();
      const requested=new URLSearchParams(location.search).get('case');
      if(state.cases.length) await selectCase(state.cases.some(c=>c.id===requested)?requested:state.cases[0].id);
      else {state.phase='ready';message('选择图像程序或描述一个新场景');}
    } catch(error) { state.phase='error';drawGallery();onError(error); }
    return true;
  }
  $('renderButton').addEventListener('click',()=>render().catch(onError));
  $('variationButton').addEventListener('click',async()=>{
    if(!state.program)return;
    const previousHash=state.render?.rgbaSHA256;
    $('seedInput').value=(Number($('seedInput').value)+1)%2147483647;
    try {
      await render();
      if(previousHash&&state.render?.rgbaSHA256===previousHash) message('已重新计算；该程序对本次种子变化未产生像素差异。');
    } catch(error) { onError(error); }
  });
  $('undoButton').addEventListener('click',()=>{const previous=state.undo.pop();if(previous)loadProgram(previous,{history:false}).catch(onError);});
  $('applySourceButton').addEventListener('click',()=>{if(!state.program)return;const program=clone(state.program);program.source=$('sourceInput').value;program.seed=Number($('seedInput').value);loadProgram(program).catch(onError);});
  $('exportPNGButton').addEventListener('click',()=>exportPNG().catch(onError));
  $('exportJSONButton').addEventListener('click',()=>{try{exportJSON();}catch(error){onError(error);}});
  $('importButton').addEventListener('click',()=>$('programFile').click());
  $('programFile').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>1500000)throw new Error('程序文件过大。');const value=JSON.parse(await file.text());await loadProgram(value.program||value);}catch(error){onError(error);}finally{event.target.value='';}});
  $('generateForm').addEventListener('submit',event=>{event.preventDefault();generate().catch(onError);});
  $('promptInput').addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();generate().catch(onError);}});
  $('cancelButton').addEventListener('click',()=>state.abort?.abort());
  window.addEventListener('beforeunload',()=>state.abort?.abort());
  window.CRF2DEditor07={loadProgram,render,generate,selectCase,loadCase:selectCase,exportPNG,exportJSON,getProgram:()=>state.program?clone(state.program):null,getStatus:()=>({phase:state.phase,busy:state.busy,caseId:state.program?.id,title:state.program?.title,render:state.render?clone(state.render):null,model:state.model?clone(state.model):null,error:state.error}),getCanvas:()=>canvas,getCases:()=>clone(state.cases),cancel:()=>state.abort?.abort()};
  window.CRF2DEditor07.ready=initialize();
})();
