const { expect } = require('chai');
const { normalizeHost, buildDeviceList, deviceStateIds, nameText } = require('../../lib/admin-api');

describe('Settings page helpers (#266)', () => {
    describe('normalizeHost', () => {
        it('accepts an IPv4 address', () => {
            expect(normalizeHost('192.168.0.10')).to.deep.equal({ ok: true, host: '192.168.0.10' });
        });

        it('removes blanks, protocol and path', () => {
            expect(normalizeHost('  http://192.168.0.10/json ')).to.deep.equal({ ok: true, host: '192.168.0.10' });
        });

        it('answers fast on long input and rejects it', () => {
            const start = Date.now();
            expect(normalizeHost('/'.repeat(100000))).to.deep.equal({ ok: false, error: 'invalid' });
            expect(normalizeHost('http://192.168.0.10' + '/'.repeat(250))).to.deep.equal({ ok: true, host: '192.168.0.10' });
            expect(Date.now() - start).to.be.below(100);
        });

        it('accepts a host name', () => {
            expect(normalizeHost('wled-kitchen.local')).to.deep.equal({ ok: true, host: 'wled-kitchen.local' });
        });

        it('reports an empty input', () => {
            expect(normalizeHost('')).to.deep.equal({ ok: false, error: 'empty' });
            expect(normalizeHost('   ')).to.deep.equal({ ok: false, error: 'empty' });
            expect(normalizeHost(undefined)).to.deep.equal({ ok: false, error: 'empty' });
        });

        it('rejects addresses that are not valid', () => {
            for (const input of ['192.168.0.300', '192.168.0', 'a b', 'wled_kitchen', '-wled']) {
                expect(normalizeHost(input), input).to.deep.equal({ ok: false, error: 'invalid' });
            }
        });
    });

    describe('nameText', () => {
        it('reads plain and translated names', () => {
            expect(nameText('Kitchen')).to.equal('Kitchen');
            expect(nameText({ en: 'Kitchen', de: 'Küche' })).to.equal('Küche');
            expect(nameText({ en: 'Kitchen' })).to.equal('Kitchen');
            expect(nameText(undefined)).to.equal('');
        });
    });

    describe('buildDeviceList', () => {
        const namespace = 'wled.0';
        const objects = [
            { _id: 'wled.0.AABBCCDDEEFF', common: { name: 'Wohnzimmer' }, native: { ip: '192.168.0.10', mac: 'AABBCCDDEEFF', wledName: 'WLED' } },
            { _id: 'wled.0.112233445566', common: { name: 'Bad' }, native: { ip: '192.168.0.11', mac: '112233445566' } },
            { _id: 'wled.1.FFFFFFFFFFFF', common: { name: 'other instance' }, native: {} },
        ];
        const states = {
            'wled.0.AABBCCDDEEFF._info._online': { val: true },
            'wled.0.AABBCCDDEEFF._info.ver': { val: '0.15.0' },
            'wled.0.AABBCCDDEEFF._info.arch': { val: 'esp32' },
            'wled.0.AABBCCDDEEFF._info.leds.count': { val: 60 },
            'wled.0.AABBCCDDEEFF.on': { val: true },
            'wled.0.AABBCCDDEEFF.bri': { val: 128 },
            'wled.0.112233445566._info._online': { val: false },
        };
        const runtime = { '192.168.0.10': { connected: true, wsConnected: true } };

        it('lists only devices of the own instance, sorted by name', () => {
            const list = buildDeviceList(objects, states, runtime, namespace);
            expect(list.map(device => device.id)).to.deep.equal(['112233445566', 'AABBCCDDEEFF']);
        });

        it('fills status and info from the states', () => {
            const device = buildDeviceList(objects, states, runtime, namespace)[1];
            expect(device).to.deep.include({
                name: 'Wohnzimmer',
                wledName: 'WLED',
                ip: '192.168.0.10',
                online: true,
                connection: 'websocket',
                version: '0.15.0',
                arch: 'esp32',
                leds: 60,
                on: true,
                bri: 128,
            });
        });

        it('shows an offline device without values', () => {
            const device = buildDeviceList(objects, states, runtime, namespace)[0];
            expect(device).to.deep.include({ online: false, connection: null, version: null, leds: null });
        });

        it('falls back to the MAC when there is no name', () => {
            const list = buildDeviceList([{ _id: 'wled.0.AABBCCDDEEFF', common: {}, native: {} }], {}, {}, namespace);
            expect(list[0]).to.deep.include({ id: 'AABBCCDDEEFF', name: 'AABBCCDDEEFF', ip: null });
        });
    });

    it('reads the states needed for the list', () => {
        expect(deviceStateIds('wled.0.X')).to.include.members(['wled.0.X._info._online', 'wled.0.X._info.ver', 'wled.0.X.bri']);
    });
});
