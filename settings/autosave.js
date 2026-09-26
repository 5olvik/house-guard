'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HouseGuardAutosave = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const clone = value => JSON.parse(JSON.stringify(value));
  function content(config) {
    const { revision, bridges, timeZone, ...editable } = config;
    const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
    return JSON.stringify(sort(editable));
  }
  function create({ initial, write, read, validate = async value => value, onState = () => {}, onSaved = () => {}, delay = 350 }) {
    let saved = clone(initial), desired = clone(initial), timer, running, error, conflict = false, uncertain = false, uncertainTarget;
    const pending = () => content(desired) !== content(saved);
    const emit = phase => onState({ phase, pending: pending() || !!running || uncertain, error, conflict });
    function accept(value) { saved = clone(value); uncertain = false; onSaved(clone(saved)); }
    async function drain() {
      while (pending() || uncertain) {
        if (conflict) break;
        const target = clone(desired);
        try {
          if (uncertain) {
            const latest = await read();
            if (content(latest) !== content(saved) && content(latest) !== content(uncertainTarget)) {
              conflict = true;
              throw new Error('Oppsettet er endret i en annen visning. Last inn lagret oppsett før du fortsetter.');
            }
            accept(latest);
            if (!pending()) break;
          }
          const checked = await validate({ ...target, revision: saved.revision });
          emit('saving');
          let result;
          try {
            result = await write(checked);
          } catch (failure) {
            // A lost response may still mean that Homey persisted the request.
            let latest;
            try { latest = await read(); } catch { uncertain = true; uncertainTarget = checked; throw failure; }
            if (content(latest) === content(checked)) result = latest;
            else if (content(latest) !== content(saved)) {
              conflict = true;
              throw new Error('Oppsettet er endret i en annen visning. Last inn lagret oppsett før du fortsetter.');
            } else { accept(latest); throw failure; }
          }
          accept(result);
          // Preserve newer edits made while validation or persistence was in flight.
          if (content(desired) === content(target)) desired = clone(result);
          error = null;
        } catch (failure) {
          error = failure;
          if (!conflict && !uncertain && content(desired) !== content(target)) { error = null; continue; }
          break;
        }
      }
    }
    function start() {
      clearTimeout(timer);
      if (!running && !conflict && (pending() || uncertain)) {
        error = null;
        running = Promise.resolve().then(drain).finally(() => {
          running = null;
          emit(error || conflict ? 'error' : 'saved');
        });
      }
      return running || Promise.resolve();
    }
    return {
      change(value, immediate = false) {
        desired = clone(value);
        clearTimeout(timer);
        if (conflict) { emit('error'); return; }
        if (!pending() && !running && !uncertain) { error = null; emit('saved'); return; }
        emit('saving');
        if (immediate) start(); else timer = setTimeout(start, delay);
      },
      async flush() {
        await start();
        if (error || conflict) throw error || new Error('Last inn lagret oppsett.');
      },
      recover() { if (uncertain && !conflict) return start(); },
      observe(value) {
        // Polls can finish out of order, including after a successful save.
        if (running || pending() || uncertain || conflict || value.revision <= saved.revision) return false;
        desired = clone(value); accept(value); emit('saved'); return true;
      },
      reset(value) {
        if (running) throw new Error('Vent til lagringen er ferdig.');
        clearTimeout(timer); desired = clone(value); error = null; conflict = false; accept(value); emit('saved');
      },
    };
  }
  return { create, content };
});
