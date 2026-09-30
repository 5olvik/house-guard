House Guard for Homey Pro. Use the setup wizard to select people and Homey Flows for home, away and night. Add guest mode as a switch in Homey.
Create a Flow such as “Turn off all lights” in Homey, then select it in the wizard. Configure a Homey API key in the app to run Flows, mobile notifications, night questions and Sonos directly without helper Flows.
The wizard guides you through API key setup, residents, recipients, alarm and routines. Complete setup before the house is controlled, or pause and continue later. Notification tests can be sent before setup is complete.
Test release. Physical effects and actual delivery still require testing. The settings interface is currently in Norwegian.

Includes a native alarm with door/window and motion sensors, separate night/away selection, entry/exit delays and an alarm panel device. No separate alarm app or alarm bridge Flows required.
Alarm settings group notifications, cameras, sound, lights and custom actions by event. Sensors and door/garage controls have their own sections. When the House Guard alarm is enabled, all residents are confirmed away and guest mode is off, full alarm always arms with the configured delays. Night protection requires a sleeping resident at home, and morning cannot disarm an empty home. Select push recipients, critical alerts and up to three cameras per alarm event for image notifications. Critical and image alerts are delivered as separate notifications.

Enable or disable selected alarm sensors from Flow, separately for full and night alarm, for example while a robot vacuum runs.

Manual home and away buttons update all selected residents in Homey, including without GPS. The alarm panel displays status and offers a dismiss button; house routines are controlled through House Guard.

Optional morning start on motion within a chosen time window disarms night protection and marks home residents awake. Fixed routines cannot be renamed or deleted; their switches control only extra actions. Custom routines can be named and deleted, with readable choices and optional advanced settings.

Each function groups its settings and actions in one place. Night activation and alarm deactivation have separate sections, and actions have clear sequential or parallel choices. The mobile menu has people and siren icons and fits narrow screens.

Welcome lights can start on door opening or motion after the first arrival home. Choose a lux sensor or the period from sunset to sunrise. Sunset uses Homey's location and requires an API key, with no lux sensor needed. Routine and action delays are added and displayed together; 0 adds no waiting in the app. Short sensor events are preserved, with faster fallback checks when a real-time message is missed.

The dashboard shows larger lock and garage status indicators with text, icons and colors: Locked/Unlocked, Closed/Open or Unknown status.

Guest mode counts as someone staying home: departure routines wait and the alarm stays disarmed. Turning it on while residents are home leaves lights unchanged; turning it on in an empty house uses the configured homecoming routine. We recommend adding the Guest mode device in Homey for on/off control. Built-in push notifications announce activation, deactivation and when guests are left alone, using the recipients selected under People. Optional guest mode on/off routines let you add custom actions; no notification action is required. Away residents still marked asleep are automatically marked awake without waking people at home or starting the morning routine.
