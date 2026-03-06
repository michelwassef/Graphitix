#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const portArgIndex = args.findIndex(arg => arg === '--port');
const port = portArgIndex >= 0 ? Number(args[portArgIndex + 1]) : 4173;

const mimeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm'
};

function safeResolvePath(requestPath) {
  const decoded = decodeURIComponent(requestPath || '/');
  const normalized = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(root, normalized));
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

function sendNotFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  try {
    const parsed = url.parse(req.url || '/');
    const filePath = safeResolvePath(parsed.pathname || '/');
    if (!filePath) {
      sendNotFound(res);
      return;
    }
    let targetPath = filePath;
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      sendNotFound(res);
      return;
    }
    const ext = path.extname(targetPath).toLowerCase();
    const contentType = mimeByExt[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(targetPath).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Server error: ${err?.message || String(err)}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  // Keep this line concise for Playwright webServer log noise.
  console.log(`e2e server listening on http://127.0.0.1:${port}`);
});
