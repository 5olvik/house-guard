'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { presence, deriveMode, nextMorning, inWindow, decideQuestion, garageDecision } = require('../lib/policy');
const { defaults, validate } = require('../lib/config');

test('Tomt utvalg, ukjent og utilgjengelig betyr aldri borte', () => {
  const c = defaults(), now = Date.now();
  assert.equal(presence(c, {}, now).allAway, false);
  c.people.presence = ['a'];
  for (const p of [undefined, { present: null }, { present: false, available: false, observedAt: now }, { present: false, observedAt: now - 200000 }]) assert.equal(presence(c, { a: p }, now).allAway, false);
});
test('Natt beregnes blant hjemmeværende; borte person kan være våken', () => {
  const c = defaults(); c.people.presence = ['a', 'b']; c.people.night = ['a', 'b'];
  const p = { a: { present: true, asleep: true, observedAt: 100 }, b: { present: false, asleep: false, observedAt: 100 } };
  assert.equal(deriveMode(presence(c, p, 100)).mode, 'night');
  p.b.present = null; assert.equal(presence(c, p, 100).allHomeAsleep, false);
});
test('Nattvindu over midnatt og korrekt morgen ved begge DST-overganger', () => {
  assert.equal(inWindow(Date.parse('2026-09-21T23:00Z'), 'Europe/Oslo', '22:30', '05:30'), true);
  assert.equal(inWindow(Date.parse('2026-09-21T10:00Z'), 'Europe/Oslo', '22:30', '05:30'), false);
  assert.equal(new Date(nextMorning(Date.parse('2026-03-28T22:00Z'), 'Europe/Oslo', '07:00')).toISOString(), '2026-03-29T05:00:00.000Z');
  assert.equal(new Date(nextMorning(Date.parse('2026-10-24T22:00Z'), 'Europe/Oslo', '07:00')).toISOString(), '2026-10-25T06:00:00.000Z');
  assert.equal(new Date(nextMorning(Date.parse('2026-03-28T22:00Z'), 'Europe/Oslo', '02:30')).toISOString(), '2026-03-29T01:00:00.000Z');
});
test('Nattspørsmål avgjøres ikke før fristen; ett nei har veto', () => {
  const q = { recipients: ['a', 'b'], answers: { a: 'yes' }, deadline: 100, rule: 'veto' };
  assert.equal(decideQuestion(q, 99), null); assert.equal(decideQuestion(q, 100), 'yes');
  q.answers.b = 'no'; assert.equal(decideQuestion(q, 1), 'no');
  q.answers = {}; assert.equal(decideQuestion(q, 100), 'no');
  q.answers = { a: 'error', b: 'error' }; assert.equal(decideQuestion(q, 100), 'no');
  q.answers = { a: 'yes' }; q.rule = 'all-yes'; assert.equal(decideQuestion(q, 100), 'no');
});
test('Port krever kjent status, over 5 grader og bekreftet våkent hus', () => {
  const good = { open: true, temperature: 6, temperatureFresh: true, nobodyAsleep: true, validated: true, commandType: 'pulse' };
  assert.equal(garageDecision(good), null);
  for (const bad of [{ open: null }, { open: false }, { temperature: 5 }, { temperature: null }, { temperatureFresh: false }, { nobodyAsleep: false }, { validated: false }]) assert.ok(garageDecision({ ...good, ...bad }));
});
test('Konfigurasjon avviser utrygg port og direkte låsehandling', () => {
  const c = defaults(); c.security.garage.enabled = true; assert.throws(() => validate(c), /Portstyring/);
  c.security.garage.enabled = false;
  c.routines[0].actions.push({ id: 'unlock', kind: 'set', category: 'lock', deviceId: 'lock', capability: 'locked', value: false, delaySeconds: 0, onError: 'stop' });
  assert.throws(() => validate(c), /sikkerhetsoppsettet/);
});
