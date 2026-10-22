'use strict';

var copy = require('./copy');

var hasWx = typeof wx !== 'undefined';
var cloudReady = false;
var socialCloudFunction = 'social';
var gameClubButton = null;
var gameClubButtonSignature = '';
var gameClubButtonVisible = false;

function noop() {}

function getSystemInfo() {
  if (hasWx && wx.getWindowInfo) {
    return wx.getWindowInfo();
  }
  if (typeof window !== 'undefined') {
    return {
      windowWidth: window.innerWidth || 375,
      windowHeight: window.innerHeight || 667,
      pixelRatio: window.devicePixelRatio || 1,
      statusBarHeight: 0,
      platform: 'web'
    };
  }
  return {
    windowWidth: 375,
    windowHeight: 667,
    pixelRatio: 1,
    statusBarHeight: 0,
    platform: 'node'
  };
}

function createCanvas() {
  if (hasWx && wx.createCanvas) {
    return wx.createCanvas();
  }
  if (typeof document !== 'undefined') {
    var canvas = document.createElement('canvas');
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#74adf4';
    document.body.appendChild(canvas);
    return canvas;
  }
  return null;
}

function createOffscreenCanvas(width, height) {
  var canvas = null;
  try {
    if (hasWx && wx.createCanvas) {
      canvas = wx.createCanvas();
    } else if (hasWx && wx.createOffscreenCanvas) {
      canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: width,
        height: height
      });
    } else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
    }
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  } catch (err) {
    canvas = null;
  }
  return canvas;
}

function createInnerAudioContext() {
  if (hasWx && wx.createInnerAudioContext) {
    return wx.createInnerAudioContext();
  }
  if (typeof Audio !== 'undefined') {
    return new Audio();
  }
  return null;
}

function createAudioContext() {
  try {
    if (hasWx && wx.createWebAudioContext) {
      return wx.createWebAudioContext();
    }
    if (typeof window !== 'undefined') {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      return AudioContextClass ? new AudioContextClass() : null;
    }
  } catch (err) {}
  return null;
}

function requestFrame(callback) {
  if (typeof requestAnimationFrame !== 'undefined') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(function () {
    callback(Date.now());
  }, 16);
}

function cancelFrame(id) {
  if (typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id);
}

function onTouch(canvas, type, handler) {
  if (hasWx) {
    var wxName = {
      start: 'onTouchStart',
      move: 'onTouchMove',
      end: 'onTouchEnd',
      cancel: 'onTouchCancel'
    }[type];
    if (wxName && wx[wxName]) {
      wx[wxName](handler);
    }
    return noop;
  }

  if (!canvas || !canvas.addEventListener) {
    return noop;
  }

  var eventName = {
    start: 'pointerdown',
    move: 'pointermove',
    end: 'pointerup',
    cancel: 'pointercancel'
  }[type];

  var wrapped = function (event) {
    handler({
      touches: eventName === 'pointerup' ? [] : [{ clientX: event.clientX, clientY: event.clientY }],
      changedTouches: [{ clientX: event.clientX, clientY: event.clientY }]
    });
  };
  canvas.addEventListener(eventName, wrapped);
  return function () {
    canvas.removeEventListener(eventName, wrapped);
  };
}

function getStorage(key) {
  try {
    if (hasWx && wx.getStorageSync) {
      return wx.getStorageSync(key);
    }
    if (typeof localStorage !== 'undefined') {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (err) {}
  return null;
}

function setStorage(key, value) {
  try {
    if (hasWx && wx.setStorageSync) {
      wx.setStorageSync(key, value);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {}
}

function vibrateShort(type) {
  if (hasWx && wx.vibrateShort) {
    wx.vibrateShort({ type: type || 'light' });
  }
}

function showToast(title) {
  if (hasWx && wx.showToast) {
    wx.showToast({ title: title, icon: 'none', duration: 1200 });
  }
}

function showShareMenu(provider, timelineProvider) {
  if (hasWx && wx.showShareMenu) {
    wx.showShareMenu({
      menus: ['shareAppMessage', 'shareTimeline']
    });
  }
  if (hasWx && wx.onShareAppMessage) {
    wx.onShareAppMessage(function () {
      if (provider) {
        try {
          return provider();
        } catch (err) {}
      }
      var fallbackCopy = copy.getDefaultShareCopy();
      return {
        title: fallbackCopy.title,
        imageUrl: 'assets/icon/choubao-mascot-288.png'
      };
    });
  }
  if (hasWx && wx.onShareTimeline) {
    wx.onShareTimeline(function () {
      var activeProvider = timelineProvider || provider;
      if (activeProvider) {
        try {
          return activeProvider();
        } catch (err) {}
      }
      var fallbackCopy = copy.getDefaultShareCopy();
      return {
        title: fallbackCopy.title,
        imageUrl: 'assets/icon/choubao-mascot-288.png'
      };
    });
  }
}

function hasGameClubButton() {
  return !!(hasWx && wx.createGameClubButton);
}

function destroyGameClubButton() {
  if (gameClubButton && gameClubButton.destroy) {
    try {
      gameClubButton.destroy();
    } catch (err) {}
  }
  gameClubButton = null;
  gameClubButtonSignature = '';
  gameClubButtonVisible = false;
}

function syncGameClubButton(rect, visible) {
  if (!hasGameClubButton()) {
    return false;
  }
  if (!visible || !rect) {
    if (gameClubButton && gameClubButtonVisible && gameClubButton.hide) {
      try {
        gameClubButton.hide();
      } catch (err) {}
    }
    gameClubButtonVisible = false;
    return true;
  }
  var style = {
    left: Math.round(rect.x),
    top: Math.round(rect.y),
    width: Math.round(rect.w),
    height: Math.round(rect.h),
    backgroundColor: '#ffe45c',
    borderColor: '#ffffff',
    borderWidth: 2,
    borderRadius: 8,
    color: '#6b4b12',
    textAlign: 'center',
    fontSize: rect.w < 85 ? 13 : 15,
    lineHeight: Math.round(rect.h)
  };
  var signature = [style.left, style.top, style.width, style.height, style.fontSize].join(':');
  if (!gameClubButton || gameClubButtonSignature !== signature) {
    destroyGameClubButton();
    try {
      gameClubButton = wx.createGameClubButton({
        type: 'text',
        text: copy.UI.home.club,
        icon: 'green',
        style: style
      });
      gameClubButtonSignature = signature;
      gameClubButtonVisible = true;
    } catch (err) {
      gameClubButton = null;
      gameClubButtonSignature = '';
      return false;
    }
  }
  if (!gameClubButtonVisible && gameClubButton.show) {
    try {
      gameClubButton.show();
    } catch (err) {}
    gameClubButtonVisible = true;
  }
  return true;
}

function shareGame(options) {
  var payload = options || {};
  var fallbackCopy = copy.getDefaultShareCopy();
  if (hasWx && wx.shareAppMessage) {
    var wxPayload = {
      title: payload.title || fallbackCopy.title,
      imageUrl: payload.imageUrl || 'assets/icon/choubao-mascot-288.png',
      query: payload.query || ''
    };
    if (payload.imageUrlId) {
      wxPayload.imageUrlId = payload.imageUrlId;
    }
    if (payload.toCurrentGroup) {
      wxPayload.toCurrentGroup = true;
    }
    wx.shareAppMessage(wxPayload);
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator.share({
      title: payload.title || fallbackCopy.title,
      text: payload.text || payload.title || fallbackCopy.text
    }).catch(function () {});
    return true;
  }
  return false;
}

function getLaunchOptions() {
  if (hasWx && wx.getLaunchOptionsSync) {
    try {
      return wx.getLaunchOptionsSync() || {};
    } catch (err) {}
  }
  if (typeof window !== 'undefined' && window.location) {
    var query = {};
    String(window.location.search || '').replace(/^\?/, '').split('&').forEach(function (part) {
      var bits = part.split('=');
      if (!bits[0]) {
        return;
      }
      try {
        query[decodeURIComponent(bits[0])] = decodeURIComponent(bits.slice(1).join('=') || '');
      } catch (err) {
        query[bits[0]] = bits.slice(1).join('=') || '';
      }
    });
    return { query: query };
  }
  return {};
}

function onShow(callback) {
  if (hasWx && wx.onShow) {
    wx.onShow(callback);
  }
}

function requestPrivacyAuthorization() {
  return new Promise(function (resolve) {
    if (!hasWx) {
      resolve(true);
      return;
    }
    if (!wx.requirePrivacyAuthorize) {
      resolve(false);
      return;
    }
    var settled = false;
    function finish(authorized) {
      if (!settled) {
        settled = true;
        resolve(authorized);
      }
    }
    try {
      wx.requirePrivacyAuthorize({
        success: function () { finish(true); },
        fail: function () { finish(false); }
      });
    } catch (err) {
      finish(false);
    }
  });
}

function openPrivacyContract() {
  return new Promise(function (resolve) {
    if (!hasWx || !wx.openPrivacyContract) {
      if (hasWx && typeof console !== 'undefined' && console.warn) {
        console.warn('wx.openPrivacyContract is unavailable in this client');
      }
      resolve(false);
      return;
    }
    try {
      wx.openPrivacyContract({
        success: function () { resolve(true); },
        fail: function (error) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('wx.openPrivacyContract failed', error && error.errMsg || error);
          }
          resolve(false);
        }
      });
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('wx.openPrivacyContract threw', err && err.message || err);
      }
      resolve(false);
    }
  });
}

function initCloud(envId, functionName) {
  socialCloudFunction = functionName || socialCloudFunction;
  if (!hasWx || !wx.cloud || !wx.cloud.init || !envId) {
    cloudReady = false;
    return false;
  }
  try {
    wx.cloud.init({ env: envId });
    cloudReady = true;
    return true;
  } catch (err) {
    cloudReady = false;
    return false;
  }
}

function callSocialCloud(action, data) {
  return new Promise(function (resolve, reject) {
    if (!cloudReady || !hasWx || !wx.cloud || !wx.cloud.callFunction) {
      resolve(null);
      return;
    }
    wx.cloud.callFunction({
      name: socialCloudFunction,
      data: { action: action, data: data || {} },
      success: resolve,
      fail: reject
    });
  });
}

function exportCanvasImage(canvas, width, height) {
  try {
    if (canvas && typeof canvas.toTempFilePathSync === 'function') {
      return canvas.toTempFilePathSync({
        x: 0,
        y: 0,
        width: width,
        height: height,
        destWidth: width,
        destHeight: height,
        fileType: 'png',
        quality: 1
      });
    }
    if (canvas && typeof canvas.toDataURL === 'function') {
      var dataUrl = canvas.toDataURL('image/png');
      if (hasWx && wx.getFileSystemManager && wx.env && wx.env.USER_DATA_PATH) {
        var filePath = wx.env.USER_DATA_PATH + '/choubao-share.png';
        wx.getFileSystemManager().writeFileSync(filePath, dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
        return filePath;
      }
      return dataUrl;
    }
  } catch (err) {}
  return '';
}

function reportEvent(name, detail) {
  if (!hasWx) {
    return;
  }
  try {
    if (wx.reportEvent) {
      wx.reportEvent(name, detail || {});
    } else if (wx.reportAnalytics) {
      wx.reportAnalytics(name, detail || {});
    }
  } catch (err) {}
}

function setUserCloudStorage(kvList) {
  if (!hasWx || !wx.setUserCloudStorage || !kvList || !kvList.length) {
    return Promise.resolve(false);
  }

  function write(remainingAttempts) {
    return new Promise(function (resolve) {
      try {
        wx.setUserCloudStorage({
          KVDataList: kvList,
          success: function () { resolve(true); },
          fail: function (error) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[rank] setUserCloudStorage failed', error && error.errMsg ? error.errMsg : error);
            }
            resolve(false);
          }
        });
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[rank] setUserCloudStorage exception', err && err.message ? err.message : err);
        }
        resolve(false);
      }
    }).then(function (written) {
      if (written || remainingAttempts <= 1) {
        return written;
      }
      return write(remainingAttempts - 1);
    });
  }

  return write(2);
}

var friendRankRequestId = 0;

function requestFriendRankCanvas(width, height, keyList, options) {
  if (!hasWx || !wx.getOpenDataContext) {
    return null;
  }
  try {
    var openDataContext = wx.getOpenDataContext();
    var sharedCanvas = openDataContext.canvas;
    var logicalWidth = Math.max(1, Math.round(width || 300));
    var logicalHeight = Math.max(1, Math.round(height || 360));
    var systemRatio = getSystemInfo().pixelRatio || 1;
    var pixelRatio = Math.max(1, Math.min(3, Number(options && options.pixelRatio) || systemRatio));
    var canvasWidth = Math.max(1, Math.round(logicalWidth * pixelRatio));
    var canvasHeight = Math.max(1, Math.round(logicalHeight * pixelRatio));
    if (sharedCanvas.width !== canvasWidth) {
      sharedCanvas.width = canvasWidth;
    }
    if (sharedCanvas.height !== canvasHeight) {
      sharedCanvas.height = canvasHeight;
    }
    friendRankRequestId += 1;
    openDataContext.postMessage({
      type: 'friendRank',
      keyList: keyList || [],
      width: logicalWidth,
      height: logicalHeight,
      pixelRatio: pixelRatio,
      selfScore: Math.max(1, Math.round(Number(options && options.selfScore) || 1)),
      requestId: friendRankRequestId,
      showLoading: !options || options.showLoading !== false
    });
    return sharedCanvas;
  } catch (err) {
    return null;
  }
}

function requestRankReminder() {
  return new Promise(function (resolve) {
    if (!hasWx || !wx.requestSubscribeSystemMessage) {
      resolve({ supported: false, confirmed: true, accepted: false, status: 'unsupported' });
      return;
    }
    wx.requestSubscribeSystemMessage({
      msgTypeList: ['SYS_MSG_TYPE_RANK'],
      success: function (result) {
        var status = result && result.SYS_MSG_TYPE_RANK ? result.SYS_MSG_TYPE_RANK : 'unknown';
        resolve({
          supported: true,
          confirmed: status !== 'unknown',
          accepted: status === 'accept',
          status: status,
          errMsg: result && result.errMsg ? result.errMsg : ''
        });
      },
      fail: function (error) {
        resolve({
          supported: true,
          confirmed: false,
          accepted: false,
          status: 'error',
          errMsg: error && error.errMsg ? error.errMsg : ''
        });
      }
    });
  });
}

function getRankReminderStatus() {
  return new Promise(function (resolve) {
    if (!hasWx || !wx.getSetting) {
      resolve({ supported: false, confirmed: false, accepted: false, status: 'unsupported' });
      return;
    }
    wx.getSetting({
      withSubscriptions: true,
      success: function (result) {
        var settings = result && result.subscriptionsSetting;
        if (!settings) {
          resolve({ supported: true, confirmed: false, accepted: false, status: 'unknown' });
          return;
        }
        if (settings.mainSwitch === false) {
          resolve({ supported: true, confirmed: true, accepted: false, status: 'switch_off', mainSwitch: false });
          return;
        }
        var itemSettings = settings.itemSettings || {};
        var status = itemSettings.SYS_MSG_TYPE_RANK || 'unknown';
        resolve({
          supported: true,
          confirmed: status !== 'unknown',
          accepted: status === 'accept',
          status: status,
          mainSwitch: settings.mainSwitch !== false
        });
      },
      fail: function (error) {
        resolve({
          supported: true,
          confirmed: false,
          accepted: false,
          status: 'error',
          errMsg: error && error.errMsg ? error.errMsg : ''
        });
      }
    });
  });
}

function getRankManager() {
  if (!hasWx || !wx.getRankManager) {
    return null;
  }
  try {
    return wx.getRankManager();
  } catch (err) {
    return null;
  }
}

function hasOfficialChallenge() {
  var manager = getRankManager();
  return !!(manager && manager.update && manager.createChallenge);
}

function updateOfficialScore(manager, scoreKey, score) {
  return new Promise(function (resolve) {
    if (!manager || !manager.update) {
      resolve(false);
      return;
    }
    manager.update({
      scoreKey: scoreKey,
      score: Math.max(0, Math.round(score || 0)),
      success: function () { resolve(true); },
      fail: function () { resolve(false); }
    });
  });
}

function updateRankScore(scoreKey, score) {
  return updateOfficialScore(getRankManager(), scoreKey, score);
}

function createOfficialChallenge(scoreKey, score) {
  var manager = getRankManager();
  if (!manager || !manager.createChallenge) {
    return Promise.resolve(false);
  }
  return updateOfficialScore(manager, scoreKey, score).then(function (updated) {
    if (!updated) {
      return false;
    }
    return new Promise(function (resolve) {
      manager.createChallenge({
        scoreKey: scoreKey,
        success: function () { resolve(true); },
        fail: function () { resolve(false); }
      });
    });
  });
}

function onOfficialChallengeStart(callback) {
  var manager = getRankManager();
  if (manager && manager.onChallengeStart) {
    manager.onChallengeStart(callback);
  }
}

function finishOfficialChallenge(scoreKey, score) {
  return updateOfficialScore(getRankManager(), scoreKey, score);
}

function abortOfficialChallenge() {
  var manager = getRankManager();
  if (manager && manager.abort) {
    try {
      manager.abort({ success: noop, fail: noop });
    } catch (err) {}
  }
}

function getMenuButtonRect() {
  if (hasWx && wx.getMenuButtonBoundingClientRect) {
    try {
      return wx.getMenuButtonBoundingClientRect();
    } catch (err) {}
  }
  return null;
}

function now() {
  return Date.now();
}

module.exports = {
  hasWx: hasWx,
  getSystemInfo: getSystemInfo,
  createCanvas: createCanvas,
  createOffscreenCanvas: createOffscreenCanvas,
  exportCanvasImage: exportCanvasImage,
  createInnerAudioContext: createInnerAudioContext,
  createAudioContext: createAudioContext,
  requestFrame: requestFrame,
  cancelFrame: cancelFrame,
  onTouch: onTouch,
  getStorage: getStorage,
  setStorage: setStorage,
  vibrateShort: vibrateShort,
  showToast: showToast,
  showShareMenu: showShareMenu,
  shareGame: shareGame,
  hasGameClubButton: hasGameClubButton,
  syncGameClubButton: syncGameClubButton,
  destroyGameClubButton: destroyGameClubButton,
  getLaunchOptions: getLaunchOptions,
  onShow: onShow,
  requestPrivacyAuthorization: requestPrivacyAuthorization,
  openPrivacyContract: openPrivacyContract,
  initCloud: initCloud,
  callSocialCloud: callSocialCloud,
  reportEvent: reportEvent,
  setUserCloudStorage: setUserCloudStorage,
  requestFriendRankCanvas: requestFriendRankCanvas,
  requestRankReminder: requestRankReminder,
  getRankReminderStatus: getRankReminderStatus,
  updateRankScore: updateRankScore,
  hasOfficialChallenge: hasOfficialChallenge,
  createOfficialChallenge: createOfficialChallenge,
  onOfficialChallengeStart: onOfficialChallengeStart,
  finishOfficialChallenge: finishOfficialChallenge,
  abortOfficialChallenge: abortOfficialChallenge,
  getMenuButtonRect: getMenuButtonRect,
  now: now
};
