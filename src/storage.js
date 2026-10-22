'use strict';

var config = require('./config');
var platform = require('./platform');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function defaultSave() {
  return {
    version: 5,
    highestLevel: 1,
    currentLevel: 1,
    coins: config.GAME.startCoins,
    props: {
      eraser: 1,
      wand: 1,
      hint: 1,
      grid: 1
    },
    propIntroClaimed: {
      eraser: false,
      wand: false,
      hint: false,
      grid: false
    },
    settings: {
      music: true,
      sfx: true,
      vibrate: true,
      colorMode: true
    },
    stats: {
      totalCleared: 0,
      totalWrong: 0,
      bestCombo: 0,
      lastLoginAt: 0
    },
    social: {
      dailyKey: '',
      dailyBestMs: 0,
      dailyCompleted: false,
      shareCreates: 0,
      counterShares: 0,
      challengeOpens: 0,
      challengeStarts: 0,
      challengeFinishes: 0,
      propIntroShares: 0,
      propAdStarts: 0,
      propAdCompletes: 0,
      reviveAdStarts: 0,
      reviveAdCompletes: 0,
      lastChallengeId: '',
      rankReminderAccepted: false,
      rankReminderStatus: 'unknown',
      rankReminderScoreSynced: false,
      difficultySpikeSeen: false
    }
  };
}

function normalizeSave(raw) {
  var base = defaultSave();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  var previousVersion = Math.max(0, parseInt(raw.version, 10) || 0);
  var hadDifficultySpikeFlag = !!(raw.social && typeof raw.social.difficultySpikeSeen === 'boolean');
  Object.keys(base).forEach(function (key) {
    if (raw[key] === undefined) {
      raw[key] = clone(base[key]);
    }
  });
  if (previousVersion < base.version) {
    raw.props = clone(base.props);
    raw.propIntroClaimed = clone(base.propIntroClaimed);
  } else {
    raw.props = Object.assign({}, base.props, raw.props || {});
    raw.propIntroClaimed = Object.assign({}, base.propIntroClaimed, raw.propIntroClaimed || {});
  }
  raw.settings = Object.assign({}, base.settings, raw.settings || {});
  raw.stats = Object.assign({}, base.stats, raw.stats || {});
  raw.social = Object.assign({}, base.social, raw.social || {});
  raw.version = base.version;
  raw.highestLevel = Math.min(config.GAME.maxGeneratedLevel, Math.max(1, parseInt(raw.highestLevel, 10) || 1));
  raw.currentLevel = Math.min(config.GAME.maxGeneratedLevel, Math.max(1, parseInt(raw.currentLevel, 10) || 1));
  raw.coins = Math.max(0, raw.coins || 0);
  delete raw.energy;
  delete raw.settings.assistLine;
  delete raw.social.propIntroDirects;
  Object.keys(base.props).forEach(function (propId) {
    raw.props[propId] = Math.max(0, Math.floor(Number(raw.props[propId]) || 0));
    raw.propIntroClaimed[propId] = !!raw.propIntroClaimed[propId];
  });
  if (!hadDifficultySpikeFlag && (raw.highestLevel > 1 || raw.stats.totalCleared > 0)) {
    raw.social.difficultySpikeSeen = true;
  }
  return raw;
}

function load() {
  var raw = platform.getStorage(config.GAME.saveKey);
  var legacyKeys = config.GAME.legacySaveKeys || [];
  for (var i = 0; !raw && i < legacyKeys.length; i += 1) {
    raw = platform.getStorage(legacyKeys[i]);
  }
  var normalized = normalizeSave(raw);
  if (raw) {
    platform.setStorage(config.GAME.saveKey, normalized);
  }
  return normalized;
}

function save(data) {
  platform.setStorage(config.GAME.saveKey, data);
}

module.exports = {
  defaultSave: defaultSave,
  load: load,
  save: save
};
