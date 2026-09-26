# Tester og begrensninger – 0.3.1

Kontrollert 26. september 2026 med Node.js 24, Homey CLI 4.5.0 og homey-api 3.19.5.

## Automatiserte tester

**80 tester består.** Kjør `npm test`. Testene bruker klokke, adaptere og Homey-stubber; de styrer ikke et fysisk hus.

Dekningen omfatter tilstedeværelse, forsinkelser og avbrudd, nattspørsmål med frist og nei-veto, sen/utdatert respons, omstart, gjestemodus og enhetsdriver, lås- og portregler, observasjon, tilstandsbekreftelse, alarmkontekst, tidsplaner og sommertid, konfigurasjonsendring, rutineforhåndsvisning, enkle Flow-koblinger, Heimdall-håndtering og oppsettsveiviser.

Flow-veiviseren er kontrollert for begge Flow-typer, like navn, utilgjengelige eller slettede valg, erstatning av tidligere veiviserlys, gjenbruk av eksisterende handlinger og vern av avhengigheter. Flow-start leser fersk status og kontrollerer autorisasjon igjen før sending. Ingen eksisterende scene-Flow er startet under denne kontrollen.

`npm run check` kontrollerer JavaScript-syntaks, lokale modulstier, standardkonfigurasjon, API-handlerne og samsvar mellom manifest og pakkeversjon. Kontrollen er uavhengig av private migreringsfiler.

`npm run validate -- --level publish` består. Dette er lokal Homey-validering, ikke innsendelse eller godkjenning i App Store.

## Kontroller utført på Homey

- 0.3.1 viser begge Flow-typer og bevarer Homeys opplysning om hvilke flows som kan startes direkte. Veiviserens utkast ble validert og forhåndsvist gjennom den installerte appen uten lagring eller Flow-start. Lagret konfigurasjon og observasjon var uendret etter installasjonen.
- Appen installeres og kjører i observasjon uten katalogfeil.
- Direkte tilkobling til Heimdall 2.11.0 er opprettet.
- Faktiske kortmetadata og Sonos-lydvalg er lest.
- Nye Flow-koblinger er kontrollert med Homeys `isBroken()` og appens kontroll av forbindelser, mål og tagger.
- Nødvendige endringer i et eksisterende oppsett er kontrollert uten å endre de øvrige rutinene.
- Appens tilgang til å kjøre handlings- og betingelseskort ble avvist med «Missing Scopes» i en ufarlig prøve.

Disse kontrollene bekrefter oppsett og tilgang, ikke at meldinger er mottatt, lyd hørt eller enheter fysisk styrt.

## Gjenstående

- Faktisk mobilmottak, tale og alarmlyd.
- Mobilkortets feil, tidsavbrudd og sent svar på reelle telefoner.
- Faktisk mottak av Heimdall-hendelser og alarmens detaljtekst.
- Fysisk virkning av lås og port i et kontrollert oppsett.
- Visuell kontroll av den nye veiviseren, særlig på mobil. Ingen nettleser var tilgjengelig under den siste kontrollen.
- En komplett vanlig Flow med de nye kortene i praktisk bruk. Lokale modeller dekker både vanlige flows og Advanced Flow; den kontrollerte installasjonen bruker Advanced Flow.
- Testing med nye brukere og full engelsk oversettelse av innstillingene.

Enkle utgangskoblinger har ingen automatisk reservepush eller eksplisitt leveringskvittering. Private kontrollresultater, enhets-ID-er, logger og sikkerhetskopier er ikke del av kildekoden.
