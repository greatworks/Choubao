'use strict';

function InputManager(canvas, platform, renderer, model) {
  this.canvas = canvas;
  this.platform = platform;
  this.renderer = renderer;
  this.model = model;
  this.down = null;
  this.moved = false;
  this.pinch = null;
  this.bind();
}

InputManager.prototype.bind = function () {
  var self = this;
  this.platform.onTouch(this.canvas, 'start', function (event) {
    if (self.model.sound && typeof self.model.sound.unlockAudio === 'function') {
      self.model.sound.unlockAudio();
    }
    var touchPoints = getTouchPoints(event);
    if (touchPoints.length >= 2) {
      self.pinch = {
        distance: touchDistance(touchPoints[0], touchPoints[1]),
        zoom: self.model.zoom,
        center: touchCenter(touchPoints[0], touchPoints[1])
      };
      self.down = null;
      self.moved = true;
      return;
    }
    var point = getPoint(event);
    self.down = point;
    self.moved = false;
  });
  this.platform.onTouch(this.canvas, 'move', function (event) {
    var touchPoints = getTouchPoints(event);
    if (touchPoints.length >= 2) {
      var distance = touchDistance(touchPoints[0], touchPoints[1]);
      var center = touchCenter(touchPoints[0], touchPoints[1]);
      if (!self.pinch) {
        self.pinch = {
          distance: distance,
          zoom: self.model.zoom,
          center: center
        };
      }
      if (self.pinch.distance > 0) {
        self.model.setZoom(self.pinch.zoom * distance / self.pinch.distance);
      }
      self.model.addPan(center.x - self.pinch.center.x, center.y - self.pinch.center.y);
      self.pinch.center = center;
      self.down = null;
      self.moved = true;
      return;
    }
    if (self.pinch) {
      self.pinch = null;
      self.down = null;
      self.moved = true;
      return;
    }
    if (!self.down) {
      return;
    }
    var point = getPoint(event);
    var dx = point.x - self.down.x;
    var dy = point.y - self.down.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      self.moved = true;
      if (self.model.screen === 'play' && !self.model.modal) {
        self.model.addPan(dx, dy);
      }
      self.down = point;
    }
  });
  this.platform.onTouch(this.canvas, 'end', function (event) {
    if (self.pinch) {
      self.pinch = null;
      self.down = null;
      self.moved = true;
      return;
    }
    var point = getPoint(event, true) || self.down;
    if (!point) {
      self.down = null;
      return;
    }
    if (!self.moved) {
      self.handleTap(point.x, point.y);
    }
    self.down = null;
  });
  this.platform.onTouch(this.canvas, 'cancel', function () {
    self.down = null;
    self.pinch = null;
  });
};

InputManager.prototype.handleTap = function (x, y) {
  var zone = this.renderer.hitTest(x, y);
  if (this.model.modal) {
    this.handleModalTap(zone);
    return;
  }
  if (zone && zone.type === 'button') {
    this.handleButton(zone.id);
    return;
  }
  if (this.model.screen === 'play') {
    var arrowId = this.renderer.hitTestArrow(x, y, this.model);
    if (arrowId) {
      this.model.tapArrow(arrowId);
    }
  }
};

InputManager.prototype.handleModalTap = function (zone) {
  if (!zone || zone.type !== 'button') {
    return;
  }
  var id = zone.id;
  if (id === 'modalClose') {
    if (this.model.modal === 'win' || this.model.modal === 'lose') {
      this.model.openHome();
    } else if (this.model.modal === 'challengeReady') {
      this.model.startChallengeAfterWarmup();
    } else {
      if (this.model.modal === 'challengeInvite') {
        this.model.pendingChallenge = null;
      }
      this.model.closeModal();
    }
  } else if (id === 'resume') {
    if (this.model.modal === 'challengeInvite') {
      this.model.pendingChallenge = null;
    }
    this.model.closeModal();
  } else if (id === 'home') {
    this.model.openHome();
  } else if (id === 'restart') {
    this.model.restartLevel();
  } else if (id === 'next') {
    this.model.closeModal();
    this.model.nextLevel();
  } else if (id === 'shareWin') {
    this.model.shareWin();
  } else if (id === 'shareStuck') {
    this.model.shareStuck();
  } else if (id === 'challengeAccept') {
    this.model.acceptPendingChallenge();
  } else if (id === 'challengeReady') {
    this.model.startChallengeAfterWarmup();
  } else if (id === 'officialArena') {
    this.model.startOfficialArena();
  } else if (id === 'dailyChallenge') {
    this.model.startDailyChallenge();
  } else if (id === 'rankReminder') {
    this.model.requestRankReminder();
  } else if (id === 'shareRank') {
    this.model.shareRank();
  } else if (id === 'difficultySpikeStart') {
    this.model.acceptDifficultySpike();
  } else if (id === 'revive') {
    this.model.reviveByAd();
  } else if (id === 'claimPropShare') {
    this.model.claimPendingPropIntro();
  } else if (id === 'privacyContract') {
    this.model.openPrivacyContract();
  } else if (id.indexOf('setting:') === 0) {
    this.model.toggleSetting(id.split(':')[1]);
  }
};

InputManager.prototype.handleButton = function (id) {
  if (id === 'start') {
    this.model.startLevel(this.model.saveData.currentLevel || 1);
  } else if (id === 'level1') {
    this.model.startLevel(1);
  } else if (id === 'dailyChallenge') {
    this.model.startDailyChallenge();
  } else if (id === 'friendRank') {
    var rankSize = this.renderer.getFriendRankSize();
    this.model.openFriendRank(rankSize.width, rankSize.height, rankSize.pixelRatio);
  } else if (id === 'gameClub') {
    this.model.openGameClub();
  } else if (id === 'homeSettings') {
    this.model.setModal('pause');
  } else if (id === 'pause') {
    this.model.setModal('pause');
  } else if (id === 'toggleColor') {
    this.model.toggleSetting('colorMode');
  } else if (id === 'zoomOut') {
    this.model.setZoom(this.model.zoom - 0.22);
  } else if (id === 'zoomIn') {
    this.model.setZoom(this.model.zoom + 0.22);
  } else if (id.indexOf('prop:') === 0) {
    this.model.useProp(id.split(':')[1]);
  }
};

function getPoint(event, changed) {
  var list = changed ? event.changedTouches : event.touches;
  if (!list || !list.length) {
    list = event.changedTouches;
  }
  if (!list || !list.length) {
    return null;
  }
  return {
    x: list[0].clientX,
    y: list[0].clientY
  };
}

function getTouchPoints(event) {
  var list = event && event.touches ? event.touches : [];
  var points = [];
  for (var i = 0; i < list.length; i += 1) {
    points.push({ x: list[i].clientX, y: list[i].clientY });
  }
  return points;
}

function touchDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function touchCenter(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

module.exports = InputManager;
