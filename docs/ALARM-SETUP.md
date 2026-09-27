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

Under **Oversikt → Automatisk tilkobling og frakobling** velges bortealarm når alle valgte personer er borte, skallsikring ved nattmodus, og frakobling ved første hjemkomst til et tomt hus, første oppvåkning eller morgenmodus. Disse valgene gjelder også når tilhørende rutine er deaktivert eller fjernet. Ved nattankomst frakobles alarmen uten hjemkomstforsinkelse når hjemkomstfrakobling og «Sett bare den ankomne våken ved nattankomst» er valgt. Bare den ankomne settes våken. Hjemkomst må registreres i Homey før en alarmsensor utløses. Ventende nattaktivering avbrytes; når alle hjemme senere sover igjen, kan skallsikring aktiveres på nytt.

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

## Automatisk lukking av garasjeport

Under **Alarm → Lås og port → Garasjeport** kan «Tillat automatisk lukking ved tilkoblingsforsinkelse» slås av, for eksempel om vinteren. Fra 0.4.11 bruker portstyringen ingen temperaturmåling eller temperaturgrense. Den krever fortsatt kjent åpen port, kontrollert polaritet/kommando og bekreftet at ingen hjemme sover. Bare én kommando sendes, og portstatus kontrolleres etterpå.

## Morgen og egne Flows

Fast morgentid starter morgenrutinen og setter hjemmeværende i nattutvalget våkne i Homey. Det er en statusendring; lys, musikk eller annen fysisk vekking legges til som handlinger. Frakobling følger valget under Alarm.

En Flow eller Advanced Flow kan starte hele morgenrutinen med **House Guard → Sett modus i House Guard → Morgen** (kan brukes på nytt etter en ny natt samme dag; automatisk morgen kjøres maksimalt én gang per dato). For individuell vekking bruker du Homeys tilstedeværelseskort til å sette én person våken. House Guard kan da frakoble ved første oppvåkning uten å vekke de andre. Slå av fast morgentid hvis egne Flows styrer tidspunktet. Morgenrutinen kan også starte en valgt eksisterende Flow.

## Alarmpanel i Homey

Enheten viser Frakoblet, Nattalarm tilkoblet, Bortealarm tilkoblet, forsinkelser og utløst alarm med sensorårsak. Den har bare **Avstill alarm**, som frakobler og stopper alarmresponsen. Knappen endrer ikke tilstedeværelse eller sovestatus. Natt- og borterutiner styres av House Guard. Den gamle modusvelgeren fjernes automatisk også fra eksisterende paneler; alarmstatus-taggen og utløst-alarm-status beholdes.

## Manuell tilstedeværelse uten GPS

På Hjem finnes **Start bortemodus** og **Sett alle hjemme**. De setter alle brukere i tilstedeværelsesutvalget under Personer til henholdsvis borte eller hjemme i Homey. Brukere utenfor utvalget endres ikke. Dette krever en klar direkte API-forbindelse; ingen hjelpeflows trengs. De vanlige hjemkomst-/borterutinene, alarmvalgene, forsinkelsene og gjesteinnstillingene gjelder. Alarmen armeres ikke på grunnlag av ubekreftet eller delvis oppdatert tilstedeværelse.

Knappene endrer tilstedeværelse, mens Start morgen og natt styrer sovestatus. Automatisk nattankomst kan fortsatt sette ankomne våkne etter valgene dine. En bruker som allerede har ønsket status endres ikke på nytt. Delvis feil vises i grensesnittet og loggen, uten automatisk gjentakelse. GPS kan oppdatere status senere. I observasjon logges bare hva som ville skjedd. Eksisterende Sett modus-Flowkort har uendret oppførsel.

## Morgen ved bevegelse

Åpne **Rutiner → Natt og morgen → Start morgen ved bevegelse**. Velg for eksempel kjøkkensensoren, sett tidsrommet 06:00–12:00 og slå på «Start morgen ved ny bevegelse i tidsrommet». Alt lagres automatisk. Funksjonen er avslått ved oppgradering. Eksisterende rutiner, personutvalg og innstillinger endres ikke.

Huset må være i nattmodus med bekreftet hjemmeværende, og sensoren må gå fra rolig til aktiv innenfor tidsrommet (fra er inkludert, til er ekskludert, i Homeys tidssone). Funksjonen frakobler nattalarmen før den samme bevegelsen vurderes som alarm, og setter alle hjemmeværende i tilstedeværelsesutvalget våkne. Dette gjelder også personer utenfor nattutvalget. Egne handlinger i Morgen-rutinen kjører som før hvis rutinen er aktivert. Den nye funksjonens frakobling og vekking er innebygd og gjelder også når ekstra morgenhandlinger er deaktivert. Vanlig manuell/planlagt morgen beholder de tidligere person- og alarmvalgene.

Det kreves klar direkte API-forbindelse. Gjestevalg gjelder fortsatt. Bortealarm, aktiv alarm, pågående inngangsforsinkelse eller en annen samtidig aktiv nattalarmsensor frakobles ikke av automasjonen. En sensor som allerede står aktiv ved oppstart, ny tilkobling eller starten av tidsrommet gir ikke morgenstart. Kort bevegelsespuls håndteres også når sensoren allerede er rolig ved neste avlesning. Funksjonen starter én gang per nattperiode; nye bevegelser gjentar ikke en feilet vekking. En ny nattperiode gjør den klar igjen. Observasjon logger bare hendelsen.

Fast morgentid er et uavhengig valg. Slå den av selv hvis bare bevegelse skal starte morgen. Ingen innstillinger slås av automatisk.

## Faste og egne rutiner

Faste rutiner kan ikke slettes. Krysset **Ekstra handlinger er aktive** slår bare egne tillegg av eller på, uten å fjerne dem. Innebygde alarm-, lås-, port- og personhandlinger følger fortsatt innstillingene under Alarm, Natt og morgen og Gjestemodus. Tidligere skjulte faste rutiner blir synlige igjen, med lagrede handlinger og avkrysninger bevart. Alarmhendelsenes ekstrahandlinger ligger under Alarm → Avansert.

Velg **+ Egen rutine**, gi rutinen et navn og legg til handlinger. Velg for eksempel et lys og **På/Av**, eller en person og **Våken/Sovende**. **Vilkår og avanserte valg** samler begrensninger, avhengigheter og feilregler. Endringer lagres automatisk. Egne rutiner kan deaktiveres med krysset eller fjernes med **Slett egen rutine**.

Egne rutiner starter med **Start rutine**, eller fra en Homey Flow med House Guard-kortet **Start navngitt rutine**. Vilkår i en handling kontrolleres når rutinen starter; de starter ikke rutinen automatisk. Morgen ved bevegelse konfigureres direkte under Natt og morgen som beskrevet ovenfor.
