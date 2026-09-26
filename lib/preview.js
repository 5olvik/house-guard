'use strict';
const Engine = require('./engine');
const { builtins } = require('./plans');
const { garageDecision } = require('./policy');
module.exports = function preview(engine, id, config = engine.config, catalog = {}, snapshot = engine.snapshot) {
  const sandbox = new Engine({ config, clock: engine.clock });
  sandbox.snapshot = structuredClone(snapshot); sandbox.state = structuredClone(engine.state);
  const routine = sandbox.config.routines.find(r => r.id === id);
  if (!routine) throw new Error('Ukjent rutine');
  if (id === 'night') sandbox.state.manualNight = true;
  if (id === 'guestOn' || id === 'guestOff') sandbox.state.guest = id === 'guestOn';
  const context = id === 'nightArrival' ? { personId: sandbox.facts().homeIds[0] } : {};
  const actions = [...builtins(id, sandbox.config, context, sandbox.facts()), ...routine.actions];
  const run = { routineId: id, generation: sandbox.state.generation, startedAt: sandbox.clock(), context };
  const target = a => catalog.devices?.[a.deviceId]?.name || snapshot.devices?.[a.deviceId]?.name || catalog.people?.[a.personId]?.name || snapshot.people?.[a.personId]?.name || catalog.flows?.find(f => f.id === a.flowId)?.name || a.deviceId || a.personId || a.flowId || '';
  const results = new Map(); let stopped = false;
  return { id, name: routine.name, enabled: routine.enabled, at: sandbox.clock(), observation: engine.config.observation,
    note: 'Forhåndsvisning av valgt oppsett med nåværende tilstand. Ingen rutine er startet. Vilkårene kontrolleres på nytt ved faktisk kjøring.',
    actions: actions.map(a => {
      let reason = routine.enabled ? sandbox.guard(run, a, sandbox.snapshot) : 'Rutinen er slått av';
      if (stopped) reason = 'En tidligere handling ville stoppet rutinen';
      if (!reason && a.dependsOn && results.get(a.dependsOn) === 'skipped' && a.requireConfirmed) reason = 'Avhengig handling kan ikke bekreftes';
      if (!reason && a.deviceId && !snapshot.devices?.[a.deviceId] && !catalog.devices?.[a.deviceId]) reason = 'Målenheten mangler';
      if (!reason && ['set','verify'].includes(a.kind)) {
        const d = snapshot.devices?.[a.deviceId], cap = d?.capabilities?.[a.capability];
        if (!d || d.available === false || !cap) reason = 'Enheten eller funksjonen er utilgjengelig';
        else if (a.kind === 'set' && !cap.setable) reason = 'Enhetens funksjon kan ikke styres';
      }
      if (!reason && a.flowId && !catalog.flows?.some(f => f.id === a.flowId && f.type === a.flowType && !f.broken && f.enabled !== false && f.triggerable !== false)) reason = 'Flow mangler, er deaktivert, har feil eller kan ikke startes direkte';
      if (!reason && a.kind === 'garage') {
        const g = sandbox.config.security.garage, temp = sandbox.cap(g.temperatureDeviceId, g.temperatureCapability), port = sandbox.cap(g.statusDeviceId, g.statusCapability);
        reason = garageDecision({open: typeof port.value === 'boolean' ? port.value === g.openValue : null, temperature: temp.value, temperatureFresh: sandbox.sensorFresh(temp, g.maxAgeSeconds), nobodyAsleep: sandbox.facts().nobodyAsleep, validated:g.validated,commandType:g.commandType});
      }
      if (!reason && ['notify','speak','sound'].includes(a.kind) && !sandbox.config.bridges[a.kind === 'notify' ? 'notifications' : 'audio']) reason = 'Leveringsflow er ikke konfigurert';
      const current = a.kind === 'person' ? snapshot.people?.[a.personId]?.asleep : sandbox.cap(a.deviceId, a.capability).value;
      const result = reason ? 'skipped' : ['set','person','verify'].includes(a.kind) && current === a.value ? 'confirmed' : 'planned';
      results.set(a.id,result);
      if (a.kind === 'verify' && result === 'planned' && a.onError === 'stop') stopped = true;
      return { ...a, target: target(a), result, reason: reason || (result === 'confirmed' ? 'Ønsket tilstand er allerede bekreftet' : a.dependsOn ? 'Krever at tidligere handling bekreftes ved kjøring' : 'Vilkårene tillater handlingen nå; tidligere steg må lykkes'), delaySeconds: a.delaySeconds + (id === 'away' ? config.delays.away : id === 'home' ? config.delays.home : id === 'welcome' ? config.welcome.delaySeconds : 0) };
    }) };
};
