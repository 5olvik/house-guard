'use strict';

function validPerson(person, now, maxAgeMs) {
  return !!person && person.available !== false && Number.isFinite(person.observedAt)
    && person.observedAt <= now && now - person.observedAt <= maxAgeMs;
}

function presence(config, people, now) {
  const maxAge = config.freshnessSeconds * 1000;
  const selected = config.people.presence.map(id => ({ id, ...(people[id] || {}) }));
  const known = p => validPerson(p, now, maxAge) && typeof p.present === 'boolean';
  const home = selected.filter(p => known(p) && p.present);
  const allAway = selected.length > 0 && selected.every(p => known(p) && p.present === false);
  const night = config.people.night.map(id => ({ id, ...(people[id] || {}) }));
  const nightHome = night.filter(p => known(p) && p.present);
  const nightKnown = night.length > 0 && night.every(p => known(p) && (!p.present || typeof p.asleep === 'boolean'));
  return {
    allAway, someHome: home.length > 0, homeIds: home.map(p => p.id),
    complete: selected.length > 0 && selected.every(known),
    anyAsleep: selected.some(p => known(p) && p.present && p.asleep === true),
    nobodyAsleep: selected.length > 0 && selected.every(p => known(p) && (!p.present || p.asleep === false)),
    allHomeAsleep: home.length > 0 && nightKnown && nightHome.length > 0 && nightHome.every(p => p.asleep === true),
  };
}

function deriveMode(facts) {
  if (facts.allAway) return { mode: 'away', reason: 'Alle valgte personer er bekreftet borte' };
  if (facts.allHomeAsleep) return { mode: 'night', reason: 'Alle hjemme i nattutvalget sover' };
  if (facts.someHome) return { mode: 'home', reason: 'Minst én valgt person er hjemme' };
  return { mode: 'unknown', reason: 'Tilstedeværelse er ukjent eller ingen personer er valgt' };
}

function localParts(now, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
function inWindow(now, timeZone, start, end) {
  const m = localParts(now, timeZone).minute, a = minutes(start), b = minutes(end);
  return a === b || (a < b ? m >= a && m < b : m >= a || m < b);
}
// Walk actual instants: missing DST minutes become the first valid minute after the gap.
// Repeated wall-clock minutes resolve to the next actual occurrence.
function nextMorning(now, timeZone, time) {
  const initial = localParts(now, timeZone), target = minutes(time);
  const dateRequired = initial.minute >= target;
  for (let at = Math.floor(now / 60000) * 60000 + 60000; at <= now + 49 * 3600000; at += 60000) {
    const p = localParts(at, timeZone);
    if ((!dateRequired || p.date !== initial.date) && p.minute >= target) return at;
  }
  throw new Error('Fant ikke neste morgen i valgt tidssone');
}

function decideQuestion(request, now) {
  if (request.decided) return null;
  const answers = request.recipients.map(id => request.answers[id]);
  if (answers.includes('no')) return 'no';
  if (now < request.deadline) return null;
  if (request.rule === 'all-yes') return answers.length > 0 && answers.every(a => a === 'yes') ? 'yes' : 'no';
  return answers.includes('yes') ? 'yes' : 'no';
}

function garageDecision({ open, nobodyAsleep, validated, commandType }) {
  if (!validated || !['pulse', 'close'].includes(commandType)) return 'Portens polaritet og kommando må valideres';
  if (typeof open !== 'boolean') return 'Garasjeport har ukjent status – lukking hoppet over';
  if (!open) return 'Garasjeport er allerede lukket';
  if (!nobodyAsleep) return 'Noen sover, eller sovestatus er ukjent';
  return null;
}

module.exports = { validPerson, presence, deriveMode, localParts, minutes, inWindow, nextMorning, decideQuestion, garageDecision };
