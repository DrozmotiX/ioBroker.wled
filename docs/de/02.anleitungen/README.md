# Anleitungen

Anleitungen nach Aufgaben: Geräte finden, Licht und Effekte steuern, Segmente verwalten, mit Skripten und VIS arbeiten.

## [Farbe und Helligkeit steuern](01.farbe.md)

- [Wie schreibe ich eine Farbe per Skript oder Blockly auf WLED?](01.farbe.md#write-colour-wled-script-blockly)
- [Wie dimme ich langsam hoch oder runter, und wie binde ich einen Dimmer ein?](01.farbe.md#dim-up-down-slowly-connect)
- [Wie steuere ich den Weißkanal (RGBW, SK6812, warmweiß)?](01.farbe.md#control-white-channel-rgbw-sk6812)

## [Effekte und Presets nutzen](02.effekte-und-presets.md)

- [Wie schalte ich WLED-Presets per Datenpunkt (ps) in VIS, Blockly oder Skript?](02.effekte-und-presets.md#switch-wled-presets-via-ps)
- [Wie wechsle ich per Taste oder Skript nacheinander durch Presets?](02.effekte-und-presets.md#step-through-presets-button-script)
- [Wie starte ich eine WLED-Playlist über den Adapter?](02.effekte-und-presets.md#start-wled-playlist-through-adapter)
- [Wo finde ich die Nummern und Namen von Effekten und Paletten für Skripte?](02.effekte-und-presets.md#numbers-names-effects-palettes-scripts)
- [Wie steuere ich den Effekt "Percent" und zeige einen Wert als Balken an?](02.effekte-und-presets.md#control-percent-effect-show-value)
- [Wie ändere ich den Text des Effekts "Scrolling Text" oder den Segmentnamen?](02.effekte-und-presets.md#change-text-scrolling-text-effect)
- [Wie bleiben Effekt und Palette nach einem Stromausfall erhalten, und wie startet WLED danach?](02.effekte-und-presets.md#effect-palette-survive-power-loss)

## [Segmente und einzelne LEDs](03.segmente-und-einzelne-leds.md)

- [Wie lege ich Segmente aus ioBroker an und lösche sie, und kann ein Preset nur einen Teil des Streifens nutzen?](03.segmente-und-einzelne-leds.md#create-delete-segments-iobroker-preset)
- [Wie viele Segmente kann ich anlegen, wenn ich einzelne LEDs ansteuern will?](03.segmente-und-einzelne-leds.md#many-segments-create-want-control)
- [Wie steuere ich einzelne LEDs per JSON ohne Segmente?](03.segmente-und-einzelne-leds.md#control-single-leds-via-json)
- [Wie steuere ich mehrere Segmente mit einem Farbregler?](03.segmente-und-einzelne-leds.md#control-several-segments-one-colour)

## [JSON- und HTTP-Befehle senden](04.befehle-an-wled.md)

- [Wie sende ich einen kompletten JSON-Befehl an WLED aus ioBroker?](04.befehle-an-wled.md#send-complete-json-command-wled)
- [Wie sende ich JSON per Skript (axios oder httpPost) direkt an WLED?](04.befehle-an-wled.md#send-json-script-axios-httppost)
- [Wie sende ich rohe WLED-HTTP-API-Befehle (rawCommand)?](04.befehle-an-wled.md#send-raw-wled-http-api)

## [Geräte verwalten](05.geraete-verwalten.md)

- [Wie entferne ich ein WLED-Gerät aus dem Adapter?](05.geraete-verwalten.md#remove-wled-device-adapter)
- [Wie gehe ich mit ausgeschalteten oder offline Geräten um, und wie werde ich die Log-Meldungen los?](05.geraete-verwalten.md#deal-switched-off-offline-devices)
- [Was passiert mit Befehlen an ein ausgeschaltetes Gerät?](05.geraete-verwalten.md#happens-commands-sent-switched-off)

## [Skripte mit Blockly und JavaScript](06.skripte.md)

- [Wie steuere ich WLED per JavaScript, regelmäßig oder schrittweise (zum Beispiel Sonnenaufgang)?](06.skripte.md#control-wled-javascript-periodically-step)
- [Wie finde ich WLED-Datenpunkte im Skript-Selektor über die Rolle switch.light?](06.skripte.md#wled-states-script-selector-through)
- [Wie baue ich eine Garagentor-Beleuchtung mit WLED-Presets?](06.skripte.md#build-garage-door-lighting-wled)
- [Wie schalte ich WLED nach einer Zeit automatisch aus (Timer)?](06.skripte.md#switch-wled-off-automatically-after)
- [Wie zeige ich Status oder Countdown auf dem Streifen an?](06.skripte.md#show-status-countdown-strip)
- [Wie schalte ich WLED-Presets per Automatik, zum Beispiel per Bewegungsmelder?](06.skripte.md#switch-wled-presets-automatically-example)
- [Wie speichere ich den Zustand und stelle ihn nach einer Animation wieder her?](06.skripte.md#save-state-restore-after-animation)
- [Woran erkenne ich, ob WLED per Telegram, VIS oder Web-Oberfläche geschaltet wurde?](06.skripte.md#tell-whether-wled-was-switched)

## [VIS, Alexa, Google Home und Apple Home](07.vis-und-smarthome.md)

- [Gibt es eine fertige VIS-Ansicht für die WLED-Steuerung?](07.vis-und-smarthome.md#ready-made-vis-view-wled)
- [Welchen Datenpunkt nehme ich für den Farbwähler in VIS, und wie zeige ich die aktuelle Farbe an?](07.vis-und-smarthome.md#state-use-colour-picker-vis)
- [Wie wähle ich Effekt und Palette in VIS als Dropdown?](07.vis-und-smarthome.md#choose-effect-palette-vis-as)
- [Wie binde ich WLED in den iot-Adapter ein und schalte Effekte, Presets und Farbe per Alexa oder Google Home?](07.vis-und-smarthome.md#connect-wled-iot-adapter-switch)
- [Wie bekomme ich einen Farbwähler für WLED in Apple Home (Yahka)?](07.vis-und-smarthome.md#colour-picker-wled-apple-home)

[Zurück zur Übersicht](../README.md)
