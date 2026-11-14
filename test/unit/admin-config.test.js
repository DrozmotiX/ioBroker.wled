const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('chai');

const root = path.join(__dirname, '../..');
const config = require('../../admin/jsonConfig.json');
const ioPackage = require('../../io-package.json');

const translations = lang => require(`../../admin/i18n/${lang}/translations.json`);
const customTexts = lang => require(`../../src-admin/src/i18n/${lang}.json`);

/** All entries of the settings page, also inside panels */
function entries(items, list = []) {
    for (const [key, item] of Object.entries(items || {})) {
        list.push([key, item]);
        entries(item.items, list);
    }
    return list;
}

describe('Settings page (#266)', () => {
    const all = entries(config.items);

    it('uses JSON config instead of the old Materialize page', () => {
        expect(ioPackage.common.adminUI.config).to.equal('json');
        for (const file of ['index_m.html', 'words.js', 'style.css']) {
            expect(fs.existsSync(path.join(root, 'admin', file)), file).to.equal(false);
        }
    });

    it('has the tabs Devices and Settings', () => {
        expect(config.type).to.equal('tabs');
        expect(Object.values(config.items).map(tab => tab.label)).to.deep.equal(['Devices', 'Settings']);
    });

    it('loads the built device component', () => {
        const custom = all.find(([, item]) => item.type === 'custom')[1];
        expect(custom.name).to.equal('ConfigCustomWledSet/Components/DevicesOverview');
        expect(fs.existsSync(path.join(root, 'admin', custom.url)), 'run npm run build:admin').to.equal(true);
        const vite = fs.readFileSync(path.join(root, 'src-admin/vite.config.ts'), 'utf8');
        expect(vite).to.contain("name: 'ConfigCustomWledSet'");
    });

    it('offers every setting the adapter reads, with the same defaults', () => {
        const settings = Object.fromEntries(all.filter(([key]) => !key.startsWith('_')));
        for (const [key, value] of Object.entries(ioPackage.native)) {
            expect(settings, key).to.have.property(key);
            expect(settings[key].default, key).to.deep.equal(value);
        }
    });

    it('keeps limits that the adapter also enforces (#924)', () => {
        const settings = Object.fromEntries(all);
        expect(settings.Time_Sync.min).to.equal(1);
        expect(settings.maxRetries.min).to.equal(1);
        expect(settings.bundleDelay.min).to.equal(0);
    });

    it('has every label in German and English (#922)', () => {
        const texts = all.flatMap(([, item]) => [item.label, item.text, item.help]).filter(Boolean);
        for (const lang of ['de', 'en']) {
            for (const text of texts) {
                expect(translations(lang), `${lang}: ${text}`).to.have.property(text);
            }
        }
        // German is really translated, not a copy of the English text
        expect(translations('de').Devices).to.equal('Geräte');
    });

    it('has every label of the settings page in all languages', () => {
        const keys = Object.keys(translations('en')).sort();
        for (const lang of fs.readdirSync(path.join(root, 'admin/i18n'))) {
            expect(Object.keys(translations(lang)).sort(), lang).to.deep.equal(keys);
        }
    });

    it('has the same texts of the device component in German and English', () => {
        expect(Object.keys(customTexts('de')).sort()).to.deep.equal(Object.keys(customTexts('en')).sort());
        const used = new Set();
        for (const file of fs.readdirSync(path.join(root, 'src-admin/src'))) {
            if (/\.tsx?$/.test(file)) {
                const source = fs.readFileSync(path.join(root, 'src-admin/src', file), 'utf8');
                for (const match of source.matchAll(/t\(\s*'(wl_[A-Za-z_]+)'/g)) {
                    used.add(match[1]);
                }
            }
        }
        for (const key of used) {
            expect(customTexts('de'), key).to.have.property(key);
        }
    });

    it('ships the texts of the device component for all languages', () => {
        for (const lang of fs.readdirSync(path.join(root, 'admin/i18n'))) {
            expect(fs.existsSync(path.join(root, `admin/custom/i18n/${lang}.json`)), lang).to.equal(true);
        }
    });
});
