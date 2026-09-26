# Tester og begrensninger – 0.4.1

Kontrollert 26. september 2026 med Node.js 24, Homey CLI 4.5.0 og homey-api 3.19.5.

## Automatiserte tester

**118 tester består.** Kjør `npm test`. Testene bruker klokke, adaptere og Homey-stubber; de styrer ikke et fysisk hus.

Dekningen omfatter tilstedeværelse, forsinkelser og avbrudd, nattspørsmål med frist og nei-veto, sen/utdatert respons, omstart, gjestemodus og enhetsdriver, lås- og portregler, observasjon, tilstandsbekreftelse, alarmkontekst, tidsplaner og sommertid, konfigurasjonsendring, rutineforhåndsvisning, enkle Flow-koblinger, egen alarmmotor og alarmpanel og oppsettsveiviser.

Flow-veiviseren er kontrollert for begge Flow-typer, like navn, utilgjengelige eller slettede valg, erstatning av tidligere veiviserlys, gjenbruk av eksisterende handlinger og vern av avhengigheter. Flow-start leser fersk status og kontrollerer autorisasjon igjen før sending. Ingen eksisterende scene-Flow er startet under denne kontrollen.

Autolagring er testet med raske endringer, samtidige forespørsler, ufullstendige verdier, utdatert polling, tapte svar og endringer fra en annen visning. Veiviseren lagrer bare det endrede valget, uten å overskrive andre veiviserhandlinger.

Autolagringsmodellen er også kjørt mot den lokale demoens HTTP-API: to raske endringer ble lagret, ugyldig tall ble avvist og JavaScript-filen ble levert. Dette er en API-kontroll, ikke en visuell nettlesertest.

`npm run check` kontrollerer JavaScript-syntaks, lokale modulstier, standardkonfigurasjon, API-handlerne og samsvar mellom manifest og pakkeversjon. Kontrollen er uavhengig av private migreringsfiler.

`npm run validate -- --level publish` består. Dette er lokal Homey-validering, ikke innsendelse eller godkjenning i App Store.

Alarmtestene dekker full/natt-utvalg, korte sensorpulser, ukjente sensorer, åpne dører, forsinkelser, avstilling, duplikater, omstart, endret oppsett, observasjon og overgang fra eksternt panel. Integrasjonstestene bekrefter at hjemkomst kan avbryte en pågående tilkobling og at avstilling stopper ventende tilkoblingshandlinger.

Demoens HTTP-API er testet med lagring av sensoroppsett, tilkobling, simulert alarm med sone/årsak og avstilling. Frakobling er også testet mens en tilkoblingsforespørsel venter på en treg avlesing; det forsinkede svaret får ikke koble til igjen.

Push-testene bekrefter at vanlig, kritisk og bildepush beholder alle valgte mottakere og eventuelt kamera. Tidslinjekopi er valgfri og sendes én gang etter push, ikke per mottaker. Observasjon blokkerer begge deler, endret konfigurasjon stopper kopien, og feil i tidslinjen fører ikke til ny push. Dette er SDK-/adaptertester; ingen testmelding er sendt til reelle telefoner.

## Kontroller utført på Homey

- 0.4.1 er installert og kjører uten krasj eller katalogfeil. Konfigurasjonen og alle Advanced Flows er identiske med sikkerhetskopien tatt rett før installasjon. Alle tre push-kort er tilgjengelige. Observasjon er fortsatt aktiv, og ingen reelle prøvevarsler er sendt.

- 0.4.0 er installert i observasjon. Eget alarmpanel er valgt internt, men ingen fysisk alarmsensor er valgt. Katalogen har ingen feil. Personer, rutiner og øvrige enhetsvalg er bevart. Seks gamle alarmbrokort er fjernet fra appens integrasjonsflow; de 28 gjenværende kortene er kontrollert uten feil. Andre personlige flows er uendret.
- 0.3.1 viser begge Flow-typer og bevarer Homeys opplysning om hvilke flows som kan startes direkte. Veiviserens utkast ble validert og forhåndsvist gjennom den installerte appen uten lagring eller Flow-start. Lagret konfigurasjon og observasjon var uendret etter installasjonen.
- Appen installeres og kjører i observasjon uten katalogfeil.
- Faktiske kortmetadata og Sonos-lydvalg er lest.
- Nye Flow-koblinger er kontrollert med Homeys `isBroken()` og appens kontroll av forbindelser, mål og tagger.
- Nødvendige endringer i et eksisterende oppsett er kontrollert uten å endre de øvrige rutinene.
- Appens tilgang til å kjøre handlings- og betingelseskort ble avvist med «Missing Scopes» i en ufarlig prøve.

Disse kontrollene bekrefter oppsett og tilgang, ikke at meldinger er mottatt, lyd hørt eller enheter fysisk styrt.

## Gjenstående

- Faktisk mobilmottak, tale og alarmlyd.
- Mobilkortets feil, tidsavbrudd og sent svar på reelle telefoner.
- Full alarmprøve med valgte fysiske sensorer, avstilling og sanntidsforbindelse.
- Fysisk virkning av lås og port i et kontrollert oppsett.
- Visuell kontroll av veiviser og autolagring på innstillingssiden, særlig på mobil. Ingen nettleser var tilgjengelig under den siste kontrollen.
- En komplett vanlig Flow med de nye kortene i praktisk bruk. Lokale modeller dekker både vanlige flows og Advanced Flow; den kontrollerte installasjonen bruker Advanced Flow.
- Testing med nye brukere og full engelsk oversettelse av innstillingene.

Enkle utgangskoblinger har ingen automatisk reservepush eller eksplisitt leveringskvittering. Private kontrollresultater, enhets-ID-er, logger og sikkerhetskopier er ikke del av kildekoden.
