'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{testDirect,MESSAGE}=require('../lib/direct-test');
function fixture(){const calls=[],store=new Map();const app={integrationTestCount:0,engine:{state:{generation:1},config:{observation:false,people:{notifications:['a','b']}},newDelivery:()=> 'delivery'},homey:{settings:{set:(k,v)=>store.set(k,v)},setTimeout},adapter:{direct:{ready:true,call:async(fn,guard)=>{guard();return fn(api);}},emit:async data=>calls.push(['push',data])}};
 const api={flow:{runFlowCardAction:async x=>{calls.push(['card',x]);app.integrationTestCount++;},createFlow:async x=>{calls.push(['create',x]);return {id:'temporary-id'};},triggerFlow:async x=>{calls.push(['trigger',x]);app.integrationTestCount++;},deleteFlow:async x=>calls.push(['delete',x])}};return {app,api,calls,store};}
test('Connection diagnostic invokes only the fixed no-op card',async()=>{const h=fixture();assert.deepEqual(await testDirect(h.app,'access'),{type:'access',executed:true});assert.equal(h.calls[0][1].id,'homey:app:no.husmodus:check_integration_access');await assert.rejects(()=>testDirect(h.app,'arbitrary'));});
test('Flow diagnostic creates, starts, confirms and removes only its own temporary no-op flow',async()=>{const h=fixture();const r=await testDirect(h.app,'flow');assert(r.executed&&r.temporaryFlowRemoved);assert.deepEqual(h.calls.map(c=>c[0]),['create','trigger','delete']);assert.equal(h.calls[0][1].flow.actions.length,1);assert.equal(h.calls[0][1].flow.actions[0].id,'homey:app:no.husmodus:check_integration_access');assert.equal(h.store.get('houseguard.pending-test-flow.v1'),'');});
test('Flow diagnostic cleans up after failed start or changed configuration',async()=>{for(const changed of [false,true]){const h=fixture();h.api.flow.triggerFlow=async()=>{throw Error('failed');};if(changed)h.api.flow.createFlow=async()=>{h.app.engine.state.generation++;return {id:'temporary-id'};};await assert.rejects(()=>testDirect(h.app,'flow'));assert.deepEqual(h.calls.at(-1),['delete',{id:'temporary-id'}]);assert(!h.app.directTestRunning);}});
test('Push diagnostic respects observation, selected recipients, fixed text and duplicate protection',async()=>{const h=fixture();h.app.engine.config.observation=true;await assert.rejects(()=>testDirect(h.app,'push'),/Observasjon/);assert.equal(h.calls.length,0);h.app.engine.config.observation=false;const r=await testDirect(h.app,'push');assert.equal(r.phoneReceiptConfirmed,false);assert.equal(h.calls[0][1].text,MESSAGE);assert.deepEqual(h.calls[0][1].recipients,['a','b']);await assert.rejects(()=>testDirect(h.app,'push'),/minutt/);assert.equal(h.calls.length,1);});

test('Critical and image diagnostics stay separate and image uses only a configured camera',async()=>{
 const h=fixture();h.app.engine.config.security={garage:{imageDeviceId:'configured-camera'}};h.app.engine.config.routines=[];
 await testDirect(h.app,'push',{notificationType:'critical'});await testDirect(h.app,'push',{notificationType:'image'});
 assert.equal(h.calls[0][1].notificationType,'critical');assert.match(h.calls[0][1].text,/kritisk/);assert.equal(h.calls[1][1].imageDeviceId,'configured-camera');assert.match(h.calls[1][1].text,/bildepush/);
 await assert.rejects(()=>testDirect(h.app,'push',{notificationType:'critical'}),/minutt/);assert.equal(h.calls.length,2);
});
test('Image diagnostic refuses missing, ambiguous and arbitrary cameras before sending',async()=>{
 for(const scenario of ['missing','ambiguous','arbitrary']){
  const h=fixture();h.app.engine.config.security={garage:{imageDeviceId:scenario==='missing'?'':'configured-camera'}};h.app.engine.config.routines=scenario==='ambiguous'?[{enabled:true,actions:[{kind:'notify',notificationType:'image',imageDeviceId:'second-camera'}]}]:[];
  await assert.rejects(()=>testDirect(h.app,'push',{notificationType:'image',...(scenario==='arbitrary'?{imageDeviceId:'private-unselected-camera'}:{})}),/kamera/);assert.equal(h.calls.length,0);
 }
});
test('Image diagnostic accepts the camera configured under Alarm without any routine',async()=>{
 const h=fixture();h.app.engine.config.security={garage:{imageDeviceId:''},responses:{alarm:{imageDeviceId:'alarm-camera'}}};h.app.engine.config.routines=[];
 await testDirect(h.app,'push',{notificationType:'image'});assert.equal(h.calls[0][1].imageDeviceId,'alarm-camera');
});
