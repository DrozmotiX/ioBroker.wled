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
});
