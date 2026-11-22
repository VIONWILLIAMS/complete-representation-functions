import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {servePackedArchive09,findPackedArchive09,PACKED_ARCHIVE_MANIFEST09} from '../server/packed_archives09.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'crf-archive09-')),source=path.join(tmp,'web'),client=path.join(tmp,'client'),report=path.join(tmp,'report.json');
const made=spawnSync('python',['-c',`import pathlib,zipfile,shutil,random,sys
p=pathlib.Path(sys.argv[1]); s=p/'web';c=p/'client';s.mkdir();c.mkdir()
payload=random.Random(9181).randbytes(1100000)
for name,year in [('first.zip',2021),('second.zip',2023)]:
 with zipfile.ZipFile(s/name,'w',compression=zipfile.ZIP_DEFLATED) as z:
  info=zipfile.ZipInfo('shared/data.bin',(year,1,2,3,4,6));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,payload)
  z.writestr('note.txt',name+' 完整字节');z.comment=(name+' archive comment').encode()
 shutil.copy(s/name,c/name)
`,tmp],{encoding:'utf8'});assert.equal(made.status,0,made.stderr);
const packed=spawnSync('python',[path.join(root,'scripts/pack_archives09.py'),'--source',source,'--client',client,'--report',report],{encoding:'utf8'});assert.equal(packed.status,0,packed.stderr);
const result=JSON.parse(fs.readFileSync(report,'utf8')),manifest=result.manifest,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function binding(){const calls=[];return{calls,ASSETS:{fetch:async request=>{calls.push(request);const p=path.join(client,new URL(request.url).pathname);if(!fs.existsSync(p))return new Response('missing',{status:404});return new Response(fs.readFileSync(p));}}};}
const request=(p,options={})=>new Request('https://test.invalid'+p,options);

test('ZIP local metadata stays distinct while identical compressed payload is shared',()=>{
 assert.equal(result.stats.archiveCount,2);assert.ok(result.stats.savedBytes>1000000);assert.equal(result.stats.allArchivesByteExact,true);assert.equal(fs.existsSync(path.join(client,'first.zip')),false);
 assert.equal(fs.existsSync(path.join(source,'first.zip')),true);assert.equal(fs.existsSync(path.join(source,'second.zip')),true);assert.ok(result.stats.maxPackBytes<=4*1024*1024);
 assert.notEqual(manifest.files['/first.zip'].sha256,manifest.files['/second.zip'].sha256);
});
test('both public archive URLs stream every original byte and never forward client credentials',async()=>{
 const env=binding();for(const p of ['/first.zip','/second.zip']){const response=await servePackedArchive09(request(p,{headers:{Authorization:'Bearer secret-test',Cookie:'secret=test'}}),env,manifest);assert.equal(response.status,200);const actual=Buffer.from(await response.arrayBuffer()),original=fs.readFileSync(path.join(source,p));assert.deepEqual(actual,original);assert.equal(response.headers.get('Content-Length'),String(actual.length));assert.equal(response.headers.get('ETag'),`"sha256-${sha(original)}"`);}
 assert.ok(env.calls.length<=result.stats.packFiles,'Pack cache should reuse data');for(const r of env.calls){assert.equal(r.headers.get('Authorization'),null);assert.equal(r.headers.get('Cookie'),null);}
});
test('HEAD, cache validation, byte ranges, suffixes and unsatisfiable ranges preserve HTTP contract',async()=>{
 const env=binding(),bytes=fs.readFileSync(path.join(source,'first.zip')),url='/first.zip';
 const head=await servePackedArchive09(request(url,{method:'HEAD'}),env,manifest);assert.equal(head.status,200);assert.equal(head.body,null);assert.equal(env.calls.length,0);
 const conditional=await servePackedArchive09(request(url,{headers:{'If-None-Match':`W/"sha256-${sha(bytes)}"`}}),env,manifest);assert.equal(conditional.status,304);assert.equal(env.calls.length,0);
 for(const [range,start,end]of [['bytes=25-210',25,211],['bytes=-123',bytes.length-123,bytes.length],['bytes=100-',100,bytes.length]]){const res=await servePackedArchive09(request(url,{headers:{Range:range}}),env,manifest);assert.equal(res.status,206);assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes.subarray(start,end));assert.equal(res.headers.get('Content-Range'),`bytes ${start}-${end-1}/${bytes.length}`);}
 const invalid=await servePackedArchive09(request(url,{headers:{Range:'bytes=999999999-'}}),env,manifest);assert.equal(invalid.status,416);assert.equal(invalid.headers.get('Content-Range'),`bytes */${bytes.length}`);
 const noRange=await servePackedArchive09(request(url,{headers:{Range:'bytes=0-2','If-Range':'"old"'}}),env,manifest);assert.equal(noRange.status,200);assert.deepEqual(Buffer.from(await noRange.arrayBuffer()),bytes);
});
test('unmapped and malformed manifests fall through; corrupt packs return failure',async()=>{
 assert.deepEqual(PACKED_ARCHIVE_MANIFEST09,{});assert.equal(findPackedArchive09('/%bad',manifest),null);assert.equal(await servePackedArchive09(request('/unknown.zip'),binding(),manifest),null);
 assert.equal(await servePackedArchive09(request('/first.zip',{method:'POST'}),binding(),manifest),null);
 const invalid=structuredClone(manifest);invalid.files['/first.zip'].segments[0][1]=-1;assert.equal(findPackedArchive09('/first.zip',invalid),null);
 const env={ASSETS:{fetch:async()=>new Response('bad')}};const bad=await servePackedArchive09(request('/first.zip'),env,manifest);assert.equal(bad.status,502);
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
