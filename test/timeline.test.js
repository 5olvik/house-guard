'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate}=require('../lib/config'),{HomeyAdapter}=require('../lib/homey-adapter');
const {harness,step,add}=require('./helpers');
function setup(type='normal',alsoTimeline=false,observation=false){
  const h=harness(c=>{c.observation=observation;c.people.notifications=['a','b'];c.bridges.notifications=true;add(c,'welcome',[step('notice',{kind:'notify',category:'notification',text:'Alarm i {zone}: {reason}',notificationType:type,...(type==='image'?{imageDeviceId:'camera'}:{}),alsoTimeline})]);});
  const calls=[];const homey={flow:{getTriggerCard:id=>({trigger:async(tokens,state)=>calls.push({kind:'push',id,tokens,state})})},notifications:{createNotification:async data=>calls.push({kind:'timeline',...data})}};
  const adapter=new HomeyAdapter(homey,()=>h.engine.config);adapter.snapshot=h.adapter.snapshot;h.engine.adapter=adapter;h.ingest();return {h,adapter,calls};
}
test('Existing notification types, recipients and camera survive validation unchanged',()=>{
  for(const type of ['normal','critical','image']){
    const old=defaults();old.delivery.notifications='simple';old.people.notifications=['a','b'];old.bridges.notifications=true;old.security.garage.imageDeviceId='camera';
    add(old,'alarm',[step('alarm',{kind:'notify',text:'Alarm: {zone} {reason}',notificationType:type,imageDeviceId:'camera'})]);
    const before=structuredClone(old);assert.deepEqual(validate(old),before);assert.deepEqual(old,before);
  }
});
test('Every selected user gets each push type; timeline is off by default',async()=>{
  for(const [type,card]of [['normal','notification_requested'],['critical','critical_notification_requested'],['image','image_notification_requested']]){
    const s=setup(type);s.h.engine.start('welcome',{zone:'Gang',reason:'Dør'});await s.h.engine.tick();await s.h.engine.tick();
    assert.deepEqual(s.calls.map(c=>c.kind),['push','push']);assert.deepEqual(s.calls.map(c=>c.state.personId),['a','b']);assert.equal(s.calls.every(c=>c.id===card && c.tokens.text==='Alarm i Gang: Dør'),true);
    if(type==='image')assert.equal(s.calls.every(c=>c.state.imageDeviceId==='camera'),true);
  }
});
test('Optional timeline copy is sent once after push, not once per recipient',async()=>{
  const s=setup('critical',true);s.h.engine.start('welcome',{zone:'Gang',reason:'Dør'});await s.h.engine.tick();await s.h.engine.tick();
  assert.deepEqual(s.calls.map(c=>c.kind),['push','push','timeline']);assert.equal(s.calls[2].excerpt,'Alarm i Gang: Dør');assert.equal(s.calls[0].id,'critical_notification_requested');
  assert.equal(s.h.engine.runs.at(-1).actions[0].status,'accepted');
});
test('Observation suppresses both push and its timeline copy',async()=>{
  const s=setup('image',true,true);s.h.engine.start('welcome',{zone:'Gang',reason:'Dør'});await s.h.engine.tick();assert.deepEqual(s.calls,[]);assert.equal(s.h.engine.runs.at(-1).actions[0].status,'observed');
});
test('Timeline failure does not retry or undo a dispatched push',async()=>{
  const s=setup('critical',true);let copies=0;s.adapter.homey.notifications.createNotification=async()=>{copies++;throw Error('Timeline unavailable');};
  s.h.engine.start('welcome');await s.h.engine.tick();await s.h.engine.tick();assert.equal(s.calls.length,2);assert.equal(copies,1);assert.equal(s.h.engine.runs.at(-1).actions[0].status,'accepted');assert.equal(s.h.engine.history.entries.some(e=>e.message.includes('Tidslinjekopi feilet')),true);
});
test('A cancellation after dispatch prevents the optional timeline copy',async()=>{
  const s=setup('normal',true);let sent=0;s.adapter.homey.flow.getTriggerCard=()=>({trigger:async()=>{if(++sent===2)s.h.engine.state.generation++;}});
  s.h.engine.start('welcome');await s.h.engine.tick();assert.equal(sent,2);assert.deepEqual(s.calls,[]);
});
test('Critical and image Flow cards remain available and timeline choice must be boolean',()=>{
  const m=require('../app.json');for(const id of ['notification_requested','critical_notification_requested','image_notification_requested'])assert.equal(m.flow.triggers.find(c=>c.id===id).deprecated,undefined);
  const c=defaults();add(c,'alarm',[step('bad',{kind:'notify',alsoTimeline:'yes'})]);assert.throws(()=>validate(c),/Vis også i tidslinjen/);
});
