'use strict';
const { randomUUID } = require('node:crypto');
const { validate } = require('./config');
const { presence, deriveMode, localParts, inWindow, nextMorning, decideQuestion, garageDecision } = require('./policy');
const { builtins, action } = require('./plans');
const History = require('./log');
const { protectedWrite, trustedWrite } = require('./action-safety');

const FINISHED = new Set(['confirmed', 'accepted', 'observed', 'failed', 'skipped', 'cancelled', 'unknown']);

class Engine {
  constructor({ config, adapter, saved = {}, persist = () => {}, clock = Date.now }) {
    this.config = validate(config); this.adapter = adapter; this.clock = clock; this.persist = persist;
    this.history = new History(saved.history || [], clock);
    this.state = {
      mode: 'unknown', reason: 'Venter på Homey', guest: !!saved.guest, generation: Number(saved.generation || 0) + 1,
      guestGeneration: Number(saved.guestGeneration || 0), welcomeGuestGeneration: null,
      skipUntil: saved.skipUntil || 0, question: saved.question || null,
      alarm: saved.alarm || null, morningKey: saved.morningKey || '', welcomeUntil: 0,
      lastMorningDate: saved.lastMorningDate || '', manualNight: false,
      motionMorningConsumed: !!saved.motionMorningConsumed,
      integrationEvents: saved.integrationEvents || {}, deliveries: (saved.deliveries || []).slice(-30),
    };
    this.savedRuns = saved.revision === this.config.revision ? (saved.runs || []) : [];
    this.runs = []; this.snapshot = { people: {}, devices: {}, connected: false }; this.started = false; this.ticking = false;
    this.arrivalWakeUntil = {};
    this.state.nextScheduledAt = this.config.morning.scheduled ? nextMorning(this.clock() - 60000, this.config.timeZone, this.config.morning.time) : null;
  }

  facts(snapshot = this.snapshot) { return presence(this.config, snapshot.people || {}, this.clock(), this.state.guest); }
  log(message, details = {}) { return this.history.add(message, details); }
  save() {
    this.persist({ ...this.state, revision: this.config.revision, runs: this.runs, history: this.history.entries });
  }
  status() {
    return { ...this.state, observation: this.config.observation, connected: !!this.snapshot.connected, people: this.snapshot.people,
      devices: this.snapshot.devices, zones: this.snapshot.zones || {}, pending: this.runs.filter(r => !r.cancelled && r.actions.some(a => !FINISHED.has(a.status))),
      history: this.history.entries, question: this.state.question, revision: this.config.revision };
  }

  cancel(predicate, reason) {
    for (const r of this.runs.filter(r => !r.cancelled && predicate(r))) {
      r.cancelled = true;
      for (const a of r.actions) if (a.status === 'pending') a.status = 'cancelled';
      this.log(reason, { runId: r.id, routineId: r.routineId, result: 'cancelled' });
    }
  }

  ingest(snapshot, { initial = false, reconnect = false, morningStarted = false } = {}) {
    const previous = this.facts(), before = this.snapshot, oldMode = this.state.mode;
    this.snapshot = snapshot;
    const facts = this.facts();
    if (facts.allAway || this.state.guest) this.state.manualNight = false;
    const wakingIds = facts.homeIds.filter(id => before.people?.[id]?.present === true && before.people?.[id]?.asleep === true && snapshot.people?.[id]?.asleep === false && !(this.arrivalWakeUntil[id] > this.clock()));
    if (oldMode === 'night' && wakingIds.length && !initial && !reconnect && this.started) this.state.manualNight = false;
    const next = deriveMode(facts);
    if (this.state.manualNight && facts.someHome) { next.mode = 'night'; next.reason = 'Nattmodus startet manuelt eller etter felles svar'; }
    this.state.mode = next.mode; this.state.reason = next.reason;
    if(next.mode==='night' && oldMode!=='night' && this.started && !initial && !reconnect && !morningStarted)this.state.motionMorningConsumed=false;
    const names = { home:'Hjemme', away:'Borte', night:'Natt', unknown:'Ukjent' };
    if (this.started && oldMode !== next.mode) this.log(`House Guard: ${names[oldMode]} → ${names[next.mode]}. ${next.reason}`, { result: 'info' });
    if (!facts.allAway) this.cancel(r => r.routineId === 'away', 'Bortemodus avbrutt fordi noen kom hjem eller tilstedeværelsen er ukjent');
    if (!facts.someHome) this.cancel(r => ['home', 'nightArrival', 'arrivalUnlock', 'night', 'welcome', 'morning', 'firstWake'].includes(r.routineId), 'Rutinen avbrutt: ingen er bekreftet hjemme');
    if (this.state.question && !this.state.question.decided && (!facts.someHome || !facts.nobodyAsleep || this.state.guest)) {
      this.state.question.decided = 'cancelled'; this.log('Nattspørsmål avbrutt fordi vilkårene endret seg');
    }
    if (initial || reconnect || !this.started) {
      this.started = true;
      this.cancel(r => !['alarm'].includes(r.routineId), 'Ventende rutine avbrutt ved ny tilkobling');
      const savedAway = this.savedRuns.find(r => r.routineId === 'away' && !r.cancelled && r.actions.every(a => a.status === 'pending'));
      if (facts.allAway && savedAway) this.start('away', {}, Math.max(0, savedAway.dueAt - this.clock()) / 1000);
      this.savedRuns = [];
      this.log('Fersk tilstand lest. Gamle ankomster og opplåsinger er ikke spilt av');
      this.syncAlarm(snapshot, true);
      require('./away-sleep').reconcile(this);
      this.save(); return;
    }
    const arrivals = facts.homeIds.filter(id => {
      const old = before.people?.[id];
      return old && old.available !== false && old.present === false && Number.isFinite(old.observedAt) && this.clock() - old.observedAt <= this.config.freshnessSeconds * 1000;
    });
    const wakingArrival = arrivals.length > 0 && this.config.night.wakeArrival && (previous.anyAsleep || oldMode === 'night');
    if(wakingArrival) {
      this.state.manualNight=false;
      this.cancel(r=>r.routineId==='night','Nattaktivering avbrutt ved hjemkomst');
      const current=deriveMode(facts);this.state.mode=current.mode;this.state.reason=current.reason;
    }
    if (facts.allAway && !previous.allAway) this.start('away', {}, this.config.delays.away);
    if(this.state.guest && snapshot.connected && facts.residentsAllAway && previous.residentsSomeHome)this.start('guestNotice',{noticeKind:'alone',guestGeneration:this.state.guestGeneration});
    if (arrivals.length && previous.allAway && facts.someHome) {
      this.start('home', { personId: arrivals[0] }, this.config.delays.home);
      this.state.welcomeUntil = this.clock() + 10 * 60000;
      this.state.welcomeGuestGeneration = null;
    }
    for (const personId of arrivals) {
      if (previous.anyAsleep || oldMode === 'night') {
        if (this.config.night.wakeArrival) this.arrivalWakeUntil[personId] = this.clock() + 120000;
        this.start('nightArrival', { personId });
      }
      if (this.config.security.autoUnlock) this.start('arrivalUnlock', { personId });
    }
    if (!morningStarted && !wakingArrival && facts.allHomeAsleep && !previous.allHomeAsleep && !this.state.manualNight) this.start('night');
    if (oldMode === 'night' && !facts.allHomeAsleep && wakingIds.length) this.start('firstWake', { personId: wakingIds[0] });
    const w = this.config.welcome;
    const door = this.cap(w.doorDeviceId, w.doorCapability, snapshot);
    const oldDoor = this.cap(w.doorDeviceId, w.doorCapability, before);
    if (door.value === true && oldDoor.value === false && this.state.welcomeUntil > this.clock()) {
      this.state.welcomeUntil = 0;
      const lux = this.cap(w.luxDeviceId, w.luxCapability, snapshot);
      const context=this.state.welcomeGuestGeneration?{guestArrival:true,guestGeneration:this.state.welcomeGuestGeneration}:{};
      if (this.sensorFresh(lux, w.maxAgeSeconds) && typeof lux.value === 'number' && lux.value < w.threshold) this.start('welcome', context, w.delaySeconds);
      else this.log('Velkomstlys hoppet over: lyst eller ukjent lux');
    }
    this.syncAlarm(snapshot);
    require('./away-sleep').reconcile(this);
    this.save();
  }

  syncAlarm(snapshot, restart = false) {
    const cap = this.cap(this.config.security.alarmDeviceId, 'alarm_generic', snapshot);
    if (cap.value === false && this.state.alarm?.active) this.event('alarmOff', {});
    else if (cap.value === true && !this.state.alarm?.active) this.event('alarm', snapshot.devices?.[this.config.security.alarmDeviceId]?.alarmContext || { zone: 'Ukjent sone', reason: 'Alarmpanel – detaljer mangler' });
    else if (restart && this.state.alarm?.active) this.log(cap.value === true ? 'Aktiv alarm bekreftet etter restart' : 'Alarmgjentakelse venter på fersk bekreftelse');
  }

  start(routineId, context = {}, delaySeconds = 0) {
    if(require('./guest-presence').retired(routineId)){this.log('Egne gjesterutiner er erstattet av vanlig hjemkomst og bortemodus.',{routineId,result:'skipped'});return null;}
    if(routineId==='night' && this.state.guest){this.log('Nattmodus hoppes over fordi gjester er hjemme.',{routineId,result:'skipped'});return null;}
    const routine = this.config.routines.find(r => r.id === routineId);
    const bypassWarning = routineId === 'activeSensor' && context.bypassed === true;
    const plan = builtins(routineId, this.config, context, this.facts());
    // A fixed routine's switch controls only user-added actions. Built-ins have
    // their own settings under Alarm, Night/morning and Guest mode.
    if (routine?.enabled === false && !require('./config').ROUTINES[routineId]) return null;
    if (!routine && !require('./config').ROUTINES[routineId] && !['arrivalUnlock','question','guestNotice','departureWake'].includes(routineId)) throw new Error('Ukjent rutine');
    if (this.runs.some(r => !r.cancelled && r.routineId === routineId && (r.context.personId || '') === (context.personId || '') && (r.context.noticeKind || '') === (context.noticeKind || '') && r.actions.some(a => !FINISHED.has(a.status)))) return null;
    if(routineId==='night')this.state.motionMorningConsumed=false;
    const custom = routine?.enabled === false ? [] : (routine?.actions || []).filter(a=>!bypassWarning || a.kind!=='notify');
    const actions = [...plan, ...custom].map(a => ({ ...structuredClone(a), status: 'pending' }));
    const run = { id: randomUUID(), routineId, context: { ...context }, generation: this.state.generation, startedAt: this.clock(), dueAt: this.clock() + delaySeconds * 1000, execution: routine?.execution || 'sequential', actions };
    const name=routine?.name || ({guestNotice:'Gjestevarsel',departureWake:'Sett bortreist bruker våken'}[routineId] || routineId);
    if (!actions.length) this.log(`Rutinen «${name}» har ingen valgte handlinger`, { routineId });
    else this.log(`Planlagt: ${name}`, { routineId, runId: run.id });
    this.runs.push(run); this.runs = this.runs.filter(r => r.actions.some(a => !FINISHED.has(a.status)) || r.startedAt > this.clock() - 3600000).slice(-100);
    this.save(); return run;
  }

  async manual(mode) {
    if(this.presenceCommand)throw Error('Tilstedeværelse oppdateres. Vent til kommandoen er ferdig.');
    const snapshot = await this.adapter.snapshot(); this.ingest(snapshot);
    const facts = this.facts();
    if (mode === 'night') {
      if(this.state.guest)throw Error('Slå av gjestemodus før du starter nattmodus. Gjester holder huset hjemme og alarmen frakoblet.');
      if (!facts.someHome) throw new Error('Nattmodus krever at noen er hjemme');
      this.state.manualNight = true; this.state.motionMorningConsumed=false; this.state.mode = 'night'; this.state.reason = 'Nattmodus startet'; this.start('night');
    } else if (mode === 'morning' || mode === 'home') this.morning('manual');
    else if (mode === 'away') {
      if (!facts.allAway) throw new Error('Bortemodus krever at alle valgte er bekreftet borte');
      this.start('away', {}, this.config.delays.away);
    } else throw new Error('Ukjent modus');
    this.save();
  }

  async setAllPresent(value) {
    return require('./manual-presence')(this,value);
  }

  morning(source, beforeStart = () => {}) {
    if (this.config.morning.requireHome && !this.facts().someHome) { this.log('Morgen hoppet over: ingen er hjemme'); return false; }
    const boundary = nextMorning(this.clock(), this.config.timeZone, this.config.morning.time);
    // A morning before the scheduled time and at that time share the same local date.
    const date = localParts(this.clock(), this.config.timeZone).date;
    const key = `morning-${date}`;
    const explicit = source === 'manual' || source === 'external' || source === 'motion';
    const newNight = this.state.manualNight || this.state.mode === 'night' || this.facts().anyAsleep;
    if (this.runs.some(r => !r.cancelled && r.routineId === 'morning' && r.actions.some(a => !FINISHED.has(a.status)))) return false;
    if (this.state.morningKey === key && !(explicit && newNight)) return false;
    beforeStart();
    this.cancel(r => r.routineId === 'night' && r.actions.some(a => !FINISHED.has(a.status)), 'Nattaktivering avbrutt fordi morgen ble startet');
    if (this.state.question && !this.state.question.decided) this.state.question.decided = 'cancelled';
    this.state.morningKey = key; this.state.manualNight = false; this.state.mode = this.facts().someHome ? 'home' : this.state.mode;
    this.state.reason = `Morgen startet (${source})`; this.state.nextMorning = boundary;
    this.start('morning', { source }); this.save(); return true;
  }

  setGuest(value,beforeActions) {
    return require('./guest-presence').change(this,value,beforeActions);
  }
  skipNight() {
    this.state.skipUntil = nextMorning(this.clock(), this.config.timeZone, this.config.morning.time);
    if (this.state.question && !this.state.question.decided) this.state.question.decided = 'no';
    this.log('Automatisk nattmodus hoppes over til neste konfigurerte morgen'); this.save();
  }

  autoNightAllowed() {
    return !this.autoNightReason();
  }
  autoNightReason() {
    const n = this.config.night, f = this.facts();
    const alarm = this.cap(this.config.security.alarmDeviceId, 'homealarm_state');
    if (!n.automatic) return 'Automatisk natt er av';
    if (this.state.manualNight || this.state.mode === 'night') return 'Nattmodus er allerede startet';
    if (!inWindow(this.clock(), this.config.timeZone, n.start, n.end)) return 'Utenfor nattvinduet';
    if (this.state.skipUntil > this.clock()) return 'Natt er hoppet over til neste morgen';
    if (!f.someHome) return 'Ingen er bekreftet hjemme';
    if (!f.nobodyAsleep) return 'Noen sover, eller sovestatus er ukjent';
    if (this.state.guest) return 'Gjester er hjemme. Automatisk natt venter til gjestemodus er slått av.';
    if (alarm.value !== 'disarmed') return 'Alarmen er ikke bekreftet frakoblet';
    if (!this.config.people.questions.some(id => f.homeIds.includes(id))) return 'Ingen hjemmeværende mottakere valgt';
    return null;
  }
  async requestNight() {
    const n = this.config.night, f = this.facts();
    if (!this.autoNightAllowed()) return false;
    if (this.state.question && !this.state.question.decided) return false;
    const recipients = this.config.people.questions.filter(id => f.homeIds.includes(id));
    if (!recipients.length) { this.log('Ingen hjemmeværende mottakere valgt for nattspørsmål'); return false; }
    const request = { id: randomUUID(), recipients, replyKeys: Object.fromEntries(recipients.map(id => [id, randomUUID()])), answers: {}, deadline: this.clock() + n.answerSeconds * 1000, rule: n.rule, decided: null };
    this.state.question = request; this.save();
    if (this.config.observation) {
      request.decided = 'observed'; this.state.skipUntil = nextMorning(this.clock(), this.config.timeZone, this.config.morning.time);
      this.log('Observasjon: ville spurt om nattmodus. Ingen spørsmål sendt', { result: 'observed', requestId: request.id }); this.save(); return true;
    }
    if (!this.config.bridges.questions && !this.adapter?.direct?.configured) {
      request.decided = 'error'; this.skipNight(); this.log('Nattspørsmål ikke sendt: spørsmålsbro er ikke konfigurert'); return false;
    }
    const generation = this.state.generation;
    await Promise.all(recipients.map(async personId => {
      try { await this.adapter.emit({ kind: 'question', personId, requestId: request.id, reply: request.replyKeys[personId], deliveryId: this.newDelivery('question', [personId]), text: 'Aktivere nattmodus?', deadline: request.deadline }, () => !request.decided && this.state.generation === generation && !this.config.observation); }
      catch { request.answers[personId] = 'error'; }
    }));
    this.save(); return true;
  }
  answer(id, personId, answer) {
    const q = this.state.question;
    if (!q || q.id !== id || q.decided || this.clock() >= q.deadline || !q.recipients.includes(personId)) throw new Error('Spørsmålet er utløpt, eller mottakeren er feil');
    if (!['yes', 'no', 'error'].includes(answer)) throw new Error('Ugyldig svar');
    if (q.answers[personId] !== undefined) return;
    q.answers[personId] = answer;
    if (answer === 'no') { q.decided = 'no'; this.skipNight(); }
    this.save();
  }

  event(type, payload = {}) {
    if (!['alarm', 'alarmOff', 'arming', 'activeSensor', 'entryDelay', 'idle', 'morning'].includes(type)) throw new Error('Ukjent integrasjonshendelse');
    this.state.integrationEvents[type] = this.clock();
    this.log(`Integrasjonshendelse: ${type}${payload.zone ? ` · ${payload.zone}` : ''}`, { result: 'info' });
    if (type === 'alarm') {
      const old = this.state.alarm;
      if (old?.active) {
        if (payload.id && payload.id !== old.id && !old.generatedId) return;
        if (payload.id && old.generatedId) { old.id = payload.id; old.generatedId = false; }
        if (payload.zone) old.zone = String(payload.zone).slice(0, 300);
        if (payload.reason) old.reason = String(payload.reason).slice(0, 500);
        for (const run of this.runs) if (run.routineId === 'alarm' && !run.cancelled) run.context = { ...old };
        this.save(); return;
      }
      this.state.alarm = { active: true, id: payload.id || randomUUID(), generatedId: !payload.id, deviceId:payload.deviceId, sensorName:payload.sensorName, zone: String(payload.zone || 'Ukjent sone').slice(0, 300), reason: String(payload.reason || 'Ukjent årsak').slice(0, 500), startedAt: this.clock(), nextAt: this.clock() + this.config.security.repeatSeconds * 1000 };
      this.start('alarm', { ...this.state.alarm });
    } else if (type === 'alarmOff') {
      if (!this.state.alarm?.active) return;
      this.state.alarm.active = false;
      this.cancel(r => r.routineId === 'alarm', 'Alarm avstilt – gjentakelse stoppet');
      this.start('alarmOff', { ...this.state.alarm });
    } else if (type === 'morning') this.morning('external');
    else if (type === 'idle') {
      if (payload.zoneId === this.config.night.zoneId && Number(payload.minutes) >= this.config.night.idleMinutes) return this.requestNight();
    } else this.start(type, { ...payload });
    this.save();
  }

  updateConfig(input) {
    const next = validate(input); next.revision = this.config.revision + 1;
    this.config = next; this.state.generation++;
    this.cancel(() => true, 'Ventende handling avbrutt fordi innstillingene ble endret');
    if (this.state.question && !this.state.question.decided) this.state.question.decided = 'cancelled';
    this.state.welcomeUntil = 0;
    this.state.nextScheduledAt = next.morning.scheduled ? nextMorning(this.clock() - 60000, next.timeZone, next.morning.time) : null;
    this.log(`Oppsett lagret (revisjon ${next.revision}). ${next.observation ? 'Observasjon' : 'Aktiv styring'}`, { result: 'info' });
    this.save(); return next;
  }

  cap(deviceId, capability, snapshot = this.snapshot) {
    const d = snapshot.devices?.[deviceId];
    if (!d || d.available === false) return { value: null, available: false };
    return { ...(d.capabilities?.[capability] || {}), available: true };
  }
  sensorFresh(cap, maxAgeSeconds) { return Number.isFinite(cap.updatedAt) && cap.updatedAt <= this.clock() && this.clock() - cap.updatedAt <= maxAgeSeconds * 1000; }
  guard(run, a, snapshot) {
    const f = this.facts(snapshot), c = this.config;
    if (run.cancelled || run.generation !== this.state.generation) return 'Rutinen er erstattet';
    if (!snapshot.connected) return 'Homey er ikke tilkoblet';
    if(run.routineId==='night' && this.state.guest)return 'Gjestemodus holder huset hjemme og alarmen frakoblet';
    if(['guestActivated','guestDeactivated'].includes(run.routineId) && (this.state.guest!==(run.routineId==='guestActivated') || run.context.guestGeneration!==undefined && run.context.guestGeneration!==this.state.guestGeneration))return 'Gjestemodus er endret; ekstrahandlingen er ikke lenger aktuell';
    if(run.context.guestArrival && (!this.state.guest || run.context.guestGeneration!==this.state.guestGeneration))return 'Gjesteankomsten er ikke lenger gyldig';
    if(run.routineId==='guestNotice' && (!this.state.guest || run.context.guestGeneration!==this.state.guestGeneration || run.context.noticeKind==='alone' && !f.residentsAllAway))return 'Gjestevarselet er ikke lenger aktuelt';
    if (a.kind === 'set' && protectedWrite(c, a.deviceId, a.capability, snapshot.devices?.[a.deviceId]) && !trustedWrite(c, a)) return 'Lås, alarm og port må styres gjennom sikkerhetsoppsettet';
    if (run.routineId === 'away' && !f.allAway) return 'Ingen bekreftet tom bolig';
    if (['home', 'night', 'nightArrival', 'arrivalUnlock', 'welcome', 'firstWake'].includes(run.routineId) && !f.someHome) return 'Ingen er bekreftet hjemme';
    if(run.routineId==='nightArrival' && run.context.personId && (!f.homeIds.includes(run.context.personId) || this.clock()-run.startedAt>120000))return 'Nattankomsten er ikke lenger gyldig';
    if (run.routineId === 'morning' && c.morning.requireHome && !f.someHome) return 'Morgen krever at noen er hjemme';
    if (run.routineId === 'arming' && this.state.guest) return 'Tilkoblingskontroll hoppes over ved gjester';
    if (run.routineId === 'alarm' && !this.state.alarm?.active) return 'Alarmen er avstilt';
    if (run.routineId === 'alarm' && this.cap(c.security.alarmDeviceId, 'alarm_generic', snapshot).value === false) return 'Alarmpanelet bekrefter avstilt alarm';
    if (a.kind === 'garage' && !a.manualControl && !c.security.garage.enabled) return 'Automatisk portstyring er av';
    if (a.when && !({ home: f.someHome, away: f.allAway, asleep: f.anyAsleep, awake: f.nobodyAsleep, night: this.state.mode === 'night' })[a.when]) return 'Handlingens vilkår er ikke oppfylt';
    if (a.condition) {
      const condition = a.condition, reading = this.cap(condition.deviceId, condition.capability, snapshot);
      if (reading.value === null || reading.value === undefined || (typeof reading.value === 'number' && !this.sensorFresh(reading, condition.maxAgeSeconds))) return 'Målingen i vilkåret er ukjent eller foreldet';
      const matches = condition.operator === 'eq' ? reading.value === condition.value : typeof reading.value === 'number' && typeof condition.value === 'number' && (condition.operator === 'lt' ? reading.value < condition.value : reading.value > condition.value);
      if (!matches) return 'Enhetens verdi oppfyller ikke handlingens vilkår';
    }
    if(a.kind==='person'){
      if(run.routineId==='departureWake'){
        if(a.value!==false || !require('./away-sleep').eligible(this,a.personId,snapshot))return 'Personen er ikke lenger bekreftet borte';
      }else if(!f.homeIds.includes(a.personId))return 'Personen er ikke bekreftet hjemme';
    }
    if (a.kind === 'set' && a.capability === 'homealarm_state' && a.value !== 'disarmed') {
      if(this.state.guest)return 'Gjestemodus holder alarmen frakoblet';
      if (a.value === 'armed' && !f.allAway) return 'Full tilkobling krever at alle er bekreftet borte';
      if (a.value === 'partially_armed' && !(f.allHomeAsleep || (this.state.manualNight && f.someHome))) return 'Nattalarm krever bekreftet nattmodus';
    }
    if(a.manualControl){
      if(run.routineId!=='manualControl' || this.clock()-run.startedAt>30000)return 'Den manuelle kommandoen er utløpt.';
      const problem=require('./manual-controls').reason(c,snapshot,a);if(problem)return problem;
    }
    if (a.guardedUnlock && !a.manualControl) {
      const alarm = this.cap(c.security.alarmDeviceId, 'homealarm_state', snapshot);
      if (alarm.value !== 'disarmed' || snapshot.devices?.[c.security.alarmDeviceId]?.alarmTarget) return 'Opplåsing krever bekreftet frakoblet alarm';
      if (run.routineId === 'arrivalUnlock') {
        if (!c.security.autoUnlock || (!run.context.guestArrival && !f.homeIds.includes(run.context.personId)) || this.clock() - run.startedAt > 120000) return 'Ankomsten er ikke lenger gyldig';
      } else return 'Opplåsing er ikke aktivt valgt';
    }
    return null;
  }

  async execute(run, a) {
    a.status = 'checking';
    try {
      const snapshot = await this.adapter.snapshot();
      const reason = this.guard(run, a, snapshot);
      if (reason) { a.status = 'skipped'; a.error=reason; this.log(reason, { runId: run.id, actionId: a.id, result: a.status }); return; }
      if(a.kind==='person' && snapshot.people?.[a.personId]?.asleep===a.value){a.status='confirmed';this.log('Sovestatus er allerede bekreftet',{runId:run.id,actionId:a.id,result:'confirmed'});return;}
      if (a.kind === 'set' && this.cap(a.deviceId, a.capability, snapshot).value === a.value && !(a.capability==='homealarm_state' && snapshot.devices?.[a.deviceId]?.alarmTarget)) {
        a.status = 'confirmed'; this.log('Ønsket tilstand er allerede bekreftet – ingen kommando sendt', { runId: run.id, actionId: a.id, result: 'confirmed', value: a.value }); return;
      }
      if (a.kind === 'set' && this.runs.some(other => other !== run && !other.cancelled && other.actions.some(candidate => candidate.kind === 'set' && ['checking', 'dispatching', 'sent', 'waiting'].includes(candidate.status) && candidate.deviceId === a.deviceId && candidate.capability === a.capability && candidate.value === a.value))) {
        a.status = 'pending'; return;
      }
      if(a.kind==='garage' && a.manualControl){
        const current=this.cap(a.confirm.deviceId,a.confirm.capability,snapshot).value;
        if(current===a.confirm.value){a.status='confirmed';this.log('Porten er allerede i ønsket tilstand',{runId:run.id,actionId:a.id,result:'confirmed'});return;}
      }
      if (a.kind === 'garage' && !a.manualControl) {
        const g = this.config.security.garage, cap = this.cap(g.statusDeviceId, g.statusCapability, snapshot);
        const reason = garageDecision({ open: typeof cap.value === 'boolean' ? cap.value === g.openValue : null, nobodyAsleep: this.facts(snapshot).nobodyAsleep, validated: g.validated, commandType: g.commandType });
        if (reason) { a.status = 'skipped'; this.log(reason, { result: a.status, actionId: a.id }); if (typeof cap.value !== 'boolean' || cap.value === g.openValue) await this.notice(reason, run, g.imageDeviceId); return; }
        a.deviceId = g.commandDeviceId; a.capability = g.commandCapability; a.value = g.commandValue;
        a.confirm = { deviceId: g.statusDeviceId, capability: g.statusCapability, value: !g.openValue };
      }
      if (a.kind === 'garage' && this.runs.some(other => other.actions.some(candidate => candidate !== a && candidate.deviceId === a.deviceId && ((!other.cancelled && ['checking','dispatching','sent','waiting'].includes(candidate.status)) || candidate.sentAt !== undefined && this.clock()-candidate.sentAt < 30000)))) {
        a.status='skipped'; a.error='En portkommando pågår eller er nylig sendt. Ingen ny puls sendt.';
        this.log(a.error,{runId:run.id,actionId:a.id,result:a.status});return;
      }
      if (this.config.observation) {
        a.status = 'observed'; this.log(`Observasjon: ${a.kind} – ${a.deviceId || a.personId || a.text || a.flowId || a.id}`, { runId: run.id, actionId: a.id, result: 'observed', value: a.value }); return;
      }
      if (run.cancelled || run.generation !== this.state.generation) { a.status = 'cancelled'; return; }
      if (a.kind === 'verify') {
        a.status = 'waiting'; a.confirmBy = this.clock() + (a.confirmSeconds || 60) * 1000;
        await this.confirm(run, a); return;
      }
      // Persist intent before crossing the side-effect boundary. A crash in this gap
      // must not turn a possibly dispatched command back into an unsent command.
      a.status = 'dispatching'; this.save();
      const dispatched = () => {
        a.status = 'sent'; a.sentAt = this.clock();
        this.log(a.capability === 'locked' ? 'Låsekommando sendt – venter på bekreftelse' : 'Handling sendt', { runId: run.id, actionId: a.id, result: 'sent' }); this.save();
      };
      const authorized = () => !run.cancelled && run.generation === this.state.generation && !this.config.observation;
      switch (a.kind) {
        case 'set': case 'garage': await this.adapter.set(a.deviceId, a.capability, a.value, authorized, dispatched, { ...a, builtin: a.builtin || a.kind === 'garage' }); break;
        case 'person': await this.adapter.setAsleep(a.personId, a.value, authorized, dispatched, {away:run.routineId==='departureWake'}); break;
        case 'flow': await this.adapter.startFlow(a.flowId, a.flowType, authorized, dispatched); break;
        case 'timeline': await this.adapter.timeline(this.expand(a.text, run.context), authorized, dispatched); break;
        case 'notify': case 'speak': case 'sound': {
          const bridge = a.kind === 'notify' ? 'notifications' : 'audio';
          if (!this.config.bridges[bridge] && !this.adapter?.direct?.configured) throw new Error(`Bro for ${bridge} er ikke konfigurert`);
          await this.adapter.emit({ ...a, deliveryId: this.newDelivery(a.kind, a.kind === 'notify' ? this.config.people.notifications : [a.deviceId]), text: this.expand(a.text, run.context), context: run.context, recipients: this.config.people.notifications }, authorized, dispatched);
          if(a.kind==='notify' && a.alsoTimeline) {
            try { await this.adapter.timeline(this.expand(a.text,run.context),authorized); }
            catch(error) { this.log(`Tidslinjekopi feilet: ${error.message}. Push-koblingen er allerede utløst.`,{actionId:a.id,result:'failed'}); }
          }
          break;
        }
        default: throw new Error('Handling er ikke støttet');
      }
      a.acceptedAt = this.clock();
      if (['set', 'garage', 'verify', 'person'].includes(a.kind)) {
        a.status = 'waiting'; a.confirmBy = this.clock() + (a.confirmSeconds || 60) * 1000;
        this.log('Kommando akseptert – tilstand er ennå ikke bekreftet', { actionId: a.id, result: 'waiting' });
      } else { a.status = 'accepted'; this.log('Handling akseptert; ekstern levering er ikke bekreftet', { actionId: a.id, result: 'accepted' }); }
    } catch (error) {
      if (['set', 'garage', 'person'].includes(a.kind) && a.sentAt !== undefined) {
        a.status = 'waiting'; a.confirmBy = this.clock() + (a.confirmSeconds || 60) * 1000; a.error = error.message;
        this.log(`Kommandoens utfall er ukjent: ${error.message}. Leser tilbake uten å gjenta`, { actionId: a.id, result: 'unknown' });
      } else { a.status = 'failed'; a.error = error.message; this.log(`Handling feilet: ${error.message}`, { actionId: a.id, result: 'failed' }); }
    } finally { this.save(); }
  }
  expand(text, context) {
    const weather = this.snapshot.devices?.['homey-weather'];
    const temp = this.cap('homey-weather', 'measure_temperature');
    const values = { ...context, personId:this.snapshot.people?.[context.personId]?.name || context.personId, temperature: this.sensorFresh(temp, 3600) ? temp.value : 'ukjent antall', weather: this.sensorFresh(temp,3600) ? weather?.weatherText || 'ukjent vær' : 'ukjent vær' };
    return String(text || '').replace(/\{(zone|reason|sensorName|personId|seconds|temperature|weather)\}/g, (_, key) => String(values[key] ?? 'Ukjent'));
  }
  newDelivery(kind, recipients = []) {
    const id = randomUUID(); this.state.deliveries.push({ id, kind, recipients, responses: {}, expectsReceipt: !!this.adapter?.direct?.configured || require('./simple-flows').modeFor(this.config,kind) === 'legacy', generation: this.state.generation, at: this.clock(), result: 'pending' }); this.state.deliveries = this.state.deliveries.slice(-30); this.save(); return id;
  }
  validDelivery(id, recipient) {
    const d = this.state.deliveries.find(d => d.id === id);
    return !this.config.observation && !!d && d.generation === this.state.generation && this.clock() - d.at < 300000 && (!recipient || (d.recipients.includes(recipient) && !d.responses[recipient]));
  }
  deliveryResult(id, result, detail = '', recipientId = '') {
    const delivery = this.state.deliveries.find(d => d.id === id);
    if (!delivery || !['accepted', 'failed'].includes(result) || !delivery.recipients?.includes(recipientId)) return;
    if (delivery.responses[recipientId]) return;
    delivery.responses[recipientId] = result;
    delivery.result = Object.values(delivery.responses).includes('failed') ? 'failed' : delivery.recipients.every(id => delivery.responses[id] === 'accepted') ? 'accepted' : 'pending';
    delivery.updatedAt = this.clock(); delivery.detail = String(detail).slice(0, 300);
    this.log(`Levering ${result === 'accepted' ? 'bekreftet utførelse' : 'rapporterte feil'}: ${delivery.kind}. ${delivery.detail}`, { result, deliveryId: id }); this.save();
  }
  async notice(text, run, imageDeviceId = '') {
    if (this.config.observation) { this.log(`Observasjon: ville varslet «${text}»`); return; }
    if ((!this.config.bridges.notifications && !this.adapter?.direct?.configured) || run.cancelled) return;
    try { await this.adapter.emit({ kind: 'notify', text, imageDeviceId, notificationType:imageDeviceId ? 'image' : 'normal', deliveryId: this.newDelivery('notify', this.config.people.notifications), recipients: this.config.people.notifications, context: run.context }, () => !run.cancelled && run.generation === this.state.generation && !this.config.observation); }
    catch (error) { this.log(`Varsel feilet: ${error.message}`, { result: 'failed' }); }
  }

  async confirm(run, a) {
    if (a.nextCheckAt && this.clock() < a.nextCheckAt && this.clock() < a.confirmBy) return;
    a.nextCheckAt = this.clock() + 5000;
    const snapshot = await this.adapter.snapshot();
    const target = a.confirm || a;
    const value = a.kind === 'person' ? snapshot.people?.[a.personId]?.asleep : this.cap(target.deviceId, target.capability, snapshot).value;
    if (value === target.value) {
      a.status = 'confirmed'; this.log('Ønsket tilstand bekreftet', { runId: run.id, actionId: a.id, result: 'confirmed', value });
    } else if (this.clock() >= a.confirmBy) {
      a.status = 'unknown'; this.log('Tilstanden ble ikke bekreftet innen fristen. Ingen automatisk gjentakelse', { actionId: a.id, result: 'unknown' });
      await this.notice(`Tilstanden for ${snapshot.devices?.[a.deviceId]?.name || snapshot.people?.[a.personId]?.name || a.deviceId || a.personId} ble ikke bekreftet`, run, a.kind === 'garage' ? this.config.security.garage.imageDeviceId : '');
    }
    this.save();
  }

  async tick() {
    if (this.ticking || !this.started) return;
    this.ticking = true;
    try {
      for (const delivery of this.state.deliveries) if (delivery.result === 'pending' && this.clock() - delivery.at > 300000) { delivery.result = 'unknown'; if(delivery.expectsReceipt !== false)this.log('Ingen kvittering fra leveringsflow innen fem minutter', { result: 'unknown', deliveryId: delivery.id }); }
      const zone = this.snapshot.zones?.[this.config.night.zoneId];
      const zoneFresh = zone && Number.isFinite(zone.observedAt) && this.clock() - zone.observedAt <= this.config.freshnessSeconds * 1000 && zone.observedAt <= this.clock();
      if (this.config.night.automatic && zoneFresh && zone.active === false && Number.isFinite(zone.inactiveSince) && this.clock() - zone.inactiveSince >= this.config.night.idleMinutes * 60000) {
        const reason = this.autoNightReason();
        if (reason && reason !== this.lastNightSkip) this.log(`Automatisk natt venter: ${reason}`, { result:'skipped' });
        this.lastNightSkip = reason;
        await this.requestNight();
      }
      const q = this.state.question, decision = q && decideQuestion(q, this.clock());
      if (decision) {
        q.decided = decision; this.save();
        if (decision === 'yes') {
          const snapshot = await this.adapter.snapshot(); this.ingest(snapshot);
          if (this.autoNightAllowed()) await this.manual('night');
          else this.log('Nattbeslutning avbrutt fordi vilkårene endret seg');
        } else this.skipNight();
      }
      const nowLocal = localParts(this.clock(), this.config.timeZone);
      if (this.config.morning.scheduled && this.clock() >= this.state.nextScheduledAt) {
        if (this.clock() - this.state.nextScheduledAt < 60000 && this.state.lastMorningDate !== nowLocal.date) {
          this.state.lastMorningDate = nowLocal.date; this.morning('schedule');
        }
        this.state.nextScheduledAt = nextMorning(this.clock(), this.config.timeZone, this.config.morning.time); this.save();
      }
      const alarm = this.state.alarm;
      if (alarm?.active && this.config.security.repeatEnabled && this.clock() >= alarm.nextAt) {
        const snapshot = await this.adapter.snapshot();
        const active = this.cap(this.config.security.alarmDeviceId, 'alarm_generic', snapshot).value;
        if (active === true) { alarm.nextAt = this.clock() + this.config.security.repeatSeconds * 1000; this.start('alarm', { ...alarm, repeated:true }); }
        else if (active === false) this.event('alarmOff');
        else alarm.nextAt = this.clock() + this.config.security.repeatSeconds * 1000;
        this.save();
      }
      for (const run of [...this.runs]) {
        if (run.cancelled || run.generation !== this.state.generation) continue;
        const batch = [];
        for (const a of run.actions) {
          if (run.cancelled || run.generation !== this.state.generation) break;
          const independent = a.builtin && a.id.startsWith('response-');
          if (a.status === 'waiting') { await this.confirm(run, a); if (a.status === 'waiting' && run.execution === 'sequential' && !independent) break; }
          if (FINISHED.has(a.status)) {
            if (['failed', 'unknown'].includes(a.status) && a.onError === 'stop') { this.cancel(r => r.id === run.id, 'Resten av rutinen stoppet etter feil'); break; }
            continue;
          }
          if (a.status !== 'pending') continue;
          if (this.clock() < run.dueAt + a.delaySeconds * 1000) { if (run.execution === 'sequential') break; else continue; }
          if (a.dependsOn) {
            const dep = run.actions.find(d => d.id === a.dependsOn);
            if (!FINISHED.has(dep?.status)) continue;
            if (a.requireConfirmed && !['confirmed', ...(this.config.observation ? ['observed'] : [])].includes(dep.status)) { a.status = 'skipped'; this.log('Bekreftet avhengighet mangler', { actionId: a.id }); continue; }
          }
          // Finish the urgent text attempt before starting camera work, even if it fails.
          if (independent && a.kind === 'notify' && a.notificationType !== 'image') await this.execute(run, a);
          else if (run.execution === 'parallel' || independent) batch.push(this.execute(run, a));
          else { await this.execute(run, a); if (a.status === 'waiting' || a.status === 'pending') break; }
        }
        await Promise.all(batch);
      }
      this.save();
    } catch (error) { this.log(`Motorfeil: ${error.message}`, { result: 'failed' }); this.save(); }
    finally { this.ticking = false; }
  }
}
module.exports = Engine;
