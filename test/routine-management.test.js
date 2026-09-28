'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate,protectRoutines,ROUTINES}=require('../lib/config');
const api=require('../api');
const {harness,step,add}=require('./helpers');

test('Fixed routines are restored and unhidden without changing saved actions or switches',()=>{
 const original=defaults();const home=original.routines.find(r=>r.id==='home');home.hidden=true;home.enabled=false;home.actions=[{id:'custom-message',kind:'timeline',category:'other',delaySeconds:0,onError:'continue',text:'Hello'}];
 original.routines=original.routines.filter(r=>r.id!=='night');original.routines.push({id:'custom-kept',name:'My routine',enabled:false,execution:'parallel',actions:[]});
 const result=validate(original);assert(Object.keys(ROUTINES).every(id=>result.routines.some(r=>r.id===id)));assert.equal(result.routines.find(r=>r.id==='home').hidden,undefined);assert.equal(result.routines.find(r=>r.id==='home').enabled,false);assert.deepEqual(result.routines.find(r=>r.id==='home').actions,home.actions);assert.deepEqual(result.routines.find(r=>r.id==='custom-kept'),original.routines.at(-1));assert.deepEqual(validate(result),result);
 const full=defaults();full.routines=Array.from({length:50},(_,i)=>({id:`custom-${i}`,name:`Routine ${i}`,enabled:true,execution:'sequential',actions:[]}));const restored=validate(full);assert.equal(restored.routines.length,50+Object.keys(ROUTINES).length);assert.deepEqual(validate(restored),restored);
});

test('Fixed routine switches suppress extras only, including lock, garage and sleep actions',()=>{
 for(const id of ['away','night','morning','nightArrival','arming']){
  const h=harness(c=>{
   c.security.alarmDeviceId='alarm';c.security.lockDeviceId='lock';c.security.lockOnArming=true;c.night.wakeArrival=true;
   c.guest.disarmOnEnable=true;c.guest.unlockOnEnable=true;
   Object.assign(c.security.garage,{enabled:true,validated:true,statusDeviceId:'port',statusCapability:'alarm_contact',commandDeviceId:'relay',commandCapability:'onoff'});
   add(c,id,[step('extra')]);
  });h.ingest();const context={personId:'a'};
  const enabled=h.engine.start(id,context);enabled.cancelled=true;
  h.config.routines.find(r=>r.id===id).enabled=false;
  const disabled=h.engine.start(id,context);assert(disabled.actions.length>0,id);
  assert.deepEqual(disabled.actions,enabled.actions.filter(a=>a.builtin),id);
 }
});

test('Morning wakes only home users with extras off; switching extras back on preserves their actions',async()=>{
 const h=harness(c=>{add(c,'morning',[step('extra')]);c.routines.find(r=>r.id==='morning').enabled=false;});
 h.person('a',true,true);h.person('b',false,true);h.ingest();h.engine.morning('manual');await h.engine.tick();
 assert.deepEqual(h.calls,[['person','b',false],['person','a',false]]);
 h.person('a',true,false);await h.engine.tick();
 const next=structuredClone(h.config);next.routines.find(r=>r.id==='morning').enabled=true;h.engine.updateConfig(next);
 h.engine.start('morning');await h.engine.tick();assert.deepEqual(h.calls.at(-1),['timeline','extra']);
 assert.equal(h.config.routines.find(r=>r.id==='morning').actions[0].id,'extra');
 const selected=require('../lib/sleep-flows').selected(h.config);assert(selected.some(p=>p.id==='a' && !p.value));h.config.routines.find(r=>r.id==='morning').enabled=false;assert.deepEqual(require('../lib/sleep-flows').selected(h.config),selected);
});

test('Custom routine switch blocks manual starts and preview agrees with fixed routine behavior',async()=>{
 const h=harness(c=>{c.routines.push({id:'custom-test',name:'Own routine',enabled:false,execution:'sequential',actions:[step('custom')]});add(c,'morning',[step('extra')]);c.routines.find(r=>r.id==='morning').enabled=false;});
 h.person('a',true,true);h.ingest();assert.equal(h.engine.start('custom-test'),null);await h.engine.tick();assert.equal(h.calls.length,0);
 const preview=require('../lib/preview')(h.engine,'morning',h.config,{direct:{configured:true,ready:true}});
 assert.equal(preview.actions.find(a=>a.id==='wake-a').result,'planned');assert.equal(preview.actions.find(a=>a.id==='extra').reason,'Egne handlinger er slått av');
 h.config.routines.find(r=>r.id==='custom-test').enabled=true;h.engine.start('custom-test');await h.engine.tick();assert.deepEqual(h.calls,[['timeline','custom']]);
});
test('Configuration API rejects deleting a fixed routine and allows deleting a custom routine',async()=>{
 const previous=defaults();previous.routines.push({id:'custom-optional',name:'Optional',enabled:true,execution:'sequential',actions:[]});const homey={app:{engine:{config:previous}}};
 const bad=structuredClone(previous);bad.routines=bad.routines.filter(r=>r.id!=='morning');assert.throws(()=>protectRoutines(previous,bad),/kan ikke slettes/);await assert.rejects(()=>api.validateConfig({homey,body:bad}),/kan ikke slettes/);
 const good=structuredClone(previous);good.routines=good.routines.filter(r=>r.id!=='custom-optional');const saved=await api.validateConfig({homey,body:good});assert(!saved.routines.some(r=>r.id==='custom-optional'));
});
