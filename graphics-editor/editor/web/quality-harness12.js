/* A bounded, source-free editing harness for a frozen visual function asset.
 * A human or an LLM may propose view/edits JSON. No arbitrary JS is evaluated.
 * A successful render is execution evidence, never a new reference-quality pass.
 */
(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./crf-quality12.js') : root.CRFQuality12;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CRFQualityHarness12 = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function (core) {
  'use strict';
  const fail = (code, message) => Object.assign(new Error(message), {code});
  const aborted = signal => { if (signal?.aborted) throw fail('CANCELLED', '编辑任务已取消。'); };
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
  function validateProposal(value) {
    if (!plain(value) || !Object.keys(value).length ||
        Object.keys(value).some(key => !['view', 'edits'].includes(key)))
      throw fail('EDIT_SCOPE', '仅支持 view 和 edits；函数资产、来源与质量契约保持冻结。');
    if (core.canonical(value).length > 8192) throw fail('PROPOSAL_LIMIT', '编辑参数超过 8 KiB。');
    return JSON.parse(core.canonical(value));
  }
  async function propose(options) {
    const run = {schema: 'crf.quality_harness_run.v1', version: core.VERSION,
      startedAt: new Date().toISOString(), status: 'running', providerCalls: 0,
      inputKind: 'declared_json_parameters', classification: 'L0_parameter_edit',
      sourcePixelsTransmitted: false, functionWeightsTransmitted: false,
      programRSI: false, referenceQualityReevaluated: false, checks: []};
    let snapshot;
    try {
      if (!plain(options)) throw fail('INVALID_INPUT', '编辑任务参数无效。');
      const proposal = validateProposal(options.proposal);
      // Capture all state before yielding; later UI changes cannot alter a run.
      snapshot = JSON.parse(core.canonical(options.project));
      const expected = options.baseProjectHash;
      aborted(options.signal);
      if (snapshot.contentHash) {
        const integrity = await core.verifyProject(snapshot);
        if (!integrity.ok) throw fail('HASH_MISMATCH', integrity.errors.join(' '));
      }
      snapshot = await core.sealProject(snapshot);
      run.baseProjectHash = snapshot.contentHash;
      if (expected !== undefined && expected !== run.baseProjectHash)
        throw fail('STALE_PROJECT', '工程已改变；请重新读取当前参数后提交。');
      run.proposalHash = await core.digest(proposal);
      run.qualityContractHash = snapshot.qualityContractHash || null;
      let candidate = snapshot;
      if (proposal.view !== undefined) candidate = core.withView(candidate, proposal.view);
      if (proposal.edits !== undefined) candidate = core.applyEdits(candidate, proposal.edits);
      candidate = await core.sealProject(candidate);
      aborted(options.signal);
      run.candidateProjectHash = candidate.contentHash;
      run.proposal = proposal;
      run.checks.push({id: 'base_integrity', status: 'passed'},
        {id: 'bounded_parameters', status: 'passed'},
        {id: 'immutable_function_and_quality_contract', status: 'passed'});
      if (options.render === false) {
        run.status = 'validated'; run.rendered = false;
        return {ok: true, project: candidate, run};
      }
      const start = performance.now();
      const frame = typeof options.render === 'function' ?
        await options.render(candidate, {signal: options.signal}) :
        await core.renderAsync(candidate, {shouldCancel: () => options.signal?.aborted === true});
      aborted(options.signal);
      if (!frame || frame.width !== candidate.view.width || frame.height !== candidate.view.height ||
          !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) ||
          frame.data.length !== frame.width * frame.height * 4)
        throw fail('INVALID_FRAME', '渲染没有返回当前工程尺寸的真实 RGBA8 帧。');
      run.rendered = true; run.renderMs = performance.now() - start;
      run.frame = {width: frame.width, height: frame.height,
        qualityScope: 'execution_and_dimensions_only_not_reference_acceptance'};
      run.checks.push({id: 'actual_frame', status: 'passed'});
      run.status = 'rendered';
      return {ok: true, project: candidate, frame, run};
    } catch (error) {
      run.status = error.code === 'CANCELLED' || error.name === 'AbortError' ? 'cancelled' : 'failed';
      run.error = {code: error.code || 'INVALID_PROPOSAL', message: String(error.message).slice(0, 1200)};
      run.retainedCurrentProject = true;
      return {ok: false, run, error: run.error};
    } finally { run.finishedAt = new Date().toISOString(); }
  }
  return {validateProposal, propose};
});
