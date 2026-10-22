'use strict';

var fs = require('fs');
var http = require('http');
var path = require('path');

var root = path.resolve(__dirname, '..');
var port = parseInt(process.argv[2], 10) || 4173;
var contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav'
};

http.createServer(function (request, response) {
  var pathname = decodeURIComponent(String(request.url || '/').split('?')[0]);
  var relative = pathname === '/' ? 'preview.html' : pathname.replace(/^\/+/, '');
  var filePath = path.resolve(root, relative);
  if (filePath.indexOf(root) !== 0) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(filePath, function (error, content) {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code || 'Error');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  });
}).listen(port, '127.0.0.1', function () {
  console.log('Preview server: http://127.0.0.1:' + port + '/preview.html');
});
