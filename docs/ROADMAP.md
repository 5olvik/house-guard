# Videre arbeid

Målet er at nye brukere kan sette opp ønsket husoppførsel uten å forstå interne ID-er, ruting eller tekniske migreringsverktøy.

## Implementert i 0.3.0

- Grunnoppsett med personer og lys uten hjelpeflows.
- Veiviser som lager et gjennomgåbart utkast i observasjon.
- Direkte grunnleggende Heimdall-hendelser og direkte låsstyring.
- Enkle Flow-kort med navnevalg og få tagger.
- Oppsettskontroll av reelle kortforbindelser, mål og tagger.
- Gjestemodus som Homey-enhet.

## Neste arbeid

1. Test oppsettet med nye brukere, inkludert bytte av mottaker og enhet.
2. Gjennomfør visuell kontroll på mobil og i Homeys innstillinger.
3. Gjør alarm, lås, nattspørsmål og valgfrie varsler enklere å sette opp.
4. Test mobilspørsmål, feil og tidsavbrudd på reelle telefoner.
5. Undersøk støttede måter å redusere antall koblinger for store varslings-/lydoppsett.
6. Fullfør engelsk innstillingsside og publiseringsdokumentasjon.

Grunnoppsettet skal fortsatt kunne brukes uten ekstra flows. En full pakke med flere varseltyper, mottakere og høyttalere krever foreløpig flere små koblinger.

Direkte kjøring av mobil-/Sonos-kort med appens nåværende Homey-tillatelser er avvist i en teknisk prøve. Ingen løsning skal kreve en eiertoken fra sluttbrukeren eller fremstille en utløst Flow som bekreftet levering. Lås-/portkontroller, nei-veto, avbrudd og observasjon skal beholdes ved videre forenkling.
