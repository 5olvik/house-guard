'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const sleep=require('../lib/sleep-flows'),{HomeyAdapter}=require('../lib/homey-adapter'),{harness}=require('./helpers'),{OWN,collect}=require('../lib/flow-connections');
const route=(id,value)=>({enabled:true,trigger:{id:OWN+sleep.ID,args:{person:{id},state:value?'asleep':'awake'}},conditions:[],actions:[{id:'homey:manager:presence:set_'+(value?'asleep':'awake'),args:{user:{id,athomId:'account-'+id}}}]});
function setup(){
  const h=harness(c=>{c.people.presence=['a','b','c'];c.people.night=['a','b','c'];});h.person('c',false);h.ingest();
  let listener,requests=[];const changes=[],routes=['a','b','c'].flatMap(id=>[route(id,true),route(id,false)]);
  const card={registerArgumentAutocompleteListener:()=>{},registerRunListener:f=>{listener=f;},trigger:async(tokens,state)=>{requests.push(state);for(const f of routes)if(listener(f.trigger.args,state)){const id=f.trigger.args.person.id,value=f.trigger.args.state==='asleep';h.snapshot.people[id].asleep=value;changes.push({id,value});}}};
  const homey={flow:{getTriggerCard:()=>card}},adapter=new HomeyAdapter(homey,()=>h.engine.config);adapter.snapshot=h.adapter.snapshot;
  adapter.api={users:{getUser:async({id})=>structuredClone(h.snapshot.people[id])},flow:{getFlows:async()=>routes,getAdvancedFlows:async()=>[]}};
  h.engine.adapter=adapter;sleep.register({adapter,engine:h.engine,homey});
  return {h,adapter,routes,changes,requests,listener:(...a)=>listener(...a)};
}
test('Night and morning change Homey sleep status through SDK routes for home residents only',async()=>{
  const s=setup();await s.h.engine.manual('night');for(let i=0;i<4;i++)await s.h.engine.tick();
  assert.deepEqual(s.changes,[{id:'a',value:true},{id:'b',value:true}]);assert.equal(s.h.snapshot.people.c.asleep,false);
  await s.h.engine.manual('morning');for(let i=0;i<4;i++)await s.h.engine.tick();
  assert.deepEqual(s.changes.slice(2),[{id:'a',value:false},{id:'b',value:false}]);assert.equal(s.h.engine.runs.filter(r=>r.routineId==='night')[0].cancelled,undefined);
});
test('Missing sleep connection fails before dispatch, without falsely waiting for a write',async()=>{
  const s=setup();s.routes.length=0;let sent=0;
  await assert.rejects(()=>s.adapter.setAsleep('a',true,()=>true,()=>sent++),/Sovestatus trenger/);assert.equal(sent,0);assert.deepEqual(s.changes,[]);
  await s.h.engine.manual('night');await s.h.engine.tick();const actions=s.h.engine.runs.at(-1).actions;assert.equal(actions.filter(a=>a.status==='failed').length,2);assert.equal(actions.some(a=>a.status==='waiting'),false);
});
test('Sleep connection checks exact recipient, desired state, duplicates and outgoing account ID',()=>{
  const f=route('a',true),catalog=()=>({integrationFlows:collect([f],{})});assert.equal(sleep.count(catalog(),'a',true),1);
  f.actions[0].args.user.id='b';assert.equal(sleep.count(catalog(),'a',true),0);f.actions[0].args.user.id='a';
  delete f.actions[0].args.user.athomId;assert.equal(sleep.count(catalog(),'a',true),0);f.actions[0].args.user.athomId='account-a';
  f.actions[0].id='homey:manager:presence:set_awake';assert.equal(sleep.count(catalog(),'a',true),0);
  const good=route('a',true);assert.equal(sleep.count({integrationFlows:collect([good,good],{})},'a',true),2);
  const advanced={cards:{root:{type:'trigger',...good.trigger,outputSuccess:['act']},act:{type:'action',...good.actions[0]}}};assert.equal(sleep.count({integrationFlows:collect({},[advanced])},'a',true),1);
});
test('Sleep requests are single-use and cancelled when a person leaves or observation starts',async()=>{
  const s=setup();await s.adapter.setAsleep('a',true,()=>true);assert.equal(s.listener({person:{id:'a'},state:'asleep'},s.requests[0]),false);
  const state={requestId:'pending'},request={id:'b',value:true,at:Date.now(),guard:()=>true};s.adapter.sleepRequests.set('pending',request);
  s.h.engine.snapshot.people.b.present=false;assert.equal(s.listener({person:{id:'b'},state:'asleep'},state),false);
  s.h.engine.snapshot.people.b.present=true;s.h.config.observation=true;assert.equal(s.listener({person:{id:'b'},state:'asleep'},state),false);
});
test('Away residents and already correct sleep status cause no outgoing change',async()=>{
  const s=setup();await assert.rejects(()=>s.adapter.setAsleep('c',true,()=>true),/hjemme/);await s.adapter.setAsleep('a',false,()=>true);assert.deepEqual(s.changes,[]);assert.equal(s.requests.length,0);
});
