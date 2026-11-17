const { expect } = require('chai');

const { createAdapter } = require('./helpers.js');
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
});
