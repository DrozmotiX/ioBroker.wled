'use strict';

/*
 * Created with @iobroker/create-adapter v1.21.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const dmWled = require('./lib/devicemgmt.js');

// Load your modules here, e.g.:
const rgbHex = require('rgb-hex'); // Lib to translate rgb to hex
const hexRgb = require('hex-rgb'); // Lib to translate hex to rgb
const WebSocket = require('ws'); // Lib to handle Websocket
const { default: axios } = require('axios'); // Lib to handle http requests
const bonjour = require('bonjour')(); // load Bonjour library

const stateAttr = require('./lib/stateAttr.js'); // Load attribute library

// Device ID pattern for WLED devices (MAC address format)
const DEVICE_ID_PATTERN = /^wled\.\d+\.[0-9A-F]{12}$/i;

let watchDogStartDelay = null; // Timer to delay watchdog start
const watchdogTimer = {}; // Array containing all times for watchdog loops
const watchdogWsTimer = {}; // Array containing all times for WS-Ping loops
const stateExpire = {}; // Array containing all times for online state expire
const ws = {}; // Array containing websocket connections
const warnMessages = {}; // Array containing sentry messages
const deviceRetryCount = {}; // Array containing retry counts for failed devices
const deviceRetryDelay = {}; // Array containing current retry delays for failed devices

const disableSentry = false; // Ensure to set to true during development !

class Wled extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options]
     */
    constructor(options) {
        // @ts-expect-error parent is a valid property on module but types don't include it
        super({
            ...options,
            name: 'wled',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.devices = {};
        this.effects = {};
        this.palettes = {};
        this.createdStatesDetails = {};
        this.bonjourBrowser = null;

        this.deviceManagement = new dmWled(this);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        await this.resetOnlineStates();

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
        }, 10000);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            // Clear adapter-level polling timer
            if (watchDogStartDelay) {
                clearTimeout(watchDogStartDelay);
                watchDogStartDelay = null;
            }

            // Set all online states to false and clean up each device
            for (const ip in this.devices) {
                if (this.devices[ip]?.mac) {
                    this.setState(`${this.devices[ip].mac}._info._online`, false, true);
                }
                // Use the centralized cleanup method for each device
                this.cleanupDeviceBackend(ip, this.devices[ip]?.mac);
            }

            // Stop Bonjour browser
            if (this.bonjourBrowser) {
                try {
                    this.bonjourBrowser.stop();
                    this.bonjourBrowser = null;
                } catch (error) {
                    let message = error;
                    if (error instanceof Error && error.stack != null) {
                        message = error.stack;
                    }
                    this.log.error(`Error stopping Bonjour browser | ${message}`);
                }
            }

            try {
                this.log.info('cleaned everything up...');
                this.setState('info.connection', false, true);
                callback();
            } catch (error) {
                this.errorHandler(`[onUnload]`, error);
                this.setState('info.connection', false, true);
                callback();
            }
        } catch (error) {
            this.errorHandler(`[onUnload]`, error);
        }
    }

    /**
     * Is called if a subscribed state changes
     *
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
                let values = null,
                    rgb_all = null;

                // Build send command for state changes
                if (deviceId[4] === undefined) {
                    this.log.debug('Send state');
                    if (deviceId[3] === 'action') {
                        try {
                            if (typeof state.val !== 'string') {
                                throw new Error('State value is not a string');
                            }
                            values = JSON.parse(state.val);
                        } catch {
                            this.log.error(`State ${id} is not a valid JSON string: ${state.val}`);
                            return;
                        }
                    } else if (deviceId[3] === 'rawCommand') {
                        // Handle raw HTTP API command (legacy /win endpoint)
                        try {
                            if (typeof state.val !== 'string') {
                                throw new Error('State value is not a string');
                            }

                            this.log.debug(`Raw command request: ${state.val}`);

                            // Get device IP
                            let device_ip = await this.getForeignObjectAsync(`wled.${this.instance}.${deviceId[2]}`);
                            if (!device_ip) {
                                this.log.error(`Device IP not found for ${deviceId[2]}`);
                                return;
                            }
                            device_ip = device_ip.native.ip;

                            // Send raw command to /win endpoint with query parameters
                            const params = new URLSearchParams(state.val);
                            const url = `http://${device_ip}/win?${params.toString()}`;
                            this.log.debug(`Sending raw command to: ${url}`);

                            try {
                                const result = await axios.get(url);

                                this.log.debug(`Raw command response: ${JSON.stringify(result.data)}`);

                                // Trigger a device poll to update states after a short delay
                                setTimeout(() => {
                                    this.watchDog(device_ip);
                                }, 500);
                            } catch (error) {
                                this.log.error(`Failed to send raw command: ${error.message}`);
                            }

                            // Always acknowledge the state change, regardless of success or failure
                            this.setState(id, {
                                val: state.val,
                                ack: true,
                            });

                            return; // Exit early, rawCommand is handled separately
                        } catch (error) {
                            this.log.error(`Error processing raw command: ${error.message}`);
                            return;
                        }
                    } else {
                        values = {
                            [deviceId[3]]: state.val,
                        };
                    }
                    this.log.debug(`values 4 ${JSON.stringify(values)}`);
                } else {
                    // Send command 1 - level  nesting
                    if (deviceId[5] === undefined) {
                        this.log.debug('Send nested state');

                        // Send state change & value state forward to WLED API
                        values = {
                            [deviceId[3]]: {
                                [deviceId[4]]: state.val,
                            },
                        };
                        this.log.debug(`values 5 ${JSON.stringify(values)}`);
                    }

                    // Handle segments logic
                    if (deviceId[3] === 'seg') {
                        this.log.debug('Send seg');
                        const valAsNumbers = parseFloat(deviceId[4]);
                        this.log.debug(`test number : ${valAsNumbers}`);

                        // Check if changed state is related to color
                        if (deviceId[5] === 'col') {
                            this.log.debug('Send col');
                            const color_root = `${deviceId[2]}.${deviceId[3]}.${deviceId[4]}.${deviceId[5]}`;
                            this.log.debug(color_root);

                            // Handle logic for HEX values, must be translated to RGB which is used by WLED
                            if (deviceId[6] === '0_HEX' || deviceId[6] === '1_HEX' || deviceId[6] === '2_HEX') {
                                this.log.debug('HEX color change initiated, convert to RGB and send data');

                                try {
                                    // Get all 3 HEX values from states
                                    const colorPrimaryHex = await this.getStateAsync(`${color_root}.0_HEX`);
                                    if (!colorPrimaryHex) {
                                        return;
                                    }
                                    const colorSecondaryHex = await this.getStateAsync(`${color_root}.1_HEX`);
                                    if (!colorSecondaryHex) {
                                        return;
                                    }
                                    const colorTertiaryHex = await this.getStateAsync(`${color_root}.1_HEX`);
                                    if (!colorTertiaryHex) {
                                        return;
                                    }

                                    // Use library to translate HEX values into proper RGB
                                    //hex RGB calculate Alpha channel in 0 to 1 Wled need a value between 0 and 255 so the alpha channel from HEXRGB has to multiple by 255
                                    const colorPrimaryRGB = hexRgb(colorPrimaryHex.val);
                                    colorPrimaryRGB.alpha = colorPrimaryRGB.alpha * 255;
                                    const colorSecondaryRGB = hexRgb(colorSecondaryHex.val);
                                    colorSecondaryRGB.alpha = colorSecondaryRGB.alpha * 255;
                                    const colorTertiaryRGB = hexRgb(colorTertiaryHex.val);
                                    colorTertiaryRGB.alpha = colorTertiaryRGB.alpha * 255;

                                    // Build RGB JSON string to be send to WLED
                                    //add aditional Alpha channel when RGBW is used
                                    rgb_all = [
                                        [
                                            colorPrimaryRGB.red,
                                            colorPrimaryRGB.green,
                                            colorPrimaryRGB.blue,
                                            colorPrimaryRGB.alpha,
                                        ],
                                        [
                                            colorSecondaryRGB.red,
                                            colorSecondaryRGB.green,
                                            colorSecondaryRGB.blue,
                                            colorSecondaryRGB.alpha,
                                        ],
                                        [
                                            colorTertiaryRGB.red,
                                            colorTertiaryRGB.green,
                                            colorTertiaryRGB.blue,
                                            colorTertiaryRGB.alpha,
                                        ],
                                    ];

                                    this.log.debug(
                                        `Converted RGB values of HEX input : ${colorPrimaryRGB} : ${
                                            colorSecondaryRGB
                                        } : ${colorTertiaryRGB}`,
                                    );
                                } catch (error) {
                                    this.log.error(`Hex conversion failed : ${error}`);
                                    return;
                                }

                                // Handle logic for RGB values, must be translated to RGB which is used by WLED
                            } else if (deviceId[6] === '0' || deviceId[6] === '1' || deviceId[6] === '2') {
                                this.log.debug('RGB color change initiated, convert to RGB and send data');

                                try {
                                    // Get all 3 RGB values from states and ensure all 3 color's are always submitted in 1 JSON string !
                                    //Val String is [R,G,B] so the first part of array will be '[R' which will result in NAN on parseInt. The '[' has to be cut out of the string before split and parseInt
                                    let color_primary = await this.getStateAsync(`${color_root}.0`);
                                    if (!color_primary) {
                                        return;
                                    }
                                    this.log.debug(`Primary color before split : ${color_primary.val}`);
                                    try {
                                        color_primary.val = color_primary.val.replace('[', '');
                                        color_primary = color_primary.val.split(',').map(s => parseInt(s));
                                    } catch {
                                        if (!color_primary) {
                                            return;
                                        }
                                        color_primary = color_primary.val;
                                    }

                                    let color_secondary = await this.getStateAsync(`${color_root}.1`);
                                    if (!color_secondary) {
                                        return;
                                    }
                                    this.log.debug(`Secondary color : ${color_secondary.val}`);
                                    try {
                                        color_secondary.val = color_secondary.val.replace('[', '');
                                        color_secondary = color_secondary.val.split(',').map(s => parseInt(s));
                                    } catch {
                                        if (!color_secondary) {
                                            return;
                                        }
                                        color_secondary = color_secondary.val;
                                    }

                                    let color_tertiary = await this.getStateAsync(`${color_root}.2`);
                                    if (!color_tertiary) {
                                        return;
                                    }
                                    this.log.debug(`Tertiary color : ${color_tertiary.val}`);
                                    try {
                                        color_tertiary.val = color_tertiary.val.replace('[', '');
                                        color_tertiary = color_tertiary.val.split(',').map(s => parseInt(s));
                                    } catch {
                                        if (!color_tertiary) {
                                            return;
                                        }
                                        color_tertiary = color_tertiary.val;
                                    }

                                    this.log.debug(
                                        `Color values from states : ${color_primary} : ${color_secondary} : ${
                                            color_tertiary
                                        }`,
                                    );

                                    // Build proper RGB array in WLED format with all 3 color states
                                    rgb_all = [color_primary, color_secondary, color_tertiary];
                                } catch (error) {
                                    this.log.error(error);
                                    return;
                                }
                            }

                            // Build JSON string to be send to WLED, cancel function if
                            values = {
                                seg: {
                                    id: valAsNumbers,
                                    col: rgb_all,
                                },
                            };
                        } else {
                            // Send state change & value state forward to WLED API
                            values = {
                                [deviceId[3]]: {
                                    id: valAsNumbers,
                                    [deviceId[5]]: state.val,
                                },
                            };
                        }
                        this.log.debug(`values segment ${JSON.stringify(values)}`);
                    }
                }

                this.log.debug(`Prepare API call for device : ${deviceId[2]} and values + ${values}`);
                let device_ip = await this.getForeignObjectAsync(`wled.${this.instance}.${deviceId[2]}`);
                if (!device_ip) {
                    return;
                }
                device_ip = device_ip.native.ip;

                // Only make API call when values are correct
                if (values !== null && device_ip !== null) {
                    // If websocket is connected, send message by websocket otherwise http-API
                    if (this.devices[device_ip].wsConnected) {
                        this.log.debug(`Sending state change by websocket ${JSON.stringify(values)}`);

                        ws[device_ip].send(JSON.stringify(values));
                    } else {
                        this.log.debug(`Sending state change by http-API ${JSON.stringify(values)}`);

                        // Send API Post command
                        const result = await this.postAPI(`http://${device_ip}/json`, values);
                        if (!result) {
                            return;
                        }
                        this.log.debug(`API feedback${JSON.stringify(result)}`);

                        if (result.success === true) {
                            // Set state acknowledgement if  API call was successfully
                            this.setState(id, {
                                val: state.val,
                                ack: true,
                            });
                        }
                    }
                }
            }
        } catch (error) {
            this.errorHandler(`[onStateChange]`, error);
        }
    }

    /**
     * Is called when an object is changed
     *
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    async onObjectChange(id, obj) {
        try {
            // Check if this is a deletion (obj is null) and if it's a device in our namespace
            if (!obj && id.startsWith(`${this.namespace}.`) && id.match(DEVICE_ID_PATTERN)) {
                // Extract MAC address from the device ID
                const mac = id.split('.').pop();

                this.log.info(`Device ${mac} was deleted from object tree, cleaning up backend processes and objects`);

                // Find the device IP from our devices array
                let deviceIP = null;
                for (const ip in this.devices) {
                    if (this.devices[ip].mac === mac) {
                        deviceIP = ip;
                        break;
                    }
                }

                if (deviceIP) {
                    // Clean up backend processes and objects using the helper method
                    this.cleanupDeviceBackend(deviceIP, mac);
                } else {
                    this.log.warn(
                        `Device ${mac} not found in devices array, cannot clean up backend processes and objects`,
                    );
                }
            }
        } catch (error) {
            this.errorHandler(`[onObjectChange]`, error);
        }
    }

    //ToDo: Review
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.message" property to be set to true in io-package.json
     *
     * @param {ioBroker.Message} obj
     */
    /**
     * Find device IP address by MAC address
     *
     * @param {string} mac - MAC address of device
     * @returns {string|null} - IP address or null if not found
     */
    getDeviceIpByMac(mac) {
        for (const ip in this.devices) {
            if (this.devices[ip].mac === mac) {
                return ip;
            }
        }
        return null;
    }

    /**
     * Validate a byte value (0-255)
     *
     * @param {any} value - Value to validate
     * @param {string} name - Name of the parameter for logging
     * @returns {number|undefined} - Validated integer value or undefined if invalid
     */
    validateByteValue(value, name) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            this.log.warn(`Ignoring invalid ${name} value: ${value} (expected number 0-255)`);
            return undefined;
        }
        const intVal = Math.round(value);
        if (intVal < 0 || intVal > 255) {
            this.log.warn(`Ignoring out-of-range ${name} value: ${value} (expected 0-255)`);
            return undefined;
        }
        return intVal;
    }

    /**
     * Validate color array format: [[r,g,b], ...]
     *
     * @param {any} colVal - Value to validate
     * @returns {Array|null} - Sanitized color array or null if invalid
     */
    validateSegmentColors(colVal) {
        if (!Array.isArray(colVal)) {
            this.log.warn(`Ignoring invalid col value: expected array, got ${typeof colVal}`);
            return null;
        }

        const sanitizedColors = [];

        for (let i = 0; i < colVal.length; i++) {
            const color = colVal[i];
            if (!Array.isArray(color) || color.length < 3) {
                this.log.warn(`Ignoring invalid color entry at index ${i}: expected [r,g,b] array`);
                continue;
            }

            const rgb = [];
            for (let j = 0; j < 3; j++) {
                const channel = color[j];
                if (typeof channel !== 'number' || !Number.isFinite(channel)) {
                    this.log.warn(
                        `Ignoring invalid color channel at col[${i}][${j}]: ${channel} (expected number 0-255)`,
                    );
                    rgb.length = 0;
                    break;
                }
                const intChannel = Math.round(channel);
                if (intChannel < 0 || intChannel > 255) {
                    this.log.warn(
                        `Ignoring out-of-range color channel at col[${i}][${j}]: ${channel} (expected 0-255)`,
                    );
                    rgb.length = 0;
                    break;
                }
                rgb.push(intChannel);
            }

            // Only add fully valid RGB entries
            if (rgb.length === 3) {
                sanitizedColors.push(rgb);
            }
        }

        if (!sanitizedColors.length) {
            this.log.warn('Ignoring col because no valid color entries were found');
            return null;
        }

        return sanitizedColors;
    }

    async onMessage(obj) {
        // If the message starts with dm: it is a device management message so ignore it
        if (obj.command.startsWith('dm:')) {
            return;
        }

        try {
            // responds to the adapter that sent the original message
            const respond = (response, that) => {
                if (obj.callback) {
                    that.sendTo(obj.from, obj.command, response, obj.callback);
                }
            };
            this.log.debug(`Data from configuration received : ${JSON.stringify(obj)}`);

            //Response to manual adding of devices & device deletion
            switch (obj.command) {
                case 'addDevice':
                    // Disable check of const declaration in case function
                    // eslint-disable-next-line no-case-declarations
                    const result = await this.getDeviceJSON(obj.message);
                    this.log.debug(`Response from Read Data : ${JSON.stringify(result)}`);
                    if (result === 'success') {
                        respond('success', this);
                    } else {
                        respond('failed', this);
                    }
                    break;
                case 'deleteDevice':
                    // Delete device by IP address or device ID
                    // eslint-disable-next-line no-case-declarations
                    const deviceIP = obj.message;
                    this.log.debug(`Delete device request received for IP: ${deviceIP}`);

                    try {
                        // Find device ID by IP address
                        let deviceId = null;
                        for (const ip in this.devices) {
                            if (ip === deviceIP) {
                                deviceId = this.devices[ip].name;
                                break;
                            }
                        }

                        if (deviceId) {
                            // Use existing delDevice function
                            const deleteResult = await this.delDevice(`${this.namespace}.${deviceId}`);
                            if (deleteResult) {
                                respond('success', this);
                            } else {
                                respond('failed', this);
                            }
                        } else {
                            this.log.warn(`Device with IP ${deviceIP} not found`);
                            respond('failed', this);
                        }
                    } catch (deleteError) {
                        this.log.error(`Error deleting device ${deviceIP}: ${deleteError.message}`);
                        respond('failed', this);
                    }
                    break;
                case 'addSegment':
                    // Add a new segment to a WLED device
                    // Expected message format: { deviceId: 'MAC', segmentId: 0, start: 0, stop: 10, ...otherProps }
                    // eslint-disable-next-line no-case-declarations
                    const addSegmentMsg = obj.message;
                    this.log.debug(`Add segment request received: ${JSON.stringify(addSegmentMsg)}`);

                    try {
                        if (!addSegmentMsg || !addSegmentMsg.deviceId || addSegmentMsg.segmentId === undefined) {
                            this.log.error('addSegment requires deviceId and segmentId');
                            respond(
                                { success: false, error: 'Missing required parameters: deviceId and segmentId' },
                                this,
                            );
                            break;
                        }

                        const deviceMac = addSegmentMsg.deviceId;
                        const segmentId = addSegmentMsg.segmentId;

                        // Find device IP by MAC address using helper method
                        const deviceIpAddr = this.getDeviceIpByMac(deviceMac);

                        if (!deviceIpAddr) {
                            this.log.error(`Device with MAC ${deviceMac} not found`);
                            respond({ success: false, error: `Device with MAC ${deviceMac} not found` }, this);
                            break;
                        }

                        // Safety check: verify device still exists
                        if (!this.devices[deviceIpAddr]) {
                            this.log.error(`Device with MAC ${deviceMac} no longer available`);
                            respond({ success: false, error: `Device with MAC ${deviceMac} not found` }, this);
                            break;
                        }

                        // Build segment configuration object
                        const segmentConfig = {
                            id: segmentId,
                            start: addSegmentMsg.start !== undefined ? addSegmentMsg.start : 0,
                            stop: addSegmentMsg.stop !== undefined ? addSegmentMsg.stop : 1,
                        };

                        // Add optional properties if provided
                        if (addSegmentMsg.on !== undefined) {
                            // normalize to boolean
                            segmentConfig.on = !!addSegmentMsg.on;
                        }
                        if (addSegmentMsg.bri !== undefined) {
                            const bri = this.validateByteValue(addSegmentMsg.bri, 'bri');
                            if (bri !== undefined) {
                                segmentConfig.bri = bri;
                            }
                        }
                        if (addSegmentMsg.fx !== undefined) {
                            const fx = this.validateByteValue(addSegmentMsg.fx, 'fx');
                            if (fx !== undefined) {
                                segmentConfig.fx = fx;
                            }
                        }
                        if (addSegmentMsg.sx !== undefined) {
                            const sx = this.validateByteValue(addSegmentMsg.sx, 'sx');
                            if (sx !== undefined) {
                                segmentConfig.sx = sx;
                            }
                        }
                        if (addSegmentMsg.ix !== undefined) {
                            const ix = this.validateByteValue(addSegmentMsg.ix, 'ix');
                            if (ix !== undefined) {
                                segmentConfig.ix = ix;
                            }
                        }
                        if (addSegmentMsg.pal !== undefined) {
                            const pal = this.validateByteValue(addSegmentMsg.pal, 'pal');
                            if (pal !== undefined) {
                                segmentConfig.pal = pal;
                            }
                        }
                        if (addSegmentMsg.col !== undefined) {
                            const col = this.validateSegmentColors(addSegmentMsg.col);
                            if (col !== null) {
                                segmentConfig.col = col;
                            }
                        }

                        // Send segment configuration to WLED device
                        const wledPayload = { seg: segmentConfig };

                        // Use WebSocket if connected, otherwise use HTTP API
                        if (this.devices[deviceIpAddr].wsConnected) {
                            ws[deviceIpAddr].send(JSON.stringify(wledPayload));
                            this.log.info(`Segment ${segmentId} added to device ${deviceMac} via WebSocket`);
                        } else {
                            await this.postAPI(`http://${deviceIpAddr}/json`, wledPayload);
                            this.log.info(`Segment ${segmentId} added to device ${deviceMac} via HTTP API`);
                        }

                        // Wait a bit for the device to process the request, then refresh device data
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await this.getDeviceJSON(deviceIpAddr);

                        respond({ success: true, message: `Segment ${segmentId} added successfully` }, this);
                    } catch (addSegmentError) {
                        this.log.error(`Error adding segment: ${addSegmentError.message}`);
                        respond({ success: false, error: addSegmentError.message }, this);
                    }
                    break;
                case 'deleteSegment':
                    // Delete a segment from a WLED device
                    // Expected message format: { deviceId: 'MAC', segmentId: 0 }
                    // eslint-disable-next-line no-case-declarations
                    const deleteSegmentMsg = obj.message;
                    this.log.debug(`Delete segment request received: ${JSON.stringify(deleteSegmentMsg)}`);

                    try {
                        if (
                            !deleteSegmentMsg ||
                            !deleteSegmentMsg.deviceId ||
                            deleteSegmentMsg.segmentId === undefined
                        ) {
                            this.log.error('deleteSegment requires deviceId and segmentId');
                            respond(
                                { success: false, error: 'Missing required parameters: deviceId and segmentId' },
                                this,
                            );
                            break;
                        }

                        const deviceMac = deleteSegmentMsg.deviceId;
                        const segmentId = deleteSegmentMsg.segmentId;

                        // Find device IP by MAC address using helper method
                        const deviceIpAddr = this.getDeviceIpByMac(deviceMac);

                        if (!deviceIpAddr) {
                            this.log.error(`Device with MAC ${deviceMac} not found`);
                            respond({ success: false, error: `Device with MAC ${deviceMac} not found` }, this);
                            break;
                        }

                        // Safety check: verify device still exists
                        if (!this.devices[deviceIpAddr]) {
                            this.log.error(`Device with MAC ${deviceMac} no longer available`);
                            respond({ success: false, error: `Device with MAC ${deviceMac} not found` }, this);
                            break;
                        }

                        // To delete a segment in WLED, set stop=0 or use the segment reset command
                        const segmentConfig = {
                            id: segmentId,
                            stop: 0,
                        };

                        const wledPayload = { seg: segmentConfig };

                        // Use WebSocket if connected, otherwise use HTTP API
                        if (this.devices[deviceIpAddr].wsConnected) {
                            ws[deviceIpAddr].send(JSON.stringify(wledPayload));
                            this.log.info(`Segment ${segmentId} deleted from device ${deviceMac} via WebSocket`);
                        } else {
                            await this.postAPI(`http://${deviceIpAddr}/json`, wledPayload);
                            this.log.info(`Segment ${segmentId} deleted from device ${deviceMac} via HTTP API`);
                        }

                        // Delete segment states from ioBroker
                        try {
                            const segmentStateId = `${this.namespace}.${deviceMac}.seg.${segmentId}`;
                            await this.delObjectAsync(segmentStateId, { recursive: true });
                            this.log.debug(`Deleted segment states for ${segmentStateId}`);
                        } catch (delError) {
                            this.log.debug(`Could not delete segment states (may not exist): ${delError.message}`);
                        }

                        // Wait a bit for the device to process the request, then refresh device data
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await this.getDeviceJSON(deviceIpAddr);

                        respond({ success: true, message: `Segment ${segmentId} deleted successfully` }, this);
                    } catch (deleteSegmentError) {
                        this.log.error(`Error deleting segment: ${deleteSegmentError.message}`);
                        respond({ success: false, error: deleteSegmentError.message }, this);
                    }
                    break;
            }
        } catch (error) {
            this.errorHandler(`[onMessage]`, error);
        }
    }

    /**
     * Websocket connection handler
     *
     * @param {string} deviceIP IP-Address of device
     */
    async handleWebSocket(deviceIP) {
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
        ws[deviceIP].on('message', async data => {
            this.log.debug(`Websocket WLED message received for ${deviceIP} : ${data}`);
            data = data.toString();
            try {
                if (data !== 'pong') {
                    data = JSON.parse(data);
                    if (data.state) {
                        await this.handleStates(data, deviceIP);
                    } // If message contains state updates, handle state data
                } else if (data === 'pong') {
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
            } catch (error) {
                let message = error;
                if (error instanceof Error && error.stack != null) {
                    message = error.stack;
                }
                this.log.error(`WebSocket message error for ${deviceIP} | ${message}`);
            }
        });

        // Handle closure of socket connection
        ws[deviceIP].on('close', () => {
            if (this.devices[deviceIP]?.wsSupported === true) {
                this.log.info(`${this.devices[deviceIP].name} disconnected`);
                this.devices[deviceIP].connected = false;
                this.devices[deviceIP].initialized = false;
                this.devices[deviceIP].wsConnected = false;

                // Set Device status to off and brightness to 0 if devices disconnects
                this.setState(`${this.devices[deviceIP].mac}.on`, false, true);
                this.setState(`${this.devices[deviceIP].mac}.bri`, 0, true);
            }
        });

        // Handle errors on socket connection
        ws[deviceIP].on('error', error => {
            // Optimise error messages
            if (error.message.includes('404')) {
                this.log.warn(
                    `Client ${deviceIP} does not support websocket, please consider upgrading your WLED firmware to >= 0.12. Switching to http-APi !`,
                );
                this.devices[deviceIP].wsSupported = false;
            } else {
                this.log.error(`Websocket connection error : ${error}`);
            }
        });
    }

    /**
     * Create basic device structure
     *
     * @param {string} deviceIP IP-Address of device
     * @param {object} deviceData WLED info & state data
     */
    async handleBasicStates(deviceIP, deviceData) {
        try {
            const device_id = deviceData.info.mac;
            if (!this.devices[deviceIP]) {
                this.devices[deviceIP] = {};
            }

            this.devices[deviceIP].ip = deviceIP;
            this.devices[deviceIP].mac = deviceData.info.mac;
            this.devices[deviceIP].connected = false;
            this.devices[deviceIP].initialized = false;
            this.devices[deviceIP].name = deviceData.info.name;

            // Create Device, channel id by MAC-Address and ensure relevant information for polling and instance configuration is part of device object
            if (!this.devices[deviceIP].initialized) {
                await this.extendObjectAsync(device_id, {
                    type: 'device',
                    common: {
                        name: deviceData.info.name,
                        statusStates: {
                            onlineId: `${this.namespace}.${device_id}._info._online`,
                        },
                    },
                    native: {
                        ip: deviceIP,
                        mac: device_id,
                    },
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
            } catch {
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
            await this.create_state(`${device_id}.tt`, 'tt', '');
            await this.create_state(`${device_id}.psave`, 'psave', '');
            await this.create_state(`${device_id}.udpn.nn`, 'nn', '');
            await this.create_state(`${device_id}.time`, 'time', null);
            await this.create_state(`${device_id}.action`, 'action', '');
            await this.create_state(`${device_id}.rawCommand`, 'rawCommand', '');

            // Create structure for all states
            await this.handleStates(deviceData, deviceIP);
        } catch (error) {
            this.errorHandler(`[handleBasicStates]`, error);
        }
    }

    /**
     * Data handler
     *
     * @param {object} deviceData WLED info & state data
     * @param {string} ipAddress IP Address of device
     */
    async handleStates(deviceData, ipAddress) {
        try {
            const infoStates = deviceData.info;
            const deviceStates = deviceData.state;
            infoStates.ip = infoStates.ip !== undefined ? infoStates.ip : ipAddress;

            if (!this.devices[ipAddress].initialized) {
                await this.setObjectNotExistsAsync(`${infoStates.mac}._info`, {
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
                        case 'leds':
                            await this.setObjectNotExistsAsync(`${infoStates.mac}._info.leds`, {
                                type: 'channel',
                                common: {
                                    name: 'LED stripe configuration	',
                                },
                                native: {},
                            });
                            break;

                        case 'wifi':
                            await this.setObjectNotExistsAsync(`${infoStates.mac}._info.wifi`, {
                                type: 'channel',
                                common: {
                                    name: 'Wifi configuration	',
                                },
                                native: {},
                            });
                            break;

                        case 'u':
                            await this.localDeleteState(`${infoStates.mac}._info.u`);
                            break;

                        default:
                    }
                }

                // Create states, ensure object structures are reflected in tree
                if (typeof infoStates[i] !== 'object') {
                    // Default channel creation
                    this.log.debug(`State created : ${i} : ${JSON.stringify(infoStates[i])}`);
                    await this.create_state(`${infoStates.mac}._info.${i}`, i, infoStates[i]);
                } else {
                    for (const y in infoStates[i]) {
                        this.log.debug(`State created : ${y} : ${JSON.stringify(infoStates[i][y])}`);
                        await this.create_state(`${infoStates.mac}._info.${i}.${y}`, y, infoStates[i][y]);
                    }
                }
            }

            // Write data of states
            for (const i in deviceStates) {
                this.log.debug(`Datatype : ${typeof deviceStates[i]}`);

                // Create Channels for nested states
                switch (i) {
                    case 'ccnf':
                        if (!this.devices[ipAddress].initialized) {
                            await this.setObjectNotExistsAsync(`${infoStates.mac}.ccnf`, {
                                type: 'channel',
                                common: {
                                    name: 'ccnf',
                                },
                                native: {},
                            });
                        }
                        break;

                    case 'nl':
                        if (!this.devices[ipAddress].initialized) {
                            await this.setObjectNotExistsAsync(`${infoStates.mac}.nl`, {
                                type: 'channel',
                                common: {
                                    name: 'Nightlight',
                                },
                                native: {},
                            });
                        }
                        break;

                    case 'udpn':
                        if (!this.devices[ipAddress].initialized) {
                            await this.setObjectNotExistsAsync(`${infoStates.mac}.udpn`, {
                                type: 'channel',
                                common: {
                                    name: 'Broadcast (UDP sync)',
                                },
                                native: {},
                            });
                        }
                        break;

                    case 'seg':
                        this.log.debug(`Segment Array : ${JSON.stringify(deviceStates[i])}`);

                        if (!this.devices[ipAddress].initialized) {
                            await this.setObjectNotExistsAsync(`${infoStates.mac}.seg`, {
                                type: 'channel',
                                common: {
                                    name: 'Segmentation',
                                },
                                native: {},
                            });
                        }

                        for (const y in deviceStates[i]) {
                            if (!this.devices[ipAddress].initialized) {
                                await this.setObjectNotExistsAsync(`${infoStates.mac}.seg.${y}`, {
                                    type: 'channel',
                                    common: {
                                        name: `Segment ${y}`,
                                    },
                                    native: {},
                                });
                            }

                            for (const x in deviceStates[i][y]) {
                                this.log.debug(
                                    `Object states created for channel ${i} with parameter : ${y} : ${JSON.stringify(
                                        deviceStates[i][y],
                                    )}`,
                                );

                                if (x !== 'col') {
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${y}.${x}`,
                                        x,
                                        deviceStates[i][y][x],
                                    );
                                } else {
                                    this.log.debug(
                                        `Naming  : ${x} with content : ${JSON.stringify(deviceStates[i][y][x][0])}`,
                                    );

                                    // Translate RGB values to HEX
                                    //added additional Alpha channel, necessary if WLED is setup for RGBW Stripes.
                                    //so on normal RGB Stripes Hex has 6 digits on RGBW Stripes Hex as 8 digits. The 2 additional digits for the white channel slider
                                    const primaryRGB = deviceStates[i][y][x][0].toString().split(',');
                                    const primaryHex = rgbHex(
                                        parseInt(primaryRGB[0]),
                                        parseInt(primaryRGB[1]),
                                        parseInt(primaryRGB[2]),
                                        isNaN(parseInt(primaryRGB[3]) / 255)
                                            ? undefined
                                            : parseInt(primaryRGB[3]) / 255,
                                    );
                                    const secondaryRGB = deviceStates[i][y][x][1].toString().split(',');
                                    const secondaryHex = rgbHex(
                                        parseInt(secondaryRGB[0]),
                                        parseInt(secondaryRGB[1]),
                                        parseInt(secondaryRGB[2]),
                                        isNaN(parseInt(secondaryRGB[3]) / 255)
                                            ? undefined
                                            : parseInt(secondaryRGB[3]) / 255,
                                    );
                                    const tertiaryRGB = deviceStates[i][y][x][2].toString().split(',');
                                    const tertiaryHex = rgbHex(
                                        parseInt(tertiaryRGB[0]),
                                        parseInt(tertiaryRGB[1]),
                                        parseInt(tertiaryRGB[2]),
                                        isNaN(parseInt(tertiaryRGB[3]) / 255)
                                            ? undefined
                                            : parseInt(tertiaryRGB[3]) / 255,
                                    );

                                    // Write RGB and HEX information to states
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${y}.${x}.0`,
                                        'Primary Color RGB',
                                        deviceStates[i][y][x][0],
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${y}.${x}.0_HEX`,
                                        'Primary Color HEX',
                                        `#${primaryHex}`,
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${y}.${x}.1`,
                                        'Secondary Color RGB (background)',
                                        deviceStates[i][y][x][1],
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${y}.${x}.1_HEX`,
                                        'Secondary Color HEX (background)',
                                        `#${secondaryHex}`,
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${y}.${x}.2`,
                                        'Tertiary Color RGB',
                                        deviceStates[i][y][x][2],
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${y}.${x}.2_HEX`,
                                        'Tertiary Color HEX',
                                        `#${tertiaryHex}`,
                                    );
                                }
                            }
                        }

                        break;

                    case 'u':
                        await this.localDeleteState(`${infoStates.mac}	.u`);
                        break;

                    default:
                }

                // Create states, ensure object structures are reflected in tree
                if (typeof deviceStates[i] !== 'object') {
                    // Default channel creation
                    this.log.debug(`Default state created : ${i} : ${JSON.stringify(deviceStates[i])}`);
                    await this.create_state(`${infoStates.mac}.${i}`, i, deviceStates[i]);
                } else {
                    for (const y in deviceStates[i]) {
                        if (typeof deviceStates[i][y] !== 'object') {
                            this.log.debug(
                                `Object states created for channel ${i} with parameter : ${y} : ${JSON.stringify(
                                    deviceStates[i][y],
                                )}`,
                            );
                            await this.create_state(`${infoStates.mac}.${i}.${y}`, y, deviceStates[i][y]);
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
            if (!this.devices[ipAddress].connected) {
                this.devices[ipAddress].connected = true;
            }
            this.create_state(`${infoStates.mac}._info` + `._online`, `Online status`, true);
        } catch (error) {
            this.errorHandler(`[handleStates]`, error);
        }
    }

    /**
     * Frequent watchdog to validate connection
     *
     * @param {string} deviceIP IP-Address of device
     */
    async watchDog(deviceIP) {
        // Check if device is in list of devices
        if (!this.devices[deviceIP]) {
            return;
        }

        // Initialize retry count and delay if not exists
        if (deviceRetryCount[deviceIP] === undefined) {
            deviceRetryCount[deviceIP] = 0;
            deviceRetryDelay[deviceIP] = this.config.Time_Sync * 1000;
        }

        // Check if device has exceeded maximum retry attempts
        const maxRetries = this.config.maxRetries ?? 5;
        if (deviceRetryCount[deviceIP] >= maxRetries) {
            // Device has failed too many times, schedule a much longer retry interval
            if (watchdogTimer[deviceIP]) {
                clearTimeout(watchdogTimer[deviceIP]);
                watchdogTimer[deviceIP] = null;
            }

            // Retry once every hour (3600 seconds) for permanently failed devices
            const longRetryDelay = 3600 * 1000;
            watchdogTimer[deviceIP] = setTimeout(() => {
                // Reset retry count after long delay to give device another chance
                deviceRetryCount[deviceIP] = 0;
                deviceRetryDelay[deviceIP] = this.config.Time_Sync * 1000;
                this.watchDog(deviceIP);
            }, longRetryDelay);

            this.log.debug(`Device ${deviceIP} has failed ${maxRetries} consecutive times, next retry in 1 hour`);
            return;
        }

        try {
            this.log.debug(`Watchdog for ${JSON.stringify(this.devices[deviceIP])}`);

            let deviceAvailable = false;

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
                                    this.create_state(
                                        `${this.devices[deviceIP].mac}._info` + `._online`,
                                        'Online status',
                                        false,
                                    );
                                }
                            }
                            // Close socket
                            try {
                                ws[deviceIP].close();
                            } catch (e) {
                                console.error(e);
                            }
                        }, this.config.Time_Sync * 1000);
                        deviceAvailable = true;
                    } catch (e) {
                        // Try http-API in case of error
                        this.log.error(`WS Ping error : ${e}`);
                        const result = await this.getDeviceJSON(deviceIP);
                        deviceAvailable = result === 'success';
                    }
                } else {
                    // If WS-Ping not supported, use http-API
                    try {
                        const result = await this.getDeviceJSON(deviceIP);
                        deviceAvailable = result === 'success';
                    } catch (error) {
                        this.errorHandler(`[watchDog]`, error);
                        deviceAvailable = false;
                    }
                }
            } else {
                // If WS-Ping not supported, use http-API
                try {
                    const result = await this.getDeviceJSON(deviceIP);
                    deviceAvailable = result === 'success';
                } catch (error) {
                    this.errorHandler(`[watchDog]`, error);
                    deviceAvailable = false;
                }
            }

            // Handle retry logic based on device availability
            if (deviceAvailable) {
                // Device is available, reset retry count and delay
                if (deviceRetryCount[deviceIP] > 0) {
                    this.log.debug(`Device ${deviceIP} is back online, resetting retry count`);
                }
                deviceRetryCount[deviceIP] = 0;
                deviceRetryDelay[deviceIP] = this.config.Time_Sync * 1000;
            } else {
                // Device is not available, increment retry count
                deviceRetryCount[deviceIP]++;

                // Calculate exponential backoff delay if enabled
                if (this.config.retryBackoff ?? true) {
                    // Exponential backoff: base delay * 2^(retry-1), max 10 minutes
                    const baseDelay = this.config.Time_Sync * 1000;
                    const backoffMultiplier = Math.pow(2, deviceRetryCount[deviceIP] - 1);
                    deviceRetryDelay[deviceIP] = Math.min(baseDelay * backoffMultiplier, 600 * 1000);
                }

                // Log retry information based on retry count
                if (deviceRetryCount[deviceIP] <= 3) {
                    this.log.info(
                        `Device ${deviceIP} unavailable (attempt ${deviceRetryCount[deviceIP]}/${maxRetries}), will retry in ${Math.round(deviceRetryDelay[deviceIP] / 1000)} seconds`,
                    );
                } else {
                    this.log.debug(
                        `Device ${deviceIP} unavailable (attempt ${deviceRetryCount[deviceIP]}/${maxRetries}), will retry in ${Math.round(deviceRetryDelay[deviceIP] / 1000)} seconds`,
                    );
                }
            }
        } catch (error) {
            this.errorHandler(`[watchDog]`, error);
            // Treat errors as device unavailable
            deviceRetryCount[deviceIP] = (deviceRetryCount[deviceIP] || 0) + 1;
        }

        // Reset timer (if running) and start new one for next watchdog interval
        if (watchdogTimer[deviceIP]) {
            clearTimeout(watchdogTimer[deviceIP]);
            watchdogTimer[deviceIP] = null;
        }

        // Use the calculated retry delay
        const nextDelay = deviceRetryDelay[deviceIP] || this.config.Time_Sync * 1000;
        watchdogTimer[deviceIP] = setTimeout(() => {
            this.watchDog(deviceIP);
        }, nextDelay);
    }

    /**
     * Request device data by http-API
     *
     * @param {string} deviceIP IP-Address of device
     */
    async getDeviceJSON(deviceIP) {
        try {
            this.log.debug(`getDeviceJSON called for : ${deviceIP}`);

            try {
                const requestDeviceDataByAPI = async () => {
                    try {
                        const response = await axios.get(`http://${deviceIP}/json`, { timeout: 3000 }); // Timout of 3 seconds for API call
                        this.log.debug(JSON.stringify(`API response data : ${response.data}`));
                        const deviceData = response.data;
                        return deviceData;
                    } catch (e) {
                        this.log.debug(`[requestDeviceDataByAPI] ${e}`);
                    }
                };

                // Check if connection is handled by websocket before proceeding
                if (
                    this.devices[deviceIP] &&
                    this.devices[deviceIP].connected &&
                    this.devices[deviceIP].wsConnected &&
                    this.devices[deviceIP].wsPingSupported
                ) {
                    // Nothing to do, device is connected by websocket and will handle state updates
                } else {
                    // No Websocket connection, handle data by http_API

                    const deviceData = await requestDeviceDataByAPI();

                    // If device is initialised, only handle state updates otherwise complete initialisation
                    if (
                        this.devices[deviceIP] &&
                        this.devices[deviceIP].connected &&
                        this.devices[deviceIP].initialized
                    ) {
                        if (!deviceData) {
                            this.log.warn(`Heartbeat of device ${deviceIP} failed, will try to reconnect`);
                            this.devices[deviceIP].connected = false;
                            this.devices[deviceIP].initialized = false;
                            this.devices[deviceIP].wsConnected = false;
                            await this.create_state(
                                `${this.devices[deviceIP].mac}._info` + `._online`,
                                'Online status',
                                false,
                            );
                            return 'failed';
                        }
                        this.log.debug(`Heartbeat of device ${deviceIP} successfully`);
                        if (this.devices[deviceIP].connected && this.devices[deviceIP].wsConnected) {
                            // Only reset heartbeat, device is connected by websocket and will handle state updates
                            this.setStateChanged(`${this.devices[deviceIP].mac}._info` + `._online`, {
                                val: true,
                                ack: true,
                            });
                            return 'success';
                        }
                        await this.handleStates(deviceData, deviceIP);
                        this.devices[deviceIP].wsConnected = false;
                        this.setStateChanged(`${this.devices[deviceIP].mac}._info` + `._online`, {
                            val: true,
                            ack: true,
                        });
                        return 'success';
                    }

                    if (!deviceData) {
                        this.log.warn(`Unable to initialise ${deviceIP} will retry in scheduled interval !`);
                        this.devices[deviceIP].initialized = false;
                        // Update device working state
                        if (this.devices[deviceIP].mac != null) {
                            await this.create_state(
                                `${this.devices[deviceIP].mac}._info` + `._online`,
                                'Online status',
                                { val: false, ack: true },
                            );
                        }
                        return 'failed';
                    }
                    this.log.debug(`Info Data received from WLED device ${JSON.stringify(deviceData)}`);
                    this.log.info(`Initialising : " ${deviceData.info.name}" on IP :  ${deviceIP}`);
                    await this.handleBasicStates(deviceIP, deviceData);
                    return 'success';
                }
            } catch {
                if (this.devices[deviceIP] && this.devices[deviceIP].connected) {
                    this.log.warn(`Device ${deviceIP} offline, will try to reconnect`);
                    if (this.devices[deviceIP].mac != null) {
                        await this.create_state(
                            `${this.devices[deviceIP].mac}._info` + `._online`,
                            'Online status',
                            false,
                        );
                        // Set Device status to off and brightness to 0 if devices disconnects
                        this.setState(`${this.devices[deviceIP].mac}.on`, false, true);
                        this.setState(`${this.devices[deviceIP].mac}.bri`, 0, true);
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
     *
     * @param {string} url API url
     * @param {object} values JSON data to send
     */
    async postAPI(url, values) {
        this.log.debug(`Post API called for : ${url} and  values : ${JSON.stringify(values)}`);
        try {
            const result = axios
                .post(url, values)
                .then(response => {
                    return response.data;
                })
                .catch(error => {
                    this.log.error(`Sending command to WLED device + ${url} failed with error ${error}`);
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
            if (!knownDevices) {
                return;
            } // exit function if no known device are detected
            if (knownDevices.length > 0) {
                this.log.info(`Try to contact ${knownDevices.length} known devices`);
            }

            // Get IP-Address of known devices and try too establish connection
            for (const i in knownDevices) {
                const deviceIP = knownDevices[i].native.ip;

                this.log.info(`Try to contact : "${knownDevices[i].common.name}" on IP : ${deviceIP}`);

                // Add IP address to polling array
                this.devices[deviceIP] = {};
                this.devices[deviceIP].ip = knownDevices[i].native.ip;
                this.devices[deviceIP].mac = knownDevices[i].native.mac;
                this.devices[deviceIP].connected = false;
                this.devices[deviceIP].initialized = false;
                await this.getDeviceJSON(deviceIP);
            }
        } catch (error) {
            this.errorHandler(`[tryKnownDevices]`, error);
        }
    }

    /**
     * Scan network with Bonjour service to detect new WLED devices
     */
    async scanDevices() {
        try {
            // Browse and listen for WLED devices
            this.bonjourBrowser = await bonjour.find({
                type: 'wled',
            });
            this.log.info('Bonjour service started, new  devices  will  be detected automatically');

            // Event listener if new devices are detected
            this.bonjourBrowser.on('up', data => {
                const id = data.txt.mac;
                const ip = data.referer.address;

                // Check if device is already know
                if (this.devices[ip] == null) {
                    this.log.info(`New WLED  device found ${data.name} on IP ${data.referer.address}`);

                    //  Add device to array
                    this.devices[ip] = {};
                    this.devices[ip].mac = id;
                    this.devices[ip].ip = ip;
                    this.log.debug(`Devices array from bonjour scan : ${JSON.stringify(this.devices)}`);
                    this.devices[ip].connected = false;
                    // Initialize device
                    this.getDeviceJSON(ip);
                } else {
                    // Update ip information in case of change
                    this.devices[ip].ip = ip;
                }
                this.log.debug(`Devices array from bonjour scan : ${JSON.stringify(this.devices)}`);
            });
        } catch (error) {
            this.errorHandler(`[scanDevices]`, error);
            return 'failed';
        }
    }

    /**
     * State create and value update handler
     *
     * @param {string} stateName ID of state to create
     * @param {string} name Name of object
     * @param {object} value Value
     */
    async create_state(stateName, name, value) {
        this.log.debug(`Create_state called for : ${stateName} with value : ${value}`);
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
                    this.log.debug(`State attribute definition missing for : ${name} with value : ${value}`);
                }
            }

            if (stateAttr[name] !== undefined && stateAttr[name].min !== undefined) {
                common.min = stateAttr[name].min;
            }
            if (stateAttr[name] !== undefined && stateAttr[name].max !== undefined) {
                common.max = stateAttr[name].max;
            }

            common.name = stateAttr[name] !== undefined ? stateAttr[name].name || name : name;
            common.type = stateAttr[name] !== undefined ? stateAttr[name].type || typeof value : typeof value;
            common.role = stateAttr[name] !== undefined ? stateAttr[name].role || 'state' : 'state';
            common.read = true;
            common.unit = stateAttr[name] !== undefined ? stateAttr[name].unit || '' : '';
            common.write = stateAttr[name] !== undefined ? stateAttr[name].write || false : false;

            if (
                !this.createdStatesDetails[stateName] ||
                (this.createdStatesDetails[stateName] &&
                    (common.name !== this.createdStatesDetails[stateName].name ||
                        common.name !== this.createdStatesDetails[stateName].name ||
                        common.type !== this.createdStatesDetails[stateName].type ||
                        common.role !== this.createdStatesDetails[stateName].role ||
                        common.read !== this.createdStatesDetails[stateName].read ||
                        common.unit !== this.createdStatesDetails[stateName].unit ||
                        common.write !== this.createdStatesDetails[stateName].write))
            ) {
                // console.log(`An attribute has changed : ${state}`);
                this.log.debug(
                    `An attribute has changed : ${stateName} | old ${this.createdStatesDetails[stateName]} | new ${JSON.stringify(common)}`,
                );

                await this.extendObjectAsync(stateName, {
                    type: 'state',
                    common,
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
                    await this.setStateAsync(stateName, false, true);
                    this.log.debug(`Online state expired for ${stateName}`);
                }, this.config.Time_Sync * 2000);
                this.log.debug(
                    `Expire time set for state : ${name} with time in seconds : ${this.config.Time_Sync * 2}`,
                );
            }

            // Extend effects and color pal`let  with dropdown menu
            if (name === 'fx' && this.effects[deviceId] && !this.createdStatesDetails[stateName]) {
                this.log.debug(`Create special drop down state with value ${JSON.stringify(this.effects)}`);
                await this.extendObjectAsync(stateName, {
                    type: 'state',
                    common: {
                        states: this.effects[deviceId],
                    },
                });
            } else if (name === 'pal' && this.palettes[deviceId] && !this.createdStatesDetails[stateName]) {
                // this.log.debug('Create special drop down state with value ' + JSON.stringify(this.effects));
                await this.extendObjectAsync(stateName, {
                    type: 'state',
                    common: {
                        states: this.palettes[deviceId],
                    },
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
     *
     * @param {string} source Message to send
     * @param {any} error Error message (including stack) to handle exceptions
     * @param {boolean=} debugMode - Error message (including stack) to handle exceptions
     */
    errorHandler(source, error, debugMode) {
        let message = error;
        if (error instanceof Error && error.stack != null) {
            message = error.stack;
        }
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
     *
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
     * Clean up backend processes and objects for a device (timers, WebSocket, tracking data)
     *
     * @param {string} ip IP address of the device
     * @param {string} mac MAC address of the device (optional, for cache cleanup)
     */
    cleanupDeviceBackend(ip, mac) {
        try {
            this.log.info(`Cleaning up backend processes and objects for device ${ip}`);

            // Clear watchdog timer
            if (watchdogTimer[ip]) {
                clearTimeout(watchdogTimer[ip]);
                delete watchdogTimer[ip];
                this.log.debug(`Cleared watchdog timer for ${ip}`);
            }

            // Clear WebSocket ping timer
            if (watchdogWsTimer[ip]) {
                clearTimeout(watchdogWsTimer[ip]);
                delete watchdogWsTimer[ip];
                this.log.debug(`Cleared WebSocket ping timer for ${ip}`);
            }

            // Clear state expire timer
            if (stateExpire[ip]) {
                clearTimeout(stateExpire[ip]);
                delete stateExpire[ip];
                this.log.debug(`Cleared state expire timer for ${ip}`);
            }

            // Close WebSocket connection
            if (ws[ip]) {
                try {
                    ws[ip].close();
                    delete ws[ip];
                    this.log.debug(`Closed WebSocket connection for ${ip}`);
                } catch (error) {
                    this.log.warn(`Error closing WebSocket for ${ip}: ${error.message}`);
                }
            }

            // Clean up retry tracking
            delete deviceRetryCount[ip];
            delete deviceRetryDelay[ip];
            this.log.debug(`Cleared retry tracking for ${ip}`);

            // Delete device from devices object
            delete this.devices[ip];
            this.log.debug(`Removed device ${ip} from devices object`);

            // Clean up state cache if MAC is provided
            if (mac) {
                for (const state in this.createdStatesDetails) {
                    // Check if state belongs to this device by comparing first part (MAC address)
                    if (state.split('.')[0] === mac) {
                        delete this.createdStatesDetails[state];
                    }
                }
                this.log.debug(`Cleaned up state cache for ${mac}`);
            }
        } catch (error) {
            this.log.error(`Error cleaning up device ${ip}: ${error.message}`);
        }
    }

    /**
     * Delete device
     *
     * @param {string} deviceId
     * @returns {Promise<boolean>}
     */
    async delDevice(deviceId) {
        const obj = await this.getObjectAsync(deviceId);
        if (obj) {
            const ip = obj.native.ip;
            const mac = obj.native.mac;

            // Use the new cleanup helper method
            this.cleanupDeviceBackend(ip, mac);
        }

        const name = deviceId.replace(/wled\.\d\./, '');
        const res = await this.deleteDeviceAsync(name);
        if (res !== null) {
            this.log.info(`${name} deleted`);
            return true;
        }
        this.log.error(`Can not delete device ${name}: ${JSON.stringify(res)}`);
        return false;
    }

    /**
     * Ensure proper deletion of state and object
     *
     * @param {string} state ID of object to delete
     */
    async localDeleteState(state) {
        try {
            const obj = await this.getObjectAsync(state);
            if (obj) {
                await this.delObjectAsync(state, { recursive: true });
            }
        } catch {
            // do nothing
        }
    }

    async resetOnlineStates() {
        try {
            // Set parameters for object view to only include objects within adapter namespace
            const params = {
                startkey: `${this.namespace}.`,
                endkey: `${this.namespace}.\u9999`,
            };

            // Get all current devices in adapter tree
            const _devices = await this.getObjectViewAsync('system', 'device', params);
            // List all found devices & set online state to false
            for (const currDevice in _devices.rows) {
                // Extend online state to device (to ensure migration of version < 0.3.1
                await this.extendObjectAsync(_devices.rows[currDevice].id, {
                    common: {
                        statusStates: {
                            onlineId: `${_devices.rows[currDevice].id}._info._online`,
                        },
                    },
                });

                // Set online state to false, will be set to true at successfully connected
                this.setState(`${_devices.rows[currDevice].id}._info._online`, false, true);

                // Set Device status to off and brightness to 0 at adapter start
                this.setState(`${_devices.rows[currDevice].id}.on`, false, true);
                this.setState(`${_devices.rows[currDevice].id}.bri`, 0, true);
            }
        } catch (e) {
            this.log.error(`[resetOnlineState] ${e}`);
        }
    }
}

// @ts-expect-error parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options]
     */
    module.exports = options => new Wled(options);
} else {
    // otherwise start the instance directly
    new Wled();
}
