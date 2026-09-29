'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Intrusion,ID}=require('../lib/intrusion'),flows=require('../lib/sensor-flows'),{defaults}=require('../lib/config');
const motion={deviceId:'motion',capability:'alarm_motion'},door={deviceId:'door',capability:'alarm_contact'};
function setup(saved={},change=()=>{},changeSnapshot=()=>{}){
 let now=10000,persisted;const config=defaults();config.observation=false;config.security.alarmDeviceId=ID;config.security.intrusion={exitSeconds:0,entrySeconds:5,sensors:[{...motion,full:true,partial:true,delay:false},{...door,full:true,partial:true,delay:true}]};change(config);
 const events=[],snapshot={connected:true,devices:{motion:{name:'Stue',zone:'Stue',capabilities:{alarm_motion:{value:false}}},door:{name:'Dør',zone:'Gang',capabilities:{alarm_contact:{value:false}}}}};
 const model=new Intrusion({config,saved,clock:()=>now,persist:s=>persisted=structuredClone(s),emit:(type,data)=>events.push({type,data})});changeSnapshot(snapshot);model.update(snapshot);
 return {model,config,snapshot,events,saved:()=>persisted,advance:ms=>now+=ms,update:()=>model.update(snapshot),value:(sensor,value)=>snapshot.devices[sensor.deviceId].capabilities[sensor.capability].value=value};
}

test('Disabling a sensor while armed preserves other sensors, configuration and alarm mode',()=>{
 const h=setup(),before=structuredClone(h.config);h.model.mode('armed',h.snapshot);flows.set(h.model,motion,'armed',false);h.value(motion,true);h.update();assert(!h.model.state.active);assert.equal(h.model.state.mode,'armed');assert.deepEqual(h.config,before);
 h.value(door,true);h.update();h.advance(6000);h.update();assert(h.model.state.active);assert.equal(h.model.state.context.deviceId,'door');
});

test('Full and partial exclusions are independent and survive disarm and restart',()=>{
 for(const [excluded,other] of [['armed','partially_armed'],['partially_armed','armed']]){
  const h=setup();flows.set(h.model,motion,excluded,false);h.model.mode(excluded,h.snapshot);h.value(motion,true);h.update();assert(!h.model.state.active);
  h.model.mode('disarmed',h.snapshot);const r=setup(h.saved());assert(flows.disabled(r.model,motion,excluded));r.model.mode(other,r.snapshot);r.value(motion,true);r.update();assert(r.model.state.active);
 }
});

test('Re-enable waits for a confirmed clear reading before monitoring active or unknown sensors',()=>{
 const h=setup();flows.set(h.model,motion,'armed',false);h.model.mode('armed',h.snapshot);h.value(motion,true);h.update();flows.set(h.model,motion,'armed',true);h.update();assert(!h.model.state.active);assert.equal(h.model.state.bypassed.length,1);
 h.value(motion,null);h.update();assert.equal(h.model.state.bypassed.length,1);h.snapshot.connected=false;h.value(motion,false);h.update();assert.equal(h.model.state.bypassed.length,1);
 const r=setup(h.saved(),()=>{},snapshot=>snapshot.devices.motion.capabilities.alarm_motion.value=true);r.update();assert(!r.model.state.active);r.value(motion,false);r.update();assert.equal(r.model.state.bypassed.length,0);r.value(motion,true);r.update();assert(r.model.state.active);
});

test('Repeated enable is idempotent and cannot bypass a sensor which is already enabled',()=>{
 const h=setup();h.model.mode('armed',h.snapshot);h.value(motion,true);assert.equal(flows.set(h.model,motion,'armed',true),false);assert.deepEqual(h.model.state.bypassed,[]);h.update();assert(h.model.state.active);
});

test('Disable does not silence an active alarm or cancel an entry countdown',()=>{
 for(const active of [false,true]){
  const h=setup();h.model.mode('armed',h.snapshot);h.value(door,true);h.update();if(active){h.advance(6000);h.update();}
  const countdown=h.model.state.entryAt,context=structuredClone(h.model.state.context);flows.set(h.model,door,'armed',false);assert.equal(h.model.state.entryAt,countdown);assert.deepEqual(h.model.state.context,context);
  h.advance(6000);h.update();assert(h.model.state.active);assert.equal(h.events.filter(e=>e.type==='alarm').length,1);
 }
});

test('All sensors can be explicitly excluded; status shows zero protection; an empty base selection still cannot arm',()=>{
 const h=setup();for(const sensor of [motion,door])flows.set(h.model,sensor,'armed',false);
 h.value(motion,null);h.value(door,true);h.model.mode('armed',h.snapshot);h.update();assert.equal(h.model.state.mode,'armed');assert(!h.model.state.active);assert.equal(h.model.status().sensorCounts.armed,0);assert.equal(h.model.status().disabledSensors.length,2);
 const empty=setup({},c=>c.security.intrusion.sensors=[]);assert.throws(()=>empty.model.mode('armed',empty.snapshot),/minst én/);
});

test('Exit delay uses latest exclusions and excludes active sensors enabled before it ends',()=>{
 const h=setup({},c=>c.security.intrusion.exitSeconds=5);h.model.mode('armed',h.snapshot);flows.set(h.model,motion,'armed',false);h.value(motion,true);h.advance(6000);h.update();assert.equal(h.model.state.mode,'armed');assert(!h.model.state.active);
 h.model.mode('disarmed',h.snapshot);h.model.mode('armed',h.snapshot);flows.set(h.model,motion,'armed',true);h.advance(6000);h.update();assert(!h.model.state.active);assert.equal(h.model.state.bypassed[0].deviceId,'motion');
});

test('Invalid or no-longer-selected sensor and mode are rejected without mutating protection',()=>{
 const h=setup();for(const [sensor,mode,enabled]of [[null,'armed',false],[motion,'disarmed',false],[motion,'armed','false'],[{...motion,capability:'alarm_contact'},'armed',false]])assert.throws(()=>flows.set(h.model,sensor,mode,enabled));
 h.config.security.intrusion.sensors[0].partial=false;assert.throws(()=>flows.set(h.model,motion,'partially_armed',false));assert.deepEqual(h.model.disabledSensors,[]);
 h.config.security.alarmDeviceId='';assert.throws(()=>flows.set(h.model,motion,'armed',false),/Slå på/);
});

test('Unrelated config edits preserve exclusions; removed mode membership clears only that exclusion',()=>{
 const h=setup();flows.set(h.model,motion,'armed',false);flows.set(h.model,motion,'partially_armed',false);h.model.mode('armed',h.snapshot);
 const next=structuredClone(h.config);next.revision++;h.model.configure(next);assert.equal(h.model.disabledSensors.length,2);
 h.model.mode('disarmed',h.snapshot);const changed=structuredClone(next);changed.security.intrusion.sensors[0].partial=false;h.model.configure(changed);assert.deepEqual(h.model.disabledSensors,[{...motion,mode:'armed'}]);
 const saved=h.saved();saved.disabledSensors.push({...motion,mode:'armed'},null,{deviceId:'gone',capability:'alarm_motion',mode:'armed'});const restored=setup(saved,c=>c.security.intrusion.sensors[0].partial=false);assert.deepEqual(restored.model.disabledSensors,[{...motion,mode:'armed'}]);
});

test('Flow cards expose mode-filtered sensors, persist changes and keep observation free of external commands',async()=>{
 const h=setup({},c=>c.observation=true),cards={},logs=[];
 const app={intrusion:h.model,engine:{config:h.config,log:s=>logs.push(s),save:()=>{}},adapter:{catalogue:{devices:h.snapshot.devices}},homey:{flow:{getActionCard:id=>cards[id]={registerArgumentAutocompleteListener:(name,fn)=>cards[id].autocomplete=fn,registerRunListener:fn=>cards[id].run=fn}}}};flows.register(app);
 const card=cards.disable_alarm_sensor,options=await card.autocomplete('Stue',{mode:'armed'});assert.equal(options.length,1);assert.equal(options[0].capability,'alarm_motion');await card.run({sensor:options[0],mode:'armed'});assert(flows.disabled(h.model,motion,'armed'));assert.match(logs[0],/observasjon/);
 assert(!h.events.some(e=>e.type==='alarm'));await cards.enable_alarm_sensor.run({sensor:options[0],mode:'armed'});assert(!flows.disabled(h.model,motion,'armed'));
 h.config.security.intrusion.sensors[0].full=false;assert.deepEqual(await card.autocomplete('Stue',{mode:'armed'}),[]);await assert.rejects(()=>card.run({sensor:options[0],mode:'armed'}),/ikke valgt/);
 for(const definition of flows.definitions()){const actual=require('../app.json').flow.actions.find(c=>c.id===definition.id);assert(actual);assert.equal(actual.args.length,2);assert.equal(actual.deprecated,undefined);}
});
