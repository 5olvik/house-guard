# API-nøkkel i House Guard

House Guard fra versjon 0.4.3 kan kjøre uten hjelpeflows. Åpne Homeys nettapp → Innstillinger → API-nøkler → Ny API-nøkkel. Gi den navnet House Guard og velg **Flows** med full Flow-tilgang. Bare visning eller «Start Flows» er ikke nok for mobil-, Sonos- og tilstedeværelseskortene.

Åpne House Guard → Mer → Direkte forbindelse og lim inn nøkkelen. Den kontrolleres og lagres automatisk. Feltet tømmes etter lagring; status viser om forbindelsen er klar. Den innlimte nøkkelen skal ikke sendes i chat eller deles. Appens konfigurasjonseksport og hendelseslogg inneholder ikke nøkkelen. Nøkkelen lagres separat i Homeys appinnstillinger og må behandles som en hemmelighet også i eventuelle Homey-sikkerhetskopier.

Med konfigurert nøkkel brukes direkte API for valgte Flows, vanlig/kritisk/bildepush, nattspørsmål, Sonos-tale/-lyd og sovestatus. En feil utløser ikke automatisk omkjøring gjennom hjelpeflows; dette unngår dobbelt utsendelse ved ukjent utfall. Observasjon blokkerer fortsatt alle eksterne handlinger. Nøkkelkontrollen er bare en tilgangskontroll og bekrefter ikke fysisk levering.

Velg Kontroller forbindelse etter endrede rettigheter eller nettverksproblemer. Fjern nøkkel bytter tilbake til eksisterende Flow-koblinger; hvis disse er slettet, må direkte forbindelse gjenopprettes før funksjonene kan brukes. En feil ved innlegging av ny nøkkel beholder gammel fungerende nøkkel.

Før gamle hjelpeflows slettes skal direkte levering testes. Egne lys-/scene-Flows beholdes: det er dem House Guard starter. Alarmens kritiske push og bildepush velges under Alarm → Varsler. Mottakerne velges under Personer. Egne rutiner kan også ha varselhandlinger.

Offisiell veiledning: https://support.homey.app/hc/en-us/articles/8178797067292-Create-and-use-API-Keys-on-Homey-Pro
