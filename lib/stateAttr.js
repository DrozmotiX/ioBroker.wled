const { write } = require('fs');

// Classification of all state attributes possible
const state_attrb = {
	// State object
	'Staircase': {
		name: 'Staircase',
	},
	'bottom-sensor': {
		name: 'Bottom Sensor',
		role: 'indicator.alarm ',
		write: true,
	},
	'cct': {
		name: 'White spectrum color temperature',
		role: 'state',
		write: true,
	},
	'lc': {
		name: 'Logical AND of all active segment\'s virtual light capabilities',
		role: 'state',
	},
	'seglc': {
		name: 'Segment supports (24 bit) RGB colors',
		role: 'state',
	},
	'frz': {
		name: 'frz',
		role: 'state',
		write: true
	},
	'txPower': {
		name: 'TX Power',
	},
	'resetReason0': {
		name: 'Reset reason',
	},
	'on': {
		name: 'On / Off',
		role: 'switch.light',
		write: true,
	},
	'bri': {
		name: 'Brightness of the light',
		role: 'level.brightness',
		min: 0,
		max: 255,
		write: true,
	},
	'transition': {
		name: 'Duration of the crossfade between different colors/brightness levels.',
		role: 'value.transition',
		write: true,
	},
	'ps': {
		name: 'ID of currently set preset',
		write: true,
	},
	'pl': {
		name: 'ID of currently set playlist',
		write: true,
	},
	'dur': {
		name: 'Duration of nightlight in minutes',
		write: true,
	},
	'fade': {
		name: 'Gradually dim over the course of the nightlight duration',
		write: true,
	},
	'tbri': {
		name: 'Target brightness of nightlight feature',
		role: 'value.brightness',
		write: true,
	},
	'send': {
		name: 'Send WLED broadcast (UDP sync) packet on state change',
		role: 'switch',
		write: true,
	},
	'recv': {
		name: 'Receive broadcast packets',
		role: 'switch',
		write: true,
	},
	'mainseg': {
		name: 'Main Segment',
		write: true,
	},
	'pss': {
		name: 'Bitwise indication of preset slots (0 - vacant, 1 - written). Always 0 in 0.11. Not changable. Removed in 0.11.1',
	},
	'fps': {
		name: 'Frames per Second',
	},
	'ndc': {
		name: 'Number of other WLED devices discovered on the network. -1 if Node discovery disabled. (since 0.12.0)'
	},
	'ip': {
		name: 'IP Address',
	},
	'of': {
		name: 'Offset (how many LEDs to rotate the virtual start of the segments, available since 0.13.0)'
	},

	// State not included in  JSON response
	'tt': {
		name: 'Similar to transition, but applies to just the current API call.',
		type: 'mixed',
		write: true,
	},
	'psave': {
		name: 'Save current light config to specified preset slot',
		type: 'mixed',
		write: true,
	},
	'nn': {
		name: 'Dont send a broadcast packet (applies to just the current API call)',
		type: 'mixed',
		write: true,
	},

	//   segment object
	'id': {
		name: 'Zero-indexed ID of the segment',
		// write: true,
	},
	'start': {
		name: 'LED the segment starts at.',
		write: true,
	},
	'stop': {
		name: 'LED the segment stops at, not included in range',
		write: true,
	},
	'len': {
		name: 'Length of the segment (stop - start). stop has preference',
		write: true,
	},
	'fx': {
		name: 'ID of the effect ',
		write: true,
	},
	'f1x': {
		// name: 'ID of the effect ',
		write: true,
	},
	'f2x': {
		// name: 'ID of the effect ',
		write: true,
	},
	'f3x': {
		// name: 'ID of the effect ',
		write: true,
	},
	'sx': {
		name: 'Relative effect speed',
		write: true,
	},
	'ix': {
		name: 'Effect intensity',
		write: true,
	},
	'pal': {
		name: 'ID of the color palette',
		write: true,
	},
	'sel': {
		name: 'Selected segments will have their state (color/FX) updated ',
		type: 'boolean',
		role: 'switch',
		write: true,
	},
	'rev': {
		name: 'Flips the segment, causing animations to change direction',
		type: 'boolean',
		role: 'switch',
		write: true,
	},
	'cln': {
		name: 'Clones the segment with the given id, exactly mirroring its LED contents',
		write: true,
	},
	'Primary Color RGB': {
		name: 'Primary Color RGB',
		type: 'mixed',
		role: 'level.color.rgb',
		write: true,
	},
	'Secondary Color RGB (background)': {
		name: 'Secondary Color RGB (background)',
		type: 'mixed',
		role: 'level.color.rgb',
		write: true,
	},
	'Tertiary Color RGB': {
		name: 'Tertiary Color RGB',
		type: 'mixed',
		role: 'level.color.rgb',
		write: true,
	},
	'Primary Color HEX': {
		name: 'Primary Color HEX',
		type: 'mixed',
		role: 'level.color.hex',
		write: true,
	},
	'Secondary Color HEX (background)': {
		name: 'Secondary Color HEX (background)',
		type: 'mixed',
		role: 'level.color.hex',
		write: true,
	},
	'Tertiary Color HEX': {
		name: 'Tertiary Color HEX',
		type: 'mixed',
		role: 'level.color.hex',
		write: true,
	},
	'spc': {
		name: 'Spacing (how many LEDs are turned off and skipped between each group)',
		min: 0,
		max: 255,
		write: true,
	},
	'grp': {
		name: 'Grouping (how many consecutive LEDs of the same segment will be grouped to the same color)',
		min: 0,
		max: 255,
		write: true,
	},

	// Info object (all read only !)
	'connection': {
		name: 'Adapter working state',
		type: 'boolean',
		role: 'indicator.connected',
	},
	'Online status': {
		name: 'Device connection state',
		type: 'boolean',
		role: 'indicator.connected',
	},
	'ver': {
		name: 'Version name',
	},
	'vid': {
		name: 'Build ID (YYMMDDB, B = daily build index',
	},
	'count': {
		name: 'Total LED count',
		role: 'value',
	},
	'rgbw': {
		name: 'true if LEDs are 4-channel (RGBW)',
		type: 'boolean',
	},
	'pin': {
		name: 'LED strip pin(s). In 0.8.4, always one element',
		type: 'mixed',
	},
	'pwr': {
		name: 'Current LED power usage in milliamps as determined by the ABL. 0 if ABL is disabled',
		role: 'value.power',
		unit: 'mA'
	},
	'maxpwr': {
		name: 'Maximum power budget in milliamps for the ABL. 0 if ABL is disabled',
		role: 'value.power',
		unit: 'mA'
	},
	'maxseg': {
		name: 'Maximum number of segments supported by this version',
	},
	'name': {
		name: 'Friendly name of the light. Intended for display in lists and titles',
		type: 'mixed',
		role: 'info.name',
	},
	'udpport': {
		name: 'The UDP port for realtime packets and WLED broadcast',
		role: 'info.port',
	},
	'live': {
		name: 'If true, the software is currently receiving realtime data via UDP or E1.31',
		type: 'boolean',
	},
	'fxcount': {
		name: 'Number of effects included',
		type: 'mixed',
		role: 'info.name',
	},
	'palcount': {
		name: 'Number of palettes configured',
		type: 'mixed',
		role: 'info.name',
	},
	'bssid': {
		name: 'The BSSID of the currently connected network',
		type: 'mixed',
		role: 'info.address',
	},
	'signal': {
		name: 'Relative signal quality of the current connection',
		role: 'info.status',
	},
	'channel': {
		name: 'The current WiFi channel',
		role: 'info.address',
	},

	'arch': {
		name: 'Name of the platform.',
		type: 'mixed',
	},
	'core': {
		name: 'Version of the underlying (Arduino core) SDK',
		type: 'mixed',
	},
	'freeheap': {
		name: 'Bytes of heap memory (RAM) currently available. Problematic if <10k.',
		role: 'info.status',
	},
	'uptime': {
		name: 'Time since the last boot/reset in seconds',
		role: 'info.status',
	},
	'opt': {
		name: 'Used for debugging purposes only',
		type: 'mixed',
	},
	'brand': {
		name: 'The producer/vendor of the light. Always WLED for standard installations.',
		type: 'mixed',
		role: 'info.name    ',
	},
	'product': {
		name: 'The product name. Always DIY light for standard installations.',
		type: 'mixed',
		role: 'info.name',
	},
	'btype': {
		name: 'The origin of the build',
		type: 'mixed',
	},
	'mac': {
		name: 'The hexadecimal hardware MAC address of the light, lowercase and without colons',
		type: 'string',
		role: 'info.mac',
	},
	'u': {
		name: 'fsBytesUsed in kB',
		unit: 'kB',
	},
	't': {
		name: 'fsBytesTotal in kB',
		unit: 'kB',
	},
	'pmt': {
		name: 'presetsModifiedTime',
	},
	'rem': {
		name: 'Remaining nightlight in seconds',
		unit: 's',
	},
	'lwip': {
		// To be added
	},
	'rssi': {
		// To be added
	},
	'str': {
		// To be added
	},
	'segblock': {
		// To be added
	},
	'wv': {
		// To be added
	},
	'max': {
		// To be added
	},
	'min': {
		// To be added
	},
	'time': {
		name: 'Set module time to unix timestamp.',
		type: 'mixed',
		role: 'info.date',
	},
	'seglock': {
		// To be added
	},
	'lor': {
		name: 'Live data override. 0 is off, 1 is override until live data ends, 2 is override until ESP reboot (available since 0.10.0)',
		type: 'number',
		write: true,
	},
	'lip': {
		name: 'Realtime data source IP address',
	},
	'lm': {
		name: 'Info about the realtime data source',
	},
	'ws': {
		name: 'Number of currently connected WebSockets clients. -1 indicates that WS is unsupported in this build.',
	},
	'mode': {
		name: 'Nightlight mode',
	},
	'mi': {
		name: 'Mirrors the segment (available since 0.10.2)',
	},
	'liveseg': {
		name: 'Unknown',
		type: 'number',
	},
	'm12': {
		name: 'Unknown',
		type: 'number',
		//Setting of segment field 'Expand 1D FX'. (0: Pixels, 1: Bar, 2: Arc, 3: Corner)
	},
	'si': {
		name: 'SoundSimulation',
		type: 'number',
		//Setting of the sound simulation type for audio enhanced effects. (0: 'BeatSin', 1: 'WeWillRockYou', 2: '10_3', 3: '14_3') (as of 0.14.0-b1, there are these 4 types defined)
	},
	'o1': {
		name: 'Option1',
		type: 'boolean',
	},
	'o2': {
		name: 'Option2',
		type: 'boolean',
	},
	'o3': {
		name: 'Option3',
		type: 'boolean',
	},
	'c1': {
		name: 'c1',
		type: 'string',
		write: true,
	},
	'c2': {
		name: 'c2',
		type: 'string',
		write: true,
	},
	'c3': {
		name: 'c3',
		type: 'string',
		write: true,
	},
	'cpalcount': {
		name: 'Unknown',
		type: 'number',
	},
	'temp': {
		//only for integrated 1 Wire Temp Sensor on ESP
		name: 'temp',
		type: 'number',
	},
	'Temperature': {
		//only for integrated 1 Wire Temp Sensor on ESP
		name: 'Temperature',
		type: 'number',
	},
	'0': {
		name: 'Unknown',
		type: 'number',
	},
	'n': {
		name: 'Name of Segment',
		//also used for the displayed Text when effect is scrolling text
		type: 'string',
		write: true,
	},
	'set': {
		name: 'set',
		type: 'number',
	},
	'rgrp': {
		name: 'Receive Group',
		//Bitfield for broadcast receive groups 1-8
		type: 'number',
	},
	'action': {
		name: 'Command Json',
		type: 'string',
		role: 'json',
		write: true,
	}
};

module.exports = state_attrb;
