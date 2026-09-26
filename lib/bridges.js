'use strict';
const { randomUUID } = require('node:crypto');
const OWN = 'homey:app:no.husmodus:', MOBILE = 'homey:manager:mobile:';
const token = (id, name) => `[[trigger::${id}::${name}]]`;

// Build from public card metadata before making any changes on Homey.
function build(config, people, devices, metadata, sounds = {}) {
  const available = type => Object.values(metadata[type] || {});
  const requireCard = (type, id) => {
    const card = available(type).find(c => c.id === id);
    if (!card) throw new Error(`Flow-kort mangler: ${id}`);
    return card;
  };
  const graph = name => {
    const flow = { name, enabled: true, cards: {} };
    return { flow, add(type, id, args = {}, x = 0, y = 0, extra = {}) {
      requireCard(`${type}s`, id);
      const key = randomUUID(); flow.cards[key] = { type, id, ownerUri: id.slice(0, id.lastIndexOf(':')), args, x, y, ...extra }; return key;
    }, link(from, output, ...to) { flow.cards[from][output] = [...(flow.cards[from][output] || []), ...to]; } };
  };
  const outgoing = graph('House Guard – levering');
  const t = outgoing.add('trigger', OWN + 'delivery_requested');
  if (!requireCard('triggers', OWN + 'delivery_requested').tokens.some(t => (t.id || t.name) === 'delivery_id')) throw new Error('Installer ny House Guard-versjon før koblingene opprettes');
  let row = 0;
  function route(kind, { person = '', target = '', type = '', camera = '', text = '' } = {}) {
    const y = row++ * 300, args = { expected_kind: kind, expected_person: person, expected_target: target, expected_type: type, expected_camera: camera, expected_text: text };
    for (const name of ['delivery_id','kind','person_id','target_id','notification_type','camera_id','text']) args[name] = token(t, name);
    const condition = outgoing.add('condition', OWN + 'delivery_matches', args, 380, y);
    outgoing.link(t, 'outputSuccess', condition); return { condition, y, recipient: person || target };
  }
  function receipt(r, from, output, result, detail) {
    const id = outgoing.add('action', OWN + 'delivery_result', { delivery_id: token(t, 'delivery_id'), recipient_id: r.recipient, result, detail }, 1600, r.y + (result === 'failed' ? 120 : 0));
    outgoing.link(from, output, id);
  }
  const person = id => { if (!people[id] || people[id].enabled === false) throw new Error(`Mottakeren ${id} er utilgjengelig`); return { id, name: people[id].name }; };
  const allActions = config.routines.flatMap(r => r.actions);
  for (const id of config.people.questions) {
    const r = route('question', { person: id });
    const question = outgoing.add('condition', MOBILE + 'push_confirm', { user: person(id), text: token(t, 'text') }, 800, r.y);
    outgoing.link(r.condition, 'outputTrue', question);
    for (const [index, [output, answer]] of [['outputTrue','yes'],['outputFalse','no'],['outputError','error']].entries()) {
      const response = outgoing.add('action', OWN + 'night_answer', { request_id: token(t, 'request_id'), person_id: id, answer }, 1200, r.y + index * 80);
      outgoing.link(question, output, response);
      receipt(r, response, 'outputSuccess', answer === 'error' ? 'failed' : 'accepted', answer === 'error' ? 'Spørsmålet feilet eller fikk tidsavbrudd' : `Mottatt ${answer === 'yes' ? 'ja' : 'nei'} fra ${person(id).name}`);
    }
  }
  const cameras = [...new Set([...allActions.filter(a => a.kind === 'notify' && a.notificationType === 'image').map(a => a.imageDeviceId), config.security.garage.imageDeviceId].filter(Boolean))];
  for (const id of config.people.notifications) for (const type of ['normal', 'critical', ...cameras.map(camera => `image:${camera}`)]) {
    const [notificationType, camera = ''] = type.split(':'), r = route('notify', { person: id, type: notificationType, camera });
    const image = camera && devices[camera]?.images?.find(i => i.type === 'camera');
    if (camera && !image) throw new Error(`Kamerabilde mangler for ${devices[camera]?.name || camera}`);
    const action = outgoing.add('action', MOBILE + ({ normal:'push_text', critical:'push_text_critical', image:'push_image' }[notificationType]), { user: person(id), text: token(t,'text') }, 800, r.y,
      image ? { droptoken: `homey:device:${camera}|image-${image.type}-${image.id}` } : {});
    outgoing.link(r.condition, 'outputTrue', action); receipt(r, action, 'outputSuccess', 'accepted', `${notificationType} push-kort utført. Mottak på telefonen er ikke bekreftet.`);
    if (notificationType !== 'normal') {
      const retryGuard = outgoing.add('condition', OWN + 'delivery_matches', outgoing.flow.cards[r.condition].args, 1100, r.y + 120);
      const fallback = outgoing.add('action', MOBILE + 'push_text', { user: person(id), text: token(t,'text') }, 1450, r.y + 160);
      outgoing.link(action,'outputError',retryGuard); outgoing.link(retryGuard,'outputTrue',fallback);
      receipt(r, fallback,'outputSuccess','accepted', `${notificationType} feilet; vanlig push-kort utført som reserve.`);
      receipt(r, fallback,'outputError','failed','Både opprinnelig og vanlig push feilet');
    } else receipt(r, action,'outputError','failed','Vanlig push feilet');
  }
  const audioRoutes = new Map();
  for (const a of allActions.filter(a => ['speak','sound'].includes(a.kind))) audioRoutes.set(`${a.kind}:${a.deviceId}:${a.kind === 'sound' ? a.text : ''}`, a);
  for (const a of audioRoutes.values()) {
    const r = route(a.kind, { target: a.deviceId, text: a.kind === 'sound' ? a.text : '' });
    const id = `homey:device:${a.deviceId}:cloud_play_${a.kind === 'speak' ? 'tts' : 'sound'}`;
    const sound = sounds[`${a.deviceId}:${a.text}`];
    if (a.kind === 'sound' && !sound) throw new Error(`Ukjent Sonos-lyd: ${a.text}`);
    const action = outgoing.add('action', id, { ...(a.kind === 'speak' ? { text: token(t,'text') } : { sound }), volume: token(t,'volume') }, 800, r.y);
    outgoing.link(r.condition,'outputTrue',action);
    receipt(r,action,'outputSuccess','accepted','Sonos-kort utført. Hørbar avspilling er ikke bekreftet.');
    receipt(r,action,'outputError','failed','Sonos-kortet feilet');
  }
  return { flows: { outgoing: outgoing.flow }, enabled: { notifications: config.people.notifications.length > 0, questions: config.people.questions.length > 0, audio: audioRoutes.size > 0 }, routes: row };
}

async function install(api, config, stillAuthorized, saved, persist) {
  const [triggers, conditions, actions, people, devices, existing] = await Promise.all([
    api.flow.getFlowCardTriggers(), api.flow.getFlowCardConditions(), api.flow.getFlowCardActions(), api.users.getUsers({ $cache:false }), api.devices.getDevices({ $cache:false }), api.flow.getAdvancedFlows({ $cache:false }),
  ]);
  const sounds = {};
  for (const a of config.routines.flatMap(r => r.actions).filter(a => a.kind === 'sound')) {
    const key = `${a.deviceId}:${a.text}`; if (sounds[key]) continue;
    const options = await api.flow.getFlowCardAutocomplete({ id:`homey:device:${a.deviceId}:cloud_play_sound`, type:'action', name:'sound', query:'', args:{} });
    const sound = options.find(s => s.id === a.text || s.name === a.text);
    if (!sound) throw new Error(`Sonos tilbyr ikke lyden «${a.text}»`);
    sounds[key] = { id: sound.id, name: sound.name };
  }
  const plan = build(config, people, devices, { triggers, conditions, actions }, sounds);
  const state = { ...saved };
  for (const [key, flow] of Object.entries(plan.flows)) {
    if (!await stillAuthorized()) throw new Error('Oppsettet eller observasjonsmodus ble endret. Integrasjonsoppsettet er avbrutt.');
    const id = state[key];
    if (!id && Object.values(existing).some(f => f.name === flow.name)) throw new Error(`Det finnes allerede en Flow med navnet «${flow.name}». Gi den et annet navn før automatisk oppsett.`);
    const result = id && existing[id] ? await api.flow.updateAdvancedFlow({ id, advancedflow:flow }) : await api.flow.createAdvancedFlow({ advancedflow:flow });
    state[key] = result.id; persist(state);
    const verified = await api.flow.getAdvancedFlow({ id:result.id, $cache:false });
    if (verified.broken || verified.enabled === false || Object.keys(verified.cards).length !== Object.keys(flow.cards).length) throw new Error(`Homey kunne ikke bekrefte «${flow.name}»`);
  }
  return { ids:state, enabled:plan.enabled, routes:plan.routes };
}
function coverage(config,catalog) {
  const routes=require('./flow-connections').legacyRoutes(catalog);
  const matches=(kind,fields={})=>routes.some(a=>a.expected_kind===kind && Object.entries(fields).every(([key,value])=>a[key]===value));
  const needs=require('./integration-needs')(config), audio=needs.audio, cameras=needs.cameras;
  const legacy = {
    questions:needs.questions && config.people.questions.length>0 && config.people.questions.every(id=>matches('question',{expected_person:id})),
    notifications:needs.notifications && config.people.notifications.length>0 && config.people.notifications.every(id=>needs.types.filter(t=>t!=='image').every(type=>matches('notify',{expected_person:id,expected_type:type})) && cameras.every(camera=>matches('notify',{expected_person:id,expected_type:'image',expected_camera:camera}))),
    audio:audio.length>0 && audio.every(a=>matches(a.kind,{expected_target:a.deviceId,...(a.kind==='sound'?{expected_text:a.text}:{})})),
  };
  const simple = require('./simple-flows').coverage(config,catalog);
  return { enabled: Object.fromEntries(Object.keys(legacy).map(key => [key, config.delivery?.[key] === 'simple' ? simple[key] : legacy[key]])) };
}
module.exports = { build, install, coverage };
