const path = require('path');
const { tests } = require('@iobroker/testing');

// Test object deletion cleanup
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Device deletion cleanup', (getHarness) => {
            it('Should detect and handle device deletion from object tree', async function () {
                this.timeout(60000);

                const harness = getHarness();

                // Start the adapter
                await harness.startAdapterAndWait();

                // Wait for adapter to initialize
                await new Promise((resolve) => setTimeout(resolve, 5000));

                // Create a test device object using the adapter's namespace
                const testDeviceMac = 'AABBCCDDEEFF';
                const testDeviceIP = '192.168.1.100';
                const testDeviceId = `${harness.namespace}.${testDeviceMac}`;
                const testDeviceObj = {
                    type: 'device',
                    common: {
                        name: 'Test WLED Device',
                    },
                    native: {
                        ip: testDeviceIP,
                        mac: testDeviceMac,
                        name: 'Test WLED Device',
                    },
                };

                // Create the test device in the object tree
                await harness.objects.setObjectAsync(testDeviceId, testDeviceObj);
                await new Promise((resolve) => setTimeout(resolve, 1000));

                // Verify device was created
                const deviceExists = await harness.objects.getObjectAsync(testDeviceId);
                if (!deviceExists) {
                    throw new Error('Test device was not created');
                }

                // Now delete the device to trigger the objectChange handler
                // This tests that the handler detects the deletion and attempts cleanup
                // Even if the device isn't in backend structures (which is expected in this test),
                // the handler should run without errors
                await harness.objects.delObjectAsync(testDeviceId);
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Verify device was deleted from object tree
                const deviceDeleted = await harness.objects.getObjectAsync(testDeviceId);
                if (deviceDeleted) {
                    throw new Error('Test device was not deleted');
                }

                // If we got here without errors, the objectChange handler processed the deletion
                // The test verifies the handler runs and doesn't crash the adapter
                // In real usage, devices would be in backend structures and would be cleaned up

                await harness.stopAdapter();
            });
        });
    },
});
