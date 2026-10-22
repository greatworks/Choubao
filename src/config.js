'use strict';

var COLORS = {
  ink: '#172044',
  inkSoft: '#556082',
  white: '#ffffff',
  panel: '#f6f8ff',
  panelSoft: '#e7ecfb',
  blue: '#69a8ff',
  blueDeep: '#2c72c7',
  mint: '#5fe0bd',
  green: '#74dc35',
  yellow: '#ffe84a',
  orange: '#ff9438',
  pink: '#f66ba6',
  red: '#ef4f4f',
  purple: '#8d82ff',
  navy: '#111832',
  gray: '#9aa2b8'
};

var ARROW_COLORS = [
  '#df4c7b',
  '#347fca',
  '#3a9b68',
  '#d08a25',
  '#745ac2',
  '#239f98',
  '#d85f48',
  '#577dc1'
];

var GAME = {
  maxLives: 3,
  startCoins: 80,
  wrongTapPenaltySeconds: 10,
  clearRewardBase: 12,
  reviveSeconds: 60,
  saveKey: 'nigechoubao_save_v1',
  legacySaveKeys: ['jianbujian_save_v1'],
  levelSeedBase: 73129,
  maxGeneratedLevel: 1000
};

var AD_UNITS = {
  // 正式发布前确认广告位均属于 project.config.json 中的 AppID 并已启用。
  rewarded: 'adunit-b34d1db377bfc884',
  interstitial: 'adunit-bc7a763c18729ec1',
  banner: 'adunit-be89a822073954b0'
};

var SOCIAL = {
  // 云环境不可用时好友挑战仍可通过分享参数运行，但不会记录云端回流数据。
  cloudEnvId: 'cloud1-d2gbc894g3d389b9d',
  cloudFunctionName: 'social',
  fallbackShareImage: 'assets/icon/choubao-mascot-288.png',
  levelRankKey: 'cblevel',
  dailyRankKey: 'choubao_daily_best_ms',
  officialScoreKey: 'choubao_daily_speed'
};

var PROP_DEFS = {
  eraser: {
    id: 'eraser',
    name: '擦除',
    shortName: '擦除',
    icon: 'eraser',
    adReward: 1
  },
  wand: {
    id: 'wand',
    name: '魔法棒',
    shortName: '魔法',
    icon: 'wand',
    adReward: 1
  },
  hint: {
    id: 'hint',
    name: '提示',
    shortName: '提示',
    icon: 'bulb',
    adReward: 1
  },
  grid: {
    id: 'grid',
    name: '网格线',
    shortName: '网格',
    icon: 'grid',
    adReward: 1
  }
};

var DIRS = {
  up: { id: 'up', dr: -1, dc: 0, angle: -Math.PI / 2 },
  right: { id: 'right', dr: 0, dc: 1, angle: 0 },
  down: { id: 'down', dr: 1, dc: 0, angle: Math.PI / 2 },
  left: { id: 'left', dr: 0, dc: -1, angle: Math.PI }
};

var DIR_LIST = [DIRS.up, DIRS.right, DIRS.down, DIRS.left];

module.exports = {
  COLORS: COLORS,
  ARROW_COLORS: ARROW_COLORS,
  GAME: GAME,
  AD_UNITS: AD_UNITS,
  SOCIAL: SOCIAL,
  PROP_DEFS: PROP_DEFS,
  DIRS: DIRS,
  DIR_LIST: DIR_LIST
};
