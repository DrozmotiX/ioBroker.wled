const { expect } = require('chai');

const { createAdapter, MAC, IP } = require('./helpers.js');

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

    describe('bundle commands per device (#926)', () => {
        let adapter;
        let sent;
        let timers;
        let acked;
        beforeEach(() => {
            adapter = createAdapter();
            adapter.instance = 0;
            adapter.config = { Time_Sync: 30, maxRetries: 5, bundleDelay: 50 };
            adapter.devices[IP] = { mac: MAC, connected: true, wsConnected: false, bundleCommands: true };
            sent = [];
            acked = [];
            timers = [];
            adapter.postAPI = async (_url, values) => {
                sent.push(values);
                return { success: true };
            };
            adapter.setState = (id, state) => acked.push({ id, val: state.val });
            adapter.setStateAsync = async (id, val) => acked.push({ id, val });
            adapter.getForeignObjectAsync = async () => ({ native: { ip: IP } });
            adapter.setTimeout = (fn, delay) => {
                timers.push({ fn, delay });
                return timers.length;
            };
            adapter.clearTimeout = () => {};
        });

        const change = (state, val) => adapter.onStateChange(`wled.0.${MAC}.${state}`, { val, ack: false });
        const runTimer = async () => {
            await timers.shift().fn();
            await new Promise(resolve => setImmediate(resolve));
        };

        it('sends changes that follow each other as one command after the delay', async () => {
            await change('on', true);
            await change('bri', 120);
            await change('seg.0.fx', 9);
            await change('seg.1.pal', 4);
            await change('seg.0.sx', 200);
            expect(sent).to.be.empty;
            expect(timers).to.have.length(1);
            expect(timers[0].delay).to.equal(50);
            await runTimer();
            expect(sent).to.deep.equal([
                {
                    on: true,
                    bri: 120,
                    seg: [
                        { id: 0, fx: 9, sx: 200 },
                        { id: 1, pal: 4 },
                    ],
                },
            ]);
            expect(acked.map(a => a.id)).to.have.members([
                `wled.0.${MAC}.on`,
                `wled.0.${MAC}.bri`,
                `wled.0.${MAC}.seg.0.fx`,
                `wled.0.${MAC}.seg.1.pal`,
                `wled.0.${MAC}.seg.0.sx`,
            ]);
        });

        it('acknowledges only the last value when a state is written twice', async () => {
            await change('bri', 10);
            await change('bri', 20);
            await runTimer();
            expect(sent).to.deep.equal([{ bri: 20 }]);
            expect(acked).to.deep.equal([{ id: `wled.0.${MAC}.bri`, val: 20 }]);
        });

        it('sends every command at once when bundling is switched off for the device', async () => {
            adapter.devices[IP].bundleCommands = false;
            await change('on', true);
            await change('bri', 120);
            expect(sent).to.deep.equal([{ on: true }, { bri: 120 }]);
            expect(timers).to.be.empty;
        });

        it('sends every command at once when the instance delay is 0', async () => {
            adapter.config.bundleDelay = 0;
            await change('on', true);
            await change('bri', 120);
            expect(sent).to.deep.equal([{ on: true }, { bri: 120 }]);
        });

        it('keeps devices independent', async () => {
            const OTHER_IP = '192.168.0.11';
            const OTHER_MAC = '112233445566';
            adapter.devices[OTHER_IP] = { mac: OTHER_MAC, connected: true, wsConnected: false, bundleCommands: false };
            adapter.getForeignObjectAsync = async id => ({ native: { ip: id.endsWith(OTHER_MAC) ? OTHER_IP : IP } });
            await change('bri', 50);
            await adapter.onStateChange(`wled.0.${OTHER_MAC}.bri`, { val: 60, ack: false });
            expect(sent).to.deep.equal([{ bri: 60 }]);
            await runTimer();
            expect(sent).to.deep.equal([{ bri: 60 }, { bri: 50 }]);
        });

        it('does not merge two toggles, the first one is sent before the second waits', async () => {
            await change('action', '{"on":"t"}');
            await change('action', '{"on":"t"}');
            expect(sent).to.deep.equal([{ on: 't' }]);
            await runTimer();
            await runTimer();
            expect(sent).to.deep.equal([{ on: 't' }, { on: 't' }]);
        });

        it('sends the waiting command at once when bundling is switched off by state', async () => {
            await change('bri', 50);
            await change('bundleCommands', false);
            expect(sent).to.deep.equal([{ bri: 50 }]);
            expect(adapter.devices[IP].bundleCommands).to.equal(false);
            expect(acked).to.deep.include({ id: `${MAC}.bundleCommands`, val: false });
            await change('bri', 60);
            expect(sent).to.deep.equal([{ bri: 50 }, { bri: 60 }]);
        });

        it('sends the waiting command before a raw command to keep the order', async () => {
            const order = [];
            adapter.postAPI = async (_url, values) => {
                order.push(values);
                return { success: true };
            };
            adapter.getForeignObjectAsync = async () => ({ native: { ip: IP } });
            await change('bri', 50);
            // The raw command itself goes to the /win endpoint (not awaited here, no network in tests),
            // the waiting command must have been sent before
            void change('rawCommand', 'T=1');
            for (let i = 0; i < 10; i++) {
                await new Promise(resolve => setImmediate(resolve));
            }
            expect(order).to.deep.equal([{ bri: 50 }]);
        });
    });

    describe('mergeCommands and canMergeCommands (#926)', () => {
        const adapter = createAdapter();

        it('merges nested objects and keeps segment ids', () => {
            expect(
                adapter.mergeCommands(
                    { nl: { on: true }, seg: { id: 2, fx: 1 } },
                    { nl: { dur: 5 }, seg: [{ id: 2, sx: 3 }] },
                ),
            ).to.deep.equal({ nl: { on: true, dur: 5 }, seg: [{ id: 2, fx: 1, sx: 3 }] });
        });

        it('replaces colour arrays instead of merging them', () => {
            const merged = adapter.mergeCommands(
                { seg: { id: 0, col: [[1, 2, 3]] } },
                { seg: { id: 0, col: [[4, 5, 6]] } },
            );
            expect(merged.seg[0].col).to.deep.equal([[4, 5, 6]]);
        });

        it('does not merge relative values or segments without id', () => {
            expect(adapter.canMergeCommands({ bri: '~10' }, { bri: '~10' })).to.equal(false);
            expect(adapter.canMergeCommands({ bri: 10 }, { bri: 20 })).to.equal(true);
            expect(adapter.canMergeCommands({ on: true }, { seg: [{ fx: 3 }] })).to.equal(false);
            expect(adapter.canMergeCommands({ seg: [{ id: 0, n: 'a' }] }, { seg: [{ id: 0, n: 'b' }] })).to.equal(
                false,
            );
            expect(adapter.canMergeCommands({ seg: [{ id: 0, n: 'a' }] }, { seg: [{ id: 1, n: 'b' }] })).to.equal(true);
        });
    });
});

describe('light channel for iot, Alexa and Google Home (#328)', () => {
    let adapter;
    let sent;
    let created;
    beforeEach(() => {
        adapter = createAdapter();
        adapter.instance = 0;
        adapter.config = { Time_Sync: 30, maxRetries: 5, bundleDelay: 0 };
        adapter.devices[IP] = { mac: MAC, connected: true, wsConnected: false, initialized: false };
        sent = [];
        created = {};
        adapter.postAPI = async (_url, values) => {
            sent.push(values);
            return { success: true };
        };
        adapter.setState = () => {};
        adapter.create_state = async (id, name, value) => {
            created[id] = { name, value };
        };
    });

    const deviceStates = {
        on: true,
        bri: 128,
        mainseg: 1,
        seg: [
            {
                id: 0,
                col: [
                    [1, 2, 3],
                    [0, 0, 0],
                    [0, 0, 0],
                ],
            },
            {
                id: 1,
                col: [
                    [255, 136, 0, 40],
                    [0, 0, 0, 0],
                    [0, 0, 0, 0],
                ],
            },
        ],
    };

    it('creates the light channel with on, dimmer in percent and the colour of the main segment', async () => {
        await adapter.updateLightStates(MAC, IP, deviceStates);
        expect(adapter.objects[`${MAC}.light`].type).to.equal('channel');
        expect(created[`${MAC}.light.on`]).to.deep.equal({ name: 'lightOn', value: true });
        expect(created[`${MAC}.light.dimmer`]).to.deep.equal({ name: 'lightDimmer', value: 50 });
        expect(created[`${MAC}.light.rgb`]).to.deep.equal({ name: 'lightRgb', value: '#ff8800' });
        expect(adapter.devices[IP].mainseg).to.equal(1);
    });

    it('uses the first segment when mainseg is unknown', () => {
        expect(adapter.mainSegment({ mainseg: 7, seg: [{ id: 3 }, { id: 4 }] })).to.deep.equal({ id: 3 });
        expect(adapter.mainSegment({})).to.equal(null);
    });

    it('roles match what the type detector expects for a colour light', () => {
        const stateAttr = require('../../lib/stateAttr.js');
        expect(stateAttr.lightOn.role).to.equal('switch.light');
        expect(stateAttr.lightDimmer.role).to.equal('level.dimmer');
        expect(stateAttr.lightRgb.role).to.equal('level.color.rgb');
    });

    it('translates on, dimmer and colour into WLED commands', async () => {
        adapter.devices[IP].mainseg = 1;
        adapter.getStateAsync = async () => ({ val: '[255,136,0,40]' });
        await adapter.onStateChange(`wled.0.${MAC}.light.on`, { val: false, ack: false });
        await adapter.onStateChange(`wled.0.${MAC}.light.dimmer`, { val: 50, ack: false });
        await adapter.onStateChange(`wled.0.${MAC}.light.dimmer`, { val: 0, ack: false });
        await adapter.onStateChange(`wled.0.${MAC}.light.rgb`, { val: '#0000ff', ack: false });
        expect(sent).to.deep.equal([
            { on: false },
            { bri: 128, on: true },
            { bri: 0 },
            { seg: { id: 1, col: [[0, 0, 255, 40]] } },
        ]);
    });

    it('rejects an invalid colour without sending', async () => {
        adapter.getStateAsync = async () => null;
        await adapter.onStateChange(`wled.0.${MAC}.light.rgb`, { val: 'blue-ish', ack: false });
        expect(sent).to.be.empty;
        expect(adapter.logs.warn[0]).to.include('Invalid colour');
    });
});

describe('usermod values as states (#929, #928, #931)', () => {
    let adapter;
    let states;
    beforeEach(() => {
        adapter = createAdapter();
        adapter.devices[IP] = { mac: MAC, connected: true, initialized: false };
        states = {};
        adapter.extendObjectAsync = async (id, obj) => {
            adapter.objects[id] = { ...(adapter.objects[id] || {}), ...obj };
        };
        adapter.setStateChangedAsync = async (id, state) => {
            states[id] = state;
        };
    });

    const usermods = {
        Temperature: [22.5, '°C'],
        '<i class="icons">&#xe325;</i> PIR sensor': ['<span>on</span>'],
        'GPIO 4': [1],
        Uptime: ['12', ' h'],
        'Button &amp; Reed': [false],
    };

    it('cleans keys, values and units', () => {
        expect(adapter.usermodEntries(usermods)).to.deep.equal([
            { id: 'Temperature', name: 'Temperature', value: 22.5, type: 'number', unit: '°C' },
            { id: 'PIR_sensor', name: 'PIR sensor', value: 'on', type: 'string', unit: '' },
            { id: 'GPIO_4', name: 'GPIO 4', value: 1, type: 'number', unit: '' },
            { id: 'Uptime', name: 'Uptime', value: 12, type: 'number', unit: 'h' },
            { id: 'Button_Reed', name: 'Button & Reed', value: false, type: 'boolean', unit: '' },
        ]);
    });

    it('gives unique ids and handles empty or missing data', () => {
        expect(adapter.usermodEntries({ 'a b': [1], 'a.b': [2], '<b></b>': [3] }).map(e => e.id)).to.deep.equal([
            'a_b',
            'a_b_2',
            'Usermod_3',
        ]);
        expect(adapter.usermodEntries(undefined)).to.deep.equal([]);
        expect(adapter.usermodEntries([])).to.deep.equal([]);
    });

    it('creates read-only states below _info.u and remembers that the device has usermods', async () => {
        await adapter.updateUsermodStates(MAC, IP, usermods);
        expect(adapter.objects[`${MAC}._info.u`].type).to.equal('channel');
        const temperature = adapter.objects[`${MAC}._info.u.Temperature`];
        expect(temperature.common).to.include({ type: 'number', role: 'value', unit: '°C', write: false });
        expect(states[`${MAC}._info.u.GPIO_4`]).to.deep.equal({ val: 1, ack: true });
        expect(states[`${MAC}._info.u.Button_Reed`]).to.deep.equal({ val: false, ack: true });
        expect(adapter.objects[`${MAC}._info.u.Button_Reed`].common.role).to.equal('indicator');
        expect(adapter.devices[IP].hasUsermods).to.equal(true);
    });

    it('removes states with HTML in their id from older versions at initialisation', async () => {
        adapter.objects[`${MAC}._info.u.<i>PIR</i>`] = { type: 'state', common: {} };
        adapter.objects[`${MAC}._info.u.Temperature`] = { type: 'state', common: {} };
        await adapter.updateUsermodStates(MAC, IP, { Temperature: [20, '°C'] });
        expect(adapter.deleted).to.deep.equal([`${MAC}._info.u.<i>PIR</i>`]);
    });

    it('reads usermod values in the info handler instead of creating raw states', async () => {
        let called = null;
        adapter.updateUsermodStates = async (mac, ip, data) => {
            called = { mac, ip, data };
        };
        adapter.create_state = async () => {};
        adapter.handleWebSocket = async () => {};
        adapter.syncSegments = async () => {};
        adapter.updateLightStates = async () => {};
        await adapter.handleStates({ info: { mac: MAC, u: usermods }, state: {} }, IP);
        expect(called).to.deep.equal({ mac: MAC, ip: IP, data: usermods });
    });
});

describe('last used colour and effect (#930)', () => {
    let adapter;
    let values;
    let sent;
    beforeEach(() => {
        adapter = createAdapter();
        adapter.instance = 0;
        adapter.config = { Time_Sync: 30, maxRetries: 5, bundleDelay: 0 };
        adapter.devices[IP] = { mac: MAC, connected: true, wsConnected: false, initialized: false };
        values = {};
        sent = [];
        adapter.create_state = async (id, _name, value) => {
            if (value !== null && value !== undefined) {
                values[id] = value;
            }
        };
        adapter.getStateAsync = async id => (values[id] !== undefined ? { val: values[id] } : null);
        adapter.postAPI = async (_url, command) => {
            sent.push(command);
            return { success: true };
        };
        adapter.setState = () => {};
    });

    const red = [
        [255, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    const blue = [
        [0, 0, 255],
        [0, 0, 0],
        [0, 0, 0],
    ];
    const root = `${MAC}.seg.0.last`;

    it('records nothing on the first update, only the channel', async () => {
        await adapter.trackLastValues(MAC, IP, '0', { id: 0, col: red, fx: 0, pal: 0 });
        expect(adapter.objects[root].type).to.equal('channel');
        expect(values).to.deep.equal({});
    });

    it('keeps colour and effect used before a change', async () => {
        await adapter.trackLastValues(MAC, IP, '0', { id: 0, col: red, fx: 0, pal: 0 });
        adapter.devices[IP].initialized = true;
        await adapter.trackLastValues(MAC, IP, '0', { id: 0, col: blue, fx: 1, pal: 0 });
        expect(values).to.deep.equal({ [`${root}.col`]: JSON.stringify(red), [`${root}.fx`]: 0 });
        // a further update without change keeps the recorded values
        await adapter.trackLastValues(MAC, IP, '0', { id: 0, col: blue, fx: 1, pal: 0 });
        expect(values[`${root}.col`]).to.equal(JSON.stringify(red));
    });

    it('sends the recorded values back with the restore button', async () => {
        values[`${root}.col`] = JSON.stringify(red);
        values[`${root}.fx`] = 0;
        values[`${root}.pal`] = 5;
        await adapter.onStateChange(`wled.0.${root}.restore`, { val: true, ack: false });
        expect(sent).to.deep.equal([{ seg: { id: 0, col: red, fx: 0, pal: 5 } }]);
    });

    it('sends nothing when no change was recorded yet', async () => {
        await adapter.onStateChange(`wled.0.${root}.restore`, { val: true, ack: false });
        expect(sent).to.be.empty;
        expect(adapter.logs.info.join()).to.include('Nothing to restore');
    });
});

describe('stripHtml (#929)', () => {
    const adapter = createAdapter();

    it('removes tags and decodes entities once', () => {
        expect(adapter.stripHtml('<b>22&deg;C</b>&nbsp;ok')).to.equal('22°C ok');
        expect(adapter.stripHtml('Tom &amp;amp; Jerry')).to.equal('Tom &amp; Jerry');
        expect(adapter.stripHtml('&#xe325; PIR')).to.equal('PIR');
    });

    it('handles long broken input quickly', () => {
        const start = Date.now();
        adapter.stripHtml('<'.repeat(100000));
        expect(Date.now() - start).to.be.below(500);
    });
});
