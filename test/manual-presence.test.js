'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,add,step}=require('./helpers');
function setup(customize=()=>{}){
 const h=harness(c=>{add(c,'away',[step('lights',{kind:'flow',flowId:'off',flowType:'normal',category:'lights'})]);customize(c);});
 h.person('outside',true);h.ingest();h.writes=[];
 h.adapter.preparePresence=async(ids,value,guard)=>async id=>{assert(guard());h.writes.push([id,value]);h.person(id,value,h.snapshot.people[id].asleep);};return h;
}
test('Away button changes selected users only and runs normal delayed away routine once',async()=>{
 const h=setup();h.person('a',true,true);await h.engine.setAllPresent(false);
 assert.deepEqual(h.writes,[['a',false],['b',false]]);assert.equal(h.snapshot.people.outside.present,true);assert.equal(h.snapshot.people.a.asleep,true);assert.equal(h.engine.state.mode,'away');
 await h.engine.tick();assert.deepEqual(h.calls,[['person','a',false]]);h.advance(21000);await h.engine.tick();assert.deepEqual(h.calls,[['person','a',false],['flow','off','normal']]);
 await h.engine.setAllPresent(false);assert.equal(h.writes.length,2);assert.equal(h.engine.runs.filter(r=>r.routineId==='away').length,1);
});
test('Home button sets every selected user home, cancels departure and uses home rather than morning',async()=>{
 const h=setup();await h.engine.setAllPresent(false);await h.engine.setAllPresent(true);assert.equal(h.engine.state.mode,'home');assert.equal(h.engine.runs.filter(r=>r.routineId==='away').every(r=>r.cancelled),true);
 assert.equal(h.engine.runs.filter(r=>r.routineId==='home').length,1);assert(!h.engine.runs.some(r=>r.routineId==='morning'));h.advance(21000);await h.engine.tick();assert(!h.calls.some(c=>c[0]==='flow'));
});
test('Partial failed or unconfirmed writes cannot fabricate an empty house and are not retried',async()=>{
 for(const fails of [true,false]){
  const h=setup();h.adapter.preparePresence=async(ids,value)=>async id=>{h.writes.push([id,value]);if(id==='b'){if(fails)throw Error('timeout');return;}h.person(id,value);};
  await assert.rejects(()=>h.engine.setAllPresent(false),/Ikke alle/);assert.equal(h.writes.length,2);assert.equal(h.engine.state.mode,'home');assert(!h.engine.runs.some(r=>r.routineId==='away'));assert.equal(h.engine.presenceCommand,false);
 }
});
test('Observation, invalid selection and concurrent commands never send presence writes',async()=>{
 const h=setup(c=>c.observation=true);await h.engine.setAllPresent(false);assert.deepEqual(h.writes,[]);assert.equal(h.engine.state.mode,'home');
 h.engine.config.observation=false;h.person('b',null);await assert.rejects(()=>h.engine.setAllPresent(false),/tilgjengelige/);assert.deepEqual(h.writes,[]);
 h.engine.config.people.presence=[];await assert.rejects(()=>h.engine.setAllPresent(false),/Velg brukere/);
 const busy=setup();let release,entered;const started=new Promise(r=>entered=r);const original=busy.adapter.preparePresence;
 busy.adapter.preparePresence=async(...args)=>{entered();await new Promise(r=>release=r);return original(...args);};
 const request=busy.engine.setAllPresent(false);await started;await assert.rejects(()=>busy.engine.setAllPresent(true),/allerede/);await assert.rejects(()=>busy.engine.manual('night'),/oppdateres/);release();await request;
});
test('Changed configuration cancels remaining writes; GPS arrival cancels pending away actions',async()=>{
 const h=setup();h.adapter.preparePresence=async(ids,value)=>async id=>{h.writes.push([id,value]);h.person(id,value);h.engine.config.revision++;};
 await assert.rejects(()=>h.engine.setAllPresent(false),/Ikke alle/);assert.equal(h.writes.length,1);assert.equal(h.engine.state.mode,'home');
 const gps=setup();await gps.engine.setAllPresent(false);gps.person('a',true);gps.ingest();gps.advance(21000);await gps.engine.tick();assert(!gps.calls.some(c=>c[0]==='flow'));
});
test('Guest protection still blocks the configured away actions after manual presence changes',async()=>{
 const h=setup();h.engine.state.guest=true;h.engine.config.guest.allow.lights=false;await h.engine.setAllPresent(false);h.advance(21000);await h.engine.tick();assert(!h.calls.some(c=>c[0]==='flow'));
});

test('Manual departure arms only after confirmation and arrival disarms through existing automation',async()=>{
 const id='house-guard-internal-alarm',h=setup(c=>{c.security.alarmDeviceId=id;});h.device(id,'homealarm_state','disarmed');
 await h.engine.setAllPresent(false);await h.engine.tick();assert(!h.calls.some(c=>c[0]==='set'));h.advance(21000);await h.engine.tick();assert(h.calls.some(c=>c[0]==='set'&&c[3]==='armed'));
 h.device(id,'homealarm_state','armed');await h.engine.tick();await h.engine.setAllPresent(true);h.advance(21000);await h.engine.tick();assert(h.calls.some(c=>c[0]==='set'&&c[3]==='disarmed'));
});
