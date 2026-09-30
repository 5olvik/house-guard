'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HouseGuardOnboarding = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const NATIVE_ALARM = 'house-guard-internal-alarm';
  const alarmEvents = ['alarm', 'arming', 'entryDelay', 'activeSensor', 'alarmOff'];
  const retired = ['guestOn', 'guestOff'];
  const list = value => Array.isArray(value) ? value : [];
  const unique = values => [...new Set(values)];
  const cameras = response => list(response?.imageDeviceIds ?? (response?.imageDeviceId ? [response.imageDeviceId] : []));
  const native = config => config.security?.alarmDeviceId === NATIVE_ALARM;
  const routines = config => list(config.routines).filter(r => !retired.includes(r.id));
  const nightConfigured = config => !!(list(config.people?.night).length || config.night?.automatic || config.night?.wakeArrival || config.morning?.scheduled || config.morning?.motion?.enabled);

  function inferFeatures(config) {
    return {
      alarm: native(config),
      routines: routines(config).some(r => !alarmEvents.includes(r.id) && list(r.actions).length > 0),
      night: nightConfigured(config),
    };
  }

  function steps(features = {}) {
    return ['features', 'connection', 'people', ...(features.alarm ? ['alarm'] : []), ...(features.routines ? ['routines'] : []), ...(features.night ? ['night'] : []), 'finish'];
  }

  function finish(config) {
    return { ...JSON.parse(JSON.stringify(config)), setupCompleted:true, observation:false };
  }
  function defer(config) {
    // Discard a failed activation choice when the user chooses to continue later.
    return { ...JSON.parse(JSON.stringify(config)), setupCompleted:false, observation:true };
  }

  // A checklist describes current configuration. Guide choices never disable,
  // repair or otherwise change an existing feature or its runtime state.
  function checklist(config, data = {}, features = inferFeatures(config)) {
    const checks = [], catalog = data.catalog || {}, status = data.status || {};
    const add = (id, title, ready, detail, step, required = true, target) => checks.push({ id, title, detail, ready: !!ready, required: !!required, step, ...(target ? { target } : {}) });
    const person = id => catalog.people?.[id] || status.people?.[id];
    const personAvailable = id => !!person(id) && person(id).available !== false && status.people?.[id]?.available !== false;
    const name = id => person(id)?.name || id;
    const device = id => status.devices?.[id] || catalog.devices?.[id];
    const available = id => !!device(id) && device(id).available !== false;
    const booleanSensor = sensor => available(sensor.deviceId) && typeof device(sensor.deviceId).capabilities?.[sensor.capability]?.value === 'boolean';
    const presentIds = list(config.people?.presence);
    const unavailablePeople = presentIds.filter(id => !personAvailable(id) || (status.people && typeof status.people[id]?.present !== 'boolean'));
    add('people', 'Hvem bor her?', presentIds.length > 0 && !unavailablePeople.length,
      !presentIds.length ? 'Velg minst én beboer som skal telle med når huset er hjemme eller borte.' : unavailablePeople.length ? `Tilstedeværelse mangler for ${unavailablePeople.map(name).join(', ')}. Kontroller personene i Homey.` : `${presentIds.length} valgte beboere er tilgjengelige.`, 'people');
    if (typeof status.connected === 'boolean') add('homey', 'Kontakt med Homey', status.connected,
      status.connected ? 'Personer og enheter kan leses fra Homey.' : 'Vent på forbindelsen til Homey og oppdater status.', 'connection');
    const nightIds = list(config.people?.night);
    // Motion morning uses the presence selection, not the night selection.
    // Reopening guidance must not turn a valid motion-only setup into an error.
    const motionOnly = config.morning?.motion?.enabled && !config.night?.automatic && !config.morning?.scheduled;
    if ((features.night && !motionOnly) || config.night?.automatic || config.morning?.scheduled || nightIds.length) {
      const unavailableNight = nightIds.filter(id => !presentIds.includes(id) || !personAvailable(id));
      add('night-people', 'Hvem teller med om natten?', nightIds.length > 0 && !unavailableNight.length,
        !nightIds.length ? 'Velg minst én beboer som skal telle med i nattmodus og vanlig morgenrutine.' : unavailableNight.length ? `Kontroller nattutvalget: ${unavailableNight.map(name).join(', ')}. Personene må være tilgjengelige og valgt som beboere.` : `${nightIds.length} tilgjengelige beboere teller med om natten.`, 'night');
    }

    const activeRoutines = routines(config).filter(r => r.enabled !== false);
    const actions = activeRoutines.flatMap(r => list(r.actions));
    const responses = native(config) ? Object.values(config.security?.responses || {}) : [];
    const notificationNeeded = list(config.people?.notifications).length > 0 || actions.some(a => a.kind === 'notify') || responses.some(r => r.push || cameras(r).length);
    const audioNeeded = actions.some(a => ['speak', 'sound'].includes(a.kind)) || responses.some(r => list(r.audio).length);
    const personStatusNeeded = list(config.people?.night).length > 0 || config.night?.wakeArrival || config.morning?.motion?.enabled || actions.some(a => a.kind === 'person');
    const flowNeeded = actions.some(a => a.kind === 'flow');
    const reasons = [flowNeeded && 'starte Flows', notificationNeeded && 'sende varsler', audioNeeded && 'spille lyd', personStatusNeeded && 'endre sovestatus', config.night?.automatic && 'sende nattspørsmål'].filter(Boolean);
    const direct = data.direct || catalog.direct || {};
    add('direct-api', 'API-nøkkel', direct.configured === true && direct.ready === true,
      reasons.length ? (direct.configured && direct.ready ? `Forbindelsen er klar til å ${reasons.join(', ')}.` : `Koble til Homey for å ${reasons.join(', ')}.`) : 'Valgfritt for grunnleggende tilstedeværelse. Flows, pushvarsler, lyd og endring av personstatus trenger direkte forbindelse.', 'connection', reasons.length > 0);

    if (features.alarm || native(config)) {
      add('alarm-enabled', 'House Guard-alarm', native(config), native(config) ? 'Den innebygde alarmen er valgt.' : 'Slå på House Guard-alarm for å bruke alarmfunksjonen.', 'alarm');
      if (native(config)) {
        const sensors = list(config.security?.intrusion?.sensors);
        // Missing automation fields use the same true defaults as alarm-automation.js.
        const modes = [['full', 'away', 'Bortealarm'], ['partial', 'night', 'Nattalarm']].filter(([, event]) => event==='away' || config.security?.automation?.[event] !== false);
        const checkSensors = (id, title, selected) => {
          const bad = selected.filter(sensor => !booleanSensor(sensor));
          add(id, title, selected.length > 0 && !bad.length,
            !selected.length ? `Velg minst én sensor for ${title.toLocaleLowerCase('nb-NO')}.` : bad.length ? `Kontroller sensorene: ${unique(bad.map(s => device(s.deviceId)?.name || s.deviceId)).join(', ')}. Status må være kjent i Homey.` : `${selected.length} valgte sensorer har kjent status. Aktive sensorer tas med når de blir inaktive.`, 'alarm');
        };
        if (modes.length) for (const [mode, , title] of modes) checkSensors(`alarm-${mode}`, title, sensors.filter(s => s[mode] === true));
        else checkSensors('alarm-sensors', 'Alarmsensorer', sensors.filter(s => s.full || s.partial));
        if (config.observation && data.intrusion) {
          const intrusion = data.intrusion;
          const idle = intrusion.mode === 'disarmed' && !intrusion.target && !intrusion.active && !intrusion.entryAt && !intrusion.exitAt;
          add('alarm-idle', 'Kontroller alarmstatus', idle, idle ? 'Alarmen er frakoblet. Du kan fullføre oppsettet.' : 'Frakoble alarmen under Alarm før du tar House Guard i bruk.', 'alarm');
        }
      }
    }

    if (notificationNeeded) {
      const recipients = list(config.people?.notifications);
      const bad = recipients.filter(id => !personAvailable(id) || !person(id).athomId);
      add('push-recipients', 'Mottakere av pushvarsler', recipients.length > 0 && !bad.length,
        !recipients.length ? 'Velg hvem som skal motta pushvarsler under Personer.' : bad.length ? `Kontroller varselmottakerne: ${bad.map(name).join(', ')}.` : `${recipients.length} mottakere er valgt. Send et testvarsel for å sjekke mottak på telefonen.`, 'people');
    }
    for (const routine of activeRoutines) for (const action of list(routine.actions)) {
      if (action.kind !== 'flow') continue;
      const flow = list(catalog.flows).find(f => f.id === action.flowId && f.type === action.flowType);
      const reason = !flow ? 'Flow-en mangler.' : flow.enabled === false ? 'Flow-en er deaktivert.' : flow.broken ? 'Flow-en har feil.' : flow.triggerable === false ? (flow.type === 'advanced' ? 'Advanced Flow trenger et Start-kort.' : 'Flow-en kan ikke startes direkte uten en tagg.') : flow.triggerable !== true ? 'Oppdater Flow-listen for å kontrollere om den kan startes.' : '';
      const alarmEvent = alarmEvents.includes(routine.id);
      const target = alarmEvent ? { tab:'security', alarmTab:'notifications', id:'routine-'+routine.id } : !['away','home','night'].includes(routine.id) ? { tab:'routines', id:'routine-'+routine.id } : undefined;
      add(`flow-${routine.id}-${action.id}`, `${routine.name || 'Rutine'}: ${flow?.name || 'Valgt Flow'}`, !reason,
        reason || 'Flow-en er tilgjengelig og kan startes direkte.', alarmEvent ? 'alarm' : 'routines', true, target);
    }
    if (config.night?.automatic) {
      const recipients = list(config.people?.questions);
      add('night-questions', 'Mottakere av nattspørsmål', recipients.length > 0 && recipients.every(id => personAvailable(id) && !!person(id).athomId),
        recipients.length ? 'Valgte mottakere må være tilgjengelige Homey-brukere.' : 'Velg hvem som skal få spørsmål om å starte natten.', 'night', true, { tab:'people', id:'people-selection' });
      const zone = status.zones?.[config.night.zoneId] || catalog.zones?.[config.night.zoneId];
      add('night-zone', 'Sone for nattspørsmål', !!zone && (status.zones === undefined || typeof zone.active === 'boolean'),
        'Velg en sone med kjent aktivitet. Nattspørsmålet sendes etter at sonen har vært rolig.', 'night', true, { tab:'routines', id:'night-activation-settings' });
    }
    return checks;
  }
  return { inferFeatures, steps, checklist, finish, defer };
});
