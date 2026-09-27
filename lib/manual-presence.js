'use strict';
module.exports=async function setAllPresent(engine,value){
  if(typeof value!=='boolean')throw Error('Velg hjemme eller borte.');
  if(engine.presenceCommand)throw Error('Tilstedeværelse oppdateres allerede. Vent til kommandoen er ferdig.');
  const ids=[...new Set(engine.config.people.presence)];
  if(!ids.length)throw Error('Velg brukere under Personer først.');
  const revision=engine.config.revision,generation=engine.state.generation;
  const guard=()=>engine.config.revision===revision && engine.state.generation===generation && !engine.config.observation;
  engine.presenceCommand=true;
  try{
    const before=await engine.adapter.snapshot();engine.ingest(before);
    if(!before.connected || ids.some(id=>before.people[id]?.available===false || typeof before.people[id]?.present!=='boolean'))throw Error('Alle valgte brukere må være tilgjengelige i Homey før tilstedeværelsen kan endres.');
    if(engine.config.observation){engine.log(`Observasjon: ville satt alle ${ids.length} valgte brukere ${value?'hjemme':'borte'}`,{result:'observed'});return;}
    if(!guard())throw Error('Oppsettet ble endret. Prøv igjen.');
    const changed=ids.filter(id=>before.people[id].present!==value);
    if(!changed.length){engine.log(`Alle valgte brukere er allerede ${value?'hjemme':'borte'}`);return;}
    // Resolve every recipient before the first write. Never retry a timed-out write.
    const write=await engine.adapter.preparePresence(changed,value,guard);
    const failed=[];
    for(const id of changed){
      if(!guard()){failed.push(id);break;}
      try{await write(id);}catch{failed.push(id);engine.log(`Tilstedeværelse ikke bekreftet for ${before.people[id].name || id}`,{result:'failed'});}
    }
    // Actual Homey readings drive the ordinary arrival/departure routines.
    // Never synthesize an empty house or clear unknown presence to arm the alarm.
    const after=await engine.adapter.snapshot();engine.ingest(after);
    const unconfirmed=ids.filter(id=>after.people[id]?.available===false || after.people[id]?.present!==value);
    if(failed.length || unconfirmed.length || !guard())throw Error('Ikke alle endringer ble bekreftet. Kontroller personstatus og logg; ingen automatisk gjentakelse er sendt.');
    engine.log(`Alle ${ids.length} valgte brukere er bekreftet ${value?'hjemme':'borte'} i Homey`,{result:'confirmed'});
  }finally{engine.presenceCommand=false;engine.save();}
};
