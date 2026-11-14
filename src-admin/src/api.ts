import { I18n } from '@iobroker/gui-components';
import type { AdminConnection } from '@iobroker/socket-client';

/** One WLED device as the adapter reports it (command getDevices) */
export interface Device {
    id: string;
    name: string;
    wledName: string | null;
    ip: string | null;
    online: boolean;
    connection: 'websocket' | 'http' | null;
    version: string | null;
    product: string | null;
    arch: string | null;
    leds: number | null;
    on: boolean | null;
    bri: number | null;
}

export interface DevicesAnswer {
    ok: boolean;
    devices?: Device[];
    error?: string;
}

export interface ActionAnswer {
    ok: boolean;
    error?: string;
    id?: string;
    host?: string;
    found?: number;
}

export interface Api {
    socket: AdminConnection;
    instance: number;
    adapterName: string;
    themeType: string;
}

export function instanceId(api: Api): string {
    return `${api.adapterName}.${api.instance}`;
}

/**
 * Send a command to the running adapter
 *
 * @param api
 * @param command
 * @param message
 */
export async function send<T = ActionAnswer>(api: Api, command: string, message: Record<string, any> = {}): Promise<T> {
    return api.socket.sendTo(instanceId(api), command, message);
}

/**
 * Translate a key of src/i18n with %s placeholders
 *
 * @param key
 * @param args
 */
export function t(key: string, ...args: (string | number)[]): string {
    return I18n.t(key, ...args);
}

/**
 * Same check as lib/admin-api.js normalizeHost, so the dialog can answer before asking the adapter
 *
 * @param input
 */
export function checkHost(input: string): 'ok' | 'empty' | 'invalid' {
    let host = input.trim().replace(/^https?:\/\//i, '');
    host = host.replace(/\/.*$/, '');
    if (!host) {
        return 'empty';
    }
    if (/^[\d.]+$/.test(host)) {
        const parts = host.split('.');
        return parts.length === 4 && parts.every(p => p !== '' && Number(p) <= 255 && String(Number(p)) === p)
            ? 'ok'
            : 'invalid';
    }
    return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host)
        ? 'ok'
        : 'invalid';
}

/**
 * MAC in the usual notation AA:BB:CC:DD:EE:FF
 *
 * @param id
 */
export function formatMac(id: string): string {
    return /^[0-9a-f]{12}$/i.test(id) ? id.toUpperCase().match(/.{2}/g)!.join(':') : id;
}
