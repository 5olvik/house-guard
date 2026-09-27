'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate}=require('../lib/config');
const {builtins}=require('../lib/plans');
const {harness,step,add}=require('./helpers');
const {EVENTS}=require('../lib/alarm-automation');
const ID='house-guard-internal-alarm';
test('Each alarm automation switch controls only its own mode change',()=>{
  for(const id of EVENTS){
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
    const run=h.engine.start(id);assert(run.actions.some(a=>a.alarmAutomation));if(!removed)assert(run.actions.every(a=>a.alarmAutomation));
  }
});
test('Turning automatic alarm off leaves the chosen lights Flow enabled',async()=>{
  const h=harness(c=>{c.security.alarmDeviceId=ID;c.security.automation.away=false;add(c,'away',[step('lights',{kind:'flow',category:'lights',flowId:'lights',flowType:'normal'})]);});
  h.device(ID,'homealarm_state','disarmed');h.ingest();h.person('a',false);h.person('b',false);h.ingest();h.advance(21000);await h.engine.tick();
  assert.equal(h.calls.filter(c=>c[0]==='flow').length,1);assert(!h.calls.some(c=>c[0]==='set'&&c[2]==='homealarm_state'));
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
  v.security.automation.away='true';assert.throws(()=>validate(v),/Automatisk alarm/);
});
test('Leaving guest mode honours the automatic away and night switches',()=>{
  const c=defaults();c.security.alarmDeviceId=ID;c.security.automation.away=false;c.security.automation.night=false;
  for(const facts of [{allAway:true},{allHomeAsleep:true}])assert(!builtins('guestOff',c,{},facts).some(a=>a.capability==='homealarm_state'));
});
test('Changing an automation switch does not immediately arm or disarm the system',async()=>{
  const h=harness(c=>{c.security.alarmDeviceId=ID;});h.device(ID,'homealarm_state','armed');h.person('a',false);h.person('b',false);h.ingest();const next=structuredClone(h.config);next.security.automation.away=false;h.engine.updateConfig(next);await h.engine.tick();assert.equal(h.calls.length,0);
});
