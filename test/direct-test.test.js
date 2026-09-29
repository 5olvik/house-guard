'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{testDirect,MESSAGE}=require('../lib/direct-test');
const {HomeyAdapter}=require('../lib/homey-adapter'),{defaults}=require('../lib/config');
function fixture(){
 const calls=[],store=new Map(),receipts=[],config=defaults();config.observation=false;config.people.notifications=['a','b'];
 const app={integrationTestCount:0,engine:{state:{generation:1},config,newDelivery:()=> 'delivery',deliveryResult:(...args)=>receipts.push(args)},homey:{settings:{set:(k,v)=>store.set(k,v)},setTimeout}};
 app.homey.app=app;
 const api={devices:{getDevice:async({id})=>({id,name:id,available:true,images:[{id:'snapshot',type:'camera'}]})},flow:{
  getFlowCardAutocomplete:async()=>['a','b'].map(id=>({id,name:id,athomId:'account-'+id})),
  runFlowCardAction:async x=>{if(x.id.startsWith('homey:manager:mobile:'))calls.push(['push',x]);else {calls.push(['card',x]);app.integrationTestCount++;}},
  createFlow:async x=>{calls.push(['create',x]);return {id:'temporary-id'};},
  triggerFlow:async x=>{calls.push(['trigger',x]);app.integrationTestCount++;},
  deleteFlow:async x=>calls.push(['delete',x])}};
 app.adapter=new HomeyAdapter(app.homey,()=>app.engine.config);app.adapter.api=api;
 app.adapter.direct={ready:true,configured:true,call:async(fn,guard,onDispatch=()=>{})=>{guard();onDispatch();return fn(api);}};
 return {app,api,calls,store,receipts};
}
test('Connection diagnostic invokes only the fixed no-op card',async()=>{const h=fixture();assert.deepEqual(await testDirect(h.app,'access'),{type:'access',executed:true});assert.equal(h.calls[0][1].id,'homey:app:no.husmodus:check_integration_access');await assert.rejects(()=>testDirect(h.app,'arbitrary'));});
test('Flow diagnostic creates, starts, confirms and removes only its own temporary no-op flow',async()=>{const h=fixture();const r=await testDirect(h.app,'flow');assert(r.executed&&r.temporaryFlowRemoved);assert.deepEqual(h.calls.map(c=>c[0]),['create','trigger','delete']);assert.equal(h.calls[0][1].flow.actions.length,1);assert.equal(h.calls[0][1].flow.actions[0].id,'homey:app:no.husmodus:check_integration_access');assert.equal(h.store.get('houseguard.pending-test-flow.v1'),'');});
test('Flow diagnostic cleans up after failed start or changed configuration',async()=>{for(const changed of [false,true]){const h=fixture();h.api.flow.triggerFlow=async()=>{throw Error('failed');};if(changed)h.api.flow.createFlow=async()=>{h.app.engine.state.generation++;return {id:'temporary-id'};};await assert.rejects(()=>testDirect(h.app,'flow'));assert.deepEqual(h.calls.at(-1),['delete',{id:'temporary-id'}]);assert(!h.app.directTestRunning);}});

test('Explicit push diagnostic works in test mode without enabling the adapter or changing configuration',async()=>{
 const h=fixture();h.app.engine.config.observation=true;const before=JSON.stringify(h.app.engine.config),authorize=h.app.adapter.authorize;
 const r=await testDirect(h.app,'push',{text:'Caller text must not be used',recipients:['other'],kind:'sound'});
 assert.equal(r.phoneReceiptConfirmed,false);assert.equal(r.accepted,true);assert.equal(r.recipients,2);
 assert.deepEqual(h.calls.map(c=>c[1].args.user.id),['a','b']);assert(h.calls.every(c=>c[1].id==='homey:manager:mobile:push_text' && c[1].args.text===MESSAGE));
 assert.equal(JSON.stringify(h.app.engine.config),before);assert.equal(h.app.engine.state.generation,1);assert.equal(h.app.adapter.authorize,authorize);
 await assert.rejects(()=>h.app.adapter.emit({kind:'notify',recipients:['a'],text:'Routine'},()=>true),/Observasjonsmodus/);
 await assert.rejects(()=>h.app.adapter.emit({kind:'sound',deviceId:'speaker'},()=>true),/Observasjonsmodus/);
 assert.equal(h.calls.length,2);assert.equal(h.receipts.length,2);assert(h.receipts.every(r=>r[1]==='accepted'));
 await assert.rejects(()=>testDirect(h.app,'push'),/minutt/);assert.equal(h.calls.length,2);
});
test('Push diagnostic requires API access, selected recipients, known types and no concurrent diagnostic',async()=>{
 for(const scenario of ['access','recipients','type','running']){
  const h=fixture();h.app.engine.config.observation=true;
  if(scenario==='access')h.app.adapter.direct.ready=false;
  if(scenario==='recipients')h.app.engine.config.people.notifications=[];
  if(scenario==='running')h.app.directTestRunning=true;
  await assert.rejects(()=>testDirect(h.app,'push',{notificationType:scenario==='type'?'arbitrary':'normal'}));assert.equal(h.calls.length,0);
 }
});
test('Critical and image diagnostics in test mode use the native cards and only a configured camera',async()=>{
 const h=fixture();h.app.engine.config.observation=true;h.app.engine.config.security.garage.imageDeviceId='configured-camera';
 await testDirect(h.app,'push',{notificationType:'critical'});await testDirect(h.app,'push',{notificationType:'image'});
 assert(h.calls.slice(0,2).every(c=>c[1].id==='homey:manager:mobile:push_text_critical' && /kritisk/.test(c[1].args.text)));
 assert(h.calls.slice(2).every(c=>c[1].id==='homey:manager:mobile:push_image' && c[1].droptoken==='homey:device:configured-camera|image-camera-snapshot' && /bildepush/.test(c[1].args.text)));
 assert.equal(h.app.engine.config.observation,true);await assert.rejects(()=>testDirect(h.app,'push',{notificationType:'critical'}),/minutt/);assert.equal(h.calls.length,4);
});
test('Image diagnostic refuses missing, ambiguous and arbitrary cameras before sending',async()=>{
 for(const scenario of ['missing','ambiguous','arbitrary']){
  const h=fixture();h.app.engine.config.security.garage.imageDeviceId=scenario==='missing'?'':'configured-camera';h.app.engine.config.routines=scenario==='ambiguous'?[{enabled:true,actions:[{kind:'notify',notificationType:'image',imageDeviceId:'second-camera'}]}]:[];
  await assert.rejects(()=>testDirect(h.app,'push',{notificationType:'image',...(scenario==='arbitrary'?{imageDeviceId:'private-unselected-camera'}:{})}),/kamera/);assert.equal(h.calls.length,0);
 }
});
test('Image diagnostic accepts the camera configured under Alarm without any routine',async()=>{
 const h=fixture();h.app.engine.config.security.responses.alarm={imageDeviceId:'alarm-camera'};
 await testDirect(h.app,'push',{notificationType:'image'});assert.equal(h.calls[0][1].droptoken,'homey:device:alarm-camera|image-camera-snapshot');
});
test('Diagnostic still checks camera availability and Homey recipient accounts in test mode',async()=>{
 for(const scenario of ['camera','account']){
  const h=fixture();h.app.engine.config.observation=true;h.app.engine.config.security.garage.imageDeviceId='camera';
  if(scenario==='camera')h.api.devices.getDevice=async()=>({available:false,images:[]});
  else h.api.flow.getFlowCardAutocomplete=async()=>[];
  await assert.rejects(()=>testDirect(h.app,'push',{notificationType:'image'}));assert.equal(h.calls.length,0);assert(!h.app.directTestRunning);
 }
});
test('Batch camera diagnostic attempts each configured camera once per recipient and reports partial failures',async()=>{
 const h=fixture();h.app.engine.config.observation=true;h.app.engine.config.security.responses.alarm.imageDeviceIds=['bad','good'];
 h.api.devices.getDevice=async({id})=>({id,name:id,available:id!=='bad',images:[{id:'snapshot',type:'camera'}]});
 const result=await testDirect(h.app,'push',{notificationType:'image',alarmCameras:true,imageDeviceId:'unselected'});
 assert.equal(result.accepted,false);assert.equal(result.attemptedNotifications,4);assert.deepEqual(result.results.map(r=>r.accepted),[false,true]);
 assert.equal(h.calls.length,2);assert(h.calls.every(c=>c[1].droptoken==='homey:device:good|image-camera-snapshot'));
 assert.equal(h.app.engine.config.observation,true);await assert.rejects(()=>testDirect(h.app,'push',{notificationType:'image',alarmCameras:true}),/minutt/);
});
test('Diagnostic cancels dispatch if configuration or API access changes during recipient lookup',async()=>{
 for(const change of ['configuration','connection']){
  const h=fixture();h.app.engine.config.observation=true;
  h.api.flow.getFlowCardAutocomplete=async()=>{if(change==='configuration')h.app.engine.state.generation++;else h.app.adapter.direct.ready=false;return ['a','b'].map(id=>({id,athomId:'account-'+id}));};
  await assert.rejects(()=>testDirect(h.app,'push'));assert.equal(h.calls.length,0);assert(!h.app.directTestRunning);
 }
});
test('Batch image test cancels pending camera notifications after configuration changes',async()=>{
 const h=fixture();h.app.engine.config.observation=true;h.app.engine.config.security.responses.alarm.imageDeviceIds=['first','second'];
 h.api.devices.getDevice=async({id})=>{h.app.engine.state.generation++;return {id,available:true,images:[{id:'snapshot',type:'camera'}]};};
 const result=await testDirect(h.app,'push',{notificationType:'image',alarmCameras:true});assert.equal(result.accepted,false);assert(result.results.every(r=>!r.accepted));assert.equal(h.calls.length,0);
});
