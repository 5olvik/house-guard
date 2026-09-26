# Færre Flow-koblinger i 0.4.0

House Guard håndterer hjem/borte, personstatus, gjestemodus, lås og sin egen alarm direkte. Sensorutvalg, forsinkelser og alarmens sone/årsak trenger ingen hjelpeflows eller separat alarmapp. Brukeren velger egne scene-flows i veiviseren.

Et tidligere kontrollert eksempel med to mottakere, to høyttalere og tre varseltyper hadde 34 kort fordelt på 15 uavhengige koblinger i én Advanced Flow. Fjerning av de tre gamle alarmkoblingene sparer **6 kort**: 28 kort og 12 koblinger gjenstår for samme leveringsvalg.

| Tillegg | Koblinger | Kort |
| --- | --- | --- |
| Nattspørsmål til to personer | 2 | 8 |
| Vanlig, kritisk og bildevarsel til to personer | 6 | 12 |
| Tale og alarmlyd på to høyttalere | 4 | 8 |
| Sensorer og alarmhendelser | 0 | 0 |

Ingen av utgangskoblingene trengs når den tilhørende funksjonen ikke er valgt. Vanlige flows kan brukes; Advanced Flow er bare en måte å samle dem på. En Flow kan levere flere meldinger av samme type fra forskjellige rutiner.

Neste mulige reduksjon er mottakergrupper. Det krever at mottakere, feil og spørsmålssvar fortsatt knyttes riktig. Direkte bruk av mobil- og Sonos-kort ble avvist med appens nåværende tillatelser. Appen skal ikke be sluttbrukeren lime inn en eiertoken.

Se [integrasjoner](INTEGRATIONS.md) og [egen alarm](NATIVE-ALARM.md) for oppsett og begrensninger. Ingen utløst Flow regnes som bevis på mottatt varsel eller hørbar lyd.
