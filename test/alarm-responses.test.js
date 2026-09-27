'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate}=require('../lib/config');
const responses=require('../lib/alarm-responses');
const {builtins}=require('../lib/plans');
const {harness,step,add}=require('./helpers');
const ID='house-guard-internal-alarm';

test('A new alarm has automatic push without any alarm routine',()=>{
  const c=defaults();c.security.alarmDeviceId=ID;c.routines=[];
  assert.equal(builtins('alarm',c,{},{}).filter(a=>a.kind==='notify').length,1);
  assert.equal(responses.allActions({...c,security:{...c.security,alarmDeviceId:''}}).length,0);
});
test('Legacy alarm choices migrate once, preserving recipients, conditions and unrelated routines',()=>{
  const c=defaults();delete c.security.responses;c.security.alarmDeviceId=ID;
  c.people.notifications=['a'];
  add(c,'alarm',[step('push',{kind:'notify',notificationType:'critical',onError:'continue',text:'Alarm {zone}'}),step('timeline',{onError:'continue',text:'Logg'}),step('sound',{kind:'sound',deviceId:'sonos',text:'alarm3',volume:65,when:'away',onError:'continue'}),step('light',{kind:'set',category:'lights',deviceId:'light',capability:'onoff',value:true,when:'asleep',onError:'continue',confirmSeconds:42}),step('complex',{kind:'notify',text:'Senere',delaySeconds:10})]);
  const old=structuredClone(c),m=validate(c),r=m.security.responses.alarm;
  assert(r.push&&r.critical&&r.timeline);assert.equal(r.timelineText,'Logg');assert.equal(r.audio[0].when,'away');assert.equal(r.lights[0].confirmSeconds,42);
  assert.deepEqual(m.routines.find(r=>r.id==='alarm').actions.map(a=>a.id),['complex']);
  assert.deepEqual(m.people,old.people);assert.deepEqual(m.routines.find(r=>r.id==='away'),old.routines.find(r=>r.id==='away'));
  assert.deepEqual(validate(m),m);assert.deepEqual(c,old);
});
test('Migration keeps disabled and dependent alarm actions without activating them',()=>{
  const c=defaults();delete c.security.responses;
  add(c,'alarm',[step('notify',{kind:'notify',onError:'continue',text:'Hi'}),step('after',{dependsOn:'notify',requireConfirmed:true})]);
  c.routines.find(r=>r.id==='alarmOff').enabled=false;
  const m=validate(c);assert.equal(m.security.responses.alarm.push,false);assert.equal(m.routines.find(r=>r.id==='alarm').actions.length,2);assert.equal(m.security.responses.alarmOff.push,false);
});
test('Critical push and image are separate, optional timeline is not the notification route',()=>{
  const c=defaults();c.security.alarmDeviceId=ID;Object.assign(c.security.responses.alarm,{critical:true,imageDeviceId:'camera',timeline:true});
  const a=responses.actions(c,'alarm');assert.deepEqual(a.map(a=>a.kind),['notify','notify','timeline']);assert.deepEqual(a.filter(a=>a.kind==='notify').map(a=>a.notificationType),['critical','image']);
  assert(a.every(a=>a.onError==='continue'));
});
test('An active bypassed sensor always gets exactly one push even with image and critical configured',()=>{
  const c=defaults();c.security.alarmDeviceId=ID;Object.assign(c.security.responses.activeSensor,{critical:true,imageDeviceId:'camera'});
  const actions=builtins('activeSensor',c,{bypassed:true},{});assert.equal(actions.filter(a=>a.kind==='notify').length,1);assert.equal(actions.find(a=>a.kind==='notify').notificationType,'normal');
});
test('Camera failure and waiting alarm lights cannot prevent push or Sonos',async()=>{
  const h=harness(c=>{c.security.alarmDeviceId=ID;c.people.notifications=['a'];c.routines=[];Object.assign(c.security.responses.alarm,{critical:true,imageDeviceId:'broken-camera',audio:[{kind:'sound',deviceId:'speaker',text:'alarm3',volume:35,when:''}],lights:[{deviceId:'light',when:'',confirmSeconds:60}]});});
  h.adapter.direct={configured:true};h.device(ID,'alarm_generic',true);h.device('light','onoff',false);h.ingest();h.engine.state.alarm={active:true};
  const emit=h.adapter.emit;h.adapter.emit=async(...args)=>{if(args[0].notificationType==='image')throw Error('Camera unavailable');return emit(...args);};
  const run=h.engine.start('alarm') || h.engine.runs.find(r=>r.routineId==='alarm');await h.engine.tick();
  assert.equal(run.actions.find(a=>a.notificationType==='image').status,'failed');assert(h.calls.some(c=>c[0]==='emit'&&c[1].notificationType==='critical'));assert(h.calls.some(c=>c[0]==='emit'&&c[1].kind==='sound'));assert.equal(run.actions.find(a=>a.kind==='set').status,'waiting');
});
test('Deleting custom extras cannot remove configured alarm reactions; disarmed and observation guards still apply',async()=>{
  for(const observation of [false,true]){
    const h=harness(c=>{c.observation=observation;c.security.alarmDeviceId=ID;c.routines=[];c.people.notifications=['a'];});h.adapter.direct={configured:true};h.device(ID,'alarm_generic',false);h.ingest();h.engine.state.alarm={active:false};
    const run=h.engine.start('alarm') || h.engine.runs.find(r=>r.routineId==='alarm');await h.engine.tick();assert.equal(h.calls.length,0);assert(run.actions.every(a=>a.status==='skipped'));
  }
  const h=harness(c=>{c.observation=true;c.security.alarmDeviceId=ID;c.routines=[];});h.device(ID,'alarm_generic',true);h.ingest();h.engine.state.alarm={active:true};const run=h.engine.start('alarm') || h.engine.runs.find(r=>r.routineId==='alarm');await h.engine.tick();assert.equal(h.calls.length,0);assert(run.actions.every(a=>a.status==='observed'));
});
test('Alarm configuration cannot smuggle lock/garage writes or invalid volume',()=>{
  const c=defaults();c.security.garage.commandDeviceId='relay';c.security.responses.alarm.lights=[{deviceId:'relay',when:'',confirmSeconds:60}];assert.throws(()=>validate(c),/sikkerhetsoppsettet/);
  c.security.responses.alarm.lights=[];c.security.responses.alarm.audio=[{kind:'sound',deviceId:'sonos',text:'alarm3',volume:200,when:''}];assert.throws(()=>validate(c),/volum|Volum/);
});
test('Wizard can restore a deleted default routine without affecting other choices',()=>{
  const c=defaults();c.people.presence=['a'];c.routines=c.routines.filter(r=>r.id!=='away');
  const next=require('../settings/setup-model').change(c,{flows:{away:'normal:off'}},{people:{a:{id:'a'}},flows:[{id:'off',type:'normal',name:'Lights off',enabled:true,triggerable:true}]});
  assert.equal(next.routines.find(r=>r.id==='away').actions[0].flowId,'off');assert.deepEqual(next.security,c.security);
});
test('Disabled legacy arming extras do not silently enable lock or garage during migration',()=>{
  const h=harness(c=>{delete c.security.responses;c.security.alarmDeviceId=ID;c.security.lockDeviceId='lock';c.security.lockOnArming=true;c.routines.find(r=>r.id==='arming').enabled=false;});
  h.ingest();assert.equal(h.engine.start('arming').actions.length,0);
  h.config.security.responses.arming.push=true;
  assert.deepEqual(h.engine.start('arming').actions.map(a=>a.kind),['notify']);
});
