'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { create, content } = require('../settings/autosave');
const { defaults, validate } = require('../lib/config');
const setup = require('../settings/setup-model');
const clone = value => structuredClone(value);
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; }
function harness(overrides = {}) {
  const h = { server:defaults(), writes:[], states:[], accepted:[] };
  h.queue = create({ initial:h.server, delay:60000,
    validate:async value=>validate(value), read:async()=>clone(h.server),
    write:async value=>{ assert.equal(value.revision,h.server.revision); h.writes.push(clone(value)); h.server={...clone(value),revision:value.revision+1}; return clone(h.server); },
    onState:state=>h.states.push(state), onSaved:value=>h.accepted.push(value), ...overrides(h),
  });
  h.edit = (apply, immediate=false) => { const c=clone(h.server); apply(c); h.queue.change(c,immediate); return c; };
  return h;
}
const baseHarness = overrides => harness(overrides || (()=>({})));

test('Autosave coalesces rapid typing and skips unchanged input/change events', async()=>{
  const h=baseHarness();
  const c=h.edit(c=>{c.delays.away=2;}); c.delays.away=25; h.queue.change(c);
  await h.queue.flush(); assert.equal(h.writes.length,1); assert.equal(h.server.delays.away,25);
  h.queue.change(c); await h.queue.flush(); assert.equal(h.writes.length,1);
  assert.equal(h.states.at(-1).phase,'saved'); assert.equal(h.states.at(-1).pending,false);
});

test('Autosave serializes requests and preserves edits made during an in-flight save', async()=>{
  const started=deferred(), release=deferred(); let active=0,max=0;
  const h=baseHarness(h=>({write:async value=>{
    active++;max=Math.max(max,active);h.writes.push(clone(value));
    if(h.writes.length===1){started.resolve();await release.promise;}
    assert.equal(value.revision,h.server.revision);h.server={...value,revision:value.revision+1};active--;return clone(h.server);
  }}));
  const c=h.edit(c=>{c.delays.away=21;},true); await started.promise;
  c.delays.home=42;h.queue.change(c,true);release.resolve();await h.queue.flush();
  assert.equal(max,1);assert.deepEqual(h.writes.map(c=>c.revision),[0,1]);assert.equal(h.server.delays.home,42);
  assert.equal(h.server.delays.away,21);assert.equal(h.states.at(-1).phase,'saved');
});

test('Returning to the initial value while a write is pending is saved as the latest edit',async()=>{
  const started=deferred(),release=deferred();
  const h=baseHarness(h=>({write:async value=>{h.writes.push(value);if(h.writes.length===1){started.resolve();await release.promise;}h.server={...value,revision:value.revision+1};return clone(h.server);}}));
  const original=clone(h.server);h.edit(c=>{c.delays.away=5;},true);await started.promise;
  h.queue.change(original);release.resolve();await h.queue.flush();assert.equal(h.writes.length,2);assert.equal(h.server.delays.away,20);
});

test('Invalid partial input stays unsaved and recovers when corrected',async()=>{
  const h=baseHarness();h.edit(c=>{c.delays.away=null;});
  await assert.rejects(h.queue.flush(),/Borteforsinkelse/);assert.equal(h.writes.length,0);assert.equal(h.states.at(-1).phase,'error');
  assert.equal(h.queue.observe({...clone(h.server),revision:2}),false);
  h.edit(c=>{c.delays.away=30;});await h.queue.flush();assert.equal(h.server.delays.away,30);assert.equal(h.states.at(-1).phase,'saved');
});

test('A validation result for an older edit does not discard a newer valid edit',async()=>{
  const started=deferred(),release=deferred();let calls=0;
  const h=baseHarness(()=>({validate:async value=>{if(++calls===1){started.resolve();await release.promise;}return validate(value);}}));
  const c=h.edit(c=>{c.delays.away=null;},true);await started.promise;c.delays.away=24;h.queue.change(c);
  release.resolve();await h.queue.flush();assert.equal(h.server.delays.away,24);assert.equal(h.writes.length,1);
});

test('A lost success response is reconciled without resending the configuration',async()=>{
  const h=baseHarness(h=>({write:async value=>{h.writes.push(value);h.server={...value,revision:value.revision+1,bridges:{notifications:true,audio:false,questions:false}};throw new Error('Connection lost');}}));
  h.edit(c=>{c.delays.away=25;});await h.queue.flush();assert.equal(h.writes.length,1);assert.equal(h.states.at(-1).phase,'saved');
  assert.equal(h.accepted.at(-1).bridges.notifications,true);
});

test('Unknown outcome is checked before another write after reconnection',async()=>{
  let offline=true;
  const h=baseHarness(h=>({read:async()=>{if(offline)throw new Error('Offline');return clone(h.server);},write:async value=>{h.writes.push(value);h.server={...value,revision:value.revision+1};if(offline)throw new Error('Offline');return clone(h.server);}}));
  const c=h.edit(c=>{c.delays.away=25;});await assert.rejects(h.queue.flush(),/Offline/);
  c.delays.home=26;h.queue.change(c);offline=false;await h.queue.flush();
  assert.deepEqual(h.writes.map(c=>c.revision),[0,1]);assert.equal(h.server.delays.away,25);assert.equal(h.server.delays.home,26);
});

test('Unknown outcome with no newer edit resolves without a duplicate write',async()=>{
  let offline=true;
  const h=baseHarness(h=>({read:async()=>{if(offline)throw new Error('Offline');return clone(h.server);},write:async value=>{h.writes.push(value);h.server={...value,revision:value.revision+1};throw new Error('Offline');}}));
  h.edit(c=>{c.delays.away=25;});await assert.rejects(h.queue.flush());offline=false;await h.queue.recover();
  assert.equal(h.writes.length,1);assert.equal(h.states.at(-1).phase,'saved');
});

test('A configuration changed elsewhere cannot be overwritten by the autosave queue',async()=>{
  const h=baseHarness(h=>({write:async value=>{h.writes.push(value);h.server.delays.home=31;h.server.revision++;throw new Error('Revision conflict');}}));
  const c=h.edit(c=>{c.delays.away=25;});await assert.rejects(h.queue.flush(),/annen visning/);
  c.delays.away=26;h.queue.change(c,true);await assert.rejects(h.queue.flush(),/annen visning/);
  assert.equal(h.writes.length,1);assert.equal(h.server.delays.home,31);assert.equal(h.states.at(-1).conflict,true);
  h.queue.reset(h.server);assert.equal(h.states.at(-1).phase,'saved');
});

test('Polling ignores stale snapshots and retains pending local edits',async()=>{
  const h=baseHarness();const old=clone(h.server);h.edit(c=>{c.delays.away=26;});
  assert.equal(h.queue.observe({...old,revision:1}),false);await h.queue.flush();assert.equal(h.queue.observe(old),false);
  const foreign={...clone(h.server),revision:2,delays:{away:29,home:20}};
  assert.equal(h.queue.observe(foreign),true);assert.equal(h.accepted.at(-1).delays.away,29);
});

test('Wizard saves only the edited choice and keeps active mode and other managed actions',()=>{
  const c=defaults();c.observation=false;c.people.presence=['a'];
  c.routines.find(r=>r.id==='night').actions.push({id:'old-light',kind:'set',category:'lights',deviceId:'lamp',capability:'onoff',value:false,delaySeconds:0,onError:'continue',setupManaged:true});
  const cat={people:{a:{id:'a'},b:{id:'b'}},flows:[{id:'scene',name:'All lights off',type:'normal',enabled:true,triggerable:true}]};
  const people=setup.change(c,{people:['a','b']},cat);
  assert.equal(people.observation,false);assert.deepEqual(people.routines,c.routines);
  const next=setup.change(people,{flows:{away:'normal:scene'}},cat);validate(next);
  assert.equal(next.routines.find(r=>r.id==='night').actions[0].id,'old-light');
  assert.equal(next.routines.find(r=>r.id==='away').actions.length,1);
  const night=setup.change(next,{useNightPeople:true},cat);assert.deepEqual(night.people.night,['a','b']);
  assert.deepEqual(setup.change(night,{useNightPeople:false},cat).people.night,[]);
});

test('Content comparison ignores server metadata and object key order but detects actual edits',()=>{
  const c=defaults(),same={...clone(c),revision:55,timeZone:'Europe/London',bridges:{notifications:true,audio:true,questions:true}};
  assert.equal(content(c),content(same));same.people.presence=['someone'];assert.notEqual(content(c),content(same));
});
