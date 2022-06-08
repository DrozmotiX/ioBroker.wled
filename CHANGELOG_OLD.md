# Older changes
## 0.6.0 (2021-08-31) - Support Websocket connections
* (DutchmanNL) System load reduced
* (DutchmanNL) All warnings related to JS-Controller 3.x checks solved
* (DutchmanNL) Ensure legacy support of WLED FW < 0.12 (fallback to http-API instead of websocket)
* (DutchmanNL) Communication by websocket implemented, this feature allows live data updates (instead of interval polling). Requires WLED firmware >= 12

## 0.5.9 (2021-08-11)
* (DutchmanNL) added new state attributes reported by Sentry
* (DutchmanNL) added min & max for brightness value to support iOT adapter

## 0.5.8 (2021-08-11)
* (DutchmanNL) added new state attributes reported by Sentry
* (DutchmanNL) Bugfix Live override datapoint created as read-only #252
* (DutchmanNL) excluded value "PIR" from data write due to current formatting

## 0.5.7 (2021-08-10)
* (foxriver76) we fixed some incorrect object types, fixes warnings with JS-Controller 3.3.x [#215](https://github.com/DrozmotiX/ioBroker.wled/issues/215) & [#209](https://github.com/DrozmotiX/ioBroker.wled/issues/209)
* (DutchmanNL) add support for WLED 0.13.x (added types fps, ndc, ip, of)

## 0.5.6 (2021-01-03)
* (DutchmanNL) Bugfix : State type definition for time and pmt

## 0.5.5 (2021-01-03)
* (DutchmanNL) add development option to disable sentry
* (DutchmanNL) split API calls, avoid not needed query's
* (DutchmanNL) Bugfix : issue with boolean attributes #40
* (DutchmanNL) add new state definition for WLED version 0.11
* (DutchmanNL) Bugfix : You are assigning a string to the state "wled.0.xxxx.seg.0.col.0

## 0.5.4 (2020-09-02)
* (DutchmanNL) Support WLED 0.10.2, new state definitions implemented
* (DutchmanNL) Update state definitions
* (DutchmanNL) Remove log messages for missing states (Sentry report only)
* (DutchmanNL) Bugfix : 0.5.3 decommissioned, update to 0.5.4 !

## 0.5.2 (2020-08-29)
* (DutchmanNL) Bugfix : Add missing Attributes with WLED 0.10.0

## 0.5.1 (20-04-2020) Avoid writing objects unnecessarily, Sentry implemented
* (DutchmanNL) Implement Sentry
* (DutchmanNL) Bugfix : Devicename
* (DutchmanNL) Bugfix : Warning with JS Controler 3.0.7
* (DutchmanNL) Bugfix : Avoid writing objects unnecessarily

## 0.5.0 Stable release
* (DutchmanNL) Added translations
* (DutchmanNL) Release to stable repository, beta testing finished

## 0.3.0 Bugfix : Correct handling of polling timer
* (DutchmanNL  & Jey-Cee) Bugfix : Polling timer not saved
* (DutchmanNL) Bugfix : Correct handling of "online" state
* (DutchmanNL) Bugfix : Polling timer (offline devices did not reconnect)

## 0.2.6 Bugfix : Hex state value change
* (DutchmanNL) Bugfix : Hex state value change

## 0.2.5 Stable release candidate
* (DutchmanNL) Code cleanup
* (DutchmanNL) Improved logging information
* (DutchmanNL) Make polling timer configurable
* (DutchmanNL) Correct handling of device online state
* (DutchmanNL) Show online state in instance configuration

## 0.2.0 Possibility to add devices by IP-adress
* (DutchmanNL) Bugfix io-package
* (DutchmanNL) Improved logging at adapter start
* (DutchmanNL) Possibility to add devices by IP-adress implemented. (Needed for situations were autoscan fails)
* (DutchmanNL) Ensure known devices get connected immediatly after adapter start instead of waiting for network scan

## 0.1.9 Code improvements
* (DutchmanNL) Code cleanup and optimalisation
* (DutchmanNL) FIX memory leak by proper handling of bonjour service

## 0.1.8 Bugfix
* (DutchmanNL) Solved incorrect formated API call at state changes causing warning message

## 0.1.7 Bugfix
* (DutchmanNL) Fixed error when API call fails (write warning to log and retry at intervall time)

## 0.1.6 HEX color states implemented
* (DutchmanNL) HEX color states implemented

## 0.1.5 Stable Beta release

## 0.1.2
* (DutchmanNL) Implement drop down menu for effects

## 0.1.1
* (DutchmanNL) Implemented states hidden from JSON-API : tt / psave / nn / time
* (DutchmanNL) Improve logging issue

## 0.1.0
* (DutchmanNL) initial release
