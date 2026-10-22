'use strict';

var config = require('./config');
var themeCatalog = require('./theme-catalog');
var CURATED_RETRIES = require('./level-retries');

var DENSE_ROWS = 51;
var DENSE_COLS = 34;
var DENSE_LONG_LENGTH = 30;

function createRng(seed) {
  var value = seed >>> 0;
  return function () {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffle(rng, list) {
  var copy = list.slice();
  for (var i = copy.length - 1; i > 0; i -= 1) {
    var j = Math.floor(rng() * (i + 1));
    var temporary = copy[i];
    copy[i] = copy[j];
    copy[j] = temporary;
  }
  return copy;
}

function keyOf(row, col) {
  return row + ',' + col;
}

function inBounds(row, col, rows, cols) {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

function sameCell(a, b) {
  return a.r === b.r && a.c === b.c;
}

function cloneCell(cell) {
  return { r: cell.r, c: cell.c };
}

function directionFromStep(dr, dc) {
  if (dr < 0) {
    return config.DIRS.up;
  }
  if (dr > 0) {
    return config.DIRS.down;
  }
  if (dc < 0) {
    return config.DIRS.left;
  }
  return config.DIRS.right;
}

function directionFromPath(path) {
  var head = path[path.length - 1];
  var previous = path[path.length - 2];
  return directionFromStep(head.r - previous.r, head.c - previous.c);
}

function rayCellsFrom(head, dir, rows, cols) {
  var cells = [];
  var row = head.r + dir.dr;
  var col = head.c + dir.dc;
  while (inBounds(row, col, rows, cols)) {
    cells.push({ r: row, c: col });
    row += dir.dr;
    col += dir.dc;
  }
  return cells;
}

function pathPointsIntoOwnBody(path, rows, cols) {
  if (!path || path.length < 2) {
    return false;
  }
  var head = path[path.length - 1];
  var dir = directionFromPath(path);
  var ownBody = {};
  path.slice(0, -1).forEach(function (cell) {
    ownBody[keyOf(cell.r, cell.c)] = true;
  });
  return rayCellsFrom(head, dir, rows, cols).some(function (cell) {
    return !!ownBody[keyOf(cell.r, cell.c)];
  });
}

function buildOccupancy(arrows, ignoreId) {
  var occupied = {};
  arrows.forEach(function (arrow) {
    if (!arrow.active || arrow.removing || arrow.id === ignoreId) {
      return;
    }
    arrow.cells.forEach(function (cell) {
      var key = keyOf(cell.r, cell.c);
      if (!occupied[key]) {
        occupied[key] = arrow.id;
      }
    });
  });
  return occupied;
}

function canExitWithOccupancy(arrow, occupied, rows, cols) {
  var dir = config.DIRS[arrow.dir];
  var head = arrow.cells[arrow.cells.length - 1];
  var ray = rayCellsFrom(head, dir, rows, cols);
  for (var i = 0; i < ray.length; i += 1) {
    var blockerId = occupied[keyOf(ray[i].r, ray[i].c)];
    if (blockerId) {
      return {
        clear: false,
        blockerId: blockerId,
        collisionCell: ray[i],
        ray: ray
      };
    }
  }
  return {
    clear: true,
    blockerId: null,
    collisionCell: null,
    ray: ray
  };
}

function canExit(arrow, arrows, rows, cols) {
  return canExitWithOccupancy(arrow, buildOccupancy(arrows, null), rows, cols);
}

function findRemovable(arrows, rows, cols) {
  var occupied = buildOccupancy(arrows, null);
  return arrows.filter(function (arrow) {
    return arrow.active && !arrow.removing && canExitWithOccupancy(arrow, occupied, rows, cols).clear;
  });
}

function buildDependencyGraph(arrows, rows, cols) {
  var activeArrows = arrows.filter(function (arrow) {
    return arrow.active !== false && !arrow.removing;
  });
  var occupied = buildOccupancy(activeArrows, null);
  var byId = {};
  var dependencies = {};
  var dependents = {};
  activeArrows.forEach(function (arrow) {
    byId[arrow.id] = arrow;
    dependencies[arrow.id] = {};
    dependents[arrow.id] = [];
  });
  activeArrows.forEach(function (arrow) {
    var head = arrow.cells[arrow.cells.length - 1];
    rayCellsFrom(head, config.DIRS[arrow.dir], rows, cols).forEach(function (cell) {
      var blockerId = occupied[keyOf(cell.r, cell.c)];
      if (blockerId) {
        dependencies[arrow.id][blockerId] = true;
      }
    });
  });
  Object.keys(dependencies).forEach(function (arrowId) {
    Object.keys(dependencies[arrowId]).forEach(function (blockerId) {
      if (dependents[blockerId]) {
        dependents[blockerId].push(arrowId);
      }
    });
  });
  return {
    arrows: activeArrows,
    byId: byId,
    dependencies: dependencies,
    dependents: dependents
  };
}

function levelPreset(levelNumber) {
  var rows = DENSE_ROWS;
  var cols = DENSE_COLS;
  var silhouette = themeCatalog.createSilhouette(levelNumber, rows, cols);
  return {
    rows: rows,
    cols: cols,
    timeLimit: 300 - Math.floor(campaignProgress(levelNumber) * 60),
    maskCells: silhouette.maskCells,
    silhouette: {
      id: silhouette.id,
      name: silhouette.name,
      category: silhouette.category,
      variant: silhouette.variant
    }
  };
}

function makeArrow(id, path, color, order) {
  var dir = directionFromPath(path);
  return {
    id: id,
    cells: path,
    dir: dir.id,
    color: color,
    order: order,
    solutionRank: order,
    active: true,
    removing: false,
    removalMode: '',
    removeProgress: 0,
    removeDuration: 0.5,
    blockedFlash: 0,
    blockedBump: 0,
    hintPulse: 0
  };
}

function assignDistinctArrowColors(arrows, colorOffset) {
  var owner = {};
  var neighbors = {};
  var colors = {};
  var directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var paletteSize = config.ARROW_COLORS.length;

  arrows.forEach(function (arrow) {
    neighbors[arrow.id] = {};
    arrow.cells.forEach(function (cell) {
      owner[keyOf(cell.r, cell.c)] = arrow.id;
    });
  });
  arrows.forEach(function (arrow) {
    arrow.cells.forEach(function (cell) {
      directions.forEach(function (step) {
        var neighborId = owner[keyOf(cell.r + step[0], cell.c + step[1])];
        if (neighborId && neighborId !== arrow.id) {
          neighbors[arrow.id][neighborId] = true;
          neighbors[neighborId][arrow.id] = true;
        }
      });
    });
  });

  while (Object.keys(colors).length < arrows.length) {
    var selected = arrows.filter(function (arrow) {
      return colors[arrow.id] == null;
    }).sort(function (first, second) {
      function saturation(arrow) {
        var used = {};
        Object.keys(neighbors[arrow.id]).forEach(function (neighborId) {
          if (colors[neighborId] != null) {
            used[colors[neighborId]] = true;
          }
        });
        return Object.keys(used).length;
      }
      var saturationDifference = saturation(second) - saturation(first);
      if (saturationDifference) {
        return saturationDifference;
      }
      var degreeDifference = Object.keys(neighbors[second.id]).length - Object.keys(neighbors[first.id]).length;
      if (degreeDifference) {
        return degreeDifference;
      }
      return first.order - second.order;
    })[0];
    var usedColors = {};
    Object.keys(neighbors[selected.id]).forEach(function (neighborId) {
      if (colors[neighborId] != null) {
        usedColors[colors[neighborId]] = true;
      }
    });
    var preferred = ((colorOffset || 0) + selected.order * 3) % paletteSize;
    var chosen = null;
    for (var paletteStep = 0; paletteStep < paletteSize; paletteStep += 1) {
      var candidate = (preferred + paletteStep) % paletteSize;
      if (!usedColors[candidate]) {
        chosen = candidate;
        break;
      }
    }
    colors[selected.id] = chosen == null ? preferred : chosen;
  }

  arrows.forEach(function (arrow) {
    arrow.color = config.ARROW_COLORS[colors[arrow.id]];
  });
  return arrows;
}

function expandCornerPath(points) {
  var path = [{ r: points[0][0], c: points[0][1] }];
  for (var i = 1; i < points.length; i += 1) {
    var target = { r: points[i][0], c: points[i][1] };
    var current = path[path.length - 1];
    var dr = Math.sign(target.r - current.r);
    var dc = Math.sign(target.c - current.c);
    if (dr !== 0 && dc !== 0) {
      throw new Error('Tutorial paths must be orthogonal');
    }
    while (!sameCell(current, target)) {
      current = { r: current.r + dr, c: current.c + dc };
      path.push(current);
    }
  }
  return path;
}

function generateTutorialLevel() {
  var rows = 18;
  var cols = 16;
  var tutorialSequence = [0, 1, 2, 3, 4, 5, 6, 7];
  var cornerPaths = [
    [[0, 12], [0, 15]],
    [[5, 0], [0, 0]],
    [[2, 1], [2, 15], [13, 15], [13, 7], [15, 7], [15, 15], [17, 15], [17, 0], [14, 0]],
    [[4, 3], [4, 13], [11, 13], [11, 9], [6, 9], [6, 5], [12, 5], [12, 3], [13, 3]],
    [[10, 2], [7, 2], [7, 3]],
    [[3, 2], [6, 2]],
    [[5, 8], [5, 4]],
    [[10, 7], [8, 7]]
  ];
  var arrows = cornerPaths.map(function (points, index) {
    var arrow = makeArrow(
      'a' + index,
      expandCornerPath(points),
      config.ARROW_COLORS[index % config.ARROW_COLORS.length],
      index
    );
    arrow.tutorialOrder = tutorialSequence.indexOf(index);
    return arrow;
  });
  assignDistinctArrowColors(arrows, 1);
  var occupiedCells = arrows.reduce(function (sum, arrow) {
    return sum + arrow.cells.length;
  }, 0);
  return {
    number: 1,
    seed: config.GAME.levelSeedBase + 1,
    rows: rows,
    cols: cols,
    targetArrows: arrows.length,
    targetCells: occupiedCells,
    occupiedCells: occupiedCells,
    timeLimit: 180,
    colorMode: true,
    tutorial: true,
    layoutType: 'tutorialMiniMaze',
    silhouette: { id: 'mini-maze', name: '迷你迷宫', category: 'tutorial', variant: 0 },
    arrows: arrows,
    solution: arrows.slice().sort(function (a, b) {
      return a.tutorialOrder - b.tutorialOrder;
    }).map(function (arrow) {
      return arrow.id;
    })
  };
}

function horizontalSerpentine(rowStart, height, colStart, width, fromTop) {
  var cells = [];
  for (var step = 0; step < height; step += 1) {
    var row = fromTop ? rowStart + step : rowStart + height - 1 - step;
    if (step % 2 === 0) {
      for (var col = colStart; col < colStart + width; col += 1) {
        cells.push({ r: row, c: col });
      }
    } else {
      for (var reverseCol = colStart + width - 1; reverseCol >= colStart; reverseCol -= 1) {
        cells.push({ r: row, c: reverseCol });
      }
    }
  }
  return cells;
}

function verticalSerpentine(rowStart, height, colStart, width, fromLeft) {
  var cells = [];
  for (var step = 0; step < width; step += 1) {
    var col = fromLeft ? colStart + step : colStart + width - 1 - step;
    if (step % 2 === 0) {
      for (var row = rowStart; row < rowStart + height; row += 1) {
        cells.push({ r: row, c: col });
      }
    } else {
      for (var reverseRow = rowStart + height - 1; reverseRow >= rowStart; reverseRow -= 1) {
        cells.push({ r: reverseRow, c: col });
      }
    }
  }
  return cells;
}

function normalizedSpiral(height, width) {
  var cells = [];
  var top = 0;
  var bottom = height - 1;
  var left = 0;
  var right = width - 1;
  while (top <= bottom && left <= right) {
    for (var col = left; col <= right; col += 1) {
      cells.push({ r: top, c: col });
    }
    top += 1;
    for (var row = top; row <= bottom; row += 1) {
      cells.push({ r: row, c: right });
    }
    right -= 1;
    if (top <= bottom) {
      for (var reverseCol = right; reverseCol >= left; reverseCol -= 1) {
        cells.push({ r: bottom, c: reverseCol });
      }
      bottom -= 1;
    }
    if (left <= right) {
      for (var reverseRow = bottom; reverseRow >= top; reverseRow -= 1) {
        cells.push({ r: reverseRow, c: left });
      }
      left += 1;
    }
  }
  return cells;
}

function spiralForExit(rowStart, height, colStart, width, exitDirection) {
  var normalized;
  if (exitDirection === 'up' || exitDirection === 'down') {
    normalized = normalizedSpiral(width, height).map(function (cell) {
      return { r: cell.c, c: cell.r };
    });
    if (exitDirection === 'down') {
      normalized = normalized.map(function (cell) {
        return { r: height - 1 - cell.r, c: cell.c };
      });
    }
  } else {
    normalized = normalizedSpiral(height, width);
    if (exitDirection === 'right') {
      normalized = normalized.map(function (cell) {
        return { r: cell.r, c: width - 1 - cell.c };
      });
    }
  }
  normalized.reverse();
  return normalized.map(function (cell) {
    return { r: rowStart + cell.r, c: colStart + cell.c };
  });
}

function addDenseArrow(arrows, cells, levelNumber) {
  var id = 'a' + arrows.length;
  arrows.push(makeArrow(
    id,
    cells,
    config.ARROW_COLORS[(arrows.length + levelNumber) % config.ARROW_COLORS.length],
    arrows.length
  ));
}

function addHorizontalZone(arrows, rng, levelNumber, rowStart, height, widths, exitRight) {
  var colStart = 0;
  widths.forEach(function (width) {
    var cells;
    if (rng() < 0.68 && height >= 3 && width >= 3) {
      cells = spiralForExit(rowStart, height, colStart, width, exitRight ? 'right' : 'left');
    } else {
      cells = horizontalSerpentine(rowStart, height, colStart, width, rng() >= 0.5);
      if (!exitRight) {
        cells.reverse();
      }
    }
    addDenseArrow(arrows, cells, levelNumber);
    colStart += width;
  });
}

function addVerticalZone(arrows, rng, levelNumber, rowStart, widths, splitPatterns, exitDown) {
  var colStart = 0;
  widths.forEach(function (width, bandIndex) {
    var segmentRow = rowStart;
    splitPatterns[bandIndex].forEach(function (segmentHeight) {
      var cells;
      if (rng() < 0.68 && segmentHeight >= 3 && width >= 3) {
        cells = spiralForExit(segmentRow, segmentHeight, colStart, width, exitDown ? 'down' : 'up');
      } else {
        cells = verticalSerpentine(segmentRow, segmentHeight, colStart, width, rng() >= 0.5);
        if (!exitDown) {
          cells.reverse();
        }
      }
      addDenseArrow(arrows, cells, levelNumber);
      segmentRow += segmentHeight;
    });
    colStart += width;
  });
}

function generateBandMazeLevel(levelNumber) {
  var preset = levelPreset(levelNumber);
  var seed = config.GAME.levelSeedBase + levelNumber * 7919;
  var rng = createRng(seed);
  var arrows = [];
  var upperWide = shuffle(rng, [4, 4, 4, 3, 3]);
  var upperMedium = shuffle(rng, [6, 5, 4, 3]);
  var middleWide = shuffle(rng, [8, 4, 4, 2]);
  var middleMixed = shuffle(rng, [7, 5, 4, 2]);
  var lowerWidths = shuffle(rng, [5, 5, 5, 3]);
  var fiveWidePatterns = [
    shuffle(rng, [6, 2, 2]),
    shuffle(rng, [5, 3, 2]),
    shuffle(rng, [5, 3, 2])
  ];
  var narrowPattern = shuffle(rng, [4, 3, 3]);
  var patternIndex = 0;
  var lowerPatterns = lowerWidths.map(function (width) {
    if (width === 5) {
      var pattern = fiveWidePatterns[patternIndex];
      patternIndex += 1;
      return pattern;
    }
    return narrowPattern;
  });

  addHorizontalZone(arrows, rng, levelNumber, 0, 7, upperWide, levelNumber % 2 === 0);
  addHorizontalZone(arrows, rng, levelNumber, 7, 5, upperMedium, levelNumber % 3 !== 0);
  addHorizontalZone(arrows, rng, levelNumber, 12, 3, middleWide, levelNumber % 4 < 2);
  addHorizontalZone(arrows, rng, levelNumber, 15, 3, middleMixed, levelNumber % 5 < 3);
  addVerticalZone(arrows, rng, levelNumber, 18, lowerWidths, lowerPatterns, levelNumber % 4 !== 0);
  assignDistinctArrowColors(arrows, levelNumber);

  var level = {
    number: levelNumber,
    seed: seed,
    rows: preset.rows,
    cols: preset.cols,
    targetArrows: arrows.length,
    targetCells: preset.rows * preset.cols,
    occupiedCells: preset.rows * preset.cols,
    maskCellCount: preset.maskCells.length,
    maskCells: preset.maskCells.map(cloneCell),
    timeLimit: preset.timeLimit,
    colorMode: true,
    layoutType: 'denseMaze',
    arrows: arrows,
    solution: []
  };
  level.solution = solveLevel(level).order;
  return level;
}

function createRemainingCells(rows, cols, maskCells) {
  var remaining = {};
  (maskCells || []).forEach(function (cell) {
    if (inBounds(cell.r, cell.c, rows, cols)) {
      remaining[keyOf(cell.r, cell.c)] = { r: cell.r, c: cell.c };
    }
  });
  return remaining;
}

function cloneRemaining(remaining) {
  var copy = {};
  Object.keys(remaining).forEach(function (key) {
    copy[key] = remaining[key];
  });
  return copy;
}

function removePathFromRemaining(remaining, path) {
  var next = cloneRemaining(remaining);
  path.forEach(function (cell) {
    delete next[keyOf(cell.r, cell.c)];
  });
  return next;
}

function absorbRemainingIntoTails(rng, arrows, remaining, rows, cols, allowedEmptyCells) {
  var remainingCount = Object.keys(remaining).length;
  var headRays = {};
  arrows.forEach(function (arrow) {
    var head = arrow.cells[arrow.cells.length - 1];
    var ray = {};
    rayCellsFrom(head, config.DIRS[arrow.dir], rows, cols).forEach(function (cell) {
      ray[keyOf(cell.r, cell.c)] = true;
    });
    headRays[arrow.id] = ray;
  });

  var progress = true;
  while (remainingCount > allowedEmptyCells && progress) {
    progress = false;
    var candidates = shuffle(rng, arrows).map(function (arrow) {
      var isLong = arrow.cells.length >= DENSE_LONG_LENGTH;
      var maxLength = isLong ? 72 : DENSE_LONG_LENGTH - 1;
      if (arrow.cells.length >= maxLength) {
        return null;
      }
      var tail = arrow.cells[0];
      var options = config.DIR_LIST.map(function (dir) {
        var cell = { r: tail.r + dir.dr, c: tail.c + dir.dc };
        var key = keyOf(cell.r, cell.c);
        if (!remaining[key] || headRays[arrow.id][key]) {
          return null;
        }
        return {
          cell: cell,
          degree: availableNeighborCount(cell, remaining, {})
        };
      }).filter(Boolean).sort(function (first, second) {
        return first.degree - second.degree || rng() - 0.5;
      });
      if (!options.length) {
        return null;
      }
      return { arrow: arrow, option: options[0] };
    }).filter(Boolean).sort(function (first, second) {
      return first.option.degree - second.option.degree || first.arrow.cells.length - second.arrow.cells.length;
    });

    for (var index = 0; index < candidates.length && remainingCount > allowedEmptyCells; index += 1) {
      var selected = candidates[index];
      var selectedKey = keyOf(selected.option.cell.r, selected.option.cell.c);
      if (!remaining[selectedKey]) {
        continue;
      }
      var currentTail = selected.arrow.cells[0];
      if (Math.abs(currentTail.r - selected.option.cell.r) + Math.abs(currentTail.c - selected.option.cell.c) !== 1) {
        continue;
      }
      selected.arrow.cells.unshift(selected.option.cell);
      delete remaining[selectedKey];
      remainingCount -= 1;
      progress = true;
    }
  }
  return remainingCount;
}

function isRayOpenInRemaining(head, dir, remaining, rows, cols) {
  var row = head.r + dir.dr;
  var col = head.c + dir.dc;
  while (inBounds(row, col, rows, cols)) {
    if (remaining[keyOf(row, col)]) {
      return false;
    }
    row += dir.dr;
    col += dir.dc;
  }
  return true;
}

function collectExtractionCandidates(
  rng,
  remaining,
  rows,
  cols,
  directionCounts,
  recentDirections,
  lineDirectionCounts,
  extractedOccupancy,
  blockerLoads
) {
  var candidates = [];
  var recent = recentDirections || [];
  var placedCount = directionCounts.up + directionCounts.right + directionCounts.down + directionCounts.left;
  Object.keys(remaining).forEach(function (key) {
    var head = remaining[key];
    config.DIR_LIST.forEach(function (dir) {
      var behind = { r: head.r - dir.dr, c: head.c - dir.dc };
      if (!remaining[keyOf(behind.r, behind.c)]) {
        return;
      }
      if (!isRayOpenInRemaining(head, dir, remaining, rows, cols)) {
        return;
      }
      var rayDepth = rayCellsFrom(head, dir, rows, cols).length;
      var blockerId = null;
      var ray = rayCellsFrom(head, dir, rows, cols);
      for (var rayIndex = 0; rayIndex < ray.length; rayIndex += 1) {
        blockerId = extractedOccupancy && extractedOccupancy[keyOf(ray[rayIndex].r, ray[rayIndex].c)];
        if (blockerId) {
          break;
        }
      }
      var count = directionCounts[dir.id] || 0;
      var score = rayDepth * 3.4 - count * 5.6 + rng() * 3;
      if (blockerId) {
        var blockerRank = parseInt(blockerId.slice(1), 10);
        var dependencyAge = Number.isFinite(blockerRank)
          ? Math.max(0, placedCount - 1 - blockerRank)
          : placedCount;
        var blockerLoad = blockerLoads && blockerLoads[blockerId] || 0;
        score += 44 - dependencyAge * 2.4 - blockerLoad * 18;
      } else if (placedCount > 0) {
        score -= 44;
      }
      var lineStats;
      var oppositeId;
      if (dir.id === 'left' || dir.id === 'right') {
        lineStats = lineDirectionCounts.rows[head.r] || { left: 0, right: 0 };
        oppositeId = dir.id === 'left' ? 'right' : 'left';
      } else {
        lineStats = lineDirectionCounts.cols[head.c] || { up: 0, down: 0 };
        oppositeId = dir.id === 'up' ? 'down' : 'up';
      }
      score += (lineStats[oppositeId] || 0) * 12 - (lineStats[dir.id] || 0) * 24;
      if ((lineStats[dir.id] || 0) >= 2 && !(lineStats[oppositeId] || 0)) {
        score -= 150;
      }
      if (placedCount >= 4 && rayDepth === 0) {
        score -= 45;
      }
      if (recent.length && recent[recent.length - 1] === dir.id) {
        score -= 24;
      }
      if (
        recent.length >= 2 &&
        recent[recent.length - 1] === dir.id &&
        recent[recent.length - 2] === dir.id
      ) {
        score -= 72;
      }
      candidates.push({
        head: cloneCell(head),
        dir: dir,
        rayDepth: rayDepth,
        blockerId: blockerId,
        score: score
      });
    });
  });
  candidates.sort(function (a, b) {
    return b.score - a.score;
  });
  return candidates;
}

function availableNeighborCount(cell, remaining, used) {
  var count = 0;
  config.DIR_LIST.forEach(function (dir) {
    var key = keyOf(cell.r + dir.dr, cell.c + dir.dc);
    if (remaining[key] && !used[key]) {
      count += 1;
    }
  });
  return count;
}

function countPathTurns(path) {
  var turns = 0;
  for (var index = 2; index < path.length; index += 1) {
    var before = path[index - 2];
    var middle = path[index - 1];
    var after = path[index];
    if (
      middle.r - before.r !== after.r - middle.r ||
      middle.c - before.c !== after.c - middle.c
    ) {
      turns += 1;
    }
  }
  return turns;
}

function buildExtractionPathAttempt(rng, candidate, desiredLength, remaining) {
  var head = candidate.head;
  var dir = candidate.dir;
  var behind = { r: head.r - dir.dr, c: head.c - dir.dc };
  var backwards = [cloneCell(head), behind];
  var used = {};
  var forbidden = {};
  used[keyOf(head.r, head.c)] = true;
  used[keyOf(behind.r, behind.c)] = true;
  rayCellsFrom(head, dir, DENSE_ROWS, DENSE_COLS).forEach(function (cell) {
    forbidden[keyOf(cell.r, cell.c)] = true;
  });
  var lastDir = { dr: -dir.dr, dc: -dir.dc };
  var straightRun = 1;

  while (backwards.length < desiredLength) {
    var current = backwards[backwards.length - 1];
    var options = [];
    config.DIR_LIST.forEach(function (nextDir) {
      var next = { r: current.r + nextDir.dr, c: current.c + nextDir.dc };
      var nextKey = keyOf(next.r, next.c);
      if (!remaining[nextKey] || used[nextKey] || forbidden[nextKey]) {
        return;
      }
      var sameDirection = nextDir.dr === lastDir.dr && nextDir.dc === lastDir.dc;
      var degree = availableNeighborCount(next, remaining, used);
      var score = rng() * 3 + Math.min(3, degree) * 0.55;
      if (sameDirection) {
        score += straightRun <= 2 ? 1.2 : straightRun <= 4 ? 0 : -4;
      } else {
        score += straightRun >= 2 ? 2.8 : -0.8;
      }
      if (degree === 0 && backwards.length + 1 < desiredLength) {
        score -= 8;
      }
      options.push({ cell: next, dir: nextDir, score: score });
    });
    options.sort(function (a, b) {
      return b.score - a.score;
    });
    if (!options.length) {
      break;
    }
    var pickLimit = Math.min(options.length, rng() < 0.82 ? 2 : 3);
    var picked = options[Math.floor(rng() * pickLimit)];
    var changedDirection = picked.dir.dr !== lastDir.dr || picked.dir.dc !== lastDir.dc;
    backwards.push(picked.cell);
    used[keyOf(picked.cell.r, picked.cell.c)] = true;
    straightRun = changedDirection ? 1 : straightRun + 1;
    lastDir = picked.dir;
  }

  backwards.reverse();
  return backwards;
}

function buildExtractionPath(rng, candidate, desiredLength, remaining) {
  var best = null;
  var bestScore = -Infinity;
  var attemptCount = desiredLength >= DENSE_LONG_LENGTH ? 14 : 8;
  for (var attempt = 0; attempt < attemptCount; attempt += 1) {
    var variedLength = Math.max(2, desiredLength + Math.floor(rng() * 5) - 2);
    var path = buildExtractionPathAttempt(rng, candidate, variedLength, remaining);
    var turns = countPathTurns(path);
    var score = path.length * 3 + turns * 2.2 - Math.abs(path.length - desiredLength) * 1.4;
    if (path.length >= DENSE_LONG_LENGTH && turns < 6) {
      score -= 12;
    }
    if (desiredLength >= DENSE_LONG_LENGTH && path.length < DENSE_LONG_LENGTH) {
      score -= 36;
    }
    if (score > bestScore) {
      best = path;
      bestScore = score;
    }
  }
  return best;
}

function remainingComponentSizes(remaining) {
  var unseen = {};
  Object.keys(remaining).forEach(function (key) {
    unseen[key] = true;
  });
  var sizes = [];
  Object.keys(unseen).forEach(function (startKey) {
    if (!unseen[startKey]) {
      return;
    }
    var queue = [remaining[startKey]];
    var size = 0;
    delete unseen[startKey];
    while (queue.length) {
      var cell = queue.shift();
      size += 1;
      config.DIR_LIST.forEach(function (dir) {
        var neighborKey = keyOf(cell.r + dir.dr, cell.c + dir.dc);
        if (unseen[neighborKey]) {
          delete unseen[neighborKey];
          queue.push(remaining[neighborKey]);
        }
      });
    }
    sizes.push(size);
  });
  return sizes;
}

function hasAnyExtractionCandidate(remaining, rows, cols) {
  var keys = Object.keys(remaining);
  for (var i = 0; i < keys.length; i += 1) {
    var head = remaining[keys[i]];
    for (var d = 0; d < config.DIR_LIST.length; d += 1) {
      var dir = config.DIR_LIST[d];
      var behindKey = keyOf(head.r - dir.dr, head.c - dir.dc);
      if (remaining[behindKey] && isRayOpenInRemaining(head, dir, remaining, rows, cols)) {
        return true;
      }
    }
  }
  return false;
}

function isViableRemainder(remaining, rows, cols, allowedEmptyCells) {
  var count = Object.keys(remaining).length;
  if (count <= allowedEmptyCells) {
    return true;
  }
  var componentSizes = remainingComponentSizes(remaining);
  for (var i = 0; i < componentSizes.length; i += 1) {
    if (componentSizes[i] === 1) {
      return false;
    }
  }
  return hasAnyExtractionCandidate(remaining, rows, cols);
}

function campaignProgress(levelNumber) {
  return Math.max(0, Math.min(1, (levelNumber - 2) / 998));
}

function desiredExtractionLength(rng, arrowIndex, remainingCount, longCount, targetArrows, targetLong) {
  var remainingArrows = Math.max(1, targetArrows - arrowIndex);
  var average = Math.round(remainingCount / remainingArrows * 1.7);
  var needLong = longCount < targetLong && (arrowIndex < targetLong * 2 + 2 || targetLong - longCount >= remainingArrows);
  if (needLong) {
    return 31 + Math.floor(rng() * 6);
  }
  return Math.max(6, Math.min(29, average + Math.floor(rng() * 5) - 2));
}

function splitIndexForArrow(path, rows, cols) {
  var midpoint = path.length / 2;
  var bestIndex = -1;
  var bestScore = -Infinity;
  var originalDir = directionFromPath(path);
  var originalHead = path[path.length - 1];
  var exitRay = {};
  rayCellsFrom(originalHead, originalDir, rows, cols).forEach(function (cell) {
    exitRay[keyOf(cell.r, cell.c)] = true;
  });
  for (var index = 3; index <= path.length - 3; index += 1) {
    var before = path[index - 2];
    var tailHead = path[index - 1];
    var headTail = path[index];
    var incomingRow = tailHead.r - before.r;
    var incomingCol = tailHead.c - before.c;
    var bridgeRow = headTail.r - tailHead.r;
    var bridgeCol = headTail.c - tailHead.c;
    if (incomingRow !== bridgeRow || incomingCol !== bridgeCol) {
      continue;
    }
    var headBlockedByTail = path.slice(0, index).some(function (cell) {
      return exitRay[keyOf(cell.r, cell.c)];
    });
    if (headBlockedByTail) {
      continue;
    }
    var balance = -Math.abs(index - midpoint);
    var edgeRoom = Math.min(index, path.length - index);
    var score = balance + edgeRoom * 0.25;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

function sameAxisLineMetrics(routes) {
  var rows = {};
  var cols = {};
  var groups = {};
  routes.forEach(function (route) {
    var dir = directionFromPath(route.cells);
    var head = route.cells[route.cells.length - 1];
    if (dir.id === 'left' || dir.id === 'right') {
      var row = rows[head.r] || { left: 0, right: 0 };
      row[dir.id] += 1;
      rows[head.r] = row;
      var rowKey = 'r:' + head.r + ':' + dir.id;
      groups[rowKey] = groups[rowKey] || [];
      groups[rowKey].push({ position: head.c, id: route.id });
    } else {
      var col = cols[head.c] || { up: 0, down: 0 };
      col[dir.id] += 1;
      cols[head.c] = col;
      var colKey = 'c:' + head.c + ':' + dir.id;
      groups[colKey] = groups[colKey] || [];
      groups[colKey].push({ position: head.r, id: route.id });
    }
  });
  var maxShare = 0;
  Object.keys(rows).forEach(function (rowKey) {
    var row = rows[rowKey];
    var total = row.left + row.right;
    if (total >= 3) {
      maxShare = Math.max(maxShare, Math.max(row.left, row.right) / total);
    }
  });
  Object.keys(cols).forEach(function (colKey) {
    var col = cols[colKey];
    var total = col.up + col.down;
    if (total >= 3) {
      maxShare = Math.max(maxShare, Math.max(col.up, col.down) / total);
    }
  });
  var violationCount = 0;
  var violationIds = {};
  Object.keys(groups).forEach(function (groupKey) {
    var items = groups[groupKey].sort(function (a, b) { return a.position - b.position; });
    var cluster = [];
    items.forEach(function (item) {
      if (cluster.length && item.position - cluster[cluster.length - 1].position > 3) {
        if (cluster.length >= 3) {
          violationCount += 1;
          cluster.forEach(function (entry) { violationIds[entry.id] = true; });
        }
        cluster = [];
      }
      cluster.push(item);
    });
    if (cluster.length >= 3) {
      violationCount += 1;
      cluster.forEach(function (entry) { violationIds[entry.id] = true; });
    }
  });
  return {
    violationCount: violationCount,
    violationIds: violationIds,
    maxShare: maxShare
  };
}

function routeLayoutStats(routes) {
  var counts = { up: 0, right: 0, down: 0, left: 0 };
  routes.forEach(function (route) {
    counts[directionFromPath(route.cells).id] += 1;
  });
  var axisMetrics = sameAxisLineMetrics(routes);
  var total = Math.max(1, routes.length);
  return {
    axisViolations: axisMetrics.violationCount,
    directionShare: Math.max(counts.up, counts.right, counts.down, counts.left) / total
  };
}

function splitRoutesForDifficulty(arrows, levelNumber, targetCount, targetLong, rows, cols) {
  var routes = arrows.map(function (arrow) {
    return { cells: arrow.cells.map(cloneCell), sourceOrder: arrow.order };
  });
  while (routes.length < targetCount) {
    var longRouteCount = routes.filter(function (route) {
      return route.cells.length >= DENSE_LONG_LENGTH;
    }).length;
    var requiredLongRoutes = targetLong;
    var choices = routes.map(function (route, index) {
      var splitIndex = splitIndexForArrow(route.cells, rows, cols);
      if (splitIndex < 0) {
        return null;
      }
      var preservesLongQuota = route.cells.length < DENSE_LONG_LENGTH || longRouteCount > requiredLongRoutes;
      var turns = countPathTurns(route.cells);
      return {
        index: index,
        splitIndex: splitIndex,
        score: (preservesLongQuota ? 100 : 0) + route.cells.length * 2 - turns * 1.5
      };
    }).filter(Boolean).sort(function (a, b) {
      return b.score - a.score;
    });
    if (!choices.length || choices[0].score < 100) {
      break;
    }
    var acceptedSplit = false;
    for (var choiceIndex = 0; choiceIndex < choices.length; choiceIndex += 1) {
      var choice = choices[choiceIndex];
      if (choice.score < 100) {
        break;
      }
      var route = routes[choice.index];
      var headRoute = {
        cells: route.cells.slice(choice.splitIndex),
        sourceOrder: route.sourceOrder
      };
      var tailRoute = {
        cells: route.cells.slice(0, choice.splitIndex),
        sourceOrder: route.sourceOrder
      };
      var proposedRoutes = routes.slice();
      proposedRoutes.splice(choice.index, 1, headRoute, tailRoute);
      if (proposedRoutes.some(function (proposedRoute) {
        return pathPointsIntoOwnBody(proposedRoute.cells, rows, cols);
      })) {
        continue;
      }
      var probeArrows = proposedRoutes.map(function (proposedRoute, index) {
        return makeArrow('probe' + index, proposedRoute.cells, config.COLORS.navy, index);
      });
      var probeLevel = {
        rows: rows,
        cols: cols,
        arrows: probeArrows,
        solution: probeArrows.map(function (arrow) { return arrow.id; })
      };
      if (solveLevel(probeLevel).solved) {
        routes = proposedRoutes;
        acceptedSplit = true;
        break;
      }
    }
    if (!acceptedSplit) {
      break;
    }
  }
  return routes.map(function (route, index) {
    return makeArrow(
      'a' + index,
      route.cells,
      config.ARROW_COLORS[(index + levelNumber) % config.ARROW_COLORS.length],
      index
    );
  });
}

function buildExtractedMazeCandidate(levelNumber, retry, options) {
  var preset = levelPreset(levelNumber);
  var seed = config.GAME.levelSeedBase + levelNumber * 7919 + retry * 104729;
  var rng = createRng(seed);
  var remaining = createRemainingCells(preset.rows, preset.cols, preset.maskCells);
  var remainingCount = preset.maskCells.length;
  var maskCellCount = remainingCount;
  var progress = campaignProgress(levelNumber);
  var targetArrowCount = 90 + Math.floor(rng() * 6);
  var extractionArrowCount = targetArrowCount;
  var targetLongCount = Math.min(10, 8 + Math.floor(progress * 3));
  var allowedEmptyCells = Math.max(2, Math.floor(remainingCount * 0.02));
  var arrows = [];
  var solution = [];
  var directionCounts = { up: 0, right: 0, down: 0, left: 0 };
  var lineDirectionCounts = { rows: {}, cols: {} };
  var recentDirections = [];
  var longCount = 0;
  var failureBudget = 90;
  var extractedOccupancy = {};
  var blockerLoads = {};

  while (remainingCount > allowedEmptyCells && arrows.length < extractionArrowCount && failureBudget > 0) {
    var candidates = collectExtractionCandidates(
      rng,
      remaining,
      preset.rows,
      preset.cols,
      directionCounts,
      recentDirections,
      lineDirectionCounts,
      extractedOccupancy,
      blockerLoads
    );
    if (!candidates.length) {
      break;
    }
    var desiredLength = desiredExtractionLength(
      rng,
      arrows.length,
      remainingCount,
      longCount,
      extractionArrowCount,
      targetLongCount
    );
    var placed = false;
    var directionLimit = Math.max(2, Math.ceil((arrows.length + 1) * 0.35));
    var balancedCandidates = candidates.filter(function (candidate) {
      return directionCounts[candidate.dir.id] + 1 <= directionLimit;
    });
    var directionPool = balancedCandidates.length ? balancedCandidates : candidates;
    var dependentCandidates = directionPool.filter(function (candidate) {
      return !!candidate.blockerId;
    });
    var candidatePool = dependentCandidates.length && (arrows.length < 10 || rng() < 0.995)
      ? dependentCandidates
      : directionPool;
    var candidateLimit = Math.min(candidatePool.length, 72);
    for (var candidateIndex = 0; candidateIndex < candidateLimit; candidateIndex += 1) {
      var pickIndex = candidateIndex < 18
        ? Math.floor(rng() * Math.min(16, candidatePool.length))
        : candidateIndex;
      var candidate = candidatePool[pickIndex];
      var path = buildExtractionPath(rng, candidate, desiredLength, remaining);
      if (!path || path.length < 2) {
        continue;
      }
      if (pathPointsIntoOwnBody(path, preset.rows, preset.cols)) {
        continue;
      }
      var nextRemaining = removePathFromRemaining(remaining, path);
      if (!isViableRemainder(nextRemaining, preset.rows, preset.cols, allowedEmptyCells)) {
        continue;
      }
      var arrow = makeArrow(
        'a' + arrows.length,
        path,
        config.ARROW_COLORS[(arrows.length + levelNumber) % config.ARROW_COLORS.length],
        arrows.length
      );
      arrows.push(arrow);
      solution.push(arrow.id);
      if (candidate.blockerId) {
        blockerLoads[candidate.blockerId] = (blockerLoads[candidate.blockerId] || 0) + 1;
      }
      path.forEach(function (cell) {
        extractedOccupancy[keyOf(cell.r, cell.c)] = arrow.id;
      });
      remaining = nextRemaining;
      remainingCount -= path.length;
      directionCounts[arrow.dir] += 1;
      if (arrow.dir === 'left' || arrow.dir === 'right') {
        var rowStats = lineDirectionCounts.rows[candidate.head.r] || { left: 0, right: 0 };
        rowStats[arrow.dir] += 1;
        lineDirectionCounts.rows[candidate.head.r] = rowStats;
      } else {
        var colStats = lineDirectionCounts.cols[candidate.head.c] || { up: 0, down: 0 };
        colStats[arrow.dir] += 1;
        lineDirectionCounts.cols[candidate.head.c] = colStats;
      }
      recentDirections.push(arrow.dir);
      if (recentDirections.length > 3) {
        recentDirections.shift();
      }
      if (path.length >= DENSE_LONG_LENGTH) {
        longCount += 1;
      }
      placed = true;
      break;
    }
    if (!placed) {
      failureBudget -= 1;
    }
  }

  remainingCount = absorbRemainingIntoTails(
    rng,
    arrows,
    remaining,
    preset.rows,
    preset.cols,
    allowedEmptyCells
  );

  arrows = splitRoutesForDifficulty(
    arrows,
    levelNumber,
    targetArrowCount,
    targetLongCount,
    preset.rows,
    preset.cols
  );
  var candidateDensity = (maskCellCount - remainingCount) / Math.max(1, maskCellCount);
  solution = options && options.skipSolution
    ? []
    : solveLevel({ rows: preset.rows, cols: preset.cols, arrows: arrows }).order;
  directionCounts = { up: 0, right: 0, down: 0, left: 0 };
  arrows.forEach(function (arrow) {
    directionCounts[arrow.dir] += 1;
  });
  assignDistinctArrowColors(arrows, levelNumber + retry);
  var occupiedCells = maskCellCount - remainingCount;
  var builtLevel = {
    number: levelNumber,
    seed: seed,
    rows: preset.rows,
    cols: preset.cols,
    targetArrows: arrows.length,
    targetCells: preset.rows * preset.cols - allowedEmptyCells,
    occupiedCells: occupiedCells,
    maskCellCount: preset.maskCells.length,
    maskCells: preset.maskCells.map(cloneCell),
    timeLimit: preset.timeLimit,
    colorMode: true,
    layoutType: 'denseMaze',
    generationType: 'dependencyCarve',
    generationRetry: retry,
    silhouette: preset.silhouette,
    arrows: arrows,
    solution: solution,
    directionCounts: directionCounts
  };
  if (!(options && options.skipOrientationOptimization) && arrows.length >= 80 && candidateDensity >= 0.75) {
    optimizeCandidateOrientations(builtLevel);
  }
  return builtLevel;
}

function analyzePuzzle(level) {
  var directionCounts = { up: 0, right: 0, down: 0, left: 0 };
  var longArrows = 0;
  var windingArrows = 0;
  var maxDirectionRun = 0;
  var currentRun = 0;
  var previousDirection = null;
  level.arrows.forEach(function (arrow) {
    directionCounts[arrow.dir] += 1;
    if (arrow.cells.length >= DENSE_LONG_LENGTH) {
      longArrows += 1;
    }
    if (countPathTurns(arrow.cells) >= 4) {
      windingArrows += 1;
    }
  });
  level.solution.forEach(function (arrowId) {
    var arrow = level.arrows.filter(function (item) { return item.id === arrowId; })[0];
    if (!arrow) {
      return;
    }
    if (arrow.dir === previousDirection) {
      currentRun += 1;
    } else {
      previousDirection = arrow.dir;
      currentRun = 1;
    }
    maxDirectionRun = Math.max(maxDirectionRun, currentRun);
  });

  var graph = buildDependencyGraph(level.arrows, level.rows, level.cols);
  var dependencyCounts = {};
  var active = {};
  var removable = {};
  graph.arrows.forEach(function (arrow) {
    active[arrow.id] = true;
    dependencyCounts[arrow.id] = Object.keys(graph.dependencies[arrow.id]).length;
    if (!dependencyCounts[arrow.id]) {
      removable[arrow.id] = true;
    }
  });
  var frontierTotal = 0;
  var frontierMax = 0;
  var unlockBursts = 0;
  level.solution.forEach(function (arrowId) {
    var frontierSize = Object.keys(removable).length;
    frontierTotal += frontierSize;
    frontierMax = Math.max(frontierMax, frontierSize);
    if (!active[arrowId]) {
      return;
    }
    active[arrowId] = false;
    delete removable[arrowId];
    var unlocked = 0;
    (graph.dependents[arrowId] || []).forEach(function (dependentId) {
      if (!active[dependentId]) {
        return;
      }
      dependencyCounts[dependentId] -= 1;
      if (!dependencyCounts[dependentId]) {
        removable[dependentId] = true;
        unlocked += 1;
      }
    });
    if (unlocked >= 2) {
      unlockBursts += 1;
    }
  });
  var arrowCount = Math.max(1, level.arrows.length);
  var maxDirectionCount = Math.max(
    directionCounts.up,
    directionCounts.right,
    directionCounts.down,
    directionCounts.left
  );
  var minDirectionCount = Math.min(
    directionCounts.up,
    directionCounts.right,
    directionCounts.down,
    directionCounts.left
  );
  var axisMetrics = sameAxisLineMetrics(level.arrows);
  return {
    directionCounts: directionCounts,
    directionShare: maxDirectionCount / arrowCount,
    minDirectionCount: minDirectionCount,
    maxDirectionRun: maxDirectionRun,
    longArrows: longArrows,
    windingArrows: windingArrows,
    initialRemovable: graph.arrows.filter(function (arrow) {
      return Object.keys(graph.dependencies[arrow.id]).length === 0;
    }).length,
    averageFrontier: frontierTotal / arrowCount,
    maxFrontier: frontierMax,
    unlockBursts: unlockBursts,
    sameAxisLineViolations: axisMetrics.violationCount,
    maxSameAxisLineShare: axisMetrics.maxShare
  };
}

function axisViolationArrowIds(arrows) {
  return sameAxisLineMetrics(arrows).violationIds;
}

function directionRunViolationIds(level) {
  var byId = {};
  level.arrows.forEach(function (arrow) { byId[arrow.id] = arrow; });
  var ids = {};
  var run = [];
  var previous = null;
  level.solution.forEach(function (id) {
    var arrow = byId[id];
    if (!arrow) {
      return;
    }
    if (arrow.dir === previous) {
      run.push(id);
    } else {
      run = [id];
      previous = arrow.dir;
    }
    if (run.length > 3) {
      run.forEach(function (runId) { ids[runId] = true; });
    }
  });
  return ids;
}

function maxDirectionRunForSolution(arrows, solution) {
  var byId = {};
  arrows.forEach(function (arrow) { byId[arrow.id] = arrow; });
  var previous = null;
  var current = 0;
  var maximum = 0;
  solution.forEach(function (id) {
    var arrow = byId[id];
    if (!arrow) {
      return;
    }
    if (arrow.dir === previous) {
      current += 1;
    } else {
      previous = arrow.dir;
      current = 1;
    }
    maximum = Math.max(maximum, current);
  });
  return maximum;
}

function optimizeArrowOrientations(arrows, rows, cols, rng) {
  var level = { rows: rows, cols: cols, arrows: arrows, solution: [] };
  var solved = solveLevel(level);
  level.solution = solved.order;
  var layout = routeLayoutStats(arrows);
  var axisPass = 0;
  while (layout.axisViolations > 1 && axisPass < 12) {
    axisPass += 1;
    var violationIds = axisViolationArrowIds(arrows);
    var pool = shuffle(rng, arrows.filter(function (arrow) {
      return violationIds[arrow.id];
    }));
    if (!pool.length) {
      break;
    }
    var accepted = false;
    for (var poolIndex = 0; poolIndex < pool.length && !accepted; poolIndex += 1) {
      var arrow = pool[poolIndex];
      var previousCells = arrow.cells;
      var previousDir = arrow.dir;
      arrow.cells = arrow.cells.slice().reverse();
      arrow.dir = directionFromPath(arrow.cells).id;
      var layoutStats = pathPointsIntoOwnBody(arrow.cells, rows, cols) ? null : routeLayoutStats(arrows);
      if (
        layoutStats &&
        layoutStats.axisViolations < layout.axisViolations &&
        layoutStats.directionShare <= Math.max(0.35, layout.directionShare)
      ) {
        var nextSolved = solveLevel(level);
        if (nextSolved.solved) {
          level.solution = nextSolved.order;
          solved = nextSolved;
          layout = layoutStats;
          accepted = true;
        }
      }
      if (!accepted) {
        arrow.cells = previousCells;
        arrow.dir = previousDir;
      }
    }
    if (!accepted) {
      for (var firstIndex = 0; firstIndex < pool.length && !accepted; firstIndex += 1) {
        var first = pool[firstIndex];
        var firstCells = first.cells;
        var firstDir = first.dir;
        first.cells = first.cells.slice().reverse();
        first.dir = directionFromPath(first.cells).id;
        if (pathPointsIntoOwnBody(first.cells, rows, cols)) {
          first.cells = firstCells;
          first.dir = firstDir;
          continue;
        }
        var pairPool = shuffle(rng, arrows);
        for (var secondIndex = 0; secondIndex < pairPool.length && !accepted; secondIndex += 1) {
          var second = pairPool[secondIndex];
          if (second.id === first.id) {
            continue;
          }
          var secondCells = second.cells;
          var secondDir = second.dir;
          second.cells = second.cells.slice().reverse();
          second.dir = directionFromPath(second.cells).id;
          var pairStats = pathPointsIntoOwnBody(second.cells, rows, cols) ? null : routeLayoutStats(arrows);
          if (
            pairStats &&
            pairStats.axisViolations < layout.axisViolations &&
            pairStats.directionShare <= Math.max(0.35, layout.directionShare)
          ) {
            var pairSolved = solveLevel(level);
            if (pairSolved.solved) {
              level.solution = pairSolved.order;
              solved = pairSolved;
              layout = pairStats;
              accepted = true;
            }
          }
          if (!accepted) {
            second.cells = secondCells;
            second.dir = secondDir;
          }
        }
        if (!accepted) {
          first.cells = firstCells;
          first.dir = firstDir;
        }
      }
    }
    if (!accepted) {
      break;
    }
  }

  var attempts = 0;
  var maxRun = maxDirectionRunForSolution(arrows, solved.order);
  while (maxRun > 3 && attempts < 24) {
    attempts += 1;
    var runIds = directionRunViolationIds(level);
    var runPool = arrows.filter(function (arrow) { return runIds[arrow.id]; });
    if (!runPool.length) {
      break;
    }
    var runArrow = runPool[Math.floor(rng() * runPool.length)];
    var runPreviousCells = runArrow.cells;
    var runPreviousDir = runArrow.dir;
    runArrow.cells = runArrow.cells.slice().reverse();
    runArrow.dir = directionFromPath(runArrow.cells).id;
    if (pathPointsIntoOwnBody(runArrow.cells, rows, cols)) {
      runArrow.cells = runPreviousCells;
      runArrow.dir = runPreviousDir;
      continue;
    }
    var runSolved = solveLevel(level);
    if (!runSolved.solved) {
      runArrow.cells = runPreviousCells;
      runArrow.dir = runPreviousDir;
      continue;
    }
    level.solution = runSolved.order;
    var runLayout = routeLayoutStats(arrows);
    var nextMaxRun = maxDirectionRunForSolution(arrows, runSolved.order);
    if (
      nextMaxRun < maxRun &&
      runLayout.axisViolations <= Math.max(1, layout.axisViolations) &&
      runLayout.directionShare <= 0.35
    ) {
      solved = runSolved;
      layout = runLayout;
      maxRun = nextMaxRun;
    } else {
      runArrow.cells = runPreviousCells;
      runArrow.dir = runPreviousDir;
      level.solution = solved.order;
    }
  }
  return solved.order;
}

function optimizeCandidateOrientations(level) {
  var originalStarts = {};
  level.arrows.forEach(function (arrow) {
    originalStarts[arrow.id] = keyOf(arrow.cells[0].r, arrow.cells[0].c);
  });
  level.solution = optimizeArrowOrientations(
    level.arrows,
    level.rows,
    level.cols,
    createRng((level.seed ^ 0x9e3779b9) >>> 0)
  );
  level.directionCounts = { up: 0, right: 0, down: 0, left: 0 };
  level.arrows.forEach(function (arrow) {
    level.directionCounts[arrow.dir] += 1;
  });
  level.orientationFlips = level.arrows.filter(function (arrow) {
    return keyOf(arrow.cells[0].r, arrow.cells[0].c) !== originalStarts[arrow.id];
  }).map(function (arrow) {
    return arrow.id;
  });
  return level;
}

function applyLevelRecipe(level, recipe) {
  var flips = {};
  (recipe.flips || []).forEach(function (id) { flips[id] = true; });
  level.arrows.forEach(function (arrow) {
    if (flips[arrow.id]) {
      arrow.cells = arrow.cells.slice().reverse();
      arrow.dir = directionFromPath(arrow.cells).id;
    }
  });
  level.solution = Array.isArray(recipe.solution)
    ? recipe.solution.slice()
    : solveLevel(level).order;
  level.directionCounts = { up: 0, right: 0, down: 0, left: 0 };
  level.arrows.forEach(function (arrow) {
    level.directionCounts[arrow.dir] += 1;
  });
  if (recipe.analysis) {
    level.analysis = JSON.parse(JSON.stringify(recipe.analysis));
  }
  return level;
}

function scoreExtractedMaze(level, report, analysis) {
  var targets = denseQualityTargets(level);
  var score = report.density * 45;
  score += Math.min(targets.maxArrows, report.arrows) * 0.7;
  score += Math.min(targets.longArrows + 3, analysis.longArrows) * 1.4;
  score += Math.min(targets.windingArrows + 5, analysis.windingArrows) * 0.45;
  score += Math.min(8, analysis.minDirectionCount) * 2;
  score -= Math.max(0, targets.minDensity - report.density) * 320;
  score -= Math.max(0, targets.minArrows - report.arrows) * 9;
  score -= Math.max(0, report.arrows - targets.maxArrows) * 12;
  score -= Math.max(0, analysis.longArrows - targets.maxLongArrows) * 15;
  score -= Math.max(0, analysis.directionShare - 0.35) * 140;
  score -= Math.max(0, analysis.maxDirectionRun - 3) * 9;
  score -= Math.abs(analysis.initialRemovable - targets.preferredInitialRemovable) * 8;
  score -= Math.max(0, analysis.initialRemovable - targets.maxInitialRemovable) * 16;
  score -= Math.max(0, analysis.averageFrontier - targets.maxAverageFrontier) * 16;
  score -= Math.max(0, analysis.maxFrontier - targets.maxFrontier) * 11;
  score -= analysis.sameAxisLineViolations * 25;
  score -= Math.max(0, analysis.maxSameAxisLineShare - 0.75) * 18;
  return score;
}

function denseQualityTargets(level) {
  var progress = campaignProgress(level.number || 2);
  return {
    minDensity: 0.8,
    minBoardDensity: 0.7 * 0.8,
    minArrows: 80,
    maxArrows: 95,
    longArrows: 8,
    maxLongArrows: 10,
    windingArrows: 18,
    minDirectionCount: 12,
    preferredInitialRemovable: progress < 0.18 ? 3 : 2,
    maxInitialRemovable: 4,
    maxAverageFrontier: 6,
    maxFrontier: 9,
    maxDirectionShare: 0.35,
    maxDirectionRun: 3,
    maxSameAxisLineViolations: 1
  };
}

function meetsDenseQuality(report, analysis) {
  var level = arguments[2];
  var targets = denseQualityTargets(level || { rows: DENSE_ROWS, cols: DENSE_COLS, maskCells: [] });
  return (
    report.valid &&
    report.density >= targets.minDensity &&
    report.boardDensity >= targets.minBoardDensity &&
    report.arrows >= targets.minArrows &&
    report.arrows <= targets.maxArrows &&
    analysis.longArrows >= targets.longArrows &&
    analysis.longArrows <= targets.maxLongArrows &&
    analysis.windingArrows >= targets.windingArrows &&
    analysis.minDirectionCount >= targets.minDirectionCount &&
    analysis.directionShare <= targets.maxDirectionShare &&
    analysis.maxDirectionRun <= targets.maxDirectionRun &&
    analysis.initialRemovable >= 1 &&
    analysis.initialRemovable <= targets.maxInitialRemovable &&
    analysis.averageFrontier <= targets.maxAverageFrontier &&
    analysis.maxFrontier <= targets.maxFrontier &&
    analysis.sameAxisLineViolations <= targets.maxSameAxisLineViolations
  );
}

function denseReleaseTargets(level) {
  var quality = denseQualityTargets(level);
  return {
    minDensity: quality.minDensity,
    minBoardDensity: quality.minBoardDensity,
    minArrows: quality.minArrows,
    maxArrows: quality.maxArrows,
    longArrows: quality.longArrows,
    maxLongArrows: quality.maxLongArrows,
    windingArrows: quality.windingArrows,
    minDirectionCount: quality.minDirectionCount,
    maxDirectionShare: quality.maxDirectionShare,
    maxDirectionRun: quality.maxDirectionRun,
    maxInitialRemovable: quality.maxInitialRemovable,
    maxAverageFrontier: quality.maxAverageFrontier,
    maxFrontier: quality.maxFrontier,
    minUnlockBursts: 0,
    maxSameAxisLineViolations: quality.maxSameAxisLineViolations
  };
}

function meetsDenseReleaseFloor(report, analysis) {
  var level = arguments[2];
  var targets = denseReleaseTargets(level || {
    number: 2,
    rows: DENSE_ROWS,
    cols: DENSE_COLS,
    maskCells: []
  });
  return (
    report.valid &&
    report.density >= targets.minDensity &&
    report.boardDensity >= targets.minBoardDensity &&
    report.arrows >= targets.minArrows &&
    report.arrows <= targets.maxArrows &&
    analysis.longArrows >= targets.longArrows &&
    analysis.longArrows <= targets.maxLongArrows &&
    analysis.windingArrows >= targets.windingArrows &&
    analysis.minDirectionCount >= targets.minDirectionCount &&
    analysis.directionShare <= targets.maxDirectionShare &&
    analysis.maxDirectionRun <= targets.maxDirectionRun &&
    analysis.initialRemovable >= 1 &&
    analysis.initialRemovable <= targets.maxInitialRemovable &&
    analysis.averageFrontier <= targets.maxAverageFrontier &&
    analysis.maxFrontier <= targets.maxFrontier &&
    analysis.unlockBursts >= targets.minUnlockBursts &&
    analysis.sameAxisLineViolations <= targets.maxSameAxisLineViolations
  );
}

function generateDenseMazeLevel(levelNumber) {
  var curatedEntry = CURATED_RETRIES[levelNumber - 2];
  var curatedRetry = typeof curatedEntry === 'number' ? curatedEntry : curatedEntry && curatedEntry.retry;
  if (curatedEntry && typeof curatedEntry === 'object' && typeof curatedRetry === 'number') {
    var recipeLevel = buildExtractedMazeCandidate(levelNumber, curatedRetry, {
      skipOrientationOptimization: true,
      skipSolution: true
    });
    applyLevelRecipe(recipeLevel, curatedEntry);
    if (recipeLevel.analysis) {
      return recipeLevel;
    }
  }
  if (typeof curatedRetry === 'number') {
    var curated = buildExtractedMazeCandidate(levelNumber, curatedRetry);
    var curatedReport = validateLevel(curated);
    var curatedAnalysis = analyzePuzzle(curated);
    curated.analysis = curatedAnalysis;
    if (meetsDenseReleaseFloor(curatedReport, curatedAnalysis, curated)) {
      return curated;
    }
  }
  var best = null;
  var bestScore = -Infinity;
  for (var retry = 0; retry < 10; retry += 1) {
    if (retry === curatedRetry) {
      continue;
    }
    var candidate = buildExtractedMazeCandidate(levelNumber, retry);
    var report = validateLevel(candidate);
    var analysis = analyzePuzzle(candidate);
    var score = scoreExtractedMaze(candidate, report, analysis);
    candidate.analysis = analysis;
    if (report.valid && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
    if (meetsDenseQuality(report, analysis, candidate)) {
      return candidate;
    }
  }
  for (var fallbackRetry = 10; fallbackRetry < 40; fallbackRetry += 1) {
    var fallback = buildExtractedMazeCandidate(levelNumber, fallbackRetry);
    var fallbackReport = validateLevel(fallback);
    var fallbackAnalysis = analyzePuzzle(fallback);
    var fallbackScore = scoreExtractedMaze(fallback, fallbackReport, fallbackAnalysis);
    fallback.analysis = fallbackAnalysis;
    if (fallbackReport.valid && fallbackScore > bestScore) {
      best = fallback;
      bestScore = fallbackScore;
    }
    if (meetsDenseQuality(fallbackReport, fallbackAnalysis, fallback)) {
      return fallback;
    }
  }
  if (best) {
    return best;
  }
  throw new Error('Unable to generate silhouette maze for level ' + levelNumber);
}

function solveLevel(level) {
  var graph = buildDependencyGraph(level.arrows, level.rows, level.cols);
  var dependencyCounts = {};
  var active = {};
  var removable = [];
  graph.arrows.forEach(function (arrow) {
    active[arrow.id] = true;
    dependencyCounts[arrow.id] = Object.keys(graph.dependencies[arrow.id]).length;
    if (!dependencyCounts[arrow.id]) {
      removable.push(arrow.id);
    }
  });
  var order = [];
  var guard = graph.arrows.length + 1;
  var previousDirection = null;
  var directionRun = 0;
  while (guard > 0 && removable.length) {
    var ranked = removable.map(function (arrowId) {
      var arrow = graph.byId[arrowId];
      var unlockCount = graph.dependents[arrowId].filter(function (dependentId) {
        return active[dependentId] && dependencyCounts[dependentId] === 1;
      }).length;
      return {
        id: arrowId,
        dir: arrow.dir,
        nextFrontier: removable.length - 1 + unlockCount
      };
    });
    ranked.sort(function (a, b) {
      var aRepeats = a.dir === previousDirection ? 1 : 0;
      var bRepeats = b.dir === previousDirection ? 1 : 0;
      var aForcedRun = aRepeats && directionRun >= 3 ? 1 : 0;
      var bForcedRun = bRepeats && directionRun >= 3 ? 1 : 0;
      if (aForcedRun !== bForcedRun) {
        return aForcedRun - bForcedRun;
      }
      if (a.nextFrontier !== b.nextFrontier) {
        return a.nextFrontier - b.nextFrontier;
      }
      if (aRepeats !== bRepeats) {
        return aRepeats - bRepeats;
      }
      return a.id < b.id ? 1 : -1;
    });
    var selected = ranked[0];
    active[selected.id] = false;
    removable = removable.filter(function (id) { return id !== selected.id; });
    graph.dependents[selected.id].forEach(function (dependentId) {
      if (!active[dependentId]) {
        return;
      }
      dependencyCounts[dependentId] -= 1;
      if (!dependencyCounts[dependentId]) {
        removable.push(dependentId);
      }
    });
    order.push(selected.id);
    if (selected.dir === previousDirection) {
      directionRun += 1;
    } else {
      previousDirection = selected.dir;
      directionRun = 1;
    }
    guard -= 1;
  }
  return {
    solved: order.length === graph.arrows.length,
    order: order,
    remaining: graph.arrows.length - order.length
  };
}

function validateLevel(level) {
  var errors = [];
  var occupied = {};
  var allowed = {};
  (level.maskCells || []).forEach(function (cell) {
    allowed[keyOf(cell.r, cell.c)] = true;
  });
  level.arrows.forEach(function (arrow) {
    if (!arrow.cells || arrow.cells.length < 2) {
      errors.push(arrow.id + ': path too short');
      return;
    }
    for (var i = 0; i < arrow.cells.length; i += 1) {
      var cell = arrow.cells[i];
      if (!inBounds(cell.r, cell.c, level.rows, level.cols)) {
        errors.push(arrow.id + ': out of bounds');
      }
      var key = keyOf(cell.r, cell.c);
      if (level.maskCells && !allowed[key]) {
        errors.push(arrow.id + ': outside board mask at ' + key);
      }
      if (occupied[key] && occupied[key] !== arrow.id) {
        errors.push(arrow.id + ': overlap at ' + key);
      }
      occupied[key] = arrow.id;
      if (i > 0) {
        var previous = arrow.cells[i - 1];
        var distance = Math.abs(previous.r - cell.r) + Math.abs(previous.c - cell.c);
        if (distance !== 1) {
          errors.push(arrow.id + ': non-contiguous path');
        }
      }
    }
    if (directionFromPath(arrow.cells).id !== arrow.dir) {
      errors.push(arrow.id + ': head direction mismatch');
    }
    if (pathPointsIntoOwnBody(arrow.cells, level.rows, level.cols)) {
      errors.push(arrow.id + ': head points into own body');
    }
  });

  var initialRemovable = findRemovable(level.arrows, level.rows, level.cols).length;
  if (!initialRemovable) {
    errors.push('no initial removable arrow');
  }
  var solved = solveLevel(level);
  if (!solved.solved) {
    errors.push('solver stuck with ' + solved.remaining + ' arrows');
  }
  var occupiedCount = Object.keys(occupied).length;
  var densityBase = (level.maskCells || []).length || level.rows * level.cols;
  return {
    valid: errors.length === 0,
    errors: errors,
    arrows: level.arrows.length,
    occupiedCells: occupiedCount,
    density: occupiedCount / Math.max(1, densityBase),
    boardDensity: occupiedCount / (level.rows * level.cols),
    initialRemovable: initialRemovable,
    solved: solved.solved
  };
}

function generateLevel(levelNumber) {
  var number = Math.max(1, Math.min(config.GAME.maxGeneratedLevel, levelNumber || 1));
  return number === 1 ? generateTutorialLevel() : generateDenseMazeLevel(number);
}

function getEscapeTravel(arrow, rows, cols) {
  var head = arrow.cells[arrow.cells.length - 1];
  var rayLength = rayCellsFrom(head, config.DIRS[arrow.dir], rows, cols).length;
  return Math.max(2, arrow.cells.length - 1) + rayLength + 2;
}

module.exports = {
  DENSE_ROWS: DENSE_ROWS,
  DENSE_COLS: DENSE_COLS,
  DENSE_LONG_LENGTH: DENSE_LONG_LENGTH,
  generateLevel: generateLevel,
  canExit: canExit,
  findRemovable: findRemovable,
  rayCellsFrom: rayCellsFrom,
  buildOccupancy: buildOccupancy,
  solveLevel: solveLevel,
  validateLevel: validateLevel,
  denseQualityTargets: denseQualityTargets,
  denseReleaseTargets: denseReleaseTargets,
  buildExtractedMazeCandidate: buildExtractedMazeCandidate,
  analyzePuzzle: analyzePuzzle,
  meetsDenseQuality: meetsDenseQuality,
  meetsDenseReleaseFloor: meetsDenseReleaseFloor,
  scoreExtractedMaze: scoreExtractedMaze,
  optimizeCandidateOrientations: optimizeCandidateOrientations,
  applyLevelRecipe: applyLevelRecipe,
  assignDistinctArrowColors: assignDistinctArrowColors,
  pathPointsIntoOwnBody: pathPointsIntoOwnBody,
  getEscapeTravel: getEscapeTravel,
  keyOf: keyOf
};
