# Alarmoppsett

House Guard 0.4.8 har egen alarmmotor og seks underfaner under Alarm:

- **Oversikt:** alarmstatus, manuell betjening og automatisk tilkobling/frakobling.
- **Sensorer:** sensorer for borte og natt, samt inn- og utgangsforsinkelse.
- **Varsler:** vanlig eller kritisk push, kamera, tidslinje og testvarsler.
- **Lyd og lys:** Sonos-lyd/tale og lys som skal slås på ved alarmhendelser.
- **Lås og port:** direkte styring og sikkerhetsvalg for dørlås og garasjeport.
- **Avansert:** ekstra alarmhandlinger og gjestevalg.

Endringer lagres automatisk.

## Automatisk alarm

Under **Oversikt → Automatisk tilkobling og frakobling** velges bortealarm når alle valgte personer er borte, skallsikring ved nattmodus, og frakobling ved første hjemkomst til et tomt hus, første oppvåkning eller morgenmodus. Disse valgene gjelder også når tilhørende rutine er deaktivert eller fjernet. Hjemkomst mens andre allerede er hjemme frakobler ikke nattalarmen.

Personene velges under Personer. Skallsikring bruker sensorer merket Natt. Bekreftelsestiden for borte/hjemkomst gjelder også ekstra rutinehandlinger; alarmens inn-/utgangsforsinkelse velges separat under Sensorer. Endrede automatikkvalg gjelder neste hendelse og endrer ikke alarmmodus umiddelbart.

Ved oppgradering bevares tidligere deaktiverte alarmhendelser. Eldre enkle varsel-, lyd- og lyshandlinger flyttes til alarmoppsettet. Avanserte handlinger med egne avhengigheter, forsinkelser eller vilkår beholdes under Avansert.

## Push og kamera

Velg **Motta pushvarsler** per mottaker under Personer. Under **Alarm → Varsler → Når alarmen utløses** velges kritisk push og eventuelt kamera. Kritisk push og bilde sendes som to separate varsler når begge er valgt. Kritiske varsler må være tillatt for Homey på telefonen. En valgfri tidslinjekopi erstatter ikke push.

Legg inn en [API-nøkkel](API-KEY.md) under Mer → Direkte forbindelse. Testknappene under Varsler sender faste testmeldinger til valgte mottakere uten å utløse alarmen. Kontroller faktisk mottak og bilde på telefonen; et akseptert Homey-kall bekrefter ikke telefonmottak.

## Sensorer og prøving

En kjent aktiv sensor ved tilkobling holdes midlertidig utenfor, mens øvrige sensorer overvåkes. House Guard sender vanlig push om dette til valgte mottakere. Sensoren tas automatisk med når den blir inaktiv. Ukjente eller utilgjengelige sensorer hindrer tilkobling.

Observasjonsmodus sender ikke varsler eller fysiske kommandoer. Prøv først sensoroppsettet i observasjon og test deretter fysisk levering og alarmforløpet under oppsyn. Se [teststatus og begrensninger](TEST-REPORT.md).
