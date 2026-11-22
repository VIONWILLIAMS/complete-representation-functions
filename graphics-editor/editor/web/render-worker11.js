/* Shared 1.1 CPU runtime; immutable project snapshots are verified by the core. */
'use strict';
importScripts('learn11.js', 'crf-gaussian08.js', 'crf-gaussian10.js', 'crf-core11.js');
const runtimes = new Map();
self.onmessage = async function (event) {
  const message = event.data || {}, {id, projectKey, project, options = {}} = message;
  try {
    if (message.operation === 'clear') { runtimes.clear(); self.postMessage({id, ok:true}); return; }
    if (message.operation !== 'render' || typeof projectKey !== 'string' || projectKey.length > 180) throw new Error('Invalid render request.');
    let entry = runtimes.get(projectKey);
    if (!entry) {
      if (!project) throw new Error('Project snapshot is missing; resend the current project.');
      entry = {signature:CRF11.canonical(project), revision:project.scene.revision,
        runtime:CRF11.createRuntime(project, {cacheResolution:64})};
      runtimes.set(projectKey, entry);
      while (runtimes.size > 3) runtimes.delete(runtimes.keys().next().value);
    }
    if ((project && entry.signature !== CRF11.canonical(project)) || message.revision !== entry.revision) throw new Error('The render key refers to a different immutable project snapshot.');
    const compiled = await entry.runtime, started = performance.now(), frame = compiled.render(options);
    const data = new Uint8ClampedArray(frame.data);
    self.postMessage({id, ok:true, projectKey, revision:message.revision, ...frame, data,
      milliseconds:performance.now() - started, runtimeTrace:compiled.trace}, [data.buffer]);
  } catch (error) {
    runtimes.delete(projectKey);
    self.postMessage({id, ok:false, projectKey, revision:message.revision,
      error:String(error.message || error).replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted]').slice(0,1000)});
  }
};
