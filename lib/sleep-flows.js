'use strict';
const {randomUUID}=require('node:crypto');
const {fullId,OWN,collect}=require('./flow-connections');
const ID='sleep_status_requested';
const definition={id:ID,title:{no:'Sovestatus skal endres',en:'Sleep status should change'},titleFormatted:{no:'Sett [[person]] [[state]]',en:'Set [[person]] [[state]]'},hint:{no:'Koble til Tilstedeværelse → Sett sovende/våken for samme person. Se Mer → Koblinger.',en:'Connect to Presence → Set asleep/awake for the same person. See More → Connections.'},args:[{name:'person',type:'autocomplete',title:{no:'Person',en:'Person'}},{name:'state',type:'dropdown',values:[{id:'asleep',title:{no:'sovende',en:'asleep'}},{id:'awake',title:{no:'våken',en:'awake'}}]}]};
function selected(config){
  const result=[],add=(id,value)=>result.push({id,value});
  config.people.night.forEach(id=>add(id,true));
  config.people.night.forEach(id=>add(id,false));
  config.people.presence.forEach(id=>add(id,false));
  require('./guest-presence').activeRoutines(config).flatMap(r=>r.actions).filter(a=>a.kind==='person').forEach(a=>add(a.personId,a.value));
  return [...new Map(result.map(r=>[r.id+':'+r.value,r])).values()];
}
function routes(catalog){
  const routes=[];
  for(const f of catalog.integrationFlows || []){
    if(f.enabled===false || f.broken)continue;
    const candidates=f.type==='normal'?[{root:f.trigger,actions:f.actions || [],conditions:f.conditions || []}]:Object.values(f.cards || {}).filter(c=>c.type==='trigger').map(root=>({root,actions:(root.outputSuccess || []).map(id=>f.cards[id]),conditions:[]}));
    for(const {root,actions,conditions}of candidates){
      if(fullId(root)!==OWN+ID || conditions.length || actions.length!==1)continue;
      const a=actions[0],p=root.args?.person,state=root.args?.state;
      if(!p?.id || !['asleep','awake'].includes(state) || a?.delay || a?.group && a.group!=='then')continue;
      if(fullId(a)==='homey:manager:presence:set_'+state && a.args?.user?.id===p.id && a.args.user.athomId)routes.push({id:p.id,value:state==='asleep'});
    }
  }return routes;
}
const count=(catalog,id,value)=>routes(catalog).filter(r=>r.id===id && r.value===value).length;
function register(app){
  const card=app.homey.flow.getTriggerCard(ID);
  card.registerArgumentAutocompleteListener('person',async query=>Object.values(app.adapter.catalogue.people).filter(p=>p.available!==false && p.name.toLowerCase().includes(query.toLowerCase())).map(p=>({id:p.id,name:p.name})));
  card.registerRunListener((args,state)=>{
    const r=app.adapter.sleepRequests?.get(state?.requestId);
    if(!r || r.id!==args.person?.id || (r.value?'asleep':'awake')!==args.state || Date.now()-r.at>30000)return false;
    try{app.adapter.authorize(r.guard);}catch{return false;}
    const person=app.engine.snapshot.people[r.id];
    if(person?.present!==!r.away || r.away && r.value!==false || !require('./policy').validPerson(person,app.engine.clock(),app.engine.config.freshnessSeconds*1000))return false;
    app.adapter.sleepRequests.delete(state.requestId);return true;
  });
}
async function dispatch(adapter,id,value,guard,onDispatch,{away=false}={}){
  adapter.authorize(guard);if(typeof value!=='boolean')throw Error('Sovestatus må være av/på.');
  const person=await adapter.api.users.getUser({id,$cache:false});
  if(away && value!==false)throw Error('Bortreiste brukere kan bare settes våkne.');
  if(!person || person.enabled===false || person.present!==!away)throw Error(away?'Personen er ikke bekreftet borte.':'Personen er ikke bekreftet hjemme.');
  if(person.asleep===value)return;
  const [flows,advanced]=await Promise.all([adapter.api.flow.getFlows({$cache:false}),adapter.api.flow.getAdvancedFlows({$cache:false})]);
  if(count({integrationFlows:collect(flows,advanced)},id,value)!==1)throw Error('Sovestatus trenger én kobling for denne personen. Se Mer → Koblinger.');
  adapter.authorize(guard);adapter.sleepRequests ||= new Map();
  for(const [key,r]of adapter.sleepRequests)if(Date.now()-r.at>30000)adapter.sleepRequests.delete(key);
  const requestId=randomUUID();adapter.sleepRequests.set(requestId,{id,value,away,guard,at:Date.now()});
  try{onDispatch();await adapter.homey.flow.getTriggerCard(ID).trigger({}, {requestId});}catch(error){adapter.sleepRequests.delete(requestId);throw error;}
}
module.exports={ID,definition,selected,routes,count,register,dispatch};
