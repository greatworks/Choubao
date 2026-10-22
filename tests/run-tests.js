'use strict';

var assert = require('assert');
var fs = require('fs');
var AdService = require('../src/ad-service');
var copy = require('../src/copy');
var config = require('../src/config');
var generator = require('../src/level-generator');
var curatedRetries = require('../src/level-retries');
var GameModel = require('../src/game-model');
var Renderer = require('../src/renderer');
var InputManager = require('../src/input');
var SoundManager = require('../src/sound');
var melodyCatalog = require('../src/melody-catalog');
var SocialService = require('../src/social-service');
var storage = require('../src/storage');
var platformModule = require('../src/platform');
var themeCatalog = require('../src/theme-catalog');
var mainModule = require('../src/main');

function testJsonFiles() {
  var gameConfig = JSON.parse(fs.readFileSync('game.json', 'utf8'));
  var projectConfig = JSON.parse(fs.readFileSync('project.config.json', 'utf8'));
  var cloudLock = JSON.parse(fs.readFileSync('cloudfunctions/social/package-lock.json', 'utf8'));
  var mainSource = fs.readFileSync('src/main.js', 'utf8');
  var platformSource = fs.readFileSync('src/platform.js', 'utf8');
  var openDataSource = fs.readFileSync('src/open-data/index.js', 'utf8');
  var shareCardSource = fs.readFileSync('src/share-card.js', 'utf8');
  var previewBuilderSource = fs.readFileSync('scripts/build-preview.js', 'utf8');
  assert.strictEqual(gameConfig.officialPrivacyAuthorizationShowingGap, undefined, 'game.json must not contain unsupported privacy prompt interval fields');
  assert.strictEqual(projectConfig.libVersion, '3.15.2', 'release base library must remain pinned');
  assert.strictEqual(cloudLock.packages['node_modules/wx-server-sdk'].version, '4.0.2', 'cloud SDK lock drifted');
  assert(platformSource.indexOf('wx.requirePrivacyAuthorize') >= 0, 'official privacy authorization API is missing');
  assert(platformSource.indexOf('wx.openPrivacyContract') >= 0, 'privacy contract entry is missing');
  assert(mainSource.indexOf('model.setPrivacyRequester(requestOnlineFeatures)') >= 0, 'online features lost their privacy gate');
  assert.strictEqual(mainSource.indexOf('requestOnlineFeatures().then'), -1, 'privacy authorization must not run automatically on launch');
  assert.strictEqual(platformSource.indexOf('withShareTicket: true'), -1, 'unused group share-ticket collection returned');
  assert.strictEqual(platformSource.indexOf('traceUser: true'), -1, 'cloud user tracing must remain disabled');
  assert(platformSource.indexOf('wx.createGameClubButton') >= 0, 'official game-club entry is missing');
  assert(platformSource.indexOf('wx.onShareTimeline') >= 0, 'timeline sharing entry is missing');
  assert(openDataSource.indexOf('pixelRatio') >= 0 && openDataSource.indexOf('setTransform') >= 0, 'friend rank must render at device pixel density');
  assert(openDataSource.indexOf('前进') >= 0 && openDataSource.indexOf('后退') >= 0, 'friend rank movement feedback is missing');
  assert.strictEqual(openDataSource.indexOf('进入榜单时已更新'), -1, 'friend rank must not show a refresh-status label');
  assert(shareCardSource.indexOf('renderRankShareCard') >= 0 && shareCardSource.indexOf('drawRankPreview') >= 0, 'rank sharing card preview is missing');
  assert.strictEqual(shareCardSource.indexOf('ctx.drawImage(rankCanvas'), -1, 'protected open-data pixels must not be exported into share cards');
  assert(mainSource.indexOf('parseRankShareLaunch') >= 0 && mainSource.indexOf('model.openFriendRank') >= 0, 'rank share must deep-link into the friend-rank modal');
  assert(previewBuilderSource.indexOf("'src/melody-catalog.js'") >= 0, 'preview bundle must include the piano melody catalog');
}

function readWaveInfo(filePath) {
  var buffer = fs.readFileSync(filePath);
  assert.strictEqual(buffer.toString('ascii', 0, 4), 'RIFF', filePath + ' must be a RIFF file');
  assert.strictEqual(buffer.toString('ascii', 8, 12), 'WAVE', filePath + ' must be a WAV file');
  var offset = 12;
  var sampleRate = 0;
  var channels = 0;
  var bits = 0;
  var dataSize = 0;
  var dataOffset = 0;
  while (offset + 8 <= buffer.length) {
    var id = buffer.toString('ascii', offset, offset + 4);
    var size = buffer.readUInt32LE(offset + 4);
    var body = offset + 8;
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bits = buffer.readUInt16LE(body + 14);
    } else if (id === 'data') {
      dataSize = size;
      dataOffset = body;
    }
    offset = body + size + (size % 2);
  }
  assert(sampleRate > 0 && dataSize > 0, filePath + ' has an invalid WAV header');
  return {
    buffer: buffer,
    dataOffset: dataOffset,
    dataSize: dataSize,
    duration: dataSize / (sampleRate * channels * (bits / 8))
  };
}

function testAudioAssets() {
  var slow = readWaveInfo('assets/audio/choubao.wav');
  var win = readWaveInfo('assets/audio/choubao-win.wav');
  var bgm = readWaveInfo('assets/audio/choubao-bgm.wav');
  assert(slow.duration >= 0.35 && slow.duration <= 0.7, 'choubao voice must start quickly and stay punchy');
  assert(win.duration >= 1.5 && win.duration <= 3, 'win voice must be expressive without delaying the result screen');
  assert(bgm.duration >= 50 && bgm.duration <= 60, 'background music loop must be long enough to avoid quick repetition');
  assert(bgm.buffer.length < 1.5 * 1024 * 1024, 'background music is too large for the mini-game package');
  var bgmPeak = 0;
  for (var sample = bgm.dataOffset; sample < bgm.dataOffset + bgm.dataSize; sample += 2) {
    bgmPeak = Math.max(bgmPeak, Math.abs(bgm.buffer.readInt16LE(sample)) / 32768);
  }
  assert(bgmPeak >= 0.65 && bgmPeak <= 0.8, 'background music master level is outside the safe mix range');

  var names = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
  var previous = null;
  names.forEach(function (name) {
    var info = readWaveInfo('assets/audio/bao-' + name + '.wav');
    assert(info.duration >= 0.18 && info.duration <= 0.38, name + ' vocal note has the wrong duration');
    if (previous) {
      assert(info.duration < previous.duration, 'vocal notes must become progressively faster and higher');
      assert.strictEqual(info.buffer.equals(previous.buffer), false, 'vocal notes must be distinct audio assets');
    }
    previous = info;
  });
}

function testMelodyCatalog() {
  assert.strictEqual(melodyCatalog.SONGS.length, 10, 'the piano feature must ship exactly ten public-domain melodies');
  assert.strictEqual(melodyCatalog.PLAYBACK_PITCH_MULTIPLIER, 3, 'melodies must use a bright phone-friendly register');
  var ids = {};
  melodyCatalog.SONGS.forEach(function (song) {
    assert(!ids[song.id], 'melody ids must be unique: ' + song.id);
    ids[song.id] = true;
    assert(song.name && song.origin, 'melody metadata is incomplete: ' + song.id);
    assert(song.notes.length >= 25, 'melody is too short to feel recognizable: ' + song.id);
    song.notes.forEach(function (note) {
      assert(note.frequency >= 580 && note.frequency <= 3200, 'melody note is outside the lively mobile playback range: ' + song.id);
      assert(note.duration >= 0.2 && note.duration <= 0.45, 'melody note duration cannot express its score rhythm: ' + song.id);
    });
  });
  assert.strictEqual(melodyCatalog.getSongForLevel(1), null, 'tutorial level must retain the original sound design');
  assert.strictEqual(melodyCatalog.getSongForLevel(2).id, melodyCatalog.SONGS[0].id, 'level 2 must start the melody cycle');
  assert.strictEqual(melodyCatalog.getSongForLevel(11).id, melodyCatalog.SONGS[9].id, 'level 11 must use the tenth melody');
  assert.strictEqual(melodyCatalog.getSongForLevel(12).id, melodyCatalog.SONGS[0].id, 'the ten-song cycle must restart at level 12');
  assert.strictEqual(melodyCatalog.getNoteForClear(2, 0), null, 'the first clear must be reserved for the choubao voice');
  var first = melodyCatalog.getNoteForClear(2, 1);
  var wrapped = melodyCatalog.getNoteForClear(2, melodyCatalog.SONGS[0].notes.length + 1);
  assert.strictEqual(wrapped.name, first.name, 'a melody must loop within its current level');
}

function testSoundDesign() {
  var originalInnerAudio = platformModule.createInnerAudioContext;
  var originalAudioContext = platformModule.createAudioContext;
  var plays = [];
  var stops = [];
  var frequencies = [];
  var gains = [];
  var innerAudioCount = 0;
  var pauses = [];
  platformModule.createInnerAudioContext = function () {
    innerAudioCount += 1;
    return {
      src: '',
      volume: 0,
      playbackRate: 1,
      stop: function () { stops.push(this.src); },
      pause: function () { pauses.push(this.src); },
      play: function () {
        plays.push({ src: this.src, rate: this.playbackRate, volume: this.volume, loop: this.loop });
      }
    };
  };
  platformModule.createAudioContext = function () {
    return {
      currentTime: 1,
      state: 'running',
      destination: {},
      createOscillator: function () {
        return {
          type: 'sine',
          frequency: { setValueAtTime: function (value) { frequencies.push(value); } },
          connect: function () {},
          start: function () {},
          stop: function () {}
        };
      },
      createGain: function () {
        return {
          gain: {
            setValueAtTime: function (value) { gains.push(value); },
            exponentialRampToValueAtTime: function (value) { gains.push(value); }
          },
          connect: function () {}
        };
      }
    };
  };

  try {
    var audioSave = { settings: { music: true, sfx: true, vibrate: false } };
    var sound = new SoundManager(audioSave);
    assert(innerAudioCount <= 10, 'sound design creates too many InnerAudioContext instances for mobile playback');
    sound.startBgm(false);
    assert(plays.some(function (event) {
      return /choubao-bgm\.wav$/.test(event.src) && event.loop === true && event.volume <= 0.18;
    }), 'original background music must loop quietly across the game');
    audioSave.settings.music = false;
    sound.syncMusic();
    assert(pauses.some(function (source) { return /choubao-bgm\.wav$/.test(source); }), 'music toggle must pause the BGM channel');
    audioSave.settings.music = true;
    sound.unlockAudio();
    sound.updateBgm({ screen: 'play', modal: 'win', combo: 0 }, 1);
    assert(sound.bgmClip.volume <= 0.06, 'win voice must duck the background music');
    sound.play('clear', { streak: 1, gap: Infinity });
    assert(plays.some(function (event) { return /choubao\.wav$/.test(event.src); }), 'slow clear must play the child choubao voice');
    var firstVoiceStops = stops.filter(function (source) { return /choubao\.wav$/.test(source); }).length;

    sound.play('clear', { streak: 2, gap: 620 });
    assert(plays.some(function (event) { return /bao-do\.wav$/.test(event.src); }), 'second fast clear must combine piano Do with the bao voice');
    assert.strictEqual(
      stops.filter(function (source) { return /choubao\.wav$/.test(source); }).length,
      firstVoiceStops,
      'the first choubao voice must not be cut off by the second clear'
    );

    sound.play('clear', { streak: 3, gap: 300 });
    assert(plays.some(function (event) { return /bao-re\.wav$/.test(event.src) && event.rate > 1; }), 'faster clears must raise and speed up the bao voice');
    assert(frequencies.some(function (frequency) { return frequency >= 523; }), 'fast clears must play an audible piano scale');
    assert(Math.max.apply(Math, gains) >= 0.46, 'piano clear tone is too quiet');
    sound.play('difficultySpike');
    assert(frequencies.some(function (frequency) { return frequency >= 1175; }), 'difficulty spike transition needs an audible rising sting');

    var levelVoicePlays = plays.filter(function (event) { return /choubao\.wav$/.test(event.src); }).length;
    sound.play('clear', { level: 2, melodyStep: 0, streak: 7, gap: 200 });
    assert.strictEqual(
      plays.filter(function (event) { return /choubao\.wav$/.test(event.src); }).length,
      levelVoicePlays + 1,
      'the first clear of every melody level must retain the choubao voice'
    );
    var melodyFrequencyStart = frequencies.length;
    var expectedFirstNote = melodyCatalog.getNoteForClear(2, 1);
    var slowAdvance = sound.play('clear', { level: 2, melodyStep: 1, streak: 1, gap: Infinity });
    var slowFrequencies = frequencies.slice(melodyFrequencyStart);
    assert(
      slowFrequencies.some(function (frequency) {
        return Math.abs(frequency - expectedFirstNote.frequency) < 0.01;
      }),
      'the second clear must play the first score note even after a slow gap'
    );
    assert.strictEqual(slowAdvance, 1, 'each clear must advance exactly one score note');
    assert.strictEqual(slowFrequencies.length, 3, 'one piano note must use exactly its fundamental, harmonic and attack oscillators');
    var expectedSecondNote = melodyCatalog.getNoteForClear(2, 2);
    melodyFrequencyStart = frequencies.length;
    var fastAdvance = sound.play('clear', { level: 2, melodyStep: 2, streak: 2, gap: 280 });
    assert(
      frequencies.slice(melodyFrequencyStart).some(function (frequency) {
        return Math.abs(frequency - expectedSecondNote.frequency) < 0.01;
      }),
      'successful clears must advance through the selected melody in order'
    );
    assert.strictEqual(fastAdvance, 1, 'rapid clears must retain one-arrow-one-note feedback');
    assert(sound.melodyNextAt > 1.25, 'rapid clears must preserve enough score timing to reveal the melody');
    assert(sound.bgmClip.volume <= 0.018, 'melody notes must immediately move the BGM out of the foreground');
  } finally {
    platformModule.createInnerAudioContext = originalInnerAudio;
    platformModule.createAudioContext = originalAudioContext;
  }
}

function arrowTurnCount(arrow) {
  var turns = 0;
  for (var index = 2; index < arrow.cells.length; index += 1) {
    var before = arrow.cells[index - 2];
    var middle = arrow.cells[index - 1];
    var after = arrow.cells[index];
    if (
      middle.r - before.r !== after.r - middle.r ||
      middle.c - before.c !== after.c - middle.c
    ) {
      turns += 1;
    }
  }
  return turns;
}

function assertAdjacentArrowColors(level) {
  var owner = {};
  var arrowsById = {};
  level.arrows.forEach(function (arrow) {
    arrowsById[arrow.id] = arrow;
    assert(config.ARROW_COLORS.indexOf(arrow.color) >= 0, 'level ' + level.number + ' used an unknown route color');
    arrow.cells.forEach(function (cell) {
      owner[cell.r + ',' + cell.c] = arrow.id;
    });
  });
  level.arrows.forEach(function (arrow) {
    arrow.cells.forEach(function (cell) {
      [[0, 1], [1, 0]].forEach(function (step) {
        var neighborId = owner[(cell.r + step[0]) + ',' + (cell.c + step[1])];
        if (neighborId && neighborId !== arrow.id) {
          assert.notStrictEqual(
            arrow.color,
            arrowsById[neighborId].color,
            'level ' + level.number + ' gave adjacent arrows the same color: ' + arrow.id + ' and ' + neighborId
          );
        }
      });
    });
  });
}

function testGeneratedLevels() {
  var minDensity = 1;
  var maxDensity = 0;
  var minArrows = Infinity;
  var maxArrows = 0;
  var minLongArrows = Infinity;
  var minWindingArrows = Infinity;
  var minDirectionCount = Infinity;
  var maxDirectionShare = 0;
  var maxDirectionRun = 0;
  var maxInitialRemovable = 0;
  var maxLineViolations = 0;
  var strictQualityLevels = 0;
  var silhouetteIds = {};
  var maskSignatures = {};
  var previousMaskSignature = null;
  for (var number = 1; number <= 1000; number += 1) {
    var level = generator.generateLevel(number);
    var report = generator.validateLevel(level);
    assertAdjacentArrowColors(level);
    assert.strictEqual(report.valid, true, 'level ' + number + ': ' + report.errors.join('; '));
    assert(level.seed > 0, 'level ' + number + ' used fallback layout');
    assert(report.initialRemovable > 0, 'level ' + number + ' has no opening move');
    assert(report.initialRemovable < report.arrows, 'level ' + number + ' has no blockers');
    if (number === 1) {
      assert.strictEqual(level.tutorial, true, 'level 1 must be the tutorial');
      assert.strictEqual(level.layoutType, 'tutorialMiniMaze', 'tutorial must use the compact mini-maze layout');
      assert.strictEqual(level.colorMode, true, 'tutorial mini-maze must distinguish adjacent routes by color');
      assert.strictEqual(level.arrows.length, 8, 'tutorial arrow count is wrong');
      assert(level.arrows.filter(function (arrow) { return arrow.cells.length >= 25; }).length >= 2, 'tutorial needs two long snakes');
      assert(level.occupiedCells >= 130, 'tutorial mini-maze is too sparse');
      assert(report.initialRemovable >= 1 && report.initialRemovable <= 2, 'tutorial must begin with a tightly guided safe choice');
      var tutorialArrows = level.arrows.slice().sort(function (a, b) {
        return a.tutorialOrder - b.tutorialOrder;
      });
      var firstTutorialArrow = tutorialArrows[0];
      var secondTutorialArrow = tutorialArrows[1];
      var firstHead = firstTutorialArrow.cells[firstTutorialArrow.cells.length - 1];
      var secondHead = secondTutorialArrow.cells[secondTutorialArrow.cells.length - 1];
      assert.strictEqual(firstTutorialArrow.cells.length, 4, 'first tutorial arrow must stay short and obvious');
      assert.strictEqual(firstTutorialArrow.dir, 'right', 'first tutorial arrow must face right');
      assert.strictEqual(firstHead.c, level.cols - 1, 'first tutorial arrow must end on the right board edge');
      assert.strictEqual(arrowTurnCount(firstTutorialArrow), 0, 'first tutorial arrow must be a straight, unambiguous move');
      assert.strictEqual(generator.rayCellsFrom(firstHead, config.DIRS[firstTutorialArrow.dir], level.rows, level.cols).length, 0, 'first tutorial arrow must point directly out of the board');
      assert.strictEqual(secondTutorialArrow.cells.length, 6, 'second tutorial arrow must stay short and readable');
      assert.strictEqual(secondTutorialArrow.dir, 'up', 'second tutorial arrow must introduce a clear upward move');
      assert.strictEqual(secondHead.r, 0, 'second tutorial arrow must end on the top board edge');
      assert.strictEqual(generator.rayCellsFrom(secondHead, config.DIRS[secondTutorialArrow.dir], level.rows, level.cols).length, 0, 'second tutorial arrow must point directly out of the board');
      tutorialArrows.forEach(function (arrow) {
        var ownCells = {};
        arrow.cells.forEach(function (cell) { ownCells[cell.r + ',' + cell.c] = true; });
        var head = arrow.cells[arrow.cells.length - 1];
        var forwardRay = generator.rayCellsFrom(head, config.DIRS[arrow.dir], level.rows, level.cols);
        assert.strictEqual(forwardRay.some(function (cell) { return ownCells[cell.r + ',' + cell.c]; }), false, 'tutorial arrow points into its own body: ' + arrow.id);
      });
      tutorialArrows.forEach(function (arrow) {
        assert.strictEqual(
          generator.canExit(arrow, level.arrows, level.rows, level.cols).clear,
          true,
          'tutorial highlighted a blocked arrow: ' + arrow.id
        );
        arrow.active = false;
      });
      continue;
    }
    assert.strictEqual(level.layoutType, 'denseMaze', 'level ' + number + ' is not a dense maze');
    assert.strictEqual(level.generationType, 'dependencyCarve', 'level ' + number + ' used the old band layout');
    var curatedRecipe = curatedRetries[number - 2];
    var expectedRetry = typeof curatedRecipe === 'number' ? curatedRecipe : curatedRecipe.retry;
    assert.strictEqual(level.generationRetry, expectedRetry, 'level ' + number + ' ignored its curated retry');
    assert.strictEqual(level.colorMode, true, 'dense mazes must distinguish adjacent routes by color');
    assert.strictEqual(level.rows, 51, 'dense grid height must be 1.5 times the original design');
    assert.strictEqual(level.cols, 34, 'dense grid width must be about 1.55 times the original design');
    assert(level.timeLimit >= 240 && level.timeLimit <= 300, 'level ' + number + ' timer must stay inside the 240-300 second curve');
    assert(level.silhouette && level.silhouette.id, 'level ' + number + ' has no silhouette identity');
    silhouetteIds[level.silhouette.id] = true;
    assert(level.maskCells && level.maskCells.length >= Math.floor(level.rows * level.cols * 0.7), 'level ' + number + ' silhouette must cover at least 70% of the grid');
    assert(level.maskCells.length < level.rows * level.cols, 'level ' + number + ' fell back to a plain rectangle');
    var maskSignature = level.maskCells.map(function (cell) { return cell.r + ',' + cell.c; }).join('|');
    assert.notStrictEqual(maskSignature, previousMaskSignature, 'adjacent levels reused the same silhouette mask');
    assert(!maskSignatures[maskSignature], 'level ' + number + ' reused the silhouette mask from level ' + maskSignatures[maskSignature]);
    maskSignatures[maskSignature] = number;
    previousMaskSignature = maskSignature;
    var qualityTargets = generator.denseQualityTargets(level);
    var releaseTargets = generator.denseReleaseTargets(level);
    assert(generator.meetsDenseReleaseFloor(report, level.analysis, level), 'level ' + number + ' missed the dense release floor');
    if (generator.meetsDenseQuality(report, level.analysis, level)) {
      strictQualityLevels += 1;
    }
    assert(report.density >= releaseTargets.minDensity, 'level ' + number + ' is too sparse');
    assert(report.boardDensity >= releaseTargets.minBoardDensity, 'level ' + number + ' does not occupy enough of the board');
    assert(report.arrows >= releaseTargets.minArrows, 'level ' + number + ' needs more independent arrow routes');
    assert(report.arrows <= releaseTargets.maxArrows, 'level ' + number + ' contains too many arrow routes');
    var longArrowCount = level.arrows.filter(function (arrow) {
      return arrow.cells.length >= generator.DENSE_LONG_LENGTH;
    }).length;
    assert(longArrowCount >= releaseTargets.longArrows, 'level ' + number + ' needs more long snakes');
    assert(longArrowCount <= releaseTargets.maxLongArrows, 'level ' + number + ' contains too many long snakes');
    var windingArrowCount = level.arrows.filter(function (arrow) { return arrowTurnCount(arrow) >= 4; }).length;
    assert(windingArrowCount >= releaseTargets.windingArrows, 'level ' + number + ' needs more winding snakes');
    assert(level.analysis, 'level ' + number + ' has no difficulty analysis');
    assert(level.analysis.minDirectionCount >= releaseTargets.minDirectionCount, 'level ' + number + ' barely uses one direction');
    assert(level.analysis.directionShare <= releaseTargets.maxDirectionShare, 'level ' + number + ' is dominated by one direction');
    assert(level.analysis.maxDirectionRun <= releaseTargets.maxDirectionRun, 'level ' + number + ' has a trivial same-direction run');
    assert(report.initialRemovable >= 1 && report.initialRemovable <= releaseTargets.maxInitialRemovable, 'level ' + number + ' has a bad opening frontier');
    assert(level.analysis.averageFrontier <= releaseTargets.maxAverageFrontier, 'level ' + number + ' exposes too many safe arrows');
    assert(level.analysis.maxFrontier <= releaseTargets.maxFrontier, 'level ' + number + ' has an oversized safe frontier');
    assert(level.analysis.unlockBursts >= releaseTargets.minUnlockBursts, 'level ' + number + ' lacks chain unlocks');
    assert(level.analysis.sameAxisLineViolations <= releaseTargets.maxSameAxisLineViolations, 'level ' + number + ' contains too many one-way rows or columns');
    level.arrows.forEach(function (arrow) {
      assert.strictEqual(
        generator.pathPointsIntoOwnBody(arrow.cells, level.rows, level.cols),
        false,
        'level ' + number + ' arrow points into its own body: ' + arrow.id
      );
    });
    minLongArrows = Math.min(minLongArrows, longArrowCount);
    minWindingArrows = Math.min(minWindingArrows, windingArrowCount);
    minDirectionCount = Math.min(minDirectionCount, level.analysis.minDirectionCount);
    maxDirectionShare = Math.max(maxDirectionShare, level.analysis.directionShare);
    maxDirectionRun = Math.max(maxDirectionRun, level.analysis.maxDirectionRun);
    maxInitialRemovable = Math.max(maxInitialRemovable, report.initialRemovable);
    maxLineViolations = Math.max(maxLineViolations, level.analysis.sameAxisLineViolations);
    minDensity = Math.min(minDensity, report.density);
    maxDensity = Math.max(maxDensity, report.density);
    minArrows = Math.min(minArrows, report.arrows);
    maxArrows = Math.max(maxArrows, report.arrows);
  }
  assert.strictEqual(Object.keys(silhouetteIds).length, themeCatalog.SHAPES.length, 'the campaign does not use the complete silhouette catalog');
  assert.strictEqual(Object.keys(maskSignatures).length, 999, 'every dense campaign level must have a unique silhouette mask');
  return {
    minDensity: minDensity,
    maxDensity: maxDensity,
    minArrows: minArrows,
    maxArrows: maxArrows,
    minLongArrows: minLongArrows,
    minWindingArrows: minWindingArrows,
    minDirectionCount: minDirectionCount,
    maxDirectionShare: maxDirectionShare,
    maxDirectionRun: maxDirectionRun,
    maxInitialRemovable: maxInitialRemovable,
    maxLineViolations: maxLineViolations,
    strictQualityLevels: strictQualityLevels
  };
}

function testSilhouetteCatalog() {
  assert.strictEqual(themeCatalog.SHAPES.length, 24, 'silhouette catalog must retain all outline families');
  assert.strictEqual(new Set(themeCatalog.SHAPES.map(function (shape) { return shape.id; })).size, themeCatalog.SHAPES.length, 'silhouette ids must be unique');
  [2, 73, 498, 1000].forEach(function (levelNumber) {
    var silhouette = themeCatalog.createSilhouette(levelNumber, generator.DENSE_ROWS, generator.DENSE_COLS);
    assert(
      silhouette.maskCells.length >= Math.floor(generator.DENSE_ROWS * generator.DENSE_COLS * 0.7),
      'silhouette is too sparse at level ' + levelNumber
    );
  });
}

function testDeterministicGeneration() {
  var first = generator.generateLevel(87);
  var second = generator.generateLevel(87);
  assert.deepStrictEqual(first, second, 'same level number must generate the same layout');
}

function testGameModel() {
  var save = storage.defaultSave();
  var sounds = [];
  var model = new GameModel(
    save,
    {
      showRewarded: function () { return Promise.resolve({ rewarded: true }); },
      showInterstitial: function () {}
    },
    { play: function (name, variant) { sounds.push({ name: name, variant: variant }); } }
  );
  model.startLevel(20);

  var blocked = model.level.arrows.filter(function (arrow) {
    return !generator.canExit(arrow, model.level.arrows, model.level.rows, model.level.cols).clear;
  })[0];
  assert(blocked, 'test level must contain a blocked arrow');
  model.tapArrow(blocked.id);
  assert.strictEqual(model.lives, 2, 'blocked tap should cost one heart');
  assert.strictEqual(model.timeLeft, model.level.timeLimit - 10, 'blocked tap must deduct ten seconds');
  assert(blocked.blockedBump > 0, 'blocked arrow should rebound');
  assert.strictEqual(sounds[sounds.length - 1].name, 'wrong');
  assert.strictEqual(model.melodyStep, 0, 'blocked taps must not advance the melody');
  assert.strictEqual(model.message, '', 'blocked taps already have visual, audio, heart and timer feedback');

  var removable = generator.findRemovable(model.level.arrows, model.level.rows, model.level.cols)[0];
  var initiallyRemovable = {};
  generator.findRemovable(model.level.arrows, model.level.rows, model.level.cols).forEach(function (arrow) {
    initiallyRemovable[arrow.id] = true;
  });
  var before = model.activeCount();
  model.tapArrow(removable.id);
  assert.strictEqual(removable.removalMode, 'escape');
  assert.strictEqual(model.hasMovingArrows(), true);
  assert.strictEqual(model.praiseEffects.length, 1, 'a successful arrow tap must create praise text');
  assert(model.praiseEffects[0].text.length > 0, 'praise text must not be empty');

  var availableDuringMotion = generator.findRemovable(model.level.arrows, model.level.rows, model.level.cols);
  var concurrentArrow = availableDuringMotion.filter(function (arrow) {
    return !initiallyRemovable[arrow.id];
  })[0] || availableDuringMotion[0];
  assert(concurrentArrow, 'moving arrow must release occupancy for the next tap immediately');
  model.tapArrow(concurrentArrow.id);
  assert.strictEqual(concurrentArrow.removing, true, 'second arrow must start before the first animation finishes');
  assert.strictEqual(removable.active, true, 'first arrow animation ended before the concurrent tap was tested');
  assert.strictEqual(model.praiseEffects.length, 2, 'concurrent clears must each retain their own praise effect');
  assert.strictEqual(model.praiseEffects[1].text, '牛啊！', 'fast second clear must upgrade the praise copy');

  for (var i = 0; i < 100 && (removable.active || concurrentArrow.active); i += 1) {
    model.tick(0.02);
  }
  assert.strictEqual(removable.active, false, 'escaping arrow should leave the board');
  assert.strictEqual(concurrentArrow.active, false, 'concurrent escaping arrow should leave the board');
  assert.strictEqual(model.praiseEffects.length, 0, 'expired praise effects must be released');
  assert.strictEqual(model.activeCount(), before - 2);
  var firstClearSound = sounds.filter(function (event) { return event.name === 'clear'; })[0];
  assert.strictEqual(firstClearSound.variant.streak, 1, 'first clear must use the choubao voice');
  assert.strictEqual(firstClearSound.variant.level, 20, 'clear sound must receive the active level');
  assert.strictEqual(firstClearSound.variant.melodyStep, 0, 'first clear must reserve the melody step for the choubao voice');
  var secondClearSound = sounds.filter(function (event) { return event.name === 'clear'; })[1];
  assert.strictEqual(secondClearSound.variant.streak, 2, 'fast second clear must enter the note sequence');
  assert.strictEqual(secondClearSound.variant.melodyStep, 1, 'second clear must start the score at its first note');
  assert.strictEqual(model.melodyStep, 2, 'each successful arrow tap must advance exactly one melody step');

  var originalShareGame = platformModule.shareGame;
  var sharePayload = null;
  platformModule.shareGame = function (payload) {
    sharePayload = payload;
    return true;
  };
  model.shareWin();
  platformModule.shareGame = originalShareGame;
  assert(sharePayload && sharePayload.title.indexOf('你个臭宝') >= 0, 'win share must reinforce the game brand');
  assert.strictEqual(model.message, '', 'successful sharing must rely on the native share panel instead of a redundant toast');

  var finalSave = storage.defaultSave();
  var finalModel = new GameModel(finalSave, {
    showRewarded: function () { return Promise.resolve({ rewarded: true }); },
    showInterstitial: function () {}
  }, { play: function () {} });
  finalModel.startLevel(1000, true);
  finalModel.win();
  assert.strictEqual(finalSave.highestLevel, 1000, 'final clear must not upload a phantom level 1001');
  assert.strictEqual(finalSave.currentLevel, 1000, 'campaign progress must remain capped at the final level');
  finalModel.nextLevel();
  assert.strictEqual(finalModel.screen, 'home', 'final-level action must return home instead of replaying level 1000');

  var tutorialSave = storage.defaultSave();
  var tutorialSounds = [];
  var tutorialModel = new GameModel(tutorialSave, {
    showRewarded: function () { return Promise.resolve({ rewarded: true }); },
    showInterstitial: function () {}
  }, { play: function (name) { tutorialSounds.push(name); } });
  tutorialModel.startLevel(1, true);
  tutorialModel.nextLevel();
  assert.strictEqual(tutorialModel.modal, 'difficultySpike', 'level 2 must be preceded by the difficulty spike transition');
  assert.strictEqual(tutorialSave.social.difficultySpikeSeen, true, 'difficulty spike transition must be persisted');
  assert(tutorialSounds.indexOf('difficultySpike') >= 0, 'difficulty spike transition must have an audio cue');
  tutorialModel.acceptDifficultySpike();
  assert.strictEqual(tutorialModel.level.number, 2, 'difficulty spike confirmation must enter level 2');
  assert.strictEqual(tutorialModel.modal, null, 'difficulty spike modal must close when level 2 starts');
}

function testSaveLevelBounds() {
  var originalGetStorage = platformModule.getStorage;
  var originalSetStorage = platformModule.setStorage;
  var persistedSave = null;
  platformModule.getStorage = function () {
    var save = storage.defaultSave();
    save.highestLevel = 1001;
    save.currentLevel = 9999;
    return save;
  };
  platformModule.setStorage = function (key, value) {
    persistedSave = value;
  };
  try {
    var loaded = storage.load();
    assert.strictEqual(loaded.highestLevel, 1000, 'legacy overflowed highest level must be repaired');
    assert.strictEqual(loaded.currentLevel, 1000, 'legacy overflowed current level must be repaired');
    assert.strictEqual(persistedSave.highestLevel, 1000, 'repaired highest level must be written back immediately');
    assert.strictEqual(persistedSave.currentLevel, 1000, 'repaired current level must be written back immediately');
  } finally {
    platformModule.getStorage = originalGetStorage;
    platformModule.setStorage = originalSetStorage;
  }
}

function testEconomySaveMigration() {
  var originalGetStorage = platformModule.getStorage;
  var originalSetStorage = platformModule.setStorage;
  var persistedSave = null;
  platformModule.getStorage = function () {
    return {
      version: 4,
      highestLevel: 18,
      currentLevel: 18,
      coins: 246,
      energy: 9,
      props: { eraser: 7, wand: 4, hint: 9 },
      settings: { assistLine: true },
      stats: { totalCleared: 17 },
      social: {}
    };
  };
  platformModule.setStorage = function (key, value) {
    persistedSave = value;
  };
  try {
    var migrated = storage.load();
    assert.strictEqual(migrated.version, 5, 'economy save version was not upgraded');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(migrated, 'energy'), false, 'legacy energy must be removed');
    assert.strictEqual(migrated.coins, 246, 'earned coins must survive the economy migration');
    assert.deepStrictEqual(migrated.props, { eraser: 1, wand: 1, hint: 1, grid: 1 }, 'all four props must start with one free use');
    assert.deepStrictEqual(migrated.propIntroClaimed, { eraser: false, wand: false, hint: false, grid: false }, 'first prop supplies must start unused');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(migrated.settings, 'assistLine'), false, 'legacy permanent grid setting must be removed');
    assert(persistedSave && persistedSave.version === 5, 'migrated economy save was not persisted');
  } finally {
    platformModule.getStorage = originalGetStorage;
    platformModule.setStorage = originalSetStorage;
  }
}

async function testPropSupplyEconomy() {
  var save = storage.defaultSave();
  var adViews = 0;
  var model = new GameModel(save, {
    showRewarded: function () {
      adViews += 1;
      return Promise.resolve({ rewarded: true });
    },
    showInterstitial: function () {}
  }, { play: function () {} });
  var startingCoins = save.coins;
  model.startLevel(2);
  assert.strictEqual(save.coins, startingCoins, 'starting a level must not spend coins');

  model.useProp('grid');
  assert.strictEqual(save.props.grid, 0, 'free grid use was not consumed');
  assert.strictEqual(model.assistLineActive, true, 'grid prop must last for the current round');
  assert.strictEqual(model.gridAccessGrantedThisRound, true, 'grid access must be unlocked for the current round');
  assert.strictEqual(model.message, '', 'normal prop use must rely on direct UI feedback instead of a toast');
  model.useProp('grid');
  assert.strictEqual(model.assistLineActive, false, 'unlocked grid must toggle off without another charge');
  assert.strictEqual(model.modal, null, 'unlocked grid must not open another supply modal');
  model.useProp('grid');
  assert.strictEqual(model.assistLineActive, true, 'unlocked grid must toggle back on without another charge');
  assert.strictEqual(save.props.grid, 0, 'grid toggles must not consume another quota');

  model.restartLevel();
  assert.strictEqual(model.assistLineActive, false, 'grid prop must reset on a new round');
  assert.strictEqual(model.gridAccessGrantedThisRound, false, 'grid access must reset on a new round');
  model.useProp('grid');
  assert.strictEqual(model.modal, 'propSupply', 'empty first-use prop must open its intro supply');
  assert.strictEqual(model.getPropSupplyMode('grid'), 'intro');
  var sharedKind = '';
  model.social.share = function (targetModel, kind) {
    sharedKind = kind;
    return true;
  };
  assert.strictEqual(model.claimPendingPropIntro(), true, 'shared first supply was not granted');
  assert.strictEqual(save.propIntroClaimed.grid, true, 'first grid supply must be one-time');
  assert.strictEqual(sharedKind, 'prop', 'prop share must use the dedicated challenge copy');
  assert.strictEqual(save.props.grid, 1, 'shared grid supply must be credited to the account');
  assert.strictEqual(model.assistLineActive, false, 'shared grid supply must not be auto-applied');
  assert.strictEqual(model.message, '', 'credited prop quota is already visible in the numeric badge');
  model.useProp('grid');
  assert.strictEqual(save.props.grid, 0, 'credited grid supply must be consumed only after a second tap');
  assert.strictEqual(model.assistLineActive, true, 'second tap must apply the credited grid supply');

  model.restartLevel();
  assert.strictEqual(model.getPropSupplyMode('grid'), 'video', 'used first supply must advance to rewarded video');
  await model.useProp('grid');
  assert.strictEqual(adViews, 1, 'rewarded video was not requested for the repeated prop');
  assert.strictEqual(model.getPropSupplyMode('grid'), 'count', 'completed video must change the badge back to a numeric quota');
  assert.strictEqual(save.props.grid, 1, 'rewarded grid prop must be credited to the account');
  assert.strictEqual(model.assistLineActive, false, 'rewarded grid prop must not be auto-applied');
  assert.strictEqual(model.modal, null, 'repeated prop must open the ad directly without a confirmation modal');
  assert.strictEqual(model.message, '', 'completed rewarded ads must use the updated quota badge as feedback');
  model.useProp('grid');
  assert.strictEqual(save.props.grid, 0, 'credited video quota must be spent on the following tap');
  assert.strictEqual(model.assistLineActive, true, 'following tap must activate the credited grid prop');

  save.props.hint = 0;
  save.propIntroClaimed.hint = false;
  model.social.share = function (targetModel, kind) {
    sharedKind = kind;
    return true;
  };
  model.useProp('hint');
  assert.strictEqual(model.claimPendingPropIntro(), true, 'share-only first supply was not granted');
  assert.strictEqual(sharedKind, 'prop', 'prop share must use the dedicated challenge copy');
  assert.strictEqual(save.propIntroClaimed.hint, true, 'shared first supply must be one-time');
  assert.strictEqual(save.props.hint, 1, 'shared hint supply must be credited before use');
  assert.strictEqual(model.level.arrows.some(function (arrow) { return arrow.hintPulse > 0; }), false, 'shared hint supply must not be auto-applied');
  model.useProp('hint');
  assert.strictEqual(save.props.hint, 0, 'credited hint must be consumed on the following tap');
  assert(model.level.arrows.some(function (arrow) { return arrow.hintPulse > 0; }), 'following tap must apply the credited hint');
  assert.strictEqual(model.message, '', 'hint highlighting must not be accompanied by a redundant toast');
  assert.strictEqual(save.coins, startingCoins, 'props must never consume earned coins');
}

async function testAdFallback() {
  var originalHasWx = platformModule.hasWx;
  try {
    platformModule.hasWx = true;
    var productionResult = await new AdService().showRewarded();
    assert.strictEqual(productionResult.rewarded, false, 'WeChat must not reward when no ad instance exists');
    assert.strictEqual(productionResult.devFallback, false, 'WeChat must not use the browser reward fallback');

    platformModule.hasWx = false;
    var previewResult = await new AdService().showRewarded();
    assert.strictEqual(previewResult.rewarded, true, 'browser preview should keep the free development fallback');
    assert.strictEqual(previewResult.devFallback, true, 'browser preview must identify the development fallback');
  } finally {
    platformModule.hasWx = originalHasWx;
  }
}

function testPinchZoom() {
  var handlers = {};
  var save = storage.defaultSave();
  var model = new GameModel(save, {
    showRewarded: function () { return Promise.resolve({ rewarded: true }); },
    showInterstitial: function () {}
  }, { play: function () {} });
  var audioUnlocks = 0;
  model.sound.unlockAudio = function () { audioUnlocks += 1; };
  model.startLevel(2);
  var platform = {
    onTouch: function (canvas, type, handler) {
      handlers[type] = handler;
      return function () {};
    }
  };
  new InputManager({}, platform, { hitTest: function () { return null; } }, model);
  handlers.start({
    touches: [{ clientX: 100, clientY: 120 }, { clientX: 200, clientY: 120 }],
    changedTouches: []
  });
  assert.strictEqual(audioUnlocks, 1, 'first touch must unlock the background music channel');
  handlers.move({
    touches: [{ clientX: 50, clientY: 120 }, { clientX: 250, clientY: 120 }],
    changedTouches: []
  });
  assert(model.zoom >= 1.95 && model.zoom <= 2.05, 'pinch zoom ratio is wrong');
  handlers.end({ touches: [], changedTouches: [{ clientX: 50, clientY: 120 }] });
}

function testSocialChallengeFlow() {
  var sharedPayload = null;
  var adapter = {
    initCloud: function () {},
    onOfficialChallengeStart: function () {},
    now: function () { return Date.now(); },
    callSocialCloud: function () { return Promise.resolve(null); },
    reportEvent: function () {},
    setUserCloudStorage: function () {},
    requestFriendRankCanvas: function () { return null; },
    requestRankReminder: function () { return Promise.resolve(false); },
    createOfficialChallenge: function () { return Promise.resolve(false); },
    finishOfficialChallenge: function () { return Promise.resolve(false); },
    abortOfficialChallenge: function () {},
    createOffscreenCanvas: function () { return null; },
    shareGame: function (payload) {
      sharedPayload = payload;
      return true;
    }
  };
  var social = new SocialService(adapter);
  var firstDaily = social.getDailyChallenge(new Date(2026, 6, 26));
  var repeatedDaily = social.getDailyChallenge(new Date(2026, 6, 26));
  assert.strictEqual(firstDaily.level, repeatedDaily.level, 'daily challenge must be deterministic for the same date');
  assert(social.getShareTitle({ kind: 'win', level: 21, arrows: 48, timeText: '20秒', combo: 8, mistakes: 0 }).indexOf('90%的人卡在') >= 0, 'approved challenge copy is missing');

  var save = storage.defaultSave();
  save.currentLevel = 3;
  save.stats.totalCleared = 1;
  var model = new GameModel(save, {
    showRewarded: function () { return Promise.resolve({ rewarded: true }); },
    showInterstitial: function () {}
  }, { play: function () {} }, social);
  assert.strictEqual(model.handleLaunchOptions({
    query: { mode: 'duel', cid: 'friend-22', level: '22', target: '15000', combo: '12' }
  }), true, 'challenge launch query was not recognized');
  assert.strictEqual(model.modal, 'challengeInvite');
  model.acceptPendingChallenge();
  assert.strictEqual(model.runMode, 'challenge');
  assert.strictEqual(model.level.number, 22);
  assert.strictEqual(save.currentLevel, 3, 'friend challenge must not change campaign progress');
  model.shareWin();
  assert(sharedPayload && sharedPayload.query.indexOf('mode=duel') >= 0, 'counter challenge share is missing the duel mode');
  assert(sharedPayload.query.indexOf('cv=') >= 0, 'share copy variant is missing from the challenge query');
  assert(sharedPayload.title.indexOf('你个臭宝') >= 0, 'social share must reinforce the game brand');
  assert.strictEqual(social.parseLaunchOptions({ query: sharedPayload.query }).copyId, sharedPayload.copyId, 'share copy attribution was lost on launch');
  assert.strictEqual(save.social.counterShares, 1, 'counter share attribution was not persisted');

  var rankPreviewSource = { width: 600, height: 540 };
  var rankPreviewDrawn = false;
  var rankCardContext = new Proxy({
    createLinearGradient: function () { return { addColorStop: function () {} }; },
    measureText: function (text) { return { width: String(text).length * 12 }; },
    drawImage: function (source) { rankPreviewDrawn = rankPreviewDrawn || source === rankPreviewSource; }
  }, {
    get: function (target, key) {
      if (!(key in target)) {
        target[key] = function () {};
      }
      return target[key];
    },
    set: function (target, key, value) {
      target[key] = value;
      return true;
    }
  });
  adapter.createOffscreenCanvas = function () {
    return { width: 500, height: 400, getContext: function () { return rankCardContext; } };
  };
  adapter.exportCanvasImage = function () { return 'rank-share-card.png'; };
  model.rankCanvas = rankPreviewSource;
  var rankPayload = social.buildRankShare(model);
  var rankLaunch = social.parseRankShareLaunch({ query: rankPayload.query });
  assert.strictEqual(rankPayload.imageUrl, 'rank-share-card.png', 'rank share did not use the generated leaderboard card');
  assert.strictEqual(rankPreviewDrawn, false, 'rank share card must not export protected live leaderboard pixels');
  assert(rankPayload.query.indexOf('from=rank') >= 0 && rankPayload.query.indexOf('rankLevel=') >= 0 && rankPayload.query.indexOf('rid=') >= 0, 'rank share query is missing its deep-link identity');
  assert(rankLaunch && rankLaunch.id === rankPayload.rankShareId, 'rank share deep-link could not be parsed');
  assert.strictEqual(rankLaunch.level, save.highestLevel, 'rank share lost the current campaign level');

  var newcomerSave = storage.defaultSave();
  var newcomer = new GameModel(newcomerSave, {
    showRewarded: function () { return Promise.resolve({ rewarded: true }); },
    showInterstitial: function () {}
  }, { play: function () {} }, social);
  newcomer.handleLaunchOptions({ query: { mode: 'duel', cid: 'warmup-1', level: '80', target: '30000' } });
  newcomer.acceptPendingChallenge();
  assert.strictEqual(newcomer.runMode, 'warmup', 'new players must enter the tutorial before a dense shared challenge');
  assert.strictEqual(newcomer.level.number, 1);
  assert(newcomer.challengeAfterWarmup, 'shared challenge was lost during tutorial warmup');
}

async function testPrivacyAuthorizationGates() {
  var calls = {
    cloudInit: 0,
    cloud: 0,
    events: 0,
    rankWrites: 0,
    rankReads: 0,
    reminders: 0,
    reminderChecks: 0,
    rankManagerWrites: 0,
    officialListeners: 0
  };
  var adapter = {
    hasWx: true,
    initCloud: function () { calls.cloudInit += 1; },
    callSocialCloud: function () { calls.cloud += 1; return Promise.resolve(null); },
    reportEvent: function () { calls.events += 1; },
    setUserCloudStorage: function () { calls.rankWrites += 1; return true; },
    updateRankScore: function (key, score) {
      calls.rankManagerWrites += 1;
      assert.strictEqual(key, config.SOCIAL.levelRankKey);
      assert.strictEqual(score, save.highestLevel);
      return Promise.resolve(false);
    },
    requestFriendRankCanvas: function () { calls.rankReads += 1; return {}; },
    getRankReminderStatus: function () {
      calls.reminderChecks += 1;
      return Promise.resolve({ supported: true, confirmed: false, accepted: false, status: 'unknown' });
    },
    requestRankReminder: function () {
      calls.reminders += 1;
      return Promise.resolve({ supported: true, confirmed: true, accepted: true, status: 'accept' });
    },
    onOfficialChallengeStart: function () { calls.officialListeners += 1; },
    createOfficialChallenge: function () { return Promise.resolve(true); },
    finishOfficialChallenge: function () { return Promise.resolve(true); },
    abortOfficialChallenge: function () {}
  };
  var social = new SocialService(adapter);
  var save = storage.defaultSave();
  var model = {
    saveData: save,
    persist: function () {},
    startOfficialDailyChallenge: function () {}
  };
  social.bindModel(model);

  assert.strictEqual(social.isPrivacyAuthorized(), false, 'WeChat online features must start locked');
  assert.strictEqual(calls.cloudInit, 0, 'cloud initialized before privacy authorization');
  social.track(model, 'shareCreates', { level: 2 });
  assert.strictEqual(save.social.shareCreates, 1, 'local attribution should remain available offline');
  assert.strictEqual(calls.events, 0, 'analytics escaped the privacy gate');
  assert.strictEqual(await social.refreshInbox(model), false, 'cloud inbox should be blocked before authorization');
  assert.strictEqual(calls.cloud, 0, 'cloud function ran before authorization');
  assert.strictEqual(await social.syncRank(model), false, 'rank write should be blocked before authorization');
  assert.strictEqual(social.requestFriendRank(280, 330), null, 'friend rank should be blocked before authorization');
  assert.strictEqual(await social.requestRankReminder(), false, 'rank reminder should be blocked before authorization');
  assert.strictEqual(calls.officialListeners, 0, 'official rank listener bound before authorization');

  assert.strictEqual(social.setPrivacyAuthorized(true), true, 'authorization should unlock online features');
  assert.strictEqual(social.setPrivacyAuthorized(true), true, 'repeated authorization should remain successful');
  assert.strictEqual(calls.cloudInit, 1, 'cloud must initialize exactly once');
  assert.strictEqual(calls.officialListeners, 1, 'official listener must bind exactly once');
  social.track(model, 'shareCreates', { level: 2 });
  assert.strictEqual(calls.events, 1, 'analytics did not unlock after authorization');
  assert.strictEqual(await social.refreshInbox(model), true, 'cloud inbox did not unlock after authorization');
  assert.strictEqual(calls.cloud, 1, 'cloud function was not called after authorization');
  assert.strictEqual(await social.syncRank(model), true, 'rank write did not unlock after authorization');
  assert(social.requestFriendRank(280, 330), 'friend rank did not unlock after authorization');
  assert.strictEqual((await social.requestRankReminder()).accepted, true, 'rank reminder did not unlock after authorization');
  assert.strictEqual(calls.rankWrites, 1);
  assert.strictEqual(calls.rankManagerWrites, 1, 'optional rank manager compatibility write was not attempted');
  assert.strictEqual(calls.rankReads, 1);
  assert.strictEqual(calls.reminders, 1);
  assert.strictEqual(calls.reminderChecks, 1);
}

async function testPrivacyRetryFromFeatureEntry() {
  var authorized = false;
  var privacyRequests = 0;
  var rankReads = 0;
  var rankWrites = 0;
  var adViews = 0;
  var social = {
    bindModel: function () {},
    isPrivacyAuthorized: function () { return authorized; },
    requestFriendRank: function () { rankReads += 1; return {}; },
    syncRank: function () { rankWrites += 1; return Promise.resolve(true); },
    requestRankReminder: function () {
      return Promise.resolve({ supported: true, confirmed: true, accepted: true, status: 'accept' });
    }
  };
  var save = storage.defaultSave();
  save.props.hint = 0;
  save.propIntroClaimed.hint = true;
  var model = new GameModel(save, {
    showRewarded: function () {
      adViews += 1;
      return Promise.resolve({ rewarded: true });
    }
  }, { play: function () {} }, social);

  model.setPrivacyRequester(function () {
    privacyRequests += 1;
    return Promise.resolve(false);
  });
  assert.strictEqual(await model.openFriendRank(286, 330), false, 'declined privacy request must keep friend rank closed');
  assert.strictEqual(model.modal, null);
  assert.strictEqual(rankReads, 0);
  assert.strictEqual(model.message, copy.UI.toast.privacyNeeded);

  model.setPrivacyRequester(function () {
    privacyRequests += 1;
    authorized = true;
    return Promise.resolve(true);
  });
  assert.strictEqual(await model.openFriendRank(286, 330), true, 'accepted retry must open friend rank');
  assert.strictEqual(model.modal, 'friendRank');
  assert.strictEqual(rankReads, 1, 'friend rank must refresh once after the local score has been synchronized');
  assert.strictEqual(rankWrites, 1, 'opening friend rank must backfill the latest local progress');
  model.tick(3.05);
  assert.strictEqual(rankReads, 1, 'open friend rank must not keep polling after it is shown');
  model.closeModal();
  model.tick(3.05);
  assert.strictEqual(rankReads, 1, 'closed friend rank must not trigger extra reads');
  await model.requestRankReminder();
  assert.strictEqual(save.social.rankReminderAccepted, true, 'accepted rank reminder must persist its enabled state');
  assert.strictEqual(save.social.rankReminderScoreSynced, true, 'enabled reminder must retain a successfully synchronized score');
  assert.strictEqual(rankWrites, 2, 'rank reminder must synchronize the score used by the system ranking');

  social.syncRank = function () {
    rankWrites += 1;
    return Promise.resolve(false);
  };
  await model.requestRankReminder();
  assert.strictEqual(save.social.rankReminderAccepted, true, 'a temporary score-write failure must not erase the subscription');
  assert.strictEqual(save.social.rankReminderScoreSynced, false, 'failed score writes must not display the reminder as fully enabled');
  assert.strictEqual(model.message, copy.UI.toast.rankOnPending, 'failed score writes need an actionable retry message');
  assert.strictEqual(rankWrites, 3, 'retrying the reminder must retry the standard leaderboard score write');

  model.startLevel(2, true);
  await model.useProp('hint');
  assert.strictEqual(adViews, 1, 'authorized rewarded ad entry did not call the ad service');
  assert.strictEqual(model.modal, null, 'empty repeated prop must not open a confirmation modal');
  assert.strictEqual(save.props.hint, 1, 'rewarded hint must be credited to the account');
  assert.strictEqual(model.level.arrows.some(function (arrow) { return arrow.hintPulse > 0; }), false, 'rewarded hint must not be auto-applied');
  model.useProp('hint');
  assert.strictEqual(save.props.hint, 0, 'credited hint must be spent on the following tap');
  assert(model.level.arrows.some(function (arrow) { return arrow.hintPulse > 0; }), 'following tap must apply the rewarded hint');
  assert.strictEqual(privacyRequests, 2, 'authorized features should not keep requesting privacy');
}

async function testPrivacyRequesterLifecycle() {
  var authorized = false;
  var authorizationRequests = 0;
  var enabled = 0;
  var outcomes = [false, true];
  var requester = mainModule.createPrivacyRequester(
    function () { return authorized; },
    function () {
      authorizationRequests += 1;
      return Promise.resolve(outcomes.shift());
    },
    function () {
      authorized = true;
      enabled += 1;
      return true;
    }
  );

  assert.strictEqual(await requester(), false, 'a declined privacy request must resolve as blocked');
  assert.strictEqual(authorizationRequests, 1, 'the first gated feature tap must request privacy once');
  assert.strictEqual(enabled, 0, 'declining privacy must not enable online features');
  assert.strictEqual(await requester(), true, 'the next feature tap must be able to request privacy again');
  assert.strictEqual(authorizationRequests, 2, 'a declined request must not remain cached for the next feature tap');
  assert.strictEqual(enabled, 1, 'accepting the retry must enable online features');
  assert.strictEqual(await requester(), true, 'authorized users must continue directly');
  assert.strictEqual(authorizationRequests, 2, 'authorized users must not see another privacy request');
}

async function testPrivacyContractEntry() {
  var save = storage.defaultSave();
  var model = new GameModel(save, {
    showRewarded: function () { return Promise.resolve({ rewarded: true }); },
    showInterstitial: function () {}
  }, { play: function () {} });
  var originalOpenPrivacyContract = platformModule.openPrivacyContract;
  var nativeCalls = 0;

  model.setModal('pause');
  try {
    platformModule.openPrivacyContract = function () {
      nativeCalls += 1;
      return Promise.resolve(true);
    };
    assert.strictEqual(await model.openPrivacyContract(), true, 'settings privacy entry must open the official contract');
    assert.strictEqual(nativeCalls, 1, 'official privacy contract must be opened directly');
    assert.strictEqual(model.modal, 'pause', 'opening the official contract must not replace the settings modal');

    platformModule.openPrivacyContract = function () {
      nativeCalls += 1;
      return Promise.resolve(false);
    };
    assert.strictEqual(await model.openPrivacyContract(), false, 'failed native privacy page must report failure');
    assert.strictEqual(nativeCalls, 2, 'failed native privacy entry must still be attempted');
    assert.strictEqual(model.modal, 'pause', 'native failure must keep the settings modal visible');
    assert.strictEqual(model.message, copy.UI.toast.privacyUnavailable, 'native failure must show a concise retry message');
  } finally {
    platformModule.openPrivacyContract = originalOpenPrivacyContract;
  }
}

function testCopySystem() {
  assert.deepStrictEqual(Object.keys(copy.UI.toast).sort(), [
    'gameClubUnavailable',
    'privacyNeeded',
    'privacyUnavailable',
    'rankBlocked',
    'rankOnPending',
    'shareUnavailable',
    'videoIncompleteProp',
    'videoIncompleteRevive',
    'videoUnavailable'
  ], 'toast copy must remain limited to actionable failures');
  var defaultCopy = copy.getDefaultShareCopy();
  var firstLevel = copy.getShareCopy({ kind: 'win', level: 1, timeText: '8秒', combo: 5, mistakes: 0, runMode: 'normal' });
  var hardLevel = copy.getShareCopy({ kind: 'win', level: 21, timeText: '20秒', combo: 8, mistakes: 0, runMode: 'normal' });
  var rescue = copy.getShareCopy({ kind: 'stuck', level: 4, remaining: 5, runMode: 'normal' });
  var counter = copy.getShareCopy({ kind: 'win', level: 8, timeText: '18秒', combo: 10, mistakes: 0, runMode: 'challenge', beatTarget: true });
  var rankShare = copy.getRankShareCopy(88);
  var copies = [defaultCopy, firstLevel, hardLevel, rescue, counter, rankShare];
  var praise = [1, 2, 3, 4, 5, 6, 7, 8].map(function (streak) {
    return copy.getClearPraise(streak, streak);
  });
  assert.strictEqual(praise[1].text, '牛啊！', 'quick clears need an immediate upgraded praise');
  assert.strictEqual(praise[5].text, '满级操作！', 'high streak copy must deliver the requested peak feedback');
  assert(praise[7].tier >= praise[0].tier, 'praise visual tier must grow with the clear streak');
  for (var level = 1; level <= 1000; level += 1) {
    copies.push(copy.getShareCopy({ kind: 'win', level: level, timeText: '59.9秒', combo: level % 14, mistakes: level % 3, runMode: 'normal' }));
  }
  for (var remaining = 0; remaining <= 80; remaining += 1) {
    copies.push(copy.getShareCopy({ kind: 'stuck', level: remaining % 1000 + 1, remaining: remaining, runMode: 'normal' }));
  }

  assert(defaultCopy.title.indexOf('你个臭宝') >= 0, 'default share must address the recipient as choubao');
  assert(firstLevel.title.indexOf('第一关') >= 0, 'tutorial share needs the first-level tease');
  assert(hardLevel.title.indexOf('90%的人卡在第21关') >= 0, 'hard-level share needs the approved challenge hook');
  assert(rescue.title.indexOf('已老实') >= 0, 'rescue share needs the honest-help hook');
  assert(counter.title.indexOf('反超') >= 0 && counter.title.indexOf('再来') >= 0, 'counter share needs a direct rematch hook');
  assert(rankShare.title.indexOf('好友榜') >= 0, 'rank share needs a leaderboard hook');
  copies.forEach(function (item) {
    assert(/^[a-z0-9_]+$/.test(item.id), 'copy id must be safe for share query attribution');
    assert(item.title.indexOf(copy.BRAND_NAME) >= 0, 'share title lost the full brand name: ' + item.title);
    assert(item.title.length <= 32, 'share title is too long: ' + item.title);
    assert(item.cardHeadline.length <= 14, 'share-card headline is too long: ' + item.cardHeadline);
  });
}

function testSnakeGeometry() {
  var level = generator.generateLevel(40);
  var arrow = generator.findRemovable(level.arrows, level.rows, level.cols).filter(function (item) {
    return item.cells.length >= 8;
  })[0] || generator.findRemovable(level.arrows, level.rows, level.cols)[0];
  var start = Renderer.prototype.getEscapingCells.call({}, arrow, level, 0);
  var middle = Renderer.prototype.getEscapingCells.call({}, arrow, level, 0.5);
  var end = Renderer.prototype.getEscapingCells.call({}, arrow, level, 1);
  assert.deepStrictEqual(start, arrow.cells, 'escape animation must start on the original path');
  assert(middle.length >= 2, 'snake body must remain visible mid-animation');
  end.forEach(function (cell) {
    var inside = cell.r >= 0 && cell.r < level.rows && cell.c >= 0 && cell.c < level.cols;
    assert.strictEqual(inside, false, 'snake must be fully outside at the end');
  });
}

function testRendererSmoke() {
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  var context = new Proxy({
    setTransform: function () {},
    measureText: function () { return { width: 10 }; }
  }, {
    get: function (target, key) {
      if (!(key in target)) {
        target[key] = function () {};
      }
      return target[key];
    },
    set: function (target, key, value) {
      target[key] = value;
      return true;
    }
  });
  var canvas = {
    style: {},
    getContext: function () { return context; }
  };
  var renderer = new Renderer(canvas, {
    windowWidth: 390,
    windowHeight: 844,
    pixelRatio: 1,
    statusBarHeight: 24
  }, null);
  var save = storage.defaultSave();
  var model = new GameModel(save, {
    showRewarded: function () { return Promise.resolve({ rewarded: true }); },
    showInterstitial: function () {}
  }, { play: function () {} });
  renderer.draw(model, 0.016);
  model.setModal('pause');
  renderer.draw(model, 0.016);
  model.closeModal();
  model.startLevel(40);
  var playTextCalls = [];
  var originalFillText = context.fillText;
  context.fillText = function (text) { playTextCalls.push(String(text)); };
  renderer.draw(model, 0.016);
  context.fillText = originalFillText;
  assert(playTextCalls.indexOf(copy.UI.play.melodyQuestion) >= 0, 'every level must ask the player to identify the melody');
  assert(playTextCalls.indexOf(copy.UI.play.melodySpeedHint) >= 0, 'every level must explain that faster taps make the melody clearer');
  var windingArrow = model.level.arrows.filter(function (candidate) {
    return arrowTurnCount(candidate) >= 1;
  })[0] || model.level.arrows[0];
  var pathCalls = [];
  var headCalls = [];
  var originalStrokePath = renderer.strokePath;
  var originalDrawPuzzleArrowHead = renderer.drawPuzzleArrowHead;
  renderer.strokePath = function (points) {
    pathCalls.push({
      points: points.slice(),
      color: this.ctx.strokeStyle,
      width: this.ctx.lineWidth
    });
  };
  renderer.drawPuzzleArrowHead = function (head, angle, stroke, color) {
    headCalls.push({ head: head, angle: angle, stroke: stroke, color: color });
  };
  renderer.drawArrow(windingArrow, { level: model.level, cell: 12, x0: 20, y0: 20 }, true);
  renderer.strokePath = originalStrokePath;
  renderer.drawPuzzleArrowHead = originalDrawPuzzleArrowHead;
  assert.strictEqual(pathCalls.length, 1, 'each puzzle arrow must render as one continuous polyline');
  assert.strictEqual(pathCalls[0].points.length, windingArrow.cells.length, 'the rendered line must preserve every turn in the arrow path');
  assert(pathCalls[0].width >= 2.2 && pathCalls[0].width <= 5.2, 'puzzle arrow stroke is outside the compact readable range');
  assert.strictEqual(pathCalls[0].color, windingArrow.color, 'the complete arrow must use its assigned route color');
  assert.strictEqual(headCalls.length, 1, 'each puzzle arrow must render exactly one direction head');
  assert.strictEqual(headCalls[0].angle, config.DIRS[windingArrow.dir].angle, 'arrow head does not match its exit direction');
  assert.strictEqual(headCalls[0].color, windingArrow.color, 'arrow head must match its route color');
  var arrow = generator.findRemovable(model.level.arrows, model.level.rows, model.level.cols)[0];
  model.removeArrow(arrow, 'escape');
  model.tick(0.15);
  renderer.draw(model, 0.016);
  ['pause', 'win', 'lose', 'propSupply', 'challengeReady', 'friendRank', 'difficultySpike'].forEach(function (modal) {
    model.modal = modal;
    renderer.draw(model, 0.016);
  });
  model.pendingChallenge = { type: 'duel', level: 22, targetMs: 15000 };
  model.modal = 'challengeInvite';
  renderer.draw(model, 0.016);

  var compactRenderer = new Renderer(canvas, {
    windowWidth: 375,
    windowHeight: 667,
    pixelRatio: 1,
    statusBarHeight: 24
  }, null);
  model.modal = null;
  model.level.colorMode = true;
  compactRenderer.draw(model, 0.016);
  var compactPause = compactRenderer.hitZones.filter(function (zone) { return zone.id === 'pause'; })[0];
  var compactColor = compactRenderer.hitZones.filter(function (zone) { return zone.id === 'toggleColor'; })[0];
  var compactZoomIn = compactRenderer.hitZones.filter(function (zone) { return zone.id === 'zoomIn'; })[0];
  var compactProps = compactRenderer.hitZones.filter(function (zone) { return zone.id && zone.id.indexOf('prop:') === 0; });
  assert(compactPause && compactColor, 'compact play header controls are missing');
  assert.strictEqual(overlaps(compactPause, compactColor), false, 'pause and color controls overlap');
  assert(compactColor.x + compactColor.w <= 375 / 2 - 58, 'color control overlaps the centered level label');
  assert.strictEqual(compactProps.length, 4, 'all four prop controls must be visible');

  model.openHome();
  compactRenderer.draw(model, 0.016);
  var homeSettings = compactRenderer.hitZones.filter(function (zone) { return zone.id === 'homeSettings'; })[0];
  var socialButtons = compactRenderer.hitZones.filter(function (zone) {
    return zone.id === 'dailyChallenge' || zone.id === 'friendRank' || zone.id === 'gameClub';
  });
  assert(homeSettings, 'home settings button is missing');
  assert.strictEqual(socialButtons.length, 3, 'home social buttons are missing');
  assert(homeSettings.y >= Math.max.apply(Math, socialButtons.map(function (zone) { return zone.y + zone.h; })) + 16, 'home settings button is too close to the social buttons');

  model.setModal('pause');
  compactRenderer.draw(model, 0.016);
  var musicToggle = compactRenderer.hitZones.filter(function (zone) { return zone.id === 'setting:music'; })[0];
  var settingZones = compactRenderer.hitZones.filter(function (zone) { return zone.id && zone.id.indexOf('setting:') === 0; });
  var privacyButton = compactRenderer.hitZones.filter(function (zone) { return zone.id === 'privacyContract'; })[0];
  var finishButton = compactRenderer.hitZones.filter(function (zone) { return zone.id === 'resume'; })[0];
  assert(musicToggle, 'settings modal must expose an independent music toggle');
  assert.strictEqual(settingZones.length, 4, 'settings modal must show music, effects, vibration and color controls');
  assert(privacyButton, 'settings modal must expose the privacy contract');
  assert(privacyButton.w >= 120 && privacyButton.h >= 36, 'subtle privacy link must retain an accessible touch target');
  assert(finishButton, 'compact settings modal is missing the finish button');
  assert(Math.max.apply(Math, settingZones.map(function (zone) { return zone.y + zone.h; })) < finishButton.y, 'music controls overlap the compact settings action');
  assert(Math.max.apply(Math, settingZones.map(function (zone) { return zone.y + zone.h; })) < privacyButton.y, 'privacy contract overlaps the setting toggles');
  assert(privacyButton.y + privacyButton.h < finishButton.y, 'privacy contract overlaps the compact settings action');
  assert(finishButton.y + finishButton.h <= 667, 'compact settings action leaves the viewport');

  var shortRenderer = new Renderer(canvas, {
    windowWidth: 320,
    windowHeight: 568,
    pixelRatio: 1,
    statusBarHeight: 20
  }, null);
  model.closeModal();
  model.openHome();
  shortRenderer.draw(model, 0.016);
  var shortSettings = shortRenderer.hitZones.filter(function (zone) { return zone.id === 'homeSettings'; })[0];
  var shortSocial = shortRenderer.hitZones.filter(function (zone) {
    return zone.id === 'dailyChallenge' || zone.id === 'friendRank' || zone.id === 'gameClub';
  });
  assert(shortSettings, 'short-screen settings button is missing');
  assert(shortSettings.y >= Math.max.apply(Math, shortSocial.map(function (zone) { return zone.y + zone.h; })) + 16, 'short-screen settings button overlaps the social buttons');
  assert(shortSettings.y + shortSettings.h <= 568 - 76, 'short-screen settings button overlaps the footer');

  model.startLevel(40, true);
  model.level.colorMode = true;
  shortRenderer.draw(model, 0.016);
  var shortColor = shortRenderer.hitZones.filter(function (zone) { return zone.id === 'toggleColor'; });
  var shortZoomIn = shortRenderer.hitZones.filter(function (zone) { return zone.id === 'zoomIn'; })[0];
  var shortProps = shortRenderer.hitZones.filter(function (zone) { return zone.id && zone.id.indexOf('prop:') === 0; });
  assert.strictEqual(shortColor.length, 0, 'narrow header should move color mode into settings');
  assert.strictEqual(shortProps.length, 4, 'short-screen prop controls are missing');
  for (var propIndex = 0; propIndex < shortProps.length - 1; propIndex += 1) {
    assert.strictEqual(overlaps(shortProps[propIndex], shortProps[propIndex + 1]), false, 'short-screen prop controls overlap');
  }

  var layerOrder = [];
  var layerRenderer = new Renderer(canvas, {
    windowWidth: 375,
    windowHeight: 667,
    pixelRatio: 1,
    statusBarHeight: 24
  }, null);
  layerRenderer.drawHome = function () { layerOrder.push('home'); };
  layerRenderer.drawModal = function () { layerOrder.push('modal'); };
  layerRenderer.drawToast = function () { layerOrder.push('toast'); };
  layerRenderer.draw({ screen: 'home', modal: 'pause' }, 0.016);
  assert.deepStrictEqual(layerOrder, ['home', 'modal', 'toast'], 'toast must render above the modal layer');

  var originalMeasureText = context.measureText;
  context.measureText = function (text) { return { width: String(text).length * 16 }; };
  var toastRenderer = new Renderer(canvas, {
    windowWidth: 375,
    windowHeight: 667,
    pixelRatio: 1,
    statusBarHeight: 24
  }, null);
  var toastRects = [];
  var toastLines = [];
  toastRenderer.roundRect = function (x, y, w, h) {
    toastRects.push({ x: x, y: y, w: w, h: h });
  };
  toastRenderer.fillTextCenter = function (text) {
    toastLines.push(text);
  };
  toastRenderer.drawToast({
    message: copy.UI.toast.privacyUnavailable + '，请检查微信平台配置后重试',
    messageTime: 2,
    modal: 'pause'
  });
  context.measureText = originalMeasureText;
  assert(toastLines.length >= 2, 'long privacy toast should wrap instead of clipping');
  assert(toastRects[0].w <= 375 - 48, 'privacy toast leaves the viewport');
  assert(toastRects[0].y > 667 * 0.7, 'modal toast should appear below the dialog instead of behind it');

  model.closeModal();
  model.startLevel(1000, true);
  model.win();
  compactRenderer.draw(model, 0.016);
  assert.strictEqual(compactRenderer.hitZones.some(function (zone) { return zone.id === 'next'; }), false, 'final win modal must not offer a phantom next level');
  assert(compactRenderer.hitZones.some(function (zone) { return zone.id === 'home'; }), 'final win modal must return the player home');
}

function testResponsiveUiBounds() {
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  var context = new Proxy({
    setTransform: function () {},
    measureText: function () { return { width: 10 }; }
  }, {
    get: function (target, key) {
      if (!(key in target)) {
        target[key] = function () {};
      }
      return target[key];
    },
    set: function (target, key, value) {
      target[key] = value;
      return true;
    }
  });
  var canvas = {
    style: {},
    getContext: function () { return context; }
  };
  var viewports = [
    { width: 320, height: 568, status: 20 },
    { width: 375, height: 667, status: 24 },
    { width: 390, height: 844, status: 44 },
    { width: 430, height: 932, status: 47 }
  ];
  var modalNames = ['pause', 'win', 'lose', 'propSupply', 'challengeInvite', 'challengeReady', 'friendRank', 'difficultySpike'];

  viewports.forEach(function (viewport) {
    var renderer = new Renderer(canvas, {
      windowWidth: viewport.width,
      windowHeight: viewport.height,
      pixelRatio: 1,
      statusBarHeight: viewport.status
    }, null);
    var save = storage.defaultSave();
    var model = new GameModel(save, {
      showRewarded: function () { return Promise.resolve({ rewarded: true }); },
      showInterstitial: function () {}
    }, { play: function () {} });

    renderer.draw(model, 0.016);
    var homeIds = ['start', 'level1', 'dailyChallenge', 'friendRank', 'gameClub', 'homeSettings'];
    var homeZones = renderer.hitZones.filter(function (zone) { return homeIds.indexOf(zone.id) >= 0; });
    assert.strictEqual(homeZones.length, homeIds.length, 'home controls are missing at ' + viewport.width + 'x' + viewport.height);
    homeZones.forEach(function (zone) {
      assert(zone.x >= 0 && zone.y >= 0 && zone.x + zone.w <= viewport.width && zone.y + zone.h <= viewport.height, 'home control leaves viewport: ' + zone.id);
    });
    for (var homeA = 0; homeA < homeZones.length; homeA += 1) {
      for (var homeB = homeA + 1; homeB < homeZones.length; homeB += 1) {
        assert.strictEqual(overlaps(homeZones[homeA], homeZones[homeB]), false, 'home controls overlap: ' + homeZones[homeA].id + '/' + homeZones[homeB].id);
      }
    }

    model.startLevel(40, true);
    model.pendingProp = { type: 'prop', propId: 'hint' };
    model.pendingChallenge = { type: 'duel', level: 22, targetMs: 15000 };
    modalNames.forEach(function (modalName) {
      model.modal = null;
      renderer.draw(model, 0.016);
      var baseZoneCount = renderer.hitZones.length;
      model.modal = modalName;
      renderer.draw(model, 0.016);
      var modalZones = renderer.hitZones.slice(baseZoneCount);
      assert(modalZones.length > 0, 'modal controls are missing: ' + modalName);
      if (modalName === 'propSupply') {
        assert(modalZones.some(function (zone) { return zone.id === 'claimPropShare'; }), 'first prop supply must expose its share reward');
        assert.strictEqual(modalZones.some(function (zone) { return zone.id === 'claimPropDirect' || zone.id === 'watchAd'; }), false, 'first prop supply must not expose a second reward path');
      }
      modalZones.forEach(function (zone) {
        assert(zone.x >= 0 && zone.y >= 0 && zone.x + zone.w <= viewport.width && zone.y + zone.h <= viewport.height, 'modal control leaves viewport: ' + modalName + '/' + zone.id);
      });
      for (var modalA = 0; modalA < modalZones.length; modalA += 1) {
        for (var modalB = modalA + 1; modalB < modalZones.length; modalB += 1) {
          assert.strictEqual(overlaps(modalZones[modalA], modalZones[modalB]), false, 'modal controls overlap: ' + modalName + '/' + modalZones[modalA].id + '/' + modalZones[modalB].id);
        }
      }
    });
  });
}

async function run() {
  testJsonFiles();
  testSilhouetteCatalog();
  testAudioAssets();
  testMelodyCatalog();
  testSoundDesign();
  var stats = testGeneratedLevels();
  testDeterministicGeneration();
  testGameModel();
  testSaveLevelBounds();
  testEconomySaveMigration();
  await testPropSupplyEconomy();
  await testAdFallback();
  await testPrivacyAuthorizationGates();
  await testPrivacyRetryFromFeatureEntry();
  await testPrivacyRequesterLifecycle();
  await testPrivacyContractEntry();
  testCopySystem();
  testSocialChallengeFlow();
  testPinchZoom();
  testSnakeGeometry();
  testRendererSmoke();
  testResponsiveUiBounds();
  require('../src/main');
  console.log(
    'All tests passed: 1000 levels, ' +
    'tutorial 8 arrows; dense levels ' + stats.minArrows + '-' + stats.maxArrows + ' arrows, grid density ' +
    Math.round(stats.minDensity * 100) + '%-' + Math.round(stats.maxDensity * 100) + '%, at least ' +
    stats.minLongArrows + ' long snakes and ' + stats.minWindingArrows + ' winding snakes; every direction has at least ' +
    stats.minDirectionCount + ' arrows, max direction share ' + Math.round(stats.maxDirectionShare * 100) +
    '%, max same-direction run ' + stats.maxDirectionRun + ', max opening frontier ' + stats.maxInitialRemovable + '.'
    + ' Strict quality levels: ' + stats.strictQualityLevels + '/999.'
  );
}

run().catch(function (error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
