'use strict';
const Homey = require('homey');

module.exports = class GuestModeDriver extends Homey.Driver {
  async onPairListDevices() {
    return [{
      name: this.homey.__('guest.device_name'),
      // One control for the app's shared guest state. Homey filters paired data IDs.
      data: { id: 'husmodus-guest-mode' },
    }];
  }
};
