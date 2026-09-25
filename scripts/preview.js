'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const Engine = require('../lib/engine');
const { defaults } = require('../lib/config');
const { action } = require('../lib/plans');
const root = path.resolve(__dirname, '..');
let offset = 0;
const clock = () => Date.now() + offset;
const config = defaults();
config.people = { presence: ['demo-alex', 'demo-sam', 'demo-robin'], night: ['demo-alex', 'demo-sam', 'demo-robin'], questions: ['demo-alex', 'demo-sam'], notifications: ['demo-alex', 'demo-sam'] };
config.security.alarmDeviceId = 'demo-alarm'; config.security.lockDeviceId = 'demo-lock';
config.routines.find(r => r.id === 'away').actions = [action('demo-lights', 'set', 'lights', { deviceId: 'demo-lights', capability: 'onoff', value: false, delaySeconds: 10 }), action('demo-away-log', 'timeline', 'other', { text: 'Huset er satt i bortemodus' })];
config.routines.find(r => r.id === 'alarm').actions = [action('demo-alarm-alert', 'notify', 'notification', { text: 'Alarm i {zone}: {reason}' })];
config.routines.find(r => r.id === 'welcome').actions = [action('demo-welcome', 'flow', 'lights', { flowId: 'demo-scene', flowType: 'normal' })];
const people = Object.fromEntries([['demo-alex', 'Alex', true], ['demo-sam', 'Sam', true], ['demo-robin', 'Robin', false]].map(([id, name, present]) => [id, { id, name, present, asleep: false, available: true, observedAt: clock() }]));
const cap = (value, type, setable = true, title = '') => ({ value, type, setable, title, updatedAt: clock() });
const devices = Object.fromEntries([
  ['demo-alarm', 'Heimdall Alarmpanel', 'Entré', { homealarm_state: cap('disarmed', 'enum', true, 'Overvåkningsmodus'), alarm_heimdall: cap(false, 'boolean', false, 'Utløst alarm') }],
  ['demo-lock', 'Ytterdør', 'Entré', { locked: cap(true, 'boolean', true, 'Låst') }],
  ['demo-lights', 'Taklys', 'Stue', { onoff: cap(true, 'boolean', true, 'På / av'), dim: { ...cap(0.6, 'number', true, 'Lysstyrke'), min: 0, max: 1 } }],
  ['demo-door', 'Ytterdør', 'Entré', { alarm_contact: cap(false, 'boolean', false, 'Kontakt') }],
  ['demo-weather', 'Utetemperatur', 'Ute', { measure_temperature: cap(12, 'number', false, 'Temperatur') }],
  ['demo-lux', 'Lysmåler', 'Kjøkken', { measure_luminance: cap(9, 'number', false, 'Lux') }],
  ['demo-relay', 'Portrelé', 'Garasje', { onoff: cap(false, 'boolean', true, 'Relé') }],
  ['demo-port', 'Portstatus', 'Garasje', { alarm_contact: cap(false, 'boolean', false, 'Åpen port') }],
  ['demo-sonos', 'Sonos Arc', 'Stue', { speaker_playing: cap(false, 'boolean', true, 'Avspilling') }],
].map(([id, name, zone, capabilities]) => [id, { id, name, zone, available: true, capabilities }]));
devices['demo-lights'].class = 'light';
devices['demo-extra-light'] = { ...structuredClone(devices['demo-lights']), id:'demo-extra-light', name:'Leselampe' };
const catalogue = { people, devices, zones: { 'demo-living': { id: 'demo-living', name: 'Stue' } }, flows: [{ id: 'demo-scene', name: 'Ettermiddag · demoscene', type: 'normal' }], errors: [] };
const snapshot = async () => { for (const p of Object.values(people)) p.observedAt = clock(); return structuredClone({ connected: true, people, devices }); };
const reject = async () => { throw new Error('Demomodus har ingen sideeffekter'); };
const engine = new Engine({ config, clock, adapter: { snapshot, set: reject, setAsleep: reject, emit: reject, timeline: reject, startFlow: reject } });
engine.log('Demo startet. Ingen forbindelse til huset.', { result: 'observed' });
async function start() {
  engine.ingest(await snapshot(), { initial: true });
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      if (!['127.0.0.1:4781', 'localhost:4781'].includes(host)) throw new Error('Ugyldig vert');
      if (req.headers.origin && !['http://127.0.0.1:4781', 'http://localhost:4781'].includes(req.headers.origin)) throw new Error('Ugyldig opprinnelse');
      const url = new URL(req.url, 'http://127.0.0.1:4781');
      let body = {};
      if (['PUT', 'POST'].includes(req.method)) {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1000000) throw new Error('For stor forespørsel'); }
        body = JSON.parse(raw || '{}');
      }
      let output;
      if (url.pathname === '/api/state') output = { config: engine.config, status: engine.status(), catalog: catalogue, readiness:require('../lib/readiness')(engine.config,engine.snapshot,catalogue,engine.state,clock()), builtins:Object.fromEntries(engine.config.routines.map(r => [r.id,require('../lib/plans').builtins(r.id,engine.config,{},engine.facts())])) };
      else if (url.pathname === '/api/preview' && req.method === 'POST') output = require('../lib/preview')(engine,body.id,body.config,catalogue,await snapshot());
      else if (url.pathname === '/api/catalog') output = catalogue;
      else if (url.pathname === '/api/validate' && req.method === 'POST') output = require('../lib/config').validate(body);
      else if (url.pathname === '/api/config' && req.method === 'PUT') {
        if (body.revision !== engine.config.revision) throw new Error('Konfigurasjonen ble endret. Last siden på nytt.');
        if (!body.observation) throw new Error('Denne demonstrasjonen bruker alltid observasjonsmodus.');
        output = engine.updateConfig(body); engine.ingest(await snapshot(), { reconnect: true });
      } else if (url.pathname === '/api/command' && req.method === 'POST') {
        if (body.type === 'mode') await engine.manual(body.mode);
        else if (body.type === 'guest') engine.setGuest(body.value);
        else if (body.type === 'skip') engine.skipNight();
        else if (body.type === 'routine') engine.start(body.id);
        else if (body.type === 'refresh') engine.ingest(await snapshot());
        else throw new Error('Ukjent demokommando');
        await engine.tick(); output = engine.status();
      } else if (url.pathname === '/api/scenario' && req.method === 'POST') {
        if (body.scenario === 'away') for (const p of Object.values(people)) p.present = false;
        else if (body.scenario === 'return') people['demo-alex'].present = true;
        else if (body.scenario === 'sleep') for (const p of Object.values(people)) if (p.present) p.asleep = true;
        else if (body.scenario === 'advance') offset += 60000;
        else if (body.scenario === 'alarm') { devices['demo-alarm'].capabilities.alarm_heimdall.value = true; engine.event('alarm', { zone: 'Stue', reason: 'Bevegelse i demo' }); }
        else if (body.scenario === 'alarmOff') { devices['demo-alarm'].capabilities.alarm_heimdall.value = false; engine.event('alarmOff'); }
        else throw new Error('Ukjent scenario');
        engine.ingest(await snapshot()); await engine.tick(); output = engine.status();
      } else {
        const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!['index.html', 'ui.js', 'style.css', 'setup-model.js', 'homey.js'].includes(filename)) { res.writeHead(404); res.end(); return; }
        if (filename === 'homey.js') { res.setHeader('Content-Type', 'application/javascript'); res.end('/* Local preview: Homey bridge intentionally absent. */'); return; }
        const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(filename)];
        res.setHeader('Content-Type', `${mime}; charset=utf-8`); res.setHeader('Cache-Control', 'no-store');
        res.end(fs.readFileSync(path.join(root, 'settings', filename))); return;
      }
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(output));
    } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  server.listen(4781, '127.0.0.1', () => console.log('Demo: http://127.0.0.1:4781/?demo=1'));
  const tick = setInterval(() => engine.tick(), 1000);
  const stop = () => { clearInterval(tick); server.close(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
start().catch(error => { console.error(error); process.exitCode = 1; });
