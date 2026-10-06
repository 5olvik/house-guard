'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{defaults,validate}=require('../lib/config');
const {WaterHealth,HOUR,CHECK_INTERVAL}=require('../lib/water-health');
const Environment=require('../lib/environment');
function fixture(edit=()=>{},saved={},start=Date.parse('2026-10-06T12:00:00Z')){
  let now=start,persisted;const c=defaults();c.observation=false;c.environment.enabled=true;c.environment.sensors=[{deviceId:'water',capability:'alarm_water'}];c.people.notifications=['selected'];edit(c);validate(c);
  const alerts=[],snapshot={connected:true,devices:{water:{id:'water',name:'Vannsensor',zone:'Bad',available:true,capabilities:{alarm_water:{value:null,type:'boolean',updatedAt:null},measure_temperature:{value:23,type:'number',updatedAt:now}}}}};
  const h=new WaterHealth({getConfig:()=>c,saved,clock:()=>now,persist:s=>{persisted=structuredClone(s);},alert:n=>alerts.push(n)});
  return {h,c,snapshot,alerts,now:()=>now,advance:ms=>{now+=ms;},update:()=>h.update(structuredClone(snapshot)),saved:()=>persisted};
}

test('Null vannalarm med fersk temperatur er frisk for rapportkontrollen',()=>{
  const x=fixture();x.update();assert.equal(x.h.status().sensors[0].status,'ok');assert.equal(x.h.status().sensors[0].label,'temperatur');assert.deepEqual(x.alerts,[]);
});

test('Grensen er 24 timer og gjentatt polling av samme verdi fornyer ikke livstegnet',()=>{
  const x=fixture();x.update();const at=x.h.status().sensors[0].lastSignalAt;x.advance(24*HOUR-1);x.update();assert.equal(x.alerts.length,0);assert.equal(x.h.status().sensors[0].lastSignalAt,at);
  x.advance(1);x.h.check(true);assert.equal(x.alerts.length,1);assert.match(x.alerts[0].text,/24 timer/);assert.equal(x.h.status().sensors[0].status,'stale');
});

test('Kontrollen skjer hvert femte minutt, uten en daglig Homey-Flow',()=>{
  const x=fixture();x.update();const first=x.h.status().checkedAt;x.advance(CHECK_INTERVAL-1);x.update();assert.equal(x.h.status().checkedAt,first);x.advance(1);x.update();assert.equal(x.h.status().checkedAt,x.now());
});

test('Fersk RSSI overstyrer gammel temperatur; underfunksjoner og like timestamps støttes',()=>{
  const x=fixture();x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-26*HOUR;x.snapshot.devices.water.capabilities['rssi.radio']={value:-67,type:'number',updatedAt:x.now()};x.update();assert.equal(x.h.status().sensors[0].status,'ok');assert.equal(x.h.status().sensors[0].label,'RSSI');
  const same=fixture();same.snapshot.devices.water.capabilities={alarm_water:{value:null},measure_battery:{value:80,updatedAt:same.now()},measure_temperature:{value:21,updatedAt:same.now()}};same.update();assert.equal(same.h.status().sensors[0].label,'temperatur');
});

for(const capability of ['rssi','measure_rssi','measure_voltage','measure_battery'])test('Alternative målekilde '+capability+' støttes uten temperatur',()=>{
  const x=fixture();delete x.snapshot.devices.water.capabilities.measure_temperature;x.snapshot.devices.water.capabilities[capability]={value:capability.includes('rssi')?-60:3,updatedAt:x.now()};x.update();assert.equal(x.h.status().sensors[0].status,'ok');assert.equal(x.alerts.length,0);
});

test('En reell rapport med uendret verdi fornyer kontrollen, men historisk hendelse gjør det ikke',()=>{
  const x=fixture();x.update();x.advance(23*HOUR);x.update();const d=x.snapshot.devices.water;d.capabilities.measure_temperature.updatedAt=x.now();x.h.observeEvent('water','measure_temperature',23,d);assert.equal(x.h.status().sensors[0].lastSignalAt,x.now());
  x.advance(2*HOUR);x.update();assert.equal(x.alerts.length,0);const at=x.h.status().sensors[0].lastSignalAt;d.capabilities.measure_temperature.updatedAt=at-HOUR;x.h.observeEvent('water','measure_temperature',23,d);assert.equal(x.h.status().sensors[0].lastSignalAt,at);
});

test('Ugyldige, fremtidige og manglende timestamps gir ikke falsk friskstatus',()=>{
  for(const at of [null,NaN,Infinity,Date.parse('2099-01-01T00:00Z')]){const x=fixture();x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=at;x.update();assert.equal(x.h.status().sensors[0].status,'waiting');x.advance(24*HOUR);x.update();assert.equal(x.h.status().sensors[0].status,'missing');assert.equal(x.alerts.length,1);}
});

test('Nye sensorer uten første måledata får en hel frist før samlet kontrollvarsel',()=>{
  const x=fixture();x.snapshot.devices.water.capabilities={alarm_water:{value:null}};x.update();assert.deepEqual(x.alerts,[]);x.advance(24*HOUR-1);x.update();assert.equal(x.alerts.length,0);x.advance(1);x.h.check(true);assert.equal(x.alerts.length,1);assert.equal(x.h.status().sensors[0].status,'unsupported');
});

test('Flere kontrollbehov samles i ett varsel, og bare valgte vannsensorer kontrolleres',()=>{
  const x=fixture(c=>{c.environment.sensors.push({deviceId:'water2',capability:'alarm_water.external'},{deviceId:'fire',capability:'alarm_smoke'});});
  x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;
  x.snapshot.devices.water2={id:'water2',name:'Vannsensor 2',zone:'Kjøkken',available:true,capabilities:{'alarm_water.external':{value:null},measure_battery:{value:90,updatedAt:x.now()-26*HOUR}}};
  x.snapshot.devices.unselected={id:'unselected',name:'Ikke valgt',capabilities:{alarm_water:{value:false},measure_temperature:{value:20,updatedAt:x.now()-30*HOUR}}};
  x.update();assert.equal(x.alerts.length,1);assert.match(x.alerts[0].text,/Vannsensor 2/);assert(!x.alerts[0].text.includes('Ikke valgt'));assert.equal(x.h.status().sensors.length,2);
});

test('Daglig gjentakelse begrenses og kvittering stanser den uten å skjule kontrollbehovet',()=>{
  const x=fixture();x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;x.update();const warning=x.h.status().warning;x.advance(23*HOUR);x.update();assert.equal(x.alerts.length,1);x.advance(HOUR);x.update();assert.equal(x.alerts.length,2);x.h.acknowledge(warning.id);x.advance(48*HOUR);x.update();assert.equal(x.alerts.length,2);assert(x.h.status().warning.active);assert.throws(()=>x.h.acknowledge('old'),/ikke lenger aktivt/);
});

test('Fersk rapport løser kontrollbehovet, uten å kalle det bekreftet tørr sensor',()=>{
  const x=fixture();x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;x.update();x.advance(1000);x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now();x.update();assert.equal(x.alerts.length,2);assert.equal(x.alerts[1].event,'restored');assert.equal(x.h.status().warning.active,false);assert.equal(x.snapshot.devices.water.capabilities.alarm_water.value,null);
});

test('Omstart bevarer siste rapport og varselkvittering uten ny duplikatmelding',()=>{
  const x=fixture();x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;x.update();x.h.acknowledge(x.h.status().warning.id);const restart=fixture(()=>{},x.saved(),x.now()+HOUR);restart.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;restart.update();assert.equal(restart.alerts.length,0);assert(restart.h.status().warning.acknowledgedAt);assert.equal(restart.h.status().sensors[0].lastSignalAt,x.now()-25*HOUR);
  const unack=fixture();unack.snapshot.devices.water.capabilities.measure_temperature.updatedAt=unack.now()-25*HOUR;unack.update();const again=fixture(()=>{},unack.saved(),unack.now()+HOUR);again.snapshot.devices.water.capabilities.measure_temperature.updatedAt=unack.now()-25*HOUR;again.update();assert.equal(again.alerts.length,0);
});

test('API-frakobling eller manglende fersk avlesning gir ikke en ny sensorfeil',()=>{
  const x=fixture();x.update();x.advance(25*HOUR);x.h.tick();assert.equal(x.alerts.length,0);x.snapshot.connected=false;x.update();assert.equal(x.alerts.length,0);x.snapshot.connected=true;x.update();assert.equal(x.alerts.length,1);
});

for(const option of ['monitoring','health','observation'])test('Ingen varsel når '+option+' er av eller under oppsett',()=>{
  const x=fixture(c=>{if(option==='monitoring')c.environment.enabled=false;else if(option==='health')c.environment.waterHealth.enabled=false;else c.observation=true;});x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;x.update();x.h.tick();assert.equal(x.alerts.length,0);assert.equal(x.h.status().sensors[0].status,'paused');
});

test('Fjerning av valgt sensor er en oppsettsendring, ikke en falsk gjenopprettingsmelding',()=>{
  const x=fixture();x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;x.update();x.c.environment.sensors=[];x.h.configure();x.update();assert.equal(x.alerts.length,1);assert.equal(x.h.status().warning,null);
});

test('Polling av alarm_water=false teller ikke som livstegn; reelt alarmrapport-event gjør det',()=>{
  const x=fixture();x.snapshot.devices.water.capabilities={alarm_water:{value:false,updatedAt:x.now()}};x.update();assert.equal(x.h.status().sensors[0].lastSignalAt,null);x.h.observeEvent('water','alarm_water',false,x.snapshot.devices.water);assert.equal(x.h.status().sensors[0].lastSignalAt,x.now());x.advance(25*HOUR);x.update();assert.match(x.alerts[0].text,/sensoren meldte ikke alarm/);
});

test('Endret grense bruker fersk vurdering, og grensene/typer valideres',()=>{
  const x=fixture();x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;x.update();x.c.environment.waterHealth.thresholdHours=48;x.h.configure();x.update();assert.equal(x.h.status().sensors[0].status,'ok');assert.equal(x.alerts.length,1);
  const old=defaults();delete old.environment.waterHealth;assert.equal(validate(old).environment.waterHealth.thresholdHours,24);
  for(const edit of [c=>{c.environment.waterHealth.thresholdHours=0;},c=>{c.environment.waterHealth.repeatHours=721;},c=>{c.environment.waterHealth.critical='true';}]){const c=defaults();edit(c);assert.throws(()=>validate(c));}
});

function integrated(){
  const x=fixture(c=>{c.environment.responses.water.shutoff={deviceId:'valve',enabled:true,validated:true};c.environment.responses.water.audio=[{kind:'speak',deviceId:'speaker',text:'Alarm',volume:35}];c.environment.responses.water.lights=['light'];c.environment.responses.water.flows=[{flowType:'normal',flowId:'physical'}];}),calls=[],hooks={};
  x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now()-25*HOUR;
  const adapter={direct:{ready:true},emit:async(data,guard,dispatch)=>{await hooks.emit?.(data);if(!guard())throw Error('Avbrutt');dispatch();calls.push(['emit',structuredClone(data)]);},timeline:async(text,guard,dispatch)=>{if(!guard())throw Error('Avbrutt');dispatch();calls.push(['timeline',text]);},set:async(id,cap,value,guard,dispatch)=>{if(!guard())throw Error('Avbrutt');dispatch();calls.push(['set',id,cap,value]);},startFlow:async(...args)=>calls.push(['flow',...args])};
  const e=new Environment({getConfig:()=>x.c,adapter,clock:x.now});return {...x,e,calls,hooks};
}

test('Integrert kontroll gir normal push bare til valgte mottakere, og ingen lekkasje/lyd/lys/ventil/Flow',async()=>{
  const x=integrated();x.e.update(x.snapshot);await x.e.drain();const pushes=x.calls.filter(([kind])=>kind==='emit');assert.equal(pushes.length,1);assert.equal(pushes[0][1].notificationType,'normal');assert.deepEqual(pushes[0][1].recipients,['selected']);assert.equal(x.e.status().incidents.length,0);assert(!x.calls.some(c=>['set','flow'].includes(c[0])));assert(x.calls.every(([kind,data])=>kind!=='emit'||data.kind==='notify'));
});

test('Kritisk kontrollvarsel er eget valg og gjenopprettingspush er valgfri',async()=>{
  const x=integrated();x.c.environment.waterHealth.critical=true;x.c.environment.waterHealth.restoredPush=true;x.e.configure();x.e.update(x.snapshot);await x.e.drain();assert.equal(x.calls.find(c=>c[0]==='emit')[1].notificationType,'critical');
  x.advance(1000);x.snapshot.devices.water.capabilities.measure_temperature.updatedAt=x.now();x.e.update(x.snapshot);await x.e.drain();assert.equal(x.calls.filter(c=>c[0]==='emit').at(-1)[1].notificationType,'normal');
});

test('En treg kontrollmelding forsinker ikke ekte vannalarm eller valgt vannstenging',async()=>{
  const x=integrated();let started,release;const active=new Promise(r=>{started=r;}),wait=new Promise(r=>{release=r;});x.hooks.emit=async data=>{if(data.context.reason==='Kontroll av vannsensorer'){started();await wait;}};
  x.e.update(x.snapshot);await active;x.snapshot.devices.water.capabilities.alarm_water.value=true;x.e.observeEvent('water','alarm_water',true,x.snapshot.devices.water);for(let i=0;i<15;i++)await Promise.resolve();assert(x.calls.some(([kind,data])=>kind==='emit'&&data.context.reason==='Vannalarm'));assert(x.calls.some(c=>c[0]==='set'&&c[1]==='valve'&&c[3]===false));release();await x.e.drain();
});

test('Oppsettsendring avbryter usendt kontrollvarsel før API-dispatch',async()=>{
  const x=integrated();let release,started;const wait=new Promise(r=>{release=r;}),active=new Promise(r=>{started=r;});x.hooks.emit=async()=>{started();await wait;};x.e.update(x.snapshot);await active;x.c.environment.waterHealth.enabled=false;x.e.configure();release();await x.e.drain();assert.equal(x.calls.filter(c=>c[0]==='emit').length,0);
});
