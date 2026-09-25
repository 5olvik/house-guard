'use strict';

// Only our own, side-effect-free cards are callable by this diagnostic.
// Success with an owner's CLI token would not establish access from an app.
async function checkIntegrationAccess(api) {
  const results = {};
  for (const [name, method, id] of [
    ['actions', 'runFlowCardAction', 'check_integration_access'],
    ['conditions', 'runFlowCardCondition', 'delivery_matches'],
  ]) {
    try {
      await api.flow[method]({ id: `homey:app:no.husmodus:${id}`, args: {}, tokens: {}, state: {} });
      results[name] = { available: true };
    } catch (error) {
      results[name] = { available: false, reason: String(error.message || error).slice(0, 300) };
    }
  }
  return { checkedAt: Date.now(), ...results };
}

module.exports = checkIntegrationAccess;
