const path = require('path');
const { tests } = require('@iobroker/testing');

// Test object deletion cleanup
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Device deletion cleanup', (getHarness) => {
            it('Should clean up backend processes and objects when device is deleted from object tree', async function () {
                this.timeout(60000);

                const harness = getHarness();

                // Start the adapter
                await harness.startAdapterAndWait();

                // Wait for adapter to initialize
                await new Promise((resolve) => setTimeout(resolve, 5000));

                // Create a test device object using the adapter's namespace
                const testDeviceMac = 'AABBCCDDEEFF';
                const testDeviceId = `${harness.namespace}.${testDeviceMac}`;
                const testDeviceObj = {
                    type: 'device',
                    common: {
                        name: 'Test WLED Device',
                    },
                    native: {
                        ip: '192.168.1.100',
                        mac: testDeviceMac,
                        name: 'Test WLED Device',
                    },
                };

                // Create the test device
                await harness.objects.setObjectAsync(testDeviceId, testDeviceObj);
                await new Promise((resolve) => setTimeout(resolve, 1000));

                // Verify device was created
                const deviceExists = await harness.objects.getObjectAsync(testDeviceId);
                if (!deviceExists) {
                    throw new Error('Test device was not created');
                }

                // Now delete the device to trigger the objectChange handler
                await harness.objects.delObjectAsync(testDeviceId);
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Verify device was deleted
                const deviceDeleted = await harness.objects.getObjectAsync(testDeviceId);
                if (deviceDeleted) {
                    throw new Error('Test device was not deleted');
                }

                // Verify that the adapter logged the backend cleanup message
                const logs = harness.getLogs();
                const cleanupLogFound = logs.some(
                    (entry) =>
                        entry &&
                        typeof entry.message === 'string' &&
                        entry.message.includes('Cleaning up backend structures for device'),
                );
                if (!cleanupLogFound) {
                    throw new Error(
                        'Expected cleanup log message "Cleaning up backend structures for device" was not found',
                    );
                }

                await harness.stopAdapter();
            });
        });
    },
});
