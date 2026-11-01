#!/usr/bin/env node
/**
 * Tiny POST listener for TEM_WEB_DEPLOY_HOOK_URL during admin Playwright (AC-31).
 * Writes a hit count file; never logs secrets.
 */
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const hitsFile = join(dir, '.deploy-hook-hits');
let hits = 0;
writeFileSync(hitsFile, '0');

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    hits += 1;
    writeFileSync(hitsFile, String(hits));
  }
  res.writeHead(201, { 'content-type': 'text/plain' });
  res.end('ok');
});

server.listen(9876, '127.0.0.1', () => {
  console.log('deploy-hook-mock on 127.0.0.1:9876');
});
