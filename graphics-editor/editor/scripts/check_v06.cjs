#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'reports/v06');fs.mkdirSync(out,{recursive:true});
const tests=['tests/test_core.cjs','tests/test_boundary_v05.cjs','tests/test_fruit.cjs','tests/test_program06.cjs','tests/test_observation06.cjs','tests/test_integration06.cjs'];
const result=cp.spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
const log=result.stdout+'\n'+(result.stderr||'');fs.writeFileSync(path.join(out,'tests.tap'),log);
const value=name=>{const m=log.match(new RegExp('^# '+name+' (\\d+(?:\\.\\d+)?)','m'));return m?Number(m[1]):null;};
const files=['web/crf-program.js','web/crf-program-renderer.js','web/crf-observation.js','web/crf-scenes06.js','web/crf-ai-tools06.js','web/editor06.js','web/crf-video.js','web/assets/v06/observed-fruit.js',...tests];
const report={schema:'crf.test_acceptance.v0.6',recordedAt:new Date().toISOString(),command:['node','--test','--test-reporter=tap',...tests],exitCode:result.status,total:value('tests'),passed:value('pass'),failed:value('fail'),skipped:value('skipped'),durationMs:value('duration_ms'),pass:result.status===0&&value('fail')===0&&value('tests')>0,sourceHashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))};
fs.writeFileSync(path.join(out,'tests.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(!report.pass){console.error(log);process.exitCode=1;}
