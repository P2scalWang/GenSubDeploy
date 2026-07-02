// server.js — Local Server สำหรับรัน Webapp เพื่อเปิดใช้ SharedArrayBuffer (COOP/COEP Headers)
// วิธีใช้: node server.js [พอร์ตเริ่มต้น: 3000]

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // ป้องกัน Directory Traversal
  let safeUrl = req.url.split('?')[0];
  if (safeUrl === '/') safeUrl = '/index.html';
  
  const filePath = path.join(__dirname, safeUrl);

  // ตั้งค่า COOP & COEP Headers (สำคัญมากในการโหลด ffmpeg.wasm)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('ไม่พบไฟล์ที่คุณกำลังหา (404 Not Found)');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    
    // สตรีมไฟล์
    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      console.error(streamErr);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Do-Subtitle Webapp Server กำลังรันสำเร็จ!`);
  console.log(`👉 เปิดใช้งานได้ที่: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
