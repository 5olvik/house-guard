'use strict';

const OWN = 'homey:app:no.husmodus:', MOBILE = 'homey:manager:mobile:', HEIMDALL = 'homey:app:com.uc.heimdall:';
const fullId = card => card?.id?.startsWith('homey:') ? card.id : `${card?.uri || card?.ownerUri}:${card?.id}`;
const token = (key, name) => `[[trigger::${key}::${name}]]`;

function collect(flows, advanced) {
  return [...Object.values(flows).map(f => ({ id: f.id, enabled: f.enabled, broken: f.broken, type: 'normal', trigger: f.trigger, conditions: f.conditions, actions: f.actions })),
    ...Object.values(advanced).map(f => ({ id: f.id, enabled: f.enabled, broken: f.broken, type: 'advanced', cards: f.cards }))]
    .filter(f => f.enabled !== false && !f.broken && (f.type === 'advanced' ? Object.values(f.cards || {}) : [f.trigger, ...(f.actions || []), ...(f.conditions || [])]).some(c => fullId(c).startsWith(OWN)));
}

function legacyRoutes(catalog) {
  const routes = [];
  for (const flow of catalog.integrationFlows || []) {
    if (flow.type !== 'advanced' || flow.enabled === false || flow.broken) continue;
    const cards = flow.cards || {}, children = (card, edge) => (card?.[edge] || []).map(key => [key, cards[key]]).filter(([, c]) => c);
    for (const [rootKey, root] of Object.entries(cards).filter(([, c]) => fullId(c) === OWN + 'delivery_requested')) {
      for (const [, filter] of children(root, 'outputSuccess').filter(([, c]) => fullId(c) === OWN + 'delivery_matches')) {
        const a = filter.args || {}, recipient = a.expected_person || a.expected_target;
        if (['delivery_id','kind','person_id','target_id','notification_type','camera_id','text'].some(name => a[name] !== token(rootKey, name))) continue;
        const receipt = (from, edge, result) => children(from, edge).some(([, c]) => fullId(c) === OWN + 'delivery_result' && c.args?.delivery_id === token(rootKey, 'delivery_id') && c.args?.recipient_id === recipient && c.args?.result === result);
        for (const [, output] of children(filter, 'outputTrue')) {
          const b = output.args || {};
          if (a.expected_kind === 'question' && fullId(output) === MOBILE + 'push_confirm' && b.user?.id === recipient && b.text === token(rootKey, 'text')) {
            const valid = [['outputTrue','yes'],['outputFalse','no'],['outputError','error']].every(([edge, answer]) => children(output, edge).some(([, c]) => fullId(c) === OWN + 'night_answer' && c.args?.request_id === token(rootKey, 'request_id') && c.args?.person_id === recipient && c.args?.answer === answer && receipt(c, 'outputSuccess', answer === 'error' ? 'failed' : 'accepted')));
            if (valid) routes.push(a);
          } else if (a.expected_kind === 'notify') {
            const id = {normal:'push_text',critical:'push_text_critical',image:'push_image'}[a.expected_type];
            if (id && fullId(output) === MOBILE + id && b.user?.id === recipient && b.text === token(rootKey, 'text') && receipt(output, 'outputSuccess', 'accepted') && (a.expected_type !== 'image' || output.droptoken?.startsWith(`homey:device:${a.expected_camera}|image-camera-`))) routes.push(a);
          } else if (['speak','sound'].includes(a.expected_kind)) {
            const suffix = a.expected_kind === 'speak' ? 'tts' : 'sound';
            if (fullId(output) === `homey:device:${recipient}:cloud_play_${suffix}` && b.volume === token(rootKey, 'volume') && (suffix === 'tts' ? b.text === token(rootKey, 'text') : b.sound?.id === a.expected_text || b.sound?.name === a.expected_text) && receipt(output, 'outputSuccess', 'accepted')) routes.push(a);
          }
        }
      }
    }
  }
  return routes;
}

function eventTypes(catalog) {
  const events = new Set();
  const types = { AlarmActivated:'alarm', AlarmDeactivated:'alarmOff', ArmDelayActivated:'arming', AlarmDelayActivated:'entryDelay', sensorActiveAtArming:'activeSensor' };
  const matches = (card,type) => fullId(card) === OWN + 'integration_event' ? card.args?.type === type : fullId(card) === OWN + ({alarm:'report_alarm_details',entryDelay:'report_entry_delay',activeSensor:'report_sensor_warning'}[type]);
  for (const f of catalog.integrationFlows || []) {
    if (f.enabled === false || f.broken) continue;
    if (f.type === 'advanced') {
      for (const source of Object.values(f.cards || {})) {
        const type = types[fullId(source).slice(HEIMDALL.length)];
        if (!fullId(source).startsWith(HEIMDALL) || !type) continue;
        if ((source.outputSuccess || []).some(key => matches(f.cards[key],type))) events.add(type);
      }
    } else {
      const type = fullId(f.trigger).startsWith(HEIMDALL) && types[fullId(f.trigger).slice(HEIMDALL.length)];
      if (type && !(f.conditions || []).length && (f.actions || []).some(c => matches(c,type) && c.group !== 'else')) events.add(type);
    }
  }
  return [...events];
}

module.exports = { collect, legacyRoutes, eventTypes, fullId, OWN };
