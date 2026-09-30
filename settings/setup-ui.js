'use strict';
// The guide edits the same settings as the normal pages. Guide preferences never
// enable/disable a feature, and opening or navigating it never writes config.
window.HouseGuardWizard = (() => {
  const titles={features:'Hva vil du bruke House Guard til?',connection:'API-nøkkel',people:'Beboere og varsler',alarm:'Sett opp alarmen',routines:'Lys og ekstra handlinger',night:'Natt og morgen',finish:'Fullfør oppsettet'};
  function create(ctx) {
    const {el,api,flush,demo}=ctx,$=id=>document.getElementById(id);
    let features,step='features',storageKey,busy=false,testMessage='';
    const read=()=>ctx.read(),steps=()=>HouseGuardOnboarding.steps(features);
    function remember(){try{localStorage.setItem(storageKey,JSON.stringify({features,step}));}catch{/* Storage may be unavailable inside Homey. */}}
    function error(e){$('setup-error').textContent=e.message || String(e);}
    function button(parent,title,fn,primary=false){const b=el('button',title,primary?'primary':'');b.type='button';b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await fn();}catch(e){error(e);}finally{busy=false;if(b.isConnected)b.disabled=false;}};parent.append(b);return b;}
    function choice(parent,title,checked,fn){const label=el('label',undefined,'check'),input=el('input');input.type='checkbox';input.checked=checked;input.onchange=()=>{try{fn(input.checked);}catch(e){input.checked=!input.checked;error(e);}};label.append(input,document.createTextNode(title));parent.append(label);return input;}
    function update(fn,rerender=true){ctx.change(fn);if(rerender)render();}
    function detail(parent,title){const d=el('details'),s=el('summary',title);d.append(s);parent.append(d);return d;}
    function names(ids){const {data}=read();return ids.map(id=>data.catalog.people[id]?.name || 'Utilgjengelig person').join(', ');}
    function go(next){if(!steps().includes(next)&&['alarm','routines','night'].includes(next))features[next]=true;step=next;remember();render();$('setup-dialog').scrollTop=0;$('setup-title').focus();}
    function checks(){const {config,data}=read();return HouseGuardOnboarding.checklist(config,data,features);}
    async function open(target){
      await flush();await ctx.refresh();
      const {config,data}=read(),actual=HouseGuardOnboarding.inferFeatures(config);
      storageKey='houseguard.guide.v2:'+Object.keys(data.catalog.people || {}).sort().join(',');
      let saved;try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}
      features=Object.fromEntries(Object.keys(actual).map(key=>[key,actual[key]||saved?.features?.[key]===true]));
      step=target || (steps().includes(saved?.step)?saved.step:'features');
      if(!steps().includes(step)){if(['alarm','routines','night'].includes(step))features[step]=true;else step='features';}
      testMessage='';render();$('setup-dialog').showModal();
    }
    function render(){
      const {config,data}=read(),body=$('setup-body'),list=steps();
      $('setup-title').textContent=titles[step];$('setup-progress').textContent=`Steg ${list.indexOf(step)+1} av ${list.length}`;
      $('setup-back').hidden=step==='features';$('setup-next').hidden=step==='finish';$('setup-next').textContent='Neste';$('setup-error').textContent='';body.replaceChildren();
      if(step==='features'){
        body.append(el('p','Velg hva du vil ha hjelp til å sette opp. Du kan legge til mer senere.','hint'));
        for(const [id,title,copy]of [['alarm','Alarm','Overvåk huset når dere er borte eller sover.'],['routines','Lys og rutiner','Start Homey-Flows ved borte, hjemkomst og natt.'],['night','Natt og morgen','La huset følge hvem som sover og hvem som er våken.']]){
          const card=el('div',undefined,'setup-choice');choice(card,title,features[id],value=>{features[id]=value;remember();render();});card.append(el('p',copy,'hint'));body.append(card);
        }
        body.append(el('p','Valgene tilpasser veiviseren. Funksjoner du allerede bruker fortsetter som før. Du kan også bruke bare tilstedeværelse og gjestemodus.','hint'));
      }else if(step==='connection'){
        const direct=data.direct || data.catalog.direct || {};
        body.append(el('p','Forbindelsen lar House Guard starte dine Flows og sende push, kamerabilder og sovestatus direkte.','hint'),el('p',direct.ready?'Forbindelsen er klar.':direct.configured?'Forbindelsen må kontrolleres.':'Forbindelse er ikke satt opp.',direct.ready?'setup-success':'setup-notice'));
        if(!direct.ready){
          const how=el('ol',undefined,'setup-instructions');for(const text of ['Åpne Homeys nettapp → Innstillinger → API-nøkler.','Opprett en nøkkel med Flows-tilgang (full tilgang).','Lim inn nøkkelen nedenfor. Den lagres og kontrolleres automatisk.'])how.append(el('li',text));body.append(how);
          const label=el('label','API-nøkkel'),input=el('input');input.type='password';input.autocomplete='new-password';input.spellcheck=false;input.placeholder='Lim inn nøkkelen fra Homey';input.disabled=demo;label.append(input);body.append(label);
          const save=async()=>{const token=input.value.trim();if(!token||busy)return;busy=true;input.disabled=true;input.value='';try{await ctx.key({token});render();}catch(e){error(e);}finally{busy=false;if(input.isConnected)input.disabled=demo;}};
          input.onchange=save;input.onpaste=()=>setTimeout(save,0);
          body.append(el('p','Nøkkelen vises ikke igjen og blir ikke med i sikkerhetskopier. Tilgangskontrollen sender ingen varsler eller enhetskommandoer.','hint'));
        }
        if(direct.configured)button(body,'Kontroller forbindelse',async()=>{await ctx.key({check:true});render();}).disabled=demo;
        if(direct.problem)body.append(el('p',direct.problem,'error'));
        if(demo)body.append(el('p','Demoen kobler ikke til Homey. Du kan gå gjennom resten av oppsettet.','hint'));
        else if(!direct.ready)body.append(el('p','Du kan fylle ut resten først. Sjekklisten til slutt viser hvilke valgte funksjoner som trenger forbindelsen.','hint'));
      }else if(step==='people'){
        body.append(el('p','Beboere teller med når huset avgjør om noen er hjemme. Velg separat hvem som skal få alle appens pushvarsler.','hint'));
        const ids=[...new Set([...Object.keys(data.catalog.people || {}),...config.people.presence,...config.people.notifications])];
        for(const id of ids){
          const p=data.catalog.people[id],row=el('div',undefined,'person-config');row.append(el('strong',p?.name || 'Utilgjengelig person'));
          const roles=el('div',undefined,'person-roles');
          for(const [role,title]of [['presence','Bor her / teller med'],['notifications','Motta pushvarsler']])choice(roles,title,config.people[role].includes(id),value=>update(c=>{c.people[role]=value?[...new Set([...c.people[role],id])]:c.people[role].filter(x=>x!==id);if(role==='presence'&&!value)c.people.night=c.people.night.filter(x=>x!==id);}));
          row.append(roles);if(!p||p.available===false)row.append(el('p','Personen er utilgjengelig i Homey.','error'));body.append(row);
        }
        if(!ids.length)body.append(el('p','Ingen personer funnet. Kontroller forbindelsen og oppdater listen.','error'));
        button(body,'Oppdater personer',async()=>{await ctx.refresh();render();});
      }else if(step==='alarm'){
        const selected=config.security.alarmDeviceId==='house-guard-internal-alarm';
        const alarmBusy=data.intrusion&&(data.intrusion.mode!=='disarmed'||data.intrusion.target||data.intrusion.active||data.intrusion.entryAt);
        choice(body,'Bruk House Guard-alarm',selected,value=>update(c=>{c.security.alarmDeviceId=value?'house-guard-internal-alarm':'';})).disabled=selected&&!!alarmBusy;
        if(selected){
          if(config.observation && data.intrusion && (data.intrusion.mode!=='disarmed'||data.intrusion.target||data.intrusion.active||data.intrusion.entryAt)){
            body.append(el('p','Testalarmen er fortsatt tilkoblet. Frakoble den før du endrer sensorer eller tar appen i bruk.','setup-notice'));
            button(body,'Frakoble alarmen',async()=>{const live=await api('GET','/state');if(!live.config.observation)throw Error('Appen er nå i aktiv drift. Kontroller alarmen under Alarm.');await api('POST','/command',{type:'alarm',mode:'disarmed'});await ctx.refresh();render();});
          }
          if(!config.observation&&alarmBusy){body.append(el('p','Alarmen er tilkoblet. Sensorvalgene kan endres når alarmen er frakoblet.','setup-notice'));button(body,'Åpne alarmoversikt',()=>{remember();$('setup-dialog').close();ctx.navigate({tab:'security',alarmTab:'overview',id:'intrusion-settings',step:'alarm'});});}
          body.append(el('h3','Når skal alarmen være på?'));
          body.append(el('p','Full bortealarm kobles alltid til når alle beboere er bekreftet borte og gjestemodus er av. De vanlige forsinkelsene gjelder.','hint'));
          for(const [id,title]of [['night','Nattalarm når huset går i nattmodus'],['home','Frakoble når noen kommer hjem']])choice(body,title,config.security.automation[id],value=>update(c=>{c.security.automation[id]=value;}));
          const extra=detail(body,'Morgen og oppvåkning');for(const [id,title]of [['firstWake','Frakoble når første hjemmeværende våkner'],['morning','Frakoble når morgenmodus starter']])choice(extra,title,config.security.automation[id],value=>update(c=>{c.security.automation[id]=value;},false));
          body.append(el('h3','Hvilke sensorer skal følge med?'),el('p','Borte: vanligvis alle sensorer. Natt: dører og vinduer, og andre sensorer som ikke forstyrres når dere beveger dere inne.','hint'));
          renderSensors(body,config,data);
          body.append(el('h3','Varsling ved alarm'));
          choice(body,'Send push når alarmen utløses',config.security.responses.alarm.push,value=>update(c=>{c.security.responses.alarm.push=value;}));
          body.append(el('p',config.people.notifications.length?'Mottakere: '+names(config.people.notifications)+'.':'Ingen pushmottakere valgt. Velg dem i steget Beboere og varsler.','hint'));
          body.append(el('p','Alarmen bruker eksisterende inn-/utgangsforsinkelser. Kamera, kritisk push, lyd, lys og forsinkelser kan tilpasses under Alarm. Gjestemodus holder alarmen frakoblet.','hint'));
        }
      }else if(step==='routines'){
        body.append(el('p','Valgfritt: Velg Flows du har laget i Homey, for eksempel «Slå av alle lys». House Guards alarm trenger ingen hjelpeflow.','hint'));
        const flows=HouseGuardSetup.flowChoices(data.catalog),selections=HouseGuardSetup.selections(config);
        for(const [id,title]of [['away','Når alle drar'],['home','Når første person kommer hjem'],['night','Når nattmodus starter']]){
          const label=el('label',title,'setup-flow'),select=el('select');select.add(new Option('Ingen ekstra Flow',''));
          for(const flow of flows){const option=new Option(`${flow.name}${flow.type==='advanced'?' · Advanced Flow':''}${flow.reason?' · '+flow.reason:''}`,flow.key);option.disabled=!flow.selectable;select.add(option);}
          if(selections[id]&&!flows.some(f=>f.key===selections[id])){const option=new Option('Valgt Flow er utilgjengelig',selections[id]);option.disabled=true;select.add(option);}
          select.value=selections[id];select.onchange=()=>{try{ctx.replace(HouseGuardSetup.change(read().config,{flows:{[id]:select.value}},read().data.catalog));render();}catch(e){render();error(e);}};label.append(select);body.append(label);
          const routine=config.routines.find(r=>r.id===id),oldLights=routine?.actions.filter(a=>a.setupManaged&&a.kind==='set').length;
          if(oldLights)body.append(el('p',`${oldLights} tidligere lysvalg fra veiviseren erstattes hvis du endrer dette Flow-valget.`,'hint'));
          if((routine?.actions.length || 0)>1)body.append(el('p','Denne rutinen har flere handlinger. De kan ses og endres under Rutiner.','hint'));
        }
        const help=detail(body,'Om Flow-valgene');help.append(el('p','Advanced Flow trenger et Start-kort. Deaktiverte Flows, Flows med feil og Flows som krever en tagg kan ikke velges. Egne handlinger beholdes; samme Flow legges ikke til to ganger.','hint'));
        button(body,'Oppdater Flow-listen',async()=>{await ctx.refresh();render();});
      }else if(step==='night'){
        body.append(el('p','Velg hvem som skal telle med når huset går i nattmodus. Bare de som er hjemme settes sovende.','hint'));
        for(const id of config.people.presence)choice(body,data.catalog.people[id]?.name || 'Utilgjengelig person',config.people.night.includes(id),value=>update(c=>{c.people.night=value?[...new Set([...c.people.night,id])]:c.people.night.filter(x=>x!==id);},false));
        body.append(el('h3','Hva skal skje?'));
        body.append(el('p','Hjemmeværende i nattutvalget settes alltid sovende når nattmodus starter.','hint'));
        choice(body,'Ved nattankomst: sett bare den som kommer hjem våken',config.night.wakeArrival,value=>update(c=>{c.night.wakeArrival=value;},false));
        body.append(el('p','Natt og morgen kan startes fra Hjem eller egne Homey-Flows. Under Rutiner setter du opp nattspørsmål i Aktivering av Nattmodus, og morgenstart, bevegelse og oppvåkning i Deaktivering av Nattmodus.','hint'));
        for(const [title,id] of [['Aktivering av Nattmodus','night-activation-settings'],['Deaktivering av Nattmodus','alarm-deactivation-settings']])button(body,'Åpne '+title,()=>{remember();$('setup-dialog').close();ctx.navigate({tab:'routines',id,step:'night'});});
      }else renderFinish(body,config,data);
    }
    function renderSensors(body,config,data){
      const filter=el('input');filter.type='search';filter.placeholder='Søk etter sensor eller rom';filter.setAttribute('aria-label','Søk etter alarmsensor');body.append(filter);
      const list=el('div',undefined,'setup-sensors');body.append(list);const choices=new Map();
      for(const d of Object.values(data.catalog.devices || {}))for(const cap of ['alarm_contact','alarm_motion'])if(d.capabilities?.[cap])choices.set(JSON.stringify([d.id,cap]),{d,cap});
      for(const s of config.security.intrusion.sensors)if(!choices.has(JSON.stringify([s.deviceId,s.capability])))choices.set(JSON.stringify([s.deviceId,s.capability]),{d:{id:s.deviceId,name:'Utilgjengelig valgt sensor',available:false},cap:s.capability});
      for(const {d,cap}of [...choices.values()].sort((a,b)=>`${a.d.zone} ${a.d.name}`.localeCompare(`${b.d.zone} ${b.d.name}`,'nb'))){
        const row=el('div',undefined,'person-config'),selected=config.security.intrusion.sensors.find(s=>s.deviceId===d.id&&s.capability===cap);row.dataset.search=`${d.name} ${d.zone || ''}`.toLocaleLowerCase('nb');
        row.append(el('strong',`${d.name} · ${d.zone || 'Uten rom'}`));const roles=el('div',undefined,'person-roles');
        for(const [key,title]of [['full','Bortealarm'],['partial','Nattalarm']])choice(roles,title,!!selected?.[key],value=>update(c=>{const sensors=c.security.intrusion.sensors;let s=sensors.find(s=>s.deviceId===d.id&&s.capability===cap);if(!s){s={deviceId:d.id,capability:cap,full:false,partial:false,delay:false};sensors.push(s);}s[key]=value;if(!s.full&&!s.partial)sensors.splice(sensors.indexOf(s),1);},false)).disabled=!!(data.intrusion?.selected&&(data.intrusion.mode!=='disarmed'||data.intrusion.target||data.intrusion.active||data.intrusion.entryAt));
        row.append(roles);if(d.available===false)row.append(el('p','Utilgjengelig i Homey','error'));list.append(row);
      }
      filter.oninput=()=>{for(const row of list.children)row.hidden=!(row.dataset.search || '').includes(filter.value.toLocaleLowerCase('nb'));};
      if(!choices.size)list.append(el('p','Ingen dør- eller bevegelsessensorer funnet.','hint'));
    }
    function renderFinish(body,config,data){
      body.append(el('p','Se hva som er klart, prøv et varsel og velg når huset skal styres.','hint'));
      const items=checks(),missing=items.filter(c=>c.required&&!c.ready),list=el('ul',undefined,'setup-checklist'),completed=el('ul',undefined,'setup-checklist');
      for(const item of items){const row=el('li'),copy=el('div');copy.append(el('strong',item.title+(item.required?'':' (valgfritt)')),el('p',item.detail,'hint'));row.append(el('span',item.ready?'✓':item.required?'!':'○',item.ready?'check-ok':'check-missing'),copy);if(!item.ready)button(row,'Se oppsett',()=>{if(item.target){remember();$('setup-dialog').close();ctx.navigate({...item.target,step:item.step});}else go(item.step);});(item.ready?completed:list).append(row);}body.append(list);
      if(completed.children.length){const done=detail(body,completed.children.length+' punkter er klare');done.append(completed);}
      if(!missing.length)body.append(el('p','Oppsettet er klart. Prøv varsling på telefonen før du aktiverer huset.','setup-success'));
      button(body,'Oppdater sjekklisten',async()=>{await ctx.refresh();render();});
      const alarm=config.security.alarmDeviceId==='house-guard-internal-alarm';
      body.append(el('p',`Beboere: ${names(config.people.presence) || 'Ingen'}. Varselmottakere: ${names(config.people.notifications) || 'Ingen'}.`,'summary-line'));
      if(alarm)body.append(el('p',`Alarm: ${config.security.intrusion.sensors.filter(s=>s.full).length} valgt for borte, ${config.security.intrusion.sensors.filter(s=>s.partial).length} for natt.`,'summary-line'));
      const selectedFlows=config.routines.filter(r=>r.enabled).flatMap(r=>r.actions.filter(a=>a.kind==='flow').map(a=>`${r.name}: ${data.catalog.flows?.find(f=>f.id===a.flowId&&f.type===a.flowType)?.name || 'Utilgjengelig Flow'}`));
      if(selectedFlows.length)body.append(el('p','Flows: '+selectedFlows.join(' · '),'summary-line'));
      if(config.people.night.length)body.append(el('p','Teller med om natten: '+names(config.people.night)+'.','summary-line'));
      body.append(el('h3','Prøv varsling'));
      const test=button(body,'Send testvarsel',async()=>{await flush();const result=await api('POST','/direct-test',{type:'push',notificationType:'normal'});testMessage=result.accepted===false?'Varselet ble ikke akseptert.':'Homey har akseptert testvarselet. Kontroller at det kom på telefonen.';render();});test.disabled=demo||!(data.direct || data.catalog.direct)?.ready||!config.people.notifications.length;
      body.append(el('p',testMessage || 'Sender ett vanlig testvarsel til hver valgt mottaker. Testen aktiverer ingen alarm eller rutiner og kan også brukes før oppsettet er ferdig.','hint'));
      if(data.config.observation){
        body.append(el('h3','Ta i bruk'),el('p','Når du aktiverer styringen, kan alarm, rutiner, personstatus og varsler følge innstillingene dine. Kontroller at oppsummeringen stemmer.','hint'));
        const activate=button(body,'Ta i bruk House Guard',async()=>{await flush();await ctx.refresh();const outstanding=checks().filter(c=>c.required&&!c.ready);if(outstanding.length){render();throw Error('Fullfør punktene som mangler før du aktiverer styringen.');}ctx.replace(HouseGuardOnboarding.finish(read().config));await flush();await ctx.reload();$('setup-dialog').close();remember();},true);activate.disabled=demo||missing.length>0;
        if(missing.length)body.append(el('p',`${missing.length} ${missing.length===1?'punkt må':'punkter må'} fullføres før aktivering. Du kan lukke og fortsette senere.`,'hint'));
        if(demo)body.append(el('p','Aktivering og testvarsler er slått av i demoen.','hint'));
        button(body,'Fortsett senere',async()=>{ctx.replace(HouseGuardOnboarding.defer(read().config));await flush();await ctx.reload();$('setup-dialog').close();remember();});
      }else{
        body.append(el('p','Oppsettet er i bruk. Endringer lagres automatisk.','setup-success'));
        button(body,'Ferdig',async()=>{update(c=>{c.setupCompleted=true;},false);await flush();await ctx.reload();$('setup-dialog').close();remember();},true);
      }
    }
    $('setup-back').onclick=()=>go(steps()[steps().indexOf(step)-1]);
    $('setup-next').onclick=async()=>{if(busy)return;busy=true;$('setup-next').disabled=true;try{if(step==='people'&&!read().config.people.presence.length)throw Error('Velg minst én beboer som skal telle med.');await flush();const next=steps()[steps().indexOf(step)+1];if(next==='finish')await ctx.refresh();go(next);}catch(e){error(e);}finally{busy=false;$('setup-next').disabled=false;}};
    $('close-setup').onclick=()=>{$('setup-dialog').close();remember();};
    $('setup-dialog').addEventListener('cancel',remember);
    return {open,render};
  }
  return {create};
})();
