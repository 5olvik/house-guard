'use strict';

// Only enabled routines and selected features introduce setup requirements.
module.exports = function integrationNeeds(config) {
  const actions = [...require('./guest-presence').activeRoutines(config).flatMap(r => r.actions), ...require('./alarm-responses').allActions(config)];
  const notifications = actions.filter(a => a.kind === 'notify');
  const types = new Set(notifications.map(a => a.notificationType || 'normal'));
  if(config.people.notifications.length)types.add('normal'); // Built-in guest notices.
  const cameras = new Set(notifications.filter(a => a.notificationType === 'image').map(a => a.imageDeviceId).filter(Boolean));
  const environmental = config.environment?.enabled ? [...new Set(config.environment.sensors.map(s => require('./environment-config').kind(s.capability)))].map(type => config.environment.responses[type]) : [];
  for (const r of environmental) {
    if (r.push) types.add(r.critical ? 'critical' : 'normal');
    if (r.restoredPush) types.add('normal');
    if (r.imageDeviceIds.length) types.add('image');
    for (const id of r.imageDeviceIds) cameras.add(id);
  }
  const health=config.environment?.waterHealth;
  if(config.environment?.enabled&&health?.enabled&&config.environment.sensors.some(s=>require('./environment-config').kind(s.capability)==='water')){
    if(health.push)types.add(health.critical?'critical':'normal');if(health.restoredPush)types.add('normal');
  }
  const confirmationNotices = actions.some(a => ['set', 'verify', 'person', 'garage'].includes(a.kind)) || !!config.security.lockDeviceId || !!config.security.alarmDeviceId;
  if ((config.people.notifications.length && confirmationNotices) || config.security.alarmDeviceId==='house-guard-internal-alarm') types.add('normal');
  if (config.security.garage.enabled && config.people.notifications.length) {
    if (config.security.garage.imageDeviceId) { types.add('image'); cameras.add(config.security.garage.imageDeviceId); }
    else types.add('normal');
  }
  return {
    questions: config.night.automatic,
    notifications: types.size > 0,
    types: [...types], cameras: [...cameras],
    audio: [...actions.filter(a => ['speak', 'sound'].includes(a.kind)), ...environmental.flatMap(r => r.audio)],
    events: ['arming', 'activeSensor', 'entryDelay'].filter(id =>
      (id === 'arming' && (config.security.lockOnArming || config.security.garage.enabled)) || config.routines.some(r => r.id === id && r.enabled && r.actions.length)),
  };
};
