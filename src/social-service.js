'use strict';

var config = require('./config');
var copy = require('./copy');
var platform = require('./platform');
var shareCard = require('./share-card');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function integer(value, fallback) {
  var parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseQuery(query) {
  if (!query) {
    return {};
  }
  if (typeof query === 'object') {
    return query;
  }
  return String(query).split('&').reduce(function (result, part) {
    var bits = part.split('=');
    if (!bits[0]) {
      return result;
    }
    try {
      result[decodeURIComponent(bits[0])] = decodeURIComponent(bits.slice(1).join('=') || '');
    } catch (err) {
      result[bits[0]] = bits.slice(1).join('=') || '';
    }
    return result;
  }, {});
}

function encodeQuery(values) {
  return Object.keys(values).filter(function (key) {
    return values[key] !== undefined && values[key] !== null && values[key] !== '';
  }).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(String(values[key]));
  }).join('&');
}

function hashString(text) {
  var hash = 2166136261;
  for (var i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pad(value) {
  return value < 10 ? '0' + value : String(value);
}

function dayKey(now) {
  var date = now instanceof Date ? now : new Date(now || Date.now());
  return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
}

function formatMs(milliseconds) {
  var total = Math.max(0, Math.round(milliseconds || 0));
  var seconds = total / 1000;
  if (seconds < 60) {
    return seconds.toFixed(1).replace(/\.0$/, '') + '秒';
  }
  var minutes = Math.floor(seconds / 60);
  return minutes + '分' + pad(Math.round(seconds % 60)) + '秒';
}

function sanitizeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function SocialService(adapter) {
  this.platform = adapter || platform;
  this.boundModel = null;
  this.privacyAuthorized = !this.platform.hasWx;
  this.onlineInitialized = false;
  this.officialListenerBound = false;
  this.rankSyncQueue = Promise.resolve(true);
}

SocialService.prototype.isPrivacyAuthorized = function () {
  return this.privacyAuthorized;
};

SocialService.prototype.setPrivacyAuthorized = function (authorized) {
  this.privacyAuthorized = !!authorized;
  if (!this.privacyAuthorized) {
    return false;
  }
  if (!this.onlineInitialized) {
    this.onlineInitialized = true;
    this.platform.initCloud(config.SOCIAL.cloudEnvId, config.SOCIAL.cloudFunctionName);
  }
  this.bindOfficialChallengeListener();
  return true;
};

SocialService.prototype.getDailyChallenge = function (now) {
  var key = dayKey(now);
  var spread = Math.max(1, config.GAME.maxGeneratedLevel - 1);
  var levelNumber = 2 + hashString('choubao-daily-' + key) % spread;
  return {
    id: 'daily-' + key,
    type: 'daily',
    level: levelNumber,
    dayKey: key,
    targetMs: 0,
    source: 'home'
  };
};

SocialService.prototype.parseLaunchOptions = function (options) {
  var query = parseQuery(options && options.query);
  var mode = query.mode;
  if (mode !== 'duel' && mode !== 'rescue' && mode !== 'daily') {
    return null;
  }
  var levelNumber = clamp(integer(query.level, 1), 1, config.GAME.maxGeneratedLevel);
  var removed = String(query.removed || '').split('.').map(function (value) {
    return integer(value, -1);
  }).filter(function (value, index, list) {
    return value >= 0 && list.indexOf(value) === index;
  }).slice(0, 80);
  return {
    id: sanitizeId(query.cid) || this.createChallengeId(levelNumber),
    type: mode === 'rescue' ? 'rescue' : (mode === 'daily' ? 'daily' : 'duel'),
    level: levelNumber,
    targetMs: clamp(integer(query.target, 0), 0, 60 * 60 * 1000),
    targetCombo: clamp(integer(query.combo, 0), 0, 999),
    targetMistakes: clamp(integer(query.mistakes, 0), 0, 999),
    removedIds: removed,
    dayKey: String(query.day || ''),
    copyId: sanitizeId(query.cv),
    source: String(query.from || 'share').slice(0, 24)
  };
};

SocialService.prototype.createChallengeId = function (levelNumber) {
  return 'cb' + Date.now().toString(36) + '-' + levelNumber.toString(36) + '-' + Math.floor(Math.random() * 1679616).toString(36);
};

SocialService.prototype.getPlayStyle = function (result) {
  if (result.mistakes === 0 && result.combo >= 12) {
    return '丝滑臭宝';
  }
  if (result.mistakes === 0) {
    return '稳稳臭宝';
  }
  if (result.mistakes >= 2) {
    return '不服臭宝';
  }
  if (result.elapsedMs <= result.timeLimitMs * 0.42) {
    return '闪电臭宝';
  }
  return '机灵臭宝';
};

SocialService.prototype.getResult = function (model, kind) {
  var elapsedMs = model && model.level
    ? Math.max(1000, Math.round((model.level.timeLimit - model.timeLeft) * 1000))
    : 0;
  var result = {
    kind: kind || 'win',
    level: model && model.level ? model.level.number : 1,
    arrows: model && model.level ? model.level.targetArrows : 0,
    elapsedMs: elapsedMs,
    timeText: formatMs(elapsedMs),
    timeLimitMs: model && model.level ? model.level.timeLimit * 1000 : 0,
    combo: model ? model.bestComboThisRound || 0 : 0,
    mistakes: model ? model.wrongThisRound || 0 : 0,
    remaining: model ? model.activeCount() : 0,
    runMode: model ? model.runMode || 'normal' : 'normal'
  };
  if (model && model.lastResult && model.lastResult.kind === result.kind && model.lastResult.level === result.level) {
    result.beatTarget = !!model.lastResult.beatTarget;
    result.targetMs = model.lastResult.targetMs || 0;
  }
  result.style = this.getPlayStyle(result);
  return result;
};

SocialService.prototype.getShareTitle = function (result) {
  return copy.getShareCopy(result).title;
};

SocialService.prototype.buildShare = function (model, kind) {
  var result = this.getResult(model, kind);
  var challenge = model.preparedChallenge;
  if (!challenge || challenge.level !== result.level || challenge.kind !== result.kind) {
    challenge = {
      id: this.createChallengeId(result.level),
      level: result.level,
      kind: result.kind
    };
    model.preparedChallenge = challenge;
  }
  var removedIds = [];
  if (result.kind === 'stuck' && model.level) {
    model.level.arrows.forEach(function (arrow) {
      if (!arrow.active) {
        removedIds.push(arrow.id);
      }
    });
  }
  var mode = result.kind === 'stuck' ? 'rescue' : (result.runMode === 'daily' || result.runMode === 'official' ? 'daily' : 'duel');
  var shareCopy = copy.getShareCopy(result);
  var query = encodeQuery({
    mode: mode,
    cid: challenge.id,
    level: result.level,
    target: result.kind === 'stuck' ? 0 : result.elapsedMs,
    combo: result.combo,
    mistakes: result.mistakes,
    removed: removedIds.join('.'),
    day: mode === 'daily' ? dayKey() : '',
    cv: shareCopy.id,
    from: result.runMode === 'challenge' ? 'counter' : 'result'
  });
  var imageUrl = shareCard.render(this.platform, model.level, result, shareCopy);
  var payload = {
    title: shareCopy.title,
    text: shareCopy.text,
    imageUrl: imageUrl || config.SOCIAL.fallbackShareImage,
    query: query,
    challengeId: challenge.id,
    copyId: shareCopy.id,
    result: result
  };
  this.prepareCloudChallenge(payload, removedIds);
  return payload;
};

SocialService.prototype.prepareCloudChallenge = function (payload, removedIds) {
  if (!this.privacyAuthorized) {
    return;
  }
  this.platform.callSocialCloud('createChallenge', {
    challengeId: payload.challengeId,
    level: payload.result.level,
    kind: payload.result.kind,
    targetMs: payload.result.elapsedMs,
    targetCombo: payload.result.combo,
    targetMistakes: payload.result.mistakes,
    removedIds: removedIds || [],
    copyId: payload.copyId,
    createdAt: Date.now()
  }).catch(function () {});
};

SocialService.prototype.share = function (model, kind) {
  var payload = this.buildShare(model, kind || 'win');
  var opened = this.platform.shareGame(payload);
  if (opened) {
    this.track(model, model.runMode === 'challenge' ? 'counterShares' : 'shareCreates', {
      mode: kind || 'win',
      level: payload.result.level,
      copyId: payload.copyId
    });
  }
  return opened;
};

SocialService.prototype.buildRankShare = function (model) {
  var level = Math.max(1, integer(model && model.saveData && model.saveData.highestLevel, 1));
  var shareCopy = copy.getRankShareCopy(level);
  var rankShareId = 'rank-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 46656).toString(36);
  var imageUrl = shareCard.renderRank(this.platform, level);
  return {
    title: shareCopy.title,
    text: shareCopy.text,
    imageUrl: imageUrl || config.SOCIAL.fallbackShareImage || 'assets/icon/choubao-mascot-288.png',
    query: encodeQuery({
      from: 'rank',
      rankLevel: level,
      rid: rankShareId,
      cv: shareCopy.id
    }),
    copyId: shareCopy.id,
    level: level,
    rankShareId: rankShareId
  };
};

SocialService.prototype.parseRankShareLaunch = function (options) {
  var query = parseQuery(options && options.query);
  if (query.from !== 'rank') {
    return null;
  }
  var level = clamp(integer(query.rankLevel || query.level, 1), 1, config.GAME.maxGeneratedLevel);
  return {
    id: sanitizeId(query.rid) || 'rank-' + level,
    level: level,
    copyId: sanitizeId(query.cv)
  };
};

SocialService.prototype.shareRank = function (model) {
  var payload = this.buildRankShare(model);
  var opened = this.platform.shareGame(payload);
  if (opened) {
    this.track(model, 'shareCreates', {
      mode: 'rank',
      level: payload.level,
      copyId: payload.copyId
    });
  }
  return opened;
};

SocialService.prototype.hydrateChallenge = function (challenge) {
  if (!this.privacyAuthorized || !challenge || !challenge.id) {
    return Promise.resolve(challenge);
  }
  return this.platform.callSocialCloud('getChallenge', {
    challengeId: challenge.id
  }).then(function (result) {
    var data = result && result.result && result.result.data;
    if (!data) {
      return challenge;
    }
    challenge.level = clamp(integer(data.level, challenge.level), 1, config.GAME.maxGeneratedLevel);
    challenge.targetMs = clamp(integer(data.targetMs, challenge.targetMs), 0, 60 * 60 * 1000);
    challenge.targetCombo = clamp(integer(data.targetCombo, challenge.targetCombo), 0, 999);
    challenge.targetMistakes = clamp(integer(data.targetMistakes, challenge.targetMistakes), 0, 999);
    challenge.removedIds = Array.isArray(data.removedIds) ? data.removedIds.slice(0, 80) : challenge.removedIds;
    challenge.copyId = sanitizeId(data.copyId) || challenge.copyId;
    return challenge;
  }).catch(function () {
    return challenge;
  });
};

SocialService.prototype.submitChallengeResult = function (model, result) {
  var challenge = model.activeChallenge;
  if (!this.privacyAuthorized || !challenge || !challenge.id) {
    return;
  }
  this.platform.callSocialCloud('submitResult', {
    challengeId: challenge.id,
    elapsedMs: result.elapsedMs,
    combo: result.combo,
    mistakes: result.mistakes,
    cleared: result.kind === 'win'
  }).catch(function () {});
};

SocialService.prototype.refreshInbox = function (model) {
  if (!this.privacyAuthorized) {
    return Promise.resolve(false);
  }
  return this.platform.callSocialCloud('getInbox', {}).then(function (response) {
    var data = response && response.result && response.result.data;
    if (data) {
      model.socialInbox = {
        attempts: integer(data.attempts, 0),
        wins: integer(data.wins, 0)
      };
    }
    return true;
  }).catch(function () {
    return false;
  });
};

SocialService.prototype.track = function (model, key, detail) {
  if (model && model.saveData && model.saveData.social) {
    model.saveData.social[key] = (model.saveData.social[key] || 0) + 1;
    model.persist();
  }
  var eventNames = {
    shareCreates: 'share_create',
    counterShares: 'counter_share',
    challengeOpens: 'challenge_open',
    challengeStarts: 'challenge_start',
    challengeFinishes: 'challenge_finish',
    propIntroShares: 'prop_intro_share',
    propAdStarts: 'prop_ad_start',
    propAdCompletes: 'prop_ad_complete',
    reviveAdStarts: 'revive_ad_start',
    reviveAdCompletes: 'revive_ad_complete'
  };
  if (this.privacyAuthorized) {
    this.platform.reportEvent('choubao_' + (eventNames[key] || key), detail || {});
  }
};

SocialService.prototype.syncRank = function (model, result) {
  if (!this.privacyAuthorized) {
    return Promise.resolve(false);
  }
  var data = [
    { key: config.SOCIAL.levelRankKey, value: String(model.saveData.highestLevel || 1) }
  ];
  if (result && result.elapsedMs && (result.runMode === 'daily' || result.runMode === 'official')) {
    data.push({ key: config.SOCIAL.dailyRankKey, value: String(result.elapsedMs) });
  }
  var levelScore = Math.max(1, Math.round(model.saveData.highestLevel || 1));
  var self = this;
  this.rankSyncQueue = this.rankSyncQueue.catch(function () {
    return false;
  }).then(function () {
    var cloudWrite = Promise.resolve(self.platform.setUserCloudStorage(data)).catch(function () {
      return false;
    });
    if (typeof self.platform.updateRankScore === 'function') {
      try {
        Promise.resolve(self.platform.updateRankScore(config.SOCIAL.levelRankKey, levelScore)).catch(function () {
          return false;
        });
      } catch (err) {}
    }
    return cloudWrite.then(function (cloudWritten) {
      var written = !!cloudWritten;
      if (model.saveData && model.saveData.social && model.saveData.social.rankReminderAccepted) {
        model.saveData.social.rankReminderScoreSynced = written;
        if (typeof model.persist === 'function') {
          model.persist();
        }
      }
      return written;
    });
  });
  return this.rankSyncQueue;
};

SocialService.prototype.requestFriendRank = function (width, height, options) {
  if (!this.privacyAuthorized) {
    return null;
  }
  var requestOptions = options || {};
  requestOptions.selfScore = Math.max(1, integer(
    this.boundModel && this.boundModel.saveData && this.boundModel.saveData.highestLevel,
    1
  ));
  return this.platform.requestFriendRankCanvas(width, height, [
    config.SOCIAL.levelRankKey,
    config.SOCIAL.dailyRankKey
  ], requestOptions);
};

SocialService.prototype.requestRankReminder = function () {
  if (!this.privacyAuthorized) {
    return Promise.resolve(false);
  }
  var self = this;
  return this.getRankReminderStatus().then(function (current) {
    if (current && current.confirmed && current.accepted) {
      return current;
    }
    return Promise.resolve(self.platform.requestRankReminder()).catch(function () {
      return { supported: true, confirmed: false, accepted: false, status: 'error' };
    });
  });
};

SocialService.prototype.getRankReminderStatus = function () {
  if (!this.privacyAuthorized || typeof this.platform.getRankReminderStatus !== 'function') {
    return Promise.resolve({ supported: false, confirmed: false, accepted: false, status: 'unknown' });
  }
  return Promise.resolve(this.platform.getRankReminderStatus()).catch(function () {
    return { supported: true, confirmed: false, accepted: false, status: 'error' };
  });
};

SocialService.prototype.bindModel = function (model) {
  this.boundModel = model;
  this.bindOfficialChallengeListener();
};

SocialService.prototype.bindOfficialChallengeListener = function () {
  if (!this.privacyAuthorized || this.officialListenerBound || !this.boundModel) {
    return;
  }
  var model = this.boundModel;
  this.officialListenerBound = true;
  this.platform.onOfficialChallengeStart(function (challengeInfo) {
    if (!challengeInfo || !challengeInfo.scoreKey || challengeInfo.scoreKey === config.SOCIAL.officialScoreKey) {
      model.startOfficialDailyChallenge();
    }
  });
};

SocialService.prototype.startOfficialArena = function (model) {
  if (!this.privacyAuthorized) {
    return Promise.resolve(false);
  }
  var result = model.lastResult || this.getResult(model, 'win');
  return this.platform.createOfficialChallenge(config.SOCIAL.officialScoreKey, Math.max(1, 3600000 - result.elapsedMs));
};

SocialService.prototype.finishOfficialArena = function (result) {
  if (!this.privacyAuthorized) {
    return Promise.resolve(false);
  }
  return this.platform.finishOfficialChallenge(config.SOCIAL.officialScoreKey, Math.max(1, 3600000 - result.elapsedMs));
};

SocialService.prototype.abortOfficialArena = function () {
  if (!this.privacyAuthorized) {
    return;
  }
  this.platform.abortOfficialChallenge();
};

SocialService.formatMs = formatMs;
SocialService.dayKey = dayKey;

module.exports = SocialService;
