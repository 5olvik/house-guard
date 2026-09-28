'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,add,step}=require('./helpers');

test('Departure wakes only the departing sleeper, including when guests keep the house occupied',async()=>{
 for(const guest of [false,true]){
  const h=harness(c=>{add(c,'firstWake',[step('first-wake')]);});h.person('a',true,true);h.person('b',true,true);h.ingest();h.engine.state.guest=guest;
  h.person('a',false,true);h.ingest();await h.engine.tick();
  assert.deepEqual(h.calls,[['person','a',false]]);assert.equal(h.snapshot.people.b.asleep,true);
  assert(!h.engine.runs.some(r=>['morning','firstWake'].includes(r.routineId)));
  h.ingest();await h.engine.tick();assert.equal(h.calls.length,1);
 }
});

test('Initial read repairs existing away and asleep status without replaying arrivals or morning',async()=>{
 const h=harness();h.person('a',false,true);h.person('b',false,false);h.ingest();await h.engine.tick();assert.deepEqual(h.calls,[['person','a',false]]);
 assert.deepEqual(h.engine.runs.map(r=>r.routineId),['departureWake']);assert.equal(h.engine.state.mode,'away');
 h.person('a',false,false);h.ingest();await h.engine.tick();assert.equal(h.engine.runs[0].actions[0].status,'confirmed');
 h.person('a',false,true);h.ingest();await h.engine.tick();assert.equal(h.calls.length,2);
});

test('Unknown, unavailable, stale, future and unselected users are never changed',async()=>{
 for(const scenario of ['unknown','unavailable','stale','future','disconnected','unselected']){
  const h=harness();h.person('a',false,true);h.person('b',true,false);h.person('outside',false,true);
  if(scenario==='unknown')h.snapshot.people.a.present=null;
  if(scenario==='unavailable')h.snapshot.people.a.available=false;
  if(scenario==='stale')h.snapshot.people.a.observedAt-=121000;
  if(scenario==='future')h.snapshot.people.a.observedAt++;
  if(scenario==='disconnected')h.snapshot.connected=false;
  if(scenario==='unselected'){h.config.people.presence=['b'];h.config.people.night=['b'];}
  h.ingest();await h.engine.tick();assert.deepEqual(h.calls,[],scenario);
 }
});

test('Returning before dispatch cancels a stale departure wake, and a later departure is corrected',async()=>{
 const h=harness();h.person('a',false,true);h.ingest();h.person('a',true,true);await h.engine.tick();assert.deepEqual(h.calls,[]);
 h.ingest();h.person('a',false,true);h.ingest();await h.engine.tick();assert.deepEqual(h.calls,[['person','a',false]]);
});

test('Observation has no writes; enabling active mode repairs status; failures are not repeatedly sent',async()=>{
 const h=harness(c=>c.observation=true);h.person('a',false,true);h.ingest();await h.engine.tick();assert.deepEqual(h.calls,[]);
 const c=structuredClone(h.config);c.observation=false;h.engine.updateConfig(c);let attempts=0;h.adapter.setAsleep=async()=>{attempts++;throw Error('timeout');};h.ingest();await h.engine.tick();
 h.ingest();h.advance(31000);h.ingest();await h.engine.tick();assert.equal(attempts,1);
});

test('Reconnect before dispatch rechecks an unsent correction without losing it',async()=>{
 const h=harness();h.person('a',false,true);h.ingest();h.ingest({reconnect:true});await h.engine.tick();assert.deepEqual(h.calls,[['person','a',false]]);
});

test('Regular morning and custom sleep actions still require a person at home',()=>{
 const h=harness();h.person('a',false,true);h.ingest();
 for(const value of [false,true])assert.match(h.engine.guard({routineId:'morning',context:{},generation:h.engine.state.generation},{kind:'person',personId:'a',value},h.snapshot),/hjemme/);
});
