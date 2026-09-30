'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults}=require('../lib/config');
const {presence,deriveMode}=require('../lib/policy');
const {harness,add,step}=require('./helpers');
const notices=h=>h.calls.filter(c=>c[0]==='emit' && c[1].kind==='notify');
function setup(customize=()=>{},saved={}){
 const h=harness(c=>{c.people.notifications=['a','b'];c.delays.home=0;c.delays.away=0;add(c,'home',[step('usual-home')]);add(c,'away',[step('usual-away')]);add(c,'guestOn',[step('old-guest-on')]);add(c,'guestOff',[step('old-guest-off')]);customize(c);},saved);
 h.adapter.direct={configured:true};return h;
}

test('Guests count as household presence without creating or changing a Homey person',()=>{
 const c=defaults();c.people.presence=['a','b'];c.people.night=['a','b'];
 const people={a:{present:false,asleep:false,observedAt:100},b:{present:false,asleep:true,observedAt:100}},before=structuredClone(people);
 const empty=presence(c,people,100),occupied=presence(c,people,100,true);
 assert.equal(empty.allAway,true);assert.equal(occupied.allAway,false);assert.equal(occupied.someHome,true);assert.equal(occupied.residentsAllAway,true);assert.deepEqual(occupied.homeIds,[]);assert.equal(deriveMode(occupied).mode,'home');assert.match(deriveMode(occupied).reason,/alene/);assert.deepEqual(people,before);
 people.a.present=true;people.a.asleep=true;
 const sleeping=presence(c,people,100,true);assert.equal(sleeping.allHomeAsleep,false);assert.deepEqual(sleeping.homeIds,['a']);assert.equal(sleeping.anyAsleep,true);assert.equal(deriveMode(sleeping).mode,'home');
 assert.equal(deriveMode(presence(c,people,100,false)).mode,'night');
});

test('Guest on and off with a resident home each send one push and leave lights, locks and existing home actions alone',async()=>{
 const h=setup(c=>{c.security.lockDeviceId='lock';c.security.autoUnlock=true;c.guest.unlockOnEnable=true;c.guest.disarmOnEnable=true;});h.device('light','onoff',true);h.device('lock','locked',true);h.ingest();const before=structuredClone(h.snapshot.people);
 const existing=h.engine.start('home',{},30);h.engine.setGuest(true);h.engine.setGuest(true);await h.engine.tick();
 assert.equal(notices(h).length,1);assert.deepEqual(notices(h)[0][1].recipients,['a','b']);assert.match(notices(h)[0][1].text,/Gjestemodus er på/);assert.equal(h.calls.length,1);assert(!existing.cancelled);assert.deepEqual(h.snapshot.people,before);
 h.engine.setGuest(false);h.engine.setGuest(false);await h.engine.tick();assert.equal(h.calls.length,2);assert.equal(notices(h).length,2);assert.deepEqual(notices(h)[1][1].recipients,['a','b']);assert.match(notices(h)[1][1].text,/Gjestemodus er av/);assert.equal(h.engine.state.mode,'home');assert(!existing.cancelled);assert.deepEqual(h.snapshot.people,before);
});

test('Guest off in an empty house notifies recipients once and still runs the ordinary away routine',async()=>{
 const h=setup(()=>{},{guest:true});h.person('a',false);h.person('b',false);h.ingest();const before=structuredClone(h.snapshot.people);
 h.engine.setGuest(false);h.engine.setGuest(false);await h.engine.tick();await h.engine.tick();
 assert.equal(notices(h).length,1);assert.deepEqual(notices(h)[0][1].recipients,['a','b']);assert.equal(notices(h)[0][1].notificationType,'normal');assert.match(notices(h)[0][1].text,/Gjestemodus er av/);assert.equal(h.engine.state.mode,'away');assert.deepEqual(h.calls.filter(c=>c[0]==='timeline'),[['timeline','usual-away']]);assert.deepEqual(h.snapshot.people,before);
});

test('Rapid opposite guest toggles send only the notification for the latest state',async()=>{
 for(const latest of [true,false]){
  const h=setup(()=>{},{guest:latest});h.ingest();h.engine.setGuest(!latest);h.engine.setGuest(latest);await h.engine.tick();await h.engine.tick();
  assert.equal(notices(h).length,1);assert.match(notices(h)[0][1].text,latest?/Gjestemodus er på/:/Gjestemodus er av/);
 }
});

test('Failed guest off push is not retried and does not block ordinary departure actions',async()=>{
 const h=setup(()=>{},{guest:true});h.person('a',false);h.person('b',false);h.ingest();let attempts=0;
 h.adapter.emit=async data=>{attempts++;assert.match(data.text,/Gjestemodus er av/);throw Error('Delivery failed');};
 h.engine.setGuest(false);await h.engine.tick();await h.engine.tick();assert.equal(attempts,1);assert(h.calls.some(c=>c[1]==='usual-away'));assert.equal(h.engine.state.guest,false);
});

test('Completed guest off push and departure are not replayed after restart or reconnect',async()=>{
 const h=setup(()=>{},{guest:true});h.person('a',false);h.person('b',false);h.ingest();h.engine.setGuest(false);await h.engine.tick();assert.equal(notices(h).length,1);
 const restored=setup(()=>{},h.saved());restored.person('a',false);restored.person('b',false);restored.ingest();await restored.engine.tick();restored.ingest({reconnect:true});await restored.engine.tick();
 assert.equal(restored.engine.state.guest,false);assert.equal(restored.engine.state.mode,'away');assert.deepEqual(restored.calls,[]);
});

test('Last resident leaving with guests sends one reminder without away actions; returning does not repeat first-home',async()=>{
 const h=setup();h.ingest();h.engine.setGuest(true);await h.engine.tick();h.person('a',false);h.ingest();await h.engine.tick();assert.equal(notices(h).length,1);
 h.person('b',false);h.ingest();h.ingest();await h.engine.tick();await h.engine.tick();
 assert.equal(notices(h).length,2);assert.match(notices(h)[1][1].text,/hjemme alene/);assert.equal(h.engine.state.mode,'home');assert(!h.engine.runs.some(r=>r.routineId==='away'));assert(!h.calls.some(c=>c[0]==='timeline'));
 h.person('a',true);h.ingest();await h.engine.tick();assert(!h.calls.some(c=>c[1]==='usual-home'));h.person('a',false);h.ingest();await h.engine.tick();assert.equal(notices(h).length,3);
 h.engine.setGuest(false);await h.engine.tick();assert.equal(h.engine.state.mode,'away');assert.deepEqual(h.calls.at(-1),['timeline','usual-away']);
});

test('Guests arriving to an empty home reuse ordinary home actions and delayed guarded unlocking',async()=>{
 const h=setup(c=>{c.security.alarmDeviceId='alarm';c.security.autoUnlock=true;c.security.lockDeviceId='lock';});h.person('a',false);h.person('b',false);h.device('alarm','homealarm_state','disarmed');h.device('lock','locked',true);h.ingest();h.engine.setGuest(true);await h.engine.tick();
 assert.equal(notices(h).length,1);assert(h.calls.some(c=>c[1]==='usual-home'));assert(!h.calls.some(c=>c[0]==='set'));h.advance(30000);await h.engine.tick();assert.deepEqual(h.calls.at(-1),['set','lock','locked',false]);
 assert(!h.calls.some(c=>c[0]==='person'));assert(!h.calls.some(c=>String(c[1]).startsWith('old-')));
});

test('Usual home lights run for guest arrivals without the old category filter or duplicated guest actions',async()=>{
 const h=setup(c=>{add(c,'home',[step('home-light',{kind:'set',category:'lights',deviceId:'light',capability:'onoff',value:true})]);c.guest.allow.lights=false;});
 h.device('light','onoff',false);h.person('a',false);h.person('b',false);h.ingest();h.engine.setGuest(true);await h.engine.tick();assert(h.calls.some(c=>c[0]==='set' && c[1]==='light' && c[3]===true));assert(!h.calls.some(c=>String(c[1]).startsWith('old-')));
});

test('Failed guest push is not retried and does not block ordinary arrival actions',async()=>{
 const h=setup();h.person('a',false);h.person('b',false);h.ingest();let calls=0;h.adapter.emit=async()=>{calls++;throw Error('Delivery failed');};h.engine.setGuest(true);await h.engine.tick();await h.engine.tick();assert.equal(calls,1);assert(h.calls.some(c=>c[1]==='usual-home'));assert.equal(h.engine.state.guest,true);
});

test('Guest unlocking needs ordinary opt-in and disarm confirmation and expires or cancels',async()=>{
 for(const scenario of ['not-selected','armed','pending-arm','expired','off','config']){
  const h=setup(c=>{c.security.alarmDeviceId='alarm';c.security.autoUnlock=scenario!=='not-selected';c.security.lockDeviceId='lock';});h.person('a',false);h.person('b',false);h.device('alarm','homealarm_state',scenario==='armed'?'armed':'disarmed');h.device('lock','locked',true);if(scenario==='pending-arm')h.snapshot.devices.alarm.alarmTarget='armed';h.ingest();h.engine.setGuest(true);
  if(scenario==='off')h.engine.setGuest(false);if(scenario==='config')h.engine.updateConfig(h.config);h.advance(scenario==='expired'?121000:30000);await h.engine.tick();
  assert(!h.calls.some(c=>c[0]==='set' && c[2]==='locked' && c[3]===false),scenario);
 }
});

test('Unknown resident status allows guest occupancy but never invents an arrival, departure or unlock',async()=>{
 const h=setup(c=>{c.security.autoUnlock=true;c.security.lockDeviceId='lock';});h.person('a',null);h.person('b',false);h.ingest();h.engine.setGuest(true);await h.engine.tick();assert.equal(notices(h).length,1);assert.equal(h.engine.state.mode,'home');assert(!h.engine.runs.some(r=>['home','arrivalUnlock'].includes(r.routineId)));
 h.engine.setGuest(false);await h.engine.tick();assert.equal(h.engine.state.mode,'unknown');assert(!h.engine.runs.some(r=>r.routineId==='away'));
});

test('Saved guest presence and reconnect do not replay notifications, arrivals or unlocking',async()=>{
 const h=setup();h.person('a',false);h.person('b',false);h.ingest();h.engine.setGuest(true);await h.engine.tick();
 const restored=setup(()=>{},h.saved());restored.person('a',false);restored.person('b',false);restored.ingest();await restored.engine.tick();assert.equal(restored.engine.state.mode,'home');assert.deepEqual(restored.calls,[]);
 restored.ingest({reconnect:true});await restored.engine.tick();assert.deepEqual(restored.calls,[]);
});

test('Guest activation cancels pending away and night actions; nightly sleeping does not arm or run night lights',async()=>{
 const h=setup(c=>{c.delays.away=20;add(c,'night',[step('night-lights')]);});h.ingest();h.person('a',false);h.person('b',false);h.ingest();const away=h.engine.runs.find(r=>r.routineId==='away');h.engine.setGuest(true);assert(away.cancelled);
 h.person('a',true,true);h.ingest();h.advance(30000);await h.engine.tick();assert(!h.calls.some(c=>['usual-away','night-lights'].includes(c[1])));assert.equal(h.engine.state.mode,'home');await assert.rejects(()=>h.engine.manual('night'),/gjestemodus/);
});

test('Observation guest transitions have no side effects and old guest configuration remains recoverable but inactive',async()=>{
 const h=setup(c=>{c.observation=true;});h.ingest();const original=structuredClone(h.config.routines);h.engine.setGuest(true);await h.engine.tick();h.person('a',false);h.person('b',false);h.ingest();await h.engine.tick();h.engine.setGuest(false);await h.engine.tick();assert.deepEqual(h.calls,[]);assert.deepEqual(h.config.routines,original);
 const {validate}=require('../lib/config');const old=structuredClone(h.config);delete old.guest.model;const migrated=validate(old);assert.deepEqual(migrated.routines,old.routines);assert.deepEqual(migrated.guest,{...old.guest,model:'presence'});assert.deepEqual(validate(migrated),migrated);
 assert.equal(h.engine.start('guestOn'),null);assert.equal(h.engine.start('guestOff'),null);
});

test('Guest presence never fabricates known resident presence for arrival or departure decisions',()=>{
 const c=defaults();c.people.presence=['a'];
 for(const p of [undefined,{present:null,observedAt:100},{present:false,observedAt:100,available:false},{present:false,observedAt:-999999}]){
  const f=presence(c,{a:p},100,true);assert.equal(f.someHome,true);assert.equal(f.complete,false);assert.equal(f.residentsAllAway,false);assert.equal(f.residentsSomeHome,false);assert.deepEqual(f.homeIds,[]);
  assert.equal(presence(c,{a:p},100,false).allAway,false);
 }
});
