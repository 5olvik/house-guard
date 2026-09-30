# House Guard

House Guard er en Homey Pro-app for hjemme-, borte-, natt- og gjestemodus. Veiviseren hjelper deg med forbindelse, beboere og funksjonene du velger: alarm, Homey-Flows, natt og morgen.

**Versjon 0.4.23 er tilgjengelig som testversjon.** [Installer fra Homeys testkanal](https://homey.app/a/no.husmodus/test/). Veiviseren fullføres før huset styres. Innstillingssiden er foreløpig på norsk.

Kildekoden her er versjon **0.4.28**, med innstillinger og handlinger samlet etter funksjon, separate kort for nattaktivering og deaktivering av alarm og tydelig valg av handlingsrekkefølge. Mobilmenyen beholder appens stil når Homeys stilark lastes, og Personer og Alarm har tydeligere ikoner. Gjestemodus anbefaler egen Homey-enhet, med innebygde pushvarsler ved påslag, avslag og når gjestene blir alene. Versjon **0.4.23** er publisert i Homey App Stores testkanal (bygg 9), bekreftet 29. september 2026. 0.4.28 er foreløpig en lokal oppdatering. Se [alarmoppsett](docs/ALARM-SETUP.md) og [teststatus](docs/TEST-REPORT.md) for hva som er verifisert.

## Funksjoner

- Automatisk lagring uten lagreknapp eller ekstra bekreftelsesdialog.
- Veiviser med funksjonsvalg, API-forbindelse, beboere og mottakere, relevante innstillinger og kontroll før aktivering. Oppsettet kan gjenopptas.
- Forside med status for funksjonene som er satt opp og konkrete snarveier når noe mangler.
- Rutiner ved hjemkomst, avreise, natt, morgen og alarm.
- Faste rutiner kan ikke endre navn eller slettes; avkrysningen styrer bare ekstrahandlingene. Hver funksjon har fast plass med både innstillinger og handlinger. Egne rutiner kan deaktiveres eller slettes.
- Velkomstlys og gjestemodus har hvert sitt samlede oppsett. Natt og morgen er delt i Aktivering av natt og Deaktivering av alarm. Tilleggsvalg vises ved behov.
- Alarmens push, kamera, lyd, lys og egne handlinger er samlet per hendelse under Varsler og handlinger.
- Valgfri morgenstart ved bevegelse i et valgt tidsrom: frakobler nattalarm og setter hjemmeværende våkne.
- Gjestemodus som egen av/på-enhet i Homey: gjester holder huset hjemme og alarmen frakoblet. Vanlige hjemkomst-/borterutiner gjenbrukes, med innebygde pushvarsler.
- Egen alarmmotor med dør-/vindussensorer og bevegelsessensorer, separate valg for natt og borte og inn-/utgangsforsinkelse.
- Alarmpanel som egen Homey-enhet med status og avstilling. Ingen separat alarmapp eller alarmbroflows.
- Direkte styring av kompatible låseenheter, inkludert Yale.
- Nattspørsmål med svarfrist og nei-veto.
- Direkte mobilvarsler, nattspørsmål og Sonos med Homey API-nøkkel, uten hjelpeflows.
- Manuelle knapper som setter alle valgte brukere hjemme eller borte, også uten GPS.
- Forhåndsvisning, konfigurasjonskontroll og import/eksport. Eksplisitte normal-, kritisk- og bildetestvarsler kan sendes før grunnoppsettet er fullført.
- Kontroll av bekreftet lås-/porttilstand og avbrudd ved endret oppsett eller tilstedeværelse.

Alle som har «Motta pushvarsler» under Personer, er mottakere for alle appens pushvarsler. Vanlig push, kritisk push og bildevarsel beholdes. Hver varselhandling kan i tillegg velge «Vis også i Homeys tidslinje». Dette er en valgfri kopi, ikke erstatning for alarmvarsling.

Mobilvarsler, spørsmål, Sonos og Flow-start kjøres direkte med en Homey API-nøkkel. Se [API-oppsettet](docs/API-KEY.md). Kontroller faktisk mottak på telefonen og hørbar lyd ved testing.

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

Ved oppdatering: installer uten `--clean` for å beholde innstillinger og paringer. Nytt oppsett starter under **House Guard → Hjem → Start oppsettet**. Veiviseren kan åpnes igjen under **Innstillinger → Endre grunnoppsett** og viser eksisterende valg.

1. Velg hvilke funksjoner du ønsker: alarm, lys/rutiner og natt/morgen.
2. Sett opp direkte forbindelse med en [Homey API-nøkkel](docs/API-KEY.md) for funksjonene som trenger det.
3. Velg beboere og hvem som skal motta pushvarsler.
4. Gå gjennom de relevante stegene for alarm, eksisterende Homey-Flows og nattutvalg.
5. Se over kontrollpunktene, send ønskede testvarsler og trykk **Ta i bruk House Guard**, eller **Fortsett senere** for å beholde oppsettet uferdig.

Valg lagres underveis. Veiviserens funksjonsvalg bestemmer hvilke steg du får se; de slår ikke av et eksisterende oppsett. Vanlig, kritisk og bilde-testpush er uttrykkelige prøvehandlinger. De endrer ikke alarmmodus eller aktiverer rutiner.

Gjestebryteren legges til med **Legg til enhet → House Guard → Gjestemodus**. Alarmpanelet legges til samme sted med **Alarmpanel**.

Velg House Guard-alarm under **Alarm**, velg sensorer for Borte/Natt og merk bare inngangssensorer som Forsinket. Kontroller sensoroppsettet før bruk. Oppgradering fra et eksternt alarmpanel krever fullføring av nytt alarmoppsett og tømmer alarmsensorutvalget. Den separate gamle alarmappen avinstalleres ikke automatisk. Se [alarmoppsett](docs/ALARM-SETUP.md).

Endringer i innstillinger, handlinger og veiviseren lagres automatisk. Tekstfelt lagres etter en kort skrivepause; brytere og lister lagres med en gang. Statusfeltet viser om lagringen er ferdig. Ved ugyldige felt eller forbindelsesfeil vises «Ikke lagret», og det sist lagrede oppsettet gjelder. Rett feilen før du lukker siden. Ved konflikt med en annen visning kan du forkaste lokale endringer og laste inn det lagrede oppsettet. Ventende rutiner avbrytes når oppsettet endres.

## Lokal demonstrasjon

```sh
npm run preview
```

Åpne http://127.0.0.1:4781/?demo=1. Demoen bruker fiktive personer og enheter, har ingen forbindelse til Homey og lagrer endringer bare i minnet.

## Status og begrensninger

300 automatiserte tester, kodekontroll av 82 JavaScript-filer og Homey-validering på nivå `publish` består for 0.4.28. Versjonen er installert lokalt med bevart oppsett. Veiviseren og de samlede innstillingene er kontrollert i lokal nettleserdemo, inkludert gjenopptakelse og bevarte person-, sensor- og Flow-valg. Mobilmenyen er prøvd ved 320 og 390 px med Homeys faktiske stilark. En uavhengig førstegangsbruker og den nyeste iPhone-visningen er ikke prøvd. Mobilmottak, lyd, sanntidshendelser, lås og port må prøves kontrollert i eget oppsett. Se [teststatus](docs/TEST-REPORT.md).

Flow-valg er valgfritt. Lag for eksempel en Flow i Homey som slår av alle lys, og velg den i veiviseren. Direkte enhetshandlinger kan fortsatt legges til under Rutiner. Med klar API-forbindelse trenger push, Sonos og start av valgte Flows ingen hjelpeflows. Gjennomgå overlappende rutiner i House Guard og eksisterende Flows før aktivering.

## Dokumentasjon

- [Innebygd alarm og overgang fra eldre oppsett](docs/NATIVE-ALARM.md)
- [Direkte forbindelse med API-nøkkel](docs/API-KEY.md)
- [Tidligere vurdering av Flow-koblinger](docs/FLOW-SIMPLIFICATION.md)
- [Integrasjoner og eldre Flow-koblinger](docs/INTEGRATIONS.md)
- [Tester og kjente begrensninger](docs/TEST-REPORT.md)
- [Arkitektur](docs/ARCHITECTURE.md)
- [Videre arbeid](docs/ROADMAP.md)

Private husoppsett, migreringsskript, logger og sikkerhetskopier inngår ikke i repositoryet. Ikke legg ved innloggingsdata eller komplette personlige konfigurasjoner når du rapporterer feil.

## Kildepakke og lisens

`npm run package` lager en ZIP av den sist committede kildekoden i `artifacts/`. Commit lokale kodeendringer først. Private og ignorerte filer tas ikke med.

Prosjektet bruker **GPL-3.0-only**. Innstillingssidens visuelle utforming bygger delvis på Power Guard. Se [LICENSE](LICENSE) og [NOTICE.md](NOTICE.md) for lisens og opphavsmerking. House Guard er et separat prosjekt uten offisiell tilknytning til Power Guard, Athom, Heimdall eller Yale.

Den tekniske app-ID-en `no.husmodus` beholdes for oppdateringskompatibilitet. Navnet i brukergrensesnittet er House Guard.

Direkte Flow-start, vanlig push, kritisk push og bildevarsel er tidligere prøvd på Homey, med varsler og bilde bekreftet på brukerens telefon. Det er historiske leveringsprøver; de erstatter ikke kontroll av eget oppsett eller fysisk prøving av den nye veiviseren. Alarmens kamera, varsler, Sonos og lys velges under Alarm. Se [alarmoppsett](docs/ALARM-SETUP.md).
