'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Environment = require('../lib/environment');
const { defaults, validate } = require('../lib/config');
const settings = require('../lib/environment-config');
function harness(edit = () => {}, saved = {}, start = Date.parse('2026-10-06T10:00:00Z')) {
  let now = start, persisted;
  const config = defaults(); config.observation = false; config.people.notifications = ['a','b'];
  config.environment.enabled = true; config.environment.sensors = [
    { deviceId:'smoke', capability:'alarm_smoke' }, { deviceId:'smoke2', capability:'alarm_smoke' }, { deviceId:'water', capability:'alarm_water' },
  ]; edit(config); validate(config);
  const calls = [], logs = [], events = [], hooks = {};
  const sensor = (id,name,zone,capability,value) => ({ id,name,zone,available:true,capabilities:{[capability]:{type:'boolean',value,getable:true,setable:false},measure_temperature:{value:22},measure_battery:{value:90}} });
  const snapshot = { connected:true,people:{},devices:{smoke:sensor('smoke','Røykvarsler','Soverom','alarm_smoke',false),smoke2:sensor('smoke2','Røykvarsler 2','Stue','alarm_smoke',false),water:sensor('water','Vannsensor','Bad','alarm_water',null),
    valve:{id:'valve',name:'Vannstyring',available:true,capabilities:{onoff:{value:true,type:'boolean',setable:true}}},light:{id:'light',name:'Lys',available:true,capabilities:{onoff:{value:false,type:'boolean',setable:true}}},
    lock:{id:'lock',name:'Ytterdør',available:true,capabilities:{locked:{value:true,type:'boolean',setable:true}}}} };
  const guardCheck = guard => { if (!guard()) throw Error('Avbrutt før sending'); };
  const adapter = { direct:{ready:true},
    async emit(data,guard,dispatch) { await hooks.emit?.(data); guardCheck(guard); if(data.kind==='notify'&&!data.recipients.length)throw Error('Ingen mottakere'); dispatch(); calls.push(['emit',structuredClone(data)]); },
    async timeline(text,guard,dispatch) { await hooks.timeline?.(); guardCheck(guard); dispatch(); calls.push(['timeline',text]); },
    async set(id,capability,value,guard,dispatch,action) { await hooks.set?.(action); guardCheck(guard); dispatch(); calls.push(['set',id,capability,value]); },
    async startFlow(id,type,guard,dispatch) { await hooks.flow?.(); guardCheck(guard); dispatch(); calls.push(['flow',id,type]); },
  };
  const environment = new Environment({getConfig:()=>config,adapter,saved,clock:()=>now,persist:s=>{persisted=structuredClone(s);},log:(...args)=>logs.push(args),emit:(...args)=>events.push(args)});
  const update = options => environment.update(structuredClone(snapshot),{readStartedAt:now,...options});
  const value = (id,capability,value) => {snapshot.devices[id].capabilities[capability].value=value;};
  const event = (id,capability,v) => { now++; value(id,capability,v); environment.observeEvent(id,capability,v,structuredClone(snapshot.devices[id])); };
  return {config,adapter,snapshot,calls,logs,events,hooks,environment,update,value,event,advance:ms=>{now+=ms;},now:()=>now,saved:()=>persisted};
}
const pushes = h => h.calls.filter(([kind,data])=>kind==='emit'&&data.kind==='notify'&&data.notificationType!=='image');

test('Nye vannsensorer med temperatur og null vannalarm kan velges uten falsk alarm',async()=>{
  const h=harness();h.update();await h.environment.drain();
  const sensor=h.environment.status().sensors.find(s=>s.deviceId==='water');assert.equal(sensor.temperature,22);assert.equal(sensor.available,true);assert.equal(sensor.value,null);
  assert.equal(settings.label(sensor),'Ingen vannalarm rapportert ennå');assert.equal(h.environment.status().incidents.length,0);assert.deepEqual(h.calls,[]);
});

for(const mode of ['home','away','night','unknown'])test('Brann og vann virker uavhengig av husmodus '+mode+', gjester og tomt personutvalg',async()=>{
  const h=harness(c=>{c.people.presence=[];c.people.night=[];c.security.alarmDeviceId='';c.guest.allow.notification=false;});
  h.config.testHouseMode=mode;h.config.testGuestMode=true;h.value('smoke','alarm_smoke',true);h.value('water','alarm_water',true);h.update();await h.environment.drain();
  assert.equal(h.environment.status().incidents.filter(i=>i.active).length,2);assert.equal(pushes(h).length,2);assert.deepEqual(pushes(h).map(([,data])=>data.recipients),[['a','b'],['a','b']]);
  assert.deepEqual(pushes(h).map(([,data])=>data.notificationType),['critical','normal']);
});

for(const option of ['disabled','observing'])test('Ingen sideeffekter under '+option,async()=>{
  const h=harness(c=>{if(option==='disabled')c.environment.enabled=false;else c.observation=true;});h.event('smoke','alarm_smoke',true);h.update();await h.environment.drain();assert.deepEqual(h.calls,[]);assert.deepEqual(h.events,[]);
});

test('Testmodus, temperatur og innbruddssensorer utløser ikke brann/vann; ekte røyk under test gjør det',async()=>{
  const h=harness();h.snapshot.devices.smoke.capabilities.test_mode={value:true};h.snapshot.devices.smoke.capabilities.measure_temperature.value=100;
  h.environment.observeEvent('smoke','test_mode',true,h.snapshot.devices.smoke);h.environment.observeEvent('smoke','alarm_motion',true,h.snapshot.devices.smoke);h.update();await h.environment.drain();assert.equal(pushes(h).length,0);
  h.event('smoke','alarm_smoke',true);await h.environment.drain();assert.equal(pushes(h).length,1);
});

test('Flere sensorer samles i samme brannhendelse og ett initialt varsel',async()=>{
  const h=harness();h.value('smoke','alarm_smoke',true);h.value('smoke2','alarm_smoke',true);h.update();await h.environment.drain();
  const incident=h.environment.current('fire');assert.equal(incident.sensors.length,2);assert.equal(pushes(h).length,1);assert.match(pushes(h)[0][1].text,/Soverom, Stue/);assert.equal(h.events.filter(([event])=>event==='started').length,1);
  h.update();await h.environment.drain();assert.equal(pushes(h).length,1);
});

test('Ny sensor gir samlet tilleggsvarsel uten å gjenta fysiske handlinger',async()=>{
  const h=harness(c=>{c.environment.responses.fire.lights=['light'];});h.event('smoke','alarm_smoke',true);await h.environment.drain();
  h.event('smoke2','alarm_smoke',true);await h.environment.drain();assert.equal(pushes(h).length,1);
  h.advance(5000);h.update();h.environment.tick();await h.environment.drain();assert.equal(pushes(h).length,2);assert.equal(h.calls.filter(c=>c[0]==='set').length,1);assert.match(pushes(h)[1][1].text,/Stue/);
});

test('Null, utilgjengelig eller frakoblet sensor avslutter aldri en registrert alarm',async()=>{
  const h=harness();h.event('water','alarm_water',true);await h.environment.drain();
  h.value('water','alarm_water',null);h.update();assert(h.environment.current('water'));
  h.value('water','alarm_water',false);h.snapshot.devices.water.available=false;h.update();assert(h.environment.current('water'));
  h.snapshot.devices.water.available=true;h.snapshot.connected=false;h.update();assert(h.environment.current('water'));
  await h.environment.drain();assert.equal(pushes(h).length,1);
  h.snapshot.connected=true;h.update();await h.environment.drain();assert(!h.environment.current('water'));assert.equal(pushes(h).length,2);assert.equal(pushes(h)[1][1].notificationType,'normal');
});

test('Hendelsen avsluttes først når alle utløsende sensorer har meldt false',async()=>{
  const h=harness();h.value('smoke','alarm_smoke',true);h.value('smoke2','alarm_smoke',true);h.update();await h.environment.drain();
  h.event('smoke','alarm_smoke',false);await h.environment.drain();assert(h.environment.current('fire'));assert.equal(pushes(h).length,1);
  h.event('smoke2','alarm_smoke',false);await h.environment.drain();assert(!h.environment.current('fire'));assert.equal(pushes(h).length,2);assert.equal(h.events.filter(([event])=>event==='cleared').length,1);
  h.event('smoke','alarm_smoke',true);await h.environment.drain();assert.equal(h.environment.status().incidents.length,2);
});

test('Kort true/false-signal blir varslet i riktig rekkefølge selv mellom avstemminger',async()=>{
  const h=harness();h.event('water','alarm_water',true);h.event('water','alarm_water',false);await h.environment.drain();
  assert.equal(pushes(h).length,2);assert.match(pushes(h)[0][1].text,/Vannalarm/);assert.match(pushes(h)[1][1].text,/ikke lenger/);assert(!h.environment.current('water'));
});

test('En eldre pågående avlesning kan ikke overskrive en nyere ekte alarmhendelse',async()=>{
  const h=harness();const old=structuredClone(h.snapshot),readStartedAt=h.now();h.event('water','alarm_water',true);h.environment.update(old,{readStartedAt});await h.environment.drain();assert(h.environment.current('water'));assert.equal(pushes(h).length,1);
});

test('Gjentakelse krever fersk aktiv sensor, stoppes av kvittering og gjentar ingen fysiske tiltak',async()=>{
  const h=harness(c=>{Object.assign(c.environment.responses.water,{repeatEnabled:true,repeatSeconds:60,lights:['light'],flows:[{flowType:'normal',flowId:'custom'}]});});
  h.event('water','alarm_water',true);await h.environment.drain();h.advance(60001);h.environment.tick();await h.environment.drain();assert.equal(pushes(h).length,1);
  h.update();await h.environment.drain();assert.equal(pushes(h).length,2);assert.equal(h.calls.filter(c=>c[0]==='set').length,1);assert.equal(h.calls.filter(c=>c[0]==='flow').length,1);
  h.environment.acknowledge(h.environment.current('water').id);assert(h.environment.current('water'));h.advance(120000);h.update();await h.environment.drain();assert.equal(pushes(h).length,2);
  assert.throws(()=>h.environment.acknowledge('old-id'),/ikke lenger aktiv/);
});

test('Omstart beholder hendelsen, bekrefter fersk alarm og gjentar ikke lys/ventil/Flow/opplåsing',async()=>{
  const edit=c=>{c.security.lockDeviceId='lock';Object.assign(c.environment.responses.fire,{lights:['light'],unlockDoor:true,flows:[{flowId:'custom',flowType:'advanced'}]});};
  const h=harness(edit);h.event('smoke','alarm_smoke',true);await h.environment.drain();const saved=h.saved();assert.equal(h.calls.filter(c=>c[0]==='set').length,2);
  const restart=harness(edit,saved,h.now()+120001);restart.value('smoke','alarm_smoke',true);restart.update();await restart.environment.drain();assert(restart.environment.current('fire'));assert.equal(pushes(restart).length,1);assert.equal(restart.calls.filter(c=>['set','flow'].includes(c[0])).length,0);
  restart.update();await restart.environment.drain();assert.equal(pushes(restart).length,1);
});

test('Rask omstart lager ikke et nytt varsel eller historiske fysiske handlinger',async()=>{
  const h=harness();h.event('smoke','alarm_smoke',true);await h.environment.drain();const restart=harness(()=>{},h.saved(),h.now()+1000);restart.value('smoke','alarm_smoke',true);restart.update();await restart.environment.drain();assert(restart.environment.current('fire'));assert.deepEqual(restart.calls,[]);
});

test('Et sakte kamera blokkerer verken neste tekstvarsel eller vannstenging',async()=>{
  const h=harness(c=>{c.environment.responses.fire.imageDeviceIds=['camera'];c.environment.responses.water.shutoff={enabled:true,deviceId:'valve',validated:true};});
  let release,started;const waiting=new Promise(r=>{release=r;}),imageStarted=new Promise(r=>{started=r;});
  h.hooks.emit=async data=>{if(data.notificationType==='image'){started();await waiting;}};
  h.event('smoke','alarm_smoke',true);await imageStarted;h.event('water','alarm_water',true);
  for(let i=0;i<10;i++)await Promise.resolve();
  assert(pushes(h).some(([,data])=>data.context.type==='water'));assert(h.calls.some(c=>c[0]==='set'&&c[1]==='valve'&&c[3]===false));release();await h.environment.drain();
});

test('Vannstyring bekrefter bare elektrisk AV; opphør åpner aldri vannet',async()=>{
  const h=harness(c=>{c.environment.responses.water.shutoff={enabled:true,deviceId:'valve',validated:true};});h.event('water','alarm_water',true);await h.environment.drain();
  const action=h.environment.status().batches.flatMap(b=>b.actions).find(a=>a.control==='water');assert.equal(action.status,'waiting');assert.match(action.detail,/ikke bekreftet/);
  h.value('valve','onoff',false);h.update();const confirmed=h.environment.status().batches.flatMap(b=>b.actions).find(a=>a.control==='water');assert.equal(confirmed.status,'confirmed');assert.match(confirmed.detail,/Ventilposisjon er ikke tilgjengelig/);
  h.event('water','alarm_water',false);await h.environment.drain();assert.deepEqual(h.calls.filter(c=>c[0]==='set'),[['set','valve','onoff',false]]);
});

test('Endret varseloppsett eller avsluttet alarm avbryter usendte fysiske tiltak',async()=>{
  const h=harness(c=>{c.environment.responses.water.shutoff={enabled:true,deviceId:'valve',validated:true};});let release;
  const waiting=new Promise(r=>{release=r;});h.hooks.set=async()=>waiting;
  h.event('water','alarm_water',true);await Promise.resolve();h.config.environment.enabled=false;h.environment.configure();release();await h.environment.drain();assert.equal(h.calls.filter(c=>c[0]==='set').length,0);
});

test('Manglende API-nøkkel gir tydelig leveringsfeil, men tidslinjen fungerer',async()=>{
  const h=harness();h.adapter.direct.ready=false;h.event('water','alarm_water',true);await h.environment.drain();assert.equal(pushes(h).length,0);assert.equal(h.calls.filter(c=>c[0]==='timeline').length,1);assert(h.environment.status().batches.flatMap(b=>b.actions).some(a=>a.status==='failed'&&/API-nøkkel/.test(a.detail)));
});

test('Slettet sensor med aktiv alarm forsvinner ikke fra hendelsen',async()=>{
  const h=harness();h.event('water','alarm_water',true);await h.environment.drain();h.config.environment.sensors=h.config.environment.sensors.filter(s=>s.deviceId!=='water');h.environment.configure();delete h.snapshot.devices.water;h.update();assert(h.environment.current('water'));assert(h.environment.current('water').sensors[0].active);
});

test('Stopp av appen avbryter ventende leveringer',async()=>{
  const h=harness();h.event('smoke','alarm_smoke',true);h.environment.close();await h.environment.drain();assert.equal(pushes(h).length,0);
});

test('Gamle oppsett får deaktivert Brann og vann uten å endre etablerte rutiner',()=>{
  const old=defaults();delete old.environment;const before=structuredClone(old.routines);const c=validate(old);assert.equal(c.environment.enabled,false);assert.deepEqual(c.environment.sensors,[]);assert.deepEqual(c.routines,before);
});

test('Konfigurasjonen avviser feil sensor, duplikater, uvalidert vannstyring og ulovlig opplåsing',()=>{
  for(const edit of [c=>{c.environment.enabled=true;},c=>{c.environment.sensors=[{deviceId:'x',capability:'measure_temperature'}];},c=>{c.environment.sensors=[{deviceId:'x',capability:'alarm_water'},{deviceId:'x',capability:'alarm_water'}];},c=>{c.environment.responses.water.shutoff={enabled:true,deviceId:'valve',validated:false};},c=>{c.environment.responses.water.unlockDoor=true;},c=>{c.environment.responses.fire.repeatSeconds=0;},c=>{c.environment.responses.fire.imageDeviceIds=['1','2','3','4'];}]) {const c=defaults();edit(c);assert.throws(()=>validate(c));}
});

test('Automatisk sensorvalg støtter alarm-underfunksjoner og unngår temperatur-/apparatmålinger',()=>{
  const catalog={devices:{water:{id:'water',name:'Ny vannsensor',zone:'Bad',available:true,capabilities:{'alarm_water.external':{type:'boolean',value:null},measure_temperature:{value:23},measure_battery:{value:80}}},smoke:{id:'smoke',name:'Røyk',capabilities:{alarm_smoke:{type:'boolean',value:false}}},heat:{id:'heat',name:'Varme',capabilities:{alarm_heat:{type:'boolean',value:false}}},temperature:{id:'temperature',name:'Temperatur',capabilities:{measure_temperature:{value:40}}},dishwasher:{id:'dishwasher',name:'Oppvaskmaskin',capabilities:{measure_water:{value:5}}}}};
  const found=settings.discover(catalog);assert.equal(found.length,3);assert.equal(found.find(s=>s.deviceId==='water').temperature,23);assert.equal(settings.label(found.find(s=>s.deviceId==='water')),'Ingen vannalarm rapportert ennå');
});

test('Vannstyring kan ikke bruke lås eller garasjeport som relé',()=>{
  const c=defaults();c.environment.responses.water.shutoff={enabled:true,deviceId:'lock',validated:true};const d={id:'lock',class:'lock',capabilities:{onoff:{type:'boolean',setable:true},locked:{setable:true}}};assert.throws(()=>settings.checkCatalog(c,{devices:{lock:d}}),/egen av\/på-enhet/);
});

test('Brannopplåsing er beskyttet og krever det uttrykkelige valget',()=>{
  const c=defaults();c.security.lockDeviceId='lock';const action={builtin:true,environmentAction:'fire-unlock',category:'lock',deviceId:'lock',capability:'locked',value:false};const {trustedWrite}=require('../lib/action-safety');
  assert.equal(trustedWrite(c,action),false);c.environment.enabled=true;c.environment.responses.fire.unlockDoor=true;assert.equal(trustedWrite(c,action),true);assert.equal(trustedWrite(c,{...action,builtin:false}),false);assert.equal(trustedWrite(c,{...action,deviceId:'other'}),false);
});

test('HomeyAdapter inkluderer miljøsensorer og valgte tiltak selv uten innbruddsalarm',()=>{
  const c=defaults();c.environment.sensors=[{deviceId:'water',capability:'alarm_water'}];c.environment.responses.water.shutoff={enabled:true,deviceId:'valve',validated:true};c.environment.responses.fire.lights=['light'];
  const adapter=new(require('../lib/homey-adapter').HomeyAdapter)({},()=>c);assert(adapter.selectedDevices().includes('water'));assert(adapter.selectedDevices().includes('valve'));assert(adapter.selectedDevices().includes('light'));
});

test('Flow-kort filtrerer alarmtype, deler riktig sensor/rom og kvitterer uten å fjerne sensoralarm',async()=>{
  const h=harness(),cards=new Map(),sent=[];
  const card=id=>{if(!cards.has(id))cards.set(id,{registerRunListener:fn=>cards.get(id).run=fn,trigger:async(tokens,state)=>sent.push({id,tokens,state})});return cards.get(id);};
  const app={environment:h.environment,homey:{flow:{getTriggerCard:card,getConditionCard:card,getActionCard:card}}},flows=require('../lib/environment-flows');flows.register(app);
  assert.equal(await card('environment_alarm_active').run({type:'water'}),false);h.event('water','alarm_water',true);await h.environment.drain();
  await flows.emit(app,'started',h.environment.context(h.environment.current('water')));assert.equal(sent[0].tokens.zone,'Bad');assert.equal(sent[0].tokens.sensor,'Vannsensor');
  assert.equal(await card('environment_alarm_started').run({type:'fire'},sent[0].state),false);assert.equal(await card('environment_alarm_started').run({type:'water'},sent[0].state),true);assert.equal(await card('environment_alarm_active').run({type:'water'}),true);
  await card('environment_acknowledge').run({type:'water'});assert(h.environment.current('water').acknowledgedAt);assert(h.environment.current('water').sensors[0].active);
  await assert.rejects(()=>card('environment_acknowledge').run({type:'fire'}),/Ingen aktiv/);
});

test('Appens sanntidsinngang varsler vann uten å vente på person-/husmodusavlesning',async()=>{
  const Module=require('node:module'),load=Module._load,EventEmitter=require('node:events'),filename=require.resolve('../app');let App;
  try{Module._load=function(id,...args){return id==='homey'?{App:EventEmitter}:load.call(this,id,...args);};delete require.cache[filename];App=require('../app');}finally{Module._load=load;delete require.cache[filename];}
  const h=harness(),app=new App();app.adapter=h.adapter;app.engine=new(require('../lib/engine'))({config:h.config,adapter:h.adapter,clock:h.now});app.environment=h.environment;app.environment.getConfig=()=>app.engine.config;app.environment.configure();
  let reads=0;app.adapter.snapshot=async()=>{reads++;throw Error('Personlesing utilgjengelig');};app.adapter.catalogue={devices:h.snapshot.devices};
  app.receiveSensor('water','alarm_water',true,h.snapshot.devices.water);await app.environment.drain();assert.equal(reads,0);assert.equal(pushes(h).length,1);assert.equal(app.engine.state.mode,'unknown');assert(app.environment.current('water'));
  await require('../api').command({homey:{app},body:{type:'environment-ack',id:app.environment.current('water').id}});assert(app.environment.current('water').acknowledgedAt);
});

test('Brann og vann kommer med i systemstatus uten å merke nye vannverdier som feil',()=>{
  const h=harness(),catalog={devices:h.snapshot.devices,people:{a:{athomId:'a'},b:{athomId:'b'}},direct:{configured:true,ready:true},flows:[]};
  const readiness=require('../lib/readiness')(h.config,h.snapshot,catalog,{},h.now());assert.equal(readiness.checks.find(c=>c.id==='environment-sensors').level,'ready');assert.match(readiness.checks.find(c=>c.id==='environment-sensors').detail,/ingen alarmverdi rapportert ennå/);
  assert(require('../lib/integration-needs')(h.config).types.includes('critical'));
});

test('Manifest-generatoren beholder API-ruter, eldre Flow-kort og alle miljøalarmkort',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module'),filename=path.resolve('scripts/manifest.js'),localRequire=createRequire(filename);let generated;
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:id=>id==='node:fs'?{writeFileSync:(file,value)=>generated=JSON.parse(value)}:localRequire(id)});
  const current=require('../app.json');assert.deepEqual(generated.api,current.api);for(const type of ['actions','conditions','triggers'])assert.deepEqual(generated.flow[type].map(c=>c.id).sort(),current.flow[type].map(c=>c.id).sort());
});

test('API-forbindelse som kommer tilbake varsler en fortsatt aktiv alarm som aldri ble sendt, uten nye fysiske tiltak',async()=>{
  const h=harness(c=>{c.environment.responses.water.shutoff={enabled:true,deviceId:'valve',validated:true};});h.adapter.direct.ready=false;h.environment.tick();h.event('water','alarm_water',true);await h.environment.drain();assert.equal(pushes(h).length,0);assert.equal(h.calls.filter(c=>c[0]==='set').length,1);
  h.adapter.direct.ready=true;h.environment.tick();await h.environment.drain();assert.equal(pushes(h).length,1);assert.equal(h.calls.filter(c=>c[0]==='set').length,1);h.environment.tick();await h.environment.drain();assert.equal(pushes(h).length,1);
});

test('Omstart kan sende et aldri-dispatchet tekstvarsel etter fersk bekreftelse, men gjentar ikke styring',async()=>{
  const h=harness();h.adapter.direct.ready=false;h.event('water','alarm_water',true);await h.environment.drain();const restart=harness(()=>{},h.saved(),h.now()+1000);restart.value('water','alarm_water',true);restart.update();await restart.environment.drain();assert.equal(pushes(restart).length,1);assert.equal(restart.calls.filter(c=>c[0]==='set').length,0);
});

test('Manglende styringsbekreftelse ender som ukjent uten gjentatt vannkommando',async()=>{
  const h=harness(c=>{c.environment.responses.water.shutoff={enabled:true,deviceId:'valve',validated:true};});h.event('water','alarm_water',true);await h.environment.drain();h.advance(60000);h.environment.tick();await h.environment.drain();const action=h.environment.status().batches.flatMap(b=>b.actions).find(a=>a.control==='water');assert.equal(action.status,'unknown');assert.equal(h.calls.filter(c=>c[0]==='set').length,1);
});
