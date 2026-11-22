(function () {
  'use strict';

  const REFERENCE_URL = 'assets/reference.png';
  const DOWNLOADS_URL = 'downloads/manifest.json';
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const paths = {
    scene: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m4 15 5-5 4 4 3-3 4 4"/><circle cx="16" cy="8" r="1"/>',
    import: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    export: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
    panelLeft: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    panelRight: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    cursor: '<path d="m5 3 14 9-7 1-3 7-4-17Z"/>',
    move: '<path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-9 3-3 3 3 3m3 3 3 3 3-3m3-9 3 3-3 3"/>',
    undo: '<path d="M8 7H3V2m0 5c6-7 18-1 17 7-.5 4-4 7-8 7"/>',
    redo: '<path d="M16 7h5V2m0 5C15 0 3 6 4 14c.5 4 4 7 8 7"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    arrowRight: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 3v7h7"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18M10 5c7-1 12 7 12 7a18 18 0 0 1-5 5M6 6a19 19 0 0 0-4 6s4 7 10 7l3-.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M9 10v7m6-7v7"/>',
    replace: '<path d="M4 7h14l-4-4m6 14H6l4 4M4 7v5m16 5v-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3V7Z"/><circle cx="12" cy="13" r="4"/>',
    relation: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5H5v5m7-5h7v5"/>',
    check: '<path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/>',
    timeline: '<path d="M3 5h18M3 12h18M3 19h18"/><rect x="7" y="2" width="3" height="6"/><rect x="15" y="9" width="3" height="6"/><rect x="5" y="16" width="3" height="6"/>',
    play: '<path d="m8 4 13 8-13 8V4Z"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
    skipBack: '<path d="M5 4v16m14-16L7 12l12 8V4Z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v.5"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.scene) + '</svg>'; }
  function fillIcons(root) { (root || document).querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
  fillIcons();

  const Core = window.CRFCore;
  let data = window.CRF_SCENE_DATA;
  const cases = Array.isArray(window.CRF_CASES) && window.CRF_CASES.length ? window.CRF_CASES : [{ id: 'street', title: '午后街角', kind: 'photo', global: 'CRF_SCENE_DATA', dataUrl: 'assets/scene-data.js', referenceUrl: REFERENCE_URL, description: '从像素观测到可编辑物品。', commands: ['把墙改成蓝色', '隐藏信号灯', '红灯变绿灯'] }];
  let currentCase = cases.find(item => item.id === 'street') || cases[0], switching = false;
  const caseCache = new Map(), dataPromises = new Map();
  let state, initial, renderer, activeCanvas = $('sceneCanvas'), cpuResult = null;
  let selectedId = 'signal.main', treeMode = 'objects', tool = 'select';
  let desiredQuality = 'exact', explicitQuality = false, lastStats = null, lastQuality = 'exact', lastTime = null;
  let renderPending = false, renderRequestId = 0, interaction = null, playing = false, recording = false, currentTime = null, animationId = 0;
  let undoStack = [], redoStack = [], sourcePixels = null, sourceError = null, firstPixels = null, baselineReport = null, pixelReport = null;
  let pixelDisplaySignature = null;
  let jsonObjectId = null, frameNumber = 0, initialized = false;
  let frameVideoCapability = null, videoExportStatus = null;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {});
  let sourceObjects = new Map((data && data.objects || []).map(o => [o.id, o]));
  const prototypeNames = { apple: '苹果', pear: '梨子', ellipse: '椭圆', rectangle: '矩形', triangle: '三角形', diamond: '菱形', ring: '圆环' };
  const historyLimit = 50;
  const defaultTimeline = { duration: 5, tracks: [
    { id: '$camera', path: 'yaw', interpolation: 'smooth', keyframes: [{ time: 0, value: 0 }, { time: 1.6, value: -7 }, { time: 3.5, value: 7 }, { time: 5, value: 0 }] },
    { id: '$camera', path: 'pitch', interpolation: 'smooth', keyframes: [{ time: 0, value: 0 }, { time: 2.5, value: 2 }, { time: 5, value: 0 }] },
    { id: '$camera', path: 'zoom', interpolation: 'smooth', keyframes: [{ time: 0, value: 1 }, { time: 1.6, value: 1.08 }, { time: 3.5, value: 1.08 }, { time: 5, value: 1 }] }
  ] };

  function toast(message, error) {
    const el = document.createElement('div'); el.className = 'toast' + (error ? ' error' : ''); el.textContent = message;
    $('toastRegion').appendChild(el); setTimeout(() => el.remove(), error ? 6500 : 3600);
  }
  function safe(fn) { return (...args) => { try { const result = fn(...args); if (result && result.catch) result.catch(e => toast(e.message, true)); return result; } catch (e) { toast(e.message, true); } }; }
  function selected() { return state && state.objects.find(o => o.id === selectedId && !o.deleted); }
  function colorHex(rgb) { return '#' + rgb.map(n => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')).join(''); }
  function fromHex(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
  function displayColor(o) { const src = sourceObjects.get(o.sourceId); return o.color.amount > 0 ? o.color.tint : o.prototype === 'apple' ? [188, 48, 36] : o.prototype === 'pear' ? [168, 179, 66] : src && src.statistics && src.statistics.meanRGB || [125, 148, 154]; }
  function getPath(object, path) { return path.split('.').reduce((v, k) => v && v[k], object); }
  function resampledGeometry(value) {
    const c = value.camera;
    return value.objects.some(o => !o.deleted && o.visible && (o.prototype === 'apple' || o.prototype === 'pear')) || c.yaw !== 0 || c.pitch !== 0 || c.panX !== 0 || c.panY !== 0 || c.zoom !== 1 || value.objects.some(o => {
      const t = o.transform; return t.x !== 0 || t.y !== 0 || t.z !== 0 || t.scaleX !== 1 || t.scaleY !== 1 || t.rotation !== 0;
    });
  }
  function geometrySignature(value) { return JSON.stringify([value.camera, value.objects.map(o => [o.id, o.transform])]); }
  function syncQuality(value, previous, force) {
    if (force || (previous && geometrySignature(value) !== geometrySignature(previous))) explicitQuality = false;
    if (!explicitQuality) {
      const effective = currentTime === null ? value : Core.evaluateFrame(value, currentTime);
      desiredQuality = resampledGeometry(effective) ? 'interactive' : 'exact';
    }
    $('qualitySelect').value = desiredQuality;
  }
  function saveHistory(previous) { undoStack.push(clone(previous)); if (undoStack.length > historyLimit) undoStack.shift(); redoStack = []; }
  function markChanged() { $('saveIndicator').textContent = '本地修改'; pixelReport = null; pixelDisplaySignature = null; $('pixelMAE').textContent = '—'; $('pixelExact').textContent = '待核验'; $('pixelCount').textContent = data.width + ' × ' + data.height + ' · 等待原尺寸核验'; $('pixelMessage').textContent = '场景已修改。重新核验可查看当前编辑与原图的差异。'; }
  function pixelFrameSignature(quality, time, width, height, lod) { return JSON.stringify([currentCase.id, quality, time, width, height, lod]); }
  function ensureSelection() { if (!selected()) selectedId = null; }
  function assertCompatible(next) {
    const check = Core.validateState(next);
    if (!check.valid) throw new Error(check.errors.join('；'));
    if (next.width !== data.width || next.height !== data.height) throw new Error('场景尺寸必须与配套观测一致：' + data.width + ' × ' + data.height);
    for (const o of next.objects) if (o.sourceId !== null && !sourceObjects.has(o.sourceId)) throw new Error('缺少源观测对象：' + o.sourceId);
  }
  function commit(next, options) {
    const opt = options || {}; if (switching) throw new Error('正在切换案例，请稍候。'); if (recording) throw new Error('视频录制中，请完成后再编辑。');
    assertCompatible(next); if (!opt.gesture) stopPlayback(false); currentTime = null;
    syncQuality(next, state, false);
    if (JSON.stringify(next) === JSON.stringify(state)) return clone(state);
    if (!opt.gesture && opt.history !== false) saveHistory(state);
    state = next; currentTime = null; ensureSelection(); markChanged(); updateUI(); requestRender(opt.interactive ? 'interactive' : null);
    return clone(state);
  }
  function applyOps(ops, options) { return commit(Core.applyOperations(state, ops), options); }
  function setState(next, options) { return commit(clone(next.state || next), options); }
  function undo() { if (!undoStack.length || recording) return; stopPlayback(false); redoStack.push(clone(state)); state = undoStack.pop(); currentTime = null; syncQuality(state, null, true); ensureSelection(); markChanged(); updateUI(); requestRender(); }
  function redo() { if (!redoStack.length || recording) return; stopPlayback(false); undoStack.push(clone(state)); state = redoStack.pop(); currentTime = null; syncQuality(state, null, true); ensureSelection(); markChanged(); updateUI(); requestRender(); }

  function selectObject(id) { if (!state.objects.some(o => o.id === id && !o.deleted)) return; selectedId = id; updateTree(); updateInspector(); drawSelection(); }
  function depthInTree(o) { let level = 0, p = o.parent; const seen = new Set(); while (p && !seen.has(p) && level < 5) { seen.add(p); ++level; p = (state.objects.find(x => x.id === p) || {}).parent; } return level; }
  function updateTree() {
    const tree = $('objectTree'), search = $('objectSearch').value.trim().toLowerCase(); tree.replaceChildren();
    const objects = state.objects.filter(o => !o.deleted); const ordered = [], seen = new Set();
    function add(o) { if (seen.has(o.id)) return; seen.add(o.id); ordered.push(o); objects.filter(x => x.parent === o.id).forEach(add); }
    objects.filter(o => !o.parent || !objects.some(p => p.id === o.parent)).forEach(add); objects.forEach(add);
    for (const o of ordered) {
      if (search && !o.label.toLowerCase().includes(search) && !o.id.toLowerCase().includes(search)) continue;
      const row = document.createElement('div'); row.className = 'tree-row' + (o.id === selectedId ? ' selected' : '') + (!o.visible ? ' is-hidden' : '');
      row.setAttribute('role', 'treeitem'); row.setAttribute('aria-selected', String(o.id === selectedId)); row.style.setProperty('--level', depthInTree(o)); row.dataset.objectId = o.id;
      const main = document.createElement('button'); main.className = 'tree-select'; main.title = o.id; main.type = 'button';
      const swatch = document.createElement('span'); swatch.className = 'tree-swatch'; swatch.style.background = colorHex(displayColor(o));
      const label = document.createElement('span'); label.className = 'tree-label'; label.textContent = o.label;
      const sub = document.createElement('span'); sub.className = 'tree-id'; sub.textContent = treeMode === 'functions' ? (o.prototype ? 'F · ' + o.prototype : currentCase.kind === 'procedural' ? 'F · 程序采样' : 'F · 观测高斯') : o.id;
      const texts = document.createElement('span'); texts.className = 'tree-text'; texts.append(label, sub); main.append(swatch, texts); main.addEventListener('click', () => selectObject(o.id));
      const visibility = document.createElement('button'); visibility.type = 'button'; visibility.className = 'tree-visibility'; visibility.innerHTML = icon(o.visible ? 'eye' : 'eyeOff');
      visibility.title = o.visible ? '隐藏 ' + o.label : '显示 ' + o.label; visibility.setAttribute('aria-label', visibility.title);
      visibility.addEventListener('click', safe(() => applyOps([{ op: 'set', id: o.id, path: 'visible', value: !o.visible }])));
      row.append(main, visibility); tree.appendChild(row);
    }
    if (!tree.childElementCount) { const empty = document.createElement('div'); empty.className = 'empty-note'; empty.textContent = '没有匹配的对象'; tree.appendChild(empty); }
    $('objectCount').textContent = String(objects.length); $('treeSummary').textContent = objects.length + ' 个对象 · ' + objects.filter(o => o.sourceId === null).length + ' 个新增原型';
  }
  function setValue(id, value) { const el = $(id); if (document.activeElement !== el) el.value = value; }
  function updateInspector() {
    const o = selected(); $('objectInspector').classList.toggle('no-selection', !o);
    $('objectInspector').querySelectorAll('input,select,button').forEach(el => { el.disabled = !o || recording; });
    $('selectedLabel').textContent = o ? o.label : '没有选择对象'; $('selectedId').textContent = o ? o.id : '从左侧选择或添加原型';
    if (o) {
      const hex = colorHex(displayColor(o)); $('selectedSwatch').style.background = hex; setValue('objectColor', hex); $('objectColorHex').textContent = hex.toUpperCase();
      setValue('colorAmount', o.color.amount); $('colorAmountValue').textContent = Math.round(o.color.amount * 100) + '%';
      setValue('objectX', o.transform.x); setValue('objectY', o.transform.y); setValue('objectScale', o.transform.scaleX); $('objectScaleValue').textContent = Math.round(o.transform.scaleX * 100) + '%';
      setValue('objectRotation', o.transform.rotation); setValue('objectDepth', o.depth); setValue('objectOpacity', o.opacity); $('objectOpacityValue').textContent = Math.round(o.opacity * 100) + '%';
      $('selectedVisibleButton').innerHTML = icon(o.visible ? 'eye' : 'eyeOff'); $('selectedVisibleButton').setAttribute('aria-pressed', String(o.visible));
      $('signalControls').hidden = o.sourceId !== 'signal.main'; document.querySelectorAll('[data-signal-state]').forEach(b => b.classList.toggle('active', b.dataset.signalState === o.signalState));
    } else $('signalControls').hidden = true;
    const isFruit = o && ['apple', 'pear'].includes(o.prototype); $('fruitControls').hidden = !isFruit;
    if (isFruit) { const g = Object.assign({ seed: 17, shape: 0, roughness: .28 }, o.generator); setValue('fruitSeed', g.seed); setValue('fruitShape', g.shape); setValue('fruitRoughness', g.roughness); $('fruitShapeValue').textContent = Number(g.shape).toFixed(2); $('fruitRoughnessValue').textContent = Number(g.roughness).toFixed(2); }
    const parentSelect = $('parentSelect'); parentSelect.replaceChildren(new Option('场景根节点', ''));
    state.objects.filter(p => !p.deleted && (!o || p.id !== o.id)).forEach(p => parentSelect.add(new Option(p.label, p.id)));
    parentSelect.value = o && o.parent || ''; parentSelect.disabled = !o || recording;
    const relations = $('relationsList'); relations.replaceChildren();
    if (o) {
      const children = state.objects.filter(x => !x.deleted && x.parent === o.id);
      for (const child of children) { const b = document.createElement('button'); b.className = 'relation-item'; b.textContent = child.label; b.addEventListener('click', () => selectObject(child.id)); relations.appendChild(b); }
      if (!children.length) { const p = document.createElement('p'); p.className = 'quiet-note'; p.textContent = '当前没有子对象'; relations.appendChild(p); }
    }
  }
  function updateUI() {
    updateTree(); updateInspector(); $('undoButton').disabled = !undoStack.length || recording; $('redoButton').disabled = !redoStack.length || recording;
    for (const el of document.querySelectorAll('[data-light]')) setValue(el.id, state.light[el.dataset.light]);
    $('lightExposureValue').textContent = state.light.exposure.toFixed(2) + ' EV'; $('lightTemperatureValue').textContent = state.light.temperature === 0 ? '中性' : (state.light.temperature > 0 ? '暖 ' : '冷 ') + Math.round(Math.abs(state.light.temperature) * 100) + '%';
    $('lightStrengthValue').textContent = Math.round(state.light.strength * 100) + '%';
    for (const el of document.querySelectorAll('[data-camera]')) setValue(el.id, state.camera[el.dataset.camera]);
    $('cameraYawValue').textContent = state.camera.yaw + '°'; $('cameraPitchValue').textContent = state.camera.pitch + '°'; $('cameraZoomValue').textContent = Math.round(state.camera.zoom * 100) + '%';
    const c = state.camera, viewMatches = p => Object.keys(p).every(key => Math.abs(p[key] - c[key]) < .00001), matched = Object.keys(viewPresets).find(key => viewMatches(viewPresets[key]));
    $('viewLabel').textContent = matched ? { reference: '原视角', left: '左侧观察', right: '右侧观察', elevated: '抬高观察' }[matched] : '自定义视角';
    document.querySelectorAll('[data-view]').forEach(b => { const p = viewPresets[b.dataset.view]; b.classList.toggle('active', !!p && viewMatches(p)); });
    $('qualitySelect').value = desiredQuality; $('timelineScrubber').max = state.timeline.duration;
    document.querySelector('.timeline-note').textContent = '相机轨迹 · ' + state.timeline.duration + ' 秒';
    document.querySelectorAll('.timeline-ticks span').forEach((el, i) => { el.textContent = (state.timeline.duration * i / 3).toFixed(state.timeline.duration % 3 ? 1 : 0) + ' s'; });
    updateTimecode(); $('caseSelect').disabled = recording || switching; $('showcaseButton').disabled = recording || switching;
  }

  function fitCanvas() {
    if (!data) return; const viewport = $('canvasViewport'), padding = innerWidth <= 760 ? 22 : 48;
    const mode = $('viewportZoom').value; const ratio = mode === 'fit' ? Math.min((viewport.clientWidth - padding) / data.width, (viewport.clientHeight - padding) / data.height) : Number(mode);
    const scale = Math.max(.08, ratio); $('canvasShell').style.width = data.width * scale + 'px'; $('canvasShell').style.height = data.height * scale + 'px';
    viewport.classList.toggle('zoomed', mode !== 'fit');
  }
  function requestRender(quality) {
    if (!initialized) return; if (renderPending) return;
    renderPending = true; renderRequestId = requestAnimationFrame(() => { renderPending = false; renderRequestId = 0; try { renderNow({ quality: quality || (interaction || playing ? 'interactive' : desiredQuality), time: currentTime }); } catch (e) { toast('渲染失败：' + e.message, true); } });
  }
  function renderNow(options) {
    if (renderRequestId) { cancelAnimationFrame(renderRequestId); renderRequestId = 0; renderPending = false; }
    const opt = options || {}, quality = opt.quality || desiredQuality, time = Object.prototype.hasOwnProperty.call(opt, 'time') ? opt.time : currentTime;
    const cpu = !renderer || renderer.backend !== 'webgl2-gaussian';
    const reduced = cpu && quality === 'interactive' && !opt.native && (playing || recording || interaction || opt.preview);
    const outputWidth = reduced ? Math.round(data.width / 2) : data.width, outputHeight = reduced ? Math.round(data.height / 2) : data.height;
    if (renderer && (renderer.width !== outputWidth || renderer.height !== outputHeight)) renderer.resize(outputWidth, outputHeight);
    if (!renderer && (activeCanvas.width !== outputWidth || activeCanvas.height !== outputHeight)) { activeCanvas.width = outputWidth; activeCanvas.height = outputHeight; }
    const started = performance.now(), lod = opt.lod || ((playing || interaction || opt.preview) ? 2 : 1);
    if (renderer) lastStats = renderer.render(state, { quality, time, lod });
    else {
      cpuResult = Core.CPUrender(data, state, { quality, time, width: outputWidth, height: outputHeight, lod });
      activeCanvas.getContext('2d').putImageData(new ImageData(cpuResult.rgba, cpuResult.width, cpuResult.height), 0, 0); lastStats = cpuResult.stats;
    }
    lastQuality = quality; lastTime = time; frameNumber++;
    const width = renderer ? renderer.width : cpuResult.width, height = renderer ? renderer.height : cpuResult.height;
    if (pixelDisplaySignature !== null && pixelDisplaySignature !== pixelFrameSignature(quality, time, width, height, lastStats.lod)) {
      pixelReport = null; pixelDisplaySignature = null;
      $('pixelMAE').textContent = '—'; $('pixelExact').textContent = '待核验';
      $('pixelCount').textContent = width + ' × ' + height + ' · 当前帧等待核验';
      $('pixelMessage').textContent = '当前帧、渲染精度或尺寸已变化。重新核验可查看当前画布与参考图的差异。';
    }
    $('canvasDimensions').textContent = width + ' × ' + height;
    const samplingWarning = quality === 'exact' && resampledGeometry(time === null ? state : Core.evaluateFrame(state, time || 0));
    $('qualityBadge').textContent = (quality === 'exact' ? '精确观测' : '交互 LOD ×' + (lastStats.lod || lod)) + (samplingWarning ? ' · 原采样模式' : reduced ? ' · 半尺寸预览' : (interaction || playing || recording) ? ' · 动态预览' : '');
    $('qualityBadge').classList.toggle('interactive', quality !== 'exact');
    $('renderTiming').textContent = Math.round(performance.now() - started) + ' ms / 帧';
    const backend = lastStats.backend || (renderer && renderer.backend) || 'cpu-gaussian';
    $('rendererStatus').textContent = backend.includes('webgl') ? 'WebGL 2 · Gaussian' : 'CPU 回退 · Gaussian';
    $('rendererStatus').title = lastStats.fallbackReason || '从观测高斯与可编辑函数求值；无参考图片叠层';
    $('engineDot').classList.toggle('warning', !backend.includes('webgl'));
    $('canvasLoading').hidden = true;
    $('canvasTip').innerHTML = icon(samplingWarning ? 'info' : tool === 'move' ? 'move' : 'cursor') + (samplingWarning ? '精确模式仅适合原采样 · 几何编辑推荐交互 LOD' : tool === 'move' ? '拖动画面移动对象 · 位移采用参考像素坐标' : '点击画面选择对象');
    drawSelection();
    return Object.assign({}, lastStats, { actualWidth: width, actualHeight: height, editorTime: time, frameNumber });
  }
  function readActualPixels() {
    if (renderer) return renderer.readPixels();
    if (!cpuResult) throw new Error('还没有渲染画布');
    const image = activeCanvas.getContext('2d').getImageData(0, 0, activeCanvas.width, activeCanvas.height);
    return { width: image.width, height: image.height, rgba: new Uint8ClampedArray(image.data) };
  }
  function drawSelection() {
    const canvas = $('selectionCanvas'), ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.dataset.visible = 'false';
    const base = selected(); if (!base || !base.visible || base.deleted || base.opacity <= 0 || recording || playing || switching) return;
    const evaluated = lastTime === null ? state : Core.evaluateFrame(state, lastTime || 0), o = evaluated.objects.find(x => x.id === base.id);
    if (!o || !o.visible || o.deleted || o.opacity <= 0) return;
    const byId = new Map(evaluated.objects.map(x => [x.id, x]));
    function h(obj) {
      const t = obj.transform, r = t.rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      let a = [c * t.scaleX, -s * t.scaleY, s * t.scaleX, c * t.scaleY], b = [obj.pivot[0] + t.x - a[0] * obj.pivot[0] - a[1] * obj.pivot[1], obj.pivot[1] + t.y - a[2] * obj.pivot[0] - a[3] * obj.pivot[1]], z = t.z, hidden = obj.deleted || !obj.visible || obj.opacity <= 0;
      if (obj.parent) { const parent = byId.get(obj.parent); if (!parent) return { a, b, z, hidden: true }; const p = h(parent), local = a; a = [p.a[0] * local[0] + p.a[1] * local[2], p.a[0] * local[1] + p.a[1] * local[3], p.a[2] * local[0] + p.a[3] * local[2], p.a[2] * local[1] + p.a[3] * local[3]]; b = [p.a[0] * b[0] + p.a[1] * b[1] + p.b[0], p.a[2] * b[0] + p.a[3] * b[1] + p.b[1]]; z += p.z + parent.depth - parent.restDepth; hidden = hidden || p.hidden; }
      return { a, b, z, hidden };
    }
    const transform = h(o); if (transform.hidden) return;
    const points = [[o.bbox[0], o.bbox[1]], [o.bbox[2], o.bbox[1]], [o.bbox[2], o.bbox[3]], [o.bbox[0], o.bbox[3]]].map(([u, v]) => Core.project([transform.a[0] * u + transform.a[1] * v + transform.b[0] - state.width / 2, state.height / 2 - transform.a[2] * u - transform.a[3] * v - transform.b[1], o.depth + transform.z + o.depthSlope[0] * (u - o.pivot[0]) + o.depthSlope[1] * (v - o.pivot[1])], evaluated));
    const cssScale = Math.max(.1, $('canvasShell').clientWidth / data.width); ctx.strokeStyle = '#65e6cd'; ctx.lineWidth = 1 / cssScale; ctx.setLineDash([5 / cssScale, 4 / cssScale]);
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    canvas.dataset.visible = 'true'; ctx.fillStyle = '#9ff6e4'; points.forEach(p => ctx.fillRect(p.x - 2 / cssScale, p.y - 2 / cssScale, 4 / cssScale, 4 / cssScale));
  }

  function loadReference() {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => { try {
        if (image.naturalWidth !== data.width || image.naturalHeight !== data.height) throw new Error('独立参考 PNG 尺寸不匹配');
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0); const raw = ctx.getImageData(0, 0, canvas.width, canvas.height);
        sourcePixels = { width: canvas.width, height: canvas.height, rgba: new Uint8ClampedArray(raw.data) };
        $('referenceStatus').textContent = currentCase.kind === 'procedural' ? '生成基准 · 已载入' : '参考 PNG · 已载入'; resolve(sourcePixels);
      } catch (e) { reject(e); } };
      image.onerror = () => reject(new Error('独立参考 PNG 加载失败；画布可编辑，但无法像素验收'));
      image.src = data.referenceImageDataURL || currentCase.referenceUrl || REFERENCE_URL;
    }).catch(error => { sourceError = error.message; $('referenceStatus').textContent = '参考 PNG · 未载入'; $('referenceStatus').title = error.message; $('baselineCheck').textContent = '初始观测：无法核验'; return null; });
  }
  function comparePixels(actual) {
    if (!sourcePixels) throw new Error(sourceError || '独立参考 PNG 尚未载入');
    const dimensionsMatch = actual.width === sourcePixels.width && actual.height === sourcePixels.height;
    const base = { schema: 'crf.pixel-check.v0.5', case_id: currentCase.id, reference_kind: currentCase.kind === 'procedural' ? 'generated_golden' : 'observed_photo', reference_source: 'independently-decoded-reference-png', reference_width: sourcePixels.width, reference_height: sourcePixels.height, actual_width: actual.width, actual_height: actual.height, dimensions_match: dimensionsMatch, resized: false, registered: false, blurred: false };
    if (!dimensionsMatch || actual.rgba.length !== sourcePixels.rgba.length) return Object.assign(base, { exact100: false, status: 'dimension_mismatch', mae: null, rmse: null, exact_pixel_count: 0, exact_pixel_fraction: 0 });
    let absolute = 0, squared = 0, maxError = 0, exactPixels = 0, exactChannels = 0;
    for (let i = 0; i < actual.rgba.length; i += 4) { let equal = true; for (let c = 0; c < 3; c++) { const error = Math.abs(actual.rgba[i + c] - sourcePixels.rgba[i + c]); absolute += error; squared += error * error; if (error > maxError) maxError = error; if (!error) exactChannels++; else equal = false; } if (equal) exactPixels++; }
    const count = actual.width * actual.height;
    return Object.assign(base, { status: 'measured', pixel_count: count, channel_count: count * 3, exact_pixel_count: exactPixels, exact_channel_count: exactChannels, exact_pixel_fraction: exactPixels / count, exact100: exactPixels === count && exactChannels === count * 3, mae: absolute / (count * 3), rmse: Math.sqrt(squared / (count * 3)), max_channel_error: maxError });
  }
  function showPixelReport(report) {
    pixelDisplaySignature = pixelFrameSignature(lastQuality, lastTime, report.actual_width, report.actual_height, lastStats && lastStats.lod);
    $('pixelMAE').textContent = report.mae === null ? '尺寸不符' : report.mae.toFixed(3);
    $('pixelExact').textContent = (report.exact_pixel_fraction * 100).toFixed(report.exact100 ? 0 : 3) + '%';
    $('pixelCount').textContent = report.exact_pixel_count.toLocaleString('zh-CN') + ' / ' + (report.pixel_count || 0).toLocaleString('zh-CN') + ' 像素 · ' + report.actual_width + ' × ' + report.actual_height;
    $('pixelMessage').textContent = report.exact100 ? (currentCase.kind === 'procedural' ? '当前画布与独立解码的生成基准一致；这是程序复现检查。' : '当前画布与独立参考 PNG 的每个 RGB 通道一致。此结果不证明真实三维。') : '这是当前编辑与原图的差异；换色、视角或交互 LOD 改变像素是预期结果。';
  }
  async function runPixelCheck(options) {
    await ready; if (recording) throw new Error('请在视频录制结束后核验固定画布');
    const opt = options || {}; stopPlayback(false); finishGesture(); renderNow({ quality: opt.quality || desiredQuality, time: currentTime, native: true });
    const report = Object.assign(comparePixels(readActualPixels()), { quality: lastQuality, time: lastTime, renderer: lastStats.backend, frame_number: frameNumber, baseline: baselineReport && clone(baselineReport) });
    pixelReport = report; showPixelReport(report); return clone(report);
  }

  const viewPresets = { reference: { yaw: 0, pitch: 0, panX: 0, panY: 0, zoom: 1 }, left: { yaw: -7, pitch: 0, panX: 0, panY: 0, zoom: 1.07 }, right: { yaw: 7, pitch: 0, panX: 0, panY: 0, zoom: 1.07 }, elevated: { yaw: 1.5, pitch: 6, panX: 0, panY: 0, zoom: 1.08 } };
  function setView(name) { if (!viewPresets[name]) throw new Error('未知视角'); explicitQuality = false; applyOps([{ op: 'setCamera', values: viewPresets[name] }]); requestRender(); }
  function setTool(value) { tool = value; $('selectTool').classList.toggle('active', value === 'select'); $('moveTool').classList.toggle('active', value === 'move'); $('selectTool').setAttribute('aria-pressed', String(value === 'select')); $('moveTool').setAttribute('aria-pressed', String(value === 'move')); $('canvasShell').classList.toggle('move-tool', value === 'move'); $('canvasTip').innerHTML = icon(value === 'move' ? 'move' : 'cursor') + (value === 'move' ? '拖动画面移动对象 · 位移采用参考像素坐标' : '点击画面选择对象'); }
  function canvasPoint(event) { const r = activeCanvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * activeCanvas.width / r.width, y: (event.clientY - r.top) * activeCanvas.height / r.height }; }
  function pick(point) { if (renderer) return renderer.pick(point.x, point.y); const i = Math.floor(point.y) * cpuResult.width + Math.floor(point.x), index = cpuResult.ids[i]; return (state.objects.find(o => o.index === index) || {}).id || null; }
  function beginGesture() { if (!interaction) { stopPlayback(false); interaction = { before: clone(state), changed: false }; } }
  function finishGesture() { if (!interaction) return; const previous = interaction.before, changed = JSON.stringify(previous) !== JSON.stringify(state); interaction = null; if (changed) saveHistory(previous); updateUI(); requestRender(); }
  function connectInput(el, operations, options) {
    const continuous = el.type === 'range';
    if (continuous) {
      el.addEventListener('input', safe(() => { beginGesture(); if (options && options.camera) desiredQuality = 'interactive'; applyOps(operations(el), { gesture: true, history: false, interactive: true }); }));
      el.addEventListener('change', finishGesture); el.addEventListener('blur', finishGesture);
    } else el.addEventListener('change', safe(() => applyOps(operations(el))));
  }

  function timeLabel(time) { return '00:' + Math.max(0, time).toFixed(2).padStart(5, '0'); }
  function updateTimecode() { const t = currentTime || 0; $('timecode').textContent = timeLabel(t) + ' / ' + timeLabel(state.timeline.duration); $('timelineScrubber').value = t; }
  function stopPlayback(renderAfter) { if (animationId) cancelAnimationFrame(animationId); animationId = 0; playing = false; $('playButton').innerHTML = icon('play'); $('playButton').setAttribute('aria-pressed', 'false'); if (renderAfter !== false && initialized) { syncQuality(state, null, false); requestRender(); } }
  function play() {
    if (recording) return; if (playing) { stopPlayback(); return; }
    finishGesture(); playing = true; $('playButton').innerHTML = icon('pause'); $('playButton').setAttribute('aria-pressed', 'true');
    const duration = state.timeline.duration, offset = currentTime !== null && currentTime < duration ? currentTime : 0, start = performance.now() - offset * 1000;
    function frame(now) { if (!playing) return; currentTime = Math.min(duration, (now - start) / 1000); updateTimecode(); renderNow({ quality: 'interactive', time: currentTime }); if (currentTime >= duration) stopPlayback(); else animationId = requestAnimationFrame(frame); }
    animationId = requestAnimationFrame(frame);
  }

  function parseCommand(command) {
    const text = command.trim().replace(/[，。！？!?.\s]/g, '');
    if (/^(红灯变绿灯|把红灯变成绿灯|信号灯变绿|绿灯)$/.test(text)) return [{ op: 'set', id: 'signal.main', path: 'signalState', value: 'go' }];
    if (/^(绿灯变红灯|信号灯变红|红灯)$/.test(text)) return [{ op: 'set', id: 'signal.main', path: 'signalState', value: 'stop' }];
    if (text === '斑马线加宽' && state.objects.some(o => o.id === 'crosswalk.main' && !o.deleted)) return [{ op: 'set', id: 'crosswalk.main', path: 'transform.scaleX', value: clamp(state.objects.find(o => o.id === 'crosswalk.main').transform.scaleX * 1.15, .025, 20) }];
    if (text === '光照暖一点' || text === '光照冷一点') return [{ op: 'setLight', values: { temperature: clamp(state.light.temperature + (text.includes('暖') ? .2 : -.2), -1, 1) } }];
    const aliases = { 墙: 'wall.main', 墙面: 'wall.main', 信号灯: 'signal.main', 红绿灯: 'signal.main', 斑马线: 'crosswalk.main', 杆: 'pole.main', 灯杆: 'pole.main', 道路: 'road.main', 人行道: 'sidewalk.main', 苹果: 'apple.photo', 梨子: 'pear.photo', 梨: 'pear.photo', 湖水: 'lake.main', 湖: 'lake.main', 天空: 'sky.main', 山: 'mountain.main', 森林: 'forest.main', 湖畔建筑: 'buildings.main' };
    const target = name => { if (name === '所选物品' || name === '所选对象') return selectedId; if (name === '果皮') return (selected() && ['apple', 'pear'].includes(selected().prototype) ? selected() : state.objects.find(o => !o.deleted && ['apple', 'pear'].includes(o.prototype)) || {}).id; const alias = aliases[name]; if (alias && state.objects.some(o => o.id === alias && !o.deleted)) return alias; const fruitType = /^(苹果)$/.test(name) ? 'apple' : /^(梨|梨子)$/.test(name) ? 'pear' : null; return (state.objects.find(o => !o.deleted && (o.label === name || o.id === name || (fruitType && o.prototype === fruitType))) || state.objects.find(o => !o.deleted && o.label.includes(name)) || {}).id; };
    const generated = text.match(/^(?:生成|添加)(?:一个)?(苹果|梨子?)$/); if (generated) { const prototype = generated[1] === '苹果' ? 'apple' : 'pear'; let n = 1; while (state.objects.some(o => o.id === 'fruit.' + n)) n++; return [{ op: 'addPrototype', id: 'fruit.' + n, label: prototypeNames[prototype], prototype, x: data.width * .5, y: data.height * .55, width: Math.min(data.width, data.height) * .3, height: Math.min(data.width, data.height) * .34, depth: 500 }]; }
    const replacement = text.match(/^(?:把)?(.+?)(?:换成|替换为|变成)(苹果|梨子?)$/); if (replacement) { const id = target(replacement[1]); if (!id) throw new Error('没有找到对象：' + replacement[1]); return [{ op: 'replace', id, prototype: replacement[2] === '苹果' ? 'apple' : 'pear' }]; }
    const visible = text.match(/^(隐藏|显示)(.+)$/); if (visible) { const id = target(visible[2]); if (!id) throw new Error('没有找到对象：' + visible[2]); return [{ op: 'set', id, path: 'visible', value: visible[1] === '显示' }]; }
    const colors = { 蓝色: [53, 119, 195], 红色: [208, 75, 64], 绿色: [70, 160, 104], 黄色: [222, 182, 70], 白色: [238, 239, 235], 黑色: [27, 30, 35], 紫色: [137, 97, 180], 橙色: [225, 141, 67], 青色: [54, 161, 168], 暖色: [227, 178, 131] };
    const recolor = text.match(/^把(.+?)(?:改成|变成|调成)(蓝色|红色|绿色|黄色|白色|黑色|紫色|橙色|青色|暖色)$/);
    if (recolor) { const id = target(recolor[1]); if (!id) throw new Error('没有找到对象：' + recolor[1]); return [{ op: 'set', id, path: 'color.tint', value: colors[recolor[2]] }, { op: 'set', id, path: 'color.amount', value: .7 }]; }
    const view = text.match(/^向(左|右)看(\d+(?:\.\d+)?)度$/); if (view) { const angle = Number(view[2]); if (angle > 15) throw new Error('示例视角限定在 15° 以内；更大范围可编辑 JSON。'); return [{ op: 'setCamera', values: { yaw: (view[1] === '左' ? -1 : 1) * angle } }]; }
    throw new Error('未识别这条示例语句。可用“把墙改成蓝色”“红灯变绿灯”等，或打开函数 JSON。');
  }
  function executeCommand(command) { const ops = parseCommand(command); if (ops.some(o => o.op === 'setCamera')) desiredQuality = 'interactive'; const next = applyOps(ops); toast('已执行：' + command); return { operations: clone(ops), state: next }; }

  function openJSON(scope) {
    stopPlayback(false); jsonObjectId = selectedId; $('jsonError').textContent = '';
    $('jsonScope').value = scope === 'object' ? 'object' : scope === 'operations' || scope === 'timeline' ? 'operations' : 'scene';
    loadJSONScope(); if (scope === 'timeline') $('jsonEditor').value = JSON.stringify([{ op: 'setTimeline', timeline: state.timeline }], null, 2);
    $('jsonDialog').showModal();
  }
  function loadJSONScope() {
    const scope = $('jsonScope').value; let value;
    if (scope === 'object') { const o = state.objects.find(o => o.id === jsonObjectId); if (!o) { $('jsonScope').value = 'scene'; return loadJSONScope(); } value = o; $('jsonDescription').textContent = '编辑对象生成参数。ID 保持不变；父级关系会继承位移、缩放、旋转和显隐。'; }
    else if (scope === 'operations') { value = selected() ? [{ op: 'set', id: selectedId, path: 'transform.x', value: selected().transform.x + 20 }] : []; $('jsonDescription').textContent = '操作数组原子应用。支持 set、addPrototype、duplicate、delete、replace、reparent、setCamera、setLight、setTimeline。'; }
    else { value = state; $('jsonDescription').textContent = '编辑完整对象、相机、光照、关系与轨迹；配套观测数据保持独立。'; }
    $('jsonEditor').value = JSON.stringify(value, null, 2); $('jsonError').textContent = '';
  }
  function applyJSON() {
    try {
      const parsed = JSON.parse($('jsonEditor').value), scope = $('jsonScope').value;
      if (scope === 'operations') applyOps(parsed);
      else if (scope === 'object') { if (parsed.id !== jsonObjectId) throw new Error('请保留对象 ID；新增对象请用 addPrototype 或 duplicate。'); const next = clone(state), index = next.objects.findIndex(o => o.id === jsonObjectId); if (index < 0) throw new Error('对象已不存在'); next.objects[index] = parsed; commit(next); }
      else setState(parsed);
      $('jsonDialog').close(); toast('JSON 已应用');
    } catch (e) { $('jsonError').textContent = e.message; }
  }
  function projectDocument() { return { schema: 'crf.project.v0.5', case_id: currentCase.id, reference: { scene_schema: data.schema, width: data.width, height: data.height, asset: currentCase.dataUrl || 'assets/scene-data.js', kind: currentCase.kind || 'photo' }, state: clone(state) }; }
  function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  function exportJSON(options) { const opt = options || {}, documentValue = projectDocument(), text = JSON.stringify(documentValue, null, 2), blob = new Blob([text], { type: 'application/json' }); if (opt.download !== false) downloadBlob(blob, opt.filename || 'crf-scene.json'); $('saveIndicator').textContent = '已导出 JSON'; return { document: documentValue, text, blob }; }
  async function importScene(value) { const parsed = typeof value === 'string' ? JSON.parse(value) : value; if (parsed.case_id && parsed.case_id !== currentCase.id) await switchCase(parsed.case_id); const next = setState(parsed); $('saveIndicator').textContent = '已导入'; toast('场景 JSON 已导入'); return next; }
  async function exportPNG(options) {
    await ready; const opt = options || {}; if (recording) throw new Error('请在视频录制结束后导出静图');
    stopPlayback(false); renderNow({ quality: opt.quality || desiredQuality, time: currentTime, native: true });
    const actual = readActualPixels(), canvas = document.createElement('canvas'); canvas.width = actual.width; canvas.height = actual.height;
    canvas.getContext('2d').putImageData(new ImageData(actual.rgba, actual.width, actual.height), 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 编码失败')), 'image/png'));
    if (opt.download !== false) downloadBlob(blob, opt.filename || 'crf-scene.png'); return { blob, width: actual.width, height: actual.height, quality: lastQuality };
  }
  function realtimeVideoSupport() {
    if (!window.MediaRecorder || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return { supported: false, reason: '此浏览器不支持 Canvas MediaRecorder。可导出 JSON，或下载已生成的视频示例。' };
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    return mimeType ? { supported: true, mimeType } : { supported: false, reason: '此浏览器没有可用的 WebM 编码器。' };
  }
  function videoSupport() {
    const realtime = realtimeVideoSupport();
    return { supported: !!(frameVideoCapability && frameVideoCapability.supported) || realtime.supported,
      preferred: 'framewise-webcodecs', framewise: frameVideoCapability || { supported: null, status: 'not_checked', moduleLoaded: !!window.CRFVideo }, realtime };
  }
  async function probeFrameVideo(fps) {
    if (!window.CRFVideo || typeof window.CRFVideo.capabilities !== 'function') return { supported: false, reason: '逐帧编码模块未载入' };
    const result = await window.CRFVideo.capabilities({ width: data.width, height: data.height, fps }); frameVideoCapability = clone(result); return result;
  }
  async function recordRealtimeVideo(fps, duration, capability) {
    let stream = null, recorder = null, recordRaf = 0, renders = 0, ended = false;
    try {
      const canvas = document.createElement('canvas'); currentTime = 0; renderNow({ quality: 'interactive', time: 0 });
      canvas.width = activeCanvas.width; canvas.height = activeCanvas.height; const ctx = canvas.getContext('2d', { alpha: false }); ctx.drawImage(activeCanvas, 0, 0);
      stream = canvas.captureStream(fps); const chunks = []; recorder = new MediaRecorder(stream, { mimeType: capability.mimeType, videoBitsPerSecond: 7000000 });
      const blob = await new Promise((resolve, reject) => {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = event => { ended = true; reject(new Error(event.error && event.error.message || '视频录制失败')); };
        recorder.onstop = () => { ended = true; resolve(new Blob(chunks, { type: capability.mimeType })); };
        const start = performance.now(); recorder.start(100);
        function frame(now) { if (ended || recorder.state === 'inactive') return; try { const elapsed = (now - start) / 1000; currentTime = Math.min(duration, elapsed); updateTimecode(); renderNow({ quality: 'interactive', time: currentTime }); ctx.drawImage(activeCanvas, 0, 0); renders++; $('saveIndicator').textContent = '实时录制 ' + currentTime.toFixed(1) + '/' + duration + ' s'; $('canvasTip').textContent = '实时录制（可能掉帧）'; videoExportStatus = { method: 'media-recorder-realtime', stage: 'recording', renderedFrames: renders, time: currentTime, requestedDuration: duration, targetFps: fps }; if (elapsed >= duration) recorder.stop(); else recordRaf = requestAnimationFrame(frame); } catch (e) { ended = true; if (recorder.state !== 'inactive') recorder.stop(); reject(e); } }
        recordRaf = requestAnimationFrame(frame);
      });
      if (!blob.size) throw new Error('浏览器返回了空视频');
      return { blob, method: 'media-recorder-realtime', width: canvas.width, height: canvas.height, targetFps: fps, requestedDuration: duration, renderedFrames: renders, frameCount: null, deterministicFrames: false, mimeType: capability.mimeType };
    } finally {
      ended = true; if (recordRaf) cancelAnimationFrame(recordRaf);
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch (_) {} }
      if (stream) stream.getTracks().forEach(track => track.stop());
    }
  }
  async function exportVideo(options) {
    await ready; const opt = options || {}; if (recording) throw new Error('已经在导出视频');
    const requestedFps = Number(opt.fps === undefined ? 24 : opt.fps);
    if (!Number.isFinite(requestedFps) || requestedFps <= 0) throw new Error('视频帧率必须为有限正数');
    const fps = clamp(requestedFps, 1, 60), duration = Math.min(state.timeline.duration, Number(opt.duration === undefined ? state.timeline.duration : opt.duration));
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('视频时长必须为正数');
    stopPlayback(false); finishGesture(); const previousTime = currentTime, previousQuality = desiredQuality, previousExplicit = explicitQuality;
    const totalFrames = Math.max(1, Math.round(duration * fps)); let result, fallbackReason = null;
    try {
      recording = true; updateUI(); $('exportVideoButton').disabled = true; $('playButton').disabled = true;
      $('saveIndicator').textContent = '检查逐帧编码'; videoExportStatus = { method: 'framewise-webcodecs', stage: 'checking', completed: 0, total: totalFrames };
      const capability = await probeFrameVideo(fps);
      if (capability.supported) {
        try {
          const encoded = await window.CRFVideo.encode({
            width: data.width, height: data.height, fps, duration,
            renderFrame: async (time, index) => {
              $('saveIndicator').textContent = '渲染第 ' + (index + 1) + '/' + totalFrames + ' 帧';
              videoExportStatus = { method: 'framewise-webcodecs', stage: 'render', completed: index, total: totalFrames, time, codec: capability.codec };
              await new Promise(resolve => requestAnimationFrame(resolve));
              currentTime = time; updateTimecode(); renderNow({ quality: 'interactive', time, native: true, lod: 1 });
              $('canvasTip').textContent = '逐帧导出 · ' + (index + 1) + '/' + totalFrames + ' 帧 · ' + data.width + ' × ' + data.height;
              return activeCanvas;
            },
            onProgress: progress => {
              videoExportStatus = Object.assign({ method: 'framewise-webcodecs' }, progress);
              if (progress.stage === 'mux') $('saveIndicator').textContent = '封装 WebM';
              else if (progress.stage === 'complete') $('saveIndicator').textContent = '视频编码完成';
            }
          });
          result = Object.assign({}, encoded, { method: 'framewise-webcodecs', deterministicFrames: true, targetFps: encoded.fps, requestedDuration: duration, renderedFrames: encoded.frameCount, mimeType: 'video/webm' });
        } catch (error) {
          if (error.name !== 'CRFVideoUnsupportedError') throw error;
          fallbackReason = error.message;
        }
      } else fallbackReason = capability.reason || '当前浏览器不支持所需的逐帧编码配置';
      if (!result) {
        const realtime = realtimeVideoSupport(); if (!realtime.supported) throw new Error((fallbackReason || '逐帧编码不可用') + '；' + realtime.reason);
        toast('逐帧编码不可用，使用实时录制（可能掉帧）'); $('saveIndicator').textContent = '实时录制（可能掉帧）';
        result = await recordRealtimeVideo(fps, duration, realtime); result.fallbackReason = fallbackReason;
      }
      if (!result.blob || !result.blob.size) throw new Error('视频编码器返回了空文件');
      videoExportStatus = { method: result.method, stage: 'complete', width: result.width, height: result.height, frameCount: result.frameCount, renderedFrames: result.renderedFrames, fps: result.fps || null, targetFps: result.targetFps, duration: result.duration || null, requestedDuration: result.requestedDuration, deterministicFrames: result.deterministicFrames, codec: result.codec || null, byteLength: result.blob.size, fallbackReason: result.fallbackReason || null };
      if (opt.download !== false) downloadBlob(result.blob, opt.filename || 'crf-camera.webm');
      toast(result.deterministicFrames ? '已导出 ' + result.frameCount + ' 帧 · ' + result.fps + ' fps · ' + result.duration + ' 秒 WebM' : '实时 WebM 已导出；此回退模式可能掉帧');
      return result;
    } catch (error) { videoExportStatus = Object.assign({}, videoExportStatus, { stage: 'error', error: error.message }); throw error; }
    finally {
      recording = false; currentTime = previousTime; desiredQuality = previousQuality; explicitQuality = previousExplicit;
      $('exportVideoButton').disabled = false; $('playButton').disabled = false; $('saveIndicator').textContent = '本地场景'; updateUI();
      try { renderNow({ quality: desiredQuality, time: currentTime }); } catch (error) { toast('导出已结束，恢复画布时出错：' + error.message, true); }
    }
  }
  async function showDownloads() {
    $('exportMenu').open = false; $('downloadsDialog').showModal(); const list = $('downloadsList'); list.textContent = '正在读取文件清单…';
    try { let manifest = window.CRF_DOWNLOAD_MANIFEST; if (!manifest) { const response = await fetch(DOWNLOADS_URL, { cache: 'no-store' }); if (!response.ok) throw new Error('下载清单尚未就绪'); manifest = await response.json(); } if (!['crf.downloads.v0.4', 'crf.downloads.v0.5'].includes(manifest.schema) || !Array.isArray(manifest.files)) throw new Error('下载清单格式无效'); list.replaceChildren();
      if (location.protocol === 'file:') { const note = document.createElement('p'); note.className = 'quiet-note'; note.textContent = '编辑器可离线运行；预制交付文件需联网。'; list.appendChild(note); }
      for (const file of manifest.files) { const url = new URL(file.url, location.href); if (!['http:', 'https:', 'file:'].includes(url.protocol)) continue; const a = document.createElement('a'); a.className = 'download-item'; a.href = file.url; a.download = file.filename; const name = document.createElement('span'); name.textContent = file.label || file.filename; const size = document.createElement('small'); size.textContent = Number.isFinite(file.size) ? (file.size / 1048576).toFixed(2) + ' MB' : '下载'; a.append(name, size); if (file.sha256) a.title = 'SHA-256 ' + file.sha256; list.appendChild(a); }
    } catch (e) { list.textContent = e.message + '。当前场景仍可通过上方菜单导出 PNG、WebM 和 JSON。'; }
  }

  function togglePanel(side, force) {
    const app = $('app'), mobile = side === 'left' ? innerWidth <= 1000 : innerWidth <= 760;
    const name = side + (mobile ? '-open' : '-closed'), shown = mobile ? app.classList.contains(name) : !app.classList.contains(name), next = force === undefined ? !shown : force;
    app.classList.toggle(name, mobile ? next : !next); $(side === 'left' ? 'toggleObjects' : 'toggleProperties').setAttribute('aria-expanded', String(next)); setTimeout(fitCanvas, 30);
  }
  function wireEvents() {
    $('undoButton').onclick = undo; $('redoButton').onclick = redo;
    $('resetButton').onclick = safe(() => { explicitQuality = false; desiredQuality = 'exact'; commit(clone(initial)); requestRender(); toast('已重置为初始场景，可撤销'); });
    $('selectTool').onclick = () => setTool('select'); $('moveTool').onclick = () => setTool('move');
    $('toggleObjects').onclick = () => togglePanel('left'); $('toggleProperties').onclick = () => togglePanel('right'); $('closeObjects').onclick = () => togglePanel('left', false); $('closeProperties').onclick = () => togglePanel('right', false);
    $('objectSearch').oninput = updateTree;
    $('objectsTab').onclick = () => { treeMode = 'objects'; $('objectsTab').classList.add('active'); $('functionsTab').classList.remove('active'); $('objectsTab').setAttribute('aria-selected', 'true'); $('functionsTab').setAttribute('aria-selected', 'false'); updateTree(); };
    $('functionsTab').onclick = () => { treeMode = 'functions'; $('functionsTab').classList.add('active'); $('objectsTab').classList.remove('active'); $('objectsTab').setAttribute('aria-selected', 'false'); $('functionsTab').setAttribute('aria-selected', 'true'); updateTree(); };
    $('selectedVisibleButton').onclick = safe(() => applyOps([{ op: 'set', id: selectedId, path: 'visible', value: !selected().visible }]));
    function newId(prefix) { let n = 1; while (state.objects.some(o => o.id === prefix + n)) n++; return prefix + n; }
    $('duplicateButton').onclick = safe(() => { const id = newId(selectedId + '.copy'); applyOps([{ op: 'duplicate', id: selectedId, newId: id, offset: [20, 20] }]); selectObject(id); });
    $('deleteButton').onclick = safe(() => applyOps([{ op: 'delete', id: selectedId }]));
    $('addPrototypeButton').onclick = safe(() => { const prototype = $('prototypeSelect').value, fruit = ['apple', 'pear'].includes(prototype), id = newId(fruit ? 'fruit.' : 'shape.'), size = fruit ? Math.min(data.width, data.height) * .3 : 100; const operation = { op: 'addPrototype', id, prototype, label: prototypeNames[prototype], x: data.width / 2, y: data.height * .55, width: size, height: fruit ? size * 1.12 : size, depth: 500 }; if (!fruit) operation.color = [91, 203, 174]; applyOps([operation]); selectObject(id); });
    $('replaceButton').onclick = safe(() => { if (!$('replaceSelect').value) throw new Error('先选择一个替换原型'); applyOps([{ op: 'replace', id: selectedId, prototype: $('replaceSelect').value }]); });
    $('objectColor').addEventListener('change', safe(() => applyOps([{ op: 'set', id: selectedId, path: 'color.tint', value: fromHex($('objectColor').value) }, { op: 'set', id: selectedId, path: 'color.amount', value: Math.max(.7, selected().color.amount) }])));
    for (const el of document.querySelectorAll('[data-object-path]')) connectInput(el, input => [{ op: 'set', id: selectedId, path: input.dataset.objectPath, value: Number(input.value) }]);
    connectInput($('objectScale'), el => [{ op: 'set', id: selectedId, path: 'transform.scaleX', value: Number(el.value) }, { op: 'set', id: selectedId, path: 'transform.scaleY', value: Number(el.value) }]);
    for (const el of document.querySelectorAll('[data-generator]')) connectInput(el, input => [{ op: 'set', id: selectedId, path: 'generator.' + input.dataset.generator, value: Number(input.value) }]);
    for (const el of document.querySelectorAll('[data-light]')) connectInput(el, input => [{ op: 'setLight', values: { [input.dataset.light]: Number(input.value) } }]);
    for (const el of document.querySelectorAll('[data-camera]')) connectInput(el, input => [{ op: 'setCamera', values: { [input.dataset.camera]: Number(input.value) } }], { camera: true });
    document.querySelectorAll('[data-signal-state]').forEach(b => b.onclick = safe(() => applyOps([{ op: 'set', id: selectedId, path: 'signalState', value: b.dataset.signalState }])));
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = safe(() => setView(b.dataset.view)));
    $('parentSelect').onchange = safe(() => applyOps([{ op: 'reparent', id: selectedId, parent: $('parentSelect').value || null }]));
    $('qualitySelect').onchange = () => { explicitQuality = true; desiredQuality = $('qualitySelect').value; requestRender(); if (desiredQuality === 'exact' && resampledGeometry(currentTime === null ? state : Core.evaluateFrame(state, currentTime))) toast('精确观测仅适合原采样；移动、缩放、旋转和新视角推荐交互 LOD。'); };
    $('viewportZoom').onchange = fitCanvas;
    $('commandForm').onsubmit = safe(event => { event.preventDefault(); if (!$('commandInput').value.trim()) return; executeCommand($('commandInput').value); });
    $('functionButton').onclick = () => openJSON('scene'); $('objectJSONButton').onclick = () => openJSON('object'); $('relationsJSONButton').onclick = () => openJSON('scene'); $('timelineJSONButton').onclick = () => openJSON('timeline');
    $('jsonScope').onchange = loadJSONScope; $('closeJSONButton').onclick = () => $('jsonDialog').close(); $('cancelJSONButton').onclick = () => $('jsonDialog').close(); $('applyJSONButton').onclick = applyJSON;
    $('formatJSONButton').onclick = () => { try { $('jsonEditor').value = JSON.stringify(JSON.parse($('jsonEditor').value), null, 2); $('jsonError').textContent = ''; } catch (e) { $('jsonError').textContent = e.message; } };
    $('caseSelect').onchange = safe(() => switchCase($('caseSelect').value)); $('showcaseButton').onclick = () => { updateShowcase(); $('showcaseDialog').showModal(); }; $('closeShowcaseButton').onclick = () => { $('showcaseVideo').pause(); $('showcaseDialog').close(); }; $('editCurrentCaseButton').onclick = () => { $('showcaseVideo').pause(); $('showcaseDialog').close(); }; $('showcaseDialog').addEventListener('close', () => $('showcaseVideo').pause());
    $('helpButton').onclick = () => $('helpDialog').showModal(); $('closeHelpButton').onclick = () => $('helpDialog').close();
    document.querySelectorAll('[data-command]').forEach(b => b.onclick = safe(() => { $('helpDialog').close(); $('commandInput').value = b.dataset.command; executeCommand(b.dataset.command); }));
    $('pixelCheckButton').onclick = safe(async () => { $('pixelCheckButton').disabled = true; try { await runPixelCheck({ render: true }); } finally { $('pixelCheckButton').disabled = false; } });
    $('playButton').onclick = safe(play); $('timelineStartButton').onclick = () => { stopPlayback(false); currentTime = null; syncQuality(state, null, false); updateTimecode(); requestRender(); };
    $('timelineScrubber').oninput = safe(() => { stopPlayback(false); currentTime = Number($('timelineScrubber').value); syncQuality(state, null, false); updateTimecode(); requestRender('interactive'); });
    $('timelineScrubber').onchange = () => { syncQuality(state, null, false); requestRender(); };
    $('importButton').onclick = () => $('importFile').click(); $('importFile').onchange = safe(async () => { const file = $('importFile').files[0]; if (!file) return; try { if (file.size > 5 * 1024 * 1024) throw new Error('场景 JSON 超过 5 MB；请导入状态文件，而不是观测数据包。'); await importScene(await file.text()); } finally { $('importFile').value = ''; } });
    $('exportPNGButton').onclick = safe(async () => { $('exportMenu').open = false; await exportPNG(); toast('PNG 已导出'); });
    $('exportJSONButton').onclick = safe(() => { $('exportMenu').open = false; exportJSON(); });
    $('exportVideoButton').onclick = safe(async () => { $('exportMenu').open = false; await exportVideo(); });
    $('downloadsButton').onclick = safe(showDownloads); $('closeDownloadsButton').onclick = () => $('downloadsDialog').close();
    for (const inputCanvas of [$('sceneCanvas'), $('cpuCanvas')]) {
    inputCanvas.addEventListener('pointerdown', safe(event => {
      if (inputCanvas !== activeCanvas || switching || !initialized || recording || event.button !== 0) return; const point = canvasPoint(event), id = pick(point); if (!id) return; selectObject(id);
      if (tool !== 'move') return; beginGesture(); interaction.drag = { pointerId: event.pointerId, start: { x: point.x * data.width / activeCanvas.width, y: point.y * data.height / activeCanvas.height }, x: selected().transform.x, y: selected().transform.y, id }; activeCanvas.setPointerCapture(event.pointerId); event.preventDefault();
    }));
    inputCanvas.addEventListener('pointermove', safe(event => { if (!interaction || !interaction.drag) return; const drag = interaction.drag, point = canvasPoint(event); applyOps([{ op: 'set', id: drag.id, path: 'transform.x', value: drag.x + (point.x * data.width / activeCanvas.width - drag.start.x) / state.camera.zoom }, { op: 'set', id: drag.id, path: 'transform.y', value: drag.y + (point.y * data.height / activeCanvas.height - drag.start.y) / state.camera.zoom }], { gesture: true, history: false, interactive: true }); }));
    inputCanvas.addEventListener('pointerup', finishGesture); inputCanvas.addEventListener('pointercancel', finishGesture);
    }
    document.addEventListener('keydown', safe(event => {
      if (event.target.closest('input,textarea,select') || document.querySelector('dialog[open]')) return;
      const key = event.key.toLowerCase(), mod = event.metaKey || event.ctrlKey;
      if (mod && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (mod && key === 'y') { event.preventDefault(); redo(); }
      else if (key === ' ') { event.preventDefault(); play(); }
      else if (key === 'delete' || key === 'backspace') { if (selected()) { event.preventDefault(); applyOps([{ op: 'delete', id: selectedId }]); } }
      else if (key === 'v') setTool('select'); else if (key === 'g') setTool('move');
    }));
    window.addEventListener('resize', fitCanvas); if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitCanvas).observe($('canvasViewport'));
  }

  window.CRFEditor = {
    version: '0.5', ready,
    getCases: () => clone(cases), getCurrentCase: () => clone(currentCase), switchCase,
    getState: () => clone(state), getInitialState: () => clone(initial),
    getStatus: () => ({ initialized, caseId: currentCase.id, switching, selectionVisible: !!($('selectionCanvas').dataset.visible === 'true'), renderer: lastStats && lastStats.backend, fallbackReason: renderer && renderer.fallbackReason, desiredQuality, activeQuality: lastQuality, dimensions: { width: activeCanvas.width, height: activeCanvas.height }, referenceLoaded: !!sourcePixels, referenceError: sourceError, recording, playing, selectedId, frameNumber, baseline: baselineReport && clone(baselineReport), pixelReport: pixelReport && clone(pixelReport), video: videoSupport(), videoExport: videoExportStatus && clone(videoExportStatus) }),
    applyOps, setState, importScene, render: renderNow, runPixelCheck,
    getPixels: readActualPixels, select: selectObject, setView, executeCommand,
    exportPNG, exportVideo, exportJSON, undo, redo,
    reset: () => { explicitQuality = false; desiredQuality = 'exact'; return commit(clone(initial)); },
    getRelations: () => state.objects.filter(o => !o.deleted && o.parent).map(o => ({ type: 'attached_to', child: o.id, parent: o.parent })),
    play, pause: () => stopPlayback(), seek: time => { stopPlayback(false); if (time !== null && (!Number.isFinite(time) || time < 0 || time > state.timeline.duration)) throw new Error('时间超出轨迹范围'); currentTime = time; syncQuality(state, null, false); updateTimecode(); return renderNow({ quality: time === null ? desiredQuality : 'interactive', time }); },
    setQuality: quality => { if (!['exact', 'interactive'].includes(quality)) throw new Error('未知精度'); explicitQuality = true; desiredQuality = quality; $('qualitySelect').value = quality; return renderNow({ quality, time: currentTime }); }
  };
  async function loadCaseData(item) {
    if (window[item.global || 'CRF_SCENE_DATA']) return window[item.global || 'CRF_SCENE_DATA'];
    if (!item.dataUrl) throw new Error('此案例没有配套观测数据');
    if (!dataPromises.has(item.id)) dataPromises.set(item.id, new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = item.dataUrl;
      script.onload = () => { const value = window[item.global]; if (!value) { dataPromises.delete(item.id); reject(new Error('案例数据未注册：' + item.id)); } else resolve(value); };
      script.onerror = () => { dataPromises.delete(item.id); script.remove(); reject(new Error('案例数据加载失败，请检查完整工程或网络连接')); };
      document.head.appendChild(script);
    }));
    return dataPromises.get(item.id);
  }
  function updateCaseUI() {
    const choices = $('caseSelect'); choices.replaceChildren(); cases.forEach(item => choices.add(new Option(item.title, item.id))); choices.value = currentCase.id;
    $('caseMeta').textContent = currentCase.subtitle || (currentCase.kind === 'procedural' ? '原生生成 · 可编辑材质与果形' : '独立照片 · ' + state.objects.filter(o => !o.deleted).length + ' 个语义对象');
    $('caseDescription').textContent = currentCase.description || '';
    $('viewContext').textContent = currentCase.kind === 'procedural' ? '函数生成的立体物品' : '单图深度假设';
    $('viewHypothesis').textContent = currentCase.kind === 'procedural' ? '果形、表面材质与遮挡由生成函数定义。视角展示代码构造的空间。' : '其他视角使用单图深度与遮挡补全假设；未观测区域不作为真实场景的像素验收。';
    $('commandInput').placeholder = (currentCase.commands && currentCase.commands.length ? '试试：' + currentCase.commands[0] : '输入示例语句或编辑函数 JSON');
    const commands = $('caseCommands'); commands.replaceChildren();
    (currentCase.commands || []).slice(0, 3).forEach(command => { const button = document.createElement('button'); button.textContent = command; button.addEventListener('click', safe(() => executeCommand(command))); commands.appendChild(button); });
    $('assetStatus').textContent = data.objects.length + (currentCase.kind === 'procedural' ? ' 个程序表面 · ' : ' 个观测对象 · ') + (data.width * data.height).toLocaleString('zh-CN') + ' 采样点';
    $('pixelCheckButton').innerHTML = icon('check') + (currentCase.kind === 'procedural' ? '比对生成基准' : '核验当前画布');
    $('playButton').setAttribute('aria-label', '播放 ' + state.timeline.duration + ' 秒相机动画');
    updateShowcase();
  }
  function updateShowcase() {
    const cards = $('caseCards'); cards.replaceChildren();
    cases.forEach(item => { const button = document.createElement('button'); button.className = 'case-card' + (currentCase.id === item.id ? ' active' : ''); button.setAttribute('aria-pressed', String(currentCase.id === item.id)); button.disabled = switching;
      const image = document.createElement('img'); image.src = item.thumbnail || item.referenceUrl || REFERENCE_URL; image.alt = ''; image.loading = 'lazy';
      const title = document.createElement('strong'); title.textContent = item.title; const type = document.createElement('small'); type.textContent = item.kind === 'procedural' ? '代码生成物品' : '照片观测案例'; button.append(image, title, type); button.addEventListener('click', safe(() => switchCase(item.id))); cards.appendChild(button);
    });
    $('showcaseTitle').textContent = currentCase.title; $('showcaseDescription').textContent = currentCase.description || '';
    const gallery = $('showcaseGallery'); gallery.replaceChildren();
    const items = currentCase.gallery && currentCase.gallery.length ? currentCase.gallery : [{ title: currentCase.kind === 'procedural' ? '生成基准' : '原始观测', url: currentCase.referenceUrl || REFERENCE_URL, view: 'reference', kind: currentCase.kind === 'procedural' ? 'generated' : 'reference' }];
    items.forEach(item => { const card = document.createElement('article'); card.className = 'gallery-card'; const image = document.createElement('img'); image.src = item.url; image.alt = currentCase.title + ' · ' + item.title; image.loading = 'lazy';
      const caption = document.createElement('div'); caption.className = 'gallery-caption'; const title = document.createElement('strong'); title.textContent = item.title; const kind = document.createElement('small'); kind.textContent = item.kind === 'reference' ? '原视角像素重建' : item.kind === 'generated' ? '原生函数生成' : '单图空间推演'; caption.append(title, kind);
      const actions = document.createElement('div'); actions.className = 'gallery-actions'; if (item.view && viewPresets[item.view]) { const view = document.createElement('button'); view.className = 'text-button'; view.textContent = '在画布查看'; view.addEventListener('click', safe(() => { $('showcaseVideo').pause(); $('showcaseDialog').close(); setView(item.view); })); actions.appendChild(view); }
      const link = document.createElement('a'); link.href = item.url; link.download = ''; link.textContent = '下载 PNG'; actions.appendChild(link); card.append(image, caption, actions); gallery.appendChild(card);
    });
    const video = currentCase.video; $('showcaseVideoSection').hidden = !video; const player = $('showcaseVideo');
    if (video) { if (player.getAttribute('src') !== video.url) { player.pause(); player.src = video.url; } player.poster = video.poster || currentCase.thumbnail || ''; $('showcaseVideoTitle').textContent = video.title || '5 秒场景运镜'; $('showcaseVideoDownload').href = video.url; }
    else { player.pause(); player.removeAttribute('src'); }
    const source = $('showcaseSource'); source.replaceChildren(); if (currentCase.source) { const text = document.createElement('span'); text.textContent = (currentCase.source.license || '') + ' · '; source.appendChild(text); const link = document.createElement('a'); link.textContent = currentCase.source.title || '参考来源'; link.href = currentCase.source.url || '#'; link.target = '_blank'; link.rel = 'noopener noreferrer'; source.appendChild(link); }
  }
  async function activateCase(item, first) {
    if (recording) throw new Error('视频生成结束后才能切换案例');
    if (switching) throw new Error('案例正在载入，请稍候');
    if (!first && item.id === currentCase.id) return clone(state);
    switching = true; $('caseSelect').disabled = true; $('showcaseButton').disabled = true; $('saveIndicator').textContent = '载入案例…';
    try {
      const nextData = await loadCaseData(item); Core.decodeData(nextData);
      let nextInitial = Core.applyOperations(Core.initialState(nextData), [{ op: 'setTimeline', timeline: item.timeline || defaultTimeline }]);
      if (Array.isArray(item.initialOps) && item.initialOps.length) nextInitial = Core.applyOperations(nextInitial, item.initialOps);
      if (!first && state) caseCache.set(currentCase.id, { state: clone(state), selectedId, undo: clone(undoStack), redo: clone(redoStack), baseline: baselineReport && clone(baselineReport) });
      stopPlayback(false); if (renderRequestId) cancelAnimationFrame(renderRequestId); renderRequestId = 0; renderPending = false; interaction = null; currentTime = null; initialized = false;
      if (renderer) renderer.dispose(); renderer = null; data = nextData; currentCase = item; sourceObjects = new Map((data.objects || []).map(o => [o.id, o])); initial = clone(nextInitial);
      const cached = caseCache.get(item.id); state = cached ? clone(cached.state) : nextInitial; selectedId = cached ? cached.selectedId : (item.selectedId || (state.objects.find(o => o.prototype === 'apple') || state.objects.find(o => o.id === 'signal.main') || state.objects[0] || {}).id || null);
      undoStack = cached ? clone(cached.undo) : []; redoStack = cached ? clone(cached.redo) : []; sourcePixels = null; sourceError = null; pixelReport = null; pixelDisplaySignature = null; baselineReport = cached && cached.baseline || null; frameVideoCapability = null; videoExportStatus = null; explicitQuality = false; desiredQuality = 'exact'; cpuResult = null;
      activeCanvas = $('sceneCanvas'); activeCanvas.hidden = false; $('cpuCanvas').hidden = true; $('canvasLoading').hidden = false;
      for (const canvas of [$('sceneCanvas'), $('cpuCanvas'), $('selectionCanvas')]) { canvas.width = data.width; canvas.height = data.height; }
      try { if (typeof window.CRFRenderer !== 'function') throw new Error('WebGL renderer 尚未载入'); renderer = new window.CRFRenderer(activeCanvas, data); renderer.resize(data.width, data.height); }
      catch (error) { activeCanvas.hidden = true; activeCanvas = $('cpuCanvas'); activeCanvas.hidden = false; $('rendererStatus').textContent = 'CPU 回退'; $('rendererStatus').title = error.message; }
      initialized = true; ensureSelection(); syncQuality(state, null, true); updateCaseUI(); updateUI(); fitCanvas();
      $('baselineCheck').textContent = currentCase.kind === 'procedural' ? '生成基准：待核验' : '初始观测：待核验'; $('pixelMAE').textContent = '—'; $('pixelExact').textContent = '待核验'; $('referenceStatus').textContent = '参考 PNG 载入中';
      const referencePromise = loadReference(); await new Promise(resolve => requestAnimationFrame(resolve)); renderNow({ quality: desiredQuality, time: null, lod: 1 }); firstPixels = readActualPixels(); await referencePromise;
      if (sourcePixels) {
        if (!baselineReport) { const baselineState = state; if (cached) { state = initial; renderNow({ quality: currentCase.kind === 'procedural' ? 'interactive' : 'exact', time: null, lod: 1 }); firstPixels = readActualPixels(); state = baselineState; } baselineReport = Object.assign(comparePixels(firstPixels), { quality: currentCase.kind === 'procedural' ? 'interactive' : 'exact', time: null, initial_observation_only: currentCase.kind !== 'procedural', true_3d_recovery: false }); }
        const prefix = currentCase.kind === 'procedural' ? '生成基准：' : '初始观测：'; $('baselineCheck').textContent = prefix + (baselineReport.exact100 ? '100% RGB 一致' : (baselineReport.exact_pixel_fraction * 100).toFixed(3) + '% 像素一致'); $('baselineCheck').classList.toggle('verified', baselineReport.exact100);
        if (cached) { renderNow({ quality: desiredQuality, time: null, lod: 1 }); pixelReport = comparePixels(readActualPixels()); showPixelReport(pixelReport); } else showPixelReport(baselineReport);
      }
      firstPixels = null; $('saveIndicator').textContent = cached ? '已恢复本次修改' : '已载入';
    } finally { switching = false; $('caseSelect').value = currentCase.id; $('caseSelect').disabled = recording; $('showcaseButton').disabled = recording; if (initialized) { updateShowcase(); drawSelection(); } }
    return clone(state);
  }
  async function switchCase(id) { await ready; const item = cases.find(c => c.id === id); if (!item) throw new Error('未知案例：' + id); return activateCase(item, false); }
  async function init() {
    if (!Core) throw new Error('核心程序未载入。请使用完整工程目录。');
    wireEvents(); await activateCase(currentCase, true); readyResolve(window.CRFEditor.getStatus());
  }
  init().catch(error => { $('canvasLoading').innerHTML = '<strong>编辑器未能启动</strong><span></span>'; $('canvasLoading').querySelector('span').textContent = error.message; $('rendererStatus').textContent = '初始化失败'; toast(error.message, true); readyReject(error); });
}());
