'use strict';
const { selected } = require('./intrusion');

// Use this at the final dispatch boundary as well as the UI/Flow command path.
function armReason(engine, mode, snapshot) {
  if (mode !== 'partially_armed') return null;
  if (!snapshot.connected || !engine.facts(snapshot).anyAsleep) return 'Nattalarm krever at noen er hjemme og bekreftet sovende.';
  return null;
}

function reconcile(app, snapshot) {
  const engine=app.engine,c=engine.config,s=app.intrusion?.state;
  if (!s || !selected(c) || c.observation || engine.state.guest || !snapshot.connected) return;
  if (s.target!=='partially_armed' && s.mode!=='partially_armed') return;
  // An alarm in progress must be acknowledged, never silently erased.
  if (s.active || s.entryAt) return;
  const f=engine.facts(snapshot);
  if (!(s.target==='partially_armed' && !f.anyAsleep) && (!f.complete || !f.nobodyAsleep)) return;
  app.disarmAlarm();
  engine.log(f.allAway?'Nattalarm avsluttet: alle beboere er borte.':'Nattalarm avsluttet: ingen hjemmeværende er bekreftet sovende.');
}

function ensureAway(app,snapshot) {
  const engine=app.engine,c=engine.config,s=app.intrusion?.state,f=engine.facts(snapshot);
  if(!s || !selected(c) || c.observation || !snapshot.connected || !f.allAway){app.awayAlarmAttempt=null;return;}
  if(s.mode==='armed' || s.target==='armed'){app.awayAlarmAttempt=null;return;}
  if(s.active || s.entryAt)return;
  const sensors=c.security.intrusion.sensors.filter(s=>s.full).map(s=>{const d=snapshot.devices[s.deviceId];return [s.deviceId,s.capability,d?.available!==false,d?.capabilities?.[s.capability]?.value];});
  // A failed attempt waits for a changed prerequisite or an explicit new command.
  // Repeated status polls must not keep retrying or sending sensor warnings.
  const key=JSON.stringify([c.revision,app.alarmCommandGeneration || 0,sensors]);
  if(app.awayAlarmAttempt===key)return;
  app.awayAlarmAttempt=key;
  const pending=engine.runs.some(r=>!r.cancelled && r.actions.some(a=>a.capability==='homealarm_state' && a.value==='armed' && ['pending','checking','dispatching','sent','waiting'].includes(a.status)));
  if(!pending)engine.start('alarmPresence',{},c.delays.away);
}
module.exports={armReason,reconcile,ensureAway};
