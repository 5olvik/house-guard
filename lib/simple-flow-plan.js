'use strict';
const {randomUUID}=require('node:crypto');
const needsFor=require('./integration-needs');
const OWN='homey:app:no.husmodus:', MOBILE='homey:manager:mobile:';
const token=(root,name)=>`[[trigger::${root}::${name}]]`;

// An owner's migration tool may group these ordinary two/four-card recipes on
// one Advanced Flow canvas. The app itself never needs permission to create it.
function build(config,people,devices,metadata,sounds={}) {
  const flow={name:'House Guard – valgfrie integrasjoner',enabled:false,cards:{}}, needs=needsFor(config);
  let row=0;
  function add(type,id,args,x,y,extra={}) {
    if(!Object.values(metadata[type+'s'] || {}).some(c=>c.id===id))throw Error(`Flow-kort mangler: ${id}`);
    const key=randomUUID();flow.cards[key]={type,id,ownerUri:id.slice(0,id.lastIndexOf(':')),args,x,y,...extra};return key;
  }
  function link(from,edge,to){flow.cards[from][edge]=[...(flow.cards[from][edge] || []),to];}
  function person(id){if(!people[id] || people[id].enabled===false)throw Error('En valgt mottaker er utilgjengelig');if(!people[id].athomId)throw Error('Mottaker mangler Homey-konto-ID; hent brukeren fra Homeys mottakervalg på nytt');return {id,name:people[id].name,athomId:people[id].athomId};}
  function device(id){if(!devices[id] || devices[id].available===false)throw Error('En valgt enhet er utilgjengelig');return {id,name:devices[id].name};}
  for(const id of needs.questions?config.people.questions:[]) {
    const y=row++*240, user=person(id);
    const root=add('trigger',OWN+'question_requested',{person:user},0,y);
    const question=add('condition',MOBILE+'push_confirm',{user,text:token(root,'text')},500,y);link(root,'outputSuccess',question);
    for(const [i,answer] of ['yes','no'].entries()) {
      const result=add('action',OWN+'answer_night_question',{reply:token(root,'reply'),answer},1000,y+i*90);link(question,i?'outputFalse':'outputTrue',result);
    }
  }
  for(const id of needs.notifications?config.people.notifications:[]) for(const type of needs.types) {
    for(const camera of type==='image'?needs.cameras:['']) {
      const y=row++*240, user=person(id), image=camera && devices[camera]?.images?.find(i=>i.type==='camera');
      if(camera && !image)throw Error('Valgt kamera mangler bildetagg');
      const root=add('trigger',OWN+({normal:'notification_requested',critical:'critical_notification_requested',image:'image_notification_requested'}[type]),{person:user,...(camera?{camera:device(camera)}:{})},0,y);
      const output=add('action',MOBILE+({normal:'push_text',critical:'push_text_critical',image:'push_image'}[type]),{user,text:token(root,'text')},600,y,image?{droptoken:`homey:device:${camera}|image-${image.type}-${image.id}`} : {});link(root,'outputSuccess',output);
    }
  }
  const audio=new Map(needs.audio.map(a=>[`${a.kind}:${a.deviceId}:${a.kind==='sound'?a.text:''}`,a]));
  for(const a of audio.values()) {
    const y=row++*240, sound=sounds[`${a.deviceId}:${a.text}`];
    if(a.kind==='sound' && !sound)throw Error('Valgt alarmlyd mangler');
    const root=add('trigger',OWN+(a.kind==='speak'?'speech_requested':'sound_requested'),{speaker:device(a.deviceId),...(sound?{sound}:{})},0,y);
    const output=add('action',`homey:device:${a.deviceId}:cloud_play_${a.kind==='speak'?'tts':'sound'}`,{...(a.kind==='speak'?{text:token(root,'text')}:{sound}),volume:token(root,'volume')},600,y);link(root,'outputSuccess',output);
  }
  return {flow,routes:row,cards:Object.keys(flow.cards).length};
}
module.exports={build};
