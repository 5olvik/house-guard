'use strict';
window.HouseGuardEnvironment = (() => {
  const model = HouseGuardEnvironmentModel, types = { fire: 'Brann', water: 'Vann' }, sounds = new Map(), acknowledging = new Set();
  let testing = false;
  const $ = id => document.getElementById(id);
  function jump(part) { document.querySelector('[data-tab="environment"]').click(); document.querySelector('[data-environment-tab="' + part + '"]').click(); }
  function initializeTabs() {
    const tabs = [...document.querySelectorAll('[data-environment-tab]')];
    const select = (tab, focus = false) => {
      for (const button of tabs) { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; }
      document.querySelectorAll('[data-environment-panel]').forEach(panel => { panel.hidden = panel.dataset.environmentPanel !== tab.dataset.environmentTab; });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.onclick = () => select(tab);
      tab.onkeydown = event => {
        const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
        if (next !== undefined) { event.preventDefault(); select(tabs[next], true); }
      };
    });
  }
  function render(ctx) {
    const { config, data, el, options, changed, api, flush, load, toast, demo } = ctx, c = config.environment;
    const choices = () => model.discover(data.catalog, c.sensors, data.environment?.sensors || []);
    const rerender = () => render(ctx);
    const devices = Object.values(data.catalog.devices || {});
    const speakers = devices.filter(d => d.driverId?.includes('sonos')).map(d => ({ id: d.id, label: d.name + ' · ' + d.zone }));
    const lights = devices.filter(d => d.class === 'light' && d.capabilities?.onoff?.setable && ![config.security.lockDeviceId, config.security.garage.commandDeviceId].includes(d.id));
    const cameras = devices.filter(d => d.images?.some(i => i.type === 'camera')).map(d => ({ id: d.id, label: d.name + ' · ' + d.zone }));
    function field(parent, title, object, name, type = 'checkbox', items, limits) {
      const label = el('label', type === 'checkbox' ? undefined : title, type === 'checkbox' ? 'check' : undefined), input = el(items ? 'select' : 'input');
      if (items) options(input, items, object[name]);
      else { input.type = type; if (type === 'checkbox') input.checked = object[name]; else input.value = object[name]; }
      if (limits) { input.min = String(limits[0]); input.max = String(limits[1]); }
      if (type === 'text') input.maxLength = 500;
      const update = () => {
        if (!input.checkValidity() || type === 'number' && input.value === '') return;
        object[name] = type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value;
        changed(type === 'checkbox' || !!items);
      };
      if (['text','number'].includes(type) && !items) input.oninput = update; else input.onchange = update;
      label.append(input); if (type === 'checkbox') label.append(document.createTextNode(title)); parent.append(label); return input;
    }
    function remove(parent, list, item, text) {
      const button = el('button', text); button.onclick = () => { list.splice(list.indexOf(item), 1); changed(true); rerender(); }; parent.append(button);
    }
    const overview = $('environment-overview'); overview.replaceChildren();
    const setup = el('div', undefined, 'card'); overview.append(setup);
    setup.append(el('h2', 'Overvåking hele døgnet'));
    const enabled = field(setup, 'Overvåk valgte brann- og vannsensorer', c, 'enabled');
    enabled.disabled = !c.sensors.length && !c.enabled;
    enabled.addEventListener('change', () => renderStatus(ctx));
    setup.append(el('p', 'Velg sensorer og varsler først. Overvåkingen følger deretter sensorene uansett husmodus. Fysiske røykvarslere beholder sin egen alarm.', 'hint'));
    const buttons = el('div', undefined, 'button-row'); setup.append(buttons);
    for (const [part, text] of [['sensors','Velg sensorer'], ['responses','Velg varsler og handlinger']]) { const button = el('button', text); button.onclick = () => jump(part); buttons.append(button); }
    setup.append(el('p', undefined, 'hint')); setup.lastChild.id = 'environment-monitoring-state'; setup.lastChild.setAttribute('role', 'status');
    const incidents = el('div'); incidents.id = 'environment-incidents'; overview.append(incidents);
    const deliveries = el('div', undefined, 'card'); deliveries.id = 'environment-deliveries'; overview.append(deliveries);
    const oldFlows = el('details', undefined, 'card'); oldFlows.append(el('summary', 'Eksisterende brann- og vannflows'), el('p', 'Har du allerede Flows som varsler eller styrer enheter ved brann/vann? Gå gjennom dem før du aktiverer samme handling her, slik at du unngår doble varsler. House Guard endrer eller sletter ikke eksisterende Flows.', 'hint')); overview.append(oldFlows);

    const healthOpen=$('water-health-settings')?.open || false;
    const sensors = $('environment-sensors'); sensors.replaceChildren();
    const introduction = el('div', undefined, 'card'); introduction.append(el('h2', 'Velg sensorer'), el('p', 'Kompatible sensorer finnes automatisk. Temperatur og batteri vises som informasjon. Røyk-, brann-, varme- og vannalarm er det som utløser varsler.', 'hint')); sensors.append(introduction);
    for (const type of Object.keys(types)) {
      const card = el('div', undefined, 'card'), items = choices().filter(s => s.kind === type); sensors.append(card);
      card.append(el('h2', type === 'fire' ? 'Røyk og brann' : 'Vannlekkasje'));
      const selectAll = el('button', 'Velg alle i denne gruppen'); selectAll.disabled = !items.length;
      selectAll.onclick = () => { for (const sensor of items) if (!c.sensors.some(s => model.key(s) === model.key(sensor)) && c.sensors.length < 100) c.sensors.push({ deviceId: sensor.deviceId, capability: sensor.capability }); changed(true); rerender(); }; card.append(selectAll);
      for (const sensor of items) {
        const row = el('label', undefined, 'environment-sensor'), check = el('input'), copy = el('div'); check.type = 'checkbox'; check.checked = sensor.selected;
        copy.append(el('strong', sensor.name + ' · ' + sensor.zone));
        const status = el('small'); status.dataset.environmentSensor = model.key(sensor); copy.append(status); row.append(check, copy); card.append(row);
        check.onchange = () => {
          const index = c.sensors.findIndex(s => model.key(s) === model.key(sensor));
          if (check.checked && index < 0 && c.sensors.length < 100) c.sensors.push({ deviceId: sensor.deviceId, capability: sensor.capability });
          else if (!check.checked && index >= 0) c.sensors.splice(index, 1);
          if (!c.sensors.length) c.enabled = false;
          changed(true); rerender();
        };
      }
      if (!items.length) card.append(el('p', 'Ingen kompatible sensorer funnet i denne gruppen.', 'hint'));
      if (type === 'water') card.append(el('p', 'En ny vannsensor kan rapportere temperatur før den har rapportert sin første vannalarmverdi. Den kan likevel velges og overvåkes.', 'hint'));
      if(type==='water') {
        const health=el('details',undefined,'water-health-settings');health.id='water-health-settings';health.open=healthOpen;health.append(el('summary','Kontroll av vannsensorer'));
        const grid=el('div',undefined,'form-grid'),h=c.waterHealth;health.append(grid);
        field(grid,'Kontroller at vannsensorene rapporterer jevnlig',h,'enabled');
        field(grid,'Varsle etter timer uten måleoppdatering',h,'thresholdHours','number',undefined,[1,720]);
        field(grid,'Send kontrollvarsel til valgte pushmottakere',h,'push');field(grid,'Bruk kritisk push for kontrollvarselet',h,'critical');
        field(grid,'Vis kontrollvarsel i tidslinjen',h,'timeline');field(grid,'Gjenta ukvittert kontrollvarsel etter timer',h,'repeatHours','number',undefined,[1,720]);
        field(grid,'Send vanlig push når sensorene rapporterer igjen',h,'restoredPush');
        health.append(el('p','Standard er 24 timer. Appen følger siste registrerte temperatur, RSSI, batterispenning eller batterinivå, og kontrollerer hvert femte minutt. En faktisk alarmrapport teller også som kontakt. Nye sensorer får tid til å rapportere.','hint'));
        health.append(el('p','Dette er et kontrollvarsel om rapporteringen. Det utløser ingen lekkasjealarm eller enhets-/Flow-handlinger. En gammel måleverdi alene beviser ikke at sensoren er offline.','hint'));
        const report=el('div');report.id='water-health-status';health.append(report);card.append(health);
      }
    }

    const responses = $('environment-responses'), open = new Set([...responses.querySelectorAll('details[open][data-environment-section]')].map(d => d.dataset.environmentSection)); responses.replaceChildren();
    const recipients = el('div', undefined, 'card'); responses.append(recipients);
    recipients.append(el('h2', 'Mottakere'), el('p', config.people.notifications.length ? config.people.notifications.map(id => data.catalog.people[id]?.name || 'Utilgjengelig person').join(', ') : 'Velg hvem som skal motta push under Personer.', 'hint'));
    const people = el('button', 'Velg mottakere'); people.onclick = () => document.querySelector('[data-tab="people"]').click(); recipients.append(people);
    if (!data.direct?.ready) {
      recipients.append(el('p', 'Legg inn API-nøkkelen for direkte push, kamerabilder, Sonos og start av Flows.', 'hint'));
      const connection = el('button', 'Åpne API-nøkkel'); connection.onclick = () => { document.querySelector('[data-tab="more"]').click(); $('direct-api-settings').open = true; $('direct-api-settings').scrollIntoView({ block: 'start' }); }; recipients.append(connection);
    }
    function section(parent, id, title) {
      const detail = el('details', undefined, 'response-part'); detail.dataset.environmentSection = id; detail.open = open.has(id); detail.append(el('summary', title)); parent.append(detail); return detail;
    }
    for (const type of Object.keys(types)) {
      const r = c.responses[type], card = el('details', undefined, 'card'); card.dataset.environmentSection = type; card.open = open.has(type);
      card.append(el('summary', type === 'fire' ? 'Ved røyk eller brannalarm' : 'Ved vannlekkasje')); responses.append(card);
      const body = el('div', undefined, 'details-body'), grid = el('div', undefined, 'form-grid'); card.append(body); body.append(grid);
      field(grid, 'Send push til valgte mottakere', r, 'push'); field(grid, 'Bruk kritisk push', r, 'critical');
      field(grid, 'Vis hendelsen i Homeys tidslinje', r, 'timeline'); field(grid, 'Send vanlig push når sensorene slutter å melde alarm', r, 'restoredPush');
      body.append(el('p', 'Kritisk push må være tillatt for Homey på telefonen. Push sendes først; kamerabilder sendes som egne bildevarsler etterpå.', 'hint'));
      const cameraPart = section(body, type + '-cameras', 'Kamerabilder (valgfritt)');
      for (const id of r.imageDeviceIds) { const row = el('div', undefined, 'row'); row.append(el('span', data.catalog.devices[id]?.name || 'Kamera mangler')); remove(row, r.imageDeviceIds, id, 'Fjern kamera'); cameraPart.append(row); }
      const cameraAdd = el('select'); options(cameraAdd, cameras.filter(item => !r.imageDeviceIds.includes(item.id)), '', 'Legg til kamera …'); cameraAdd.setAttribute('aria-label', 'Legg til kamera for ' + types[type]); cameraAdd.disabled = r.imageDeviceIds.length >= 3;
      cameraAdd.onchange = () => { if (cameraAdd.value && r.imageDeviceIds.length < 3) { r.imageDeviceIds.push(cameraAdd.value); changed(true); rerender(); } }; cameraPart.append(cameraAdd, el('p', 'Inntil tre kameraer. Ett bildevarsel per kamera til hver mottaker.', 'hint')); field(cameraPart, 'Send også bilder ved gjentatte varsler', r, 'imageOnRepeat');
      const messagePart = section(body, type + '-text', 'Tilpass alarmmeldingen'); field(messagePart, 'Alarmmelding', r, 'text', 'text'); messagePart.append(el('p', '{zone}, {sensorName}, {reason} og {type} fylles inn automatisk.', 'hint'));
      const repeatPart = section(body, type + '-repeat', 'Gjentatte varsler'); field(repeatPart, 'Gjenta push til noen kvitterer varselet', r, 'repeatEnabled'); field(repeatPart, 'Gjenta hvert (sekunder)', r, 'repeatSeconds', 'number', undefined, [60, 3600]); repeatPart.append(el('p', 'Gjentakelse gjelder push og eventuelt bilder. Lyd, lys, vannstyring og Flows kjøres én gang ved starten av en hendelse.', 'hint'));
      const audioPart = section(body, type + '-audio', 'Lyd på Sonos (valgfritt)');
      for (const audio of r.audio) {
        const row = el('div', undefined, 'form-grid'); audioPart.append(row); const speaker = field(row, 'Høyttaler', audio, 'deviceId', 'text', speakers);
        speaker.onchange = () => { audio.deviceId = speaker.value; changed(true); rerender(); };
        const audioKind = field(row, 'Beskjed', audio, 'kind', 'text', [{ id: 'speak', label: 'Tale' }, { id: 'sound', label: 'Alarmlyd' }]);
        audioKind.onchange = () => { audio.kind = audioKind.value; audio.text = audio.kind === 'sound' ? 'alarm3' : r.text; changed(true); rerender(); };
        if (audio.kind === 'speak') field(row, 'Talebeskjed', audio, 'text', 'text');
        else {
          const sound = field(row, 'Alarmlyd', audio, 'text', 'text', sounds.get(audio.deviceId) || [{ id: audio.text, label: audio.text }]);
          if (!demo && !sounds.has(audio.deviceId)) api('POST', '/alarm-sounds', { deviceId: audio.deviceId }).then(items => { sounds.set(audio.deviceId, items); if (sound.isConnected) options(sound, items, audio.text, null); }).catch(() => {});
        }
        field(row, 'Volum', audio, 'volume', 'number', undefined, [1, 100]); remove(row, r.audio, audio, 'Fjern høyttaler');
      }
      const speakerAdd = el('select'); options(speakerAdd, speakers.filter(s => !r.audio.some(a => a.deviceId === s.id)), '', 'Legg til høyttaler …'); speakerAdd.setAttribute('aria-label', 'Legg til høyttaler for ' + types[type]); speakerAdd.onchange = () => { if (speakerAdd.value) { r.audio.push({ deviceId: speakerAdd.value, kind: 'speak', text: r.text, volume: 35 }); changed(true); rerender(); } }; audioPart.append(speakerAdd);
      const lightPart = section(body, type + '-lights', 'Slå på lys (valgfritt)');
      for (const id of r.lights) { const row = el('div', undefined, 'row'); row.append(el('span', data.catalog.devices[id]?.name || 'Lys mangler')); remove(row, r.lights, id, 'Fjern lys'); lightPart.append(row); }
      const lightAdd = el('select'); options(lightAdd, lights.filter(d => !r.lights.includes(d.id)).map(d => ({ id: d.id, label: d.name + ' · ' + d.zone })), '', 'Legg til lys …'); lightAdd.setAttribute('aria-label', 'Legg til lys for ' + types[type]); lightAdd.onchange = () => { if (lightAdd.value) { r.lights.push(lightAdd.value); changed(true); rerender(); } }; lightPart.append(lightAdd);
      const controls = section(body, type + '-controls', type === 'water' ? 'Steng vannet (valgfritt)' : 'Lås opp ytterdøren (valgfritt)');
      if (type === 'water') {
        const devicesForWater = devices.filter(d => d.capabilities?.onoff?.setable && d.capabilities.onoff.type === 'boolean' && d.class !== 'light' && d.class !== 'lock' && !d.capabilities.locked && !d.capabilities.lock_unlock_open && ![config.security.garage.commandDeviceId, config.security.lockDeviceId].includes(d.id)).map(d => ({ id: d.id, label: d.name + ' · ' + d.zone }));
        const relay = field(controls, 'Enhet som stenger vannet når den slås AV', r.shutoff, 'deviceId', 'text', devicesForWater);
        relay.onchange = () => { r.shutoff.deviceId = relay.value; r.shutoff.validated = false; r.shutoff.enabled = false; changed(true); rerender(); };
        const validated = field(controls, 'Jeg har bekreftet at AV på denne enheten stenger vannet', r.shutoff, 'validated'); validated.disabled = !r.shutoff.deviceId;
        validated.onchange = () => { r.shutoff.validated = validated.checked; if (!r.shutoff.validated) r.shutoff.enabled = false; changed(true); rerender(); };
        const shutoff = field(controls, 'Slå AV denne enheten ved vannalarm', r.shutoff, 'enabled'); shutoff.disabled = !r.shutoff.validated;
        controls.append(el('p', 'Homey kan bekrefte AV på enheten, men en bryter uten ventilstatus bekrefter ikke fysisk stengt vann. Vannet åpnes aldri automatisk når alarmen opphører.', 'hint'));
      } else {
        const unlock = field(controls, 'Lås opp valgt ytterdør ved røyk eller brannalarm', r, 'unlockDoor'); unlock.disabled = !config.security.lockDeviceId && !r.unlockDoor;
        controls.append(el('p', config.security.lockDeviceId ? 'Gjelder ' + (data.catalog.devices[config.security.lockDeviceId]?.name || 'valgt ytterdør') + '. Krever en ekte alarmhendelse; test av røykvarsler utløser ikke dette.' : 'Velg ytterdørlåsen under Alarm → Lås og port først.', 'hint'));
      }
      const flowPart = section(body, type + '-flows', 'Egne Flows (valgfritt)');
      for (const flow of r.flows) { const row = el('div', undefined, 'row'); row.append(el('span', data.catalog.flows.find(f => f.id === flow.flowId && f.type === flow.flowType)?.name || 'Flow mangler')); remove(row, r.flows, flow, 'Fjern Flow'); flowPart.append(row); }
      const flowAdd = el('select'); options(flowAdd, data.catalog.flows.filter(f => f.enabled !== false && !f.broken && f.triggerable !== false && !r.flows.some(item => item.flowId === f.id && item.flowType === f.type)).map(f => ({ id: f.type + ':' + f.id, label: f.name + (f.type === 'advanced' ? ' · Advanced' : '') })), '', 'Legg til Flow …'); flowAdd.setAttribute('aria-label', 'Legg til Flow for ' + types[type]); flowAdd.onchange = () => { if (flowAdd.value && r.flows.length < 10) { const [flowType, flowId] = flowAdd.value.split(':'); r.flows.push({ flowType, flowId }); changed(true); rerender(); } }; flowPart.append(flowAdd);
      flowPart.append(el('p', 'Velg en Flow som kan startes direkte. For egne avanserte automasjoner finnes også House Guard-kortene «Brann- eller vannalarm starter» og «Sensorene melder ikke lenger brann- eller vannalarm».', 'hint'));
      const test = section(body, type + '-test', 'Prøv varsler på telefonen'); test.append(el('p', 'Sender bare testvarsler til valgte mottakere. Ingen sensoralarm, lyd, lys, lås, vannstyring eller Flow utløses. Kritisk test kan gi lyd på telefonen.', 'hint'));
      const testButtons = el('div', undefined, 'button-row'), status = el('p', undefined, 'hint'); status.setAttribute('role', 'status'); test.append(testButtons, status);
      for (const [notificationType, text] of [['normal','Test vanlig push'], ['critical','Test kritisk push'], ['image','Test kamerabilder']]) {
        const button = el('button', text); button.disabled = demo || testing || !data.direct?.ready || !config.people.notifications.length || notificationType === 'image' && !r.imageDeviceIds.length; testButtons.append(button);
        button.onclick = () => HouseGuardButtons.run(button, async () => {
          if (testing) return; testing = true; status.textContent = 'Sender test …';
          try { await flush(); const result = await api('POST', '/direct-test', { type: 'push', notificationType, environmentType: type }); status.textContent = result.results ? result.results.map(item => item.name + ': ' + (item.accepted ? 'akseptert av Homey' : 'feilet')).join(' · ') + '. Kontroller telefonen.' : 'Homey har akseptert testvarselet. Kontroller telefonen.'; }
          catch (error) { status.textContent = error.message; }
          finally { testing = false; }
        }, { peers: testButtons.children, label: 'Sender …' });
      }
    }
    renderStatus(ctx);
  }
  function renderStatus(ctx) {
    const { data, config, el, api, flush, load, toast } = ctx, status = data.environment || { incidents: [], batches: [], sensors: [] };
    const selected = model.discover(data.catalog, config.environment.sensors, status.sensors || []), byKey = new Map(selected.map(s => [model.key(s), s]));
    const text = $('environment-monitoring-state');
    if (text) text.textContent = !config.environment.enabled ? 'Overvåkingen er av. ' + config.environment.sensors.length + ' sensorfunksjoner valgt.' : status.observing ? 'Sensorene er valgt. Fullfør grunnoppsettet før varsler og handlinger aktiveres.' : 'Overvåker ' + config.environment.sensors.length + ' sensorfunksjoner hele døgnet.';
    for (const node of document.querySelectorAll('[data-environment-sensor]')) {
      const sensor = byKey.get(node.dataset.environmentSensor); if (!sensor) continue;
      node.textContent = [model.label(sensor), typeof sensor.temperature === 'number' ? sensor.temperature + ' °C' : '', typeof sensor.battery === 'number' ? 'Batteri ' + sensor.battery + ' %' : ''].filter(Boolean).join(' · ');
      node.className = sensor.value === true ? 'error' : sensor.available === false ? 'missing' : '';
    }
    const root = $('environment-incidents'); if (!root) return; root.replaceChildren();
    const active = (status.incidents || []).filter(i => i.active), home = $('home-environment-alerts'); home.replaceChildren(); home.hidden = !active.length;
    for (const incident of active) {
      const sources = incident.sensors.filter(s => s.active), card = el('div', undefined, 'card environment-incident'); root.append(card);
      card.append(el('h2', types[incident.type] + ' – alarm registrert'), el('p', sources.map(s => s.name + ' · ' + s.zone).join(', ')), el('p', 'Startet ' + new Date(incident.startedAt).toLocaleString('nb-NO', { timeZone: config.timeZone }), 'hint'));
      for (const sensor of sources) {
        const reading = byKey.get(model.key(sensor));
        if (!reading?.selected || reading.available === false || reading.value === null) card.append(el('p', sensor.name + ': ' + (!reading?.selected ? 'Sensoren er ikke lenger valgt. Velg den igjen for å lese alarmstatus.' : reading.available === false ? 'Sensoren er utilgjengelig; alarmhendelsen beholdes.' : 'Venter på ny alarmstatus.'), 'hint'));
      }
      card.append(el('p', incident.acknowledgedAt ? 'Varslet er kvittert. Sensoralarm er fortsatt registrert.' : 'Kvittering stopper gjentatte House Guard-varsler. Den avstiller ikke fysiske røykvarslere.', 'hint'));
      const acknowledge = el('button', incident.acknowledgedAt ? 'Varslet er kvittert' : 'Jeg har sett varselet'); acknowledge.disabled = !!incident.acknowledgedAt || acknowledging.has(incident.id); card.append(acknowledge);
      acknowledge.onclick = () => HouseGuardButtons.run(acknowledge, async () => {
        if (acknowledging.has(incident.id)) return; acknowledging.add(incident.id);
        try { await flush(); await api('POST', '/command', { type: 'environment-ack', id: incident.id }); await load(); }
        catch (error) { toast(error.message); }
        finally { acknowledging.delete(incident.id); }
      }, { label: 'Kvitterer …' });
      const homeCard = el('div', undefined, 'card environment-incident'); homeCard.append(el('h2', types[incident.type] + ' – alarm registrert'), el('p', sources.map(s => s.zone + ' · ' + s.name).join(', ')));
      const open = el('button', 'Se alarmhendelsen'); open.onclick = () => jump('overview'); homeCard.append(open); home.append(homeCard);
    }
    if (!active.length) { const card = el('div', undefined, 'card'); card.append(el('h2', 'Ingen aktive alarmhendelser')); const last = [...(status.incidents || [])].reverse().find(i => !i.active); if (last) card.append(el('p', 'Sist avsluttet: ' + types[last.type] + ' · ' + new Date(last.endedAt).toLocaleString('nb-NO', { timeZone: config.timeZone }), 'hint')); root.append(card); }
    const health=status.waterHealth,healthRoot=$('water-health-status');
    if(healthRoot){
      healthRoot.replaceChildren();
      const labels={ok:'Har rapportert innen fristen',paused:'Kontrollen er ikke aktivert',waiting:'Venter på første måleoppdatering',stale:'Gammel måleoppdatering – kontroller sensoren',missing:'Ingen rapportert måleoppdatering',unsupported:'Ingen egnet måling å følge'};
      for(const sensor of health?.sensors || []){
        const row=el('div',undefined,'summary-line');row.append(el('strong',sensor.name+' · '+sensor.zone),el('p',labels[sensor.status]||'Venter på kontroll','hint'));
        const value=typeof sensor.value==='boolean'?(sensor.value?'sensoren meldte alarm':'sensoren meldte ikke alarm'):sensor.value+(sensor.unit?' '+sensor.unit:'');
        if(sensor.lastSignalAt!==null)row.append(el('p','Sist registrert '+(sensor.label||'rapport')+': '+new Date(sensor.lastSignalAt).toLocaleString('nb-NO',{timeZone:config.timeZone})+(sensor.value!==null?' · '+value:''),'hint'));healthRoot.append(row);
      }
      if(!health?.sensors?.length)healthRoot.append(el('p','Velg vannsensorer og aktiver overvåkingen for å bruke kontrollen.','hint'));
    }
    const warning=health?.warning;
    if(config.environment.enabled&&config.environment.waterHealth.enabled&&warning?.active){
      const card=el('div',undefined,'card environment-maintenance');card.append(el('h2','Vannsensorer trenger kontroll'),el('p',warning.names.join(', ')),el('p','Måleoppdateringene er gamle eller mangler. Dette er et kontrollvarsel om rapportering; ingen lekkasje er registrert av denne kontrollen.','hint'));
      const ack=el('button',warning.acknowledgedAt?'Kontrollvarsel er kvittert':'Kvitter kontrollvarsel');ack.disabled=!!warning.acknowledgedAt||acknowledging.has(warning.id);card.append(ack);
      ack.onclick=()=>HouseGuardButtons.run(ack,async()=>{
        if(acknowledging.has(warning.id))return;acknowledging.add(warning.id);
        try{await flush();await api('POST','/command',{type:'environment-health-ack',id:warning.id});await load();}catch(error){toast(error.message);}finally{acknowledging.delete(warning.id);}
      },{label:'Kvitterer …'});root.append(card);
      const homeCard=el('div',undefined,'card environment-maintenance');homeCard.append(el('h2','Vannsensorer trenger kontroll'),el('p',warning.names.join(', ')));
      const open=el('button','Se kontrollvarselet');open.onclick=()=>jump('sensors');homeCard.append(open);home.append(homeCard);home.hidden=false;
    }
    const deliveries = $('environment-deliveries'); deliveries.replaceChildren(el('h2', 'Siste varsler og handlinger'));
    const names = { pending: 'Venter', sending: 'Sender', waiting: 'Venter på enhetsstatus', accepted: 'Akseptert av Homey', confirmed: 'Enhetsstatus bekreftet', failed: 'Feilet', unknown: 'Ukjent utfall', cancelled: 'Avbrutt' };
    const actions = (status.batches || []).flatMap(batch => batch.actions.map(a => ({ ...a, type: batch.type,health:batch.health }))).slice(-12).reverse();
    for (const action of actions) {
      const title = action.kind === 'notify' ? action.notificationType === 'image' ? 'Kamerabilde' : action.notificationType === 'critical' ? 'Kritisk push' : 'Push' : action.kind === 'timeline' ? 'Tidslinje' : action.kind === 'flow' ? 'Flow' : ['speak','sound'].includes(action.kind) ? 'Sonos' : 'Enhetsstyring';
      const row = el('div', undefined, 'summary-line'); row.append(el('strong', (action.health?'Vannsensorkontroll':types[action.type]) + ' · ' + title + ' · ' + (names[action.status] || action.status))); if (action.detail) row.append(el('p', action.detail, ['failed','unknown'].includes(action.status) ? 'error' : 'hint')); deliveries.append(row);
    }
    if (!actions.length) deliveries.append(el('p', 'Ingen varsler eller handlinger utført ennå.', 'hint'));
  }
  return { render, renderStatus, initializeTabs };
})();
