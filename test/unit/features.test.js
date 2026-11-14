const { expect } = require('chai');

const { createAdapter } = require('./helpers.js');

describe('WLED adapter 0.10.0 features', () => {
    describe('automatic discovery can be switched off (#897)', () => {
        let adapter;
        let scans;
        beforeEach(() => {
            adapter = createAdapter();
            scans = 0;
            adapter.resetOnlineStates = async () => {};
            adapter.tryKnownDevices = async () => {};
            adapter.scanDevices = async () => {
                scans++;
            };
            adapter.setState = () => {};
            adapter.setTimeout = () => null;
        });

        it('starts the Bonjour search by default', async () => {
            adapter.config = { Time_Sync: 30, maxRetries: 5 };
            await adapter.onReady();
            expect(scans).to.equal(1);
        });

        it('does not start the Bonjour search when switched off', async () => {
            adapter.config = { Time_Sync: 30, maxRetries: 5, autoDiscovery: false };
            await adapter.onReady();
            expect(scans).to.equal(0);
            expect(adapter.logs.info.join()).to.include('Automatic discovery (Bonjour/mDNS) is switched off');
        });
    });

    describe('bonjourAddress (#897)', () => {
        const adapter = createAdapter();

        it('uses the address announced by the device, not the sender of the packet (mDNS relay)', () => {
            const data = { addresses: ['192.0.2.10'], referer: { address: '198.51.100.1' } };
            expect(adapter.bonjourAddress(data)).to.equal('192.0.2.10');
        });

        it('skips IPv6 addresses and takes the first IPv4 address', () => {
            const data = { addresses: ['fe80::1', '192.0.2.11'], referer: { address: '198.51.100.1' } };
            expect(adapter.bonjourAddress(data)).to.equal('192.0.2.11');
        });

        it('falls back to the sender when the answer contains no IPv4 address', () => {
            expect(adapter.bonjourAddress({ addresses: [], referer: { address: '192.0.2.12' } })).to.equal(
                '192.0.2.12',
            );
            expect(adapter.bonjourAddress({ referer: { address: '192.0.2.13' } })).to.equal('192.0.2.13');
        });

        it('returns null when no IPv4 address is known', () => {
            expect(adapter.bonjourAddress({ addresses: ['fe80::1'], referer: { address: 'fe80::2' } })).to.equal(null);
            expect(adapter.bonjourAddress({})).to.equal(null);
        });
    });
});
