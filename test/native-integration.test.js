'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {defaults}=require('../lib/config'),{Intrusion,ID}=require('../lib/intrusion'),{HomeyAdapter}=require('../lib/homey-adapter');
const {harness,add,step}=require('./helpers');
class FakeDevice {
  constructor(){this.values={};this.listeners={};}
  hasCapability(){return false;}
  getCapabilityOptions(){return {};}
  async setCapabilityOptions(){}
  registerCapabilityListener(id,fn){this.listeners[id]=fn;}
  getCapabilityValue(id){return this.values[id];}
  async setCapabilityValue(id,value){await this.beforeWrite?.(id,value);this.values[id]=value;}
  async setAvailable(){this.available=true;} async setUnavailable(){this.available=false;} error(){}
}
function load(file,adapter) {
  const filename=path.resolve(__dirname,'..',file),module={exports:{}},req=createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:id=>id==='homey'?{App:EventEmitter,Device:FakeDevice,Driver:class{}}:id==='./lib/homey-adapter' && adapter?{HomeyAdapter:adapter}:req(id)});
  return module.exports;
}
const App=load('app.js');
function setup() {
  const h=harness(c=>{c.security.alarmDeviceId=ID;c.security.intrusion={sensors:[{deviceId:'door',capability:'alarm_contact',full:true,partial:true,delay:false}],exitSeconds:0,entrySeconds:0};});
  h.device('door','alarm_contact',false);h.snapshot.devices.door.name='Door';h.snapshot.devices.door.zone='Hall';
  const app=new App();app.engine=h.engine;app.adapter={...h.adapter,api:{},catalogueAt:Date.now()};app.sensorEvents=[];
  app.intrusion=new Intrusion({config:h.config,clock:h.now,emit:(type,payload)=>{h.engine.snapshot.devices[ID]=app.intrusion.device();h.engine.event(type,payload);},changed:s=>app.alarmChanged(s)});
  app.adapter.snapshot=async()=>({...structuredClone(h.snapshot),devices:{...structuredClone(h.snapshot.devices),[ID]:app.intrusion.device()}});
  return {h,app};
}

test('Guest mode immediately disarms armed, pending or active alarms and prevents new manual arming',async()=>{
 for(const state of ['armed','pending','active']){
  const {h,app}=setup();h.config.people.notifications=['a'];h.adapter.direct={configured:true};add(h.config,'home',[step('unexpected-home')]);await app.refresh({initial:true});
  if(state==='pending')h.config.security.intrusion.exitSeconds=30;
  app.intrusion.mode('armed',h.snapshot);if(state==='active'){const snapshot=structuredClone(h.snapshot);snapshot.devices.door.capabilities.alarm_contact.value=true;app.intrusion.update(snapshot);}
  await app.setGuestMode(true);assert.equal(app.intrusion.state.mode,'disarmed',state);assert.equal(app.intrusion.state.active,false);assert.equal(app.intrusion.state.target,null);
  await h.engine.tick();assert(!h.calls.some(c=>c[1]==='unexpected-home'));assert.equal(h.calls.filter(c=>c[0]==='emit' && c[1].text.startsWith('Gjestemodus er på')).length,1);
  await assert.rejects(()=>app.setAlarmMode('armed'),/gjestemodus/);await assert.rejects(()=>app.setAlarmMode('partially_armed'),/gjestemodus/);assert.equal(app.intrusion.state.mode,'disarmed');
 }
});

test('Guest arrival disarms before queuing ordinary home actions, even when automatic home disarming is off',async()=>{
 const {h,app}=setup();h.config.security.automation.home=false;h.config.delays.home=10;h.config.people.notifications=['a'];h.adapter.direct={configured:true};add(h.config,'home',[step('regular-home')]);h.person('a',false);h.person('b',false);await app.refresh({initial:true});app.intrusion.mode('armed',h.snapshot);
 await app.setGuestMode(true);const home=h.engine.runs.find(r=>r.routineId==='home');assert(home && !home.cancelled);assert.equal(app.intrusion.state.mode,'disarmed');await h.engine.tick();assert(!h.calls.some(c=>c[1]==='regular-home'));h.advance(10000);await h.engine.tick();assert(h.calls.some(c=>c[1]==='regular-home'));assert.equal(h.engine.state.mode,'home');
});

test('Guest activation invalidates an arming command already waiting on a snapshot',async()=>{
 const {h,app}=setup();await app.refresh({initial:true});const original=app.adapter.snapshot;let release,entered;const started=new Promise(resolve=>{entered=resolve;});
 app.adapter.snapshot=async()=>{entered();await new Promise(resolve=>{release=resolve;});return original();};
 const arming=assert.rejects(()=>app.setAlarmMode('armed'),/avbrutt|Gjestemodus/);await started;app.adapter.snapshot=original;await app.setGuestMode(true);release();await arming;assert.equal(app.intrusion.state.mode,'disarmed');assert.equal(app.intrusion.state.target,null);
});

test('Latest guest toggle wins over a slow earlier snapshot and disconnected reads do not change the mode',async()=>{
 const {h,app}=setup();await app.refresh({initial:true});const original=app.adapter.snapshot;let release,entered;const started=new Promise(resolve=>{entered=resolve;});
 app.adapter.snapshot=async()=>{entered();await new Promise(resolve=>{release=resolve;});return original();};const on=app.setGuestMode(true);await started;app.adapter.snapshot=original;await app.setGuestMode(false);release();await on;
 assert.equal(h.engine.state.guest,false);assert(!h.engine.runs.some(r=>r.routineId==='guestNotice'));
 app.adapter.snapshot=async()=>({...await original(),connected:false});await assert.rejects(()=>app.setGuestMode(true),/ikke tilkoblet/);assert.equal(h.engine.state.guest,false);
});

test('Saved guest mode keeps the alarm off at reconnect without replaying notices, and observation stays read-only',async()=>{
 for(const observation of [false,true]){
  const {h,app}=setup();await app.refresh({initial:true});app.intrusion.mode('armed',h.snapshot);h.config.observation=observation;h.engine.state.guest=true;
  await app.refresh({reconnect:true});assert.equal(app.intrusion.state.mode,observation?'armed':'disarmed');await h.engine.tick();assert.deepEqual(h.calls,[]);assert.equal(h.engine.state.mode,'home');
 }
});

test('Guest-model upgrade increments revision once and retains saved settings and ordinary routines',async()=>{
 const old=defaults();delete old.guest.model;old.revision=42;old.guest.unlockOnEnable=true;old.routines.find(r=>r.id==='guestOn').actions=[step('old-guest')];old.routines.find(r=>r.id==='home').actions=[step('home')];
 const store={'husmodus.config.v1':structuredClone(old),'husmodus.runtime.v1':{revision:42,runs:[]}};
 class Adapter {constructor(){this.catalogue={devices:{}};}async connect(){}}
 const Upgrade=load('app.js',Adapter);const init=async()=>{const app=new Upgrade();app.log=()=>{};app.error=()=>{};app.registerCards=()=>{};app.refresh=async()=>{};app.homey={clock:{getTimezone:()=>'Europe/Oslo'},settings:{get:k=>store[k],set:(k,v)=>store[k]=v},setInterval:()=>1};await app.onInit();return app;};
 const app=await init();assert.equal(app.engine.config.revision,43);assert.equal(app.engine.config.guest.model,'presence');assert.deepEqual(app.engine.config.routines,old.routines);assert.equal(app.engine.config.guest.unlockOnEnable,true);assert.equal((await init()).engine.config.revision,43);
});
test('Upgrade removes an external panel, old pending runs and alarm state, preserving other configuration',async()=>{
  const old=defaults();old.security.alarmDeviceId='old-panel';old.observation=false;old.people.presence=['resident'];old.security.lockDeviceId='lock';
  const store={'husmodus.config.v1':old,'husmodus.runtime.v1':{guest:true,alarm:{active:true},runs:[{}]}};
  class Adapter {constructor(){this.catalogue={devices:{}};}async connect(){}}
  const Upgrade=load('app.js',Adapter),app=new Upgrade();app.log=()=>{};app.error=()=>{};app.registerCards=()=>{};app.refresh=async()=>{};
  app.homey={clock:{getTimezone:()=>'Europe/Oslo'},settings:{get:k=>store[k],set:(k,v)=>store[k]=v},setInterval:()=>1};
  await app.onInit();assert.equal(app.engine.config.security.alarmDeviceId,ID);assert.equal(app.engine.config.observation,true);assert.equal(app.engine.config.security.intrusion.sensors.length,0);
  assert.equal(app.engine.config.people.presence[0],'resident');assert.equal(app.engine.config.security.lockDeviceId,'lock');assert.equal(app.engine.state.guest,true);assert.equal(app.engine.state.alarm,null);assert.equal(app.intrusion.state.mode,'disarmed');
  assert.equal(app.heimdall,undefined);assert.equal(store['husmodus.config.v1'].revision,1);
});
test('Manifest exposes only our alarm and removes all external alarm input cards and permission',()=>{
  const m=require('../app.json');assert.equal(m.permissions.some(p=>p.startsWith('homey:app:')),false);
  for(const id of ['integration_event','report_alarm_details','report_entry_delay','report_sensor_warning'])assert.equal(m.flow.actions.some(c=>c.id===id),false);
  const callbacks=[];const card=id=>{callbacks.push(id);return {registerRunListener(){},registerArgumentAutocompleteListener(){}};};
  const app=new App();app.homey={flow:{getActionCard:card,getConditionCard:card,getTriggerCard:card}};app.registerCards();assert.equal(callbacks.includes('integration_event'),false);
});
test('Realtime true/false pulse raises one native alarm even when final sensor read is clear',async()=>{
  const {h,app}=setup();await app.refresh({initial:true});app.intrusion.mode('armed',h.snapshot);
  app.sensorEvents=[true,false].map(value=>({id:'door',capability:'alarm_contact',value,revision:h.config.revision,at:Date.now()}));
  await app.refresh();assert.equal(app.intrusion.state.active,true);assert.equal(h.engine.state.alarm.active,true);assert.match(h.engine.state.alarm.reason,/Door/);
  await app.refresh();assert.equal(h.engine.runs.filter(r=>r.routineId==='alarm').length,1);
});
test('Stale sensor events and old revisions do not create an alarm',async()=>{
  const {h,app}=setup();await app.refresh({initial:true});app.intrusion.mode('armed',h.snapshot);
  app.sensorEvents=[{id:'door',capability:'alarm_contact',value:true,revision:h.config.revision-1,at:Date.now()},{id:'door',capability:'alarm_contact',value:true,revision:h.config.revision,at:Date.now()-11000}];
  await app.refresh();assert.equal(app.intrusion.state.active,false);
});
test('Disarming cancels queued entry and arming actions, including a delayed garage routine',async()=>{
  const {h,app}=setup();add(h.config,'arming',[step('delayed',{delaySeconds:60})]);add(h.config,'entryDelay',[step('notice',{delaySeconds:60})]);
  await app.refresh({initial:true});app.intrusion.mode('armed',h.snapshot);h.engine.event('entryDelay',{});
  await app.setAlarmMode('disarmed');assert.equal(h.engine.runs.filter(r=>['arming','entryDelay'].includes(r.routineId)).every(r=>r.cancelled),true);
  h.advance(61000);await h.engine.tick();assert.deepEqual(h.calls,[]);
});
test('Adapter rejects observation and cancelled arm commands without changing alarm state',async()=>{
  const {h,app}=setup(),adapter=new HomeyAdapter({},()=>h.config);adapter.intrusion=app.intrusion;adapter.snapshot=app.adapter.snapshot;
  const action={builtin:true,category:'alarm'};
  await assert.rejects(()=>adapter.set(ID,'homealarm_state','armed',()=>false,()=>{},action),/avbrutt/);
  h.config.observation=true;await assert.rejects(()=>adapter.set(ID,'homealarm_state','armed',()=>true,()=>{},action),/Observasjon/);
  h.config.observation=false;await assert.rejects(()=>adapter.set(ID,'homealarm_state','armed',()=>true),/alarmstyringen/);
  assert.equal(app.intrusion.state.mode,'disarmed');
  await adapter.set(ID,'homealarm_state','armed',()=>true,()=>{},action);assert.equal(app.intrusion.state.mode,'armed');
});
test('Home routine disarms a pending exit instead of treating its current disarmed value as completed',async()=>{
  const {h,app}=setup();h.config.security.intrusion.exitSeconds=30;
  await app.refresh({initial:true});app.intrusion.mode('armed',h.snapshot);
  h.adapter.snapshot=app.adapter.snapshot;h.adapter.set=async(id,cap,value,guard,dispatch)=>{assert.equal(guard(),true);dispatch();app.intrusion.mode(value,h.snapshot);};
  h.engine.start('home');await h.engine.tick();assert.equal(app.intrusion.state.target,null);assert.equal(app.intrusion.state.mode,'disarmed');
});
test('Zero exit delay arms with an active delayed door excluded and queues the warning',()=>{
  const {h,app}=setup();h.config.security.intrusion.sensors[0].delay=true;h.snapshot.devices.door.capabilities.alarm_contact.value=true;
  app.intrusion.mode('armed',h.snapshot);assert.equal(app.intrusion.state.mode,'armed');assert.equal(app.intrusion.state.bypassed.length,1);
  const warning=h.engine.runs.find(r=>r.routineId==='activeSensor');assert.equal(warning.context.bypassed,true);assert.equal(warning.actions[0].kind,'notify');
});
test('Alarm panel shows latest state and cleans up without disarming when deleted',async()=>{
  const {app}=setup(),Device=load('drivers/alarm-panel/device.js'),d=new Device(),timers=new Map();
  d.homey={app,__:key=>key,setInterval:fn=>{timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id)};
  await app.refresh({initial:true});await d.onInit();assert.equal(d.values.alarm_status,'alarm.disarmed');assert.equal(d.listeners.homealarm_state,undefined);
  await app.setAlarmMode('armed');await d.sync();assert.equal(d.values.alarm_status,'alarm.armed');
  await d.listeners.button();assert.equal(d.values.alarm_status,'alarm.disarmed');assert.equal(app.intrusion.state.mode,'disarmed');
  await app.setAlarmMode('partially_armed');await d.sync();d.onDeleted();assert.equal(app.intrusion.state.mode,'partially_armed');assert.equal(app.listenerCount('intrusion_changed'),0);assert.equal(timers.size,0);
});
test('Disarm responds immediately during a blocked arm read, and the late result cannot re-arm',async()=>{
  const {h,app}=setup();await app.refresh({initial:true});let release,started;
  const reading=new Promise(resolve=>{started=resolve;});const original=app.adapter.snapshot;
  app.adapter.snapshot=async()=>{started();await new Promise(resolve=>{release=resolve;});return original();};
  const arm=app.setAlarmMode('armed');const rejected=assert.rejects(arm,/avbrutt ved frakobling/);await reading;
  const disarmed=await app.setAlarmMode('disarmed');assert.equal(disarmed.mode,'disarmed');assert.equal(h.engine.snapshot.devices[ID].capabilities.homealarm_state.value,'disarmed');
  release();await rejected;assert.equal(app.intrusion.state.mode,'disarmed');assert.equal(h.engine.runs.some(r=>r.routineId==='arming'),false);
});

async function motionSetup(change=()=>{}){
 const s=setup(),{h,app}=s;h.advance(7*3600000);
 Object.assign(h.config.morning.motion,{enabled:true,deviceId:'kitchen',capability:'alarm_motion',start:'06:00',end:'12:00'});
 h.config.people.presence=['a','b','c'];h.config.people.night=['a'];h.person('a',true,true);h.person('b',true,true);h.person('c',false,true);
 h.device('kitchen','alarm_motion',false);h.snapshot.devices.kitchen.name='Kitchen';h.config.security.intrusion.sensors.push({deviceId:'kitchen',capability:'alarm_motion',partial:true,full:true,delay:false});
 app.adapter.direct={ready:true};h.engine.adapter=app.adapter;change(s);await app.refresh({initial:true});app.intrusion.mode('partially_armed',h.snapshot);
 s.motion=async(value=true,flags={})=>{h.device('kitchen','alarm_motion',value);app.sensorEvents.push({id:'kitchen',capability:'alarm_motion',value,revision:h.config.revision,at:Date.now()});await app.refresh(flags);};return s;
}

test('Morning motion disarms before the same night sensor triggers, wakes all home residents and preserves extras',async()=>{
 const {h,app,motion}=await motionSetup(({h})=>{h.config.security.automation.morning=false;add(h.config,'morning',[step('old-extra')]);});
 const routines=structuredClone(h.config.routines);await motion();assert.equal(app.intrusion.state.mode,'disarmed');assert.equal(app.intrusion.state.active,false);assert(!h.engine.runs.some(r=>r.routineId==='alarm'));
 const run=h.engine.runs.find(r=>r.routineId==='morning');assert(run);assert.equal(run.context.source,'motion');assert.deepEqual(h.config.routines,routines);
 await h.engine.tick();assert.deepEqual(h.calls,[['person','c',false],['person','a',false]]);h.person('a',true,false);await h.engine.tick();assert.deepEqual(h.calls.at(-1),['person','b',false]);h.person('b',true,false);await h.engine.tick();assert.deepEqual(h.calls.at(-1),['timeline','old-extra']);assert.equal(h.calls.filter(c=>c[0]==='person'&&c[1]==='c').length,1);
 await motion(false);await motion();assert.equal(h.engine.runs.filter(r=>r.routineId==='morning').length,1);
});
test('Disabled feature, outside window, no one home, observation and guest protection preserve alarm behavior',async()=>{
 for(const scenario of ['disabled','early','late','away','observation','guest','api']){
  const {h,app,motion}=await motionSetup();
  if(scenario==='disabled')h.config.morning.motion.enabled=false;
  if(scenario==='early'){h.config.morning.motion.start='07:00';}
  if(scenario==='late'){h.config.morning.motion.start='04:00';h.config.morning.motion.end='06:00';}
  if(scenario==='away'){h.person('a',false,true);h.person('b',false,true);}
  if(scenario==='observation')h.config.observation=true;
  if(scenario==='guest')h.engine.state.guest=true;
  if(scenario==='api')app.adapter.direct.ready=false;
  await motion();assert(!h.engine.runs.some(r=>r.routineId==='morning'),scenario);assert.equal(app.intrusion.state.mode,scenario==='guest'?'disarmed':'partially_armed',scenario);
 }
});
test('Full alarm, entry delay, existing alarm or simultaneous other sensor cannot be dismissed by morning motion',async()=>{
 for(const scenario of ['full','entry','active','other']){
  const {h,app,motion}=await motionSetup();
  if(scenario==='full')app.intrusion.state.mode='armed';
  if(scenario==='entry')app.intrusion.state.entryAt=h.now()+30000;
  if(scenario==='active')app.intrusion.state.active=true;
  if(scenario==='other')h.device('door','alarm_contact',true);
  await motion();assert.notEqual(app.intrusion.state.mode,'disarmed',scenario);assert(!h.engine.runs.some(r=>r.routineId==='morning'),scenario);
 }
});
test('No morning replay on initial read, reconnect or a sensor active before the time window',async()=>{
 for(const flags of [{initial:true},{reconnect:true}]){const {h,app,motion}=await motionSetup();await motion(true,flags);assert(!h.engine.runs.some(r=>r.routineId==='morning'));assert.notEqual(app.intrusion.state.mode,'disarmed');}
 const {h,app,motion}=await motionSetup();h.config.security.intrusion.sensors=h.config.security.intrusion.sensors.filter(s=>s.deviceId!=='kitchen');h.config.morning.motion.start='07:00';await motion();h.advance(3600000);await app.refresh();assert(!h.engine.runs.some(r=>r.routineId==='morning'));await motion(false);await motion();assert.equal(app.intrusion.state.mode,'disarmed');assert(h.engine.runs.some(r=>r.routineId==='morning'));
});
test('A short motion pulse survives reconciliation and morning works after a new night on the same date',async()=>{
 const {h,app,motion}=await motionSetup();h.engine.state.morningKey='morning-2026-09-22';
 app.sensorEvents=[true,false].map(value=>({id:'kitchen',capability:'alarm_motion',value,at:Date.now(),revision:h.config.revision}));await app.refresh();assert.equal(app.intrusion.state.mode,'disarmed');assert.equal(h.engine.state.motionMorningConsumed,true);
 // Even if waking fails, more motion does not retry the same morning.
 for(const r of h.engine.runs.filter(r=>r.routineId==='morning'))for(const a of r.actions)a.status='failed';
 await motion();assert.equal(h.engine.runs.filter(r=>r.routineId==='morning').length,1);
 await h.engine.manual('night');assert.equal(h.engine.state.motionMorningConsumed,false);await motion(false);await motion();assert.equal(h.engine.runs.filter(r=>r.routineId==='morning').length,2);
});
test('Motion waking remains built in when morning extras are disabled, without changing ordinary morning',async()=>{
 const {h,motion}=await motionSetup(({h})=>{h.config.routines.find(r=>r.id==='morning').enabled=false;add(h.config,'morning',[step('disabled-extra')]);});await motion();const run=h.engine.runs.find(r=>r.routineId==='morning');assert(run.actions.some(a=>a.personId==='b'));assert(!run.actions.some(a=>a.id==='disabled-extra'));
 const normal=harness(c=>{c.people.night=['a'];});normal.person('a',true,true);normal.person('b',true,true);normal.ingest();await normal.engine.manual('morning');assert(!normal.engine.runs.find(r=>r.routineId==='morning').actions.some(a=>a.personId==='b'));
});

test('Motion morning migration is off and preserves every existing routine and setting',()=>{
 const {validate,defaults}=require('../lib/config');const old=defaults();delete old.morning.motion;old.morning.scheduled=true;old.morning.time='08:15';old.security.automation.morning=false;old.routines.find(r=>r.id==='morning').enabled=false;
 const migrated=validate(old),expected=structuredClone(old);expected.morning.motion=defaults().morning.motion;assert.deepEqual(migrated,expected);assert.deepEqual(validate(migrated),migrated);
 for(const fields of [{start:'12:00',end:'06:00'},{start:'06:00',end:'06:00'},{capability:'alarm_contact'},{enabled:true,deviceId:''}])assert.throws(()=>validate({...migrated,morning:{...migrated.morning,motion:{...migrated.morning.motion,...fields}}}));
});
