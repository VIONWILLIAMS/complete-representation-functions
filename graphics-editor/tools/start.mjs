#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const portText = portIndex >= 0 ? args[portIndex + 1] : '4173';
const port = Number(portText);
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('CRF needs Node.js 22 or later. Current version: ' + process.version);
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('Use --port with an integer between 1024 and 65535.');
  process.exit(1);
}
const serverFile = path.join(root, 'editor', 'scripts', 'dev07.mjs');
if (!fs.existsSync(serverFile)) {
  console.error('The editor source is missing. Extract the complete ZIP before starting.');
  process.exit(1);
}
const url = 'http://127.0.0.1:' + port + '/';
console.log('CRF product 1.0 / historical source 0.10.0');
console.log('Keep this terminal open. Press Control+C to stop.');
const server = spawn(process.execPath, [serverFile, '--host', '127.0.0.1', '--port', String(port)], {
  cwd: path.join(root, 'editor'), env: process.env, stdio: ['inherit', 'pipe', 'inherit']
});
let ready = false;
let stopping = false;
let pending = '';
server.stdout.on('data', chunk => {
  process.stdout.write(chunk);
  pending = (pending + chunk.toString()).slice(-4096);
  if (ready || !pending.includes('CRF development server ready')) return;
  ready = true;
  console.log('Open ' + url);
  if (args.includes('--no-open')) return;
  const command = process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  const browser = spawn(command[0], command[1], { stdio: 'ignore', detached: true });
  browser.on('error', () => console.log('Open the address above in your browser.'));
  browser.unref();
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('exit', (code, signal) => {
  if (!ready && !stopping) console.error('Startup failed. If the port is occupied, try --port 4174.');
  process.exitCode = stopping ? 0 : (code ?? (signal ? 1 : 0));
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  server.kill('SIGTERM');
});
