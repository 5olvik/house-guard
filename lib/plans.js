'use strict';

function action(id, kind, category, fields = {}) {
  return { id, kind, category, delaySeconds: 0, onError: 'stop', ...fields };
}

function builtins(id, c, context, facts) {
  const list = [], s = c.security;
  if(id==='departureWake' && context.personId)list.push(action('departure-awake','person','people',{personId:context.personId,value:false,onError:'continue'}));
  if(id==='guestNotice' && ['enabled','alone'].includes(context.noticeKind))list.push(action('guest-'+context.noticeKind,'notify','notification',{notificationType:'normal',text:context.noticeKind==='enabled'?'Gjestemodus er på. Huset regnes som bebodd, og alarmen holdes frakoblet.':'Alle beboerne har dratt. Gjestemodus er fortsatt på, så gjestene er hjemme alene. Borterutinen kjøres ikke, og alarmen holdes frakoblet.',onError:'continue'}));
  list.push(...require('./alarm-responses').actions(c,id,context));
  if(id==='activeSensor' && context.bypassed)list.push(action('bypassed-sensor-notice','notify','notification',{notificationType:'normal',text:'Alarmen er tilkoblet. Kontroller disse aktive sensorene: {reason}. De overvåkes automatisk når de blir inaktive.',onError:'continue'}));
  const setAlarm = (value, alarmAutomation=false) => { if (s.alarmDeviceId) list.push(action(`alarm-${value}`, 'set', 'alarm', { deviceId: s.alarmDeviceId, capability: 'homealarm_state', value, alarmAutomation, onError: value === 'disarmed' ? 'stop' : 'continue', confirmSeconds: s.alarmDeviceId==='house-guard-internal-alarm' ? Math.max(60,s.intrusion.exitSeconds+15) : 60 })); };
  const lock = (value, delaySeconds = 0) => {
    if (s.lockDeviceId) list.push(action(value ? 'lock' : 'unlock', 'set', 'lock', { deviceId: s.lockDeviceId, capability: 'locked', value, delaySeconds, confirmSeconds: 60, guardedUnlock: !value }));
  };
  if (id === 'away') { if (s.lockOnArming) lock(true); if(s.automation.away)setAlarm('armed',true); }
  if (['home', 'morning', 'firstWake'].includes(id) && (s.automation[id] || id==='morning' && context.source==='motion')) setAlarm('disarmed',true);
  if (id === 'night') {
    if (c.night.markAsleep) for (const personId of c.people.night.filter(id => facts.homeIds.includes(id))) list.push(action(`sleep-${personId}`, 'person', 'people', { personId, value: true, onError:'continue' }));
    if (s.lockOnArming) lock(true);
    if(s.automation.night)setAlarm('partially_armed',true);
  }
  if (id === 'morning') for (const personId of context.source==='motion' ? c.people.presence : c.people.night) list.push(action(`wake-${personId}`, 'person', 'people', { personId, value: false, onError:'continue' }));
  if (id === 'nightArrival' && c.night.wakeArrival && context.personId) {
    if(s.automation.home)setAlarm('disarmed',true);
    list.push(action('arrival-awake', 'person', 'people', { personId: context.personId, value: false, onError:'continue' }));
  }
  if (id === 'arrivalUnlock' && s.autoUnlock) lock(false, 30);
  if (id === 'arming') {
    if (s.lockOnArming) lock(true);
    if (s.garage.enabled) list.push(action('garage-close', 'garage', 'garage', { delaySeconds: 20, confirmSeconds: 60, onError: 'continue' }));
  }
  return list.map(a => ({ ...a, builtin: true }));
}
module.exports = { action, builtins };
