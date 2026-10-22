'use strict';

var fs = require('fs');
var path = require('path');
var generator = require('../src/level-generator');

var levelNumber = Math.max(1, Number(process.argv[2]) || 40);
var level = generator.generateLevel(levelNumber);
var width = 390;
var height = 844;
var board = { x: 10, y: 116, w: 370, h: 598 };
var padding = 26;
var cell = Math.min(
  (board.w - padding * 2) / Math.max(1, level.cols - 1),
  (board.h - padding * 2) / Math.max(1, level.rows - 1)
);
var gridW = (level.cols - 1) * cell;
var gridH = (level.rows - 1) * cell;
var x0 = board.x + board.w / 2 - gridW / 2;
var y0 = board.y + board.h / 2 - gridH / 2;
var stroke = Math.max(2.2, Math.min(5.2, cell * 0.24));

function point(cellValue) {
  return {
    x: x0 + cellValue.c * cell,
    y: y0 + cellValue.r * cell
  };
}

function number(value) {
  return Math.round(value * 10) / 10;
}

function arrowHead(head, dir, size) {
  var points;
  if (dir === 'right') {
    points = [[head.x + size, head.y], [head.x - size * 0.45, head.y - size * 0.72], [head.x - size * 0.45, head.y + size * 0.72]];
  } else if (dir === 'left') {
    points = [[head.x - size, head.y], [head.x + size * 0.45, head.y - size * 0.72], [head.x + size * 0.45, head.y + size * 0.72]];
  } else if (dir === 'up') {
    points = [[head.x, head.y - size], [head.x - size * 0.72, head.y + size * 0.45], [head.x + size * 0.72, head.y + size * 0.45]];
  } else {
    points = [[head.x, head.y + size], [head.x - size * 0.72, head.y - size * 0.45], [head.x + size * 0.72, head.y - size * 0.45]];
  }
  return points.map(function (item) {
    return number(item[0]) + ',' + number(item[1]);
  }).join(' ');
}

var arrowSvg = level.arrows.map(function (arrow) {
  var points = arrow.cells.map(point);
  var arrowColor = level.colorMode === false ? '#111832' : (arrow.color || '#111832');
  var data = points.map(function (item) {
    return number(item.x) + ',' + number(item.y);
  }).join(' ');
  var head = points[points.length - 1];
  return [
    '<polyline points="' + data + '" fill="none" stroke="#fff" stroke-width="' + number(stroke + 1.5) + '" stroke-linecap="butt" stroke-linejoin="miter"/>',
    '<polyline points="' + data + '" fill="none" stroke="' + arrowColor + '" stroke-width="' + number(stroke) + '" stroke-linecap="butt" stroke-linejoin="miter"/>',
    '<polygon points="' + arrowHead(head, arrow.dir, stroke * 1.08) + '" fill="' + arrowColor + '"/>'
  ].join('');
}).join('\n');

var guideSvg = (level.layoutType === 'denseMaze' ? [] : (level.maskCells || [])).map(function (cellValue) {
  var p = point(cellValue);
  var size = cell * 0.82;
  return '<rect x="' + number(p.x - size / 2) + '" y="' + number(p.y - size / 2) + '" width="' + number(size) + '" height="' + number(size) + '" fill="#f1f4fb"/>';
}).join('');

var svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">',
  '<rect width="390" height="844" fill="#82b9f7"/>',
  '<rect x="0" y="0" width="390" height="108" fill="#cfd9f2"/>',
  '<text x="195" y="34" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="800" fill="#2c72c7">关卡 ' + levelNumber + '</text>',
  '<text x="195" y="66" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#ef4f4f">♥ ♥ ♥</text>',
  '<text x="195" y="93" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#172044">◷ 5m30s</text>',
  '<rect x="' + board.x + '" y="' + board.y + '" width="' + board.w + '" height="' + board.h + '" fill="#fff" stroke="#568dcc" stroke-width="2"/>',
  '<clipPath id="board"><rect x="' + board.x + '" y="' + board.y + '" width="' + board.w + '" height="' + board.h + '"/></clipPath>',
  '<g clip-path="url(#board)">' + guideSvg + arrowSvg + '</g>',
  '<rect x="0" y="724" width="390" height="120" fill="#edf2ff"/>',
  '<circle cx="98" cy="778" r="34" fill="#fff" stroke="#cfd9f2" stroke-width="3"/>',
  '<circle cx="195" cy="778" r="34" fill="#fff" stroke="#cfd9f2" stroke-width="3"/>',
  '<circle cx="292" cy="778" r="34" fill="#fff" stroke="#cfd9f2" stroke-width="3"/>',
  '<text x="195" y="830" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#556082">' + level.arrows.length + ' 条箭头 · 密度 ' + Math.round(level.occupiedCells / (level.rows * level.cols) * 100) + '%</text>',
  '</svg>'
].join('\n');

var outputDir = path.resolve(__dirname, '..', 'artifacts');
fs.mkdirSync(outputDir, { recursive: true });
var output = path.join(outputDir, 'level-' + levelNumber + '.svg');
fs.writeFileSync(output, svg, 'utf8');
console.log(output);
