'use strict';

var config = require('./config');
var copy = require('./copy');
var levelGenerator = require('./level-generator');

function easeOutCubic(t) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

function easeInOutCubic(t) {
  var value = Math.max(0, Math.min(1, t));
  if (value < 0.5) {
    return 4 * value * value * value;
  }
  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shadeHex(color, amount) {
  var match = /^#([0-9a-f]{6})$/i.exec(color || '');
  if (!match) {
    return color;
  }
  var value = parseInt(match[1], 16);
  var red = clamp((value >> 16) + amount, 0, 255);
  var green = clamp(((value >> 8) & 255) + amount, 0, 255);
  var blue = clamp((value & 255) + amount, 0, 255);
  return '#' + [red, green, blue].map(function (part) {
    var hex = Math.round(part).toString(16);
    return hex.length < 2 ? '0' + hex : hex;
  }).join('');
}

function linearGradient(ctx, x0, y0, x1, y1, stops, fallback) {
  var gradient = ctx.createLinearGradient ? ctx.createLinearGradient(x0, y0, x1, y1) : null;
  if (!gradient || typeof gradient.addColorStop !== 'function') {
    return fallback || stops[0][1];
  }
  stops.forEach(function (stop) {
    gradient.addColorStop(stop[0], stop[1]);
  });
  return gradient;
}

function Renderer(canvas, systemInfo, menuRect) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.systemInfo = systemInfo;
  this.menuRect = menuRect;
  this.dpr = systemInfo.pixelRatio || 1;
  this.width = systemInfo.windowWidth || 375;
  this.height = systemInfo.windowHeight || 667;
  this.hitZones = [];
  this.boardRect = null;
  this.lastTransform = null;
  this.time = 0;
  this.images = {};
  this.loadImageAsset('mascot', 'assets/icon/choubao-mascot-288.png');
  this.resize(systemInfo);
}

Renderer.prototype.loadImageAsset = function (id, source) {
  var image = null;
  if (this.canvas && typeof this.canvas.createImage === 'function') {
    image = this.canvas.createImage();
  } else if (typeof Image !== 'undefined') {
    image = new Image();
  }
  if (!image) {
    return;
  }
  var self = this;
  image.onload = function () {
    self.images[id] = image;
  };
  image.onerror = function () {
    self.images[id] = null;
  };
  image.src = source;
};

Renderer.prototype.resize = function (systemInfo) {
  this.systemInfo = systemInfo || this.systemInfo;
  this.dpr = this.systemInfo.pixelRatio || 1;
  this.width = this.systemInfo.windowWidth || 375;
  this.height = this.systemInfo.windowHeight || 667;
  this.canvas.width = Math.floor(this.width * this.dpr);
  this.canvas.height = Math.floor(this.height * this.dpr);
  if (this.canvas.style) {
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
  }
  if (this.ctx.setTransform) {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  } else {
    this.ctx.scale(this.dpr, this.dpr);
  }
};

Renderer.prototype.clear = function () {
  this.ctx.clearRect(0, 0, this.width, this.height);
  this.hitZones = [];
};

Renderer.prototype.addHit = function (zone) {
  this.hitZones.push(zone);
};

Renderer.prototype.hitTest = function (x, y) {
  for (var i = this.hitZones.length - 1; i >= 0; i -= 1) {
    var z = this.hitZones[i];
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
      return z;
    }
  }
  return null;
};

Renderer.prototype.getHitZone = function (id) {
  for (var i = this.hitZones.length - 1; i >= 0; i -= 1) {
    if (this.hitZones[i].id === id) {
      return this.hitZones[i];
    }
  }
  return null;
};

Renderer.prototype.getFriendRankSize = function () {
  var panelWidth = Math.min(318, this.width - 48);
  return {
    width: Math.max(1, panelWidth - 36),
    height: 270,
    pixelRatio: this.dpr
  };
};

Renderer.prototype.draw = function (model, dt) {
  this.time += dt || 0.016;
  if (model.modal !== 'win') {
    this.winCelebrationLevel = null;
  }
  if (model.modal !== 'difficultySpike') {
    this.difficultySpikeStart = null;
  }
  this.clear();
  if (model.screen === 'play' && model.level) {
    this.drawPlay(model);
  } else {
    this.drawHome(model);
  }
  if (model.modal) {
    this.drawModal(model);
  }
  this.drawToast(model);
};

Renderer.prototype.roundRect = function (x, y, w, h, r) {
  var ctx = this.ctx;
  var radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

Renderer.prototype.fillTextCenter = function (text, x, y, size, color, weight) {
  var ctx = this.ctx;
  ctx.fillStyle = color || config.COLORS.ink;
  ctx.font = (weight || '700') + ' ' + size + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
};

Renderer.prototype.strokeTextCenter = function (text, x, y, size, color, strokeColor, weight) {
  var ctx = this.ctx;
  ctx.font = (weight || '800') + ' ' + size + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * 0.14);
  ctx.strokeStyle = strokeColor || '#ffffff';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color || config.COLORS.ink;
  ctx.fillText(text, x, y);
};

Renderer.prototype.drawBackground = function (dark) {
  var ctx = this.ctx;
  ctx.fillStyle = linearGradient(
    ctx,
    0,
    0,
    0,
    this.height,
    dark
      ? [[0, '#24315b'], [1, '#11182f']]
      : [[0, '#4fa8f8'], [0.55, '#8bd4ff'], [1, '#d9f4ff']],
    dark ? '#1d2744' : '#79b5f4'
  );
  ctx.fillRect(0, 0, this.width, this.height);

  ctx.save();
  ctx.globalAlpha = dark ? 0.08 : 0.16;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2;
  for (var y = 24; y < this.height; y += 58) {
    for (var x = (Math.floor(y / 58) % 2) * 28 + 16; x < this.width; x += 58) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x + 1, y - 4);
      ctx.moveTo(x + 5, y);
      ctx.lineTo(x + 1, y + 4);
      ctx.stroke();
      if ((x + y) % 3 < 1) {
        this.drawStar(x + 18, y + 16, 3.2, '#ffffff');
      }
    }
  }
  ctx.restore();
};

Renderer.prototype.drawHome = function (model) {
  var ctx = this.ctx;
  var w = this.width;
  var h = this.height;
  this.drawBackground(false);
  var compact = h < 720;
  var veryCompact = h < 620;
  var safeTop = Math.max(24, (this.systemInfo.statusBarHeight || 0) + 8);
  var mascotSize = Math.min(veryCompact ? 76 : (compact ? 108 : 132), w * 0.36);
  var mascotY = safeTop + mascotSize / 2 + Math.sin(this.time * 1.8) * 2.5;
  this.drawMascotBadge(w / 2, mascotY, mascotSize);

  var brandY = safeTop + mascotSize - 8;
  this.drawBrandPlate(w / 2, brandY, Math.min(292, w - 72), compact ? 50 : 56);

  var statsY = brandY + (compact ? 63 : 70);
  this.drawPill(w / 2 - 106, statsY, 98, 36, '关卡 ' + model.saveData.currentLevel, '#ffffff', config.COLORS.blueDeep);
  this.drawPill(w / 2 + 8, statsY, 98, 36, '金币 ' + model.saveData.coins, '#ffffff', config.COLORS.orange);

  var startW = Math.min(282, w - 64);
  var startX = (w - startW) / 2;
  var startY = statsY + (compact ? 55 : 64);
  this.drawButton('start', startX, startY, startW, compact ? 56 : 62, copy.UI.home.start, config.COLORS.green, '#24561f', compact ? 23 : 25);
  this.drawPlayGlyph(startX + 34, startY + (compact ? 28 : 31), 12, '#24561f');
  this.drawButton('level1', startX, startY + (compact ? 70 : 78), startW, compact ? 50 : 54, copy.UI.home.tutorial, config.COLORS.yellow, '#6b4b12', compact ? 18 : 20);

  var socialY = startY + (compact ? 132 : 148);
  var socialH = compact ? 43 : 48;
  var socialGap = 7;
  var socialW = (startW - socialGap * 2) / 3;
  var socialFont = compact ? 13 : 15;
  this.drawButton('dailyChallenge', startX, socialY, socialW, socialH, copy.UI.home.daily, config.COLORS.pink, '#641f48', socialFont);
  this.drawButton('friendRank', startX + socialW + socialGap, socialY, socialW, socialH, copy.UI.home.rank, config.COLORS.mint, '#155e58', socialFont);
  this.drawButton('gameClub', startX + (socialW + socialGap) * 2, socialY, socialW, socialH, copy.UI.home.club, config.COLORS.yellow, '#6b4b12', socialFont);

  var footerY = h - 66;
  var preferredSettingsY = socialY + socialH + 54;
  var settingsY = Math.min(preferredSettingsY, footerY - 45);
  this.drawIconButton3D('homeSettings', w / 2, settingsY, 25, '#ffffff', config.COLORS.ink, 'gear');
  this.drawHomeArrowTrail(settingsY + 48, h - 104);

  this.drawPill(w / 2 - 59, footerY, 118, 38, '最高 ' + model.saveData.highestLevel, '#ffffff', config.COLORS.blueDeep);
};

Renderer.prototype.drawMascotBadge = function (cx, cy, size) {
  var ctx = this.ctx;
  ctx.save();
  ctx.shadowColor = 'rgba(18, 44, 92, 0.34)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.51, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 5;
  ctx.strokeStyle = config.COLORS.yellow;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
  ctx.clip();
  if (this.images.mascot && this.images.mascot.width) {
    ctx.drawImage(this.images.mascot, cx - size * 0.46, cy - size * 0.46, size * 0.92, size * 0.92);
  } else {
    ctx.fillStyle = '#ff5c61';
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    this.drawLogo(cx, cy, size * 0.72);
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.beginPath();
  ctx.arc(cx - size * 0.19, cy - size * 0.24, size * 0.075, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.drawBrandPlate = function (cx, y, width, height) {
  var ctx = this.ctx;
  var x = cx - width / 2;
  ctx.save();
  this.roundRect(x, y + 7, width, height, 8);
  ctx.fillStyle = '#172044';
  ctx.fill();
  this.roundRect(x, y, width, height, 8);
  ctx.fillStyle = linearGradient(ctx, x, y, x, y + height, [[0, '#ff7a6f'], [1, '#f04458']], '#f65c63');
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  this.roundRect(x + 8, y + 6, width - 16, 8, 4);
  ctx.fill();
  this.strokeTextCenter('你个臭宝', cx, y + height / 2 + 2, height * 0.58, config.COLORS.yellow, config.COLORS.ink, '900');
  this.drawStar(x + 24, y + height / 2, 8, '#ffffff');
  this.drawStar(x + width - 24, y + height / 2, 8, '#ffffff');
  ctx.restore();
};

Renderer.prototype.drawHomeArrowTrail = function (top, bottom) {
  if (bottom - top < 56) {
    return;
  }
  var ctx = this.ctx;
  var w = this.width;
  var y = top + (bottom - top) * 0.52;
  var wave = Math.sin(this.time * 1.4) * 4;
  var trails = [
    { color: '#ffffff', points: [[0.08, y - 32], [0.28, y - 32], [0.28, y], [0.48, y]] },
    { color: config.COLORS.mint, points: [[0.2, y + 30], [0.2, y + 8], [0.64, y + 8], [0.64, y - 20], [0.83, y - 20]] },
    { color: config.COLORS.pink, points: [[0.47, y + 34 + wave], [0.74, y + 34 + wave]] }
  ];
  ctx.save();
  ctx.globalAlpha = 0.58;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trails.forEach(function (trail) {
    var points = trail.points.map(function (point) {
      return { x: point[0] * w, y: point[1] };
    });
    ctx.strokeStyle = 'rgba(23,32,68,0.18)';
    ctx.lineWidth = 9;
    ctx.save();
    ctx.translate(0, 4);
    this.strokePath(points);
    ctx.restore();
    ctx.strokeStyle = trail.color;
    ctx.lineWidth = 6;
    this.strokePath(points);
    var previous = points[points.length - 2];
    var head = points[points.length - 1];
    this.drawArrowHead(head, Math.atan2(head.y - previous.y, head.x - previous.x), 6, trail.color);
  }, this);
  ctx.restore();
};

Renderer.prototype.drawLogo = function (cx, cy, size) {
  var ctx = this.ctx;
  var paths = [
    { dir: 'right', color: config.COLORS.navy, points: [[6, 16], [42, 16], [42, 30], [20, 30], [20, 44], [54, 44]] },
    { dir: 'down', color: config.COLORS.blueDeep, points: [[63, 8], [63, 54], [80, 54], [80, 78]] },
    { dir: 'left', color: config.COLORS.navy, points: [[94, 18], [72, 18], [72, 34], [96, 34], [96, 50], [66, 50]] },
    { dir: 'up', color: config.COLORS.pink, points: [[18, 82], [18, 58], [36, 58], [36, 74], [53, 74], [53, 55]] },
    { dir: 'right', color: config.COLORS.orange, points: [[8, 94], [44, 94], [44, 84], [69, 84], [69, 94], [98, 94]] },
    { dir: 'down', color: config.COLORS.mint, points: [[88, 60], [72, 60], [72, 70], [92, 70], [92, 88]] }
  ];
  var dirAngles = {
    up: -Math.PI / 2,
    right: 0,
    down: Math.PI / 2,
    left: Math.PI
  };
  var scale = size / 108;
  var stroke = 6.5;

  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (var i = 0; i < paths.length; i += 1) {
    var item = paths[i];
    var points = item.points.map(function (point) {
      return { x: point[0], y: point[1] };
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.86)';
    ctx.lineWidth = stroke + 4;
    this.strokePath(points);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = stroke;
    this.strokePath(points);
    this.drawArrowHead(points[points.length - 1], dirAngles[item.dir], stroke, item.color);
    ctx.restore();
  }
  ctx.restore();
};

Renderer.prototype.drawPill = function (x, y, w, h, text, fill, color, fontSize) {
  var ctx = this.ctx;
  ctx.save();
  ctx.shadowColor = 'rgba(20, 43, 83, 0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  this.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = shadeHex(fill, -18);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  this.roundRect(x, y - 2, w, h, h / 2);
  ctx.fillStyle = linearGradient(ctx, x, y, x, y + h, [[0, shadeHex(fill, 18)], [1, fill]], fill);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.48)';
  this.roundRect(x + 10, y + 4, w - 20, 5, 3);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = '900 ' + (fontSize || 14) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  ctx.restore();
};

Renderer.prototype.drawButton = function (id, x, y, w, h, text, fill, color, size) {
  var ctx = this.ctx;
  ctx.save();
  ctx.shadowColor = 'rgba(20, 32, 72, 0.26)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 8;
  this.roundRect(x, y + 7, w, h, 8);
  ctx.fillStyle = shadeHex(fill, -42);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  this.roundRect(x, y, w, h, 8);
  ctx.fillStyle = linearGradient(ctx, x, y, x, y + h, [[0, shadeHex(fill, 24)], [0.2, fill], [1, shadeHex(fill, -8)]], fill);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  this.roundRect(x + 10, y + 6, w - 20, 7, 4);
  ctx.fill();
  this.fillTextCenter(text, x + w / 2, y + h / 2 + 2, size || 20, color || config.COLORS.ink, '900');
  ctx.restore();
  this.addHit({ type: 'button', id: id, x: x, y: y, w: w, h: h });
};

Renderer.prototype.drawTextLink = function (id, cx, y, text) {
  var ctx = this.ctx;
  ctx.save();
  ctx.fillStyle = '#71809a';
  ctx.font = '600 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y);
  var width = ctx.measureText(text).width;
  ctx.strokeStyle = 'rgba(113,128,154,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, y + 8);
  ctx.lineTo(cx + width / 2, y + 8);
  ctx.stroke();
  ctx.restore();
  this.addHit({ type: 'button', id: id, x: cx - Math.max(72, width / 2 + 16), y: y - 18, w: Math.max(144, width + 32), h: 36 });
};

Renderer.prototype.drawPlayGlyph = function (cx, cy, size, color) {
  var ctx = this.ctx;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, size + 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.35, cy - size * 0.7);
  ctx.lineTo(cx + size * 0.72, cy);
  ctx.lineTo(cx - size * 0.35, cy + size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.drawIconButton3D = function (id, cx, cy, radius, fill, iconColor, icon) {
  var ctx = this.ctx;
  ctx.save();
  ctx.shadowColor = 'rgba(18, 39, 78, 0.28)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = shadeHex(fill, -28);
  ctx.beginPath();
  ctx.arc(cx, cy + 5, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = linearGradient(ctx, cx, cy - radius, cx, cy + radius, [[0, shadeHex(fill, 20)], [1, fill]], fill);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.94)';
  ctx.stroke();
  if (icon === 'gear') {
    this.drawGear(cx, cy, radius * 0.42, iconColor);
  }
  ctx.restore();
  this.addHit({ type: 'button', id: id, x: cx - radius - 9, y: cy - radius - 9, w: radius * 2 + 18, h: radius * 2 + 18 });
};

Renderer.prototype.drawPlay = function (model) {
  var h = this.height;
  this.drawBackground(false);
  var top = Math.max(12, (this.systemInfo.statusBarHeight || 0) + 5);
  var headerBottom = top + 130;
  var bottomH = clamp(h * 0.18, 132, 156);
  this.drawHeader(model, top, headerBottom);
  this.boardRect = {
    x: 8,
    y: headerBottom + 4,
    w: this.width - 16,
    h: this.height - headerBottom - bottomH - 10
  };
  this.drawBoard(model);
  this.drawBottomBar(model, bottomH);
};

Renderer.prototype.drawHeader = function (model, top, headerH) {
  var ctx = this.ctx;
  var w = this.width;
  var centerY = top + 34;
  var gearX = 34;
  var gearY = centerY;

  ctx.save();
  ctx.fillStyle = linearGradient(ctx, 0, 0, 0, headerH, [[0, '#68b7ff'], [1, '#bfe8ff']], '#9fd6ff');
  ctx.fillRect(0, 0, w, headerH);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(0, 0, w, 5);
  ctx.fillStyle = '#2c72c7';
  ctx.fillRect(0, headerH - 5, w, 5);
  this.drawIconButton3D('pause', gearX, gearY, 22, '#ffffff', config.COLORS.ink, 'gear');

  if (model.level.colorMode !== false && w >= 370) {
    var toggleX = 70;
    var toggleY = centerY - 14;
    var toggleW = 50;
    var toggleH = 28;
    this.roundRect(toggleX, toggleY, toggleW, toggleH, 14);
    ctx.fillStyle = '#fff6df';
    ctx.fill();
    ctx.fillStyle = model.saveData.settings.colorMode ? config.COLORS.yellow : config.COLORS.navy;
    ctx.beginPath();
    ctx.arc(toggleX + (model.saveData.settings.colorMode ? 14 : 36), toggleY + 14, 11, 0, Math.PI * 2);
    ctx.fill();
    this.addHit({ type: 'button', id: 'toggleColor', x: toggleX - 4, y: toggleY - 8, w: toggleW + 8, h: 44 });
  }
  ctx.restore();

  var levelLabel = copy.UI.play.normal + ' ' + model.level.number;
  if (model.runMode === 'daily') {
    levelLabel = copy.UI.play.daily;
  } else if (model.runMode === 'official') {
    levelLabel = copy.UI.play.official;
  } else if (model.runMode === 'challenge') {
    levelLabel = copy.UI.play.challenge;
  } else if (model.runMode === 'warmup') {
    levelLabel = copy.UI.play.warmup;
  }
  this.drawPill(w / 2 - 58, top + 1, 116, 32, levelLabel, config.COLORS.yellow, config.COLORS.ink);
  this.drawHearts(w / 2, top + 49, model.lives);
  if (model.combo >= 2) {
    this.drawPill(10, top + 70, 82, 27, '连击 ×' + model.combo, config.COLORS.yellow, config.COLORS.ink);
  }
  this.drawPill(w / 2 - 49, top + 70, 98, 27, '◷ ' + model.formatTime(), '#ffffff', config.COLORS.ink);

  var promptX = 14;
  var promptY = top + 101;
  var promptW = w - promptX * 2;
  var promptH = 25;
  ctx.save();
  this.roundRect(promptX, promptY, promptW, promptH, promptH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(44,114,199,0.24)';
  ctx.stroke();
  this.fillTextCenter(copy.UI.play.melodyQuestion, promptX + promptW * 0.3, promptY + promptH / 2 + 0.5, w <= 340 ? 14 : 15, '#135fae', '900');
  this.fillTextCenter(copy.UI.play.melodySpeedHint, promptX + promptW * 0.7, promptY + promptH / 2 + 0.5, w <= 340 ? 10 : 11, config.COLORS.inkSoft, '700');
  ctx.restore();

};

Renderer.prototype.drawResourcePill = function (x, y, icon, value) {
  var ctx = this.ctx;
  ctx.save();
  ctx.shadowColor = 'rgba(23,32,68,0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  this.roundRect(x, y, 78, 32, 16);
  ctx.fillStyle = '#dce8f7';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  this.roundRect(x, y - 2, 78, 32, 16);
  ctx.fillStyle = linearGradient(ctx, x, y, x, y + 32, [[0, '#ffffff'], [1, '#eef5ff']], '#ffffff');
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  if (icon === 'coin') {
    this.drawCoin(x + 18, y + 16, 11);
  } else {
    this.drawLightning(x + 18, y + 17, 11);
  }
  ctx.fillStyle = config.COLORS.ink;
  ctx.font = '800 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + 51, y + 17);
  ctx.restore();
};

Renderer.prototype.drawHearts = function (cx, y, lives) {
  for (var i = 0; i < config.GAME.maxLives; i += 1) {
    this.drawHeart(cx - 31 + i * 31, y, i < lives ? config.COLORS.red : '#8f9ed1');
  }
};

Renderer.prototype.drawHeart = function (x, y, color) {
  var ctx = this.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.72, 0.72);
  ctx.shadowColor = 'rgba(71,30,61,0.3)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = shadeHex(color, -34);
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-26, -8, -10, -26, 0, -12);
  ctx.bezierCurveTo(10, -26, 26, -8, 0, 12);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.translate(0, -2);
  ctx.fillStyle = linearGradient(ctx, 0, -18, 0, 14, [[0, shadeHex(color, 28)], [1, color]], color);
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-26, -8, -10, -26, 0, -12);
  ctx.bezierCurveTo(10, -26, 26, -8, 0, 12);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.beginPath();
  ctx.arc(-7, -10, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.drawGear = function (x, y, r, color) {
  var ctx = this.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  for (var i = 0; i < 8; i += 1) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -r - 5, 6, 9);
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.drawBoard = function (model) {
  var ctx = this.ctx;
  var rect = this.boardRect;
  ctx.save();
  ctx.shadowColor = 'rgba(23, 53, 103, 0.3)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 7;
  this.roundRect(rect.x, rect.y + 5, rect.w, rect.h, 8);
  ctx.fillStyle = '#2468ad';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  this.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
  ctx.fillStyle = linearGradient(ctx, rect.x, rect.y, rect.x, rect.y + rect.h, [[0, '#ffffff'], [1, '#f1f7ff']], '#ffffff');
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#5b9de0';
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  this.roundRect(rect.x + 5, rect.y + 5, rect.w - 10, rect.h - 10, 6);
  ctx.stroke();

  ctx.save();
  this.roundRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8, 6);
  ctx.clip();

  var transform = this.getBoardTransform(model);
  this.lastTransform = transform;
  if (model.assistLineActive) {
    this.drawAssistGrid(model, transform);
  }
  this.drawSilhouetteGuide(model, transform);

  var arrows = model.level.arrows.slice().sort(function (a, b) {
    return a.order - b.order;
  });
  for (var i = 0; i < arrows.length; i += 1) {
    if (arrows[i].active) {
      this.drawArrow(arrows[i], transform, model.saveData.settings.colorMode && model.level.colorMode !== false);
    }
  }
  this.drawPraiseEffects(model, transform);
  ctx.restore();

  var progress = model.levelProgress();
  ctx.fillStyle = '#d8e5f4';
  this.roundRect(rect.x + 17, rect.y + rect.h - 25, rect.w - 34, 11, 5);
  ctx.fill();
  ctx.fillStyle = linearGradient(ctx, rect.x, 0, rect.x + rect.w, 0, [[0, config.COLORS.mint], [1, config.COLORS.yellow]], config.COLORS.mint);
  this.roundRect(rect.x + 17, rect.y + rect.h - 25, (rect.w - 34) * progress, 11, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  this.roundRect(rect.x + 21, rect.y + rect.h - 22, Math.max(0, (rect.w - 42) * progress), 3, 2);
  ctx.fill();
  if (model.level.tutorial && progress < 0.62) {
    this.drawTutorialCoach(rect, model);
  }
  ctx.restore();
};

Renderer.prototype.drawPraiseEffects = function (model, transform) {
  var effects = model.praiseEffects || [];
  if (!effects.length) {
    return;
  }
  var ctx = this.ctx;
  var palette = ['#25aee4', '#ff4f9a', '#ff9f1c'];
  for (var i = 0; i < effects.length; i += 1) {
    var effect = effects[i];
    var progress = clamp(effect.age / Math.max(0.1, effect.duration), 0, 1);
    var point = this.cellToPoint(effect.cell, transform);
    var drift = ((effect.seed % 3) - 1) * 12 * progress;
    var tier = clamp(effect.tier || 1, 1, 3);
    var size = 17 + tier * 2;
    var horizontalPadding = Math.min(92, 18 + effect.text.length * size * 0.48);
    var x = clamp(
      point.x + drift,
      transform.rect.x + horizontalPadding,
      transform.rect.x + transform.rect.w - horizontalPadding
    );
    var y = clamp(point.y - 18 - easeOutCubic(progress) * 52, transform.rect.y + 24, transform.rect.y + transform.rect.h - 40);
    var fade = 1 - Math.pow(progress, 2.1);
    var pop = progress < 0.2
      ? 0.7 + easeOutCubic(progress / 0.2) * 0.45
      : 1.15 - (progress - 0.2) * 0.19;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + size + 'px sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = tier >= 3 ? 'rgba(255, 159, 28, 0.55)' : 'rgba(31, 67, 125, 0.32)';
    ctx.shadowBlur = tier >= 3 ? 13 : 7;
    ctx.strokeText(effect.text, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = palette[tier - 1];
    ctx.fillText(effect.text, 0, 0);

    if (tier >= 2) {
      ctx.fillStyle = tier >= 3 ? '#ffe45e' : '#8ce8ff';
      for (var spark = 0; spark < 4; spark += 1) {
        var angle = Math.PI / 4 + spark * Math.PI / 2 + effect.seed * 0.17;
        var radius = 32 + tier * 5 + progress * 9;
        var sx = Math.cos(angle) * radius;
        var sy = Math.sin(angle) * radius * 0.58;
        ctx.beginPath();
        ctx.arc(sx, sy, tier >= 3 ? 3.2 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
};

Renderer.prototype.drawTutorialCoach = function (rect, model) {
  var ctx = this.ctx;
  var cleared = Math.max(0, model.level.targetArrows - model.activeCount());
  var steps = copy.UI.tutorial.coachSteps || [copy.UI.tutorial.coach];
  var text = steps[Math.min(steps.length - 1, cleared)];
  var w = Math.min(238, rect.w - 28);
  var h = 30;
  var x = rect.x + (rect.w - w) / 2;
  var y = rect.y + 10;
  this.drawPill(x, y, w, h, text, config.COLORS.yellow, config.COLORS.ink, 13);
};

Renderer.prototype.getBoardTransform = function (model) {
  var rect = this.boardRect;
  var rows = model.level.rows;
  var cols = model.level.cols;
  var paddingX = 22;
  var paddingTop = 24;
  var paddingBottom = 42;
  var cell = Math.min(
    (rect.w - paddingX * 2) / Math.max(1, cols - 1),
    (rect.h - paddingTop - paddingBottom) / Math.max(1, rows - 1)
  );
  cell *= model.zoom;
  var gridW = (cols - 1) * cell;
  var gridH = (rows - 1) * cell;
  return {
    rect: rect,
    level: model.level,
    cell: cell,
    x0: rect.x + rect.w / 2 - gridW / 2 + model.pan.x,
    y0: rect.y + paddingTop + (rect.h - paddingTop - paddingBottom - gridH) / 2 + model.pan.y
  };
};

Renderer.prototype.cellToPoint = function (cell, transform) {
  return {
    x: transform.x0 + cell.c * transform.cell,
    y: transform.y0 + cell.r * transform.cell
  };
};

Renderer.prototype.drawAssistGrid = function (model, transform) {
  var ctx = this.ctx;
  var rows = model.level.rows;
  var cols = model.level.cols;
  ctx.save();
  ctx.strokeStyle = 'rgba(91, 113, 164, 0.12)';
  ctx.lineWidth = 1;
  for (var r = 0; r < rows; r += 1) {
    var a = this.cellToPoint({ r: r, c: 0 }, transform);
    var b = this.cellToPoint({ r: r, c: cols - 1 }, transform);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (var c = 0; c < cols; c += 1) {
    var p1 = this.cellToPoint({ r: 0, c: c }, transform);
    var p2 = this.cellToPoint({ r: rows - 1, c: c }, transform);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();
};

Renderer.prototype.drawSilhouetteGuide = function (model, transform) {
  if (!model.level.maskCells || !model.level.maskCells.length) {
    return;
  }
  var ctx = this.ctx;
  var size = transform.cell * 0.56;
  ctx.save();
  ctx.fillStyle = 'rgba(63, 94, 158, 0.055)';
  model.level.maskCells.forEach(function (cell) {
    var x = transform.x0 + cell.c * transform.cell - size / 2;
    var y = transform.y0 + cell.r * transform.cell - size / 2;
    ctx.fillRect(x, y, size, size);
  });
  ctx.restore();
};

Renderer.prototype.drawArrow = function (arrow, transform, colorMode) {
  var ctx = this.ctx;
  var dir = config.DIRS[arrow.dir];
  var color = colorMode && arrow.color ? arrow.color : config.COLORS.navy;
  var stroke = clamp(transform.cell * 0.24, 2.2, 5.2);
  var progress = Math.max(0, Math.min(1, arrow.removeProgress || 0));
  var dx = 0;
  var dy = 0;
  if (arrow.blockedBump > 0) {
    var bumpProgress = 1 - arrow.blockedBump / 0.46;
    var bump = Math.sin(clamp(bumpProgress, 0, 1) * Math.PI) * transform.cell * 0.34;
    dx += dir.dc * bump;
    dy += dir.dr * bump;
  }

  var renderCells;
  if (arrow.removing && arrow.removalMode === 'escape') {
    renderCells = this.getEscapingCells(arrow, transform.level, easeInOutCubic(progress));
  } else {
    renderCells = arrow.cells;
  }
  var points = renderCells.map(function (cell) {
    var point = {
      x: transform.x0 + cell.c * transform.cell + dx,
      y: transform.y0 + cell.r * transform.cell + dy
    };
    return point;
  });
  if (!points.length) {
    return;
  }

  ctx.save();
  if (arrow.removing && arrow.removalMode === 'dissolve') {
    ctx.globalAlpha = 1 - easeOutCubic(progress);
  }
  if (arrow.hintPulse > 0) {
    this.drawArrowHighlight(points, stroke, config.COLORS.yellow, 0.34 + Math.sin(this.time * 11) * 0.08);
  }
  if (arrow.blockedFlash > 0) {
    this.drawArrowHighlight(points, stroke, config.COLORS.red, 0.42);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  this.strokePath(points);
  this.drawPuzzleArrowHead(points[points.length - 1], dir.angle, stroke, color);
  if (arrow.removing && arrow.removalMode === 'escape') {
    this.drawEscapeSpark(points[points.length - 1], progress, Math.max(3, transform.cell * 0.26), color);
  }
  ctx.restore();
};

Renderer.prototype.drawArrowHighlight = function (points, stroke, color, alpha) {
  var ctx = this.ctx;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = stroke * 3.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  this.strokePath(points);
  ctx.restore();
};

Renderer.prototype.drawPuzzleArrowHead = function (head, angle, stroke, color) {
  var ctx = this.ctx;
  var size = stroke * 1.85;
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.58, -size * 0.72);
  ctx.lineTo(-size * 0.58, size * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.drawEscapeSpark = function (head, progress, stroke, color) {
  var ctx = this.ctx;
  var strength = Math.sin(clamp(progress, 0, 1) * Math.PI);
  if (strength <= 0.02) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = strength * 0.9;
  for (var i = 0; i < 6; i += 1) {
    var angle = i * Math.PI / 3 + this.time * 1.8;
    var inner = stroke * 1.4;
    var outer = stroke * (2.5 + (i % 2) * 0.55);
    ctx.strokeStyle = i % 2 ? config.COLORS.yellow : color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(head.x + Math.cos(angle) * inner, head.y + Math.sin(angle) * inner);
    ctx.lineTo(head.x + Math.cos(angle) * outer, head.y + Math.sin(angle) * outer);
    ctx.stroke();
  }
  this.drawStar(head.x - stroke * 2.4, head.y - stroke * 2.1, stroke * 0.7, '#ffffff');
  ctx.restore();
};

Renderer.prototype.getEscapingCells = function (arrow, level, progress) {
  var bodyLength = Math.max(1, arrow.cells.length - 1);
  var travel = levelGenerator.getEscapeTravel(arrow, level.rows, level.cols);
  var dir = config.DIRS[arrow.dir];
  var head = arrow.cells[arrow.cells.length - 1];
  var track = arrow.cells.map(function (cell) {
    return { r: cell.r, c: cell.c };
  });
  for (var i = 1; i <= travel; i += 1) {
    track.push({
      r: head.r + dir.dr * i,
      c: head.c + dir.dc * i
    });
  }

  var start = travel * progress;
  var end = start + bodyLength;
  var points = [sampleTrack(track, start)];
  var firstWhole = Math.floor(start) + 1;
  for (var index = firstWhole; index < Math.ceil(end); index += 1) {
    if (index >= 0 && index < track.length) {
      points.push({ r: track[index].r, c: track[index].c });
    }
  }
  var endPoint = sampleTrack(track, end);
  if (!sameGridPoint(points[points.length - 1], endPoint)) {
    points.push(endPoint);
  }
  return points;
};

Renderer.prototype.strokePath = function (points) {
  var ctx = this.ctx;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (var i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
};

Renderer.prototype.drawArrowHead = function (head, angle, stroke, color) {
  var ctx = this.ctx;
  var size = stroke * 1.16;
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  ctx.moveTo(size + 2, 0);
  ctx.lineTo(-size * 0.42, -size * 0.82);
  ctx.lineTo(-size * 0.42, size * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.48, -size * 0.72);
  ctx.lineTo(-size * 0.48, size * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.drawBottomBar = function (model, bottomH) {
  var ctx = this.ctx;
  var y = this.height - bottomH;
  ctx.save();
  ctx.shadowColor = 'rgba(25,55,105,0.25)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = -5;
  ctx.fillStyle = '#9ccdf3';
  ctx.fillRect(0, y, this.width, bottomH);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = linearGradient(ctx, 0, y, 0, this.height, [[0, '#dff5ff'], [0.22, '#c6e7ff'], [1, '#9fcaf2']], '#c9e6ff');
  ctx.fillRect(0, y, this.width, bottomH);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(0, y, this.width, 3);
  ctx.fillStyle = 'rgba(44,114,199,0.3)';
  ctx.fillRect(0, y + 3, this.width, 3);

  var sliderY = y + 19;
  var sliderW = Math.min(150, Math.max(82, this.width - 238));
  var sliderX = (this.width - sliderW) / 2;
  this.drawZoomControl(model, sliderX, sliderY, sliderW);

  var labels = ['eraser', 'wand', 'hint', 'grid'];
  var propY = y + bottomH - 53;
  for (var i = 0; i < labels.length; i += 1) {
    var cx = this.width * (i + 0.5) / labels.length;
    this.drawPropButton(model, labels[i], cx, propY);
  }
  ctx.restore();
};

Renderer.prototype.drawZoomControl = function (model, x, y, w) {
  var ctx = this.ctx;
  var minusX = x - 31;
  var plusX = x + w + 31;
  ctx.save();
  [minusX, plusX].forEach(function (cx) {
    ctx.fillStyle = '#8eb8dd';
    ctx.beginPath();
    ctx.arc(cx, y + 12, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = linearGradient(ctx, cx, y - 10, cx, y + 26, [[0, '#ffffff'], [1, '#e4f1ff']], '#ffffff');
    ctx.beginPath();
    ctx.arc(cx, y + 8, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  });
  ctx.strokeStyle = config.COLORS.blueDeep;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(minusX - 8, y + 8);
  ctx.lineTo(minusX + 8, y + 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(plusX - 8, y + 8);
  ctx.lineTo(plusX + 8, y + 8);
  ctx.moveTo(plusX, y);
  ctx.lineTo(plusX, y + 16);
  ctx.stroke();

  this.roundRect(x, y + 3, w, 17, 8);
  ctx.fillStyle = '#85aed2';
  ctx.fill();
  this.roundRect(x, y, w, 16, 8);
  ctx.fillStyle = linearGradient(ctx, x, y, x, y + 16, [[0, '#8fbde4'], [1, '#6f9fc9']], '#86b0d5');
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  this.roundRect(x + 5, y + 3, w - 10, 4, 2);
  ctx.fill();
  var knobX = x + ((model.zoom - 0.9) / (3.2 - 0.9)) * w;
  ctx.shadowColor = 'rgba(19,45,88,0.26)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(knobX, y + 8, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#73a2cf';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(knobX - 5, y + 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  this.addHit({ type: 'button', id: 'zoomOut', x: minusX - 24, y: y - 16, w: 48, h: 48 });
  this.addHit({ type: 'button', id: 'zoomIn', x: plusX - 24, y: y - 16, w: 48, h: 48 });
};

Renderer.prototype.drawPropButton = function (model, propId, cx, cy) {
  var ctx = this.ctx;
  var selected = model.selectedTool === propId || (propId === 'grid' && model.assistLineActive);
  var count = model.saveData.props[propId] || 0;
  var def = config.PROP_DEFS[propId];
  var palette = {
    eraser: ['#dff2ff', '#a9d8ff'],
    wand: ['#fff0f5', '#ffc0d3'],
    hint: ['#fff8cf', '#ffe477'],
    grid: ['#e8fff8', '#9fe9d4']
  }[propId];
  ctx.save();
  ctx.shadowColor = selected ? 'rgba(255,221,53,0.75)' : 'rgba(23,48,91,0.25)';
  ctx.shadowBlur = selected ? 18 : 10;
  ctx.shadowOffsetY = selected ? 0 : 6;
  ctx.fillStyle = '#6f9bc5';
  ctx.beginPath();
  ctx.arc(cx, cy + 5, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = linearGradient(ctx, cx, cy - 34, cx, cy + 34, [[0, palette[0]], [1, palette[1]]], palette[0]);
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = selected ? 5 : 3;
  ctx.strokeStyle = selected ? config.COLORS.yellow : '#ffffff';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.beginPath();
  ctx.arc(cx - 11, cy - 13, 7, 0, Math.PI * 2);
  ctx.fill();
  this.drawPropIcon(propId, cx, cy - 6, 28);
  this.strokeTextCenter(def.shortName, cx, cy + 38, 14, config.COLORS.ink, 'rgba(255,255,255,0.82)', '900');
  var supplyMode = model.getPropSupplyMode(propId);
  var badgeX = cx + 25;
  var badgeY = cy - 24;
  ctx.fillStyle = count > 0 || supplyMode === 'round' ? '#4f9f23' : (supplyMode === 'intro' ? '#9f3f75' : '#bb541e');
  ctx.beginPath();
  ctx.arc(badgeX, badgeY + 3, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = count > 0 || supplyMode === 'round' ? config.COLORS.green : (supplyMode === 'intro' ? config.COLORS.pink : config.COLORS.orange);
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  if (count > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), badgeX, badgeY);
  } else if (supplyMode === 'intro') {
    this.drawMiniShareIcon(badgeX, badgeY);
  } else if (supplyMode === 'round') {
    this.drawMiniCheckIcon(badgeX, badgeY);
  } else {
    this.drawMiniVideoIcon(badgeX, badgeY);
  }
  ctx.restore();
  this.addHit({ type: 'button', id: 'prop:' + propId, x: cx - 40, y: cy - 44, w: 80, h: 92 });
};

Renderer.prototype.drawMiniShareIcon = function (cx, cy) {
  var ctx = this.ctx;
  ctx.save();
  ctx.strokeStyle = config.COLORS.white;
  ctx.fillStyle = config.COLORS.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 4, cy - 5);
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 4, cy + 5);
  ctx.stroke();
  [{ x: -5, y: 0 }, { x: 4, y: -5 }, { x: 4, y: 5 }].forEach(function (point) {
    ctx.beginPath();
    ctx.arc(cx + point.x, cy + point.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
};

Renderer.prototype.drawMiniVideoIcon = function (cx, cy) {
  var ctx = this.ctx;
  ctx.save();
  ctx.strokeStyle = config.COLORS.white;
  ctx.fillStyle = config.COLORS.white;
  ctx.lineWidth = 1.8;
  this.roundRect(cx - 8, cy - 6, 12, 12, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 4, cy - 3.5);
  ctx.lineTo(cx + 9, cy - 6);
  ctx.lineTo(cx + 9, cy + 6);
  ctx.lineTo(cx + 4, cy + 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 3.5);
  ctx.lineTo(cx + 1.5, cy);
  ctx.lineTo(cx - 4, cy + 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.drawMiniCheckIcon = function (cx, cy) {
  var ctx = this.ctx;
  ctx.save();
  ctx.strokeStyle = config.COLORS.white;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy);
  ctx.lineTo(cx - 1.5, cy + 4.5);
  ctx.lineTo(cx + 7, cy - 5);
  ctx.stroke();
  ctx.restore();
};

Renderer.prototype.drawPropIcon = function (propId, cx, cy, size) {
  var ctx = this.ctx;
  ctx.save();
  if (propId === 'eraser') {
    ctx.translate(cx, cy);
    ctx.rotate(-0.45);
    ctx.fillStyle = 'rgba(27,54,99,0.24)';
    this.roundRect(-size * 0.48, -size * 0.24, size * 0.96, size * 0.64, 6);
    ctx.fill();
    this.roundRect(-size * 0.48, -size * 0.32, size * 0.96, size * 0.64, 6);
    ctx.fillStyle = linearGradient(ctx, 0, -size * 0.32, 0, size * 0.32, [[0, '#78bbff'], [1, '#307dd9']], '#4e9bf4');
    ctx.fill();
    ctx.fillStyle = '#ffe9d6';
    ctx.fillRect(-size * 0.48, -size * 0.32, size * 0.24, size * 0.64);
    ctx.fillRect(size * 0.24, -size * 0.32, size * 0.24, size * 0.64);
    ctx.fillStyle = 'rgba(255,255,255,0.56)';
    ctx.fillRect(-size * 0.18, -size * 0.23, size * 0.38, size * 0.1);
  } else if (propId === 'wand') {
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#9f2d55';
    this.roundRect(-4, 5, 8, size * 0.76, 4);
    ctx.fill();
    ctx.fillStyle = linearGradient(ctx, 0, 2, 0, size * 0.78, [[0, '#ff7390'], [1, '#d93d67']], '#e94e72');
    this.roundRect(-4, 2, 8, size * 0.76, 4);
    ctx.fill();
    ctx.shadowColor = 'rgba(255,196,38,0.55)';
    ctx.shadowBlur = 8;
    this.drawStar(0, -size * 0.1, size * 0.44, '#ffd83d');
    ctx.shadowColor = 'transparent';
    this.drawStar(-size * 0.1, -size * 0.2, size * 0.13, '#ffffff');
  } else if (propId === 'grid') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#258b80';
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.lineCap = 'round';
    for (var gridLine = -1; gridLine <= 1; gridLine += 1) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.38, gridLine * size * 0.28);
      ctx.lineTo(size * 0.38, gridLine * size * 0.28);
      ctx.moveTo(gridLine * size * 0.28, -size * 0.38);
      ctx.lineTo(gridLine * size * 0.28, size * 0.38);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(118,76,9,0.2)';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.38, Math.PI, 0);
    ctx.quadraticCurveTo(cx + size * 0.34, cy + size * 0.28, cx, cy + size * 0.36);
    ctx.quadraticCurveTo(cx - size * 0.34, cy + size * 0.28, cx - size * 0.38, cy);
    ctx.fill();
    ctx.fillStyle = linearGradient(ctx, cx, cy - size * 0.4, cx, cy + size * 0.36, [[0, '#fff59a'], [1, '#ffc928']], '#ffe45f');
    ctx.beginPath();
    ctx.arc(cx, cy - 4, size * 0.36, Math.PI, 0);
    ctx.quadraticCurveTo(cx + size * 0.32, cy + size * 0.24, cx, cy + size * 0.32);
    ctx.quadraticCurveTo(cx - size * 0.32, cy + size * 0.24, cx - size * 0.36, cy - 4);
    ctx.fill();
    ctx.fillStyle = '#8da1b3';
    this.roundRect(cx - size * 0.22, cy + size * 0.24, size * 0.44, size * 0.22, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    ctx.beginPath();
    ctx.arc(cx - size * 0.12, cy - size * 0.12, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

Renderer.prototype.drawStar = function (cx, cy, r, color) {
  var ctx = this.ctx;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (var i = 0; i < 10; i += 1) {
    var angle = -Math.PI / 2 + i * Math.PI / 5;
    var radius = i % 2 === 0 ? r : r * 0.48;
    var x = cx + Math.cos(angle) * radius;
    var y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
};

Renderer.prototype.drawCoin = function (cx, cy, r) {
  var ctx = this.ctx;
  ctx.save();
  ctx.fillStyle = '#c98514';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.18, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = linearGradient(ctx, cx, cy - r, cx, cy + r, [[0, '#fff28b'], [0.45, '#ffd84a'], [1, '#f3a91d']], '#ffd94a');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e19a1a';
  ctx.lineWidth = 2;
  ctx.stroke();
  this.drawStar(cx, cy, r * 0.45, '#f5a623');
  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.28, cy - r * 0.32, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.drawLightning = function (cx, cy, r) {
  var ctx = this.ctx;
  ctx.save();
  ctx.translate(1.5, 2.5);
  ctx.fillStyle = '#d58b12';
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.1, cy - r);
  ctx.lineTo(cx - r * 0.6, cy + r * 0.08);
  ctx.lineTo(cx, cy + r * 0.08);
  ctx.lineTo(cx - r * 0.16, cy + r);
  ctx.lineTo(cx + r * 0.68, cy - r * 0.18);
  ctx.lineTo(cx + r * 0.08, cy - r * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = linearGradient(ctx, cx, cy - r, cx, cy + r, [[0, '#fff179'], [1, '#ffb51f']], '#ffcc2f');
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.1, cy - r);
  ctx.lineTo(cx - r * 0.6, cy + r * 0.08);
  ctx.lineTo(cx, cy + r * 0.08);
  ctx.lineTo(cx - r * 0.16, cy + r);
  ctx.lineTo(cx + r * 0.68, cy - r * 0.18);
  ctx.lineTo(cx + r * 0.08, cy - r * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.02, cy - r * 0.66);
  ctx.lineTo(cx - r * 0.32, cy - r * 0.04);
  ctx.stroke();
  ctx.restore();
};

Renderer.prototype.hitTestArrow = function (x, y, model) {
  if (!model.level || !this.lastTransform || !this.boardRect) {
    return null;
  }
  var rect = this.boardRect;
  if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) {
    return null;
  }
  var transform = this.lastTransform;
  var threshold = clamp(transform.cell * 0.42, 9, 20);
  var bestArrowId = null;
  var bestDistance = Infinity;
  var arrows = model.level.arrows.slice().sort(function (a, b) {
    return b.order - a.order;
  });
  for (var i = 0; i < arrows.length; i += 1) {
    var arrow = arrows[i];
    if (!arrow.active || arrow.removing) {
      continue;
    }
    var distance = this.distanceToArrow(x, y, arrow, transform);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      bestArrowId = arrow.id;
    }
  }
  return bestArrowId;
};

Renderer.prototype.pointHitsArrow = function (x, y, arrow, transform) {
  return this.distanceToArrow(x, y, arrow, transform) <= clamp(transform.cell * 0.42, 9, 20);
};

Renderer.prototype.distanceToArrow = function (x, y, arrow, transform) {
  var points = arrow.cells.map(function (cell) {
    return {
      x: transform.x0 + cell.c * transform.cell,
      y: transform.y0 + cell.r * transform.cell
    };
  });
  var nearest = Infinity;
  for (var i = 1; i < points.length; i += 1) {
    nearest = Math.min(nearest, distanceToSegment(x, y, points[i - 1], points[i]));
  }
  if (points.length === 1) {
    nearest = Math.hypot(x - points[0].x, y - points[0].y);
  }
  return nearest;
};

Renderer.prototype.drawToast = function (model) {
  if (!model.message || model.messageTime <= 0) {
    return;
  }
  var ctx = this.ctx;
  var fontSize = 16;
  var lineHeight = 20;
  var maxTextWidth = Math.max(120, this.width - 88);
  var lines = [];
  var line = '';
  ctx.save();
  ctx.font = '800 ' + fontSize + 'px sans-serif';
  String(model.message).split('').forEach(function (character) {
    var candidate = line + character;
    if (line && ctx.measureText(candidate).width > maxTextWidth) {
      lines.push(line);
      line = character;
    } else {
      line = candidate;
    }
  });
  if (line) {
    lines.push(line);
  }
  if (!lines.length) {
    lines.push(String(model.message));
  }
  var measuredWidth = lines.reduce(function (widest, text) {
    return Math.max(widest, ctx.measureText(text).width);
  }, 0);
  var w = Math.min(this.width - 48, Math.max(180, measuredWidth + 28));
  var toastHeight = 18 + lines.length * lineHeight;
  var x = (this.width - w) / 2;
  var y = model.modal ? this.height - toastHeight - 26 : this.height * 0.42;
  ctx.globalAlpha = Math.min(1, model.messageTime * 2);
  this.roundRect(x, y + 5, w, toastHeight, 8);
  ctx.fillStyle = 'rgba(5, 10, 26, 0.72)';
  ctx.fill();
  this.roundRect(x, y, w, toastHeight, 8);
  ctx.fillStyle = linearGradient(ctx, x, y, x, y + toastHeight, [[0, 'rgba(44,61,111,0.96)'], [1, 'rgba(19,29,63,0.96)']], 'rgba(18,24,45,0.92)');
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 2;
  ctx.stroke();
  lines.forEach(function (text, index) {
    this.fillTextCenter(text, this.width / 2, y + 9 + lineHeight * (index + 0.5), fontSize, '#ffffff', '800');
  }, this);
  ctx.restore();
};

Renderer.prototype.drawModal = function (model) {
  var ctx = this.ctx;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 20, 48, 0.72)';
  ctx.fillRect(0, 0, this.width, this.height);
  if (model.modal === 'win' || model.modal === 'challengeReady') {
    if (this.winCelebrationLevel !== model.level.number) {
      this.winCelebrationLevel = model.level.number;
      this.winCelebrationStart = this.time;
    }
    this.drawWinCelebration(model, this.time - this.winCelebrationStart);
  }
  if (model.modal === 'pause' || model.modal === 'settings') {
    this.drawPauseModal(model);
  } else if (model.modal === 'win') {
    this.drawWinModal(model);
  } else if (model.modal === 'lose') {
    this.drawLoseModal(model);
  } else if (model.modal === 'propSupply') {
    this.drawPropSupplyModal(model);
  } else if (model.modal === 'challengeInvite') {
    this.drawChallengeInviteModal(model);
  } else if (model.modal === 'challengeReady') {
    this.drawChallengeReadyModal(model);
  } else if (model.modal === 'friendRank') {
    this.drawFriendRankModal(model);
  } else if (model.modal === 'difficultySpike') {
    if (this.difficultySpikeStart === null || this.difficultySpikeStart === undefined) {
      this.difficultySpikeStart = this.time;
    }
    this.drawDifficultySpikeModal(this.time - this.difficultySpikeStart);
  }
  ctx.restore();
};

Renderer.prototype.drawWinCelebration = function (model, elapsed) {
  var ctx = this.ctx;
  var cx = this.width / 2;
  var panelTop = (this.height - 382) / 2;
  var burstY = panelTop + 26;
  var colors = [config.COLORS.yellow, config.COLORS.pink, config.COLORS.mint, config.COLORS.orange, '#ffffff'];

  ctx.save();
  ctx.translate(cx, burstY);
  ctx.rotate(elapsed * 0.12);
  ctx.globalAlpha = 0.15 + Math.sin(elapsed * 4) * 0.035;
  for (var ray = 0; ray < 14; ray += 1) {
    ctx.rotate(Math.PI * 2 / 14);
    ctx.fillStyle = ray % 2 ? '#ffffff' : config.COLORS.yellow;
    ctx.beginPath();
    ctx.moveTo(24, -7);
    ctx.lineTo(Math.max(this.width, this.height) * 0.72, -24);
    ctx.lineTo(Math.max(this.width, this.height) * 0.72, 24);
    ctx.lineTo(24, 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  for (var i = 0; i < 48; i += 1) {
    var speed = 76 + (i % 7) * 18;
    var x = (i * 83 + Math.sin(elapsed * 2 + i) * 24) % (this.width + 24) - 12;
    var y = (i * 47 + elapsed * speed) % (this.height + 100) - 50;
    var size = 4 + (i % 3) * 1.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(elapsed * (1.8 + (i % 4) * 0.35) + i);
    ctx.fillStyle = colors[i % colors.length];
    if (i % 4 === 0) {
      this.drawStar(0, 0, size * 1.25, colors[i % colors.length]);
    } else {
      this.roundRect(-size / 2, -size, size, size * 2, 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();

  var bounce = Math.abs(Math.sin(elapsed * 3.7)) * 8;
  this.strokeTextCenter('谁家臭宝这么会！', cx, panelTop - 82 - bounce * 0.22, 30, config.COLORS.yellow, config.COLORS.ink, '900');
  this.drawMascotBadge(cx, panelTop - 18 - bounce, 94);
  this.drawStar(cx - 68, panelTop - 38, 10 + Math.sin(elapsed * 5) * 2, '#ffffff');
  this.drawStar(cx + 70, panelTop - 50, 8 + Math.cos(elapsed * 4) * 2, config.COLORS.yellow);
};

Renderer.prototype.modalPanel = function (title, height) {
  var ctx = this.ctx;
  var w = Math.min(318, this.width - 48);
  var h = height;
  var x = (this.width - w) / 2;
  var y = (this.height - h) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(4,12,35,0.45)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 12;
  this.roundRect(x, y + 8, w, h, 8);
  ctx.fillStyle = '#234f89';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  this.roundRect(x, y, w, 58, 8);
  ctx.fillStyle = linearGradient(ctx, x, y, x, y + 58, [[0, '#70efd1'], [1, '#19bcae']], config.COLORS.mint);
  ctx.fill();
  ctx.fillRect(x, y + 38, w, 22);
  this.roundRect(x, y + 56, w, h - 56, 8);
  ctx.fillStyle = linearGradient(ctx, x, y + 56, x, y + h, [[0, '#ffffff'], [1, '#edf5ff']], '#ffffff');
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  this.roundRect(x, y, w, h, 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.46)';
  this.roundRect(x + 12, y + 7, w - 24, 7, 4);
  ctx.fill();
  this.strokeTextCenter(title, x + w / 2, y + 31, 25, '#ffffff', 'rgba(23,32,68,0.55)', '900');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + w - 29, y + 29, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(23,32,68,0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = config.COLORS.ink;
  ctx.font = '900 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', x + w - 29, y + 28);
  ctx.restore();
  this.addHit({ type: 'button', id: 'modalClose', x: x + w - 58, y: y, w: 58, h: 58 });
  return { x: x, y: y, w: w, h: h };
};

Renderer.prototype.drawPauseModal = function (model) {
  var onHome = model.screen === 'home';
  var p = this.modalPanel(onHome ? '设置' : '暂停', onHome ? 394 : 438);
  var x = p.x + 34;
  var y = p.y + 75;
  this.drawToggleRow('music', x, y, '音乐', model.saveData.settings.music);
  this.drawToggleRow('sfx', x, y + 48, '音效', model.saveData.settings.sfx);
  this.drawToggleRow('vibrate', x, y + 96, '振动', model.saveData.settings.vibrate);
  this.drawToggleRow('colorMode', x, y + 144, '彩色', model.saveData.settings.colorMode);
  this.drawTextLink('privacyContract', p.x + p.w / 2, p.y + 289, '隐私保护指引');
  if (onHome) {
    this.drawButton('resume', p.x + 44, p.y + 330, p.w - 88, 44, '完成', config.COLORS.green, '#23551d', 18);
  } else {
    this.drawButton('resume', p.x + 44, p.y + 322, p.w - 88, 44, '继续', config.COLORS.green, '#23551d', 18);
    this.drawButton('restart', p.x + 44, p.y + 378, p.w / 2 - 52, 40, '重开', config.COLORS.yellow, '#6c4b12', 16);
    this.drawButton('home', p.x + p.w / 2 + 8, p.y + 378, p.w / 2 - 52, 40, '主页', '#e8edfb', config.COLORS.ink, 16);
  }
};

Renderer.prototype.drawToggleRow = function (id, x, y, label, enabled) {
  var ctx = this.ctx;
  ctx.fillStyle = config.COLORS.ink;
  ctx.font = '900 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 17);
  var tx = x + 144;
  this.roundRect(tx, y + 4, 72, 34, 17);
  ctx.fillStyle = enabled ? '#0b8f86' : '#8b96a8';
  ctx.fill();
  this.roundRect(tx, y, 72, 34, 17);
  ctx.fillStyle = linearGradient(ctx, tx, y, tx, y + 34, enabled ? [[0, '#56e7d4'], [1, '#12b9ab']] : [[0, '#dbe1eb'], [1, '#adb7c8']], enabled ? '#12c7b7' : '#bac1cf');
  ctx.fill();
  ctx.shadowColor = 'rgba(20,36,70,0.24)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#ffe45f';
  ctx.beginPath();
  ctx.arc(tx + (enabled ? 54 : 18), y + 17, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.beginPath();
  ctx.arc(tx + (enabled ? 49 : 13), y + 11, 4, 0, Math.PI * 2);
  ctx.fill();
  this.addHit({ type: 'button', id: 'setting:' + id, x: tx - 8, y: y - 7, w: 88, h: 48 });
};

Renderer.prototype.drawWinModal = function (model) {
  var result = model.lastResult || {};
  var socialRun = model.runMode !== 'normal';
  var campaignComplete = !socialRun && model.level && model.level.number >= config.GAME.maxGeneratedLevel;
  var title = copy.UI.win.normalTitle;
  if (model.runMode === 'challenge') {
    title = result.beatTarget ? copy.UI.win.challengeBeatTitle : copy.UI.win.challengeClearTitle;
  } else if (model.runMode === 'daily') {
    title = copy.UI.win.dailyTitle;
  } else if (model.runMode === 'official') {
    title = copy.UI.win.officialTitle;
  }
  var p = this.modalPanel(title, 414);
  this.drawStar(p.x + p.w / 2, p.y + 111, 34, 'rgba(255,228,74,0.32)');
  if (model.lastReward > 0) {
    this.fillTextCenter('+' + model.lastReward, p.x + p.w / 2 + 16, p.y + 108, 32, config.COLORS.orange, '900');
    this.drawCoin(p.x + p.w / 2 - 40, p.y + 108, 18);
  } else {
    this.fillTextCenter(result.style || '机灵臭宝', p.x + p.w / 2, p.y + 108, 25, config.COLORS.orange, '900');
  }
  var resultTime = result.timeText || model.formatTime();
  this.fillTextCenter('用时 ' + resultTime + '  ·  连击 ' + model.bestComboThisRound, p.x + p.w / 2, p.y + 151, 16, config.COLORS.inkSoft, '800');
  if (model.runMode === 'challenge' && result.targetMs) {
    var targetText = result.beatTarget ? '比好友快，臭宝反超成功' : '差一点反超TA，再来一局';
    this.fillTextCenter(targetText, p.x + p.w / 2, p.y + 174, 14, result.beatTarget ? '#15923a' : config.COLORS.inkSoft, '800');
  }
  var primaryId = socialRun || campaignComplete ? 'home' : 'next';
  var primaryLabel = socialRun ? copy.UI.win.home : (campaignComplete ? copy.UI.win.complete : copy.UI.win.next);
  this.drawButton(primaryId, p.x + 44, p.y + 190, p.w - 88, 48, primaryLabel, config.COLORS.green, '#23551d', 19);
  var shareLabel = model.runMode === 'challenge' ? copy.UI.win.counterShare : (model.runMode === 'daily' || model.runMode === 'official' ? copy.UI.win.dailyShare : copy.UI.win.share);
  this.drawButton('shareWin', p.x + 44, p.y + 254, p.w - 88, 46, shareLabel, config.COLORS.pink, '#641f48', 16);
  this.drawShareGlyph(p.x + 66, p.y + 277, 9, '#641f48');
  if (model.runMode === 'daily' || model.runMode === 'official') {
    this.drawButton('dailyChallenge', p.x + 44, p.y + 326, p.w / 2 - 52, 40, '再玩今日', config.COLORS.yellow, '#6c4b12', 15);
  } else {
    this.drawButton('restart', p.x + 44, p.y + 326, p.w / 2 - 52, 40, '重玩', config.COLORS.yellow, '#6c4b12', 16);
  }
  this.drawButton('home', p.x + p.w / 2 + 8, p.y + 326, p.w / 2 - 52, 40, '主页', '#e8edfb', config.COLORS.ink, 16);
};

Renderer.prototype.drawShareGlyph = function (cx, cy, size, color) {
  var ctx = this.ctx;
  var points = [
    { x: cx - size, y: cy },
    { x: cx + size * 0.75, y: cy - size * 0.78 },
    { x: cx + size * 0.75, y: cy + size * 0.78 }
  ];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.stroke();
  points.forEach(function (point) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  });
  ctx.restore();
};

Renderer.prototype.drawLoseModal = function (model) {
  var p = this.modalPanel(copy.UI.lose.title, 340);
  var reason = model.loseReason === 'time' ? copy.UI.lose.timeReason : copy.UI.lose.heartReason;
  this.drawHeart(p.x + p.w / 2, p.y + 93, config.COLORS.red);
  this.fillTextCenter(reason, p.x + p.w / 2, p.y + 125, 22, config.COLORS.ink, '900');
  this.fillTextCenter(copy.getLoseRemainingText(model.activeCount()), p.x + p.w / 2, p.y + 158, 17, config.COLORS.inkSoft, '800');
  this.drawButton(
    'revive',
    p.x + 44,
    p.y + 190,
    p.w - 88,
    46,
    copy.getReviveText(model.activeCount(), model.loseReason),
    config.COLORS.green,
    '#23551d',
    17
  );
  this.drawPlayGlyph(p.x + 65, p.y + 213, 8, '#23551d');
  this.drawButton('restart', p.x + 44, p.y + 266, p.w / 2 - 52, 40, copy.UI.lose.restart, config.COLORS.yellow, '#6c4b12', 16);
  this.drawButton('home', p.x + p.w / 2 + 8, p.y + 266, p.w / 2 - 52, 40, '主页', '#e8edfb', config.COLORS.ink, 16);
};

Renderer.prototype.drawChallengeInviteModal = function (model) {
  var challenge = model.pendingChallenge || {};
  var p = this.modalPanel(challenge.type === 'rescue' ? copy.UI.invite.rescueTitle : copy.UI.invite.duelTitle, 350);
  this.drawMascotBadge(p.x + p.w / 2, p.y + 116, 78);
  this.fillTextCenter('第 ' + (challenge.level || 1) + ' 关 · ' + (challenge.type === 'rescue' ? '原样残局等你接' : '同一张图真较量'), p.x + p.w / 2, p.y + 174, 18, config.COLORS.ink, '900');
  var target = copy.getInviteTarget(challenge);
  this.fillTextCenter(target, p.x + p.w / 2, p.y + 207, 15, config.COLORS.inkSoft, '800');
  this.drawButton('challengeAccept', p.x + 42, p.y + 240, p.w - 84, 50, challenge.type === 'rescue' ? copy.UI.invite.rescueButton : copy.UI.invite.duelButton, config.COLORS.green, '#23551d', 19);
  this.fillTextCenter(copy.UI.invite.free, p.x + p.w / 2, p.y + 316, 13, config.COLORS.inkSoft, '700');
};

Renderer.prototype.drawChallengeReadyModal = function () {
  var p = this.modalPanel(copy.UI.warmup.title, 326);
  this.drawMascotBadge(p.x + p.w / 2, p.y + 120, 88);
  this.fillTextCenter(copy.UI.warmup.line1, p.x + p.w / 2, p.y + 190, 17, config.COLORS.ink, '900');
  this.fillTextCenter(copy.UI.warmup.line2, p.x + p.w / 2, p.y + 220, 14, config.COLORS.inkSoft, '700');
  this.drawButton('challengeReady', p.x + 44, p.y + 252, p.w - 88, 48, copy.UI.warmup.button, config.COLORS.green, '#23551d', 19);
};

Renderer.prototype.drawDifficultySpikeModal = function (elapsed) {
  var ctx = this.ctx;
  var cx = this.width / 2;
  var centerY = clamp(this.height * 0.44, 250, 390);
  var pulse = 0.5 + 0.5 * Math.sin(elapsed * 5.6);
  var challengeCopy = copy.UI.difficultySpike;

  ctx.save();
  ctx.fillStyle = linearGradient(
    ctx,
    0,
    0,
    this.width,
    this.height,
    [[0, '#121a38'], [0.5, '#372052'], [1, '#102d45']],
    '#171f3e'
  );
  ctx.fillRect(0, 0, this.width, this.height);

  ctx.save();
  ctx.translate(cx, centerY - 2);
  ctx.rotate(elapsed * 0.08);
  ctx.globalAlpha = 0.12 + pulse * 0.05;
  for (var ray = 0; ray < 18; ray += 1) {
    ctx.rotate(Math.PI * 2 / 18);
    ctx.fillStyle = ray % 3 === 0 ? '#ff5f76' : ray % 2 ? '#ffe45f' : '#59e4cf';
    ctx.beginPath();
    ctx.moveTo(46, -8);
    ctx.lineTo(Math.max(this.width, this.height) * 0.72, -20);
    ctx.lineTo(Math.max(this.width, this.height) * 0.72, 20);
    ctx.lineTo(46, 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#ffe45f';
  var stripeOffset = (elapsed * 72) % 42;
  for (var stripe = -60; stripe < this.width + 60; stripe += 42) {
    ctx.beginPath();
    ctx.moveTo(stripe + stripeOffset, 0);
    ctx.lineTo(stripe + 18 + stripeOffset, 0);
    ctx.lineTo(stripe - 2 + stripeOffset, 14);
    ctx.lineTo(stripe - 20 + stripeOffset, 14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  var mascotY = centerY - 147;
  this.drawMascotBadge(cx, mascotY, 78 + pulse * 4);

  this.roundRect(cx - 62, centerY - 92, 124, 28, 8);
  ctx.fillStyle = 'rgba(255,228,95,0.96)';
  ctx.fill();
  this.fillTextCenter(challengeCopy.kicker + ' · LEVEL 2', cx, centerY - 78, 12, '#522341', '900');

  ctx.save();
  ctx.translate(cx, centerY - 19);
  var titleScale = 0.97 + pulse * 0.045;
  ctx.scale(titleScale, titleScale);
  this.strokeTextCenter(challengeCopy.title, 0, 0, 42, '#ffe45f', '#8f2445', '900');
  ctx.restore();

  this.fillTextCenter(challengeCopy.line1, cx, centerY + 39, 18, '#ffffff', '900');
  this.fillTextCenter(challengeCopy.line2, cx, centerY + 72, 14, '#bfefff', '800');

  ctx.save();
  ctx.strokeStyle = '#66f0d8';
  ctx.fillStyle = '#66f0d8';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (var side = -1; side <= 1; side += 2) {
    var arrowX = cx + side * (this.width * 0.38);
    var drift = (elapsed * 42) % 34;
    for (var arrowIndex = 0; arrowIndex < 3; arrowIndex += 1) {
      var arrowY = centerY - 55 + arrowIndex * 58 + drift - 17;
      ctx.globalAlpha = 0.18 + arrowIndex * 0.12;
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY + 22);
      ctx.lineTo(arrowX, arrowY);
      ctx.lineTo(arrowX - 6, arrowY + 7);
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX + 6, arrowY + 7);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();

  var buttonW = Math.min(286, this.width - 52);
  var buttonY = Math.min(this.height - 82, centerY + 124);
  this.drawButton('difficultySpikeStart', cx - buttonW / 2, buttonY, buttonW, 54, challengeCopy.button, config.COLORS.green, '#23551d', 20);
};

Renderer.prototype.drawFriendRankModal = function (model) {
  var p = this.modalPanel(copy.UI.rank.title, 454);
  var rankSize = this.getFriendRankSize();
  var rankX = p.x + 18;
  var rankY = p.y + 66;
  var rankW = rankSize.width;
  var rankH = rankSize.height;
  this.roundRect(rankX, rankY, rankW, rankH, 8);
  this.ctx.fillStyle = '#eef4ff';
  this.ctx.fill();
  if (model.rankCanvas && this.ctx.drawImage) {
    try {
      this.ctx.drawImage(model.rankCanvas, rankX, rankY, rankW, rankH);
    } catch (err) {
      this.fillTextCenter('好友榜加载中…', p.x + p.w / 2, rankY + rankH / 2, 16, config.COLORS.inkSoft, '800');
    }
  } else {
    this.fillTextCenter(copy.UI.rank.preview, p.x + p.w / 2, rankY + 132, 16, config.COLORS.inkSoft, '800');
    this.fillTextCenter(copy.UI.rank.previewHint, p.x + p.w / 2, rankY + 166, 14, config.COLORS.inkSoft, '700');
  }
  var attempts = model.socialInbox ? model.socialInbox.attempts || 0 : 0;
  var wins = model.socialInbox ? model.socialInbox.wins || 0 : 0;
  var responseText = attempts > 0 ? '有' + attempts + '个臭宝来过 · ' + Math.max(0, attempts - wins) + '个被难住' : copy.UI.rank.empty;
  this.fillTextCenter(responseText, p.x + p.w / 2, p.y + 351, 13, config.COLORS.inkSoft, '800');
  this.fillTextCenter(copy.UI.rank.timelineHint, p.x + p.w / 2, p.y + 369, 10, '#7b86a3', '700');
  var reminderEnabled = !!(
    model.saveData.social &&
    model.saveData.social.rankReminderAccepted &&
    model.saveData.social.rankReminderScoreSynced
  );
  var actionGap = 8;
  var actionW = (p.w - 36 - actionGap) / 2;
  this.drawButton(
    'rankReminder',
    p.x + 18,
    p.y + 382,
    actionW,
    44,
    reminderEnabled ? copy.UI.rank.reminderOn : copy.UI.rank.reminder,
    reminderEnabled ? config.COLORS.green : config.COLORS.yellow,
    reminderEnabled ? '#23551d' : '#6c4b12',
    13
  );
  this.drawButton(
    'shareRank',
    p.x + 18 + actionW + actionGap,
    p.y + 382,
    actionW,
    44,
    copy.UI.rank.share,
    config.COLORS.pink,
    '#641f48',
    15
  );
};

Renderer.prototype.drawPropSupplyModal = function (model) {
  var propId = model.pendingProp && model.pendingProp.propId;
  var def = config.PROP_DEFS[propId] || config.PROP_DEFS.hint;
  var p = this.modalPanel(copy.UI.prop.introTitle, 334);
  this.drawPropIcon(def.id, p.x + p.w / 2, p.y + 121, 72);
  this.fillTextCenter(def.name, p.x + p.w / 2, p.y + 180, 25, config.COLORS.ink, '900');
  this.fillTextCenter(copy.UI.prop.introLine, p.x + p.w / 2, p.y + 218, 16, config.COLORS.inkSoft, '800');
  this.fillTextCenter(copy.UI.prop.introHint, p.x + p.w / 2, p.y + 242, 12, '#7b86a3', '700');
  this.drawButton('claimPropShare', p.x + 44, p.y + 268, p.w - 88, 46, copy.UI.prop.share, config.COLORS.pink, '#641f48', 17);
  this.drawShareGlyph(p.x + 67, p.y + 291, 8, '#641f48');
};

function distanceToSegment(px, py, a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - a.x, py - a.y);
  }
  var t = ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy);
  t = clamp(t, 0, 1);
  var x = a.x + t * dx;
  var y = a.y + t * dy;
  return Math.hypot(px - x, py - y);
}

function sampleTrack(track, distance) {
  var value = clamp(distance, 0, track.length - 1);
  var index = Math.floor(value);
  var nextIndex = Math.min(track.length - 1, index + 1);
  var t = value - index;
  return {
    r: track[index].r + (track[nextIndex].r - track[index].r) * t,
    c: track[index].c + (track[nextIndex].c - track[index].c) * t
  };
}

function sameGridPoint(a, b) {
  return Math.abs(a.r - b.r) < 0.0001 && Math.abs(a.c - b.c) < 0.0001;
}

module.exports = Renderer;
