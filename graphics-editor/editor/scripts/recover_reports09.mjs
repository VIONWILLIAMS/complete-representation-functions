/** Re-export already saved task evidence and images. Never calls a provider. */
import {args,verifyProtocol,safeName,sha256,readSavedTrial09,exportTrial,updateShowcaseIndex} from './experiment_runtime09.mjs';
const options=args(),{protocol,hash}=await verifyProtocol(),runId=safeName(options['run-id']||'showcase-v1'),start=Number(options.start||1),limit=Number(options.limit||10);
if(options.help){console.log('node scripts/recover_reports09.mjs --run-id showcase-v1 --start 1 --limit 2\nRe-exports saved tasks, retains prior runner/export failures, does not resume work or call providers.');process.exit(0);}
if(!Number.isInteger(start)||start<1||start>10||!Number.isInteger(limit)||limit<1||limit>10)throw new Error('Invalid fixed task range');
for(const spec of protocol.showcase.slice(start-1,start-1+limit)){
 const saved=await readSavedTrial09({runId,specId:spec.id});if(!saved)throw new Error('Saved task missing: '+spec.id);
 if(saved.manifest.protocolSha256!==hash||saved.manifest.promptSha256!==sha256(spec.prompt))throw new Error('Saved task protocol mismatch: '+spec.id);
 if(saved.task.status==='running')throw new Error('Task still running: '+spec.id);
 const record=await exportTrial({runtime:saved.runtime,task:saved.task,spec,protocolHash:hash,runId});
 console.log(JSON.stringify({id:spec.id,status:record.status,error:record.error,providerRequests:record.usage.reduce((n,u)=>n+(u.requests?.length||0),0),totalTokens:record.usage.reduce((n,u)=>n+(u.total_tokens||0),0),historicalRunnerFailures:record.additionalRunnerFailures?.length||0,providerCallsMadeByRecovery:0}));
}
await updateShowcaseIndex(runId,hash);
