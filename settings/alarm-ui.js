'use strict';
window.HouseGuardAlarm = (() => {
  const events = {alarm:'Når alarmen utløses',arming:'Ved tilkoblingsforsinkelse',entryDelay:'Ved inngangsforsinkelse',activeSensor:'Når en sensor er aktiv ved tilkobling',alarmOff:'Når alarmen avstilles'};
  const when = [{id:'',label:'Alltid'},{id:'home',label:'Når noen er hjemme'},{id:'away',label:'Når alle er borte'},{id:'asleep',label:'Når noen hjemme sover'},{id:'awake',label:'Når ingen hjemme sover'},{id:'night',label:'I nattmodus'}];
  const sounds = new Map();
  let testing = false;
  function render({root,section='notifications',config,data,el,options,deviceItems,changed,api,flush,demo}) {
    const opened = new Set([...root.querySelectorAll('details[open][data-event]')].map(e=>e.dataset.event));
    const first = !root.children.length;
    const testControls=[];
    const testDisabled=type=>testing||demo||!data.direct?.ready||!config.people.notifications.length||(type==='image'&&!config.security.responses.alarm.imageDeviceIds.length);
    root.replaceChildren();
    if(section==='notifications'){
      const recipients=el('div',undefined,'card');recipients.append(el('h2','Hvem får varsler?'),el('p',config.people.notifications.length?config.people.notifications.map(id=>data.catalog.people[id]?.name || 'Utilgjengelig person').join(', '):'Ingen mottakere valgt.','hint'));
      const choose=el('button','Velg mottakere');choose.onclick=()=>document.querySelector('[data-tab="people"]').click();recipients.append(choose);
      if(!data.direct?.ready){recipients.append(el('p','Koble til Homey for å sende varsler direkte.','hint'));const connect=el('button','Koble til Homey');connect.onclick=()=>{document.querySelector('[data-tab="more"]').click();document.getElementById('direct-api-settings').open=true;document.getElementById('direct-api-settings').scrollIntoView({block:'start'});};recipients.append(connect);}
      root.append(recipients);
    }
    const devices = Object.values(data.catalog.devices || {});
    const speakers = devices.filter(d=>d.driverId?.includes('sonos') && d.available !== false).map(d=>({id:d.id,label:`${d.name} · ${d.zone || ''}`}));
    const lights = devices.filter(d=>d.class==='light' && d.capabilities?.onoff?.setable && ![config.security.lockDeviceId,config.security.garage.commandDeviceId].includes(d.id)).map(d=>({id:d.id,label:`${d.name} · ${d.zone || ''}`}));
    const rerender=()=>render({root,section,config,data,el,options,deviceItems,changed,api,flush,demo});
    function field(parent,title,object,key,type='text',items) {
      const label=el('label',type==='checkbox'?undefined:title,type==='checkbox'?'check':undefined);
      const input=el(items?'select':'input');
      if(items) options(input,items,object[key],null);
      else {input.type=type;if(type==='checkbox')input.checked=object[key];else input.value=object[key];}
      if(type==='number'){input.min='1';input.max='100';}
      const update=()=>{if(!input.checkValidity())return;object[key]=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;changed(type==='checkbox'||!!items);for(const [button,type] of testControls)button.disabled=testDisabled(type);};
      if(type==='text'||type==='number')input.oninput=update;else input.onchange=update;
      label.append(input);if(type==='checkbox')label.append(document.createTextNode(title));parent.append(label);return input;
    }
    function remove(parent,items,item,title) { const button=el('button',title);button.onclick=()=>{items.splice(items.indexOf(item),1);changed(true);rerender();};parent.append(button); }
    for(const [id,title] of Object.entries(events)) {
      const r=config.security.responses[id],card=el('details',undefined,'card');card.dataset.event=id;card.open=opened.has(id)||(first&&id==='alarm');
      card.append(el('summary',title));const body=el('div',undefined,'details-body'),grid=el('div',undefined,'form-grid');card.append(body);body.append(grid);root.append(card);
      if(section==='notifications') {
      field(grid,'Send push til valgte mottakere',r,'push','checkbox');
      field(grid,'Bruk kritisk push',r,'critical','checkbox');
      const cameraPanel=el('details');cameraPanel.open=r.imageDeviceIds.length>0;cameraPanel.append(el('summary','Kamerabilder'+(r.imageDeviceIds.length?' · '+r.imageDeviceIds.length+' valgt':' (valgfritt)')));body.append(cameraPanel);
      const cameras=deviceItems('camera');
      for(const cameraId of r.imageDeviceIds) {
        const row=el('div',undefined,'row');row.append(el('span',cameras.find(c=>c.id===cameraId)?.label || (data.catalog.devices?.[cameraId]?.name || cameraId)+' · utilgjengelig'));
        remove(row,r.imageDeviceIds,cameraId,'Fjern kamera');cameraPanel.append(row);
      }
      const cameraAdd=el('select');options(cameraAdd,cameras.filter(c=>!r.imageDeviceIds.includes(c.id)),'','Legg til kamera …');
      cameraAdd.setAttribute('aria-label','Legg til kamera: '+title);cameraAdd.disabled=r.imageDeviceIds.length>=3;
      cameraAdd.onchange=()=>{if(!cameraAdd.value||r.imageDeviceIds.length>=3)return;r.imageDeviceIds.push(cameraAdd.value);changed(true);rerender();};cameraPanel.append(cameraAdd);
      cameraPanel.append(el('p','Velg opptil tre kameraer. Ett eget bildevarsel per kamera sendes til alle valgte pushmottakere.','hint'));
      if(id==='alarm')field(cameraPanel,'Send bilder også ved gjentatt alarm',r,'imageOnRepeat','checkbox');
      field(grid,'Vis også i Homeys tidslinje',r,'timeline','checkbox');
      if(id==='alarm')body.append(el('p','Velg mottakere under Personer → Motta pushvarsler. Alarmmeldingen sendes først, deretter ett bildevarsel per valgt kamera. Kritiske varsler må være tillatt for Homey på telefonen. Tidslinjen erstatter ikke push.','hint'));
      if(id==='activeSensor')body.append(el('p','House Guard sender alltid et vanlig push om sensorer som holdes midlertidig utenfor ved tilkobling. De overvåkes automatisk når de blir inaktive. Valgene over gjelder øvrige sensorvarsler.','hint'));
      const textOptions=el('details');textOptions.append(el('summary','Tilpass meldingene'));const textBody=el('div',undefined,'form-grid');textOptions.append(textBody);body.append(textOptions);
      field(textBody,'Pushmelding',r,'text');field(textBody,'Tekst i tidslinjen',r,'timelineText');textBody.append(el('p','{zone}, {reason}, {sensorName} og {seconds} fylles inn av House Guard.','hint'));
      continue;
      }
      body.append(el('h3','Lyd på Sonos'));
      for(const audio of r.audio) {
        const row=el('div',undefined,'card form-grid');body.append(row);
        const speaker=field(row,'Høyttaler',audio,'deviceId','text',speakers);
        speaker.onchange=()=>{audio.deviceId=speaker.value;changed(true);rerender();};
        const kind=field(row,'Beskjed',audio,'kind','text',[{id:'sound',label:'Alarmlyd'},{id:'speak',label:'Tale'}]);
        kind.onchange=()=>{audio.kind=kind.value;audio.text=audio.kind==='sound'?'alarm3':'Alarmen er utløst i {zone}. {reason}';changed(true);rerender();};
        if(audio.kind==='speak')field(row,'Talebeskjed',audio,'text');
        else {
          const sound=field(row,'Alarmlyd',audio,'text','text',sounds.get(audio.deviceId)||[{id:audio.text,label:audio.text}]);
          if(!sounds.has(audio.deviceId) && !demo)api('POST','/alarm-sounds',{deviceId:audio.deviceId}).then(items=>{sounds.set(audio.deviceId,items);if(sound.isConnected)options(sound,items,audio.text,null);}).catch(()=>{if(sound.isConnected)row.append(el('p','Kunne ikke hente lydlisten. Kontroller at Sonos er tilgjengelig.','error'));});
        }
        field(row,'Volum',audio,'volume','number');field(row,'Spill når',audio,'when','text',when);remove(row,r.audio,audio,'Fjern lydvalg');
      }
      const audioAdd=el('select');options(audioAdd,speakers,'','Legg til høyttaler …');audioAdd.setAttribute('aria-label',`Legg til høyttaler: ${title}`);audioAdd.onchange=async()=>{
        const deviceId=audioAdd.value;if(!deviceId)return;audioAdd.disabled=true;
        try {
          const items=sounds.get(deviceId)||await api('POST','/alarm-sounds',{deviceId});
          if(!items.length)throw Error('Høyttaleren har ingen tilgjengelige alarmlyder.');
          sounds.set(deviceId,items);if(!audioAdd.isConnected)return;
          r.audio.push({deviceId,kind:'sound',text:(items.find(s=>s.id==='alarm3')||items[0]).id,volume:35,when:''});changed(true);rerender();
        } catch(error){audioAdd.disabled=false;body.append(el('p',error.message,'error'));}
      };body.append(audioAdd);
      body.append(el('h3','Slå på lys'));
      for(const light of r.lights) {const row=el('div',undefined,'form-grid');body.append(row);field(row,'Lys',light,'deviceId','text',lights);field(row,'Slå på når',light,'when','text',when);remove(row,r.lights,light,'Fjern lysvalg');}
      const lightAdd=el('select');options(lightAdd,lights.filter(d=>!r.lights.some(a=>a.deviceId===d.id)),'','Legg til lys …');lightAdd.setAttribute('aria-label',`Legg til lys: ${title}`);lightAdd.onchange=()=>{if(!lightAdd.value)return;r.lights.push({deviceId:lightAdd.value,when:'',confirmSeconds:60});changed(true);rerender();};body.append(lightAdd);
    }
    if(section!=='notifications')return;
    const test=el('div',undefined,'card');test.append(el('h2','Prøv varsler på telefonen'),el('p','Vanlig og kritisk test sender ett varsel per mottaker. Kameratesten bruker kameraene under «Når alarmen utløses»: '+config.security.responses.alarm.imageDeviceIds.length+' kameraer × '+config.people.notifications.length+' mottakere = '+(config.security.responses.alarm.imageDeviceIds.length*config.people.notifications.length)+' bildevarsler. Ingen alarm, lyd, lys, lås eller port aktiveres. Kritisk test kan gi lyd på telefonen.','hint'));
    const status=el('p');status.setAttribute('role','status');const buttons=el('div',undefined,'button-row');test.append(buttons,status);root.append(test);
    for(const [type,title] of [['normal','Test vanlig push'],['critical','Test kritisk push'],['image','Test kameravarsler']]) {
      const button=el('button',title);button.disabled=testDisabled(type);testControls.push([button,type]);buttons.append(button);
      button.onclick=async()=>{if(testing)return;testing=true;[...buttons.children].forEach(b=>b.disabled=true);status.textContent='Sender test …';
        try {await flush();const result=await api('POST','/direct-test',{type:'push',notificationType:type,...(type==='image'?{alarmCameras:true}:{})});status.textContent=result.results ? result.results.map(r=>r.name+': '+(r.accepted?'akseptert av Homey':'feilet eller ukjent utfall – '+r.error)).join(' · ')+' Kontroller bildene på telefonen.' : 'Homey har akseptert testvarselet. Kontroller at det kom på telefonen.';}
        catch(error){status.textContent=error.message;}
        finally{testing=false;for(const [button,type] of testControls)button.disabled=testDisabled(type);}
      };
    }
    if(config.observation)test.append(el('p','Du kan prøve varsling før oppsettet er fullført. Disse knappene starter ingen rutiner.','hint'));
    if(!data.direct?.ready)test.append(el('p','Legg inn og kontroller API-nøkkelen under Innstillinger → API-nøkkel.','hint'));
    if(!config.people.notifications.length)test.append(el('p','Velg pushmottakere under Personer.','hint'));
  }
  return {render};
})();
