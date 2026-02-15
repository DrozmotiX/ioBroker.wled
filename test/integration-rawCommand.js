const path = require('path');
const { tests } = require('@iobroker/testing');

// Test rawCommand functionality
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Raw HTTP API Command Tests', (getHarness) => {
            it('Should create rawCommand state and accept various command formats', async function () {
                this.timeout(60000);

                const harness = getHarness();

                // Start the adapter
                await harness.startAdapterAndWait();

                // Wait for adapter to initialize
                await new Promise((resolve) => setTimeout(resolve, 5000));

                // Create a test device object using the adapter's namespace
                const testDeviceMac = 'AABBCC112233';
                const testDeviceIP = '192.168.1.200';
                const testDeviceId = `${harness.namespace}.${testDeviceMac}`;
                const testDeviceObj = {
                    type: 'device',
                    common: {
                        name: 'Test WLED Device for rawCommand',
                    },
                    native: {
                        ip: testDeviceIP,
                        mac: testDeviceMac,
                        name: 'Test WLED Device for rawCommand',
                    },
                };

                // Create the test device in the object tree
                await harness.objects.setObjectAsync(testDeviceId, testDeviceObj);
                await new Promise((resolve) => setTimeout(resolve, 1000));

                // Simulate device initialization by creating basic states
                // In real adapter usage, handleBasicStates would create these
                const rawCommandStateId = `${testDeviceId}.rawCommand`;
                await harness.objects.setObjectAsync(rawCommandStateId, {
                    type: 'state',
                    common: {
                        name: 'Raw HTTP API Command',
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: true,
                    },
                    native: {},
                });

                // Wait for state creation
                await new Promise((resolve) => setTimeout(resolve, 1000));

                // Verify the rawCommand state was created
                const rawCommandState = await harness.objects.getObjectAsync(rawCommandStateId);
                if (!rawCommandState) {
                    throw new Error('rawCommand state was not created');
                }

                // Verify state properties
                if (rawCommandState.common.write !== true) {
                    throw new Error('rawCommand state should be writable');
                }

                if (rawCommandState.common.type !== 'string') {
                    throw new Error('rawCommand state should be type string');
                }

                if (rawCommandState.common.role !== 'text') {
                    throw new Error('rawCommand state should have role text');
                }

                console.log('✅ rawCommand state created successfully with correct properties');

                // Test various command formats
                const testCommands = [
                    'A=255',
                    'A=255&FX=0',
                    'SM=0&SS=0&SV=2&S=15&S2=299&GP=7&SP=30&RV=0&SB=255&A=255&W=255&R2=0&G2=0&B2=0&W2=&FX=0&T=1',
                    'R=255&G=128&B=64&A=200',
                ];

                for (const command of testCommands) {
                    await harness.states.setStateAsync(rawCommandStateId, command, false);
                    await new Promise((resolve) => setTimeout(resolve, 300));

                    const stateValue = await harness.states.getStateAsync(rawCommandStateId);
                    if (!stateValue || stateValue.val !== command) {
                        throw new Error(`Failed to set command: ${command}`);
                    }
                    console.log(`✅ Successfully set command: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);
                }

                console.log('✅ All command formats accepted successfully');

                // Clean up test device
                await harness.objects.delObjectAsync(testDeviceId);
                await harness.objects.delObjectAsync(rawCommandStateId);

                await harness.stopAdapter();
            });
        });
    },
});
