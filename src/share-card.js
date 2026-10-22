'use strict';

var config = require('./config');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(ctx, x, y, width, height, radius) {
  var r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function gradient(ctx, x0, y0, x1, y1, stops, fallback) {
  if (!ctx.createLinearGradient) {
    return fallback;
  }
  var value = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(function (stop) {
    value.addColorStop(stop[0], stop[1]);
  });
  return value;
}

function drawArrowHead(ctx, point, angle, size, color) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size * 1.75, 0);
  ctx.lineTo(-size * 0.82, -size * 1.06);
  ctx.lineTo(-size * 0.82, size * 1.06);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMiniBoard(ctx, level, x, y, width, height, activeOnly) {
  roundRect(ctx, x, y, width, height, 14);
  ctx.fillStyle = '#fffdf7';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(23,32,68,0.16)';
  ctx.stroke();

  if (!level || !level.arrows || !level.arrows.length) {
    return;
  }
  var padding = 16;
  var cell = Math.min(
    (width - padding * 2) / Math.max(1, level.cols - 1),
    (height - padding * 2) / Math.max(1, level.rows - 1)
  );
  var gridWidth = (level.cols - 1) * cell;
  var gridHeight = (level.rows - 1) * cell;
  var x0 = x + (width - gridWidth) / 2;
  var y0 = y + (height - gridHeight) / 2;
  ctx.save();
  level.arrows.forEach(function (arrow) {
    if (activeOnly && !arrow.active) {
      return;
    }
    var points = arrow.cells.map(function (cellData) {
      return { x: x0 + cellData.c * cell, y: y0 + cellData.r * cell };
    });
    if (!points.length) {
      return;
    }
    var angle = config.DIRS[arrow.dir] ? config.DIRS[arrow.dir].angle : 0;
    var color = arrow.color || config.COLORS.navy;
    var stroke = clamp(cell * 0.25, 1.25, 3.2);
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      ctx.lineTo(points[pointIndex].x, points[pointIndex].y);
    }
    ctx.stroke();
    drawArrowHead(ctx, points[points.length - 1], angle, stroke * 1.05, color);
  });
  ctx.restore();
}

function drawMascotFace(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#fff4d8';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.56, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = size * 0.045;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = gradient(ctx, 0, -size * 0.42, 0, size * 0.38, [[0, '#fff16a'], [0.6, '#ffd32e'], [1, '#f4a91f']], '#ffd32e');
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.43, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3c1d15';
  ctx.beginPath();
  ctx.arc(-size * 0.15, -size * 0.05, size * 0.075, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-size * 0.175, -size * 0.08, size * 0.024, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#3c1d15';
  ctx.lineWidth = size * 0.045;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.08, -size * 0.04);
  ctx.quadraticCurveTo(size * 0.17, size * 0.02, size * 0.25, -size * 0.035);
  ctx.stroke();

  ctx.fillStyle = '#ff694b';
  ctx.beginPath();
  ctx.arc(-size * 0.27, size * 0.09, size * 0.07, 0, Math.PI * 2);
  ctx.arc(size * 0.27, size * 0.09, size * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8d281c';
  ctx.beginPath();
  ctx.arc(0, size * 0.13, size * 0.12, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#ff7c66';
  ctx.beginPath();
  ctx.arc(0, size * 0.17, size * 0.07, 0, Math.PI);
  ctx.fill();

  ctx.strokeStyle = '#173d83';
  ctx.lineWidth = size * 0.075;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.49, -Math.PI * 0.72, Math.PI * 0.83);
  ctx.stroke();
  drawArrowHead(ctx, { x: size * 0.33, y: size * 0.36 }, 0.45, size * 0.075, '#173d83');
  ctx.restore();
}

function fitHeadline(ctx, text, maxWidth) {
  var sizes = [25, 23, 21, 19];
  for (var i = 0; i < sizes.length; i += 1) {
    ctx.font = '900 ' + sizes[i] + 'px sans-serif';
    if (!ctx.measureText || ctx.measureText(text).width <= maxWidth) {
      return sizes[i];
    }
  }
  return 18;
}

function drawRankFallback(ctx, x, y, width, height, level) {
  ctx.fillStyle = '#eef4ff';
  ctx.fillRect(x, y, width, height);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#556082';
  ctx.font = '800 13px sans-serif';
  ctx.fillText('好友榜挑战', x + 16, y + 20);
  ctx.textAlign = 'right';
  ctx.fillText('抢榜进度', x + width - 16, y + 20);
  var rows = [
    { badge: '1', name: '榜首席位', value: '待挑战', color: '#ef4f4f', fill: '#fff5bd' },
    { badge: '我', name: '我的当前进度', value: 'Lv.' + level, color: '#ff9438', fill: '#ffffff' },
    { badge: '你', name: '等你来上榜', value: '来抢', color: '#2c72c7', fill: '#ffffff' },
    { badge: '+', name: '再喊个臭宝', value: '一起', color: '#20b69b', fill: '#dcf8ef' }
  ];
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    var rowY = y + 38 + i * 55;
    roundRect(ctx, x + 9, rowY, width - 18, 46, 9);
    ctx.fillStyle = row.fill;
    ctx.fill();
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(x + 29, rowY + 23, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '900 12px sans-serif';
    ctx.fillText(row.badge, x + 29, rowY + 24);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#172044';
    ctx.font = '800 14px sans-serif';
    ctx.fillText(row.name, x + 51, rowY + 23);
    ctx.textAlign = 'right';
    ctx.fillStyle = row.color;
    ctx.fillText(row.value, x + width - 16, rowY + 23);
  }
}

function drawRankPreview(ctx, x, y, width, height, level) {
  ctx.save();
  roundRect(ctx, x, y, width, height, 14);
  ctx.clip();
  // Open-data friend rankings can be displayed, but their pixels cannot be
  // exported reliably. Draw a branded challenge preview in the main domain.
  drawRankFallback(ctx, x, y, width, height, level);
  ctx.restore();
  roundRect(ctx, x, y, width, height, 14);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

function renderRankShareCard(platform, level) {
  var canvas = platform.createOffscreenCanvas ? platform.createOffscreenCanvas(500, 400) : null;
  if (!canvas || !canvas.getContext) {
    return '';
  }
  var ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }
  canvas.width = 500;
  canvas.height = 400;
  var currentLevel = Math.max(1, Math.round(Number(level) || 1));

  ctx.fillStyle = gradient(ctx, 0, 0, 500, 400, [[0, '#ff746b'], [0.55, '#ef4c67'], [1, '#d83d67']], '#ef4f5d');
  ctx.fillRect(0, 0, 500, 400);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  for (var i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.arc(30 + i * 68, 26 + (i % 2) * 344, 16 + i % 3 * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  roundRect(ctx, 18, 16, 464, 56, 14);
  ctx.fillStyle = '#172044';
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffe84a';
  ctx.font = '900 24px sans-serif';
  ctx.fillText('你个臭宝', 36, 44);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 23px sans-serif';
  ctx.fillText('好友榜开抢', 464, 44);

  drawRankPreview(ctx, 22, 88, 304, 286, currentLevel);
  drawMascotFace(ctx, 409, 142, 122);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 23px sans-serif';
  ctx.fillText('我闯到', 410, 222);
  ctx.fillStyle = '#ffe84a';
  ctx.font = '900 36px sans-serif';
  ctx.fillText('第' + currentLevel + '关', 410, 260, 154);
  ctx.fillStyle = '#ffe9ec';
  ctx.font = '800 15px sans-serif';
  ctx.fillText('能把我挤下去吗？', 410, 292, 156);

  roundRect(ctx, 341, 318, 138, 48, 14);
  ctx.fillStyle = '#ffe84a';
  ctx.fill();
  ctx.fillStyle = '#172044';
  ctx.font = '900 18px sans-serif';
  ctx.fillText('点开直接看榜', 410, 343);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 12px sans-serif';
  ctx.fillText('看看谁才是最强臭宝', 410, 385, 160);

  return platform.exportCanvasImage ? platform.exportCanvasImage(canvas, 500, 400) : '';
}

function renderShareCard(platform, level, result, shareCopy) {
  var canvas = platform.createOffscreenCanvas ? platform.createOffscreenCanvas(500, 400) : null;
  if (!canvas || !canvas.getContext) {
    return '';
  }
  var ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }
  canvas.width = 500;
  canvas.height = 400;
  var headline = typeof shareCopy === 'string'
    ? shareCopy
    : String(shareCopy && (shareCopy.cardHeadline || shareCopy.title) || '不服来比一局');
  var cardPrompt = typeof shareCopy === 'object' && shareCopy.cardPrompt
    ? shareCopy.cardPrompt
    : (result.kind === 'stuck' ? '臭宝，点开接手残局' : '臭宝，点开挑战同一局');

  ctx.fillStyle = gradient(ctx, 0, 0, 500, 400, [[0, '#ff7068'], [0.58, '#ef4657'], [1, '#d93558']], '#ef4f5d');
  ctx.fillRect(0, 0, 500, 400);
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  for (var i = 0; i < 10; i += 1) {
    ctx.beginPath();
    ctx.arc(28 + i * 54, 24 + (i % 2) * 344, 18 + (i % 3) * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  roundRect(ctx, 18, 16, 464, 54, 14);
  ctx.fillStyle = '#172044';
  ctx.fill();
  ctx.fillStyle = '#ffe84a';
  ctx.font = '900 25px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('你个臭宝', 38, 44);
  ctx.fillStyle = '#ffffff';
  var headlineSize = fitHeadline(ctx, headline, 280);
  ctx.font = '900 ' + headlineSize + 'px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(headline, 462, 44, 280);

  drawMiniBoard(ctx, level, 24, 84, 294, 288, result.kind === 'stuck');
  drawMascotFace(ctx, 407, 143, 132);

  var metric = result.kind === 'stuck'
    ? String(result.remaining || 0) + '根'
    : result.timeText;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 42px sans-serif';
  ctx.fillText(metric, 408, 252);
  ctx.font = '800 15px sans-serif';
  ctx.fillStyle = '#ffe9d6';
  ctx.fillText(result.kind === 'stuck' ? '剩余箭头' : '清空用时', 408, 282);

  roundRect(ctx, 335, 302, 146, 48, 14);
  ctx.fillStyle = '#ffe84a';
  ctx.fill();
  ctx.fillStyle = '#172044';
  ctx.font = '900 19px sans-serif';
  ctx.fillText(result.style || '机灵臭宝', 408, 327);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 14px sans-serif';
  ctx.fillText(cardPrompt, 408, 373, 146);

  return platform.exportCanvasImage ? platform.exportCanvasImage(canvas, 500, 400) : '';
}

module.exports = {
  render: renderShareCard,
  renderRank: renderRankShareCard
};
