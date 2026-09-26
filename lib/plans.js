'use strict';

function action(id, kind, category, fields = {}) {
  return { id, kind, category, delaySeconds: 0, onError: 'stop', ...fields };
}

function builtins(id, c, context, facts) {
  const list = [], s = c.security;
  const setAlarm = value => { if (s.alarmDeviceId) list.push(action(`alarm-${value}`, 'set', 'alarm', { deviceId: s.alarmDeviceId, capability: 'homealarm_state', value, confirmSeconds: s.alarmDeviceId==='house-guard-internal-alarm' ? Math.max(60,s.intrusion.exitSeconds+15) : 60 })); };
  const lock = (value, delaySeconds = 0) => {
    if (s.lockDeviceId) list.push(action(value ? 'lock' : 'unlock', 'set', 'lock', { deviceId: s.lockDeviceId, capability: 'locked', value, delaySeconds, confirmSeconds: 60, guardedUnlock: !value }));
  };
  if (id === 'away') { if (s.lockOnArming) lock(true); setAlarm('armed'); }
  if (['home', 'morning', 'firstWake'].includes(id)) setAlarm('disarmed');
  if (id === 'night') {
    if (c.night.markAsleep) for (const personId of c.people.night.filter(id => facts.homeIds.includes(id))) list.push(action(`sleep-${personId}`, 'person', 'people', { personId, value: true }));
    if (s.lockOnArming) lock(true);
    setAlarm('partially_armed');
  }
  if (id === 'morning') for (const personId of c.people.night) list.push(action(`wake-${personId}`, 'person', 'people', { personId, value: false }));
  if (id === 'nightArrival' && c.night.wakeArrival && context.personId) list.push(action('arrival-awake', 'person', 'people', { personId: context.personId, value: false }));
  if (id === 'arrivalUnlock' && s.autoUnlock) lock(false, 30);
  if (id === 'arming') {
    if (s.lockOnArming) lock(true);
    if (s.garage.enabled) list.push(action('garage-close', 'garage', 'garage', { delaySeconds: 20, confirmSeconds: 60, onError: 'continue' }));
  }
  if (id === 'guestOn') {
    if (c.guest.disarmOnEnable) setAlarm('disarmed');
    if (c.guest.unlockOnEnable) lock(false);
    for (const a of list) a.guestExplicit = true;
  }
  if (id === 'guestOff') {
    lock(true);
    if (facts.allAway) setAlarm('armed');
    else if (facts.allHomeAsleep) setAlarm('partially_armed');
  }
  return list.map(a => ({ ...a, builtin: true }));
}
module.exports = { action, builtins };
