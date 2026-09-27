# Alarmen i House Guard

House Guard har sin egen alarmmotor. Heimdall-integrasjonen, app-til-app-tillatelsen og kortene for innrapportering av eksterne alarmhendelser er fjernet. Ingen Heimdall-kode er kopiert.

## Oppsett

1. Åpne **Sikkerhet** og slå på **Bruk House Guard-alarm**.
2. Velg sensorer for **Borte** og **Natt**. Bare dør/vindu (`alarm_contact`) og bevegelse (`alarm_motion`) støttes. Velg eksempelvis skallsensorer for natt; unngå bevegelsessensorer i rom som brukes om natten.
3. Merk inngangssensorer som **Forsinket**. Andre sensorer utløser alarm umiddelbart. Angi inn- og utgangsforsinkelse (0–240 sekunder).
4. Velg reaksjoner under **Rutiner → Utløst alarm**. Sensorens navn, sone og årsak følger alarmen. Mobilvarsler og Sonos trenger fortsatt sine egne leveringskoblinger under **Mer → Koblinger**.
5. Legg til **Homey → Legg til enhet → House Guard → Alarmpanel** for status og avstilling fra en enhet. Gjestemodus er en separat enhet.

Alle valg lagres automatisk. Frakoble alarmen før sensorutvalg, forsinkelser eller observasjonsmodus endres. En modus må ha minst én valgt sensor før den kan kobles til.

## Prøv i observasjon

Behold observasjon på. Sørg for at sensorene er tilgjengelige og rolige. Koble til Borte eller Natt fra Alarm i appen. Vent ut eventuell utgangsforsinkelse, og bruk **Prøv sensor i observasjon** eller utløs en valgt fysisk sensor. Kontroller status, sone/årsak og logg. Frakoble og kontroller at gjentakelse og ventende forsinkelseshandlinger stopper.

Observasjon endrer intern testtilstand, men sender ikke mobilvarsler, lyd, låskommandoer eller andre eksterne handlinger. En vellykket observasjonsprøve bekrefter derfor ikke fysisk levering. Frakoble før observasjon slås av, og prøv deretter ønskede reaksjoner kontrollert.

## Tilstand og avbrudd

- Ukjente/utilgjengelige sensorer hindrer tilkobling. Aktive sensorer holdes midlertidig utenfor mens resten av alarmen kobles til.
- Sensorer som fortsatt er aktive etter utgangsforsinkelsen listes på forsiden og i pushvarsel til valgte mottakere. Når en sensor bekreftes inaktiv, overvåkes den automatisk igjen. Denne listen bevares ved omstart. Push krever fungerende mobilkoblinger.
- Å lukke en dør etter innpassering stopper ikke inngangsforsinkelsen. Frakobling stopper den.
- Avstilling stopper alarmgjentakelse og ventende inngangs-/tilkoblingshandlinger. Allerede sendte eksterne kommandoer kan ikke trekkes tilbake.
- Ved omstart beholdes tilkoblet modus, aktiv alarm og utløst inngangsforsinkelse. Uferdig utgangsforsinkelse avbrytes og må startes på nytt. Avlesing må være tilkoblet før forsinkelser fullføres.
- Sensorfeil under tilkoblet alarm vises som feil, ikke som en klar sensor. De utløser ikke automatisk innbruddsalarm.
- Sletting av panelenheten sletter ikke sensoroppsettet og frakobler ikke alarmen. Innstillingene kan fortsatt brukes.

## Overgang fra eldre alarmoppsett

Oppgraderingen erstatter et tidligere eksternt alarmvalg med House Guard, setter appen i observasjon og krever nytt sensorvalg. Gamle alarmkjøringer og alarmtilstand tas ikke med. Personer, rutiner, gjestestatus og øvrige enhetsvalg beholdes. Sensorer velges ikke ut fra like navn.

De gamle alarmkortene `integration_event`, `report_alarm_details`, `report_entry_delay` og `report_sensor_warning` finnes ikke i 0.4.0. Fjern koblinger til disse før oppgradering; ellers kan den berørte Flowen bli markert med feil. Behold mobil-, spørsmål- og Sonos-grenene. Separate gamle alarmapper og andre personlige flows avinstalleres eller endres ikke automatisk. De må gjennomgås før House Guard settes i aktiv drift.

## Avgrensning

Dette er en testversjon for Homey Pro. PIN/RFID, sabotasjealarm, batterivarsler, vedlikeholdsmodus er ikke implementert. Alarmen er avhengig av Homey, sensorenes rapportering og eventuelle eksterne leveringsflows. Full test med faktiske sensorer og mottakere gjenstår.
