'use strict';
const Homey = require('homey');

module.exports = class GuestModeDevice extends Homey.Device {
  async onInit() {
    this.stopped = false;
    this.syncQueue = Promise.resolve();
    this.registerCapabilityListener('onoff', async value => {
      await this.homey.app.setGuestMode(value);
      await this.syncGuestMode();
    });
    this.unsubscribeGuest = this.homey.app.subscribeGuestMode(() => this.refreshGuestMode());
    // Also retries a failed capability update or an app that was still starting.
    this.syncTimer = this.homey.setInterval(() => this.refreshGuestMode(), 30000);
    await this.refreshGuestMode();
  }

  syncGuestMode() {
    // Serialize writes and read the current source of truth inside the queue.
    // Fast toggles must not leave an older asynchronous write visible last.
    this.syncQueue = this.syncQueue.catch(() => {}).then(async () => {
      if (this.stopped) return;
      const value = this.homey.app.getGuestMode();
      if (this.getCapabilityValue('onoff') !== value) await this.setCapabilityValue('onoff', value);
      if (!this.stopped) await this.setAvailable();
    });
    return this.syncQueue;
  }

  async refreshGuestMode() {
    try { await this.syncGuestMode(); }
    catch (error) {
      this.error('Gjestestatus kunne ikke oppdateres', error);
      if (!this.stopped) await this.setUnavailable(this.homey.__('guest.unavailable')).catch(error => this.error(error));
    }
  }

  onUninit() {
    this.stopped = true;
    this.unsubscribeGuest?.();
    if (this.syncTimer) this.homey.clearInterval(this.syncTimer);
  }
  onDeleted() { this.onUninit(); }
};
