'use strict';

var cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var database = cloud.database();
var command = database.command;
var challenges = database.collection('choubao_challenges');

function integer(value, fallback, min, max) {
  var parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function cleanId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function publicChallenge(data) {
  return {
    challengeId: data._id,
    level: data.level,
    kind: data.kind,
    targetMs: data.targetMs,
    targetCombo: data.targetCombo,
    targetMistakes: data.targetMistakes,
    copyId: cleanId(data.copyId),
    removedIds: data.removedIds || [],
    attempts: data.attempts || 0,
    wins: data.wins || 0
  };
}

async function createChallenge(openid, data) {
  var id = cleanId(data.challengeId);
  if (!id) {
    throw new Error('invalid challenge id');
  }
  try {
    var existing = await challenges.doc(id).get();
    if (existing && existing.data) {
      return publicChallenge(existing.data);
    }
  } catch (err) {}

  var record = {
    owner: openid,
    level: integer(data.level, 1, 1, 1000),
    kind: data.kind === 'stuck' ? 'stuck' : 'win',
    targetMs: integer(data.targetMs, 0, 0, 3600000),
    targetCombo: integer(data.targetCombo, 0, 0, 999),
    targetMistakes: integer(data.targetMistakes, 0, 0, 999),
    copyId: cleanId(data.copyId),
    removedIds: Array.isArray(data.removedIds) ? data.removedIds.slice(0, 80).map(function (idValue) {
      return integer(idValue, -1, -1, 9999);
    }).filter(function (idValue) { return idValue >= 0; }) : [],
    attempts: 0,
    wins: 0,
    createdAt: database.serverDate(),
    updatedAt: database.serverDate()
  };
  await challenges.doc(id).set({ data: record });
  record._id = id;
  return publicChallenge(record);
}

async function getChallenge(data) {
  var id = cleanId(data.challengeId);
  if (!id) {
    return null;
  }
  var result = await challenges.doc(id).get();
  return result && result.data ? publicChallenge(result.data) : null;
}

async function submitResult(openid, data) {
  var id = cleanId(data.challengeId);
  if (!id) {
    throw new Error('invalid challenge id');
  }
  var cleared = !!data.cleared;
  await challenges.doc(id).update({
    data: {
      attempts: command.inc(1),
      wins: command.inc(cleared ? 1 : 0),
      lastPlayer: openid,
      lastElapsedMs: integer(data.elapsedMs, 0, 0, 3600000),
      lastCombo: integer(data.combo, 0, 0, 999),
      lastMistakes: integer(data.mistakes, 0, 0, 999),
      updatedAt: database.serverDate()
    }
  });
  return { accepted: true };
}

async function getInbox(openid) {
  var result = await challenges.where({ owner: openid }).limit(50).get();
  return (result.data || []).reduce(function (summary, challenge) {
    summary.attempts += challenge.attempts || 0;
    summary.wins += challenge.wins || 0;
    return summary;
  }, { attempts: 0, wins: 0 });
}

exports.main = async function (event) {
  var context = cloud.getWXContext();
  var action = event && event.action;
  var data = event && event.data ? event.data : {};
  if (action === 'createChallenge') {
    return { data: await createChallenge(context.OPENID, data) };
  }
  if (action === 'getChallenge') {
    return { data: await getChallenge(data) };
  }
  if (action === 'submitResult') {
    return { data: await submitResult(context.OPENID, data) };
  }
  if (action === 'getInbox') {
    return { data: await getInbox(context.OPENID) };
  }
  throw new Error('unsupported action');
};
