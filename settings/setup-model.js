'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HouseGuardSetup = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const routineIds = ['away','home','night'];
  const flowKey = flow => `${flow.type}:${flow.id}`;
  function flowChoices(catalog) {
    return (catalog.flows || []).map(flow => {
      const reason = flow.enabled === false ? 'Deaktivert' : flow.broken ? 'Har feil' : flow.triggerable === false ? (flow.type === 'advanced' ? 'Mangler Start-kort' : 'Kan ikke startes uten tagg') : flow.triggerable !== true ? 'Oppdater Flow-listen' : '';
      return { ...flow, key:flowKey(flow), reason, selectable:!reason };
    }).sort((a,b) => a.name.localeCompare(b.name,'nb') || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  }
  function selections(config) {
    return Object.fromEntries(routineIds.map(id => {
      const actions=config.routines.find(r=>r.id===id)?.actions || [];
      const managed=actions.filter(a=>a.setupManaged===true);
      const candidates=managed.length ? managed : actions.filter(a=>a.kind==='flow' && a.category==='lights');
      return [id,candidates.length===1 && candidates[0].kind==='flow' ? `${candidates[0].flowType}:${candidates[0].flowId}` : ''];
    }));
  }
  function draft(config, options, catalog) {
    const next = JSON.parse(JSON.stringify(config));
    const people = [...new Set(options.people)];
    if (!people.length) throw new Error('Velg minst én person som teller som hjemme.');
    if (people.some(id=>!catalog.people[id] || catalog.people[id].available === false)) throw new Error('En valgt person er utilgjengelig. Oppdater personlisten.');
    next.people.presence = people;
    next.people.night = next.people.night.filter(id=>people.includes(id));
    if(options.useNightPeople) next.people.night = [...people];
    const choices = flowChoices(catalog);
    for(const [routineId, key] of Object.entries(options.flows || {})) {
      if(!routineIds.includes(routineId)) throw new Error('Ukjent rutine.');
      const selected = key ? choices.find(flow=>flow.key===key) : null;
      if(key && (!selected || !selected.selectable)) throw new Error('Valgt Flow mangler, er deaktivert, har feil eller kan ikke startes direkte. Oppdater Flow-listen.');
      const routine=next.routines.find(r=>r.id===routineId);
      if(!routine) throw new Error('Rutinen mangler.');
      const matches = a => selected && a.kind==='flow' && a.flowId===selected.id && a.flowType===selected.type;
      // Reuse a matching custom action instead of starting the same Flow twice.
      const keep = routine.actions.find(a=>a.setupManaged!==true && matches(a)) || routine.actions.find(matches);
      const removed = new Set(routine.actions.filter(a=>a.setupManaged===true && a!==keep).map(a=>a.id));
      if(routine.actions.some(a=>!removed.has(a.id) && removed.has(a.dependsOn))) throw new Error('Et tidligere veiviservalg brukes av en avansert handling. Rediger denne rutinen under Rutiner.');
      routine.actions = routine.actions.filter(a=>!removed.has(a.id));
      if(selected && !keep) {
        const id = `setup-${routineId}-flow-${selected.id}`;
        if(!/^[\w-]{1,100}$/.test(id) || routine.actions.some(a=>a.id===id)) throw new Error('Denne Flow-en må legges til under Rutiner.');
        routine.actions.push({id,kind:'flow',category:'lights',flowId:selected.id,flowType:selected.type,delaySeconds:0,onError:'continue',setupManaged:true});
      }
      if(selected)routine.enabled=true;
    }
    next.observation = true;
    return next;
  }
  function change(config, patch, catalog) {
    // Apply only the choice that was edited, leaving other wizard choices alone.
    const next = draft(config, { people: config.people.presence, ...patch }, catalog);
    if (patch.useNightPeople === false) next.people.night = [];
    next.observation = config.observation;
    return next;
  }
  return {draft,change,flowChoices,selections};
});
