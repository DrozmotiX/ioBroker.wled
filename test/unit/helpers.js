const path = require('node:path');

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

module.exports = { loadAdapter, createAdapter, MAC, IP };
