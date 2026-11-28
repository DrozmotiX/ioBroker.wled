const { EventEmitter } = require('node:events');
const { expect } = require('chai');
const { createAdapter, IP, MAC } = require('./helpers');

describe('offline device reconnection', () => {
    let adapter;
    let delays;
    let attempts;
    let result;

    beforeEach(() => {
        adapter = createAdapter();
        adapter.config = { Time_Sync: 30, maxRetries: 0, retryBackoff: true };
        adapter.devices[IP] = { mac: MAC, connected: false };
        delays = [];
        attempts = 0;
        result = 'failed';
        adapter.setTimeout = (_callback, delay) => {
            delays.push(delay);
            return {};
        };
        adapter.clearTimeout = () => {};
        adapter.getDeviceJSON = async () => {
            attempts++;
            return result;
        };
    });

    it('retries indefinitely with capped backoff and resets after recovery', async () => {
        for (let i = 0; i < 10; i++) {
            await adapter.watchDog(IP);
        }
        expect(attempts).to.equal(10);
        expect(delays).to.deep.equal([
            30000, 60000, 120000, 240000, 480000, 960000, 1920000, 3600000, 3600000, 3600000,
        ]);
        result = 'success';
        await adapter.watchDog(IP);
        result = 'failed';
        await adapter.watchDog(IP);
        expect(delays.slice(-2)).to.deep.equal([30000, 30000]);
    });

    it('uses the polling interval without backoff, even beyond the retry cap', async () => {
        adapter.config.retryBackoff = false;
        for (let i = 0; i < 7; i++) {
            await adapter.watchDog(IP);
        }
        expect(delays).to.deep.equal(Array(7).fill(30000));
    });

    it('limits backoff to one hour even when the polling interval is longer', async () => {
        adapter.config.Time_Sync = 7200;
        await adapter.watchDog(IP);
        await adapter.watchDog(IP);
        expect(delays).to.deep.equal([3600000, 3600000]);
    });

    it('reconnects on the next scheduled check after two days offline', async () => {
        let now = 0;
        let timer;
        adapter.setTimeout = (callback, delay) => {
            timer = { callback, at: now + delay };
            return timer;
        };
        adapter.clearTimeout = () => {};
        adapter.getDeviceJSON = async () => {
            attempts++;
            if (result === 'success') {
                adapter.devices[IP].connected = true;
            }
            return result;
        };
        await adapter.watchDog(IP);
        const twoDays = 2 * 24 * 60 * 60 * 1000;
        while (timer.at <= twoDays) {
            now = timer.at;
            timer.callback();
            await new Promise(resolve => setImmediate(resolve));
        }
        expect(attempts).to.be.greaterThan(48);
        expect(timer.at - twoDays).to.be.at.most(3600000);
        result = 'success';
        now = timer.at;
        timer.callback();
        await new Promise(resolve => setImmediate(resolve));
        expect(adapter.devices[IP].connected).to.equal(true);
        expect(timer.at - now).to.equal(30000);
    });

    it('preserves the hourly retry for positive maxRetries', async () => {
        adapter.config.maxRetries = 2;
        await adapter.watchDog(IP);
        await adapter.watchDog(IP);
        await adapter.watchDog(IP);
        expect(attempts).to.equal(2);
        expect(delays).to.deep.equal([30000, 60000, 3600000]);
    });

    it('shares an in-flight check between scheduled and on-demand retries', async () => {
        let finish;
        adapter.getDeviceJSON = () =>
            new Promise(resolve => {
                attempts++;
                finish = resolve;
            });
        const scheduled = adapter.watchDog(IP);
        const onDemand = adapter.reconnectOnDemand(IP);
        expect(attempts).to.equal(1);
        finish('failed');
        await Promise.all([scheduled, onDemand]);
        expect(delays).to.deep.equal([30000]);
    });

    it('accepts zero and falls back for invalid retry settings on startup', async () => {
        adapter.resetOnlineStates = async () => {};
        adapter.tryKnownDevices = async () => {};
        adapter.scanDevices = async () => {};
        adapter.setState = () => {};
        await adapter.onReady();
        expect(adapter.config.maxRetries).to.equal(0);
        adapter.config.maxRetries = -1;
        await adapter.onReady();
        expect(adapter.config.maxRetries).to.equal(5);
    });

    it('reconnects a known offline device on Bonjour announcements only in unlimited mode', async () => {
        const browser = new EventEmitter();
        browser.stop = () => {};
        adapter = createAdapter(browser);
        adapter.config = { Time_Sync: 30, maxRetries: 0 };
        adapter.devices[IP] = { mac: MAC, connected: false };
        let reconnects = 0;
        adapter.reconnectOnDemand = async () => {
            reconnects++;
            return false;
        };
        await adapter.scanDevices();
        const announcement = { addresses: [IP], txt: { mac: MAC } };
        browser.emit('up', announcement);
        expect(reconnects).to.equal(1);
        adapter.devices[IP].connected = true;
        browser.emit('up', announcement);
        adapter.devices[IP].connected = false;
        adapter.config.maxRetries = 5;
        browser.emit('up', announcement);
        expect(reconnects).to.equal(1);
    });
});
