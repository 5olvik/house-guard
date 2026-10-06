'use strict';
const {randomUUID}=require('node:crypto');
const ACTION='homey:app:no.husmodus:check_integration_access';
const MESSAGE='House Guard: Test av direkte push via API-nøkkel. Ingen alarm er utløst.';
// Fixed diagnostic operations only. No caller-selected Flow, card or message.
async function testDirect(app,type,options={}){
  if(!['access','flow','push'].includes(type))throw Error('Ukjent forbindelsestest.');
  const notificationType=options.notificationType || 'normal';
  if(!['normal','critical','image'].includes(notificationType))throw Error('Ukjent varseltype.');
  if(options.environmentType!==undefined && !['fire','water'].includes(options.environmentType))throw Error('Ukjent brann- eller vannoppsett.');
  if(!app.adapter.direct?.ready)throw Error('Direkte forbindelse er ikke klar.');
  if(app.directTestRunning)throw Error('En forbindelsestest pågår allerede.');
  if(type==='push' && Date.now()-(app.lastDirectPushTests?.[notificationType]||0)<60000)throw Error('Vent ett minutt før et nytt testvarsel.');
  app.directTestRunning=true;
  const generation=app.engine.state.generation,guard=()=>{if(generation!==app.engine.state.generation)throw Error('Oppsett eller forbindelse ble endret.');};
  try{
    if(type==='push'){
      const recipients=[...app.engine.config.people.notifications];if(!recipients.length)throw Error('Velg pushmottakere under Personer.');
      // Only this explicit diagnostic may notify while observing. Do not change the
      // real adapter's authorization or enable any routine, device or audio action.
      // Native recipient/camera checks and delivery receipts stay shared with normal push.
      const diagnosticAdapter={api:app.adapter.api,direct:app.adapter.direct,homey:app.adapter.homey,authorize:()=>{
        guard();if(!app.adapter.direct?.ready)throw Error('Direkte forbindelse er ikke klar.');
      }};
      const sendTest=data=>require('./direct-delivery').emit(diagnosticAdapter,data,guard,()=>{});
      let imageDeviceId='';
      let imageDeviceIds=[];
      if(notificationType==='image'){
        const config=app.engine.config;
        const cameras=[...new Set([config.security.garage.imageDeviceId,...Object.values(config.security.responses || {}).flatMap(require('./alarm-responses').cameraIds),...Object.values(config.environment?.responses || {}).flatMap(r=>r.imageDeviceIds || []),...require('./guest-presence').activeRoutines(config).flatMap(r=>r.actions.filter(a=>a.kind==='notify' && a.notificationType==='image').map(a=>a.imageDeviceId))].filter(Boolean))];
        if(options.environmentType) {
          imageDeviceIds=[...(config.environment?.responses?.[options.environmentType]?.imageDeviceIds || [])];
          if(!imageDeviceIds.length || imageDeviceIds.length>3 || new Set(imageDeviceIds).size!==imageDeviceIds.length)throw Error('Velg ett til tre kameraer under Brann og vann → Varsler og handlinger.');
        } else if(options.alarmCameras===true) {
          imageDeviceIds=[...require('./alarm-responses').cameraIds(config.security.responses?.alarm)];
          if(!imageDeviceIds.length || imageDeviceIds.length>3 || new Set(imageDeviceIds).size!==imageDeviceIds.length)throw Error('Velg ett til tre kameraer under Alarm → Varsler.');
        } else {
          imageDeviceId=options.imageDeviceId || (cameras.length===1?cameras[0]:'');
          imageDeviceIds=[imageDeviceId];
        }
        if(imageDeviceIds.some(id=>!id || !cameras.includes(id)))throw Error('Velg et kamera som allerede brukes til bildevarsler i oppsettet.');
      }
      app.lastDirectPushTests ||= {};app.lastDirectPushTests[notificationType]=Date.now();
      const text=notificationType==='normal'?MESSAGE:notificationType==='critical'?'House Guard: Test av kritisk push via API-nøkkel. Ingen alarm er utløst.':'House Guard: Test av bildepush via API-nøkkel. Ingen alarm er utløst.';
      if((options.alarmCameras===true || options.environmentType) && notificationType==='image') {
        const results=await Promise.all(imageDeviceIds.map(async id=>{
          const name=app.adapter.catalogue?.devices?.[id]?.name || id;
          try {guard();await sendTest({kind:'notify',notificationType,text,imageDeviceId:id,recipients,deliveryId:app.engine.newDelivery('notify',recipients)});return {id,name,accepted:true};}
          catch(error){return {id,name,accepted:false,error:error.message};}
        }));
        return {type,notificationType,accepted:results.every(r=>r.accepted),recipients:recipients.length,attemptedNotifications:results.length*recipients.length,results,phoneReceiptConfirmed:false};
      }
      const deliveryId=app.engine.newDelivery('notify',recipients);
      await sendTest({kind:'notify',notificationType,text,imageDeviceId,recipients,deliveryId});
      return {type,notificationType,accepted:true,recipients:recipients.length,phoneReceiptConfirmed:false};
    }
    return await app.adapter.direct.call(async api=>{
      const before=app.integrationTestCount||0;
      if(type==='access'){
        await api.flow.runFlowCardAction({id:ACTION,args:{},$timeout:10000});
        if((app.integrationTestCount||0)<=before)throw Error('Testkortet ble ikke kjørt.');
        return {type,executed:true};
      }
      let flow;
      try{
        flow=await api.flow.createFlow({flow:{name:'House Guard – midlertidig API-test '+randomUUID().slice(0,8),enabled:true,trigger:{id:'homey:manager:flow:programmatic_trigger',args:{}},conditions:[],actions:[{id:ACTION,args:{},group:'then'}]}});
        if(!flow?.id)throw Error('Test-Flow kunne ikke opprettes.');
        app.homey.settings.set('houseguard.pending-test-flow.v1',flow.id);
        guard();await api.flow.triggerFlow({id:flow.id,$timeout:10000});
        for(let i=0;i<20 && (app.integrationTestCount||0)<=before;i++)await new Promise(resolve=>app.homey.setTimeout(resolve,100));
        if((app.integrationTestCount||0)<=before)throw Error('Test-Flow ble ikke bekreftet kjørt.');
      }finally{
        if(flow?.id){await api.flow.deleteFlow({id:flow.id});app.homey.settings.set('houseguard.pending-test-flow.v1','');}
      }
      return {type,executed:true,temporaryFlowRemoved:true};
    },guard);
  }finally{app.directTestRunning=false;}
}
module.exports={testDirect,MESSAGE};
