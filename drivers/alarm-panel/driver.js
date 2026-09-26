'use strict';
const Homey=require('homey');
module.exports=class AlarmPanelDriver extends Homey.Driver {
  async onPairListDevices(){return [{name:this.homey.__('alarm.device_name'),data:{id:'house-guard-alarm-panel'}}];}
};
