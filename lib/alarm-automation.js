'use strict';
const EVENTS = ['away','night','home','morning','firstWake'];
function defaults() { return Object.fromEntries(EVENTS.map(id=>[id,true])); }
function migrate(config) {
  if(config.security.automation !== undefined)return false;
  // Retain deliberately disabled events from older installations.
  config.security.automation=Object.fromEntries(EVENTS.map(id=>[id,config.routines?.find(r=>r.id===id)?.enabled!==false]));
  return true;
}
module.exports={EVENTS,defaults,migrate};
