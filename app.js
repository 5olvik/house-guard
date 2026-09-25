'use strict';
const Homey = require('homey');
const Engine = require('./lib/engine');
const { HomeyAdapter } = require('./lib/homey-adapter');
const { defaults, validate } = require('./lib/config');
const CONFIG_KEY = 'husmodus.config.v1', RUNTIME_KEY = 'husmodus.runtime.v1';

module.exports = class HouseGuard extends Homey.App {
  async onInit() {
    let config;
    try { config = validate(this.homey.settings.get(CONFIG_KEY) || defaults()); }
    catch (error) { config = defaults(); this.error('Ugyldig lagret oppsett – starter i observasjon', error); }
    config.timeZone = this.homey.clock.getTimezone();
    this.adapter = new HomeyAdapter(this.homey, () => this.engine.config);
    this.engine = new Engine({ config, adapter: this.adapter, saved: this.homey.settings.get(RUNTIME_KEY) || {}, persist: state => {
      const json = JSON.stringify(state);
      if (json !== this.lastSaved) { this.homey.settings.set(RUNTIME_KEY, state); this.lastSaved = json; }
      this.publishGuestMode(state.guest);
    } });
    this.publishGuestMode(this.engine.state.guest);
    this.registerCards();
    try { await this.adapter.connect(() => this.scheduleRefresh()); await this.refresh({ initial: true }); }
    catch (error) { this.engine.log(`Tilkobling feilet: ${error.message}`, { result: 'failed' }); }
    const { Heimdall, APP_ID } = require('./lib/heimdall');
    this.heimdall = new Heimdall(this.homey, {
      selected: () => {
        const panel = this.adapter.catalogue.devices[this.engine.config.security.alarmDeviceId];
        return panel?.ownerUri === `homey:app:${APP_ID}` || panel?.driverId?.startsWith(`homey:app:${APP_ID}:`);
      },
      onEvent: async (type, payload) => {
        const generation = this.engine.state.generation, panel = this.engine.config.security.alarmDeviceId, receivedAt = Date.now();
        // Existing detailed flows remain authoritative for their event types.
        if (require('./lib/flow-connections').eventTypes(this.adapter.catalogue).includes(type)) return;
        await this.refresh();
        if (generation !== this.engine.state.generation || panel !== this.engine.config.security.alarmDeviceId || !this.engine.snapshot.connected || this.engine.snapshot.devices[panel]?.available !== true || Date.now() - receivedAt > 10000) return;
        if (['alarm','alarmOff'].includes(type)) return; // Fresh panel state is reconciled by refresh().
        this.engine.event(type, payload);
      },
    });
    await this.heimdall.refresh();
    this.timer = this.homey.setInterval(() => this.engine.tick().catch(this.error), 1000);
    this.reconcileTimer = this.homey.setInterval(() => this.refresh().catch(error => this.engine.log(error.message, { result: 'failed' })), 30000);
    this.log('House Guard startet', config.observation ? 'observasjon' : 'aktiv');
  }
  getGuestMode() {
    if (!this.engine) throw new Error('House Guard starter. Prøv igjen om litt.');
    return this.engine.state.guest;
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
        this.engine.ingest(snapshot, { initial: !!flags.initial, reconnect });
        if (Date.now() - this.adapter.catalogueAt > 300000) await this.adapter.catalog();
        await this.heimdall?.refresh();
      } while (this.refreshAgain);
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async saveConfig(config) {
    config.timeZone = this.homey.clock.getTimezone();
    const checked = validate(config); checked.revision = this.engine.config.revision + 1;
    checked.bridges = require('./lib/bridges').coverage(checked,this.adapter.catalogue).enabled;
    for (const r of checked.routines) for (const a of r.actions) {
      if (a.kind === 'set' && require('./lib/action-safety').protectedWrite(checked,a.deviceId,a.capability,this.adapter.catalogue?.devices?.[a.deviceId])) throw new Error('Bruk sikkerhetsoppsettet for lås, alarm og port');
    }
    this.refreshOptions = { ...this.refreshOptions, reconnect: true };
    this.homey.settings.set(CONFIG_KEY, checked);
    const next = this.engine.updateConfig(checked);
    await this.adapter.subscribe(); await this.refresh({ reconnect: true }); return next;
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
    for (const [id,type] of [['report_alarm_details','alarm'],['report_entry_delay','entryDelay'],['report_sensor_warning','activeSensor']]) {
      this.homey.flow.getActionCard(id).registerRunListener(async payload => { await this.refresh(); this.engine.event(type,payload); return true; });
    }
    this.homey.flow.getActionCard('check_integration_access').registerRunListener(async () => true);
    this.homey.flow.getActionCard('set_mode').registerRunListener(async ({ mode }) => { await this.engine.manual(mode); return true; });
    this.homey.flow.getActionCard('set_guest').registerRunListener(async ({ enabled }) => { this.engine.setGuest(enabled === 'true'); return true; });
    this.homey.flow.getActionCard('skip_night').registerRunListener(async () => { this.engine.skipNight(); return true; });
    const routine = this.homey.flow.getActionCard('start_routine');
    routine.registerArgumentAutocompleteListener('routine', async query => this.engine.config.routines.filter(r => r.name.toLowerCase().includes(query.toLowerCase())).map(r => ({ id: r.id, name: r.name })));
    routine.registerRunListener(async ({ routine: selected }) => { this.engine.start(selected.id); return true; });
    this.homey.flow.getActionCard('integration_event').registerRunListener(async ({ type, zone, reason, seconds }) => {
      await this.refresh(); await this.engine.event(type, { zone, reason, seconds }); return true;
    });
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
    this.heimdall?.close();
    for (const timer of [this.timer, this.reconcileTimer]) if (timer) this.homey.clearInterval(timer);
    if (this.refreshTimer) this.homey.clearTimeout(this.refreshTimer);
    this.engine?.save(); await this.adapter?.close();
  }
};
