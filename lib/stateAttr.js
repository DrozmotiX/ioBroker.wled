// Classification of all state attributes possible
const state_attrb = {
    // State object
    action: {
        name: 'Command Json',
        type: 'string',
        role: 'json',
        write: true,
    },
    rawCommand: {
        name: 'Raw HTTP API Command',
        type: 'string',
        role: 'text',
        write: true,
    },
    Staircase: {
        name: 'Staircase',
        role: 'value',
    },
    'bottom-sensor': {
        name: 'Bottom Sensor',
        role: 'sensor.alarm',
        write: true,
    },
    cct: {
        name: 'White spectrum color temperature',
        role: 'level.color.temperature',
        write: true,
    },
    lc: {
        name: "Logical AND of all active segment's virtual light capabilities",
        role: 'value',
    },
    seglc: {
        name: 'Segment supports (24 bit) RGB colors',
        role: 'value',
    },
    frz: {
        name: 'frz',
        role: 'switch',
        write: true,
    },
    txPower: {
        name: 'TX Power',
        role: 'value.power',
        unit: 'dBm',
    },
    resetReason0: {
        name: 'Reset reason',
        role: 'info.status',
    },
    on: {
        name: 'On / Off',
        role: 'switch.light',
        write: true,
    },
    bri: {
        name: 'Brightness of the light',
        role: 'level.brightness',
        min: 0,
        max: 255,
        write: true,
    },
    transition: {
        name: 'Duration of the crossfade between different colors/brightness levels.',
        role: 'value.transition',
        write: true,
    },
    ps: {
        name: 'ID of currently set preset',
        role: 'value',
        write: true,
    },
    pl: {
        name: 'ID of currently set playlist',
        role: 'value',
        write: true,
    },
    dur: {
        name: 'Duration of nightlight in minutes',
        role: 'value.interval',
        unit: 'min',
        write: true,
    },
    fade: {
        name: 'Gradually dim over the course of the nightlight duration',
        role: 'switch',
        write: true,
    },
    tbri: {
        name: 'Target brightness of nightlight feature',
        role: 'value.brightness',
        write: true,
    },
    send: {
        name: 'Send WLED broadcast (UDP sync) packet on state change',
        role: 'switch',
        write: true,
    },
    recv: {
        name: 'Receive broadcast packets',
        role: 'switch',
        write: true,
    },
    mainseg: {
        name: 'Main Segment',
        role: 'value',
        write: true,
    },
    pss: {
        name: 'Bitwise indication of preset slots (0 - vacant, 1 - written). Always 0 in 0.11. Not changable. Removed in 0.11.1',
        role: 'value',
    },
    fps: {
        name: 'Frames per Second',
        role: 'value.interval',
        unit: 'fps',
    },
    ndc: {
        name: 'Number of other WLED devices discovered on the network. -1 if Node discovery disabled. (since 0.12.0)',
        role: 'value',
    },
    ip: {
        name: 'IP Address',
        role: 'info.ip',
    },
    of: {
        name: 'Offset (how many LEDs to rotate the virtual start of the segments, available since 0.13.0)',
        role: 'value',
    },

    // State not included in  JSON response
    tt: {
        name: 'Similar to transition, but applies to just the current API call.',
        type: 'mixed',
        write: true,
    },
    psave: {
        name: 'Save current light config to specified preset slot',
        type: 'mixed',
        write: true,
    },
    nn: {
        name: 'Dont send a broadcast packet (applies to just the current API call)',
        type: 'mixed',
        write: true,
    },

    //   segment object
    id: {
        name: 'Zero-indexed ID of the segment',
        role: 'value',
        // write: true,
    },
    start: {
        name: 'LED the segment starts at.',
        role: 'value',
        write: true,
    },
    stop: {
        name: 'LED the segment stops at, not included in range',
        role: 'value',
        write: true,
    },
    len: {
        name: 'Length of the segment (stop - start). stop has preference',
        role: 'value',
        write: true,
    },
    fx: {
        name: 'ID of the effect ',
        role: 'value',
        write: true,
    },
    f1x: {
        name: 'Custom effect parameter 1',
        role: 'value',
        write: true,
    },
    f2x: {
        name: 'Custom effect parameter 2',
        role: 'value',
        write: true,
    },
    f3x: {
        name: 'Custom effect parameter 3',
        role: 'value',
        write: true,
    },
    sx: {
        name: 'Relative effect speed',
        role: 'level',
        write: true,
    },
    ix: {
        name: 'Effect intensity',
        role: 'level',
        write: true,
    },
    pal: {
        name: 'ID of the color palette',
        role: 'value',
        write: true,
    },
    sel: {
        name: 'Selected segments will have their state (color/FX) updated ',
        type: 'boolean',
        role: 'switch',
        write: true,
    },
    rev: {
        name: 'Flips the segment, causing animations to change direction',
        type: 'boolean',
        role: 'switch',
        write: true,
    },
    cln: {
        name: 'Clones the segment with the given id, exactly mirroring its LED contents',
        role: 'value',
        write: true,
    },
    'Primary Color RGB': {
        name: 'Primary Color RGB',
        type: 'mixed',
        role: 'level.color.rgb',
        write: true,
    },
    'Secondary Color RGB (background)': {
        name: 'Secondary Color RGB (background)',
        type: 'mixed',
        role: 'level.color.rgb',
        write: true,
    },
    'Tertiary Color RGB': {
        name: 'Tertiary Color RGB',
        type: 'mixed',
        role: 'level.color.rgb',
        write: true,
    },
    'Primary Color HEX': {
        name: 'Primary Color HEX',
        type: 'mixed',
        role: 'level.color.hex',
        write: true,
    },
    'Secondary Color HEX (background)': {
        name: 'Secondary Color HEX (background)',
        type: 'mixed',
        role: 'level.color.hex',
        write: true,
    },
    'Tertiary Color HEX': {
        name: 'Tertiary Color HEX',
        type: 'mixed',
        role: 'level.color.hex',
        write: true,
    },
    spc: {
        name: 'Spacing (how many LEDs are turned off and skipped between each group)',
        min: 0,
        max: 255,
        write: true,
    },
    grp: {
        name: 'Grouping (how many consecutive LEDs of the same segment will be grouped to the same color)',
        min: 0,
        max: 255,
        write: true,
    },

    // Info object (all read only !)
    connection: {
        name: 'Adapter working state',
        type: 'boolean',
        role: 'indicator.connected',
    },
    'Online status': {
        name: 'Device connection state',
        type: 'boolean',
        role: 'indicator.connected',
    },
    ver: {
        name: 'Version name',
        role: 'info.firmware',
    },
    vid: {
        name: 'Build ID (YYMMDDB, B = daily build index',
        role: 'info.firmware',
    },
    count: {
        name: 'Total LED count',
        role: 'value',
    },
    rgbw: {
        name: 'true if LEDs are 4-channel (RGBW)',
        type: 'boolean',
        role: 'value',
    },
    pin: {
        name: 'LED strip pin(s). In 0.8.4, always one element',
        type: 'mixed',
        role: 'info.address',
    },
    pwr: {
        name: 'Current LED power usage in milliamps as determined by the ABL. 0 if ABL is disabled',
        role: 'value.power',
        unit: 'mA',
    },
    maxpwr: {
        name: 'Maximum power budget in milliamps for the ABL. 0 if ABL is disabled',
        role: 'value.power',
        unit: 'mA',
    },
    maxseg: {
        name: 'Maximum number of segments supported by this version',
        role: 'value',
    },
    name: {
        name: 'Friendly name of the light. Intended for display in lists and titles',
        type: 'mixed',
        role: 'info.name',
    },
    udpport: {
        name: 'The UDP port for realtime packets and WLED broadcast',
        role: 'info.port',
    },
    live: {
        name: 'If true, the software is currently receiving realtime data via UDP or E1.31',
        type: 'boolean',
        role: 'sensor',
    },
    fxcount: {
        name: 'Number of effects included',
        type: 'mixed',
        role: 'value',
    },
    palcount: {
        name: 'Number of palettes configured',
        type: 'mixed',
        role: 'value',
    },
    bssid: {
        name: 'The BSSID of the currently connected network',
        type: 'mixed',
        role: 'info.address',
    },
    signal: {
        name: 'Relative signal quality of the current connection',
        role: 'value.signal',
        unit: '%',
    },
    channel: {
        name: 'The current WiFi channel',
        role: 'value',
    },

    arch: {
        name: 'Name of the platform.',
        type: 'mixed',
        role: 'info.hardware',
    },
    core: {
        name: 'Version of the underlying (Arduino core) SDK',
        type: 'mixed',
        role: 'info.firmware',
    },
    freeheap: {
        name: 'Bytes of heap memory (RAM) currently available. Problematic if <10k.',
        role: 'value.memory',
        unit: 'bytes',
    },
    uptime: {
        name: 'Time since the last boot/reset in seconds',
        role: 'value.time',
        unit: 's',
    },
    opt: {
        name: 'Used for debugging purposes only',
        type: 'mixed',
        role: 'value',
    },
    brand: {
        name: 'The producer/vendor of the light. Always WLED for standard installations.',
        type: 'mixed',
        role: 'info.name',
    },
    product: {
        name: 'The product name. Always DIY light for standard installations.',
        type: 'mixed',
        role: 'info.name',
    },
    btype: {
        name: 'The origin of the build',
        type: 'mixed',
        role: 'info.firmware',
    },
    mac: {
        name: 'The hexadecimal hardware MAC address of the light, lowercase and without colons',
        type: 'string',
        role: 'info.mac',
    },
    u: {
        name: 'fsBytesUsed in kB',
        unit: 'kB',
        role: 'value.memory',
    },
    t: {
        name: 'fsBytesTotal in kB',
        unit: 'kB',
        role: 'value.memory',
    },
    pmt: {
        name: 'presetsModifiedTime',
        role: 'date',
    },
    rem: {
        name: 'Remaining nightlight in seconds',
        unit: 's',
        role: 'value.time',
    },
    lwip: {
        name: 'LwIP info',
        role: 'value',
    },
    rssi: {
        name: 'WiFi signal strength',
        role: 'value.signal',
        unit: 'dBm',
    },
    str: {
        name: 'String data',
        role: 'text',
    },
    segblock: {
        name: 'Segment block',
        role: 'value',
    },
    wv: {
        name: 'WiFi version',
        role: 'info.firmware',
    },
    max: {
        name: 'Maximum value',
        role: 'value',
    },
    min: {
        name: 'Minimum value',
        role: 'value',
    },
    time: {
        name: 'Set module time to unix timestamp.',
        type: 'mixed',
        role: 'info.date',
    },
    seglock: {
        name: 'Segment lock',
        role: 'sensor.lock',
    },
    lor: {
        name: 'Live data override. 0 is off, 1 is override until live data ends, 2 is override until ESP reboot (available since 0.10.0)',
        type: 'number',
        write: true,
    },
    lip: {
        name: 'Realtime data source IP address',
        role: 'info.ip',
    },
    lm: {
        name: 'Info about the realtime data source',
        role: 'info.status',
    },
    ws: {
        name: 'Number of currently connected WebSockets clients. -1 indicates that WS is unsupported in this build.',
        role: 'value',
    },
    mode: {
        name: 'Nightlight mode',
        role: 'value',
    },
    mi: {
        name: 'Mirrors the segment (available since 0.10.2)',
        role: 'switch',
    },
    liveseg: {
        name: 'Unknown',
        type: 'number',
    },
    m12: {
        name: 'Unknown',
        type: 'number',
        //Setting of segment field 'Expand 1D FX'. (0: Pixels, 1: Bar, 2: Arc, 3: Corner)
    },
    si: {
        name: 'SoundSimulation',
        type: 'number',
        //Setting of the sound simulation type for audio enhanced effects. (0: 'BeatSin', 1: 'WeWillRockYou', 2: '10_3', 3: '14_3') (as of 0.14.0-b1, there are these 4 types defined)
    },
    o1: {
        name: 'Option1',
        type: 'boolean',
        role: 'switch',
    },
    o2: {
        name: 'Option2',
        type: 'boolean',
        role: 'switch',
    },
    o3: {
        name: 'Option3',
        type: 'boolean',
        role: 'switch',
    },
    c1: {
        name: 'c1',
        type: 'string',
        role: 'value',
        write: true,
    },
    c2: {
        name: 'c2',
        type: 'string',
        role: 'value',
        write: true,
    },
    c3: {
        name: 'c3',
        type: 'string',
        role: 'value',
        write: true,
    },
    cpalcount: {
        name: 'Unknown',
        type: 'number',
        role: 'value',
    },
    temp: {
        //only for integrated 1 Wire Temp Sensor on ESP
        name: 'temp',
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
    },
    Temperature: {
        //only for integrated 1 Wire Temp Sensor on ESP
        name: 'Temperature',
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
    },
    0: {
        name: 'Unknown',
        type: 'number',
        role: 'value',
    },
    n: {
        name: 'Name of Segment',
        //also used for the displayed Text when effect is scrolling text
        type: 'string',
        write: true,
    },
    set: {
        name: 'set',
        type: 'number',
        role: 'value',
    },
    rgrp: {
        name: 'Receive Group',
        //Bitfield for broadcast receive groups 1-8
        type: 'number',
        role: 'value',
    },

    // Additional WLED API attributes for completeness
    'top-sensor': {
        name: 'Top Sensor',
        role: 'sensor.alarm',
        write: true,
    },
    effectCurrent: {
        name: 'Current effect name',
        type: 'string',
        role: 'text',
    },
    effectSpeed: {
        name: 'Effect speed',
        role: 'level',
        min: 0,
        max: 255,
        write: true,
    },
    effectIntensity: {
        name: 'Effect intensity',
        role: 'level',
        min: 0,
        max: 255,
        write: true,
    },
    paletteCurrent: {
        name: 'Current palette name',
        type: 'string',
        role: 'text',
    },
    colorOrder: {
        name: 'Color order (RGB, RBG, GRB, etc.)',
        type: 'string',
        role: 'text',
    },
    segmentId: {
        name: 'Segment identifier',
        role: 'value',
    },
};

module.exports = state_attrb;
