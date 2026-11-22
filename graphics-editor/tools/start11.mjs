#!/usr/bin/env node
// Additive launcher; the recovered 1.0 launcher and its default URL are intact.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), at = args.indexOf('--port');
const port = Number(at < 0 ? 4173 : args[at + 1]);
if (Number(process.versions.node.split('.')[0]) < 22 || !Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('Use Node.js 22+ and --port 1024..65535.'); process.exit(1);
}
const quality = args.includes('--quality');
const url = 'http://127.0.0.1:' + port + (quality ? '/quality12.html' : '/studio11.html');
console.log(quality ? 'CRF 1.1 visual quality workspace — reference reconstruction and direct function rendering' :
  'CRF 1.1 experimental object functions — local training, code, image and video');
console.log('Keep this terminal open. Press Control+C to stop.');
const server = spawn(process.execPath, [path.join(root, 'editor/scripts/dev07.mjs'),
  '--host', '127.0.0.1', '--port', String(port)], {cwd: path.join(root, 'editor'), env: process.env,
  stdio: ['inherit', 'pipe', 'inherit']});
let opened = false, text = '', stopping = false;
server.stdout.on('data', bytes => {
  process.stdout.write(bytes); text = (text + bytes).slice(-4096);
  if (opened || !text.includes('CRF development server ready')) return;
  opened = true; console.log('Open ' + url);
  if (args.includes('--no-open')) return;
  const command = process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  const browser = spawn(command[0], command[1], {stdio: 'ignore', detached: true});
  browser.on('error', () => console.log('Open the address above in your browser.')); browser.unref();
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('exit', (code, signal) => {
  if (!opened && !stopping) console.error('Startup failed. Try --port 4174 if the port is occupied.');
  process.exitCode = stopping ? 0 : code ?? (signal ? 1 : 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return; stopping = true; server.kill('SIGTERM');
});
