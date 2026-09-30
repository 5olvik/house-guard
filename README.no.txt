House Guard for Homey Pro. Bruk veiviseren til å velge personer og Homey-flows for hjemme, borte og natt. Gjestemodus kan legges til som en bryter i Homey.
Lag for eksempel «Slå av alle lys» i Homey og velg den i veiviseren. Legg inn en Homey API-nøkkel i appen for å kjøre flows, mobilvarsler, nattspørsmål og Sonos direkte uten hjelpeflows.
Veiviseren hjelper deg med API-nøkkel, beboere, mottakere, alarm og rutiner. Fullfør oppsettet før huset styres; du kan stoppe underveis og fortsette senere. Varsler kan prøves før oppsettet er ferdig.
Testversjon. Fysisk virkning og faktisk levering må fortsatt testes på Homey.

Egen alarm med dør-/vindussensorer og bevegelse, eget natt-/borteutvalg, inn-/utgangsforsinkelse og alarmpanel som Homey-enhet. Ingen separat alarmapp eller alarmbroflows.
Alarmoppsettet samler varsler, kamera, lyd, lys og egne handlinger per hendelse. Sensorer og lås/port har egne underfaner. Når House Guard-alarmen er på, alle beboere er bekreftet borte og gjestemodus er av, kobles full alarm alltid til med valgte forsinkelser. Nattalarm krever noen hjemme som sover. Morgen kan ikke frakoble et tomt hus. Velg pushmottakere, kritiske varsler og opptil tre kameraer per alarmhendelse for bildevarsler. Kritiske varsler og bildevarsler sendes som separate varsler.

Aktiver eller deaktiver valgte alarmsensorer fra Flow, separat for full alarm og nattalarm, for eksempel mens robotstøvsugeren går. Faste rutiner har låste navn og kan ikke slettes; avkrysningen gjelder bare egne ekstrahandlinger. Egne rutiner kan navngis og slettes.

Hver funksjon samler innstillinger og handlinger på ett sted. Natt og morgen er delt i Aktivering av natt og Deaktivering av alarm. Handlingene har tydelige valg for rekkefølge eller parallellkjøring. Mobilmenyen har personer- og sireneikon og er tilpasset smale skjermer.

Gjestemodus teller som at noen er hjemme: borterutinen venter og alarmen holdes frakoblet. Påslag mens beboere er hjemme endrer ikke lysene; påslag i tomt hus bruker vanlig hjemkomst. Vi anbefaler å legge til enheten Gjestemodus i Homey for av/på-styring. Innebygde pushvarsler gir beskjed ved påslag, avslag og når gjestene er alene, til mottakerne valgt under Personer. Under Rutiner kan du legge til egne ekstrahandlinger for gjestemodus på og av; varselhandlinger er ikke nødvendig. Bortreiste brukere som fortsatt står som sovende settes automatisk våkne, uten å vekke hjemmeværende eller starte morgenrutinen.
