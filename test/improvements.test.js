'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { harness, step, add } = require('./helpers');
const { defaults, validate } = require('../lib/config');
const { HomeyAdapter } = require('../lib/homey-adapter');
const preview = require('../lib/preview');
const readiness = require('../lib/readiness');
const { build, install } = require('../lib/bridges');
function appFor(h) {
  const filename = path.resolve(__dirname,'../app.js'), module = {exports:{}}, localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module, require:id => id === 'homey' ? {App:EventEmitter} : localRequire(id)});
  const app = new module.exports(); app.engine = h.engine;
  app.adapter = {...h.adapter, api:{}, subscribe:async()=>{}, catalogueAt:Date.now(), catalogue:{devices:{}}};
  app.homey = {clock:{getTimezone:()=>'Europe/Oslo'},settings:{set:()=>{}}}; return app;
}
test('Yales alternative opplåsing og falske innebygde flagg avvises ved import',()=>{
  for (const cap of ['locked','lock_unlock_open','lock_unlock_open.secondary']) {
    const c = defaults(); add(c,'home',[step('bypass',{kind:'set',deviceId:'lock',capability:cap,value:'unlocked',builtin:true,guardedUnlock:true})]);
    assert.throws(()=>validate(c),/sikkerhetsoppsettet/);
  }
});
test('Adapter stopper også ukjent låseenhet via annen capability før sending',async()=>{
  const c=defaults(); c.observation=false; let sent=false;
  const adapter=new HomeyAdapter({},()=>c); adapter.api={devices:{getDevice:async()=>({class:'lock',capabilities:['locked','other'],capabilitiesObj:{other:{setable:true,type:'boolean'}},setCapabilityValue:async()=>{sent=true;}})}};
  await assert.rejects(()=>adapter.set('other-lock','other',true),/sikkerhetsoppsettet/); assert.equal(sent,false);
});
test('Direkte Yale-låsing i borte/natt uten integrasjonshendelse',async()=>{
  const h=harness(c=>{c.security.lockDeviceId='lock';c.security.lockOnArming=true;}); h.device('lock','locked',false);h.person('a',false);h.person('b',false);h.ingest();
  h.engine.start('away');await h.engine.tick();assert.deepEqual(h.calls,[['set','lock','locked',true]]);
  const n=harness(c=>{c.security.lockDeviceId='lock';c.security.lockOnArming=true;});n.person('a',true,true);n.person('b',true,true);n.device('lock','locked',false);n.ingest();await n.engine.manual('night');await n.engine.tick();assert.deepEqual(n.calls,[['set','lock','locked',true]]);
});
test('Eksplisitt trygg refresh utløser ikke gammel ankomst eller opplåsing',async()=>{
  const h=harness(c=>{c.security.autoUnlock=true;c.security.lockDeviceId='lock';});h.person('a',false);h.person('b',false);h.ingest();h.person('a',true);
  const app=appFor(h);await app.refresh({reconnect:true});assert.equal(h.engine.runs.length,0);assert.equal(h.engine.state.mode,'home');
});
test('Lagring under pågående avlesning forkaster gammel snapshot og undertrykker ankomst',async()=>{
  const h=harness(c=>{c.security.autoUnlock=true;c.security.lockDeviceId='lock';});h.person('a',false);h.person('b',false);h.ingest();
  const app=appFor(h);let release, reads=0;const stale=structuredClone(h.snapshot);
  app.adapter.snapshot=async()=>{if(++reads===1)return new Promise(resolve=>{release=()=>resolve(stale);});return structuredClone(h.snapshot);};
  const first=app.refresh();h.person('a',true);const saved=app.saveConfig(structuredClone(h.config));release();await Promise.all([first,saved]);
  assert.ok(reads>=2);assert.equal(h.engine.runs.length,0);assert.equal(h.engine.state.mode,'home');assert.equal(h.engine.config.revision,1);
});
test('Direkte inaktiv sone spør én gang; gammel eller ukjent aktivitet spør ikke',async()=>{
  for (const state of ['fresh','stale','unknown','future']) {
    const h=harness(c=>{c.observation=true;c.night.automatic=true;c.night.zoneId='zone';c.security.alarmDeviceId='alarm';});h.device('alarm','homealarm_state','disarmed');
    h.snapshot.zones={zone:{active:state==='unknown'?null:false,observedAt:h.now()+(state==='future'?1000:state==='stale'?-500000:0),inactiveSince:h.now()-3600000}};h.ingest();
    await h.engine.tick();await h.engine.tick();assert.equal(!!h.engine.state.question,state==='fresh');assert.equal(h.calls.length,0);
    if(state==='fresh')assert.equal(h.engine.history.entries.filter(e=>e.message.includes('ville spurt')).length,1);
  }
});
test('Forhåndsvisning har ingen sideeffekter og viser gjestesperre og avhengighet',()=>{
  const h=harness(c=>{c.security.lockDeviceId='lock';c.security.lockOnArming=true;add(c,'night',[step('light',{kind:'set',deviceId:'light',capability:'onoff',value:true,category:'lights'}),step('next',{dependsOn:'light',requireConfirmed:true})]);},{guest:true});h.device('light','onoff',false);h.device('lock','locked',false);h.ingest();
  const before=JSON.stringify({state:h.engine.state,runs:h.engine.runs,history:h.engine.history.entries,saved:h.saved()});
  const p=preview(h.engine,'night');assert.ok(p.actions.find(a=>a.id==='lock').reason.includes('Gjestemodus'));assert.equal(p.actions.find(a=>a.id==='next').result,'skipped');
  assert.equal(JSON.stringify({state:h.engine.state,runs:h.engine.runs,history:h.engine.history.entries,saved:h.saved()}),before);assert.deepEqual(h.calls,[]);
});
test('Nattspørsmål gjentas ikke mens nattmodus venter på fysisk sovestatus',async()=>{
  const h=harness(c=>{c.night.automatic=true;c.night.zoneId='zone';c.security.alarmDeviceId='alarm';c.bridges.questions=true;});
  h.device('alarm','homealarm_state','disarmed');h.snapshot.zones={zone:{active:false,observedAt:h.now(),inactiveSince:h.now()-3600000}};h.ingest();
  await h.engine.tick();const q=h.engine.state.question;h.engine.answer(q.id,'a','yes');h.advance(120000);h.snapshot.zones.zone.observedAt=h.now();h.ingest();await h.engine.tick();
  assert.equal(h.engine.state.manualNight,true);await h.engine.tick();assert.equal(h.engine.state.question.id,q.id);assert.equal(h.calls.filter(c=>c[0]==='emit'&&c[1].kind==='question').length,2);
});
test('Levering er først fullført når alle valgte mottakere har kvittert',()=>{
  const h=harness();const id=h.engine.newDelivery('notify',['a','b']);assert.equal(h.engine.validDelivery(id,'a'),true);
  h.engine.deliveryResult(id,'accepted','utført','a');assert.equal(h.engine.state.deliveries[0].result,'pending');assert.equal(h.engine.validDelivery(id,'a'),false);
  h.engine.deliveryResult(id,'failed','feil','b');assert.equal(h.engine.state.deliveries[0].result,'failed');h.engine.deliveryResult(id,'accepted','','b');assert.equal(h.engine.state.deliveries[0].result,'failed');
  const next=h.engine.newDelivery('notify',['a']);h.engine.updateConfig(h.config);assert.equal(h.engine.validDelivery(next,'a'),false);
});
test('Værkilden beholder opprinnelig måletid og skriver aldri relétemperatur',async()=>{
  const adapter=new HomeyAdapter({},()=>defaults());adapter.api={weather:{getWeather:async()=>({temperatureCelsius:12,when:'2026-09-23T12:00:00Z',state:'Sol'})}};
  const w=await adapter.weather();assert.equal(w.capabilities.measure_temperature.value,12);assert.equal(w.capabilities.measure_temperature.updatedAt,Date.parse('2026-09-23T12:00:00Z'));assert.equal(w.capabilities.measure_temperature.setable,false);
});
function bridgeFixture() {
  const config=defaults();config.delivery={notifications:'legacy',questions:'legacy',audio:'legacy'};config.night.automatic=true;config.people.questions=['a'];config.people.notifications=['a'];add(config,'alarm',[step('sound',{kind:'sound',deviceId:'sonos',text:'alarm3',volume:65}),step('push',{kind:'notify',text:'Alarm'})]);
  const manifest=require('../app.json'),own='homey:app:no.husmodus:';
  const metadata=Object.fromEntries(['triggers','conditions','actions'].map(k=>[k,(manifest.flow[k]||[]).map(c=>({...c,id:own+c.id}))]));
  metadata.conditions.push({id:'homey:manager:mobile:push_confirm'});
  metadata.actions.push(...['push_text','push_text_critical'].map(id=>({id:'homey:manager:mobile:'+id})),{id:'homey:device:sonos:cloud_play_sound'});
  return {config,people:{a:{name:'A',athomId:'account-a'}},devices:{},metadata,sounds:{'sonos:alarm3':{id:'alarm3',name:'Alarm 3'}}};
}
test('Genererte flows har observasjonskontroll, ja/nei/feil og mottakerkvitteringer',()=>{
  const f=bridgeFixture(), plan=build(f.config,f.people,f.devices,f.metadata,f.sounds),cards=Object.values(plan.flows.outgoing.cards);
  assert.equal(plan.routes,4);assert.equal(cards.filter(c=>c.id.endsWith(':night_answer')).length,3);
  assert.deepEqual(new Set(cards.filter(c=>c.id.endsWith(':night_answer')).map(c=>c.args.answer)),new Set(['yes','no','error']));
  for(const c of cards.filter(c=>c.id.endsWith(':delivery_matches')))assert.ok(c.args.delivery_id.includes('delivery_id'));
  for(const c of cards.filter(c=>c.id.endsWith(':delivery_result')))assert.ok(['a','sonos'].includes(c.args.recipient_id));
  const catalog={devices:{},flows:[],integrationCards:cards,integrationFlows:[{type:'advanced',...plan.flows.outgoing}]};f.config.bridges=plan.enabled;
  f.config.people.notifications=['b'];const result=readiness(f.config,{people:{},devices:{}},catalog);
  assert.equal(result.checks.find(c=>c.id==='push').level,'missing');
});
test('Manglende Flow-kort stopper oppsettet før noen flow skrives',async()=>{
  let writes=0;const api={flow:{getFlowCardTriggers:async()=>[],getFlowCardConditions:async()=>[],getFlowCardActions:async()=>[],getAdvancedFlows:async()=>[],createAdvancedFlow:async()=>{writes++;}},users:{getUsers:async()=>({})},devices:{getDevices:async()=>({})}};
  await assert.rejects(()=>install(api,defaults(),()=>true,{},()=>{}),/Flow-kort mangler/);assert.equal(writes,0);
});
