'use strict';
const MOBILE='homey:manager:mobile:';
async function user(adapter,id,card,type='action'){
  const users=await adapter.api.flow.getFlowCardAutocomplete({id:card,type,name:'user',query:'',args:{}});
  const selected=users.find(u=>u.id===id);if(!selected?.athomId)throw Error('Valgt mottaker mangler en tilgjengelig Homey-konto.');return selected;
}
function receipt(adapter,data,id,result){adapter.homey.app?.engine?.deliveryResult(data.deliveryId,result,result==='accepted'?'Homey-kortet er utført. Mottak på telefon eller hørbar lyd er ikke bekreftet.':'Direkte levering feilet eller har ukjent utfall.',id);}
async function setAsleep(adapter,id,value,guard,onDispatch){
  adapter.authorize(guard);if(typeof value!=='boolean')throw Error('Sovestatus må være av/på.');
  const card='homey:manager:presence:set_'+(value?'asleep':'awake'),recipient=await user(adapter,id,card);
  const person=await adapter.api.users.getUser({id,$cache:false});
  if(person.enabled===false||person.present!==true)throw Error('Personen er ikke bekreftet hjemme.');if(person.asleep===value)return;
  return adapter.direct.call(api=>api.flow.runFlowCardAction({id:card,args:{user:recipient},$timeout:15000}),()=>adapter.authorize(guard),onDispatch);
}
async function question(adapter,data,guard,onDispatch){
  adapter.pendingQuestions ||= new Map();const key=data.requestId+':'+data.personId;
  if(adapter.pendingQuestions.has(key))return;
  const pending={};adapter.pendingQuestions.set(key,pending);
  try{
    const recipient=await user(adapter,data.personId,MOBILE+'push_confirm','condition');adapter.authorize(guard);
    const timeout=data.deadline-Date.now();if(!Number.isFinite(timeout)||timeout<=0)throw Error('Nattspørsmålet er utløpt.');
    const promise=adapter.direct.call(api=>api.flow.runFlowCardCondition({id:MOBILE+'push_confirm',args:{user:recipient,text:String(data.text)},$timeout:Math.min(timeout,900000)}),()=>adapter.authorize(guard),onDispatch);
    // Homey waits for the phone response. Do not block engine.tick or alarm handling.
    pending.promise=promise.then(result=>{
      adapter.authorize(guard);const answer=typeof result==='boolean'?result:result?.result;
      if(typeof answer!=='boolean')throw Error('Ugyldig nattsvar.');
      adapter.homey.app.engine.answer(data.requestId,data.personId,answer?'yes':'no');receipt(adapter,data,data.personId,'accepted');
    }).catch(()=>{try{adapter.authorize(guard);adapter.homey.app.engine.answer(data.requestId,data.personId,'error');receipt(adapter,data,data.personId,'failed');}catch{/* An expired/cancelled answer must never change mode. */}}).finally(()=>adapter.pendingQuestions.delete(key));
  }catch(error){adapter.pendingQuestions.delete(key);throw error;}
}
async function emit(adapter,data,guard,onDispatch){
  adapter.authorize(guard);
  if(data.kind==='question')return question(adapter,data,guard,onDispatch);
  const recipients=data.kind==='notify'?[...new Set(data.recipients||[])]:[data.deviceId];
  if(!recipients.length)throw Error('Ingen varslingsmottakere er valgt.');let sent=false;
  const results=await Promise.allSettled(recipients.map(async id=>{
    try{let card,args,droptoken;
      if(data.kind==='notify'){
        const type=data.notificationType||'normal',suffix={normal:'push_text',critical:'push_text_critical',image:'push_image'}[type];if(!suffix)throw Error('Ukjent varseltype.');
        card=MOBILE+suffix;args={user:await user(adapter,id,card),text:String(data.text||'')};
        if(type==='image'){
          const camera=await adapter.api.devices.getDevice({id:data.imageDeviceId,$cache:false}),image=camera.images?.find(i=>i.type==='camera');
          if(camera.available===false||!image)throw Error('Kamerabilde er utilgjengelig.');if(data.context?.sensorName)args.text += '\nSensor: '+data.context.sensorName;args.text += '\nKamera: '+(camera.name || 'Kamera');droptoken=`homey:device:${camera.id}|image-${image.type}-${image.id}`;
        }
      }else if(['speak','sound'].includes(data.kind)){
        card=`homey:device:${id}:cloud_play_${data.kind==='speak'?'tts':'sound'}`;args={volume:Number(data.volume||0)};
        if(data.kind==='speak')args.text=String(data.text||'');
        else{const sounds=await adapter.api.flow.getFlowCardAutocomplete({id:card,type:'action',name:'sound',query:'',args:{}}),sound=sounds.find(s=>s.id===data.text||s.name===data.text);if(!sound)throw Error('Den valgte Sonos-lyden er utilgjengelig.');args.sound={id:sound.id,name:sound.name};}
      }else throw Error('Ukjent leveringstype.');
      await adapter.direct.call(api=>api.flow.runFlowCardAction({id:card,args,...(droptoken?{droptoken}:{}),$timeout:15000}),()=>adapter.authorize(guard),()=>{if(!sent){sent=true;onDispatch();}});
      receipt(adapter,data,id,'accepted');
    }catch(error){receipt(adapter,data,id,'failed');throw error;}
  }));
  if(results.some(r=>r.status==='rejected'))throw Error('Én eller flere direkte leveringer feilet eller har ukjent utfall. Ingen automatisk gjentakelse er forsøkt.');
}
module.exports={emit,setAsleep,user};
