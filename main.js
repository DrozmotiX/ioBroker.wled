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
const { validateByteValue, validateSegmentColors } = require('./lib/validation.js'); // Load validation helpers
const adminApi = require('./lib/admin-api.js'); // Helpers for the settings page (#266)

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
const ON_DEMAND_RECONNECT_COOLDOWN = 5000; // Minimum time between two reconnect attempts triggered by commands (ms)

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
        // tt and udpn.nn waiting for the next command, per device IP (#961)
        this.oneShotOptions = {};
        this.effects = {};
        this.palettes = {};
        this.createdStatesDetails = {};
        this.bonjourBrowser = null;
        this.watchDogStarted = false;
        this.watchedDevices = new Set();

        this.deviceManagement = new dmWled(this);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Guard against invalid settings, 0 or empty values would create timers without delay
        const timeSync = Number(this.config.Time_Sync);
        if (!Number.isFinite(timeSync) || timeSync < 1) {
            this.log.warn(`Invalid polling interval "${this.config.Time_Sync}", using 30 seconds`);
            this.config.Time_Sync = 30;
        } else {
            this.config.Time_Sync = timeSync;
        }
        const maxRetries = Number(this.config.maxRetries);
        if (!Number.isInteger(maxRetries) || maxRetries < 1) {
            this.log.warn(`Invalid number of retry attempts "${this.config.maxRetries}", using 5`);
            this.config.maxRetries = 5;
        } else {
            this.config.maxRetries = maxRetries;
        }

        await this.resetOnlineStates();

        // Read already known devices
        await this.tryKnownDevices();

        // Run Autodetect (Bonjour - Service, mDNS to be handled) unless switched off in the instance settings.
        // A search started by hand in the Device Manager (Discover) still works when it is switched off.
        if (this.config.autoDiscovery !== false) {
            await this.scanDevices();
        } else {
            this.log.info(
                'Automatic discovery (Bonjour/mDNS) is switched off, only known and manually added devices are used',
            );
        }

        // Set connection state to online when adapter is ready
        this.setState('info.connection', true, true);

        // Reset timer (if running) and start 10s delay to r un watchdog
        if (watchDogStartDelay) {
            this.clearTimeout(watchDogStartDelay);
            watchDogStartDelay = null;
        }
        watchDogStartDelay = this.setTimeout(() => {
            // Start watchdog for each  device
            this.watchDogStarted = true;
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
                this.clearTimeout(watchDogStartDelay);
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

                // States handled by the adapter itself, they are not sent to WLED as they are
                if (deviceId[3] === 'bundleCommands' && deviceId[4] === undefined) {
                    await this.setBundleCommands(deviceId[2], state.val !== false && state.val !== 0);
                    return;
                }
                if (deviceId[3] === 'seg' && deviceId[5] === 'last' && deviceId[6] === 'restore') {
                    await this.restoreLastValues(id, deviceId[2], deviceId[4]);
                    return;
                }
                if (deviceId[3] === 'light' && deviceId[5] === undefined) {
                    await this.handleLightCommand(id, deviceId[2], deviceId[4], state.val);
                    return;
                }

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

                            // Commands still waiting to be bundled are sent first, so the order is kept
                            await this.flushCommands(device_ip);

                            // Send raw command to /win endpoint with query parameters
                            const params = new URLSearchParams(state.val);
                            const url = `http://${device_ip}/win?${params.toString()}`;
                            this.log.debug(`Sending raw command to: ${url}`);

                            try {
                                const result = await axios.get(url);

                                this.log.debug(`Raw command response: ${JSON.stringify(result.data)}`);

                                // Acknowledge the state change only when the device accepted the command
                                this.setState(id, {
                                    val: state.val,
                                    ack: true,
                                });

                                // The device answered: forget earlier failed attempts, so the poll below is not skipped
                                deviceRetryCount[device_ip] = 0;
                                deviceRetryDelay[device_ip] = this.config.Time_Sync * 1000;

                                // Trigger a device poll to update states after a short delay
                                this.setTimeout(() => {
                                    this.watchDog(device_ip);
                                }, 500);
                            } catch (error) {
                                this.log.warn(`Failed to send raw command to ${device_ip}: ${error.message}`);
                            }

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

                        // WLED 0.15 and newer ignore udpn.recv, reception is switched by the receive groups (#960)
                        if (deviceId[3] === 'udpn' && deviceId[4] === 'recv') {
                            values.udpn.rgrp = await this.receiveGroups(deviceId[2], state.val);
                        }
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
                                    const colorTertiaryHex = await this.getStateAsync(`${color_root}.2_HEX`);
                                    if (!colorTertiaryHex) {
                                        return;
                                    }

                                    // Translate HEX values into the WLED colour format.
                                    // An 8-digit HEX carries the white channel, a 6-digit HEX keeps the current white value.
                                    rgb_all = [];
                                    for (const [index, hexState] of [
                                        colorPrimaryHex,
                                        colorSecondaryHex,
                                        colorTertiaryHex,
                                    ].entries()) {
                                        const currentRgb = await this.getStateAsync(`${color_root}.${index}`);
                                        rgb_all.push(this.hexToWledColor(hexState.val, currentRgb?.val));
                                    }

                                    this.log.debug(`Converted RGB values of HEX input : ${JSON.stringify(rgb_all)}`);
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

                // tt and udpn.nn only apply to the command they are part of, WLED ignores them on their own.
                // They are kept and sent with the next command to the device (#961)
                if (values !== null && this.isOneShotOption(deviceId)) {
                    this.rememberOneShotOption(device_ip, values, { id, val: state.val });
                    return;
                }

                // Only make API call when values are correct
                if (values !== null && device_ip !== null) {
                    // Device unknown or offline: the command can not be delivered
                    if (!this.devices[device_ip] || !this.devices[device_ip].connected) {
                        // Try to reach a known device right away instead of waiting for the next watchdog run,
                        // which can be up to one hour away after several failed attempts
                        if (!(await this.reconnectOnDemand(device_ip))) {
                            this.log.warn(
                                `Device ${deviceId[2]} (${device_ip}) is offline, command for ${id} discarded`,
                            );
                            return;
                        }
                        this.log.debug(
                            `Device ${deviceId[2]} (${device_ip}) is reachable again, sending command for ${id}`,
                        );
                    }

                    await this.sendCommand(device_ip, values, [{ id, val: state.val }]);
                }
            }
        } catch (error) {
            this.errorHandler(`[onStateChange]`, error);
        }
    }

    /**
     * Send a command to a device. Commands for the same device that follow each other within
     * the bundle delay are merged into one command (#926), unless bundling is switched off for
     * the device (state bundleCommands) or for the instance (bundleDelay = 0).
     *
     * @param {string} deviceIP IP-Address of device
     * @param {object} values JSON command for the WLED JSON-API
     * @param {Array<{id: string, val: ioBroker.StateValue}>} acks states to acknowledge when the device accepted the command
     */
    async sendCommand(deviceIP, values, acks) {
        const device = this.devices[deviceIP];
        if (!device) {
            return;
        }
        ({ values, acks } = this.takeOneShotOptions(deviceIP, values, acks));
        const delay = this.bundleDelay();
        if (delay <= 0 || device.bundleCommands === false) {
            await this.flushCommands(deviceIP);
            await this.deliverCommand(deviceIP, values, acks);
            return;
        }

        // A command that can not be merged with the waiting one (e.g. a second toggle) sends the waiting one first
        if (device.pendingCommand && !this.canMergeCommands(device.pendingCommand.values, values)) {
            await this.flushCommands(deviceIP);
        }
        if (!device.pendingCommand) {
            device.pendingCommand = { values: {}, acks: [] };
            device.pendingTimer = this.setTimeout(() => {
                device.pendingTimer = null;
                this.flushCommands(deviceIP);
            }, delay);
        }
        device.pendingCommand.values = this.mergeCommands(device.pendingCommand.values, values);
        device.pendingCommand.acks.push(...acks);
        this.log.debug(`Command for ${deviceIP} waits ${delay} ms to be bundled: ${JSON.stringify(values)}`);
    }

    /**
     * States that WLED applies only to the command they are part of (tt, udpn.nn)
     *
     * @param {string[]} deviceId state id split at the dots
     * @returns {boolean} true for tt and udpn.nn of a device
     */
    isOneShotOption(deviceId) {
        if (deviceId[3] === 'tt' && deviceId[4] === undefined) {
            return true;
        }
        return deviceId[3] === 'udpn' && deviceId[4] === 'nn' && deviceId[5] === undefined;
    }

    /**
     * Keep tt or udpn.nn for the next command to the device, a newer value replaces an older one
     *
     * @param {string} deviceIP IP-Address of device
     * @param {object} values option as JSON command, e.g. {tt: 20}
     * @param {{id: string, val: ioBroker.StateValue}} ack state to acknowledge when the next command was accepted
     */
    rememberOneShotOption(deviceIP, values, ack) {
        const waiting = this.oneShotOptions[deviceIP] || { values: {}, acks: [] };
        waiting.values = this.mergeCommands(waiting.values, values);
        waiting.acks = waiting.acks.filter(other => other.id !== ack.id);
        waiting.acks.push(ack);
        this.oneShotOptions[deviceIP] = waiting;
        this.log.debug(`${JSON.stringify(values)} for ${deviceIP} is sent with the next command`);
    }

    /**
     * Add the kept tt and udpn.nn to a command and forget them. A value in the command itself wins.
     *
     * @param {string} deviceIP IP-Address of device
     * @param {object} values JSON command for the WLED JSON-API
     * @param {Array<{id: string, val: ioBroker.StateValue}>} acks states to acknowledge with the command
     * @returns {{values: object, acks: Array<{id: string, val: ioBroker.StateValue}>}} command with the options
     */
    takeOneShotOptions(deviceIP, values, acks) {
        const waiting = this.oneShotOptions[deviceIP];
        if (!waiting) {
            return { values, acks };
        }
        delete this.oneShotOptions[deviceIP];
        return { values: this.mergeCommands(waiting.values, values), acks: [...waiting.acks, ...acks] };
    }

    /**
     * Send the command waiting to be bundled for a device at once
     *
     * @param {string} deviceIP IP-Address of device
     */
    async flushCommands(deviceIP) {
        const device = this.devices[deviceIP];
        if (!device || !device.pendingCommand) {
            return;
        }
        if (device.pendingTimer) {
            this.clearTimeout(device.pendingTimer);
            device.pendingTimer = null;
        }
        const pending = device.pendingCommand;
        device.pendingCommand = null;
        try {
            await this.deliverCommand(deviceIP, pending.values, pending.acks);
        } catch (error) {
            this.errorHandler(`[flushCommands]`, error);
        }
    }

    /**
     * Bundle delay in ms from the instance settings, 0 switches bundling off
     *
     * @returns {number} delay in ms
     */
    bundleDelay() {
        const delay = Number(this.config?.bundleDelay ?? 50);
        if (!Number.isFinite(delay) || delay <= 0) {
            return 0;
        }
        return Math.min(delay, 1000);
    }

    /**
     * Two commands can be merged unless the same value is set twice with a relative or toggle value
     * (e.g. "t" or "~10"), a segment is addressed without id, or both set individual LEDs (i) of the same segment,
     * which WLED applies one after the other
     *
     * @param {object} first command waiting to be sent
     * @param {object} second new command
     * @returns {boolean} true when both can be sent as one command
     */
    canMergeCommands(first, second) {
        const segmentsWithId = command => {
            if (command.seg === undefined) {
                return true;
            }
            const segments = Array.isArray(command.seg) ? command.seg : [command.seg];
            return segments.every(segment => segment && typeof segment === 'object' && segment.id !== undefined);
        };
        if (!segmentsWithId(first) || !segmentsWithId(second)) {
            return false;
        }
        const conflict = (a, b) => {
            for (const key of Object.keys(b)) {
                if (!(key in a)) {
                    continue;
                }
                if (key === 'seg') {
                    const segA = Array.isArray(a.seg) ? a.seg : [a.seg];
                    const segB = Array.isArray(b.seg) ? b.seg : [b.seg];
                    for (const segment of segB) {
                        const match = segA.find(other => String(other.id) === String(segment.id));
                        if (match && conflict(match, segment)) {
                            return true;
                        }
                    }
                } else if (this.isPlainObject(a[key]) && this.isPlainObject(b[key])) {
                    if (conflict(a[key], b[key])) {
                        return true;
                    }
                } else if (typeof a[key] === 'string' || typeof b[key] === 'string') {
                    return true;
                } else if (key === 'i') {
                    // Individual LEDs are sent in parts, a later part must not replace an earlier one
                    return true;
                }
            }
            return false;
        };
        return !conflict(first, second);
    }

    /**
     * Merge two commands for the WLED JSON-API, later values win.
     * Segments are merged by their id and always sent as array.
     *
     * @param {object} first command waiting to be sent
     * @param {object} second new command
     * @returns {object} merged command
     */
    mergeCommands(first, second) {
        const result = { ...first };
        for (const [key, value] of Object.entries(second)) {
            if (key === 'seg') {
                const segments = Array.isArray(result.seg) ? result.seg.map(segment => ({ ...segment })) : [];
                if (this.isPlainObject(result.seg)) {
                    segments.push({ ...result.seg });
                }
                for (const segment of Array.isArray(value) ? value : [value]) {
                    const match = segments.find(other => String(other.id) === String(segment.id));
                    if (match) {
                        Object.assign(match, segment);
                    } else {
                        segments.push({ ...segment });
                    }
                }
                result.seg = segments;
            } else if (this.isPlainObject(result[key]) && this.isPlainObject(value)) {
                result[key] = this.mergeCommands(result[key], value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * @param {unknown} value value to check
     * @returns {boolean} true for an object that is not an array
     */
    isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * Deliver a command to the device by websocket or http-API and acknowledge the states
     *
     * @param {string} deviceIP IP-Address of device
     * @param {object} values JSON command for the WLED JSON-API
     * @param {Array<{id: string, val: ioBroker.StateValue}>} acks states to acknowledge when the device accepted the command
     */
    async deliverCommand(deviceIP, values, acks) {
        const device = this.devices[deviceIP];
        if (!device) {
            return;
        }
        const names = acks.map(ack => ack.id).join(', ');
        const acknowledge = () => {
            // Only the last value written to a state is acknowledged
            const latest = new Map();
            for (const ack of acks) {
                latest.set(ack.id, ack.val);
            }
            for (const [stateId, val] of latest) {
                this.setState(stateId, { val, ack: true });
            }
        };

        // If websocket is connected, send message by websocket otherwise http-API
        if (device.wsConnected && ws[deviceIP]) {
            this.log.debug(`Sending state change by websocket ${JSON.stringify(values)}`);
            ws[deviceIP].send(JSON.stringify(values), error => {
                if (error) {
                    this.log.warn(`Sending command for ${names} to ${deviceIP} failed: ${error.message}`);
                    return;
                }
                // Set state acknowledgement when the message was sent successfully
                acknowledge();
            });
            return;
        }

        this.log.debug(`Sending state change by http-API ${JSON.stringify(values)}`);
        const result = await this.postAPI(`http://${deviceIP}/json`, values);
        if (!result) {
            return;
        }
        this.log.debug(`API feedback${JSON.stringify(result)}`);
        if (result.success === true) {
            // Set state acknowledgement if  API call was successfully
            acknowledge();
        }
    }

    /**
     * Switch bundling of commands on or off for one device (state bundleCommands)
     *
     * @param {string} mac MAC address (device id)
     * @param {boolean} enabled true to bundle commands
     */
    async setBundleCommands(mac, enabled) {
        const deviceIP = this.getDeviceIpByMac(mac);
        if (deviceIP) {
            this.devices[deviceIP].bundleCommands = enabled;
            if (!enabled) {
                await this.flushCommands(deviceIP);
            }
        }
        this.log.info(`Bundling of commands for ${mac} switched ${enabled ? 'on' : 'off'}`);
        await this.setStateAsync(`${mac}.bundleCommands`, enabled, true);
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
                case 'getDevices':
                    // Device list of the settings page (#266)
                    respond(await this.adminGetDevices(), this);
                    break;
                case 'discover':
                    // Search new devices from the settings page (#266)
                    respond(await this.adminDiscover(obj.message), this);
                    break;
                case 'addDevice':
                    // Settings page sends { ip }, scripts may still send the IP as text and get 'success' / 'failed'
                    if (obj.message && typeof obj.message === 'object') {
                        respond(await this.adminAddDevice(obj.message.ip), this);
                        break;
                    }
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
                    // Settings page sends { id: MAC }, scripts may still send the IP as text
                    if (obj.message && typeof obj.message === 'object') {
                        respond(await this.adminDeleteDevice(obj.message.id), this);
                        break;
                    }
                    // Delete device by IP address or device ID
                    // eslint-disable-next-line no-case-declarations
                    const deviceIP = obj.message;
                    this.log.debug(`Delete device request received for IP: ${deviceIP}`);

                    try {
                        // Find device ID (MAC address) by IP address. A device that is offline since
                        // adapter start may be missing from the devices array, so check the object tree as well
                        let deviceId = this.devices[deviceIP]?.mac || null;
                        if (!deviceId) {
                            const knownDevices = await this.getDevicesAsync();
                            const knownDevice = knownDevices.find(device => device.native?.ip === deviceIP);
                            deviceId = knownDevice?.native?.mac || null;
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

                        // Validate segment id and range, numbers given as text are accepted
                        const segId = Number(segmentId);
                        const segStart = addSegmentMsg.start !== undefined ? Number(addSegmentMsg.start) : 0;
                        const segStop = addSegmentMsg.stop !== undefined ? Number(addSegmentMsg.stop) : 1;
                        let rangeError = null;
                        if (!Number.isInteger(segId) || segId < 0 || segId > 31) {
                            rangeError = `segmentId must be a whole number between 0 and 31, received ${segmentId}`;
                        } else if (!Number.isInteger(segStart) || segStart < 0) {
                            rangeError = `start must be a whole number >= 0, received ${addSegmentMsg.start}`;
                        } else if (!Number.isInteger(segStop) || segStop <= segStart) {
                            rangeError = `stop must be a whole number greater than start, received ${addSegmentMsg.stop}`;
                        }
                        if (rangeError) {
                            this.log.warn(`addSegment: ${rangeError}`);
                            respond({ success: false, error: rangeError }, this);
                            break;
                        }

                        // Build segment configuration object
                        const segmentConfig = {
                            id: segId,
                            start: segStart,
                            stop: segStop,
                        };

                        // Add optional properties if provided
                        if (addSegmentMsg.on !== undefined) {
                            // normalize to boolean
                            segmentConfig.on = !!addSegmentMsg.on;
                        }
                        if (addSegmentMsg.bri !== undefined) {
                            const bri = validateByteValue(addSegmentMsg.bri, 'bri', this.log, 'addSegment');
                            if (bri !== undefined) {
                                segmentConfig.bri = bri;
                            }
                        }
                        if (addSegmentMsg.fx !== undefined) {
                            const fx = validateByteValue(addSegmentMsg.fx, 'fx', this.log, 'addSegment');
                            if (fx !== undefined) {
                                segmentConfig.fx = fx;
                            }
                        }
                        if (addSegmentMsg.sx !== undefined) {
                            const sx = validateByteValue(addSegmentMsg.sx, 'sx', this.log, 'addSegment');
                            if (sx !== undefined) {
                                segmentConfig.sx = sx;
                            }
                        }
                        if (addSegmentMsg.ix !== undefined) {
                            const ix = validateByteValue(addSegmentMsg.ix, 'ix', this.log, 'addSegment');
                            if (ix !== undefined) {
                                segmentConfig.ix = ix;
                            }
                        }
                        if (addSegmentMsg.pal !== undefined) {
                            const pal = validateByteValue(addSegmentMsg.pal, 'pal', this.log, 'addSegment');
                            if (pal !== undefined) {
                                segmentConfig.pal = pal;
                            }
                        }
                        if (addSegmentMsg.col !== undefined) {
                            const col = validateSegmentColors(addSegmentMsg.col, this.log, 'addSegment');
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
                        await new Promise(resolve => this.setTimeout(resolve, 1000));
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
                        await new Promise(resolve => this.setTimeout(resolve, 1000));
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
     * Device list for the settings page (#266)
     *
     * @returns {Promise<{ok: boolean, devices?: object[], error?: string}>} answer
     */
    async adminGetDevices() {
        try {
            const objects = await this.getDevicesAsync();
            const states = {};
            for (const obj of objects) {
                for (const id of adminApi.deviceStateIds(obj._id)) {
                    const state = await this.getForeignStateAsync(id);
                    if (state) {
                        states[id] = state;
                    }
                }
            }
            return {
                ok: true,
                devices: adminApi.buildDeviceList(objects, states, this.devices, this.namespace),
            };
        } catch (error) {
            this.log.error(`[adminGetDevices] ${error instanceof Error ? error.message : error}`);
            return { ok: false, error: 'internal' };
        }
    }

    /**
     * Add a device by IP or host name from the settings page (#266)
     *
     * @param {any} input address as entered
     * @returns {Promise<{ok: boolean, id?: string, error?: string, host?: string}>} answer
     */
    async adminAddDevice(input) {
        const checked = adminApi.normalizeHost(input);
        if (!checked.ok) {
            return { ok: false, error: checked.error };
        }
        const host = checked.host;
        try {
            const known = (await this.getDevicesAsync()).find(device => device.native?.ip === host);
            if (known) {
                return { ok: false, error: 'exists', id: known.native?.mac, host };
            }
            const result = await this.getDeviceJSON(host);
            if (result !== 'success') {
                return { ok: false, error: 'unreachable', host };
            }
            return { ok: true, id: this.devices[host]?.mac, host };
        } catch (error) {
            this.log.error(`[adminAddDevice] ${error instanceof Error ? error.message : error}`);
            return { ok: false, error: 'internal', host };
        }
    }

    /**
     * Delete a device by its id (MAC) from the settings page (#266)
     *
     * @param {any} id device id
     * @returns {Promise<{ok: boolean, error?: string}>} answer
     */
    async adminDeleteDevice(id) {
        if (typeof id !== 'string' || !id || id.includes('.')) {
            return { ok: false, error: 'invalid' };
        }
        const obj = await this.getObjectAsync(id);
        if (!obj || obj.type !== 'device') {
            return { ok: false, error: 'notFound' };
        }
        const deleted = await this.delDevice(`${this.namespace}.${id}`);
        return deleted ? { ok: true } : { ok: false, error: 'internal' };
    }

    /**
     * Search devices with Bonjour on request of the settings page (#266).
     * Found devices are added by the Bonjour handler, the answer reports how many are new.
     *
     * @param {any} message optional { seconds }
     * @returns {Promise<{ok: boolean, found?: number, error?: string}>} answer
     */
    async adminDiscover(message) {
        const seconds = Math.min(Math.max(Number(message?.seconds) || 8, 2), 30);
        try {
            const before = new Set((await this.getDevicesAsync()).map(device => device._id));
            await this.scanDevices();
            await new Promise(resolve => this.setTimeout(resolve, seconds * 1000));
            const after = await this.getDevicesAsync();
            return { ok: true, found: after.filter(device => !before.has(device._id)).length };
        } catch (error) {
            this.log.error(`[adminDiscover] ${error instanceof Error ? error.message : error}`);
            return { ok: false, error: 'internal' };
        }
    }

    /**
     * Translate a HEX colour into the WLED colour array [r, g, b] or [r, g, b, w]
     *
     * @param {string} hexValue HEX colour, 6 digits (RGB) or 8 digits (RGB + white)
     * @param {any} currentRgb current value of the matching RGB state, used to keep the white channel
     * @returns {number[]} colour array for WLED
     */
    hexToWledColor(hexValue, currentRgb) {
        const hex = String(hexValue).trim().replace(/^#/, '');
        const rgb = hexRgb(hex);
        const color = [rgb.red, rgb.green, rgb.blue];
        if (hex.length === 8 || hex.length === 4) {
            // HEX contains the white channel as alpha value (0-1), WLED expects 0-255
            color.push(Math.round(rgb.alpha * 255));
            return color;
        }
        // 6-digit HEX: keep the current white value of the device, if known
        let current = currentRgb;
        if (typeof current === 'string') {
            current = current
                .replace(/[[\]]/g, '')
                .split(',')
                .map(s => parseInt(s));
        }
        if (Array.isArray(current) && current.length > 3 && !isNaN(current[3])) {
            color.push(current[3]);
        }
        return color;
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
            this.devices[deviceIP].wsSupported = true;
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
                        this.clearTimeout(watchdogWsTimer[deviceIP]);
                        watchdogWsTimer[deviceIP] = null;
                    }
                    this.devices[deviceIP].wsPingSupported = true;
                    this.devices[deviceIP].wsPong = true;
                    // Device answered, refresh online state and its expiry timer
                    if (this.devices[deviceIP].mac != null) {
                        await this.create_state(`${this.devices[deviceIP].mac}._info._online`, 'Online status', true);
                    }
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
        const socket = ws[deviceIP];
        socket.on('close', () => {
            // Ignore the closure of an old connection that was already replaced by a new one
            if (ws[deviceIP] !== socket) {
                return;
            }
            if (this.devices[deviceIP]?.wsSupported === true) {
                this.log.info(`${this.devices[deviceIP].name} disconnected`);
                this.devices[deviceIP].connected = false;
                this.devices[deviceIP].initialized = false;
                this.devices[deviceIP].wsConnected = false;

                this.setState(`${this.devices[deviceIP].mac}._info._online`, false, true);
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
                // Keep a name that was changed in ioBroker: only take over the WLED name if the object is new
                // or its name still equals the WLED name that was synchronised last time
                const existing = await this.getObjectAsync(device_id);
                const lastWledName = existing?.native?.wledName;
                const keepName =
                    existing?.common?.name !== undefined &&
                    lastWledName !== undefined &&
                    existing.common.name !== lastWledName;
                const common = {
                    statusStates: {
                        onlineId: `${this.namespace}.${device_id}._info._online`,
                    },
                };
                if (!keepName) {
                    common.name = deviceData.info.name;
                }
                await this.extendObjectAsync(device_id, {
                    type: 'device',
                    common,
                    native: {
                        ip: deviceIP,
                        mac: device_id,
                        wledName: deviceData.info.name,
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

            // Effect and palette lists can change with a new firmware: on every (re)connect the
            // drop-down lists of fx and pal are written again with the current lists of the device
            for (const stateName in this.createdStatesDetails) {
                if (stateName.startsWith(`${device_id}.`) && /\.(fx|pal)$/.test(stateName)) {
                    delete this.createdStatesDetails[stateName];
                }
            }

            // Create additional states not included in JSON-API of WLED but available as SET command
            await this.create_state(`${device_id}.tt`, 'tt', '');
            await this.create_state(`${device_id}.psave`, 'psave', '');
            await this.create_state(`${device_id}.udpn.nn`, 'nn', '');
            await this.create_state(`${device_id}.time`, 'time', null);
            await this.create_state(`${device_id}.action`, 'action', '');
            await this.create_state(`${device_id}.rawCommand`, 'rawCommand', '');
            // Bundling of commands (#926): on for new devices, the value set by the user is kept
            await this.create_state(`${device_id}.bundleCommands`, 'bundleCommands', null);
            const bundleState = await this.getStateAsync(`${device_id}.bundleCommands`);
            if (bundleState === null || bundleState === undefined || bundleState.val === null) {
                await this.setStateAsync(`${device_id}.bundleCommands`, true, true);
                this.devices[deviceIP].bundleCommands = true;
            } else {
                this.devices[deviceIP].bundleCommands = bundleState.val !== false;
            }
            // Reboot button (WLED JSON-API command "rb"); hp (Hue sync) and rd (realtime UDP) are created from the state data when the device provides them
            await this.create_state(`${device_id}.rb`, 'rb', null);

            // Create structure for all states
            await this.handleStates(deviceData, deviceIP);

            // Devices added after start (Discover, manual IP) need their own watchdog
            if (this.watchDogStarted && !this.watchedDevices.has(deviceIP)) {
                this.watchDog(deviceIP);
            }
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
                            // Usermod values are handled by updateUsermodStates below
                            break;

                        default:
                    }
                }

                // Usermod values get their own states with cleaned ids (#929)
                if (i === 'u') {
                    await this.updateUsermodStates(infoStates.mac, ipAddress, infoStates.u);
                    continue;
                }

                // Create states, ensure object structures are reflected in tree
                if (typeof infoStates[i] !== 'object') {
                    // Default channel creation
                    this.log.debug(`State created : ${i} : ${JSON.stringify(infoStates[i])}`);
                    await this.create_state(`${infoStates.mac}._info.${i}`, this.infoAttribute(i), infoStates[i]);
                } else {
                    for (const y in infoStates[i]) {
                        this.log.debug(`State created : ${y} : ${JSON.stringify(infoStates[i][y])}`);
                        await this.create_state(
                            `${infoStates.mac}._info.${i}.${y}`,
                            this.infoAttribute(i, y),
                            infoStates[i][y],
                        );
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

                        // Segments are stored by their WLED segment id; segments added or removed in WLED are synchronised
                        await this.syncSegments(infoStates.mac, ipAddress, deviceStates[i]);

                        for (const y in deviceStates[i]) {
                            const segKey = this.segmentKey(deviceStates[i][y], y);
                            if (!this.devices[ipAddress].initialized) {
                                await this.setObjectNotExistsAsync(`${infoStates.mac}.seg.${segKey}`, {
                                    type: 'channel',
                                    common: {
                                        name: `Segment ${segKey}`,
                                    },
                                    native: {},
                                });
                            }

                            // Remember the colour, effect and palette used before the last change (#930)
                            await this.trackLastValues(infoStates.mac, ipAddress, segKey, deviceStates[i][y]);

                            for (const x in deviceStates[i][y]) {
                                this.log.debug(
                                    `Object states created for channel ${i} with parameter : ${y} : ${JSON.stringify(
                                        deviceStates[i][y],
                                    )}`,
                                );

                                if (x !== 'col') {
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${segKey}.${x}`,
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
                                        `${infoStates.mac}.${i}.${segKey}.${x}.0`,
                                        'Primary Color RGB',
                                        deviceStates[i][y][x][0],
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${segKey}.${x}.0_HEX`,
                                        'Primary Color HEX',
                                        `#${primaryHex}`,
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${segKey}.${x}.1`,
                                        'Secondary Color RGB (background)',
                                        deviceStates[i][y][x][1],
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${segKey}.${x}.1_HEX`,
                                        'Secondary Color HEX (background)',
                                        `#${secondaryHex}`,
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${segKey}.${x}.2`,
                                        'Tertiary Color RGB',
                                        deviceStates[i][y][x][2],
                                    );
                                    await this.create_state(
                                        `${infoStates.mac}.${i}.${segKey}.${x}.2_HEX`,
                                        'Tertiary Color HEX',
                                        `#${tertiaryHex}`,
                                    );
                                }
                            }
                        }

                        break;

                    case 'u':
                        await this.localDeleteState(`${infoStates.mac}.u`);
                        // Usermod data is not stored in the state section, skip state creation
                        continue;

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

            // Light structure for the type detector (iot, Alexa, Google Home)
            await this.updateLightStates(infoStates.mac, ipAddress, deviceStates);

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
     * Receive groups to send with udpn.recv: 0 switches reception off, otherwise the receive groups
     * the device reported last, or group 1 (#960)
     *
     * @param {string} mac MAC address (device id)
     * @param {ioBroker.StateValue} receive value written to udpn.recv
     * @returns {Promise<number>} receive groups for the WLED JSON-API
     */
    async receiveGroups(mac, receive) {
        if (receive === false || receive === 0 || receive === 'false') {
            return 0;
        }
        const current = await this.getStateAsync(`${mac}.udpn.rgrp`);
        return typeof current?.val === 'number' && current.val > 0 ? current.val : 1;
    }

    /**
     * Attribute definition for a value of the info section. Keys that also exist as a command in the
     * state section get their own read-only definition, e.g. info.time is a text while the command time is a number (#956).
     *
     * The same applies to info.leds.cct, a flag that is not the colour temperature command cct (#962).
     *
     * @param {string} key key in the info section of WLED
     * @param {string} [subKey] key inside a nested object of the info section, e.g. cct in leds
     * @returns {string} name of the attribute definition in stateAttr
     */
    infoAttribute(key, subKey) {
        if (subKey !== undefined) {
            return key === 'leds' && subKey === 'cct' ? 'infoLedsCct' : subKey;
        }
        return key === 'time' ? 'infoTime' : key;
    }

    /**
     * Remember colour, effect and palette of a segment before they were changed last (#930).
     * The states in seg.<id>.last hold the values used before the latest change, e.g. the colour before
     * a notification made the strip blink; the button seg.<id>.last.restore sets them again.
     *
     * @param {string} mac MAC address (device id)
     * @param {string} ipAddress IP address of the device
     * @param {string} segKey segment id
     * @param {object} segment segment data reported by WLED
     */
    async trackLastValues(mac, ipAddress, segKey, segment) {
        const device = this.devices[ipAddress];
        if (!device || !segment || typeof segment !== 'object') {
            return;
        }
        if (!device.segmentValues) {
            device.segmentValues = {};
        }
        const current = {
            col: Array.isArray(segment.col) ? JSON.stringify(segment.col) : undefined,
            fx: segment.fx,
            pal: segment.pal,
        };
        const root = `${mac}.seg.${segKey}.last`;
        const known = device.segmentValues[segKey];
        if (!device.initialized || !known) {
            await this.setObjectNotExistsAsync(root, {
                type: 'channel',
                common: { name: 'Values before the last change' },
                native: {},
            });
            await this.create_state(`${root}.restore`, 'lastRestore', null);
            await this.create_state(`${root}.col`, 'lastCol', null);
            await this.create_state(`${root}.fx`, 'lastFx', null);
            await this.create_state(`${root}.pal`, 'lastPal', null);
        }
        if (known) {
            if (current.col !== undefined && known.col !== undefined && current.col !== known.col) {
                await this.create_state(`${root}.col`, 'lastCol', known.col);
            }
            if (current.fx !== undefined && known.fx !== undefined && current.fx !== known.fx) {
                await this.create_state(`${root}.fx`, 'lastFx', known.fx);
            }
            if (current.pal !== undefined && known.pal !== undefined && current.pal !== known.pal) {
                await this.create_state(`${root}.pal`, 'lastPal', known.pal);
            }
        }
        device.segmentValues[segKey] = current;
    }

    /**
     * Send colour, effect and palette used before the last change back to the segment (#930)
     *
     * @param {string} id full state id of the restore button
     * @param {string} mac MAC address (device id)
     * @param {string} segKey segment id
     */
    async restoreLastValues(id, mac, segKey) {
        const deviceIP = this.getDeviceIpByMac(mac);
        if (!deviceIP || !this.devices[deviceIP].connected) {
            if (!deviceIP || !(await this.reconnectOnDemand(deviceIP))) {
                this.log.warn(`Device ${mac} is offline, command for ${id} discarded`);
                return;
            }
        }
        const root = `${mac}.seg.${segKey}.last`;
        const segment = { id: Number(segKey) };
        const col = await this.getStateAsync(`${root}.col`);
        if (typeof col?.val === 'string' && col.val !== '') {
            try {
                const colors = JSON.parse(col.val);
                if (Array.isArray(colors)) {
                    segment.col = colors;
                }
            } catch {
                this.log.debug(`Stored colour of ${root} is not valid JSON: ${col.val}`);
            }
        }
        for (const key of ['fx', 'pal']) {
            const state = await this.getStateAsync(`${root}.${key}`);
            if (typeof state?.val === 'number') {
                segment[key] = state.val;
            }
        }
        if (Object.keys(segment).length === 1) {
            this.log.info(`Nothing to restore for segment ${segKey} of ${mac}, no change recorded yet`);
            return;
        }
        await this.sendCommand(deviceIP, { seg: segment }, [{ id, val: true }]);
    }

    /**
     * Turn usermod data of WLED (info.u) into states (#929). WLED shows these values on its info page;
     * keys and values may contain HTML, which is removed. A value is [value] or [value, unit].
     * Values of usermods that read buttons, contacts or GPIO pins appear here as well (#928, #931).
     *
     * @param {string} mac MAC address (device id)
     * @param {string} ipAddress IP address of the device
     * @param {object} usermods info.u as reported by WLED
     */
    async updateUsermodStates(mac, ipAddress, usermods) {
        const device = this.devices[ipAddress];
        const entries = this.usermodEntries(usermods);
        if (device) {
            device.hasUsermods = entries.length > 0;
        }
        const channel = `${mac}._info.u`;

        // At (re)initialisation remove states that do not belong to the current usermod data,
        // e.g. states with HTML in their id created by older versions
        if (device && !device.initialized) {
            const valid = new Set(entries.map(entry => `${this.namespace}.${channel}.${entry.id}`));
            const existing = await this.getObjectViewAsync('system', 'state', {
                startkey: `${this.namespace}.${channel}.`,
                endkey: `${this.namespace}.${channel}.\u9999`,
            });
            for (const row of existing?.rows || []) {
                if (!valid.has(row.id)) {
                    this.log.debug(`Removing outdated usermod state ${row.id}`);
                    await this.localDeleteState(row.id.slice(this.namespace.length + 1));
                    delete this.createdStatesDetails[row.id.slice(this.namespace.length + 1)];
                }
            }
        }
        if (entries.length === 0) {
            return;
        }

        if (device && !device.initialized) {
            await this.extendObjectAsync(channel, {
                type: 'channel',
                common: { name: 'Usermods' },
                native: {},
            });
        }
        for (const entry of entries) {
            const stateName = `${channel}.${entry.id}`;
            const common = {
                name: entry.name,
                type: entry.type,
                role: entry.type === 'number' ? 'value' : entry.type === 'boolean' ? 'indicator' : 'text',
                unit: entry.unit,
                read: true,
                write: false,
            };
            if (JSON.stringify(this.createdStatesDetails[stateName]) !== JSON.stringify(common)) {
                await this.extendObjectAsync(stateName, { type: 'state', common, native: {} });
                this.createdStatesDetails[stateName] = common;
            }
            await this.setStateChangedAsync(stateName, { val: entry.value, ack: true });
        }
    }

    /**
     * Read info of a device by http-API to refresh its usermod values while it is connected by websocket
     *
     * @param {string} deviceIP IP-Address of device
     */
    async refreshUsermods(deviceIP) {
        try {
            const response = await axios.get(`http://${deviceIP}/json/info`, { timeout: 3000 });
            const mac = this.devices[deviceIP]?.mac;
            if (mac && response?.data) {
                await this.updateUsermodStates(mac, deviceIP, response.data.u);
            }
        } catch (error) {
            this.log.debug(`Reading usermod values of ${deviceIP} failed: ${error}`);
        }
    }

    /**
     * Clean usermod data into a list of states
     *
     * @param {object} usermods info.u as reported by WLED
     * @returns {Array<{id: string, name: string, value: ioBroker.StateValue, type: ioBroker.CommonType, unit: string}>} states
     */
    usermodEntries(usermods) {
        if (!this.isPlainObject(usermods)) {
            return [];
        }
        const entries = [];
        const usedIds = new Set();
        let index = 0;
        for (const [key, raw] of Object.entries(usermods)) {
            index++;
            const name = this.stripHtml(key) || `Usermod ${index}`;
            let id = name
                .replace(/[^A-Za-z0-9_-]+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
            if (!id) {
                id = `usermod_${index}`;
            }
            while (usedIds.has(id)) {
                id = `${id}_${index}`;
            }
            usedIds.add(id);

            let value = Array.isArray(raw) ? raw[0] : raw;
            const unit = Array.isArray(raw) && typeof raw[1] === 'string' ? this.stripHtml(raw[1]) : '';
            if (typeof value === 'string') {
                value = this.stripHtml(value);
                if (value !== '' && !isNaN(Number(value))) {
                    value = Number(value);
                }
            } else if (value !== null && typeof value === 'object') {
                value = JSON.stringify(value);
            } else if (value === undefined) {
                value = null;
            }
            const type = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
            entries.push({ id, name, value, type, unit });
        }
        return entries;
    }

    /**
     * Remove HTML tags and entities from a text of WLED's info page
     *
     * @param {string} text text that may contain HTML
     * @returns {string} plain text
     */
    stripHtml(text) {
        // Remove tags in one pass (no regular expression, so long or broken input can not slow it down)
        const input = String(text);
        let plain = '';
        let inTag = false;
        for (const char of input) {
            if (char === '<') {
                inTag = true;
                plain += ' ';
            } else if (char === '>' && inTag) {
                inTag = false;
            } else if (!inTag) {
                plain += char;
            }
        }
        // Decode entities in one step, so a decoded "&" is never decoded a second time
        const entities = { nbsp: ' ', amp: '&', deg: '°', lt: '<', gt: '>', quot: '"' };
        return plain
            .replace(/&(#?[a-z0-9]{1,10});/gi, (_match, name) => entities[name.toLowerCase()] ?? '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Keep the light channel up to date: on, brightness in percent and the primary colour of the main segment.
     * The type detector recognises this channel as a colour light, so iot (Alexa, Google Home) can use it (#328).
     *
     * @param {string} mac MAC address (device id)
     * @param {string} ipAddress IP address of the device
     * @param {object} deviceStates state data reported by WLED
     */
    async updateLightStates(mac, ipAddress, deviceStates) {
        if (!deviceStates || !this.devices[ipAddress]) {
            return;
        }
        if (!this.devices[ipAddress].initialized) {
            await this.setObjectNotExistsAsync(`${mac}.light`, {
                type: 'channel',
                common: {
                    name: 'Light (iot, Alexa, Google Home)',
                },
                native: {},
            });
        }
        const mainSegment = this.mainSegment(deviceStates);
        this.devices[ipAddress].mainseg = mainSegment ? mainSegment.id : 0;

        if (deviceStates.on !== undefined) {
            await this.create_state(`${mac}.light.on`, 'lightOn', !!deviceStates.on);
        }
        if (typeof deviceStates.bri === 'number') {
            await this.create_state(`${mac}.light.dimmer`, 'lightDimmer', Math.round((deviceStates.bri / 255) * 100));
        }
        const primary = Array.isArray(mainSegment?.col) ? mainSegment.col[0] : null;
        if (Array.isArray(primary) && primary.length >= 3) {
            await this.create_state(
                `${mac}.light.rgb`,
                'lightRgb',
                `#${rgbHex(Number(primary[0]), Number(primary[1]), Number(primary[2]))}`,
            );
        }
    }

    /**
     * Main segment of the device: the segment with the id of mainseg, otherwise the first one
     *
     * @param {object} deviceStates state data reported by WLED
     * @returns {object|null} segment data
     */
    mainSegment(deviceStates) {
        const segments = Array.isArray(deviceStates?.seg) ? deviceStates.seg.filter(Boolean) : [];
        if (segments.length === 0) {
            return null;
        }
        const main = segments.find(segment => segment.id === deviceStates.mainseg);
        return main || segments[0];
    }

    /**
     * Translate a command written to the light channel into a WLED command (#328)
     *
     * @param {string} id full state id
     * @param {string} mac MAC address (device id)
     * @param {string} name state name in the light channel (on, dimmer, rgb)
     * @param {ioBroker.StateValue} val value written
     */
    async handleLightCommand(id, mac, name, val) {
        const deviceIP = this.getDeviceIpByMac(mac);
        if (!deviceIP || !this.devices[deviceIP].connected) {
            if (!deviceIP || !(await this.reconnectOnDemand(deviceIP))) {
                this.log.warn(`Device ${mac} is offline, command for ${id} discarded`);
                return;
            }
        }
        let values;
        switch (name) {
            case 'on':
                values = { on: val === true || val === 'true' || val === 1 };
                break;
            case 'dimmer': {
                const percent = Math.min(100, Math.max(0, Number(val)));
                if (!Number.isFinite(percent)) {
                    this.log.warn(`Invalid brightness ${val} for ${id}, expected 0-100`);
                    return;
                }
                values = { bri: Math.round((percent / 100) * 255) };
                if (percent > 0) {
                    values.on = true;
                }
                break;
            }
            case 'rgb': {
                const segmentId = this.devices[deviceIP].mainseg ?? 0;
                let color;
                try {
                    const current = await this.getStateAsync(`${mac}.seg.${segmentId}.col.0`);
                    color = this.hexToWledColor(val, current?.val);
                } catch {
                    this.log.warn(`Invalid colour ${val} for ${id}, expected HEX like #ff8800`);
                    return;
                }
                values = { seg: { id: segmentId, col: [color] } };
                break;
            }
            default:
                this.log.debug(`Unknown state in light channel: ${id}`);
                return;
        }
        await this.sendCommand(deviceIP, values, [{ id, val }]);
    }

    /**
     * Key of a segment in the object tree: the WLED segment id, or the array position for old firmware without id
     *
     * @param {object} segment segment data from WLED
     * @param {string} index position in the segment array
     * @returns {string} segment key
     */
    segmentKey(segment, index) {
        return segment && segment.id !== undefined && segment.id !== null ? String(segment.id) : String(index);
    }

    /**
     * Synchronise segment channels with the segments reported by the device:
     * new segments get a channel, segments removed in WLED are deleted from the object tree
     *
     * @param {string} mac MAC address (device id)
     * @param {string} ipAddress IP address of the device
     * @param {Array<object>} segments segment array reported by WLED
     */
    async syncSegments(mac, ipAddress, segments) {
        if (!Array.isArray(segments) || !this.devices[ipAddress]) {
            return;
        }
        const current = new Set(segments.map((segment, index) => this.segmentKey(segment, String(index))));

        // First run after adapter start: take the segments that exist in the object tree
        let known = this.devices[ipAddress].segments;
        if (!known) {
            known = new Set();
            const channels = await this.getObjectViewAsync('system', 'channel', {
                startkey: `${this.namespace}.${mac}.seg.`,
                endkey: `${this.namespace}.${mac}.seg.香`,
            });
            for (const row of channels?.rows || []) {
                const parts = row.id.split('.');
                if (parts.length === 5 && /^\d+$/.test(parts[4])) {
                    known.add(parts[4]);
                }
            }
        }

        // Segments added in WLED
        for (const segKey of current) {
            if (!known.has(segKey)) {
                this.log.debug(`Segment ${segKey} added on device ${mac}`);
                await this.setObjectNotExistsAsync(`${mac}.seg.${segKey}`, {
                    type: 'channel',
                    common: {
                        name: `Segment ${segKey}`,
                    },
                    native: {},
                });
            }
        }

        // Segments removed in WLED
        for (const segKey of known) {
            if (!current.has(segKey)) {
                this.log.info(`Segment ${segKey} removed on device ${mac}, deleting its states`);
                await this.localDeleteState(`${mac}.seg.${segKey}`);
                for (const stateName in this.createdStatesDetails) {
                    if (stateName.startsWith(`${mac}.seg.${segKey}.`)) {
                        delete this.createdStatesDetails[stateName];
                    }
                }
            }
        }

        this.devices[ipAddress].segments = current;
    }

    /**
     * A command was written for a known device that is not connected: reset its retry counter and
     * run the watchdog at once, so a device that was switched on again is used without delay.
     * Attempts are limited to one per device every ON_DEMAND_RECONNECT_COOLDOWN ms, parallel commands share one attempt.
     *
     * @param {string} deviceIP IP-Address of device
     * @returns {Promise<boolean>} true when the device is connected afterwards
     */
    async reconnectOnDemand(deviceIP) {
        const device = this.devices[deviceIP];
        if (!device) {
            return false;
        }
        if (device.reconnectPromise) {
            return device.reconnectPromise;
        }
        const now = Date.now();
        if (device.lastOnDemandReconnect && now - device.lastOnDemandReconnect < ON_DEMAND_RECONNECT_COOLDOWN) {
            return false;
        }
        device.lastOnDemandReconnect = now;
        device.reconnectPromise = (async () => {
            try {
                this.log.debug(`Command for offline device ${deviceIP}, trying to reconnect now`);
                deviceRetryCount[deviceIP] = 0;
                deviceRetryDelay[deviceIP] = this.config.Time_Sync * 1000;
                await this.watchDog(deviceIP);
                return !!this.devices[deviceIP]?.connected;
            } catch (error) {
                this.log.debug(`Reconnect attempt for ${deviceIP} failed: ${error}`);
                return false;
            } finally {
                device.reconnectPromise = null;
            }
        })();
        return device.reconnectPromise;
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
        this.watchedDevices.add(deviceIP);

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
                this.clearTimeout(watchdogTimer[deviceIP]);
                watchdogTimer[deviceIP] = null;
            }

            // Retry once every hour (3600 seconds) for permanently failed devices
            const longRetryDelay = 3600 * 1000;
            watchdogTimer[deviceIP] = this.setTimeout(() => {
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
                            this.clearTimeout(watchdogWsTimer[deviceIP]);
                            watchdogWsTimer[deviceIP] = null;
                        }
                        watchdogWsTimer[deviceIP] = this.setTimeout(() => {
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
                        // Usermod values (e.g. sensors) change without a state change, the websocket does not report them
                        if (this.devices[deviceIP].hasUsermods) {
                            await this.refreshUsermods(deviceIP);
                        }
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

                // Log retry information, the warning about the outage itself is logged once in getDeviceJSON
                this.log.debug(
                    `Device ${deviceIP} unavailable (attempt ${deviceRetryCount[deviceIP]}/${maxRetries}), will retry in ${Math.round(deviceRetryDelay[deviceIP] / 1000)} seconds`,
                );
            }
        } catch (error) {
            this.errorHandler(`[watchDog]`, error);
            // Treat errors as device unavailable
            deviceRetryCount[deviceIP] = (deviceRetryCount[deviceIP] || 0) + 1;
        }

        // Reset timer (if running) and start new one for next watchdog interval
        if (watchdogTimer[deviceIP]) {
            this.clearTimeout(watchdogTimer[deviceIP]);
            watchdogTimer[deviceIP] = null;
        }

        // Use the calculated retry delay
        const nextDelay = deviceRetryDelay[deviceIP] || this.config.Time_Sync * 1000;
        watchdogTimer[deviceIP] = this.setTimeout(() => {
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
                    return 'success';
                }
                // No Websocket connection, handle data by http_API

                const deviceData = await requestDeviceDataByAPI();

                // If device is initialised, only handle state updates otherwise complete initialisation
                if (this.devices[deviceIP] && this.devices[deviceIP].connected && this.devices[deviceIP].initialized) {
                    if (!deviceData) {
                        this.log.warn(`Heartbeat of device ${deviceIP} failed, will try to reconnect`);
                        // One warning per outage, the following reconnect attempts are logged as debug
                        this.devices[deviceIP].offlineWarned = true;
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
                        await this.create_state(`${this.devices[deviceIP].mac}._info._online`, 'Online status', true);
                        return 'success';
                    }
                    await this.handleStates(deviceData, deviceIP);
                    this.devices[deviceIP].wsConnected = false;
                    await this.create_state(`${this.devices[deviceIP].mac}._info._online`, 'Online status', true);
                    return 'success';
                }

                if (!deviceData) {
                    if (!this.devices[deviceIP]) {
                        // Manually added IP that does not answer, nothing to update yet
                        this.log.warn(`Unable to initialise ${deviceIP}, device does not respond`);
                        return 'failed';
                    }
                    // Warn once per outage, further attempts of a device that stays offline are logged as debug
                    if (!this.devices[deviceIP].offlineWarned) {
                        this.log.warn(`Unable to initialise ${deviceIP} will retry in scheduled interval !`);
                        this.devices[deviceIP].offlineWarned = true;
                    } else {
                        this.log.debug(`Unable to initialise ${deviceIP} will retry in scheduled interval !`);
                    }
                    this.devices[deviceIP].initialized = false;
                    this.devices[deviceIP].connected = false;
                    // Update device working state
                    if (this.devices[deviceIP].mac != null) {
                        await this.create_state(
                            `${this.devices[deviceIP].mac}._info` + `._online`,
                            'Online status',
                            false,
                        );
                    }
                    return 'failed';
                }
                if (this.devices[deviceIP]) {
                    this.devices[deviceIP].offlineWarned = false;
                }
                this.log.debug(`Info Data received from WLED device ${JSON.stringify(deviceData)}`);
                this.log.info(`Initialising : " ${deviceData.info.name}" on IP :  ${deviceIP}`);
                await this.handleBasicStates(deviceIP, deviceData);
                return 'success';
            } catch {
                if (this.devices[deviceIP] && this.devices[deviceIP].connected) {
                    this.log.warn(`Device ${deviceIP} offline, will try to reconnect`);
                    this.devices[deviceIP].offlineWarned = true;
                    if (this.devices[deviceIP].mac != null) {
                        await this.create_state(
                            `${this.devices[deviceIP].mac}._info` + `._online`,
                            'Online status',
                            false,
                        );
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
                    this.log.warn(`Sending command to WLED device ${url} failed with error ${error}`);
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
            // Stop a running browser first, a new search (Discover) must not add a second one
            if (this.bonjourBrowser) {
                try {
                    this.bonjourBrowser.stop();
                } catch (error) {
                    this.log.debug(`Stopping previous Bonjour browser failed: ${error}`);
                }
                this.bonjourBrowser = null;
            }

            // Browse and listen for WLED devices
            this.bonjourBrowser = await bonjour.find({
                type: 'wled',
            });
            this.log.info('Bonjour service started, new  devices  will  be detected automatically');

            // Event listener if new devices are detected
            this.bonjourBrowser.on('up', data => {
                const id = data.txt?.mac;
                const ip = this.bonjourAddress(data);
                if (!ip) {
                    this.log.debug(`Bonjour answer without usable IPv4 address ignored: ${data.name}`);
                    return;
                }

                // Check if device is already know
                if (this.devices[ip] == null) {
                    this.log.info(`New WLED  device found ${data.name} on IP ${ip}`);

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
     * IP address of a device found by Bonjour. The address announced by the service is used,
     * not the sender of the packet: with an mDNS relay (e.g. between VLANs) the sender is the relay.
     *
     * @param {object} data Bonjour service data
     * @returns {string|null} IPv4 address or null
     */
    bonjourAddress(data) {
        const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const announced = Array.isArray(data?.addresses) ? data.addresses.find(address => ipv4.test(address)) : null;
        if (announced) {
            return announced;
        }
        const sender = data?.referer?.address;
        return typeof sender === 'string' && ipv4.test(sender) ? sender : null;
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
                    warnMessages[name] = warnMessage;
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
            // Only the device itself is a light, night light and segments are plain switches (#963)
            if (name === 'on' && stateName.split('.').length > 2) {
                common.role = 'switch';
            }
            // Nothing in the info object of WLED can be changed (#962)
            if (stateName.includes('._info.')) {
                common.write = false;
            }

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

            // Timer to set online state to FALSE when not updated during 2 time-sync intervals
            if (stateName.endsWith('._info._online')) {
                // Clear running timer
                if (stateExpire[stateName]) {
                    this.clearTimeout(stateExpire[stateName]);
                    stateExpire[stateName] = null;
                }
            }
            if (stateName.endsWith('._info._online') && value === true) {
                // timer
                stateExpire[stateName] = this.setTimeout(async () => {
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
                    this.log.debug(`Error sent to Sentry: ${sentryMessage}`);
                    sentryInstance.getSentryObject().captureException(sentryMessage);
                } else {
                    this.log.debug(`Sentry disabled, error not sent: ${sentryMessage}`);
                }
            }
        } else {
            this.log.debug(`Sentry disabled, error not sent: ${sentryMessage}`);
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
                this.clearTimeout(watchdogTimer[ip]);
                delete watchdogTimer[ip];
                this.log.debug(`Cleared watchdog timer for ${ip}`);
            }

            // Clear WebSocket ping timer
            if (watchdogWsTimer[ip]) {
                this.clearTimeout(watchdogWsTimer[ip]);
                delete watchdogWsTimer[ip];
                this.log.debug(`Cleared WebSocket ping timer for ${ip}`);
            }

            // Clear state expire timer of the online state
            const onlineStateId = `${mac}._info._online`;
            if (mac && stateExpire[onlineStateId]) {
                this.clearTimeout(stateExpire[onlineStateId]);
                delete stateExpire[onlineStateId];
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

            // Drop commands waiting to be bundled
            if (this.devices[ip]?.pendingTimer) {
                this.clearTimeout(this.devices[ip].pendingTimer);
                this.devices[ip].pendingTimer = null;
            }

            // Clean up retry tracking
            delete deviceRetryCount[ip];
            delete deviceRetryDelay[ip];
            this.log.debug(`Cleared retry tracking for ${ip}`);

            this.watchedDevices.delete(ip);
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

        const name = deviceId.replace(/^wled\.\d+\./, '');
        try {
            await this.deleteDeviceAsync(name);
            this.log.info(`${name} deleted`);
            return true;
        } catch (error) {
            this.log.error(`Can not delete device ${name}: ${error instanceof Error ? error.message : error}`);
            return false;
        }
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
