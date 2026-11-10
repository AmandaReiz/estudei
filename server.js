const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = __dirname;
const SYNC_FILE = path.join(__dirname, 'tec-sync-queue.json');

if (!fs.existsSync(SYNC_FILE)) {
  fs.writeFileSync(SYNC_FILE, JSON.stringify({ items: [], lastSync: null }, null, 2), 'utf8');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Endpoint to open project directory in Windows Explorer
  if (pathname === '/api/open-folder' && req.method === 'POST') {
    exec(`explorer.exe "${PUBLIC_DIR}"`);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, path: PUBLIC_DIR }));
  }

  // Restore the pending Tec Concursos queue from a portable Estudei backup.
  if (pathname === '/api/tec-queue/restore' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!Array.isArray(payload.items)) throw new Error('A fila de sincronização precisa ser uma lista.');
        const restored = { items: payload.items, lastSync: payload.lastSync || new Date().toISOString() };
        fs.writeFileSync(SYNC_FILE, JSON.stringify(restored, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, restored: restored.items.length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Receive synced activities / questions from Tec Concursos
  if (pathname === '/api/tec-sync' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const current = JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8'));
        const incoming = Array.isArray(payload.items) ? payload.items : [payload];
        const stamped = incoming.map((item, idx) => ({
          ...item,
          syncId: `tec_${Date.now()}_${idx}`,
          receivedAt: new Date().toISOString()
        }));
        current.items.push(...stamped);
        current.lastSync = new Date().toISOString();
        fs.writeFileSync(SYNC_FILE, JSON.stringify(current, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, added: stamped.length, totalQueued: current.items.length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Poll & consume queued Tec Concursos activities
  if (pathname === '/api/tec-queue' && req.method === 'GET') {
    try {
      const current = JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8'));
      const consume = parsedUrl.query.consume === '1';
      const responseData = { ok: true, items: current.items, lastSync: current.lastSync };
      if (consume && current.items.length > 0) {
        fs.writeFileSync(SYNC_FILE, JSON.stringify({ items: [], lastSync: current.lastSync }, null, 2), 'utf8');
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(responseData));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, items: [] }));
    }
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(PUBLIC_DIR, path.normalize(filePath).replace(/^(\.\.[\/\\])+/, ''));

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado.');
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Estudei Pro (React) rodando em http://localhost:${PORT}`);
});
