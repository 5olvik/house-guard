# Ja starter natt med en gang 0.4.34 – publisert som test

Kontrollert 5. oktober 2026. **0.4.34 er installert på Solviks Homey** uten `--clean` (5.48 MB, 718 filer). Etterkontroll bekrefter kjørende versjon og klar API-forbindelse. Oppsettet er helt uendret, inkludert revisjon 146, nattområde, roperiode, svarfrist og auto-no-answer. Eksisterende nattmodus, delvis tilkoblet alarm, gjestestatus, personenes hjemme-/sovestatus, normale/Advanced Flow-ID-er og sensorunntak er bevart. Nattspørsmålet var allerede avgjort før installasjon; ingen avbrudd av et ventende spørsmål. **0.4.34 er publisert på GitHub og i Homey App Stores testkanal (bygg 14)**. App Store-API bekrefter versjon 0.4.34 og tilstand `test` etter opplasting og kanalbytte.

Med **Automatisk etter svarfrist** sendes spørsmålet først etter valgt roperiode. Ett ja starter deretter nattmodus på neste motorkjøring, normalt innen ett sekund, uten å vente på svarfristen eller resten av mottakerne. Uten svar venter den til fristen. Bare valgte våkne hjemmeværende får spørsmål, og felles nattstart setter hjemmeværende i nattutvalget sovende. Et nei avbryter et fortsatt ventende spørsmål; sene svar etter avgjørelsen endrer ikke nattbeslutningen. De andre svarreglene, ro/ferskhet, morgen-/config-/reconnect-avbrudd og øvrige vilkår beholdes. GUI-forklaringen og hendelsesloggen skiller ja-start fra ubesvart friststart.

**356 tester består**, inkludert 65 fokuserte natt-/policy-/API-tester, kodekontroll av **85 JavaScript-filer** og Homey-validering på nivå `publish`. Nye tester følger ro i 29/30 minutter, ja etter 7 sekunder med 900-sekunders frist og ubesvart ved 899999/900000 ms, med allerede sovende og bortreiste. Ekte HomeyAdapter/DirectApi mot falsk Homey-flow-API bekrefter telefonsvar→nattstart→set_asleep uten hjelpeflows og uten at et senere svar fra andre endrer avgjørelsen. Begge ferske sluttavlesninger prøves ved både frist og tidlig ja med config-/generasjons-/spørsmåls-/observasjonsendringer, morgen og reconnect. Tidligere sikkerhets- og migreringstester består. Installert motor/policy/GUI er identisk med kilden; versjoner og lock samsvarer med 0.4.34. Skann av 115 offentlige filer har ingen funn eller private filer.

Ingen levende nattspørsmål, personendringer, alarm, lys, lås/port, Flow eller push ble utløst for testing. Ny fysisk ja-start må bekreftes ved neste spørsmål; den eksisterende nattstatusen var resultat av gammel fristregel før oppdateringen. Mobilvisningen er ikke kontrollert på nytt; bare hjelpeteksten i samme felt er endret.

Publiseringskontrollen bekrefter samme testede kode og installasjonspakke, 356 beståtte tester, 85 kontrollerte JS-filer, godkjent publish-validering og skann av 115 offentlige filer uten funn/private filer. CLI-opplastingen bekrefter 0.4.34, bygg 14, 5.48 MB og 718 filer. Testkanalen ble bekreftet 5. oktober 2026 kl. 00:20 norsk tid. Fersk Homey-lesing bekrefter kjørende 0.4.34; ingen ny installasjon var nødvendig. Testpakken inkluderer også våkne mottakere fra den lokale 0.4.33. Ingen ordinær utgivelse.

## Nattspørsmål bare til våkne hjemmeværende 0.4.33 – installert lokalt

Kontrollert 4. oktober 2026. **0.4.33 er installert på Solviks Homey** uten `--clean` (5.48 MB, 718 filer). Etterkontroll bekrefter versjon, forbindelse og klar API-forbindelse. Oppsettet er helt uendret, inkludert brukerens nyeste revisjon 144, nattregel og personutvalg. Hjemmemodus, frakoblet alarm, gjestestatus, personenes hjemme-/sovestatus, sensorunntak og normale/Advanced Flow-ID-er er bevart. Sist publisert på GitHub og i Homey App Stores testkanal er **0.4.32, bygg 13**.

Nye nattspørsmål sendes bare til valgte mottakere som er bekreftet hjemme og våkne. En som allerede sover, trenger ikke svare. «Alle må svare ja» gjelder bare dem som blir spurt. Ingen spørsmål eller tom automatisk svarfrist opprettes dersom ingen våken mottaker er hjemme. Pågående spørsmål beholder sin opprinnelige mottakerliste; en som legger seg etter utsending avbryter ikke spørsmålet for resten. Felles nattstart, svarregler, nei-veto, tekniske feil, ferske person-/sonevilkår og oppsett beholdes.

**352 tester består**, kodekontroll av **85 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. Tre nye regresjonstester kontrollerer faktisk spørsmål, svarnøkler og leveringer bare til våkne valgte hjemmeværende for alle tre svarreglene, ingen våken mottaker, svar fra ikke-mottakere, felles nattstart med én mottaker og nei-veto. Eksisterende tester for sovestatusendring under spørsmålet/begge sluttavlesninger, aktivitet, sendefeil, morgen-/reconnect-avbrudd og migrering består. Bygd motor/GUI er identisk med kilden; manifest, package og lock samsvarer med 0.4.33. Skann av 115 offentlige filer har ingen private funn eller filer.

Ingen levende nattspørsmål, personendringer, alarm, lys, lås/port, Flow eller push ble utløst for testing. Faktisk mottak med det nye utvalget må bekreftes ved neste nattforløp. Bare forklaringen i det eksisterende GUI-feltet er endret; mobilvisningen er ikke kontrollert på nytt.

## Automatisk natt med blandet sovestatus 0.4.32 – publisert som test

Kontrollert 4. oktober 2026. **0.4.32 er bygget og installert på Solviks Homey** uten `--clean` (5.48 MB, 718 filer). Etterkontroll bekrefter kjørende versjon, forbindelse og klar API-forbindelse. Oppsettet er helt uendret, inkludert revisjon 140, nattområde, roperiode, svarfrist og brukerens valg av automatisk regel. Hjemmemodus, frakoblet alarm, gjestemodus av, personers hjemme-/sovestatus, sensorunntak og normale/Advanced Flow-ID-er er bevart. **0.4.32 er publisert på GitHub og i Homey App Stores testkanal (bygg 13)**. App Store-API bekrefter versjon 0.4.32 og tilstand `test` etter opplasting og kanalbytte.

En manuelt sovende beboer blokkerer ikke lenger nattspørsmål eller felles nattstart for resten. Det nye navnet er **Automatisk etter svarfrist** med samme lagrede regel-ID. Området må være kjent rolig ved spørsmålet og fortsatt rolig gjennom ventetiden. Aktivitet, også en kort puls mellom avlesninger, avbryter forsøket uten å hoppe over hele natten. En ny roperiode gir et nytt spørsmål med ny svarfrist. Ett nei avbryter fortsatt; ukjente persondata, sendefeil, gjester, alarmtilstand og øvrige nattvilkår beholdes.

**349 tester består**, kodekontroll av **85 JavaScript-filer**, publish-validering, diff-kontroll og skann av 115 offentlige filer er godkjent. Ti nye tester dekker blandet sovestatus før/under spørsmålet og begge sluttavlesninger, ukjente/foreldede data, alle manuelt sovende uten dobbelt nattstart, ro/aktivitet/pulser, ny roperiode og natt→bevegelsesmorgen med alle hjemmeværende våkne. Eksisterende svarregler, veto, restart, config-/morgen-/reconnect-race og migreringstester består. Tre endrede kode-/GUI-filer er identiske med installasjonspakken; manifester og lock samsvarer med 0.4.32.

Fersk publiseringskontroll bekrefter de samme 349 testene, 85 JS-filer og godkjent publish-validering. 115 offentlige filer er skannet uten funn eller private oppsett/logger/arbeidsnotater. CLI-opplastingen bekrefter 0.4.32, bygg 13, 5.48 MB og 718 filer. Testkanalen ble bekreftet 4. oktober 2026 kl. 06:21 UTC. Ingen ordinær utgivelse.

Ingen levende nattspørsmål, personendringer, alarm, lys, lås/port, Flow eller push ble utløst for testing. Nytt fysisk natt-/morgenforløp er ikke prøvd. Den kortere etiketten og uendret binding er statisk kontrollert; nettleseren var utilgjengelig for ny mobil-/lagringskontroll. Tidligere kontroll ved 320/390 px gjelder 0.4.31.

## Nattspørsmål og fast sovestatus 0.4.31 – publisert som test

Kontrollert 30. september 2026. **0.4.31 er bygget og installert på Solviks Homey** uten `--clean` (5.48 MB, 718 filer). Etterkontroll bekrefter versjon, forbindelse og klar API-forbindelse. Konfigureringen er helt uendret, inkludert revisjon 131 og eksisterende nattregel. Hjemmemodus, frakoblet alarm, gjestemodus av, sensorunntak og normale/Advanced Flow-ID-er er bevart. **0.4.31 er publisert på GitHub og i Homey App Stores testkanal (bygg 12)**. App Store-API bekrefter versjon 0.4.31 og tilstand `test` etter opplasting og kanalbytte. Testpakken inneholder også rutineendringene fra 0.4.30. Ingen ordinær utgivelse.

Nytt valg «Ja eller ingen svar ved fristen» starter ved fristen hvis minst én svarer ja eller alle spørsmål forblir ubesvart. Ett nei avbryter, teknisk sendefeil alene gir ikke automatisk start, og ferske hjemme- og nattvilkår kontrolleres før start. Hjemmeværende i nattutvalget settes alltid sovende; den tidligere avkrysningen fjernes og eldre av-valg normaliseres til på uten å endre øvrig oppsett.

**339 tester består**, kodekontroll av **85 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. Regresjonstester dekker frist, veto, sendefeil, bekreftet hjemme/borte/ukjent status, gjester, tilkobling, endret oppsett under begge ferske avlesninger, omstart og gammel konfigurering/import. Start morgen og ny tilkobling avbryter også en allerede avgjort nattbeslutning som fortsatt kontrolleres. Morgenstart avbryter et ventende spørsmål selv om morgen ble startet tidligere samme dato.

Publiseringskontrollen bekrefter de samme 339 testene, 85 JS-filer og godkjent publish-validering. 115 offentlige kildefiler er skannet uten funn eller private oppsett/logger/arbeidsnotater. Opplastet pakke: 5.48 MB, 718 filer. Kildeversjoner og lock samsvarer med 0.4.31.

Isolert demovisning ved 320/390 px med Homeys faktiske stilark viser alle tre nattregler, kort forklaring, ingen sovestatus-avkrysning og ingen horisontal overflyt. Nytt valg bevares etter automatisk lagring og omlasting. Skjermbilde: `artifacts/night-0431-choice.png`. Ingen levende nattspørsmål, personsoving, alarm, lys, lås/port, Flow eller push ble utløst for testing. Fysisk telefonvisning og nattforløp må bekreftes kontrollert i eget oppsett.

## Rutinenavn og ekstrahandlinger 0.4.30 – installert lokalt

Kontrollert 30. september 2026. **0.4.30 er bygget og installert på Solviks Homey**, og etterkontroll bekrefter kjørende versjon, forbindelse og klar API-forbindelse. Privat før/etter-kontroll tillater og bekrefter bare fire faste navneendringer og revisjon 130→131. Rutine-ID-er, handlinger, avkrysninger, rekkefølge, personvalg, bevegelsessensor/tidsrom, alarmoppsett, sensorunntak og normale/Advanced Flow-ID-er er bevart. Hjemmemodus, frakoblet alarm og gjestemodus av er uendret. Installert uten `--clean`; pakke 5.48 MB, 718 filer. Ingen Git-/App Store-publisering av 0.4.30; siste publiserte versjon er **0.4.29, bygg 11**.

Rutiner heter nå **Siste Person forlater**, **Første Person som ankommer**, **Aktivering av Nattmodus** og **Deaktivering av Nattmodus**. Faste navn oppdateres ved eksisterende navnemigrering én gang, uten å endre tilhørende funksjoner. Veiviser, Personer- og Alarm-henvisninger bruker samme navn. **Ekstra handlinger** ved morgenstart er en egen seksjon utenfor rammen «Når starter morgenen?» og bevegelsesmenyen. **Start morgen ved bevegelse (valgfritt)** beholder bare sitt sensor-/tidsromsoppsett og tilhørende forklaring.

**319 tester består**, kodekontroll av **84 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. Uavhengig kildegjennomgang bekrefter navnekonsistens og uendrede ID-er, bindings og logikk. Mobilkontroll i isolert demo med Homeys faktiske stilark ved 320/390 px viser ingen horisontal overflyt. Ekstra handlinger står separat med både lukket og åpen bevegelsesmeny. En eksempelhandling er lagt til med automatisk lagring og bevart etter omlasting sammen med bevegelsesvalgene. Skjermbilder: `artifacts/routines-0430-mobile.png` og `artifacts/routines-0430-overview.png`. Fysisk iPhone-visning skal bekreftes av brukeren. Ingen testkommando for lys, port, lås, alarm, personer, Flows eller push er sendt.

# Velkomstsensor, solnedgang og tydeligere status 0.4.29 – publisert testversjon

Kontrollert 30. september 2026. **0.4.29 er installert på Solviks Homey og publisert på GitHub og i Homey App Stores testkanal (bygg 11)**. Etterkontroll ved lokal installasjon bekrefter at appen kjører og har forbindelse. Oppsettet er identisk bortsett fra forventet velkomstmigrering: `lightMode=lux`, `sensorType=contact` og revisjon 129→130. Handlinger, valgte enheter, Flow-ID-er, alarmoppsett og sensorunntak er bevart. Huset sto fortsatt i borte med tilkoblet full alarm, gjestemodus av og klar API-forbindelse. Åtte kontrollerte kilde- og GUI-filer er identiske med installasjonspakken (5.48 MB, 718 filer). **319 tester består**, kodekontroll av **84 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent.

Ved publisering ble tester, kodekontroll, versjonssamsvar og publish-validering kontrollert på nytt. Offentlig skann av 114 filer fant ingen private funn eller private filer. Koden er pushet til origin/main; Homey-CLI bekreftet én opplasting av 0.4.29, bygg 11 (5.48 MB, 718 filer). API-etterkontroll bekreftet overgang `draft`→`test` 30. september 2026 kl. 13:12:49 UTC. Norsk og engelsk butikkbeskrivelse og endringslogg er oppdatert. Ingen stable-/review-publisering eller ny lokal installasjon var nødvendig.

Velkomstlys har valg av dørkontakt eller bevegelsessensor. En ny aktivering innen ti minutter etter første hjemkomst starter rutinen én gang. Både raske åpne/lukke-pulser og korte bevegelsespulser bevares gjennom appens fulle avlesning. Første hjemkomst og puls i samme avlesning, gjesteankomst, avbrudd ved avreise/config/avsluttet gjestemodus og ingen replay ved omstart/reconnect er testet. Forsinkelse 0 har ingen skjult 30/32-sekunders ventetid; ventetid på rutinen og handlingen summeres og vises i kortet. Gamle oppsett beholder valgt sensor, luxgrense, lagret forsinkelse (også 32) og handlinger; nye oppsett starter med 0.

En liten reserve leser kun velkomstsensoren hvert sekund mens ankomstvinduet er aktivt, og sensor/personer hvert femte sekund når huset er tomt. Den aktiveres bare ved konfigurert sensor og aktive velkomsthandlinger. Alle sideeffekter krever fortsatt full fersk kontroll. Abonnementer venter på reell sanntidsforbindelse i stedet for å skjule tilkoblingsfeil. API-avlesninger har tidsgrenser, og kopier erstatter ikke sanntidsenheter i cachen.

Alternativet **Etter solnedgang** bruker Homeys egne solbetingelser via eksisterende API-nøkkel og inkluderer tiden etter midnatt frem til soloppgang. Begge betingelsene er prøvd med lesekall på Homey, også gjennom den nye adapterkoden. Kveld, før soloppgang, dag, ukjent status, manglende/feil API og soloppgang under ventetid er automatisk testet. Ingen luxsensor leses i solnedgangsmodus med mindre den også brukes av en annen handling. UI skjuler luxvalgene, forklarer plassering/API-nøkkel og lagrer sensor- og mørkevalg automatisk.

Hjem viser større statusfelt med tekst, ikon og farge: **Låst/Ulåst**, **Lukket/Åpen** eller **Ukjent status**. Lokal mobilkontroll med Homeys faktiske, sent lastede stilark er gjort ved 320 og 390 px; ingen horisontal overflyt eller avkuttet statustekst. Portens polaritet er bevart og åpen/lukket visning kontrollert. Valg av bevegelse/solnedgang er beholdt etter omlasting. Skjermbilder med demodata: `artifacts/welcome-home-status-mobile.png`, `artifacts/welcome-home-status-open-mobile.png`, `artifacts/welcome-motion-sunset-mobile.png`.

Testerens faktiske 30-sekunders forsinkelse er ikke gjenskapt på testerens Homey. Bekreftede svakheter ved 30-sekunders reserveavlesning og tapte pulser er rettet; ny hendelseslogg viser registrert sensorhendelse og rutine-/handlingsforsinkelse. Faktisk lysrespons kan nå prøves med 0.4.29 fra testkanalen, men er ikke fysisk testet. Ingen testkommando for lys, lås, port, Flow, alarm, personer eller push er sendt under kontrollen eller publiseringen. Homeys telefon/GPS kan fortsatt bruke tid på å registrere en hjemkomst.

# Gjestemodus og varsler 0.4.28 – publisert testversjon

Kontrollert 30. september 2026. **300 tester består**, kodekontroll av **82 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. **0.4.28 er installert på Solviks Homey og publisert på GitHub og i Homey App Stores testkanal (bygg 10).** Bygde GUI-filer og gjestevarselkode er identiske med kontrollert kildekode. Fersk før/etter-kontroll bekrefter identisk konfigurasjon med revisjon 129, uendrede Flow-ID-er og sensorunntak. Bortemodus, tilkoblet full alarm og gjestestatus er bevart. API-forbindelsen er klar.

Publiseringen inkluderer de lokale endringene fra 0.4.24 til 0.4.28. Alle 300 tester, kodekontrollen og publish-valideringen er kontrollert ved publisering. Offentlig skann av 112 filer har ingen private funn eller private filer. Homey-CLI-opplasting og etterfølgende API-kontroll bekrefter **0.4.28, bygg 10, state=test**. Ingen stable-/review-publisering. Norsk og engelsk butikkbeskrivelse og samlet endringslogg er oppdatert.

Av/på-snarveien under **Rutiner → Gjestemodus** er fjernet. Kortet anbefaler **Legg til enhet → House Guard → Gjestemodus** og forklarer at ekstrahandlinger er valgfrie. Hjem-bryteren, gjesteenheten og Flow-kortet beholdes. Varsler for påslag og gjester alene var allerede innebygd; av-varselet er nå lagt inn på samme direkte telefonpush-kanal. Alle gjestevarsler bruker mottakerne med **Motta pushvarsler** under Personer, også når ekstrahandlingene er deaktivert. Av-varselet beskriver tilbakegang til vanlig beboertilstedeværelse uten å love en bestemt alarm- eller lystilstand.

Tester bekrefter én push per faktisk på/av-endring, valgte mottakere, vanlige handlinger ved avslag i tomt hus, bevarte enheter/personer når noen er hjemme, avbrudd ved raske motsatte endringer, ingen automatisk gjentakelse ved feil og ingen avspilling av ferdige varsler etter omstart/reconnect. Observasjon har fortsatt ingen sideeffekter. Ingen rutinehandlinger eller konfigurasjonsfelt er migrert eller slettet.

Lokal nettleserdemo med Homeys faktiske, sent lastede CSS er kontrollert ved 320 og 390 pikslers bredde. Ingen horisontal overflyt, alle menyknapper er innenfor rammen, anbefalingen er synlig og den gamle snarveien mangler. Av-rutinen forklarer det innebygde varselet. Komplett skjermbilde: `artifacts/gui-0428-guest-overview.png`. Ingen fysisk gjeste-, alarm-, lys-, lås-, Flow-, person- eller pushhandling er utløst på Homey under denne kontrollen. Nytt av-varsel er testet automatisk; faktisk telefonmottak av dette nye varselet er ikke prøvd.

# Mobilmeny og ikoner 0.4.27 – installert lokalt

Kontrollert 30. september 2026. **296 tester består**, kodekontroll av **82 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. **0.4.27 ble bygget og installert lokalt på Solviks Homey.** Bygd HTML og CSS var identiske med kontrollert kildekode. Før/etter-kontroll bekreftet identisk konfigurasjon med revisjon 129, uendrede Flow-ID-er og sensorunntak, bevart bortemodus, tilkoblet full alarm og gjestestatus. API-forbindelsen var klar. Ingen Git- eller App Store-publisering.

Brukerens nye skjermbilde viste at rettingen i 0.4.26 ikke var tilstrekkelig. Homeys runtime legger inn `_base.css` etter appens eget stilark. En mer spesifikk eldre knappregel tvang `flex-shrink:0`, større padding og marginer, som ga overflyt. Bare de fem egne menyknappene er fritatt fra denne regelen med Homeys `hy-nostyle`-klasse. Personer har et SVG-ikon med to personer, og Alarm har et sireneikon. Ingen kopiering av Homeys stilark inn i appen.

Overflyten ble gjenskapt med faktisk Homey-CSS før rettingen og kontrollert etterpå ved 320 og 390 piksler og vanlig skrivebordsbredde. Alle knapper og etiketter er innenfor rammen uten ordbrudd eller horisontal overflyt. Alle fem menyer åpner riktig panel. Skjermbilder: `artifacts/gui-0427-homey-css-before.png` og `artifacts/gui-0427-homey-css-after.png`. Brukerens iPhone-visning må fortsatt bekreftes på telefonen. Ingen fysisk alarm-, person-, lys-, Flow- eller pushprøve ble kjørt under installasjonskontrollen.

# Mobilmeny og tidssone 0.4.26 – installert lokalt

Kontrollert 30. september 2026. **296 tester består**, kodekontroll av **82 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. **0.4.26 er bygget og installert lokalt på Solviks Homey.** De bygde HTML-, CSS- og UI-filene er identiske med kildefilene som ble kontrollert i mobilvisning. Før/etter-kontroll bekrefter identisk konfigurasjon med revisjon 129, uendrede Flow-ID-er og sensorunntak. Bortemodus, tilkoblet full alarm og gjestestatus er bevart. API-forbindelsen er klar. Ingen Git- eller App Store-publisering er utført.

Menyknappene fordeler plassen etter tekstlengden, og ikon og etikett har separate stiler. Alle etiketter, også «Innstillinger», er innenfor knappen ved 320 og 390 pikslers bredde uten horisontal overflyt. Alle fem menyvalg åpner riktig panel. Tidssonen er flyttet inn under Systemstatus med kortere forklaring. Dette er kontrollert i lokal nettleserdemo; den nye visningen i Homeys iPhone-app må fortsatt prøves av brukeren. Ingen fysisk alarm-, person-, lys-, Flow- eller pushprøve er kjørt under installasjonskontrollen.

# Nattoppsett og utførelsesvalg 0.4.25 – installert lokalt

Kontrollert 29. september 2026. **296 tester består**, kodekontroll av **82 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. **0.4.25 er installert lokalt på Solviks Homey.** Før/etter-kontroll bekrefter identisk konfigurasjon, inkludert revisjon 126, rutinehandlinger og innstillinger. Hjemmemodus, frakoblet alarm, gjestestatus, Flow-ID-er og sensorunntak er bevart. API-forbindelsen er klar. Git og App Store er fortsatt **0.4.23, bygg 9**.

Det tidligere samlede natt-/morgenoppsettet er delt i **Aktivering av natt** og **Deaktivering av alarm**. Første kort samler nattspørsmål, sovestatus og nattens ekstrahandlinger. Andre kort samler morgenstart, nattankomst og første oppvåkning med tilhørende ekstrahandlinger. Veiviser, alarmsnarveier og oppsettspåminnelser peker til riktig kort. Rutine-ID-er, konfigurasjonsfelt, alarmregler og øvrig backend er uendret.

Brukerens tomme «Avansert utførelse» kunne ikke gjenskapes i lokal demo; den tidligere nedtrekkslisten viste gyldige alternativer, og lagrede verdier var gyldige. Den er erstattet med radiovalg for **I rekkefølge** og **Parallelt**, forklaring av begge og valgt verdi i overskriften. Lokal nettleserkontroll bekrefter automatisk lagring og bevart valg etter gjenåpning. Utførelsesdelen holder seg åpen ved tillegg/fjerning av en Flow og ved oppdatering av kameraoppsettet under en alarmhendelse. Ingen plattformspesifikk årsak til det opprinnelige tomme feltet er bekreftet.

Begge rutinekort begynner sammenfoldet etter gjenåpning, og alarmsnarveiene åpner riktig kort. Mobilvisning ved 390 × 844 og vanlig skrivebordsbredde er kontrollert uten horisontal overflyt. Ingen doble element-ID-er, manglende snarveimål eller nettleserfeil ble funnet. Etter at demoprøvene ble tilbakestilt, var hele demooppsettet identisk med utgangspunktet bortsett fra revisjonen. Ingen fysisk alarm, push, personstatus, lys eller Flow ble startet på Homey under kontrollen. Visningen i Homeys mobilapp må fortsatt prøves av brukeren.

# Samlet funksjonsoppsett 0.4.24 – installert lokalt

Kontrollert 29. september 2026. **296 tester består**, kodekontroll av **82 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. **0.4.24 er installert lokalt på Solviks Homey.** Før/etter-kontroll bekrefter identisk konfigurasjon, inkludert revisjon 125, rutinehandlinger, avkrysninger og sensorvalg. Hjemmemodus, frakoblet alarm, gjestestatus, Flow-ID-er og sensorunntak er bevart. API-forbindelsen er klar. Git og Homey App Stores testkanal er fortsatt **0.4.23, bygg 9**.

Velkomstlys samler innstillinger og handlinger i ett kort. Natt/morgen har personvalg og ekstrahandlinger ved tilhørende hendelse, og gjestemodus samler på/av-handlingene. Tomme rutiner har samme plass som konfigurerte rutiner. Alarmens push, kamera, lyd, lys, gjentakelser og egne handlinger er samlet per hendelse. Delte alarm-/låsevalg har direkte snarveier. Ingen backend eller alarmregler er endret.

Lokal nettleserkontroll med eksisterende og helt tomt syntetisk oppsett bekrefter sammenfoldet rutineoversikt, samlet Velkomstlys, nattankomst, gjestemodus og alarmhendelser. Mobilvisning med viewport 390 × 844 og vanlig skrivebordsbredde er kontrollert; ingen horisontal overflyt. Alle statiske innstillingsfelt finnes fortsatt nøyaktig én gang; gjentakelsesfeltene er flyttet til alarmhendelsen og prøvd separat. Ingen doble element-ID-er eller manglende snarveimål.

Lagring er kontrollert for kamera, kritisk push, downlights, gjentakelsesintervall, ekstra Flow og velkomstvilkår. Bare tilsiktede felt ble endret. Etter fjerning av demovalgene var hele originaloppsettet identisk bortsett fra revisjonen. Egen rutine kunne opprettes, endre navn, deaktiveres og slettes. Faste rutiner har fortsatt låste navn og ingen sletteknapp; pausing gjelder bare ekstrahandlinger. Åpning av et nytt oppsett endret ingen innstillinger. Ingen fysiske alarm-, lys-, Flow- eller pushprøver er kjørt mot huset i denne GUI-runden. Faktisk mobilvisning i Homey må fortsatt prøves av brukeren.

# Navn og alarmregler 0.4.23 – publisert testversjon

Kontrollert 29. september 2026. **296 tester består**, kodekontroll av **82 JavaScript-filer** og Homey-validering på nivå `publish` er godkjent. **0.4.23 er installert på Solviks Homey og publisert på GitHub og i Homey App Stores testkanal (bygg 9).** Etterkontrollen bekrefter revisjon115: bare de tidligere tilpassede standardnavnene for natt og morgen er gjenopprettet. Handlinger, avkrysninger, øvrige innstillinger, Flow-ID-er, sensorunntak, gjestestatus og tilkoblet full alarm er bevart. API-forbindelsen er klar.

Faste rutinenavn låses også ved lagring/import. Natt/morgen-oppsettet heter «Aktivering - Deaktivering av nattalarm», dørlysdelen «Velkomstlys» og forbindelsesdelen «API-nøkkel». Testmodus/aktiv styring er fjernet som brukervalg. Nytt/importert eller tidligere pauset oppsett må fortsatt fullføres i veiviseren; ingen automatisk aktivering av et slikt utkast. Varselprøver beholdes. Visuell lokal kontroll bekrefter navn, fravær av navnefelt i faste rutiner, fjernet modusdel og mobilvisning ved390px.

Full alarm er en fast regel med vanlige forsinkelser når den innebygde alarmen er valgt, alle beboere er bekreftet borte og gjestemodus er av. Morgen krever en hjemmeværende beboer. Delvis tilkobling krever bekreftet hjemmeværende sovende også ved siste kontroll før sending. Nattalarm uten sovende korrigeres før sensorbehandling; en allerede utløst alarm eller inngangsforsinkelse avstilles ikke automatisk. Ukjente persondata brukes ikke til å koble til full alarm eller frakoble etablert dekning. Tester dekker omstart, avstilling, forsinkelser, hjemkomst, gjester, gamle valg/import, feil uten gjentatte forsøk ved hver polling og migrering uten tap av handlinger eller alarmtilstand.

Ingen fysisk alarmprøve eller live push er sendt i denne runden. Publiseringen av **0.4.23, bygg 9** er bekreftet med status `test`; ingen innsending til vurdering eller stabil kanal. Offentlig filskann av 112 filer har ingen private funn. Tidligere versjoners kontroller og daværende publiseringsstatus følger nedenfor.

# GUI 0.4.22 – lokal testversjon

Kontrollert 29. september 2026. **284 automatiserte tester består**, kodekontroll av **80 JavaScript-filer** består, og Homey-validering på nivå `publish` er godkjent. **0.4.22 er installert lokalt på Solviks Homey.** Etterkontroll bekrefter identisk konfigurasjon med revisjon 114, uendret bortemodus og tilkoblet bortealarm, klar direkte API-forbindelse og uendrede Flow-ID-er og sensorunntak. Versjonen er ikke publisert til GitHub eller App Store. App Stores testkanal er fortsatt **0.4.20, bygg 8**.

Veiviseren går fra funksjonsvalg via direkte forbindelse og beboere/varselmottakere til relevante steg for alarm, Flows og natt, før kontroll og eksplisitt aktivering. Hjem viser valgte funksjoner og konkrete oppfølgingspunkter. Innstillinger erstatter fanen Mer. Tomme faste rutiner ligger samlet; avkrysningen gjelder fortsatt bare ekstrahandlinger. Natt og morgen er delt i tydelige grupper med innstillinger som vises ved behov.

Automatiserte kontroller dekker gjenbruk av eksisterende oppsett, relevante steg og manglende forutsetninger før aktivering. Vanlig, kritisk og bilde-testpush kan utføres eksplisitt i testmodus. Prøvene bruker valgte mottakere og konfigurerte kameraer, med uendret køsperre, ventetid, API-kontroll og avbrudd ved endret oppsett. Ekte adapter mot falsk API bekrefter at vanlige rutinevarsler og lyd fortsatt blokkeres i testmodus. Ingen live push er sendt i denne GUI-runden.

Visuell kontroll i lokal nettleserdemo ved **390 px mobilbredde og vanlig skrivebordsbredde** bekrefter veiviseren, gjenopptakelse og bevarte person-, sensor- og Flow-valg. Fysisk Homey-GUI og bruk av en uavhengig førstegangsbruker er ikke prøvd. Automatiserte leveringsprøver bekrefter ikke faktisk telefonmottak eller enhetenes fysiske oppførsel.

# Historikk

Avsnittene nedenfor beskriver kontroller og publiseringsstatus på tidspunktet for hver tidligere versjon. Testantall, åpne oppgaver og installasjonsutsagn gjelder den oppgitte versjonen, ikke dagens kildekode.

## Lokal testversjon 0.4.21 – alarmsensorer fra Flow

Nye tester dekker uavhengig full-/nattstyring, endring mens tilkoblet, gjenaktivering med aktiv eller ukjent sensor, bevaring gjennom frakobling og omstart, idempotente kort, inngangs-/utgangsforsinkelse, allerede utløst alarm, alle sensorer deaktivert, slettede sensorer og ugyldige kortvalg. Grunnoppsettet beholdes. Morgen ved bevegelse ignorerer en sensor deaktivert for nattalarm. Alarmpanel viser unntak og null aktive sensorvalg. Lokal nettleserdemo bekrefter merking på Hjem, alarmoversikten og hver sensor.

265 tester består. Kodekontroll av 77 JavaScript-filer, Homey-validering på publiseringsnivå og offentlig filskann er godkjent. Installert lokalt på Solviks Homey. Hele konfigurasjonen, revisjonen, alarmmodus og eksisterende Flow-IDer er bevart. Homey bekrefter begge nye handlingskort, og sensorlistene for hver modus stemmer med valgt oppsett. Ingen sensorer ble deaktivert i huset under etterkontrollen. Versjonen er ikke publisert til GitHub eller App Store.

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
