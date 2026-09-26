# Videre arbeid

Målet er at nye brukere kan sette opp ønsket husoppførsel uten å forstå interne ID-er, ruting eller tekniske migreringsverktøy.

## Implementert i 0.4.0

- Veiviser med personvalg og egne Flow-valg for avreise, hjemkomst og natt.
- Automatisk lagring av felt, handlinger og veiviservalg med synlig status og revisjonskontroll.
- Egen alarmmotor, sensorvalg, inn-/utgangsforsinkelse, Homey-alarmpanel og direkte låsstyring.
- Enkle Flow-kort med navnevalg og få tagger.
- Oppsettskontroll av reelle kortforbindelser, mål og tagger.
- Gjestemodus som Homey-enhet.

## Neste arbeid

1. Test oppsettet med nye brukere, inkludert bytte av mottaker og enhet.
2. Gjennomfør visuell kontroll på mobil og i Homeys innstillinger.
3. Test den nye alarmen med virkelige sensorer, strøm-/nettbrudd og avstilling. Vurder sabotasje, sensorhelse og tidsbegrenset forbikobling før neste alarmutvidelse.
4. Test mobilspørsmål, feil og tidsavbrudd på reelle telefoner.
5. Utvikle mottakergrupper for varsler og reduser gjenstående utgangskoblinger, som beskrevet i [Flow-gjennomgangen](FLOW-SIMPLIFICATION.md).
6. Fullfør engelsk innstillingsside og publiseringsdokumentasjon.

Brukeren kan velge egne scene-flows i veiviseren eller legge direkte enhetshandlinger til under Rutiner. En full pakke med flere varseltyper, mottakere og høyttalere krever foreløpig flere små koblinger.

Direkte kjøring av mobil-/Sonos-kort med appens nåværende Homey-tillatelser er avvist i en teknisk prøve. Ingen løsning skal kreve en eiertoken fra sluttbrukeren eller fremstille en utløst Flow som bekreftet levering. Lås-/portkontroller, nei-veto, avbrudd og observasjon skal beholdes ved videre forenkling.
