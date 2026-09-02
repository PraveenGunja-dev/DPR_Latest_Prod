// Minimal zero-dependency static server for the built SPA.
// Only used when the frontend runs on a LINUX App Service (startup command
// `node server.js`). A Windows/IIS App Service ignores this file and uses
// web.config instead. Both ship in the same ZIP so one artifact fits either.
//
// It exists because the SSO callback redirects the browser to client-side
// routes such as /projects#sso_data=... — those must fall back to index.html
// or the platform answers with its own 404 page and the login round trip dies.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'https://az10lappdprp02.azurewebsites.net';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, headers) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendIndex(res, status) {
  const indexPath = path.join(ROOT, 'index.html');
  fs.readFile(indexPath, (err, buf) => {
    if (err) return send(res, 500, 'index.html missing', { 'Content-Type': 'text/plain' });
    // The shell points at hashed asset names that change every build, so it
    // must never be cached.
    send(res, status, buf, {
      'Content-Type': MIME['.html'],
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname = decodeURIComponent(parsedUrl.pathname || '/');

  // Reverse proxy /api/ requests to the backend
  if (pathname.startsWith('/api/')) {
    const targetUrl = new URL(req.url, BACKEND_API_URL);
    const options = {
      method: req.method,
      headers: { ...req.headers },
    };
    
    // Do not forward host header, let the https client set it for the target
    delete options.headers.host;
    delete options.headers.referer;

    const proxyReq = https.request(targetUrl, options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err);
      if (!res.headersSent) {
        send(res, 502, 'Bad Gateway', { 'Content-Type': 'text/plain' });
      }
    });

    return req.pipe(proxyReq, { end: true });
  }

  // Static file handling - only allow GET and HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain' });
  }

  if (pathname === '/healthz') {
    return send(res, 200, JSON.stringify({ status: 'ok' }), { 'Content-Type': MIME['.json'] });
  }

  // Resolve inside ROOT only - blocks ../ traversal.
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) return sendIndex(res, 404);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Unknown path: hand the SPA router its route (deep links, SSO callback).
      return sendIndex(res, 200);
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };

    if (pathname === '/index.html') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    } else if (pathname.startsWith('/assets/')) {
      // Hashed filenames are immutable.
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['Cache-Control'] = 'public, max-age=3600';
    }

    if (req.method === 'HEAD') return send(res, 200, null, headers);
    res.writeHead(200, headers);
    fs.createReadStream(filePath).on('error', () => res.end()).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[frontend] serving ${ROOT} on port ${PORT}`);
});
