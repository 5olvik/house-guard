'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), {EventEmitter}=require('node:events');
const {defaults,validate}=require('../lib/config'), {harness,step,add}=require('./helpers');
const readiness=require('../lib/readiness'), needs=require('../lib/integration-needs');
const simple=require('../lib/simple-flows'), {coverage}=require('../lib/bridges');
const {legacyRoutes}=require('../lib/flow-connections');
const {HomeyAdapter}=require('../lib/homey-adapter'), setup=require('../settings/setup-model');
const own='homey:app:no.husmodus:';
const catalog=()=>({devices:{},people:{},flows:[],integrationFlows:[]});

test('Grunnoppsett med personer trenger ingen ekstra flows eller sikkerhetsenheter',()=>{
  const h=harness();h.ingest();const c=catalog();
  const r=readiness(h.config,h.snapshot,c,h.engine.state,h.now());
  assert.deepEqual(r.checks.filter(x=>x.level==='missing'),[]);
  assert.equal(r.checks.find(x=>x.id==='audio').level,'off');
  assert.equal(r.checks.find(x=>x.id==='alarm').level,'off');
});

test('Deaktiverte rutiner krever verken lyd, push eller kamerakobling',()=>{
  const c=defaults();add(c,'alarm',[step('n',{kind:'notify',notificationType:'image',imageDeviceId:'camera'}),step('s',{kind:'sound',deviceId:'speaker',text:'alarm3',volume:50})]);c.routines.find(r=>r.id==='alarm').enabled=false;
  assert.equal(needs(c).notifications,false);assert.equal(needs(c).audio.length,0);assert.deepEqual(needs(c).cameras,[]);
});

test('Gamle oppsett bevarer leveringsmetoden; nye velger enkle flows',()=>{
  const old=defaults();delete old.delivery;old.bridges.notifications=true;
  assert.deepEqual(validate(old).delivery,{notifications:'legacy',audio:'legacy',questions:'legacy'});
  assert.equal(validate(old).bridges.notifications,true);
  assert.equal(defaults().delivery.questions,'simple');
});

test('Enkle kort filtrerer mottaker, type, kamera, utløp, observasjon og metode',()=>{
  const h=harness(), id=h.engine.newDelivery('notify',['a']);
  const state={kind:'notify',personId:'a',deliveryId:id,notificationType:'image',imageDeviceId:'cam'};
  const args={person:{id:'a'},camera:{id:'cam'}};
  assert.equal(simple.matches(h.engine,'image_notification_requested',args,state),true);
  for(const wrong of [{...args,person:{id:'b'}},{...args,camera:{id:'other'}}])assert.equal(simple.matches(h.engine,'image_notification_requested',wrong,state),false);
  assert.equal(simple.matches(h.engine,'notification_requested',args,state),false);
  h.config.observation=true;assert.equal(simple.matches(h.engine,'image_notification_requested',args,state),false);
  h.config.observation=false;h.advance(300001);assert.equal(simple.matches(h.engine,'image_notification_requested',args,state),false);
});

test('Bare én leveringsmetode sender, og mottaker-ID-er finnes ikke i synlige tagger',async()=>{
  const c=defaults();c.observation=false;const calls=[];
  const a=new HomeyAdapter({flow:{getTriggerCard:id=>({trigger:async(tokens,state)=>calls.push({id,tokens,state})})}},()=>c);
  await a.emit({kind:'notify',recipients:['a','b'],text:'Hei',deliveryId:'delivery'});
  assert.deepEqual(calls.map(c=>c.id),['notification_requested','notification_requested']);
  assert.deepEqual(calls[0].tokens,{text:'Hei'});assert.equal(calls[1].state.personId,'b');
  c.delivery.notifications='legacy';await a.emit({kind:'notify',recipients:['a'],text:'Hei'});
  assert.equal(calls[2].id,'delivery_requested');assert.equal(calls.length,3);
});

test('Svar knyttes til riktig nattspørsmål og person, med veto og avvisning av gamle tagger',async()=>{
  const h=harness(c=>{c.night.automatic=true;c.security.alarmDeviceId='panel';c.bridges.questions=true;});h.device('panel','homealarm_state','disarmed');h.ingest();
  await h.engine.requestNight();const q=h.engine.state.question;
  const listeners={}, card=id=>({registerRunListener:f=>{listeners[id]=f;},registerArgumentAutocompleteListener:()=>{}});
  simple.register({engine:h.engine,adapter:{catalogue:catalog()},homey:{flow:{getTriggerCard:card,getActionCard:card}}});
  assert.notEqual(q.replyKeys.a,q.replyKeys.b);
  await listeners.answer_night_question({reply:'old',answer:'yes'});assert.deepEqual(q.answers,{});
  await listeners.answer_night_question({reply:q.replyKeys.a,answer:'yes'});assert.deepEqual(q.answers,{a:'yes'});
  await listeners.answer_night_question({reply:q.replyKeys.b,answer:'no'});assert.equal(q.decided,'no');
  await listeners.answer_night_question({reply:q.replyKeys.a,answer:'no'});assert.equal(q.answers.a,'yes');
});

test('Enkle flows må ha riktig mottaker, tagg og utgang uten skjulte betingelser',()=>{
  const c=defaults();c.people.notifications=['a'];add(c,'alarm',[step('n',{kind:'notify',text:'Alarm'})]);
  const f={type:'normal',enabled:true,trigger:{id:own+'notification_requested',args:{person:{id:'a'}}},conditions:[],actions:[{group:'then',id:'homey:manager:mobile:push_text',args:{user:{id:'a'},text:'[[text]]'}}]};
  const cat={...catalog(),integrationFlows:[f]};assert.equal(coverage(c,cat).enabled.notifications,true);
  f.actions[0].args.user.id='b';assert.equal(coverage(c,cat).enabled.notifications,false);f.actions[0].args.user.id='a';
  f.conditions=[{id:'something'}];assert.equal(coverage(c,cat).enabled.notifications,false);f.conditions=[];
  cat.integrationFlows.push(structuredClone(f));assert.equal(coverage(c,cat).enabled.notifications,false);
});

test('Spørsmålsflow må returnere både ja og nei til samme tagg',()=>{
  const c=defaults();c.night.automatic=true;c.people.questions=['a'];
  const f={type:'normal',trigger:{id:own+'question_requested',args:{person:{id:'a'}}},conditions:[{id:'homey:manager:mobile:push_confirm',args:{user:{id:'a'},text:'[[text]]'}}],actions:['then','else'].map((group,i)=>({group,id:own+'answer_night_question',args:{reply:'[[reply]]',answer:i?'no':'yes'}}))};
  const cat={...catalog(),integrationFlows:[f]};assert.equal(coverage(c,cat).enabled.questions,true);
  f.actions[1].args.reply='old';assert.equal(coverage(c,cat).enabled.questions,false);
});

test('Ny migreringsplan bruker enkle kort og dekker samme funksjoner på ett lerret',()=>{
  const {build}=require('../lib/simple-flow-plan'), {collect}=require('../lib/flow-connections');
  const c=defaults();c.night.automatic=true;c.people.questions=['a'];c.people.notifications=['a'];c.security.alarmDeviceId='panel';
  add(c,'alarm',[step('image',{kind:'notify',notificationType:'image',imageDeviceId:'cam'}),step('say',{kind:'speak',deviceId:'speaker',text:'Alarm',volume:50}),step('sound',{kind:'sound',deviceId:'speaker',text:'alarm3',volume:50})]);
  const manifest=require('../app.json');
  const metadata={triggers:manifest.flow.triggers.map(x=>({id:own+x.id})),conditions:[{id:'homey:manager:mobile:push_confirm'}],actions:manifest.flow.actions.map(x=>({id:own+x.id}))};
  metadata.actions.push(...['push_text','push_image'].map(id=>({id:'homey:manager:mobile:'+id})),...['tts','sound'].map(id=>({id:'homey:device:speaker:cloud_play_'+id})));
  const people={a:{id:'a',name:'Person A'}}, devices={cam:{id:'cam',name:'Kamera',images:[{id:'1',type:'camera'}]},speaker:{id:'speaker',name:'Stue'}};
  const plan=build(c,people,devices,metadata,{'speaker:alarm3':{id:'alarm3',name:'Alarm 3'}});
  assert.equal(plan.flow.enabled,false);assert.equal(plan.routes,5);assert.equal(plan.cards,12);
  const cat={integrationFlows:collect({},[{...plan.flow,enabled:true}])};
  assert.deepEqual(coverage(c,cat).enabled,{questions:true,notifications:true,audio:true});

  assert.equal(Object.values(plan.flow.cards).some(card=>/delivery_requested|delivery_matches|delivery_result|integration_event/.test(card.id)),false);
  const flow=cat.integrationFlows[0], question=Object.values(flow.cards).find(card=>card.id===own+'question_requested');
  const condition=flow.cards[question.outputSuccess[0]], yes=flow.cards[condition.outputTrue[0]];
  yes.args.reply='[[trigger::another-question::reply]]';assert.equal(coverage(c,cat).enabled.questions,false);
  condition.outputFalse=['deleted-card'];assert.doesNotThrow(()=>coverage(c,cat));assert.equal(coverage(c,cat).enabled.questions,false);
});

test('Veiviseren velger flows med riktig type og bevarer øvrige rutiner i observasjon',()=>{
  const c=defaults();c.people.presence=['a'];add(c,'away',[step('custom')]);
  const cat={people:{a:{id:'a',name:'A'}},flows:[{id:'off',name:'Lys av',type:'normal',enabled:true,triggerable:true},{id:'welcome',name:'Velkomst',type:'advanced',enabled:true,triggerable:true}]};
  const opts={people:['a'],useNightPeople:true,flows:{away:'normal:off',home:'advanced:welcome',night:''}};
  const next=setup.draft(c,opts,cat);assert.equal(next.observation,true);assert.equal(c.routines.find(r=>r.id==='away').actions.length,1);
  assert.deepEqual(next.people.night,['a']);assert.deepEqual(next.routines.find(r=>r.id==='away').actions.map(a=>a.id),['custom','setup-away-flow-off']);
  const checked=validate(next);assert.equal(checked.routines.find(r=>r.id==='away').actions[1].flowId,'off');assert.equal(checked.routines.find(r=>r.id==='home').actions[0].flowType,'advanced');
  assert.deepEqual(setup.selections(next),opts.flows);
  assert.deepEqual(setup.draft(next,opts,cat),next);
  opts.flows.away='normal:missing';assert.throws(()=>setup.draft(c,opts,cat),/Valgt Flow/);
});

test('Veiviseren nekter å fjerne tidligere valg som andre handlinger avhenger av',()=>{
  const c=defaults(),cat={people:{a:{id:'a',name:'A'}},flows:[]};
  add(c,'away',[step('managed',{setupManaged:true}),step('dependent',{dependsOn:'managed',requireConfirmed:true})]);
  assert.throws(()=>setup.draft(c,{people:['a'],flows:{away:''}},cat),/avansert/);
});

test('Flow-listen viser alle flows, men ugyldige valg kan ikke legges i utkastet',()=>{
  const c=defaults(),cat={people:{a:{id:'a',name:'A'}},flows:[
    {id:'normal',name:'Samme navn',type:'normal',triggerable:true},
    {id:'advanced',name:'Samme navn',type:'advanced',triggerable:true},
    {id:'disabled',name:'Av',type:'normal',triggerable:true,enabled:false},
    {id:'broken',name:'Brutt',type:'normal',triggerable:true,broken:true},
    {id:'no-start',name:'Hendelse',type:'advanced',triggerable:false},
    {id:'tag',name:'Med tagg',type:'normal',triggerable:false},
    {id:'unknown',name:'Ukjent',type:'normal'},
  ]};
  const choices=setup.flowChoices(cat);assert.equal(choices.length,cat.flows.length);
  assert.equal(new Set(choices.map(f=>f.key)).size,cat.flows.length);
  assert.equal(choices.filter(f=>f.selectable).length,2);
  assert.equal(choices.find(f=>f.id==='no-start').reason,'Mangler Start-kort');
  for(const flow of choices.filter(f=>!f.selectable))assert.throws(()=>setup.draft(c,{people:['a'],flows:{away:flow.key}},cat),/Valgt Flow/);
});

test('Et nytt Flow-valg erstatter tidligere veiviserlys uten å duplisere en valgt eksisterende Flow',()=>{
  const c=defaults(),cat={people:{a:{id:'a',name:'A'}},flows:[{id:'off',name:'Lys av',type:'normal',triggerable:true}]};
  const custom=step('custom-flow',{kind:'flow',category:'lights',flowId:'off',flowType:'normal',delaySeconds:10});
  const oldLight=step('old-light',{kind:'set',category:'lights',deviceId:'lamp',capability:'onoff',value:false,setupManaged:true});
  add(c,'away',[custom,oldLight]);assert.equal(setup.selections(c).away,'');
  const next=setup.draft(c,{people:['a'],flows:{away:'normal:off'}},cat);
  assert.deepEqual(next.routines.find(r=>r.id==='away').actions,[custom]);
  assert.equal(c.routines.find(r=>r.id==='away').actions.length,2);
  assert.equal(setup.selections(next).away,'normal:off');
  assert.deepEqual(setup.draft(next,{people:['a'],flows:{away:''}},cat).routines.find(r=>r.id==='away').actions,[custom]);
});

test('Et uendret Flow-valg beholder handlingens avhengigheter; bytte og fjerning avvises ved avhengighet',()=>{
  const c=defaults(),cat={people:{a:{id:'a',name:'A'}},flows:[{id:'off',name:'Lys av',type:'normal',triggerable:true},{id:'other',name:'Annen',type:'normal',triggerable:true}]};
  add(c,'away',[step('managed',{kind:'flow',category:'lights',flowId:'off',flowType:'normal',setupManaged:true}),step('dependent',{dependsOn:'managed'})]);
  assert.deepEqual(setup.draft(c,{people:['a'],flows:{away:'normal:off'}},cat).routines,c.routines);
  for(const key of ['','normal:other'])assert.throws(()=>setup.draft(c,{people:['a'],flows:{away:key}},cat),/avansert/);
});

test('Tilgangskontrollen bruker bare appens egne ufarlige kort',async()=>{
  const calls=[];const result=await require('../lib/integration-access')({flow:{runFlowCardAction:async x=>{calls.push(x.id);throw Error('Missing Scopes');},runFlowCardCondition:async x=>{calls.push(x.id);return false;}}});
  assert.deepEqual(calls,[own+'check_integration_access',own+'delivery_matches']);assert.equal(result.actions.available,false);assert.equal(result.conditions.available,true);
});
