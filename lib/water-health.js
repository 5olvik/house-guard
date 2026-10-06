'use strict';
const {randomUUID}=require('node:crypto'),{kind}=require('./environment-config');
const HOUR=3600000,CHECK_INTERVAL=300000;
const SOURCES={measure_temperature:{label:'temperatur',unit:'°C'},rssi:{label:'RSSI',unit:'dBm'},measure_rssi:{label:'RSSI',unit:'dBm'},measure_voltage:{label:'batterispenning',unit:'V'},measure_battery:{label:'batterinivå',unit:'%'}};
const source=id=>SOURCES[id?.split('.')[0]];
const timestamp=(value,now)=>Number.isFinite(value)&&value>0&&value<=now+120000?Math.min(value,now):null;

// This is a measurement-update check, not proof of radio contact or a leak.
// Reading the same cached value never invents a new hardware report time.
class WaterHealth {
  constructor({getConfig,saved={},persist=()=>{},alert=()=>{},clock=Date.now}) {
    this.getConfig=getConfig;this.persist=persist;this.alert=alert;this.clock=clock;
    this.state={sensors:structuredClone(saved.sensors||[]),warning:structuredClone(saved.warning||null),checkedAt:null,settingsSignature:saved.settingsSignature};
    this.lastReadAt=null;this.connected=false;this.configure();
  }
  settings(){return this.getConfig().environment.waterHealth;}
  selected(){return [...new Set(this.getConfig().environment.sensors.filter(s=>kind(s.capability)==='water').map(s=>s.deviceId))];}
  ready(){const c=this.getConfig();return !this.closed&&c.environment.enabled&&!c.observation&&this.settings().enabled&&this.selected().length>0;}
  configure(){
    const ids=this.selected(),now=this.clock();
    const c=this.getConfig(),signature=JSON.stringify([c.environment.enabled,c.observation,this.settings(),ids.slice().sort()]);
    if(signature===this.configSignature)return;
    const compatible=this.state.settingsSignature===signature;
    this.configSignature=signature;this.state.settingsSignature=signature;
    this.state.sensors=this.state.sensors.filter(s=>ids.includes(s.deviceId));
    for(const id of ids)if(!this.state.sensors.some(s=>s.deviceId===id))this.state.sensors.push({deviceId:id,name:'Vannsensor',zone:'Uten rom',firstSeenAt:now,lastSignalAt:null,capability:null,label:null,value:null,unit:null,available:null,support:[],status:'waiting'});
    // Selection/settings changes require a fresh read. Removing a sensor is
    // not evidence that it recovered; do not send a fake recovery notice.
    this.connected=false;this.lastReadAt=null;this.state.checkedAt=null;
    if(this.state.warning&&!compatible){this.state.warning.active=false;this.state.warning=null;}
    this.persist(this.state);
  }
  record(sensor,capability,value,at) {
    if(at===null||!Number.isFinite(value)&&!(capability?.startsWith('alarm_water')&&typeof value==='boolean'))return;
    if(sensor.lastSignalAt!==null&&at<=sensor.lastSignalAt)return;
    const info=source(capability)||{label:'alarmrapport',unit:''};
    Object.assign(sensor,{lastSignalAt:at,capability,label:info.label,unit:info.unit,value});return true;
  }
  update(snapshot){
    if(this.closed)return;
    let advanced=false;
    this.connected=snapshot.connected===true;
    if(this.connected)this.lastReadAt=this.clock();
    for(const sensor of this.state.sensors){
      const d=snapshot.devices?.[sensor.deviceId];if(!d)continue;
      sensor.name=d.name||sensor.name;sensor.zone=d.zone||sensor.zone;sensor.available=d.available!==false;
      const candidates=Object.entries(d.capabilities||{}).filter(([id,c])=>source(id)&&c.getable!==false);
      if(d.available!==false)sensor.support=candidates.map(([id])=>id);
      if(!this.connected||d.available===false)continue;
      // Prefer the freshest eligible report, rather than picking stale
      // temperature while another measurement (e.g. RSSI) is fresh.
      const priority=id=>Object.keys(SOURCES).indexOf(id.split('.')[0]),now=this.clock();
      candidates.sort((a,b)=>(timestamp(b[1].updatedAt,now)||0)-(timestamp(a[1].updatedAt,now)||0)||priority(a[0])-priority(b[0]));
      for(const [capability,c] of candidates)advanced=this.record(sensor,capability,c.value,timestamp(c.updatedAt,now))||advanced;
    }
    this.check(advanced);this.persist(this.state);
  }
  observeEvent(id,capability,value,device){
    const sensor=this.state.sensors.find(s=>s.deviceId===id);
    if(!sensor||this.closed||!source(capability)&&!/^alarm_water(?:\.|$)/.test(capability))return;
    if(!Number.isFinite(value)&&!(typeof value==='boolean'&&capability.startsWith('alarm_water')))return;
    const reportedAt=device?.capabilities?.[capability]?.updatedAt;
    // SDK listeners run on a capability transaction, not on subscription.
    // Honour an explicit transaction time, including historical backfill.
    const at=reportedAt===undefined||reportedAt===null?this.clock():timestamp(reportedAt,this.clock());
    sensor.name=device?.name||sensor.name;sensor.zone=device?.zone||sensor.zone;sensor.available=true;
    this.record(sensor,capability,value,at);
    this.check(true);this.persist(this.state);
  }
  evaluate(sensor){
    const now=this.clock(),age=now-(sensor.lastSignalAt??sensor.firstSeenAt),late=age>=this.settings().thresholdHours*HOUR;
    if(sensor.lastSignalAt===null)return late?(sensor.support.length?'missing':'unsupported'):'waiting';
    return late?'stale':'ok';
  }
  check(force=false){
    if(!this.ready()||!this.connected||this.lastReadAt===null||this.clock()-this.lastReadAt>90000)return;
    if(!force&&this.state.checkedAt!==null&&this.clock()-this.state.checkedAt<CHECK_INTERVAL)return;
    this.state.checkedAt=this.clock();
    for(const sensor of this.state.sensors)sensor.status=this.evaluate(sensor);
    const issues=this.state.sensors.filter(s=>['stale','missing','unsupported'].includes(s.status));
    let warning=this.state.warning;
    if(!issues.length){
      if(warning?.active){warning.active=false;warning.endedAt=this.clock();this.persist(this.state);this.alert({id:warning.id,event:'restored',text:'House Guard: Vannsensorene rapporterer igjen. '+warning.names.join(', '),sensorName:warning.names.join(', '),zone:warning.zones.join(', ')});}
      return;
    }
    const issueKeys=issues.map(s=>s.deviceId+':'+s.status).sort(),changed=!warning?.active||JSON.stringify(issueKeys)!==JSON.stringify(warning.issueKeys);
    if(!warning?.active){warning={id:randomUUID(),active:true,startedAt:this.clock(),lastNoticeAt:null,acknowledgedAt:null,issueKeys:[],names:[],zones:[]};this.state.warning=warning;}
    if(changed)warning.acknowledgedAt=null;
    warning.issueKeys=issueKeys;warning.names=issues.map(s=>s.name);warning.zones=[...new Set(issues.map(s=>s.zone))];
    const hasNewIssue=changed&&(warning.previousKeys===undefined||issueKeys.some(id=>!warning.previousKeys.includes(id)));
    warning.previousKeys=issueKeys;
    const due=warning.lastNoticeAt===null||this.clock()-warning.lastNoticeAt>=this.settings().repeatHours*HOUR;
    if(!warning.acknowledgedAt&&(hasNewIssue||due)){
      warning.lastNoticeAt=this.clock();this.persist(this.state);
      const printable=s=>typeof s.value==='boolean'?(s.value?'sensoren meldte alarm':'sensoren meldte ikke alarm'):s.value+(s.unit?' '+s.unit:'');
      const lines=issues.map(s=>s.lastSignalAt===null?s.name+' · '+s.zone+': ingen egnet rapportert måleoppdatering.':s.name+' · '+s.zone+': '+s.label+' sist oppdatert for '+Math.floor((this.clock()-s.lastSignalAt)/HOUR)+' timer siden ('+printable(s)+').');
      this.alert({id:warning.id,event:'warning',text:'House Guard: Kontroller vannsensorene.\n'+lines.join('\n')+'\nEn gammel måleverdi alene bekrefter ikke at sensoren er offline.',sensorName:warning.names.join(', '),zone:warning.zones.join(', ')});
    }
    this.persist(this.state);
  }
  tick(){this.check();}
  valid(id,event){const w=this.state.warning;return this.ready()&&w?.id===id&&(event==='restored'?!w.active:w.active&&!w.acknowledgedAt);}
  acknowledge(id){const w=this.state.warning;if(!w?.active||w.id!==id)throw Error('Dette kontrollvarselet er ikke lenger aktivt.');w.acknowledgedAt=this.clock();this.persist(this.state);return this.status();}
  status(){return {enabled:this.settings().enabled&&this.selected().length>0,checkedAt:this.state.checkedAt,sensors:this.state.sensors.map(s=>({...structuredClone(s),status:this.ready()?s.status:'paused'})),warning:structuredClone(this.state.warning)};}
  close(){this.closed=true;this.persist(this.state);}
}
module.exports={WaterHealth,HOUR,CHECK_INTERVAL,SOURCES,source,timestamp};
