'use strict';
const {randomUUID}=require('node:crypto');
const ACTION='homey:app:no.husmodus:check_integration_access';
const MESSAGE='House Guard: Test av direkte push via API-nøkkel. Ingen alarm er utløst.';
// Fixed diagnostic operations only. No caller-selected Flow, card or message.
async function testDirect(app,type,options={}){
  if(!['access','flow','push'].includes(type))throw Error('Ukjent forbindelsestest.');
  const notificationType=options.notificationType || 'normal';
  if(!['normal','critical','image'].includes(notificationType))throw Error('Ukjent varseltype.');
  if(!app.adapter.direct?.ready)throw Error('Direkte forbindelse er ikke klar.');
  if(app.directTestRunning)throw Error('En forbindelsestest pågår allerede.');
  if(type==='push' && Date.now()-(app.lastDirectPushTests?.[notificationType]||0)<60000)throw Error('Vent ett minutt før et nytt testvarsel.');
  app.directTestRunning=true;
  const generation=app.engine.state.generation,guard=()=>{if(generation!==app.engine.state.generation)throw Error('Oppsett eller forbindelse ble endret.');};
  try{
    if(type==='push'){
      if(app.engine.config.observation)throw Error('Observasjon sender ikke pushvarsler.');
      const recipients=[...app.engine.config.people.notifications];if(!recipients.length)throw Error('Velg pushmottakere under Personer.');
      let imageDeviceId='';
      if(notificationType==='image'){
        const config=app.engine.config;
        const cameras=[...new Set([config.security.garage.imageDeviceId,...Object.values(config.security.responses || {}).map(r=>r.imageDeviceId),...config.routines.filter(r=>r.enabled).flatMap(r=>r.actions.filter(a=>a.kind==='notify' && a.notificationType==='image').map(a=>a.imageDeviceId))].filter(Boolean))];
        imageDeviceId=options.imageDeviceId || (cameras.length===1?cameras[0]:'');
        if(!imageDeviceId || !cameras.includes(imageDeviceId))throw Error('Velg et kamera som allerede brukes til bildevarsler i oppsettet.');
      }
      app.lastDirectPushTests ||= {};app.lastDirectPushTests[notificationType]=Date.now();const deliveryId=app.engine.newDelivery('notify',recipients);
      const text=notificationType==='normal'?MESSAGE:notificationType==='critical'?'House Guard: Test av kritisk push via API-nøkkel. Ingen alarm er utløst.':'House Guard: Test av bildepush via API-nøkkel. Ingen alarm er utløst.';
      await app.adapter.emit({kind:'notify',notificationType,text,imageDeviceId,recipients,deliveryId},()=>generation===app.engine.state.generation&&!app.engine.config.observation);
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
