// Local preview server. The movement pages load their 3D scenes as ES modules, which browsers
// refuse to run from file:// — so the exhibition must be opened over http. start.cmd runs this.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');
const root = __dirname;
const port = Number(process.env.PORT) || 8010;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.mp3':'audio/mpeg', '.mp4':'video/mp4', '.webm':'video/webm', '.wasm':'application/wasm', '.tflite':'application/octet-stream', '.woff2':'font/woff2' };
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}).on('error', err => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other server or set PORT.` : err.message);
  process.exit(1);
}).listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Exhibition: ${url}  (close this window to stop)`);
  if (process.argv.includes('--open') && process.platform === 'win32') exec(`start "" "${url}"`);
});
