'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { presence, deriveMode, nextMorning, inWindow, decideQuestion, garageDecision } = require('../lib/policy');
const { defaults, validate } = require('../lib/config');

test('Known mixed sleeping status stays known without treating unknown or stale people as awake',()=>{
  const c=defaults();c.people.presence=['a','b'];c.people.night=['a','b'];const now=1000000;
  const people={a:{present:true,asleep:true,observedAt:now},b:{present:true,asleep:false,observedAt:now}};
  assert.equal(presence(c,people,now).sleepKnown,true);assert.equal(presence(c,people,now).nobodyAsleep,false);
  people.b.asleep=null;assert.equal(presence(c,people,now).sleepKnown,false);
  people.b.present=false;assert.equal(presence(c,people,now).sleepKnown,true);
  people.b.observedAt=now-121000;assert.equal(presence(c,people,now).sleepKnown,false);
  people.b.observedAt=now;people.b.present=null;assert.equal(presence(c,people,now).sleepKnown,false);
});

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

test('Automatisk nattmodus starter med en gang ved ja, men venter til fristen uten svar', () => {
  const q = { recipients: ['a', 'b'], answers: {}, deadline: 100, rule: 'auto-no-answer' };
  for (const answers of [{}, { a: 'yes' }, { a: 'yes', b: 'yes' }]) {
    q.answers = answers;
    assert.equal(decideQuestion(q, 99), answers.a==='yes'?'yes':null);
    assert.equal(decideQuestion(q, 100), 'yes');
    assert.equal(decideQuestion(q, 101), 'yes');
  }
});

test('Ett eksplisitt nei avbryter også automatisk nattmodus før fristen', () => {
  const q = { recipients: ['a', 'b'], deadline: 100, rule: 'auto-no-answer' };
  for (const answers of [{ a: 'no' }, { a: 'yes', b: 'no' }]) {
    q.answers = answers;
    assert.equal(decideQuestion(q, 1), 'no');
    assert.equal(decideQuestion(q, 100), 'no');
  }
  q.decided = 'no';
  assert.equal(decideQuestion(q, 100), null);
});

test('Automatisk nattmodus godtar ikke tom mottakerliste eller bare mislykkede spørsmål', () => {
  const q = { recipients: [], answers: {}, deadline: 100, rule: 'auto-no-answer' };
  assert.equal(decideQuestion(q, 99), null);
  assert.equal(decideQuestion(q, 100), 'no');
  q.recipients = ['a', 'b'];
  for (const answers of [{ a: 'error' }, { a: 'error', b: 'error' }]) {
    q.answers = answers;
    assert.equal(decideQuestion(q, 100), 'no');
  }
  q.answers = { a: 'yes', b: 'error' };
  assert.equal(decideQuestion(q, 99), 'yes');
  assert.equal(decideQuestion(q, 100), 'yes');
});

test('Svar fra personer utenfor mottakerlisten påvirker ikke nattspørsmålet', () => {
  const q = { recipients: ['a'], answers: { outsider: 'no' }, deadline: 100, rule: 'auto-no-answer' };
  assert.equal(decideQuestion(q, 100), 'yes');
  q.recipients = [];
  q.answers = { outsider: 'yes' };
  assert.equal(decideQuestion(q, 99), null);
  assert.equal(decideQuestion(q, 100), 'no');
});

test('Eksisterende nattregler beholder kravene til ja-svar ved fristen', () => {
  const q = { recipients: ['a', 'b'], answers: {}, deadline: 100 };
  for (const rule of ['veto', 'all-yes']) {
    q.rule = rule;
    assert.equal(decideQuestion(q, 100), 'no');
    q.answers = { a: 'yes' };
    assert.equal(decideQuestion(q, 100), rule === 'veto' ? 'yes' : 'no');
    q.answers = { a: 'yes', b: 'yes' };
    assert.equal(decideQuestion(q, 99), null);
    assert.equal(decideQuestion(q, 100), 'yes');
    q.answers = {};
  }
});
test('Port krever kjent status og bekreftet våkent hus, uavhengig av temperatur', () => {
  const good = { open: true, temperature: 6, temperatureFresh: true, nobodyAsleep: true, validated: true, commandType: 'pulse' };
  assert.equal(garageDecision(good), null);
  for(const temperature of [-20,0,5,null,undefined])assert.equal(garageDecision({...good,temperature,temperatureFresh:false}),null);
  for (const bad of [{ open: null }, { open: false }, { nobodyAsleep: false }, { validated: false }]) assert.ok(garageDecision({ ...good, ...bad }));
});
test('Konfigurasjon avviser utrygg port og direkte låsehandling', () => {
  const c = defaults(); c.security.garage.enabled = true; assert.throws(() => validate(c), /Portstyring/);
  c.security.garage.enabled = false;
  c.routines[0].actions.push({ id: 'unlock', kind: 'set', category: 'lock', deviceId: 'lock', capability: 'locked', value: false, delaySeconds: 0, onError: 'stop' });
  assert.throws(() => validate(c), /sikkerhetsoppsettet/);
});

test('Old garage temperature fields are removed while the closing switch and device choices survive',()=>{
 const c=defaults();Object.assign(c.security.garage,{enabled:true,validated:true,statusDeviceId:'port',statusCapability:'alarm_contact',commandDeviceId:'relay',commandCapability:'onoff',temperatureDeviceId:'weather',temperatureCapability:'measure_temperature',maxAgeSeconds:600});
 const migrated=validate(c);assert.equal(migrated.security.garage.enabled,true);assert.equal(migrated.security.garage.commandDeviceId,'relay');
 for(const key of ['temperatureDeviceId','temperatureCapability','maxAgeSeconds'])assert(!Object.hasOwn(migrated.security.garage,key));
 assert.deepEqual(validate(migrated),migrated);
});
