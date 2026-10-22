'use strict';

var config = require('./config');
var copy = require('./copy');
var storage = require('./storage');
var levelGenerator = require('./level-generator');
var platform = require('./platform');
var SocialService = require('./social-service');

function activeArrows(level) {
  if (!level) {
    return [];
  }
  return level.arrows.filter(function (arrow) {
    return arrow.active;
  });
}

function GameModel(saveData, adService, sound, socialService) {
  this.saveData = saveData;
  this.adService = adService;
  this.sound = sound;
  this.screen = 'home';
  this.modal = null;
  this.level = null;
  this.lives = config.GAME.maxLives;
  this.timeLeft = 0;
  this.score = 0;
  this.combo = 0;
  this.bestComboThisRound = 0;
  this.clearStreak = 0;
  this.lastClearAt = 0;
  this.melodyStep = 0;
  this.praiseEffects = [];
  this.selectedTool = null;
  this.assistLineActive = false;
  this.gridAccessGrantedThisRound = false;
  this.pendingProp = null;
  this.propAdLoading = false;
  this.zoom = 1;
  this.pan = { x: 0, y: 0 };
  this.message = '';
  this.messageTime = 0;
  this.winDelay = -1;
  this.winStartedAt = 0;
  this.loseReason = '';
  this.lastReward = 0;
  this.wrongThisRound = 0;
  this.roundStartedAt = 0;
  this.runMode = 'normal';
  this.activeChallenge = null;
  this.pendingChallenge = null;
  this.challengeAfterWarmup = null;
  this.preparedChallenge = null;
  this.lastResult = null;
  this.socialInbox = { attempts: 0, wins: 0 };
  this.rankCanvas = null;
  this.rankRefresh = null;
  this.handledLaunchChallenges = {};
  this.challengeResultSubmitted = false;
  this.privacyRequester = null;
  this.social = socialService || new SocialService(platform);
  this.social.bindModel(this);
}

GameModel.prototype.persist = function () {
  storage.save(this.saveData);
};

GameModel.prototype.toast = function (text, seconds) {
  this.message = text;
  this.messageTime = seconds || 1.4;
};

GameModel.prototype.setPrivacyRequester = function (requester) {
  this.privacyRequester = typeof requester === 'function' ? requester : null;
};

GameModel.prototype.withOnlinePrivacy = function (callback) {
  var self = this;
  function runCallback() {
    try {
      return Promise.resolve(callback()).then(function () {
        return true;
      });
    } catch (err) {
      self.toast(copy.UI.toast.privacyNeeded, 1.8);
      return Promise.resolve(false);
    }
  }
  if (!this.social.isPrivacyAuthorized || this.social.isPrivacyAuthorized()) {
    return runCallback();
  }
  if (!this.privacyRequester) {
    this.toast(copy.UI.toast.privacyNeeded, 1.8);
    return Promise.resolve(false);
  }
  return this.privacyRequester().then(function (authorized) {
    if (!authorized) {
      self.toast(copy.UI.toast.privacyNeeded, 1.8);
      return false;
    }
    return runCallback();
  }).catch(function () {
    self.toast(copy.UI.toast.privacyNeeded, 1.8);
    return false;
  });
};

GameModel.prototype.openPrivacyContract = function () {
  var self = this;
  return platform.openPrivacyContract().then(function (opened) {
    if (!opened) {
      self.toast(copy.UI.toast.privacyUnavailable, 2.2);
    }
    return opened;
  });
};

GameModel.prototype.openHome = function () {
  if (this.modal === 'lose') {
    this.finishFailedChallenge();
  }
  if (this.runMode === 'official' && !this.lastResult) {
    this.social.abortOfficialArena();
  }
  this.screen = 'home';
  this.modal = null;
  this.level = null;
  this.selectedTool = null;
  this.assistLineActive = false;
  this.gridAccessGrantedThisRound = false;
  this.pendingProp = null;
  this.propAdLoading = false;
  this.runMode = 'normal';
  this.activeChallenge = null;
  this.challengeAfterWarmup = null;
  this.rankCanvas = null;
  this.rankRefresh = null;
  this.praiseEffects = [];
};

GameModel.prototype.startLevel = function (levelNumber, skipEnergyCost, options) {
  var startOptions = options || {};
  var mode = startOptions.mode || 'normal';
  var challenge = startOptions.challenge || null;
  var number = Math.max(1, Math.min(config.GAME.maxGeneratedLevel, levelNumber || this.saveData.currentLevel || 1));
  if (mode === 'normal') {
    this.saveData.currentLevel = number;
    this.persist();
  }

  this.level = levelGenerator.generateLevel(number);
  if (challenge && challenge.removedIds && challenge.removedIds.length) {
    var removedLookup = {};
    challenge.removedIds.forEach(function (id) {
      removedLookup[id] = true;
    });
    this.level.arrows.forEach(function (arrow) {
      if (removedLookup[arrow.id]) {
        arrow.active = false;
      }
    });
    this.level.targetArrows = activeArrows(this.level).length;
  }
  this.screen = 'play';
  this.modal = null;
  this.lives = config.GAME.maxLives;
  this.timeLeft = this.level.timeLimit;
  this.score = 0;
  this.combo = 0;
  this.bestComboThisRound = 0;
  this.clearStreak = 0;
  this.lastClearAt = 0;
  this.melodyStep = 0;
  this.praiseEffects = [];
  this.selectedTool = null;
  this.assistLineActive = false;
  this.gridAccessGrantedThisRound = false;
  this.pendingProp = null;
  this.propAdLoading = false;
  this.zoom = 1;
  this.pan.x = 0;
  this.pan.y = 0;
  this.message = '';
  this.messageTime = 0;
  this.winDelay = -1;
  this.winStartedAt = 0;
  this.loseReason = '';
  this.wrongThisRound = 0;
  this.roundStartedAt = platform.now();
  this.runMode = mode;
  this.activeChallenge = challenge;
  this.preparedChallenge = null;
  this.lastResult = null;
  this.challengeResultSubmitted = false;
};

GameModel.prototype.restartLevel = function () {
  if (this.modal === 'lose') {
    this.finishFailedChallenge();
  }
  if (!this.level) {
    this.startLevel(this.saveData.currentLevel || 1);
    return;
  }
  this.startLevel(this.level.number, true, {
    mode: this.runMode,
    challenge: this.activeChallenge
  });
};

GameModel.prototype.nextLevel = function () {
  if (this.runMode !== 'normal') {
    this.openHome();
    return;
  }
  var currentLevel = this.level ? this.level.number : this.saveData.currentLevel;
  if (currentLevel >= config.GAME.maxGeneratedLevel) {
    this.openHome();
    return;
  }
  if (currentLevel === 1 && !this.saveData.social.difficultySpikeSeen) {
    this.saveData.social.difficultySpikeSeen = true;
    this.persist();
    this.modal = 'difficultySpike';
    if (this.sound && typeof this.sound.play === 'function') {
      this.sound.play('difficultySpike');
    }
    return;
  }
  this.startLevel(currentLevel + 1);
};

GameModel.prototype.acceptDifficultySpike = function () {
  this.startLevel(2);
};

GameModel.prototype.handleLaunchOptions = function (options) {
  var challenge = this.social.parseLaunchOptions(options);
  var self = this;
  if (!challenge || this.handledLaunchChallenges[challenge.id]) {
    return false;
  }
  this.handledLaunchChallenges[challenge.id] = true;
  this.pendingChallenge = challenge;
  this.screen = 'home';
  this.modal = 'challengeInvite';
  this.saveData.social.lastChallengeId = challenge.id;
  this.social.track(this, 'challengeOpens', {
    type: challenge.type,
    level: challenge.level,
    copyId: challenge.copyId || ''
  });
  this.social.hydrateChallenge(challenge).then(function (hydrated) {
    if (self.pendingChallenge && self.pendingChallenge.id === challenge.id) {
      self.pendingChallenge = hydrated;
    }
  });
  return true;
};

GameModel.prototype.acceptPendingChallenge = function () {
  var challenge = this.pendingChallenge;
  if (!challenge) {
    return;
  }
  this.pendingChallenge = null;
  this.social.track(this, 'challengeStarts', {
    type: challenge.type,
    level: challenge.level,
    copyId: challenge.copyId || ''
  });
  if (this.saveData.stats.totalCleared === 0 && challenge.level > 1) {
    this.challengeAfterWarmup = challenge;
    this.startLevel(1, true, { mode: 'warmup' });
    return;
  }
  this.startChallenge(challenge);
};

GameModel.prototype.startChallenge = function (challenge) {
  if (!challenge) {
    return;
  }
  this.startLevel(challenge.level, true, {
    mode: challenge.type === 'daily' ? 'daily' : (challenge.type === 'official' ? 'official' : 'challenge'),
    challenge: challenge
  });
};

GameModel.prototype.startChallengeAfterWarmup = function () {
  var challenge = this.challengeAfterWarmup;
  this.challengeAfterWarmup = null;
  if (challenge) {
    this.startChallenge(challenge);
  } else {
    this.openHome();
  }
};

GameModel.prototype.startDailyChallenge = function () {
  var challenge = this.social.getDailyChallenge();
  if (this.saveData.stats.totalCleared === 0) {
    this.challengeAfterWarmup = challenge;
    this.startLevel(1, true, { mode: 'warmup' });
    return;
  }
  this.startChallenge(challenge);
};

GameModel.prototype.startOfficialDailyChallenge = function () {
  var challenge = this.social.getDailyChallenge();
  challenge.type = 'official';
  if (this.saveData.stats.totalCleared === 0) {
    this.challengeAfterWarmup = challenge;
    this.startLevel(1, true, { mode: 'warmup' });
    return;
  }
  this.startChallenge(challenge);
};

GameModel.prototype.openFriendRank = function (width, height, pixelRatio) {
  var self = this;
  return this.withOnlinePrivacy(function () {
    self.modal = 'friendRank';
    self.rankCanvas = null;
    self.rankRefresh = {
      width: Math.max(1, Math.round(width || 286)),
      height: Math.max(1, Math.round(height || 270)),
      pixelRatio: Math.max(1, Number(pixelRatio) || 1)
    };
    var rankSync = typeof self.social.syncRank === 'function' ? self.social.syncRank(self) : true;
    return Promise.resolve(rankSync).catch(function () {
      return false;
    }).then(function (synced) {
      return self.refreshRankReminderState(!!synced);
    }).then(function () {
      if (self.modal === 'friendRank') {
        self.refreshFriendRank(true);
      }
    });
  });
};

GameModel.prototype.refreshRankReminderState = function (scoreSynced) {
  var self = this;
  var socialSave = this.saveData.social;
  if (typeof scoreSynced === 'boolean' && socialSave.rankReminderAccepted) {
    socialSave.rankReminderScoreSynced = scoreSynced;
  }
  if (!this.social || typeof this.social.getRankReminderStatus !== 'function') {
    this.persist();
    return Promise.resolve(null);
  }
  return this.social.getRankReminderStatus().then(function (state) {
    if (state && state.confirmed) {
      socialSave.rankReminderAccepted = !!state.accepted;
      socialSave.rankReminderStatus = state.status || 'unknown';
      if (!state.accepted) {
        socialSave.rankReminderScoreSynced = false;
      }
    }
    self.persist();
    return state;
  }).catch(function () {
    return null;
  });
};

GameModel.prototype.refreshFriendRank = function (showLoading) {
  if (!this.rankRefresh || this.modal !== 'friendRank') {
    return null;
  }
  var nextCanvas = this.social.requestFriendRank(
    this.rankRefresh.width,
    this.rankRefresh.height,
    {
      showLoading: showLoading !== false,
      pixelRatio: this.rankRefresh.pixelRatio
    }
  );
  if (nextCanvas) {
    this.rankCanvas = nextCanvas;
  }
  return this.rankCanvas;
};

GameModel.prototype.requestRankReminder = function () {
  var self = this;
  return this.withOnlinePrivacy(function () {
    return self.social.requestRankReminder().then(function (result) {
      var state = result === true
        ? { accepted: true, confirmed: true, status: 'accept' }
        : (result || { accepted: false, confirmed: false, status: 'error' });
      if (!state.accepted) {
        if (state.confirmed) {
          self.saveData.social.rankReminderAccepted = false;
          self.saveData.social.rankReminderScoreSynced = false;
          self.saveData.social.rankReminderStatus = state.status || 'unknown';
          self.persist();
        }
        var blocked = state.status === 'ban' || state.status === 'switch_off';
        if (blocked) {
          self.toast(copy.UI.toast.rankBlocked, 2.5);
        }
        return false;
      }
      self.saveData.social.rankReminderAccepted = true;
      self.saveData.social.rankReminderStatus = state.status || 'accept';
      self.persist();
      var rankSync = typeof self.social.syncRank === 'function' ? self.social.syncRank(self) : true;
      return Promise.resolve(rankSync).then(function (synced) {
        self.saveData.social.rankReminderScoreSynced = !!synced;
        self.persist();
        if (!synced) {
          self.toast(copy.UI.toast.rankOnPending, 2);
        }
        return !!synced;
      });
    });
  });
};

GameModel.prototype.setModal = function (name) {
  this.modal = name;
  this.selectedTool = null;
};

GameModel.prototype.closeModal = function () {
  if (this.modal === 'friendRank') {
    this.rankRefresh = null;
  }
  this.modal = null;
  this.pendingProp = null;
};

GameModel.prototype.toggleSetting = function (key) {
  if (!this.saveData.settings || this.saveData.settings[key] === undefined) {
    return;
  }
  this.saveData.settings[key] = !this.saveData.settings[key];
  this.persist();
  if (key === 'music' && this.sound && typeof this.sound.syncMusic === 'function') {
    this.sound.syncMusic();
  }
};

GameModel.prototype.setZoom = function (zoom) {
  this.zoom = Math.max(0.9, Math.min(3.2, zoom));
  if (this.zoom <= 1.02) {
    this.pan.x = 0;
    this.pan.y = 0;
  }
};

GameModel.prototype.addPan = function (dx, dy) {
  if (this.zoom <= 1.02) {
    return;
  }
  this.pan.x += dx;
  this.pan.y += dy;
  var limit = 80 + 250 * Math.max(0, this.zoom - 1);
  this.pan.x = Math.max(-limit, Math.min(limit, this.pan.x));
  this.pan.y = Math.max(-limit, Math.min(limit, this.pan.y));
};

GameModel.prototype.useProp = function (propId) {
  if (!this.level || this.hasMovingArrows() || !config.PROP_DEFS[propId]) {
    return;
  }
  if (propId === 'grid' && this.gridAccessGrantedThisRound) {
    this.assistLineActive = !this.assistLineActive;
    return;
  }
  if ((this.saveData.props[propId] || 0) <= 0) {
    this.pendingProp = { type: 'prop', propId: propId };
    if (this.saveData.propIntroClaimed[propId]) {
      return this.watchAdForPending();
    }
    this.modal = 'propSupply';
    return;
  }
  if (propId === 'eraser') {
    this.selectedTool = this.selectedTool === 'eraser' ? null : 'eraser';
    return;
  }
  if (propId === 'hint') {
    var removable = this.level ? levelGenerator.findRemovable(this.level.arrows, this.level.rows, this.level.cols) : [];
    if (!removable.length) {
      return;
    }
    this.consumeProp(propId);
    this.markHint(removable[0]);
    return;
  }
  if (propId === 'grid') {
    this.consumeProp(propId);
    this.gridAccessGrantedThisRound = true;
    this.assistLineActive = true;
    return;
  }
  this.consumeProp(propId);
  if (propId === 'wand') {
    this.castWand();
  }
};

GameModel.prototype.consumeProp = function (propId) {
  this.saveData.props[propId] = Math.max(0, (this.saveData.props[propId] || 0) - 1);
  this.persist();
};

GameModel.prototype.getPropSupplyMode = function (propId) {
  if (propId === 'grid' && this.gridAccessGrantedThisRound) {
    return 'round';
  }
  if ((this.saveData.props[propId] || 0) > 0) {
    return 'count';
  }
  return this.saveData.propIntroClaimed[propId] ? 'video' : 'intro';
};

GameModel.prototype.grantPendingProp = function (markIntroClaimed) {
  if (!this.pendingProp || this.pendingProp.type !== 'prop') {
    return false;
  }
  var propId = this.pendingProp.propId;
  if (!config.PROP_DEFS[propId]) {
    return false;
  }
  if (markIntroClaimed) {
    this.saveData.propIntroClaimed[propId] = true;
  }
  this.saveData.props[propId] = (this.saveData.props[propId] || 0) + 1;
  this.persist();
  this.closeModal();
  return true;
};

GameModel.prototype.claimPendingPropIntro = function () {
  if (!this.pendingProp || this.pendingProp.type !== 'prop') {
    return false;
  }
  var propId = this.pendingProp.propId;
  if (this.saveData.propIntroClaimed[propId]) {
    return false;
  }
  var opened = this.social.share(this, 'prop');
  if (!opened) {
    this.toast(copy.UI.toast.shareUnavailable, 1.4);
    return false;
  }
  if (this.social && typeof this.social.track === 'function') {
    this.social.track(this, 'propIntroShares', {
      propId: propId,
      level: this.level ? this.level.number : 1
    });
  }
  return this.grantPendingProp(true);
};

GameModel.prototype.watchAdForPending = function () {
  var self = this;
  if (!this.pendingProp || this.propAdLoading) {
    return Promise.resolve(false);
  }
  var requestedPropId = this.pendingProp.propId;
  if (!config.PROP_DEFS[requestedPropId]) {
    this.pendingProp = null;
    return Promise.resolve(false);
  }
  this.propAdLoading = true;
  return this.withOnlinePrivacy(function () {
    if (self.social && typeof self.social.track === 'function') {
      self.social.track(self, 'propAdStarts', {
        propId: requestedPropId,
        level: self.level ? self.level.number : 1
      });
    }
    return self.adService.showRewarded().then(function (res) {
      if (!res.rewarded) {
        self.toast(copy.UI.toast.videoIncompleteProp, 1.4);
        return;
      }
      if (self.social && typeof self.social.track === 'function') {
        self.social.track(self, 'propAdCompletes', {
          propId: requestedPropId,
          level: self.level ? self.level.number : 1
        });
      }
      self.saveData.props[requestedPropId] = (self.saveData.props[requestedPropId] || 0) + config.PROP_DEFS[requestedPropId].adReward;
      self.persist();
    });
  }).catch(function () {
    self.toast(copy.UI.toast.videoUnavailable, 1.6);
    return false;
  }).then(function (result) {
    self.propAdLoading = false;
    self.pendingProp = null;
    if (self.modal === 'propSupply') {
      self.modal = null;
    }
    return result;
  });
};

GameModel.prototype.reviveByAd = function () {
  var self = this;
  return this.withOnlinePrivacy(function () {
    if (self.social && typeof self.social.track === 'function') {
      self.social.track(self, 'reviveAdStarts', {
        level: self.level ? self.level.number : 1,
        remaining: self.activeCount()
      });
    }
    return self.adService.showRewarded().then(function (res) {
      if (!res.rewarded) {
        self.toast(copy.UI.toast.videoIncompleteRevive, 1.4);
        return;
      }
      if (self.social && typeof self.social.track === 'function') {
        self.social.track(self, 'reviveAdCompletes', {
          level: self.level ? self.level.number : 1,
          remaining: self.activeCount()
        });
      }
      self.modal = null;
      self.lives = 1;
      self.timeLeft = Math.max(self.timeLeft, config.GAME.reviveSeconds);
      self.loseReason = '';
    });
  });
};

GameModel.prototype.tapArrow = function (arrowId) {
  if (!this.level || this.modal) {
    return;
  }
  var arrow = this.getArrow(arrowId);
  if (!arrow || !arrow.active || arrow.removing) {
    return;
  }

  if (this.selectedTool === 'eraser') {
    this.consumeProp('eraser');
    this.selectedTool = null;
    this.removeArrow(arrow, 'dissolve');
    this.addPraiseEffect(arrow, 1, this.combo + 1);
    this.sound.play('clear', 0);
    return;
  }

  var result = levelGenerator.canExit(arrow, this.level.arrows, this.level.rows, this.level.cols);
  if (result.clear) {
    this.removeArrow(arrow, 'escape');
    this.combo += 1;
    this.bestComboThisRound = Math.max(this.bestComboThisRound, this.combo);
    this.score += 10 + Math.min(20, this.combo * 2);
    var clearAt = platform.now();
    var clearGap = this.lastClearAt ? clearAt - this.lastClearAt : Infinity;
    this.clearStreak = clearGap <= 1350 ? this.clearStreak + 1 : 1;
    this.lastClearAt = clearAt;
    this.sound.play('clear', {
      streak: this.clearStreak,
      gap: clearGap,
      combo: this.combo,
      level: this.level.number,
      melodyStep: this.melodyStep
    });
    this.melodyStep += 1;
    this.addPraiseEffect(arrow, this.clearStreak, this.combo);
    return;
  }

  this.combo = 0;
  this.clearStreak = 0;
  this.lastClearAt = 0;
  this.lives -= 1;
  this.wrongThisRound += 1;
  this.timeLeft = Math.max(0, this.timeLeft - config.GAME.wrongTapPenaltySeconds);
  this.saveData.stats.totalWrong += 1;
  this.persist();
  arrow.blockedFlash = 0.56;
  arrow.blockedBump = 0.46;
  var blocker = this.getArrow(result.blockerId);
  if (blocker) {
    blocker.blockedFlash = 0.72;
  }
  this.sound.play('wrong');
  if (this.lives <= 0) {
    this.fail('heart');
  }
};

GameModel.prototype.addPraiseEffect = function (arrow, streak, combo) {
  if (!arrow || !arrow.cells || !arrow.cells.length) {
    return;
  }
  var head = arrow.cells[arrow.cells.length - 1];
  var praise = copy.getClearPraise(streak, combo);
  this.praiseEffects.push({
    cell: { r: head.r, c: head.c },
    text: praise.text,
    tier: praise.tier,
    age: 0,
    duration: praise.tier >= 3 ? 1.05 : 0.86,
    seed: (arrow.order || 0) + Math.max(1, combo || 1)
  });
  if (this.praiseEffects.length > 5) {
    this.praiseEffects.shift();
  }
};

GameModel.prototype.getArrow = function (arrowId) {
  if (!this.level) {
    return null;
  }
  for (var i = 0; i < this.level.arrows.length; i += 1) {
    if (this.level.arrows[i].id === arrowId) {
      return this.level.arrows[i];
    }
  }
  return null;
};

GameModel.prototype.hasMovingArrows = function () {
  return !!(this.level && this.level.arrows.some(function (arrow) {
    return arrow.active && arrow.removing;
  }));
};

GameModel.prototype.removeArrow = function (arrow, mode) {
  var removalMode = mode || 'escape';
  arrow.removing = true;
  arrow.removalMode = removalMode;
  arrow.removeProgress = 0;
  if (removalMode === 'escape') {
    var travel = levelGenerator.getEscapeTravel(arrow, this.level.rows, this.level.cols);
    arrow.removeDuration = Math.max(0.42, Math.min(0.94, travel / 30));
  } else {
    arrow.removeDuration = 0.38;
  }
  arrow.hintPulse = 0;
};

GameModel.prototype.castWand = function () {
  if (!this.level) {
    return;
  }
  var candidates = activeArrows(this.level).filter(function (arrow) {
    return !arrow.removing;
  });
  for (var i = candidates.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = temp;
  }
  var self = this;
  candidates.slice(0, 3).forEach(function (arrow) {
    self.removeArrow(arrow, 'dissolve');
  });
  this.score += 24;
  this.sound.play('clear', 0);
};

GameModel.prototype.markHint = function (arrow) {
  if (!arrow) {
    return;
  }
  arrow.hintPulse = 2.4;
};

GameModel.prototype.fail = function (reason) {
  if (this.modal === 'lose') {
    return;
  }
  this.loseReason = reason;
  if (this.runMode === 'challenge') {
    this.lastResult = this.social.getResult(this, 'stuck');
  }
  this.modal = 'lose';
  this.selectedTool = null;
};

GameModel.prototype.finishFailedChallenge = function () {
  if (this.runMode !== 'challenge' || this.challengeResultSubmitted) {
    return;
  }
  var result = this.lastResult || this.social.getResult(this, 'stuck');
  this.challengeResultSubmitted = true;
  this.social.track(this, 'challengeFinishes', { level: result.level, beat: 0, copyId: this.activeChallenge && this.activeChallenge.copyId || '' });
  this.social.submitChallengeResult(this, result);
};

GameModel.prototype.win = function () {
  if (this.modal === 'win') {
    return;
  }
  var number = this.level.number;
  var result = this.social.getResult(this, 'win');
  var currentDailyKey = this.activeChallenge && this.activeChallenge.dayKey
    ? this.activeChallenge.dayKey
    : SocialService.dayKey();
  var reward = 0;
  if (this.runMode === 'normal') {
    reward = config.GAME.clearRewardBase + Math.min(30, Math.floor(number * 1.5)) + Math.floor(this.timeLeft / 30);
  } else if (this.runMode === 'warmup') {
    reward = 8;
  } else if ((this.runMode === 'daily' || this.runMode === 'official') && this.saveData.social.dailyKey !== currentDailyKey) {
    reward = 20;
  }
  this.lastReward = reward;
  this.saveData.coins += reward;
  if (this.runMode === 'normal') {
    var nextLevel = Math.min(config.GAME.maxGeneratedLevel, number + 1);
    this.saveData.highestLevel = Math.max(this.saveData.highestLevel, nextLevel);
    this.saveData.currentLevel = nextLevel;
  } else if (this.runMode === 'warmup') {
    this.saveData.highestLevel = Math.max(this.saveData.highestLevel, 2);
    this.saveData.currentLevel = Math.max(this.saveData.currentLevel, 2);
  }
  if (this.runMode === 'daily' || this.runMode === 'official') {
    this.saveData.social.dailyKey = currentDailyKey;
    this.saveData.social.dailyCompleted = true;
    if (!this.saveData.social.dailyBestMs || result.elapsedMs < this.saveData.social.dailyBestMs) {
      this.saveData.social.dailyBestMs = result.elapsedMs;
    }
  }
  this.saveData.stats.totalCleared += 1;
  this.saveData.stats.bestCombo = Math.max(this.saveData.stats.bestCombo, this.bestComboThisRound);
  result.beatTarget = !!(this.activeChallenge && this.activeChallenge.targetMs && result.elapsedMs < this.activeChallenge.targetMs);
  result.targetMs = this.activeChallenge ? this.activeChallenge.targetMs || 0 : 0;
  result.dayKey = (this.runMode === 'daily' || this.runMode === 'official') ? currentDailyKey : '';
  this.lastResult = result;
  this.persist();
  if (this.runMode === 'challenge') {
    this.challengeResultSubmitted = true;
    this.social.track(this, 'challengeFinishes', { level: number, beat: result.beatTarget ? 1 : 0, copyId: this.activeChallenge && this.activeChallenge.copyId || '' });
    this.social.submitChallengeResult(this, result);
  }
  if (this.runMode === 'official') {
    this.social.finishOfficialArena(result);
  }
  this.social.syncRank(this, result);
  this.sound.play('win');
  this.winStartedAt = platform.now();
  this.modal = this.runMode === 'warmup' ? 'challengeReady' : 'win';
  this.selectedTool = null;
};

GameModel.prototype.shareWin = function () {
  var opened = this.social.share(this, 'win');
  if (!opened) {
    this.toast(copy.UI.toast.shareUnavailable, 1.3);
  }
};

GameModel.prototype.shareStuck = function () {
  var opened = this.social.share(this, 'stuck');
  if (!opened) {
    this.toast(copy.UI.toast.shareUnavailable, 1.3);
  }
};

GameModel.prototype.shareRank = function () {
  var opened = this.social.shareRank(this);
  if (!opened) {
    this.toast(copy.UI.toast.shareUnavailable, 1.5);
  }
};

GameModel.prototype.openGameClub = function () {
  if (!platform.hasGameClubButton()) {
    this.toast(copy.UI.toast.gameClubUnavailable, 1.6);
  }
};

GameModel.prototype.startOfficialArena = function () {
  var self = this;
  this.social.startOfficialArena(this).then(function (opened) {
    if (!opened) {
      self.shareWin();
    }
  });
};

GameModel.prototype.tick = function (dt) {
  if (this.messageTime > 0) {
    this.messageTime = Math.max(0, this.messageTime - dt);
  }
  if (!this.level || this.screen !== 'play') {
    return;
  }

  if (this.modal) {
    return;
  }

  this.level.arrows.forEach(function (arrow) {
    if (arrow.blockedFlash > 0) {
      arrow.blockedFlash = Math.max(0, arrow.blockedFlash - dt);
    }
    if (arrow.blockedBump > 0) {
      arrow.blockedBump = Math.max(0, arrow.blockedBump - dt);
    }
    if (arrow.hintPulse > 0) {
      arrow.hintPulse = Math.max(0, arrow.hintPulse - dt);
    }
    if (arrow.removing) {
      arrow.removeProgress += dt / Math.max(0.12, arrow.removeDuration || 0.5);
      if (arrow.removeProgress >= 1) {
        arrow.removeProgress = 1;
        arrow.active = false;
        arrow.removing = false;
      }
    }
  });

  this.praiseEffects = this.praiseEffects.filter(function (effect) {
    effect.age += dt;
    return effect.age < effect.duration;
  });

  if (this.level.tutorial) {
    var tutorialTargets = activeArrows(this.level).filter(function (arrow) {
      return !arrow.removing;
    }).sort(function (a, b) {
      return (a.tutorialOrder || 0) - (b.tutorialOrder || 0);
    });
    if (tutorialTargets.length) {
      tutorialTargets[0].hintPulse = Math.max(tutorialTargets[0].hintPulse, 0.8);
    }
  }

  this.timeLeft = Math.max(0, this.timeLeft - dt);
  if (this.timeLeft <= 0) {
    this.fail('time');
    return;
  }

  var stillActive = activeArrows(this.level).length;
  if (stillActive === 0) {
    if (this.winDelay < 0) {
      this.winDelay = 0.25;
    } else {
      this.winDelay -= dt;
      if (this.winDelay <= 0) {
        this.winDelay = -1;
        this.win();
      }
    }
  }
};

GameModel.prototype.levelProgress = function () {
  if (!this.level) {
    return 0;
  }
  return 1 - activeArrows(this.level).length / Math.max(1, this.level.targetArrows);
};

GameModel.prototype.activeCount = function () {
  return activeArrows(this.level).length;
};

GameModel.prototype.formatTime = function () {
  var seconds = Math.ceil(this.timeLeft);
  var minutes = Math.floor(seconds / 60);
  var rest = seconds % 60;
  return minutes + 'm' + (rest < 10 ? '0' : '') + rest + 's';
};

module.exports = GameModel;
