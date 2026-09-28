'use strict';
const {validPerson}=require('./policy');
function eligible(engine,id,snapshot=engine.snapshot){
  const person=snapshot.people?.[id];
  return snapshot.connected && engine.config.people.presence.includes(id)
    && validPerson(person,engine.clock(),engine.config.freshnessSeconds*1000)
    && person.present===false;
}
function reconcile(engine){
  engine.awaySleepAttempts ||= new Map();
  for(const id of engine.awaySleepAttempts.keys()){
    const p=engine.snapshot.people?.[id];
    if(!engine.config.people.presence.includes(id) || (validPerson(p,engine.clock(),engine.config.freshnessSeconds*1000) && (p.present===true || p.asleep===false)))engine.awaySleepAttempts.delete(id);
  }
  for(const id of engine.config.people.presence){
    if(!eligible(engine,id) || engine.snapshot.people[id].asleep!==true)continue;
    if(engine.awaySleepAttempts.get(id)===engine.state.generation){
      const last=engine.runs.findLast(r=>r.routineId==='departureWake' && r.context.personId===id);
      if(!last?.cancelled || last.actions.some(a=>a.sentAt!==undefined))continue;
    }
    const run=engine.start('departureWake',{personId:id});
    if(run)engine.awaySleepAttempts.set(id,engine.state.generation);
  }
}
module.exports={eligible,reconcile};
