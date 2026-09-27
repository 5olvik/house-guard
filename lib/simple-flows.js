'use strict';
const { fullId, OWN } = require('./flow-connections');
const needsFor = require('./integration-needs');
const TYPES = {
  notification_requested: { kind:'notify', type:'normal', no:'Et varsel er klart for', en:'A notification is ready for' },
  critical_notification_requested: { kind:'notify', type:'critical', no:'Et viktig varsel er klart for', en:'An important notification is ready for' },
  image_notification_requested: { kind:'notify', type:'image', no:'Et bildevarsel er klart for', en:'An image notification is ready for' },
  speech_requested: { kind:'speak', no:'En talebeskjed er klar for', en:'A spoken message is ready for' },
  sound_requested: { kind:'sound', no:'En alarmlyd er klar for', en:'An alarm sound is ready for' },
  question_requested: { kind:'question', no:'Et nattspørsmål er klart for', en:'A night question is ready for' },
};
const deliveryKey = kind => kind === 'notify' ? 'notifications' : kind === 'question' ? 'questions' : 'audio';
const modeFor = (config, kind) => config.delivery?.[deliveryKey(kind)] || 'legacy';
const title = (no, en) => ({ no, en });
const argument = (name, no, en) => ({ name, type:'autocomplete', title:title(no,en) });
function definitions() {
  return Object.entries(TYPES).map(([id, d]) => {
    const person = ['notify','question'].includes(d.kind), target = person ? 'person' : 'speaker';
    const args = [argument(target,person?'Person':'Høyttaler',person?'Person':'Speaker')];
    if(d.type === 'image') args.push(argument('camera','Kamera','Camera'));
    if(d.kind === 'sound') args.push(argument('sound','Lyd','Sound'));
    return { id, title:title(d.no,d.en), titleFormatted:title(`${d.no} [[${target}]]${d.type==='image'?' fra [[camera]]':d.kind==='sound'?' med [[sound]]':''}`,`${d.en} [[${target}]]${d.type==='image'?' from [[camera]]':d.kind==='sound'?' using [[sound]]':''}`),
      hint:title('Bruk oppskriften under Mer → Koblinger i House Guard.','Use the recipe under More → Connections in House Guard.'), args,
      tokens:[{name:'text',type:'string',title:title('Melding','Message')}, ...(['speak','sound'].includes(d.kind)?[{name:'volume',type:'number',title:title('Volum','Volume')}]:[]), ...(d.kind==='question'?[{name:'reply',type:'string',title:title('Dette spørsmålet','This question')}]:[])],
    };
  });
}
function triggerId(data) {
  return Object.keys(TYPES).find(id => TYPES[id].kind === data.kind && (!TYPES[id].type || TYPES[id].type === (data.notificationType || 'normal')));
}
function matches(engine, id, args, state) {
  const type = TYPES[id];
  if (!type || !state || modeFor(engine.config, type.kind) !== 'simple') return false;
  const recipient = type.kind === 'notify' || type.kind === 'question' ? state.personId : state.deviceId;
  if (!recipient || !engine.validDelivery(state.deliveryId, recipient) || type.kind !== state.kind) return false;
  if ((args.person?.id || args.speaker?.id) !== recipient) return false;
  if (type.type && type.type !== (state.notificationType || 'normal')) return false;
  if (type.type === 'image' && args.camera?.id !== state.imageDeviceId) return false;
  if (type.kind === 'sound' && ![args.sound?.id,args.sound?.name].includes(state.text)) return false;
  if (type.kind === 'question') {
    const q = engine.state.question;
    if (!q || q.id !== state.requestId || q.decided || engine.clock() >= q.deadline || !q.recipients.includes(recipient)) return false;
  }
  return true;
}
function register(app) {
  const names = async (query, source) => Object.values(source).filter(x=>x.available!==false && x.name.toLowerCase().includes(query.toLowerCase())).map(x=>({id:x.id,name:x.name}));
  for (const [id, d] of Object.entries(TYPES)) {
    const card = app.homey.flow.getTriggerCard(id);
    card.registerRunListener((args, state) => matches(app.engine,id,args,state));
    if (['notify','question'].includes(d.kind)) card.registerArgumentAutocompleteListener('person', query => names(query,app.adapter.catalogue.people));
    else card.registerArgumentAutocompleteListener('speaker', query => names(query,Object.fromEntries(Object.entries(app.adapter.catalogue.devices).filter(([,d])=>d.capabilities.speaker_playing))));
    if (d.type === 'image') card.registerArgumentAutocompleteListener('camera', query => names(query,Object.fromEntries(Object.entries(app.adapter.catalogue.devices).filter(([,d])=>d.images?.some(i=>i.type==='camera')))));
    if (d.kind === 'sound') card.registerArgumentAutocompleteListener('sound', async (query,args) => {
      if (!args.speaker?.id) return [];
      return app.adapter.api.flow.getFlowCardAutocomplete({id:`homey:device:${args.speaker.id}:cloud_play_sound`,type:'action',name:'sound',query,args:{}});
    });
  }
  app.homey.flow.getActionCard('answer_night_question').registerRunListener(async ({ reply, answer }) => {
    const q = app.engine.state.question;
    const person = Object.keys(q?.replyKeys || {}).find(id => q.replyKeys[id] === reply);
    if (!person) return true;
    try { app.engine.answer(q.id,person,answer); }
    catch (error) { app.engine.log(`Sent eller ugyldig nattsvar ignorert: ${error.message}`,{result:'skipped'}); }
    return true;
  });
}
function simpleRoutes(catalog) {
  const found=[];
  const candidates=[];
  for(const flow of catalog.integrationFlows || []) {
    if(flow.enabled===false || flow.broken)continue;
    if(flow.type==='normal'){candidates.push(flow);continue;}
    const cards=flow.cards || {};
    for(const [key,root] of Object.entries(cards)) {
      if(root.type!=='trigger' || !fullId(root).startsWith(OWN) || !TYPES[fullId(root).slice(OWN.length)])continue;
      const linked=(card,edge)=>(card?.[edge] || []).map(id=>cards[id]);
      const normalize=(card,group)=>({...card,group,args:Object.fromEntries(Object.entries(card.args || {}).map(([name,value])=>[name,typeof value==='string'?value.replaceAll(`[[trigger::${key}::`,'[['):value]))});
      const outputs=linked(root,'outputSuccess');
      if(outputs.length!==1 || !outputs[0])continue;
      const condition=outputs[0].type==='condition' ? outputs[0] : null;
      const branches=condition?[...linked(condition,'outputTrue'),...linked(condition,'outputFalse')]:outputs;
      if(branches.some(card=>!card || card.type!=='action'))continue;
      candidates.push({type:'normal',trigger:root,conditions:condition?[normalize(condition)]:[],actions:condition?[...linked(condition,'outputTrue').map(c=>normalize(c,'then')),...linked(condition,'outputFalse').map(c=>normalize(c,'else'))]:outputs.filter(c=>c.type==='action').map(c=>normalize(c,'then'))});
    }
  }
  for (const flow of candidates) {
    if (flow.type !== 'normal' || flow.enabled === false || flow.broken) continue;
    const id=fullId(flow.trigger).slice(OWN.length), d=TYPES[id];
    if (!fullId(flow.trigger).startsWith(OWN) || !d) continue;
    const args=flow.trigger.args || {}, conditions=flow.conditions || [], actions=flow.actions || [];
    const then=actions.filter(a=>!a.group || a.group==='then'), otherwise=actions.filter(a=>a.group==='else');
    const r={expected_kind:d.kind,expected_person:args.person?.id,expected_target:args.speaker?.id,expected_type:d.type,expected_camera:args.camera?.id,expected_text:args.sound?.id};
    if (d.kind==='question') {
      const c=conditions[0];
      const answer=(cards,value)=>cards.some(a=>fullId(a)===OWN+'answer_night_question' && a.args?.reply==='[[reply]]' && a.args?.answer===value && !a.delay);
      if(conditions.length===1 && then.length===1 && otherwise.length===1 && fullId(c)==='homey:manager:mobile:push_confirm' && !c.inverted && c.args?.user?.id===args.person?.id && !!c.args?.user?.athomId && c.args?.text==='[[text]]' && answer(then,'yes') && answer(otherwise,'no')) found.push(r);
    } else if (!conditions.length) {
      const good = then.some(a=>{
        if(a.delay) return false;
        if(d.kind==='notify') return fullId(a)==='homey:manager:mobile:'+({normal:'push_text',critical:'push_text_critical',image:'push_image'}[d.type]) && a.args?.user?.id===args.person?.id && !!a.args?.user?.athomId && a.args?.text==='[[text]]' && (d.type!=='image' || a.droptoken?.startsWith(`homey:device:${args.camera?.id}|image-camera-`));
        return fullId(a)===`homey:device:${args.speaker?.id}:cloud_play_${d.kind==='speak'?'tts':'sound'}` && a.args?.volume==='[[volume]]' && (d.kind==='speak'?a.args?.text==='[[text]]':a.args?.sound?.id===args.sound?.id);
      });
      if(good && then.length===1 && otherwise.length===0)found.push(r);
    }
  }
  return found;
}
function coverage(config,catalog) {
  const routes=simpleRoutes(catalog), needs=needsFor(config);
  const matches=(kind,values)=>routes.filter(r=>r.expected_kind===kind && Object.entries(values).every(([k,v])=>r[k]===v)).length===1;
  return {
    questions:needs.questions && config.people.questions.length>0 && config.people.questions.every(id=>matches('question',{expected_person:id})),
    notifications:needs.notifications && config.people.notifications.length>0 && config.people.notifications.every(id=>needs.types.filter(t=>t!=='image').every(type=>matches('notify',{expected_person:id,expected_type:type})) && needs.cameras.every(camera=>matches('notify',{expected_person:id,expected_type:'image',expected_camera:camera}))),
    audio:needs.audio.length>0 && needs.audio.every(a=>matches(a.kind,{expected_target:a.deviceId,...(a.kind==='sound'?{expected_text:a.text}:{})})),
  };
}
module.exports={definitions,register,matches,triggerId,modeFor,coverage,simpleRoutes};
