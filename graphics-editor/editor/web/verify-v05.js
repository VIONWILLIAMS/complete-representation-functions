/* Authored same-origin browser acceptance harness. It observes rendered pixels,
 * decodes independent PNG assets, and exercises the editor's public API. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  let report = null, running = false;
  const copy = value => JSON.parse(JSON.stringify(value));
  const yieldFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

  function requireCondition(condition, message, detail) {
    if (!condition) { const error = new Error(message); error.detail = detail; throw error; }
  }
  function compare(actual, expected) {
    const dimensionsMatch = actual.width === expected.width && actual.height === expected.height;
    if (!dimensionsMatch || actual.rgba.length !== expected.rgba.length) return {
      dimensionsMatch, exact100: false, actual: [actual.width, actual.height], expected: [expected.width, expected.height]
    };
    let exact = 0, absolute = 0, square = 0, maximum = 0, opaque = 0;
    for (let i = 0; i < actual.rgba.length; i += 4) {
      let same = true;
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(actual.rgba[i + c] - expected.rgba[i + c]);
        absolute += error; square += error * error; maximum = Math.max(maximum, error); if (error) same = false;
      }
      if (same) exact++; if (actual.rgba[i + 3] === 255) opaque++;
    }
    const total = actual.width * actual.height;
    return { dimensionsMatch: true, width: actual.width, height: actual.height, totalPixels: total,
      exactPixels: exact, changedPixels: total - exact, exact100: exact === total,
      mae: absolute / (total * 3), rmse: Math.sqrt(square / (total * 3)), maxAbsChannelError: maximum,
      opaquePixels: opaque, alphaHolePixels: total - opaque, colorSpace: 'decoded-sRGB-RGB8', resized: false, aligned: false, blurred: false };
  }
  function snapshot(editor) {
    const value = editor.getPixels();
    return { width: value.width, height: value.height, rgba: new Uint8ClampedArray(value.rgba) };
  }
  async function independentPNG(url) {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, rgba: context.getImageData(0, 0, canvas.width, canvas.height).data };
  }
  async function fileDigest(path) {
    if (!globalThis.crypto || !crypto.subtle) return { path, sha256: null, reason: 'SubtleCrypto unavailable' };
    const response = await fetch(path, { cache: 'no-store' }); if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
    const bytes = await response.arrayBuffer();
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return { path, bytes: bytes.byteLength, sha256: Array.from(hash, value => value.toString(16).padStart(2, '0')).join('') };
  }
  function updateResult() { byId('results').textContent = JSON.stringify(report, null, 2); }
  async function check(id, label, callback) {
    byId('status').textContent = '正在检验：' + label; byId('status').dataset.state = 'running';
    const row = document.createElement('li'); row.className = 'check'; row.textContent = '进行中 · ' + label; byId('checks').appendChild(row);
    await yieldFrame(); const start = performance.now(); let result;
    try { result = { id, label, pass: true, detail: await callback() }; }
    catch (error) { result = { id, label, pass: false, error: error.message, detail: error.detail || null }; }
    result.elapsedMs = Math.round(performance.now() - start); report.checks.push(result);
    row.dataset.pass = String(result.pass); row.textContent = (result.pass ? '通过 · ' : '失败 · ') + label + (result.pass ? '' : ' — ' + result.error);
    updateResult(); await yieldFrame(); return result;
  }
  async function editorReady() {
    const frame = byId('editor'), deadline = performance.now() + 45000;
    while (performance.now() < deadline) {
      const api = frame.contentWindow && frame.contentWindow.CRFEditor;
      if (api) { await api.ready; return api; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('编辑器在 45 秒内未就绪');
  }
  async function restore(editor, id) {
    await editor.switchCase(id); editor.reset(); editor.select(id === 'fruit_lab' ? 'apple.main' : id === 'street' ? 'signal.main' : id === 'orchard' ? 'apple.photo' : 'lake.main');
    return editor.render({ quality: id === 'fruit_lab' ? 'interactive' : 'exact', lod: 1, time: null, native: true });
  }
  function stableState(editor) { return JSON.stringify(editor.getState()); }
  async function run() {
    if (running) return; running = true; byId('run').disabled = true; byId('download').disabled = true; byId('checks').replaceChildren();
    const started = performance.now();
    report = { schema: 'crf.browser_verification.v0.5', status: 'running', startedAt: new Date().toISOString(),
      userAgent: navigator.userAgent, pageUrl: location.href, independentReferenceDecode: true,
      videoEncodeIncluded: false, claims: { referenceRGBOnly: true, generatedFruitReferenceIsPhoto: false, novelViewsHaveGroundTruth: false, gpuVerified: false }, checks: [] };
    updateResult(); let editor;
    try {
      editor = await editorReady(); const cases = editor.getCases(), rendererBackends = new Set();
      requireCondition(editor.version === '0.5', '没有加载 0.5 编辑器', { version: editor.version });
      report.caseIds = cases.map(item => item.id);
      report.artifactDigests = await Promise.all(['crf-core.js', 'crf-renderer.js', 'crf-fruit.js', 'editor.js', 'assets/cases.js'].map(fileDigest));
      for (const id of ['street', 'orchard', 'alpine', 'fruit_lab']) {
        await check('reference_' + id, id === 'fruit_lab' ? '水果：实际渲染与独立生成基准逐像素比较' : id + '：实际画布与独立参考 PNG 逐像素比较', async () => {
          const entry = cases.find(item => item.id === id); requireCondition(entry, '案例注册缺失：' + id);
          const stats = await restore(editor, id); rendererBackends.add(editor.getStatus().renderer);
          const reference = await independentPNG(entry.referenceUrl), actual = snapshot(editor), metrics = compare(actual, reference);
          requireCondition(metrics.exact100, '原尺寸 RGB 不完全一致', metrics);
          if (id === 'fruit_lab') {
            editor.render({ quality: 'interactive', lod: 1, time: null, native: true });
            const repeat = compare(snapshot(editor), actual); requireCondition(repeat.exact100, '同一生成状态重复渲染发生变化', repeat);
            return { referenceKind: 'generated_golden_not_photograph', metrics, deterministicRepeat: repeat, stats };
          }
          return { referenceKind: 'observed_photo', metrics, stats };
        });
      }
      await check('hidden_signal', '隐藏正面行人信号灯：选择框消失、填充不透明并报告推断像素', async () => {
        await restore(editor, 'street'); const before = snapshot(editor); editor.select('signal.main');
        const beforeSelection = editor.getStatus().selectionVisible;
        editor.applyOps([{ op: 'set', id: 'signal.main', path: 'visible', value: false }]);
        const stats = editor.render({ quality: 'exact', time: null, lod: 1, native: true }), status = editor.getStatus(), changed = compare(snapshot(editor), before);
        requireCondition(beforeSelection && !status.selectionVisible, '隐藏之后仍有选择框或前置选择未成功', { beforeSelection, afterSelection: status.selectionVisible });
        requireCondition(changed.alphaHolePixels === 0 && changed.changedPixels > 500, '移除后没有实际背景更新或存在 alpha 空洞', changed);
        requireCondition(stats.inferredGaussianCount > 0 && (stats.visibleInferredPixels === undefined || stats.visibleInferredPixels > 0), '没有报告背景推断数据', stats);
        return { selectionBefore: beforeSelection, selectionAfter: status.selectionVisible, difference: changed,
          inferredGaussianCount: stats.inferredGaussianCount, visibleInferredPixels: stats.visibleInferredPixels === undefined ? null : stats.visibleInferredPixels,
          backend: status.renderer, limitation: 'Alpha coverage and inferred-sample reporting do not establish hidden-wall ground truth or texture quality.' };
      });
      await check('case_restore', '切换案例后恢复各自修改，并保持参考尺寸独立', async () => {
        await restore(editor, 'street'); editor.applyOps([{ op: 'set', id: 'wall.main', path: 'color', value: { tint: [53, 119, 195], amount: .7 } }]);
        editor.render({ quality: 'exact', time: null, lod: 1, native: true }); const streetState = stableState(editor), streetPixels = snapshot(editor);
        await editor.switchCase('orchard'); requireCondition(editor.getState().width === 800 && editor.getState().height === 600, '实拍案例尺寸未更新');
        editor.applyOps([{ op: 'set', id: 'apple.photo', path: 'color', value: { tint: [62, 158, 87], amount: .64 } }]); const orchardState = stableState(editor);
        await editor.switchCase('street'); requireCondition(stableState(editor) === streetState, '街景修改未恢复');
        editor.render({ quality: 'exact', time: null, lod: 1, native: true }); const restoredPixels = compare(snapshot(editor), streetPixels); requireCondition(restoredPixels.exact100, '恢复状态后的实际像素不一致', restoredPixels);
        await editor.switchCase('orchard'); requireCondition(stableState(editor) === orchardState, '实拍案例修改未恢复');
        return { streetStateRestored: true, orchardStateRestored: true, streetPixelRepeat: restoredPixels, independentDimensions: [[667, 1000], [800, 600]] };
      });
      let replacedFruitPixels;
      await check('apple_to_pear', '苹果替换为梨子：保留对象 ID，实际画布变化', async () => {
        await restore(editor, 'fruit_lab'); const before = snapshot(editor), stateBefore = editor.getState(), apple = stateBefore.objects.find(o => o.id === 'apple.main');
        requireCondition(apple && apple.prototype === 'apple', '初始苹果对象缺失');
        editor.applyOps([{ op: 'replace', id: apple.id, prototype: 'pear' }]);
        editor.render({ quality: 'interactive', lod: 1, time: null, native: true }); replacedFruitPixels = snapshot(editor);
        const object = editor.getState().objects.find(o => o.id === apple.id), metrics = compare(replacedFruitPixels, before);
        requireCondition(object && object.id === apple.id && object.prototype === 'pear', '替换没有保留对象身份');
        requireCondition(editor.getState().objects.length === stateBefore.objects.length && metrics.changedPixels > 100, '替换没有改变实际画布或错误地增加了对象', metrics);
        return { stableId: object.id, beforePrototype: apple.prototype, afterPrototype: object.prototype, actualPixelDifference: metrics };
      });
      await check('generator_and_undo', '生成参数改变实际画布，撤销精确恢复上一画面', async () => {
        if (!replacedFruitPixels) { await restore(editor, 'fruit_lab'); replacedFruitPixels = snapshot(editor); }
        const beforeState = stableState(editor), beforePixels = snapshot(editor), item = editor.getState().objects.find(o => o.id === 'apple.main');
        const shape = item.generator && item.generator.shape || 0;
        editor.applyOps([{ op: 'set', id: 'apple.main', path: 'generator.shape', value: shape < .2 ? .27 : -.2 }]);
        editor.render({ quality: 'interactive', lod: 1, time: null, native: true }); const changed = compare(snapshot(editor), beforePixels);
        requireCondition(changed.changedPixels > 100, '修改生成参数没有改变画布', changed);
        editor.undo(); editor.render({ quality: 'interactive', lod: 1, time: null, native: true }); const undoPixels = compare(snapshot(editor), beforePixels);
        requireCondition(stableState(editor) === beforeState && undoPixels.exact100, '撤销没有精确恢复状态和画布', undoPixels);
        return { parameter: 'generator.shape', changedPixels: changed.changedPixels, undoStateEqual: true, undoPixelComparison: undoPixels };
      });
      await check('atomic_invalid_operation', '非法操作数组整体拒绝，状态与实际画布保持不变', async () => {
        await restore(editor, 'street'); const beforeState = stableState(editor), beforePixels = snapshot(editor); let rejected = false, message = null;
        try { editor.applyOps([{ op: 'set', id: 'wall.main', path: 'transform.x', value: 17 }, { op: 'set', id: 'missing.object.for.acceptance', path: 'opacity', value: .4 }]); }
        catch (error) { rejected = true; message = error.message; }
        editor.render({ quality: 'exact', lod: 1, time: null, native: true }); const metrics = compare(snapshot(editor), beforePixels);
        requireCondition(rejected && stableState(editor) === beforeState && metrics.exact100, '非法操作未被原子拒绝', { rejected, stateUnchanged: stableState(editor) === beforeState, metrics });
        return { rejected, rejection: message, stateUnchanged: true, actualPixelComparison: metrics };
      });
      await check('all_timelines', '四个案例均包含 5 秒运镜与 120 帧的导出配置', async () => {
        const values = [];
        for (const entry of cases) { await editor.switchCase(entry.id); const timeline = editor.getState().timeline;
          requireCondition(timeline.duration === 5 && timeline.tracks.some(track => track.id === '$camera' && track.keyframes.some(key => key.time > 0)), '案例缺少 5 秒相机轨迹', { id: entry.id, timeline });
          values.push({ caseId: entry.id, duration: timeline.duration, frameCountAt24fps: Math.round(timeline.duration * 24), cameraTracks: timeline.tracks.filter(track => track.id === '$camera').length });
        }
        return { cases: values, encodingActuallyPerformed: false, note: 'Frame count is the timeline configuration; encoded video metadata is checked separately.' };
      });
      await restore(editor, 'street');
      report.rendererBackends = Array.from(rendererBackends);
      report.claims.gpuVerified = report.checks.filter(item => item.id.startsWith('reference_')).every(item => item.pass) && rendererBackends.size === 1 && rendererBackends.has('webgl2-gaussian');
      report.editorFinalStatus = editor.getStatus();
      report.capabilities = { VideoEncoder: typeof VideoEncoder === 'function', VideoFrame: typeof VideoFrame === 'function', MediaRecorder: typeof MediaRecorder === 'function', browserVideoProbe: editor.getStatus().video };
      report.pass = report.checks.length === 10 && report.checks.every(item => item.pass); report.status = report.pass ? 'passed' : 'failed';
    } catch (error) { report.pass = false; report.status = 'failed'; report.fatalError = { message: error.message, detail: error.detail || null, stack: error.stack || null }; }
    finally {
      report.completedAt = new Date().toISOString(); report.elapsedMs = Math.round(performance.now() - started);
      report.passedChecks = report.checks.filter(item => item.pass).length; report.totalChecks = report.checks.length;
      byId('status').textContent = (report.pass ? '验收通过：' : '验收未通过：') + report.passedChecks + ' / ' + report.totalChecks + ' 项。' + (report.fatalError ? report.fatalError.message : '完整记录可下载。');
      byId('status').dataset.state = report.pass ? 'passed' : 'failed'; updateResult(); byId('run').disabled = false; byId('download').disabled = false; running = false;
    }
  }
  byId('run').addEventListener('click', run);
  byId('download').addEventListener('click', () => {
    if (!report) return; const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'crf_0_5_browser_verification.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
})();
