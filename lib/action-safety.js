'use strict';
const lockCapability = capability => /^(locked|lock_unlock_open)(\.|$)/.test(capability || '');
function protectedWrite(config, deviceId, capability, device = {}) {
  const caps = Array.isArray(device.capabilities) ? Object.fromEntries(device.capabilities.map(id => [id,true])) : device.capabilities || device.capabilitiesObj || {};
  return lockCapability(capability) || capability === 'homealarm_state'
    || (deviceId && [config.security.lockDeviceId, config.security.garage.commandDeviceId].includes(deviceId))
    || device.class === 'lock' || !!caps.locked || !!caps.lock_unlock_open;
}
function trustedWrite(config, action) {
  if (!action.builtin) return false;
  if (action.kind === 'garage') return action.deviceId === config.security.garage.commandDeviceId && action.capability === config.security.garage.commandCapability;
  if (action.deviceId === config.security.lockDeviceId && action.capability === 'locked') return action.category === 'lock' && typeof action.value === 'boolean' && (action.value || action.guardedUnlock === true);
  return action.deviceId === config.security.alarmDeviceId && action.capability === 'homealarm_state' && action.category === 'alarm' && ['armed', 'disarmed', 'partially_armed'].includes(action.value);
}
module.exports = { protectedWrite, trustedWrite };
