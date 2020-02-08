// Classification of all state attributes possible
const state_attrb = {
    // State object
    'on': {
        name: 'On / Off',
        type: 'boolean',
        role: 'switch',
        write: true,
    },
    'bri': {
        name: 'Brightness of the light',
        type: 'number',
        role: 'value.brightness',
        write: true,   
    },
    'transition': {
        name: 'Duration of the crossfade between different colors/brightness levels.',
        type: 'number',
        role: 'value.transition',   
        write: true,
    },    
    'ps': {
        name: 'ID of currently set preset',
        type: 'number',
        write: true,  
    },
    'pl': {
        name: 'ID of currently set playlist',
        type: 'number',
        write: true,  
    },
    'dur': {
        name: 'Duration of nightlight in minutes',
        type: 'number',
        write: true,  
    },
    'fade': {
        name: 'Gradually dim over the course of the nightlight duration',
        type: 'boolean',
        write: true,  
    },
    'tbri': {
        name: 'Target brightness of nightlight feature',
        type: 'number',
        role: 'value.brightness',
        write: true,  
    },
    'send': {
        name: 'Send WLED broadcast (UDP sync) packet on state change',
        type: 'boolean',
        role: 'switch',
        write: true,
    },
    'recv': {
        name: 'Receive broadcast packets',
        type: 'boolean',
        role: 'switch',
        write: true, 
    },
    'mainseg': {
        name: 'Main Segment',
        type: 'number',
        write: true, 
    },
    'pss': {
        // To be added
    },

    // State not included in  JSON response
    'tt': {
        name: 'Similar to transition, but applies to just the current API call.',
        type: 'number',
        write: true, 
    },
    'psave': {
        name: 'Save current light config to specified preset slot',
        type: 'number',
        write: true, 
    },
    'nn': {
        name: 'Dont send a broadcast packet (applies to just the current API call)',
        type: 'boolean',
        write: true, 
    },
    'timme': {
        name: 'Set module time to unix timestamp',
        type: 'number',
        write: true, 
    },

    //   segment object
    'id': {
        name: 'Zero-indexed ID of the segment',
        type: 'number',
        // write: true, 
    },
    'start': {
        name: 'LED the segment starts at.',
        type: 'number',
        write: true, 
    },
    'stop': {
        name: 'LED the segment stops at, not included in range',
        type: 'number',
        write: true, 
    },
    'len': {
        name: 'Length of the segment (stop - start). stop has preference',
        type: 'number',
        write: true, 
    },
    'fx': {
        name: 'ID of the effect ',
        type: 'number',
        write: true, 
    },
    'sx': {
        name: 'Relative effect speed',
        type: 'number',
        write: true, 
    },
    'ix': {
        name: 'Effect intensity',
        type: 'number',
        write: true, 
    },
    'pal': {
        name: 'ID of the color palette',
        type: 'number',
        write: true, 
    },
    'sel': {
        name: 'Selected segments will have their state (color/FX) updated ',
        type: 'boolean',
        role: 'switch',
        write: true, 
    },
    'rev': {
        name: 'Flips the segment, causing animations to change direction',
        type: 'boolean',
        role: 'switch',
        write: true, 
    },
    'cln': {
        name: 'Clones the segment with the given id, exactly mirroring its LED contents',
        type: 'number',
        write: true, 
    },
    'Primary Color': {
        name: 'Primary Color',
        type: 'mixed', 
        role: 'level.color.rgb',
        write: true, 
    },
    'Secondary Color (background)': {
        name: 'Secondary Color (background)',
        type: 'mixed',
        role: 'level.color.rgb',
        write: true,  
    },
    'Tertiary Color': {
        name: 'Tertiary Color',
        type: 'mixed',
        role: 'level.color.rgb', 
        write: true, 
    },
    'spc': {
        // To be added
    },
    'grp': {
        // To be added
    },

    // Info object (all read only !)
    'connection': {
        name: 'Adapter working state',
        type: 'boolean',
        role: 'indicator.connected', 
        write: true, 
    },
    'online': {
        name: 'Device connection state',
        type: 'boolean',
        role: 'indicator.connected', 
        write: true, 
    },
    'ver': {
        name: 'Version name',
        type: 'string', 
    },
    'vid': {
        name: 'Build ID (YYMMDDB, B = daily build index',
        type: 'string', 
    },
    'count': {
        name: 'Total LED count',
        type: 'number', 
        role: 'value',
    },
    'rgbw': {
        name: 'true if LEDs are 4-channel (RGBW)',
        type: 'boolean',
    },
    'pin': {
        name: 'LED strip pin(s). In 0.8.4, always one element',
        type: 'mixed',
    },
    'pwr': {
        name: 'Current LED power usage in milliamps as determined by the ABL. 0 if ABL is disabled',
        type: 'number',
        role: 'value.power',
        unit: 'mA'
    },
    'maxpwr': {
        name: 'Maximum power budget in milliamps for the ABL. 0 if ABL is disabled',
        type: 'number',
        role: 'value.power',
        unit: 'mA'
    },
    'maxseg': {
        name: 'Maximum number of segments supported by this version',
        type: 'number',
    },
    'name': {
        name: 'Friendly name of the light. Intended for display in lists and titles',
        type: 'mixed',
        role: 'info.name',
    },
    'udpport': {
        name: 'The UDP port for realtime packets and WLED broadcast',
        type: 'number',
        role: 'info.port',
    },
    'live': {
        name: 'If true, the software is currently receiving realtime data via UDP or E1.31',
        type: 'boolean',
    },
    'fxcount': {
        name: 'Number of effects included',
        type: 'mixed',
        role: 'info.name',
    },    
    'palcount': {
        name: 'Number of palettes configured',
        type: 'mixed',
        role: 'info.name',
    },
    'bssid': {
        name: 'The BSSID of the currently connected network',
        type: 'mixed',
        role: 'info.address',
    },
    'signal': {
        name: 'Relative signal quality of the current connection',
        type: 'number',
        role: 'info.status',
    },
    'channel': {
        name: 'The current WiFi channel',
        type: 'number',
        role: 'info.address',
    },

    'arch': {
        name: 'Name of the platform.',
        type: 'mixed',
    },
    'core': {
        name: 'Version of the underlying (Arduino core) SDK',
        type: 'mixed',
    },
    'freeheap': {
        name: 'Bytes of heap memory (RAM) currently available. Problematic if <10k.',
        type: 'number',
        role: 'info.status',
    },
    'uptime': {
        name: 'Time since the last boot/reset in seconds',
        type: 'number',
        role: 'info.status',
    },
    'opt': {
        name: 'Used for debugging purposes only',
        type: 'mixed',
    },
    'brand': {
        name: 'The producer/vendor of the light. Always WLED for standard installations.',
        type: 'mixed',
        role: 'info.name    ',
    },
    'product': {
        name: 'The product name. Always DIY light for standard installations.',
        type: 'mixed',
        role: 'info.name',
    },
    'btype': {
        name: 'The origin of the build',
        type: 'mixed',
    },
    'mac': {
        name: 'The hexadecimal hardware MAC address of the light, lowercase and without colons',
        type: 'number',
        role: 'info.mac',
    },
    'lwip': {
        // To be added
    },
    'rssi': {
        // To be added
    },
    'str': {
        // To be added
    },
    'segblock': {
        // To be added
    },
    'wv': {
        // To be added
    },
    'max': {
        // To be added
    },
    'min': {
        // To be added
    },
    'time': {
        // To be added
    },
    'seglock': {
        // To be added
    },
}

module.exports = state_attrb;