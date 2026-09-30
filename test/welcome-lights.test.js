'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {harness,add,step}=require('./helpers'),{defaults,validate}=require('../lib/config');
const {HomeyAdapter}=require('../lib/homey-adapter'),welcome=require('../lib/welcome-lights');
const preview=require('../lib/preview');
function setup(change=()=>{}) {
  const h=harness(c=>{
    c.welcome.doorDeviceId='sensor';c.welcome.luxDeviceId='lux';c.welcome.delaySeconds=0;c.delays.home=120;
    add(c,'home',[step('home-later')]);
    add(c,'welcome',[step('light',{kind:'set',category:'lights',deviceId:'lamp',capability:'onoff',value:true})]);change(c);
  });
  h.person('a',false);h.person('b',false);h.device('sensor',h.config.welcome.doorCapability,false);h.device('lux','measure_luminance',9);h.device('lamp','onoff',false);
  h.ingest({initial:true});return h;
}
function arrive(h) {h.person('a',true);h.ingest();}
function trigger(h,options) {h.device('sensor',h.config.welcome.doorCapability,true);h.ingest(options);}
function loadApp(Adapter) {
  const file=path.resolve(__dirname,'../app.js'),module={exports:{}},req=createRequire(file);
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:id=>id==='homey'?{App:EventEmitter}:id==='./lib/homey-adapter' && Adapter?{HomeyAdapter:Adapter}:req(id)});
  return module.exports;
}
function appFor(h) {
  const App=loadApp(),app=new App();app.engine=h.engine;
  app.adapter={...h.adapter,api:{},catalogueAt:Date.now()};h.engine.adapter=app.adapter;app.sensorEvents=[];return app;
}

test('Welcome delay zero dispatches at the sensor event, independently of the home delay',async()=>{
  for(const motion of [false,true]) {
    const h=setup(c=>{if(motion){c.welcome.sensorType='motion';c.welcome.doorCapability='alarm_motion';}});
    arrive(h);trigger(h);const run=h.engine.runs.find(r=>r.routineId==='welcome');
    assert.equal(run.dueAt,h.now());await h.engine.tick();
    assert.deepEqual(h.calls,[['set','lamp','onoff',true]]);assert(!h.calls.some(c=>c[1]==='home-later'));
    await h.engine.tick();assert.equal(h.calls.length,1);
  }
});
test('Welcome delay and action delay add up exactly, with no hidden 30/32 seconds',async()=>{
  for(const [global,extra] of [[0,0],[0,30],[4,3],[32,0]]) {
    const h=setup(c=>{c.welcome.delaySeconds=global;c.routines.find(r=>r.id==='welcome').actions[0].delaySeconds=extra;});
    arrive(h);trigger(h);
    if(global+extra){h.advance((global+extra)*1000-1);await h.engine.tick();assert.equal(h.calls.length,0);h.advance(1);}
    await h.engine.tick();assert.deepEqual(h.calls,[['set','lamp','onoff',true]]);
  }
});
test('Short welcome pulses survive refresh even when the final reading is inactive',async()=>{
  for(const motion of [false,true]) {
    const h=setup(c=>{if(motion){c.welcome.sensorType='motion';c.welcome.doorCapability='alarm_motion';}}),app=appFor(h);
    h.person('a',true);await app.refresh();
    app.receiveSensor('sensor',h.config.welcome.doorCapability,true);app.receiveSensor('sensor',h.config.welcome.doorCapability,false);
    assert.equal(app.sensorEvents.length,2);await app.refresh();await h.engine.tick();
    assert.deepEqual(h.calls,[['set','lamp','onoff',true]]);
    assert.equal(h.engine.snapshot.devices.sensor.capabilities[h.config.welcome.doorCapability].value,false);
    app.receiveSensor('sensor',h.config.welcome.doorCapability,true);await app.refresh();await h.engine.tick();assert.equal(h.calls.length,1);
  }
});
test('A first arrival and a short motion pulse in the same refresh start welcome lights once',async()=>{
  const h=setup(c=>{c.welcome.sensorType='motion';c.welcome.doorCapability='alarm_motion';}),app=appFor(h);
  h.person('a',true);app.receiveSensor('sensor','alarm_motion',true);app.receiveSensor('sensor','alarm_motion',false);
  await app.refresh();await h.engine.tick();assert.deepEqual(h.calls,[['set','lamp','onoff',true]]);
});
test('Guest arrivals use the chosen welcome sensor, and ending guest mode cancels the waiting light action',async()=>{
  for(const cancelled of [false,true]) {
    const h=setup(c=>{c.welcome.delaySeconds=5;c.welcome.sensorType='motion';c.welcome.doorCapability='alarm_motion';});
    h.engine.setGuest(true);trigger(h);const run=h.engine.runs.find(r=>r.routineId==='welcome');assert(run.context.guestArrival);
    if(cancelled)h.engine.setGuest(false);h.advance(5000);await h.engine.tick();
    assert.equal(h.calls.filter(c=>c[0]==='set').length,cancelled?0:1);
  }
});
test('Motion outside an arrival window, an expired window and a second resident do not start welcome lights',async()=>{
  for(const scenario of ['no-arrival','expired','second-resident']) {
    const h=setup(c=>{c.welcome.sensorType='motion';c.welcome.doorCapability='alarm_motion';});
    if(scenario==='no-arrival'){h.person('a',true);h.ingest({reconnect:true});}
    if(scenario==='expired'){arrive(h);h.advance(600001);}
    if(scenario==='second-resident'){arrive(h);h.engine.state.welcomeUntil=0;h.person('b',true);h.ingest();}
    trigger(h);await h.engine.tick();assert(!h.calls.some(c=>c[0]==='set'));
  }
});
test('Startup, reconnect, obsolete config and old sensor events never replay welcome lights',async()=>{
  for(const scenario of ['initial','reconnect','revision','old']) {
    const h=setup(),app=appFor(h);arrive(h);app.receiveSensor('sensor','alarm_contact',true);
    if(scenario==='revision')app.sensorEvents[0].revision--;
    if(scenario==='old')app.sensorEvents[0].at-=11000;
    await app.refresh(scenario==='initial'?{initial:true}:scenario==='reconnect'?{reconnect:true}:{});await h.engine.tick();
    assert.equal(h.calls.length,0);if(['initial','reconnect'].includes(scenario))assert.equal(h.engine.state.welcomeUntil,0);
  }
});
test('Welcome lights cancel when everyone leaves or settings change during the delay',async()=>{
  for(const change of ['away','config']) {
    const h=setup(c=>{c.welcome.delaySeconds=5;});arrive(h);trigger(h);
    if(change==='away'){h.person('a',false);h.ingest();}else h.engine.updateConfig(h.config);
    h.advance(5000);await h.engine.tick();assert.equal(h.calls.length,0);
  }
});
test('Lux mode skips bright, old, missing and unavailable readings',async()=>{
  for(const kind of ['bright','old','missing','unavailable']) {
    const h=setup();arrive(h);
    if(kind==='bright')h.device('lux','measure_luminance',15);
    if(kind==='old')h.device('lux','measure_luminance',9,h.now()-601000);
    if(kind==='missing')delete h.snapshot.devices.lux;
    if(kind==='unavailable')h.snapshot.devices.lux.available=false;
    trigger(h);await h.engine.tick();assert.equal(h.calls.length,0);assert.equal(h.engine.state.welcomeUntil,0);
  }
});
test('Solar mode works before and after midnight without a lux sensor, and skips daylight/unknown sun',async()=>{
  for(const kind of ['evening','after-midnight','day','unknown','old']) {
    const h=setup(c=>{c.welcome.lightMode='sunset';c.welcome.luxDeviceId='';});delete h.snapshot.devices.lux;
    h.snapshot.sun={available:kind!=='unknown',dark:['evening','after-midnight'].includes(kind),observedAt:h.now()-(kind==='old'?61000:0)};
    arrive(h);trigger(h);await h.engine.tick();
    assert.equal(h.calls.length,['evening','after-midnight'].includes(kind)?1:0,kind);
  }
});
test('Sunrise during a welcome delay cancels delivery, but a changed lux reading does not interrupt a light sequence',async()=>{
  const h=setup(c=>{c.welcome.lightMode='sunset';c.welcome.delaySeconds=5;});h.snapshot.sun={available:true,dark:true,observedAt:h.now()};
  arrive(h);trigger(h);h.advance(5000);h.snapshot.sun={available:true,dark:false,observedAt:h.now()};await h.engine.tick();assert.equal(h.calls.length,0);
  const lux=setup(c=>{c.welcome.delaySeconds=5;});arrive(lux);trigger(lux);lux.advance(5000);lux.device('lux','measure_luminance',100);await lux.engine.tick();assert.equal(lux.calls.length,1);
});
test('Old welcome configurations retain devices, lux, delay zero or 32 and all custom actions',()=>{
  for(const delay of [0,32]) {
    const c=defaults();delete c.welcome.lightMode;delete c.welcome.sensorType;c.welcome.delaySeconds=delay;c.welcome.doorDeviceId='keep-door';c.welcome.luxDeviceId='keep-lux';
    add(c,'welcome',[step('keep',{delaySeconds:17})]);const next=validate(c);
    assert.equal(next.welcome.lightMode,'lux');assert.equal(next.welcome.sensorType,'contact');assert.equal(next.welcome.delaySeconds,delay);assert.equal(next.welcome.doorDeviceId,'keep-door');assert.equal(next.welcome.luxDeviceId,'keep-lux');assert.deepEqual(next.routines,c.routines);
  }
  assert.equal(defaults().welcome.delaySeconds,0);
  const bad=defaults();bad.welcome.lightMode='guess';assert.throws(()=>validate(bad),/solnedgang/);
  bad.welcome.lightMode='lux';bad.welcome.sensorType='motion';assert.throws(()=>validate(bad),/sensortype/);
});
test('Welcome migration persists once and keeps an existing delay and routine unchanged',async()=>{
  const old=defaults();delete old.welcome.lightMode;delete old.welcome.sensorType;old.welcome.delaySeconds=32;old.revision=90;add(old,'welcome',[step('keep',{delaySeconds:12})]);
  const store={'husmodus.config.v1':structuredClone(old)};
  class Adapter{constructor(){this.catalogue={devices:{}};}async connect(){}}
  const App=loadApp(Adapter),init=async()=>{const app=new App();app.log=()=>{};app.error=()=>{};app.registerCards=()=>{};app.refresh=async()=>{};
    app.homey={clock:{getTimezone:()=>'Europe/Oslo'},settings:{get:k=>store[k],set:(k,v)=>store[k]=v},setInterval:()=>1};await app.onInit();return app;};
  const app=await init();assert.equal(app.engine.config.revision,91);assert.equal(app.engine.config.welcome.delaySeconds,32);assert.deepEqual(app.engine.config.routines,old.routines);assert.equal((await init()).engine.config.revision,91);
});
test('Solar reads use only built-in conditions and include the hours before sunrise',async()=>{
  for(const [sunset,sunrise,dark] of [[false,true,false],[true,true,true],[false,false,true],[true,false,true]]) {
    const c=defaults(),calls=[],adapter=new HomeyAdapter({},()=>c);
    adapter.direct={ready:true,call:async(op,guard)=>{guard();return op({flow:{runFlowCardCondition:async args=>{calls.push(args);return {error:null,result:args.id===welcome.SUNSET?sunset:sunrise};}}});}};
    const sun=await adapter.sunlight();assert.equal(sun.available,true);assert.equal(sun.dark,dark);assert.deepEqual(calls.map(c=>c.id),[welcome.SUNSET,welcome.SUNRISE]);assert(calls.every(c=>c.$timeout===3000));
  }
});
test('Missing API, errors and invalid solar responses remain unknown and never guess darkness',async()=>{
  for(const mode of ['missing','not-ready','throws','error','invalid']) {
    const c=defaults(),adapter=new HomeyAdapter({},()=>c);
    if(mode!=='missing')adapter.direct={ready:mode!=='not-ready',call:async()=>{if(mode==='throws')throw Error('failed');return [{result:true,error:mode==='error'?'no-location':null},{result:mode==='invalid'?'false':false,error:null}];}};
    const sun=await adapter.sunlight();assert.equal(sun.available,false);assert.equal(sun.dark,undefined);
  }
});
test('Welcome reserve polls quickly while waiting, detects arrival at five seconds and stays idle without configured welcome actions',async()=>{
  const h=setup(),reads=[],events=[];let refreshes=0,present=false,value=false;
  const adapter=new HomeyAdapter({},()=>h.engine.config);adapter.api={devices:{getDevice:async args=>{reads.push(['door',args]);return {available:true,capabilitiesObj:{alarm_contact:{value}}};}},users:{getUsers:async args=>{reads.push(['people',args]);return {a:{present},b:{present:false}};}}};
  adapter.onSensor=(...args)=>events.push(args);adapter.onChange=()=>refreshes++;
  await adapter.checkWelcome(h.engine,10000);assert.equal(reads.length,2);
  present=true;await adapter.checkWelcome(h.engine,11000);assert.equal(reads.length,2);
  await adapter.checkWelcome(h.engine,15000);assert.equal(refreshes,1);assert.equal(reads.length,4);
  arrive(h);value=true;await adapter.checkWelcome(h.engine,16000);assert.equal(reads.length,5);assert.deepEqual(events,[['sensor','alarm_contact',true]]);assert.equal(refreshes,2);
  assert(reads.every(([,args])=>args.$timeout===3000 && args.$cache===false));
  h.engine.state.welcomeUntil=0;await adapter.checkWelcome(h.engine,30000);assert.equal(reads.length,5);
  h.config.routines.find(r=>r.id==='welcome').enabled=false;h.person('a',false);h.ingest();await adapter.checkWelcome(h.engine,40000);assert.equal(reads.length,5);
});
test('A welcome reserve read in flight cannot queue events after configuration changes or overlap another read',async()=>{
  const h=setup();arrive(h);let release,reads=0,events=0;
  const adapter=new HomeyAdapter({},()=>h.engine.config);adapter.api={devices:{getDevice:()=>{reads++;return new Promise(resolve=>{release=()=>resolve({capabilitiesObj:{alarm_contact:{value:true}}});});}}};adapter.onSensor=()=>events++;adapter.onChange=()=>events++;
  const first=adapter.checkWelcome(h.engine,10000);await adapter.checkWelcome(h.engine,11000);assert.equal(reads,1);
  h.engine.updateConfig(h.engine.config);release();await first;assert.equal(events,0);
});
test('Solar selection does not read an unused lux sensor, and preview uses the same light condition and total delay',()=>{
  const h=setup(c=>{c.welcome.lightMode='sunset';c.welcome.delaySeconds=2;c.routines.find(r=>r.id==='welcome').actions[0].delaySeconds=3;});
  const adapter=new HomeyAdapter({},()=>h.config);assert(!adapter.selectedDevices().includes('lux'));
  arrive(h);h.snapshot.sun={available:true,dark:false,observedAt:h.now()};h.ingest();const p=preview(h.engine,'welcome',h.config,{});
  assert.equal(p.actions[0].delaySeconds,5);assert.equal(p.actions[0].result,'skipped');assert.match(p.actions[0].reason,/soloppgang/);
});
test('Capability subscriptions wait for a real connection and expose failures instead of silently losing events',async()=>{
  const c=defaults();c.welcome.doorDeviceId='sensor';const errors=[],events=[];let release,listener,created=0,refreshed=0;
  const d={capabilities:['alarm_contact'],connect:()=>new Promise(resolve=>{release=resolve;}),makeCapabilityInstance:(id,fn)=>{created++;listener=fn;return {destroy(){}};}};
  const adapter=new HomeyAdapter({app:{error:text=>errors.push(text)}},()=>c);adapter.api={devices:{getDevice:async()=>d}};adapter.onSensor=(...args)=>events.push(args);adapter.onChange=()=>refreshed++;
  const subscribing=adapter.subscribe();await new Promise(resolve=>setImmediate(resolve));assert.equal(created,0);
  release();await subscribing;listener(true);assert.deepEqual(events,[['sensor','alarm_contact',true]]);assert.equal(refreshed,1);
  d.connect=async()=>{throw Error('connection failed');};await adapter.subscribe();assert.equal(adapter.instances.length,0);assert.equal(errors.length,1);assert.equal(created,1);
});
