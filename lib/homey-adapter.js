'use strict';
const { HomeyAPI } = require('homey-api');
const { protectedWrite, trustedWrite } = require('./action-safety');

function normalizedDevice(device, zones = {}) {
  return {
    id: device.id, name: device.name, zone: zones[device.zone]?.name || device.zoneName || device.zone || '',
    available: device.available !== false, class: device.class, images: device.images || [], ownerUri: device.ownerUri || '', driverId: device.driverId || '',
    capabilities: Object.fromEntries(Object.entries(device.capabilitiesObj || {}).map(([id, c]) => [id, {
      value: c.value ?? null, type: c.type, setable: c.setable === true, getable: c.getable !== false,
      title: typeof c.title === 'object' ? (c.title.no || c.title.en || id) : (c.title || id),
      units: c.units, min: c.min, max: c.max, values: c.values,
      updatedAt: c.lastUpdated ? Date.parse(c.lastUpdated) : null,
    }])),
  };
}

class HomeyAdapter {
  constructor(homey, getConfig) { this.homey = homey; this.getConfig = getConfig; this.catalogue = { people: {}, devices: {}, flows: [], zones: {} }; this.instances = []; this.listeners = []; this.catalogueAt = 0; }
  async connect(onChange) {
    this.api = await HomeyAPI.createAppAPI({ homey: this.homey });
    this.onChange = onChange;
    for (const [manager, names] of [[this.api.users, ['user.update', 'user.create', 'user.delete']], [this.api.devices, ['device.update', 'device.create', 'device.delete']], [this.api.zones, ['zone.update']]]) {
      try {
        await manager.connect();
        for (const name of names) { const listener = () => onChange(); manager.on(name, listener); this.listeners.push([manager, name, listener]); }
      } catch (error) { this.homey.app.error('Sanntid utilgjengelig; 30-sekunders avstemming brukes', error.message); }
    }
    await this.catalog();
    await this.subscribe();
  }
  selectedDevices(c = this.getConfig()) {
    const ids = new Set([c.security.alarmDeviceId, c.security.lockDeviceId, c.welcome.doorDeviceId, c.welcome.luxDeviceId]);
    const g = c.security.garage; for (const id of [g.statusDeviceId, g.commandDeviceId, g.temperatureDeviceId]) ids.add(id);
    for (const r of c.routines) for (const a of r.actions) { if (a.deviceId) ids.add(a.deviceId); if (a.condition?.deviceId) ids.add(a.condition.deviceId); }
    return [...ids].filter(Boolean);
  }
  async subscribe() {
    for (const instance of this.instances) instance.destroy(); this.instances = [];
    for (const id of this.selectedDevices().filter(id => id !== 'homey-weather')) {
      try {
        const device = await this.api.devices.getDevice({ id, $cache: false });
        for (const capability of device.capabilities || []) this.instances.push(device.makeCapabilityInstance(capability, () => this.onChange()));
      } catch (error) { this.homey.app.error(`Enhet ${id}: ${error.message}`); }
    }
  }
  async catalog() {
    if (!this.api) return this.catalogue;
    const result = await Promise.allSettled([
      this.api.users.getUsers({ $cache: false }), this.api.devices.getDevices({ $cache: false }),
      this.api.flow.getFlows({ $cache: false }), this.api.flow.getAdvancedFlows({ $cache: false }), this.api.zones.getZones({ $cache: false }),
    ]);
    const value = (i, fallback) => result[i].status === 'fulfilled' ? result[i].value : fallback;
    const zones = value(4, {}), people = value(0, {}), devices = value(1, {});
    this.catalogue = {
      people: Object.fromEntries(Object.values(people).map(p => [p.id, { id: p.id, name: p.name, available: p.enabled !== false }])),
      devices: Object.fromEntries(Object.values(devices).map(d => [d.id, normalizedDevice(d, zones)])),
      zones: Object.fromEntries(Object.values(zones).map(z => [z.id, { id: z.id, name: z.name }])),
      flows: [...Object.values(value(2, {})).map(f => ({ id: f.id, name: f.name, type: 'normal', broken: f.broken, enabled: f.enabled })), ...Object.values(value(3, {})).map(f => ({ id: f.id, name: f.name, type: 'advanced', broken: f.broken, enabled: f.enabled }))],
      integrationCards: [...Object.values(value(2, {})).filter(f => f.enabled !== false && !f.broken).flatMap(f => [f.trigger, ...(f.conditions || []), ...(f.actions || [])]), ...Object.values(value(3, {})).filter(f => f.enabled !== false && !f.broken).flatMap(f => Object.values(f.cards || {}))].filter(card => card && /no\.husmodus/.test(card.id || card.uri || '')).map(card => ({ id: card.id, args: card.args || {} })),
      integrationFlows: require('./flow-connections').collect(value(2, {}), value(3, {})),
      errors: result.flatMap((r, i) => r.status === 'rejected' ? [`${['Personer', 'Enheter', 'Flows', 'Advanced Flows', 'Soner'][i]}: ${r.reason.message}`] : []),
    };
    this.catalogue.devices['homey-weather'] = await this.weather();
    this.catalogueAt = Date.now(); return this.catalogue;
  }
  async weather() {
    // Homey's weather is the same outdoor source used by the original Flow.
    // Preserve the measurement timestamp; reading cached weather is not a new measurement.
    if (!this.weatherAt || Date.now() - this.weatherAt > 60000) {
      try { this.weatherValue = await this.api.weather.getWeather({ $cache:false }); }
      catch { this.weatherValue = null; }
      this.weatherAt = Date.now();
    }
    const w = this.weatherValue, value = w?.temperatureCelsius, updatedAt = w?.when ? Date.parse(w.when) : null;
    return { id:'homey-weather', name:'Homey vær – utetemperatur', zone:'Utendørs', class:'sensor', available: Number.isFinite(value) && Number.isFinite(updatedAt), weatherText:w?.state || '', capabilities:{ measure_temperature:{ value:Number.isFinite(value) ? value : null, type:'number', title:'Utetemperatur', units:'°C', setable:false, getable:true, updatedAt } } };
  }
  async snapshot(c = this.getConfig()) {
    if (!this.api) return { connected: false, people: {}, devices: {} };
    const ids = [...new Set([...c.people.presence, ...c.people.night, ...c.people.questions])];
    const people = {}, devices = {}, zones = {};
    let successful = 0, failed = 0;
    await Promise.all([
      ...ids.map(async id => {
        try {
          const p = await this.api.users.getUser({ id, $cache: false });
          people[id] = { id, name: p.name, available: p.enabled !== false, present: typeof p.present === 'boolean' ? p.present : null, asleep: typeof p.asleep === 'boolean' ? p.asleep : null, observedAt: Date.now() }; successful++;
        } catch { people[id] = { id, name: this.catalogue.people[id]?.name || id, available: false, present: null, asleep: null, observedAt: Date.now() }; failed++; }
      }),
      ...this.selectedDevices(c).filter(id => id !== 'homey-weather').map(async id => {
        try { devices[id] = normalizedDevice(await this.api.devices.getDevice({ id, $cache: false }), this.catalogue.zones); successful++; }
        catch { devices[id] = { id, name: this.catalogue.devices[id]?.name || id, available: false, capabilities: {} }; failed++; }
      }),
      (async () => { devices['homey-weather'] = await this.weather(); })(),
      ...(c.night.zoneId ? [(async () => {
        try { const z = await this.api.zones.getZone({ id: c.night.zoneId, $cache: false }); zones[z.id] = { id: z.id, name: z.name, active: typeof z.active === 'boolean' ? z.active : null, inactiveSince: z.active === false && z.activeLastUpdated ? Date.parse(z.activeLastUpdated) : null, observedAt: Date.now() }; }
        catch { zones[c.night.zoneId] = { id: c.night.zoneId, active: null, observedAt: Date.now() }; }
      })()] : []),
    ]);
    return { people, devices, zones, connected: successful > 0 || failed === 0, at: Date.now() };
  }
  authorize(guard) {
    if (this.getConfig().observation) throw new Error('Observasjonsmodus blokkerer sideeffekter');
    if (guard && !guard()) throw new Error('Handlingen ble avbrutt før sending');
  }
  async set(deviceId, capabilityId, value, guard, onDispatch = () => {}, action = {}) {
    const device = await this.api.devices.getDevice({ id: deviceId, $cache: false });
    if (protectedWrite(this.getConfig(), deviceId, capabilityId, device) && !trustedWrite(this.getConfig(), { ...action, deviceId, capability: capabilityId, value })) throw new Error('Lås, alarm og port må styres gjennom sikkerhetsoppsettet');
    const cap = device.capabilitiesObj?.[capabilityId];
    if (device.available === false || !cap || cap.setable !== true) throw new Error('Enheten eller den skrivbare funksjonen mangler');
    if (cap.type && typeof value !== (cap.type === 'enum' ? 'string' : cap.type)) throw new Error('Verdien har feil type');
    if (typeof value === 'number' && (!Number.isFinite(value) || (cap.min !== undefined && value < cap.min) || (cap.max !== undefined && value > cap.max))) throw new Error('Verdien er utenfor enhetens område');
    if (cap.values && !cap.values.some(v => (v.id ?? v) === value)) throw new Error('Verdien er ikke støttet av enheten');
    this.authorize(guard);
    onDispatch();
    await device.setCapabilityValue({ capabilityId, value });
  }
  async setAsleep(id, value, guard, onDispatch = () => {}) { this.authorize(guard); onDispatch(); await this.api.presence.setAsleep({ id, value }); }
  async startFlow(id, type, guard, onDispatch = () => {}) { this.authorize(guard); onDispatch(); return type === 'advanced' ? this.api.flow.triggerAdvancedFlow({ id }) : this.api.flow.triggerFlow({ id }); }
  async timeline(text, guard, onDispatch = () => {}) { this.authorize(guard); onDispatch(); return this.homey.notifications.createNotification({ excerpt: text }); }
  async emit(data, guard, onDispatch = () => {}) {
    this.authorize(guard);
    const recipients = data.kind === 'question' ? [data.personId] : data.kind === 'notify' ? (data.recipients || []) : [''];
    if (!recipients.length) throw new Error('Ingen varslingsmottakere er valgt');
    let dispatched = false;
    for (const personId of recipients) {
      this.authorize(guard);
      if (!dispatched) { onDispatch(); dispatched = true; }
      const simple = require('./simple-flows');
      if (simple.modeFor(this.getConfig(), data.kind) === 'simple') {
        const id = simple.triggerId(data);
        if (!id) throw new Error('Ukjent meldingstype');
        await this.homey.flow.getTriggerCard(id).trigger({ text:String(data.text || ''), ...(['speak','sound'].includes(data.kind) ? {volume:Number(data.volume || 0)} : {}), ...(data.kind === 'question' ? {reply:data.reply} : {}) }, { ...data, personId });
        continue;
      }
      await this.homey.flow.getTriggerCard('delivery_requested').trigger({
        kind: data.kind, text: String(data.text || ''), person_id: personId,
        request_id: data.requestId || '', volume: Number(data.volume || 0), target_id: data.deviceId || '',
        alarm_id: data.context?.id || '', zone: data.context?.zone || '', reason: data.context?.reason || '',
        notification_type: data.notificationType || 'normal', camera_id: data.imageDeviceId || '',
        delivery_id: data.deliveryId || '',
      });
    }
  }
  async close() {
    for (const instance of this.instances) instance.destroy();
    for (const [manager, name, listener] of this.listeners) manager.removeListener(name, listener);
    for (const manager of [this.api?.devices, this.api?.users, this.api?.zones]) if (manager) await manager.disconnect().catch(() => {});
  }
}
module.exports = { HomeyAdapter, normalizedDevice };
