'use strict';
const title = (no, en) => ({ no, en });
const typeArg = { name: 'type', type: 'dropdown', title: title('Alarmtype', 'Alarm type'), values: [
  { id: 'fire', title: title('Brann', 'Fire') }, { id: 'water', title: title('Vann', 'Water') },
] };
const tokens = [
  ['incident_id','Hendelse','Incident'], ['type','Alarmtype','Alarm type'], ['zone','Rom','Room'], ['sensor','Sensor','Sensor'], ['reason','Alarm','Alarm'],
].map(([name, no, en]) => ({ name, type: 'string', title: title(no, en) }));
function definitions() {
  return {
    triggers: [
      { id: 'environment_alarm_started', title: title('Brann- eller vannalarm starter', 'A fire or water alarm starts'), titleFormatted: title('[[type]]alarm starter', 'A [[type]] alarm starts'), args: [typeArg], tokens,
        hint: title('Én gang per hendelse. Ekstra sensorer legges til den samme hendelsen.', 'Once per incident. Additional sensors join the same incident.') },
      { id: 'environment_alarm_cleared', title: title('Sensorene melder ikke lenger brann- eller vannalarm', 'Sensors no longer report a fire or water alarm'), titleFormatted: title('Sensorene melder ikke lenger [[type]]alarm', 'Sensors no longer report a [[type]] alarm'), args: [typeArg], tokens },
    ],
    conditions: [{ id: 'environment_alarm_active', title: title('Brann- eller vannalarm er aktiv', 'A fire or water alarm is active'), args: [typeArg] }],
    actions: [{ id: 'environment_acknowledge', title: title('Kvitter brann- eller vannvarselet', 'Acknowledge the fire or water notification'), args: [typeArg],
      hint: title('Stopper gjentatte House Guard-varsler. Sensoralarm og fysiske røykvarslere avstilles ikke.', 'Stops repeated House Guard notifications. Does not silence sensors or physical smoke alarms.') }],
  };
}
function register(app) {
  for (const id of ['environment_alarm_started','environment_alarm_cleared']) app.homey.flow.getTriggerCard(id).registerRunListener(async (args, state) => args.type === state?.type);
  app.homey.flow.getConditionCard('environment_alarm_active').registerRunListener(async ({ type }) => !!app.environment?.current(type));
  app.homey.flow.getActionCard('environment_acknowledge').registerRunListener(async ({ type }) => {
    const incident = app.environment?.current(type);
    if (!incident) throw Error('Ingen aktiv brann- eller vannalarm av denne typen.');
    app.environment.acknowledge(incident.id); return true;
  });
}
async function emit(app, event, context) {
  const id = event === 'started' ? 'environment_alarm_started' : 'environment_alarm_cleared';
  return app.homey.flow.getTriggerCard(id).trigger({ incident_id: context.id, type: context.type, zone: context.zone, sensor: context.sensorName, reason: context.reason }, { type: context.type });
}
module.exports = { definitions, register, emit };
