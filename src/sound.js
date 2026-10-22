'use strict';

var platform = require('./platform');
var melodyCatalog = require('./melody-catalog');

function SoundManager(saveData) {
  this.saveData = saveData;
  this.context = platform.createAudioContext();
  this.audioUnlocked = false;
  this.bgmPlaying = false;
  this.bgmCurrentVolume = 0.18;
  this.bgmDuckUntil = 0;
  this.melodyScheduleLevel = 0;
  this.melodyNextAt = 0;
  this.choubaoVoice = this.createVoiceClip('assets/audio/choubao.wav', 1);
  this.winVoice = this.createVoiceClip('assets/audio/choubao-win.wav', 1);
  this.baoVoices = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'].map(function (name) {
    return this.createVoiceClip('assets/audio/bao-' + name + '.wav', 1);
  }, this);
  this.bgmClip = this.createMusicClip('assets/audio/choubao-bgm.wav');
}

SoundManager.prototype.createVoiceClip = function (source, volume) {
  var clip = platform.createInnerAudioContext();
  if (!clip) {
    return null;
  }
  try {
    clip.src = source;
    clip.volume = volume;
    clip.obeyMuteSwitch = true;
    if ('mixWithOther' in clip) {
      clip.mixWithOther = true;
    }
    if ('preload' in clip) {
      clip.preload = 'auto';
    }
  } catch (err) {}
  return clip;
};

SoundManager.prototype.createMusicClip = function (source) {
  var clip = this.createVoiceClip(source, this.bgmCurrentVolume);
  if (!clip) {
    return null;
  }
  try {
    clip.loop = true;
    clip.volume = this.bgmCurrentVolume;
  } catch (err) {}
  return clip;
};

SoundManager.prototype.startBgm = function (force) {
  if (!this.bgmClip || !this.saveData || !this.saveData.settings || !this.saveData.settings.music) {
    return false;
  }
  if (this.bgmPlaying && !force) {
    return true;
  }
  try {
    if (this.context && this.context.state === 'suspended' && this.context.resume) {
      this.context.resume();
    }
    this.bgmClip.loop = true;
    this.bgmClip.volume = this.bgmCurrentVolume;
    var result = this.bgmClip.play();
    this.bgmPlaying = true;
    if (result && typeof result.catch === 'function') {
      var self = this;
      result.catch(function () { self.bgmPlaying = false; });
    }
    return true;
  } catch (err) {
    this.bgmPlaying = false;
    return false;
  }
};

SoundManager.prototype.pauseBgm = function () {
  if (!this.bgmClip) {
    return;
  }
  try {
    if (typeof this.bgmClip.pause === 'function') {
      this.bgmClip.pause();
    } else if (typeof this.bgmClip.stop === 'function') {
      this.bgmClip.stop();
    }
  } catch (err) {}
  this.bgmPlaying = false;
};

SoundManager.prototype.unlockAudio = function () {
  this.audioUnlocked = true;
  try {
    if (this.context && this.context.state === 'suspended' && this.context.resume) {
      this.context.resume();
    }
  } catch (err) {}
  this.startBgm(true);
};

SoundManager.prototype.syncMusic = function () {
  if (this.saveData && this.saveData.settings && this.saveData.settings.music) {
    this.startBgm(true);
  } else {
    this.pauseBgm();
  }
};

SoundManager.prototype.duckBgm = function (milliseconds, volume) {
  this.bgmDuckUntil = Math.max(this.bgmDuckUntil, platform.now() + milliseconds);
  var duckVolume = Math.max(0.018, Math.min(0.05, Number(volume) || 0.04));
  this.bgmCurrentVolume = Math.min(this.bgmCurrentVolume, duckVolume);
  if (this.bgmClip) {
    try {
      var currentClipVolume = Number(this.bgmClip.volume);
      this.bgmClip.volume = Number.isFinite(currentClipVolume)
        ? Math.min(currentClipVolume, duckVolume)
        : duckVolume;
    } catch (err) {}
  }
};

SoundManager.prototype.updateBgm = function (model, dt) {
  if (!this.saveData || !this.saveData.settings || !this.saveData.settings.music) {
    if (this.bgmPlaying) {
      this.pauseBgm();
    }
    return;
  }
  if (this.audioUnlocked && !this.bgmPlaying) {
    this.startBgm(false);
  }
  if (!this.bgmClip) {
    return;
  }
  var target = model && model.screen === 'play' ? 0.145 : 0.18;
  if (model && model.combo >= 5 && !model.modal) {
    target += 0.012;
  }
  if (model && model.modal) {
    target = model.modal === 'win' ? 0.055 : 0.09;
  }
  if (platform.now() < this.bgmDuckUntil) {
    target = Math.min(target, 0.04);
  }
  var smoothing = Math.min(1, Math.max(0.02, (dt || 0.016) * 4.5));
  this.bgmCurrentVolume += (target - this.bgmCurrentVolume) * smoothing;
  try {
    this.bgmClip.volume = this.bgmCurrentVolume;
  } catch (err) {}
};

SoundManager.prototype.playVoiceClip = function (clip, rate) {
  if (!clip) {
    return false;
  }
  try {
    if (typeof clip.stop === 'function') {
      clip.stop();
    } else if (typeof clip.pause === 'function') {
      clip.pause();
      clip.currentTime = 0;
    }
    if ('playbackRate' in clip) {
      clip.playbackRate = rate || 1;
    }
    var result = clip.play();
    if (result && typeof result.catch === 'function') {
      result.catch(function () {});
    }
    return true;
  } catch (err) {
    return false;
  }
};

SoundManager.prototype.stopVoiceClip = function (clip) {
  if (!clip) {
    return;
  }
  try {
    if (typeof clip.stop === 'function') {
      clip.stop();
    } else if (typeof clip.pause === 'function') {
      clip.pause();
      clip.currentTime = 0;
    }
  } catch (err) {}
};

SoundManager.prototype.playBaoVoice = function (degree, rate) {
  return this.playVoiceClip(this.baoVoices[degree % this.baoVoices.length], rate);
};

SoundManager.prototype.setSaveData = function (saveData) {
  this.saveData = saveData;
};

SoundManager.prototype.scheduleMelodyStart = function (level, beats, now) {
  var currentLevel = Math.max(2, Math.floor(Number(level) || 2));
  var currentTime = Math.max(0, Number(now) || 0);
  var beatLength = 0.19;
  var rhythmicGap = Math.max(0.095, Math.min(0.5, (Number(beats) || 1) * beatLength));
  var queueTooFarAhead = this.melodyNextAt - currentTime > 0.85;
  var queueExpired = this.melodyNextAt < currentTime - 0.12;

  if (this.melodyScheduleLevel !== currentLevel || queueTooFarAhead || queueExpired) {
    this.melodyScheduleLevel = currentLevel;
    this.melodyNextAt = currentTime;
  }

  var start = Math.max(currentTime, this.melodyNextAt);
  this.melodyNextAt = start + rhythmicGap;
  return start;
};

SoundManager.prototype.play = function (name, variant) {
  if (!this.saveData || !this.saveData.settings) {
    return;
  }
  if (this.saveData.settings.vibrate) {
    if (name === 'clear') {
      platform.vibrateShort('light');
    } else if (name === 'wrong') {
      platform.vibrateShort('medium');
    } else if (name === 'win' || name === 'difficultySpike') {
      platform.vibrateShort('heavy');
    }
  }
  if (!this.saveData.settings.sfx) {
    return;
  }
  var patterns = {
    tap: [[420, 0.04]],
    wrong: [[190, 0.13]],
    win: [[523, 0.1, 'piano'], [659, 0.1, 'piano'], [784, 0.12, 'piano'], [1047, 0.22, 'piano']],
    difficultySpike: [[330, 0.07, 'piano'], [440, 0.07, 'piano'], [587, 0.08, 'piano'], [784, 0.09, 'piano'], [1175, 0.2, 'piano']]
  };
  var notes;
  if (name === 'clear') {
    var meta = typeof variant === 'object' && variant ? variant : {
      streak: Math.max(1, variant || 1),
      gap: variant > 1 ? 720 : Infinity
    };
    var streak = Math.max(1, meta.streak || 1);
    var gap = typeof meta.gap === 'number' ? meta.gap : Infinity;
    var level = Math.max(1, Math.floor(Number(meta.level) || 1));
    var melodyStep = Math.max(0, Math.floor(Number(meta.melodyStep) || 0));
    var melodyNote = melodyCatalog.getNoteForClear(level, melodyStep);
    if (level >= 2 && melodyStep === 0) {
      this.melodyScheduleLevel = level;
      this.melodyNextAt = 0;
      if (this.playVoiceClip(this.choubaoVoice, 1)) {
        this.duckBgm(620);
        return;
      }
      notes = [[392, 0.055], [523, 0.11]];
    } else if (melodyNote) {
      notes = [[melodyNote.frequency, melodyNote.duration, 'piano', melodyNote.beats, 1.08]];
      this.duckBgm(Math.max(420, melodyNote.duration * 1000 + 160), 0.018);
    } else if (streak === 1 || gap > 1350) {
      if (this.playVoiceClip(this.choubaoVoice, gap < 700 ? 1.04 : 1)) {
        this.duckBgm(620);
        return;
      }
      notes = [[392, 0.055], [523, 0.11]];
    } else {
      var scale = [523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319, 1397, 1568, 1760, 1976];
      var step = streak - 2;
      var index = step < scale.length ? step : 7 + ((step - 7) % 7);
      var degree = index % 7;
      var octave = Math.floor(index / 7);
      var speedRate = gap <= 430 ? 1.11 : gap <= 760 ? 1.06 : 1;
      var voiceRate = Math.min(1.24, speedRate * (octave ? 1.08 : 1));
      this.playBaoVoice(degree, voiceRate);
      var speedPitch = gap <= 430 ? 1.05 : gap <= 760 ? 1.025 : 1;
      var noteDuration = gap <= 430 ? 0.14 : gap <= 760 ? 0.16 : 0.18;
      notes = [[scale[index] * speedPitch, noteDuration, 'piano']];
    }
  } else {
    notes = patterns[name];
  }
  if (name === 'win') {
    this.stopVoiceClip(this.choubaoVoice);
    this.playVoiceClip(this.winVoice, 1.04);
    this.duckBgm(2900);
  }
  if (!notes) {
    return;
  }
  if (!this.context) {
    return;
  }
  try {
    if (this.context.state === 'suspended' && this.context.resume) {
      this.context.resume();
    }
    var start = this.context.currentTime;
    for (var i = 0; i < notes.length; i += 1) {
      if (melodyNote) {
        start = this.scheduleMelodyStart(level, notes[i][3], this.context.currentTime);
      }
      this.playTone(notes[i][0], notes[i][1], start, notes[i][2], notes[i][4]);
      if (!melodyNote) {
        start += notes[i][1] * 0.8;
      }
    }
    return 1;
  } catch (err) {}
};

SoundManager.prototype.playTone = function (frequency, duration, start, toneType, volumeScale) {
  var scale = Math.max(0.6, Math.min(1.15, Number(volumeScale) || 1));
  var oscillator = this.context.createOscillator();
  var gain = this.context.createGain();
  oscillator.type = toneType === 'piano' ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(toneType === 'piano' ? 0.46 * scale : 0.14, start + 0.006);
  if (toneType === 'piano') {
    gain.gain.exponentialRampToValueAtTime(0.18 * scale, start + Math.min(0.1, duration * 0.38));
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(this.context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  if (toneType === 'piano') {
    var harmonic = this.context.createOscillator();
    var harmonicGain = this.context.createGain();
    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(frequency * 2, start);
    harmonicGain.gain.setValueAtTime(0.0001, start);
    harmonicGain.gain.exponentialRampToValueAtTime(0.15 * scale, start + 0.004);
    harmonicGain.gain.exponentialRampToValueAtTime(0.045 * scale, start + Math.min(0.075, duration * 0.3));
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.78);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(this.context.destination);
    harmonic.start(start);
    harmonic.stop(start + duration + 0.02);

    var attack = this.context.createOscillator();
    var attackGain = this.context.createGain();
    attack.type = 'triangle';
    attack.frequency.setValueAtTime(Math.min(6000, frequency * 3), start);
    attackGain.gain.setValueAtTime(0.0001, start);
    attackGain.gain.exponentialRampToValueAtTime(0.075 * scale, start + 0.002);
    attackGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
    attack.connect(attackGain);
    attackGain.connect(this.context.destination);
    attack.start(start);
    attack.stop(start + 0.055);
  }
};

SoundManager.prototype.tap = function () {
  this.play('tap');
};

module.exports = SoundManager;
