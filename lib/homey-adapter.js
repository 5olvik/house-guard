'use strict';
const { HomeyAPI } = require('homey-api');
const { protectedWrite, trustedWrite } = require('./action-safety');
const {ID: ALARM_ID,selected: nativeAlarm} = require('./intrusion');

function normalizedDevice(device, zones = {}) {
  return {
    id: device.id, name: device.name, zone: zones[device.zone]?.name || device.zoneName || device.zone || '',
    // Homey's "plugged in as" choice is the device's effective class (e.g. a socket used as a light).
    available: device.available !== false, class: device.virtualClass || device.class, images: device.images || [], ownerUri: device.ownerUri || '', driverId: device.driverId || '',
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
    this.closed=false;
    this.api = await HomeyAPI.createAppAPI({ homey: this.homey });
    if(!this.direct){this.direct=new (require('./direct-api').DirectApi)(this.homey);await this.direct.initialize();}
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
    const ids = new Set([c.security.alarmDeviceId, c.security.lockDeviceId, c.welcome.doorDeviceId, ...(c.welcome.lightMode==='sunset'?[]:[c.welcome.luxDeviceId])]);
    if(c.morning.motion.enabled)ids.add(c.morning.motion.deviceId);
    const g = c.security.garage; for (const id of [g.statusDeviceId, g.commandDeviceId]) ids.add(id);
    for (const r of require('./guest-presence').activeRoutines(c)) for (const a of r.actions) { if (a.deviceId) ids.add(a.deviceId); if (a.condition?.deviceId) ids.add(a.condition.deviceId); }
    for (const a of require('./alarm-responses').allActions(c)) if(a.deviceId)ids.add(a.deviceId);
    if(nativeAlarm(c))for(const sensor of c.security.intrusion.sensors)ids.add(sensor.deviceId);
    for (const id of require('./environment-config').selectedDevices(c)) ids.add(id);
    return [...ids].filter(Boolean);
  }
  async subscribe() {
    for (const instance of this.instances) instance.destroy(); this.instances = [];
    for (const id of this.selectedDevices().filter(id => !['homey-weather',ALARM_ID].includes(id))) {
      try {
        const device = await this.api.devices.getDevice({ id, $cache: false, $timeout:5000 });
        // makeCapabilityInstance hides connection errors. Await the connection
        // so a missing subscription is visible instead of silently polling.
        await device.connect();
        for (const capability of device.capabilities || []) this.instances.push(device.makeCapabilityInstance(capability, value => { this.onSensor?.(id,capability,value,normalizedDevice(device,this.catalogue.zones));this.onChange(); }));
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
      people: Object.fromEntries(Object.values(people).map(p => [p.id, { id: p.id, name: p.name, athomId: p.athomId, available: p.enabled !== false }])),
      devices: Object.fromEntries(Object.values(devices).map(d => [d.id, normalizedDevice(d, zones)])),
      zones: Object.fromEntries(Object.values(zones).map(z => [z.id, { id: z.id, name: z.name }])),
      flows: [...Object.values(value(2, {})).map(f => ({ id: f.id, name: f.name, type: 'normal', broken: f.broken, enabled: f.enabled, triggerable:f.triggerable })), ...Object.values(value(3, {})).map(f => ({ id: f.id, name: f.name, type: 'advanced', broken: f.broken, enabled: f.enabled, triggerable:f.triggerable }))],
      integrationCards: [...Object.values(value(2, {})).filter(f => f.enabled !== false && !f.broken).flatMap(f => [f.trigger, ...(f.conditions || []), ...(f.actions || [])]), ...Object.values(value(3, {})).filter(f => f.enabled !== false && !f.broken).flatMap(f => Object.values(f.cards || {}))].filter(card => card && /no\.husmodus/.test(card.id || card.uri || '')).map(card => ({ id: card.id, args: card.args || {} })),
      integrationFlows: require('./flow-connections').collect(value(2, {}), value(3, {})),
      errors: result.flatMap((r, i) => r.status === 'rejected' ? [`${['Personer', 'Enheter', 'Flows', 'Advanced Flows', 'Soner'][i]}: ${r.reason.message}`] : []),
      direct: this.direct?.status(),
    };
    this.catalogue.devices['homey-weather'] = await this.weather();
    if(this.intrusion)this.catalogue.devices[ALARM_ID]=this.intrusion.device();
    this.catalogueAt = Date.now(); return this.catalogue;
  }
  async weather() {
    // Homey's weather is the same outdoor source used by the original Flow.
    // Preserve the measurement timestamp; reading cached weather is not a new measurement.
    if (!this.weatherAt || Date.now() - this.weatherAt > 60000) {
      try { this.weatherValue = await this.api.weather.getWeather({ $cache:false, $timeout:5000 }); }
      catch { this.weatherValue = null; }
      this.weatherAt = Date.now();
    }
    const w = this.weatherValue, value = w?.temperatureCelsius, updatedAt = w?.when ? Date.parse(w.when) : null;
    return { id:'homey-weather', name:'Homey vær – utetemperatur', zone:'Utendørs', class:'sensor', available: Number.isFinite(value) && Number.isFinite(updatedAt), weatherText:w?.state || '', capabilities:{ measure_temperature:{ value:Number.isFinite(value) ? value : null, type:'number', title:'Utetemperatur', units:'°C', setable:false, getable:true, updatedAt } } };
  }
  async sunlight(c = this.getConfig()) {
    const unknown=()=>({available:false,observedAt:Date.now()});
    if(!this.direct?.ready)return unknown();
    const {SUNSET,SUNRISE,solarResult}=require('./welcome-lights');
    try {
      // These are Homey's own read-only sun conditions. Their sunrise branch
      // keeps the night period valid after midnight without manual sun times.
      const values=await this.direct.call(api=>Promise.all([SUNSET,SUNRISE].map(id=>api.flow.runFlowCardCondition({id,args:{},state:{},$timeout:3000}))),()=>{
        if(this.closed || this.getConfig().revision!==c.revision)throw Error('Oppsettet ble endret.');
      });
      const [afterSunset,afterSunrise]=values.map(solarResult);
      if(typeof afterSunset!=='boolean' || typeof afterSunrise!=='boolean')return unknown();
      return {available:true,dark:afterSunset || !afterSunrise,observedAt:Date.now()};
    } catch { return unknown(); }
  }
  async checkWelcome(engine,now=Date.now()) {
    const {enabled}=require('./welcome-lights'),c=this.getConfig();
    if(this.closed || !this.api || !engine.started || !enabled(c) || this.checkingWelcome)return;
    const waiting=engine.state.welcomeUntil>engine.clock();
    // Only a small arrival read every five seconds while the house is empty,
    // and the selected welcome sensor every second during its ten-minute window.
    if(!waiting && (engine.facts().someHome || now-(this.welcomeCheckedAt || 0)<5000))return;
    this.welcomeCheckedAt=now;this.checkingWelcome=true;
    try {
      const w=c.welcome,results=await Promise.allSettled([
        this.api.devices.getDevice({id:w.doorDeviceId,$cache:false,$updateCache:false,$timeout:3000}),
        ...(!waiting?[this.api.users.getUsers({$cache:false,$updateCache:false,$timeout:3000})]:[]),
      ]);
      if(this.closed || this.getConfig().revision!==c.revision)return;
      let changed=false;
      if(results[0].status==='fulfilled') {
        const d=results[0].value,value=d.capabilitiesObj?.[w.doorCapability]?.value;
        const before=engine.cap(w.doorDeviceId,w.doorCapability).value;
        if(d.available!==false && typeof value==='boolean' && value!==before){this.onSensor?.(w.doorDeviceId,w.doorCapability,value);changed=true;}
      }
      if(results[1]?.status==='fulfilled') {
        const people=results[1].value;
        changed ||= c.people.presence.some(id=>typeof people[id]?.present==='boolean' && people[id].present!==engine.snapshot.people?.[id]?.present);
      }
      // A poll detects changes; the regular fresh snapshot still validates all
      // presence and action conditions before anything is sent to Homey.
      if(changed)this.onChange?.();
    } finally {this.checkingWelcome=false;}
  }
  async snapshot(c = this.getConfig()) {
    if (!this.api) return { connected: false, people: {}, devices: {} };
    const ids = [...new Set([...c.people.presence, ...c.people.night, ...c.people.questions])];
    const people = {}, devices = {}, zones = {};let sun;
    let successful = 0, failed = 0;
    await Promise.all([
      ...ids.map(async id => {
        try {
          const p = await this.api.users.getUser({ id, $cache: false, $updateCache:false, $timeout:5000 });
          people[id] = { id, name: p.name, available: p.enabled !== false, present: typeof p.present === 'boolean' ? p.present : null, asleep: typeof p.asleep === 'boolean' ? p.asleep : null, observedAt: Date.now() }; successful++;
        } catch { people[id] = { id, name: this.catalogue.people[id]?.name || id, available: false, present: null, asleep: null, observedAt: Date.now() }; failed++; }
      }),
      ...this.selectedDevices(c).filter(id => !['homey-weather',ALARM_ID].includes(id)).map(async id => {
        try { devices[id] = normalizedDevice(await this.api.devices.getDevice({ id, $cache: false, $updateCache:false, $timeout:5000 }), this.catalogue.zones); successful++; }
        catch { devices[id] = { id, name: this.catalogue.devices[id]?.name || id, available: false, capabilities: {} }; failed++; }
      }),
      (async () => { devices['homey-weather'] = await this.weather(); })(),
      ...(c.welcome.lightMode==='sunset' && require('./welcome-lights').enabled(c)?[(async()=>{sun=await this.sunlight(c);})()]:[]),
      ...(c.night.zoneId ? [(async () => {
        try { const z = await this.api.zones.getZone({ id: c.night.zoneId, $cache: false, $timeout:5000 }); zones[z.id] = { id: z.id, name: z.name, active: typeof z.active === 'boolean' ? z.active : null, inactiveSince: z.active === false && z.activeLastUpdated ? Date.parse(z.activeLastUpdated) : null, observedAt: Date.now() }; }
        catch { zones[c.night.zoneId] = { id: c.night.zoneId, active: null, observedAt: Date.now() }; }
      })()] : []),
    ]);
    if(this.intrusion)devices[ALARM_ID]=this.intrusion.device();
    return { people, devices, zones, ...(sun?{sun}:{}), connected: successful > 0 || failed === 0, at: Date.now() };
  }
  authorize(guard) {
    if (this.getConfig().observation) throw new Error('Observasjonsmodus blokkerer sideeffekter');
    if (guard && !guard()) throw new Error('Handlingen ble avbrutt før sending');
  }
  async set(deviceId, capabilityId, value, guard, onDispatch = () => {}, action = {}) {
    if(deviceId===ALARM_ID) {
      if(value!=='disarmed' && this.homey.app?.engine?.state.guest)throw Error('Gjestemodus holder alarmen frakoblet.');
      if(!this.intrusion || !nativeAlarm(this.getConfig()) || !trustedWrite(this.getConfig(),{...action,deviceId,capability:capabilityId,value}))throw Error('Bruk den innebygde alarmstyringen.');
      const snapshot=await this.snapshot();this.authorize(guard);
      if(value==='disarmed' && action.alarmAutomation && this.homey.app?.engine && !this.homey.app.engine.facts(snapshot).residentsSomeHome)throw Error('Automatisk frakobling krever at en beboer er hjemme.');
      if(value==='partially_armed'){
        const engine=this.homey.app?.engine;
        const reason=engine?require('./alarm-presence').armReason(engine,value,snapshot):(!require('./policy').presence(this.getConfig(),snapshot.people || {},Date.now()).anyAsleep || !snapshot.connected?'Nattalarm krever at noen er hjemme og bekreftet sovende.':null);
        if(reason)throw Error(reason);
      }
      onDispatch();this.intrusion.mode(value,snapshot);return;
    }
    const device = await this.api.devices.getDevice({ id: deviceId, $cache: false });
    if(action.manualControl){
      const snapshot=await this.snapshot(),problem=require('./manual-controls').reason(this.getConfig(),snapshot,action);
      if(problem)throw Error(problem);
      const target=action.confirm || action,current=snapshot.devices?.[target.deviceId]?.capabilities?.[target.capability]?.value;
      if(current===target.value)throw Error('Ønsket tilstand er allerede oppnådd. Ingen ny kommando sendt.');
    }
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
  async setAsleep(id, value, guard, onDispatch = () => {}, options = {}) {
    if(this.direct?.configured)return require('./direct-delivery').setAsleep(this,id,value,guard,onDispatch,options);
    return require('./sleep-flows').dispatch(this,id,value,guard,onDispatch,options);
  }
  async preparePresence(ids,value,guard) {
    if(typeof value!=='boolean')throw Error('Tilstedeværelse må være hjemme eller borte.');
    return require('./direct-delivery').preparePresence(this,ids,value,guard);
  }
  async startFlow(id, type, guard, onDispatch = () => {}) {
    this.authorize(guard);
    if (!['normal','advanced'].includes(type)) throw new Error('Ukjent Flow-type');
    const flow = await this.api.flow[type === 'advanced' ? 'getAdvancedFlow' : 'getFlow']({ id, $cache:false });
    if (flow.enabled === false || flow.broken || flow.triggerable === false) throw new Error('Flow er deaktivert, har feil eller kan ikke startes direkte');
    this.authorize(guard);
    if(this.direct?.configured)return this.direct.call(api=>api.flow[type==='advanced'?'triggerAdvancedFlow':'triggerFlow']({id,$timeout:15000}),()=>this.authorize(guard),onDispatch);
    const scenes=require('./scene-flows');
    // Re-read connections before dispatch; a stale catalogue must not start duplicates.
    const [normal,advanced]=await Promise.all([this.api.flow.getFlows({$cache:false}),this.api.flow.getAdvancedFlows({$cache:false})]);
    const catalogue={integrationFlows:require('./flow-connections').collect(normal,advanced)}, connections=scenes.count(catalogue,id,type);
    if(connections>1)throw Error('Flere startkoblinger for samme Flow. Behold én under Mer → Koblinger.');
    if(connections===1)return scenes.dispatch(this,id,type,guard,onDispatch);
    throw Error('Startkobling mangler for valgt Flow. Se Mer → Koblinger.');
  }
  async timeline(text, guard, onDispatch = () => {}) { this.authorize(guard); onDispatch(); return this.homey.notifications.createNotification({ excerpt: text }); }
  async emit(data, guard, onDispatch = () => {}) {
    this.authorize(guard);
    if(this.direct?.configured)return require('./direct-delivery').emit(this,data,guard,onDispatch);
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
    this.closed=true;
    await this.direct?.close();
    for (const instance of this.instances) instance.destroy();
    for (const [manager, name, listener] of this.listeners) manager.removeListener(name, listener);
    for (const manager of [this.api?.devices, this.api?.users, this.api?.zones]) if (manager) await manager.disconnect().catch(() => {});
  }
}
module.exports = { HomeyAdapter, normalizedDevice };
