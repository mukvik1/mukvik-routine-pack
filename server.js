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
  '.webp': 'image/webp',
  '.mp4': 'video/mp4'
};

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }

  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(root, pathname));
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (statError, stat) => {
    const target = !statError && stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    fs.stat(target, (error, targetStat) => {
      if (error || !targetStat.isFile()) {
        res.writeHead(404);
        return res.end('Not found');
      }

      const size = targetStat.size;
      const contentType = types[path.extname(target).toLowerCase()] || 'application/octet-stream';
      const commonHeaders = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=300',
        'Content-Type': contentType
      };
      const range = req.headers.range;

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
          res.writeHead(416, { ...commonHeaders, 'Content-Range': `bytes */${size}` });
          return res.end();
        }
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
          res.writeHead(416, { ...commonHeaders, 'Content-Range': `bytes */${size}` });
          return res.end();
        }
        res.writeHead(206, {
          ...commonHeaders,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${size}`
        });
        return fs.createReadStream(target, { start, end }).pipe(res);
      }

      res.writeHead(200, { ...commonHeaders, 'Content-Length': size });
      return fs.createReadStream(target).pipe(res);
    });
  });
}).listen(port, () => console.log(`MUKVIK Routine Pack running on ${port}`));
