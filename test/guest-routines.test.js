'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate,protectRoutines}=require('../lib/config');
const {harness,add,step}=require('./helpers');

test('Guest extension routines migrate empty, preserve older data and cannot be deleted',()=>{
 const c=defaults();c.routines=c.routines.filter(r=>!['guestActivated','guestDeactivated'].includes(r.id));add(c,'guestOn',[step('legacy')]);const original=structuredClone(c.routines),next=validate(c);
 for(const id of ['guestActivated','guestDeactivated']){assert.deepEqual(next.routines.find(r=>r.id===id).actions,[]);const bad=structuredClone(next);bad.routines=bad.routines.filter(r=>r.id!==id);assert.throws(()=>protectRoutines(next,bad),/kan ikke slettes/);}
 for(const r of original)assert.deepEqual(next.routines.find(n=>n.id===r.id),r);
 assert.deepEqual(validate(next),next);
});

test('Guest on and off execute configured extras once per change without replaying retired actions',async()=>{
 const h=harness(c=>{add(c,'guestActivated',[step('on')]);add(c,'guestDeactivated',[step('off')]);add(c,'guestOn',[step('legacy')]);});h.ingest();
 h.engine.setGuest(true);await h.engine.tick();h.engine.setGuest(true);await h.engine.tick();h.engine.setGuest(false);await h.engine.tick();h.engine.setGuest(false);await h.engine.tick();
 assert.deepEqual(h.calls.filter(c=>c[0]==='timeline'),[['timeline','on'],['timeline','off']]);
 h.ingest({reconnect:true});await h.engine.tick();assert.equal(h.calls.filter(c=>c[0]==='timeline').length,2);
});

test('Disabling guest extras preserves built-in notifications and occupied house protection',async()=>{
 const h=harness(c=>{c.people.notifications=['a'];add(c,'guestActivated',[step('on')]);add(c,'guestDeactivated',[step('off')]);for(const id of ['guestActivated','guestDeactivated'])c.routines.find(r=>r.id===id).enabled=false;});h.adapter.direct={configured:true};h.ingest();h.engine.setGuest(true);await h.engine.tick();
 assert.equal(h.calls.filter(c=>c[0]==='emit').length,1);assert(!h.calls.some(c=>c[0]==='timeline'));h.person('a',false);h.person('b',false);h.ingest();assert.equal(h.engine.state.mode,'home');assert(!h.engine.runs.some(r=>r.routineId==='away'));
 h.person('a',true);h.ingest();h.engine.setGuest(false);await h.engine.tick();assert(!h.calls.some(c=>c[0]==='timeline'));
});

test('Rapid opposite toggles cancel delayed guest extras; preview includes extras in the intended mode',async()=>{
 const h=harness(c=>{add(c,'guestActivated',[step('on',{delaySeconds:30})]);add(c,'guestDeactivated',[step('off',{delaySeconds:30})]);});h.ingest();
 const preview=require('../lib/preview')(h.engine,'guestActivated');assert.equal(preview.actions[0].result,'planned');
 h.engine.setGuest(true);h.engine.setGuest(false);h.engine.setGuest(true);h.advance(31000);await h.engine.tick();assert.deepEqual(h.calls.filter(c=>c[0]==='timeline'),[['timeline','on']]);
});
