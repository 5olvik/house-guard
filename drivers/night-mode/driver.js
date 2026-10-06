'use strict';
const Homey=require('homey');
module.exports=class NightModeDriver extends Homey.Driver {
  async onPairListDevices(){return [{name:this.homey.__('night.device_name'),data:{id:'house-guard-night-mode'}}];}
};
