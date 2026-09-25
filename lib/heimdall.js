'use strict';

const APP_ID = 'com.uc.heimdall';

function decode(event, value) {
  if (event === 'Alarm Status' && typeof value === 'boolean') return { type: value ? 'alarm' : 'alarmOff', payload: {} };
  if (['Arming Delay', 'Alarm Delay'].includes(event) && Number.isFinite(value) && value >= 0 && value <= 3600) {
    return { type: event === 'Arming Delay' ? 'arming' : 'entryDelay', payload: { seconds: value } };
  }
  if (event === 'Sensor State at Arming' && value === 'Active') return { type: 'activeSensor', payload: { reason: 'En sensor er aktiv. Åpne Heimdall for detaljer.' } };
  return null;
}

class Heimdall {
  constructor(homey, { selected, onEvent }) {
    this.homey = homey; this.selected = selected; this.onEvent = onEvent;
    this.status = { state: 'off', version: null, lastEventAt: null };
    this.listeners = []; this.closed = false; this.generation = 0;
  }
  async refresh() {
    if (this.closed) return;
    if (!this.selected()) { this.generation++; this.status.state = 'off'; return; }
    if (this.checking) return this.checking;
    const generation = this.generation;
    this.checking = (async () => {
      try {
        if (!this.client) {
          this.client = this.homey.api.getApiApp(APP_ID);
          const listen = (event, handler) => { this.client.on(event, handler); this.listeners.push([event, handler]); };
          listen('uninstall', () => { this.generation++; this.status.state = 'unavailable'; });
          listen('install', () => { this.refresh().catch(() => {}); });
          listen('realtime', (event, data) => {
            if (this.closed || !this.selected() || this.status.state !== 'connected') return;
            const decoded = decode(event, data); if (!decoded) return;
            this.status.lastEventAt = Date.now();
            Promise.resolve(this.onEvent(decoded.type, decoded.payload)).catch(error => this.homey.app.error('Heimdall-hendelse', error.message));
          });
        }
        const installed = await this.client.getInstalled();
        const version = installed ? await this.client.getVersion() : null;
        if (this.closed || generation !== this.generation || !this.selected()) return;
        this.status = { ...this.status, checkedAt: Date.now(), version, state: !installed ? 'unavailable' : /^2\.\d+\.\d+$/.test(version || '') ? 'connected' : 'unsupported', error: null };
      } catch (error) {
        if (!this.closed && generation === this.generation) this.status = { ...this.status, checkedAt: Date.now(), state: 'unavailable', error: String(error.message).slice(0, 200) };
      }
    })().finally(() => { this.checking = null; });
    return this.checking;
  }
  close() {
    this.closed = true; this.generation++;
    for (const [event, handler] of this.listeners) this.client.removeListener(event, handler);
    this.listeners = [];
    this.client?.unregister();
    this.status.state = 'off';
  }
}

module.exports = { Heimdall, decode, APP_ID };
