'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers'),{HomeyAdapter}=require('../lib/homey-adapter');
const text='House Guard: Huset har våknet. Nattmodus er avsluttet.';
function night(customize=()=>{},saved={}) {
 const h=harness(customize,saved,'2026-09-22T04:59:59Z');
 h.person('a',true,true);h.person('b',true,true);h.ingest();return h;
}
const messages=h=>h.calls.filter(c=>c[0]==='timeline'&&c[1]===text);
function wake(h,id='a',options) {h.person(id,true,false);h.ingest(options);}

test('Bekreftet første oppvåkning sender én innebygd tidslinjemelding uten egne handlinger eller pushmottakere',async()=>{
 const h=night(c=>{c.routines.find(r=>r.id==='firstWake').enabled=false;c.people.notifications=[];});
 const config=structuredClone(h.config);wake(h);await h.engine.tick();
 assert.deepEqual(messages(h),[['timeline',text]]);assert.equal(h.engine.state.mode,'home');
 wake(h,'b');h.ingest();await h.engine.tick();await h.engine.tick();
 assert.equal(messages(h).length,1);assert.deepEqual(h.config,config);assert(!h.calls.some(c=>c[0]==='emit'));
});

for(const source of ['manual','schedule','external','motion'])test('Tidslinjemelding følger bekreftet vekking fra '+source+', også med ekstrahandlinger avslått',async()=>{
 const h=night(c=>{c.routines.find(r=>r.id==='morning').enabled=false;c.routines.find(r=>r.id==='firstWake').enabled=false;if(source==='schedule'){c.morning.scheduled=true;c.morning.time='07:00';}if(source==='motion')Object.assign(c.morning.motion,{enabled:true,deviceId:'kitchen',capability:'alarm_motion',start:'06:00',end:'12:00'});});
 if(source==='manual')await h.engine.manual('morning');
 if(source==='external')h.engine.event('morning');
 if(source==='schedule')h.advance(1000);
 if(source==='motion'){
  const motion=require('../lib/motion-morning'),app={engine:h.engine,adapter:{direct:{ready:true}}};
  h.device('kitchen','alarm_motion',false);motion(app,h.snapshot,{reset:true});h.device('kitchen','alarm_motion',true);
  assert.equal(motion(app,h.snapshot),true);
 }
 await h.engine.tick();assert.equal(messages(h).length,0,'Ingen melding bare fordi morgenkommandoen er startet');
 assert.equal(h.engine.runs.filter(r=>r.routineId==='morning').length,1);
 wake(h);await h.engine.tick();assert.equal(messages(h).length,1);
 wake(h,'b');await h.engine.tick();await h.engine.tick();assert.equal(messages(h).length,1);
});

test('Mislykket vekking sender ingen melding om at huset har våknet',async()=>{
 const h=night();h.adapter.setAsleep=async()=>{throw Error('Vekking feilet');};
 await h.engine.manual('morning');await h.engine.tick();h.ingest();await h.engine.tick();
 assert.equal(messages(h).length,0);assert(!h.engine.runs.some(r=>r.routineId==='wakeNotice'));
});

test('To brukere som våkner i samme avlesning får én felles melding',async()=>{
 const h=night();h.person('a',true,false);h.person('b',true,false);h.ingest();await h.engine.tick();h.ingest();await h.engine.tick();assert.equal(messages(h).length,1);
});

test('En ny faktisk natt gir én ny melding, uten å gjenta den første ved polling',async()=>{
 const h=night();wake(h);await h.engine.tick();
 h.person('a',true,true);h.person('b',true,true);h.ingest();await h.engine.tick();
 wake(h);await h.engine.tick();h.ingest();await h.engine.tick();assert.equal(messages(h).length,2);
});

test('Oppstart og reconnect spiller ikke av en gammel oppvåkning, men neste våkenovergang fungerer',async()=>{
 for(const dispatched of [false,true]){
  const h=night();wake(h);if(dispatched)await h.engine.tick();
  const restored=harness(()=>{},h.saved(),'2026-09-22T05:00:00Z');restored.ingest();await restored.engine.tick();assert.equal(messages(restored).length,0);
 }
 const h=night();wake(h,'a',{reconnect:true});await h.engine.tick();assert.equal(messages(h).length,0);
 h.person('a',true,true);h.ingest();wake(h);await h.engine.tick();assert.equal(messages(h).length,1);
});

for(const scenario of ['observation','disconnected','unknown','stale','away','arrival','guest'])test('Ingen falsk oppvåkning ved '+scenario,async()=>{
 const h=night(c=>{c.observation=scenario==='observation';c.night.wakeArrival=scenario==='arrival';});
 if(scenario==='arrival'){
  h.person('a',false,false);h.ingest();h.person('a',true,true);h.ingest();await h.engine.tick();wake(h);
 }else if(scenario==='guest'){
  h.engine.setGuest(true);wake(h);
 }else{
  h.person('a',scenario!=='away',false);
  if(scenario==='away')h.person('b',false,false);
  if(scenario==='disconnected')h.snapshot.connected=false;
  if(scenario==='unknown')h.snapshot.people.b.asleep=null;
  if(scenario==='stale')h.snapshot.people.b.observedAt=h.now()-(h.config.freshnessSeconds+1)*1000;
  h.ingest();
 }
 await h.engine.tick();assert.equal(messages(h).length,0);
});

for(const cause of ['sleep','departure','disconnect','guest','config','reconnect'])test('Fersk sluttkontroll stopper et ventende varsel ved '+cause,async()=>{
 const h=night();wake(h);const run=h.engine.runs.find(r=>r.routineId==='wakeNotice');assert(run);
 if(cause==='sleep')h.person('a',true,true);
 if(cause==='departure')h.person('a',false,false);
 if(cause==='disconnect')h.snapshot.connected=false;
 if(cause==='guest')h.engine.setGuest(true);
 if(cause==='config')h.engine.updateConfig(h.config);
 if(cause==='reconnect')h.ingest({reconnect:true});
 await h.engine.tick();assert.equal(messages(h).length,0);assert(['skipped','cancelled'].includes(run.actions[0].status));
});

test('Tidslinjefeil logges én gang og påvirker ikke morgen, personstatus eller egne handlinger',async()=>{
 const h=night();let attempts=0;h.adapter.timeline=async()=>{attempts++;throw Error('Tidslinjen er utilgjengelig');};
 wake(h);await h.engine.tick();h.ingest();await h.engine.tick();wake(h,'b');await h.engine.tick();
 assert.equal(attempts,1);assert.equal(h.engine.state.mode,'home');assert.equal(h.engine.runs.find(r=>r.routineId==='wakeNotice').actions[0].status,'failed');
 assert(h.engine.history.entries.some(e=>e.message.includes('Tidslinjen er utilgjengelig')));
});

test('HomeyAdapter skriver direkte til appens Homey-tidslinje uten push eller API-nøkkel',async()=>{
 const h=night(),calls=[];
 const adapter=new HomeyAdapter({notifications:{createNotification:async data=>calls.push(data)}},()=>h.config);
 adapter.snapshot=h.adapter.snapshot;h.engine.adapter=adapter;wake(h);await h.engine.tick();
 assert.deepEqual(calls,[{excerpt:text}]);assert.equal(h.engine.runs.find(r=>r.routineId==='wakeNotice').actions[0].status,'accepted');
});
