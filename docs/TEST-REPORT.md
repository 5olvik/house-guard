# Lokal testversjon 0.4.20 – gjesterutiner og våken ved avreise

253 tester består. Nye tester dekker tomme og beskyttede gjesterutiner, bevarte eldre handlinger uten gjenaktivering, én kjøring per gjesteendring, avkrysning uten å deaktivere innebygde varsler og avbrudd ved raske av/på-endringer.

Bortreiste sovende brukere korrigeres gjennom Homeys vanlige våken-kort. Tester dekker bekreftet status, avreise med gjester, bevarte hjemmeværende sovende, ingen morgen-/første-våkne-rutine, opprydding ved oppstart, ukjent/foreldet/utilgjengelig tilstedeværelse, hjemkomst før kjøring, observasjon og feil uten løpende gjentakelse. Vanlige morgenhandlinger krever fortsatt hjemmeværende bruker.

Installert lokalt på Solviks Homey. Før/etter-kontroll bekrefter bevarte handlinger, avkrysninger, morgenvalg og Flow-IDer, samt to nye tomme gjesterutiner. Hjemmemodus, frakoblet alarm og klar direkte forbindelse var uendret. Nettleserdemo bekrefter synlige gjesterutiner med forklaring, avkrysning og handlingsknapp. 75 JavaScript-filer er kontrollert, Homey-validering på publiseringsnivå er godkjent og offentlig filskann har ingen funn. Ingen fysisk personstatusendring ble nødvendig under etterkontrollen. Versjon 0.4.20 er publisert på GitHub og i Homey App Stores testkanal (bygg 8), bekreftet 28. september 2026. Publiseringskontrollen bekrefter 253 beståtte tester, godkjent kode- og Homey-validering og ingen private filer i kildekoden.

# Lokal testversjon 0.4.19 – gjester som tilstedeværelse

240 tester består. Nye tester dekker gjester sammen med beboere, alene, ankomst til tomt hus, vanlig hjemkomst og avreise, lys som beholdes, eksisterende lysvalg, valgt opplåsing etter bekreftet frakobling, utløpt eller avbrutt ankomst og ukjent tilstedeværelse. Push ved påslag og når siste beboer drar er innebygd, uten dubletter eller automatisk retry ved feil. Ekte personstatuser endres ikke.

Native integrasjonstester bekrefter frakobling av aktiv alarm og tilkoblingsforsinkelse, sperret ny tilkobling under gjestemodus, kansellering av en ventende alarmkommando og at en treg eldre gjestekommando ikke overstyrer det nyeste valget. Oppstart/reconnect spiller ikke av gamle ankomster eller varsler. Observasjon har ingen sideeffekter. Migrering bevarer innstillinger og rutinehandlinger og øker revisjonen én gang for gammel gjestemodell.

Nettleserdemo viser Hjemme og frakoblet alarm når alle beboere drar og gjester er igjen. Gamle gjesterutiner og kategorivalg er fjernet fra GUI. Ingen fysisk opplåsing, personstatusendring eller pushprøve er utført under utviklingen.

Installert lokalt på Solviks Homey. Etterkontroll bekrefter versjon 0.4.19, bevarte rutinehandlinger, avkrysninger, morgeninnstillinger og Flow-IDer. Eksisterende nattmodus og skallsikring var uendret etter installasjon, og direkte forbindelse er klar. Kodekontroll av 72 JavaScript-filer, Homey-validering på publiseringsnivå og kontroll av offentlige filer er godkjent. Denne versjonen er ikke publisert til GitHub eller App Store.

# Lokal testversjon 0.4.18 – faste og egne rutiner

222 tester består. Nye kontroller dekker sperret sletting av faste rutiner, tillatt sletting av egne rutiner, gjenoppretting av skjulte/manglende faste rutiner og bevaring av handlinger og avkrysninger. Innebygde person-, alarm-, lås-, port- og gjestehandlinger følger sine egne innstillinger når ekstrahandlinger er deaktivert. Forhåndsvisningen bruker samme regel. Egne rutiner kjører bare når de er aktivert.

Nettleserdemo bekrefter lesbare lys- og personvalg, sammenfoldede avanserte valg, bevarte vilkår ved redigering, avkrysning etter ny innlasting, oppretting og sletting av egen rutine og ingen sletteknapp på faste rutiner. Eksisterende handlinger beholdes når avkrysningen fjernes. Ingen fysiske enheter eller personstatuser er endret under testingen.

Installert lokalt på Solviks Homey. Etterkontroll bekrefter uendret revisjon og bevarte handlinger, avkrysninger, morgeninnstillinger og Flow-IDer. Direkte forbindelse er klar. Versjon 0.4.18 er også publisert på GitHub og i App Stores testkanal (bygg 7).

# Lokal testversjon 0.4.17 – morgen ved bevegelse

217 tester består, inkludert eksisterende rutinetester. Nye integrasjonstester dekker prioritet før nattalarm på samme sensor, alle hjemmeværende våkne, bevarte morgenhandlinger, avslått funksjon, tidsgrenser, ingen hjemme, observasjon, gjester og manglende API. Full alarm, utløst alarm, inngangsforsinkelse og annen aktiv sensor beskyttes. Oppstart/reconnect, kort puls og ny natt samme dato er testet. Migrering legger bare til et avslått valg og bevarer øvrig oppsett.

Nettleserdemo bekrefter sensorvalg, redigering av tidsrom, aktivering og automatisk lagring etter ny innlasting. Ingen sensor er valgt eller automasjon aktivert på brukerens Homey under utviklingen.

# Lokal testversjon 0.4.16 – manuell hjemme/borte

210 tester, syntakskontroll av 68 filer og Homey-validering består. Nye tester dekker bare valgte brukere, normale forsinkelser og alarmvalg, hjemkomst uten morgenrutine, delvis feil/ukjent utfall, observasjon, samtidige trykk, endret oppsett, GPS-hjemkomst og gjestevern. Direkte kort-IDer er lest fra Homey. Ingen faktisk personstatus er endret under testingen.

# Lokal testversjon 0.4.15 – alarmpanel med status og avstilling

201 tester, syntakskontroll av 66 filer og Homey-validering består. Tester dekker oppgradering av eksisterende panel uten alarmkommando, ingen modusvelger, uendret status-tag, løpende natt-/borte-/forsinkelses-/sensorstatus, avstilling gjennom appen og sletting uten modusendring. Ingen fysisk alarm utløses under testen.

# Lokal testversjon 0.4.14 – gjentatt manuell morgen

198 tester består. Regresjonstesten dekker lagret morgenstart fra samme dato, ny natt, manuell morgen, avbrutt ventende natt, dobbelttrykk, frakobling før vekking og kun hjemmeværende våkne. Automatisk morgen beholder datobeskyttelsen.

# Lokal testversjon 0.4.13 – nattankomst og vekking

197 tester og syntakskontroll av 65 filer består. Nye tester dekker frakobling uten hjemkomstforsinkelse, bare ankomne våkne, avbrutt ventende natt, senere ny skallsikring, deaktiverte ekstrarutiner, av/på-valg, avreist person, observasjon og reconnect. Fast morgen og Flow-startet morgen setter bare hjemmeværende våkne; ekstern individuell oppvåkning frakobler uten å endre andres sovestatus. Ingen fysiske alarmprøver eller personstatusendringer er sendt under testen.

# Lokal testversjon 0.4.11 – port uten temperaturkrav

194 tester og Homey-validering består. Nye kontroller dekker automatisk lukking uten temperaturdata, av/på-valget og migrering som bevarer portvalg og fjerner gamle temperaturfelt. Krav om kjent åpen port og våkent hus er bevart. Ingen fysisk portkommando er sendt under testingen.

# Lokal testversjon 0.4.10 – flere alarmkameraer

192 tester og syntakskontroll av 65 filer består. Nye tester dekker migrering av enkeltkamera, grense på tre uten duplikater, push før bilder, uavhengige kamerafeil, bildevalg ved alarmgjentakelse, sensor-/kameranavn per mottaker og kameratest med observasjon, avbrudd og delvise feil. Nettleserdemo bekrefter legge til/fjerne, grensen på tre, autosave etter innlasting og korrekt antall testvarsler. Nye fysiske bildevarsler er ikke sendt; mottak fra flere kameraer må prøves med testknappen.

# Lokal testversjon 0.4.9 – lysutvalg og enklere innstillinger

186 tester, syntakskontroll av 65 filer og lokal Homey-validering består. En regresjonstest dekker Homeys valgte enhetstype, slik at en stikkontakt brukt som lys blir med uten å inkludere andre apparater. Nettleserdemo bekrefter lysvalg, automatisk lagring etter ny innlasting, sammenleggbare innstillinger og snarveien fra Hjem til Systemstatus. Ingen fysiske lyskommandoer eller testvarsler er sendt.

# Lokal testversjon 0.4.8 – selvstendige alarmvalg

185 tester, syntakskontroll av 65 filer og lokal Homey-validering består. Bortealarm, skallsikring og automatisk frakobling har egne valg under Alarm som fungerer uavhengig av tilhørende rutines av/på-status. Migrering bevarer tidligere deaktiverte hendelser. GUI-valg og autosave er prøvd i demo. Ingen nye fysiske alarmprøver eller varsler. Se [alarmoppsett](ALARM-SETUP.md).

# Lokal testversjon 0.4.7 – underfaner i Alarm

Alarm er delt i seks underfaner. Nettleserkontroll i mobilbredde og normal bredde bekrefter separate paneler, bevart autosave og tastaturnavigasjon. 176 eksisterende tester, syntakskontroll og Homey-validering består. Kun GUI-endring, ingen varselprøver eller publisering. Se [alarmoppsett](ALARM-SETUP.md).

# Lokal testversjon 0.4.6 – alarmoppsett

176 tester, syntakskontroll av 63 filer og lokal Homey-validering består. GUI-prøve av autosave, alarmlys og rutinesletting består. 0.4.6 er installert lokalt, migrering og bevarte Flows er verifisert. Kritisk push og bildepush er akseptert av Homey og bekreftet mottatt med bilde på brukerens telefon. Se [alarmoppsett](ALARM-SETUP.md) for omfang og begrensninger. Ingen publisering.

# Lokal testversjon 0.4.4 – direkte overgang

163 tester, syntakskontroll og lokal publish-validering består. Standard Flow-start og et ufarlig Flow-kort er faktisk kjørt fra appen via brukerens API-nøkkel. Midlertidig testflow er slettet. Den gamle hjelpeflowen med 48 kort er sikkerhetskopiert og fjernet; alle øvrige Flows og oppsettet er bevart. Vanlig direkte push ble akseptert av Homey for begge valgte mottakere, og brukeren har bekreftet mottak på sin telefon. Mottak på den andre telefonen og øvrige varseltyper/fysisk levering gjenstår. Se [API-oppsettet](API-KEY.md).

---

# Lokal testversjon 0.4.3 – API-nøkkel

159 tester og JavaScript-kontroll av 58 filer består. Lokal Homey publish-validering består. Installert lokalt uten publisering; oppsett og eksisterende hjelpeflow er bevart. Direkte API er testet med stubber, ikke en reell nøkkel. Brukeren må legge inn nøkkel før live leveringsprøver og fjerning av hjelpeflow. Se [API-oppsettet](API-KEY.md).

---

# Lokal testversjon 0.4.2

143 automatiserte tester, syntakskontroll og lokal Homey publish-validering består. Testversjonen er installert lokalt på Homey uten publisering til GitHub eller App Store. Oppsettet er bevart; scene- og sovestatuskoblinger er kontrollert mot Homeys Flow-modell. Demoens HTTP-API består for nye forsidekontroller og alarmstatus. Faktisk telefonmottak, visuell kontroll og fysisk styring gjenstår. Se [alarmoppsettet](ALARM-SETUP.md).

---

# Tester og begrensninger – 0.4.1

Kontrollert 26. september 2026 med Node.js 24, Homey CLI 4.5.0 og homey-api 3.19.5.

## Automatiserte tester

**118 tester består.** Kjør `npm test`. Testene bruker klokke, adaptere og Homey-stubber; de styrer ikke et fysisk hus.

Dekningen omfatter tilstedeværelse, forsinkelser og avbrudd, nattspørsmål med frist og nei-veto, sen/utdatert respons, omstart, gjestemodus og enhetsdriver, lås- og portregler, observasjon, tilstandsbekreftelse, alarmkontekst, tidsplaner og sommertid, konfigurasjonsendring, rutineforhåndsvisning, enkle Flow-koblinger, egen alarmmotor og alarmpanel og oppsettsveiviser.

Flow-veiviseren er kontrollert for begge Flow-typer, like navn, utilgjengelige eller slettede valg, erstatning av tidligere veiviserlys, gjenbruk av eksisterende handlinger og vern av avhengigheter. Flow-start leser fersk status og kontrollerer autorisasjon igjen før sending. Ingen eksisterende scene-Flow er startet under denne kontrollen.

Autolagring er testet med raske endringer, samtidige forespørsler, ufullstendige verdier, utdatert polling, tapte svar og endringer fra en annen visning. Veiviseren lagrer bare det endrede valget, uten å overskrive andre veiviserhandlinger.

Autolagringsmodellen er også kjørt mot den lokale demoens HTTP-API: to raske endringer ble lagret, ugyldig tall ble avvist og JavaScript-filen ble levert. Dette er en API-kontroll, ikke en visuell nettlesertest.

`npm run check` kontrollerer JavaScript-syntaks, lokale modulstier, standardkonfigurasjon, API-handlerne og samsvar mellom manifest og pakkeversjon. Kontrollen er uavhengig av private migreringsfiler.

`npm run validate -- --level publish` består. Dette er lokal Homey-validering, ikke innsendelse eller godkjenning i App Store.

Alarmtestene dekker full/natt-utvalg, korte sensorpulser, ukjente sensorer, åpne dører, forsinkelser, avstilling, duplikater, omstart, endret oppsett, observasjon og overgang fra eksternt panel. Integrasjonstestene bekrefter at hjemkomst kan avbryte en pågående tilkobling og at avstilling stopper ventende tilkoblingshandlinger.

Demoens HTTP-API er testet med lagring av sensoroppsett, tilkobling, simulert alarm med sone/årsak og avstilling. Frakobling er også testet mens en tilkoblingsforespørsel venter på en treg avlesing; det forsinkede svaret får ikke koble til igjen.

Push-testene bekrefter at vanlig, kritisk og bildepush beholder alle valgte mottakere og eventuelt kamera. Tidslinjekopi er valgfri og sendes én gang etter push, ikke per mottaker. Observasjon blokkerer begge deler, endret konfigurasjon stopper kopien, og feil i tidslinjen fører ikke til ny push. Dette er SDK-/adaptertester; ingen testmelding er sendt til reelle telefoner.

## Kontroller utført på Homey

- 0.4.1 er installert og kjører uten krasj eller katalogfeil. Konfigurasjonen og alle Advanced Flows er identiske med sikkerhetskopien tatt rett før installasjon. Alle tre push-kort er tilgjengelige. Observasjon er fortsatt aktiv, og ingen reelle prøvevarsler er sendt.

- 0.4.0 er installert i observasjon. Eget alarmpanel er valgt internt, men ingen fysisk alarmsensor er valgt. Katalogen har ingen feil. Personer, rutiner og øvrige enhetsvalg er bevart. Seks gamle alarmbrokort er fjernet fra appens integrasjonsflow; de 28 gjenværende kortene er kontrollert uten feil. Andre personlige flows er uendret.
- 0.3.1 viser begge Flow-typer og bevarer Homeys opplysning om hvilke flows som kan startes direkte. Veiviserens utkast ble validert og forhåndsvist gjennom den installerte appen uten lagring eller Flow-start. Lagret konfigurasjon og observasjon var uendret etter installasjonen.
- Appen installeres og kjører i observasjon uten katalogfeil.
- Faktiske kortmetadata og Sonos-lydvalg er lest.
- Nye Flow-koblinger er kontrollert med Homeys `isBroken()` og appens kontroll av forbindelser, mål og tagger.
- Nødvendige endringer i et eksisterende oppsett er kontrollert uten å endre de øvrige rutinene.
- Appens tilgang til å kjøre handlings- og betingelseskort ble avvist med «Missing Scopes» i en ufarlig prøve.

Disse kontrollene bekrefter oppsett og tilgang, ikke at meldinger er mottatt, lyd hørt eller enheter fysisk styrt.

## Gjenstående

- Faktisk mobilmottak, tale og alarmlyd.
- Mobilkortets feil, tidsavbrudd og sent svar på reelle telefoner.
- Full alarmprøve med valgte fysiske sensorer, avstilling og sanntidsforbindelse.
- Fysisk virkning av lås og port i et kontrollert oppsett.
- Visuell kontroll av veiviser og autolagring på innstillingssiden, særlig på mobil. Ingen nettleser var tilgjengelig under den siste kontrollen.
- En komplett vanlig Flow med de nye kortene i praktisk bruk. Lokale modeller dekker både vanlige flows og Advanced Flow; den kontrollerte installasjonen bruker Advanced Flow.
- Testing med nye brukere og full engelsk oversettelse av innstillingene.

Enkle utgangskoblinger har ingen automatisk reservepush eller eksplisitt leveringskvittering. Private kontrollresultater, enhets-ID-er, logger og sikkerhetskopier er ikke del av kildekoden.
