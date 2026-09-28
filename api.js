'use strict';
module.exports = {
  async alarmSounds({homey,body}) {
    const adapter=homey.app.adapter,device=adapter.catalogue.devices?.[body?.deviceId];
    if(!device?.driverId?.includes('sonos'))throw Error('Velg en Sonos-høyttaler.');
    const sounds=await adapter.api.flow.getFlowCardAutocomplete({id:'homey:device:'+device.id+':cloud_play_sound',type:'action',name:'sound',query:'',args:{}});
    return sounds.map(s=>({id:s.id,label:s.name}));
  },
  async testDirectConnection({homey,body}) {return require('./lib/direct-test').testDirect(homey.app,body?.type,{notificationType:body?.notificationType,imageDeviceId:body?.imageDeviceId,alarmCameras:body?.alarmCameras===true});},
  async saveApiKey({homey,body}) {return homey.app.configureApiKey(body);},
  async checkIntegrationAccess({ homey }) {
    const app = homey.app;
    if (!app.engine.config.observation) throw new Error('Kontroller tilgang i observasjonsmodus.');
    return require('./lib/integration-access')(app.adapter.api);
  },
  async validateConfig({ homey,body }) { if(homey?.app?.engine)require('./lib/config').protectRoutines(homey.app.engine.config,body);return require('./lib/config').validate(body); },
  async getState({ homey }) { const app = homey.app; app.adapter.catalogue.direct=app.adapter.direct?.status(); return { version:require('./app.json').version, direct:app.adapter.direct?.status(), controls:require('./lib/manual-controls').status(app.engine), sleepConnections:require('./lib/sleep-flows').selected(app.engine.config), status: app.engine.status(), intrusion:app.intrusion?.status(), config: app.engine.config, catalog: app.adapter.catalogue, readiness: require('./lib/readiness')(app.engine.config, app.engine.snapshot, app.adapter.catalogue, app.engine.state, Date.now(), { intrusion:app.intrusion?.status() }), builtins: Object.fromEntries(app.engine.config.routines.map(r => [r.id, require('./lib/plans').builtins(r.id, app.engine.config, { personId:app.engine.facts().homeIds[0] }, app.engine.facts())])) }; },
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
      case 'control': await require('./lib/manual-controls').run(engine,body.target,body.value); break;
      case 'alarm': await homey.app.setAlarmMode(body.mode); break;
      case 'alarm-test': await homey.app.testAlarmSensor(body.deviceId,body.capability); break;
      case 'mode': await engine.manual(body.mode); break;
      case 'presence': await engine.setAllPresent(body.present); break;
      case 'guest': await homey.app.setGuestMode(body.value); break;
      case 'skip': engine.skipNight(); break;
      case 'routine': engine.start(body.id); break;
      case 'answer': engine.answer(body.id, body.personId, body.answer); break;
      case 'refresh': await homey.app.refresh(); break;
      default: throw new Error('Ukjent kommando');
    }
    return engine.status();
  },
};
