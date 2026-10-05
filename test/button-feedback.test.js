'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const {disable, run} = require('../settings/button-feedback');
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; }
function button(text, disabled = false) {
  const attributes = new Map();
  return {
    disabled, dataset:{}, style:{minWidth:''}, childNodes:[{textContent:text}],
    get textContent() { return this.childNodes.map(n => n.textContent).join(''); },
    set textContent(value) { this.childNodes = [{textContent:value}]; },
    getAttribute:name => attributes.get(name) ?? null,
    setAttribute:(name, value) => attributes.set(name, String(value)), removeAttribute:name => attributes.delete(name),
    getBoundingClientRect:() => ({width:125.2}), replaceChildren(...nodes) { this.childNodes = nodes; },
  };
}
test('Bare valgt knapp viser fremdrift; andre beholder teksten og reelt utilgjengelige knapper forblir utilgjengelige', async () => {
  const chosen = button('Start nattmodus'), peer = button('Start morgen'), unavailable = button('Sett alle hjemme', true), gate = deferred();
  const nodes = chosen.childNodes; chosen.style.minWidth = '80px';
  const task = run(chosen, () => gate.promise, {peers:[peer, unavailable, chosen]});
  assert.equal(chosen.getAttribute('aria-busy'), 'true'); assert.equal(chosen.textContent, 'Jobber …');
  assert.equal(chosen.style.minWidth, '126px'); assert.equal(chosen.disabled, true);
  assert.equal(peer.textContent, 'Start morgen'); assert.equal(peer.dataset.buttonWaiting, 'true');
  assert.equal(peer.getAttribute('aria-busy'), null); assert.equal(peer.disabled, true);
  assert.equal(unavailable.dataset.buttonWaiting, undefined); assert.equal(unavailable.disabled, true);
  gate.resolve('ferdig'); assert.equal(await task, 'ferdig');
  assert.equal(chosen.getAttribute('aria-busy'), null); assert.equal(chosen.style.minWidth, '80px');
  assert.deepEqual(chosen.childNodes, nodes); assert.equal(chosen.childNodes[0], nodes[0]);
  assert.equal(chosen.disabled, false); assert.equal(peer.disabled, false); assert.equal(unavailable.disabled, true);
  assert.equal(peer.dataset.buttonWaiting, undefined);
});
test('Nye trykk og statusoppdatering kan ikke starte parallelle kommandoer i samme gruppe', async () => {
  const first = button('Borte'), second = button('Hjemme'), gate = deferred(); let calls = 0;
  const task = run(first, async () => { calls++; await gate.promise; }, {peers:[second]});
  disable(first, false); disable(second, false);
  assert.equal(first.disabled, true); assert.equal(second.disabled, true);
  await run(first, () => calls++); await run(second, () => calls++, {peers:[first]});
  assert.equal(calls, 1); gate.resolve(); await task;
  await run(second, () => calls++, {peers:[first]}); assert.equal(calls, 2);
});
test('Feil rydder ventetilstand og bruker den nyeste tilgjengeligheten, uten å reaktivere en sperret knapp', async () => {
  const first = button('Borte'), second = button('Hjemme');
  await assert.rejects(run(first, async () => { disable(second, true); throw Error('Ingen forbindelse'); }, {peers:[second]}), /Ingen forbindelse/);
  assert.equal(first.textContent, 'Borte'); assert.equal(first.disabled, false); assert.equal(first.getAttribute('aria-busy'), null);
  assert.equal(second.disabled, true); assert.equal(second.dataset.buttonWaiting, undefined);
  let called = false; await run(second, () => { called = true; }); assert.equal(called, false);
});
test('En knapp som blir tilgjengelig under venting aktiveres først når kommandoen er ferdig', async () => {
  const chosen = button('Oppdater'), peer = button('Ny handling', true), gate = deferred();
  const task = run(chosen, () => gate.promise, {peers:[peer]});
  disable(peer, false); assert.equal(peer.disabled, true); assert.equal(peer.dataset.buttonWaiting, 'true');
  gate.resolve(); await task; assert.equal(peer.disabled, false); assert.equal(peer.dataset.buttonWaiting, undefined);
});
test('Avstilling kan kjøres mens en egen tilkoblingskommando venter', async () => {
  const arm = button('Bortealarm'), disarm = button('Avstill'), duplicateDisarm = button('Frakoble'), gate = deferred(); let disarmed = false;
  const task = run(arm, () => gate.promise, {peers:[arm]});
  await run(disarm, () => { disarmed = true; }, {peers:[duplicateDisarm]});
  assert.equal(disarmed, true); assert.equal(arm.getAttribute('aria-busy'), 'true');
  gate.resolve(); await task;
});
test('Venting på bekreftet enhetsstatus beholdes etter at selve forespørselen er sendt', async () => {
  const chosen = button('Lås');
  await run(chosen, () => disable(chosen, false, true), {label:'Sender …'});
  assert.equal(chosen.textContent, 'Lås'); assert.equal(chosen.getAttribute('aria-busy'), null);
  assert.equal(chosen.disabled, true); assert.equal(chosen.dataset.buttonWaiting, 'true');
  disable(chosen, true); assert.equal(chosen.disabled, true); assert.equal(chosen.dataset.buttonWaiting, undefined);
  disable(chosen, false); assert.equal(chosen.disabled, false);
});
test('Tilbakemeldingen lastes i nettleseren og før alle grensesnitt som bruker den', () => {
  const browser = {window:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../settings/button-feedback'), 'utf8'), browser);
  assert.equal(typeof browser.window.HouseGuardButtons.run, 'function');
  const html = fs.readFileSync(require.resolve('../settings/index.html'), 'utf8');
  const script = html.indexOf('src="button-feedback.js"'); assert.ok(script > 0);
  for (const name of ['setup-ui.js','alarm-ui.js','ui.js']) assert.ok(script < html.indexOf('src="'+name+'"'));
});
test('Ingen statiske House Guard-knapper kan bli overstyrt av Homeys grå legacy-knapperegel', () => {
  const html = fs.readFileSync(require.resolve('../settings/index.html'), 'utf8'), buttons = [...html.matchAll(/<button\b[^>]*>/g)];
  assert.ok(buttons.length > 30);
  for (const [tag] of buttons) assert.match(tag, /class="[^"]*\bhy-nostyle\b/, tag);
});
