'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const labels = { alarm: 'Alarm', lights: 'Lys', av: 'Lyd og TV', ventilation: 'Ventilasjon', lock: 'Lås', garage: 'Garasjeport', notification: 'Varsler', people: 'Personstatus', other: 'Andre handlinger' };
  const kinds = { set: 'Sett enhet', flow: 'Start Flow', notify: 'Varsel', speak: 'Si tekst', sound: 'Spill lyd', timeline: 'Tidslinje', person: 'Sovestatus', garage: 'Lukk port', verify: 'Bekreft tilstand' };
  const resultNames = { planned:'Ville utført', info:'Informasjon', pending: 'Venter', checking: 'Kontrollerer', dispatching: 'Klargjør sending', sent: 'Sendt', waiting: 'Venter på tilstand', accepted: 'Akseptert', confirmed: 'Bekreftet', observed: 'Observasjon', skipped: 'Hoppet over', cancelled: 'Avbrutt', failed: 'Feil', unknown: 'Ukjent utfall' };
  const modeNames = { home: 'Hjemme', away: 'Borte', night: 'Natt', unknown: 'Ukjent' };
  let data, config, dirty = false, homey, demo = false, actionRoutine, editedAction, toastTimer;
  let setupStep = 0, setupOptions;
  function el(tag, text, className) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; }
  function get(object, path) { return path.split('.').reduce((v, key) => v?.[key], object); }
  function put(object, path, value) { const parts = path.split('.'); const key = parts.pop(); get(object, parts.join('.'))[key] = value; }
  function setDirty() { dirty = true; $('save-bar').hidden = false; if(data && config) renderConnectionRecipes(); }
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
    return devices.filter(d => filter === 'camera' ? d.class === 'camera' || d.images?.some(i => i.type === 'camera') : Object.entries(d.capabilities).some(([id, c]) => filter === 'any' || (filter === 'writable' ? c.setable : filter === 'boolean' ? c.type === 'boolean' : id === filter || id.startsWith(`${filter}.`))))
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
      const items = Object.entries(d?.capabilities || {}).filter(([, c]) => (!s.dataset.write || c.setable) && (!s.dataset.capType || c.type === s.dataset.capType)).map(([id, c]) => ({ id, label: `${c.title || id} (${id})` }));
      options(s, items, get(config, s.dataset.bind));
    });
    document.querySelectorAll('select[data-source="zones"]').forEach(s => options(s, Object.values(data.catalog.zones || {}).map(z => ({ id: z.id, label: z.name })), get(config, s.dataset.bind)));
  }
  function fillBindings() {
    fillSelects();
    document.querySelectorAll('[data-bind]').forEach(input => { const v = get(config, input.dataset.bind); if (input.type === 'checkbox') input.checked = !!v; else input.value = String(v ?? ''); });
    $('timezone').textContent = `Tidssone: ${config.timeZone}. Bruker Homeys tidssone når appen er installert.`;
  }
  function bindEvents() {
    const changed = event => {
      const input = event.target; if (!input.dataset.bind) return;
      let value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
      if (input.dataset.valueType === 'boolean') value = value === 'true';
      if (input.dataset.valueType === 'scalar') value = scalar(value);
      if (!input.dataset.bind.includes('.')) config[input.dataset.bind] = value; else put(config, input.dataset.bind, value);
      if (input.dataset.bind.startsWith('security.garage.') && !['security.garage.enabled', 'security.garage.validated'].includes(input.dataset.bind)) {
        config.security.garage.validated = false; config.security.garage.enabled = false;
        document.querySelector('[data-bind="security.garage.validated"]').checked = false;
        document.querySelector('[data-bind="security.garage.enabled"]').checked = false;
      }
      if (input.dataset.device) fillSelects(); setDirty(); renderConnectionRecipes();
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
    const cap = (id, key) => s.devices?.[id]?.capabilities?.[key]?.value;
    const sec = data.config.security, alarmMode = cap(sec.alarmDeviceId, 'homealarm_state'), active = cap(sec.alarmDeviceId, 'alarm_heimdall'), locked = cap(sec.lockDeviceId, 'locked'), port = cap(sec.garage.statusDeviceId, sec.garage.statusCapability);
    $('security-status').replaceChildren();
    for (const [name, value, sub] of [['HEIMDALL', { disarmed: 'Frakoblet', armed: 'Tilkoblet', partially_armed: 'Delvis tilkoblet' }[alarmMode] || 'Ukjent', active === true ? 'Alarm utløst' : active === false ? 'Ingen utløst alarm' : 'Alarmstatus ukjent'], ['YTTERDØR', locked === true ? 'Låst' : locked === false ? 'Ulåst' : 'Ukjent', sec.lockDeviceId ? 'Avlest tilstand' : 'Velg lås i Sikkerhet'], ['GARASJEPORT', typeof port === 'boolean' ? (port === sec.garage.openValue ? 'Åpen' : 'Lukket') : 'Ukjent', sec.garage.validated ? 'Polaritet validert' : 'Krever oppsett']]) {
      const box = el('div', undefined, 'status-box'); box.append(el('div', name, 'eyebrow'), el('strong', value), el('small', sub)); $('security-status').append(box);
    }
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
  function renderPeople() {
    $('people-selection').replaceChildren();
    const ids = [...new Set([...Object.keys(data.catalog.people), ...Object.values(config.people).flat()])];
    for (const id of ids) {
      const p = data.catalog.people[id], row = el('div', undefined, 'person-config');
      row.append(el('strong', p?.name || `Mangler: ${id}`, !p ? 'missing' : ''));
      const roles = el('div', undefined, 'person-roles');
      for (const [role, label] of [['presence', 'Teller som hjemme'], ['night', 'Nattutvalg'], ['questions', 'Nattspørsmål'], ['notifications', 'Varsler']]) {
        const wrap = el('label', undefined, 'check'), check = el('input'); check.type = 'checkbox'; check.checked = config.people[role].includes(id);
        check.addEventListener('change', () => { config.people[role] = check.checked ? [...config.people[role], id] : config.people[role].filter(v => v !== id); setDirty(); });
        wrap.append(check, document.createTextNode(label)); roles.append(wrap);
      }
      row.append(roles); $('people-selection').append(row);
    }
    if (!ids.length) $('people-selection').append(el('p', 'Ingen personer tilgjengelige. Kontroller Homey-tilkoblingen under Mer.', 'empty'));
  }
  function describeAction(a) {
    const target = data.catalog.devices[a.deviceId]?.name || a.deviceId || data.catalog.people[a.personId]?.name || a.personId || data.catalog.flows.find(f => f.id === a.flowId)?.name || a.flowId || '';
    return `${kinds[a.kind] || a.kind}${target ? ` · ${target}` : ''}${a.value !== undefined ? ` → ${String(a.value)}` : ''}${a.text ? ` · ${a.text}` : ''}`;
  }
  function renderRoutines() {
    const list = $('routine-list'); list.replaceChildren();
    for (const routine of config.routines) {
      const card = el('details', undefined, 'card'), heading = el('summary', routine.name), body = el('div', undefined, 'details-body');
      card.open = routine.id === actionRoutine?.id;
      const nameLabel = el('label', 'Rutinenavn'), nameInput = el('input'); nameInput.type = 'text'; nameInput.value = routine.name;
      nameInput.oninput = () => { routine.name = nameInput.value; heading.textContent = routine.name; setDirty(); }; nameLabel.append(nameInput); body.append(nameLabel);
      const enabledWrap = el('label', undefined, 'check'), check = el('input'); check.type = 'checkbox'; check.checked = routine.enabled;
      check.onchange = () => { routine.enabled = check.checked; setDirty(); }; enabledWrap.append(check, document.createTextNode('Rutinen er aktiv'));
      const execution = el('select'); options(execution, [{ id: 'sequential', label: 'I rekkefølge – venter på tilstand' }, { id: 'parallel', label: 'Parallelt – følger egne forsinkelser' }], routine.execution, null); execution.setAttribute('aria-label', `Utførelse for ${routine.name}`);
      execution.onchange = () => { routine.execution = execution.value; setDirty(); }; body.append(enabledWrap, execution);
      const builtin = { away: 'Heimdall tilkobles hvis panel er valgt.', home: 'Heimdall frakobles hvis panel er valgt. Opplåsing er et separat sikkerhetsvalg.', night: 'Hjemmeværende i nattutvalget kan settes sovende; valgt alarm tilkobles delvis.', morning: 'Valgt alarm frakobles; hjemmeværende i nattutvalget settes våkne.', arming: 'Valgt lås og garasjeport følger sikkerhetsoppsettet.', nightArrival: 'Bare den ankomnes sovestatus kan endres.', guestOn: 'Frakobling og opplåsing følger uttrykkelige gjestevalg.', guestOff: 'Valgt dør låses; alarm velges fra bekreftet tilstedeværelse.', alarm: 'Gjentas mens alarm er bekreftet aktiv. {zone} og {reason} kommer fra lagret alarmkontekst.', alarmOff: 'Ingen lys slukkes som standard.' }[routine.id];
      if (builtin) body.append(el('p', builtin, 'hint'));
      const builtinList = el('div');
      const showBuiltins = actions => {
        builtinList.replaceChildren();
        for (const a of actions) { const row = el('div', undefined, 'action-row'), copy = el('div', describeAction(a), 'action-copy'); copy.append(el('small','Innebygd · følger Sikkerhet og personvalg')); row.append(el('span','•','action-number'),copy); builtinList.append(row); }
      };
      showBuiltins(data.builtins?.[routine.id] || []); body.append(builtinList);
      card.ontoggle = async () => { if (!card.open) return; try { const p = await api('POST','/preview',{ id:routine.id, config }); showBuiltins(p.actions.filter(a => a.builtin)); } catch (error) { toast(error.message); } };
      if (!routine.actions.length) body.append(el('p', routine.id === 'welcome' ? 'Mangler lys-/scenehandling.' : routine.id === 'alarm' ? 'Mangler varsel-/lydhandling. Alarmgjentakelse alene sender ingenting.' : 'Ingen ekstra handlinger valgt.', 'empty'));
      routine.actions.forEach((a, index) => {
        const row = el('div', undefined, 'action-row'), copy = el('div', describeAction(a), 'action-copy');
        copy.append(el('small', `${a.delaySeconds} s · ${labels[a.category]} · ${a.when || 'Rutinens vilkår'}${a.condition ? ' · med enhetsvilkår' : ''}${a.requireConfirmed ? ' · krever bekreftet avhengighet' : ''}`));
        const remove = el('button', '×', 'icon-button'); remove.setAttribute('aria-label', `Fjern ${describeAction(a)}`); remove.onclick = () => {
          if (routine.actions.some(other => other.dependsOn === a.id)) { toast('Fjern avhengige handlinger først.'); return; }
          routine.actions.splice(index, 1); setDirty(); renderRoutines();
        };
        const edit = el('button', 'Rediger', 'small-button'); edit.onclick = () => openAction(routine, a);
        row.append(el('span', index + 1, 'action-number'), copy, edit, remove); body.append(row);
      });
      const add = el('button', '+ Legg til handling'); add.onclick = () => openAction(routine); body.append(add);
      const preview = el('button','Hva ville skjedd nå?'); preview.onclick = async () => {
        preview.disabled = true;
        try {
          const p = await api('POST','/preview',{ id:routine.id, config });
          $('preview-title').textContent = p.name; $('preview-note').textContent = `${p.note}${dirty ? ' Viser ulagret utkast.' : ''}`;
          const container = $('preview-actions'); container.replaceChildren();
          if (!p.actions.length) container.append(el('p','Ingen handlinger i denne rutinen med det valgte oppsettet.','empty'));
          for (const a of p.actions) { const row = el('div',undefined,'action-row'), copy = el('div',describeAction(a),'action-copy'); copy.append(el('small',`${a.builtin ? 'Innebygd' : 'Ekstra handling'} · ${a.delaySeconds} s · ${a.reason}`)); row.append(copy,el('span',resultNames[a.result] || a.result,`badge ${a.result === 'skipped' ? 'warn' : 'ok'}`)); container.append(row); }
          $('preview-dialog').showModal();
        } catch (error) { toast(error.message); } finally { preview.disabled = false; }
      }; body.append(preview);
      if (routine.id.startsWith('custom-')) {
        const run = el('button', 'Start lagret rutine'); run.onclick = async () => { try { if (dirty) throw new Error('Lagre utkastet først.'); await api('POST', '/command', { type: 'routine', id: routine.id }); await load(); toast('Rutinen er startet.'); } catch (error) { toast(error.message); } }; body.append(run);
      }
      card.append(heading, body); list.append(card);
    }
  }
  function renderIntegrations() {
    const container = $('integration-list'); container.replaceChildren();
    const checks = data.readiness?.checks || [], names = { ready:'Tilkoblet', missing:'Krever oppsett', off:'Ikke valgt', review:'Se over' };
    for (const check of checks) { const row = el('div', undefined, 'integration-row'), copy = el('div'); copy.append(el('strong',check.title),el('p',check.detail)); row.append(copy,el('span',names[check.level],`badge ${check.level === 'ready' ? 'ok' : check.level === 'off' ? '' : 'warn'}`)); container.append(row); }
    $('readiness-list').replaceChildren(...[...container.children].map(row => row.cloneNode(true)));
    $('readiness-heading').textContent = `Oppsett og tilkoblinger · ${checks.filter(c => c.level === 'missing').length} mangler`;
    const deliveries = $('delivery-status'); deliveries.replaceChildren(el('h3','Siste leveringsresultater'));
    const recent = data.readiness?.deliveries?.slice(-5) || [];
    if (!recent.length) deliveries.append(el('p','Ingen leveringer er sendt. Observasjon sender ingen meldinger.','hint'));
    for (const d of recent.reverse()) deliveries.append(el('p',`${new Date(d.at).toLocaleString('nb-NO',{timeZone:config.timeZone})} · ${kinds[d.kind] || 'Nattspørsmål'} · ${resultNames[d.result]}${d.detail ? ` · ${d.detail}` : ''}`,'summary-line'));
    const events = Object.entries(data.readiness?.events || {});
    if (events.length) deliveries.append(el('h3','Mottatte integrasjonshendelser'));
    for (const [type,at] of events) deliveries.append(el('p',`${config.routines.find(r => r.id === type)?.name || type} · ${new Date(at).toLocaleString('nb-NO',{timeZone:config.timeZone})}`,'hint'));
    $('setup-bridges').disabled = !data.status.observation || dirty || demo;
    for (const error of data.catalog.errors || []) container.append(el('p', error, 'error'));
  }
  function renderConfig() { fillBindings(); renderPeople(); renderRoutines(); renderIntegrations(); renderConnectionRecipes(); }
  function renderConnectionRecipes() {
    const container = $('connection-recipes'); container.replaceChildren();
    $('legacy-delivery').hidden = !Object.values(data.config.delivery || {}).includes('legacy');
    const actions=config.routines.filter(r=>r.enabled).flatMap(r=>r.actions);
    const groups=[];
    const name=id=>data.catalog.people[id]?.name || data.catalog.devices[id]?.name || 'Ikke valgt';
    const types=new Set(actions.filter(a=>a.kind==='notify').map(a=>a.notificationType || 'normal'));
    if(config.people.notifications.length && (actions.some(a=>['set','verify','person','garage'].includes(a.kind)) || config.security.lockDeviceId || config.security.alarmDeviceId)) types.add('normal');
    const cameras=new Set(actions.filter(a=>a.kind==='notify' && a.notificationType==='image').map(a=>a.imageDeviceId));
    if(config.security.garage.enabled && config.people.notifications.length) {
      if(config.security.garage.imageDeviceId){types.add('image');cameras.add(config.security.garage.imageDeviceId);}else types.add('normal');
    }
    const row=(key,title,steps)=>groups.push({key,title,steps});
    if(types.size && !config.people.notifications.length) row('notifications','Velg mottakere',['Velg varslingsmottakere under Personer før du lager varslingsflow.']);
    for(const person of config.people.notifications) for(const type of types) {
      const targets=type==='image'?[...cameras]:[''];
      for(const camera of targets) row('notifications',`${{normal:'Varsel',critical:'Viktig varsel',image:'Bildevarsel'}[type]} til ${name(person)}`, [
        `Når: House Guard → ${{normal:'Et varsel',critical:'Et viktig varsel',image:'Et bildevarsel'}[type]} er klart for ${name(person)}${camera?` fra ${name(camera)}`:''}.`,
        `Så: Mobil → Send ${type==='critical'?'kritisk pushvarsel':type==='image'?'pushvarsel med bilde':'pushvarsel'} til ${name(person)}. Bruk taggen Melding${camera?` og kamerataggen fra ${name(camera)}`:''}.`,
      ]);
    }
    const sounds=new Map(actions.filter(a=>['speak','sound'].includes(a.kind)).map(a=>[`${a.kind}:${a.deviceId}:${a.kind==='sound'?a.text:''}`,a]));
    for(const a of sounds.values()) row('audio',`${a.kind==='speak'?'Tale':'Alarmlyd'} på ${name(a.deviceId)}`,[
      `Når: House Guard → ${a.kind==='speak'?'En talebeskjed':'En alarmlyd'} er klar for ${name(a.deviceId)}${a.kind==='sound'?'. Velg samme lyd som i rutinen':''}.`,
      `Så: Sonos → ${a.kind==='speak'?'Si taggen Melding':'Spill den valgte lyden'}. Bruk taggen Volum.`,
    ]);
    if(config.night.automatic) {
      if(!config.people.questions.length) row('questions','Velg mottakere',['Velg hvem som skal svare på nattspørsmål under Personer.']);
      for(const person of config.people.questions) row('questions',`Nattspørsmål til ${name(person)}`, [
        `Når: House Guard → Et nattspørsmål er klart for ${name(person)}.`,
        `Og: Mobil → Send et ja/nei-spørsmål til ${name(person)} med taggen Melding.`,
        'Så: House Guard → Registrer svar på nattspørsmålet. Velg Ja og taggen Dette spørsmålet.',
        'Ellers: Samme svarkort med Nei og samme tagg. Bruk ett spørsmålskort; ikke lag en ekstra Flow som spør en gang til.',
        'Appen venter på svarfristen. Et uteblitt svar blir ikke et ja. Mobilkortets feil og tidsavbrudd må prøves ved oppsett.',
      ]);
    }
    if(!groups.length) container.append(el('p','Ingen meldings- eller lydkoblinger er nødvendige med dette oppsettet.','hint'));
    if(config.security.alarmDeviceId) {
      row('details','Valgfritt: sone og årsak ved alarm',[
        'Når: Heimdall → Alarmen utløses.',
        'Så: House Guard → Registrer alarmens sone og årsak. Bruk Heimdalls tagger Zone for sone og Reason for årsak.',
      ]);
      row('details','Valgfritt: detaljer ved inngangsforsinkelse',[
        'Når: Heimdall → Alarmforsinkelsen starter.',
        'Så: House Guard → Registrer inngangsforsinkelse. Bruk Zone for sone, Reason for årsak og Duration for sekunder.',
      ]);
      row('details','Valgfritt: sensorvarsel ved tilkobling',[
        'Når: Heimdall → En sensor er aktiv ved tilkobling.',
        'Så: House Guard → Registrer sensoradvarsel. Bruk Heimdalls warning-tagg for advarsel.',
        'Grunnleggende Heimdall-hendelser kommer direkte. Disse valgfrie koblingene legger til teksten fra Heimdall.',
      ]);
    }
    const legacy=new Set();
    for(const group of groups) {
      if(config.delivery[group.key]==='legacy') {
        if(legacy.has(group.key))continue; legacy.add(group.key);
        const box=el('div',undefined,'recipe');box.append(el('strong',{notifications:'Mobilvarsler',questions:'Nattspørsmål',audio:'Tale og lyd'}[group.key]),el('p','Eldre kobling er valgt. Bytt til enkle flows under for å vise de nye oppskriftene.','hint'));container.append(box);continue;
      }
      const box=el('details',undefined,'recipe');box.append(el('summary',group.title));
      for(const line of group.steps)box.append(el('p',line,'summary-line'));container.append(box);
    }
    if(groups.some(g=>config.delivery[g.key]==='simple')) container.append(el('p','Lag vanlige flows uten ekstra betingelser eller forsinkelser. Bruk taggene fra Når-kortet. Lagre oppsettet og velg Kontroller integrasjonsflows. Enkle utgangsflows bekrefter ikke mottak og har ikke automatisk reservepush.','hint'));
  }
  function openSetup() {
    setupStep=0;setupOptions={people:[...config.people.presence],useNightPeople:false,lights:Object.fromEntries(['away','home','night'].map(id=>[id,config.routines.find(r=>r.id===id)?.actions.filter(a=>a.setupManaged===true).map(a=>a.deviceId)||[]]))};
    renderSetup();$('setup-dialog').showModal();
  }
  function renderSetup() {
    const titles=['Hvem bor her?','Hvilke lys skal huset styre?','Velg det du trenger','Se over grunnoppsettet'];
    $('setup-title').textContent=titles[setupStep];$('setup-progress').textContent=`Steg ${setupStep+1} av 4`;
    $('setup-back').hidden=setupStep===0;$('setup-next').textContent=setupStep===3?'Legg i utkast':'Neste';$('setup-error').textContent='';
    const body=$('setup-body');body.replaceChildren();
    function choice(parent,text,checked,change) {const label=el('label',undefined,'check'),input=el('input');input.type='checkbox';input.checked=checked;input.onchange=()=>change(input.checked);label.append(input,document.createTextNode(text));parent.append(label);}
    if(setupStep===0) {
      body.append(el('p','Velg personene som teller som hjemme. Tilstedeværelsen hentes fra Homey.','hint'));
      for(const p of Object.values(data.catalog.people).filter(p=>p.available!==false)) choice(body,p.name,setupOptions.people.includes(p.id),checked=>{setupOptions.people=checked?[...setupOptions.people,p.id]:setupOptions.people.filter(id=>id!==p.id);});
      if(!Object.keys(data.catalog.people).length)body.append(el('p','Ingen personer er tilgjengelige. Oppdater personer og enheter under Mer.','error'));
    } else if(setupStep===1) {
      body.append(el('p','Velg bare lys du vil automatisere. Tilpassede handlinger og scener beholdes.','hint'));
      const lights=HouseGuardSetup.lightChoices(config,data.catalog);
      for(const [id,label] of [['away','Når siste person drar: slå av'],['home','Når første person kommer hjem: slå på'],['night','Når nattmodus starter: slå av']]) {
        body.append(el('h3',label));
        const routine=config.routines.find(r=>r.id===id);
        for(const light of lights) {
          const existing=routine?.actions.some(a=>!a.setupManaged && a.kind==='set' && a.deviceId===light.id && a.capability==='onoff');
          if(existing){body.append(el('p',`${light.name}: styres allerede av en tilpasset handling.`,'hint'));continue;}
          choice(body,`${light.name} · ${light.zone || 'Uten sone'}`,setupOptions.lights[id].includes(light.id),checked=>{setupOptions.lights[id]=checked?[...setupOptions.lights[id],light.id]:setupOptions.lights[id].filter(value=>value!==light.id);});
        }
        if(!lights.length)body.append(el('p','Ingen kompatible lys funnet. Du kan legge til andre enhetshandlinger under Rutiner.','hint'));
      }
    } else if(setupStep===2) {
      choice(body,'La nattmodus sette hjemmeværende i personutvalget som sovende',setupOptions.useNightPeople,checked=>{setupOptions.useNightPeople=checked;});
      body.append(el('p','Nattmodus kan startes fra Hjem. Mobilspørsmål velges separat under Rutiner.','hint'));
      body.append(el('h3','Gjestemodus uten Flow'),el('p','I Homey: Legg til enhet → House Guard → Gjestemodus. Bryteren følger samme gjestemodus som appen.','hint'));
      body.append(el('h3','Utvid senere'),el('p','Alarm og dørlås velges under Sikkerhet. Varsler, tale og mobilspørsmål trenger egne koblinger. Veiviseren slår ikke på disse funksjonene.','hint'));
    } else {
      body.append(el('p',`Personer: ${setupOptions.people.map(id=>data.catalog.people[id]?.name || 'Utilgjengelig').join(', ')}.`,'summary-line'));
      for(const [id,label] of [['away','Slå av når alle drar'],['home','Slå på ved hjemkomst'],['night','Slå av ved nattmodus']])body.append(el('p',`${label}: ${setupOptions.lights[id].map(id=>data.catalog.devices[id]?.name || 'Utilgjengelig').join(', ') || 'Ingen nye lysvalg'}.`,'summary-line'));
      body.append(el('p',setupOptions.useNightPeople?'Hjemmeværende valgte personer tas med i nattutvalget.':'Nattutvalget beholdes for dem som fortsatt teller som hjemme.','summary-line'));
      body.append(el('p','Utkastet bruker observasjonsmodus. Dine øvrige handlinger og sikkerhetsvalg beholdes. Se over hele oppsettet før du lagrer.','hint'));
    }
  }
  async function load(initial = false) {
    try {
      data = await api('GET', '/state');
      if (initial || !config || (!dirty && config.revision !== data.config.revision)) { config = structuredClone(data.config); renderConfig(); }
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
  }
  function updateConditionCapabilities(value = '') {
    const d = data.catalog.devices[$('condition-device').value];
    options($('condition-capability'), Object.entries(d?.capabilities || {}).filter(([, c]) => c.getable !== false).map(([id, c]) => ({ id, label: `${c.title || id} (${id})` })), value);
  }
  function openAction(routine, existing = null) {
    actionRoutine = routine; editedAction = existing; $('action-form').reset(); $('action-error-message').textContent = '';
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
    $('action-dialog').showModal();
  }
  function download(filename, value) {
    const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function showSummary() {
    const wrap = $('save-summary'); wrap.replaceChildren();
    const values = [config.observation ? 'Observasjon: ingen eksterne handlinger blir utført.' : 'AKTIV STYRING: lagret oppsett kan styre huset når vilkårene oppfylles.', `Personer: ${config.people.presence.length} for tilstedeværelse, ${config.people.night.length} for natt og ${config.people.questions.length} spørsmålsmottakere.`, `Borteforsinkelse ${config.delays.away} s. Hjemkomst ${config.delays.home} s.`, `Automatisk opplåsing: ${config.security.autoUnlock ? 'PÅ' : 'av'}. Gjesteopplåsing: ${config.guest.unlockOnEnable ? 'PÅ' : 'av'}. Portstyring: ${config.security.garage.enabled ? 'PÅ' : 'av'}.`, 'Ventende rutiner avbrytes når innstillingene lagres.'];
    for (const value of values) wrap.append(el('p', value, 'summary-line'));
    for (const routine of config.routines.filter(r => r.enabled && r.actions.length)) wrap.append(el('p', `${routine.name}: ${routine.actions.map(describeAction).join('; ')}`, 'summary-line'));
    $('save-error').textContent = ''; $('save-dialog').showModal();
  }
  async function initialize() {
    for (const [category, label] of Object.entries(labels)) { const wrap = el('label', undefined, 'check'), input = el('input'); input.type = 'checkbox'; input.dataset.bind = `guest.allow.${category}`; wrap.append(input, document.createTextNode(label)); $('guest-options').append(wrap); }
    bindEvents(); await load(true); if (homey) homey.ready();
    $('open-setup').onclick=openSetup;$('close-setup').onclick=()=>$('setup-dialog').close();
    $('setup-back').onclick=()=>{setupStep--;renderSetup();};
    $('setup-next').onclick=async()=>{
      $('setup-next').disabled=true;
      try {
        if(setupStep===0 && !setupOptions.people.length)throw new Error('Velg minst én person.');
        if(setupStep<3){setupStep++;renderSetup();return;}
        const draft=HouseGuardSetup.draft(config,setupOptions,data.catalog);
        config=await api('POST','/validate',draft);setDirty();renderConfig();$('setup-dialog').close();showSummary();
      }catch(error){$('setup-error').textContent=error.message;}finally{$('setup-next').disabled=false;}
    };
    document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== button.dataset.tab; }); document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b === button); if (b === button) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); });
    document.querySelectorAll('[data-command]').forEach(button => button.onclick = async () => {
      try { await api('POST', '/command', button.dataset.command === 'skip' ? { type: 'skip' } : { type: 'mode', mode: button.dataset.command }); await load(); toast('Kommando behandlet. Se status og logg.'); } catch (error) { toast(error.message); }
    });
    $('guest-toggle').onchange = async event => { try { await api('POST', '/command', { type: 'guest', value: event.target.checked }); await load(); } catch (error) { toast(error.message); event.target.checked = data.status.guest; } };
    document.querySelectorAll('[data-scenario]').forEach(button => button.onclick = async () => { try { await api('POST', '/scenario', { scenario: button.dataset.scenario }); await load(); } catch (error) { toast(error.message); } });
    $('review-save').onclick = showSummary;
    $('confirm-save').onclick = async () => {
      $('confirm-save').disabled = true;
      try { const saved = await api('PUT', '/config', config); config = saved; dirty = false; $('save-bar').hidden = true; $('save-dialog').close(); await load(true); toast('Oppsett lagret.'); }
      catch (error) { $('save-error').textContent = error.message; } finally { $('confirm-save').disabled = false; }
    };
    $('discard').onclick = async () => { dirty = false; $('save-bar').hidden = true; await load(true); };
    $('new-routine').onclick = () => { config.routines.push({ id: `custom-${crypto.randomUUID()}`, name: `Egen rutine ${config.routines.filter(r => r.id.startsWith('custom')).length + 1}`, enabled: true, execution: 'sequential', actions: [] }); setDirty(); renderRoutines(); };
    $('action-kind').onchange = updateActionFields; $('action-device').onchange = updateCapabilities; $('close-action').onclick = () => $('action-dialog').close();
    $('condition-device').onchange = () => updateConditionCapabilities();
    $('action-form').onsubmit = event => {
      event.preventDefault();
      try {
        const kind = $('action-kind').value, a = { id: editedAction?.id || `action-${crypto.randomUUID()}`, kind, category: $('action-category').value, delaySeconds: Number($('action-delay').value), onError: $('action-error').value };
        if (['set', 'verify', 'speak', 'sound'].includes(kind)) a.deviceId = $('action-device').value;
        if (['set', 'verify'].includes(kind)) { a.capability = $('action-capability').value; if (!a.deviceId || !a.capability) throw new Error('Velg enhet og funksjon.'); }
        if (['set', 'verify', 'person'].includes(kind)) { a.value = scalar($('action-value').value); a.confirmSeconds = Number($('action-confirm').value); if ($('action-value').value === '') throw new Error('Skriv ønsket verdi.'); }
        if (kind === 'person') { a.personId = $('action-person').value; if (!a.personId || typeof a.value !== 'boolean') throw new Error('Velg person og bruk true (sover) eller false (våken).'); }
        if (kind === 'flow') { const selected = $('action-flow').value; if (!selected) throw new Error('Velg en Flow.'); [a.flowType, a.flowId] = selected.split(':'); }
        if (['notify', 'timeline', 'speak', 'sound'].includes(kind)) { a.text = $('action-text').value; if (!a.text.trim()) throw new Error('Skriv tekst eller lydnavn.'); }
        if (kind === 'notify') { a.notificationType = $('action-notification').value; a.imageDeviceId = $('action-camera').value; if (a.notificationType === 'image' && !a.imageDeviceId) throw new Error('Velg kamera for bildevarsel.'); }
        if (['speak', 'sound'].includes(kind)) a.volume = Number($('action-volume').value);
        if ($('action-when').value) a.when = $('action-when').value;
        if ($('condition-device').value) {
          if (!$('condition-capability').value || $('condition-value').value === '') throw new Error('Fullfør det ekstra enhetsvilkåret.');
          a.condition = { deviceId: $('condition-device').value, capability: $('condition-capability').value, operator: $('condition-operator').value, value: scalar($('condition-value').value), maxAgeSeconds: Number($('condition-age').value) };
        }
        if ($('action-dependency').value) { a.dependsOn = $('action-dependency').value; a.requireConfirmed = true; }
        if (editedAction) actionRoutine.actions[actionRoutine.actions.indexOf(editedAction)] = a; else actionRoutine.actions.push(a);
        setDirty(); renderRoutines(); $('action-dialog').close();
      } catch (error) { $('action-error-message').textContent = error.message; }
    };
    $('log-filter').onchange = renderStatus;
    $('refresh-catalog').onclick = async () => { try { data.catalog = await api('GET', '/catalog'); renderConfig(); toast('Personer og enheter oppdatert.'); } catch (error) { toast(error.message); } };
    $('setup-bridges').onclick = async () => {
      if (dirty) { toast('Lagre oppsettet først.'); return; }
      $('setup-bridges').disabled = true;
      try { const result = await api('POST','/bridges',{}); await load(true); toast(`Integrasjonsflows kontrollert: ${result.routes} leveringskoblinger. Ingen prøvemeldinger sendt.`); }
      catch (error) { toast(error.message); } finally { $('setup-bridges').disabled = !data.status.observation || dirty || demo; }
    };
    $('export-config').onclick = () => download('house-guard-oppsett.json', config);
    $('export-log').onclick = () => download('house-guard-logg.json', data.status.history);
    $('import-config').onchange = async event => {
      try { const file = event.target.files[0]; if (!file || file.size > 1000000) throw new Error('Velg en JSON-fil under 1 MB.'); const imported = JSON.parse(await file.text()); config = await api('POST', '/validate', { ...imported, observation: true, revision: data.config.revision }); setDirty(); renderConfig(); toast('Importert som utkast i observasjon. Se over før lagring.'); }
      catch (error) { toast(`Import feilet: ${error.message}`); }
    };
    setInterval(() => { if (!document.hidden && !$('save-dialog').open && !$('action-dialog').open) load(); }, 5000);
  }
  window.onHomeyReady = h => { homey = h; initialize().catch(e => { $('connection').textContent = e.message; homey.ready(); }); };
  if (new URLSearchParams(location.search).get('demo') === '1') { demo = true; initialize().catch(e => { $('connection').textContent = e.message; }); }
})();
