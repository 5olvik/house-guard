'use strict';
const Homey=require('homey');
module.exports=class NightModeDevice extends Homey.Device {
  async onInit() {
    this.stopped=false;this.syncQueue=Promise.resolve();
    this.registerCapabilityListener('onoff',async value=>{
      try{await this.homey.app.setNightMode(value);}
      finally{await this.refreshNightMode();}
    });
    this.unsubscribeNight=this.homey.app.subscribeNightMode(()=>this.refreshNightMode());
    this.syncTimer=this.homey.setInterval(()=>this.refreshNightMode(),5000);
    await this.refreshNightMode();
  }
  syncNightMode() {
    this.syncQueue=this.syncQueue.catch(()=>{}).then(async()=>{
      if(this.stopped)return;
      const value=this.homey.app.getNightMode();
      if(this.getCapabilityValue('onoff')!==value)await this.setCapabilityValue('onoff',value);
      if(!this.stopped)await this.setAvailable();
    });
    return this.syncQueue;
  }
  async refreshNightMode() {
    try{await this.syncNightMode();}
    catch(error){this.error('Nattstatus kunne ikke oppdateres',error);if(!this.stopped)await this.setUnavailable(error.message || this.homey.__('night.unavailable')).catch(e=>this.error(e));}
  }
  onUninit(){this.stopped=true;this.unsubscribeNight?.();if(this.syncTimer)this.homey.clearInterval(this.syncTimer);}
  onDeleted(){this.onUninit();}
};
