'use strict';

/**
 * Helpers for the settings page (admin/jsonConfig.json, src-admin) (#266).
 * Kept free of adapter state so they can be tested without a running instance.
 */

const net = require('node:net');

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/**
 * Check what the user entered as address of a device and reduce it to the host.
 * Accepts "192.168.0.10", "http://192.168.0.10/", "wled-kitchen.local".
 *
 * @param {unknown} input text from the add dialog
 * @returns {{ok: true, host: string} | {ok: false, error: 'empty' | 'invalid'}} result
 */
function normalizeHost(input) {
    if (typeof input !== 'string' || !input.trim()) {
        return { ok: false, error: 'empty' };
    }
    let host = input.trim().replace(/^https?:\/\//i, '');
    host = host.replace(/\/.*$/, '');
    if (!host) {
        return { ok: false, error: 'empty' };
    }
    if (net.isIP(host) === 4) {
        return { ok: true, host };
    }
    // Something that looks like an IPv4 address but is not one (e.g. 192.168.0.300)
    if (/^[\d.]+$/.test(host)) {
        return { ok: false, error: 'invalid' };
    }
    if (HOSTNAME.test(host)) {
        return { ok: true, host };
    }
    return { ok: false, error: 'invalid' };
}

/**
 * Text of an object name, which can be a string or a translation object
 *
 * @param {any} name common.name
 * @returns {string} name
 */
function nameText(name) {
    if (typeof name === 'string') {
        return name;
    }
    if (name && typeof name === 'object') {
        return name.de || name.en || Object.values(name)[0] || '';
    }
    return '';
}

/**
 * Build the device list shown on the settings page
 *
 * @param {Array<{_id: string, common?: any, native?: any}>} deviceObjects device objects of the instance
 * @param {Record<string, any>} states states by full id (only the ones read for the list)
 * @param {Record<string, any>} runtime the adapter's device table by IP (this.devices)
 * @param {string} namespace e.g. wled.0
 * @returns {Array<object>} devices sorted by name
 */
function buildDeviceList(deviceObjects, states, runtime, namespace) {
    const value = (id, key) => {
        const state = states[`${id}.${key}`];
        return state ? state.val : null;
    };
    const list = [];
    for (const obj of deviceObjects || []) {
        if (!obj || !obj._id || !obj._id.startsWith(`${namespace}.`)) {
            continue;
        }
        const id = obj._id;
        const mac = obj.native?.mac || id.substring(namespace.length + 1);
        const ip = obj.native?.ip || null;
        const live = ip ? runtime?.[ip] : undefined;
        const leds = value(id, '_info.leds.count');
        list.push({
            id: mac,
            name: nameText(obj.common?.name) || mac,
            wledName: obj.native?.wledName || null,
            ip,
            online: value(id, '_info._online') === true,
            connection: live?.wsConnected ? 'websocket' : live?.connected ? 'http' : null,
            version: value(id, '_info.ver'),
            product: value(id, '_info.product') || value(id, '_info.brand') || null,
            arch: value(id, '_info.arch'),
            leds: typeof leds === 'number' ? leds : null,
            on: value(id, 'on'),
            bri: value(id, 'bri'),
        });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
}

/**
 * State ids read for each device of the list
 *
 * @param {string} deviceId full object id of the device
 * @returns {string[]} ids
 */
function deviceStateIds(deviceId) {
    return [
        '_info._online',
        '_info.ver',
        '_info.product',
        '_info.brand',
        '_info.arch',
        '_info.leds.count',
        'on',
        'bri',
    ].map(key => `${deviceId}.${key}`);
}

module.exports = { normalizeHost, buildDeviceList, deviceStateIds, nameText };
