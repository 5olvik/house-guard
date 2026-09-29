'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate}=require('../lib/config');
const {builtins}=require('../lib/plans');
const {harness,step,add}=require('./helpers');
const {EVENTS}=require('../lib/alarm-automation');
const ID='house-guard-internal-alarm';

test('Morning cannot run in an empty home or with guests alone, even with a legacy opt-out',async()=>{
 for(const source of ['manual','external','schedule'])for(const guest of [false,true]){
  const h=harness(c=>{c.security.alarmDeviceId=ID;c.morning.requireHome=false;add(c,'morning',[step('unexpected')]);},{guest});
  h.person('a',false,true);h.person('b',false);h.device(ID,'homealarm_state','armed');h.ingest();h.config.morning.requireHome=false;
  assert.equal(h.engine.morning(source),false);h.engine.start('morning');await h.engine.tick();
  assert(!h.calls.some(c=>c[0]==='set'||c[0]==='timeline'));assert.equal(h.engine.state.mode,guest?'home':'away');
 }
});
test('Manual night cannot arm if marking residents asleep fails; a confirmed sleeper is required',async()=>{
 const h=harness(c=>{c.security.alarmDeviceId=ID;c.night.markAsleep=false;});h.device(ID,'homealarm_state','disarmed');h.ingest();
 await h.engine.manual('night');await h.engine.tick();assert(!h.calls.some(c=>c[3]==='partially_armed'));
 h.person('a',true,true);h.engine.start('night');await h.engine.tick();assert(h.calls.some(c=>c[3]==='partially_armed'));
});
test('Optional alarm automation switches control only their own mode change',()=>{
  for(const id of EVENTS.filter(id=>id!=='away')){
    const c=defaults();c.security.alarmDeviceId=ID;
    const actions=()=>builtins(id,c,{}, {homeIds:[],allAway:true,allHomeAsleep:false});
    const expected={away:'armed',night:'partially_armed',home:'disarmed',morning:'disarmed',firstWake:'disarmed'}[id];
    assert.equal(actions().find(a=>a.alarmAutomation).value,expected);
    c.security.automation[id]=false;assert(!actions().some(a=>a.capability==='homealarm_state'));
  }
});
test('Configured alarm transitions survive disabled or deleted routines; custom actions stay disabled',()=>{
  for(const id of EVENTS)for(const removed of [false,true]){
    const h=harness(c=>{c.security.alarmDeviceId=ID;add(c,id,[step('extra')]);if(removed)c.routines=c.routines.filter(r=>r.id!==id);else c.routines.find(r=>r.id===id).enabled=false;});
    const run=h.engine.start(id);assert(run.actions.some(a=>a.alarmAutomation));assert(!run.actions.some(a=>a.id==='extra'));assert(run.actions.every(a=>a.builtin));
  }
});
test('Old automatic-away opt-out cannot prevent full coverage or remove the chosen lights Flow',async()=>{
  const h=harness(c=>{c.security.alarmDeviceId=ID;c.security.automation.away=false;add(c,'away',[step('lights',{kind:'flow',category:'lights',flowId:'lights',flowType:'normal'})]);});
  h.device(ID,'homealarm_state','disarmed');h.ingest();h.person('a',false);h.person('b',false);h.ingest();h.advance(21000);await h.engine.tick();
  assert(h.calls.some(c=>c[0]==='set'&&c[3]==='armed'));h.device(ID,'homealarm_state','armed');await h.engine.tick();assert.equal(h.calls.filter(c=>c[0]==='flow').length,1);
});
test('A disabled away routine still arms via the Alarm setting after verified departure',async()=>{
  const h=harness(c=>{c.security.alarmDeviceId=ID;c.routines.find(r=>r.id==='away').enabled=false;});h.device(ID,'homealarm_state','disarmed');h.ingest();h.person('a',false);h.person('b',false);h.ingest();
  await h.engine.tick();assert.equal(h.calls.length,0);h.advance(21000);await h.engine.tick();assert.deepEqual(h.calls,[['set',ID,'homealarm_state','armed']]);
});
test('Return or unknown presence still cancels automatic arming with the routine disabled',async()=>{
  for(const unknown of [false,true]){
    const h=harness(c=>{c.security.alarmDeviceId=ID;c.routines.find(r=>r.id==='away').enabled=false;});h.device(ID,'homealarm_state','disarmed');h.ingest();h.person('a',false);h.person('b',false);h.ingest();
    h.person('a',unknown?null:true);h.ingest();h.advance(21000);await h.engine.tick();assert(!h.calls.some(c=>c[0]==='set'&&c[3]==='armed'));
  }
});
test('Observation and guest protection still apply to independent automatic arming',async()=>{
  for(const mode of ['observation','guest']){
    const h=harness(c=>{c.security.alarmDeviceId=ID;c.routines.find(r=>r.id==='away').enabled=false;c.observation=mode==='observation';},{guest:mode==='guest'});
    h.device(ID,'homealarm_state','disarmed');h.person('a',false);h.person('b',false);h.ingest();h.engine.start('away');await h.engine.tick();assert.equal(h.calls.length,0);
  }
});
test('Legacy disabled events migrate to disabled alarm settings once and preserve the remaining config',()=>{
  const c=defaults();delete c.security.automation;c.routines.find(r=>r.id==='night').enabled=false;c.routines.find(r=>r.id==='home').enabled=false;
  const v=validate(c);assert.deepEqual(v.security.automation,{away:true,night:false,home:false,morning:true,firstWake:true});assert.deepEqual(v.routines,c.routines);assert.deepEqual(validate(v),v);
  v.security.automation.night='true';assert.throws(()=>validate(v),/Automatisk alarm/);
});
test('Leaving guest mode honours the automatic away and night switches',()=>{
  const c=defaults();c.security.alarmDeviceId=ID;c.security.automation.away=false;c.security.automation.night=false;
  for(const facts of [{allAway:true},{allHomeAsleep:true}])assert(!builtins('guestOff',c,{},facts).some(a=>a.capability==='homealarm_state'));
});
test('Changing an automation switch does not immediately arm or disarm the system',async()=>{
  const h=harness(c=>{c.security.alarmDeviceId=ID;});h.device(ID,'homealarm_state','armed');h.person('a',false);h.person('b',false);h.ingest();const next=structuredClone(h.config);next.security.automation.away=false;h.engine.updateConfig(next);await h.engine.tick();assert.equal(h.calls.length,0);
});

test('Night arrival disarms immediately, wakes only the arrival and allows later rearming',async()=>{
 const h=harness(c=>{c.security.alarmDeviceId=ID;c.night.wakeArrival=true;c.delays.home=300;c.routines.find(r=>r.id==='nightArrival').enabled=false;});
 h.person('a',false,true);h.person('b',true,true);h.device(ID,'homealarm_state','partially_armed');h.device(ID,'alarm_generic',false);h.ingest();h.engine.state.manualNight=true;
 const pending=h.engine.start('night',{},30);h.person('a',true,true);h.ingest();assert(pending.cancelled);assert.equal(h.engine.state.manualNight,false);
 await h.engine.tick();assert.deepEqual(h.calls,[['set',ID,'homealarm_state','disarmed']]);
 h.device(ID,'homealarm_state','disarmed');await h.engine.tick();assert.deepEqual(h.calls.at(-1),['person','a',false]);assert(!h.calls.some(c=>c[0]==='person'&&c[1]==='b'));
 h.person('a',true,false);h.ingest();await h.engine.tick();assert(!h.engine.runs.some(r=>r.routineId==='morning'));assert.equal(h.engine.state.mode,'home');
 h.person('a',true,true);h.ingest();await h.engine.tick();assert(h.calls.some(c=>c[0]==='set'&&c[3]==='partially_armed'));
});
test('Night-arrival switches, departed arrivals and observation prevent unwanted disarming',async()=>{
 for(const scenario of ['home-off','wake-off','left','observation','reconnect']){
  const h=harness(c=>{c.security.alarmDeviceId=ID;c.night.wakeArrival=scenario!=='wake-off';c.security.automation.home=scenario!=='home-off';c.observation=scenario==='observation';});
  h.person('a',false,true);h.person('b',true,true);h.device(ID,'homealarm_state','partially_armed');h.ingest();h.person('a',true,true);h.ingest({reconnect:scenario==='reconnect'});if(scenario==='left')h.person('a',false,true);await h.engine.tick();
  assert(!h.calls.some(c=>c[0]==='set'&&c[3]==='disarmed'),scenario);
 }
});
test('Scheduled and Flow-started mornings wake home residents only; external individual waking only disarms',async()=>{
 for(const scheduled of [true,false]){
  const h=harness(c=>{c.morning.scheduled=scheduled;c.morning.time='07:00';}, {},'2026-09-22T04:59:59Z');h.person('a',true,true);h.person('b',false,true);h.ingest();
  if(scheduled)h.advance(1000);else await h.engine.manual('morning');await h.engine.tick();assert.deepEqual(h.calls,[['person','b',false],['person','a',false]]);
 }
 const h=harness(c=>{c.security.alarmDeviceId=ID;});h.person('a',true,true);h.person('b',true,true);h.device(ID,'homealarm_state','partially_armed');h.ingest();h.person('a',true,false);h.ingest();await h.engine.tick();assert.deepEqual(h.calls,[['set',ID,'homealarm_state','disarmed']]);
});

test('Manual morning works again after a new night on the same date, without duplicate runs',async()=>{
 const h=harness(c=>{c.security.alarmDeviceId=ID;add(c,'morning',[step('extra')]);}, {morningKey:'morning-2026-09-21'});
 h.person('a',true,true);h.person('b',false,true);h.device(ID,'homealarm_state','partially_armed');h.ingest();
 h.engine.state.manualNight=true;const night=h.engine.start('night',{},30);
 assert.equal(h.engine.morning('schedule'),false);
 await h.engine.manual('morning');await h.engine.manual('morning');assert(night.cancelled);
 assert.equal(h.engine.runs.filter(r=>r.routineId==='morning').length,1);
 await h.engine.tick();assert.deepEqual(h.calls,[['person','b',false],['set',ID,'homealarm_state','disarmed']]);
 h.device(ID,'homealarm_state','disarmed');await h.engine.tick();assert.deepEqual(h.calls.at(-1),['person','a',false]);
 h.person('a',true,false);h.ingest();await h.engine.tick();assert.equal(h.engine.state.mode,'home');
 assert.equal(h.calls.filter(c=>c[0]==='timeline').length,1);assert.equal(h.calls.filter(c=>c[0]==='person'&&c[1]==='b').length,1);
 await h.engine.manual('morning');assert.equal(h.engine.runs.filter(r=>r.routineId==='morning').length,1);
 h.person('a',true,true);h.ingest();assert.equal(h.engine.morning('external'),true);
 h.advance(31000);await h.engine.tick();assert(!h.calls.some(c=>c[0]==='set'&&c[3]==='partially_armed'));
});
