'use strict';
module.exports = {
  async checkIntegrationAccess({ homey }) {
    const app = homey.app;
    if (!app.engine.config.observation) throw new Error('Kontroller tilgang i observasjonsmodus.');
    return require('./lib/integration-access')(app.adapter.api);
  },
  async validateConfig({ body }) { return require('./lib/config').validate(body); },
  async getState({ homey }) { const app = homey.app; return { status: app.engine.status(), config: app.engine.config, catalog: app.adapter.catalogue, readiness: require('./lib/readiness')(app.engine.config, app.engine.snapshot, app.adapter.catalogue, app.engine.state, Date.now(), { heimdall: app.heimdall?.status }), builtins: Object.fromEntries(app.engine.config.routines.map(r => [r.id, require('./lib/plans').builtins(r.id, app.engine.config, { personId:app.engine.facts().homeIds[0] }, app.engine.facts())])) }; },
  async previewRoutine({ homey, body }) { const config = require('./lib/config').validate(body.config || homey.app.engine.config); return require('./lib/preview')(homey.app.engine, body.id, config, homey.app.adapter.catalogue, await homey.app.adapter.snapshot(config)); },
  async setupBridges({ homey }) { return homey.app.setupBridges(); },
  async getCatalog({ homey }) { return homey.app.adapter.catalog(); },
  async saveConfig({ homey, body }) {
    if (!body || body.revision !== homey.app.engine.config.revision) throw new Error('Oppsettet er endret i en annen visning. Last inn på nytt før lagring.');
    return homey.app.saveConfig(body);
  },
  async command({ homey, body }) {
    const engine = homey.app.engine;
    if (!body || typeof body.type !== 'string') throw new Error('Mangler kommando');
    switch (body.type) {
      case 'mode': await engine.manual(body.mode); break;
      case 'guest': engine.setGuest(body.value); break;
      case 'skip': engine.skipNight(); break;
      case 'routine': engine.start(body.id); break;
      case 'answer': engine.answer(body.id, body.personId, body.answer); break;
      case 'refresh': await homey.app.refresh(); break;
      default: throw new Error('Ukjent kommando');
    }
    return engine.status();
  },
};
