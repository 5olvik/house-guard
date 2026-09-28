'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { harness } = require('./helpers');
const api = require('../api');

class FakeDevice {
  constructor() { this.value = null; this.listeners = {}; this.writes = []; this.errors = []; }
  registerCapabilityListener(id, listener) { this.listeners[id] = listener; }
  getCapabilityValue() { return this.value; }
  async setCapabilityValue(id, value) { await this.beforeWrite?.(value); this.value = value; this.writes.push(value); }
  async setAvailable() { this.available = true; }
  async setUnavailable(message) { this.available = false; this.unavailableMessage = message; }
  error(...args) { this.errors.push(args); }
}
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} }, localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, require: id => id === 'homey' ? { App: EventEmitter, Driver: class {}, Device: FakeDevice } : localRequire(id) }, { filename });
  return module.exports;
}
const App = load('app.js'), GuestDevice = load('drivers/guest-mode/device.js'), GuestDriver = load('drivers/guest-mode/driver.js');

function setup(savedGuest = false) {
  const h = harness(c => { c.observation = true; c.security.lockDeviceId = 'lock'; }, { guest: savedGuest });
  h.device('lock', 'locked', false); h.ingest();
  const app = new App(); app.engine = h.engine;
  const savedStates = []; h.engine.persist = state => { savedStates.push(structuredClone(state)); app.publishGuestMode(state.guest); };
  const timers = new Map(), homey = {
    app, __: key => key === 'guest.device_name' ? 'Gjestemodus' : 'Venter på House Guard',
    setInterval: fn => { const id = {}; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id),
  };
  const device = new GuestDevice(); device.homey = homey;
  return { h, app, homey, device, timers, savedStates };
}

test('Paring tilbyr én stabil gjestebryter uten å endre lagret modus', async () => {
  const s = setup(true), driver = new GuestDriver(); driver.homey = s.homey;
  const devices = await driver.onPairListDevices();
  assert.equal(devices.length, 1); assert.equal(devices[0].name, 'Gjestemodus');
  assert.equal(devices[0].data.id, (await driver.onPairListDevices())[0].data.id);
  assert.equal(s.app.getGuestMode(), true); assert.equal(s.h.engine.runs.length, 0);
});

test('Oppstart henter lagret gjestestatus uten å starte gjesterutinen', async () => {
  const s = setup(true); await s.device.onInit();
  assert.equal(s.device.value, true); assert.equal(s.device.available, true);
  assert.equal(s.h.engine.runs.length, 0); assert.equal(s.savedStates.length, 0);
});

test('Enhetsbryteren lagrer gjestemodus én gang og beholder observasjon', async () => {
  const s = setup(); await s.device.onInit();
  await s.device.listeners.onoff(true); await s.device.listeners.onoff(true);
  assert.equal(s.app.getGuestMode(), true); assert.equal(s.savedStates.at(-1).guest, true);
  assert.equal(s.h.engine.runs.filter(r => r.routineId === 'guestNotice').length, 1);
  await s.device.listeners.onoff(false); await s.h.engine.tick();
  assert.equal(s.device.value, false); assert.equal(s.h.engine.config.observation, true);
  assert.deepEqual(s.h.calls, []);
  assert.throws(() => s.app.setGuestMode('true'), /av\/på/);
});

test('Appinnstillinger og eksisterende Flow-kort synkroniserer samme enhet', async () => {
  const s = setup(); await s.device.onInit();
  await api.command({ homey: s.homey, body: { type: 'guest', value: true } }); await s.device.syncQueue;
  assert.equal(s.device.value, true);
  const callbacks = {};
  const card = id => ({ registerRunListener: fn => { callbacks[id] = fn; }, registerArgumentAutocompleteListener: () => {} });
  s.app.homey = { flow: { getActionCard: card, getConditionCard: card, getTriggerCard: card } };
  s.app.registerCards(); await callbacks.set_guest({ enabled: 'false' }); await s.device.syncQueue;
  assert.equal(s.device.value, false); assert.equal(s.app.getGuestMode(), false);
});

test('Raske endringer ender med nyeste gjestestatus selv med treg enhetsskriving', async () => {
  const s = setup(); await s.device.onInit();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  s.device.beforeWrite = async value => { if (value) { entered(); await new Promise(resolve => { release = resolve; }); } };
  const on = s.device.listeners.onoff(true); await started;
  const off = s.device.listeners.onoff(false); release(); await Promise.all([on, off, s.device.syncQueue]);
  assert.equal(s.device.value, false); assert.equal(s.app.getGuestMode(), false);
});

test('Synkroniseringsfeil gjenopprettes av avstemming uten endring av gjestemodus', async () => {
  const s = setup(true); s.device.beforeWrite = async () => { throw new Error('Midlertidig feil'); };
  await s.device.onInit(); assert.equal(s.device.available, false); assert.equal(s.app.getGuestMode(), true);
  s.device.beforeWrite = undefined; await [...s.timers.values()][0]();
  assert.equal(s.device.available, true); assert.equal(s.device.value, true); assert.equal(s.h.engine.runs.length, 0);
});

test('Enhet kan starte før motoren og henter status når motoren blir klar', async () => {
  const s = setup(true), engine = s.app.engine; s.app.engine = undefined;
  await s.device.onInit(); assert.equal(s.device.available, false);
  s.app.engine = engine; s.app.publishGuestMode(true); await s.device.syncQueue;
  assert.equal(s.device.value, true); assert.equal(s.device.available, true);
});

test('Sletting fjerner abonnement og timer uten å slå av gjestemodus', async () => {
  const s = setup(true); await s.device.onInit(); s.device.onDeleted();
  assert.equal(s.app.listenerCount('guest_changed'), 0); assert.equal(s.timers.size, 0);
  assert.equal(s.app.getGuestMode(), true);
  await s.app.setGuestMode(false); await s.device.syncQueue; assert.equal(s.device.value, true);
});
