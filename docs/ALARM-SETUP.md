# Alarmoppsett

House Guard har egen alarmmotor og seks underfaner under Alarm:

- **Oversikt:** alarmstatus, manuell betjening og automatisk tilkobling/frakobling.
- **Sensorer:** sensorer for borte og natt, samt inn- og utgangsforsinkelse.
- **Varsler:** vanlig eller kritisk push, kamera, tidslinje og testvarsler.
- **Lyd og lys:** Sonos-lyd/tale og lys som skal slås på ved alarmhendelser.
- **Lås og port:** direkte styring og sikkerhetsvalg for dørlås og garasjeport.
- **Avansert:** ekstra alarmhandlinger og gjestevalg.

Endringer lagres automatisk.

Lyslisten følger enhetstypen du har valgt i Homey. Fra 0.4.9 vises også dimmere og stikkontakter som er satt til lys. Velg lys under **Lyd og lys → Når alarmen utløses → Legg til lys** og angi eventuelt når lyset skal slås på.

**Mer** samler grunnoppsett, direkte forbindelse, drift/testing, systemstatus, sikkerhetskopi og hendelseslogg i sammenleggbare seksjoner. Hjem viser en snarvei til Systemstatus når noe trenger oppfølging. Veiviseren vises bare på Hjem til grunnoppsettet er fullført, og kan alltid åpnes igjen under Mer.

## Automatisk alarm

Under **Oversikt → Automatisk tilkobling og frakobling** velges bortealarm når alle valgte personer er borte, skallsikring ved nattmodus, og frakobling ved første hjemkomst til et tomt hus, første oppvåkning eller morgenmodus. Disse valgene gjelder også når tilhørende rutine er deaktivert eller fjernet. Hjemkomst mens andre allerede er hjemme frakobler ikke nattalarmen.

Personene velges under Personer. Skallsikring bruker sensorer merket Natt. Bekreftelsestiden for borte/hjemkomst gjelder også ekstra rutinehandlinger; alarmens inn-/utgangsforsinkelse velges separat under Sensorer. Endrede automatikkvalg gjelder neste hendelse og endrer ikke alarmmodus umiddelbart.

Ved oppgradering bevares tidligere deaktiverte alarmhendelser. Eldre enkle varsel-, lyd- og lyshandlinger flyttes til alarmoppsettet. Avanserte handlinger med egne avhengigheter, forsinkelser eller vilkår beholdes under Avansert.

## Push og kamera

Velg **Motta pushvarsler** per mottaker under Personer. Under **Alarm → Varsler → Når alarmen utløses** velges kritisk push og opptil tre kameraer med **Legg til kamera**. Pushmeldingen forsøkes først, deretter sendes ett bildevarsel per kamera til hver valgt mottaker. Kameranavn og utløsende sensor (når tilgjengelig) står i bildevarselet. En kamerafeil stopper ikke øvrige bilder. Kritiske varsler må være tillatt for Homey på telefonen. En valgfri tidslinjekopi erstatter ikke push.

Kamerabilder gjentas ikke automatisk mens alarmen går. Slå eventuelt på **Send bilder også ved gjentatt alarm**. Eksisterende tekst-, lyd- og lysvalg beholdes. Et eldre enkeltkameravalg blir automatisk første kamera i listen. Hver alarmhendelse kan ha egne kameraer; obligatorisk varsel om forbikoblede sensorer er fortsatt ett vanlig tekstvarsel.

**Test kameravarsler** tester kameraene under «Når alarmen utløses». Før sending vises kameraer × mottakere og samlet antall varsler. Resultatet viser akseptert eller feil/ukjent utfall per kamera; det bekrefter ikke telefonmottak. En test kan ikke gjentas før etter ett minutt.

Legg inn en [API-nøkkel](API-KEY.md) under Mer → Direkte forbindelse. Testknappene under Varsler sender faste testmeldinger til valgte mottakere uten å utløse alarmen. Kontroller faktisk mottak og bilde på telefonen; et akseptert Homey-kall bekrefter ikke telefonmottak.

## Sensorer og prøving

En kjent aktiv sensor ved tilkobling holdes midlertidig utenfor, mens øvrige sensorer overvåkes. House Guard sender vanlig push om dette til valgte mottakere. Sensoren tas automatisk med når den blir inaktiv. Ukjente eller utilgjengelige sensorer hindrer tilkobling.

Observasjonsmodus sender ikke varsler eller fysiske kommandoer. Prøv først sensoroppsettet i observasjon og test deretter fysisk levering og alarmforløpet under oppsyn. Se [teststatus og begrensninger](TEST-REPORT.md).
