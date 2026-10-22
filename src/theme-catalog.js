'use strict';

var SHAPES = [
  { id: 'pig-face', name: '小猪脸', category: 'animal' },
  { id: 'rabbit-face', name: '兔耳朵', category: 'animal' },
  { id: 'fish', name: '小鱼', category: 'animal' },
  { id: 'butterfly', name: '蝴蝶', category: 'animal' },
  { id: 'flower', name: '花朵', category: 'plant' },
  { id: 'leaf', name: '叶子', category: 'plant' },
  { id: 'apple', name: '苹果', category: 'plant' },
  { id: 'mushroom', name: '蘑菇', category: 'plant' },
  { id: 'cup', name: '茶杯', category: 'object' },
  { id: 'house', name: '小房子', category: 'object' },
  { id: 'heart', name: '爱心', category: 'object' },
  { id: 'turtle', name: '海龟', category: 'animal' },
  { id: 'whale', name: '鲸鱼', category: 'animal' },
  { id: 'cat-face', name: '猫咪脸', category: 'animal' },
  { id: 'cactus', name: '仙人掌', category: 'plant' },
  { id: 'tree', name: '大树', category: 'plant' },
  { id: 'pear', name: '梨子', category: 'plant' },
  { id: 'duck', name: '小鸭子', category: 'animal' },
  { id: 'rocket', name: '小火箭', category: 'object' },
  { id: 'flowerpot', name: '盆栽', category: 'object' },
  { id: 'ladybug', name: '瓢虫', category: 'animal' },
  { id: 'owl', name: '猫头鹰', category: 'animal' },
  { id: 'umbrella', name: '雨伞', category: 'object' },
  { id: 'strawberry', name: '草莓', category: 'plant' }
];

function ellipse(x, y, cx, cy, rx, ry) {
  var dx = (x - cx) / rx;
  var dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function rectangle(x, y, cx, cy, width, height) {
  return Math.abs(x - cx) <= width / 2 && Math.abs(y - cy) <= height / 2;
}

function shapeContains(id, x, y) {
  var ax = Math.abs(x);
  if (id === 'pig-face') {
    return ellipse(x, y, 0, 0.12, 0.92, 0.8) || ellipse(x, y, -0.58, -0.6, 0.3, 0.34) || ellipse(x, y, 0.58, -0.6, 0.3, 0.34);
  }
  if (id === 'rabbit-face') {
    return ellipse(x, y, 0, 0.24, 0.9, 0.7) || ellipse(x, y, -0.34, -0.58, 0.25, 0.5) || ellipse(x, y, 0.34, -0.58, 0.25, 0.5);
  }
  if (id === 'fish') {
    return ellipse(x, y, -0.08, 0, 0.78, 0.67) || (x > 0.45 && x < 0.98 && Math.abs(y) < (x - 0.36) * 0.92);
  }
  if (id === 'butterfly') {
    return ellipse(x, y, -0.46, -0.3, 0.48, 0.54) || ellipse(x, y, 0.46, -0.3, 0.48, 0.54) || ellipse(x, y, -0.48, 0.4, 0.43, 0.46) || ellipse(x, y, 0.48, 0.4, 0.43, 0.46) || rectangle(x, y, 0, 0.12, 0.24, 1.55);
  }
  if (id === 'flower') {
    var angle = Math.atan2(y, x);
    var radius = Math.sqrt(x * x + y * y);
    return radius <= 0.39 || radius <= 0.73 + 0.17 * Math.cos(angle * 8);
  }
  if (id === 'leaf') {
    var leafX = x + y * 0.18;
    var leafY = y - x * 0.08;
    return Math.pow(Math.abs(leafX) / 0.96, 1.35) + Math.pow(Math.abs(leafY) / 0.73, 1.6) <= 1 || rectangle(x, y, 0.4, 0.55, 0.56, 0.16);
  }
  if (id === 'apple') {
    return ellipse(x, y, -0.25, 0.18, 0.66, 0.7) || ellipse(x, y, 0.25, 0.18, 0.66, 0.7) || ellipse(x, y, 0.28, -0.62, 0.38, 0.2) || rectangle(x, y, 0, -0.62, 0.16, 0.34);
  }
  if (id === 'mushroom') {
    return (ellipse(x, y, 0, -0.32, 0.96, 0.55) && y <= -0.05) || (y >= -0.16 && y <= 0.9 && ax <= 0.48 - Math.max(0, y - 0.25) * 0.11);
  }
  if (id === 'cup') {
    return (y >= -0.48 && y <= 0.76 && ax <= 0.72 - (y + 0.48) * 0.12) || ellipse(x, y, 0.72, 0.02, 0.3, 0.42) || rectangle(x, y, 0, 0.82, 1.72, 0.15);
  }
  if (id === 'house') {
    return (y >= -0.22 && y <= 0.9 && ax <= 0.78) || (y >= -0.94 + ax * 0.9 && y < -0.18 && ax <= 0.94);
  }
  if (id === 'heart') {
    return ellipse(x, y, -0.36, -0.28, 0.56, 0.52) || ellipse(x, y, 0.36, -0.28, 0.56, 0.52) || (y >= -0.22 && y <= 0.92 && ax <= 0.86 * (0.94 - y) / 1.16);
  }
  if (id === 'turtle') {
    return ellipse(x, y, -0.08, 0.04, 0.75, 0.58) || ellipse(x, y, 0.74, -0.02, 0.28, 0.29) || ellipse(x, y, -0.5, -0.52, 0.3, 0.22) || ellipse(x, y, 0.34, -0.52, 0.3, 0.22) || ellipse(x, y, -0.5, 0.52, 0.3, 0.22) || ellipse(x, y, 0.34, 0.52, 0.3, 0.22);
  }
  if (id === 'whale') {
    return ellipse(x, y, -0.1, 0.08, 0.82, 0.61) || (x > 0.52 && x < 0.98 && Math.abs(y + 0.08) < (x - 0.42) * 0.78) || (y < -0.38 && x > 0.28 && x < 0.72 && y > -0.88 + Math.abs(x - 0.5) * 1.2);
  }
  if (id === 'cat-face') {
    return ellipse(x, y, 0, 0.15, 0.9, 0.75) || (y >= -0.96 && y <= -0.28 && x > -0.9 && x < -0.25 && y >= -0.96 + (x + 0.9) * 0.8) || (y >= -0.96 && y <= -0.28 && x < 0.9 && x > 0.25 && y >= -0.96 + (0.9 - x) * 0.8);
  }
  if (id === 'cactus') {
    return rectangle(x, y, 0, 0.08, 0.62, 1.78) || rectangle(x, y, -0.5, 0.05, 0.58, 0.35) || rectangle(x, y, -0.67, -0.18, 0.24, 0.65) || rectangle(x, y, 0.5, 0.32, 0.58, 0.35) || rectangle(x, y, 0.67, 0.08, 0.24, 0.66);
  }
  if (id === 'tree') {
    return ellipse(x, y, 0, -0.34, 0.9, 0.62) || ellipse(x, y, -0.45, -0.02, 0.48, 0.5) || ellipse(x, y, 0.45, -0.02, 0.48, 0.5) || rectangle(x, y, 0, 0.55, 0.42, 0.82);
  }
  if (id === 'pear') {
    return ellipse(x, y, 0, 0.35, 0.73, 0.58) || ellipse(x, y, 0, -0.28, 0.48, 0.58) || rectangle(x, y, 0.05, -0.72, 0.16, 0.35) || ellipse(x, y, 0.32, -0.62, 0.36, 0.18);
  }
  if (id === 'duck') {
    return ellipse(x, y, -0.18, 0.34, 0.76, 0.49) || ellipse(x, y, 0.42, -0.33, 0.43, 0.42) || (x > 0.68 && x < 0.98 && Math.abs(y + 0.28) < 0.18);
  }
  if (id === 'rocket') {
    return (ax <= 0.48 && y >= -0.63 && y <= 0.64) || (y >= -0.96 && y < -0.55 && ax <= (y + 0.98) * 1.22) || (y > 0.38 && y < 0.88 && ax <= 0.84 - (y - 0.38) * 0.58);
  }
  if (id === 'flowerpot') {
    return (y >= 0.18 && y <= 0.9 && ax <= 0.7 - (y - 0.18) * 0.22) || rectangle(x, y, 0, 0.12, 1.55, 0.2) || ellipse(x, y, -0.4, -0.35, 0.48, 0.5) || ellipse(x, y, 0.4, -0.35, 0.48, 0.5) || ellipse(x, y, 0, -0.62, 0.45, 0.43);
  }
  if (id === 'ladybug') {
    return ellipse(x, y, 0, 0.14, 0.82, 0.76) || ellipse(x, y, 0, -0.62, 0.5, 0.34);
  }
  if (id === 'owl') {
    return ellipse(x, y, 0, 0.12, 0.82, 0.8) || (y > -0.95 && y < -0.38 && ax > 0.38 && ax < 0.88 && y > -0.96 + (0.88 - ax) * 0.7);
  }
  if (id === 'umbrella') {
    return (ellipse(x, y, 0, -0.22, 0.96, 0.62) && y <= -0.12) || rectangle(x, y, 0, 0.32, 0.2, 1.0) || ellipse(x, y, 0.23, 0.72, 0.38, 0.25);
  }
  if (id === 'strawberry') {
    return (y >= -0.5 && y <= 0.92 && ax <= 0.8 * (0.96 - y) / 1.46 + 0.08) || ellipse(x, y, -0.34, -0.56, 0.42, 0.26) || ellipse(x, y, 0.34, -0.56, 0.42, 0.26) || ellipse(x, y, 0, -0.7, 0.42, 0.28);
  }
  return true;
}

function keyOf(row, col) {
  return row + ',' + col;
}

function largestConnectedComponent(cells) {
  var lookup = {};
  cells.forEach(function (cell) { lookup[keyOf(cell.r, cell.c)] = cell; });
  var seen = {};
  var best = [];
  cells.forEach(function (start) {
    var startKey = keyOf(start.r, start.c);
    if (seen[startKey]) {
      return;
    }
    var queue = [start];
    var component = [];
    seen[startKey] = true;
    while (queue.length) {
      var cell = queue.shift();
      component.push(cell);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (step) {
        var neighborKey = keyOf(cell.r + step[0], cell.c + step[1]);
        if (lookup[neighborKey] && !seen[neighborKey]) {
          seen[neighborKey] = true;
          queue.push(lookup[neighborKey]);
        }
      });
    }
    if (component.length > best.length) {
      best = component;
    }
  });
  return best.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
}

function expandMask(cells, rows, cols) {
  var lookup = {};
  cells.forEach(function (cell) { lookup[keyOf(cell.r, cell.c)] = { r: cell.r, c: cell.c }; });
  cells.forEach(function (cell) {
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (step) {
      var row = cell.r + step[0];
      var col = cell.c + step[1];
      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        lookup[keyOf(row, col)] = { r: row, c: col };
      }
    });
  });
  return Object.keys(lookup).map(function (key) { return lookup[key]; });
}

function hashUnit(seed) {
  var value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function addBoundaryVariation(cells, rows, cols, seed) {
  var current = cells.slice();
  var removalTarget = 4 + Math.floor(hashUnit(seed * 17 + 3) * 4);
  for (var removal = 0; removal < removalTarget; removal += 1) {
    var lookup = {};
    current.forEach(function (cell) { lookup[keyOf(cell.r, cell.c)] = cell; });
    var candidates = current.filter(function (cell) {
      var neighbors = 0;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (step) {
        if (lookup[keyOf(cell.r + step[0], cell.c + step[1])]) {
          neighbors += 1;
        }
      });
      return neighbors >= 2 && neighbors <= 3;
    });
    if (!candidates.length) {
      break;
    }
    var start = Math.floor(hashUnit(seed * 97 + removal * 131) * candidates.length);
    var removed = false;
    for (var offset = 0; offset < Math.min(18, candidates.length); offset += 1) {
      var candidate = candidates[(start + offset * 7) % candidates.length];
      var next = current.filter(function (cell) {
        return cell.r !== candidate.r || cell.c !== candidate.c;
      });
      var connected = largestConnectedComponent(next);
      if (connected.length === current.length - 1) {
        current = connected;
        removed = true;
        break;
      }
    }
    if (!removed) {
      break;
    }
  }
  return current;
}

function createSilhouette(levelNumber, rows, cols) {
  var index = Math.max(0, levelNumber - 2);
  var shape = SHAPES[index % SHAPES.length];
  var variant = Math.floor(index / SHAPES.length);
  var extended = levelNumber > 200;
  var mirror = extended ? (hashUnit(levelNumber * 19) < 0.5 ? -1 : 1) : (variant % 2 ? -1 : 1);
  var scaleX = extended ? 0.92 + hashUnit(levelNumber * 31 + 1) * 0.085 : 1 - (variant % 4) * 0.018;
  var scaleY = extended ? 0.92 + hashUnit(levelNumber * 37 + 2) * 0.075 : 1 - ((variant * 3) % 4) * 0.014;
  var shiftX = extended ? (hashUnit(levelNumber * 41 + 3) - 0.5) * 0.09 : ((variant % 3) - 1) * 0.035;
  var shiftY = extended ? (hashUnit(levelNumber * 43 + 4) - 0.5) * 0.075 : (((variant + 1) % 3) - 1) * 0.025;
  var angle = extended ? (hashUnit(levelNumber * 47 + 5) - 0.5) * 0.18 : 0;
  var cosine = Math.cos(angle);
  var sine = Math.sin(angle);
  var cells = [];
  for (var row = 0; row < rows; row += 1) {
    for (var col = 0; col < cols; col += 1) {
      var x = ((col / Math.max(1, cols - 1)) * 2 - 1 - shiftX) / scaleX * mirror;
      var y = ((row / Math.max(1, rows - 1)) * 2 - 1 - shiftY) / scaleY;
      var rotatedX = x * cosine - y * sine;
      var rotatedY = x * sine + y * cosine;
      if (shapeContains(shape.id, rotatedX, rotatedY)) {
        cells.push({ r: row, c: col });
      }
    }
  }
  cells = largestConnectedComponent(cells);
  var minimumCells = Math.floor(rows * cols * (extended ? 0.715 : 0.7));
  var expansionPass = 0;
  while (cells.length < minimumCells && expansionPass < 3) {
    cells = largestConnectedComponent(expandMask(cells, rows, cols));
    expansionPass += 1;
  }
  if (extended || levelNumber === 131) {
    cells = addBoundaryVariation(cells, rows, cols, levelNumber);
  }
  var releaseMinimumCells = Math.floor(rows * cols * 0.7);
  while (cells.length < releaseMinimumCells) {
    cells = largestConnectedComponent(expandMask(cells, rows, cols));
  }
  return {
    id: shape.id,
    name: shape.name,
    category: shape.category,
    variant: variant,
    maskCells: cells
  };
}

module.exports = {
  SHAPES: SHAPES,
  createSilhouette: createSilhouette
};
