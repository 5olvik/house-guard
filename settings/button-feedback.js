'use strict';
// Keep command controls locked while work runs, without making every available
// button look unavailable. Renderers can still update their actual eligibility.
(function(root) {
  const pending = new WeakMap();
  function disable(button, disabled, waiting = false) {
    disabled = !!disabled; waiting = !!waiting;
    const state = pending.get(button);
    if (state) { state.disabled = disabled; state.waiting = waiting; }
    button.disabled = disabled || waiting || !!state;
    if (!disabled && (waiting || state) && button.getAttribute('aria-busy') !== 'true') button.dataset.buttonWaiting = 'true';
    else delete button.dataset.buttonWaiting;
  }
  async function run(button, work, {peers = [], label = 'Jobber …'} = {}) {
    const group = [...new Set([button, ...peers])];
    if (button.disabled || group.some(item => pending.has(item))) return;
    const children = [...button.childNodes], minWidth = button.style.minWidth;
    const ariaBusy = button.getAttribute('aria-busy');
    for (const item of group) pending.set(item, {disabled:item.disabled, waiting:item.dataset.buttonWaiting === 'true'});
    button.style.minWidth = Math.ceil(button.getBoundingClientRect().width) + 'px';
    button.textContent = label;
    button.setAttribute('aria-busy', 'true');
    for (const item of group) { const state = pending.get(item); disable(item, state.disabled, state.waiting); }
    try { return await work(); }
    finally {
      button.replaceChildren(...children); button.style.minWidth = minWidth;
      if (ariaBusy === null) button.removeAttribute('aria-busy'); else button.setAttribute('aria-busy', ariaBusy);
      for (const item of group) { const state = pending.get(item); pending.delete(item); disable(item, state.disabled, state.waiting); }
    }
  }
  const feedback = {disable, run};
  if (typeof module === 'object' && module.exports) module.exports = feedback;
  else root.HouseGuardButtons = feedback;
})(typeof window === 'undefined' ? globalThis : window);
