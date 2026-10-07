# Brann og vann

Brann og vann har eget oppsett i House Guard. Valgte sensorer overvåkes hele døgnet, uavhengig av hjem/borte, nattmodus, gjestemodus og innbruddsalarm. House Guard gir varsler og valgte handlinger i tillegg til røykvarslernes egen alarm.

## Sett opp overvåkingen

1. Åpne **Brann og vann → Sensorer**. Velg røyk-/brannvarslere og vannsensorer. Kompatible alarmfunksjoner finnes automatisk, også når en ny vannsensor ennå ikke har rapportert vannalarmverdi.
2. Velg mottakere under **Personer → Motta pushvarsler**. Disse mottar også brann- og vannvarsler, uansett hjemme- og sovestatus.
3. Åpne **Brann og vann → Varsler og handlinger**. Brann og vann har hvert sitt oppsett. Velg vanlig eller kritisk push, tidslinje og eventuelle kamerabilder. Direkte push, kamera, Sonos og start av Flows bruker API-nøkkelen under Innstillinger.
4. Velg eventuelle ekstra tiltak: Sonos-beskjed eller alarmlyd, lys som skal slås på, og en vanlig eller Advanced Flow som kan startes direkte.
5. Når grunnoppsettet i House Guard er fullført, slå på **Overvåk valgte brann- og vannsensorer** under Oversikt.

Endringene lagres automatisk. Overvåkingen er av i eksisterende oppsett til sensorer er valgt og funksjonen slås på. Se over eventuelle gamle brann- og vannflows før du aktiverer de samme handlingene i House Guard; appen endrer eller sletter ikke disse.

Fra 0.4.39 vises hver brannvarsler én gang i sensorlisten, selv om den har både røyk-, varme- og brannalarm. Når du krysser av enheten, velges alle alarmtypene. Tidligere delvise valg beholdes og vises med en strek i krysset; kryss av enheten for å velge alle. Samlet status viser en aktiv alarm fra alle typene og opplyser om ukjent eller utilgjengelig status.

## Meldinger, kamera og gjentakelse

Alarmmeldingen inneholder sensor og rom. Velg kritisk push dersom alarmen skal sendes som kritisk varsel; Homey må også ha tillatelse til kritiske varsler på telefonen. Tidslinjen er et eget valg og erstatter ikke push til telefonen.

Du kan velge inntil tre kameraer per alarmtype. Ett bildevarsel per kamera sendes til hver mottaker etter tekstvarselet. Et tregt kamera blokkerer ikke neste alarmmelding eller vannstyringen.

Gjentatte varsler er valgfrie. De krever en fortsatt aktiv sensor med fersk status og stopper når noen kvitterer i House Guard. Kamerabilder gjentas bare dersom dette er valgt. Sonos, lys, vannstyring, døropplåsing og valgte Flows kjøres én gang ved starten av en hendelse.

Flere sensorer som melder samme alarmtype samles i én hendelse. En ny sensor eller et nytt rom kan gi et samlet tilleggsvarsel. Alarmen opphører i House Guard når alle sensorene som utløste hendelsen har rapportert at sensoralarmen er avsluttet. Du kan velge vanlig push ved dette opphøret.

## Vannstyring og dørlås

Vannstyring er et eget valg under vannhendelsen. Velg enheten og bekreft at **AV** på akkurat denne enheten stenger vannet, før den automatiske AV-handlingen kan aktiveres. En bryter kan bekrefte elektrisk AV i Homey; uten en egen ventilstatus kan House Guard ikke bekrefte fysisk lukket ventil. Appen åpner aldri vannet automatisk når sensoralarmen opphører.

Opplåsing ved brann er et eget valg under brannhendelsen. Det bruker ytterdørlåsen valgt under **Alarm → Lås og port**. Sensorens testmodus alene utløser ikke opplåsing eller andre brannhandlinger. Faktisk røyk-/brannalarm behandles også dersom varsleren samtidig rapporterer testmodus.

## Status og kvittering

Oversikten viser aktive hendelser, sensorer, rom og resultat for varsler/handlinger. En aktiv hendelse vises også på Hjem. **Jeg har sett varselet** kvitterer gjentatte House Guard-varsler; knappen avstiller ikke fysiske røykvarslere og fjerner ikke en fortsatt aktiv sensoralarm.

Temperatur og batteri vises separat fra alarmstatus. «Ingen vannalarm rapportert ennå» brukes for en sensor med manglende første vannalarmverdi. Det er ingen automatisk feilalarm eller bekreftet tørr-status. Ukjent eller utilgjengelig sensor avslutter ikke en allerede registrert alarm.

Etter omstart beholdes aktive hendelser til fersk sensorstatus foreligger. Tidligere fysisk styring gjentas ikke. Hvis et tekstvarsel beviselig aldri ble sendt, kan det sendes etter at en fortsatt aktiv alarm og API-forbindelsen er bekreftet. Akseptert eller mulig sendt varsel gjentas ikke automatisk uten valgt alarmgjentakelse, bortsett fra en enkelt bekreftelse av fortsatt aktiv hendelse ved omstart etter minst to minutter.

## Kontroll av vannsensorer

Under **Sensorer → Vannlekkasje → Kontroll av vannsensorer** kan House Guard følge rapporteringen fra de valgte vannsensorene. Dette erstatter behovet for et eget 24-timers HomeyScript og en daglig hjelpeflow. Kontrollen er på som standard når Brann og vann tas i bruk med valgte vannsensorer. Grensen er **24 timer** og kan endres. Appen kontrollerer hvert femte minutt.

Appen bruker den ferskeste rapporterte temperaturen, RSSI, batterispenningen eller batteriprosenten. Reelle sanntidshendelser og alarmrapporter kan også bekrefte rapportering. Å lese samme gamle verdi, abonnere på sensoren på nytt eller starte appen på nytt fornyer ikke måleoppdateringen. Nye sensorer uten første måledata får hele den valgte fristen før kontrollvarselet kommer.

Gamle eller manglende måleoppdateringer gir et samlet **kontrollvarsel**, separat fra lekkasjealarm. Det utløser ingen vannstenging, opplåsing, lys, Sonos, kamerabilder eller alarm-Flows. Vanlig push til valgte mottakere og tidslinje er standard; kritisk push og push når rapportering gjenopptas er egne valg her. Ukvittert kontrollvarsel gjentas høyst daglig som standard, og kvittering stopper gjentakelsen. Behovet vises fortsatt til rapporteringen gjenopptas. Varsel- og måletilstand beholdes ved omstart.

En gammel temperatur eller batteriverdi er en indikasjon på manglende måleoppdateringer, ikke bevis for tomt batteri, tørt gulv eller at sensoren er offline. Se også sensorens tilgjengelighet og siste rapport. API-frakobling og gamle avlesninger gir ingen ny falsk sensorfeil.

Har du allerede et 24-timers script, la det gamle oppsettet stå til appens kontroll er testet. Deaktiver deretter Flowen som kjører scriptet for å unngå doble kontrollvarsler. Appen kjører, endrer eller deaktiverer ikke eksisterende HomeyScripts eller Flows.

## Egne avanserte Flows og testing

House Guard tilbyr kort for når brann-/vannalarm starter, når sensorene slutter å melde alarm, en betingelse for aktiv alarm og en handling for kvittering. Velg brann eller vann i kortet. Startkortet kjører én gang per hendelse, ikke ved gjentatte pushvarsler.

Knappene **Test vanlig push**, **Test kritisk push** og **Test kamerabilder** sender kun de valgte testvarslene. De utløser ingen sensoralarm eller enhets-/Flow-handling. Kritisk test kan gi lyd på telefonen. Testene bekrefter at Homey aksepterer varslet; selve mottaket og bildet må kontrolleres på telefonen.

Temperaturmåling alene regnes ikke som brannalarm. Eksisterende temperaturflows beholdes som eget oppsett. Nye vann-/brannsensorer og valgte fysiske tiltak må prøves som en avtalt del av kontrollen på Homey; kode- og demotest er ikke en fysisk funksjonstest.
