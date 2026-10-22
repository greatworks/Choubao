'use strict';

var fs = require('fs');
var path = require('path');

var SAMPLE_RATE = 12000;
var BPM = 104;
var BEAT_SAMPLES = Math.round(SAMPLE_RATE * 60 / BPM);
var BAR_SAMPLES = BEAT_SAMPLES * 4;
var BARS = 24;
var LOOP_SAMPLES = BAR_SAMPLES * BARS;
var OUTPUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'assets', 'audio', 'choubao-bgm.wav'));
var work = new Float64Array(LOOP_SAMPLES * 3);

var chordProgression = [
  [48, 52, 55, 57],
  [45, 48, 52, 55],
  [41, 45, 48, 52],
  [43, 47, 50, 52],
  [48, 52, 55, 57],
  [40, 43, 47, 52],
  [38, 41, 45, 48],
  [43, 47, 50, 53],
  [48, 52, 55, 57],
  [45, 48, 52, 55],
  [41, 45, 48, 52],
  [43, 47, 50, 52],
  [45, 48, 52, 55],
  [40, 43, 47, 52],
  [41, 45, 48, 52],
  [43, 47, 50, 53],
  [41, 45, 48, 52],
  [43, 47, 50, 52],
  [40, 43, 47, 52],
  [45, 48, 52, 55],
  [38, 41, 45, 48],
  [43, 47, 50, 53],
  [48, 52, 55, 57],
  [43, 47, 50, 53]
];

var motifs = [
  [[0, 76], [2, 79], [3, 81], [5, 79], [6, 76], [7, 74]],
  [[0, 72], [1, 76], [3, 79], [5, 76], [7, 74]],
  [[0, 69], [2, 72], [4, 77], [5, 81], [7, 79]],
  [[0, 74], [1, 79], [3, 81], [5, 79], [6, 74], [7, 71]],
  [[0, 76], [2, 79], [4, 84], [5, 83], [7, 79]],
  [[0, 76], [1, 71], [3, 74], [4, 79], [6, 77], [7, 76]],
  [[0, 77], [2, 81], [3, 79], [5, 76], [7, 74]],
  [[0, 74], [1, 77], [3, 79], [5, 83], [6, 81], [7, 79]]
];

function midi(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function seededRandom(seed) {
  var state = seed >>> 0;
  return function () {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function addSignal(start, duration, render) {
  var startSample = Math.round(start);
  var length = Math.max(1, Math.round(duration * SAMPLE_RATE));
  for (var index = 0; index < length; index += 1) {
    var target = startSample + index;
    if (target < 0 || target >= work.length) {
      continue;
    }
    work[target] += render(index / SAMPLE_RATE, duration, index);
  }
}

function addToyPluck(start, note, duration, velocity) {
  var frequency = midi(note);
  addSignal(start, duration, function (time, length) {
    var attack = Math.min(1, time / 0.008);
    var release = Math.min(1, Math.max(0, (length - time) / 0.045));
    var envelope = attack * release * Math.exp(-time * 5.4);
    var wobble = 1 + Math.sin(time * Math.PI * 7) * 0.0018;
    var phase = Math.PI * 2 * frequency * wobble * time;
    return velocity * envelope * (
      Math.sin(phase) * 0.7 +
      Math.sin(phase * 2) * 0.19 +
      Math.sin(phase * 3) * 0.07
    );
  });
}

function addSoftPad(start, notes, duration, velocity) {
  notes.forEach(function (note, voiceIndex) {
    var frequency = midi(note + 12);
    addSignal(start, duration, function (time, length) {
      var attack = Math.min(1, time / 0.18);
      var release = Math.min(1, Math.max(0, (length - time) / 0.28));
      var breathe = 0.93 + Math.sin(time * Math.PI * 0.7 + voiceIndex) * 0.07;
      return velocity * attack * release * breathe * (
        Math.sin(Math.PI * 2 * frequency * time) * 0.8 +
        Math.sin(Math.PI * 2 * frequency * 2 * time) * 0.06
      );
    });
  });
}

function addBubbleBass(start, note, duration, velocity) {
  var frequency = midi(note - 12);
  addSignal(start, duration, function (time, length) {
    var attack = Math.min(1, time / 0.012);
    var release = Math.min(1, Math.max(0, (length - time) / 0.08));
    var envelope = attack * release * Math.exp(-time * 2.4);
    return velocity * envelope * (
      Math.sin(Math.PI * 2 * frequency * time) * 0.86 +
      Math.sin(Math.PI * 2 * frequency * 2 * time) * 0.13
    );
  });
}

function addWoodBlock(start, pitch, velocity) {
  addSignal(start, 0.12, function (time) {
    var envelope = Math.exp(-time * 34);
    var phase = Math.PI * 2 * pitch * time;
    return velocity * envelope * (Math.sin(phase) * 0.76 + Math.sin(phase * 1.83) * 0.24);
  });
}

function addShaker(start, velocity, seed) {
  var random = seededRandom(seed);
  var previous = 0;
  addSignal(start, 0.075, function (time) {
    var noise = random() * 2 - 1;
    var high = noise - previous * 0.82;
    previous = noise;
    return velocity * Math.exp(-time * 42) * high;
  });
}

function addPlayfulSlide(start, fromNote, toNote, velocity) {
  var from = midi(fromNote);
  var to = midi(toNote);
  addSignal(start, 0.34, function (time, duration) {
    var progress = time / duration;
    var frequency = from * Math.pow(to / from, progress * progress);
    var envelope = Math.sin(Math.PI * progress) * Math.exp(-time * 1.7);
    return velocity * envelope * Math.sin(Math.PI * 2 * frequency * time);
  });
}

function renderBar(loop, bar) {
  var start = loop * LOOP_SAMPLES + bar * BAR_SAMPLES;
  var chord = chordProgression[bar];
  var beat = BEAT_SAMPLES;
  var barDuration = BAR_SAMPLES / SAMPLE_RATE;
  var section = Math.floor(bar / 8);

  addSoftPad(start, chord, barDuration * 1.04, section === 1 ? 0.0105 : 0.009);
  addBubbleBass(start, chord[0], barDuration * 0.42, 0.055);
  addBubbleBass(start + beat * 2, chord[0] + (bar % 4 === 3 ? 7 : 0), barDuration * 0.34, 0.041);

  var motif = motifs[(bar + section * 2) % motifs.length];
  motif.forEach(function (entry, noteIndex) {
    var step = entry[0];
    var note = entry[1];
    if (section === 2 && noteIndex % 3 === 1) {
      note -= 12;
    }
    var accent = step === 0 ? 0.052 : 0.038;
    if (section === 1 && (noteIndex + bar) % 4 === 0) {
      accent *= 1.08;
    }
    addToyPluck(start + Math.round(step * beat / 2), note, 0.44, accent);
  });

  for (var eighth = 1; eighth < 8; eighth += 2) {
    if ((bar + 1) % 4 === 0 && eighth >= 5) {
      continue;
    }
    addShaker(start + Math.round(eighth * beat / 2), 0.0065, 73129 + bar * 97 + eighth * 11);
  }
  addWoodBlock(start + beat, bar % 2 ? 760 : 690, 0.014);
  addWoodBlock(start + beat * 3, bar % 2 ? 820 : 740, 0.011);

  if (bar === 7 || bar === 15 || bar === 23) {
    addPlayfulSlide(start + Math.round(beat * 3.45), bar === 23 ? 67 : 72, bar === 23 ? 84 : 79, 0.013);
  }
}

for (var loop = 0; loop < 3; loop += 1) {
  for (var bar = 0; bar < BARS; bar += 1) {
    renderBar(loop, bar);
  }
}

var middle = work.slice(LOOP_SAMPLES, LOOP_SAMPLES * 2);
var dc = 0;
for (var sampleIndex = 0; sampleIndex < middle.length; sampleIndex += 1) {
  dc += middle[sampleIndex];
}
dc /= middle.length;

var peak = 0;
for (sampleIndex = 0; sampleIndex < middle.length; sampleIndex += 1) {
  middle[sampleIndex] = Math.tanh((middle[sampleIndex] - dc) * 1.12);
  peak = Math.max(peak, Math.abs(middle[sampleIndex]));
}
var scale = 0.76 / Math.max(peak, 0.0001);
for (sampleIndex = 0; sampleIndex < middle.length; sampleIndex += 1) {
  middle[sampleIndex] *= scale;
}

function writeWave(filePath, samples) {
  var dataSize = samples.length * 2;
  var buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  for (var index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[index] * 32767))), 44 + index * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

writeWave(OUTPUT, middle);
console.log('Generated original BGM: ' + OUTPUT);
console.log('Tempo: ' + BPM + ' BPM; form: 24 bars (A/A\'/B); duration: ' + (middle.length / SAMPLE_RATE).toFixed(2) + 's');
console.log('Format: mono ' + SAMPLE_RATE + ' Hz, 16-bit PCM; size: ' + Math.round((44 + middle.length * 2) / 1024) + ' KB');
