# Alarmoppsett

House Guard har egen alarmmotor og fire underfaner under Alarm:

- **Oversikt:** alarmstatus, manuell betjening og automatisk tilkobling/frakobling.
- **Sensorer:** sensorer for borte og natt, samt inn- og utgangsforsinkelse.
- **Varsler og handlinger:** ett kort per alarmhendelse med push, kamera, tidslinje, lyd, lys og egne handlinger. Gjentakelse ligger under utløst alarm. Testvarsler ligger nederst.
- **Lås og port:** direkte styring og sikkerhetsvalg for dørlås og garasjeport.

Endringer lagres automatisk. Fra 0.4.22 begynner nye brukere med **Hjem → Start oppsettet**. Veiviseren viser funksjonsvalg, direkte forbindelse, beboere og varselmottakere, og deretter relevante steg for alarm, Flows og natt. Siste steg viser det som mangler og lar deg teste varsler før du tar appen i bruk. Du kan stoppe og gjenoppta oppsettet. Eksisterende innstillinger beholdes når veiviseren åpnes igjen.

Lyslisten følger enhetstypen du har valgt i Homey. Fra 0.4.9 vises også dimmere og stikkontakter som er satt til lys. Velg lys under **Varsler og handlinger → Når alarmen utløses → Lyd og lys → Legg til lys** og angi eventuelt når lyset skal slås på.

**Innstillinger**, tidligere Mer, samler grunnoppsett, API-nøkkel, systemstatus, sikkerhetskopi og hendelseslogg. Hjem viser status for funksjonene du har satt opp; ukonfigurert dør og garasje skjules. Manglende oppsett får en konkret beskjed og snarvei. Veiviseren vises på Hjem til grunnoppsettet er fullført, og kan alltid åpnes igjen under **Innstillinger → Endre grunnoppsett**.

## Automatisk alarm

Under **Oversikt → Når skal alarmen være på?** velges nattalarm ved nattmodus og frakobling ved første hjemkomst til et tomt hus, første oppvåkning eller morgenmodus. Disse valgene gjelder også når tilhørende rutines ekstrahandlinger er slått av. Ved nattankomst frakobles alarmen uten hjemkomstforsinkelse når hjemkomstfrakobling og «Sett bare den som kommer hjem om natten, til våken» er valgt. Bare den ankomne settes våken. Hjemkomst må registreres i Homey før en alarmsensor utløses. Ventende nattaktivering avbrytes; når alle hjemme senere sover igjen, kan nattalarm aktiveres på nytt.

Personene velges under Personer. Skallsikring bruker sensorer merket Natt. Bekreftelsestiden for borte/hjemkomst gjelder også ekstra rutinehandlinger; alarmens inn-/utgangsforsinkelse velges separat under Sensorer. Endrede automatikkvalg gjelder neste hendelse og endrer ikke alarmmodus umiddelbart.

Fra 0.4.23 er full bortealarm en fast regel når House Guard-alarmen er valgt: alle beboere bekreftet borte og gjestemodus av. Det tidligere av/på-valget for bortealarm fjernes. Vanlige forsinkelser gjelder også etter omstart og etter avstilling i et fortsatt tomt hus. Oppstart spiller ikke av gamle rutineekstrahandlinger. Eldre enkle varsel-, lyd- og lyshandlinger flyttes til alarmoppsettet. Avanserte handlinger med egne avhengigheter, forsinkelser eller vilkår beholdes som Egne handlinger under den enkelte alarmhendelsen.

## Push og kamera

Velg **Motta pushvarsler** per mottaker under Personer. Under **Alarm → Varsler og handlinger → Når alarmen utløses** velges kritisk push og opptil tre kameraer med **Legg til kamera**. Pushmeldingen forsøkes først, deretter sendes ett bildevarsel per kamera til hver valgt mottaker. Kameranavn og utløsende sensor (når tilgjengelig) står i bildevarselet. En kamerafeil stopper ikke øvrige bilder. Kritiske varsler må være tillatt for Homey på telefonen. En valgfri tidslinjekopi erstatter ikke push.

Kamerabilder gjentas ikke automatisk mens alarmen går. Slå eventuelt på **Send bilder også ved gjentatt alarm**. Eksisterende tekst-, lyd- og lysvalg beholdes. Et eldre enkeltkameravalg blir automatisk første kamera i listen. Hver alarmhendelse kan ha egne kameraer; obligatorisk varsel om forbikoblede sensorer er fortsatt ett vanlig tekstvarsel.

**Test kameravarsler** tester kameraene under «Når alarmen utløses». Før sending vises kameraer × mottakere og samlet antall varsler. Resultatet viser akseptert eller feil/ukjent utfall per kamera; det bekrefter ikke telefonmottak. En test kan ikke gjentas før etter ett minutt.

Legg inn en [API-nøkkel](API-KEY.md) i veiviseren eller under **Innstillinger → API-nøkkel**. Testknappene i veiviseren og under Varsler og handlinger sender faste testmeldinger til valgte mottakere uten å utløse alarmen. Normal, kritisk og bilde-testpush kan også sendes før grunnoppsettet er fullført. API-, mottaker- og kamerakontrollene gjelder fortsatt. Testen aktiverer ingen rutiner eller annen fysisk styring. Kontroller faktisk mottak og bilde på telefonen; et akseptert Homey-kall bekrefter ikke telefonmottak.

## Sensorer og prøving

En kjent aktiv sensor ved tilkobling holdes midlertidig utenfor, mens øvrige sensorer overvåkes. House Guard sender vanlig push om dette til valgte mottakere. Sensoren tas automatisk med når den blir inaktiv. Ukjente eller utilgjengelige sensorer hindrer tilkobling.

Testmodus og aktiv styring er fjernet som brukervalg. Nytt og importert oppsett venter på fullføring av veiviseren; eldre oppsett som var satt på pause må også fullføres eksplisitt. Sensorprøveknappene er fjernet. Test varsling under Varsler og handlinger og kontroller det fysiske alarmforløpet. Se [teststatus og begrensninger](TEST-REPORT.md).

## Automatisk lukking av garasjeport

Under **Alarm → Lås og port → Garasjeport** kan «Tillat automatisk lukking ved tilkoblingsforsinkelse» slås av, for eksempel om vinteren. Fra 0.4.11 bruker portstyringen ingen temperaturmåling eller temperaturgrense. Den krever fortsatt kjent åpen port, kontrollert polaritet/kommando og bekreftet at ingen hjemme sover. Bare én kommando sendes, og portstatus kontrolleres etterpå.

## Morgen og egne Flows

Under **Rutiner → Aktivering av natt** finner du nattspørsmål, sovestatus og nattens ekstrahandlinger. **Rutiner → Deaktivering av alarm** samler morgenstart, nattankomst og første oppvåkning. Personvalgene og ekstrahandlingene ligger ved den tilhørende hendelsen. Innstillinger for automatisk nattspørsmål vises når funksjonen velges. Bevegelsesmorgen har en egen sammenleggbar del, der sensor og tidsrom velges før funksjonen slås på. De to kortene starter sammenfoldet. Valgene og den eksisterende oppførselen er bevart.

Fast morgentid starter morgenrutinen og setter hjemmeværende i nattutvalget våkne i Homey. Det er en statusendring; lys, musikk eller annen fysisk vekking legges til som handlinger. Frakobling følger valget under Alarm.

**Morgentid** bestemmer også når «Hopp over natt i natt» utløper. Klokkeslettet starter ikke morgenrutinen når **Start morgen til fast tid** er av. Morgen krever alltid at en beboer er hjemme, også ved manuell start eller fra Flow. Dette er en fast regel uten avkrysning. Nattalarm krever at noen er hjemme og bekreftet sovende. Når ingen hjemmeværende lenger sover, avsluttes nattalarm og eventuell ventende nattaktivering. En allerede utløst alarm eller inngangsforsinkelse beholdes til avstilling; ukjente persondata brukes ikke til å frakoble etablert dekning eller koble til full alarm.

En Flow eller Advanced Flow kan starte hele morgenrutinen med **House Guard → Sett modus i House Guard → Morgen** (kan brukes på nytt etter en ny natt samme dag; automatisk morgen kjøres maksimalt én gang per dato). For individuell vekking bruker du Homeys tilstedeværelseskort til å sette én person våken. House Guard kan da frakoble ved første oppvåkning uten å vekke de andre. Slå av fast morgentid hvis egne Flows styrer tidspunktet. Morgenrutinen kan også starte en valgt eksisterende Flow.

## Alarmpanel i Homey

Enheten viser Frakoblet, Nattalarm tilkoblet, Bortealarm tilkoblet, forsinkelser og utløst alarm med sensorårsak. Den har bare **Avstill alarm**, som frakobler og stopper alarmresponsen. Knappen endrer ikke tilstedeværelse eller sovestatus. Natt- og borterutiner styres av House Guard. Den gamle modusvelgeren fjernes automatisk også fra eksisterende paneler; alarmstatus-taggen og utløst-alarm-status beholdes.

## Manuell tilstedeværelse uten GPS

På Hjem finnes **Start bortemodus** og **Sett alle hjemme**. De setter alle brukere i tilstedeværelsesutvalget under Personer til henholdsvis borte eller hjemme i Homey. Brukere utenfor utvalget endres ikke. Dette krever en klar direkte API-forbindelse; ingen hjelpeflows trengs. De vanlige hjemkomst-/borterutinene, alarmvalgene, forsinkelsene og gjestemodus gjelder. Alarmen armeres ikke på grunnlag av ubekreftet eller delvis oppdatert tilstedeværelse.

Knappene endrer tilstedeværelse, mens Start morgen og natt styrer sovestatus. Automatisk nattankomst kan fortsatt sette ankomne våkne etter valgene dine. En bruker som allerede har ønsket status endres ikke på nytt. Delvis feil vises i grensesnittet og loggen, uten automatisk gjentakelse. GPS kan oppdatere status senere. Eksisterende Sett modus-Flowkort har uendret oppførsel.

## Morgen ved bevegelse

Åpne **Rutiner → Deaktivering av alarm → Start morgen ved bevegelse**. Velg for eksempel kjøkkensensoren, sett tidsrommet 06:00–12:00 og slå på «Start morgen ved ny bevegelse i tidsrommet». Alt lagres automatisk. Funksjonen er avslått ved oppgradering. Eksisterende rutiner, personutvalg og innstillinger endres ikke.

Huset må være i nattmodus med bekreftet hjemmeværende, og sensoren må gå fra rolig til aktiv innenfor tidsrommet (fra er inkludert, til er ekskludert, i Homeys tidssone). Funksjonen frakobler nattalarmen før den samme bevegelsen vurderes som alarm, og setter alle hjemmeværende i tilstedeværelsesutvalget våkne. Dette gjelder også personer utenfor nattutvalget. Egne handlinger i Morgen-rutinen kjører som før hvis rutinen er aktivert. Den nye funksjonens frakobling og vekking er innebygd og gjelder også når ekstra morgenhandlinger er deaktivert. Vanlig manuell/planlagt morgen beholder de tidligere person- og alarmvalgene.

Det kreves klar direkte API-forbindelse. Gjestemodus holder huset hjemme og starter ikke bevegelsesmorgen. Bortealarm, aktiv alarm, pågående inngangsforsinkelse eller en annen samtidig aktiv nattalarmsensor frakobles ikke av bevegelsesautomasjonen. En sensor som allerede står aktiv ved oppstart, ny tilkobling eller starten av tidsrommet gir ikke morgenstart. Kort bevegelsespuls håndteres også når sensoren allerede er rolig ved neste avlesning. Funksjonen starter én gang per nattperiode; nye bevegelser gjentar ikke en feilet vekking. En ny nattperiode gjør den klar igjen. Testmodus logger bare hendelsen.

Fast morgentid er et uavhengig valg. Slå den av selv hvis bare bevegelse skal starte morgen. Ingen innstillinger slås av automatisk.

## Faste og egne rutiner

Faste rutiner kan verken endre navn eller slettes. Tidligere endrede standardnavn gjenopprettes; handlingene og avkrysningene beholdes. Krysset **Ekstra handlinger er aktive** slår bare egne tillegg av eller på, uten å fjerne dem. Innebygde alarm-, lås-, port- og personhandlinger følger fortsatt sine innstillinger. Fra 0.4.24 har hver funksjon fast plass uansett hvor mange handlinger den har. Velkomstlys samler dørkontakt, lysmåler, vilkår og handlinger i ett kort. Natt/morgen har sine handlinger ved oppsettet for den enkelte hendelsen. Gjestemodus på/av ligger samlet under Gjestemodus. Borte og hjemkomst er faste kort med direkte lenker til relevante alarm- og låsevalg. Alarmhendelsenes ekstrahandlinger ligger i samme hendelse som push, kamera, lyd og lys under **Alarm → Varsler og handlinger → [hendelse] → Egne handlinger**. Omorganiseringen endrer ingen lagrede handlinger eller innstillinger.

Velg **+ Egen rutine**, gi rutinen et navn og legg til handlinger. Velg for eksempel et lys og **På/Av**, eller en person og **Våken/Sovende**. **Vilkår og avanserte valg** samler begrensninger, avhengigheter og feilregler. Endringer lagres automatisk. Egne rutiner kan deaktiveres med krysset eller fjernes med **Slett egen rutine**.

Under hver rutines handlinger viser **Handlingene kjøres i rekkefølge/parallelt** det lagrede utførelsesvalget. Åpne delen for å velge **I rekkefølge** eller **Parallelt**. Valget lagres automatisk. Delen holder seg åpen når handlinger legges til, redigeres eller fjernes.

Egne rutiner starter med **Start rutine**, eller fra en Homey Flow med House Guard-kortet **Start navngitt rutine**. Vilkår i en handling kontrolleres når rutinen starter; de starter ikke rutinen automatisk. Morgen ved bevegelse konfigureres direkte under Deaktivering av alarm som beskrevet ovenfor.

## Gjestemodus – gjester teller som hjemme

**Anbefalt:** Legg til enheten **Gjestemodus** i Homey med **Legg til enhet → House Guard → Gjestemodus**. Enheten har en av/på-bryter som følger appens gjestestatus. Du kan også bruke bryteren på Hjem eller Flow-kortet **Sett gjestemodus**. Det opprettes ingen ekstra Homey-bruker, og beboernes GPS- og sovestatus endres ikke.

| Hendelse | Hva House Guard gjør |
| --- | --- |
| Gjestemodus på mens en beboer er hjemme | Beholder lysene som de er og sender push. Alarmen holdes frakoblet. |
| Siste beboer drar med gjestemodus på | Sender push om at gjestene er alene. Huset forblir hjemme; borterutinen slukker ikke lys og kobler ikke til alarm. |
| Gjestemodus på mens alle beboere er borte | Frakobler alarmen og bruker vanlig hjemkomst, inkludert valgte handlinger og eventuell automatisk opplåsing. Vanlige forsinkelser og vilkår for lys gjelder. |
| En beboer kommer tilbake til gjestene | Starter ikke første-hjemkomst på nytt. Individuell ankomst og valgt automatisk opplåsing følger det vanlige oppsettet. |
| Gjestemodus av mens en beboer er hjemme | Sender push og fjerner gjestenes tilstedeværelse. Ingen ekstra hjemkomst eller borterutine. Dersom alle hjemme sover, kan vanlig nattmodus starte. |
| Gjestemodus av mens alle beboere er borte | Sender push og starter vanlig borterutine med valgte forsinkelser, lys, lås og alarm. |

Push ved gjestemodus **på**, **av** og når **gjestene blir alene** sendes automatisk til telefonene til alle med **Motta pushvarsler** under Personer. Ingen gjesterutine, varselhandling eller hjelpeflow må lages. Gjentatt av/på-kommando med samme verdi gir ikke nytt varsel. Ventende varsler avbrytes hvis gjestemodus endres igjen. Feilet sending logges uten automatisk gjentakelse. Ved ukjent beboerstatus aktiveres gjestemodus uten å starte hjemkomst eller låse opp. Opplåsing krever fortsatt at vanlig automatisk opplåsing er valgt, alarmen er bekreftet frakoblet, og ankomsten fortsatt er gyldig.

Gjestemodus blokkerer både automatisk og manuell tilkobling av House Guard-alarmen. Nattmodus venter til gjestemodus er slått av. **Slå av gjestemodus når gjestene drar.**

Under **Rutiner → Gjestemodus** kan du legge til valgfrie ekstrahandlinger for **Gjestemodus på** og **Gjestemodus av**, for eksempel en Flow eller talemelding. De kjøres én gang når gjestemodus faktisk endres. Avkrysningen slår bare av ekstrahandlingene; vanlig tilstedeværelse, alarmbeskyttelse og gjestevarsler gjelder fortsatt. Rutiner som venter avbrytes hvis gjestemodus skifter igjen. Handlingene kan endres; navnene er faste, og de to standardrutinene kan ikke slettes.

De gamle gjestekategoriene og tidligere gjestehandlinger forblir inaktive og skjult. Nye gjesterutiner begynner tomme, slik at tidligere lys-, lyd- eller dørhandlinger ikke aktiveres utilsiktet. Vanlige hjemkomst-, borte- og andre rutiner beholdes.

## Borte betyr våken

House Guard setter automatisk en bruker til **våken** i Homey når brukeren er bekreftet borte, men fremdeles står som sovende. Det gjelder personene valgt under Personer → Tilstedeværelse, både ved GPS, manuell borteknapp og eksterne flows. Eksisterende feil status korrigeres også ved oppstart. Gjestemodus endrer ikke denne regelen.

Dette starter ingen morgenrutine og vekker ikke hjemmeværende. Ukjent, foreldet eller utilgjengelig tilstedeværelse endres ikke. Status leses på nytt før kommandoen; en bruker som er kommet hjem i mellomtiden endres ikke av den gamle avreisen. Testmodus logger bare hva som ville blitt gjort. Feil eller manglende bekreftelse vises i loggen, uten gjentatt sending for samme uendrede status. Den direkte API-forbindelsen brukes som for øvrige personhandlinger.

## Alarmsensorer fra Flow – for eksempel robotstøvsuger

To handlingskort under **House Guard** lar deg styre en sensor som allerede er valgt under **Alarm → Sensorer**:

- **Deaktiver alarmsensor:** velg sensor og **Full alarm (borte)** eller **Delvis alarm (natt)**.
- **Aktiver alarmsensor:** velg samme sensor og modus for å ta den med igjen.

La robotens start-Flow først deaktivere relevante sensorer, og deretter starte støvsugingen. Når roboten er ferdig eller avbrytes, aktiveres de samme sensorene igjen. Bruk ett kort per sensor og modus. Begge moduser kan deaktiveres med hvert sitt kort. Sensorens grunnvalg for Borte, Natt og Forsinket beholdes.

Dette virker også mens alarmen er tilkoblet. Deaktiveringen varer til et aktiveringskort kjøres og overlever frakobling, omstart og andre innstillingsendringer. Den vises på Hjem, under Alarm og ved sensoren. Alarmpanel-enheten viser antallet deaktiverte sensorer for gjeldende modus og varsler i statusen hvis ingen sensorer overvåkes. Hvis sensorens grunnvalg fjernes fra en modus, fjernes også dette Flow-unntaket.

En gjenaktivert sensor i tilkoblet modus venter på en bekreftet rolig/lukket avlesning før den overvåkes. Neste bevegelse/åpning kan deretter utløse alarmen. Aktivering i frakoblet modus følger vanlig sensorkontroll ved neste tilkobling. Deaktivering avstiller ikke en allerede utløst alarm eller en påbegynt inngangsforsinkelse. Resten av sensorene virker som før. En sensor deaktivert for nattalarm starter heller ikke «morgen ved bevegelse».

Flow-valgene lagres uavhengig av om førstegangsoppsettet er ferdig. Eksplisitt testpush er en separat prøvehandling. Ingen sensorsperrer legges inn ved oppgradering, og eksisterende oppsett og flows beholdes.
