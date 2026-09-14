const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'web');
const port = process.env.PORT || 3000;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

http.createServer((req, res) => {
  let pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(root, pathname));
  if (!filePath.startsWith(root)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    const target = !err && stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    fs.readFile(target, (readErr, data) => {
      if (readErr) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
      res.end(data);
    });
  });
}).listen(port, () => console.log(`MUKVIK Routine Pack running on ${port}`));
