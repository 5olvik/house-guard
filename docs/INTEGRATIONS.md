# Integrasjoner i House Guard 0.3.0

Grunnoppsettet kan fullføres uten hjelpeflows. Velg personer og lys med **Hjem → Åpne veiviseren**, og legg til ønskede integrasjoner etterpå.

| Funksjon | Løsning | Ekstra Flow |
| --- | --- | --- |
| Hjem/borte og personstatus | Direkte avlesing og rutinemotor | Ingen |
| Lys | Direkte av/på eller valgfrie scener | Ingen for direkte styring |
| Gjestemodus | Appbryter og egen Homey-enhet | Ingen |
| Dørlås, inkludert Yale | Valgt enhets låsestatus og kommandoer | Ingen |
| Soneaktivitet og temperatur | Direkte Homey-avlesing med tidsstempel | Ingen |
| Heimdall-modus og alarmstatus | Direkte panelavlesing og tilstandsbekreftelse | Ingen |
| Grunnleggende Heimdall-hendelser | App-til-app-abonnement | Ingen |
| Heimdall-detaljer | Spesifikke kort for sone/årsak, inngangsforsinkelse og sensoradvarsel | Opptil tre valgfrie koblinger à to kort |
| Mobilvarsler | House Guard-trigger og Homeys mobilkort | To kort per person og varseltype/kamera |
| Tale og alarmlyd | Navnevalg og Sonos-kort med Melding/Volum | To kort per høyttaler og funksjon/lyd |
| Nattspørsmål | Trigger, mobilbetingelse, ja og nei med Dette spørsmålet | Fire kort per mottaker, inkludert Ellers |
| Port | Separat status, kommando, temperatur og sikkerhetsvalg | Ingen for styringen; bildevarsel kobles separat |

## Eksempel: vanlig varsel

1. **Når:** House Guard → Et varsel er klart for → velg person.
2. **Så:** Mobil → Send pushvarsel → velg samme person og taggen **Melding**.

## Eksempel: nattspørsmål

1. **Når:** House Guard → Et nattspørsmål er klart for → velg person.
2. **Og:** Mobil → Send et ja/nei-spørsmål → velg samme person og taggen **Melding**.
3. **Så:** House Guard → Registrer svar på nattspørsmålet → velg Ja og taggen **Dette spørsmålet**.
4. **Ellers:** Samme svarkort, men velg Nei og samme tagg.

Bruk taggene fra det samme Når-kortet. Ikke lag et ekstra mobilspørsmål i en egen Flow. Appen knytter svaret til personen, spørsmålet og fristen; gamle svar ignoreres. Et uteblitt svar blir ikke et ja.

Alle oppskrifter for de valgte tilleggene finnes under **Mer → Koblinger**. Vanlige flows kan brukes; Advanced Flow er valgfritt. Unngå ekstra betingelser og forsinkelser i disse koblingene. Lagre oppsettet og velg **Kontroller integrasjonsflows** etter endringer.

## Hva som kontrolleres

Oppsettskontrollen leser sammenhengende kort, mottakere, mål og tagger. Ikke valgte tillegg vises som «Ikke valgt». Ingen prøvemeldinger eller fysiske kommandoer sendes av kontrollen.

En korrekt Flow beviser ikke faktisk mottak eller hørbar lyd. Enkle utgangskoblinger har **ingen automatisk reservepush eller eksplisitt leveringskvittering**. Test valgt varseltype og hver høyttaler separat. Mobilkortets feil og tidsavbrudd må prøves på telefonene.

## Direkte Heimdall

Appen abonnerer på grunnleggende hendelser fra Heimdall 2.x. Forbindelse til 2.11.0 er kontrollert i utvikling. Abonnementet stopper når Heimdall er utilgjengelig eller ikke lenger valgt; eldre timere gjenspilles ikke ved oppstart.

Detaljerte Flow-koblinger kan legge til sone, årsak og sensoradvarsel. En slik kobling brukes fremfor å starte samme hendelsestype på nytt fra det direkte abonnementet. Fysisk alarmtest og sanntidsmottak må fortsatt kontrolleres i hvert oppsett.

## Homeys tillatelser

En ufarlig prøve fra den installerte appen avviste kjøring av handlings- og betingelseskort med «Missing Scopes». Derfor kan mobilkort og Sonos-kort ikke kjøres direkte gjennom det aktuelle Flow-API-et med appens tillatelser. Sluttbrukeren skal ikke opprette eller lime inn en eiertoken.

Homey Pro og API-tillatelsen er nødvendig for den direkte avlesingen. App-til-app-kommunikasjon og API-tillatelsen gjør at Homey Cloud ikke støttes. Publish-validering er ikke en App Store-godkjenning.

## Primærkilder

- [Homey app-tillatelser](https://apps.developer.homey.app/the-basics/app/permissions)
- [App-til-app API](https://apps-sdk-v3.developer.homey.app/ApiApp.html)
- [Flow-argumenter og intern tilstand](https://apps.developer.homey.app/the-basics/flow/arguments)
- [Ellers i vanlige Homey-flows](https://support.homey.app/hc/en-us/articles/360015464674-Use-Or-and-Else-in-Flows)
