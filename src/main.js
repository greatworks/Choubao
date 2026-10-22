'use strict';

var platform = require('./platform');
var copy = require('./copy');
var storage = require('./storage');
var Renderer = require('./renderer');
var GameModel = require('./game-model');
var InputManager = require('./input');
var AdService = require('./ad-service');
var SoundManager = require('./sound');
var SocialService = require('./social-service');

function createPrivacyRequester(isAuthorized, requestAuthorization, enableFeatures) {
  var activeRequest = null;
  return function requestOnlineFeatures() {
    if (isAuthorized()) {
      return Promise.resolve(enableFeatures());
    }
    if (activeRequest) {
      return activeRequest;
    }
    var authorization;
    try {
      authorization = requestAuthorization();
    } catch (err) {
      return Promise.resolve(false);
    }
    var currentRequest = Promise.resolve(authorization).then(function (authorized) {
      if (activeRequest === currentRequest) {
        activeRequest = null;
      }
      return authorized ? enableFeatures() : false;
    }, function () {
      if (activeRequest === currentRequest) {
        activeRequest = null;
      }
      return false;
    });
    activeRequest = currentRequest;
    return currentRequest;
  };
}

function start() {
  var canvas = platform.createCanvas();
  if (!canvas) {
    return;
  }

  var systemInfo = platform.getSystemInfo();
  var menuRect = platform.getMenuButtonRect();
  var saveData = storage.load();
  var adService = new AdService();
  var sound = new SoundManager(saveData);
  sound.startBgm(false);
  var social = new SocialService(platform);
  var model = new GameModel(saveData, adService, sound, social);
  var renderer = new Renderer(canvas, systemInfo, menuRect);
  new InputManager(canvas, platform, renderer, model);

  var onlineFeaturesReady = false;
  function enableOnlineFeatures() {
    social.setPrivacyAuthorized(true);
    if (!onlineFeaturesReady) {
      onlineFeaturesReady = true;
      adService.init();
    }
    social.refreshInbox(model);
    social.syncRank(model).catch(function () {});
    if (model.pendingChallenge) {
      var pendingId = model.pendingChallenge.id;
      social.hydrateChallenge(model.pendingChallenge).then(function (challenge) {
        if (model.pendingChallenge && model.pendingChallenge.id === pendingId) {
          model.pendingChallenge = challenge;
        }
      });
    }
    return true;
  }
  var requestOnlineFeatures = createPrivacyRequester(
    function () { return social.isPrivacyAuthorized(); },
    function () { return platform.requestPrivacyAuthorization(); },
    enableOnlineFeatures
  );
  model.setPrivacyRequester(requestOnlineFeatures);
  if (typeof window !== 'undefined') {
    window.__choubaoGame = { model: model, renderer: renderer };
  }
  function getMenuSharePayload() {
    if (model.level && model.modal === 'win') {
      var winPayload = social.buildShare(model, 'win');
      social.track(model, model.runMode === 'challenge' ? 'counterShares' : 'shareCreates', { mode: 'menu_win', level: winPayload.result.level, copyId: winPayload.copyId });
      return winPayload;
    }
    if (model.level && model.modal === 'lose') {
      var stuckPayload = social.buildShare(model, 'stuck');
      social.track(model, model.runMode === 'challenge' ? 'counterShares' : 'shareCreates', { mode: 'menu_stuck', level: stuckPayload.result.level, copyId: stuckPayload.copyId });
      return stuckPayload;
    }
    if (model.modal === 'friendRank') {
      var rankPayload = social.buildRankShare(model);
      social.track(model, 'shareCreates', { mode: 'menu_rank', level: rankPayload.level, copyId: rankPayload.copyId });
      return rankPayload;
    }
    var menuCopy = copy.getDefaultShareCopy();
    return {
      title: menuCopy.title,
      imageUrl: 'assets/icon/choubao-mascot-288.png',
      query: 'from=menu&cv=' + menuCopy.id
    };
  }
  platform.showShareMenu(getMenuSharePayload, getMenuSharePayload);
  var handledRankShareLaunches = {};
  function applyLaunchOptions(options) {
    var launchOptions = options || {};
    var rankLaunch = social.parseRankShareLaunch(launchOptions);
    if (rankLaunch && !handledRankShareLaunches[rankLaunch.id]) {
      handledRankShareLaunches[rankLaunch.id] = true;
      model.openHome();
      var rankSize = renderer.getFriendRankSize();
      model.openFriendRank(rankSize.width, rankSize.height, rankSize.pixelRatio);
    } else if (!rankLaunch) {
      model.handleLaunchOptions(launchOptions);
    }
    if (social.isPrivacyAuthorized()) {
      social.refreshInbox(model);
      if (!rankLaunch) {
        social.syncRank(model).catch(function () {});
      }
    }
  }
  applyLaunchOptions(platform.getLaunchOptions());
  platform.onShow(applyLaunchOptions);

  var last = platform.now();
  function frame() {
    var current = platform.now();
    var dt = Math.min(0.05, Math.max(0.001, (current - last) / 1000));
    last = current;
    model.tick(dt);
    sound.updateBgm(model, dt);
    renderer.draw(model, dt);
    platform.syncGameClubButton(
      renderer.getHitZone('gameClub'),
      model.screen === 'home' && !model.modal
    );
    platform.requestFrame(frame);
  }
  frame();
}

module.exports = {
  start: start,
  createPrivacyRequester: createPrivacyRequester
};
