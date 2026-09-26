# Integrasjoner i House Guard 0.4.1

Velg personer og Homey-flows med **Hjem → Åpne veiviseren**, og legg til ønskede integrasjoner etterpå.

| Funksjon | Løsning | Ekstra Flow |
| --- | --- | --- |
| Hjem/borte og personstatus | Direkte avlesing og rutinemotor | Ingen |
| Lys og scener | Velg en Homey Flow i veiviseren; direkte enhetshandlinger finnes under Rutiner | Bruk ønsket scene-Flow |
| Gjestemodus | Appbryter og egen Homey-enhet | Ingen |
| Dørlås, inkludert Yale | Valgt enhets låsestatus og kommandoer | Ingen |
| Soneaktivitet og temperatur | Direkte Homey-avlesing med tidsstempel | Ingen |
| House Guard-alarm: modus, sensorer, sone/årsak og forsinkelser | Egen alarmmotor med direkte sensorabonnement | Ingen |
| Mobilvarsler | House Guard-trigger og Homeys mobilkort | To kort per person og varseltype/kamera |
| Tale og alarmlyd | Navnevalg og Sonos-kort med Melding/Volum | To kort per høyttaler og funksjon/lyd |
| Nattspørsmål | Trigger, mobilbetingelse, ja og nei med Dette spørsmålet | Fire kort per mottaker, inkludert Ellers |
| Port | Separat status, kommando, temperatur og sikkerhetsvalg | Ingen for styringen; bildevarsel kobles separat |

## Velg en scene-Flow i veiviseren

Lag en Flow i Homey, for eksempel «Slå av alle lys», med handlingene du vil utføre. Åpne deretter **Hjem → Åpne veiviseren** og velg den under **Når alle drar**. Hjemkomst og natt har hvert sitt valg. «Ingen Flow» er også et gyldig valg.

Listen viser alle vanlige flows og Advanced Flows alfabetisk. Deaktiverte flows, flows med feil og flows som ikke kan startes direkte, vises med en forklaring og kan ikke velges. Advanced Flow må ha et [Start-kort](https://homey.app/en-us/features/advanced-flow/). Bruk **Oppdater Flow-listen** hvis du lager eller endrer en Flow mens veiviseren er åpen.

Valgene lagres automatisk med en gang. Tekstfelt lagres etter en kort skrivepause. Veiviseren beholder valgt observasjonsmodus. Tidligere enkeltlys fra veiviseren erstattes først når du endrer Flow-valget for samme rutine. Egne handlinger under Rutiner beholdes; en allerede valgt Flow legges ikke til to ganger. En startet ekstern Flow kjører sine egne handlinger og kan ikke trekkes tilbake av House Guard.

## Push og valgfri tidslinjekopi

Velg **Motta pushvarsler** for hver ønsket person. Alle valgte brukes for vanlig push, kritisk push og bildevarsler fra alle rutiner, også når de er borte. Endring av mottaker kan kreve ny leveringskobling under Mer → Koblinger.

En varselhandling kan velge **Vis også i Homeys tidslinje**. Kopien er av som standard og sendes én gang etter at push-koblingen er utløst. Feil i tidslinjen logges uten å sende push på nytt. Tidslinjen har ikke samme mottakerutvalg; Homey-brukere med tilgang til tidslinjen kan se teksten. Dersom en bruker også har aktivert push fra appens tidslinje i Homey, kan kopien gi et ekstra telefonvarsel.

Tidslinjevarsler er ikke kritiske varsler eller bildevarsler. De erstatter ikke push for alarm. Homeys [SDK for tidslinjevarsler](https://apps-sdk-v3.developer.homey.app/ManagerNotifications.html) tilbyr tekst uten mottakervalg. En ny kontroll fra House Guard på Homey avviste direkte kjøring av mobilkort med «Missing Scopes». Eksisterende push-Flows beholdes derfor.

## Eksempel: vanlig varsel

1. **Når:** House Guard → Et varsel er klart for → velg person.
2. **Så:** Mobil → Send pushvarsel → velg samme person og taggen **Melding**.

## Eksempel: nattspørsmål

1. **Når:** House Guard → Et nattspørsmål er klart for → velg person.
2. **Og:** Mobil → Send et ja/nei-spørsmål → velg samme person og taggen **Melding**.
3. **Så:** House Guard → Registrer svar på nattspørsmålet → velg Ja og taggen **Dette spørsmålet**.
4. **Ellers:** Samme svarkort, men velg Nei og samme tagg.

Bruk taggene fra det samme Når-kortet. Ikke lag et ekstra mobilspørsmål i en egen Flow. Appen knytter svaret til personen, spørsmålet og fristen; gamle svar ignoreres. Et uteblitt svar blir ikke et ja.

Alle oppskrifter for de valgte tilleggene finnes under **Mer → Koblinger**. Vanlige flows kan brukes; Advanced Flow er valgfritt. Unngå ekstra betingelser og forsinkelser i disse koblingene. Oppsettet lagres automatisk. Velg **Kontroller integrasjonsflows** etter endringer.

## Hva som kontrolleres

Oppsettskontrollen leser sammenhengende kort, mottakere, mål og tagger. Ikke valgte tillegg vises som «Ikke valgt». Ingen prøvemeldinger eller fysiske kommandoer sendes av kontrollen.

En korrekt Flow beviser ikke faktisk mottak eller hørbar lyd. Enkle utgangskoblinger har **ingen automatisk reservepush eller eksplisitt leveringskvittering**. Test valgt varseltype og hver høyttaler separat. Mobilkortets feil og tidsavbrudd må prøves på telefonene.

## Innebygd alarm

House Guard eier alarmtilstanden og leser valgte sensorer direkte. Heimdall-integrasjonen og de gamle alarmbrokortene er fjernet. Se [oppsett og test](NATIVE-ALARM.md). Varsling og Sonos bruker fortsatt leveringskoblingene ovenfor.

## Homeys tillatelser

En ufarlig prøve fra den installerte appen avviste kjøring av handlings- og betingelseskort med «Missing Scopes». Derfor kan mobilkort og Sonos-kort ikke kjøres direkte gjennom det aktuelle Flow-API-et med appens tillatelser. Sluttbrukeren skal ikke opprette eller lime inn en eiertoken.

Homey Pro og API-tillatelsen er nødvendig for den direkte avlesingen. API-tillatelsen gjør at Homey Cloud ikke støttes. Publish-validering er ikke en App Store-godkjenning.

## Primærkilder

- [Homey app-tillatelser](https://apps.developer.homey.app/the-basics/app/permissions)
- [App-til-app API](https://apps-sdk-v3.developer.homey.app/ApiApp.html)
- [Flow-argumenter og intern tilstand](https://apps.developer.homey.app/the-basics/flow/arguments)
- [Ellers i vanlige Homey-flows](https://support.homey.app/hc/en-us/articles/360015464674-Use-Or-and-Else-in-Flows)
