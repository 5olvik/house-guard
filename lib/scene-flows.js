'use strict';
const {randomUUID}=require('node:crypto');
const {fullId,OWN}=require('./flow-connections');
const ID='scene_requested', START='homey:manager:flow:programmatic_trigger';
const definition={id:ID,title:{no:'En valgt Flow skal startes',en:'A selected Flow should start'},titleFormatted:{no:'Start [[flow]]',en:'Start [[flow]]'},hint:{no:'Koble til Flow → Start en Flow og velg samme Flow. Se Mer → Koblinger.',en:'Connect to Flow → Start a Flow and select the same Flow. See More → Connections.'},args:[{name:'flow',type:'autocomplete',title:{no:'Flow',en:'Flow'}}]};
function routes(catalog){
  const routes=[];
  for(const flow of catalog.integrationFlows || []){
    if(flow.enabled===false || flow.broken)continue;
    const candidates=flow.type==='normal' ? [{root:flow.trigger,actions:flow.actions || [],conditions:flow.conditions || []}] : Object.values(flow.cards || {}).filter(c=>c.type==='trigger').map(root=>({root,actions:(root.outputSuccess || []).map(id=>flow.cards[id]),conditions:[]}));
    for(const {root,actions,conditions} of candidates){
      if(fullId(root)!==OWN+ID || conditions.length || actions.length!==1)continue;
      const a=actions[0],target=root.args?.flow,actual=a?.args?.flow;
      if(!target?.id || !['normal','advanced'].includes(target.type) || fullId(a)!==START || a.delay || (a.group && a.group!=='then'))continue;
      if(actual?.id===target.id && actual.type===(target.type==='normal'?'standard':'advanced'))routes.push({id:target.id,type:target.type});
    }
  }
  return routes;
}
const count=(catalog,id,type)=>routes(catalog).filter(r=>r.id===id && r.type===type).length;
function selected(config){return [...new Map(config.routines.filter(r=>r.enabled).flatMap(r=>r.actions.filter(a=>a.kind==='flow')).map(a=>[`${a.flowType}:${a.flowId}`,{id:a.flowId,type:a.flowType}])).values()];}
function register(app){
  const card=app.homey.flow.getTriggerCard(ID);
  card.registerArgumentAutocompleteListener('flow',async query=>app.adapter.catalogue.flows.filter(f=>selected(app.engine.config).some(s=>s.id===f.id && s.type===f.type) && f.name.toLowerCase().includes(query.toLowerCase())).map(f=>({id:f.id,name:f.name,type:f.type})));
  card.registerRunListener((args,state)=>{
    const requests=app.adapter.sceneRequests,request=requests?.get(state?.requestId);
    if(!request || request.id!==args.flow?.id || request.type!==args.flow?.type || Date.now()-request.at>30000)return false;
    try{app.adapter.authorize(request.guard);}catch{return false;}
    requests.delete(state.requestId);return true;
  });
}
async function dispatch(adapter,id,type,guard,onDispatch){
  adapter.sceneRequests ||= new Map();
  for(const [key,r] of adapter.sceneRequests)if(Date.now()-r.at>30000)adapter.sceneRequests.delete(key);
  const requestId=randomUUID();adapter.authorize(guard);
  adapter.sceneRequests.set(requestId,{id,type,guard,at:Date.now()});
  try{onDispatch();await adapter.homey.flow.getTriggerCard(ID).trigger({}, {requestId});}
  catch(error){adapter.sceneRequests.delete(requestId);throw error;}
}
module.exports={ID,START,definition,routes,count,selected,register,dispatch};
