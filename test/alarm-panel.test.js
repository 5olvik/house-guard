'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const manifest=require('../app.json'),locale=require('../locales/no.json');
class Device {
 constructor(){this.capabilities=new Set(['homealarm_state','alarm_generic','alarm_status','button']);this.values={};this.listeners={};this.options={button:{title:{no:'Frakoble og avstill',en:'Disarm and silence'}}};this.removed=[];}
 hasCapability(id){return this.capabilities.has(id);}
 async removeCapability(id){this.capabilities.delete(id);this.removed.push(id);}
 getCapabilityOptions(id){return this.options[id];}
 async setCapabilityOptions(id,options){this.options[id]=options;}
 registerCapabilityListener(id,fn){this.listeners[id]=fn;}
 getCapabilityValue(id){return this.values[id];}
 async setCapabilityValue(id,value){assert(this.hasCapability(id));this.values[id]=value;}
 async setAvailable(){this.available=true;}
 async setUnavailable(){this.available=false;}
 error(error){this.lastError=error;}
}
const file=path.resolve(__dirname,'../drivers/alarm-panel/device.js'),moduleStub={exports:{}};
vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:moduleStub,require:id=>{assert.equal(id,'homey');return {Device};}},{filename:file});
function setup(){
 const device=new moduleStub.exports(),app=new EventEmitter(),calls=[],timers=new Set();
 const state={selected:true,mode:'partially_armed',target:null,active:false,entryAt:null,observation:false,faults:[],bypassed:[]};
 app.getAlarmStatus=()=>structuredClone(state);app.setAlarmMode=async mode=>{calls.push(mode);Object.assign(state,{mode,active:false,target:null,entryAt:null});app.emit('intrusion_changed');};
 device.homey={app,__:key=>key.split('.').reduce((v,k)=>v[k],locale),setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)};
 return {device,app,state,calls,timers};
}
test('Existing alarm panels migrate to status and dismiss only without sending mode commands',async()=>{
 const s=setup();await s.device.onInit();assert.deepEqual(s.device.removed,['homealarm_state']);assert.deepEqual(Object.keys(s.device.listeners),['button']);assert.deepEqual(s.calls,[]);
 assert.equal(s.device.values.alarm_status,'Delvis');assert.equal(s.device.options.button.title.no,'Avstill alarm');
 const driver=manifest.drivers.find(d=>d.id==='alarm-panel');assert.deepEqual([...s.device.capabilities],driver.capabilities);assert.equal(manifest.capabilities.alarm_status.setable,false);
 s.device.onUninit();await s.device.onInit();assert.equal(s.device.removed.length,1);assert.deepEqual(s.calls,[]);
});
test('Panel keeps live mode, delay, triggering sensor and fault status without exposing arming',async()=>{
 const s=setup();await s.device.onInit();
 for(const [change,text]of [[{mode:'armed'},'Tilkoblet'],[{mode:'disarmed',target:'armed'},'Utgangsforsinkelse'],[{target:null,entryAt:123},'Inngangsforsinkelse'],[{entryAt:null,active:true,context:{reason:'Ytterdør åpnet'}},'Alarm utløst · Ytterdør åpnet']]){
  Object.assign(s.state,change);s.app.emit('intrusion_changed');await s.device.queue;assert.equal(s.device.values.alarm_status,text);
 }
 s.state.faults=['Sensor utilgjengelig'];await s.device.sync();assert.match(s.device.values.alarm_status,/Sensor utilgjengelig/);assert.equal(s.device.values.alarm_generic,true);assert.deepEqual(s.calls,[]);
});
test('Dismiss uses app disarm path and updates the same panel; unpairing sends no command',async()=>{
 const s=setup();s.state.active=true;await s.device.onInit();await s.device.listeners.button();assert.deepEqual(s.calls,['disarmed']);assert.equal(s.device.values.alarm_status,'Frakoblet');assert.equal(s.device.values.alarm_generic,false);
 s.device.onDeleted();assert.equal(s.app.listenerCount('intrusion_changed'),0);assert.equal(s.timers.size,0);assert.deepEqual(s.calls,['disarmed']);
});

test('Panel reports Flow exclusions for the current mode and warns when no sensor is monitored',async()=>{
 const s=setup();s.state.disabledSensors=[{mode:'armed'},{mode:'partially_armed'}];s.state.sensorCounts={armed:1,partially_armed:0};await s.device.onInit();
 assert.match(s.device.values.alarm_status,/1 sensor\(er\) deaktivert fra Flow/);assert.match(s.device.values.alarm_status,/Ingen sensorer overvåkes/);
 s.state.mode='armed';await s.device.sync();assert(!s.device.values.alarm_status.includes('Ingen sensorer'));assert.deepEqual(s.calls,[]);s.device.onUninit();
});
