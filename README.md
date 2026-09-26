# House Guard

House Guard er en Homey Pro-app for hjemme-, borte-, natt- og gjestemodus. Velg personer og Homey-flows i en veiviser, og utvid med innebygd alarm, dørlås, varsler og lyd etter behov.

**Versjon 0.4.0 er en testversjon.** [Installer fra Homeys testkanal](https://homey.app/a/no.husmodus/test/). Appen starter i observasjonsmodus: planlagte handlinger vises uten å styre enheter eller sende meldinger. Innstillingssiden er foreløpig på norsk.

## Funksjoner

- Automatisk lagring uten lagreknapp eller ekstra bekreftelsesdialog.
- Veiviser med personvalg og valg av én Flow for avreise, hjemkomst og natt.
- Rutiner ved hjemkomst, avreise, natt, morgen og alarm.
- Gjestemodus som egen av/på-enhet i Homey.
- Egen alarmmotor med dør-/vindussensorer og bevegelsessensorer, separate valg for natt og borte og inn-/utgangsforsinkelse.
- Alarmpanel som egen Homey-enhet. Ingen separat alarmapp eller alarmbroflows.
- Direkte styring av kompatible låseenheter, inkludert Yale.
- Nattspørsmål med svarfrist og nei-veto.
- Enkle Flow-kort med navnevalg for mobilvarsler, spørsmål og Sonos.
- Forhåndsvisning, konfigurasjonskontroll, import/eksport og observasjonslogg.
- Kontroll av bekreftet lås-/porttilstand og avbrudd ved endret oppsett eller tilstedeværelse.

Mobilvarsler, spørsmål og Sonos trenger små Flow-koblinger. Oppskriftene finnes under **Mer → Koblinger**. Enkle utgangskoblinger har ikke automatisk reservepush eller leveringskvittering. Gyldige kort betyr ikke at meldingen er mottatt eller lyden hørt.

## Kom i gang

Krever Homey Pro med programvare **12.3.0 eller nyere**. Homey Cloud støttes ikke. For utviklingsverktøyene brukes **Node.js 24** og Git.

```sh
git clone https://github.com/5olvik/house-guard.git
cd house-guard
npm ci
npm test
npm run check
npm run validate -- --level publish
```

For installasjon fra kildekoden, logg inn i Homey CLI og velg riktig Homey:

```sh
npx homey login
npx homey select
npx homey app install
```

Ved oppdatering: installer uten `--clean` for å beholde innstillinger og paringer. Åpne **House Guard → Hjem → Åpne veiviseren** og gjennomgå oppsettet i observasjon før styring aktiveres. Nye brukere velger sine egne personer og enheter.

Gjestebryteren legges til med **Legg til enhet → House Guard → Gjestemodus**. Alarmpanelet legges til samme sted med **Alarmpanel**.

Velg House Guard-alarm under **Sikkerhet**, velg sensorer for Borte/Natt og merk bare inngangssensorer som Forsinket. Test i observasjon først. Oppgradering fra et eksternt alarmpanel setter appen i observasjon og tømmer alarmsensorutvalget. Den separate gamle alarmappen avinstalleres ikke automatisk. Se [alarmoppsett](docs/NATIVE-ALARM.md).

Endringer i innstillinger, handlinger og veiviseren lagres automatisk. Tekstfelt lagres etter en kort skrivepause; brytere og lister lagres med en gang. Statusfeltet viser om lagringen er ferdig. Ved ugyldige felt eller forbindelsesfeil vises «Ikke lagret», og det sist lagrede oppsettet gjelder. Rett feilen før du lukker siden. Ved konflikt med en annen visning kan du forkaste lokale endringer og laste inn det lagrede oppsettet. Ventende rutiner avbrytes når oppsettet endres.

## Lokal demonstrasjon

```sh
npm run preview
```

Åpne http://127.0.0.1:4781/?demo=1. Demoen bruker fiktive personer og enheter, har ingen forbindelse til Homey og lagrer endringer bare i minnet.

## Status og begrensninger

111 automatiserte tester og lokal Homey-validering på nivå `publish` består. Dette er ikke en App Store-godkjenning eller en fullstendig fysisk funksjonstest. Mobilmottak, lyd, sanntidshendelser, lås og port må prøves kontrollert i eget oppsett. Visuell kontroll av den nye veiviseren og testing med nye brukere gjenstår.

Flow-valg er valgfritt. Lag for eksempel en Flow i Homey som slår av alle lys, og velg den i veiviseren. Direkte enhetshandlinger kan fortsatt legges til under Rutiner. Et oppsett med mange varseltyper, mottakere og høyttalere trenger flere koblinger. Ikke aktiver overlappende rutiner i House Guard og eksisterende flows uten å gjennomgå hvem som styrer hva.

## Dokumentasjon

- [Innebygd alarm og overgang fra eldre oppsett](docs/NATIVE-ALARM.md)
- [Vurdering av færre Flow-koblinger](docs/FLOW-SIMPLIFICATION.md)
- [Integrasjoner og nødvendige Flow-koblinger](docs/INTEGRATIONS.md)
- [Tester og kjente begrensninger](docs/TEST-REPORT.md)
- [Arkitektur](docs/ARCHITECTURE.md)
- [Videre arbeid](docs/ROADMAP.md)

Private husoppsett, migreringsskript, logger og sikkerhetskopier inngår ikke i repositoryet. Ikke legg ved innloggingsdata eller komplette personlige konfigurasjoner når du rapporterer feil.

## Kildepakke og lisens

`npm run package` lager en ZIP av den sist committede kildekoden i `artifacts/`. Commit lokale kodeendringer først. Private og ignorerte filer tas ikke med.

Prosjektet bruker **GPL-3.0-only**. Innstillingssidens visuelle utforming bygger delvis på Power Guard. Se [LICENSE](LICENSE) og [NOTICE.md](NOTICE.md) for lisens og opphavsmerking. House Guard er et separat prosjekt uten offisiell tilknytning til Power Guard, Athom, Heimdall eller Yale.

Den tekniske app-ID-en `no.husmodus` beholdes for oppdateringskompatibilitet. Navnet i brukergrensesnittet er House Guard.
