'use strict';

var fs = require('fs');
var path = require('path');

var inputDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'artifacts', 'audio-source'));
var outputDir = path.resolve(process.argv[3] || path.join(__dirname, '..', 'assets', 'audio'));

function parseWave(filePath) {
  var buffer = fs.readFileSync(filePath);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Unsupported WAV container: ' + filePath);
  }
  var offset = 12;
  var format = null;
  var data = null;
  while (offset + 8 <= buffer.length) {
    var id = buffer.toString('ascii', offset, offset + 4);
    var size = buffer.readUInt32LE(offset + 4);
    var body = offset + 8;
    if (id === 'fmt ') {
      format = {
        tag: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      data = buffer.slice(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!format || !data || format.tag !== 1 || format.channels !== 1 || format.bits !== 16) {
    throw new Error('Expected mono 16-bit PCM WAV: ' + filePath);
  }
  var samples = new Float64Array(Math.floor(data.length / 2));
  for (var i = 0; i < samples.length; i += 1) {
    samples[i] = data.readInt16LE(i * 2);
  }
  return { sampleRate: format.sampleRate, samples: samples };
}

function writeWave(filePath, sampleRate, samples) {
  var dataSize = samples.length * 2;
  var buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  for (var i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]))), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

function peak(samples) {
  var result = 0;
  for (var i = 0; i < samples.length; i += 1) {
    result = Math.max(result, Math.abs(samples[i]));
  }
  return result;
}

function trimSilence(samples, sampleRate, preMs, postMs) {
  var threshold = Math.max(120, peak(samples) * 0.022);
  var start = 0;
  var end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]) < threshold) {
    start += 1;
  }
  while (end > start && Math.abs(samples[end]) < threshold) {
    end -= 1;
  }
  start = Math.max(0, start - Math.round(sampleRate * preMs / 1000));
  end = Math.min(samples.length - 1, end + Math.round(sampleRate * postMs / 1000));
  return samples.slice(start, end + 1);
}

function quietSpans(samples, sampleRate) {
  var windowSize = Math.max(1, Math.round(sampleRate * 0.005));
  var threshold = Math.max(145, peak(samples) * 0.014);
  var spans = [];
  var quietStart = -1;
  for (var offset = 0; offset < samples.length; offset += windowSize) {
    var count = Math.min(windowSize, samples.length - offset);
    var power = 0;
    for (var i = 0; i < count; i += 1) {
      power += samples[offset + i] * samples[offset + i];
    }
    var quiet = Math.sqrt(power / count) < threshold;
    if (quiet && quietStart < 0) {
      quietStart = offset;
    } else if (!quiet && quietStart >= 0) {
      spans.push({ start: quietStart, end: offset });
      quietStart = -1;
    }
  }
  if (quietStart >= 0) {
    spans.push({ start: quietStart, end: samples.length });
  }
  return spans;
}

function resampleForPitch(samples, factor) {
  var length = Math.max(1, Math.floor(samples.length / factor));
  var result = new Float64Array(length);
  for (var i = 0; i < length; i += 1) {
    var source = i * factor;
    var left = Math.floor(source);
    var right = Math.min(samples.length - 1, left + 1);
    var blend = source - left;
    result[i] = samples[left] * (1 - blend) + samples[right] * blend;
  }
  return result;
}

function concatenate(parts) {
  var length = parts.reduce(function (sum, part) { return sum + part.length; }, 0);
  var result = new Float64Array(length);
  var offset = 0;
  parts.forEach(function (part) {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function silence(sampleRate, milliseconds) {
  return new Float64Array(Math.round(sampleRate * milliseconds / 1000));
}

function normalizeAndFade(samples, sampleRate, targetPeak, fadeInMs, fadeOutMs) {
  var currentPeak = peak(samples) || 1;
  var scale = targetPeak / currentPeak;
  var fadeIn = Math.max(1, Math.round(sampleRate * fadeInMs / 1000));
  var fadeOut = Math.max(1, Math.round(sampleRate * fadeOutMs / 1000));
  for (var i = 0; i < samples.length; i += 1) {
    var envelope = 1;
    if (i < fadeIn) {
      envelope *= i / fadeIn;
    }
    if (i >= samples.length - fadeOut) {
      envelope *= Math.max(0, (samples.length - 1 - i) / fadeOut);
    }
    samples[i] *= scale * envelope;
  }
  return samples;
}

function findSyllableGap(samples, sampleRate) {
  var minimum = samples.length * 0.2;
  var maximum = samples.length * 0.72;
  return quietSpans(samples, sampleRate).filter(function (span) {
    return span.start >= minimum && span.end <= maximum && span.end - span.start >= sampleRate * 0.012;
  }).sort(function (a, b) {
    return (b.end - b.start) - (a.end - a.start);
  })[0] || null;
}

function compactLongPauses(samples, sampleRate) {
  var spans = quietSpans(samples, sampleRate).filter(function (span) {
    return span.end - span.start > sampleRate * 0.2;
  });
  if (!spans.length) {
    return samples;
  }
  var parts = [];
  var cursor = 0;
  spans.forEach(function (span) {
    parts.push(samples.slice(cursor, span.start));
    parts.push(silence(sampleRate, 125));
    cursor = span.end;
  });
  parts.push(samples.slice(cursor));
  return concatenate(parts);
}

function duration(samples, sampleRate) {
  return (samples.length / sampleRate).toFixed(3);
}

fs.mkdirSync(outputDir, { recursive: true });

var slowSource = parseWave(path.join(inputDir, 'choubao.wav'));
var slow = trimSilence(slowSource.samples, slowSource.sampleRate, 7, 35);
var gap = findSyllableGap(slow, slowSource.sampleRate);
if (gap) {
  var first = trimSilence(slow.slice(0, gap.start), slowSource.sampleRate, 2, 8);
  var second = trimSilence(slow.slice(gap.end), slowSource.sampleRate, 2, 22);
  slow = concatenate([
    resampleForPitch(first, 1.13),
    silence(slowSource.sampleRate, 18),
    resampleForPitch(second, 1.24)
  ]);
} else {
  slow = resampleForPitch(slow, 1.17);
}
normalizeAndFade(slow, slowSource.sampleRate, 30400, 4, 20);
writeWave(path.join(outputDir, 'choubao.wav'), slowSource.sampleRate, slow);

var winSource = parseWave(path.join(inputDir, 'choubao-win.wav'));
var win = trimSilence(winSource.samples, winSource.sampleRate, 8, 60);
win = compactLongPauses(win, winSource.sampleRate);
win = resampleForPitch(win, 1.12);
normalizeAndFade(win, winSource.sampleRate, 29600, 6, 35);
writeWave(path.join(outputDir, 'choubao-win.wav'), winSource.sampleRate, win);

var noteSource = parseWave(path.join(inputDir, 'bao.wav'));
var note = trimSilence(noteSource.samples, noteSource.sampleRate, 5, 34);
var names = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
var factors = [1.06, 1.13, 1.21, 1.29, 1.38, 1.48, 1.59];
names.forEach(function (name, index) {
  var pitched = resampleForPitch(note, factors[index]);
  normalizeAndFade(pitched, noteSource.sampleRate, 30000, 3, 18);
  writeWave(path.join(outputDir, 'bao-' + name + '.wav'), noteSource.sampleRate, pitched);
  console.log('bao-' + name + '.wav: ' + duration(pitched, noteSource.sampleRate) + 's');
});

console.log('choubao.wav: ' + duration(slow, slowSource.sampleRate) + 's');
console.log('choubao-win.wav: ' + duration(win, winSource.sampleRate) + 's');
