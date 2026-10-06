'use strict';
const { builtins } = require('./plans');
const { presence } = require('./policy');
const integrationNeeds = require('./integration-needs');
function readiness(config, snapshot, catalog, state = {}, now = Date.now(), integrations = {}) {
  const checks = [], add = (id, title, level, detail) => checks.push({ id, title, level, detail });
  const device = id => snapshot.devices?.[id] || catalog.devices?.[id];
  const capability = (id, cap) => device(id)?.available !== false && device(id)?.capabilities?.[cap];
  const f = presence(config, snapshot.people || {}, now), needs = integrationNeeds(config);
  add('people', 'Personer', f.complete ? 'ready' : 'missing', f.complete ? 'Valgte personer har fersk tilstedeværelse.' : 'Velg hvem som bor her og kontroller tilstedeværelsen i Homey.');
  const alarm = capability(config.security.alarmDeviceId, 'homealarm_state');
  const native=require('./intrusion').selected(config);
  const alarmNeeded = !!config.security.alarmDeviceId || config.night.automatic || config.security.autoUnlock;
  add('alarm', 'House Guard-alarm', !alarmNeeded ? 'off' : alarm?.setable ? 'ready' : 'missing', !alarmNeeded ? 'Alarm er ikke valgt. Grunnfunksjonene kan brukes uten alarm.' : native ? 'House Guard overvåker valgte alarmsensorer.' : alarm?.setable ? 'Alarmmodus og alarmstatus leses direkte. Fysisk virkning må testes.' : 'Slå på «Bruk House Guard-alarm» under Alarm.');
  if(native) {
    const sensors=config.security.intrusion.sensors, faults=integrations.intrusion?.faults || [];
    const unknown=sensors.filter(s=>typeof capability(s.deviceId,s.capability)?.value!=='boolean');
    add('intrusion-sensors','Alarmsensorer',sensors.length && !unknown.length && !faults.length?'ready':'missing',!sensors.length?'Velg sensorer for borte og natt under Alarm.':unknown.length?`${unknown.length} sensorer er ukjente eller utilgjengelige.`:faults.length?faults.join(' · '):`${sensors.length} sensorer leses direkte. Kontroller sensorvalg og prøv varsling under Alarm.`);
    if(!sensors.some(s=>s.full))add('intrusion-full','Bortealarm','missing','Velg minst én sensor for borte.');
    if(!sensors.some(s=>s.partial))add('intrusion-partial','Nattalarm','review','Ingen sensor er valgt for natt; nattalarm kan ikke kobles til.');
    const disabled=integrations.intrusion?.disabledSensors || [];
    if(disabled.length)add('intrusion-flow-disabled','Sensorer deaktivert fra Flow','review',`${disabled.length} sensor-/modusvalg er deaktivert. Se Alarm → Sensorer; bruk Aktiver alarmsensor for å gjenoppta overvåkningen.`);
  }
  const lock = capability(config.security.lockDeviceId, 'locked');
  const lockNeeded = !!config.security.lockDeviceId || config.security.autoUnlock || config.security.lockOnArming;
  add('lock', 'Dørlås', !lockNeeded ? 'off' : lock?.setable && typeof lock.value === 'boolean' ? 'ready' : 'missing', !lockNeeded ? 'Automatisk låsing er ikke valgt.' : lock?.setable ? 'Låsen styres direkte av House Guard.' : 'Velg en tilgjengelig lås under Alarm.');
  const direct=catalog.direct || {};
  if (config.environment?.enabled) {
    const sensors=config.environment.sensors, unavailable=sensors.filter(s=>!capability(s.deviceId,s.capability));
    const pending=sensors.filter(s=>capability(s.deviceId,s.capability)?.value===null);
    add('environment-sensors','Brann og vann',unavailable.length?'missing':'ready',unavailable.length?`${unavailable.length} valgte sensorer er utilgjengelige. Se Brann og vann → Sensorer.`:`${sensors.length} sensorfunksjoner overvåkes hele døgnet.${pending.length?` ${pending.length} har ingen alarmverdi rapportert ennå.`:''}`);
    const responses=[...new Set(sensors.map(s=>require('./environment-config').kind(s.capability)))].map(type=>config.environment.responses[type]);
    if(responses.some(r=>r.push||r.restoredPush||r.imageDeviceIds.length||r.audio.length||r.flows.length))add('environment-api','Direkte brann- og vannvarsler',direct.ready?'ready':'missing',direct.ready?'Bruker API-nøkkelen direkte. Ingen hjelpeflows.':'Kontroller API-nøkkelen under Innstillinger for push, kamera, Sonos og start av Flows.');
    const health=config.environment.waterHealth;
    if(health.enabled&&sensors.some(s=>require('./environment-config').kind(s.capability)==='water')){
      const warning=integrations.waterHealth?.warning;
      add('water-health','Kontroll av vannsensorer',warning?.active?'review':'ready',warning?.active?'Kontroller rapportering fra '+warning.names.join(', ')+'. Se Brann og vann → Sensorer.':`Kontrollerer måleoppdateringer med ${health.thresholdHours} timer som grense. Gammel verdi alene er ikke bevis på offline sensor.`);
      if((health.push||health.restoredPush)&&!direct.ready)add('water-health-api','Kontrollvarsel til telefon','missing','Kontroller API-nøkkelen under Innstillinger og velg mottakere under Personer.');
    }
  }
  if(require('./welcome-lights').enabled(config)) {
    const w=config.welcome,known=typeof capability(w.doorDeviceId,w.doorCapability)?.value==='boolean';
    add('welcome-sensor','Velkomstsensor',known?'ready':'missing',known?'Valgt sensor er tilgjengelig. Velkomstlys gjelder ti minutter etter første hjemkomst.':'Velg en tilgjengelig dørkontakt eller bevegelsessensor under Rutiner → Velkomstlys.');
    if(w.lightMode==='sunset')add('welcome-sun','Velkomstlys etter solnedgang',direct.ready && snapshot.sun?.available?'ready':'missing',!direct.ready?'Kontroller API-nøkkelen under Innstillinger.':snapshot.sun?.available?'Bruker Homeys solnedgang og soloppgang. Ingen lysmåler nødvendig.':'Solstatus er ukjent. Kontroller Homeys plassering og API-nøkkel.');
  }
  if(direct.configured)add('direct-api','API-nøkkel',direct.ready?'ready':'missing',direct.ready?'Forbindelsen er klar for Flow-start, varsler, lyd og sovestatus.':direct.problem || 'Kontroller API-nøkkelen under Innstillinger.');
  const coverage = direct.configured ? {questions:direct.ready,notifications:direct.ready && config.people.notifications.length>0 && config.people.notifications.every(id=>catalog.people?.[id]?.athomId && catalog.people[id].available!==false),audio:direct.ready} : require('./bridges').coverage(config,catalog).enabled;
  const zone = snapshot.zones?.[config.night.zoneId];
  const zoneKnown = typeof zone?.active === 'boolean' && Number.isFinite(zone.observedAt) && zone.observedAt <= now && now - zone.observedAt <= config.freshnessSeconds * 1000;
  add('night', 'Mobilspørsmål om nattmodus', !needs.questions ? 'off' : zoneKnown && config.people.questions.length && (direct.configured || config.bridges.questions) && coverage.questions ? 'ready' : 'missing', !needs.questions ? 'Ikke valgt. Nattmodus kan startes fra Hjem.' : !zoneKnown ? 'Velg en sone med tilgjengelig aktivitet under Rutiner.' : !config.people.questions.length ? 'Velg hvem som skal få nattspørsmål under Personer.' : !(direct.configured || config.bridges.questions) || !coverage.questions ? (direct.configured?'Kontroller API-nøkkelen under Innstillinger.':'Nattspørsmål krever API-nøkkel. Legg inn API-nøkkel under Innstillinger → API-nøkkel.') : direct.configured?'Nattspørsmål sendes direkte. Faktisk mottak og svar må testes.':'Spørsmålskoblingen er konfigurert. Faktisk mottak og svar må testes.');
  for (const [id, title, key, selected] of [['push','Mobilvarsler','notifications',needs.notifications],['audio','Tale og lyd','audio',needs.audio.length > 0]]) {
    const ready = (direct.configured || config.bridges[key]) && coverage[key];
    add(id, title, !selected ? 'off' : ready ? 'ready' : 'missing', !selected ? 'Ikke valgt. Du kan legge til dette senere.' : ready ? 'Koblingen er kontrollert. Mottak eller hørbar lyd er ikke bekreftet.' : direct.configured?(key==='notifications' && !config.people.notifications.length?'Velg mottakere under Personer.':'Kontroller API-nøkkelen og valgte mottakere under Innstillinger og Personer.'):'Direkte levering krever API-nøkkel. Legg inn API-nøkkel under Innstillinger → API-nøkkel.');
  }
  add('alarm-events','Alarmhendelser',native?'ready':'off','Sensor, sone, årsak og forsinkelser håndteres direkte av House Guard. Ingen hjelpeflows.');
  for (const a of require('./alarm-responses').allActions(config)) {
    const id = a.imageDeviceId || a.deviceId;
    if (id && (!device(id) || device(id).available === false)) add(a.id,'Alarmvalg','missing','Et valgt kamera, lys eller en høyttaler er utilgjengelig. Se Alarm.');
  }
  const garage = config.security.garage;
  const garageReady = garage.validated && typeof capability(garage.statusDeviceId, garage.statusCapability)?.value === 'boolean' && capability(garage.commandDeviceId, garage.commandCapability)?.setable;
  add('garage', 'Garasjeport', !garage.enabled ? 'off' : garageReady ? 'ready' : 'missing', !garage.enabled ? 'Automatisk portstyring er ikke valgt.' : garageReady ? 'Status og portkommando er tilgjengelige. Porten krever kontroll av faktisk virkning.' : 'Fullfør portoppsettet under Alarm: status og kommando.');
  for (const r of config.routines) {
    if(require('./guest-presence').retired(r.id))continue;
    const count = builtins(r.id, config, {personId:config.people.presence[0]}, {...f,homeIds:config.people.night}).length + (r.enabled ? r.actions.length : 0);
    if (!count) {
      // Empty built-in routines are optional, not fourteen setup errors on a new install.
      if (r.id === 'alarm' && config.security.alarmDeviceId) add('routine-alarm', r.name, 'review', 'Ingen alarmreaksjon er valgt i House Guard. Velg push, kamera, lyd eller lys under Alarm.');
      continue;
    }
    for (const a of r.enabled ? r.actions : []) {
      if (a.deviceId && (!device(a.deviceId) || device(a.deviceId).available === false)) add(`action-${r.id}-${a.id}`, r.name, 'missing', 'En valgt enhet mangler eller er utilgjengelig. Åpne rutinen og velg enhet på nytt.');
      if(a.kind==='flow' && !direct.configured && require('./scene-flows').count(catalog,a.flowId,a.flowType)!==1)add(`scene-${r.id}-${a.id}`,r.name,'missing','Valgt Flow krever direkte forbindelse. Legg inn API-nøkkel under Innstillinger → API-nøkkel.');
      if (a.flowId && !catalog.flows?.some(flow => flow.id === a.flowId && flow.type === a.flowType && flow.enabled !== false && !flow.broken && flow.triggerable !== false)) add(`action-${r.id}-${a.id}`, r.name, 'missing', 'En valgt Flow mangler, er deaktivert, har feil eller kan ikke startes direkte.');
    }
  }
  const sleep=require('./sleep-flows');
  for(const person of sleep.selected(config))if(!direct.configured && sleep.count(catalog,person.id,person.value)!==1)add('sleep-'+person.id+'-'+person.value,'Sovestatus','missing','Sovestatus for '+(catalog.people?.[person.id]?.name || 'valgt person')+' krever API-nøkkel under Innstillinger → API-nøkkel.');
  const overlapping = (catalog.flows || []).filter(f => ['Home&Away','Lock&Unlock','Sovetid','Heimdall'].includes(f.name) && f.enabled !== false);
  if (overlapping.length) add('existing-flows', 'Eksisterende hovedflows', 'review', `${overlapping.map(f => f.name).join(', ')} er fortsatt aktive. Se over dem for å unngå doble handlinger.`);
  return { checks, events: state.integrationEvents || {}, deliveries: state.deliveries || [], integrations, at: now };
}
module.exports = readiness;
