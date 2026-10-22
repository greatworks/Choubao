'use strict';

var sharedCanvas = wx.getSharedCanvas();
var context = sharedCanvas.getContext('2d');
var latestRequestId = 0;
var animationToken = 0;
var logicalWidth = 300;
var logicalHeight = 270;
var pixelRatio = 1;
var lastSelfRank = 0;

try {
  lastSelfRank = parseInt(wx.getStorageSync && wx.getStorageSync('choubao_last_friend_rank'), 10) || 0;
} catch (err) {}

function valueOf(player, key) {
  var list = player && player.KVDataList ? player.KVDataList : [];
  for (var i = 0; i < list.length; i += 1) {
    if (list[i].key === key) {
      return parseInt(list[i].value, 10) || 0;
    }
  }
  return 0;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function configureCanvas(message) {
  logicalWidth = Math.max(1, Math.round(Number(message.width) || 300));
  logicalHeight = Math.max(1, Math.round(Number(message.height) || 270));
  pixelRatio = Math.max(1, Math.min(3, Number(message.pixelRatio) || 1));
  var physicalWidth = Math.max(1, Math.round(logicalWidth * pixelRatio));
  var physicalHeight = Math.max(1, Math.round(logicalHeight * pixelRatio));
  if (sharedCanvas.width !== physicalWidth) {
    sharedCanvas.width = physicalWidth;
  }
  if (sharedCanvas.height !== physicalHeight) {
    sharedCanvas.height = physicalHeight;
  }
  context = sharedCanvas.getContext('2d');
  if (context.setTransform) {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  } else {
    context.scale(pixelRatio, pixelRatio);
  }
  context.imageSmoothingEnabled = true;
}

function sortPlayers(players, keys) {
  var levelKey = keys[0];
  var dailyKey = keys[1];
  return (players || []).slice().sort(function (left, right) {
    var levelDifference = valueOf(right, levelKey) - valueOf(left, levelKey);
    if (levelDifference) {
      return levelDifference;
    }
    var leftTime = valueOf(left, dailyKey) || 999999999;
    var rightTime = valueOf(right, dailyKey) || 999999999;
    return leftTime - rightTime;
  });
}

function findSelfIndex(ranked, levelKey, selfScore) {
  var i;
  for (i = 0; i < ranked.length; i += 1) {
    if (ranked[i] && ranked[i].isSelf) {
      return i;
    }
  }
  for (i = 0; i < ranked.length; i += 1) {
    if (valueOf(ranked[i], levelKey) === selfScore) {
      return i;
    }
  }
  return -1;
}

function visiblePlayers(ranked, selfIndex) {
  var visible = ranked.slice(0, 6).map(function (player, index) {
    return { player: player, rank: index + 1, isSelf: index === selfIndex };
  });
  if (selfIndex >= 6) {
    visible = ranked.slice(0, 5).map(function (player, index) {
      return { player: player, rank: index + 1, isSelf: false };
    });
    visible.push({ player: ranked[selfIndex], rank: selfIndex + 1, isSelf: true });
  }
  return visible;
}

function clearCanvas() {
  context.clearRect(0, 0, logicalWidth, logicalHeight);
  context.fillStyle = '#eef4ff';
  context.fillRect(0, 0, logicalWidth, logicalHeight);
}

function drawHeader() {
  context.textBaseline = 'middle';
  context.font = '700 11px sans-serif';
  context.fillStyle = '#556082';
  context.textAlign = 'left';
  context.fillText('臭宝好友榜', 12, 15);
  context.textAlign = 'right';
  context.fillText('关卡 / 今日用时', logicalWidth - 12, 15);
}

function drawMovementParticles(y, movement, progress) {
  if (!movement) {
    return;
  }
  var color = movement.delta > 0 ? '#18b58f' : '#ff7a55';
  var direction = movement.delta > 0 ? -1 : 1;
  context.save();
  context.globalAlpha = Math.max(0, 1 - progress);
  context.fillStyle = color;
  for (var i = 0; i < 6; i += 1) {
    var spread = (i - 2.5) * 9;
    context.beginPath();
    context.arc(30 + i * 12, y + spread * 0.18 + direction * progress * 18, 2.5 - i % 2 * 0.6, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawRow(item, index, keys, rowHeight, movement, progress) {
  var y = 25 + index * rowHeight;
  var rowBodyHeight = rowHeight - 4;
  var offset = 0;
  if (item.isSelf && movement) {
    offset = (movement.delta > 0 ? 18 : -18) * (1 - progress);
  }
  y += offset;

  context.save();
  if (item.isSelf && movement) {
    context.shadowColor = movement.delta > 0 ? 'rgba(24,181,143,0.42)' : 'rgba(255,122,85,0.4)';
    context.shadowBlur = 12 * (1 - progress) + 3;
  }
  roundRect(context, 7, y, logicalWidth - 14, rowBodyHeight, 7);
  context.fillStyle = item.isSelf ? '#dcf8ef' : (item.rank === 1 ? '#fff5bd' : '#ffffff');
  context.fill();
  if (item.isSelf) {
    context.lineWidth = 1.5;
    context.strokeStyle = '#20b69b';
    context.stroke();
  }
  context.restore();

  context.fillStyle = item.rank <= 3 ? ['#ef4f4f', '#ff9438', '#2c72c7'][item.rank - 1] : '#9aa2b8';
  context.beginPath();
  context.arc(24, y + rowBodyHeight / 2, 10.5, 0, Math.PI * 2);
  context.fill();
  context.textAlign = 'center';
  context.font = '900 10px sans-serif';
  context.fillStyle = '#ffffff';
  context.fillText(String(item.rank), 24, y + rowBodyHeight / 2 + 0.5);

  var nickname = item.isSelf ? '我 · ' + String(item.player.nickname || '臭宝') : String(item.player.nickname || '神秘臭宝');
  var nicknameLimit = logicalWidth < 260 ? 6 : 8;
  if (nickname.length > nicknameLimit) {
    nickname = nickname.slice(0, nicknameLimit) + '…';
  }
  context.textAlign = 'left';
  context.font = '800 12px sans-serif';
  context.fillStyle = '#172044';
  context.fillText(nickname, 42, y + rowBodyHeight / 2);

  if (item.isSelf && movement && progress < 0.88) {
    var movementText = movement.delta > 0 ? '↑ 前进' + movement.amount + '名' : '↓ 后退' + movement.amount + '名';
    var badgeWidth = 70;
    roundRect(context, logicalWidth - badgeWidth - 8, y + 5, badgeWidth, rowBodyHeight - 10, 8);
    context.fillStyle = movement.delta > 0 ? '#18b58f' : '#ff7a55';
    context.fill();
    context.textAlign = 'center';
    context.font = '900 10px sans-serif';
    context.fillStyle = '#ffffff';
    context.fillText(movementText, logicalWidth - badgeWidth / 2 - 8, y + rowBodyHeight / 2);
  } else {
    var level = Math.max(1, valueOf(item.player, keys[0]));
    var dailyMs = valueOf(item.player, keys[1]);
    var score = 'Lv.' + level;
    if (dailyMs) {
      score += ' / ' + (dailyMs / 1000).toFixed(1) + 's';
    }
    context.textAlign = 'right';
    context.font = '800 11px sans-serif';
    context.fillStyle = '#2c72c7';
    context.fillText(score, logicalWidth - 11, y + rowBodyHeight / 2);
  }

  if (item.isSelf) {
    drawMovementParticles(y + rowBodyHeight / 2, movement, progress);
  }
}

function drawRank(players, keys, message, movement, progress) {
  var ranked = sortPlayers(players, keys);
  var selfIndex = findSelfIndex(ranked, keys[0], Math.max(1, Number(message.selfScore) || 1));
  var visible = visiblePlayers(ranked, selfIndex);
  clearCanvas();
  drawHeader();

  if (!visible.length) {
    context.textAlign = 'center';
    context.font = '800 15px sans-serif';
    context.fillStyle = '#556082';
    context.fillText('还没臭宝来占榜', logicalWidth / 2, logicalHeight / 2 - 12);
    context.font = '600 12px sans-serif';
    context.fillText('完成一局后再来看看', logicalWidth / 2, logicalHeight / 2 + 18);
    return { selfRank: 0 };
  }

  var rowHeight = Math.min(37, (logicalHeight - 42) / visible.length);
  visible.forEach(function (item, index) {
    drawRow(item, index, keys, rowHeight, item.isSelf ? movement : null, progress);
  });

  return { selfRank: selfIndex >= 0 ? selfIndex + 1 : 0 };
}

function animateRank(players, keys, message, movement) {
  animationToken += 1;
  var token = animationToken;
  var startedAt = Date.now();
  function frame() {
    if (token !== animationToken) {
      return;
    }
    var elapsed = Date.now() - startedAt;
    var linear = Math.min(1, elapsed / 1050);
    var progress = 1 - Math.pow(1 - linear, 3);
    drawRank(players, keys, message, movement, progress);
    if (linear < 1) {
      setTimeout(frame, 16);
    }
  }
  frame();
}

function renderLoading() {
  animationToken += 1;
  clearCanvas();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '800 15px sans-serif';
  context.fillStyle = '#556082';
  context.fillText('臭宝榜加载中…', logicalWidth / 2, logicalHeight / 2);
}

wx.onMessage(function (message) {
  if (!message || message.type !== 'friendRank') {
    return;
  }
  configureCanvas(message);
  var requestId = Math.max(latestRequestId + 1, parseInt(message.requestId, 10) || 0);
  latestRequestId = requestId;
  if (message.showLoading !== false) {
    renderLoading();
  }
  wx.getFriendCloudStorage({
    keyList: message.keyList || [],
    success: function (result) {
      if (requestId !== latestRequestId) {
        return;
      }
      var players = result.data || [];
      var ranked = sortPlayers(players, message.keyList || []);
      var selfIndex = findSelfIndex(ranked, (message.keyList || [])[0], Math.max(1, Number(message.selfScore) || 1));
      var selfRank = selfIndex >= 0 ? selfIndex + 1 : 0;
      var movement = null;
      if (lastSelfRank > 0 && selfRank > 0 && selfRank !== lastSelfRank) {
        movement = {
          delta: lastSelfRank - selfRank,
          amount: Math.abs(lastSelfRank - selfRank)
        };
      }
      if (selfRank > 0) {
        lastSelfRank = selfRank;
        try {
          if (wx.setStorageSync) {
            wx.setStorageSync('choubao_last_friend_rank', selfRank);
          }
        } catch (err) {}
      }
      if (movement) {
        animateRank(players, message.keyList || [], message, movement);
      } else {
        animationToken += 1;
        drawRank(players, message.keyList || [], message, null, 1);
      }
    },
    fail: function () {
      if (requestId !== latestRequestId) {
        return;
      }
      animationToken += 1;
      drawRank([], message.keyList || [], message, null, 1);
    }
  });
});
