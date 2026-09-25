'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HouseGuardSetup = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function lightChoices(config, catalog) {
    return Object.values(catalog.devices || {}).filter(d => d.available !== false && d.class === 'light' && d.capabilities?.onoff?.type === 'boolean' && d.capabilities.onoff.setable && !d.capabilities.locked && !d.capabilities.lock_unlock_open && ![config.security.lockDeviceId,config.security.garage.commandDeviceId].includes(d.id));
  }
  function draft(config, options, catalog) {
    const next = JSON.parse(JSON.stringify(config));
    const people = [...new Set(options.people)];
    if (!people.length) throw new Error('Velg minst én person som teller som hjemme.');
    if (people.some(id=>!catalog.people[id] || catalog.people[id].available === false)) throw new Error('En valgt person er utilgjengelig. Oppdater personlisten.');
    next.people.presence = people;
    next.people.night = next.people.night.filter(id=>people.includes(id));
    if(options.useNightPeople) next.people.night = [...people];
    const choices = new Set(lightChoices(next,catalog).map(d=>d.id));
    for(const [routineId, ids] of Object.entries(options.lights || {})) {
      if(!['away','home','night'].includes(routineId)) throw new Error('Ukjent lysrutine.');
      const selected = [...new Set(ids)];
      if(selected.some(id=>!choices.has(id))) throw new Error('Et valgt lys er utilgjengelig eller støtter ikke av/på.');
      const routine=next.routines.find(r=>r.id===routineId);
      if(!routine) throw new Error('Rutinen mangler.');
      // Only replace actions originally created by this wizard. Preserve custom scenes and dependencies.
      const removed = new Set(routine.actions.filter(a=>a.setupManaged===true).map(a=>a.id));
      if(routine.actions.some(a=>a.setupManaged!==true && removed.has(a.dependsOn))) throw new Error('Et lysvalg brukes av en avansert handling. Rediger denne rutinen under Rutiner.');
      routine.actions = routine.actions.filter(a=>a.setupManaged!==true);
      for(const deviceId of selected) {
        if(routine.actions.some(a=>a.kind==='set' && a.deviceId===deviceId && a.capability==='onoff')) throw new Error('Dette lyset styres allerede av en tilpasset handling. Rediger rutinen under Rutiner.');
        const id = `setup-${routineId}-${deviceId}`;
        if(!/^[\w-]{1,100}$/.test(id)) throw new Error('Lyset må legges til under Rutiner.');
        routine.actions.push({id,kind:'set',category:'lights',deviceId,capability:'onoff',value:routineId==='home',delaySeconds:0,onError:'continue',confirmSeconds:60,setupManaged:true});
      }
      if(selected.length)routine.enabled=true;
    }
    next.observation = true;
    return next;
  }
  return {draft,lightChoices};
});
