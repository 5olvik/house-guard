'use strict';

const SUNSET='homey:manager:cron:after_sunset', SUNRISE='homey:manager:cron:after_sunrise';
const solarResult=value=>value && value.error==null && typeof value.result==='boolean' ? value.result : null;
function enabled(config) {
  const routine=config.routines.find(r=>r.id==='welcome');
  return !!config.welcome.doorDeviceId && !!routine?.enabled && !!routine.actions.length;
}
function reason(engine,snapshot) {
  const w=engine.config.welcome;
  if(w.lightMode==='sunset') {
    const sun=snapshot.sun;
    if(!sun?.available || typeof sun.dark!=='boolean' || !Number.isFinite(sun.observedAt) || sun.observedAt>engine.clock() || engine.clock()-sun.observedAt>60000)return 'Solstatus er ukjent. Kontroller API-nøkkelen og Homeys plassering.';
    return sun.dark ? null : 'Det er mellom soloppgang og solnedgang';
  }
  const lux=engine.cap(w.luxDeviceId,w.luxCapability,snapshot);
  if(!engine.sensorFresh(lux,w.maxAgeSeconds) || !Number.isFinite(lux.value))return 'Lysmålingen mangler eller er for gammel';
  return lux.value<w.threshold ? null : 'Det er lysere enn valgt luxgrense';
}
function ingest(engine,before,snapshot,events=[]) {
  const w=engine.config.welcome;
  if(!snapshot.connected || !engine.facts(snapshot).someHome || !enabled(engine.config) || !(engine.state.welcomeUntil>engine.clock()))return;
  const current=engine.cap(w.doorDeviceId,w.doorCapability,snapshot);
  if(current.available===false || typeof current.value!=='boolean')return;
  let previous=engine.cap(w.doorDeviceId,w.doorCapability,before).value, opened=false;
  // Replay only sensor values, not presence or alarm transitions. A short
  // false→true→false pulse must survive the following full snapshot.
  const changes=events.filter(e=>e.id===w.doorDeviceId && e.capability===w.doorCapability && typeof e.value==='boolean');
  for(const e of changes) { if(e.value===true && previous===false)opened=true;previous=e.value; }
  if(current.value===true && previous===false)opened=true;
  if(!opened)return;
  engine.state.welcomeUntil=0;
  const problem=reason(engine,snapshot);
  if(problem){engine.log(`Velkomstlys hoppet over: ${problem}`,{routineId:'welcome',result:'skipped'});return;}
  const context={welcomeAutomatic:true,...(engine.state.welcomeGuestGeneration?{guestArrival:true,guestGeneration:engine.state.welcomeGuestGeneration}:{})};
  const run=engine.start('welcome',context,w.delaySeconds);
  if(run)engine.log(`Velkomstlys: ${w.doorCapability.startsWith('alarm_motion')?'bevegelse':'døråpning'} registrert. Ventetid ${w.delaySeconds} s; første handling har ${run.actions[0]?.delaySeconds || 0} s ekstra.`,{routineId:'welcome',runId:run.id,result:'info'});
}
module.exports={SUNSET,SUNRISE,solarResult,enabled,reason,ingest};
