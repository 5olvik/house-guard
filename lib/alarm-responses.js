'use strict';

const EVENTS = {
  alarm: 'Utløst alarm', arming: 'Tilkoblingsforsinkelse', entryDelay: 'Inngangsforsinkelse',
  activeSensor: 'Aktiv sensor ved tilkobling', alarmOff: 'Alarm avstilt',
};
const TEXT = {
  alarm: 'Innbruddsalarm i {zone}: {reason}',
  arming: 'House Guard kobles til om {seconds} sekunder.',
  entryDelay: 'Du har {seconds} sekunder på å slå av alarmen. {zone}: {reason}',
  activeSensor: 'Aktiv sensor ved tilkobling: {reason}', alarmOff: 'Alarmen er avstilt.',
};
function defaults() {
  return Object.fromEntries(Object.keys(EVENTS).map(id => [id, {
    push: id !== 'arming', critical: false, imageDeviceId: '', text: TEXT[id],
    timeline: false, timelineText: TEXT[id], audio: [], lights: [],
  }]));
}
// Only move actions whose meaning can be represented exactly. Dependencies,
// delays and custom conditions remain visible as extra actions under Alarm.
function migrate(config) {
  if (config.security.responses !== undefined) return false;
  const responses = defaults();
  for (const [id, response] of Object.entries(responses)) {
    const routine = config.routines?.find(r => r.id === id);
    if (!routine) continue;
    // Existing installations retain their chosen notification behaviour.
    response.push = false;
    if (!routine.enabled) continue;
    const claimed = new Set();
    routine.actions = routine.actions.filter(a => {
      if (a.delaySeconds !== 0 || a.onError !== 'continue' || a.dependsOn || a.requireConfirmed || a.condition ||
          routine.actions.some(other => other.dependsOn === a.id)) return true;
      const text = String(a.text || '').replaceAll('Heimdall', 'House Guard');
      if (a.kind === 'notify' && !a.when && !claimed.has('notify') && !(a.alsoTimeline && claimed.has('timeline'))) {
        response.push = a.notificationType !== 'image'; response.critical = a.notificationType === 'critical';
        response.imageDeviceId = a.notificationType === 'image' ? a.imageDeviceId || '' : '';
        response.text = text;
        if (a.alsoTimeline) { response.timeline = true; response.timelineText = text; }
        claimed.add('notify'); return false;
      }
      if (a.kind === 'timeline' && !a.when && !claimed.has('timeline') && !response.timeline) {
        response.timeline = true; response.timelineText = text; claimed.add('timeline'); return false;
      }
      if (['speak','sound'].includes(a.kind) && (!a.when || ['home','away','asleep','awake','night'].includes(a.when))) {
        response.audio.push({ deviceId:a.deviceId, kind:a.kind, text, volume:a.volume, when:a.when || '' }); return false;
      }
      if (a.kind === 'set' && a.category === 'lights' && a.capability === 'onoff' && a.value === true &&
          (!a.when || ['home','away','asleep','awake','night'].includes(a.when))) {
        response.lights.push({deviceId:a.deviceId, when:a.when || '', confirmSeconds:a.confirmSeconds || 60}); return false;
      }
      return true;
    });
  }
  config.security.responses = responses;
  return true;
}
function actions(config, id, context = {}) {
  const r = config.security.responses?.[id];
  if (!r || config.security.alarmDeviceId !== 'house-guard-internal-alarm') return [];
  const result = [], add = (suffix,kind,fields) => result.push({id:`response-${id}-${suffix}`,kind,category:'notification',delaySeconds:0,onError:'continue',...fields});
  // The mandatory bypass notice is emitted by plans.js, even if optional push is off.
  if (!(id === 'activeSensor' && context.bypassed)) {
    if (r.push) add('push','notify',{text:r.text,notificationType:r.critical?'critical':'normal'});
    if (r.imageDeviceId) add('image','notify',{text:r.text,notificationType:'image',imageDeviceId:r.imageDeviceId});
  }
  if (r.timeline) add('timeline','timeline',{text:r.timelineText});
  r.audio.forEach((a,i) => add(`audio-${i}`,a.kind,{deviceId:a.deviceId,text:a.text,volume:a.volume,...(a.when?{when:a.when}:{})}));
  r.lights.forEach((a,i) => add(`light-${i}`,'set',{category:'lights',deviceId:a.deviceId,capability:'onoff',value:true,confirmSeconds:a.confirmSeconds,...(a.when?{when:a.when}:{})}));
  return result;
}
function allActions(config) { return Object.keys(EVENTS).flatMap(id => actions(config,id)); }
module.exports = {EVENTS, defaults, migrate, actions, allActions};
