'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { HomeyAdapter, normalizedDevice } = require('../lib/homey-adapter');
const { defaults } = require('../lib/config');
function setup() {
  const config = defaults(); config.observation = false; config.delivery = {notifications:'legacy',questions:'legacy',audio:'legacy'};
  const calls = [], device = { id: 'd', available: true, capabilitiesObj: { onoff: { value: false, type: 'boolean', setable: true } }, setCapabilityValue: async value => calls.push(value) };
  const homey = { flow: { getTriggerCard: () => ({ trigger: async tokens => calls.push(tokens) }) }, notifications: { createNotification: async data => calls.push(data) } };
  const adapter = new HomeyAdapter(homey, () => config);
  adapter.api = { devices: { getDevice: async () => device }, presence: { setAsleep: async data => calls.push(data) } };
  return { config, calls, device, adapter };
}
test('Adapter håndhever observasjon selv om motorens sjekk skulle mangle', async () => {
  const h = setup(); h.config.observation = true;
  for (const effect of [() => h.adapter.set('d', 'onoff', true), () => h.adapter.setAsleep('a', true), () => h.adapter.emit({ kind: 'speak' }), () => h.adapter.timeline('test')]) await assert.rejects(effect, /Observasjonsmodus/);
  assert.deepEqual(h.calls, []);
});
test('Skrivbarhet, type og siste avbrudd sjekkes før enhetskommando', async () => {
  const h = setup(); h.device.capabilitiesObj.onoff.setable = false;
  await assert.rejects(() => h.adapter.set('d', 'onoff', true), /skrivbare/);
  h.device.capabilitiesObj.onoff.setable = true;
  await assert.rejects(() => h.adapter.set('d', 'onoff', 'true'), /feil type/);
  await assert.rejects(() => h.adapter.set('d', 'onoff', true, () => false), /avbrutt/);
  assert.equal(h.calls.length, 0);
});
test('Lyd sendes én gang per handling; varsler én gang per valgt mottaker', async () => {
  const h = setup(); await h.adapter.emit({ kind: 'speak', recipients: ['a', 'b'], text: 'Hei' }); assert.equal(h.calls.length, 1);
  await h.adapter.emit({ kind: 'notify', recipients: ['a', 'b'], text: 'Alarm', notificationType: 'critical' }); assert.equal(h.calls.length, 3); assert.equal(h.calls[1].notification_type, 'critical');
  await assert.rejects(() => h.adapter.emit({ kind: 'notify', recipients: [] }), /Ingen varslingsmottakere/);
});
test('Normalisering bevarer ukjent verdi og manglende tidsstempel', () => {
  const d = normalizedDevice({ id: 'd', capabilitiesObj: { alarm_contact: { value: null, setable: false } } });
  assert.equal(d.capabilities.alarm_contact.value, null); assert.equal(d.capabilities.alarm_contact.updatedAt, null);
});
