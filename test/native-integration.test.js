'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {defaults}=require('../lib/config'),{Intrusion,ID}=require('../lib/intrusion'),{HomeyAdapter}=require('../lib/homey-adapter');
const {harness,add,step}=require('./helpers');
class FakeDevice {
  constructor(){this.values={};this.listeners={};}
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
test('Zero exit delay rejects an open delayed door before creating arming actions',()=>{
  const {h,app}=setup();h.config.security.intrusion.sensors[0].delay=true;h.snapshot.devices.door.capabilities.alarm_contact.value=true;
  assert.throws(()=>app.intrusion.mode('armed',h.snapshot),/aktiv/);assert.equal(h.engine.runs.some(r=>r.routineId==='arming'),false);
});
test('Alarm panel shows latest state and cleans up without disarming when deleted',async()=>{
  const {app}=setup(),Device=load('drivers/alarm-panel/device.js'),d=new Device(),timers=new Map();
  d.homey={app,__:key=>key,setInterval:fn=>{timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id)};
  await app.refresh({initial:true});await d.onInit();assert.equal(d.values.homealarm_state,'disarmed');
  await d.listeners.homealarm_state('armed');assert.equal(d.values.homealarm_state,'armed');
  await d.listeners.button();assert.equal(d.values.homealarm_state,'disarmed');
  await d.listeners.homealarm_state('partially_armed');d.onDeleted();assert.equal(app.intrusion.state.mode,'partially_armed');assert.equal(app.listenerCount('intrusion_changed'),0);assert.equal(timers.size,0);
});
test('Disarm responds immediately during a blocked arm read, and the late result cannot re-arm',async()=>{
  const {h,app}=setup();await app.refresh({initial:true});let release,started;
  const reading=new Promise(resolve=>{started=resolve;});const original=app.adapter.snapshot;
  app.adapter.snapshot=async()=>{started();await new Promise(resolve=>{release=resolve;});return original();};
  const arm=app.setAlarmMode('armed');const rejected=assert.rejects(arm,/avbrutt ved frakobling/);await reading;
  const disarmed=await app.setAlarmMode('disarmed');assert.equal(disarmed.mode,'disarmed');assert.equal(h.engine.snapshot.devices[ID].capabilities.homealarm_state.value,'disarmed');
  release();await rejected;assert.equal(app.intrusion.state.mode,'disarmed');assert.equal(h.engine.runs.some(r=>r.routineId==='arming'),false);
});
