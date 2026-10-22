'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var files = [
  'game.js',
  'src/config.js',
  'src/copy.js',
  'src/platform.js',
  'src/storage.js',
  'src/ad-service.js',
  'src/melody-catalog.js',
  'src/sound.js',
  'src/theme-catalog.js',
  'src/level-retries.js',
  'src/level-generator.js',
  'src/share-card.js',
  'src/social-service.js',
  'src/game-model.js',
  'src/renderer.js',
  'src/input.js',
  'src/main.js'
];

var moduleEntries = files.map(function (file) {
  var source = fs.readFileSync(path.join(root, file), 'utf8');
  return JSON.stringify(file.replace(/\\/g, '/')) + ': function (module, exports, require) {\n' + source + '\n}';
});

var runtime = [
  '(function () {',
  "'use strict';",
  'var modules = {',
  moduleEntries.join(',\n'),
  '};',
  'var cache = {};',
  'function normalize(parts) {',
  '  var result = [];',
  '  parts.forEach(function (part) {',
  "    if (!part || part === '.') return;",
  "    if (part === '..') result.pop(); else result.push(part);",
  '  });',
  "  return result.join('/');",
  '}',
  'function resolve(from, request) {',
  "  if (request.charAt(0) !== '.') return request;",
  "  var base = from.split('/');",
  '  base.pop();',
  "  var id = normalize(base.concat(request.split('/')));",
  "  return /\\.js$/.test(id) ? id : id + '.js';",
  '}',
  'function load(id) {',
  "  id = /\\.js$/.test(id) ? id : id + '.js';",
  "  if (cache[id]) return cache[id].exports;",
  "  if (!modules[id]) throw new Error('Missing module: ' + id);",
  '  var module = { exports: {} };',
  '  cache[id] = module;',
  '  modules[id](module, module.exports, function (request) {',
  '    return load(resolve(id, request));',
  '  });',
  '  return module.exports;',
  '}',
  "load('game.js');",
  '}());',
  ''
].join('\n');

fs.writeFileSync(path.join(root, 'preview.bundle.js'), runtime, 'utf8');
console.log('Built preview.bundle.js (' + Math.round(runtime.length / 1024) + ' KB)');
