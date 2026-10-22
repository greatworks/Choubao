'use strict';

var BRAND_NAME = '你个臭宝';

var UI = {
  home: {
    start: '来吧，臭宝',
    tutorial: '先练个小迷宫',
    daily: '今日臭宝局',
    rank: '臭宝榜',
    club: '游戏圈'
  },
  tutorial: {
    coach: '臭宝，先点发光箭头',
    coachSteps: [
      '先点向右的发光直箭',
      '第二根向上，前方没有阻挡',
      '长弯箭会沿自己的路线滑出去',
      '看准箭头方向，连续清空小迷宫'
    ]
  },
  play: {
    normal: '关卡',
    daily: '今日臭宝局',
    official: '臭宝擂台',
    challenge: '好友同图局',
    warmup: '先热个身',
    melodyQuestion: '这是什么歌？',
    melodySpeedHint: '速度越快，旋律越清晰'
  },
  win: {
    normalTitle: '不愧是你，臭宝！',
    challengeBeatTitle: '臭宝反超啦！',
    challengeClearTitle: '同图拿下！',
    dailyTitle: '今日臭宝已通关',
    officialTitle: '臭宝完赛啦',
    next: '臭宝，下一关',
    complete: '全部通关，回主页',
    home: '先回主页',
    share: '叫个臭宝来比一局',
    counterShare: '回敬TA：有本事再来',
    dailyShare: '喊臭宝挑战今日局'
  },
  lose: {
    title: '臭宝，差一点！',
    timeReason: '就差几秒',
    heartReason: '撞得有点猛',
    revive: '我还能抢救一下',
    share: '已老实，臭宝速来帮我',
    restart: '再盘一次'
  },
  invite: {
    rescueTitle: '臭宝喊你来救场',
    duelTitle: '有人点名你了',
    rescueButton: '这残局我来收拾',
    duelButton: '不服，开玩',
    free: '好友同图局 · 不影响主线进度'
  },
  warmup: {
    title: '先教臭宝一招',
    line1: '会让箭头顺路溜出去啦',
    line2: '好友那局还等你去收拾',
    button: '学会了，去会会TA'
  },
  difficultySpike: {
    kicker: '热身结束',
    title: '难度飙升!',
    line1: '第2关开始进入高密箭阵',
    line2: '90%的人会犹豫，你偏要试试？',
    button: '我偏要挑战'
  },
  rank: {
    title: '臭宝好友榜',
    preview: '微信中看看谁最会绕',
    previewHint: '先通关，再来占榜首',
    empty: '还没有臭宝来踢馆',
    share: '分享榜单',
    timelineHint: '右上角也可发朋友圈',
    reminder: '有人反超就喊我',
    reminderOn: '反超提醒已开启'
  },
  prop: {
    introTitle: '首次补给',
    introLine: '每种道具都有1次分享补给',
    introHint: '分享同图挑战后，额度存入账号',
    share: '分享挑战，领取 +1'
  },
  toast: {
    shareUnavailable: '请在微信里喊臭宝',
    gameClubUnavailable: '请在微信中打开游戏圈',
    rankOnPending: '榜单同步失败，请稍后重试',
    rankBlocked: '微信已关闭此类提醒，请在小游戏设置中开启',
    videoIncompleteProp: '完整观看后可领取',
    videoIncompleteRevive: '完整观看后可复活',
    videoUnavailable: '视频暂时无法播放，请稍后再试',
    privacyNeeded: '同意隐私指引后才能使用此功能',
    privacyUnavailable: '隐私指引暂时无法打开，请稍后重试'
  }
};

function number(value, fallback) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resultLevel(result) {
  return Math.max(1, Math.round(number(result && result.level, 1)));
}

function resultRemaining(result) {
  return Math.max(0, Math.round(number(result && result.remaining, 0)));
}

function shareCopy(id, title, cardHeadline, cardPrompt, text) {
  return {
    id: id,
    title: title,
    cardHeadline: cardHeadline,
    cardPrompt: cardPrompt,
    text: text
  };
}

function getDefaultShareCopy() {
  return shareCopy(
    'menu_90_challenge',
    '你个臭宝，90%的人卡在这一关，你来试试？',
    '90%卡在这关',
    '臭宝，点开试一局',
    '密密麻麻的弯箭迷宫，看看你能玩到第几关。'
  );
}

function getRankShareCopy(level) {
  var rankLevel = Math.max(1, Math.round(number(level, 1)));
  return shareCopy(
    'rank_takeover',
    '你个臭宝，好友榜开榜了！能把我从第' + rankLevel + '关挤下去吗？',
    '臭宝榜 等你来抢',
    '点开看看谁排第一',
    '我已经闯到第' + rankLevel + '关，来榜上和我比一比。'
  );
}

function getStuckShareCopy(result) {
  var level = resultLevel(result);
  var remaining = resultRemaining(result);
  var choices = [
    shareCopy(
      'rescue_honest',
      '已老实，你个臭宝速来帮我！还剩' + remaining + '根',
      '已老实 速来帮我',
      '臭宝，点开接手残局',
      '我卡在第' + level + '关，只剩' + remaining + '根，帮我看看先点谁。'
    ),
    shareCopy(
      'rescue_too_hard',
      '这也太难了吧！你个臭宝帮我看先点哪根？',
      '这也太难了吧',
      '只剩' + remaining + '根，来救场',
      '同一个残局原样给你，看看你能不能一眼破局。'
    ),
    shareCopy(
      'rescue_called_out',
      '第' + level + '关把我绕晕了，你个臭宝救一下！',
      '臭宝 快来救场',
      '点开就是我的残局',
      '不用从头玩，直接接手我剩下的' + remaining + '根箭。'
    )
  ];
  return choices[(level + remaining) % choices.length];
}

function getWinShareCopy(result) {
  var level = resultLevel(result);
  var timeText = String(result && result.timeText || '这点时间');
  var combo = Math.max(0, Math.round(number(result && result.combo, 0)));
  var mistakes = Math.max(0, Math.round(number(result && result.mistakes, 0)));
  var runMode = String(result && result.runMode || 'normal');

  if (runMode === 'challenge') {
    if (result && result.beatTarget) {
      return shareCopy(
        'duel_counter_win',
        '你个臭宝，我把你的第' + level + '关反超了，敢再来吗？',
        '反超了 敢再来吗',
        '同一张图，再比一次',
        '你的同图挑战我接住了，现在轮到你回敬。'
      );
    }
    return shareCopy(
      'duel_counter_clear',
      '这局我清了，你个臭宝敢用更少时间吗？',
      '同一局 敢反超吗',
      '臭宝，点开接招',
      '完全相同的箭头布局，比比谁清得更快。'
    );
  }

  if (runMode === 'daily' || runMode === 'official') {
    return shareCopy(
      'daily_speed',
      '今天这局太绕了，你个臭宝能比我快吗？',
      '今日局 敢比快吗',
      '所有人都是同一张图',
      '我用' + timeText + '清空今日迷宫，等你来反超。'
    );
  }

  if (level === 1) {
    return shareCopy(
      'level1_tease',
      '你个臭宝，不会第一关都过不了吧？',
      '第一关都过不了？',
      '点开就会，敢不敢试',
      '第一关很简单，学会让弯箭顺着自己的路溜出去。'
    );
  }

  if (level % 4 === 1) {
    return shareCopy(
      'level_90_challenge',
      '你个臭宝，90%的人卡在第' + level + '关，你来试试？',
      '90%卡在第' + level + '关',
      '点开挑战同一张图',
      '密密麻麻的弯箭迷宫，看看你能不能一次清空。'
    );
  }

  if (mistakes === 0 && combo >= 8) {
    return shareCopy(
      'clean_combo_flex',
      '我一口气清空第' + level + '关，你个臭宝敢不敢来比？',
      combo + '连击 一口气清空',
      '臭宝，少一次撞箭算你赢',
      '我零失误清空了这张图，轮到你挑战同一局。'
    );
  }

  if (level % 3 === 0) {
    return shareCopy(
      'how_far',
      '超难消除游戏，你个臭宝能玩到第几关？',
      '你能玩到第几关',
      '第' + level + '关正在等你',
      '弯箭会像贪吃蛇一样溜出去，看看你能玩多远。'
    );
  }

  if (level % 3 === 2) {
    return shareCopy(
      'too_hard_duel',
      '这也太难了吧！你个臭宝敢挑战第' + level + '关吗？',
      '这也太难了吧',
      '同一张图，不服来比',
      '我已经清空第' + level + '关，点开挑战完全相同的布局。'
    );
  }

  return shareCopy(
    'beat_my_time',
    '我用' + timeText + '清空第' + level + '关，你个臭宝少1秒算你赢',
    '少1秒算你赢',
    '点开挑战同一张图',
    '同样的箭头和顺序，看看你能不能比我更快。'
  );
}

function getShareCopy(result) {
  if (result && result.kind === 'prop') {
    var level = resultLevel(result);
    return shareCopy(
      'prop_invite',
      '你个臭宝，我正被第' + level + '关绕晕，来试试？',
      '这关有点绕',
      '点开挑战同一张图',
      '完全相同的箭头迷宫，看看你会先点哪一根。'
    );
  }
  if (result && result.kind === 'stuck') {
    return getStuckShareCopy(result);
  }
  return getWinShareCopy(result || {});
}

function getClearPraise(streak, combo) {
  var quickStreak = Math.max(1, Math.round(number(streak, 1)));
  var totalCombo = Math.max(1, Math.round(number(combo, 1)));
  if (quickStreak <= 1) {
    var openers = ['哇噻！', '漂亮！', '好眼力！'];
    return { text: openers[(totalCombo - 1) % openers.length], tier: 1 };
  }
  var praise = [
    { text: '牛啊！', tier: 1 },
    { text: '666！', tier: 2 },
    { text: '大神！', tier: 2 },
    { text: '完美！', tier: 3 },
    { text: '满级操作！', tier: 3 },
    { text: '天秀！', tier: 3 },
    { text: '这波太丝滑！', tier: 3 }
  ];
  return praise[Math.min(praise.length - 1, quickStreak - 2)];
}

function getLoseRemainingText(count) {
  return '还剩' + Math.max(0, count || 0) + '根，谁先出去？';
}

function getReviveText(count, reason) {
  var remaining = Math.max(0, Math.round(number(count, 0)));
  if (remaining > 0 && remaining <= 12) {
    return '看视频复活，就差' + remaining + '根';
  }
  return reason === 'time' ? '看视频复活 +60秒' : '看视频复活 +1颗心';
}

function getInviteTarget(challenge) {
  if (challenge && challenge.type === 'rescue') {
    var remaining = Array.isArray(challenge.removedIds) ? challenge.removedIds.length : 0;
    return remaining > 0 ? 'TA已清掉' + remaining + '根，剩下的交给你' : 'TA已老实，等你接手破局';
  }
  if (challenge && challenge.targetMs) {
    return 'TA ' + (challenge.targetMs / 1000).toFixed(1) + '秒，臭宝敢反超吗？';
  }
  return '90%的人过不了，臭宝敢接吗？';
}

module.exports = {
  BRAND_NAME: BRAND_NAME,
  UI: UI,
  getDefaultShareCopy: getDefaultShareCopy,
  getRankShareCopy: getRankShareCopy,
  getShareCopy: getShareCopy,
  getClearPraise: getClearPraise,
  getLoseRemainingText: getLoseRemainingText,
  getReviveText: getReviveText,
  getInviteTarget: getInviteTarget
};
