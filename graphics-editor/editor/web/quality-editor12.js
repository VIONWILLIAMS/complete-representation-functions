/* Quality workbench. Reference pixels are loaded only for the separate comparison
 * canvas; the compute worker receives only declared functions and scene settings. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), core = globalThis.CRFQuality12;
  const ASSET_URL = '/assets/quality12/alpine.asset.json';
  const EVIDENCE_URL = '/assets/quality12/alpine.quality.json';
  const REFERENCE_URL = '/assets/v08/references/landscape.alpine.png';
  const regions = {
    full: {name: '完整场景', roi: [0, 0, 1, 1]},
    forest: {name: '山林细节', roi: [.05, .05, .40, .55]},
    water: {name: '水面与倒影', roi: [.05, .70, .95, .98]},
    shore: {name: '岸边建筑', roi: [.60, .48, .98, .70]}
  };
  const state = {
    project: null, sealedAsset: null, baseAssetHash: null, assetHash: null,
    quality: null, qualityVerified: false, assetFileHash: null,
    frame: null, region: 'full', reference: null, showReference: false,
    referenceLoads: 0, runs: [], exports: [], requests: new Map(), sequence: 0,
    activeRequest: null, worker: null, editTimer: null, video: false,
    videoCancelled: false, videoURLs: [], lastSavedHash: null
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  const need = (condition, message) => { if (!condition) throw new Error(message); };
  const abort = message => new DOMException(message || '计算已取消', 'AbortError');
  const number = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const count = value => Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
  const identityEdits = edits => (edits?.exposure || 0) === 0 && (edits?.contrast ?? 1) === 1 && (edits?.saturation ?? 1) === 1;
  function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error-text', error); }
  function fail(error) { if (error?.name !== 'AbortError') status(error?.message || String(error), true); }
  function listen(id, event, fn) { $(id).addEventListener(event, e => Promise.resolve().then(() => fn(e)).catch(fail)); }
  function showDialog(title, value) { $('dialogTitle').textContent = title; $('dialogContent').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); $('infoDialog').showModal(); }
  function download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  const downloadJSON = (value, name) => download(new Blob([JSON.stringify(value, null, 2) + '\n'], {type: 'application/json'}), name);
  async function digest(value) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; const hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join(''); }
  async function readText(url) { const response = await fetch(url, {cache: 'no-cache'}); need(response.ok, '无法读取 ' + url + '（' + response.status + '）'); const value = await response.text(); need(value.length <= 64 * 1024 * 1024, '文件超过 64 MiB 读取预算'); return value; }

  function ensureWorker() {
    if (state.worker) return;
    state.worker = new Worker('quality-worker12.js');
    state.worker.onmessage = event => {
      const message = event.data || {}, job = state.requests.get(message.requestId);
      if (!job) return;
      if (message.type === 'progress') { job.progress?.(message.progress); return; }
      state.requests.delete(message.requestId);
      if (state.activeRequest === message.requestId) state.activeRequest = null;
      if (message.type === 'result') job.resolve(message.result);
      else if (message.type === 'cancelled') job.reject(abort());
      else job.reject(Object.assign(new Error(message.error?.message || '函数计算失败'), {code: message.error?.code}));
    };
    state.worker.onerror = event => {
      const error = new Error(event.message || '计算 Worker 未能启动');
      for (const job of state.requests.values()) job.reject(error);
      state.requests.clear(); state.activeRequest = null; state.worker.terminate(); state.worker = null;
    };
  }
  function cancelCalculation() {
    if (state.activeRequest === null) return;
    const id = state.activeRequest, job = state.requests.get(id);
    state.worker?.postMessage({type: 'cancel', requestId: id});
    state.requests.delete(id); state.activeRequest = null; job?.reject(abort());
  }
  function calculate(project, progress) {
    ensureWorker(); cancelCalculation();
    const requestId = ++state.sequence; state.activeRequest = requestId;
    return new Promise((resolve, reject) => { state.requests.set(requestId, {resolve, reject, progress}); state.worker.postMessage({type: 'render', requestId, project}); });
  }
  function frameCanvas(frame) { const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height; const data = frame.data instanceof Uint8ClampedArray ? frame.data : new Uint8ClampedArray(frame.data); canvas.getContext('2d').putImageData(new ImageData(data, frame.width, frame.height), 0, 0); return canvas; }
  function paint(frame) { const canvas = $('outputCanvas'); canvas.width = frame.width; canvas.height = frame.height; canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0); $('frameSize').textContent = count(frame.width) + ' × ' + count(frame.height); }
  function busy(value, message) { $('renderOverlay').hidden = !value; $('cancelRender').hidden = !value; $('renderMessage').textContent = message || '函数直接求值中'; $('exportPNG').disabled = value || !state.project; $('saveProject').disabled = !state.project; }
  function progressText(progress) { if (typeof progress === 'number') return Math.round(progress * 100) + '%'; if (Number.isFinite(progress?.fraction)) return Math.round(progress.fraction * 100) + '%'; if (Number.isFinite(progress?.completed) && progress.total) return Math.round(progress.completed / progress.total * 100) + '%'; return ''; }
  async function renderCurrent(precomputedFrame) {
    need(state.project, '尚未载入工程'); clearTimeout(state.editTimer); state.editTimer = null;
    const project = state.project; busy(true); $('currentState').textContent = '计算中';
    const started = performance.now();
    try {
      const frame = precomputedFrame || await calculate(project, progress => { const value = progressText(progress); $('renderMessage').textContent = '函数直接求值中' + (value ? ' · ' + value : ''); });
      if (project !== state.project) return;
      paint(frame); state.frame = {result: frame, project, at: new Date().toISOString()};
      const measured = frame.diagnostics?.elapsedMs ?? (performance.now() - started);
      $('renderTime').textContent = number(measured, 0) + ' ms';
      $('currentState').textContent = currentBaseline() ? '原生基准' : '已重新计算';
      state.runs.push({at: state.frame.at, status: 'completed', view: copy(project.view), edits: copy(project.edits), diagnostics: frame.diagnostics, wallMs: +(performance.now() - started).toFixed(3), referencePixelsPassedToWorker: false});
      if (state.runs.length > 100) state.runs.shift();
      updateQuality(); await paintReference();
      status('已计算 ' + frame.width + ' × ' + frame.height + ' 像素。' + (state.showReference ? '参考图只用于独立对照。' : '当前计算没有读取参考图像。'));
    } catch (error) {
      state.runs.push({at: new Date().toISOString(), status: error.name === 'AbortError' ? 'cancelled' : 'failed', message: error.message, view: copy(project.view)});
      if (project === state.project) { $('currentState').textContent = error.name === 'AbortError' ? '计算已取消' : '计算失败'; if (error.name === 'AbortError') status('计算已取消；画布保留上一次完成的结果。'); }
      throw error;
    } finally { if (project === state.project && !state.video) busy(false); }
  }

  function currentBaseline() {
    const p = state.project; return !!p && state.assetHash === state.baseAssetHash && identityEdits(p.edits) && p.view.width === p.asset.width && p.view.height === p.asset.height && JSON.stringify(p.view.roi) === '[0,0,1,1]';
  }
  function qualityAttached() { return state.qualityVerified && state.assetHash === state.baseAssetHash; }
  function updateQuality() {
    const measured = qualityAttached(), quality = state.quality, metrics = measured ? quality.metrics : {};
    const currentPassed = measured && quality?.passed && currentBaseline() && state.frame?.project === state.project;
    $('metricPSNR').textContent = number(metrics.psnr, 2); $('metricSSIM').textContent = number(metrics.ssim, 4); $('metricMAE').textContent = number(metrics.mae, 2);
    $('qualityBadge').classList.toggle('failed', !measured || !quality?.passed);
    $('qualityBadge').classList.toggle('pending', measured && quality?.passed && !currentPassed);
    $('qualityBadge').textContent = measured ? (quality.passed ? (currentPassed ? '当前原生重建通过' : '原生基准已验证 · 当前输出未重验') : '参考质量门槛未通过') : '当前资产未验证';
    $('qualityScope').textContent = measured ? (currentPassed ? '原生基准 · 参数摘要已核对。全帧与 3 个固定细节区按真实参考测量。' : '这里显示已封存原生资产的质量。当前视口、尺寸或颜色修改尚未按原图重新验收。') : '当前资产没有匹配的真实参考质量报告。';
  }
  function updateAssetInfo() {
    const p = state.project, asset = p.asset;
    $('assetTitle').textContent = p.title || asset.id || '导入的函数资产';
    $('nativeSize').textContent = asset.width + ' × ' + asset.height + ' px';
    $('basisCount').textContent = count(asset.splats.length) + ' 个';
    $('parameterCount').textContent = count(asset.splats.length * 8 + 3);
    $('representationScope').textContent = '逐参考拟合的视觉函数。' + (qualityAttached() && state.quality.representation?.float32ToRawRGBRatio ? '参数按 Float32 计约为原 RGB 字节量的 ' + number(state.quality.representation.float32ToRawRGBRatio, 2) + ' 倍。' : '') + '新场景生成与自然动态未验证。';
  }
  function syncCode() {
    $('sceneCode').value = JSON.stringify({view: state.project.view, edits: state.project.edits}, null, 2);
    $('codeStatus').textContent = '与当前工程同步';
    $('renderSource').textContent = core.renderSourceCode ? core.renderSourceCode(state.project) : 'const project = await CRFQuality12.parseProject(savedJSON);\nconst image = CRFQuality12.render(project);';
    for (const field of ['exposure', 'contrast', 'saturation']) { $(field).value = state.project.edits[field] ?? (field === 'exposure' ? 0 : 1); $(field + 'Value').textContent = number(Number($(field).value), 2) + (field === 'exposure' ? ' EV' : ''); }
    const p = state.project, full = p.view.roi.every((v, i) => v === [0, 0, 1, 1][i]);
    const selected = full ? 'full' : state.region;
    document.querySelectorAll('[data-region]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.region === selected)));
    $('regionCaption').textContent = (regions[state.region]?.name || '自定义视口') + ' · ' + p.view.width + ' × ' + p.view.height + ' 个计算样本';
    $('feedbackState').textContent = (p.feedback?.length || 0) + ' 条反馈；随工程保存。';
  }
  function regionView(id, multiplier = Number($('resolution').value)) {
    const asset = state.project.asset;
    if (id === 'custom') {
      const roi = state.project.view.roi;
      return {width: Math.max(1, Math.round((roi[2] - roi[0]) * asset.width)) * multiplier, height: Math.max(1, Math.round((roi[3] - roi[1]) * asset.height)) * multiplier, roi: roi.slice()};
    }
    const region = regions[id]; need(region, '未知细节区域');
    const [x0, y0, x1, y1] = region.roi, left = Math.floor(x0 * asset.width), top = Math.floor(y0 * asset.height), right = Math.ceil(x1 * asset.width), bottom = Math.ceil(y1 * asset.height);
    return {width: (right - left) * multiplier, height: (bottom - top) * multiplier, roi: [left / asset.width, top / asset.height, right / asset.width, bottom / asset.height]};
  }
  async function setRegion(id) { state.region = id; state.project = core.withView(state.project, regionView(id)); syncCode(); updateQuality(); await renderCurrent(); }
  async function setEdits(immediate = false) {
    if (!state.project || state.video) return;
    const edits = Object.fromEntries(['exposure', 'contrast', 'saturation'].map(id => [id, Number($(id).value)]));
    state.project = core.applyEdits(state.project, edits); syncCode(); updateQuality();
    clearTimeout(state.editTimer); if (immediate) await renderCurrent(); else state.editTimer = setTimeout(() => renderCurrent().catch(fail), 160);
  }

  async function loadReference() {
    need(qualityAttached(), '当前工程没有可核对的参考来源');
    if (state.reference) return state.reference;
    const assetHash = state.assetHash;
    const image = new Image(); image.decoding = 'async'; image.src = REFERENCE_URL;
    await image.decode();
    need(qualityAttached() && state.assetHash === assetHash, '参考加载期间工程已经改变；未显示旧参考');
    state.reference = image; state.referenceLoads++;
    $('referenceState').textContent = '参考像素仅用于对照'; return image;
  }
  async function paintReference() {
    if (!state.showReference || !state.project) return;
    const image = await loadReference(), p = state.project, roi = p.view.roi, canvas = $('referenceCanvas');
    canvas.width = p.view.width; canvas.height = p.view.height;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, roi[0] * image.naturalWidth, roi[1] * image.naturalHeight, (roi[2] - roi[0]) * image.naturalWidth, (roi[3] - roi[1]) * image.naturalHeight, 0, 0, canvas.width, canvas.height);
    $('referenceCaption').textContent = p.view.width > (roi[2] - roi[0]) * image.naturalWidth + .1 ? '参考显示放大 · 未增加细节' : '原生像素对照';
  }
  async function toggleReference() {
    const enabled = !state.showReference;
    if (enabled) await loadReference();
    state.showReference = enabled; $('referenceFigure').hidden = !enabled; $('stages').classList.toggle('compare', enabled); $('toggleReference').setAttribute('aria-pressed', String(enabled)); $('toggleReference').textContent = enabled ? '隐藏参考对照' : '显示参考对照';
    if (enabled) await paintReference();
    $('referenceState').textContent = enabled ? '参考像素仅用于对照' : (state.referenceLoads ? '参考已隐藏 · 计算无需原图' : '未加载参考像素');
  }

  async function saveProject() { need(state.project, '尚无工程'); const text = await core.serializeProject(state.project); state.lastSavedHash = JSON.parse(text).contentHash; download(new Blob([text], {type: 'application/json'}), 'CRF_1_1_real_scene.crf.json'); status('完整函数参数与当前编辑已保存，可在无需参考图的情况下重新计算。'); }
  async function openProject(file) {
    if (!file) return; need(file.size < 64 * 1024 * 1024, '工程超过 64 MiB 读取预算');
    const project = await core.parseProject(await file.text());
    const assetHash = await digest(JSON.stringify(project.asset));
    cancelCalculation(); state.project = project; state.assetHash = assetHash;
    state.region = Object.keys(regions).find(id => JSON.stringify(regionView(id, 1).roi) === JSON.stringify(project.view.roi)) || 'custom';
    const nativeWidth = (project.view.roi[2] - project.view.roi[0]) * project.asset.width;
    $('resolution').value = Math.abs(project.view.width / nativeWidth - 2) < .01 ? '2' : '1';
    if (!qualityAttached() && state.showReference) await toggleReference();
    updateAssetInfo(); syncCode(); updateQuality(); await renderCurrent(); status('工程已打开并由其完整函数参数重新计算。');
  }
  async function exportPNG() {
    await renderCurrent(); const frame = state.frame; need(frame?.project === state.project, '请先完成当前工程的计算');
    const blob = await new Promise(resolve => $('outputCanvas').toBlob(resolve, 'image/png')); need(blob, '浏览器 PNG 编码失败');
    download(blob, 'CRF_1_1_real_scene_' + frame.result.width + 'x' + frame.result.height + '.png');
    state.exports.push({kind: 'png', at: new Date().toISOString(), width: frame.result.width, height: frame.result.height, bytes: blob.size, projectHash: await core.contentHash(frame.project), rgbaSHA256: await digest(frame.result.data), source: 'computed_function_pixels'});
    status('PNG 已导出；保存的是当前函数求值的像素。');
  }
  function evidence() {
    return {schema: 'crf.quality_session.v1', version: '1.1.0-experimental.2', createdAt: new Date().toISOString(), assetFileSHA256: state.assetFileHash, reportFileMatched: state.qualityVerified, currentAssetMatchesBaseline: state.assetHash === state.baseAssetHash, currentOutputIsBaseline: currentBaseline(), referenceImageLoads: state.referenceLoads, referencePixelsPassedToWorker: false, qualityEvidence: qualityAttached() ? state.quality : null, view: state.project?.view, edits: state.project?.edits, runs: state.runs, exports: state.exports, feedback: state.project?.feedback || [], limitations: ['Per-reference appearance fitting; unseen-scene synthesis is not established.', '2x sampling does not establish unseen real-world detail.', 'Video uses an explicit 2D camera path; no learned natural dynamics.']};
  }
  async function exportVideo() {
    if (state.video) { state.videoCancelled = true; cancelCalculation(); return; }
    need(state.project, '尚无工程'); need(globalThis.CRFVideo09, '视频编码器不可用');
    state.video = true; state.videoCancelled = false; clearTimeout(state.editTimer); cancelCalculation();
    const project = state.project, width = Math.min(800, project.view.width), height = Math.max(1, Math.round(project.view.height * width / project.view.width));
    $('exportVideo').textContent = '取消视频导出'; busy(true, '准备视频编码');
    const controls = document.querySelectorAll('.viewbar button,.viewbar select,#exposure,#contrast,#saturation,#resetEdits,#resetView,#runCode,#openProject'); controls.forEach(c => c.disabled = true);
    try {
      const roi = project.view.roi;
      const result = await CRFVideo09.encode({width, height, fps: 24, duration: 5, renderFrame: async time => {
        if (state.videoCancelled) throw abort('视频导出已取消');
        const z = 1 + .08 * time / 5, rw = (roi[2] - roi[0]) / z, rh = (roi[3] - roi[1]) / z, cx = (roi[0] + roi[2]) / 2, cy = (roi[1] + roi[3]) / 2;
        const frameProject = core.withView(project, {width, height, roi: [cx - rw / 2, cy - rh / 2, cx + rw / 2, cy + rh / 2]});
        const frame = await calculate(frameProject); if (state.videoCancelled) throw abort('视频导出已取消'); return frameCanvas(frame);
      }, onProgress: p => { $('renderMessage').textContent = '逐帧求值与编码 · ' + p.completed + ' / ' + p.total; status('视频导出：' + p.completed + ' / ' + p.total + ' 帧'); }});
      need(!state.videoCancelled, '视频导出已取消');
      const report = {...result, blob: undefined, kind: 'video', at: new Date().toISOString(), scope: 'fixed_reference_conditioned_field_with_explicit_2d_camera_zoom', zoom: [1, 1.08], sourceProjectHash: await core.contentHash(project), referencePixelsPassedToWorker: false}; state.exports.push(report);
      for (const url of state.videoURLs) URL.revokeObjectURL(url); state.videoURLs = []; $('videoDownloads').replaceChildren();
      for (const [blob, filename, label] of [[result.blob, 'CRF_1_1_real_scene_5s.webm', '下载 5 秒镜头视频'], [new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}), 'CRF_1_1_real_scene_video.json', '下载视频计算记录']]) { const link = document.createElement('a'), url = URL.createObjectURL(blob); state.videoURLs.push(url); link.href = url; link.download = filename; link.textContent = label; $('videoDownloads').append(link); }
      $('videoDownloads').hidden = false; download(result.blob, 'CRF_1_1_real_scene_5s.webm'); status('5 秒镜头视频已逐帧计算并完成编码。场景外观固定。');
    } catch (error) { state.exports.push({kind: 'video', status: error.name === 'AbortError' || state.videoCancelled ? 'cancelled' : 'failed', message: error.message, at: new Date().toISOString()}); if (error.name === 'AbortError' || state.videoCancelled) status('视频已取消，未生成完整制品。'); else throw error; }
    finally { state.video = false; state.videoCancelled = false; $('exportVideo').textContent = '导出 5 秒镜头视频'; controls.forEach(c => c.disabled = false); busy(false); }
  }

  async function feedback(decision) {
    need(state.project, '尚无工程'); const row = {at: new Date().toISOString(), decision, note: $('feedbackNote').value.trim(), view: copy(state.project.view), edits: copy(state.project.edits)};
    state.project = {...state.project, feedback: [...(state.project.feedback || []), row].slice(-100)}; delete state.project.contentHash;
    $('feedbackState').textContent = state.project.feedback.length + ' 条反馈；保存工程后保留。'; status('已记录视觉反馈。');
  }

  function bind() {
    listen('toggleReference', 'click', toggleReference);
    document.querySelectorAll('[data-region]').forEach(button => button.addEventListener('click', () => setRegion(button.dataset.region).catch(fail)));
    listen('resolution', 'change', () => setRegion(state.region));
    for (const name of ['exposure', 'contrast', 'saturation']) listen(name, 'input', () => setEdits());
    listen('resetEdits', 'click', async () => { state.project = core.applyEdits(state.project, {exposure: 0, contrast: 1, saturation: 1}); syncCode(); await renderCurrent(); });
    listen('resetView', 'click', async () => { $('resolution').value = '1'; state.project = core.applyEdits(state.project, {exposure: 0, contrast: 1, saturation: 1}); await setRegion('full'); });
    listen('cancelRender', 'click', () => { if (state.video) state.videoCancelled = true; cancelCalculation(); });
    listen('openProject', 'click', () => $('projectFile').click()); listen('projectFile', 'change', async () => { const file = $('projectFile').files[0]; $('projectFile').value = ''; await openProject(file); });
    listen('saveProject', 'click', saveProject); listen('exportPNG', 'click', exportPNG); listen('exportVideo', 'click', exportVideo);
    listen('exportEvidence', 'click', () => downloadJSON(evidence(), 'CRF_1_1_real_scene_evidence.json'));
    listen('showEvidence', 'click', () => showDialog('真实参考的质量测量', {scope: qualityAttached() ? 'Sealed native-resolution baseline; current edits are not re-scored.' : 'No matching quality evidence for the current asset.', contract: state.quality?.gates, evidence: qualityAttached() ? state.quality : null, current: {view: state.project?.view, edits: state.project?.edits}}));
    listen('showAssetInfo', 'click', () => showDialog('函数资产与来源', {assetSHA256: qualityAttached() ? state.assetFileHash : null, source: qualityAttached() ? state.quality?.source : state.project?.asset?.provenance, assetMetadata: state.project?.assetMetadata, representation: qualityAttached() ? state.quality?.representation : null, mathematicalForm: 'RGB(x,y)=clip(base+sum_i c_i exp(-q_i(x,y)/2)), q_i<=16', referenceImageRequiredAtRender: false, referenceConditioned: true}));
    listen('closeDialog', 'click', () => $('infoDialog').close());
    listen('downloadAsset', 'click', () => { need(state.project, '尚无工程'); downloadJSON(state.project.asset, 'CRF_1_1_gaussian_function.json'); });
    listen('reloadCode', 'click', syncCode);
    listen('sceneCode', 'input', () => { $('codeStatus').textContent = '待检查的参数修改'; });
    listen('runCode', 'click', async () => {
      const patch = JSON.parse($('sceneCode').value); need(patch && typeof patch === 'object' && !Array.isArray(patch), '参数应为 JSON 对象');
      const before = state.project; busy(true, '检查参数并计算候选');
      try {
        const result = await window.CRFQualityHarness12.propose({project: before, proposal: patch,
          render: candidate => calculate(candidate)});
        state.runs.push({kind: 'harness', ...result.run});
        if (!result.ok) throw Object.assign(new Error(result.error.message), {code: result.error.code});
        need(state.project === before, '参数检查期间工程已经改变；候选未覆盖当前画面。');
        state.project = result.project;
        state.region = JSON.stringify(result.project.view.roi) === '[0,0,1,1]' ? 'full' : 'custom';
        const sourceWidth = (result.project.view.roi[2] - result.project.view.roi[0]) * result.project.asset.width;
        $('resolution').value = Math.abs(result.project.view.width / sourceWidth - 2) < .01 ? '2' : '1';
        syncCode(); await renderCurrent(result.frame);
      } finally { if (state.project === before) busy(false); }
    });
    listen('acceptQuality', 'click', () => feedback('accepted')); listen('rejectQuality', 'click', () => feedback('needs_improvement'));
    window.addEventListener('beforeunload', () => { state.worker?.terminate(); for (const url of state.videoURLs) URL.revokeObjectURL(url); });
  }

  async function init() {
    need(core, '质量计算内核未加载'); bind();
    const [assetResult, qualityResult] = await Promise.allSettled([readText(ASSET_URL), readText(EVIDENCE_URL)]);
    if (assetResult.status !== 'fulfilled') throw assetResult.reason;
    const text = assetResult.value, asset = JSON.parse(text); state.assetFileHash = await digest(text);
    state.project = core.createProject(asset, {title: 'Lautersee · 全分辨率真实参考重建'}); state.sealedAsset = asset;
    state.baseAssetHash = state.assetHash = await digest(JSON.stringify(state.project.asset));
    if (qualityResult.status === 'fulfilled') {
      state.quality = JSON.parse(qualityResult.value); const expected = state.quality.asset?.sha256 || state.quality.assetSHA256;
      state.qualityVerified = typeof expected === 'string' && expected === state.assetFileHash;
    }
    updateAssetInfo(); updateQuality(); syncCode(); $('saveProject').disabled = false; await renderCurrent();
    if (!state.qualityVerified) status('函数已计算；质量报告缺失或资产摘要不匹配，未显示通过结果。', true);
  }
  init().catch(error => { busy(false); $('currentState').textContent = '载入失败'; $('qualityBadge').textContent = '未完成载入'; $('qualityBadge').classList.add('failed'); fail(error); });
})();
