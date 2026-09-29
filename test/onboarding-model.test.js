'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../settings/onboarding-model');
const Autosave = require('../settings/autosave');
const { defaults } = require('../lib/config');
const alarmDefaults = require('../lib/alarm-automation').defaults;

function fixture() {
  const config = defaults();
  const people = { a: { id:'a', name:'Alex', athomId:'account-a', available:true, present:true, asleep:false } };
  const devices = { door: { id:'door', name:'Ytterdør', available:true, capabilities:{ alarm_contact:{ value:false } } } };
  const data = { catalog:{ people, devices, flows:[], zones:{} }, status:{ connected:true, people, devices, zones:{} }, intrusion:{ mode:'disarmed', target:null, active:false, entryAt:null, exitAt:null } };
  return { config, data };
}
function selectAlarm(config) {
  config.security.alarmDeviceId = 'house-guard-internal-alarm';
  config.security.intrusion.sensors = [{ deviceId:'door', capability:'alarm_contact', full:true, partial:true, delay:true }];
}
function addFlow(config, fields = {}) {
  const action = { id:'flow', kind:'flow', flowId:'lights', flowType:'normal', ...fields };
  config.routines.find(r => r.id === 'away').actions.push(action);
  return action;
}
function check(config, data, id, features) {
  return model.checklist(config, data, features).find(c => c.id === id);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

test('fresh installation infers no optional features and only offers basic steps', () => {
  assert.deepEqual(model.inferFeatures(defaults()), { alarm:false, routines:false, night:false });
  assert.deepEqual(model.steps(), ['features','connection','people','finish']);
  assert.deepEqual(model.steps({ alarm:true, routines:true, night:true }), ['features','connection','people','alarm','routines','night','finish']);
  const { config, data } = fixture();
  assert.equal(check(config, data, 'people').ready, false);
  assert.equal(check(config, data, 'direct-api').required, false);
  assert.equal(check(config, data, 'push-recipients'), undefined);
  assert.equal(check(config, data, 'alarm-full'), undefined);
});

test('feature inference reflects existing setup and ignores retired guest actions', () => {
  const { config } = fixture();
  config.routines.find(r => r.id === 'guestOn').actions.push({ kind:'notify' });
  config.routines.find(r => r.id === 'alarm').actions.push({ kind:'notify' });
  assert.deepEqual(model.inferFeatures(config), { alarm:false, routines:false, night:false });
  addFlow(config); selectAlarm(config); config.people.night = ['a'];
  assert.deepEqual(model.inferFeatures(config), { alarm:true, routines:true, night:true });
  for (const mutate of [c => c.night.automatic = true, c => c.night.wakeArrival = true, c => c.morning.scheduled = true, c => c.morning.motion.enabled = true]) {
    const next = defaults(); mutate(next); assert.equal(model.inferFeatures(next).night, true);
  }
  assert.deepEqual(model.inferFeatures({ people:{}, security:{}, routines:[] }), { alarm:false, routines:false, night:false });
});

test('basic presence can be used without API but unknown or unavailable people cannot pass readiness', () => {
  const { config, data } = fixture(); config.people.presence = ['a'];
  assert.equal(check(config, data, 'people').ready, true);
  assert.equal(check(config, data, 'direct-api').required, false);
  for (const change of [p => p.available = false, p => p.present = null]) {
    const next = structuredClone(data); change(next.status.people.a);
    assert.equal(check(config, next, 'people').ready, false);
  }
  config.people.presence = ['missing'];
  assert.equal(check(config, data, 'people').ready, false);
  data.status.connected = false;
  assert.equal(check(config, data, 'homey').ready, false);
});

test('existing integration dependencies remain required even when omitted from guide choices', () => {
  const none = { alarm:false, routines:false, night:false };
  for (const mutate of [
    c => addFlow(c),
    c => c.people.night = ['a'],
    c => c.night.automatic = true,
    c => c.morning.motion.enabled = true,
    c => c.routines.find(r => r.id === 'home').actions.push({ kind:'person', personId:'a' }),
    c => c.routines.find(r => r.id === 'home').actions.push({ kind:'speak', deviceId:'speaker' }),
    c => c.routines.find(r => r.id === 'home').actions.push({ kind:'notify' }),
    c => { selectAlarm(c); c.security.responses.alarm.audio = [{ kind:'sound', deviceId:'speaker' }]; },
  ]) {
    const { config, data } = fixture(); mutate(config);
    assert.equal(check(config, data, 'direct-api', none).required, true);
    assert.equal(check(config, data, 'direct-api', none).ready, false);
    data.direct = { configured:true, ready:true };
    assert.equal(check(config, data, 'direct-api', none).ready, true);
  }
  const { config, data } = fixture(); addFlow(config); config.routines.find(r => r.id === 'away').enabled = false;
  assert.equal(check(config, data, 'direct-api').required, false);
  assert.equal(check(config, data, 'flow-away-flow'), undefined);
});

test('alarm readiness follows enabled automatic modes, including legacy defaults', () => {
  const { config, data } = fixture(); selectAlarm(config);
  assert.deepEqual(config.security.automation, alarmDefaults());
  config.security.intrusion.sensors[0].partial = false;
  assert.equal(check(config, data, 'alarm-full').ready, true);
  assert.equal(check(config, data, 'alarm-partial').ready, false);
  config.security.automation.night = false;
  assert.equal(check(config, data, 'alarm-partial'), undefined);
  assert.equal(check(config, data, 'alarm-full').ready, true);
  config.security.automation.away = false;
  assert.equal(check(config, data, 'alarm-full').ready, true);
  config.security.intrusion.sensors[0].full = false;
  assert.equal(check(config, data, 'alarm-full').ready, false);
  delete config.security.automation;
  assert.equal(check(config, data, 'alarm-full').required, true);
  assert.equal(check(config, data, 'alarm-partial').required, true);
  config.security.alarmDeviceId = '';
  assert.equal(check(config, data, 'alarm-enabled', { alarm:true }).ready, false);
});

test('alarm sensors need known boolean readings; an active sensor is still allowed', () => {
  const { config, data } = fixture(); selectAlarm(config);
  const sensor = data.status.devices.door;
  sensor.capabilities.alarm_contact.value = true;
  assert.equal(check(config, data, 'alarm-full').ready, true);
  sensor.available = false;
  assert.equal(check(config, data, 'alarm-full').ready, false);
  sensor.available = true; sensor.capabilities.alarm_contact.value = null;
  assert.equal(check(config, data, 'alarm-full').ready, false);
  delete data.status.devices.door;
  assert.equal(check(config, data, 'alarm-full').ready, false);
});

test('test alarm must be idle before activation and checklist never disarms it', () => {
  const { config, data } = fixture(); selectAlarm(config);
  assert.equal(check(config, data, 'alarm-idle').ready, true);
  for (const fields of [{ mode:'armed' }, { target:'partially_armed' }, { active:true }, { entryAt:123 }, { exitAt:123 }]) {
    const next = structuredClone(data); Object.assign(next.intrusion, fields);
    assert.equal(check(config, next, 'alarm-idle').ready, false);
    assert.deepEqual(next.intrusion, { ...data.intrusion, ...fields });
  }
  config.observation = false;
  assert.equal(check(config, data, 'alarm-idle'), undefined);
});

test('push recipients are required only for enabled notification choices and must be deliverable accounts', () => {
  const { config, data } = fixture(); selectAlarm(config);
  assert.equal(check(config, data, 'push-recipients').ready, false);
  config.people.notifications = ['a'];
  assert.equal(check(config, data, 'push-recipients').ready, true);
  delete data.catalog.people.a.athomId;
  assert.equal(check(config, data, 'push-recipients').ready, false);
  config.people.notifications = [];
  Object.values(config.security.responses).forEach(r => { r.push = false; r.critical = true; });
  assert.equal(check(config, data, 'push-recipients'), undefined);
  assert.equal(check(config, data, 'direct-api').required, false);
  config.security.responses.alarm.imageDeviceIds = ['camera'];
  assert.equal(check(config, data, 'push-recipients').required, true);
  assert.equal(check(config, data, 'direct-api').required, true);
});

test('a Flow is ready only when its exact type, availability and direct-start capability are known', () => {
  const { config, data } = fixture(); addFlow(config);
  assert.equal(check(config, data, 'flow-away-flow').ready, false);
  for (const fields of [{ type:'advanced' }, { enabled:false }, { broken:true }, { triggerable:false }, { triggerable:undefined }]) {
    data.catalog.flows = [{ id:'lights', name:'Lys av', type:'normal', enabled:true, triggerable:true, ...fields }];
    assert.equal(check(config, data, 'flow-away-flow').ready, false);
  }
  data.catalog.flows = [{ id:'lights', name:'Lys av', type:'normal', enabled:true, triggerable:true }];
  assert.equal(check(config, data, 'flow-away-flow').ready, true);
});

test('automatic night checks recipients and live zone activity without affecting manual night', () => {
  const { config, data } = fixture(); config.night.automatic = true;
  assert.equal(check(config, data, 'night-questions').ready, false);
  assert.equal(check(config, data, 'night-zone').ready, false);
  config.people.questions = ['a']; config.night.zoneId = 'living'; data.status.zones.living = { active:false };
  assert.equal(check(config, data, 'night-questions').ready, true);
  assert.equal(check(config, data, 'night-zone').ready, true);
  config.night.automatic = false;
  assert.equal(check(config, data, 'night-zone'), undefined);
  assert.equal(check(config, data, 'night-questions'), undefined);
});

test('night setup and scheduled mornings need an available night selection; motion morning alone does not', () => {
  const { config, data } = fixture(); config.people.presence = ['a'];
  const guided = { night:true }, unguided = { night:false };
  assert.equal(check(config, data, 'night-people', guided).required, true);
  assert.equal(check(config, data, 'night-people', guided).ready, false);
  assert.equal(check(config, data, 'night-people', unguided), undefined);
  config.morning.motion.enabled = true;
  assert.equal(check(config, data, 'night-people', unguided), undefined);
  assert.equal(check(config, data, 'night-people', guided), undefined);
  assert.equal(check(config, data, 'night-people'), undefined);
  config.morning.scheduled = true;
  assert.equal(check(config, data, 'night-people', unguided).ready, false);
  config.morning.scheduled = false; config.night.automatic = true;
  assert.equal(check(config, data, 'night-people', unguided).ready, false);
  config.night.automatic = false; config.people.night = ['a'];
  assert.equal(check(config, data, 'night-people', unguided).ready, true);
  data.catalog.people.a.available = false;
  assert.equal(check(config, data, 'night-people', unguided).ready, false);
  data.catalog.people.a.available = true; config.people.night.push('missing');
  assert.equal(check(config, data, 'night-people', unguided).ready, false);
  config.people.night = ['a']; config.people.presence = [];
  assert.equal(check(config, data, 'night-people', unguided).ready, false);
});

test('checklist targets point to settings not editable inside the guide', () => {
  const { config, data } = fixture(); config.night.automatic = true;
  assert.deepEqual(check(config, data, 'night-questions').target, { tab:'people', id:'people-selection' });
  assert.deepEqual(check(config, data, 'night-zone').target, { tab:'routines', id:'night-morning-settings' });
  addFlow(config);
  assert.equal(check(config, data, 'flow-away-flow').target, undefined);
  const action = { id:'custom-flow', kind:'flow', flowId:'missing', flowType:'normal' };
  config.routines.find(r => r.id === 'alarm').actions.push(action);
  config.routines.find(r => r.id === 'welcome').actions.push(action);
  assert.deepEqual(check(config, data, 'flow-alarm-custom-flow').target, { tab:'security', alarmTab:'advanced', id:'alarm-routine-list' });
  assert.deepEqual(check(config, data, 'flow-welcome-custom-flow').target, { tab:'routines', id:'routine-list' });
});

test('complete setup passes required checks; all exports preserve frozen input objects', () => {
  const { config, data } = fixture(); selectAlarm(config); addFlow(config);
  config.people.presence = ['a']; config.people.night = ['a']; config.people.notifications = ['a'];
  data.catalog.flows = [{ id:'lights', type:'normal', enabled:true, triggerable:true }];
  data.direct = { configured:true, ready:true };
  const features = freeze({ alarm:true, routines:true, night:true });
  freeze(config); freeze(data);
  const before = JSON.stringify({ config, data, features });
  model.inferFeatures(config); model.steps(features);
  const checks = model.checklist(config, data, features);
  assert(checks.filter(c => c.required).every(c => c.ready));
  assert(checks.every(c => typeof c.ready === 'boolean' && typeof c.required === 'boolean' && c.id && c.title && c.detail && c.step));
  assert.equal(JSON.stringify({ config, data, features }), before);
});

test('same module is available in browser without Node dependencies', () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../settings/onboarding-model'), 'utf8'), browser);
  assert.equal(typeof browser.HouseGuardOnboarding.checklist, 'function');
  assert.equal(typeof browser.HouseGuardOnboarding.finish, 'function');
  assert.equal(JSON.stringify(browser.HouseGuardOnboarding.inferFeatures(defaults())), JSON.stringify(model.inferFeatures(defaults())));
});

test('finish and continue later preserve nested settings without mutation', () => {
  const config = defaults(); config.people.presence = ['a']; selectAlarm(config); addFlow(config);
  freeze(config);
  for (const observation of [true, false]) {
    const finished = observation ? model.defer(config) : model.finish(config);
    assert.equal(finished.setupCompleted, !observation);
    assert.equal(finished.observation, observation);
    assert.deepEqual(finished, { ...config, setupCompleted:!observation, observation });
    assert.notEqual(finished.people, config.people);
    assert.notEqual(finished.security.intrusion.sensors, config.security.intrusion.sensors);
    finished.people.presence.push('b');
    assert.deepEqual(config.people.presence, ['a']);
  }
  assert.equal(config.setupCompleted, false);
  assert.equal(config.observation, true);
});

test('continuing later after a transient activation failure never retries the old activation choice', async () => {
  let remote = defaults(), writes = 0;
  const accepted = [];
  const autosave = Autosave.create({
    initial:remote,
    read:async () => structuredClone(remote),
    write:async next => {
      if (++writes === 1) throw new Error('Midlertidig nettverksfeil');
      remote = { ...structuredClone(next), revision:remote.revision + 1 };
      accepted.push(structuredClone(remote));
      return remote;
    },
  });
  let local = model.finish(remote);
  autosave.change(local, true);
  await assert.rejects(autosave.flush(), /Midlertidig nettverksfeil/);
  assert.equal(remote.observation, true);
  assert.equal(local.observation, false);
  local = model.defer(local);
  autosave.change(local, true);
  await autosave.flush();
  assert.equal(writes, 1); // Returning to the saved draft needs no extra write.
  assert.equal(remote.setupCompleted, false);
  assert.equal(remote.observation, true);
  assert(accepted.every(c => c.observation === true));
});
