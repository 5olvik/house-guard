'use strict';
const Homey = require('homey');
const Engine = require('./lib/engine');
const { HomeyAdapter } = require('./lib/homey-adapter');
const { defaults, validate } = require('./lib/config');
const {Intrusion,ID:ALARM_ID,selected:nativeAlarm} = require('./lib/intrusion');
const CONFIG_KEY = 'husmodus.config.v1', RUNTIME_KEY = 'husmodus.runtime.v1';

module.exports = class HouseGuard extends Homey.App {
  async onInit() {
    let config, validStored = false;
    const storedConfig = this.homey.settings.get(CONFIG_KEY);
    try { config = validate(storedConfig || defaults()); validStored = !!storedConfig; }
    catch (error) { config = defaults(); this.error('Ugyldig lagret oppsett – starter i observasjon', error); }
    if (validStored && (!storedConfig.security?.responses || !storedConfig.security?.automation || ['temperatureDeviceId','temperatureCapability','maxAgeSeconds'].some(key=>Object.hasOwn(storedConfig.security.garage || {},key)) || Object.values(storedConfig.security.responses).some(r=>r.imageDeviceIds===undefined || r.imageOnRepeat===undefined))) {
      config.revision++;
      this.homey.settings.set(CONFIG_KEY, config);
    }
    const migrated = !!config.security.alarmDeviceId && config.security.alarmDeviceId !== ALARM_ID;
    if (migrated) {
      config.security.alarmDeviceId = ALARM_ID;
      config.security.intrusion = defaults().security.intrusion;
      config.observation = true;
      config.revision++;
      this.homey.settings.set(CONFIG_KEY, config);
      const previous = this.homey.settings.get(RUNTIME_KEY) || {};
      this.homey.settings.set(RUNTIME_KEY, { guest:!!previous.guest, history:previous.history || [], skipUntil:previous.skipUntil || 0 });
      this.homey.settings.set('houseguard.intrusion.v1', {});
    }
    config.timeZone = this.homey.clock.getTimezone();
    this.adapter = new HomeyAdapter(this.homey, () => this.engine.config);
    this.engine = new Engine({ config, adapter: this.adapter, saved: this.homey.settings.get(RUNTIME_KEY) || {}, persist: state => {
      const json = JSON.stringify(state);
      if (json !== this.lastSaved) { this.homey.settings.set(RUNTIME_KEY, state); this.lastSaved = json; }
      this.publishGuestMode(state.guest);
    } });
    this.publishGuestMode(this.engine.state.guest);
    this.intrusion = new Intrusion({config:this.engine.config,saved:this.homey.settings.get('houseguard.intrusion.v1') || {},
      persist:state=>{const json=JSON.stringify(state);if(json!==this.alarmSaved){this.homey.settings.set('houseguard.intrusion.v1',state);this.alarmSaved=json;}},
      emit:(type,payload)=>{this.engine.snapshot.devices[ALARM_ID]=this.intrusion.device();this.engine.event(type,payload);},
      changed:state=>this.alarmChanged(state)});
    this.adapter.intrusion=this.intrusion;
    this.sensorEvents=[];
    this.adapter.onSensor=(id,capability,value)=>{
      const c=this.engine.config;
      if(nativeAlarm(c) && typeof value==='boolean' && c.security.intrusion.sensors.some(s=>s.deviceId===id && s.capability===capability)) {
        this.sensorEvents.push({id,capability,value,revision:c.revision,at:Date.now()});this.sensorEvents=this.sensorEvents.slice(-200);
      }
    };
    this.registerCards();
    try { await this.adapter.connect(() => this.scheduleRefresh()); await this.refresh({ initial: true }); }
    catch (error) { this.engine.log(`Tilkobling feilet: ${error.message}`, { result: 'failed' }); }
    this.timer = this.homey.setInterval(() => this.engine.tick().catch(this.error), 1000);
    this.reconcileTimer = this.homey.setInterval(() => this.refresh().catch(error => this.engine.log(error.message, { result: 'failed' })), 30000);
    this.alarmTimer = this.homey.setInterval(()=>{if(nativeAlarm(this.engine.config) && (this.intrusion.state.target || this.intrusion.state.entryAt))this.refresh().catch(error=>this.engine.log(error.message,{result:'failed'}));},1000);
    this.log('House Guard startet', config.observation ? 'observasjon' : 'aktiv');
  }
  getGuestMode() {
    if (!this.engine) throw new Error('House Guard starter. Prøv igjen om litt.');
    return this.engine.state.guest;
  }
  getAlarmStatus() {if(!this.intrusion)throw Error('House Guard starter.');return this.intrusion.status();}
  alarmChanged(state) {
    if(this.intrusion)this.engine.snapshot.devices[ALARM_ID]=this.intrusion.device();
    if(state.mode==='disarmed' && !state.target)this.engine.cancel(r=>r.routineId==='arming','Tilkobling avbrutt – ventende handlinger stoppet');
    if(!state.entryAt)this.engine.cancel(r=>r.routineId==='entryDelay','Inngangsforsinkelse avsluttet');
    this.emit('intrusion_changed',state);
  }
  async setAlarmMode(mode) {
    if(!this.intrusion)throw Error('House Guard starter.');
    if(!['disarmed','armed','partially_armed'].includes(mode))throw Error('Ukjent alarmmodus');
    const cancelPending=()=>this.engine.cancel(r=>r.actions.some(a=>a.deviceId===ALARM_ID && ['pending','checking','dispatching','sent','waiting'].includes(a.status)),'Ventende alarmrutine avbrutt ved manuell alarmstyring');
    if(mode==='disarmed') {
      // Disarming must not wait behind a slow device read or a pending arm request.
      this.alarmCommandGeneration=(this.alarmCommandGeneration || 0)+1;
      this.alarmCommands=Promise.resolve();cancelPending();
      this.intrusion.mode(mode,this.engine.snapshot);this.engine.save();
      return this.getAlarmStatus();
    }
    const generation=this.alarmCommandGeneration || 0;
    this.alarmCommands=(this.alarmCommands || Promise.resolve()).catch(()=>{}).then(async()=>{
      if(generation!==(this.alarmCommandGeneration || 0))throw Error('Tilkobling avbrutt ved frakobling.');
      cancelPending();
      const revision=this.engine.config.revision,snapshot=await this.adapter.snapshot();
      if(generation!==(this.alarmCommandGeneration || 0))throw Error('Tilkobling avbrutt ved frakobling.');
      if(revision!==this.engine.config.revision)throw Error('Oppsettet ble endret. Prøv igjen.');
      this.intrusion.mode(mode,snapshot);await this.refresh();return this.getAlarmStatus();
    });return this.alarmCommands;
  }
  async testAlarmSensor(deviceId,capability) {
    const c=this.engine.config;
    if(!nativeAlarm(c) || !c.observation)throw Error('Sensorprøve krever innebygd alarm i observasjonsmodus.');
    if(!c.security.intrusion.sensors.some(s=>s.deviceId===deviceId && s.capability===capability))throw Error('Velg en alarmsensor først.');
    const revision=c.revision,snapshot=await this.adapter.snapshot();
    if(revision!==this.engine.config.revision || !this.engine.config.observation)throw Error('Oppsettet ble endret.');
    const d=snapshot.devices[deviceId];if(!d || d.available===false)throw Error('Sensoren er utilgjengelig.');
    d.capabilities[capability]={...d.capabilities[capability],value:true};this.intrusion.update(snapshot);return this.getAlarmStatus();
  }

  setGuestMode(value) {
    if (!this.engine) throw new Error('House Guard starter. Prøv igjen om litt.');
    this.engine.setGuest(value);
  }
  publishGuestMode(value) {
    if (this.lastPublishedGuest === value) return;
    this.lastPublishedGuest = value;
    this.emit('guest_changed', value);
  }
  subscribeGuestMode(listener) {
    this.on('guest_changed', listener);
    return () => this.removeListener('guest_changed', listener);
  }
  scheduleRefresh() {
    if (this.refreshTimer) return;
    this.refreshTimer = this.homey.setTimeout(() => { this.refreshTimer = null; this.refresh().catch(error => this.engine.log(error.message)); }, 200);
  }
  async refresh(options = {}) {
    // A save/reconnect must also suppress transitions in an already running read.
    this.refreshOptions = { initial: !!(this.refreshOptions?.initial || options.initial), reconnect: !!(this.refreshOptions?.reconnect || options.reconnect) };
    this.refreshAgain = true;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        const revision = this.engine.config.revision;
        if (!this.adapter.api) await this.adapter.connect(() => this.scheduleRefresh());
        const snapshot = await this.adapter.snapshot();
        if (revision !== this.engine.config.revision) { this.refreshOptions.reconnect = true; this.refreshAgain = true; continue; }
        const flags = this.refreshOptions; this.refreshOptions = {};
        const reconnect = !!flags.reconnect || (this.engine.started && !this.engine.snapshot.connected && snapshot.connected);
        if(this.intrusion && nativeAlarm(this.engine.config)) {
          const events=this.sensorEvents.splice(0);
          if(this.intrusion.state.mode!=='disarmed' && !this.intrusion.state.target && !flags.initial && !reconnect)for(const e of events.filter(e=>e.revision===revision && Date.now()-e.at<10000)) {
            const d=snapshot.devices[e.id];if(!d || d.available===false)continue;
            this.intrusion.update({...snapshot,devices:{...snapshot.devices,[e.id]:{...d,capabilities:{...d.capabilities,[e.capability]:{...d.capabilities[e.capability],value:e.value}}}}});
          }
          this.intrusion.update(snapshot);snapshot.devices[ALARM_ID]=this.intrusion.device();
        }
        this.engine.ingest(snapshot, { initial: !!flags.initial, reconnect });
        if (Date.now() - this.adapter.catalogueAt > 300000) await this.adapter.catalog();
      } while (this.refreshAgain);
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async saveConfig(config) {
    config.timeZone = this.homey.clock.getTimezone();
    const checked = validate(config); checked.revision = this.engine.config.revision + 1;
    if (checked.security.alarmDeviceId && checked.security.alarmDeviceId !== ALARM_ID) throw Error('House Guard bruker bare sin egen alarm. Slå på «Bruk House Guard-alarm» under Alarm.');
    this.intrusion?.checkConfig(checked);
    checked.bridges = require('./lib/bridges').coverage(checked,this.adapter.catalogue).enabled;
    for (const a of [...checked.routines.flatMap(r=>r.actions), ...require('./lib/alarm-responses').allActions(checked)]) {
      if (a.kind === 'set' && require('./lib/action-safety').protectedWrite(checked,a.deviceId,a.capability,this.adapter.catalogue?.devices?.[a.deviceId])) throw new Error('Bruk sikkerhetsoppsettet for lås, alarm og port');
    }
    this.refreshOptions = { ...this.refreshOptions, reconnect: true };
    this.homey.settings.set(CONFIG_KEY, checked);
    const next = this.engine.updateConfig(checked);
    this.intrusion?.configure(next);this.sensorEvents=[];
    await this.adapter.subscribe(); await this.refresh({ reconnect: true }); return next;
  }
  async configureApiKey(body) {
    if(!this.adapter.direct)throw Error('Homey-forbindelsen starter. Prøv igjen om litt.');
    if(!body || (!body.check && typeof body.token!=='string'))throw Error('Mangler API-nøkkel.');
    const direct=this.adapter.direct;
    direct.onChange=()=>{
      this.engine.state.generation++;
      this.engine.cancel(()=>true,'Ventende handlinger avbrutt fordi API-forbindelsen ble endret');
      if(this.engine.state.question && !this.engine.state.question.decided)this.engine.state.question.decided='cancelled';
      this.engine.save();
    };
    const result=body.check?await direct.check():await direct.configure(body.token);
    this.adapter.catalogue.direct=result;
    this.engine.log(result.configured?'Direkte API-forbindelse kontrollert. Ingen prøvemeldinger sendt.':'API-nøkkel fjernet. Eksisterende Flow-koblinger brukes igjen.',{result:'info'});this.engine.save();
    return result;
  }
  async setupBridges() {
    if (!this.engine.config.observation) throw new Error('Sett appen i observasjon før integrasjonsflows endres.');
    if (this.settingUpBridges) throw new Error('Integrasjonsoppsett pågår allerede.');
    this.settingUpBridges = true;
    try {
      const config = structuredClone(this.engine.config);
      // Homey app tokens can read flows, but creating them requires an owner's
      // flow-write scope. The local installer uses the existing CLI login.
      await this.adapter.catalog();
      const enabled = require('./lib/bridges').coverage(config,this.adapter.catalogue).enabled;
      const result = { enabled, routes:require('./lib/flow-connections').legacyRoutes(this.adapter.catalogue).length + require('./lib/simple-flows').simpleRoutes(this.adapter.catalogue).length };
      if (this.engine.config.revision !== config.revision) throw new Error('Oppsettet ble endret underveis. Oppdater integrasjonsflows igjen.');
      config.bridges = result.enabled;
      await this.saveConfig(config); await this.adapter.catalog();
      this.engine.log('Integrasjonsflows kontrollert. Ingen prøvemeldinger eller enhetskommandoer sendt.'); this.engine.save();
      return result;
    } finally { this.settingUpBridges = false; }
  }
  registerCards() {
    require('./lib/simple-flows').register(this);
    require('./lib/scene-flows').register(this);
    require('./lib/sleep-flows').register(this);

    this.homey.flow.getActionCard('check_integration_access').registerRunListener(async () => {this.integrationTestCount=(this.integrationTestCount||0)+1;return true;});
    this.homey.flow.getActionCard('set_mode').registerRunListener(async ({ mode }) => { await this.engine.manual(mode); return true; });
    this.homey.flow.getActionCard('set_guest').registerRunListener(async ({ enabled }) => { this.engine.setGuest(enabled === 'true'); return true; });
    this.homey.flow.getActionCard('skip_night').registerRunListener(async () => { this.engine.skipNight(); return true; });
    const routine = this.homey.flow.getActionCard('start_routine');
    routine.registerArgumentAutocompleteListener('routine', async query => this.engine.config.routines.filter(r => r.name.toLowerCase().includes(query.toLowerCase())).map(r => ({ id: r.id, name: r.name })));
    routine.registerRunListener(async ({ routine: selected }) => { this.engine.start(selected.id); return true; });

    this.homey.flow.getActionCard('zone_idle').registerRunListener(async ({ zone_id, minutes }) => {
      await this.refresh(); await this.engine.event('idle', { zoneId: zone_id, minutes }); return true;
    });
    this.homey.flow.getActionCard('night_answer').registerRunListener(async ({ request_id, person_id, answer }) => {
      try { this.engine.answer(request_id, person_id, answer); }
      catch (error) { this.engine.log(`Sent eller ugyldig nattsvar ignorert: ${error.message}`, { result: 'skipped' }); }
      return true;
    });
    this.homey.flow.getConditionCard('delivery_matches').registerRunListener(async (args) => {
      if (!this.engine.validDelivery(args.delivery_id, args.person_id || args.target_id)) return false;
      return args.kind === args.expected_kind && (!args.expected_person || args.person_id === args.expected_person)
        && (!args.expected_target || args.target_id === args.expected_target) && (!args.expected_type || args.notification_type === args.expected_type)
        && (!args.expected_camera || args.camera_id === args.expected_camera) && (!args.expected_text || args.text === args.expected_text);
    });
    this.homey.flow.getActionCard('delivery_result').registerRunListener(async ({ delivery_id, recipient_id, result, detail }) => { this.engine.deliveryResult(delivery_id, result, detail, recipient_id); return true; });
  }
  async onUninit() {
    for (const timer of [this.timer, this.reconcileTimer,this.alarmTimer]) if (timer) this.homey.clearInterval(timer);
    if (this.refreshTimer) this.homey.clearTimeout(this.refreshTimer);
    this.engine?.save(); await this.adapter?.close();
  }
};
