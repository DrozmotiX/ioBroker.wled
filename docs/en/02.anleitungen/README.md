# How-to guides

Guides by task: finding devices, controlling light and effects, managing segments, working with scripts and VIS.

## [Controlling color and brightness](01.farbe.md)

- [How do I write a color to WLED from a script or Blockly?](01.farbe.md#write-colour-wled-script-blockly)
- [How do I dim up or down slowly, and how do I connect a dimmer?](01.farbe.md#dim-up-down-slowly-connect)
- [How do I control the white channel (RGBW, SK6812, warm white)?](01.farbe.md#control-white-channel-rgbw-sk6812)

## [Using effects and presets](02.effekte-und-presets.md)

- [How do I switch WLED presets via the state (ps) in VIS, Blockly or a script?](02.effekte-und-presets.md#switch-wled-presets-via-ps)
- [How do I step through presets one after another with a button or a script?](02.effekte-und-presets.md#step-through-presets-button-script)
- [How do I start a WLED playlist through the adapter?](02.effekte-und-presets.md#start-wled-playlist-through-adapter)
- [Where do I find the numbers and names of effects and palettes for scripts?](02.effekte-und-presets.md#numbers-names-effects-palettes-scripts)
- [How do I control the "Percent" effect and show a value as a bar?](02.effekte-und-presets.md#control-percent-effect-show-value)
- [How do I change the text of the "Scrolling Text" effect or the segment name?](02.effekte-und-presets.md#change-text-scrolling-text-effect)
- [How do effect and palette survive a power loss, and how does WLED start afterwards?](02.effekte-und-presets.md#effect-palette-survive-power-loss)

## [Segments and single LEDs](03.segmente-und-einzelne-leds.md)

- [How do I create and delete segments from ioBroker, and can a preset use only part of the strip?](03.segmente-und-einzelne-leds.md#create-delete-segments-iobroker-preset)
- [How many segments can I create if I want to control single LEDs?](03.segmente-und-einzelne-leds.md#many-segments-create-want-control)
- [How do I control single LEDs via JSON without segments?](03.segmente-und-einzelne-leds.md#control-single-leds-via-json)
- [How do I control several segments with one color picker?](03.segmente-und-einzelne-leds.md#control-several-segments-one-colour)

## [Sending JSON and HTTP commands](04.befehle-an-wled.md)

- [How do I send a complete JSON command to WLED from ioBroker?](04.befehle-an-wled.md#send-complete-json-command-wled)
- [How do I send JSON directly to WLED from a script (axios or httpPost)?](04.befehle-an-wled.md#send-json-script-axios-httppost)
- [How do I send raw WLED HTTP API commands (rawCommand)?](04.befehle-an-wled.md#send-raw-wled-http-api)

## [Managing devices](05.geraete-verwalten.md)

- [How do I remove a WLED device from the adapter?](05.geraete-verwalten.md#remove-wled-device-adapter)
- [How do I deal with devices that are switched off or offline, and how do I get rid of the log messages?](05.geraete-verwalten.md#deal-switched-off-offline-devices)
- [What happens to commands sent to a device that is switched off?](05.geraete-verwalten.md#happens-commands-sent-switched-off)

## [Scripts with Blockly and JavaScript](06.skripte.md)

- [How do I control WLED with JavaScript, periodically or step by step (for example a sunrise)?](06.skripte.md#control-wled-javascript-periodically-step)
- [How do I find WLED states in the script selector through the role switch.light?](06.skripte.md#wled-states-script-selector-through)
- [How do I build garage door lighting with WLED presets?](06.skripte.md#build-garage-door-lighting-wled)
- [How do I switch WLED off automatically after a while (timer)?](06.skripte.md#switch-wled-off-automatically-after)
- [How do I show a status or a countdown on the strip?](06.skripte.md#show-status-countdown-strip)
- [How do I switch WLED presets automatically, for example with a motion sensor?](06.skripte.md#switch-wled-presets-automatically-example)
- [How do I save the state and restore it after an animation?](06.skripte.md#save-state-restore-after-animation)
- [How can I tell whether WLED was switched via Telegram, VIS or the web interface?](06.skripte.md#tell-whether-wled-was-switched)

## [VIS, Alexa, Google Home and Apple Home](07.vis-und-smarthome.md)

- [Is there a ready-made VIS view for controlling WLED?](07.vis-und-smarthome.md#ready-made-vis-view-wled)
- [Which state do I use for the color picker in VIS, and how do I show the current color?](07.vis-und-smarthome.md#state-use-colour-picker-vis)
- [How do I choose the effect and the palette in VIS as a drop-down?](07.vis-und-smarthome.md#choose-effect-palette-vis-as)
- [How do I connect WLED to the iot adapter and switch effects, presets and color via Alexa or Google Home?](07.vis-und-smarthome.md#connect-wled-iot-adapter-switch)
- [How do I get a color picker for WLED in Apple Home (Yahka)?](07.vis-und-smarthome.md#colour-picker-wled-apple-home)

[Back to overview](../README.md)
