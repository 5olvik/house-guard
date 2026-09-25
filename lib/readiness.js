'use strict';
const { builtins } = require('./plans');
const { presence } = require('./policy');
const integrationNeeds = require('./integration-needs');
function readiness(config, snapshot, catalog, state = {}, now = Date.now(), integrations = {}) {
  const checks = [], add = (id, title, level, detail) => checks.push({ id, title, level, detail });
  const device = id => snapshot.devices?.[id] || catalog.devices?.[id];
  const capability = (id, cap) => device(id)?.available !== false && device(id)?.capabilities?.[cap];
  const f = presence(config, snapshot.people || {}, now), needs = integrationNeeds(config);
  add('people', 'Personer', f.complete ? 'ready' : 'missing', f.complete ? 'Valgte personer har fersk tilstedeværelse. Ingen hjelpeflow nødvendig.' : 'Velg hvem som bor her og kontroller tilstedeværelsen i Homey.');
  const alarm = capability(config.security.alarmDeviceId, 'homealarm_state');
  const alarmNeeded = !!config.security.alarmDeviceId || config.night.automatic || config.security.autoUnlock || config.guest.disarmOnEnable;
  add('alarm', 'Heimdall', !alarmNeeded ? 'off' : alarm?.setable ? 'ready' : 'missing', !alarmNeeded ? 'Alarm er ikke valgt. Grunnfunksjonene kan brukes uten alarm.' : alarm?.setable ? 'Alarmmodus og alarmstatus leses direkte. Fysisk virkning må testes.' : 'Velg et tilgjengelig alarmpanel under Sikkerhet.');
  const lock = capability(config.security.lockDeviceId, 'locked');
  const lockNeeded = !!config.security.lockDeviceId || config.security.autoUnlock || config.security.lockOnArming || config.guest.unlockOnEnable;
  add('lock', 'Dørlås', !lockNeeded ? 'off' : lock?.setable && typeof lock.value === 'boolean' ? 'ready' : 'missing', !lockNeeded ? 'Automatisk låsing er ikke valgt.' : lock?.setable ? 'Låsen styres direkte i appens egne rutiner. Ingen Yale-hjelpeflow nødvendig.' : 'Velg en tilgjengelig lås under Sikkerhet.');
  const coverage = require('./bridges').coverage(config,catalog).enabled;
  const zone = snapshot.zones?.[config.night.zoneId];
  const zoneKnown = typeof zone?.active === 'boolean' && Number.isFinite(zone.observedAt) && zone.observedAt <= now && now - zone.observedAt <= config.freshnessSeconds * 1000;
  add('night', 'Mobilspørsmål om nattmodus', !needs.questions ? 'off' : zoneKnown && config.people.questions.length && config.bridges.questions && coverage.questions ? 'ready' : 'missing', !needs.questions ? 'Ikke valgt. Nattmodus kan startes fra Hjem.' : !zoneKnown ? 'Velg en sone med tilgjengelig aktivitet under Rutiner.' : !config.people.questions.length ? 'Velg hvem som skal få nattspørsmål under Personer.' : !config.bridges.questions || !coverage.questions ? 'Spørsmålskobling mangler. Se oppskriften under Mer → Koblinger.' : 'Spørsmålskoblingen er konfigurert. Faktisk mottak og svar må testes.');
  for (const [id, title, key, selected] of [['push','Mobilvarsler','notifications',needs.notifications],['audio','Tale og lyd','audio',needs.audio.length > 0]]) {
    const ready = config.bridges[key] && coverage[key];
    add(id, title, !selected ? 'off' : ready ? 'ready' : 'missing', !selected ? 'Ikke valgt. Du kan legge til dette senere.' : ready ? 'Koblingen er kontrollert. Mottak eller hørbar lyd er ikke bekreftet.' : 'Valgte handlinger trenger en kobling. Se Mer → Koblinger.');
  }
  const events = require('./flow-connections').eventTypes(catalog), direct = integrations.heimdall?.state === 'connected';
  const eventsReady = needs.events.every(type => direct || events.includes(type));
  add('heimdall-events', 'Hendelser fra Heimdall', !needs.events.length ? 'off' : eventsReady ? 'ready' : 'missing', !needs.events.length ? 'Ingen ekstra Heimdall-hendelser er valgt.' : direct ? `Direkte tilkoblet Heimdall ${integrations.heimdall.version}. Hendelser med detaljer bruker eksisterende Flow når den finnes.` : eventsReady ? 'Eksisterende hendelsesflow er koblet til.' : 'Heimdall-hendelser er utilgjengelige. Kontroller at Heimdall kjører og at alarmpanelet er valgt.');
  if (direct && needs.events.length) {
    const detailsReady = ['alarm','entryDelay','activeSensor'].every(type => events.includes(type));
    add('heimdall-details', 'Detaljert alarmtekst', detailsReady ? 'ready' : 'review', detailsReady ? 'Flow-koblingene for sone, årsak og sensorvarsel er konfigurert. Faktisk alarmtekst må testes.' : 'Direkte hendelser gir ikke alltid sensornavn, sone og årsak. Detaljert tekst er valgfritt og kan kobles inn med Flow.');
  }
  const garage = config.security.garage, temp = capability(garage.temperatureDeviceId, garage.temperatureCapability);
  const garageReady = garage.validated && typeof capability(garage.statusDeviceId, garage.statusCapability)?.value === 'boolean' && capability(garage.commandDeviceId, garage.commandCapability)?.setable && typeof temp?.value === 'number' && Number.isFinite(temp.updatedAt) && temp.updatedAt <= now && now - temp.updatedAt <= garage.maxAgeSeconds * 1000;
  add('garage', 'Garasjeport', !garage.enabled ? 'off' : garageReady ? 'ready' : 'missing', !garage.enabled ? 'Automatisk portstyring er ikke valgt.' : garageReady ? 'Status og temperatur er tilgjengelige. Porten krever kontroll av faktisk virkning.' : 'Fullfør portoppsettet under Sikkerhet: status, kommando og fersk utetemperatur.');
  for (const r of config.routines.filter(r => r.enabled)) {
    const count = builtins(r.id, config, {personId:config.people.presence[0]}, {...f,homeIds:config.people.night}).length + r.actions.length;
    if (!count) {
      // Empty built-in routines are optional, not fourteen setup errors on a new install.
      if (r.id === 'alarm' && config.security.alarmDeviceId) add('routine-alarm', r.name, 'review', 'Ingen reaksjon er valgt i House Guard. Heimdalls egne reaksjoner endres ikke.');
      continue;
    }
    for (const a of r.actions) {
      if (a.deviceId && (!device(a.deviceId) || device(a.deviceId).available === false)) add(`action-${r.id}-${a.id}`, r.name, 'missing', 'En valgt enhet mangler eller er utilgjengelig. Åpne rutinen og velg enhet på nytt.');
      if (a.flowId && !catalog.flows?.some(flow => flow.id === a.flowId && flow.enabled !== false && !flow.broken)) add(`action-${r.id}-${a.id}`, r.name, 'missing', 'En valgt Flow mangler, er deaktivert eller har feil.');
    }
  }
  const overlapping = (catalog.flows || []).filter(f => ['Home&Away','Lock&Unlock','Sovetid','Heimdall'].includes(f.name) && f.enabled !== false);
  if (overlapping.length) add('existing-flows', 'Eksisterende hovedflows', 'review', `${overlapping.map(f => f.name).join(', ')} er fortsatt aktive. Sammenlign i observasjon før overtakelse.`);
  return { checks, events: state.integrationEvents || {}, deliveries: state.deliveries || [], integrations, at: now };
}
module.exports = readiness;
