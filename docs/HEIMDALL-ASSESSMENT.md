# Valg av egen alarmmotor

26. september 2026 valgte prosjektet å utvikle en selvstendig alarmmotor i House Guard. Heimdall-kode er ikke kopiert. Den tidligere integrasjonen mot Heimdall er fjernet i 0.4.0; alarmmotor, sensorvalg og panel er beskrevet i [NATIVE-ALARM.md](NATIVE-ALARM.md).

Bakgrunnen for å unngå kodegjenbruk var Heimdalls DdK License, som krever skriftlig tillatelse til blant annet kopiering, endring og distribusjon. En offentlig GitHub-adresse gir ikke slik tillatelse. [Lisensen ved undersøkt kildeversjon](https://github.com/daneedk/com.uc.heimdall/blob/921dfe11d0b8e6b4e88e8f4d298c793c0da41345/LICENSE).

House Guards egen alarmmotor erstatter ikke mobil- og Sonos-leveringskoblingene. Den er heller ikke en implementasjon av alle funksjoner i andre alarmapper. Testing med faktiske sensorer, nettbrudd og mottakere gjenstår.
