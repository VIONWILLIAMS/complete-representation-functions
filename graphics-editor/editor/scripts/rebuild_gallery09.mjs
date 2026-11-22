/** Rebuild the public gallery from all actual case reports, without API calls. */
import {args,safeName,verifyProtocol,updateShowcaseIndex} from './experiment_runtime09.mjs';
const options=args();
if(options.help){console.log('node scripts/rebuild_gallery09.mjs --run-id showcase-v1\nRebuilds from per-case reports. No credentials or API calls.');process.exit(0);}
const runId=safeName(options['run-id']||'showcase-v1'),{hash}=await verifyProtocol();
const value=await updateShowcaseIndex(runId,hash);
console.log(JSON.stringify({runId,attemptedTasks:value.attemptedTasks,renderedTasks:value.renderedTasks,failedTasks:value.failedTasks,source:'all_actual_per_case_records',apiCalls:0}));
