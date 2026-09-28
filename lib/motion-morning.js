'use strict';
const {inWindow}=require('./policy');
const {selected}=require('./intrusion');

// Called in sensor-event order, before the same event reaches the alarm engine.
module.exports=function motionMorning(app,snapshot,{event,reset=false}={}){
  const engine=app.engine,c=engine.config,m=c.morning.motion;
  const device=snapshot.devices[m.deviceId],cap=device?.capabilities[m.capability];
  const valid=snapshot.connected && device?.available!==false && typeof cap?.value==='boolean';
  if(reset || !app.motionMorningReading || app.motionMorningReading.revision!==c.revision){
    app.motionMorningReading={revision:c.revision,value:valid?cap.value:null};return false;
  }
  if(event && (event.id!==m.deviceId || event.capability!==m.capability))return false;
  const reading=app.motionMorningReading,previous=reading.value;
  reading.value=valid ? (event?event.value:cap.value) : null;
  if(!m.enabled || previous!==false || reading.value!==true)return false;
  if(engine.state.motionMorningConsumed)return false;
  if(!event && !engine.sensorFresh(cap,10))return false;
  const facts=engine.facts(snapshot),alarm=app.intrusion?.state;
  if(engine.state.mode!=='night' || !facts.someHome || !(engine.state.manualNight || facts.allHomeAsleep) || engine.presenceCommand)return false;
  if(!inWindow(engine.clock(),c.timeZone,m.start,m.end))return false;
  if(alarm && (alarm.active || alarm.entryAt || alarm.mode==='armed' || alarm.target==='armed'))return false;
  // A simultaneous different alarm sensor must not be silenced by kitchen motion.
  if(selected(c) && c.security.intrusion.sensors.some(s=>s.partial && !(s.deviceId===m.deviceId && s.capability===m.capability) &&
    snapshot.devices[s.deviceId]?.capabilities[s.capability]?.value===true && !alarm.bypassed.some(b=>b.deviceId===s.deviceId && b.capability===s.capability)))return false;
  if(engine.state.guest)return false;
  if(c.observation){engine.log('Observasjon: bevegelse ville startet morgen, frakoblet nattalarm og satt hjemmeværende våkne',{result:'observed'});return false;}
  if(!app.adapter.direct?.ready){engine.log('Morgen ved bevegelse hoppet over: direkte API-forbindelse er ikke klar',{result:'skipped'});return false;}
  const started=engine.morning('motion',()=>{if(selected(c))app.disarmAlarm();});
  if(started){engine.state.motionMorningConsumed=true;engine.log(`Morgen startet ved bevegelse: ${device.name || 'valgt morgensensor'}`,{result:'confirmed'});engine.save();}
  return started;
};
