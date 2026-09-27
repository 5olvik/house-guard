'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const labels = { alarm: 'Alarm', lights: 'Lys', av: 'Lyd og TV', ventilation: 'Ventilasjon', lock: 'Lås', garage: 'Garasjeport', notification: 'Varsler', people: 'Personstatus', other: 'Andre handlinger' };
  const kinds = { set: 'Sett enhet', flow: 'Start Flow', notify: 'Varsel', speak: 'Si tekst', sound: 'Spill lyd', timeline: 'Tidslinje', person: 'Sovestatus', garage: 'Lukk port', verify: 'Bekreft tilstand' };
  const resultNames = { planned:'Ville utført', info:'Informasjon', pending: 'Venter', checking: 'Kontrollerer', dispatching: 'Klargjør sending', sent: 'Sendt', waiting: 'Venter på tilstand', accepted: 'Akseptert', confirmed: 'Bekreftet', observed: 'Observasjon', skipped: 'Hoppet over', cancelled: 'Avbrutt', failed: 'Feil', unknown: 'Ukjent utfall' };
  const modeNames = { home: 'Hjemme', away: 'Borte', night: 'Natt', unknown: 'Ukjent' };
  let data, config, dirty = false, homey, demo = false, actionRoutine, editedAction, toastTimer, autosave, actionChanged = false;
  let setupStep = 0, setupOptions;
  const controlBusy = new Set(), controlErrors = {};
  let apiKeyBusy=false,apiKeyMessage='';
  function el(tag, text, className) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; }
  function get(object, path) { return path.split('.').reduce((v, key) => v?.[key], object); }
  function put(object, path, value) { const parts = path.split('.'); const key = parts.pop(); get(object, parts.join('.'))[key] = value; }
  function setDirty(immediate = false) { autosave.change(config, immediate); if(data && config) renderConnectionRecipes(); }
  function savingState(state) {
    dirty = state.pending;
    $('autosave-status').dataset.state = state.phase;
    const message = state.phase === 'error' ? `Ikke lagret: ${state.error?.message || 'Last inn lagret oppsett.'}` : state.phase === 'saving' ? 'Lagrer …' : 'Alle endringer er lagret automatisk';
    document.querySelectorAll('[data-autosave-message]').forEach(node => { node.textContent = message; node.classList.toggle('error', state.phase === 'error'); });
    $('reload-config').hidden = state.phase !== 'error';
    if (data) renderIntegrations();
  }
  async function flush() { if (autosave) await autosave.flush(); }
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500); }
  function api(method, path, body) {
    if (demo) return fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error || 'API-feil'); return value; });
    return new Promise((resolve, reject) => homey.api(method, path, body || null, (error, value) => error ? reject(new Error(error.message || error)) : resolve(value)));
  }
  function options(select, items, value, empty = 'Ikke valgt') {
    select.replaceChildren(); if (empty !== null) select.add(new Option(empty, ''));
    for (const item of items) select.add(new Option(item.label, item.id));
    if (value && !items.some(i => i.id === String(value))) select.add(new Option(`Mangler: ${value}`, value));
    select.value = value ?? '';
  }
  function deviceItems(filter = 'any') {
    const devices = Object.values(data.catalog.devices || {});
    return devices.filter(d=>!(d.driverId?.endsWith(':alarm-panel') || d.driverId==='alarm-panel')).filter(d => filter === 'camera' ? d.class === 'camera' || d.images?.some(i => i.type === 'camera') : Object.entries(d.capabilities).some(([id, c]) => filter === 'any' || (filter === 'writable' ? c.setable : filter === 'boolean' ? c.type === 'boolean' : id === filter || id.startsWith(`${filter}.`))))
      .map(d => {
        const duplicate = devices.filter(other => other.name === d.name && other.zone === d.zone).length > 1;
        const detail = d.capabilities.locked ? 'lås' : d.capabilities.alarm_contact ? 'kontakt' : d.id.slice(-8);
        return { id: d.id, label: `${d.name} · ${d.zone || 'Uten sone'}${duplicate ? ` · ${detail}` : ''}${d.available === false ? ' · utilgjengelig' : ''}` };
      }).sort((a, b) => a.label.localeCompare(b.label, 'nb'));
  }
  function fillSelects() {
    document.querySelectorAll('select[data-device]').forEach(s => options(s, deviceItems(s.dataset.device), get(config, s.dataset.bind)));
    document.querySelectorAll('select[data-capabilities]').forEach(s => {
      const d = data.catalog.devices[get(config, s.dataset.capabilities)];
      const items = Object.entries(d?.capabilities || {}).filter(([id, c]) => (!s.dataset.prefix || id===s.dataset.prefix || id.startsWith(s.dataset.prefix+'.')) && (!s.dataset.write || c.setable) && (!s.dataset.capType || c.type === s.dataset.capType)).map(([id, c]) => ({ id, label: `${c.title || id} (${id})` }));
      if(s.dataset.prefix)s.parentElement.hidden=items.length<=1;
      options(s, items, get(config, s.dataset.bind));
    });
    document.querySelectorAll('select[data-source="zones"]').forEach(s => options(s, Object.values(data.catalog.zones || {}).map(z => ({ id: z.id, label: z.name })), get(config, s.dataset.bind)));
  }
  function fillBindings() {
    fillSelects();
    document.querySelectorAll('[data-bind]').forEach(input => { const v = get(config, input.dataset.bind); if (input.type === 'checkbox') input.checked = input.dataset.checkedValue ? v === input.dataset.checkedValue : !!v; else input.value = String(v ?? ''); });
    $('timezone').textContent = `Tidssone: ${config.timeZone}. Bruker Homeys tidssone når appen er installert.`;
  }
  function bindEvents() {
    const changed = event => {
      const input = event.target; if (!input.dataset.bind) return;
      let value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
      if (input.dataset.checkedValue) value = input.checked ? input.dataset.checkedValue : '';
      if (input.dataset.valueType === 'boolean') value = value === 'true';
      if (input.dataset.valueType === 'scalar') value = scalar(value);
      if (!input.dataset.bind.includes('.')) config[input.dataset.bind] = value; else put(config, input.dataset.bind, value);
      if(input.dataset.bind==='morning.motion.deviceId'){
        config.morning.motion.capability=Object.keys(data.catalog.devices[value]?.capabilities || {}).find(id=>id==='alarm_motion' || id.startsWith('alarm_motion.')) || 'alarm_motion';
        if(!value){config.morning.motion.enabled=false;document.querySelector('[data-bind="morning.motion.enabled"]').checked=false;}
      }
      if (input.dataset.bind.startsWith('security.garage.') && !['security.garage.enabled', 'security.garage.validated'].includes(input.dataset.bind)) {
        config.security.garage.validated = false; config.security.garage.enabled = false;
        document.querySelector('[data-bind="security.garage.validated"]').checked = false;
        document.querySelector('[data-bind="security.garage.enabled"]').checked = false;
      }
      if (input.dataset.device) fillSelects(); setDirty(event.type === 'change'); renderConnectionRecipes();
      if(input.dataset.bind==='security.alarmDeviceId')renderIntrusion();
    };
    document.addEventListener('change', changed);
    document.addEventListener('input', event => { if (['text', 'number', 'time'].includes(event.target.type)) changed(event); });
  }
  function renderLogs(container, entries) {
    container.replaceChildren();
    if (!entries.length) { container.append(el('p', 'Ingen hendelser ennå.', 'empty')); return; }
    for (const entry of [...entries].reverse()) {
      const row = el('div', undefined, 'log-entry'), time = el('time', new Date(entry.at).toLocaleString('nb-NO', { day:'2-digit', month:'2-digit', hour: '2-digit', minute: '2-digit', timeZone: config.timeZone }));
      time.dateTime = new Date(entry.at).toISOString(); const copy = el('div', entry.message);
      if (entry.result || entry.routineId) copy.append(el('small', [resultNames[entry.result], config.routines.find(r => r.id === entry.routineId)?.name].filter(Boolean).join(' · ')));
      row.append(time, copy); container.append(row);
    }
  }
  function renderStatus() {
    const s = data.status;
    renderIntrusionStatus();
    $('connection').textContent = demo ? 'DEMO · Kun eksempeldata. Ingen tilkobling til Homey eller huset.' : !s.connected ? 'Homey-data er utilgjengelige. Handlinger krever fersk, bekreftet tilstand.' : s.observation ? 'OBSERVASJON · Beregner og logger. Ingen kommandoer, varsler eller spørsmål sendes.' : 'AKTIV · Valgte rutiner kan styre huset.';
    $('connection').className = `banner ${!s.observation || !s.connected ? 'warning' : ''}`;
    $('mode-title').textContent = modeNames[s.mode] || 'Ukjent'; $('mode-reason').textContent = s.reason;
    $('mode-icon').textContent = { home: '⌂', away: '↗', night: '☾', unknown: '?' }[s.mode];
    $('mode-badge').textContent = s.observation ? 'Observasjon' : 'Aktiv'; $('mode-badge').className = `badge ${s.observation ? 'warn' : 'ok'}`;
    $('guest-toggle').checked = s.guest;
    const people = $('home-people'); people.replaceChildren();
    for (const id of data.config.people.presence) {
      const p = s.people[id] || data.catalog.people[id] || { name: `Mangler: ${id}`, available: false };
      const pill = el('div', undefined, 'person-pill'), copy = el('div'); copy.append(el('strong', p.name || id));
      copy.append(el('small', p.available === false || p.present === null || p.present === undefined ? 'Ukjent status' : p.present ? (p.asleep === true ? 'Hjemme · sover' : p.asleep === false ? 'Hjemme · våken' : 'Hjemme · søvn ukjent') : 'Borte'));
      pill.append(el('div', (p.name || '?').slice(0, 1).toUpperCase(), 'avatar'), copy); people.append(pill);
    }
    if (!people.children.length) people.append(el('p', 'Velg personer i Personer-fanen for å beregne modus for huset.', 'empty'));
    renderHomeControls();
    const changed = data.config.night.markAsleep ? data.config.people.night.filter(id => s.people[id]?.present === true && s.people[id]?.available !== false).map(id => s.people[id]?.name || id) : [];
    $('manual-explanation').textContent = changed.length ? `Nattmodus vil sette disse sovende: ${changed.join(', ')}.${s.observation ? ' I observasjon logges dette bare.' : ''}` : 'Ingen personstatuser vil endres av nattoppsettet.';
    $('skip-status').textContent = s.skipUntil > Date.now() ? `Automatisk natt hoppes over til ${new Date(s.skipUntil).toLocaleString('nb-NO', { timeZone: config.timeZone })}.` : '';
    const pending = $('pending-list'); pending.replaceChildren();
    let count = 0;
    for (const run of s.pending || []) for (const a of run.actions.filter(a => ['pending', 'checking', 'dispatching', 'sent', 'waiting'].includes(a.status))) {
      count++; const row = el('div', undefined, 'action-row'); const copy = el('div', `${config.routines.find(r => r.id === run.routineId)?.name || run.routineId} · ${describeAction(a)}`, 'action-copy');
      copy.append(el('small', `${resultNames[a.status]} · ${new Date(run.dueAt + a.delaySeconds * 1000).toLocaleTimeString('nb-NO', { timeZone: config.timeZone })}`)); row.append(copy); pending.append(row);
    }
    if (!count) pending.append(el('p', 'Ingen handlinger venter.', 'empty')); $('pending-count').textContent = count;
    renderLogs($('recent-log'), s.history.slice(-5));
    const filter = $('log-filter').value; renderLogs($('full-log'), s.history.filter(e => filter === 'all' || (filter === 'failed' ? ['failed', 'unknown'].includes(e.result) : e.result === filter)));
    $('question-card').hidden = !s.question || !!s.question.decided;
    if (s.question && !s.question.decided) {
      const card = $('question-card'); card.replaceChildren(el('h2', 'Venter på felles nattbeslutning'), el('p', `Svarfrist: ${new Date(s.question.deadline).toLocaleTimeString('nb-NO')}`, 'hint'));
      for (const id of s.question.recipients) card.append(el('p', `${s.people[id]?.name || id}: ${s.question.answers[id] === 'yes' ? 'Ja' : s.question.answers[id] === 'no' ? 'Nei' : s.question.answers[id] === 'error' ? 'Teknisk feil' : 'Venter på svar'}`));
    }
    $('demo-panel').hidden = !demo;
    renderIntegrations();
  }
  function renderHomeControls() {
    const c=data.config.security,s=data.status,cap=(id,key)=>s.devices?.[id]?.available!==false?s.devices?.[id]?.capabilities?.[key]?.value:undefined;
    const locked=cap(c.lockDeviceId,'locked'),port=cap(c.garage.statusDeviceId,c.garage.statusCapability);
    $('home-lock-state').textContent=locked===true?'Låst':locked===false?'Ulåst':'Ukjent';
    $('home-garage-state').textContent=typeof port==='boolean'?(port===c.garage.openValue?'Åpen':'Lukket'):'Ukjent';
    for(const target of ['lock','garage']){
      const control=data.controls?.[target],pending=controlBusy.has(target) || control?.pending;
      const current=target==='lock'?locked:typeof port==='boolean'?port===c.garage.openValue:undefined;
      document.querySelectorAll('[data-control="'+target+'"]').forEach(button=>{
        const value=button.dataset.controlValue==='true',option=control?.options[String(value)];
        button.disabled=!!pending || !option?.allowed || value===current;
        button.title=pending?'Venter på bekreftet status':option?.reason || '';
      });
      const next=typeof current==='boolean'?String(!current):'true';
      $(target+'-control-note').textContent=controlErrors[target] || (pending?'Kommando pågår – venter på bekreftet status.':control?.options[next]?.reason || (s.observation?'Observasjon: knappene logger bare ønsket handling.':'Status leses fra Homey.'));
    }
  }
  function renderPeople() {
    $('people-selection').replaceChildren();
    const ids = [...new Set([...Object.keys(data.catalog.people), ...Object.values(config.people).flat()])];
    for (const id of ids) {
      const p = data.catalog.people[id], row = el('div', undefined, 'person-config');
      row.append(el('strong', p?.name || `Mangler: ${id}`, !p ? 'missing' : ''));
      const roles = el('div', undefined, 'person-roles');
      for (const [role, label] of [['presence', 'Teller som hjemme'], ['night', 'Nattutvalg'], ['questions', 'Nattspørsmål'], ['notifications', 'Motta pushvarsler']]) {
        const wrap = el('label', undefined, 'check'), check = el('input'); check.type = 'checkbox'; check.checked = config.people[role].includes(id);
        check.addEventListener('change', () => {
          config.people[role] = check.checked ? [...config.people[role], id] : config.people[role].filter(v => v !== id);
          if (role === 'presence' && !check.checked) config.people.night = config.people.night.filter(v => v !== id);
          if (role === 'night' && check.checked && !config.people.presence.includes(id)) config.people.presence.push(id);
          setDirty(true); renderPeople();
        });
        wrap.append(check, document.createTextNode(label)); roles.append(wrap);
      }
      row.append(roles); $('people-selection').append(row);
    }
    if (!ids.length) $('people-selection').append(el('p', 'Ingen personer tilgjengelige. Kontroller Homey-tilkoblingen under Mer.', 'empty'));
  }
  function describeAction(a) {
    const target = data.catalog.devices[a.deviceId]?.name || a.deviceId || data.catalog.people[a.personId]?.name || a.personId || data.catalog.flows.find(f => f.id === a.flowId)?.name || a.flowId || '';
    const booleanLabels=a.kind==='person'?['Våken','Sovende']:{onoff:['Av','På'],locked:['Ulåst','Låst'],alarm_contact:['Lukket','Åpen'],alarm_motion:['Ingen bevegelse','Bevegelse']}[a.capability] || ['Inaktiv / nei','Aktiv / ja'];
    const value=typeof a.value==='boolean'?booleanLabels[Number(a.value)]:String(a.value);
    return `${kinds[a.kind] || a.kind}${target ? ` · ${target}` : ''}${a.value !== undefined ? ` → ${value}` : ''}${a.text ? ` · ${a.text}` : ''}`;
  }
  function renderRoutines() {
    const list = $('routine-list'), alarmList = $('alarm-routine-list'); list.replaceChildren(); alarmList.replaceChildren();
    for (const routine of config.routines) {
      const custom=routine.id.startsWith('custom-');
      if(custom && routine.hidden)continue;
      const alarmEvent = ['alarm','arming','entryDelay','activeSensor','alarmOff'].includes(routine.id);
      const card = el('details', undefined, 'card'), heading = el('summary', routine.name), body = el('div', undefined, 'details-body');
      card.open = routine.id === actionRoutine?.id;
      const nameLabel = el('label', custom?'1. Gi rutinen et navn':'Rutinenavn'), nameInput = el('input'); nameInput.type = 'text'; nameInput.value = routine.name;nameInput.placeholder='For eksempel: Rolig kveld';
      nameInput.oninput = () => { routine.name = nameInput.value; heading.textContent = routine.name; setDirty(); }; nameLabel.append(nameInput); body.append(nameLabel);
      const enabledWrap = el('label', undefined, 'check'), check = el('input'); check.type = 'checkbox'; check.checked = routine.enabled;
      check.onchange = () => { routine.enabled = check.checked;const run=body.querySelector('[data-routine-start]');if(run)run.disabled=!routine.enabled || !routine.actions.length;setDirty(true); }; enabledWrap.append(check, document.createTextNode(custom ? 'Rutinen er aktiv' : 'Ekstra handlinger er aktive'));
      const execution = el('select'); options(execution, [{ id: 'sequential', label: 'I rekkefølge – venter på tilstand' }, { id: 'parallel', label: 'Parallelt – følger egne forsinkelser' }], routine.execution, null); execution.setAttribute('aria-label', `Utførelse for ${routine.name}`);
      execution.onchange = () => { routine.execution = execution.value; setDirty(true); }; body.append(enabledWrap);
      if(custom){body.append(el('h3','2. Slik starter du rutinen'),el('p','Trykk «Start rutine» her, eller bruk Homey-kortet House Guard → Start navngitt rutine i en Flow. Velg denne rutinens navn i kortet.','hint'),el('h3','3. Velg hva som skal skje'),el('p','Legg til én eller flere handlinger, for eksempel slå på et lys, starte en Flow eller sende et varsel. Vilkår avgjør om en handling utføres når rutinen starter.','hint'));}
      const orderLabel=el('label','Rekkefølge på handlingene');orderLabel.append(execution);body.append(orderLabel);
      const builtin = { away: 'Alarmen følger valgene under Alarm → Oversikt.', home: 'Alarm og opplåsing følger valgene under Alarm.', night: 'Hjemmeværende i nattutvalget kan settes sovende. Skallsikring velges under Alarm.', morning: 'Hjemmeværende i nattutvalget settes våkne. Frakobling velges under Alarm.', arming: 'Valgt lås og garasjeport følger sikkerhetsoppsettet.', nightArrival: 'Bare den ankomne settes våken. Frakobling følger valget for hjemkomst under Alarm.', guestOn: 'Frakobling og opplåsing følger uttrykkelige gjestevalg.', guestOff: 'Valgt dør låses; alarm velges fra bekreftet tilstedeværelse.', alarm: 'Gjentas mens alarm er bekreftet aktiv. {zone} og {reason} kommer fra lagret alarmkontekst.', alarmOff: 'Ingen lys slukkes som standard.' }[routine.id];
      if (builtin) body.append(el('p', builtin, 'hint'));
      const builtinList = el('div');
      const showBuiltins = actions => {
        builtinList.replaceChildren();
        for (const a of actions.filter(a=>!a.alarmAutomation)) { const row = el('div', undefined, 'action-row'), copy = el('div', describeAction(a), 'action-copy'); copy.append(el('small','Innebygd · følger Alarm og personvalg')); row.append(el('span','•','action-number'),copy); builtinList.append(row); }
      };
      showBuiltins(data.builtins?.[routine.id] || []); body.append(builtinList);
      card.ontoggle = async () => { if (!card.open) return; try { const p = await api('POST','/preview',{ id:routine.id, config }); showBuiltins(p.actions.filter(a => a.builtin)); } catch (error) { toast(error.message); } };
      if (!routine.actions.length) body.append(el('p',custom?'Trykk «Legg til handling» for å velge hva rutinen skal gjøre.':alarmEvent?'Varsler, lyd og lys følger valgene under Alarm. Du kan legge til egne handlinger her.':'Ingen ekstra handlinger valgt.', 'empty'));
      routine.actions.forEach((a, index) => {
        const row = el('div', undefined, 'action-row'), copy = el('div', describeAction(a), 'action-copy');
        copy.append(el('small', `${a.delaySeconds} s · ${labels[a.category]} · ${a.when || 'Rutinens vilkår'}${a.condition ? ' · med enhetsvilkår' : ''}${a.requireConfirmed ? ' · krever bekreftet avhengighet' : ''}`));
        const remove = el('button', '×', 'icon-button'); remove.setAttribute('aria-label', `Fjern ${describeAction(a)}`); remove.onclick = () => {
          if (routine.actions.some(other => other.dependsOn === a.id)) { toast('Fjern avhengige handlinger først.'); return; }
          routine.actions.splice(index, 1); setDirty(true); renderRoutines();
        };
        const edit = el('button', 'Rediger', 'small-button'); edit.onclick = () => openAction(routine, a);
        row.append(el('span', index + 1, 'action-number'), copy, edit, remove); body.append(row);
      });
      const add = el('button', '+ Legg til handling'); add.onclick = () => openAction(routine); body.append(add);
      const preview = el('button','Hva ville skjedd nå?'); preview.onclick = async () => {
        preview.disabled = true;
        try {
          const p = await api('POST','/preview',{ id:routine.id, config });
          $('preview-title').textContent = p.name; $('preview-note').textContent = `${p.note}${dirty ? ' Noen endringer er ennå ikke lagret.' : ''}`;
          const container = $('preview-actions'); container.replaceChildren();
          if (!p.actions.length) container.append(el('p','Ingen handlinger i denne rutinen med det valgte oppsettet.','empty'));
          for (const a of p.actions) { const row = el('div',undefined,'action-row'), copy = el('div',describeAction(a),'action-copy'); copy.append(el('small',`${a.builtin ? 'Innebygd' : 'Ekstra handling'} · ${a.delaySeconds} s · ${a.reason}`)); row.append(copy,el('span',resultNames[a.result] || a.result,`badge ${a.result === 'skipped' ? 'warn' : 'ok'}`)); container.append(row); }
          $('preview-dialog').showModal();
        } catch (error) { toast(error.message); } finally { preview.disabled = false; }
      }; body.append(preview);
      if (custom) {
        const run = el('button', 'Start rutine');run.disabled=!routine.enabled || !routine.actions.length;run.dataset.routineStart=routine.id; run.onclick = async () => { try { await flush(); await api('POST', '/command', { type: 'routine', id: routine.id }); await load(); toast('Rutinen er startet.'); } catch (error) { toast(error.message); } }; body.append(run);
        const removeRoutine = el('button','Slett egen rutine');
        removeRoutine.onclick = () => {config.routines.splice(config.routines.indexOf(routine),1);actionRoutine=null;setDirty(true);renderRoutines();};body.append(removeRoutine);
      }
      if(!custom)body.append(el('p','Fast rutine i House Guard. Den kan ikke slettes. Krysset styrer bare ekstrahandlingene dine. Innebygde funksjoner følger fortsatt valgene under Alarm, Natt og morgen og Gjestemodus.','hint'));
      card.append(heading, body); (alarmEvent ? alarmList : list).append(card);
    }
  }
  function renderIntegrations() {
    renderApiKey();
    const container = $('integration-list'); container.replaceChildren();
    const checks = data.readiness?.checks || [], names = { ready:'Tilkoblet', missing:'Krever oppsett', off:'Ikke valgt', review:'Se over' };
    const seen = new Set();
    const active = checks.filter(c => {
      const key=`${c.title}|${c.level}|${c.detail}`;
      if(c.level==='off'||c.id==='alarm-events'||seen.has(key))return false;
      seen.add(key);return true;
    });
    const issues = active.filter(c => ['missing','review'].includes(c.level));
    for (const check of [...issues,...active.filter(c=>c.level==='ready')]) { const row = el('div', undefined, 'integration-row'), copy = el('div'); copy.append(el('strong',check.title),el('p',check.detail)); row.append(copy,el('span',names[check.level],`badge ${check.level === 'ready' ? 'ok' : 'warn'}`)); container.append(row); }
    const issueCount = issues.length + (data.catalog.errors || []).length;
    $('home-attention').hidden = issueCount === 0;
    $('home-attention-text').textContent = `${issueCount} ${issueCount===1?'punkt trenger':'punkter trenger'} oppfølging`;
    $('system-status-heading').textContent = issueCount ? `Systemstatus · ${issueCount} å se over` : 'Systemstatus · Alt klart';
    const deliveries = $('delivery-status'); deliveries.replaceChildren(el('h3','Siste leveringsresultater'));
    const recent = data.readiness?.deliveries?.slice(-5) || [];
    if (!recent.length) deliveries.append(el('p','Ingen leveringer er sendt. Observasjon sender ingen meldinger.','hint'));
    for (const d of recent.reverse()) deliveries.append(el('p',`${new Date(d.at).toLocaleString('nb-NO',{timeZone:config.timeZone})} · ${kinds[d.kind] || 'Nattspørsmål'} · ${resultNames[d.result]}${d.detail ? ` · ${d.detail}` : ''}`,'summary-line'));
    for (const error of data.catalog.errors || []) container.append(el('p', error, 'error'));
  }
  function renderApiKey() {
    const status=data?.direct || data?.catalog?.direct || {};
    $('direct-api-heading').textContent = `Direkte forbindelse · ${status.ready?'Klar':status.configured?'Må kontrolleres':'Ikke satt opp'}`;
    const panel=$('direct-api-settings');
    if(!panel.dataset.initialized){panel.open=!status.ready;panel.dataset.initialized='true';}
    $('direct-api-status').textContent=apiKeyMessage || (status.configured?(status.ready?'Direkte forbindelse er klar. Nøkkelen er lagret.':status.problem || 'Forbindelsen må kontrolleres.'):'Legg inn API-nøkkel for direkte Flow-start, push og Sonos.');
    $('direct-api-key').disabled=apiKeyBusy || demo;
    $('direct-api-check').disabled=apiKeyBusy || demo || !status.configured;
    $('direct-api-remove').disabled=apiKeyBusy || demo || !status.configured;
  }
  async function updateApiKey(body) {
    if(apiKeyBusy)return;apiKeyBusy=true;apiKeyMessage='Kontrollerer og lagrer …';renderApiKey();
    try{await flush();const result=await api('PUT','/api-key',body);$('direct-api-key').value='';data.direct=result;apiKeyMessage='';await load();}
    catch(error){$('direct-api-key').value='';apiKeyMessage=error.message;}
    finally{apiKeyBusy=false;renderApiKey();}
  }
  function renderSetupEntry() { $('setup-intro').hidden = data.config.setupCompleted === true; }
  function renderAlarmResponses() {
    for(const [id,section] of [['alarm-responses','notifications'],['alarm-audio-responses','audio']])
      HouseGuardAlarm.render({root:$(id),section,config,data,el,options,deviceItems,changed:setDirty,api,flush,demo});
  }
  function initializeAlarmTabs() {
    const tabs=[...document.querySelectorAll('[data-alarm-tab]')];
    function select(tab,focus=false) {
      for(const button of tabs){const selected=button===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
      document.querySelectorAll('[data-alarm-panel]').forEach(panel=>{panel.hidden=panel.dataset.alarmPanel!==tab.dataset.alarmTab;});
      if(focus)tab.focus();
    }
    tabs.forEach((tab,index)=>{
      tab.onclick=()=>select(tab);
      tab.onkeydown=event=>{
        const next={ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
        if(next===undefined)return;event.preventDefault();select(tabs[next],true);
      };
    });
  }
  function renderConfig() { document.querySelectorAll('[data-app-version]').forEach(node=>node.textContent=data.version || ''); renderAlarmResponses(); renderSetupEntry(); fillBindings(); renderPeople(); renderRoutines(); renderIntegrations(); renderConnectionRecipes(); renderIntrusion(); }
  function renderIntrusionStatus() {
    const s=data.intrusion;if(!s)return;
    const phase=s.active?'ALARM UTLØST':s.entryAt?'Inngangsforsinkelse':s.target?'Utgangsforsinkelse':{disarmed:'Frakoblet',armed:'Bortealarm tilkoblet',partially_armed:'Nattalarm tilkoblet'}[s.mode];
    const seconds=Math.max(0,Math.ceil(((s.entryAt || s.exitAt || 0)-Date.now())/1000));
    $('intrusion-status').textContent=`${s.observation?'Observasjon · ':''}${phase}${s.entryAt || s.target?` · ${seconds} s`:''}${s.context && (s.active || s.entryAt)?` · ${s.context.zone} · ${s.context.reason}`:''}${s.faults.length?` · ${s.faults.join(' · ')}`:''}`;
    $('home-alarm-phase').textContent=s.selected?phase:'Alarm ikke aktivert';
    $('home-alarm').classList.toggle('alarm-active',!!s.active);
    $('home-alarm-details').textContent=!s.selected?'Slå på House Guard-alarm under Alarm.':[
      s.observation?'Observasjon – ingen varsler eller fysiske handlinger.':'',
      s.context && (s.active || s.entryAt)?s.context.zone+' · '+s.context.reason:'',
      s.target || s.entryAt?seconds+' sekunder igjen.':'',
      ...(s.faults || []),
    ].filter(Boolean).join(' ');
    $('home-alarm-bypassed').hidden=!s.bypassed?.length;
    $('home-alarm-bypassed').textContent=s.bypassed?.length?'Venter på inaktive sensorer: '+s.bypassed.map(sensor=>sensor.name+' ('+sensor.zone+')').join(', ')+'. Resten av alarmen er tilkoblet.':'';
    $('home-disarm').disabled=!s.selected || (!s.active && !s.target && !s.entryAt && s.mode==='disarmed');
    document.querySelectorAll('[data-alarm-test]').forEach(button=>{button.disabled=!data.config.observation || !s.selected || s.mode==='disarmed' || !!s.target;});
  }
  function renderIntrusion() {
    $('intrusion-settings').hidden=config.security.alarmDeviceId!=='house-guard-internal-alarm' && !(data.intrusion?.selected && (data.intrusion.mode!=='disarmed' || data.intrusion.target || data.intrusion.active));
    const wrap=$('intrusion-sensors');wrap.replaceChildren();
    const sensors=config.security.intrusion.sensors, choices=new Map();
    for(const d of Object.values(data.catalog.devices))for(const cap of ['alarm_contact','alarm_motion'])if(d.capabilities[cap])choices.set(`${d.id}:${cap}`,{d,cap});
    for(const sensor of sensors)if(!choices.has(`${sensor.deviceId}:${sensor.capability}`))choices.set(`${sensor.deviceId}:${sensor.capability}`,{d:{id:sensor.deviceId,name:'Mangler valgt sensor',zone:'',available:false,capabilities:{}},cap:sensor.capability});
    for(const {d,cap} of [...choices.values()].sort((a,b)=>a.d.name.localeCompare(b.d.name,'nb'))) {
      const row=el('div',undefined,'person-config');row.append(el('strong',`${d.name} · ${d.zone || 'Uten sone'} · ${cap==='alarm_contact'?'Dør/vindu':'Bevegelse'}${d.available===false?' · utilgjengelig':''}`));
      const selected=sensors.find(s=>s.deviceId===d.id && s.capability===cap),roles=el('div',undefined,'person-roles');
      for(const [key,title]of [['full','Borte'],['partial','Natt'],['delay','Forsinket']]) {
        const label=el('label',undefined,'check'),check=el('input');check.type='checkbox';check.checked=!!selected?.[key];check.disabled=key==='delay'&&!selected;
        check.onchange=()=>{let sensor=sensors.find(s=>s.deviceId===d.id && s.capability===cap);if(!sensor){sensor={deviceId:d.id,capability:cap,full:false,partial:false,delay:false};sensors.push(sensor);}sensor[key]=check.checked;if(!sensor.full&&!sensor.partial)sensors.splice(sensors.indexOf(sensor),1);setDirty(true);renderIntrusion();};
        label.append(check,document.createTextNode(title));roles.append(label);
      }
      row.append(roles);
      if(selected) {const button=el('button','Prøv sensor i observasjon');button.dataset.alarmTest='true';button.onclick=async()=>{try{await flush();await api('POST','/command',{type:'alarm-test',deviceId:d.id,capability:cap});await load();}catch(error){toast(error.message);}};row.append(button);}
      wrap.append(row);
    }
    if(!choices.size)wrap.append(el('p','Ingen dør- eller bevegelsessensorer funnet. Oppdater enheter under Mer.','hint'));
    renderIntrusionStatus();
  }
  function renderConnectionRecipes() {}
  async function openSetup() {
    $('open-setup').disabled=true; $('reopen-setup').disabled=true;
    try {
      data.catalog=await api('GET','/catalog');
      setupStep=0;setupOptions={people:[...config.people.presence],useNightPeople:config.people.presence.length > 0 && config.people.presence.every(id=>config.people.night.includes(id)),flows:HouseGuardSetup.selections(config)};
      renderSetup();$('setup-dialog').showModal();
    } catch(error) { toast(`Kunne ikke oppdatere Flow-listen: ${error.message}`); }
    finally { $('open-setup').disabled=false; $('reopen-setup').disabled=false; }
  }
  function setupChange(patch) {
    try {
      config = HouseGuardSetup.change(config, patch, data.catalog);
      setupOptions.people = [...config.people.presence]; setupOptions.flows = HouseGuardSetup.selections(config);
      setupOptions.useNightPeople = config.people.presence.length > 0 && config.people.presence.every(id=>config.people.night.includes(id));
      setDirty(true); renderConfig(); $('setup-error').textContent = '';
    } catch(error) { renderSetup(); $('setup-error').textContent = error.message; }
  }
  function renderSetup() {
    const titles=['Hvem bor her?','Hvilke flows skal huset starte?','Velg det du trenger','Se over grunnoppsettet'];
    $('setup-title').textContent=titles[setupStep];$('setup-progress').textContent=`Steg ${setupStep+1} av 4`;
    $('setup-back').hidden=setupStep===0;$('setup-next').textContent=setupStep===3?'Ferdig':'Neste';$('setup-error').textContent='';
    const body=$('setup-body');body.replaceChildren();
    function choice(parent,text,checked,change) {const label=el('label',undefined,'check'),input=el('input');input.type='checkbox';input.checked=checked;input.onchange=()=>change(input.checked);label.append(input,document.createTextNode(text));parent.append(label);}
    if(setupStep===0) {
      body.append(el('p','Velg personene som teller som hjemme. Tilstedeværelsen hentes fra Homey.','hint'));
      for(const p of Object.values(data.catalog.people).filter(p=>p.available!==false)) choice(body,p.name,setupOptions.people.includes(p.id),checked=>setupChange({people:checked?[...setupOptions.people,p.id]:setupOptions.people.filter(id=>id!==p.id)}));
      if(!Object.keys(data.catalog.people).length)body.append(el('p','Ingen personer er tilgjengelige. Oppdater personer og enheter under Mer.','error'));
    } else if(setupStep===1) {
      body.append(el('p','Lag for eksempel «Slå av alle lys» i Homey og velg den under «Når alle drar». Med API-nøkkel starter House Guard den direkte. Legg inn nøkkelen under Mer → Direkte forbindelse.','hint'));
      const flows=HouseGuardSetup.flowChoices(data.catalog);
      for(const [id,title] of [['away','Når alle drar'],['home','Når første person kommer hjem'],['night','Når nattmodus starter']]) {
        const label=el('label',title,'setup-flow'),select=el('select');
        select.id=`setup-flow-${id}`;select.add(new Option('Ingen Flow', ''));
        for(const flow of flows) {
          const option=new Option(`${flow.name} · ${flow.type==='advanced'?'Advanced Flow':'Flow'}${flow.reason?` · ${flow.reason}`:''}`,flow.key);
          option.disabled=!flow.selectable;select.add(option);
        }
        const selected=setupOptions.flows[id];
        if(selected && !flows.some(flow=>flow.key===selected)) {
          const missing=new Option('Tidligere valgt Flow finnes ikke – velg på nytt',selected);missing.disabled=true;select.add(missing);
        }
        select.value=selected;select.onchange=()=>setupChange({flows:{[id]:select.value}});
        label.append(select);body.append(label);
        const routine=config.routines.find(r=>r.id===id);
        const oldLights=routine?.actions.filter(a=>a.setupManaged===true && a.kind==='set').length;
        if(oldLights)body.append(el('p',`${oldLights} tidligere lysvalg fra veiviseren erstattes når du endrer dette valget.`,'hint'));
      }
      if(!flows.length)body.append(el('p','Ingen flows funnet. Lag en Flow i Homey og oppdater listen. Du kan også fortsette med Ingen Flow.','hint'));
      body.append(el('p','Alle flows vises. Deaktiverte flows og flows med feil kan ikke velges. Advanced Flow trenger et Start-kort. Flows som krever en tagg, kan ikke startes her.','hint'));
      body.append(el('p','Egne handlinger under Rutiner beholdes. Velger du en Flow som allerede er lagt til, opprettes den ikke en gang til.','hint'));
      const refresh=el('button','Oppdater Flow-listen');refresh.type='button';
      refresh.onclick=async()=>{refresh.disabled=true;try{data.catalog=await api('GET','/catalog');renderSetup();}catch(error){$('setup-error').textContent=error.message;}finally{refresh.disabled=false;}};
      body.append(refresh);
    } else if(setupStep===2) {
      choice(body,'Ta med alle valgte personer i nattutvalget',setupOptions.useNightPeople,checked=>setupChange({useNightPeople:checked}));
      body.append(el('p','Nattmodus kan startes fra Hjem. Mobilspørsmål velges separat under Rutiner.','hint'));
      body.append(el('h3','Gjestemodus uten Flow'),el('p','I Homey: Legg til enhet → House Guard → Gjestemodus. Bryteren følger samme gjestemodus som appen.','hint'));
      body.append(el('h3','Utvid senere'),el('p','Alarm og dørlås velges under Alarm. Varsler, tale og mobilspørsmål trenger egne koblinger. Veiviseren slår ikke på disse funksjonene.','hint'));
    } else {
      body.append(el('p',`Personer: ${setupOptions.people.map(id=>data.catalog.people[id]?.name || 'Utilgjengelig').join(', ')}.`,'summary-line'));
      const flows=HouseGuardSetup.flowChoices(data.catalog);
      for(const [id,label] of [['away','Når alle drar'],['home','Ved hjemkomst'],['night','Ved nattmodus']]) {
        const selected=setupOptions.flows[id],flow=flows.find(f=>f.key===selected);
        body.append(el('p',`${label}: ${selected ? (flow ? `${flow.name}${flow.reason?` (${flow.reason})`:''}` : 'Flow mangler – velg på nytt') : 'Ingen Flow fra veiviseren'}.`,'summary-line'));
      }
      body.append(el('p',setupOptions.useNightPeople?'Hjemmeværende valgte personer tas med i nattutvalget.':'Nattutvalget beholdes for dem som fortsatt teller som hjemme.','summary-line'));
      body.append(el('p',`Trykk Ferdig for å skjule veiviseren fra forsiden. Den kan åpnes igjen under Mer. Valgene lagres automatisk. ${config.observation ? 'Observasjonsmodus er på.' : 'Aktiv styring er på.'} Dine øvrige handlinger og sikkerhetsvalg beholdes.`,'hint'));
    }
  }
  async function load(initial = false) {
    try {
      data = await api('GET', '/state');
      if (!autosave) {
        config = structuredClone(data.config);
        autosave = HouseGuardAutosave.create({ initial:config, write:body=>api('PUT','/config',body), read:async()=>(await api('GET','/state')).config, validate:body=>api('POST','/validate',body), onState:savingState,
          onSaved:saved=>{ data.config = saved; config.revision = saved.revision; config.bridges = structuredClone(saved.bridges); config.timeZone = saved.timeZone; renderSetupEntry(); } });
        renderConfig(); savingState({phase:'saved',pending:false});
      } else if (autosave.observe(data.config)) { config = structuredClone(data.config); renderConfig(); }
      autosave.recover();
      renderStatus();
    } catch (error) { $('connection').textContent = `Kunne ikke lese Homey: ${error.message}`; $('connection').className = 'banner error'; }
  }
  function scalar(value) { if (value === 'true') return true; if (value === 'false') return false; if (value.trim() && Number.isFinite(Number(value))) return Number(value); return value; }
  function updateActionFields() {
    const kind = $('action-kind').value, device = ['set', 'verify', 'speak', 'sound'].includes(kind);
    const show = (cls, on) => document.querySelectorAll(`.${cls}`).forEach(e => { e.hidden = !on; });
    show('action-device', device); show('action-cap', ['set', 'verify'].includes(kind)); show('action-value', ['set', 'verify', 'person'].includes(kind));
    show('action-flow', kind === 'flow'); show('action-person', kind === 'person'); show('action-text', ['notify', 'timeline', 'speak', 'sound'].includes(kind));
    show('action-notification', kind === 'notify');
    show('action-volume', ['speak', 'sound'].includes(kind)); show('action-confirm', ['set', 'verify', 'person'].includes(kind));
    options($('action-device'), deviceItems(kind === 'verify' ? 'any' : ['speak', 'sound'].includes(kind) ? 'speaker_playing' : 'writable'), $('action-device').value);
    updateCapabilities();
  }
  function updateCapabilities() {
    const d = data.catalog.devices[$('action-device').value], verify = $('action-kind').value === 'verify';
    const protectedDevice = d && (d.class === 'lock' || d.capabilities.locked || d.capabilities.lock_unlock_open || [config.security.lockDeviceId,config.security.garage.commandDeviceId].includes(d.id));
    options($('action-capability'), Object.entries(d?.capabilities || {}).filter(([id, c]) => verify || (c.setable && !protectedDevice && !/^(locked|lock_unlock_open)(\.|$)|^homealarm_state$/.test(id))).map(([id, c]) => ({ id, label: `${c.title || id} (${id})` })), '', 'Velg funksjon');
    updateActionValue();
  }
  function updateActionValue() {
    const kind=$('action-kind').value,cap=data.catalog.devices[$('action-device').value]?.capabilities[$('action-capability').value],value=$('action-value').value;
    let choices=[];
    if(kind==='person')choices=[{id:'false',label:'Våken'},{id:'true',label:'Sovende'}];
    else if(cap?.type==='boolean')choices=[{id:'true',label:$('action-capability').value==='onoff'?'På':'Aktiv / ja'},{id:'false',label:$('action-capability').value==='onoff'?'Av':'Inaktiv / nei'}];
    else if(cap?.type==='enum')choices=(cap.values || []).map(v=>({id:typeof v==='string'?v:v.id,label:typeof v==='string'?v:typeof v.title==='object'?(v.title.no || v.title.en || v.id):(v.title || v.id)}));
    $('action-value').hidden=choices.length>0;$('action-value-choice').hidden=!choices.length;
    if(choices.length)options($('action-value-choice'),choices,value,'Velg resultat');
    $('action-value').placeholder=cap?.type==='number'?`Tall${cap.min!==undefined && cap.max!==undefined?` mellom ${cap.min} og ${cap.max}`:''}${cap.units?` (${cap.units})`:''}`:'Skriv ønsket verdi';
  }
  function updateConditionCapabilities(value = '') {
    const d = data.catalog.devices[$('condition-device').value];
    options($('condition-capability'), Object.entries(d?.capabilities || {}).filter(([, c]) => c.getable !== false).map(([id, c]) => ({ id, label: `${c.title || id} (${id})` })), value);
  }
  function openAction(routine, existing = null) {
    actionRoutine = routine; editedAction = existing; actionChanged = false; $('action-form').reset(); $('action-error-message').textContent = '';
    $('action-advanced').open=!!(existing?.when || existing?.condition || existing?.dependsOn || existing?.onError==='continue' || existing?.confirmSeconds && existing.confirmSeconds!==60);
    $('action-also-timeline').checked=!!existing?.alsoTimeline;
    $('action-title').textContent = existing ? 'Rediger handling' : 'Legg til handling';
    options($('action-category'), Object.entries(labels).map(([id, label]) => ({ id, label })), 'lights', null);
    options($('action-flow'), data.catalog.flows.map(f => ({ id: `${f.type}:${f.id}`, label: `${f.name}${f.broken ? ' · brutt' : ''}` })), '');
    options($('action-person'), Object.values(data.catalog.people).map(p => ({ id: p.id, label: p.name })), '');
    options($('action-camera'), Object.values(data.catalog.devices).filter(d => d.class === 'camera').map(d => ({ id: d.id, label: `${d.name} · ${d.zone}` })), existing?.imageDeviceId || '');
    options($('condition-device'), deviceItems(), existing?.condition?.deviceId || ''); updateConditionCapabilities(existing?.condition?.capability);
    if (existing?.condition) { $('condition-value').value = String(existing.condition.value); $('condition-operator').value = existing.condition.operator; $('condition-age').value = existing.condition.maxAgeSeconds; }
    options($('action-dependency'), routine.actions.slice(0, existing ? routine.actions.indexOf(existing) : routine.actions.length).map(a => ({ id: a.id, label: describeAction(a) })), '', 'Ingen');
    if (existing) $('action-kind').value = existing.kind;
    updateActionFields();
    if (existing) {
      for (const [field, value] of Object.entries({ category: existing.category, device: existing.deviceId || '', person: existing.personId || '', flow: existing.flowId ? `${existing.flowType}:${existing.flowId}` : '', value: existing.value ?? '', text: existing.text || '', volume: existing.volume ?? 35, delay: existing.delaySeconds, when: existing.when || '', error: existing.onError, dependency: existing.dependsOn || '', confirm: existing.confirmSeconds || 60, notification: existing.notificationType || 'normal' })) $('action-' + field).value = String(value);
      updateCapabilities();
      $('action-capability').value = existing.capability || '';
    }
    updateActionValue();$('action-dialog').showModal();
  }
  function download(filename, value) {
    const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function initialize() {
    initializeAlarmTabs();
    for (const [category, label] of Object.entries(labels)) { const wrap = el('label', undefined, 'check'), input = el('input'); input.type = 'checkbox'; input.dataset.bind = `guest.allow.${category}`; wrap.append(input, document.createTextNode(label)); $('guest-options').append(wrap); }
    bindEvents(); await load(true); if (homey) homey.ready();
    $('open-setup').onclick=openSetup; $('reopen-setup').onclick=openSetup;$('close-setup').onclick=()=>$('setup-dialog').close();
    $('setup-back').onclick=()=>{setupStep--;renderSetup();};
    $('setup-next').onclick=async()=>{
      $('setup-next').disabled=true;
      try {
        if(setupStep===0 && !setupOptions.people.length)throw new Error('Velg minst én person.');
        await flush();
        if(setupStep<3){setupStep++;renderSetup();return;}
        config.setupCompleted = true; setDirty(true); await flush();
        $('setup-dialog').close();
      }catch(error){$('setup-error').textContent=error.message;}finally{$('setup-next').disabled=false;}
    };
    $('show-system-status').onclick=()=>{document.querySelector('[data-tab=more]').click();$('system-status').open=true;$('system-status-heading').focus();$('system-status').scrollIntoView({block:'start'});};
    document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { if(button.dataset.tab==='security')renderAlarmResponses(); document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== button.dataset.tab; }); document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b === button); if (b === button) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); });
    document.querySelectorAll('[data-command]').forEach(button => button.onclick = async () => {
      const buttons=[...document.querySelectorAll('[data-command]')],mode=button.dataset.command;
      buttons.forEach(b=>b.disabled=true);
      try { await flush(); await api('POST', '/command', ['home','away'].includes(mode) ? {type:'presence',present:mode==='home'} : mode === 'skip' ? { type: 'skip' } : { type: 'mode', mode }); await load(); toast('Kommando behandlet. Se status og logg.'); }
      catch (error) { toast(error.message);await load().catch(()=>{}); }
      finally {buttons.forEach(b=>b.disabled=false);}
    });
    document.querySelectorAll('[data-alarm]').forEach(button=>button.onclick=async()=>{try{if(button.dataset.alarm!=='disarmed')await flush();await api('POST','/command',{type:'alarm',mode:button.dataset.alarm});if(button.dataset.alarm==='disarmed')await flush();await load();}catch(error){toast(error.message);}});
    document.querySelectorAll('[data-control]').forEach(button=>button.onclick=async()=>{
      const target=button.dataset.control,value=button.dataset.controlValue==='true';
      if(controlBusy.has(target))return;controlBusy.add(target);delete controlErrors[target];renderHomeControls();
      try{await flush();await api('POST','/command',{type:'control',target,value});await load();}
      catch(error){controlErrors[target]=error.message;}
      finally{controlBusy.delete(target);renderHomeControls();}
    });
    $('guest-toggle').onchange = async event => { try { await flush(); await api('POST', '/command', { type: 'guest', value: event.target.checked }); await load(); } catch (error) { toast(error.message); event.target.checked = data.status.guest; } };
    document.querySelectorAll('[data-scenario]').forEach(button => button.onclick = async () => { try { await api('POST', '/scenario', { scenario: button.dataset.scenario }); await load(); } catch (error) { toast(error.message); } });
    $('reload-config').onclick = async () => {
      try { const latest = await api('GET','/state'); autosave.reset(latest.config); data = latest; config = structuredClone(latest.config); renderConfig(); renderStatus(); }
      catch(error) { toast(error.message); }
    };
    $('add-alarm-extra').onclick = () => { let routine=config.routines.find(r=>r.id==='alarm'); if(!routine){routine={id:'alarm',name:'Utløst alarm – ekstra handlinger',enabled:true,execution:'parallel',actions:[]};config.routines.push(routine);} delete routine.hidden; openAction(routine); };
    $('new-routine').onclick = () => { const routine={ id: `custom-${crypto.randomUUID()}`, name: `Egen rutine ${config.routines.filter(r => r.id.startsWith('custom')).length + 1}`, enabled: true, execution: 'sequential', actions: [] };config.routines.push(routine);actionRoutine=routine;setDirty(true);renderRoutines(); };
    $('action-kind').onchange = updateActionFields; $('action-device').onchange = updateCapabilities; $('action-capability').onchange=updateActionValue;$('action-value-choice').onchange=()=>{$('action-value').value=$('action-value-choice').value;};$('close-action').onclick = () => $('action-dialog').close();
    $('condition-device').onchange = () => updateConditionCapabilities();
    function saveAction(immediate = false) {
      try {
        const kind = $('action-kind').value, a = { id: editedAction?.id || `action-${crypto.randomUUID()}`, kind, category: $('action-category').value, delaySeconds: Number($('action-delay').value), onError: $('action-error').value };
        if ([...$('action-form').elements].some(input => !input.closest('[hidden]') && !input.checkValidity())) throw new Error('Fullfør feltene med gyldige verdier.');
        if (editedAction?.setupManaged === true) a.setupManaged = true;
        if (['set', 'verify', 'speak', 'sound'].includes(kind)) a.deviceId = $('action-device').value;
        if (['set', 'verify'].includes(kind)) { a.capability = $('action-capability').value; if (!a.deviceId || !a.capability) throw new Error('Velg enhet og funksjon.'); }
        if (['set', 'verify', 'person'].includes(kind)) { const raw=$('action-value').value,cap=data.catalog.devices[a.deviceId]?.capabilities[a.capability];a.value=cap?.type==='enum'?raw:scalar(raw); a.confirmSeconds = Number($('action-confirm').value); if (raw === '') throw new Error('Velg ønsket resultat.'); }
        if (kind === 'person') { a.personId = $('action-person').value; if (!a.personId || typeof a.value !== 'boolean') throw new Error('Velg person og om personen skal være våken eller sovende.'); }
        if (kind === 'flow') { const selected = $('action-flow').value; if (!selected) throw new Error('Velg en Flow.'); [a.flowType, a.flowId] = selected.split(':'); }
        if (['notify', 'timeline', 'speak', 'sound'].includes(kind)) { a.text = $('action-text').value; if (!a.text.trim()) throw new Error('Skriv tekst eller lydnavn.'); }
        if (kind === 'notify') { a.alsoTimeline=$('action-also-timeline').checked; a.notificationType = $('action-notification').value; a.imageDeviceId = $('action-camera').value; if (a.notificationType === 'image' && !a.imageDeviceId) throw new Error('Velg kamera for bildevarsel.'); }
        if (['speak', 'sound'].includes(kind)) { a.volume = Number($('action-volume').value); if (!a.deviceId || !a.volume) throw new Error('Velg lydenhet og et volum fra 1 til 100.'); }
        if ($('action-when').value) a.when = $('action-when').value;
        if ($('condition-device').value) {
          if (!$('condition-capability').value || $('condition-value').value === '') throw new Error('Fullfør det ekstra enhetsvilkåret.');
          a.condition = { deviceId: $('condition-device').value, capability: $('condition-capability').value, operator: $('condition-operator').value, value: scalar($('condition-value').value), maxAgeSeconds: Number($('condition-age').value) };
        }
        if ($('action-dependency').value) { a.dependsOn = $('action-dependency').value; a.requireConfirmed = true; }
        actionRoutine = config.routines.find(r=>r.id===actionRoutine.id);
        const index = actionRoutine.actions.findIndex(item=>item.id===a.id);
        if (index >= 0) actionRoutine.actions[index] = a; else actionRoutine.actions.push(a);
        editedAction = a;
        $('action-error-message').textContent = ''; setDirty(immediate); renderRoutines(); return true;
      } catch (error) { $('action-error-message').textContent = `Ikke lagret: ${error.message}`; return false; }
    }
    $('action-form').addEventListener('input', event => { if (!['SELECT','INPUT','TEXTAREA'].includes(event.target.tagName) || ['checkbox','select-one'].includes(event.target.type)) return; actionChanged = true; saveAction(); });
    $('action-form').addEventListener('change', () => { actionChanged = true; saveAction(true); });
    $('action-form').onsubmit = async event => { event.preventDefault(); if (actionChanged && !saveAction(true)) return; try { await flush(); $('action-dialog').close(); } catch(error) { $('action-error-message').textContent = `Ikke lagret: ${error.message}`; } };
    $('log-filter').onchange = renderStatus;
    $('refresh-catalog').onclick = async () => { try { data.catalog = await api('GET', '/catalog'); renderConfig(); toast('Personer og enheter oppdatert.'); } catch (error) { toast(error.message); } };
    $('direct-api-key').onchange=()=>{const token=$('direct-api-key').value.trim();if(token)void updateApiKey({token});};
    $('direct-api-key').onpaste=()=>setTimeout(()=>{const token=$('direct-api-key').value.trim();if(token)void updateApiKey({token});},0);
    $('direct-api-check').onclick=()=>updateApiKey({check:true});
    $('direct-api-remove').onclick=()=>updateApiKey({token:''});
    $('export-config').onclick = () => download('house-guard-oppsett.json', config);
    $('export-log').onclick = () => download('house-guard-logg.json', data.status.history);
    $('import-config').onchange = async event => {
      try { const file = event.target.files[0]; if (!file || file.size > 1000000) throw new Error('Velg en JSON-fil under 1 MB.'); await flush(); const imported = JSON.parse(await file.text()); config = await api('POST', '/validate', { ...imported, observation: true, revision: config.revision }); setDirty(true); renderConfig(); await flush(); toast('Oppsett importert og lagret i observasjon.'); }
      catch (error) { toast(`Import feilet: ${error.message}`); }
    };
    window.addEventListener('online', () => { flush().catch(()=>{}); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush().catch(()=>{}); });
    setInterval(() => { if (!document.hidden && !$('action-dialog').open && !$('setup-dialog').open) load(); }, 5000);
  }
  window.onHomeyReady = h => { homey = h; initialize().catch(e => { $('connection').textContent = e.message; homey.ready(); }); };
  if (new URLSearchParams(location.search).get('demo') === '1') { demo = true; initialize().catch(e => { $('connection').textContent = e.message; }); }
})();
