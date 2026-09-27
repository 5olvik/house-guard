'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate}=require('../lib/config'),{harness,add,step}=require('./helpers');
const scenes=require('../lib/scene-flows'),{HomeyAdapter}=require('../lib/homey-adapter'),{OWN,collect}=require('../lib/flow-connections');
const bridge=(id='lights',type='normal')=>({enabled:true,trigger:{id:OWN+scenes.ID,args:{flow:{id,type}}},conditions:[],actions:[{id:scenes.START,args:{flow:{id,type:type==='normal'?'standard':'advanced'}}}]});
const cat=(...flows)=>({integrationFlows:collect(flows,{})});
test('Scene routes require one direct matching target, correct Flow type and no delay',()=>{
  const f=bridge();assert.equal(scenes.count(cat(f),'lights','normal'),1);
  f.actions[0].args.flow.type='advanced';assert.equal(scenes.count(cat(f),'lights','normal'),0);
  f.actions[0].args.flow.type='standard';f.actions[0].delay={number:5};assert.equal(scenes.count(cat(f),'lights','normal'),0);
  delete f.actions[0].delay;f.conditions=[{id:'condition'}];assert.equal(scenes.count(cat(f),'lights','normal'),0);
  f.conditions=[];assert.equal(scenes.count(cat(f,f),'lights','normal'),2);
  f.enabled=false;assert.equal(scenes.count(cat(f),'lights','normal'),0);
  const a=bridge('av','advanced'),advanced={enabled:true,cards:{root:{type:'trigger',...a.trigger,outputSuccess:['start']},start:{type:'action',...a.actions[0]}}};
  assert.equal(scenes.count({integrationFlows:collect({},[advanced])},'av','advanced'),1);
});
test('Scene start refuses missing and duplicate bridges without any outgoing trigger',async()=>{
  const c=defaults();c.observation=false;let calls=0,flows=[];
  const adapter=new HomeyAdapter({flow:{getTriggerCard:()=>({trigger:async()=>calls++})}},()=>c);
  adapter.api={flow:{getFlow:async()=>({enabled:true,triggerable:true}),getFlows:async()=>flows,getAdvancedFlows:async()=>[]}};
  await assert.rejects(()=>adapter.startFlow('lights','normal'),/Startkobling mangler/);
  flows=[bridge(),bridge()];await assert.rejects(()=>adapter.startFlow('lights','normal'),/Flere startkoblinger/);assert.equal(calls,0);
});
test('SDK scene requests match one Flow once and reject expiry, cancellation and observation',async()=>{
  const config=defaults();config.observation=false;let listener,lastState,allowed=true;
  const card={registerArgumentAutocompleteListener:()=>{},registerRunListener:f=>{listener=f;},trigger:async(tokens,state)=>{lastState=state;}};
  const adapter=new HomeyAdapter({flow:{getTriggerCard:()=>card}},()=>config);
  scenes.register({adapter,engine:{config},homey:adapter.homey});
  await scenes.dispatch(adapter,'lights','normal',()=>allowed,()=>{});
  assert.equal(listener({flow:{id:'other',type:'normal'}},lastState),false);
  assert.equal(listener({flow:{id:'lights',type:'normal'}},lastState),true);
  assert.equal(listener({flow:{id:'lights',type:'normal'}},lastState),false);
  for(const cause of ['cancel','observe','expire']){
    allowed=true;config.observation=false;await scenes.dispatch(adapter,'lights','normal',()=>allowed,()=>{});
    if(cause==='cancel')allowed=false;if(cause==='observe')config.observation=true;if(cause==='expire')adapter.sceneRequests.get(lastState.requestId).at-=31000;
    assert.equal(listener({flow:{id:'lights',type:'normal'}},lastState),false);
  }
});
test('Failed away arming does not suppress the lights Flow; alarm failure remains visible',async()=>{
  const h=harness(c=>{c.security.alarmDeviceId='house-guard-internal-alarm';add(c,'away',[step('lights',{kind:'flow',category:'lights',flowId:'lights',flowType:'normal'})]);});
  h.device('house-guard-internal-alarm','homealarm_state','disarmed');h.ingest();h.person('a',false);h.person('b',false);h.ingest();h.advance(21000);await h.engine.tick();
  assert.equal(h.calls.some(c=>c[0]==='flow'),false);h.advance(61000);await h.engine.tick();
  assert.equal(h.calls.filter(c=>c[0]==='flow').length,1);
  assert.equal(h.engine.runs.find(r=>r.routineId==='away').actions.find(a=>a.id==='alarm-armed').status,'unknown');
  assert.equal(require('../lib/plans').builtins('home',h.config,{},h.engine.facts())[0].onError,'stop');
});
test('Away lights remain cancelled if a person returns during failed arming',async()=>{
  const h=harness(c=>{c.security.alarmDeviceId='house-guard-internal-alarm';add(c,'away',[step('lights',{kind:'flow',category:'lights',flowId:'lights',flowType:'normal'})]);});
  h.device('house-guard-internal-alarm','homealarm_state','disarmed');h.ingest();h.person('a',false);h.person('b',false);h.ingest();h.advance(21000);await h.engine.tick();
  h.person('a',true);h.ingest();h.advance(61000);await h.engine.tick();assert.equal(h.calls.some(c=>c[0]==='flow'),false);
});
test('Generated mobile routes preserve account IDs and reject missing account IDs',()=>{
  const c=defaults();c.people.notifications=['a'];add(c,'alarm',[step('n',{kind:'notify',text:'Alarm'})]);
  const manifest=require('../app.json'),metadata={triggers:manifest.flow.triggers.map(t=>({id:OWN+t.id})),actions:[{id:'homey:manager:mobile:push_text'}]};
  const build=require('../lib/simple-flow-plan').build,people={a:{id:'a',name:'A',athomId:'account-a'}};
  const plan=build(c,people,{},metadata),catalog={integrationFlows:collect({},[{...plan.flow,enabled:true}])};
  const output=Object.values(plan.flow.cards).find(c=>c.type==='action');assert.equal(output.args.user.athomId,'account-a');
  assert.equal(require('../lib/simple-flows').coverage(c,catalog).notifications,true);
  delete output.args.user.athomId;assert.equal(require('../lib/simple-flows').coverage(c,catalog).notifications,false);
  delete people.a.athomId;assert.throws(()=>build(c,people,{},metadata),/konto-ID/);
});
test('Simple deliveries expire without a false missing-receipt warning; legacy keeps the warning',async()=>{
  for(const mode of ['simple','legacy']){
    const h=harness(c=>{c.delivery.notifications=mode;});h.ingest();const id=h.engine.newDelivery('notify',['a']);h.advance(301000);await h.engine.tick();
    assert.equal(h.engine.validDelivery(id,'a'),false);assert.equal(h.engine.state.deliveries[0].result,'unknown');
    assert.equal(h.engine.history.entries.some(e=>e.message.includes('Ingen kvittering')),mode==='legacy');
  }
});
test('Wizard completion survives validation and edits without assuming old setups are complete',()=>{
  const old=defaults();delete old.setupCompleted;assert.equal(validate(old).setupCompleted,false);
  old.setupCompleted=true;const saved=validate(old);assert.equal(validate(JSON.parse(JSON.stringify(saved))).setupCompleted,true);
  saved.setupCompleted='yes';assert.throws(()=>validate(saved),/Veiviser fullført/);
});
