'use strict';
const modes={armed:'full',partially_armed:'partial'};
const same=(a,b)=>a.deviceId===b.deviceId && a.capability===b.capability;
const modeName=mode=>mode==='armed'?'full alarm':'nattalarm';
function configured(config,sensor,mode){return config.security.intrusion.sensors.some(s=>same(s,sensor) && s[modes[mode]]);}
function clean(config,list){
  if(!Array.isArray(list))return [];
  return list.filter((s,i)=>s && modes[s.mode] && configured(config,s,s.mode) && !list.slice(0,i).some(p=>p && same(p,s) && p.mode===s.mode)).map(({deviceId,capability,mode})=>({deviceId,capability,mode}));
}
const disabled=(model,sensor,mode)=>model.disabledSensors.some(s=>same(s,sensor) && s.mode===mode);
function set(model,sensor,mode,enabled){
  if(!require('./intrusion').selected(model.config))throw Error('Slå på House Guard-alarm først.');
  if(!modes[mode] || typeof enabled!=='boolean')throw Error('Velg full alarm eller nattalarm og en gyldig sensorhandling.');
  if(!sensor || !configured(model.config,sensor,mode))throw Error('Sensoren er ikke valgt for denne modusen under Alarm → Sensorer.');
  if(disabled(model,sensor,mode)===!enabled)return false;
  if(enabled){
    model.disabledSensors=model.disabledSensors.filter(s=>!(same(s,sensor) && s.mode===mode));
    if(model.state.mode===mode && !model.state.bypassed.some(s=>same(s,sensor))){
      const d=model.snapshot.devices[sensor.deviceId];
      model.state.bypassed.push({deviceId:sensor.deviceId,capability:sensor.capability,name:d?.name || sensor.deviceId,zone:d?.zone || 'Ukjent sone'});
    }
  }else model.disabledSensors.push({deviceId:sensor.deviceId,capability:sensor.capability,mode});
  model.commit();return true;
}
function definitions(){
  const title=(no,en)=>({no,en});
  return [false,true].map(enabled=>({id:enabled?'enable_alarm_sensor':'disable_alarm_sensor',
    title:title(enabled?'Aktiver alarmsensor':'Deaktiver alarmsensor',enabled?'Enable alarm sensor':'Disable alarm sensor'),
    hint:title('Gjelder til sensoren aktiveres igjen, også etter omstart. En gjenaktivert sensor venter på rolig/lukket tilstand. Avstiller ikke en alarm eller påbegynt inngangsforsinkelse.','Applies until re-enabled, including after restart. Re-enabled sensors wait until inactive/closed. Does not dismiss an alarm or an entry countdown.'),
    args:[{name:'sensor',type:'autocomplete',title:title('Alarmsensor','Alarm sensor')},{name:'mode',type:'dropdown',title:title('Alarmmodus','Alarm mode'),values:[{id:'armed',title:title('Full alarm (borte)','Full alarm (away)')},{id:'partially_armed',title:title('Delvis alarm (natt)','Partial alarm (night)')}]}]}));
}
function register(app){
  for(const enabled of [false,true]){
    const card=app.homey.flow.getActionCard(enabled?'enable_alarm_sensor':'disable_alarm_sensor');
    card.registerArgumentAutocompleteListener('sensor',async(query,args={})=>{
      const c=app.engine.config,devices=app.adapter.catalogue.devices || {};
      return c.security.intrusion.sensors.filter(s=>!modes[args.mode] || s[modes[args.mode]]).map(s=>{
        const d=devices[s.deviceId];return {id:JSON.stringify([s.deviceId,s.capability]),deviceId:s.deviceId,capability:s.capability,name:`${d?.name || s.deviceId} · ${s.capability==='alarm_contact'?'Dør/vindu':'Bevegelse'}`,description:d?.zone || ''};
      }).filter(s=>(s.name+' '+s.description).toLowerCase().includes(query.toLowerCase()));
    });
    card.registerRunListener(async({sensor,mode})=>{
      if(!app.intrusion)throw Error('House Guard starter. Prøv igjen om litt.');
      try{const [deviceId,capability]=JSON.parse(sensor?.id);sensor={deviceId,capability};}catch{throw Error('Velg en alarmsensor fra listen i Flow-kortet.');}
      const changed=set(app.intrusion,sensor,mode,enabled),d=app.adapter.catalogue.devices?.[sensor.deviceId];
      app.engine.log(`${d?.name || sensor.deviceId}: ${enabled?'aktivert':'deaktivert'} for ${modeName(mode)} fra Flow${app.engine.config.observation?' (observasjon)':''}${changed?'':' – allerede valgt'}`,{result:'confirmed'});app.engine.save();return true;
    });
  }
}
module.exports={modes,same,configured,clean,disabled,set,definitions,register};
