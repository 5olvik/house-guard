'use strict';
const { protectedWrite } = require('./action-safety');

const ROUTINES = {
  away: 'Siste person drar', home: 'Første hjemkomst', nightArrival: 'Ankomst om natten',
  night: 'Nattmodus', morning: 'Morgen', firstWake: 'Første person våkner', guestOn: 'Gjestemodus på', guestOff: 'Gjestemodus av',
  arming: 'Tilkoblingsforsinkelse', alarm: 'Utløst alarm', alarmOff: 'Alarm avstilt',
  activeSensor: 'Aktiv sensor', entryDelay: 'Inngangsforsinkelse', welcome: 'Velkomstlys',
};
const CATEGORIES = ['alarm', 'lights', 'av', 'ventilation', 'lock', 'garage', 'notification', 'people', 'other'];
const KINDS = ['set', 'flow', 'notify', 'speak', 'sound', 'timeline', 'person', 'garage', 'verify'];
function defaults() {
  return {
    version: 1, revision: 0, observation: true, timeZone: 'Europe/Oslo', freshnessSeconds: 120,
    people: { presence: [], night: [], questions: [], notifications: [] },
    delays: { away: 20, home: 20 },
    guest: { allow: Object.fromEntries(CATEGORIES.map(k => [k, ['notification', 'other'].includes(k)])), allowAutoNight: false, disarmOnEnable: false, unlockOnEnable: false },
    night: { automatic: false, idleMinutes: 30, zoneId: '', start: '22:30', end: '05:30', answerSeconds: 120, rule: 'veto', markAsleep: true, wakeArrival: false },
    morning: { scheduled: false, time: '07:00', requireHome: true },
    security: {
      alarmDeviceId: '', lockDeviceId: '', autoUnlock: false, lockOnArming: false,
      repeatSeconds: 60, repeatEnabled: true,
      garage: { enabled: false, statusDeviceId: '', statusCapability: '', openValue: true, commandDeviceId: '', commandCapability: '', commandValue: true, commandType: 'pulse', validated: false, temperatureDeviceId: '', temperatureCapability: 'measure_temperature', maxAgeSeconds: 600, imageDeviceId:'' },
    },
    welcome: { doorDeviceId: '', doorCapability: 'alarm_contact', luxDeviceId: '', luxCapability: 'measure_luminance', threshold: 15, maxAgeSeconds: 600, delaySeconds: 32 },
    bridges: { notifications: false, audio: false, questions: false },
    delivery: { notifications: 'simple', audio: 'simple', questions: 'simple' },
    routines: Object.entries(ROUTINES).map(([id, name]) => ({ id, name, enabled: true, execution: id === 'arming' ? 'parallel' : 'sequential', actions: [] })),
  };
}

function validate(input) {
  const errors = [];
  const add = (ok, message) => { if (!ok) errors.push(message); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Konfigurasjonen må være et objekt');
  // Serialize to reject executable values, then work on a detached object.
  const c = JSON.parse(JSON.stringify(input));
  // Existing configurations keep their established delivery routes.
  if (!c.delivery) c.delivery = { notifications:'legacy', audio:'legacy', questions:'legacy' };
  add(c.version === 1, 'Ukjent konfigurasjonsversjon');
  const d = defaults();
  for (const key of Object.keys(d)) if (c[key] === undefined) c[key] = d[key];
  const bool = (v, path) => add(typeof v === 'boolean', `${path} må være av/på`);
  const str = (v, path) => add(typeof v === 'string' && v.length <= 500, `${path} må være tekst (maks 500 tegn)`);
  const num = (v, min, max, path) => add(Number.isFinite(v) && v >= min && v <= max, `${path} må være mellom ${min} og ${max}`);
  const time = (v, path) => add(typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v), `${path} må være HH:MM`);
  try {
    bool(c.observation, 'Observasjonsmodus');
    new Intl.DateTimeFormat('en', { timeZone: c.timeZone }).format();
    num(c.freshnessSeconds, 10, 3600, 'Ferskhet');
    for (const key of Object.keys(d.people)) {
      const ids = c.people[key];
      add(Array.isArray(ids) && ids.length <= 100 && ids.every(id => typeof id === 'string' && id.length > 0 && id.length < 200) && new Set(ids).size === ids.length, `Ugyldig personutvalg: ${key}`);
    }
    add(c.people.night.every(id => c.people.presence.includes(id)), 'Personer i nattutvalget må også telle med i tilstedeværelse');
    for (const key of ['away', 'home']) num(c.delays[key], 0, 300, key === 'away' ? 'Borteforsinkelse' : 'Hjemkomstforsinkelse');
    for (const key of CATEGORIES) bool(c.guest.allow[key], `Gjestevalg ${key}`);
    if (c.guest.allowAutoNight === undefined) c.guest.allowAutoNight = false;
    bool(c.guest.allowAutoNight, 'Automatisk natt med gjester');
    bool(c.guest.disarmOnEnable, 'Frakobling ved gjester'); bool(c.guest.unlockOnEnable, 'Opplåsing ved gjester');
    for (const key of ['automatic', 'markAsleep', 'wakeArrival']) bool(c.night[key], key);
    str(c.night.zoneId, 'Nattsone'); num(c.night.idleMinutes, 1, 240, 'Inaktivitet');
    time(c.night.start, 'Nattstart'); time(c.night.end, 'Nattslutt');
    num(c.night.answerSeconds, 10, 900, 'Svarfrist'); add(['veto', 'all-yes'].includes(c.night.rule), 'Ukjent svarregel');
    bool(c.morning.scheduled, 'Morgenplan'); bool(c.morning.requireHome, 'Morgen krever hjemme'); time(c.morning.time, 'Morgentid');
    for (const key of ['autoUnlock', 'lockOnArming', 'repeatEnabled']) bool(c.security[key], key);
    for (const key of ['alarmDeviceId', 'lockDeviceId']) str(c.security[key], key);
    num(c.security.repeatSeconds, 30, 3600, 'Alarmgjentakelse');
    const g = c.security.garage;
    if (g.imageDeviceId === undefined) g.imageDeviceId = '';
    str(g.imageDeviceId, 'Portkamera');
    for (const key of ['enabled', 'validated', 'openValue']) bool(g[key], `Port ${key}`);
    for (const key of ['statusDeviceId', 'statusCapability', 'commandDeviceId', 'commandCapability', 'temperatureDeviceId', 'temperatureCapability']) str(g[key], key);
    add(['pulse', 'close'].includes(g.commandType), 'Ukjent portkommando');
    add(typeof g.commandValue === 'boolean' || typeof g.commandValue === 'string', 'Ugyldig portverdi');
    num(g.maxAgeSeconds, 10, 86400, 'Temperaturens ferskhet');
    if (g.enabled) add(g.validated && g.statusDeviceId && g.statusCapability && g.commandDeviceId && g.commandCapability && g.temperatureDeviceId, 'Portstyring krever validerte enhetsvalg, polaritet og kommando');
    for (const key of ['doorDeviceId', 'doorCapability', 'luxDeviceId', 'luxCapability']) str(c.welcome[key], key);
    num(c.welcome.threshold, 0, 100000, 'Luxgrense'); num(c.welcome.maxAgeSeconds, 10, 86400, 'Luxferskhet'); num(c.welcome.delaySeconds, 0, 300, 'Velkomstforsinkelse');
    for (const key of Object.keys(d.bridges)) bool(c.bridges[key], `Bro ${key}`);
    for (const key of Object.keys(d.delivery)) add(['legacy','simple'].includes(c.delivery[key]), 'Ukjent leveringsmetode');
    add(Array.isArray(c.routines) && c.routines.length <= 50, 'Maks 50 rutiner');
    const ids = new Set();
    for (const r of c.routines) {
      add(typeof r.id === 'string' && /^[\w-]{1,100}$/.test(r.id) && !ids.has(r.id), 'Rutine-ID må være unik'); ids.add(r.id);
      str(r.name, 'Rutinenavn'); bool(r.enabled, 'Rutine aktiv'); add(['sequential', 'parallel'].includes(r.execution), 'Velg sekvens eller parallell utførelse');
      add(Array.isArray(r.actions) && r.actions.length <= 100, 'Maks 100 handlinger per rutine');
      const seen = new Set();
      for (const a of r.actions) {
        for (const key of ['builtin', 'guardedUnlock', 'guestExplicit', 'confirm', 'status', 'sentAt', 'acceptedAt', 'confirmBy', 'nextCheckAt']) delete a[key];
        add(typeof a.id === 'string' && /^[\w-]{1,100}$/.test(a.id) && !seen.has(a.id), 'Handlings-ID må være unik');
        add(KINDS.includes(a.kind), `Ukjent handling: ${a.kind}`); add(CATEGORIES.includes(a.category), 'Velg handlingskategori');
        num(a.delaySeconds, 0, 86400, 'Handlingsforsinkelse');
        add(['stop', 'continue'].includes(a.onError), 'Velg feilregel');
        if (a.dependsOn) add(seen.has(a.dependsOn), 'Avhengighet må peke på en tidligere handling');
        if (a.requireConfirmed) add(!!a.dependsOn, 'Bekreftelseskrav må ha en avhengighet');
        if (['set', 'verify'].includes(a.kind)) { str(a.deviceId, 'Enhet'); str(a.capability, 'Capability'); add(a.value !== undefined && ['boolean', 'number', 'string'].includes(typeof a.value), 'Velg ønsket verdi'); }
        // Lock, port and alarm writes may only go through guarded built-ins.
        if (a.kind === 'set' && protectedWrite(c, a.deviceId, a.capability)) add(false, 'Bruk sikkerhetsoppsettet for lås, alarm og port');
        if (a.kind === 'flow') { str(a.flowId, 'Flow-ID'); add(['normal', 'advanced'].includes(a.flowType), 'Velg Flow-type'); }
        if (['notify', 'speak', 'sound', 'timeline'].includes(a.kind)) str(a.text, 'Melding');
        if (a.kind === 'notify' && a.notificationType !== undefined) add(['normal', 'critical', 'image'].includes(a.notificationType), 'Ukjent varseltype');
        if (a.imageDeviceId !== undefined) str(a.imageDeviceId, 'Kamera-ID');
        if (a.kind === 'person') { str(a.personId, 'Person-ID'); bool(a.value, 'Sovestatus'); }
        if (a.confirmSeconds !== undefined) num(a.confirmSeconds, 1, 300, 'Bekreftelsesfrist');
        if (a.volume !== undefined) num(a.volume, 0, 100, 'Volum');
        if (['speak', 'sound'].includes(a.kind)) { str(a.deviceId, 'Lydenhet'); add(!!a.deviceId, 'Velg lydenhet'); num(a.volume, 1, 100, 'Sonos-volum'); }
        if (a.when) add(['home', 'away', 'asleep', 'awake', 'night'].includes(a.when), 'Ukjent vilkår');
        if (a.condition) {
          str(a.condition.deviceId, 'Enhet i vilkår'); str(a.condition.capability, 'Funksjon i vilkår');
          add(['eq', 'lt', 'gt'].includes(a.condition.operator), 'Ukjent sammenligning');
          add(['boolean', 'number', 'string'].includes(typeof a.condition.value), 'Ugyldig sammenligningsverdi');
          num(a.condition.maxAgeSeconds, 10, 86400, 'Målingens maksimale alder');
        }
        seen.add(a.id);
      }
    }
  } catch (error) { errors.push(`Manglende eller ugyldig felt: ${error.message}`); }
  if (errors.length) throw new Error(errors.join('\n'));
  return c;
}

module.exports = { defaults, validate, ROUTINES, CATEGORIES, KINDS };
