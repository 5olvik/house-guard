'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {harness,add,step}=require('./helpers');
const {defaults,validate}=require('../lib/config'),{builtins}=require('../lib/plans');
const api=require('../api');
const ALARM='house-guard-internal-alarm';

function setup(change=()=>{},saved={}) {
  const h=harness(c=>{
    c.night.automatic=true;c.night.rule='auto-no-answer';c.night.zoneId='zone';c.bridges.questions=true;c.security.alarmDeviceId=ALARM;
    add(c,'night',[step('night-extra')]);change(c);
  },saved);
  h.zone=(active=false,quietSince=h.now()-3600000,observedAt=h.now())=>{h.snapshot.zones={[h.config.night.zoneId]:{active,inactiveSince:active?null:quietSince,observedAt}};};
  const advance=h.advance;h.advance=ms=>{advance(ms);const zone=h.snapshot.zones?.[h.config.night.zoneId];if(zone)zone.observedAt=h.now();};
  h.zone();h.device(ALARM,'homealarm_state','disarmed');h.ingest();return h;
}
const nights=h=>h.engine.runs.filter(r=>r.routineId==='night');
const sleeping=h=>h.calls.filter(c=>c[0]==='person'&&c[2]===true);
async function confirmPeople(h) {
  const original=h.adapter.setAsleep;
  h.adapter.setAsleep=async(id,value,...args)=>{await original(id,value,...args);h.person(id,h.snapshot.people[id].present,value);};
}
async function request(h) {
  assert.equal(await h.engine.requestNight(),true);return h.engine.state.question;
}
async function finish(h,ticks=6) {for(let i=0;i<ticks;i++)await h.engine.tick();}

test('The quiet period precedes the question and an early yes starts night without waiting for the reply deadline',async()=>{
  for(const manualSleeper of [false,true]){
    const h=setup(c=>{c.people.presence=['a','b','c'];c.people.night=['a','b','c'];c.night.idleMinutes=30;c.night.answerSeconds=900;});
    h.person('a',true,manualSleeper);h.person('c',false);h.zone(false,h.now()-29*60000);h.ingest();await confirmPeople(h);
    await h.engine.tick();assert.equal(h.engine.state.question,null);assert.equal(h.calls.length,0);
    h.advance(60000);h.ingest();await h.engine.tick();const q=h.engine.state.question;
    assert(q);assert.deepEqual(q.recipients,manualSleeper?['b']:['a','b']);assert.equal(q.deadline,h.now()+900000);
    h.advance(7000);h.engine.answer(q.id,'b','yes');await finish(h);
    assert(h.now()<q.deadline);assert.equal(q.decided,'yes');assert.equal(nights(h).length,1);
    assert.deepEqual(sleeping(h),manualSleeper?[['person','b',true]]:[['person','a',true],['person','b',true]]);
    assert.equal(h.snapshot.people.a.asleep,true);assert.equal(h.snapshot.people.b.asleep,true);assert.equal(h.snapshot.people.c.asleep,false);
    assert.equal(h.engine.state.mode,'night');assert.equal(h.calls.filter(c=>c[0]==='set'&&c[3]==='partially_armed').length,1);
    assert(h.engine.status().history.some(e=>e.message==='Nattmodus starter: ja-svar mottatt'));
    assert.throws(()=>h.engine.answer(q.id,'a','no'),/utløpt/);
    await finish(h);assert.equal(nights(h).length,1);
  }
});

test('An unanswered quiet-period question waits the full reply deadline before marking home residents asleep',async()=>{
  const h=setup(c=>{c.night.idleMinutes=30;c.night.answerSeconds=900;});h.zone(false,h.now()-29*60000);h.ingest();await confirmPeople(h);
  await h.engine.tick();assert.equal(h.engine.state.question,null);h.advance(60000);h.ingest();await h.engine.tick();const q=h.engine.state.question;
  assert(q);h.advance(899999);h.ingest();await finish(h);assert.equal(nights(h).length,0);assert.equal(sleeping(h).length,0);
  h.advance(1);h.ingest();await finish(h);assert.equal(q.decided,'yes');assert.equal(nights(h).length,1);
  assert.deepEqual(sleeping(h),[['person','a',true],['person','b',true]]);
  assert(h.engine.status().history.some(e=>e.message==='Nattmodus starter: ingen svarte innen fristen'));
});

test('An early yes still rechecks fresh presence, quiet zone and alarm state before night activation',async()=>{
  for(const scenario of ['away','unknown-sleep','disconnected','armed','movement','observation','guest','config']){
    const h=setup(),q=await request(h);h.advance(7000);h.engine.answer(q.id,'b','yes');
    if(scenario==='away'){h.person('a',false);h.person('b',false);}
    if(scenario==='unknown-sleep')h.person('a',true,null);
    if(scenario==='disconnected')h.snapshot.connected=false;
    if(scenario==='armed')h.device(ALARM,'homealarm_state','armed');
    if(scenario==='movement')h.zone(true);
    if(scenario==='observation')h.engine.config.observation=true;
    if(scenario==='guest')h.engine.setGuest(true);
    if(scenario==='config')h.engine.updateConfig(structuredClone(h.config));
    await finish(h);assert(h.now()<q.deadline);assert.equal(nights(h).length,0,scenario);assert.equal(sleeping(h).length,0,scenario);
  }
});

test('No unanswered timeout starts night before its deadline, then starts once and puts only home night residents asleep',async()=>{
  const h=setup(c=>{c.people.presence=['a','b','c'];c.people.night=['a','b'];});h.person('a',true);h.person('b',false);h.person('c',true);h.ingest();
  await confirmPeople(h);const q=await request(h);
  h.advance(119999);await h.engine.tick();assert.equal(nights(h).length,0);assert.equal(sleeping(h).length,0);
  h.advance(1);await finish(h);assert.equal(q.decided,'yes');assert.equal(nights(h).length,1);
  assert.deepEqual(sleeping(h),[['person','a',true]]);assert.equal(h.snapshot.people.b.asleep,false);assert.equal(h.snapshot.people.c.asleep,false);
  assert.equal(h.calls.filter(c=>c[0]==='set'&&c[3]==='partially_armed').length,1);
  h.device(ALARM,'homealarm_state','partially_armed');h.advance(5000);await finish(h);assert.equal(nights(h).length,1);
  assert.equal(h.calls.filter(c=>c[0]==='timeline'&&c[1]==='night-extra').length,1);
  assert.throws(()=>h.engine.answer(q.id,'a','yes'),/utløpt/);
});

test('An unanswered question may time out after its recipient leaves when another resident is still home',async()=>{
  const h=setup(c=>{c.people.questions=['a'];});await confirmPeople(h);const q=await request(h);
  h.person('a',false);h.advance(120000);await finish(h);
  assert.equal(q.decided,'yes');assert.equal(nights(h).length,1);assert.deepEqual(sleeping(h),[['person','b',true]]);
});

test('A no answer vetoes automatic timeout, including a concurrent yes from another resident',async()=>{
  for(const yes of [false,true]) {
    const h=setup(),q=await request(h);if(yes)h.engine.answer(q.id,'a','yes');h.engine.answer(q.id,'b','no');
    h.advance(120000);await finish(h);assert.equal(q.decided,'no');assert(h.engine.state.skipUntil>h.now());assert.equal(nights(h).length,0);assert.equal(sleeping(h).length,0);
  }
});

test('Failed question delivery or error answers do not count as an unanswered night timeout',async()=>{
  for(const failure of ['emit','answer']) {
    const h=setup();if(failure==='emit')h.adapter.emit=async()=>{throw Error('Push unavailable');};
    const q=await request(h);if(failure==='answer')h.engine.answer(q.id,'a','error');
    h.advance(120000);await finish(h);assert.equal(q.decided,'no');assert.equal(nights(h).length,0);assert.equal(sleeping(h).length,0);
  }
});

test('Timeout rechecks current presence, sleep, connection, alarm and guest state before starting night',async()=>{
  for(const scenario of ['away','unknown-presence','unknown-sleep','stale-presence','disconnected','armed','missing-alarm','guest','observation','outside-window','skipped']) {
    const h=setup(),q=await request(h);h.advance(120000);
    switch(scenario) {
      case 'away':h.person('a',false);h.person('b',false);break;
      case 'unknown-presence':h.person('b',null);break;
      case 'unknown-sleep':h.person('a',true,null);break;
      case 'stale-presence':h.snapshot.people.a.observedAt=h.now()-121000;break;
      case 'disconnected':h.snapshot.connected=false;break;
      case 'armed':h.device(ALARM,'homealarm_state','armed');break;
      case 'missing-alarm':h.snapshot.devices[ALARM].available=false;break;
      case 'guest':h.engine.setGuest(true);break;
      case 'observation':h.engine.config.observation=true;break;
      case 'outside-window':h.advance(7*3600000);break;
      case 'skipped':h.engine.skipNight();break;
    }
    await finish(h);assert.equal(nights(h).length,0,scenario);assert.equal(sleeping(h).length,0,scenario);assert.notEqual(h.engine.state.manualNight,true,scenario);
    assert(q.decided,scenario);
  }
});

test('Fresh checks prevent a yes answer as well as a no-answer timeout from starting an empty or disconnected home',async()=>{
  for(const rule of ['veto','all-yes','auto-no-answer'])for(const disconnected of [false,true]) {
    const h=setup(c=>{c.night.rule=rule;}),q=await request(h);h.engine.answer(q.id,'a','yes');h.engine.answer(q.id,'b','yes');
    h.advance(120000);if(disconnected)h.snapshot.connected=false;else{h.person('a',false);h.person('b',false);}
    await finish(h);assert.equal(nights(h).length,0,rule);assert.equal(sleeping(h).length,0,rule);
  }
});

test('Config, generation, question and observation changes during either fresh read invalidate timeout or early yes',async()=>{
  for(const trigger of ['timeout','yes'])for(const readNumber of [1,2])for(const scenario of ['config','generation','question','observation']) {
    const h=setup(),q=await request(h);h.advance(trigger==='yes'?7000:120000);if(trigger==='yes')h.engine.answer(q.id,'b','yes');
    let release,reads=0,entered;const original=h.adapter.snapshot,reached=new Promise(resolve=>{entered=resolve;});
    h.adapter.snapshot=async()=>{if(++reads!==readNumber)return original();return new Promise(resolve=>{release=async()=>resolve(await original());entered();});};
    const tick=h.engine.tick();await reached;assert.equal(typeof release,'function');
    if(scenario==='config')h.engine.updateConfig(structuredClone(h.config));
    if(scenario==='generation')h.engine.state.generation++;
    if(scenario==='question')h.engine.state.question={...h.engine.state.question,id:'replacement',decided:null,deadline:h.now()+120000};
    if(scenario==='observation')h.engine.config.observation=true;
    await release();await tick;assert.equal(nights(h).length,0,scenario);assert.equal(sleeping(h).length,0,scenario);
    if(scenario==='question')assert.equal(h.engine.state.question.id,'replacement');
  }
});

test('Manual morning and reconnection cancel a timeout or early yes decision awaiting either fresh snapshot read',async()=>{
  for(const trigger of ['timeout','yes'])for(const readNumber of [1,2])for(const scenario of ['morning','reconnect']) {
    const h=setup(),q=await request(h);h.advance(trigger==='yes'?7000:120000);if(trigger==='yes')h.engine.answer(q.id,'b','yes');
    let release,reads=0,entered;const original=h.adapter.snapshot,reached=new Promise(resolve=>{entered=resolve;});
    h.adapter.snapshot=async()=>{if(++reads!==readNumber)return original();return new Promise(resolve=>{release=async()=>resolve(await original());entered();});};
    const tick=h.engine.tick();await reached;assert.equal(q.decided,'yes');
    if(scenario==='morning')assert.equal(h.engine.morning('manual'),true);
    else h.ingest({reconnect:true});
    assert.equal(q.decided,'cancelled',`${scenario}, read ${readNumber}`);
    await release();await tick;
    assert.equal(nights(h).length,0,`${scenario}, read ${readNumber}`);assert.equal(sleeping(h).length,0,`${scenario}, read ${readNumber}`);
    assert.equal(q.decided,'cancelled');assert.notEqual(q.activating,true);
  }
});

test('Manual morning cancels a pending night question even if morning already ran on the same date',async()=>{
  const h=setup(()=>{},{morningKey:'morning-2026-09-21'}),q=await request(h);
  assert.equal(q.decided,null);assert.equal(h.engine.morning('manual'),true);assert.equal(q.decided,'cancelled');
  assert.equal(h.engine.morning('manual'),false);h.advance(120000);await finish(h);
  assert.equal(nights(h).length,0);assert.equal(sleeping(h).length,0);assert.equal(h.engine.state.mode,'home');
});

test('Unanswered automatic timeouts do not replay after startup or reconnection',async()=>{
  for(const reconnect of [false,true]) {
    const before=setup();await request(before);const saved=before.saved();
    const after=reconnect?before:setup(()=>{},saved);if(reconnect)after.ingest({reconnect:true});
    assert.equal(after.engine.state.question.decided,'cancelled');
    const previousQuestionId=after.engine.state.question.id;
    after.advance(120000);await finish(after);assert.equal(nights(after).length,0);assert.equal(sleeping(after).length,0);
    // A new, fresh question may be sent; its own deadline must pass first.
    if(after.engine.state.question.id!==previousQuestionId)assert(after.engine.state.question.deadline>after.now());
  }
});

test('Existing yes-required questions keep their pending replies across restart',async()=>{
  for(const rule of ['veto','all-yes']) {
    const before=setup(c=>{c.night.rule=rule;}),q=await request(before),after=setup(c=>{c.night.rule=rule;},before.saved());
    assert.equal(after.engine.state.question.id,q.id);assert.equal(after.engine.state.question.decided,null);
    after.engine.answer(q.id,'a','yes');after.engine.answer(q.id,'b','yes');after.advance(120000);await finish(after);
    assert.equal(nights(after).length,1);assert.deepEqual(sleeping(after),[['person','a',true]]);
  }
});

test('Every night plan and selected sleep connection includes sleeping despite a legacy false setting',()=>{
  const c=defaults();c.night.markAsleep=false;c.people.presence=['a','b'];c.people.night=['a','b'];
  const plan=builtins('night',c,{}, {homeIds:['a']});assert.deepEqual(plan.filter(a=>a.kind==='person').map(a=>[a.personId,a.value]),[['a',true]]);
  assert.deepEqual(require('../lib/sleep-flows').selected(c).filter(p=>p.value),[{id:'a',value:true},{id:'b',value:true}]);
});

test('One manually sleeping resident does not block the remaining residents before or during a night question',async()=>{
  for(const rule of ['veto','all-yes','auto-no-answer'])for(const timing of ['before','pending']){
    const h=setup(c=>{c.night.rule=rule;});await confirmPeople(h);
    if(timing==='before'){h.person('a',true,true);h.ingest();}
    const q=await request(h);
    if(timing==='pending'){h.person('a',true,true);h.ingest();assert.equal(q.decided,null);}
    assert.deepEqual(q.recipients,timing==='before'?['b']:['a','b']);
    if(rule!=='auto-no-answer')for(const id of q.recipients)h.engine.answer(q.id,id,'yes');
    h.advance(120000);await finish(h);
    assert.equal(q.decided,'yes',rule+' '+timing);assert.equal(nights(h).length,1);
    assert.deepEqual(sleeping(h),[['person','b',true]]);assert.equal(h.snapshot.people.a.asleep,true);
    assert.equal(h.engine.state.mode,'night');assert.equal(h.calls.filter(c=>c[0]==='set'&&c[3]==='partially_armed').length,1);
  }
});

test('Night questions are delivered only to selected residents who are home and awake for every reply rule',async()=>{
  for(const rule of ['veto','all-yes','auto-no-answer']){
    const h=setup(c=>{c.night.rule=rule;c.people.presence=['a','b','c','d'];c.people.night=['a','b','c','d'];c.people.questions=['a','b','c'];});
    h.person('a',true,true);h.person('b',true,false);h.person('c',false,false);h.person('d',true,false);h.ingest();
    const q=await request(h);
    assert.deepEqual(q.recipients,['b'],rule);
    assert.deepEqual(Object.keys(q.replyKeys),['b'],rule);
    assert.deepEqual(h.calls.filter(c=>c[0]==='emit').map(c=>c[1].personId),['b'],rule);
    assert.deepEqual(h.engine.state.deliveries.map(d=>d.recipients),[['b']],rule);
    assert.throws(()=>h.engine.answer(q.id,'a','yes'),/mottakeren/,rule);
    assert.throws(()=>h.engine.answer(q.id,'d','yes'),/mottakeren/,rule);
    assert.deepEqual(h.engine.config.people.questions,['a','b','c'],rule);
    await confirmPeople(h);h.engine.answer(q.id,'b','yes');h.advance(120000);await finish(h);
    assert.equal(q.decided,'yes',rule);assert.equal(nights(h).length,1,rule);
    assert.deepEqual(sleeping(h),[['person','b',true],['person','d',true]],rule);
    assert.equal(h.snapshot.people.a.asleep,true);assert.equal(h.snapshot.people.c.asleep,false);
  }
});

test('No new question or timeout is created when only sleeping residents are selected to receive it',async()=>{
  for(const rule of ['veto','all-yes','auto-no-answer']){
    const h=setup(c=>{c.night.rule=rule;c.people.questions=['a'];});h.person('a',true,true);h.ingest();
    assert.equal(await h.engine.requestNight(),false,rule);h.advance(120000);await finish(h);
    assert.equal(h.engine.state.question,null,rule);assert.equal(nights(h).length,0,rule);assert.equal(h.calls.length,0,rule);
    assert.match(h.engine.autoNightReason(),/Ingen våkne/);
    h.person('a',true,false);h.ingest();const q=await request(h);assert.deepEqual(q.recipients,['a']);
  }
});

test('A no from the only awake recipient still vetoes night while another resident is already asleep',async()=>{
  for(const rule of ['veto','all-yes','auto-no-answer']){
    const h=setup(c=>{c.night.rule=rule;});h.person('a',true,true);h.ingest();const q=await request(h);
    h.engine.answer(q.id,'b','no');h.advance(120000);await finish(h);
    assert.equal(q.decided,'no',rule);assert.equal(nights(h).length,0,rule);assert.equal(sleeping(h).length,0,rule);
    assert(h.engine.state.skipUntil>h.now(),rule);
  }
});

test('A resident marking themselves asleep during either final read does not invalidate a quiet automatic night',async()=>{
  for(const readNumber of [1,2]){
    const h=setup();await confirmPeople(h);const q=await request(h);h.advance(120000);
    let reads=0;const original=h.adapter.snapshot;
    h.adapter.snapshot=async()=>{if(++reads===readNumber)h.person('a',true,true);return original();};
    await finish(h);assert.equal(q.decided,'yes');assert.equal(nights(h).length,1);assert.deepEqual(sleeping(h),[['person','b',true]]);
  }
});

test('Unknown or stale sleep and presence data still block a night question while an away sleeper does not',async()=>{
  for(const scenario of ['unknown-sleep','unknown-presence','unavailable','stale']){
    const h=setup();h.person('a',true,true);
    if(scenario==='unknown-sleep')h.person('b',true,null);
    if(scenario==='unknown-presence')h.person('b',null);
    if(scenario==='unavailable')h.person('b',true,false,false);
    if(scenario==='stale')h.snapshot.people.b.observedAt=h.now()-121000;
    h.ingest();assert.equal(await h.engine.requestNight(),false,scenario);assert.equal(h.engine.state.question,null);
  }
  const h=setup();h.person('a',false,true);h.ingest();assert.equal(await h.engine.requestNight(),true);
});

test('All residents manually falling asleep cancel the pending question and run night only once',async()=>{
  const h=setup(),q=await request(h);h.person('a',true,true);h.person('b',true,true);h.ingest();
  assert.equal(q.decided,'cancelled');assert.equal(nights(h).length,1);h.advance(120000);await finish(h);
  assert.equal(nights(h).length,1);assert.equal(sleeping(h).length,0);assert.equal(h.engine.state.mode,'night');
});

test('Automatic after deadline requires a fresh, quiet configured zone before sending any question',async()=>{
  for(const scenario of ['active','recent','missing','stale','future','unknown','bad-inactive','future-inactive','no-zone']){
    const h=setup(),zone=h.snapshot.zones.zone;
    if(scenario==='active')h.zone(true);
    if(scenario==='recent')h.zone(false,h.now()-1000);
    if(scenario==='missing')h.snapshot.zones={};
    if(scenario==='stale')zone.observedAt=h.now()-121000;
    if(scenario==='future')zone.observedAt=h.now()+1;
    if(scenario==='unknown')zone.active=null;
    if(scenario==='bad-inactive')zone.inactiveSince=null;
    if(scenario==='future-inactive')zone.inactiveSince=h.now()+1;
    if(scenario==='no-zone')h.engine.config.night.zoneId='';
    h.ingest();assert.equal(await h.engine.requestNight(),false,scenario);assert.equal(h.calls.length,0,scenario);
  }
});

test('Movement during a pending automatic deadline cancels it and a new quiet period gets a new deadline',async()=>{
  const h=setup(c=>{c.night.idleMinutes=1;}),q=await request(h);h.advance(30000);h.zone(true);h.ingest();
  assert.equal(q.decided,'cancelled');assert.equal(h.engine.state.skipUntil,0);await h.engine.tick();assert.equal(nights(h).length,0);
  h.zone(false,h.now());h.ingest();h.advance(59999);h.ingest();await h.engine.tick();assert.equal(h.engine.state.question,q);
  h.advance(1);h.ingest();await h.engine.tick();const next=h.engine.state.question;
  assert.notEqual(next.id,q.id);assert.equal(next.deadline,h.now()+120000);await confirmPeople(h);
  h.advance(119999);await finish(h);assert.equal(nights(h).length,0);
  h.advance(1);await finish(h);assert.equal(nights(h).length,1);assert.equal(next.decided,'yes');
});

test('Movement, lost zone data and short pulses between snapshots prevent automatic start in either final read',async()=>{
  for(const readNumber of [1,2])for(const scenario of ['active','pulse','unknown','missing','stale','future']){
    const h=setup(),q=await request(h);h.advance(120000);let reads=0;const original=h.adapter.snapshot;
    h.adapter.snapshot=async()=>{
      if(++reads===readNumber){
        const zone=h.snapshot.zones.zone;
        if(scenario==='active')h.zone(true);
        if(scenario==='pulse')h.zone(false,h.now()-60000);
        if(scenario==='unknown')zone.active=null;
        if(scenario==='missing')h.snapshot.zones={};
        if(scenario==='stale')zone.observedAt=h.now()-121000;
        if(scenario==='future')zone.observedAt=h.now()+1;
      }
      return original();
    };
    await finish(h);assert.equal(q.decided,'cancelled',scenario+' read '+readNumber);
    assert.equal(nights(h).length,0);assert.equal(sleeping(h).length,0);assert.equal(q.activating,false);
  }
});

test('A yes reply in automatic mode cannot override new activity before the deadline',async()=>{
  const h=setup(),q=await request(h);h.engine.answer(q.id,'a','yes');h.advance(120000);h.zone(false,h.now()-60000);
  await finish(h);assert.equal(q.decided,'cancelled');assert.equal(nights(h).length,0);assert.equal(sleeping(h).length,0);
});

test('A quiet automatic night with one manual sleeper still enables motion morning for all home residents',async()=>{
  const h=setup(c=>{c.morning.motion={enabled:true,deviceId:'kitchen',capability:'alarm_motion',start:'06:00',end:'12:00'};});
  h.person('a',true,true);h.device('kitchen','alarm_motion',false);h.ingest();await confirmPeople(h);await request(h);
  h.advance(120000);await finish(h);assert.equal(h.engine.state.mode,'night');assert.deepEqual(sleeping(h),[['person','b',true]]);
  h.device(ALARM,'homealarm_state','partially_armed');h.ingest();await finish(h);
  const morning=require('../lib/motion-morning'),app={engine:h.engine,adapter:{direct:{ready:true}},
    intrusion:{state:{mode:'partially_armed',target:null,active:false,entryAt:0,bypassed:[]},disabledSensors:[],sensors:()=>[]},
    disarmAlarm(){this.intrusion.state.mode='disarmed';h.device(ALARM,'homealarm_state','disarmed');}};
  h.advance(7*3600000);h.ingest();assert.equal(morning(app,h.engine.snapshot,{reset:true}),false);
  h.device('kitchen','alarm_motion',true);const snapshot=await h.adapter.snapshot();
  assert.equal(morning(app,snapshot,{event:{id:'kitchen',capability:'alarm_motion',value:true}}),true);
  await finish(h);h.ingest();assert.equal(h.snapshot.people.a.asleep,false);assert.equal(h.snapshot.people.b.asleep,false);
  assert.equal(h.engine.state.mode,'home');assert.equal(app.intrusion.state.mode,'disarmed');
  assert.equal(h.engine.runs.filter(r=>r.routineId==='morning').length,1);
});

function loadApp(Adapter) {
  const file=path.resolve(__dirname,'../app.js'),module={exports:{}},req=createRequire(file);
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:id=>id==='homey'?{App:EventEmitter}:id==='./lib/homey-adapter'&&Adapter?{HomeyAdapter:Adapter}:req(id)});return module.exports;
}
function legacyConfig() {
  const c=defaults();c.revision=73;c.setupCompleted=true;c.observation=false;c.night.markAsleep=false;c.night.rule='all-yes';c.night.answerSeconds=45;c.night.zoneId='keep-zone';
  c.people.presence=['a','b'];c.people.night=['a'];c.people.questions=['b'];c.people.notifications=['a'];c.welcome.delaySeconds=17;
  c.security.alarmDeviceId=ALARM;c.security.lockDeviceId='keep-lock';c.security.autoUnlock=true;
  c.security.intrusion.sensors=[{deviceId:'keep-alarm-sensor',capability:'alarm_contact',full:true,partial:true,delay:true}];
  c.welcome.doorDeviceId='keep-door';c.welcome.luxDeviceId='keep-lux';
  c.routines.find(r=>r.id==='away').enabled=false;add(c,'night',[step('keep-night',{delaySeconds:12})]);
  c.routines.push({id:'custom-keep',name:'Min rutine',enabled:false,execution:'parallel',actions:[step('keep-custom')]});return c;
}

test('Legacy false normalizes on validation and import without changing any unrelated setting or action',async()=>{
  const c=legacyConfig(),original=structuredClone(c),expected={...c,night:{...c.night,markAsleep:true}};
  assert.deepEqual(validate(c),expected);assert.deepEqual(c,original);assert.deepEqual(validate(expected),expected);
  const imported=await api.validateConfig({body:JSON.parse(JSON.stringify(c))});assert.deepEqual(imported,expected);
});

test('Saving a legacy false setting persists mandatory sleeping and preserves the complete setup',async()=>{
  const c=legacyConfig(),h=harness(config=>Object.assign(config,c)),App=loadApp(),app=new App(),store={};app.engine=h.engine;
  app.adapter={...h.adapter,api:{},catalogue:{devices:{}},subscribe:async()=>{}};app.engine.adapter=app.adapter;app.refresh=async()=>{};
  app.homey={clock:{getTimezone:()=>'Europe/Oslo'},settings:{set:(k,v)=>store[k]=v}};
  const saved=await app.saveConfig(structuredClone(c));const expected={...c,revision:74,night:{...c.night,markAsleep:true}};
  assert.deepEqual(saved,expected);assert.deepEqual(store['husmodus.config.v1'],expected);assert.deepEqual(app.engine.config,expected);
});

test('Startup migrates a legacy false setting once, persisting it without losing devices or routines',async()=>{
  const c=legacyConfig(),store={'husmodus.config.v1':structuredClone(c)};
  class Adapter{constructor(){this.catalogue={devices:{}};}async connect(){}}
  const App=loadApp(Adapter),init=async()=>{const app=new App();app.log=()=>{};app.error=()=>{};app.registerCards=()=>{};app.refresh=async()=>{};
    app.homey={clock:{getTimezone:()=>'Europe/Oslo'},settings:{get:k=>store[k],set:(k,v)=>store[k]=v},setInterval:()=>1};await app.onInit();return app;};
  const expected={...c,revision:74,night:{...c.night,markAsleep:true}};
  assert.deepEqual((await init()).engine.config,expected);assert.deepEqual(store['husmodus.config.v1'],expected);
  assert.deepEqual((await init()).engine.config,expected);assert.deepEqual(store['husmodus.config.v1'],expected);
});
