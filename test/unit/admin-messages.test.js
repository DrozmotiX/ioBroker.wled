const path = require('node:path');
const { expect } = require('chai');

/**
 * Load main.js with stubbed ioBroker core, device management and Bonjour (same approach as adapter.test.js)
 */
function createAdapter() {
    const stub = (request, exports) => {
        const file = require.resolve(request, { paths: [path.join(__dirname, '../..')] });
        require.cache[file] = { id: file, filename: file, loaded: true, exports };
    };
    class FakeAdapter {
        constructor(options) {
            this.options = options;
            this.namespace = 'wled.0';
            this.log = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
        }
        on() {}
    }
    stub('@iobroker/adapter-core', { Adapter: FakeAdapter });
    stub('./lib/devicemgmt.js', class {});
    stub('bonjour', () => ({}));
    const mainFile = require.resolve('../../main.js');
    delete require.cache[mainFile];
    const adapter = require(mainFile)({});

    adapter.objects = {};
    adapter.states = {};
    adapter.responses = [];
    adapter.deleted = [];
    adapter.getDevicesAsync = async () =>
        Object.entries(adapter.objects)
            .filter(([, obj]) => obj.type === 'device')
            .map(([id, obj]) => ({ _id: `wled.0.${id}`, ...obj }));
    adapter.getObjectAsync = async id => adapter.objects[id] || null;
    adapter.getForeignStateAsync = async id => adapter.states[id] || null;
    adapter.delDevice = async id => {
        adapter.deleted.push(id);
        delete adapter.objects[id.replace('wled.0.', '')];
        return true;
    };
    adapter.sendTo = (_from, _command, response) => adapter.responses.push(response);
    adapter.setTimeout = fn => setTimeout(fn, 0);
    return adapter;
}

const MAC = 'AABBCC000001';
const IP = '192.0.2.21';

async function message(adapter, command, msg) {
    await adapter.onMessage({ command, message: msg, from: 'system.adapter.admin.0', callback: { id: 1 } });
    return adapter.responses.pop();
}

describe('Settings page commands (#266)', () => {
    let adapter;
    beforeEach(() => {
        adapter = createAdapter();
        adapter.objects[MAC] = {
            type: 'device',
            common: { name: 'Wohnzimmer' },
            native: { ip: IP, mac: MAC, wledName: 'WLED' },
        };
        adapter.states[`wled.0.${MAC}._info._online`] = { val: true };
        adapter.states[`wled.0.${MAC}._info.ver`] = { val: '0.15.0' };
        adapter.devices[IP] = { mac: MAC, connected: true, wsConnected: true };
    });

    it('getDevices lists the devices with status', async () => {
        const answer = await message(adapter, 'getDevices', {});
        expect(answer.ok).to.equal(true);
        expect(answer.devices).to.have.length(1);
        expect(answer.devices[0]).to.deep.include({
            id: MAC,
            name: 'Wohnzimmer',
            ip: IP,
            online: true,
            connection: 'websocket',
            version: '0.15.0',
        });
    });

    it('addDevice checks the address before asking the device', async () => {
        let asked = 0;
        adapter.getDeviceJSON = async () => {
            asked++;
            return 'success';
        };
        expect(await message(adapter, 'addDevice', { ip: ' ' })).to.deep.equal({ ok: false, error: 'empty' });
        expect(await message(adapter, 'addDevice', { ip: '192.0.2.300' })).to.deep.equal({
            ok: false,
            error: 'invalid',
        });
        expect(await message(adapter, 'addDevice', { ip: IP })).to.deep.equal({
            ok: false,
            error: 'exists',
            id: MAC,
            host: IP,
        });
        expect(asked).to.equal(0);
    });

    it('addDevice reports a device that does not answer', async () => {
        adapter.getDeviceJSON = async () => 'failed';
        expect(await message(adapter, 'addDevice', { ip: 'http://192.0.2.99/' })).to.deep.equal({
            ok: false,
            error: 'unreachable',
            host: '192.0.2.99',
        });
    });

    it('addDevice returns the id of a new device', async () => {
        adapter.getDeviceJSON = async ip => {
            adapter.devices[ip] = { mac: 'AABBCC000002' };
            return 'success';
        };
        expect(await message(adapter, 'addDevice', { ip: '192.0.2.22' })).to.deep.equal({
            ok: true,
            id: 'AABBCC000002',
            host: '192.0.2.22',
        });
    });

    it('addDevice with an IP as text keeps the old answer for scripts', async () => {
        adapter.getDeviceJSON = async () => 'success';
        expect(await message(adapter, 'addDevice', '192.0.2.22')).to.equal('success');
        adapter.getDeviceJSON = async () => 'failed';
        expect(await message(adapter, 'addDevice', '192.0.2.22')).to.equal('failed');
    });

    it('deleteDevice deletes by id and rejects unknown or invalid ids', async () => {
        expect(await message(adapter, 'deleteDevice', { id: 'nope' })).to.deep.equal({ ok: false, error: 'notFound' });
        expect(await message(adapter, 'deleteDevice', { id: 'a.b' })).to.deep.equal({ ok: false, error: 'invalid' });
        expect(await message(adapter, 'deleteDevice', { id: MAC })).to.deep.equal({ ok: true });
        expect(adapter.deleted).to.deep.equal([`wled.0.${MAC}`]);
    });

    it('deleteDevice with an IP as text keeps the old answer for scripts', async () => {
        expect(await message(adapter, 'deleteDevice', IP)).to.equal('success');
        expect(await message(adapter, 'deleteDevice', '192.0.2.98')).to.equal('failed');
    });

    it('discover starts a search and counts new devices', async () => {
        let scans = 0;
        adapter.scanDevices = async () => {
            scans++;
            adapter.objects.AABBCC000003 = { type: 'device', common: { name: 'Neu' }, native: {} };
        };
        expect(await message(adapter, 'discover', { seconds: 2 })).to.deep.equal({ ok: true, found: 1 });
        expect(scans).to.equal(1);
    });
});
