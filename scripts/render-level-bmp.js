'use strict';

var fs = require('fs');
var path = require('path');
var generator = require('../src/level-generator');

var levelNumber = Math.max(1, Number(process.argv[2]) || 40);
var level = generator.generateLevel(levelNumber);
var width = 390;
var height = 844;
var rowSize = Math.ceil(width * 3 / 4) * 4;
var pixels = Buffer.alloc(rowSize * height, 255);

function rgb(hex) {
  var value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function setPixel(x, y, color) {
  var px = Math.round(x);
  var py = Math.round(y);
  if (px < 0 || px >= width || py < 0 || py >= height) {
    return;
  }
  var offset = (height - 1 - py) * rowSize + px * 3;
  pixels[offset] = color[2];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[0];
}

function fillRect(x, y, w, h, color) {
  for (var py = Math.max(0, Math.floor(y)); py < Math.min(height, Math.ceil(y + h)); py += 1) {
    for (var px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + w)); px += 1) {
      setPixel(px, py, color);
    }
  }
}

function fillDisc(cx, cy, radius, color) {
  var rr = radius * radius;
  for (var y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (var x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      var dx = x - cx;
      var dy = y - cy;
      if (dx * dx + dy * dy <= rr) {
        setPixel(x, y, color);
      }
    }
  }
}

function thickLine(a, b, thickness, color) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (var i = 0; i <= steps; i += 1) {
    var t = i / steps;
    fillDisc(a.x + dx * t, a.y + dy * t, thickness / 2, color);
  }
}

function pointInTriangle(px, py, a, b, c) {
  var d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  var d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  var d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
  var hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  var hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function fillTriangle(a, b, c, color) {
  var minX = Math.floor(Math.min(a.x, b.x, c.x));
  var maxX = Math.ceil(Math.max(a.x, b.x, c.x));
  var minY = Math.floor(Math.min(a.y, b.y, c.y));
  var maxY = Math.ceil(Math.max(a.y, b.y, c.y));
  for (var y = minY; y <= maxY; y += 1) {
    for (var x = minX; x <= maxX; x += 1) {
      if (pointInTriangle(x, y, a, b, c)) {
        setPixel(x, y, color);
      }
    }
  }
}

function triangleFor(head, dir, size) {
  if (dir === 'right') {
    return [{ x: head.x + size, y: head.y }, { x: head.x - size * 0.45, y: head.y - size * 0.72 }, { x: head.x - size * 0.45, y: head.y + size * 0.72 }];
  }
  if (dir === 'left') {
    return [{ x: head.x - size, y: head.y }, { x: head.x + size * 0.45, y: head.y - size * 0.72 }, { x: head.x + size * 0.45, y: head.y + size * 0.72 }];
  }
  if (dir === 'up') {
    return [{ x: head.x, y: head.y - size }, { x: head.x - size * 0.72, y: head.y + size * 0.45 }, { x: head.x + size * 0.72, y: head.y + size * 0.45 }];
  }
  return [{ x: head.x, y: head.y + size }, { x: head.x - size * 0.72, y: head.y - size * 0.45 }, { x: head.x + size * 0.72, y: head.y - size * 0.45 }];
}

var sky = rgb('#82b9f7');
var header = rgb('#cfd9f2');
var white = rgb('#ffffff');
var bottom = rgb('#edf2ff');
var navy = rgb('#111832');
fillRect(0, 0, width, height, sky);
fillRect(0, 0, width, 108, header);
fillRect(10, 116, 370, 598, white);
fillRect(0, 724, width, 120, bottom);

var board = { x: 10, y: 116, w: 370, h: 598 };
var padding = 26;
var cell = Math.min(
  (board.w - padding * 2) / Math.max(1, level.cols - 1),
  (board.h - padding * 2) / Math.max(1, level.rows - 1)
);
var x0 = board.x + board.w / 2 - (level.cols - 1) * cell / 2;
var y0 = board.y + board.h / 2 - (level.rows - 1) * cell / 2;
var stroke = Math.max(2.2, Math.min(5.2, cell * 0.24));

function screenPoint(cellValue) {
  return { x: x0 + cellValue.c * cell, y: y0 + cellValue.r * cell };
}

(level.layoutType === 'denseMaze' ? [] : (level.maskCells || [])).forEach(function (cellValue) {
  var p = screenPoint(cellValue);
  var guideSize = cell * 0.82;
  fillRect(p.x - guideSize / 2, p.y - guideSize / 2, guideSize, guideSize, rgb('#f1f4fb'));
});

level.arrows.forEach(function (arrow) {
  var points = arrow.cells.map(screenPoint);
  var arrowColor = rgb(level.colorMode === false ? '#111832' : (arrow.color || '#111832'));
  for (var i = 1; i < points.length; i += 1) {
    thickLine(points[i - 1], points[i], stroke + 1.5, white);
  }
  for (var j = 1; j < points.length; j += 1) {
    thickLine(points[j - 1], points[j], stroke, arrowColor);
  }
  var head = points[points.length - 1];
  var tri = triangleFor(head, arrow.dir, stroke * 1.08);
  fillTriangle(tri[0], tri[1], tri[2], arrowColor);
});

var fileSize = 54 + pixels.length;
var headerBuffer = Buffer.alloc(54);
headerBuffer.write('BM', 0, 2, 'ascii');
headerBuffer.writeUInt32LE(fileSize, 2);
headerBuffer.writeUInt32LE(54, 10);
headerBuffer.writeUInt32LE(40, 14);
headerBuffer.writeInt32LE(width, 18);
headerBuffer.writeInt32LE(height, 22);
headerBuffer.writeUInt16LE(1, 26);
headerBuffer.writeUInt16LE(24, 28);
headerBuffer.writeUInt32LE(pixels.length, 34);

var outputDir = path.resolve(__dirname, '..', 'artifacts');
fs.mkdirSync(outputDir, { recursive: true });
var output = path.join(outputDir, 'level-' + levelNumber + '.bmp');
fs.writeFileSync(output, Buffer.concat([headerBuffer, pixels]));
console.log(output);
