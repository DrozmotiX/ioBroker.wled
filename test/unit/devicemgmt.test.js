const { expect } = require('chai');

const DmWled = require('../../lib/devicemgmt.js');

const MAC = 'aabbccddeeff';
const ID = `wled.0.${MAC}`;

/**
 * Device Manager with a fake adapter that records object changes
 *
 * @param {object} options start values
 */
function createDeviceManager({ name = 'Kitchen', wledName = 'WLED-Kitchen', bundle = true } = {}) {
    const adapter = {
        on: () => {},
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        objects: { [ID]: { common: { name }, native: { mac: MAC, wledName } } },
        extended: [],
        bundleCalls: [],
        getObjectAsync: async id => adapter.objects[id] || null,
        getStateAsync: async () => ({ val: bundle }),
        extendObjectAsync: async (id, obj) => {
            adapter.extended.push({ id, obj });
            adapter.objects[id].common.name = obj.common.name;
        },
        setBundleCommands: async (mac, enabled) => adapter.bundleCalls.push({ mac, enabled }),
    };
    return { adapter, dm: new DmWled(adapter) };
}

/**
 * Context that answers the form with the given data
 *
 * @param {object|null} answer form result
 */
function contextAnswering(answer) {
    const context = {
        forms: [],
        showForm: async (schema, options) => {
            context.forms.push({ schema, options });
            return answer;
        },
    };
    return context;
}

describe('Device Manager: edit device (#927, #926)', () => {
    it('offers the current name, the WLED name and the bundling switch', async () => {
        const { dm } = createDeviceManager({ name: 'My lamp' });
        const context = contextAnswering(null);
        await dm.handleEditDevice(ID, context);
        const { schema, options } = context.forms[0];
        expect(options.data).to.deep.equal({ newName: 'My lamp', syncName: false, bundleCommands: true });
        expect(schema.items.syncName.label.de).to.equal('Name von WLED übernehmen (WLED-Kitchen)');
        expect(schema.items.bundleCommands.type).to.equal('checkbox');
    });

    it('takes over the name from WLED', async () => {
        const { dm, adapter } = createDeviceManager({ name: 'My lamp' });
        const res = await dm.handleEditDevice(
            ID,
            contextAnswering({ newName: 'My lamp', syncName: true, bundleCommands: true }),
        );
        expect(adapter.extended).to.deep.equal([{ id: ID, obj: { common: { name: 'WLED-Kitchen' } } }]);
        expect(res).to.deep.equal({ refresh: true });
        expect(adapter.bundleCalls).to.be.empty;
    });

    it('renames the device in ioBroker', async () => {
        const { dm, adapter } = createDeviceManager();
        await dm.handleEditDevice(ID, contextAnswering({ newName: ' Desk ', syncName: false, bundleCommands: true }));
        expect(adapter.objects[ID].common.name).to.equal('Desk');
    });

    it('changes nothing when the dialog is cancelled or nothing changed', async () => {
        const { dm, adapter } = createDeviceManager();
        expect(await dm.handleEditDevice(ID, contextAnswering(null))).to.deep.equal({ refresh: false });
        await dm.handleEditDevice(ID, contextAnswering({ newName: 'Kitchen', syncName: false, bundleCommands: true }));
        expect(adapter.extended).to.be.empty;
        expect(adapter.bundleCalls).to.be.empty;
    });

    it('switches bundling of commands for the device', async () => {
        const { dm, adapter } = createDeviceManager();
        await dm.handleEditDevice(ID, contextAnswering({ newName: 'Kitchen', syncName: false, bundleCommands: false }));
        expect(adapter.bundleCalls).to.deep.equal([{ mac: MAC, enabled: false }]);
    });
});
