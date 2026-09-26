# Færre koblinger i House Guard

Gjennomgått 26. september 2026 for versjon 0.3.2. Kartleggingen bygger på appens leveringskode og en eksisterende installasjon. Ingen alarm, melding, lyd eller scene ble startet i gjennomgangen.

## Det som allerede er forenklet

Hjem/borte, personstatus, gjestemodus, lås og grunnleggende Heimdall-status håndteres direkte. Brukeren velger sine egne scene-flows i veiviseren. Flere rutiner kan bruke den samme meldings- eller lydkoblingen; man trenger ikke en ny kobling for hver melding.

I det undersøkte oppsettet er appens valgfrie integrasjoner samlet i én Advanced Flow med 15 uavhengige koblinger og 34 kort. Det samme kunne vært fordelt på vanlige flows. Å samle kort på ett lerret reduserer ikke antallet koblinger som må settes opp.

| Funksjon i dette oppsettet | Koblinger | Kort | Vurdering |
| --- | ---: | ---: | --- |
| Vanlig, kritisk og bildevarsel til to personer | 6 | 12 | Behold ulike typer og mottakere. Samme kobling brukes av flere rutiner. |
| Ja/nei-spørsmål til to personer | 2 | 8 | Behold begge svarveier og koblingen til person og spørsmål. |
| Tale og én alarmlyd på to høyttalere | 4 | 8 | Behold separate høyttalere og funksjoner; tekst og volum varierer mellom rutiner. |
| Sone/årsak, inngangsforsinkelse og sensoradvarsel fra Heimdall | 3 | 6 | Valgfrie detaljkoblinger. Kan først fjernes uten tap når detaljene kan hentes direkte. |
| **Totalt** | **15** | **34** | Ingen overflødig kobling funnet med dagens valgte funksjoner. |

## Konkrete muligheter

1. **Felles mottakergruppe for varsler:** En ny gruppetrigger kan starte to mobilkort i samme kobling. For to personer og tre varseltyper blir det 9 kort i stedet for 12. Hele eksempelet kan dermed gå fra 34 til 31 kort. Dette er et utviklingsforslag; gruppematching, dekning og vern mot dobbel sending må implementeres og testes først. Det fjerner ikke behovet for et mobilkort per mottaker.
2. **Detaljer direkte fra Heimdall:** Kan potensielt fjerne ytterligere 6 kort. Appens nåværende direkte abonnement gir grunnleggende status, men erstatter ikke sone-/årsaksteksten i detaljkoblingene. En dokumentert datakilde og test mot faktiske hendelser er nødvendig. Homeys [app-til-app API](https://apps.developer.homey.app/advanced/web-api#accessing-the-web-api-of-another-app) støtter kommunikasjonen, men garanterer ikke hvilke data Heimdall eksponerer.
3. **Færre valgte tillegg:** Ett spørsmålsmottak sparer 4 kort, og én høyttaler uten tale og alarmlyd sparer 4 kort. Å fjerne alle tre Heimdall-detaljkoblingene sparer 6 kort, men mister detaljene. Dette er funksjonsendringer, ikke en opprydding med samme resultat.

Anbefalt neste utvikling er mottakergrupper for varsler, mens full direkte Heimdall-detaljtilgang undersøkes. Ingen av forslagene ovenfor er aktivert i 0.3.2. Eksisterende integrasjoner er beholdt.

Appens tidligere tilgangsprøve mot direkte kjøring av handlings- og betingelseskort ble avvist med «Missing Scopes». At et utviklerverktøy med eiertilgang kan gjøre det, er ikke tilstrekkelig for en vanlig App Store-installasjon. Oppsettet skal ikke kreve at brukeren limer inn en eiertoken.

Eksisterende scene- og husstyringsflows må vurderes separat før aktiv styring tas i bruk. En Flow valgt i veiviseren kan fortsatt være nødvendig som scene og skal ikke slettes som en antatt gammel hjelpeflow.
