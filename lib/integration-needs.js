'use strict';

// Only enabled routines and selected features introduce setup requirements.
module.exports = function integrationNeeds(config) {
  const actions = config.routines.filter(r => r.enabled).flatMap(r => r.actions);
  const notifications = actions.filter(a => a.kind === 'notify');
  const types = new Set(notifications.map(a => a.notificationType || 'normal'));
  const cameras = new Set(notifications.filter(a => a.notificationType === 'image').map(a => a.imageDeviceId).filter(Boolean));
  const confirmationNotices = actions.some(a => ['set', 'verify', 'person', 'garage'].includes(a.kind)) || !!config.security.lockDeviceId || !!config.security.alarmDeviceId;
  if (config.people.notifications.length && confirmationNotices) types.add('normal');
  if (config.security.garage.enabled && config.people.notifications.length) {
    if (config.security.garage.imageDeviceId) { types.add('image'); cameras.add(config.security.garage.imageDeviceId); }
    else types.add('normal');
  }
  return {
    questions: config.night.automatic,
    notifications: types.size > 0,
    types: [...types], cameras: [...cameras],
    audio: actions.filter(a => ['speak', 'sound'].includes(a.kind)),
    events: ['arming', 'activeSensor', 'entryDelay'].filter(id =>
      config.routines.some(r => r.id === id && r.enabled && (r.actions.length || (id === 'arming' && (config.security.lockOnArming || config.security.garage.enabled))))),
  };
};
