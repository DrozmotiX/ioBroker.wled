'use strict';

/*
 * Created with @iobroker/create-adapter v1.21.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios');
const state_attr = require(__dirname + '/lib/state_attr.js');
const bonjour = require('bonjour')();
// const fs = require('fs');

let polling; // Polling timer
let scan_timer; 

class Wled extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'wled',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
		this.devices = {};
		this.effects = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Connection state should be zero at lunch, only true if at least 1 device is connected
		this.setState('info.connection', true, true);

		// Run Autodetect (Bonjour - Service, mDNS to be handled)
		await this.scan_devices();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.debug('cleaned everything up...');
			this.setState('info.connection', false, true);
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (state  && state.ack === false) {
			
			// The state was changed
			this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			const deviceId = id.split('.');
			this.log.silly('x row contet 2 : ' + deviceId[2]);
			this.log.silly('x row contet 3 : ' + deviceId[3]);
			this.log.silly('x row contet 4 : ' + deviceId[4]);
			this.log.silly('x row contet 5 : ' + deviceId[5]);
			this.log.silly('x row contet 6 : ' + deviceId[6]);
			this.log.silly('x row contet 7 : ' + deviceId[7]);

			const device = this.devices[deviceId[2]];
			let values = null;
			this.log.debug('values ' + JSON.stringify(values));
			// Send command for state changes
			if (deviceId[4] === undefined) {
				this.log.debug('Send state');
				values = {
					[deviceId[3]]:state.val
				};
				this.log.debug('values 4 ' + JSON.stringify(values));
				
			} else {

				// Send command 1 - level  nestinng
				if (deviceId[5] === undefined) {
					this.log.debug('Send nested state');

					values = {
						[deviceId[3]] : {
							[deviceId[4]]:state.val
						}};
					this.log.debug('values 5 ' + JSON.stringify(values));
				}

				// // Handle segments	
				if (deviceId[3] === 'seg') {
					this.log.debug('Send seg');
					const valAsNumbers = parseFloat(deviceId[4]);
					this.log.debug('test number : ' + valAsNumbers);
					if (deviceId[5] === 'col'){
						this.log.debug('Send col');
						// const valAsNumbers = state.val.split(',').map(s => parseInt(s));
						const  color_root = deviceId[2] + '.' + deviceId[3] + '.' + deviceId[4] + '.' + deviceId[5];
						this.log.debug(color_root);
						try {
						
							let color_primary = await  this.getStateAsync(color_root + '.0');
							if(!color_primary)  return;
							color_primary = color_primary.val.split(',').map(s => parseInt(s));
	
							let color_secondary = await  this.getStateAsync(color_root + '.1');
							if(!color_secondary)  return;
							color_secondary = color_secondary.val;
	
							let color_tertiary = await  this.getStateAsync(color_root + '.2');
							if(!color_tertiary)  return;
							color_tertiary = color_tertiary.val;
	
							this.log.debug('Color values from states : ' + color_primary + ' : ' + color_secondary + ' : ' + color_tertiary);
							
							const rgb_all = [color_primary , color_secondary , color_tertiary];
														
	
							values = {
								'seg': {
									'id': valAsNumbers, 
									'col':rgb_all
								}};

									
						} catch (error) {
							this.log.error(error);
						}
					} else {

						values = {
							[deviceId[3]] : {
								id:valAsNumbers,
								[deviceId[5]]:state.val
							}};	


					}
					this.log.debug('values segment ' + JSON.stringify(values));
				}
			}  

			this.log.debug('Prepare API call for device : ' + device + ' and values + ' + values); 

			// Only make API call when values are correct
			if (values !== null) {
				// Send API Post command
				const result = await this.postAPI('http://' +  device + '/json', values);
				if (!result) return;

				this.log.debug('API feedback' + JSON.stringify(result));
				if (result.success === true){
					// Set state aknowledgement if  API call was succesfully
					this.setState(id, {ack : true});
				}
			}

		} else {
			// The state was deleted
			// 	this.log.info(`state ${id} deleted`);
		}
	}

	async read_data(device){
		
		// Handle object arrays from WLED API
		/** @type {Record<string, any>[]} */
		// const objArray = JSON.parse(body);

		// Error handling needed!
		try {

			const objArray = await this.getAPI('http://' + this.devices[device] + '/json');
			const device_id = objArray['info'].mac;	
			this.log.debug ('Data received from WLED device ' + device_id + ' : ' + JSON.stringify(objArray));

			// Create Device, channel id by MAC-Adress
			await this.setObjectNotExistsAsync(device_id, {
				type: 'device',
				common: {
					name: objArray['info'].name,
				},
				native: {},
			});

			// Update adapter workig state, set connection state to true if at least  1 device is connected
			await this.create_state('info.connection', 'connection', true);

			// Update device workig state
			await this.create_state(device_id + '._info' + '._online', 'online', true);
			
			// build effects array

			for (const i in objArray.effects) {

				this.effects[i] = objArray.effects[i];
			}

			// Read info Channel
			for (const i in objArray['info']){

				this.log.debug('Datatype : ' + typeof(objArray['info'][i]));

				// Create Info channel
				await this.setObjectNotExistsAsync(device_id + '._info', {
					type: 'channel',
					common: {
						name: 'Basic information',
					},
					native: {},
				});

				// Create Chanels for led and  wifi configuration
				switch (i) {
					case ('leds'):
						this.setObjectNotExistsAsync(device_id + '._info.leds', {
							type: 'channel',
							common: {
								name: 'LED stripe configuration	',
							},
							native: {},
						});
						
						break;

					case ('wifi'):
						this.setObjectNotExistsAsync(device_id + '._info.wifi', {
							type: 'channel',
							common: {
								name: 'Wifi configuration	',
							},
							native: {},
						});
						
						break;

					default:
						
				}

				// Create states, ensure object structures are reflected in tree
				if (typeof(objArray['info'][i]) !== 'object'){

					// Default channel creation
					this.log.debug('State created : ' +i + ' : ' + JSON.stringify(objArray['info'][i]));
					this.create_state(device_id + '._info.' + i ,i,objArray['info'][i],true);

				} else {
					for (const y in objArray['info'][i]){
						this.log.debug('State created : ' + y + ' : ' + JSON.stringify(objArray['info'][i][y]));
						this.create_state(device_id + '._info.' + i + '.' + y,y,objArray['info'][i][y],true);
					}
				}

			}
			
			// Read state Channel
			for (const i in objArray['state']){

				this.log.debug('Datatype : ' + typeof(objArray['state'][i]));

				// Create Chanels for led and  wifi configuration
				switch (i) {
					case ('ccnf'):
						this.setObjectNotExistsAsync(device_id + '.ccnf', {
							type: 'channel',
							common: {
								name: 'ccnf',
							},
							native: {},
						});
						
						break;

					case ('nl'):
						this.setObjectNotExistsAsync(device_id + '.nl', {
							type: 'channel',
							common: {
								name: 'Nightlight',
							},
							native: {},
						});
						
						break;

					case ('udpn'):
						this.setObjectNotExistsAsync(device_id + '.udpn', {
							type: 'channel',
							common: {
								name: 'Broadcast (UDP sync)',
							},
							native: {},
						});
						
						break;

					case ('seg'):

						this.log.debug('Segment Array : ' + JSON.stringify(objArray['state'][i]));

						this.setObjectNotExistsAsync(device_id + '.seg', {
							type: 'channel',
							common: {
								name: 'Segmentation',
							},
							native: {},
						});

						for (const y in objArray['state'][i]){

							this.setObjectNotExistsAsync(device_id + '.seg.' + y, {
								type: 'channel',
								common: {
									name: 'Segment ' + y,
								},
								native: {},
							});

							for (const x in objArray['state'][i][y]){
								this.log.debug('Object states created for channel ' + i + ' with parameter : ' + y + ' : ' + JSON.stringify(objArray['state'][i][y]));

								if ( x !== 'col'){

									this.create_state(device_id + '.' + i + '.' + y + '.' + x , x,objArray['state'][i][y][x],true);

								} else {
									this.log.debug('Naming  : ' + x + ' with content : ' + JSON.stringify(objArray['state'][i][y][x][0]));
									this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.0', 'Primary Color',objArray['state'][i][y][x][0],true);	
									this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.1', 'Secondary Color (background)',objArray['state'][i][y][x][1],true);
									this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.2', 'Tertiary Color',objArray['state'][i][y][x][2],true);
								}
							}
						}
						
						break;

					default:
						
				}

				// Create states, ensure object structures are reflected in tree
				if (typeof(objArray['state'][i]) !== 'object'){

					// Default channel creation
					this.log.debug('Default state created : ' +i + ' : ' + JSON.stringify(objArray['state'][i]));
					this.create_state(device_id + '.' + i ,i,objArray['state'][i],true);

				} else {
					
					for (const y in objArray['state'][i]){
						if (typeof(objArray['state'][i][y]) !== 'object'){
							this.log.debug('Object states created for channel ' + i + ' with parameter : ' + y + ' : ' + JSON.stringify(objArray['state'][i][y]));
							this.create_state(device_id + '.' + i + '.' + y,y,objArray['state'][i][y],true);
						}
					}
				}
			}

			// Create additional  states not included in JSON-API of WLED
			this.create_state(device_id + '.tt','tt',null,true);
			this.create_state(device_id + '.psave','psave',null,true);
			this.create_state(device_id + '.udpn.nn','nn',null,true);
			this.create_state(device_id + '.time','time',null,true);

		} catch (error) {
			
			// Set alive state to false if device is not reachable
			this.setState(device + '._info' + '._online', {val : false, ack : true});
		
		}
		
	}

	async polling_timer(){

		this.log.debug('polling timer for  devices : ' + JSON.stringify(this.devices));
		// Reset timer (if running) and start new one for next polling intervall
		( ()  => {if (polling) {clearTimeout(polling); polling = null;}})();
		polling = setTimeout( () => {
			
			for (const i in this.devices) {
				// ( ()  => {if (polling[this.devices[i]]) {clearTimeout(polling[this.devices[i]]); polling[this.devices[i]] = null;}})();
		
				this.read_data(i);
				this.log.debug('Getting data for ' + i);
				
			}
			this.polling_timer();
		}, (this.config.Time_Sync * 1000));
		
	}

	async getAPI(url) {

		try {
			const response = await axios.get(url);
			this.log.debug(JSON.stringify('API response data : ' + response.data));
			return response.data;
		} catch (error) {
			// this.log.error(error);
		}
	}

	async postAPI(url, values) {
		this.log.debug('Post API called for : ' + url + ' and  values : ' + JSON.stringify(values));
		try {
			// this.log.info('Post sent')

			const result = axios.post(url, values)
				.then( (response) => {
					return response.data;
				})
				.catch( (error) => {
					this.log.error('Sending command to WLED device + ' + url + ' failed with error ' + error);
					return error;
				});	
			return result;
		} catch (error) {
			this.log.error(error);
		}
	}
	
	// Scan network  with Bonjour service and build array for data-polling
	async scan_devices(){
		// browse for all wled devices
		await bonjour.find({'type': 'wled'}, (service) => {
		
			const id = service.txt.mac;
			const ip = service.referer.address;

			// Check if device is already know
			if (this.devices[id] === undefined) {
				this.log.info('Device ' + service.name + ' found on IP ' + service.referer.address);
				//  Add device to polling array
				this.devices[id] = ip;
				// Initialize device
				this.read_data(id);
			} else {
				// Update memory with current ip address
				this.devices[id] = ip;
			}

			this.log.debug('Devices array from bonjour scan : ' + JSON.stringify(this.devices));
			this.polling_timer();
		});

		// Rerun scan every minute
		(function () {if (scan_timer) {clearTimeout(scan_timer); scan_timer = null;}})();
		scan_timer = setTimeout( () => {
			this.scan_devices();

			// intervall should be configurable
		}, (this.config.Time_Scan * 1000));
 
	}

	async create_state(state, name, value, expire){
		this.log.debug('Create_state called for : ' + state + ' with value : ' + value);

		try {

			// Try to get details from state lib, if not use defaults. throw warning is states is not known in attribute list
			if((state_attr[name] === undefined)){this.log.warn('State attribute definition missing for + ' + name);}
			const writable = (state_attr[name] !== undefined) ?  state_attr[name].write || false : false;
			const state_name = (state_attr[name] !== undefined) ?  state_attr[name].name || name : name;
			const role = (state_attr[name] !== undefined) ?  state_attr[name].role || 'state' : 'state';
			const type = (state_attr[name] !== undefined) ?  state_attr[name].type || 'mixed' : 'mixed';
			const unit = (state_attr[name] !== undefined) ?  state_attr[name].unit || '' : '';
			this.log.debug('Write value : ' + writable);

			await this.setObjectNotExistsAsync(state, {
				type: 'state',
				common: {
					name: state_name,
					role: role,
					type: type,
					unit: unit,
					write : writable
				},
				native: {},
			});

			await this.setState(state, {val: value, ack: true, expire: ((this.config.Time_Sync * 1000 ) * 2)});

			if (name === 'fx') {

				this.log.debug('Create special drop donwn state with value ' + JSON.stringify(this.effects));

				await this.extendObjectAsync(state, {
					type: 'state',
					common: {
						states : this.effects
					}
				});

			}

			// Subscribe on state changes if writable
			if (writable === true) {this.subscribeStates(state);}

		} catch (error) {
			this.log.error('Create state error = ' + error);
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