'use strict';

var SEMITONES = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11
};

// Phone speakers reproduce the upper register much more clearly. Keep the
// transcription names intact and transpose only the synthesized playback.
// Three times the source frequency is one octave plus a perfect fifth: bright
// enough for small speakers without pushing the highest songs above 3.2 kHz.
var PLAYBACK_PITCH_MULTIPLIER = 3;

function noteFrequency(name) {
  var match = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!match || SEMITONES[match[1]] === undefined) {
    throw new Error('Invalid melody note: ' + name);
  }
  var midi = (Number(match[2]) + 1) * 12 + SEMITONES[match[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function parseNotes(source) {
  return source.trim().split(/\s+/).map(function (token) {
    var parts = token.split(':');
    var beats = Math.max(0.5, Math.min(3, Number(parts[1]) || 1));
    return {
      name: parts[0],
      beats: beats,
      frequency: noteFrequency(parts[0]) * PLAYBACK_PITCH_MULTIPLIER,
      duration: Math.max(0.2, Math.min(0.45, 0.15 + beats * 0.1))
    };
  });
}

function song(id, name, origin, notes) {
  return {
    id: id,
    name: name,
    origin: origin,
    notes: parseNotes(notes)
  };
}

// Only public-domain melodies are transcribed here. No third-party recordings,
// MIDI files, lyrics, or modern arrangements are bundled with the game.
var SONGS = [
  song(
    'frere-jacques',
    '两只老虎',
    'Traditional French melody, documented in the 18th century',
    'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 ' +
    'G4 A4 G4 F4 E4 C4 G4 A4 G4 F4 E4 C4 C4 G3 C4:2 C4 G3 C4:2'
  ),
  song(
    'twinkle-twinkle',
    '小星星',
    'Traditional French melody, published in the 18th century',
    'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 ' +
    'G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 ' +
    'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2'
  ),
  song(
    'ode-to-joy',
    '欢乐颂',
    'Ludwig van Beethoven, Symphony No.9, 1824',
    'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 ' +
    'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2'
  ),
  song(
    'jingle-bells',
    '铃儿响叮当',
    'James Lord Pierpont, The One Horse Open Sleigh, 1857',
    'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4 D4 E4:3 ' +
    'F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4:2 G4:2'
  ),
  song(
    'auld-lang-syne',
    '友谊地久天长',
    'Traditional Scottish melody, published before 1800',
    'G4 C5:1.5 C5:0.5 C5 E5:1.5 D5:0.5 C5 D5 E5 C5 C5 E5 ' +
    'G5:2 A5:1.5 A5:0.5 G5 E5:1.5 D5:0.5 C5 D5 E5 D5 C5:1.5 A4:0.5 G4:2'
  ),
  song(
    'fur-elise',
    '致爱丽丝',
    'Ludwig van Beethoven, WoO 59, first published 1867',
    'E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 C4 E4 A4 B4:2 ' +
    'E4 G#4 B4 C5:2 E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 C4 E4 A4 B4:2'
  ),
  song(
    'brahms-lullaby',
    '勃拉姆斯摇篮曲',
    'Johannes Brahms, Wiegenlied Op.49 No.4, 1868',
    'G4 G4 B4:2 G4 G4 B4:2 G4 B4 E5 D5 C5 C5 B4:2 ' +
    'F#4 G4 A4 F#4 F#4 G4 A4:2 F#4 A4 D5 C5 B4 D5:2 G4 G4 B4:2'
  ),
  song(
    'rondo-alla-turca',
    '土耳其进行曲',
    'Wolfgang Amadeus Mozart, Piano Sonata K.331, circa 1783',
    'B4 A4 G#4 A4 C5:2 D5 C5 B4 C5 E5:2 F5 E5 D#5 E5 B5 A5 G#5 A5 ' +
    'B5 A5 G#5 A5 C6:2 A5 C6 B5 A5 G#5 A5 B5 G#5 E5:2'
  ),
  song(
    'london-bridge',
    '伦敦桥',
    'Traditional English nursery melody',
    'G4 A4 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 ' +
    'G4 A4 G4 F4 E4 F4 G4:2 D4 G4 E4 C4:2 E4 F4 G4:2'
  ),
  song(
    'row-your-boat',
    '划船歌',
    'Traditional American nursery melody, published in the 19th century',
    'C4:1.5 C4:0.5 C4 D4 E4:2 E4 D4 E4 F4 G4:3 ' +
    'C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 E4:0.5 E4:0.5 E4:0.5 ' +
    'C4:0.5 C4:0.5 C4:0.5 G4 F4 E4 D4 C4:3'
  )
];

function getSongForLevel(levelNumber) {
  var level = Math.max(1, Math.floor(Number(levelNumber) || 1));
  if (level < 2) {
    return null;
  }
  return SONGS[(level - 2) % SONGS.length];
}

function getNoteForClear(levelNumber, melodyStep) {
  var songForLevel = getSongForLevel(levelNumber);
  var step = Math.floor(Number(melodyStep) || 0);
  if (!songForLevel || step < 1) {
    return null;
  }
  var index = (step - 1) % songForLevel.notes.length;
  var note = songForLevel.notes[index];
  return {
    songId: songForLevel.id,
    songName: songForLevel.name,
    noteIndex: index,
    name: note.name,
    beats: note.beats,
    frequency: note.frequency,
    duration: note.duration
  };
}

module.exports = {
  SONGS: SONGS,
  PLAYBACK_PITCH_MULTIPLIER: PLAYBACK_PITCH_MULTIPLIER,
  noteFrequency: noteFrequency,
  getSongForLevel: getSongForLevel,
  getNoteForClear: getNoteForClear
};
