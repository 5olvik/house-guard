'use strict';
const Engine = require('../lib/engine');
const { defaults } = require('../lib/config');
function harness(customize = () => {}, saved = {}, start = '2026-09-21T21:00:00Z') {
  let now = Date.parse(start), stored;
  const config = defaults(); config.observation = false; config.people.presence = ['a', 'b']; config.people.night = ['a', 'b']; config.people.questions = ['a', 'b'];
  customize(config);
  const calls = [];
  const snapshot = { connected: true, people: {}, devices: {} };
  const adapter = {
    snapshot: async () => structuredClone(snapshot),
    set: async (...args) => { if (args[3] && !args[3]()) throw new Error('cancelled'); args[4]?.(); calls.push(['set', ...args.slice(0, 3)]); },
    setAsleep: async (...args) => { args[3]?.(); calls.push(['person', ...args.slice(0, 2)]); },
    startFlow: async (...args) => { args[3]?.(); calls.push(['flow', ...args.slice(0, 2)]); },
    timeline: async (text, guard, dispatch) => { dispatch?.(); calls.push(['timeline', text]); }, emit: async (data, guard, dispatch) => { dispatch?.(); calls.push(['emit', data]); },
  };
  const engine = new Engine({ config, adapter, saved, clock: () => now, persist: s => { stored = structuredClone(s); } });
  function person(id, present, asleep = false, available = true) { snapshot.people[id] = { id, name: id, present, asleep, available, observedAt: now }; }
  function device(id, cap, value, updatedAt = now) { snapshot.devices[id] ||= { id, available: true, capabilities: {} }; snapshot.devices[id].capabilities[cap] = { value, updatedAt, setable: true }; }
  function advance(ms) { now += ms; for (const p of Object.values(snapshot.people)) p.observedAt = now; }
  function ingest(options) { engine.ingest(structuredClone(snapshot), options); }
  person('a', true); person('b', true);
  return { engine, config: engine.config, adapter, snapshot, calls, person, device, advance, ingest, now: () => now, saved: () => stored };
}
function step(id = 'test', fields = {}) { return { id, kind: 'timeline', text: id, category: 'other', delaySeconds: 0, onError: 'stop', ...fields }; }
function add(c, id, actions) { c.routines.find(r => r.id === id).actions = actions; }
module.exports = { harness, step, add };
