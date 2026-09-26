'use strict';
const fs = require('node:fs');
const title = (no, en = no) => ({ no, en });
const text = (name, no) => ({ name, type: 'text', title: title(no) });
const number = (name, no) => ({ name, type: 'number', title: title(no) });
const dropdown = (name, no, options) => ({ name, type: 'dropdown', title: title(no), values: options.map(([id, no, en]) => ({ id, title: title(no, en) })) });
const manifest = {
  id: 'no.husmodus', version: require('../package.json').version, compatibility: '>=12.3.0', sdk: 3, platforms: ['local'],
  name: title('House Guard', 'House Guard'), description: title('Hjem, borte og natt med tydelige rutiner', 'Home, away and night routines with clear status'),
  category: ['tools'], brandColor: '#e8441a', permissions: ['homey:manager:api'],
  author: { name: 'House Guard' },
  source: 'https://github.com/5olvik/house-guard', support: 'https://github.com/5olvik/house-guard/issues',
  capabilities: {alarm_status:{type:'string',title:title('Alarmstatus','Alarm status'),getable:true,setable:false,uiComponent:'sensor',icon:'/assets/icon.svg'}},
  images: { small: '/assets/images/small.png', large: '/assets/images/large.png', xlarge: '/assets/images/xlarge.png' },
  drivers: [{
    id: 'guest-mode', name: title('Gjestemodus', 'Guest mode'), class: 'other',
    platforms: ['local'], capabilities: ['onoff'],
    capabilitiesOptions: { onoff: { title: title('Gjestemodus', 'Guest mode'), preventInsights: true, zoneActivity: false } },
    images: { small: '/drivers/guest-mode/assets/images/small.png', large: '/drivers/guest-mode/assets/images/large.png', xlarge: '/drivers/guest-mode/assets/images/xlarge.png' },
    pair: [
      { id: 'list_devices', template: 'list_devices', navigation: { next: 'add_devices' }, options: { singular: true } },
      { id: 'add_devices', template: 'add_devices' },
    ],
  },{
    id:'alarm-panel',name:title('Alarmpanel','Alarm panel'),class:'sensor',platforms:['local'],
    capabilities:['homealarm_state','alarm_generic','alarm_status','button'],
    capabilitiesOptions:{button:{title:title('Frakoble og avstill','Disarm and silence')},alarm_generic:{title:title('Utløst alarm','Alarm triggered'),zoneActivity:false}},
    images:{small:'/drivers/alarm-panel/assets/images/small.png',large:'/drivers/alarm-panel/assets/images/large.png',xlarge:'/drivers/alarm-panel/assets/images/xlarge.png'},
    pair:[{id:'list_devices',template:'list_devices',navigation:{next:'add_devices'},options:{singular:true}},{id:'add_devices',template:'add_devices'}],
  }],
  api: {
    checkIntegrationAccess: { method: 'POST', path: '/integration-access' },
    getState: { method: 'GET', path: '/state' }, getCatalog: { method: 'GET', path: '/catalog' },
    saveConfig: { method: 'PUT', path: '/config' }, validateConfig: { method: 'POST', path: '/validate' }, command: { method: 'POST', path: '/command' },
    previewRoutine: { method: 'POST', path: '/preview' }, setupBridges: { method: 'POST', path: '/bridges' },
  },
  flow: {
    actions: [
      { id: 'answer_night_question', title: title('Registrer svar på nattspørsmålet', 'Record the answer to the night question'), hint: title('Bruk taggen Dette spørsmålet fra Når-kortet. Gamle svar ignoreres.', 'Use the This question tag from the When card. Expired replies are ignored.'), args: [text('reply', 'Dette spørsmålet'), dropdown('answer', 'Svar', [['yes','Ja','Yes'],['no','Nei','No']])] },
      { id: 'check_integration_access', deprecated: true, title: title('Kontroller integrasjonstilgang', 'Check integration access') },
      { id: 'set_mode', title: title('Sett modus i House Guard', 'Set House Guard mode'), args: [dropdown('mode', 'Modus', [['home', 'Hjemme', 'Home'], ['away', 'Borte', 'Away'], ['night', 'Natt', 'Night'], ['morning', 'Morgen', 'Morning']])] },
      { id: 'set_guest', title: title('Sett gjestemodus', 'Set guest mode'), args: [dropdown('enabled', 'Gjestemodus', [['true', 'På', 'On'], ['false', 'Av', 'Off']])] },
      { id: 'skip_night', title: title('Hopp over automatisk nattmodus i natt', 'Skip automatic night mode tonight') },
      { id: 'start_routine', title: title('Start navngitt rutine', 'Start named routine'), args: [{ name: 'routine', type: 'autocomplete', title: title('Rutine', 'Routine') }] },
      { id: 'zone_idle', title: title('Rapporter inaktiv sone', 'Report inactive zone'), args: [text('zone_id', 'Sone-ID'), number('minutes', 'Inaktiv i minutter')] },
      { id: 'night_answer', title: title('Svar på nattspørsmål', 'Answer night request'), args: [text('request_id', 'Forespørsels-ID'), text('person_id', 'Person-ID'), dropdown('answer', 'Svar', [['yes', 'Ja', 'Yes'], ['no', 'Nei', 'No'], ['error', 'Teknisk feil', 'Technical error']])] },
      { id: 'delivery_result', title: title('Registrer leveringsresultat', 'Record delivery result'), args: [text('delivery_id', 'Leverings-ID'), text('recipient_id', 'Mottaker-ID'), dropdown('result', 'Resultat', [['accepted', 'Flow utført'], ['failed', 'Feil']]), text('detail', 'Detaljer')] },
    ],
    conditions: [{ id: 'delivery_matches', title: title('Leveringen er gyldig og passer denne koblingen', 'The delivery is valid and matches this connection'), args: ['delivery_id', 'kind', 'person_id', 'target_id', 'notification_type', 'camera_id', 'text', 'expected_kind', 'expected_person', 'expected_target', 'expected_type', 'expected_camera', 'expected_text'].map(name => text(name, name)) }],
    triggers: [{ id: 'delivery_requested', title: title('En melding, lyd eller et spørsmål skal leveres', 'A message, sound or question needs delivery'), tokens: [
      ...[['delivery_id', 'Leverings-ID'], ['kind', 'Type'], ['text', 'Tekst'], ['person_id', 'Person-ID'], ['request_id', 'Forespørsels-ID'], ['target_id', 'Målenhet-ID'], ['alarm_id', 'Alarm-ID'], ['zone', 'Sone'], ['reason', 'Årsak'], ['notification_type', 'Varseltype'], ['camera_id', 'Kamera-ID']].map(([name, no]) => ({ name, type: 'string', title: title(no) })),
      { name: 'volume', type: 'number', title: title('Volum', 'Volume') },
    ] }],
  },
};
manifest.flow.triggers.push(...require('../lib/simple-flows').definitions());
for (const cards of Object.values(manifest.flow)) for (const card of cards) {
  if (['integration_event','zone_idle','night_answer','delivery_result','delivery_matches','delivery_requested'].includes(card.id)) card.deprecated = true;
}
for (const card of [...manifest.flow.actions, ...manifest.flow.conditions]) {
  if (card.args?.length) card.titleFormatted = title(`${card.title.no}: ${card.args.map(arg => `[[${arg.name}]]`).join(' · ')}`, `${card.title.en}: ${card.args.map(arg => `[[${arg.name}]]`).join(' · ')}`);
}
fs.writeFileSync('app.json', JSON.stringify(manifest, null, 2) + '\n');
