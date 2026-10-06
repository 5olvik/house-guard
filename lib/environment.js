'use strict';
const { randomUUID } = require('node:crypto');
const { kind, key, reason, TYPES } = require('./environment-config');

// Fire and water have their own lifecycle. Presence, guest mode, intrusion
// arming delays and intrusion sensor overrides never enter these decisions.
class Environment {
  constructor({ getConfig, adapter, saved = {}, persist = () => {}, log = () => {}, emit = () => {}, clock = Date.now }) {
    this.getConfig = getConfig; this.adapter = adapter; this.persist = persist; this.log = log; this.emit = emit; this.clock = clock;
    this.state = { incidents: structuredClone(saved.incidents || []).slice(-30), batches: structuredClone(saved.batches || []).slice(-30), waterHealth:saved.waterHealth || {} };
    this.readings = new Map(); this.eventTimes = new Map(); this.work = new Set(); this.notifyTails = new Map(); this.generation = 0;
    this.recovered = new Set(this.state.incidents.filter(i => i.active).map(i => i.id));
    this.lastDirectReady = !!this.adapter.direct?.ready;
    for (const batch of this.state.batches) for (const action of batch.actions) {
      if (['pending','sending'].includes(action.status)) {
        action.status = action.status === 'sending' ? 'unknown' : 'cancelled';
        action.detail = 'Appen startet på nytt. Fysiske handlinger gjentas ikke.';
      }
    }
    this.configure();
    this.waterHealth = new (require('./water-health').WaterHealth)({getConfig,clock,saved:this.state.waterHealth,
      persist:state=>{this.state.waterHealth=state;this.save();},alert:notice=>this.queueHealth(notice)});
  }
  ready() { const c = this.getConfig(); return !this.closed && c.environment.enabled && !c.observation; }
  signature() {
    const c = this.getConfig();
    return JSON.stringify([c.environment, c.people.notifications, c.observation, c.security.lockDeviceId]);
  }
  configure() {
    const signature = this.signature();
    if (signature === this.configSignature) return;
    this.configSignature = signature; this.generation++;
    this.waterHealth?.configure();
    const selected = new Set(this.getConfig().environment.sensors.map(key));
    for (const id of this.readings.keys()) if (!selected.has(id)) { this.readings.delete(id); this.eventTimes.delete(id); }
    for (const batch of this.state.batches) for (const action of batch.actions) if (action.status === 'pending') {
      action.status = 'cancelled'; action.detail = 'Varseloppsettet ble endret før sending.';
    }
    // Pending announcements belong to the old settings. A fresh read can
    // confirm a still-active incident; it must not replay device commands.
    for (const incident of this.state.incidents.filter(i => i.active)) {
      this.recovered.add(incident.id);
      delete incident.noticeEvent; delete incident.noticeDueAt;
    }
    this.save();
  }
  save() {
    const active = this.state.incidents.filter(i => i.active), ended = this.state.incidents.filter(i => !i.active).slice(-20);
    this.state.incidents = [...ended, ...active].sort((a, b) => a.startedAt - b.startedAt);
    const unfinished = this.state.batches.filter(b => b.actions.some(a => ['pending','sending','waiting'].includes(a.status)));
    const finished = this.state.batches.filter(b => !unfinished.includes(b)).slice(-20);
    this.state.batches = [...finished, ...unfinished].sort((a, b) => a.at - b.at);
    this.persist(this.state);
  }
  current(type) { return this.state.incidents.find(i => i.active && i.type === type); }
  selected(id, capability) { return this.getConfig().environment.sensors.find(s => s.deviceId === id && s.capability === capability); }
  reading(sensor, device, value) {
    const previous = this.readings.get(key(sensor));
    return { ...sensor, kind: kind(sensor.capability), name: device?.name || previous?.name || 'Sensor',
      zone: device?.zone || previous?.zone || 'Uten rom', available: device?.available !== false && !!device,
      value: typeof value === 'boolean' ? value : null, temperature: device?.capabilities?.measure_temperature?.value ?? null,
      battery: device?.capabilities?.measure_battery?.value ?? null, observedAt: this.clock(),
    };
  }
  observeEvent(id, capability, value, device) {
    this.waterHealth?.observeEvent(id,capability,value,device);
    const sensor = this.selected(id, capability);
    if (!sensor || typeof value !== 'boolean' || this.closed) return;
    this.eventTimes.set(key(sensor), this.clock());
    // A real capability event is a report even when the old device catalogue
    // still says unavailable. A later failed read never clears its alarm.
    const reading = this.reading(sensor, { ...device, available: true }, value);
    this.readings.set(key(sensor), reading); this.process(reading); this.confirmWrites(); this.save();
    this.scheduleTick();
  }
  update(snapshot, { readStartedAt = this.clock() } = {}) {
    if (this.closed) return;
    this.waterHealth?.update(snapshot);
    for (const sensor of this.getConfig().environment.sensors) {
      if ((this.eventTimes.get(key(sensor)) || 0) > readStartedAt) continue;
      const device = snapshot.devices?.[sensor.deviceId], value = device?.capabilities?.[sensor.capability]?.value;
      const reading = this.reading(sensor, device, value);
      if (!snapshot.connected) reading.available = false;
      this.readings.set(key(sensor), reading);
      if (reading.available && typeof value === 'boolean') this.process(reading);
    }
    this.snapshot = snapshot; this.confirmWrites(); this.save(); this.scheduleTick();
  }
  process(reading) {
    let incident = this.current(reading.kind);
    if (reading.value === false) {
      const source = incident?.sensors.find(s => key(s) === key(reading));
      if (!source?.active) return;
      if (incident.noticeEvent === 'started') this.flushIncident(incident);
      source.active = false;
      if (incident.sensors.every(s => !s.active)) {
        incident.active = false; incident.endedAt = this.clock(); delete incident.noticeEvent; delete incident.noticeDueAt;
        this.recovered.delete(incident.id);
        this.log(TYPES[incident.type] + ': sensorene melder ikke lenger alarm.', { result: 'info' });
        if (this.ready()) { this.queue(incident, 'cleared'); this.sendEvent('cleared', incident); }
      }
      return;
    }
    if (reading.value !== true || !this.ready()) return;
    if (!incident) {
      incident = { id: randomUUID(), type: reading.kind, startedAt: this.clock(), active: true, acknowledgedAt: null,
        sensors: [], lastNoticeAt: null, noticeEvent: 'started', noticeDueAt: this.clock() };
      this.state.incidents.push(incident);
      this.log(TYPES[incident.type] + ': ' + reason(reading.capability) + ' fra ' + reading.name + ' · ' + reading.zone, { result: 'info' });
      // Emit after the initial sensor has been added below.
    }
    let source = incident.sensors.find(s => key(s) === key(reading));
    const added = !source || !source.active;
    if (!source) { source = { deviceId: reading.deviceId, capability: reading.capability }; incident.sensors.push(source); }
    Object.assign(source, { name: reading.name, zone: reading.zone, active: true });
    if (added && incident.noticeEvent !== 'started') {
      incident.acknowledgedAt = null; incident.noticeEvent = 'added';
      incident.noticeDueAt = Math.max(this.clock(), (incident.lastNoticeAt || 0) + 5000);
    }
    if (added && incident.sensors.length === 1 && incident.noticeEvent === 'started') this.sendEvent('started', incident);
    if (this.recovered.delete(incident.id) && !incident.noticeEvent &&
        (this.unannounced(incident) || incident.lastNoticeAt === null || this.clock() - incident.lastNoticeAt >= 120000) && !incident.acknowledgedAt) {
      // One fresh confirmation can resume phone notification, never the
      // initial water/lock/lights/Flow actions after a restart.
      incident.noticeEvent = 'resumed'; incident.noticeDueAt = this.clock();
    }
  }
  scheduleTick() {
    if (this.tickScheduled) return;
    this.tickScheduled = true;
    queueMicrotask(() => { this.tickScheduled = false; if (!this.closed) this.tick(); });
  }
  tick() {
    if (this.closed) return;
    this.waterHealth?.tick();
    this.confirmWrites();
    const directReady = !!this.adapter.direct?.ready;
    if (directReady && !this.lastDirectReady) for (const incident of this.state.incidents.filter(i => i.active)) if (this.unannounced(incident)) this.recovered.add(incident.id);
    this.lastDirectReady = directReady;
    for (const incident of this.state.incidents.filter(i => i.active)) {
      if (this.ready() && directReady && this.recovered.has(incident.id) && !incident.noticeEvent && !incident.acknowledgedAt && this.freshActive(incident) && this.unannounced(incident)) {
        this.recovered.delete(incident.id); incident.noticeEvent = 'resumed'; incident.noticeDueAt = this.clock();
      }
      if (this.ready() && incident.noticeEvent && incident.noticeDueAt <= this.clock()) this.flushIncident(incident);
      const r = this.getConfig().environment.responses[incident.type];
      if (this.ready() && !incident.noticeEvent && r.repeatEnabled && !incident.acknowledgedAt &&
          incident.lastNoticeAt !== null && this.clock() - incident.lastNoticeAt >= r.repeatSeconds * 1000 && this.freshActive(incident)) {
        this.queue(incident, 'repeated');
      }
    }
    this.save();
  }
  freshActive(incident) {
    return incident.sensors.some(sensor => {
      const reading = this.readings.get(key(sensor));
      return sensor.active && !!this.selected(sensor.deviceId,sensor.capability) && reading?.available && reading.value === true && this.clock() - reading.observedAt <= 60000;
    });
  }
  unannounced(incident) {
    const texts = this.state.batches.filter(b => b.incidentId === incident.id && b.event !== 'cleared')
      .flatMap(b => b.actions).filter(a => a.kind === 'notify' && a.notificationType !== 'image');
    return texts.length > 0 && texts.every(a => !a.sentAt && ['failed','cancelled'].includes(a.status));
  }
  flushIncident(incident) {
    const event = incident.noticeEvent; delete incident.noticeEvent; delete incident.noticeDueAt;
    if (event && this.ready()) this.queue(incident, event);
  }
  context(incident) {
    const sources = incident.sensors.filter(s => s.active), sensors = sources.length ? sources : incident.sensors;
    return { id: incident.id, type: incident.type, zone: [...new Set(sensors.map(s => s.zone))].join(', '),
      sensorName: [...new Set(sensors.map(s => s.name))].join(', '), reason: [...new Set(sensors.map(s => reason(s.capability)))].join(', ') };
  }
  expand(text, context) {
    return String(text).replace(/\{(type|zone|sensorName|reason)\}/g, (_, name) => name === 'type' ? TYPES[context.type] : context[name] || '');
  }
  actions(incident, event) {
    const config = this.getConfig(), r = config.environment.responses[incident.type], context = this.context(incident);
    const text = event === 'cleared' ? 'House Guard: ' + TYPES[incident.type] + ' – sensorene melder ikke lenger alarm. ' + context.zone : this.expand(r.text, context);
    const actions = [], add = (kind, fields = {}) => actions.push({ id: randomUUID(), kind, ...fields, status: 'pending' });
    if (event === 'cleared') {
      if (r.restoredPush) add('notify', { text, notificationType: 'normal' });
      if (r.timeline) add('timeline', { text });
      return actions;
    }
    if (r.push) add('notify', { text, notificationType: r.critical ? 'critical' : 'normal' });
    if (r.timeline && event !== 'repeated') add('timeline', { text });
    if (event !== 'repeated' || r.imageOnRepeat) for (const imageDeviceId of r.imageDeviceIds) add('notify', { text, notificationType: 'image', imageDeviceId });
    if (event === 'started') {
      for (const audio of r.audio) add(audio.kind, { deviceId: audio.deviceId, volume: audio.volume, text: this.expand(audio.text, context) });
      for (const deviceId of r.lights) add('set', { deviceId, capability: 'onoff', value: true, category: 'lights' });
      for (const flow of r.flows) add('flow', { flowId: flow.flowId, flowType: flow.flowType });
      if (incident.type === 'water' && r.shutoff.enabled && r.shutoff.validated) add('set', { deviceId: r.shutoff.deviceId, capability: 'onoff', value: false, category: 'other', control: 'water' });
      if (incident.type === 'fire' && r.unlockDoor && config.security.lockDeviceId) add('set', { deviceId: config.security.lockDeviceId, capability: 'locked', value: false, category: 'lock', builtin: true, environmentAction: 'fire-unlock' });
    }
    return actions;
  }
  queue(incident, event) {
    if (event !== 'cleared') incident.lastNoticeAt = this.clock();
    const batch = { id: randomUUID(), incidentId: incident.id, type: incident.type, event, at: this.clock(), context: this.context(incident), actions: this.actions(incident, event) };
    const generation = this.generation;
    this.state.batches.push(batch); this.save();
    this.dispatchBatch(batch,generation,incident.type);
  }
  queueHealth(notice) {
    const r=this.getConfig().environment.waterHealth,actions=[];
    if(notice.event==='warning'?r.push:r.restoredPush)actions.push({id:randomUUID(),kind:'notify',text:notice.text,notificationType:notice.event==='warning'&&r.critical?'critical':'normal',status:'pending'});
    if(r.timeline)actions.push({id:randomUUID(),kind:'timeline',text:notice.text,status:'pending'});
    const batch={id:randomUUID(),incidentId:notice.id,type:'water',health:true,event:notice.event,at:this.clock(),context:{id:notice.id,type:'water',zone:notice.zone,sensorName:notice.sensorName,reason:'Kontroll av vannsensorer'},actions};
    this.state.batches.push(batch);this.save();this.dispatchBatch(batch,this.generation,'water-health');
  }
  dispatchBatch(batch,generation,queueKey) {
    const text = batch.actions.filter(a => a.kind === 'notify' && a.notificationType !== 'image');
    const images = batch.actions.filter(a => a.notificationType === 'image');
    const other = batch.actions.filter(a => a.kind !== 'notify');
    // Keep alarm/clear phone messages ordered. Slow cameras never block later
    // text messages, water actions, another hazard or the house routine engine.
    const primary = (this.notifyTails.get(queueKey) || Promise.resolve()).catch(() => {})
      .then(() => Promise.allSettled(text.map(a => this.execute(batch, a, generation))));
    this.notifyTails.set(queueKey, primary);
    const work = Promise.allSettled([
      primary.then(() => Promise.allSettled(images.map(a => this.execute(batch, a, generation)))),
      ...other.map(a => this.execute(batch, a, generation)),
    ]).finally(() => this.work.delete(work));
    this.work.add(work);
  }
  allowed(batch, action, generation) {
    if (!this.ready() || this.generation !== generation) return false;
    if(batch.health)return this.waterHealth.valid(batch.incidentId,batch.event)&&['notify','timeline'].includes(action.kind);
    const incident = this.state.incidents.find(i => i.id === batch.incidentId);
    if (!incident) return false;
    if (batch.event === 'cleared') return !incident.active && !this.current(incident.type);
    if (batch.event === 'repeated' && incident.acknowledgedAt) return false;
    // A brief real alarm still deserves its initial text notification. Stop
    // pending physical actions/images once the sensor alarm has ended.
    return action.kind === 'notify' && action.notificationType !== 'image' && batch.event === 'started' || incident.active;
  }
  async execute(batch, action, generation) {
    if (action.status !== 'pending') return;
    const guard = () => this.allowed(batch, action, generation);
    let dispatched = false;
    const dispatch = () => { dispatched = true; action.status = 'sending'; action.sentAt = this.clock(); this.save(); };
    try {
      if (!guard()) { action.status = 'cancelled'; action.detail = 'Hendelsen eller oppsettet ble endret før sending.'; return; }
      if (['notify','speak','sound','flow'].includes(action.kind) && !this.adapter.direct?.ready) throw Error('API-nøkkel må være klar for direkte varsler, Sonos og Flows.');
      if (action.kind === 'timeline') await this.adapter.timeline(action.text, guard, dispatch);
      else if (['notify','speak','sound'].includes(action.kind)) {
        await this.adapter.emit({ ...action, context: batch.context, recipients: [...this.getConfig().people.notifications] }, guard, dispatch);
      } else if (action.kind === 'flow') await this.adapter.startFlow(action.flowId, action.flowType, guard, dispatch);
      else if (action.kind === 'set') {
        const device = this.snapshot?.devices?.[action.deviceId], cap = device?.capabilities?.[action.capability];
        if (device?.available !== false && cap?.value === action.value) { action.status = 'confirmed'; action.detail = 'Ønsket enhetsstatus er allerede oppnådd.'; return; }
        await this.adapter.set(action.deviceId, action.capability, action.value, guard, dispatch, action);
        action.status = 'waiting'; action.confirmBy = this.clock() + 60000;
        action.detail = action.control === 'water' ? 'AV-kommando akseptert. Ventilposisjon er ikke bekreftet av Homey.' : 'Kommando akseptert. Venter på enhetsstatus.';
        return;
      }
      action.status = 'accepted'; action.detail = action.kind === 'notify' ? 'Akseptert av Homey. Mottak på telefon er ikke bekreftet.' : 'Akseptert av Homey.';
    } catch (error) {
      action.status = dispatched ? 'unknown' : 'failed'; action.detail = String(error.message).slice(0, 500);
      this.log(TYPES[batch.type] + ': ' + action.kind + ' feilet eller har ukjent utfall. ' + action.detail, { result: action.status });
    } finally { this.save(); }
  }
  confirmWrites() {
    for (const batch of this.state.batches) for (const action of batch.actions) if (action.status === 'waiting') {
      const device = this.snapshot?.devices?.[action.deviceId], cap = device?.capabilities?.[action.capability];
      if (device?.available !== false && cap?.value === action.value) {
        action.status = 'confirmed'; action.detail = action.control === 'water' ? 'Homey bekrefter AV på enheten. Ventilposisjon er ikke tilgjengelig.' : 'Enhetsstatus bekreftet av Homey.';
      } else if (this.clock() >= action.confirmBy) {
        action.status = 'unknown'; action.detail = 'Enhetsstatus ble ikke bekreftet. Kommandoen gjentas ikke automatisk.';
        this.log(TYPES[batch.type] + ': ' + action.detail, { result: 'unknown' });
      }
    }
  }
  acknowledge(id) {
    const incident = this.state.incidents.find(i => i.id === id && i.active);
    if (!incident) throw Error('Denne alarmhendelsen er ikke lenger aktiv. Oppdater oversikten.');
    incident.acknowledgedAt = this.clock(); this.save();
    this.log(TYPES[incident.type] + ': varselet er kvittert. Sensoralarm og fysiske røykvarslere avstilles ikke.', { result: 'info' });
    return this.status();
  }
  sendEvent(event, incident) {
    if (!this.ready()) return;
    const generation = this.generation, context = this.context(incident);
    const promise = Promise.resolve().then(() => { if (this.ready() && generation === this.generation) return this.emit(event, context); }).catch(error => {
      this.log('Brann og vann: Flow-hendelse feilet. ' + error.message, { result: 'failed' });
    }).finally(() => this.work.delete(promise));
    this.work.add(promise);
  }
  status() {
    return { enabled: this.getConfig().environment.enabled, observing: !!this.getConfig().observation,
      directReady: !!this.adapter.direct?.ready, sensors: [...this.readings.values()].map(r => ({ ...r })),
      incidents: structuredClone(this.state.incidents), waterHealth:this.waterHealth?.status(), batches: structuredClone(this.state.batches.slice(-10)) };
  }
  async drain() { await Promise.resolve(); while (this.work.size) await Promise.allSettled([...this.work]); }
  close() { this.closed = true; this.generation++; this.waterHealth?.close(); this.save(); }
}
module.exports = Environment;
