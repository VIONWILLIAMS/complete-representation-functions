/* CRF 1.1: version-bound, bounded scene proposals with actual local rendering.
 * This harness never trains a model, changes a checker or claims program RSI.
 */
(function (root, factory) {
  const Core = typeof module === 'object' && module.exports ? require('./crf-core11.js') : root.CRF11;
  const api = factory(Core, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CRF11Harness = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function (Core, environment) {
  'use strict';
  const VERSION = '1.1.0-experimental.1', SCHEMA = 'crf.harness_run.v1.1';
  const clone = value => JSON.parse(Core.canonical(value));
  const clean = (value, max = 1600) => String(value ?? '').replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted]').slice(0, max);
  const fail = (code, message) => Object.assign(new Error(message), {code});
  function checkAbort(signal) {
    if (signal?.aborted) throw fail('CANCELLED', '任务已取消，当前工程保持不变。');
  }
  function validateScope(before, after, ids) {
    if (ids === undefined || ids === null) return;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !before.objects.some(x => x.id === id)))
      throw fail('INVALID_SCOPE', '请选择实际存在的对象。');
    const set = new Set(ids), oldIds = new Set(before.objects.map(x => x.id));
    for (const key of ['schema', 'width', 'height', 'background', 'seed']) {
      if (Core.canonical(before[key]) !== Core.canonical(after[key])) throw fail('EDIT_SCOPE_VIOLATION', '受保护画布属性被改变：' + key);
    }
    const next = new Map(after.objects.map(x => [x.id, x]));
    for (const object of before.objects) if (!set.has(object.id) &&
        (!next.has(object.id) || Core.canonical(object) !== Core.canonical(next.get(object.id))))
      throw fail('EDIT_SCOPE_VIOLATION', '受保护对象被改变：' + object.id);
    if (after.objects.some(x => !oldIds.has(x.id))) throw fail('EDIT_SCOPE_VIOLATION', '限定对象编辑不能添加范围外对象。');
    if (Core.canonical(before.objects.filter(x => !set.has(x.id)).map(x => x.id)) !==
        Core.canonical(after.objects.filter(x => !set.has(x.id)).map(x => x.id)))
      throw fail('EDIT_SCOPE_VIOLATION', '受保护对象的绘制顺序被改变。');
  }
  async function defaultProvider(body, options = {}) {
    const response = await environment.fetch('/api/crf/functions11/compose', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: options.signal
    });
    let value;
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder(); let bytes = 0, text = '';
      try {
        for (;;) {
          const item = await reader.read(); if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw fail('RESPONSE_LIMIT', '编排响应超过限制。'); }
          text += decoder.decode(item.value, {stream: true});
        }
        value = JSON.parse(text + decoder.decode());
      } finally { reader.releaseLock(); }
    } else value = await response.json();
    if (!response.ok && value?.ok !== false) throw fail('PROVIDER_HTTP', '编排服务请求失败：HTTP ' + response.status);
    return value;
  }
  function measuredFrame(frame) {
    if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
        frame.width < 1 || frame.height < 1 || frame.width * frame.height > 1048576 ||
        !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) ||
        frame.data.length !== frame.width * frame.height * 4) throw fail('INVALID_FRAME', '必须提供真实、尺寸一致的 RGBA8 渲染结果。');
    let alphaMin = 255, alphaMax = 0, sum = 0, nonzero = 0;
    for (let i = 0; i < frame.data.length; i += 4) {
      const a = frame.data[i + 3]; alphaMin = Math.min(alphaMin, a); alphaMax = Math.max(alphaMax, a);
      if (a) nonzero++;
      sum += .2126 * frame.data[i] + .7152 * frame.data[i + 1] + .0722 * frame.data[i + 2];
    }
    return {pixels: frame.width * frame.height, alphaRange: [alphaMin, alphaMax],
      nonzeroAlphaPixels: nonzero, meanEncodedLuminance: sum / (frame.width * frame.height * 255),
      scope: 'finite_rgba_measurements_not_semantic_or_visual_acceptance'};
  }
  async function propose(options) {
    const signal = options?.signal, observer = options?.onEvent,
      providerCall = options?.provider || defaultProvider, renderCall = options?.render;
    const started = performance.now(), run = {schema: SCHEMA, version: VERSION,
      id: 'run.' + (environment.crypto?.randomUUID?.() || Date.now().toString(36)),
      status: 'running', createdAt: new Date().toISOString(), events: [], checks: [],
      providerCalls: 0, apiOperations: [], usage: {providerCalls: 0, unknownUsageCalls: 0,
        usageComplete: true, total_tokens: 0, totalsScope: 'known_provider_reports_only', requests: []},
      classification: 'scene_composition', modelTraining: false, programRSI: false,
      formalProof: 'not_implemented', independentVisualReview: 'not_evaluated'};
    let snapshot = null, candidate = null;
    async function emit(type, detail = {}) {
      const event = {type, at: new Date().toISOString(), ...detail};
      run.events.push(event);
      try { await observer?.(clone(event)); }
      catch (error) { (run.observerErrors ||= []).push(clean(error.message, 300)); }
    }
    try {
      if (!options || typeof options !== 'object' || typeof options.prompt !== 'string' ||
          !options.prompt.trim() || options.prompt.length > 8000) throw fail('INVALID_INPUT', '请输入 1–8000 字符的目标。');
      // Copy all task data before the first await. UI/callback mutation cannot
      // change the scope or project after a contract was frozen.
      const intent = {prompt: options.prompt, mode: options.mode || 'compose',
        editableObjectIds: options.editableObjectIds === undefined ? null : clone(options.editableObjectIds)};
      snapshot = clone(options.project);
      checkAbort(signal);
      const integrity = await Core.verifyProject(snapshot);
      if (!integrity.ok) throw fail('INVALID_PROJECT', integrity.errors.join('; '));
      const mode = intent.mode;
      if (!['compose', 'edit'].includes(mode)) throw fail('INVALID_MODE', '模式必须为 compose 或 edit。');
      if (intent.editableObjectIds !== null && mode !== 'edit') throw fail('INVALID_SCOPE', '限定对象只适用于编辑。');
      validateScope(snapshot.scene, snapshot.scene, intent.editableObjectIds);
      const catalog = Object.values(snapshot.functions).map(Core.functionSummary);
      if (!catalog.length) throw fail('EMPTY_LIBRARY', '函数库为空，请先添加可执行函数。');
      run.baseRevision = snapshot.scene.revision;
      run.baseProjectSha256 = await Core.digest(snapshot);
      run.contract = {schema: 'crf.harness_contract.v1.1', prompt: intent.prompt, mode,
        sceneSha256: await Core.digest(snapshot.scene), functions: Object.keys(snapshot.functions).sort(),
        editableObjectIds: intent.editableObjectIds ? [...new Set(intent.editableObjectIds)] : null,
        budget: {apiOperations: 1, maxProviderCalls: 2, candidates: 1},
        checks: ['version_integrity', 'scene_schema', 'edit_scope', 'actual_frame'],
        qualityAcceptance: 'independent_review_required'};
      run.contractSha256 = await Core.digest(run.contract);
      run.context = {catalogBytes: new TextEncoder().encode(JSON.stringify(catalog)).length,
        fullFunctionBytes: new TextEncoder().encode(JSON.stringify(snapshot.functions)).length,
        measurement: 'serialized_utf8_bytes_not_provider_token_counts', weightsSubmitted: false};
      await emit('contract_frozen', {contractSha256: run.contractSha256, baseRevision: run.baseRevision});
      const body = {prompt: intent.prompt, currentScene: clone(snapshot.scene), catalog: clone(catalog), mode,
        ...(intent.editableObjectIds ? {editableObjectIds: clone(intent.editableObjectIds)} : {})};
      const op = {phase: 'compose', status: 'prepared', startedAt: new Date().toISOString()};
      run.apiOperations.push(op);
      checkAbort(signal);
      await emit('provider_started');
      checkAbort(signal);
      op.status = 'inflight';
      let response;
      try {
        response = await providerCall(body, {signal});
        op.status = 'responded'; op.finishedAt = new Date().toISOString();
      } catch (error) {
        op.status = 'outcome_unknown';
        run.providerCalls = null;
        run.usage = {providerCalls: null, usageComplete: false, unknownUsageCalls: null,
          totalsScope: 'no_provider_report_received', requests: [], unknownProviderOutcome: true};
        throw error;
      }
      if (!response || typeof response !== 'object') throw fail('INVALID_RESPONSE', '编排服务没有返回结构化结果。');
      run.usage = response.usage ? clone(response.usage) : {providerCalls: null, usageComplete: false,
        unknownUsageCalls: null, totalsScope: 'provider_usage_not_reported', requests: []};
      run.providerCalls = run.usage.providerCalls ?? null;
      run.provider = {runId: response.runId || null, model: response.model || null,
        attempts: clone(response.attempts || []), source: providerCall === defaultProvider ? 'configured_service' : 'injected_provider'};
      if (Number.isFinite(run.providerCalls) && run.providerCalls > run.contract.budget.maxProviderCalls)
        throw fail('PROVIDER_BUDGET_EXCEEDED', '供应商请求数量超过冻结预算。');
      if (response.ok === false) throw fail(response.error?.code || 'PROVIDER_FAILED', response.error?.message || '编排未完成。');
      checkAbort(signal);
      if (response.action === 'unsupported') throw fail('CAPABILITY_GAP', response.message || '当前函数库不能执行该目标。');
      if (response.action === 'scene' && response.scene) {
        const check = Core.validateScene(response.scene, catalog);
        if (!check.ok) throw fail('INVALID_SCENE', check.errors.join('; '));
        validateScope(snapshot.scene, response.scene, intent.editableObjectIds);
        candidate = Core.applyPatch(snapshot, {baseRevision: snapshot.scene.revision,
          operations: [{op: 'replaceScene', scene: response.scene}]});
      } else if (response.action === 'patch' && response.patch) {
        candidate = Core.applyPatch(snapshot, response.patch);
        validateScope(snapshot.scene, candidate.scene, intent.editableObjectIds);
      } else throw fail('INVALID_RESPONSE', '需要场景或经过检查的补丁。');
      if (await Core.digest(candidate.functions) !== await Core.digest(snapshot.functions))
        throw fail('REGISTRY_CHANGED', '候选不能改变冻结的函数版本库。');
      if (await Core.digest(run.contract) !== run.contractSha256) throw fail('CONTRACT_CHANGED', '冻结合约被改变。');
      run.checks.push({id: 'version_integrity', status: 'passed'}, {id: 'scene_schema', status: 'passed'}, {id: 'edit_scope', status: 'passed'});
      await emit('candidate_validated', {revision: candidate.scene.revision});
      checkAbort(signal);
      const renderStart = performance.now();
      const candidateDigest = await Core.digest(candidate);
      const frame = renderCall ? await renderCall(clone(candidate), {time: 0, backend: 'cached', samples: 1, signal}) :
        await Core.renderScene(candidate, {time: 0, backend: 'cached', samples: 1});
      checkAbort(signal);
      if (await Core.digest(candidate) !== candidateDigest) throw fail('CANDIDATE_CHANGED', '渲染期间候选被改变。');
      validateScope(snapshot.scene, candidate.scene, intent.editableObjectIds);
      const metrics = measuredFrame(frame);
      if (frame.width !== candidate.scene.width || frame.height !== candidate.scene.height)
        throw fail('FRAME_BINDING_MISMATCH', '渲染尺寸与当前候选画布不一致。');
      const sceneSha256 = await Core.digest(candidate.scene),
        functionVersions = [...new Set(candidate.scene.objects.map(x => x.functionRef))].sort();
      const reported = frame.descriptor || {};
      if (reported.schema !== 'crf.frame_descriptor.v1.1' || reported.rendererBuild !== Core.VERSION ||
          reported.colorSpace !== 'srgb' || reported.alpha !== 'straight_opaque_background' ||
          reported.sampling?.type !== 'joint_regular_subpixel' || reported.sampling?.samplesPerAxis !== 1 ||
          typeof reported.sceneDigest !== 'string' || !Array.isArray(reported.functionVersions))
        throw fail('INVALID_FRAME_DESCRIPTOR', '渲染器必须返回当前内核的完整帧描述符。');
      if ((reported.width !== undefined && reported.width !== frame.width) ||
          (reported.height !== undefined && reported.height !== frame.height) ||
          (reported.channels !== undefined && reported.channels !== 'RGBA8') ||
          (reported.sceneSha256 !== undefined && reported.sceneSha256 !== sceneSha256) ||
          (reported.sceneDigest !== undefined && reported.sceneDigest !== sceneSha256) ||
          (reported.time !== undefined && reported.time !== 0) ||
          (reported.backend !== undefined && reported.backend !== 'cached') ||
          (reported.functionVersions !== undefined && Core.canonical([...reported.functionVersions].sort()) !== Core.canonical(functionVersions)))
        throw fail('FRAME_BINDING_MISMATCH', '渲染描述符与候选版本、时间或输出协议不一致。');
      const descriptor = {...reported, width: frame.width, height: frame.height, channels: 'RGBA8',
        sceneSha256, functionVersions};
      const pixelSha256 = await Core.digestBytes(new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
      run.frame = {width: frame.width, height: frame.height, descriptor, pixelSha256,
        sha256: await Core.digest({descriptor, pixelSha256}), metrics,
        diagnostics: clone(frame.diagnostics || {}), elapsedMs: performance.now() - renderStart,
        source: renderCall ? 'injected_renderer' : 'shared_core11',
        executionEvidence: renderCall ? 'caller_supplied_version_checked_frame' : 'local_core_execution'};
      run.checks.push({id: 'actual_frame', status: 'passed', evidenceSha256: run.frame.sha256});
      run.candidateSceneSha256 = await Core.digest(candidate.scene);
      run.message = clean(response.message);
      run.warnings = (response.warnings || []).map(x => clean(x, 600));
      run.limitations = (response.limitations || []).map(x => clean(x, 600));
      run.status = 'review_required';
      await emit('rendered', {frameSha256: run.frame.sha256, elapsedMs: run.frame.elapsedMs});
      checkAbort(signal);
      await emit('ready_for_review', {independentVisualReview: run.independentVisualReview});
      checkAbort(signal);
    } catch (error) {
      run.status = signal?.aborted || error.code === 'CANCELLED' ? 'cancelled' :
        ['NOT_CONFIGURED', 'CAPABILITY_GAP', 'EMPTY_LIBRARY', 'PROVIDER_BUDGET_EXCEEDED'].includes(error.code) ? 'blocked' : 'failed';
      run.error = {code: signal?.aborted ? 'CANCELLED' : error.code || 'HARNESS_FAILED', message: clean(error.message || error)};
      await emit('task_stopped', {status: run.status, error: run.error});
      candidate = null;
    }
    run.finishedAt = new Date().toISOString(); run.elapsedMs = performance.now() - started;
    return {project: candidate || snapshot || options?.project, run};
  }
  return {VERSION, SCHEMA, propose, defaultProvider, validateScope, measuredFrame};
});
