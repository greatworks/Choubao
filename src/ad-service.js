'use strict';

var config = require('./config');
var platform = require('./platform');

function AdService() {
  this.rewarded = null;
  this.interstitial = null;
  this.banner = null;
  this.ready = false;
}

AdService.prototype.init = function () {
  if (!platform.hasWx) {
    return;
  }
  if (config.AD_UNITS.rewarded && wx.createRewardedVideoAd) {
    try {
      this.rewarded = wx.createRewardedVideoAd({ adUnitId: config.AD_UNITS.rewarded });
      this.rewarded.onError(function () {});
    } catch (err) {
      this.rewarded = null;
    }
  }
  if (config.AD_UNITS.interstitial && wx.createInterstitialAd) {
    try {
      this.interstitial = wx.createInterstitialAd({ adUnitId: config.AD_UNITS.interstitial });
      this.interstitial.onError(function () {});
    } catch (err) {
      this.interstitial = null;
    }
  }
};

AdService.prototype.showRewarded = function () {
  var self = this;
  return new Promise(function (resolve) {
    if (!self.rewarded) {
      var devFallback = !platform.hasWx;
      resolve({ rewarded: devFallback, devFallback: devFallback });
      return;
    }
    var onClose = function (res) {
      self.rewarded.offClose(onClose);
      resolve({ rewarded: !res || res.isEnded !== false, devFallback: false });
    };
    self.rewarded.onClose(onClose);
    self.rewarded.show().catch(function () {
      self.rewarded.load()
        .then(function () {
          return self.rewarded.show();
        })
        .catch(function () {
          self.rewarded.offClose(onClose);
          resolve({ rewarded: false, devFallback: false });
        });
    });
  });
};

AdService.prototype.showInterstitial = function () {
  if (!this.interstitial) {
    return;
  }
  this.interstitial.show().catch(function () {});
};

module.exports = AdService;
