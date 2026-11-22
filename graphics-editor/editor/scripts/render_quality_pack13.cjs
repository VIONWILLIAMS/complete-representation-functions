#!/usr/bin/env node
'use strict';
// Dependency-free parameter-to-PNG renderer. The kit contains no reference photo.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const crypto = require('node:crypto');
const kernelPath = fs.existsSync(path.join(__dirname, '../web/crf-quality12.js')) ?
  path.join(__dirname, '../web/crf-quality12.js') : path.join(__dirname, 'crf-quality12.js');
const C = require(kernelPath);
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  return Buffer.concat([size, type, data, crc]);
}
function png(frame) {
  const header = Buffer.alloc(13); header.writeUInt32BE(frame.width); header.writeUInt32BE(frame.height,4);
  header[8]=8; header[9]=6;
  const row = frame.width*4, scanlines = Buffer.alloc((row+1)*frame.height);
  const rgba = Buffer.from(frame.data);
  for (let y=0;y<frame.height;y++) rgba.copy(scanlines,y*(row+1)+1,y*row,(y+1)*row);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header),
    chunk('sRGB',Buffer.from([0])),chunk('IDAT',zlib.deflateSync(scanlines,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
(async()=>{
  const [input, output, ...args] = process.argv.slice(2);
  if (!input || !output || args.length % 2) throw new Error('Usage: node render.cjs PROJECT.crf.json OUTPUT.png [--exposure 0.25] [--scale 1.5]');
  let project = await C.parseProject(fs.readFileSync(input,'utf8'));
  for (let i=0;i<args.length;i+=2) {
    const value=Number(args[i+1]);
    if (!Number.isFinite(value)) throw new Error('Option value must be finite');
    if (args[i]==='--exposure') project=C.applyEdits(project,{exposure:value});
    else if(args[i]==='--scale') project=C.withView(project,{...project.view,width:Math.round(project.view.width*value),height:Math.round(project.view.height*value)});
    else throw new Error('Unknown option '+args[i]);
  }
  const frame=C.render(project);
  fs.writeFileSync(output,png(frame));
  console.log(JSON.stringify({output,width:frame.width,height:frame.height,
    rgbaSHA256:crypto.createHash('sha256').update(frame.data).digest('hex'),
    sourcePhotoRead:false,diagnostics:frame.diagnostics},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
