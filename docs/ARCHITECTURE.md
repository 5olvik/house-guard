# Arkitektur

`app.js` er SDK-livssyklusen. `lib/homey-adapter.js` er eneste eksterne sideeffektgrense. `lib/policy.js` har rene beslutninger med klokke som input. `lib/config.js` validerer versjonert oppsett. `lib/plans.js` bygger sikkerhetshandlingene. `lib/engine.js` koordinerer tilstand, spørsmål, frister, kjøringer og resultater. `lib/log.js` begrenser historikken til 300 hendelser. GUI-et bruker kun `api.js` gjennom Homey-broen.

## Kjøringer og frister

En kjøring har stabil unik ID, konfigurasjonsgenerasjon, kontekst, starttid og frist. Handlinger har egen ID og tilstand. Forsinkelse er relativ til rutinens frist, ikke til slutten av forrige handling. I sekvens venter en handling i tillegg på tidligere tilstandsbekreftelse; parallell utførelse starter uavhengige modne handlinger samtidig. En uttrykkelig avhengighet kan kreve `confirmed` før videreføring. Observasjon behandler simulert avhengighet som observert, ikke fysisk bekreftet.

Ved avreise skapes én rutine når alle valgte går fra ikke-alle-borte til eksplisitt alle-borte. Hver handling får en fersk API-avlesing. Hendelsesbaserte avbrudd og en ny generasjonskontroll umiddelbart før adapterens sending hindrer utdaterte ventende kommandoer. En fysisk kommando som allerede er sendt kan ikke trekkes tilbake.

Ingen handling får automatisk retry. For set-kommandoer med timeout forsøkes tilstandsavlesning, ikke ny sending. Puls, varsel, Flow og tale har aldri blind retry. Bekreftelse av ventende enhetshandlinger avstemmes tidligst hvert femte sekund, og alltid ved frist. Ordinær avstemming er hvert 30. sekund og gjelder valgte mål. Enhetskatalogen oppdateres hvert femte minutt. Capability-hendelser og brukerhendelser utløser en kort sammenslått oppdatering.

## Lagring og restart

Oppsett: `husmodus.config.v1`. Runtime: `husmodus.runtime.v1`. Ingen gamle Power Guard-nøkler leses. Eksport inneholder oppsett, ikke autentisering. GUI-lagring har revisjonskontroll for samtidige vinduer. Import valideres og settes i observasjon.

Runtime lagrer gjestestatus, nattspørsmål, hopp-over-frist, alarmkontekst, morgendeduplisering og rutineresultater. Før sending lagres `sent`, slik at en omstart aldri behandler en mulig sendt puls som usendt. Etter restart leses faktisk tilstand. Bare en helt usendt borterutine fra samme konfigurasjonsrevisjon kan rekonstrueres. Gamle ankomster/opplåsinger fjernes. Aktiv alarm må leses tilbake før gjentakelse. Personstatus og enhetsstatus lagres ikke som en troverdig fysisk sannhet.

Tidssone hentes fra Homey. Nattvindu fungerer over midnatt. Neste morgen beregnes i faktisk tid for å håndtere manglende eller gjentatte DST-minutter. En manglende lokal tid om våren flyttes til første gyldige minutt etter spranget. En planlagt morgen kjøres ikke retrospektivt etter en lang nedetid. Første oppvåkning er en egen rutine som ikke skriver andre personers status. Identiske set-kommandoer på tvers av samtidige rutiner venter på den allerede pågående bekreftelsen.

## Observasjon og GUI

Observasjon beregner og skriver kun appens egen historikk/runtime. Både motor og adapter blokkerer eksterne sideeffekter. Den utfører ikke Flow-start, push, spørsmål, tale, tidslinjemelding, sovestatus eller enhetsverdi. Det er tillatt å endre appens eget oppsett/gjesteflagg i observasjon.

Alle eksterne navn og feilmeldinger gjengis med tekstnoder. Ingen enheter erstattes med samme navn. GUI følger Power Guards lyse CSS-tokens og mørke header. Det bruker ingen antatt Homey-mørkemodusdeteksjon; faktisk Homey-klientrendering er et gjenstående live-sjekkpunkt.

`settings/autosave.js` samler tekstendringer med 350 ms skrivepause og serialiserer validering og lagring. Brytere og lister sendes umiddelbart. Nye endringer under en forespørsel beholdes og sendes med revisjonen fra forrige svar. Et mistet svar avstemmes mot lagret oppsett før ny sending. Konfigurasjonskonflikter stopper køen og vises som feil; de overskrives ikke automatisk.

GUI-statusoppdatering erstatter ikke lokale endringer som venter på lagring. Ekstern konfigurasjonsrevisjon lastes bare når det ikke finnes slike endringer; en utdatert lagring avvises på serveren. Veiviseren oppdaterer bare det valget som ble endret og beholder valgt observasjonsmodus. Import lagres automatisk i observasjon etter validering.

## Egen alarmmotor

`lib/intrusion.js` håndterer frakoblet, natt, borte, inn-/utgangsforsinkelse, sensorfeil og lagret alarmkontekst. Ingen tredjeparts alarmkode inngår. Bare den interne alarmen kan velges i oppsettet. Capability-hendelser køes slik at korte sensorutslag ikke forsvinner i sammenslåtte avlesinger; gamle hendelser forkastes ved ny revisjon eller gjenoppkobling. Forsinkelser avstemmes hvert sekund med fersk avlesing. Ukjente sensorer blokkerer tilkobling.

Tilstand lagres under `houseguard.intrusion.v1` og bindes til sensorutvalg, forsinkelser og observasjonsmodus. Omstart bevarer fullført tilkobling og alarmkontekst, men avbryter uferdig utgangsforsinkelse. Avstilling avbryter ventende inngangs- og tilkoblingshandlinger. Et internt panel i adapteren lar de eksisterende rutinene bruke samme motor. `alarmTarget` skiller en pågående tilkobling fra bekreftet frakobling.

Alarmpanelet speiler intern tilstand og sender manuelle kommandoer gjennom appen. Sletting av panelet frakobler ikke motoren. I observasjon kan intern alarmtilstand testes; varsler og andre eksterne handlinger blokkeres.

## Push med tidslinjekopi

Push-varsler beholder mottakerutvalget i `people.notifications` og de tre varseltypene. Feltet `alsoTimeline` på en varselhandling legger til en SDK-tidslinjemelding etter at push-koblingene er utløst. Kopien bruker samme generasjons- og observasjonsvern, sendes én gang og gir ingen retry av push ved feil. Feltet er valgfritt og er av for eldre oppsett. Alarmvarsling konverteres aldri automatisk til tidslinje.

## Ikke utgitt: scene-koblinger og fullført oppsett

`scene-flows.js` kontrollerer koblinger fra appens SDK-trigger til Homeys Flow-startkort. Adapteren leser målstatus og koblinger før sending. Kortet godtar bare én forespørsel for riktig mål/type innen 30 sekunder med fortsatt gyldig autorisasjon. Manglende eller duplisert kobling feiler før sending. Dette erstatter direkte start gjennom appens begrensede API-token. Allerede startet ekstern Flow kan ikke trekkes tilbake.

`setupCompleted` er et validert felt i oppsettet. GUI skjuler først startkortet når lagret oppsett bekrefter true; avbrutt veiviser eller mislykket lagring markerer ikke oppsettet som ferdig i lagret konfigurasjon. Mer har alltid en knapp for å åpne veiviseren.

Manuelle kommandoer fra forsiden bruker `lib/manual-controls.js`, med fersk avlesing, bekreftelse og blokkering av gjentatte portpulser. Åpning/opplåsing krever frakoblet alarm. Kjente aktive sensorer holdes utenfor ved tilkobling til de blir inaktive, og gir et obligatorisk varsel til valgte pushmottakere. Homeys sovestatus endres gjennom `lib/sleep-flows.js` og to-korts koblinger til Homeys tilstedeværelseskort, siden appens token ikke kan skrive sovestatus direkte.
