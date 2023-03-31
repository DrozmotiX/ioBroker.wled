'use strict';

/*
 * Created with @iobroker/create-adapter v1.21.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const rgbHex = require('rgb-hex'); // Lib to translate rgb to hex
const hexRgb = require('hex-rgb'); // Lib to translate hex to rgb
const WebSocket = require('ws'); // Lib to handle Websocket
const {default: axios} = require('axios'); // Lib to handle http requests
const bonjour = require('bonjour')(); // load Bonjour library

const stateAttr = require('./lib/stateAttr.js'); // Load attribute library

let watchDogStartDelay = null; // Timer to delay watchdog start
const watchdogTimer = {}; // Array containing all times for watchdog loops
const watchdogWsTimer = {}; // Array containing all times for WS-Ping loops
const stateExpire = {}; // Array containing all times for online state expire
const ws = {}; // Array containing websocket connections
const warnMessages = {}; // Array containing sentry messages

const disableSentry = false; // Ensure to set to true during development !

class Wled extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		// @ts-ignore
		super({
			...options,
			name: 'wled',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.devices = {};
		this.effects = {};
		this.palettes = {};
		this.createdStatesDetails = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Read already known devices
		await this.tryKnownDevices();

		// Run Autodetect (Bonjour - Service, mDNS to be handled)
		await this.scanDevices();

		// Set connection state to online when adapter is ready
		this.setState('info.connection', true, true);

		// Reset timer (if running) and start 10s delay to r un watchdog
		if (watchDogStartDelay) {
			clearTimeout(watchDogStartDelay);
			watchDogStartDelay = null;
		}
		watchDogStartDelay = setTimeout(() => {

			// Start watchdog for each  device
			for (const i in this.devices) {
				this.watchDog(i);
			}

			this.log.info('WLED initialisation finalized, ready to do my job have fun !');
		}, (10000));

	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {

			// Clear running polling timers
			if (watchDogStartDelay) {
				clearTimeout(watchDogStartDelay);
				watchDogStartDelay = null;
			}
			for (const device in watchdogWsTimer){
				if (watchdogWsTimer[device]) {
					clearTimeout(watchdogWsTimer[device]);
					delete watchdogWsTimer[device];
				}
			}
			for (const device in watchdogTimer){
				if (watchdogTimer[device]) {
					clearTimeout(watchdogTimer[device]);
					delete watchdogTimer[device];
				}
			}
			for (const device in stateExpire){
				if (stateExpire[device]) {
					clearTimeout(stateExpire[device]);
					delete stateExpire[device];
				}
			}

			// Close WebSocket connections
			for (const device in ws){
				try {
					// Close socket connection
					ws[device].close();
				} catch (error) {
					let message = error;
					if (error instanceof Error && error.stack != null) message = error.stack;
					this.log.error(`Error closing webSocket connection to ${device} | ${message}`);
				}
			}

			// Set all online states to false
			for (const i in this.devices) {
				this.setState(this.devices[i].mac + '._info' + '._online', {val: false, ack: true});
			}

			try {
				this.log.info('cleaned everything up...');
				this.setState('info.connection', false, true);
				callback();
			} catch (error) {
				this.errorHandler(`[onStateChange]`, error);
				this.setState('info.connection', false, true);
				callback();
			}

		} catch (error) {
			this.errorHandler(`[onStateChange]`, error);
		}

	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		try {

			if (state && state.ack === false) {
				// The state was changed and is not (yet) acknowledged
				this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

				// Split state name in segments to be used later
				const deviceId = id.split('.');

				// Prepare array's needed to send new states
				let values = null, rgb_all = null;

				// Build send command for state changes
				if (deviceId[4] === undefined) {
					this.log.debug('Send state');
					values = {
						[deviceId[3]]: state.val
					};
					this.log.debug('values 4 ' + JSON.stringify(values));

				} else {

					// Send command 1 - level  nesting
					if (deviceId[5] === undefined) {

						this.log.debug('Send nested state');

						// Send state change & value state forward to WLED API
						values = {
							[deviceId[3]]: {
								[deviceId[4]]: state.val
							}
						};
						this.log.debug('values 5 ' + JSON.stringify(values));
					}

					// Handle segments logic
					if (deviceId[3] === 'seg') {
						this.log.debug('Send seg');
						const valAsNumbers = parseFloat(deviceId[4]);
						this.log.debug('test number : ' + valAsNumbers);

						// Check if changed state is related to color
						if (deviceId[5] === 'col') {
							this.log.debug('Send col');
							const color_root = deviceId[2] + '.' + deviceId[3] + '.' + deviceId[4] + '.' + deviceId[5];
							this.log.debug(color_root);

							// Handle logic for HEX values, must be translated to RGB which is used by WLED
							if (deviceId[6] === '0_HEX' || deviceId[6] === '1_HEX' || deviceId[6] === '2_HEX') {

								this.log.debug('HEX color change initiated, convert to RGB and send data');

								try {

									// Get all 3 HEX values from states
									const colorPrimaryHex = await this.getStateAsync(color_root + '.0_HEX');
									if (!colorPrimaryHex) return;
									const colorSecondaryHex = await this.getStateAsync(color_root + '.1_HEX');
									if (!colorSecondaryHex) return;
									const colorTertiaryHex = await this.getStateAsync(color_root + '.1_HEX');
									if (!colorTertiaryHex) return;

									// Use library to translate HEX values into proper RGB
									//hex RGB calculate Alpha channel in 0 to 1 Wled need a value between 0 and 255 so the alpha channel from HEXRGB has to multiple by 255
									const colorPrimaryRGB = hexRgb(colorPrimaryHex.val);
									colorPrimaryRGB.alpha = colorPrimaryRGB.alpha*255
									const colorSecondaryRGB = hexRgb(colorSecondaryHex.val);
									colorSecondaryRGB.alpha = colorSecondaryRGB.alpha*255
									const colorTertiaryRGB = hexRgb(colorTertiaryHex.val);
									colorTertiaryRGB.alpha = colorTertiaryRGB.alpha*255

									// Build RGB JSON string to be send to WLED
									//add aditional Alpha channel when RGBW is used
									rgb_all = [
										[colorPrimaryRGB.red, colorPrimaryRGB.green, colorPrimaryRGB.blue,colorPrimaryRGB.alpha],
										[colorSecondaryRGB.red, colorSecondaryRGB.green, colorSecondaryRGB.blue,colorSecondaryRGB.alpha],
										[colorTertiaryRGB.red, colorTertiaryRGB.green, colorTertiaryRGB.blue,colorTertiaryRGB.alpha]
									];

									this.log.debug('Converted RGB values of HEX input : ' + colorPrimaryRGB + ' : ' + colorSecondaryRGB + ' : ' + colorTertiaryRGB);

								} catch (error) {
									this.log.error('Hex conversion failed : ' + error);
									return;
								}

								// Handle logic for RGB values, must be translated to RGB which is used by WLED
							} else if ((deviceId[6] === '0' || deviceId[6] === '1' || deviceId[6] === '2')) {

								this.log.debug('RGB color change initiated, convert to RGB and send data');

								try {

									// Get all 3 RGB values from states and ensure all 3 color's are always submitted in 1 JSON string !
									//Val String is [R,G,B] so the first part of array will be '[R' which will result in NAN on parseInt. The '[' has to be cut out of the string before split and parseInt
									let color_primary = await this.getStateAsync(color_root + '.0');
									if (!color_primary) return;
									this.log.debug('Primary color before split : ' + color_primary.val);
									try {
										color_primary.val = color_primary.val.replace("[","");
										color_primary = color_primary.val.split(',').map(s => parseInt(s));
									} catch (error) {
										if (!color_primary) return;
										color_primary = color_primary.val;
									}

									let color_secondary = await this.getStateAsync(color_root + '.1');
									if (!color_secondary) return;
									this.log.debug('Secondary color : ' + color_secondary.val);
									try {
										color_secondary.val = color_secondary.val.replace("[","");
										color_secondary = color_secondary.val.split(',').map(s => parseInt(s));
									} catch (error) {
										if (!color_secondary) return;
										color_secondary = color_secondary.val;
									}

									let color_tertiary = await this.getStateAsync(color_root + '.2');
									if (!color_tertiary) return;
									this.log.debug('Tertiary color : ' + color_tertiary.val);
									try {
										color_tertiary.val = color_tertiary.val.replace("[","");
										color_tertiary = color_tertiary.val.split(',').map(s => parseInt(s));
									} catch (error) {
										if (!color_tertiary) return;
										color_tertiary = color_tertiary.val;
									}

									this.log.debug('Color values from states : ' + color_primary + ' : ' + color_secondary + ' : ' + color_tertiary);

									// Build proper RGB array in WLED format with all 3 color states
									rgb_all = [color_primary, color_secondary, color_tertiary];

								} catch (error) {
									this.log.error(error);
									return;
								}

							}

							// Build JSON string to be send to WLED, cancel function if
							values = {
								'seg': {
									'id': valAsNumbers,
									'col': rgb_all
								}
							};

						} else {

							// Send state change & value state forward to WLED API
							values = {
								[deviceId[3]]: {
									id: valAsNumbers,
									[deviceId[5]]: state.val
								}
							};

						}
						this.log.debug('values segment ' + JSON.stringify(values));
					}
				}

				this.log.debug('Prepare API call for device : ' + deviceId[2] + ' and values + ' + values);
				let device_ip = await this.getForeignObjectAsync('wled.' + this.instance + '.' + deviceId[2]);
				if (!device_ip) return;
				device_ip = device_ip.native.ip;

				// Only make API call when values are correct
				if (values !== null && device_ip !== null) {

					// If websocket is connected, send message by websocket otherwise http-API
					if (this.devices[device_ip].wsConnected){
						this.log.debug(`Sending state change by websocket ${JSON.stringify(values)}`);

						ws[device_ip].send(JSON.stringify(values));
					} else {
						this.log.debug(`Sending state change by http-API ${JSON.stringify(values)}`);

						// Send API Post command
						const result = await this.postAPI('http://' + device_ip + '/json', values);
						if (!result) return;
						this.log.debug('API feedback' + JSON.stringify(result));

						if (result.success === true) {
							// Set state acknowledgement if  API call was successfully
							this.setState(id, {
								val: state.val,
								ack: true
							});
						}
					}
				}
			}

		} catch (error) {
			this.errorHandler(`[onStateChange]`, error);
		}
	}

	//ToDo: Review
	/**
	 * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	 * Using this method requires "common.message" property to be set to true in io-package.json
	 * @param {ioBroker.Message} obj
	 */
	async onMessage(obj) {

		try {
			// responds to the adapter that sent the original message
			const respond = (response, that) => {
				if (obj.callback)
					that.sendTo(obj.from, obj.command, response, obj.callback);
			};
			this.log.debug('Data from configuration received : ' + JSON.stringify(obj));

			//Response to manual adding of devices & device deletion
			switch (obj.command) {
				case 'addDevice':
					// Disable check of const declaration in case function
					// eslint-disable-next-line no-case-declarations
					const result = await this.getDeviceJSON(obj.message);
					this.log.debug('Response from Read Data : ' + JSON.stringify(result));
					if (result === 'success') {
						respond('success', this);

					} else {
						respond('failed', this);
					}
					break;
			}

		} catch (error) {
			this.errorHandler(`[onMessage]`, error);
		}
	}

	/**
	 * Websocket connection handler
	 * @param {string} deviceIP IP-Address of device
	 */
	async handleWebSocket(deviceIP){
		ws[deviceIP] = new WebSocket(`ws://${deviceIP}/ws`);

		// Websocket connected, handle routine to initiates all objects and states
		ws[deviceIP].on('open', () => {
			this.log.info(`${this.devices[deviceIP].name} connected`);
			this.devices[deviceIP].wsConnected = true;
			this.devices[deviceIP].wsPingSupported = false;
			// Request pong to handle watchdog
			ws[deviceIP].send('ping');
			// Option to subscribe live data
			// ws[deviceIP].send('{"lv":true}');
		});

		// Handle messages received from socket connection
		ws[deviceIP].on('message', async (data) => {
			this.log.debug(`Websocket WLED message received for ${deviceIP} : ${data}`);
			data = data.toString();
			try {
				if (data !== 'pong'){
					data = JSON.parse(data);
					if (data.state) await this.handleStates(data, deviceIP); // If message contains state updates, handle state data
				} else if (data === 'pong'){
					this.log.debug(`Pong received by websocket`);
					// Clear pong reset timer
					if (watchdogWsTimer[deviceIP]) {
						clearTimeout(watchdogWsTimer[deviceIP]);
						watchdogTimer[deviceIP] = null;
					}
					this.devices[deviceIP].wsPingSupported = true;
					this.devices[deviceIP].wsPong = true;

				} else {
					this.log.warn(`Unhandled message received ${data}`);
				}
			}  catch (error) {
				let message = error;
				if (error instanceof Error && error.stack != null) message = error.stack;
				this.log.error(`WebSocket message error for ${deviceIP} | ${message}`);
			}
		});

		// Handle closure of socket connection
		ws[deviceIP].on('close', () => {
			if (this.devices[deviceIP].wsSupported === true){
				this.log.info(`${this.devices[deviceIP].name} disconnected`);
				this.devices[deviceIP].connected = false;
				this.devices[deviceIP].initialized = false;
				this.devices[deviceIP].wsConnected = false;
			}
		});

		// Handle errors on socket connection
		ws[deviceIP].on('error', (error) => {

			// Optimise error messages
			if (error.message.includes('404')){
				this.log.warn(`Client ${deviceIP} does not support websocket, please consider upgrading your WLED firmware to >= 0.12. Switching to http-APi !`);
				this.devices[deviceIP].wsSupported = false;
			} else {
				this.log.error(`Websocket connection error : ${error}`);
			}
		});

	}

	/**
	 * Create basic device structure
	 * @param {string} deviceIP IP-Address of device
	 * @param {object} deviceData WLED info & state data
	 */
	async handleBasicStates(deviceIP, deviceData){
		try {
			const device_id = deviceData.info.mac;
			if (!this.devices[deviceIP]) this.devices[deviceIP] = {};

			this.devices[deviceIP].ip = deviceIP;
			this.devices[deviceIP].mac = deviceData.info.mac;
			this.devices[deviceIP].connected = false;
			this.devices[deviceIP].initialized = false;
			this.devices[deviceIP].name = deviceData.info.name;

			// Create Device, channel id by MAC-Address and ensure relevant information for polling and instance configuration is part of device object
			if (!this.devices[deviceIP].initialized){
				await this.extendObjectAsync(device_id, {
					type: 'device',
					common: {
						name: deviceData.info.name
					},
					native: {
						ip: deviceIP,
						mac: device_id,
					}
				});
			}

			// Store / Update effects
			try {
				const effects = deviceData.effects;
				// Store effects array
				this.effects[device_id] = {};
				for (const i in effects) {
					this.effects[device_id][i] = effects[i];
				}
			} catch (e){
				this.log.debug(`Cannot create effect dropdown`);
				this.errorHandler(`[handleBasicStates]`, `Cannot create effect dropdown`, true);
			}

			// Store / Update  pallets
			const palettes = deviceData.palettes;
			// Store pallets array
			this.palettes[device_id] = {};
			for (const i in palettes) {
				this.palettes[device_id][i] = palettes[i];
			}

			// Create additional states not included in JSON-API of WLED but available as SET command
			await this.create_state(device_id + '.tt', 'tt', '');
			await this.create_state(device_id + '.psave', 'psave', '');
			await this.create_state(device_id + '.udpn.nn', 'nn', '');
			await this.create_state(device_id + '.time', 'time', null);
			await this.create_state(device_id + '.time', 'time', null);

			// Create structure for all states
			await this.handleStates(deviceData, deviceIP);

		} catch (error) {
			this.errorHandler(`[handleBasicStates]`, error);
		}
	}

	/**
	 * Data handler
	 * @param {object} deviceData WLED info & state data
	 * @param {string} ipAddress IP Address of device
	 */
	async handleStates(deviceData,ipAddress ){
		try {
			const infoStates = deviceData.info;
			const deviceStates = deviceData.state;
			infoStates.ip = infoStates.ip !== undefined ? infoStates.ip : ipAddress;

			if (!this.devices[ipAddress].initialized) {
				await this.setObjectNotExistsAsync(infoStates.mac + '._info', {
					type: 'channel',
					common: {
						name: 'Basic information',
					},
					native: {},
				});
			}

			// Write data to info channel
			for (const i in infoStates) {

				// Create Info channels
				if (!this.devices[ipAddress].initialized) {

					// Create Channels for led and  wifi configuration
					switch (i) {
						case ('leds'):
							await this.setObjectNotExistsAsync(infoStates.mac + '._info.leds', {
								type: 'channel',
								common: {
									name: 'LED stripe configuration	',
								},
								native: {},
							});
							break;

						case ('wifi'):
							await this.setObjectNotExistsAsync(infoStates.mac + '._info.wifi', {
								type: 'channel',
								common: {
									name: 'Wifi configuration	',
								},
								native: {},
							});
							break;

						case ('u'):
							await this.localDeleteState(infoStates.mac + '._info.u');
							break;

						default:

					}
				}

				// Create states, ensure object structures are reflected in tree
				if (typeof (infoStates[i]) !== 'object') {

					// Default channel creation
					this.log.debug('State created : ' + i + ' : ' + JSON.stringify(infoStates[i]));
					await this.create_state(infoStates.mac + '._info.' + i, i, infoStates[i]);

				} else {
					for (const y in infoStates[i]) {
						this.log.debug(`State created : ${y} : ${JSON.stringify(infoStates[i][y])}`);
						await this.create_state(`${infoStates.mac}._info.${i}.${y}`, y, infoStates[i][y]);
					}
				}

			}

			// Write data of states
			for (const i in deviceStates) {

				this.log.debug('Datatype : ' + typeof (deviceStates[i]));

				// Create Channels for nested states
				switch (i) {
					case ('ccnf'):
						if (!this.devices[ipAddress].initialized) await this.setObjectNotExistsAsync(infoStates.mac + '.ccnf', {
							type: 'channel',
							common: {
								name: 'ccnf',
							},
							native: {},
						});
						break;

					case ('nl'):
						if (!this.devices[ipAddress].initialized) await this.setObjectNotExistsAsync(infoStates.mac + '.nl', {
							type: 'channel',
							common: {
								name: 'Nightlight',
							},
							native: {},
						});
						break;

					case ('udpn'):
						if (!this.devices[ipAddress].initialized) await this.setObjectNotExistsAsync(infoStates.mac + '.udpn', {
							type: 'channel',
							common: {
								name: 'Broadcast (UDP sync)',
							},
							native: {},
						});
						break;

					case ('seg'):

						this.log.debug('Segment Array : ' + JSON.stringify(deviceStates[i]));

						if (!this.devices[ipAddress].initialized) await this.setObjectNotExistsAsync(infoStates.mac + '.seg', {
							type: 'channel',
							common: {
								name: 'Segmentation',
							},
							native: {},
						});

						for (const y in deviceStates[i]) {

							if (!this.devices[ipAddress].initialized) await this.setObjectNotExistsAsync(infoStates.mac + '.seg.' + y, {
								type: 'channel',
								common: {
									name: 'Segment ' + y,
								},
								native: {},
							});

							for (const x in deviceStates[i][y]) {
								this.log.debug('Object states created for channel ' + i + ' with parameter : ' + y + ' : ' + JSON.stringify(deviceStates[i][y]));

								if (x !== 'col') {

									await this.create_state(infoStates.mac + '.' + i + '.' + y + '.' + x, x, deviceStates[i][y][x]);

								} else {
									this.log.debug('Naming  : ' + x + ' with content : ' + JSON.stringify(deviceStates[i][y][x][0]));

									// Translate RGB values to HEX
									//added additional Alpha channel, necessary if WLED is setup for RGBW Stripes. 
									//so on normal RGB Stripes Hex has 6 digits on RGBW Stripes Hex as 8 digits. The 2 additional digits for the white channel slider
									const primaryRGB = deviceStates[i][y][x][0].toString().split(',');
									const primaryHex = rgbHex(parseInt(primaryRGB[0]), parseInt(primaryRGB[1]), parseInt(primaryRGB[2]),isNaN(parseInt(primaryRGB[3]) /255) ? undefined : parseInt(primaryRGB[3]) /255);
									const secondaryRGB = deviceStates[i][y][x][1].toString().split(',');
									const secondaryHex = rgbHex(parseInt(secondaryRGB[0]), parseInt(secondaryRGB[1]), parseInt(secondaryRGB[2]),isNaN(parseInt(secondaryRGB[3]) /255) ? undefined : parseInt(secondaryRGB[3]) /255);
									const tertiaryRGB = deviceStates[i][y][x][2].toString().split(',');
									const tertiaryHex = rgbHex(parseInt(tertiaryRGB[0]), parseInt(tertiaryRGB[1]), parseInt(tertiaryRGB[2]), isNaN(parseInt(tertiaryRGB[3]) /255) ? undefined : parseInt(tertiaryRGB[3]) /255);


									// Write RGB and HEX information to states
									await this.create_state(infoStates.mac + '.' + i + '.' + y + '.' + x + '.0', 'Primary Color RGB', deviceStates[i][y][x][0]);
									await this.create_state(infoStates.mac + '.' + i + '.' + y + '.' + x + '.0_HEX', 'Primary Color HEX', '#' + primaryHex);
									await this.create_state(infoStates.mac + '.' + i + '.' + y + '.' + x + '.1', 'Secondary Color RGB (background)', deviceStates[i][y][x][1]);
									await this.create_state(infoStates.mac + '.' + i + '.' + y + '.' + x + '.1_HEX', 'Secondary Color HEX (background)', '#' + secondaryHex);
									await this.create_state(infoStates.mac + '.' + i + '.' + y + '.' + x + '.2', 'Tertiary Color RGB', deviceStates[i][y][x][2]);
									await this.create_state(infoStates.mac + '.' + i + '.' + y + '.' + x + '.2_HEX', 'Tertiary Color HEX', '#' + tertiaryHex);
								}
							}
						}

						break;

					case ('u'):
						await this.localDeleteState(infoStates.mac + '	.u');
						break;

					default:

				}

				// Create states, ensure object structures are reflected in tree
				if (typeof (deviceStates[i]) !== 'object') {

					// Default channel creation
					this.log.debug('Default state created : ' + i + ' : ' + JSON.stringify(deviceStates[i]));
					await this.create_state(infoStates.mac + '.' + i, i, deviceStates[i]);

				} else {

					for (const y in deviceStates[i]) {
						if (typeof (deviceStates[i][y]) !== 'object') {
							this.log.debug('Object states created for channel ' + i + ' with parameter : ' + y + ' : ' + JSON.stringify(deviceStates[i][y]));
							await this.create_state(infoStates.mac + '.' + i + '.' + y, y, deviceStates[i][y]);
						}
					}
				}
			}

			if (!this.devices[ipAddress].initialized) {
				this.devices[ipAddress].initialized = true;
				// Start websocket connection and and listen to state changes
				await this.handleWebSocket(ipAddress);
			}

			// Update device working state
			if (!this.devices[ipAddress].connected) this.devices[ipAddress].connected = true;
			this.create_state(infoStates.mac  + '._info' + '._online', `Online status`, true);

		} catch (error) {
			this.errorHandler(`[handleStates]`, error);
		}
	}

	/**
	 * Frequent watchdog to validate connection
	 * @param {string} deviceIP IP-Address of device
	 */
	async watchDog(deviceIP) {
		try {
			this.log.debug('Watchdog for ' + JSON.stringify(this.devices[deviceIP]));

			// Check if used WLED version supports websocket Ping-Pong messages and connection, if not handle watchdog by http-API
			if (this.devices[deviceIP].wsPingSupported) {
				if (this.devices[deviceIP].wsConnected) {
					try {
						// Send ping by websocket
						this.devices[deviceIP].wsPong = false;
						ws[deviceIP].send('ping');
						if (watchdogWsTimer[deviceIP]) {
							clearTimeout(watchdogWsTimer[deviceIP]);
							watchdogTimer[deviceIP] = null;
						}
						watchdogWsTimer[deviceIP] = setTimeout(() => {
							if (!this.devices[deviceIP].wsPong) {
								this.devices[deviceIP].initialized = false;
								this.devices[deviceIP].wsConnected = false;
								this.devices[deviceIP].wsConnected = false;
								// Update device working state
								if (this.devices[deviceIP].mac != null) {
									this.create_state(this.devices[deviceIP].mac + '._info' + '._online', 'Online status', false);
								}
							}
							// Close socket
							try {
								ws[deviceIP].close();
							} catch (e) {
								console.error(e);
							}

						}, (this.config.Time_Sync * 1000));

					} catch (e) {
						// Try http-API in case of error
						this.log.error(`WS Ping error : ${e}`);
						await this.getDeviceJSON(deviceIP);
					}
				} else { // If WS-Ping not supported, use http-API
					try {
						await this.getDeviceJSON(deviceIP);
					} catch (error) {
						this.errorHandler(`[watchDog]`, error);
					}
				}
			} else { // If WS-Ping not supported, use http-API
				try {
					await this.getDeviceJSON(deviceIP);
				} catch (error) {
					this.errorHandler(`[watchDog]`, error);

				}
			}

		} catch (error) {
			this.errorHandler(`[handleStates]`, error);
		}

		// Reset timer (if running) and start new one for next watchdog interval
		if (watchdogTimer[deviceIP]) {
			clearTimeout(watchdogTimer[deviceIP]);
			watchdogTimer[deviceIP] = null;
		}
		watchdogTimer[deviceIP] = setTimeout(() => {
			this.watchDog(deviceIP);
		}, (this.config.Time_Sync * 1000));

	}

	/**
	 * Request device data by http-API
	 * @param {string} deviceIP IP-Address of device
	 */
	async getDeviceJSON(deviceIP) {
		try {
			this.log.debug(`getDeviceJSON called for : ${deviceIP}`);

			try {

				const requestDeviceDataByAPI = async () => {
					const response = await axios.get(`http://${deviceIP}/json`, {timeout: 3000}); // Timout of 3 seconds for API call
					this.log.debug(JSON.stringify('API response data : ' + response.data));
					const deviceData = response.data;
					return deviceData;
				};

				// Check if connection is handled by websocket before proceeding
				if (this.devices[deviceIP]
					&& (this.devices[deviceIP].connected && this.devices[deviceIP].wsConnected && this.devices[deviceIP].wsPingSupported)) {
					// Nothing to do, device is connected by websocket and will handle state updates
				} else { // No Websocket connection, handle data by http_API

					const deviceData = await requestDeviceDataByAPI();

					// If device is initialised, only handle state updates otherwise complete initialisation
					if (this.devices[deviceIP]
						&& (this.devices[deviceIP].connected && this.devices[deviceIP].initialized)){

						if (!deviceData) {
							this.log.warn(`Heartbeat of device ${deviceIP} failed, will try to reconnect`);
							this.devices[deviceIP].connected = false;
							this.devices[deviceIP].initialized = false;
							this.devices[deviceIP].wsConnected = false;
							await this.create_state(this.devices[deviceIP].mac + '._info' + '._online', 'Online status', false);
							return 'failed';
						} else {
							this.log.debug(`Heartbeat of device ${deviceIP} successfully`);
							if (this.devices[deviceIP].connected && this.devices[deviceIP].wsConnected) {
								// Only reset heartbeat, device is connected by websocket and will handle state updates
								this.setStateChanged(this.devices[deviceIP].mac + '._info' + '._online', {val: true, ack: true});
								return 'success';
							} else {
								await this.handleStates(deviceData, deviceIP);
								this.devices[deviceIP].wsConnected = false;
								this.setStateChanged(this.devices[deviceIP].mac + '._info' + '._online', {val: true, ack: true});
								return 'success';
							}
						}

					} else {

						if (!deviceData) {
							this.log.warn(`Unable to initialise ${deviceIP} will retry in scheduled interval !`);
							this.devices[deviceIP].initialized = false;
							// Update device working state
							if (this.devices[deviceIP].mac != null) {
								await this.create_state(this.devices[deviceIP].mac + '._info' + '._online', 'Online status', {val: false, ack: true});
							}
							return 'failed';
						} else {
							this.log.debug('Info Data received from WLED device ' + JSON.stringify(deviceData));
							this.log.info(`Initialising : " ${deviceData.info.name}" on IP :  ${deviceIP}`);
							await this.handleBasicStates(deviceIP, deviceData);
							return 'success';
						}
					}

				}

			} catch (error) {

				if (this.devices[deviceIP] && this.devices[deviceIP].connected){
					this.log.warn(`Device ${deviceIP} offline, will try to reconnect`);
					if (this.devices[deviceIP].mac != null) {
						await this.create_state(this.devices[deviceIP].mac + '._info' + '._online', 'Online status', {val: false, ack: true});
					}
					this.devices[deviceIP].connected = false;
					this.devices[deviceIP].wsConnected = false;
					this.devices[deviceIP].initialized = false;
					try {
						ws[deviceIP].close();
					} catch (e) {
						console.error(e);
					}
				}
				return 'failed';
			}
		} catch (error) {
			this.errorHandler(`[getDeviceJSON]`, error);
		}
	}

	/**
	 * API post call to WLED device
	 * @param {string} url API url
	 * @param {object} values JSON data to send
	 */
	async postAPI(url, values) {
		this.log.debug('Post API called for : ' + url + ' and  values : ' + JSON.stringify(values));
		try {
			const result = axios.post(url, values)
				.then((response) => {
					return response.data;
				})
				.catch((error) => {
					this.log.error('Sending command to WLED device + ' + url + ' failed with error ' + error);
					return error;
				});
			return result;
		} catch (error) {
			this.errorHandler(`[postAPI]`, error);
		}
	}

	/**
	 * Try to contact to contact and read data of already known devices
	 */
	async tryKnownDevices() {

		try {
			const knownDevices = await this.getDevicesAsync();
			if (!knownDevices) return; // exit function if no known device are detected
			if (knownDevices.length > 0) this.log.info(`Try to contact ${knownDevices.length} known devices`);

			// Get IP-Address of known devices and try too establish connection
			for (const i in knownDevices) {
				const deviceIP = knownDevices[i].native.ip;

				this.log.info('Try to contact : "' + knownDevices[i].common.name + '" on IP : ' + deviceIP);

				// Add IP address to polling array
				this.devices[deviceIP] = {};
				this.devices[deviceIP].ip = knownDevices[i].native.ip;
				this.devices[deviceIP].mac = knownDevices[i].native.mac;
				this.devices[deviceIP].connected = false;
				this.devices[deviceIP].initialized = false;
				await this.getDeviceJSON(deviceIP);
			}
		}catch (error) {
			this.errorHandler(`[tryKnownDevices]`, error);
		}

	}

	/**
	 * Scan network with Bonjour service to detect new WLED devices
	 */
	async scanDevices() {
		try {
			// Browse and listen for WLED devices
			const browser = await bonjour.find({
				'type': 'wled'
			});
			this.log.info('Bonjour service started, new  devices  will  be detected automatically');

			// Event listener if new devices are detected
			browser.on('up', (data) => {
				const id = data.txt.mac;
				const ip = data.referer.address;

				// Check if device is already know
				if (this.devices[ip] == null) {
					this.log.info('New WLED  device found ' + data.name + ' on IP ' + data.referer.address);

					//  Add device to array
					this.devices[ip] = {};
					this.devices[ip].mac = id;
					this.devices[ip].ip = ip;
					this.log.debug('Devices array from bonjour scan : ' + JSON.stringify(this.devices));
					this.devices[ip].connected = false;
					// Initialize device
					this.getDeviceJSON(ip);
				} else {
					// Update ip information in case of change
					this.devices[ip].ip = ip;
				}
				this.log.debug('Devices array from bonjour scan : ' + JSON.stringify(this.devices));
			});
		} catch (error) {
			this.errorHandler(`[scanDevices]`, error);
		}
	}

	/**
	 * State create and value update handler
	 * @param {string} stateName ID of state to create
	 * @param {string} name Name of object
	 * @param {object} value Value
	 */
	async create_state(stateName, name, value) {
		this.log.debug('Create_state called for : ' + stateName + ' with value : ' + value);
		let deviceId = stateName.split('.');
		deviceId = deviceId[0];

		// Exclude write & creation of PIR value
		// if (name.substring(0,3) == 'PIR' ) return;

		try {

			// Try to get details from state lib, if not use defaults. throw warning is states is not known in attribute list
			const common = {};
			if (!stateAttr[name]) {
				const warnMessage = `State attribute definition missing for : ${name}`;
				if (warnMessages[name] !== warnMessage) {
					this.log.warn(`State attribute definition missing for : ${name} with value : ${value}`);
				}
			}

			if (stateAttr[name] !== undefined && stateAttr[name].min !== undefined){
				common.min = stateAttr[name].min;
			}
			if (stateAttr[name] !== undefined && stateAttr[name].max !== undefined){
				common.max = stateAttr[name].max;
			}

			common.name = stateAttr[name] !== undefined ? stateAttr[name].name || name : name;
			common.type = stateAttr[name] !== undefined ? stateAttr[name].type || typeof (value) : typeof (value) ;
			common.role = stateAttr[name] !== undefined ? stateAttr[name].role || 'state' : 'state';
			common.read = true;
			common.unit = stateAttr[name] !== undefined ? stateAttr[name].unit || '' : '';
			common.write = stateAttr[name] !== undefined ? stateAttr[name].write || false : false;

			if ((!this.createdStatesDetails[stateName])
				|| (this.createdStatesDetails[stateName]
					&& (
						common.name !== this.createdStatesDetails[stateName].name
						|| common.name !== this.createdStatesDetails[stateName].name
						|| common.type !== this.createdStatesDetails[stateName].type
						|| common.role !== this.createdStatesDetails[stateName].role
						|| common.read !== this.createdStatesDetails[stateName].read
						|| common.unit !== this.createdStatesDetails[stateName].unit
						|| common.write !== this.createdStatesDetails[stateName].write
					)
				)) {

				// console.log(`An attribute has changed : ${state}`);
				this.log.debug(`An attribute has changed : ${stateName} | old ${this.createdStatesDetails[stateName]} | new ${JSON.stringify(common)}`);

				await this.extendObjectAsync(stateName, {
					type: 'state',
					common
				});

			} else {
				// console.log(`Nothing changed do not update object`);
			}

			// Set value to state including expiration time
			if (value != null) {
				await this.setStateChangedAsync(stateName, {
					val: typeof value === 'object' ? JSON.stringify(value) : value, // real objects are not allowed
					ack: true,
				});
			}

			// Timer  to set online state to  FALSE when not updated during  2 time-sync intervals
			if (name === 'online') {
				// Clear running timer
				if (stateExpire[stateName]) {
					clearTimeout(stateExpire[stateName]);
					stateExpire[stateName] = null;
				}

				// timer
				stateExpire[stateName] = setTimeout(async () => {
					// Set value to state including expiration time
					await this.setState(stateName, {
						val: false,
						ack: true,
					});
					this.log.debug('Online state expired for ' + stateName);
				}, this.config.Time_Sync * 2000);
				this.log.debug('Expire time set for state : ' + name + ' with time in seconds : ' + this.config.Time_Sync * 2);
			}

			// Extend effects and color pal`let  with dropdown menu
			if (name === 'fx' && this.effects[deviceId] && !this.createdStatesDetails[stateName]) {

				this.log.debug('Create special drop down state with value ' + JSON.stringify(this.effects));
				await this.extendObjectAsync(stateName, {
					type: 'state',
					common: {
						states: this.effects[deviceId]
					}
				});

			} else if (name === 'pal' && this.palettes[deviceId] && !this.createdStatesDetails[stateName]) {

				// this.log.debug('Create special drop down state with value ' + JSON.stringify(this.effects));
				await this.extendObjectAsync(stateName, {
					type: 'state',
					common: {
						states: this.palettes[deviceId]
					}
				});
			}

			// Store current object definition to memory
			this.createdStatesDetails[stateName] = common;

			// Subscribe on state changes if writable
			common.write && this.subscribeStates(stateName);

		} catch (error) {
			this.errorHandler(`[create_state]`, error);
		}
	}

	/**
	 * Wrapper for error handling
	 * @param {string} source Message to send
	 * @param {any} error Error message (including stack) to handle exceptions
	 * @param {boolean=} debugMode - Error message (including stack) to handle exceptions
	 */
	errorHandler(source, error, debugMode) {
		let message = error;
		if (error instanceof Error && error.stack != null) message = error.stack;
		if (!debugMode) {
			this.log.error(`${source} ${error}`);
			this.sendSentry(`${message}`);
		} else {
			this.log.error(`${source} ${error}`);
			this.log.debug(`${source} ${message}`);
		}
	}

	/**
	 * Sentry error message handler
	 * @param {string} sentryMessage Message to send
	 */
	sendSentry(sentryMessage) {

		if (!disableSentry) {
			if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
				const sentryInstance = this.getPluginInstance('sentry');
				if (sentryInstance) {
					this.log.info(`[Error caught and sent to Sentry, thank you for collaborating!]  ${sentryMessage}`);
					sentryInstance.getSentryObject().captureException(sentryMessage);
				} else {
					this.log.error(`Sentry disabled, error caught : ${sentryMessage}`);
				}
			}
		} else {
			this.log.error(`Sentry disabled, error caught : ${sentryMessage}`);
		}
	}

	/**
	 * Ensure proper deletion of state and object
	 * @param {string} state ID of object to delete
	 */
	async localDeleteState(state) {
		try {

			const obj = await this.getObjectAsync(state);
			if (obj) {
				await this.delObjectAsync(state, {recursive:true});
			}

		} catch (error) {
			// do nothing
		}
	}
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Wled(options);
} else {
	// otherwise start the instance directly
	new Wled();
}
