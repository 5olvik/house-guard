'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers'),manual=require('../lib/manual-controls'),{validate}=require('../lib/config'),{HomeyAdapter}=require('../lib/homey-adapter');
function setup(){const h=harness(c=>{c.security.lockDeviceId='lock';Object.assign(c.security.garage,{validated:true,enabled:false,statusDeviceId:'port',statusCapability:'alarm_contact',commandDeviceId:'relay',commandCapability:'onoff',commandType:'pulse',commandValue:true,openValue:true});});h.device('lock','locked',false);h.device('port','alarm_contact',false);h.device('relay','onoff',false);h.ingest();return h;}
test('Manual lock control sends one command and waits for device confirmation',async()=>{
  const h=setup();assert.equal(await manual.run(h.engine,'lock',true),'waiting');assert.equal(h.calls.length,1);assert.equal(manual.status(h.engine).lock.pending,true);
  await assert.rejects(()=>manual.run(h.engine,'lock',true),/pågår/);h.device('lock','locked',true);h.ingest();await h.engine.tick();assert.equal(manual.status(h.engine).lock.pending,false);
  assert.equal(h.engine.runs.at(-1).actions[0].status,'confirmed');await manual.run(h.engine,'lock',true);assert.equal(h.calls.length,1);
});
test('Manual garage open and close use the validated pulse and never repeat while moving',async()=>{
  const h=setup();await manual.run(h.engine,'garage',true);assert.deepEqual(h.calls[0],['set','relay','onoff',true]);
  await assert.rejects(()=>manual.run(h.engine,'garage',false),/pågår/);h.device('port','alarm_contact',true);h.ingest();await h.engine.tick();assert.equal(h.engine.runs.at(-1).actions[0].status,'confirmed');
  await assert.rejects(()=>manual.run(h.engine,'garage',false),/pågår/);h.advance(31000);await manual.run(h.engine,'garage',false);assert.equal(h.calls.length,2);
  h.device('port','alarm_contact',false);h.ingest();await h.engine.tick();assert.equal(h.engine.runs.at(-1).actions[0].status,'confirmed');
});
test('Unknown or unvalidated garage status never pulses; close-only setup never opens',async()=>{
  for(const change of [h=>h.snapshot.devices.port.capabilities.alarm_contact.value=null,h=>h.config.security.garage.validated=false,h=>h.config.security.garage.commandType='close']){
    const h=setup();change(h);await assert.rejects(()=>manual.run(h.engine,'garage',true));assert.equal(h.calls.length,0);
  }
});
test('Observation logs manual commands without external writes and rejects unsafe parameters',async()=>{
  const h=setup();h.config.observation=true;assert.equal(await manual.run(h.engine,'garage',true),'observed');assert.equal(await manual.run(h.engine,'lock',true),'observed');assert.equal(h.calls.length,0);
  await assert.rejects(()=>manual.run(h.engine,'arbitrary','open'));await assert.rejects(()=>manual.run(h.engine,'lock','true'));
});
test('Opening is blocked by armed or pending alarm, while locking remains allowed',async()=>{
  for(const mode of ['armed','pending']){const h=setup();h.config.security.alarmDeviceId='panel';h.device('panel','homealarm_state',mode==='armed'?'armed':'disarmed');if(mode==='pending')h.snapshot.devices.panel.alarmTarget='armed';h.device('lock','locked',true);
    await assert.rejects(()=>manual.run(h.engine,'lock',false),/Frakoble/);await assert.rejects(()=>manual.run(h.engine,'garage',true),/Frakoble/);assert.equal(h.calls.length,0);
  }
});
test('Manual control is cancelled when configuration changes during the status read',async()=>{
  const h=setup();let release;h.adapter.snapshot=()=>new Promise(r=>{release=r;});const sending=manual.run(h.engine,'lock',true);
  h.engine.updateConfig(h.config);release(h.snapshot);await assert.rejects(()=>sending,/erstattet/);assert.equal(h.calls.length,0);
});
test('Adapter rechecks manual port status immediately before writing',async()=>{
  const h=setup(),a=manual.action(h.config,'garage',true);let writes=0;
  const adapter=new HomeyAdapter({},()=>h.config);adapter.api={devices:{getDevice:async()=>({available:true,capabilitiesObj:{onoff:{type:'boolean',setable:true}},setCapabilityValue:async()=>writes++})}};
  adapter.snapshot=async()=>{const s=structuredClone(h.snapshot);s.devices.port.capabilities.alarm_contact.value=null;return s;};
  await assert.rejects(()=>adapter.set(a.deviceId,a.capability,a.value,()=>true,()=>{},a),/ukjent status/);assert.equal(writes,0);
});
test('Imported actions cannot gain manual control privileges',()=>{
  const h=setup(),c=structuredClone(h.config);c.routines[0].actions=[{id:'injected',kind:'set',category:'lock',deviceId:'lock',capability:'locked',value:false,delaySeconds:0,onError:'stop',manualControl:'lock',manualValue:false,builtin:true,guestExplicit:true}];
  assert.throws(()=>validate(c),/sikkerhetsoppsettet/);
});

test('Automatic garage closing cannot pulse during a manual opening, even after cancellation',async()=>{
  const h=setup();h.config.security.garage.enabled=true;h.config.security.garage.temperatureDeviceId='temp';h.config.security.garage.temperatureCapability='measure_temperature';h.device('temp','measure_temperature',10);
  await manual.run(h.engine,'garage',true);const manualRun=h.engine.runs.at(-1);h.device('port','alarm_contact',true);h.ingest();
  const a={id:'auto-port',kind:'garage',category:'garage',status:'pending',onError:'stop'},run={id:'auto',routineId:'home',generation:h.engine.state.generation,context:{},actions:[a]};h.engine.runs.push(run);
  await h.engine.execute(run,a);assert.equal(a.status,'skipped');assert.match(a.error,/portkommando/);assert.equal(h.calls.filter(c=>c[0]==='set').length,1);
  manualRun.cancelled=true;await assert.rejects(()=>manual.run(h.engine,'garage',false),/pågår/);assert.equal(h.calls.filter(c=>c[0]==='set').length,1);
});
