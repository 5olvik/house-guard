'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Intrusion,ID}=require('../lib/intrusion'),{defaults,validate}=require('../lib/config');
const {harness,step,add}=require('./helpers');
function alarm(change=()=>{},saved={}) {
  let now=100000,stored;const config=defaults();config.security.alarmDeviceId=ID;
  config.security.intrusion={exitSeconds:0,entrySeconds:5,sensors:[{deviceId:'door',capability:'alarm_contact',full:true,partial:true,delay:true},{deviceId:'motion',capability:'alarm_motion',full:true,partial:false,delay:false}]};change(config);
  const snapshot={connected:true,devices:{door:{id:'door',name:'Door',zone:'Hall',available:true,capabilities:{alarm_contact:{value:false}}},motion:{id:'motion',name:'Motion',zone:'Living room',available:true,capabilities:{alarm_motion:{value:false}}}}};
  const events=[],model=new Intrusion({config:validate(config),saved,clock:()=>now,persist:s=>stored=structuredClone(s),emit:(type,payload)=>events.push({type,payload})});
  const update=()=>model.update(structuredClone(snapshot));
  return {model,config,snapshot,events,update,advance:ms=>now+=ms,saved:()=>stored};
}
test('Old configurations gain an empty alarm configuration without changing their selected panel',()=>{const c=defaults();delete c.security.intrusion;c.security.alarmDeviceId='existing';assert.deepEqual(validate(c).security.intrusion,{sensors:[],exitSeconds:30,entrySeconds:30});assert.equal(validate(c).security.alarmDeviceId,'existing');});
test('Alarm validates sensors and rejects duplicate or unsupported capability selections',()=>{const h=alarm();h.config.security.intrusion.sensors.push(h.config.security.intrusion.sensors[0]);assert.throws(()=>validate(h.config),/flere ganger/);h.config.security.intrusion.sensors=[{deviceId:'sensor',capability:'onoff',full:true,partial:false,delay:false}];assert.throws(()=>validate(h.config),/dør\/vindu/);});
test('Partial mode ignores full-only motion while full mode raises one alarm with exact context',()=>{const h=alarm();h.model.mode('partially_armed',h.snapshot);h.snapshot.devices.motion.capabilities.alarm_motion.value=true;h.update();assert.equal(h.model.state.active,false);h.model.mode('disarmed',h.snapshot);h.snapshot.devices.motion.capabilities.alarm_motion.value=false;h.model.mode('armed',h.snapshot);h.snapshot.devices.motion.capabilities.alarm_motion.value=true;h.update();h.update();assert.equal(h.events.filter(e=>e.type==='alarm').length,1);assert.equal(h.model.state.context.zone,'Living room');assert.match(h.model.state.context.reason,/Motion/);});
test('Entry delay survives door closing, and disarm cancels it',()=>{const h=alarm();h.model.mode('armed',h.snapshot);h.snapshot.devices.door.capabilities.alarm_contact.value=true;h.update();const deadline=h.model.state.entryAt;h.snapshot.devices.door.capabilities.alarm_contact.value=false;h.update();assert.equal(h.model.state.entryAt,deadline);h.advance(5000);h.update();assert.equal(h.model.state.active,true);h.model.mode('disarmed',h.snapshot);assert.equal(h.model.state.active,false);assert.equal(h.events.filter(e=>e.type==='alarmOff').length,1);h.model.mode('armed',h.snapshot);h.snapshot.devices.door.capabilities.alarm_contact.value=true;h.update();h.model.mode('disarmed',h.snapshot);h.advance(6000);h.update();assert.equal(h.model.state.active,false);});
test('Immediate sensor overrides an entry delay',()=>{const h=alarm();h.model.mode('armed',h.snapshot);h.snapshot.devices.door.capabilities.alarm_contact.value=true;h.update();h.snapshot.devices.motion.capabilities.alarm_motion.value=true;h.update();assert.equal(h.model.state.active,true);assert.equal(h.model.state.entryAt,null);assert.equal(h.model.state.context.deviceId,'motion');});
test('Exit delay arms the house with an active door temporarily excluded, then rejoins it',()=>{
  const h=alarm(c=>{c.security.intrusion.exitSeconds=5;});h.snapshot.devices.door.capabilities.alarm_contact.value=true;h.model.mode('armed',h.snapshot);h.advance(5000);h.update();
  assert.equal(h.model.state.mode,'armed');assert.equal(h.model.state.target,null);assert.equal(h.model.state.active,false);assert.equal(h.model.state.bypassed[0].deviceId,'door');
  h.update();assert.equal(h.events.filter(e=>e.type==='activeSensor').length,1);assert.equal(h.events.find(e=>e.type==='activeSensor').payload.bypassed,true);
  h.snapshot.devices.door.capabilities.alarm_contact.value=false;h.update();assert.deepEqual(h.model.state.bypassed,[]);
  h.snapshot.devices.door.capabilities.alarm_contact.value=true;h.update();assert.ok(h.model.state.entryAt);h.advance(5000);h.update();assert.equal(h.model.state.active,true);
});

test('Unknown and disconnected sensors still block arming',()=>{for(const change of [h=>h.snapshot.connected=false,h=>delete h.snapshot.devices.door,h=>h.snapshot.devices.motion.available=false]){const h=alarm();change(h);assert.throws(()=>h.model.mode('armed',h.snapshot));assert.equal(h.model.state.mode,'disarmed');}});
test('Empty mode sensor selection blocks arming',()=>{const h=alarm(c=>{c.security.intrusion.sensors=[];});assert.throws(()=>h.model.mode('armed',h.snapshot),/minst/);});
test('Disconnected reads cannot complete exit delay and recover only with fresh clear sensors',()=>{const h=alarm(c=>{c.security.intrusion.exitSeconds=5;});h.model.mode('armed',h.snapshot);h.advance(6000);h.snapshot.connected=false;h.update();assert.equal(h.model.state.mode,'disarmed');assert.equal(h.model.state.target,'armed');h.snapshot.connected=true;h.update();assert.equal(h.model.state.mode,'armed');});
test('Restart retains armed/alarm state and pending entry context, but cancels incomplete arming',()=>{const h=alarm();h.model.mode('armed',h.snapshot);h.snapshot.devices.door.capabilities.alarm_contact.value=true;h.update();const restarted=alarm(()=>{},h.saved());restarted.advance(6000);restarted.update();assert.equal(restarted.model.state.active,true);assert.equal(restarted.model.state.context.deviceId,'door');const active=alarm(()=>{},restarted.saved());active.update();assert.equal(active.model.state.active,true);assert.equal(active.events.filter(e=>e.type==='alarm').length,0);const exiting=alarm(c=>{c.security.intrusion.exitSeconds=5;});exiting.model.mode('armed',exiting.snapshot);const again=alarm(c=>{c.security.intrusion.exitSeconds=5;},exiting.saved());assert.equal(again.model.state.target,null);assert.equal(again.model.state.mode,'disarmed');});
test('Sensor and observation changes are blocked while armed; unrelated edits preserve state',()=>{const h=alarm();h.model.mode('armed',h.snapshot);const changed=structuredClone(h.config);changed.observation=false;assert.throws(()=>h.model.configure(changed),/Frakoble/);const unrelated=structuredClone(h.config);unrelated.delays.away=21;h.model.configure(unrelated);assert.equal(h.model.state.mode,'armed');h.model.mode('disarmed',h.snapshot);h.model.configure(changed);assert.equal(h.model.state.mode,'disarmed');});
test('Native alarm events in observation plan routines without any outgoing side effects',async()=>{const h=harness(c=>{c.observation=true;c.security.alarmDeviceId=ID;add(c,'alarm',[step('notice',{kind:'notify',text:'Alarm {zone} {reason}'})]);});const a=alarm();a.model.emit=(type,payload)=>{h.snapshot.devices[ID]=a.model.device();h.engine.snapshot.devices[ID]=a.model.device();h.engine.event(type,payload);};h.snapshot.devices[ID]=a.model.device();h.ingest();a.model.mode('armed',a.snapshot);a.snapshot.devices.motion.capabilities.alarm_motion.value=true;a.update();await h.engine.tick();assert.equal(h.calls.length,0);assert.equal(h.engine.state.alarm.zone,'Living room');assert.equal(h.engine.runs.find(r=>r.routineId==='alarm').actions[0].status,'observed');});
test('Native alarm survives unrelated autosave without replaying activation',()=>{const h=alarm();h.model.mode('armed',h.snapshot);h.snapshot.devices.motion.capabilities.alarm_motion.value=true;h.update();const c=structuredClone(h.config);c.revision++;c.routines[0].name='New name';h.model.configure(c);h.update();assert.equal(h.events.filter(e=>e.type==='alarm').length,1);});

test('An active immediate sensor is excluded without disabling protection from other sensors',()=>{
  const h=alarm();h.snapshot.devices.motion.capabilities.alarm_motion.value=true;h.model.mode('armed',h.snapshot);h.update();
  assert.equal(h.model.state.mode,'armed');assert.equal(h.model.state.active,false);assert.equal(h.model.state.bypassed[0].deviceId,'motion');
  h.snapshot.devices.door.capabilities.alarm_contact.value=true;h.update();h.advance(5000);h.update();assert.equal(h.model.state.active,true);assert.equal(h.model.state.context.sensorName,'Door');
});
test('Bypassed sensors persist through restart, require false to rejoin, and reset on disarm',()=>{
  const h=alarm();h.snapshot.devices.motion.capabilities.alarm_motion.value=true;h.model.mode('armed',h.snapshot);
  const again=alarm(()=>{},h.saved());again.snapshot.devices.motion.capabilities.alarm_motion.value=true;again.update();assert.equal(again.model.state.active,false);assert.equal(again.model.state.bypassed.length,1);
  again.snapshot.devices.motion.capabilities.alarm_motion.value=null;again.update();assert.equal(again.model.state.bypassed.length,1);
  again.snapshot.devices.motion.capabilities.alarm_motion.value=false;again.update();assert.equal(again.model.state.bypassed.length,0);
  again.snapshot.devices.motion.capabilities.alarm_motion.value=true;again.update();assert.equal(again.model.state.active,true);again.model.mode('disarmed',again.snapshot);assert.deepEqual(again.model.state.bypassed,[]);
});
test('Arming warning sends one system push to all selected recipients, even with the custom routine disabled',async()=>{
  for(const enabled of [true,false]){
    const h=harness(c=>{c.people.notifications=['a','b'];c.bridges.notifications=true;const r=c.routines.find(r=>r.id==='activeSensor');r.enabled=enabled;r.actions=[step('custom-push',{kind:'notify',text:'Custom'})];});h.ingest();
    h.engine.event('activeSensor',{bypassed:true,reason:'Window (Bedroom)'});await h.engine.tick();
    const pushes=h.calls.filter(c=>c[0]==='emit');assert.equal(pushes.length,1);assert.deepEqual(pushes[0][1].recipients,['a','b']);assert.match(pushes[0][1].text,/Window/);assert.match(pushes[0][1].text,/tilkoblet/);
  }
});
