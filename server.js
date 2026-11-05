const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const PUBLIC_DIR = __dirname;
const SYNC_FILE = path.join(__dirname, 'tec-sync-queue.json');

// Initialize sync queue file if not exists
if (!fs.existsSync(SYNC_FILE)) {
  fs.writeFileSync(SYNC_FILE, JSON.stringify({ items: [], lastSync: null }, null, 2), 'utf8');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function fetchUrl(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        ...headers
      }
    };
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://${parsed.hostname}${res.headers.location}`;
        return resolve(fetchUrl(nextUrl, headers));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const setCookie = res.headers['set-cookie'] || [];
        resolve({ status: res.statusCode, buffer: buf, text: buf.toString('utf8'), cookies: setCookie });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // Enable CORS so tecconcursos.com.br extension/bookmarklet can post directly to localhost:3000
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

  // API 1: Receive synced activities / questions from Tec Concursos
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

  // API 2: Poll & consume queued Tec Concursos activities from the frontend
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

  // API 3: Live Tec Concursos Guide Extractor (paste any Tec Concursos guide URL!)
  if (pathname === '/api/extract-tec-guide' && req.method === 'GET') {
    const guideUrl = parsedUrl.query.url;
    if (!guideUrl || !guideUrl.includes('tecconcursos.com.br/guias/')) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'Informe uma URL válida de guia do Tec Concursos.' }));
    }
    try {
      const cleanBaseUrl = guideUrl.split('?')[0].replace(/\/$/, '');
      const mainPage = await fetchUrl(cleanBaseUrl);
      const idMatch = mainPage.text.match(/var\s+jsonGuiaId\s*=\s*["'](\d+)["']/);
      if (!idMatch) {
        throw new Error('Não foi possível encontrar o jsonGuiaId nessa página do Tec Concursos.');
      }
      const guiaId = idMatch[1];
      const cookieHeader = mainPage.cookies.map(c => c.split(';')[0]).join('; ');
      const apiRes = await fetchUrl(`https://www.tecconcursos.com.br/api/caderno-guia/listar-pelo-guia/${guiaId}`, {
        'Cookie': cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
        'Referer': cleanBaseUrl
      });
      const cadernosData = JSON.parse(apiRes.text);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        ok: true,
        guiaId,
        baseUrl: cleanBaseUrl,
        cadernos: cadernosData.cadernosGuia || []
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: err.message }));
    }
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

server.listen(PORT, () => {
  console.log(`Estudei Pro + Flow + Tec Sync rodando em http://localhost:${PORT}`);
});
