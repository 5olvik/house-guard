'use strict';
const { randomUUID } = require('node:crypto');
const ID = 'house-guard-internal-alarm';
const selected = config => config.security.alarmDeviceId === ID;
const fingerprint = config => JSON.stringify([selected(config), config.observation, config.security.intrusion]);
const empty = () => ({ mode:'disarmed', target:null, exitAt:null, entryAt:null, active:false, context:null, faults:[], bypassed:[], lastReadAt:0 });

// House Guard's own sensor state machine. No third-party alarm implementation.
class Intrusion {
  constructor({ config, saved = {}, clock = Date.now, persist = () => {}, emit = () => {}, changed = () => {} }) {
    this.clock=clock;this.persist=persist;this.emit=emit;this.changed=changed;this.config=config;
    this.state = saved.fingerprint === fingerprint(config) ? { ...empty(), ...saved.state, lastReadAt:0 } : empty();
    this.snapshot = {connected:false,devices:{}};
    // An unfinished exit delay does not silently arm the house after restart.
    if(this.state.target) {this.state.target=null;this.state.exitAt=null;this.state.faults=['Tilkobling ble avbrutt ved omstart. Koble til på nytt.'];}
  }
  commit() { this.persist({fingerprint:fingerprint(this.config),state:{...this.state,lastReadAt:0}});this.changed(this.status()); }
  status() { return structuredClone({...this.state,selected:selected(this.config),observation:this.config.observation}); }
  checkConfig(next) {
    if(fingerprint(next)!==fingerprint(this.config) && selected(this.config) && (this.state.mode!=='disarmed' || this.state.target || this.state.active)) throw Error('Frakoble den innebygde alarmen før du endrer sensorer, forsinkelser, alarmvalg eller observasjonsmodus.');
  }
  configure(next) {this.checkConfig(next);if(fingerprint(next)!==fingerprint(this.config))this.state=empty();this.config=next;this.commit();}
  sensors(mode=this.state.mode) { return this.config.security.intrusion.sensors.filter(s=>mode==='armed'?s.full:s.partial); }
  readings(mode) {
    return this.sensors(mode).map(s=>{const d=this.snapshot.devices[s.deviceId],value=d?.capabilities?.[s.capability]?.value;
      return {...s,name:d?.name || s.deviceId,zone:d?.zone || 'Ukjent sone',value:this.snapshot.connected && d?.available!==false && typeof value==='boolean'?value:null};});
  }
  fresh() {return this.snapshot.connected && this.state.lastReadAt>0 && this.clock()-this.state.lastReadAt<=10000;}
  update(snapshot) {
    this.snapshot=snapshot;this.state.lastReadAt=this.clock();
    if(!selected(this.config))return;
    if(this.state.target && this.clock()>=this.state.exitAt)this.finishArming();
    if(this.state.mode!=='disarmed') {
      const readings=this.readings(this.state.mode);
      this.state.faults=readings.filter(s=>s.value===null).map(s=>`Ukjent sensor: ${s.name}`);
      // A sensor excluded at arming rejoins only after a confirmed inactive reading.
      this.state.bypassed=this.state.bypassed.filter(b=>!readings.some(s=>s.deviceId===b.deviceId && s.capability===b.capability && s.value===false));
      if(!this.state.active) {
        const active=readings.filter(s=>s.value===true && !this.state.bypassed.some(b=>b.deviceId===s.deviceId && b.capability===s.capability));
        const immediate=active.find(s=>!s.delay);
        if(immediate)this.alarm(immediate);
        else if(active.length && !this.state.entryAt) {
          const sensor=active[0];this.state.context=this.context(sensor);
          const seconds=this.config.security.intrusion.entrySeconds;
          if(seconds===0)this.alarm(sensor);
          else {this.state.entryAt=this.clock()+seconds*1000;this.emit('entryDelay',{...this.state.context,seconds});}
        }
        // Closing the triggering door does not cancel an entry countdown.
        if(this.state.entryAt && this.clock()>=this.state.entryAt && this.snapshot.connected)this.alarm();
      }
    }
    this.commit();
  }
  mode(mode,snapshot) {
    if(!selected(this.config))throw Error('Velg House Guard innebygd alarm under Sikkerhet først.');
    if(!['disarmed','armed','partially_armed'].includes(mode))throw Error('Ukjent alarmmodus');
    if(mode==='disarmed') {
      const active=this.state.active;this.state=empty();this.commit();if(active)this.emit('alarmOff',{});return;
    }
    if(this.state.active)throw Error('Avstill alarmen før du kobler til igjen.');
    if(this.state.target===mode || this.state.mode===mode && !this.state.target)return;
    this.snapshot=snapshot;this.state.lastReadAt=this.clock();
    const readings=this.readings(mode);
    if(!readings.length)throw Error('Velg minst én sensor for denne alarmmodusen.');
    const bad=readings.filter(s=>s.value===null);
    if(bad.length){const reason=bad.map(s=>`${s.name}: ${s.value===null?'ukjent/utilgjengelig':'aktiv'}`).join(', ');this.state.faults=[reason];this.commit();this.emit('activeSensor',{reason});throw Error(reason);}
    const seconds=this.config.security.intrusion.exitSeconds;
    // Changing from partial to full starts from a known disarmed transition.
    this.state.mode='disarmed';this.state.entryAt=null;this.state.context=null;this.state.faults=[];this.state.bypassed=[];
    this.state.target=mode;this.state.exitAt=this.clock()+seconds*1000;
    this.emit('arming',{seconds});
    if(!seconds)this.finishArming();
    this.commit();
    if(!this.state.target && this.state.mode==='disarmed')throw Error(this.state.faults.join(', ') || 'Alarmen kunne ikke kobles til.');
  }
  finishArming() {
    if(!this.fresh())return;
    const target=this.state.target,readings=this.readings(target),unknown=readings.filter(s=>s.value===null);
    this.state.target=null;this.state.exitAt=null;
    if(unknown.length){const reason=unknown.map(s=>s.name+': ukjent/utilgjengelig').join(', ');this.state.faults=[reason];this.emit('activeSensor',{reason});return;}
    this.state.mode=target;this.state.faults=[];
    this.state.bypassed=readings.filter(s=>s.value===true).map(({deviceId,capability,name,zone})=>({deviceId,capability,name,zone}));
    if(this.state.bypassed.length){
      const reason=this.state.bypassed.map(s=>s.name+' ('+s.zone+')').join(', ');
      this.emit('activeSensor',{bypassed:true,reason,mode:target,sensors:structuredClone(this.state.bypassed)});
    }
  }
  context(sensor) { return {id:randomUUID(),deviceId:sensor.deviceId,capability:sensor.capability,sensorName:sensor.name,zone:sensor.zone,reason:`${sensor.name}: ${sensor.capability==='alarm_contact'?'dør/vindu åpnet':'bevegelse registrert'}`}; }
  alarm(sensor) {
    if(this.state.active)return;
    if(sensor)this.state.context=this.context(sensor);
    this.state.active=true;this.state.entryAt=null;this.commit();this.emit('alarm',{...this.state.context});
  }
  device() {
    return {id:ID,name:'House Guard innebygd alarm',zone:'House Guard',class:'sensor',available:true,alarmContext:this.state.context,alarmTarget:this.state.target,capabilities:{
      homealarm_state:{value:this.state.mode,type:'enum',setable:true,getable:true,title:'Alarmmodus',values:['disarmed','partially_armed','armed'],updatedAt:this.clock()},
      alarm_generic:{value:this.state.active,type:'boolean',setable:false,getable:true,title:'Utløst alarm',updatedAt:this.clock()},
    }};
  }
}
module.exports={Intrusion,ID,selected};
