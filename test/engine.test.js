'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, step, add } = require('./helpers');

test('Siste person drar: én rutine etter 20 sekunder', async () => {
  const h = harness(c => add(c, 'away', [step()])); h.ingest(); h.person('a', false); h.person('b', false); h.ingest(); h.ingest();
  await h.engine.tick(); assert.equal(h.calls.length, 0);
  h.advance(20000); await h.engine.tick(); await h.engine.tick(); assert.deepEqual(h.calls, [['timeline', 'test']]);
});
test('Retur under nedtelling avbryter borterutinen', async () => {
  const h = harness(c => add(c, 'away', [step()])); h.ingest(); h.person('a', false); h.person('b', false); h.ingest(); h.advance(10000); h.person('a', true); h.ingest(); h.advance(30000); await h.engine.tick();
  assert.equal(h.calls.length, 0); assert.ok(h.engine.history.entries.some(e => e.message.startsWith('Bortemodus avbrutt')));
});
test('Retur mellom handlinger og konfigurasjonsendring stopper resten', async () => {
  for (const cause of ['arrival', 'config']) {
    const h = harness(c => { c.delays.away = 0; add(c, 'away', [step('first'), step('later', { delaySeconds: 10 })]); });
    h.ingest(); h.person('a', false); h.person('b', false); h.ingest(); await h.engine.tick();
    if (cause === 'arrival') { h.person('a', true); h.ingest(); } else h.engine.updateConfig(h.config);
    h.advance(10000); await h.engine.tick(); assert.deepEqual(h.calls, [['timeline', 'first']]);
  }
});
test('Fersk lesing før handling blokkerer retur som ennå ikke er mottatt som hendelse', async () => {
  const h = harness(c => add(c, 'away', [step()])); h.ingest(); h.person('a', false); h.person('b', false); h.ingest(); h.advance(20000); h.person('a', true); await h.engine.tick(); assert.equal(h.calls.length, 0);
});
test('Nattankomst endrer bare den ankomnes sovestatus', async () => {
  const h = harness(c => { c.night.wakeArrival = true; c.night.markAsleep = false; }); h.person('a', false); h.person('b', true, true); h.ingest(); h.person('a', true, true); h.ingest(); await h.engine.tick();
  assert.deepEqual(h.calls, [['person', 'a', false]]);
});
test('Manuell natt endrer ikke sovestatus for borte personer', async () => {
  const h = harness(); h.person('b', false); h.ingest(); await h.engine.manual('night'); await h.engine.tick(); assert.deepEqual(h.calls, [['person', 'a', true]]);
});
test('Observasjonsmodus har null sideeffekter for alle handlingstyper', async () => {
  const h = harness(c => { c.observation = true; c.bridges = { notifications: true, audio: true, questions: true }; c.security.alarmDeviceId = 'alarm'; add(c, 'night', [step('notify', { kind: 'notify' }), step('speak', { kind: 'speak', deviceId:'speaker', volume:35 }), step('flow', { kind: 'flow', flowId: 'f', flowType: 'normal' }), step('light', { kind: 'set', deviceId: 'light', capability: 'onoff', value: false })]); });
  h.ingest(); await h.engine.manual('night'); await h.engine.tick(); assert.deepEqual(h.calls, []); assert.ok(h.engine.history.entries.some(e => e.result === 'observed'));
});
test('Nattspørsmål: ja/nei, ja/timeout, timeout/timeout og feil/feil', async () => {
  for (const answers of [['yes', 'no'], ['yes', null], [null, null], ['error', 'error']]) {
    const h = harness(c => { c.night.automatic = true; c.night.markAsleep = false; c.security.alarmDeviceId = 'alarm'; c.bridges.questions = true; add(c, 'night', [step('night')]); });
    h.device('alarm', 'homealarm_state', 'disarmed'); h.ingest(); await h.engine.requestNight(); const q = h.engine.state.question;
    answers.forEach((answer, i) => { if (answer) h.engine.answer(q.id, ['a', 'b'][i], answer); });
    await h.engine.tick(); assert.equal(h.calls.filter(c => c[0] === 'timeline').length, 0);
    h.advance(120000); await h.engine.tick();
    // A configured alarm write is intentionally pending until actually confirmed.
    if (answers[0] === 'yes' && !answers[1]) { assert.equal(q.decided, 'yes'); assert.equal(h.calls.filter(c => c[0] === 'set').length, 1); }
    else assert.equal(h.calls.filter(c => c[0] === 'set').length, 0);
    await h.engine.tick(); assert.ok(h.calls.filter(c => c[0] === 'set').length <= 1);
  }
});
test('Hopp over overlever restart; manuell natt virker fortsatt', async () => {
  const h = harness(); h.ingest(); h.engine.skipNight(); const saved = h.saved();
  const other = harness(c => { c.night.markAsleep = false; add(c, 'night', [step('manual')]); }, saved); other.ingest(); assert.equal(other.engine.state.skipUntil, saved.skipUntil);
  await other.engine.manual('night'); await other.engine.tick(); assert.deepEqual(other.calls, [['timeline', 'manual']]);
  other.advance(saved.skipUntil - other.now()); assert.equal(other.engine.state.skipUntil > other.now(), false);
});
test('Gjestemodus blokkerer per kategori og åpner aldri låsen som standard', async () => {
  const h = harness(c => { c.security.lockDeviceId = 'lock'; add(c, 'guestOn', [step('lights', { category: 'lights' }), step('message', { category: 'notification' })]); }); h.ingest(); h.engine.setGuest(true); await h.engine.tick();
  assert.deepEqual(h.calls, [['timeline', 'message']]);
});
test('Akseptert låsekommando er ikke bekreftet låsestatus', async () => {
  const h = harness(c => { c.security.lockDeviceId = 'lock'; c.security.lockOnArming = true; }); h.device('lock', 'locked', false); h.ingest(); h.engine.event('arming'); await h.engine.tick();
  const a = h.engine.runs.at(-1).actions[0]; assert.equal(a.status, 'waiting');
  h.advance(60000); await h.engine.tick(); assert.equal(a.status, 'unknown'); assert.equal(h.calls.length, 1);
});
test('Port sender én puls; timeout gir ingen ny puls', async () => {
  const h = harness(c => Object.assign(c.security.garage, { enabled: true, validated: true, statusDeviceId: 'contact', statusCapability: 'alarm_contact', commandDeviceId: 'relay', commandCapability: 'onoff', temperatureDeviceId: 'weather' }));
  h.device('contact', 'alarm_contact', true); h.device('weather', 'measure_temperature', 6); h.ingest(); h.engine.event('arming'); h.advance(20000); await h.engine.tick(); h.advance(60000); await h.engine.tick(); await h.engine.tick();
  assert.deepEqual(h.calls, [['set', 'relay', 'onoff', true]]);
});
test('Alarmgjentakelse beholder kontekst og stopper ved avstilling', async () => {
  const h = harness(c => { c.security.alarmDeviceId = 'alarm'; add(c, 'alarm', [step('alert', { text: '{zone}: {reason}' })]); });
  h.device('alarm', 'alarm_heimdall', false); h.ingest(); h.device('alarm', 'alarm_heimdall', true); h.engine.event('alarm', { id: 'alarm1', zone: 'Stue', reason: 'Bevegelse' }); await h.engine.tick(); h.advance(60000); await h.engine.tick();
  assert.deepEqual(h.calls, [['timeline', 'Stue: Bevegelse'], ['timeline', 'Stue: Bevegelse']]);
  h.engine.event('alarmOff'); h.advance(60000); await h.engine.tick(); assert.equal(h.calls.length, 2);
});
test('Restart under alarm gjenbruker kontekst, ikke gamle ankomster', async () => {
  const customize = c => { c.security.alarmDeviceId = 'alarm'; c.security.autoUnlock = true; c.security.lockDeviceId = 'lock'; add(c, 'alarm', [step('alarm', { text: '{zone}: {reason}' })]); };
  const h = harness(customize); h.device('alarm', 'alarm_heimdall', false); h.ingest(); h.device('alarm', 'alarm_heimdall', true); h.engine.event('alarm', { id: 'x', zone: 'Gang', reason: 'Dør' }); await h.engine.tick();
  const other = harness(customize, h.saved()); other.device('alarm', 'alarm_heimdall', true); other.device('alarm', 'homealarm_state', 'disarmed'); other.ingest(); other.advance(60000); await other.engine.tick(); assert.deepEqual(other.calls, [['timeline', 'Gang: Dør']]);
});
test('Restart rekonstruerer kun usendt borterutine etter fersk kontroll', async () => {
  const customize = c => add(c, 'away', [step('away')]); const h = harness(customize); h.ingest(); h.person('a', false); h.person('b', false); h.ingest();
  const other = harness(customize, h.saved()); other.person('a', false); other.person('b', false); other.ingest(); other.advance(20000); await other.engine.tick(); await other.engine.tick(); assert.deepEqual(other.calls, [['timeline', 'away']]);
});
test('Morgen krever hjemme og dedupliserer tidsstart og oppvåkning', async () => {
  const h = harness(c => { c.people.night = []; add(c, 'morning', [step('morning')]); }); h.person('a', false); h.person('b', false); h.ingest(); assert.equal(h.engine.morning('schedule'), false);
  h.person('a', true); h.ingest(); h.engine.morning('wake'); h.engine.morning('schedule'); await h.engine.tick(); assert.deepEqual(h.calls, [['timeline', 'morning']]);
});
test('Opplåsing krever fersk ankomst og bekreftet frakoblet alarm', async () => {
  for (const alarm of ['armed', 'disarmed', null]) {
    const h = harness(c => { c.security.autoUnlock = true; c.security.alarmDeviceId = 'alarm'; c.security.lockDeviceId = 'lock'; }); h.person('a', false); h.device('alarm', 'homealarm_state', alarm); h.ingest(); h.person('a', true); h.ingest(); h.advance(30000); await h.engine.tick();
    assert.equal(h.calls.some(c => c[0] === 'set' && c[2] === 'locked' && c[3] === false), alarm === 'disarmed');
  }
});
test('Avhengighet krever faktisk bekreftelse og endret konfig avbryter', async () => {
  const h = harness(c => { add(c, 'home', [step('light', { kind: 'set', deviceId: 'light', capability: 'onoff', value: false, confirmSeconds: 10 }), step('next', { dependsOn: 'light', requireConfirmed: true })]); });
  h.device('light', 'onoff', true); h.ingest(); h.engine.start('home'); await h.engine.tick(); assert.equal(h.calls.length, 1);
  h.device('light', 'onoff', false); await h.engine.tick(); assert.deepEqual(h.calls.at(-1), ['timeline', 'next']);
});

test('Nattankomnes automatiske våkenstatus starter ikke morgenrutinen', async () => {
  const h = harness(c => { c.night.wakeArrival = true; c.night.markAsleep = false; add(c, 'morning', [step('wrong-morning')]); });
  h.person('a', false, true); h.person('b', true, true); h.ingest(); h.person('a', true, true); h.ingest(); await h.engine.tick();
  h.person('a', true, false); h.ingest(); await h.engine.tick();
  assert.equal(h.calls.some(c => c[0] === 'timeline'), false); assert.equal(h.snapshot.people.b.asleep, true);
});
test('Manuell natt i observasjon overlever uendret fysisk personstatus', async () => {
  const h = harness(c => { c.observation = true; }); h.ingest(); await h.engine.manual('night'); await h.engine.tick(); h.ingest();
  assert.equal(h.engine.state.mode, 'night'); assert.deepEqual(h.calls, []);
});
test('Alarmdetaljer beriker planlagt varsel uten doble kjøringer', async () => {
  const h = harness(c => { c.security.alarmDeviceId = 'alarm'; add(c, 'alarm', [step('alert', { text: '{zone}: {reason}' })]); });
  h.device('alarm', 'alarm_heimdall', false); h.ingest(); h.device('alarm', 'alarm_heimdall', true); h.ingest();
  h.engine.event('alarm', { id: 'actual-id', zone: 'Stue', reason: 'Vindu' }); await h.engine.tick();
  assert.deepEqual(h.calls, [['timeline', 'Stue: Vindu']]); assert.equal(h.engine.state.alarm.id, 'actual-id');
});
test('Ukjent sovestatus blokkerer porten selv når tilstedeværelse er kjent', async () => {
  const h = harness(c => Object.assign(c.security.garage, { enabled: true, validated: true, statusDeviceId: 'port', statusCapability: 'alarm_contact', commandDeviceId: 'relay', commandCapability: 'onoff', temperatureDeviceId: 'weather' }));
  h.person('b', true, null); h.device('port', 'alarm_contact', true); h.device('weather', 'measure_temperature', 12); h.ingest(); h.engine.event('arming'); h.advance(20000); await h.engine.tick(); assert.equal(h.calls.length, 0);
});
test('Observasjon sender heller ikke nattspørsmål', async () => {
  const h = harness(c => { c.observation = true; c.night.automatic = true; c.security.alarmDeviceId = 'alarm'; c.bridges.questions = true; });
  h.device('alarm', 'homealarm_state', 'disarmed'); h.ingest(); await h.engine.requestNight(); assert.equal(h.engine.state.question.decided, 'observed'); assert.deepEqual(h.calls, []);
});
test('Morgenlys krever valgt luxvilkår med fersk måling', async () => {
  for (const [lux, age, expected] of [[14, 0, 1], [15, 0, 0], [10, 601000, 0], [null, 0, 0]]) {
    const h = harness(c => { c.people.night = []; add(c, 'morning', [step('lights', { condition: { deviceId: 'lux', capability: 'measure_luminance', operator: 'lt', value: 15, maxAgeSeconds: 600 } })]); });
    h.device('lux', 'measure_luminance', lux, h.now() - age); h.ingest(); h.engine.morning('schedule'); await h.engine.tick(); assert.equal(h.calls.length, expected);
  }
});
test('Første oppvåkning frakobler bare alarmen og vekker ikke andre', async () => {
  const h = harness(c => { c.security.alarmDeviceId = 'alarm'; add(c, 'morning', [step('scheduled-morning')]); });
  h.person('a', true, true); h.person('b', true, true); h.device('alarm', 'homealarm_state', 'partially_armed'); h.ingest();
  h.person('a', true, false); h.ingest(); await h.engine.tick();
  assert.deepEqual(h.calls, [['set', 'alarm', 'homealarm_state', 'disarmed']]);
  assert.equal(h.snapshot.people.b.asleep, true); assert.equal(h.engine.state.morningKey, '');
});
test('Samtidig oppvåkning og morgen deler en pågående frakobling', async () => {
  const h = harness(c => { c.security.alarmDeviceId = 'alarm'; });
  h.person('a', true, true); h.person('b', true, true); h.device('alarm', 'homealarm_state', 'partially_armed'); h.ingest();
  h.person('a', true, false); h.ingest(); h.engine.morning('schedule'); await h.engine.tick();
  assert.equal(h.calls.filter(call => call[0] === 'set').length, 1);
  assert.equal(h.calls.filter(call => call[0] === 'person').length, 0);
  h.device('alarm', 'homealarm_state', 'disarmed'); h.advance(5000); await h.engine.tick();
  assert.equal(h.calls.filter(call => call[0] === 'set').length, 1);
});
test('Morgenplan kjører ved første gyldige minutt i vårens DST-gap', async () => {
  const h = harness(c => { c.morning.scheduled = true; c.morning.time = '02:30'; c.people.night = []; add(c, 'morning', [step('dst-morning')]); }, {}, '2026-03-29T00:59:00Z');
  h.ingest(); h.advance(60000); await h.engine.tick(); await h.engine.tick(); assert.deepEqual(h.calls, [['timeline', 'dst-morning']]);
});
test('Ja-beslutning starter ikke natt når alarmen er endret under svarfristen', async () => {
  const h = harness(c => { c.night.automatic = true; c.security.alarmDeviceId = 'alarm'; c.bridges.questions = true; });
  h.device('alarm', 'homealarm_state', 'disarmed'); h.ingest(); await h.engine.requestNight(); const q = h.engine.state.question;
  h.engine.answer(q.id, 'a', 'yes'); h.device('alarm', 'homealarm_state', 'armed'); h.advance(120000); await h.engine.tick();
  assert.equal(h.calls.some(c => c[0] === 'set' || c[0] === 'person'), false);
});
test('Feil før sending vises ikke som sendt eller som bekreftelsesventing', async () => {
  const h = harness(c => { c.security.lockDeviceId = 'lock'; c.security.lockOnArming = true; });
  h.adapter.set = async () => { throw new Error('Ikke skrivbar'); }; h.device('lock', 'locked', false); h.ingest(); h.engine.event('arming'); await h.engine.tick();
  assert.equal(h.engine.runs.at(-1).actions[0].status, 'failed'); assert.equal(h.engine.history.entries.some(e => e.result === 'sent'), false);
});
test('Timeout etter faktisk sending gir ukjent utfall og bare tilstandsavlesning', async () => {
  const h = harness(c => { c.security.lockDeviceId = 'lock'; c.security.lockOnArming = true; }); let attempts = 0;
  h.adapter.set = async (id, cap, value, guard, dispatch) => { dispatch(); attempts++; throw new Error('Timeout'); };
  h.device('lock', 'locked', false); h.ingest(); h.engine.event('arming'); await h.engine.tick(); assert.equal(h.engine.runs.at(-1).actions[0].status, 'waiting');
  h.device('lock', 'locked', true); await h.engine.tick(); assert.equal(h.engine.runs.at(-1).actions[0].status, 'confirmed'); assert.equal(attempts, 1);
});
