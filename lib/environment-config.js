'use strict';
const model = require('../settings/environment-model');
const TYPES = { fire: 'Brann', water: 'Vann' };
const waterHealthDefaults = () => ({ enabled:true, thresholdHours:24, push:true, critical:false, timeline:true, repeatHours:24, restoredPush:false });
function defaults() {
  const response = type => ({
    push: true, critical: type === 'fire', timeline: true, restoredPush: true,
    text: 'House Guard: {reason} · {zone}. Sensor: {sensorName}.',
    imageDeviceIds: [], imageOnRepeat: false, repeatEnabled: false, repeatSeconds: 120,
    audio: [], lights: [], flows: [], unlockDoor: false,
    shutoff: { enabled: false, deviceId: '', validated: false },
  });
  return { enabled: false, sensors: [], waterHealth:waterHealthDefaults(), responses: { fire: response('fire'), water: response('water') } };
}
function validate(config) {
  const errors = [], add = (ok, message) => { if (!ok) errors.push(message); };
  const bool = (v, label) => add(typeof v === 'boolean', label + ' må være av/på');
  const str = (v, label) => add(typeof v === 'string' && v.length <= 500, label + ' må være tekst (maks 500 tegn)');
  const list = (v, limit, label) => add(Array.isArray(v) && v.length <= limit, label + ': maks ' + limit);
  const c = config.environment;
  if(c.waterHealth===undefined)c.waterHealth=waterHealthDefaults();
  for(const field of ['enabled','push','critical','timeline','restoredPush'])bool(c.waterHealth?.[field], 'Kontroll av vannsensorer '+field);
  for(const field of ['thresholdHours','repeatHours'])add(Number.isFinite(c.waterHealth?.[field])&&c.waterHealth[field]>=1&&c.waterHealth[field]<=720,'Kontroll av vannsensorer: velg 1 til 720 timer');
  bool(c.enabled, 'Brann og vann'); list(c.sensors, 100, 'Brann- og vannsensorer');
  const seen = new Set();
  for (const sensor of c.sensors || []) {
    str(sensor.deviceId, 'Sensor-ID');
    add(!!sensor.deviceId && !sensor.deviceId.startsWith('house-guard-internal-'), 'Velg en fysisk brann- eller vannsensor');
    add(!!model.kind(sensor.capability), 'Velg en røyk-, brann-, varme- eller vannalarmfunksjon');
    add(!seen.has(model.key(sensor)), 'En sensorfunksjon kan bare velges én gang'); seen.add(model.key(sensor));
  }
  if (c.enabled) add(c.sensors?.length > 0, 'Velg minst én sensor før du slår på Brann og vann');
  for (const type of Object.keys(TYPES)) {
    const r = c.responses?.[type];
    if (!r) { errors.push('Mangler varseloppsett for ' + TYPES[type]); continue; }
    for (const field of ['push','critical','timeline','restoredPush','imageOnRepeat','repeatEnabled','unlockDoor']) bool(r[field], TYPES[type] + ' ' + field);
    str(r.text, 'Alarmmelding'); add(!!r.text?.trim(), 'Skriv en alarmmelding');
    add(Number.isFinite(r.repeatSeconds) && r.repeatSeconds >= 60 && r.repeatSeconds <= 3600, 'Alarmgjentakelse må være mellom 60 og 3600 sekunder');
    for (const [field, limit] of [['imageDeviceIds',3],['audio',30],['lights',30],['flows',10]]) list(r[field], limit, TYPES[type] + ' ' + field);
    add(new Set(r.imageDeviceIds).size === r.imageDeviceIds?.length, 'Et kamera kan bare velges én gang');
    for (const id of r.imageDeviceIds || []) { str(id, 'Kamera-ID'); add(!!id, 'Velg kamera'); }
    for (const item of r.audio || []) {
      str(item.deviceId, 'Høyttaler'); add(!!item.deviceId, 'Velg høyttaler');
      add(['speak','sound'].includes(item.kind), 'Velg tale eller alarmlyd');
      str(item.text, 'Tale eller lyd'); add(!!item.text?.trim(), 'Velg tale eller lyd');
      add(Number.isFinite(item.volume) && item.volume >= 1 && item.volume <= 100, 'Volum må være mellom 1 og 100');
    }
    for (const id of r.lights || []) { str(id, 'Lys-ID'); add(!!id, 'Velg lys'); }
    add(new Set(r.lights).size === r.lights?.length, 'Et lys kan bare velges én gang');
    for (const item of r.flows || []) {
      str(item.flowId, 'Flow-ID'); add(!!item.flowId && ['normal','advanced'].includes(item.flowType), 'Velg en vanlig eller Advanced Flow');
    }
    add(new Set((r.flows || []).map(f => f.flowType + ':' + f.flowId)).size === r.flows?.length, 'En Flow kan bare velges én gang');
    bool(r.shutoff?.enabled, 'Vannstenging'); bool(r.shutoff?.validated, 'Bekreftet vannstenging'); str(r.shutoff?.deviceId, 'Vannstyring');
    if (r.shutoff?.enabled) add(type === 'water' && !!r.shutoff.deviceId && r.shutoff.validated, 'Velg vannstyring og bekreft at AV stenger vannet');
    if (r.unlockDoor) add(type === 'fire' && !!config.security.lockDeviceId, 'Velg ytterdørlås under Alarm før opplåsing ved brann');
  }
  if (errors.length) throw Error(errors.join('\n'));
}
function checkCatalog(config, catalog) {
  const devices = catalog?.devices || {};
  for (const sensor of config.environment.sensors) {
    const d = devices[sensor.deviceId], cap = d?.capabilities?.[sensor.capability];
    if (d && (!cap || cap.getable === false || (cap.type && cap.type !== 'boolean'))) throw Error('Sensoren tilbyr ikke valgt brann- eller vannalarmfunksjon.');
  }
  for (const r of Object.values(config.environment.responses)) {
    for (const id of r.lights) {
      const d = devices[id];
      if (d && (d.class !== 'light' || !d.capabilities?.onoff?.setable || require('./action-safety').protectedWrite(config,id,'onoff',d))) throw Error('Velg et lys med skrivbar av/på-funksjon under Brann og vann.');
    }
    if (r.shutoff.enabled) {
      const d = devices[r.shutoff.deviceId];
      if (!d?.capabilities?.onoff?.setable || d.capabilities.onoff.type !== 'boolean' || require('./action-safety').protectedWrite(config,d.id,'onoff',d)) throw Error('Vannstyring må være en egen av/på-enhet som er bekreftet å stenge vannet ved AV.');
    }
    if (r.unlockDoor && !devices[config.security.lockDeviceId]?.capabilities?.locked?.setable) throw Error('Ytterdøren tilbyr ikke skrivbar låsestatus.');
  }
}
function selectedDevices(config) {
  const ids = config.environment.sensors.map(s => s.deviceId);
  for (const r of Object.values(config.environment.responses)) {
    ids.push(...r.lights, ...r.audio.map(a => a.deviceId));
    if (r.shutoff.enabled) ids.push(r.shutoff.deviceId);
    if (r.unlockDoor) ids.push(config.security.lockDeviceId);
  }
  return ids.filter(Boolean);
}
module.exports = { TYPES, defaults, waterHealthDefaults, validate, checkCatalog, selectedDevices, ...model };
