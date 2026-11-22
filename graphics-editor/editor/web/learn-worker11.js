/* Local CPU training worker. Closing the page terminates this worker. */
'use strict';
importScripts('learn11.js');
let active = null;
self.onmessage = async function (event) {
  const message = event.data || {};
  if (message.operation === 'cancel') { if (active && active.id === message.id) active.canceled = true; return; }
  if (message.operation !== 'train') { self.postMessage({ id: message.id, type: 'error', error: 'Unknown training worker operation.' }); return; }
  if (active) { self.postMessage({ id: message.id, type: 'error', error: 'A local training job is already running.' }); return; }
  const job = active = { id: message.id, canceled: false };
  try {
    const result = await CRFLearn11.train(message.dataset, message.config, {
      shouldCancel: () => job.canceled,
      onProgress: progress => self.postMessage({ id: job.id, type: 'progress', progress }),
      yieldControl: () => new Promise(resolve => setTimeout(resolve, 0))
    });
    if (job.canceled) self.postMessage({ id: job.id, type: 'canceled', report: { ...result.report, state: 'canceled' } });
    else self.postMessage({ id: job.id, type: 'result', result });
  } catch (error) {
    self.postMessage({ id: job.id, type: error.code === 'CANCELLED' ? 'canceled' : 'error', code: error.code || 'TRAINING_FAILED', error: String(error.message).slice(0, 800), report: error.report || null });
  } finally { if (active === job) active = null; }
};
