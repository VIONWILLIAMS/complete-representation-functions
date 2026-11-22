/* Direct parameter computation only. No photograph requests or RGB cache. */
'use strict';
importScripts('crf-quality12.js');
let pending = null, active = null, generation = 0, pumping = false;
function send(message, transfer) { self.postMessage(message, transfer || []); }
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (pending) {
      const job = pending; pending = null; active = job;
      const cancelled = () => job.cancelled || job.generation !== generation;
      try {
        const project = job.project;
        if (project?.contentHash) {
          const integrity = await CRFQuality12.verifyProject(project);
          if (!integrity.ok) { const error = new Error(integrity.errors.join(' ')); error.code = integrity.code; throw error; }
        }
        if (cancelled()) { send({ type: 'cancelled', requestId: job.requestId }); continue; }
        const result = await CRFQuality12.renderAsync(project, { ...(job.options || {}), shouldCancel: cancelled,
          onProgress: progress => { if (!cancelled()) send({ type: 'progress', requestId: job.requestId, progress }); } });
        if (cancelled()) send({ type: 'cancelled', requestId: job.requestId });
        else send({ type: 'result', requestId: job.requestId, result }, [result.data.buffer]);
      } catch (error) {
        if (cancelled() || error.code === 'CANCELLED') send({ type: 'cancelled', requestId: job.requestId });
        else send({ type: 'error', requestId: job.requestId,
          error: { code: error.code || 'RENDER_ERROR', message: String(error.message || error).slice(0, 1000) } });
      } finally { if (active === job) active = null; }
    }
  } finally { pumping = false; }
}
self.onmessage = function (event) {
  const message = event.data || {};
  if (message.type === 'cancel') {
    if (message.requestId === undefined || active?.requestId === message.requestId) {
      if (active) active.cancelled = true;
    }
    if (pending && (message.requestId === undefined || pending.requestId === message.requestId)) {
      send({ type: 'cancelled', requestId: pending.requestId }); pending = null;
    }
    return;
  }
  const validId = (typeof message.requestId === 'string' && message.requestId.length > 0 && message.requestId.length <= 120) ||
    (typeof message.requestId === 'number' && Number.isSafeInteger(message.requestId));
  if (message.type !== 'render' || !validId) {
    send({ type: 'error', requestId: message.requestId,
      error: { code: 'INVALID_REQUEST', message: 'Expected render with a string or numeric requestId.' } });
    return;
  }
  generation++;
  if (pending) send({ type: 'cancelled', requestId: pending.requestId });
  pending = { requestId: message.requestId, project: message.project, options: message.options, generation };
  void pump();
};
