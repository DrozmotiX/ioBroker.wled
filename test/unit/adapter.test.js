const path = require('node:path');
const { expect } = require('chai');
const rgbHex = require('rgb-hex');

/**
 * Load main.js with stubbed ioBroker core, device management and Bonjour,
 * so the adapter methods can be tested without a running ioBroker instance.
 */
function loadAdapter() {
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
    return require(mainFile);
}

/**
 * Create an adapter instance that records log messages, object calls and responses
 */
function createAdapter() {
    const adapter = loadAdapter()({});
    adapter.logs = { debug: [], info: [], warn: [], error: [] };
    adapter.log = {
        debug: msg => adapter.logs.debug.push(msg),
        info: msg => adapter.logs.info.push(msg),
        warn: msg => adapter.logs.warn.push(msg),
        error: msg => adapter.logs.error.push(msg),
    };
    adapter.objects = {};
    adapter.deleted = [];
    adapter.responses = [];
    adapter.setObjectNotExistsAsync = async (id, obj) => {
        if (!adapter.objects[id]) {
            adapter.objects[id] = obj;
        }
    };
    adapter.getObjectAsync = async id => adapter.objects[id] || null;
    adapter.delObjectAsync = async id => {
        adapter.deleted.push(id);
        delete adapter.objects[id];
    };
    adapter.getObjectViewAsync = async (_design, type, params) => ({
        rows: Object.keys(adapter.objects)
            .map(id => `${adapter.namespace}.${id}`)
            .filter(id => id >= params.startkey && id <= params.endkey)
            .filter(id => adapter.objects[id.slice(adapter.namespace.length + 1)].type === type)
            .map(id => ({ id, value: adapter.objects[id.slice(adapter.namespace.length + 1)] })),
    });
    adapter.sendTo = (_from, _command, response) => adapter.responses.push(response);
    adapter.setTimeout = fn => setTimeout(fn, 0);
    return adapter;
}

const MAC = 'aabbccddeeff';
const IP = '192.168.0.10';

describe('WLED adapter', () => {
    describe('hexToWledColor (#907)', () => {
        let adapter;
        beforeEach(() => {
            adapter = createAdapter();
        });

        it('translates a 6-digit HEX on an RGB strip to [r, g, b]', () => {
            expect(adapter.hexToWledColor('#ff8000', '[0,0,0]')).to.deep.equal([255, 128, 0]);
        });

        it('keeps the current white value on an RGBW strip when a 6-digit HEX is set', () => {
            expect(adapter.hexToWledColor('#ff0000', '[0,0,255,200]')).to.deep.equal([255, 0, 0, 200]);
        });

        it('accepts the current RGB value as array or as text without brackets', () => {
            expect(adapter.hexToWledColor('#00ff00', [1, 2, 3, 77])).to.deep.equal([0, 255, 0, 77]);
            expect(adapter.hexToWledColor('#00ff00', '1,2,3,77')).to.deep.equal([0, 255, 0, 77]);
        });

        it('sets the white channel from an 8-digit HEX', () => {
            expect(adapter.hexToWledColor('#ff000080', '[0,0,0,0]')).to.deep.equal([255, 0, 0, 128]);
            expect(adapter.hexToWledColor('#000000ff', '[0,0,0,0]')).to.deep.equal([0, 0, 0, 255]);
            expect(adapter.hexToWledColor('#ff000000', '[0,0,0,255]')).to.deep.equal([255, 0, 0, 0]);
        });

        it('accepts HEX values without leading #', () => {
            expect(adapter.hexToWledColor('ff000080')).to.deep.equal([255, 0, 0, 128]);
        });

        it('returns the same colour that the adapter writes as HEX state (round trip)', () => {
            for (const color of [
                [255, 0, 0, 0],
                [12, 34, 56, 78],
                [0, 0, 0, 255],
                [255, 255, 255, 1],
            ]) {
                const hex = `#${rgbHex(color[0], color[1], color[2], color[3] / 255)}`;
                expect(adapter.hexToWledColor(hex, '[0,0,0,0]')).to.deep.equal(color);
            }
        });

        it('throws on an invalid HEX value', () => {
            expect(() => adapter.hexToWledColor('#zzzzzz')).to.throw();
        });
    });

    describe('HEX colour command (#907)', () => {
        let adapter;
        let sent;
        const root = `${MAC}.seg.0.col`;
        beforeEach(() => {
            adapter = createAdapter();
            adapter.instance = 0;
            adapter.devices[IP] = { mac: MAC, connected: true, wsConnected: false };
            sent = [];
            adapter.postAPI = async (url, values) => {
                sent.push(values);
                return { success: true };
            };
            adapter.setState = () => {};
            adapter.getForeignObjectAsync = async () => ({ native: { ip: IP } });
        });

        const useStates = states => {
            adapter.getStateAsync = async id => (states[id] !== undefined ? { val: states[id] } : null);
        };

        it('keeps white of an RGBW strip when a 6-digit HEX is written', async () => {
            useStates({
                [`${root}.0_HEX`]: '#00ff00',
                [`${root}.1_HEX`]: '#00000000',
                [`${root}.2_HEX`]: '#0000ff10',
                [`${root}.0`]: '[255,0,0,200]',
                [`${root}.1`]: '[0,0,0,0]',
                [`${root}.2`]: '[0,0,255,16]',
            });
            await adapter.onStateChange(`wled.0.${root}.0_HEX`, { val: '#00ff00', ack: false });
            expect(sent).to.deep.equal([
                {
                    seg: {
                        id: 0,
                        col: [
                            [0, 255, 0, 200],
                            [0, 0, 0, 0],
                            [0, 0, 255, 16],
                        ],
                    },
                },
            ]);
        });

        it('sets white of an RGBW strip from an 8-digit HEX', async () => {
            useStates({
                [`${root}.0_HEX`]: '#ff0000ff',
                [`${root}.1_HEX`]: '#00000000',
                [`${root}.2_HEX`]: '#00000000',
                [`${root}.0`]: '[255,0,0,0]',
                [`${root}.1`]: '[0,0,0,0]',
                [`${root}.2`]: '[0,0,0,0]',
            });
            await adapter.onStateChange(`wled.0.${root}.0_HEX`, { val: '#ff0000ff', ack: false });
            expect(sent[0].seg.col[0]).to.deep.equal([255, 0, 0, 255]);
        });

        it('sends three values per colour on an RGB strip', async () => {
            useStates({
                [`${root}.0_HEX`]: '#123456',
                [`${root}.1_HEX`]: '#000000',
                [`${root}.2_HEX`]: '#000000',
                [`${root}.0`]: '[1,2,3]',
                [`${root}.1`]: '[0,0,0]',
                [`${root}.2`]: '[0,0,0]',
            });
            await adapter.onStateChange(`wled.0.${root}.0_HEX`, { val: '#123456', ack: false });
            expect(sent[0].seg.col).to.deep.equal([
                [18, 52, 86],
                [0, 0, 0],
                [0, 0, 0],
            ]);
        });
    });

    describe('segmentKey (#909)', () => {
        it('uses the segment id and falls back to the array index', () => {
            const adapter = createAdapter();
            expect(adapter.segmentKey({ id: 4 }, 1)).to.equal('4');
            expect(adapter.segmentKey({ id: 0 }, 3)).to.equal('0');
            expect(adapter.segmentKey({ start: 0 }, 2)).to.equal('2');
            expect(adapter.segmentKey(undefined, 5)).to.equal('5');
        });
    });

    describe('syncSegments (#909)', () => {
        let adapter;
        beforeEach(() => {
            adapter = createAdapter();
            adapter.devices[IP] = { mac: MAC };
        });

        it('creates a channel for every segment on the first run', async () => {
            await adapter.syncSegments(MAC, IP, [{ id: 0 }, { id: 1 }]);
            expect(Object.keys(adapter.objects)).to.have.members([`${MAC}.seg.0`, `${MAC}.seg.1`]);
            expect(adapter.objects[`${MAC}.seg.1`].type).to.equal('channel');
            expect([...adapter.devices[IP].segments]).to.have.members(['0', '1']);
        });

        it('creates a channel for a segment added in WLED', async () => {
            await adapter.syncSegments(MAC, IP, [{ id: 0 }]);
            await adapter.syncSegments(MAC, IP, [{ id: 0 }, { id: 1 }]);
            expect(adapter.objects).to.have.property(`${MAC}.seg.1`);
            expect(adapter.deleted).to.be.empty;
        });

        it('deletes only the segment removed in WLED and keeps the ids of the others', async () => {
            adapter.createdStatesDetails = {
                [`${MAC}.seg.1.bri`]: {},
                [`${MAC}.seg.2.bri`]: {},
                [`${MAC}.seg.10.bri`]: {},
            };
            await adapter.syncSegments(MAC, IP, [{ id: 0 }, { id: 1 }, { id: 2 }]);
            // Segment 1 deleted in the middle: WLED keeps the ids 0 and 2
            await adapter.syncSegments(MAC, IP, [{ id: 0 }, { id: 2 }]);
            expect(adapter.deleted).to.deep.equal([`${MAC}.seg.1`]);
            expect(adapter.objects).to.have.property(`${MAC}.seg.2`);
            expect(adapter.createdStatesDetails).to.not.have.property(`${MAC}.seg.1.bri`);
            expect(adapter.createdStatesDetails).to.have.property(`${MAC}.seg.2.bri`);
            expect(adapter.createdStatesDetails).to.have.property(`${MAC}.seg.10.bri`);
            expect(adapter.logs.info.some(msg => msg.includes('Segment 1 removed'))).to.equal(true);
        });

        it('removes segments that were deleted in WLED while the adapter was stopped', async () => {
            adapter.objects[`${MAC}.seg.0`] = { type: 'channel' };
            adapter.objects[`${MAC}.seg.3`] = { type: 'channel' };
            adapter.objects[`${MAC}.seg.3.bri`] = { type: 'state' };
            adapter.objects[`${MAC}.seg.0.col`] = { type: 'channel' };
            await adapter.syncSegments(MAC, IP, [{ id: 0 }]);
            expect(adapter.deleted).to.deep.equal([`${MAC}.seg.3`]);
        });

        it('does not touch segments of other devices', async () => {
            adapter.objects['112233445566.seg.5'] = { type: 'channel' };
            await adapter.syncSegments(MAC, IP, [{ id: 0 }]);
            expect(adapter.deleted).to.be.empty;
        });

        it('ignores unknown devices and missing segment data', async () => {
            await adapter.syncSegments(MAC, '192.168.0.99', [{ id: 0 }]);
            await adapter.syncSegments(MAC, IP, undefined);
            expect(adapter.objects).to.be.empty;
        });
    });

    describe('addSegment validation (#920)', () => {
        let adapter;
        let sent;
        beforeEach(() => {
            adapter = createAdapter();
            adapter.devices[IP] = { mac: MAC, connected: true, wsConnected: false };
            sent = [];
            adapter.postAPI = async (url, values) => {
                sent.push(values);
                return { success: true };
            };
            adapter.getDeviceJSON = async () => 'success';
        });

        const addSegment = message =>
            adapter.onMessage({
                command: 'addSegment',
                from: 'system.adapter.javascript.0',
                callback: {},
                message: { deviceId: MAC, ...message },
            });

        for (const [title, message] of [
            ['a segment id above 31', { segmentId: 32, start: 0, stop: 10 }],
            ['a negative segment id', { segmentId: -1, start: 0, stop: 10 }],
            ['a segment id with decimals', { segmentId: 1.5, start: 0, stop: 10 }],
            ['a negative start', { segmentId: 1, start: -5, stop: 10 }],
            ['a stop not greater than start', { segmentId: 1, start: 10, stop: 10 }],
            ['a stop that is no number', { segmentId: 1, start: 0, stop: 'abc' }],
        ]) {
            it(`rejects ${title} without sending to WLED`, async () => {
                await addSegment(message);
                expect(sent).to.be.empty;
                expect(adapter.responses).to.have.length(1);
                expect(adapter.responses[0].success).to.equal(false);
                expect(adapter.logs.warn).to.have.length(1);
            });
        }

        it('rejects an unknown device', async () => {
            await adapter.onMessage({
                command: 'addSegment',
                from: 'x',
                callback: {},
                message: { deviceId: '000000000000', segmentId: 1 },
            });
            expect(sent).to.be.empty;
            expect(adapter.responses[0].success).to.equal(false);
        });

        it('accepts numbers given as text and sends them as numbers', async () => {
            await addSegment({ segmentId: '2', start: '0', stop: '30' });
            expect(adapter.logs.warn).to.be.empty;
            expect(sent).to.have.length(1);
            expect(JSON.stringify(sent[0])).to.include('"id":2,"start":0,"stop":30');
        });
    });
});
