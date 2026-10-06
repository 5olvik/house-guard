'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {harness}=require('./helpers'),api=require('../api');
class FakeDevice {
 constructor(){this.value=null;this.listeners={};this.writes=[];this.errors=[];}
 registerCapabilityListener(id,fn){this.listeners[id]=fn;}
 getCapabilityValue(){return this.value;}
 async setCapabilityValue(id,value){await this.beforeWrite?.(value);this.value=value;this.writes.push(value);}
 async setAvailable(){this.available=true;}
 async setUnavailable(message){this.available=false;this.unavailableMessage=message;}
 error(...args){this.errors.push(args);}
}
function load(relative){
 const filename=path.resolve(__dirname,'..',relative),module={exports:{}},localRequire=createRequire(filename);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:id=>id==='homey'?{App:EventEmitter,Driver:class{},Device:FakeDevice}:localRequire(id)},{filename});return module.exports;
}
const App=load('app.js'),NightDevice=load('drivers/night-mode/device.js'),NightDriver=load('drivers/night-mode/driver.js');
function setup(customize=()=>{}){
 const h=harness(customize),app=new App(),timers=new Map();app.engine=h.engine;app.adapter=h.adapter;
 const saved=[];h.engine.persist=state=>{saved.push(structuredClone(state));app.publishNightMode();};
 const homey={app,__:key=>key==='night.device_name'?'Nattmodus':'Venter på nattstatus',setInterval:fn=>{const id={};timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id)};
 app.homey=homey;const device=new NightDevice();device.homey=homey;h.ingest();
 const write=h.adapter.setAsleep;h.adapter.setAsleep=async(...args)=>{await write(...args);const [id,value]=args;h.person(id,h.snapshot.people[id].present,value);h.ingest();};
 return {h,app,homey,device,timers,saved};
}
async function settle(s){s.h.advance(5000);await s.h.engine.tick();s.h.advance(5000);await s.h.engine.tick();await s.device.syncQueue;}

test('Paring tilbyr én stabil Nattmodus-enhet uten å aktivere natt eller morgen',async()=>{
 const s=setup(),driver=new NightDriver();driver.homey=s.homey;
 const list=await driver.onPairListDevices();assert.equal(list.length,1);assert.equal(list[0].name,'Nattmodus');assert.equal(list[0].data.id,'house-guard-night-mode');assert.equal((await driver.onPairListDevices())[0].data.id,list[0].data.id);
 assert.equal(s.h.engine.runs.length,0);assert.deepEqual(s.h.calls,[]);
 const manifest=require('../app.json'),spec=manifest.drivers.find(d=>d.id==='night-mode');assert(spec);assert.deepEqual(spec.capabilities,['onoff']);assert.equal(spec.capabilitiesOptions.onoff.zoneActivity,false);
 for(const image of Object.values(spec.images))assert(fs.existsSync(path.resolve(__dirname,'..',image.slice(1))));
});
test('Oppstart viser faktisk nattstatus uten å starte handlinger',async()=>{
 const s=setup();s.h.person('a',true,true);s.h.person('b',true,true);s.h.ingest({initial:true});await s.device.onInit();
 assert.equal(s.device.value,true);assert.equal(s.device.available,true);assert.equal(s.timers.size,1);assert.deepEqual(s.h.calls,[]);assert.equal(s.h.engine.runs.length,0);
});
test('På og av bruker eksisterende natt og morgen; egne innstillinger og andre brukere beholdes',async()=>{
 const s=setup(c=>{c.people.night=['a'];});const config=structuredClone(s.h.config);await s.device.onInit();
 await s.device.listeners.onoff(true);await settle(s);assert.equal(s.device.value,true);assert.equal(s.app.getNightMode(),true);assert.equal(s.h.snapshot.people.a.asleep,true);assert.equal(s.h.snapshot.people.b.asleep,false);
 await s.device.listeners.onoff(false);await settle(s);assert.equal(s.device.value,false);assert.equal(s.app.getNightMode(),false);assert.equal(s.h.snapshot.people.a.asleep,false);assert.deepEqual(s.h.config,config);
 assert.equal(s.h.engine.runs.filter(r=>r.routineId==='night').length,1);assert.equal(s.h.engine.runs.filter(r=>r.routineId==='morning').length,1);
 assert.equal(s.h.calls.filter(c=>c[0]==='timeline'&&c[1].includes('Huset har våknet')).length,1);
});
test('Repeterte på/av starter ikke ekstra natt- eller morgenrutiner',async()=>{
 const s=setup();await s.device.onInit();await s.device.listeners.onoff(false);assert.equal(s.h.engine.runs.length,0);
 await s.device.listeners.onoff(true);await settle(s);const count=s.h.calls.length;await s.device.listeners.onoff(true);assert.equal(s.h.calls.length,count);
 await s.device.listeners.onoff(false);await settle(s);const after=s.h.calls.length;await s.device.listeners.onoff(false);assert.equal(s.h.calls.length,after);
 assert.equal(s.h.engine.runs.filter(r=>r.routineId==='night').length,1);assert.equal(s.h.engine.runs.filter(r=>r.routineId==='morning').length,1);
});
test('GUI og Flow-kort synkroniserer enheten gjennom samme faktiske husstatus',async()=>{
 const s=setup();await s.device.onInit();await api.command({homey:s.homey,body:{type:'mode',mode:'night'}});await s.device.syncQueue;assert.equal(s.device.value,true);
 await s.h.engine.tick();await settle(s);
 const callbacks={},card=id=>({registerRunListener:fn=>{callbacks[id]=fn;},registerArgumentAutocompleteListener(){}});
 s.homey.flow={getActionCard:card,getConditionCard:card,getTriggerCard:card};s.app.registerCards();
 await callbacks.set_mode({mode:'morning'});await s.h.engine.tick();await settle(s);assert.equal(s.device.value,false);
});
test('Automatisk natt og første oppvåkning holder bryteren oppdatert',async()=>{
 const s=setup();await s.device.onInit();s.h.person('a',true,true);s.h.person('b',true,true);s.h.ingest();await s.device.syncQueue;assert.equal(s.device.value,true);
 s.h.person('a',true,false);s.h.ingest();await s.device.syncQueue;assert.equal(s.device.value,false);assert.equal(s.h.snapshot.people.b.asleep,true);
});
test('Raske på/av-kommandoer og treg skriving ender med siste status',async()=>{
 const s=setup();await s.device.onInit();let release,entered;const started=new Promise(r=>{entered=r;});
 s.device.beforeWrite=async value=>{if(value){entered();await new Promise(r=>{release=r;});}};
 const on=s.device.listeners.onoff(true);await started;const off=s.device.listeners.onoff(false);release();await Promise.all([on,off]);await s.device.syncQueue;
 assert.equal(s.device.value,false);assert.equal(s.app.getNightMode(),false);assert.equal(s.h.engine.runs.filter(r=>r.routineId==='morning').length,1);
});
test('Gjestemodus holder bryteren av og sperrer nattaktivering',async()=>{
 const s=setup();await s.device.onInit();await s.app.setGuestMode(true);await s.device.syncQueue;
 const nightCount=s.h.engine.runs.filter(r=>r.routineId==='night').length;
 await assert.rejects(s.device.listeners.onoff(true),/gjestemodus/i);assert.equal(s.device.value,false);assert.equal(s.h.engine.runs.filter(r=>r.routineId==='night').length,nightCount);
});
test('Tomt hus kan ikke aktiveres eller settes kunstig hjemme; av er en uendret status',async()=>{
 const s=setup();s.h.person('a',false,false);s.h.person('b',false,false);s.h.ingest({initial:true});await s.device.onInit();
 await assert.rejects(s.device.listeners.onoff(true),/noen er hjemme/);await s.device.listeners.onoff(false);
 assert.equal(s.device.value,false);assert.deepEqual(s.h.calls,[]);assert.equal(s.h.engine.runs.length,0);assert.equal(s.h.engine.state.mode,'away');
});
for(const problem of ['observation','disconnect','presence','sleep','stale'])test('Enheten blir utilgjengelig og sender ingen kommando ved '+problem,async()=>{
 const s=setup(c=>{c.observation=problem==='observation';});
 if(problem==='disconnect')s.h.snapshot.connected=false;
 if(problem==='presence')s.h.snapshot.people.a.present=null;
 if(problem==='sleep')s.h.snapshot.people.a.asleep=null;
 if(problem==='stale')s.h.snapshot.people.a.observedAt=s.h.now()-(s.h.config.freshnessSeconds+1)*1000;
 s.h.ingest({initial:true});await s.device.onInit();assert.equal(s.device.available,false);
 await assert.rejects(s.device.listeners.onoff(true));assert.deepEqual(s.h.calls,[]);assert(!s.h.engine.runs.some(r=>r.routineId==='night'||r.routineId==='morning'));
});
test('Oppstart før motoren og en midlertidig enhetsfeil repareres ved avstemming',async()=>{
 const s=setup(),engine=s.app.engine;s.app.engine=undefined;await s.device.onInit();assert.equal(s.device.available,false);
 s.app.engine=engine;s.device.beforeWrite=async()=>{throw Error('Midlertidig feil');};s.app.publishNightMode();await s.device.syncQueue.catch(()=>{});assert.equal(s.device.available,false);
 s.device.beforeWrite=undefined;await [...s.timers.values()][0]();assert.equal(s.device.value,false);assert.equal(s.device.available,true);assert.deepEqual(s.h.calls,[]);
});
test('Endret oppsett under den siste manuelle avlesningen avbryter uten å starte natt',async()=>{
 const s=setup();await s.device.onInit();let reads=0;const read=s.h.adapter.snapshot;
 s.h.adapter.snapshot=async()=>{const snapshot=await read();if(++reads===2)s.h.engine.updateConfig(s.h.config);return snapshot;};
 await assert.rejects(s.device.listeners.onoff(true),/Oppsettet ble endret/);assert.equal(s.device.value,false);assert.equal(s.h.engine.runs.length,0);assert.deepEqual(s.h.calls,[]);
 s.h.adapter.snapshot=read;await s.device.listeners.onoff(true);assert.equal(s.device.value,true);
});
test('Ugyldige verdier avvises og sletting rydder lyttere/timer uten modusendring',async()=>{
 const s=setup();await s.device.onInit();assert.throws(()=>s.app.setNightMode('true'),/av\/på/);
 s.device.onDeleted();assert.equal(s.app.listenerCount('night_changed'),0);assert.equal(s.timers.size,0);
 s.h.person('a',true,true);s.h.person('b',true,true);s.h.ingest({initial:true});await s.device.syncQueue;assert.equal(s.device.value,false);assert.equal(s.app.getNightMode(),true);assert.deepEqual(s.h.calls,[]);
});

test('Manifest-generatoren beholder alle kontrollenheter og det eksisterende alarmpanelet som status/avstilling',()=>{
 const filename=path.resolve(__dirname,'../scripts/manifest.js'),localRequire=createRequire(filename);let generated;
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:id=>id==='node:fs'?{writeFileSync:(file,value)=>{assert.equal(file,'app.json');generated=JSON.parse(value);}}:localRequire(id),console:{log(){}}},{filename});
 assert.deepEqual(generated.drivers,require('../app.json').drivers);
 assert(!generated.drivers.find(d=>d.id==='alarm-panel').capabilities.includes('homealarm_state'));
});
