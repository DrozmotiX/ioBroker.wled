const { expect } = require('chai');

const { createAdapter, MAC, IP } = require('./helpers.js');
const stateAttr = require('../../lib/stateAttr.js');

describe('WLED adapter fixes for 0.10.1', () => {
    describe('_info.time is a read-only text (#956)', () => {
        const adapter = createAdapter();

        it('uses its own attribute for info.time', () => {
            expect(adapter.infoAttribute('time')).to.equal('infoTime');
            expect(adapter.infoAttribute('ver')).to.equal('ver');
        });

        it('defines info.time as read-only text and keeps the time command writable', () => {
            expect(stateAttr.infoTime.type).to.equal('string');
            expect(stateAttr.infoTime.write).to.not.equal(true);
            expect(stateAttr.time.type).to.equal('number');
            expect(stateAttr.time.write).to.equal(true);
        });
    });

    describe('effect parameters c1 to c3 are numbers (#957)', () => {
        it('defines c1 and c2 as writable numbers from 0 to 255 and c3 from 0 to 31', () => {
            for (const key of ['c1', 'c2', 'c3']) {
                expect(stateAttr[key].type).to.equal('number');
                expect(stateAttr[key].write).to.equal(true);
                expect(stateAttr[key].min).to.equal(0);
            }
            expect(stateAttr.c1.max).to.equal(255);
            expect(stateAttr.c2.max).to.equal(255);
            expect(stateAttr.c3.max).to.equal(31);
        });
    });

    describe('bundling keeps individual LED commands apart (#959)', () => {
        const adapter = createAdapter();

        it('does not merge two commands with i for the same segment', () => {
            const first = { seg: { id: 0, i: [0, 'FF0000'] } };
            const second = { seg: { id: 0, i: [1, '00FF00'] } };
            expect(adapter.canMergeCommands(first, second)).to.equal(false);
        });

        it('still merges i for different segments and colours of the same segment', () => {
            expect(
                adapter.canMergeCommands({ seg: { id: 0, i: [0, 'FF0000'] } }, { seg: { id: 1, i: [0, 'FF0000'] } }),
            ).to.equal(true);
            expect(
                adapter.canMergeCommands({ seg: { id: 0, col: [[1, 2, 3]] } }, { seg: { id: 0, col: [[4, 5, 6]] } }),
            ).to.equal(true);
        });
    });

    describe('udpn.recv also switches the receive groups (#960)', () => {
        let adapter;
        let rgrp;
        beforeEach(() => {
            adapter = createAdapter();
            rgrp = undefined;
            adapter.getStateAsync = async () => (rgrp === undefined ? null : { val: rgrp });
        });

        it('sends receive group 0 to switch reception off', async () => {
            rgrp = 3;
            expect(await adapter.receiveGroups(MAC, false)).to.equal(0);
        });

        it('keeps the receive groups the device reported when switching on', async () => {
            rgrp = 5;
            expect(await adapter.receiveGroups(MAC, true)).to.equal(5);
        });

        it('uses group 1 when no receive group is known', async () => {
            rgrp = 0;
            expect(await adapter.receiveGroups(MAC, true)).to.equal(1);
            rgrp = undefined;
            expect(await adapter.receiveGroups(MAC, true)).to.equal(1);
        });
    });

    describe('tt and udpn.nn are sent with the next command (#961)', () => {
        let adapter;
        let sent;
        beforeEach(() => {
            adapter = createAdapter();
            sent = [];
            adapter.config = { bundleDelay: 0 };
            adapter.devices[IP] = { connected: true };
            adapter.deliverCommand = async (_ip, values, acks) => sent.push({ values, acks });
        });

        it('recognises only tt and udpn.nn as options for the next command', () => {
            expect(adapter.isOneShotOption(['wled', '0', MAC, 'tt'])).to.equal(true);
            expect(adapter.isOneShotOption(['wled', '0', MAC, 'udpn', 'nn'])).to.equal(true);
            expect(adapter.isOneShotOption(['wled', '0', MAC, 'transition'])).to.equal(false);
            expect(adapter.isOneShotOption(['wled', '0', MAC, 'udpn', 'send'])).to.equal(false);
        });

        it('adds the kept options to the next command and acknowledges them with it', async () => {
            adapter.rememberOneShotOption(IP, { tt: 20 }, { id: 'tt', val: 20 });
            adapter.rememberOneShotOption(IP, { udpn: { nn: true } }, { id: 'udpn.nn', val: true });
            await adapter.sendCommand(IP, { on: true, udpn: { send: true } }, [{ id: 'on', val: true }]);
            expect(sent).to.have.length(1);
            expect(sent[0].values).to.deep.equal({ tt: 20, udpn: { nn: true, send: true }, on: true });
            expect(sent[0].acks.map(ack => ack.id)).to.deep.equal(['tt', 'udpn.nn', 'on']);
        });

        it('forgets the options after one command and lets a value in the command win', async () => {
            adapter.rememberOneShotOption(IP, { tt: 20 }, { id: 'tt', val: 20 });
            adapter.rememberOneShotOption(IP, { tt: 5 }, { id: 'tt', val: 5 });
            await adapter.sendCommand(IP, { bri: 100 }, []);
            await adapter.sendCommand(IP, { bri: 50 }, []);
            expect(sent[0].values).to.deep.equal({ tt: 5, bri: 100 });
            expect(sent[0].acks).to.deep.equal([{ id: 'tt', val: 5 }]);
            expect(sent[1].values).to.deep.equal({ bri: 50 });

            adapter.rememberOneShotOption(IP, { tt: 20 }, { id: 'tt', val: 20 });
            await adapter.sendCommand(IP, { tt: 0, bri: 10 }, []);
            expect(sent[2].values.tt).to.equal(0);
        });
    });
});
