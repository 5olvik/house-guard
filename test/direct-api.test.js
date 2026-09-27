'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DirectApi,KEY}=require('../lib/direct-api'),{HomeyAdapter}=require('../lib/homey-adapter'),delivery=require('../lib/direct-delivery'),{harness}=require('./helpers'),{validate}=require('../lib/config');
const TOKEN='fake-test-token-never-a-real-secret';
async function fixture(){
 const h=harness(c=>{c.people.notifications=['a','b'];c.bridges={notifications:false,questions:false,audio:false};}),stored=new Map(),calls=[];
 const client={sessions:{getSessionMe:async()=>({intersectedScopes:['homey.flow']})},flow:{triggerFlow:async x=>calls.push(['flow',x]),triggerAdvancedFlow:async x=>calls.push(['advanced',x]),runFlowCardAction:async x=>{calls.push(['action',x]);return true;},runFlowCardCondition:async x=>{calls.push(['question',x]);return {result:false};}},destroy:async()=>{}};
 const homey={api:{getLocalUrl:async()=> 'http://127.0.0.1'},settings:{get:k=>stored.get(k),set:(k,v)=>stored.set(k,v)},app:{engine:h.engine},flow:{getTriggerCard:()=>{throw Error('Helper Flow must not be used');}}};
 const direct=new DirectApi(homey,async()=>client);await direct.configure(TOKEN);
 const adapter=new HomeyAdapter(homey,()=>h.engine.config);adapter.direct=direct;adapter.snapshot=h.adapter.snapshot;
 adapter.api={users:{getUser:async({id})=>h.snapshot.people[id]},devices:{getDevice:async({id})=>({id,available:true,images:[{id:'image-1',type:'camera'}]})},flow:{getFlow:async()=>({enabled:true,triggerable:true}),getAdvancedFlow:async()=>({enabled:true,triggerable:true}),getFlowCardAutocomplete:async({name})=>name==='sound'?[{id:'bell',name:'Bell'}]:['a','b'].map(id=>({id,name:id,athomId:'account-'+id}))}};
 h.engine.adapter=adapter;h.ingest();return {...h,adapter,direct,client,stored,calls,homey};
}
test('API key is separate from configuration and status; replacing with an invalid key preserves access',async()=>{
 const h=await fixture();assert.equal(h.stored.get(KEY),TOKEN);assert(!JSON.stringify(h.direct.status()).includes(TOKEN));
 h.direct.factory=async()=>{throw Error('Authorization: Bearer '+TOKEN);};await assert.rejects(()=>h.direct.configure('another-invalid-token-value'),e=>!e.message.includes(TOKEN));
 assert(h.direct.ready);assert.equal(h.stored.get(KEY),TOKEN);
 const c=validate({...h.config,apiKey:TOKEN,token:TOKEN,credentials:{token:TOKEN}});assert(!JSON.stringify(c).includes(TOKEN));assert(!JSON.stringify(h.engine.status()).includes(TOKEN));
});
test('Actual Flow scope is required; requested scopes and Start Flows alone do not suffice',async()=>{
 for(const session of [{scopes:['homey']},{intersectedScopes:['homey.flow.start']},{intersectedScopes:['homey.flow.readonly']}]){
  const h=await fixture();h.direct.factory=async()=>({sessions:{getSessionMe:async()=>session}});await assert.rejects(()=>h.direct.configure('new-test-token-with-wrong-scope'),/Flows-tilgang/);assert.equal(h.stored.get(KEY),TOKEN);
 }
});
test('Restart loads stored key; revoked key remains configured and does not fall back to helpers',async()=>{
 const h=await fixture();const d=new DirectApi(h.homey,async()=>{throw Error(TOKEN);});await d.initialize();assert(d.configured);assert(!d.ready);assert(!d.problem.includes(TOKEN));h.adapter.direct=d;
 await assert.rejects(()=>h.adapter.startFlow('scene','normal',()=>true),/ikke klar/);assert.equal(h.calls.length,0);
});
test('Direct Flow start supports both types and does not trigger helper cards',async()=>{
 const h=await fixture();await h.adapter.startFlow('normal-scene','normal',()=>true);await h.adapter.startFlow('advanced-scene','advanced',()=>true);
 assert.deepEqual(h.calls.map(c=>[c[0],c[1].id]),[['flow','normal-scene'],['advanced','advanced-scene']]);
});
test('Observation, disabled Flow and cancellation during reads block direct dispatch',async()=>{
 const h=await fixture();h.config.observation=true;await assert.rejects(()=>h.adapter.startFlow('scene','normal',()=>true),/Observasjon/);h.config.observation=false;
 h.adapter.api.flow.getFlow=async()=>({enabled:false});await assert.rejects(()=>h.adapter.startFlow('scene','normal',()=>true),/deaktivert/);
 let valid=true;h.adapter.api.flow.getFlow=async()=>{valid=false;return {};};await assert.rejects(()=>h.adapter.startFlow('scene','normal',()=>valid),/avbrutt/);assert.equal(h.calls.length,0);
});
test('Direct push reaches every selected recipient once even when one call fails; no retry or helper fallback',async()=>{
 const h=await fixture();h.client.flow.runFlowCardAction=async x=>{h.calls.push(['action',x]);if(x.args.user.id==='a')throw Error(TOKEN);return true;};
 const id=h.engine.newDelivery('notify',['a','b']);await assert.rejects(()=>h.adapter.emit({kind:'notify',text:'Test',recipients:['a','b','b'],deliveryId:id},()=>true),e=>!e.message.includes(TOKEN));
 assert.equal(h.calls.length,2);assert.deepEqual(h.engine.state.deliveries.at(-1).responses,{a:'failed',b:'accepted'});
});
test('Critical and image push use native card and exact selected camera without timeline substitution',async()=>{
 const h=await fixture();for(const type of ['critical','image'])await h.adapter.emit({kind:'notify',text:'Alarm',recipients:['a'],notificationType:type,imageDeviceId:'camera'},()=>true);
 assert.equal(h.calls[0][1].id,'homey:manager:mobile:push_text_critical');assert.equal(h.calls[1][1].id,'homey:manager:mobile:push_image');assert.equal(h.calls[1][1].droptoken,'homey:device:camera|image-camera-image-1');assert.equal(h.calls[1][1].args.user.athomId,'account-a');
});
test('Missing camera and unknown recipient cannot send image or redirect to another user',async()=>{
 const h=await fixture();h.adapter.api.devices.getDevice=async()=>({available:false,images:[]});await assert.rejects(()=>h.adapter.emit({kind:'notify',recipients:['a'],notificationType:'image',imageDeviceId:'camera'},()=>true));
 await assert.rejects(()=>h.adapter.emit({kind:'notify',recipients:['unknown'],text:'Private'},()=>true));assert.equal(h.calls.length,0);
});
test('Direct Sonos speech and sound keep selected device and volume',async()=>{
 const h=await fixture();await h.adapter.emit({kind:'speak',deviceId:'speaker',text:'Hei',volume:0.4},()=>true);await h.adapter.emit({kind:'sound',deviceId:'speaker',text:'bell',volume:0.7},()=>true);
 assert.equal(h.calls[0][1].id,'homey:device:speaker:cloud_play_tts');assert.deepEqual(h.calls[0][1].args,{text:'Hei',volume:0.4});assert.deepEqual(h.calls[1][1].args,{sound:{id:'bell',name:'Bell'},volume:0.7});
});
test('Direct sovestatus only changes confirmed home users and skips already correct status',async()=>{
 const h=await fixture();await h.adapter.setAsleep('a',true,()=>true);h.person('b',false);await assert.rejects(()=>h.adapter.setAsleep('b',true,()=>true),/hjemme/);await h.adapter.setAsleep('a',false,()=>true);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].id,'homey:manager:presence:set_asleep');assert.equal(h.calls[0][1].args.user.id,'a');
});
test('API change invalidates pending work; direct errors never disclose credentials',async()=>{
 const h=await fixture();let invalidated=0;h.direct.onChange=()=>invalidated++;await h.direct.configure('');assert.equal(invalidated,1);assert(!h.direct.configured);assert(!h.direct.ready);
 await h.direct.configure(TOKEN);h.client.flow.triggerFlow=async()=>{const e=Error(TOKEN);e.statusCode=403;throw e;};await assert.rejects(()=>h.adapter.startFlow('scene','normal',()=>true),e=>!e.message.includes(TOKEN));assert(!h.direct.ready);assert(h.direct.configured);
});
test('Night question returns without waiting, is deduplicated, and handles no answer',async()=>{
 const h=await fixture();let reply;h.client.flow.runFlowCardCondition=x=>{h.calls.push(['question',x]);return new Promise(r=>reply=r);};
 const q={id:'question-1',recipients:['a'],answers:{},deadline:Date.now()+60000,decided:null};h.engine.state.question=q;
 const data={kind:'question',personId:'a',requestId:q.id,deadline:q.deadline,text:'Natt?'};await h.adapter.emit(data,()=>!q.decided);await h.adapter.emit(data,()=>!q.decided);assert.equal(h.calls.length,1);assert.equal(q.decided,null);
 const pending=h.adapter.pendingQuestions.get('question-1:a').promise;reply({result:false});await pending;assert.equal(q.decided,'no');assert.equal(h.adapter.pendingQuestions.size,0);
});
test('Late/cancelled question replies and malformed replies cannot enable night mode',async()=>{
 for(const cancelled of [true,false]){const h=await fixture();let reply;h.client.flow.runFlowCardCondition=()=>new Promise(r=>reply=r);const q={id:'q',recipients:['a'],answers:{},deadline:Date.now()+60000,decided:null};h.engine.state.question=q;
  await h.adapter.emit({kind:'question',personId:'a',requestId:'q',deadline:q.deadline,text:'Natt?'},()=>!q.decided);const pending=h.adapter.pendingQuestions.get('q:a').promise;if(cancelled)q.decided='cancelled';reply(cancelled?true:{unexpected:true});await pending;
  assert.equal(h.engine.state.manualNight,false);assert.equal(cancelled?q.decided:q.answers.a,cancelled?'cancelled':'error');
 }
});
test('Nattmodus notification executes directly even when old bridge flags are false',async()=>{
 const h=await fixture();const run={id:'r',routineId:'custom-example',generation:h.engine.state.generation,context:{},actions:[]},a={id:'notify',kind:'notify',category:'notification',text:'Hei',status:'pending'};run.actions.push(a);h.engine.runs.push(run);await h.engine.execute(run,a);assert.equal(a.status,'accepted');assert.equal(h.calls.length,2);assert.equal(h.engine.state.deliveries.at(-1).result,'accepted');
});

test('Direct readiness and previews remove helper requirements while still requiring push recipients',async()=>{
 const h=await fixture(),catalog={direct:h.direct.status(),people:{a:{id:'a',athomId:'account-a'},b:{id:'b',athomId:'account-b'}},devices:{},flows:[{id:'scene',type:'normal',enabled:true,triggerable:true}],integrationFlows:[]};
 h.config.routines.find(r=>r.id==='home').actions=[{id:'scene',kind:'flow',category:'lights',flowId:'scene',flowType:'normal',onError:'continue',delaySeconds:0}];
 const ready=require('../lib/readiness')(h.config,h.snapshot,catalog,h.engine.state,h.now());assert(!ready.checks.some(c=>c.id.startsWith('scene-')||c.id.startsWith('sleep-')));
 assert.equal(ready.checks.find(c=>c.id==='direct-api').level,'ready');
 const preview=require('../lib/preview')(h.engine,'home',h.config,catalog,h.snapshot);assert.equal(preview.actions.at(-1).result,'planned');
 h.config.people.notifications=[];h.config.security.alarmDeviceId='house-guard-internal-alarm';const missing=require('../lib/readiness')(h.config,h.snapshot,catalog,h.engine.state,h.now());assert.equal(missing.checks.find(c=>c.id==='push').level,'missing');
});
test('Saving key through the app API preserves config and cancels pending operations without exposing key',async()=>{
 const h=await fixture(),Module=require('node:module'),original=Module._load;let App;
 try{Module._load=function(id,...args){if(id==='homey')return {App:class {}};return original.call(this,id,...args);};delete require.cache[require.resolve('../app')];App=require('../app');}finally{Module._load=original;}
 const app=new App();app.adapter=h.adapter;app.engine=h.engine;const configBefore=JSON.stringify(h.config),generation=h.engine.state.generation;
 const run={id:'pending',actions:[{status:'pending'}]};h.engine.runs.push(run);
 const result=await app.configureApiKey({token:TOKEN});assert.equal(h.engine.state.generation,generation+1);assert(run.cancelled);assert.equal(JSON.stringify(h.config),configBefore);assert(!JSON.stringify(result).includes(TOKEN));assert(!JSON.stringify(h.engine.status()).includes(TOKEN));
});

test('Each camera push identifies its camera and triggering sensor for every recipient',async()=>{
 const h=await fixture();h.adapter.api.devices.getDevice=async({id})=>({id,name:id==='one'?'Garasje':'Inngang',available:true,images:[{id:'snapshot',type:'camera'}]});
 for(const camera of ['one','two'])await h.adapter.emit({kind:'notify',notificationType:'image',imageDeviceId:camera,text:'Alarm i Entré',context:{sensorName:'Ytterdør'},recipients:['a','b']},()=>true);
 assert.equal(h.calls.length,4);for(const [,call] of h.calls){assert.match(call.args.text,/Sensor: Ytterdør/);assert.match(call.args.text,call.droptoken.includes(':one|')?/Kamera: Garasje/:/Kamera: Inngang/);}
});
