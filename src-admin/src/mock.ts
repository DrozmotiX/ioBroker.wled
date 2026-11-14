// Simulated adapter answers for the preview (src/index.tsx). Addresses from the documentation range, no real devices.
const devices = [
    {
        id: 'AABBCC000001',
        name: 'Wohnzimmer Regal',
        wledName: 'WLED-Regal',
        ip: '192.0.2.21',
        online: true,
        connection: 'websocket',
        version: '0.15.0',
        product: 'FOSS',
        arch: 'esp32',
        leds: 120,
        on: true,
        bri: 178,
    },
    {
        id: 'AABBCC000002',
        name: 'Küche Unterschrank',
        wledName: 'WLED-Kueche',
        ip: '192.0.2.22',
        online: true,
        connection: 'http',
        version: '0.14.4',
        product: 'FOSS',
        arch: 'esp8266',
        leds: 60,
        on: false,
        bri: 128,
    },
    {
        id: 'AABBCC000003',
        name: 'Balkon',
        wledName: 'WLED-Balkon',
        ip: '192.0.2.23',
        online: false,
        connection: null,
        version: '0.15.0',
        product: 'FOSS',
        arch: 'esp32',
        leds: 300,
        on: null,
        bri: null,
    },
];

export function createMockSocket(options: { alive: boolean; empty: boolean }): Record<string, unknown> {
    let list = options.empty ? [] : [...devices];
    const answers: Record<string, (message: any) => unknown> = {
        getDevices: () => ({ ok: true, devices: list }),
        discover: () => new Promise(resolve => setTimeout(() => resolve({ ok: true, found: 0 }), 1500)),
        addDevice: (message: { ip: string }) =>
            message.ip.trim() === '192.0.2.21'
                ? { ok: false, error: 'exists', host: '192.0.2.21' }
                : { ok: false, error: 'unreachable', host: message.ip.trim() },
        deleteDevice: (message: { id: string }) => {
            list = list.filter(device => device.id !== message.id);
            return { ok: true };
        },
    };
    return {
        sendTo: (_instance: string, command: string, message: any) => Promise.resolve(answers[command]?.(message)),
        getState: () => Promise.resolve({ val: options.alive }),
        subscribeState: () => Promise.resolve(),
        unsubscribeState: () => undefined,
        extendObject: () => Promise.resolve(),
    };
}
