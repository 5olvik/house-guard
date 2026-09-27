'use strict';
const {randomUUID}=require('node:crypto');
const BUSY=new Set(['checking','dispatching','sent','waiting']);
const cap=(snapshot,id,key)=>{const d=snapshot.devices?.[id];return d?.available!==false?d?.capabilities?.[key]?.value:undefined;};
function reason(config,snapshot,action){
  if(!snapshot.connected)return 'Homey er ikke tilkoblet.';
  const s=config.security,g=s.garage;
  if(action.manualControl==='lock'){
    if(!s.lockDeviceId || typeof cap(snapshot,s.lockDeviceId,'locked')!=='boolean')return 'Låsen har ukjent status.';
  }else if(action.manualControl==='garage'){
    if(!g.validated || !g.statusDeviceId || !g.commandDeviceId || !g.commandCapability)return 'Fullfør og kontroller portoppsettet under Alarm.';
    if(!['pulse','close'].includes(g.commandType))return 'Portkommandoen er ikke støttet.';
    if(typeof cap(snapshot,g.statusDeviceId,g.statusCapability)!=='boolean')return 'Garasjeporten har ukjent status.';
    if(action.manualValue && g.commandType!=='pulse')return 'Portoppsettet har bare en lukk-kommando.';
  }else return 'Ukjent manuell kommando.';
  const opening=action.manualControl==='lock'?!action.value:action.manualValue;
  if(opening && s.alarmDeviceId && (cap(snapshot,s.alarmDeviceId,'homealarm_state')!=='disarmed' || snapshot.devices?.[s.alarmDeviceId]?.alarmTarget))return 'Frakoble alarmen før du låser opp eller åpner porten.';
  return null;
}
function action(config,target,value){
  if(!['lock','garage'].includes(target) || typeof value!=='boolean')throw Error('Velg lås eller port og en gyldig kommando.');
  const s=config.security,g=s.garage;
  return {id:'manual-'+target,kind:target==='lock'?'set':'garage',category:target,builtin:true,manualControl:target,manualValue:value,guestExplicit:true,
    ...(target==='lock'?{deviceId:s.lockDeviceId,capability:'locked',value,guardedUnlock:!value}:{deviceId:g.commandDeviceId,capability:g.commandCapability,value:g.commandValue,confirm:{deviceId:g.statusDeviceId,capability:g.statusCapability,value:value?g.openValue:!g.openValue}}),
    delaySeconds:0,onError:'stop',confirmSeconds:60,status:'pending'};
}
function busy(engine,target){
  const id=target==='lock'?engine.config.security.lockDeviceId:engine.config.security.garage.commandDeviceId;
  return engine.runs.some(r=>r.actions.some(a=>a.deviceId===id && ((!r.cancelled && (BUSY.has(a.status) || a.manualControl===target && a.status==='pending')) || target==='garage' && a.sentAt!==undefined && engine.clock()-a.sentAt<30000)));
}
function status(engine){
  return Object.fromEntries(['lock','garage'].map(target=>{
    const pending=busy(engine,target),options=Object.fromEntries([true,false].map(value=>{
      const a=action(engine.config,target,value),problem=pending?'En kommando pågår. Vent på bekreftet status.':reason(engine.config,engine.snapshot,a);
      return [String(value),{allowed:!problem,reason:problem}];
    }));return [target,{pending,options}];
  }));
}
async function run(engine,target,value){
  const a=action(engine.config,target,value);
  if(busy(engine,target))throw Error('En kommando pågår. Vent på bekreftet status.');
  const run={id:randomUUID(),routineId:'manualControl',context:{target},generation:engine.state.generation,startedAt:engine.clock(),dueAt:engine.clock(),execution:'sequential',actions:[a]};
  engine.runs.push(run);engine.log(target==='lock'?(value?'Manuell låsing':'Manuell opplåsing'):(value?'Manuell åpning av port':'Manuell lukking av port'),{runId:run.id,result:'pending'});engine.save();
  await engine.execute(run,a);
  if(['failed','skipped'].includes(a.status))throw Error(a.error || 'Kommandoen kunne ikke utføres. Se hendelsesloggen.');
  return a.status;
}
module.exports={action,reason,busy,status,run};
