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

GUI-statusoppdatering bytter ikke ut et åpent utkast. Ekstern konfigurasjonsrevisjon lastes bare når det ikke finnes lokale endringer; en utdatert lagring avvises på serveren.
